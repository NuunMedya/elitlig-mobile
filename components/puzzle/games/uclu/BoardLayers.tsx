/**
 * Elit Üçlü tahta katmanları: zemin hücresi (çim, çamur, krampon kutusu) ve
 * taşın üstündeki kilit (kar, kale ağı). Hepsi hücre başına memo'lu; yalnız
 * değeri değişen hücre yeniden çizilir. Vuruş alan hücre kısa bir sarsıntıyla
 * tepki verir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Rect, Stop } from "react-native-svg";
import { radius } from "@/theme";
import { UCLU_BOARD } from "@/lib/puzzle/ucluPalette";

/* ───────────────────────────── zemin ───────────────────────────── */

export interface CellViewProps {
  row: number;
  col: number;
  cell: number;
  mud: number;
  crate: number;
}

function Mud({ size, layers }: { size: number; layers: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
      <Rect x={3} y={3} width={94} height={94} rx={18} fill={layers >= 2 ? UCLU_BOARD.mudDeep : UCLU_BOARD.mud} />
      <Circle cx={28} cy={30} r={9} fill={UCLU_BOARD.mudSpot} />
      <Circle cx={70} cy={66} r={12} fill={UCLU_BOARD.mudSpot} />
      <Circle cx={66} cy={24} r={5} fill={UCLU_BOARD.mudSpot} />
      {layers >= 2 ? <Rect x={9} y={9} width={82} height={82} rx={14} fill="none" stroke={UCLU_BOARD.mud} strokeWidth={5} strokeDasharray="12 8" /> : null}
    </Svg>
  );
}

function Crate({ size, hp }: { size: number; hp: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="uwood" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_BOARD.woodHi} />
          <Stop offset="1" stopColor={UCLU_BOARD.wood} />
        </LinearGradient>
      </Defs>
      <Rect x={6} y={6} width={88} height={88} rx={12} fill="url(#uwood)" stroke={UCLU_BOARD.woodLo} strokeWidth={4} />
      <Line x1={10} y1={36} x2={90} y2={36} stroke={UCLU_BOARD.woodLo} strokeWidth={3} opacity={0.6} />
      <Line x1={10} y1={64} x2={90} y2={64} stroke={UCLU_BOARD.woodLo} strokeWidth={3} opacity={0.6} />
      {hp >= 2 ? <Rect x={6} y={44} width={88} height={12} fill={UCLU_BOARD.strap} stroke={UCLU_BOARD.strapLo} strokeWidth={2} /> : null}
      {hp >= 3 ? <Rect x={44} y={6} width={12} height={88} fill={UCLU_BOARD.strap} stroke={UCLU_BOARD.strapLo} strokeWidth={2} /> : null}
      <G fill={UCLU_BOARD.woodLo}>
        <Circle cx={16} cy={16} r={4} />
        <Circle cx={84} cy={16} r={4} />
        <Circle cx={16} cy={84} r={4} />
        <Circle cx={84} cy={84} r={4} />
      </G>
    </Svg>
  );
}

function CellViewBase({ row, col, cell, mud, crate }: CellViewProps) {
  const shake = useRef(new Animated.Value(0)).current;
  const prev = useRef({ mud, crate });

  useEffect(() => {
    const was = prev.current;
    prev.current = { mud, crate };
    if (was.mud === mud && was.crate === crate) return;
    shake.setValue(0);
    Animated.timing(shake, { toValue: 1, duration: 260, easing: Easing.linear, useNativeDriver: true }).start();
  }, [mud, crate, shake]);

  const dx = shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -3, 3, -2, 2, 0] });
  const parity = (row + col) % 2 === 0;
  const crateSize = Math.round(cell * 0.94);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.cell,
        {
          left: col * cell,
          top: row * cell,
          width: cell,
          height: cell,
          backgroundColor: parity ? UCLU_BOARD.cellA : UCLU_BOARD.cellB,
        },
      ]}
    >
      {mud > 0 ? <Mud size={cell} layers={mud} /> : null}
      {crate > 0 ? (
        <Animated.View style={[styles.center, { transform: [{ translateX: dx }] }]}>
          <Crate size={crateSize} hp={crate} />
        </Animated.View>
      ) : null}
    </View>
  );
}

export const CellView = React.memo(CellViewBase);

/* ───────────────────────────── kilit katmanı ───────────────────────────── */

export interface LockViewProps {
  row: number;
  col: number;
  cell: number;
  snow: number;
  net: number;
}

function LockViewBase({ row, col, cell, snow, net }: LockViewProps) {
  const fade = useRef(new Animated.Value(snow > 0 || net > 0 ? 1 : 0)).current;
  const on = snow > 0 || net > 0;
  const kind = useRef<"snow" | "net">(snow > 0 ? "snow" : "net");
  if (on) kind.current = snow > 0 ? "snow" : "net";

  useEffect(() => {
    Animated.timing(fade, { toValue: on ? 1 : 0, duration: 240, useNativeDriver: true }).start();
  }, [on, fade]);

  const scale = fade.interpolate({ inputRange: [0, 1], outputRange: [1.35, 1] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.cell, { left: col * cell, top: row * cell, width: cell, height: cell, opacity: fade, transform: [{ scale }] }]}
    >
      {kind.current === "snow" ? (
        <View style={[styles.snow, { margin: cell * 0.04 }]}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <Line x1={14} y1={30} x2={36} y2={14} stroke={UCLU_BOARD.snowEdge} strokeWidth={5} strokeLinecap="round" />
            <Line x1={64} y1={88} x2={88} y2={68} stroke={UCLU_BOARD.snowEdge} strokeWidth={4} strokeLinecap="round" />
          </Svg>
          <View style={styles.snowBadge}>
            <Ionicons name="snow" size={Math.round(cell * 0.26)} color={UCLU_BOARD.snowInk} />
          </View>
        </View>
      ) : (
        <Svg width={cell} height={cell} viewBox="0 0 100 100">
          <Rect x={4} y={4} width={92} height={92} rx={14} fill={UCLU_BOARD.netShade} stroke={UCLU_BOARD.net} strokeWidth={5} />
          <G stroke={UCLU_BOARD.net} strokeWidth={3}>
            {[22, 40, 58, 76].map((p) => (
              <React.Fragment key={p}>
                <Line x1={p} y1={6} x2={p} y2={94} />
                <Line x1={6} y1={p} x2={94} y2={p} />
              </React.Fragment>
            ))}
          </G>
        </Svg>
      )}
    </Animated.View>
  );
}

export const LockView = React.memo(LockViewBase);

const styles = StyleSheet.create({
  cell: { position: "absolute" },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  snow: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: UCLU_BOARD.snow,
    borderWidth: 2,
    borderColor: UCLU_BOARD.snowEdge,
    overflow: "hidden",
  },
  snowBadge: { position: "absolute", right: 2, bottom: 1 },
});
