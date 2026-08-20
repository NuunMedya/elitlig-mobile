/**
 * KULÜP KASASI — salt okunur mali görünüm.
 * `/takimim/kasa?tab=<defter|kadro>`
 *
 * NE: `GET /api/team-management/finance` kulübün gelir/gider toplamlarını,
 * kadro piyasa değerini, FFP değerlendirmesini ve kasa defterini tek çağrıda
 * döndürür (services/teamFinance getTeamFinanceDetail). Kayıt eklemek/silmek
 * yönetici yetkisidir; başkan yalnızca izler.
 *
 * NEDEN İKİ SEGMENT: yanıtın `squad[]` alanı (oyuncu bazlı piyasa değeri ve
 * ülke geneli sıra) eski sürümde HİÇ çizilmiyordu — yalnız toplamı
 * görünüyordu. Kadro değeri kulübün en büyük varlığı olduğu için kendi
 * segmentini hak ediyor. Seçim `?tab=` ile URL'de taşınır.
 *
 * FFP BANDI: durum rengi doğrudan hex ile değil, rozet ton sözlüğünden
 * (`toneColors`) alınır — böylece açık/koyu temada aynı anlam korunur.
 * Her sınır için doluluk çubuğu çizilir; sınır aşıldığında çubuk tavana
 * dayanır ve yüzde metni gerçek değeri söyler.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonCard,
  SkeletonListRow,
  refreshControlProps,
  toneColors,
  useHeaderScroll,
  useRefresh,
  withAlpha,
  type SegmentedItem,
  type Tone,
} from "@/components/ui";
import {
  FINANCE_ENTRY_LABELS,
  FINANCE_INCOME_TYPES,
  getTeamFinance,
  positionLabel,
  type FfpCheck,
  type FfpStatus,
  type FinanceLedgerEntry,
  type FinanceSquadPlayer,
} from "@/lib/api/team";
import { formatDateShort, formatMoney, mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Sabitler ve saf yardımcılar
   ══════════════════════════════════════════════════════════════════════════ */

type FinanceTab = "defter" | "kadro";

const TAB_ITEMS: SegmentedItem<FinanceTab>[] = [
  { key: "defter", label: "Kasa Defteri" },
  { key: "kadro", label: "Kadro Değeri" },
];

/** FFP durumu → rozet tonu + başlık + ikon. Renk `toneColors` sözlüğünden. */
const FFP_META: Record<FfpStatus, { tone: Tone; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  COMPLIANT: { tone: "win", label: "FFP: Uyumlu", icon: "checkmark-circle" },
  WARNING: { tone: "warn", label: "FFP: Sınırda", icon: "alert-circle" },
  BREACH: { tone: "danger", label: "FFP: İhlal", icon: "close-circle" },
  DISABLED: { tone: "neutral", label: "FFP: Kapalı", icon: "remove-circle" },
};

/** `services/teamFinance` içindeki kontrol anahtarlarının Türkçe adları. */
const FFP_CHECK_LABELS: Record<string, string> = {
  netSpend: "Net transfer harcaması",
  squadValue: "Kadro değeri sınırı",
};

/**
 * İşaretli para birimi. `formatMoney` sıfır ve altını "—" yaptığı için
 * bakiye (eksiye düşebilir) burada ayrı biçimlenir.
 */
function signedMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
  if (value === 0) return "0 ₺";
  return `${value < 0 ? "−" : ""}${abs} ₺`;
}

/** Yüzdeyi 0–1 aralığına sıkıştırır; sonsuz/NaN değerler tavana dayanır. */
function usageRatio(check: FfpCheck): number {
  if (!Number.isFinite(check.usagePct)) return 1;
  return Math.max(0, Math.min(1, check.usagePct / 100));
}

function usageLabel(check: FfpCheck): string {
  if (!Number.isFinite(check.usagePct)) return "%∞";
  return `%${Math.round(check.usagePct)}`;
}

function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

function resolveTab(raw: string | string[] | undefined): FinanceTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "kadro" ? "kadro" : "defter";
}

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

export default function ClubFinanceScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const tab = resolveTab(params.tab);

  const query = useQuery({
    queryKey: ["takim", "finance"],
    queryFn: getTeamFinance,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const refreshControl = (
    <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
  );

  const data = query.data;

  const changeTab = useCallback(
    (next: FinanceTab) => {
      scrollY.setValue(0);
      router.setParams({ tab: next });
    },
    [router, scrollY]
  );

  /** Kadro, değeri yüksekten düşüğe — kulübün en pahalı varlıkları üstte. */
  const squad = useMemo(
    () =>
      [...(data?.squad ?? [])].sort(
        (a, b) => (Number(b.marketValue) || 0) - (Number(a.marketValue) || 0)
      ),
    [data?.squad]
  );

  const listHeader = useMemo(() => {
    if (!data) return null;
    const balance = data.totals.income - data.totals.expense;
    return (
      <View style={styles.header}>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
        ) : null}

        {/* Özet kartları */}
        <View style={styles.summaryRow}>
          <SummaryCard label="GELİR" value={signedMoney(data.totals.income)} tone="win" />
          <SummaryCard label="GİDER" value={signedMoney(data.totals.expense)} tone="danger" />
        </View>
        <View style={styles.summaryRow}>
          <SummaryCard
            label="BAKİYE"
            value={signedMoney(balance)}
            tone={balance >= 0 ? "win" : "danger"}
          />
          <SummaryCard
            label="KADRO DEĞERİ"
            value={formatMoney(data.squadValue)}
            tone="brand"
            meta={`${data.playerCount} oyuncu`}
          />
        </View>

        {/* FFP bandı */}
        <FfpBanner
          status={data.ffp.status}
          enabled={data.ffp.enabled}
          netSpend={data.ffp.netSpend}
          checks={data.ffp.checks}
        />

        <SectionHeader
          title={tab === "defter" ? "Kasa defteri" : "Oyuncu bazlı değer"}
          meta={
            tab === "defter"
              ? `${data.entries.length} kayıt`
              : `${squad.length} oyuncu`
          }
        />
      </View>
    );
  }, [data, query.error, query.isError, query.refetch, squad.length, tab]);

  const renderEntry = useCallback(
    ({ item, index }: { item: FinanceLedgerEntry; index: number }) => (
      <LedgerRow
        entry={item}
        position={rowPosition(index, data?.entries.length ?? 0)}
      />
    ),
    [data?.entries.length]
  );

  const renderSquad = useCallback(
    ({ item, index }: { item: FinanceSquadPlayer; index: number }) => (
      <SquadValueRow player={item} position={rowPosition(index, squad.length)} />
    ),
    [squad.length]
  );

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const noAccess =
    query.isError && query.error instanceof ApiError && query.error.status === 403;

  const header = (
    <ScreenHeader
      title="Kulüp Kasası"
      subtitle={data?.team.teamName}
      back
      scrollY={scrollY}
      bottom={
        data ? (
          <View style={styles.headerBottom}>
            <SegmentedControl items={TAB_ITEMS} value={tab} onChange={changeTab} />
          </View>
        ) : undefined
      }
    />
  );

  if (query.isLoading && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <View style={styles.loading}>
          <SkeletonCard lines={2} />
          <SkeletonListRow count={6} />
        </View>
      </SafeAreaView>
    );
  }

  if (noAccess) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="wallet-outline"
          title="Takım başkanlığı gerekli"
          body="Kulüp kasası yalnızca takımının yönetimini üstlenen başkanlara açıktır."
        />
      </SafeAreaView>
    );
  }

  if ((query.isError && !data) || !data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <ErrorState error={query.error} onRetry={query.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      {tab === "defter" ? (
        <FlatList
          {...scrollProps}
          data={data.entries}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderEntry}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="Kasa hareketi yok"
              body="Transferler sözleşme yürürlüğe girdiğinde defterine otomatik işlenir."
              variant="inline"
            />
          }
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
          initialNumToRender={12}
        />
      ) : (
        <FlatList
          {...scrollProps}
          data={squad}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSquad}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="Kadro değeri hesaplanmadı"
              body="Oyuncuların piyasa değeri belirlendiğinde kadro dökümü burada listelenir."
              variant="inline"
            />
          }
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
          initialNumToRender={12}
        />
      )}
    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Alt bileşenler
   ══════════════════════════════════════════════════════════════════════════ */

/** Özet kartı — dört tanesi 2×2 ızgara kurar. */
const SummaryCard = React.memo(function SummaryCard({
  label,
  value,
  tone,
  meta,
}: {
  label: string;
  value: string;
  tone: Tone;
  meta?: string;
}) {
  const palette = toneColors(tone);
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
      <Text
        style={[styles.summaryValue, { color: palette.fg }]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {value}
      </Text>
      {meta ? (
        <Text style={styles.summaryMeta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
});

/** FFP durum bandı — renk kodlu başlık + her sınır için doluluk çubuğu. */
const FfpBanner = React.memo(function FfpBanner({
  status,
  enabled,
  netSpend,
  checks,
}: {
  status: FfpStatus;
  enabled: boolean;
  netSpend: number;
  checks: FfpCheck[];
}) {
  const meta = FFP_META[status] ?? FFP_META.DISABLED;
  const palette = toneColors(meta.tone);

  return (
    <View style={[styles.ffp, { backgroundColor: palette.dim, borderColor: withAlpha(palette.fg, 0.35) }]}>
      <View style={styles.ffpHead}>
        <Ionicons name={meta.icon} size={16} color={palette.fg} />
        <Text style={[styles.ffpTitle, { color: palette.fg }]} {...textScale.dense}>
          {meta.label}
        </Text>
        <Text style={styles.ffpNet} numberOfLines={1} {...textScale.dense}>
          Net harcama {signedMoney(netSpend)}
        </Text>
      </View>

      {!enabled ? (
        <Text style={styles.ffpNote} {...textScale.long}>
          Bu sezon için mali fair play sınırı tanımlı değil.
        </Text>
      ) : checks.length === 0 ? (
        <Text style={styles.ffpNote} {...textScale.long}>
          Mali fair play açık ama tanımlı bir sınır yok.
        </Text>
      ) : (
        checks.map((check) => <FfpCheckRow key={check.key} check={check} />)
      )}
    </View>
  );
});

/** Tek bir FFP sınırı: etiket, kullanım/limit ve doluluk çubuğu. */
const FfpCheckRow = React.memo(function FfpCheckRow({ check }: { check: FfpCheck }) {
  const palette = toneColors(FFP_META[check.status]?.tone ?? "neutral");
  const ratio = usageRatio(check);

  return (
    <View style={styles.check}>
      <View style={styles.checkTop}>
        <Text style={styles.checkLabel} numberOfLines={1} {...textScale.dense}>
          {FFP_CHECK_LABELS[check.key] ?? check.key}
        </Text>
        <Text style={styles.checkValue} numberOfLines={1} {...textScale.dense}>
          {signedMoney(check.value)} / {signedMoney(check.limit)} · {usageLabel(check)}
        </Text>
      </View>
      <View style={styles.checkTrack}>
        <View
          style={[
            styles.checkFill,
            { width: `${Math.round(ratio * 100)}%`, backgroundColor: palette.fg },
          ]}
        />
      </View>
    </View>
  );
});

/** Kasa defteri satırı: yön ikonu, tür, tarih/karşı taraf, işaretli tutar. */
const LedgerRow = React.memo(function LedgerRow({
  entry,
  position,
}: {
  entry: FinanceLedgerEntry;
  position: "single" | "first" | "middle" | "last";
}) {
  const income = FINANCE_INCOME_TYPES.includes(entry.entryType);
  const palette = toneColors(income ? "win" : "danger");
  const who = entry.playerName ?? entry.counterpartyTeamName ?? entry.description ?? "";

  return (
    <View
      style={[
        styles.row,
        position === "single" ? styles.rowSingle : null,
        position === "first" ? styles.rowFirst : null,
        position === "last" ? styles.rowLast : null,
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: palette.dim }]}>
        <Ionicons
          name={income ? "arrow-down" : "arrow-up"}
          size={14}
          color={palette.fg}
        />
      </View>

      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {FINANCE_ENTRY_LABELS[entry.entryType] ?? entry.entryType}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
          {formatDateShort(entry.createdAt)}
          {who ? ` · ${who}` : ""}
        </Text>
      </View>

      <Text style={[styles.amount, { color: palette.fg }]} numberOfLines={1} {...textScale.dense}>
        {income ? "+" : "−"}
        {formatMoney(entry.amount, entry.currency)}
      </Text>

      {position === "first" || position === "middle" ? (
        <View pointerEvents="none" style={styles.rowDivider} />
      ) : null}
    </View>
  );
});

/** Kadro değeri satırı: avatar, ad/mevki, piyasa değeri ve genel sıra rozeti. */
const SquadValueRow = React.memo(function SquadValueRow({
  player,
  position,
}: {
  player: FinanceSquadPlayer;
  position: "single" | "first" | "middle" | "last";
}) {
  return (
    <View
      style={[
        styles.row,
        position === "single" ? styles.rowSingle : null,
        position === "first" ? styles.rowFirst : null,
        position === "last" ? styles.rowLast : null,
      ]}
    >
      <Avatar name={player.playerName} image={mediaUrl(player.image)} size={32} />

      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {player.playerName}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
          {positionLabel(player.position) || "Mevki belirtilmedi"}
        </Text>
      </View>

      {player.globalRank != null ? (
        <Badge label={`#${player.globalRank}`} tone="brand" size="xs" />
      ) : null}

      <Text style={styles.amount} numberOfLines={1} {...textScale.dense}>
        {formatMoney(player.marketValue)}
      </Text>

      {position === "first" || position === "middle" ? (
        <View pointerEvents="none" style={styles.rowDivider} />
      ) : null}
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerBottom: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xxxl,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
    gap: space.sm,
  },
  header: {
    paddingTop: space.sm,
    gap: space.sm,
  },

  /* Özet kartları */
  summaryRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  summaryCard: {
    flex: 1,
    gap: 3,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    padding: space.md,
  },
  summaryLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  summaryValue: {
    ...type.scoreSm,
  },
  summaryMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* FFP */
  ffp: {
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.md,
  },
  ffpHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  ffpTitle: {
    ...type.label,
    fontWeight: "800",
  },
  ffpNet: {
    ...type.caption,
    color: colors.textSecondary,
    flex: 1,
    textAlign: "right",
  },
  ffpNote: {
    ...type.caption,
    color: colors.textSecondary,
  },
  check: {
    gap: space.xs,
  },
  checkTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  checkLabel: {
    ...type.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  checkValue: {
    ...type.caption,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  checkTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  checkFill: {
    height: "100%",
    borderRadius: radius.pill,
  },

  /* Liste satırları — ListRow ölçüleriyle birebir. */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: layout.listRowHeightTwoLine,
    paddingHorizontal: layout.rowPaddingH,
    backgroundColor: colors.surface1,
  },
  rowSingle: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  rowFirst: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  rowLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  rowDivider: {
    position: "absolute",
    left: layout.rowPaddingH + 32 + space.m,
    right: 0,
    bottom: 0,
    height: hairline,
    backgroundColor: colors.separator,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...type.bodySm,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  rowMeta: {
    ...type.caption,
    color: colors.textSecondary,
  },
  amount: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
});
