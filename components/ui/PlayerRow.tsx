/**
 * PlayerRow — OYUNCU SATIRININ TEK ANATOMİSİ.
 *
 * SORUN NEYDİ: oyuncu satırı da takım satırı gibi her ekranda yeniden
 * çiziliyordu. Sıralamada sıra numarası vardı, kadroda yoktu; mevki kimi
 * yerde yazıyla ("Forvet") kimi yerde hiç görünmüyordu; meta satırı sağdaki
 * metriği TEKRAR ediyordu ("12 gol" hem sağda hem meta'da) ve bu yüzden
 * taşıp "… 2 asis" diye kırpılıyordu.
 *
 * KURAL — SIRA DEĞİŞMEZ:
 *
 *     [sıra] · [mevki halkalı avatar] · [ad + MEVKİ + bağlam] · [tek sayı]
 *
 * MEVKİ ARTIK RENK: avatarın halkası ve addan sonraki üç harf aynı rengi
 * taşır (KAL altın · DEF camgöbeği · ORT mor · FOR mercan; bkz.
 * theme/positions.ts). Bir kadro listesine bakınca diziliş renkten okunur.
 * Renk tek başına anlam taşımaz — üç harfli etiket daima yanındadır.
 *
 * META AKTİF METRİĞİ TEKRAR ETMEZ: `metricLabel` verildiğinde (ör. "gol")
 * meta satırından o alan düşülür. Sağdaki sütun zaten onu söylüyor; tekrar,
 * satırı taşıran ve oyuncu adını kırpan şeydi.
 *
 * BİRİM SATIRDA DEĞİL BAŞLIKTA: "gol" yirmi satırda yirmi kez yazılınca sağ
 * sütun gri bir gürültü şeridine dönüyordu; birim bir kez `PlayerRowHead`
 * içinde söylenir.
 */

import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  colors,
  hairline,
  palette,
  positionBadge,
  positionColor,
  positionLineLabel,
  radius,
  space,
  textScale,
  type,
  upperTR,
  type PositionLine,
} from "@/theme";
import { positionLine } from "@/lib/api/team";
import { Avatar } from "./Avatar";
import { withAlpha } from "./Badge";
import { Touchable } from "./Pressable";

/** Satır yüksekliği — ekranlar `getItemLayout` için bunu kullanır. */
export const PLAYER_ROW_HEIGHT = 60;

const RANK_BOX = 22;
const AVATAR = 34;
/** Halkanın kalınlığı; avatarın dışına taşar, ölçüsünü değiştirmez. */
const RING = 2;
const METRIC_BOX = 34;

export interface PlayerRowProps {
  playerId: number;
  name: string;
  image?: string | null;
  /** Sıra numarası; verilmezse sıra kutusu çizilmez (ör. kadro listesi). */
  rank?: number;
  /** Ham mevki: kod ("STP") ya da serbest metin ("Sol Bek"). */
  position?: string | null;
  /** Forma numarası — mevki etiketinden sonra, sönük. */
  shirtNumber?: number | null;
  /** Ad altındaki bağlam parçaları; boş olanlar atılır, " · " ile birleşir. */
  meta?: (string | null | undefined)[];
  /** Sağdaki tek sayı. */
  metric?: string | number;
  onPress: (playerId: number) => void;
  style?: StyleProp<ViewStyle>;
}

function PlayerRowBase({
  playerId,
  name,
  image,
  rank,
  position,
  shirtNumber,
  meta,
  metric,
  onPress,
  style,
}: PlayerRowProps) {
  const handlePress = useCallback(() => onPress(playerId), [onPress, playerId]);

  /* Mevki YOKSA hat da yok: `positionLine` boş girdide "MID" döndürür (saha
     dizilişi için doğru bir varsayım), ama satırda bilinmeyen bir oyuncuyu
     "ORT" diye etiketlemek yanlış bilgi olurdu. Boşluk burada ayrılır. */
  const line: PositionLine | null = useMemo(
    () => (position && String(position).trim() ? positionLine(position) : null),
    [position],
  );
  const lineColor = positionColor(palette, line);

  const metaText = (meta ?? []).filter(Boolean).join(" · ");

  const accessibilityLabel = [
    rank != null ? `${rank}.` : null,
    name,
    line ? positionLineLabel(line) : null,
    metric != null ? String(metric) : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Touchable
      style={[styles.row, style]}
      onPress={handlePress}
      feedback="row"
      haptic="selection"
      accessibilityLabel={accessibilityLabel}
    >
      {rank != null ? (
        <View style={styles.rankBox}>
          <Text style={styles.rankText} {...textScale.dense}>
            {rank}
          </Text>
        </View>
      ) : null}

      {/* Halka avatarın DIŞINDA: `borderWidth` verilseydi avatarın görsel
          çapı küçülür, sıralama listesinde yüzler satırdan satıra farklı
          boyutta görünürdü. Ayrı bir kap, ölçüyü sabit tutar. */}
      <View style={[styles.ring, { borderColor: lineColor }]}>
        <Avatar name={name} image={image ?? null} size={AVATAR} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {name}
          </Text>
          {line ? (
            <Text
              style={[
                styles.position,
                { color: lineColor, backgroundColor: withAlpha(lineColor, 0.18) },
              ]}
              {...textScale.badge}
            >
              {positionBadge(line)}
            </Text>
          ) : null}
          {shirtNumber != null ? (
            <Text style={styles.shirt} {...textScale.badge}>
              {upperTR("No")} {shirtNumber}
            </Text>
          ) : null}
        </View>
        {metaText ? (
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {metaText}
          </Text>
        ) : null}
      </View>

      {metric != null ? (
        <View style={styles.metricBox}>
          <Text style={styles.metricValue} {...textScale.dense}>
            {metric}
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
}

export const PlayerRow = React.memo(PlayerRowBase);

/**
 * Sütun başlığı — "OYUNCU … <BİRİM>". Sağdaki genişlik satırdaki metrik
 * kutusuyla AYNI sabitten gelir; başlık altındaki rakamların üstüne oturması
 * bu yüzden garanti.
 */
export const PlayerRowHead = React.memo(function PlayerRowHead({
  unit,
}: {
  /** Aktif ölçütün birimi: "gol", "asist", "maç". */
  unit: string;
}) {
  return (
    <View style={styles.head}>
      <Text style={styles.headLabel} {...textScale.badge}>
        {upperTR("Oyuncu")}
      </Text>
      <Text style={[styles.headLabel, styles.headMetric]} {...textScale.badge}>
        {upperTR(unit)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    height: PLAYER_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.md,
  },
  /* Sıra KUTUDA durur (tema.html ".rank"), TeamRow ile aynı anatomi: çıplak
     bir rakam avatarın yanında havada asılı kalıyor ve "4" ile "14" farklı
     genişlikte olduğu için avatar sütunu satırdan satıra kayıyordu. Sabit
     bir kutu hem hizayı sabitler hem de sıralamayı takım listesiyle aynı
     dilde okutur. */
  rankBox: {
    width: RANK_BOX,
    height: RANK_BOX,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  rankText: {
    ...type.tableNum,
    color: colors.textSecondary,
  },
  ring: {
    width: AVATAR + RING * 2,
    height: AVATAR + RING * 2,
    borderRadius: (AVATAR + RING * 2) / 2,
    borderWidth: RING,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  name: {
    ...type.h3,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  /* Mevki ÇİPİ: rengin %18 tonu zemin, rengin kendisi metin — iki temada
     da okunur (dolu zemin + beyaz metin koyuda pastel üstünde kayboluyordu). */
  position: {
    ...type.micro,
    paddingHorizontal: space.s,
    paddingVertical: 1,
    borderRadius: radius.xs,
    overflow: "hidden",
  },
  shirt: {
    ...type.micro,
    color: colors.textTertiary,
  },
  meta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  metricBox: {
    minWidth: METRIC_BOX,
    alignItems: "flex-end",
  },
  metricValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingBottom: space.s,
  },
  headLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  headMetric: {
    marginLeft: "auto",
    minWidth: METRIC_BOX,
    textAlign: "right",
  },
});
