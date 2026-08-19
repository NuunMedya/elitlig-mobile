import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, Loading } from "@/components/States";
import { PlayerAvatar } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { submitArenaScore } from "@/lib/api/arena";
import { getPlayerRankings } from "@/lib/api/players";
import { queryKeys } from "@/lib/queryKeys";
import { instagramUrl } from "@/lib/socials";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import type { PlayerRankRow } from "@/lib/types";

/**
 * ELİTLİG ARENA — Seri Modu ("daha fazla mı, daha az mı?").
 *
 * Kapsamdaki oyuncu sıralamasından iki oyuncu çekilir; üsttekinin değeri
 * (GOL / MAÇ / PUAN — turdan tura değişir) açık, alttakinin gizlidir.
 * Doğru bildikçe seri uzar; tek yanlışta oyun biter. Rekor cihazda saklanır
 * ve koyu bir rekor kartıyla paylaşılabilir. Sorular gerçek lig verisinden
 * sonsuz üretilir; sistem oyuncuları (HÜKMEN vb.) havuza alınmaz.
 */

const BEST_KEY = "elitlig.arena.best.v1";
const HISTORY_KEY = "elitlig.arena.history.v1";

interface HistoryEntry {
  streak: number;
  date: string;
}
const REVEAL_MS = 850;

const METRICS = [
  { key: "goals", label: "GOL" },
  { key: "matches", label: "MAÇ" },
  { key: "points", label: "PUAN" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

interface Contender {
  id: number;
  name: string;
  image: string | null;
  team: string;
  values: Record<MetricKey, number>;
}

type Phase = "guess" | "correct" | "wrong" | "over";

export default function ArenaScreen() {
  const scope = useScope();
  const auth = useAuth();
  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const rankingsQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready,
    staleTime: 10 * 60_000,
  });

  const pool = useMemo<Contender[]>(() => {
    const junk = /hükmen|hukmen|antpl/i;
    return (rankingsQuery.data?.players ?? [])
      .filter((p) => p.name && !junk.test(p.name))
      .map((p: PlayerRankRow) => ({
        id: Number(p.id),
        name: p.name,
        image: p.image ?? null,
        team: p.teamName ?? "",
        values: {
          goals: Number(p.goals) || 0,
          matches: Number(p.matches) || 0,
          points: Number(p.points) || 0,
        },
      }))
      .filter((p) => p.id && p.values.matches > 0);
  }, [rankingsQuery.data]);

  const [best, setBest] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY).then((v) => setBest(Number(v) || 0));
    AsyncStorage.getItem(HISTORY_KEY).then((v) => {
      try {
        setHistory(JSON.parse(v ?? "[]"));
      } catch {
        setHistory([]);
      }
    });
  }, []);

  /** Biten seriyi geçmişe yazar (en iyi 20 tutulur). */
  const record = (finished: number) => {
    if (finished <= 0) return;
    setHistory((current) => {
      const next = [...current, { streak: finished, date: new Date().toISOString() }]
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 20);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const [streak, setStreak] = useState(0);
  const [phase, setPhase] = useState<Phase>("guess");
  const [metric, setMetric] = useState<MetricKey>("goals");
  const [top, setTop] = useState<Contender | null>(null);
  const [bottom, setBottom] = useState<Contender | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** Değerleri eşit olmayan yeni bir rakip + metrik seçer. */
  const draw = (anchor: Contender | null): { next: Contender; m: MetricKey } | null => {
    if (pool.length < 2) return null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const m = METRICS[Math.floor(Math.random() * METRICS.length)].key;
      const next = pool[Math.floor(Math.random() * pool.length)];
      if (!next) continue;
      if (anchor && (next.id === anchor.id || next.values[m] === anchor.values[m])) continue;
      if (!anchor) return { next, m };
      return { next, m };
    }
    return null;
  };

  const start = () => {
    if (pool.length < 2) return;
    const first = pool[Math.floor(Math.random() * pool.length)];
    const second = draw(first);
    if (!second) return;
    setTop(first);
    setBottom(second.next);
    setMetric(second.m);
    setStreak(0);
    setPhase("guess");
  };

  // Havuz gelince ilk eli kur
  useEffect(() => {
    if (pool.length >= 2 && !top) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length]);

  const advance = () => {
    if (!bottom) return;
    const next = draw(bottom);
    if (!next) return;
    setTop(bottom);
    setBottom(next.next);
    setMetric(next.m);
    setPhase("guess");
  };

  const guess = (higher: boolean) => {
    if (phase !== "guess" || !top || !bottom) return;
    const a = top.values[metric];
    const b = bottom.values[metric];
    const correct = higher ? b > a : b < a;
    if (correct) {
      const s = streak + 1;
      setStreak(s);
      setPhase("correct");
      if (s > best) {
        setBest(s);
        AsyncStorage.setItem(BEST_KEY, String(s));
      }
      timer.current = setTimeout(advance, REVEAL_MS);
    } else {
      setPhase("wrong");
      record(streak);
      if (auth.user && streak > 0) submitArenaScore("seri", streak).catch(() => {});
      timer.current = setTimeout(() => setPhase("over"), REVEAL_MS);
    }
  };

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? "";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Arena · Seri Modu" subtitle="Daha fazla mı, daha az mı?" />

      {rankingsQuery.isLoading ? (
        <Loading />
      ) : pool.length < 2 ? (
        <EmptyState
          icon="game-controller-outline"
          title="Havuz hazır değil"
          body="Bu kapsamda yeterli oyuncu verisi yok. Üstten farklı bir lig/sezon seçmeyi dene."
        />
      ) : !top || !bottom ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Seri şeridi */}
          <View style={styles.streakRow}>
            <View style={styles.streakPill}>
              <Text style={styles.streakText}>🔥 SERİ: {streak}</Text>
            </View>
            <View style={[styles.streakPill, styles.bestPill]}>
              <Text style={styles.bestText}>🏆 REKOR: {best}</Text>
            </View>
          </View>

          {/* Üst oyuncu — değeri açık */}
          <View style={styles.cardTop}>
            <PlayerAvatar name={top.name} image={top.image} size={44} />
            <Text style={styles.playerName} numberOfLines={1}>
              {top.name.toLocaleUpperCase("tr-TR")}
            </Text>
            <Text style={styles.teamName} numberOfLines={1}>
              {top.team}
            </Text>
            <Text style={styles.valueOpen}>
              {top.values[metric]} {metricLabel}
            </Text>
          </View>

          <Text style={styles.versus}>— peki —</Text>

          {/* Alt oyuncu — değeri gizli / açıklanıyor */}
          <View
            style={[
              styles.cardBottom,
              phase === "correct" && styles.cardRight,
              (phase === "wrong" || phase === "over") && styles.cardWrong,
            ]}
          >
            <PlayerAvatar name={bottom.name} image={bottom.image} size={44} />
            <Text style={[styles.playerName, styles.playerNameBottom]} numberOfLines={1}>
              {bottom.name.toLocaleUpperCase("tr-TR")}
            </Text>
            <Text style={[styles.teamName, styles.teamNameBottom]} numberOfLines={1}>
              {bottom.team}
            </Text>
            <Text style={[styles.valueHidden, phase !== "guess" && styles.valueRevealed]}>
              {phase === "guess" ? `? ${metricLabel}` : `${bottom.values[metric]} ${metricLabel}`}
            </Text>
          </View>

          {phase === "over" ? (
            <GameOver streak={streak} best={best} onRestart={start} scopeCity={scope.cityLabel} />
          ) : (
            <View style={styles.buttons}>
              <Pressable
                onPress={() => guess(true)}
                disabled={phase !== "guess"}
                style={({ pressed }) => [
                  styles.guessBtn,
                  styles.moreBtn,
                  (pressed || phase !== "guess") && styles.pressed,
                ]}
              >
                <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
                <Text style={styles.guessText}>DAHA FAZLA</Text>
              </Pressable>
              <Pressable
                onPress={() => guess(false)}
                disabled={phase !== "guess"}
                style={({ pressed }) => [
                  styles.guessBtn,
                  styles.lessBtn,
                  (pressed || phase !== "guess") && styles.pressed,
                ]}
              >
                <Ionicons name="arrow-down" size={18} color="#FFFFFF" />
                <Text style={styles.guessText}>DAHA AZ</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.hint}>
            Üstteki oyuncunun değeri açık; alttakinin {metricLabel} sayısı daha mı fazla, daha mı az?
          </Text>

          {history.length > 0 ? (
            <View style={styles.historyCard}>
              <Text style={styles.historyTitle}>REKOR LİSTEM</Text>
              {history.slice(0, 5).map((entry, index) => (
                <View key={`${entry.date}-${index}`} style={styles.historyRow}>
                  <Text style={styles.historyRank}>
                    {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`}
                  </Text>
                  <Text style={styles.historyStreak}>🔥 {entry.streak}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(entry.date).toLocaleDateString("tr-TR", {
                      day: "numeric",
                      month: "short",
                    })}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** Oyun sonu: skor, tekrar oyna ve rekor paylaşım kartı. */
function GameOver({
  streak,
  best,
  onRestart,
  scopeCity,
}: {
  streak: number;
  best: number;
  onRestart: () => void;
  scopeCity: string;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);
  const isRecord = streak > 0 && streak >= best;

  const igHandle = (() => {
    const url = instagramUrl(scopeCity);
    const handle = url?.split("instagram.com/")[1]?.replace(/\/+$/, "");
    return handle ? `@${handle}` : "elitlig.com";
  })();

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      }
    } catch {
      Alert.alert("Bir sorun oldu", "Görsel oluşturulamadı, tekrar dener misin?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.overBox}>
      <Text style={styles.overTitle}>{isRecord ? "🏆 YENİ REKOR!" : "Seri bitti!"}</Text>
      <Text style={styles.overScore}>🔥 {streak}</Text>
      <Text style={styles.overSub}>Rekorun: {best}</Text>

      <View style={styles.overButtons}>
        <Pressable
          onPress={onRestart}
          style={({ pressed }) => [styles.overBtn, styles.retryBtn, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={16} color={colors.surface} />
          <Text style={styles.retryText}>Tekrar Oyna</Text>
        </Pressable>
        <Pressable
          onPress={() => setShareOpen(true)}
          style={({ pressed }) => [styles.overBtn, styles.shareBtn2, pressed && styles.pressed]}
        >
          <Ionicons name="share-social" size={16} color={colors.turf} />
          <Text style={styles.shareText2}>Meydan Oku</Text>
        </Pressable>
      </View>

      <Modal
        visible={shareOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setShareOpen(false)}
      >
        <View style={styles.backdrop}>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <View style={styles.shareCard}>
              <Text style={styles.shareBrand}>elitlig</Text>
              <Text style={styles.shareArena}>ARENA · SERİ MODU</Text>
              <Text style={styles.shareStreak}>🔥 {streak}</Text>
              <Text style={styles.shareLabel}>SERİ{isRecord ? " · YENİ REKOR 🏆" : ""}</Text>
              <View style={styles.shareDivider} />
              <Text style={styles.shareChallenge}>"Geç de görelim" 😏</Text>
              <Text style={styles.shareFooter}>ELİTLİG.COM · {igHandle}</Text>
            </View>
          </ViewShot>
          <View style={styles.overButtons}>
            <Pressable
              onPress={() => setShareOpen(false)}
              style={({ pressed }) => [styles.overBtn, styles.closeBtn2, pressed && styles.pressed]}
            >
              <Text style={styles.closeText2}>Kapat</Text>
            </Pressable>
            <Pressable
              onPress={share}
              style={({ pressed }) => [styles.overBtn, styles.retryBtn, pressed && styles.pressed]}
            >
              <Ionicons name="share-social" size={16} color={colors.surface} />
              <Text style={styles.retryText}>{busy ? "Hazırlanıyor…" : "Paylaş"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  streakRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  streakPill: {
    backgroundColor: colors.turfDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  streakText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.turf,
  },
  bestPill: {
    backgroundColor: colors.goldDim,
  },
  bestText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#8A6A06",
  },
  cardTop: {
    backgroundColor: colors.turf,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: 4,
  },
  playerName: {
    ...type.body,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  teamName: {
    ...type.caption,
    color: "#D9CBF6",
    letterSpacing: 0,
  },
  playerNameBottom: {
    color: colors.turf,
  },
  teamNameBottom: {
    color: colors.muted,
  },
  valueOpen: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.yellow,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  versus: {
    ...type.small,
    color: colors.muted,
    textAlign: "center",
    marginVertical: spacing.sm,
  },
  cardBottom: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.turf,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: 4,
  },
  cardRight: {
    borderColor: colors.green,
    backgroundColor: "#EAF7F0",
  },
  cardWrong: {
    borderColor: colors.live,
    backgroundColor: "#FBEDEE",
  },
  valueHidden: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.turf,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  valueRevealed: {
    color: colors.line,
  },
  buttons: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  guessBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
  },
  moreBtn: {
    backgroundColor: colors.green,
  },
  lessBtn: {
    backgroundColor: colors.live,
  },
  guessText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  hint: {
    ...type.caption,
    color: colors.muted,
    textAlign: "center",
    letterSpacing: 0,
    marginTop: spacing.md,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  historyTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
    marginBottom: spacing.sm,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 5,
  },
  historyRank: {
    width: 28,
    fontSize: 12,
    textAlign: "center",
  },
  historyStreak: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
    flex: 1,
  },
  historyDate: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  overBox: {
    alignItems: "center",
    marginTop: spacing.md,
    gap: 4,
  },
  overTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  overScore: {
    fontSize: 44,
    fontWeight: "900",
    color: colors.turf,
  },
  overSub: {
    ...type.small,
    color: colors.muted,
  },
  overButtons: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  overBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 3,
  },
  retryBtn: {
    backgroundColor: colors.turf,
  },
  retryText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.surface,
  },
  shareBtn2: {
    backgroundColor: colors.turfDim,
  },
  shareText2: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.turf,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  shareCard: {
    width: 264,
    backgroundColor: "#18102C",
    borderRadius: 16,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: 4,
  },
  shareBrand: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  shareArena: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#B9A6E4",
  },
  shareStreak: {
    fontSize: 52,
    fontWeight: "900",
    color: "#F0BE2E",
    marginTop: spacing.sm,
  },
  shareLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#FFFFFF",
  },
  shareDivider: {
    alignSelf: "stretch",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginVertical: spacing.md,
  },
  shareChallenge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#D9CBF6",
  },
  shareFooter: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#8878B8",
    marginTop: spacing.sm,
  },
  closeBtn2: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  closeText2: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
});
