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
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { fonts, radius, space, textScale, type } from "@/theme";
import { CARTOON } from "@/lib/game/cartoon";
import { UCLU_BOARD, UCLU_OUTLINE } from "@/lib/puzzle/ucluPalette";
import { UCLU_PIECES, type UcluGoalType } from "@/lib/puzzle/levels/uclu";
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
      return UCLU_PIECES[g.color]?.name ?? "Taş";
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
    mud: { icon: "water", tint: UCLU_BOARD.woodHi, bg: UCLU_BOARD.mud, edge: UCLU_BOARD.mudDeep },
    crate: { icon: "cube", tint: UCLU_BOARD.woodHi, bg: UCLU_BOARD.woodLo, edge: UCLU_BOARD.rimInner },
    snow: { icon: "snow", tint: UCLU_BOARD.snowInk, bg: UCLU_BOARD.snowEdge, edge: UCLU_BOARD.snowInk },
  };
  const m = map[kind];
  return (
    <View style={[styles.iconTile, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: m.bg, borderBottomColor: m.edge }]}>
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
    Animated.spring(pop, { toValue: 1, damping: 8, stiffness: 280, mass: 0.6, useNativeDriver: true }).start();
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
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: done ? UCLU_BOARD.barDone : UCLU_BOARD.barFill }]} />
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
    Animated.spring(pulse, { toValue: 1, damping: 9, stiffness: 300, mass: 0.6, useNativeDriver: true }).start();
  }, [moves, pulse]);
  const low = moves <= 5;
  const id = low ? "umvl" : "umv";
  return (
    <Animated.View
      style={{ width: size, height: size, transform: [{ scale: pulse }] }}
      accessible
      accessibilityLabel={`${moves} hamle kaldı`}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={low ? UCLU_BOARD.lowHi : UCLU_BOARD.movesHi} />
            <Stop offset="0.75" stopColor={low ? UCLU_BOARD.lowLo : UCLU_BOARD.movesLo} />
          </LinearGradient>
          <LinearGradient id="umvring" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={UCLU_BOARD.trimHi} />
            <Stop offset="1" stopColor={UCLU_BOARD.trimLo} />
          </LinearGradient>
        </Defs>
        <Circle cx={50} cy={52} r={45} fill={low ? UCLU_BOARD.lowRim : UCLU_BOARD.movesRim} stroke={UCLU_OUTLINE} strokeWidth={4} />
        <Circle cx={50} cy={47} r={45} fill={`url(#${id})`} stroke={UCLU_OUTLINE} strokeWidth={4} />
        <Circle cx={50} cy={47} r={38} fill="none" stroke="url(#umvring)" strokeWidth={3} strokeOpacity={0.9} />
        <Path d="M22 36 C26 22 38 14 52 13 C57 13 57 20 52 20.5 C41 21.5 33 27 29 37 C27 42 20.5 41 22 36 Z" fill={UCLU_BOARD.beamCore} fillOpacity={0.8} />
      </Svg>
      <View style={styles.badgeCenter} pointerEvents="none">
        <Text style={[size >= 84 ? styles.movesHero : styles.movesValue]} {...textScale.badge}>
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
          <Stop offset="0" stopColor={UCLU_BOARD.hudTop} />
          <Stop offset="1" stopColor={UCLU_BOARD.hudLow} />
        </LinearGradient>
      </Defs>
      <Rect x={1.5} y={4.5} width={width - 3} height={height - 6} rx={18} fill={UCLU_BOARD.hudLow} stroke={UCLU_OUTLINE} strokeWidth={3} />
      <Rect x={1.5} y={1.5} width={width - 3} height={height - 6} rx={18} fill={`url(#${id})`} stroke={UCLU_OUTLINE} strokeWidth={3} />
      <Rect x={16} y={5} width={Math.max(0, width - 32)} height={5} rx={2.5} fill={UCLU_BOARD.beamCore} fillOpacity={0.3} />
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

const BTN_TONES: Record<string, { hi: string; base: string; lo: string }> = {
  cekic: { hi: UCLU_BOARD.btnHammerHi, base: UCLU_BOARD.btnHammer, lo: UCLU_BOARD.btnHammerLo },
  karistir: { hi: UCLU_BOARD.btnShuffleHi, base: UCLU_BOARD.btnShuffle, lo: UCLU_BOARD.btnShuffleLo },
};
const ACTIVE_TONE = { hi: UCLU_BOARD.btnActiveHi, base: UCLU_BOARD.btnActive, lo: UCLU_BOARD.btnActiveLo };

function BoosterButton({
  b,
  width,
  height,
  disabled,
  onPress,
}: {
  b: LiveBooster;
  width: number;
  height: number;
  disabled: boolean;
  onPress: (key: string) => void;
}) {
  const tone = b.active ? ACTIVE_TONE : BTN_TONES[b.key] ?? BTN_TONES.karistir;
  const face = height - LIP;
  const ink = b.active ? UCLU_BOARD.goldInk : UCLU_BOARD.hudText;
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
        <>
          <View style={[styles.btnLip, { top: LIP, height: face, backgroundColor: tone.lo }]} />
          <View style={[styles.btnFace, { height: face, transform: [{ translateY: pressed ? LIP - 1 : 0 }] }]}>
            <Svg width={width} height={face} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={tone.hi} />
                  <Stop offset="1" stopColor={tone.base} />
                </LinearGradient>
              </Defs>
              <Rect x={1.5} y={1.5} width={width - 3} height={face - 3} rx={16} fill={`url(#${gid})`} stroke={UCLU_OUTLINE} strokeWidth={3} />
              <Rect x={14} y={6} width={Math.max(0, width - 28)} height={Math.max(4, face * 0.1)} rx={4} fill={UCLU_BOARD.beamCore} fillOpacity={0.5} />
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
              <Ionicons name="add" size={16} color={UCLU_BOARD.hudText} />
            )}
          </View>
        </>
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
}: {
  boosters: LiveBooster[];
  disabled: boolean;
  onPress: (key: string) => void;
  score: number;
  width: number;
  height: number;
}) {
  const btnW = Math.min(Math.round(height * 1.25), Math.floor((width - space.sm * 2) / 3));
  const [first, ...rest] = boosters;
  const centerW = width - btnW * boosters.length - space.sm * 2;
  const centerH = height - LIP;
  const button = (b: LiveBooster) => (
    <BoosterButton key={b.key} b={b} width={btnW} height={height} disabled={disabled && !b.active} onPress={onPress} />
  );
  return (
    <View style={[styles.bar, { width, height }]}>
      {first ? button(first) : null}
      <View style={[styles.scoreBox, { width: centerW, height: centerH }]} accessible accessibilityLabel={`Skor ${score}`}>
        <Panel width={centerW} height={centerH} id="uscore" />
        <View style={styles.scoreRow}>
          <Ionicons name="star" size={14} color={CARTOON.star} />
          <Text style={styles.scoreLabel} {...textScale.badge}>
            SKOR
          </Text>
          <Ionicons name="star" size={14} color={CARTOON.star} />
        </View>
        <Text style={styles.scoreValue} {...textScale.badge} numberOfLines={1} adjustsFontSizeToFit>
          {score.toLocaleString("tr-TR")}
        </Text>
      </View>
      {rest.map(button)}
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
    Animated.spring(t, { toValue: 1, damping: 12, stiffness: 220, mass: 0.7, useNativeDriver: true }).start();
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
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <View style={styles.bubbleIcon}>
        <Ionicons name="bulb" size={18} color={UCLU_BOARD.ribbonInk} />
      </View>
      <Text style={styles.bubbleText} {...textScale.dense} numberOfLines={3}>
        {text}
      </Text>
    </Animated.View>
  );
}

/** Arcade yazısı: beyaz, lacivert gölgeli (bulanıklıksız). */
const outline = {
  textShadowColor: CARTOON.textShadow,
  textShadowRadius: 0,
  textShadowOffset: { width: 0, height: 2 },
};

const styles = StyleSheet.create({
  hud: { flexDirection: "row", alignItems: "center" },
  badgeCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", paddingTop: 2 },
  movesLabel: { ...type.nano, color: UCLU_BOARD.hudText, letterSpacing: 1, marginTop: -2, ...outline },
  movesValue: { ...type.scoreLg, color: UCLU_BOARD.hudText, ...outline },
  movesHero: { ...type.scoreHero, color: UCLU_BOARD.hudText, ...outline },
  right: { flex: 1, alignSelf: "stretch", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  ribbon: {
    paddingHorizontal: space.md,
    height: 22,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: UCLU_BOARD.ribbon,
    borderWidth: 2.5,
    borderBottomWidth: 4,
    borderColor: UCLU_OUTLINE,
    flexShrink: 1,
  },
  ribbonText: { ...type.label, fontFamily: fonts.bold, color: UCLU_BOARD.ribbonInk, letterSpacing: 0.6 },
  cupBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 22,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: UCLU_BOARD.badge,
    borderWidth: 2.5,
    borderColor: UCLU_OUTLINE,
  },
  cupText: { ...type.micro, fontFamily: fonts.bold, color: UCLU_BOARD.hudText, ...outline },
  goalsLabel: { ...type.micro, fontFamily: fonts.bold, color: UCLU_BOARD.hudText, marginLeft: "auto", letterSpacing: 1, ...outline },
  goals: { flexDirection: "row", gap: space.s },
  goal: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingRight: space.s,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: UCLU_OUTLINE,
    backgroundColor: UCLU_BOARD.hudWell,
    overflow: "hidden",
  },
  goalCompact: { justifyContent: "center", paddingRight: 0 },
  goalCount: { ...type.scoreLg, color: UCLU_BOARD.hudText, flexShrink: 1, ...outline },
  countPill: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UCLU_BOARD.badge,
    borderWidth: 2,
    borderColor: UCLU_OUTLINE,
  },
  countSmall: { ...type.numSmStrong, color: UCLU_BOARD.hudText },
  overlayBadge: { position: "absolute", right: 2, top: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UCLU_BOARD.check,
    borderWidth: 2.5,
    borderColor: UCLU_OUTLINE,
  },
  track: { position: "absolute", left: 6, right: 6, bottom: 3, height: 4, borderRadius: radius.pill, backgroundColor: UCLU_BOARD.barTrack, overflow: "hidden" },
  fill: { height: 4, borderRadius: radius.pill },
  iconTile: { alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderBottomWidth: 4, borderColor: UCLU_OUTLINE },
  bar: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  btnLip: { position: "absolute", left: 0, right: 0, borderRadius: radius.xl, borderWidth: 3, borderColor: UCLU_OUTLINE },
  btnFace: { alignItems: "center", justifyContent: "center", borderRadius: radius.xl, overflow: "hidden" },
  btnIcon: { ...outline },
  btnText: { ...type.label, fontFamily: fonts.bold, letterSpacing: 0.5, marginTop: 1, ...outline },
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
    backgroundColor: UCLU_BOARD.badge,
    borderWidth: 2.5,
    borderColor: UCLU_OUTLINE,
  },
  stockEmpty: { backgroundColor: UCLU_BOARD.badgePlus },
  stockText: { ...type.scoreXs, color: UCLU_BOARD.hudText, ...outline },
  scoreBox: { alignItems: "center", justifyContent: "center" },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  scoreLabel: { ...type.micro, fontFamily: fonts.bold, color: UCLU_BOARD.hudText, letterSpacing: 1.5, ...outline },
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
    borderWidth: 3,
    borderBottomWidth: 5,
    borderColor: UCLU_OUTLINE,
  },
  bubbleIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UCLU_BOARD.ribbon,
    borderWidth: 2.5,
    borderColor: UCLU_OUTLINE,
  },
  bubbleText: { ...type.bodySm, fontFamily: fonts.bold, color: UCLU_BOARD.hintInk, flex: 1 },
});
