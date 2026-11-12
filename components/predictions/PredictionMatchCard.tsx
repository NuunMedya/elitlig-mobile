/**
 * TAHMİN KARTI — yaklaşan bir maç için skor tahmini (yalnız görünüm).
 *
 *   15 Kas · 19:00 · Lig adı                       [Açık · 3 sa kaldı]
 *        (arma)        [+]     [+]        (arma)
 *       Ev sahibi      [2]  :  [1]      Deplasman
 *                      [−]     [−]
 *   ( ⚽ Kim gol atar?  · isteğe bağlı +3                       › )
 *   [              Tahmini kaydet               ]
 *
 * Durum (sayaçlar, kayıt, golcü seçimi) çağıran ekrandadır; bu bileşen yalnız
 * çizer. `savedPulse` her arttığında (kayıt başarılı) kart kısa bir yayla
 * onay verir: kenar markaya döner, onay işareti belirir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { Button, Touchable, useReduceMotion } from "@/components/ui";
import type { PredictionMatch } from "@/lib/api/career";
import { colors, hairline, radius, space, spring, textScale, type } from "@/theme";

import { ScoreCell, ScoreStepper } from "./ScoreStepper";
import { StatePill, TeamColumn, countdownLabel, kickoffLabel } from "./shared";

export interface PredictionMatchCardProps {
  match: PredictionMatch;
  home: number;
  away: number;
  onHome: (value: number) => void;
  onAway: (value: number) => void;
  /** Giriş yapılmış mı — giriş yoksa sayaçlar kilitli, düğme gizli. */
  canEdit: boolean;
  scorer: { id: number; name: string } | null;
  onScorerPress: () => void;
  /** Sayaçlar sunucudaki tahminle aynı mı. */
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  /** Başarılı her kayıtta artar → onay animasyonu. */
  savedPulse: number;
}

export const PredictionMatchCard = memo(function PredictionMatchCard({
  match,
  home,
  away,
  onHome,
  onAway,
  canEdit,
  scorer,
  onScorerPress,
  saved,
  saving,
  onSave,
  savedPulse,
}: PredictionMatchCardProps) {
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const check = useRef(new Animated.Value(match.prediction ? 1 : 0)).current;

  useEffect(() => {
    if (!savedPulse) return;
    if (reduce) {
      check.setValue(1);
      return;
    }
    pop.setValue(0.97);
    check.setValue(0.4);
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, ...spring.bounce }),
      Animated.spring(check, { toValue: 1, ...spring.bounce }),
    ]).start();
  }, [savedPulse, reduce, pop, check]);

  const locked = !canEdit || !match.can_predict;
  const live = match.status === "live";
  const countdown = countdownLabel(match);
  const hasPrediction = Boolean(match.prediction);

  const state = match.own_match
    ? { icon: "ban-outline" as const, label: "Kendi maçın", tone: "neutral" as const }
    : live
      ? { icon: "radio-outline" as const, label: "Canlı · kapandı", tone: "live" as const }
      : !match.can_predict
        ? { icon: "lock-closed" as const, label: "Kilitlendi", tone: "neutral" as const }
        : { icon: "lock-open-outline" as const, label: countdown ? countdown : "Tahmine açık", tone: "brand" as const };

  return (
    <Animated.View style={[styles.card, hasPrediction && saved && styles.cardSaved, { transform: [{ scale: pop }] }]}>
      <View style={styles.top}>
        <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
          <Text style={styles.metaStrong}>{kickoffLabel(match)}</Text>
          {match.league_name ? ` · ${match.league_name}` : ""}
        </Text>
        <StatePill icon={state.icon} label={state.label} tone={state.tone} />
      </View>

      <View style={styles.board}>
        <TeamColumn name={match.home.name} />
        <View style={styles.scores}>
          {locked ? (
            <ScoreCell value={hasPrediction ? home : "–"} muted={!hasPrediction} accessibilityLabel={`${match.home.name} golü tahminin`} />
          ) : (
            <ScoreStepper value={home} onChange={onHome} accessibilityLabel={`${match.home.name} golü`} />
          )}
          <Text style={styles.colon} {...textScale.badge}>
            :
          </Text>
          {locked ? (
            <ScoreCell value={hasPrediction ? away : "–"} muted={!hasPrediction} accessibilityLabel={`${match.away.name} golü tahminin`} />
          ) : (
            <ScoreStepper value={away} onChange={onAway} accessibilityLabel={`${match.away.name} golü`} />
          )}
        </View>
        <TeamColumn name={match.away.name} />
      </View>

      {!match.own_match && (scorer || !locked) ? (
        <Touchable
          feedback="row"
          disabled={locked}
          onPress={onScorerPress}
          style={[styles.scorer, scorer && styles.scorerOn]}
          accessibilityRole="button"
          accessibilityLabel={scorer ? `Golcü tahminin: ${scorer.name}` : "Kim gol atar? İsteğe bağlı golcü tahmini"}
          accessibilityHint={locked ? undefined : "Golcü seçmek için aç"}
        >
          <View style={[styles.scorerIcon, scorer && styles.scorerIconOn]}>
            <Ionicons name="football-outline" size={16} color={scorer ? colors.textOnBrand : colors.textTertiary} />
          </View>
          <View style={styles.scorerText}>
            <Text style={styles.scorerTitle} numberOfLines={1} {...textScale.dense}>
              {scorer ? scorer.name : "Kim gol atar?"}
            </Text>
            <Text style={styles.scorerSub} numberOfLines={1} {...textScale.dense}>
              {scorer ? "Golcü tahminin · tutarsa +3" : "İsteğe bağlı · gol atarsa +3 puan"}
            </Text>
          </View>
          {!locked ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
        </Touchable>
      ) : null}

      {match.own_match ? (
        <Text style={styles.note} {...textScale.long}>
          Kendi takımının maçına tahmin yapamazsın.
        </Text>
      ) : live ? (
        <Text style={styles.note} {...textScale.dense}>
          {hasPrediction ? "Maç sürüyor · tahminin kilitlendi, sonuç maç bitince puanlanır." : "Maç sürüyor · bu maça tahmin yapmadın."}
        </Text>
      ) : canEdit && match.can_predict ? (
        <View style={styles.saveRow}>
          {hasPrediction ? (
            <Animated.View style={[styles.check, { opacity: check, transform: [{ scale: check }] }]}>
              <Ionicons name={saved ? "checkmark-circle" : "ellipse-outline"} size={20} color={saved ? colors.win : colors.textTertiary} />
            </Animated.View>
          ) : null}
          <Button
            label={saved ? "Kaydedildi" : hasPrediction ? "Tahmini güncelle" : "Tahmini kaydet"}
            size="sm"
            variant={saved ? "secondary" : "primary"}
            disabled={saved}
            loading={saving}
            onPress={onSave}
            style={styles.saveButton}
          />
        </View>
      ) : !canEdit ? null : hasPrediction ? (
        <Text style={styles.note} {...textScale.dense}>
          {`Tahminin ${match.prediction!.home}–${match.prediction!.away} · maç başladı`}
        </Text>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.md,
    paddingBottom: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  cardSaved: { borderColor: colors.brandBorder },
  top: { flexDirection: "row", alignItems: "center", gap: space.sm },
  meta: { ...type.caption, color: colors.textTertiary, flex: 1 },
  metaStrong: { color: colors.textSecondary },
  board: { flexDirection: "row", alignItems: "center", gap: space.sm },
  scores: { flexDirection: "row", alignItems: "center", gap: space.s },
  colon: { ...type.scoreMd, color: colors.textTertiary },
  scorer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.m,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  scorerOn: { backgroundColor: colors.brandDim },
  scorerIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  scorerIconOn: { backgroundColor: colors.brand },
  scorerText: { flex: 1, minWidth: 0 },
  scorerTitle: { ...type.labelSm, color: colors.textPrimary },
  scorerSub: { ...type.caption, color: colors.textSecondary },
  note: { ...type.bodySm, color: colors.textSecondary },
  saveRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  check: { width: 24, alignItems: "center" },
  saveButton: { flex: 1 },
});
