/**
 * PUANLAMA SİSTEMİ (web features/ruleBuilder/ManagedRules → ScoringSection).
 *
 * Kitapçığı kullanan sezonların puan tablosu: standart (3-1-0), güç dengesi
 * ya da özel puanlar. Özel puanda hazır şablonlar ve örnek sıralama gösterilir
 * — puanlamanın tabloyu nasıl değiştirdiği kayıttan önce görünür.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChipsField, FieldLabel } from "@/components/admin";
import { Chip, ChipGroup, Input, Stepper } from "@/components/ui";
import { POINT_RANGE, SCORING_CHOICES, validatePoints, type ScoringState } from "@/lib/api/admin/leagues";
import { colors, space, textScale, type } from "@/theme";

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

  return (
    <View style={styles.stack}>
      <ChipsField<string>
        label="Puanlama"
        value={value.type}
        options={SCORING_CHOICES.map((c) => ({ key: c.value, label: c.label }))}
        onChange={(v) => v && set({ type: String(v) })}
      />
      {choice ? (
        <Text style={styles.hint} {...textScale.long}>
          {choice.hint}
        </Text>
      ) : null}
      {custom ? (
        <>
          <Input label="Puanlama adı (isteğe bağlı)" value={String(value.name ?? "")} onChangeText={(t) => set({ name: t })} placeholder="ör. Amatör" />
          <Stepper label="Galibiyet" value={Number(value.win)} min={POINT_RANGE.min} max={POINT_RANGE.max} onChange={(n) => set({ win: n })} />
          <Stepper label="Beraberlik" value={Number(value.draw)} min={POINT_RANGE.min} max={POINT_RANGE.max} onChange={(n) => set({ draw: n })} />
          <Stepper label="Mağlubiyet" value={Number(value.loss)} min={POINT_RANGE.min} max={POINT_RANGE.max} onChange={(n) => set({ loss: n })} />
          <View style={styles.field}>
            <FieldLabel label="Hazır şablonlar" />
            <ChipGroup>
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
            <Text style={styles.error} {...textScale.long}>
              {problem}
            </Text>
          ) : (
            <View style={styles.field}>
              <FieldLabel label="Örnek sıralama" />
              {ranked.map((t, i) => (
                <Text key={t.name} style={styles.sample} {...textScale.dense}>
                  {i + 1}. {t.name} — {t.wins}G {t.draws}B {t.losses}M · {t.points} puan
                </Text>
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
  field: { gap: space.xs },
  hint: { ...type.bodySm, color: colors.textSecondary },
  error: { ...type.bodySm, color: colors.danger },
  sample: { ...type.bodySm, color: colors.textPrimary },
});
