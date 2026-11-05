/**
 * Maç Muhasebesi ayarları — web accounting/AccountingSettings.js SettingsView.
 *
 *   1 Lig ve sezonlar   — deftere dahil sezonlar (lig gruplu, arama, arşiv)
 *   2 Varsayılan tutarlar — "Varsayılanları uygula"nın dolduracağı tutarlar
 *   3 Saha tarifeleri    — saha adı + maç başı ücret (defterdeki sahalardan ekle)
 *   4 Takım tarifeleri   — indirimli / özel anlaşmalı takımlar
 *   5 Personel tarifeleri — görev başı ücret
 *   6 Bütçe ve hedef     — gider kalemi aylık üst sınırı, aylık hedef kâr, taslak maçlar
 *   7 Dönem kilidi       — bu tarihe kadar tutarlar değişmez
 *
 * SeasonPicker ilk kurulum ekranında da kullanılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DateField, Panel, ToggleField } from "@/components/admin";
import { Button, Chip, ChipGroup, Input, Touchable } from "@/components/ui";
import {
  currentMonthRange,
  dayLabel,
  parseAmount,
  shiftMonthRange,
  shortDay,
  type AccCategory,
  type AccSeasonLeague,
  type AccSettings,
  type AccStaff,
  type AccTeamRow,
} from "@/lib/api/admin/accounting";
import { colors, hairline, space, textScale, type } from "@/theme";

import { Muted, Note } from "../parts";

const plain = (v: unknown) => (v == null || v === "" ? "" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(v)));
const toForm = (map?: Record<string, number>) => Object.fromEntries(Object.entries(map || {}).map(([k, v]) => [k, plain(v)]));
const digits = (t: string) => t.replace(/[^\d.,]/g, "");

/** { anahtar: "1.500" } → temiz tutar haritası; hata metni döner. */
function cleanMap(form: Record<string, string | undefined>, nameOf: (key: string) => string): { value?: Record<string, number>; error?: string } {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(form)) {
    const amount = parseAmount(raw ?? "");
    if (amount != null && Number.isNaN(amount)) return { error: `${nameOf(key)}: geçersiz tutar.` };
    if (amount) out[key] = amount;
  }
  return { value: out };
}

/* ------------------------------ SeasonPicker ------------------------------ */

export function SeasonPicker({ leagues, selected, onChange }: { leagues: AccSeasonLeague[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState("");
  const set = new Set(selected.map(Number));
  const needle = query.trim().toLocaleLowerCase("tr");
  const toggle = (id: number) => onChange(set.has(id) ? selected.filter((x) => Number(x) !== id) : [...selected, id]);
  const visible = leagues
    .map((l) => ({
      ...l,
      seasons: l.seasons.filter((s) => (archived || !s.archived || set.has(s.id)) && (!needle || `${l.league} ${s.name}`.toLocaleLowerCase("tr").includes(needle))),
    }))
    .filter((l) => l.seasons.length);
  return (
    <View style={styles.gap}>
      <Input variant="search" leadingIcon="search" value={query} onChangeText={setQuery} placeholder="Lig ya da sezon ara (ör. Freelig 15)" autoCapitalize="none" />
      <ToggleField label="Arşivdekileri göster" value={archived} onChange={setArchived} />
      <Muted>{selected.length} sezon seçili</Muted>
      {!visible.length ? <Muted>Sezon bulunamadı.</Muted> : null}
      {visible.map((l) => {
        const ids = l.seasons.map((s) => s.id);
        const all = ids.every((id) => set.has(id));
        return (
          <View key={`${l.leagueId ?? l.league}`} style={styles.league}>
            <Touchable
              onPress={() => onChange(all ? selected.filter((id) => !ids.includes(Number(id))) : [...new Set([...selected, ...ids])])}
              style={styles.leagueHead}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: all }}
            >
              <Ionicons name={all ? "checkbox" : "square-outline"} size={20} color={all ? colors.brandAccent : colors.textTertiary} />
              <Text style={styles.leagueName} {...textScale.dense}>
                {l.league}
              </Text>
            </Touchable>
            <ChipGroup>
              {l.seasons.map((s) => (
                <Chip
                  key={s.id}
                  size="sm"
                  label={`${s.name}${s.year ? ` (${s.year})` : ""}${s.archived ? " · arşiv" : ""}${s.matchCount != null ? ` · ${s.matchCount} maç` : ""}`}
                  selected={set.has(s.id)}
                  onPress={() => toggle(s.id)}
                />
              ))}
            </ChipGroup>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------ tarife listesi ------------------------------ */

function RateList({
  items,
  rates,
  onChange,
  emptyText,
  searchLabel,
  defaultAmount,
}: {
  items: { id: string; name: string; sub?: string; duties?: string[] }[];
  rates: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  emptyText: string;
  searchLabel: string;
  defaultAmount: (item: { id: string; duties?: string[] }) => number | null;
}) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const needle = query.trim().toLocaleLowerCase("tr");
  if (!items.length) return <Muted>{emptyText}</Muted>;
  const visible = items.filter((i) => (!needle || i.name.toLocaleLowerCase("tr").includes(needle)) && (all || needle || rates[i.id] || items.length <= 12));
  const configured = items.filter((i) => rates[i.id]).length;
  return (
    <View style={styles.gap}>
      <Input variant="search" leadingIcon="search" value={query} onChangeText={setQuery} placeholder={searchLabel} autoCapitalize="none" />
      {items.length > 12 ? <ToggleField label={`Tümünü göster (${items.length})`} value={all} onChange={setAll} /> : null}
      <Muted>{configured} özel tarife</Muted>
      {visible.map((i) => {
        const d = defaultAmount(i);
        return (
          <View key={i.id} style={styles.rateRow}>
            <View style={styles.flex}>
              <Text style={styles.rateName} numberOfLines={1} {...textScale.dense}>
                {i.name}
              </Text>
              {i.sub ? (
                <Text style={styles.rateSub} numberOfLines={1} {...textScale.dense}>
                  {i.sub}
                </Text>
              ) : null}
            </View>
            <Input
              value={rates[i.id] ?? ""}
              onChangeText={(t) => onChange({ ...rates, [i.id]: digits(t) })}
              placeholder={d ? plain(d) : "—"}
              keyboardType="decimal-pad"
              size="sm"
              containerStyle={styles.rateInput}
              accessibilityLabel={`${i.name} ücreti`}
            />
          </View>
        );
      })}
      {!visible.length ? <Muted>Eşleşen kayıt yok.</Muted> : null}
    </View>
  );
}

/* --------------------------------- ayarlar --------------------------------- */

export function MatchSettings({
  settings,
  leagues,
  categories,
  knownFields,
  teams,
  staff,
  canManage,
  busy,
  onSave,
  onError,
}: {
  settings?: AccSettings | null;
  leagues: AccSeasonLeague[];
  categories: AccCategory[];
  knownFields: string[];
  teams: AccTeamRow[];
  staff: AccStaff[];
  canManage: boolean;
  busy: boolean;
  onSave: (next: Partial<AccSettings>) => void;
  onError: (text: string) => void;
}) {
  const fixed = categories.filter((c) => c.fixed);
  const expenseCats = categories.filter((c) => c.direction === "expense");
  const [seasonIds, setSeasonIds] = useState<number[]>(settings?.seasonIds || []);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [fieldRates, setFieldRates] = useState<{ name: string; amount: string }[]>([]);
  const [teamRates, setTeamRates] = useState<Record<string, string>>({});
  const [staffRates, setStaffRates] = useState<Record<string, string>>({});
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [excludeDrafts, setExcludeDrafts] = useState(false);
  const [target, setTarget] = useState("");

  useEffect(() => {
    if (!settings) return;
    setSeasonIds(settings.seasonIds || []);
    setDefaults(toForm(settings.defaults));
    setFieldRates(Object.entries(settings.fieldRates || {}).map(([name, v]) => ({ name, amount: plain(v) })));
    setTeamRates(toForm(settings.teamRates));
    setStaffRates(toForm(settings.staffRates));
    setBudgets(toForm(settings.budgets));
    setLockedUntil(settings.lockedUntil || null);
    setExcludeDrafts(Boolean(settings.excludeDrafts));
    setTarget(settings.monthlyTarget ? plain(settings.monthlyTarget) : "");
  }, [settings]);

  const missingFields = useMemo(() => knownFields.filter((n) => !fieldRates.some((r) => r.name === n)), [knownFields, fieldRates]);
  const teamItems = useMemo(() => {
    const map = new Map(teams.filter((t) => t.teamId != null).map((t) => [String(t.teamId), { id: String(t.teamId), name: t.name } as { id: string; name: string; sub?: string }]));
    Object.keys(settings?.teamRates || {}).forEach((id) => {
      if (!map.has(id)) map.set(id, { id, name: `Takım #${id}`, sub: "bu dönemde maçı yok" });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [teams, settings]);
  const dutyLabels = useMemo(() => Object.fromEntries(categories.filter((c) => c.duty).map((c) => [c.duty as string, c.label])), [categories]);
  const staffItems = useMemo(
    () =>
      staff
        .filter((p) => p.status !== "inactive" || staffRates[p.id])
        .map((p) => ({ id: String(p.id), name: p.fullName, sub: p.duties.map((d) => dutyLabels[d] || d).join(", "), duties: p.duties })),
    [staff, dutyLabels, staffRates]
  );
  const lastMonthEnd = shiftMonthRange(currentMonthRange(), -1).to;
  const labelOf = (key: string) => categories.find((c) => c.key === key)?.label || key;

  const submit = () => {
    const d = cleanMap(Object.fromEntries(fixed.map((c) => [c.key, defaults[c.key]])), labelOf);
    if (d.error) return onError(d.error);
    const rates: Record<string, number> = {};
    for (const row of fieldRates) {
      if (!row.name.trim()) continue;
      const a = parseAmount(row.amount);
      if (a != null && Number.isNaN(a)) return onError(`${row.name}: geçersiz tutar.`);
      if (a) rates[row.name.trim()] = a;
    }
    const t = cleanMap(teamRates, (id) => teamItems.find((i) => i.id === id)?.name || `Takım #${id}`);
    if (t.error) return onError(t.error);
    const st = cleanMap(staffRates, (id) => staffItems.find((i) => i.id === id)?.name || `Personel #${id}`);
    if (st.error) return onError(st.error);
    const b = cleanMap(budgets, labelOf);
    if (b.error) return onError(b.error);
    const goal = parseAmount(target);
    if (goal != null && Number.isNaN(goal)) return onError("Hedef kâr geçersiz.");
    onSave({
      seasonIds,
      defaults: d.value,
      fieldRates: rates,
      teamRates: t.value,
      staffRates: st.value,
      budgets: b.value,
      lockedUntil: lockedUntil || null,
      excludeDrafts,
      monthlyTarget: goal,
    });
  };

  const amountGrid = (cats: AccCategory[], values: Record<string, string>, setValues: (v: Record<string, string>) => void) => (
    <View style={styles.grid}>
      {cats.map((c) => (
        <Input
          key={c.key}
          label={c.label}
          value={values[c.key] ?? ""}
          onChangeText={(x) => setValues({ ...values, [c.key]: digits(x) })}
          placeholder="—"
          keyboardType="decimal-pad"
          size="sm"
          containerStyle={styles.gridItem}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.gap}>
      {!canManage ? <Note tone="warn" icon="lock-closed-outline" text="Ayarları değiştirmek için muhasebe yönetim yetkisi gerekir; değerleri yalnız görüntüleyebilirsiniz." /> : null}
      <Panel title="1 · Muhasebeye dahil lig ve sezonlar">
        <Muted>Defterde, raporlarda ve tüm hesaplarda yalnızca burada seçtiğiniz sezonların maçları görünür.</Muted>
        <SeasonPicker leagues={leagues} selected={seasonIds} onChange={setSeasonIds} />
      </Panel>
      <Panel title="2 · Varsayılan tutarlar">
        <Muted>"Varsayılanları uygula" seçili dönemdeki maçların BOŞ kutucuklarını bu tutarlarla doldurur. Boş bırakılan kalem doldurulmaz.</Muted>
        {amountGrid(fixed, defaults, setDefaults)}
      </Panel>
      <Panel title="3 · Saha tarifeleri">
        <Muted>Sahaya göre farklı ücret ödüyorsanız saha adını ve maç başı ücretini girin; varsayılan saha tutarının önüne geçer.</Muted>
        {fieldRates.map((row, i) => (
          <View key={i} style={styles.rateRow}>
            <Input value={row.name} onChangeText={(x) => setFieldRates(fieldRates.map((r, j) => (j === i ? { ...r, name: x } : r)))} placeholder="Saha adı" size="sm" containerStyle={styles.flex} />
            <Input value={row.amount} onChangeText={(x) => setFieldRates(fieldRates.map((r, j) => (j === i ? { ...r, amount: digits(x) } : r)))} placeholder="Ücret" keyboardType="decimal-pad" size="sm" containerStyle={styles.rateInput} />
            <Touchable onPress={() => setFieldRates(fieldRates.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel="Tarifeyi sil">
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Touchable>
          </View>
        ))}
        <ChipGroup scrollable contentPadding={0}>
          <Chip label="Saha ekle" icon="add" size="sm" onPress={() => setFieldRates([...fieldRates, { name: "", amount: "" }])} />
          {missingFields.slice(0, 12).map((n) => (
            <Chip key={n} label={n} icon="add" size="sm" onPress={() => setFieldRates([...fieldRates, { name: n, amount: "" }])} />
          ))}
        </ChipGroup>
      </Panel>
      <Panel title="4 · Takım tarifeleri">
        <Muted>İndirimli ya da özel anlaşmalı takımlar için maç başı ücret; ev sahibi ve deplasman kutucuğunda varsayılanın önüne geçer.</Muted>
        <RateList
          items={teamItems}
          rates={teamRates}
          onChange={setTeamRates}
          searchLabel="Takım ara"
          emptyText="Seçili dönemde maçı olan takım yok. Defterde maçlar göründükçe takımlar burada listelenir."
          defaultAmount={() => parseAmount(defaults.takim_ev ?? "") || null}
        />
      </Panel>
      <Panel title="5 · Personel tarifeleri">
        <Muted>Kıdemli hakem ya da farklı ücret alan personel için görev başı ücret. Maçın görevlisi bu kişiyse görev kutucuğu bu tutarla dolar.</Muted>
        <RateList
          items={staffItems}
          rates={staffRates}
          onChange={setStaffRates}
          searchLabel="Personel ara"
          emptyText="Bu ilin kadrosunda personel yok."
          defaultAmount={(i) => {
            const cat = categories.find((c) => c.duty === i.duties?.[0]);
            return cat ? parseAmount(defaults[cat.key] ?? "") || null : null;
          }}
        />
      </Panel>
      <Panel title="6 · Aylık bütçe ve hedef">
        <Muted>Gider kalemleri için aylık üst sınır. Genel bakış ve raporlarda gerçekleşenle karşılaştırılır; %85'i geçince sarı, aşınca kırmızı görünür.</Muted>
        {amountGrid(expenseCats, budgets, setBudgets)}
        <Input label="Aylık hedef kâr" value={target} onChangeText={(x) => setTarget(digits(x))} placeholder="—" keyboardType="decimal-pad" size="sm" />
        <ToggleField label="Taslak maçları deftere alma" value={excludeDrafts} onChange={setExcludeDrafts} />
      </Panel>
      <Panel title="7 · Dönem kilidi">
        <Muted>Kilit tarihine kadar (dahil) kayıt eklenemez, silinemez, tutar değiştirilemez. Ödeme durumu, yöntem ve not yine güncellenebilir.</Muted>
        <DateField label="Bu tarihe kadar kilitli" value={lockedUntil} clearable onChange={setLockedUntil} />
        <View style={styles.rateRow}>
          <Button label={`Geçen ayı kapat (${shortDay(lastMonthEnd)})`} size="sm" variant="secondary" onPress={() => setLockedUntil(lastMonthEnd)} />
          {lockedUntil ? <Button label="Kilidi kaldır" size="sm" variant="ghost" onPress={() => setLockedUntil(null)} /> : null}
        </View>
        {lockedUntil ? <Note icon="lock-closed-outline" tone="warn" text={`${dayLabel(lockedUntil)} dahil öncesi kilitli olacak.`} /> : null}
      </Panel>
      {canManage ? <Button label="Ayarları kaydet" onPress={submit} loading={busy} fullWidth haptic="success" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  flex: { flex: 1 },
  league: { gap: space.xs, paddingVertical: space.xs, borderTopWidth: hairline, borderTopColor: colors.separator },
  leagueHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  leagueName: { ...type.label, color: colors.textPrimary },
  rateRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  rateName: { ...type.bodySm, color: colors.textPrimary },
  rateSub: { ...type.caption, color: colors.textTertiary },
  rateInput: { width: 120 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  gridItem: { width: "47%" },
});
