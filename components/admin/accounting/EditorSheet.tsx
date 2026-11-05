/**
 * EditorSheet — muhasebe formlarının ortak alt sayfası.
 *
 * NEDEN FormSheet DEĞİL: muhasebe formlarında alanlar birbirine bağlı
 * (tür değişince kategori önerileri, durum "bekliyor" olunca vade alanı),
 * formun içinde öneri çipleri ve canlı önizleme (KDV matrahı, virman sonrası
 * bakiye) var ve web'deki "Kaydet ve yeni" akışı korunmalı. FormSheet'in alan
 * şemasını (FormFields) aynen kullanır; üstüne:
 *   · `fields` değerlere göre üretilebilir,
 *   · `extra(values, set)` alanların altına değere erişen içerik çizer,
 *   · `validate(values)` sunucuya gitmeden Türkçe hata döndürür,
 *   · `saveAndNew` formu kapatmadan kaydedip sıfırlar.
 */

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FormFields, validateFields, type FieldDef, type FormValues } from "@/components/admin";
import { BottomSheet, Button } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { colors, space, textScale, type } from "@/theme";

export interface EditorSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  fields: FieldDef[] | ((values: FormValues) => FieldDef[]);
  initial?: FormValues;
  /** Hata fırlatırsa form açık kalır ve iletiyi gösterir. */
  onSubmit: (values: FormValues) => Promise<unknown> | unknown;
  validate?: (values: FormValues) => string | null;
  intro?: string;
  /** Alanların üstünde değere erişen içerik. */
  header?: (values: FormValues, set: (patch: FormValues) => void) => React.ReactNode;
  /** Alanların altında değere erişen içerik. */
  extra?: (values: FormValues, set: (patch: FormValues) => void) => React.ReactNode;
  submitLabel?: string;
  secondary?: { label: string; onPress: () => void; danger?: boolean };
  /** Kaydedip formu `reset(values)` ile yeniden açar. */
  saveAndNew?: { label?: string; reset: (values: FormValues) => FormValues };
}

export function EditorSheet({
  visible,
  onClose,
  title,
  fields,
  initial,
  onSubmit,
  validate,
  intro,
  header,
  extra,
  submitLabel = "Kaydet",
  secondary,
  saveAndNew,
}: EditorSheetProps) {
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

  const list = typeof fields === "function" ? fields(values) : fields;
  const set = (patch: FormValues) => setValues((prev) => ({ ...prev, ...patch }));

  const submit = async (keepOpen: boolean) => {
    const found = validateFields(list, values);
    setErrors(found);
    if (Object.keys(found).length) return;
    const message = validate?.(values);
    if (message) {
      setFailure(message);
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit(values);
      if (keepOpen && saveAndNew) setValues(saveAndNew.reset(values));
      else onClose();
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
      snap="full"
      footer={
        <View style={styles.footer}>
          {secondary ? (
            <Button label={secondary.label} variant={secondary.danger ? "danger" : "secondary"} onPress={secondary.onPress} disabled={busy} />
          ) : null}
          {saveAndNew ? (
            <Button label={saveAndNew.label ?? "Kaydet ve yeni"} variant="secondary" onPress={() => submit(true)} disabled={busy} />
          ) : null}
          <Button label={submitLabel} onPress={() => submit(false)} loading={busy} style={styles.submit} haptic="success" />
        </View>
      }
    >
      {intro ? (
        <Text style={styles.intro} {...textScale.long}>
          {intro}
        </Text>
      ) : null}
      {header ? <View style={styles.block}>{header(values, set)}</View> : null}
      <FormFields fields={list} values={values} onChange={setValues} errors={errors} />
      {extra ? <View style={styles.extra}>{extra(values, set)}</View> : null}
      {failure ? (
        <Text style={styles.failure} {...textScale.long}>
          {failure}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  submit: { flex: 1 },
  intro: { ...type.bodySm, color: colors.textSecondary, marginBottom: space.md },
  block: { marginBottom: space.md, gap: space.sm },
  extra: { marginTop: space.md, gap: space.sm },
  failure: { ...type.bodySm, color: colors.danger, marginTop: space.md },
});
