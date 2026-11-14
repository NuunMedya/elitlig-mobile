/**
 * Elit Lira jetonu (yeşil-turkuaz "EL" pulu). Ayrı dosyadadır: oyun kiti
 * (game/CityGameKit) ile EL parçaları (ElitLira) birbirini içe aktarmasın.
 */

import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text } from "react-native";

import { CITY2_EL, CITY_UI } from "@/lib/puzzle/cityPalette";
import { fonts, radius, textScale, type } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export function ElCoin({ size = 20 }: { size?: number }) {
  return (
    <LinearGradient colors={CITY2_EL.coin} start={TOP} end={BOTTOM} style={[styles.coin, { width: size, height: size }]}>
      <Text style={[size >= 36 ? styles.coinTextLg : styles.coinText]} {...textScale.badge}>
        EL
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  coin: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CITY2_EL.coinEdge },
  coinText: { ...type.nano, fontFamily: fonts.bold, color: CITY_UI.white, letterSpacing: 0 },
  coinTextLg: { ...type.label, fontFamily: fonts.bold, color: CITY_UI.white },
});
