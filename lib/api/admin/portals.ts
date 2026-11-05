import { del, get, patch, post } from "../../http";
import type { UploadFile } from "./broadcast";

/**
 * ÖZEL LİG SAYFALARI (Junior Cup) — routes/adminLeaguePortals.js
 * (/api/admin/league-portals)
 *
 * Web: pages/management/leaguePortals/LeaguePortalsAdmin.js. Bir lig sayfası
 * seçilen ligleri ve bu liglerin tüm sezonlarını kısa bir adreste
 * (elitlig.com/juniorcup) kendi logosu, renkleri ve düzeniyle gösterir.
 * Bir lig yalnız tek bir sayfaya atanabilir (sunucu 409 döner).
 */

const BASE = "/api/admin/league-portals";

export type ThemeMode = "light" | "dark" | "auto";

export interface PortalTheme {
  mode: ThemeMode;
  menu: Record<string, string>;
  light: Record<string, string>;
  dark: Record<string, string>;
}

export interface PortalMenuItem {
  key: string;
  label: string;
  visible: boolean;
}

export interface PortalLayout {
  hero: { enabled: boolean; title: string; subtitle: string; imageUrl: string; align: "left" | "center" };
  showScopePicker: boolean;
  fontStyle: string;
  cornerStyle: string;
  header: { style: string; sticky: boolean; showLogin: boolean; items: PortalMenuItem[]; links: { label: string; url: string }[] };
  home: { key: string; title: string; visible: boolean }[];
  footerText: string;
}

export interface PortalLeague {
  id: number;
  label: string;
  logo: string;
  cityId: number | null;
  seasons: { id: number; label: string; isArchived: boolean }[];
  defaultSeasonId: number | null;
}

export interface LeaguePortal {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  logoUrl: string;
  seoDescription: string;
  leagueIds: number[];
  defaultLeagueId: number | null;
  defaultSeasonId: number | null;
  theme: PortalTheme;
  layout: PortalLayout;
  active: boolean;
  updatedAt: string | null;
  leagues?: PortalLeague[];
}

export interface PortalCatalog {
  colorKeys: string[];
  defaultTheme: PortalTheme;
  sections: { key: string; label: string }[];
  fontStyles: { key: string; label: string }[];
  cornerStyles: { key: string; label: string }[];
  defaultLayout: PortalLayout;
  menuColorKeys: string[];
  menuItems: { key: string; label: string }[];
  maxCustomLinks: number;
  headerStyles: { key: string; label: string }[];
}

export type PortalPayload = Omit<LeaguePortal, "id" | "updatedAt" | "leagues">;

export const getPortalCatalog = () => get<PortalCatalog>(`${BASE}/catalog`);
export const listPortals = () => get<{ portals: LeaguePortal[] }>(BASE).then((d) => d.portals ?? []);
export const createPortal = (body: Partial<PortalPayload>) => post<{ message: string; portal: LeaguePortal }>(BASE, body);
export const updatePortal = (id: number, body: Partial<PortalPayload>) => patch<{ message: string; portal: LeaguePortal }>(`${BASE}/${id}`, body);
export const deletePortal = (id: number) => del<{ message: string }>(`${BASE}/${id}`);

export function uploadPortalImage(file: UploadFile) {
  const form = new FormData();
  form.append("image", file as unknown as Blob);
  return post<{ url: string }>(`${BASE}/upload`, form, { timeout: 120_000 }).then((d) => d.url);
}

/** Meta uçları (arşiv dahil) — lig seçici. */
export const getMetaLeaguesAll = (cityId: number) =>
  get<{ leagues: { id: number; label: string; is_archived?: boolean }[] }>("/api/meta/leagues", { cityId, includeArchived: 1 }).then((d) => d.leagues ?? []);
export const getMetaSeasonsAll = (cityId: number, leagueId: number) =>
  get<{ seasons: { id: number; label: string; is_archived?: boolean }[] }>("/api/meta/seasons", { cityId, leagueId, includeArchived: 1 }).then((d) => d.seasons ?? []);

/* ─────────────────────────── sözlükler ─────────────────────────── */

export const COLOR_LABELS: Record<string, string> = {
  primary: "Ana renk",
  primaryDark: "Ana renk (koyu ton)",
  primaryLight: "Ana renk (açık ton)",
  secondary: "İkincil vurgu",
  background: "Sayfa zemini (üst)",
  backgroundAlt: "Sayfa zemini (alt)",
  surface: "Kart zemini",
  border: "Kart kenarlığı",
  text: "Metin",
  heading: "Başlıklar",
  headerFrom: "Sayfa başlık bandı (başlangıç)",
  headerTo: "Sayfa başlık bandı (bitiş)",
};

export const MENU_COLOR_LABELS: Record<string, string> = {
  topBarBackground: "Üst şerit zemini",
  topBarText: "Üst şerit yazısı",
  background: "Menü zemini",
  text: "Menü yazısı",
  activeBackground: "Seçili öğe zemini",
  activeText: "Seçili öğe yazısı",
  buttonBackground: "Düğme zemini (Kayıt Ol)",
  buttonText: "Düğme yazısı",
};

export const THEME_MODES: { key: ThemeMode; label: string }[] = [
  { key: "light", label: "Her zaman açık" },
  { key: "dark", label: "Her zaman koyu" },
  { key: "auto", label: "Ziyaretçinin tercihi" },
];

export const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "Junior Cup" → "juniorcup" önerisi (sunucu ayrıca normalleştirir). */
export function suggestSlug(name: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
  return String(name || "")
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "")
    .slice(0, 40);
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null));

export function emptyPortal(catalog?: PortalCatalog | null): PortalPayload {
  return {
    name: "",
    shortName: "",
    slug: "",
    logoUrl: "",
    seoDescription: "",
    active: true,
    leagueIds: [],
    defaultLeagueId: null,
    defaultSeasonId: null,
    theme: clone(catalog?.defaultTheme) || { mode: "light", menu: {}, light: {}, dark: {} },
    layout:
      clone(catalog?.defaultLayout) ||
      ({ hero: { enabled: true, title: "", subtitle: "", imageUrl: "", align: "left" }, showScopePicker: true, fontStyle: "default", cornerStyle: "default", header: { style: "bar", sticky: true, showLogin: true, items: [], links: [] }, home: [], footerText: "" } as PortalLayout),
  };
}

export function portalPayload(p: LeaguePortal): PortalPayload {
  return {
    name: p.name,
    shortName: p.shortName,
    slug: p.slug,
    logoUrl: p.logoUrl,
    seoDescription: p.seoDescription,
    active: p.active,
    leagueIds: [...(p.leagueIds ?? [])],
    defaultLeagueId: p.defaultLeagueId,
    defaultSeasonId: p.defaultSeasonId,
    theme: clone(p.theme),
    layout: clone(p.layout),
  };
}

export const moveItem = <T>(list: T[], index: number, delta: number): T[] => {
  const next = list.slice();
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};
