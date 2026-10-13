/**
 * Podium — sıralamanın ilk üçü (Oyuncular bölmesi, Türkiye sıralaması).
 *
 * ARENA PODYUMU: üç oyuncu tek bir kartta, gerçek bir podyum gibi BASAMAK
 * üstünde durur — birinci ortada ve en yüksek basamakta (2 · 1 · 3 düzeni).
 * Basamaklar nötr ikinci katman yüzeyidir (`surface2`); madalya rengi yalnız
 * avatar halkasında ve sıra rozetindedir. Birincinin rakamı büyük Archivo.
 * Birim (GOL, PUAN) kartın sağ üstünde bir kez yazılır.
 *
 * Üçten az oyuncu varsa podyum çizilmez — çağıran taraf listeye düşer.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, Touchable } from "@/components/ui";
import type { PlayerRankRow } from "@/lib/types";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { groupStyles } from "./shared";

const defaultMeta = (row: PlayerRankRow) => row.teamName || "Takımsız";

/**
 * Madalya rengi, basamağa göre (dizin = sıra − 1): altın · gümüş · bronz.
 * Altın, puan tablosundaki şampiyonluk rayıyla AYNI token — "birinci" iki
 * ekranda aynı renkle okunur. Gümüş nötr kayrak, bronz uyarı turuncusu.
 */
/* 3. madalya BRONZ: `warn` koyu temada (#FBBF24) altınla ayırt edilemiyordu;
   düşme play-off rayı iki temada da bronz-turuncu. */
const MEDAL = [colors.zoneChampion, colors.slate, colors.zoneRelegationPlayoff] as const;

/** Podyumdaki çizim sırası — sol, orta, sağ (0 tabanlı sıra dizini). */
const PODIUM_ORDER = [1, 0, 2] as const;

/** Avatar ölçüsü: birinci büyük (56), diğerleri 44 (tema.html §7/4). */
const PODIUM_AVATAR_FIRST = 56;
const PODIUM_AVATAR = 44;


/* ══════════════════════════════════════════════════════════════════════════
   Podyum — ilk üç
   ══════════════════════════════════════════════════════════════════════════ */

export const Podium = React.memo(function Podium({
  players,
  metricOf,
  unit,
  onPress,
  metaOf = defaultMeta,
}: {
  players: PlayerRankRow[];
  metricOf: (row: PlayerRankRow) => string;
  unit: string;
  onPress: (playerId: number) => void;
  /** Ad altındaki satır (varsayılan takım adı). */
  metaOf?: (row: PlayerRankRow) => string;
}) {
  return (
    <View style={[groupStyles.card, styles.podium]}>
      <Text style={styles.podiumUnit} {...textScale.badge}>
        {upperTR(unit)}
      </Text>
      <View style={styles.podiumRow}>
        {PODIUM_ORDER.map((index) => {
          const player = players[index];
          const first = index === 0;
          return (
            <Touchable
              key={player.id}
              style={styles.podiumCell}
              onPress={() => onPress(player.id)}
              feedback="card"
              haptic="selection"
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}. ${player.name}, ${metricOf(player)} ${unit}`}
            >
              <View style={styles.podiumAvatar}>
                <View style={[styles.podiumRing, { borderColor: MEDAL[index] }]}>
                  <Avatar
                    name={player.name}
                    image={player.image ?? null}
                    size={first ? PODIUM_AVATAR_FIRST : PODIUM_AVATAR}
                  />
                </View>
                <View style={[styles.podiumRankBadge, { backgroundColor: MEDAL[index] }]}>
                  <Text style={styles.podiumRankText} {...textScale.badge}>
                    {index + 1}
                  </Text>
                </View>
              </View>
              <Text
                style={first ? styles.podiumNameFirst : styles.podiumName}
                numberOfLines={1}
                {...textScale.dense}
              >
                {player.name}
              </Text>
              <Text style={styles.podiumTeam} numberOfLines={1} {...textScale.dense}>
                {metaOf(player)}
              </Text>
              {/* Basamak: yükseklik sırayı söyler, rakam basamağın üstündedir. */}
              <View style={[styles.podiumStep, { height: STEP_HEIGHT[index] }]}>
                <Text
                  style={first ? styles.podiumMetricFirst : styles.podiumMetric}
                  numberOfLines={1}
                  {...textScale.dense}
                >
                  {metricOf(player)}
                </Text>
              </View>
            </Touchable>
          );
        })}
      </View>
    </View>
  );
});

/** Basamak yükseklikleri (dizin = sıra − 1): birinci en yüksek. */
const STEP_HEIGHT = [64, 46, 34] as const;

const styles = StyleSheet.create({
  /* — Podyum — */
  podium: {
    paddingTop: space.md,
    paddingHorizontal: space.md,
    overflow: "hidden",
  },
  podiumUnit: {
    ...type.overline,
    color: colors.textTertiary,
    alignSelf: "flex-end",
  },
  podiumRow: {
    flexDirection: "row",
    /* Basamaklar tabandan hizalanır: podyum silueti buradan çıkar. */
    alignItems: "flex-end",
    gap: space.s,
  },
  podiumCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  podiumAvatar: {
    alignItems: "center",
    marginBottom: space.sm,
  },
  podiumRing: {
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  podiumRankBadge: {
    position: "absolute",
    bottom: -4,
    alignSelf: "center",
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface1,
  },
  podiumRankText: {
    ...type.micro,
    color: colors.textOnStatus,
  },
  podiumName: {
    ...type.label,
    color: colors.textPrimary,
    textAlign: "center",
    alignSelf: "stretch",
  },
  podiumNameFirst: {
    ...type.h4,
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: "center",
    alignSelf: "stretch",
  },
  podiumTeam: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
    alignSelf: "stretch",
  },
  podiumStep: {
    alignSelf: "stretch",
    marginTop: space.sm,
    alignItems: "center",
    paddingTop: space.sm,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  podiumMetric: {
    ...type.scoreSm,
    color: colors.textSecondary,
  },
  /* Birincinin sayısı büyük: "kim önde" sorusunun tek bakışlık yanıtı. */
  podiumMetricFirst: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
});
