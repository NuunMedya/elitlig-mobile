/**
 * KADROLAR — web editor_pages/rosters/RostersPage.js.
 *
 * Takımların yönetime gönderdiği iki tür kadro talebi tek listede:
 *   Sezon kadrosu — taslak; onayda fark aktif kadroya işlenir.
 *   Kadro listesi — "Tüm Oyuncularım" listesi; çıkarma / transfer kalemleri
 *                   tek tek karara bağlanır.
 * Bölümler: onay bekleyenler (sayılı) ve tüm kadro listeleri (durum
 * süzgeçli). Süzgeçler: tür, il, lig, sezon, takım araması. ?taslak=<no> ile
 * bildirim / takım profilinden doğrudan taslak açılır.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AdminList, AdminScreen, RecordCard, SelectField } from "@/components/admin";
import { DraftReviewSheet } from "@/components/admin/team/DraftReviewSheet";
import { SubmissionReviewSheet } from "@/components/admin/team/SubmissionReviewSheet";
import { SegmentedControl, TeamLogo } from "@/components/ui";
import { formatDate } from "@/lib/admin/format";
import { foldText } from "@/lib/api/admin/lookups";
import {
  ROW_STATUS_LABELS,
  draftRow,
  listRosterDrafts,
  listRosterSubmissions,
  rowSummary,
  statusMatches,
  submissionRow,
  type RosterRow,
} from "@/lib/api/admin/rosters";
import { space } from "@/theme";

const PERMS = ["roster_rules.requests"];
const KEY = ["admin", "rosters"] as const;
type Section = "bekleyen" | "tumu";

const uniq = (list: ({ id: number; name: string } | null)[]) =>
  [...new Map(list.filter(Boolean).map((x) => [String(x!.id), x!])).values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));

export default function RostersScreen() {
  const params = useLocalSearchParams<{ taslak?: string; liste?: string }>();
  const [section, setSection] = useState<Section>(params.taslak || params.liste ? "tumu" : "bekleyen");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("all");
  const [city, setCity] = useState<string | null>(null);
  const [league, setLeague] = useState<number | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [openDraft, setOpenDraft] = useState<number | null>(params.taslak ? Number(params.taslak) : null);
  const [openList, setOpenList] = useState<number | null>(params.liste ? Number(params.liste) : null);

  const apiStatus = section === "bekleyen" ? "submitted" : "all";
  const drafts = useQuery({ queryKey: [...KEY, "drafts", apiStatus], queryFn: () => listRosterDrafts(apiStatus) });
  const lists = useQuery({ queryKey: [...KEY, "lists", apiStatus], queryFn: () => listRosterSubmissions(apiStatus) });

  const rows = useMemo(
    () => [...(drafts.data ?? []).map(draftRow), ...(lists.data ?? []).map(submissionRow)].filter((r) => r.status),
    [drafts.data, lists.data]
  );
  const cities = useMemo(() => [...new Set(rows.map((r) => r.team.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [rows]);
  const leagues = useMemo(() => uniq(rows.map((r) => r.league)), [rows]);
  const seasons = useMemo(() => uniq(rows.map((r) => r.season)), [rows]);

  const visible = useMemo(() => {
    const needle = foldText(q);
    const time = (v: string | null) => (v ? new Date(v).getTime() || 0 : 0);
    return rows
      .filter((r) => statusMatches(r, section === "bekleyen" ? "pending" : status))
      .filter((r) => !kind || r.kind === kind)
      .filter((r) => !city || foldText(r.team.city) === foldText(city))
      .filter((r) => !league || r.league?.id === league)
      .filter((r) => !season || r.season?.id === season)
      .filter((r) => !needle || foldText(`${r.team.name} ${r.team.city} ${r.season?.name ?? ""} ${r.league?.name ?? ""}`).includes(needle))
      .sort((a, b) => (a.status === "pending") !== (b.status === "pending") ? (a.status === "pending" ? -1 : 1) : time(b.at) - time(a.at));
  }, [rows, section, status, kind, city, league, season, q]);

  const pending = rows.filter((r) => r.status === "pending");
  const draftOpen = openDraft != null ? (drafts.data ?? []).find((d) => d.id === openDraft) ?? null : null;

  // Bağlantıyla gelen taslak bekleyenlerde yoksa (sonuçlanmış) tüm listeye geçilir.
  useEffect(() => {
    if (openDraft != null && drafts.data && !draftOpen && section === "bekleyen") setSection("tumu");
  }, [openDraft, drafts.data, draftOpen, section]);

  const refetch = () => {
    void drafts.refetch();
    void lists.refetch();
  };

  const open = (row: RosterRow) => (row.kind === "sezon" ? setOpenDraft(row.id) : setOpenList(row.id));

  return (
    <AdminScreen
      title="Kadrolar"
      subtitle={`${pending.length} onay bekliyor`}
      permission={PERMS}
      scroll={false}
      bottom={
        <SegmentedControl<Section>
          items={[
            { key: "bekleyen", label: `Onay bekleyenler ${pending.length}`, dot: pending.length > 0 },
            { key: "tumu", label: "Tüm kadro listeleri" },
          ]}
          value={section}
          onChange={setSection}
          stretch
          size="sm"
        />
      }
    >
      <AdminList
        data={visible}
        loading={(drafts.isLoading || lists.isLoading) && !rows.length}
        error={drafts.error ?? lists.error}
        onRetry={refetch}
        refreshing={drafts.isRefetching || lists.isRefetching}
        onRefresh={refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Takım, il ya da sezon ara"
        filters={[
          { key: "", label: "Tümü" },
          { key: "sezon", label: "Sezon kadrosu", count: pending.filter((r) => r.kind === "sezon").length },
          { key: "liste", label: "Kadro listesi", count: pending.filter((r) => r.kind === "liste").length },
        ]}
        filter={kind}
        onFilter={setKind}
        extraHeader={
          <View style={styles.filters}>
            {section === "tumu" ? (
              <View style={styles.filter}>
                <SelectField<string>
                  value={status}
                  onChange={(v) => setStatus(v ?? "all")}
                  options={[
                    { value: "all", label: "Tüm durumlar" },
                    { value: "pending", label: "Bekleyen" },
                    { value: "approved", label: "Onaylı" },
                    { value: "rejected", label: "Reddedilen" },
                  ]}
                  icon="funnel-outline"
                  sheetTitle="Durum"
                />
              </View>
            ) : null}
            {cities.length > 1 ? (
              <View style={styles.filter}>
                <SelectField<string> value={city} onChange={setCity} options={cities.map((c) => ({ value: c, label: c }))} placeholder="Tüm iller" icon="location-outline" clearable sheetTitle="İl" />
              </View>
            ) : null}
            {kind !== "liste" && leagues.length ? (
              <View style={styles.filter}>
                <SelectField<number> value={league} onChange={setLeague} options={leagues.map((l) => ({ value: l.id, label: l.name }))} placeholder="Tüm ligler" icon="trophy-outline" clearable sheetTitle="Lig" />
              </View>
            ) : null}
            {kind !== "liste" && seasons.length ? (
              <View style={styles.filter}>
                <SelectField<number> value={season} onChange={setSeason} options={seasons.map((s) => ({ value: s.id, label: s.name }))} placeholder="Tüm sezonlar" icon="calendar-outline" clearable sheetTitle="Sezon" />
              </View>
            ) : null}
          </View>
        }
        summary={
          (league || season) && kind !== "sezon"
            ? `${visible.length} kayıt · kadro listeleri sezona bağlı değildir; lig/sezon seçiliyken yalnız sezon kadrosu taslakları görünür`
            : `${visible.length} kayıt`
        }
        keyExtractor={(r) => r.key}
        emptyIcon={section === "bekleyen" ? "checkmark-done-outline" : "funnel-outline"}
        emptyTitle={section === "bekleyen" ? "Onay bekleyen kadro yok" : "Bu süzgeçte kayıt yok"}
        emptyBody={section === "bekleyen" ? "Takımlar yeni kadro gönderince burada görünür." : "Süzgeçleri değiştir ya da temizle."}
        emptyAction={section === "bekleyen" ? { label: "Tüm kadro listelerini gör", onPress: () => setSection("tumu") } : undefined}
        renderItem={({ item }) => (
          <RecordCard
            title={item.team.name}
            subtitle={[item.team.city, item.league?.name, item.season?.name].filter(Boolean).join(" · ") || "—"}
            meta={`${rowSummary(item)}${item.problems ? ` · ${item.problems} kural hatası` : ""}${item.at ? ` · ${formatDate(item.at)}` : ""}`}
            trailing={<TeamLogo name={item.team.name} logo={item.team.logo} size={32} />}
            badges={[
              { label: item.kind === "sezon" ? "Sezon kadrosu" : "Kadro listesi", icon: item.kind === "sezon" ? "people-outline" : "list-outline" },
              item.status && {
                label: ROW_STATUS_LABELS[item.status],
                tone: item.status === "pending" ? "warn" : item.status === "rejected" ? "danger" : "win",
              },
              item.problems > 0 && { label: "Kural hatası", tone: "danger" },
            ]}
            onPress={() => open(item)}
          />
        )}
      />

      <DraftReviewSheet draft={draftOpen} onClose={() => setOpenDraft(null)} invalidate={[KEY]} />
      <SubmissionReviewSheet id={openList} onClose={() => setOpenList(null)} invalidate={[KEY]} />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  filter: { flexGrow: 1, flexBasis: 140 },
});
