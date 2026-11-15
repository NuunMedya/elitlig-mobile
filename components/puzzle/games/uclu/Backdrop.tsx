/**
 * Elit Üçlü sahnesi: tahtanın arkasındaki KISIK, SOLUK gece stadı.
 *
 * Bilerek dikkat çekmez: doygunluğu düşük lacivert-gri tonlar, yumuşak
 * (bulanık görünen) tribün bantları, çok hafif taraftar noktaları, puslu
 * projektör ışıkları ve kenarlarda kararma. Tahta ve renkli taşlar öne çıkar.
 *
 * Tamamen DURAĞANDIR (animasyon yok) ve memo'ludur: ölçü değişmedikçe bir
 * kez çizilir; 60 fps'yi etkilemez. Taraftar noktaları tohumlu rastgeleyle
 * dizilir (her açılışta aynı görünüm).
 */

import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { UCLU_STADIUM } from "@/lib/puzzle/ucluPalette";
import { seededRandom } from "@/lib/puzzle/types";
import { radius } from "@/theme";

function crowd(width: number, y0: number, y1: number, seed: number) {
  const rng = seededRandom(seed);
  const out: { x: number; y: number; r: number; c: string }[] = [];
  const tones = [UCLU_STADIUM.crowdA, UCLU_STADIUM.crowdB, UCLU_STADIUM.crowdC];
  const rows = 5;
  for (let k = 0; k < rows; k++) {
    const y = y0 + ((y1 - y0) * (k + 0.5)) / rows;
    const step = 9 + k * 1.2;
    for (let x = (k % 2) * (step / 2); x < width; x += step) {
      out.push({
        x: x + rng() * 3,
        y: y + rng() * 2,
        r: 2.6 + rng() * 1.6,
        c: tones[Math.floor(rng() * tones.length)],
      });
    }
  }
  return out;
}

/**
 * corner: köşe yuvarlaklığı. Tam ekranda (zemin ekran kenarlarına taşarken)
 * 0 verilir; kutu içinde kullanılırsa kart köşesi.
 */
export const StadiumBackdrop = React.memo(function StadiumBackdrop({ width, height, corner = radius.xxl }: { width: number; height: number; corner?: number }) {
  const roofY = height * 0.05;
  const standMid = height * 0.2;
  const standLow = height * 0.36;
  const dots = useMemo(() => [...crowd(width, roofY + 12, standMid - 6, 11), ...crowd(width, standMid + 6, standLow - 8, 23)], [width, roofY, standMid, standLow]);
  const lamps = [
    { x: width * 0.1, y: roofY + 4, r: width * 0.32 },
    { x: width * 0.9, y: roofY + 4, r: width * 0.32 },
    { x: width * 0.5, y: roofY - 2, r: width * 0.22 },
  ];
  return (
    <Svg width={width} height={height} style={[StyleSheet.absoluteFill, { borderRadius: corner }]} pointerEvents="none">
      <Defs>
        <LinearGradient id="ussky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_STADIUM.skyTop} />
          <Stop offset="0.5" stopColor={UCLU_STADIUM.skyMid} />
          <Stop offset="1" stopColor={UCLU_STADIUM.skyLow} />
        </LinearGradient>
        <LinearGradient id="uspitch" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_STADIUM.pitchHi} />
          <Stop offset="1" stopColor={UCLU_STADIUM.pitch} />
        </LinearGradient>
        <LinearGradient id="usstand" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_STADIUM.standFar} />
          <Stop offset="1" stopColor={UCLU_STADIUM.standNear} />
        </LinearGradient>
        <RadialGradient id="uslamp" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={UCLU_STADIUM.lampGlow} stopOpacity={0.22} />
          <Stop offset="0.4" stopColor={UCLU_STADIUM.lampGlow} stopOpacity={0.08} />
          <Stop offset="1" stopColor={UCLU_STADIUM.lampGlow} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="usbokeh" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={UCLU_STADIUM.lamp} stopOpacity={0.16} />
          <Stop offset="1" stopColor={UCLU_STADIUM.lamp} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="usvig" cx="50%" cy="48%" r="70%">
          <Stop offset="0.55" stopColor={UCLU_STADIUM.vignette} stopOpacity={0} />
          <Stop offset="1" stopColor={UCLU_STADIUM.vignette} stopOpacity={0.6} />
        </RadialGradient>
        <LinearGradient id="ushaze" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_STADIUM.skyLow} stopOpacity={0} />
          <Stop offset="1" stopColor={UCLU_STADIUM.skyLow} stopOpacity={0.85} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#ussky)" />
      {/* Tribün: tek yumuşak gövde, iki kat arasında silik bir korkuluk. */}
      <Path d={`M0 ${roofY + 10} Q${width / 2} ${roofY - 4} ${width} ${roofY + 10} L${width} ${standLow} L0 ${standLow} Z`} fill="url(#usstand)" />
      <Rect x={0} y={standMid - 1.5} width={width} height={3} fill={UCLU_STADIUM.standEdge} opacity={0.6} />
      <G>
        {dots.map((d, i) => (
          <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.c} />
        ))}
      </G>
      {/* Tribünün altı sise karışır (bulanık geçiş). */}
      <Rect x={0} y={standMid} width={width} height={standLow - standMid + 30} fill="url(#ushaze)" />
      <Path d={`M0 0 L${width} 0 L${width} ${roofY + 10} Q${width / 2} ${roofY - 6} 0 ${roofY + 10} Z`} fill={UCLU_STADIUM.roof} />
      {/* Puslu projektör ışıkları ve sahne ışığı "bokeh" lekeleri. */}
      {lamps.map((l, i) => (
        <Circle key={`l${i}`} cx={l.x} cy={l.y} r={l.r} fill="url(#uslamp)" />
      ))}
      {[
        [0.22, 0.12, 18],
        [0.74, 0.09, 14],
        [0.4, 0.26, 22],
        [0.86, 0.3, 16],
        [0.12, 0.33, 12],
      ].map(([fx, fy, r], i) => (
        <Circle key={`b${i}`} cx={width * fx} cy={height * fy} r={r} fill="url(#usbokeh)" />
      ))}
      {/* Saha (alt): soluk yeşil-gri, ufukta pus. */}
      <Rect x={0} y={height * 0.8} width={width} height={height * 0.2} fill="url(#uspitch)" />
      <Ellipse cx={width / 2} cy={height * 0.8} rx={width * 0.7} ry={10} fill={UCLU_STADIUM.haze} />
      <Rect x={0} y={0} width={width} height={height} fill={UCLU_STADIUM.haze} />
      <Rect x={0} y={0} width={width} height={height} fill="url(#usvig)" />
    </Svg>
  );
});
