import { del, get, post, put } from "../../http";
import type { AuthUser } from "../../types";

/**
 * PERSONEL VE GÖREVLENDİRME — routes/staff.js (/api/staff)
 *
 * Web: pages/management/StaffManagement.js, staff/*, staffBulk/*.
 * Personel (spiker, reji, hakem, fotoğrafçı, sağlıkçı) yönetimden eklenir;
 * maçlara görevlendirilir. Puanlar burada girilmez: takımlar ve oyuncular
 * maçı maç merkezinden puanlıyor, rapor bunu kişiye bağlıyor.
 */

export type StaffStatus = "active" | "passive";

export interface StaffDuty {
  key: string;
  label: string;
}

export interface StaffMatchRef {
  id: number;
  label: string;
  day: string | null;
  time: string | null;
}

export interface StaffLinkedUser {
  id: number;
  name: string;
  username: string | null;
  role: string;
  status: string | null;
  /** "link" açık bağ, "name" ad soyad eşleşmesi */
  source: string;
}

/** staffService.serializeStaff + liste özetleri. */
export interface StaffMember {
  id: number;
  fullName: string;
  duties: string[];
  dutyLabels: string[];
  duty: string | null;
  dutyLabel: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  cityId: number | null;
  city: string | null;
  status: StaffStatus;
  userId: number | null;
  createdAt: string | null;
  matchCount?: number;
  upcomingCount?: number;
  lastMatch?: StaffMatchRef | null;
  nextMatch?: StaffMatchRef | null;
  ratingCount?: number;
  average?: number | null;
  linkedUser?: StaffLinkedUser | null;
}

export interface StaffListResponse {
  items: StaffMember[];
  duties: StaffDuty[];
}

export interface StaffPayload {
  fullName: string;
  duties: string[];
  phone?: string;
  email?: string;
  notes?: string;
  userId?: number | null;
  status?: StaffStatus;
  cityId?: number | null;
}

export interface StaffRating {
  type: "team" | "player" | string;
  name: string;
  teamName?: string | null;
  teamId?: number | null;
  playerId?: number | null;
  score: number;
  comment?: string | null;
}

export interface StaffReportMatch {
  matchId: number;
  matchLabel: string;
  duty: string;
  dutyLabel: string;
  date: string | null;
  league: string | null;
  rated: boolean;
  average: number | null;
  raterCount: number;
  ratings: StaffRating[];
}

export interface StaffReport {
  staff: StaffMember;
  matches: StaffReportMatch[];
  summary: {
    matchCount: number;
    ratedMatchCount: number;
    average: number | null;
    byDuty: { duty: string; dutyLabel: string; matchCount: number; average: number | null; ratingCount: number }[];
  };
}

export interface LinkableUser {
  id: number;
  name: string;
  role: string;
  city: string | null;
}

export interface RosterEntry {
  user: { id: number; name: string; role: string; city: string | null };
  staff: { id: number; fullName: string; source: string } | null;
}

export interface ManagementRole {
  key: string;
  label: string;
  nationwide?: boolean;
  assignable?: boolean;
}

export interface CrewSlot {
  staffId: number;
  name: string;
}

/** staffService.assignableMatches satırı. */
export interface AssignableMatch {
  id: number;
  label: string;
  day: string | null;
  time: string | null;
  startsAt: string | null;
  field: string | null;
  league: string | null;
  season: string | null;
  city: string | null;
  cityId: number | null;
  status: string | null;
  crew: Record<string, CrewSlot>;
  assignedCount: number;
  dutyCount: number;
}

export type AssignmentMap = Record<string, number | null>;

export interface BulkAssignResult {
  message: string;
  updated: { matchId: number; assignments: Record<string, { staffId: number; fullName?: string; name?: string } | null> }[];
  errors: { matchId: number; error: string }[];
}

/* ───────────────────────────── uçlar ───────────────────────────── */

export const listStaff = (params?: { status?: string; duty?: string; search?: string }) =>
  get<StaffListResponse>("/api/staff", params);

export const createStaff = (body: StaffPayload) =>
  post<{ message: string; item: StaffMember }>("/api/staff", body);

export const updateStaff = (id: number, body: Partial<StaffPayload>) =>
  put<{ message: string; item: StaffMember }>(`/api/staff/${id}`, body);

export const deleteStaff = (id: number) => del<{ message: string }>(`/api/staff/${id}`);

export const getStaffReport = (id: number) => get<StaffReport>(`/api/staff/${id}/report`);

export const getLinkableUsers = () =>
  get<{ items: LinkableUser[] }>("/api/staff/linkable-users").then((d) => d.items ?? []);

export const getManagementRoster = () =>
  get<{ items: RosterEntry[] }>("/api/staff/management-users").then((d) => d.items ?? []);

export const importManagementUsers = (userIds?: number[]) =>
  post<{ message: string; items: RosterEntry[] }>("/api/staff/management-users/import", { userIds });

export const createStaffAccount = (id: number, body: { username: string; password: string; role: string; city?: string }) =>
  post<{ message: string; item: StaffMember }>(`/api/staff/${id}/account`, body);

/** Yönetim rolleri — hesap açma formu (routes/adminManagementUsers.js). */
export const getManagementRoles = () =>
  get<{ roles: ManagementRole[] }>("/api/admin/management-users/roles").then((d) => d.roles ?? []);

export const getAssignableMatches = (params: { range: "upcoming" | "past" | "all"; days?: number }) =>
  get<{ duties: StaffDuty[]; items: AssignableMatch[] }>("/api/staff/matches", params);

export const saveBulkAssignments = (items: { matchId: number; assignments: AssignmentMap }[]) =>
  put<BulkAssignResult>("/api/staff/matches/bulk", { items });

/* ─────────────────────────── sözlükler ─────────────────────────── */

/** Sunucuya ulaşılamazsa görev listesi (staffService.DUTIES). */
export const FALLBACK_DUTIES: StaffDuty[] = [
  { key: "spiker", label: "Spiker" },
  { key: "reji", label: "Reji" },
  { key: "hakem", label: "Hakem" },
  { key: "fotografci", label: "Fotoğrafçı" },
  { key: "saglikci", label: "Sağlıkçı" },
];

export const STAFF_SORTS = [
  { key: "name", label: "Ada göre" },
  { key: "matches", label: "En çok görev" },
  { key: "upcoming", label: "Yaklaşan görev" },
  { key: "rating", label: "En yüksek puan" },
] as const;
export type StaffSort = (typeof STAFF_SORTS)[number]["key"];

/** Türkiye geneli roller (sunucu config/roles.js NATIONWIDE_ROLES). */
const NATIONWIDE_ROLES = ["admin", "disiplin_kurulu"];
export const isNationwideUser = (user: AuthUser | null | undefined) => Boolean(user && NATIONWIDE_ROLES.includes(user.role));
export const isNationwideRole = (roles: ManagementRole[], key: string) => {
  const role = roles.find((r) => r.key === key);
  return role ? Boolean(role.nationwide) : NATIONWIDE_ROLES.includes(key);
};

/* ─────────────────────────── yardımcılar ─────────────────────────── */

const TR_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u", â: "a", î: "i", û: "u" };

/** "Berke Yazıcı" → "berke.yazici" (sunucu kuralı: 3-40 karakter, a-z 0-9 . _ -). */
export function suggestUsername(fullName: string, taken: Set<string> = new Set()): string {
  const ascii = String(fullName || "")
    .split("")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  let base = ascii.split(/[^a-z0-9]+/).filter(Boolean).join(".").slice(0, 36).replace(/\.+$/, "");
  if (base.length < 3) base = `${base || "personel"}${base ? ".elit" : ""}`.slice(0, 36);
  let candidate = base;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${base}${counter}`;
    counter += 1;
  }
  return candidate;
}

export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/;

/** Sunucunun şifre kuralı: en az 8 karakter, bir harf ve bir rakam. */
export function passwordProblem(value: string): string {
  const text = String(value || "");
  if (text.length < 8) return "Şifre en az 8 karakter olmalı.";
  if (!/[A-Za-zğüşıöçĞÜŞİÖÇ]/.test(text) || !/[0-9]/.test(text)) return "Şifre en az bir harf ve bir rakam içermeli.";
  return "";
}

const LETTERS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";

/** Okunması kolay (benzer karakterler çıkarılmış) şifre. */
export function generatePassword(length = 10): string {
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars: string[] = [];
  for (let i = 0; i < length - 2; i += 1) chars.push(pick(LETTERS));
  chars.push(pick(DIGITS), pick(DIGITS));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Hesap açmada varsayılan rol: maç yöneticisi, yoksa admin dışı ilk rol. */
export function pickDefaultRole(roles: ManagementRole[]): string {
  const assignable = roles.filter((r) => r.assignable !== false);
  return (assignable.find((r) => r.key === "mac_yoneticisi") || assignable.find((r) => r.key !== "admin") || assignable[0])?.key || "";
}

/** { day: "2026-10-12", time: "20:00" } → "12 Eki · 20:00" */
export function formatMatchWhen(match?: { day: string | null; time: string | null } | null): string {
  if (!match?.day) return "";
  const date = new Date(`${match.day}T12:00:00`);
  const day = Number.isNaN(date.getTime()) ? match.day : date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  return match.time ? `${day} · ${match.time}` : day;
}

export const dutiesOf = (item: StaffMember) =>
  Array.isArray(item.duties) && item.duties.length ? item.duties : [item.duty].filter(Boolean) as string[];

export interface StaffFilters {
  search: string;
  duty: string;
  account: "all" | "with" | "without";
  status: "active" | "passive" | "all";
  sort: StaffSort;
  /** "" tümü, "none" ili belirtilmemiş, diğerleri il kimliği */
  city: string;
}

/** Web staffUtils.filterStaff ile aynı süzgeç ve sıralama. */
export function filterStaff(items: StaffMember[], f: StaffFilters): StaffMember[] {
  const needle = f.search.trim().toLocaleLowerCase("tr-TR");
  const list = items.filter((item) => {
    if (f.status !== "all" && (item.status || "active") !== f.status) return false;
    if (f.city === "none" && (item.cityId || item.city)) return false;
    if (f.city && f.city !== "none" && String(item.cityId || "") !== f.city) return false;
    if (f.duty && !dutiesOf(item).includes(f.duty)) return false;
    if (f.account === "with" && !item.linkedUser) return false;
    if (f.account === "without" && item.linkedUser) return false;
    if (!needle) return true;
    return [item.fullName, item.phone, item.email, item.city, item.linkedUser?.username, ...(item.dutyLabels || [])]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("tr-TR")
      .includes(needle);
  });
  const byName = (a: StaffMember, b: StaffMember) => a.fullName.localeCompare(b.fullName, "tr");
  const sorters: Record<StaffSort, (a: StaffMember, b: StaffMember) => number> = {
    name: byName,
    matches: (a, b) => (b.matchCount || 0) - (a.matchCount || 0) || byName(a, b),
    upcoming: (a, b) => (b.upcomingCount || 0) - (a.upcomingCount || 0) || byName(a, b),
    rating: (a, b) => (b.average ?? -1) - (a.average ?? -1) || byName(a, b),
  };
  return [...list].sort(sorters[f.sort] || byName);
}

/** Puan rozetinin tonu (web scoreTone). */
export function scoreTone(average: number | null | undefined): "neutral" | "win" | "warn" | "danger" {
  if (average == null) return "neutral";
  if (average >= 7.5) return "win";
  if (average >= 5) return "warn";
  return "danger";
}

export function raterLabel(rating: StaffRating): string {
  if (rating.type === "player") return rating.teamName ? `${rating.teamName} — ${rating.name}` : rating.name;
  return rating.name;
}

/* ─────────────────────── toplu atama modeli ─────────────────────── */
// Web staffBulkModel.js'in birebir karşılığı. Taslaklar
// { [maçId]: { [görev]: "personelId" | "" } } biçimindedir; "" görevi kaldırır.

export type Drafts = Record<string, Record<string, string>>;

const str = (v: unknown) => (v == null ? "" : String(v));

export const savedStaffId = (m: AssignableMatch, duty: string) => str(m.crew?.[duty]?.staffId);

export function currentStaffId(m: AssignableMatch, duty: string, drafts: Drafts): string {
  const draft = drafts[m.id]?.[duty];
  return draft !== undefined ? str(draft) : savedStaffId(m, duty);
}

export function isDutyChanged(m: AssignableMatch, duty: string, drafts: Drafts): boolean {
  const draft = drafts[m.id]?.[duty];
  return draft !== undefined && str(draft) !== savedStaffId(m, duty);
}

export const isMatchChanged = (m: AssignableMatch, duties: StaffDuty[], drafts: Drafts) =>
  duties.some((d) => isDutyChanged(m, d.key, drafts));

export const missingCount = (m: AssignableMatch, duties: StaffDuty[], drafts: Drafts) =>
  duties.filter((d) => !currentStaffId(m, d.key, drafts)).length;

export function buildBulkAssignments(drafts: Drafts, byId: Map<string, AssignableMatch>, duties: StaffDuty[]) {
  const items: { matchId: number; assignments: AssignmentMap }[] = [];
  let changes = 0;
  Object.keys(drafts).forEach((id) => {
    const m = byId.get(String(id));
    if (!m) return;
    const assignments: AssignmentMap = {};
    duties.forEach(({ key }) => {
      if (!isDutyChanged(m, key, drafts)) return;
      const value = str(drafts[id][key]);
      assignments[key] = value ? Number(value) : null;
      changes += 1;
    });
    if (Object.keys(assignments).length) items.push({ matchId: m.id, assignments });
  });
  return { items, changes };
}

/** Sunucunun kaydettiği görevlendirmeyi maçın crew alanına işler. */
export function applySavedAssignments(m: AssignableMatch, assignments: BulkAssignResult["updated"][number]["assignments"] = {}): AssignableMatch {
  const crew: Record<string, CrewSlot> = {};
  Object.entries(assignments).forEach(([duty, row]) => {
    if (row?.staffId) crew[duty] = { staffId: row.staffId, name: row.fullName || row.name || `Personel #${row.staffId}` };
  });
  return { ...m, crew, assignedCount: Object.keys(crew).length };
}

const slotKey = (m: AssignableMatch) => (m.day ? `${m.day} ${m.time || ""}` : "");

/** Aynı kişi aynı gün ve saatte iki maça atanırsa çakışma: "maçId:görev" → diğer maç etiketleri. */
export function findConflicts(matches: AssignableMatch[], duties: StaffDuty[], drafts: Drafts): Map<string, string[]> {
  const bySlot = new Map<string, { match: AssignableMatch; duty: string }[]>();
  matches.forEach((m) => {
    const slot = slotKey(m);
    if (!slot) return;
    duties.forEach(({ key }) => {
      const id = currentStaffId(m, key, drafts);
      if (!id) return;
      const bucket = `${slot}|${id}`;
      const list = bySlot.get(bucket) ?? [];
      list.push({ match: m, duty: key });
      bySlot.set(bucket, list);
    });
  });
  const out = new Map<string, string[]>();
  bySlot.forEach((entries) => {
    if (new Set(entries.map((e) => e.match.id)).size < 2) return;
    entries.forEach(({ match, duty }) => {
      out.set(
        `${match.id}:${duty}`,
        entries.filter((e) => e.match.id !== match.id).map((e) => e.match.label)
      );
    });
  });
  return out;
}

export function sortByDate(matches: AssignableMatch[], direction: "asc" | "desc" = "asc") {
  const sign = direction === "desc" ? -1 : 1;
  return [...matches].sort((a, b) => {
    const l = slotKey(a);
    const r = slotKey(b);
    if (!l && !r) return a.id - b.id;
    if (!l) return 1;
    if (!r) return -1;
    if (l === r) return (a.id - b.id) * sign;
    return l < r ? -sign : sign;
  });
}

/** Personel bu maçın ilinden mi? İli belirtilmemiş personel hiçbir ile ait sayılmaz. */
export function staffInCity(person: StaffMember, m: AssignableMatch): boolean {
  const norm = (v: unknown) => String(v || "").toLocaleLowerCase("tr-TR").trim();
  if (person.cityId != null && m.cityId != null) return Number(person.cityId) === Number(m.cityId);
  const left = norm(person.city);
  return left !== "" && left === norm(m.city);
}

/** Görev başına seçenekler: o görevi yapanlar önce, diğerleri sonra. */
export function splitByDuty(staff: StaffMember[], duty: string) {
  const primary: StaffMember[] = [];
  const others: StaffMember[] = [];
  staff.forEach((p) => (dutiesOf(p).includes(duty) ? primary : others).push(p));
  const byName = (a: StaffMember, b: StaffMember) => a.fullName.localeCompare(b.fullName, "tr");
  return { primary: primary.sort(byName), others: others.sort(byName) };
}
