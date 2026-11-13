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
import { Badge, BottomSheet, Button, EmptyState, GradientBar, IconTile, Input, SkeletonListRow, Stepper, Touchable, type IconTileTone } from "@/components/ui";
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
import { OpsGroup } from "./opsKit";
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

  const ratio = players.length ? entered / players.length : 0;

  return (
    <View style={styles.stack}>
      <SidePicker value={side} onChange={setSide} homeName={match.first_team_name || "Ev sahibi"} awayName={match.second_team_name || "Deplasman"} />
      {statsQuery.isLoading ? (
        <SkeletonListRow count={5} />
      ) : players.length === 0 ? (
        <EmptyState icon="people-outline" title="Kadro boş" body="İstatistik girmek için önce Kadro adımında oyuncuları seç." variant="inline" />
      ) : (
        <OpsGroup
          title="Oyuncu istatistikleri"
          hint="Gol ve kart canlı akışta girildiyse burada yalnız eksikleri tamamla."
          right={
            <Text style={[styles.count, entered === players.length ? { color: colors.win } : null]} {...textScale.badge}>
              {entered}
              <Text style={styles.countOf}>/{players.length}</Text>
            </Text>
          }
          flush
        >
          <View style={styles.progress}>
            <GradientBar value={ratio} height={4} />
          </View>
          {players.map((p, index) => {
            const row = byPlayer.get(p.id) ?? null;
            return (
              <Touchable
                key={p.id}
                onPress={canEdit ? () => setEditing({ player: p, row }) : undefined}
                feedback="row"
                style={[styles.row, index > 0 ? styles.rowDivider : null]}
                accessibilityRole="button"
                accessibilityLabel={`${p.name} istatistiği, ${row ? "girildi" : "girilmedi"}`}
              >
                <View style={[styles.shirt, row ? styles.shirtOn : null]}>
                  <Text style={[styles.shirtNo, row ? styles.shirtNoOn : null]} {...textScale.badge}>
                    {p.number || "–"}
                  </Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                    {p.name}
                  </Text>
                  {row ? (
                    <View style={styles.facts}>
                      {Number(row.number_of_goals) > 0 ? <Fact icon="football" text={String(row.number_of_goals)} /> : null}
                      {Number(row.yellow_card) > 0 ? <Fact card={colors.warn} text={String(row.yellow_card)} /> : null}
                      {Number(row.red_card) > 0 ? <Fact card={colors.danger} text={String(row.red_card)} /> : null}
                      {Number(row.goal_to_himself) > 0 ? <Fact icon="football" tint={colors.danger} text={`${row.goal_to_himself} k.k.`} /> : null}
                      <Fact icon="star" tint={colors.brandAccent} text={`${row.points} puan`} />
                    </View>
                  ) : (
                    <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                      {[p.role === "starter" ? "İlk 11" : "Yedek", p.position].filter(Boolean).join(" · ")} · girilmedi
                    </Text>
                  )}
                </View>
                {row ? <Badge label="Girildi" tone="win" size="xs" /> : <Ionicons name="add-circle-outline" size={22} color={colors.brandAccent} />}
              </Touchable>
            );
          })}
        </OpsGroup>
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

/** Satır içi küçük istatistik: ikon (ya da kart dikdörtgeni) + değer. */
function Fact({ icon, card, tint, text }: { icon?: keyof typeof Ionicons.glyphMap; card?: string; tint?: string; text: string }) {
  return (
    <View style={styles.fact}>
      {card ? <View style={[styles.factCard, { backgroundColor: card }]} /> : icon ? <Ionicons name={icon} size={11} color={tint ?? colors.textSecondary} /> : null}
      <Text style={styles.factText} {...textScale.badge}>
        {text}
      </Text>
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
        <View style={styles.sheetSection}>
          <Text style={styles.sectionTitle} {...textScale.dense}>
            GOLLER
          </Text>
          <Counter icon="football-outline" tone="mint" label="Gol" value={draft.number_of_goals} onChange={(v) => set("number_of_goals", v)} max={20} />
          {draft.number_of_goals > 0 ? (
            <Input label="Gol dakikaları" floating value={draft.goals_minutes} onChangeText={(t) => set("goals_minutes", t)} placeholder="Ör. 12, 40" keyboardType="numbers-and-punctuation" />
          ) : null}
          <Counter icon="return-down-back-outline" tone="red" label="Kendi kalesine gol" value={draft.goal_to_himself} onChange={(v) => set("goal_to_himself", v)} max={10} divider />
          {draft.goal_to_himself > 0 ? (
            <Input
              label="Kendi kalesine gol dakikaları"
              floating
              value={draft.goal_to_himself_minutes}
              onChangeText={(t) => set("goal_to_himself_minutes", t)}
              placeholder="Ör. 33"
              keyboardType="numbers-and-punctuation"
            />
          ) : null}
        </View>
        <View style={styles.sheetSection}>
          <Text style={styles.sectionTitle} {...textScale.dense}>
            DİSİPLİN
          </Text>
          <Counter icon="square" tone="gold" label="Sarı kart" value={draft.yellow_card} onChange={(v) => set("yellow_card", v)} max={2} />
          <Counter icon="square" tone="red" label="Kırmızı kart" value={draft.red_card} onChange={(v) => set("red_card", v)} max={1} divider />
        </View>
        <View style={styles.sheetSection}>
          <Text style={styles.sectionTitle} {...textScale.dense}>
            DEĞERLENDİRME
          </Text>
          <Counter icon="star-outline" tone="violet" label="Puan" value={draft.points} onChange={(v) => set("points", v)} max={10} />
          <ChipsField<string>
            label="Mevki"
            value={draft.player_position || null}
            options={POSITIONS}
            onChange={(v) => set("player_position", typeof v === "string" ? v : "")}
          />
        </View>
        {!base.team_id ? <Note tone="warn" text="Maçın takım kimliği eksik; istatistik kaydedilemez." /> : null}
      </View>
    </BottomSheet>
  );
}

function Counter({
  label,
  value,
  onChange,
  max,
  icon,
  tone = "violet",
  divider,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: IconTileTone;
  divider?: boolean;
}) {
  return (
    <View style={[styles.counter, divider ? styles.counterDivider : null]}>
      {icon ? <IconTile icon={icon} tone={tone} size={32} glow={false} /> : null}
      <Text style={styles.counterLabel} numberOfLines={1} {...textScale.dense}>
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
  count: { ...type.scoreSm, color: colors.textPrimary },
  countOf: { ...type.numSm, color: colors.textTertiary },
  progress: { paddingHorizontal: space.lg, paddingBottom: space.s },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 60,
    paddingHorizontal: space.lg,
    paddingVertical: space.s,
  },
  rowDivider: { borderTopWidth: hairline, borderTopColor: colors.separator },
  rowText: { flex: 1, gap: space.xxs, minWidth: 0 },
  shirt: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  shirtOn: { backgroundColor: colors.winDim, borderColor: colors.win },
  shirtNo: { ...type.numSmStrong, color: colors.textSecondary },
  shirtNoOn: { color: colors.win },
  name: { ...type.h4, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.s,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  factCard: { width: 7, height: 10, borderRadius: 1.5 },
  factText: { ...type.numSm, color: colors.textSecondary },
  sheetSection: {
    gap: space.m,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  sectionTitle: { ...type.overline, color: colors.textTertiary },
  counter: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 44 },
  counterDivider: { borderTopWidth: hairline, borderTopColor: colors.separator, paddingTop: space.m },
  counterLabel: { ...type.h4, color: colors.textPrimary, flex: 1 },
});
