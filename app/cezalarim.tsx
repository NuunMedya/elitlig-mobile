/**
 * CEZALARIM — üyenin taraf olduğu disiplin dosyalarının listesi.
 *
 * NE DEĞİŞTİ: eski ekran her dosyayı açılır-kapanır bir kart yapıyor, süreç
 * akışını ve savunma/itiraz formunu aynı kartın içine sığdırıyordu. Kart açık
 * olduğunda liste kayboluyor, kapalıyken de "bu dosyada ne oldu" görünmüyordu.
 * Artık liste YOĞUN satırlardır; dosyanın tamamı `/ceza/[id]` ekranında açılır
 * (şartname §5, satır 12).
 *
 * SÜRE PENCERELERİ (sunucu kuralı, ekranda birebir): savunma sevkten sonra
 * 24 saat, itiraz kurul kararından sonra 1 hafta içinde gönderilebilir
 * (constants/penalty.js → DEFENSE_WINDOW_HOURS / OBJECTION_WINDOW_DAYS).
 * "Aksiyon gerek" çipi tam olarak bu iki pencereyi süzer; bu yüzden gecikmesi
 * en pahalı olan dosyalar tek dokunuşla öne çıkar.
 *
 * TARAF (side): işlem yapılırken kullanılan sıfat uydurulmaz; sunucunun
 * verdiği `viewer_side` / `available_sides` değerlerinden okunur — üye hem
 * oyuncu hem takım yetkilisi olabilir. Bu mantık detay ekranında sürer.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  ListRow,
  MetricGrid,
  MetricTile,
  Reveal,
  ScreenHeader,
  SkeletonListRow,
  useHeaderScroll,
  useRefresh,
  type Tone,
} from "@/components/ui";
import { DeadlineBanner, isUrgentDeadline, remainingShort } from "@/components/club/DeadlineBanner";
import { getMyPenalties, type Penalty } from "@/lib/api/panel";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, radius, space, textScale, type } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/** Dosya aşamaları — constants/penalty.js PENALTY_STATUS ile aynı anahtarlar. */
const STAGE_META: Record<
  string,
  { short: string; icon: keyof typeof Ionicons.glyphMap; tone: Tone }
> = {
  sevk: { short: "Sevk", icon: "alert-circle", tone: "warn" },
  kurul_karari: { short: "Kurul kararı", icon: "shield", tone: "danger" },
  cas_basvuru: { short: "CAS'ta", icon: "hourglass", tone: "info" },
  cas_karari: { short: "CAS kararı", icon: "checkmark-done-circle", tone: "neutral" },
};

/** Dosya yolu: sevk → kurul kararı → CAS başvurusu → CAS kararı (satırdaki basamaklar). */
const STAGE_ORDER = ["sevk", "kurul_karari", "cas_basvuru", "cas_karari"];

const stageMeta = (status: string) =>
  STAGE_META[status] ?? {
    short: status,
    icon: "document-text" as keyof typeof Ionicons.glyphMap,
    tone: "neutral" as Tone,
  };

type PenaltyFilter = "tumu" | "aksiyon" | "sevk" | "kurul" | "cas";

interface FilterDef {
  key: PenaltyFilter;
  label: string;
  match: (penalty: Penalty) => boolean;
}

/** Pencere açık mı: son tarih var VE henüz geçmemiş. */
const windowOpen = (deadline: string | null): boolean =>
  Boolean(deadline && new Date(deadline).getTime() > Date.now());

/** İtiraz yalnız kurul kararı aşamasında yapılabilir (sunucu 409 ile korur). */
const canObject = (penalty: Penalty): boolean =>
  penalty.status === "kurul_karari" && windowOpen(penalty.objection_deadline_at);

const canDefend = (penalty: Penalty): boolean => windowOpen(penalty.defense_deadline_at);

const FILTERS: FilterDef[] = [
  { key: "tumu", label: "Tümü", match: () => true },
  { key: "aksiyon", label: "Aksiyon gerek", match: (p) => canDefend(p) || canObject(p) },
  { key: "sevk", label: "Sevk", match: (p) => p.status === "sevk" },
  { key: "kurul", label: "Kurul kararı", match: (p) => p.status === "kurul_karari" },
  { key: "cas", label: "CAS", match: (p) => p.status === "cas_basvuru" || p.status === "cas_karari" },
];

const FILTER_KEYS = FILTERS.map((item) => item.key);

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilter(raw: unknown): PenaltyFilter {
  const key = String(raw ?? "").trim().toLowerCase();
  return (FILTER_KEYS as string[]).includes(key) ? (key as PenaltyFilter) : "tumu";
}

function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/* ================================= EKRAN ================================== */

export default function PenaltiesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ durum?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const filter = resolveFilter(firstParam(params.durum));

  const query = useQuery({
    queryKey: ["panel", "penalties"],
    queryFn: getMyPenalties,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  const counts = useMemo(() => {
    const result: Record<PenaltyFilter, number> = {
      tumu: items.length,
      aksiyon: 0,
      sevk: 0,
      kurul: 0,
      cas: 0,
    };
    for (const penalty of items) {
      for (const def of FILTERS) {
        if (def.key !== "tumu" && def.match(penalty)) result[def.key] += 1;
      }
    }
    return result;
  }, [items]);

  const visible = useMemo(() => {
    const def = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
    return items.filter((penalty) => def.match(penalty));
  }, [filter, items]);

  /** Kapanmamış dosya (CAS kararı = son aşama) ve süren men cezası (maç). */
  const openCount = useMemo(() => items.filter((penalty) => penalty.status !== "cas_karari").length, [items]);
  const banMatches = useMemo(
    () => items.filter((penalty) => penalty.ban_state === "active").reduce((sum, penalty) => sum + (penalty.match_count ?? 0), 0),
    [items],
  );

  /** En yakın son tarih — başlık altındaki uyarı cümlesi için. */
  const urgent = useMemo(() => {
    const open = items
      .map((penalty) => {
        if (canDefend(penalty)) {
          return { penalty, kind: "savunma" as const, deadline: penalty.defense_deadline_at };
        }
        if (canObject(penalty)) {
          return { penalty, kind: "itiraz" as const, deadline: penalty.objection_deadline_at };
        }
        return null;
      })
      .filter((item): item is { penalty: Penalty; kind: "savunma" | "itiraz"; deadline: string | null } =>
        item !== null,
      )
      .sort((a, b) => String(a.deadline ?? "").localeCompare(String(b.deadline ?? "")));
    return open[0] ?? null;
  }, [items]);

  const selectFilter = useCallback(
    (next: PenaltyFilter) => {
      scrollY.setValue(0);
      router.setParams({ durum: next });
    },
    [router, scrollY],
  );

  const openPenalty = useCallback(
    (publicId: string) => router.push(`/ceza/${publicId}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Penalty; index: number }) => (
      <Reveal index={index} limit={8} replayKey={filter}>
        <PenaltyRow
          penalty={item}
          position={rowPosition(index, visible.length)}
          onPress={openPenalty}
        />
      </Reveal>
    ),
    [filter, openPenalty, visible.length],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        {/* ÖZET: açık dosya · aksiyon gereken · süren men cezası (maç). */}
        <Reveal>
          <MetricGrid columns={3}>
            <MetricTile label="Dosya" value={String(items.length)} hint={`${openCount} açık`} tone="brand" onPress={() => selectFilter("tumu")} />
            <MetricTile
              label="Aksiyon"
              value={String(counts.aksiyon)}
              hint={counts.aksiyon ? "süre işliyor" : "bekleyen yok"}
              tone={counts.aksiyon ? "danger" : "neutral"}
             
              onPress={() => selectFilter("aksiyon")}
            />
            <MetricTile label="Men" value={String(banMatches)} hint="maç cezası" tone={banMatches ? "warn" : "neutral"} />
          </MetricGrid>
        </Reveal>

        {/* En yakın son tarih: kendi bandında, kalan süre rakamla. */}
        {urgent ? (
          <DeadlineBanner
            title={urgent.kind === "savunma" ? "Savunma süresi işliyor" : "İtiraz süresi işliyor"}
            detail={[urgent.penalty.match_label, urgent.penalty.player_name].filter(Boolean).join(" · ")}
            deadline={urgent.deadline}
            actionLabel="Dosyayı aç"
            onPress={() => openPenalty(urgent.penalty.public_id)}
          />
        ) : null}

        <ChipGroup style={styles.chips}>
          {/* Boş aşama çipi gösterilmez: "CAS 0" bir seçenek değil, gürültü. */}
          {FILTERS.filter((def) => def.key === "tumu" || def.key === filter || counts[def.key] > 0).map((def) => (
            <FilterChip
              key={def.key}
              def={def}
              count={counts[def.key]}
              selected={def.key === filter}
              onSelect={selectFilter}
            />
          ))}
        </ChipGroup>

        {query.isError && items.length > 0 ? (
          <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
        ) : null}
      </View>
    ),
    [banMatches, counts, filter, items.length, openCount, openPenalty, query.error, query.isError, query.refetch, selectFilter, urgent],
  );

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Cezalarım ve Savunma"
        subtitle="Disiplin dosyaların"
        back
        scrollY={scrollY}
      />

      {query.isLoading ? (
        <View style={styles.loading}>
          <SkeletonListRow count={5} />
        </View>
      ) : query.isError && items.length === 0 ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="Dosya yok"
          body="Taraf olduğun bir disiplin dosyası yok."
        />
      ) : (
        <FlatList
          {...scrollProps}
          data={visible}
          keyExtractor={(item) => item.public_id}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="funnel-outline"
              title="Bu süzgeçte dosya yok"
              body="Başka bir aşama çipini seçebilirsin."
              variant="inline"
              compact
            />
          }
          contentContainerStyle={styles.content}
          refreshControl={refresh.control}
          initialNumToRender={12}
        />
      )}
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================= */

const FilterChip = React.memo(function FilterChip({
  def,
  count,
  selected,
  onSelect,
}: {
  def: FilterDef;
  count: number;
  selected: boolean;
  onSelect: (key: PenaltyFilter) => void;
}) {
  const handlePress = useCallback(() => onSelect(def.key), [def.key, onSelect]);
  return (
    <Chip label={def.label} count={count} selected={selected} onPress={handlePress} size="sm" />
  );
});

/**
 * Dosya satırı. Süresi işleyen savunma/itiraz varsa satır vurgulanır ve rozet
 * kalan süreyi söyler — "24 saat" kuralı ancak görülürse işe yarar.
 */
const PenaltyRow = React.memo(function PenaltyRow({
  penalty,
  position,
  onPress,
}: {
  penalty: Penalty;
  position: "single" | "first" | "middle" | "last";
  onPress: (publicId: string) => void;
}) {
  const handlePress = useCallback(
    () => onPress(penalty.public_id),
    [onPress, penalty.public_id],
  );

  const stage = stageMeta(penalty.status);
  const defenseOpen = canDefend(penalty);
  const objectionOpen = canObject(penalty);
  const deadline = defenseOpen ? penalty.defense_deadline_at : penalty.objection_deadline_at;
  const left = defenseOpen || objectionOpen ? remainingShort(deadline) : null;

  const leading = useMemo(
    () => ({ icon: stage.icon, tone: stage.tone }),
    [stage.icon, stage.tone],
  );

  /* Başlık maç, alt satır kişi + tarih + süre. Uzun maç etiketi ("A – B")
     satırı taşırmasın diye takım adı ayrıca yazılmaz. */
  const subtitle = [
    left ? (defenseOpen ? "Savunma süresi" : "İtiraz süresi") : null,
    penalty.player_name,
    penalty.match_date ? formatDateShort(penalty.match_date) : null,
    penalty.match_count ? `${penalty.match_count} maç` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ListRow
      leading={leading}
      title={penalty.match_label ?? penalty.team_name ?? "Disiplin dosyası"}
      subtitle={subtitle || undefined}
      trailing={
        <View style={styles.trail}>
          {left ? (
            <Badge icon="time" label={left} tone={isUrgentDeadline(deadline) ? "danger" : "warn"} size="xs" />
          ) : (
            <Badge label={stage.short} tone={stage.tone} size="xs" />
          )}
          <StageSteps status={penalty.status} />
        </View>
      }
      highlighted={defenseOpen || objectionOpen}
      position={position}
      onPress={handlePress}
    />
  );
});

/** Dört basamaklı dosya yolu — geçilen basamaklar dolu, bulunulan vurgulu. */
function StageSteps({ status }: { status: string }) {
  const at = STAGE_ORDER.indexOf(status);
  if (at < 0) return null;
  return (
    <View style={styles.steps} accessibilityLabel={`Aşama ${at + 1} / ${STAGE_ORDER.length}`}>
      {STAGE_ORDER.map((key, index) => (
        <View key={key} style={[styles.step, index < at ? styles.stepDone : index === at ? styles.stepNow : null]} />
      ))}
      <Text style={styles.stepText} {...textScale.badge}>
        {`${at + 1}/${STAGE_ORDER.length}`}
      </Text>
    </View>
  );
}

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
  },
  headerBlock: {
    gap: space.sm,
    paddingBottom: space.md,
  },
  /**
   * Çip şeridi ekran kenarına kadar kayabilsin: olumsuz kenar boşluğu listenin
   * iç boşluğunu iptal eder, çiplerin kendi iç boşluğunu ChipGroup verir.
   */
  chips: {
    marginHorizontal: -layout.screenPadding,
  },
  trail: { alignItems: "flex-end", gap: space.xs, marginLeft: space.sm },
  steps: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  step: { width: 10, height: 4, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  stepDone: { backgroundColor: colors.textTertiary },
  stepNow: { width: 16, backgroundColor: colors.brand },
  stepText: { ...type.nano, color: colors.textTertiary, marginLeft: space.xxs },
});
