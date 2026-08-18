import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getArenaLeaderboard, getMyArenaRank, type ArenaGame } from "@/lib/api/arena";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";

const GAMES: { key: ArenaGame; label: string; emoji: string }[] = [
  { key: "seri",   label: "Seri Modu",    emoji: "🔥" },
  { key: "sektir", label: "Top Sektir",   emoji: "⚽" },
  { key: "kimbu",  label: "Kim Bu?",      emoji: "🕵️" },
  { key: "slalom", label: "Slalom",       emoji: "🚩" },
  { key: "gunun",  label: "Günün Testi",  emoji: "🧠" },
];

export default function ArenaLeaderboardScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const initial = GAMES.find((g) => g.key === params.game)?.key ?? "seri";
  const [game, setGame] = useState<ArenaGame>(initial);
  const [period, setPeriod] = useState<"weekly" | "alltime">("weekly");
  const [scopeMode, setScopeMode] = useState<"city" | "turkey">("city");
  const scope = useScope();
  const auth = useAuth();
  const cityId = scopeMode === "city" && scope.cityId ? Number(scope.cityId) : undefined;

  const boardQuery = useQuery({
    queryKey: ["arena", "board", game, period, cityId ?? "tr"],
    queryFn: () => getArenaLeaderboard(game, { cityId, period }),
    staleTime: 30_000,
  });

  const meQuery = useQuery({
    queryKey: ["arena", "me", game, cityId ?? "tr"],
    queryFn: () => getMyArenaRank(game, cityId),
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });

  const entries = boardQuery.data?.entries ?? [];
  const me = meQuery.data as { rank?: number; score?: number; best?: number } | undefined;
  const myRank = me?.rank ?? null;
  const myScore = me?.score ?? me?.best ?? null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Rekor Tablosu" subtitle="Oyunlarda kim önde?" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gameTabs} style={styles.gameTabsWrap}>
        {GAMES.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setGame(item.key)}
            style={({ pressed }) => [styles.gameTab, game === item.key && styles.gameTabActive, pressed && styles.pressed]}
          >
            <Text style={[styles.gameTabText, game === item.key && styles.gameTabTextActive]}>
              {item.emoji} {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.filterRow}>
        <TogglePair
          left="Haftalık" right="Tüm Zamanlar"
          value={period === "weekly" ? "left" : "right"}
          onChange={(s) => setPeriod(s === "left" ? "weekly" : "alltime")}
        />
        <TogglePair
          left={scope.cityLabel || "Şehrim"} right="Türkiye"
          value={scopeMode === "city" ? "left" : "right"}
          onChange={(s) => setScopeMode(s === "left" ? "city" : "turkey")}
        />
      </View>

      {auth.user && (myRank != null || myScore != null) ? (
        <View style={styles.mePill}>
          <Text style={styles.meText}>
            SENİN SIRAN: {myRank != null ? `#${myRank}` : "—"}{myScore != null ? ` · ${myScore}` : ""}
          </Text>
        </View>
      ) : null}

      {boardQuery.isLoading ? (
        <Loading />
      ) : boardQuery.isError ? (
        <ErrorState error={boardQuery.error} onRetry={boardQuery.refetch} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title="Henüz skor yok"
          body={auth.user
            ? "İlk rekoru gönderen sen ol — oyna, skorun otomatik sıralamaya yazılsın!"
            : "Oyna ve giriş yap; skorun otomatik sıralamaya yazılsın."}
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => `${item.userId}-${item.rank}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mine = Number(item.userId) === Number(auth.user?.id);
            return (
              <View style={[styles.row, mine && styles.rowMine]}>
                <Text style={styles.rank}>
                  {item.rank === 1 ? "🥇" : item.rank === 2 ? "🥈" : item.rank === 3 ? "🥉" : item.rank}
                </Text>
                <View style={styles.rowBody}>
                  <Text style={[styles.name, mine && styles.nameMine]} numberOfLines={1}>
                    {item.name}{mine ? " (sen)" : ""}
                  </Text>
                  {item.teamName ? <Text style={styles.team} numberOfLines={1}>{item.teamName}</Text> : null}
                </View>
                <View style={styles.scoreBox}>
                  <Text style={[styles.score, mine && styles.nameMine]}>{item.score}</Text>
                  <Text style={styles.date}>{formatDateShort(item.date)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function TogglePair({ left, right, value, onChange }: {
  left: string; right: string; value: "left" | "right"; onChange: (s: "left" | "right") => void;
}) {
  return (
    <View style={styles.toggle}>
      {([ ["left", left], ["right", right] ] as const).map(([side, label]) => (
        <Pressable key={side} onPress={() => onChange(side)}
          style={({ pressed }) => [styles.toggleHalf, value === side && styles.toggleActive, pressed && styles.pressed]}
        >
          <Text style={[styles.toggleText, value === side && styles.toggleTextActive]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pitch },
  gameTabsWrap: { flexGrow: 0, flexShrink: 0 },
  gameTabs: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.sm, alignItems: "center" as const, height: 44 },
  gameTab: { borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.faint, paddingHorizontal: spacing.md, paddingVertical: 7, height: 36, justifyContent: "center" as const, alignItems: "center" as const },
  gameTabActive: { backgroundColor: colors.turf, borderColor: colors.turf },
  gameTabText: { fontSize: 13, fontWeight: "700" as const, color: colors.muted },
  gameTabTextActive: { color: colors.surface, fontWeight: "800" as const },
  filterRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  toggle: { flex: 1, flexDirection: "row", backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, padding: 3 },
  toggleHalf: { flex: 1, alignItems: "center", borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 4 },
  toggleActive: { backgroundColor: colors.turf },
  toggleText: { fontSize: 10, fontWeight: "800", color: colors.muted },
  toggleTextActive: { color: colors.surface },
  mePill: { alignSelf: "center", backgroundColor: colors.goldDim, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  meText: { fontSize: 11, fontWeight: "800", color: "#8A6A06", fontVariant: ["tabular-nums"] },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.faint, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  rowMine: { borderColor: colors.turf, backgroundColor: colors.turfDim },
  rank: { width: 30, fontSize: 14, fontWeight: "800", color: colors.muted, textAlign: "center", fontVariant: ["tabular-nums"] },
  rowBody: { flex: 1 },
  name: { ...type.small, fontWeight: "700", color: colors.line },
  nameMine: { color: colors.turf, fontWeight: "800" },
  team: { ...type.caption, color: colors.muted, letterSpacing: 0, marginTop: 1 },
  scoreBox: { alignItems: "flex-end" },
  score: { ...type.body, fontWeight: "800", color: colors.line, fontVariant: ["tabular-nums"] },
  date: { fontSize: 9, fontWeight: "600", color: colors.muted },
  pressed: { opacity: 0.7 },
});
