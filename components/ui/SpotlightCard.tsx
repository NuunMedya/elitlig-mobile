/**
 * SpotlightCard — Genel Bakış'ın tepesindeki tek büyük kart.
 *
 * NE GÖSTERİR: kullanıcının ŞU AN önemsediği tek maç. Öncelik sırası
 * ekran tarafından verilir (canlı maç > bugünkü maç > sıradaki maç); bu
 * bileşen yalnız çizer.
 *
 * NEDEN MÜREKKEP BLOK: uygulamanın geri kalanı beyaz kartlardan kuruludur.
 * Tek bir koyu kart, hiçbir yeni renk ya da tipografi katmadan "burası
 * ekranın merkezi" der. Aynı blok maç detayının skor şeridinde de kullanılır;
 * vitrine dokunan kullanıcı tanıdık bir yüzeye iner.
 *
 * NEDEN SKOR ORTADA DEĞİL: iki takım adı iki satırda, skor sağda hizalı
 * durur. Bu, alttaki maç listesinin satır düzeniyle AYNI okuma eksenidir;
 * ortada dev skor gösteren bir hero kart, kullanıcıyı iki farklı okuma
 * biçimi arasında gidip gelmeye zorlardı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, elevate, radius, space, textScale, type, upperTR } from "@/theme";
import { LiveBadge } from "./LiveBadge";
import { Touchable } from "./Pressable";
import { TeamLogo } from "./TeamLogo";

/**
 * Mürekkep kartın ışık yönü — YATAY, SAĞDAN SOLA.
 *
 * Köşegen ışık kartı silindir gibi yuvarlıyordu; ayrıca aynı ekrandaki
 * `Card`/`ListRow` yüzeyleri sağdan sola ışıdığı için iki ayrı ışık kaynağı
 * okunuyordu. Tek eksen, tek kaynak.
 */
const GRADIENT_START = { x: 1, y: 0.5 } as const;
const GRADIENT_END = { x: 0, y: 0.5 } as const;

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
      <TeamLogo logo={team.logo} name={team.name} size={22} />
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

  /*
   * MÜREKKEP KART. Vitrin maçı ana ekranın tek "manşet"idir ve altındaki
   * beyaz kartlarla aynı yüzeyde durursa manşet olmaktan çıkar. Koyu blok onu
   * listeden ayırır; maç detayındaki skor bloğuyla da aynı dili konuşur, yani
   * kullanıcı vitrine dokunduğunda gittiği yer tanıdık gelir.
   *
   * Gradyan iki duraklıdır ve KÖŞEGENDİR: tek renk koyu bir dikdörtgen düz
   * kalıyordu, köşegen ışık kartı hafifçe kabartıyor.
   */
  const content = (
    <View style={styles.gradient}>
      <LinearGradient
        colors={colors.gradientInk}
        start={GRADIENT_START}
        end={GRADIENT_END}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.head}>
        {live ? <LiveBadge minute={minute} size="sm" onDark /> : null}
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
            <Ionicons name="chevron-forward" size={12} color={colors.onDarkMuted} />
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
    ...elevate(2),
    borderWidth: 0,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
  },
  gradient: {
    // Gradyan yüklenemezse düz mürekkep zemin altta durur.
    backgroundColor: colors.inkBlock,
    padding: space.md,
    gap: space.sm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  /* Mürekkep blok üstünde `brand` mor üstüne mor olurdu (~1,8:1). */
  eyebrow: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  context: {
    ...type.caption,
    color: colors.onDarkMuted,
    marginLeft: "auto",
    flexShrink: 1,
  },
  teams: {
    gap: space.s,
  },
  side: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  teamName: {
    ...type.h2,
    color: colors.onDarkMuted,
    flex: 1,
  },
  teamNameWinner: {
    color: colors.onDark,
  },
  score: {
    ...type.scoreLg,
    color: colors.onDarkMuted,
    minWidth: 24,
    textAlign: "right",
  },
  scoreWinner: {
    color: colors.onDark,
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
    color: colors.onDark,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.chalk,
  },
  footnote: {
    ...type.caption,
    color: colors.onDarkMuted,
    flex: 1,
  },
});
