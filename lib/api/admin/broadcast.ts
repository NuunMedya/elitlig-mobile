import { del, get, patch, post } from "../../http";

/**
 * YAYIN — Elitlig Panorama reji uçları ve Sponsorlar.
 *
 *   Panorama   routes/adminPanorama.js  (/api/admin/panorama)
 *              Web: pages/management/panorama/PanoramaAdmin.js
 *   Sponsorlar routes/adminSponsors.js  (/api/admin/sponsors)
 *              Web: pages/management/sponsors/SponsorsAdmin.js
 *
 * Panorama'da yayına vermek (sahne) ayrı yetkidir (panorama.broadcast);
 * yayını kuran ile canlıda düğmeye basan kişi aynı olmak zorunda değildir.
 */

const PANO = "/api/admin/panorama";
const SPON = "/api/admin/sponsors";

/** RN fetch dosya nesnesini { uri, name, type } üçlüsüyle tanır. */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

/* ═════════════════════════════ PANORAMA ═════════════════════════════ */

export type PanoramaLayout = "solo" | "duo" | "trio";

export interface PanoramaScene {
  key: string;
  label: string;
  group: string;
  hint: string;
  params: string[];
  required: string[];
}

export interface PanoramaCatalog {
  scenes: PanoramaScene[];
  layouts: { value: PanoramaLayout; label: string }[];
  themes: { key: string; label: string; hint: string }[];
  listLimit: { DEFAULT: number; MIN: number; MAX: number } | null;
}

export interface PanoramaGuest {
  name: string;
  role: string;
}

export interface PanoramaBroadcast {
  id: number;
  cityId: number;
  leagueId: number | null;
  seasonId: number | null;
  name: string;
  episodeTitle: string | null;
  layout: PanoramaLayout;
  theme: string;
  brandTitle: string | null;
  brandLogoUrl: string | null;
  brandStyle: Record<string, unknown> | null;
  guests: PanoramaGuest[];
  scene: { type: string; params: Record<string, unknown>; sequence: number; updatedAt: string | null };
  tickerText: string | null;
  tickerVisible: boolean;
  isLive: boolean;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type PanoramaPatch = Partial<{
  name: string;
  episodeTitle: string;
  layout: PanoramaLayout;
  theme: string;
  brandTitle: string;
  brandLogoUrl: string;
  guests: PanoramaGuest[];
  leagueId: number | null;
  seasonId: number | null;
  tickerText: string;
  tickerVisible: boolean;
  isLive: boolean;
  notes: string;
  cityId: number;
}>;

export interface ScenePreview {
  missing: string[];
  payload: ({ title?: string | null; subtitle?: string | null } & Record<string, unknown>) | null;
}

export const getPanoramaCatalog = () => get<PanoramaCatalog>(`${PANO}/catalog`);
export const listBroadcasts = (params?: { cityId?: number | null }) =>
  get<{ items: PanoramaBroadcast[]; total: number }>(PANO, { cityId: params?.cityId ?? undefined }).then((d) => d.items ?? []);
export const getBroadcast = (id: number) => get<{ broadcast: PanoramaBroadcast }>(`${PANO}/${id}`).then((d) => d.broadcast);
export const createBroadcast = (body: PanoramaPatch & { name: string }) => post<{ broadcast: PanoramaBroadcast }>(PANO, body).then((d) => d.broadcast);
export const updateBroadcast = (id: number, body: PanoramaPatch) => patch<{ broadcast: PanoramaBroadcast }>(`${PANO}/${id}`, body).then((d) => d.broadcast);
export const deleteBroadcast = (id: number) => del<{ deleted: boolean }>(`${PANO}/${id}`);
/** SAHNEYİ YAYINA VER — aynı sahne yeniden gönderilirse kaplama girişini baştan oynatır. */
export const setScene = (id: number, type: string, params: Record<string, unknown>) =>
  post<{ broadcast: PanoramaBroadcast }>(`${PANO}/${id}/scene`, { type, params }).then((d) => d.broadcast);
/** Yayına vermeden önizleme: eksik seçim hata değildir, `missing` dolu döner. */
export const previewScene = (id: number, type: string, params: Record<string, unknown>) =>
  post<ScenePreview>(`${PANO}/${id}/preview`, { type, params });

export function uploadPanoramaLogo(id: number, file: UploadFile) {
  const form = new FormData();
  form.append("image", file as unknown as Blob);
  return post<{ url: string }>(`${PANO}/${id}/logo`, form, { timeout: 120_000 }).then((d) => d.url);
}

export interface LookupPlayer {
  id: number;
  name: string;
  image?: string | null;
  position?: string | null;
  teamName?: string | null;
}
export interface LookupTeam {
  id: number;
  name: string;
  logo?: string | null;
  league?: string | null;
}
export interface LookupMatch {
  id: number;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  date: string | null;
  time: string | null;
  leagueName: string | null;
  seasonName: string | null;
  status: string | null;
}
export interface LookupAwardSet {
  id: number;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
}

type LookupParams = { q?: string; cityId?: number | null; leagueId?: number | null; seasonId?: number | null; limit?: number };
const lookup = <T>(path: string) => (p: LookupParams = {}) =>
  get<{ items: T[] }>(`${PANO}/lookup/${path}`, {
    q: p.q || undefined,
    cityId: p.cityId ?? undefined,
    leagueId: p.leagueId ?? undefined,
    seasonId: p.seasonId ?? undefined,
    limit: p.limit,
  }).then((d) => d.items ?? []);

export const lookupPlayers = lookup<LookupPlayer>("players");
export const lookupTeams = lookup<LookupTeam>("teams");
export const lookupMatches = lookup<LookupMatch>("matches");
export const lookupLeagues = lookup<{ id: number; name: string; cityId: number }>("leagues");
export const lookupSeasons = lookup<{ id: number; name: string; cityId: number; leagueId: number }>("seasons");
export const lookupAwardSets = lookup<LookupAwardSet>("award-sets");

/** Sunucudaki missingSceneParams ile aynı kural; düğme boşuna basılmasın. */
export function missingParams(scene: PanoramaScene | undefined, form: Record<string, unknown>): string[] {
  if (!scene) return ["type"];
  return (scene.required || []).filter((name) => {
    if (name === "scope") return !form.leagueId || !form.seasonId;
    const v = form[name];
    return v == null || String(v).trim() === "";
  });
}

/** Sahne parametre adlarının ekran karşılığı. */
export const PARAM_LABELS: Record<string, string> = {
  scope: "Lig ve sezon",
  range: "Sıra aralığı",
  date: "Tarih",
  dateRange: "Tarih aralığı",
  matchId: "Maç",
  playerId: "Oyuncu",
  playerId2: "İkinci oyuncu",
  teamId: "Takım",
  teamId2: "İkinci takım",
  awardSetId: "Haftanın enleri seti",
  title: "Başlık",
  text: "Metin",
  type: "Sahne",
};

/** Kaplama adresleri: her konuk alt kümesi için çıplak ve içerikli bağlantı (web panoramaLayout). */
export function overlayLinks(origin: string, id: number, guests: PanoramaGuest[], layout: PanoramaLayout) {
  const count = layout === "solo" ? 1 : layout === "trio" ? 3 : 2;
  const names = Array.from({ length: count }, (_, i) => (guests[i]?.name || "").trim() || `${i + 1}. konuk`);
  const indices = names.map((_, i) => i + 1);
  const subsets: number[][] = [[]];
  indices.forEach((n) => {
    const len = subsets.length;
    for (let i = 0; i < len; i += 1) subsets.push([...subsets[i], n]);
  });
  subsets.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()));
  const slug = (slots: number[]) => (slots.length ? slots.join("-") : "0");
  const out: { key: string; label: string; url: string }[] = [];
  subsets.forEach((slots) => {
    const people = slots.map((s) => names[s - 1]).join(" · ");
    if (slots.length) out.push({ key: slug(slots), label: people, url: `${origin}/panorama/${id}/${slug(slots)}` });
    out.push({ key: `${slug(slots)}-icerik`, label: slots.length ? `${people} + İçerik` : "Yalnız İçerik", url: `${origin}/panorama/${id}/${slug(slots)}/icerik` });
  });
  return out;
}

/* ═════════════════════════════ SPONSORLAR ═════════════════════════════ */

export interface SponsorCatalog {
  imageSlots: { key: string; label: string; size: string }[];
  placements: { key: string; group: "broadcast" | "led" | "web"; label: string; image: string; fallback: string | null }[];
  tiers: { key: string; label: string }[];
  scope: { nationwide: boolean; cityId: number | null };
}

export interface Sponsor {
  id: number;
  name: string;
  tagline: string;
  description: string;
  linkUrl: string;
  tier: string;
  brandColor: string;
  cityId: number | null;
  priority: number;
  active: boolean;
  startDate: string;
  endDate: string;
  displaySeconds: number;
  images: Record<string, string>;
  placements: string[];
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
  live: boolean;
  editable?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type SponsorPayload = Omit<Sponsor, "id" | "live" | "editable" | "createdAt" | "updatedAt">;

export const getSponsorCatalog = () => get<SponsorCatalog>(`${SPON}/catalog`);
export const listSponsors = (params?: { cityId?: string }) =>
  get<{ sponsors: Sponsor[] }>(SPON, { cityId: params?.cityId || undefined }).then((d) => d.sponsors ?? []);
export const getSponsor = (id: number) => get<{ sponsor: Sponsor }>(`${SPON}/${id}`).then((d) => d.sponsor);
export const createSponsor = (body: Partial<SponsorPayload>) => post<{ message: string; sponsor: Sponsor }>(SPON, body);
export const updateSponsor = (id: number, body: Partial<SponsorPayload>) => patch<{ message: string; sponsor: Sponsor }>(`${SPON}/${id}`, body);
export const deleteSponsor = (id: number) => del<{ message: string }>(`${SPON}/${id}`);

/** Görseli yükler ve adresini döndürür; sponsor kaydedilince kalıcı olur. */
export function uploadSponsorImage(file: UploadFile) {
  const form = new FormData();
  form.append("image", file as unknown as Blob);
  return post<{ url: string; message?: string }>(`${SPON}/upload`, form, { timeout: 120_000 }).then((d) => d.url);
}

export const PLACEMENT_GROUPS: { key: "broadcast" | "led" | "web"; label: string }[] = [
  { key: "broadcast", label: "Canlı yayın" },
  { key: "led", label: "Saha LED ekranı" },
  { key: "web", label: "Web sitesi" },
];
