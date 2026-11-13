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
import Ionicons from "@expo/vector-icons/Ionicons";

import { CountStrip, DangerNote, EntityCard, GroupCard, PickerChip, SelectionBar } from "@/components/admin/team/ManageKit";
import { ConflictList, MergeHistory, confirmUndo } from "@/components/admin/team/MergeParts";
import { Avatar, BottomSheet, Button, Chip, ChipGroup, EmptyState, ErrorState, IconTile, SegmentedControl, SkeletonCard } from "@/components/ui";
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
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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
              <CountStrip
                items={[
                  { key: "groups", label: "İlişkili grup", value: groups.data?.length ?? "—", icon: "git-merge", tone: "brand" },
                  { key: "records", label: "Kayıt", value: (groups.data ?? []).reduce((n, g) => n + g.players.length, 0), icon: "people" },
                ]}
              />
              <ChipGroup scrollable contentPadding={0}>
                <Chip label="Elle karşılaştır" icon="add" size="sm" tone="warn" selected onPress={() => openWorkspace([])} />
                <PickerChip<number>
                  icon="shield-half-outline"
                  placeholder="Takım"
                  title="Takım"
                  value={teamId}
                  onChange={setTeamId}
                  loadOptions={teamOptionsLoader(user)}
                  queryKey={["admin", "teams", "options"]}
                />
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
            </View>
          }
          summary={groups.data ? `${groups.data.length} ilişkili grup` : null}
          keyExtractor={(g) => g.key}
          emptyIcon="git-merge-outline"
          emptyTitle="İlişkili oyuncu grubu yok"
          emptyBody="Süzgeçleri değiştir ya da elle karşılaştır."
          renderItem={({ item }) => (
            <EntityCard
              leading={<AvatarStack players={item.players} />}
              title={item.players[0]?.player_name ?? "Oyuncu"}
              subtitle={`${item.players.length} kayıt${item.players.length > 3 ? ` · +${item.players.length - 3}` : ""}`}
              pills={item.reasons.map((r) => ({ label: PLAYER_MERGE_RULES.find((x) => x.key === r)?.label ?? r, tone: "brand" as const }))}
              footer={
                <View style={styles.compare}>
                  {item.players.slice(0, 3).map((p, i) => (
                    <View key={p.id} style={[styles.compareCol, i ? styles.compareDivided : null]}>
                      <Text style={styles.compareId} numberOfLines={1} {...textScale.badge}>
                        #{p.id}
                      </Text>
                      <Text style={styles.compareTeam} numberOfLines={1} {...textScale.dense}>
                        {p.teams?.map((t) => t.team_name).join("/") || "Takımsız"}
                      </Text>
                      <Text style={styles.compareStat} numberOfLines={1} {...textScale.badge}>
                        {p.total_matches ?? 0} maç{p.birth_year ? ` · ${p.birth_year}` : ""}
                      </Text>
                    </View>
                  ))}
                </View>
              }
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
              <Button label="Farklı kişiler" variant="secondary" size="lg" onPress={() => void askDistinct()} loading={distinct.isPending} />
              <Button
                label={footerLabel}
                icon="git-merge-outline"
                variant="danger"
                size="lg"
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
          <SelectionBar count={included.length} noun={included.length >= 2 ? "kayıt karşılaştırılıyor" : "kayıt seçili · en az 2 gerekli"} onClear={() => setIncluded([])} />
          <Text style={styles.note} {...textScale.long}>
            Aynı kişi olduğunu düşündüğün kayıtları işaretle (dokun). İkiden fazla da olabilir; hiçbiri seçili gelmez. Çıkarmak için basılı tut.
          </Text>
          {(workspace ?? []).map((p) => {
            const on = included.includes(p.id);
            return (
              <EntityCard
                key={p.id}
                selected={on}
                leading={<Avatar name={p.player_name} image={p.player_img} size={44} />}
                overline={[`#${p.id}`, p.city, p.birth_year].filter(Boolean).join(" · ")}
                title={p.player_name}
                subtitle={p.teams?.map((t) => t.team_name).join(", ") || "Takımsız"}
                stats={[
                  { label: "Maç", value: p.total_matches ?? 0 },
                  { label: "Gol", value: p.total_goals ?? 0 },
                ]}
                trailing={<Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={24} color={on ? colors.brandAccent : colors.textTertiary} />}
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
                <DangerNote
                  icon="people"
                  title="Büyük ihtimalle farklı kişiler"
                  body={`Aynı maçta birlikte oynamışlar: ${view.shared_matches.map((x) => `${nameOf(x.a)} ile ${nameOf(x.b)} ${x.count} maçta aynı kadroda`).join("; ")}. Aynı maçta iki ayrı kayıt olarak yer alan oyuncular büyük ihtimalle farklı kişilerdir.`}
                />
              ) : null}

              <GroupCard title="Asıl kayıt" step={1}>
                <Text style={styles.note} {...textScale.long}>
                  Diğer kayıtlar bunun içine birleştirilir; profil bağlantısı (kayıt no) bu kaydınki olur.
                </Text>
                <View style={styles.targets}>
                  {view.profiles.map((p) => {
                    const on = choices.targetId === p.id;
                    return (
                      <EntityCard
                        key={p.id}
                        selected={on}
                        leading={<IconTile icon={on ? "star" : "person-outline"} tone={on ? "gold" : "neutral"} size={36} glow={on} />}
                        overline={`#${p.id}${on ? " · kalacak" : " · silinecek"}`}
                        title={p.fields.player_name}
                        subtitle={p.teams.map((t) => t.team_name).join(", ") || "Takımsız"}
                        meta={[p.stats.first_match ? `${formatDate(p.stats.first_match)} – ${formatDate(p.stats.last_match)}` : null, p.user ? `@${p.user.username}` : "Hesapsız"].filter(Boolean).join(" · ")}
                        stats={[
                          { label: "Maç", value: p.stats.recorded_matches ?? p.stats.matches },
                          { label: "Gol", value: p.stats.goals },
                        ]}
                        trailing={<Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={22} color={on ? colors.adminAccent : colors.textTertiary} />}
                        onPress={() => setChoices((c) => ({ ...c, targetId: p.id }))}
                      />
                    );
                  })}
                </View>
              </GroupCard>

              <GroupCard title={`Profil bilgileri${unresolved.length ? ` · ${unresolved.length} seçim` : ""}`} step={2}>
                <ConflictList
                  conflicts={view.conflicts}
                  idKey="player_id"
                  fields={choices.fields}
                  nameOf={nameOf}
                  canBlank={(f) => f !== "player_name" && f !== "city"}
                  onPick={(field, id) => setChoices((c) => ({ ...c, fields: { ...c.fields, [field]: id } }))}
                />
              </GroupCard>

              <GroupCard title="Takımlar" step={3}>
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
                      ANA TAKIM
                    </Text>
                    <ChipGroup>
                      {view.teams
                        .filter((t) => keep.has(t.id))
                        .map((t) => (
                          <Chip key={t.id} label={t.team_name} icon="star" size="sm" tone="warn" selected={choices.primaryTeamId === t.id} onPress={() => setChoices((c) => ({ ...c, primaryTeamId: t.id }))} />
                        ))}
                      <Chip label="Ana takım yok (serbest)" size="sm" selected={choices.primaryTeamId === null} onPress={() => setChoices((c) => ({ ...c, primaryTeamId: null }))} />
                    </ChipGroup>
                  </>
                ) : (
                  <Text style={styles.note}>Bu kayıtların takım bağı yok.</Text>
                )}
              </GroupCard>

              <GroupCard title="Bağlı üye hesabı" step={4}>
                {view.users.length === 0 ? (
                  <Text style={styles.note}>Hiçbir kayıt bir üye hesabına bağlı değil.</Text>
                ) : view.users.length === 1 ? (
                  <Text style={styles.note} {...textScale.long}>
                    {view.users[0].fullName || view.users[0].username} (@{view.users[0].username}) hesabı birleşen profile bağlı kalır.
                  </Text>
                ) : (
                  <>
                    <DangerNote tone="warn" title="Birden fazla üye bağlı" body="Bir profil yalnız bir üyeye bağlı olabilir: kalacak hesabı seç, diğerlerinin bağı kaldırılır." />
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
              </GroupCard>

              {target ? (
                <DangerNote
                  icon="git-merge"
                  title="Sonuç · geri alınabilir"
                  body={`Kayıt #${target.id} kalır, diğer ${others.length} kayıt SİLİNİR. Ana takım: ${view.teams.find((t) => t.id === choices.primaryTeamId)?.team_name ?? "yok"}. Korunan takımlar: ${view.teams.filter((t) => keep.has(t.id)).map((t) => t.team_name).join(", ") || "yok"}. Toplam ${view.profiles.reduce((n, p) => n + (p.stats.recorded_matches ?? p.stats.matches ?? 0), 0)} maç kaydı ve ${view.profiles.reduce((n, p) => n + p.stats.goals, 0)} gol (birleşince yeniden hesaplanır).`}
                />
              ) : null}
            </>
          ) : null}
        </View>
      </BottomSheet>
    </AdminScreen>
  );
}

/** Üst üste binen avatar yığını (ilişkili oyuncu kayıtları). */
function AvatarStack({ players }: { players: { id: number; player_name: string; player_img?: string | null }[] }) {
  const shown = players.slice(0, 3);
  return (
    <View style={[styles.avStack, { width: 36 + (shown.length - 1) * 20 }]}>
      {shown.map((p, i) => (
        <View key={p.id} style={[styles.avItem, { left: i * 20, zIndex: 3 - i }]}>
          <Avatar name={p.player_name} image={p.player_img} size={36} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  targets: { gap: space.sm },
  avStack: { height: 40, justifyContent: "center" },
  avItem: { position: "absolute", top: 0, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.surface1 },
  compare: { flexDirection: "row", borderRadius: radius.md, backgroundColor: colors.surface2, paddingVertical: space.sm },
  compareCol: { flex: 1, paddingHorizontal: space.sm, gap: 1 },
  compareDivided: { borderLeftWidth: hairline, borderLeftColor: colors.separator },
  compareId: { ...type.micro, color: colors.textTertiary },
  compareTeam: { ...type.labelSm, color: colors.textPrimary },
  compareStat: { ...type.numSm, color: colors.textSecondary },
  footer: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  note: { ...type.bodySm, color: colors.textSecondary },
  label: { ...type.overline, color: colors.textTertiary },
});
