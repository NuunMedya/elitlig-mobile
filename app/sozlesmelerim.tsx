/**
 * SÖZLEŞMELERİM — oyuncunun kendi sözleşmelerinin listesi.
 *
 * NE DEĞİŞTİ: eski ekran her sözleşmeyi bir karta koyuyor ve durum dışında
 * hiçbir şey söylemiyordu; sözleşmenin maddeleri (bedel, maç başı ücret,
 * serbest kalma) hiç görünmüyordu. Artık liste yoğun `ListRow` satırlarıdır ve
 * satıra dokununca sözleşme BELGESİ açılır (`/sozlesme/[id]`). Böylece liste
 * "hangi sözleşmem hangi durumda" sorusuna, belge ise "ne imzalamışım"
 * sorusuna yanıt verir.
 *
 * SUNUCU TUZAĞI (korunuyor): `GET /api/contracts` çağrısı **scope=player** ile
 * yapılır. "double" rolündeki üye (hem oyuncu hem takım başkanı) kapsam
 * verilmezse takımının tüm sözleşmelerini de alır ve kendi sözleşmesi
 * kalabalıkta kaybolur (services/transfer/contractService.js).
 *
 * ANAHTAR: kayıt anahtarı `public_id`'dir; `CONTRACT_*` panel bildirimleri de
 * bu değeri `entity_public_id` olarak gönderir ve doğrudan belgeyi açar.
 */

import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Aurora,
  Badge,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  GradientBar,
  ListRow,
  Odometer,
  Reveal,
  ScreenHeader,
  Touchable,
  SkeletonListRow,
  TeamLogo,
  useHeaderScroll,
  useRefresh,
  type Tone,
} from "@/components/ui";
import { getMyContracts, type Contract } from "@/lib/api/panel";
import { mediaUrl } from "@/lib/format";
import { formatDateWithYear } from "@/components/club/dates";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/** Sunucudaki sözleşme durumları (services/transfer/contractLifecycle.js). */
const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Aktif", tone: "win" },
  PENDING_ACTIVATION: { label: "Aktivasyon bekliyor", tone: "warn" },
  EXPIRED: { label: "Süresi doldu", tone: "neutral" },
  TERMINATED: { label: "Feshedildi", tone: "danger" },
};

const statusMeta = (status: string): { label: string; tone: Tone } =>
  STATUS_META[status] ?? { label: status, tone: "neutral" };

/** Yürürlükte sayılan durumlar — eski ekranın "aktif" tanımı korunur. */
const LIVE_STATUSES = new Set(["ACTIVE", "PENDING_ACTIVATION"]);

type ContractFilter = "tumu" | "aktif" | "bekleyen" | "gecmis";

interface FilterDef {
  key: ContractFilter;
  label: string;
  match: (status: string) => boolean;
}

const FILTERS: FilterDef[] = [
  { key: "tumu", label: "Tümü", match: () => true },
  { key: "aktif", label: "Aktif", match: (s) => s === "ACTIVE" },
  { key: "bekleyen", label: "Bekleyen", match: (s) => s === "PENDING_ACTIVATION" },
  { key: "gecmis", label: "Geçmiş", match: (s) => !LIVE_STATUSES.has(s) },
];

const FILTER_KEYS = FILTERS.map((item) => item.key);

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilter(raw: unknown): ContractFilter {
  const key = String(raw ?? "").trim().toLowerCase();
  return (FILTER_KEYS as string[]).includes(key) ? (key as ContractFilter) : "tumu";
}

function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Bitişe kalan gün — 30 günden azsa satır uyarı rozeti taşır. */
function daysLeft(iso?: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diff)) return null;
  return Math.ceil(diff / 86_400_000);
}

/* ================================= EKRAN ================================== */

export default function ContractsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ durum?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const filter = resolveFilter(firstParam(params.durum));

  const query = useQuery({
    queryKey: ["panel", "contracts"],
    queryFn: () => getMyContracts(),
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  const counts = useMemo(() => {
    const result: Record<ContractFilter, number> = {
      tumu: items.length,
      aktif: 0,
      bekleyen: 0,
      gecmis: 0,
    };
    for (const contract of items) {
      for (const def of FILTERS) {
        if (def.key !== "tumu" && def.match(contract.status)) result[def.key] += 1;
      }
    }
    return result;
  }, [items]);

  const visible = useMemo(() => {
    const def = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
    return items.filter((contract) => def.match(contract.status));
  }, [filter, items]);

  /** Yürürlükteki sözleşme — başlık altındaki tek cümlelik özet. */
  const live = useMemo(
    () => items.find((contract) => LIVE_STATUSES.has(contract.status)) ?? null,
    [items],
  );

  const selectFilter = useCallback(
    (next: ContractFilter) => {
      scrollY.setValue(0);
      router.setParams({ durum: next });
    },
    [router, scrollY],
  );

  const openContract = useCallback(
    (publicId: string) => router.push(`/sozlesme/${publicId}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Contract; index: number }) => (
      <Reveal index={index} limit={8} replayKey={filter}>
        <ContractRow
          contract={item}
          position={rowPosition(index, visible.length)}
          onPress={openContract}
        />
      </Reveal>
    ),
    [filter, openContract, visible.length],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        {/* ÖZET: yürürlükteki sözleşme koyu sahnede — kulüp, süre, kalan gün. */}
        {live ? <LiveContractCard contract={live} onPress={() => openContract(live.public_id)} /> : null}
        <ChipGroup style={styles.chips}>
          {/* Boş durum çipi gösterilmez (Tekliflerim / Cezalarım ile aynı kural). */}
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
    [counts, filter, items.length, live, openContract, query.error, query.isError, query.refetch, selectFilter],
  );

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Sözleşmelerim"
        subtitle="Oyuncu sözleşmelerin"
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
          icon="document-text-outline"
          title="Sözleşme yok"
          body="Bir transfer teklifini kabul ettiğinde sözleşmen burada görünür."
          action={{ label: "Tekliflerime bak", onPress: () => router.push("/tekliflerim") }}
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
              title="Bu süzgeçte sözleşme yok"
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
  onSelect: (key: ContractFilter) => void;
}) {
  const handlePress = useCallback(() => onSelect(def.key), [def.key, onSelect]);
  return (
    <Chip label={def.label} count={count} selected={selected} onPress={handlePress} size="sm" />
  );
});

/**
 * Sözleşme satırı. Bitişine 30 günden az kalan AKTİF sözleşme ayrı rozet alır:
 * sunucu `CONTRACT_EXPIRING` bildirimini de bu eşikte gönderiyor, ekranın
 * dili bildirimle aynı olsun.
 */
const ContractRow = React.memo(function ContractRow({
  contract,
  position,
  onPress,
}: {
  contract: Contract;
  position: "single" | "first" | "middle" | "last";
  onPress: (publicId: string) => void;
}) {
  const handlePress = useCallback(
    () => onPress(contract.public_id),
    [contract.public_id, onPress],
  );

  const meta = statusMeta(contract.status);
  const left = daysLeft(contract.contract_end_date);
  const expiring = contract.status === "ACTIVE" && left !== null && left >= 0 && left <= 30;

  const leading = useMemo(
    () => (
      <TeamLogo
        name={contract.team?.team_name ?? "?"}
        logo={mediaUrl(contract.team?.logo ?? null)}
        size={layout.crestLg}
      />
    ),
    [contract.team?.logo, contract.team?.team_name],
  );

  const subtitle = `${
    contract.contract_start_date ? formatDateWithYear(contract.contract_start_date) : "?"
  } → ${contract.contract_end_date ? formatDateWithYear(contract.contract_end_date) : "Süresiz"}`;

  return (
    <ListRow
      leading={leading}
      title={contract.team?.team_name ?? "Takım"}
      subtitle={subtitle}
      trailing={
        <View style={styles.trail}>
          <Badge label={expiring ? "Bitiyor" : meta.label} tone={expiring ? "warn" : meta.tone} size="xs" />
          {LIVE_STATUSES.has(contract.status) && left !== null && left >= 0 ? (
            <Text style={[styles.days, expiring ? styles.daysWarn : null]} {...textScale.badge}>
              {`${left} gün`}
            </Text>
          ) : null}
        </View>
      }
      highlighted={LIVE_STATUSES.has(contract.status)}
      position={position}
      onPress={handlePress}
    />
  );
});

/**
 * Yürürlükteki sözleşme kartı — kimlik sahnesi (gradientInk + Aurora).
 * Süre çubuğu başlangıçtan bugüne geçen payı gösterir; kalan gün döner sayaçla.
 */
function LiveContractCard({ contract, onPress }: { contract: Contract; onPress: () => void }) {
  const meta = statusMeta(contract.status);
  const start = contract.contract_start_date ? new Date(contract.contract_start_date).getTime() : null;
  const end = contract.contract_end_date ? new Date(contract.contract_end_date).getTime() : null;
  const elapsed = start != null && end != null && end > start ? (Date.now() - start) / (end - start) : null;
  const left = daysLeft(contract.contract_end_date);
  return (
    <Reveal>
      <Touchable onPress={onPress} feedback="card" style={styles.live} accessibilityRole="button" accessibilityLabel={`Yürürlükteki sözleşme: ${contract.team?.team_name ?? "takım"}. ${meta.label}`}>
        <LinearGradient colors={colors.gradientInk} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Aurora variant="stage" style={StyleSheet.absoluteFill} />
        <View style={styles.liveTop}>
          <TeamLogo name={contract.team?.team_name ?? "?"} logo={mediaUrl(contract.team?.logo ?? null)} size={48} />
          <View style={styles.liveTexts}>
            <Text style={styles.liveOverline} {...textScale.badge}>
              {upperTR("Yürürlükteki sözleşmen")}
            </Text>
            <Text style={styles.liveTeam} numberOfLines={1} {...textScale.dense}>
              {contract.team?.team_name ?? "Takım"}
            </Text>
          </View>
          <Badge label={meta.label} tone={meta.tone} size="sm" />
        </View>
        <View style={styles.liveStats}>
          <View style={styles.liveStat}>
            <Text style={styles.liveLabel} {...textScale.badge}>
              {upperTR("Başlangıç")}
            </Text>
            <Text style={styles.liveValue} numberOfLines={1} {...textScale.dense}>
              {contract.contract_start_date ? formatDateWithYear(contract.contract_start_date) : "—"}
            </Text>
          </View>
          <View style={styles.liveStat}>
            <Text style={styles.liveLabel} {...textScale.badge}>
              {upperTR("Bitiş")}
            </Text>
            <Text style={styles.liveValue} numberOfLines={1} {...textScale.dense}>
              {contract.contract_end_date ? formatDateWithYear(contract.contract_end_date) : "Süresiz"}
            </Text>
          </View>
          <View style={[styles.liveStat, styles.liveStatEnd]}>
            <Text style={styles.liveLabel} {...textScale.badge}>
              {upperTR("Kalan")}
            </Text>
            {left != null && left >= 0 ? (
              <View style={styles.liveDays}>
                <Odometer value={left} style={styles.liveDaysValue} />
                <Text style={styles.liveDaysUnit} {...textScale.badge}>
                  gün
                </Text>
              </View>
            ) : (
              <Text style={styles.liveValue} {...textScale.dense}>
                —
              </Text>
            )}
          </View>
        </View>
        {elapsed != null ? <GradientBar value={Math.max(0, Math.min(1, elapsed))} height={6} track={colors.inkTile} /> : null}
      </Touchable>
    </Reveal>
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
  trail: { alignItems: "flex-end", gap: space.xxs, marginLeft: space.sm },
  days: { ...type.numSmStrong, color: colors.textSecondary },
  daysWarn: { color: colors.warn },
  live: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
    borderWidth: hairline,
    borderColor: colors.borderOnDark,
  },
  liveTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  liveTexts: { flex: 1, gap: space.xxs },
  liveOverline: { ...type.overline, color: colors.onDarkMuted },
  liveTeam: { ...type.h1, color: colors.onDark },
  liveStats: { flexDirection: "row", gap: space.sm },
  liveStat: { flex: 1, gap: space.xxs, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.inkTile, borderWidth: hairline, borderColor: colors.inkTileBorder },
  liveStatEnd: { alignItems: "flex-start" },
  liveLabel: { ...type.nano, color: colors.onDarkMuted, letterSpacing: 0.6 },
  liveValue: { ...type.labelSm, fontFamily: fonts.bold, color: colors.onDark },
  liveDays: { flexDirection: "row", alignItems: "flex-end", gap: space.xxs },
  liveDaysValue: { ...type.scoreSm, color: colors.onDark },
  liveDaysUnit: { ...type.caption, color: colors.onDarkMuted, marginBottom: space.px },
});
