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

import { AdminList, AdminScreen, RecordCard, SelectField, StatRow, useAdminMutation } from "@/components/admin";
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
import { useAuth } from "@/providers/AuthProvider";

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
            <StatRow
              items={[
                { label: "Takım", value: stats.count },
                { label: "Toplam kadro değeri", value: formatEtl(stats.value) },
                { label: "FFP uyarı / ihlal", value: stats.warning + stats.breach, tone: stats.warning + stats.breach > 0 ? "danger" : undefined },
              ]}
            />
          </>
        }
        summary={query.data ? `${shown.length} takım · transfer bonservisleri sözleşme yürürlüğe girince kasaya kendiliğinden işlenir` : null}
        keyExtractor={(t) => String(t.id)}
        emptyIcon="wallet-outline"
        emptyTitle="Takım bulunamadı"
        renderItem={({ item: t }) => (
          <RecordCard
            title={t.teamName}
            subtitle={`${t.city || "—"} · ${t.playerCount || 0} oyuncu · ${t.squadValue != null ? formatEtl(t.squadValue) : "değer yok"}`}
            meta={`Gelir ${teamMoney(t.income)} · Gider ${teamMoney(t.expense)}`}
            avatar={{ name: t.teamName, image: t.logo }}
            badges={[{ label: FFP_STATUS_LABELS[t.ffpStatus] || t.ffpStatus, tone: FFP_TONE[t.ffpStatus] || "neutral" }]}
            onPress={() => router.push({ pathname: "/yonetim/takim-finans/[id]", params: { id: String(t.id) } } as never)}
          />
        )}
      />
      <FfpSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} settings={query.data?.settings} onSubmit={(next) => saveFfp.mutateAsync(next)} />
    </AdminScreen>
  );
}
