import { del, get, patch, post, put, type QueryParams } from "../../http";
import type { AuthUser } from "../../types";

/**
 * MUHASEBE uçları — web "Araçlar → Muhasebe" merkezinin dört bölümü:
 *
 *   /api/finance                      (routes/finance.js, services/finance.js)
 *     → Hesaplar ve Virman: kasa/banka hesapları, hareketler, ekstre, virman, yetkiler
 *   /api/tools/ledger                 (routes/tools.js, services/personalTools.js)
 *     → Ön Muhasebe: kişisel gelir-gider defteri, özet ve 12 aylık trend
 *   /api/admin/accounting             (routes/adminAccounting.js, services/accounting)
 *     → Maç Muhasebesi: il defteri, kutucuklar, raporlar, ayarlar (accounting.*)
 *   /api/admin/national-accounting    (routes/adminNationalAccounting.js)
 *     → Türkiye Geneli: il tahakkuk/tahsilat, maç başı ücretler (national_accounting.* + Türkiye geneli rol)
 *
 * Alan adları sunucu serileştiricilerinden ve web istemcisinden
 * (src/api/financeApi.js, accountingApi.js, nationalAccountingApi.js,
 * services/toolsApi.js) birebir alınmıştır.
 */

/* ===================== Ortak yardımcılar ===================== */

/** Boş değerleri at, dizileri virgülle birleştir (web accountingApi.clean). */
const clean = (params: Record<string, unknown> = {}): QueryParams => {
  const out: QueryParams = {};
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value.join(",") : value;
    if (v === "" || v == null) continue;
    out[key] = v as string | number | boolean;
  }
  return out;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Yerel saatle YYYY-MM-DD. */
export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Kullanıcının yazdığı tutar → sayı. "1.250,50", "1250.50", "1.250" kabul;
 * boş → null, okunamayan → NaN (web accountingUtils.parseAmountInput).
 */
export function parseAmount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let raw = String(value).replace(/[\s₺]/g, "").replace(/tl$/i, "");
  if (raw === "") return null;
  const negative = raw.startsWith("-");
  if (negative) raw = raw.slice(1);
  if (/,\d{1,2}$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
  else raw = raw.replace(/,/g, "");
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return NaN;
  const rounded = Math.round(amount * 100) / 100;
  return negative ? -rounded : rounded;
}

/** Formda gösterilecek tutar ("1250,5"). */
export const amountInput = (value: number | null | undefined) =>
  value == null ? "" : String(value).replace(".", ",");

const moneyFmt = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 12500 → "12.500 ₺"; işaretli: "+12.500 ₺" / "−200 ₺". */
export function money(value: unknown, { signed = false, empty = "—" }: { signed?: boolean; empty?: string } = {}): string {
  if (value == null || value === "" || Number.isNaN(Number(value))) return empty;
  const n = Number(value);
  const body = `${moneyFmt.format(Math.abs(n))} ₺`;
  if (n < 0) return `−${body}`;
  return signed && n > 0 ? `+${body}` : body;
}

/** Grafik/şerit için kısa tutar: 12,5 B ₺. */
export function compactMoney(value: unknown): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const fmt = (x: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(x);
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000)} Mn ₺`;
  if (abs >= 1000) return `${fmt(n / 1000)} B ₺`;
  return `${fmt(n)} ₺`;
}

export const percent = (value: number | null | undefined) => (value == null ? "—" : `%${String(value).replace(".", ",")}`);

export const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const SHORT_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

const parseDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** "2026-09" → "Eylül 2026" */
export const monthLabel = (key?: string | null) => (key ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : "—");
/** "2026-09" → "Eyl 26" */
export const shortMonth = (key?: string | null) => (key ? `${SHORT_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}` : "");
/** "2026-09-10" → "10.09" */
export const shortDay = (day?: string | null) => (day ? `${day.slice(8, 10)}.${day.slice(5, 7)}` : "—");
/** "2026-09-10" → "10 Eylül 2026, Perşembe" */
export function dayLabel(day?: string | null): string {
  if (!day) return "—";
  const date = parseDay(day);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${WEEKDAYS[date.getDay()]}`;
}
/** "2026-09-10" → "10 Eylül 2026" */
export const longDay = (day?: string | null) => (day ? dayLabel(day).split(",")[0] : "—");

export function addDays(day: string, count: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + count);
  return todayKey(d);
}

export function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((day) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86400000);
}

export interface DayRange {
  from: string;
  to: string;
}

export function monthRange(year: number, month: number): DayRange {
  const last = new Date(year, month, 0).getDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}
export const currentMonthRange = (now = new Date()) => monthRange(now.getFullYear(), now.getMonth() + 1);
export function shiftMonthRange({ from }: DayRange, delta: number): DayRange {
  const [y, m] = from.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthRange(d.getFullYear(), d.getMonth() + 1);
}
export function isFullMonth({ from, to }: DayRange): boolean {
  if (!from || !to) return false;
  const [y, m] = from.split("-").map(Number);
  const r = monthRange(y, m);
  return r.from === from && r.to === to;
}
export function weekRange(now = new Date()): DayRange {
  const today = todayKey(now);
  const monday = addDays(today, -((now.getDay() + 6) % 7));
  return { from: monday, to: addDays(monday, 6) };
}
/** Tam ay ise ay ay, değilse kendi uzunluğu kadar kaydırır. */
export function shiftRange(range: DayRange, delta: number): DayRange {
  if (isFullMonth(range)) return shiftMonthRange(range, delta);
  const span = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, span * delta), to: addDays(range.to, span * delta) };
}
export function rangeLabel({ from, to }: DayRange): string {
  if (!from) return "Tüm kayıtlar";
  if (isFullMonth({ from, to })) return monthLabel(from.slice(0, 7));
  if (from === to) return longDay(from);
  return `${shortDay(from)}.${from.slice(0, 4)} – ${shortDay(to)}.${to.slice(0, 4)}`;
}
export const ageInDays = (day?: string | null, today = todayKey()) => (day ? Math.max(0, daysBetween(day, today)) : null);

/** Maç muhasebesi hazır dönemleri (web accountingUtils.PRESETS). */
export const MATCH_PRESETS: { key: string; label: string; range: () => DayRange }[] = [
  { key: "this_week", label: "Bu hafta", range: () => weekRange() },
  { key: "last_week", label: "Geçen hafta", range: () => shiftRange(weekRange(), -1) },
  { key: "this_month", label: "Bu ay", range: () => currentMonthRange() },
  { key: "last_month", label: "Geçen ay", range: () => shiftMonthRange(currentMonthRange(), -1) },
  { key: "last_30", label: "Son 30 gün", range: () => ({ from: addDays(todayKey(), -29), to: todayKey() }) },
  { key: "last_3_months", label: "Son 3 ay", range: () => ({ from: shiftMonthRange(currentMonthRange(), -2).from, to: currentMonthRange().to }) },
  { key: "this_year", label: "Bu yıl", range: () => ({ from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` }) },
];

/* ===================== CSV ===================== */

const csvCell = (value: unknown) => {
  if (value == null) return "";
  const text = typeof value === "number" ? String(value).replace(".", ",") : String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Excel (TR) uyumlu CSV: noktalı virgül ayraç, UTF-8 BOM. */
export const toCsv = (rows: unknown[][]) => `﻿${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;

/* ===================== Yetki / kapsam ===================== */

export const ACCOUNTING_PERMISSIONS = ["accounting.view", "accounting.manage"] as const;
export const NATIONAL_ACCOUNTING_PERMISSIONS = ["national_accounting.view", "national_accounting.manage"] as const;

/** Sunucu config/roles.js NATIONWIDE_ROLES varsayılanı; panelden eklenen roller roleInfo.nationwide ile gelir. */
const DEFAULT_NATIONWIDE_ROLES = ["admin", "disiplin_kurulu"];

type SessionExtras = { roleInfo?: { nationwide?: boolean } | null; actingCity?: { id: number; name: string } | null };

/** Türkiye geneli rol mü (web isNationwideRole). */
export function isNationwideRole(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const info = (user as AuthUser & SessionExtras).roleInfo;
  if (info && typeof info.nationwide === "boolean") return info.nationwide;
  return DEFAULT_NATIONWIDE_ROLES.includes(user.role);
}

/** Türkiye geneli kullanıcı ve il seçerek görüntülemiyor (web isNationwideUser). */
export function isNationwideUser(user: AuthUser | null | undefined): boolean {
  return isNationwideRole(user) && !(user as AuthUser & SessionExtras)?.actingCity;
}

/* ===================== Bölümler (AccountingHub) ===================== */

export type SectionKey = "hesaplar" | "on-muhasebe" | "mac" | "turkiye";

export interface AccountingSection {
  key: SectionKey;
  label: string;
  hint: string;
  icon: "business-outline" | "receipt-outline" | "football-outline" | "earth-outline";
  route: string;
  scope?: AccountScope;
}

export const ACCOUNTING_SECTIONS: AccountingSection[] = [
  { key: "hesaplar", label: "Hesaplar ve Virman", hint: "Kasa · banka · aktarma", icon: "business-outline", route: "/yonetim/araclar/muhasebe/hesaplar" },
  { key: "on-muhasebe", label: "Ön Muhasebe", hint: "Kişisel defter", icon: "receipt-outline", route: "/yonetim/araclar/muhasebe/on-muhasebe", scope: "personal" },
  { key: "mac", label: "Maç Muhasebesi", hint: "İl defteri", icon: "football-outline", route: "/yonetim/araclar/muhasebe/mac", scope: "city" },
  { key: "turkiye", label: "Türkiye Geneli", hint: "İl tahsilatları", icon: "earth-outline", route: "/yonetim/araclar/muhasebe/turkiye", scope: "national" },
];

/** Web AccountingHub.visibleSections ile birebir. */
export function visibleSections(user: AuthUser | null | undefined, has: (perms: readonly string[]) => boolean): AccountingSection[] {
  return ACCOUNTING_SECTIONS.filter((s) => {
    if (s.key === "mac") return has(ACCOUNTING_PERMISSIONS);
    if (s.key === "turkiye") return has(NATIONAL_ACCOUNTING_PERMISSIONS) && isNationwideRole(user);
    return true;
  });
}

/* ===================== Hesaplar ve Virman (/api/finance) ===================== */

export type AccountScope = "personal" | "city" | "national" | "shared";
export type AccessLevel = "view" | "post" | "manage";
export type EntryStatus = "planned" | "pending" | "paid" | "cancelled";
export type EntryType = "income" | "expense";

export const SCOPES: AccountScope[] = ["personal", "city", "national", "shared"];
export const SCOPE_LABEL: Record<AccountScope, string> = { personal: "Kişisel", city: "İl", national: "Türkiye geneli", shared: "Ortak / proje" };
export const SCOPE_BOOK: Record<AccountScope, string> = { personal: "Ön Muhasebe", city: "Maç Muhasebesi", national: "Türkiye Geneli", shared: "Yalnız yetki verilenler" };
export const KIND_ICON: Record<string, "cash-outline" | "business-outline" | "card-outline" | "wallet-outline"> = {
  kasa: "cash-outline",
  banka: "business-outline",
  kart: "card-outline",
  pos: "card-outline",
  diger: "wallet-outline",
};

/** Hesap renk paleti (web Accounts.COLORS) — veri rengi, tema dışı. */
export const ACCOUNT_COLORS = ["#7c3aed", "#059669", "#0284c7", "#e11d48", "#d97706", "#0d9488", "#4f46e5", "#475569"] as const;

export const LEVELS: { key: AccessLevel; label: string; help: string }[] = [
  { key: "view", label: "Görüntüleyebilir", help: "Bakiyeyi, hareketleri ve ekstreyi görür." },
  { key: "post", label: "Kayıt girebilir", help: "Ayrıca gelir / gider girer, ödendi işaretler; Ön Muhasebe ve proje bütçesinden bu hesaba kayıt işler." },
  { key: "manage", label: "Yönetebilir", help: "Ayrıca hesabı düzenler, virman yapar, yetki verir, arşivler." },
];

export const ENTRY_STATUS: Record<EntryStatus, { label: string; tone: "brand" | "warn" | "win" | "neutral"; icon: "bulb-outline" | "hourglass-outline" | "checkmark-circle" | "ban-outline" }> = {
  planned: { label: "Tahmin", tone: "brand", icon: "bulb-outline" },
  pending: { label: "Bekliyor", tone: "warn", icon: "hourglass-outline" },
  paid: { label: "Ödendi", tone: "win", icon: "checkmark-circle" },
  cancelled: { label: "İptal", tone: "neutral", icon: "ban-outline" },
};
export const statusLabel = (status: string, type?: string) =>
  status === "paid" && type === "income" ? "Tahsil edildi" : ENTRY_STATUS[status as EntryStatus]?.label || status;
export const paidVerb = (type: string) => (type === "income" ? "Tahsil edildi" : "Ödendi");

/** Hesap hareketi ekstre kaynakları. */
export const STATEMENT_SOURCE: Record<string, string> = {
  ledger: "Ön muhasebe",
  accounting: "Maç muhasebesi",
  national: "Türkiye geneli",
  transfer: "Virman",
  entry: "Hesap hareketi",
};

export interface AclEntry {
  type: "user" | "role" | "project";
  id?: number;
  role?: string;
  level: AccessLevel;
  label?: string;
}

export interface FinanceAccount {
  id: number;
  scope: AccountScope;
  city_id: number | null;
  city_name?: string | null;
  name: string;
  kind: string;
  linked_method: string | null;
  opening_balance: number;
  opening_date: string | null;
  color: string | null;
  note: string | null;
  archived: boolean;
  visibility: "scope" | "restricted";
  level?: AccessLevel;
  can_manage?: boolean;
  can_post?: boolean;
  shared_with?: number;
  acl?: AclEntry[];
  pending?: { income: number; expense: number };
  opening?: number;
  linked?: number;
  income?: number;
  expense?: number;
  transfersIn?: number;
  transfersOut?: number;
  balance: number;
}

export interface FinanceAccountsResponse {
  items: FinanceAccount[];
  totals: Partial<Record<AccountScope | "all", number>>;
  access: Partial<Record<AccountScope, { view?: boolean; manage?: boolean; nationwide?: boolean }>>;
  cities: { id: number; name: string }[];
  kinds: { key: string; label: string }[];
  methods: Partial<Record<AccountScope, { key: string; label: string }[]>>;
}

const RANK: Record<AccessLevel, number> = { view: 1, post: 2, manage: 3 };
export const accountLevel = (a?: FinanceAccount | null): AccessLevel =>
  a?.level || (a?.can_manage ? "manage" : a?.can_post ? "post" : "view");
export const canPostAccount = (a?: FinanceAccount | null) => RANK[accountLevel(a)] >= RANK.post && !a?.archived;
export const canManageAccount = (a?: FinanceAccount | null) => accountLevel(a) === "manage";

export interface FinanceEntry {
  id: number;
  account_id: number | null;
  project_id: number | null;
  type: EntryType;
  amount: number | null;
  estimate: number | null;
  effective: number;
  status: EntryStatus;
  entry_date: string | null;
  due_date: string | null;
  paid_date: string | null;
  description: string;
  category: string;
  party: string;
  document_no: string;
  note: string;
  account_name: string | null;
  can_edit?: boolean;
  lead_name?: string | null;
  step_title?: string | null;
}

export interface FinanceEntryTotals {
  paid_income: number;
  paid_expense: number;
  open_income: number;
  open_expense: number;
  estimate_net: number;
  paid_net: number;
}

export interface FinanceEntryBody {
  type: EntryType;
  amount: number | null;
  estimate: number | null;
  status: EntryStatus;
  entry_date: string | null;
  due_date: string | null;
  paid_date?: string | null;
  category: string | null;
  party: string | null;
  description: string | null;
  document_no: string | null;
  note: string | null;
  account_id: number | null;
}

export interface StatementLine {
  date: string;
  amount: number;
  title: string;
  party?: string | null;
  note?: string | null;
  source: string;
  ref: number | string;
  balance: number;
}

export interface AccountStatement {
  account: FinanceAccount;
  opening: number;
  items: StatementLine[];
  closing: number;
}

export interface FinanceTransfer {
  id: number;
  from_account_id: number;
  to_account_id: number;
  from_name: string | null;
  to_name: string | null;
  amount: number;
  transfer_date: string;
  note: string | null;
}

export interface AccessOptions {
  levels?: { key: AccessLevel; label: string }[];
  roles: { key: string; label: string }[];
  users: { id: number; name: string; username?: string; city?: string; role_label?: string; me?: boolean }[];
  projects: { id: number; name: string }[];
}

export interface AccountBody {
  scope?: AccountScope;
  city_id?: number;
  name: string;
  kind: string;
  linked_method: string | null;
  opening_balance: number;
  opening_date: string | null;
  color: string;
  note: string;
  acl?: AclEntry[];
  archived?: boolean;
}

const F = "/api/finance";

export const listAccounts = (params: { postable?: boolean; archived?: boolean } = {}) =>
  get<FinanceAccountsResponse>(`${F}/accounts`, clean({ postable: params.postable ? 1 : undefined, archived: params.archived ? 1 : undefined }));
export const createAccount = (body: AccountBody) => post<{ item: FinanceAccount }>(`${F}/accounts`, body);
export const updateAccount = (id: number, body: Partial<AccountBody>) => patch<{ item: FinanceAccount }>(`${F}/accounts/${id}`, body);
export const removeAccount = (id: number) => del<{ id: number; archived?: boolean; deleted?: boolean; message?: string }>(`${F}/accounts/${id}`);
export const accountStatement = (id: number, range: { from?: string; to?: string } = {}) =>
  get<AccountStatement>(`${F}/accounts/${id}/statement`, clean(range));
export const listTransfers = (params: { account_id?: number; from?: string; to?: string } = {}) =>
  get<{ items: FinanceTransfer[] }>(`${F}/transfers`, clean(params));
export interface TransferBody {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  date: string;
  note: string | null;
}
export const createTransfer = (body: TransferBody) => post<{ item: FinanceTransfer; message?: string }>(`${F}/transfers`, body);
export const updateTransfer = (id: number, body: TransferBody) => patch<{ item: FinanceTransfer }>(`${F}/transfers/${id}`, body);
export const removeTransfer = (id: number) => del<{ id: number }>(`${F}/transfers/${id}`);
export const setAccountAccess = (id: number, body: { visibility?: "scope" | "restricted"; acl: AclEntry[] }) =>
  put<{ item: FinanceAccount }>(`${F}/accounts/${id}/access`, body);
export const accessOptions = () => get<AccessOptions>(`${F}/access-options`);
export const listFinanceEntries = (params: { account_id?: number; type?: string; status?: string; from?: string; to?: string }) =>
  get<{ items: FinanceEntry[]; totals: FinanceEntryTotals }>(`${F}/entries`, clean(params));
export const createFinanceEntry = (body: FinanceEntryBody) => post<{ item: FinanceEntry }>(`${F}/entries`, body);
export const updateFinanceEntry = (id: number, body: Partial<FinanceEntryBody>) => patch<{ item: FinanceEntry }>(`${F}/entries/${id}`, body);
export const removeFinanceEntry = (id: number) => del<{ id: number }>(`${F}/entries/${id}`);

/** Sunucuya giden yetki listesi (adlar atılır — web cleanAcl). */
export const cleanAcl = (list: AclEntry[] = []): AclEntry[] =>
  list.map((e) => (e.type === "role" ? { type: "role", role: e.role, level: e.level } : { type: e.type, id: Number(e.id), level: e.level }));

/* ===================== Ön Muhasebe (/api/tools/ledger) ===================== */

export type LedgerStatus = "paid" | "pending";

export const LEDGER_TYPE_LABELS: Record<EntryType, string> = { income: "Gelir", expense: "Gider" };
export const LEDGER_STATUS_BY_TYPE: Record<EntryType, Record<LedgerStatus, string>> = {
  income: { paid: "Tahsil edildi", pending: "Tahsil edilecek" },
  expense: { paid: "Ödendi", pending: "Ödenecek" },
};
export const LEDGER_METHODS = [
  { key: "cash", label: "Nakit" },
  { key: "bank", label: "Banka / EFT" },
  { key: "card", label: "Kredi kartı" },
  { key: "other", label: "Diğer" },
];
export const VAT_RATES = [0, 1, 10, 20];
export const PRESET_CATEGORIES: Record<EntryType, string[]> = {
  income: ["Saha kirası", "Lig katılım ücreti", "Sponsorluk", "Aidat", "Forma / malzeme satışı", "Organizasyon", "Diğer gelir"],
  expense: ["Saha kirası", "Hakem ücreti", "Ödül / kupa", "Forma / malzeme", "Yayın / prodüksiyon", "Reklam", "Ulaşım", "Personel", "Vergi / harç", "Diğer gider"],
};

export const LEDGER_PERIODS = [
  { key: "this_month", label: "Bu ay" },
  { key: "last_month", label: "Geçen ay" },
  { key: "this_quarter", label: "Bu çeyrek" },
  { key: "this_year", label: "Bu yıl" },
  { key: "last_12", label: "Son 12 ay" },
  { key: "all", label: "Tümü" },
  { key: "custom", label: "Özel" },
] as const;
export type LedgerPeriod = (typeof LEDGER_PERIODS)[number]["key"];

const iso = (y: number, m: number, d: number) => todayKey(new Date(y, m, d));

/** Dönem → { from, to }; "all" için boş (web ledgerUtils.periodRange). */
export function ledgerPeriodRange(key: LedgerPeriod, today = new Date(), custom: Partial<DayRange> = {}): DayRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (key) {
    case "this_month": return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case "last_month": return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "this_quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: iso(y, q, 1), to: iso(y, q + 3, 0) };
    }
    case "this_year": return { from: iso(y, 0, 1), to: iso(y, 11, 31) };
    case "last_12": return { from: iso(y, m - 11, 1), to: iso(y, m + 1, 0) };
    case "custom": return { from: custom.from || "", to: custom.to || "" };
    default: return { from: "", to: "" };
  }
}

export interface LedgerEntry {
  id: number;
  type: EntryType;
  amount: number;
  vat_rate: number;
  vat_amount: number;
  net_amount: number;
  category: string | null;
  party: string | null;
  description: string | null;
  entry_date: string;
  due_date: string | null;
  status: LedgerStatus;
  method: string | null;
  document_no: string | null;
  note: string | null;
  account_id: number | null;
}

export interface LedgerSummary {
  income: number;
  expense: number;
  net: number;
  receivable: number;
  payable: number;
  overdue: number;
  overdue_amount: number;
  vat_collected: number;
  vat_paid: number;
  vat_balance: number;
  categories: { name: string; type: EntryType; total: number; count: number }[];
  parties: { name: string; count: number; income: number; expense: number; receivable: number; payable: number; balance: number }[];
}

export interface LedgerResponse {
  items: LedgerEntry[];
  summary: LedgerSummary | null;
  trend: { month: string; income: number; expense: number; net: number }[];
}

export interface LedgerBody {
  type: EntryType;
  amount: number;
  vat_rate: number;
  category: string;
  party: string;
  description: string;
  entry_date: string;
  due_date: string | null;
  status: LedgerStatus;
  method: string;
  document_no: string;
  note: string;
  account_id: number | null;
}

export const getLedger = (range: Partial<DayRange> = {}) => get<LedgerResponse>("/api/tools/ledger", clean(range));
export const getToolContacts = () => get<{ items: { id: number; name: string; company?: string | null }[] }>("/api/tools/contacts");
export const createLedgerEntry = (body: LedgerBody) => post<{ item: LedgerEntry }>("/api/tools/ledger", body);
export const updateLedgerEntry = (id: number, body: Partial<LedgerBody>) => patch<{ item: LedgerEntry }>(`/api/tools/ledger/${id}`, body);
export const removeLedgerEntry = (id: number) => del<unknown>(`/api/tools/ledger/${id}`);

export const isLedgerOverdue = (entry: LedgerEntry, today = todayKey()) =>
  entry.status === "pending" && Boolean(entry.due_date) && String(entry.due_date) < today;

/** KDV dahil tutardan KDV payı ve matrah. */
export function splitVat(gross: unknown, rate: number) {
  const amount = parseAmount(gross);
  const g = amount != null && Number.isFinite(amount) ? amount : 0;
  const net = Math.round((g / (1 + (Number(rate) || 0) / 100)) * 100) / 100;
  return { gross: g, net, vat: Math.round((g - net) * 100) / 100 };
}

export interface LedgerFilters {
  type: "" | EntryType;
  status: "" | LedgerStatus | "overdue";
  category: string;
  query: string;
  account: string;
}

export function filterLedger(entries: LedgerEntry[], f: LedgerFilters): LedgerEntry[] {
  const q = f.query.trim().toLocaleLowerCase("tr-TR");
  return entries.filter((e) =>
    (!f.type || e.type === f.type) &&
    (!f.account || (f.account === "none" ? !e.account_id : String(e.account_id || "") === f.account)) &&
    (!f.status || (f.status === "overdue" ? isLedgerOverdue(e) : e.status === f.status)) &&
    (!f.category || (e.category || "Diğer") === f.category) &&
    (!q || [e.description, e.party, e.category, e.document_no, e.note].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(q))
  );
}

export function ledgerTotals(entries: LedgerEntry[]) {
  return entries.reduce(
    (s, e) => {
      s.count += 1;
      s[e.type] += e.amount;
      s.net += (e.type === "income" ? 1 : -1) * e.amount;
      return s;
    },
    { count: 0, income: 0, expense: 0, net: 0 }
  );
}

const csvMoney = (value: unknown) => (Number(value) || 0).toFixed(2).replace(".", ",");

/** Ön muhasebe CSV'si (web ledgerUtils.toCsv). */
export function ledgerCsv(entries: LedgerEntry[]): string {
  const methodLabel = (key: string | null) => LEDGER_METHODS.find((m) => m.key === key)?.label || key || "";
  return toCsv([
    ["Tarih", "Tür", "Kategori", "Cari", "Açıklama", "Tutar (KDV dahil)", "KDV %", "KDV", "Matrah", "Durum", "Vade", "Ödeme yöntemi", "Belge no", "Not"],
    ...entries.map((e) => [
      e.entry_date, LEDGER_TYPE_LABELS[e.type], e.category, e.party, e.description, csvMoney(e.amount), e.vat_rate, csvMoney(e.vat_amount),
      csvMoney(e.net_amount), LEDGER_STATUS_BY_TYPE[e.type]?.[e.status] || e.status, e.due_date, methodLabel(e.method), e.document_no, e.note,
    ]),
  ]);
}

/* ===================== Maç Muhasebesi (/api/admin/accounting) ===================== */

export interface AccCategory {
  key: string;
  label: string;
  short: string;
  direction: EntryType;
  fixed: boolean;
  duty: string | null;
  team: "home" | "away" | null;
}

export interface AccMeta {
  categories: AccCategory[];
  statuses: { key: string; label: string }[];
  paymentMethods: { key: string; label: string }[];
  book: { cityId: number | null; cityName: string | null; nationwide: boolean };
}

export interface AccSeasonLeague {
  leagueId: number | null;
  league: string;
  archived: boolean;
  seasons: { id: number; name: string; year: string | null; archived: boolean; matchCount: number | null; selected: boolean }[];
}

export interface AccStaff {
  id: number;
  fullName: string;
  duties: string[];
  status?: string;
}

export interface AccEntry {
  id: number;
  matchId: number | null;
  date: string;
  direction: EntryType;
  category: string;
  categoryLabel: string;
  title: string | null;
  amount: number;
  status: "paid" | "pending";
  paidAt: string | null;
  paymentMethod: string | null;
  staffId: number | null;
  effectiveStaffId: number | null;
  staffName: string | null;
  teamId: number | null;
  seasonId: number | null;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccTotals {
  income: number;
  expense: number;
  net: number;
  collected: number;
  receivable: number;
  paidOut: number;
  payable: number;
  byCategory: Record<string, number>;
  matchCount: number;
  margin: number | null;
}

export interface AccMatch {
  id: number;
  date: string;
  time: string | null;
  home: string;
  away: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  score: string | null;
  field: string | null;
  league: string | null;
  seasonId: number | null;
  season: string | null;
  status: string;
  crew: Record<string, { staffId: number; name: string }>;
  cells: Record<string, AccEntry>;
  extras: AccEntry[];
  totals: AccTotals;
  locked: boolean;
}

export interface AccDay {
  date: string;
  matches: AccMatch[];
  entries: AccEntry[];
  totals: AccTotals;
}

export interface AccSettings {
  seasonIds: number[];
  defaults: Record<string, number>;
  fieldRates: Record<string, number>;
  excludeDrafts: boolean;
  monthlyTarget: number | null;
  teamRates: Record<string, number>;
  staffRates: Record<string, number>;
  budgets: Record<string, number>;
  lockedUntil: string | null;
}

export type AccPeriodRow = AccTotals & { key: string; week?: number; year?: number; from?: string; to?: string };
export type AccRankRow = AccTotals & { key: string | number; name?: string; league?: string };

export interface AccStaffRow {
  staffId: number;
  name: string;
  tasks: number;
  earned: number;
  paid: number;
  pending: number;
  byCategory: Record<string, number>;
  entryIds: number[];
  pendingEntryIds: number[];
  matchCount: number;
  unpaidTasks: number;
  average: number;
}

export interface AccTeamRow {
  teamId: number | null;
  name: string;
  matches: number;
  billed: number;
  collected: number;
  outstanding: number;
  pendingEntryIds: number[];
  unbilledMatches: number;
  oldestPending: string | null;
  lastMatch: string | null;
}

export interface AccMissingRow {
  matchId: number;
  date: string;
  label: string;
  noIncome: boolean;
  noExpense: boolean;
  status: string;
}

export interface AccAgingRow {
  key: string;
  label: string;
  amount: number;
  count: number;
}

export interface AccBook {
  book: { cityId: number | null; cityName: string | null; key: string };
  range: DayRange;
  settings: AccSettings;
  selectedSeasons: { id: number; name: string; league: string }[];
  months: { month: string; days: AccDay[]; totals: AccTotals }[];
  days: AccDay[];
  summary: AccTotals & { averageIncomePerMatch: number; averageExpensePerMatch: number; averageNetPerMatch: number };
  reports: {
    monthly: AccPeriodRow[];
    weekly: AccPeriodRow[];
    daily: AccPeriodRow[];
    byField: AccRankRow[];
    byLeague: AccRankRow[];
    bySeason: AccRankRow[];
    expenseBreakdown: { key: string; label: string; amount: number }[];
    incomeBreakdown: { key: string; label: string; amount: number }[];
    staff: AccStaffRow[];
    teams: AccTeamRow[];
    missing: AccMissingRow[];
    byWeekday: (AccTotals & { key: number; label: string })[];
    byMethod: { key: string; label: string; income: number; expense: number; count: number }[];
    aging: { receivable: AccAgingRow[]; payable: AccAgingRow[]; asOf: string | null };
  };
  previous?: { range: DayRange; summary: AccTotals; daily: AccPeriodRow[] } | null;
}

/** Kutucuk gövdesi: null → kutucuğu sil. */
export type CellBody = { amount: number; status?: string; paymentMethod?: string | null; note?: string | null; staffId?: number | null } | null;

export interface AccEntryBody {
  matchId?: number | null;
  date?: string;
  category: string;
  title?: string | null;
  amount: number | null;
  status?: string;
  paymentMethod?: string | null;
  staffId?: number | null;
  seasonId?: number | string | null;
  note?: string | null;
}

/** Türkiye geneli kullanıcı için ?cityId; il rolü için boş. */
export type CityScope = { cityId?: number | string };

const A = "/api/admin/accounting";

export const accMeta = (scope: CityScope = {}) => get<AccMeta>(`${A}/meta`, clean(scope));
export const accSeasons = (scope: CityScope = {}) => get<{ leagues: AccSeasonLeague[]; selectedSeasonIds: number[] }>(`${A}/seasons`, clean(scope));
export const accStaff = (scope: CityScope = {}) => get<{ items: AccStaff[] }>(`${A}/staff`, clean(scope));
export const accSaveSettings = (settings: Partial<AccSettings>, scope: CityScope = {}) =>
  put<{ settings: AccSettings }>(`${A}/settings`, { settings }, { params: clean(scope) });
export const accBook = (params: DayRange & { seasonIds?: number[] }, scope: CityScope = {}) =>
  get<AccBook>(`${A}/book`, clean({ ...scope, ...params, compare: 1 }));
export const accSaveCells = (matchId: number, cells: Record<string, CellBody>, scope: CityScope = {}) =>
  put<unknown>(`${A}/matches/${matchId}/cells`, { cells }, { params: clean(scope) });
export const accCreateEntry = (body: AccEntryBody, scope: CityScope = {}) => post<{ item: AccEntry }>(`${A}/entries`, body, { params: clean(scope) });
export const accUpdateEntry = (id: number, body: Partial<AccEntryBody>, scope: CityScope = {}) =>
  patch<{ item: AccEntry }>(`${A}/entries/${id}`, body, { params: clean(scope) });
export const accDeleteEntry = (id: number, scope: CityScope = {}) => del<unknown>(`${A}/entries/${id}`, undefined, { params: clean(scope) });
export const accSetStatus = (ids: number[], status: "paid" | "pending", scope: CityScope = {}) =>
  post<{ updated: number }>(`${A}/entries/status`, { ids, status, paymentMethod: null }, { params: clean(scope) });
export const accApplyDefaults = (body: DayRange & { seasonIds?: number[]; matchIds?: number[] }, scope: CityScope = {}) =>
  post<{ created: number; matches: number; locked?: number }>(`${A}/apply-defaults`, body, { params: clean(scope) });

/** İl listesi (Türkiye geneli kullanıcının il seçicisi; web api.get("/sehirler")). */
export const listCities = () => get<{ id: number; city_name: string }[]>("/sehirler");

/** Maçtaki bekleyen kutucuk var mı. */
export const matchHasPending = (m: AccMatch) => [...Object.values(m.cells), ...m.extras].some((e) => e.status === "pending");
/** Takım ücreti ya da gider girilmemiş. */
export const matchIsMissing = (m: AccMatch) => (!m.cells.takim_ev && !m.cells.takim_deplasman) || m.totals.expense === 0;

/** Defter süzgeci (web LedgerTable.filterBook) — günleri düz liste döndürür. */
export function filterBookDays(book: AccBook | undefined, { query = "", mode = "all" }: { query?: string; mode?: "all" | "missing" | "pending" }): AccDay[] {
  if (!book?.days) return [];
  const needle = query.trim().toLocaleLowerCase("tr");
  const active = Boolean(needle) || mode !== "all";
  if (!active) return book.days;
  return book.days
    .map((day) => {
      const matches = day.matches.filter((m) => {
        if (needle && ![m.home, m.away, m.field, m.league, m.season].filter(Boolean).join(" ").toLocaleLowerCase("tr").includes(needle)) return false;
        if (mode === "missing") return matchIsMissing(m);
        if (mode === "pending") return matchHasPending(m);
        return true;
      });
      const entries = mode === "missing" ? [] : day.entries.filter((e) => {
        if (needle && !`${e.title || ""} ${e.categoryLabel}`.toLocaleLowerCase("tr").includes(needle)) return false;
        return mode !== "pending" || e.status === "pending";
      });
      return { ...day, matches, entries };
    })
    .filter((day) => day.matches.length || day.entries.length);
}

export const allMatches = (book?: AccBook) => (book?.days || []).flatMap((d) => d.matches);
export const allAccEntries = (book?: AccBook) =>
  (book?.days || []).flatMap((day) => [
    ...day.matches.flatMap((m) => [...Object.values(m.cells), ...m.extras].map((e) => ({ ...e, match: m as AccMatch | null }))),
    ...day.entries.map((e) => ({ ...e, match: null as AccMatch | null })),
  ]);

/** Bekleyen kayıt kimlikleri (web AccountingAdmin.pendingIds). */
export function pendingIds(matches: AccMatch[], { income, expense, dayEntries = [] }: { income?: boolean; expense?: boolean; dayEntries?: AccEntry[] }) {
  return [...matches.flatMap((m) => [...Object.values(m.cells), ...m.extras]), ...dayEntries]
    .filter((e) => e.status === "pending" && ((income && e.direction === "income" && (e.category === "takim_ev" || e.category === "takim_deplasman")) || (expense && e.direction === "expense")))
    .map((e) => e.id);
}

/** Kalem için önerilen tutar: saha/takım/personel tarifesi, yoksa varsayılan. */
export function suggestedAmount(category: AccCategory | undefined, match: AccMatch, settings?: AccSettings | null): number | null {
  if (!category?.fixed || !settings) return null;
  const pick = (v: unknown) => (v != null && Number(v) > 0 ? Number(v) : null);
  if (category.key === "saha") return pick(settings.fieldRates?.[match.field || ""]) ?? pick(settings.defaults?.saha);
  if (category.team) {
    const teamId = category.team === "home" ? match.homeTeamId : match.awayTeamId;
    return pick(settings.teamRates?.[String(teamId)]) ?? pick(settings.defaults?.[category.key]);
  }
  if (category.duty) {
    const staffId = match.crew?.[category.duty]?.staffId;
    return pick(settings.staffRates?.[String(staffId)]) ?? pick(settings.defaults?.[category.key]);
  }
  return pick(settings.defaults?.[category.key]);
}

export const isLockedDay = (settings: AccSettings | undefined | null, day?: string | null) =>
  Boolean(settings?.lockedUntil && day && day <= settings.lockedUntil);

export interface StatementRow {
  key: string;
  date: string;
  label: string;
  detail: string;
  amount: number | null;
  status: string | null;
  entryId: number | null;
  match: AccMatch | null;
}

/** Takımın dönem içi maç ücretleri (web teamStatement). */
export function teamStatement(book: AccBook | undefined, team: AccTeamRow): StatementRow[] {
  const rows: StatementRow[] = [];
  allMatches(book).forEach((m) => {
    const sides: string[] = [];
    if ((team.teamId != null && m.homeTeamId === team.teamId) || (team.teamId == null && m.home === team.name)) sides.push("takim_ev");
    if ((team.teamId != null && m.awayTeamId === team.teamId) || (team.teamId == null && m.away === team.name)) sides.push("takim_deplasman");
    sides.forEach((side) => {
      const cell = m.cells[side];
      rows.push({
        key: `${m.id}:${side}`,
        date: m.date,
        label: `${m.home} - ${m.away}`,
        detail: [side === "takim_ev" ? "Ev sahibi" : "Deplasman", m.field].filter(Boolean).join(" · "),
        amount: cell ? cell.amount : null,
        status: cell ? cell.status : null,
        entryId: cell?.id ?? null,
        match: m,
      });
    });
  });
  return rows;
}

/** Personelin dönem içi ödemeleri (web staffStatement). */
export function staffStatement(book: AccBook | undefined, person: AccStaffRow): StatementRow[] {
  return allAccEntries(book)
    .filter((e) => e.direction === "expense" && Number(e.effectiveStaffId ?? e.staffId) === Number(person.staffId))
    .map((e) => ({
      key: String(e.id),
      date: e.date,
      label: e.match ? `${e.match.home} - ${e.match.away}` : e.title || e.categoryLabel,
      detail: [e.categoryLabel, e.match?.field, e.match && e.title ? e.title : null].filter(Boolean).join(" · "),
      amount: e.amount,
      status: e.status,
      entryId: e.id,
      match: e.match,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** WhatsApp / mesaj için düz metin ekstre (web statementText; işaretler metin). */
export function statementText({ title, subtitle, rows, totals }: { title: string; subtitle?: string; rows: StatementRow[]; totals: [string, string][] }): string {
  const lines = [`*${title}*`];
  if (subtitle) lines.push(subtitle);
  lines.push("");
  rows.forEach((r) => {
    const mark = r.status === "paid" ? "[Ödendi]" : r.amount == null ? "[Girilmedi]" : "[Bekliyor]";
    lines.push(`${mark} ${shortDay(r.date)} ${r.label}${r.amount != null ? ` — ${money(r.amount)}` : " — ücret girilmedi"}`);
  });
  lines.push("");
  totals.forEach(([label, value]) => lines.push(`${label}: *${value}*`));
  return lines.join("\n");
}

/** Defter CSV'si (web ledgerCsvRows): her maç, kalem, gün ve ay toplamı. */
export function bookCsv(book: AccBook, categories: AccCategory[]): string {
  const fixed = categories.filter((c) => c.fixed);
  const rows: unknown[][] = [["Tarih", "Saat", "Maç / Kalem", "Lig", "Sezon", "Saha", ...fixed.map((c) => c.label), "Diğer Gider", "Diğer Gelir", "Toplam Gelir", "Toplam Gider", "Net"]];
  const cellsFor = (by: Record<string, number>) => fixed.map((c) => by[c.key] || 0);
  (book.months || []).forEach((month) => {
    month.days.forEach((day) => {
      day.matches.forEach((m) => {
        rows.push([day.date, m.time || "", `${m.home} - ${m.away}`, m.league || "", m.season || "", m.field || "", ...fixed.map((c) => m.cells[c.key]?.amount ?? ""), m.totals.byCategory.diger || 0, m.totals.byCategory.gelir_diger || 0, m.totals.income, m.totals.expense, m.totals.net]);
        m.extras.forEach((x) => rows.push([day.date, "", `  > ${x.title || x.categoryLabel}`, "", "", "", ...fixed.map(() => ""), x.direction === "expense" ? x.amount : "", x.direction === "income" ? x.amount : "", "", "", ""]));
      });
      day.entries.forEach((e) => {
        rows.push([day.date, "", `Gün sonu: ${e.title || e.categoryLabel}`, "", "", "", ...fixed.map((c) => (c.key === e.category ? e.amount : "")), e.category === "diger" ? e.amount : "", e.category === "gelir_diger" ? e.amount : "", e.direction === "income" ? e.amount : "", e.direction === "expense" ? e.amount : "", ""]);
      });
      rows.push([day.date, "", "GÜN TOPLAMI", "", "", "", ...cellsFor(day.totals.byCategory), day.totals.byCategory.diger || 0, day.totals.byCategory.gelir_diger || 0, day.totals.income, day.totals.expense, day.totals.net]);
    });
    rows.push([month.month, "", "AY TOPLAMI", "", "", "", ...cellsFor(month.totals.byCategory), month.totals.byCategory.diger || 0, month.totals.byCategory.gelir_diger || 0, month.totals.income, month.totals.expense, month.totals.net]);
  });
  return toCsv(rows);
}

export function summaryCsv(book: AccBook, categories: AccCategory[]): string {
  const s = book.summary;
  return toCsv([
    ["Dönem", rangeLabel(book.range)], ["Maç", s.matchCount], ["Gelir", s.income], ["Gider", s.expense], ["Net kâr", s.net], ["Kâr marjı %", s.margin ?? ""],
    ["Tahsil edilen", s.collected], ["Alacak", s.receivable], ["Ödenen", s.paidOut], ["Borç", s.payable], [],
    ["Kalem", "Tutar"], ...categories.map((c) => [c.label, s.byCategory[c.key] || 0]),
  ]);
}

export const staffCsv = (book: AccBook) =>
  toCsv([["Personel", "Görev", "Maç", "Kazanç", "Ödenen", "Bekleyen", "Görev başı", "Ödemesi girilmemiş görev"], ...book.reports.staff.map((r) => [r.name, r.tasks, r.matchCount, r.earned, r.paid, r.pending, r.average, r.unpaidTasks])]);

export const teamsCsv = (book: AccBook) =>
  toCsv([["Takım", "Maç", "Ücret girilmeyen", "Faturalanan", "Tahsil edilen", "Alacak", "En eski borç"], ...book.reports.teams.map((r) => [r.name, r.matches, r.unbilledMatches, r.billed, r.collected, r.outstanding, r.oldestPending || ""])]);

export const periodCsv = (rows: AccPeriodRow[], labelOf: (r: AccPeriodRow) => string) =>
  toCsv([["Dönem", "Maç", "Gelir", "Gider", "Net", "Marj %", "Alacak", "Borç"], ...rows.map((r) => [labelOf(r), r.matchCount, r.income, r.expense, r.net, r.margin ?? "", r.receivable, r.payable])]);

export const rankCsv = (rows: AccRankRow[], nameOf: (r: AccRankRow) => string) =>
  toCsv([["Ad", "Maç", "Gelir", "Gider", "Net", "Maç başı net"], ...rows.map((r) => [nameOf(r), r.matchCount, r.income, r.expense, r.net, r.matchCount ? Math.round((r.net / r.matchCount) * 100) / 100 : ""])]);

/** Ayın aynı gününü bir sonraki aya taşır (31 → ay sonu). */
export function nextMonthDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = monthRange(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
  const last = Number(target.to.slice(8));
  return `${target.from.slice(0, 8)}${pad(Math.min(d, last))}`;
}

/** Maç ayrıntısında personel seçilebilen kalemler. */
export const PERSONNEL_CATEGORIES = ["hakem", "call_center", "spiker", "reji", "saglikci", "fotografci", "sosyal_medya"];
export const EXTRA_PRESETS = ["Top", "Su ve buz", "Ulaşım", "Kupa / madalya", "Forma", "İkram"];
export const GENERAL_TEMPLATES = [
  { title: "Saha kirası", category: "diger" },
  { title: "Ekipman", category: "diger" },
  { title: "Ulaşım", category: "diger" },
  { title: "Su / ikram", category: "diger" },
  { title: "Reklam", category: "diger" },
  { title: "Kupa / ödül", category: "diger" },
  { title: "Sponsor geliri", category: "gelir_diger" },
  { title: "Bağış", category: "gelir_diger" },
];

/* ===================== Türkiye Geneli (/api/admin/national-accounting) ===================== */

export const RATE_SCOPES: Record<string, string> = { general: "Genel", city: "İl", season: "Sezon (bayilik)" };

export interface NaRate {
  id: number;
  scope: "general" | "city" | "season";
  cityId: number | null;
  cityName: string | null;
  seasonId: number | null;
  seasonName: string | null;
  leagueName: string | null;
  validFrom: string | null;
  fee: number;
  note: string | null;
}

export interface NaEntry {
  id: number;
  kind: "payment" | "charge" | "override";
  cityId: number;
  cityName?: string;
  date?: string | null;
  period?: string | null;
  seasonId?: number | null;
  seasonName?: string | null;
  amount: number;
  paymentMethod?: string | null;
  title?: string | null;
  note?: string | null;
}

export interface NaLine {
  cityId: number;
  period: string;
  seasonId: number | null;
  seasonName: string;
  leagueName: string | null;
  leagues: { name: string; count: number }[];
  matchCount: number;
  fee: number;
  rate: NaRate | null;
  calculated: number;
  amount: number;
  override: { id: number; amount: number; note: string | null } | null;
}

export interface NaMonth {
  period: string;
  label: string;
  matchCount: number;
  calculated: number;
  adjustment: number;
  due: number;
  paid: number;
  balance: number;
}

export interface NaCity {
  cityId: number;
  name: string;
  opening: number;
  matchCount: number;
  calculated: number;
  adjustment: number;
  due: number;
  paid: number;
  balance: number;
  lastPayment: { date: string; amount: number } | null;
  months: NaMonth[];
  lines: NaLine[];
  charges: NaEntry[];
  payments: NaEntry[];
  seasons: { seasonId: number | null; seasonName: string; leagueName: string | null; matchCount: number; amount: number }[];
  rates: NaRate[];
}

export interface NaStatement {
  range: { from: string; to: string };
  months: { period: string; label: string }[];
  totals: { balance: number; due: number; paid: number; calculated: number; adjustment: number; matchCount: number; cityCount: number; debtorCount: number; opening: number };
  monthly: NaMonth[];
  cities: NaCity[];
  payments: NaEntry[];
  unassignedMatches: number;
}

export interface NaOptions {
  cities: { id: number; name: string }[];
  seasons: { id: number; name: string; cityId: number | null; leagueName?: string | null; archived?: boolean }[];
  paymentMethods: { key: string; label: string }[];
  kinds: { key: string; label: string }[];
}

const N = "/api/admin/national-accounting";

export const naOptions = () => get<NaOptions>(`${N}/options`);
export const naStatement = (range: { from: string; to: string }) => get<NaStatement>(`${N}/statement`, clean(range));
export const naRates = () => get<{ items: NaRate[] }>(`${N}/rates`);
export interface NaRateBody {
  cityId: string | number | null;
  seasonId: string | number | null;
  validFrom: string | null;
  fee: string | number;
  note: string;
}
export const naCreateRate = (body: NaRateBody) => post<{ message?: string }>(`${N}/rates`, body);
export const naUpdateRate = (id: number, body: NaRateBody) => put<{ message?: string }>(`${N}/rates/${id}`, body);
export const naRemoveRate = (id: number) => del<unknown>(`${N}/rates/${id}`);
export interface NaEntryBody {
  kind: "payment" | "charge" | "override";
  cityId: number | null;
  amount: string | number;
  note: string;
  date?: string;
  paymentMethod?: string;
  title?: string;
  period?: string;
  seasonId?: number | null;
}
export const naCreateEntry = (body: NaEntryBody) => post<{ message?: string }>(`${N}/entries`, body);
export const naUpdateEntry = (id: number, body: NaEntryBody) => put<{ message?: string }>(`${N}/entries/${id}`, body);
export const naRemoveEntry = (id: number) => del<unknown>(`${N}/entries/${id}`);

/** İstanbul saatine göre "YYYY-MM". */
export const currentPeriod = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).slice(0, 7);
export function shiftPeriod(period: string, count: number): string {
  const [y, m] = period.split("-").map(Number);
  const index = y * 12 + (m - 1) + count;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** Türkiye geneli hazır dönemleri (ay aralığı). */
export const NATIONAL_PRESETS: { key: string; label: string; range: () => { from: string; to: string } }[] = [
  { key: "year", label: "Bu yıl", range: () => ({ from: `${currentPeriod().slice(0, 4)}-01`, to: currentPeriod() }) },
  { key: "12", label: "Son 12 ay", range: () => ({ from: shiftPeriod(currentPeriod(), -11), to: currentPeriod() }) },
  { key: "6", label: "Son 6 ay", range: () => ({ from: shiftPeriod(currentPeriod(), -5), to: currentPeriod() }) },
  { key: "month", label: "Bu ay", range: () => ({ from: currentPeriod(), to: currentPeriod() }) },
  {
    key: "lastYear",
    label: "Geçen yıl",
    range: () => {
      const y = Number(currentPeriod().slice(0, 4)) - 1;
      return { from: `${y}-01`, to: `${y}-12` };
    },
  },
];

/** Bakiye tonu: artı borçtur, eksi fazla ödemedir. */
export const balanceTone = (value: number): "danger" | "win" | "neutral" => (value > 0 ? "danger" : value < 0 ? "win" : "neutral");

export function rateText(rate: NaRate | null | undefined): string {
  if (!rate) return "Tarife yok";
  const scope = rate.scope === "season" ? "Sezon tarifesi" : rate.scope === "city" ? "İl tarifesi" : "Genel tarife";
  return rate.validFrom ? `${scope} · ${monthLabel(rate.validFrom)}'dan itibaren` : scope;
}

const csvNumber = (value: unknown) => (Number(value) || 0).toFixed(2).replace(".", ",");

export function nationalCitiesCsv(data: NaStatement): string {
  return toCsv([
    ["İl", "Devreden", "Maç", "Hesaplanan", "Düzeltme / kalem", "Tahakkuk", "Tahsilat", "Kalan borç", "Son ödeme", ...data.months.map((m) => `${m.label} maç`), ...data.months.map((m) => `${m.label} tahakkuk`)],
    ...data.cities.map((c) => [c.name, csvNumber(c.opening), c.matchCount, csvNumber(c.calculated), csvNumber(c.adjustment), csvNumber(c.due), csvNumber(c.paid), csvNumber(c.balance), c.lastPayment ? c.lastPayment.date : "", ...c.months.map((m) => m.matchCount), ...c.months.map((m) => csvNumber(m.due))]),
  ]);
}

export function nationalLinesCsv(data: NaStatement): string {
  return toCsv([
    ["İl", "Ay", "Sezon", "Lig", "Maç", "Maç başı ücret", "Hesaplanan", "Alınacak", "Düzeltme notu"],
    ...data.cities.flatMap((c) => c.lines.map((l) => [c.name, l.period, l.seasonName, l.leagueName || "", l.matchCount, csvNumber(l.fee), csvNumber(l.calculated), csvNumber(l.amount), l.override?.note || ""])),
  ]);
}
