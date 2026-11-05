/**
 * ETKİNLİK FORMU — yeni etkinlik / düzenleme (web Agenda.js EventForm).
 *
 * Alanlar: başlık, tür, tüm gün, başlangıç–bitiş (tüm günde yalnız gün),
 * tekrar ve tekrar bitişi (boşsa süresiz), hatırlatma, konum, açıklama ve
 * renk. Başlangıç ileri alınınca bitiş aynı süre kadar kayar. Tekrarlanan
 * etkinlikte değişiklik ve silme TÜM tekrarlara uygulanır (sunucu tek kayıt
 * tutar, tekrarları sorguda açar).
 */

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ColorField, DateField, FieldLabel, ToggleField } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, Input } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { EVENT_COLORS, EVENT_CATEGORY_COLORS } from "@/lib/admin/toolPalette";
import {
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  RECURRENCES,
  RECURRENCE_LABELS,
  REMINDER_OPTIONS,
  type EventInput,
} from "@/lib/api/admin/tools";
import { colors, radius, space, textScale, type } from "@/theme";

import { eventPayload, shiftEnd, type EventForm } from "./agendaUtils";

export function EventSheet({
  visible,
  initial,
  onClose,
  onSubmit,
  onDelete,
  onExport,
}: {
  visible: boolean;
  initial: EventForm | null;
  onClose: () => void;
  onSubmit: (payload: EventInput, id?: number) => Promise<unknown>;
  onDelete: (form: EventForm) => void;
  onExport: (payload: EventInput) => void;
}) {
  const [form, setForm] = useState<EventForm | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setForm(initial);
      setError(null);
    }
  }, [visible, initial]);

  if (!form) return null;
  const editing = Boolean(form.id);

  const set = <K extends keyof EventForm>(key: K, value: EventForm[K]) =>
    setForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      if (key === "start_at") next.end_at = shiftEnd(prev, value as string);
      if (key === "start_date" && (!prev.end_date || prev.end_date < (value as string))) next.end_date = value as string;
      return next;
    });

  const submit = async () => {
    if (!form.title.trim()) {
      setError("Başlık yazın.");
      return;
    }
    const payload = eventPayload(form);
    if (payload.end_at && payload.end_at < payload.start_at) {
      setError("Bitiş, başlangıçtan önce olamaz.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(payload, form.id);
      onClose();
    } catch (e) {
      setError(errorText(e, "Etkinlik kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title={editing ? "Etkinliği düzenle" : "Yeni etkinlik"}
      snap="full"
      footer={
        <View style={styles.footer}>
          {editing ? <Button label="Sil" variant="danger" icon="trash-outline" onPress={() => onDelete(form)} disabled={busy} /> : null}
          <Button label="Kaydet" onPress={submit} loading={busy} style={styles.flex} haptic="success" />
        </View>
      }
    >
      <View style={styles.fields}>
        <Input label="Başlık *" value={form.title} onChangeText={(v) => set("title", v)} placeholder="Etkinlik başlığı" maxLength={200} autoFocus={!editing} />

        <View style={styles.field}>
          <FieldLabel label="Tür" />
          <ChipGroup contentPadding={0}>
            {EVENT_CATEGORIES.map((key) => (
              <Chip
                key={key}
                label={EVENT_CATEGORY_LABELS[key]}
                size="sm"
                selected={form.category === key}
                onPress={() => set("category", key)}
                icon={form.category === key ? "checkmark" : undefined}
              />
            ))}
          </ChipGroup>
          <View style={styles.catDot}>
            <View style={[styles.dot, { backgroundColor: form.color || EVENT_CATEGORY_COLORS[form.category] }]} />
            <Text style={styles.hint} {...textScale.dense}>
              {form.color ? "Özel renk" : "Türün rengi"}
            </Text>
          </View>
        </View>

        <ToggleField label="Tüm gün" value={form.all_day} onChange={(v) => set("all_day", v)} />

        {form.all_day ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <DateField label="Başlangıç günü" value={form.start_date} onChange={(v) => v && set("start_date", v)} required />
            </View>
            <View style={styles.flex}>
              <DateField label="Bitiş günü" value={form.end_date} onChange={(v) => set("end_date", v || form.start_date)} />
            </View>
          </View>
        ) : (
          <>
            <DateField label="Başlangıç" withTime value={form.start_at} onChange={(v) => v && set("start_at", v)} required />
            <DateField label="Bitiş" withTime value={form.end_at || null} onChange={(v) => set("end_at", v || "")} clearable />
          </>
        )}

        <View style={styles.field}>
          <FieldLabel label="Tekrar" />
          <ChipGroup contentPadding={0}>
            {RECURRENCES.map((key) => (
              <Chip key={key} label={RECURRENCE_LABELS[key]} size="sm" selected={form.recurrence === key} onPress={() => set("recurrence", key)} />
            ))}
          </ChipGroup>
        </View>
        {form.recurrence !== "none" ? (
          <DateField label="Tekrar bitişi" hint="Boşsa süresiz tekrarlanır" value={form.repeat_until || null} onChange={(v) => set("repeat_until", v || "")} clearable />
        ) : null}

        <View style={styles.field}>
          <FieldLabel label="Hatırlatma" />
          <ChipGroup contentPadding={0}>
            {REMINDER_OPTIONS.map((option) => (
              <Chip key={option.key || "none"} label={option.label} size="sm" selected={form.remind_minutes === option.key} onPress={() => set("remind_minutes", option.key)} />
            ))}
          </ChipGroup>
        </View>

        <Input label="Konum" value={form.location} onChangeText={(v) => set("location", v)} placeholder="Saha, ofis, çevrim içi…" maxLength={200} leadingIcon="location-outline" />
        <Input label="Açıklama" value={form.description} onChangeText={(v) => set("description", v)} placeholder="Gündem, katılımcılar, notlar…" multiline numberOfLines={4} />

        <ColorField label="Renk" value={form.color || null} onChange={(v) => set("color", v || "")} palette={EVENT_COLORS} />

        {editing && form.recurrence !== "none" ? (
          <Text style={styles.hint} {...textScale.long}>
            Değişiklik tüm tekrarlara uygulanır.
          </Text>
        ) : null}

        {editing ? (
          <Button
            label="Telefon takvimine ekle"
            icon="calendar-outline"
            variant="secondary"
            size="sm"
            onPress={() => onExport(eventPayload(form))}
            style={styles.export}
          />
        ) : null}

        {error ? (
          <Text style={styles.error} {...textScale.long}>
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fields: { gap: space.md },
  field: { gap: space.xs },
  row: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  footer: { flexDirection: "row", gap: space.sm },
  catDot: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  hint: { ...type.caption, color: colors.textTertiary },
  error: { ...type.bodySm, color: colors.danger },
  export: { alignSelf: "flex-start" },
});
