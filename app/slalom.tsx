/**
 * SLALOM — basılan noktanın yatay konumunun yön hızını belirlediği koşu.
 *
 * ESKİ KONTROL NEDEN REDDEDİLDİ: ekranın sol/sağ YARISINA basılı tutmak topu
 * sabit hızda o yöne kaydırıyordu. Yani üç durum vardı — tam sola, tam sağa,
 * dur. Hassasiyet kademesi yoktu; dar bir kapıdan geçmekle geniş bir kapıdan
 * geçmek aynı girdiyi istiyordu ve oyuncunun öğreneceği bir şey kalmıyordu.
 *
 * YENİ KONTROL EĞRİSİ (brief §5.3 birebir):
 *
 *     n        = clamp((touchX - centerX) / (width / 2), -1, 1)
 *     steer    = sign(n) * |n|^1.7        ← merkez hassas, kenar agresif
 *     targetVx = steer * MAX_LATERAL
 *     vx       = approach(vx, targetVx, accel, decel, dt)
 *
 * `1.7` üssü işin kalbi: merkezin yakınında girdi neredeyse doğrusal olarak
 * KÜÇÜLÜR, kenara doğru hızla büyür. Ortaya yakın basmak milimetrik düzeltme,
 * kenara basmak sert kaçış verir — ve bu fark ölçülebilir biçimde hissedilir.
 * `approach` momentum ekler: hedefe ışınlanma yok, yön değiştirmenin ağırlığı
 * var. Yavaşlama katsayısı hızlanmadan büyüktür; durmak, hızlanmaktan kolay
 * olmalı ki kaçınma kontrol edilebilsin.
 *
 * PARMAK EKRANDA KALDIĞI SÜRECE OKUNUR — sadece basma anı değil. Parmağını
 * kaydıran oyuncuyu görmezden gelen bir kontrol ölü hissettirir.
 *
 * DESENLER RASTGELE DEĞİL: koni dizilimi, tasarlanmış altı desenden seçilir.
 * Rastgelelik adaletsiz hissettirir — oyuncu bir deseni öğrenip aşamaz, yalnız
 * şansa küser. Altı desen dönüşümlü gelir ve mesafeyle sıkışır.
 *
 * ÇARPIŞMA OYUNU BİTİRMEZ: hız %35 düşer, combo sıfırlanır, 600ms
 * dokunulmazlık verilir (yanıp sönme değil opaklık düşüşü — yanıp sönen bir
 * öğe bu üründe yasak). Üç çarpışmada tur biter.
 *
 * FİZİK: `lib/game/loop.ts` sabit adımlı döngü. Eski `setInterval(16ms)`
 * kurulumu kare hızına bağlıydı ve yavaş cihazda oyun başka bir oyundu.
 *
 * ÇİZİM: `react-native-svg`. Perspektif dokuyla değil GEOMETRİYLE kurulur —
 * ufka doğru yakınsayan tebeşir çizgileri ve kayan biçme şeritleri. Doku
 * denemesi hem ağır hem uygulamanın diline yabancı olurdu.
 *
 * NEDEN HAM `PanResponder`: kontrol sürekli konum okumasıdır; `Touchable`'ın
 * ölçek animasyonu ve haptik gecikmesi araya girseydi oyun hantallaşırdı. Bu,
 * kılavuzdaki "oyun içi dokunma alanı" istisnasıdır.
 *
 * PAYLAŞIM KARTI SABİT KOYU PALETTEN: kart görüntü olarak dışarı çıkar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import ViewShot, { captureRef } from "react-native-view-shot";
import {
  Badge,
  Button,
  ScreenHeader,
  Touchable,
  useToast,
  withAlpha,
} from "@/components/ui";
import { submitArenaScore } from "@/lib/api/arena";
import { useHoldGesture } from "@/lib/game/input";
import { approach, clamp, useGameLoop } from "@/lib/game/loop";
import { paint } from "@/lib/game/paint";
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
const PLAYER_Y = 0.78;
/** Ufuk çizgisinin yüksekliği — perspektif buradan yakınsar. */
const HORIZON = 0.3;
/** Oyuncu yarıçapı. */
const PLAYER_R = 15;
/** Koridor kenarının koridor koordinatındaki yeri (oyuncu tavanı 1.0). */
const EDGE = 1.2;

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

/** Akıştaki tek koni. `z` 1 (ufuk) → 0 (oyuncu) arasında ilerler. */
interface Cone {
  id: number;
  /** Koridor içindeki yatay konum, -1..1. */
  lane: number;
  z: number;
  /** Sıyırma bonusu bir kez verilir. */
  grazed: boolean;
  /** Çarpışma bir kez sayılır. */
  hit: boolean;
}

type SubmitState = "idle" | "guest" | "sending" | "sent" | "failed";

/* ================================= EKRAN ================================= */

export default function SlalomScreen() {
  const router = useRouter();
  const scope = useScope();
  const auth = useAuth();

  const [phase, setPhase] = useState<Phase>("ready");
  const [distance, setDistance] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lives, setLives] = useState<number>(T.lives);
  const [best, setBest] = useState(0);
  const [, setFrame] = useState(0);

  const area = useRef({ w: 0, h: 0 });
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
  const cones = useRef<Cone[]>([]);
  const coneId = useRef(0);
  const patternIndex = useRef(0);
  const patternStep = useRef(0);
  const spawnTimer = useRef(0);
  const speed = useRef<number>(T.baseSpeed);
  const travelled = useRef(0);
  const comboRef = useRef(0);
  const livesRef = useRef<number>(T.lives);
  const invulnerable = useRef(0);
  /** "Close" etiketinin kalan süresi. */
  const grazeFlash = useRef(0);

  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [shareOpen, setShareOpen] = useState(false);

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
    patternIndex.current = 0;
    patternStep.current = 0;
    spawnTimer.current = 0;
    speed.current = T.baseSpeed;
    travelled.current = 0;
    comboRef.current = 0;
    livesRef.current = T.lives;
    invulnerable.current = 0;
    grazeFlash.current = 0;
    setDistance(0);
    setCombo(0);
    setLives(T.lives);
  };

  /* ─────────────────────────── fizik adımı ─────────────────────────── */

  const step = (dt: number) => {
    if (phaseRef.current !== "playing") return;
    const { w } = area.current;
    if (w <= 0) return;

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
    speed.current = Math.min(
      T.maxSpeed,
      T.baseSpeed + travelled.current * T.speedGrowth,
    );
    travelled.current += (speed.current * dt) / 10;
    invulnerable.current = Math.max(0, invulnerable.current - dt);
    grazeFlash.current = Math.max(0, grazeFlash.current - dt);

    /* ÜRETİM — desenden sıradaki kapı. Aralık hızla kısalır ki kapılar
       mesafede sıkışsın; ama alt sınır var, oyun boğulmaz. */
    const interval = Math.max(0.34, 0.9 - travelled.current * 0.0009);
    spawnTimer.current -= dt;
    if (spawnTimer.current <= 0) {
      spawnTimer.current = interval;
      const pattern = PATTERNS[patternIndex.current % PATTERNS.length];
      const spread = T.gateWide - (T.gateWide - T.gateNarrow) * clamp(travelled.current / 900, 0, 1);
      coneId.current += 1;
      cones.current.push({
        id: coneId.current,
        lane: clamp(pattern[patternStep.current] * (1 / T.gateWide) * spread, -0.92, 0.92),
        z: 1,
        grazed: false,
        hit: false,
      });
      patternStep.current += 1;
      if (patternStep.current >= pattern.length) {
        patternStep.current = 0;
        patternIndex.current += 1;
      }
    }

    /* KONİLER — ufuktan oyuncuya akar. */
    const flow = (speed.current / 900) * dt;
    for (const cone of cones.current) {
      cone.z -= flow;

      // Oyuncu düzlemine geldiğinde çarpışma/sıyırma sınanır.
      if (cone.hit || cone.z > 0.14 || cone.z < -0.05) continue;

      const gap = Math.abs(cone.lane - lane.current) * (area.current.w / 2);
      if (gap < PLAYER_R + 12) {
        cone.hit = true;
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
          if (livesRef.current <= 0) {
            gameOver();
            return;
          }
        }
      } else if (!cone.grazed && gap < PLAYER_R + 12 + T.grazeDistance) {
        /* SIYIRMA: riski ödüllendirir. Koniden uzak durmak güvenlidir ama
           puan getirmez; oyunun gerilimi bu tercihten gelir. */
        cone.grazed = true;
        comboRef.current += 1;
        setCombo(comboRef.current);
        travelled.current += comboRef.current;
        grazeFlash.current = 0.6;
        haptics.light();
      }
    }

    cones.current = cones.current.filter((cone) => cone.z > -0.06);
  };

  /*
    Mesafe HUD'u render'da güncellenir, fizik adımında DEĞİL: fizik saniyede
    120 adım atıyor ve her adımda setState çağırmak React'ı boğuyordu. Render
    saniyede ~60 kez çalışır ve zaten ekranı çizecektir.
  */
  const render = () => {
    setDistance(Math.round(travelled.current));
    setFrame((n) => (n + 1) % 1_000_000);
  };
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

  const { w, h } = area.current;

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
          <Text style={styles.hudScore} {...textScale.dense}>
            {distance}
          </Text>
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
        onLayout={(e) =>
          (area.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Slalom pisti"
        accessibilityHint="Ekrana basılı tut. Ortaya yakın basmak hassas, kenara basmak sert döndürür."
      >
        {w > 0 && h > 0 ? (
          <Svg width={w} height={h} pointerEvents="none">
            <Track w={w} h={h} steer={steer.current} scroll={travelled.current} />
            {cones.current.map((cone) => (
              <ConeSprite key={cone.id} cone={cone} w={w} h={h} steer={steer.current} />
            ))}
            <Player
              w={w}
              h={h}
              lane={lane.current}
              steer={steer.current}
              faded={invulnerable.current > 0}
            />
            {/* Hız çizgileri: hız arttıkça kenarlarda belirir. */}
            <SpeedLines w={w} h={h} speed={speed.current} />
          </Svg>
        ) : null}

        {grazeFlash.current > 0 ? (
          <View style={styles.grazeTag} pointerEvents="none">
            <Text style={styles.grazeText} {...textScale.badge}>
              {upperTR("Sıyırdın")}
            </Text>
          </View>
        ) : null}

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

/* ============================== PİST ÇİZİMİ ============================== */

/** Bir `z` derinliğinin ekrandaki y'si ve ölçeği. */
function project(z: number, h: number): { y: number; scale: number } {
  // z=1 ufuk, z=0 oyuncu düzlemi. Kare kök olmayan bir eğri derinliği
  // hızlandırır: uzaktakiler yavaş, yakındakiler hızlı büyür.
  const t = clamp(1 - z, 0, 1);
  const y = h * HORIZON + (h * PLAYER_Y - h * HORIZON) * t * t;
  const scale = 0.12 + t * t * 0.88;
  return { y, scale };
}

/** Bir koridor konumunun (-1..1) ekrandaki x'i. */
function laneX(lane: number, w: number, scale: number, shift: number): number {
  return w / 2 + lane * (w / 2) * scale * 0.92 + shift;
}

/**
 * Koridor — ufka doğru yakınsayan tebeşir çizgileri ve kayan biçme şeritleri.
 * Doku yok: yalnız geometri, çok daha temiz ve çok daha ucuz.
 */
const Track = memo(function Track({
  w,
  h,
  steer,
  scroll,
}: {
  w: number;
  h: number;
  steer: number;
  scroll: number;
}) {
  // Kamera karşı kayar (parallax): sağa dönerken dünya sola akar.
  const shift = -steer * T.cameraShift;
  const near = project(0, h);
  const far = project(1, h);

  // Hız arttıkça yatay ölçek %3 açılır — FOV genişleme hissi.
  const fov = 1 + clamp(scroll / 2000, 0, 1) * 0.03;

  return (
    <G>
      <Rect x={0} y={0} width={w} height={h} fill={paint.turf} />

      {/* Biçme şeritleri: kaydıkça ufka doğru daralır. */}
      {Array.from({ length: 9 }, (_, i) => {
        const offset = ((scroll / 26 + i) % 9) / 9;
        const a = project(1 - offset, h);
        const b = project(1 - Math.min(1, offset + 0.055), h);
        return i % 2 === 0 ? (
          <Path
            key={i}
            d={`M ${laneX(-EDGE, w, a.scale * fov, shift)} ${a.y}
                L ${laneX(EDGE, w, a.scale * fov, shift)} ${a.y}
                L ${laneX(EDGE, w, b.scale * fov, shift)} ${b.y}
                L ${laneX(-EDGE, w, b.scale * fov, shift)} ${b.y} Z`}
            fill={paint.turfAlt}
          />
        ) : null;
      })}

      {/* Koridor kenarları — tebeşir.

          GENİŞLİK 1.2: oyuncu en uçta (lane = ±1) YARIÇAPIYLA BİRLİKTE
          çizginin içinde kalmalı. 1.05'te top kenardan ~8px taşıyor ve
          "pistin dışına çıkmış" gibi duruyordu (tarayıcıda ölçüldü). */}
      <Path
        d={`M ${laneX(-EDGE, w, far.scale * fov, shift)} ${far.y} L ${laneX(-EDGE, w, near.scale * fov, shift)} ${near.y}`}
        stroke={paint.chalk}
        strokeWidth={2}
      />
      <Path
        d={`M ${laneX(EDGE, w, far.scale * fov, shift)} ${far.y} L ${laneX(EDGE, w, near.scale * fov, shift)} ${near.y}`}
        stroke={paint.chalk}
        strokeWidth={2}
      />
      {/* Orta çizgi — kesikli, kaydıkça akar. */}
      <Path
        d={`M ${laneX(0, w, far.scale * fov, shift)} ${far.y} L ${laneX(0, w, near.scale * fov, shift)} ${near.y}`}
        stroke={paint.chalk}
        strokeWidth={1.5}
        strokeDasharray="10 18"
        strokeDashoffset={-scroll * 2}
        opacity={0.5}
      />
    </G>
  );
});

/**
 * Koni — gerçek 3B değil, ölçekli sprite. Zemin gölgesi mesafeyle küçülür;
 * derinlik hissini veren şey gölgenin kendisidir, koninin değil.
 */
const ConeSprite = memo(function ConeSprite({
  cone,
  w,
  h,
  steer,
}: {
  cone: Cone;
  w: number;
  h: number;
  steer: number;
}) {
  const { y, scale } = project(cone.z, h);
  const x = laneX(cone.lane, w, scale, -steer * T.cameraShift);
  const size = 30 * scale;
  if (size < 1.5) return null;

  const fill = cone.grazed ? paint.action : paint.miss;

  return (
    <G opacity={cone.hit ? 0.3 : 1}>
      <Ellipse cx={x} cy={y} rx={size * 0.55} ry={size * 0.18} fill={paint.shadow} opacity={0.35} />
      <Path
        d={`M ${x} ${y - size} L ${x + size * 0.42} ${y} L ${x - size * 0.42} ${y} Z`}
        fill={fill}
      />
      {/* Konideki beyaz bant — ölçekte de okunur kalan tek ayrıntı. */}
      <Path
        d={`M ${x - size * 0.26} ${y - size * 0.38} L ${x + size * 0.26} ${y - size * 0.38}`}
        stroke={paint.surface}
        strokeWidth={Math.max(1, size * 0.12)}
      />
    </G>
  );
});

/**
 * Oyuncu — top + gövde. Gövde `steer * 14°` yatar; bu, kontrolün ne kadar
 * agresif olduğunu GÖSTEREN tek geri bildirimdir ve eğrinin öğrenilmesini
 * sağlar. Dokunulmazlıkta yanıp sönmez, OPAKLIĞI DÜŞER.
 */
const Player = memo(function Player({
  w,
  h,
  lane,
  steer,
  faded,
}: {
  w: number;
  h: number;
  lane: number;
  steer: number;
  faded: boolean;
}) {
  const y = h * PLAYER_Y;
  const x = laneX(lane, w, 1, -steer * T.cameraShift);
  const tilt = steer * T.tilt;

  return (
    <G opacity={faded ? 0.4 : 1} transform={`rotate(${tilt.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`}>
      <Ellipse cx={x} cy={y + PLAYER_R * 0.9} rx={PLAYER_R} ry={PLAYER_R * 0.32} fill={paint.shadow} opacity={0.4} />
      <Circle cx={x} cy={y} r={PLAYER_R} fill={paint.surface} stroke={paint.ink} strokeWidth={1.5} />
      <Circle cx={x} cy={y} r={PLAYER_R * 0.38} fill={paint.ink} opacity={0.85} />
    </G>
  );
});

/** Hız çizgileri — kenarlarda, hızla belirginleşen ince çizgiler. */
const SpeedLines = memo(function SpeedLines({
  w,
  h,
  speed,
}: {
  w: number;
  h: number;
  speed: number;
}) {
  const intensity = clamp((speed - T.baseSpeed) / (T.maxSpeed - T.baseSpeed), 0, 1);
  if (intensity < 0.08) return null;

  return (
    <G opacity={intensity * 0.5}>
      {[0.04, 0.1, 0.9, 0.96].map((ratio, i) => (
        <Path
          key={i}
          d={`M ${w * ratio} ${h * 0.42} L ${w * ratio} ${h * 0.92}`}
          stroke={paint.chalk}
          strokeWidth={1.5}
        />
      ))}
    </G>
  );
});

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
          {upperTR("koni")}
        </Text>

        <Text style={styles.resultBest} {...textScale.dense}>
          {`Rekorun ${best} koni`}
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
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
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
              {upperTR(isRecord ? "koni · yeni rekor" : "koni")}
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
    borderRadius: radius.lg,
    backgroundColor: colors.pitchGreen,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  /* Pist, koniler ve oyuncu artık SVG olarak çizilir (bkz. dosya başı);
     eski View tabanlı stiller kaldırıldı. */

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

  /* Sıyırma etiketi — riski ödüllendiren tek geri bildirim. */
  grazeTag: {
    position: "absolute",
    top: "14%",
    alignSelf: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  grazeText: {
    ...type.overline,
    color: colors.textOnBrand,
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
