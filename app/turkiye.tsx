/**
 * TÜRKİYE SIRALAMASI — tüm şehirlerin birleşik istatistik liderleri.
 *
 * NE: altı kategori sekmesi (Tabs) + dönem segmenti + ilk üçün podyumu +
 * yoğun liste. ARENA: podyum ve satırlar Lig merkezinin Oyuncular bölmesiyle
 * AYNI parçalardır (`Podium`, `PlayerRow`) — sıralama ülke geneline de
 * çıksa aynı dille okunur. Satıra dokunmak oyuncu profilini açar; sağ üstteki paylaş
 * düğmesi ilk beşi bir kartta paylaşılabilir hâle getirir.
 *
 * VERİ: sıralama ucu kapsam parametresi verilmeyince ülke genelini döndürür;
 * bu ekran o davranışı kullanır. "Bu Sezon" son 180 günü (yaklaşık son sezon)
 * `startDate` ile daraltır. Sistem oyuncuları (HÜKMEN, antpl vb.) `JUNK` ile
 * ayıklanır, aksi hâlde gol krallığını hükmen maçları kazanır.
 *
 * NEDEN SEKME (ÇİP DEĞİL): altı kategori var ve hepsi AYNI listenin farklı
 * sıralaması — yani içerik gezinmesi, filtre değil. `Tabs` sığmayınca kayar,
 * aktif sekmeyi kendi ortalar ve başlığın altında sabit durur.
 *
 * İLK ÜÇ NEDEN AYRI: sıralama ekranında asıl soru "kim birinci"dir; podyum
 * bunu tek bakışta verir, kalan 47 satır ise yoğun liste olarak akar.
 *
 * ESKİ KAPILAR KAPATILDI: `components/ScreenHeader` → `components/ui`
 * `ScreenHeader`, `components/States` → `components/ui`, `components/TeamCrest`
 * `PlayerAvatar` → `components/ui` `Avatar`, `constants/theme` → `@/theme`,
 * ham `Pressable` + elle yazılmış modal → `ListRow` / `Tabs` / `BottomSheet`.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import {
  Avatar,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  PlayerRow,
  PlayerRowHead,
  ScreenHeader,
  SegmentedControl,
  SkeletonListRow,
  Tabs,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
  type TabItem,
} from "@/components/ui";
import { getPlayerRankings } from "@/lib/api/players";
import type { PlayerRankRow, PlayerSort } from "@/lib/types";
import { Podium } from "@/components/league/Podium";
import { GroupSeparator, groupRowStyle, groupStyles } from "@/components/league/shared";
import { formatDecimal } from "@/lib/format";
import {
  colors,
  fonts,
  hairline,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

/* ═════════════════════════ SABİTLER (saf veri) ═════════════════════════ */

interface Category {
  sort: PlayerSort;
  label: string;
  /** Sağdaki rakamın birimi: "GOL", "PUAN". */
  unit: string;
  /** Sıralama anahtarı — sunucu sırası bozuksa da liste tutarlı kalsın diye. */
  value: (player: PlayerRankRow) => number;
  /** Ekrana yazılan biçim (ortalamalar iki basamak). */
  display: (player: PlayerRankRow) => string;
}

const CATEGORIES: Category[] = [
  { sort: "mostValuable",   label: "En Değerli",  unit: "PUAN", value: (p) => Number(p.points) || 0,         display: (p) => String(Number(p.points) || 0) },
  { sort: "topScorers",     label: "Gol Kralı",   unit: "GOL",  value: (p) => Number(p.goals) || 0,          display: (p) => String(Number(p.goals) || 0) },
  { sort: "goalsPerMatch",  label: "Gol / Maç",   unit: "ORT",  value: (p) => Number(p.goalsPerMatch) || 0,  display: (p) => formatDecimal(Number(p.goalsPerMatch ?? 0), 2) },
  { sort: "mostMatches",    label: "En Çok Maç",  unit: "MAÇ",  value: (p) => Number(p.matches) || 0,        display: (p) => String(Number(p.matches) || 0) },
  { sort: "pointsPerMatch", label: "Puan / Maç",  unit: "ORT",  value: (p) => Number(p.pointsPerMatch) || 0, display: (p) => formatDecimal(Number(p.pointsPerMatch ?? 0), 2) },
  { sort: "mostCards",      label: "En Çok Kart", unit: "KART", value: (p) => Number(p.cards) || 0,          display: (p) => String(Number(p.cards) || 0) },
];

const TAB_ITEMS: TabItem<PlayerSort>[] = CATEGORIES.map((item) => ({
  key: item.sort,
  label: item.label,
}));

/** Sistem oyuncuları — sıralamada yerleri yok. */
const JUNK = /hükmen|hukmen|antpl/i;

/** Listede tutulan en fazla satır: 50'den sonrası kimseyi ilgilendirmiyor. */
const MAX_ROWS = 50;

type Period = "recent" | "alltime";

const PERIOD_ITEMS: SegmentedItem<Period>[] = [
  { key: "recent", label: "Bu Sezon" },
  { key: "alltime", label: "Tüm Zamanlar" },
];


/* — Paylaşım kartı — */
type ShareFormat = "story" | "post";

const SHARE_WIDTH = 272;
const SHARE_FORMATS: Record<ShareFormat, { label: string; height: number }> = {
  story: { label: "Hikâye 9:16", height: Math.round((SHARE_WIDTH * 16) / 9) },
  post: { label: "Gönderi 3:4", height: Math.round((SHARE_WIDTH * 4) / 3) },
};

const SHARE_ITEMS: SegmentedItem<ShareFormat>[] = [
  { key: "story", label: SHARE_FORMATS.story.label },
  { key: "post", label: SHARE_FORMATS.post.label },
];

/* ═════════════════════════ SAF YARDIMCILAR ═════════════════════════ */

/** "Takım · Şehir" — ikisi de boşsa tire. */
function metaOf(player: PlayerRankRow): string {
  const parts = [player.teamName, player.city].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/* ═════════════════════════ EKRAN ═════════════════════════ */

export default function TurkeyRankingsScreen() {
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [sort, setSort] = useState<PlayerSort>(CATEGORIES[0].sort);
  const [period, setPeriod] = useState<Period>("recent");
  const [shareOpen, setShareOpen] = useState(false);

  const category = useMemo(
    () => CATEGORIES.find((item) => item.sort === sort) ?? CATEGORIES[0],
    [sort]
  );

  /** "Bu Sezon": bugünden 180 gün öncesi (YYYY-MM-DD) — yaklaşık son sezon. */
  const startDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 180);
    return date.toISOString().slice(0, 10);
  }, []);

  const query = useQuery({
    queryKey: ["turkey", period, category.sort, startDate],
    queryFn: () => getPlayerRankings(period === "recent" ? { startDate } : {}, category.sort),
    staleTime: 10 * 60_000,
  });

  const players = useMemo(
    () =>
      (query.data?.players ?? [])
        .filter((player) => player.name && !JUNK.test(player.name))
        .sort((a, b) => category.value(b) - category.value(a))
        .slice(0, MAX_ROWS),
    [query.data, category]
  );

  /* Podyum yalnız üç oyuncu varsa; yoksa herkes listede. */
  const podium = useMemo(() => (players.length >= 3 ? players.slice(0, 3) : []), [players]);
  const rest = useMemo(() => (players.length >= 3 ? players.slice(3) : players), [players]);

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const refreshControl = useMemo(
    () => <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />,
    [refresh.refreshing, refresh.onRefresh]
  );

  const openPlayer = useCallback(
    (playerId: number) => router.push(`/oyuncu/${playerId}`),
    [router]
  );

  const openShare = useCallback(() => setShareOpen(true), []);
  const closeShare = useCallback(() => setShareOpen(false), []);

  const headerActions = useMemo(
    () =>
      players.length > 0
        ? [
            {
              icon: "share-social-outline" as keyof typeof Ionicons.glyphMap,
              onPress: openShare,
              accessibilityLabel: "Sıralamayı paylaş",
            },
          ]
        : undefined,
    [players.length, openShare]
  );

  const tabs = useMemo(
    () => (
      <View style={styles.tabBand}>
        <Tabs items={TAB_ITEMS} value={sort} onChange={setSort} distribute="scroll" tone="paper" />
      </View>
    ),
    [sort]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: PlayerRankRow; index: number }) => (
      <PlayerRow
        playerId={item.id}
        rank={index + 4}
        name={item.name}
        image={item.image ?? null}
        meta={[item.teamName || "Takımsız", item.city]}
        metric={category.display(item)}
        onPress={openPlayer}
        style={groupRowStyle(index, rest.length, true)}
      />
    ),
    [category, openPlayer, rest.length]
  );

  const listHeader = (
    <View style={styles.listHeader}>
      {/* Bayat veri ekranda kalsın: hata bandı listeyi silmez. */}
      {query.isError && players.length > 0 ? (
        <ErrorState error={query.error} variant="banner" />
      ) : null}

      <SegmentedControl items={PERIOD_ITEMS} value={period} onChange={setPeriod} size="sm" />

      {podium.length >= 3 ? (
        <Podium
          players={podium}
          metricOf={category.display}
          unit={category.unit}
          metaOf={metaOf}
          onPress={openPlayer}
        />
      ) : null}

      {/* Sütun başlığı kartın TEPESİDİR. Podyum yoksa (üçten az oyuncu) liste
          birinciden başlar. */}
      {rest.length > 0 ? (
        <View style={[groupStyles.head, styles.groupHead]}>
          <PlayerRowHead unit={category.unit} />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Türkiye Sıralaması"
        overline="TÜM ŞEHİRLER"
        subtitle={period === "recent" ? "Son 6 ayın liderleri" : "Tüm zamanların liderleri"}
        back
        scrollY={scrollY}
        actions={headerActions}
        bottom={tabs}
      />

      {query.isLoading ? (
        <View style={styles.loading}>
          <SkeletonListRow count={8} />
        </View>
      ) : query.isError && players.length === 0 ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <FlatList
          {...scrollProps}
          data={rest}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={GroupSeparator}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          ListEmptyComponent={
            players.length === 0 ? (
              <EmptyState
                icon="trophy-outline"
                title="Sıralama boş"
                body="Bu kategoride henüz veri yok. Başka bir dönem dener misin?"
                variant="inline"
              />
            ) : null
          }
        />
      )}

      <ShareSheet
        visible={shareOpen}
        onClose={closeShare}
        categoryLabel={category.label}
        unit={category.unit}
        period={period}
        players={players}
        display={category.display}
      />
    </SafeAreaView>
  );
}

/* ═════════════════════════ PAYLAŞIM KARTI ═════════════════════════ */

function ShareSheet({
  visible,
  onClose,
  categoryLabel,
  unit,
  period,
  players,
  display,
}: {
  visible: boolean;
  onClose: () => void;
  categoryLabel: string;
  unit: string;
  period: Period;
  players: PlayerRankRow[];
  display: (player: PlayerRankRow) => string;
}) {
  const toast = useToast();
  const [format, setFormat] = useState<ShareFormat>("story");
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);

  const top = useMemo(() => players.slice(0, 5), [players]);

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      /* `isAvailableAsync()` false dönebilir (paylaşım hedefi olmayan cihaz,
         web hedefi). ELSE DALI ŞART: dalsız hâlde düğme basılıyor, görsel
         üretiliyor, sonra sessizce hiçbir şey olmuyordu — kullanıcı için bu
         "buton bozuk" demektir. Aynı ekranların diğer ikisi (gunun.tsx,
         ShareScoreCard.tsx) zaten haber veriyordu. */
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      } else {
        toast.show({ message: "Bu cihazda paylaşım menüsü açılamıyor.", tone: "warn" });
      }
    } catch {
      toast.show({ message: "Görsel oluşturulamadı, tekrar dener misin?", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }, [busy, toast]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sıralamayı paylaş" snap="full">
      <SegmentedControl items={SHARE_ITEMS} value={format} onChange={setFormat} />

      <View style={styles.shareWrap}>
        <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
          <View style={[styles.shareCard, { height: SHARE_FORMATS[format].height }]}>
            {/* Düz dolgu: gradient bu üründe yalnız görsel üstü okunabilirlik
                scrim'i için meşru; 7px'lik bir şeritte hiçbir işe yaramıyor. */}
            <View style={styles.shareStrip} />

            <View style={styles.shareBody}>
              <View style={styles.shareTop}>
                <Text style={styles.shareBrand} {...textScale.badge}>
                  elitlig
                </Text>
                <Text style={styles.shareCorner} {...textScale.badge}>
                  {upperTR("Elitlig Mobil")}
                </Text>
              </View>

              <Text style={styles.shareKicker} numberOfLines={1} {...textScale.badge}>
                {upperTR(`Türkiye · ${period === "recent" ? "bu sezon" : "tüm zamanlar"}`)}
              </Text>
              <Text style={styles.shareTitle} numberOfLines={1} {...textScale.badge}>
                {upperTR(categoryLabel)}
              </Text>

              <View style={styles.shareList}>
                {top.map((player, index) => (
                  <View
                    key={player.id}
                    style={[styles.shareRow, index > 0 ? styles.shareRowBorder : null]}
                  >
                    <Text style={styles.shareRank} {...textScale.badge}>
                      {index + 1}
                    </Text>
                    <Avatar name={player.name} image={player.image ?? null} size={24} />
                    <View style={styles.flex}>
                      <Text style={styles.shareName} numberOfLines={1} {...textScale.badge}>
                        {player.name}
                      </Text>
                      <Text style={styles.shareMeta} numberOfLines={1} {...textScale.badge}>
                        {metaOf(player)}
                      </Text>
                    </View>
                    <View style={styles.shareValueBox}>
                      <Text style={styles.shareValue} {...textScale.badge}>
                        {display(player)}
                      </Text>
                      <Text style={styles.shareUnit} {...textScale.badge}>
                        {unit}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.flex} />

              <Text style={styles.shareFooter} {...textScale.badge}>
                {upperTR("elitlig.com")}
              </Text>
            </View>
          </View>
        </ViewShot>
      </View>

      <Button
        label={busy ? "Hazırlanıyor" : "Paylaş"}
        icon="share-social"
        onPress={share}
        loading={busy}
        fullWidth
      />
      <Text style={styles.shareHint} {...textScale.dense}>
        İndirmek için: Paylaş → Görüntüyü Kaydet
      </Text>
    </BottomSheet>
  );
}

/* ═════════════════════════ STİLLER ═════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  tabBand: {
    paddingBottom: space.xs,
  },
  loading: {
    padding: layout.screenPadding,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
  },
  listHeader: {
    gap: space.md,
    paddingTop: space.md,
  },

  groupHead: {
    paddingTop: space.sm,
    marginTop: space.xs,
  },

  /* — Paylaşım kartı — */
  shareWrap: {
    alignItems: "center",
    paddingVertical: space.md,
  },
  shareCard: {
    width: SHARE_WIDTH,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  shareStrip: {
    height: 6,
    backgroundColor: colors.brand,
  },
  shareBody: {
    flex: 1,
    padding: space.md,
    gap: space.xs,
  },
  shareTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareBrand: {
    ...type.label,
    color: colors.brand,
  },
  shareCorner: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareKicker: {
    ...type.micro,
    color: colors.brandAccent,
    marginTop: space.sm,
  },
  shareTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  shareList: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.sm,
    marginTop: space.sm,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.s,
  },
  shareRowBorder: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  shareRank: {
    ...type.tableNumStrong,
    color: colors.textTertiary,
    minWidth: 14,
    textAlign: "center",
  },
  shareName: {
    ...type.caption,
    fontFamily: fonts.bold,
    letterSpacing: 0,
    color: colors.textPrimary,
  },
  shareMeta: {
    ...type.micro,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textTertiary,
  },
  shareValueBox: {
    alignItems: "flex-end",
  },
  shareValue: {
    ...type.tableNumStrong,
    color: colors.brandAccent,
  },
  shareUnit: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareFooter: {
    ...type.micro,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.sm,
  },
  shareHint: {
    ...type.caption,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.sm,
  },
});
