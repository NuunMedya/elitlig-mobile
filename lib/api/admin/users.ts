import { del, get, patch, post, put } from "../../http";

/**
 * Üye yönetimi uçları — elitlig-server routes/adminUsers.js (/api/admin/users),
 * routes/membership.js (/api/membership/admin/...), routes/User.js
 * (/api/users/player-candidates, /api/users/team-candidates).
 * Web karşılığı: src/services/adminUsersApi.js, src/pages/management/AdminUsers.js,
 * requests/*, passwordResets/PasswordResets.js, editor_pages/PremiumApproval.js.
 *
 *   GET    /api/admin/users/overview             sayaçlar           users.view
 *   GET    /api/admin/users                      liste (?q,role,status,accountType,profileType,city,page,limit)
 *   GET    /api/admin/users/cities               il filtresi seçenekleri
 *   GET    /api/admin/users/:id                  ayrıntı + üyelik + sipariş + talepler
 *   PATCH  /api/admin/users/:id                  hesap alanları      users.update
 *   POST   /api/admin/users/:id/review           üyelik onay / ret   users.review
 *   PUT    /api/admin/users/:id/memberships/:plan premium ver/uzat/kaldır users.membership
 *   DELETE /api/admin/users/:id                  sil                 users.delete
 *   POST   /api/admin/users/:id/password-reset   tek kullanımlık kod users.password_reset
 *   GET    /api/admin/users/requests             yetki / sahiplenme talepleri users.requests
 *   POST   /api/admin/users/requests/:id/review  { decision, note, linkPlayerId?, linkTeamId? }
 *   GET    /api/admin/users/changes              içerik güncelleme talepleri users.requests
 *   POST   /api/admin/users/changes/:id/review   { decision, note }
 *   GET    /api/admin/users/password-resets      şifre talepleri (?status=&q=)
 *   POST   /api/admin/users/password-resets/:id/cancel
 *   GET    /api/membership/admin/orders          premium siparişleri (?status=)
 *   POST   /api/membership/admin/orders/:id/approve | /reject
 */

/* ===================== Türkçe sözlükler ===================== */

export const MEMBER_ROLE_LABELS: Record<string, string> = {
  uye: "Üye",
  oyuncu: "Oyuncu",
  takim_baskani: "Takım Başkanı",
  double: "Double (oyuncu + başkan)",
};

export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: "Aktif",
  inactive: "Pasif",
  suspended: "Askıda",
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

/** PATCH /:id ACCOUNT_STATUSES. */
export const EDITABLE_STATUSES = ["pending", "active", "approved", "suspended", "rejected"] as const;

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  member: "Üye",
  player: "Oyuncu",
  team_manager: "Takım Başkanı",
};

export const PROFILE_TYPE_LABELS: Record<string, string> = {
  oyuncu: "Oyuncu",
  takim_baskani: "Takım Başkanı",
  double: "Oyuncu + Takım Başkanı",
};

export const PLAN_LABELS: Record<string, string> = { player: "Oyuncu", team: "Takım Başkanlığı" };

export const ORDER_STATUS_LABELS: Record<string, string> = { pending: "Bekliyor", approved: "Onaylandı", rejected: "Reddedildi" };

/** Hesap talebi türleri (AccountRequestsBoard TYPES). */
export const ACCOUNT_REQUEST_TYPES: Record<string, string> = {
  team_management: "Takım yönetimi",
  team_create: "Yeni takım",
  player_claim: "Oyuncu profili sahiplenme",
  player_create: "Yeni oyuncu profili",
  player_unlink: "Oyuncu profilinden ayrılma",
  team_resign: "Takım yönetiminden ayrılma",
  team_transfer: "Takım devri",
  profile_claim: "Oyuncu profili sahiplenme",
  team_authority: "Takım yönetimi",
};

/** İçerik güncelleme talebi türleri (ChangeRequestsBoard TYPES). */
export const CHANGE_REQUEST_TYPES: Record<string, string> = {
  team_update: "Takım bilgisi güncelleme",
  team_logo: "Takım logosu",
  player_update: "Oyuncu profili güncelleme",
  player_release: "Kadrodan çıkarma",
  sponsor_update: "Sponsor alanı",
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  cancelled: "Geri çekildi",
};

export const REVIEW_STATUS_TABS = ["pending", "approved", "rejected", "cancelled", "all"] as const;

export const RESET_STATUS_LABELS: Record<string, string> = {
  requested: "Kod bekliyor",
  issued: "Kod iletildi",
  used: "Şifre yenilendi",
  cancelled: "Kapatıldı",
};

/** Yeni oyuncu / takım talebinde gönderilen alanların adları. */
export const PAYLOAD_LABELS: Record<string, string> = {
  player_name: "Ad soyad",
  player_position: "Mevki",
  birth_date: "Doğum tarihi",
  nationality: "Uyruk",
  city: "İl",
  team_name: "Takım adı",
  founded_at: "Kuruluş tarihi",
  colors: "Kulüp renkleri",
};

/* ===================== tipler ===================== */

export interface MemberLinkPlayer { id: number; player_name: string; player_img?: string | null; team_id?: number | null }
export interface MemberLinkTeam { id: number; team_name: string; logo?: string | null }

/** routes/adminUsers hydrateUsers. */
export interface AdminMember {
  id: number;
  username: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  teamName: string | null;
  role: string;
  status: string | null;
  player_id: number | null;
  managed_team_id: number | null;
  profile_type: string | null;
  createdAt?: string;
  accountType: string;
  profileType: string | null;
  profileTypeLabel?: string | null;
  player: MemberLinkPlayer | null;
  managedTeam: MemberLinkTeam | null;
  memberships: { plan: string; expires_at?: string; started_at?: string }[];
  pending?: { premiumOrders: number; accountRequests: number };
}

export interface PlanMembership {
  plan: string;
  available: boolean;
  isPremium: boolean;
  startedAt?: string | null;
  expiresAt?: string | null;
  daysLeft?: number | null;
  expired?: boolean;
  planLabel?: string;
  pendingOrder?: PremiumOrder | null;
}

export interface PremiumOrder {
  id: number;
  amount: number;
  currency?: string;
  months: number;
  plan: string;
  planLabel?: string;
  referenceCode: string;
  paymentDescription?: string;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
  approvedAt: string | null;
  createdAt: string;
  user?: { id: number; username: string; fullName: string | null; email: string | null; phone: string | null; role: string; teamName: string | null } | null;
}

export interface MemberAccountRequestRow {
  id: number;
  type: string;
  status: string;
  createdAt?: string;
  created_at?: string;
}

export interface MemberDetail {
  user: AdminMember;
  membership: { player?: PlanMembership; team?: PlanMembership; renewalWarningDays?: number };
  premiumOrders: (PremiumOrder & { created_at?: string })[];
  accountRequests: MemberAccountRequestRow[];
}

export interface MembersOverview {
  totals: {
    users: number;
    activeUsers: number;
    players: number;
    teamManagers: number;
    activePremiumPlans: number;
    pendingPremiumOrders: number;
    pendingAccountRequests: number;
    pendingChangeRequests: number;
    pendingMembers: number;
    doubleProfiles: number;
  };
}

export interface MemberListParams {
  q?: string;
  role?: string;
  status?: string;
  accountType?: string;
  profileType?: string;
  city?: string;
  page?: number;
  limit?: number;
}

export interface MemberUpdate {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  teamName?: string | null;
  role?: string;
  status?: string;
  profile_type?: string;
  player_id?: number | null;
  managed_team_id?: number | null;
}

/** adminRequestView — talep eden üye kartı. */
export interface RequestPerson {
  id: number;
  username?: string;
  fullName?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  member_since?: string | null;
  managed_team_id?: number | null;
  player?: { id: number; player_name?: string } | null;
  team?: { id: number; team_name?: string } | null;
  history?: { total?: number; approved?: number; rejected?: number; pending?: number };
}

export interface RequestTeam {
  id: number;
  team_name: string;
  logo?: string | null;
  city?: string | null;
  roster_size?: number | null;
  current_league?: string | null;
  current_season?: string | null;
  manager?: RequestPerson | null;
  managed?: boolean;
}

export interface RequestPlayer {
  id: number;
  player_name: string;
  player_img?: string | null;
  city?: string | null;
  player_position?: string | null;
  birth_year?: number | null;
  total_matches?: number | null;
  total_goals?: number | null;
  teams?: { team_name?: string }[];
  owner?: RequestPerson | null;
  owned?: boolean;
}

export interface AccountRequestItem {
  id: number;
  type: string;
  status: string;
  note?: string | null;
  payload?: Record<string, unknown> & { duplicate_check?: { confirmed_new?: boolean }; targetUsername?: string } | null;
  target_id?: number | null;
  requester?: RequestPerson | null;
  target_team?: RequestTeam | null;
  target_player?: RequestPlayer | null;
  transfer_target?: RequestPerson | null;
  possible_matches?: RequestPlayer[];
  similar_teams?: RequestTeam[];
  warnings?: string[];
  reviewer?: RequestPerson | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  createdAt?: string;
  created_at?: string;
}

export interface ChangeDiffRow {
  field: string;
  label: string;
  kind?: "image" | "link" | "text";
  before: unknown;
  after: unknown;
  changed: boolean;
}

export interface ChangeRequestItem {
  id: number;
  type: string;
  status: string;
  diff?: ChangeDiffRow[];
  requester?: RequestPerson | null;
  team?: RequestTeam | null;
  target_player?: RequestPlayer | null;
  sponsor_new?: boolean;
  warnings?: string[];
  reviewer?: RequestPerson | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  createdAt?: string;
  created_at?: string;
}

export interface RequestBoard<T> {
  items: T[];
  counts: Record<string, number>;
  cities: string[];
}

export interface PasswordReset {
  id: number;
  status: "requested" | "issued" | "used" | "cancelled";
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  expired: boolean;
  used_at: string | null;
  requested_ip: string | null;
  /** Kodun ulaştırılma yolu: "sms" NetGSM ile otomatik, "manual" yönetim iletti. Eski sunucuda yok. */
  channel?: "sms" | "manual";
  /** Hatalı kod denemesi sayısı. */
  attempts?: number;
  issued_by: { id: number; username: string; fullName: string | null } | null;
  user: { id: number; username?: string; fullName?: string | null; email?: string | null; phone?: string | null; city?: string | null; role?: string; status?: string | null };
}

/* ===================== uçlar ===================== */

const BASE = "/api/admin/users";
const enc = (value: number | string) => encodeURIComponent(String(value));

export const getMembersOverview = () => get<MembersOverview>(`${BASE}/overview`);

export const listMembers = (params: MemberListParams) =>
  get<{ users: AdminMember[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(BASE, {
    limit: 25,
    ...params,
  });

export const getMemberCities = () =>
  get<{ cities: string[] }>(`${BASE}/cities`, undefined, { retry: false }).then((d) => d.cities ?? []).catch(() => [] as string[]);

export const getMember = (id: number | string) => get<MemberDetail>(`${BASE}/${enc(id)}`);

export const updateMember = (id: number, body: MemberUpdate) =>
  patch<{ message: string; user: AdminMember }>(`${BASE}/${enc(id)}`, body);

export const reviewMember = (id: number, decision: "approved" | "rejected", note?: string) =>
  post<{ message: string; user: AdminMember }>(`${BASE}/${enc(id)}/review`, { decision, ...(note ? { note } : {}) });

/** premium: başlangıç/bitiş ISO; onay kuyruğuna bekleyen sipariş düşer. free: plan kaldırılır. */
export const setMembership = (
  id: number,
  plan: "player" | "team",
  body: { membership: "free" } | { membership: "premium"; startedAt: string; expiresAt: string }
) => put<{ message: string }>(`${BASE}/${enc(id)}/memberships/${plan}`, body);

export const deleteMember = (id: number) => del<{ message: string }>(`${BASE}/${enc(id)}`);

export const issuePasswordCode = (userId: number) =>
  post<{ message: string; code: string; expiresAt: string; username: string }>(`${BASE}/${enc(userId)}/password-reset`);

export const listAccountRequests = (params: { status?: string; type?: string; city?: string; q?: string }) =>
  get<{ requests: AccountRequestItem[]; counts: Record<string, number>; cities: string[] }>(`${BASE}/requests`, params).then(
    (d): RequestBoard<AccountRequestItem> => ({ items: d.requests ?? [], counts: d.counts ?? {}, cities: d.cities ?? [] })
  );

export const reviewAccountRequest = (
  id: number,
  body: { decision: "approved" | "rejected"; note?: string; linkPlayerId?: number; linkTeamId?: number }
) => post<{ message: string }>(`${BASE}/requests/${enc(id)}/review`, body);

export const listChangeRequests = (params: { status?: string; type?: string; city?: string; q?: string }) =>
  get<{ changes: ChangeRequestItem[]; counts: Record<string, number>; cities: string[] }>(`${BASE}/changes`, params).then(
    (d): RequestBoard<ChangeRequestItem> => ({ items: d.changes ?? [], counts: d.counts ?? {}, cities: d.cities ?? [] })
  );

export const reviewChangeRequest = (id: number, body: { decision: "approved" | "rejected"; note?: string }) =>
  post<{ message: string }>(`${BASE}/changes/${enc(id)}/review`, body);

export const listPasswordResets = (params: { status?: string; q?: string }) =>
  get<{ resets: PasswordReset[]; counts: Record<string, number> }>(`${BASE}/password-resets`, params, { retry: false });

export const cancelPasswordReset = (resetId: number) =>
  post<{ message: string }>(`${BASE}/password-resets/${enc(resetId)}/cancel`);

export const searchPlayerCandidates = (q: string) =>
  get<{ candidates: RequestPlayer[] }>("/api/users/player-candidates", { q }).then((d) => d.candidates ?? []);

export const searchTeamCandidates = (q: string) =>
  get<{ candidates: RequestTeam[] }>("/api/users/team-candidates", { q }).then((d) => d.candidates ?? []);

export const listPremiumOrders = (status: string) =>
  get<{ orders: PremiumOrder[] }>("/api/membership/admin/orders", { status }, { retry: false }).then((d) => d.orders ?? []);

export const decidePremiumOrder = (id: number, action: "approve" | "reject") =>
  post<{ message: string }>(`/api/membership/admin/orders/${enc(id)}/${action}`);

/* ===================== yardımcılar ===================== */

export const personName = (user?: { id?: number; fullName?: string | null; username?: string } | null) =>
  user?.fullName || user?.username || (user?.id ? `Üye #${user.id}` : "—");

/** Sunucu WhatsApp bağlantısı biçimi (PasswordResets whatsappLink). */
export function whatsappUrl(phone: string | null | undefined, text?: string): string | null {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `9${digits}`;
  else if (digits.length === 10) digits = `90${digits}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Hesap talebini tek cümleyle anlatır (AccountRequestsBoard summary). */
export function accountRequestSummary(item: AccountRequestItem): string {
  const who = personName(item.requester);
  const target =
    item.target_team?.team_name ||
    item.target_player?.player_name ||
    (item.payload?.team_name as string | undefined) ||
    (item.payload?.player_name as string | undefined) ||
    (item.target_id ? `#${item.target_id}` : "—");
  switch (item.type) {
    case "team_management": return `${who}, “${target}” takımının yönetimini istiyor.`;
    case "team_create": return `${who}, “${target}” adında yeni bir takım açıp yönetmek istiyor.`;
    case "player_claim": return `${who}, “${target}” oyuncu profilinin kendisine ait olduğunu söylüyor.`;
    case "player_create": return `${who}, “${target}” adına yeni bir oyuncu profili istiyor.`;
    case "player_unlink": return `${who}, “${target}” oyuncu profiliyle bağlantısını koparmak istiyor.`;
    case "team_resign": return `${who}, “${target}” takımının yönetiminden ayrılmak istiyor.`;
    case "team_transfer":
      return `${who}, “${target}” takımının yönetimini ${item.transfer_target ? personName(item.transfer_target) : `@${item.payload?.targetUsername || "?"}`} adlı üyeye devretmek istiyor.`;
    default: return `${who} — ${target}`;
  }
}

export function accountRequestOutcome(type: string): string | null {
  switch (type) {
    case "team_management": return "Takımın yönetimi bu üyeye tanımlanır; kadro, maç ve takım bilgilerini panelinden yönetebilir.";
    case "team_create": return "Gönderilen bilgilerle yeni bir takım kaydı açılır ve yönetimi bu üyeye tanımlanır. Takım zaten varsa aşağıdan o takımı sahiplendir.";
    case "player_claim": return "Oyuncu profili bu üyenin hesabına bağlanır; maç ve istatistik geçmişi panelinde görünür.";
    case "player_create": return "Gönderilen bilgilerle yeni bir oyuncu kaydı açılır ve üyeye bağlanır. Kişi mevcut bir kayıtsa aşağıdan o kayda bağla.";
    case "player_unlink": return "Hesap ile oyuncu profili arasındaki bağ kaldırılır. Oyuncu kaydı ve istatistikleri silinmez.";
    case "team_resign": return "Üyenin takım yönetim yetkisi kaldırılır; takım yöneticisiz kalır.";
    case "team_transfer": return "Takımın yönetimi devralacak üyeye geçer; talep eden üyenin yetkisi kaldırılır.";
    default: return null;
  }
}

export function changeRequestSummary(item: ChangeRequestItem): string {
  const who = personName(item.requester);
  const n = (item.diff ?? []).filter((d) => d.changed).length;
  const team = item.team?.team_name;
  const player = item.target_player?.player_name;
  switch (item.type) {
    case "team_update": return `${who}, “${team || "takım"}” takımının bilgilerinde ${n} alanı değiştirmek istiyor.`;
    case "team_logo": return `${who}, “${team || "takım"}” takımı için yeni logo gönderdi.`;
    case "player_update": return `${who}, “${player || "oyuncu"}” oyuncu profilinde ${n} alanı değiştirmek istiyor.`;
    case "player_release": return `${who}, “${player || "oyuncu"}” oyuncusunu “${team || "takım"}” kadrosundan çıkarmak istiyor.`;
    case "sponsor_update": return `${who}, ${team ? `“${team}” takımının` : "oyuncu profilinin"} sponsor alanını ${item.sponsor_new ? "eklemek" : "güncellemek"} istiyor.`;
    default: return `${who} — ${player || team || "—"}`;
  }
}

export function changeRequestOutcome(item: ChangeRequestItem): string {
  if (item.type === "player_release") return "Oyuncunun bu takımla bağı kaldırılır ve takımsız kalır. Oyuncu kaydı ve istatistikleri silinmez.";
  if (item.type === "sponsor_update" && item.sponsor_new) return "Yeni sponsor alanı oluşturulur ve profilde yayına alınır.";
  return "İstenen değerler hemen yayına alınır; profilde ve listelerde yeni hâliyle görünür.";
}
