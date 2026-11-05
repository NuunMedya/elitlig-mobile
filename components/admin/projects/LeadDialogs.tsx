/**
 * Kişi kapanış pencereleri (alt sayfa):
 *   WinSheet           satışı kapat → portföye ekle (+ isteğe bağlı gelir kaydı)
 *   CloseSupplierSheet tedarik görüşmesini tamamla → anlaşılan tutar gidere yazılır
 *   LostSheet          kaybedildi / vazgeçildi (+ neden)
 *   PriceSheet         tedarikte "Fiyat alındı": teklif tutarı kişiye ve geçmişe
 *   PriceCompare       aynı konudaki teklifler, ucuzdan pahalıya
 * Hesap listesi proje bütçesinin kayıt girilebilen hesaplarıdır (GET /:id/finance).
 */

import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChipsField, DateField, SegmentField, SelectField, ToggleField } from "@/components/admin";
import { Avatar, BottomSheet, Button, Input, Touchable } from "@/components/ui";
import { formatMoney } from "@/lib/admin/format";
import { LOST_REASONS, isoDate, kindOf, moneyText, parseAmount, prettyPhone, priceComparison, stageOf, stagesOf } from "@/lib/admin/projectUtils";
import { getProjectFinance, projectKeys, type EntryStatus, type Lead, type LeadOutcome } from "@/lib/api/admin/projects";
import { colors, radius, space, textScale, type } from "@/theme";

import { useProject } from "./ProjectContext";

/** Proje bütçesinin hesapları (kayıt girilebilenler). */
export function useProjectAccounts(enabled = true) {
  const { id } = useProject();
  return useQuery({ queryKey: projectKeys.finance(id), queryFn: () => getProjectFinance(id), enabled });
}

function AccountField({ value, onChange, label = "Hesap" }: { value: number | null; onChange: (v: number | null) => void; label?: string }) {
  const fin = useProjectAccounts();
  const accounts = fin.data?.accounts || [];
  return (
    <SelectField<number>
      label={label}
      hint="ödenince bakiyeye işlenir"
      value={value}
      onChange={onChange}
      placeholder="Hesap seçilmedi"
      clearable
      valueLabel={value && !accounts.some((a) => a.id === value) ? `Proje hesabı (#${value})` : null}
      options={accounts.map((a) => ({ value: a.id, label: a.name, hint: a.balance != null ? formatMoney(a.balance) : null }))}
    />
  );
}

function Head({ lead, supplier }: { lead: Lead; supplier?: boolean }) {
  const name = supplier ? lead.company || lead.name : lead.name;
  const sub = supplier ? [lead.item, lead.company && lead.name, prettyPhone(lead.phone)] : [lead.company, prettyPhone(lead.phone)];
  return (
    <View style={styles.head}>
      <Avatar name={name} size={44} />
      <View style={styles.flex}>
        <Text style={styles.headName} {...textScale.dense}>{name}</Text>
        <Text style={styles.small} {...textScale.dense}>{sub.filter(Boolean).join(" · ")}</Text>
      </View>
    </View>
  );
}

/* --------------------------- satışı kapat → portföy --------------------------- */

export function WinSheet({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { ops, settings, notify } = useProject();
  const [category, setCategory] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [startDate, setStartDate] = useState<string | null>(isoDate());
  const [note, setNote] = useState("");
  const [entryOn, setEntryOn] = useState(false);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [entryStatus, setEntryStatus] = useState<"pending" | "paid">("pending");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!lead) return;
    setCategory(settings.portfolio_categories[0] || null);
    setValue(moneyText(lead.value));
    setStartDate(isoDate());
    setNote("");
    setEntryOn(lead.value != null);
    setAccountId(settings.default_account_id ?? null);
    setEntryStatus("pending");
    setDueDate(null);
  }, [lead]); // eslint-disable-line react-hooks/exhaustive-deps
  const amount = parseAmount(value);

  const submit = async () => {
    if (!lead) return;
    setBusy(true);
    const withEntry = entryOn && amount != null && amount > 0;
    const res = await ops.closeLead(lead.id, {
      portfolio: true,
      category: category || null,
      value: value === "" || amount == null || Number.isNaN(amount) ? null : amount,
      start_date: startDate || null,
      ...(note.trim() ? { note: note.trim() } : {}),
      entry: withEntry ? { amount: amount!, account_id: accountId, status: entryStatus, due_date: dueDate || null } : false,
    });
    setBusy(false);
    if (res) {
      const acc = res.entry?.account_name;
      notify(res.entry?.status === "paid" && acc ? `${lead.name} portföye eklendi · Hesaba işlendi: ${acc}` : `${lead.name} portföye eklendi${res.entry ? ` · gelir kaydı açıldı${acc ? ` (${acc})` : ""}` : ""}.`);
      onClose();
    }
  };

  return (
    <BottomSheet
      visible={lead != null}
      onClose={busy ? () => undefined : onClose}
      title="Satışı kapat → Portföye ekle"
      snap="full"
      footer={<Button label="Kazanıldı, portföye ekle" icon="trophy-outline" onPress={() => void submit()} loading={busy} haptic="success" />}
    >
      {lead ? (
        <View style={styles.body}>
          <Head lead={lead} />
          {settings.portfolio_categories.length ? (
            <ChipsField<string>
              label="Portföy kategorisi"
              value={category}
              onChange={(v) => setCategory(typeof v === "string" ? v : null)}
              options={settings.portfolio_categories.map((c) => ({ key: c, label: c }))}
            />
          ) : null}
          <Input label="Tutar (₺)" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="0" />
          <DateField label="Başlangıç" value={startDate} onChange={setStartDate} clearable />
          <Input label="Not" hint="boşsa kişinin notu" value={note} onChangeText={setNote} />
          <ToggleField label="Gelir kaydı aç" hint="proje bütçesine ve hesaba" value={entryOn} onChange={setEntryOn} />
          {entryOn ? (
            <View style={styles.box}>
              <AccountField value={accountId} onChange={setAccountId} />
              <SegmentField
                label="Durum"
                value={entryStatus}
                onChange={(v) => setEntryStatus(v as "pending" | "paid")}
                options={[{ key: "pending", label: "Bekliyor" }, { key: "paid", label: "Tahsil edildi" }]}
              />
              {entryStatus === "pending" ? <DateField label="Tahsil vadesi" value={dueDate} onChange={setDueDate} clearable /> : null}
              {!(amount && amount > 0) ? <Text style={styles.error} {...textScale.dense}>Gelir kaydı için tutar girin.</Text> : null}
            </View>
          ) : null}
          <Text style={styles.small} {...textScale.long}>
            Kişi "{stagesOf(settings, "customer").find((s) => s.won)?.label || "Kazanıldı"}" aşamasına alınır, sonraki aksiyonu temizlenir ve portföyde ayrı bir kayıt açılır.
          </Text>
        </View>
      ) : <View />}
    </BottomSheet>
  );
}

/* ------------------------- tedarik: tamamla → gider ------------------------- */

export function CloseSupplierSheet({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { data, ops, settings, notify } = useProject();
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [status, setStatus] = useState<"pending" | "paid">("pending");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [portfolio, setPortfolio] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!lead) return;
    setAmount(moneyText(lead.value));
    setAccountId(settings.default_account_id ?? null);
    setStatus("pending");
    setDueDate(null);
    setCategory(lead.source || "");
    setDescription(`${lead.item || "Tedarik"} — ${lead.company || lead.name}`);
    setPortfolio(false);
  }, [lead]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = parseAmount(amount);
  const valid = value != null && value > 0;
  const quotes = lead ? priceComparison(data.leads, lead) : [];
  const best = quotes[0];
  const cats = [...new Set([...(settings.finance_categories || []), ...(settings.supplier_categories || [])])];

  const submit = async () => {
    if (!lead || !valid) return;
    setBusy(true);
    const res = await ops.closeLead(lead.id, {
      value,
      portfolio,
      entry: {
        amount: value!,
        account_id: accountId,
        status: status as EntryStatus,
        due_date: status === "pending" ? dueDate || null : null,
        category: category.trim() || null,
        description: description.trim() || null,
      },
    });
    setBusy(false);
    if (res) {
      const acc = res.entry?.account_name;
      notify(status === "paid" && acc ? `Hesaba işlendi: ${acc} (−${formatMoney(value)})` : `Gidere yazıldı: ${formatMoney(value)}${acc ? ` · ${acc}` : ""}${status === "pending" ? " (ödeme bekliyor)" : ""}`);
      onClose();
    }
  };

  return (
    <BottomSheet
      visible={lead != null}
      onClose={busy ? () => undefined : onClose}
      title="İşlemi tamamla → Gidere yaz"
      snap="full"
      footer={<Button label="Anlaşıldı, gidere yaz" icon="receipt-outline" onPress={() => void submit()} loading={busy} disabled={!valid} haptic="success" />}
    >
      {lead ? (
        <View style={styles.body}>
          <Head lead={lead} supplier />
          {best && best.id !== lead.id ? (
            <Text style={styles.hint} {...textScale.long}>Bu konudaki en uygun teklif: {best.company || best.name} · {formatMoney(best.value)}</Text>
          ) : null}
          <Input label="Anlaşılan tutar (₺)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
          <AccountField value={accountId} onChange={setAccountId} />
          <SegmentField label="Durum" value={status} onChange={(v) => setStatus(v as "pending" | "paid")} options={[{ key: "pending", label: "Bekliyor" }, { key: "paid", label: "Ödendi" }]} />
          {status === "pending" ? <DateField label="Ödeme vadesi" value={dueDate} onChange={setDueDate} clearable /> : null}
          <Input label="Gider kategorisi" value={category} onChangeText={setCategory} placeholder="Ör. Ödül" />
          {cats.length ? (
            <ChipsField<string> value={cats.includes(category) ? category : null} onChange={(v) => setCategory(typeof v === "string" ? v : "")} options={cats.map((c) => ({ key: c, label: c }))} />
          ) : null}
          <Input label="Açıklama" value={description} onChangeText={setDescription} maxLength={255} />
          <ToggleField label="Tedarikçiyi portföye de ekle" value={portfolio} onChange={setPortfolio} />
          <Text style={styles.small} {...textScale.long}>
            Görüşme "{stagesOf(settings, "supplier").find((s) => s.won)?.label || "Anlaşıldı"}" aşamasına alınır; tutar projenin Bütçe sekmesine gider olarak yazılır{status === "paid" ? " ve seçilen hesabın bakiyesinden düşer" : ""}.
          </Text>
        </View>
      ) : <View />}
    </BottomSheet>
  );
}

/* --------------------------------- kaybedildi --------------------------------- */

export function LostSheet({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { ops, settings, notify } = useProject();
  const kind = kindOf(lead);
  const supplier = kind === "supplier";
  const lost = stagesOf(settings, kind).filter((s) => s.lost);
  const [stage, setStage] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!lead) return;
    setStage(lost[0]?.key || "");
    setReason("");
  }, [lead]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!lead || !stage) return;
    setBusy(true);
    const item = await ops.saveLead(lead.id, { stage, lost_reason: reason.trim() || null } as Partial<Lead>);
    setBusy(false);
    if (item) {
      notify(supplier ? `${lead.company || lead.name}: vazgeçildi.` : `${lead.name} kaybedildi olarak işaretlendi.`);
      onClose();
    }
  };
  return (
    <BottomSheet
      visible={lead != null}
      onClose={busy ? () => undefined : onClose}
      title={supplier ? "Tedarikçiden vazgeç" : "Kaybedildi olarak işaretle"}
      snap="content"
      footer={<Button label={supplier ? "Vazgeçildi" : "Kaybedildi"} variant="danger" onPress={() => void submit()} loading={busy} disabled={!stage} />}
    >
      <View style={styles.body}>
        {!lost.length ? <Text style={styles.error} {...textScale.long}>Ayarlar'da "kaybedildi" olarak işaretli bir aşama yok.</Text> : null}
        {lost.length > 1 ? (
          <ChipsField<string> label="Aşama" value={stage} onChange={(v) => { if (typeof v === "string") setStage(v); }} options={lost.map((s) => ({ key: s.key, label: s.label }))} />
        ) : null}
        <Input label="Neden?" hint="isteğe bağlı" value={reason} onChangeText={setReason} placeholder={supplier ? "Ör. Fiyat yüksek, teslim tarihi uymadı" : "Ör. Bütçesi yok, başka ligde"} />
        <ChipsField<string>
          value={LOST_REASONS[kind].includes(reason) ? reason : null}
          onChange={(v) => setReason(typeof v === "string" ? v : "")}
          options={LOST_REASONS[kind].map((r) => ({ key: r, label: r }))}
        />
      </View>
    </BottomSheet>
  );
}

/* ------------------------------ fiyat alındı ------------------------------ */

export function PriceSheet({
  lead,
  outcome,
  activityType,
  stepId,
  onClose,
}: {
  lead: Lead;
  outcome: LeadOutcome | null;
  activityType: string;
  stepId?: number | null;
  onClose: () => void;
}) {
  const { ops, notify } = useProject();
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (outcome) {
      setPrice(moneyText(lead.value));
      setNote("");
    }
  }, [outcome]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = parseAmount(price);
  const valid = value != null && value > 0;
  const submit = async () => {
    if (!outcome || !valid) return;
    setBusy(true);
    const res = await ops.logActivity({
      lead_id: lead.id,
      ...(stepId ? { step_id: stepId } : {}),
      type: activityType,
      outcome: outcome.key,
      note: note.trim() || `Teklif: ${formatMoney(value)}`,
      value,
    });
    setBusy(false);
    if (res) {
      notify(`${outcome.label}: ${formatMoney(value)}`);
      onClose();
    }
  };
  return (
    <BottomSheet
      visible={outcome != null}
      onClose={busy ? () => undefined : onClose}
      title={outcome ? `${outcome.label} — ${lead.company || lead.name}` : undefined}
      snap="content"
      footer={<Button label="Kaydet" onPress={() => void submit()} loading={busy} disabled={!valid} />}
    >
      <View style={styles.body}>
        <Input label="Alınan fiyat / teklif (₺)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0,00" />
        <Input label="Not" hint="isteğe bağlı" value={note} onChangeText={setNote} placeholder="Ör. KDV dahil, 10 gün teslim" />
      </View>
    </BottomSheet>
  );
}

/* ---------------------------- teklif karşılaştırma ---------------------------- */

export function PriceCompare({ lead, onOpen }: { lead: Lead; onOpen?: (id: number) => void }) {
  const { data, settings } = useProject();
  if (!lead.item) {
    return <Text style={styles.small} {...textScale.long}>Tedarik konusunu (ör. "Kupa / madalya") yazın; aynı konudaki teklifler burada karşılaştırılır.</Text>;
  }
  const quotes = priceComparison(data.leads, lead);
  const key = lead.item.trim().toLocaleLowerCase("tr-TR");
  const asked = data.leads.filter((l) => kindOf(l) === "supplier" && l.item && l.item.trim().toLocaleLowerCase("tr-TR") === key && l.value == null);
  if (!quotes.length) return <Text style={styles.small} {...textScale.long}>"{lead.item}" için henüz teklif yok. "Fiyat alındı" ile teklif tutarını girin.</Text>;
  const min = Number(quotes[0].value);
  return (
    <View style={styles.quotes}>
      {quotes.map((q, i) => {
        const st = stageOf(settings, q.stage, "supplier");
        const diff = Number(q.value) - min;
        const current = q.id === lead.id;
        return (
          <Touchable
            key={q.id}
            disabled={current}
            onPress={() => onOpen?.(q.id)}
            style={[styles.quote, i === 0 ? styles.quoteBest : null, current ? styles.quoteCurrent : null]}
            accessibilityRole="button"
          >
            <Text style={styles.rank} {...textScale.badge}>{i + 1}</Text>
            <View style={styles.flex}>
              <Text style={styles.qName} numberOfLines={1} {...textScale.dense}>{q.company || q.name}</Text>
              <Text style={[styles.tiny, { color: st.color }]} {...textScale.badge}>{st.label}{current ? " · bu görüşme" : ""}</Text>
            </View>
            <View style={styles.qPrice}>
              <Text style={styles.qValue} {...textScale.dense}>{formatMoney(q.value)}</Text>
              <Text style={[styles.tiny, i === 0 ? styles.bestText : null]} {...textScale.badge}>
                {i === 0 ? "En uygun" : `+${formatMoney(diff)} · %${min ? Math.round((diff / min) * 100) : 0}`}
              </Text>
            </View>
          </Touchable>
        );
      })}
      {asked.length ? <Text style={styles.small} {...textScale.long}>{asked.length} tedarikçiden fiyat bekleniyor: {asked.map((l) => l.company || l.name).join(", ")}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingBottom: space.md },
  flex: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  headName: { ...type.label, color: colors.textPrimary },
  small: { ...type.bodySm, color: colors.textTertiary },
  tiny: { ...type.meta, color: colors.textTertiary },
  hint: { ...type.bodySm, color: colors.accentText, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.accentDim },
  error: { ...type.bodySm, color: colors.danger },
  box: { gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  quotes: { gap: space.xs },
  quote: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  quoteBest: { backgroundColor: colors.winDim },
  quoteCurrent: { borderWidth: 1, borderColor: colors.brandBorder },
  rank: { ...type.labelXs, color: colors.textSecondary, width: 18, textAlign: "center" },
  qName: { ...type.label, color: colors.textPrimary },
  qPrice: { alignItems: "flex-end" },
  qValue: { ...type.tableNumStrong, color: colors.textPrimary },
  bestText: { color: colors.win },
});
