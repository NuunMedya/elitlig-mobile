/**
 * MAÇ İSTATİSTİĞİ GİRİŞİ (web Enter_Stats) — PlayerStatistics satırları.
 *
 * Kadrodaki her oyuncu için gol (+ dakikaları), sarı / kırmızı kart, kendi
 * kalesine gol (+ dakikaları), puan ve mevki. Kayıtlı satır PATCH, yeni satır
 * POST edilir; satır silinebilir. Sunucu her yazımda maçın özet tablolarını
 * yeniden kurar (enqueueMatchRebuild).
 *
 * NEDEN OYUNCU/TAKIM TOPLAMLARI YAZILMIYOR: eski web ekranı kayıttan sonra
 * oyuncunun ve takımın toplamlarını istemcide artırıp PATCH ediyordu; aynı
 * maç iki kez kaydedilince toplamlar iki kez artıyordu. Toplamlar artık
 * sunucuda istatistik satırlarından türetilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChipsField, confirmAction, useAdminMutation } from "@/components/admin";
import { BottomSheet, Button, EmptyState, Input, SkeletonListRow, Stepper, Touchable } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import {
  createPlayerStat,
  deletePlayerStat,
  getMatchStats,
  updatePlayerStat,
  type AdminMatch,
  type PlayerStatInput,
  type PlayerStatRow,
} from "@/lib/api/admin/matches";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { POSITIONS, type Side, type SquadPlayer } from "./model";
import { Note, SidePicker } from "./parts";

interface Draft {
  number_of_goals: number;
  goals_minutes: string;
  yellow_card: number;
  red_card: number;
  goal_to_himself: number;
  goal_to_himself_minutes: string;
  points: number;
  player_position: string;
}

const EMPTY: Draft = {
  number_of_goals: 0,
  goals_minutes: "",
  yellow_card: 0,
  red_card: 0,
  goal_to_himself: 0,
  goal_to_himself_minutes: "",
  points: 0,
  player_position: "",
};

export function StatsEditor({ match, squads }: { match: AdminMatch; squads: Record<Side, SquadPlayer[]> }) {
  const auth = useAuth();
  const matchId = Number(match.id);
  const canEdit = hasAnyPermission(auth.user, ["matches.stats"]);
  const homeTeamId = Number(match.home_team_id) || null;
  const awayTeamId = Number(match.away_team_id) || null;
  const [side, setSide] = useState<Side>("home");
  const [editing, setEditing] = useState<{ player: SquadPlayer; row: PlayerStatRow | null } | null>(null);

  const statsKey = ["admin", "matches", "stats", matchId] as const;
  const statsQuery = useQuery({ queryKey: statsKey, queryFn: () => getMatchStats(matchId) });

  const byPlayer = useMemo(() => {
    const map = new Map<string, PlayerStatRow>();
    for (const row of statsQuery.data ?? []) map.set(String(row.player_id), row);
    return map;
  }, [statsQuery.data]);

  const players = squads[side].filter((p) => p.role !== "reserve");
  const teamId = side === "home" ? homeTeamId : awayTeamId;
  const opponentId = side === "home" ? awayTeamId : homeTeamId;
  const entered = players.filter((p) => byPlayer.has(p.id)).length;

  return (
    <View style={styles.stack}>
      <Note text="Kadrodaki oyuncular için maç istatistiğini gir. Gol ve kart canlı akışta girildiyse burada yalnız eksikleri tamamla." />
      <SidePicker value={side} onChange={setSide} homeName={match.first_team_name || "Ev sahibi"} awayName={match.second_team_name || "Deplasman"} />
      <Text style={styles.summary} {...textScale.dense}>
        {entered} / {players.length} oyuncunun istatistiği girildi
      </Text>
      {statsQuery.isLoading ? (
        <SkeletonListRow count={5} />
      ) : players.length === 0 ? (
        <EmptyState icon="people-outline" title="Kadro boş" body="İstatistik girmek için önce Kadro adımında oyuncuları seç." variant="inline" />
      ) : (
        players.map((p) => {
          const row = byPlayer.get(p.id) ?? null;
          return (
            <Touchable
              key={p.id}
              onPress={canEdit ? () => setEditing({ player: p, row }) : undefined}
              style={[styles.row, row ? styles.rowOn : null]}
              accessibilityRole="button"
              accessibilityLabel={`${p.name} istatistiği`}
            >
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                  {p.number ? `#${p.number} ` : ""}
                  {p.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                  {row
                    ? [
                        `${row.number_of_goals} gol`,
                        row.yellow_card ? "sarı kart" : null,
                        row.red_card ? "kırmızı kart" : null,
                        row.goal_to_himself ? `${row.goal_to_himself} kendi kalesine` : null,
                        `${row.points} puan`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "Girilmedi"}
                </Text>
              </View>
              <Ionicons name={row ? "checkmark-circle" : "add-circle-outline"} size={20} color={row ? colors.win : colors.textTertiary} />
            </Touchable>
          );
        })
      )}

      <StatSheet
        target={editing}
        onClose={() => setEditing(null)}
        base={{ match_id: matchId, team_id: teamId, opponent_team_id: opponentId }}
        statsKey={statsKey}
      />
    </View>
  );
}

function StatSheet({
  target,
  onClose,
  base,
  statsKey,
}: {
  target: { player: SquadPlayer; row: PlayerStatRow | null } | null;
  onClose: () => void;
  base: { match_id: number; team_id: number | null; opponent_team_id: number | null };
  statsKey: readonly unknown[];
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);

  useEffect(() => {
    if (!target) return;
    const r = target.row;
    setDraft(
      r
        ? {
            number_of_goals: Number(r.number_of_goals) || 0,
            goals_minutes: r.goals_minutes ?? "",
            yellow_card: Number(r.yellow_card) || 0,
            red_card: Number(r.red_card) || 0,
            goal_to_himself: Number(r.goal_to_himself) || 0,
            goal_to_himself_minutes: r.goal_to_himself_minutes ?? "",
            points: Number(r.points) || 0,
            player_position: r.player_position ?? target.player.position ?? "",
          }
        : { ...EMPTY, player_position: target.player.position || "" }
    );
  }, [target]);

  const save = useAdminMutation(
    async () => {
      if (!target) return;
      const body: PlayerStatInput = {
        player_id: Number(target.player.id),
        match_id: base.match_id,
        team_id: base.team_id as number,
        opponent_team_id: base.opponent_team_id,
        ...draft,
      };
      if (target.row) await updatePlayerStat(target.row.id, body);
      else await createPlayerStat(body);
    },
    { success: "İstatistik kaydedildi.", invalidate: [statsKey], onSuccess: onClose }
  );

  const remove = useAdminMutation(async () => target?.row && deletePlayerStat(target.row.id), {
    success: "İstatistik silindi.",
    invalidate: [statsKey],
    onSuccess: onClose,
  });

  const askRemove = async () => {
    const ok = await confirmAction({ title: "İstatistiği sil", message: `${target?.player.name} için girilen satır silinsin mi?`, confirmLabel: "Sil", destructive: true });
    if (ok) remove.mutate(undefined);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <BottomSheet
      visible={target != null}
      onClose={onClose}
      title={target?.player.name}
      snap="full"
      footer={
        <View style={styles.footer}>
          {target?.row ? <Button label="Sil" variant="danger" onPress={askRemove} loading={remove.isPending} /> : null}
          <Button label="Kaydet" onPress={() => save.mutate(undefined)} loading={save.isPending} disabled={!base.team_id} style={styles.flex} haptic="success" />
        </View>
      }
    >
      <View style={styles.stack}>
        <Counter label="Gol" value={draft.number_of_goals} onChange={(v) => set("number_of_goals", v)} max={20} />
        {draft.number_of_goals > 0 ? (
          <Input label="Gol dakikaları" value={draft.goals_minutes} onChangeText={(t) => set("goals_minutes", t)} placeholder="Ör. 12, 40" keyboardType="numbers-and-punctuation" />
        ) : null}
        <Counter label="Sarı kart" value={draft.yellow_card} onChange={(v) => set("yellow_card", v)} max={2} />
        <Counter label="Kırmızı kart" value={draft.red_card} onChange={(v) => set("red_card", v)} max={1} />
        <Counter label="Kendi kalesine gol" value={draft.goal_to_himself} onChange={(v) => set("goal_to_himself", v)} max={10} />
        {draft.goal_to_himself > 0 ? (
          <Input
            label="Kendi kalesine gol dakikaları"
            value={draft.goal_to_himself_minutes}
            onChangeText={(t) => set("goal_to_himself_minutes", t)}
            placeholder="Ör. 33"
            keyboardType="numbers-and-punctuation"
          />
        ) : null}
        <Counter label="Puan" value={draft.points} onChange={(v) => set("points", v)} max={10} />
        <ChipsField<string>
          label="Mevki"
          value={draft.player_position || null}
          options={POSITIONS}
          onChange={(v) => set("player_position", typeof v === "string" ? v : "")}
        />
        {!base.team_id ? <Note tone="warn" text="Maçın takım kimliği eksik; istatistik kaydedilemez." /> : null}
      </View>
    </BottomSheet>
  );
}

function Counter({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  return (
    <View style={styles.counter}>
      <Text style={styles.counterLabel} {...textScale.dense}>
        {label}
      </Text>
      <Stepper value={value} onChange={onChange} min={0} max={max} size="sm" accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  flex: { flex: 1 },
  footer: { flexDirection: "row", gap: space.sm },
  summary: { ...type.caption, color: colors.textTertiary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  rowOn: { borderColor: colors.winDim },
  rowText: { flex: 1, gap: 2 },
  name: { ...type.label, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  counter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  counterLabel: { ...type.label, color: colors.textSecondary },
});
