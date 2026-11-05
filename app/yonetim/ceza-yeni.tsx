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

import { AdminScreen, Panel, RecordCard, SelectField, useAdminMutation } from "@/components/admin";
import { durationBody, PenaltyDecisionFields, type DecisionValue } from "@/components/admin/penalties/PenaltyBits";
import { ScopeSelects, type ScopeValue } from "@/components/admin/penalties/ScopeSelects";
import { Button, EmptyState, ErrorState, Input, SkeletonListRow } from "@/components/ui";
import { formatDate } from "@/lib/admin/format";
import {
  createPenalty,
  listPenaltyMatches,
  listPenaltyMatchPlayers,
  updatePenalty,
  type PenaltyMatch,
  type PenaltyMatchPlayer,
} from "@/lib/api/admin/penalties";
import { colors, space, textScale, type } from "@/theme";

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

  return (
    <AdminScreen title="Yeni ceza" subtitle="Disiplin sevki oluştur" permission={["penalties.create"]}>
      <Panel title="1 · Kapsam">
        <ScopeSelects
          value={scope}
          required
          onChange={(next) => {
            setScope(next);
            setMatchId(null);
            setPlayer(null);
          }}
        />
      </Panel>

      {scopeReady ? (
        <Panel title="2 · Cezaya konu maç">
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
        </Panel>
      ) : null}

      {matchId != null ? (
        <Panel title="3 · Cezalandırılacak oyuncu">
          {players.isLoading ? (
            <SkeletonListRow count={4} />
          ) : players.error ? (
            <ErrorState error={players.error} onRetry={players.refetch} variant="inline" />
          ) : !players.data?.length ? (
            <EmptyState icon="people-outline" title="Kadro kaydı yok" body="Bu maç için kadro / oyuncu kaydı bulunamadı." variant="inline" compact />
          ) : (
            <View style={styles.list}>
              {players.data.length > 8 ? (
                <Input variant="search" leadingIcon="search" value={playerQuery} onChangeText={setPlayerQuery} placeholder="Oyuncu ya da takım ara" autoCorrect={false} />
              ) : null}
              {shownPlayers.map((p) => {
                const selected = player?.player_id === p.player_id;
                return (
                  <RecordCard
                    key={`${p.player_id}-${p.team_id ?? 0}`}
                    title={p.player_name}
                    subtitle={[p.team_name, p.player_position].filter(Boolean).join(" · ") || null}
                    avatar={{ name: p.player_name, image: p.player_img }}
                    badges={selected ? [{ label: "Seçildi", tone: "brand", icon: "checkmark" }] : undefined}
                    style={selected ? styles.selected : undefined}
                    onPress={() => setPlayer(p)}
                  />
                );
              })}
            </View>
          )}
        </Panel>
      ) : null}

      {player ? (
        <Panel title="4 · Ceza süreci">
          <Text style={styles.lead} {...textScale.dense}>
            {player.player_name}
            {player.team_name ? ` · ${player.team_name}` : ""}
            {match ? ` · ${match.label}` : ""}
          </Text>
          <PenaltyDecisionFields value={decision} onChange={setDecision} />
          <Input
            label={decision.status === "sevk" ? "Disiplin kararı (isteğe bağlı)" : "Disiplin kararı"}
            value={karar}
            onChangeText={setKarar}
            multiline
            numberOfLines={5}
            placeholder="Cezanın gerekçesini / disiplin kararı metnini yaz"
          />
          <View style={styles.actions}>
            <Button label="Vazgeç" variant="secondary" onPress={() => router.back()} disabled={save.isPending} />
            <Button label="Cezayı kaydet" onPress={() => save.mutate(undefined)} loading={save.isPending} haptic="success" style={styles.grow} />
          </View>
        </Panel>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  selected: { borderColor: colors.brandAccent, backgroundColor: colors.brandDim },
  lead: { ...type.label, color: colors.textPrimary, marginBottom: space.sm },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  grow: { flex: 1 },
});
