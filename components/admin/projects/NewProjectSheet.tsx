/**
 * "Yeni proje": şablon seçimi (Organizasyon sezonu öne çıkar), ad, durum,
 * tarih ve renk. Kendi kaydettiğiniz şablonlar "Şablonum" rozetiyle gelir ve
 * basılı tutularak silinir. Seçili şablonun aşamaları ve sorumlu rolleri
 * önizlenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChipsField, ColorField, DateField, confirmAction } from "@/components/admin";
import { Badge, BottomSheet, Button, Input, Skeleton, Touchable, useToast, withAlpha } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { DEFAULT_PROJECT_COLOR, PROJECT_COLORS, PROJECT_STATUSES, PROJECT_STATUS_META, projectIcon } from "@/lib/admin/projectUtils";
import { createProject, listTemplates, projectKeys, removeTemplate, type Project, type ProjectStatus, type Template } from "@/lib/api/admin/projects";
import { colors, radius, space, textScale, type } from "@/theme";

const FEATURED = "organizasyon-sezonu";

export function NewProjectSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (item: Project) => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: projectKeys.templates, queryFn: () => listTemplates().then((r) => r.items ?? []), enabled: visible });
  const [template, setTemplate] = useState<string>(FEATURED);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTemplate(FEATURED);
    setName("");
    setDescription("");
    setStatus("planning");
    setStart(null);
    setEnd(null);
    setColor(null);
    setMore(false);
    setError(null);
  }, [visible]);

  const ordered = useMemo(
    () => [...(templates.data || [])].sort((a, b) => Number(b.key === FEATURED) - Number(a.key === FEATURED) || Number(b.builtin) - Number(a.builtin)),
    [templates.data]
  );
  const selected = ordered.find((t) => t.key === template) || null;
  const shownColor = color || selected?.color || DEFAULT_PROJECT_COLOR;

  const submit = async () => {
    if (!name.trim()) {
      setError("Proje adı zorunludur.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createProject({
        name: name.trim(),
        description: description || null,
        status,
        start_date: start || null,
        end_date: end || null,
        color: shownColor,
        icon: selected?.icon || "folder",
        template: template || null,
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "projects", "list"] });
      toast.show({ message: `Proje oluşturuldu (${res.created?.steps ?? 0} adım).`, tone: "success" });
      onCreated(res.item);
    } catch (err) {
      setError(errorText(err, "Proje oluşturulamadı."));
    } finally {
      setBusy(false);
    }
  };

  const removeOwn = async (t: Template) => {
    const ok = await confirmAction({
      title: "Şablon silinsin mi?",
      message: `"${t.name}" şablonu silinecek. Bu şablondan açılmış projeler etkilenmez.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeTemplate(t.key);
      queryClient.setQueryData<Template[]>(projectKeys.templates, (list) => (list || []).filter((x) => x.key !== t.key));
      if (template === t.key) setTemplate(FEATURED);
      toast.show({ message: "Şablon silindi.", tone: "success" });
    } catch (err) {
      toast.show({ message: errorText(err, "Şablon silinemedi."), tone: "danger" });
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title="Yeni proje"
      snap="full"
      footer={
        <View style={styles.footer}>
          <Text style={styles.footHint} numberOfLines={2} {...textScale.dense}>
            {selected ? `${selected.phase_count} aşama · ${selected.step_count} adım hazır gelir; hepsi düzenlenebilir.` : "Boş başlar."}
          </Text>
          <Button label="Projeyi oluştur" onPress={submit} loading={busy} haptic="success" />
        </View>
      }
    >
      <View style={styles.body}>
        <Input label="Proje adı *" value={name} onChangeText={setName} placeholder="Ör. 2027 İlkbahar Sezonu" error={error && !name.trim() ? error : undefined} />

        <Text style={styles.label} {...textScale.dense}>Şablon</Text>
        {templates.isLoading ? (
          <Skeleton height={140} radius="lg" />
        ) : templates.error ? (
          <Text style={styles.error} {...textScale.long}>{errorText(templates.error, "Şablonlar yüklenemedi.")}</Text>
        ) : (
          <View style={styles.tpls}>
            {ordered.map((t) => (
              <TemplateCard key={t.key} t={t} on={template === t.key} onPress={() => setTemplate(t.key)} onLongPress={!t.builtin ? () => void removeOwn(t) : undefined} />
            ))}
          </View>
        )}

        {selected ? (
          <View style={styles.preview}>
            <Text style={styles.label} {...textScale.dense}>{selected.name} · aşamalar</Text>
            {selected.phases.map((p, i) => (
              <Text key={`${p}-${i}`} style={styles.phase} {...textScale.dense}>
                {i + 1}. {p}
              </Text>
            ))}
            {selected.roles?.length ? (
              <>
                <Text style={[styles.label, styles.mt]} {...textScale.dense}>Sorumlu roller</Text>
                <View style={styles.roles}>
                  {selected.roles.map((r) => <Badge key={r} label={r} tone="neutral" size="xs" />)}
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        <Touchable onPress={() => setMore((m) => !m)} style={styles.moreBtn} accessibilityRole="button">
          <Ionicons name={more ? "chevron-up" : "chevron-down"} size={16} color={colors.brandAccent} />
          <Text style={styles.moreText} {...textScale.dense}>Açıklama, durum, tarih ve renk</Text>
        </Touchable>
        {more ? (
          <View style={styles.body}>
            <Input label="Açıklama" value={description} onChangeText={setDescription} multiline numberOfLines={3} />
            <ChipsField<ProjectStatus>
              label="Durum"
              value={status}
              onChange={(v) => { if (typeof v === "string") setStatus(v); }}
              options={PROJECT_STATUSES.map((k) => ({ key: k, label: PROJECT_STATUS_META[k].label }))}
            />
            <DateField label="Başlangıç" value={start} onChange={setStart} clearable />
            <DateField label="Bitiş" value={end} onChange={setEnd} clearable />
            <ColorField label="Renk" value={shownColor} onChange={setColor} palette={PROJECT_COLORS} />
          </View>
        ) : null}
        {error && name.trim() ? <Text style={styles.error} {...textScale.long}>{error}</Text> : null}
      </View>
    </BottomSheet>
  );
}

function TemplateCard({ t, on, onPress, onLongPress }: { t: Template; on: boolean; onPress: () => void; onLongPress?: () => void }) {
  const c = t.color || colors.textSecondary;
  return (
    <Touchable
      feedback="card"
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.tpl, on ? { borderColor: c, backgroundColor: withAlpha(c, 0.08) } : null]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <View style={[styles.tplIcon, { backgroundColor: withAlpha(c, 0.16) }]}>
        <Ionicons name={projectIcon(t.icon)} size={18} color={c} />
      </View>
      <View style={styles.flex}>
        <View style={styles.tplHead}>
          <Text style={styles.tplName} numberOfLines={1} {...textScale.dense}>{t.name}</Text>
          {t.key === FEATURED ? <Badge label="Önerilen" tone="brand" size="xs" /> : null}
          {!t.builtin ? <Badge label="Şablonum" tone="info" size="xs" /> : null}
        </View>
        <Text style={styles.tplDesc} numberOfLines={2} {...textScale.dense}>
          {t.description || "Kaydedilmiş süreç"}
        </Text>
        <Text style={styles.tplCount} {...textScale.badge}>{t.phase_count} aşama · {t.step_count} adım{!t.builtin ? " · silmek için basılı tutun" : ""}</Text>
      </View>
      {on ? <Ionicons name="checkmark-circle" size={20} color={c} /> : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { gap: space.md },
  footer: { gap: space.sm },
  footHint: { ...type.caption, color: colors.textTertiary },
  label: { ...type.label, color: colors.textSecondary },
  mt: { marginTop: space.sm },
  error: { ...type.bodySm, color: colors.danger },
  tpls: { gap: space.sm },
  tpl: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  tplIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  tplHead: { flexDirection: "row", alignItems: "center", gap: space.s, flexWrap: "wrap" },
  tplName: { ...type.label, color: colors.textPrimary, flexShrink: 1 },
  tplDesc: { ...type.bodySm, color: colors.textSecondary },
  tplCount: { ...type.meta, color: colors.textTertiary, marginTop: space.xxs },
  preview: { padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2, gap: space.xxs },
  phase: { ...type.bodySm, color: colors.textPrimary },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  moreBtn: { flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.s },
  moreText: { ...type.label, color: colors.brandAccent },
});
