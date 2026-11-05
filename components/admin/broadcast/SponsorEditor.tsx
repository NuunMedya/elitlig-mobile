/**
 * Sponsor düzenleyici (alt sayfa).
 *
 * Web: sponsors/SponsorsAdmin.js SponsorEditor. Dört bölüm:
 *   1. temel bilgiler (ad, slogan, tür, bağlantı, marka rengi, il, öncelik)
 *   2. görseller — kullanım yerine göre ayrı (logo, alt bant, maç öncesi …);
 *      galeriden seçilip POST /api/admin/sponsors/upload ile yüklenir
 *   3. görünüm yerleri — yayın / LED / web, grup grup aç-kapa
 *   4. sözleşme tarihleri, iletişim kişisi ve iç notlar
 * Başka ile / tüm illere ait sponsor il yetkilisine salt okunur açılır.
 */

import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FormFields, ToggleField, validateFields, type FieldDef, type FormValues } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { toNumber } from "@/lib/admin/format";
import {
  PLACEMENT_GROUPS,
  uploadSponsorImage,
  type Sponsor,
  type SponsorCatalog,
  type SponsorPayload,
} from "@/lib/api/admin/broadcast";
import { colors, space, textScale, type } from "@/theme";

import { ImageUploadField } from "./ImageUploadField";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function SponsorEditor({
  visible,
  onClose,
  initial,
  catalog,
  cities,
  onSubmit,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  initial: Sponsor | null;
  catalog: SponsorCatalog | undefined;
  cities: { id: number; label: string }[];
  onSubmit: (body: Partial<SponsorPayload>) => Promise<unknown>;
  onDelete?: () => void;
}) {
  const isNew = !initial?.id;
  const editable = isNew || initial?.editable !== false;
  const nationwide = Boolean(catalog?.scope.nationwide);
  const [values, setValues] = useState<FormValues>({});
  const [images, setImages] = useState<Record<string, string>>({});
  const [placements, setPlacements] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (!visible) return;
    setValues({
      name: initial?.name ?? "",
      tagline: initial?.tagline ?? "",
      description: initial?.description ?? "",
      linkUrl: initial?.linkUrl ?? "",
      tier: initial?.tier || null,
      brandColor: initial?.brandColor ?? "",
      cityId: initial?.cityId ?? null,
      priority: String(initial?.priority ?? 0),
      active: initial?.active ?? true,
      startDate: initial?.startDate || null,
      endDate: initial?.endDate || null,
      displaySeconds: String(initial?.displaySeconds ?? 15),
      contactName: initial?.contactName ?? "",
      contactPhone: initial?.contactPhone ?? "",
      contactEmail: initial?.contactEmail ?? "",
      notes: initial?.notes ?? "",
    });
    setImages({ ...(initial?.images ?? {}) });
    setPlacements([...(initial?.placements ?? [])]);
    setErrors({});
    setFailure("");
  }, [visible, initial]);

  const basic: FieldDef[] = useMemo(
    () => [
      { key: "name", label: "Sponsor adı", kind: "text", required: true, placeholder: "Ör. Marka A.Ş.", maxLength: 120, disabled: !editable },
      { key: "tier", label: "Sponsor türü", kind: "select", clearable: true, placeholder: "Belirtilmedi", options: (catalog?.tiers ?? []).map((t) => ({ value: t.key, label: t.label })) },
      { key: "tagline", label: "Slogan", kind: "text", maxLength: 160, disabled: !editable },
      { key: "linkUrl", label: "Bağlantı", kind: "url", placeholder: "https://", disabled: !editable },
      { key: "brandColor", label: "Marka rengi", kind: "text", hint: "Onaltılık renk kodu, başında # ile (6 hane).", disabled: !editable },
      ...(nationwide
        ? [{ key: "cityId", label: "İl", kind: "select" as const, clearable: true, placeholder: "Tüm iller", options: cities.map((c) => ({ value: c.id, label: c.label })) }]
        : []),
      { key: "priority", label: "Öncelik", kind: "number", hint: "Büyük değer önce gösterilir.", disabled: !editable },
      { key: "description", label: "Açıklama", kind: "multiline", maxLength: 2000, disabled: !editable },
    ],
    [catalog, cities, nationwide, editable]
  );

  const contract: FieldDef[] = [
    { key: "active", label: "Aktif", kind: "toggle", hint: "Pasif sponsor hiçbir yerde görünmez." },
    { key: "startDate", label: "Sözleşme başlangıcı", kind: "date", clearable: true },
    { key: "endDate", label: "Sözleşme bitişi", kind: "date", clearable: true },
    {
      key: "displaySeconds",
      label: "Ekranda kalma süresi (sn)",
      kind: "number",
      hint: "Yayın grafikleri bu süre sonunda kendiliğinden kapanır (0 = elle kapanır).",
      hidden: () => !placements.some((k) => catalog?.placements.find((p) => p.key === k)?.group === "broadcast"),
    },
    { key: "contactName", label: "İletişim kişisi", kind: "text" },
    { key: "contactPhone", label: "İletişim telefonu", kind: "phone" },
    { key: "contactEmail", label: "İletişim e-postası", kind: "email" },
    { key: "notes", label: "İç notlar", kind: "multiline", maxLength: 4000 },
  ];

  const togglePlacement = (key: string, on: boolean) =>
    setPlacements((prev) => {
      const set = new Set(prev);
      if (on) set.add(key);
      else set.delete(key);
      return (catalog?.placements ?? []).map((p) => p.key).filter((k) => set.has(k));
    });
  const toggleGroup = (group: string, on: boolean) =>
    setPlacements((prev) => {
      const set = new Set(prev);
      (catalog?.placements ?? []).filter((p) => p.group === group).forEach((p) => (on ? set.add(p.key) : set.delete(p.key)));
      return (catalog?.placements ?? []).map((p) => p.key).filter((k) => set.has(k));
    });

  const submit = async () => {
    const found = validateFields(basic, values);
    const color = String(values.brandColor ?? "").trim();
    if (color && !HEX.test(color)) found.brandColor = "Renk kodu # ile başlayan 3 ya da 6 haneli olmalı.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFailure("");
    try {
      await onSubmit({
        name: String(values.name ?? "").trim(),
        tagline: String(values.tagline ?? ""),
        description: String(values.description ?? ""),
        linkUrl: String(values.linkUrl ?? ""),
        tier: values.tier ? String(values.tier) : "",
        brandColor: color,
        ...(nationwide ? { cityId: values.cityId ? Number(values.cityId) : null } : {}),
        priority: toNumber(values.priority) ?? 0,
        active: Boolean(values.active),
        startDate: values.startDate ? String(values.startDate).slice(0, 10) : "",
        endDate: values.endDate ? String(values.endDate).slice(0, 10) : "",
        displaySeconds: toNumber(values.displaySeconds) ?? 0,
        images,
        placements,
        contactName: String(values.contactName ?? ""),
        contactPhone: String(values.contactPhone ?? ""),
        contactEmail: String(values.contactEmail ?? ""),
        notes: String(values.notes ?? ""),
      });
      onClose();
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // Seçili yerin görseli eksikse uyar (görsel yoksa yedek denenir).
  const missingImages = placements
    .map((k) => catalog?.placements.find((p) => p.key === k))
    .filter((p) => p && !images[p.image] && !(p.fallback && images[p.fallback]))
    .map((p) => p!.label);

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title={isNew ? "Yeni sponsor" : values.name ? String(values.name) : "Sponsor"}
      snap="full"
      footer={
        <View style={styles.footer}>
          {onDelete && !isNew ? <Button label="Sil" variant="danger" onPress={onDelete} disabled={busy} /> : null}
          {editable ? <Button label="Kaydet" onPress={() => void submit()} loading={busy} style={styles.flex} haptic="success" /> : null}
        </View>
      }
    >
      <View style={styles.wrap}>
        {!editable ? (
          <Text style={styles.warn} {...textScale.long}>
            Bu sponsor tüm illere ya da başka bir ile ait. Görüntüleyebilirsin ama değişiklik yalnız Türkiye geneli yetkili hesaplardan yapılabilir.
          </Text>
        ) : null}
        <Text style={styles.section} {...textScale.dense}>
          1 · Temel bilgiler
        </Text>
        <FormFields fields={basic} values={values} onChange={setValues} errors={errors} />

        <Text style={styles.section} {...textScale.dense}>
          2 · Görseller
        </Text>
        {(catalog?.imageSlots ?? []).map((slot) => (
          <ImageUploadField
            key={slot.key}
            label={slot.label}
            hint={slot.size}
            value={images[slot.key]}
            wide={slot.key !== "logo" && slot.key !== "corner"}
            disabled={!editable}
            upload={uploadSponsorImage}
            onChange={(url) =>
              setImages((prev) => {
                const next = { ...prev };
                if (url) next[slot.key] = url;
                else delete next[slot.key];
                return next;
              })
            }
          />
        ))}

        <Text style={styles.section} {...textScale.dense}>
          3 · Nerelerde görünecek
        </Text>
        {PLACEMENT_GROUPS.map((g) => {
          const items = (catalog?.placements ?? []).filter((p) => p.group === g.key);
          const selected = items.filter((p) => placements.includes(p.key)).length;
          return (
            <View key={g.key} style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle} {...textScale.dense}>
                  {g.label} · {selected}/{items.length}
                </Text>
                <ChipGroup contentPadding={0}>
                  <Chip size="sm" label="Tümü" onPress={() => toggleGroup(g.key, true)} disabled={!editable} />
                  <Chip size="sm" label="Hiçbiri" onPress={() => toggleGroup(g.key, false)} disabled={!editable} />
                </ChipGroup>
              </View>
              {items.map((p) => (
                <ToggleField key={p.key} label={p.label} value={placements.includes(p.key)} onChange={(v) => togglePlacement(p.key, v)} disabled={!editable} />
              ))}
            </View>
          );
        })}
        {missingImages.length ? (
          <Text style={styles.warn} {...textScale.long}>
            Görseli eksik yerler: {missingImages.join(", ")}. Bu yerlerde sponsor görünmeyebilir.
          </Text>
        ) : null}

        <Text style={styles.section} {...textScale.dense}>
          4 · Sözleşme ve iletişim
        </Text>
        <FormFields fields={contract} values={values} onChange={setValues} errors={errors} />

        {failure ? (
          <Text style={styles.error} {...textScale.long}>
            {failure}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  footer: { flexDirection: "row", gap: space.sm },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.sm },
  group: { gap: space.xs },
  groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  groupTitle: { ...type.label, color: colors.textPrimary },
  warn: { ...type.bodySm, color: colors.warn },
  error: { ...type.bodySm, color: colors.danger },
});
