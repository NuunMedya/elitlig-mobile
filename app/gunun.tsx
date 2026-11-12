/**
 * GÜNÜN TESTİ — günlük 10 soru; o gün HERKESE AYNI sorular.
 *
 * OYUN MANTIĞI KORUNDU (dokunulmadı): sorular günün tarihinden türetilen sabit
 * tohumlu üreteçle Türkiye havuzundan (ilk 80 golcü) kurulur; soru başına 12
 * saniye, doğru 10 puan + kalan sürenin yarısı kadar hız bonusu; günde bir
 * resmî hak cihazda saklanır, sonrası antrenmandır ve güne yazılmaz.
 *
 * BU DOSYADA YENİLENEN YALNIZ SUNUM:
 *   • Süre artık çubuk değil HALKA (`ProgressRing`): rakam ile yay aynı yerde,
 *     son 4 saniyede ton kırmızıya döner.
 *   • İlerleme şeridi 10 kutucuktur; geçmiş sorular doğru/yanlış rengiyle
 *     kalır, böylece "kaçıncı sorudayım" ile "nasıl gidiyorum" tek bakışta
 *     okunur.
 *   • Şık düğmeleri dokunsaldır (doğru → success, yanlış → error titreşimi) ve
 *     cevap açıldığında dolu renkle işaretlenir; seçilmeyen şıklar söner.
 *   • Sonuç ekranı dört sayı verir: doğru · süre · puan · sıralama.
 *   • Paylaşım kartı tema tokenlarıyla yeniden çizildi ve modal yerine
 *     `BottomSheet` içine taşındı; hata artık Alert değil toast.
 *
 * ÇİZGİ FİLM TEMASI (2026-11): uygulama başlığı kaldırıldı; test bütün ekranı
 * kaplayan gece stadyumu zemininde oynanır (arcade oyunlarının dili: kalın
 * lacivert kontur, 3B düğmeler, lacivert HUD hapları). Köşedeki yuvarlak
 * DURAKLAT düğmesi ve Android geri tuşu "MOLA" kartını açar: soru sayacı ve
 * sıradaki soruya geçiş donar; "Devam et" kaldığı yerden sürdürür, "Oyundan
 * çık" ekranı kapatır. Uygulama arka plana geçerse de MOLA açılır. Süre
 * halkası yerine kalın geri sayım çubuğu + saniye rozeti kullanılır.
 *
 * SUNUM İÇİN EKLENEN İKİ DURUM — SKORA ETKİSİ YOKTUR:
 *   `marks`     → soru başına doğru/yanlış işareti, yalnız ilerleme şeridi için.
 *   `elapsedMs` → turun süresi; `start()` anındaki damgadan hesaplanır.
 *
 * SIRALAMA UCU: `getMyArenaRank` dönem parametresini iletmiyor ve dönüşü
 * `Record<string, unknown>`. "Bu hafta" için dönem şart olduğundan
 * `/api/arena/leaderboard/me` burada tiplenerek çağrılır — aynı kalıp
 * `app/(tabs)/oyunlar.tsx` içinde de var (arena.ts başka bir ajanın dosyası).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState, Easing, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import {
  CartoonButton,
  CartoonPanel,
  FlashLayer,
  IconBubble,
  NavyPill,
  OUTLINE,
  PauseOverlay,
  PopIn,
  QuizBackdrop,
  Ribbon,
  RoundButton,
  useAnswerFx,
  useExitGame,
  useFlash,
  useHardwareBack,
} from "@/components/game/QuizKit";
import { BottomSheet, useReduceMotion, useToast } from "@/components/ui";
import { startArenaSession, submitArenaScore } from "@/lib/api/arena";
import { getPlayerRankings } from "@/lib/api/players";
import { CARTOON } from "@/lib/game/cartoon";
import { QUIZ, QUIZ_LETTER_TONES, type QuizToneName } from "@/lib/game/quizPalette";
import { ApiError, get } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { instagramUrl } from "@/lib/socials";
import type { PlayerRankRow } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { fonts, haptics, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ═════════════════════════ OYUN SABİTLERİ (değişmedi) ═════════════════════ */

const ROUND = 10;
const SECONDS = 12;
const BEST_KEY = "elitlig.gunun.best.v1";
const DAY_KEY = (day: string) => `elitlig.gunun.${day}.v1`;

/**
 * Günün resmi sonucu (cihazda, gün anahtarıyla). `pending`: skor henüz sunucuya
 * yazılmadı — misafir oynadı ya da gönderim düştü. Giriş yapılınca / ekran
 * yeniden açılınca aynı gün içinde yeniden denenir; ertesi gün anahtar değiştiği
 * için eski günün bekleyen skoru hiç okunmaz (yeni günün hakkını yemez).
 */
type DayResult = { score: number; correct: number; pending?: boolean };
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

/** İlerleme şeridi işareti — yalnız görsel. */
type Mark = "correct" | "wrong";

/* ═════════════════════════ SUNUCU SÖZLEŞMESİ ═════════════════════════ */

interface DailyStandingEntry {
  rank: number;
  score: number;
}

interface DailyStanding {
  /** Bu dönemde skoru olan FARKLI oyuncu sayısı (sunucu DISTINCT sayar). */
  totalPlayers: number;
  /** Kullanıcının kendi kaydı — hiç oynamadıysa null. */
  entry: DailyStandingEntry | null;
}

/* ═════════════════════════ SAF YARDIMCILAR ═════════════════════════ */

/** 1240 → "1.240" (binlik ayracı Türkçe nokta). */
function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 84_000 → "1:24" — tur süresi. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Kalan süreye göre çubuk tonu — son 4 saniye kırmızı. */
function timeTone(secondsLeft: number): "green" | "gold" | "red" {
  if (secondsLeft <= 4) return "red";
  if (secondsLeft <= 7) return "gold";
  return "green";
}

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

/* ═════════════════════════ KÜÇÜK PARÇALAR ═════════════════════════ */

/**
 * Sonuç sayısı — üçlü şeritte tek renkli karo.
 * NEDEN İLKEL PROP: hücre memo'lu; nesne geçilseydi her render yeni referans
 * alır ve memo hiçbir şey kazandırmazdı.
 */
const StatCell = React.memo(function StatCell({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: QuizToneName;
}) {
  const fill = tone === "gold" ? CARTOON.gold : tone === "purple" ? CARTOON.purple : tone === "green" ? CARTOON.green : CARTOON.blue;
  const ink = tone === "gold" ? CARTOON.goldInk : CARTOON.white;
  return (
    <View style={styles.statCell} accessible accessibilityLabel={`${label}: ${value}`}>
      <LinearGradient colors={fill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <View style={styles.statShine} />
      <Text style={[styles.statValue, { color: ink }, ink === CARTOON.white && styles.shadow]} numberOfLines={1} {...textScale.dense}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: ink }]} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
});

/** Kural rozeti — giriş kartındaki üç küçük bilgi. */
const Fact = React.memo(function Fact({
  icon,
  label,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: QuizToneName;
}) {
  return (
    <View style={styles.fact}>
      <IconBubble icon={icon} tone={tone} size={26} />
      <Text style={styles.factText} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

/** Kalın geri sayım çubuğu — saniyede bir yumuşakça kısalır. */
function CountdownBar({ value, tone }: { value: number; tone: "green" | "gold" | "red" }) {
  const v = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: value,
      duration: value >= 0.999 ? 180 : 950,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [value, v]);
  return (
    <View style={styles.timerTrack} accessibilityRole="progressbar" accessibilityLabel="Kalan süre">
      <Animated.View style={[styles.timerFill, { transform: [{ scaleX: v }] }]}>
        <LinearGradient colors={CARTOON[tone]} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
        <View style={styles.timerShine} />
      </Animated.View>
    </View>
  );
}

/** Şık düğmesi: renkli 3B düğme; doğru zıplar, yanlış sallanır. */
function DailyOption({
  label,
  tone,
  right,
  wrong,
  muted,
  disabled,
  onPress,
}: {
  label: string;
  tone: QuizToneName;
  right: boolean;
  wrong: boolean;
  muted: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const fx = useAnswerFx(right, wrong);
  return (
    <Animated.View style={[fx.style, muted && styles.faded]}>
      <CartoonButton
        tone={right ? "green" : wrong ? "red" : muted ? "ghost" : tone}
        keepTone
        /* Titreşim şıkta değil `answer()` içinde: doğru/yanlış ayrı ton
           çalar ve süre dolduğunda da tetiklenir. */
        haptic={false}
        disabled={disabled}
        onPress={onPress}
        accessibilityLabel={label}
        faceStyle={styles.optionFace}
      >
        <View style={styles.optionRow}>
          <Text style={styles.optionText} numberOfLines={2} {...textScale.dense}>
            {label}
          </Text>
          {right ? (
            <Ionicons name="checkmark-circle" size={22} color={CARTOON.white} />
          ) : wrong ? (
            <Ionicons name="close-circle" size={22} color={CARTOON.white} />
          ) : null}
        </View>
      </CartoonButton>
    </Animated.View>
  );
}

/** Sonuç ekranının dev "7/10" rozeti. */
function GradeBadge({ correct }: { correct: number }) {
  const reduceMotion = useReduceMotion();
  const pop = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.sequence([Animated.delay(150), Animated.spring(pop, { toValue: 1, friction: 4, tension: 110, useNativeDriver: true })]).start();
  }, [pop, reduceMotion]);
  const fill = correct >= 8 ? CARTOON.green : correct >= 5 ? CARTOON.blue : CARTOON.orange;
  return (
    <Animated.View style={[styles.grade, { transform: [{ scale: pop }] }]} accessible accessibilityLabel={`${correct} / ${ROUND} doğru`}>
      <LinearGradient colors={fill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <View style={styles.gradeShine} />
      <Text style={styles.gradeValue} {...textScale.badge}>
        {`${correct}/${ROUND}`}
      </Text>
      <Text style={styles.gradeLabel} {...textScale.badge}>
        {upperTR("doğru")}
      </Text>
    </Animated.View>
  );
}

/* ═════════════════════════ EKRAN ═════════════════════════ */

export default function DailyQuizScreen() {
  const scope = useScope();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const exitGame = useExitGame();
  const reduceMotion = useReduceMotion();
  const flash = useFlash();
  const [flashOk, setFlashOk] = useState(true);

  /**
   * GÜN ANAHTARI: `toISOString()` (UTC) ile üretilir ve `(tabs)/oyunlar.tsx`
   * ile BİREBİR aynı olmalıdır — yerel takvime geçmek gece yarısı ile 03:00
   * arasında "bugün oynanmadı" gösterirdi.
   */
  const day = new Date().toISOString().slice(0, 10);
  const dayLabel = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long" });

  const query = useQuery({
    queryKey: queryKeys.playerRankings({}, "topScorers"),
    queryFn: () => getPlayerRankings({}, "topScorers"),
    staleTime: 10 * 60_000,
  });

  const standingQuery = useQuery({
    queryKey: ["arena", "me", "weekly", "gunun"],
    queryFn: () =>
      get<DailyStanding>(
        "/api/arena/leaderboard/me",
        { game: "gunun", period: "weekly" },
        { retry: false }
      ),
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
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
  const [todayResult, setTodayResult] = useState<DayResult | null>(null);
  const [best, setBest] = useState(0);
  /* — Yalnız sunum: ilerleme şeridi ve tur süresi — */
  const [marks, setMarks] = useState<Mark[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * ZAMAN AŞIMI YOLU İÇİN GÜNCEL `answer`.
   * NEDEN REF: sayaç geri çağrısı, kurulduğu render'ın `answer`'ını kapatır.
   * Sayaç her soruda `answer` içinden yeniden kurulduğu için, N. soruda çalışan
   * kapanışın `qIndex`'i bir gerideydi; süre dolunca `setQIndex(qIndex + 1)`
   * aynı sayıyı yazıyor ve test o soruda sonsuza dek kilitleniyordu (`finish`
   * hiç çağrılmaz → gün sonucu yazılmaz, skor sunucuya gitmez). Ref her
   * commit'te tazelendiğinden zaman aşımı daima GÜNCEL `answer`'ı çağırır.
   */
  const answerRef = useRef<(index: number | null) => void>(() => {});

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

  const tick = () =>
    setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          answerRef.current(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

  const startTimer = () => {
    if (timer.current) clearInterval(timer.current);
    setSecondsLeft(SECONDS);
    timer.current = tick();
  };

  /** MOLA dönüşü: kalan saniyeden sürer (sayaç sıfırlanmaz). */
  const resumeTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = tick();
  };

  /** Cevap sonrası sıradaki soruya geçiş — MOLA'da bekletilip devamda çalışır. */
  const pendingAdvance = useRef<(() => void) | null>(null);

  /** Resmî denemenin oyun oturumu (Kariyer Modu doğrulaması). */
  const dailySession = useRef<Promise<string | null> | null>(null);

  const start = (isOfficial: boolean) => {
    setOfficial(isOfficial);
    dailySession.current =
      isOfficial && auth.user
        ? startArenaSession("gunun")
            .then((data) => data.sessionId)
            .catch(() => null)
        : null;
    setScore(0);
    setCorrectCount(0);
    setQIndex(0);
    setChosen(null);
    setMarks([]);
    setElapsedMs(0);
    startedAt.current = Date.now();
    setPhase("playing");
    startTimer();
  };

  const answer = (index: number | null) => {
    if (timer.current) clearInterval(timer.current);
    setChosen(index);
    setPhase("reveal");
    const question = questions[qIndex];
    const isCorrect = index != null && question?.options[index]?.correct;
    /* Yalnız geri bildirim: titreşim ve ilerleme şeridi işareti. */
    if (isCorrect) haptics.success();
    else haptics.error();
    setFlashOk(Boolean(isCorrect));
    if (!reduceMotion) flash.fire();
    setMarks((prev) => [...prev, isCorrect ? "correct" : "wrong"]);
    if (isCorrect) {
      const bonus = Math.floor(secondsLeft / 2);
      setScore((s) => s + 10 + bonus);
      setCorrectCount((c) => c + 1);
    }
    const advance = () => {
      advanceTimer.current = null;
      pendingAdvance.current = null;
      if (qIndex + 1 >= questions.length) {
        finish(isCorrect ? 10 + Math.floor(secondsLeft / 2) : 0);
      } else {
        setQIndex(qIndex + 1);
        setChosen(null);
        setPhase("playing");
        startTimer();
      }
    };
    pendingAdvance.current = advance;
    advanceTimer.current = setTimeout(advance, 900);
  };

  /* Bağımlılık listesi YOK: sayaç her zaman en son `answer`'ı görsün. */
  useEffect(() => {
    answerRef.current = answer;
  });

  /* Bekleyen resmi skoru sunucuya yazar. 409 (bugün zaten skor var — başka
     cihazda ya da yeniden kurulumdan önce oynanmış) da "tamam" sayılır. */
  const sendingDaily = useRef(false);
  const refetchStanding = standingQuery.refetch;
  const sendDaily = useCallback(
    (result: DayResult) => {
      if (sendingDaily.current || !result.pending || result.score <= 0) return;
      sendingDaily.current = true;
      const settle = () => {
        const done = { score: result.score, correct: result.correct };
        setTodayResult(done);
        void AsyncStorage.setItem(DAY_KEY(day), JSON.stringify(done));
        // Skor yazıldıktan SONRA sıralama tazelenir; sonuç ekranı taze sıra gösterir.
        void refetchStanding();
      };
      const session = dailySession.current ?? Promise.resolve(null);
      dailySession.current = null;
      session
        .then((sessionId) => submitArenaScore("gunun", result.score, sessionId))
        .then(settle)
        .catch((error) => {
          if (error instanceof ApiError && error.status === 409) settle();
          // Diğer hatalarda skor bekler; ekran yeniden açılınca denenir.
        })
        .finally(() => {
          sendingDaily.current = false;
        });
    },
    [day, refetchStanding]
  );

  /* Misafir giriş yaptıysa ya da önceki gönderim düştüyse bugünün skoru gönderilir. */
  const triedForUser = useRef<number | null>(null);
  useEffect(() => {
    const userId = auth.user?.id ?? null;
    if (userId == null || !todayResult?.pending) return;
    // Düşen gönderim bu açılışta bir kez denenir; döngüye girmez.
    if (triedForUser.current === userId) return;
    triedForUser.current = userId;
    sendDaily(todayResult);
  }, [auth.user?.id, todayResult, sendDaily]);

  const finish = (lastGain: number) => {
    const finalScore = score + lastGain;
    const finalCorrect = correctCount + (lastGain > 0 ? 1 : 0);
    setElapsedMs(startedAt.current > 0 ? Date.now() - startedAt.current : 0);
    setPhase("done");
    if (official) {
      /* Skor önce "bekliyor" olarak cihaza yazılır; gönderimi yukarıdaki
         etki yapar (girişliyse hemen, misafirse giriş yapınca). */
      const result: DayResult = { score: finalScore, correct: finalCorrect, pending: finalScore > 0 };
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
  const myRank = standingQuery.data?.entry?.rank ?? null;
  const players = standingQuery.data?.totalPlayers ?? null;

  /** İlerleme şeridi hücresinin rengi: geçmiş → sonuç, şimdiki → mor, sonraki → boş. */
  const stripStyle = (index: number) => {
    const mark = marks[index];
    if (mark === "correct") return styles.stripCorrect;
    if (mark === "wrong") return styles.stripWrong;
    if (index === qIndex && phase !== "intro" && phase !== "done") return styles.stripCurrent;
    return null;
  };


  /* — MOLA: duraklat düğmesi, Android geri tuşu, arka plan — */
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const inGame = (p: Phase) => p === "playing" || p === "reveal";

  const openPause = () => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    if (phaseRef.current === "playing" && timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (phaseRef.current === "reveal" && advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    setPaused(true);
  };
  const closePause = () => {
    pausedRef.current = false;
    setPaused(false);
    if (phaseRef.current === "playing") resumeTimer();
    else if (phaseRef.current === "reveal" && pendingAdvance.current && !advanceTimer.current) {
      advanceTimer.current = setTimeout(pendingAdvance.current, 400);
    }
  };
  const leave = () => {
    pausedRef.current = false;
    setPaused(false);
    if (timer.current) clearInterval(timer.current);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    pendingAdvance.current = null;
    exitGame();
  };
  const openPauseRef = useRef(openPause);
  openPauseRef.current = openPause;

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && inGame(phaseRef.current)) openPauseRef.current();
    });
    return () => sub.remove();
  }, []);

  useHardwareBack(() => {
    if (pausedRef.current) {
      closePause();
      return true;
    }
    if (inGame(phaseRef.current)) {
      openPause();
      return true;
    }
    return false;
  });

  const topBar = (
    <View style={styles.topBar}>
      {inGame(phase) ? (
        <>
          <NavyPill>
            <Text style={styles.pillText} {...textScale.badge}>
              {upperTR(`Soru ${qIndex + 1}/${ROUND}`)}
            </Text>
          </NavyPill>
          <NavyPill accessibilityLabel={`${score} puan`}>
            <Ionicons name="star" size={16} color={CARTOON.star} />
            <Text style={styles.pillScore} {...textScale.dense}>
              {formatCount(score)}
            </Text>
          </NavyPill>
          {!official ? (
            <NavyPill hot style={styles.smallPill}>
              <Text style={styles.pillTextSm} {...textScale.badge}>
                {upperTR("Antrenman")}
              </Text>
            </NavyPill>
          ) : null}
        </>
      ) : (
        <NavyPill>
          <Ionicons name="calendar" size={15} color={CARTOON.star} />
          <Text style={styles.pillText} numberOfLines={1} {...textScale.badge}>
            {upperTR(dayLabel)}
          </Text>
        </NavyPill>
      )}
      <View style={styles.flex} />
      <RoundButton icon="pause" onPress={openPause} accessibilityLabel="Oyunu duraklat" />
    </View>
  );

  const scrollPad = { paddingBottom: insets.bottom + space.giant };

  return (
    <View style={styles.screen}>
      <QuizBackdrop />
      {inGame(phase) ? <FlashLayer value={flash.value} ok={flashOk} /> : null}

      <View style={[styles.body, { paddingTop: insets.top + space.sm }]}>
        {topBar}

        {query.isLoading ? (
          <View style={styles.center}>
            <CartoonPanel style={styles.stateCard}>
              <ActivityIndicator color={CARTOON.purple[1]} size="large" />
              <Text style={styles.stateTitle} {...textScale.dense}>
                Sorular hazırlanıyor
              </Text>
            </CartoonPanel>
          </View>
        ) : query.isError || questions.length < ROUND ? (
          <View style={styles.center}>
            <CartoonPanel style={styles.stateCard}>
              <IconBubble icon={query.isError ? "cloud-offline" : "calendar"} tone="red" size={60} />
              <Text style={styles.stateTitle} {...textScale.dense}>
                {query.isError ? "Sorular yüklenemedi" : "Test hazırlanamadı"}
              </Text>
              <Text style={styles.stateBody} {...textScale.long}>
                {query.isError
                  ? "Bağlantını kontrol edip tekrar dene."
                  : "Soru havuzu şu an yüklenemedi, birazdan tekrar dene."}
              </Text>
              <CartoonButton label="Tekrar dene" icon="refresh" tone="blue" onPress={() => void query.refetch()} style={styles.stretch} />
            </CartoonPanel>
          </View>
        ) : phase === "intro" ? (
          /* ——— 1) GİRİŞ ——— */
          <ScrollView contentContainerStyle={[styles.pageContent, scrollPad]} showsVerticalScrollIndicator={false}>
            <PopIn style={styles.ribbonHost}>
              <CartoonPanel style={styles.hero}>
                <IconBubble icon="bulb" tone="blue" size={64} />
                <Text style={styles.heroTitle} {...textScale.dense}>
                  Bugünün 10 sorusu hazır
                </Text>
                <Text style={styles.heroBody} {...textScale.long}>
                  Testi bugün çözen herkes aynı sorularla yarışır. Soru başına {SECONDS} saniye; her
                  doğru 10 puan, kalan süreden hız bonusu eklenir.
                </Text>
                <View style={styles.heroFacts}>
                  <Fact icon="help" label={`${ROUND} soru`} tone="blue" />
                  <Fact icon="time" label={`${SECONDS} sn/soru`} tone="orange" />
                  <Fact icon="flash" label="Hız bonusu" tone="gold" />
                </View>
                {!todayResult ? (
                  <CartoonButton
                    label="Teste başla"
                    accessibilityLabel="Bugünün testine başla"
                    icon="play"
                    tone="green"
                    size="lg"
                    haptic={false}
                    onPress={() => {
                      haptics.medium();
                      start(true);
                    }}
                    style={styles.stretch}
                  />
                ) : null}
              </CartoonPanel>
              <View style={styles.ribbonTop} pointerEvents="none">
                <Ribbon label="Günün Testi" icon="calendar" />
              </View>
            </PopIn>

            {todayResult ? (
              <>
                <PopIn style={styles.ribbonHost} delay={120}>
                  <CartoonPanel style={styles.resultCard}>
                    <Text style={styles.todayLabel} {...textScale.badge}>
                      Bugünkü hakkını kullandın. Yarın yeni 10 soru!
                    </Text>
                    <View style={styles.statRow}>
                      <StatCell value={`${todayResult.correct}/${ROUND}`} label="doğru" tone="blue" />
                      <StatCell value={formatCount(todayResult.score)} label="puan" tone="gold" />
                      <StatCell value={myRank != null ? `#${myRank}` : "—"} label="sıralama" tone="purple" />
                    </View>
                    <ResultActions
                      score={todayResult.score}
                      correct={todayResult.correct}
                      dayLabel={dayLabel}
                      scopeCity={scope.cityLabel}
                      onRetry={() => start(false)}
                      retryLabel="Antrenman"
                    />
                  </CartoonPanel>
                  <View style={styles.ribbonTop} pointerEvents="none">
                    <Ribbon label="Bugün oynadın" icon="checkmark-circle" fill={QUIZ.ribbonGreen} />
                  </View>
                </PopIn>

                <Text style={styles.hint} {...textScale.long}>
                  Antrenman skoru güne yazılmaz — resmî hak günde bir.
                </Text>
              </>
            ) : null}

            {best > 0 ? (
              <NavyPill style={styles.centerPill}>
                <Ionicons name="trophy" size={15} color={CARTOON.star} />
                <Text style={styles.pillText} {...textScale.badge}>
                  En iyi günün: {formatCount(best)} puan
                </Text>
              </NavyPill>
            ) : null}

            {!auth.user ? (
              <Text style={styles.hint} {...textScale.long}>
                Skorun rekor tablosuna yazılsın diye giriş yapabilirsin.
              </Text>
            ) : null}
          </ScrollView>
        ) : phase === "done" ? (
          /* ——— 3) SONUÇ ——— */
          <ScrollView contentContainerStyle={[styles.pageContent, scrollPad]} showsVerticalScrollIndicator={false}>
            <PopIn style={styles.ribbonHost}>
              <CartoonPanel style={styles.resultCard}>
                <GradeBadge correct={correctCount} />

                <Text style={styles.resultScore} {...textScale.dense}>
                  {formatCount(score)}
                </Text>
                <View style={styles.resultUnitRow}>
                  <Text style={styles.resultUnit} {...textScale.badge}>
                    {upperTR("puan")}
                  </Text>
                  {!official ? (
                    <View style={styles.practiceChip}>
                      <Text style={styles.practiceText} {...textScale.badge}>
                        {upperTR("Antrenman")}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Doğru sayısı rozetin içinde yazıyor; şerit onu tekrarlamaz. */}
                <View style={styles.statRow}>
                  <StatCell value={formatDuration(elapsedMs)} label="süre" tone="blue" />
                  <StatCell value={formatCount(score)} label="puan" tone="gold" />
                  <StatCell value={myRank != null ? `#${myRank}` : "—"} label="sıralama" tone="purple" />
                </View>

                {!auth.user ? (
                  <Text style={styles.resultMeta} numberOfLines={2} {...textScale.dense}>
                    Sıralamaya girmek için giriş yapman yeterli.
                  </Text>
                ) : players != null ? (
                  <Text style={styles.resultMeta} numberOfLines={2} {...textScale.dense}>
                    Bu hafta {formatCount(players)} kişi Günün Testi'nde yarıştı.
                  </Text>
                ) : null}

                <ResultActions
                  score={score}
                  correct={correctCount}
                  dayLabel={dayLabel}
                  scopeCity={scope.cityLabel}
                  onRetry={() => start(false)}
                  retryLabel="Antrenman"
                />
              </CartoonPanel>
              <View style={styles.ribbonTop} pointerEvents="none">
                {official ? (
                  <Ribbon label="Test bitti" icon="trophy" fill={QUIZ.ribbonGold} />
                ) : (
                  <Ribbon label="Antrenman bitti" icon="barbell" />
                )}
              </View>
            </PopIn>

            {!official ? (
              <Text style={styles.hint} {...textScale.long}>
                Antrenman skoru güne yazılmaz.
              </Text>
            ) : null}
          </ScrollView>
        ) : (
          /* ——— 2) OYUN ——— */
          <ScrollView contentContainerStyle={[styles.pageContent, scrollPad]} showsVerticalScrollIndicator={false}>
            <View style={styles.strip}>
              {questions.map((item, index) => (
                <View key={`${item.prompt}-${index}`} style={[styles.stripCell, stripStyle(index)]} />
              ))}
            </View>

            <View style={styles.timerRow}>
              <CountdownBar value={secondsLeft / SECONDS} tone={timeTone(secondsLeft)} />
              <View
                style={[styles.seconds, secondsLeft <= 4 && styles.secondsHot]}
                accessible
                accessibilityLabel={`${secondsLeft} saniye kaldı`}
              >
                <Text style={styles.secondsText} {...textScale.badge}>
                  {secondsLeft}
                </Text>
              </View>
            </View>

            <PopIn key={`q${qIndex}`}>
              <CartoonPanel style={styles.questionCard}>
                <View style={styles.qTag}>
                  <LinearGradient colors={CARTOON.purple} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
                  <Text style={styles.qTagText} {...textScale.badge}>
                    {upperTR(`Soru ${qIndex + 1}`)}
                  </Text>
                </View>
                <Text style={styles.prompt} {...textScale.long}>
                  {question.prompt}
                </Text>
              </CartoonPanel>
            </PopIn>

            <View style={styles.options}>
              {question.options.map((option, index) => {
                const revealed = phase === "reveal";
                const isChosen = chosen === index;
                const right = revealed && option.correct;
                const wrong = revealed && isChosen && !option.correct;
                return (
                  <PopIn key={`${qIndex}-${option.label}-${index}`} delay={80 + index * 70}>
                    <DailyOption
                      label={option.label}
                      tone={QUIZ_LETTER_TONES[index] ?? "blue"}
                      right={right}
                      wrong={wrong}
                      muted={revealed && !right && !wrong}
                      disabled={phase !== "playing"}
                      onPress={() => phase === "playing" && answer(index)}
                    />
                  </PopIn>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      <PauseOverlay
        visible={paused}
        onResume={closePause}
        onExit={leave}
        note={inGame(phase) ? "Süre durdu. Hazır olduğunda kaldığın yerden devam et." : undefined}
      />
    </View>
  );
}

/* ═════════════════════════ SONUÇ EYLEMLERİ + PAYLAŞIM ═════════════════════ */

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
  const toast = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);

  const igHandle = useMemo(() => {
    const url = instagramUrl(scopeCity);
    const handle = url?.split("instagram.com/")[1]?.replace(/\/+$/, "");
    return handle ? `@${handle}` : "elitlig.com";
  }, [scopeCity]);

  const openShare = useCallback(() => setShareOpen(true), []);
  const closeShare = useCallback(() => setShareOpen(false), []);

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      } else {
        toast.show({ message: "Bu cihazda paylaşım kapalı.", tone: "warn" });
      }
    } catch {
      toast.show({ message: "Görsel oluşturulamadı, tekrar dener misin?", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }, [busy, toast]);

  return (
    <>
      <View style={styles.actionRow}>
        <CartoonButton
          label={retryLabel}
          accessibilityLabel={`${retryLabel} turu`}
          icon="refresh"
          tone="blue"
          size="sm"
          onPress={onRetry}
          style={styles.actionButton}
        />
        <CartoonButton label="Meydan oku" icon="share-social" tone="gold" size="sm" onPress={openShare} style={styles.actionButton} />
      </View>

      <BottomSheet visible={shareOpen} onClose={closeShare} title="Sonucunu paylaş" snap="full">
        <View style={styles.shareWrap}>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <View style={styles.shareCard}>
              <LinearGradient colors={CARTOON.night} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
              <View style={styles.shareSkyline} pointerEvents="none">
                {[54, 86, 40, 70, 96, 50, 78].map((h, i) => (
                  <View key={i} style={[styles.shareTower, { height: h }]}>
                    <View style={styles.shareWindow} />
                    <View style={[styles.shareWindow, i % 2 === 0 && styles.shareWindowOff]} />
                  </View>
                ))}
              </View>

              <View style={styles.shareBody}>
                <View style={styles.shareTop}>
                  <Text style={styles.shareBrand} {...textScale.badge}>
                    elitlig
                  </Text>
                  <View style={styles.shareKicker}>
                    <Text style={styles.shareKickerText} {...textScale.badge}>
                      {upperTR("Günün Testi")}
                    </Text>
                  </View>
                </View>

                <Text style={styles.shareDay} {...textScale.badge}>
                  {upperTR(dayLabel)}
                </Text>

                <View style={styles.shareBadge}>
                  <LinearGradient colors={CARTOON.green} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
                  <Text style={styles.shareScore} {...textScale.badge}>
                    {correct}/{ROUND}
                  </Text>
                </View>
                <View style={styles.shareUnit}>
                  <Text style={styles.shareUnitText} {...textScale.badge}>
                    {upperTR(`${formatCount(score)} puan`)}
                  </Text>
                </View>

                <Text style={styles.shareChallenge} {...textScale.badge}>
                  Aynı sorular seni bekliyor
                </Text>

                <View style={styles.flex} />

                <Text style={styles.shareFooter} {...textScale.badge}>
                  {upperTR(`elitlig.com · ${igHandle}`)}
                </Text>
              </View>
            </View>
          </ViewShot>
        </View>

        <CartoonButton label={busy ? "Hazırlanıyor" : "Paylaş"} icon="share-social" tone="green" onPress={share} loading={busy} />
        <Text style={styles.shareHint} {...textScale.dense}>
          İndirmek için: Paylaş → Görüntüyü Kaydet
        </Text>
      </BottomSheet>
    </>
  );
}

/* ═════════════════════════ STİLLER ═════════════════════════ */

const shadow = { textShadowColor: CARTOON.textShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CARTOON.night[2] },
  body: { flex: 1 },
  flex: { flex: 1 },
  stretch: { alignSelf: "stretch" },
  faded: { opacity: 0.7 },
  shadow,

  topBar: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: layout.screenPadding, minHeight: 50 },
  pillText: { ...type.label, fontFamily: fonts.bold, color: CARTOON.white, letterSpacing: 0.6, ...shadow },
  pillTextSm: { ...type.labelXs, fontFamily: fonts.bold, color: CARTOON.white, letterSpacing: 0.4 },
  pillScore: { ...type.scoreSm, color: CARTOON.white, ...shadow },
  smallPill: { paddingHorizontal: space.sm },
  centerPill: { alignSelf: "center" },

  center: { flex: 1, justifyContent: "center", padding: layout.screenPadding },
  stateCard: { alignItems: "center", gap: space.md, paddingVertical: space.xxl },
  stateTitle: { ...type.h1, fontFamily: fonts.heading, color: CARTOON.cardInk, textAlign: "center" },
  stateBody: { ...type.body, fontFamily: fonts.semibold, color: CARTOON.cardMuted, textAlign: "center" },

  pageContent: {
    padding: layout.screenPadding,
    paddingTop: space.lg,
    gap: space.lg,
  },
  ribbonHost: { paddingTop: 20 },
  ribbonTop: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },

  /* — Giriş kartı — */
  hero: { gap: space.md, alignItems: "center", paddingTop: space.xxxl },
  heroTitle: { ...type.display, fontFamily: fonts.heading, color: CARTOON.cardInk, textAlign: "center" },
  heroBody: { ...type.body, fontFamily: fonts.semibold, color: CARTOON.cardMuted, textAlign: "center" },
  heroFacts: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.sm },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    backgroundColor: CARTOON.cardSoft,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: CARTOON.outline,
    paddingLeft: space.xxs,
    paddingRight: space.m,
    paddingVertical: space.xxs,
  },
  factText: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: CARTOON.cardInk },

  /* — Sonuç / bugünkü sonuç kartı — */
  resultCard: { gap: space.md, alignItems: "center", paddingTop: space.xxxl },
  todayLabel: { ...type.label, fontFamily: fonts.heading, color: CARTOON.cardInk, textAlign: "center" },
  grade: {
    width: 118,
    height: 118,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: CARTOON.outline,
    overflow: "hidden",
  },
  gradeShine: { position: "absolute", top: 6, left: 24, right: 24, height: 26, borderRadius: radius.pill, backgroundColor: CARTOON.shine },
  gradeValue: { ...type.scoreLg, color: CARTOON.white, ...shadow },
  gradeLabel: { ...type.micro, fontFamily: fonts.bold, color: CARTOON.white, letterSpacing: 1 },
  resultScore: { ...type.scoreJumbo, color: CARTOON.cardInk },
  resultUnitRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: -space.sm },
  resultUnit: { ...type.label, fontFamily: fonts.bold, letterSpacing: 1.2, color: CARTOON.cardMuted },
  practiceChip: {
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: CARTOON.outline,
    backgroundColor: CARTOON.orange[1],
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  practiceText: { ...type.micro, fontFamily: fonts.bold, color: CARTOON.white },
  resultMeta: { ...type.caption, fontFamily: fonts.semibold, letterSpacing: 0, color: CARTOON.cardMuted, textAlign: "center" },

  statRow: { flexDirection: "row", alignItems: "stretch", alignSelf: "stretch", gap: space.sm },
  statCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
    paddingVertical: space.m,
    borderRadius: radius.lg,
    borderWidth: OUTLINE,
    borderColor: CARTOON.outline,
    overflow: "hidden",
  },
  statShine: { position: "absolute", top: 3, left: 6, right: 6, height: 14, borderRadius: radius.xs, backgroundColor: CARTOON.shine },
  statValue: { ...type.scoreSm },
  statLabel: { ...type.micro, fontFamily: fonts.bold },

  hint: {
    ...type.caption,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: CARTOON.white,
    textAlign: "center",
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: QUIZ.navyGlass,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },

  /* — Oyun: ilerleme şeridi + süre — */
  strip: { flexDirection: "row", gap: space.xs },
  stripCell: {
    flex: 1,
    height: 14,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: CARTOON.outline,
    backgroundColor: CARTOON.pill[0],
  },
  stripCurrent: { backgroundColor: CARTOON.gold[0] },
  stripCorrect: { backgroundColor: CARTOON.correct },
  stripWrong: { backgroundColor: CARTOON.wrong },

  timerRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: -space.xs },
  timerTrack: {
    flex: 1,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: OUTLINE,
    borderColor: CARTOON.outline,
    backgroundColor: CARTOON.pill[1],
    overflow: "hidden",
  },
  timerFill: { flex: 1, borderRadius: radius.pill, overflow: "hidden", transformOrigin: "left" },
  timerShine: { position: "absolute", top: 2, left: 6, right: 6, height: 5, borderRadius: 3, backgroundColor: CARTOON.shine },
  seconds: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: OUTLINE,
    borderColor: CARTOON.outline,
    backgroundColor: CARTOON.pill[0],
  },
  secondsHot: { backgroundColor: CARTOON.red[1] },
  secondsText: { ...type.scoreMd, color: CARTOON.white, ...shadow },

  /* — Soru kartı — */
  questionCard: {
    minHeight: 132,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    paddingVertical: space.xl,
  },
  qTag: {
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 3,
    borderWidth: 2,
    borderColor: CARTOON.outline,
    overflow: "hidden",
  },
  qTagText: { ...type.micro, fontFamily: fonts.bold, color: CARTOON.white, letterSpacing: 1 },
  prompt: { ...type.display, fontFamily: fonts.heading, color: CARTOON.cardInk, textAlign: "center" },

  /* — Şıklar — */
  options: { gap: space.md },
  optionFace: { minHeight: 62, paddingVertical: space.md, paddingHorizontal: space.lg },
  optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  optionText: { ...type.h1, fontFamily: fonts.heading, color: CARTOON.white, textAlign: "center", flexShrink: 1, ...shadow },

  /* — Eylemler — */
  actionRow: { flexDirection: "row", gap: space.sm, alignSelf: "stretch" },
  actionButton: { flex: 1 },

  /* — Paylaşım kartı — */
  shareWrap: { alignItems: "center", paddingVertical: space.md },
  shareCard: {
    width: 264,
    height: 396,
    borderRadius: radius.xxl,
    borderWidth: OUTLINE,
    borderColor: CARTOON.outline,
    overflow: "hidden",
  },
  shareSkyline: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  shareTower: { flex: 1, backgroundColor: CARTOON.skyline, alignItems: "center", paddingTop: space.sm, gap: space.sm },
  shareWindow: { width: 7, height: 9, borderRadius: 1, backgroundColor: CARTOON.window },
  shareWindowOff: { opacity: 0.2 },
  shareBody: { flex: 1, padding: space.lg, alignItems: "center", gap: space.sm },
  shareTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch" },
  shareBrand: { ...type.h2, fontFamily: fonts.bold, color: CARTOON.white, ...shadow },
  shareKicker: {
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: CARTOON.outline,
    backgroundColor: CARTOON.gold[0],
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  shareKickerText: { ...type.micro, fontFamily: fonts.bold, color: CARTOON.goldInk },
  shareDay: { ...type.micro, fontFamily: fonts.bold, color: QUIZ.muted, marginTop: space.xs, letterSpacing: 1 },
  shareBadge: {
    width: 132,
    height: 132,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: CARTOON.outline,
    overflow: "hidden",
    marginTop: space.sm,
  },
  shareScore: { ...type.scoreJumbo, color: CARTOON.white, ...shadow },
  shareUnit: {
    marginTop: -space.lg,
    borderRadius: radius.pill,
    borderWidth: OUTLINE,
    borderColor: CARTOON.outline,
    backgroundColor: CARTOON.gold[1],
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  shareUnitText: { ...type.label, fontFamily: fonts.bold, color: CARTOON.goldInk },
  shareChallenge: { ...type.label, fontFamily: fonts.heading, color: CARTOON.white, textAlign: "center", marginTop: space.sm, ...shadow },
  shareFooter: { ...type.micro, fontFamily: fonts.bold, color: CARTOON.white, textAlign: "center", ...shadow },
  shareHint: { ...type.caption, color: CARTOON.cardMuted, textAlign: "center", marginTop: space.sm },
});
