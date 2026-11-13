/**
 * LİG STATÜSÜ — web features/seasonStructure (LeagueStructureSection +
 * SeasonStructureEditor) ve eski Gruplar sayfası.
 *
 * Lig ve sezon seçilir (adresteki ?sezon= ile doğrudan gelinir); sezonun
 * grupları, eleme etapları ve hangi takımın hangi etaba kalacağı kurulur.
 * Statü sitede hemen işler: puan tablosunda grup sekmeleri, ağaç şeması ve
 * sonuç geldikçe bir sonraki tura geçen takımlar.
 *
 * MOBİL KARŞILIKLAR: sürükle-bırak sıralama → kutuya uzun basınca "yukarı /
 * aşağı taşı"; ağaç şeması önizlemesi → grup kartları ve program sayfası.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  ActionSheet,
  AdminScreen,
  FormSheet,
  SegmentField,
  SelectField,
  ToggleField,
  confirmAction,
  useAdminMutation,
  type FieldDef,
  type FormValues,
} from "@/components/admin";
import { GroupCard } from "@/components/admin/league/GroupCard";
import { OpsGroup, StatusTiles } from "@/components/admin/matches/opsKit";
import { TileButton } from "@/components/admin/tools/ToolKit";
import { ScheduleSheet } from "@/components/admin/league/ScheduleSheet";
import { StructureSheet } from "@/components/admin/league/StructureSheet";
import { EmptyState, ErrorState, Reveal, SectionHeader, SkeletonCard, useToast } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { ApiError } from "@/lib/http";
import {
  MAX_SOURCE_RANK,
  SLOT_SOURCE_LABELS,
  clearGroupSlot,
  copyStructure,
  createSeasonGroup,
  deleteSeasonGroup,
  getSeasonOverview,
  listLeagues,
  listSeasons,
  moveGroupSlot,
  resolveSeasonGroups,
  setGroupSlotCount,
  updateGroupSlot,
  updateSeasonGroup,
  updateSeasonGroupSettings,
  type GroupSlot,
  type SeasonGroup,
} from "@/lib/api/admin/leagues";
import { isArchived, seasonBelongsToLeague, teamOptionsLoader } from "@/lib/api/admin/lookups";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["groups.view", "groups.create", "groups.update", "groups.delete"];

const NEEDS_GROUP = new Set(["GROUP_RANK", "MATCH_WINNER", "MATCH_LOSER"]);
const NEEDS_RANK = new Set(["OVERALL_RANK", "GROUP_RANK"]);
const NEEDS_MATCHUP = new Set(["MATCH_WINNER", "MATCH_LOSER"]);

export default function LeagueStructureScreen() {
  const auth = useAuth();
  const user = auth.user;
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ sezon?: string }>();
  const can = {
    create: hasPermission(user, "groups.create"),
    update: hasPermission(user, "groups.update"),
    remove: hasPermission(user, "groups.delete"),
  };

  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [seasonId, setSeasonId] = useState<number | null>(params.sezon ? Number(params.sezon) : null);
  const [groupMenu, setGroupMenu] = useState<SeasonGroup | null>(null);
  const [groupForm, setGroupForm] = useState<SeasonGroup | "new" | null>(null);
  const [slotEdit, setSlotEdit] = useState<{ group: SeasonGroup; slot: GroupSlot } | null>(null);
  const [slotMenu, setSlotMenu] = useState<{ group: SeasonGroup; slot: GroupSlot; index: number } | null>(null);
  const [schedule, setSchedule] = useState<SeasonGroup | null>(null);
  const [builder, setBuilder] = useState(false);
  const [copying, setCopying] = useState(false);

  const leagues = useQuery({ queryKey: ["admin", "leagues", user?.city ?? ""], queryFn: () => listLeagues(user) });
  const seasons = useQuery({ queryKey: ["admin", "seasons", user?.city ?? ""], queryFn: () => listSeasons(user) });

  // Adresteki sezonun ligi kendiliğinden seçilir.
  useEffect(() => {
    if (!seasonId || leagueId || !seasons.data || !leagues.data) return;
    const season = seasons.data.find((s) => s.id === seasonId);
    const league = season && leagues.data.find((l) => seasonBelongsToLeague(season, l));
    if (league) setLeagueId(league.id);
  }, [seasonId, leagueId, seasons.data, leagues.data]);

  const leagueOptions = (leagues.data ?? []).filter((l) => !isArchived(l)).map((l) => ({ value: l.id, label: l.league_name }));
  const seasonOptions = useMemo(() => {
    const league = leagues.data?.find((l) => l.id === leagueId);
    return (seasons.data ?? [])
      .filter((s) => !isArchived(s) && (!league || seasonBelongsToLeague(s, league)))
      .map((s) => ({ value: s.id, label: s.season_name, hint: league ? null : s.league_name ?? null }));
  }, [seasons.data, leagues.data, leagueId]);

  const KEY = ["admin", "season-groups", seasonId] as const;
  const overview = useQuery({ queryKey: KEY, queryFn: () => getSeasonOverview(seasonId!), enabled: seasonId != null });
  const groups = overview.data?.groups ?? [];
  const settings = overview.data?.settings;
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  /* ---------- mutasyonlar ---------- */

  const saveSettings = useAdminMutation(
    (body: { showOverallStandings?: boolean; groupDisplayMode?: string }) => updateSeasonGroupSettings(seasonId!, body),
    { success: "Görünüm ayarı kaydedildi.", invalidate: [KEY] }
  );

  const resolve = useAdminMutation(() => resolveSeasonGroups(seasonId!), {
    success: "Kontenjanlar sonuçlara göre yeniden çözüldü.",
    invalidate: [KEY],
  });

  const saveGroup = useAdminMutation(
    async (v: FormValues) => {
      const body = {
        groupName: String(v.groupName ?? "").trim(),
        groupPriority: v.groupPriority === "" || v.groupPriority == null ? null : Number(v.groupPriority),
        groupKind: String(v.groupKind ?? "grup"),
        groupFormat: String(v.groupFormat ?? "serbest"),
        doubleRound: Boolean(v.doubleRound),
        showInBracket: v.showInBracket !== false,
      };
      const units = Math.max(0, Number(v.unitCount) || 0);
      if (groupForm === "new") return createSeasonGroup(seasonId!, { ...body, slotCount: units });
      const group = groupForm as SeasonGroup;
      await updateSeasonGroup(group.id, body);
      if (units !== Number(group.unit_count ?? 0)) await resize(group, units);
      return null;
    },
    { success: groupForm === "new" ? "Grup oluşturuldu." : "Grup güncellendi.", invalidate: [KEY] }
  );

  const toggleBracket = useAdminMutation((g: SeasonGroup) => updateSeasonGroup(g.id, { showInBracket: g.show_in_bracket === false }), {
    success: (_, g) => (g.show_in_bracket === false ? "Grup ağaç şemasında gösterilecek." : "Grup ağaç şemasından gizlendi."),
    invalidate: [KEY],
  });

  const removeGroup = useAdminMutation((g: SeasonGroup) => deleteSeasonGroup(g.id), {
    success: "Grup silindi.",
    invalidate: [KEY],
  });

  const saveSlot = useAdminMutation(
    (v: FormValues) => {
      const { group, slot } = slotEdit!;
      if (!v.mode) throw new Error("Kutunun kaynağını seç.");
      const mode = String(v.mode);
      if (mode === "TEAM") return updateGroupSlot(group.id, slot.id, { source_type: "TEAM", team_id: Number(v.team_id) });
      return updateGroupSlot(group.id, slot.id, {
        source_type: mode,
        source_group_id: NEEDS_GROUP.has(mode) ? Number(v.source_group_id) : null,
        source_rank: NEEDS_RANK.has(mode) ? Number(v.source_rank) : null,
        source_matchup: NEEDS_MATCHUP.has(mode) ? Number(v.source_matchup) : null,
      });
    },
    { success: "Kutu güncellendi.", invalidate: [KEY] }
  );

  const clearSlot = useAdminMutation(({ group, slot }: { group: SeasonGroup; slot: GroupSlot }) => clearGroupSlot(group.id, slot.id), {
    success: "Kutu boşaltıldı.",
    invalidate: [KEY],
  });

  /** Kutuyu boşaltmak takımı / kaynağı gruptan çıkarır: onay ister. */
  const askClearSlot = async (target: { group: SeasonGroup; slot: GroupSlot }) => {
    const ok = await confirmAction({
      title: "Kutuyu boşalt",
      message: `${target.group.group_name} grubundaki bu kutunun takımı ya da kaynağı kaldırılır. Kutu ve eşleşme düzeni korunur; puan tablosu yeniden hesaplanır.`,
      confirmLabel: "Boşalt",
      destructive: true,
    });
    if (ok) clearSlot.mutate(target);
  };

  const moveSlot = useAdminMutation(
    ({ group, slot, dir }: { group: SeasonGroup; slot: GroupSlot; dir: "up" | "down" }) => moveGroupSlot(group.id, slot.id, dir),
    { invalidate: [KEY] }
  );

  const copy = useAdminMutation(
    (v: FormValues) =>
      copyStructure(seasonId!, {
        targetSeasonId: Number(v.targetSeasonId),
        mode: v.mode === "replace" ? "replace" : "append",
        includeTeams: Boolean(v.includeTeams),
        includeSettings: v.includeSettings !== false,
      }),
    // Hedef sezonun kurgusu değişti: o sezon seçildiğinde eski önbellek gösterilmesin.
    { success: (r) => r?.message || "Kurgu kopyalandı.", invalidate: [["admin", "season-groups"]] }
  );

  /** Boyut ayarı; küçültme dolu kutu silecekse sunucu onay ister (force). */
  async function resize(group: SeasonGroup, count: number) {
    try {
      await setGroupSlotCount(group.id, count);
    } catch (error) {
      if (error instanceof ApiError && error.code === "SLOT_SHRINK_FILLED") {
        const ok = await confirmAction({
          title: "Dolu kutular silinsin mi?",
          message: `${error.message}\n\nSondaki dolu kutular kaldırılacak.`,
          confirmLabel: "Küçült",
          destructive: true,
        });
        if (ok) await setGroupSlotCount(group.id, count, true);
        return;
      }
      throw error;
    }
  }

  const quickResize = async (group: SeasonGroup, count: number) => {
    try {
      await resize(group, count);
      await refresh();
    } catch (error) {
      toast.show({ message: errorText(error, "Kutu sayısı değiştirilemedi."), tone: "danger" });
    }
  };

  const askDeleteGroup = async (g: SeasonGroup) => {
    const ok = await confirmAction({
      title: "Grup silinsin mi?",
      message: `"${g.group_name}" silinecek. Maçların grup bilgisi temizlenir; maçlar ve istatistikler kalır.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) removeGroup.mutate(g);
  };

  /* ---------- formlar ---------- */

  const groupFields: FieldDef[] = [
    { key: "groupName", label: "Ad", kind: "text", required: true, placeholder: "ör. A Grubu, Yarı Final" },
    {
      key: "groupKind",
      label: "Biçim",
      kind: "segment",
      options: [
        { value: "grup", label: "Grup (lig usulü)" },
        { value: "etap", label: "Etap (eleme)" },
      ],
    },
    { key: "unitCount", label: "Takım / eşleşme sayısı", kind: "number", hint: "Grupta takım, etapta eşleşme sayısı kadar boş kutu açılır." },
    {
      key: "groupFormat",
      label: "Maç düzeni",
      kind: "segment",
      options: [
        { value: "serbest", label: "Serbest" },
        { value: "fikstur", label: "Fikstürlü" },
      ],
      hidden: (v) => v.groupKind === "etap",
    },
    { key: "doubleRound", label: "Rövanşlı", kind: "toggle" },
    { key: "showInBracket", label: "Ağaç şemasında göster", kind: "toggle", hint: "Sekmeli görünümü etkilemez." },
    { key: "groupPriority", label: "Sıra", kind: "number" },
  ];

  const otherGroups = slotEdit ? groups.filter((g) => g.id !== slotEdit.group.id) : [];
  const usedTeams = slotEdit
    ? slotEdit.group.slots.filter((s) => s.source_type === "TEAM" && s.id !== slotEdit.slot.id).map((s) => Number(s.team_id))
    : [];
  const slotFields: FieldDef[] = [
    {
      key: "mode",
      label: "Bu kutuyu ne dolduracak?",
      kind: "chips",
      options: ["TEAM", "OVERALL_RANK", "GROUP_RANK", "MATCH_WINNER", "MATCH_LOSER"].map((k) => ({ value: k, label: SLOT_SOURCE_LABELS[k] })),
    },
    {
      key: "team_id",
      label: "Takım",
      kind: "select",
      required: true,
      loadOptions: teamOptionsLoader(user, { exclude: usedTeams }),
      queryKey: ["admin", "teams", "options", usedTeams.join(",")],
      valueLabel: () => (slotEdit?.slot.source_type === "TEAM" ? slotEdit.slot.resolved_team_name : null),
      hidden: (v) => v.mode !== "TEAM",
      hint: "Kutu doğrudan bu takıma sabitlenir. Bu grupta kullanılan takımlar listelenmez.",
    },
    {
      key: "source_group_id",
      label: "Hangi grup / etap",
      kind: "select",
      required: true,
      options: otherGroups.map((g) => ({ value: g.id, label: g.group_name, hint: g.group_kind === "etap" ? `${g.matchup_count} eşleşme` : null })),
      hidden: (v) => !NEEDS_GROUP.has(String(v.mode)),
      hint: otherGroups.length ? undefined : "Bağlanacak başka grup yok.",
    },
    {
      key: "source_rank",
      label: "Sıra",
      kind: "number",
      required: true,
      hint: `1 ile ${MAX_SOURCE_RANK} arası`,
      hidden: (v) => !NEEDS_RANK.has(String(v.mode)),
    },
    {
      key: "source_matchup",
      label: "Eşleşme no",
      kind: "number",
      required: true,
      hint: "Kaynak etabın kaçıncı eşleşmesi",
      hidden: (v) => !NEEDS_MATCHUP.has(String(v.mode)),
    },
  ];

  const seasonFields: FieldDef[] = [
    { key: "targetSeasonId", label: "Hedef sezon", kind: "select", required: true, options: seasonOptions.filter((s) => s.value !== seasonId) },
    {
      key: "mode",
      label: "Kopyalama",
      kind: "segment",
      options: [
        { value: "append", label: "Mevcuda ekle" },
        { value: "replace", label: "Mevcudu değiştir" },
      ],
    },
    { key: "includeTeams", label: "Takımları da kopyala", kind: "toggle", hint: "Kapalıysa kutular boş kopyalanır." },
    { key: "includeSettings", label: "Görünüm ayarlarını kopyala", kind: "toggle" },
  ];

  const selectedSeasonName = seasons.data?.find((s) => s.id === seasonId)?.season_name;

  return (
    <AdminScreen
      title="Lig statüsü"
      subtitle={selectedSeasonName}
      permission={PERMS}
      onRefresh={seasonId ? refresh : undefined}
      refreshing={overview.isRefetching}
    >
      <OpsGroup
        title="Sezon"
        icon="git-network"
        tone="cyan"
        hint={seasonId ? undefined : "Grupları, eleme turlarını ve hangi takımın hangi etaba kalacağını kur."}
      >
        <>
          <SelectField<number>
            label="Lig"
            value={leagueId}
            options={leagueOptions}
            placeholder={leagues.isLoading ? "Yükleniyor…" : "Lig seç"}
            onChange={(v) => {
              setLeagueId(v);
              setSeasonId(null);
            }}
            icon="trophy-outline"
          />
          <SelectField<number>
            label="Sezon"
            value={seasonId}
            options={seasonOptions}
            placeholder={leagueId ? "Sezon seç" : "Önce lig"}
            onChange={(v) => setSeasonId(v)}
            icon="calendar-outline"
            disabled={!leagueId && !seasonId}
          />
        </>
      </OpsGroup>
      {!seasonId ? (
        <EmptyState icon="git-network-outline" variant="inline" title="Lig ve sezon seç" body="Statüyü düzenlemek için önce lig ve sezon seç." />
      ) : overview.isLoading ? (
        <View style={styles.loading}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : overview.error ? (
        <ErrorState error={overview.error} onRetry={overview.refetch} variant="inline" />
      ) : (
        <>
          {/* Sezonun kurgu özeti: grup / etap / dolu kutu sayaçları. */}
          {groups.length ? (
            <StatusTiles
              items={[
                { key: "g", label: "Grup", value: groups.filter((g) => g.group_kind !== "etap").length, tone: "brand", icon: "grid-outline" },
                { key: "e", label: "Etap", value: groups.filter((g) => g.group_kind === "etap").length, tone: "info", icon: "git-merge-outline" },
                { key: "t", label: "Dolu kutu", value: groups.reduce((n, g) => n + (g.team_count ?? 0), 0), tone: "win", icon: "shield-checkmark-outline" },
              ]}
            />
          ) : null}

          {/* Turnuva akışı: gruplar → etaplar, her düğümde doluluk. */}
          {groups.length ? <FlowStrip groups={groups} /> : null}

          {can.create || can.update ? (
            <View style={styles.tiles}>
              {can.create ? (
                <TileButton icon="construct-outline" tone="signature" title="Hazır statü" hint="Grup + eleme tek adımda" onPress={() => setBuilder(true)} style={styles.tile} />
              ) : null}
              {can.create ? <TileButton icon="add-circle-outline" tone="violet" title="Grup ekle" hint="Grup ya da etap" onPress={() => setGroupForm("new")} style={styles.tile} /> : null}
              {can.create && groups.length ? (
                <TileButton icon="copy-outline" tone="cyan" title="Kurguyu kopyala" hint="Başka sezona aktar" onPress={() => setCopying(true)} style={styles.tile} />
              ) : null}
              {can.update && groups.length ? (
                <TileButton
                  icon="refresh-outline"
                  tone="mint"
                  title={resolve.isPending ? "Çözülüyor…" : "Yeniden çöz"}
                  hint="Kontenjanları sonuçlardan"
                  onPress={() => !resolve.isPending && resolve.mutate(undefined)}
                  style={styles.tile}
                />
              ) : null}
            </View>
          ) : null}

          <OpsGroup title="Görünüm" icon="eye-outline" tone="violet">
            <ToggleField
              label="Genel puan tablosu gösterilsin"
              hint="Gruplu sezonda 'Genel' sekmesi"
              value={settings?.show_overall_standings !== false}
              disabled={!can.update}
              onChange={(v) => saveSettings.mutate({ showOverallStandings: v })}
            />
            <SegmentField
              label="Grup görünümü"
              value={settings?.group_display_mode === "agac" ? "agac" : "sekme"}
              options={[
                { key: "sekme", label: "Sekmeli" },
                { key: "agac", label: "Ağaç şeması" },
              ]}
              onChange={(v) => can.update && saveSettings.mutate({ groupDisplayMode: v })}
            />
          </OpsGroup>

          {!groups.length ? (
            <EmptyState
              icon="git-network-outline"
              variant="inline"
              title="Bu sezonda grup yok"
              body={can.create ? "Hazır statü ile tek adımda grup ve eleme turlarını kur ya da tek tek grup ekle." : "Bu sezon tek tablolu."}
            />
          ) : (
            <>
              <SectionHeader title="Gruplar ve etaplar" meta={`${groups.length} bölüm`} inset="flush" subtitle="Kutuya dokun: kaynağını seç · basılı tut: taşı ya da boşalt" />
              {groups.map((g, i) => (
                <Reveal key={g.id} index={i}>
                  <GroupCard
                    group={g}
                    canEdit={can.update}
                    onMenu={setGroupMenu}
                    onSlot={(group, slot) => setSlotEdit({ group, slot })}
                    onSlotMenu={(group, slot, index) => setSlotMenu({ group, slot, index })}
                  />
                </Reveal>
              ))}
            </>
          )}
        </>
      )}
      <ActionSheet
        visible={groupMenu != null}
        onClose={() => setGroupMenu(null)}
        title={groupMenu?.group_name}
        actions={
          groupMenu
            ? [
                { label: "Program ve fikstür", hint: "Eşleşmeler, maç oluşturma, galip seçimi", icon: "calendar-outline", onPress: () => setSchedule(groupMenu) },
                { label: "Düzenle", icon: "create-outline", hidden: !can.update, onPress: () => setGroupForm(groupMenu) },
                {
                  label: groupMenu.group_kind === "etap" ? "Eşleşme ekle" : "Takım kutusu ekle",
                  icon: "add-circle-outline",
                  hidden: !can.update,
                  onPress: () => void quickResize(groupMenu, (groupMenu.unit_count ?? 0) + 1),
                },
                {
                  label: "Sondan çıkar",
                  icon: "remove-circle-outline",
                  hidden: !can.update || !groupMenu.slot_count,
                  onPress: () => void quickResize(groupMenu, Math.max(0, (groupMenu.unit_count ?? 0) - 1)),
                },
                {
                  label: groupMenu.show_in_bracket === false ? "Ağaç şemasında göster" : "Ağaç şemasından gizle",
                  icon: "git-network-outline",
                  hidden: !can.update,
                  onPress: () => toggleBracket.mutate(groupMenu),
                },
                { label: "Sil", icon: "trash-outline", danger: true, hidden: !can.remove, onPress: () => void askDeleteGroup(groupMenu) },
              ]
            : []
        }
      />

      <ActionSheet
        visible={slotMenu != null}
        onClose={() => setSlotMenu(null)}
        title={slotMenu ? `${slotMenu.group.group_name} · ${slotMenu.slot.slot_order}. kutu` : undefined}
        actions={
          slotMenu
            ? [
                { label: "Kaynağı seç", icon: "create-outline", onPress: () => setSlotEdit({ group: slotMenu.group, slot: slotMenu.slot }) },
                {
                  label: "Yukarı taşı",
                  icon: "arrow-up",
                  disabled: slotMenu.index === 0,
                  onPress: () => moveSlot.mutate({ group: slotMenu.group, slot: slotMenu.slot, dir: "up" }),
                },
                {
                  label: "Aşağı taşı",
                  icon: "arrow-down",
                  disabled: slotMenu.index === slotMenu.group.slots.length - 1,
                  onPress: () => moveSlot.mutate({ group: slotMenu.group, slot: slotMenu.slot, dir: "down" }),
                },
                {
                  label: "Kutuyu boşalt",
                  icon: "close-circle-outline",
                  danger: true,
                  hidden: slotMenu.slot.source_type === "EMPTY",
                  onPress: () => void askClearSlot({ group: slotMenu.group, slot: slotMenu.slot }),
                },
              ]
            : []
        }
      />

      <FormSheet
        visible={groupForm != null}
        onClose={() => setGroupForm(null)}
        title={groupForm === "new" ? "Yeni grup" : "Grubu düzenle"}
        fields={groupFields}
        initial={
          groupForm && groupForm !== "new"
            ? {
                groupName: groupForm.group_name,
                groupKind: groupForm.group_kind,
                groupFormat: groupForm.group_format,
                doubleRound: groupForm.double_round,
                showInBracket: groupForm.show_in_bracket !== false,
                groupPriority: groupForm.group_priority ?? "",
                unitCount: String(groupForm.unit_count ?? 0),
              }
            : { groupKind: "grup", groupFormat: "fikstur", doubleRound: false, showInBracket: true, unitCount: "4" }
        }
        onSubmit={(v) => saveGroup.mutateAsync(v)}
      />

      <FormSheet
        visible={slotEdit != null}
        onClose={() => setSlotEdit(null)}
        title={slotEdit ? `${slotEdit.group.group_name} · ${slotEdit.slot.slot_order}. kutu` : "Kutu"}
        intro={
          slotEdit
            ? slotEdit.slot.source_type === "EMPTY"
              ? "Şu an boş."
              : `Şu an: ${slotEdit.slot.resolved_team_name || slotEdit.slot.source_label || "belirlenmedi"}`
            : undefined
        }
        fields={slotFields}
        initial={
          slotEdit
            ? {
                mode: slotEdit.slot.source_type && slotEdit.slot.source_type !== "EMPTY" ? slotEdit.slot.source_type : "TEAM",
                team_id: slotEdit.slot.team_id,
                source_group_id: slotEdit.slot.source_group_id ?? otherGroups[0]?.id ?? null,
                source_rank: slotEdit.slot.source_rank ?? "",
                source_matchup: slotEdit.slot.source_matchup ?? "",
              }
            : {}
        }
        secondary={
          slotEdit && slotEdit.slot.source_type !== "EMPTY"
            ? {
                label: "Boşalt",
                danger: true,
                onPress: () => {
                  const target = slotEdit;
                  setSlotEdit(null);
                  void askClearSlot(target);
                },
              }
            : undefined
        }
        onSubmit={(v) => saveSlot.mutateAsync(v)}
      />

      <FormSheet
        visible={copying}
        onClose={() => setCopying(false)}
        title="Kurguyu kopyala"
        intro="Bu sezonun grup ve etap kurgusu seçilen sezona kopyalanır; kutuların birbirine bağlantıları yeni gruplara eşlenir."
        fields={seasonFields}
        initial={{ mode: "append", includeTeams: false, includeSettings: true }}
        submitLabel="Kopyala"
        onSubmit={(v) => copy.mutateAsync(v)}
      />

      {seasonId ? (
        <StructureSheet
          visible={builder}
          onClose={() => setBuilder(false)}
          seasonId={seasonId}
          hasExisting={groups.length > 0}
          onBuilt={(message) => {
            toast.show({ message, tone: "success" });
            void refresh();
          }}
        />
      ) : null}

      <ScheduleSheet
        visible={schedule != null}
        onClose={() => setSchedule(null)}
        group={schedule ? groups.find((g) => g.id === schedule.id) ?? schedule : null}
        canEdit={can.update}
        invalidateKey={KEY}
      />
    </AdminScreen>
  );
}

/**
 * Turnuva akışı: grup aşaması tek sütunda, ardından her etap kendi sütununda;
 * sütunlar arasında ok. Düğümde ad + doluluk (dolu/kutu) ve ince doluluk çizgisi.
 */
function FlowStrip({ groups }: { groups: SeasonGroup[] }) {
  const pools = groups.filter((g) => g.group_kind !== "etap");
  const stages = groups.filter((g) => g.group_kind === "etap");
  const columns: { key: string; title: string; items: SeasonGroup[] }[] = [
    ...(pools.length ? [{ key: "pool", title: "Grup aşaması", items: pools }] : []),
    ...stages.map((g) => ({ key: String(g.id), title: g.group_name, items: [g] })),
  ];
  return (
    <View style={styles.flow} accessible accessibilityLabel={`Turnuva akışı: ${columns.map((c) => c.title).join(", sonra ")}`}>
      <Text style={styles.flowTitle} {...textScale.dense}>
        TURNUVA AKIŞI
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.flowRow}>
        {columns.map((col, ci) => (
          <View key={col.key} style={styles.flowColWrap}>
            {ci > 0 ? <Ionicons name="chevron-forward" size={16} color={colors.brandAccent} style={styles.flowArrow} /> : null}
            <View style={styles.flowCol}>
              {col.items.map((g) => {
                const filled = g.team_count ?? 0;
                const total = g.slot_count ?? 0;
                const full = total > 0 && filled >= total;
                return (
                  <View key={g.id} style={[styles.flowNode, g.group_kind === "etap" ? styles.flowNodeStage : null]}>
                    <View style={styles.flowNodeHead}>
                      <Ionicons name={g.group_kind === "etap" ? "git-merge-outline" : "grid-outline"} size={12} color={g.group_kind === "etap" ? colors.accentText : colors.brandAccent} />
                      <Text style={styles.flowNodeName} numberOfLines={1} {...textScale.dense}>
                        {g.group_name}
                      </Text>
                    </View>
                    <Text style={[styles.flowNodeCount, full ? { color: colors.win } : null]} {...textScale.badge}>
                      {filled}/{total}
                      <Text style={styles.flowNodeUnit}>{g.group_kind === "etap" ? ` · ${g.matchup_count} eşl.` : " takım"}</Text>
                    </Text>
                    <View style={styles.flowBar}>
                      <View style={[styles.flowBarFill, { width: `${total ? Math.min(100, (filled / total) * 100) : 0}%`, backgroundColor: full ? colors.win : colors.brandAccent }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { gap: space.md },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: { flexBasis: "47%", flexGrow: 1 },
  flow: {
    gap: space.m,
    paddingVertical: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  flowTitle: { ...type.overline, color: colors.textSecondary, paddingHorizontal: space.lg },
  flowRow: { paddingHorizontal: space.lg, alignItems: "center" },
  flowColWrap: { flexDirection: "row", alignItems: "center" },
  flowArrow: { marginHorizontal: space.xs },
  flowCol: { gap: space.sm },
  flowNode: {
    width: 116,
    gap: space.xxs,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  flowNodeStage: { backgroundColor: colors.surface2, borderColor: colors.glassLine },
  flowNodeHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  flowNodeName: { ...type.labelXs, color: colors.textPrimary, flex: 1 },
  flowNodeCount: { ...type.numSmStrong, color: colors.textPrimary },
  flowNodeUnit: { ...type.meta, color: colors.textTertiary },
  flowBar: { height: 3, borderRadius: 2, backgroundColor: colors.surface3, overflow: "hidden", marginTop: space.xxs },
  flowBarFill: { height: 3, borderRadius: 2 },
});
