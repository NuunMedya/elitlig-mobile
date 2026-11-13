/**
 * FORM ZAMAN ÇİZELGESİ — son beş maç, beş durak.
 *
 * İKİNCİ TUR: sütunlar bir RAYA dizildi. Her maç rayın üstünde sonuç
 * renginde bir düğümdür (G/B/M harfiyle); üstünde rakip arması, altında
 * takımın gözünden skor ve tarih. En yeni durak büyük ve parlak — form
 * okunurken göz sağa, şimdiye akar.
 *
 * Eskiden "Son 5 maç" yatay kaydırılan büyük maç kartlarıydı: ekranda ancak
 * bir buçuk kart görünüyor, beş sonucu görmek için dört kez kaydırmak
 * gerekiyordu. Form bir DİZİDİR ve tek bakışta okunmalı:
 *
 *    [arma]  [arma]  [arma]  [arma]  [arma]
 *    [3–1]   [2–2]   [0–1]   [6–0]   [14–5]
 *    28 Eyl  1 Eki   3 Eki   9 Eki   10 Eki
 *
 * Skor TAKIMIN GÖZÜNDEN yazılır (önce bizim gol) ve hapın rengi sonucu
 * söyler; renk tek başına anlam taşımasın diye ekran okuyucu "Galibiyet,
 * 3–1, ALFAREAL'e karşı" okur. Sıra soldan sağa ESKİDEN YENİYE — FormChips
 * ile aynı yön, en yeni maç başparmağın altında.
 */

import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Reveal, TeamLogo, Touchable } from "@/components/ui";
import { formatDateShort } from "@/lib/format";
import type { ApiMatch } from "@/lib/types";
import { colors, fonts, glowStyle, layout, radius, space, textScale, type } from "@/theme";
import { perspective, RESULT_LABEL, RESULT_LETTER, type LogoFor } from "./model";
import { resultColor } from "./ProfileKit";

const NODE = 24;
const NODE_LAST = 30;

export const FormStrip = React.memo(function FormStrip({
  matches,
  teamId,
  teamName,
  logoFor,
  onOpen,
}: {
  /** Yeniden eskiye sıralı bitmiş maçlar; ilk beşi alınır. */
  matches: ApiMatch[];
  teamId: number;
  teamName: string;
  logoFor: LogoFor;
  onOpen: (matchId: number) => void;
}) {
  const items = matches.slice(0, 5).reverse();

  return (
    <View style={styles.row}>
      {items.map((match, index) => (
        <Reveal key={match.id} index={index} style={styles.cell}>
          <FormItem
            match={match}
            teamId={teamId}
            teamName={teamName}
            logoFor={logoFor}
            onOpen={onOpen}
            first={index === 0}
            last={index === items.length - 1}
          />
        </Reveal>
      ))}
    </View>
  );
});

const FormItem = React.memo(function FormItem({
  match,
  teamId,
  teamName,
  logoFor,
  onOpen,
  first,
  last,
}: {
  match: ApiMatch;
  teamId: number;
  teamName: string;
  logoFor: LogoFor;
  onOpen: (matchId: number) => void;
  first: boolean;
  last: boolean;
}) {
  const view = perspective(match, teamId, teamName);
  const handlePress = useCallback(() => onOpen(Number(match.id)), [onOpen, match.id]);
  const score = `${view.ours ?? "–"}–${view.theirs ?? "–"}`;
  const tint = resultColor(view.result);
  const size = last ? NODE_LAST : NODE;

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handlePress}
      style={styles.item}
      accessibilityRole="button"
      accessibilityLabel={`${view.result ? RESULT_LABEL[view.result] : "Sonuç"}, ${score}, ${view.opponentName} maçı, ${formatDateShort(match.date)}`}
    >
      <TeamLogo
        name={view.opponentName}
        logo={logoFor(view.opponentId, view.opponentName)}
        size={layout.crestLg}
      />
      <View style={styles.rail}>
        <View style={[styles.railHalf, first ? styles.railHidden : null]} />
        <View style={[styles.railHalf, last ? styles.railHidden : null]} />
        <View
          style={[
            styles.node,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: tint },
            last ? glowStyle(tint, 2) : null,
          ]}
        >
          <Text style={styles.nodeText} {...textScale.badge}>
            {view.result ? RESULT_LETTER[view.result] : "–"}
          </Text>
        </View>
      </View>
      <Text style={[styles.score, { color: view.result ? tint : colors.textSecondary }]} numberOfLines={1} {...textScale.badge}>
        {score}
      </Text>
      <Text style={styles.date} numberOfLines={1} {...textScale.badge}>
        {formatDateShort(match.date)}
      </Text>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
  },
  cell: {
    flex: 1,
  },
  item: {
    alignItems: "center",
    gap: space.s,
    paddingVertical: space.xs,
    borderRadius: radius.md,
  },
  rail: {
    alignSelf: "stretch",
    height: NODE_LAST,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  railHalf: {
    flex: 1,
    height: 2,
    backgroundColor: colors.surface3,
  },
  railHidden: {
    backgroundColor: "transparent",
  },
  node: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface1,
  },
  nodeText: {
    ...type.nano,
    fontFamily: fonts.bold,
    color: colors.textOnStatus,
  },
  score: {
    ...type.scoreXs,
  },
  date: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
