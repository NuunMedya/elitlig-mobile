import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
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

/** Karo yüzü: kalınlık + renkli yüz + parlaklık şeridi + ikon. Saf çizim. */
function TileFaceBase({ kind, w, h, slab, back }: Props) {
  const k = UCLE_KINDS[kind % UCLE_KINDS.length];
  const r = Math.round(w * 0.2);
  const faceH = h - slab;
  const faceColor = back ? UCLE_COLORS.back : k.face;
  const deepColor = back ? UCLE_COLORS.backDeep : k.deep;
  return (
    <View style={{ width: w, height: h }} pointerEvents="none">
      <View style={[styles.abs, { top: slab, height: faceH, borderRadius: r, backgroundColor: deepColor }]} />
      <View style={[styles.abs, styles.face, { height: faceH, borderRadius: r, backgroundColor: faceColor }]}>
        <View style={[styles.shine, { height: faceH * 0.42, borderTopLeftRadius: r, borderTopRightRadius: r }]} />
        <MaterialCommunityIcons
          name={(back ? "shield-half-full" : k.icon) as IconName}
          size={Math.round(w * (back ? 0.46 : 0.58))}
          color={back ? UCLE_COLORS.backInk : k.ink}
        />
      </View>
    </View>
  );
}

export const TileFace = memo(TileFaceBase);

const styles = StyleSheet.create({
  abs: { position: "absolute", left: 0, right: 0, top: 0 },
  face: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UCLE_COLORS.shine,
    overflow: "hidden",
  },
  shine: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: UCLE_COLORS.shine },
});
