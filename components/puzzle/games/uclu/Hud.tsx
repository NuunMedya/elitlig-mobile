/**
 * Elit Üçlü HUD — arcade oyunlarının ÇİZGİ FİLM dili: kalın lacivert konturlu
 * mor-lacivert panel, iri beyaz rakamlı mavi hamle rozeti, altın seviye
 * kurdelesi, lacivert hap hedef çipleri (toplanınca zıplar) ve altta dudaklı,
 * tıknaz 3B güçlendirici düğmeleri (stok rozetli) + skor hapı.
 * Hedef çiplerinin ekran konumu, uçan simgelerin varış noktası için üst
 * bileşene bildirilir.
 *
 * Yükseklikler üst bileşenden gelir (tahta alanı hesaplanırken düşülür):
 * HUD ve güçlendirici çubuğu sabit yükseklikte çizilir, ekran uzunsa büyür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { fonts, radius, space, textScale, type } from "@/theme";
import { UCLU_BOARD, UCLU_PIECE_COLORS } from "@/lib/puzzle/ucluPalette";
import type { UcluGoalType } from "@/lib/puzzle/levels/uclu";
import { PieceGlyph } from "./Piece";

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
      return UCLU_PIECE_COLORS[g.color]?.name ?? "Top";
    case "mud":
      return "Çamur";
    case "crate":
      return "Krampon kutusu";
    case "snow":
      return "Kar";
    default:
      return "Şampiyonluk kupası";
  }
}

export function GoalIcon({ type: kind, color, size }: { type: UcluGoalType; color: number; size: number }) {
  if (kind === "color") return <PieceGlyph kind="gem" color={color} special="none" size={size} />;
  if (kind === "trophy") return <PieceGlyph kind="trophy" color={-1} special="none" size={size} />;
  const map: Record<string, { icon: IconName; tint: string; bg: string; edge: string }> = {
    mud: {
      icon: "water",
      tint: UCLU_BOARD.woodHi,
      bg: UCLU_BOARD.mud,
      edge: UCLU_BOARD.mudDeep,
    },
    crate: {
      icon: "cube",
      tint: UCLU_BOARD.woodHi,
      bg: UCLU_BOARD.woodLo,
      edge: UCLU_BOARD.rimInner,
    },
    snow: {
      icon: "snow",
      tint: UCLU_BOARD.snowInk,
      bg: UCLU_BOARD.snowEdge,
      edge: UCLU_BOARD.snowInk,
    },
  };
  const m = map[kind];
  return (
    <View
      style={[
        styles.iconTile,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: m.bg,
          borderBottomColor: m.edge,
        },
      ]}
    >
      <Ionicons name={m.icon} size={Math.round(size * 0.66)} color={m.tint} />
    </View>
  );
}

function GoalChip({
  goal,
  index,
  height,
  compact,
  onSlot,
}: {
  goal: HudGoal;
  index: number;
  height: number;
  compact: boolean;
  onSlot: (i: number, e: LayoutChangeEvent) => void;
}) {
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
  const icon = Math.max(20, height - 12);
  const progress = Math.min(1, Math.max(0, (goal.target - goal.left) / Math.max(1, goal.target)));
  return (
    <View
      style={[styles.goal, { height, paddingLeft: (height - icon) / 2 }, compact && styles.goalCompact]}
      onLayout={(e) => onSlot(index, e)}
      accessible
      accessibilityLabel={`${goalLabel(goal)}: ${done ? "tamamlandı" : `${goal.left} kaldı`}`}
    >
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <GoalIcon type={goal.type} color={goal.color} size={icon} />
      </Animated.View>
      {done ? (
        <View style={[styles.check, compact && styles.overlayBadge]}>
          <Ionicons name="checkmark" size={16} color={UCLU_BOARD.hudText} />
        </View>
      ) : compact ? (
        <View style={[styles.countPill, styles.overlayBadge]}>
          <Text style={styles.countSmall} {...textScale.badge}>
            {goal.left}
          </Text>
        </View>
      ) : (
        <Text style={styles.goalCount} {...textScale.badge} numberOfLines={1}>
          {goal.left}
        </Text>
      )}
      <View style={styles.track} pointerEvents="none">
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: done ? UCLU_BOARD.barDone : UCLU_BOARD.barFill,
            },
          ]}
        />
      </View>
    </View>
  );
}

/** Parlak, yuvarlak hamle rozeti (az hamle kalınca kırmızıya döner). */
function MovesBadge({ moves, size }: { moves: number; size: number }) {
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
  const low = moves <= 5;
  const id = low ? "umvl" : "umv";
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale: pulse }] }} accessible accessibilityLabel={`${moves} hamle kaldı`}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={UCLU_BOARD.hintBg} />
            <Stop offset="1" stopColor={UCLU_BOARD.cardSoft} />
          </LinearGradient>
        </Defs>
        <Circle cx={50} cy={51} r={46} fill={UCLU_BOARD.chromeLip} />
        <Circle cx={50} cy={48} r={46} fill={`url(#${id})`} />
        <Circle cx={50} cy={48} r={45} fill="none" stroke={low ? UCLU_BOARD.lowLo : UCLU_BOARD.chromeEdge} strokeWidth={low ? 3 : 1.5} />
      </Svg>
      <View style={styles.badgeCenter} pointerEvents="none">
        <Text style={[size >= 84 ? styles.movesHero : styles.movesValue, low && styles.movesLow]} {...textScale.badge}>
          {moves}
        </Text>
        <Text style={styles.movesLabel} {...textScale.badge}>
          HAMLE
        </Text>
      </View>
    </Animated.View>
  );
}

/** Skor tabelası zemini: koyu lacivert gradyan, altın kenar, üst parlama. */
function Panel({ width, height, id }: { width: number; height: number; id: string }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_BOARD.panelTop} />
          <Stop offset="1" stopColor={UCLU_BOARD.panelLow} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={3} width={width} height={height - 3} rx={18} fill={UCLU_BOARD.chromeLip} />
      <Rect x={0} y={0} width={width} height={height - 3} rx={18} fill={`url(#${id})`} />
      <Rect x={0.5} y={0.5} width={width - 1} height={height - 4} rx={18} fill="none" stroke={UCLU_BOARD.chromeEdge} strokeWidth={1} />
    </Svg>
  );
}

export interface HudProps {
  level: number;
  cup: boolean;
  moves: number;
  goals: HudGoal[];
  /** HUD'un çizileceği genişlik ve (sabit) yükseklik. */
  width: number;
  height: number;
  /** Hedef satırının HUD içindeki konumu (sağ sütun + satır). */
  onGoalsPart: (part: "right" | "row", e: LayoutChangeEvent) => void;
  onGoalSlot: (i: number, e: LayoutChangeEvent) => void;
}

/** Başlık satırının (kurdele) yüksekliği. */
const TITLE_H = 24;

export const Hud = React.memo(function Hud({ level, cup, moves, goals, width, height, onGoalsPart, onGoalSlot }: HudProps) {
  const pad = space.sm;
  const inner = height - 4 - pad * 2;
  const badge = inner;
  const rightW = width - pad * 3 - badge;
  const chipH = Math.max(32, inner - TITLE_H - space.xs);
  const n = Math.max(1, goals.length);
  const perChip = (rightW - space.s * (n - 1)) / n;
  const compact = perChip < chipH + 34;
  return (
    <View style={[styles.hud, { width, height, padding: pad, paddingBottom: pad + 4, gap: pad }]}>
      <Panel width={width} height={height} id="uhud" />
      <MovesBadge moves={moves} size={badge} />
      <View style={styles.right} onLayout={(e) => onGoalsPart("right", e)}>
        <View style={[styles.titleRow, { height: TITLE_H }]}>
          <View style={styles.ribbon}>
            <Text style={styles.ribbonText} {...textScale.badge} numberOfLines={1}>
              SEVİYE {level}
            </Text>
          </View>
          {cup ? (
            <View style={styles.cupBadge}>
              <Ionicons name="trophy" size={12} color={UCLU_BOARD.hudText} />
              <Text style={styles.cupText} {...textScale.badge}>
                KUPA MAÇI
              </Text>
            </View>
          ) : null}
          <Text style={styles.goalsLabel} {...textScale.badge} numberOfLines={1}>
            HEDEF
          </Text>
        </View>
        <View style={styles.goals} onLayout={(e) => onGoalsPart("row", e)}>
          {goals.map((g, i) => (
            <GoalChip key={`${g.type}${g.color}${i}`} goal={g} index={i} height={chipH} compact={compact} onSlot={onGoalSlot} />
          ))}
        </View>
      </View>
    </View>
  );
});

/* ───────────────────────────── güçlendiriciler ───────────────────────────── */

export interface LiveBooster {
  key: string;
  title: string;
  /** Düğme üstündeki kısa ad. */
  short: string;
  icon: string;
  stock: number;
  active: boolean;
}

const LIP = 6;

/** Güçlendirici düğmeleri nötr (lacivert); seçili olan tek vurgu renginde (yeşil). */
const NEUTRAL_TONE = {
  hi: UCLU_BOARD.panelTop,
  base: UCLU_BOARD.panelLow,
  lo: UCLU_BOARD.chromeLip,
};
const BTN_TONES: Record<string, { hi: string; base: string; lo: string }> = {
  cekic: NEUTRAL_TONE,
  karistir: NEUTRAL_TONE,
};
const ACTIVE_TONE = {
  hi: UCLU_BOARD.accentHi,
  base: UCLU_BOARD.accent,
  lo: UCLU_BOARD.accentLo,
};

function BoosterButton({
  b,
  width,
  height,
  disabled,
  onPress,
  still,
  phase,
}: {
  b: LiveBooster;
  width: number;
  height: number;
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
    outputRange: ["-7deg", "7deg"],
  });
  const wigScale = wig.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [1.05, 1, 1.05],
  });
  const tone = b.active ? ACTIVE_TONE : (BTN_TONES[b.key] ?? BTN_TONES.karistir);
  const face = height - LIP;
  const ink = UCLU_BOARD.hudText;
  const gid = `ubtn${b.key}${b.active ? 1 : 0}`;
  return (
    <Pressable
      onPress={() => onPress(b.key)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${b.title}, stok ${b.stock}${b.active ? ", seçili" : ""}`}
      accessibilityState={{ disabled, selected: b.active }}
      style={[{ width, height }, disabled && styles.boosterOff]}
    >
      {({ pressed }) => (
        <Animated.View
          style={{
            width,
            height,
            transform: [{ rotate: wigRotate }, { scale: wigScale }],
          }}
        >
          <View style={[styles.btnLip, { top: LIP, height: face, backgroundColor: tone.lo }]} />
          <View
            style={[
              styles.btnFace,
              {
                height: face,
                transform: [{ translateY: pressed ? LIP - 1 : 0 }],
              },
            ]}
          >
            <Svg width={width} height={face} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={tone.hi} />
                  <Stop offset="1" stopColor={tone.base} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={width} height={face} rx={16} fill={`url(#${gid})`} />
              <Rect x={0.5} y={0.5} width={width - 1} height={face - 1} rx={16} fill="none" stroke={UCLU_BOARD.chromeEdge} strokeWidth={1} />
            </Svg>
            <Ionicons name={b.icon as IconName} size={Math.round(face * 0.46)} color={ink} style={styles.btnIcon} />
            <Text style={[styles.btnText, { color: ink }]} {...textScale.badge} numberOfLines={1}>
              {b.short}
            </Text>
          </View>
          <View style={[styles.stock, b.stock <= 0 && styles.stockEmpty]} pointerEvents="none">
            {b.stock > 0 ? (
              <Text style={styles.stockText} {...textScale.badge}>
                {b.stock}
              </Text>
            ) : (
              <Ionicons name="add" size={16} color={UCLU_BOARD.accentInk} />
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
  const btnW = Math.min(Math.round(height * 1.25), Math.floor((width - space.sm * 2) / 3));
  const [first, ...rest] = boosters;
  const centerW = width - btnW * boosters.length - space.sm * 2;
  const centerH = height - LIP;
  const button = (b: LiveBooster, i: number) => (
    <BoosterButton key={b.key} b={b} width={btnW} height={height} disabled={disabled && !b.active} onPress={onPress} still={still} phase={i * 700} />
  );
  return (
    <View style={[styles.bar, { width, height }]}>
      {first ? button(first, 0) : null}
      <View style={[styles.scoreBox, { width: centerW, height: centerH }]} accessible accessibilityLabel={`Skor ${score}`}>
        <Panel width={centerW} height={centerH} id="uscore" />
        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel} {...textScale.badge}>
            SKOR
          </Text>
        </View>
        <Animated.Text style={[styles.scoreValue, { transform: [{ scale: bump }] }]} {...textScale.badge} numberOfLines={1} adjustsFontSizeToFit>
          {score.toLocaleString("tr-TR")}
        </Animated.Text>
      </View>
      {rest.map((b, i) => button(b, i + 1))}
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
  hud: { flexDirection: "row", alignItems: "center" },
  badgeCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
  },
  movesLabel: {
    ...type.nano,
    color: UCLU_BOARD.hintInk,
    opacity: 0.6,
    letterSpacing: 1,
    marginTop: -2,
  },
  movesValue: { ...type.scoreLg, color: UCLU_BOARD.hintInk },
  movesHero: { ...type.scoreHero, color: UCLU_BOARD.hintInk },
  movesLow: { color: UCLU_BOARD.lowLo },
  right: { flex: 1, alignSelf: "stretch", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  ribbon: {
    paddingHorizontal: space.md,
    height: 22,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: UCLU_BOARD.chromeHi,
    flexShrink: 1,
  },
  ribbonText: {
    ...type.label,
    fontFamily: fonts.bold,
    color: UCLU_BOARD.hudText,
    letterSpacing: 0.6,
  },
  cupBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 22,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: UCLU_BOARD.chromeHi,
  },
  cupText: {
    ...type.micro,
    fontFamily: fonts.bold,
    color: UCLU_BOARD.hudText,
    ...outline,
  },
  goalsLabel: {
    ...type.micro,
    fontFamily: fonts.bold,
    color: UCLU_BOARD.hudText,
    marginLeft: "auto",
    letterSpacing: 1,
    ...outline,
  },
  goals: { flexDirection: "row", gap: space.s },
  goal: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingRight: space.s,
    borderRadius: radius.lg,
    backgroundColor: UCLU_BOARD.chrome,
    overflow: "hidden",
  },
  goalCompact: { justifyContent: "center", paddingRight: 0 },
  goalCount: {
    ...type.scoreLg,
    color: UCLU_BOARD.hudText,
    flexShrink: 1,
    ...outline,
  },
  countPill: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UCLU_BOARD.hintBg,
  },
  countSmall: { ...type.numSmStrong, color: UCLU_BOARD.hintInk },
  overlayBadge: { position: "absolute", right: 2, top: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UCLU_BOARD.accent,
  },
  track: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 3,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: UCLU_BOARD.barTrack,
    overflow: "hidden",
  },
  fill: { height: 4, borderRadius: radius.pill },
  iconTile: {
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 3,
  },
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  btnLip: { position: "absolute", left: 0, right: 0, borderRadius: radius.xl },
  btnFace: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  btnIcon: { ...outline },
  btnText: {
    ...type.label,
    fontFamily: fonts.bold,
    letterSpacing: 0.5,
    marginTop: 1,
    ...outline,
  },
  boosterOff: { opacity: 0.55 },
  stock: {
    position: "absolute",
    top: -7,
    right: -5,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UCLU_BOARD.hintBg,
  },
  stockEmpty: { backgroundColor: UCLU_BOARD.accent },
  stockText: { ...type.scoreXs, color: UCLU_BOARD.hintInk },
  scoreBox: { alignItems: "center", justifyContent: "center" },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  scoreLabel: {
    ...type.micro,
    fontFamily: fonts.bold,
    color: UCLU_BOARD.hudText,
    letterSpacing: 1.5,
    ...outline,
  },
  scoreValue: { ...type.scoreLg, color: UCLU_BOARD.hudText, ...outline },
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
