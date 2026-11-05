/**
 * OYUNCU BİRLEŞTİRME — web pages/management/PlayerMergeCenter.js.
 *
 *   1) Bul       ad soyadı aynı, yazım farkı olan ya da aynı takımda adı eksik
 *                yazılmış oyuncular; takıma, ilişki türüne ve isme göre süzülür.
 *   2) Seç       grup karşılaştırmaya açılır; HİÇBİR KAYIT SEÇİLİ GELMEZ.
 *                Elle başka oyuncu da eklenebilir.
 *   3) Çöz       asıl kayıt, çakışan her alan, korunacak takım bağları, ana
 *                takım ve (birden fazlaysa) kalacak üye hesabı seçilir.
 *   4) Birleştir maçlar, goller, kartlar, kadro, transfer ve ödül geçmişi asıl
 *                kayda taşınır; diğer kayıtlar silinir.
 *   5) Geri al   Geçmiş sekmesinden.
 * "Farklı kişiler" işareti seçilenleri bir daha önermez.
 *
 * ?players=1,2 ile (takım / oyuncu profilinden) karşılaştırma hazır açılır.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
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
  type Option,
} from "@/components/admin";
import { ConflictList, MergeHistory, confirmUndo } from "@/components/admin/team/MergeParts";
import { BottomSheet, Button, Chip, ChipGroup, EmptyState, ErrorState, SegmentedControl, SkeletonCard } from "@/components/ui";
import { formatDate } from "@/lib/admin/format";
import { teamOptionsLoader } from "@/lib/api/admin/lookups";
import { getPlayerOverview } from "@/lib/api/admin/players";
import {
  PLAYER_COUNT_LABELS,
  PLAYER_MERGE_RULES,
  executePlayerMerge,
  getPlayerMergeGroups,
  getPlayerMergeHistory,
  markPlayersDistinct,
  previewPlayerMerge,
  searchPlayerCandidates,
  undoPlayerMerge,
  unresolvedConflicts,
  type MergeHistoryRow,
  type MergePlayerCard,
  type PlayerMergeChoices,
} from "@/lib/api/admin/merge";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["players.merge"];
const KEY = ["admin", "player-merge"] as const;
type Tab = "merge" | "history";

const EMPTY: PlayerMergeChoices = { targetId: null, fields: {}, keepTeamIds: [], primaryTeamId: null, userId: undefined };

const loadCandidates = async (q: string): Promise<Option<number>[]> => {
  if (q.trim().length < 2) return [];
  const list = await searchPlayerCandidates(q.trim());
  return list.map((p) => ({
    value: p.id,
    label: p.player_name,
    hint: [p.teams?.map((t) => t.team_name).join(", ") || "Takımsız", p.birth_year, `${p.total_matches ?? 0} maç`, `#${p.id}`].filter(Boolean).join(" · "),
  }));
};

export default function PlayerMergeScreen() {
  const auth = useAuth();
  const user = auth.user;
  const params = useLocalSearchParams<{ players?: string }>();
  const [tab, setTab] = useState<Tab>("merge");
  const [rules, setRules] = useState(PLAYER_MERGE_RULES.map((r) => r.key));
  const [teamId, setTeamId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [workspace, setWorkspace] = useState<MergePlayerCard[] | null>(null);
  const [included, setIncluded] = useState<number[]>([]);
  const [choices, setChoices] = useState<PlayerMergeChoices>(EMPTY);

  const groups = useQuery({
    queryKey: [...KEY, "groups", rules.join(","), q, teamId],
    queryFn: () => getPlayerMergeGroups({ rules, q, teamId }),
    enabled: tab === "merge",
  });
  const history = useQuery({ queryKey: [...KEY, "history"], queryFn: getPlayerMergeHistory, enabled: tab === "history" });

  const sortedIds = [...included].sort((a, b) => a - b).join(",");
  const preview = useQuery({ queryKey: [...KEY, "preview", sortedIds], queryFn: () => previewPlayerMerge(included), enabled: included.length >= 2 });
  const view = included.length >= 2 ? preview.data : undefined;

  // Profilden gelinmişse (?players=1,2) seçilen oyuncular karşılaştırmaya hazır yüklenir.
  useEffect(() => {
    const ids = [...new Set(String(params.players ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!ids.length) return;
    if (ids.length === 1) {
      // Tek oyuncuyla gelindi (oyuncu profili): o kayıt hazır eklenir, eşi elle aranır.
      getPlayerOverview(ids[0])
        .then((d) =>
          setWorkspace([{ id: ids[0], player_name: d.player.player_name, player_img: d.player.player_img, city: d.player.city, total_matches: d.player.total_matches ?? 0, total_goals: d.player.total_goals ?? 0 }])
        )
        .catch(() => setWorkspace([{ id: ids[0], player_name: `#${ids[0]}` }]));
      setIncluded(ids);
      return;
    }
    previewPlayerMerge(ids)
      .then((data) => {
        setWorkspace(
          data.profiles.map((p) => ({
            id: p.id,
            player_name: p.fields.player_name,
            player_img: p.fields.player_img,
            city: p.fields.city,
            teams: p.teams,
            total_matches: p.stats.recorded_matches ?? p.stats.matches,
            total_goals: p.stats.goals,
          }))
        );
        setIncluded(ids);
      })
      .catch(() => setWorkspace([]));
  }, [params.players]);

  // Karşılaştırma gelince: üye hesabı olan ve en çok maçı olan kayıt asıl; tüm takım bağları korunur.
  useEffect(() => {
    if (!view?.profiles?.length) return;
    const matchCount = (p: (typeof view.profiles)[number]) => p.stats.recorded_matches ?? p.stats.matches ?? 0;
    const target = [...view.profiles].sort((a, b) => Number(Boolean(b.user)) - Number(Boolean(a.user)) || matchCount(b) - matchCount(a))[0];
    setChoices({
      targetId: target.id,
      fields: {},
      keepTeamIds: view.teams.map((t) => t.id),
      primaryTeamId: target.team_id ?? view.profiles.find((p) => p.team_id)?.team_id ?? null,
      userId: view.users.length > 1 ? undefined : view.users[0]?.id,
    });
  }, [view]);

  const merge = useAdminMutation(() => executePlayerMerge(included, choices), {
    success: (r) => r?.message || "Oyuncular birleştirildi.",
    invalidate: [KEY, ["admin", "players"], ["admin", "teams"]],
    onSuccess: () => {
      setWorkspace((w) => (w ?? []).filter((p) => p.id === choices.targetId || !included.includes(p.id)));
      setIncluded([]);
    },
  });
  const distinct = useAdminMutation(() => markPlayersDistinct(included), {
    success: "Farklı kişiler olarak işaretlendi; bir daha önerilmez.",
    invalidate: [[...KEY, "groups"]],
    onSuccess: () => setIncluded([]),
  });
  const undo = useAdminMutation((m: MergeHistoryRow) => undoPlayerMerge(m.id), {
    success: (r) => r?.message || "Birleştirme geri alındı.",
    invalidate: [KEY, ["admin", "players"]],
  });

  const unresolved = view ? unresolvedConflicts(view.conflicts, choices.fields) : [];
  const missingUser = Boolean(view && view.users.length > 1 && choices.userId === undefined);
  const nameOf = (id: number) => workspace?.find((p) => p.id === id)?.player_name ?? view?.profiles.find((p) => p.id === id)?.fields.player_name ?? `#${id}`;
  const target = view?.profiles.find((p) => p.id === choices.targetId);
  const others = view?.profiles.filter((p) => p.id !== choices.targetId) ?? [];
  const keep = useMemo(() => new Set(choices.keepTeamIds), [choices.keepTeamIds]);

  const toggleTeam = (id: number) =>
    setChoices((c) => {
      const next = new Set(c.keepTeamIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...c, keepTeamIds: [...next], primaryTeamId: next.has(c.primaryTeamId ?? -1) ? c.primaryTeamId : [...next][0] ?? null };
    });

  const askMerge = async () => {
    if (!target || !view) return;
    const ok = await confirmAction({
      title: "Oyuncular birleştirilsin mi?",
      message: `${others.map((p) => `“${p.fields.player_name}” (#${p.id})`).join(", ")} → asıl kayıt “${target.fields.player_name}” (#${target.id})\n\nMaçlar, goller, kartlar, kadro, transfer ve ödül geçmişi asıl kayda taşınır; diğer kayıtlar silinir. Geçmiş sekmesinden geri alınabilir.${
        view.shared_matches?.length ? "\n\nDİKKAT: bu kayıtlar aynı maçta birlikte oynamış; büyük ihtimalle farklı kişiler." : ""
      }`,
      confirmLabel: "Birleştir",
      destructive: true,
    });
    if (ok) merge.mutate(undefined);
  };

  const askDistinct = async () => {
    const ok = await confirmAction({
      title: "Farklı kişiler mi?",
      message: `Seçilen ${included.length} kayıt birbirinden farklı oyuncular olarak işaretlenecek. Kayıtlara dokunulmaz; bir daha birbiriyle önerilmez.`,
      confirmLabel: "Farklı kişiler",
    });
    if (ok) distinct.mutate(undefined);
  };

  const openWorkspace = (players: MergePlayerCard[]) => {
    setWorkspace(players);
    setIncluded([]);
    setChoices(EMPTY);
  };

  const footerLabel = !view
    ? ""
    : unresolved.length
      ? `${unresolved.length} alanda seçim gerekli`
      : missingUser
        ? "Kalacak üye hesabını seç"
        : `${included.length} kaydı birleştir`;

  return (
    <AdminScreen
      title="Oyuncu birleştirme"
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
          kind="player"
          merges={history.data ?? []}
          loading={history.isLoading}
          error={history.error}
          onRetry={history.refetch}
          busy={undo.isPending}
          countLabels={PLAYER_COUNT_LABELS}
          onUndo={(m) => void confirmUndo(m.sources.map((s) => `“${s.player_name}”`).join(", "), "player").then((ok) => ok && undo.mutate(m))}
        />
      ) : (
        <AdminList
          data={groups.data ?? []}
          loading={groups.isLoading}
          error={groups.error}
          onRetry={groups.refetch}
          refreshing={groups.isRefetching}
          onRefresh={groups.refetch}
          search={q}
          onSearch={setQ}
          searchPlaceholder="Oyuncu adında ara"
          extraHeader={
            <View style={styles.stack}>
              <ChipGroup scrollable contentPadding={0}>
                {PLAYER_MERGE_RULES.map((r) => (
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
              </ChipGroup>
              <SelectField<number>
                value={teamId}
                onChange={setTeamId}
                loadOptions={teamOptionsLoader(user)}
                queryKey={["admin", "teams", "options"]}
                placeholder="Tüm takımlar"
                icon="shield-half-outline"
                clearable
                sheetTitle="Takım"
              />
              <Button label="Elle karşılaştır" icon="add" variant="secondary" size="sm" onPress={() => openWorkspace([])} />
            </View>
          }
          summary={groups.data ? `${groups.data.length} ilişkili grup` : null}
          keyExtractor={(g) => g.key}
          emptyIcon="git-merge-outline"
          emptyTitle="İlişkili oyuncu grubu yok"
          emptyBody="Süzgeçleri değiştir ya da elle karşılaştır."
          renderItem={({ item }) => (
            <RecordCard
              title={item.players.map((p) => p.player_name).slice(0, 3).join(" · ")}
              subtitle={item.players
                .slice(0, 3)
                .map((p) => [p.teams?.map((t) => t.team_name).join("/") || "Takımsız", `${p.total_matches ?? 0} maç`, p.birth_year].filter(Boolean).join(", "))
                .join(" | ")}
              meta={`${item.players.length} kayıt${item.players.length > 3 ? ` · +${item.players.length - 3}` : ""}`}
              icon="git-merge-outline"
              iconTone="brand"
              badges={item.reasons.map((r) => ({ label: PLAYER_MERGE_RULES.find((x) => x.key === r)?.label ?? r }))}
              onPress={() => openWorkspace(item.players)}
            />
          )}
        />
      )}

      <BottomSheet
        visible={workspace != null}
        onClose={() => setWorkspace(null)}
        title="Karşılaştır ve seç"
        snap="full"
        footer={
          view ? (
            <View style={styles.footer}>
              <Button label="Farklı kişiler" variant="secondary" onPress={() => void askDistinct()} loading={distinct.isPending} />
              <Button
                label={footerLabel}
                icon="git-merge-outline"
                variant="danger"
                onPress={() => void askMerge()}
                disabled={unresolved.length > 0 || missingUser || !target}
                loading={merge.isPending}
                style={styles.grow}
              />
            </View>
          ) : undefined
        }
      >
        <View style={styles.stack}>
          <Text style={styles.note} {...textScale.long}>
            Aynı kişi olduğunu düşündüğün kayıtları işaretle (dokun). İkiden fazla da olabilir; hiçbiri seçili gelmez.
          </Text>
          {(workspace ?? []).map((p) => {
            const on = included.includes(p.id);
            return (
              <RecordCard
                key={p.id}
                title={p.player_name}
                subtitle={[`#${p.id}`, p.teams?.map((t) => t.team_name).join(", ") || "Takımsız", p.birth_year, p.city].filter(Boolean).join(" · ")}
                meta={`${p.total_matches ?? 0} maç · ${p.total_goals ?? 0} gol`}
                avatar={{ name: p.player_name, image: p.player_img }}
                badges={[on ? { label: "Birleştirmeye dahil", tone: "brand", icon: "checkmark" } : { label: "Dahil değil" }]}
                onPress={() => setIncluded((list) => (on ? list.filter((x) => x !== p.id) : [...list, p.id]))}
                onLongPress={() => {
                  setWorkspace((w) => (w ?? []).filter((x) => x.id !== p.id));
                  setIncluded((list) => list.filter((x) => x !== p.id));
                }}
              />
            );
          })}
          <SelectField<number>
            value={null}
            onChange={(id, option) => {
              if (!id || (workspace ?? []).some((p) => p.id === id)) return;
              setWorkspace((w) => [...(w ?? []), { id, player_name: option?.label ?? `#${id}` }]);
              setIncluded((list) => [...list, id]);
            }}
            loadOptions={loadCandidates}
            queryKey={[...KEY, "candidates"]}
            placeholder="Karşılaştırmaya elle oyuncu ekle (ad soyad)"
            icon="person-add-outline"
            sheetTitle="Oyuncu ekle"
          />

          {included.length < 2 ? (
            <EmptyState icon="hand-left-outline" variant="inline" title="En az iki kayıt seç" body="Aynı kişiye ait kayıtları işaretle." />
          ) : preview.isLoading ? (
            <SkeletonCard />
          ) : preview.error ? (
            <ErrorState error={preview.error} onRetry={preview.refetch} variant="inline" />
          ) : view ? (
            <>
              {view.shared_matches?.length ? (
                <Panel title="DİKKAT">
                  <Text style={styles.danger} {...textScale.long}>
                    Aynı maçta birlikte oynamışlar: {view.shared_matches.map((s) => `${nameOf(s.a)} ile ${nameOf(s.b)} ${s.count} maçta aynı kadroda`).join("; ")}.
                    Aynı maçta iki ayrı kayıt olarak yer alan oyuncular büyük ihtimalle farklı kişilerdir.
                  </Text>
                </Panel>
              ) : null}

              <Panel title="1 · ASIL KAYIT">
                <Text style={styles.note} {...textScale.long}>
                  Diğer kayıtlar bunun içine birleştirilir; profil bağlantısı (kayıt no) bu kaydınki olur.
                </Text>
                <ChipGroup>
                  {view.profiles.map((p) => (
                    <Chip
                      key={p.id}
                      label={`${p.fields.player_name} #${p.id}`}
                      icon={choices.targetId === p.id ? "star" : undefined}
                      size="sm"
                      selected={choices.targetId === p.id}
                      onPress={() => setChoices((c) => ({ ...c, targetId: p.id }))}
                    />
                  ))}
                </ChipGroup>
                {view.profiles.map((p) => (
                  <InfoLine
                    key={p.id}
                    label={`#${p.id}`}
                    value={[
                      `${p.stats.recorded_matches ?? p.stats.matches} maç · ${p.stats.goals} gol`,
                      p.stats.first_match ? `${formatDate(p.stats.first_match)} – ${formatDate(p.stats.last_match)}` : null,
                      p.teams.map((t) => t.team_name).join(", ") || "Takımsız",
                      p.user ? `@${p.user.username}` : "Hesapsız",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ))}
              </Panel>

              <Panel title="2 · PROFİL BİLGİLERİ">
                <ConflictList
                  conflicts={view.conflicts}
                  idKey="player_id"
                  fields={choices.fields}
                  nameOf={nameOf}
                  canBlank={(f) => f !== "player_name" && f !== "city"}
                  onPick={(field, id) => setChoices((c) => ({ ...c, fields: { ...c.fields, [field]: id } }))}
                />
              </Panel>

              <Panel title="3 · TAKIMLAR">
                {view.teams.length ? (
                  <>
                    <Text style={styles.note} {...textScale.long}>
                      Korunacak takım bağlarını işaretle; işareti kaldırılan bağ silinir (maç geçmişi kalır).
                    </Text>
                    <ChipGroup>
                      {view.teams.map((t) => (
                        <Chip key={t.id} label={t.team_name} size="sm" icon={keep.has(t.id) ? "checkmark" : undefined} selected={keep.has(t.id)} onPress={() => toggleTeam(t.id)} />
                      ))}
                    </ChipGroup>
                    <Text style={styles.label} {...textScale.dense}>
                      Ana takım
                    </Text>
                    <ChipGroup>
                      {view.teams
                        .filter((t) => keep.has(t.id))
                        .map((t) => (
                          <Chip key={t.id} label={t.team_name} size="sm" selected={choices.primaryTeamId === t.id} onPress={() => setChoices((c) => ({ ...c, primaryTeamId: t.id }))} />
                        ))}
                      <Chip label="Ana takım yok (serbest)" size="sm" selected={choices.primaryTeamId === null} onPress={() => setChoices((c) => ({ ...c, primaryTeamId: null }))} />
                    </ChipGroup>
                  </>
                ) : (
                  <Text style={styles.note}>Bu kayıtların takım bağı yok.</Text>
                )}
              </Panel>

              <Panel title="4 · BAĞLI ÜYE HESABI">
                {view.users.length === 0 ? (
                  <Text style={styles.note}>Hiçbir kayıt bir üye hesabına bağlı değil.</Text>
                ) : view.users.length === 1 ? (
                  <Text style={styles.note} {...textScale.long}>
                    {view.users[0].fullName || view.users[0].username} (@{view.users[0].username}) hesabı birleşen profile bağlı kalır.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.note} {...textScale.long}>
                      Birden fazla üye bu kayıtlara bağlı. Bir profil yalnız bir üyeye bağlı olabilir: kalacak hesabı seç, diğerlerinin bağı kaldırılır.
                    </Text>
                    <ChipGroup>
                      {view.users.map((u) => (
                        <Chip
                          key={u.id}
                          label={`${u.fullName || u.username} · #${u.player_id}`}
                          size="sm"
                          selected={choices.userId === u.id}
                          onPress={() => setChoices((c) => ({ ...c, userId: u.id }))}
                        />
                      ))}
                      <Chip label="Hiçbiri" size="sm" selected={choices.userId === null} onPress={() => setChoices((c) => ({ ...c, userId: null }))} />
                    </ChipGroup>
                  </>
                )}
              </Panel>

              {target ? (
                <Panel title="SONUÇ">
                  <Text style={styles.note} {...textScale.long}>
                    Kayıt #{target.id} kalır. Ana takım: {view.teams.find((t) => t.id === choices.primaryTeamId)?.team_name ?? "yok"}. Korunan takımlar:{" "}
                    {view.teams.filter((t) => keep.has(t.id)).map((t) => t.team_name).join(", ") || "yok"}. Toplam{" "}
                    {view.profiles.reduce((n, p) => n + (p.stats.recorded_matches ?? p.stats.matches ?? 0), 0)} maç kaydı ve{" "}
                    {view.profiles.reduce((n, p) => n + p.stats.goals, 0)} gol (birleşince yeniden hesaplanır).
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
  footer: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  note: { ...type.bodySm, color: colors.textSecondary },
  danger: { ...type.bodySm, color: colors.danger },
  label: { ...type.label, color: colors.textSecondary },
});
