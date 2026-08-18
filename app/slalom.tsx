import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import { DetailHeader } from "@/components/ScreenHeader";
import { colors, radius, spacing, type } from "@/constants/theme";
import { submitArenaScore } from "@/lib/api/arena";
import { instagramUrl } from "@/lib/socials";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";

/**
 * SLALOM — sonsuz koşu: top sahada ileri koşar, konilerden kaçınılır.
 *
 * Koşu illüzyonu ters çevrilmiştir: top sabit yükseklikte durur, koniler
 * üstten aşağı akar. Ekranın sol/sağ yarısına BASILI TUTMAK topu o yöne
 * kaydırır. Atlatılan her koni +1; skor arttıkça akış hızlanır ve koniler
 * sıklaşır (⚡ göstergesi çarpanı söyler). Koniye çarpınca oyun biter;
 * rekor cihazda saklanır ve koyu meydan okuma kartıyla paylaşılır.
 */

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

interface Cone {
  id: number;
  x: number;
  y: number;
  passed: boolean;
}

type Phase = "ready" | "playing" | "over";

export default function SlalomScreen() {
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

  const speedFactor = () => Math.min(2.6, 1 + scoreRef.current * 0.02);

  const gameOver = () => {
    if (loop.current) clearInterval(loop.current);
    loop.current = null;
    const finished = scoreRef.current;
    if (auth.user && finished > 0) submitArenaScore("slalom", finished).catch(() => {});
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
      const spawn = (offset = 0) => {
        cones.current.push({
          id: coneSeq.current++,
          x: Math.random() * (w - CONE_W),
          y: -CONE_H - offset,
          passed: false,
        });
      };
      spawn();
      if (scoreRef.current > 15 && Math.random() < 0.35) spawn(CONE_H * 2);
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
      // Atlatma: koni topun hizasını geçti
      if (!cone.passed && cone.y > ballY + BALL) {
        cone.passed = true;
        scoreRef.current += 1;
        setScore(scoreRef.current);
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
    setScore(0);
    setPhaseBoth("playing");
    if (loop.current) clearInterval(loop.current);
    loop.current = setInterval(step, TICK_MS);
  };

  const restart = () => {
    setPhaseBoth("ready");
    cones.current = [];
    setScore(0);
    scoreRef.current = 0;
    setTick((t) => t + 1);
  };

  const ballY = area.current.h * BALL_Y_RATIO;
  const factor = Math.min(2.6, 1 + score * 0.02);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Slalom" subtitle="Basılı tut, konilerden kaç!" />

      <View style={styles.scoreRow}>
        <View style={styles.scorePill}>
          <Text style={styles.scoreText}>🚩 {score}</Text>
        </View>
        <View style={[styles.scorePill, styles.bestPill]}>
          <Text style={styles.bestText}>🏆 REKOR: {best}</Text>
        </View>
        <View style={[styles.scorePill, styles.levelPill]}>
          <Text style={styles.levelText}>⚡ x{factor.toFixed(1)}</Text>
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
        {/* Çim şeritleri */}
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
        <View style={[styles.sideline, { left: 4 }]} />
        <View style={[styles.sideline, { right: 4 }]} />

        {/* Koniler */}
        {cones.current.map((cone) => (
          <View
            key={cone.id}
            style={[styles.cone, { transform: [{ translateX: cone.x }, { translateY: cone.y }] }]}
            pointerEvents="none"
          >
            <View style={styles.coneTriangle} />
            <View style={styles.coneBase} />
          </View>
        ))}

        {/* Top */}
        <Text
          style={[
            styles.ball,
            { transform: [{ translateX: ballX.current }, { translateY: ballY }] },
          ]}
        >
          ⚽
        </Text>

        {/* Kontroller: sol/sağ yarı, basılı tut */}
        <View style={styles.controls}>
          <Pressable
            style={styles.controlHalf}
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
            onPressIn={() => {
              if (phaseRef.current === "ready") start();
              dir.current = 1;
            }}
            onPressOut={() => {
              if (dir.current === 1) dir.current = 0;
            }}
          />
        </View>

        {phase === "ready" ? (
          <View style={styles.overlay} pointerEvents="none">
            <Text style={styles.overlayTitle}>SLALOM</Text>
            <Text style={styles.overlayBody}>Sol/sağ yarıya basılı tut, topu kaydır</Text>
            <Text style={styles.overlayHint}>Başlamak için dokun · hız sürekli artar ⚡</Text>
          </View>
        ) : null}

        {phase === "over" ? (
          <GameOver score={score} best={best} onRestart={restart} scopeCity={scope.cityLabel} />
        ) : null}
      </View>
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
      <Text style={styles.overTitle}>{isRecord ? "🏆 YENİ REKOR!" : "Koniye çarptın!"}</Text>
      <Text style={styles.overScore}>🚩 {score}</Text>
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
          style={({ pressed }) => [styles.overBtn, styles.challengeBtn, pressed && styles.pressed]}
        >
          <Ionicons name="share-social" size={16} color={colors.turf} />
          <Text style={styles.challengeText}>Meydan Oku</Text>
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
              <Text style={styles.shareArena}>ARENA · SLALOM</Text>
              <Text style={styles.shareScore}>🚩 {score}</Text>
              <Text style={styles.shareLabel}>KONİ{isRecord ? " · YENİ REKOR 🏆" : ""}</Text>
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
    backgroundColor: "#0F4A2C",
    overflow: "hidden",
  },
  stripe: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#0F4A2C",
  },
  stripeAlt: {
    backgroundColor: "#125534",
  },
  sideline: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#3E7D58",
  },
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
    borderBottomColor: "#F08C14",
  },
  coneBase: {
    width: CONE_W,
    height: 5,
    borderRadius: 2,
    backgroundColor: "#D97706",
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(10, 40, 24, 0.55)",
  },
  overlayTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
    color: "#FFFFFF",
  },
  overlayBody: {
    ...type.body,
    color: "#E7F3EC",
    fontWeight: "700",
  },
  overlayHint: {
    ...type.caption,
    color: "#B9D8C6",
    letterSpacing: 0,
  },
  overBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.9)",
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
  challengeBtn: {
    backgroundColor: colors.turfDim,
  },
  challengeText: {
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
    fontSize: 46,
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
