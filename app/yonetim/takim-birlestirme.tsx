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

import Ionicons from "@expo/vector-icons/Ionicons";

import {
  AdminList,
  AdminScreen,
  SelectField,
  confirmAction,
  useAdminMutation,
} from "@/components/admin";
import { CountStrip, DangerNote, EntityCard, GroupCard, SelectionBar } from "@/components/admin/team/ManageKit";
import { ConflictList, LogoStack, MergeHistory, confirmUndo } from "@/components/admin/team/MergeParts";
import { BottomSheet, Button, Chip, ChipGroup, EmptyState, ErrorState, IconTile, SegmentedControl, SkeletonCard, TeamLogo } from "@/components/ui";
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
              <CountStrip
                items={[
                  { key: "groups", label: "Benzer grup", value: visible.length, icon: "git-merge", tone: "brand" },
                  { key: "blocked", label: "Kilitli", value: blockedCount, icon: "ban", tone: "danger", selected: !hideBlocked, onPress: () => setHideBlocked((v) => !v) },
                  { key: "ignored", label: "Yoksayılan", value: ignored.length, icon: "eye-off", selected: showIgnored, onPress: () => setShowIgnored((v) => !v) },
                ]}
              />
              <ChipGroup scrollable contentPadding={0}>
                <Chip label="Elle karşılaştır" icon="add" size="sm" tone="warn" selected onPress={() => openWorkspace([])} />
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
                <Chip label="Oynamışları gizle" size="sm" selected={hideBlocked} onPress={() => setHideBlocked((v) => !v)} />
              </ChipGroup>
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
              <EntityCard
                leading={<LogoStack teams={item.teams} />}
                title={item.teams.map((t) => t.team_name).slice(0, 3).join(" · ")}
                subtitle={`${item.teams.length} takım${item.teams.length > 3 ? ` · +${item.teams.length - 3}` : ""}`}
                muted={isIgnored}
                pills={[
                  ...item.reasons.map((r) => ({ label: TEAM_MERGE_RULES.find((x) => x.key === r)?.label ?? r, tone: "brand" as const })),
                  item.played_each_other > 0 && { label: `Birbiriyle ${item.played_each_other} maç`, tone: "danger" as const, icon: "ban-outline" as const },
                  isIgnored && { label: "Yoksayıldı", icon: "eye-off-outline" as const },
                ]}
                warning={item.played_each_other > 0 ? "Birbiriyle oynamış takımlar birleştirilemez" : null}
                stats={[
                  { label: "Takım", value: item.teams.length },
                  { label: "Oyuncu", value: item.teams.reduce((n, t) => n + (t.roster_size || 0), 0) },
                  { label: "Maç", value: matches },
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
              size="lg"
              onPress={() => void askMerge()}
              disabled={blocked || unresolved.length > 0 || !target}
              loading={merge.isPending}
              fullWidth
            />
          ) : undefined
        }
      >
        <View style={styles.stack}>
          <SelectionBar count={included.length} noun={included.length >= 2 ? "takım karşılaştırılıyor" : "takım seçili · en az 2 gerekli"} onClear={() => setIncluded([])} />
          <Text style={styles.note} {...textScale.long}>
            Aynı takım olduğunu düşündüklerini işaretle (dokun). Hiçbiri seçili gelmez; çıkarmak için basılı tut.
          </Text>
          {(workspace ?? []).map((t) => {
            const on = included.includes(t.id);
            return (
              <EntityCard
                key={t.id}
                selected={on}
                leading={<TeamLogo name={t.team_name} logo={t.logo} size={44} />}
                overline={[`#${t.id}`, t.city].filter(Boolean).join(" · ")}
                title={t.team_name}
                meta={t.last_match ? `Son maç ${formatDate(t.last_match)}` : null}
                stats={
                  t.roster_size != null || t.match_count != null
                    ? [
                        { label: "Oyuncu", value: t.roster_size ?? "—" },
                        { label: "Maç", value: t.match_count ?? "—" },
                      ]
                    : undefined
                }
                trailing={<Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={24} color={on ? colors.brandAccent : colors.textTertiary} />}
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
                <DangerNote
                  icon="ban"
                  title="Birleştirilemez: birbiriyle maç yapmışlar"
                  body={`${view.shared_matches!.slice(0, 5).map((m) => `${m.label}${m.date ? ` (${formatDate(m.date)})` : ""}`).join("; ")}${view.shared_matches!.length > 5 ? ` ve ${view.shared_matches!.length - 5} maç daha` : ""}. Birbiriyle oynamış takımlar farklı takımlardır.`}
                />
              ) : null}
              {view.shared_seasons?.length ? (
                <DangerNote
                  tone="warn"
                  title="Aynı sezonda iki ayrı takım"
                  body={`${view.shared_seasons.map((x) => x.name).join(", ")}. Birleşince sezon kayıtları tek takımda toplanır.`}
                />
              ) : null}
              {view.shared_players?.length || view.same_name_players?.length ? (
                <DangerNote
                  tone="info"
                  title="Oyuncu çakışması"
                  body={`${view.shared_players?.length ? `${view.shared_players.length} oyuncu iki takımda birden kayıtlı; tek kadro bağı kalır. ` : ""}${view.same_name_players?.length ? `${view.same_name_players.length} aynı adlı oyuncu farklı kayıtlarla duruyor; sonra Oyuncu birleştirme ekranından birleştirebilirsin.` : ""}`}
                />
              ) : null}

              <GroupCard title="Asıl takım" step={1}>
                <View style={styles.targets}>
                  {view.profiles.map((p) => {
                    const on = choices.targetId === p.id;
                    return (
                      <EntityCard
                        key={p.id}
                        selected={on}
                        leading={<IconTile icon={on ? "star" : "shield-half-outline"} tone={on ? "gold" : "neutral"} size={36} glow={on} />}
                        title={p.fields.team_name}
                        overline={`#${p.id}${on ? " · kalacak" : " · silinecek"}`}
                        stats={[
                          { label: "Oyuncu", value: p.stats.players },
                          { label: "Maç", value: p.stats.matches },
                          { label: "Sezon", value: p.seasons.length },
                          { label: "Takipçi", value: p.stats.followers ?? 0 },
                        ]}
                        meta={[
                          p.stats.first_match ? `${formatDate(p.stats.first_match)} – ${formatDate(p.stats.last_match)}` : null,
                          p.managers.length ? `Yönetici: ${p.managers.map((m) => m.fullName || m.username).join(", ")}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || null}
                        trailing={<Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={22} color={on ? colors.adminAccent : colors.textTertiary} />}
                        onPress={() => setChoices((c) => ({ ...c, targetId: p.id }))}
                      />
                    );
                  })}
                </View>
              </GroupCard>

              <GroupCard title={`Takım bilgileri${unresolved.length ? ` · ${unresolved.length} seçim` : ""}`} step={2} action={unresolved.length ? { label: "Asıl takımınkini kullan", onPress: acceptTarget } : undefined}>
                <ConflictList
                  conflicts={view.conflicts}
                  idKey="team_id"
                  fields={choices.fields}
                  nameOf={nameOf}
                  canBlank={(f) => f !== "team_name" && f !== "city"}
                  onPick={pick}
                />
              </GroupCard>

              {target ? (
                <DangerNote
                  title="Sonuç · geri alınabilir"
                  icon="git-merge"
                  body={`“${target.fields.team_name}” (#${target.id}) kalır; ${view.profiles.reduce((n, p) => n + p.stats.players, 0)} oyuncu kaydı ve ${view.profiles.reduce((n, p) => n + p.stats.matches, 0)} maç bu takımda toplanır (tekrar edenler ayıklanır). ${others.map((p) => `“${p.fields.team_name}”`).join(", ")} SİLİNİR; Geçmiş sekmesinden geri alınabilir.`}
                />
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
  targets: { gap: space.sm },
  note: { ...type.bodySm, color: colors.textSecondary },
});
