/**
 * Takım profili → Oyuncular (web TeamProfileAdmin "players" sekmesi).
 *
 * Kalıcı kadro (oyuncu-takım bağı). Yönetim buradan oyuncu ekler (arama),
 * çıkarır, başka takıma transfer eder ve seçili sezonun kadrosuna ekler.
 * Toplu işlem: satıra basılı tutunca seçim açılır; seçilenler tek işlemde
 * çıkarılır ya da Oyuncu birleştirme ekranında karşılaştırılır.
 */

import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ActionSheet,
  OptionSheet,
  Panel,
  RecordCard,
  SelectField,
  confirmAction,
  useAdminMutation,
} from "@/components/admin";
import { Button, Chip, ChipGroup, EmptyState } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { formatDate } from "@/lib/admin/format";
import { playerOptionsLoader, teamOptionsLoader } from "@/lib/api/admin/lookups";
import { ageOf, positionLabel } from "@/lib/api/admin/players";
import {
  addPlayerToTeam,
  addSeasonRosterPlayer,
  removePlayerFromTeam,
  removePlayersFromTeam,
  transferPlayer,
  type TeamOverview,
  type TeamPlayerRow,
} from "@/lib/api/admin/teams";
import type { AuthUser } from "@/lib/types";
import { colors, space, textScale, type } from "@/theme";

type Sort = "matches" | "name" | "jersey" | "last";

export function TeamPlayersTab({
  data,
  user,
  invalidate,
}: {
  data: TeamOverview;
  user: AuthUser | null;
  invalidate: readonly (readonly unknown[])[];
}) {
  const router = useRouter();
  const team = data.team;
  const canMerge = hasPermission(user, "players.merge");
  const [sort, setSort] = useState<Sort>("matches");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [menu, setMenu] = useState<TeamPlayerRow | null>(null);
  const [transferFor, setTransferFor] = useState<TeamPlayerRow | null>(null);
  const [seasonFor, setSeasonFor] = useState<{ player: TeamPlayerRow; licensed: boolean } | null>(null);
  const [adding, setAdding] = useState<number | null>(null);

  const memberIds = useMemo(() => new Set(data.seasons.flatMap((s) => s.members.map((m) => m.player_id))), [data.seasons]);
  const playerIds = data.players.map((p) => p.id);
  const sorted = useMemo(() => {
    const list = [...data.players];
    const time = (v?: string | null) => (v ? new Date(v).getTime() : 0);
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    else if (sort === "jersey") list.sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
    else if (sort === "last") list.sort((a, b) => time(b.history?.last_match_date) - time(a.history?.last_match_date));
    else list.sort((a, b) => (b.history?.matches ?? 0) - (a.history?.matches ?? 0) || a.name.localeCompare(b.name, "tr"));
    return list;
  }, [data.players, sort]);

  const add = useAdminMutation(
    ({ id, name }: { id: number; name: string }) => addPlayerToTeam({ playerId: id, playerName: name, teamId: team.id, teamName: team.team_name }),
    { success: "Oyuncu takım kadrosuna eklendi.", invalidate: [...invalidate] }
  );
  const remove = useAdminMutation((p: TeamPlayerRow) => removePlayerFromTeam(p.id, team.id), {
    success: "Oyuncu takım kadrosundan çıkarıldı.",
    invalidate: [...invalidate],
  });
  const removeMany = useAdminMutation((ids: number[]) => removePlayersFromTeam(team.id, ids), {
    success: (r) => r?.message || "Oyuncular çıkarıldı.",
    invalidate: [...invalidate],
    onSuccess: () => setSelected(new Set()),
  });
  const transfer = useAdminMutation(
    ({ player, toTeamId }: { player: TeamPlayerRow; toTeamId: number }) => transferPlayer({ playerId: player.id, fromTeamId: team.id, toTeamId }),
    { success: (r) => r?.message || "Oyuncu transfer edildi.", invalidate: [...invalidate] }
  );
  const addToSeason = useAdminMutation(
    ({ player, seasonId, licensed }: { player: TeamPlayerRow; seasonId: number; licensed: boolean }) =>
      addSeasonRosterPlayer(team.id, seasonId, player.id, licensed),
    { success: "Oyuncu sezon kadrosuna eklendi.", invalidate: [...invalidate] }
  );

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const askAdd = async (id: number | null, label?: string) => {
    if (!id) return;
    setAdding(null);
    const name = label || `Oyuncu #${id}`;
    const ok = await confirmAction({
      title: "Takım kadrosuna eklensin mi?",
      message: `${name}, ${team.team_name} kadrosuna eklenecek.`,
      confirmLabel: "Ekle",
    });
    if (ok) add.mutate({ id, name });
  };

  const askRemove = async (p: TeamPlayerRow) => {
    const ok = await confirmAction({
      title: "Kadrodan çıkarılsın mı?",
      message: `${p.name}, ${team.team_name} kadrosundan çıkarılacak. Maç geçmişi silinmez.`,
      confirmLabel: "Çıkar",
      destructive: true,
    });
    if (ok) remove.mutate(p);
  };

  const askRemoveMany = async () => {
    const ids = [...selected];
    const ok = await confirmAction({
      title: `${ids.length} oyuncu çıkarılsın mı?`,
      message: "Seçilen oyuncuların bu takımla kadro bağı tek işlemde kaldırılır.",
      confirmLabel: "Çıkar",
      destructive: true,
    });
    if (ok) removeMany.mutate(ids);
  };

  const historyText = (p: TeamPlayerRow) => {
    const h = p.history;
    if (!h) return null;
    if (!h.matches) return "Kayıtlı maçı yok";
    return [`${h.matches} maç`, `${h.team_matches ?? 0} bu takımda`, `${h.goals ?? 0} gol`, h.last_match_date ? `son: ${formatDate(h.last_match_date)}` : null]
      .filter(Boolean)
      .join(" · ");
  };

  return (
    <View style={styles.stack}>
      <SelectField<number>
        value={adding}
        onChange={(v, option) => void askAdd(v, option?.label)}
        loadOptions={playerOptionsLoader(user, { exclude: playerIds })}
        queryKey={["admin", "players", "options", team.id]}
        placeholder="Oyuncu ekle: ad yazın…"
        icon="person-add-outline"
        sheetTitle="Kadroya oyuncu ekle"
      />
      <ChipGroup scrollable contentPadding={0}>
        {(
          [
            ["matches", "En çok maç"],
            ["name", "A-Z"],
            ["jersey", "Forma no"],
            ["last", "Son maç"],
          ] as [Sort, string][]
        ).map(([key, label]) => (
          <Chip key={key} label={label} size="sm" selected={sort === key} onPress={() => setSort(key)} />
        ))}
      </ChipGroup>

      {selected.size ? (
        <Panel title={`${selected.size} OYUNCU SEÇİLDİ`} action={{ label: "Seçimi temizle", onPress: () => setSelected(new Set()) }}>
          <View style={styles.bulk}>
            <Button label="Seçilenleri çıkar" icon="person-remove-outline" variant="danger" size="sm" onPress={() => void askRemoveMany()} />
            {canMerge ? (
              <Button
                label="Birleştir"
                icon="git-merge-outline"
                variant="secondary"
                size="sm"
                disabled={selected.size < 2}
                onPress={() => router.push(`/yonetim/oyuncu-birlestirme?players=${[...selected].join(",")}`)}
              />
            ) : null}
          </View>
        </Panel>
      ) : (
        <Text style={styles.hint} {...textScale.dense}>
          Toplu işlem için oyuncuya basılı tut.
        </Text>
      )}

      {!data.players.length ? (
        <EmptyState icon="people-outline" variant="inline" title="Takımda oyuncu yok" body="Yukarıdaki aramayla oyuncu ekle." />
      ) : (
        sorted.map((p) => {
          const age = ageOf(p.birth_date);
          const on = selected.has(p.id);
          return (
            <RecordCard
              key={p.id}
              title={`${p.jersey_number != null ? `#${p.jersey_number} ` : ""}${p.name}`}
              subtitle={[positionLabel(p.position) || "Mevki yok", age != null ? `${age} yaş` : null, p.nationality].filter(Boolean).join(" · ")}
              meta={historyText(p)}
              avatar={{ name: p.name, image: p.image }}
              muted={p.active === false}
              style={on ? styles.selected : undefined}
              badges={[
                on && { label: "Seçili", tone: "brand", icon: "checkmark" },
                p.is_loan && { label: "Kiralık", tone: "warn" },
                p.linked_user_id ? { label: "Üye hesabı var", tone: "info" } : { label: "Hesapsız" },
                memberIds.has(p.id) && { label: "Sezon kadrosunda", tone: "win" },
              ]}
              onPress={() => (selected.size && !p.is_loan ? toggle(p.id) : setMenu(p))}
              onLongPress={p.is_loan ? undefined : () => toggle(p.id)}
            />
          );
        })
      )}

      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.name}
        actions={
          menu
            ? [
                { label: "Oyuncu profili", icon: "person-outline", onPress: () => router.push(`/yonetim/oyuncular/${menu.id}`) },
                {
                  label: "Sezon kadrosuna ekle",
                  icon: "list-outline",
                  hidden: !data.seasons.length,
                  onPress: () => setSeasonFor({ player: menu, licensed: false }),
                },
                {
                  label: "Lisanslı olarak sezon kadrosuna ekle",
                  icon: "id-card-outline",
                  hidden: !data.seasons.length,
                  onPress: () => setSeasonFor({ player: menu, licensed: true }),
                },
                { label: "Transfer et", hint: "Başka takıma taşı", icon: "swap-horizontal-outline", hidden: menu.is_loan, onPress: () => setTransferFor(menu) },
                { label: "Kadrodan çıkar", icon: "person-remove-outline", danger: true, hidden: menu.is_loan, onPress: () => void askRemove(menu) },
              ]
            : []
        }
      />

      <OptionSheet<number>
        visible={transferFor != null}
        onClose={() => setTransferFor(null)}
        title="Hangi takıma transfer edilsin?"
        loadOptions={teamOptionsLoader(user, { exclude: [team.id] })}
        queryKey={["admin", "teams", "options", "transfer", team.id]}
        onSelect={(v, option) => {
          const player = transferFor;
          const label = Array.isArray(option) ? option[0]?.label : option?.label;
          if (!player || v == null) return;
          void confirmAction({
            title: "Transfer edilsin mi?",
            message: `${player.name}, ${team.team_name} takımından ${label ?? "seçilen takıma"} geçecek. Sezon kadrosu üyelikleri bu işlemle değişmez.`,
            confirmLabel: "Transfer et",
          }).then((ok) => ok && transfer.mutate({ player, toTeamId: v as number }));
        }}
      />

      <OptionSheet<number>
        visible={seasonFor != null}
        onClose={() => setSeasonFor(null)}
        title={seasonFor?.licensed ? "Lisanslı ekle: sezon" : "Sezon kadrosuna ekle"}
        options={data.seasons.map((s) => ({
          value: s.season_id,
          label: s.season?.season_name || `Sezon #${s.season_id}`,
          hint: s.season?.league_name ?? null,
        }))}
        onSelect={(v) => {
          const target = seasonFor;
          if (target && v != null) addToSeason.mutate({ player: target.player, seasonId: v as number, licensed: target.licensed });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  bulk: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  hint: { ...type.caption, color: colors.textTertiary },
  selected: { borderColor: colors.brandAccent },
});
