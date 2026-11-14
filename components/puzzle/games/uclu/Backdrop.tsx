/**
 * Elit Üçlü sahnesi: tahtanın arkasındaki gece stadı — koyu gökyüzü, iki
 * yanda projektör kuleleri ve yumuşak ışık hüzmeleri, iki katlı tribün ve
 * tribünde renk renk taraftar noktaları, altta saha şeridi.
 *
 * Tamamen DURAĞANDIR (animasyon yok) ve memo'ludur: ölçü değişmedikçe bir
 * kez çizilir; 60 fps'yi etkilemez. Taraftar noktaları tohumlu rastgeleyle
 * dizilir (her açılışta aynı görünüm).
 */

import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { UCLU_STADIUM } from "@/lib/puzzle/ucluPalette";
import { seededRandom } from "@/lib/puzzle/types";
import { radius } from "@/theme";

function crowd(width: number, y0: number, y1: number, seed: number) {
  const rng = seededRandom(seed);
  const out: { x: number; y: number; r: number; c: string }[] = [];
  const tones = [UCLU_STADIUM.crowdA, UCLU_STADIUM.crowdB, UCLU_STADIUM.crowdC];
  const rows = 4;
  for (let k = 0; k < rows; k++) {
    const y = y0 + ((y1 - y0) * (k + 0.5)) / rows;
    const step = 11 + k * 1.5;
    for (let x = (k % 2) * (step / 2); x < width; x += step) {
      out.push({ x: x + rng() * 3, y: y + rng() * 2, r: 2.2 + rng() * 1.4, c: tones[Math.floor(rng() * tones.length)] });
    }
  }
  return out;
}

export const StadiumBackdrop = React.memo(function StadiumBackdrop({ width, height }: { width: number; height: number }) {
  const standTop = height * 0.04;
  const standMid = height * 0.17;
  const standLow = height * 0.3;
  const dots = useMemo(
    () => [...crowd(width, standTop + 10, standMid - 4, 11), ...crowd(width, standMid + 6, standLow - 6, 23)],
    [width, standTop, standMid, standLow],
  );
  const towers = [width * 0.08, width * 0.92];
  return (
    <Svg width={width} height={height} style={[StyleSheet.absoluteFill, { borderRadius: radius.xxl }]} pointerEvents="none">
      <Defs>
        <LinearGradient id="ussky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_STADIUM.skyTop} />
          <Stop offset="0.55" stopColor={UCLU_STADIUM.skyMid} />
          <Stop offset="1" stopColor={UCLU_STADIUM.skyLow} />
        </LinearGradient>
        <LinearGradient id="uspitch" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_STADIUM.pitchHi} />
          <Stop offset="1" stopColor={UCLU_STADIUM.pitch} />
        </LinearGradient>
        <RadialGradient id="uslamp" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={UCLU_STADIUM.lampGlow} stopOpacity={0.9} />
          <Stop offset="1" stopColor={UCLU_STADIUM.lampGlow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#ussky)" />
      {/* Projektör hüzmeleri (tahtaya doğru). */}
      {towers.map((x, i) => (
        <Path
          key={`b${i}`}
          d={`M${x - 14} ${standTop + 6} L${x + 14} ${standTop + 6} L${i ? width * 0.25 : width * 0.75} ${height * 0.8} L${i ? width * 0.05 : width * 0.95} ${height * 0.8} Z`}
          fill={UCLU_STADIUM.beam}
        />
      ))}
      {/* Tribünler: üst ve alt kat. */}
      <Path d={`M0 ${standTop + 8} Q${width / 2} ${standTop - 6} ${width} ${standTop + 8} L${width} ${standMid} L0 ${standMid} Z`} fill={UCLU_STADIUM.standFar} />
      <Rect x={0} y={standMid - 2} width={width} height={4} fill={UCLU_STADIUM.standEdge} />
      <Path d={`M0 ${standMid + 2} L${width} ${standMid + 2} L${width} ${standLow} L0 ${standLow} Z`} fill={UCLU_STADIUM.standNear} />
      <Rect x={0} y={standLow - 3} width={width} height={5} fill={UCLU_STADIUM.standEdge} />
      <G>
        {dots.map((d, i) => (
          <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.c} />
        ))}
      </G>
      <Path d={`M0 0 L${width} 0 L${width} ${standTop + 6} Q${width / 2} ${standTop - 10} 0 ${standTop + 6} Z`} fill={UCLU_STADIUM.roof} />
      {/* Kuleler ve lamba panelleri. */}
      {towers.map((x, i) => (
        <G key={`t${i}`}>
          <Circle cx={x} cy={standTop + 4} r={34} fill="url(#uslamp)" />
          <Rect x={x - 15} y={standTop - 6} width={30} height={16} rx={4} fill={UCLU_STADIUM.tower} />
          {[0, 1, 2].map((k) => (
            <Circle key={k} cx={x - 9 + k * 9} cy={standTop + 2} r={3.4} fill={UCLU_STADIUM.lamp} />
          ))}
        </G>
      ))}
      {/* Saha şeridi (alt). */}
      <Rect x={0} y={height * 0.86} width={width} height={height * 0.14} fill="url(#uspitch)" />
    </Svg>
  );
});
