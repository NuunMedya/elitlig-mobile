/**
 * TAKIM FİNANSI & FİNANSAL FAIR PLAY — web /yonetim/takim-finans
 * (teamFinance/TeamFinanceAdmin.js).
 *
 * Takımların toplam kadro piyasa değeri, oyuncu satış gelirleri, alım
 * masrafları ve FFP sınır durumları. Özet: takım sayısı, toplam kadro
 * değeri, FFP uyarı/ihlal sayısı. Arama, FFP durumuna göre süzme ve (admin
 * için) şehir seçimi. Takıma dokununca ayrıntı: kadro, kasa hareketleri,
 * FFP sınır kullanımı.
 *
 *   team_finance.view   : görüntüleme
 *   team_finance.manage : FFP sınırları + elle kasa kaydı (ayrıntı ekranında)
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, SelectField, useAdminMutation } from "@/components/admin";
import { ToolStage } from "@/components/admin/tools/ToolKit";
import { Badge, GradientBar, TeamLogo, Touchable } from "@/components/ui";
import { FfpSettingsSheet } from "@/components/admin/accounting/TeamFinanceSheets";
import { hasAnyPermission } from "@/lib/admin/access";
import { listCities } from "@/lib/api/admin/accounting";
import {
  FFP_STATUS_LABELS,
  FFP_TONE,
  TEAM_FINANCE_PERMISSIONS,
  teamFinanceOverview,
  teamMoney,
  updateFfpSettings,
  type FfpStatus,
  type TeamFinanceRow,
} from "@/lib/api/admin/teamFinance";
import { formatEtl } from "@/lib/api/marketValue";
import { mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

type Filter = "all" | FfpStatus;

export default function TeamFinanceScreen() {
  const auth = useAuth();
  const router = useRouter();
  const isSuperAdmin = auth.user?.role === "admin";
  const canManage = hasAnyPermission(auth.user, ["team_finance.manage"]);
  const [cityId, setCityId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const query = useQuery({ queryKey: ["admin", "team-finance", "overview", cityId], queryFn: () => teamFinanceOverview({ cityId: cityId || null }) });
  const cities = useQuery({ queryKey: ["admin", "accounting", "cities"], queryFn: listCities, enabled: isSuperAdmin, staleTime: 10 * 60_000 });
  const teams = query.data?.teams || [];

  const stats = useMemo(
    () => ({
      count: teams.length,
      value: teams.reduce((n, t) => n + (Number(t.squadValue) || 0), 0),
      warning: teams.filter((t) => t.ffpStatus === "WARNING").length,
      breach: teams.filter((t) => t.ffpStatus === "BREACH").length,
    }),
    [teams]
  );
  const shown = useMemo(() => {
    const n = search.trim().toLocaleLowerCase("tr-TR");
    return teams.filter((t) => (filter === "all" || t.ffpStatus === filter) && (!n || (t.teamName || "").toLocaleLowerCase("tr-TR").includes(n)));
  }, [teams, search, filter]);

  const saveFfp = useAdminMutation(updateFfpSettings, { success: "FFP ayarları kaydedildi.", invalidate: [["admin", "team-finance"]], silentError: true });

  return (
    <AdminScreen
      title="Takım finansı ve FFP"
      subtitle="Kadro değeri, transfer gelir/gider, FFP"
      permission={TEAM_FINANCE_PERMISSIONS}
      scroll={false}
      actions={canManage ? [{ icon: "options-outline", accessibilityLabel: "FFP sınırları", onPress: () => setSettingsOpen(true) }] : undefined}
    >
      <AdminList<TeamFinanceRow>
        data={shown}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={query.refetch}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Takım ara…"
        filters={[
          { key: "all", label: "Tümü", count: teams.length },
          ...(["BREACH", "WARNING", "COMPLIANT", "DISABLED"] as FfpStatus[]).map((k) => ({ key: k, label: FFP_STATUS_LABELS[k], count: teams.filter((t) => t.ffpStatus === k).length })),
        ]}
        filter={filter}
        onFilter={(k) => setFilter(k as Filter)}
        extraHeader={
          <>
            {isSuperAdmin ? (
              <SelectField<string>
                label="Şehir"
                value={cityId}
                options={[{ value: "", label: "Tüm şehirler" }, ...(cities.data || []).map((c) => ({ value: String(c.id), label: c.city_name }))]}
                onChange={(v) => setCityId(v || "")}
              />
            ) : null}
            <ToolStage
              icon="shield-half"
              tone="gold"
              overline="Toplam kadro değeri"
              value={formatEtl(stats.value)}
              caption={query.data?.settings?.enabled ? `FFP açık · net harcama sınırı ${teamMoney(query.data.settings.maxNetSpend)}` : "FFP sınırı kapalı"}
              stats={[
                { label: "Takım", value: stats.count },
                { label: "Sınırda", value: stats.warning, tone: stats.warning ? "warn" : undefined, onPress: () => setFilter("WARNING") },
                { label: "İhlal", value: stats.breach, tone: stats.breach ? "danger" : undefined, onPress: () => setFilter("BREACH") },
              ]}
            />
          </>
        }
        summary={query.data ? `${shown.length} takım · transfer bonservisleri sözleşme yürürlüğe girince kasaya kendiliğinden işlenir` : null}
        keyExtractor={(t) => String(t.id)}
        emptyIcon="wallet-outline"
        emptyTitle="Takım bulunamadı"
        renderItem={({ item: t }) => (
          <TeamFinanceCard
            t={t}
            limit={query.data?.settings?.enabled ? query.data.settings.maxNetSpend : null}
            onPress={() => router.push({ pathname: "/yonetim/takim-finans/[id]", params: { id: String(t.id) } } as never)}
          />
        )}
      />
      <FfpSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} settings={query.data?.settings} onSubmit={(next) => saveFfp.mutateAsync(next)} />
    </AdminScreen>
  );
}

/** FFP renk degradesi: uyumlu nane, sınırda altın, ihlal kırmızı. */
const FFP_GRADIENT: Record<FfpStatus, readonly [string, string]> = {
  COMPLIANT: [colors.tileTones.mint[1], colors.tileTones.mint[0]],
  WARNING: [colors.tileTones.gold[1], colors.tileTones.gold[0]],
  BREACH: [colors.tileTones.red[1], colors.tileTones.red[0]],
  DISABLED: colors.tileTones.neutral,
};

/** Takım kartı: arma, ad, FFP durumu; gelir / gider / net harcama ve FFP sınır çubuğu. */
function TeamFinanceCard({ t, limit, onPress }: { t: TeamFinanceRow; limit: number | null; onPress: () => void }) {
  const usage = limit ? t.netSpend / limit : null;
  const tone = FFP_TONE[t.ffpStatus] || "neutral";
  return (
    <Touchable feedback="card" onPress={onPress} style={styles.card} accessibilityRole="button" accessibilityLabel={`${t.teamName}. ${FFP_STATUS_LABELS[t.ffpStatus]}. Net harcama ${teamMoney(t.netSpend)}`}>
      <View style={styles.head}>
        <TeamLogo name={t.teamName} logo={mediaUrl(t.logo)} size={44} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {t.teamName}
          </Text>
          <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
            {`${t.city || "—"} · ${t.playerCount || 0} oyuncu · ${t.squadValue != null ? formatEtl(t.squadValue) : "değer yok"}`}
          </Text>
        </View>
        <Badge label={FFP_STATUS_LABELS[t.ffpStatus] || t.ffpStatus} tone={tone} size="sm" />
      </View>
      <View style={styles.figures}>
        <Figure label="Satış geliri" value={teamMoney(t.income, "")} color={colors.win} />
        <Figure label="Alım gideri" value={teamMoney(t.expense, "")} color={colors.danger} />
        <Figure label="Net harcama" value={teamMoney(t.netSpend, "")} color={t.netSpend > 0 ? colors.textPrimary : colors.win} strong />
      </View>
      {usage != null ? (
        <View style={styles.usage}>
          <GradientBar value={Math.min(1, Math.max(0, usage))} height={6} gradient={FFP_GRADIENT[t.ffpStatus]} style={styles.flex} />
          <Text style={[styles.usageText, { color: usage > 1 ? colors.danger : colors.textSecondary }]} {...textScale.badge}>
            %{Math.round(usage * 100)} sınır
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
}

function Figure({ label, value, color, strong }: { label: string; value: string; color: string; strong?: boolean }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
      <Text style={[strong ? styles.figureStrong : styles.figureValue, { color }]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { ...type.h4, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textTertiary },
  figures: { flexDirection: "row", gap: space.xs },
  figure: { flex: 1, gap: 2, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  figureLabel: { ...type.nano, color: colors.textTertiary },
  figureValue: { ...type.numSmStrong },
  figureStrong: { ...type.tableNumStrong },
  usage: { flexDirection: "row", alignItems: "center", gap: space.sm },
  usageText: { ...type.labelXs },
});
