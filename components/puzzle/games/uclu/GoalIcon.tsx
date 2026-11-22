/**
 * Hedef simgeleri — HUD hedef kartında ve hedefe uçan simgelerde aynı çizim:
 * taş hedefinde taşın kendisi; engellerde tahtadaki engelin küçük kopyası
 * (çamur, krampon kutusu, buz kalıbı, kale ağı, koni, kupa). Çim hedefi
 * tahtada bilerek sadedir; koyu kartta okunsun diye burada dolgun bir çim
 * öbeği olarak çizilir.
 */

import React from "react";
import { View } from "react-native";
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import type { UcluGoalType } from "@/lib/puzzle/levels/uclu";
import { radius } from "@/theme";
import { UCLU_BOARD } from "@/lib/puzzle/ucluPalette";
import { Crate, IceBlock, Mud, NetLock } from "./BoardLayers";
import { PieceGlyph } from "./Piece";

function GrassTile({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="ugoalgrass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_BOARD.grassHi} />
          <Stop offset="1" stopColor={UCLU_BOARD.grassLo} />
        </LinearGradient>
      </Defs>
      <Rect x={8} y={40} width={84} height={52} rx={radius.md} fill={UCLU_BOARD.dirtLo} />
      <Rect x={8} y={36} width={84} height={48} rx={radius.md} fill={UCLU_BOARD.dirt} />
      <G fill="url(#ugoalgrass)" stroke={UCLU_BOARD.grassLo} strokeWidth={2} strokeLinejoin="round">
        <Path d="M10 52 Q14 30 20 12 Q24 32 28 44 Q32 22 40 8 Q42 30 46 42 Q52 18 60 6 Q60 30 62 42 Q68 22 78 12 Q76 34 76 46 Q84 30 92 24 Q88 44 90 56 Q50 66 10 52 Z" />
      </G>
      <Path d="M22 22 Q22 34 26 42" stroke={UCLU_BOARD.beamCore} strokeOpacity={0.6} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export const GoalIcon = React.memo(function GoalIcon({ type: kind, color, size }: { type: UcluGoalType; color: number; size: number }) {
  if (kind === "color") return <PieceGlyph kind="gem" color={color} special="none" size={size} />;
  if (kind === "trophy") return <PieceGlyph kind="trophy" color={-1} special="none" size={size} />;
  if (kind === "cone") return <PieceGlyph kind="cone" color={-1} special="none" hp={2} size={size} />;
  if (kind === "crate") return <Crate size={size} hp={2} />;
  if (kind === "snow") return <IceBlock size={size} />;
  if (kind === "net") return <NetLock size={size} />;
  if (kind === "turf") return <GrassTile size={size} />;
  return (
    <View style={{ width: size, height: size }}>
      <Mud size={size} layers={2} />
    </View>
  );
});
