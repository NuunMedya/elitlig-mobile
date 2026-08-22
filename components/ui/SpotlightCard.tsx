/**
 * SpotlightCard — Genel Bakış'ın tepesindeki tek büyük kart.
 *
 * NE GÖSTERİR: kullanıcının ŞU AN önemsediği tek maç. Öncelik sırası
 * ekran tarafından verilir (canlı maç > bugünkü maç > sıradaki maç); bu
 * bileşen yalnız çizer.
 *
 * NEDEN GRADYAN: uygulamanın geri kalanı düz yüzeylerden kuruludur. Tek bir
 * gradyanlı kart, hiçbir yeni renk ya da tipografi katmadan "burası ekranın
 * merkezi" der. Gradyan mor DEĞİL, zemin tonlarının bir tık üstündedir —
 * mor geniş yüzey doldurmaz (§1.0) — üstüne yalnız ince bir mor/aksan ışıma
 * bindirilir.
 *
 * NEDEN SKOR ORTADA DEĞİL: iki takım adı iki satırda, skor sağda hizalı
 * durur. Bu, alttaki maç listesinin satır düzeniyle AYNI okuma eksenidir;
 * ortada dev skor gösteren bir hero kart, kullanıcıyı iki farklı okuma
 * biçimi arasında gidip gelmeye zorlardı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { LiveBadge } from "./LiveBadge";
import { Touchable } from "./Pressable";
import { TeamLogo } from "./TeamLogo";

export interface SpotlightTeam {
  name: string;
  logo?: string | null;
  score?: number | null;
}

export interface SpotlightCardProps {
  /** Üst satırdaki küçük büyük-harf etiket: "SIRADAKİ MAÇ", "CANLI". */
  eyebrow: string;
  /** Etiketin sağındaki bağlam: lig adı, saha. */
  context?: string;
  home: SpotlightTeam;
  away: SpotlightTeam;
  /** Skor yerine gösterilecek metin (saat, "MS", "—"). */
  statusText?: string;
  /** Canlı ise nabız atan rozet ve dakika. */
  live?: boolean;
  minute?: number | null;
  /** Alt şeritteki bilgi satırı: tarih · saha · hakem. */
  footnote?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const SpotlightCard = React.memo(function SpotlightCard({
  eyebrow,
  context,
  home,
  away,
  statusText,
  live,
  minute,
  footnote,
  onPress,
  style,
  testID,
}: SpotlightCardProps) {
  const hasScore = typeof home.score === "number" && typeof away.score === "number";

  const side = (team: SpotlightTeam, winner: boolean) => (
    <View style={styles.side}>
      <TeamLogo logo={team.logo} name={team.name} size={26} />
      <Text
        style={[styles.teamName, winner ? styles.teamNameWinner : null]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {team.name}
      </Text>
      {hasScore ? (
        <Text
          style={[styles.score, winner ? styles.scoreWinner : null]}
          {...textScale.dense}
        >
          {team.score}
        </Text>
      ) : null}
    </View>
  );

  // Kazanan kalın + textPrimary, kaybeden sönük (§1.0/4). Berabere ikisi de normal.
  const homeWins = hasScore && (home.score as number) > (away.score as number);
  const awayWins = hasScore && (away.score as number) > (home.score as number);

  /* Düz yüzey: surface2 → surface1 gradyanı iki komşu tondan ibaretti, yani
     görünmüyordu ama her karede bir gradient katmanı çiziyordu. Bu üründe
     gradient yalnız görsel üstü okunabilirlik scrim'i için meşru. */
  const content = (
    <View style={styles.gradient}>
      <View style={styles.head}>
        {live ? <LiveBadge minute={minute} size="sm" /> : null}
        <Text style={styles.eyebrow} numberOfLines={1} {...textScale.badge}>
          {upperTR(eyebrow)}
        </Text>
        {context ? (
          <Text style={styles.context} numberOfLines={1} {...textScale.dense}>
            {context}
          </Text>
        ) : null}
      </View>

      <View style={styles.teams}>
        {side(home, homeWins)}
        {side(away, awayWins)}

        {!hasScore && statusText ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText} {...textScale.dense}>
              {statusText}
            </Text>
          </View>
        ) : null}
      </View>

      {footnote ? (
        <View style={styles.footer}>
          <Text style={styles.footnote} numberOfLines={1} {...textScale.dense}>
            {footnote}
          </Text>
          {onPress ? (
            <Ionicons name="chevron-forward" size={12} color={colors.textTertiary} />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View style={[styles.card, style]} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}: ${home.name} - ${away.name}`}
      style={[styles.card, style]}
      testID={testID}
    >
      {content}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    overflow: "hidden",
  },
  gradient: {
    backgroundColor: colors.surface1,
    padding: space.md,
    gap: space.m,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  eyebrow: {
    ...type.overline,
    color: colors.accentText,
  },
  context: {
    ...type.caption,
    color: colors.textTertiary,
    marginLeft: "auto",
    flexShrink: 1,
  },
  teams: {
    gap: space.sm,
  },
  side: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  teamName: {
    ...type.h2,
    color: colors.textSecondary,
    flex: 1,
  },
  teamNameWinner: {
    color: colors.textPrimary,
  },
  score: {
    ...type.scoreLg,
    color: colors.textSecondary,
    minWidth: 24,
    textAlign: "right",
  },
  scoreWinner: {
    color: colors.textPrimary,
  },
  /** Skor yoksa saat/durum sağ üstte, iki takım satırının ortasında durur. */
  statusBox: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  statusText: {
    ...type.h2,
    color: colors.accentText,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  footnote: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
  },
});
