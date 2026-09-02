/**
 * SpotlightCard — Genel Bakış'ın tepesindeki tek büyük kart.
 *
 * NE GÖSTERİR: kullanıcının ŞU AN önemsediği tek maç. Öncelik sırası
 * ekran tarafından verilir (canlı maç > bugünkü maç > sıradaki maç); bu
 * bileşen yalnız çizer.
 *
 * NEDEN BEYAZ KART (mürekkep blok değil): Kural 01 — mor yalnız BAŞLIK
 * bloğunda ve ALT RAYDA yaşar; kâğıdın üstünde ikinci bir mor blok, başlığın
 * "burası kimlik" sözünü tekrarlayıp zayıflatıyordu ve kart, kartlar
 * arasında değil ayrı bir uygulamadan gelmiş gibi duruyordu. Vitrin artık
 * maketin "Kulübüm" kartıyla (tema.html §7/1 ".card") aynı dili konuşur:
 * beyaz yüzey + hairline kenarlık + 1. seviye gölge. Onu manşet yapan şey
 * zemin değil KONUM (kâğıdın ilk kartı) ve ÖLÇÜ (26px skor).
 *
 * NEDEN SKOR ORTADA DEĞİL: iki takım adı iki satırda, skor sağda hizalı
 * durur. Bu, alttaki maç listesinin satır düzeniyle AYNI okuma eksenidir;
 * ortada dev skor gösteren bir hero kart, kullanıcıyı iki farklı okuma
 * biçimi arasında gidip gelmeye zorlardı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, elevate, hairline, radius, space, textScale, type, upperTR } from "@/theme";
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

  // Kazanan kalın + textPrimary, kaybeden sönük (§1.0/4). Berabere ikisi de normal.
  const homeWins = hasScore && (home.score as number) > (away.score as number);
  const awayWins = hasScore && (away.score as number) > (home.score as number);
  const decided = homeWins || awayWins;

  /*
   * Taraf satırı. Skor CANLIYKEN iki tarafta da canlı kırmızısıdır — maç
   * bitmeden "kazanan" yoktur, o anki üstünlük renkle işaretlenmez; bittiğinde
   * kaybeden taraf adıyla birlikte üçüncül griye çekilir (maket ".mrow .lose").
   */
  const side = (team: SpotlightTeam, winner: boolean) => {
    const loser = decided && !winner;
    return (
      <View style={styles.side}>
        <TeamLogo logo={team.logo} name={team.name} size={22} />
        <Text
          style={[styles.teamName, loser ? styles.muted : null]}
          numberOfLines={1}
          {...textScale.dense}
        >
          {team.name}
        </Text>
        {hasScore ? (
          <Text
            style={[styles.score, live ? styles.scoreLive : loser ? styles.muted : null]}
            {...textScale.dense}
          >
            {team.score}
          </Text>
        ) : null}
      </View>
    );
  };

  const content = (
    <>
      {/* Işıklı yüzey — `Card` ile aynı katman; yerleşimi etkilemez. */}
      <GradientFill radius="lg" />
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
      accessibilityLabel={`${eyebrow}: ${home.name} - ${away.name}`}
      style={[styles.card, style]}
      testID={testID}
    >
      {content}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  /**
   * Kart kabuğu: `elevate(1)` yüzey + hairline kenarlık + gölgeyi verir,
   * yarıçap KART ölçüsü (18). `overflow: "hidden"` YOK — iOS'ta gölgeyi
   * kırpardı; köşeleri gradyan katmanı kendi taşır (bkz. GradientFill).
   */
  card: {
    ...elevate(1),
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  eyebrow: {
    ...type.overline,
    color: colors.brandAccent,
  },
  context: {
    ...type.caption,
    color: colors.textTertiary,
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
    color: colors.textPrimary,
    flex: 1,
  },
  /* Panel metriği (26): satır başlığından iki kademe büyük, ekranın en iri
     rakamı — kartı manşet yapan ölçü budur, zemin değil. */
  score: {
    ...type.metric,
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: "right",
  },
  scoreLive: {
    color: colors.live,
  },
  /** Kaybeden taraf: ad ve skor birlikte üçüncül griye çekilir. */
  muted: {
    color: colors.textTertiary,
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
    color: colors.textPrimary,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  footnote: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
  },
});
