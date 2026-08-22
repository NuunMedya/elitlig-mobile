/**
 * TOP SEKTİR — temas noktasının yönü belirlediği sektirme oyunu.
 *
 * FİZİK (bu sürümde BAŞTAN YAZILDI). Eski hâl `setInterval(16ms)` ile
 * çalışıyor ve her tikte sabit bir `dt` varsayıyordu; yani fizik KARE HIZINA
 * BAĞLIYDI ve aynı vuruş aynı sonucu vermiyordu. Artık `lib/game/loop.ts`
 * içindeki sabit adımlı döngü kullanılıyor: fizik daima 1/120 sn adımlarla
 * ilerliyor, render ara değerle çiziliyor.
 *
 * ÜÇ KURAL, OYUNUN TAMAMI:
 *
 *  1. TEMAS NOKTASI YÖNÜ BELİRLER. Dokunuşun top merkezine olan yatay ofseti
 *     `o` (-1 sol kenar, +1 sağ kenar) hem yatay hızı hem yükselişi hem de
 *     DÖNÜŞÜ üretir. Sola vurursan sağa gider; kenardan vurursan az yükselir.
 *
 *  2. MAGNUS ETKİSİ. Dönen top havada eğri çizer (`ax += spin * vy * MAGNUS`).
 *     Bu, oyunun derinliğidir: topu kenardan vurup kavisle halkanın içine
 *     sokmak, dik vuruştan daha zor ve daha değerlidir.
 *
 *  3. HALKALAR YALNIZ YUKARI GEÇİŞTE SAYILIR. Aşağı düşerken halkadan geçmek
 *     sayılsaydı oyun kendi kendini oynardı; puan, oyuncunun kararından
 *     gelmeliydi.
 *
 * ÇİZİM: `react-native-svg`. Top gerçekten döner (panel çizgileri `spinAngle`
 * kadar dönmüş çizilir) — yalnız kayan bir daire "dönüyor" okunmuyordu.
 * Emoji top kaldırıldı: emoji cihazın yazı tipine göre değişir ve renk
 * tokenlarına uymaz.
 *
 * SUNUM MİMARİSİ (korundu):
 *   · HUD tuvalin DIŞINDA ince bir şerit: skor solda, çarpan sağda.
 *   · GİRİŞ ve BİTİŞ kartları tuvalin üstünde katman; `Modal` değil, çünkü
 *     paylaşım önizlemesi zaten `Modal` ve iOS'ta ikisi üst üste binmiyor.
 *
 * NEDEN HAM `PanResponder` (tasarım sisteminin `Touchable`'ı değil): dokunuş →
 * sekme gecikmesi oyunun kendisidir. Bu, kılavuzdaki "oyun içi dokunma alanı"
 * istisnasıdır; kartlardaki her basılabilir öğe yine `Touchable`/`Button`.
 *
 * PAYLAŞIM KARTI SABİT KOYU PALETTEN: kart görüntü olarak dışarı çıkar; aktif
 * temaya bağlansaydı açık temadaki kullanıcıda beyaz bir kâğıt olurdu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
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
import { applyHit, isSweetSpot, stepBall } from "@/lib/game/ballistics";
import { clamp, useGameLoop } from "@/lib/game/loop";
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

const BEST_KEY = "elitlig.sektir.best.v1";
const T = TUNING.sektir;

/** Top yarıçapı (piksel). */
const BALL_R = 22;
/** Çim şeridinin yüksekliği — top buraya değerse tur biter. */
const GROUND = 64;

type Phase = "ready" | "playing" | "over";

/** Ekranda süzülen halka. Top merkezinden YUKARI geçerse çarpan artar. */
interface Ring {
  id: number;
  x: number;
  y: number;
  r: number;
  vx: number;
  /** Bir tur içinde bir kez sayılır. */
  used: boolean;
}

/** Tam isabet darbesi — topun etrafında tek seferlik beyaz halka. */
interface Pulse {
  x: number;
  y: number;
  /** 0 → 1 arasında ilerler, 1'de silinir. */
  t: number;
}

/** Skorun sunucuya gidişi — bitiş kartında tek satırla anlatılır. */
type SubmitState = "idle" | "guest" | "sending" | "sent" | "failed";

/* ================================= EKRAN ================================= */

export default function SektirScreen() {
  const router = useRouter();
  const scope = useScope();
  const auth = useAuth();

  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [, setFrame] = useState(0);

  /* — Fizik durumu ref'lerde: her karede değişiyor, render'ı tetiklememeli — */
  const area = useRef({ w: 0, h: 0 });
  const pos = useRef({ x: 0, y: 0 });
  /** Bir önceki fizik adımının konumu — render interpolasyonu için. */
  const prev = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const spin = useRef(0);
  const spinAngle = useRef(0);
  /** Fizik modülüne verilen çalışma nesnesi — her karede yeniden ayrılmaz. */
  const ball = useRef({ x: 0, y: 0, vx: 0, vy: 0, spin: 0 });
  const trail = useRef<{ x: number; y: number }[]>([]);
  const rings = useRef<Ring[]>([]);
  const pulse = useRef<Pulse | null>(null);
  const touches = useRef(0);
  const ringId = useRef(0);

  const phaseRef = useRef<Phase>("ready");
  const scoreRef = useRef(0);
  const multRef = useRef(1);
  const comboRef = useRef(0);
  const [combo, setCombo] = useState(0);

  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY).then((value) => setBest(Number(value) || 0));
  }, []);

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  /* ─────────────────────────── kurulum ─────────────────────────── */

  /** Yeni halka üretir. Zorluk arttıkça küçülür ve daha hızlı süzülür. */
  const spawnRing = (level: number): Ring => {
    const { w, h } = area.current;
    const r = Math.max(T.ringMinRadius, T.ringRadius * T.ringShrink ** level);
    const drift = T.ringDrift * T.ringDriftGrowth ** level;
    ringId.current += 1;
    return {
      id: ringId.current,
      x: r + Math.random() * Math.max(1, w - r * 2),
      // Halkalar üst yarıda durur: topun yükseliş yayının içinde olmalılar.
      y: h * 0.18 + Math.random() * h * 0.3,
      r,
      vx: (Math.random() < 0.5 ? -1 : 1) * drift,
      used: false,
    };
  };

  const resetBall = () => {
    const { w, h } = area.current;
    pos.current = { x: w / 2, y: h * 0.42 };
    prev.current = { ...pos.current };
    vel.current = { x: 0, y: 0 };
    spin.current = 0;
    spinAngle.current = 0;
    trail.current = [];
    pulse.current = null;
  };

  const resetRound = () => {
    resetBall();
    touches.current = 0;
    scoreRef.current = 0;
    multRef.current = 1;
    comboRef.current = 0;
    setScore(0);
    setMultiplier(1);
    setCombo(0);
    rings.current = Array.from({ length: T.ringCount }, () => spawnRing(0));
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
    submitArenaScore("sektir", value)
      .then(() => setSubmit("sent"))
      .catch(() => setSubmit("failed"));
  };

  const gameOver = () => {
    if (phaseRef.current === "over") return;
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
    haptics.warning();
  };

  /* ─────────────────────────── fizik adımı ─────────────────────────── */

  const step = (dt: number) => {
    if (phaseRef.current !== "playing") return;
    const { w, h } = area.current;
    if (w <= 0 || h <= 0) return;

    prev.current = { x: pos.current.x, y: pos.current.y };

    /* Yerçekimi, Magnus, sürtünme ve konum: hepsi `lib/game/ballistics.ts`
       içinde. Fizik ekrandan ayrı durduğu için başsız doğrulanabiliyor
       (bkz. scripts/check-games.mjs). */
    ball.current.x = pos.current.x;
    ball.current.y = pos.current.y;
    ball.current.vx = vel.current.x;
    ball.current.vy = vel.current.y;
    ball.current.spin = spin.current;

    stepBall(ball.current, dt);

    pos.current.x = ball.current.x;
    pos.current.y = ball.current.y;
    vel.current.x = ball.current.vx;
    vel.current.y = ball.current.vy;
    spin.current = ball.current.spin;

    // Görsel dönüş hızı: sn'de ~4 tur tepe dönüşte — okunur ama baş döndürmez.
    spinAngle.current += spin.current * dt * 3;

    // Yan duvarlar: sekerken hız kaybeder.
    if (pos.current.x < BALL_R) {
      pos.current.x = BALL_R;
      vel.current.x = Math.abs(vel.current.x) * T.wallBounce;
    } else if (pos.current.x > w - BALL_R) {
      pos.current.x = w - BALL_R;
      vel.current.x = -Math.abs(vel.current.x) * T.wallBounce;
    }

    // Tavan: yapışıp hile yapılamasın diye sert seker.
    if (pos.current.y < BALL_R) {
      pos.current.y = BALL_R;
      vel.current.y = Math.abs(vel.current.y) * 0.5;
    }

    // Çim: tur biter.
    if (pos.current.y > h - GROUND - BALL_R) {
      pos.current.y = h - GROUND - BALL_R;
      gameOver();
      return;
    }

    /* HALKALAR — süzülür, kenardan döner. Geçiş yalnız YUKARI hareket
       hâlindeyken ve halka düzlemi bu adımda kesildiğinde sayılır. */
    const rising = vel.current.y < 0;
    for (const ring of rings.current) {
      ring.x += ring.vx * dt;
      if (ring.x < ring.r) {
        ring.x = ring.r;
        ring.vx = Math.abs(ring.vx);
      } else if (ring.x > w - ring.r) {
        ring.x = w - ring.r;
        ring.vx = -Math.abs(ring.vx);
      }

      if (ring.used || !rising) continue;
      const crossed = prev.current.y > ring.y && pos.current.y <= ring.y;
      const inside = Math.abs(pos.current.x - ring.x) < ring.r - BALL_R;
      if (crossed && inside) {
        ring.used = true;
        multRef.current += 1;
        setMultiplier(multRef.current);
        pulse.current = { x: ring.x, y: ring.y, t: 0 };
        haptics.light();
      }
    }

    // Kullanılan halkalar yenileriyle değişir.
    if (rings.current.some((ring) => ring.used)) {
      const level = Math.floor(touches.current / 10);
      rings.current = rings.current.map((ring) => (ring.used ? spawnRing(level) : ring));
    }

    // Tam isabet darbesi söner.
    if (pulse.current) {
      pulse.current.t += dt * 3.4;
      if (pulse.current.t >= 1) pulse.current = null;
    }
  };

  /** Kare bütçesi — döngü kurulunca gerçek okuyucuyla değiştirilir. */
  const budgetRef = useRef<() => number>(() => 1);

  /* İz: her karede değil, render'da biriktirilir — fizik 120Hz, iz 60Hz yeter. */
  const render = () => {
    if (phaseRef.current === "playing") {
      const max = Math.max(2, Math.round(T.trail * budgetRef.current()));
      trail.current.push({ x: pos.current.x, y: pos.current.y });
      while (trail.current.length > max) trail.current.shift();
    }
    setFrame((n) => (n + 1) % 1_000_000);
  };

  const loop = useGameLoop({ step, render, running: phase === "playing" });
  budgetRef.current = loop.budget;

  /* ─────────────────────────── vuruş ─────────────────────────── */

  /**
   * Topa vuruş. Briefteki model birebir:
   *   o    = (touchX - ballX) / ballR, [-1, 1]
   *   vx  -= o * HIT_X            → sola vurursan sağa gider
   *   vy   = -LIFT * (1 - .35|o|) → kenardan vurursan az yükselir
   *   spin = o * SPIN_K           → temas noktası dönüş üretir
   */
  const hit = (touchX?: number, touchY?: number) => {
    if (phaseRef.current === "over") return;

    const starting = phaseRef.current === "ready";
    if (starting) {
      resetRound();
      setPhaseBoth("playing");
      setSubmit("idle");
    }

    /* Dokunuş topun uzağındaysa vuruş sayılmaz — ekrana rastgele basmak oyunu
       oynamaz. Yarıçap cömerttir ama sonsuz değildir.

       İLK DOKUNUŞ MUAF: turu başlatan dokunuş nereye gelirse gelsin topu
       havalandırır. Aksi hâlde oyun, oyuncunun daha görmediği bir topun
       üstüne basmasını bekleyerek başlamadan biterdi. */
    if (!starting && touchX != null && touchY != null) {
      const dist = Math.hypot(touchX - pos.current.x, touchY - pos.current.y);
      if (dist > BALL_R * T.hitRadius) return;
    }

    const offset =
      touchX == null ? 0 : clamp((touchX - pos.current.x) / BALL_R, -1, 1);

    ball.current.vx = vel.current.x;
    ball.current.vy = vel.current.y;
    applyHit(ball.current, offset);
    vel.current.x = ball.current.vx;
    vel.current.y = ball.current.vy;
    spin.current = ball.current.spin;

    touches.current += 1;

    /* TATLI NOKTA: merkeze yakın vuruş combo'yu büyütür. Kenar vuruşu combo'yu
       SIFIRLAMAZ ama çarpanı düşürür — ceza, ilerlemeyi silmek değil
       yavaşlatmaktır; sıfırlama oyuncuyu risk almaktan tümüyle caydırıyordu. */
    const perfect = isSweetSpot(offset);
    if (perfect) {
      comboRef.current += 1;
      pulse.current = { x: pos.current.x, y: pos.current.y, t: 0 };
      haptics.light();
    } else if (multRef.current > 1) {
      multRef.current -= 1;
      setMultiplier(multRef.current);
    }
    setCombo(comboRef.current);

    scoreRef.current += multRef.current + (perfect ? 1 : 0);
    setScore(scoreRef.current);
  };

  const onTouch = (event: GestureResponderEvent) => {
    hit(event.nativeEvent.locationX, event.nativeEvent.locationY);
  };

  const restart = () => {
    setPhaseBoth("ready");
    setSubmit("idle");
    resetRound();
  };

  const isRecord = score > 0 && score >= best;
  const openBoard = () => router.push({ pathname: "/siralama", params: { game: "sektir" } });
  const openSignIn = () => router.push("/giris");

  const headerActions = useMemo(
    () => [
      {
        icon: "trophy-outline" as const,
        onPress: openBoard,
        accessibilityLabel: "Rekor tablosu",
      },
    ],
    // openBoard router'a bağlı; router kimliği sabit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* ─────────────────────────── çizim ─────────────────────────── */

  const { w, h } = area.current;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Top Sektir"
        overline={upperTR("Elitlig Arena")}
        subtitle="Topun neresine vurduğun yönü belirler"
        back
        actions={headerActions}
      />

      {/* — HUD: skor solda, çarpan sağda. Başka hiçbir şey. — */}
      <View style={styles.hud}>
        <View style={styles.hudScoreBox}>
          <Text style={styles.hudLabel} {...textScale.badge}>
            {upperTR("Skor")}
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
          <View style={[styles.hudPill, multiplier > 1 && styles.hudPillLive]}>
            <Text
              style={[styles.hudPillText, multiplier > 1 && styles.hudPillLiveText]}
              {...textScale.badge}
            >
              {`×${multiplier}`}
            </Text>
          </View>
        </View>
      </View>

      {/* Tuval — ham Pressable, gerekçesi dosya başında. */}
      <Pressable
        style={styles.arena}
        onPress={onTouch}
        accessibilityRole="button"
        accessibilityLabel="Topa vur"
        accessibilityHint="Topun soluna vurursan sağa, sağına vurursan sola gider"
        onLayout={(e) => {
          area.current = {
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          };
          if (phaseRef.current === "ready") {
            resetRound();
            setFrame((n) => n + 1);
          }
        }}
      >
        {w > 0 && h > 0 ? (
          <Svg width={w} height={h} pointerEvents="none">
            {/* Çim şeridi — iki tonlu biçme bandı, üstünde tebeşir çizgisi. */}
            <Rect x={0} y={h - GROUND} width={w} height={GROUND} fill={paint.turf} />
            {[0, 1, 2, 3].map((i) => (
              <Rect
                key={i}
                x={0}
                y={h - GROUND + (GROUND / 4) * i}
                width={w}
                height={GROUND / 4}
                fill={i % 2 === 0 ? paint.turfAlt : "transparent"}
              />
            ))}
            <Line
              x1={0}
              y1={h - GROUND}
              x2={w}
              y2={h - GROUND}
              stroke={paint.chalkInk}
              strokeWidth={1.5}
            />

            {/* Halkalar — yataydan hafif eğik elipsler. */}
            {rings.current.map((ring) => (
              <Ellipse
                key={ring.id}
                cx={ring.x}
                cy={ring.y}
                rx={ring.r}
                ry={ring.r * 0.32}
                stroke={paint.action}
                strokeWidth={2}
                fill="none"
                opacity={0.7}
                transform={`rotate(-8 ${ring.x} ${ring.y})`}
              />
            ))}

            {/* Topun izi — hız arttıkça belirginleşir. */}
            {trail.current.map((point, i) => (
              <Circle
                key={i}
                cx={point.x}
                cy={point.y}
                r={BALL_R * (0.35 + (i / trail.current.length) * 0.45)}
                fill={paint.action}
                opacity={0.05 + (i / trail.current.length) * 0.1}
              />
            ))}

            {/* Gölge: yükseklikle küçülür ve açılır. */}
            <BallShadow x={pos.current.x} y={pos.current.y} groundY={h - GROUND} />

            {/* Tam isabet / halka darbesi */}
            {pulse.current ? (
              <Circle
                cx={pulse.current.x}
                cy={pulse.current.y}
                r={BALL_R + pulse.current.t * 46}
                stroke={paint.action}
                strokeWidth={2}
                fill="none"
                opacity={1 - pulse.current.t}
              />
            ) : null}

            <Ball x={pos.current.x} y={pos.current.y} angle={spinAngle.current} />
          </Svg>
        ) : null}

        {phase === "ready" ? <StartOverlay best={best} onStart={() => hit()} /> : null}

        {phase === "over" ? (
          <ResultOverlay
            score={score}
            best={best}
            isRecord={isRecord}
            submit={submit}
            onRetrySubmit={() => submitScore(score)}
            onSignIn={openSignIn}
            onRestart={restart}
            onBoard={openBoard}
            onShare={() => setShareOpen(true)}
          />
        ) : null}
      </Pressable>

      <ShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        score={score}
        isRecord={isRecord}
        cityLabel={scope.cityLabel}
      />
    </SafeAreaView>
  );
}

/* ============================== TOP VE GÖLGE ============================== */

/**
 * Top — daire + beşgen panel. Panel çizgileri `angle` kadar DÖNER; yalnız
 * kayan bir daire "dönüyor" okunmuyordu ve Magnus etkisinin ne yaptığı
 * görünmüyordu. Dönüş yönü kavisi doğruluyor: oyuncu neden kıvrıldığını görür.
 */
const Ball = memo(function Ball({ x, y, angle }: { x: number; y: number; angle: number }) {
  const deg = (angle * 180) / Math.PI;
  return (
    <G transform={`rotate(${deg.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`}>
      <Circle cx={x} cy={y} r={BALL_R} fill={paint.surface} stroke={paint.ink} strokeWidth={1.5} />
      {/* Merkez beşgen + üç dikiş: dönüşü okutan en az sayıda çizgi. */}
      <Path
        d={pentagon(x, y, BALL_R * 0.42)}
        fill={paint.ink}
        opacity={0.9}
      />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const inner = BALL_R * 0.42;
        return (
          <Line
            key={i}
            x1={x + Math.cos(a) * inner}
            y1={y + Math.sin(a) * inner}
            x2={x + Math.cos(a) * BALL_R}
            y2={y + Math.sin(a) * BALL_R}
            stroke={paint.ink}
            strokeWidth={1.5}
            opacity={0.55}
          />
        );
      })}
    </G>
  );
});

/** Beşgen yolu — topun merkez paneli. */
function pentagon(cx: number, cy: number, r: number): string {
  return (
    Array.from({ length: 5 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      return `${i === 0 ? "M" : "L"} ${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
    }).join(" ") + " Z"
  );
}

/**
 * Topun gölgesi — çim üstünde bir elips. Top yükseldikçe gölge KÜÇÜLÜR ve
 * AÇILIR; alçaldıkça büyür ve koyulaşır. Derinlik hissini veren tek öğe budur
 * ve iki satır matematiktir.
 */
const BallShadow = memo(function BallShadow({
  x,
  y,
  groundY,
}: {
  x: number;
  y: number;
  groundY: number;
}) {
  const height = clamp((groundY - y) / Math.max(1, groundY), 0, 1);
  const scale = 1 - height * 0.55;
  return (
    <Ellipse
      cx={x}
      cy={groundY + 6}
      rx={BALL_R * scale}
      ry={BALL_R * 0.3 * scale}
      fill={paint.shadow}
      opacity={0.25 + (1 - height) * 0.4}
    />
  );
});

/* ============================== GİRİŞ KARTI ============================== */

/**
 * `box-none`: katmanın kendisi dokunuşu yutmaz. Kartın boşluğuna dokunmak
 * tuvale kabarır ve oyunu başlatır — eski "ekrana dokun" alışkanlığı korunur.
 */
function StartOverlay({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.startCard}>
        <View style={styles.startIcon}>
          <Ionicons name="football" size={22} color={colors.win} />
        </View>

        <Text style={styles.startOverline} {...textScale.badge}>
          {upperTR("Elitlig Arena")}
        </Text>
        <Text style={styles.startTitle} {...textScale.dense}>
          Top Sektir
        </Text>
        <Text style={styles.startRule} {...textScale.long}>
          Topun neresine vurduğun yönü belirler: soluna vurursan sağa, sağına vurursan sola
          gider. Ortadan vuruş tam isabettir. Halkalardan YUKARI geçmek puan çarpanını
          büyütür. Top çime değerse tur biter.
        </Text>

        <View style={styles.startBest}>
          <Ionicons name="trophy" size={13} color={colors.star} />
          <Text style={styles.startBestText} {...textScale.dense}>
            {best > 0 ? `Rekorun ${best} sekme` : "Henüz rekorun yok"}
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
          {isRecord ? "Rekorunu kırdın!" : "Top düştü"}
        </Text>

        <Text style={styles.resultScore} {...textScale.dense}>
          {score}
        </Text>
        <Text style={styles.resultUnit} {...textScale.badge}>
          {upperTR("sekme")}
        </Text>

        <Text style={styles.resultBest} {...textScale.dense}>
          {`Rekorun ${best} sekme`}
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
              {upperTR("Arena · Top Sektir")}
            </Text>

            <Text style={styles.shareScore} {...textScale.badge}>
              {score}
            </Text>
            <Text style={styles.shareUnit} {...textScale.badge}>
              {upperTR(isRecord ? "sekme · yeni rekor" : "sekme")}
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

  /* — Tuval — */
  arena: {
    flex: 1,
    margin: layout.screenPadding,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  /* Engel, top ve çim artık SVG olarak çiziliyor (bkz. dosya başı);
     bu stiller kaldırıldı. Tuvalin kendisi sade bir yüzey. */

  /* — Giriş kartı — */
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
    paddingBottom: GROUND,
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
    backgroundColor: colors.winDim,
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
