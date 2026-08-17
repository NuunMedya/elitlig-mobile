import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import { DetailHeader } from "@/components/ScreenHeader";
import { colors, radius, spacing, type } from "@/constants/theme";
import { instagramUrl } from "@/lib/socials";
import { useScope } from "@/providers/ScopeProvider";

/**
 * TOP SEKTİR — Flappy usulü top sektirme oyunu.
 *
 * Fizik: yerçekimi topu aşağı çeker; her dokunuş topu yukarı sektirir ve
 * +1 sekme yazar. Skor arttıkça yerçekimi ağırlaşır ve her sekmede top
 * yanlara daha sert savrulur (duvarlardan ve tavandan seker — tavana
 * yapışarak hile yapılamaz). Top çim şeridine düşerse oyun biter. Rekor
 * cihazda saklanır; skor koyu meydan okuma kartıyla paylaşılabilir.
 * Döngü ~60fps'lik bir zamanlayıcıyla, değerler ref'lerde tutularak işler.
 */

const BEST_KEY = "elitlig.sektir.best.v1";
const BALL = 56; // top çapı (emoji kutusu)
const GROUND = 64; // çim şeridi yüksekliği
const TICK_MS = 16;

// Fizik sabitleri (piksel/saniye)
const GRAVITY_BASE = 1350;
const BOUNCE_VY = -540;
const DRIFT_BASE = 110;

type Phase = "ready" | "playing" | "over";

export default function SektirScreen() {
  const scope = useScope();
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [, setTick] = useState(0); // render tetikleyici

  const area = useRef({ w: 0, h: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const scoreRef = useRef(0);
  const phaseRef = useRef<Phase>("ready");
  const loop = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY).then((v) => setBest(Number(v) || 0));
    return () => {
      if (loop.current) clearInterval(loop.current);
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
  };

  const gameOver = () => {
    if (loop.current) clearInterval(loop.current);
    loop.current = null;
    const finished = scoreRef.current;
    if (finished > 0) {
      setBest((current) => {
        if (finished > current) {
          AsyncStorage.setItem(BEST_KEY, String(finished));
          return finished;
        }
        return current;
      });
    }
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
    }
    setTick((t) => t + 1);
  };

  const tap = () => {
    if (phaseRef.current === "over") return;
    if (phaseRef.current === "ready") {
      resetBall();
      scoreRef.current = 0;
      setScore(0);
      setPhaseBoth("playing");
      if (loop.current) clearInterval(loop.current);
      loop.current = setInterval(step, TICK_MS);
    }
    // Sektir: yukarı it + skorla artan yatay savrulma
    vel.current.y = BOUNCE_VY;
    const drift = DRIFT_BASE * (1 + scoreRef.current * 0.045);
    vel.current.x += (Math.random() * 2 - 1) * drift;
    scoreRef.current += 1;
    setScore(scoreRef.current);
  };

  const restart = () => {
    setPhaseBoth("ready");
    resetBall();
    scoreRef.current = 0;
    setScore(0);
    setTick((t) => t + 1);
  };

  const gravityLevel = Math.min(2.2, 1 + score * 0.025);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Top Sektir" subtitle="Düşürme! Her dokunuş +1" />

      <View style={styles.scoreRow}>
        <View style={styles.scorePill}>
          <Text style={styles.scoreText}>⚽ {score}</Text>
        </View>
        <View style={[styles.scorePill, styles.bestPill]}>
          <Text style={styles.bestText}>🏆 REKOR: {best}</Text>
        </View>
        <View style={[styles.scorePill, styles.levelPill]}>
          <Text style={styles.levelText}>⚡ x{gravityLevel.toFixed(1)}</Text>
        </View>
      </View>

      <Pressable
        style={styles.arena}
        onPress={tap}
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
        {/* Çim şeritleri */}
        <View style={styles.ground}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={[styles.groundStripe, i % 2 === 1 && styles.groundStripeAlt]} />
          ))}
          <View style={styles.groundLine} />
        </View>

        {/* Top */}
        <Text
          style={[
            styles.ball,
            { transform: [{ translateX: pos.current.x }, { translateY: pos.current.y }] },
          ]}
        >
          ⚽
        </Text>

        {phase === "ready" ? (
          <View style={styles.overlay} pointerEvents="none">
            <Text style={styles.overlayTitle}>TOP SEKTİR</Text>
            <Text style={styles.overlayBody}>Başlamak için dokun — top düşmesin!</Text>
            <Text style={styles.overlayHint}>Skor arttıkça yerçekimi ağırlaşır ⚡</Text>
          </View>
        ) : null}

        {phase === "over" ? (
          <GameOver
            score={score}
            best={best}
            onRestart={restart}
            scopeCity={scope.cityLabel}
          />
        ) : null}
      </Pressable>
    </SafeAreaView>
  );
}

function GameOver({
  score,
  best,
  onRestart,
  scopeCity,
}: {
  score: number;
  best: number;
  onRestart: () => void;
  scopeCity: string;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);
  const isRecord = score > 0 && score >= best;

  const igHandle = (() => {
    const url = instagramUrl(scopeCity);
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
      Alert.alert("Bir sorun oldu", "Görsel oluşturulamadı, tekrar dener misin?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.overBox}>
      <Text style={styles.overTitle}>{isRecord ? "🏆 YENİ REKOR!" : "Top düştü!"}</Text>
      <Text style={styles.overScore}>⚽ {score}</Text>
      <Text style={styles.overSub}>Rekorun: {best}</Text>
      <View style={styles.overButtons}>
        <Pressable
          onPress={onRestart}
          style={({ pressed }) => [styles.overBtn, styles.retryBtn, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={16} color={colors.surface} />
          <Text style={styles.retryText}>Tekrar Oyna</Text>
        </Pressable>
        <Pressable
          onPress={() => setShareOpen(true)}
          style={({ pressed }) => [styles.overBtn, styles.shareBtn, pressed && styles.pressed]}
        >
          <Ionicons name="share-social" size={16} color={colors.turf} />
          <Text style={styles.shareBtnText}>Meydan Oku</Text>
        </Pressable>
      </View>

      <Modal
        visible={shareOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setShareOpen(false)}
      >
        <View style={styles.backdrop}>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <View style={styles.shareCard}>
              <Text style={styles.shareBrand}>elitlig</Text>
              <Text style={styles.shareArena}>ARENA · TOP SEKTİR</Text>
              <Text style={styles.shareScore}>⚽ {score}</Text>
              <Text style={styles.shareLabel}>SEKME{isRecord ? " · YENİ REKOR 🏆" : ""}</Text>
              <View style={styles.shareDivider} />
              <Text style={styles.shareChallenge}>"Geç de görelim" 😏</Text>
              <Text style={styles.shareFooter}>ELİTLİG.COM · {igHandle}</Text>
            </View>
          </ViewShot>
          <View style={styles.overButtons}>
            <Pressable
              onPress={() => setShareOpen(false)}
              style={({ pressed }) => [styles.overBtn, styles.closeBtn, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>Kapat</Text>
            </Pressable>
            <Pressable
              onPress={share}
              style={({ pressed }) => [styles.overBtn, styles.retryBtn, pressed && styles.pressed]}
            >
              <Ionicons name="share-social" size={16} color={colors.surface} />
              <Text style={styles.retryText}>{busy ? "Hazırlanıyor…" : "Paylaş"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  scoreRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  scorePill: {
    backgroundColor: colors.turfDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  scoreText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  bestPill: {
    backgroundColor: colors.goldDim,
  },
  bestText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#8A6A06",
  },
  levelPill: {
    backgroundColor: "#FBEDEE",
  },
  levelText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.live,
    fontVariant: ["tabular-nums"],
  },
  arena: {
    flex: 1,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#EFF7FF",
    borderWidth: 1,
    borderColor: colors.faint,
    overflow: "hidden",
  },
  ground: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: GROUND,
    flexDirection: "row",
  },
  groundStripe: {
    flex: 1,
    backgroundColor: "#0F4A2C",
  },
  groundStripeAlt: {
    backgroundColor: "#125534",
  },
  groundLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#3E7D58",
  },
  ball: {
    position: "absolute",
    top: 0,
    left: 0,
    fontSize: BALL - 8,
    width: BALL,
    height: BALL,
    textAlign: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingBottom: GROUND,
  },
  overlayTitle: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 1,
    color: colors.turf,
  },
  overlayBody: {
    ...type.body,
    color: colors.line,
    fontWeight: "700",
  },
  overlayHint: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  overBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.88)",
    paddingBottom: GROUND,
  },
  overTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  overScore: {
    fontSize: 46,
    fontWeight: "900",
    color: colors.turf,
  },
  overSub: {
    ...type.small,
    color: colors.muted,
  },
  overButtons: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  overBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 3,
  },
  retryBtn: {
    backgroundColor: colors.turf,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.surface,
  },
  shareBtn: {
    backgroundColor: colors.turfDim,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.turf,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  shareCard: {
    width: 264,
    backgroundColor: "#18102C",
    borderRadius: 16,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: 4,
  },
  shareBrand: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  shareArena: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#B9A6E4",
  },
  shareScore: {
    fontSize: 48,
    fontWeight: "900",
    color: "#F0BE2E",
    marginTop: spacing.sm,
  },
  shareLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#FFFFFF",
  },
  shareDivider: {
    alignSelf: "stretch",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginVertical: spacing.md,
  },
  shareChallenge: {
    fontSize: 13,
    fontWeight: "700",
    color: "#D9CBF6",
  },
  shareFooter: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#8878B8",
    marginTop: spacing.sm,
  },
  closeBtn: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  closeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
});
