/**
 * PENALTI — tek sürükleme jestiyle yön, güç ve FALSO; yayın kamerası açısından.
 *
 * OYUN MODELİ — TEK JEST, DÖRT BİLGİ. Toptan başlayan bir sürükle-fırlat:
 *   YÖN       ← vektörün yatay bileşeni (topun VARACAĞI köşe)
 *   GÜÇ       ← vektörün uzunluğu; uçuş süresini kısaltır, kalecinin erişimini daraltır
 *   YÜKSEKLİK ← vektörün dikey bileşeni
 *   FALSO     ← parmağın çizdiği kavis: topun İLK yönünü saptırır, top
 *               uçuşta hedefe kıvrılır. Kaleci ilk yönü okur — falso onu aldatır.
 * Ayrıntı ve sayılar: `lib/game/penalty.ts`.
 *
 * KALECİ DÜRÜSTTÜR:
 *   · Kararını top AYRILDIKTAN SONRA verir (140–320ms tepki gecikmesi).
 *   · Yönü hatayla okur (gauss); sigma zorlukla düşer ama SIFIRLANMAZ.
 *   · BİR KEZ DALAR VE DÜZELTEMEZ.
 *
 * GÖRSEL — YENİDEN YAPILDI. Eski sahne düz yeşil bir zemin, beyaz bir
 * çerçeve, çubuk bir kaleci ve ortasında nokta olan bir daireydi. Şimdi:
 *   · Gece maçı: projektörler, iki katlı dolu tribün, LED reklam panoları.
 *   · Perspektifli çim: ufka doğru açılan biçme deseni, tebeşir çizgileri.
 *   · Derinliği olan kale: arka çerçeve, yan ve tavan ağları, gölgeli direkler;
 *     gol olunca ağ topun girdiği yerden dalgalanır.
 *   · Eklemli kaleci: hazır duruşta sallanır, kararını verince yana uçar.
 *   · Gerçek 3B desenli top: falsoyla kendi ekseninde döner, iz bırakır.
 *   · Nişan önizlemesi: sürüklerken noktalı yörünge + kaledeki hedef halkası.
 *   · Sonrası: gol ağda durur, kurtarış sekip döner, direk geri çarpar.
 *     Gol anında konfeti, kamera hafifçe sarsılır.
 *
 * AKICILIK — KATMANLAR. Eski ekran her karede KÖK bileşende `setState`
 * çağırıp başlığı, HUD'u ve bütün sahneyi yeniden çiziyordu; üstelik `memo`
 * bileşenlerine yerinde değişen nesneler verildiği için top ve kaleci bazı
 * karelerde hiç güncellenmiyordu. Şimdi sahne üç ayrı `<Svg>` katmanıdır:
 *   1. ARKA PLAN — stadyum, çim, çizgiler. Boyut değişmedikçe bir kez çizilir.
 *   2. KALE — ağ ve direkler. Yalnız ağ dalgalanırken yeniden çizilir.
 *   3. AKTÖRLER — kaleci, top, iz, nişan, konfeti. Her kare; ama küçük.
 * Döngü yalnız 3. katmanı (ve dalga sürerken 2.'yi) bir kare sinyaliyle
 * uyandırır; ekranın geri kalanı yalnız skor/faz değişince render alır.
 * Kamera yakınlaşması ve sarsıntı yerel sürücülü `Animated` dönüşümüdür —
 * JS iş parçacığına hiç yük bindirmez.
 *
 * EMOJİ YOK: top ve kaleci vektör çizimdir; renkleri `lib/game/art.ts`.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MutableRefObject,
} from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { FigureDefs, Keeper } from "@/components/game/Figures";
import { BallDefs, BallShadow, SoccerBall } from "@/components/game/SoccerBall";
import { Button, ScreenHeader, Touchable, useReduceMotion } from "@/components/ui";
import { submitArenaScore } from "@/lib/api/arena";
import { art, seeded } from "@/lib/game/art";
import { useDragGesture, type DragResult } from "@/lib/game/input";
import { clamp, useGameLoop } from "@/lib/game/loop";
import {
  BALL_R,
  ballAt,
  D_BOARDS,
  D_GOAL,
  D_KEEPER,
  D_NET,
  D_SPOT,
  GOAL_H,
  GOAL_W,
  keeperGuess,
  makeView,
  NET_BACK_H,
  planShot,
  project,
  resolveShot,
  type Outcome,
  type ShotPlan,
  type View as Cam,
} from "@/lib/game/penalty";
import { useFrameSignal, useOnFrame, useSignalValue, type FrameSignal } from "@/lib/game/signal";
import { initialOrientation, rotate, type Orientation } from "@/lib/game/sphere";
import { TUNING } from "@/lib/game/tuning";
import { useAuth } from "@/providers/AuthProvider";
import {
  colors,
  easing,
  elevate,
  fonts,
  hairline,
  haptics,
  layout,
  radius,
  space,
  spring,
  textScale,
  type,
  upperTR,
} from "@/theme";

/* ============================ SABİTLER VE TİPLER ============================ */

const BEST_KEY = "elitlig.penalti.best.v2";
const T = TUNING.penalti;

/** Arka ağ örgüsü: sütun × satır düğüm. Dalga bu ızgarada yayılır. */
const NET_COLS = 15;
const NET_ROWS = 8;
/** Sonuç ekranda bu kadar kalır, sonra sıradaki atış. */
const RESULT_HOLD_MS = 1600;
/** Gol anında kameranın yakınlaşma oranı. */
const ZOOM = 1.07;
const GRAVITY = 9.8;

type Phase = "ready" | "aim" | "flight" | "result" | "over";
type SubmitState = "idle" | "guest" | "sending" | "sent" | "failed";
type ShotMark = Outcome | null;

/** Kalecinin durumu — kararını verdikten SONRA değiştiremez. */
interface KeeperState {
  /** Konum, kale genişliği cinsinden (0 sol direk, 1 sağ direk). */
  x: number;
  /** Dalışın başladığı konum. */
  fromX: number;
  /** Dalış hedefi; karar verilene kadar null. */
  target: number | null;
  /** Kararın verileceği an (atıştan sonra saniye). */
  decideAt: number;
  /** Dalışın başladığı an; null = henüz dalmadı. */
  divedAt: number | null;
  /** -1..1 uçuş pozu (Figures/Keeper). */
  dive: number;
  /** Yerden yükselme, 0–1. */
  lift: number;
  crouch: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  color: string;
  size: number;
}

/** Sahnenin bütün hareketli durumu — refte yaşar, render'da okunur. */
interface World {
  time: number;
  plan: ShotPlan | null;
  /** Uçuş ilerlemesi 0→1. */
  t: number;
  /** Atıştan beri geçen (ağır çekimle ölçeklenmiş) süre. */
  since: number;
  /** Top — uçuşta yörüngeden, sonrasında serbest fizikle. */
  ball: { X: number; Y: number; D: number; vX: number; vY: number; vD: number; free: boolean };
  orient: Orientation;
  /** Dönüş hızları (rad/sn): falso (z) ve yuvarlanma (x). */
  spin: number;
  roll: number;
  trail: { X: number; Y: number; D: number }[];
  keeper: KeeperState;
  net: number[];
  netActive: boolean;
  netTick: number;
  confetti: Particle[];
  slowmo: number;
  outcome: Outcome | null;
}

const restingKeeper = (): KeeperState => ({
  x: 0.5,
  fromX: 0.5,
  target: null,
  decideAt: 0,
  divedAt: null,
  dive: 0,
  lift: 0,
  crouch: 0,
});

const spotBall = () => ({ X: 0, Y: BALL_R, D: D_SPOT, vX: 0, vY: 0, vD: 0, free: false });

function newWorld(): World {
  return {
    time: 0,
    plan: null,
    t: 0,
    since: 0,
    ball: spotBall(),
    orient: initialOrientation(),
    spin: 0,
    roll: 0,
    trail: [],
    keeper: restingKeeper(),
    net: Array(NET_COLS * NET_ROWS).fill(0),
    netActive: false,
    netTick: 0,
    confetti: [],
    slowmo: 1,
    outcome: null,
  };
}

const smooth = (p: number) => p * p * (3 - 2 * p);

/* ================================= EKRAN ================================= */

export default function PenaltiScreen() {
  const router = useRouter();
  const auth = useAuth();
  const reduceMotion = useReduceMotion();

  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [marks, setMarks] = useState<ShotMark[]>(Array(T.shots).fill(null));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [size, setSize] = useState({ w: 0, h: 0 });

  const signal = useFrameSignal();
  const world = useRef<World>(newWorld());
  /** Sürükleme sürerken canlı önizleme — state değil ref: kare sinyaliyle çizilir. */
  const drag = useRef<DragResult | null>(null);
  const phaseRef = useRef<Phase>("ready");
  const shotIndex = useRef(0);
  const scoreRef = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cam = useMemo(() => (size.w > 0 && size.h > 0 ? makeView(size.w, size.h) : null), [size]);
  const camRef = useRef<Cam | null>(null);
  camRef.current = cam;

  /* Kamera: yakınlaşma ve sarsıntı yerel sürücüde. */
  const zoom = useRef(new Animated.Value(1)).current;
  const shakeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY).then((value) => setBest(Number(value) || 0));
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
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
    [auth.user],
  );

  const finish = useCallback(() => {
    setPhaseBoth("over");
    const finished = scoreRef.current;
    submitScore(finished);
    if (finished > 0) {
      setBest((current) => {
        if (finished <= current) return current;
        void AsyncStorage.setItem(BEST_KEY, String(finished));
        return finished;
      });
    }
  }, [setPhaseBoth, submitScore]);

  /* ─────────────────────────── kamera hareketi ─────────────────────────── */

  const pushIn = useCallback(
    (ms: number) => {
      if (reduceMotion) return;
      Animated.timing(zoom, {
        toValue: ZOOM,
        duration: ms,
        easing: easing.decelerate,
        useNativeDriver: true,
      }).start();
    },
    [reduceMotion, zoom],
  );

  const pullBack = useCallback(() => {
    Animated.timing(zoom, {
      toValue: 1,
      duration: 380,
      easing: easing.standard,
      useNativeDriver: true,
    }).start();
  }, [zoom]);

  const shake = useCallback(
    (amount: number) => {
      if (reduceMotion) return;
      const steps = [amount, -amount, amount * 0.6, -amount * 0.6, amount * 0.25, 0];
      Animated.sequence(
        steps.map((toValue) =>
          Animated.timing(shakeX, { toValue, duration: 42, useNativeDriver: true }),
        ),
      ).start();
    },
    [reduceMotion, shakeX],
  );

  /* ─────────────────────────── atışın sonu ─────────────────────────── */

  const land = useCallback(
    (result: Outcome) => {
      const w = world.current;
      const plan = w.plan;
      w.outcome = result;
      setOutcome(result);
      setPhaseBoth("result");
      setMarks((current) => {
        const next = [...current];
        next[shotIndex.current] = result;
        return next;
      });

      /* Top serbest fiziğe devrolur: sonucun HİKÂYESİNİ top anlatır. */
      const b = w.ball;
      b.free = true;
      const speed = plan ? 11 / plan.duration : 25;
      const lateral = plan ? ((plan.aimX - plan.apparentX) * GOAL_W * 2) / plan.duration : 0;

      if (result === "gol") {
        b.vD = speed * 0.55;
        b.vX = lateral * 0.3;
        b.vY = 0;
        scoreRef.current += 1;
        setScore(scoreRef.current);
        // Ağ dalgası topun girdiği noktadan yayılır.
        if (plan) {
          const col = clamp(Math.round(plan.aimX * (NET_COLS - 1)), 0, NET_COLS - 1);
          const row = clamp(
            Math.round((1 - Math.min(1, plan.aimY)) * (NET_ROWS - 1)),
            0,
            NET_ROWS - 1,
          );
          w.net[row * NET_COLS + col] = 1.4;
          w.netActive = true;
        }
        burstConfetti(w, camRef.current);
        shake(4);
        haptics.success();
      } else if (result === "kurtaris") {
        const away = Math.sign((plan?.aimX ?? 0.5) - w.keeper.x) || 1;
        b.vD = -5.5;
        b.vX = away * 4.5;
        b.vY = 3.2;
        w.spin = -w.spin * 0.5;
        haptics.warning();
      } else if (result === "direk") {
        b.vD = -7;
        b.vX = -Math.sign(b.X || 1) * 2.4;
        b.vY = 1.8;
        shake(3);
        haptics.warning();
      } else {
        b.vD = speed * 0.8;
        b.vX = lateral * 0.5 + Math.sign(b.X || 1) * 2;
        b.vY = b.Y > GOAL_H ? 1.5 : 0;
        haptics.warning();
      }

      holdTimer.current = setTimeout(() => {
        shotIndex.current += 1;
        const fresh = world.current;
        fresh.plan = null;
        fresh.t = 0;
        fresh.since = 0;
        fresh.ball = spotBall();
        fresh.trail = [];
        fresh.keeper = restingKeeper();
        fresh.slowmo = 1;
        fresh.outcome = null;
        fresh.spin = 0;
        fresh.roll = 0;
        setOutcome(null);
        drag.current = null;
        pullBack();
        if (shotIndex.current >= T.shots) finish();
        else setPhaseBoth("aim");
      }, RESULT_HOLD_MS);
    },
    [finish, pullBack, setPhaseBoth, shake],
  );

  /* ─────────────────────────── fizik adımı ─────────────────────────── */

  const step = useCallback(
    (dt: number) => {
      const w = world.current;
      w.time += dt;

      if (w.netActive) w.netActive = relaxNet(w.net);
      stepConfetti(w.confetti, dt);

      const k = w.keeper;
      const current = phaseRef.current;

      /* BEKLEME: kaleci çizgide yana sallanır ve dizlerini kırar — sahne
         ölü durmasın. Atış anındaki konumu dalışın başlangıcıdır. */
      if (current === "aim") {
        k.x = 0.5 + Math.sin(w.time * 1.7) * 0.035;
        k.crouch = 0.5 + 0.5 * Math.sin(w.time * 3.4);
        return;
      }

      const plan = w.plan;
      if (!plan || (current !== "flight" && current !== "result")) return;

      const sdt = dt * w.slowmo;
      w.since += sdt;

      /* KALECİNİN KARARI — gecikmeyle, hatayla, bir kez. */
      if (k.target == null && w.since >= k.decideAt) {
        const difficulty = clamp(shotIndex.current / Math.max(1, T.shots - 1), 0, 1);
        k.target = keeperGuess(plan, difficulty);
        k.divedAt = w.since;
      }

      /* DALIŞ — başladıktan sonra hedef DEĞİŞMEZ. */
      if (k.target != null && k.divedAt != null) {
        const p = clamp((w.since - k.divedAt) / T.keeperDive, 0, 1);
        const eased = smooth(p);
        const span = Math.min(1, Math.abs(k.target - k.fromX) * 2.6);
        k.x = k.fromX + (k.target - k.fromX) * eased;
        k.dive = Math.sign(k.target - k.fromX) * span * Math.min(1, eased * 1.6);
        k.lift = Math.sin(eased * Math.PI) * span;
        k.crouch = 0;
      }

      /* Top kendi ekseninde döner (falso) ve ileri yuvarlanır. */
      rotate(w.orient, [0, 0, 1], w.spin * sdt);
      rotate(w.orient, [1, 0, 0], -w.roll * sdt);

      if (current === "flight") {
        /* AĞIR ÇEKİM: son %20'de kaleciyle mesafe kritikse zaman yavaşlar. */
        const close = Math.abs(plan.aimX - k.x) < T.keeperReach * 1.6;
        w.slowmo = w.t > 0.8 && close ? 0.3 : 1;

        w.t = Math.min(1, w.t + sdt / plan.duration);
        const pos = ballAt(plan, w.t);
        w.ball.X = pos.X;
        w.ball.Y = pos.Y;
        w.ball.D = pos.D;

        w.trail.push({ X: pos.X, Y: pos.Y, D: pos.D });
        if (w.trail.length > 14) w.trail.shift();

        if (w.t >= 1) {
          w.slowmo = 1;
          land(resolveShot(plan, k.x, k.lift));
        }
        return;
      }

      /* SONRASI — serbest top: yerçekimi, zemin sekmesi, ağın frenlemesi. */
      const b = w.ball;
      if (w.trail.length) w.trail.shift();
      b.vY -= GRAVITY * sdt;
      b.X += b.vX * sdt;
      b.Y += b.vY * sdt;
      b.D += b.vD * sdt;
      if (b.Y < BALL_R) {
        b.Y = BALL_R;
        b.vY = Math.abs(b.vY) > 1 ? -b.vY * 0.45 : 0;
        b.vX *= 0.86;
        b.vD *= 0.86;
      }
      if (w.outcome === "gol" && b.D > D_GOAL + 0.25) {
        // Ağ topu yakalar: derinlik ve yan hız hızla söner.
        b.vD *= Math.exp(-9 * sdt);
        b.vX *= Math.exp(-6 * sdt);
        b.D = Math.min(b.D, D_NET - 0.25);
      }
      if (b.D > D_BOARDS - 0.4) {
        b.D = D_BOARDS - 0.4;
        b.vD = -Math.abs(b.vD) * 0.25;
      }
      w.spin *= Math.exp(-1.5 * sdt);
      w.roll = Math.hypot(b.vD, b.vX) * 2.2;
    },
    [land],
  );

  const render = useCallback(() => {
    const w = world.current;
    if (w.netActive) w.netTick += 1;
    signal.emit();
  }, [signal]);

  useGameLoop({
    step,
    render,
    running: phase === "aim" || phase === "flight" || phase === "result",
  });

  /* ─────────────────────────── jest ─────────────────────────── */

  const shoot = useCallback(
    (result: DragResult) => {
      if (phaseRef.current !== "aim") return;
      if (result.length < T.dragMin) {
        // Çok kısa sürükleme atış değil, kararsızlıktır; jest yutulur.
        drag.current = null;
        return;
      }
      const v = camRef.current;
      if (!v) return;

      const plan = planShot(result, v.w, v.h);
      const w = world.current;
      w.plan = plan;
      w.t = 0;
      w.since = 0;
      w.trail = [];
      w.spin = -plan.curve * 16;
      w.roll = 18 + plan.power * 22;

      const difficulty = clamp(shotIndex.current / Math.max(1, T.shots - 1), 0, 1);
      const delay = T.keeperDelayEasy + (T.keeperDelayHard - T.keeperDelayEasy) * difficulty;
      w.keeper = { ...restingKeeper(), x: w.keeper.x, fromX: w.keeper.x, decideAt: delay };

      drag.current = null;
      setPhaseBoth("flight");
      pushIn(plan.duration * 1000 + 300);
      haptics.medium();
    },
    [pushIn, setPhaseBoth],
  );

  const gesture = useDragGesture({
    enabled: phase === "aim",
    onMove: (result) => {
      drag.current = result;
    },
    onEnd: shoot,
  });

  const start = useCallback(() => {
    scoreRef.current = 0;
    shotIndex.current = 0;
    world.current = newWorld();
    drag.current = null;
    setScore(0);
    setMarks(Array(T.shots).fill(null));
    setOutcome(null);
    setSubmit("idle");
    zoom.setValue(1);
    setPhaseBoth("aim");
    signal.emit();
  }, [setPhaseBoth, signal, zoom]);

  const openBoard = useCallback(
    () => router.push({ pathname: "/siralama", params: { game: "penalti" } }),
    [router],
  );

  const isRecord = score > 0 && score >= best;

  /* Kamera dönüşümü: kale noktasını sabit tutarak yakınlaş. */
  const goalY = cam ? project(cam, 0, GOAL_H * 0.5, D_GOAL).y : 0;
  const lift = (size.h / 2 - goalY) * (ZOOM - 1);
  const cameraStyle = {
    transform: [
      { translateX: shakeX },
      {
        translateY: zoom.interpolate({ inputRange: [1, ZOOM], outputRange: [0, lift] }),
      },
      { scale: zoom },
    ],
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Penaltı"
        overline={upperTR("Elitlig Arena")}
        subtitle="Toptan sürükle: yön, güç ve falso tek jestte"
        back
        actions={[
          { icon: "trophy-outline", onPress: openBoard, accessibilityLabel: "Rekor tablosu" },
        ]}
      />

      {/* HUD: gol solda, seri tablosu sağda. */}
      <View style={styles.hud}>
        <View style={styles.hudLeft}>
          <Text style={styles.hudLabel} {...textScale.badge}>
            {upperTR("Gol")}
          </Text>
          <Text style={styles.hudScore} {...textScale.dense}>
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
          {/* Klasik penaltı serisi göstergesi: dolu / boş / bekleyen. */}
          <View style={styles.series}>
            {marks.map((mark, i) => (
              <View
                key={i}
                style={[
                  styles.seriesDot,
                  mark === "gol" && styles.seriesDotGoal,
                  mark != null && mark !== "gol" && styles.seriesDotMiss,
                ]}
              />
            ))}
          </View>
        </View>
      </View>

      <View
        style={styles.pitch}
        {...gesture.panHandlers}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Penaltı sahası"
        accessibilityHint="Toptan parmağını sürükleyip bırak. Uzunluk gücü, yön köşeyi, çizdiğin kavis falsoyu belirler."
      >
        {cam ? (
          <Animated.View style={[StyleSheet.absoluteFill, cameraStyle]} pointerEvents="none">
            <Backdrop cam={cam} />
            <GoalLayer cam={cam} world={world} signal={signal} />
            <ActorsLayer
              cam={cam}
              world={world}
              drag={drag}
              phaseRef={phaseRef}
              signal={signal}
            />
            <Vignette w={cam.w} h={cam.h} />
          </Animated.View>
        ) : null}

        {outcome ? <OutcomeBanner outcome={outcome} /> : null}

        {phase === "ready" ? (
          <StartCard best={best} onStart={start} />
        ) : phase === "over" ? (
          <ResultCard
            score={score}
            best={best}
            isRecord={isRecord}
            submit={submit}
            onRetrySubmit={() => submitScore(score)}
            onSignIn={() => router.push("/giris")}
            onRestart={start}
            onBoard={openBoard}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

/* ============================== EFEKT FİZİĞİ ============================== */

/**
 * Ağ dalgası: her düğüm komşularının ortalamasına doğru çekilir ve söner.
 * Ağ durulunca false döner — katman yeniden çizilmeyi bırakır.
 */
function relaxNet(net: number[]): boolean {
  const next = net.slice();
  let alive = false;
  for (let r = 0; r < NET_ROWS; r += 1) {
    for (let c = 0; c < NET_COLS; c += 1) {
      const i = r * NET_COLS + c;
      let sum = 0;
      let count = 0;
      if (c > 0) (sum += net[i - 1]), (count += 1);
      if (c < NET_COLS - 1) (sum += net[i + 1]), (count += 1);
      if (r > 0) (sum += net[i - NET_COLS]), (count += 1);
      if (r < NET_ROWS - 1) (sum += net[i + NET_COLS]), (count += 1);
      const neighbour = count ? sum / count : 0;
      next[i] = (net[i] + (neighbour - net[i]) * T.netSpread) * T.netDamp;
    }
  }
  for (let i = 0; i < net.length; i += 1) {
    net[i] = Math.abs(next[i]) < 0.003 ? 0 : next[i];
    if (net[i] !== 0) alive = true;
  }
  return alive;
}

function burstConfetti(w: World, cam: Cam | null): void {
  if (!cam) return;
  const origin = project(cam, w.ball.X, w.ball.Y, w.ball.D);
  const rand = seeded(Math.floor(w.time * 1000));
  for (let i = 0; i < 70; i += 1) {
    const angle = -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.3;
    const speed = 160 + rand() * 340;
    w.confetti.push({
      x: origin.x + (rand() - 0.5) * 30,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: rand() * 360,
      vr: (rand() - 0.5) * 900,
      life: 1.2 + rand() * 0.5,
      color: art.confetti[i % art.confetti.length],
      size: 4 + rand() * 5,
    });
  }
}

function stepConfetti(list: Particle[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    p.vy += 520 * dt;
    p.vx *= Math.exp(-1.6 * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.life -= dt;
    if (p.life <= 0) list.splice(i, 1);
  }
}

/* ============================== 1 · ARKA PLAN ============================== */

/**
 * Stadyum ve çim — boyut değişmedikçe BİR KEZ çizilir.
 *
 * Kalabalık binlerce ayrı daire değil, renk başına TEK bir yoldur: her
 * seyirci kafası aynı `Path`'e eklenmiş küçük bir dairedir. On renk = on
 * düğüm; tribün dolu görünür, çizim maliyeti neredeyse sıfırdır.
 */
const Backdrop = memo(function Backdrop({ cam }: { cam: Cam }) {
  const { w, h } = cam;
  const boardsBottom = project(cam, 0, 0, D_BOARDS).y;
  const boardH = (cam.fx * 0.95) / D_BOARDS;
  const boardsTop = boardsBottom - boardH;
  const roofH = boardsTop * 0.16;
  const tierSplit = roofH + (boardsTop - roofH) * 0.46;

  const crowd = useMemo(() => {
    const rand = seeded(1907);
    const paths: string[] = art.crowd.map(() => "");
    const rows = (top: number, bottom: number, gap: number, rMin: number, rMax: number) => {
      for (let y = top + gap * 0.6; y < bottom - 1; y += gap) {
        const depth = (y - top) / Math.max(1, bottom - top);
        const r = rMin + (rMax - rMin) * depth;
        for (let x = (rand() * gap) / 2; x < w; x += gap * (0.92 + rand() * 0.2)) {
          if (rand() < 0.07) continue; // boş koltuk
          const c = Math.floor(rand() * art.crowd.length);
          const cx = x + (rand() - 0.5) * 1.5;
          const cy = y + (rand() - 0.5) * 1.5;
          paths[c] += `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`;
        }
      }
    };
    rows(roofH + 3, tierSplit - 4, 5.2, 1.3, 1.9);
    rows(tierSplit + 4, boardsTop, 6.4, 1.8, 2.5);
    return paths;
  }, [w, roofH, tierSplit, boardsTop]);

  // Çim bantları: kale çizgisine paralel biçme şeritleri (derinlik aralıkları).
  const bands: { y1: number; y2: number }[] = [];
  for (let d = D_BOARDS, i = 0; d > 2.5; d -= 1.6, i += 1) {
    if (i % 2 === 0) bands.push({ y1: project(cam, 0, 0, d).y, y2: project(cam, 0, 0, d - 1.6).y });
  }
  // Boyuna şeritler: ufka yakınsayan dörtgenler — dama deseni bunların kesişimi.
  const lanes: string[] = [];
  for (let X = -30; X < 30; X += 8) {
    const a = project(cam, X, 0, D_BOARDS);
    const b = project(cam, X + 4, 0, D_BOARDS);
    const c = project(cam, X + 4, 0, 1.2);
    const d = project(cam, X, 0, 1.2);
    lanes.push(`M${a.x} ${a.y}L${b.x} ${b.y}L${c.x} ${c.y}L${d.x} ${d.y}Z`);
  }

  const line = (X1: number, D1: number, X2: number, D2: number) => {
    const a = project(cam, X1, 0, D1);
    const b = project(cam, X2, 0, D2);
    return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  };
  const sixYard = D_GOAL - 5.5;
  const lights = Math.max(4, Math.round(w / 44));
  const chalkW = (cam.fx / D_GOAL) * 0.12;
  const spot = project(cam, 0, 0, D_SPOT);

  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={art.skyTop} />
          <Stop offset="1" stopColor={art.skyBottom} />
        </LinearGradient>
        <LinearGradient id="stand" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={art.standBack} />
          <Stop offset="1" stopColor={art.standFront} />
        </LinearGradient>
        <LinearGradient id="standShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={art.skyTop} stopOpacity={0.7} />
          <Stop offset="0.6" stopColor={art.skyTop} stopOpacity={0.15} />
          <Stop offset="1" stopColor={art.skyTop} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="board" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={art.boardTop} />
          <Stop offset="1" stopColor={art.boardBottom} />
        </LinearGradient>
        <LinearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={art.grassFar} />
          <Stop offset="1" stopColor={art.grassNear} />
        </LinearGradient>
        <RadialGradient id="flood" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={art.floodlight} stopOpacity={0.55} />
          <Stop offset="1" stopColor={art.floodlight} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="pool" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={art.grassLight} stopOpacity={0.14} />
          <Stop offset="1" stopColor={art.grassLight} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* Gökyüzü ve tribün */}
      <Rect x={0} y={0} width={w} height={boardsTop + 1} fill="url(#sky)" />
      <Rect x={0} y={roofH} width={w} height={boardsTop - roofH} fill="url(#stand)" />
      {crowd.map((d, i) => (d ? <Path key={i} d={d} fill={art.crowd[i]} opacity={0.62} /> : null))}
      {/* Uzak tribün karanlıkta kalır: üstten inen bir koyuluk derinlik verir. */}
      <Rect x={0} y={roofH} width={w} height={boardsTop - roofH} fill="url(#standShade)" />
      {/* Katlar arası korkuluk ve çatı */}
      <Rect x={0} y={tierSplit - 2.5} width={w} height={4} fill={art.standRail} />
      <Rect x={0} y={0} width={w} height={roofH} fill={art.roof} />
      {/* Projektör sırası: çatının altında parlayan paneller */}
      {Array.from({ length: lights }, (_, i) => {
        const x = ((i + 0.5) / lights) * w;
        return (
          <G key={i}>
            <Ellipse cx={x} cy={roofH} rx={34} ry={22} fill="url(#flood)" />
            <Rect x={x - 9} y={roofH - 4} width={18} height={4} rx={1} fill={art.floodlightCore} opacity={0.9} />
          </G>
        );
      })}
      {/* Tribünün alt kenarında havada asılı ışık sisi */}
      <Ellipse cx={w / 2} cy={boardsTop} rx={w * 0.7} ry={boardH * 1.6} fill="url(#flood)" opacity={0.35} />

      {/* LED panolar */}
      <Rect x={0} y={boardsTop} width={w} height={boardH} fill="url(#board)" />
      <Rect x={0} y={boardsTop} width={w} height={Math.max(1, boardH * 0.08)} fill={art.boardAccent} opacity={0.7} />
      {Array.from({ length: Math.ceil(w / 120) + 1 }, (_, i) => (
        <SvgText
          key={i}
          x={i * 120 + 40}
          y={boardsTop + boardH * 0.7}
          fontSize={boardH * 0.58}
          fontFamily={fonts.bold}
          fill={i % 2 ? art.boardAccent : art.boardText}
          textAnchor="middle"
          letterSpacing={1.2}
        >
          {i % 2 ? "ARENA" : "ELİTLİG"}
        </SvgText>
      ))}

      {/* Çim */}
      <Rect x={0} y={boardsBottom} width={w} height={h - boardsBottom} fill="url(#grass)" />
      {bands.map((b, i) => (
        <Rect key={i} x={0} y={b.y1} width={w} height={b.y2 - b.y1} fill={art.grassLight} opacity={0.045} />
      ))}
      {lanes.map((d, i) => (
        <Path key={i} d={d} fill={art.grassDark} opacity={0.05} />
      ))}
      {/* Kale ağzına düşen ışık havuzu */}
      <Ellipse
        cx={cam.cx}
        cy={project(cam, 0, 0, D_GOAL - 2).y}
        rx={w * 0.55}
        ry={(project(cam, 0, 0, D_GOAL - 6).y - project(cam, 0, 0, D_GOAL + 1).y) * 0.7}
        fill="url(#pool)"
      />

      {/* Tebeşir çizgileri */}
      <G stroke={art.chalk} strokeLinecap="round" fill="none" opacity={0.9}>
        <Path d={line(-40, D_GOAL, 40, D_GOAL)} strokeWidth={chalkW} />
        <Path
          d={`${line(-9.16, D_GOAL, -9.16, sixYard)}${line(-9.16, sixYard, 9.16, sixYard).replace("M", "L")}${line(9.16, sixYard, 9.16, D_GOAL).replace("M", "L")}`}
          strokeWidth={chalkW * 1.15}
        />
      </G>
      <Ellipse cx={spot.x} cy={spot.y} rx={(cam.fx / D_SPOT) * 0.14} ry={(cam.fx / D_SPOT) * 0.05} fill={art.chalk} />
    </Svg>
  );
});

/** Köşe karartması — gözü merkeze, kaleye çeker. Statik. */
const Vignette = memo(function Vignette({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="vig" cx="50%" cy="46%" r="75%">
          <Stop offset="0.55" stopColor={art.outline} stopOpacity={0} />
          <Stop offset="1" stopColor={art.outline} stopOpacity={0.55} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#vig)" />
    </Svg>
  );
});

/* ================================ 2 · KALE ================================ */

/**
 * Ağ + direkler. Yalnız ağ dalgalanırken (gol sonrası ~1 sn) yeniden çizilir;
 * geri kalan her karede React bu bileşeni atlar.
 */
function GoalLayer({
  cam,
  world,
  signal,
}: {
  cam: Cam;
  world: MutableRefObject<World>;
  signal: FrameSignal;
}) {
  const tick = useSignalValue(signal, () => world.current.netTick);
  return <GoalDrawing cam={cam} net={world.current.net} tick={tick} />;
}

const GoalDrawing = memo(function GoalDrawing({
  cam,
  net,
}: {
  cam: Cam;
  net: number[];
  tick: number;
}) {
  const half = GOAL_W / 2;
  const P = (X: number, Y: number, D: number) => project(cam, X, Y, D);
  const pt = (p: { x: number; y: number }) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

  /* Arka ağ düğümleri: dalga düğümü derinliğe iter. */
  const node = (c: number, r: number) => {
    const X = -half + (GOAL_W * c) / (NET_COLS - 1);
    const Y = NET_BACK_H * (1 - r / (NET_ROWS - 1));
    const push = net[r * NET_COLS + c];
    return P(X * (1 - push * 0.05), Y, D_NET + push * 1.1);
  };

  let back = "";
  for (let c = 0; c < NET_COLS; c += 1) {
    for (let r = 0; r < NET_ROWS; r += 1) back += `${r === 0 ? "M" : "L"}${pt(node(c, r))}`;
  }
  for (let r = 0; r < NET_ROWS; r += 1) {
    for (let c = 0; c < NET_COLS; c += 1) back += `${c === 0 ? "M" : "L"}${pt(node(c, r))}`;
  }

  /* Tavan ve yan ağlar: ön çerçeveden arka çerçeveye. */
  let sides = "";
  const depthSteps = 5;
  for (let i = 0; i <= depthSteps; i += 1) {
    const d = D_GOAL + ((D_NET - D_GOAL) * i) / depthSteps;
    const top = GOAL_H + ((NET_BACK_H - GOAL_H) * i) / depthSteps;
    sides += `M${pt(P(-half, 0, d))}L${pt(P(-half, top, d))}L${pt(P(half, top, d))}L${pt(P(half, 0, d))}`;
  }
  for (let c = 0; c < NET_COLS; c += 1) {
    const X = -half + (GOAL_W * c) / (NET_COLS - 1);
    sides += `M${pt(P(X, GOAL_H, D_GOAL))}L${pt(P(X, NET_BACK_H, D_NET))}`;
  }
  for (let r = 1; r < 6; r += 1) {
    const f = r / 6;
    for (const X of [-half, half]) {
      sides += `M${pt(P(X, GOAL_H * f, D_GOAL))}L${pt(P(X, NET_BACK_H * f, D_NET))}`;
    }
  }

  const fl = P(-half, 0, D_GOAL);
  const flt = P(-half, GOAL_H, D_GOAL);
  const frt = P(half, GOAL_H, D_GOAL);
  const fr = P(half, 0, D_GOAL);
  const bl = P(-half, 0, D_NET);
  const blt = P(-half, NET_BACK_H, D_NET);
  const brt = P(half, NET_BACK_H, D_NET);
  const br = P(half, 0, D_NET);
  const post = fl.s * 0.12;

  return (
    <Svg width={cam.w} height={cam.h} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="postV" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={art.postShade} />
          <Stop offset="0.35" stopColor={art.postLight} />
          <Stop offset="1" stopColor={art.postShade} />
        </LinearGradient>
      </Defs>

      {/* Kale içi gölge: ağzın derinliğini okutur. */}
      <Path
        d={`M${pt(fl)}L${pt(flt)}L${pt(frt)}L${pt(fr)}Z`}
        fill={art.outline}
        opacity={0.22}
      />
      {/* Direk gölgeleri — projektör önden-soldan vurur. */}
      <Path
        d={`M${pt(fl)}L${pt(P(-half + 1.4, 0, D_GOAL + 2.6))}M${pt(fr)}L${pt(P(half + 1.4, 0, D_GOAL + 2.6))}`}
        stroke={art.shadow}
        strokeWidth={post * 0.9}
        strokeLinecap="round"
        opacity={0.3}
      />

      {/* Ağ */}
      <Path d={sides} stroke={art.net} strokeWidth={0.6} opacity={0.32} fill="none" />
      <Path d={back} stroke={art.net} strokeWidth={0.7} opacity={0.5} fill="none" />

      {/* Arka çerçeve — ince, gri. */}
      <Path
        d={`M${pt(fl)}L${pt(bl)}L${pt(blt)}L${pt(brt)}L${pt(br)}L${pt(fr)}M${pt(flt)}L${pt(blt)}M${pt(frt)}L${pt(brt)}`}
        stroke={art.postShade}
        strokeWidth={post * 0.35}
        strokeLinejoin="round"
        fill="none"
        opacity={0.9}
      />

      {/* Ön çerçeve — silindir gölgeli direkler. */}
      <Rect x={fl.x - post / 2} y={flt.y - post / 2} width={post} height={fl.y - flt.y + post / 2} fill="url(#postV)" />
      <Rect x={fr.x - post / 2} y={frt.y - post / 2} width={post} height={fr.y - frt.y + post / 2} fill="url(#postV)" />
      <Rect x={flt.x - post / 2} y={flt.y - post / 2} width={frt.x - flt.x + post} height={post} fill={art.postLight} />
      <Line
        x1={flt.x}
        y1={flt.y + post * 0.42}
        x2={frt.x}
        y2={frt.y + post * 0.42}
        stroke={art.postShade}
        strokeWidth={post * 0.22}
      />
    </Svg>
  );
});

/* ============================== 3 · AKTÖRLER ============================== */

function ActorsLayer({
  cam,
  world,
  drag,
  phaseRef,
  signal,
}: {
  cam: Cam;
  world: MutableRefObject<World>;
  drag: MutableRefObject<DragResult | null>;
  phaseRef: MutableRefObject<Phase>;
  signal: FrameSignal;
}) {
  useOnFrame(signal);
  const w = world.current;
  const phase = phaseRef.current;
  const b = w.ball;
  const k = w.keeper;

  /* Kaleci: eli `x` noktasında olsun diye gövde uçuş yönünün tersine kayar. */
  const keeperX = (k.x - 0.5) * GOAL_W - k.dive * 1.15;
  const kp = project(cam, keeperX, 0, D_KEEPER);
  const keeper = (
    <Keeper
      key="keeper"
      x={kp.x}
      y={kp.y}
      scale={(kp.s * 1.9) / 100}
      dive={k.dive}
      lift={k.lift}
      crouch={k.crouch}
    />
  );

  const bp = project(cam, b.X, b.Y, b.D);
  const ground = project(cam, b.X, 0, b.D);
  const r = bp.s * BALL_R;
  const ball = (
    <G key="ball">
      <BallShadow cx={ground.x} cy={ground.y} r={r} height={(b.Y - BALL_R) / BALL_R} />
      {w.trail.map((p, i) => {
        const tp = project(cam, p.X, p.Y, p.D);
        const f = (i + 1) / w.trail.length;
        return (
          <Circle
            key={i}
            cx={tp.x}
            cy={tp.y}
            r={tp.s * BALL_R * (0.35 + f * 0.55)}
            fill={art.white}
            opacity={f * 0.22}
          />
        );
      })}
      <SoccerBall cx={bp.x} cy={bp.y} r={r} orientation={w.orient} />
    </G>
  );

  // Top kalecinin arkasındaysa (ağda) önce top çizilir.
  const ordered = b.D > D_KEEPER ? [ball, keeper] : [keeper, ball];

  return (
    <Svg width={cam.w} height={cam.h} style={StyleSheet.absoluteFill}>
      <Defs>
        <BallDefs />
        <FigureDefs />
      </Defs>
      {ordered}
      {phase === "aim" ? <AimGuide cam={cam} drag={drag.current} time={w.time} /> : null}
      {w.confetti.map((p, i) => (
        <Rect
          key={i}
          x={p.x - p.size / 2}
          y={p.y - p.size / 4}
          width={p.size}
          height={p.size / 2}
          fill={p.color}
          opacity={Math.min(1, p.life * 1.6)}
          transform={`rotate(${p.rot.toFixed(0)} ${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
        />
      ))}
    </Svg>
  );
}

/**
 * Nişan önizlemesi — sürüklerken noktalı yörünge, kalede hedef halkası, topun
 * çevresinde güç halkası. Parmak kalkmadan jestin NE ürettiği görünür; falso
 * öğrenilebilir bir beceri olur, tesadüf değil.
 *
 * Parmak ekranda değilken: topun üstünde, yavaşça nefes alan üç ok işareti
 * "buradan yukarı sürükle" der.
 */
function AimGuide({ cam, drag, time }: { cam: Cam; drag: DragResult | null; time: number }) {
  const spot = project(cam, 0, BALL_R, D_SPOT);
  const r = spot.s * BALL_R;

  if (!drag || drag.length < T.dragMin) {
    return (
      <G>
        {[0, 1, 2].map((i) => {
          const y = spot.y - r * 2.6 - i * r * 1.3;
          const a = 0.25 + 0.55 * Math.max(0, Math.sin(time * 3.2 - i * 0.9));
          return (
            <Path
              key={i}
              d={`M${spot.x - r * 0.8} ${y + r * 0.45}L${spot.x} ${y - r * 0.2}L${spot.x + r * 0.8} ${y + r * 0.45}`}
              stroke={art.white}
              strokeWidth={Math.max(2, r * 0.22)}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={a}
            />
          );
        })}
      </G>
    );
  }

  const plan = planShot(drag, cam.w, cam.h);
  const onTarget = plan.aimX >= 0.03 && plan.aimX <= 0.97 && plan.aimY <= 1.04;
  const tint = onTarget ? art.white : art.miss;

  const dots = [];
  for (let i = 1; i <= 16; i += 1) {
    const t = i / 16;
    const p = ballAt(plan, t);
    const sp = project(cam, p.X, p.Y, p.D);
    dots.push(
      <Circle
        key={i}
        cx={sp.x}
        cy={sp.y}
        r={Math.max(1.2, sp.s * 0.05)}
        fill={tint}
        opacity={0.35 + 0.55 * (1 - t)}
      />,
    );
  }

  const end = ballAt(plan, 1);
  const target = project(cam, end.X, end.Y, D_GOAL);
  const tr = target.s * 0.32;
  const powerFrac = (plan.power - T.powerMin) / (T.powerMax - T.powerMin);
  const ring = r * 1.9;
  const circumference = 2 * Math.PI * ring;

  return (
    <G>
      {dots}
      {/* Hedef halkası */}
      <Circle cx={target.x} cy={target.y} r={tr} stroke={tint} strokeWidth={2} fill={tint} fillOpacity={0.12} />
      <Path
        d={`M${target.x - tr * 1.5} ${target.y}L${target.x - tr * 0.5} ${target.y}M${target.x + tr * 0.5} ${target.y}L${target.x + tr * 1.5} ${target.y}M${target.x} ${target.y - tr * 1.5}L${target.x} ${target.y - tr * 0.5}M${target.x} ${target.y + tr * 0.5}L${target.x} ${target.y + tr * 1.5}`}
        stroke={tint}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      {/* Güç halkası: boş iz + dolan yay. */}
      <Circle cx={spot.x} cy={spot.y} r={ring} stroke={art.white} strokeOpacity={0.22} strokeWidth={4} fill="none" />
      <Circle
        cx={spot.x}
        cy={spot.y}
        r={ring}
        stroke={powerFrac > 0.85 ? art.gold : art.goal}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${(circumference * (0.15 + powerFrac * 0.85)).toFixed(1)} ${circumference.toFixed(1)}`}
        transform={`rotate(-90 ${spot.x.toFixed(1)} ${spot.y.toFixed(1)})`}
      />
    </G>
  );
}

/* ============================== SONUÇ ETİKETİ ============================== */

const OUTCOME_LABEL: Record<Outcome, string> = {
  gol: "GOL!",
  kurtaris: "KURTARIŞ",
  aut: "AUT",
  direk: "DİREK",
};

const OUTCOME_ICON: Record<Outcome, ComponentProps<typeof Ionicons>["name"]> = {
  gol: "football",
  kurtaris: "hand-left",
  aut: "close-circle",
  direk: "remove-circle",
};

/** Sonuç bandı yaylı bir ölçekle girer — yerel sürücüde, kare kaybı yok. */
function OutcomeBanner({ outcome }: { outcome: Outcome }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, ...spring.bounce }).start();
  }, [outcome, pop]);

  const goal = outcome === "gol";
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.outcome,
        goal ? styles.outcomeGoal : styles.outcomeMiss,
        {
          opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
        },
      ]}
    >
      <Ionicons
        name={OUTCOME_ICON[outcome]}
        size={22}
        color={goal ? colors.textOnBrand : colors.onDark}
      />
      <Text
        style={[styles.outcomeText, goal ? styles.outcomeTextGoal : styles.outcomeTextMiss]}
        {...textScale.dense}
      >
        {OUTCOME_LABEL[outcome]}
      </Text>
    </Animated.View>
  );
}

/* ============================== KARTLAR ============================== */

const StartCard = memo(function StartCard({
  best,
  onStart,
}: {
  best: number;
  onStart: () => void;
}) {
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.cardOverline} {...textScale.badge}>
          {upperTR("Elitlig Arena")}
        </Text>
        <Text style={styles.cardTitle} {...textScale.dense}>
          Penaltı
        </Text>
        <Text style={styles.cardRule} {...textScale.long}>
          Toptan parmağını sürükle ve bırak. Uzunluk gücü, yön köşeyi, çizdiğin kavis falsoyu
          belirler. Kaleci top ayrıldıktan sonra karar verir ve kararını değiştiremez.
        </Text>
        <View style={styles.cardBest}>
          <Ionicons name="trophy" size={13} color={colors.star} />
          <Text style={styles.cardBestText} {...textScale.dense}>
            {best > 0 ? `Rekorun ${best} gol` : "Henüz rekorun yok"}
          </Text>
        </View>
        <Button label="Seriye başla" icon="play" size="lg" fullWidth onPress={onStart} />
      </View>
    </View>
  );
});

const ResultCard = memo(function ResultCard({
  score,
  best,
  isRecord,
  submit,
  onRetrySubmit,
  onSignIn,
  onRestart,
  onBoard,
}: {
  score: number;
  best: number;
  isRecord: boolean;
  submit: SubmitState;
  onRetrySubmit: () => void;
  onSignIn: () => void;
  onRestart: () => void;
  onBoard: () => void;
}) {
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        {isRecord ? (
          <View style={styles.recordBadge}>
            <Ionicons name="trophy" size={13} color={colors.textOnBrand} />
            <Text style={styles.recordText} {...textScale.badge}>
              {upperTR("Yeni rekor")}
            </Text>
          </View>
        ) : null}

        <Text style={styles.finalScore} {...textScale.dense}>
          {score}
        </Text>
        <Text style={styles.finalUnit} {...textScale.dense}>
          {`${T.shots} atışta ${score} gol`}
        </Text>

        <SubmitLine state={submit} onRetry={onRetrySubmit} onSignIn={onSignIn} />

        <Button label="Yeni seri" icon="refresh" size="lg" fullWidth onPress={onRestart} />
        <Touchable feedback="button" haptic="none" onPress={onBoard} style={styles.linkRow}>
          <Text style={styles.linkText} {...textScale.dense}>
            Rekor tablosunu gör
          </Text>
          <Ionicons name="chevron-forward" size={13} color={colors.brandAccent} />
        </Touchable>
        <Text style={styles.cardBestText} {...textScale.dense}>
          {best > 0 ? `Rekorun ${best} gol` : " "}
        </Text>
      </View>
    </View>
  );
});

/**
 * Skorun sunucuya gidişi — tek satır. Her durum NE OLDUĞUNU ve NE YAPILACAĞINI
 * söyler; "bir şeyler ters gitti" yok.
 */
const SubmitLine = memo(function SubmitLine({
  state,
  onRetry,
  onSignIn,
}: {
  state: SubmitState;
  onRetry: () => void;
  onSignIn: () => void;
}) {
  if (state === "idle" || state === "sent") return null;

  if (state === "sending") {
    return (
      <Text style={styles.submitText} {...textScale.dense}>
        Skorun kaydediliyor…
      </Text>
    );
  }

  if (state === "guest") {
    return (
      <Touchable feedback="button" haptic="none" onPress={onSignIn} style={styles.linkRow}>
        <Text style={styles.submitText} {...textScale.dense}>
          Skorun tabloya yazılsın mı? Giriş yap
        </Text>
      </Touchable>
    );
  }

  return (
    <Touchable feedback="button" haptic="none" onPress={onRetry} style={styles.linkRow}>
      <Text style={styles.submitText} {...textScale.dense}>
        Skor gönderilemedi — bağlantını kontrol edip tekrar dene
      </Text>
    </Touchable>
  );
});

/* ================================ STİLLER ================================ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  /* — HUD — */
  hud: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.m,
  },
  hudLeft: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm,
  },
  hudLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  hudScore: {
    ...type.scoreLg,
    color: colors.textPrimary,
  },
  hudRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  hudPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  hudPillText: {
    ...type.tableNumStrong,
    color: colors.textSecondary,
  },
  /* Seri tablosu: klasik penaltı noktaları. */
  series: {
    flexDirection: "row",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.s,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  seriesDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
  },
  seriesDotGoal: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  seriesDotMiss: {
    backgroundColor: colors.surface3,
  },

  /* — Saha — */
  pitch: {
    flex: 1,
    margin: layout.screenPadding,
    marginTop: 0,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...elevate(2),
    borderWidth: 0,
    // Sahne çizilene kadar gece göğü — beyaz bir kare parlamasın.
    backgroundColor: colors.inkBlock,
  },

  /* — Sonuç etiketi — */
  outcome: {
    position: "absolute",
    alignSelf: "center",
    top: "47%",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    ...elevate(3),
    borderWidth: 0,
  },
  outcomeGoal: {
    backgroundColor: colors.brand,
  },
  /* DAİMA KOYU: üstündeki metin `onDark` (beyaz). `inverse` koyu temada
     açık bir yüzey olduğu için "kurtardı" etiketi orada okunmuyordu. */
  outcomeMiss: {
    backgroundColor: colors.inkBlock,
  },
  /*
   * HATA DÜZELTMESİ: etiket iki zeminde de `textOnBrand` (mürekkep) yazıyordu.
   * "Gol" mercan dolgu üstünde okunuyordu ama "kaçtı"/"kurtardı" MÜREKKEP
   * dolgu üstünde mürekkeple yazılıyor, yani görünmüyordu — kullanıcı sonucu
   * hiç okuyamıyordu.
   */
  outcomeText: {
    ...type.h1,
    fontFamily: fonts.bold,
    letterSpacing: 1,
  },
  outcomeTextGoal: {
    color: colors.textOnBrand,
  },
  outcomeTextMiss: {
    color: colors.onDark,
  },

  /* — Kartlar — */
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.xl,
  },
  cardOverline: {
    ...type.overline,
    color: colors.textTertiary,
  },
  cardTitle: {
    ...type.h1,
    color: colors.textPrimary,
  },
  cardRule: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
  },
  cardBest: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  cardBestText: {
    ...type.caption,
    color: colors.textTertiary,
  },
  recordBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  recordText: {
    ...type.overline,
    color: colors.textOnBrand,
  },
  finalScore: {
    ...type.scoreHero,
    color: colors.textPrimary,
  },
  finalUnit: {
    ...type.caption,
    color: colors.textTertiary,
  },
  submitText: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  linkText: {
    ...type.label,
    color: colors.brandAccent,
  },
});
