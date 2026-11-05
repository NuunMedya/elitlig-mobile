/**
 * YÖNETİM FORM ALANLARI — Input'un yanında seçim, tarih, anahtar ve renk.
 *
 * Her alan aynı anatomiyi taşır: üstte etiket, altta ipucu/hata. Seçim ve
 * tarih alanları dokununca kendi alt sayfasını açar (OptionSheet/DateSheet).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Chip, ChipGroup, Input, SegmentedControl, Toggle, Touchable } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { DateSheet } from "./DateSheet";
import { OptionSheet, type Option } from "./OptionSheet";

export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.label} {...textScale.dense}>
      {label}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

export function FieldHint({ hint, error }: { hint?: string; error?: string }) {
  if (!hint && !error) return null;
  return (
    <Text style={[styles.hint, error ? styles.error : null]} {...textScale.dense}>
      {error || hint}
    </Text>
  );
}

/** Dokunulabilir alan kutusu — seçim ve tarih alanlarının ortak yüzü. */
export function FieldBox({
  label,
  value,
  placeholder,
  icon,
  onPress,
  required,
  hint,
  error,
  disabled,
}: {
  label?: string;
  value?: string | null;
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  required?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.field}>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <Touchable
        onPress={onPress}
        disabled={disabled}
        style={[styles.box, error ? styles.boxError : null, disabled ? styles.boxDisabled : null]}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${value || placeholder || "seçilmedi"}` : undefined}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.textSecondary} /> : null}
        <Text
          style={[styles.boxText, value ? null : styles.placeholder]}
          numberOfLines={1}
          {...textScale.dense}
        >
          {value || placeholder || "Seç"}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
      </Touchable>
      <FieldHint hint={hint} error={error} />
    </View>
  );
}

export interface SelectFieldProps<V extends string | number> {
  label?: string;
  value: V | null | undefined;
  onChange: (value: V | null, option?: Option<V>) => void;
  options?: Option<V>[];
  loadOptions?: (q: string) => Promise<Option<V>[]>;
  queryKey?: readonly unknown[];
  placeholder?: string;
  /** Uzak listede seçili değerin adı (liste henüz yüklenmemişken gösterilir). */
  valueLabel?: string | null;
  clearable?: boolean;
  required?: boolean;
  hint?: string;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  sheetTitle?: string;
}

export function SelectField<V extends string | number>({
  label,
  value,
  onChange,
  options,
  loadOptions,
  queryKey,
  placeholder,
  valueLabel,
  clearable,
  required,
  hint,
  error,
  icon,
  disabled,
  sheetTitle,
}: SelectFieldProps<V>) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const shown =
    options?.find((o) => o.value === value)?.label ?? (value != null ? valueLabel ?? picked ?? String(value) : null);
  return (
    <>
      <FieldBox
        label={label}
        value={shown}
        placeholder={placeholder}
        icon={icon}
        onPress={() => setOpen(true)}
        required={required}
        hint={hint}
        error={error}
        disabled={disabled}
      />
      <OptionSheet<V>
        visible={open}
        onClose={() => setOpen(false)}
        title={sheetTitle || label || "Seç"}
        options={options}
        loadOptions={loadOptions}
        queryKey={queryKey}
        value={value ?? null}
        clearable={clearable}
        onSelect={(next, option) => {
          const single = Array.isArray(option) ? option[0] : option;
          setPicked(single?.label ?? null);
          onChange((next as V | null) ?? null, single);
        }}
      />
    </>
  );
}

export function MultiSelectField<V extends string | number>({
  label,
  value,
  onChange,
  options,
  loadOptions,
  queryKey,
  placeholder,
  hint,
  required,
}: {
  label?: string;
  value: V[];
  onChange: (value: V[]) => void;
  options?: Option<V>[];
  loadOptions?: (q: string) => Promise<Option<V>[]>;
  queryKey?: readonly unknown[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const labels = value.map((v) => options?.find((o) => o.value === v)?.label ?? String(v));
  return (
    <>
      <FieldBox
        label={label}
        value={labels.length ? labels.join(", ") : null}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        hint={hint}
        required={required}
      />
      <OptionSheet<V>
        visible={open}
        onClose={() => setOpen(false)}
        title={label || "Seç"}
        options={options}
        loadOptions={loadOptions}
        queryKey={queryKey}
        multiple
        value={value}
        onSelect={(next) => onChange((next as V[]) ?? [])}
      />
    </>
  );
}

export function DateField({
  label,
  value,
  onChange,
  withTime,
  placeholder = "Tarih seç",
  clearable,
  required,
  hint,
  error,
}: {
  label?: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  withTime?: boolean;
  placeholder?: string;
  clearable?: boolean;
  required?: boolean;
  hint?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = value ? (withTime && value.length > 10 ? formatDateTime(toLocalDate(value)) : formatDate(toLocalDate(value))) : null;
  return (
    <>
      <FieldBox
        label={label}
        value={shown}
        placeholder={placeholder}
        icon={withTime ? "time-outline" : "calendar-outline"}
        onPress={() => setOpen(true)}
        required={required}
        hint={hint}
        error={error}
      />
      <DateSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        value={value ? normalizeLocal(value, withTime) : null}
        withTime={withTime}
        clearable={clearable}
        onSelect={onChange}
      />
    </>
  );
}

/** "2026-10-12" ya da "2026-10-12T20:00" → Date (yerel saat). */
function toLocalDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  return new Date(value);
}

/** ISO zaman damgasını seçicinin "YYYY-MM-DDTHH:mm" biçimine çevirir. */
function normalizeLocal(value: string, withTime?: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, withTime ? 16 : 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
}

export function ToggleField({
  label,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel} {...textScale.dense}>
          {label}
        </Text>
        {hint ? (
          <Text style={styles.hint} {...textScale.dense}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Toggle value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} />
    </View>
  );
}

export function SegmentField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <View style={styles.field}>
      {label ? <FieldLabel label={label} /> : null}
      <SegmentedControl items={options} value={value} onChange={onChange} stretch size="sm" />
    </View>
  );
}

export function ChipsField<T extends string>({
  label,
  value,
  onChange,
  options,
  multiple,
}: {
  label?: string;
  value: T | T[] | null;
  onChange: (value: T | T[] | null) => void;
  options: { key: T; label: string }[];
  multiple?: boolean;
}) {
  const selected = (key: T) => (Array.isArray(value) ? value.includes(key) : value === key);
  return (
    <View style={styles.field}>
      {label ? <FieldLabel label={label} /> : null}
      <ChipGroup>
        {options.map((o) => (
          <Chip
            key={o.key}
            label={o.label}
            size="sm"
            selected={selected(o.key)}
            onPress={() => {
              if (!multiple) return onChange(value === o.key ? null : o.key);
              const list = Array.isArray(value) ? value : [];
              onChange(list.includes(o.key) ? list.filter((k) => k !== o.key) : [...list, o.key]);
            }}
          />
        ))}
      </ChipGroup>
    </View>
  );
}

/** Renk seçici — renkler veri olarak gelir (lib tarafındaki paletten). */
export function ColorField({
  label,
  value,
  onChange,
  palette,
}: {
  label?: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  palette: readonly string[];
}) {
  return (
    <View style={styles.field}>
      {label ? <FieldLabel label={label} /> : null}
      <View style={styles.swatches}>
        {palette.map((color) => (
          <Touchable
            key={color}
            onPress={() => onChange(value === color ? null : color)}
            style={[styles.swatch, { backgroundColor: color }, value === color ? styles.swatchOn : null]}
            accessibilityLabel={`Renk ${color}`}
            accessibilityState={{ selected: value === color }}
          >
            {value === color ? <Ionicons name="checkmark" size={16} color={colors.onDark} /> : null}
          </Touchable>
        ))}
      </View>
    </View>
  );
}

/** Metin alanı — Input'un etiketli hâli (tekrar kolaylığı). */
export const TextField = Input;

const styles = StyleSheet.create({
  field: { gap: space.xs },
  label: { ...type.label, color: colors.textSecondary },
  required: { color: colors.danger },
  hint: { ...type.caption, color: colors.textTertiary },
  error: { color: colors.danger },
  box: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  boxError: { borderColor: colors.danger },
  boxDisabled: { opacity: 0.5 },
  boxText: { ...type.body, color: colors.textPrimary, flex: 1 },
  placeholder: { color: colors.textTertiary },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs },
  toggleText: { flex: 1, gap: 2 },
  toggleLabel: { ...type.body, color: colors.textPrimary },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  swatch: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 2, borderColor: colors.textPrimary },
});
