/**
 * BİLGİ YARIŞMASI EKRANI — Arena, Kim Bu? ve Skor Tahmini'nin ortak kabuğu.
 *
 * AKIŞ
 *   1. KURULUM: "Sorular nereden gelsin?" — Tüm Türkiye ya da bir il. Seçim
 *      oyun başına cihazda saklanır; veri seçim anında arka planda yüklenir,
 *      ilde yeterli veri yoksa "Başla" yerine açık bir uyarı çıkar.
 *   2. YARIŞMA: koyu sahnede üstte puan, canlar (3), seri çarpanı ve seviye;
 *      altında geri sayım çubuğu. Soru kartı yaylı bir girişle gelir, şıklar
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
 * DURAKLAMA: ekran odaktan çıkarsa ya da uygulama arka plana geçerse soru
 * süresi durur, dönünce kaldığı yerden sürer — telefon çaldı diye can gitmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, Easing, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ArenaResultCard, ArenaShareSheet, formatCount, SCORE_UNIT, useArenaScore } from "@/components/game/ArenaResult";
import { QuizCityPicker, type QuizCity } from "@/components/game/QuizCityPicker";
import { Avatar, Button, GradientFill, ScreenHeader, TeamLogo, Touchable, useReduceMotion, withAlpha } from "@/components/ui";
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
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, fonts, haptics, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ═════════════════════════ SÖZLEŞME ═════════════════════════ */

export type QuizPool = { kind: "players"; players: QuizPlayer[] } | { kind: "matches"; matches: QuizMatch[] };

export interface QuizConfig {
  game: ArenaGame;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  bestKey: string;
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
  const scope = useScope();
  const reduceMotion = useReduceMotion();
  const run = useArenaScore(config.game, config.bestKey);

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

  const clearTimers = () => {
    if (timeout.current) clearTimeout(timeout.current);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    timeout.current = null;
    advanceTimer.current = null;
  };
  useEffect(() => clearTimers, []);

  /* Animasyon değerleri */
  const enter = useRef(new Animated.Value(0)).current;
  const optionAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const scoreBump = useRef(new Animated.Value(0)).current;
  const gainAnim = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

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

    enter.setValue(0);
    optionAnims.forEach((a) => a.setValue(0));
    const optionIn = optionAnims.map((a) =>
      Animated.timing(a, { toValue: 1, duration: reduceMotion ? 0 : 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    );
    Animated.parallel([
      Animated.spring(enter, { toValue: 1, useNativeDriver: true, friction: 8, tension: 70 }),
      Animated.stagger(reduceMotion ? 0 : 70, optionIn),
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
      gainAnim.setValue(0);
      Animated.timing(gainAnim, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      scoreBump.setValue(1);
      Animated.spring(scoreBump, { toValue: 0, useNativeDriver: true, friction: 4 }).start();
      haptics.success();
    } else {
      livesAfter -= 1;
      setLives(livesAfter);
      setStreak(0);
      setLastMiss(q);
      haptics.error();
      if (!reduceMotion) {
        Animated.sequence(
          [10, -8, 6, -3, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true })),
        ).start();
      }
    }

    const poolNow = s.pool;
    advanceTimer.current = setTimeout(
      () => {
        if (livesAfter <= 0) {
          finish();
          return;
        }
        ask(poolNow, levelOf(correctAfter));
      },
      ok ? REVEAL_OK_MS : REVEAL_BAD_MS,
    );
  }

  /* Tur bittiğinde skor bir kez gönderilir. */
  const finishedRef = useRef(false);
  const { finish: finishRun, reset: resetRun } = run;
  useEffect(() => {
    if (phase === "over" && !finishedRef.current) {
      finishedRef.current = true;
      finishRun(score);
    }
  }, [phase, score, finishRun]);

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

  /* — Duraklatma: odak ve arka plan — */
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
    if (statusRef.current !== "asking" || !t.paused || !t.total || t.left <= 0) return;
    t.paused = false;
    t.startedAt = Date.now();
    runCountdown(t.left / t.total, t.left);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(
    useCallback(() => {
      resume();
      return pause;
    }, [pause, resume]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => (state === "active" ? resume() : pause()));
    return () => sub.remove();
  }, [pause, resume]);

  const openBoard = useCallback(() => router.push({ pathname: "/siralama", params: { game: config.game } }), [router, config.game]);
  const headerActions = useMemo(
    () => [{ icon: "trophy-outline" as const, onPress: openBoard, accessibilityLabel: "Rekor tablosu" }],
    [openBoard],
  );

  const accuracy = asked ? Math.round((correct / asked) * 100) : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title={config.title} overline={upperTR("Elitlig Arena")} subtitle={config.subtitle} back actions={headerActions} />

      <View style={styles.stage}>
        <GradientFill tone="ink" radius="xl" />
        <View style={styles.glow} pointerEvents="none" />

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
            <Hud score={score} lives={lives} streak={streak} level={level} scopeLabel={scopeLabel} bump={scoreBump} />
            <TimerBar timer={timer} />

            <Animated.View style={[styles.flex, { transform: [{ translateX: shake }] }]}>
              <ScrollView contentContainerStyle={styles.playScroll} showsVerticalScrollIndicator={false} bounces={false}>
                <Animated.View
                  style={{
                    opacity: enter,
                    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
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
                          opacity: optionAnims[index] ?? 1,
                          transform: [{ translateY: (optionAnims[index] ?? enter).interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
                        }}
                      >
                        <OptionButton
                          option={option}
                          mark={question.layout === "triple" ? TRIPLE_MARKS[index] : LETTERS[index]}
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
                  <View style={[styles.revealLine, chosen === question.answer ? styles.revealOk : styles.revealBad]}>
                    <Ionicons
                      name={chosen === question.answer ? "checkmark-circle" : chosen == null ? "time" : "close-circle"}
                      size={16}
                      color={chosen === question.answer ? colors.win : colors.danger}
                    />
                    <Text style={styles.revealText} numberOfLines={2} {...textScale.dense}>
                      {chosen == null ? `Süre doldu · ${question.reveal}` : question.reveal}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.tools}>
                    <Touchable
                      feedback="chip"
                      haptic="light"
                      onPress={applyJoker}
                      disabled={jokerUsed || question.options.length < 3}
                      style={[styles.joker, (jokerUsed || question.options.length < 3) && styles.jokerUsed]}
                      accessibilityRole="button"
                      accessibilityLabel="Yarı yarıya jokeri"
                    >
                      <Ionicons name="color-wand" size={14} color={jokerUsed ? colors.onDarkMuted : colors.star} />
                      <Text style={[styles.jokerText, jokerUsed && styles.jokerTextUsed]} {...textScale.badge}>
                        {jokerUsed ? "Joker kullanıldı" : "Yarı yarıya"}
                      </Text>
                    </Touchable>
                    <Text style={styles.secondsLeft} {...textScale.badge}>
                      {`${Math.max(0, Math.ceil(question.seconds - elapsed))} sn`}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </Animated.View>

            {gain ? (
              <Animated.View
                key={gain.id}
                pointerEvents="none"
                style={[
                  styles.gain,
                  {
                    opacity: gainAnim.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                    transform: [
                      { translateY: gainAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
                      { scale: gainAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.15, 1] }) },
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
            onBoard={openBoard}
            onShare={() => setShareOpen(true)}
          />
        ) : null}
      </View>

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
    </SafeAreaView>
  );
}

/* ═════════════════════════ KURULUM KARTI ═════════════════════════ */

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
  return (
    <ScrollView contentContainerStyle={styles.setupScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <View style={styles.setupIcon}>
          <Ionicons name={config.icon} size={24} color={colors.brandAccent} />
        </View>
        <Text style={styles.overline} {...textScale.badge}>
          {upperTR("Elitlig Arena · Bilgi Yarışması")}
        </Text>
        <Text style={styles.setupTitle} {...textScale.dense}>
          {config.title}
        </Text>

        <View style={styles.rules}>
          {config.rules.map((rule) => (
            <View key={rule.text} style={styles.rule}>
              <Ionicons name={rule.icon} size={15} color={colors.brandAccent} style={styles.ruleIcon} />
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
          <View style={styles.cityIcon}>
            <Ionicons name={city ? "location" : "earth"} size={18} color={colors.brandAccent} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.cityName} {...textScale.dense}>
              {city ? city.label : "Tüm Türkiye"}
            </Text>
            <Text style={styles.cityHint} {...textScale.dense}>
              {city ? "Yalnız bu ilin oyuncu ve maçları" : "Bütün illerden karışık"}
            </Text>
          </View>
          <Text style={styles.cityChange} {...textScale.badge}>
            Değiştir
          </Text>
        </Touchable>

        {error ? (
          <Touchable feedback="button" onPress={onRetry} style={styles.notice} accessibilityRole="button" accessibilityLabel="Tekrar dene">
            <Ionicons name="cloud-offline-outline" size={15} color={colors.danger} />
            <Text style={styles.noticeText} {...textScale.dense}>
              Sorular yüklenemedi · tekrar dene
            </Text>
          </Touchable>
        ) : !loading && !enough ? (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={15} color={colors.warn} />
            <Text style={styles.noticeText} {...textScale.dense}>
              Bu ilde henüz yeterli veri yok. Başka bir il ya da Tüm Türkiye'yi seç.
            </Text>
          </View>
        ) : null}

        <View style={styles.bestPill}>
          <Ionicons name="trophy" size={13} color={colors.star} />
          <Text style={styles.bestText} {...textScale.dense}>
            {best > 0 ? `Rekorun ${formatCount(best)} ${SCORE_UNIT}` : "Henüz rekorun yok"}
          </Text>
        </View>

        <Button
          label={loading ? "Sorular hazırlanıyor" : "Başla"}
          icon="play"
          size="lg"
          fullWidth
          loading={loading}
          disabled={!enough || error}
          onPress={onStart}
        />
      </View>
    </ScrollView>
  );
}

/* ═════════════════════════ HUD ═════════════════════════ */

function Hud({
  score,
  lives,
  streak,
  level,
  scopeLabel,
  bump,
}: {
  score: number;
  lives: number;
  streak: number;
  level: number;
  scopeLabel: string;
  bump: Animated.Value;
}) {
  const mult = multiplierOf(streak);
  return (
    <View style={styles.hud}>
      <View style={styles.flex}>
        <Text style={styles.hudLabel} {...textScale.badge}>
          {upperTR(`Puan · ${scopeLabel}`)}
        </Text>
        <Animated.Text
          style={[styles.hudScore, { transform: [{ scale: bump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }] }]}
          {...textScale.dense}
        >
          {formatCount(score)}
        </Animated.Text>
      </View>
      <View style={styles.hudRight}>
        <View style={styles.hearts}>
          {Array.from({ length: QUIZ_LIVES }, (_, i) => (
            <Ionicons key={i} name={i < lives ? "heart" : "heart-outline"} size={18} color={i < lives ? colors.live : colors.onDarkMuted} />
          ))}
        </View>
        <View style={styles.hudPills}>
          {streak >= 2 ? (
            <View style={[styles.pill, mult > 1 && styles.pillHot]}>
              <Ionicons name="flame" size={12} color={mult > 1 ? colors.star : colors.onDarkMuted} />
              <Text style={[styles.pillText, mult > 1 && styles.pillTextHot]} {...textScale.badge}>
                {mult > 1 ? `${streak} · ×${mult}` : `${streak}`}
              </Text>
            </View>
          ) : null}
          <View style={[styles.pill, styles.pillLevel]}>
            <Text style={styles.pillText} {...textScale.badge}>{`Seviye ${level}`}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function TimerBar({ timer }: { timer: Animated.Value }) {
  return (
    <View style={styles.timerTrack}>
      <Animated.View style={[styles.timerFill, { transform: [{ scaleX: timer }] }]}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.timerDanger, { opacity: timer.interpolate({ inputRange: [0, 0.3, 0.45, 1], outputRange: [1, 1, 0, 0] }) }]}
        />
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
    <View style={styles.qCard}>
      <View style={styles.qTag}>
        <Text style={styles.qTagText} numberOfLines={1} {...textScale.badge}>
          {question.tag}
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
              <Touchable
                key={p.id}
                feedback="card"
                haptic="none"
                disabled={revealed}
                onPress={() => key && onPick(key)}
                style={[styles.duelCard, revealed && isAnswer && styles.cardOk, revealed && isChosen && !isAnswer && styles.cardBad]}
                accessibilityRole="button"
                accessibilityLabel={p.name}
              >
                <Avatar name={p.name} image={p.image} size={64} ring={revealed && isAnswer ? "brand" : "none"} />
                <Text style={styles.duelName} numberOfLines={2} {...textScale.dense}>
                  {p.name}
                </Text>
                <Text style={styles.duelTeam} numberOfLines={1} {...textScale.dense}>
                  {p.team || " "}
                </Text>
                <View style={[styles.duelValue, revealed && isAnswer && styles.duelValueOk]}>
                  <Text style={[styles.duelValueText, revealed && isAnswer && styles.duelValueTextOk]} {...textScale.badge}>
                    {revealed ? v.values[i] : "?"}
                  </Text>
                </View>
              </Touchable>
            );
          })}
          <View style={styles.vs} pointerEvents="none">
            <Text style={styles.vsText} {...textScale.badge}>
              VS
            </Text>
          </View>
        </View>
      ) : v.type === "spotlight" ? (
        <View style={styles.spot}>
          <Avatar name={v.player.name} image={v.player.image} size={72} ring="brand" />
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
            {status === "revealed" ? (
              <Avatar name={v.player.name} image={v.player.image} size={76} ring="brand" />
            ) : (
              <Ionicons name="help" size={44} color={colors.onDark} />
            )}
          </View>
          <View style={styles.hints}>
            {v.hints.map((hint, i) => {
              const at = (question.seconds * 0.8 * i) / v.hints.length;
              const open = status === "revealed" || elapsed >= at;
              return (
                <View key={hint} style={[styles.hint, open && styles.hintOpen]}>
                  <Ionicons name={open ? "bulb" : "lock-closed"} size={13} color={open ? colors.star : colors.onDarkMuted} />
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
    </View>
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
  status,
  isAnswer,
  isChosen,
  removed,
  onPress,
}: {
  option: QuizOption;
  mark: string;
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
  return (
    <Touchable
      feedback="button"
      haptic="none"
      disabled={revealed || removed}
      onPress={onPress}
      style={[styles.option, good && styles.cardOk, bad && styles.cardBad, faded && styles.optionFaded]}
      accessibilityRole="button"
      accessibilityLabel={option.label}
      accessibilityState={{ disabled: revealed || removed }}
    >
      <View style={[styles.mark, good && styles.markOk, bad && styles.markBad]}>
        {good ? (
          <Ionicons name="checkmark" size={15} color={colors.onDark} />
        ) : bad ? (
          <Ionicons name="close" size={15} color={colors.onDark} />
        ) : (
          <Text style={styles.markText} {...textScale.badge}>
            {mark}
          </Text>
        )}
      </View>
      {option.avatar ? <Avatar name={option.avatar.name} image={option.avatar.image} size={34} /> : null}
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
    </Touchable>
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

const tile = withAlpha(colors.onDark, 0.07);
const tileBorder = withAlpha(colors.onDark, 0.14);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  stage: {
    flex: 1,
    marginHorizontal: layout.screenPadding,
    marginBottom: layout.screenPadding,
    marginTop: space.xs,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
    ...elevate(2),
    borderWidth: 0,
  },
  glow: {
    position: "absolute",
    top: -120,
    left: -60,
    right: -60,
    height: 260,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(colors.brand, 0.28),
  },

  /* — Kurulum — */
  setupScroll: { flexGrow: 1, justifyContent: "center", padding: space.md },
  card: {
    alignSelf: "center",
    maxWidth: 400,
    width: "100%",
    borderRadius: radius.xl,
    ...elevate(4),
    padding: space.xl,
    gap: space.xs,
    alignItems: "center",
  },
  setupIcon: {
    width: 50,
    height: 50,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    marginBottom: space.xxs,
  },
  overline: { ...type.micro, color: colors.brandAccent, textAlign: "center" },
  setupTitle: { ...type.display, color: colors.textPrimary },
  rules: { alignSelf: "stretch", gap: space.s, marginVertical: space.sm },
  rule: { flexDirection: "row", gap: space.s, alignItems: "flex-start" },
  ruleIcon: { marginTop: 2 },
  ruleText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  cityLabel: { ...type.micro, color: colors.textTertiary, alignSelf: "flex-start", marginTop: space.xs },
  cityPick: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    padding: space.m,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    backgroundColor: colors.brandDim,
  },
  cityIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface1,
  },
  cityName: { ...type.h4, color: colors.textPrimary },
  cityHint: { ...type.caption, letterSpacing: 0, color: colors.textSecondary },
  cityChange: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.brandAccent },
  notice: { alignSelf: "stretch", flexDirection: "row", gap: space.xs, alignItems: "center", paddingVertical: space.xs },
  noticeText: { ...type.caption, letterSpacing: 0, color: colors.textSecondary, flex: 1 },
  bestPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    marginVertical: space.s,
  },
  bestText: { ...type.bodySm, fontFamily: fonts.bold, color: colors.textPrimary },

  /* — HUD — */
  hud: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.s },
  hudLabel: { ...type.micro, color: colors.onDarkMuted },
  hudScore: { ...type.scoreMd, color: colors.onDark, alignSelf: "flex-start" },
  hudRight: { alignItems: "flex-end", gap: space.xs },
  hearts: { flexDirection: "row", gap: 2 },
  hudPills: { flexDirection: "row", gap: space.xs },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: radius.pill,
    paddingHorizontal: space.s,
    paddingVertical: 3,
    backgroundColor: tile,
    borderWidth: 1,
    borderColor: tileBorder,
  },
  pillHot: { backgroundColor: withAlpha(colors.star, 0.16), borderColor: withAlpha(colors.star, 0.45) },
  pillLevel: { backgroundColor: withAlpha(colors.brand, 0.55), borderColor: withAlpha(colors.brandOnDark, 0.5) },
  pillText: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.onDark },
  pillTextHot: { color: colors.star },

  timerTrack: { height: 6, marginHorizontal: space.md, borderRadius: 3, backgroundColor: tile, overflow: "hidden" },
  timerFill: { flex: 1, borderRadius: 3, backgroundColor: colors.brandOnDark, transformOrigin: "left" },
  timerDanger: { backgroundColor: colors.live, borderRadius: 3 },

  playScroll: { padding: space.md, gap: space.md, paddingBottom: space.xxl },

  /* — Soru — */
  qCard: {
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    backgroundColor: tile,
    borderWidth: 1,
    borderColor: tileBorder,
  },
  qTag: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: space.s,
    paddingVertical: 2,
    backgroundColor: withAlpha(colors.brand, 0.5),
    maxWidth: "100%",
  },
  qTagText: { ...type.micro, color: colors.onDark },
  qPrompt: { ...type.h2, color: colors.onDark },

  duel: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  duelCard: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
    paddingVertical: space.md,
    paddingHorizontal: space.s,
    borderRadius: radius.lg,
    backgroundColor: tile,
    borderWidth: 1.5,
    borderColor: tileBorder,
  },
  duelName: { ...type.h4, color: colors.onDark, textAlign: "center", marginTop: space.xs, minHeight: 40 },
  duelTeam: { ...type.caption, letterSpacing: 0, color: colors.onDarkMuted, textAlign: "center" },
  duelValue: { marginTop: space.xs, borderRadius: radius.pill, paddingHorizontal: space.m, paddingVertical: 3, backgroundColor: tile },
  duelValueOk: { backgroundColor: withAlpha(colors.win, 0.25) },
  duelValueText: { ...type.tableNumStrong, color: colors.onDarkMuted },
  duelValueTextOk: { color: colors.onDark },
  vs: {
    position: "absolute",
    alignSelf: "center",
    left: "50%",
    top: 48,
    marginLeft: -18,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: colors.inkBlock,
  },
  vsText: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.onDark },

  spot: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xs },
  spotName: { ...type.h3, color: colors.onDark },
  spotCaption: { ...type.caption, letterSpacing: 0, color: colors.onDarkMuted, marginTop: 2 },

  mystery: { flexDirection: "row", gap: space.md, alignItems: "center", marginTop: space.xs },
  mysteryAvatar: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(colors.brand, 0.35),
    borderWidth: 2,
    borderColor: withAlpha(colors.brandOnDark, 0.6),
  },
  hints: { flex: 1, gap: space.xs },
  hint: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: 4, paddingHorizontal: space.s, borderRadius: radius.md, backgroundColor: tile },
  hintOpen: { backgroundColor: withAlpha(colors.star, 0.12) },
  hintText: { ...type.caption, letterSpacing: 0, color: colors.onDark, flex: 1 },
  hintLocked: { color: colors.onDarkMuted },

  match: { gap: space.sm, marginTop: space.xs },
  matchMeta: { ...type.micro, color: colors.onDarkMuted, textAlign: "center" },
  matchRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  matchTeam: { flex: 1, alignItems: "center", gap: space.xs },
  matchName: { ...type.h4, color: colors.onDark, textAlign: "center" },
  matchScoreBox: { alignItems: "center", minWidth: 88 },
  matchScore: { ...type.scoreMd, color: colors.onDark },
  matchScoreHidden: { ...type.scoreMd, color: colors.onDarkMuted },
  matchFt: { ...type.micro, color: colors.onDarkMuted, marginTop: 2 },

  /* — Şıklar — */
  options: { gap: space.s },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 56,
    paddingVertical: space.s,
    paddingHorizontal: space.m,
    borderRadius: radius.lg,
    backgroundColor: tile,
    borderWidth: 1.5,
    borderColor: tileBorder,
  },
  optionFaded: { opacity: 0.35 },
  cardOk: { backgroundColor: withAlpha(colors.win, 0.22), borderColor: colors.win },
  cardBad: { backgroundColor: withAlpha(colors.danger, 0.22), borderColor: colors.danger },
  mark: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(colors.onDark, 0.12),
  },
  markOk: { backgroundColor: colors.win },
  markBad: { backgroundColor: colors.danger },
  markText: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.onDark },
  optionLabel: { ...type.body, fontFamily: fonts.semibold, color: colors.onDark },
  optionStruck: { textDecorationLine: "line-through" },
  optionSub: { ...type.caption, letterSpacing: 0, color: colors.onDarkMuted },

  tools: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  joker: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    backgroundColor: withAlpha(colors.star, 0.14),
    borderWidth: 1,
    borderColor: withAlpha(colors.star, 0.4),
  },
  jokerUsed: { backgroundColor: tile, borderColor: tileBorder },
  jokerText: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.star },
  jokerTextUsed: { color: colors.onDarkMuted },
  secondsLeft: { ...type.tableNumStrong, color: colors.onDarkMuted },

  revealLine: { flexDirection: "row", alignItems: "center", gap: space.xs, padding: space.m, borderRadius: radius.lg, borderWidth: 1 },
  revealOk: { backgroundColor: withAlpha(colors.win, 0.14), borderColor: withAlpha(colors.win, 0.5) },
  revealBad: { backgroundColor: withAlpha(colors.danger, 0.14), borderColor: withAlpha(colors.danger, 0.5) },
  revealText: { ...type.bodySm, fontFamily: fonts.semibold, color: colors.onDark, flex: 1 },

  gain: { position: "absolute", top: 70, left: 0, right: 0, alignItems: "center" },
  gainText: { ...type.scoreMd, color: colors.star },
  gainSub: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.onDark },

  miss: {
    alignSelf: "stretch",
    marginTop: space.sm,
    padding: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    gap: 2,
  },
  missLabel: { ...type.micro, color: colors.textTertiary },
  missPrompt: { ...type.bodySm, color: colors.textSecondary },
  missAnswer: { ...type.bodySm, fontFamily: fonts.bold, color: colors.textPrimary },
});
