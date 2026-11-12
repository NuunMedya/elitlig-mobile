import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { UCLE_COLORS, UCLE_KINDS } from "@/lib/puzzle/uclePalette";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

interface Props {
  kind: number;
  /** Genişlik ve toplam yükseklik (kalınlık dahil). */
  w: number;
  h: number;
  /** Alt kalınlık (2.5D). */
  slab: number;
  /** Ters karo: tür gizli. */
  back?: boolean;
}

/** İkonun lacivert dış çizgisi: dört çapraz kopya (ikon fontu kontur almaz). */
const RING: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/**
 * Karo yüzü — ÇİZGİ FİLM dili: kalın lacivert konturlu düz, doygun yüz (alt
 * kısmı bir ton koyu), altta lacivert konturlu koyu "dudak" (2.5D kalınlık),
 * üstte beyaz parlama şeridi ve lacivert dış çizgili, gölgeli iri ikon.
 * Saf çizim (SVG + ikon).
 */
function TileFaceBase({ kind, w, h, slab, back }: Props) {
  const k = UCLE_KINDS[kind % UCLE_KINDS.length];
  const r = Math.round(w * 0.22);
  const faceH = h - slab;
  const faceColor = back ? UCLE_COLORS.back : k.face;
  const deepColor = back ? UCLE_COLORS.backDeep : k.deep;
  const iconName = (back ? "shield-half-full" : k.icon) as IconName;
  const iconSize = Math.round(w * (back ? 0.52 : 0.64));
  const ink = back ? UCLE_COLORS.backInk : k.ink;
  const bw = w >= 40 ? 2.5 : 2;
  const o = w >= 40 ? 1.4 : 1;
  const sw = w - bw * 2;
  const sh = faceH - bw * 2;
  return (
    <View style={{ width: w, height: h }} pointerEvents="none">
      <View style={[styles.abs, styles.edge, { top: slab, height: faceH, borderRadius: r, borderWidth: bw, backgroundColor: deepColor }]} />
      <View style={[styles.abs, styles.face, styles.edge, { height: faceH, borderRadius: r, borderWidth: bw, backgroundColor: faceColor }]}>
        <Svg width={sw} height={sh} style={StyleSheet.absoluteFill}>
          {/* Düz iki ton: alt kısım koyu bant. */}
          <Rect x={0} y={sh * 0.62} width={sw} height={sh * 0.38} fill={UCLE_COLORS.faceLow} />
          {/* Parlama şeridi (sol üst köşeye yaslanan kavis). */}
          <Path
            d={`M${sw * 0.12} ${sh * 0.4} C${sw * 0.12} ${sh * 0.18} ${sw * 0.2} ${sh * 0.1} ${sw * 0.42} ${sh * 0.1} L${sw * 0.62} ${sh * 0.1} C${sw * 0.7} ${sh * 0.1} ${sw * 0.7} ${sh * 0.2} ${sw * 0.62} ${sh * 0.2} L${sw * 0.42} ${sh * 0.2} C${sw * 0.28} ${sh * 0.2} ${sw * 0.22} ${sh * 0.26} ${sw * 0.22} ${sh * 0.4} C${sw * 0.22} ${sh * 0.48} ${sw * 0.12} ${sh * 0.48} ${sw * 0.12} ${sh * 0.4} Z`}
            fill={UCLE_COLORS.shine}
          />
        </Svg>
        <View style={[styles.iconLayer, { transform: [{ translateY: 2 }] }]}>
          <MaterialCommunityIcons name={iconName} size={iconSize} color={UCLE_COLORS.outline} />
        </View>
        {RING.map(([dx, dy], i) => (
          <View key={i} style={[styles.iconLayer, { transform: [{ translateX: dx * o }, { translateY: dy * o }] }]}>
            <MaterialCommunityIcons name={iconName} size={iconSize} color={UCLE_COLORS.outline} />
          </View>
        ))}
        <View style={styles.iconLayer}>
          <MaterialCommunityIcons name={iconName} size={iconSize} color={ink} />
        </View>
      </View>
    </View>
  );
}

export const TileFace = memo(TileFaceBase);

const styles = StyleSheet.create({
  abs: { position: "absolute", left: 0, right: 0, top: 0 },
  edge: { borderColor: UCLE_COLORS.outline },
  face: { overflow: "hidden" },
  iconLayer: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});
