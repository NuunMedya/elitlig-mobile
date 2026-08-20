/**
 * SLALOM — sonsuz koşu: top sahada ileri koşar, konilerden kaçınılır.
 *
 * OYUN (bu yenilemede DEĞİŞMEDİ): koşu illüzyonu ters çevrilmiştir — top sabit
 * yükseklikte durur, koniler üstten aşağı akar. Ekranın sol/sağ yarısına BASILI
 * TUTMAK topu o yöne kaydırır. Atlatılan her koni +1; skor arttıkça akış
 * hızlanır ve koniler sıklaşır. Koniye çarpınca oyun biter. `step`, `start`,
 * çarpışma kutuları, üretim aralıkları ve hız çarpanı birebir korundu.
 *
 * SUNUM MİMARİSİ:
 *   · HUD sahanın DIŞINDA ince bir şerit: skor solda (tabular), rekor ve hız
 *     çarpanı sağda. Saha içine konsaydı akan koniler rakamların üstünden geçer,
 *     skor okunmaz olurdu.
 *   · GİRİŞ — sahanın üstünde giriş kartı: oyun adı, tek cümlelik kural, kişisel
 *     rekor, büyük "Başla". Katman `box-none`, yani kartın DIŞINA basmak yine
 *     alttaki kontrol yarılarına düşer ve oyunu başlatır (eski alışkanlık).
 *   · BİTİŞ — sahayı kaplayan tam ekran kart. `Modal` DEĞİL sıradan bir katman:
 *     paylaşım önizlemesi zaten `Modal`, iOS'ta iki modalı üst üste bindirmek
 *     güvenilir değil. Kart katman olunca paylaşım sorunsuz üstüne biner.
 *
 * NEDEN HAM `Pressable` (tasarım sisteminin `Touchable`'ı değil): kontrol
 * yarıları BASILI TUTMA ile çalışır; `onPressIn`/`onPressOut` arasındaki gecikme
 * doğrudan topun tepkime süresidir. `Touchable`'ın ölçek animasyonu ve haptiği
 * bu iki olayın arasına girip oyunu hantallaştırırdı. Bu, kılavuzdaki "oyun içi
 * dokunma alanı" istisnasıdır; kartlardaki her basılabilir öğe yine
 * `Touchable`/`Button`.
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

/* ==================== SABİTLER (oyun mantığı — dokunulmadı) ==================== */

const BEST_KEY = "elitlig.slalom.best.v1";
const TICK_MS = 16;
const BALL = 46;
const CONE_W = 30;
const CONE_H = 30;
const BALL_Y_RATIO = 0.74; // topun sabit dikey konumu

const FLOW_BASE = 210; // koni akış hızı px/sn
const MOVE_SPEED = 260; // topun yatay hızı px/sn
const SPAWN_BASE_MS = 950;
const SPAWN_MIN_MS = 420;

/**
 * Koni — artık bir SLALOM KAPISI.
 *
 * Gerçek slalomda kapılar dönüşümlü geçilir: biri soldan, sonraki sağdan.
 * Eski sürümde koniler rastgele yerlerde beliriyordu ve tek beceri "çarpma"ydı;
 * oyuncu ekranın bir kenarında durup çoğu koniyi ıskalayabiliyordu. Artık her
 * koninin GEÇİLMESİ GEREKEN bir tarafı var, taraf sırayla değişiyor ve yanlış
 * taraftan geçmek can götürüyor.
 */
interface Cone {
  id: number;
  x: number;
  y: number;
  /** Topun koninin HANGİ yanından geçmesi gerektiği. */
  side: "left" | "right";
  /** Kapı sonuçlandı mı (puan ya da ıska). */
  passed: boolean;
  /** Yanlış taraftan geçildiyse — kırmızı işaretle gösterilir. */
  missed: boolean;
}

/** Üç ıska hakkı: slalomda kapı kaçırmak diskalifiye ama oyun bunu kademeli yapar. */
const MAX_MISSES = 3;

type Phase = "ready" | "playing" | "over";

/** Skorun sunucuya gidişi — bitiş kartında tek satırla anlatılır. */
type SubmitState = "idle" | "guest" | "sending" | "sent" | "failed";

/* ================================= EKRAN ================================= */

export default function SlalomScreen() {
  const router = useRouter();
  const scope = useScope();
  const auth = useAuth();
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [, setTick] = useState(0);

  const area = useRef({ w: 0, h: 0 });
  const ballX = useRef(0);
  const dir = useRef(0); // -1 sol, 0 dur, 1 sağ
  const cones = useRef<Cone[]>([]);
  const sinceSpawn = useRef(0);
  const coneSeq = useRef(1);
  /** Sıradaki kapının tarafı — her üretimde değişir. */
  const nextSide = useRef<"left" | "right">("left");
  const missRef = useRef(0);
  const [misses, setMisses] = useState(0);
  /** Kısa "ıska" uyarısı (sunum). */
  const [missFlash, setMissFlash] = useState(0);
  const missTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreRef = useRef(0);
  const phaseRef = useRef<Phase>("ready");
  const loop = useRef<ReturnType<typeof setInterval> | null>(null);

  /* — Sunum durumu: oyun döngüsüne karışmaz — */
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY).then((v) => setBest(Number(v) || 0));
    return () => {
      if (loop.current) clearInterval(loop.current);
      if (missTimer.current) clearTimeout(missTimer.current);
    };
  }, []);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const speedFactor = () => Math.min(2.6, 1 + scoreRef.current * 0.02);

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
    submitArenaScore("slalom", value)
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
    const dt = TICK_MS / 1000;
    const factor = speedFactor();
    const ballY = h * BALL_Y_RATIO;

    // Top hareketi
    ballX.current += dir.current * MOVE_SPEED * dt;
    ballX.current = Math.max(0, Math.min(w - BALL, ballX.current));

    // Koni üretimi: skor arttıkça sıklaşır, bazen çift gelir
    sinceSpawn.current += TICK_MS;
    const interval = Math.max(SPAWN_MIN_MS, SPAWN_BASE_MS / factor);
    if (sinceSpawn.current >= interval) {
      sinceSpawn.current = 0;
      /**
       * Kapı yerleşimi: geçilecek tarafta MUTLAKA yer kalmalı.
       * "left" kapısı sahanın sağ yarısına doğru konur ki solundan geçilebilsin;
       * "right" kapısı sol yarıya konur. Aksi hâlde kapı kenara yapışır ve
       * doğru taraftan geçmek fiziksel olarak imkânsız olurdu.
       */
      const spawn = (offset = 0) => {
        const side = nextSide.current;
        const margin = BALL * 1.35; // topun sığacağı en dar koridor
        const min = side === "left" ? margin : Math.max(0, w * 0.08);
        const max =
          side === "left"
            ? Math.max(min, w - CONE_W - w * 0.08)
            : Math.max(min, w - CONE_W - margin);
        cones.current.push({
          id: coneSeq.current++,
          x: min + Math.random() * Math.max(1, max - min),
          y: -CONE_H - offset,
          side,
          passed: false,
          missed: false,
        });
        nextSide.current = side === "left" ? "right" : "left";
      };
      spawn();
      // Yüksek skorda ikinci kapı: sırayı bozmadan hemen ardından gelir.
      if (scoreRef.current > 15 && Math.random() < 0.35) spawn(CONE_H * 2.6);
    }

    // Koni akışı + çarpışma + sayaç
    const flow = FLOW_BASE * factor;
    for (const cone of cones.current) {
      cone.y += flow * dt;
      // Çarpışma: kutu yaklaşımı, hafif hoşgörülü
      const dx = Math.abs(cone.x + CONE_W / 2 - (ballX.current + BALL / 2));
      const dy = Math.abs(cone.y + CONE_H / 2 - (ballY + BALL / 2));
      if (dx < (CONE_W + BALL) * 0.34 && dy < (CONE_H + BALL) * 0.36) {
        gameOver();
        return;
      }
      // Kapı sonuçlandı: koni topun hizasını geçti.
      if (!cone.passed && cone.y > ballY + BALL) {
        cone.passed = true;
        const ballCenter = ballX.current + BALL / 2;
        const coneCenter = cone.x + CONE_W / 2;
        const correct =
          cone.side === "left" ? ballCenter < coneCenter : ballCenter > coneCenter;

        if (correct) {
          scoreRef.current += 1;
          setScore(scoreRef.current);
          // Puan haptiği; `haptics` kendi içinde 300ms kısar, döngüyü yormaz.
          haptics.light();
        } else {
          cone.missed = true;
          missRef.current += 1;
          setMisses(missRef.current);
          setMissFlash(Date.now());
          if (missTimer.current) clearTimeout(missTimer.current);
          missTimer.current = setTimeout(() => setMissFlash(0), 650);
          haptics.warning();
          if (missRef.current >= MAX_MISSES) {
            gameOver();
            return;
          }
        }
      }
    }
    cones.current = cones.current.filter((c) => c.y < h + CONE_H);
    setTick((t) => t + 1);
  };

  const start = () => {
    const { w } = area.current;
    ballX.current = (w - BALL) / 2;
    dir.current = 0;
    cones.current = [];
    sinceSpawn.current = 0;
    scoreRef.current = 0;
    nextSide.current = "left";
    missRef.current = 0;
    setMisses(0);
    setMissFlash(0);
    setScore(0);
    setSubmit("idle");
    setPhaseBoth("playing");
    if (loop.current) clearInterval(loop.current);
    loop.current = setInterval(step, TICK_MS);
  };

  const restart = () => {
    setPhaseBoth("ready");
    cones.current = [];
    setScore(0);
    scoreRef.current = 0;
    nextSide.current = "left";
    missRef.current = 0;
    setMisses(0);
    setMissFlash(0);
    setSubmit("idle");
    setShareOpen(false);
    setTick((t) => t + 1);
  };

  const ballY = area.current.h * BALL_Y_RATIO;
  const factor = Math.min(2.6, 1 + score * 0.02);
  const isRecord = score > 0 && score >= best;

  const openBoard = () => router.push({ pathname: "/siralama", params: { game: "slalom" } });
  const openSignIn = () => router.push("/giris");

  const headerActions = useMemo(
    () => [
      {
        icon: "trophy-outline" as keyof typeof Ionicons.glyphMap,
        onPress: () => router.push({ pathname: "/siralama", params: { game: "slalom" } }),
        accessibilityLabel: "Rekor tablosu",
      },
    ],
    [router]
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Slalom"
        overline={upperTR("Elitlig Arena")}
        subtitle="Basılı tut, konilerden kaç"
        back
        actions={headerActions}
      />

      {/* — HUD: skor solda (tabular), rekor ve hız çarpanı sağda — */}
      <View style={styles.hud}>
        <View style={styles.hudScoreBox}>
          <Text style={styles.hudLabel} {...textScale.badge}>
            {upperTR("Koni")}
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
          {/* Kalan hak: üç kapı kaçırınca tur biter. */}
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
          <View style={[styles.hudPill, styles.hudPillLive]}>
            <Ionicons name="flash" size={11} color={colors.live} />
            <Text style={styles.hudPillLiveText} {...textScale.badge}>
              {`x${factor.toFixed(1)}`}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={styles.arena}
        onLayout={(e) => {
          area.current = {
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          };
          if (phaseRef.current === "ready") {
            ballX.current = (area.current.w - BALL) / 2;
            setTick((t) => t + 1);
          }
        }}
      >
        {/* Çim şeritleri — saha yeşili tokenı, şeritler kazanç yeşiliyle aydınlatılır. */}
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.stripe,
              { top: `${(i * 100) / 6}%`, height: `${100 / 6}%` },
              i % 2 === 1 && styles.stripeAlt,
            ]}
          />
        ))}
        {/* Kenar çizgileri */}
        <View style={[styles.sideline, styles.sidelineLeft]} />
        <View style={[styles.sideline, styles.sidelineRight]} />

        {/* Koniler */}
        {/* Kapılar: ok, topun koninin HANGİ yanından geçmesi gerektiğini söyler.
            Iskalanan kapı kırmızıya döner ki oyuncu hatasını görsün. */}
        {cones.current.map((cone) => (
          <View
            key={cone.id}
            style={[styles.cone, { transform: [{ translateX: cone.x }, { translateY: cone.y }] }]}
            pointerEvents="none"
          >
            <View style={styles.coneTriangle} />
            <View style={styles.coneBase} />
            <View
              style={[
                styles.coneSide,
                cone.side === "left" ? styles.coneSideLeft : styles.coneSideRight,
                cone.missed && styles.coneSideMissed,
              ]}
            >
              <Ionicons
                name={cone.side === "left" ? "arrow-back" : "arrow-forward"}
                size={11}
                color={cone.missed ? colors.textOnStatus : colors.textPrimary}
              />
            </View>
          </View>
        ))}

        {/* Iska uyarısı */}
        {missFlash ? (
          <View pointerEvents="none" style={styles.missFlash}>
            <Text style={styles.missFlashText} allowFontScaling={false}>
              Kapı kaçtı!
            </Text>
          </View>
        ) : null}

        {/* Top */}
        <Text
          style={[
            styles.ball,
            { transform: [{ translateX: ballX.current }, { translateY: ballY }] },
          ]}
        >
          ⚽
        </Text>

        {/* Kontroller: sol/sağ yarı, basılı tut — ham Pressable, gerekçesi dosya başında. */}
        <View style={styles.controls}>
          <Pressable
            style={styles.controlHalf}
            accessibilityRole="button"
            accessibilityLabel="Sola kaydır"
            onPressIn={() => {
              if (phaseRef.current === "ready") start();
              dir.current = -1;
            }}
            onPressOut={() => {
              if (dir.current === -1) dir.current = 0;
            }}
          />
          <Pressable
            style={styles.controlHalf}
            accessibilityRole="button"
            accessibilityLabel="Sağa kaydır"
            onPressIn={() => {
              if (phaseRef.current === "ready") start();
              dir.current = 1;
            }}
            onPressOut={() => {
              if (dir.current === 1) dir.current = 0;
            }}
          />
        </View>

        {phase === "ready" ? <StartOverlay best={best} onStart={start} /> : null}

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
      </View>

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
          Gerçek slalom: kapıları sırayla bir SOLDAN bir SAĞDAN geç. Her koninin yanındaki
          ok hangi taraftan geçeceğini söyler. Koniye çarparsan tur biter; yanlış taraftan
          geçersen bir hak gider — üç hakkın var.
        </Text>

        <View style={styles.startBest}>
          <Ionicons name="trophy" size={13} color={colors.star} />
          <Text style={styles.startBestText} {...textScale.dense}>
            {best > 0 ? `Rekorun ${best} koni` : "Henüz rekorun yok"}
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
  stripe: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  stripeAlt: {
    backgroundColor: withAlpha(colors.win, 0.12),
  },
  sideline: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: withAlpha(colors.win, 0.4),
  },
  sidelineLeft: { left: 4 },
  sidelineRight: { right: 4 },
  /* Kapı yön işareti — koninin geçilecek yanında durur. */
  coneSide: {
    position: "absolute",
    top: CONE_H * 0.15,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coneSideLeft: { left: -22 },
  coneSideRight: { right: -22 },
  coneSideMissed: { backgroundColor: colors.danger, borderColor: colors.danger },
  missFlash: {
    position: "absolute",
    top: "12%",
    alignSelf: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  missFlashText: { ...type.label, color: colors.textOnStatus },
  cone: {
    position: "absolute",
    top: 0,
    left: 0,
    width: CONE_W,
    height: CONE_H,
    alignItems: "center",
  },
  coneTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: CONE_W / 2 - 2,
    borderRightWidth: CONE_W / 2 - 2,
    borderBottomWidth: CONE_H - 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.warn,
  },
  coneBase: {
    width: CONE_W,
    height: 5,
    borderRadius: 2,
    backgroundColor: colors.danger,
    marginTop: 1,
  },
  ball: {
    position: "absolute",
    top: 0,
    left: 0,
    fontSize: BALL - 6,
    width: BALL,
    height: BALL,
    textAlign: "center",
  },
  controls: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  controlHalf: {
    flex: 1,
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
