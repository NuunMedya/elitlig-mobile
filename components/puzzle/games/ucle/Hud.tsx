import React, { memo, useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, space, textScale, type } from "@/theme";

type IonName = React.ComponentProps<typeof Ionicons>["name"];

interface HudProps {
  level: number;
  shapeTitle: string;
  cup: boolean;
  remaining: number;
  total: number;
  timeLeft: number | null;
  timeLimit: number | null;
  locksLeft: number;
  chainsLeft: number;
  stock: Record<string, number>;
  canUndo: boolean;
  canHint: boolean;
  onUndo: () => void;
  onHint: () => void;
  extraRack: boolean;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;

/** Üst çubuk: kalan karo, süre, kilit/zincir sayaçları, oyun içi güçlendiriciler. */
function HudBase(p: HudProps) {
  const bump = useRef(new Animated.Value(1)).current;
  const prev = useRef(p.remaining);
  useEffect(() => {
    if (p.remaining < prev.current) {
      bump.setValue(1.25);
      Animated.spring(bump, { toValue: 1, speed: 18, bounciness: 12, useNativeDriver: true }).start();
    }
    prev.current = p.remaining;
  }, [p.remaining, bump]);

  const progress = p.total ? 1 - p.remaining / p.total : 0;
  const lowTime = p.timeLimit != null && p.timeLeft != null && p.timeLeft <= Math.max(10, p.timeLimit * 0.2);
  const timeFrac = p.timeLimit && p.timeLeft != null ? Math.max(0, p.timeLeft / p.timeLimit) : 0;

  return (
    <View style={styles.root}>
      <View style={styles.left}>
        <View style={styles.row}>
          <Text style={styles.level} {...textScale.badge}>
            {p.cup ? "KUPA MAÇI" : `SEVİYE ${p.level}`}
          </Text>
          <Text style={styles.shape} numberOfLines={1} {...textScale.badge}>
            {p.shapeTitle}
          </Text>
        </View>
        <View style={styles.row}>
          <Animated.View style={[styles.counter, { transform: [{ scale: bump }] }]} accessibilityLabel={`Kalan karo ${p.remaining}`}>
            <Ionicons name="layers" size={16} color={colors.brandAccent} />
            <Text style={styles.count} {...textScale.dense}>
              {p.remaining}
            </Text>
          </Animated.View>
          {p.locksLeft > 0 ? <Mini icon="lock-closed" value={p.locksLeft} label="Kilitli karo" /> : null}
          {p.chainsLeft > 0 ? <Mini icon="link" value={p.chainsLeft} label="Zincirli karo" /> : null}
          {p.extraRack ? <Mini icon="file-tray-stacked" value={8} label="Ek raf etkin, 8 hücre" /> : null}
          {p.timeLimit != null && p.timeLeft != null ? (
            <View style={[styles.timer, lowTime && styles.timerLow]} accessibilityLabel={`Kalan süre ${fmt(p.timeLeft)}`}>
              <Ionicons name="time" size={15} color={lowTime ? colors.textOnBrand : colors.textPrimary} />
              <Text style={[styles.timerText, lowTime && styles.timerTextLow]} {...textScale.dense}>
                {fmt(p.timeLeft)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.round((p.timeLimit ? timeFrac : progress) * 100)}%` }, lowTime && styles.barLow]} />
        </View>
      </View>
      <BoosterButton icon="arrow-undo" label="Geri Al" count={p.stock.geri_al ?? 0} enabled={p.canUndo} onPress={p.onUndo} />
      <BoosterButton icon="bulb" label="İpucu" count={p.stock.ipucu ?? 0} enabled={p.canHint} onPress={p.onHint} />
    </View>
  );
}

export const Hud = memo(HudBase);

function Mini({ icon, value, label }: { icon: IonName; value: number; label: string }) {
  return (
    <View style={styles.mini} accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={13} color={colors.textSecondary} />
      <Text style={styles.miniText} {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

function BoosterButton({ icon, label, count, enabled, onPress }: { icon: IonName; label: string; count: number; enabled: boolean; onPress: () => void }) {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      onPressIn={() => Animated.timing(s, { toValue: 0.9, duration: 60, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(s, { toValue: 1, speed: 30, bounciness: 12, useNativeDriver: true }).start()}
      accessibilityRole="button"
      accessibilityLabel={`${label} güçlendiricisi, ${count} adet`}
      accessibilityState={{ disabled: !enabled }}
    >
      <Animated.View style={[styles.boost, !enabled && styles.boostOff, { transform: [{ scale: s }] }]}>
        <Ionicons name={icon} size={22} color={colors.brandAccent} />
        <View style={[styles.badge, count === 0 && styles.badgeEmpty]}>
          {count > 0 ? (
            <Text style={styles.badgeText} {...textScale.badge}>
              {count}
            </Text>
          ) : (
            <Ionicons name="add" size={11} color={colors.textOnBrand} />
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  left: { flex: 1, gap: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.s },
  level: { ...type.overline, color: colors.brandAccent },
  shape: { ...type.meta, color: colors.textTertiary, flexShrink: 1 },
  counter: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
  },
  count: { ...type.scoreSm, color: colors.textPrimary },
  mini: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.s,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
  },
  miniText: { ...type.numSmStrong, color: colors.textSecondary },
  timer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    marginLeft: "auto",
  },
  timerLow: { backgroundColor: colors.danger },
  timerText: { ...type.tableNumStrong, color: colors.textPrimary },
  timerTextLow: { color: colors.textOnBrand },
  bar: { height: 4, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  barFill: { height: 4, borderRadius: radius.pill, backgroundColor: colors.brand },
  barLow: { backgroundColor: colors.danger },
  boost: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  boostOff: { opacity: 0.45 },
  badge: {
    position: "absolute",
    right: -5,
    top: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: space.xxs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  badgeEmpty: { backgroundColor: colors.win },
  badgeText: { ...type.nano, color: colors.textOnBrand },
});
