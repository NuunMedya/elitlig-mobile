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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import {
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  ProgressRing,
  ScreenHeader,
  Skeleton,
  Touchable,
  useToast,
} from "@/components/ui";
import { submitArenaScore } from "@/lib/api/arena";
import { getPlayerRankings } from "@/lib/api/players";
import { get } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { instagramUrl } from "@/lib/socials";
import type { PlayerRankRow } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  hairline,
  haptics,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

/* ═════════════════════════ OYUN SABİTLERİ (değişmedi) ═════════════════════ */

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

/** Kalan süreye göre halka tonu — son 4 saniye kırmızı. */
function timeTone(secondsLeft: number): "brand" | "warn" | "danger" {
  if (secondsLeft <= 4) return "danger";
  if (secondsLeft <= 7) return "warn";
  return "brand";
}

/* ═════════════════════════ KÜÇÜK PARÇALAR ═════════════════════════ */

/**
 * Sonuç sayısı — üçlü şeritte tek hücre.
 * NEDEN İLKEL PROP: hücre memo'lu; nesne geçilseydi her render yeni referans
 * alır ve memo hiçbir şey kazandırmazdı.
 */
const StatCell = React.memo(function StatCell({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  /** Öne çıkan sayı (puan, sıralama) mor okunur. */
  accent?: boolean;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={accent ? styles.statValueAccent : styles.statValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

/** Kural rozeti — giriş kartındaki üç küçük bilgi. */
const Fact = React.memo(function Fact({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={12} color={colors.brandAccent} />
      <Text style={styles.factText} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

/* ═════════════════════════ EKRAN ═════════════════════════ */

export default function DailyQuizScreen() {
  const scope = useScope();
  const auth = useAuth();

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
  const [todayResult, setTodayResult] = useState<{ score: number; correct: number } | null>(null);
  const [best, setBest] = useState(0);
  /* — Yalnız sunum: ilerleme şeridi ve tur süresi — */
  const [marks, setMarks] = useState<Mark[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useRef(0);
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
    setMarks((prev) => [...prev, isCorrect ? "correct" : "wrong"]);
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
    setElapsedMs(startedAt.current > 0 ? Date.now() - startedAt.current : 0);
    setPhase("done");
    if (official) {
      if (auth.user && finalScore > 0) {
        // Skor yazıldıktan SONRA sıralama tazelenir; sonuç ekranı taze sıra gösterir.
        void submitArenaScore("gunun", finalScore)
          .then(() => {
            void standingQuery.refetch();
          })
          .catch(() => {
            // Gönderim başarısızsa oyun akışı bozulmaz; sıra eski hâlinde kalır.
          });
      }
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

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Günün Testi"
        overline={upperTR(dayLabel)}
        subtitle="Herkese aynı 10 soru"
        back
      />

      {query.isLoading ? (
        <View style={styles.loading}>
          <Skeleton width="100%" height={72} radius="lg" />
          <Skeleton width="100%" height={104} radius="lg" />
          <Skeleton width="100%" height={52} radius="md" />
          <Skeleton width="100%" height={52} radius="md" />
          <Skeleton width="100%" height={52} radius="md" />
        </View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : questions.length < ROUND ? (
        <EmptyState
          icon="calendar-outline"
          title="Test hazırlanamadı"
          body="Soru havuzu şu an yüklenemedi, birazdan tekrar dene."
          action={{ label: "Tekrar dene", onPress: () => query.refetch(), haptic: "light" }}
        />
      ) : phase === "intro" ? (
        /* ——— 1) GİRİŞ ——— */
        <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="bulb" size={22} color={colors.brandAccent} />
            </View>
            <Text style={styles.heroTitle} {...textScale.dense}>
              Bugünün 10 sorusu hazır
            </Text>
            <Text style={styles.heroBody} {...textScale.long}>
              Testi bugün çözen herkes aynı sorularla yarışır. Soru başına {SECONDS} saniye; her
              doğru 10 puan, kalan süreden hız bonusu eklenir.
            </Text>
            <View style={styles.heroFacts}>
              <Fact icon="help-circle" label={`${ROUND} soru`} />
              <Fact icon="time" label={`${SECONDS} sn/soru`} />
              <Fact icon="flash" label="Hız bonusu" />
            </View>
          </View>

          {todayResult ? (
            <>
              <View style={styles.resultCard}>
                <View style={styles.todayHead}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.win} />
                  <Text style={styles.todayLabel} {...textScale.badge}>
                    {upperTR("Bugünkü sonucun")}
                  </Text>
                </View>
                <View style={styles.statRow}>
                  <StatCell value={`${todayResult.correct}/${ROUND}`} label="doğru" />
                  <View style={styles.statDivider} />
                  <StatCell value={formatCount(todayResult.score)} label="puan" accent />
                  <View style={styles.statDivider} />
                  <StatCell value={myRank != null ? `#${myRank}` : "—"} label="sıralama" />
                </View>
              </View>

              <ResultActions
                score={todayResult.score}
                correct={todayResult.correct}
                dayLabel={dayLabel}
                scopeCity={scope.cityLabel}
                onRetry={() => start(false)}
                retryLabel="Antrenman Turu"
              />

              <Text style={styles.hint} {...textScale.long}>
                Antrenman skoru güne yazılmaz — resmî hak günde bir.
              </Text>
            </>
          ) : (
            <Button
              label="Bugünün testine başla"
              icon="play"
              size="lg"
              fullWidth
              haptic="medium"
              onPress={() => start(true)}
            />
          )}

          {best > 0 ? (
            <View style={styles.bestRow}>
              <Ionicons name="trophy" size={12} color={colors.star} />
              <Text style={styles.bestText} {...textScale.badge}>
                En iyi günün: {formatCount(best)} puan
              </Text>
            </View>
          ) : null}

          {!auth.user ? (
            <Text style={styles.hint} {...textScale.long}>
              Skorun rekor tablosuna yazılsın diye giriş yapabilirsin.
            </Text>
          ) : null}
        </ScrollView>
      ) : phase === "done" ? (
        /* ——— 3) SONUÇ ——— */
        <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
          <View style={styles.resultCard}>
            <ProgressRing
              value={correctCount / ROUND}
              size={96}
              thickness={7}
              tone={correctCount >= 8 ? "win" : correctCount >= 5 ? "brand" : "warn"}
              label={`${correctCount}/${ROUND}`}
              sublabel="doğru"
            />

            <Text style={styles.resultScore} {...textScale.dense}>
              {formatCount(score)}
            </Text>
            <View style={styles.resultUnitRow}>
              <Text style={styles.resultUnit} {...textScale.badge}>
                {upperTR("puan")}
              </Text>
              {!official ? <Badge label="Antrenman" tone="warn" size="xs" /> : null}
            </View>

            {/* Doğru sayısı halkanın ortasında yazıyor; şerit onu tekrarlamaz. */}
            <View style={styles.statRow}>
              <StatCell value={formatDuration(elapsedMs)} label="süre" />
              <View style={styles.statDivider} />
              <StatCell value={formatCount(score)} label="puan" />
              <View style={styles.statDivider} />
              <StatCell value={myRank != null ? `#${myRank}` : "—"} label="sıralama" accent />
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
          </View>

          <ResultActions
            score={score}
            correct={correctCount}
            dayLabel={dayLabel}
            scopeCity={scope.cityLabel}
            onRetry={() => start(false)}
            retryLabel="Antrenman Turu"
          />

          {!official ? (
            <Text style={styles.hint} {...textScale.long}>
              Antrenman skoru güne yazılmaz.
            </Text>
          ) : null}
        </ScrollView>
      ) : (
        /* ——— 2) OYUN ——— */
        <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
          <View style={styles.hud}>
            <ProgressRing
              value={secondsLeft / SECONDS}
              size={58}
              thickness={5}
              tone={timeTone(secondsLeft)}
              label={String(secondsLeft)}
              sublabel="sn"
              /* Saniyede bir tıkladığı için yay animasyonu kapalı: değer
                 doğrudan yerine oturur, hem daha doğru hem daha ucuz. */
              animate={false}
            />

            <View style={styles.hudBody}>
              <View style={styles.hudTop}>
                <Text style={styles.hudLabel} {...textScale.badge}>
                  {upperTR(`Soru ${qIndex + 1}/${ROUND}`)}
                </Text>
                {!official ? <Badge label="Antrenman" tone="warn" size="xs" /> : null}
                <View style={styles.flex} />
                <Text style={styles.hudScore} {...textScale.dense}>
                  {formatCount(score)} puan
                </Text>
              </View>

              <View style={styles.strip}>
                {questions.map((item, index) => (
                  <View key={`${item.prompt}-${index}`} style={[styles.stripCell, stripStyle(index)]} />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.questionCard}>
            <Text style={styles.prompt} {...textScale.long}>
              {question.prompt}
            </Text>
          </View>

          <View style={styles.options}>
            {question.options.map((option, index) => {
              const revealed = phase === "reveal";
              const isChosen = chosen === index;
              const right = revealed && option.correct;
              const wrong = revealed && isChosen && !option.correct;
              return (
                <Touchable
                  key={`${option.label}-${index}`}
                  feedback="button"
                  /* Titreşim şıkta değil `answer()` içinde: doğru/yanlış ayrı
                     ton çalar ve süre dolduğunda da tetiklenir. */
                  haptic="none"
                  onPress={() => phase === "playing" && answer(index)}
                  disabled={phase !== "playing"}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ disabled: phase !== "playing" }}
                  style={[
                    styles.option,
                    right ? styles.optionRight : null,
                    wrong ? styles.optionWrong : null,
                    revealed && !right && !wrong ? styles.optionMuted : null,
                  ]}
                >
                  <Text
                    style={[styles.optionText, right || wrong ? styles.optionTextOn : null]}
                    numberOfLines={2}
                    {...textScale.dense}
                  >
                    {option.label}
                  </Text>
                  {right ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.textOnStatus} />
                  ) : wrong ? (
                    <Ionicons name="close-circle" size={18} color={colors.textOnStatus} />
                  ) : null}
                </Touchable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
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
        <Button
          label={retryLabel}
          icon="refresh"
          variant="secondary"
          onPress={onRetry}
          style={styles.actionButton}
        />
        <Button
          label="Meydan Oku"
          icon="share-social"
          onPress={openShare}
          style={styles.actionButton}
        />
      </View>

      <BottomSheet visible={shareOpen} onClose={closeShare} title="Sonucunu paylaş" snap="full">
        <View style={styles.shareWrap}>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <View style={styles.shareCard}>
              <View style={styles.shareStrip} />

              <View style={styles.shareBody}>
                <View style={styles.shareTop}>
                  <Text style={styles.shareBrand} {...textScale.badge}>
                    elitlig
                  </Text>
                  <Text style={styles.shareKicker} {...textScale.badge}>
                    {upperTR("Günün Testi")}
                  </Text>
                </View>

                <Text style={styles.shareDay} {...textScale.badge}>
                  {upperTR(dayLabel)}
                </Text>

                <Text style={styles.shareScore} {...textScale.badge}>
                  {correct}/{ROUND}
                </Text>
                <Text style={styles.shareUnit} {...textScale.badge}>
                  {upperTR(`${formatCount(score)} puan`)}
                </Text>

                <View style={styles.shareDivider} />

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

        <Button
          label={busy ? "Hazırlanıyor" : "Paylaş"}
          icon="share-social"
          onPress={share}
          loading={busy}
          fullWidth
        />
        <Text style={styles.shareHint} {...textScale.dense}>
          İndirmek için: Paylaş → Görüntüyü Kaydet
        </Text>
      </BottomSheet>
    </>
  );
}

/* ═════════════════════════ STİLLER ═════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  loading: {
    padding: layout.screenPadding,
    gap: space.md,
  },
  pageContent: {
    padding: layout.screenPadding,
    paddingBottom: space.giant,
    gap: space.md,
  },

  /* — Giriş kartı — */
  hero: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    padding: space.lg,
    gap: space.sm,
    alignItems: "center",
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  heroTitle: {
    ...type.h1,
    color: colors.textPrimary,
    textAlign: "center",
  },
  heroBody: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  heroFacts: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space.sm,
    marginTop: space.xxs,
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
  },
  factText: {
    ...type.caption,
    color: colors.textSecondary,
  },

  /* — Sonuç / bugünkü sonuç kartı — */
  resultCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
    alignItems: "center",
  },
  todayHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  todayLabel: {
    ...type.micro,
    color: colors.win,
  },
  resultScore: {
    ...type.scoreHero,
    color: colors.brandAccent,
  },
  resultUnitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: -space.sm,
  },
  resultUnit: {
    ...type.micro,
    color: colors.textTertiary,
  },
  resultMeta: {
    ...type.caption,
    fontWeight: "600",
    letterSpacing: 0,
    color: colors.textTertiary,
    textAlign: "center",
  },

  statRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  statDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.separator,
  },
  statValue: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  statValueAccent: {
    ...type.scoreSm,
    color: colors.brandAccent,
  },
  statLabel: {
    ...type.caption,
    fontWeight: "600",
    letterSpacing: 0,
    color: colors.textTertiary,
  },

  hint: {
    ...type.caption,
    fontWeight: "600",
    letterSpacing: 0,
    color: colors.textTertiary,
    textAlign: "center",
  },
  bestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  bestText: {
    ...type.caption,
    color: colors.textSecondary,
  },

  /* — Oyun başlığı (süre halkası + ilerleme) — */
  hud: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.md,
  },
  hudBody: { flex: 1, gap: space.sm },
  hudTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  hudLabel: {
    ...type.micro,
    color: colors.textSecondary,
  },
  hudScore: {
    ...type.tableNumStrong,
    color: colors.brandAccent,
  },
  strip: {
    flexDirection: "row",
    gap: space.xxs,
  },
  stripCell: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
  },
  stripCurrent: { backgroundColor: colors.brandAccent },
  stripCorrect: { backgroundColor: colors.win },
  stripWrong: { backgroundColor: colors.loss },

  /* — Soru kartı — */
  questionCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
    minHeight: 108,
    alignItems: "center",
    justifyContent: "center",
  },
  prompt: {
    ...type.display,
    color: colors.textPrimary,
    textAlign: "center",
  },

  /* — Şıklar — */
  options: { gap: space.m },
  option: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    backgroundColor: colors.surface1,
  },
  optionRight: {
    backgroundColor: colors.win,
    borderColor: colors.win,
  },
  optionWrong: {
    backgroundColor: colors.loss,
    borderColor: colors.loss,
  },
  /* Cevap açıldığında seçilmeyen şıklar geri çekilir. */
  optionMuted: {
    opacity: 0.5,
    borderColor: colors.border,
  },
  optionText: {
    ...type.h3,
    color: colors.textPrimary,
    textAlign: "center",
    flexShrink: 1,
  },
  optionTextOn: { color: colors.textOnStatus },

  /* — Eylemler — */
  actionRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  actionButton: { flex: 1 },

  /* — Paylaşım kartı — */
  shareWrap: {
    alignItems: "center",
    paddingVertical: space.md,
  },
  shareCard: {
    width: 264,
    height: 396,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  shareStrip: {
    height: 6,
    backgroundColor: colors.brand,
  },
  shareBody: {
    flex: 1,
    padding: space.md,
    alignItems: "center",
    gap: space.xs,
  },
  shareTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
  },
  shareBrand: {
    ...type.label,
    color: colors.brand,
  },
  shareKicker: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareDay: {
    ...type.micro,
    color: colors.textSecondary,
    marginTop: space.sm,
  },
  shareScore: {
    ...type.scoreHero,
    fontSize: 52,
    lineHeight: 58,
    color: colors.brandAccent,
    marginTop: space.sm,
  },
  shareUnit: {
    ...type.label,
    color: colors.textPrimary,
  },
  shareDivider: {
    alignSelf: "stretch",
    height: hairline,
    backgroundColor: colors.separator,
    marginVertical: space.md,
  },
  shareChallenge: {
    ...type.caption,
    fontWeight: "700",
    letterSpacing: 0,
    color: colors.textSecondary,
    textAlign: "center",
  },
  shareFooter: {
    ...type.micro,
    color: colors.textTertiary,
    textAlign: "center",
  },
  shareHint: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.sm,
  },
});
