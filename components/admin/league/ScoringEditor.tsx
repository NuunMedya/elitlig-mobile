/**
 * PUANLAMA SİSTEMİ (web features/ruleBuilder/ManagedRules → ScoringSection).
 *
 * Kitapçığı kullanan sezonların puan tablosu: standart (3-1-0), güç dengesi
 * ya da özel puanlar. Özel puanda hazır şablonlar ve örnek sıralama gösterilir
 * — puanlamanın tabloyu nasıl değiştirdiği kayıttan önce görünür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChipsField, FieldLabel } from "@/components/admin";
import { Chip, ChipGroup, Input, Odometer, RankBadge, Touchable } from "@/components/ui";
import { POINT_RANGE, SCORING_CHOICES, validatePoints, type ScoringState } from "@/lib/api/admin/leagues";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PRESETS = [
  { win: 3, draw: 1, loss: 0 },
  { win: 2, draw: 1, loss: 0 },
  { win: 3, draw: 2, loss: 1 },
  { win: 4, draw: 2, loss: 1 },
];

const SAMPLE = [
  { name: "Kartallar", wins: 6, draws: 0, losses: 4 },
  { name: "Yıldızlar", wins: 4, draws: 5, losses: 1 },
  { name: "Şimşekler", wins: 5, draws: 2, losses: 3 },
];

export function ScoringEditor({ value, onChange }: { value: ScoringState; onChange: (next: ScoringState) => void }) {
  const set = (patch: Partial<ScoringState>) => onChange({ ...value, ...patch });
  const custom = value.type === "ozel";
  const problem = custom ? validatePoints(value) : null;
  const ranked = custom
    ? SAMPLE.map((t) => ({ ...t, points: t.wins * Number(value.win) + t.draws * Number(value.draw) + t.losses * Number(value.loss) })).sort(
        (a, b) => b.points - a.points || b.wins - a.wins
      )
    : [];
  const choice = SCORING_CHOICES.find((c) => c.value === value.type);

  /* Puan üçlüsü: G / B / M her biri kendi hücresinde, büyük rakam + ± düğmeleri. */
  const triplet: { key: "win" | "draw" | "loss"; label: string; tone: string }[] = [
    { key: "win", label: "Galibiyet", tone: colors.win },
    { key: "draw", label: "Beraberlik", tone: colors.warn },
    { key: "loss", label: "Mağlubiyet", tone: colors.loss },
  ];

  return (
    <View style={styles.stack}>
      <ChipsField<string>
        label="Puanlama"
        value={value.type}
        options={SCORING_CHOICES.map((c) => ({ key: c.value, label: c.label }))}
        onChange={(v) => v && set({ type: String(v) })}
      />
      {choice ? (
        <View style={styles.hintBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.info} />
          <Text style={styles.hint} {...textScale.long}>
            {choice.hint}
          </Text>
        </View>
      ) : null}
      {custom ? (
        <>
          <Input label="Puanlama adı (isteğe bağlı)" floating value={String(value.name ?? "")} onChangeText={(t) => set({ name: t })} placeholder="ör. Amatör" />
          <View style={styles.triplet}>
            {triplet.map((cell) => (
              <View key={cell.key} style={styles.cell}>
                <View style={[styles.cellRail, { backgroundColor: cell.tone }]} />
                <Text style={styles.cellLabel} numberOfLines={1} {...textScale.badge}>
                  {cell.label.toLocaleUpperCase("tr-TR")}
                </Text>
                <Odometer value={Number(value[cell.key]) || 0} style={styles.cellValue} />
                <View style={styles.bumps}>
                  {([-1, 1] as const).map((d) => {
                    const next = (Number(value[cell.key]) || 0) + d;
                    const off = next < POINT_RANGE.min || next > POINT_RANGE.max;
                    return (
                      <Touchable
                        key={d}
                        onPress={() => !off && set({ [cell.key]: next } as Partial<ScoringState>)}
                        disabled={off}
                        haptic="selection"
                        feedback="icon"
                        style={[styles.bump, off ? styles.bumpOff : null]}
                        accessibilityRole="button"
                        accessibilityLabel={`${cell.label} puanını ${d > 0 ? "artır" : "azalt"}`}
                      >
                        <Ionicons name={d > 0 ? "add" : "remove"} size={16} color={colors.textPrimary} />
                      </Touchable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
          <View style={styles.field}>
            <FieldLabel label="Hazır şablonlar" />
            <ChipGroup contentPadding={0}>
              {PRESETS.map((p) => (
                <Chip
                  key={`${p.win}${p.draw}${p.loss}`}
                  label={`${p.win}-${p.draw}-${p.loss}`}
                  size="sm"
                  selected={Number(value.win) === p.win && Number(value.draw) === p.draw && Number(value.loss) === p.loss}
                  onPress={() => set(p)}
                />
              ))}
            </ChipGroup>
          </View>
          {problem ? (
            <View style={[styles.hintBox, styles.errorBox]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.error} {...textScale.long}>
                {problem}
              </Text>
            </View>
          ) : (
            <View style={styles.sampleBox}>
              <View style={styles.sampleHead}>
                <Text style={[styles.sampleHeadText, styles.flex]} {...textScale.badge}>
                  ÖRNEK SIRALAMA
                </Text>
                <Text style={[styles.sampleHeadText, styles.col]} {...textScale.badge}>
                  G-B-M
                </Text>
                <Text style={[styles.sampleHeadText, styles.colPts]} {...textScale.badge}>
                  P
                </Text>
              </View>
              {ranked.map((t, i) => (
                <View key={t.name} style={[styles.sampleRow, i > 0 ? styles.sampleDivider : null]}>
                  <RankBadge rank={i + 1} size={22} />
                  <Text style={[styles.sampleName, styles.flex]} numberOfLines={1} {...textScale.dense}>
                    {t.name}
                  </Text>
                  <Text style={[styles.sampleNum, styles.col]} {...textScale.badge}>
                    {t.wins}-{t.draws}-{t.losses}
                  </Text>
                  <Text style={[styles.samplePts, styles.colPts]} {...textScale.badge}>
                    {t.points}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  field: { gap: space.xs },
  hintBox: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.m,
    borderRadius: radius.md,
    backgroundColor: colors.infoDim,
  },
  errorBox: { backgroundColor: colors.dangerDim },
  hint: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  error: { ...type.bodySm, color: colors.danger, flex: 1 },
  triplet: { flexDirection: "row", gap: space.sm },
  cell: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
    paddingTop: space.m,
    paddingBottom: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  cellRail: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  cellLabel: { ...type.overline, color: colors.textTertiary },
  cellValue: { ...type.scoreLg, color: colors.textPrimary },
  bumps: { flexDirection: "row", gap: space.xs },
  bump: {
    width: 36,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  bumpOff: { opacity: 0.35 },
  sampleBox: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  sampleHead: { flexDirection: "row", alignItems: "center", paddingVertical: space.s },
  sampleHeadText: { ...type.overline, color: colors.textTertiary },
  sampleRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 },
  sampleDivider: { borderTopWidth: hairline, borderTopColor: colors.separator },
  sampleName: { ...type.h4, color: colors.textPrimary },
  col: { width: 64, textAlign: "center" },
  colPts: { width: 32, textAlign: "right" },
  sampleNum: { ...type.tableNum, color: colors.textSecondary },
  samplePts: { ...type.tableNumStrong, color: colors.textPrimary },
});
