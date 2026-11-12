/**
 * Elit Üçlü tahta katmanları: zemin hücresi (çim, çamur, krampon kutusu) ve
 * taşın üstündeki kilit (kar, kale ağı). Hepsi hücre başına memo'lu; yalnız
 * değeri değişen hücre yeniden çizilir. Vuruş alan hücre kısa bir sarsıntıyla
 * tepki verir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
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
      <Rect x={5} y={5} width={90} height={90} rx={20} fill={layers >= 2 ? UCLU_BOARD.mudDeep : UCLU_BOARD.mud} stroke={UCLU_BOARD.mudDeep} strokeWidth={1.5} />
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
      <Rect x={6} y={11} width={88} height={84} rx={14} fill={UCLU_BOARD.woodLo} />
      <Rect x={6} y={5} width={88} height={84} rx={14} fill="url(#uwood)" stroke={UCLU_BOARD.crateEdge} strokeWidth={2} />
      <Rect x={14} y={10} width={50} height={7} rx={3.5} fill={UCLU_BOARD.beamCore} fillOpacity={0.55} />
      <Line x1={10} y1={34} x2={90} y2={34} stroke={UCLU_BOARD.woodLo} strokeWidth={3.5} />
      <Line x1={10} y1={62} x2={90} y2={62} stroke={UCLU_BOARD.woodLo} strokeWidth={3.5} />
      {hp >= 2 ? <Rect x={6} y={41} width={88} height={13} fill={UCLU_BOARD.strap} stroke={UCLU_BOARD.strapLo} strokeWidth={1.5} /> : null}
      {hp >= 3 ? <Rect x={43.5} y={5} width={13} height={84} fill={UCLU_BOARD.strap} stroke={UCLU_BOARD.strapLo} strokeWidth={1.5} /> : null}
      <G fill={UCLU_BOARD.woodLo}>
        <Circle cx={17} cy={16} r={3.5} />
        <Circle cx={83} cy={16} r={3.5} />
        <Circle cx={17} cy={78} r={3.5} />
        <Circle cx={83} cy={78} r={3.5} />
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
    Animated.timing(shake, {
      toValue: 1,
      duration: 260,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [mud, crate, shake]);

  const dx = shake.interpolate({
    inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
    outputRange: [0, -3, 3, -2, 2, 0],
  });
  // Saha biçimi: satır şeritleri (A/B) + her şeritte hafif dama.
  const stripe = row % 2 === 0;
  const check = (row + col) % 2 === 0;
  const ground = stripe ? (check ? UCLU_BOARD.cellA2 : UCLU_BOARD.cellA) : check ? UCLU_BOARD.cellB2 : UCLU_BOARD.cellB;
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
          backgroundColor: ground,
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

/* ───────────────────────────── ışık ve çerçeve ───────────────────────────── */

/**
 * Tahtanın üstüne düşen projektör ışığı: üstten yayılan yumuşak parlaklık,
 * köşelerde gölge. Hücrelerin üstünde, taşların altında; tek SVG.
 */
export const BoardLight = React.memo(function BoardLight({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="ublight" cx="50%" cy="-10%" r="95%">
          <Stop offset="0" stopColor={UCLU_BOARD.floodlight} stopOpacity={0.22} />
          <Stop offset="0.55" stopColor={UCLU_BOARD.floodlight} stopOpacity={0.05} />
          <Stop offset="1" stopColor={UCLU_BOARD.floodlight} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="ubvig" cx="50%" cy="55%" r="75%">
          <Stop offset="0.6" stopColor={UCLU_BOARD.ink} stopOpacity={0} />
          <Stop offset="1" stopColor={UCLU_BOARD.ink} stopOpacity={0.12} />
        </RadialGradient>
      </Defs>
      <G fill="none" stroke={UCLU_BOARD.pitchLine} strokeOpacity={0.55} strokeWidth={0.6}>
        <Rect x={1.2} y={1.2} width={97.6} height={97.6} rx={1.5} />
        <Line x1={1.2} y1={50} x2={98.8} y2={50} />
        <Circle cx={50} cy={50} r={12} />
        <Rect x={30} y={1.2} width={40} height={12} />
        <Rect x={30} y={86.8} width={40} height={12} />
      </G>
      <Circle cx={50} cy={50} r={1.1} fill={UCLU_BOARD.pitchLine} fillOpacity={0.55} />
      <Rect x={0} y={0} width={100} height={100} fill="url(#ublight)" />
      <Rect x={0} y={0} width={100} height={100} fill="url(#ubvig)" />
    </Svg>
  );
});

/**
 * Sade tahta çerçevesi: koyu lacivert, yumuşak köşeli zemin ve sahayı saran
 * ince kenar (kalın kontur yok). Çekiç seçiliyken iç kenar vurgu renginde
 * yanar (hedef seçme kipi).
 */
export const FrameTrim = React.memo(function FrameTrim({ width, height, pad, hammer }: { width: number; height: number; pad: number; hammer: boolean }) {
  const r = 20;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={0} y={3} width={width} height={height - 3} rx={r} fill={UCLU_BOARD.chromeLip} />
      <Rect x={0} y={0} width={width} height={height - 3} rx={r} fill={UCLU_BOARD.pitchFrame} />
      <Rect x={0.5} y={0.5} width={width - 1} height={height - 4} rx={r} fill="none" stroke={UCLU_BOARD.chromeEdge} strokeWidth={1} />
      <Rect
        x={pad - 1.5}
        y={pad - 1.5}
        width={width - pad * 2 + 3}
        height={height - pad * 2 + 3}
        rx={8}
        fill="none"
        stroke={hammer ? UCLU_BOARD.accent : UCLU_BOARD.pitchEdge}
        strokeWidth={hammer ? 3 : 1.5}
      />
    </Svg>
  );
});

/**
 * Tahtanın üstünden geçen ışık süpürmesi: seviye açılışında bir kez, sonra
 * `repeat` açıkken ara ara (her süpürme sonlu bir animasyon; zamanlayıcı
 * bileşen kalkınca / repeat kapanınca temizlenir). Eğik, yumuşak bir parıltı
 * soldan sağa akar.
 */
export function ShineSweep({ size, tick, repeat = false }: { size: number; tick: number; repeat?: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  const [round, setRound] = useState(0);
  useEffect(() => {
    t.setValue(0);
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: 1100,
      delay: 250,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [tick, round, t]);
  useEffect(() => {
    if (!repeat) return;
    const timer = setTimeout(() => setRound((r) => r + 1), 7000 + (round % 3) * 1500);
    return () => clearTimeout(timer);
  }, [repeat, round]);
  const band = size * 0.42;
  const x = t.interpolate({
    inputRange: [0, 1],
    outputRange: [-band * 1.6, size + band * 0.6],
  });
  const opacity = t.interpolate({
    inputRange: [0, 0.1, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sweepClip]}>
      <Animated.View
        style={{
          position: "absolute",
          top: -size * 0.2,
          width: band,
          height: size * 1.4,
          opacity,
          transform: [{ translateX: x }, { rotate: "18deg" }],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="ubsweep" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={UCLU_BOARD.floodlight} stopOpacity={0} />
              <Stop offset="0.5" stopColor={UCLU_BOARD.floodlight} stopOpacity={0.38} />
              <Stop offset="1" stopColor={UCLU_BOARD.floodlight} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={10} height={10} fill="url(#ubsweep)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

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
    Animated.timing(fade, {
      toValue: on ? 1 : 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [on, fade]);

  const scale = fade.interpolate({
    inputRange: [0, 1],
    outputRange: [1.35, 1],
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.cell,
        {
          left: col * cell,
          top: row * cell,
          width: cell,
          height: cell,
          opacity: fade,
          transform: [{ scale }],
        },
      ]}
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
          <Rect x={4} y={4} width={92} height={92} rx={14} fill={UCLU_BOARD.netShade} />
          <Rect x={4} y={4} width={92} height={92} rx={14} fill="none" stroke={UCLU_BOARD.net} strokeWidth={3.5} />
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
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  snow: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: UCLU_BOARD.snow,
    borderWidth: 1.5,
    borderColor: UCLU_BOARD.snowEdge,
    overflow: "hidden",
  },
  snowBadge: { position: "absolute", right: 2, bottom: 1 },
  sweepClip: { overflow: "hidden" },
});
