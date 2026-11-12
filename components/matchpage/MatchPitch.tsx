/**
 * MAÇ SAHASI — iki ilk kadro karşı karşıya, forma rozetleriyle.
 *
 * NEDEN YEREL (kitteki `PitchView` değil): maç sayfası sahayı bir "an"
 * olarak gösterir — takım renginde degrade formalar, mevki renginde halka,
 * olay rozetleri, ışıklı saha. `PitchView` kadro yönetimi ekranlarıyla
 * ortaktır ve orada sade kalması gerekir.
 *
 * DÜZEN:
 *   · Deplasman ÜST yarıda (aynalanmış), ev sahibi ALT yarıda; kaleler dipte.
 *   · Forma rozeti: takım degradesiyle dolu daire (ev menekşe, deplasman
 *     camgöbeği), çevresinde MEVKİ RENGİNDE halka (KAL altın · DEF mavi ·
 *     ORT mor · FOR pembe). İçinde forma numarası; numara girilmemişse baş
 *     harfler.
 *   · Köşeler: sağ üst gol sayısı / kart / değişiklik, sol üst reyting, sol
 *     alt kaptan "K".
 *   · Altta cam hapta soyadı.
 *
 * LİG 8 KİŞİLİK: hatlar oyuncu sayısına göre kendiliğinden dağılır; hiçbir
 * yerleşim 11 kişi varsaymaz.
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";

import { EventIcon, Touchable, withAlpha, type EventIconKind } from "@/components/ui";
import { positionLine } from "@/lib/api/team";
import {
  colors,
  dark as darkPalette,
  fonts,
  glowStyle,
  hairline,
  palette,
  positionBadge,
  positionColor,
  radius,
  space,
  textScale,
  type,
  type PositionLine,
} from "@/theme";

export interface MatchPitchPlayer {
  key: string;
  name: string;
  number?: number | string | null;
  position?: string | null;
  /** Gol sayısı — rozette "×2" olarak. */
  goals?: number;
  /** Gol dışındaki olaylar: kart, değişiklik. */
  events?: EventIconKind[];
  rating?: number | null;
  captain?: boolean;
  onPress?: () => void;
}

export interface MatchPitchProps {
  home: MatchPitchPlayer[];
  away: MatchPitchPlayer[];
  width: number;
}

/** Saha en/boy oranı — iki yarı sahada dörder hat rahat sığar. */
const ASPECT = 1.56;
/** Ev sahibi alt yarıda (kalesi dipte), deplasman üstte, aynalı. */
const HOME_Y: Record<PositionLine, number> = { GK: 92, DEF: 80, MID: 68, FWD: 57 };
const AWAY_Y: Record<PositionLine, number> = { GK: 8, DEF: 20, MID: 32, FWD: 43 };
const LINES: PositionLine[] = ["GK", "DEF", "MID", "FWD"];

const DISC = 36;
const SLOT_W = 76;

/** Saha üstü cam hap zemini — iki temada da koyu (saha her zaman koyu yeşil). */
const LABEL_BG = withAlpha(darkPalette.bg, 0.62);

export const MatchPitch = memo(function MatchPitch({ home, away, width }: MatchPitchProps) {
  const height = Math.round(width * ASPECT);

  const placed = useMemo(() => {
    const place = (list: MatchPitchPlayer[], lineY: Record<PositionLine, number>, side: "home" | "away") => {
      const out: { player: MatchPitchPlayer; x: number; y: number; side: "home" | "away" }[] = [];
      for (const line of LINES) {
        const row = list.filter((player) => positionLine(player.position) === line);
        row.forEach((player, index) => {
          // Deplasman aynalı: soldan sağa sırası ters (karşıdan bakış).
          const slot = side === "away" ? row.length - index : index + 1;
          out.push({ player, side, x: (slot / (row.length + 1)) * width, y: (lineY[line] / 100) * height });
        });
      }
      return out;
    };
    return [...place(away, AWAY_Y, "away"), ...place(home, HOME_Y, "home")];
  }, [away, height, home, width]);

  return (
    <View style={[styles.pitch, { width, height }]}>
      <LinearGradient colors={colors.gradientPitch} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Biçme şeritleri: sekiz bant, tek-çift saydamlık. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 8 }, (_, index) => (
          <View key={index} style={[styles.band, index % 2 ? styles.bandOn : null]} />
        ))}
      </View>
      <PitchLines width={width} height={height} />
      {/* Orta noktadan yayılan hafif ışık. */}
      <View style={[styles.spot, { top: height / 2 - 60, left: width / 2 - 60 }]} pointerEvents="none" />

      {placed.map(({ player, x, y, side }) => (
        <Token key={player.key} player={player} side={side} x={x} y={y} />
      ))}
    </View>
  );
});

/** Tebeşir çizgileri: dış çizgi, orta saha, orta yuvarlak, ceza alanları, kaleler. */
const PitchLines = memo(function PitchLines({ width, height }: { width: number; height: number }) {
  const m = 10;
  const boxW = width * 0.56;
  const boxH = height * 0.11;
  const smallW = width * 0.28;
  const smallH = height * 0.045;
  const goalW = width * 0.18;
  const stroke = colors.chalk;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={m} y={m} width={width - m * 2} height={height - m * 2} rx={6} stroke={stroke} strokeWidth={1.5} fill="none" />
      <Line x1={m} y1={height / 2} x2={width - m} y2={height / 2} stroke={stroke} strokeWidth={1.5} />
      <Circle cx={width / 2} cy={height / 2} r={width * 0.14} stroke={stroke} strokeWidth={1.5} fill="none" />
      <Circle cx={width / 2} cy={height / 2} r={3} fill={stroke} />
      {/* Üst ceza alanı */}
      <Rect x={(width - boxW) / 2} y={m} width={boxW} height={boxH} stroke={stroke} strokeWidth={1.5} fill="none" />
      <Rect x={(width - smallW) / 2} y={m} width={smallW} height={smallH} stroke={stroke} strokeWidth={1.5} fill="none" />
      <Rect x={(width - goalW) / 2} y={m - 5} width={goalW} height={5} stroke={stroke} strokeWidth={1.5} fill="none" />
      {/* Alt ceza alanı */}
      <Rect x={(width - boxW) / 2} y={height - m - boxH} width={boxW} height={boxH} stroke={stroke} strokeWidth={1.5} fill="none" />
      <Rect x={(width - smallW) / 2} y={height - m - smallH} width={smallW} height={smallH} stroke={stroke} strokeWidth={1.5} fill="none" />
      <Rect x={(width - goalW) / 2} y={height - m} width={goalW} height={5} stroke={stroke} strokeWidth={1.5} fill="none" />
    </Svg>
  );
});

/** "Abdullah Bulut" → "AB"; tek kelimede ilk iki harf. */
function initialsOf(name: string): string {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase("tr-TR");
  return (words[0][0] + words[words.length - 1][0]).toLocaleUpperCase("tr-TR");
}

/** Hap etiketi: soyadı (tek kelimeyse adın kendisi). */
function labelOf(name: string): string {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1] : "Oyuncu";
}

const Token = memo(function Token({
  player,
  side,
  x,
  y,
}: {
  player: MatchPitchPlayer;
  side: "home" | "away";
  x: number;
  y: number;
}) {
  const line = player.position ? positionLine(player.position) : null;
  const ring = positionColor(palette, line);
  const shirt = player.number === "" || player.number == null ? null : String(player.number);
  const kit = side === "home" ? colors.gradientBrand : colors.tileTones.cyan;
  const goals = player.goals ?? 0;
  const others = (player.events ?? []).filter((kind) => kind !== "goal");
  const speech = [
    player.name,
    shirt ? `forma ${shirt}` : null,
    line ? positionBadge(line) : null,
    goals ? `${goals} gol` : null,
    player.captain ? "kaptan" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Touchable
      feedback="icon"
      haptic="selection"
      disabled={!player.onPress}
      onPress={player.onPress}
      accessibilityRole="button"
      accessibilityLabel={speech}
      style={[styles.slot, { left: x - SLOT_W / 2, top: y - DISC / 2 }]}
    >
      <View style={[styles.ring, { borderColor: ring }, glowStyle(ring, 1)]}>
        <View style={styles.disc}>
          <LinearGradient colors={kit} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.discFill]} />
          <Text style={[styles.number, shirt ? null : styles.initials]} {...textScale.badge}>
            {shirt ?? initialsOf(player.name)}
          </Text>
        </View>

        {goals > 0 ? (
          <View style={[styles.corner, styles.cornerTR, styles.goalBadge]}>
            <EventIcon kind="goal" size={10} color={colors.pitch} />
            {goals > 1 ? (
              <Text style={styles.goalCount} {...textScale.badge}>
                {goals}
              </Text>
            ) : null}
          </View>
        ) : others[0] ? (
          <View style={[styles.corner, styles.cornerTR, styles.eventBadge]}>
            <EventIcon kind={others[0]} size={10} onDark />
          </View>
        ) : null}

        {player.rating != null ? (
          <View style={[styles.corner, styles.cornerTL, styles.ratingBadge]}>
            <Text style={styles.ratingText} {...textScale.badge}>
              {player.rating.toFixed(1).replace(".", ",")}
            </Text>
          </View>
        ) : null}

        {player.captain ? (
          <View style={[styles.corner, styles.cornerBL, styles.captain]}>
            <Text style={styles.captainText} {...textScale.badge}>
              K
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.label}>
        <Text style={styles.labelText} numberOfLines={1} {...textScale.badge}>
          {labelOf(player.name)}
        </Text>
      </View>
    </Touchable>
  );
});

/** Sahanın altındaki mevki anahtarı — renk tek başına anlam taşımasın. */
export const PositionLegend = memo(function PositionLegend() {
  return (
    <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {LINES.map((line) => (
        <View key={line} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: positionColor(palette, line) }]} />
          <Text style={styles.legendText} {...textScale.badge}>
            {positionBadge(line)}
          </Text>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  pitch: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    borderWidth: hairline,
    borderColor: colors.chalk,
  },
  band: {
    flex: 1,
  },
  bandOn: {
    backgroundColor: colors.chalk,
    opacity: 0.12,
  },
  spot: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: colors.chalk,
    opacity: 0.08,
  },

  slot: {
    position: "absolute",
    width: SLOT_W,
    alignItems: "center",
  },
  ring: {
    width: DISC + 6,
    height: DISC + 6,
    borderRadius: (DISC + 6) / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -3,
  },
  disc: {
    width: DISC - 2,
    height: DISC - 2,
    borderRadius: (DISC - 2) / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  discFill: {
    borderRadius: DISC,
  },
  number: {
    ...type.scoreXs,
    color: colors.onDark,
  },
  initials: {
    ...type.labelXs,
    fontFamily: fonts.bold,
    color: colors.onDark,
  },

  corner: {
    position: "absolute",
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: colors.pitch,
  },
  cornerTR: { top: -5, right: -8 },
  cornerTL: { top: -5, left: -10 },
  cornerBL: { bottom: -4, left: -6 },
  goalBadge: {
    flexDirection: "row",
    gap: 1,
    backgroundColor: colors.onPitch,
  },
  goalCount: {
    ...type.nano,
    color: colors.pitch,
  },
  eventBadge: {
    backgroundColor: LABEL_BG,
  },
  ratingBadge: {
    backgroundColor: colors.ratingGood,
    paddingHorizontal: 3,
  },
  ratingText: {
    ...type.nano,
    color: colors.onDark,
  },
  captain: {
    backgroundColor: colors.medalGold[1],
  },
  captainText: {
    ...type.nano,
    color: colors.medalInk,
  },

  label: {
    marginTop: space.xxs,
    maxWidth: SLOT_W,
    paddingHorizontal: space.xs,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: LABEL_BG,
    justifyContent: "center",
  },
  labelText: {
    ...type.micro,
    color: colors.onDark,
  },

  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.lg,
    paddingTop: space.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  legendText: {
    ...type.overline,
    color: colors.textTertiary,
  },
});
