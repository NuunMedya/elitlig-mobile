/**
 * StandingsRow — puan tablosunun Lig sekmesine özgü satırı ve başlığı.
 *
 * NEDEN ORTAK `TeamRow` DEĞİL: Lig sekmesi TABLONUN KENDİSİDİR; yüzlerce
 * takımlık bir ligde kullanıcı kaydırmadan olabildiğince çok satır görmek
 * ister. Ortak bileşeni küçültmek diğer ekranları da küçültürdü; bu yüzden
 * aynı anatomi burada kendi ölçüsüyle çizilir.
 *
 * SATIR ANATOMİSİ (ikinci tur):
 *   [bölge rayı 3px] [sıra: ilk üç madalya] [arma 20] [ad] [sayılar] [PUAN sütunu] [yıldız]
 *   · PUAN SÜTUNU kendi zeminiyle (surface2) tablonun boyunca uzanan bir
 *     şerittir: göz tabloda aşağı inerken puanı arar, sütun onu taşır.
 *   · Takip edilen takım: `brandDim` zemin + solda imza degradesi (bölge
 *     rayının yerine); ad bir kademe kalın.
 *   · Averaj artıda nane, eksite kırmızı ve gerçek eksi işaretiyle.
 *
 * Sütun genişlikleri satır ve başlıkta AYNI sabitlerden gelir; başlık
 * altındaki rakamların üstüne oturması bu yüzden garanti.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { FormChips, RankBadge, TeamLogo, Touchable } from "@/components/ui";
/* Barrel yalnız TeamRowProps'u dışa aktarıyor; sütun kümesi tipi kaynağından. */
import type { TeamRowColumns } from "@/components/ui/TeamRow";
import { colors, fonts, hairline, space, textScale, type, upperTR } from "@/theme";
import { SignatureStripe } from "./kit";

/** Satır yüksekliği — 40px: 20px arma + madalya rahat sığar, tablo yine sıkı. */
export const STANDING_ROW_HEIGHT = 40;

/* Sütun genişlikleri — satır ve başlık AYNI sabitleri kullanır. */
const CREST = 20;
const COL_RANK = 22;
const COL_NUM = 17;
/* Averaj üç haneli olabilir (+121); 11px'te 30px yeter. */
const COL_DIFF = 30;
const COL_POINTS = 34;
/** Beş xs form çipi (5 × 13 + 4 × 2) — çipler ortak bileşenden, ölçüsü sabit. */
const COL_FORM = 74;

export interface StandingsRowProps {
  teamId: number;
  name: string;
  rank: number;
  logo?: string | null;
  points?: number;
  played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goalDiff?: number;
  form?: string;
  /** Takip edilen takım: ad bir kademe kalın, zemin sönük zümrüt. */
  highlighted?: boolean;
  /** Bölge rayının rengi; yoksa ray çizilmez. */
  zone?: string | null;
  columns?: TeamRowColumns;
  onPress: (teamId: number) => void;
  /** Puanın sağındaki yuva (takip yıldızı). */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Averajı işaretiyle yazar: +21 / 0 / −5 (gerçek eksi işareti). */
function formatDiff(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

export const StandingsRow = React.memo(function StandingsRow({
  teamId,
  name,
  rank,
  logo,
  points,
  played,
  wins,
  draws,
  losses,
  goalDiff,
  form,
  highlighted,
  zone,
  columns = "full",
  onPress,
  trailing,
  style,
}: StandingsRowProps) {
  const handlePress = useCallback(() => onPress(teamId), [onPress, teamId]);
  const accessibilityLabel = [`${rank}.`, name, points != null ? `${points} puan` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <Touchable
      style={[styles.row, trailing ? styles.rowTrailing : null, highlighted ? styles.highlighted : null, style]}
      onPress={handlePress}
      feedback="row"
      haptic="selection"
      accessibilityLabel={accessibilityLabel}
    >
      {highlighted ? (
        <SignatureStripe inset={space.s} />
      ) : (
        <View style={[styles.rail, zone ? { backgroundColor: zone } : null]} />
      )}
      <View style={styles.rankCell}>
        {rank <= 3 ? (
          <RankBadge rank={rank} size={20} />
        ) : (
          <Text style={[styles.rank, zone ? styles.rankZone : null]} {...textScale.dense}>
            {rank}
          </Text>
        )}
      </View>
      <TeamLogo name={name} logo={logo ?? null} size={CREST} />
      <View style={styles.nameCell}>
        <Text style={[styles.name, highlighted ? styles.nameStrong : null]} numberOfLines={1} {...textScale.dense}>
          {name}
        </Text>
        {highlighted && !trailing ? <Ionicons name="star" size={9} color={colors.star} /> : null}
      </View>
      {columns === "form" ? (
        <View style={styles.form}>{form ? <FormChips form={form} size="xs" /> : null}</View>
      ) : (
        <>
          <Text style={styles.num} {...textScale.dense}>{played ?? "—"}</Text>
          {columns === "full" ? (
            <>
              <Text style={styles.num} {...textScale.dense}>{wins ?? "—"}</Text>
              <Text style={styles.num} {...textScale.dense}>{draws ?? "—"}</Text>
              <Text style={styles.num} {...textScale.dense}>{losses ?? "—"}</Text>
            </>
          ) : null}
          <Text
            style={[
              styles.num,
              styles.diff,
              goalDiff != null && goalDiff > 0 ? styles.diffPositive : null,
              goalDiff != null && goalDiff < 0 ? styles.diffNegative : null,
            ]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {goalDiff != null ? formatDiff(goalDiff) : "—"}
          </Text>
        </>
      )}
      <View style={styles.pointsCell}>
        <Text style={styles.points} {...textScale.dense}>
          {points ?? "—"}
        </Text>
      </View>
      {trailing}
    </Touchable>
  );
});

/** Sütun başlığı — satırla aynı sütun kümesi ve aynı genişlikler. */
export const StandingsHead = React.memo(function StandingsHead({
  columns = "full",
  pointsLabel = "Puan",
  trailingWidth,
}: {
  columns?: TeamRowColumns;
  /** Güç Dengesi liglerinde "GP". */
  pointsLabel?: string;
  /** Satırların `trailing` yuvası kadar sağ boşluk (sütunlar hizalı kalsın). */
  trailingWidth?: number;
}) {
  return (
    <View style={[styles.head, trailingWidth ? styles.rowTrailing : null]}>
      <Text style={[styles.rankCell, styles.headLabel, styles.rankHead]} {...textScale.badge}>#</Text>
      <View style={{ width: CREST }} />
      <Text style={[styles.nameCell, styles.headLabel]} {...textScale.badge}>
        {upperTR("Takım")}
      </Text>
      {columns === "form" ? (
        <Text style={[styles.form, styles.headLabel, styles.formHead]} {...textScale.badge}>
          {upperTR("Son 5")}
        </Text>
      ) : (
        <>
          <Text style={[styles.num, styles.headLabel]} {...textScale.badge}>O</Text>
          {columns === "full" ? (
            <>
              <Text style={[styles.num, styles.headLabel]} {...textScale.badge}>G</Text>
              <Text style={[styles.num, styles.headLabel]} {...textScale.badge}>B</Text>
              <Text style={[styles.num, styles.headLabel]} {...textScale.badge}>M</Text>
            </>
          ) : null}
          <Text style={[styles.num, styles.diff, styles.headLabel]} {...textScale.badge}>AV</Text>
        </>
      )}
      <View style={[styles.pointsCell, styles.pointsCellHead]}>
        <Text style={[styles.headLabel, styles.pointsHead]} {...textScale.badge}>
          {upperTR(pointsLabel).slice(0, 2)}
        </Text>
      </View>
      {trailingWidth ? <View style={{ width: trailingWidth }} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    height: STANDING_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingLeft: space.s,
    paddingRight: space.m,
  },
  /* Sondaki yuva (takip yıldızı) kendi dokunma alanını taşır; sağ pay daralır. */
  rowTrailing: {
    paddingRight: 0,
  },
  highlighted: {
    backgroundColor: colors.brandDim,
  },
  /** Bölge rayı: satırın sol kenarında, dikeyde satırdan bir tık kısa. */
  rail: {
    position: "absolute",
    left: 0,
    top: space.s,
    bottom: space.s,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: "transparent",
  },
  rankCell: {
    width: COL_RANK,
    alignItems: "center",
    justifyContent: "center",
  },
  rankHead: {
    textAlign: "center",
  },
  rank: {
    ...type.numSm,
    textAlign: "center",
    color: colors.textTertiary,
  },
  /* Bölgedeki takımın sırası bir kademe koyu: ray rengi söyler, rakam onaylar. */
  rankZone: {
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  nameCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    marginLeft: space.xs,
  },
  name: {
    ...type.labelSm,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  nameStrong: {
    fontFamily: fonts.bold,
    color: colors.brandAccent,
  },
  num: {
    ...type.numSm,
    width: COL_NUM,
    textAlign: "center",
    color: colors.textSecondary,
  },
  diff: {
    width: COL_DIFF,
  },
  diffPositive: {
    color: colors.win,
  },
  diffNegative: {
    color: colors.loss,
  },
  /** Puan sütunu: satır boyu uzanan sönük şerit — tabloda puan tek bakışta. */
  pointsCell: {
    width: COL_POINTS,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  pointsCellHead: {
    borderTopLeftRadius: space.s,
    borderTopRightRadius: space.s,
  },
  points: {
    ...type.tableNumStrong,
    textAlign: "center",
    color: colors.textPrimary,
  },
  pointsHead: {
    color: colors.textSecondary,
  },
  form: {
    width: COL_FORM,
    alignItems: "flex-end",
  },
  formHead: {
    textAlign: "right",
  },
  head: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingLeft: space.s,
    paddingRight: space.m,
    backgroundColor: colors.surface1,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  headLabel: {
    ...type.overline,
    letterSpacing: 0.8,
    color: colors.textTertiary,
  },
});
