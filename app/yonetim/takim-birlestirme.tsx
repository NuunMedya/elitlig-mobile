/**
 * TAKIM BİRLEŞTİRME — web pages/management/TeamMergeCenter.js.
 *
 *   1) Bul       adı aynı ya da benzer takım grupları; isim benzerliği olmayan
 *                takım elle de eklenebilir.
 *   2) Seç       grup karşılaştırmaya açılır; HİÇBİR TAKIM SEÇİLİ GELMEZ.
 *   3) Çöz       asıl takım ve çakışan her alan (ad, logo, il, renkler…) için
 *                hangi takımın bilgisinin geçerli olacağı seçilir.
 *   4) Birleştir oyuncular, maçlar, istatistikler, puan durumu, sezon
 *                kadroları, takipçiler ve yöneticiler asıl takıma aktarılır.
 *   5) Geri al   Geçmiş sekmesinden; birleşen takımlar eski kimlikleriyle döner.
 *
 * Birbiriyle maç yapmış takımlar farklı takımdır: o gruplar varsayılan olarak
 * gizlenir ve birleştirme kilitlenir. "Yoksay" seçimi bu cihazda hatırlanır.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AdminList,
  AdminScreen,
  InfoLine,
  Panel,
  RecordCard,
  SelectField,
  confirmAction,
  useAdminMutation,
} from "@/components/admin";
import { ConflictList, MergeHistory, confirmUndo } from "@/components/admin/team/MergeParts";
import { BottomSheet, Button, Chip, ChipGroup, EmptyState, ErrorState, SegmentedControl, SkeletonCard, TeamLogo } from "@/components/ui";
import { formatDate } from "@/lib/admin/format";
import { teamOptionsLoader } from "@/lib/api/admin/lookups";
import {
  TEAM_COUNT_LABELS,
  TEAM_MERGE_RULES,
  executeTeamMerge,
  getTeamMergeGroups,
  getTeamMergeHistory,
  previewTeamMerge,
  undoTeamMerge,
  unresolvedConflicts,
  type MergeHistoryRow,
  type TeamMergeChoices,
  type TeamMergeGroup,
} from "@/lib/api/admin/merge";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["teams.merge"];
const KEY = ["admin", "team-merge"] as const;
const IGNORED_KEY = "elitlig.teamMerge.ignoredGroups";
type Tab = "merge" | "history";
type WorkTeam = TeamMergeGroup["teams"][number] | { id: number; team_name: string; logo?: string | null; city?: string | null; roster_size?: number; match_count?: number; last_match?: string | null };

export default function TeamMergeScreen() {
  const auth = useAuth();
  const user = auth.user;
  const [tab, setTab] = useState<Tab>("merge");
  const [rules, setRules] = useState(TEAM_MERGE_RULES.map((r) => r.key));
  const [q, setQ] = useState("");
  const [hideBlocked, setHideBlocked] = useState(true);
  const [showIgnored, setShowIgnored] = useState(false);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [workspace, setWorkspace] = useState<WorkTeam[] | null>(null);
  const [included, setIncluded] = useState<number[]>([]);
  const [choices, setChoices] = useState<TeamMergeChoices>({ targetId: null, fields: {} });

  useEffect(() => {
    AsyncStorage.getItem(IGNORED_KEY)
      .then((raw) => setIgnored(raw ? (JSON.parse(raw) as string[]).map(String) : []))
      .catch(() => setIgnored([]));
  }, []);
  const toggleIgnore = (key: string) =>
    setIgnored((list) => {
      const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
      AsyncStorage.setItem(IGNORED_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });

  const groups = useQuery({ queryKey: [...KEY, "groups", rules.join(","), q], queryFn: () => getTeamMergeGroups(rules, q), enabled: tab === "merge" });
  const history = useQuery({ queryKey: [...KEY, "history"], queryFn: getTeamMergeHistory, enabled: tab === "history" });

  const visible = useMemo(
    () =>
      (groups.data ?? [])
        .filter((g) => showIgnored || !ignored.includes(String(g.key)))
        .filter((g) => !hideBlocked || !(g.played_each_other > 0))
        .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0) || b.teams.length - a.teams.length),
    [groups.data, ignored, showIgnored, hideBlocked]
  );
  const blockedCount = (groups.data ?? []).filter((g) => g.played_each_other > 0 && !ignored.includes(String(g.key))).length;

  const sortedIds = [...included].sort((a, b) => a - b).join(",");
  const preview = useQuery({
    queryKey: [...KEY, "preview", sortedIds],
    queryFn: () => previewTeamMerge(included),
    enabled: included.length >= 2,
  });

  // Karşılaştırma gelince asıl takım en çok maç yapan olur; alan seçimleri sıfırlanır.
  useEffect(() => {
    const view = preview.data;
    if (!view?.profiles?.length) return;
    const target = [...view.profiles].sort((a, b) => b.stats.matches - a.stats.matches || b.stats.players - a.stats.players)[0];
    setChoices({ targetId: target.id, fields: {} });
  }, [preview.data]);

  const merge = useAdminMutation(() => executeTeamMerge(included, choices), {
    success: (r) =>
      r?.standings_failed?.length
        ? `${r.message} Bazı puan durumları yeniden hesaplanamadı; Puan durumu ekranından yenile.`
        : r?.message || "Takımlar birleştirildi.",
    invalidate: [KEY, ["admin", "teams"]],
    onSuccess: () => {
      setWorkspace((w) => (w ?? []).filter((t) => t.id === choices.targetId || !included.includes(t.id)));
      setIncluded([]);
    },
  });

  const undo = useAdminMutation((m: MergeHistoryRow) => undoTeamMerge(m.id), {
    success: (r) => r?.message || "Birleştirme geri alındı.",
    invalidate: [KEY, ["admin", "teams"]],
  });

  const view = included.length >= 2 ? preview.data : undefined;
  const blocked = Boolean(view?.shared_matches?.length);
  const unresolved = view ? unresolvedConflicts(view.conflicts, choices.fields) : [];
  const nameOf = (id: number) => view?.profiles.find((p) => p.id === id)?.fields.team_name ?? `#${id}`;
  const target = view?.profiles.find((p) => p.id === choices.targetId);
  const others = view?.profiles.filter((p) => p.id !== choices.targetId) ?? [];

  const askMerge = async () => {
    if (!target) return;
    const ok = await confirmAction({
      title: "Takımlar birleştirilsin mi?",
      message: `${others.map((p) => `“${p.fields.team_name}” (#${p.id})`).join(", ")} → asıl takım “${target.fields.team_name}” (#${target.id})\n\nOyuncular, kadro bağları, maçlar, istatistikler, puan durumu, sezon kadroları, takipçiler ve yöneticiler asıl takıma aktarılır; diğer takımlar silinir. Puan durumu yeniden hesaplanır. Geçmiş sekmesinden geri alınabilir.`,
      confirmLabel: "Birleştir",
      destructive: true,
    });
    if (ok) merge.mutate(undefined);
  };

  const pick = (field: string, id: number | null) => setChoices((c) => ({ ...c, fields: { ...c.fields, [field]: id } }));
  const acceptTarget = () =>
    setChoices((c) => {
      const fields = { ...c.fields };
      unresolved.forEach((x) => {
        fields[x.field] = (x.options.find((o) => o.team_id === c.targetId) ?? x.options[0]).team_id;
      });
      return { ...c, fields };
    });

  const openWorkspace = (teams: WorkTeam[]) => {
    setWorkspace(teams);
    setIncluded([]);
    setChoices({ targetId: null, fields: {} });
  };

  return (
    <AdminScreen
      title="Takım birleştirme"
      permission={PERMS}
      scroll={tab === "history"}
      onRefresh={tab === "history" ? history.refetch : undefined}
      refreshing={history.isRefetching}
      bottom={
        <SegmentedControl<Tab>
          items={[
            { key: "merge", label: "Birleştir" },
            { key: "history", label: "Geçmiş" },
          ]}
          value={tab}
          onChange={setTab}
          stretch
          size="sm"
        />
      }
    >
      {tab === "history" ? (
        <MergeHistory
          kind="team"
          merges={history.data ?? []}
          loading={history.isLoading}
          error={history.error}
          onRetry={history.refetch}
          busy={undo.isPending}
          countLabels={TEAM_COUNT_LABELS}
          onUndo={(m) => void confirmUndo(m.sources.map((s) => `“${s.team_name}”`).join(", "), "team").then((ok) => ok && undo.mutate(m))}
        />
      ) : (
        <AdminList
          data={visible}
          loading={groups.isLoading}
          error={groups.error}
          onRetry={groups.refetch}
          refreshing={groups.isRefetching}
          onRefresh={groups.refetch}
          search={q}
          onSearch={setQ}
          searchPlaceholder="Takım adında ara"
          extraHeader={
            <View style={styles.stack}>
              <ChipGroup scrollable contentPadding={0}>
                {TEAM_MERGE_RULES.map((r) => (
                  <Chip
                    key={r.key}
                    label={r.label}
                    size="sm"
                    selected={rules.includes(r.key)}
                    onPress={() =>
                      setRules((list) => {
                        const next = list.includes(r.key) ? list.filter((k) => k !== r.key) : [...list, r.key];
                        return next.length ? next : list;
                      })
                    }
                  />
                ))}
                <Chip label={`Birbiriyle oynamışları gizle${blockedCount ? ` (${blockedCount})` : ""}`} size="sm" selected={hideBlocked} onPress={() => setHideBlocked((v) => !v)} />
                <Chip label={`Yoksayılanlar${ignored.length ? ` (${ignored.length})` : ""}`} size="sm" selected={showIgnored} onPress={() => setShowIgnored((v) => !v)} />
              </ChipGroup>
              <Button label="Elle karşılaştır" icon="add" variant="secondary" size="sm" onPress={() => openWorkspace([])} />
            </View>
          }
          summary={`${visible.length} benzer grup · grubu yoksaymak için basılı tut`}
          keyExtractor={(g) => g.key}
          emptyIcon="git-merge-outline"
          emptyTitle="Benzer takım grubu yok"
          emptyBody="Süzgeçleri değiştir ya da elle karşılaştır."
          renderItem={({ item }) => {
            const matches = item.teams.reduce((n, t) => n + (t.match_count || 0), 0);
            const isIgnored = ignored.includes(String(item.key));
            return (
              <RecordCard
                title={item.teams.map((t) => t.team_name).slice(0, 3).join(" · ")}
                subtitle={item.teams.map((t) => [t.city, `${t.roster_size} oyuncu`, `${t.match_count} maç`].filter(Boolean).join(", ")).slice(0, 3).join(" | ")}
                meta={`${item.teams.length} takım · ${matches} maç${item.teams.length > 3 ? ` · +${item.teams.length - 3} takım` : ""}`}
                icon="git-merge-outline"
                iconTone={item.played_each_other ? "danger" : "brand"}
                muted={isIgnored}
                badges={[
                  ...item.reasons.map((r) => ({ label: TEAM_MERGE_RULES.find((x) => x.key === r)?.label ?? r })),
                  item.played_each_other > 0 && { label: `Birbiriyle ${item.played_each_other} maç`, tone: "danger" as const, icon: "ban-outline" as const },
                  isIgnored && { label: "Yoksayıldı" },
                ]}
                onPress={() => openWorkspace(item.teams)}
                onLongPress={() => toggleIgnore(String(item.key))}
              />
            );
          }}
        />
      )}

      <BottomSheet
        visible={workspace != null}
        onClose={() => setWorkspace(null)}
        title="Karşılaştır ve seç"
        snap="full"
        footer={
          view ? (
            <Button
              label={
                blocked
                  ? "Birbiriyle maç yapmışlar"
                  : unresolved.length
                    ? `${unresolved.length} alanda seçim gerekli`
                    : `${included.length} takımı birleştir`
              }
              icon="git-merge-outline"
              variant="danger"
              onPress={() => void askMerge()}
              disabled={blocked || unresolved.length > 0 || !target}
              loading={merge.isPending}
              fullWidth
            />
          ) : undefined
        }
      >
        <View style={styles.stack}>
          <Text style={styles.note} {...textScale.long}>
            Aynı takım olduğunu düşündüklerini işaretle (dokun). Hiçbiri seçili gelmez.
          </Text>
          {(workspace ?? []).map((t) => {
            const on = included.includes(t.id);
            return (
              <RecordCard
                key={t.id}
                title={t.team_name}
                subtitle={[`#${t.id}`, t.city, t.roster_size != null ? `${t.roster_size} oyuncu` : null, t.match_count != null ? `${t.match_count} maç` : null].filter(Boolean).join(" · ")}
                meta={t.last_match ? `Son maç ${formatDate(t.last_match)}` : null}
                trailing={<TeamLogo name={t.team_name} logo={t.logo} size={32} />}
                badges={[on ? { label: "Birleştirmeye dahil", tone: "brand", icon: "checkmark" } : { label: "Dahil değil" }]}
                onPress={() => setIncluded((list) => (on ? list.filter((x) => x !== t.id) : [...list, t.id]))}
                onLongPress={() => {
                  setWorkspace((w) => (w ?? []).filter((x) => x.id !== t.id));
                  setIncluded((list) => list.filter((x) => x !== t.id));
                }}
              />
            );
          })}
          <SelectField<number>
            value={null}
            onChange={(id, option) => {
              if (!id || (workspace ?? []).some((t) => t.id === id)) return;
              setWorkspace((w) => [...(w ?? []), { id, team_name: option?.label ?? `#${id}` }]);
              setIncluded((list) => [...list, id]);
            }}
            loadOptions={teamOptionsLoader(user, { exclude: (workspace ?? []).map((t) => t.id) })}
            queryKey={[...KEY, "add", (workspace ?? []).length]}
            placeholder="Karşılaştırmaya elle takım ekle"
            icon="add-circle-outline"
            sheetTitle="Takım ekle"
          />

          {included.length < 2 ? (
            <EmptyState icon="hand-left-outline" variant="inline" title="En az iki takım seç" body="Karşılaştırma için birleştirilecek takımları işaretle." />
          ) : preview.isLoading ? (
            <SkeletonCard />
          ) : preview.error ? (
            <ErrorState error={preview.error} onRetry={preview.refetch} variant="inline" />
          ) : view ? (
            <>
              {blocked ? (
                <Panel title="BİRLEŞTİRİLEMEZ">
                  <Text style={styles.danger} {...textScale.long}>
                    Bu takımlar birbiriyle maç yapmış:{" "}
                    {view.shared_matches!.slice(0, 5).map((m) => `${m.label}${m.date ? ` (${formatDate(m.date)})` : ""}`).join("; ")}
                    {view.shared_matches!.length > 5 ? ` ve ${view.shared_matches!.length - 5} maç daha` : ""}. Birbiriyle oynamış takımlar farklı takımlardır.
                  </Text>
                </Panel>
              ) : null}
              {view.shared_seasons?.length ? (
                <Text style={styles.note} {...textScale.long}>
                  Aynı sezonda iki ayrı takım olarak yer almışlar: {view.shared_seasons.map((s) => s.name).join(", ")}. Birleşince sezon kayıtları tek takımda toplanır.
                </Text>
              ) : null}
              {view.shared_players?.length || view.same_name_players?.length ? (
                <Text style={styles.note} {...textScale.long}>
                  {view.shared_players?.length ? `${view.shared_players.length} oyuncu iki takımda birden kayıtlı; tek kadro bağı kalır. ` : ""}
                  {view.same_name_players?.length
                    ? `${view.same_name_players.length} aynı adlı oyuncu farklı kayıtlarla duruyor; birleşmeden sonra Oyuncu birleştirme ekranından birleştirebilirsin.`
                    : ""}
                </Text>
              ) : null}

              <Panel title="ASIL TAKIM">
                <ChipGroup>
                  {view.profiles.map((p) => (
                    <Chip
                      key={p.id}
                      label={`${p.fields.team_name} #${p.id}`}
                      icon={choices.targetId === p.id ? "star" : undefined}
                      size="sm"
                      selected={choices.targetId === p.id}
                      onPress={() => setChoices((c) => ({ ...c, targetId: p.id }))}
                    />
                  ))}
                </ChipGroup>
              </Panel>

              <Panel title="TAKIM BİLGİLERİ" action={unresolved.length ? { label: "Asıl takımınkini kullan", onPress: acceptTarget } : undefined}>
                <ConflictList
                  conflicts={view.conflicts}
                  idKey="team_id"
                  fields={choices.fields}
                  nameOf={nameOf}
                  canBlank={(f) => f !== "team_name" && f !== "city"}
                  onPick={pick}
                />
              </Panel>

              <Panel title="AKTARILACAK KAYITLAR">
                {view.profiles.map((p) => (
                  <View key={p.id} style={styles.profile}>
                    <Text style={styles.profileName} {...textScale.dense}>
                      {p.fields.team_name} #{p.id}
                      {p.id === choices.targetId ? " · asıl" : ""}
                    </Text>
                    <InfoLine label="Oyuncu / maç" value={`${p.stats.players} / ${p.stats.matches}`} />
                    <InfoLine label="İlk – son maç" value={p.stats.first_match ? `${formatDate(p.stats.first_match)} – ${formatDate(p.stats.last_match)}` : "—"} />
                    <InfoLine label="Sezon" value={p.seasons.length ? `${p.seasons.length} · ${p.seasons.slice(0, 2).map((s) => s.name).join(", ")}` : "—"} />
                    <InfoLine label="Takipçi" value={String(p.stats.followers ?? 0)} />
                    <InfoLine label="Yönetici" value={p.managers.length ? p.managers.map((m) => m.fullName || m.username).join(", ") : "—"} />
                  </View>
                ))}
              </Panel>

              {target ? (
                <Panel title="SONUÇ">
                  <Text style={styles.note} {...textScale.long}>
                    “{target.fields.team_name}” (#{target.id}) kalır;{" "}
                    {view.profiles.reduce((n, p) => n + p.stats.players, 0)} oyuncu kaydı ve {view.profiles.reduce((n, p) => n + p.stats.matches, 0)} maç bu takımda toplanır
                    (tekrar edenler ayıklanır). {others.map((p) => `“${p.fields.team_name}”`).join(", ")} silinir; Geçmiş sekmesinden geri alınabilir.
                  </Text>
                </Panel>
              ) : null}
            </>
          ) : null}
        </View>
      </BottomSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  note: { ...type.bodySm, color: colors.textSecondary },
  danger: { ...type.bodySm, color: colors.danger },
  profile: { gap: space.xxs, paddingVertical: space.xs },
  profileName: { ...type.label, color: colors.textPrimary },
});
