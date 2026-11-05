/**
 * Maç muhasebe ayrıntısı — web accounting/MatchDrawer.js.
 *
 * Maçın bütün kutucukları: tutar (boşsa tarife önerisi soluk), ödeme durumu
 * (dokununca değişir), ödeme yöntemi, personel (görevli varsayılan) ve not.
 * Bölüm başında "tümü tahsil edildi / ödendi / bekliyor"; canlı gelir-gider-net
 * önizlemesi; boş kutucukları tek dokunuşla tarifeyle doldurma. Altta maça
 * özel başlıklı "diğer" kalemler (öneri çipleri, ekle, durum, sil).
 *
 * Önceki / sonraki maça geçilir; kaydedilmemiş değişiklik varsa sorulur.
 * Kilitli dönemde tutarlar salt okunur, kalem eklenip silinemez (web ile aynı).
 * Yalnız accounting.view yetkisi olan kullanıcı formu salt okunur görür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { SelectField, SegmentField, confirmAction } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, Input, Touchable, toneColors } from "@/components/ui";
import {
  EXTRA_PRESETS,
  PERSONNEL_CATEGORIES,
  dayLabel,
  money,
  parseAmount,
  suggestedAmount,
  type AccCategory,
  type AccEntry,
  type AccEntryBody,
  type AccMatch,
  type AccSettings,
  type AccStaff,
  type CellBody,
} from "@/lib/api/admin/accounting";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { Note } from "../parts";

interface CellForm {
  amount: string;
  status: "paid" | "pending";
  staffId: string;
  paymentMethod: string;
  note: string;
}

const plain = (v: number | null | undefined) => (v == null ? "" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(v));

const formFromMatch = (match: AccMatch, fixed: AccCategory[]): Record<string, CellForm> =>
  Object.fromEntries(
    fixed.map((c) => {
      const cell = match.cells[c.key];
      return [c.key, { amount: cell ? plain(cell.amount) : "", status: cell?.status || "pending", staffId: cell?.staffId != null ? String(cell.staffId) : "", paymentMethod: cell?.paymentMethod || "", note: cell?.note || "" }];
    })
  );

export interface MatchSheetProps {
  match: AccMatch | null;
  categories: AccCategory[];
  paymentMethods: { key: string; label: string }[];
  staff: AccStaff[];
  settings?: AccSettings | null;
  position: { index: number; total: number; hasPrev: boolean; hasNext: boolean };
  canManage: boolean;
  onNavigate: (delta: number) => void;
  onClose: () => void;
  onSaveCells: (matchId: number, cells: Record<string, CellBody>) => Promise<boolean>;
  onCreateEntry: (body: AccEntryBody) => Promise<boolean>;
  onUpdateEntry: (id: number, body: Partial<AccEntryBody>) => Promise<boolean>;
  onDeleteEntry: (entry: AccEntry) => void;
  onError: (text: string) => void;
}

export function MatchSheet(props: MatchSheetProps) {
  const { match } = props;
  return (
    <BottomSheet visible={match != null} onClose={props.onClose} snap="full" title={match ? `${match.home} – ${match.away}` : "Maç"} scrollable={false}>
      {match ? <MatchBody key={match.id} {...props} match={match} /> : <View />}
    </BottomSheet>
  );
}

function MatchBody({
  match,
  categories,
  paymentMethods,
  staff,
  settings,
  position,
  canManage,
  onNavigate,
  onClose,
  onSaveCells,
  onCreateEntry,
  onUpdateEntry,
  onDeleteEntry,
  onError,
}: MatchSheetProps & { match: AccMatch }) {
  const fixed = useMemo(() => categories.filter((c) => c.fixed), [categories]);
  const [form, setForm] = useState(() => formFromMatch(match, fixed));
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState({ title: "", amount: "", direction: "expense", status: "pending", staffId: "" });
  const locked = Boolean(match.locked);
  const readOnly = !canManage;

  useEffect(() => {
    setForm(formFromMatch(match, fixed));
  }, [match.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const original = useMemo(() => JSON.stringify(formFromMatch(match, fixed)), [match, fixed]);
  const dirty = JSON.stringify(form) !== original;

  const guard = async (action: () => void) => {
    if (dirty && !readOnly) {
      const ok = await confirmAction({ title: "Kaydedilmemiş değişiklikler", message: "Bu maçta kaydedilmemiş kutucuk değişiklikleri var. Kaydetmeden devam edilsin mi?", confirmLabel: "Kaydetmeden devam et", destructive: true });
      if (!ok) return;
    }
    action();
  };

  const set = (key: string, field: keyof CellForm, value: string) => setForm((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  const suggestions = useMemo(() => Object.fromEntries(fixed.map((c) => [c.key, suggestedAmount(c, match, settings)])), [fixed, match, settings]);
  const fillable = fixed.filter((c) => !form[c.key]?.amount && suggestions[c.key]);

  const preview = useMemo(() => {
    let income = 0;
    let expense = 0;
    fixed.forEach((c) => {
      const a = parseAmount(form[c.key]?.amount);
      if (!a || Number.isNaN(a)) return;
      if (c.direction === "income") income += a;
      else expense += a;
    });
    match.extras.forEach((x) => {
      if (x.direction === "income") income += x.amount;
      else expense += x.amount;
    });
    return { income, expense, net: income - expense };
  }, [form, fixed, match.extras]);

  const fillDefaults = () =>
    setForm((prev) => {
      const next = { ...prev };
      fillable.forEach((c) => {
        next[c.key] = { ...next[c.key], amount: plain(suggestions[c.key]) };
      });
      return next;
    });

  const setSection = (direction: string, status: "paid" | "pending") =>
    setForm((prev) => {
      const next = { ...prev };
      fixed.filter((c) => c.direction === direction && prev[c.key].amount).forEach((c) => {
        next[c.key] = { ...next[c.key], status };
      });
      return next;
    });

  const save = async (close = true) => {
    const cells: Record<string, CellBody> = {};
    for (const c of fixed) {
      const v = form[c.key];
      const amount = parseAmount(v.amount);
      if (amount != null && Number.isNaN(amount)) {
        onError(`${c.label}: geçersiz tutar.`);
        return false;
      }
      const current = match.cells[c.key];
      if (amount == null) {
        if (current) cells[c.key] = null;
        continue;
      }
      cells[c.key] = {
        amount,
        status: v.status,
        paymentMethod: v.paymentMethod || null,
        note: v.note || null,
        ...(c.direction === "expense" ? { staffId: v.staffId === "" ? null : Number(v.staffId) } : {}),
      };
    }
    setBusy(true);
    const ok = await onSaveCells(match.id, cells);
    setBusy(false);
    if (ok && close) onClose();
    return ok;
  };

  const addExtra = async () => {
    const amount = parseAmount(extra.amount);
    if (!extra.title.trim()) return onError("Kalem başlığı yazın.");
    if (amount == null || Number.isNaN(amount)) return onError("Geçerli bir tutar girin.");
    setBusy(true);
    const ok = await onCreateEntry({
      matchId: match.id,
      category: extra.direction === "income" ? "gelir_diger" : "diger",
      title: extra.title.trim(),
      amount,
      status: extra.status,
      staffId: extra.direction === "expense" && extra.staffId !== "" ? Number(extra.staffId) : null,
    });
    setBusy(false);
    if (ok) setExtra({ title: "", amount: "", direction: extra.direction, status: "pending", staffId: "" });
  };

  const staffOptions = (c: AccCategory) => {
    const matching = c.duty ? staff.filter((p) => p.duties.includes(c.duty as string)) : [];
    const others = staff.filter((p) => !matching.includes(p));
    return [
      ...matching.map((p) => ({ value: String(p.id), label: p.fullName, hint: "Bu görevi yapıyor" })),
      ...others.map((p) => ({ value: String(p.id), label: p.fullName, hint: null })),
    ];
  };

  const renderRow = (c: AccCategory) => {
    const v = form[c.key];
    const crew = c.duty ? match.crew?.[c.duty] : null;
    const personnel = c.direction === "expense" && PERSONNEL_CATEGORIES.includes(c.key);
    const suggestion = suggestions[c.key];
    const paid = v.status === "paid";
    const statusText = paid ? (c.direction === "income" ? "Tahsil edildi" : "Ödendi") : c.direction === "income" ? "Tahsil edilmedi" : "Ödenmedi";
    const expanded = open === c.key;
    return (
      <View key={c.key} style={[styles.cell, v.amount ? styles.cellFilled : null]}>
        <View style={styles.cellHead}>
          <View style={styles.cellLabel}>
            <Text style={styles.cellTitle} {...textScale.dense}>
              {c.label}
            </Text>
            {c.team ? (
              <Text style={styles.cellSub} numberOfLines={1} {...textScale.dense}>
                {c.team === "home" ? match.home : match.away}
              </Text>
            ) : null}
            {crew ? (
              <Text style={styles.cellSub} numberOfLines={1} {...textScale.dense}>
                Görevli: {crew.name}
              </Text>
            ) : null}
          </View>
          <Input
            value={v.amount}
            onChangeText={(t) => set(c.key, "amount", t.replace(/[^\d.,]/g, ""))}
            placeholder={suggestion ? `Öneri ${plain(suggestion)}` : "Tutar"}
            keyboardType="decimal-pad"
            editable={!locked && !readOnly}
            size="sm"
            containerStyle={styles.amount}
            accessibilityLabel={`${c.label} tutarı`}
          />
        </View>
        <View style={styles.cellTools}>
          <Touchable
            onPress={() => set(c.key, "status", paid ? "pending" : "paid")}
            disabled={readOnly}
            style={[styles.status, { backgroundColor: paid ? toneColors("win").dim : toneColors("warn").dim }]}
            accessibilityRole="button"
            accessibilityLabel={`${c.label} durumu: ${statusText}. Değiştir`}
          >
            <Ionicons name={paid ? "checkmark-circle" : "time-outline"} size={14} color={paid ? colors.win : colors.warn} />
            <Text style={[styles.statusText, { color: paid ? colors.win : colors.warn }]} {...textScale.dense}>
              {statusText}
            </Text>
          </Touchable>
          {v.paymentMethod ? (
            <Text style={styles.cellSub} {...textScale.dense}>
              {paymentMethods.find((m) => m.key === v.paymentMethod)?.label}
            </Text>
          ) : null}
          <View style={styles.flex} />
          <Touchable onPress={() => setOpen(expanded ? null : c.key)} accessibilityRole="button" accessibilityLabel={`${c.label} ayrıntıları`}>
            <Text style={styles.link} {...textScale.dense}>
              {expanded ? "Kapat" : "Yöntem · personel · not"}
            </Text>
          </Touchable>
        </View>
        {expanded ? (
          <View style={styles.cellMore}>
            <SelectField<string>
              label="Ödeme yöntemi"
              value={v.paymentMethod || null}
              clearable
              disabled={readOnly}
              placeholder="Yöntem"
              options={paymentMethods.map((m) => ({ value: m.key, label: m.label }))}
              onChange={(x) => set(c.key, "paymentMethod", x || "")}
            />
            {personnel ? (
              <SelectField<string>
                label="Personel"
                value={v.staffId || null}
                clearable
                disabled={readOnly}
                placeholder={crew ? `Görevli (${crew.name})` : "Personel seçin"}
                options={staffOptions(c)}
                onChange={(x) => set(c.key, "staffId", x || "")}
              />
            ) : null}
            <Input label="Not" value={v.note} onChangeText={(t) => set(c.key, "note", t)} editable={!readOnly} size="sm" />
          </View>
        ) : null}
      </View>
    );
  };

  const section = (direction: "income" | "expense", title: string) => (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} {...textScale.dense}>
          {title}
        </Text>
        {!readOnly ? (
          <View style={styles.sectionTools}>
            <Touchable onPress={() => setSection(direction, "paid")} accessibilityRole="button">
              <Text style={styles.link} {...textScale.dense}>
                {direction === "income" ? "Tümü tahsil edildi" : "Tümü ödendi"}
              </Text>
            </Touchable>
            <Touchable onPress={() => setSection(direction, "pending")} accessibilityRole="button">
              <Text style={styles.linkDim} {...textScale.dense}>
                Tümü bekliyor
              </Text>
            </Touchable>
          </View>
        ) : null}
      </View>
      {fixed.filter((c) => c.direction === direction).map(renderRow)}
    </View>
  );

  return (
    <View style={styles.fill}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow} numberOfLines={1} {...textScale.dense}>
            {dayLabel(match.date)} · {match.time || "—"} · {position.index + 1}/{position.total}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {[match.score ? `Skor ${match.score}` : null, match.league, match.season, match.field].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Touchable onPress={() => guard(() => onNavigate(-1))} disabled={!position.hasPrev} style={[styles.nav, !position.hasPrev ? styles.dim : null]} accessibilityRole="button" accessibilityLabel="Önceki maç">
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </Touchable>
        <Touchable onPress={() => guard(() => onNavigate(1))} disabled={!position.hasNext} style={[styles.nav, !position.hasNext ? styles.dim : null]} accessibilityRole="button" accessibilityLabel="Sonraki maç">
          <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
        </Touchable>
      </View>

      <View style={styles.scrollWrap}>
        <ScrollArea>
          {locked ? <Note icon="lock-closed-outline" tone="warn" text="Bu maç kilitli dönemde. Tutarlar değiştirilemez; ödeme durumu, yöntem, personel ve not güncellenebilir." /> : null}
          <View style={styles.summary}>
            <Sum label="Gelir" value={money(preview.income)} color={colors.win} />
            <Sum label="Gider" value={money(preview.expense)} color={colors.danger} />
            <Sum label="Net" value={money(preview.net, { signed: true })} color={preview.net >= 0 ? colors.win : colors.danger} />
          </View>
          {dirty ? <Note text={`Kaydedilmemiş değişiklik var · kayıtlı net ${money(match.totals.net, { signed: true })}`} /> : null}
          {!locked && !readOnly && fillable.length ? (
            <Button
              label={`${fillable.length} boş kutucuğu tarifelerle doldur`}
              icon="flash-outline"
              variant="secondary"
              onPress={fillDefaults}
              accessibilityHint={fillable.map((c) => `${c.short} ${plain(suggestions[c.key])}`).join(", ")}
            />
          ) : null}
          {section("income", "Takımlardan alınan")}
          {section("expense", "Giderler")}

          <View style={styles.section}>
            <Text style={styles.sectionTitle} {...textScale.dense}>
              Diğer kalemler (başlıklı)
            </Text>
            {!match.extras.length ? (
              <Text style={styles.cellSub} {...textScale.long}>
                Bu maça özel başlıklı kalem yok. Örn. "Top alımı", "Su ve buz", "Kupa".
              </Text>
            ) : null}
            {match.extras.map((x) => (
              <View key={x.id} style={styles.extraRow}>
                <Touchable
                  onPress={() => void onUpdateEntry(x.id, { status: x.status === "paid" ? "pending" : "paid" })}
                  disabled={readOnly}
                  accessibilityRole="button"
                  accessibilityLabel={`${x.title}: ${x.status === "paid" ? "ödendi" : "bekliyor"}. Değiştir`}
                >
                  <Ionicons name={x.status === "paid" ? "checkmark-circle" : "ellipse-outline"} size={20} color={x.status === "paid" ? colors.win : colors.warn} />
                </Touchable>
                <View style={styles.flex}>
                  <Text style={styles.cellTitle} {...textScale.dense}>
                    {x.title}
                  </Text>
                  <Text style={styles.cellSub} {...textScale.dense}>
                    {x.direction === "income" ? "Gelir" : "Gider"}
                    {x.staffName ? ` · ${x.staffName}` : ""}
                  </Text>
                </View>
                <Text style={[styles.extraAmount, { color: x.direction === "income" ? colors.win : colors.danger }]} {...textScale.dense}>
                  {money(x.amount)}
                </Text>
                {!locked && !readOnly ? (
                  <Touchable onPress={() => onDeleteEntry(x)} accessibilityRole="button" accessibilityLabel={`${x.title} kalemini sil`}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Touchable>
                ) : null}
              </View>
            ))}
            {!locked && !readOnly ? (
              <View style={styles.addBox}>
                <ChipGroup scrollable contentPadding={0}>
                  {EXTRA_PRESETS.map((t) => (
                    <Chip key={t} label={t} size="sm" selected={extra.title === t} onPress={() => setExtra((e) => ({ ...e, title: t }))} />
                  ))}
                </ChipGroup>
                <SegmentField<string>
                  value={extra.direction}
                  onChange={(d) => setExtra((e) => ({ ...e, direction: d, staffId: "" }))}
                  options={[
                    { key: "expense", label: "Gider" },
                    { key: "income", label: "Gelir" },
                  ]}
                />
                <Input value={extra.title} onChangeText={(t) => setExtra((e) => ({ ...e, title: t }))} placeholder={extra.direction === "income" ? "Gelir başlığı" : "Gider başlığı"} size="sm" />
                <View style={styles.row}>
                  <Input value={extra.amount} onChangeText={(t) => setExtra((e) => ({ ...e, amount: t.replace(/[^\d.,]/g, "") }))} placeholder="Tutar" keyboardType="decimal-pad" size="sm" containerStyle={styles.flex} />
                  <SegmentField<string>
                    value={extra.status}
                    onChange={(s) => setExtra((e) => ({ ...e, status: s }))}
                    options={[
                      { key: "pending", label: "Bekliyor" },
                      { key: "paid", label: "Ödendi" },
                    ]}
                  />
                </View>
                {extra.direction === "expense" && staff.length ? (
                  <SelectField<string>
                    label="Personel (isteğe bağlı)"
                    value={extra.staffId || null}
                    clearable
                    options={staff.map((p) => ({ value: String(p.id), label: p.fullName }))}
                    onChange={(x) => setExtra((e) => ({ ...e, staffId: x || "" }))}
                  />
                ) : null}
                <Button label="Kalemi ekle" icon="add" size="sm" variant="secondary" onPress={() => void addExtra()} disabled={busy} />
              </View>
            ) : null}
          </View>
        </ScrollArea>
      </View>

      {!readOnly ? (
        <View style={styles.footer}>
          {position.hasNext ? (
            <Button
              label="Kaydet ve sonraki"
              variant="secondary"
              onPress={async () => {
                if (await save(false)) onNavigate(1);
              }}
              disabled={busy}
            />
          ) : null}
          <Button label="Kutucukları kaydet" onPress={() => void save()} loading={busy} style={styles.flex} haptic="success" />
        </View>
      ) : (
        <View style={styles.footer}>
          <Button label="Kapat" variant="secondary" onPress={onClose} style={styles.flex} />
        </View>
      )}
    </View>
  );
}

function Sum({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.sum}>
      <Text style={styles.sumLabel} {...textScale.badge}>
        {label}
      </Text>
      <Text style={[styles.sumValue, { color }]} numberOfLines={1} adjustsFontSizeToFit {...textScale.dense}>
        {value}
      </Text>
    </View>
  );
}

/** Alt sayfa kendi kaydırmasını kapattığı için gövde burada kaydırılır. */
function ScrollArea({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingHorizontal: space.lg + space.xxs },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingBottom: space.sm },
  eyebrow: { ...type.caption, color: colors.textSecondary },
  meta: { ...type.caption, color: colors.textTertiary },
  nav: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  dim: { opacity: 0.4 },
  scrollWrap: { flex: 1 },
  scroll: { gap: space.md, paddingBottom: space.xl },
  summary: { flexDirection: "row", gap: space.sm },
  sum: { flex: 1, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2, gap: 2 },
  sumLabel: { ...type.micro, color: colors.textTertiary },
  sumValue: { ...type.numSmStrong },
  section: { gap: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  sectionTitle: { ...type.label, color: colors.textPrimary },
  sectionTools: { flexDirection: "row", gap: space.md },
  link: { ...type.caption, color: colors.brandAccent },
  linkDim: { ...type.caption, color: colors.textTertiary },
  cell: { padding: space.sm, borderRadius: radius.md, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1, gap: space.xs },
  cellFilled: { borderColor: colors.borderStrong },
  cellHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cellLabel: { flex: 1, gap: 2 },
  cellTitle: { ...type.bodySm, color: colors.textPrimary },
  cellSub: { ...type.caption, color: colors.textTertiary },
  amount: { width: 130 },
  cellTools: { flexDirection: "row", alignItems: "center", gap: space.sm },
  status: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill },
  statusText: { ...type.caption },
  cellMore: { gap: space.sm, paddingTop: space.xs },
  extraRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  extraAmount: { ...type.numSmStrong },
  addBox: { gap: space.sm, paddingTop: space.sm },
  footer: { flexDirection: "row", gap: space.sm, paddingTop: space.sm, borderTopWidth: hairline, borderTopColor: colors.separator },
});
