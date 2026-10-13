/**
 * MAÇ GÜNLÜĞÜ SATIRI — oyuncunun tek bir maçı.
 *
 * İki ekran kullanır: herkese açık profilin "Maçlar" sekmesi ve "Genel"deki
 * son maçlar, üyenin kendi panelindeki maç günlüğü. Veri kaynakları farklı
 * (biri maç maç kayıt, öbürü panel istatistiği) ama soru aynı: "o gün ne
 * oldu, kaç aldı?" — bu yüzden satır ham kaydı değil düz alanları alır.
 *
 * ANATOMİ (soldan sağa, sabit sütunlar — alt alta satırlar ızgara gibi okunur):
 *   tarih (gün iri, ay küçük) · rakip amblemi · rakip + künye (İLK 11, gol,
 *   asist, kart işaretleri) · SONUÇ RENKLİ skor kutusu · reyting hapı
 *
 * NEDEN SONUÇ RAYI DEĞİL SKOR KUTUSU: eski satır sonucu solda 3px'lik bir
 * şeritle veriyordu; şerit kenarda kaldığı için göz skora gelince sonucu
 * unutuyordu. Sonuç artık skorun kendi zemini — tek bakışta "6-4, kazandı".
 * Kutunun metni nötr mürekkeptir: renkli zemin üstünde renkli metin AA'yı
 * geçmez; renk zemine ve kenara, okunurluk metne aittir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RatingPill, TeamLogo, Touchable, withAlpha, type FormResult } from "@/components/ui";
import { mediaUrl } from "@/lib/format";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import type { RowPosition } from "./shared";

/** Satır yüksekliği sabittir; sanal liste `getItemLayout`'u bundan kurar. */
export const MATCH_LOG_ROW_HEIGHT = 64;

export interface MatchLogRowProps {
  matchId: number;
  date: string | null;
  opponent: string;
  opponentLogo?: string | null;
  /** Kendi takımı – rakip sırasıyla "6-4"; skor yoksa null. */
  score: string | null;
  result: FormResult | null;
  rating: number | null;
  goals?: number;
  assists?: number;
  ownGoals?: number;
  yellow?: number;
  red?: number;
  started?: boolean;
  captain?: boolean;
  /** Künyenin sonundaki kısa bağlam ("Ev", "15. SEZON"); sığmazsa kısalır. */
  venue?: string | null;
  position: RowPosition;
  onPress: (matchId: number) => void;
}

const MONTHS = ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"];

/** "2026-10-04…" → { day: "04", month: "EKİ" }. Saat dilimi kaydırmasın diye dize okunur. */
export function splitDate(raw: string | null): { day: string; month: string } | null {
  if (!raw) return null;
  const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? { day: match[3], month } : null;
}

const RESULT_COLOR: Record<FormResult, string> = {
  W: colors.win,
  D: colors.draw,
  L: colors.loss,
};
const RESULT_DIM: Record<FormResult, string> = {
  W: colors.winDim,
  D: colors.drawDim,
  L: colors.lossDim,
};
const RESULT_SPEECH: Record<FormResult, string> = {
  W: "galibiyet",
  D: "beraberlik",
  L: "mağlubiyet",
};

export const MatchLogRow = React.memo(function MatchLogRow({
  matchId,
  date,
  opponent,
  opponentLogo,
  score,
  result,
  rating,
  goals = 0,
  assists = 0,
  ownGoals = 0,
  yellow = 0,
  red = 0,
  started,
  captain,
  venue,
  position,
  onPress,
}: MatchLogRowProps) {
  const handlePress = useCallback(() => onPress(matchId), [onPress, matchId]);
  const name = opponent || "Rakip";

  const speech = [
    `${name} maçı`,
    score ? `skor ${score}` : null,
    result ? RESULT_SPEECH[result] : null,
    goals > 0 ? `${goals} gol` : null,
    assists > 0 ? `${assists} asist` : null,
    rating != null ? `puan ${rating.toFixed(1)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const hasMarks = goals > 0 || assists > 0 || ownGoals > 0 || yellow > 0 || red > 0 || captain;

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={speech}
      style={[
        styles.row,
        (position === "first" || position === "single") && styles.top,
        (position === "last" || position === "single") && styles.bottom,
        position !== "last" && position !== "single" && styles.divider,
      ]}
    >
      <DateBlock date={date} />

      <TeamLogo name={name} logo={mediaUrl(opponentLogo ?? null)} size={28} />

      <View style={styles.body}>
        <Text style={styles.opponent} numberOfLines={1} {...textScale.dense}>
          {upperTR(name)}
        </Text>
        <View style={styles.meta}>
          {started ? (
            <Text style={styles.role} numberOfLines={1} {...textScale.badge}>
              İLK 11
            </Text>
          ) : null}
          {hasMarks ? (
            <View style={styles.marks}>
              {goals > 0 ? <Mark icon="football" color={colors.textPrimary} count={goals} /> : null}
              {assists > 0 ? <Mark icon="footsteps" color={colors.accentText} count={assists} /> : null}
              {ownGoals > 0 ? <Mark icon="football-outline" color={colors.loss} count={ownGoals} /> : null}
              {yellow > 0 ? <Card color={colors.yellowCard} count={yellow} /> : null}
              {red > 0 ? <Card color={colors.redCard} count={red} /> : null}
              {captain ? <Mark icon="ribbon" color={colors.brandAccent} count={0} /> : null}
            </View>
          ) : null}
          {venue ? (
            <Text style={styles.metaText} numberOfLines={1} {...textScale.badge}>
              {venue}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.score,
          result
            ? { backgroundColor: RESULT_DIM[result], borderColor: withAlpha(RESULT_COLOR[result], 0.4) }
            : null,
        ]}
      >
        <Text style={styles.scoreText} numberOfLines={1} {...textScale.badge}>
          {score ?? "–"}
        </Text>
      </View>

      <View style={styles.rating}>
        <RatingPill value={rating} size="sm" hideEmpty />
      </View>
    </Touchable>
  );
});

/**
 * Tarih bloğu — gün iri (Archivo), ay küçük büyük harf. Maç satırlarının sol
 * sütunu; başka maç listeleri de (üye paneli) aynı sütunu kullanır.
 */
export const DateBlock = React.memo(function DateBlock({ date }: { date: string | null }) {
  const parts = splitDate(date);
  return (
    <View style={styles.date}>
      <Text style={styles.day} {...textScale.badge}>
        {parts?.day ?? "—"}
      </Text>
      {parts ? (
        <Text style={styles.month} {...textScale.badge}>
          {parts.month}
        </Text>
      ) : null}
    </View>
  );
});

/** Gol/asist işareti — sayı 1'den büyükse yanına adet yazılır. */
function Mark({
  icon,
  color,
  count,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  count: number;
}) {
  return (
    <View style={styles.mark}>
      <Ionicons name={icon} size={11} color={color} />
      {count > 1 ? (
        <Text style={[styles.markCount, { color }]} {...textScale.badge}>
          {count}
        </Text>
      ) : null}
    </View>
  );
}

/** Kart işareti — dik dikdörtgen, gerçek kartın oranı. */
function Card({ color, count }: { color: string; count: number }) {
  return (
    <View style={styles.mark}>
      <View style={[styles.cardShape, { backgroundColor: color }]} />
      {count > 1 ? (
        <Text style={[styles.markCount, { color: colors.textSecondary }]} {...textScale.badge}>
          {count}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    height: MATCH_LOG_ROW_HEIGHT,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface1,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
  },
  top: {
    borderTopWidth: hairline,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  bottom: {
    borderBottomWidth: hairline,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  divider: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  date: {
    width: 30,
    alignItems: "center",
  },
  day: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  month: {
    ...type.micro,
    color: colors.textTertiary,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  opponent: {
    ...type.h4,
    color: colors.textPrimary,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 14,
  },
  metaText: {
    ...type.micro,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  /* Rozet ve işaretler küçülmez; sığmazsa yalnız sondaki künye kısalır. */
  role: {
    ...type.micro,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  marks: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    flexShrink: 0,
  },
  mark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  markCount: {
    ...type.micro,
    letterSpacing: 0,
  },
  cardShape: {
    width: 7,
    height: 10,
    borderRadius: 1,
  },
  score: {
    minWidth: 46,
    height: 26,
    paddingHorizontal: space.s,
    borderRadius: radius.xs,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  /* Reyting sütunu sabit genişlikte: puanı olmayan satırda da skor kutuları
     aynı hizada kalır. */
  rating: {
    width: 36,
    alignItems: "flex-end",
  },
});
