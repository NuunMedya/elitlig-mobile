/**
 * SONSUZ / BİLGİ OYUNU ANA SAYFASI SAHNESİ — gece stadyumu: gökyüzü
 * gradyanı, projektör hüzmeleri, renkli tribün kalabalığı, perspektif saha
 * ve ortada oyunun dev ikon madalyonu. Tek SVG, ölçüye göre bir kez üretilir
 * (useMemo); animasyon yok (pil dostu).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Ellipse, Path, Polygon, Rect } from "react-native-svg";

import { GH } from "@/lib/game/gameHomePalette";
import { HUB } from "@/lib/game/hubPalette";
import { radius } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export const ArenaScene = React.memo(function ArenaScene({ gameKey, icon }: { gameKey: string; icon: keyof typeof Ionicons.glyphMap }) {
  const { width: w, height: h } = useWindowDimensions();
  const scene = useMemo(() => {
    let a = 7;
    const r = () => {
      a = (a * 16807) % 2147483647;
      return a / 2147483647;
    };
    const standTop = h * 0.36;
    const standBottom = h * 0.52;
    const crowd: { x: number; y: number; c: string }[] = [];
    for (let y = standTop + 10; y < standBottom - 6; y += 12) for (let x = 5; x < w; x += 12) if (r() < 0.75) crowd.push({ x: x + r() * 3, y: y + r() * 3, c: GH.sceneCrowd[Math.floor(r() * GH.sceneCrowd.length)] });
    const stars = Array.from({ length: 26 }, () => ({ x: r() * w, y: r() * standTop * 0.8, s: 0.6 + r() * 1.4 }));
    return { standTop, standBottom, crowd, stars };
  }, [w, h]);
  const { standTop, standBottom } = scene;
  const fill = HUB.game[gameKey] ?? HUB.game.uclu;
  const medal = Math.min(150, w * 0.38);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={GH.sceneSky} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        {scene.stars.map((s, i) => (
          <Circle key={i} cx={s.x} cy={s.y} r={s.s} fill={GH.white} opacity={0.55} />
        ))}
        {/* projektörler */}
        <Polygon points={`${w * 0.08},${standTop - 40} ${w * 0.5},${h} ${w * 0.9},${h}`} fill={GH.sceneBeam} />
        <Polygon points={`${w * 0.92},${standTop - 40} ${w * 0.1},${h} ${w * 0.5},${h}`} fill={GH.sceneBeam} />
        <Rect x={w * 0.08 - 3} y={standTop - 90} width={6} height={60} fill={GH.sceneStand} />
        <Rect x={w * 0.92 - 3} y={standTop - 90} width={6} height={60} fill={GH.sceneStand} />
        <Rect x={w * 0.08 - 16} y={standTop - 100} width={32} height={14} rx={3} fill={GH.sceneLamp} />
        <Rect x={w * 0.92 - 16} y={standTop - 100} width={32} height={14} rx={3} fill={GH.sceneLamp} />
        {/* tribün */}
        <Path d={`M 0 ${standTop + 20} Q ${w / 2} ${standTop - 30} ${w} ${standTop + 20} L ${w} ${standBottom} L 0 ${standBottom} Z`} fill={GH.sceneStandFar} />
        <Rect x={0} y={standTop + 6} width={w} height={standBottom - standTop - 6} fill={GH.sceneStand} opacity={0.55} />
        {scene.crowd.map((c, i) => (
          <Circle key={`c${i}`} cx={c.x} cy={c.y} r={3.6} fill={c.c} opacity={0.9} />
        ))}
        {/* saha (perspektif) */}
        <Path d={`M ${-w * 0.2} ${h} L ${w * 0.12} ${standBottom} L ${w * 0.88} ${standBottom} L ${w * 1.2} ${h} Z`} fill={GH.sceneGrass[1]} />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const t0 = i / 6;
          const t1 = (i + 0.5) / 6;
          const y0 = standBottom + (h - standBottom) * t0 * t0;
          const y1 = standBottom + (h - standBottom) * t1 * t1;
          return <Rect key={`s${i}`} x={0} y={y0} width={w} height={Math.max(1, y1 - y0)} fill={GH.sceneGrass[0]} opacity={0.55} />;
        })}
        <Ellipse cx={w / 2} cy={standBottom + (h - standBottom) * 0.42} rx={w * 0.28} ry={(h - standBottom) * 0.14} fill="none" stroke={GH.sceneLine} strokeWidth={3} />
        <Path d={`M ${w * 0.12} ${standBottom} L ${w * 0.88} ${standBottom}`} stroke={GH.sceneLine} strokeWidth={3} />
      </Svg>
      {/* oyun madalyonu */}
      <View style={[styles.medalWrap, { top: h * 0.4 - medal / 2 }]}>
        <View style={[styles.medalLip, { width: medal, height: medal }]} />
        <LinearGradient colors={fill} start={TOP} end={BOTTOM} style={[styles.medal, { width: medal, height: medal }]}>
          <View style={styles.medalShine} />
          <Ionicons name={icon} size={medal * 0.5} color={GH.white} />
        </LinearGradient>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  medalWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  medalLip: { position: "absolute", top: 8, borderRadius: radius.pill, backgroundColor: GH.inkShadow },
  medal: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 5, borderColor: GH.white, overflow: "hidden" },
  medalShine: { position: "absolute", top: 10, left: "22%", right: "22%", height: "22%", borderRadius: radius.pill, backgroundColor: GH.playShine },
});
