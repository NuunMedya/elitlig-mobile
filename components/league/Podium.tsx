/**
 * Podium — sıralamanın ilk üçü (Oyuncular bölmesi, Türkiye sıralaması).
 *
 * İKİNCİ TUR — SAHNE PODYUMU: üç oyuncu koyu bir sahne kartında (`StageCard`:
 * mürekkep degradesi + aurora) gerçek bir podyum gibi BASAMAK üstünde durur;
 * birinci ortada ve en yüksek basamakta (2 · 1 · 3 düzeni).
 *
 *   · Avatarın altında kitin madalya rozeti (`RankBadge`: altın · gümüş ·
 *     bronz degrade + parıltı); birincinin avatarı büyük ve ışık halkalı.
 *   · Rakam KAHRAMANDIR: basamağın üstünde Archivo, birincide `scoreLg` ve
 *     `Odometer` ile döner (ölçüt değişince rakamlar yuvarlanır).
 *   · Basamaklar cam (`inkTile`); tepelerinde madalya renginde 3px çizgi.
 *   · Birim (GOL, PUAN) kartın üst satırında bir kez yazılır.
 *
 * Sahne iki temada da koyudur: metin `onDark`. Üçten az oyuncu varsa podyum
 * çizilmez — çağıran taraf listeye düşer. Prop API'si değişmedi.
 */

import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, Odometer, RankBadge, Reveal, Touchable } from "@/components/ui";
import type { PlayerRankRow } from "@/lib/types";
import { colors, glowStyle, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { StageCard } from "./kit";

const defaultMeta = (row: PlayerRankRow) => row.teamName || "Takımsız";

/** Madalya degradesi, basamağa göre (dizin = sıra − 1). */
const MEDAL = [colors.medalGold, colors.medalSilver, colors.medalBronze] as const;

/** Podyumdaki çizim sırası — sol, orta, sağ (0 tabanlı sıra dizini). */
const PODIUM_ORDER = [1, 0, 2] as const;

const PODIUM_AVATAR_FIRST = 60;
const PODIUM_AVATAR = 46;

/** Basamak yükseklikleri (dizin = sıra − 1): birinci en yüksek. */
const STEP_HEIGHT = [64, 46, 34] as const;

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
    <StageCard testID="players-podium">
      <View style={styles.top}>
        <Text style={styles.over} {...textScale.badge}>
          {upperTR("Zirvedeki üçlü")}
        </Text>
        <View style={styles.unitPill}>
          <Text style={styles.unitText} {...textScale.badge}>
            {upperTR(unit)}
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        {PODIUM_ORDER.map((index, column) => {
          const player = players[index];
          if (!player) return <View key={`empty-${index}`} style={styles.cell} />;
          const first = index === 0;
          const metric = metricOf(player);
          return (
            <Reveal key={player.id} index={column} distance={14} style={styles.cell}>
              <Touchable
                style={styles.cellInner}
                onPress={() => onPress(player.id)}
                feedback="card"
                haptic="selection"
                accessibilityRole="button"
                accessibilityLabel={`${index + 1}. ${player.name}, ${metric} ${unit}`}
              >
                <View style={styles.avatarWrap}>
                  <View
                    style={[
                      styles.ring,
                      { borderColor: MEDAL[index][0] },
                      first ? glowStyle(MEDAL[index][1], 2) : null,
                    ]}
                  >
                    <Avatar
                      name={player.name}
                      image={player.image ?? null}
                      size={first ? PODIUM_AVATAR_FIRST : PODIUM_AVATAR}
                    />
                  </View>
                  <RankBadge rank={index + 1} size={first ? 24 : 20} style={styles.medal} />
                </View>
                <Text
                  style={first ? styles.nameFirst : styles.name}
                  numberOfLines={first ? 2 : 1}
                  {...textScale.dense}
                >
                  {player.name}
                </Text>
                <Text style={styles.team} numberOfLines={1} {...textScale.dense}>
                  {metaOf(player)}
                </Text>
                {/* Basamak: yükseklik sırayı söyler, rakam basamağın üstündedir. */}
                <View style={[styles.step, { height: STEP_HEIGHT[index] }]}>
                  <LinearGradient
                    colors={MEDAL[index]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.stepTop}
                  />
                  {first ? (
                    <Odometer value={metric} style={styles.metricFirst} />
                  ) : (
                    <Text style={styles.metric} numberOfLines={1} {...textScale.dense}>
                      {metric}
                    </Text>
                  )}
                </View>
              </Touchable>
            </Reveal>
          );
        })}
      </View>
    </StageCard>
  );
});

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  over: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  unitPill: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  unitText: {
    ...type.micro,
    color: colors.onDark,
  },
  row: {
    flexDirection: "row",
    /* Basamaklar tabandan hizalanır: podyum silueti buradan çıkar. */
    alignItems: "flex-end",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  cellInner: {
    alignItems: "center",
    gap: space.px,
  },
  avatarWrap: {
    alignItems: "center",
    marginBottom: space.m,
  },
  ring: {
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  medal: {
    position: "absolute",
    bottom: -9,
    alignSelf: "center",
  },
  name: {
    ...type.labelSm,
    color: colors.onDark,
    textAlign: "center",
    alignSelf: "stretch",
  },
  nameFirst: {
    ...type.h4,
    color: colors.onDark,
    textAlign: "center",
    alignSelf: "stretch",
  },
  team: {
    ...type.meta,
    color: colors.onDarkMuted,
    textAlign: "center",
    alignSelf: "stretch",
  },
  step: {
    alignSelf: "stretch",
    marginTop: space.s,
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderBottomWidth: 0,
    borderColor: colors.inkTileBorder,
    overflow: "hidden",
  },
  stepTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  metric: {
    ...type.scoreSm,
    color: colors.onDark,
  },
  /* Birincinin sayısı büyük: "kim önde" sorusunun tek bakışlık yanıtı. */
  metricFirst: {
    ...type.scoreLg,
    color: colors.onDark,
  },
});
