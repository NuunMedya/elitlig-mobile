/**
 * SONUÇ KARTI — biten maç: gerçek skor, senin tahminin ve kazandığın puan.
 *
 *   15 Kas · Lig                                         [ Tam skor ]
 *   (arma) Ev sahibi        2  │  TAHMİNİN      +5
 *   (arma) Deplasman        1  │    2–1        puan
 *   ⚽ Golcü: Ad Soyad · tuttu +3
 *
 * TAM SKOR küçük bir kutlama alır: kenar kazanç yeşiline döner, puan
 * rozetinin arkasından bir kez kıvılcım saçılır (sonlu, "hareketi azalt"
 * açıkken hiç çizilmez). Abartı yok; tablo gibi okunmaya devam eder.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SparkleBurst } from "@/components/game/Celebration";
import { Badge, TeamLogo } from "@/components/ui";
import type { PredictionMatch } from "@/lib/api/career";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

import { OUTCOME, kickoffLabel } from "./shared";

export const ResultCard = memo(function ResultCard({ match, celebrate = true }: { match: PredictionMatch; celebrate?: boolean }) {
  const p = match.prediction;
  const outcome = p?.outcome ? OUTCOME[p.outcome] : null;
  const exact = p?.outcome === "exact";
  const sh = match.score?.home;
  const sa = match.score?.away;
  const homeWon = sh != null && sa != null && sh > sa;
  const awayWon = sh != null && sa != null && sa > sh;
  const points = p?.points ?? null;
  const scored = points != null && points > 0;

  const summary = [
    `${match.home.name} ${sh ?? "-"}, ${match.away.name} ${sa ?? "-"}`,
    p ? `Tahminin ${p.home}–${p.away}` : "Tahmin yapmadın",
    outcome ? outcome.label : null,
    points != null ? `${points} puan` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <View style={[styles.card, exact && styles.cardExact]} accessible accessibilityLabel={summary}>
      <View style={styles.top}>
        <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
          {[kickoffLabel(match), match.league_name].filter(Boolean).join(" · ")}
        </Text>
        {outcome ? <Badge label={outcome.short} tone={outcome.tone} size="xs" icon={outcome.icon} /> : null}
      </View>

      <View style={styles.body}>
        <View style={styles.lines}>
          <TeamLine name={match.home.name} score={sh} strong={homeWon} />
          <TeamLine name={match.away.name} score={sa} strong={awayWon} />
        </View>
        <View style={styles.divider} />
        <View style={styles.mine}>
          <Text style={styles.overline} {...textScale.badge}>
            TAHMİNİN
          </Text>
          <Text style={[styles.pick, !p && styles.pickNone]} {...textScale.badge}>
            {p ? `${p.home}–${p.away}` : "—"}
          </Text>
        </View>
        <View style={[styles.points, scored && styles.pointsOn, exact && styles.pointsExact]}>
          {exact && celebrate ? <SparkleBurst trigger={1} radius={34} color={colors.win} /> : null}
          <Text style={[styles.pointsValue, scored && styles.pointsValueOn, exact && styles.pointsValueExact]} {...textScale.badge}>
            {points == null ? "–" : scored ? `+${points}` : "0"}
          </Text>
          <Text style={[styles.pointsUnit, exact && styles.pointsValueExact]} {...textScale.badge}>
            puan
          </Text>
        </View>
      </View>

      {p?.scorer ? (
        <View style={styles.scorer}>
          <Ionicons
            name={p.scorer_hit ? "football" : "football-outline"}
            size={14}
            color={p.scorer_hit ? colors.win : colors.textTertiary}
          />
          <Text style={styles.scorerText} numberOfLines={1} {...textScale.dense}>
            {`Golcü: ${p.scorer.name}`}
            {p.scorer_hit ? <Text style={styles.hit}> · tuttu +3</Text> : p.scorer_hit === false ? " · tutmadı" : ""}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

function TeamLine({ name, score, strong }: { name: string; score: number | undefined; strong: boolean }) {
  return (
    <View style={styles.line}>
      <TeamLogo name={name} size={layout.crestSm} />
      <Text style={[styles.lineName, strong && styles.lineStrong]} numberOfLines={1} {...textScale.dense}>
        {name}
      </Text>
      <Text style={[styles.lineScore, strong && styles.lineStrong]} {...textScale.badge}>
        {score ?? "-"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.m,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  cardExact: { borderColor: colors.win, borderWidth: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: space.sm },
  meta: { ...type.caption, color: colors.textTertiary, flex: 1 },
  body: { flexDirection: "row", alignItems: "center", gap: space.m },
  lines: { flex: 1, gap: space.s, minWidth: 0 },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  lineName: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  lineStrong: { color: colors.textPrimary, fontFamily: type.labelSm.fontFamily },
  lineScore: { ...type.scoreXs, color: colors.textSecondary, minWidth: 16, textAlign: "right" },
  divider: { width: hairline, alignSelf: "stretch", backgroundColor: colors.border },
  mine: { alignItems: "center", gap: 2, minWidth: 56 },
  overline: { ...type.overline, color: colors.textTertiary },
  pick: { ...type.scoreSm, color: colors.textPrimary },
  pickNone: { color: colors.textTertiary },
  points: {
    width: 52,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
  },
  pointsOn: { backgroundColor: colors.brandDim },
  pointsExact: { backgroundColor: colors.winDim },
  pointsValue: { ...type.scoreSm, color: colors.textTertiary },
  pointsValueOn: { color: colors.brandAccent },
  pointsValueExact: { color: colors.win },
  pointsUnit: { ...type.micro, color: colors.textTertiary },
  scorer: { flexDirection: "row", alignItems: "center", gap: space.s },
  scorerText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  hit: { color: colors.win, fontFamily: type.labelXs.fontFamily },
});
