/**
 * KADRO KURALLARI (web features/ruleBuilder/ManagedRules → RosterSection).
 *
 * Kitapçığı kullanan sezonlarda kadro doğrulaması, transfer hakları ve lisans
 * bu dönemlerden gelir. Her dönem: ne zaman başlar / biter, kadro ve maç
 * kadrosu sınırları, misafir ve transfer hakkı, lisans kapsamı.
 *
 * "Önceki dönem bitmeden yeni dönem başlamaz": dönem eklenince önceki
 * dönemin "sezon sonuna kadar" geçerliliği "belirli bir maça kadar" olur
 * (lib/api/admin/leagues.addPeriod). Oynama şartları (eligibility) web
 * sihirbazında yazılır; burada sayısı görünür ve kayıtta korunur.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChipsField, DateField, FieldLabel, Panel, SegmentField, SelectField, ToggleField } from "@/components/admin";
import { Button, Input } from "@/components/ui";
import {
  CARRY_LABELS,
  LEAGUE_CATEGORY_LABELS,
  LICENSE_FROM_LABELS,
  LIMIT_FIELDS,
  LIMIT_TYPE_LABELS,
  START_LABELS,
  VALIDITY_LABELS,
  addPeriod,
  carryRequired,
  removePeriod,
  withCarry,
  type RosterPeriod,
  type RosterState,
} from "@/lib/api/admin/leagues";
import { colors, space, textScale, type } from "@/theme";

const toInt = (text: string): number | null => {
  const n = parseInt(text.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

export function RosterRulesEditor({ value, onChange }: { value: RosterState; onChange: (next: RosterState) => void }) {
  const setPeriods = (periods: RosterPeriod[]) => onChange({ ...value, periods: withCarry(periods), dirty: true });
  const patchPeriod = (index: number, patch: Partial<RosterPeriod>) =>
    setPeriods(value.periods.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  return (
    <View style={styles.stack}>
      <ToggleField
        label="Kadro kuralları uygulansın"
        hint={value.enabled ? `${value.periods.length} dönem${value.season_count ? ` · ${value.season_count} sezonda` : ""}` : "Kapalıyken kadro sınırı ve transfer hakkı uygulanmaz."}
        value={value.enabled}
        onChange={(on) =>
          onChange({ ...value, enabled: on, dirty: true, periods: on && !value.periods.length ? addPeriod([]) : value.periods })
        }
      />
      {value.enabled
        ? value.periods.map((period, index) => (
            <PeriodCard
              key={index}
              index={index}
              period={period}
              previous={value.periods[index - 1]}
              last={index === value.periods.length - 1}
              onPatch={(patch) => patchPeriod(index, patch)}
              onRemove={value.periods.length > 1 ? () => setPeriods(removePeriod(value.periods, index)) : undefined}
            />
          ))
        : null}
      {value.enabled ? (
        <Button label="Dönem ekle" icon="add" variant="secondary" size="sm" onPress={() => setPeriods(addPeriod(value.periods))} />
      ) : null}
    </View>
  );
}

function PeriodCard({
  index,
  period,
  previous,
  last,
  onPatch,
  onRemove,
}: {
  index: number;
  period: RosterPeriod;
  previous?: RosterPeriod;
  last: boolean;
  onPatch: (patch: Partial<RosterPeriod>) => void;
  onRemove?: () => void;
}) {
  const num = (key: string) => (period[key] == null ? "" : String(period[key]));
  const startOptions = Object.entries(START_LABELS)
    .filter(([k]) => (index === 0 ? k !== "PREVIOUS_PERIOD_END" : true))
    .map(([k, label]) => ({ value: k, label }));
  const validityOptions = Object.entries(VALIDITY_LABELS)
    .filter(([k]) => (last ? true : k !== "SEASON_END"))
    .map(([k, label]) => ({ value: k, label }));
  const categories = Array.isArray(period.licensed_league_categories) ? period.licensed_league_categories : [];
  const eligibility = Array.isArray(period.eligibilityRules) ? period.eligibilityRules.length : 0;

  return (
    <Panel title={`${index + 1}. DÖNEM`} action={onRemove ? { label: "Kaldır", onPress: onRemove } : undefined}>
      <View style={styles.stack}>
        <Input label="Dönem adı (isteğe bağlı)" value={String(period.name ?? "")} onChangeText={(t) => onPatch({ name: t })} placeholder="ör. Sezon başı" />

        <SelectField<string>
          label="Başlangıç"
          value={period.start_type}
          options={startOptions}
          onChange={(v) => v && onPatch({ start_type: v, start_value_date: null, start_value_int: null })}
        />
        {period.start_type === "DATE" ? (
          <DateField label="Başlangıç tarihi" value={(period.start_value_date as string) ?? null} onChange={(v) => onPatch({ start_value_date: v })} />
        ) : period.start_type === "MATCH_COUNT" || period.start_type === "STAGE" ? (
          <Input
            label={period.start_type === "STAGE" ? "Etap no" : "Kaçıncı maçtan sonra"}
            value={num("start_value_int")}
            keyboardType="number-pad"
            onChangeText={(t) => onPatch({ start_value_int: toInt(t) })}
          />
        ) : null}

        <SelectField<string>
          label="Geçerlilik"
          value={period.validity_type}
          options={validityOptions}
          onChange={(v) => v && onPatch({ validity_type: v, end_value_date: null, end_value_int: null })}
        />
        {period.validity_type === "DATE" ? (
          <DateField label="Bitiş tarihi" value={(period.end_value_date as string) ?? null} onChange={(v) => onPatch({ end_value_date: v })} />
        ) : period.validity_type === "MATCH_COUNT" || period.validity_type === "STAGE" ? (
          <Input
            label={period.validity_type === "STAGE" ? "Etap no" : "Kaçıncı maça kadar"}
            value={num("end_value_int")}
            keyboardType="number-pad"
            onChangeText={(t) => onPatch({ end_value_int: toInt(t) })}
          />
        ) : null}

        <Text style={styles.section} {...textScale.dense}>
          SINIRLAR
        </Text>
        {LIMIT_FIELDS.map((field) => {
          const typeKey = `${field.key}_type`;
          const valueKey = `${field.key}_value`;
          const current = String(period[typeKey] ?? field.types[0]);
          return (
            <View key={field.key} style={styles.limit}>
              <SegmentField<string>
                label={field.label}
                value={current}
                options={field.types.map((t) => ({ key: t, label: LIMIT_TYPE_LABELS[t] ?? t }))}
                onChange={(t) =>
                  onPatch({ [typeKey]: t, [valueKey]: t === "FINITE" ? (period[valueKey] as number | null) ?? field.min : null })
                }
              />
              {current === "FINITE" ? (
                <Input
                  value={num(valueKey)}
                  keyboardType="number-pad"
                  placeholder={`En az ${field.min}`}
                  onChangeText={(t) => onPatch({ [valueKey]: toInt(t) })}
                  accessibilityLabel={`${field.label} sayısı`}
                />
              ) : null}
            </View>
          );
        })}
        <Input
          label="Sahada en az oyuncu"
          value={num("minimum_field_player_count")}
          keyboardType="number-pad"
          onChangeText={(t) => onPatch({ minimum_field_player_count: toInt(t) })}
        />
        <ToggleField
          label="Oyundan çıkan oyuncu tekrar girebilir"
          value={period.player_reentry_allowed === true}
          onChange={(v) => onPatch({ player_reentry_allowed: v })}
        />
        {carryRequired(period, previous) ? (
          <SelectField<string>
            label="Önceki dönemden transfer hakkı"
            value={(period.transfer_carry_mode as string) ?? "CARRY_REMAINING_AND_ADD"}
            options={Object.entries(CARRY_LABELS).map(([k, label]) => ({ value: k, label }))}
            onChange={(v) => v && onPatch({ transfer_carry_mode: v })}
          />
        ) : null}

        <Text style={styles.section} {...textScale.dense}>
          LİSANS
        </Text>
        <SelectField<string>
          label="Lisans geçerliliği"
          value={(period.license_valid_from_type as string) ?? ""}
          options={Object.entries(LICENSE_FROM_LABELS).map(([k, label]) => ({ value: k, label }))}
          onChange={(v) => onPatch({ license_valid_from_type: v || null, license_valid_from_date: null, license_valid_from_months: null })}
        />
        {period.license_valid_from_type === "DATE" ? (
          <DateField
            label="Lisans başlangıç tarihi"
            value={(period.license_valid_from_date as string) ?? null}
            onChange={(v) => onPatch({ license_valid_from_date: v })}
          />
        ) : period.license_valid_from_type === "MONTHS_BEFORE_SEASON" ? (
          <Input
            label="Sezondan kaç ay önce"
            value={num("license_valid_from_months")}
            keyboardType="number-pad"
            onChangeText={(t) => onPatch({ license_valid_from_months: toInt(t) })}
          />
        ) : null}
        <ChipsField<string>
          label="Lisanslı sayılan lig kategorileri"
          multiple
          value={categories}
          options={Object.entries(LEAGUE_CATEGORY_LABELS).map(([k, label]) => ({ key: k, label }))}
          onChange={(v) => onPatch({ licensed_league_categories: Array.isArray(v) ? v : v ? [v] : [] })}
        />
        {eligibility ? (
          <View style={styles.field}>
            <FieldLabel label="Oynama şartları" />
            <Text style={styles.hint} {...textScale.long}>
              {eligibility} şart tanımlı; kayıtta korunur.
            </Text>
          </View>
        ) : null}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  field: { gap: space.xs },
  limit: { gap: space.xs },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.xs },
  hint: { ...type.bodySm, color: colors.textSecondary },
});
