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
 *   3. Kapsam başlığın altındaki tek lig seçicide (`LeaguePicker`).
 *   4. Satır → dosya. Kayıt KULLANICININ KENDİ dosyasıysa `/ceza/[id]` açılır
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

import Ionicons from "@expo/vector-icons/Ionicons";
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
  IconTile,
  Input,
  KeyValueRow,
  Reveal,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  SkeletonHero,
  Touchable,
  toneColors,
  useHeaderScroll,
  useRefresh,
  withAlpha,
  type Tone,
} from "@/components/ui";
import { SignatureStripe, StageCard, StageStat } from "@/components/league/kit";
import { LeaguePicker } from "@/components/LeaguePicker";
import { getMyPenalties } from "@/lib/api/panel";
import { getNewsFeed } from "@/lib/api/news";
import { formatDateLong, formatDateShort, mediaUrl, stripHtml } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import type { NewsItem } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  elevate,
  fonts,
  hairline,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

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

/** Liste öğeleri: zaman kümesi başlığı ya da karar kartı. */
type PenaltyEntry =
  | { kind: "head"; key: string; title: string; count: number }
  | { kind: "item"; key: string; item: PenaltyFeedItem; order: number };

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

/** Türkçe arama katlaması (İ/I/ı tek harfe iner). */
function fold(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/\u0307/g, "").replace(/[ıî]/g, "i");
}

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

/** Satır rozeti için kısa ceza: "3 maç" / "Süresiz" / null. */
function durationShort(meta?: PenaltyMeta | null): string | null {
  if (!meta) return null;
  if (meta.duration_type === "suresiz") return "Süresiz";
  if (meta.duration_type === "mac") {
    const count = Number(meta.match_count);
    return Number.isFinite(count) && count > 0 ? `${count} maç` : "Maç cezası";
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
  const [search, setSearch] = useState("");
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
    const needle = fold(search.trim());
    return penalties.filter(
      (item) =>
        def.match(item) &&
        (!needle ||
          fold(`${item.meta?.player_name ?? item.title} ${item.meta?.team_name ?? ""} ${item.meta?.match_label ?? ""}`).includes(needle)),
    );
  }, [filter, penalties, search]);

  /** Özet sayıları: toplam karar, verilen toplam maç cezası, süresiz ihraç. */
  const totals = useMemo(() => {
    let matches = 0;
    let lifetime = 0;
    for (const item of penalties) {
      if (item.meta?.duration_type === "suresiz") lifetime += 1;
      else if (item.meta?.duration_type === "mac") matches += Math.max(0, Number(item.meta.match_count) || 0);
    }
    return { matches, lifetime };
  }, [penalties]);

  /** Kartlar zamana göre üç kümeye ayrılır: bu hafta · geçen hafta · daha önce. */
  const rows = useMemo<PenaltyEntry[]>(() => {
    const now = Date.now();
    const buckets: { title: string; items: PenaltyFeedItem[] }[] = [
      { title: "Bu hafta", items: [] },
      { title: "Geçen hafta", items: [] },
      { title: "Daha önce", items: [] },
    ];
    for (const item of visible) {
      const age = (now - new Date(item.published_at ?? 0).getTime()) / 86_400_000;
      buckets[age <= 7 ? 0 : age <= 14 ? 1 : 2].items.push(item);
    }
    const out: PenaltyEntry[] = [];
    let order = 0;
    buckets.forEach((bucket) => {
      if (!bucket.items.length) return;
      out.push({ kind: "head", key: `h-${bucket.title}`, title: bucket.title, count: bucket.items.length });
      bucket.items.forEach((item) => out.push({ kind: "item", key: String(item.id), item, order: order++ }));
    });
    return out;
  }, [visible]);

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
    ({ item }: { item: PenaltyEntry }) =>
      item.kind === "head" ? (
        <SectionHeader title={item.title} meta={String(item.count)} inset="flush" style={styles.groupHead} />
      ) : (
        <Reveal index={item.order} limit={7}>
          <PenaltyCard item={item.item} own={ownIds.has(penaltyPublicId(item.item))} onPress={openItem} />
        </Reveal>
      ),
    [openItem, ownIds],
  );

  const listHeader = (
    <View style={styles.headerBlock}>
      {/* ÖZET SAHNESİ — kapsamın disiplin tablosu üç sayıda. */}
      <Reveal>
        <StageCard style={styles.hero}>
          <View style={styles.heroTop}>
            <IconTile icon="shield-half" tone="red" size={36} />
            <View style={styles.heroTitleBox}>
              <Text style={styles.heroOver} {...textScale.badge}>
                {upperTR("Disiplin kurulu")}
              </Text>
              <Text style={styles.heroTitle} numberOfLines={1} {...textScale.dense}>
                {[scope.cityLabel || "Tüm şehirler", scope.leagueLabel].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
          <View style={styles.heroStats}>
            <StageStat label="Karar" value={penalties.length} />
            <View style={styles.heroDivider} />
            <StageStat label="Maç men" value={totals.matches} accent />
            <View style={styles.heroDivider} />
            <StageStat label="Süresiz" value={totals.lifetime} />
          </View>
        </StageCard>
      </Reveal>

      <Input
        variant="search"
        value={search}
        onChangeText={setSearch}
        placeholder="Oyuncu, takım ya da maç ara"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Kararlarda ara"
      />

      <ChipGroup style={styles.chips}>
        {FILTERS.filter((def) => def.key === "tumu" || def.key === filter || counts[def.key] > 0).map((def) => (
          <Chip
            key={def.key}
            label={def.label}
            selected={def.key === filter}
            count={def.key === "tumu" ? undefined : counts[def.key]}
            onPress={() => setFilter(def.key)}
          />
        ))}
      </ChipGroup>

      {query.isError && penalties.length > 0 ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Cezalar"
        subtitle="Disiplin kararları"
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
        /* Kapsam uygulamanın tek lig seçicisinde: boş listeden kullanıcı tek
           dokunuşla başka il/lige geçebilsin. */
        bottom={<LeaguePicker />}
      />

      {query.isLoading ? (
        <View style={styles.loading}>
          <SkeletonHero />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </View>
      ) : query.isError && penalties.length === 0 ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : penalties.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="Ceza kaydı yok"
          body={`${scope.cityLabel || "Bu kapsam"} için sonuçlanmış disiplin kararı bulunmuyor — centilmenlik kazanıyor.`}
          action={{ label: "Şehri değiştir", onPress: () => scope.openScopeSheet("city"), haptic: "light" }}
        />
      ) : (
        <FlatList
          {...scrollProps}
          data={rows}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="funnel-outline"
              title={search.trim() ? "Eşleşen karar yok" : "Bu süzgeçte kayıt yok"}
              body={search.trim() ? "Aramayı kısalt ya da başka bir ad dene." : "Başka bir durum çipini seçebilirsin."}
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
 * Karar kartı. SOLDA CEZA BLOĞU kartın kahramanıdır: maç cezasında dev rakam
 * + "MAÇ", süresiz ihraçta sonsuz işareti — kırmızı (süresiz) ya da amber
 * (maç) zeminde. Sağda kişi → takım → maç; dipte karar tarihi ve aşama.
 * Kullanıcının kendi dosyası imza şeridi ve "Dosyam" rozetiyle işaretlenir.
 */
const PenaltyCard = React.memo(function PenaltyCard({
  item,
  own,
  onPress,
}: {
  item: PenaltyFeedItem;
  own: boolean;
  onPress: (item: PenaltyFeedItem) => void;
}) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  const meta = item.meta;
  const stage = stageOf(meta?.status);
  const lifetime = meta?.duration_type === "suresiz";
  const count = Number(meta?.match_count);
  const hasCount = meta?.duration_type === "mac" && Number.isFinite(count) && count > 0;
  const tone = toneColors(lifetime ? "danger" : "warn");
  const player = meta?.player_name?.trim() || item.title;

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={[player, meta?.team_name, durationText(meta), stage.label].filter(Boolean).join(", ")}
      style={[styles.card, own ? styles.cardOwn : null]}
    >
      {own ? <SignatureStripe /> : null}
      <View style={[styles.verdict, { backgroundColor: tone.dim, borderColor: withAlpha(tone.fg, 0.35) }]}>
        {lifetime ? (
          <Ionicons name="infinite" size={26} color={tone.fg} />
        ) : (
          <Text style={[styles.verdictValue, { color: tone.fg }]} {...textScale.dense}>
            {hasCount ? count : "—"}
          </Text>
        )}
        <Text style={[styles.verdictUnit, { color: tone.fg }]} {...textScale.badge}>
          {lifetime ? "SÜRESİZ" : "MAÇ"}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
            {player}
          </Text>
          {own ? <Badge label="Dosyam" tone="brand" size="xs" /> : null}
        </View>
        {meta?.team_name ? (
          <View style={styles.cardLine}>
            <Ionicons name="shield-outline" size={12} color={colors.textTertiary} />
            <Text style={styles.cardTeam} numberOfLines={1} {...textScale.dense}>
              {meta.team_name.trim()}
            </Text>
          </View>
        ) : null}
        {meta?.match_label ? (
          <View style={styles.cardLine}>
            <Ionicons name="football-outline" size={12} color={colors.textTertiary} />
            <Text style={styles.cardMeta} numberOfLines={1} {...textScale.dense}>
              {meta.match_label.replace(/\s+/g, " ").trim()}
            </Text>
          </View>
        ) : null}
        <View style={styles.cardFoot}>
          <Text style={styles.cardDate} {...textScale.dense}>
            {formatDateShort(item.published_at)}
          </Text>
          <Badge label={stage.label} tone={meta?.status === "cas_karari" ? "info" : "neutral"} size="xs" />
        </View>
      </View>
    </Touchable>
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
          <View style={styles.sheetHero}>
            <Avatar name={meta?.player_name ?? item.title} image={mediaUrl(item.cover_image_url)} size={48} />
            <View style={styles.sheetHeroText}>
              <Text style={styles.sheetName} numberOfLines={2} {...textScale.dense}>
                {meta?.player_name?.trim() || item.title}
              </Text>
              {duration ? (
                <Badge
                  label={duration}
                  tone={meta?.duration_type === "suresiz" ? "danger" : "warn"}
                  icon={meta?.duration_type === "suresiz" ? "infinite" : "ban"}
                />
              ) : null}
            </View>
          </View>
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
    gap: space.md,
  },
  headerBlock: {
    paddingTop: space.md,
    paddingBottom: space.xs,
    gap: space.md,
  },
  /** ChipGroup kendi yatay boşluğunu taşır; listenin boşluğu geri alınır. */
  chips: {
    marginHorizontal: -layout.screenPadding,
  },
  groupHead: {
    marginTop: space.md,
    marginBottom: space.sm,
  },

  /* — Sahne — */
  hero: {
    padding: space.lg,
    gap: space.md,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  heroTitleBox: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  heroOver: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  heroTitle: {
    ...type.h2,
    color: colors.onDark,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  heroDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.borderOnDark,
  },

  /* — Karar kartı — */
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: space.md,
    padding: space.m,
    marginBottom: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevate(1),
  },
  cardOwn: {
    backgroundColor: colors.brandDim,
    borderColor: colors.brandBorder,
  },
  verdict: {
    width: 64,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.sm,
    gap: space.xxs,
  },
  verdictValue: {
    ...type.scoreLg,
  },
  verdictUnit: {
    ...type.micro,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  cardTitle: {
    ...type.h3,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  cardLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  cardTeam: {
    ...type.labelSm,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  cardMeta: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    marginTop: space.xxs,
    paddingTop: space.s,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  cardDate: {
    ...type.numSmStrong,
    color: colors.textTertiary,
  },

  /* — Alt sayfa — */
  sheet: {
    gap: space.md,
  },
  sheetHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  sheetHeroText: {
    flex: 1,
    gap: space.xs,
    alignItems: "flex-start",
  },
  sheetName: {
    ...type.h2,
    color: colors.textPrimary,
  },
  decision: {
    ...type.bodyLg,
    color: colors.textPrimary,
  },
  note: {
    ...type.bodySm,
    color: colors.textTertiary,
    fontFamily: fonts.medium,
  },
});
