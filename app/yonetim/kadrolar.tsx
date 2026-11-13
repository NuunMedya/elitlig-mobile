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

import { AdminList, AdminScreen } from "@/components/admin";
import { CountStrip, PickerChip, RequestCard } from "@/components/admin/team/ManageKit";
import { DraftReviewSheet } from "@/components/admin/team/DraftReviewSheet";
import { SubmissionReviewSheet } from "@/components/admin/team/SubmissionReviewSheet";
import { Badge, Button, Chip, ChipGroup, SegmentedControl, TeamLogo } from "@/components/ui";
import { timeAgo } from "@/lib/admin/format";
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
            { key: "bekleyen", label: "Onay bekleyenler", dot: pending.length > 0 },
            { key: "tumu", label: "Tüm kayıtlar" },
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
        extraHeader={
          <View style={styles.head}>
            <CountStrip
              items={[
                { key: "sezon", label: "Sezon", value: pending.filter((r) => r.kind === "sezon").length, icon: "people", selected: kind === "sezon", onPress: () => setKind(kind === "sezon" ? "" : "sezon") },
                { key: "liste", label: "Liste", value: pending.filter((r) => r.kind === "liste").length, icon: "list", selected: kind === "liste", onPress: () => setKind(kind === "liste" ? "" : "liste") },
                { key: "problems", label: "Hatalı", value: pending.filter((r) => r.problems > 0).length, tone: "danger", icon: "alert-circle" },
              ]}
            />
            <ChipGroup scrollable contentPadding={0}>
              <Chip label="Tüm türler" size="sm" selected={!kind} onPress={() => setKind("")} />
              {section === "tumu" ? (
                <PickerChip<string>
                  icon="funnel-outline"
                  placeholder="Durum"
                  title="Durum"
                  value={status === "all" ? null : status}
                  onChange={(v) => setStatus(v ?? "all")}
                  options={[
                    { value: "pending", label: "Bekleyen" },
                    { value: "approved", label: "Onaylı" },
                    { value: "rejected", label: "Reddedilen" },
                  ]}
                />
              ) : null}
              {cities.length > 1 ? (
                <PickerChip<string> icon="location-outline" placeholder="İl" title="İl" value={city} onChange={setCity} options={cities.map((c) => ({ value: c, label: c }))} />
              ) : null}
              {kind !== "liste" && leagues.length ? (
                <PickerChip<number> icon="trophy-outline" placeholder="Lig" title="Lig" value={league} onChange={setLeague} options={leagues.map((l) => ({ value: l.id, label: l.name }))} />
              ) : null}
              {kind !== "liste" && seasons.length ? (
                <PickerChip<number> icon="calendar-outline" placeholder="Sezon" title="Sezon" value={season} onChange={setSeason} options={seasons.map((x) => ({ value: x.id, label: x.name }))} />
              ) : null}
            </ChipGroup>
          </View>
        }
        summary={
          (league || season) && kind !== "sezon"
            ? `${visible.length} kayıt · lig/sezon seçiliyken yalnız sezon kadrosu taslakları görünür`
            : `${visible.length} kayıt`
        }
        keyExtractor={(r) => r.key}
        emptyIcon={section === "bekleyen" ? "checkmark-done-outline" : "funnel-outline"}
        emptyTitle={section === "bekleyen" ? "Onay bekleyen kadro yok" : "Bu süzgeçte kayıt yok"}
        emptyBody={section === "bekleyen" ? "Takımlar yeni kadro gönderince burada görünür." : "Süzgeçleri değiştir ya da temizle."}
        emptyAction={section === "bekleyen" ? { label: "Tüm kadro listelerini gör", onPress: () => setSection("tumu") } : undefined}
        renderItem={({ item }) => {
          const isPending = item.status === "pending";
          const tone = item.status === "pending" ? "warn" : item.status === "rejected" ? "danger" : "win";
          return (
            <RequestCard
              leading={<TeamLogo name={item.team.name} logo={item.team.logo} size={42} />}
              who={item.team.name}
              when={[item.at ? timeAgo(item.at) : null, item.team.city].filter(Boolean).join(" · ")}
              priority={isPending ? (item.problems ? { label: `${item.problems} kural hatası`, tone: "danger", icon: "alert-circle" } : { label: "Onay bekliyor", tone: "warn", icon: "hourglass" }) : null}
              status={isPending || !item.status ? null : { label: ROW_STATUS_LABELS[item.status], tone }}
              title={item.kind === "sezon" ? "Sezon kadrosu taslağı" : "Kadro listesi (Tüm Oyuncularım)"}
              subtitle={[item.league?.name, item.season?.name].filter(Boolean).join(" · ") || null}
              onPress={() => open(item)}
              done={!isPending}
              extraActions={isPending ? <Button label="Kadroyu incele" icon="search" variant="secondary" onPress={() => open(item)} style={styles.grow} /> : null}
            >
              <View style={styles.deltas}>
                {item.counts.add ? <Badge label={`+${item.counts.add} ${item.kind === "liste" ? "transfer" : "ekleme"}`} tone="win" size="sm" /> : null}
                {item.counts.remove ? <Badge label={`−${item.counts.remove} çıkarma`} tone="danger" size="sm" /> : null}
                {item.counts.license ? <Badge label={`${item.counts.license} lisans`} tone="info" icon="id-card-outline" size="sm" /> : null}
                {item.kind === "liste" && item.counts.players ? <Badge label={`${item.counts.players} oyuncu`} size="sm" /> : null}
                {!item.counts.add && !item.counts.remove && !item.counts.license ? <Badge label={rowSummary(item)} size="sm" /> : null}
              </View>
            </RequestCard>
          );
        }}
      />

      <DraftReviewSheet draft={draftOpen} onClose={() => setOpenDraft(null)} invalidate={[KEY]} />
      <SubmissionReviewSheet id={openList} onClose={() => setOpenList(null)} invalidate={[KEY]} />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.md },
  grow: { flex: 1 },
  deltas: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xxs },
});
