/**
 * FORM ŞERİDİ — son beş maç, beş sütun.
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
import { TeamLogo, Touchable } from "@/components/ui";
import { formatDateShort } from "@/lib/format";
import type { ApiMatch } from "@/lib/types";
import { colors, layout, radius, space, textScale, type } from "@/theme";
import { perspective, RESULT_LABEL, type LogoFor, type Result } from "./model";

const RESULT_BG: Record<Result, string> = {
  W: colors.win,
  D: colors.draw,
  L: colors.loss,
};

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
      {items.map((match) => (
        <FormItem
          key={match.id}
          match={match}
          teamId={teamId}
          teamName={teamName}
          logoFor={logoFor}
          onOpen={onOpen}
        />
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
}: {
  match: ApiMatch;
  teamId: number;
  teamName: string;
  logoFor: LogoFor;
  onOpen: (matchId: number) => void;
}) {
  const view = perspective(match, teamId, teamName);
  const handlePress = useCallback(() => onOpen(Number(match.id)), [onOpen, match.id]);
  const score = `${view.ours ?? "–"}–${view.theirs ?? "–"}`;

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
      <View
        style={[
          styles.pill,
          { backgroundColor: view.result ? RESULT_BG[view.result] : colors.surface3 },
        ]}
      >
        <Text
          style={[styles.score, view.result ? null : styles.scoreMuted]}
          numberOfLines={1}
          {...textScale.badge}
        >
          {score}
        </Text>
      </View>
      <Text style={styles.date} numberOfLines={1} {...textScale.badge}>
        {formatDateShort(match.date)}
      </Text>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: space.xs,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.md,
  },
  pill: {
    minWidth: 46,
    paddingHorizontal: space.s,
    paddingVertical: 3,
    borderRadius: radius.xs,
    alignItems: "center",
  },
  score: {
    ...type.tableNumStrong,
    color: colors.textOnStatus,
  },
  scoreMuted: {
    color: colors.textSecondary,
  },
  date: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
