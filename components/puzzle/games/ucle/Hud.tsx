import React, { memo, useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, radius, space, textScale, type } from "@/theme";
import { UCLE_UI as UI } from "@/lib/puzzle/uclePalette";

type IonName = React.ComponentProps<typeof Ionicons>["name"];

/** 3D kabartmaların alt kalınlığı. */
const DEPTH = 4;

/** HUD ve güçlendirici çubuğunun sabit yükseklikleri (geometri ölçüm beklemez). */
export function hudHeight(compact: boolean) {
  return compact ? 54 : 66;
}
export function boosterBarHeight(compact: boolean) {
  return compact ? 54 : 66;
}

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
  extraRack: boolean;
  compact: boolean;
  still?: boolean;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;

const shadowText = {
  textShadowColor: UI.textShadow,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
} as const;

/**
 * Üst panel — arcade HUD'u gibi ÇİZGİ FİLM dili: kalın lacivert konturlu
 * mor-lacivert hap, altın seviye rozeti, iri beyaz (lacivert gölgeli) kalan
 * karo sayısı + konturlu ilerleme çubuğu, kilit / zincir hedef çipleri ve
 * süre çipi. Hepsi altta koyu dudaklı, kabartmalı.
 */
function HudBase(p: HudProps) {
  // Süre azalınca her saniye sayaç "tık" diye zıplar.
  const tick = useRef(new Animated.Value(1)).current;
  const lowNow = p.timeLimit != null && p.timeLeft != null && p.timeLeft <= Math.max(10, p.timeLimit * 0.2);
  useEffect(() => {
    if (!lowNow || p.still) return;
    tick.setValue(1.14);
    Animated.spring(tick, {
      toValue: 1,
      damping: 8,
      stiffness: 320,
      mass: 0.6,
      useNativeDriver: true,
    }).start();
  }, [p.timeLeft, lowNow, p.still, tick]);
  const bump = useRef(new Animated.Value(1)).current;
  const prev = useRef(p.remaining);
  useEffect(() => {
    if (p.remaining < prev.current) {
      bump.setValue(1.3);
      Animated.spring(bump, {
        toValue: 1,
        speed: 18,
        bounciness: 14,
        useNativeDriver: true,
      }).start();
    }
    prev.current = p.remaining;
  }, [p.remaining, bump]);

  const H = hudHeight(p.compact);
  const face = H - DEPTH;
  const badge = face - (p.compact ? 10 : 12);
  const progress = p.total ? 1 - p.remaining / p.total : 0;
  const timed = p.timeLimit != null && p.timeLeft != null;
  const lowTime = timed && p.timeLeft! <= Math.max(10, p.timeLimit! * 0.2);
  const timeFrac = timed && p.timeLimit ? Math.max(0, p.timeLeft! / p.timeLimit) : 0;

  return (
    <View style={[styles.hud, { height: H }]}>
      <View style={[styles.hudFace, { height: face }]}>
        {/* Seviye rozeti */}
        <View
          style={[styles.levelBadge, { width: badge, height: badge, borderRadius: badge / 2 }]}
          accessibilityLabel={p.cup ? `Kupa maçı, seviye ${p.level}` : `Seviye ${p.level}`}
        >
          {p.cup ? <Ionicons name="trophy" size={Math.round(badge * 0.3)} color={UI.goldInk} /> : null}
          <Text style={[styles.levelNum, p.compact || p.level >= 100 ? styles.levelNumSm : null]} {...textScale.badge}>
            {p.level}
          </Text>
        </View>

        {/* Kalan karo + ilerleme */}
        <View style={styles.mid}>
          <View style={styles.midRow}>
            <Animated.View style={[styles.countWrap, { transform: [{ scale: bump }] }]} accessibilityLabel={`Kalan karo ${p.remaining} / ${p.total}`}>
              <Ionicons name="layers" size={p.compact ? 18 : 22} color={UI.textSoft} />
              <Text style={[styles.count, p.compact && styles.countSm]} {...textScale.badge}>
                {p.remaining}
              </Text>
            </Animated.View>
            <Text style={styles.shape} numberOfLines={1} {...textScale.badge}>
              {p.cup ? "KUPA MAÇI" : p.shapeTitle}
            </Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.max(4, Math.round(progress * 100))}%` }]}>
              <View style={styles.barShine} />
            </View>
          </View>
        </View>

        {/* Hedef çipleri */}
        {p.locksLeft > 0 ? <GoalChip icon="lock-closed" value={p.locksLeft} face={UI.chromeHi} deep={UI.lip} label="Kilitli karo" /> : null}
        {p.chainsLeft > 0 ? <GoalChip icon="link" value={p.chainsLeft} face={UI.chromeHi} deep={UI.lip} label="Zincirli karo" /> : null}
        {p.extraRack ? <GoalChip icon="file-tray-stacked" value={8} face={UI.chromeHi} deep={UI.lip} label="Ek raf etkin, hücre" /> : null}

        {/* Süre */}
        {timed ? (
          <Animated.View
            style={[
              styles.timer,
              {
                backgroundColor: lowTime ? UI.redDeep : UI.lip,
                transform: [{ scale: tick }],
              },
            ]}
            accessibilityLabel={`Kalan süre ${fmt(p.timeLeft!)}`}
          >
            <View style={[styles.timerFace, { backgroundColor: lowTime ? UI.red : UI.chromeHi }]}>
              <Ionicons name="time" size={16} color={UI.text} style={shadowText} />
              <Text style={styles.timerText} {...textScale.badge}>
                {fmt(p.timeLeft!)}
              </Text>
            </View>
            <View style={styles.timerBar}>
              <View style={[styles.timerBarFill, { width: `${Math.round(timeFrac * 100)}%` }]} />
            </View>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

export const Hud = memo(HudBase);

function GoalChip({ icon, value, face, deep, label }: { icon: IonName; value: number; face: string; deep: string; label: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: deep }]} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.chipFace, { backgroundColor: face }]}>
        <Ionicons name={icon} size={15} color={UI.text} style={shadowText} />
        <Text style={styles.chipText} {...textScale.badge}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/* ───────────────────────────── alt çubuk: güçlendiriciler ───────────────────────────── */

interface BoosterBarProps {
  width: number;
  compact: boolean;
  stock: Record<string, number>;
  canUndo: boolean;
  canHint: boolean;
  onUndo: () => void;
  onHint: () => void;
  still?: boolean;
}

function BoosterBarBase(p: BoosterBarProps) {
  const H = boosterBarHeight(p.compact) - space.xs;
  const w = Math.min(190, Math.floor((p.width - space.md * 3) / 2));
  return (
    <View style={[styles.boostBar, { height: boosterBarHeight(p.compact) }]}>
      <BoosterButton
        icon="arrow-undo"
        label="GERİ AL"
        a11y="Geri Al"
        count={p.stock.geri_al ?? 0}
        enabled={p.canUndo}
        onPress={p.onUndo}
        face={UI.panel}
        deep={UI.lip}
        width={w}
        height={H}
        still={!!p.still}
        phase={0}
      />
      <BoosterButton
        icon="bulb"
        label="İPUCU"
        a11y="İpucu"
        count={p.stock.ipucu ?? 0}
        enabled={p.canHint}
        onPress={p.onHint}
        face={UI.panel}
        deep={UI.lip}
        width={w}
        height={H}
        still={!!p.still}
        phase={900}
      />
    </View>
  );
}

export const BoosterBar = memo(BoosterBarBase);

function BoosterButton({
  icon,
  label,
  a11y,
  count,
  enabled,
  onPress,
  face,
  deep,
  width,
  height,
  still,
  phase,
}: {
  icon: IonName;
  label: string;
  a11y: string;
  count: number;
  enabled: boolean;
  onPress: () => void;
  face: string;
  deep: string;
  width: number;
  height: number;
  still: boolean;
  phase: number;
}) {
  const down = useRef(new Animated.Value(0)).current;
  // Kullanılabilir düğme ara ara kıpırdar (sonlu döngü; devre dışıyken / hareketi azalt açıkken durur).
  const wig = useRef(new Animated.Value(0)).current;
  const usable = enabled && count > 0;
  useEffect(() => {
    wig.setValue(0);
    if (!usable || still) return;
    const shakeSeq = Animated.sequence([
      Animated.delay(4200 + phase),
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
      Animated.delay(1600 - phase),
    ]);
    const shake = Animated.loop(shakeSeq, { iterations: 200 });
    shake.start();
    return () => shake.stop();
  }, [usable, still, phase, wig]);
  const depth = DEPTH + 1;
  const disc = height - depth - 14;
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      onPressIn={() =>
        Animated.timing(down, {
          toValue: 1,
          duration: 60,
          useNativeDriver: true,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(down, {
          toValue: 0,
          speed: 30,
          bounciness: 12,
          useNativeDriver: true,
        }).start()
      }
      accessibilityRole="button"
      accessibilityLabel={`${a11y} güçlendiricisi, ${count} adet`}
      accessibilityState={{ disabled: !enabled }}
      style={[{ width, height }, !enabled && styles.boostOff]}
    >
      <Animated.View
        style={{
          width,
          height,
          transform: [
            {
              rotate: wig.interpolate({
                inputRange: [-1, 1],
                outputRange: ["-5deg", "5deg"],
              }),
            },
            {
              scale: wig.interpolate({
                inputRange: [-1, 0, 1],
                outputRange: [1.05, 1, 1.05],
              }),
            },
          ],
        }}
      >
        <View style={[styles.boostBase, { height: height - depth, top: depth, backgroundColor: deep }]} />
        <Animated.View
          style={[
            styles.boostFace,
            {
              height: height - depth,
              backgroundColor: face,
              transform: [
                {
                  translateY: down.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, depth - 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View
            style={[
              styles.boostDisc,
              {
                width: disc,
                height: disc,
                borderRadius: disc / 2,
                backgroundColor: UI.chromeHi,
              },
            ]}
          >
            <Ionicons name={icon} size={Math.round(disc * 0.62)} color={UI.text} style={shadowText} />
          </View>
          <Text style={styles.boostLabel} numberOfLines={1} {...textScale.badge}>
            {label}
          </Text>
          <View style={[styles.badge, count === 0 && styles.badgeEmpty]}>
            {count > 0 ? (
              <Text style={styles.badgeText} {...textScale.badge}>
                {count}
              </Text>
            ) : (
              <Ionicons name="add" size={14} color={UI.text} />
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hud: {
    borderRadius: radius.xl,
    backgroundColor: UI.panelDeep,
    borderWidth: 1,
    borderColor: UI.outline,
  },
  hudFace: {
    position: "absolute",
    left: -1,
    right: -1,
    top: -1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.s,
    borderRadius: radius.xl,
    backgroundColor: UI.panel,
    borderWidth: 1,
    borderColor: UI.outline,
    overflow: "hidden",
  },
  levelBadge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.white,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: UI.outline,
  },
  levelNum: { ...type.scoreMd, color: UI.ink },
  levelNumSm: { ...type.scoreXs },
  mid: { flex: 1, minWidth: 0, gap: space.xs },
  midRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  countWrap: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  count: { ...type.scoreLg, color: UI.text, ...shadowText },
  countSm: { ...type.scoreMd },
  shape: {
    ...type.micro,
    fontFamily: fonts.bold,
    color: UI.text,
    flexShrink: 1,
    ...shadowText,
  },
  bar: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: UI.barTrack,
    borderWidth: 2,
    borderColor: UI.outline,
    overflow: "hidden",
  },
  barFill: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: UI.green,
    borderBottomWidth: 2,
    borderBottomColor: UI.greenDeep,
  },
  barShine: {
    position: "absolute",
    left: space.xs,
    right: space.xs,
    top: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: UI.barShine,
  },
  chip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: UI.outline,
    paddingBottom: 3,
  },
  chipFace: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.s,
    height: 28,
    borderRadius: radius.sm,
  },
  chipText: { ...type.scoreXs, color: UI.text, ...shadowText },
  timer: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: UI.outline,
    paddingBottom: 3,
    overflow: "hidden",
  },
  timerFace: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.s,
    height: 30,
    borderRadius: radius.sm,
  },
  timerText: { ...type.scoreSm, color: UI.text, ...shadowText },
  timerBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: UI.barTrack,
  },
  timerBarFill: { height: 3, backgroundColor: UI.text },

  boostBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: space.md,
  },
  boostOff: { opacity: 0.5 },
  boostBase: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: UI.outline,
  },
  boostFace: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: UI.outline,
  },
  boostDisc: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.outline,
  },
  boostLabel: {
    ...type.h3,
    fontFamily: fonts.bold,
    color: UI.text,
    letterSpacing: 0.6,
    flexShrink: 1,
    ...shadowText,
  },
  badge: {
    position: "absolute",
    right: -10,
    top: -12,
    minWidth: 28,
    height: 28,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: UI.outline,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.white,
  },
  badgeEmpty: { backgroundColor: UI.accent },
  badgeText: { ...type.scoreXs, color: UI.ink },
});
