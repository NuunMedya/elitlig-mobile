/**
 * Tablodan aktarma (web "Excel'den adım / kişi aktar" karşılığı).
 *
 * NEDEN YAPIŞTIRMA: telefonda dosya seçici yerel modül (document-picker)
 * ister. Excel / Google E-Tablolar'da satırlar seçilip kopyalanınca metin
 * sekmeyle ayrılmış gelir; CSV de olur. "Panodan yapıştır" düğmesi ya da
 * alana yapıştırma ile aynı sütun tanıma kuralları (başlık satırı aranır)
 * uygulanır ve önizleme gösterilir.
 */

import * as Clipboard from "expo-clipboard";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SelectField } from "@/components/admin";
import { BottomSheet, Button, Input } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { leadsFromRows, lower, parseTableText, stageOf, stagesOf, stepsFromRows } from "@/lib/admin/projectUtils";
import type { LeadKind } from "@/lib/api/admin/projects";
import { colors, radius, space, textScale, type } from "@/theme";

import { useProject } from "./ProjectContext";

function PasteBox({ text, setText }: { text: string; setText: (v: string) => void }) {
  return (
    <View style={styles.gap}>
      <Input
        label="Tablo metni"
        value={text}
        onChangeText={setText}
        multiline
        numberOfLines={6}
        placeholder="Excel'de satırları başlıklarıyla seçip kopyalayın, buraya yapıştırın…"
        autoCorrect={false}
        autoCapitalize="none"
      />
      <Button
        label="Panodan yapıştır"
        icon="clipboard-outline"
        variant="secondary"
        size="sm"
        onPress={async () => {
          try {
            const v = await Clipboard.getStringAsync();
            if (v) setText(v);
          } catch {
            /* izin yok */
          }
        }}
      />
    </View>
  );
}

function PreviewRow({ cells }: { cells: string[] }) {
  return (
    <View style={styles.prow}>
      {cells.map((c, i) => (
        <Text key={i} style={[styles.pcell, i === 0 ? styles.pfirst : null]} numberOfLines={1} {...textScale.dense}>
          {c || "—"}
        </Text>
      ))}
    </View>
  );
}

export function ImportStepsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, ops, notify } = useProject();
  const [text, setText] = useState("");
  const [phaseId, setPhaseId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) { setText(""); setPhaseId(null); setError(null); }
  }, [visible]);

  const parsed = useMemo(() => (text.trim() ? stepsFromRows(parseTableText(text)) : null), [text]);
  const phasesInFile = parsed ? [...new Set(parsed.items.map((s) => s.phase).filter(Boolean))] : [];
  const newPhases = phasesInFile.filter((n) => !data.phases.some((p) => lower(p.name) === lower(n)));
  const count = parsed?.items.length || 0;

  const submit = async () => {
    if (!parsed?.items.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ops.bulkSteps({ phase_id: phaseId, items: parsed.items });
      notify(`${res.created} adım eklendi.`);
      onClose();
    } catch (err) {
      setError(errorText(err, "Adımlar aktarılamadı."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title="Tablodan adım aktar"
      snap="full"
      footer={<Button label={busy ? "Aktarılıyor…" : `${count} adımı ekle`} onPress={submit} loading={busy} disabled={!count} haptic="success" />}
    >
      <View style={styles.gap}>
        <Text style={styles.muted} {...textScale.long}>
          Sütunlar başlıklarından tanınır: Görev / İş Kalemi (zorunlu), Ana Sorumlu Personel ("MÜDÜR & EDİTÖR" gibi), isteğe bağlı Aşama, Açıklama, Son tarih, Öncelik. Aşama sütunundaki yeni adlar için aşama açılır.
        </Text>
        <PasteBox text={text} setText={setText} />
        {parsed && !count ? <Text style={styles.error} {...textScale.long}>Metinde adım bulunamadı. İlk satırda "Görev / İş Kalemi" (ya da "Adım", "Başlık") sütunu olmalı.</Text> : null}
        {count ? (
          <>
            <SelectField<number>
              label={phasesInFile.length ? "Aşaması boş satırlar" : "Adımların ekleneceği aşama"}
              value={phaseId}
              onChange={(v) => setPhaseId(v)}
              placeholder="Aşamasız"
              clearable
              options={data.phases.map((p) => ({ value: p.id, label: p.name }))}
            />
            {newPhases.length ? <Text style={styles.muted} {...textScale.long}>Açılacak yeni aşamalar: {newPhases.join(", ")}</Text> : null}
            <View style={styles.preview}>
              <PreviewRow cells={["Adım", "Sorumlu", "Aşama", "Son tarih"]} />
              {parsed!.items.slice(0, 8).map((s, i) => (
                <PreviewRow key={`${s.title}-${i}`} cells={[s.title, s.responsible, s.phase, s.due_date || ""]} />
              ))}
              {count > 8 ? <Text style={styles.muted} {...textScale.dense}>… ve {count - 8} adım daha</Text> : null}
            </View>
          </>
        ) : null}
        {error ? <Text style={styles.error} {...textScale.long}>{error}</Text> : null}
      </View>
    </BottomSheet>
  );
}

export function ImportLeadsSheet({ visible, onClose, kind, stage }: { visible: boolean; onClose: () => void; kind: LeadKind; stage?: string }) {
  const { ops, settings, notify } = useProject();
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) { setText(""); setSource(""); setError(null); }
  }, [visible]);

  const parsed = useMemo(() => (text.trim() ? leadsFromRows(parseTableText(text), settings, kind) : null), [text, settings, kind]);
  const count = parsed?.items.length || 0;
  const firstStage = stagesOf(settings, kind)[0]?.key;

  const submit = async () => {
    if (!parsed?.items.length) return;
    setBusy(true);
    setError(null);
    try {
      const items = parsed.items.map((l) => ({ ...l, kind, stage: l.stage || stage || undefined, source: l.source || source || undefined }));
      const res = await ops.bulkLeads(items as unknown as Record<string, unknown>[], kind);
      notify(`${res.created} kişi eklendi${res.skipped ? `, ${res.skipped} kayıt atlandı (aynı telefon / e-posta ya da eksik)` : ""}.`);
      onClose();
    } catch (err) {
      setError(errorText(err, "Kişiler aktarılamadı."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title={kind === "supplier" ? "Tablodan tedarikçi aktar" : "Tablodan kişi aktar"}
      snap="full"
      footer={<Button label={busy ? "Aktarılıyor…" : `${count} kişiyi ekle`} onPress={submit} loading={busy} disabled={!count} haptic="success" />}
    >
      <View style={styles.gap}>
        <Text style={styles.muted} {...textScale.long}>
          Tanınan sütunlar: Ad Soyad, Kurum / Takım, Unvan, Telefon, E-posta, Şehir, Kaynak, Aşama, Tutar, Not{kind === "supplier" ? ", Konu" : ""}. Aynı telefon / e-posta atlanır.
        </Text>
        <PasteBox text={text} setText={setText} />
        {parsed && !count ? <Text style={styles.error} {...textScale.long}>Metinde kişi bulunamadı. İlk satırda "Ad Soyad" ya da "Kurum" sütunu olmalı.</Text> : null}
        {count ? (
          <>
            <Input
              label={kind === "supplier" ? "Kategori (boş satırlar için)" : "Kaynak (boş satırlar için)"}
              value={source}
              onChangeText={setSource}
              placeholder={(kind === "supplier" ? settings.supplier_categories : settings.lead_sources)?.slice(0, 3).join(", ")}
            />
            <View style={styles.preview}>
              <PreviewRow cells={["Ad", "Kurum", "Telefon", "Aşama"]} />
              {parsed!.items.slice(0, 8).map((l, i) => (
                <PreviewRow key={`${l.name}-${i}`} cells={[l.name, l.company, l.phone, stageOf(settings, l.stage || stage || firstStage, kind).label]} />
              ))}
              {count > 8 ? <Text style={styles.muted} {...textScale.dense}>… ve {count - 8} kişi daha</Text> : null}
            </View>
          </>
        ) : null}
        {error ? <Text style={styles.error} {...textScale.long}>{error}</Text> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  muted: { ...type.bodySm, color: colors.textSecondary },
  error: { ...type.bodySm, color: colors.danger },
  preview: { gap: space.xxs, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  prow: { flexDirection: "row", gap: space.sm },
  pcell: { ...type.caption, color: colors.textSecondary, flex: 1 },
  pfirst: { flex: 2, color: colors.textPrimary },
});
