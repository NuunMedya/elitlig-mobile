/**
 * TOP SEKTİR — Flappy usulü top sektirme oyunu.
 *
 * FİZİK (bu yenilemede DEĞİŞMEDİ): yerçekimi topu aşağı çeker; her dokunuş
 * topu yukarı sektirir ve +1 sekme yazar. Skor arttıkça yerçekimi ağırlaşır ve
 * her sekmede top yanlara daha sert savrulur (duvarlardan ve tavandan seker —
 * tavana yapışarak hile yapılamaz). Top çim şeridine düşerse oyun biter.
 * Döngü ~60fps'lik bir zamanlayıcıyla, değerler ref'lerde tutularak işler.
 * `step`, `tap`, `gameOver` ve sabitler birebir korundu.
 *
 * SUNUM MİMARİSİ:
 *   · HUD tuvalin DIŞINDA, ince bir şerit: skor solda (tabular), rekor ve
 *     yerçekimi çarpanı sağda. Tuvalin içine konsaydı top rozetlerin arkasına
 *     girer ve okunmaz olurdu.
 *   · GİRİŞ — tuvalin üstünde giriş kartı: oyun adı, tek cümlelik kural,
 *     kişisel rekor, büyük "Başla". Kart `pointerEvents="box-none"` bir katmanda
 *     durur; eski "başlamak için ekrana dokun" alışkanlığı da çalışmaya devam
 *     eder (dokunuş tuvale kadar kabarır).
 *   · BİTİŞ — tuvali kaplayan tam ekran kart. `Modal` DEĞİL sıradan bir katman:
 *     paylaşım önizlemesi zaten `Modal`, ikisini üst üste bindirmek iOS'ta
 *     güvenilir değil. Bitiş kartı katman olunca paylaşım sorunsuz üstüne biner.
 *
 * NEDEN HAM `Pressable` (tasarım sisteminin `Touchable`'ı değil): tuval her
 * karede yeniden çizilir ve dokunuş → sekme gecikmesi oyunun kendisidir.
 * `Touchable`'ın ölçek/opaklık animasyonu ve haptik gecikmesi burada oyunu
 * bozardı. Bu, kılavuzdaki "oyun içi dokunma alanı" istisnasıdır; kartlardaki
 * ve düğmelerdeki her basılabilir öğe yine `Touchable`/`Button`.
 *
 * PAYLAŞIM KARTI SABİT KOYU PALETTEN: kart görüntü olarak dışarı çıkar; aktif
 * temaya bağlansaydı açık temadaki kullanıcıda beyaz bir kâğıt olurdu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { instagramUrl } from "@/lib/socials";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  dark as inkPalette,
  elevate,
  hairline,
  haptics,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

/* ====================== SABİTLER (fizik — dokunulmadı) ====================== */

const BEST_KEY = "elitlig.sektir.best.v1";
const BALL = 56; // top çapı (emoji kutusu)
const GROUND = 64; // çim şeridi yüksekliği
const TICK_MS = 16;

// Fizik sabitleri (piksel/saniye)
const GRAVITY_BASE = 1350;
const BOUNCE_VY = -540;

/**
 * YÖN KONTROLÜ: topun neresine dokunduğun yönü belirler.
 *
 * Gerçek sektirmede topun sol yanına vurursan sağa, sağ yanına vurursan sola
 * gider. Eski sürümde yatay hız RASTGELE savruluyordu; oyuncu topu yönetemiyor,
 * yalnız ekrana basıp şansı bekliyordu. Artık dokunuşun top merkezine olan
 * uzaklığı hızın yönünü ve şiddetini veriyor: kenara yakın vuruş sert savurur,
 * ortadan vuruş dik yükseltir.
 */
const TOUCH_PUSH = 7.2;   // piksel/saniye, dokunuş kaymasının katsayısı
const MAX_PUSH = 260;     // tek vuruşun ekleyebileceği en büyük yatay hız
const HIT_RADIUS = BALL * 0.95; // topa "değdi" sayılan yarıçap (cömert)

/** Engeller — skor ilerledikçe açılır. */
const OB_BAR_H = 12;      // bariyer kalınlığı
const OB_HOOP_H = 14;     // çember halkası kalınlığı
const OB_SPEED_BASE = 55; // yatay kayma hızı (piksel/saniye)
const HOOP_BONUS = 3;     // çemberden geçişin puanı

type Phase = "ready" | "playing" | "over";

/**
 * Engel — iki tür, tek veri yapısı.
 *
 *   bar   : dolu bariyer. Değdirirsen oyun biter; etrafından dolaşman gerekir.
 *   hoop  : ortası açık çember. Halkanın kendisi dolu, ortasından geçmek
 *           HOOP_BONUS puan kazandırır (yukarı doğru geçişte, bir kez).
 *
 * `gap` yalnız çemberde anlamlıdır: toplam genişliğin ortasındaki açıklık.
 */
interface Obstacle {
  id: number;
  kind: "bar" | "hoop";
  /** Engelin merkez y'si (top merkezi bu çizgiyi geçerse çarpışma sınanır). */
  y: number;
  /** Sol kenar. */
  x: number;
  w: number;
  /** Çemberin ortasındaki açıklık; bariyerde 0. */
  gap: number;
  vx: number;
  /** Çember bonusu bir turda bir kez verilir. */
  passed: boolean;
}

/**
 * Skora göre sahada olması gereken engeller.
 *
 * Zorluk kademeli açılır: ilk beş sekme temiz, sonra bir bariyer, sonra çember,
 * sonra ikinci bariyer. Böylece oyuncu önce kontrolü öğrenir.
 */
function obstaclesForScore(score: number, w: number, h: number): Obstacle[] {
  const list: Obstacle[] = [];
  if (score >= 5) {
    list.push({
      id: 1,
      kind: "bar",
      y: h * 0.52,
      x: w * 0.1,
      w: Math.max(70, w * 0.34),
      gap: 0,
      vx: OB_SPEED_BASE,
      passed: false,
    });
  }
  if (score >= 12) {
    const hoopW = Math.min(w * 0.55, 170);
    list.push({
      id: 2,
      kind: "hoop",
      y: h * 0.26,
      x: (w - hoopW) / 2,
      w: hoopW,
      gap: Math.max(64, hoopW * 0.52),
      vx: -OB_SPEED_BASE * 0.8,
      passed: false,
    });
  }
  if (score >= 22) {
    list.push({
      id: 3,
      kind: "bar",
      y: h * 0.7,
      x: w * 0.55,
      w: Math.max(60, w * 0.28),
      gap: 0,
      vx: -OB_SPEED_BASE * 1.2,
      passed: false,
    });
  }
  return list;
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
  const [, setTick] = useState(0); // render tetikleyici

  const area = useRef({ w: 0, h: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const scoreRef = useRef(0);
  const phaseRef = useRef<Phase>("ready");
  const obstacles = useRef<Obstacle[]>([]);
  /** Bir önceki karenin top merkezi — çarpışma "çizgiyi geçti mi" ile sınanır. */
  const prevCenterY = useRef(0);
  /** Çemberden geçişin kısa parıltısı (sunum). */
  const [hoopFlash, setHoopFlash] = useState(0);
  const hoopFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loop = useRef<ReturnType<typeof setInterval> | null>(null);

  /* — Sunum durumu: fizik döngüsüne karışmaz — */
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY).then((v) => setBest(Number(v) || 0));
    return () => {
      if (loop.current) clearInterval(loop.current);
      if (hoopFlashTimer.current) clearTimeout(hoopFlashTimer.current);
    };
  }, []);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const resetBall = () => {
    pos.current = {
      x: (area.current.w - BALL) / 2,
      y: area.current.h * 0.35,
    };
    vel.current = { x: 0, y: 0 };
    prevCenterY.current = pos.current.y + BALL / 2;
    obstacles.current = [];
    setHoopFlash(0);
  };

  /**
   * Skoru rekor tablosuna yollar. Tetikleme koşulu eskisiyle birebir aynı
   * (oturum var + skor > 0); tek fark, sonucun sessizce yutulmak yerine bitiş
   * kartında görünmesi ve tekrar denenebilmesi.
   */
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
    if (loop.current) clearInterval(loop.current);
    loop.current = null;
    const finished = scoreRef.current;
    submitScore(finished);
    if (finished > 0) {
      setBest((current) => {
        if (finished > current) {
          AsyncStorage.setItem(BEST_KEY, String(finished));
          return finished;
        }
        return current;
      });
    }
    haptics.warning();
    setPhaseBoth("over");
  };

  const step = () => {
    const { w, h } = area.current;
    const floor = h - GROUND - BALL;
    const dt = TICK_MS / 1000;
    // Zorluk: her sekmede yerçekimi %2.5 artar (en çok 2.2 kat)
    const gravity = GRAVITY_BASE * Math.min(2.2, 1 + scoreRef.current * 0.025);

    vel.current.y += gravity * dt;
    pos.current.x += vel.current.x * dt;
    pos.current.y += vel.current.y * dt;

    // Duvarlar: sönümlü sekme
    if (pos.current.x <= 0) {
      pos.current.x = 0;
      vel.current.x = Math.abs(vel.current.x) * 0.85;
    } else if (pos.current.x >= w - BALL) {
      pos.current.x = w - BALL;
      vel.current.x = -Math.abs(vel.current.x) * 0.85;
    }
    // Tavan: yukarı spam'i cezalandıran sert sekme
    if (pos.current.y <= 0) {
      pos.current.y = 0;
      vel.current.y = Math.abs(vel.current.y) * 0.65 + 80;
    }
    // Zemin: oyun biter
    if (pos.current.y >= floor) {
      pos.current.y = floor;
      gameOver();
      return;
    }

    /* ─────────────── ENGELLER ─────────────── */

    // Skor eşiği geçildiyse yeni engel sahaya girer (var olanlar korunur).
    const wanted = obstaclesForScore(scoreRef.current, w, h);
    if (wanted.length > obstacles.current.length) {
      const existing = new Set(obstacles.current.map((item) => item.id));
      obstacles.current = [
        ...obstacles.current,
        ...wanted.filter((item) => !existing.has(item.id)),
      ];
    }

    // Yatay kayma; duvarda yön değiştirir. Hız skorla birlikte artar.
    const speedScale = 1 + scoreRef.current * 0.02;
    obstacles.current.forEach((obstacle) => {
      obstacle.x += obstacle.vx * speedScale * dt;
      if (obstacle.x <= 0) {
        obstacle.x = 0;
        obstacle.vx = Math.abs(obstacle.vx);
      } else if (obstacle.x + obstacle.w >= w) {
        obstacle.x = w - obstacle.w;
        obstacle.vx = -Math.abs(obstacle.vx);
      }
    });

    /* Çarpışma: topun MERKEZİ engelin çizgisini bu karede geçti mi?
       Yüksek hızda tünelleme olmasın diye konum farkı değil, çizgiyi kesme
       sınanır (önceki merkez ile şimdiki merkez engelin iki yanındaysa). */
    const centerY = pos.current.y + BALL / 2;
    const centerX = pos.current.x + BALL / 2;
    const goingUp = centerY < prevCenterY.current;

    for (const obstacle of obstacles.current) {
      const crossed =
        (prevCenterY.current - obstacle.y) * (centerY - obstacle.y) <= 0 &&
        Math.abs(centerY - prevCenterY.current) > 0;
      if (!crossed) continue;

      const left = obstacle.x;
      const right = obstacle.x + obstacle.w;
      const reach = BALL * 0.42; // topun yarıçapı kadar tolerans

      if (obstacle.kind === "bar") {
        if (centerX > left - reach && centerX < right + reach) {
          prevCenterY.current = centerY;
          gameOver();
          return;
        }
        continue;
      }

      // Çember: iki dolu halka ucu + ortada açıklık.
      const gapLeft = left + (obstacle.w - obstacle.gap) / 2;
      const gapRight = gapLeft + obstacle.gap;

      const hitLeftArc = centerX > left - reach && centerX < gapLeft + reach * 0.4;
      const hitRightArc = centerX > gapRight - reach * 0.4 && centerX < right + reach;

      if (hitLeftArc || hitRightArc) {
        prevCenterY.current = centerY;
        gameOver();
        return;
      }

      // Ortadan yukarı geçiş: bonus. Aşağı geçişte puan verilmez ki
      // top çemberde salınıp puan basmasın.
      if (centerX >= gapLeft && centerX <= gapRight && goingUp && !obstacle.passed) {
        obstacle.passed = true;
        scoreRef.current += HOOP_BONUS;
        setScore(scoreRef.current);
        setHoopFlash(Date.now());
        if (hoopFlashTimer.current) clearTimeout(hoopFlashTimer.current);
        hoopFlashTimer.current = setTimeout(() => setHoopFlash(0), 700);
        haptics.success();
      } else if (centerX >= gapLeft && centerX <= gapRight && !goingUp) {
        // Aşağı inerken açıklıktan geçti: bir sonraki yukarı geçiş yine sayar.
        obstacle.passed = false;
      }
    }

    prevCenterY.current = centerY;
    setTick((t) => t + 1);
  };

  /**
   * Vuruş. `touchX` verilirse topun neresine değildiğine göre yön hesaplanır.
   *
   * Başlangıç ekranındaki "Başla" düğmesi koordinatsız çağırır: o vuruş
   * merkezden kabul edilir, top dosdoğru yükselir.
   */
  const hit = (touchX?: number, touchY?: number) => {
    if (phaseRef.current === "over") return;

    const starting = phaseRef.current === "ready";
    if (starting) {
      resetBall();
      scoreRef.current = 0;
      setScore(0);
      setSubmit("idle");
      setPhaseBoth("playing");
      if (loop.current) clearInterval(loop.current);
      loop.current = setInterval(step, TICK_MS);
    }

    const centerX = pos.current.x + BALL / 2;
    const centerY = pos.current.y + BALL / 2;

    /* TOPA DEĞMEDİYSE VURUŞ YOK: oyunun becerisi burada. Boş ekrana basmak
       topu havada tutmaz; nişan almak gerekir. Başlangıç vuruşu muaftır. */
    if (!starting && touchX != null && touchY != null) {
      const dx = touchX - centerX;
      const dy = touchY - centerY;
      if (Math.hypot(dx, dy) > HIT_RADIUS) {
        haptics.light();
        return;
      }
    }

    vel.current.y = BOUNCE_VY;

    // Topun solundan vurursan sağa, sağından vurursan sola gider.
    if (touchX != null) {
      const offset = centerX - touchX;
      const push = Math.max(-MAX_PUSH, Math.min(MAX_PUSH, offset * TOUCH_PUSH));
      vel.current.x += push;
    }

    scoreRef.current += 1;
    setScore(scoreRef.current);
    // Puan haptiği; `haptics` kendi içinde 300ms kısar, sekme spam'i titremez.
    haptics.light();
  };

  /** Tuval dokunuşu — konumu oyuna taşır. */
  const tap = (event?: GestureResponderEvent) => {
    const touch = event?.nativeEvent;
    hit(touch?.locationX, touch?.locationY);
  };

  /** Başlangıç düğmesi: konumsuz vuruş. */
  const startTap = () => hit();

  const restart = () => {
    setPhaseBoth("ready");
    resetBall();
    scoreRef.current = 0;
    setScore(0);
    setSubmit("idle");
    setShareOpen(false);
    setTick((t) => t + 1);
  };

  const gravityLevel = Math.min(2.2, 1 + score * 0.025);
  const isRecord = score > 0 && score >= best;

  const openBoard = () => router.push({ pathname: "/siralama", params: { game: "sektir" } });
  const openSignIn = () => router.push("/giris");

  const headerActions = useMemo(
    () => [
      {
        icon: "trophy-outline" as keyof typeof Ionicons.glyphMap,
        onPress: () => router.push({ pathname: "/siralama", params: { game: "sektir" } }),
        accessibilityLabel: "Rekor tablosu",
      },
    ],
    [router]
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Top Sektir"
        overline={upperTR("Elitlig Arena")}
        subtitle="Düşürme! Her dokunuş +1"
        back
        actions={headerActions}
      />

      {/* — HUD: skor solda (tabular), rekor ve yerçekimi çarpanı sağda — */}
      <View style={styles.hud}>
        <View style={styles.hudScoreBox}>
          <Text style={styles.hudLabel} {...textScale.badge}>
            {upperTR("Sekme")}
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
          <View style={[styles.hudPill, styles.hudPillLive]}>
            <Ionicons name="flash" size={11} color={colors.live} />
            <Text style={styles.hudPillLiveText} {...textScale.badge}>
              {`x${gravityLevel.toFixed(1)}`}
            </Text>
          </View>
        </View>
      </View>

      {/* Tuval — ham Pressable, gerekçesi dosya başında. */}
      <Pressable
        style={styles.arena}
        onPress={tap}
        accessibilityRole="button"
        accessibilityLabel="Topu sektir"
        onLayout={(e) => {
          area.current = {
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          };
          if (phaseRef.current === "ready") {
            resetBall();
            setTick((t) => t + 1);
          }
        }}
      >
        {/* Gökyüzü derinliği — tuval zemini surface1, üstte hafif marka tintı. */}
        <LinearGradient
          colors={[withAlpha(colors.brand, 0.14), colors.surface1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Çim şeritleri — saha yeşili tokenı, şeritler kazanç yeşiliyle aydınlatılır. */}
        <View style={styles.ground} pointerEvents="none">
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={[styles.groundStripe, i % 2 === 1 && styles.groundStripeAlt]} />
          ))}
          <View style={styles.groundLine} />
        </View>

        {/* Engeller — bariyerler dolu, çemberin ortası açıktır. */}
        {obstacles.current.map((obstacle) =>
          obstacle.kind === "bar" ? (
            <View
              key={obstacle.id}
              pointerEvents="none"
              style={[
                styles.bar,
                {
                  width: obstacle.w,
                  transform: [
                    { translateX: obstacle.x },
                    { translateY: obstacle.y - OB_BAR_H / 2 },
                  ],
                },
              ]}
            />
          ) : (
            <View
              key={obstacle.id}
              pointerEvents="none"
              style={[
                styles.hoopRow,
                {
                  width: obstacle.w,
                  transform: [
                    { translateX: obstacle.x },
                    { translateY: obstacle.y - OB_HOOP_H / 2 },
                  ],
                },
              ]}
            >
              <View style={[styles.hoopArc, { width: (obstacle.w - obstacle.gap) / 2 }]} />
              <View style={[styles.hoopGap, { width: obstacle.gap }]} />
              <View style={[styles.hoopArc, { width: (obstacle.w - obstacle.gap) / 2 }]} />
            </View>
          )
        )}

        {/* Çemberden geçiş parıltısı */}
        {hoopFlash ? (
          <View pointerEvents="none" style={styles.hoopFlash}>
            <Text style={styles.hoopFlashText} allowFontScaling={false}>
              {`+${HOOP_BONUS}`}
            </Text>
          </View>
        ) : null}

        {/* Top */}
        <Text
          style={[
            styles.ball,
            { transform: [{ translateX: pos.current.x }, { translateY: pos.current.y }] },
          ]}
        >
          ⚽
        </Text>

        {phase === "ready" ? <StartOverlay best={best} onStart={startTap} /> : null}

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
          Topa dokunarak havada tut. Solundan vurursan sağa, sağından vurursan sola gider —
          boşa vurursan sekme olmaz. 5. sekmeden sonra kırmızı bariyerler çıkar (değme!),
          12'den sonra sarı çemberin ortasından geçersen +3 puan.
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
          <LinearGradient
            colors={[inkPalette.brandDim, inkPalette.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.shareCard}
          >
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
          </LinearGradient>
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
  ground: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: GROUND,
    flexDirection: "row",
    backgroundColor: colors.pitchGreen,
  },
  groundStripe: { flex: 1 },
  groundStripeAlt: {
    backgroundColor: withAlpha(colors.win, 0.12),
  },
  groundLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: withAlpha(colors.win, 0.45),
  },
  bar: {
    position: "absolute",
    left: 0,
    top: 0,
    height: OB_BAR_H,
    borderRadius: OB_BAR_H / 2,
    backgroundColor: colors.danger,
    // Bariyer "değme = biter" anlamı taşır; kenarlık onu zeminden ayırır.
    borderWidth: 1,
    borderColor: withAlpha(colors.danger, 0.55),
  },
  hoopRow: {
    position: "absolute",
    left: 0,
    top: 0,
    height: OB_HOOP_H,
    flexDirection: "row",
    alignItems: "center",
  },
  hoopArc: {
    height: OB_HOOP_H,
    borderRadius: OB_HOOP_H / 2,
    backgroundColor: colors.warn,
  },
  /* Açıklık görünür olmalı: oyuncu nereden geçeceğini seçebilsin. */
  hoopGap: {
    height: 2,
    alignSelf: "center",
    backgroundColor: withAlpha(colors.warn, 0.35),
  },
  hoopFlash: {
    position: "absolute",
    top: "18%",
    alignSelf: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(colors.win, 0.9),
  },
  hoopFlashText: { ...type.h3, color: colors.textOnStatus },
  ball: {
    position: "absolute",
    top: 0,
    left: 0,
    fontSize: BALL - 8,
    width: BALL,
    height: BALL,
    textAlign: "center",
  },

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
    fontWeight: "700",
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
    fontWeight: "600",
    letterSpacing: 0,
    color: colors.textTertiary,
  },
  submitLink: {
    ...type.caption,
    fontWeight: "700",
    letterSpacing: 0,
    color: colors.brandAccent,
  },
  submitFail: {
    ...type.caption,
    fontWeight: "700",
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
    fontWeight: "700",
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
