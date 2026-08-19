import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { submitArenaScore } from "@/lib/api/arena";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getPlayerRankings } from "@/lib/api/players";
import { queryKeys } from "@/lib/queryKeys";
import { instagramUrl } from "@/lib/socials";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import type { PlayerRankRow } from "@/lib/types";

/**
 * GÜNÜN TESTİ — günlük 10 soru; o gün HERKESE AYNI sorular.
 *
 * Sorular, günün tarihinden türetilen sabit tohumlu bir rastgele sayı
 * üreteciyle Türkiye havuzundan (ilk 80 golcü) kurulur; böylece aynı gün
 * testi çözen herkes aynı sorularla yarışır ve skorlar doğrudan kıyaslanır.
 * Soru başına 12 saniye; doğru 10 puan + kalan süreden hız bonusu.
 * Günde bir resmî hak vardır (cihazda saklanır); sonrası antrenman sayılır
 * ve skoru güne yazılmaz. Sonuç koyu meydan okuma kartıyla paylaşılır.
 */

const ROUND = 10;
const SECONDS = 12;
const BEST_KEY = "elitlig.gunun.best.v1";
const DAY_KEY = (day: string) => `elitlig.gunun.${day}.v1`;
const JUNK = /hükmen|hukmen|antpl/i;

/* Sabit tohumlu rastgelelik: aynı tarih → aynı dizi */
function seedFromString(input: string) {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

interface Question {
  prompt: string;
  options: { label: string; correct: boolean }[];
}

function buildQuestions(pool: PlayerRankRow[], day: string): Question[] {
  const rand = seedFromString(day);
  const pick = () => pool[Math.floor(rand() * pool.length)];
  const questions: Question[] = [];
  const metrics = [
    { key: "goals", label: "GOL", ask: "Kim daha fazla gol attı?" },
    { key: "matches", label: "MAÇ", ask: "Kim daha fazla maç oynadı?" },
    { key: "points", label: "PUAN", ask: "Kim daha fazla puan topladı?" },
  ] as const;

  let guard = 0;
  while (questions.length < ROUND && guard < 200) {
    guard += 1;
    const mode = questions.length % 4;
    if (mode === 3) {
      // Takım sorusu: X hangi takımda?
      const player = pick();
      if (!player?.teamName) continue;
      const others = new Set<string>();
      while (others.size < 2 && guard < 200) {
        guard += 1;
        const other = pick();
        if (other?.teamName && other.teamName !== player.teamName) others.add(other.teamName);
      }
      if (others.size < 2) continue;
      const options = [player.teamName, ...others]
        .map((label) => ({ label, correct: label === player.teamName }))
        .sort(() => rand() - 0.5);
      questions.push({
        prompt: `${player.name.toLocaleUpperCase("tr-TR")} hangi takımda?`,
        options,
      });
    } else {
      const metric = metrics[mode];
      const a = pick();
      const b = pick();
      if (!a || !b || a.id === b.id) continue;
      const av = Number(a[metric.key]) || 0;
      const bv = Number(b[metric.key]) || 0;
      if (av === bv) continue;
      questions.push({
        prompt: metric.ask,
        options: [
          { label: a.name.toLocaleUpperCase("tr-TR"), correct: av > bv },
          { label: b.name.toLocaleUpperCase("tr-TR"), correct: bv > av },
        ].sort(() => rand() - 0.5),
      });
    }
  }
  return questions;
}

type Phase = "intro" | "playing" | "reveal" | "done";

export default function DailyQuizScreen() {
  const scope = useScope();
  const auth = useAuth();
  const day = new Date().toISOString().slice(0, 10);
  const dayLabel = new Date()
    .toLocaleDateString("tr-TR", { day: "numeric", month: "long" })
    .toLocaleUpperCase("tr-TR");

  const query = useQuery({
    queryKey: queryKeys.playerRankings({}, "topScorers"),
    queryFn: () => getPlayerRankings({}, "topScorers"),
    staleTime: 10 * 60_000,
  });

  const pool = useMemo(
    () =>
      (query.data?.players ?? [])
        .filter((p) => p.name && !JUNK.test(p.name) && Number(p.goals) > 0)
        .slice(0, 80),
    [query.data]
  );

  const questions = useMemo(
    () => (pool.length >= 12 ? buildQuestions(pool, day) : []),
    [pool, day]
  );

  const [phase, setPhase] = useState<Phase>("intro");
  const [qIndex, setQIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(SECONDS);
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [official, setOfficial] = useState(true);
  const [todayResult, setTodayResult] = useState<{ score: number; correct: number } | null>(null);
  const [best, setBest] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY).then((v) => setBest(Number(v) || 0));
    AsyncStorage.getItem(DAY_KEY(day)).then((v) => {
      if (v) {
        try {
          setTodayResult(JSON.parse(v));
        } catch {}
      }
    });
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [day]);

  const startTimer = () => {
    if (timer.current) clearInterval(timer.current);
    setSecondsLeft(SECONDS);
    timer.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          answer(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const start = (isOfficial: boolean) => {
    setOfficial(isOfficial);
    setScore(0);
    setCorrectCount(0);
    setQIndex(0);
    setChosen(null);
    setPhase("playing");
    startTimer();
  };

  const answer = (index: number | null) => {
    if (timer.current) clearInterval(timer.current);
    setChosen(index);
    setPhase("reveal");
    const question = questions[qIndex];
    const isCorrect = index != null && question?.options[index]?.correct;
    if (isCorrect) {
      const bonus = Math.floor(secondsLeft / 2);
      setScore((s) => s + 10 + bonus);
      setCorrectCount((c) => c + 1);
    }
    advanceTimer.current = setTimeout(() => {
      if (qIndex + 1 >= questions.length) {
        finish(isCorrect ? 10 + Math.floor(secondsLeft / 2) : 0);
      } else {
        setQIndex(qIndex + 1);
        setChosen(null);
        setPhase("playing");
        startTimer();
      }
    }, 900);
  };

  const finish = (lastGain: number) => {
    const finalScore = score + lastGain;
    const finalCorrect = correctCount + (lastGain > 0 ? 1 : 0);
    setPhase("done");
    if (official) {
      if (auth.user && finalScore > 0) submitArenaScore("gunun", finalScore).catch(() => {});
      const result = { score: finalScore, correct: finalCorrect };
      setTodayResult(result);
      AsyncStorage.setItem(DAY_KEY(day), JSON.stringify(result));
      setBest((b) => {
        if (finalScore > b) {
          AsyncStorage.setItem(BEST_KEY, String(finalScore));
          return finalScore;
        }
        return b;
      });
    }
  };

  const question = questions[qIndex];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Günün Testi" subtitle={`${dayLabel} · herkese aynı 10 soru`} />

      {query.isLoading ? (
        <Loading />
      ) : questions.length < ROUND ? (
        <EmptyState
          icon="calendar-outline"
          title="Test hazırlanamadı"
          body="Soru havuzu şu an yüklenemedi, birazdan tekrar dene."
        />
      ) : phase === "intro" ? (
        <View style={styles.center}>
          <Text style={styles.introEmoji}>🧠</Text>
          <Text style={styles.introTitle}>GÜNÜN TESTİ</Text>
          <Text style={styles.introBody}>
            Bugün testi çözen herkes aynı 10 soruyla yarışıyor. Soru başına {SECONDS} saniye;
            doğru 10 puan + hız bonusu.
          </Text>
          {todayResult ? (
            <>
              <View style={styles.todayCard}>
                <Text style={styles.todayLabel}>BUGÜNKÜ SONUCUN</Text>
                <Text style={styles.todayScore}>
                  {todayResult.score} PUAN · {todayResult.correct}/{ROUND}
                </Text>
              </View>
              <ResultActions
                score={todayResult.score}
                correct={todayResult.correct}
                dayLabel={dayLabel}
                scopeCity={scope.cityLabel}
                onRetry={() => start(false)}
                retryLabel="Antrenman Turu"
              />
              <Text style={styles.hint}>Antrenman skoru güne yazılmaz — resmî hak günde bir.</Text>
            </>
          ) : (
            <Pressable
              onPress={() => start(true)}
              style={({ pressed }) => [styles.startBtn, pressed && styles.pressed]}
            >
              <Ionicons name="play" size={16} color={colors.surface} />
              <Text style={styles.startText}>Bugünün Testine Başla</Text>
            </Pressable>
          )}
          {best > 0 ? <Text style={styles.bestLine}>🏆 En iyi günün: {best} puan</Text> : null}
        </View>
      ) : phase === "done" ? (
        <View style={styles.center}>
          <Text style={styles.introEmoji}>{correctCount >= 8 ? "🏆" : correctCount >= 5 ? "👏" : "💪"}</Text>
          <Text style={styles.doneScore}>{score} PUAN</Text>
          <Text style={styles.doneSub}>
            {correctCount}/{ROUND} doğru{official ? "" : " · antrenman"}
          </Text>
          <ResultActions
            score={score}
            correct={correctCount}
            dayLabel={dayLabel}
            scopeCity={scope.cityLabel}
            onRetry={() => start(false)}
            retryLabel="Antrenman Turu"
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>
              SORU {qIndex + 1}/{ROUND}
            </Text>
            <Text style={styles.scoreText}>PUAN: {score}</Text>
          </View>

          {/* Süre çubuğu */}
          <View style={styles.timerTrack}>
            <View
              style={[
                styles.timerFill,
                { width: `${(secondsLeft / SECONDS) * 100}%` },
                secondsLeft <= 4 && styles.timerDanger,
              ]}
            />
          </View>
          <Text style={styles.timerText}>⏱ {secondsLeft} sn</Text>

          <View style={styles.questionCard}>
            <Text style={styles.prompt}>{question.prompt}</Text>
          </View>

          <View style={styles.options}>
            {question.options.map((option, index) => {
              const revealed = phase === "reveal";
              const isChosen = chosen === index;
              return (
                <Pressable
                  key={`${option.label}-${index}`}
                  onPress={() => phase === "playing" && answer(index)}
                  disabled={phase !== "playing"}
                  style={({ pressed }) => [
                    styles.option,
                    revealed && option.correct && styles.optionRight,
                    revealed && isChosen && !option.correct && styles.optionWrong,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      revealed && (option.correct || (isChosen && !option.correct)) && styles.optionTextLight,
                    ]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ResultActions({
  score,
  correct,
  dayLabel,
  scopeCity,
  onRetry,
  retryLabel,
}: {
  score: number;
  correct: number;
  dayLabel: string;
  scopeCity: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);

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
    <>
      <View style={styles.actionRow}>
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.actionBtn, styles.retryBtn, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={15} color={colors.turf} />
          <Text style={styles.retryText}>{retryLabel}</Text>
        </Pressable>
        <Pressable
          onPress={() => setShareOpen(true)}
          style={({ pressed }) => [styles.actionBtn, styles.shareBtn, pressed && styles.pressed]}
        >
          <Ionicons name="share-social" size={15} color={colors.surface} />
          <Text style={styles.shareText}>Meydan Oku</Text>
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
              <Text style={styles.shareArena}>ARENA · GÜNÜN TESTİ</Text>
              <Text style={styles.shareDay}>{dayLabel}</Text>
              <Text style={styles.shareScore}>
                {correct}/{10}
              </Text>
              <Text style={styles.shareLabel}>{score} PUAN</Text>
              <View style={styles.shareDivider} />
              <Text style={styles.shareChallenge}>Aynı sorular seni bekliyor 😏</Text>
              <Text style={styles.shareFooter}>ELİTLİG.COM · {igHandle}</Text>
            </View>
          </ViewShot>
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => setShareOpen(false)}
              style={({ pressed }) => [styles.actionBtn, styles.closeBtn, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>Kapat</Text>
            </Pressable>
            <Pressable
              onPress={share}
              style={({ pressed }) => [styles.actionBtn, styles.shareBtn, pressed && styles.pressed]}
            >
              <Ionicons name="share-social" size={15} color={colors.surface} />
              <Text style={styles.shareText}>{busy ? "Hazırlanıyor…" : "Paylaş"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  introEmoji: {
    fontSize: 44,
  },
  introTitle: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1,
    color: colors.turf,
  },
  introBody: {
    ...type.small,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  todayCard: {
    alignItems: "center",
    backgroundColor: colors.turfDim,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    gap: 2,
  },
  todayLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
  },
  todayScore: {
    ...type.subtitle,
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.turf,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  startText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.surface,
  },
  bestLine: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: spacing.sm,
  },
  hint: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
  },
  scoreText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  timerTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.turfDim,
    overflow: "hidden",
  },
  timerFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.turf,
  },
  timerDanger: {
    backgroundColor: colors.live,
  },
  timerText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
    marginBottom: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  questionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 90,
    justifyContent: "center",
  },
  prompt: {
    ...type.body,
    fontWeight: "800",
    color: colors.line,
    textAlign: "center",
    lineHeight: 22,
  },
  options: {
    gap: spacing.sm,
  },
  option: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.turf,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  optionRight: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  optionWrong: {
    backgroundColor: colors.live,
    borderColor: colors.live,
  },
  optionText: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  optionTextLight: {
    color: "#FFFFFF",
  },
  doneScore: {
    fontSize: 42,
    fontWeight: "900",
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  doneSub: {
    ...type.small,
    color: colors.muted,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 3,
  },
  retryBtn: {
    backgroundColor: colors.turfDim,
  },
  retryText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.turf,
  },
  shareBtn: {
    backgroundColor: colors.turf,
  },
  shareText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.surface,
  },
  closeBtn: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  closeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
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
    gap: 3,
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
  shareDay: {
    fontSize: 10,
    fontWeight: "700",
    color: "#8878B8",
  },
  shareScore: {
    fontSize: 46,
    fontWeight: "900",
    color: "#F0BE2E",
    marginTop: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  shareLabel: {
    fontSize: 11,
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
    fontSize: 11,
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
  pressed: {
    opacity: 0.7,
  },
});
