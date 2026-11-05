/**
 * Elit Üçlü HUD: kalan hamle, hedef sayaçları (toplanınca zıplar) ve oyun içi
 * güçlendirici düğmeleri (stok rozetli). Hedef sayaçlarının ekran konumu,
 * uçan simgelerin varış noktası için üst bileşene bildirilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { colors, layout, radius, space, textScale, type } from "@/theme";
import { UCLU_BOARD } from "@/lib/puzzle/ucluPalette";
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
  const map: Record<string, { icon: IconName; tint: string; bg: string }> = {
    mud: { icon: "water", tint: UCLU_BOARD.mudSpot, bg: UCLU_BOARD.mud },
    crate: { icon: "cube", tint: UCLU_BOARD.woodHi, bg: UCLU_BOARD.woodLo },
    snow: { icon: "snow", tint: UCLU_BOARD.snowInk, bg: UCLU_BOARD.snowEdge },
  };
  const m = map[kind];
  return (
    <View style={[styles.iconTile, { width: size, height: size, backgroundColor: m.bg }]}>
      <Ionicons name={m.icon} size={Math.round(size * 0.66)} color={m.tint} />
    </View>
  );
}

function GoalChip({ goal, index, onSlot }: { goal: HudGoal; index: number; onSlot: (i: number, e: LayoutChangeEvent) => void }) {
  const pop = useRef(new Animated.Value(1)).current;
  const prev = useRef(goal.left);
  useEffect(() => {
    if (prev.current === goal.left) return;
    prev.current = goal.left;
    pop.setValue(1.3);
    Animated.spring(pop, { toValue: 1, damping: 8, stiffness: 280, mass: 0.6, useNativeDriver: true }).start();
  }, [goal.left, pop]);
  const done = goal.left <= 0;
  return (
    <View
      style={styles.goal}
      onLayout={(e) => onSlot(index, e)}
      accessible
      accessibilityLabel={`${goalLabel(goal)}: ${done ? "tamamlandı" : `${goal.left} kaldı`}`}
    >
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <GoalIcon type={goal.type} color={goal.color} size={30} />
      </Animated.View>
      {done ? (
        <View style={styles.check}>
          <Ionicons name="checkmark" size={14} color={colors.onDark} />
        </View>
      ) : (
        <Text style={styles.goalCount} {...textScale.badge}>
          {goal.left}
        </Text>
      )}
    </View>
  );
}

export interface HudProps {
  level: number;
  cup: boolean;
  moves: number;
  goals: HudGoal[];
  score: number;
  /** Hedef satırının HUD içindeki konumu (sağ sütun + satır). */
  onGoalsPart: (part: "right" | "row", e: LayoutChangeEvent) => void;
  onGoalSlot: (i: number, e: LayoutChangeEvent) => void;
}

export const Hud = React.memo(function Hud({ level, cup, moves, goals, score, onGoalsPart, onGoalSlot }: HudProps) {
  const pulse = useRef(new Animated.Value(1)).current;
  const prev = useRef(moves);
  useEffect(() => {
    if (prev.current === moves) return;
    prev.current = moves;
    pulse.setValue(1.18);
    Animated.spring(pulse, { toValue: 1, damping: 9, stiffness: 300, mass: 0.6, useNativeDriver: true }).start();
  }, [moves, pulse]);
  const low = moves <= 5;
  return (
    <View style={styles.hud}>
      <View style={styles.movesBox} accessible accessibilityLabel={`${moves} hamle kaldı`}>
        <Text style={styles.movesLabel} {...textScale.badge}>
          HAMLE
        </Text>
        <Animated.Text style={[styles.movesValue, low && styles.movesLow, { transform: [{ scale: pulse }] }]} {...textScale.badge}>
          {moves}
        </Animated.Text>
      </View>
      <View style={styles.right} onLayout={(e) => onGoalsPart("right", e)}>
        <View style={styles.titleRow}>
          <Text style={styles.level} {...textScale.dense} numberOfLines={1}>
            Seviye {level}
          </Text>
          {cup ? (
            <View style={styles.cupBadge}>
              <Ionicons name="trophy" size={11} color={UCLU_BOARD.goldInk} />
              <Text style={styles.cupText} {...textScale.badge}>
                KUPA MAÇI
              </Text>
            </View>
          ) : null}
          <Text style={styles.score} {...textScale.badge} numberOfLines={1}>
            {score.toLocaleString("tr-TR")}
          </Text>
        </View>
        <View style={styles.goals} onLayout={(e) => onGoalsPart("row", e)}>
          {goals.map((g, i) => (
            <GoalChip key={`${g.type}${g.color}${i}`} goal={g} index={i} onSlot={onGoalSlot} />
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
  icon: string;
  stock: number;
  active: boolean;
}

export const BoosterBar = React.memo(function BoosterBar({
  boosters,
  disabled,
  onPress,
  hint,
}: {
  boosters: LiveBooster[];
  disabled: boolean;
  onPress: (key: string) => void;
  hint: string | null;
}) {
  return (
    <View style={styles.bar}>
      {boosters.map((b) => (
        <Pressable
          key={b.key}
          onPress={() => onPress(b.key)}
          disabled={disabled && !b.active}
          accessibilityRole="button"
          accessibilityLabel={`${b.title}, stok ${b.stock}${b.active ? ", seçili" : ""}`}
          accessibilityState={{ disabled: disabled && !b.active, selected: b.active }}
          style={({ pressed }) => [
            styles.booster,
            b.active && styles.boosterActive,
            (disabled && !b.active) && styles.boosterOff,
            pressed && styles.boosterPressed,
          ]}
        >
          <Ionicons name={b.icon as IconName} size={22} color={b.active ? UCLU_BOARD.goldInk : colors.onDark} />
          <Text style={[styles.boosterText, b.active && styles.boosterTextActive]} {...textScale.dense} numberOfLines={1}>
            {b.title}
          </Text>
          <View style={[styles.stock, b.stock <= 0 && styles.stockEmpty]}>
            {b.stock > 0 ? (
              <Text style={styles.stockText} {...textScale.badge}>
                {b.stock}
              </Text>
            ) : (
              <Ionicons name="add" size={12} color={colors.onDark} />
            )}
          </View>
        </Pressable>
      ))}
      {hint ? (
        <Text style={styles.hint} {...textScale.dense} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  hud: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.inkBlock,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  movesBox: {
    width: 74,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: UCLU_BOARD.frame,
    borderWidth: 1,
    borderColor: UCLU_BOARD.frameEdge,
    paddingVertical: space.xs,
  },
  movesLabel: { ...type.micro, color: colors.onDarkMuted },
  movesValue: { ...type.scoreLg, color: colors.onDark },
  movesLow: { color: colors.liveOnDark },
  right: { flex: 1, gap: space.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  level: { ...type.h3, color: colors.onDark, flexShrink: 1 },
  cupBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: space.s,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: UCLU_BOARD.gold,
  },
  cupText: { ...type.micro, color: UCLU_BOARD.goldInk },
  score: { ...type.numSmStrong, color: colors.onDarkMuted, marginLeft: "auto" },
  goals: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  goal: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 40,
    paddingHorizontal: space.s,
    borderRadius: radius.md,
    backgroundColor: UCLU_BOARD.frame,
  },
  goalCount: { ...type.scoreSm, color: colors.onDark, minWidth: 22 },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.win,
  },
  iconTile: { borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  booster: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    minHeight: layout.minTouch,
    paddingLeft: space.md,
    paddingRight: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.inkBlock,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  boosterActive: { backgroundColor: UCLU_BOARD.gold, borderColor: UCLU_BOARD.goldHi },
  boosterOff: { opacity: 0.5 },
  boosterPressed: { opacity: 0.75 },
  boosterText: { ...type.label, color: colors.onDark },
  boosterTextActive: { color: UCLU_BOARD.goldInk },
  stock: {
    position: "absolute",
    top: -6,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  stockEmpty: { backgroundColor: colors.win },
  stockText: { ...type.nano, color: colors.textOnBrand },
  hint: { ...type.bodySm, color: colors.textSecondary, flex: 1, minWidth: 120 },
});
