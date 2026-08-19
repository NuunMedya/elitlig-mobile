import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import {
  FINANCE_ENTRY_LABELS,
  FINANCE_INCOME_TYPES,
  getTeamFinance,
  type FfpStatus,
  type FinanceLedgerEntry,
} from "@/lib/api/team";
import { formatDateShort, formatMoney } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Kulüp Kasası — salt okunur mali görünüm.
 *
 * GET /api/team-management/finance takımın gelir/gider toplamlarını,
 * kadro piyasa değerini, FFP değerlendirmesini ve kasa defterini döndürür
 * (services/teamFinance getTeamFinanceDetail). Kayıt eklemek/silmek
 * yönetici yetkisidir; başkan yalnızca izler.
 */

const FFP_META: Record<FfpStatus, { label: string; color: string; bg: string; icon: string }> = {
  COMPLIANT: { label: "FFP: Uyumlu", color: "#178A50", bg: "#178A5018", icon: "checkmark-circle" },
  WARNING: { label: "FFP: Sınırda", color: "#B98A06", bg: "#E8B00A22", icon: "alert-circle" },
  BREACH: { label: "FFP: İhlal", color: "#D92D20", bg: "#D92D2018", icon: "close-circle" },
  DISABLED: { label: "FFP: Kapalı", color: "#63606E", bg: "#63606E18", icon: "remove-circle" },
};

const FFP_CHECK_LABELS: Record<string, string> = {
  netSpend: "Net transfer harcaması",
  squadValue: "Kadro değeri sınırı",
};

export default function ClubFinanceScreen() {
  const auth = useAuth();

  const query = useQuery({
    queryKey: ["takim", "finance"],
    queryFn: getTeamFinance,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const noAccess =
    query.isError && query.error instanceof ApiError && query.error.status === 403;

  const data = query.data;
  const ffp = data ? FFP_META[data.ffp.status] ?? FFP_META.DISABLED : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader
        title="Kulüp Kasası"
        subtitle={data?.team.teamName ?? "Gelir, gider ve FFP durumu"}
      />

      {query.isLoading ? (
        <Loading />
      ) : noAccess ? (
        <EmptyState
          icon="wallet-outline"
          title="Takım başkanlığı gerekli"
          body="Kulüp kasası yalnızca takımının yönetimini üstlenen başkanlara açıktır."
        />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !data || !ffp ? null : (
        <FlatList
          data={data.entries}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              {/* Özet kartları */}
              <View style={styles.summaryRow}>
                <SummaryCard label="GELİR" value={formatBalance(data.totals.income)} color={colors.green} />
                <SummaryCard label="GİDER" value={formatBalance(data.totals.expense)} color={colors.live} />
              </View>
              <View style={styles.summaryRow}>
                <SummaryCard
                  label="BAKİYE (NET)"
                  value={formatBalance(data.totals.income - data.totals.expense)}
                  color={data.totals.income - data.totals.expense >= 0 ? colors.green : colors.live}
                />
                <SummaryCard label="KADRO DEĞERİ" value={formatMoney(data.squadValue)} color={colors.turf} />
              </View>

              {/* FFP durumu */}
              <View style={[styles.ffpBanner, { backgroundColor: ffp.bg }]}>
                <Ionicons
                  name={ffp.icon as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={ffp.color}
                />
                <View style={styles.ffpBody}>
                  <Text style={[styles.ffpTitle, { color: ffp.color }]}>{ffp.label}</Text>
                  {data.ffp.checks.map((check) => (
                    <Text key={check.key} style={styles.ffpLine}>
                      {FFP_CHECK_LABELS[check.key] ?? check.key}: {formatMoney(check.value)} /{" "}
                      {formatMoney(check.limit)} (%{Number.isFinite(check.usagePct) ? check.usagePct : "∞"})
                    </Text>
                  ))}
                  {data.ffp.enabled && data.ffp.checks.length === 0 ? (
                    <Text style={styles.ffpLine}>Tanımlı bir sınır yok.</Text>
                  ) : null}
                </View>
              </View>

              <Text style={styles.sectionTitle}>
                KASA DEFTERİ · {data.entries.length} KAYIT
              </Text>
              {data.entries.length === 0 ? (
                <Text style={styles.emptyLedger}>
                  Henüz kasa hareketi yok. Transferler sözleşme yürürlüğe girdiğinde otomatik işlenir.
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => <LedgerRow entry={item} />}
        />
      )}
    </SafeAreaView>
  );
}

/** Bakiye eksi olabilir; formatMoney sıfır ve altını "—" yaptığı için ayrı ele alınır. */
function formatBalance(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0 ₺";
  const sign = value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺`;
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function LedgerRow({ entry }: { entry: FinanceLedgerEntry }) {
  const income = FINANCE_INCOME_TYPES.includes(entry.entryType);
  const who = entry.playerName ?? entry.counterpartyTeamName ?? entry.description ?? "";
  return (
    <View style={styles.ledgerRow}>
      <View style={[styles.ledgerIcon, { backgroundColor: (income ? colors.green : colors.live) + "18" }]}>
        <Ionicons
          name={income ? "arrow-down-outline" : "arrow-up-outline"}
          size={14}
          color={income ? colors.green : colors.live}
        />
      </View>
      <View style={styles.ledgerBody}>
        <Text style={styles.ledgerType} numberOfLines={1}>
          {FINANCE_ENTRY_LABELS[entry.entryType] ?? entry.entryType}
        </Text>
        <Text style={styles.ledgerMeta} numberOfLines={1}>
          {formatDateShort(entry.createdAt)}
          {who ? ` · ${who}` : ""}
        </Text>
      </View>
      <Text style={[styles.ledgerAmount, { color: income ? colors.green : colors.live }]}>
        {income ? "+" : "−"}
        {formatMoney(entry.amount, entry.currency)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 3,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: colors.muted,
  },
  summaryValue: {
    ...type.subtitle,
    fontVariant: ["tabular-nums"],
  },
  ffpBanner: {
    flexDirection: "row",
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  ffpBody: {
    flex: 1,
    gap: 2,
  },
  ffpTitle: {
    ...type.small,
    fontWeight: "800",
  },
  ffpLine: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
    marginTop: spacing.sm,
  },
  emptyLedger: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    lineHeight: 16,
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  ledgerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ledgerBody: {
    flex: 1,
  },
  ledgerType: {
    ...type.small,
    fontWeight: "700",
    color: colors.line,
  },
  ledgerMeta: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  ledgerAmount: {
    ...type.small,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
});
