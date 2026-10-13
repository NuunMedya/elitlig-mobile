/**
 * H2H — rakip seçici (eski ekrandaki karşılaştırma kısayolu korunur).
 *
 * Rakipler puan durumundaki sırayla listelenir; satır sıra kutusu + arma +
 * ad + puan taşır. Seçilen rakiple `/h2h` ekranına aynı parametrelerle
 * gidilir (bkz. `pickRival`, app/takim/[id].tsx).
 */

import React, { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { BottomSheet, TeamLogo, Touchable } from "@/components/ui";
import type { StandingRow } from "@/lib/types";
import { colors, layout, radius, space, textScale, type } from "@/theme";

export interface H2hRival {
  row: StandingRow;
  rank: number;
}

export function H2hSheet({
  visible,
  onClose,
  teamName,
  rivals,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  teamName: string;
  rivals: H2hRival[];
  onPick: (rivalId: number, rivalName: string) => void;
}) {
  const renderItem = useCallback(
    ({ item, index }: { item: H2hRival; index: number }) => (
      <RivalRow
        teamId={Number(item.row.team_id)}
        teamName={item.row.team_name}
        logo={item.row.logo}
        rank={item.rank}
        points={item.row.display_points}
        divided={index > 0}
        onPress={onPick}
      />
    ),
    [onPick],
  );

  return (
    // Liste kendi kaydırmasını yönetir; sheet'in ScrollView'ü kapatılır.
    <BottomSheet visible={visible} onClose={onClose} title="Karşılaştır" snap="half" scrollable={false}>
      <Text style={styles.lead} {...textScale.dense}>
        {teamName} ile karşılaştırmak istediğin takımı seç.
      </Text>
      <FlatList
        data={rivals}
        keyExtractor={rivalKey}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </BottomSheet>
  );
}

const rivalKey = (item: H2hRival) => String(item.row.team_id);

const RivalRow = React.memo(function RivalRow({
  teamId,
  teamName,
  logo,
  rank,
  points,
  divided,
  onPress,
}: {
  teamId: number;
  teamName: string;
  logo: string | null;
  rank: number;
  points: number;
  divided: boolean;
  onPress: (teamId: number, teamName: string) => void;
}) {
  const handlePress = useCallback(() => onPress(teamId, teamName), [onPress, teamId, teamName]);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${teamName}, ${points} puan`}
      style={[styles.row, divided ? styles.divided : null]}
    >
      <View style={styles.rank}>
        <Text style={styles.rankText} {...textScale.dense}>
          {rank}
        </Text>
      </View>
      <TeamLogo name={teamName} logo={logo} size={layout.crestMd} />
      <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
        {teamName}
      </Text>
      <Text style={styles.points} {...textScale.dense}>
        {points}
        <Text style={styles.pointsUnit}> P</Text>
      </Text>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  /* Sheet, kaydırmayı listeye bıraktığında (`scrollable={false}`) iç
     boşluk vermez; başlıkla aynı hizaya burada çekilir. */
  lead: {
    ...type.bodySm,
    color: colors.textSecondary,
    paddingHorizontal: space.xl,
    marginBottom: space.sm,
  },
  list: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: layout.listRowHeight,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  rank: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  rankText: {
    ...type.tableNum,
    color: colors.textSecondary,
  },
  name: {
    ...type.h4,
    color: colors.textPrimary,
    flex: 1,
  },
  points: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  pointsUnit: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
