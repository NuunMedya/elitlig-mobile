/**
 * Türkiye Geneli Muhasebe parçaları — web nationalAccounting/
 * NationalDialogs.js (EntryDialog, RateDialog) ve CityDetail.js.
 *
 *   NaEntrySheet — tahsilat (il, tarih, yöntem, tutar), ek kalem (il, ay,
 *                  sezon, açıklama, eksi = indirim) ve tutar düzeltme
 *                  (il + ay + sezon satırı sabit, hesaplanan gösterilir)
 *   NaRateSheet  — maç başı ücret: genel / il / il + sezon, geçerli ilk ay
 *   CityDetail   — il hesabı: özet, ay ay hesap (açılınca sezon satırları,
 *                  kalemler ve tahsilatlar), sezon/lig bazında, il tarifeleri
 *
 * Ay seçimi (web <input type=month>) son beş yıl + gelecek yılın aylarından
 * seçilen bir listeyle yapılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SelectField, type FieldDef } from "@/components/admin";
import { LineRow, Lines, StageChip, ToolStage } from "@/components/admin/tools/ToolKit";
import { GradientBar, SectionHeader, Touchable } from "@/components/ui";
import { formatDate } from "@/lib/admin/format";
import {
  RATE_SCOPES,
  balanceTone,
  currentPeriod,
  monthLabel,
  money,
  rateText,
  shiftPeriod,
  todayKey,
  type NaCity,
  type NaEntry,
  type NaEntryBody,
  type NaLine,
  type NaOptions,
  type NaRate,
  type NaRateBody,
  parseAmount,
} from "@/lib/api/admin/accounting";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { EditorSheet } from "./EditorSheet";
import { Muted, Note } from "./parts";

const s = (v: unknown) => (v == null ? "" : String(v));

/** Ay seçenekleri: gelecek 12 ay → geçmiş 60 ay. */
export function monthOptions(extra?: string | null) {
  const now = currentPeriod();
  const list: { value: string; label: string }[] = [];
  for (let i = 12; i >= -60; i -= 1) {
    const p = shiftPeriod(now, i);
    list.push({ value: p, label: monthLabel(p) });
  }
  if (extra && !list.some((o) => o.value === extra)) list.push({ value: extra, label: monthLabel(extra) });
  return list;
}

const TITLES = {
  payment: ["Tahsilat ekle", "Tahsilatı düzenle"],
  charge: ["Kalem ekle", "Kalemi düzenle"],
  override: ["Tutarı düzelt", "Tutarı düzelt"],
} as const;

export interface NaEntryDialog {
  kind: "payment" | "charge" | "override";
  initial: Partial<NaEntry> & { line?: NaLine & { cityName?: string } };
  /** Düzenlenen kaydın kimliği (yoksa yeni). */
  id?: number | null;
}

export function NaEntrySheet({
  dialog,
  options,
  onClose,
  onSave,
  onDelete,
}: {
  dialog: NaEntryDialog | null;
  options: NaOptions;
  onClose: () => void;
  onSave: (body: NaEntryBody, id?: number | null) => Promise<unknown>;
  onDelete?: () => void;
}) {
  const kind = dialog?.kind || "payment";
  const init = dialog?.initial || {};
  const editing = Boolean(dialog?.id);
  const line = init.line || null;
  const fields = (v: Record<string, unknown>): FieldDef[] => {
    const list: FieldDef[] = [];
    if (kind !== "override") {
      list.push({
        key: "cityId",
        label: "İl",
        kind: "select",
        required: true,
        disabled: editing && kind !== "payment",
        options: options.cities.map((c) => ({ value: String(c.id), label: c.name })),
        onChange: () => ({ seasonId: "" }),
      });
    }
    if (kind === "payment") {
      list.push(
        { key: "date", label: "Ödeme tarihi", kind: "date", required: true },
        { key: "paymentMethod", label: "Yöntem", kind: "select", options: options.paymentMethods.map((m) => ({ value: m.key, label: m.label })) }
      );
    } else if (kind === "charge") {
      list.push(
        { key: "period", label: "Ay", kind: "select", required: true, options: monthOptions(s(v.period)) },
        {
          key: "seasonId",
          label: "Sezon (isteğe bağlı)",
          kind: "select",
          clearable: true,
          options: options.seasons.filter((x) => !v.cityId || String(x.cityId) === s(v.cityId)).map((x) => ({ value: String(x.id), label: `${x.name}${x.leagueName ? ` · ${x.leagueName}` : ""}` })),
        }
      );
    }
    if (kind !== "override") {
      list.push({
        key: "title",
        label: kind === "charge" ? "Açıklama" : "Açıklama (isteğe bağlı)",
        kind: "text",
        required: kind === "charge",
        maxLength: 160,
        placeholder: kind === "charge" ? "Ör. Turnuva organizasyon ücreti, indirim" : "Ör. Ocak ayı ödemesi",
      });
    }
    list.push(
      { key: "amount", label: kind === "override" ? "Alınacak tutar (₺)" : kind === "charge" ? "Tutar (₺) — indirim için eksi yazın" : "Tutar (₺)", kind: "money", required: true },
      { key: "note", label: "Not", kind: "multiline", maxLength: 500 }
    );
    return list;
  };
  return (
    <EditorSheet
      visible={dialog != null}
      onClose={onClose}
      title={TITLES[kind][editing ? 1 : 0]}
      initial={{
        cityId: init.cityId ? String(init.cityId) : "",
        date: init.date || todayKey(),
        period: init.period || currentPeriod(),
        seasonId: init.seasonId ? String(init.seasonId) : "",
        amount: init.amount != null ? String(init.amount).replace(".", ",") : "",
        paymentMethod: init.paymentMethod || "havale",
        title: init.title || "",
        note: init.note || "",
      }}
      fields={fields}
      header={() =>
        kind === "override" && line ? (
          <View style={styles.summary}>
            <Text style={styles.strong} {...textScale.dense}>
              {line.cityName} · {monthLabel(line.period)}
            </Text>
            <Text style={styles.muted} {...textScale.dense}>
              {line.seasonName}
              {line.leagueName ? ` · ${line.leagueName}` : ""}
            </Text>
            <Text style={styles.muted} {...textScale.dense}>
              {line.matchCount} maç × {money(line.fee)} = {money(line.calculated)} hesaplandı
            </Text>
          </View>
        ) : null
      }
      secondary={onDelete ? { label: kind === "override" ? "Düzeltmeyi kaldır" : "Sil", danger: true, onPress: onDelete } : undefined}
      validate={(v) => {
        const n = parseAmount(v.amount);
        if (n == null || !Number.isFinite(n)) return "Tutar geçersiz. Örnek: 1.250,50";
        if (kind !== "charge" && n < 0) return "Tutar eksi olamaz.";
        return null;
      }}
      onSubmit={async (v) => {
        const amount = String(parseAmount(v.amount) ?? 0);
        const body: NaEntryBody = { kind, cityId: kind === "override" ? Number(line?.cityId ?? init.cityId) || null : Number(v.cityId) || null, amount, note: s(v.note) };
        if (kind === "payment") Object.assign(body, { date: s(v.date), paymentMethod: s(v.paymentMethod), title: s(v.title) });
        if (kind === "charge") Object.assign(body, { period: s(v.period), seasonId: Number(v.seasonId) || null, title: s(v.title) });
        if (kind === "override") Object.assign(body, { period: line?.period || s(init.period), seasonId: line?.seasonId ?? init.seasonId ?? null, title: "" });
        await onSave(body, dialog?.id);
      }}
    />
  );
}

export function NaRateSheet({
  rate,
  visible,
  initial,
  options,
  onClose,
  onSave,
  onDelete,
}: {
  rate?: NaRate | null;
  visible: boolean;
  initial?: Partial<NaRate>;
  options: NaOptions;
  onClose: () => void;
  onSave: (body: NaRateBody, id?: number) => Promise<unknown>;
  onDelete?: () => void;
}) {
  const src = rate || initial || {};
  return (
    <EditorSheet
      visible={visible}
      onClose={onClose}
      title={rate ? "Maç başı ücreti düzenle" : "Maç başı ücret ekle"}
      initial={{
        cityId: src.cityId ? String(src.cityId) : "",
        seasonId: src.seasonId ? String(src.seasonId) : "",
        validFrom: src.validFrom || "",
        fee: src.fee != null ? String(src.fee).replace(".", ",") : "",
        note: src.note || "",
      }}
      fields={(v) => [
        { key: "cityId", label: "İl", kind: "select", clearable: true, placeholder: "Tüm iller (genel ücret)", options: options.cities.map((c) => ({ value: String(c.id), label: c.name })), onChange: () => ({ seasonId: "" }) },
        {
          key: "seasonId",
          label: "Sezon (bayilik için)",
          kind: "select",
          clearable: true,
          placeholder: "İlin tüm sezonları",
          disabled: !v.cityId,
          options: options.seasons.filter((x) => v.cityId && String(x.cityId) === s(v.cityId)).map((x) => ({ value: String(x.id), label: `${x.name}${x.leagueName ? ` · ${x.leagueName}` : ""}${x.archived ? " (arşiv)" : ""}` })),
        },
        { key: "validFrom", label: "Geçerli olduğu ilk ay", kind: "select", clearable: true, placeholder: "Baştan beri", hint: "Boş bırakılırsa baştan beri geçerlidir.", options: monthOptions(s(v.validFrom) || null) },
        { key: "fee", label: "Maç başı ücret (₺)", kind: "money", required: true },
        { key: "note", label: "Not", kind: "text", maxLength: 300, placeholder: "Ör. Sincan bayiliği" },
      ]}
      extra={() => <Muted>En özel tarife uygulanır: il + sezon &gt; il &gt; genel. Aynı kapsamda birden fazla ücret varsa o ay için başlamış en yeni ücret geçerlidir. Ücreti almadığınız il ya da sezon için 0 ₺ girin.</Muted>}
      secondary={onDelete ? { label: "Sil", danger: true, onPress: onDelete } : undefined}
      validate={(v) => {
        const n = parseAmount(v.fee);
        return n != null && Number.isFinite(n) && n >= 0 ? null : "Ücret geçersiz. Örnek: 150 ya da 150,50";
      }}
      onSubmit={(v) =>
        onSave(
          { cityId: s(v.cityId) || null, seasonId: s(v.seasonId) || null, validFrom: s(v.validFrom) || null, fee: String(parseAmount(v.fee) ?? 0), note: s(v.note) },
          rate?.id
        )
      }
    />
  );
}

/* --------------------------------- il hesabı --------------------------------- */

const toneColor = (v: number) => (balanceTone(v) === "danger" ? colors.danger : balanceTone(v) === "win" ? colors.win : colors.textPrimary);

export function CityDetail({
  city,
  options,
  canManage,
  onEditEntry,
  onOverride,
  onAddRate,
  onEditRate,
}: {
  city: NaCity;
  options: NaOptions;
  canManage: boolean;
  onEditEntry: (e: NaEntry) => void;
  onOverride: (line: NaLine & { cityName: string }) => void;
  onAddRate: (initial: Partial<NaRate>) => void;
  onEditRate: (r: NaRate) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(city.months.filter((m) => m.matchCount || m.due || m.paid).slice(-1).map((m) => m.period)));
  const toggle = (p: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  const method = (key?: string | null) => options.paymentMethods.find((m) => m.key === key)?.label || "";
  const months = [...city.months].reverse();

  return (
    <View style={styles.gap}>
      <ToolStage
        icon="map"
        tone="cyan"
        overline={city.balance < 0 ? `${city.name} · fazla ödeme` : `${city.name} · kalan borç`}
        value={money(Math.abs(city.balance))}
        valueTone={city.balance > 0 ? "danger" : city.balance < 0 ? "win" : undefined}
        caption={
          city.adjustment
            ? `Hesaplanan ${money(city.calculated)} · düzeltme ${money(city.adjustment, { signed: true })}`
            : "Tahakkuk = maç sayısı × maç başı ücret."
        }
        chips={city.lastPayment ? <StageChip label={`Son tahsilat ${formatDate(city.lastPayment.date)}`} icon="cash-outline" tone="win" /> : null}
        stats={[
          { label: "Devreden", value: money(city.opening), tone: city.opening > 0 ? "danger" : city.opening < 0 ? "win" : undefined },
          { label: "Tahakkuk", value: money(city.due) },
          { label: "Tahsilat", value: money(city.paid), tone: "win" },
          { label: "Maç", value: city.matchCount },
        ]}
      />

      <View style={styles.section}>
        <SectionHeader title="Ay ay hesap" meta={`${months.length} ay`} subtitle="Ayı aç: sezon satırları, kalemler ve tahsilatlar" inset="flush" icon="calendar-outline" iconTone="violet" />
        <View style={styles.monthCard}>
          {months.map((m, mi) => {
            const lines = city.lines.filter((l) => l.period === m.period);
            const charges = city.charges.filter((e) => e.period === m.period);
            const payments = city.payments.filter((e) => e.period === m.period);
            const expandable = lines.length || charges.length || payments.length;
            const isOpen = open.has(m.period);
            const ratio = m.due > 0 ? Math.min(1, m.paid / m.due) : m.paid > 0 ? 1 : 0;
            return (
              <View key={m.period} style={[styles.month, mi === 0 ? styles.monthFirst : null]}>
                <Touchable
                  onPress={expandable ? () => toggle(m.period) : undefined}
                  disabled={!expandable}
                  feedback="row"
                  style={[styles.monthHead, isOpen ? styles.monthHeadOpen : null]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={`${m.label}, ${m.matchCount} maç, bakiye ${money(m.balance)}`}
                >
                  <View style={[styles.monthStamp, isOpen ? styles.monthStampOpen : null]}>
                    <Text style={[styles.monthStampNum, isOpen ? styles.monthStampNumOpen : null]} {...textScale.badge}>
                      {m.matchCount}
                    </Text>
                    <Text style={styles.monthStampUnit} {...textScale.badge}>
                      MAÇ
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.strong} numberOfLines={1} {...textScale.dense}>
                      {m.label}
                    </Text>
                    <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                      tahakkuk {money(m.due)}
                      {m.paid ? ` · tahsilat ${money(m.paid)}` : ""}
                      {m.adjustment ? ` · düzeltme ${money(m.adjustment, { signed: true })}` : ""}
                    </Text>
                    <View style={styles.monthBar}>
                      <GradientBar value={ratio} height={3} />
                    </View>
                  </View>
                  <Text style={[styles.num, { color: toneColor(m.balance) }]} {...textScale.badge}>
                    {money(m.balance)}
                  </Text>
                  {expandable ? <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} /> : <View style={styles.iconSpace} />}
                </Touchable>
                {isOpen ? (
                  <View style={styles.sub}>
                    {lines.map((l) => (
                      <LineRow
                        key={`${l.period}-${l.seasonId || 0}`}
                        icon="trophy-outline"
                        tone="violet"
                        title={l.seasonName}
                        sub={`${l.matchCount} maç × ${money(l.fee)} · ${l.leagues.length > 1 ? l.leagues.map((x) => `${x.name} (${x.count})`).join(", ") : l.leagueName || rateText(l.rate)}`}
                        meta={l.override ? `Hesaplanan ${money(l.calculated)} · düzeltme ${money(l.amount - l.calculated, { signed: true })}${l.override.note ? ` · ${l.override.note}` : ""}` : l.rate ? RATE_SCOPES[l.rate.scope] : "Tarife yok"}
                        value={money(l.amount)}
                        badge={l.override ? { label: "Düzeltildi", tone: "warn" } : null}
                        onPress={canManage ? () => onOverride({ ...l, cityName: city.name }) : undefined}
                      />
                    ))}
                    {charges.map((e) => (
                      <LineRow
                        key={`c${e.id}`}
                        icon="swap-vertical-outline"
                        tone="gold"
                        title={e.title || "Kalem"}
                        sub={[e.seasonName, e.note].filter(Boolean).join(" · ") || null}
                        value={money(e.amount, { signed: true })}
                        onPress={canManage ? () => onEditEntry(e) : undefined}
                      />
                    ))}
                    {payments.map((e) => (
                      <LineRow
                        key={`p${e.id}`}
                        icon="cash-outline"
                        tone="mint"
                        title={`Tahsilat · ${formatDate(e.date)}`}
                        sub={[method(e.paymentMethod), e.title, e.note].filter(Boolean).join(" · ") || null}
                        value={money(e.amount)}
                        valueTone="win"
                        onPress={canManage ? () => onEditEntry(e) : undefined}
                      />
                    ))}
                    {canManage && lines.length ? <Muted>Sezon satırına dokunup tutarı düzeltebilirsin.</Muted> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        <Text style={styles.total} {...textScale.dense}>
          Dönem toplamı · {city.matchCount} maç · hesaplanan {money(city.calculated)} · bakiye {money(city.balance)}
        </Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Sezon ve lig bazında" meta={String(city.seasons.length)} inset="flush" icon="trophy-outline" iconTone="gold" />
        {city.seasons.length ? (
          <Lines>
            {city.seasons.map((x) => (
              <LineRow key={x.seasonId || 0} icon="trophy-outline" tone="gold" title={x.seasonName} sub={x.leagueName || null} value={money(x.amount)} valueSub={`${x.matchCount} maç`} />
            ))}
          </Lines>
        ) : (
          <Muted>Bu dönemde maç yok.</Muted>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Maç başı ücretler"
          meta={String(city.rates.length)}
          inset="flush"
          icon="pricetag-outline"
          iconTone="mint"
          action={canManage ? { label: "Ücret ekle", onPress: () => onAddRate({ cityId: city.cityId }) } : undefined}
        />
        {city.rates.length ? (
          <Lines>
            {city.rates.map((r) => (
              <LineRow
                key={r.id}
                icon="pricetag-outline"
                tone="mint"
                title={r.seasonName || "İlin tüm maçları"}
                sub={[r.validFrom ? `${monthLabel(r.validFrom)}'dan itibaren` : "Baştan beri", r.note].filter(Boolean).join(" · ")}
                value={money(r.fee)}
                valueSub="maç başı"
                chevron={canManage}
                onPress={canManage ? () => onEditRate(r) : undefined}
              />
            ))}
          </Lines>
        ) : (
          <Muted>Bu il için ücret tanımlı değil; varsa genel ücret uygulanır.</Muted>
        )}
      </View>
    </View>
  );
}

/** Uyarı şeritleri: ili bulunamayan maçlar, tanımsız ücret. */
export function NationalWarnings({ unassigned, noRates, canManage, onRates }: { unassigned: number; noRates: boolean; canManage: boolean; onRates: () => void }) {
  return (
    <>
      {unassigned > 0 ? <Note tone="warn" icon="warning-outline" text={`${unassigned} maçın ili bulunamadığı için ücretlendirilmedi. Maçların il bilgisini kontrol edin.`} /> : null}
      {noRates ? <Note text="Henüz maç başı ücret tanımlanmadı; tutarlar 0 ₺ görünür." action={canManage ? { label: "Ücret tanımla", onPress: onRates } : undefined} /> : null}
    </>
  );
}

export function MonthRangeFields({ from, to, onChange }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <SelectField<string> label="Başlangıç ayı" value={from} options={monthOptions(from)} onChange={(v) => v && onChange({ from: v, to: v > to ? v : to })} />
      </View>
      <View style={styles.flex}>
        <SelectField<string> label="Bitiş ayı" value={to} options={monthOptions(to)} onChange={(v) => v && onChange({ from: v < from ? v : from, to: v })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  flex: { flex: 1 },
  row: { flexDirection: "row", gap: space.sm },
  summary: { gap: 2, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
  strong: { ...type.label, color: colors.textPrimary },
  muted: { ...type.caption, color: colors.textTertiary },
  num: { ...type.numSmStrong },
  section: { gap: space.sm, marginTop: space.sm },
  monthCard: { borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.glassLine, overflow: "hidden" },
  month: { borderTopWidth: hairline, borderTopColor: colors.separator },
  monthFirst: { borderTopWidth: 0 },
  monthHead: { flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.m, paddingHorizontal: space.md, minHeight: 64 },
  monthHeadOpen: { backgroundColor: colors.brandDim },
  monthStamp: { width: 40, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  monthStampOpen: { backgroundColor: colors.brandAccent },
  monthStampNum: { ...type.scoreXs, color: colors.textPrimary },
  monthStampNumOpen: { color: colors.onDark },
  monthStampUnit: { ...type.nano, color: colors.textTertiary },
  monthBar: { marginTop: space.xs },
  iconSpace: { width: 16 },
  sub: { gap: space.xs, paddingBottom: space.sm, backgroundColor: colors.surface1 },
  total: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
});

