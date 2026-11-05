import { del, get, patch, post, put } from "../../http";

/**
 * REHBER + TAKIM REHBERİ — elitlig-server routes/tools.js (kişisel kartlar,
 * üye ve takım rehberi), routes/adminTeamsDirectory.js ve
 * routes/adminTeamNotes.js.
 *
 *   GET    /api/tools/contacts                    → { items } kişisel kişi / cari kartları
 *   POST   /api/tools/contacts                    → { item }
 *   PATCH  /api/tools/contacts/:id                → { item }
 *   DELETE /api/tools/contacts/:id
 *   GET    /api/tools/contacts/directory          → üye rehberi (users.view + il kapsamı)
 *   GET    /api/tools/contacts/directory/:id      → { item }
 *   GET    /api/tools/contacts/teams              → takım rehberi (users.view + il kapsamı)
 *   GET    /api/tools/contacts/teams/:id          → takım kartı
 *   GET    /api/admin/teams-directory             → yönetim takım rehberi (teams.directory)
 *   GET/PUT/POST/PATCH/DELETE /api/admin/team-notes/:teamId… (teams.notes)
 *
 * Üyeye bağlı kişisel kart (`member_user_id` dolu) yalnız not / etiket /
 * favori taşır; iletişim bilgisi üye kaydından canlı okunur.
 */

/* ═══════════════════════════════ TİPLER ═══════════════════════════════ */

export type MemberCategory = "uye" | "oyuncu" | "takim_baskani" | "yonetim";
export type MemberStatus = "approved" | "pending" | "suspended" | "rejected";
export type MemberSort = "newest" | "oldest" | "name" | "name_desc";
export type TeamSort = "name" | "city" | "members" | "matches" | "newest";

export interface PersonalContact {
  id: number;
  name: string;
  company: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  tags: string[];
  note: string | null;
  favorite: boolean;
  member_user_id: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ContactInput {
  name: string;
  company?: string;
  title?: string;
  phone?: string;
  email?: string;
  city?: string;
  tags?: string[];
  note?: string;
  favorite?: boolean;
  member_user_id?: number;
}

export interface DirectoryMember {
  id: number;
  source: "member";
  name: string;
  fullName: string | null;
  username: string;
  role: string;
  categories: MemberCategory[];
  status: MemberStatus | string;
  phone: string | null;
  email: string | null;
  city: string | null;
  team: { id: number | null; name: string | null } | null;
  player: { id: number; name: string | null; team: string | null } | null;
  createdAt: string | null;
  isNew: boolean;
}

export interface DirectoryCounts {
  all: number;
  uye: number;
  oyuncu: number;
  takim_baskani: number;
  yonetim: number;
  new_week: number;
}

export interface DirectoryResponse {
  items: DirectoryMember[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  sort: MemberSort;
  counts?: DirectoryCounts;
  cities?: string[];
}

export interface DirectoryParams {
  q?: string;
  category?: MemberCategory | null;
  status?: string | null;
  city?: string | null;
  has_phone?: boolean;
  new?: boolean;
  sort?: MemberSort;
  page?: number;
  page_size?: number;
  export?: boolean;
}

/** Takım kartındaki kişi (başkan ya da hesabı olan oyuncu). */
export interface PersonCard {
  id: number;
  name: string;
  username: string;
  role: string;
  categories: MemberCategory[];
  phone: string | null;
  email: string | null;
  city: string | null;
  status: string;
  created_at: string | null;
}

export interface TeamRecord {
  wins: number;
  draws: number;
  losses: number;
  goals_for?: number;
  goals_against?: number;
}

export interface DirectoryTeam {
  team_id: number;
  team_name: string;
  logo: string | null;
  city: string | null;
  active: boolean;
  league: string | null;
  season: string | null;
  total_matches: number;
  record: TeamRecord;
  created_at: string | null;
  captains: PersonCard[];
  member_count: number;
  player_accounts: number;
  roster_count: number;
  contact_count: number;
}

export interface TeamsResponse {
  items: DirectoryTeam[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  sort: TeamSort;
  cities: string[];
}

export interface TeamsParams {
  q?: string;
  city?: string | null;
  sort?: TeamSort;
  has_contact?: boolean;
  page?: number;
  page_size?: number;
}

export interface TeamMatch {
  id: number;
  date: string | null;
  time: string | null;
  home: string;
  away: string;
  home_score: number | null;
  away_score: number | null;
  field: string | null;
  league: string | null;
  season: string | null;
  is_home: boolean;
}

export interface TeamCard {
  team: {
    team_id: number;
    team_name: string;
    logo: string | null;
    city: string | null;
    active: boolean;
    league: string | null;
    season: string | null;
    total_matches: number;
    record: TeamRecord;
    founded_at: string | null;
    created_at: string | null;
  };
  captains: PersonCard[];
  players: { player_id: number; name: string; position: string | null; account: PersonCard | null }[];
  seasons: { name: string; played: number }[];
  last_matches: TeamMatch[];
  next_matches: TeamMatch[];
}

/* — Yönetim takım rehberi (teams.directory) — */

export type TeamOrigin = "created" | "claimed" | "unmanaged";

export interface TeamAdminContact {
  contact_name: string;
  phone: string;
  phone2: string;
  whatsapp: string;
  email: string;
  updated_at: string | null;
  updated_by: number | null;
}

export interface TeamNote {
  id: number;
  team_id: number;
  body: string;
  pinned: boolean;
  created_by: number | null;
  author: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminDirectoryTeam {
  id: number;
  team_name: string;
  logo: string | null;
  city: string | null;
  city_id: number | null;
  current_league: string | null;
  current_season: string | null;
  active: boolean;
  created_at: string | null;
  origin: TeamOrigin;
  origin_label: string;
  manager: { id: number; name: string; username: string; phone: string | null; email: string | null; status: string; since: string | null } | null;
  contact: TeamAdminContact | null;
  notes?: TeamNote[];
}

export interface AdminTeamsDirectoryResponse {
  items: AdminDirectoryTeam[];
  total: number;
  cities: string[];
  scope: { nationwide: true } | { nationwide: false; city: string | null };
  origins: { key: TeamOrigin; label: string }[];
  can_manage_notes: boolean;
}

export interface TeamNotesResponse {
  team_id: number;
  contact: TeamAdminContact | null;
  notes: TeamNote[];
}

/* ═══════════════════════════════ ETİKETLER ═══════════════════════════════ */

export const CATEGORY_LABELS: Record<MemberCategory | "manual", string> = {
  uye: "Üye",
  oyuncu: "Oyuncu",
  takim_baskani: "Takım Başkanı",
  yonetim: "Yönetim",
  manual: "Manuel Kayıt",
};

export const STATUS_LABELS: Record<MemberStatus, string> = {
  approved: "Onaylı",
  pending: "Onay bekliyor",
  suspended: "Askıda",
  rejected: "Reddedildi",
};

export const MEMBER_SORTS: { key: MemberSort; label: string }[] = [
  { key: "newest", label: "Yeniden eskiye" },
  { key: "oldest", label: "Eskiden yeniye" },
  { key: "name", label: "Ada göre (A→Z)" },
  { key: "name_desc", label: "Ada göre (Z→A)" },
];

export const TEAM_SORTS: { key: TeamSort; label: string }[] = [
  { key: "name", label: "Ada göre" },
  { key: "city", label: "İle göre" },
  { key: "members", label: "Üye sayısı" },
  { key: "matches", label: "Maç sayısı" },
  { key: "newest", label: "En yeni" },
];

export const ORIGIN_LABELS: Record<TeamOrigin, string> = {
  created: "Yetkili oluşturdu",
  claimed: "Yetkili sahiplendi",
  unmanaged: "Yetkilisi yok",
};

/** Takım iletişim formunun alanları (web TeamContactForm CONTACT_FIELDS). */
export const TEAM_CONTACT_FIELDS: { key: keyof Omit<TeamAdminContact, "updated_at" | "updated_by">; label: string; managerKey?: "name" | "phone" | "email"; kind: "text" | "phone" | "email" }[] = [
  { key: "contact_name", label: "İletişim kişisi", managerKey: "name", kind: "text" },
  { key: "phone", label: "Telefon", managerKey: "phone", kind: "phone" },
  { key: "phone2", label: "İkinci telefon", kind: "phone" },
  { key: "whatsapp", label: "WhatsApp", kind: "phone" },
  { key: "email", label: "E-posta", managerKey: "email", kind: "email" },
];

export const NOTE_EXAMPLES = ["Çoğunlukla çarşamba günleri oynuyorlar", "Zorda kalırsan çağır", "Hafta sonu oynamıyorlar"];

/* ═══════════════════════════════ UÇLAR ═══════════════════════════════ */

const flag = (v?: boolean) => (v ? 1 : undefined);

export const listContacts = () => get<{ items: PersonalContact[] }>("/api/tools/contacts", undefined, { retry: false });
export const createContact = (input: ContactInput) => post<{ item: PersonalContact }>("/api/tools/contacts", input);
export const updateContact = (id: number, input: Partial<ContactInput>) => patch<{ item: PersonalContact }>(`/api/tools/contacts/${id}`, input);
export const deleteContact = (id: number) => del<{ ok: true; id: number }>(`/api/tools/contacts/${id}`);

export const listDirectory = (params: DirectoryParams = {}) =>
  get<DirectoryResponse>("/api/tools/contacts/directory", {
    q: params.q || undefined,
    category: params.category || undefined,
    status: params.status || undefined,
    city: params.city || undefined,
    has_phone: flag(params.has_phone),
    new: flag(params.new),
    sort: params.sort,
    page: params.page,
    page_size: params.page_size,
    export: flag(params.export),
  });

export const getDirectoryMember = (id: number) => get<{ item: DirectoryMember }>(`/api/tools/contacts/directory/${id}`);

export const listDirectoryTeams = (params: TeamsParams = {}) =>
  get<TeamsResponse>("/api/tools/contacts/teams", {
    q: params.q || undefined,
    city: params.city || undefined,
    sort: params.sort,
    has_contact: flag(params.has_contact),
    page: params.page,
    page_size: params.page_size,
  });

export const getTeamCard = (id: number) => get<TeamCard>(`/api/tools/contacts/teams/${id}`);

export const listAdminTeamsDirectory = (params: { q?: string; city?: string; origin?: string } = {}) =>
  get<AdminTeamsDirectoryResponse>("/api/admin/teams-directory", {
    q: params.q || undefined,
    city: params.city || undefined,
    origin: params.origin || undefined,
  });

export const getTeamNotes = (teamId: number) => get<TeamNotesResponse>(`/api/admin/team-notes/${teamId}`);
export const saveTeamContact = (teamId: number, body: Partial<Record<string, string>>) =>
  put<{ contact: TeamAdminContact | null }>(`/api/admin/team-notes/${teamId}/contact`, body);
export const addTeamNote = (teamId: number, body: { body: string; pinned?: boolean }) =>
  post<{ note: TeamNote }>(`/api/admin/team-notes/${teamId}/notes`, body);
export const updateTeamNote = (teamId: number, noteId: number, body: { body?: string; pinned?: boolean }) =>
  patch<{ note: TeamNote }>(`/api/admin/team-notes/${teamId}/notes/${noteId}`, body);
export const deleteTeamNote = (teamId: number, noteId: number) => del<{ ok: true }>(`/api/admin/team-notes/${teamId}/notes/${noteId}`);

/* ═══════════════════════════════ YARDIMCILAR ═══════════════════════════════ */

export const digitsOf = (phone: string | null | undefined = "") => String(phone || "").replace(/\D/g, "");

/** WhatsApp için uluslararası numara: 0555… → 90555…, 555… → 90555… (web contactUtils). */
export const waNumber = (phone: string | null | undefined = "") => {
  let digits = digitsOf(phone);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("5")) digits = `90${digits}`;
  return digits;
};

/** Görünüm için: 05551234567 → 0555 123 45 67 */
export const prettyPhone = (phone: string | null | undefined = "") => {
  const d = digitsOf(phone);
  if (d.length === 11 && d.startsWith("0")) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  if (d.length === 10 && d.startsWith("5")) return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
  if (d.length === 12 && d.startsWith("90")) return `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return phone || "";
};

/** Rehber satırındaki takım: başkansa yönettiği takım, oyuncuysa oynadığı takım. */
export const memberTeam = (m: DirectoryMember | null | undefined): { name: string; captain: boolean } | null =>
  m?.team?.name ? { name: m.team.name, captain: true } : m?.player?.team ? { name: m.player.team, captain: false } : null;

export type TeamPerson = PersonCard & { label: string; position: string | null; player_name?: string };

/** Takımın iletişim listesi: başkanlar + hesabı olan oyuncular (tekil). */
export const teamPeople = (card: TeamCard | null | undefined): TeamPerson[] => {
  const seen = new Set<number>();
  const out: TeamPerson[] = [];
  (card?.captains || []).forEach((c) => {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      out.push({ ...c, label: "Takım başkanı", position: null });
    }
  });
  (card?.players || []).forEach((p) => {
    if (p.account && !seen.has(p.account.id)) {
      seen.add(p.account.id);
      out.push({ ...p.account, label: "Oyuncu", position: p.position, player_name: p.name });
    }
  });
  return out;
};

/** Yönetimin girdiği iletişim yetkilinin hesabındakinin önüne geçer (web TeamsDirectory). */
export const effectiveTeamContact = (team: AdminDirectoryTeam) => ({
  name: team.contact?.contact_name || team.manager?.name || "",
  phone: team.contact?.phone || team.manager?.phone || "",
  phone2: team.contact?.phone2 || "",
  whatsapp: team.contact?.whatsapp || "",
  email: team.contact?.email || team.manager?.email || "",
});

/* — Dışa aktarım (CSV / vCard) — */

const csvCell = (v: unknown) => (/[";\n\r]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
export const toCsv = (rows: unknown[][]) => `\uFEFF${rows.map((r) => r.map(csvCell).join(";")).join("\r\n")}`;
const vcf = (v: unknown = "") => String(v ?? "").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

export interface ExportRow {
  name: string;
  username: string | null;
  categories: string[];
  phone: string | null;
  email: string | null;
  city: string | null;
  org: string | null;
  status: string | null;
  createdAt: string | null;
  note: string | null;
}

const dateTr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

/** Rehber CSV'si (web Contacts EXPORT_COLUMNS ile aynı sütunlar). */
export const contactsCsv = (rows: ExportRow[]) =>
  toCsv([
    ["Ad Soyad", "Kullanıcı adı", "Tür", "Telefon", "E-posta", "Şehir", "Takım / Kurum", "Durum", "Kayıt tarihi", "Not"],
    ...rows.map((r) => [
      r.name,
      r.username || "",
      r.categories.map((c) => CATEGORY_LABELS[c as MemberCategory] || c).join(", "),
      prettyPhone(r.phone),
      r.email || "",
      r.city || "",
      r.org || "",
      r.status ? STATUS_LABELS[r.status as MemberStatus] || r.status : "",
      dateTr(r.createdAt),
      r.note || "",
    ]),
  ]);

export const contactsVcard = (rows: ExportRow[]) =>
  rows
    .map((r) =>
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${vcf(r.name)}`,
        r.username && `NICKNAME:${vcf(r.username)}`,
        r.org && `ORG:${vcf(r.org)}`,
        r.phone && `TEL;TYPE=CELL:${r.phone}`,
        r.email && `EMAIL:${r.email}`,
        r.city && `ADR;TYPE=HOME:;;;${vcf(r.city)};;;`,
        `CATEGORIES:${r.categories.map((c) => vcf(CATEGORY_LABELS[c as MemberCategory] || c)).join(",")}`,
        r.note && `NOTE:${vcf(r.note)}`,
        "END:VCARD",
      ]
        .filter(Boolean)
        .join("\r\n")
    )
    .join("\r\n");

export const teamVcard = (card: TeamCard) =>
  teamPeople(card)
    .map((p) =>
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${vcf(p.name)}`,
        `ORG:${vcf(card.team.team_name)}`,
        `TITLE:${vcf(p.label)}`,
        p.phone && `TEL;TYPE=CELL:${p.phone}`,
        p.email && `EMAIL:${p.email}`,
        p.city && `ADR;TYPE=HOME:;;;${vcf(p.city)};;;`,
        "END:VCARD",
      ]
        .filter(Boolean)
        .join("\r\n")
    )
    .join("\r\n");

export const teamCsv = (card: TeamCard) =>
  toCsv([
    ["Takım", "Ad Soyad", "Görev", "Mevki", "Telefon", "E-posta", "İl"],
    ...teamPeople(card).map((p) => [card.team.team_name, p.name, p.label, p.position || "", prettyPhone(p.phone), p.email || "", p.city || ""]),
  ]);

export const exportFileName = (base: string) =>
  `elitlig-${base.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9ğüşıöç]+/gi, "-").replace(/^-+|-+$/g, "") || "rehber"}`;
