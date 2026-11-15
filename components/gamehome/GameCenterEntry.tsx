/**
 * OYUN MERKEZİ GİRİŞ KARTI — menünün en göze çarpan kapısı (eski küçük
 * "Oyunlar" karosunun yerine). Gün batımı gradyanı, altın kenar, oyun ikonu
 * şeridi, harcanabilir yıldız ve büyük "OYNA" hapı. Günün Testi, Fantezi ve
 * Tahmin Ligi artık oyun merkezinin içindedir; kart onları da anar ve bugünkü
 * Günün Testi durumunu gösterir. Bütün kart tek dokunma hedefidir (erişilebilir).
 *
 * 2026-11 SADELEŞTİRME: köşe parıltısı, kalın altın kenar, düğme dudağı ve
 * metin gölgeleri kaldırıldı; oyun karoları düz renk. Başlık
 * `adjustsFontSizeToFit`e güvenmez (web yok sayıyor, 320px'te kesiliyordu).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import { GH } from "@/lib/game/gameHomePalette";
import { HUB } from "@/lib/game/hubPalette";
import { fonts, radius, space, textScale, type } from "@/theme";

const DIAG_START = { x: 0, y: 0 } as const;
const DIAG_END = { x: 1, y: 1 } as const;

const STRIP: { key: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "uclu", icon: "football" },
  { key: "penalti", icon: "golf" },
  { key: "kadro", icon: "people" },
  { key: "slalom", icon: "flag" },
  { key: "gunun", icon: "bulb" },
  { key: "fantezi", icon: "people-circle" },
];

export const GameCenterEntry = React.memo(function GameCenterEntry({
  onPress,
  stars,
  dailyCorrect,
}: {
  onPress: () => void;
  /** Harcanabilir Kulüp Şehri yıldızı (girişliyse). */
  stars?: number | null;
  /** Günün Testi bugünkü doğru sayısı (oynanmadıysa null). */
  dailyCorrect?: number | null;
}) {
  return (
    <Touchable
      feedback="card"
      haptic="medium"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Oyun merkezi. Bütün oyunlar, Günün Testi, Fantezi ve Tahmin Ligi.${stars != null ? ` ${stars} yıldızın var.` : ""}`}
      style={styles.card}
      testID="menu-game-center"
    >
      <LinearGradient colors={GH.entry} start={DIAG_START} end={DIAG_END} style={StyleSheet.absoluteFill} />
      <View style={styles.head}>
        <View style={styles.badge}>
          <Ionicons name="game-controller" size={28} color={GH.white} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.over} {...textScale.badge}>OYNA · KAZAN · ŞEHRİNİ KUR</Text>
          <Text style={styles.title} numberOfLines={1} {...textScale.badge}>OYUN MERKEZİ</Text>
        </View>
        {stars != null ? (
          <View style={styles.stars}>
            <Ionicons name="star" size={16} color={GH.star} />
            <Text style={styles.starsText} {...textScale.badge}>{stars.toLocaleString("tr-TR")}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.strip}>
        {STRIP.map((g) => (
          <View key={g.key} style={[styles.mini, { backgroundColor: (HUB.game[g.key] ?? HUB.game.uclu)[1] }]}>
            <Ionicons name={g.icon} size={20} color={GH.white} />
          </View>
        ))}
      </View>

      <Text style={styles.sub} numberOfLines={2} {...textScale.dense}>
        Bulmacalar, bölümlü arcade, bilgi yarışmaları, Günün Testi, Fantezi ve Tahmin Ligi: hepsi tek yerde, hepsi yıldız kazandırır.
      </Text>

      <View style={styles.foot}>
        <View style={styles.chip}>
          <Ionicons name={dailyCorrect != null ? "checkmark-done" : "bulb"} size={14} color={GH.white} />
          <Text style={styles.chipText} numberOfLines={1} {...textScale.badge}>
            {dailyCorrect != null ? `Günün Testi ${dailyCorrect}/10` : "Günün Testi hazır"}
          </Text>
        </View>
        <View style={styles.play}>
          <Ionicons name="play" size={16} color={GH.white} />
          <Text style={styles.playText} {...textScale.badge}>OYNA</Text>
        </View>
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.xxl, overflow: "hidden", padding: space.lg, gap: space.md, minHeight: 200 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  badge: { width: 48, height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: GH.entryTile },
  texts: { flex: 1, minWidth: 0 },
  over: { ...type.overline, fontFamily: fonts.bold, color: GH.white, opacity: 0.9 },
  title: { ...type.display, fontFamily: fonts.bold, color: GH.white },
  stars: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: GH.hud },
  starsText: { ...type.label, fontFamily: fonts.bold, color: GH.white },
  strip: { flexDirection: "row", gap: space.sm },
  mini: { flex: 1, aspectRatio: 1, maxWidth: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  sub: { ...type.bodySm, color: GH.white, opacity: 0.95 },
  foot: { flexDirection: "row", alignItems: "center", gap: space.sm },
  chip: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: GH.hud },
  chipText: { ...type.micro, fontFamily: fonts.bold, color: GH.white, flexShrink: 1 },
  play: { height: 44, paddingHorizontal: space.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, borderRadius: radius.pill, backgroundColor: GH.playFlat, borderBottomWidth: 3, borderBottomColor: GH.playFlatEdge },
  playText: { ...type.h3, fontFamily: fonts.bold, color: GH.white, letterSpacing: 1 },
});
