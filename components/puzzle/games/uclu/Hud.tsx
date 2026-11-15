/**
 * Elit Üçlü HUD — SAKİN çerçeve: tahtadaki renkli taşlarla yarışmayan koyu,
 * yarı saydam lacivert kartlar ve ince sıcak (altın) kenarlar.
 *
 *   · Solda "Hedef" kartı: hedef simgeleri ve altlarında kalan sayılar
 *     (toplanınca simge zıplar, bitince yeşil tik).
 *   · Ortada kulüp arması: altın kenarlı kalkan, içinde seviye numarası;
 *     altında "SEVİYE" ya da zorluk rozeti (ZOR / SÜPER ZOR).
 *   · Sağda "Hamle" kartı: iri rakam (az kalınca kırmızı).
 *   · Altta yuvarlak güçlendirici düğmeleri (stok / "+" rozetli) ve skor kartı.
 *
 * Hedef yuvalarının ekran konumu, uçan simgelerin varış noktası için üst
 * bileşene bildirilir (HUD → kart → satır → yuva zinciri).
 * Yükseklikler üst bileşenden gelir (tahta alanı hesaplanırken düşülür).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { fonts, radius, space, textScale, type } from "@/theme";
import { UCLU_BOARD, UCLU_PIECE_COLORS } from "@/lib/puzzle/ucluPalette";
import type { UcluGoalType } from "@/lib/puzzle/levels/uclu";
import { HudPauseButton, type HudButtonSkin } from "@/components/game/HudPauseButton";
import { GoalIcon } from "./GoalIcon";

type IconName = keyof typeof Ionicons.glyphMap;

export interface HudGoal {
  type: UcluGoalType;
  color: number;
  left: number;
  target: number;
}

export function goalLabel(g: { type: UcluGoalType; color: number }): string {
  switch (g.type) {
    case "color":
      return UCLU_PIECE_COLORS[g.color]?.name ?? "Taş";
    case "mud":
      return "Çamur";
    case "crate":
      return "Krampon kutusu";
    case "snow":
      return "Buz";
    case "net":
      return "Kale ağı";
    case "turf":
      return "Çim";
    case "cone":
      return "Antrenman konisi";
    default:
      return "Şampiyonluk kupası";
  }
}

export { GoalIcon };

/** Kart başlığı ve sayı satırının yükseklikleri. */
const CARD_TITLE = 15;
const COUNT_H = 18;
const CARD_PAD = 6;
const LIP = 3;

/** Sakin kart zemini: koyu yarı saydam gradyan, ince sıcak kenar, üst parlama. */
function Card({ width, height, id }: { width: number; height: number; id: string }) {
  const h = height - LIP;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_BOARD.cardTop} />
          <Stop offset="1" stopColor={UCLU_BOARD.cardLow} />
        </LinearGradient>
        <LinearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_BOARD.cardEdgeHi} />
          <Stop offset="1" stopColor={UCLU_BOARD.cardEdge} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={LIP} width={width} height={h} rx={16} fill={UCLU_BOARD.chromeLip} />
      <Rect x={1} y={1} width={width - 2} height={h - 2} rx={15} fill={`url(#${id})`} stroke={`url(#${id}e)`} strokeWidth={2} />
      <Rect x={12} y={3.5} width={Math.max(0, width - 24)} height={2} rx={1} fill={UCLU_BOARD.chromeHi} />
    </Svg>
  );
}

function GoalSlot({ goal, index, icon, onSlot }: { goal: HudGoal; index: number; icon: number; onSlot: (i: number, e: LayoutChangeEvent) => void }) {
  const pop = useRef(new Animated.Value(1)).current;
  const prev = useRef(goal.left);
  useEffect(() => {
    if (prev.current === goal.left) return;
    prev.current = goal.left;
    pop.setValue(1.35);
    Animated.spring(pop, {
      toValue: 1,
      damping: 8,
      stiffness: 280,
      mass: 0.6,
      useNativeDriver: true,
    }).start();
  }, [goal.left, pop]);
  const done = goal.left <= 0;
  return (
    <View style={styles.slot} onLayout={(e) => onSlot(index, e)} accessible accessibilityLabel={`${goalLabel(goal)}: ${done ? "tamamlandı" : `${goal.left} kaldı`}`}>
      <Animated.View style={{ width: icon, height: icon, transform: [{ scale: pop }] }}>
        <GoalIcon type={goal.type} color={goal.color} size={icon} />
      </Animated.View>
      <View style={styles.countRow}>
        {done ? (
          <View style={styles.check}>
            <Ionicons name="checkmark" size={13} color={UCLU_BOARD.hudText} />
          </View>
        ) : (
          <Text style={styles.goalCount} {...textScale.badge} numberOfLines={1}>
            {goal.left}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Orta arma: altın kenarlı kulüp kalkanı, üstünde top, ortasında seviye numarası. */
function Crest({ size, level }: { size: number; level: number }) {
  const shield = "M50 6 C64 12 78 12 90 10 L90 50 C90 74 72 88 50 96 C28 88 10 74 10 50 L10 10 C22 12 36 12 50 6 Z";
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="ucrestg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={UCLU_BOARD.crestHi} />
            <Stop offset="0.55" stopColor={UCLU_BOARD.crest} />
            <Stop offset="1" stopColor={UCLU_BOARD.crestLo} />
          </LinearGradient>
          <LinearGradient id="ucreste" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={UCLU_BOARD.cardEdgeHi} />
            <Stop offset="1" stopColor={UCLU_BOARD.frameWoodLo} />
          </LinearGradient>
        </Defs>
        <Path d={shield} fill={UCLU_BOARD.chromeLip} transform="translate(0 3)" />
        <Path d={shield} fill="url(#ucreste)" stroke={UCLU_BOARD.frameWoodRim} strokeWidth={2} strokeLinejoin="round" />
        <Path d={shield} fill="url(#ucrestg)" transform="translate(50 52) scale(0.84) translate(-50 -52)" />
        {/* Çapraz şeritler (kulüp forması çizgileri), çok hafif. */}
        <Path d="M22 26 L78 82" stroke={UCLU_BOARD.beamCore} strokeOpacity={0.08} strokeWidth={10} />
        <Path d="M20 22 Q50 14 80 22 L80 30 Q50 22 20 30 Z" fill={UCLU_BOARD.beamCore} opacity={0.18} />
        {/* Tepedeki küçük top. */}
        <Circle cx={50} cy={8} r={8.5} fill={UCLU_BOARD.hintBg} stroke={UCLU_BOARD.frameWoodRim} strokeWidth={2} />
        <Path d="M50 4.2 L53.6 6.8 L52.2 11 L47.8 11 L46.4 6.8 Z" fill={UCLU_BOARD.hintInk} />
      </Svg>
      <View style={styles.crestCenter} pointerEvents="none">
        <Text
          style={[
            styles.crestNum,
            {
              fontSize: Math.round(size * (level >= 100 ? 0.27 : 0.34)),
              lineHeight: Math.round(size * 0.4),
            },
          ]}
          {...textScale.badge}
          numberOfLines={1}
        >
          {level}
        </Text>
      </View>
    </View>
  );
}

export interface HudProps {
  level: number;
  /** "ZOR" / "SÜPER ZOR" rozeti; normal seviyede null. */
  tag: string | null;
  moves: number;
  goals: HudGoal[];
  /** HUD'un çizileceği genişlik ve (sabit) yükseklik. */
  width: number;
  height: number;
  /** Hedef kartının ve içindeki satırın HUD içindeki konumu. */
  onGoalsPart: (part: "right" | "row", e: LayoutChangeEvent) => void;
  onGoalSlot: (i: number, e: LayoutChangeEvent) => void;
  /** Durdur: HUD satırının sağ ucunda, kartlarla aynı dilde yuvarlak düğme. */
  onPause?: () => void;
}

/** Durdur düğmesi: HUD kartlarının koyu lacivert yüzü ve sıcak kenarı. */
const PAUSE_SKIN: HudButtonSkin = { face: UCLU_BOARD.cardTop, lip: UCLU_BOARD.chromeLip, edge: UCLU_BOARD.cardEdgeHi, ink: UCLU_BOARD.hudText };

export const Hud = React.memo(function Hud({ level, tag, moves, goals, width, height, onGoalsPart, onGoalSlot, onPause }: HudProps) {
  const gap = space.s;
  const pauseW = onPause ? (width < 360 ? 34 : 38) : 0;
  // Dar ekranda (320) arma ve hamle kartı küçülür; hedef kartı yer kazanır.
  const centerW = Math.round(Math.max(60, Math.min(92, height * 0.82, width * 0.21)));
  const movesW = Math.round(Math.max(64, Math.min(104, width * 0.21)));
  const goalW = width - centerW - movesW - gap * 2 - (pauseW ? pauseW + gap : 0);
  const n = Math.max(1, goals.length);
  const rowH = height - LIP - CARD_PAD * 2 - CARD_TITLE;
  const slotW = (goalW - CARD_PAD * 2 - 4 * (n - 1)) / n;
  const icon = Math.floor(Math.max(20, Math.min(slotW - 2, rowH - COUNT_H, 52)));
  const crest = Math.min(centerW, height - 22);
  const low = moves <= 5;
  return (
    <View style={[styles.hud, { width, height, gap }]}>
      <View style={{ width: goalW, height }} onLayout={(e) => onGoalsPart("right", e)}>
        <Card width={goalW} height={height} id="uhudg" />
        <Text style={styles.cardTitle} {...textScale.badge} numberOfLines={1}>
          Hedef
        </Text>
        <View style={[styles.goals, { height: rowH }]} onLayout={(e) => onGoalsPart("row", e)}>
          {goals.map((g, i) => (
            <GoalSlot key={`${g.type}${g.color}${i}`} goal={g} index={i} icon={icon} onSlot={onGoalSlot} />
          ))}
        </View>
      </View>
      <View style={[styles.center, { width: centerW, height }]} accessible accessibilityLabel={`Seviye ${level}${tag ? `, ${tag}` : ""}`}>
        <Crest size={crest} level={level} />
        <View style={[styles.levelPill, tag ? (tag.length > 4 ? styles.superPill : styles.hardPill) : null]}>
          {tag ? <Ionicons name={tag.length > 4 ? "flame" : "skull"} size={10} color={UCLU_BOARD.hudText} /> : null}
          <Text style={styles.levelText} {...textScale.badge} numberOfLines={1}>
            {tag ?? "SEVİYE"}
          </Text>
        </View>
      </View>
      <MovesCard moves={moves} width={movesW} height={height} low={low} />
      {onPause ? <HudPauseButton onPress={onPause} size={pauseW} skin={PAUSE_SKIN} /> : null}
    </View>
  );
});

/** "Hamle" kartı: iri rakam; değişince zıplar, az kalınca kırmızıya döner. */
function MovesCard({ moves, width, height, low }: { moves: number; width: number; height: number; low: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const prev = useRef(moves);
  useEffect(() => {
    if (prev.current === moves) return;
    prev.current = moves;
    pulse.setValue(1.18);
    Animated.spring(pulse, {
      toValue: 1,
      damping: 9,
      stiffness: 300,
      mass: 0.6,
      useNativeDriver: true,
    }).start();
  }, [moves, pulse]);
  const big = height - LIP - CARD_TITLE - CARD_PAD * 2 >= 56;
  return (
    <View style={{ width, height }} accessible accessibilityLabel={`${moves} hamle kaldı`}>
      <Card width={width} height={height} id="uhudm" />
      <Text style={styles.cardTitle} {...textScale.badge} numberOfLines={1}>
        Hamle
      </Text>
      <View style={styles.movesBox}>
        <Animated.Text
          style={[big ? styles.movesHero : styles.movesValue, low && styles.movesLow, { transform: [{ scale: pulse }] }]}
          {...textScale.badge}
          numberOfLines={1}
        >
          {moves}
        </Animated.Text>
      </View>
    </View>
  );
}

/* ───────────────────────────── güçlendiriciler ───────────────────────────── */

export interface LiveBooster {
  key: string;
  title: string;
  /** Düğme altındaki kısa ad. */
  short: string;
  icon: string;
  stock: number;
  active: boolean;
}

/** Yuvarlak güçlendirici düğmesi: altın halkalı parlak küre, sağ üstte stok ya da "+" rozeti. */
function BoosterOrb({
  b,
  size,
  disabled,
  onPress,
  still,
  phase,
}: {
  b: LiveBooster;
  size: number;
  disabled: boolean;
  onPress: (key: string) => void;
  still: boolean;
  phase: number;
}) {
  // Kullanılabilir düğme ara ara kıpırdar (sonlu döngü; devre dışıyken / hareketi azalt açıkken durur).
  const wig = useRef(new Animated.Value(0)).current;
  const usable = !disabled && !b.active && b.stock > 0;
  useEffect(() => {
    wig.setValue(0);
    if (!usable || still) return;
    const shakeSeq = Animated.sequence([
      Animated.delay(3600 + phase),
      Animated.timing(wig, {
        toValue: 1,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(wig, {
        toValue: -1,
        duration: 140,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(wig, {
        toValue: 0.6,
        duration: 120,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(wig, {
        toValue: -0.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(wig, { toValue: 0, duration: 90, useNativeDriver: true }),
      Animated.delay(1400 - phase),
    ]);
    const shake = Animated.loop(shakeSeq, { iterations: 200 });
    shake.start();
    return () => shake.stop();
  }, [usable, still, phase, wig]);
  const wigRotate = wig.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-8deg", "8deg"],
  });
  const gid = `uorb${b.active ? 1 : 0}`;
  const badge = Math.max(20, Math.round(size * 0.36));
  return (
    <Pressable
      onPress={() => onPress(b.key)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${b.title}, stok ${b.stock}${b.active ? ", seçili" : ""}`}
      accessibilityState={{ disabled, selected: b.active }}
      style={[{ width: size, height: size }, disabled && styles.boosterOff]}
    >
      {({ pressed }) => (
        <Animated.View
          style={{
            width: size,
            height: size,
            transform: [{ rotate: wigRotate }, { scale: pressed ? 0.94 : 1 }],
          }}
        >
          <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id={gid} cx="38%" cy="30%" r="75%">
                <Stop offset="0" stopColor={b.active ? UCLU_BOARD.accentHi : UCLU_BOARD.orbHi} />
                <Stop offset="0.55" stopColor={b.active ? UCLU_BOARD.accent : UCLU_BOARD.orb} />
                <Stop offset="1" stopColor={b.active ? UCLU_BOARD.accentLo : UCLU_BOARD.orbLo} />
              </RadialGradient>
              <LinearGradient id="uorbe" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={UCLU_BOARD.cardEdgeHi} />
                <Stop offset="1" stopColor={UCLU_BOARD.frameWoodLo} />
              </LinearGradient>
            </Defs>
            <Circle cx={50} cy={53} r={46} fill={UCLU_BOARD.chromeLip} />
            <Circle cx={50} cy={50} r={46} fill="url(#uorbe)" stroke={UCLU_BOARD.frameWoodRim} strokeWidth={1.5} />
            <Circle cx={50} cy={50} r={39} fill={`url(#${gid})`} />
            <Ellipse cx={42} cy={28} rx={22} ry={10} fill={UCLU_BOARD.beamCore} opacity={0.22} />
          </Svg>
          <View style={styles.orbIcon} pointerEvents="none">
            <Ionicons name={b.icon as IconName} size={Math.round(size * 0.42)} color={UCLU_BOARD.hudText} style={styles.iconShadow} />
          </View>
          <View style={[styles.stock, { minWidth: badge, height: badge, borderRadius: badge / 2 }, b.stock <= 0 && styles.stockEmpty]} pointerEvents="none">
            {b.stock > 0 ? (
              <Text style={styles.stockText} {...textScale.badge}>
                {b.stock}
              </Text>
            ) : (
              <Ionicons name="add" size={Math.round(badge * 0.75)} color={UCLU_BOARD.accentInk} />
            )}
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

export const BoosterBar = React.memo(function BoosterBar({
  boosters,
  disabled,
  onPress,
  score,
  width,
  height,
  still = false,
}: {
  boosters: LiveBooster[];
  disabled: boolean;
  onPress: (key: string) => void;
  score: number;
  width: number;
  height: number;
  still?: boolean;
}) {
  // Skor artınca rakam zıplar.
  const bump = useRef(new Animated.Value(1)).current;
  const prevScore = useRef(score);
  useEffect(() => {
    if (prevScore.current === score) return;
    prevScore.current = score;
    if (still) return;
    bump.setValue(1.25);
    Animated.spring(bump, {
      toValue: 1,
      damping: 7,
      stiffness: 300,
      mass: 0.6,
      useNativeDriver: true,
    }).start();
  }, [score, still, bump]);
  // Düğme altında kısa ad için yer varsa çizilir; yoksa yalnız simge (erişilebilirlik etiketi her zaman var).
  const labelH = height >= 78 ? 14 : 0;
  const orb = Math.min(height - labelH - 4, 76);
  const orbBox = orb + 6;
  const scoreW = Math.max(96, width - boosters.length * (orbBox + space.sm));
  const scoreH = Math.min(height - 4, 64);
  return (
    <View style={[styles.bar, { width, height }]}>
      {boosters.map((b, i) => (
        <View key={b.key} style={[styles.orbCol, { width: orbBox }]}>
          <BoosterOrb b={b} size={orb} disabled={disabled && !b.active} onPress={onPress} still={still} phase={i * 700} />
          {labelH ? (
            <Text style={styles.orbLabel} {...textScale.badge} numberOfLines={1}>
              {b.short}
            </Text>
          ) : null}
        </View>
      ))}
      <View style={[styles.scoreBox, { width: scoreW, height: scoreH }]} accessible accessibilityLabel={`Skor ${score}`}>
        <Card width={scoreW} height={scoreH} id="uscore" />
        <Text style={styles.scoreLabel} {...textScale.badge}>
          Skor
        </Text>
        <Animated.Text style={[styles.scoreValue, { transform: [{ scale: bump }] }]} {...textScale.badge} numberOfLines={1} adjustsFontSizeToFit>
          {score.toLocaleString("tr-TR")}
        </Animated.Text>
      </View>
    </View>
  );
});

/**
 * İpucu balonu: tahtanın alt kenarının üstünde, dokunmayı engellemeden
 * (pointerEvents none) görünen kısa bilgi / çekiç yönergesi.
 */
export function HintBubble({ text, bottom, left, width }: { text: string; bottom: number; left: number; width: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    t.setValue(0);
    Animated.spring(t, {
      toValue: 1,
      damping: 12,
      stiffness: 220,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [text, t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bubble,
        {
          bottom,
          left,
          width,
          opacity: t,
          transform: [
            {
              translateY: t.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.bubbleIcon}>
        <Ionicons name="bulb" size={18} color={UCLU_BOARD.accentInk} />
      </View>
      <Text style={styles.bubbleText} {...textScale.dense} numberOfLines={3}>
        {text}
      </Text>
    </Animated.View>
  );
}

/** Arcade yazısı: beyaz, lacivert gölgeli (bulanıklıksız). */
const outline = {
  textShadowColor: UCLU_BOARD.textShadowSoft,
  textShadowRadius: 3,
  textShadowOffset: { width: 0, height: 1 },
};

const styles = StyleSheet.create({
  hud: { flexDirection: "row", alignItems: "stretch" },
  cardTitle: {
    ...type.micro,
    fontFamily: fonts.bold,
    color: UCLU_BOARD.cardTitle,
    textAlign: "center",
    letterSpacing: 0.6,
    height: CARD_TITLE,
    marginTop: CARD_PAD - 1,
    ...outline,
  },
  goals: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: CARD_PAD,
  },
  slot: { flex: 1, alignItems: "center", justifyContent: "center" },
  countRow: { height: COUNT_H, alignItems: "center", justifyContent: "center" },
  goalCount: { ...type.scoreXs, color: UCLU_BOARD.hudText, ...outline },
  check: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UCLU_BOARD.accent,
  },
  center: { alignItems: "center", justifyContent: "center" },
  crestCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
  },
  crestNum: { fontFamily: fonts.bold, color: UCLU_BOARD.hudText, ...outline },
  levelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: -4,
    height: 18,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: UCLU_BOARD.cardLow,
    borderWidth: 1,
    borderColor: UCLU_BOARD.cardEdge,
  },
  hardPill: { backgroundColor: UCLU_BOARD.btnHammer },
  superPill: { backgroundColor: UCLU_BOARD.lowLo },
  levelText: {
    ...type.nano,
    fontFamily: fonts.bold,
    color: UCLU_BOARD.hudText,
    letterSpacing: 0.6,
  },
  movesBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: LIP + 2,
  },
  movesValue: { ...type.scoreLg, color: UCLU_BOARD.hudText, ...outline },
  movesHero: { ...type.scoreHero, color: UCLU_BOARD.hudText, ...outline },
  movesLow: { color: UCLU_BOARD.lowHi },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  orbCol: { alignItems: "center" },
  orbIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  iconShadow: { ...outline },
  orbLabel: {
    ...type.nano,
    fontFamily: fonts.bold,
    color: UCLU_BOARD.hudMuted,
    letterSpacing: 0.6,
    marginTop: 2,
  },
  boosterOff: { opacity: 0.55 },
  stock: {
    position: "absolute",
    top: -4,
    right: -6,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UCLU_BOARD.hintBg,
    borderWidth: 1.5,
    borderColor: UCLU_BOARD.cardEdge,
  },
  stockEmpty: { backgroundColor: UCLU_BOARD.accent },
  stockText: { ...type.numSmStrong, color: UCLU_BOARD.hintInk },
  scoreBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: LIP,
  },
  scoreLabel: {
    ...type.micro,
    fontFamily: fonts.bold,
    color: UCLU_BOARD.cardTitle,
    letterSpacing: 0.6,
    ...outline,
  },
  scoreValue: { ...type.scoreMd, color: UCLU_BOARD.hudText, ...outline },
  bubble: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.xl,
    backgroundColor: UCLU_BOARD.hintBg,
    shadowColor: UCLU_BOARD.ink,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  bubbleIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UCLU_BOARD.accent,
  },
  bubbleText: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: UCLU_BOARD.hintInk,
    flex: 1,
  },
});
