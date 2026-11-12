/**
 * YENİ CEZA — disiplin sevki oluşturma (web /editor/cezalar/yeni, PenaltyCreate.js).
 *
 * ADIMLAR (tek kaydırmalı ekran, adım tamamlandıkça sıradaki açılır):
 *   1. Kapsam  — il → lig → sezon (GET /api/meta/...)
 *   2. Maç     — kapsamdaki maçlar (GET /api/penalties/admin/matches), aranabilir
 *   3. Oyuncu  — maç kadrosundaki oyuncular (…/matches/:id/players); takım
 *               oyuncunun o maçtaki kadrosundan gelir
 *   4. Ceza    — aşama, süre türü (maç men / süresiz), maç sayısı, karar metni
 *
 * KAYIT: POST /api/penalties sevki açar; sevk dışında bir aşama ya da süre
 * seçildiyse ardından PATCH ile güncellenir (web ile aynı iki adım). Başarıda
 * dosyanın ayrıntısına geçilir.
 *
 * Sunucu modelinde "madde", "tür" ya da para cezası "tutarı" alanı yoktur;
 * ceza maç sayısı ya da süresiz ihraç olarak tutulur ve gerekçe karar
 * metnine yazılır.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";

import { AdminScreen, SelectField, useAdminMutation } from "@/components/admin";
import { durationBody, PenaltyDecisionFields, type DecisionValue } from "@/components/admin/penalties/PenaltyBits";
import { ScopeSelects, type ScopeValue } from "@/components/admin/penalties/ScopeSelects";
import { GroupCard, ListLine, PositionAvatar } from "@/components/admin/team/ManageKit";
import { Button, EmptyState, ErrorState, GradientBar, IconTile, Input, Reveal, SkeletonListRow } from "@/components/ui";
import { formatDate } from "@/lib/admin/format";
import {
  createPenalty,
  listPenaltyMatches,
  listPenaltyMatchPlayers,
  updatePenalty,
  type PenaltyMatch,
  type PenaltyMatchPlayer,
} from "@/lib/api/admin/penalties";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export default function PenaltyCreateScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<ScopeValue>({ cityId: null, leagueId: null, seasonId: null });
  const [matchId, setMatchId] = useState<number | null>(null);
  const [player, setPlayer] = useState<PenaltyMatchPlayer | null>(null);
  const [playerQuery, setPlayerQuery] = useState("");
  const [decision, setDecision] = useState<DecisionValue>({ status: "sevk", duration_type: "", match_count: "" });
  const [karar, setKarar] = useState("");

  const scopeReady = scope.cityId != null && scope.leagueId != null && scope.seasonId != null;

  const matches = useQuery({
    queryKey: ["admin", "penalties", "matches", scope],
    queryFn: () => listPenaltyMatches({ city_id: scope.cityId!, league_id: scope.leagueId!, season_id: scope.seasonId! }),
    enabled: scopeReady,
  });
  const match: PenaltyMatch | null = useMemo(() => matches.data?.find((m) => m.id === matchId) ?? null, [matches.data, matchId]);

  const players = useQuery({
    queryKey: ["admin", "penalties", "match-players", matchId],
    queryFn: () => listPenaltyMatchPlayers(matchId!),
    enabled: matchId != null,
  });

  const shownPlayers = useMemo(() => {
    const needle = playerQuery.trim().toLocaleLowerCase("tr-TR");
    const list = players.data ?? [];
    return needle ? list.filter((p) => `${p.player_name} ${p.team_name ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle)) : list;
  }, [players.data, playerQuery]);

  const save = useAdminMutation(
    async () => {
      if (!player || !scopeReady) throw new Error("Cezalandırılacak oyuncu seçilmelidir.");
      const created = await createPenalty({
        city_id: scope.cityId!,
        league_id: scope.leagueId!,
        season_id: scope.seasonId!,
        match_id: match?.id ?? null,
        match_label: match?.label ?? null,
        player_id: player.player_id,
        team_id: player.team_id ?? null,
        team_name: player.team_name ?? null,
        disiplin_karari: karar.trim() || null,
      });
      // Sevk dışında bir aşama ya da süre seçildiyse kayıt hemen güncellenir.
      if (decision.status !== "sevk" || decision.duration_type) {
        await updatePenalty(created.public_id, {
          status: decision.status,
          ...durationBody(decision),
          disiplin_karari: karar.trim() || undefined,
        });
      }
      return created;
    },
    {
      success: "Ceza kaydı oluşturuldu.",
      invalidate: [["admin", "penalties"]],
      onSuccess: (created) => router.replace(`/yonetim/cezalar/${encodeURIComponent(created.public_id)}` as Href),
    }
  );

  /* Adım ilerlemesi: kapsam → maç → oyuncu → ceza. */
  const step = !scopeReady ? 1 : matchId == null ? 2 : !player ? 3 : 4;
  const STEPS = ["Kapsam", "Maç", "Oyuncu", "Ceza"];

  return (
    <AdminScreen title="Yeni ceza" subtitle="Disiplin sevki oluştur" permission={["penalties.create"]}>
      <View style={styles.stepper} accessible accessibilityLabel={`Adım ${step} / 4: ${STEPS[step - 1]}`}>
        <View style={styles.stepRow}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const now = n === step;
            return (
              <View key={label} style={styles.stepCell}>
                <View style={[styles.stepDot, done ? styles.stepDone : null, now ? styles.stepNow : null]}>
                  {done ? (
                    <Ionicons name="checkmark" size={13} color={colors.textOnBrand} />
                  ) : (
                    <Text style={[styles.stepNum, now ? styles.stepNumNow : null]} {...textScale.badge}>
                      {n}
                    </Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, now || done ? styles.stepLabelOn : null]} {...textScale.badge}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
        <GradientBar value={(step - 1) / 3} height={4} />
      </View>

      <GroupCard title="Kapsam" step={1}>
        <ScopeSelects
          value={scope}
          required
          onChange={(next) => {
            setScope(next);
            setMatchId(null);
            setPlayer(null);
          }}
        />
      </GroupCard>

      {scopeReady ? (
        <Reveal>
          <GroupCard title="Cezaya konu maç" step={2}>
            {matches.error ? (
              <ErrorState error={matches.error} onRetry={matches.refetch} variant="inline" />
            ) : (
              <SelectField<number>
                label="Maç"
                required
                value={matchId}
                options={(matches.data ?? []).map((m) => ({ value: m.id, label: m.label, hint: m.date ? formatDate(m.date) : null }))}
                placeholder={matches.isLoading ? "Maçlar yükleniyor" : matches.data?.length ? "Maç seç" : "Bu kapsamda maç yok"}
                disabled={!matches.data?.length}
                icon="football-outline"
                onChange={(value) => {
                  setMatchId(value);
                  setPlayer(null);
                  setPlayerQuery("");
                }}
              />
            )}
            {match ? (
              <View style={styles.matchCard}>
                <Text style={styles.matchTeam} numberOfLines={1} {...textScale.dense}>
                  {match.first_team_name}
                </Text>
                <View style={styles.vs}>
                  <Text style={styles.vsText} {...textScale.badge}>
                    {match.date ? formatDate(match.date, false) : "VS"}
                  </Text>
                </View>
                <Text style={[styles.matchTeam, styles.right]} numberOfLines={1} {...textScale.dense}>
                  {match.second_team_name}
                </Text>
              </View>
            ) : null}
          </GroupCard>
        </Reveal>
      ) : null}

      {matchId != null ? (
        <Reveal>
          <GroupCard title={`Cezalandırılacak oyuncu${players.data?.length ? ` · ${players.data.length}` : ""}`} step={3} padded={false}>
            {players.isLoading ? (
              <View style={styles.inset}>
                <SkeletonListRow count={4} />
              </View>
            ) : players.error ? (
              <View style={styles.inset}>
                <ErrorState error={players.error} onRetry={players.refetch} variant="inline" />
              </View>
            ) : !players.data?.length ? (
              <EmptyState icon="people-outline" title="Kadro kaydı yok" body="Bu maç için kadro / oyuncu kaydı bulunamadı." variant="inline" compact />
            ) : (
              <View style={styles.foot}>
                {players.data.length > 8 ? (
                  <View style={styles.inset}>
                    <Input variant="search" leadingIcon="search" value={playerQuery} onChangeText={setPlayerQuery} placeholder="Oyuncu ya da takım ara" autoCorrect={false} />
                  </View>
                ) : null}
                {shownPlayers.map((p, i) => {
                  const selected = player?.player_id === p.player_id;
                  return (
                    <ListLine
                      key={`${p.player_id}-${p.team_id ?? 0}`}
                      leading={<PositionAvatar name={p.player_name} image={p.player_img} position={p.player_position} size={36} />}
                      title={p.player_name}
                      subtitle={[p.team_name, p.player_position].filter(Boolean).join(" · ") || null}
                      selected={selected}
                      trailing={
                        <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? colors.brandAccent : colors.textTertiary} />
                      }
                      onPress={() => setPlayer(p)}
                      last={i === shownPlayers.length - 1}
                    />
                  );
                })}
              </View>
            )}
          </GroupCard>
        </Reveal>
      ) : null}

      {player ? (
        <Reveal>
          <View style={styles.form}>
            <View style={styles.target}>
              <PositionAvatar name={player.player_name} image={player.player_img} position={player.player_position} size={44} />
              <View style={styles.grow}>
                <Text style={styles.targetName} numberOfLines={1} {...textScale.dense}>
                  {player.player_name}
                </Text>
                <Text style={styles.targetMeta} numberOfLines={2} {...textScale.dense}>
                  {[player.team_name, match?.label].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <IconTile icon="hammer" tone="red" size={36} />
            </View>
            <GroupCard title="Ceza süreci" step={4}>
              <PenaltyDecisionFields value={decision} onChange={setDecision} />
            </GroupCard>
            <GroupCard title="Gerekçe" icon="document-text" tone="violet">
              <Input
                label={decision.status === "sevk" ? "Disiplin kararı (isteğe bağlı)" : "Disiplin kararı"}
                value={karar}
                onChangeText={setKarar}
                multiline
                numberOfLines={5}
                placeholder="Cezanın gerekçesini / disiplin kararı metnini yaz"
              />
            </GroupCard>
            <Button label="Cezayı kaydet" icon="checkmark" size="lg" onPress={() => save.mutate(undefined)} loading={save.isPending} haptic="success" fullWidth />
            <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} disabled={save.isPending} fullWidth />
          </View>
        </Reveal>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  inset: { paddingHorizontal: space.lg },
  foot: { paddingBottom: space.sm, gap: space.sm },
  form: { gap: space.md },
  stepper: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  stepRow: { flexDirection: "row", justifyContent: "space-between" },
  stepCell: { alignItems: "center", gap: space.xs, flex: 1 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  stepDone: { backgroundColor: colors.brandAccent, borderColor: colors.brandAccent },
  stepNow: { backgroundColor: colors.brand, borderColor: colors.brandBorder },
  stepNum: { ...type.numSmStrong, color: colors.textTertiary },
  stepNumNow: { color: colors.textOnBrand },
  stepLabel: { ...type.micro, color: colors.textTertiary },
  stepLabelOn: { color: colors.textPrimary },
  matchCard: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  matchTeam: { ...type.h4, color: colors.textPrimary, flex: 1 },
  right: { textAlign: "right" },
  vs: { paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  vsText: { ...type.numSmStrong, color: colors.textSecondary },
  target: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.dangerDim,
    borderWidth: hairline,
    borderColor: colors.danger,
  },
  targetName: { ...type.h3, color: colors.textPrimary },
  targetMeta: { ...type.caption, color: colors.textSecondary, marginTop: 1 },
});
