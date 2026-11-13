/**
 * BİLGİ YARIŞMASI EKRANI — Arena, Kim Bu? ve Skor Tahmini'nin ortak kabuğu.
 *
 * AKIŞ
 *   1. KURULUM: "Sorular nereden gelsin?" — Tüm Türkiye ya da bir il. Seçim
 *      oyun başına cihazda saklanır; veri seçim anında arka planda yüklenir,
 *      ilde yeterli veri yoksa "Başla" yerine açık bir uyarı çıkar.
 *   2. YARIŞMA: gece stadyumu zemininde (çizgi film teması, uygulama başlığı
 *      YOK — oyun bütün ekranı kaplar) üstte lacivert HUD hapları: puan,
 *      canlar (3), seri çarpanı ve seviye; altında kalın geri sayım çubuğu. Soru kartı yaylı bir girişle gelir, şıklar
 *      sırayla süzülür. Cevap anında doğru şık yeşil, yanlış seçim kırmızı
 *      yanar; kazanılan puan yukarı süzülür. Oyun başına bir "Yarı yarıya"
 *      jokeri.
 *   3. BİTİŞ: ortak Arena sonuç kartı (rekor, gönderim, Türkiye sıralaması).
 *
 * Soru üretimi ve puanlama `lib/game/quiz/questions.ts`tedir (saf, test
 * edilir). Bu dosya yalnız sunumu ve zamanlamayı yönetir.
 *
 * AKICILIK: geri sayım çubuğu, giriş/çıkış ve puan animasyonları yerel
 * sürücüde (`useNativeDriver`) koşar; JS iş parçacığı yalnız saniyede dört
 * kez (ipucu açılışı ve kalan saniye için) uyanır.
 *
 * DURAKLAMA: köşedeki yuvarlak düğme (ve Android geri tuşu) "MOLA" kartını
 * açar: soru süresi ve sıradaki soruya geçiş donar; "Devam et" kaldığı yerden
 * sürdürür, "Oyundan çık" ekranı kapatır. Ekran odaktan çıkarsa süre durur,
 * dönünce sürer; uygulama arka plana geçerse MOLA kartı açılır — telefon
 * çaldı diye can gitmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Animated, AppState, Easing, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfettiBurst } from "@/components/game/Celebration";
import { ArenaResultCard, ArenaShareSheet, formatCount, SCORE_UNIT, useArenaScore } from "@/components/game/ArenaResult";
import { QuizCityPicker, type QuizCity } from "@/components/game/QuizCityPicker";
import {
  CartoonButton,
  CartoonPanel,
  FlashLayer,
  IconBubble,
  NavyPill,
  OUTLINE,
  PauseOverlay,
  QuizBackdrop,
  breathStyle,
  PopIn,
  Ribbon,
  RoundButton,
  StarFlight,
  SweepBanner,
  useAmbient,
  useAnswerFx,
  useExitGame,
  useFlash,
  useHardwareBack,
  useLoopClock,
  useScreenShake,
  useUrgency,
} from "@/components/game/QuizKit";
import { Avatar, TeamLogo, Touchable, useReduceMotion } from "@/components/ui";
import type { ArenaGame } from "@/lib/api/arena";
import { getMatches } from "@/lib/api/matches";
import { getPlayerRankings } from "@/lib/api/players";
import { formatDateShort } from "@/lib/format";
import {
  levelOf,
  multiplierOf,
  QUIZ_LIVES,
  scoreFor,
  toMatches,
  toPlayers,
  type QuizMatch,
  type QuizOption,
  type QuizPlayer,
  type QuizQuestion,
} from "@/lib/game/quiz/questions";
import { CARTOON } from "@/lib/game/cartoon";
import { QUIZ, QUIZ_LETTER_TONES, QUIZ_TONES, QUIZ_TRIPLE_TONES, type QuizToneName } from "@/lib/game/quizPalette";
import { useScope } from "@/providers/ScopeProvider";
import { fonts, haptics, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ═════════════════════════ SÖZLEŞME ═════════════════════════ */

export type QuizPool = { kind: "players"; players: QuizPlayer[] } | { kind: "matches"; matches: QuizMatch[] };

export interface QuizConfig {
  game: ArenaGame;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** ESKİ cihaz rekor anahtarı: yalnız ilk geçişte taşınır (bkz. lib/puzzle/saves). */
  bestKey?: string;
  /** Hangi veriden soru üretilir. */
  source: "players" | "matches";
  rules: { icon: keyof typeof Ionicons.glyphMap; text: string }[];
  /** Sıradaki soru. `scopeLabel`: "İzmir" ya da "Türkiye". */
  next: (pool: QuizPool, level: number, recent: Set<string>, scopeLabel: string) => QuizQuestion | null;
  /** Soru üretmek için gereken en küçük havuz. */
  minPool: number;
  overTitle: string;
  taunt: string;
}

type Phase = "setup" | "playing" | "over";
type Status = "asking" | "revealed";

const CITY_KEY = (game: string) => `elitlig.quiz.${game}.city.v1`;
const REVEAL_OK_MS = 1150;
const REVEAL_BAD_MS = 2000;
const LETTERS = ["A", "B", "C", "D"];
const TRIPLE_MARKS = ["1", "X", "2"];
/** Giriş kartındaki oyun ikonu kabarcığının rengi (Oyun Merkezi ile aynı). */
const GAME_TONE: Partial<Record<ArenaGame, QuizToneName>> = { kimbu: "indigo", seri: "indigo", tahmin: "indigo" };
const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

/* ═════════════════════════ VERİ ═════════════════════════ */

function useQuizPool(source: QuizConfig["source"], city: QuizCity, enabled: boolean) {
  const cityId = city?.id;
  return useQuery<QuizPool>({
    queryKey: ["quiz", source, cityId ?? "tr"],
    enabled,
    staleTime: 15 * 60_000,
    queryFn: async () => {
      if (source === "players") {
        const data = await getPlayerRankings({ cityId }, "topScorers");
        return { kind: "players", players: toPlayers(data?.players ?? []) };
      }
      const rows = await getMatches({ cityId, cityName: city?.label, status: "yayinlanmis", limit: 800, compact: true });
      return { kind: "matches", matches: toMatches(rows ?? []) };
    },
  });
}

const poolSize = (pool: QuizPool | undefined) => (!pool ? 0 : pool.kind === "players" ? pool.players.length : pool.matches.length);

/* ═════════════════════════ EKRAN ═════════════════════════ */

export function QuizScreen({ config }: { config: QuizConfig }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const exitGame = useExitGame();
  const scope = useScope();
  const reduceMotion = useReduceMotion();
  const run = useArenaScore(config.game);

  /* — Kurulum: il seçimi — */
  const [city, setCity] = useState<QuizCity>(null);
  const [cityLoaded, setCityLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(CITY_KEY(config.game)).then((raw) => {
      try {
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed.id === "number") setCity({ id: parsed.id, label: String(parsed.label) });
      } catch {
        /* bozuk kayıt: Tüm Türkiye */
      }
      setCityLoaded(true);
    });
  }, [config.game]);
  const chooseCity = (next: QuizCity) => {
    setCity(next);
    void AsyncStorage.setItem(CITY_KEY(config.game), next ? JSON.stringify(next) : "");
  };
  const scopeLabel = city ? city.label : "Türkiye";

  const poolQuery = useQuizPool(config.source, city, cityLoaded);
  const pool = poolQuery.data;
  const enough = poolSize(pool) >= config.minPool;

  /* — Yarışma durumu — */
  const [phase, setPhase] = useState<Phase>("setup");
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [status, setStatus] = useState<Status>("asking");
  const [chosen, setChosen] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(QUIZ_LIVES);
  const [streak, setStreak] = useState(0);
  /** Görsel şölen: doğru cevapta yıldız saçılımı, seviye/seri anında konfeti. */
  const [sparkTick, setSparkTick] = useState(0);
  const [confettiTick, setConfettiTick] = useState(0);
  /** Seviye atlayınca ekranı süpüren afiş. */
  const [levelTick, setLevelTick] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [asked, setAsked] = useState(0);
  const [jokerUsed, setJokerUsed] = useState(false);
  const [gain, setGain] = useState<{ value: number; id: number } | null>(null);
  const [lastMiss, setLastMiss] = useState<QuizQuestion | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  const level = levelOf(correct);
  const recent = useRef<string[]>([]);
  const statusRef = useRef<Status>("asking");
  statusRef.current = status;

  /* — Zamanlama: geri sayım yerelde, kalan süre burada — */
  const timer = useRef(new Animated.Value(1)).current;
  const timing = useRef<{ startedAt: number; total: number; left: number; paused: boolean }>({ startedAt: 0, total: 0, left: 0, paused: false });
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Cevap sonrası sıradaki soruya geçiş — MOLA'da bekletilip devamda çalışır. */
  const pendingAdvance = useRef<(() => void) | null>(null);

  const clearTimers = () => {
    if (timeout.current) clearTimeout(timeout.current);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    timeout.current = null;
    advanceTimer.current = null;
    pendingAdvance.current = null;
  };
  useEffect(() => clearTimers, []);

  /* Animasyon değerleri */
  const enter = useRef(new Animated.Value(0)).current;
  const optionAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const scoreBump = useRef(new Animated.Value(0)).current;
  const gainAnim = useRef(new Animated.Value(0)).current;
  const screenShake = useScreenShake();
  const flash = useFlash();
  const [flashOk, setFlashOk] = useState(true);

  const remainingFraction = () => {
    const t = timing.current;
    if (t.paused) return t.left / t.total;
    return Math.max(0, (t.left - (Date.now() - t.startedAt)) / t.total);
  };

  const runCountdown = (fromFraction: number, ms: number) => {
    timer.setValue(fromFraction);
    Animated.timing(timer, { toValue: 0, duration: ms, easing: Easing.linear, useNativeDriver: true }).start();
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => answer(null), ms);
  };

  /* Saniyede 4 kez: ipucu açılışı ve kalan saniye. */
  useEffect(() => {
    if (phase !== "playing" || status !== "asking") return;
    const id = setInterval(() => {
      const t = timing.current;
      if (t.paused) return;
      setElapsed((t.total - (t.left - (Date.now() - t.startedAt))) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, [phase, status, question]);

  const ask = (poolNow: QuizPool, levelNow: number) => {
    const q = config.next(poolNow, levelNow, new Set(recent.current), scopeLabel);
    if (!q) {
      finish();
      return;
    }
    recent.current = [...recent.current, ...q.subjects].slice(-30);
    setQuestion(q);
    setStatus("asking");
    setChosen(null);
    setRemoved([]);
    setElapsed(0);
    setAsked((n) => n + 1);

    const ms = q.seconds * 1000;
    timing.current = { startedAt: Date.now(), total: ms, left: ms, paused: false };
    runCountdown(1, ms);

    if (reduceMotion) {
      enter.setValue(1);
      optionAnims.forEach((a) => a.setValue(1));
      return;
    }
    // Kart sağdan dönerek süzülür; şıklar sırayla, hedefi aşıp yaylanarak oturur.
    enter.setValue(0);
    optionAnims.forEach((a) => a.setValue(0));
    const optionIn = optionAnims.map((a) => Animated.spring(a, { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }));
    Animated.parallel([
      Animated.spring(enter, { toValue: 1, useNativeDriver: true, friction: 6, tension: 75 }),
      Animated.sequence([Animated.delay(140), Animated.stagger(85, optionIn)]),
    ]).start();
  };

  const finish = () => {
    clearTimers();
    timer.stopAnimation();
    setPhase("over");
    haptics.warning();
  };

  // `answer` zaman aşımından da çağrılır; güncel durumu ref'ten okur.
  const live = useRef({ lives, streak, score, correct, question, pool, bestStreak });
  live.current = { lives, streak, score, correct, question, pool, bestStreak };

  function answer(key: string | null) {
    if (statusRef.current !== "asking") return;
    const s = live.current;
    const q = s.question;
    if (!q || !s.pool) return;
    statusRef.current = "revealed";
    clearTimers();
    timer.stopAnimation();
    const remaining = remainingFraction();
    timing.current.paused = true;
    timing.current.left = 0;

    setChosen(key);
    setStatus("revealed");
    const ok = key === q.answer;
    let livesAfter = s.lives;
    let correctAfter = s.correct;
    if (ok) {
      const nextStreak = s.streak + 1;
      const points = scoreFor(remaining, nextStreak);
      correctAfter += 1;
      setStreak(nextStreak);
      setBestStreak(Math.max(s.bestStreak, nextStreak));
      setCorrect(correctAfter);
      setScore(s.score + points);
      setGain({ value: points, id: Date.now() });
      setSparkTick((n) => n + 1);
      // Konfeti yalnız büyük anda (seviye atlama); her doğru cevapta değil.
      if (levelOf(correctAfter) > levelOf(s.correct)) {
        setConfettiTick((n) => n + 1);
        setLevelTick((n) => n + 1);
      }
      gainAnim.setValue(0);
      Animated.timing(gainAnim, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      scoreBump.setValue(1);
      Animated.spring(scoreBump, { toValue: 0, useNativeDriver: true, friction: 4 }).start();
      haptics.success();
      setFlashOk(true);
      if (!reduceMotion) flash.fire();
    } else {
      livesAfter -= 1;
      setLives(livesAfter);
      setStreak(0);
      setLastMiss(q);
      haptics.error();
      setFlashOk(false);
      if (!reduceMotion) flash.fire();
      screenShake.fire();
    }

    const poolNow = s.pool;
    const advance = () => {
      advanceTimer.current = null;
      pendingAdvance.current = null;
      if (livesAfter <= 0) {
        finish();
        return;
      }
      ask(poolNow, levelOf(correctAfter));
    };
    pendingAdvance.current = advance;
    advanceTimer.current = setTimeout(advance, ok ? REVEAL_OK_MS : REVEAL_BAD_MS);
  }

  /* Tur bittiğinde skor bir kez gönderilir. */
  const finishedRef = useRef(false);
  const { finish: finishRun, reset: resetRun } = run;
  useEffect(() => {
    if (phase === "over" && !finishedRef.current) {
      finishedRef.current = true;
      // Bitiş istatistikleri skorla gider (görev ilerlemesi; eski sunucu yok sayar).
      finishRun(score, { correct, asked, bestStreak });
    }
  }, [phase, score, finishRun, correct, asked, bestStreak]);

  const start = () => {
    if (!pool || !enough) return;
    clearTimers();
    finishedRef.current = false;
    resetRun();
    recent.current = [];
    setScore(0);
    setLives(QUIZ_LIVES);
    setStreak(0);
    setBestStreak(0);
    setCorrect(0);
    setAsked(0);
    setJokerUsed(false);
    setLastMiss(null);
    setPhase("playing");
    haptics.medium();
    ask(pool, 1);
  };

  const applyJoker = () => {
    if (jokerUsed || status !== "asking" || !question || question.options.length < 3) return;
    const wrong = question.options.filter((o) => o.key !== question.answer).map((o) => o.key);
    const drop = wrong.sort(() => Math.random() - 0.5).slice(0, question.options.length >= 4 ? 2 : 1);
    setRemoved(drop);
    setJokerUsed(true);
    haptics.light();
  };

  /* — Duraklatma: odak, arka plan ve MOLA kartı — */
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const phaseRef = useRef<Phase>("setup");
  phaseRef.current = phase;

  const pause = useCallback(() => {
    const t = timing.current;
    if (statusRef.current !== "asking" || t.paused || !t.total) return;
    t.left = Math.max(0, t.left - (Date.now() - t.startedAt));
    t.paused = true;
    timer.stopAnimation();
    if (timeout.current) clearTimeout(timeout.current);
  }, [timer]);
  const resume = useCallback(() => {
    const t = timing.current;
    // MOLA kartı açıkken odak/ön plan dönüşü süreyi başlatmaz; "Devam et" başlatır.
    if (pausedRef.current) return;
    if (statusRef.current !== "asking" || !t.paused || !t.total || t.left <= 0) return;
    t.paused = false;
    t.startedAt = Date.now();
    runCountdown(t.left / t.total, t.left);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPause = useCallback(() => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    if (phaseRef.current === "playing") {
      pause();
      // Cevap açıklanırken sıradaki soruya geçiş de bekler.
      if (advanceTimer.current) {
        clearTimeout(advanceTimer.current);
        advanceTimer.current = null;
      }
    }
    setPaused(true);
  }, [pause]);
  const closePause = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    if (phaseRef.current !== "playing") return;
    if (pendingAdvance.current && !advanceTimer.current) advanceTimer.current = setTimeout(pendingAdvance.current, 450);
    else resume();
  }, [resume]);

  useFocusEffect(
    useCallback(() => {
      resume();
      return pause;
    }, [pause, resume]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") resume();
      else if (phaseRef.current === "playing") openPause();
      else pause();
    });
    return () => sub.remove();
  }, [pause, resume, openPause]);

  /* Android geri tuşu oyun sırasında ekranı kapatmaz, MOLA kartını açar. */
  useHardwareBack(() => {
    if (pausedRef.current) {
      closePause();
      return true;
    }
    if (phaseRef.current === "playing") {
      openPause();
      return true;
    }
    return false;
  });

  const openBoard = useCallback(() => router.push({ pathname: "/siralama", params: { game: config.game } }), [router, config.game]);

  const accuracy = asked ? Math.round((correct / asked) * 100) : 0;
  const secondsLeft = question ? Math.max(0, Math.ceil(question.seconds - elapsed)) : 0;

  /* — Canlılık: ortam saati, boşta nefes, son saniye nabzı, yıldız uçuşu — */
  const { width: screenW, height: screenH } = useWindowDimensions();
  const ambient = useAmbient(paused);
  const breath = useLoopClock(2600, ambient && phase === "playing" && status === "asking");
  const asking = phase === "playing" && status === "asking" && !paused;
  const urgency = useUrgency(secondsLeft, asking && secondsLeft > 0 && secondsLeft <= 3);
  const bumpScore = useCallback(() => {
    if (reduceMotion) return;
    scoreBump.setValue(1);
    Animated.spring(scoreBump, { toValue: 0, useNativeDriver: true, friction: 3.5, tension: 160 }).start();
  }, [reduceMotion, scoreBump]);
  const scorePill = { x: layout.screenPadding + 40, y: insets.top + space.sm + 25 };

  return (
    <View style={styles.screen}>
      <QuizBackdrop paused={paused} />
      {phase === "playing" ? <FlashLayer value={flash.value} ok={flashOk} /> : null}

      <Animated.View style={[styles.body, { paddingTop: insets.top + space.sm }, screenShake.style]}>
        {/* — Üst şerit: HUD + duraklat (uygulama başlığı yok) — */}
        <View style={styles.topBar}>
          {phase !== "setup" && question ? (
            <Hud score={score} lives={lives} bump={scoreBump} />
          ) : (
            <NavyPill>
              <Ionicons name="trophy" size={15} color={QUIZ.accent} />
              <Text style={styles.pillText} {...textScale.badge}>
                {upperTR("Elitlig Arena")}
              </Text>
            </NavyPill>
          )}
          <View style={styles.flex} />
          <RoundButton icon="pause" onPress={openPause} accessibilityLabel="Oyunu duraklat" shine={ambient} />
        </View>

        <View style={styles.stage}>
          {phase === "setup" ? (
            <SetupCard
              config={config}
              best={run.best}
              city={city}
              onPickCity={() => setPickerOpen(true)}
              loading={!cityLoaded || poolQuery.isLoading}
              error={poolQuery.isError}
              enough={enough}
              onRetry={() => void poolQuery.refetch()}
              onStart={start}
            />
          ) : null}

          {phase !== "setup" && question ? (
            <View style={styles.flex}>
              <View style={styles.subBar}>
                <NavyPill style={styles.smallPill} bumpKey={level} glowKey={level}>
                  <Text style={styles.pillTextSm} {...textScale.badge}>{upperTR(`Seviye ${level}`)}</Text>
                </NavyPill>
                {streak >= 2 ? (
                  <PopIn bouncy>
                    <NavyPill style={styles.smallPill} hot={multiplierOf(streak) > 1} bumpKey={streak} glowKey={multiplierOf(streak)}>
                      <Ionicons name="flame" size={13} color={CARTOON.white} />
                      <Text style={styles.pillTextSm} {...textScale.badge}>
                        {multiplierOf(streak) > 1 ? `${streak} · ×${multiplierOf(streak)}` : `${streak}`}
                      </Text>
                    </NavyPill>
                  </PopIn>
                ) : null}
                <NavyPill style={[styles.smallPill, styles.shrink]}>
                  <Ionicons name={city ? "location" : "earth"} size={13} color={CARTOON.white} />
                  <Text style={styles.pillTextSm} numberOfLines={1} {...textScale.badge}>
                    {scopeLabel}
                  </Text>
                </NavyPill>
              </View>
              <Animated.View style={[styles.timerRow, urgency.style]}>
                <View style={styles.timerWrap}>
                  <Animated.View pointerEvents="none" style={[styles.timerGlow, { opacity: urgency.pulse }]} />
                  <TimerBar timer={timer} />
                </View>
                <Animated.View
                  style={[
                    styles.seconds,
                    secondsLeft <= 3 && status === "asking" && styles.secondsHot,
                    { transform: [{ scale: urgency.pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }] },
                  ]}
                >
                  <Text style={styles.secondsText} {...textScale.badge}>
                    {secondsLeft}
                  </Text>
                </Animated.View>
              </Animated.View>

              <View style={styles.flex}>
                <ScrollView
                  contentContainerStyle={[styles.playScroll, { paddingBottom: insets.bottom + space.xxl }]}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <Animated.View
                    style={{
                      opacity: enter.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
                      transform: [
                        { translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [screenW * 0.6, 0] }) },
                        { rotate: enter.interpolate({ inputRange: [0, 1], outputRange: ["8deg", "0deg"] }) },
                        { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
                      ],
                    }}
                  >
                    <QuestionCard question={question} status={status} chosen={chosen} elapsed={elapsed} onPick={answer} />
                  </Animated.View>

                  {question.layout !== "duel" ? (
                    <View style={styles.options}>
                      {question.options.map((option, index) => (
                        <Animated.View
                          key={option.key}
                          style={{
                            opacity: (optionAnims[index] ?? enter).interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
                            transform: [
                              { translateY: (optionAnims[index] ?? enter).interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
                              { scale: (optionAnims[index] ?? enter).interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                            ],
                          }}
                        >
                          <OptionButton
                            breath={status === "asking" && !removed.includes(option.key) ? breathStyle(breath, index) : undefined}
                            option={option}
                            mark={question.layout === "triple" ? TRIPLE_MARKS[index] : LETTERS[index]}
                            tone={(question.layout === "triple" ? QUIZ_TRIPLE_TONES[index] : QUIZ_LETTER_TONES[index]) ?? "blue"}
                            status={status}
                            isAnswer={option.key === question.answer}
                            isChosen={option.key === chosen}
                            removed={removed.includes(option.key)}
                            onPress={() => answer(option.key)}
                          />
                        </Animated.View>
                      ))}
                    </View>
                  ) : null}

                  {status === "revealed" ? (
                    <RevealLine ok={chosen === question.answer} timedOut={chosen == null} text={chosen == null ? `Süre doldu · ${question.reveal}` : question.reveal} />
                  ) : (
                    <View style={styles.tools}>
                      <CartoonButton
                        label={jokerUsed ? "Joker kullanıldı" : "Yarı yarıya"}
                        icon="color-wand"
                        tone="gold"
                        size="sm"
                        onPress={applyJoker}
                        disabled={jokerUsed || question.options.length < 3}
                        accessibilityLabel="Yarı yarıya jokeri"
                      />
                    </View>
                  )}
                </ScrollView>
              </View>

              {gain ? (
                <Animated.View
                  key={gain.id}
                  pointerEvents="none"
                  style={[
                    styles.gain,
                    {
                      opacity: gainAnim.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                      transform: [
                        { translateY: gainAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -70] }) },
                        { scale: gainAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.5, 1.25, 1] }) },
                      ],
                    },
                  ]}
                >
                  <Text style={styles.gainText} {...textScale.badge}>{`+${gain.value}`}</Text>
                  {multiplierOf(streak) > 1 ? (
                    <Text style={styles.gainSub} {...textScale.badge}>{`${streak} seri · ×${multiplierOf(streak)}`}</Text>
                  ) : null}
                </Animated.View>
              ) : null}
            </View>
          ) : null}

          <ConfettiBurst trigger={confettiTick} count={22} />
          {phase === "over" ? (
            <ArenaResultCard
              game={config.game}
              score={run.score}
              best={run.best}
              isRecord={run.isRecord}
              overTitle={config.overTitle}
              facts={[`${correct} doğru`, `%${accuracy} isabet`, `Seviye ${level}`, bestStreak > 1 ? `En uzun seri ${bestStreak}` : "", `Sorular: ${scopeLabel}`].filter(Boolean)}
              extra={lastMiss ? <MissNote question={lastMiss} /> : null}
              submit={run.submit}
              onRetrySubmit={run.retry}
              onSignIn={() => router.push("/giris")}
              onRestart={start}
              secondary={{ label: "İl değiştir", icon: "location-outline", onPress: () => setPhase("setup") }}
              stars={run.stars}
              onCity={() => router.push("/kulup-sehri")}
              onBoard={openBoard}
              onShare={() => setShareOpen(true)}
            />
          ) : null}
        </View>
      </Animated.View>

      {phase === "playing" ? (
        <>
          <StarFlight trigger={sparkTick} from={{ x: screenW / 2, y: screenH * 0.48 }} to={scorePill} onArrive={bumpScore} />
          <SweepBanner trigger={levelTick} label={`Seviye ${level}!`} icon="trending-up" />
        </>
      ) : null}

      <PauseOverlay
        visible={paused}
        onResume={closePause}
        onExit={() => {
          pausedRef.current = false;
          setPaused(false);
          clearTimers();
          exitGame();
        }}
        note={phase === "playing" ? "Süre durdu. Hazır olduğunda kaldığın yerden devam et." : undefined}
        extra={
          <CartoonButton
            label="Rekor tablosu"
            icon="trophy"
            tone="indigo"
            size="sm"
            onPress={() => {
              openBoard();
            }}
            style={styles.flex}
          />
        }
      />

      <QuizCityPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        cities={scope.cities}
        homeCityId={scope.cityId}
        value={city}
        onChange={chooseCity}
      />

      <ArenaShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        title={config.title}
        score={run.score}
        isRecord={run.isRecord}
        taunt={config.taunt}
        cityLabel={scope.cityLabel}
        subline={`${correct} doğru · Sorular: ${scopeLabel}`}
      />
    </View>
  );
}

/* ═════════════════════════ KURULUM KARTI ═════════════════════════ */

const RULE_TONES: QuizToneName[] = ["indigo"];

function SetupCard({
  config,
  best,
  city,
  onPickCity,
  loading,
  error,
  enough,
  onRetry,
  onStart,
}: {
  config: QuizConfig;
  best: number;
  city: QuizCity;
  onPickCity: () => void;
  loading: boolean;
  error: boolean;
  enough: boolean;
  onRetry: () => void;
  onStart: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const pop = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (!reduceMotion) Animated.spring(pop, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
  }, [pop, reduceMotion]);
  return (
    <ScrollView contentContainerStyle={[styles.setupScroll, { paddingBottom: insets.bottom + space.xl }]} showsVerticalScrollIndicator={false}>
      <Animated.View
        style={[
          styles.setupWrap,
          { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] },
        ]}
      >
        <CartoonPanel style={styles.card}>
          <IconBubble icon={config.icon} tone={GAME_TONE[config.game] ?? "blue"} size={64} />
          <Text style={styles.setupTitle} {...textScale.dense}>
            {config.title}
          </Text>
          <Text style={styles.setupSub} {...textScale.dense}>
            {config.subtitle}
          </Text>

          <View style={styles.rules}>
            {config.rules.map((rule, i) => (
              <View key={rule.text} style={styles.rule}>
                <IconBubble icon={rule.icon} tone={RULE_TONES[i % RULE_TONES.length]} size={30} />
                <Text style={styles.ruleText} {...textScale.long}>
                  {rule.text}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.cityLabel} {...textScale.badge}>
            {upperTR("Sorular nereden gelsin?")}
          </Text>
          <Touchable
            feedback="card"
            haptic="light"
            onPress={onPickCity}
            style={styles.cityPick}
            accessibilityRole="button"
            accessibilityLabel={`Soru kapsamı: ${city ? city.label : "Tüm Türkiye"}. Değiştir`}
          >
            <IconBubble icon={city ? "location" : "earth"} tone="indigo" size={40} />
            <View style={styles.flex}>
              <Text style={styles.cityName} {...textScale.dense}>
                {city ? city.label : "Tüm Türkiye"}
              </Text>
              <Text style={styles.cityHint} {...textScale.dense}>
                {city ? "Yalnız bu ilin oyuncu ve maçları" : "Bütün illerden karışık"}
              </Text>
            </View>
            <View style={styles.cityChange}>
              <Text style={styles.cityChangeText} {...textScale.badge}>
                {upperTR("Değiştir")}
              </Text>
            </View>
          </Touchable>

          {error ? (
            <Touchable feedback="button" onPress={onRetry} style={[styles.notice, styles.noticeBad]} accessibilityRole="button" accessibilityLabel="Tekrar dene">
              <Ionicons name="cloud-offline" size={16} color={CARTOON.redLip} />
              <Text style={styles.noticeText} {...textScale.dense}>
                Sorular yüklenemedi · tekrar dene
              </Text>
            </Touchable>
          ) : !loading && !enough ? (
            <View style={styles.notice}>
              <Ionicons name="information-circle" size={16} color={CARTOON.goldLip} />
              <Text style={styles.noticeText} {...textScale.dense}>
                Bu ilde henüz yeterli veri yok. Başka bir il ya da Tüm Türkiye'yi seç.
              </Text>
            </View>
          ) : null}

          <NavyPill style={styles.bestPill}>
            <Ionicons name="trophy" size={15} color={QUIZ.accent} />
            <Text style={styles.pillText} {...textScale.dense}>
              {best > 0 ? `Rekorun ${formatCount(best)} ${SCORE_UNIT}` : "Henüz rekorun yok"}
            </Text>
          </NavyPill>

          <CartoonButton
            label={loading ? "Sorular hazırlanıyor" : "Başla"}
            icon="play"
            tone="green"
            size="lg"
            loading={loading}
            disabled={!enough || error}
            onPress={() => onStart()}
            style={styles.stretch}
            accessibilityLabel={loading ? "Sorular hazırlanıyor" : "Başla"}
          />
        </CartoonPanel>
        <View style={styles.setupRibbon} pointerEvents="none">
          <Ribbon label="Bilgi yarışması" icon="bulb" />
        </View>
      </Animated.View>
    </ScrollView>
  );
}

/* ═════════════════════════ HUD ═════════════════════════ */

function Hud({ score, lives, bump }: { score: number; lives: number; bump: Animated.Value }) {
  return (
    <View style={styles.hud}>
      <NavyPill>
        <Ionicons name="star" size={17} color={QUIZ.accent} />
        <Animated.Text
          style={[styles.hudScore, { transform: [{ scale: bump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }] }]}
          accessibilityLabel={`Puan ${score}`}
          {...textScale.dense}
        >
          {formatCount(score)}
        </Animated.Text>
      </NavyPill>
      <NavyPill accessibilityLabel={`${lives} can`}>
        {Array.from({ length: QUIZ_LIVES }, (_, i) => (
          <Heart key={i} full={i < lives} />
        ))}
      </NavyPill>
    </View>
  );
}

/** Can kalbi: kaybedildiği an küçülüp söner (sonlu yay). */
function Heart({ full }: { full: boolean }) {
  const v = useRef(new Animated.Value(full ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: full ? 1 : 0, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [full, v]);
  return (
    <View style={styles.heartBox}>
      <Ionicons name="heart" size={20} color={QUIZ.faint} style={styles.heartGhost} />
      <Animated.View style={{ transform: [{ scale: v }], opacity: v }}>
        <Ionicons name="heart" size={20} color={CARTOON.heart} />
      </Animated.View>
    </View>
  );
}

function TimerBar({ timer }: { timer: Animated.Value }) {
  return (
    <View style={styles.timerTrack} accessibilityRole="progressbar" accessibilityLabel="Kalan süre">
      <Animated.View style={[styles.timerFill, { transform: [{ scaleX: timer }] }]}>
        <LinearGradient colors={CARTOON.green} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: timer.interpolate({ inputRange: [0, 0.3, 0.45, 1], outputRange: [1, 1, 0, 0] }) }]}>
          <LinearGradient colors={CARTOON.red} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <View style={styles.timerShine} />
      </Animated.View>
    </View>
  );
}

/* ═════════════════════════ SORU KARTI ═════════════════════════ */

function QuestionCard({
  question,
  status,
  chosen,
  elapsed,
  onPick,
}: {
  question: QuizQuestion;
  status: Status;
  chosen: string | null;
  elapsed: number;
  onPick: (key: string) => void;
}) {
  const v = question.visual;
  return (
    <CartoonPanel style={styles.qCard}>
      <View style={styles.qTag}>
        <Text style={styles.qTagText} numberOfLines={1} {...textScale.badge}>
          {upperTR(question.tag)}
        </Text>
      </View>
      <Text style={styles.qPrompt} {...textScale.dense}>
        {question.prompt}
      </Text>

      {v.type === "duel" ? (
        <View style={styles.duel}>
          {v.players.map((p, i) => {
            const key = question.options[i]?.key;
            const isAnswer = key === question.answer;
            const isChosen = key === chosen;
            const revealed = status === "revealed";
            return (
              <DuelCard
                key={p.id}
                name={p.name}
                image={p.image}
                team={p.team}
                value={revealed ? String(v.values[i]) : "?"}
                tone={i === 0 ? "blue" : "red"}
                revealed={revealed}
                isAnswer={isAnswer}
                isChosen={isChosen}
                onPress={() => key && onPick(key)}
              />
            );
          })}
          <View style={styles.vs} pointerEvents="none">
            <LinearGradient colors={CARTOON.gold} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
            <Text style={styles.vsText} {...textScale.badge}>
              VS
            </Text>
          </View>
        </View>
      ) : v.type === "spotlight" ? (
        <View style={styles.spot}>
          <View style={styles.avatarRing}>
            <Avatar name={v.player.name} image={v.player.image} size={68} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.spotName} numberOfLines={2} {...textScale.dense}>
              {v.player.name}
            </Text>
            <Text style={styles.spotCaption} numberOfLines={1} {...textScale.dense}>
              {v.caption}
            </Text>
          </View>
        </View>
      ) : v.type === "mystery" ? (
        <View style={styles.mystery}>
          <View style={styles.mysteryAvatar}>
            <LinearGradient colors={QUIZ_TONES.indigo.fill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
            {status === "revealed" ? (
              <Avatar name={v.player.name} image={v.player.image} size={76} />
            ) : (
              <Ionicons name="help" size={48} color={CARTOON.white} />
            )}
          </View>
          <View style={styles.hints}>
            {v.hints.map((hint, i) => {
              const at = (question.seconds * 0.8 * i) / v.hints.length;
              const open = status === "revealed" || elapsed >= at;
              return (
                <View key={hint} style={[styles.hint, open && styles.hintOpen]}>
                  <Ionicons name={open ? "bulb" : "lock-closed"} size={14} color={open ? CARTOON.goldLip : CARTOON.cardMuted} />
                  <Text style={[styles.hintText, !open && styles.hintLocked]} numberOfLines={2} {...textScale.dense}>
                    {open ? hint : `${Math.max(1, Math.ceil(at - elapsed))} sn sonra açılır`}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : v.type === "match" ? (
        <MatchBoard match={v.match} revealed={status === "revealed"} />
      ) : null}
    </CartoonPanel>
  );
}

function DuelCard({
  name,
  image,
  team,
  value,
  tone,
  revealed,
  isAnswer,
  isChosen,
  onPress,
}: {
  name: string;
  image?: string | null;
  team?: string | null;
  value: string;
  tone: QuizToneName;
  revealed: boolean;
  isAnswer: boolean;
  isChosen: boolean;
  onPress: () => void;
}) {
  const fx = useAnswerFx(revealed && isAnswer, revealed && isChosen && !isAnswer);
  const fill = tone === "blue" ? CARTOON.blue : CARTOON.red;
  return (
    <Animated.View style={[styles.flex, fx.style, revealed && !isAnswer && styles.faded]}>
      <Touchable
        feedback="card"
        haptic="none"
        disabled={revealed}
        onPress={onPress}
        style={[styles.duelCard, revealed && isAnswer && styles.duelCardOk]}
        accessibilityRole="button"
        accessibilityLabel={name}
      >
        <LinearGradient colors={fill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
        <View style={styles.duelShine} />
        <View style={styles.avatarRing}>
          <Avatar name={name} image={image ?? undefined} size={60} />
        </View>
        <Text style={styles.duelName} numberOfLines={2} {...textScale.dense}>
          {name}
        </Text>
        <Text style={styles.duelTeam} numberOfLines={1} {...textScale.dense}>
          {team || " "}
        </Text>
        <View style={[styles.duelValue, revealed && isAnswer && styles.duelValueOk]}>
          <Text style={[styles.duelValueText, revealed && isAnswer && styles.duelValueTextOk]} {...textScale.badge}>
            {value}
          </Text>
        </View>
        {revealed && (isAnswer || isChosen) ? (
          <View style={[styles.cornerBadge, isAnswer ? styles.badgeOk : styles.badgeBad]}>
            <Ionicons name={isAnswer ? "checkmark" : "close"} size={16} color={CARTOON.white} />
          </View>
        ) : null}
      </Touchable>
    </Animated.View>
  );
}

function MatchBoard({ match, revealed }: { match: QuizMatch; revealed: boolean }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!revealed) {
      pop.setValue(0);
      return;
    }
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
  }, [revealed, pop]);
  const homeWon = match.homeScore > match.awayScore;
  const awayWon = match.awayScore > match.homeScore;
  return (
    <View style={styles.match}>
      <Text style={styles.matchMeta} numberOfLines={1} {...textScale.badge}>
        {[formatDateShort(match.date), match.city].filter(Boolean).join(" · ")}
      </Text>
      <View style={styles.matchRow}>
        <View style={styles.matchTeam}>
          <TeamLogo name={match.home} size={52} dimmed={revealed && awayWon} />
          <Text style={styles.matchName} numberOfLines={2} {...textScale.dense}>
            {match.home}
          </Text>
        </View>
        <View style={styles.matchScoreBox}>
          <LinearGradient colors={CARTOON.pill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
          {revealed ? (
            <Animated.Text
              style={[styles.matchScore, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}
              {...textScale.dense}
            >
              {`${match.homeScore} – ${match.awayScore}`}
            </Animated.Text>
          ) : (
            <Text style={styles.matchScoreHidden} {...textScale.dense}>
              ? – ?
            </Text>
          )}
          <Text style={styles.matchFt} {...textScale.badge}>
            {revealed ? "MS" : "SONUÇ GİZLİ"}
          </Text>
        </View>
        <View style={styles.matchTeam}>
          <TeamLogo name={match.away} size={52} dimmed={revealed && homeWon} />
          <Text style={styles.matchName} numberOfLines={2} {...textScale.dense}>
            {match.away}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ═════════════════════════ ŞIK ═════════════════════════ */

function OptionButton({
  option,
  mark,
  tone,
  status,
  isAnswer,
  isChosen,
  removed,
  onPress,
  breath,
}: {
  breath?: ReturnType<typeof breathStyle>;
  option: QuizOption;
  mark: string;
  tone: QuizToneName;
  status: Status;
  isAnswer: boolean;
  isChosen: boolean;
  removed: boolean;
  onPress: () => void;
}) {
  const revealed = status === "revealed";
  const good = revealed && isAnswer;
  const bad = revealed && isChosen && !isAnswer;
  const faded = removed || (revealed && !isAnswer && !isChosen);
  const fx = useAnswerFx(good, bad);
  const face = good ? "green" : bad ? "red" : faded ? "ghost" : tone;
  return (
    <Animated.View style={[fx.style, faded && styles.fadedOption]}>
      <Animated.View style={breath}>
      <CartoonButton
        tone={face}
        keepTone
        haptic={false}
        disabled={revealed || removed}
        onPress={onPress}
        accessibilityLabel={option.label}
        faceStyle={styles.optionFace}
      >
        <View style={styles.optionRow}>
          <View style={styles.mark}>
            {good ? (
              <Ionicons name="checkmark" size={18} color={CARTOON.white} />
            ) : bad ? (
              <Ionicons name="close" size={18} color={CARTOON.white} />
            ) : (
              <Text style={styles.markText} {...textScale.badge}>
                {mark}
              </Text>
            )}
          </View>
          {option.avatar ? (
            <View style={styles.optionAvatar}>
              <Avatar name={option.avatar.name} image={option.avatar.image} size={34} />
            </View>
          ) : null}
          <View style={styles.flex}>
            <Text style={[styles.optionLabel, removed && styles.optionStruck]} numberOfLines={2} {...textScale.dense}>
              {option.label}
            </Text>
            {option.sub ? (
              <Text style={styles.optionSub} numberOfLines={1} {...textScale.dense}>
                {option.sub}
              </Text>
            ) : null}
          </View>
        </View>
      </CartoonButton>
      </Animated.View>
    </Animated.View>
  );
}

function RevealLine({ ok, timedOut, text }: { ok: boolean; timedOut: boolean; text: string }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }).start();
  }, [pop]);
  return (
    <Animated.View style={[styles.revealLine, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}>
      <LinearGradient colors={ok ? CARTOON.green : CARTOON.red} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <Ionicons name={ok ? "checkmark-circle" : timedOut ? "time" : "close-circle"} size={22} color={CARTOON.white} />
      <Text style={styles.revealText} numberOfLines={2} {...textScale.dense}>
        {text}
      </Text>
    </Animated.View>
  );
}

function MissNote({ question }: { question: QuizQuestion }) {
  return (
    <View style={styles.miss}>
      <Text style={styles.missLabel} {...textScale.badge}>
        {upperTR("Son kaçırdığın")}
      </Text>
      <Text style={styles.missPrompt} numberOfLines={2} {...textScale.dense}>
        {question.prompt}
      </Text>
      <Text style={styles.missAnswer} numberOfLines={2} {...textScale.dense}>
        {question.reveal}
      </Text>
    </View>
  );
}

/* ═════════════════════════ STİLLER ═════════════════════════ */

const shadow = { textShadowColor: QUIZ.textShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CARTOON.night[2] },
  body: { flex: 1 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  stretch: { alignSelf: "stretch" },
  faded: { opacity: 0.4 },
  fadedOption: { opacity: 0.7 },

  topBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: layout.screenPadding, minHeight: 50 },
  stage: { flex: 1 },
  pillText: { ...type.label, fontFamily: fonts.bold, color: CARTOON.white, letterSpacing: 0.6, ...shadow },
  pillTextSm: { ...type.labelXs, fontFamily: fonts.bold, color: CARTOON.white, letterSpacing: 0.5, flexShrink: 1 },
  smallPill: { minHeight: 28, paddingHorizontal: space.sm },

  /* — Kurulum — */
  setupScroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: layout.screenPadding, paddingTop: space.lg },
  setupWrap: { alignSelf: "center", maxWidth: 420, width: "100%", paddingTop: 20 },
  setupRibbon: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },
  card: { alignItems: "center", gap: space.s, paddingTop: space.xxxl },
  setupTitle: { ...type.largeTitle, fontFamily: fonts.heading, color: CARTOON.cardInk, textAlign: "center", marginTop: space.xs },
  setupSub: { ...type.bodySm, fontFamily: fonts.semibold, color: CARTOON.cardMuted, textAlign: "center" },
  rules: { alignSelf: "stretch", gap: space.sm, marginVertical: space.sm },
  rule: { flexDirection: "row", gap: space.m, alignItems: "center" },
  ruleText: { ...type.bodySm, fontFamily: fonts.semibold, color: CARTOON.cardInk, flex: 1 },
  cityLabel: { ...type.micro, fontFamily: fonts.bold, color: CARTOON.cardMuted, alignSelf: "flex-start", marginTop: space.xs },
  cityPick: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    padding: space.m,
    borderRadius: radius.xl,
    borderWidth: OUTLINE,
    borderColor: QUIZ.edge,
    backgroundColor: CARTOON.cardSoft,
  },
  cityName: { ...type.h2, color: CARTOON.cardInk },
  cityHint: { ...type.caption, letterSpacing: 0, color: CARTOON.cardMuted },
  cityChange: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: QUIZ.edge,
    backgroundColor: QUIZ.indigoInk,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  cityChangeText: { ...type.micro, fontFamily: fonts.bold, color: CARTOON.white },
  notice: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: space.xs,
    alignItems: "center",
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: QUIZ.hintOpen,
    borderWidth: 1,
    borderColor: QUIZ.hintOpenBorder,
  },
  noticeBad: { backgroundColor: CARTOON.cardSoft, borderColor: CARTOON.red[1] },
  noticeText: { ...type.caption, fontFamily: fonts.semibold, letterSpacing: 0, color: CARTOON.cardInk, flex: 1 },
  bestPill: { marginVertical: space.s, backgroundColor: QUIZ.indigoInk },

  /* — HUD — */
  hud: { flexDirection: "row", alignItems: "center", gap: space.sm },
  hudScore: { ...type.scoreSm, color: CARTOON.white, ...shadow, minWidth: 28 },
  heartBox: { width: 20, height: 20 },
  heartGhost: { position: "absolute" },
  subBar: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: layout.screenPadding, marginTop: space.s },

  timerRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: layout.screenPadding, marginTop: space.sm },
  timerWrap: { flex: 1, justifyContent: "center" },
  timerGlow: { position: "absolute", left: -4, right: -4, top: -4, bottom: -4, borderRadius: radius.pill, backgroundColor: QUIZ.dangerGlow },
  timerTrack: {
    height: 20,
    borderRadius: radius.pill,
    borderWidth: OUTLINE,
    borderColor: QUIZ.edge,
    backgroundColor: QUIZ.track,
    overflow: "hidden",
  },
  timerFill: { flex: 1, borderRadius: radius.pill, overflow: "hidden", transformOrigin: "left" },
  timerShine: { position: "absolute", top: 2, left: 6, right: 6, height: 4, borderRadius: 2, backgroundColor: QUIZ.shineSoft },
  seconds: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: OUTLINE,
    borderColor: QUIZ.edge,
    backgroundColor: QUIZ.hudPill,
  },
  secondsHot: { backgroundColor: CARTOON.red[1] },
  secondsText: { ...type.scoreSm, color: CARTOON.white, ...shadow },

  playScroll: { padding: layout.screenPadding, gap: space.md },

  /* — Soru — */
  qCard: { gap: space.m, padding: space.lg },
  qTag: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: space.m,
    paddingVertical: 3,
    backgroundColor: QUIZ.indigoTint,
    overflow: "hidden",
    maxWidth: "100%",
  },
  qTagText: { ...type.micro, fontFamily: fonts.bold, color: QUIZ.indigoInk },
  qPrompt: { ...type.h1, fontFamily: fonts.heading, color: CARTOON.cardInk },

  avatarRing: { borderRadius: radius.pill, borderWidth: OUTLINE, borderColor: QUIZ.edge, backgroundColor: CARTOON.white, padding: 2 },

  duel: { flexDirection: "row", gap: space.m, marginTop: space.xs },
  duelCard: {
    alignItems: "center",
    gap: space.xxs,
    paddingVertical: space.md,
    paddingHorizontal: space.s,
    borderRadius: radius.xl,
    borderWidth: OUTLINE,
    borderColor: QUIZ.edge,
    overflow: "hidden",
  },
  duelCardOk: { borderColor: CARTOON.greenLip },
  duelShine: { position: "absolute", top: 3, left: 8, right: 8, height: 22, borderRadius: radius.md, backgroundColor: QUIZ.shineSoft },
  duelName: { ...type.h3, fontFamily: fonts.heading, color: CARTOON.white, textAlign: "center", marginTop: space.xs, minHeight: 40, ...shadow },
  duelTeam: { ...type.caption, fontFamily: fonts.semibold, letterSpacing: 0, color: QUIZ.muted, textAlign: "center" },
  duelValue: {
    marginTop: space.xs,
    minWidth: 52,
    alignItems: "center",
    borderRadius: radius.pill,
    paddingHorizontal: space.m,
    paddingVertical: 3,
    backgroundColor: CARTOON.white,
    borderWidth: 1,
    borderColor: QUIZ.edge,
  },
  duelValueOk: { backgroundColor: CARTOON.green[1] },
  duelValueText: { ...type.scoreSm, color: CARTOON.cardInk },
  duelValueTextOk: { color: CARTOON.white },
  cornerBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: QUIZ.edge,
  },
  badgeOk: { backgroundColor: CARTOON.correct },
  badgeBad: { backgroundColor: CARTOON.wrong },
  vs: {
    position: "absolute",
    alignSelf: "center",
    left: "50%",
    top: 40,
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: OUTLINE,
    borderColor: QUIZ.edge,
    overflow: "hidden",
  },
  vsText: { ...type.label, fontFamily: fonts.bold, color: CARTOON.goldInk },

  spot: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xs },
  spotName: { ...type.h1, fontFamily: fonts.heading, color: CARTOON.cardInk },
  spotCaption: { ...type.caption, fontFamily: fonts.semibold, letterSpacing: 0, color: CARTOON.cardMuted, marginTop: 2 },

  mystery: { flexDirection: "row", gap: space.md, alignItems: "center", marginTop: space.xs },
  mysteryAvatar: {
    width: 86,
    height: 86,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: OUTLINE,
    borderColor: QUIZ.edge,
    overflow: "hidden",
  },
  hints: { flex: 1, gap: space.xs },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: CARTOON.cardSoft,
    borderWidth: 1,
    borderColor: QUIZ.edge,
  },
  hintOpen: { backgroundColor: QUIZ.hintOpen, borderColor: QUIZ.hintOpenBorder },
  hintText: { ...type.caption, fontFamily: fonts.semibold, letterSpacing: 0, color: CARTOON.cardInk, flex: 1 },
  hintLocked: { color: CARTOON.cardMuted },

  match: { gap: space.sm, marginTop: space.xs },
  matchMeta: { ...type.micro, color: CARTOON.cardMuted, textAlign: "center" },
  matchRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  matchTeam: { flex: 1, alignItems: "center", gap: space.xs },
  matchName: { ...type.h4, fontFamily: fonts.heading, color: CARTOON.cardInk, textAlign: "center" },
  matchScoreBox: {
    alignItems: "center",
    minWidth: 96,
    paddingVertical: space.s,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: OUTLINE,
    borderColor: QUIZ.edge,
    overflow: "hidden",
  },
  matchScore: { ...type.scoreLg, color: CARTOON.white, ...shadow },
  matchScoreHidden: { ...type.scoreLg, color: CARTOON.star, ...shadow },
  matchFt: { ...type.micro, fontFamily: fonts.bold, color: QUIZ.muted, marginTop: 2 },

  /* — Şıklar — */
  options: { gap: space.sm },
  optionFace: { paddingVertical: space.sm, paddingHorizontal: space.m, minHeight: 58 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: space.m },
  mark: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: QUIZ.markBg,
  },
  markText: { ...type.label, fontFamily: fonts.bold, color: CARTOON.white },
  optionAvatar: { borderRadius: radius.pill },
  optionLabel: { ...type.h2, fontFamily: fonts.heading, color: CARTOON.white, ...shadow },
  optionStruck: { textDecorationLine: "line-through" },
  optionSub: { ...type.caption, fontFamily: fonts.semibold, letterSpacing: 0, color: QUIZ.muted },

  tools: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", marginTop: space.xs },

  revealLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: OUTLINE,
    borderColor: QUIZ.edge,
    overflow: "hidden",
  },
  revealText: { ...type.body, fontFamily: fonts.heading, color: CARTOON.white, flex: 1, ...shadow },

  gain: { position: "absolute", top: 130, left: 0, right: 0, alignItems: "center" },
  gainText: { ...type.scoreJumbo, color: QUIZ.accent, textShadowColor: QUIZ.textShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  gainSub: { ...type.label, fontFamily: fonts.bold, color: CARTOON.white, ...shadow },

  miss: {
    alignSelf: "stretch",
    marginTop: space.sm,
    padding: space.m,
    borderRadius: radius.lg,
    backgroundColor: CARTOON.cardSoft,
    borderWidth: 1,
    borderColor: QUIZ.edge,
    gap: 2,
  },
  missLabel: { ...type.micro, fontFamily: fonts.bold, color: CARTOON.cardMuted },
  missPrompt: { ...type.bodySm, color: CARTOON.cardMuted },
  missAnswer: { ...type.bodySm, fontFamily: fonts.bold, color: CARTOON.cardInk },
});
