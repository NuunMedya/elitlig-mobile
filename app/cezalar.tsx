/**
 * CEZALAR — kamuya açık disiplin kararları (sitedeki disiplin sayfası).
 *
 * VERİ: haber akışındaki `kind === "penalty"` girdileri. Sunucu bu girdileri
 * `newsService.penaltyItems` içinde YALNIZ sonuçlanmış dosyalardan üretir
 * (`status ∈ {kurul_karari, cas_karari}`) ve her birine bir `meta` nesnesi
 * ekler: oyuncu, takım, maç etiketi, ceza türü, maç sayısı, aşama. Eski ekran
 * bu zenginliği hiç okumuyor, her kaydı "CEZALI" etiketli bir kart olarak
 * gösteriyordu; ekranda ne cezanın türü, ne süresi, ne de kimin aldığı
 * ayrıştırılabiliyordu.
 *
 * NE DEĞİŞTİ:
 *   1. `meta` tiplenerek okunur (`PenaltyFeedItem`) — oyuncu adı başlık, takım
 *      ve ceza türü/süresi alt satır, karar tarihi sağdaki değer olur.
 *   2. Durum çipleri: aşama (Kurul / CAS) ve ceza türü (Süresiz / Maç cezası)
 *      üstünden süzme. Çip sayaçları görünür kayıtlardan hesaplanır.
 *   3. Satır → dosya. Kayıt KULLANICININ KENDİ dosyasıysa `/ceza/[id]` açılır
 *      (savunma/itiraz orada yapılır); değilse karar özeti alt sayfada gösterilir.
 *
 * NEDEN "KENDİ DOSYASI" AYRIMI: `/ceza/[id]` ekranı dosyayı
 * `GET /api/penalties/mine` listesinden bulur; tekil uç yalnız `penalties.view`
 * yetkisine açıktır. Yabancı bir dosya için o ekran "dosya bulunamadı" derdi.
 * Bu yüzden oturum varsa kendi dosyalarının `public_id` kümesi çekilir ve satır
 * ancak o kümedeyse detay ekranına yönlendirilir. Aynı önbellek anahtarı
 * (`["panel","penalties"]`) `app/cezalarim.tsx` ile paylaşılır: iki ekran tek
 * veriyi kullanır, ikinci istek atılmaz.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  KeyValueRow,
  ListRow,
  ScreenHeader,
  SkeletonListRow,
  useHeaderScroll,
  useRefresh,
  type Tone,
} from "@/components/ui";
import { getMyPenalties } from "@/lib/api/panel";
import { getNewsFeed } from "@/lib/api/news";
import { formatDateLong, formatDateShort, mediaUrl, stripHtml } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import type { NewsItem } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, space, textScale, type } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/**
 * Disiplin duyurusunun `meta` alanı — sunucudaki `penaltyItems` ile birebir.
 * `NewsItem` tipi ortak akış tipidir ve `meta` taşımaz; bu yüzden burada
 * genişletilir (lib/types.ts başka bir ajanın dosyası, imzası büyütülmedi).
 */
interface PenaltyMeta {
  public_id?: string | null;
  player_name?: string | null;
  team_name?: string | null;
  match_label?: string | null;
  /** constants/penalty.js DURATION_TYPE: "suresiz" | "mac" */
  duration_type?: string | null;
  match_count?: number | null;
  /** PENALTY_STATUS: "kurul_karari" | "cas_karari" */
  status?: string | null;
}

type PenaltyFeedItem = NewsItem & { meta?: PenaltyMeta | null };

/** Aşama etiketleri ve tonları — `app/cezalarim.tsx` ile aynı dil. */
const STAGE_META: Record<string, { label: string; tone: Tone }> = {
  kurul_karari: { label: "Kurul kararı", tone: "danger" },
  cas_karari: { label: "CAS kararı", tone: "neutral" },
  cas_basvuru: { label: "CAS'ta", tone: "info" },
  sevk: { label: "Sevk", tone: "warn" },
};

const stageOf = (status?: string | null) =>
  STAGE_META[String(status ?? "")] ?? { label: "Disiplin kararı", tone: "neutral" as Tone };

type PenaltyFilter = "tumu" | "kurul" | "cas" | "suresiz" | "mac";

interface FilterDef {
  key: PenaltyFilter;
  label: string;
  match: (item: PenaltyFeedItem) => boolean;
}

const FILTERS: FilterDef[] = [
  { key: "tumu", label: "Tümü", match: () => true },
  { key: "kurul", label: "Kurul kararı", match: (i) => i.meta?.status === "kurul_karari" },
  { key: "cas", label: "CAS kararı", match: (i) => i.meta?.status === "cas_karari" },
  { key: "suresiz", label: "Süresiz", match: (i) => i.meta?.duration_type === "suresiz" },
  { key: "mac", label: "Maç cezası", match: (i) => i.meta?.duration_type === "mac" },
];

/* ============================== SAF YARDIMCILAR =========================== */

/** "3 maç men" / "Süresiz ihraç" / null. */
function durationText(meta?: PenaltyMeta | null): string | null {
  if (!meta) return null;
  if (meta.duration_type === "suresiz") return "Süresiz ihraç";
  if (meta.duration_type === "mac") {
    const count = Number(meta.match_count);
    return Number.isFinite(count) && count > 0 ? `${count} maç men` : "Maç cezası";
  }
  return null;
}

/**
 * Akış kimliği `penalty-<public_id>` biçimindedir. `meta.public_id` doluysa o
 * kullanılır; değilse önek kırpılır — iki yol da aynı değeri üretmelidir.
 */
function penaltyPublicId(item: PenaltyFeedItem): string {
  const fromMeta = item.meta?.public_id?.trim();
  if (fromMeta) return fromMeta;
  return String(item.id ?? "").replace(/^penalty-/, "");
}

function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/* ================================= EKRAN ================================== */

export default function PenaltiesScreen() {
  const scope = useScope();
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [filter, setFilter] = useState<PenaltyFilter>("tumu");
  const [detail, setDetail] = useState<PenaltyFeedItem | null>(null);

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const query = useQuery({
    queryKey: queryKeys.newsFeed(scopeKey),
    queryFn: () => getNewsFeed(scopeKey),
    staleTime: 2 * 60_000,
  });

  /**
   * Kendi dosyalarım — yalnız oturum varken. Hata alırsa (yetki/ağ) küme boş
   * kalır ve her satır alt sayfada açılır; ekranın ana işlevi bozulmaz.
   */
  const mine = useQuery({
    queryKey: ["panel", "penalties"],
    queryFn: getMyPenalties,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  const ownIds = useMemo(
    () => new Set((mine.data?.items ?? []).map((penalty) => penalty.public_id)),
    [mine.data],
  );

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const penalties = useMemo(
    () => ((query.data?.items ?? []) as PenaltyFeedItem[]).filter((item) => item.kind === "penalty"),
    [query.data],
  );

  const counts = useMemo(() => {
    const result: Record<PenaltyFilter, number> = {
      tumu: penalties.length,
      kurul: 0,
      cas: 0,
      suresiz: 0,
      mac: 0,
    };
    for (const item of penalties) {
      for (const def of FILTERS) {
        if (def.key !== "tumu" && def.match(item)) result[def.key] += 1;
      }
    }
    return result;
  }, [penalties]);

  const visible = useMemo(() => {
    const def = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
    return penalties.filter((item) => def.match(item));
  }, [filter, penalties]);

  const openItem = useCallback(
    (item: PenaltyFeedItem) => {
      const publicId = penaltyPublicId(item);
      // Kendi dosyam → savunma/itiraz ekranı; başkasınınki → karar özeti.
      if (publicId && ownIds.has(publicId)) {
        router.push(`/ceza/${publicId}`);
        return;
      }
      setDetail(item);
    },
    [ownIds, router],
  );

  const closeDetail = useCallback(() => setDetail(null), []);

  const goToMyPenalties = useCallback(() => {
    setDetail(null);
    router.push("/cezalarim");
  }, [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: PenaltyFeedItem; index: number }) => (
      <PenaltyRow
        item={item}
        position={rowPosition(index, visible.length)}
        own={ownIds.has(penaltyPublicId(item))}
        onPress={openItem}
      />
    ),
    [openItem, ownIds, visible.length],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <ChipGroup style={styles.chips}>
          {FILTERS.map((def) => (
            <Chip
              key={def.key}
              label={def.label}
              selected={def.key === filter}
              count={def.key === "tumu" ? undefined : counts[def.key]}
              onPress={() => setFilter(def.key)}
            />
          ))}
        </ChipGroup>

        <Text style={styles.summary} {...textScale.dense}>
          {scope.cityLabel || "Tüm şehirler"} kapsamında{" "}
          <Text style={styles.summaryStrong}>{penalties.length}</Text> sonuçlanmış disiplin kararı.
        </Text>

        {query.isError && penalties.length > 0 ? (
          <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
        ) : null}
      </View>
    ),
    [counts, filter, penalties.length, query.error, query.isError, query.refetch, scope.cityLabel],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Cezalar"
        subtitle={`${scope.cityLabel || "Türkiye"} · disiplin kararları`}
        back
        scrollY={scrollY}
        actions={
          auth.user
            ? [
                {
                  icon: "folder-open-outline",
                  onPress: goToMyPenalties,
                  accessibilityLabel: "Kendi disiplin dosyalarım",
                },
              ]
            : undefined
        }
      />

      {query.isLoading ? (
        <View style={styles.loading}>
          <SkeletonListRow count={6} avatar />
        </View>
      ) : query.isError && penalties.length === 0 ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : penalties.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="Ceza kaydı yok"
          body="Bu kapsamda sonuçlanmış disiplin kararı bulunmuyor — centilmenlik kazanıyor."
        />
      ) : (
        <FlatList
          {...scrollProps}
          data={visible}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="funnel-outline"
              title="Bu süzgeçte kayıt yok"
              body="Başka bir durum çipini seçebilirsin."
              variant="inline"
              compact
            />
          }
          contentContainerStyle={styles.content}
          refreshControl={refresh.control}
          initialNumToRender={12}
        />
      )}

      <PenaltySheet
        item={detail}
        onClose={closeDetail}
        onOpenMine={auth.user ? goToMyPenalties : undefined}
      />
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================ */

/**
 * Tek disiplin satırı. Başlık oyuncudur (kararın öznesi), alt satır takım +
 * ceza türü/süresi, sağdaki değer karar tarihidir; rozet aşamayı söyler.
 */
const PenaltyRow = React.memo(function PenaltyRow({
  item,
  position,
  own,
  onPress,
}: {
  item: PenaltyFeedItem;
  position: "single" | "first" | "middle" | "last";
  own: boolean;
  onPress: (item: PenaltyFeedItem) => void;
}) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  const meta = item.meta;
  const stage = stageOf(meta?.status);
  const duration = durationText(meta);
  const subtitle = [meta?.team_name?.trim(), duration, meta?.match_label?.trim()]
    .filter(Boolean)
    .join(" · ");

  return (
    <ListRow
      leading={<Avatar name={meta?.player_name ?? item.title} image={mediaUrl(item.cover_image_url)} size={32} />}
      title={meta?.player_name?.trim() || item.title}
      subtitle={subtitle || "Merkez Disiplin Kurulu kararı"}
      value={formatDateShort(item.published_at)}
      badge={<Badge label={own ? "Dosyam" : stage.label} tone={own ? "brand" : stage.tone} />}
      position={position}
      onPress={handlePress}
    />
  );
});

/**
 * Karar özeti alt sayfası — kullanıcının TARAF OLMADIĞI dosyalar için.
 * Savunma/itiraz burada yoktur; o eylemler yalnız kendi dosyanda ve
 * `/ceza/[id]` ekranında yapılabilir (sunucu da öyle korur).
 */
const PenaltySheet = React.memo(function PenaltySheet({
  item,
  onClose,
  onOpenMine,
}: {
  item: PenaltyFeedItem | null;
  onClose: () => void;
  onOpenMine?: () => void;
}) {
  const meta = item?.meta;
  const decision = item ? item.summary?.trim() || stripHtml(item.content, 600) : "";
  const duration = durationText(meta);

  const rows: { label: string; value: string }[] = [];
  if (meta?.player_name) rows.push({ label: "Oyuncu", value: meta.player_name });
  if (meta?.team_name) rows.push({ label: "Takım", value: meta.team_name });
  if (meta?.match_label) rows.push({ label: "Maç", value: meta.match_label });
  if (duration) rows.push({ label: "Ceza", value: duration });
  rows.push({ label: "Aşama", value: stageOf(meta?.status).label });
  if (item?.published_at) {
    rows.push({ label: "Karar tarihi", value: formatDateLong(item.published_at) });
  }

  return (
    <BottomSheet
      visible={Boolean(item)}
      onClose={onClose}
      title="Disiplin kararı"
      snap="content"
      footer={
        onOpenMine ? (
          <Button
            label="Kendi dosyalarım"
            icon="folder-open-outline"
            variant="secondary"
            fullWidth
            onPress={onOpenMine}
          />
        ) : undefined
      }
    >
      {item ? (
        <View style={styles.sheet}>
          {rows.map((row, index) => (
            <KeyValueRow
              key={row.label}
              label={row.label}
              value={row.value}
              position={rowPosition(index, rows.length)}
            />
          ))}

          {decision ? (
            <Text style={styles.decision} {...textScale.long}>
              {decision}
            </Text>
          ) : null}

          <Text style={styles.note} {...textScale.long}>
            Savunma ve itiraz yalnız dosyanın tarafı olan oyuncu ya da takım
            yetkilisi tarafından, süre penceresi açıkken gönderilebilir.
          </Text>
        </View>
      ) : null}
    </BottomSheet>
  );
});

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
    flexGrow: 1,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
  },
  headerBlock: {
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.sm,
  },
  /** ChipGroup kendi yatay boşluğunu taşır; listenin boşluğu geri alınır. */
  chips: {
    marginHorizontal: -layout.screenPadding,
  },
  summary: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  summaryStrong: {
    color: colors.textPrimary,
    fontWeight: "800",
  },
  sheet: {
    gap: space.md,
  },
  decision: {
    ...type.bodyLg,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  note: {
    ...type.bodySm,
    color: colors.textTertiary,
    lineHeight: 19,
  },
});
