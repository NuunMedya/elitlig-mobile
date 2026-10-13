/**
 * SLALOM — basılan noktanın yatay konumunun yön hızını belirlediği koşu.
 *
 * KONTROL EĞRİSİ (brief §5.3 birebir):
 *
 *     n        = clamp((touchX - centerX) / (width / 2), -1, 1)
 *     steer    = sign(n) * |n|^1.7        ← merkez hassas, kenar agresif
 *     targetVx = steer * MAX_LATERAL
 *     vx       = approach(vx, targetVx, accel, decel, dt)
 *
 * Ortaya yakın basmak milimetrik düzeltme, kenara basmak sert kaçış verir.
 * `approach` momentum ekler: yön değiştirmenin ağırlığı var, ışınlanma yok.
 * PARMAK EKRANDA KALDIĞI SÜRECE OKUNUR — sadece basma anı değil.
 *
 * DESENLER RASTGELE DEĞİL: koni dizilimi tasarlanmış altı desenden dönüşümlü
 * gelir ve mesafeyle sıkışır. Oyuncu deseni öğrenir, öğrendiği için hızlanır.
 *
 * ÇARPIŞMA OYUNU BİTİRMEZ: hız düşer, combo sıfırlanır, kısa bir
 * dokunulmazlık verilir (yanıp sönme değil opaklık düşüşü). Üç çarpışmada
 * tur biter.
 *
 * GÖRSEL — YENİDEN YAPILDI. Eski pist düz yeşil bir zemin, iki çizgi, kırmızı
 * üçgenler ve ortasında nokta olan bir daireydi; zemin şeritleri konilerden
 * farklı hızda aktığı için hareket "kayıyor" gibi görünüyordu. Şimdi:
 *   · Gece antrenmanı: projektör kuleleri, ufukta stadyum silüeti, sis.
 *   · Perspektifli çim: biçme şeritleri, kesikli orta çizgi ve her 100
 *     metrede bir boyanmış mesafe çizgisi — HEPSİ konilerle aynı hızda akar
 *     (tek bir dünya ölçeği: 1 derinlik birimi = 90 metre).
 *   · Arkadan görünen oyuncu: koşu döngüsü, kol salınımı, dönüşte gövde yatar;
 *     önündeki gerçek 3B desenli top ileri yuvarlanır.
 *   · Turuncu antrenman konileri: yansıtıcı bant, taban, gölge. Çarpılan koni
 *     devrilip savrulur; sıyrılan koninin etrafında yeşil hale ve "+N" yazısı.
 *   · Koniler oyuncunun yanından geçip ekranın altından çıkar — kaybolmaz.
 *   · Hız arttıkça kenarlarda hız çizgileri; çarpışmada kırmızı parlama ve
 *     sarsıntı (yerel sürücüde).
 *
 * AKICILIK — KATMANLAR. Gökyüzü/stadyum ve sis/vinyet statik `<Svg>`
 * katmanlarıdır, bir kez çizilir. Döngü yalnız DÜNYA katmanını bir kare
 * sinyaliyle uyandırır; başlık, HUD ve kartlar her karede render almaz. HUD
 * mesafesi yalnız metre değiştiğinde güncellenir.
 *
 * NEDEN HAM `PanResponder`: kontrol sürekli konum okumasıdır; `Touchable`'ın
 * ölçek animasyonu ve haptik gecikmesi araya girseydi oyun hantallaşırdı.
 *
 * PAYLAŞIM KARTI SABİT KOYU PALETTEN: kart görüntü olarak dışarı çıkar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Animated, Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import ViewShot, { captureRef } from "react-native-view-shot";

import { Cone, FigureDefs, RunnerBack } from "@/components/game/Figures";
import { BallDefs, SoccerBall } from "@/components/game/SoccerBall";
import {
  Badge,
  Button,
  ScreenHeader,
  Touchable,
  useReduceMotion,
  useToast,
  withAlpha,
} from "@/components/ui";
import { submitArenaScore } from "@/lib/api/arena";
import { art } from "@/lib/game/art";
import { useHoldGesture } from "@/lib/game/input";
import { approach, clamp, useGameLoop } from "@/lib/game/loop";
import { useFrameSignal, useOnFrame, useSignalValue, type FrameSignal } from "@/lib/game/signal";
import { initialOrientation, rotate, type Orientation } from "@/lib/game/sphere";
import { TUNING } from "@/lib/game/tuning";
import { instagramUrl } from "@/lib/socials";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  dark as inkPalette,
  elevate,
  fonts,
  hairline,
  haptics,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

/* ============================ SABİTLER VE TİPLER ============================ */

const BEST_KEY = "elitlig.slalom.best.v2";
const T = TUNING.slalom;

/** Oyuncunun sabit dikey konumu (kadraj payı). */
const PLAYER_Y = 0.8;
/** Ufuk çizgisinin yüksekliği — perspektif buradan yakınsar. */
const HORIZON = 0.3;
/** Çarpışma yarıçapı (piksel) — oynanış eski sürümle birebir aynı kalır. */
const PLAYER_R = 15;
/** Koridor kenarının koridor koordinatındaki yeri (oyuncu tavanı 1.0). */
const EDGE = 1.2;
/** Bir derinlik birimi kaç metre: zemin, çizgiler ve koniler AYNI ölçekte akar. */
const METRES_PER_Z = 90;
/** Oyuncu figürünün boyu, tuval yüksekliğinin payı. */
const RUNNER_H = 0.15;
/** Koninin oyuncu düzlemindeki boyu (piksel). */
const CONE_PX = 46;

/**
 * TASARLANMIŞ DESENLER — her biri bir "kapı dizisi".
 *
 * Değerler koridor genişliğine göre -1..1 arası yatay konumlardır. Rastgele
 * üretim yerine bunlar dönüşümlü gelir; oyuncu deseni tanır, tanıdığı için
 * daha hızlı gitmeye cesaret eder ve oyun bir beceriye dönüşür.
 */
const PATTERNS: number[][] = [
  [-0.55, 0.55, -0.55, 0.55],        // zikzak
  [0, -0.7, 0, 0.7],                 // merkezden savrulan
  [-0.8, -0.3, 0.3, 0.8],            // merdiven
  [0.6, 0.6, -0.6, -0.6],            // ikişerli blok
  [-0.2, 0.75, -0.75, 0.2],          // geniş salınım
  [0, 0.45, -0.45, 0],               // dar süzülme
];

type Phase = "ready" | "playing" | "over";

/** Akıştaki tek koni. `z` 1 (ufuk) → 0 (oyuncu) → negatif (ekranın altı). */
interface ConeState {
  id: number;
  /** Koridor içindeki yatay konum, -1..1. */
  lane: number;
  z: number;
  /** Sıyırma bonusu bir kez verilir; anı hale efekti için saklanır. */
  grazed: boolean;
  grazedAt: number;
  /** Çarpışma bir kez sayılır; anı devrilme animasyonu içindir. */
  hit: boolean;
  hitAt: number;
  /** Devrilme yönü: oyuncunun karşı tarafına. */
  hitDir: number;
}

/** "+N" yazısı — sıyırılan koninin üstünden yükselir. */
interface Floater {
  x: number;
  y: number;
  age: number;
  text: string;
}

type SubmitState = "idle" | "guest" | "sending" | "sent" | "failed";

/* ================================= EKRAN ================================= */

export default function SlalomScreen() {
  const router = useRouter();
  const scope = useScope();
  const auth = useAuth();
  const reduceMotion = useReduceMotion();

  const [phase, setPhase] = useState<Phase>("ready");
  /** Tur sonunda dondurulan skor — kartlar ve paylaşım bunu gösterir. */
  const [distance, setDistance] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lives, setLives] = useState<number>(T.lives);
  const [best, setBest] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const signal = useFrameSignal();
  const area = useRef({ w: 0, h: 0 });
  area.current = size;
  const phaseRef = useRef<Phase>("ready");

  /* — Kontrol — */
  /** Parmağın ekrandaki yatay konumu; null = parmak kalkmış. */
  const touchX = useRef<number | null>(null);
  /** Kontrol eğrisinin çıktısı, -1..1. Gövde yatması ve kamera bundan gelir. */
  const steer = useRef(0);
  /** Oyuncunun yatay hızı (px/sn) ve koridordaki konumu (-1..1). */
  const vx = useRef(0);
  const lane = useRef(0);

  /* — Dünya — */
  const cones = useRef<ConeState[]>([]);
  const floaters = useRef<Floater[]>([]);
  const coneId = useRef(0);
  const patternIndex = useRef(0);
  const patternStep = useRef(0);
  const spawnTimer = useRef(0);
  const speed = useRef<number>(T.baseSpeed);
  const travelled = useRef(0);
  const comboRef = useRef(0);
  const livesRef = useRef<number>(T.lives);
  const invulnerable = useRef(0);
  const clock = useRef(0);
  /** Koşu döngüsünün fazı (radyan) — adım sıklığı hızla artar. */
  const stride = useRef(0);
  const ball = useRef<Orientation>(initialOrientation());

  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [shareOpen, setShareOpen] = useState(false);

  /* Çarpışma: kırmızı parlama ve sarsıntı — yerel sürücüde. */
  const flash = useRef(new Animated.Value(0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY).then((value) => setBest(Number(value) || 0));
  }, []);

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  /* ─────────────────────────── skor gönderimi ─────────────────────────── */

  const submitScore = (value: number) => {
    if (value <= 0) {
      setSubmit("idle");
      return;
    }
    if (!auth.user) {
      setSubmit("guest");
      return;
    }
    setSubmit("sending");
    submitArenaScore("slalom", value)
      .then(() => setSubmit("sent"))
      .catch(() => setSubmit("failed"));
  };

  const gameOver = () => {
    if (phaseRef.current === "over") return;
    setPhaseBoth("over");
    const finished = Math.round(travelled.current);
    setDistance(finished);
    submitScore(finished);
    if (finished > 0) {
      setBest((current) => {
        if (finished <= current) return current;
        void AsyncStorage.setItem(BEST_KEY, String(finished));
        return finished;
      });
    }
    haptics.warning();
  };

  const resetRound = () => {
    touchX.current = null;
    steer.current = 0;
    vx.current = 0;
    lane.current = 0;
    cones.current = [];
    floaters.current = [];
    patternIndex.current = 0;
    patternStep.current = 0;
    spawnTimer.current = 0;
    speed.current = T.baseSpeed;
    travelled.current = 0;
    comboRef.current = 0;
    livesRef.current = T.lives;
    invulnerable.current = 0;
    stride.current = 0;
    setDistance(0);
    setCombo(0);
    setLives(T.lives);
    signal.emit();
  };

  const crashFeedback = () => {
    if (reduceMotion) return;
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 420, useNativeDriver: true }).start();
    Animated.sequence(
      [7, -6, 4, -2, 0].map((toValue) =>
        Animated.timing(shakeX, { toValue, duration: 45, useNativeDriver: true }),
      ),
    ).start();
  };

  /* ─────────────────────────── fizik adımı ─────────────────────────── */

  const step = (dt: number) => {
    if (phaseRef.current !== "playing") return;
    const { w, h } = area.current;
    if (w <= 0) return;
    clock.current += dt;

    /* KONTROL EĞRİSİ — briefin verdiği model birebir. */
    const centerX = w / 2;
    const n =
      touchX.current == null ? 0 : clamp((touchX.current - centerX) / (w / 2), -1, 1);
    steer.current = Math.sign(n) * Math.abs(n) ** T.steerExp;

    const targetVx = steer.current * T.maxLateral;
    vx.current = approach(vx.current, targetVx, T.accel, T.decel, dt);

    // Koridor koordinatı: yarı genişlik 1 birim.
    lane.current = clamp(lane.current + (vx.current * dt) / (w / 2), -1, 1);
    // Kenara yaslanınca hız sıfırlanır; duvara yapışıp kaymak olmasın.
    if (Math.abs(lane.current) >= 1) vx.current = 0;

    /* İLERLEME — mesafeyle hızlanır ama tavanı vardır. */
    speed.current = Math.min(T.maxSpeed, T.baseSpeed + travelled.current * T.speedGrowth);
    travelled.current += (speed.current * dt) / 10;
    invulnerable.current = Math.max(0, invulnerable.current - dt);

    /* Görsel ritim: adım sıklığı ve topun yuvarlanması hızdan gelir. */
    stride.current += dt * (7 + speed.current / 55);
    rotate(ball.current, [1, 0, 0], -(speed.current / 32) * dt);
    rotate(ball.current, [0, 1, 0], (vx.current / 60) * dt);

    for (let i = floaters.current.length - 1; i >= 0; i -= 1) {
      const f = floaters.current[i];
      f.age += dt;
      if (f.age > 0.9) floaters.current.splice(i, 1);
    }

    /* ÜRETİM — desenden sıradaki kapı. Aralık hızla kısalır ki kapılar
       mesafede sıkışsın; ama alt sınır var, oyun boğulmaz. */
    const interval = Math.max(0.34, 0.9 - travelled.current * 0.0009);
    spawnTimer.current -= dt;
    if (spawnTimer.current <= 0) {
      spawnTimer.current = interval;
      const pattern = PATTERNS[patternIndex.current % PATTERNS.length];
      const spread =
        T.gateWide - (T.gateWide - T.gateNarrow) * clamp(travelled.current / 900, 0, 1);
      coneId.current += 1;
      cones.current.push({
        id: coneId.current,
        lane: clamp(pattern[patternStep.current] * (1 / T.gateWide) * spread, -0.92, 0.92),
        z: 1,
        grazed: false,
        grazedAt: 0,
        hit: false,
        hitAt: 0,
        hitDir: 1,
      });
      patternStep.current += 1;
      if (patternStep.current >= pattern.length) {
        patternStep.current = 0;
        patternIndex.current += 1;
      }
    }

    /* KONİLER — ufuktan oyuncuya akar, yanından geçip ekranın altından çıkar. */
    const flow = (speed.current / 900) * dt;
    for (const cone of cones.current) {
      cone.z -= flow;

      // Oyuncu düzlemine geldiğinde çarpışma/sıyırma sınanır.
      if (cone.hit || cone.z > 0.14 || cone.z < -0.05) continue;

      const gap = Math.abs(cone.lane - lane.current) * (w / 2);
      if (gap < PLAYER_R + 12) {
        cone.hit = true;
        cone.hitAt = clock.current;
        cone.hitDir = cone.lane >= lane.current ? 1 : -1;
        if (invulnerable.current <= 0) {
          /* ÇARPIŞMA: oyun BİTMEZ. Hız düşer, combo sıfırlanır, kısa bir
             dokunulmazlık verilir. Tek çarpmada bitirmek, öğrenmeyi
             cezalandırıyordu. */
          speed.current *= T.crashSpeedKeep;
          travelled.current = Math.max(0, travelled.current - 20);
          comboRef.current = 0;
          setCombo(0);
          invulnerable.current = T.invulnerable;
          livesRef.current -= 1;
          setLives(livesRef.current);
          haptics.error();
          crashFeedback();
          if (livesRef.current <= 0) {
            gameOver();
            return;
          }
        }
      } else if (!cone.grazed && gap < PLAYER_R + 12 + T.grazeDistance) {
        /* SIYIRMA: riski ödüllendirir. Koniden uzak durmak güvenlidir ama
           puan getirmez; oyunun gerilimi bu tercihten gelir. */
        cone.grazed = true;
        cone.grazedAt = clock.current;
        comboRef.current += 1;
        setCombo(comboRef.current);
        travelled.current += comboRef.current;
        const p = project(cone.z, h);
        floaters.current.push({
          x: laneX(cone.lane, w, p.scale, -steer.current * T.cameraShift),
          y: p.y - CONE_PX * p.scale,
          age: 0,
          text: `+${comboRef.current}`,
        });
        haptics.light();
      }
    }

    cones.current = cones.current.filter((cone) => cone.z > -0.32);
  };

  const render = () => signal.emit();
  useGameLoop({ step, render, running: phase === "playing" });

  /* ─────────────────────────── girdi ─────────────────────────── */

  const gesture = useHoldGesture({
    enabled: phase === "playing",
    onHold: (x) => {
      touchX.current = x;
    },
    // Parmak kalkınca hedef sıfırlanır: oyuncu yumuşakça merkezlenir.
    onRelease: () => {
      touchX.current = null;
    },
  });

  const start = () => {
    resetRound();
    setSubmit("idle");
    setPhaseBoth("playing");
  };

  const restart = () => {
    resetRound();
    setSubmit("idle");
    setPhaseBoth("ready");
  };

  const isRecord = distance > 0 && distance >= best;
  const openBoard = () => router.push({ pathname: "/siralama", params: { game: "slalom" } });
  const openSignIn = () => router.push("/giris");

  const headerActions = useMemo(
    () => [
      { icon: "trophy-outline" as const, onPress: openBoard, accessibilityLabel: "Rekor tablosu" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const world = {
    steer,
    lane,
    cones,
    floaters,
    speed,
    travelled,
    invulnerable,
    clock,
    stride,
    ball,
  };

  const { w, h } = size;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Slalom"
        overline={upperTR("Elitlig Arena")}
        subtitle="Ortaya bas hassas dön, kenara bas sert kaç"
        back
        actions={headerActions}
      />

      {/* HUD: mesafe solda, combo ve kalan hak sağda. */}
      <View style={styles.hud}>
        <View style={styles.hudScoreBox}>
          <Text style={styles.hudLabel} {...textScale.badge}>
            {upperTR("Metre")}
          </Text>
          <LiveMetres signal={signal} travelled={travelled} />
        </View>

        <View style={styles.hudRight}>
          <View style={styles.hudPill}>
            <Ionicons name="trophy" size={11} color={colors.star} />
            <Text style={styles.hudPillText} {...textScale.badge}>
              {best}
            </Text>
          </View>
          {combo > 0 ? (
            <View style={[styles.hudPill, styles.hudPillLive]}>
              <Text style={styles.hudPillLiveText} {...textScale.badge}>
                {`${combo}× sıyırma`}
              </Text>
            </View>
          ) : null}
          <View style={styles.hudPill}>
            {Array.from({ length: T.lives }, (_, i) => (
              <View key={i} style={[styles.life, i < lives && styles.lifeFull]} />
            ))}
          </View>
        </View>
      </View>

      <View
        style={styles.arena}
        {...gesture.panHandlers}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Slalom pisti"
        accessibilityHint="Ekrana basılı tut. Ortaya yakın basmak hassas, kenara basmak sert döndürür."
      >
        {w > 0 && h > 0 ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, { transform: [{ translateX: shakeX }] }]}
            pointerEvents="none"
          >
            <Scenery w={w} h={h} />
            <WorldLayer w={w} h={h} signal={signal} world={world} />
            <Atmosphere w={w} h={h} />
          </Animated.View>
        ) : null}

        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.crashFlash, { opacity: flash }]}
        />

        {phase === "ready" ? <StartOverlay best={best} onStart={start} /> : null}

        {phase === "over" ? (
          <ResultOverlay
            score={distance}
            best={best}
            isRecord={isRecord}
            submit={submit}
            onRetrySubmit={() => submitScore(distance)}
            onSignIn={openSignIn}
            onRestart={restart}
            onBoard={openBoard}
            onShare={() => setShareOpen(true)}
          />
        ) : null}
      </View>

      <ShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        score={distance}
        isRecord={isRecord}
        cityLabel={scope.cityLabel}
      />
    </SafeAreaView>
  );
}

/** HUD mesafesi — yalnız metre değiştiğinde yeniden çizilir. */
function LiveMetres({
  signal,
  travelled,
}: {
  signal: FrameSignal;
  travelled: MutableRefObject<number>;
}) {
  const metres = useSignalValue(signal, () => Math.round(travelled.current));
  return (
    <Text style={styles.hudScore} {...textScale.dense}>
      {metres}
    </Text>
  );
}

/* ============================== PERSPEKTİF ============================== */

/**
 * Bir `z` derinliğinin ekrandaki y'si ve ölçeği. z=1 ufuk, z=0 oyuncu
 * düzlemi; negatif z oyuncunun önü (ekranın altı) — koniler oradan çıkar.
 * Kare eğri derinliği hızlandırır: uzaktakiler yavaş, yakındakiler hızlı büyür.
 */
function project(z: number, h: number): { y: number; scale: number } {
  const t = clamp(1 - z, 0, 1.4);
  const y = h * HORIZON + (h * PLAYER_Y - h * HORIZON) * t * t;
  const scale = 0.06 + t * t * 0.94;
  return { y, scale };
}

/** Bir koridor konumunun (-1..1) ekrandaki x'i. */
function laneX(lane: number, w: number, scale: number, shift: number): number {
  // 0.84: oyuncu en uçta (lane = ±1) bile gövdesiyle birlikte kadrajda kalır.
  return w / 2 + lane * (w / 2) * scale * 0.84 + shift * scale;
}

/* ========================== 1 · GÖKYÜZÜ VE STADYUM ========================== */

/**
 * Ufuk ve çimin taban rengi — bir kez çizilir. Projektör kuleleri, uzaktaki
 * stadyumun ışıklı silüeti ve ufuk parıltısı; pist bunun önünde akar.
 */
const Scenery = memo(function Scenery({ w, h }: { w: number; h: number }) {
  const horizon = h * HORIZON;
  const towers = [0.08, 0.3, 0.7, 0.92];
  const standTop = horizon - h * 0.07;

  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="slSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={art.skyTop} />
          <Stop offset="0.75" stopColor={art.skyBottom} />
          <Stop offset="1" stopColor={art.skyGlow} />
        </LinearGradient>
        <LinearGradient id="slGrass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={art.grassFar} />
          <Stop offset="1" stopColor={art.grassNear} />
        </LinearGradient>
        <RadialGradient id="slFlood" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={art.floodlight} stopOpacity={0.6} />
          <Stop offset="1" stopColor={art.floodlight} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      <Rect x={0} y={0} width={w} height={horizon + 1} fill="url(#slSky)" />
      {/* Yıldızlar: seyrek, sabit. */}
      {Array.from({ length: 26 }, (_, i) => {
        const x = ((i * 137.5) % 100) / 100;
        const y = ((i * 61.8) % 100) / 100;
        return (
          <Circle key={i} cx={x * w} cy={y * standTop * 0.7} r={i % 5 === 0 ? 1.2 : 0.7} fill={art.white} opacity={0.25 + (i % 3) * 0.15} />
        );
      })}

      {/* Uzak stadyum silüeti ve ışıklı kenarı */}
      <Path
        d={`M 0 ${horizon} L 0 ${standTop + 10} Q ${w * 0.25} ${standTop - 4} ${w * 0.5} ${standTop - 6}
            Q ${w * 0.75} ${standTop - 4} ${w} ${standTop + 10} L ${w} ${horizon} Z`}
        fill={art.standBack}
      />
      <Path
        d={`M 0 ${standTop + 10} Q ${w * 0.25} ${standTop - 4} ${w * 0.5} ${standTop - 6} Q ${w * 0.75} ${standTop - 4} ${w} ${standTop + 10}`}
        stroke={art.boardAccent}
        strokeWidth={1.2}
        opacity={0.5}
        fill="none"
      />
      {Array.from({ length: Math.round(w / 9) }, (_, i) => (
        <Circle
          key={i}
          cx={i * 9 + 4}
          cy={standTop + 6 + ((i * 7) % 5) * 2.2}
          r={0.9}
          fill={art.crowd[i % art.crowd.length]}
          opacity={0.55}
        />
      ))}

      {/* Projektör kuleleri */}
      {towers.map((fx, i) => {
        const x = fx * w;
        const top = standTop - h * (i === 0 || i === 3 ? 0.13 : 0.1);
        return (
          <G key={i}>
            <Path d={`M ${x - 1.6} ${horizon} L ${x - 0.8} ${top} L ${x + 0.8} ${top} L ${x + 1.6} ${horizon} Z`} fill={art.tower} />
            <Ellipse cx={x} cy={top} rx={w * 0.12} ry={h * 0.05} fill="url(#slFlood)" />
            <Rect x={x - 8} y={top - 5} width={16} height={7} rx={1.5} fill={art.floodlightCore} />
          </G>
        );
      })}

      {/* Ufuk parıltısı */}
      <Rect x={0} y={horizon - 3} width={w} height={3} fill={art.floodlight} opacity={0.18} />

      {/* Çim tabanı */}
      <Rect x={0} y={horizon} width={w} height={h - horizon} fill="url(#slGrass)" />
    </Svg>
  );
});

/** Ufuk sisi ve köşe karartması — uzak koniler sisten çıkar. Statik. */
const Atmosphere = memo(function Atmosphere({ w, h }: { w: number; h: number }) {
  const horizon = h * HORIZON;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="slFog" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={art.skyGlow} stopOpacity={0.42} />
          <Stop offset="1" stopColor={art.skyGlow} stopOpacity={0} />
        </LinearGradient>
        <RadialGradient id="slVig" cx="50%" cy="58%" r="78%">
          <Stop offset="0.55" stopColor={art.outline} stopOpacity={0} />
          <Stop offset="1" stopColor={art.outline} stopOpacity={0.6} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={horizon} width={w} height={h * 0.09} fill="url(#slFog)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#slVig)" />
    </Svg>
  );
});

/* ============================== 2 · DÜNYA ============================== */

interface WorldRefs {
  steer: MutableRefObject<number>;
  lane: MutableRefObject<number>;
  cones: MutableRefObject<ConeState[]>;
  floaters: MutableRefObject<Floater[]>;
  speed: MutableRefObject<number>;
  travelled: MutableRefObject<number>;
  invulnerable: MutableRefObject<number>;
  clock: MutableRefObject<number>;
  stride: MutableRefObject<number>;
  ball: MutableRefObject<Orientation>;
}

/**
 * Her karede çizilen tek katman: zemin deseni, çizgiler, koniler, oyuncu,
 * efektler. Bütün hareket TEK dünya ölçeğinden türer — metre → z.
 */
function WorldLayer({
  w,
  h,
  signal,
  world,
}: {
  w: number;
  h: number;
  signal: FrameSignal;
  world: WorldRefs;
}) {
  useOnFrame(signal);

  const steer = world.steer.current;
  const metres = world.travelled.current;
  const speed = world.speed.current;
  const now = world.clock.current;
  // Kamera karşı kayar (parallax): sağa dönerken dünya sola akar.
  const shift = -steer * T.cameraShift * 1.8;
  // Hız arttıkça yatay ölçek %4 açılır — FOV genişleme hissi.
  const fov = 1 + clamp((speed - T.baseSpeed) / (T.maxSpeed - T.baseSpeed), 0, 1) * 0.04;
  const zOf = (m: number) => (m - metres) / METRES_PER_Z;
  const X = (l: number, s: number) => laneX(l, w, s * fov, shift);

  /* Biçme şeritleri: her 10 metrede bir, 5 metre açık. */
  const stripes: string[] = [];
  for (let m = Math.floor((metres - 30) / 10) * 10; m < metres + METRES_PER_Z; m += 10) {
    const z1 = zOf(m);
    const z2 = zOf(m + 5);
    if (z2 < -0.4 || z1 > 1) continue;
    const a = project(Math.min(1, z1), h);
    const b = project(Math.min(1, z2), h);
    stripes.push(`M0 ${a.y.toFixed(1)}H${w}V${b.y.toFixed(1)}H0Z`);
  }

  /* Koridor ve kenar çizgileri: ince uzakta, kalın yakında (dörtgen). */
  const far = project(1, h);
  const near = project(-0.4, h);
  const edge = (side: number) => {
    const wf = 0.6;
    const wn = 4.5;
    return `M${X(side * EDGE, far.scale) - wf} ${far.y}L${X(side * EDGE, far.scale) + wf} ${far.y}L${X(side * EDGE, near.scale) + wn} ${near.y}L${X(side * EDGE, near.scale) - wn} ${near.y}Z`;
  };
  const corridor = `M${X(-EDGE, far.scale)} ${far.y}L${X(EDGE, far.scale)} ${far.y}L${X(EDGE, near.scale)} ${near.y}L${X(-EDGE, near.scale)} ${near.y}Z`;

  /* Kesikli orta çizgi: 6 metrede bir 3 metrelik boya. */
  const dashes: string[] = [];
  for (let m = Math.floor((metres - 30) / 6) * 6; m < metres + METRES_PER_Z; m += 6) {
    const z1 = zOf(m);
    const z2 = zOf(m + 3);
    if (z2 < -0.4 || z1 > 1) continue;
    const a = project(Math.min(1, z1), h);
    const b = project(Math.min(1, z2), h);
    const wa = 2.4 * a.scale;
    const wb = 2.4 * b.scale;
    dashes.push(
      `M${X(0, a.scale) - wa} ${a.y}L${X(0, a.scale) + wa} ${a.y}L${X(0, b.scale) + wb} ${b.y}L${X(0, b.scale) - wb} ${b.y}Z`,
    );
  }

  /* 100 metre çizgileri ve boyalı sayılar. */
  const markers = [];
  for (let m = Math.ceil((metres - 20) / 100) * 100; m < metres + METRES_PER_Z; m += 100) {
    if (m <= 0) continue;
    const z = zOf(m);
    if (z < -0.35 || z > 0.97) continue;
    const p = project(z, h);
    const lw = Math.max(0.6, 5 * p.scale * p.scale);
    markers.push(
      <G key={m}>
        <Rect x={X(-EDGE, p.scale)} y={p.y - lw / 2} width={X(EDGE, p.scale) - X(-EDGE, p.scale)} height={lw} fill={art.chalk} opacity={0.75} />
        <SvgText
          x={X(-0.62, p.scale)}
          y={p.y - 6 * p.scale}
          fontSize={Math.max(4, 30 * p.scale)}
          fontFamily={fonts.bold}
          fill={art.chalk}
          opacity={0.55}
          textAnchor="middle"
        >
          {m}
        </SvgText>
      </G>,
    );
  }

  /* Koniler: uzaktan yakına (ressam sırası). */
  const ordered = [...world.cones.current].sort((a, b) => b.z - a.z);
  const playerY = h * PLAYER_Y;
  const coneNodes = (list: ConeState[]) =>
    list.map((cone) => {
      const p = project(cone.z, h);
      if (p.scale < 0.07) return null;
      let x = X(cone.lane, p.scale);
      let y = p.y;
      let rotation = 0;
      let opacity = Math.min(1, (1 - cone.z) * 6);
      if (cone.hit) {
        // Devrilip savrulur ve solar.
        const age = now - cone.hitAt;
        rotation = cone.hitDir * Math.min(95, age * 520);
        x += cone.hitDir * age * 190 * p.scale;
        y -= Math.sin(Math.min(Math.PI, age * 7)) * 22 * p.scale;
        opacity *= Math.max(0, 1 - age / 0.8);
        if (opacity <= 0) return null;
      }
      const glow = cone.grazed ? Math.max(0, 1 - (now - cone.grazedAt) / 0.5) : 0;
      return (
        <Cone
          key={cone.id}
          x={x}
          y={y}
          scale={(CONE_PX * p.scale) / 100}
          rotation={rotation}
          opacity={opacity}
          glow={glow}
        />
      );
    });
  // Oyuncunun ARKASINDAKİLER önce, önüne geçenler (ekranın altı) sonra çizilir.
  const behind = ordered.filter((c) => project(c.z, h).y <= playerY);
  const front = ordered.filter((c) => project(c.z, h).y > playerY);

  /* Oyuncu ve top */
  const px = X(world.lane.current, 1);
  const scale = (h * RUNNER_H) / 100;
  const phase = world.stride.current;
  const touch = Math.abs(Math.sin(phase));
  const ballR = 8 * scale;
  const ballX = px + 10 * scale + steer * 6 * scale;
  const ballY = playerY - 8 * scale - touch * 5 * scale;
  const faded = world.invulnerable.current > 0;

  /* Hız çizgileri: kenarlarda, hızla belirginleşir. */
  const intensity = clamp((speed - T.baseSpeed) / (T.maxSpeed - T.baseSpeed), 0, 1);
  const streaks = [];
  if (intensity > 0.08) {
    for (let i = 0; i < 8; i += 1) {
      const side = i % 2 ? 1 : -1;
      const lane = side * (1.45 + (i % 4) * 0.22);
      const z = 1 - (((metres * 0.9 + i * 37) % 120) / 120) * 1.3;
      const a = project(z, h);
      const b = project(z - 0.12, h);
      streaks.push(
        <Path
          key={i}
          d={`M${X(lane, a.scale)} ${a.y}L${X(lane, b.scale)} ${b.y}`}
          stroke={art.white}
          strokeWidth={1 + b.scale * 1.5}
          strokeLinecap="round"
          opacity={intensity * 0.45}
        />,
      );
    }
  }

  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <FigureDefs />
        <BallDefs />
      </Defs>

      {stripes.length ? <Path d={stripes.join("")} fill={art.grassLight} opacity={0.05} /> : null}
      <Path d={corridor} fill={art.grassLight} opacity={0.035} />
      <Path d={`${edge(-1)}${edge(1)}`} fill={art.chalk} opacity={0.85} />
      {dashes.length ? <Path d={dashes.join("")} fill={art.chalk} opacity={0.45} /> : null}
      {markers}
      {streaks}

      {coneNodes(behind)}

      {/* Top oyuncunun önünde, biraz sağında — bacakların arkasından görünür. */}
      <Ellipse cx={ballX + ballR * 0.3} cy={ballY + ballR * 0.85} rx={ballR} ry={ballR * 0.3} fill={art.shadow} opacity={faded ? 0.15 : 0.35} />
      <SoccerBall cx={ballX} cy={ballY} r={ballR} orientation={world.ball.current} opacity={faded ? 0.45 : 1} />
      <RunnerBack
        x={px}
        y={playerY}
        scale={scale}
        phase={phase}
        tilt={steer * T.tilt}
        opacity={faded ? 0.45 : 1}
      />

      {coneNodes(front)}

      {world.floaters.current.map((f, i) => (
        <SvgText
          key={i}
          x={f.x}
          y={f.y - f.age * 46}
          fontSize={20}
          fontFamily={fonts.bold}
          fill={art.gold}
          stroke={art.outline}
          strokeWidth={1}
          textAnchor="middle"
          opacity={Math.max(0, 1 - f.age / 0.9)}
        >
          {f.text}
        </SvgText>
      ))}
    </Svg>
  );
}

/* ============================== GİRİŞ KARTI ============================== */

/**
 * `box-none`: katmanın kendisi dokunuşu yutmaz; kartın DIŞINA basmak alttaki
 * kontrol yarılarına düşer ve oyunu başlatır. Kartın üstünde ise tek bir
 * belirgin eylem vardır — "Başla".
 */
function StartOverlay({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.startCard}>
        <View style={styles.startIcon}>
          <Ionicons name="flag" size={22} color={colors.warn} />
        </View>

        <Text style={styles.startOverline} {...textScale.badge}>
          {upperTR("Elitlig Arena")}
        </Text>
        <Text style={styles.startTitle} {...textScale.dense}>
          Slalom
        </Text>
        <Text style={styles.startRule} {...textScale.long}>
          Ekrana basılı tut: parmağın nerede duruyorsa oraya dönersin. Ortaya yakın basmak
          hassas, kenara basmak sert döndürür. Koniyi sıyırıp geçmek puan katlar; çarpmak
          hız ve combo kaybettirir. Üç çarpışmada tur biter.
        </Text>

        <View style={styles.startBest}>
          <Ionicons name="trophy" size={13} color={colors.star} />
          <Text style={styles.startBestText} {...textScale.dense}>
            {best > 0 ? `Rekorun ${best} metre` : "Henüz rekorun yok"}
          </Text>
        </View>

        <Button label="Başla" icon="play" size="lg" fullWidth onPress={onStart} />
      </View>
    </View>
  );
}

/* ============================== BİTİŞ KARTI ============================== */

function ResultOverlay({
  score,
  best,
  isRecord,
  submit,
  onRetrySubmit,
  onSignIn,
  onRestart,
  onBoard,
  onShare,
}: {
  score: number;
  best: number;
  isRecord: boolean;
  submit: SubmitState;
  onRetrySubmit: () => void;
  onSignIn: () => void;
  onRestart: () => void;
  onBoard: () => void;
  onShare: () => void;
}) {
  return (
    <View style={styles.resultScrim}>
      <View style={styles.resultCard}>
        {isRecord ? (
          <Badge label={upperTR("Yeni rekor")} tone="warn" icon="trophy" variant="soft" />
        ) : null}

        <Text style={styles.resultTitle} {...textScale.dense}>
          {isRecord ? "Rekorunu kırdın!" : "Koniye çarptın"}
        </Text>

        <Text style={styles.resultScore} {...textScale.dense}>
          {score}
        </Text>
        <Text style={styles.resultUnit} {...textScale.badge}>
          {upperTR("metre")}
        </Text>

        <Text style={styles.resultBest} {...textScale.dense}>
          {`Rekorun ${best} metre`}
        </Text>

        <SubmitLine state={submit} onRetry={onRetrySubmit} onSignIn={onSignIn} />

        <View style={styles.resultActions}>
          <Button label="Tekrar oyna" icon="refresh" size="lg" fullWidth onPress={onRestart} />
          <View style={styles.resultRow}>
            <Button
              label="Rekor tablosu"
              icon="trophy-outline"
              variant="secondary"
              onPress={onBoard}
              style={styles.flex}
            />
            <Button
              label="Meydan oku"
              icon="share-social"
              variant="ghost"
              onPress={onShare}
              style={styles.flex}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

/* ========================= SKOR GÖNDERİM SATIRI ========================= */

function SubmitLine({
  state,
  onRetry,
  onSignIn,
}: {
  state: SubmitState;
  onRetry: () => void;
  onSignIn: () => void;
}) {
  if (state === "idle") return null;

  if (state === "guest") {
    return (
      <Touchable
        feedback="button"
        haptic="light"
        onPress={onSignIn}
        style={styles.submitLine}
        accessibilityRole="button"
        accessibilityLabel="Giriş yap, skorun rekor tablosuna yazılsın"
      >
        <Ionicons name="log-in-outline" size={13} color={colors.brandAccent} />
        <Text style={styles.submitLink} {...textScale.dense}>
          Giriş yap, skorun tabloya yazılsın
        </Text>
      </Touchable>
    );
  }

  if (state === "failed") {
    return (
      <Touchable
        feedback="button"
        haptic="light"
        onPress={onRetry}
        style={styles.submitLine}
        accessibilityRole="button"
        accessibilityLabel="Skor gönderilemedi, tekrar dene"
      >
        <Ionicons name="refresh" size={13} color={colors.danger} />
        <Text style={styles.submitFail} {...textScale.dense}>
          Skor gönderilemedi · tekrar dene
        </Text>
      </Touchable>
    );
  }

  return (
    <View style={styles.submitLine}>
      <Ionicons
        name={state === "sent" ? "checkmark-circle" : "cloud-upload-outline"}
        size={13}
        color={state === "sent" ? colors.win : colors.textTertiary}
      />
      <Text style={styles.submitInfo} {...textScale.dense}>
        {state === "sent" ? "Rekor tablosuna yazıldı" : "Rekor tablosuna gönderiliyor…"}
      </Text>
    </View>
  );
}

/* ============================ PAYLAŞIM KARTI ============================ */

function ShareSheet({
  visible,
  onClose,
  score,
  isRecord,
  cityLabel,
}: {
  visible: boolean;
  onClose: () => void;
  score: number;
  isRecord: boolean;
  cityLabel: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);

  const igHandle = (() => {
    const url = instagramUrl(cityLabel);
    const handle = url?.split("instagram.com/")[1]?.replace(/\/+$/, "");
    return handle ? `@${handle}` : "elitlig.com";
  })();

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      /* `isAvailableAsync()` false dönebilir (paylaşım hedefi olmayan cihaz,
         web hedefi). ELSE DALI ŞART: dalsız hâlde düğme basılıyor, görsel
         üretiliyor, sonra sessizce hiçbir şey olmuyordu — kullanıcı için bu
         "buton bozuk" demektir. Aynı ekranların diğer ikisi (gunun.tsx,
         ShareScoreCard.tsx) zaten haber veriyordu. */
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      } else {
        toast.show({ message: "Bu cihazda paylaşım menüsü açılamıyor.", tone: "warn" });
      }
    } catch {
      toast.show({ message: "Görsel oluşturulamadı, tekrar dener misin?", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.shareBackdrop}>
        <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
          {/* Düz koyu yüzey. Gradient bu üründe yalnız görsel üstü
              okunabilirlik scrim'i için meşrudur; fotoğrafsız bir kartta
              dekorasyondan başka bir şey değil. */}
          <View style={styles.shareCard}>
            <Text style={styles.shareBrand} {...textScale.badge}>
              elitlig
            </Text>
            <Text style={styles.shareGame} {...textScale.badge}>
              {upperTR("Arena · Slalom")}
            </Text>

            <Text style={styles.shareScore} {...textScale.badge}>
              {score}
            </Text>
            <Text style={styles.shareUnit} {...textScale.badge}>
              {upperTR(isRecord ? "metre · yeni rekor" : "metre")}
            </Text>

            <View style={styles.shareDivider} />

            <Text style={styles.shareTaunt} {...textScale.badge}>
              Geç de görelim
            </Text>
            <Text style={styles.shareFooter} {...textScale.badge}>
              {upperTR(`elitlig.com · ${igHandle}`)}
            </Text>
          </View>
        </ViewShot>

        <View style={styles.shareActions}>
          <Button label="Kapat" variant="secondary" onPress={onClose} />
          <Button
            label="Paylaş"
            icon="share-social"
            loading={busy}
            onPress={() => {
              void share();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

/* ================================ STİLLER ================================ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  /* — HUD şeridi — */
  hud: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface1,
  },
  hudScoreBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.s,
  },
  hudLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  hudScore: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  hudRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  hudPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    borderRadius: radius.pill,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
    backgroundColor: colors.surface3,
  },
  hudPillText: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  hudPillLive: {
    backgroundColor: colors.liveDim,
  },
  hudPillLiveText: {
    ...type.tableNumStrong,
    color: colors.live,
  },

  /* — Saha (oyun tuvali) — */
  arena: {
    flex: 1,
    margin: layout.screenPadding,
    ...elevate(2),
    borderWidth: 0,
    borderRadius: radius.xl,
    overflow: "hidden",
    // `elevate` kendi zeminini taşır; saha yeşili ondan SONRA yazılmalı.
    backgroundColor: colors.pitchGreen,
  },

  /* Kalan hak göstergesi. */
  life: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
  },
  lifeFull: {
    backgroundColor: colors.live,
    borderColor: colors.live,
  },

  /* Çarpışma parlaması — opaklığı yerel sürücüde söner. */
  crashFlash: {
    backgroundColor: withAlpha(art.miss, 0.32),
  },

  /* — Giriş kartı — */
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  startCard: {
    alignSelf: "stretch",
    maxWidth: 360,
    borderRadius: radius.xl,
    // Yüzen kart (§yükselti 4): koyu temada yüzey+kenarlık, açık temada gölge.
    ...elevate(4),
    padding: space.xl,
    gap: space.s,
    alignItems: "center",
  },
  startIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.warnDim,
    marginBottom: space.xxs,
  },
  startOverline: {
    ...type.micro,
    color: colors.brandAccent,
  },
  startTitle: {
    ...type.display,
    color: colors.textPrimary,
  },
  startRule: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: space.xs,
  },
  startBest: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    marginBottom: space.m,
  },
  startBestText: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },

  /* — Bitiş kartı — */
  resultScrim: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
    backgroundColor: colors.overlay,
  },
  resultCard: {
    alignSelf: "stretch",
    maxWidth: 360,
    borderRadius: radius.xl,
    // Yüzen kart (§yükselti 4): koyu temada yüzey+kenarlık, açık temada gölge.
    ...elevate(4),
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
    alignItems: "center",
    gap: space.xs,
  },
  resultTitle: {
    ...type.h1,
    color: colors.textPrimary,
    marginTop: space.xs,
  },
  resultScore: {
    ...type.scoreHero,
    color: colors.brandAccent,
    marginTop: space.xs,
  },
  resultUnit: {
    ...type.micro,
    color: colors.textTertiary,
  },
  resultBest: {
    ...type.bodySm,
    color: colors.textSecondary,
    marginTop: space.xs,
  },
  resultActions: {
    alignSelf: "stretch",
    gap: space.m,
    marginTop: space.lg,
  },
  resultRow: {
    flexDirection: "row",
    gap: space.m,
  },

  /* — Skor gönderim satırı — */
  submitLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginTop: space.sm,
    paddingVertical: space.xs,
  },
  submitInfo: {
    ...type.caption,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textTertiary,
  },
  submitLink: {
    ...type.caption,
    fontFamily: fonts.bold,
    letterSpacing: 0,
    color: colors.brandAccent,
  },
  submitFail: {
    ...type.caption,
    fontFamily: fonts.bold,
    letterSpacing: 0,
    color: colors.danger,
  },

  /* — Paylaşım kartı (sabit koyu palet) — */
  shareBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.lg,
  },
  shareCard: {
    backgroundColor: inkPalette.bg,
    width: 268,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: inkPalette.brandBorder,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    alignItems: "center",
    gap: space.xxs,
  },
  shareBrand: {
    ...type.h2,
    color: inkPalette.textPrimary,
  },
  shareGame: {
    ...type.micro,
    color: inkPalette.brandAccent,
  },
  shareScore: {
    ...type.scoreHero,
    fontSize: 56,
    lineHeight: 60,
    color: inkPalette.warn,
    marginTop: space.sm,
  },
  shareUnit: {
    ...type.micro,
    color: inkPalette.textPrimary,
  },
  shareDivider: {
    alignSelf: "stretch",
    height: hairline,
    backgroundColor: withAlpha(inkPalette.textPrimary, 0.2),
    marginVertical: space.md,
  },
  shareTaunt: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: inkPalette.textSecondary,
  },
  shareFooter: {
    ...type.micro,
    color: inkPalette.textTertiary,
    marginTop: space.sm,
  },
  shareActions: {
    flexDirection: "row",
    gap: space.m,
  },
});
