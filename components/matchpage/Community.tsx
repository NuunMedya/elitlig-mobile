/**
 * Maç sayfasının topluluk kartları (Faz 4):
 *   DuelCard     yaklaşan maçta iki takımın Penaltı düellosu (routes/arena.js)
 *   FanVoteCard  biten maçta taraftar oylaması (routes/community.js)
 *   useMatchReactions  zaman tünelindeki olay tepkileri
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { memo, useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, SectionHeader, Touchable, useToast } from "@/components/ui";
import {
  castFanVote,
  getDuel,
  getFanVote,
  getReactions,
  sendReaction,
  type FanVoteState,
  type Reaction,
  type ReactionState,
} from "@/lib/api/community";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, radius, space, textScale, type } from "@/theme";
import { PaperCard } from "./parts";

/* ═══════════════════════════ DERBİ DÜELLOSU ═══════════════════════════ */

export const DuelCard = memo(function DuelCard({ matchId }: { matchId: number }) {
  const router = useRouter();
  const query = useQuery({ queryKey: ["arena", "duel", matchId], queryFn: () => getDuel(matchId), staleTime: 60_000, retry: false });
  const duel = query.data;
  if (!duel || duel.status === "upcoming") return null;
  const total = Math.max(1, duel.home.score + duel.away.score);
  const homeShare = duel.home.score / total;
  return (
    <>
      <SectionHeader title="Arena düellosu" meta={duel.status === "open" ? "Maça kadar açık" : "Sonuçlandı"} />
      <PaperCard padded>
        <Text style={styles.lede} {...textScale.long}>
          {`İki takımın oyuncuları maça kadar Penaltı'da yarışır. Takım puanı en iyi ${duel.rules.top} oyuncunun ortalaması.`}
        </Text>
        <View style={styles.scoreRow}>
          <SideScore name={duel.home.name} score={duel.home.score} lead={duel.leader === "home"} />
          <Text style={styles.vs} {...textScale.badge}>
            VS
          </Text>
          <SideScore name={duel.away.name} score={duel.away.score} lead={duel.leader === "away"} alignEnd />
        </View>
        <View style={styles.bar}>
          <View style={[styles.barHome, { flex: Math.max(0.02, homeShare) }]} />
          <View style={[styles.barAway, { flex: Math.max(0.02, 1 - homeShare) }]} />
        </View>
        <Text style={styles.meta} {...textScale.dense}>
          {`${duel.home.participants} – ${duel.away.participants} oyuncu katıldı`}
        </Text>
        {duel.status === "open" ? (
          <Button label="Takımın için penaltı at" icon="football" onPress={() => router.push("/penalti")} size="sm" />
        ) : null}
      </PaperCard>
    </>
  );
});

function SideScore({ name, score, lead, alignEnd }: { name: string; score: number; lead: boolean; alignEnd?: boolean }) {
  return (
    <View style={[styles.side, alignEnd && styles.sideEnd]}>
      <Text style={styles.sideName} numberOfLines={1} {...textScale.dense}>
        {name}
      </Text>
      <Text style={[styles.sideScore, lead && styles.lead]} {...textScale.dense}>
        {score.toLocaleString("tr-TR")}
      </Text>
    </View>
  );
}

/* ═══════════════════════════ TARAFTAR OYLAMASI ═══════════════════════════ */

export const FanVoteCard = memo(function FanVoteCard({ matchId }: { matchId: number }) {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const key = ["community", "fan-vote", matchId];
  const query = useQuery({ queryKey: key, queryFn: () => getFanVote(matchId), staleTime: 30_000, retry: false });
  const vote = useMutation({
    mutationFn: (playerId: number) => castFanVote(matchId, playerId),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      void queryClient.invalidateQueries({ queryKey: ["career", "me"] });
      toast.show({ message: "Oyun kaydedildi.", tone: "success" });
    },
    onError: (error) => toast.show({ message: error instanceof ApiError ? error.userMessage : "Oy verilemedi.", tone: "danger" }),
  });
  const data: FanVoteState | undefined = query.data;
  if (!data || !data.candidates.length || (!data.open && !data.total)) return null;
  const top = data.open ? data.candidates : data.candidates.slice(0, 5);

  return (
    <>
      <SectionHeader
        title="Taraftarın oyuncusu"
        meta={data.open ? `${data.total} oy · ${data.closesAt ? `${formatDateShort(data.closesAt)} kapanır` : ""}` : `${data.total} oy`}
      />
      <PaperCard padded>
        {data.winner ? (
          <View style={styles.winner}>
            <Ionicons name="trophy" size={18} color={colors.star} />
            <Text style={styles.winnerText} {...textScale.dense}>
              {`${data.winner.name} · ${data.winner.votes} oy`}
            </Text>
          </View>
        ) : null}
        {top.map((item) => {
          const mine = data.myVote === item.playerId;
          return (
            <Touchable
              key={item.playerId}
              feedback="row"
              haptic="selection"
              disabled={!data.open || vote.isPending}
              onPress={() => (auth.user ? vote.mutate(item.playerId) : router.push("/giris"))}
              style={[styles.candidate, mine && styles.candidateMine]}
              accessibilityRole="button"
              accessibilityState={{ selected: mine }}
              accessibilityLabel={`${item.name}, ${item.votes} oy`}
            >
              <Avatar name={item.name} image={mediaUrl(item.image)} size={32} />
              <View style={styles.flex}>
                <Text style={styles.candidateName} numberOfLines={1} {...textScale.dense}>
                  {item.name}
                </Text>
                <View style={styles.shareTrack}>
                  <View style={[styles.shareFill, { width: `${item.share}%` }]} />
                </View>
              </View>
              <Text style={styles.share} {...textScale.dense}>
                {`%${item.share}`}
              </Text>
              {mine ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} /> : null}
            </Touchable>
          );
        })}
        {data.open ? (
          <Text style={styles.meta} {...textScale.long}>
            Oyunu maçta oynayanlardan birine ver; değiştirebilirsin. Editörün seçtiği maçın enleri ayrıdır.
          </Text>
        ) : null}
      </PaperCard>
    </>
  );
});

/* ═══════════════════════════ OLAY TEPKİLERİ ═══════════════════════════ */

export function useMatchReactions(matchId: number, enabled: boolean) {
  const auth = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = ["community", "reactions", matchId];
  const query = useQuery({ queryKey: key, queryFn: () => getReactions(matchId), enabled, staleTime: 30_000, retry: false });
  const mutation = useMutation({
    mutationFn: (input: { eventId: number; reaction: Reaction }) => sendReaction(matchId, input.eventId, input.reaction),
    onSuccess: (data: ReactionState) => queryClient.setQueryData(key, data),
  });
  const { mutate } = mutation;
  const onReact = useCallback(
    (eventId: number, reaction: Reaction) => {
      if (!auth.user) {
        router.push("/giris");
        return;
      }
      mutate({ eventId, reaction });
    },
    [auth.user, mutate, router],
  );
  return { data: query.data, onReact };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lede: { ...type.caption, color: colors.textSecondary },
  meta: { ...type.caption, color: colors.textTertiary },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: space.s, marginTop: space.s },
  side: { flex: 1, gap: space.xxs },
  sideEnd: { alignItems: "flex-end" },
  sideName: { ...type.label, color: colors.textSecondary },
  sideScore: { ...type.scoreLg, color: colors.textPrimary },
  lead: { color: colors.accentText },
  vs: { ...type.overline, color: colors.textTertiary },
  bar: { flexDirection: "row", height: 6, borderRadius: radius.pill, overflow: "hidden", marginVertical: space.s, gap: space.xxs },
  barHome: { backgroundColor: colors.accent },
  barAway: { backgroundColor: colors.slate },
  winner: { flexDirection: "row", alignItems: "center", gap: space.s, marginBottom: space.s },
  winnerText: { ...type.h3, color: colors.textPrimary },
  candidate: { flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.s, borderRadius: radius.md, paddingHorizontal: space.xs },
  candidateMine: { backgroundColor: colors.surface2 },
  candidateName: { ...type.label, color: colors.textPrimary },
  shareTrack: { height: 4, borderRadius: radius.pill, backgroundColor: colors.surface2, marginTop: space.xxs, overflow: "hidden" },
  shareFill: { height: 4, backgroundColor: colors.accent },
  share: { ...type.label, color: colors.textSecondary, minWidth: 36, textAlign: "right" },
});

