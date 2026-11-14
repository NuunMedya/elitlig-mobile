/**
 * Hedef simgeleri — HUD çiplerinde ve hedefe uçan simgelerde aynı çizim:
 * taş hedefinde taşın kendisi; engellerde tahtadaki engelin küçük kopyası
 * (çamur, krampon kutusu, buz, kale ağı, çim, koni, kupa).
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";
import type { UcluGoalType } from "@/lib/puzzle/levels/uclu";
import { UCLU_BOARD } from "@/lib/puzzle/ucluPalette";
import { Crate, Mud, Turf } from "./BoardLayers";
import { PieceGlyph } from "./Piece";

function Ice({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={6} y={6} width={88} height={88} rx={20} fill={UCLU_BOARD.snow} stroke={UCLU_BOARD.snowEdge} strokeWidth={4} />
      <G stroke={UCLU_BOARD.snowInk} strokeWidth={7} strokeLinecap="round">
        <Line x1={50} y1={22} x2={50} y2={78} />
        <Line x1={26} y1={36} x2={74} y2={64} />
        <Line x1={26} y1={64} x2={74} y2={36} />
      </G>
      <Path d="M18 34 L34 18" stroke={UCLU_BOARD.snowEdge} strokeWidth={6} strokeLinecap="round" />
    </Svg>
  );
}

function Net({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={6} y={6} width={88} height={88} rx={18} fill={UCLU_BOARD.cellB} stroke={UCLU_BOARD.net} strokeWidth={5} />
      <G stroke={UCLU_BOARD.net} strokeWidth={4}>
        {[28, 50, 72].map((p) => (
          <React.Fragment key={p}>
            <Line x1={p} y1={8} x2={p} y2={92} />
            <Line x1={8} y1={p} x2={92} y2={p} />
          </React.Fragment>
        ))}
      </G>
      <Circle cx={50} cy={50} r={9} fill={UCLU_BOARD.net} />
    </Svg>
  );
}

export const GoalIcon = React.memo(function GoalIcon({ type: kind, color, size }: { type: UcluGoalType; color: number; size: number }) {
  if (kind === "color") return <PieceGlyph kind="gem" color={color} special="none" size={size} />;
  if (kind === "trophy") return <PieceGlyph kind="trophy" color={-1} special="none" size={size} />;
  if (kind === "cone") return <PieceGlyph kind="cone" color={-1} special="none" hp={2} size={size} />;
  if (kind === "crate") return <Crate size={size} hp={2} />;
  if (kind === "snow") return <Ice size={size} />;
  if (kind === "net") return <Net size={size} />;
  return (
    <View style={{ width: size, height: size }}>
      {kind === "mud" ? <Mud size={size} layers={2} /> : <Turf size={size} grown />}
      <View style={styles.fill} />
    </View>
  );
});

const styles = StyleSheet.create({ fill: { ...StyleSheet.absoluteFillObject } });
