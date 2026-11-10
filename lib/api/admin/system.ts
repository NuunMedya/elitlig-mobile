import { del, get, patch, post, put, type QueryParams } from "../../http";

/**
 * YÖNETİM VE AYARLAR uçları — "Yönetim ve ayarlar" grubundaki yerel ekranların
 * (app/yonetim/...) tek API katmanı. Uçlar ve alan adları sunucudan birebir:
 *
 *   routes/adminManagementUsers.js  → /api/admin/management-users (yönetim hesapları)
 *   routes/adminUserPermissions.js  → /api/admin/user-permissions (kişi bazlı yetki)
 *   routes/adminRolePermissions.js  → /api/admin/role-permissions (roller ve şablonlar)
 *   routes/Cities.js                → /sehirler (şehir listesi ve ekleme)
 *   routes/cityContacts.js          → /api/city-contacts/admin/... (il iletişim + talepler)
 *   routes/adminAnalytics.js        → /api/admin/analytics/:section (ziyaretçi / uygulama)
 *   routes/adminActivityLogs.js     → /api/admin/activity-logs (işlem kayıtları)
 *   routes/adminTrash.js            → /api/admin/trash (çöp kutusu)
 *   routes/User.js                  → /api/users/me/account, PATCH /api/users/me (hesabım)
 *
 * Etiket sözlükleri web ekranlarının (elitlig-client pages/management/...) aynısıdır;
 * ekranlar metni kendisi yazmaz, buradan alır.
 */

/* ═══════════════════════════ ORTAK ═══════════════════════════ */

export interface MessageResult {
  message?: string;
}

/** Sunucunun yetki kataloğu (config/permissions PERMISSION_GROUPS). */
export interface PermissionItem {
  key: string;
  label: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  description?: string | null;
  permissions: PermissionItem[];
}

/** Yetki anahtarının son parçasından işlem türü — web roles/roleUtils.js ACTIONS. */
export const PERMISSION_ACTION_LABELS: Record<string, string> = {
  view: "Görüntüleme",
  create: "Ekleme",
  update: "Düzenleme",
  delete: "Silme",
  purge: "Kalıcı silme",
  restore: "Geri alma",
  manage: "Yönetim",
  settings: "Ayarlar",
  publish: "Yayın",
  review: "İnceleme",
  assign: "Atama",
  archive: "Arşiv",
};

export const permissionAction = (key: string): string | null =>
  PERMISSION_ACTION_LABELS[String(key).split(".").pop() ?? ""] ?? null;

const SENSITIVE_GROUPS = new Set(["permissions", "users", "trash"]);
const SENSITIVE_ACTIONS = new Set(["delete", "purge", "manage", "settings"]);

/** Yanlış kişiye verilirse zarar verebilecek yetki (silme, yönetim, yetkilendirme). */
export function isSensitivePermission(key: string): boolean {
  const [group, ...rest] = String(key).split(".");
  return SENSITIVE_GROUPS.has(group) || SENSITIVE_ACTIONS.has(rest[rest.length - 1] ?? "");
}

export const isViewPermission = (key: string) => /\.(view|directory)$/.test(String(key));

export const sameSet = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** Taslağın kayıtlı listeye göre farkı. */
export function diffPermissions(draft: readonly string[], saved: readonly string[]) {
  const savedSet = new Set(saved);
  const draftSet = new Set(draft);
  return {
    added: draft.filter((key) => !savedSet.has(key)),
    removed: saved.filter((key) => !draftSet.has(key)),
  };
}

/* ═══════════════════════════ YÖNETİM KULLANICILARI ═══════════════════════════ */

export type ManagementStatus = "active" | "suspended";

export const MANAGEMENT_STATUS_LABELS: Record<ManagementStatus, string> = {
  active: "Aktif",
  suspended: "Askıda",
};

export interface ManagementRole {
  key: string;
  label: string;
  nationwide: boolean;
  assignable: boolean;
  userCount: number;
}

export interface ManagementUser {
  id: number;
  username: string;
  fullName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  roleLabel: string;
  city: string | null;
  nationwide: boolean;
  status: ManagementStatus | string;
  createdAt?: string | null;
}

export interface ManagementUserList {
  users: ManagementUser[];
  roleCounts: Record<string, number>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ManagementUserInput {
  username?: string;
  password?: string;
  fullName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  city: string;
  status: ManagementStatus;
}

export const getManagementRoles = () =>
  get<{ roles: ManagementRole[]; statuses: string[] }>("/api/admin/management-users/roles");

/** Sunucu en fazla 100 kayıt döndürür; web de tek sayfa (limit 100) okur. */
export const listManagementUsers = (params: { role?: string; status?: string; q?: string; page?: number } = {}) =>
  get<ManagementUserList>("/api/admin/management-users", { limit: 100, ...params });

export const createManagementUser = (body: ManagementUserInput) =>
  post<{ message: string; user: ManagementUser }>("/api/admin/management-users", body);

/** Kullanıcı adı ve şifre güncellemede gönderilmez (sunucu EDITABLE_FIELDS). */
export const updateManagementUser = (id: number, body: Partial<Omit<ManagementUserInput, "username" | "password">>) =>
  patch<{ message: string; user: ManagementUser }>(`/api/admin/management-users/${id}`, body);

export const setManagementUserPassword = (id: number, password: string) =>
  post<{ message: string }>(`/api/admin/management-users/${id}/password`, { password });

export const deleteManagementUser = (id: number) =>
  del<{ message: string }>(`/api/admin/management-users/${id}`);

/* ═══════════════════════════ KİŞİ BAZLI YETKİLER ═══════════════════════════ */

export type AccessSource = "full" | "personal" | "role";

export const ACCESS_SOURCE_LABELS: Record<AccessSource, string> = {
  full: "Tam yetki",
  personal: "Kişiye özel",
  role: "Rol şablonundan",
};

export interface AccessUser {
  id: number;
  name: string;
  username: string;
  title: string | null;
  role: string;
  roleLabel: string;
  city: string | null;
  nationwide: boolean;
  status: string | null;
  email?: string | null;
  permissions: string[];
  source: AccessSource;
  copiedFrom: { id: number; name?: string | null } | null;
  editable: boolean;
  titleEditable: boolean;
  lockReason: string | null;
}

export interface AccessRole {
  key: string;
  label: string;
  color: string | null;
  nationwide: boolean;
  templatePermissions: string[];
}

export interface AccessPayload {
  groups: PermissionGroup[];
  users: AccessUser[];
  roles: AccessRole[];
  titles: string[];
  canManage: boolean;
  maxBatch: number;
}

export type BulkMode = "replace" | "add" | "remove";

export const BULK_MODES: { key: BulkMode; label: string; hint: string }[] = [
  { key: "replace", label: "Bu liste olsun", hint: "Seçilen kişilerin tüm yetkileri aşağıdaki liste olur." },
  { key: "add", label: "Ekle", hint: "İşaretlenen yetkiler kişilerin mevcut yetkilerine eklenir." },
  { key: "remove", label: "Kaldır", hint: "İşaretlenen yetkiler kişilerden alınır; diğerleri olduğu gibi kalır." },
];

/** Tek kişi: permissions | copyFromUserId | roleTemplate, isteğe bağlı title. */
export interface AccessSaveBody {
  permissions?: string[];
  copyFromUserId?: number;
  roleTemplate?: string;
  title?: string | null;
}

export const getAccessPayload = () => get<AccessPayload>("/api/admin/user-permissions");

export const saveUserAccess = (id: number, body: AccessSaveBody) =>
  put<{ message: string; user: AccessUser | null }>(`/api/admin/user-permissions/users/${id}`, body);

export const bulkAccess = (body: AccessSaveBody & { userIds: number[]; mode: BulkMode }) =>
  post<{ message: string; users: AccessUser[] }>("/api/admin/user-permissions/bulk", body);

/** Toplu işlem önizlemesi: kişinin sonuçta sahip olacağı liste. */
export function previewBulk(mode: BulkMode, current: readonly string[], incoming: readonly string[]): string[] {
  if (mode === "add") return [...new Set([...current, ...incoming])];
  if (mode === "remove") {
    const drop = new Set(incoming);
    return current.filter((key) => !drop.has(key));
  }
  return [...new Set(incoming)];
}

/* ═══════════════════════════ ROLLER VE ŞABLONLAR ═══════════════════════════ */

export type RoleScope = "city" | "nationwide";

export interface RoleRecord {
  key: string;
  label: string;
  description: string | null;
  scope: RoleScope;
  nationwide: boolean;
  color: string | null;
  homePath: string | null;
  isSystem: boolean;
  isManagement: boolean;
  custom: boolean;
  customized: boolean;
  editable: boolean;
  deletable: boolean;
  scopeLocked: boolean;
  isDefault: boolean;
  permissions: string[];
  defaultPermissions: string[];
  userCount: number;
}

export interface RoleMatrix {
  groups: PermissionGroup[];
  roles: RoleRecord[];
  homePaths: { path: string; label: string }[];
}

export interface RoleInput {
  label: string;
  description?: string;
  scope?: RoleScope;
  color?: string;
  homePath?: string;
  copyFrom?: string;
}

const RP = "/api/admin/role-permissions";

export const getRoleMatrix = () => get<RoleMatrix>(RP);
export const saveRolePermissions = (role: string, permissions: string[]) =>
  put<{ message: string; role: RoleRecord }>(`${RP}/${role}`, { permissions });
export const resetRolePermissions = (role: string) => post<{ message: string; role: RoleRecord }>(`${RP}/${role}/reset`);
export const createRole = (body: RoleInput) => post<{ message: string; role: RoleRecord }>(`${RP}/roles`, body);
export const updateRole = (role: string, body: RoleInput) =>
  patch<{ message: string; role: RoleRecord }>(`${RP}/roles/${role}`, body);
export const resetRoleDetails = (role: string) => post<{ message: string; role: RoleRecord }>(`${RP}/roles/${role}/reset`);
export const deleteRole = (role: string, reassignTo?: string | null) =>
  request_del(`${RP}/roles/${role}`, reassignTo ? { reassignTo } : undefined);
export const getRoleUsers = (role: string) =>
  get<{ items: { id: number; username: string; name: string; city: string | null; status: string | null }[] }>(
    `${RP}/roles/${role}/users`
  );

/** DELETE sorgu parametresiyle (reassignTo) — http.del gövde alır, sorguyu yola yazarız. */
function request_del(path: string, params?: QueryParams) {
  const search = params
    ? Object.entries(params)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return del<{ message: string }>(search ? `${path}?${search}` : path);
}

/** Web roles/roleUtils.js ROLE_COLORS — rol rengi paleti (veri rengi, lib altında). */
export const ROLE_COLORS = [
  "#1c64f2",
  "#0f766e",
  "#7c3aed",
  "#b45309",
  "#be123c",
  "#475569",
  "#db2777",
  "#15803d",
  "#0891b2",
  "#9333ea",
] as const;

/** Rengi olmayan rol için nötr şerit. */
export const ROLE_FALLBACK_COLOR = "#94a3b8";

/* ═══════════════════════════ ŞEHİRLER ═══════════════════════════ */

export interface City {
  id: number;
  city_name: string;
  plate_code: string | null;
  slug: string | null;
}

export interface Province {
  code: string;
  name: string;
  slug: string;
  cityId: number | null;
  added: boolean;
}

export const getCities = () => get<City[]>("/sehirler");
export const getProvinces = () => get<{ provinces: Province[] }>("/sehirler/iller");
export const createCity = (cityName: string) =>
  post<{ message: string; city: City }>("/sehirler", { city_name: cityName });

/* ═══════════════════════════ ŞEHİR İLETİŞİM ═══════════════════════════ */

export interface ContactSection {
  id: number;
  public_id?: string;
  city_id: number;
  label: string | null;
  sort_order: number;
  facebook_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  tiktok_url: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  map_embed_url: string | null;
  is_active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ContactSectionInput = Omit<ContactSection, "id" | "public_id" | "createdAt" | "updatedAt">;

export type ContactRequestStatus = "new" | "read" | "archived";

export const CONTACT_REQUEST_STATUS_LABELS: Record<ContactRequestStatus, string> = {
  new: "Yeni",
  read: "Okundu",
  archived: "Arşiv",
};

export interface ContactRequest {
  id: number;
  city_id: number | null;
  section_label?: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string;
  status: ContactRequestStatus;
  is_read: boolean;
  createdAt: string;
}

export interface ContactRequestPage {
  items: ContactRequest[];
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

const CC = "/api/city-contacts/admin";

export const getContactSections = (cityId?: number | null) =>
  get<{ sections: ContactSection[] }>(`${CC}/sections`, { cityId: cityId ?? undefined }).then((d) => d.sections ?? []);
export const createContactSection = (body: ContactSectionInput) =>
  post<{ section: ContactSection }>(`${CC}/sections`, body);
export const updateContactSection = (id: number, body: ContactSectionInput) =>
  put<{ section: ContactSection }>(`${CC}/sections/${id}`, body);
export const deleteContactSection = (id: number) => del<{ success: boolean }>(`${CC}/sections/${id}`);

export const getContactRequests = (params: { page: number; status?: string; cityId?: number | null; q?: string }) =>
  get<ContactRequestPage>(`${CC}/requests`, {
    page: params.page,
    limit: 20,
    status: params.status && params.status !== "all" ? params.status : undefined,
    cityId: params.cityId ?? undefined,
    q: params.q || undefined,
  });
export const getContactUnreadCount = () => get<{ count: number }>(`${CC}/requests/unread-count`);
export const markContactRequestRead = (id: number, isRead: boolean) =>
  patch<{ success: boolean }>(`${CC}/requests/${id}/read`, { isRead });
export const setContactRequestStatus = (id: number, status: ContactRequestStatus) =>
  patch<{ success: boolean }>(`${CC}/requests/${id}/status`, { status });
export const deleteContactRequest = (id: number) => del<{ success: boolean }>(`${CC}/requests/${id}`);

/* ═══════════════════════════ ZİYARETÇİ ANALİZİ ═══════════════════════════ */

export type SiteSection = "overview" | "realtime" | "pages" | "sources" | "searches" | "audience" | "interactions" | "performance";

/** Web analyticsFormat.js SECTIONS — ısı haritası mobilde yok (rapor notunda). */
export const SITE_SECTIONS: { key: SiteSection; label: string }[] = [
  { key: "overview", label: "Genel bakış" },
  { key: "realtime", label: "Şu an" },
  { key: "pages", label: "Sayfalar" },
  { key: "sources", label: "Kaynaklar" },
  { key: "searches", label: "Aramalar" },
  { key: "audience", label: "Kitle ve cihaz" },
  { key: "interactions", label: "Etkileşim" },
  { key: "performance", label: "Hız ve hata" },
];

export const RANGE_PRESETS = [
  { key: "today", label: "Bugün", days: 1, offset: 0 },
  { key: "yesterday", label: "Dün", days: 1, offset: 1 },
  { key: "7", label: "7 gün", days: 7, offset: 0 },
  { key: "30", label: "30 gün", days: 30, offset: 0 },
  { key: "90", label: "90 gün", days: 90, offset: 0 },
  { key: "365", label: "12 ay", days: 365, offset: 0 },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["key"] | "custom";

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Hazır aralığın from/to değerleri (yerel gün). */
export function presetRange(key: string, now = new Date()): { from: string; to: string } {
  const preset = RANGE_PRESETS.find((p) => p.key === key) ?? RANGE_PRESETS[3];
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - preset.offset);
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (preset.days - 1));
  return { from: ymd(start), to: ymd(end) };
}

export const CHANNEL_LABELS: Record<string, string> = {
  direct: "Doğrudan",
  organic: "Arama motorları",
  social: "Sosyal medya",
  referral: "Başka siteler",
  email: "E-posta",
  campaign: "Kampanya bağlantısı",
  paid: "Reklam",
};
export const channelLabel = (key?: string | null) => (key ? CHANNEL_LABELS[key] ?? key : "Bilinmiyor");

export const DEVICE_LABELS: Record<string, string> = { desktop: "Masaüstü", mobile: "Mobil", tablet: "Tablet" };
export const deviceLabel = (key?: string | null) => (key ? DEVICE_LABELS[key] ?? key : "Bilinmiyor");

export const AUDIENCE_LABELS: Record<string, string> = { visitor: "Ziyaretçi", member: "Üye", management: "Yönetim" };
export const audienceLabel = (key?: string | null) => (key ? AUDIENCE_LABELS[key] ?? key : "Bilinmiyor");

export const VITAL_LABELS: Record<string, string> = {
  LCP: "En büyük içerik (LCP)",
  FCP: "İlk içerik (FCP)",
  CLS: "Kayma (CLS)",
  FID: "İlk tepki (FID)",
  INP: "Tepki (INP)",
  TTFB: "Sunucu yanıtı (TTFB)",
};
export const RATING_LABELS: Record<string, string> = { good: "İyi", needs: "Geliştirilmeli", poor: "Zayıf" };

export interface KeyCount {
  key: string;
  count: number;
  unique?: number;
}

export interface SiteFilters {
  from: string;
  to: string;
  audiences: string;
  device?: string;
}

/** Ham rapor — bölümlere göre alanlar değişir; ekran kendi parçasını okur. */
export type AnalyticsReport = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Raporlar ağır (400 güne kadar tarama). İstek ?async=1 ile gider: sunucu
 * hesabı birkaç saniyede bitiremezse 202 { pending: true } döner ve hesabı arka
 * planda sürdürür; burada kısa aralıklarla yeniden sorulur (hesap baştan
 * başlamaz). En fazla 3 dk beklenir.
 */
const REPORT_MAX_WAIT_MS = 3 * 60 * 1000;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function getReport(path: string, params: QueryParams): Promise<AnalyticsReport> {
  const startedAt = Date.now();
  for (;;) {
    const data = await get<AnalyticsReport>(path, { ...params, async: 1 }, { timeout: 60_000, retry: false });
    if (!data?.pending) return data;
    if (Date.now() - startedAt > REPORT_MAX_WAIT_MS) {
      throw new Error("Rapor hazırlanması beklenenden uzun sürdü. Biraz sonra yeniden deneyin.");
    }
    await pause(Math.min(Math.max(Number(data.retryAfterMs) || 3000, 1000), 10_000));
  }
}

export const getSiteReport = (section: SiteSection, params: QueryParams) =>
  getReport(`/api/admin/analytics/${section}`, params);

/* ═══════════════════════════ UYGULAMA ANALİZİ ═══════════════════════════ */

export const APP_RANGES = [
  { key: "7d", label: "7 gün" },
  { key: "30d", label: "30 gün" },
  { key: "90d", label: "90 gün" },
] as const;

export const APP_PLATFORMS = [
  { key: "", label: "Tümü" },
  { key: "ios", label: "iOS" },
  { key: "android", label: "Android" },
] as const;

export const getAppReport = (params: { range: string; platform?: string; withManagement?: boolean }) =>
  getReport("/api/admin/analytics/app", {
    range: params.range,
    platform: params.platform || undefined,
    audiences: params.withManagement ? "visitor,member,management" : "visitor,member",
  });

/* ═══════════════════════════ BİÇİMLENDİRME ═══════════════════════════ */

const nf = new Intl.NumberFormat("tr-TR");
export const fmtNum = (value: unknown) =>
  value == null || Number.isNaN(Number(value)) ? "—" : nf.format(Number(value));
export const fmtPct = (value: unknown, digits = 1) =>
  value == null || Number.isNaN(Number(value))
    ? "—"
    : `%${Number(value).toLocaleString("tr-TR", { maximumFractionDigits: digits })}`;

/** "3 sa 12 dk", "4 dk 5 sn", "35 sn" */
export function fmtDuration(ms: unknown): string {
  const total = Math.round(Number(ms || 0) / 1000);
  if (!Number.isFinite(total) || total <= 0) return "0 sn";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h.toLocaleString("tr-TR")} sa ${m} dk`;
  if (m) return `${m} dk ${s} sn`;
  return `${s} sn`;
}

export function fmtVital(name: string, value: unknown): string {
  if (value == null) return "—";
  const n = Number(value);
  if (name === "CLS") return n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
  return n >= 1000 ? `${(n / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} sn` : `${Math.round(n)} ms`;
}

const SHORT_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** "2026-10-09" → "9 Eki", "2026-10-09 14" → "14:00". */
export function fmtBucket(key: unknown, granularity: string = "day"): string {
  const text = String(key ?? "");
  if (!text) return "";
  if (granularity === "hour") return `${text.slice(11, 13)}:00`;
  const [, m, d] = text.split("-").map(Number);
  if (!m || !d) return text;
  return `${d} ${SHORT_MONTHS[m - 1] ?? ""}`;
}

/** Önceki döneme göre değişim yüzdesi; önceki sıfırsa null. */
export function deltaPct(current: unknown, previous: unknown): number | null {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return Math.round(((c - p) / p) * 1000) / 10;
}

/** Tablo → CSV (Excel Türkçe için ; ayırıcı). */
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const esc = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const head = columns.map((c) => esc(c.label)).join(";");
  const body = rows.map((row) => columns.map((c) => esc(row[c.key])).join(";"));
  return [head, ...body].join("\r\n");
}

/* ═══════════════════════════ İŞLEM KAYITLARI ═══════════════════════════ */

export type LogAudience = "management" | "member";
export type LogKind = "" | "action" | "auth" | "page_view";
export type LogMethod = "" | "POST" | "PUT" | "PATCH" | "DELETE";

export const LOG_AUDIENCES: { key: LogAudience; label: string }[] = [
  { key: "management", label: "Yönetim" },
  { key: "member", label: "Üyeler" },
];

export const LOG_KIND_OPTIONS: { key: LogKind; label: string }[] = [
  { key: "", label: "Tüm kayıtlar" },
  { key: "action", label: "İşlemler" },
  { key: "auth", label: "Giriş / çıkış" },
  { key: "page_view", label: "Sayfa ziyareti" },
];

export const LOG_METHOD_OPTIONS: { key: LogMethod; label: string }[] = [
  { key: "", label: "Tüm işlem türleri" },
  { key: "POST", label: "Ekleme" },
  { key: "PUT", label: "Güncelleme (PUT)" },
  { key: "PATCH", label: "Güncelleme (PATCH)" },
  { key: "DELETE", label: "Silme" },
];

export interface ActivityLog {
  id: number;
  kind: "action" | "auth" | "page_view" | string;
  audience: LogAudience;
  user_id: number | null;
  username: string | null;
  user_role: string | null;
  city: string | null;
  method: string | null;
  route: string | null;
  url: string | null;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status_code: number | null;
  duration_ms: number | null;
  ip: string | null;
  user_agent: string | null;
  details: unknown;
  createdAt: string;
}

export interface LogFilters {
  q: string;
  kind: LogKind;
  method: LogMethod;
  from: string;
  to: string;
  errors: boolean;
  userId: string;
  userName: string;
}

export const EMPTY_LOG_FILTERS: LogFilters = { q: "", kind: "", method: "", from: "", to: "", errors: false, userId: "", userName: "" };

/** Web activityLogModel.buildQuery ile birebir; boş alanlar gönderilmez. */
export function buildLogQuery(audience: LogAudience, filters: LogFilters, before?: number | null): QueryParams {
  return {
    audience,
    limit: 50,
    q: filters.q.trim() || undefined,
    kind: filters.kind || undefined,
    method: filters.method || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    errors: filters.errors ? 1 : undefined,
    user_id: filters.userId || undefined,
    before: before ?? undefined,
  };
}

export const getActivityLogs = (params: QueryParams) =>
  get<{ items: ActivityLog[]; nextCursor: number | null }>("/api/admin/activity-logs", params);

export const getActivitySummary = () =>
  get<Record<LogAudience, { count: number; users: number }>>("/api/admin/activity-logs/summary");

/** Kaydın rozeti: tür ve sonuç (web activityLogModel.kindMeta). */
export function logKindMeta(entry: ActivityLog): { label: string; tone: "info" | "danger" | "brand" | "win" | "warn" | "neutral" } {
  if (entry.kind === "page_view") return { label: "Sayfa", tone: "neutral" };
  if (entry.kind === "auth") {
    return Number(entry.status_code) >= 400 ? { label: "Giriş hatası", tone: "danger" } : { label: "Oturum", tone: "info" };
  }
  const method = String(entry.method || "").toUpperCase();
  if (method === "DELETE") return { label: "Silme", tone: "danger" };
  if (method === "POST") return { label: "Ekleme", tone: "win" };
  return { label: "Güncelleme", tone: "brand" };
}

export const isFailedLog = (entry: ActivityLog) => Number(entry.status_code) >= 400;

/** Ayrıntı nesnesini satır satır gösterilecek çiftlere çevirir. */
export function logDetailPairs(details: unknown): [string, string][] {
  if (details == null || details === "") return [];
  if (typeof details !== "object") return [["", String(details)]];
  return Object.entries(details as Record<string, unknown>).map(([key, value]) => [
    key,
    value != null && typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
  ]);
}

/* ═══════════════════════════ ÇÖP KUTUSU ═══════════════════════════ */

export interface TrashItem {
  id: number;
  entityType: string;
  label: string;
  summary: string | null;
  deletedByName: string | null;
  deletedAt: string | null;
  relatedCount: number;
}

export interface TrashGroup {
  key: string;
  label: string;
  count: number;
  items: TrashItem[];
}

export interface TrashList {
  groups: TrashGroup[];
  total: number;
  types: { key: string; label: string }[];
}

export const getTrash = (params: { type?: string; search?: string } = {}) => get<TrashList>("/api/admin/trash", params);
export const restoreTrash = (id: number) => post<{ message: string }>(`/api/admin/trash/${id}/restore`);
export const purgeTrash = (id: number) => del<{ message: string }>(`/api/admin/trash/${id}`);
/** Tür verilirse yalnız o başlık boşaltılır. */
export const purgeAllTrash = (type?: string) =>
  del<{ message: string }>(type ? `/api/admin/trash?type=${encodeURIComponent(type)}` : "/api/admin/trash");

/* ═══════════════════════════ HESABIM ═══════════════════════════ */

export interface AccountSummary {
  user: {
    id: number;
    username: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    role: string;
    city: string | null;
    status: string | null;
    title?: string | null;
    permissions?: string[];
  };
  permissionGroups: (PermissionGroup & { total: number })[];
  account: { createdAt: string | null; updatedAt: string | null; cityLocked: boolean };
}

export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: "Aktif",
  approved: "Aktif",
  pending: "Onay bekliyor",
  passive: "Pasif",
  suspended: "Askıda",
};

export const getAccountSummary = () => get<AccountSummary>("/api/users/me/account");

export const updateMyProfile = (body: Partial<{ fullName: string | null; username: string; email: string | null; phone: string | null }>) =>
  patch<{ user: AccountSummary["user"] }>("/api/users/me", body);

/** 0–4 arası şifre gücü; sunucu kuralı (8+, harf, rakam) 2. seviyeye denk gelir. */
export function passwordScore(value = ""): number {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Za-zğüşıöçĞÜŞİÖÇ]/.test(value) && /[0-9]/.test(value)) score += 1;
  if (/[a-zğüşıöç]/.test(value) && /[A-ZĞÜŞİÖÇ]/.test(value)) score += 1;
  if (value.length >= 12 || /[^A-Za-z0-9ğüşıöçĞÜŞİÖÇ]/.test(value)) score += 1;
  return score;
}

export const PASSWORD_SCORE_LABELS = ["Çok zayıf", "Zayıf", "Orta", "İyi", "Güçlü"];

/** Ortak sorgu anahtarları — hepsi ["admin", ...] altında. */
export const systemKeys = {
  managementUsers: ["admin", "management-users"] as const,
  managementRoles: ["admin", "management-users", "roles"] as const,
  access: ["admin", "user-permissions"] as const,
  roles: ["admin", "role-permissions"] as const,
  roleUsers: (role: string) => ["admin", "role-permissions", "users", role] as const,
  cities: ["admin", "cities"] as const,
  provinces: ["admin", "cities", "provinces"] as const,
  contactSections: (cityId: number | null) => ["admin", "city-contacts", "sections", cityId] as const,
  contactRequests: ["admin", "city-contacts", "requests"] as const,
  site: (section: string, params: unknown) => ["admin", "analytics", "site", section, params] as const,
  app: (params: unknown) => ["admin", "analytics", "app", params] as const,
  logs: ["admin", "activity-logs"] as const,
  trash: ["admin", "trash"] as const,
  account: ["admin", "account"] as const,
};
