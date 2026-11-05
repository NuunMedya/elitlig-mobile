/**
 * Maç Muhasebesi yardımcı pencereleri.
 *
 *   GeneralEntrySheet — maça bağlı olmayan kayıt (gün sonu kalemi, kira,
 *                       ekipman, sponsor): yeni kayıtta hızlı şablonlar; mevcut
 *                       kayıtta web gibi tarih, başlık, tutar, yöntem, not.
 *   StatementSheet    — takım ekstresi / personel ödeme dökümü: toplamlar,
 *                       satırlar, "kalanı tahsil edildi/ödendi yap", WhatsApp
 *                       için metni paylaş ya da panoya kopyala.
 */

import * as Clipboard from "expo-clipboard";
import React from "react";
import { StyleSheet, View } from "react-native";

import { RecordCard, StatRow, type FieldDef, type FormValues } from "@/components/admin";
import { BottomSheet, Button, useToast } from "@/components/ui";
import {
  GENERAL_TEMPLATES,
  ageInDays,
  amountInput,
  money,
  parseAmount,
  shortDay,
  statementText,
  todayKey,
  type AccCategory,
  type AccEntry,
  type AccEntryBody,
  type AccMatch,
  type AccStaff,
  type StatementRow,
} from "@/lib/api/admin/accounting";
import { space } from "@/theme";

import { EditorSheet } from "../EditorSheet";
import { Muted, Note, SuggestChips } from "../parts";
import { shareText } from "../share";

const s = (v: unknown) => (v == null ? "" : String(v));

export function GeneralEntrySheet({
  visible,
  onClose,
  entry,
  date,
  categories,
  paymentMethods,
  seasons,
  staff,
  onCreate,
  onUpdate,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  /** Düzenlenen kayıt; yoksa yeni. */
  entry?: AccEntry | null;
  /** Yeni kaydın varsayılan günü (defterde gün sonu kalemi). */
  date?: string;
  categories: AccCategory[];
  paymentMethods: { key: string; label: string }[];
  seasons: { id: number; name: string; league: string }[];
  staff: AccStaff[];
  onCreate: (body: AccEntryBody) => Promise<boolean>;
  onUpdate: (id: number, body: Partial<AccEntryBody>) => Promise<boolean>;
  onDelete?: (entry: AccEntry) => void;
}) {
  const editing = Boolean(entry);
  const initial: FormValues = entry
    ? { date: entry.date, title: entry.title || "", amount: amountInput(entry.amount), note: entry.note || "", paymentMethod: entry.paymentMethod || "" }
    : { date: date || todayKey(), category: "diger", title: "", amount: "", status: "pending", paymentMethod: "", seasonId: "", staffId: "", note: "" };
  const fields = (v: FormValues): FieldDef[] => {
    const category = categories.find((c) => c.key === v.category);
    if (editing) {
      return [
        { key: "date", label: "Tarih", kind: "date", required: true },
        { key: "title", label: "Başlık", kind: "text" },
        { key: "amount", label: "Tutar (₺)", kind: "money", required: true },
        { key: "paymentMethod", label: "Ödeme yöntemi", kind: "select", clearable: true, options: paymentMethods.map((m) => ({ value: m.key, label: m.label })) },
        { key: "note", label: "Not", kind: "text" },
      ];
    }
    return [
      { key: "date", label: "Tarih", kind: "date", required: true },
      { key: "category", label: "Kalem", kind: "select", required: true, options: categories.map((c) => ({ value: c.key, label: `${c.direction === "income" ? "Gelir" : "Gider"} · ${c.label}` })), onChange: () => ({ staffId: "" }) },
      { key: "title", label: "Başlık", kind: "text", placeholder: "Ör. ulaşım, su, ekipman" },
      { key: "amount", label: "Tutar (₺)", kind: "money", required: true },
      { key: "status", label: "Durum", kind: "segment", options: [{ value: "pending", label: "Bekliyor" }, { value: "paid", label: "Ödendi / tahsil edildi" }] },
      { key: "paymentMethod", label: "Ödeme yöntemi", kind: "select", clearable: true, options: paymentMethods.map((m) => ({ value: m.key, label: m.label })) },
      { key: "seasonId", label: "Sezon", kind: "select", clearable: true, placeholder: "Sezonsuz (genel)", hidden: () => !seasons.length, options: seasons.map((x) => ({ value: String(x.id), label: `${x.league} · ${x.name}` })) },
      { key: "staffId", label: "Personel (isteğe bağlı)", kind: "select", clearable: true, hidden: () => category?.direction !== "expense" || !staff.length, options: staff.map((p) => ({ value: String(p.id), label: p.fullName })) },
      { key: "note", label: "Not", kind: "text" },
    ];
  };
  return (
    <EditorSheet
      visible={visible}
      onClose={onClose}
      title={editing ? "Kaydı düzenle" : "Genel gelir / gider kaydı"}
      initial={initial}
      fields={fields}
      header={
        editing
          ? undefined
          : (v, set) => (
              <SuggestChips
                label="Hızlı şablon"
                items={GENERAL_TEMPLATES.map((t) => t.title)}
                value={s(v.title)}
                onPick={(title) => {
                  const t = GENERAL_TEMPLATES.find((x) => x.title === title);
                  if (t) set({ title: t.title, category: t.category });
                }}
              />
            )
      }
      secondary={editing && onDelete && entry ? { label: "Sil", danger: true, onPress: () => onDelete(entry) } : undefined}
      validate={(v) => {
        const a = parseAmount(v.amount);
        if (a == null || Number.isNaN(a)) return "Geçerli bir tutar girin.";
        return null;
      }}
      onSubmit={async (v) => {
        const amount = parseAmount(v.amount) as number;
        const ok = editing && entry
          ? await onUpdate(entry.id, { date: s(v.date), title: s(v.title), amount, note: s(v.note), paymentMethod: s(v.paymentMethod) || null })
          : await onCreate({
              date: s(v.date),
              category: s(v.category),
              title: s(v.title),
              amount,
              status: s(v.status) || "pending",
              paymentMethod: s(v.paymentMethod) || null,
              seasonId: v.seasonId ? Number(v.seasonId) : null,
              staffId: v.staffId ? Number(v.staffId) : null,
              note: s(v.note) || null,
            });
        if (!ok) throw new Error("Kayıt kaydedilemedi.");
      }}
    />
  );
}

export function StatementSheet({
  visible,
  onClose,
  kind,
  name,
  rangeText,
  rows,
  canManage,
  onMarkPaid,
  onOpenMatch,
}: {
  visible: boolean;
  onClose: () => void;
  kind: "team" | "staff";
  name: string;
  rangeText: string;
  rows: StatementRow[];
  canManage: boolean;
  onMarkPaid: (ids: number[], message: string) => void;
  onOpenMatch: (match: AccMatch) => void;
}) {
  const toast = useToast();
  const isTeam = kind === "team";
  const billed = rows.reduce((n, r) => n + (r.amount || 0), 0);
  const settled = rows.filter((r) => r.status === "paid").reduce((n, r) => n + (r.amount || 0), 0);
  const open = billed - settled;
  const pendingIds = rows.filter((r) => r.status === "pending" && r.entryId).map((r) => r.entryId as number);
  const missing = rows.filter((r) => r.amount == null).length;
  const oldest = rows.filter((r) => r.status === "pending").map((r) => r.date).sort()[0];
  const labels = isTeam
    ? { title: "Takım ekstresi", billed: "Toplam ücret", settled: "Tahsil edilen", open: "Kalan borç", paid: "Tahsil edildi", action: "Kalanı tahsil edildi yap" }
    : { title: "Personel ödeme dökümü", billed: "Toplam hak ediş", settled: "Ödenen", open: "Kalan ödeme", paid: "Ödendi", action: "Kalanı ödendi yap" };
  const text = () =>
    statementText({
      title: `${name} · ${labels.title}`,
      subtitle: rangeText,
      rows,
      totals: [
        [labels.billed, money(billed)],
        [labels.settled, money(settled)],
        [labels.open, money(open)],
      ],
    }) + "\n\nELİTLİG";

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`${name} · ${labels.title}`}
      snap="full"
      footer={
        <View style={styles.footer}>
          <Button label="Paylaş" icon="share-social-outline" variant="secondary" onPress={() => void shareText(name, text())} />
          <Button
            label="Kopyala"
            icon="copy-outline"
            variant="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(text());
              toast.show({ message: "Ekstre panoya kopyalandı; WhatsApp'a yapıştırabilirsiniz.", tone: "success" });
            }}
          />
          {canManage && pendingIds.length ? (
            <Button label={labels.action} onPress={() => onMarkPaid(pendingIds, `${name}: ${money(open)} ${isTeam ? "tahsil edildi" : "ödendi"} olarak işaretlensin mi?`)} style={styles.flex} />
          ) : null}
        </View>
      }
    >
      <View style={styles.body}>
        <Muted>{rangeText}</Muted>
        <StatRow
          items={[
            { label: labels.billed, value: money(billed) },
            { label: labels.settled, value: money(settled), tone: "win" },
            { label: oldest ? `${labels.open} · en eski ${ageInDays(oldest)} gün` : labels.open, value: money(open), tone: open > 0 ? "danger" : undefined },
          ]}
        />
        {missing ? <Note tone="warn" text={`${missing} maçta ücret girilmemiş; toplamlara dahil değil.`} /> : null}
        {!rows.length ? <Muted>Bu dönemde kayıt yok.</Muted> : null}
        {rows.map((r) => (
          <RecordCard
            key={r.key}
            title={r.label}
            subtitle={r.detail || null}
            meta={shortDay(r.date)}
            icon={isTeam ? "shield-outline" : "person-outline"}
            value={r.amount == null ? "—" : money(r.amount)}
            badges={[
              r.amount == null
                ? { label: "Ücret yok", tone: "neutral" }
                : r.status === "paid"
                  ? { label: labels.paid, tone: "win" }
                  : { label: "Bekliyor", tone: "warn" },
            ]}
            onPress={r.match ? () => onOpenMatch(r.match as AccMatch) : undefined}
          />
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  flex: { flex: 1 },
  body: { gap: space.sm },
});
