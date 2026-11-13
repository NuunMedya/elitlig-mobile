/**
 * DÜZENLİ ÖDEMELER — web Ön Muhasebe → Düzenli Ödemeler'in telefon özü.
 *
 * NE: fatura, kira, maaş, abonelik, taksit gibi tekrar eden kalemler bir kez
 * tanımlanır; her dönem burada "Ödendi" (ya da gelirse "Tahsil edildi") diye
 * tek dokunuşla Ön Muhasebe'ye işlenir. Gecikenler en üstte, sonra bu ayın
 * dönemleri, en altta tanımlar.
 *
 * Tutarı değişken kalemlerde (elektrik faturası gibi) işlemeden önce gerçek
 * tutar sorulur. "Atla" o dönemi kayıt açmadan kapatır; geri alınabilir.
 * Tanım silmek geri alınamaz, onay ister; daha önce işlenmiş kayıtlar
 * Ön Muhasebe'de kalır.
 */

import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, confirmAction, useAdminMutation, type FormValues } from "@/components/admin";
import { LineRow, Lines, StageChip, ToolStage } from "@/components/admin/tools/ToolKit";
import { Button, EmptyState, SectionHeader, Skeleton, SkeletonCard, type IconTileTone } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import {
  LEDGER_METHODS,
  RECURRING_FREQUENCIES,
  RECURRING_KINDS,
  amountInput,
  createRecurring,
  getRecurring,
  money,
  parseAmount,
  postRecurringOccurrence,
  removeRecurring,
  skipRecurringOccurrence,
  todayKey,
  updateRecurring,
  type RecurringBody,
  type RecurringFrequency,
  type RecurringItem,
  type RecurringKind,
  type RecurringOccurrence,
} from "@/lib/api/admin/accounting";
import { colors, radius, space, textScale, type } from "@/theme";

import { EditorSheet } from "./EditorSheet";
import { Muted, Note } from "./parts";

const KEY = ["admin", "ledger", "recurring"] as const;
const INVALIDATE = [["admin", "ledger"], ["admin", "finance"]];
const s = (v: unknown) => (v == null ? "" : String(v));

const STATUS: Record<RecurringOccurrence["status"], { label: string; tone: "win" | "warn" | "danger" | "neutral" | "info" }> = {
  paid: { label: "İşlendi", tone: "win" },
  accrued: { label: "Bekliyor", tone: "warn" },
  skipped: { label: "Atlandı", tone: "neutral" },
  untracked: { label: "Takip dışı", tone: "neutral" },
  overdue: { label: "Gecikti", tone: "danger" },
  due_soon: { label: "Yaklaşıyor", tone: "warn" },
  upcoming: { label: "Sırada", tone: "info" },
};

const dayText = (o: RecurringOccurrence) =>
  o.days < 0 ? `${-o.days} gün geçti` : o.days === 0 ? "Bugün" : o.days === 1 ? "Yarın" : `${o.days} gün kaldı`;

const blank = (): FormValues => ({ type: "expense", kind: "bill", name: "", amount: "", variable_amount: false, frequency: "monthly", start_date: todayKey(), method: "bank", party: "", note: "" });

export function RecurringTab() {
  const query = useQuery({ queryKey: [...KEY], queryFn: () => getRecurring() });
  const [menu, setMenu] = useState<RecurringOccurrence | null>(null);
  const [amountFor, setAmountFor] = useState<RecurringOccurrence | null>(null);
  const [editor, setEditor] = useState<{ item?: RecurringItem; nonce: number } | null>(null);

  const post = useAdminMutation(
    (v: { o: RecurringOccurrence; amount?: number; status: "paid" | "pending" }) => postRecurringOccurrence(v.o.recurring_id, { period: v.o.period, amount: v.amount, status: v.status }),
    {
      success: (_r, v) => (v.status === "pending" ? `${v.o.name} bekleyen kayıt olarak yazıldı.` : `${v.o.name} ${v.o.type === "income" ? "tahsil edildi" : "ödendi"} olarak Ön Muhasebe'ye işlendi.`),
      invalidate: INVALIDATE,
    }
  );
  const skip = useAdminMutation((v: { o: RecurringOccurrence; undo?: boolean }) => skipRecurringOccurrence(v.o.recurring_id, { period: v.o.period, undo: v.undo }), {
    success: (_r, v) => (v.undo ? "Dönem yeniden açıldı." : `${v.o.period_label} dönemi atlandı.`),
    invalidate: INVALIDATE,
  });
  const save = useAdminMutation((v: { body: RecurringBody; id?: number }) => (v.id ? updateRecurring(v.id, v.body) : createRecurring(v.body)), {
    success: (_r, v) => (v.id ? "Düzenli ödeme güncellendi." : "Düzenli ödeme eklendi."),
    invalidate: INVALIDATE,
    silentError: true,
  });
  const remove = useAdminMutation((item: RecurringItem) => removeRecurring(item.id), { success: "Düzenli ödeme silindi.", invalidate: INVALIDATE });

  const pay = (o: RecurringOccurrence) => {
    // Değişken tutarlı kalemde (ya da tutar girilmemişse) gerçek tutar sorulur.
    if (o.variable_amount || !(o.amount > 0)) setAmountFor(o);
    else post.mutate({ o, status: "paid" });
  };
  const askRemove = async (item: RecurringItem) => {
    if (await confirmAction({ title: "Düzenli ödeme silinsin mi?", message: `"${item.name}" tanımı silinir. Daha önce işlenen kayıtlar Ön Muhasebe'de kalır.`, confirmLabel: "Sil", destructive: true })) {
      remove.mutate(item);
      setEditor(null);
    }
  };

  if (query.isLoading)
    return (
      <View style={styles.stack}>
        <Skeleton height={150} radius="xl" />
        <SkeletonCard />
      </View>
    );
  if (query.error) return <Note tone="danger" text={errorText(query.error)} action={{ label: "Tekrar dene", onPress: () => void query.refetch() }} />;

  const data = query.data;
  const items = data?.items || [];
  const open = (o: RecurringOccurrence) => ["overdue", "due_soon", "upcoming"].includes(o.status);
  const month = data?.occurrences || [];
  const lateEarlier = (data?.overdue || []).filter((o) => !month.some((m) => m.key === o.key));
  const summary = data?.summary;
  const paidRatio = summary && summary.expected_expense > 0 ? summary.paid_expense / summary.expected_expense : 0;

  const row = (o: RecurringOccurrence) => {
    const status = o.late && o.status === "accrued" ? { label: "Vadesi geçti", tone: "danger" as const } : { label: STATUS[o.status].label, tone: o.late ? ("danger" as const) : STATUS[o.status].tone };
    return (
      <LineRow
        key={o.key}
        leading={<DueStamp date={o.due_date} tone={o.late ? "danger" : o.status === "paid" ? "win" : o.status === "due_soon" ? "warn" : "neutral"} />}
        title={o.name}
        sub={[o.period_label, o.party].filter(Boolean).join(" · ")}
        meta={open(o) || o.status === "accrued" ? dayText(o) : `Vade ${formatDate(o.due_date)}`}
        metaIcon="time-outline"
        value={`${o.type === "income" ? "+" : "−"}${o.estimated ? "~" : ""}${money(o.amount)}`}
        valueTone={o.type === "income" ? "win" : "danger"}
        badge={status}
        stripe={o.late ? colors.danger : null}
        muted={o.status === "skipped" || o.status === "untracked"}
        onPress={() => setMenu(o)}
        onLongPress={() => setMenu(o)}
      >
        {open(o) ? (
          <View style={styles.inline}>
            <Button
              label={o.type === "income" ? "Tahsil edildi" : "Ödendi"}
              icon="checkmark"
              size="sm"
              variant="secondary"
              loading={post.isPending && post.variables?.o.key === o.key}
              onPress={() => pay(o)}
            />
          </View>
        ) : null}
      </LineRow>
    );
  };

  return (
    <>
      {summary && items.length ? (
        <ToolStage
          icon="repeat"
          tone="mint"
          overline="Bu ay beklenen gider"
          value={money(summary.expected_expense)}
          caption={summary.overdue_count ? `${summary.overdue_count} dönem gecikti — en üstte listelenir.` : "Geciken dönem yok."}
          chips={summary.overdue_count ? <StageChip label={`${summary.overdue_count} geciken`} icon="alert-circle" tone="danger" /> : <StageChip label="Zamanında" icon="checkmark-circle" tone="win" />}
          stats={[
            { label: "Ödenen", value: money(summary.paid_expense), tone: "win" },
            { label: "Kalan", value: money(summary.remaining_expense), tone: summary.remaining_expense ? "warn" : undefined },
            { label: "Tamam", value: `%${Math.round(paidRatio * 100)}`, tone: "accent" },
          ]}
        />
      ) : null}

      {lateEarlier.length ? (
        <View style={styles.section}>
          <SectionHeader title="Önceki aylardan geciken" meta={String(lateEarlier.length)} inset="flush" icon="alert-circle-outline" iconTone="red" />
          <Lines>{lateEarlier.map(row)}</Lines>
        </View>
      ) : null}

      {month.length ? (
        <View style={styles.section}>
          <SectionHeader title="Bu ayın dönemleri" meta={String(month.length)} inset="flush" icon="calendar-outline" iconTone="cyan" />
          <Lines>{month.map(row)}</Lines>
        </View>
      ) : items.length ? (
        <Muted>Bu ay vadesi gelen düzenli ödeme yok.</Muted>
      ) : null}

      {items.length ? (
        <View style={styles.section}>
          <SectionHeader
            title="Tanımlar"
            meta={String(items.length)}
            inset="flush"
            icon="repeat-outline"
            iconTone="violet"
            action={{ label: "Ekle", onPress: () => setEditor({ nonce: Date.now() }) }}
          />
          <Lines>
            {items.map((item) => (
              <LineRow
                key={item.id}
                icon={KIND_ICON[item.kind] ?? "repeat-outline"}
                tone={item.type === "income" ? "mint" : KIND_TONE[item.kind] ?? "violet"}
                title={item.name}
                sub={[item.kind_label, RECURRING_FREQUENCIES.find((f) => f.key === item.frequency)?.label, item.party].filter(Boolean).join(" · ")}
                meta={item.next_due ? `Sıradaki vade ${formatDate(item.next_due.due_date)}` : item.active ? "Sıradaki dönem yok" : "Durduruldu"}
                metaIcon="calendar-outline"
                value={`${item.variable_amount ? "~" : ""}${money(item.amount)}`}
                valueSub={item.variable_amount ? "değişken" : null}
                badge={item.active ? null : { label: "Pasif", tone: "neutral" }}
                muted={!item.active}
                chevron
                onPress={() => setEditor({ item, nonce: Date.now() })}
              />
            ))}
          </Lines>
        </View>
      ) : (
        <EmptyState
          icon="repeat-outline"
          title="Düzenli ödeme tanımlı değil"
          body="Fatura, kira, maaş ya da aboneliği bir kez tanımla; her dönem tek dokunuşla Ön Muhasebe'ye işle."
          action={{ label: "Düzenli ödeme ekle", onPress: () => setEditor({ nonce: Date.now() }) }}
          variant="inline"
        />
      )}

      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu ? `${menu.name} · ${menu.period_label}` : undefined}
        actions={
          menu
            ? [
                { label: menu.type === "income" ? "Tahsil edildi olarak işle" : "Ödendi olarak işle", icon: "checkmark-circle-outline", hidden: !open(menu), onPress: () => pay(menu) },
                { label: "Farklı tutarla işle", icon: "create-outline", hidden: !open(menu), onPress: () => setAmountFor(menu) },
                { label: "Bekleyen kayıt olarak yaz", icon: "hourglass-outline", hidden: !open(menu) || !(menu.amount > 0), onPress: () => post.mutate({ o: menu, status: "pending" }) },
                { label: "Bu dönemi atla", icon: "play-skip-forward-outline", hidden: !open(menu), onPress: () => skip.mutate({ o: menu }) },
                { label: "Atlamayı geri al", icon: "arrow-undo-outline", hidden: menu.status !== "skipped", onPress: () => skip.mutate({ o: menu, undo: true }) },
                {
                  label: "Tanımı düzenle",
                  icon: "settings-outline",
                  hidden: !items.some((i) => i.id === menu.recurring_id),
                  onPress: () => setEditor({ item: items.find((i) => i.id === menu.recurring_id), nonce: Date.now() }),
                },
              ]
            : []
        }
      />

      {amountFor ? (
        <EditorSheet
          key={amountFor.key}
          visible
          onClose={() => setAmountFor(null)}
          title={`${amountFor.name} · ${amountFor.period_label}`}
          intro="Bu dönemin gerçek tutarını yaz; kayıt bugünün tarihiyle Ön Muhasebe'ye işlenir."
          initial={{ amount: amountFor.amount > 0 ? amountInput(amountFor.amount) : "" }}
          fields={[{ key: "amount", label: "Tutar (₺)", kind: "money", required: true }]}
          validate={(v) => {
            const n = parseAmount(v.amount);
            return n != null && Number.isFinite(n) && n > 0 ? null : "Sıfırdan büyük bir tutar yaz. Örnek: 1.250,50";
          }}
          submitLabel={amountFor.type === "income" ? "Tahsil edildi" : "Ödendi"}
          onSubmit={async (v) => {
            await post.mutateAsync({ o: amountFor, amount: parseAmount(v.amount) as number, status: "paid" });
            setAmountFor(null);
          }}
        />
      ) : null}

      {editor ? (
        <EditorSheet
          key={editor.nonce}
          visible
          onClose={() => setEditor(null)}
          title={editor.item ? "Düzenli ödemeyi düzenle" : "Düzenli ödeme ekle"}
          initial={
            editor.item
              ? {
                  type: editor.item.type,
                  kind: editor.item.kind,
                  name: editor.item.name,
                  amount: amountInput(editor.item.amount),
                  variable_amount: editor.item.variable_amount,
                  frequency: editor.item.frequency,
                  start_date: editor.item.start_date,
                  method: editor.item.method || "bank",
                  party: editor.item.party || "",
                  note: editor.item.note || "",
                  active: editor.item.active,
                }
              : blank()
          }
          fields={(v) => [
            { key: "type", label: "Tür", kind: "segment", options: [{ value: "expense", label: "Gider" }, { value: "income", label: "Gelir" }] },
            { key: "name", label: "Ad", kind: "text", required: true, maxLength: 120, placeholder: "Ör. Elektrik faturası" },
            { key: "kind", label: "Kalem", kind: "select", options: RECURRING_KINDS.map((k) => ({ value: k.key, label: k.label })) },
            { key: "amount", label: v.variable_amount ? "Tahmini tutar (₺)" : "Tutar (₺)", kind: "money", required: !v.variable_amount },
            { key: "variable_amount", label: "Tutar her dönem değişir", kind: "toggle", hint: "Açıksa işlerken gerçek tutar sorulur." },
            { key: "frequency", label: "Sıklık", kind: "select", options: RECURRING_FREQUENCIES.map((f) => ({ value: f.key, label: f.label })) },
            { key: "start_date", label: "İlk vade tarihi", kind: "date", required: true },
            { key: "method", label: "Ödeme yöntemi", kind: "select", options: LEDGER_METHODS.map((m) => ({ value: m.key, label: m.label })) },
            { key: "party", label: "Cari (kişi / firma)", kind: "text", maxLength: 120 },
            { key: "note", label: "Not", kind: "multiline", maxLength: 500 },
            ...(editor.item ? [{ key: "active", label: "Etkin", kind: "toggle" as const, hint: "Kapatılırsa yeni dönem üretilmez." }] : []),
          ]}
          validate={(v) => {
            const n = parseAmount(v.amount);
            if (n != null && !Number.isFinite(n)) return "Tutar geçersiz. Örnek: 1.250,50";
            if (!v.variable_amount && !((n ?? 0) > 0)) return "Sıfırdan büyük bir tutar yaz.";
            return null;
          }}
          secondary={editor.item ? { label: "Sil", danger: true, onPress: () => void askRemove(editor.item!) } : undefined}
          onSubmit={async (v) => {
            await save.mutateAsync({
              id: editor.item?.id,
              body: {
                type: v.type === "income" ? "income" : "expense",
                kind: s(v.kind) as RecurringKind,
                name: s(v.name).trim(),
                amount: parseAmount(v.amount) ?? 0,
                variable_amount: Boolean(v.variable_amount),
                frequency: s(v.frequency) as RecurringFrequency,
                start_date: s(v.start_date).slice(0, 10),
                method: s(v.method) || "bank",
                party: s(v.party).trim(),
                note: s(v.note),
                ...(editor.item ? { active: v.active !== false } : {}),
              },
            });
            setEditor(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Kalem türü → ikon ve karo tonu. */
const KIND_ICON: Partial<Record<RecurringKind, keyof typeof Ionicons.glyphMap>> = {
  bill: "receipt-outline",
  salary: "person-outline",
  rent: "home-outline",
  subscription: "card-outline",
  loan: "layers-outline",
  tax: "document-text-outline",
  insurance: "shield-checkmark-outline",
  income: "arrow-down-outline",
  other: "ellipsis-horizontal",
};
const KIND_TONE: Partial<Record<RecurringKind, IconTileTone>> = {
  bill: "cyan",
  salary: "violet",
  rent: "pink",
  subscription: "gold",
  loan: "red",
  tax: "neutral",
  insurance: "mint",
};

/** Vade pulu: gün rakamı (Archivo) + kısa ay; ton vade durumunu söyler. */
function DueStamp({ date, tone }: { date: string; tone: "danger" | "warn" | "win" | "neutral" }) {
  const d = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  const valid = !Number.isNaN(d.getTime());
  const fg = tone === "danger" ? colors.danger : tone === "warn" ? colors.warn : tone === "win" ? colors.win : colors.textPrimary;
  const bg = tone === "danger" ? colors.dangerDim : tone === "warn" ? colors.warnDim : tone === "win" ? colors.winDim : colors.surface2;
  return (
    <View style={[styles.stamp, { backgroundColor: bg }]}>
      <Text style={[styles.stampDay, { color: fg }]} {...textScale.badge}>
        {valid ? d.getDate() : "–"}
      </Text>
      <Text style={styles.stampMon} {...textScale.badge}>
        {valid ? d.toLocaleDateString("tr-TR", { month: "short" }).toLocaleUpperCase("tr-TR") : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  section: { gap: space.sm },
  inline: { flexDirection: "row", marginTop: space.xs },
  stamp: { width: 40, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  stampDay: { ...type.scoreXs },
  stampMon: { ...type.nano, color: colors.textTertiary },
});
