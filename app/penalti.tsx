/**
 * PENALTI — nişan / güç / kaleci üçlemesi.
 *
 * OYNANIŞ (üç dokunuş, tek atış):
 *   1) NİŞAN  — kale çizgisinde sağa sola giden nişangâhı dokunarak kilitle.
 *   2) GÜÇ    — dolup boşalan güç çubuğunu dokunarak kilitle. Çok düşük güç
 *                kaleciye kolay lokma olur, çok yüksek güç direği aşar.
 *   3) VURUŞ  — top hedefe gider, kaleci uçar; sonuç: GOL, KURTARIŞ ya da AUT.
 *
 * NEDEN İKİ AŞAMALI: tek dokunuşlu penaltı oyunu şansa dönüşür. Nişan yatay,
 * güç dikey ekseni verdiği için oyuncu "köşeye sert" ya da "ortaya yumuşak"
 * gibi gerçek bir karar veriyor; kalecinin okuma davranışı da bu karara tepki
 * verebiliyor.
 *
 * KALECİ: ilk atışlarda saf rastgele. Skor yükseldikçe atışın gittiği yönü
 * "okuma" olasılığı artar (en çok %55) — böylece zorluk, hile hissi vermeden
 * yükselir. Kalecinin uzanma yarıçapı da güçle ters orantılıdır: sert vuruşa
 * yetişmesi zordur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Button,
  ScreenHeader,
  Touchable,
  withAlpha,
} from "@/components/ui";
import { submitArenaScore } from "@/lib/api/arena";
import { useAuth } from "@/providers/AuthProvider";
import {
  colors,
  haptics,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

/* ============================== SABİTLER ============================== */

const BEST_KEY = "elitlig.penalti.best.v1";
const TICK_MS = 16;

/** Üç ıska hakkı — kurtarış ve aut aynı kefede. */
const MAX_MISSES = 3;

/** Nişangâhın kale içinde gidip gelme hızı (oran/saniye). */
const AIM_SPEED_BASE = 0.85;
/** Güç çubuğunun dolup boşalma hızı (oran/saniye). */
const POWER_SPEED_BASE = 1.15;

/** Bu gücün üstü direği aşar. */
const OUT_POWER = 0.93;
/** Bu gücün altı kaleciye kolay gelir (uzanma yarıçapı büyür). */
const WEAK_POWER = 0.35;

type Phase = "ready" | "aim" | "power" | "shot" | "over";
type Outcome = "gol" | "kurtaris" | "aut" | null;
type SubmitState = "idle" | "guest" | "sending" | "sent" | "failed";

/* =============================== EKRAN =============================== */

export default function PenaltiScreen() {
  const router = useRouter();
  const auth = useAuth();

  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [best, setBest] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [submit, setSubmit] = useState<SubmitState>("idle");

  /** Nişan ve güç 0..1 aralığında tutulur; ölçüden bağımsızdır. */
  const [aim, setAim] = useState(0.5);
  const [power, setPower] = useState(0);
  /** Kilitlenen değerler — atış animasyonu bunları kullanır. */
  const [lockedAim, setLockedAim] = useState(0.5);
  const [lockedPower, setLockedPower] = useState(0);
  /** Kalecinin uçtuğu yön (0..1) ve atışın görsel ilerlemesi. */
  const [keeper, setKeeper] = useState(0.5);
  const [travel, setTravel] = useState(0);

  const phaseRef = useRef<Phase>("ready");
  const aimRef = useRef(0.5);
  const powerRef = useRef(0);
  const aimDir = useRef(1);
  const powerDir = useRef(1);
  const scoreRef = useRef(0);
  const missRef = useRef(0);
  const loop = useRef<ReturnType<typeof setInterval> | null>(null);
  const shotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY).then((value) => setBest(Number(value) || 0));
    return () => {
      if (loop.current) clearInterval(loop.current);
      if (shotTimer.current) clearTimeout(shotTimer.current);
    };
  }, []);

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /* ─────────────────────────── skor gönderimi ─────────────────────────── */

  const submitScore = useCallback(
    (value: number) => {
      if (value <= 0) {
        setSubmit("idle");
        return;
      }
      if (!auth.user) {
        setSubmit("guest");
        return;
      }
      setSubmit("sending");
      submitArenaScore("penalti", value)
        .then(() => setSubmit("sent"))
        .catch(() => setSubmit("failed"));
    },
    [auth.user]
  );

  const finish = useCallback(() => {
    if (loop.current) clearInterval(loop.current);
    loop.current = null;
    const finished = scoreRef.current;
    submitScore(finished);
    if (finished > 0) {
      setBest((current) => {
        if (finished > current) {
          void AsyncStorage.setItem(BEST_KEY, String(finished));
          return finished;
        }
        return current;
      });
    }
    haptics.warning();
    setPhaseBoth("over");
  }, [setPhaseBoth, submitScore]);

  /* ─────────────────────────── döngü ─────────────────────────── */

  /**
   * Tek zamanlayıcı iki aşamayı da sürer: nişan aşamasında nişangâh,
   * güç aşamasında çubuk hareket eder. Zorluk skorla artar.
   */
  const step = useCallback(() => {
    const dt = TICK_MS / 1000;
    const difficulty = 1 + Math.min(1.1, scoreRef.current * 0.045);

    if (phaseRef.current === "aim") {
      aimRef.current += aimDir.current * AIM_SPEED_BASE * difficulty * dt;
      if (aimRef.current >= 1) {
        aimRef.current = 1;
        aimDir.current = -1;
      } else if (aimRef.current <= 0) {
        aimRef.current = 0;
        aimDir.current = 1;
      }
      setAim(aimRef.current);
      return;
    }

    if (phaseRef.current === "power") {
      powerRef.current += powerDir.current * POWER_SPEED_BASE * difficulty * dt;
      if (powerRef.current >= 1) {
        powerRef.current = 1;
        powerDir.current = -1;
      } else if (powerRef.current <= 0) {
        powerRef.current = 0;
        powerDir.current = 1;
      }
      setPower(powerRef.current);
    }
  }, []);

  const startLoop = useCallback(() => {
    if (loop.current) clearInterval(loop.current);
    loop.current = setInterval(step, TICK_MS);
  }, [step]);

  /* ─────────────────────────── atış çözümü ─────────────────────────── */

  const resolveShot = useCallback(
    (shotAim: number, shotPower: number) => {
      /* Kaleci kararı: skor yükseldikçe atışı okuma olasılığı artar.
         Okuduğunda tam üstüne değil, yakınına uçar — kesin kurtarış olmasın. */
      const readChance = Math.min(0.55, 0.12 + scoreRef.current * 0.035);
      const reads = Math.random() < readChance;
      const keeperTarget = reads
        ? Math.max(0, Math.min(1, shotAim + (Math.random() * 0.24 - 0.12)))
        : Math.random();

      setKeeper(keeperTarget);

      /* Uzanma yarıçapı: sert vuruşta daralır, cılız vuruşta genişler.
         Böylece "köşeye sert" gerçekten daha iyi bir karar oluyor. */
      const reach = shotPower >= WEAK_POWER ? 0.16 - (shotPower - WEAK_POWER) * 0.09 : 0.24;

      let result: Outcome;
      if (shotPower > OUT_POWER) {
        result = "aut";
      } else if (Math.abs(keeperTarget - shotAim) <= reach) {
        result = "kurtaris";
      } else {
        result = "gol";
      }

      // Topun kaleye gidişi: 420ms sonra sonuç açıklanır.
      setTravel(0);
      const started = Date.now();
      const travelTimer = setInterval(() => {
        const ratio = Math.min(1, (Date.now() - started) / 420);
        setTravel(ratio);
        if (ratio >= 1) clearInterval(travelTimer);
      }, TICK_MS);

      shotTimer.current = setTimeout(() => {
        clearInterval(travelTimer);
        setTravel(1);
        setOutcome(result);

        if (result === "gol") {
          scoreRef.current += 1;
          setScore(scoreRef.current);
          haptics.success();
        } else {
          missRef.current += 1;
          setMisses(missRef.current);
          haptics.warning();
        }

        // Sonucu okuması için kısa bekleme, sonra yeni atış ya da bitiş.
        shotTimer.current = setTimeout(() => {
          setOutcome(null);
          setTravel(0);
          if (missRef.current >= MAX_MISSES) {
            finish();
            return;
          }
          aimRef.current = 0.5;
          powerRef.current = 0;
          aimDir.current = 1;
          powerDir.current = 1;
          setAim(0.5);
          setPower(0);
          setPhaseBoth("aim");
          startLoop();
        }, 900);
      }, 420);
    },
    [finish, setPhaseBoth, startLoop]
  );

  /* ─────────────────────────── dokunuş ─────────────────────────── */

  const tap = useCallback(() => {
    const current = phaseRef.current;

    if (current === "ready") {
      scoreRef.current = 0;
      missRef.current = 0;
      aimRef.current = 0.5;
      powerRef.current = 0;
      aimDir.current = 1;
      powerDir.current = 1;
      setScore(0);
      setMisses(0);
      setAim(0.5);
      setPower(0);
      setOutcome(null);
      setTravel(0);
      setSubmit("idle");
      setPhaseBoth("aim");
      startLoop();
      return;
    }

    if (current === "aim") {
      setLockedAim(aimRef.current);
      haptics.select();
      setPhaseBoth("power");
      return;
    }

    if (current === "power") {
      const shotPower = powerRef.current;
      setLockedPower(shotPower);
      haptics.medium();
      if (loop.current) clearInterval(loop.current);
      loop.current = null;
      setPhaseBoth("shot");
      resolveShot(aimRef.current, shotPower);
    }
  }, [resolveShot, setPhaseBoth, startLoop]);

  const restart = useCallback(() => {
    if (shotTimer.current) clearTimeout(shotTimer.current);
    setOutcome(null);
    setTravel(0);
    setSubmit("idle");
    setPhaseBoth("ready");
  }, [setPhaseBoth]);

  const openBoard = useCallback(
    () => router.push({ pathname: "/siralama", params: { game: "penalti" } }),
    [router]
  );

  /* ─────────────────────────── görsel konumlar ─────────────────────────── */

  /** Kale içindeki yatay konum (yüzde). Sunum için 6..94 arasına sıkıştırılır. */
  const pct = (ratio: number) => `${6 + ratio * 88}%` as const;

  const shooting = phase === "shot";
  const ballLeft: `${number}%` = shooting ? pct(lockedAim) : "50%";
  /**
   * Topun bitiş yüksekliği vuruş gücünden gelir: sert vuruş kalenin üst
   * köşesine, cılız vuruş alt köşeye gider. OUT_POWER üstündeki vuruş direği
   * aşar ve top kale çerçevesinin ÜSTÜNE çıkar — "aut" sonucu böylece
   * yazıdan önce görülür.
   */
  const shotHeight = lockedPower > OUT_POWER ? 78 : 30 + lockedPower * 34;
  const ballBottom: `${number}%` = shooting
    ? (`${8 + travel * shotHeight}%` as `${number}%`)
    : "8%";
  const isRecord = score > 0 && score >= best;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Penaltı"
        back
        actions={[
          {
            icon: "trophy-outline",
            onPress: openBoard,
            accessibilityLabel: "Rekor tablosu",
          },
        ]}
      />

      {/* HUD: skor solda, rekor ve kalan hak sağda. */}
      <View style={styles.hud}>
        <View style={styles.hudLeft}>
          <Text style={styles.hudLabel} {...textScale.badge}>
            {upperTR("Gol")}
          </Text>
          <Text style={styles.hudScore} allowFontScaling={false}>
            {score}
          </Text>
        </View>
        <View style={styles.hudRight}>
          <View style={styles.hudPill}>
            <Ionicons name="trophy" size={11} color={colors.star} />
            <Text style={styles.hudPillText} {...textScale.badge}>
              {best}
            </Text>
          </View>
          <View style={styles.hudPill}>
            {Array.from({ length: MAX_MISSES }).map((_, index) => (
              <Ionicons
                key={index}
                name={index < MAX_MISSES - misses ? "ellipse" : "ellipse-outline"}
                size={9}
                color={index < MAX_MISSES - misses ? colors.win : colors.textTertiary}
              />
            ))}
          </View>
        </View>
      </View>

      {/* Saha — ham Pressable: her dokunuş bir aşamayı kilitler, gecikme istemiyoruz. */}
      <Pressable
        style={styles.pitch}
        onPress={tap}
        accessibilityRole="button"
        accessibilityLabel={
          phase === "aim" ? "Nişanı kilitle" : phase === "power" ? "Vuruş gücünü kilitle" : "Penaltı"
        }
      >
        <LinearGradient
          colors={[withAlpha(colors.brand, 0.16), colors.pitchGreen]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Kale */}
        <View style={styles.goal} pointerEvents="none">
          <View style={styles.goalNet} />
          {/* Kaleci */}
          <Text
            style={[
              styles.keeper,
              { left: shooting ? pct(keeper) : "50%" },
            ]}
            allowFontScaling={false}
          >
            🧤
          </Text>
          {/* Nişangâh — yalnız nişan ve güç aşamasında görünür. */}
          {phase === "aim" || phase === "power" ? (
            <View style={[styles.crosshair, { left: pct(phase === "aim" ? aim : lockedAim) }]}>
              <Ionicons name="add" size={20} color={colors.textOnStatus} />
            </View>
          ) : null}
        </View>

        {/* Ceza sahası yayı ve nokta */}
        <View style={styles.spot} pointerEvents="none" />

        {/* Top */}
        <Text
          style={[styles.ball, { left: ballLeft, bottom: ballBottom }]}
          allowFontScaling={false}
        >
          ⚽
        </Text>

        {/* Güç çubuğu */}
        {phase === "power" ? (
          <View style={styles.powerTrack} pointerEvents="none">
            <View
              style={[
                styles.powerFill,
                {
                  height: `${power * 100}%`,
                  backgroundColor:
                    power > OUT_POWER ? colors.danger : power < WEAK_POWER ? colors.warn : colors.win,
                },
              ]}
            />
            {/* Direği aşma eşiği: üstünde kalırsan aut. */}
            <View style={[styles.powerLimit, { bottom: `${OUT_POWER * 100}%` }]} />
          </View>
        ) : null}

        {/* Aşama ipucu */}
        {phase === "aim" || phase === "power" ? (
          <View style={styles.hintBar} pointerEvents="none">
            <Text style={styles.hintText} {...textScale.dense}>
              {phase === "aim" ? "Nişanı kilitlemek için dokun" : "Gücü kilitlemek için dokun"}
            </Text>
          </View>
        ) : null}

        {/* Sonuç */}
        {outcome ? (
          <View
            style={[
              styles.outcome,
              outcome === "gol" ? styles.outcomeGoal : styles.outcomeMiss,
            ]}
            pointerEvents="none"
          >
            <Text style={styles.outcomeText} allowFontScaling={false}>
              {outcome === "gol" ? "GOL!" : outcome === "kurtaris" ? "KURTARIŞ" : "AUT"}
            </Text>
          </View>
        ) : null}

        {/* Başlangıç kartı */}
        {phase === "ready" ? (
          <View style={styles.overlay} pointerEvents="box-none">
            <View style={styles.card}>
              <View style={styles.cardIcon}>
                <Ionicons name="golf" size={22} color={colors.brandAccent} />
              </View>
              <Text style={styles.cardOverline} {...textScale.badge}>
                {upperTR("Elitlig Arena")}
              </Text>
              <Text style={styles.cardTitle} {...textScale.dense}>
                Penaltı
              </Text>
              <Text style={styles.cardRule} {...textScale.long}>
                Önce nişangâhı, sonra vuruş gücünü dokunarak kilitle. Çok sert vurursan direği
                aşarsın, cılız vurursan kaleci yetişir. Üç ıska hakkın var.
              </Text>
              <View style={styles.cardBest}>
                <Ionicons name="trophy" size={13} color={colors.star} />
                <Text style={styles.cardBestText} {...textScale.dense}>
                  {best > 0 ? `Rekorun ${best} gol` : "Henüz rekorun yok"}
                </Text>
              </View>
              <Button label="Başla" icon="play" size="lg" fullWidth onPress={tap} />
            </View>
          </View>
        ) : null}

        {/* Bitiş kartı */}
        {phase === "over" ? (
          <View style={styles.overlay} pointerEvents="box-none">
            <View style={styles.card}>
              {isRecord ? (
                <View style={styles.recordBadge}>
                  <Ionicons name="trophy" size={13} color={colors.textOnStatus} />
                  <Text style={styles.recordText} {...textScale.badge}>
                    {upperTR("Yeni rekor")}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.finalScore} allowFontScaling={false}>
                {score}
              </Text>
              <Text style={styles.finalUnit} {...textScale.dense}>
                gol
              </Text>

              <Text style={styles.submitLine} {...textScale.dense}>
                {submit === "sending"
                  ? "Rekor tablosuna gönderiliyor…"
                  : submit === "sent"
                    ? "Rekor tablosuna yazıldı"
                    : submit === "failed"
                      ? "Gönderilemedi"
                      : submit === "guest"
                        ? "Giriş yap, skorun tabloya yazılsın"
                        : ""}
              </Text>

              <Button label="Tekrar oyna" icon="refresh" size="lg" fullWidth onPress={restart} />
              <Touchable feedback="button" onPress={openBoard} style={styles.boardLink}>
                <Ionicons name="trophy-outline" size={14} color={colors.brandAccent} />
                <Text style={styles.boardLinkText} {...textScale.dense}>
                  Rekor tablosu
                </Text>
              </Touchable>
            </View>
          </View>
        ) : null}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  hud: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  hudLeft: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  hudLabel: { ...type.micro, color: colors.textTertiary },
  hudScore: { ...type.scoreLg, color: colors.textPrimary },
  hudRight: { flexDirection: "row", alignItems: "center", gap: space.sm },
  hudPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hudPillText: { ...type.caption, color: colors.textSecondary },

  pitch: { flex: 1, overflow: "hidden" },

  goal: {
    position: "absolute",
    top: "8%",
    left: "6%",
    right: "6%",
    height: "34%",
    borderWidth: 4,
    borderBottomWidth: 0,
    borderColor: colors.textPrimary,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    backgroundColor: withAlpha(colors.textPrimary, 0.06),
  },
  goalNet: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },

  keeper: {
    position: "absolute",
    bottom: 4,
    fontSize: 34,
    marginLeft: -17,
  },
  crosshair: {
    position: "absolute",
    top: "34%",
    width: 30,
    height: 30,
    marginLeft: -15,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.textOnStatus,
    backgroundColor: withAlpha(colors.brand, 0.55),
    alignItems: "center",
    justifyContent: "center",
  },

  spot: {
    position: "absolute",
    bottom: "16%",
    alignSelf: "center",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: withAlpha(colors.textPrimary, 0.55),
  },

  ball: { position: "absolute", fontSize: 30, marginLeft: -15 },

  powerTrack: {
    position: "absolute",
    right: space.md,
    bottom: "18%",
    width: 14,
    height: "42%",
    borderRadius: radius.pill,
    backgroundColor: withAlpha(colors.textPrimary, 0.18),
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  powerFill: { width: "100%", borderRadius: radius.pill },
  powerLimit: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.danger,
  },

  hintBar: {
    position: "absolute",
    bottom: space.lg,
    alignSelf: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(colors.bg, 0.72),
  },
  hintText: { ...type.caption, color: colors.textPrimary },

  outcome: {
    position: "absolute",
    top: "46%",
    alignSelf: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  outcomeGoal: { backgroundColor: colors.win },
  outcomeMiss: { backgroundColor: colors.danger },
  outcomeText: { ...type.h1, color: colors.textOnStatus, letterSpacing: 1 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(colors.bg, 0.75),
    padding: space.lg,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  cardOverline: { ...type.micro, color: colors.textTertiary },
  cardTitle: { ...type.display, color: colors.textPrimary },
  cardRule: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },
  cardBest: { flexDirection: "row", alignItems: "center", gap: space.xs },
  cardBestText: { ...type.caption, color: colors.textSecondary },

  recordBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.warn,
  },
  recordText: { ...type.micro, color: colors.textOnStatus },
  finalScore: { ...type.scoreHero, color: colors.textPrimary },
  finalUnit: { ...type.caption, color: colors.textTertiary, marginTop: -space.sm },
  submitLine: { ...type.caption, color: colors.textSecondary, minHeight: 16 },
  boardLink: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs },
  boardLinkText: { ...type.label, color: colors.brandAccent },
});
