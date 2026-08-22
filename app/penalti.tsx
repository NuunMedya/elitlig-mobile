/**
 * PENALTI — tek sürükleme jestiyle yön, güç ve FALSO.
 *
 * ESKİ HÂL NEDEN REDDEDİLDİ: üç dokunuşlu bir zamanlama oyunuydu (gidip gelen
 * nişangâhı kilitle → dolup boşalan güç barını kilitle → izle). Oyuncunun
 * verdiği tek karar "ne zaman dokunayım"dı; penaltı atmakla ilgisi yoktu.
 * Kaleci de atışın yönünü ARTAN BİR OLASILIKLA "okuyordu" — yani hile
 * yapıyordu ve zorluk, adaletsizlikle yükseliyordu.
 *
 * YENİ MODEL — TEK JEST, DÖRT BİLGİ. Toptan başlayan bir sürükle-fırlat:
 *   YÖN       ← vektörün yatay bileşeni (kalenin hangi köşesi)
 *   GÜÇ       ← vektörün uzunluğu, POWER_MIN..POWER_MAX aralığına eşlenir
 *   YÜKSEKLİK ← vektörün dikey bileşeni
 *   FALSO     ← parmağın izlediği YOLUN EĞRİLİĞİ (başlangıç–bitiş doğrusuna
 *               göre orta noktanın sapması; çapraz çarpımla ölçülür)
 * Oyunun derinliği falsodadır: köşeyi güçle değil kavisle bulmak gerekir ve
 * bu, öğrenilebilir bir beceridir.
 *
 * KALECİ DÜRÜSTTÜR — oyunu adil yapan tek şey budur:
 *   · Kararını top AYRILDIKTAN SONRA verir (140–320ms tepki gecikmesi).
 *   · Yönü hatayla okur: tahmin = gerçek + gauss(0, sigma). Sigma zorlukla
 *     düşer ama SIFIRLANMAZ.
 *   · BİR KEZ DALAR VE DÜZELTEMEZ. Mükemmel takip yok; dalış başladıktan
 *     sonra hedef değişse bile kaleci gittiği yöne gider.
 *   · Koşu açısının tahmine katkısı %10'u geçmez — "okudu" hissi verir,
 *     okumaz.
 *
 * FİZİK: `lib/game/loop.ts` içindeki sabit adımlı döngü. Uçuş boyunca `z`
 * derinliği ölçeği belirler (top uzaklaştıkça küçülür), `y`'ye yerçekimi,
 * `x`'e `curve * t²` uygulanır.
 *
 * ÇİZİM: `react-native-svg`. Kale üç nokta perspektifiyle çizilir; ağ bir grid
 * mesh'tir ve çarpmada temas noktasından komşu düğümlere sönümlü dalga yayılır
 * — iki satır fizik, sonuç çok değerli. Kaleci ve atıcı basit vektör
 * silüetlerdir: yamuk bir 3B denemesi yerine stilize ve tutarlı.
 *
 * EMOJİ YOK: eski sürümde top ⚽ ve kaleci 🧤 emojiydi; emoji cihazın yazı
 * tipine göre değişir, renk tokenlarına uymaz ve ölçeklenmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Ellipse, G, Line, Path, Polyline, Rect } from "react-native-svg";

import { Button, ScreenHeader, Touchable } from "@/components/ui";
import { submitArenaScore } from "@/lib/api/arena";
import { useDragGesture, type DragResult } from "@/lib/game/input";
import { clamp, gauss, useGameLoop } from "@/lib/game/loop";
import { paint } from "@/lib/game/paint";
import { TUNING } from "@/lib/game/tuning";
import { useAuth } from "@/providers/AuthProvider";
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

/* ============================ SABİTLER VE TİPLER ============================ */

const BEST_KEY = "elitlig.penalti.best.v2";
const T = TUNING.penalti;

/** Ağ örgüsünün düğüm sayısı. Az olursa dalga görünmez, çok olursa kare düşer. */
const NET_COLS = 9;
const NET_ROWS = 6;

type Phase = "ready" | "aim" | "flight" | "result" | "over";
type Outcome = "gol" | "kurtaris" | "aut" | "direk";
type SubmitState = "idle" | "guest" | "sending" | "sent" | "failed";

/** Bir atışın sonucu — seri tablosunda dolu/boş nokta olarak görünür. */
type ShotMark = Outcome | null;

/** Uçuştaki topun durumu. */
interface Shot {
  /** 0 → 1 uçuş ilerlemesi. */
  t: number;
  /** Kale düzlemindeki hedef: 0 sol direk, 1 sağ direk. */
  aimX: number;
  /** Kale düzlemindeki hedef yükseklik: 0 yer, 1 üst direk. */
  aimY: number;
  /** Falso — uçuş boyunca x'e `curve * t²` olarak uygulanır. */
  curve: number;
  power: number;
}

/** Kalecinin durumu — kararını verdikten SONRA değiştiremez. */
interface Keeper {
  /** Şu anki konum (0–1). */
  x: number;
  /** Dalış hedefi; karar verilene kadar null. */
  target: number | null;
  /** Kararın verileceği zaman (uçuş `t` cinsinden). */
  decideAt: number;
  /** Dalışın başladığı `t` — dalış süresince ilerleme buradan hesaplanır. */
  divedAt: number | null;
  /** Dalış yüksekliği (0 ayakta, 1 tam uzanma). */
  lift: number;
}

/* ================================= EKRAN ================================= */

export default function PenaltiScreen() {
  const router = useRouter();
  const auth = useAuth();

  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [marks, setMarks] = useState<ShotMark[]>(Array(T.shots).fill(null));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [, setFrame] = useState(0);

  /** Sürükleme sırasında canlı geri bildirim (mercan yay). */
  const [drag, setDrag] = useState<DragResult | null>(null);

  const area = useRef({ w: 0, h: 0 });
  const phaseRef = useRef<Phase>("ready");
  const shotRef = useRef<Shot | null>(null);
  const keeperRef = useRef<Keeper>({ x: 0.5, target: null, decideAt: 0, divedAt: null, lift: 0 });
  const shotIndex = useRef(0);
  const scoreRef = useRef(0);
  /** Ağ düğümlerinin sapması — gol anında dalga buradan yayılır. */
  const net = useRef<number[]>(Array(NET_COLS * NET_ROWS).fill(0));
  /** Ağır çekim çarpanı: kritik anda 0.25'e iner. */
  const slowmo = useRef(1);
  /** Gol/direk sonrası kamera sarsıntısı (piksel). */
  const shake = useRef(0);
  /** Sonuç kartının bekleme zamanlayıcısı — ekrandan çıkılırsa iptal edilir. */
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /* ─────────────────────────── atışın çözümü ─────────────────────────── */

  /**
   * Sonucu belirler. Kalecinin eli topun geçtiği noktaya `reach` kadar
   * yakınsa kurtarış; hedef direklerin dışındaysa aut; direğe çok yakınsa
   * direk. Kalecinin YÜKSEKLİĞİ de hesaba katılır: üst köşeye giden bir topa
   * yerde duran kaleci yetişemez.
   */
  const resolve = useCallback(
    (shot: Shot, keeper: Keeper): Outcome => {
      if (shot.aimX < 0.04 || shot.aimX > 0.96 || shot.aimY > 0.96) return "aut";
      if (shot.aimX < 0.09 || shot.aimX > 0.91 || shot.aimY > 0.9) return "direk";

      const dx = Math.abs(shot.aimX - keeper.x);
      // Uzanma yüksekliği: kaleci ne kadar daldıysa o kadar yükseğe erişir.
      const reachY = 0.35 + keeper.lift * 0.5;
      const withinHeight = shot.aimY <= reachY;
      // Sert vuruşa yetişmek zordur: erişim yarıçapı güçle daralır.
      const reach = T.keeperReach * (1.25 - shot.power * 0.4);

      return dx < reach && withinHeight ? "kurtaris" : "gol";
    },
    [],
  );

  const land = useCallback(
    (result: Outcome) => {
      setOutcome(result);
      setPhaseBoth("result");

      setMarks((current) => {
        const next = [...current];
        next[shotIndex.current] = result;
        return next;
      });

      if (result === "gol") {
        scoreRef.current += 1;
        setScore(scoreRef.current);
        // Ağ dalgası: topun girdiği noktadan yayılır.
        const shot = shotRef.current;
        if (shot) {
          const col = clamp(Math.round(shot.aimX * (NET_COLS - 1)), 0, NET_COLS - 1);
          const row = clamp(Math.round((1 - shot.aimY) * (NET_ROWS - 1)), 0, NET_ROWS - 1);
          net.current[row * NET_COLS + col] = 1;
        }
        shake.current = 3;
        haptics.success();
      } else if (result === "direk") {
        shake.current = 2;
        haptics.warning();
      } else {
        haptics.warning();
      }

      // Sonuç kartı kısa süre durur, sonra sıradaki atış ya da seri sonu.
      holdTimer.current = setTimeout(() => {
        shotIndex.current += 1;
        shotRef.current = null;
        slowmo.current = 1;
        setOutcome(null);
        setDrag(null);
        if (shotIndex.current >= T.shots) finish();
        else setPhaseBoth("aim");
      }, 1200);
    },
    [finish, setPhaseBoth],
  );

  /* ─────────────────────────── fizik adımı ─────────────────────────── */

  const step = useCallback(
    (dt: number) => {
      // Ağ dalgası her adımda söner ve komşulara yayılır — durum ne olursa olsun.
      relaxNet(net.current);
      if (shake.current > 0) shake.current = Math.max(0, shake.current - dt * 12);

      const shot = shotRef.current;
      if (phaseRef.current !== "flight" || !shot) return;

      const keeper = keeperRef.current;

      /* KALECİNİN KARARI — top ayrıldıktan SONRA, gecikmeyle, hatayla.
         Bir kez verilir; `target` dolduktan sonra bir daha okunmaz. */
      if (keeper.target == null && shot.t >= keeper.decideAt) {
        const difficulty = clamp(shotIndex.current / Math.max(1, T.shots - 1), 0, 1);
        const sigma = T.keeperSigmaEasy + (T.keeperSigmaHard - T.keeperSigmaEasy) * difficulty;
        // Koşu açısının katkısı: hissettirir, belirlemez (%10 tavan).
        const bias = clamp(shot.curve, -1, 1) * T.keeperReadBias;
        keeper.target = clamp(gauss(shot.aimX + bias, sigma), 0.02, 0.98);
        keeper.divedAt = shot.t;
      }

      /* DALIŞ — başladıktan sonra hedef DEĞİŞMEZ. Kaleci gittiği yere gider;
         topu takip etmez. Oyunu adil yapan tek kural budur. */
      if (keeper.target != null && keeper.divedAt != null) {
        const progress = clamp((shot.t - keeper.divedAt) / T.keeperDive, 0, 1);
        // Yumuşak giriş-çıkış: dalış bir sıçrayış gibi görünsün.
        const eased = progress * progress * (3 - 2 * progress);
        keeper.x = 0.5 + (keeper.target - 0.5) * eased;
        keeper.lift = Math.sin(eased * Math.PI) * Math.min(1, Math.abs(keeper.target - 0.5) * 2.4);
      }

      /* AĞIR ÇEKİM: son %20'lik uçuşta kaleciyle mesafe kritikse zaman yavaşlar.
         Kritik olmayan atışta yavaşlatmak, her atışı uzatıp oyunu ağırlaştırırdı. */
      const close = Math.abs(shot.aimX - keeper.x) < T.keeperReach * 1.6;
      slowmo.current = shot.t > 0.8 && close ? 0.25 : 1;

      shot.t += (dt / T.flight) * slowmo.current;

      if (shot.t >= 1) {
        shot.t = 1;
        land(resolve(shot, keeper));
      }
    },
    [land, resolve],
  );

  const render = useCallback(() => setFrame((n) => (n + 1) % 1_000_000), []);
  useGameLoop({ step, render, running: phase === "flight" || phase === "result" });

  /* ─────────────────────────── jest ─────────────────────────── */

  const shoot = useCallback(
    (result: DragResult) => {
      if (phaseRef.current !== "aim") return;
      if (result.length < T.dragMin) {
        // Çok kısa sürükleme atış değil, kararsızlıktır; jest yutulur.
        setDrag(null);
        return;
      }

      const power = clamp(
        T.powerMin +
          ((result.length - T.dragMin) / (T.dragMax - T.dragMin)) * (T.powerMax - T.powerMin),
        T.powerMin,
        T.powerMax,
      );

      /* Yön: yatay bileşen kale genişliğine eşlenir. Sürüklemenin YUKARI
         bileşeni yüksekliği verir — aşağı sürüklemek topu yerden gönderir. */
      const { w, h } = area.current;
      const aimX = clamp(0.5 + result.dx / Math.max(1, w * 0.62), 0, 1);
      const aimY = clamp(-result.dy / Math.max(1, h * 0.5), 0, 1);

      shotRef.current = {
        t: 0,
        aimX,
        aimY,
        curve: clamp(result.curve * T.curveK, -1, 1),
        power,
      };

      const difficulty = clamp(shotIndex.current / Math.max(1, T.shots - 1), 0, 1);
      const delay = T.keeperDelayEasy + (T.keeperDelayHard - T.keeperDelayEasy) * difficulty;
      keeperRef.current = {
        x: 0.5,
        target: null,
        // Gecikme saniyeden uçuş oranına çevrilir.
        decideAt: clamp(delay / T.flight, 0, 0.9),
        divedAt: null,
        lift: 0,
      };

      setDrag(null);
      setPhaseBoth("flight");
      haptics.medium();
    },
    [setPhaseBoth],
  );

  const gesture = useDragGesture({
    enabled: phase === "aim",
    onMove: setDrag,
    onEnd: shoot,
  });

  const start = useCallback(() => {
    scoreRef.current = 0;
    shotIndex.current = 0;
    shotRef.current = null;
    net.current = Array(NET_COLS * NET_ROWS).fill(0);
    setScore(0);
    setMarks(Array(T.shots).fill(null));
    setOutcome(null);
    setDrag(null);
    setSubmit("idle");
    setPhaseBoth("aim");
  }, [setPhaseBoth]);

  const openBoard = useCallback(
    () => router.push({ pathname: "/siralama", params: { game: "penalti" } }),
    [router],
  );

  const isRecord = score > 0 && score >= best;
  const { w, h } = area.current;

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
        onLayout={(e) =>
          (area.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Penaltı sahası"
        accessibilityHint="Toptan parmağını sürükleyip bırak. Uzunluk gücü, yön köşeyi, çizdiğin kavis falsoyu belirler."
      >
        {w > 0 && h > 0 ? (
          <Svg width={w} height={h} pointerEvents="none">
            <Field w={w} h={h} shake={shake.current} />
            <Goal w={w} h={h} net={net.current} shake={shake.current} />
            <KeeperFigure w={w} h={h} keeper={keeperRef.current} />
            {shotRef.current ? <FlyingBall w={w} h={h} shot={shotRef.current} /> : null}
            {phase === "aim" ? <SpotBall w={w} h={h} drag={drag} /> : null}
          </Svg>
        ) : null}

        {/* Sonuç etiketi */}
        {outcome ? (
          <View
            style={[styles.outcome, outcome === "gol" ? styles.outcomeGoal : styles.outcomeMiss]}
            pointerEvents="none"
          >
            <Text style={styles.outcomeText} {...textScale.dense}>
              {OUTCOME_LABEL[outcome]}
            </Text>
          </View>
        ) : null}

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

const OUTCOME_LABEL: Record<Outcome, string> = {
  gol: "GOL",
  kurtaris: "KURTARIŞ",
  aut: "AUT",
  direk: "DİREK",
};

/* ============================== SAHA ÇİZİMİ ============================== */

/** Kalenin kadraj içindeki yeri — bütün çizimler bu ölçülerden türer. */
function goalBox(w: number, h: number) {
  const width = w * 0.62;
  const height = h * 0.3;
  return { x: (w - width) / 2, y: h * 0.16, w: width, h: height };
}

/**
 * Çim ve ceza sahası — doku yok, yalnız geometri. Yakınsayan tebeşir
 * çizgileri derinliği tek başına kurar; sahte bir çim dokusu hem ağır hem
 * uygulamanın geri kalanına yabancı dururdu.
 */
const Field = memo(function Field({ w, h, shake }: { w: number; h: number; shake: number }) {
  const goal = goalBox(w, h);
  const dx = shake ? (Math.random() - 0.5) * shake : 0;

  return (
    <G transform={`translate(${dx.toFixed(2)} 0)`}>
      <Rect x={0} y={0} width={w} height={h} fill={paint.turf} />
      {/* Biçme şeritleri: ufka doğru daralan yatay bantlar. */}
      {Array.from({ length: 7 }, (_, i) => {
        const top = h * (0.36 + (i / 7) ** 1.6 * 0.64);
        const next = h * (0.36 + ((i + 1) / 7) ** 1.6 * 0.64);
        return i % 2 === 0 ? (
          <Rect key={i} x={0} y={top} width={w} height={next - top} fill={paint.turfAlt} />
        ) : null;
      })}

      {/* Ceza sahası — yakınsayan iki kenar + ön çizgi. */}
      <Path
        d={`M ${w * 0.06} ${h} L ${goal.x - w * 0.06} ${goal.y + goal.h}
            L ${goal.x + goal.w + w * 0.06} ${goal.y + goal.h} L ${w * 0.94} ${h}`}
        stroke={paint.chalk}
        strokeWidth={2}
        fill="none"
      />
      {/* Penaltı noktası */}
      <Circle cx={w / 2} cy={h * 0.82} r={3} fill={paint.chalk} />
    </G>
  );
});

/**
 * Kale — üç nokta projeksiyonuyla çizilmiş çerçeve + ağ örgüsü.
 *
 * Ağ, `net` dizisindeki sapmalarla çizilir: her düğüm kendi sapması kadar
 * içeri çöker. Top girdiğinde temas düğümü 1'e set edilir, `relaxNet` her
 * adımda sapmayı komşulara yayıp söndürür — dalga budur.
 */
const Goal = memo(function Goal({
  w,
  h,
  net,
  shake,
}: {
  w: number;
  h: number;
  net: number[];
  shake: number;
}) {
  const g = goalBox(w, h);
  const dx = shake ? (Math.random() - 0.5) * shake : 0;

  return (
    <G transform={`translate(${dx.toFixed(2)} 0)`}>
      {/* Ağ: dikey ve yatay ipler, düğüm sapmalarıyla eğrilmiş. */}
      {Array.from({ length: NET_COLS }, (_, c) => (
        <Polyline
          key={`c${c}`}
          points={Array.from({ length: NET_ROWS }, (_, r) => {
            const x = g.x + (g.w * c) / (NET_COLS - 1) + net[r * NET_COLS + c] * 6;
            const y = g.y + (g.h * r) / (NET_ROWS - 1) + net[r * NET_COLS + c] * 4;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(" ")}
          stroke={paint.net}
          strokeWidth={0.75}
          fill="none"
        />
      ))}
      {Array.from({ length: NET_ROWS }, (_, r) => (
        <Polyline
          key={`r${r}`}
          points={Array.from({ length: NET_COLS }, (_, c) => {
            const x = g.x + (g.w * c) / (NET_COLS - 1) + net[r * NET_COLS + c] * 6;
            const y = g.y + (g.h * r) / (NET_ROWS - 1) + net[r * NET_COLS + c] * 4;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(" ")}
          stroke={paint.net}
          strokeWidth={0.75}
          fill="none"
        />
      ))}

      {/* Direkler ve üst direk — kalın, beyaz, perspektifli. */}
      <Path
        d={`M ${g.x} ${g.y + g.h} L ${g.x} ${g.y} L ${g.x + g.w} ${g.y} L ${g.x + g.w} ${g.y + g.h}`}
        stroke={paint.post}
        strokeWidth={5}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={`M ${g.x} ${g.y + g.h} L ${g.x} ${g.y} L ${g.x + g.w} ${g.y} L ${g.x + g.w} ${g.y + g.h}`}
        stroke={paint.ink}
        strokeWidth={1}
        strokeLinejoin="round"
        fill="none"
        opacity={0.25}
      />
    </G>
  );
});

/**
 * Ağ dalgası: her düğüm komşularının ortalamasına doğru çekilir ve söner.
 * İki satır fizik — ama ağın "canlı" görünmesi tamamen buradan geliyor.
 */
function relaxNet(net: number[]): void {
  const next = net.slice();
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
      next[i] = (net[i] + (neighbour - net[i]) * TUNING.penalti.netSpread) * TUNING.penalti.netDamp;
    }
  }
  for (let i = 0; i < net.length; i += 1) net[i] = Math.abs(next[i]) < 0.002 ? 0 : next[i];
}

/**
 * Kaleci — stilize vektör silüet. Dalış yönüne göre kollar açılır ve gövde
 * yatar. Üç 3B denemesi yerine tek bir tutarlı çizim dili.
 */
const KeeperFigure = memo(function KeeperFigure({
  w,
  h,
  keeper,
}: {
  w: number;
  h: number;
  keeper: Keeper;
}) {
  const g = goalBox(w, h);
  const cx = g.x + g.w * keeper.x;
  const base = g.y + g.h;
  const lean = (keeper.x - 0.5) * 44 * keeper.lift;
  const rise = keeper.lift * g.h * 0.35;
  const cy = base - g.h * 0.34 - rise;

  return (
    <G transform={`rotate(${lean.toFixed(1)} ${cx.toFixed(1)} ${base.toFixed(1)})`}>
      {/* Gölge */}
      <Ellipse cx={cx} cy={base} rx={14} ry={4} fill={paint.shadow} opacity={0.5} />
      {/* Bacaklar */}
      <Line x1={cx} y1={cy + 12} x2={cx - 7} y2={base} stroke={paint.ink} strokeWidth={4} strokeLinecap="round" />
      <Line x1={cx} y1={cy + 12} x2={cx + 7} y2={base} stroke={paint.ink} strokeWidth={4} strokeLinecap="round" />
      {/* Gövde */}
      <Line x1={cx} y1={cy - 6} x2={cx} y2={cy + 12} stroke={paint.action} strokeWidth={9} strokeLinecap="round" />
      {/* Kollar — dalış yüksekliğiyle açılır */}
      <Line
        x1={cx}
        y1={cy - 2}
        x2={cx - 12 - keeper.lift * 12}
        y2={cy - 4 - keeper.lift * 10}
        stroke={paint.action}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Line
        x1={cx}
        y1={cy - 2}
        x2={cx + 12 + keeper.lift * 12}
        y2={cy - 4 - keeper.lift * 10}
        stroke={paint.action}
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* Baş */}
      <Circle cx={cx} cy={cy - 11} r={5} fill={paint.ink} />
    </G>
  );
});

/**
 * Uçuştaki top. `z` derinliği ölçeği belirler: top uzaklaştıkça küçülür.
 * `y`'ye yerçekimi düşüşü, `x`'e `curve * t²` uygulanır — falso uçuşun
 * SONUNA doğru belirginleşir, gerçek bir kavis gibi.
 */
const FlyingBall = memo(function FlyingBall({ w, h, shot }: { w: number; h: number; shot: Shot }) {
  const g = goalBox(w, h);
  const t = shot.t;

  const startX = w / 2;
  const startY = h * 0.82;
  const endX = g.x + g.w * shot.aimX;
  const endY = g.y + g.h * (1 - shot.aimY);

  const x = startX + (endX - startX) * t + shot.curve * 60 * t * t;
  // Yerçekimi: uçuşun ortasında hafif bir kubbe.
  const y = startY + (endY - startY) * t + Math.sin(t * Math.PI) * -18 * shot.power;
  const scale = 1 - t * 0.62;

  return (
    <G>
      <Ellipse cx={x} cy={h * 0.82 + 4} rx={9 * scale} ry={3 * scale} fill={paint.shadow} opacity={0.3 * (1 - t)} />
      <Circle cx={x} cy={y} r={11 * scale} fill={paint.surface} stroke={paint.ink} strokeWidth={1.5 * scale} />
      <Circle cx={x} cy={y} r={4 * scale} fill={paint.ink} opacity={0.85} />
    </G>
  );
});

/**
 * Noktadaki top + nişan yayı.
 *
 * Sürükleme sürerken toptan çıkan ince mercan yay canlı geri bildirim verir:
 * uzunluk gücü, eğrilik falsoyu GÖSTERİR. Oyuncu, jestin ne ürettiğini
 * bırakmadan önce görür — bu olmadan falso öğrenilebilir bir beceri değil,
 * tesadüf olurdu.
 */
const SpotBall = memo(function SpotBall({
  w,
  h,
  drag,
}: {
  w: number;
  h: number;
  drag: DragResult | null;
}) {
  const x = w / 2;
  const y = h * 0.82;

  const power = drag
    ? clamp((drag.length - T.dragMin) / (T.dragMax - T.dragMin), 0, 1)
    : 0;

  return (
    <G>
      {drag && drag.length >= T.dragMin ? (
        <Path
          // Kuadratik Bézier: kontrol noktası eğriliğe göre yana kaçar —
          // yayın kavisi topun çizeceği kavistir.
          d={`M ${x} ${y} Q ${x + drag.dx / 2 + drag.curve * 900} ${y + drag.dy / 2} ${x + drag.dx} ${y + drag.dy}`}
          stroke={paint.action}
          strokeWidth={1.5 + power * 2.5}
          strokeLinecap="round"
          fill="none"
          opacity={0.85}
        />
      ) : null}
      <Ellipse cx={x} cy={y + 5} rx={10} ry={3} fill={paint.shadow} opacity={0.35} />
      <Circle cx={x} cy={y} r={12} fill={paint.surface} stroke={paint.ink} strokeWidth={1.5} />
      <Circle cx={x} cy={y} r={4.5} fill={paint.ink} opacity={0.85} />
    </G>
  );
});

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
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },

  /* — Sonuç etiketi — */
  outcome: {
    position: "absolute",
    alignSelf: "center",
    top: "44%",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  outcomeGoal: {
    backgroundColor: colors.brand,
  },
  outcomeMiss: {
    backgroundColor: colors.inverse,
  },
  outcomeText: {
    ...type.h1,
    color: colors.textOnBrand,
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
