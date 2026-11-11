/**
 * Takım Finansı & FFP pencereleri — web teamFinance/TeamFinanceAdmin.js.
 *
 *   FfpSettingsSheet — FFP denetimi açık/kapalı, azami net harcama, azami
 *                      kadro değeri (ETL), uyarı eşiği (%). Boş sınır uygulanmaz.
 *   TeamEntrySheet   — elle kasa kaydı (yalnız düzeltme — gelir / gider).
 *                      Transfer bonservisleri sözleşme yürürlüğe girince
 *                      sunucuda kendiliğinden işlenir.
 */

import React from "react";

import { type FormValues } from "@/components/admin";
import { parseAmount } from "@/lib/api/admin/accounting";
import { type FfpSettings, type TeamEntryType } from "@/lib/api/admin/teamFinance";

import { EditorSheet } from "./EditorSheet";
import { Muted } from "./parts";

const s = (v: unknown) => (v == null ? "" : String(v));
/** Türkçe yazım ("1.250,50") da noktalı ondalık ("1250.50") da doğru okunur; okunamayan NaN. */
const num = (v: unknown) => parseAmount(v) ?? NaN;

export function FfpSettingsSheet({
  visible,
  onClose,
  settings,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  settings: FfpSettings | null | undefined;
  onSubmit: (next: FfpSettings) => Promise<unknown>;
}) {
  const initial: FormValues = {
    enabled: settings?.enabled !== false,
    maxNetSpend: settings?.maxNetSpend ?? "",
    maxSquadValue: settings?.maxSquadValue ?? "",
    warningThresholdPct: String(settings?.warningThresholdPct ?? 80),
  };
  return (
    <EditorSheet
      visible={visible}
      onClose={onClose}
      title="FFP sınırları"
      intro="Net transfer harcaması = alım giderleri − satış gelirleri. Boş bırakılan sınır uygulanmaz."
      initial={initial}
      fields={(v) => [
        { key: "enabled", label: `FFP denetimi ${v.enabled ? "açık" : "kapalı"}`, kind: "toggle" },
        { key: "maxNetSpend", label: "Azami net harcama", kind: "number", placeholder: "sınırsız" },
        { key: "maxSquadValue", label: "Azami kadro değeri (ETL)", kind: "number", placeholder: "sınırsız" },
        { key: "warningThresholdPct", label: "Uyarı eşiği (%)", kind: "number", required: true },
      ]}
      validate={(v) => {
        const pct = num(v.warningThresholdPct);
        if (!Number.isFinite(pct) || pct < 1 || pct > 100) return "Uyarı eşiği 1 ile 100 arasında olmalı.";
        for (const key of ["maxNetSpend", "maxSquadValue"]) {
          if (s(v[key]) !== "" && (!Number.isFinite(num(v[key])) || num(v[key]) < 0)) return "Sınır sıfır ya da daha büyük bir sayı olmalı.";
        }
        return null;
      }}
      onSubmit={(v) =>
        onSubmit({
          enabled: Boolean(v.enabled),
          maxNetSpend: s(v.maxNetSpend) === "" ? null : num(v.maxNetSpend),
          maxSquadValue: s(v.maxSquadValue) === "" ? null : num(v.maxSquadValue),
          warningThresholdPct: num(v.warningThresholdPct),
        })
      }
    />
  );
}

export function TeamEntrySheet({
  visible,
  onClose,
  teamName,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  teamName: string;
  onSubmit: (body: { entryType: TeamEntryType; amount: number; description: string }) => Promise<unknown>;
}) {
  return (
    <EditorSheet
      visible={visible}
      onClose={onClose}
      title={`${teamName} — kasa kaydı`}
      initial={{ entryType: "ADJUSTMENT_INCOME", amount: "", description: "" }}
      fields={[
        {
          key: "entryType",
          label: "Tür",
          kind: "segment",
          options: [
            { value: "ADJUSTMENT_INCOME", label: "Düzeltme — gelir" },
            { value: "ADJUSTMENT_EXPENSE", label: "Düzeltme — gider" },
          ],
        },
        { key: "amount", label: "Tutar", kind: "money", required: true },
        { key: "description", label: "Açıklama", kind: "text" },
      ]}
      extra={() => <Muted>Yalnızca düzeltme kayıtları elle eklenir; transfer bonservisleri sözleşme yürürlüğe girince kasaya kendiliğinden işlenir.</Muted>}
      validate={(v) => {
        const n = num(v.amount);
        return Number.isFinite(n) && n > 0 ? null : "Sıfırdan büyük bir tutar girin.";
      }}
      onSubmit={(v) => onSubmit({ entryType: v.entryType as TeamEntryType, amount: num(v.amount), description: s(v.description) })}
    />
  );
}
