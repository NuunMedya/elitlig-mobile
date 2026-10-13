/**
 * SpotlightCard — Ana Sayfa'nın vitrin maçı, SAHNE yüzeyinde.
 *
 * NE GÖSTERİR: kullanıcının ŞU AN önemsediği tek maç. Öncelik sırası
 * ekran tarafından verilir (canlı maç > kullanıcının maçı > sıradaki maç);
 * bu bileşen yalnız çizer.
 *
 * NEDEN SAHNE (grafit): Arena dilinde sahne "kimlik ve skor anı"dır ve
 * ekranda en fazla BİR kez, tepede kullanılır. Ana Sayfa'nın tepesindeki tek
 * maç tam olarak budur: altındaki her şey kâğıttır (liste, tablo, haber),
 * vitrin ise skorbordun kendisi. Beyaz kartlar arasında beyaz bir vitrin,
 * yalnız boyutuyla ayrışabiliyordu; grafit, "burası skor" der.
 *
 *   ┌────────────────────────────────────────────┐
 *   │ ● CANLI · ŞU AN OYNANIYOR         FREELİG  │  bağlam satırı
 *   │                                            │
 *   │    ◆◆◆            0 – 0            ◆◆◆      │  amblem · SKOR · amblem
 *   │   EMA FC                        DOSTLAR FC │
 *   │ ────────────────────────────────────────── │
 *   │ ⌖ Bugün · ERYAMAN ATA HALISAHA  Maça git › │  alt şerit
 *   └────────────────────────────────────────────┘
 *
 * SKOR ORTADA, 40px: vitrin listeden farklı okunur ve okunmalıdır — liste
 * tarar, vitrin söyler. Rakam `scoreHero`, sahnede beyaz; canlıyken skor
 * beyaz kalır, canlılığı rozet ve kırmızı nokta söyler (kırmızı rakam koyu
 * zeminde titreşir).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { GradientFill } from "./GradientFill";
import { LiveBadge } from "./LiveBadge";
import { Touchable } from "./Pressable";
import { TeamLogo } from "./TeamLogo";

export interface SpotlightTeam {
  name: string;
  logo?: string | null;
  score?: number | null;
}

export interface SpotlightCardProps {
  /** Üst satırdaki küçük büyük-harf etiket: "SIRADAKİ MAÇ", "ŞU AN OYNANIYOR". */
  eyebrow: string;
  /** Etiketin sağındaki bağlam: lig adı. */
  context?: string;
  home: SpotlightTeam;
  away: SpotlightTeam;
  /** Skor yerine gösterilecek metin (başlama saati, "—"). */
  statusText?: string;
  /** Saatin altındaki küçük gün etiketi ("Yarın", "14 Eki Çar"). */
  statusCaption?: string;
  /** Canlı ise nabız atan rozet ve dakika. */
  live?: boolean;
  minute?: number | null;
  /** Alt şeritteki bilgi satırı: tarih · saha. */
  footnote?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const CREST = 56;

export const SpotlightCard = React.memo(function SpotlightCard({
  eyebrow,
  context,
  home,
  away,
  statusText,
  statusCaption,
  live,
  minute,
  footnote,
  onPress,
  style,
  testID,
}: SpotlightCardProps) {
  const hasScore = typeof home.score === "number" && typeof away.score === "number";

  // Bitmiş maçta kaybeden soluklaşır; canlıyken "kazanan" yoktur.
  const homeWins = !live && hasScore && (home.score as number) > (away.score as number);
  const awayWins = !live && hasScore && (away.score as number) > (home.score as number);

  const side = (team: SpotlightTeam, lost: boolean) => (
    <View style={styles.side}>
      <TeamLogo logo={team.logo} name={team.name} size={CREST} />
      <Text
        style={[styles.teamName, lost ? styles.dim : null]}
        numberOfLines={2}
        {...textScale.dense}
      >
        {team.name}
      </Text>
    </View>
  );

  const content = (
    <>
      <GradientFill tone="ink" radius="xxl" />

      <View style={styles.head}>
        {live ? <LiveBadge minute={minute} onDark /> : null}
        {live ? <View style={styles.headDot} /> : null}
        <Text style={styles.eyebrow} numberOfLines={1} {...textScale.badge}>
          {upperTR(eyebrow)}
        </Text>
        {context ? (
          <View style={styles.contextPill}>
            <Text style={styles.context} numberOfLines={1} {...textScale.badge}>
              {upperTR(context)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.board}>
        {side(home, awayWins)}

        <View style={styles.center}>
          {hasScore ? (
            <Text style={styles.score} numberOfLines={1} {...textScale.badge}>
              <Text style={awayWins ? styles.dim : null}>{home.score}</Text>
              <Text style={styles.dash}> – </Text>
              <Text style={homeWins ? styles.dim : null}>{away.score}</Text>
            </Text>
          ) : (
            <Text style={styles.time} numberOfLines={1} {...textScale.badge}>
              {statusText || "—"}
            </Text>
          )}
          {!live && hasScore ? (
            <View style={styles.statePill}>
              <Text style={styles.stateText} {...textScale.badge}>
                MS
              </Text>
            </View>
          ) : !hasScore && statusCaption ? (
            <Text style={styles.caption} numberOfLines={1} {...textScale.badge}>
              {statusCaption}
            </Text>
          ) : null}
        </View>

        {side(away, homeWins)}
      </View>

      {footnote ? (
        <View style={styles.footer}>
          <Ionicons name="location-outline" size={13} color={colors.onDarkMuted} />
          <Text style={styles.footnote} numberOfLines={1} {...textScale.dense}>
            {footnote}
          </Text>
          {onPress ? (
            <View style={styles.cta}>
              <Text style={styles.ctaText} {...textScale.badge}>
                Maça git
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.brandOnDark} />
            </View>
          ) : null}
        </View>
      ) : null}
    </>
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
      accessibilityLabel={
        hasScore
          ? `${eyebrow}: ${home.name} ${home.score}, ${away.name} ${away.score}`
          : `${eyebrow}: ${home.name} - ${away.name}${statusText ? `, ${statusText}` : ""}`
      }
      style={[styles.card, style]}
      testID={testID}
    >
      {content}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  /**
   * Sahne kabuğu: grafit zemin (gradyan katmanı köşeyi kendi taşır), sahne
   * yarıçapı (22) ve sahnenin saç teli kenarlığı. Gölge yok — koyu blok
   * kâğıdın üstünde zaten en ağır öğedir.
   */
  card: {
    backgroundColor: colors.inkBlock,
    borderRadius: radius.xxl,
    borderWidth: hairline,
    borderColor: colors.borderOnDark,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    minHeight: 22,
  },
  headDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.onDarkMuted,
  },
  eyebrow: {
    ...type.overline,
    color: colors.brandOnDark,
    flexShrink: 1,
  },
  contextPill: {
    marginLeft: "auto",
    flexShrink: 1,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  context: {
    ...type.micro,
    color: colors.onDark,
  },
  board: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: space.lg,
  },
  side: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space.sm,
  },
  teamName: {
    ...type.h4,
    color: colors.onDark,
    textAlign: "center",
    minHeight: type.h4.lineHeight * 2,
  },
  /** Bitmiş maçın kaybeden tarafı — sahnenin ikincil metni. */
  dim: {
    color: colors.onDarkMuted,
  },
  center: {
    width: 116,
    height: CREST,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  score: {
    ...type.scoreHero,
    color: colors.onDark,
  },
  dash: {
    color: colors.onDarkMuted,
  },
  time: {
    ...type.scoreLg,
    color: colors.onDark,
  },
  caption: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.onDarkMuted,
  },
  statePill: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
  },
  stateText: {
    ...type.micro,
    color: colors.onDark,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.borderOnDark,
  },
  footnote: {
    ...type.caption,
    color: colors.onDarkMuted,
    flex: 1,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ctaText: {
    ...type.label,
    color: colors.brandOnDark,
  },
});
