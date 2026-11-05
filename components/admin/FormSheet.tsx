/**
 * FormSheet / FormFields — şemadan form.
 *
 * NE: yönetim ekranlarındaki "ekle / düzenle" pencerelerinin tek kalıbı.
 * Ekran alanları bir dizi olarak tanımlar; bileşen değerleri tutar, zorunlu
 * alanları denetler, `onSubmit` sürerken düğmeyi kilitler ve sunucu hatasını
 * formun altında gösterir. Başarıda sayfa kapanır.
 *
 *   <FormSheet
 *     visible={open} onClose={close} title="Yeni lig"
 *     fields={[
 *       { key: "name", label: "Lig adı", kind: "text", required: true },
 *       { key: "city", label: "İl", kind: "select", options: cityOptions },
 *       { key: "active", label: "Aktif", kind: "toggle" },
 *     ]}
 *     initial={{ active: true }}
 *     onSubmit={(values) => createLeague(values)}
 *   />
 */

import type Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, Input } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { colors, space, textScale, type } from "@/theme";

import {
  ChipsField,
  ColorField,
  DateField,
  MultiSelectField,
  SegmentField,
  SelectField,
  ToggleField,
} from "./fields";
import type { Option } from "./OptionSheet";

export type FieldKind =
  | "text"
  | "multiline"
  | "number"
  | "money"
  | "email"
  | "phone"
  | "password"
  | "url"
  | "date"
  | "datetime"
  | "select"
  | "multiselect"
  | "chips"
  | "segment"
  | "toggle"
  | "color";

export type FormValues = Record<string, unknown>;

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: Option<string | number>[];
  loadOptions?: (q: string) => Promise<Option<string | number>[]>;
  queryKey?: readonly unknown[];
  /** Uzak seçimde mevcut değerin görünen adı. */
  valueLabel?: (values: FormValues) => string | null | undefined;
  /** Renk alanının paleti. */
  palette?: readonly string[];
  clearable?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Değerlere göre gizle (ör. tür "gider" değilse). */
  hidden?: (values: FormValues) => boolean;
  /** Alan değişince diğer değerleri ayarla (ör. lig değişince sezonu sıfırla). */
  onChange?: (value: unknown, values: FormValues) => FormValues | void;
  disabled?: boolean;
  maxLength?: number;
}

export function FormFields({
  fields,
  values,
  onChange,
  errors,
}: {
  fields: FieldDef[];
  values: FormValues;
  onChange: (next: FormValues) => void;
  errors?: Record<string, string>;
}) {
  const set = (field: FieldDef, value: unknown) => {
    let next: FormValues = { ...values, [field.key]: value };
    const extra = field.onChange?.(value, next);
    if (extra) next = { ...next, ...extra };
    onChange(next);
  };

  return (
    <View style={styles.fields}>
      {fields.map((field) => {
        if (field.hidden?.(values)) return null;
        const value = values[field.key];
        const error = errors?.[field.key];
        const label = field.required ? `${field.label} *` : field.label;
        switch (field.kind) {
          case "toggle":
            return (
              <ToggleField
                key={field.key}
                label={field.label}
                hint={field.hint}
                value={Boolean(value)}
                onChange={(v) => set(field, v)}
                disabled={field.disabled}
              />
            );
          case "select":
            return (
              <SelectField<string | number>
                key={field.key}
                label={field.label}
                required={field.required}
                value={(value as string | number | null) ?? null}
                options={field.options}
                loadOptions={field.loadOptions}
                queryKey={field.queryKey}
                valueLabel={field.valueLabel?.(values) ?? null}
                placeholder={field.placeholder}
                clearable={field.clearable ?? !field.required}
                hint={field.hint}
                error={error}
                icon={field.icon}
                disabled={field.disabled}
                onChange={(v) => set(field, v)}
              />
            );
          case "multiselect":
            return (
              <MultiSelectField<string | number>
                key={field.key}
                label={field.label}
                required={field.required}
                value={Array.isArray(value) ? (value as (string | number)[]) : []}
                options={field.options}
                loadOptions={field.loadOptions}
                queryKey={field.queryKey}
                placeholder={field.placeholder}
                hint={field.hint}
                onChange={(v) => set(field, v)}
              />
            );
          case "chips":
            return (
              <ChipsField<string>
                key={field.key}
                label={field.label}
                value={(value as string | null) ?? null}
                options={(field.options ?? []).map((o) => ({ key: String(o.value), label: o.label }))}
                onChange={(v) => set(field, v)}
              />
            );
          case "segment":
            return (
              <SegmentField<string>
                key={field.key}
                label={field.label}
                value={String(value ?? field.options?.[0]?.value ?? "")}
                options={(field.options ?? []).map((o) => ({ key: String(o.value), label: o.label }))}
                onChange={(v) => set(field, v)}
              />
            );
          case "date":
          case "datetime":
            return (
              <DateField
                key={field.key}
                label={field.label}
                required={field.required}
                withTime={field.kind === "datetime"}
                value={(value as string | null) ?? null}
                clearable={field.clearable ?? !field.required}
                hint={field.hint}
                error={error}
                onChange={(v) => set(field, v)}
              />
            );
          case "color":
            return (
              <ColorField
                key={field.key}
                label={field.label}
                value={(value as string | null) ?? null}
                palette={field.palette ?? []}
                onChange={(v) => set(field, v)}
              />
            );
          default: {
            const numeric = field.kind === "number" || field.kind === "money";
            return (
              <Input
                key={field.key}
                label={label}
                value={value == null ? "" : String(value)}
                onChangeText={(text) => set(field, numeric ? text.replace(/[^\d.,-]/g, "") : text)}
                placeholder={field.placeholder}
                hint={field.hint}
                error={error}
                editable={!field.disabled}
                maxLength={field.maxLength}
                multiline={field.kind === "multiline"}
                numberOfLines={field.kind === "multiline" ? 4 : undefined}
                secureTextEntry={field.kind === "password"}
                autoCapitalize={
                  field.kind === "email" || field.kind === "url" || field.kind === "password" ? "none" : "sentences"
                }
                autoCorrect={field.kind === "text" || field.kind === "multiline"}
                keyboardType={
                  field.kind === "number"
                    ? "numbers-and-punctuation"
                    : field.kind === "money"
                      ? "decimal-pad"
                      : field.kind === "email"
                        ? "email-address"
                        : field.kind === "phone"
                          ? "phone-pad"
                          : field.kind === "url"
                            ? "url"
                            : "default"
                }
                leadingIcon={field.icon}
              />
            );
          }
        }
      })}
    </View>
  );
}

/** Zorunlu alan denetimi — boş zorunlu alanlar için hata sözlüğü. */
export function validateFields(fields: FieldDef[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!field.required || field.hidden?.(values)) continue;
    const value = values[field.key];
    const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
    if (empty) errors[field.key] = `${field.label} gerekli.`;
  }
  return errors;
}

export interface FormSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  fields: FieldDef[];
  initial?: FormValues;
  submitLabel?: string;
  onSubmit: (values: FormValues) => Promise<unknown> | unknown;
  /** Formun üstünde açıklama. */
  intro?: string;
  /** İkincil eylem (ör. "Sil"). */
  secondary?: { label: string; onPress: () => void; danger?: boolean };
  snap?: "content" | "half" | "full";
  /** Form alanlarının altına eklenen içerik. */
  children?: React.ReactNode;
}

export function FormSheet({
  visible,
  onClose,
  title,
  fields,
  initial,
  submitLabel = "Kaydet",
  onSubmit,
  intro,
  secondary,
  snap = "full",
  children,
}: FormSheetProps) {
  const [values, setValues] = useState<FormValues>(initial ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setValues(initial ?? {});
      setErrors({});
      setFailure(null);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const found = validateFields(fields, values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit(values);
      onClose();
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title={title}
      snap={snap}
      footer={
        <View style={styles.footer}>
          {secondary ? (
            <Button
              label={secondary.label}
              variant={secondary.danger ? "danger" : "secondary"}
              onPress={secondary.onPress}
              disabled={busy}
            />
          ) : null}
          <Button label={submitLabel} onPress={submit} loading={busy} style={styles.submit} haptic="success" />
        </View>
      }
    >
      {intro ? (
        <Text style={styles.intro} {...textScale.long}>
          {intro}
        </Text>
      ) : null}
      <FormFields fields={fields} values={values} onChange={setValues} errors={errors} />
      {children}
      {failure ? (
        <Text style={styles.failure} {...textScale.long}>
          {failure}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fields: { gap: space.md },
  footer: { flexDirection: "row", gap: space.sm },
  submit: { flex: 1 },
  intro: { ...type.bodySm, color: colors.textSecondary, marginBottom: space.md },
  failure: { ...type.bodySm, color: colors.danger, marginTop: space.md },
});
