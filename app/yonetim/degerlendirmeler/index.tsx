/**
 * MAÇ DEĞERLENDİRMELERİ — personel ve sosyal medya performans denetimi.
 *
 * Web: pages/management/evaluations/MatchEvaluations.js. Sekmeler yetkiye
 * göre açılır:
 *   Genel Bakış         dönemin özeti, eksik formlar, sıralamalar (evaluations.view)
 *   Formlar             maç ve hafta formlarını doldurma (herkes)
 *   Personel Karnesi    kişi listesi → karne ekranı (evaluations.view)
 *   Karşılaştırma       iller / ligler / sezonlar endeksi (evaluations.view)
 *   Sorular ve Ücretler sorular, ağırlık, bonus / kesinti (evaluations.manage)
 *
 * Ortak süzgeçler (il, lig, sezon, dönem) başlık şeridindedir ve tüm
 * sekmeleri süzer; lig seçilince sezon listesi daralır, sezon seçilince ligi
 * de seçilir (web ile aynı kural).
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, OptionSheet } from "@/components/admin";
import { CompareTab } from "@/components/admin/evaluations/CompareTab";
import { FormsTab } from "@/components/admin/evaluations/FormsTab";
import { OverviewTab, StaffListTab } from "@/components/admin/evaluations/OverviewTab";
import { QuestionsTab } from "@/components/admin/evaluations/QuestionsTab";
import { Chip, ChipGroup, Tabs, type TabItem } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import {
  FALLBACK_AREAS,
  getCityOptions,
  getCompetitionOptions,
  getEvalMeta,
  PERIOD_PRESETS,
  presetRange,
  type PeriodKey,
} from "@/lib/api/admin/evaluations";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["evaluations.view", "evaluations.submit", "evaluations.manage"] as const;

type TabKey = "overview" | "forms" | "staff" | "compare" | "questions";

export default function EvaluationsScreen() {
  const auth = useAuth();
  const canView = hasAnyPermission(auth.user, ["evaluations.view"]);
  const canSubmit = hasAnyPermission(auth.user, ["evaluations.submit"]);
  const canManage = hasAnyPermission(auth.user, ["evaluations.manage"]);

  const [tab, setTab] = useState<TabKey>(canView ? "overview" : "forms");
  const [period, setPeriod] = useState<PeriodKey>("30");
  const [cityId, setCityId] = useState("");
  const [leagueId, setLeagueId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [sheet, setSheet] = useState<null | "period" | "city" | "league" | "season">(null);

  const meta = useQuery({ queryKey: ["admin", "evaluations", "meta"], queryFn: getEvalMeta, staleTime: 300_000 });
  const cities = useQuery({ queryKey: ["admin", "evaluations", "cityOptions"], queryFn: getCityOptions, staleTime: 300_000 });
  const competitions = useQuery({
    queryKey: ["admin", "evaluations", "competitionOptions", cityId],
    queryFn: () => getCompetitionOptions(cityId),
    staleTime: 120_000,
  });

  const areas = meta.data?.areas?.length ? meta.data.areas : FALLBACK_AREAS;
  const nationwide = Boolean(cities.data?.nationwide);
  const cityItems = cities.data?.items ?? [];
  const showCityPicker = nationwide && cityItems.length > 1;
  const cityName = cityItems.find((c) => String(c.id) === cityId)?.name ?? null;
  const leagues = competitions.data?.leagues ?? [];
  const seasons = (competitions.data?.seasons ?? []).filter((s) => !leagueId || String(s.leagueId) === leagueId);
  const league = leagues.find((l) => String(l.id) === leagueId) ?? null;
  const season = (competitions.data?.seasons ?? []).find((s) => String(s.id) === seasonId) ?? null;

  const range = useMemo(() => presetRange(period), [period]);
  const scope = useMemo(() => ({ cityId, leagueId, seasonId }), [cityId, leagueId, seasonId]);

  const pickLeague = (id: string) => {
    setLeagueId(id);
    // Lig değişince o lige ait olmayan sezon seçimi kalkar.
    const own = (competitions.data?.seasons ?? []).some((s) => String(s.id) === seasonId && String(s.leagueId) === id);
    if (!own) setSeasonId("");
  };
  const pickSeason = (id: string) => {
    setSeasonId(id);
    const owner = (competitions.data?.seasons ?? []).find((s) => String(s.id) === id)?.leagueId;
    if (owner) setLeagueId(String(owner));
  };
  const pickCity = (id: string) => {
    setCityId(id);
    setLeagueId("");
    setSeasonId("");
  };

  const tabs: TabItem<TabKey>[] = [
    ...(canView ? [{ key: "overview" as const, label: "Genel Bakış" }] : []),
    { key: "forms", label: "Formlar" },
    ...(canView ? [{ key: "staff" as const, label: "Personel Karnesi" }, { key: "compare" as const, label: "Karşılaştırma" }] : []),
    ...(canManage ? [{ key: "questions" as const, label: "Sorular ve Ücretler" }] : []),
  ];
  const activeTab = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;
  const reportTab = activeTab === "overview" || activeTab === "staff" || activeTab === "compare";
  const filterLabels = [cityName, league?.name, season?.name].filter(Boolean);

  const filters = (
    <ChipGroup scrollable contentPadding={0}>
      {reportTab ? (
        <Chip size="sm" icon="calendar-outline" label={PERIOD_PRESETS.find((p) => p.key === period)?.label ?? "Dönem"} onPress={() => setSheet("period")} />
      ) : null}
      {showCityPicker ? (
        <Chip size="sm" icon="location-outline" label={cityName ?? "Tüm iller"} selected={Boolean(cityId)} onPress={() => setSheet("city")} onDismiss={cityId ? () => pickCity("") : undefined} />
      ) : null}
      {leagues.length ? (
        <Chip size="sm" icon="trophy-outline" label={league?.name ?? "Tüm ligler"} selected={Boolean(leagueId)} onPress={() => setSheet("league")} onDismiss={leagueId ? () => pickLeague("") : undefined} />
      ) : null}
      {seasons.length || seasonId ? (
        <Chip size="sm" icon="albums-outline" label={season?.name ?? "Tüm sezonlar"} selected={Boolean(seasonId)} onPress={() => setSheet("season")} onDismiss={seasonId ? () => setSeasonId("") : undefined} />
      ) : null}
    </ChipGroup>
  );

  return (
    <AdminScreen
      title="Maç değerlendirmeleri"
      subtitle="Personel ve sosyal medya performans formları"
      permission={PERMS}
      bottom={tabs.length > 1 ? <Tabs<TabKey> items={tabs} value={activeTab} onChange={setTab} distribute="scroll" /> : undefined}
    >
      {activeTab !== "questions" ? filters : null}
      {filterLabels.length && activeTab !== "questions" ? (
        <Text style={styles.filterNote} {...textScale.long}>
          Tüm sekmeler süzülüyor: {filterLabels.join(" · ")}
          {leagueId || seasonId ? ` · yalnız bu ${seasonId ? "sezonun" : "ligin"} maç formları sayılır.` : ""}
        </Text>
      ) : null}

      <View style={styles.body}>
        {activeTab === "overview" ? (
          <OverviewTab range={range} scope={scope} areas={areas} cityName={cityName} canSubmit={canSubmit} onGoForms={() => setTab("forms")} />
        ) : null}
        {activeTab === "forms" ? <FormsTab scope={scope} cityName={cityName} showCity={showCityPicker && !cityId} nationwide={showCityPicker} /> : null}
        {activeTab === "staff" ? <StaffListTab range={range} scope={scope} areas={areas} canSubmit={canSubmit} /> : null}
        {activeTab === "compare" ? (
          <CompareTab
            range={range}
            scope={scope}
            nationwide={nationwide}
            onOpenCity={(id) => {
              pickCity(id);
              setTab("overview");
            }}
            onOpenLeague={(id) => {
              pickLeague(id);
              setTab("overview");
            }}
            onOpenSeason={(id) => {
              pickSeason(id);
              setTab("overview");
            }}
          />
        ) : null}
        {activeTab === "questions" ? <QuestionsTab areas={areas} /> : null}
      </View>

      <OptionSheet<string>
        visible={sheet === "period"}
        onClose={() => setSheet(null)}
        title="Dönem"
        options={PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
        value={period}
        onSelect={(v) => {
          if (v) setPeriod(v as PeriodKey);
          setSheet(null);
        }}
      />
      <OptionSheet<string>
        visible={sheet === "city"}
        onClose={() => setSheet(null)}
        title="İl"
        searchable
        clearable
        options={cityItems.map((c) => ({ value: String(c.id), label: c.name }))}
        value={cityId || null}
        onSelect={(v) => {
          pickCity((v as string | null) ?? "");
          setSheet(null);
        }}
      />
      <OptionSheet<string>
        visible={sheet === "league"}
        onClose={() => setSheet(null)}
        title="Lig"
        searchable
        clearable
        options={leagues.map((l) => ({
          value: String(l.id),
          label: `${l.name}${l.archived ? " (arşiv)" : ""}`,
          hint: showCityPicker && !cityId ? l.city : null,
        }))}
        value={leagueId || null}
        onSelect={(v) => {
          pickLeague((v as string | null) ?? "");
          setSheet(null);
        }}
      />
      <OptionSheet<string>
        visible={sheet === "season"}
        onClose={() => setSheet(null)}
        title="Sezon"
        searchable
        clearable
        options={seasons.map((s) => ({ value: String(s.id), label: `${s.name}${s.archived ? " (arşiv)" : ""}`, hint: leagueId ? null : s.leagueName }))}
        value={seasonId || null}
        onSelect={(v) => {
          pickSeason((v as string | null) ?? "");
          setSheet(null);
        }}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  filterNote: { ...type.caption, color: colors.textSecondary },
});
