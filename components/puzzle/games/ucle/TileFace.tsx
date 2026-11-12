import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { UCLE_COLORS, UCLE_KINDS } from "@/lib/puzzle/uclePalette";
import { colors } from "@/theme";

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

/**
 * Karo yüzü: koyu taban (2.5D kalınlık), ışığı sol üstten alan parlak yüz
 * (radyal gradyan), cam kubbe, kenar parlaması, parıltı noktası ve ikon
 * gölgesi. Saf çizim (SVG + ikon).
 */
function TileFaceBase({ kind, w, h, slab, back }: Props) {
  const k = UCLE_KINDS[kind % UCLE_KINDS.length];
  const r = Math.round(w * 0.2);
  const faceH = h - slab;
  const faceColor = back ? UCLE_COLORS.back : k.face;
  const deepColor = back ? UCLE_COLORS.backDeep : k.deep;
  const gid = `uk${back ? "b" : kind % UCLE_KINDS.length}`;
  const iconName = (back ? "shield-half-full" : k.icon) as IconName;
  const iconSize = Math.round(w * (back ? 0.46 : 0.56));
  return (
    <View style={{ width: w, height: h }} pointerEvents="none">
      <View style={[styles.abs, { top: slab, height: faceH, borderRadius: r, backgroundColor: deepColor }]} />
      <View style={[styles.abs, styles.face, { height: faceH, borderRadius: r }]}>
        <Svg width={w} height={faceH} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={gid} cx="32%" cy="22%" r="95%">
              <Stop offset="0" stopColor={UCLE_COLORS.white} stopOpacity={0.55} />
              <Stop offset="0.35" stopColor={faceColor} stopOpacity={1} />
              <Stop offset="1" stopColor={deepColor} stopOpacity={1} />
            </RadialGradient>
            <LinearGradient id="ukdome" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.onDark} stopOpacity={0.35} />
              <Stop offset="0.5" stopColor={colors.onDark} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={w} height={faceH} rx={r} fill={`url(#${gid})`} />
          <Rect x={w * 0.08} y={faceH * 0.06} width={w * 0.84} height={faceH * 0.48} rx={r * 0.8} fill="url(#ukdome)" />
          <Rect x={1.2} y={1.2} width={w - 2.4} height={faceH - 2.4} rx={r - 1} fill="none" stroke={UCLE_COLORS.white} strokeOpacity={0.45} strokeWidth={1.4} />
          <Ellipse cx={w * 0.3} cy={faceH * 0.2} rx={w * 0.14} ry={faceH * 0.06} fill={UCLE_COLORS.white} fillOpacity={0.55} transform={`rotate(-25 ${w * 0.3} ${faceH * 0.2})`} />
        </Svg>
        <View style={[styles.iconLayer, styles.iconShadow]}>
          <MaterialCommunityIcons name={iconName} size={iconSize} color={UCLE_COLORS.shadow} />
        </View>
        <View style={styles.iconLayer}>
          <MaterialCommunityIcons name={iconName} size={iconSize} color={back ? UCLE_COLORS.backInk : k.ink} />
        </View>
      </View>
    </View>
  );
}

export const TileFace = memo(TileFaceBase);

const styles = StyleSheet.create({
  abs: { position: "absolute", left: 0, right: 0, top: 0 },
  face: { overflow: "hidden" },
  iconLayer: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  iconShadow: { transform: [{ translateX: 0.8 }, { translateY: 1.6 }] },
});
