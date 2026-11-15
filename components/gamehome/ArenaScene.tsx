/**
 * SONSUZ / BİLGİ OYUNU ANA SAYFASI SAHNESİ — sakin gece stadyumu: iki tonlu
 * gökyüzü, tek parça tribün silueti, hafif şeritli saha. Ortada oyunun düz
 * madalyonu, adı ve bilgi kartları (rekor · bugünkü yıldız).
 *
 * 2026-11 SADELEŞTİRME: projektör hüzmeleri, yüzlerce renkli seyirci noktası
 * ve parlak madalyon göz yoruyordu; kaldırıldı. Kahraman blok üst ve alt
 * şeridin ARASINDAKİ boş alana ortalanır (`top`/`bottom`); kısa ekranda önce
 * madalyon küçülür, yine sığmazsa bilgi kartları gizlenir (OYNA ile çakışmaz).
 * Tek SVG, ölçüye göre bir kez üretilir (useMemo); animasyon yok.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Ellipse, Path, Rect } from "react-native-svg";

import { GH } from "@/lib/game/gameHomePalette";
import { HUB } from "@/lib/game/hubPalette";
import { fonts, radius, space, textScale, type } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export interface ArenaStat {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

/** Ad (24) + kartlar (64) + aralıklar: madalyonun dışında kahramanın ihtiyacı. */
const TITLE_H = 30;
const STATS_H = 64;

export const ArenaScene = React.memo(function ArenaScene({
  gameKey,
  icon,
  title,
  stats,
  top = 0,
  bottom = 0,
}: {
  gameKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  title?: string;
  stats?: ArenaStat[];
  /** Üst ve alt şeridin yüksekliği (kahraman aradaki boşluğa ortalanır). */
  top?: number;
  bottom?: number;
}) {
  const { width: w, height: h } = useWindowDimensions();
  const standTop = h * 0.4;
  const standBottom = h * 0.54;
  const fill = HUB.game[gameKey] ?? HUB.game.uclu;

  // Kahraman yerleşimi: boş alan = ekran − şeritler.
  const free = Math.max(0, h - top - bottom - space.lg * 2);
  const showStats = Boolean(stats?.length) && free >= 72 + TITLE_H + STATS_H + space.md * 2;
  const rest = (title ? TITLE_H + space.md : 0) + (showStats ? STATS_H + space.md : 0);
  const medal = Math.max(56, Math.min(112, w * 0.3, free - rest));
  const heroH = medal + rest;
  const heroTop = top + space.lg + Math.max(0, (free - heroH) / 2);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={GH.sceneSky} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        {/* tribün: tek silüet */}
        <Path d={`M 0 ${standTop + 18} Q ${w / 2} ${standTop - 22} ${w} ${standTop + 18} L ${w} ${standBottom} L 0 ${standBottom} Z`} fill={GH.sceneStandFar} />
        <Rect x={0} y={standTop + 26} width={w} height={standBottom - standTop - 26} fill={GH.sceneStand} />
        {/* saha (perspektif) */}
        <Path d={`M ${-w * 0.2} ${h} L ${w * 0.1} ${standBottom} L ${w * 0.9} ${standBottom} L ${w * 1.2} ${h} Z`} fill={GH.sceneGrass[1]} />
        {[0, 2, 4].map((i) => {
          const t0 = i / 6;
          const t1 = (i + 1) / 6;
          const y0 = standBottom + (h - standBottom) * t0 * t0;
          const y1 = standBottom + (h - standBottom) * t1 * t1;
          return <Rect key={`s${i}`} x={0} y={y0} width={w} height={Math.max(1, y1 - y0)} fill={GH.sceneGrass[0]} opacity={0.5} />;
        })}
        <Ellipse cx={w / 2} cy={standBottom + (h - standBottom) * 0.42} rx={w * 0.26} ry={(h - standBottom) * 0.12} fill="none" stroke={GH.sceneLine} strokeWidth={2} />
        <Path d={`M ${w * 0.1} ${standBottom} L ${w * 0.9} ${standBottom}`} stroke={GH.sceneLine} strokeWidth={2} />
      </Svg>

      {/* kahraman: madalyon · ad · bilgi kartları */}
      <View style={[styles.hero, { top: heroTop }]}>
        <View style={[styles.medal, { width: medal, height: medal, backgroundColor: fill[fill.length - 1] }]}>
          <Ionicons name={icon} size={Math.round(medal * 0.46)} color={GH.white} />
        </View>
        {title ? (
          <Text style={styles.title} numberOfLines={1} {...textScale.badge}>
            {title}
          </Text>
        ) : null}
        {showStats && stats ? (
          <View style={styles.stats}>
            {stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <View style={styles.statHead}>
                  <Ionicons name={s.icon} size={13} color={GH.coin} />
                  <Text style={styles.statLabel} numberOfLines={1} {...textScale.badge}>
                    {s.label}
                  </Text>
                </View>
                <Text style={styles.statValue} numberOfLines={1} {...textScale.badge}>
                  {s.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  hero: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: space.md, paddingHorizontal: space.lg },
  medal: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: GH.hudSoft },
  title: { ...type.display, fontFamily: fonts.bold, color: GH.white, height: TITLE_H, maxWidth: "100%" },
  stats: { flexDirection: "row", gap: space.sm, alignSelf: "stretch", justifyContent: "center", maxWidth: 400, width: "100%", marginHorizontal: "auto" },
  stat: { flex: 1, minWidth: 0, maxWidth: 180, height: STATS_H, paddingHorizontal: space.md, justifyContent: "center", gap: space.xxs, borderRadius: radius.lg, backgroundColor: GH.sceneCard, borderWidth: 1, borderColor: GH.hudEdge },
  statHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  statLabel: { ...type.labelXs, color: GH.hudSoft, flexShrink: 1 },
  statValue: { ...type.scoreMd, color: GH.white },
});
