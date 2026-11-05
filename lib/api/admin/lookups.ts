import type { Option } from "@/components/admin";

import { get } from "../../http";
import type { AuthUser } from "../../types";

/**
 * ORTAK SEÇİCİ KAYNAKLARI — lig / sezon / takım / oyuncu / il.
 *
 * Web yönetim sayfaları listeleri `buildScopedPath` ile çeker: Türkiye geneli
 * admin tüm kayıtları (`/ligler`), il yetkilisi yalnız kendi ilini
 * (`/ligler/by-city/<il>`) görür. Burada aynı kural tek yerde durur; seçici
 * alanları (`SelectField loadOptions`) bu fonksiyonlarla beslenir.
 *
 * Arama sunucuya gitmez (lig/sezon/takım listeleri küçük ve önbellekli);
 * oyuncu araması ise sunucudaki sayfalı yönetim listesine gider.
 */

/* ───────────────────────── Kapsam ───────────────────────── */

const fold = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Metin araması için katlanmış biçim (büyük/küçük ve aksan duyarsız). */
export const foldText = fold;

/** utils/cityScope.isTurkeyAdminScope ile aynı: admin rolü + il "Türkiye". */
export function isNationwide(user: AuthUser | null | undefined): boolean {
  return Boolean(user && user.role === "admin" && ["turkiye", "turkey"].includes(fold(user.city)));
}

/** buildScopedPath — il yetkilisinde `/by-city/<il>` eklenir. */
export function scopedPath(base: string, user: AuthUser | null | undefined): string {
  if (isNationwide(user) || !user?.city) return base;
  return `${base}/by-city/${encodeURIComponent(user.city)}`;
}

/** Sunucu bazen düz dizi, bazen { data | items | teams } döndürür. */
export function asArray<T>(payload: unknown, ...keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    for (const key of ["data", "items", ...keys]) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

/** is_archived 0/1, "true", null toleranslı (services/archiveApi.isArchivedEntity). */
export function isArchived(entity: { is_archived?: unknown } | null | undefined): boolean {
  const raw = entity?.is_archived;
  if (raw == null) return false;
  if (typeof raw === "string") return ["1", "true", "evet", "yes"].includes(raw.trim().toLowerCase());
  return Boolean(raw);
}

/* ───────────────────────── Ham listeler ───────────────────────── */

export interface LookupLeague {
  id: number;
  league_name: string;
  city?: string | null;
  city_id?: number | null;
  league_priority?: number | null;
  is_archived?: boolean | number | null;
}

export interface LookupSeason {
  id: number;
  season_name: string;
  league_name?: string | null;
  league_id?: number | null;
  city?: string | null;
  city_id?: number | null;
  season_priority?: number | null;
  is_archived?: boolean | number | null;
}

export interface LookupTeam {
  id: number;
  team_name: string;
  logo?: string | null;
  city?: string | null;
  current_league?: string | null;
  current_season?: string | null;
  active?: boolean | null;
}

export const fetchScopedLeagues = (user: AuthUser | null | undefined, includeArchived = true) =>
  get<unknown>(scopedPath("/ligler", user), { includeArchived: includeArchived ? 1 : undefined }).then((d) =>
    asArray<LookupLeague>(d)
  );

export const fetchScopedSeasons = (user: AuthUser | null | undefined, includeArchived = true) =>
  get<unknown>(scopedPath("/sezonlar", user), { includeArchived: includeArchived ? 1 : undefined }).then((d) =>
    asArray<LookupSeason>(d)
  );

export const fetchScopedTeams = (user: AuthUser | null | undefined) =>
  get<unknown>(scopedPath("/takimlar", user)).then((d) => asArray<LookupTeam>(d, "teams"));

/**
 * Sezon → lig eşleştirmesi (utils/seasonLeague.seasonBelongsToLeague):
 * önce kimlik, kimliği olmayan eski sezonlarda ad + il.
 */
export function seasonBelongsToLeague(season: LookupSeason, league: LookupLeague): boolean {
  if (season.league_id != null && league.id != null) return Number(season.league_id) === Number(league.id);
  if (!season.league_name || fold(season.league_name) !== fold(league.league_name)) return false;
  if (season.city_id != null && league.city_id != null) return Number(season.city_id) === Number(league.city_id);
  if (season.city && league.city) return fold(season.city) === fold(league.city);
  return true;
}

/* ───────────────────────── Seçici yükleyicileri ───────────────────────── */

const matches = (label: string, q: string) => !q || fold(label).includes(fold(q));

/** İl seçenekleri — /api/meta/cities (değer: il adı). */
export async function loadCityOptions(q = ""): Promise<Option<string>[]> {
  const data = await get<{ cities?: { id: number; label: string }[] }>("/api/meta/cities");
  return (data.cities ?? [])
    .filter((c) => matches(c.label, q))
    .map((c) => ({ value: c.label, label: c.label }));
}

/** Lig seçici: değer lig kimliği. Arşivdekiler "(Arşiv)" etiketiyle. */
export function leagueOptionsLoader(user: AuthUser | null | undefined, { includeArchived = false } = {}) {
  return async (q: string): Promise<Option<number>[]> => {
    const list = await fetchScopedLeagues(user, includeArchived);
    const nationwide = isNationwide(user);
    return list
      .filter((l) => includeArchived || !isArchived(l))
      .filter((l) => matches(`${l.league_name} ${l.city ?? ""}`, q))
      .sort((a, b) => (a.league_priority ?? 9999) - (b.league_priority ?? 9999) || a.league_name.localeCompare(b.league_name, "tr"))
      .map((l) => ({
        value: l.id,
        label: isArchived(l) ? `${l.league_name} (Arşiv)` : l.league_name,
        hint: nationwide ? l.city ?? null : null,
      }));
  };
}

/** Sezon seçici: `leagueId` verilirse yalnız o ligin sezonları. */
export function seasonOptionsLoader(
  user: AuthUser | null | undefined,
  { leagueId, includeArchived = false }: { leagueId?: number | null; includeArchived?: boolean } = {}
) {
  return async (q: string): Promise<Option<number>[]> => {
    const [seasons, leagues] = await Promise.all([
      fetchScopedSeasons(user, includeArchived),
      leagueId ? fetchScopedLeagues(user, true) : Promise.resolve([] as LookupLeague[]),
    ]);
    const league = leagueId ? leagues.find((l) => Number(l.id) === Number(leagueId)) : null;
    return seasons
      .filter((s) => includeArchived || !isArchived(s))
      .filter((s) => (league ? seasonBelongsToLeague(s, league) : true))
      .filter((s) => matches(`${s.season_name} ${s.league_name ?? ""}`, q))
      .sort((a, b) => (a.season_priority ?? 9999) - (b.season_priority ?? 9999) || b.id - a.id)
      .map((s) => ({
        value: s.id,
        label: isArchived(s) ? `${s.season_name} (Arşiv)` : s.season_name,
        hint: league ? null : s.league_name ?? null,
      }));
  };
}

/** Takım seçici: değer takım kimliği; ilk 60 eşleşme. */
export function teamOptionsLoader(user: AuthUser | null | undefined, { exclude = [] as number[] } = {}) {
  return async (q: string): Promise<Option<number>[]> => {
    const list = await fetchScopedTeams(user);
    const skip = new Set(exclude.map(Number));
    return list
      .filter((t) => !skip.has(Number(t.id)))
      .filter((t) => matches(`${t.team_name} ${t.id}`, q))
      .sort((a, b) => a.team_name.localeCompare(b.team_name, "tr"))
      .slice(0, 60)
      .map((t) => ({ value: t.id, label: t.team_name, hint: [t.city, t.current_league].filter(Boolean).join(" · ") || null }));
  };
}

export interface PlayerLookupItem {
  id: number;
  player_name: string;
  player_img?: string | null;
  team_id?: number | null;
  team_name?: string | null;
  player_position?: string | null;
  city?: string | null;
}

/** Oyuncu araması — GET /api/players/admin-list?q (sunucuda sayfalı). */
export async function searchPlayers(user: AuthUser | null | undefined, q: string, pageSize = 25) {
  const scopeCity = isNationwide(user) ? undefined : user?.city ?? undefined;
  const data = await get<{ items?: PlayerLookupItem[] }>("/api/players/admin-list", {
    q: q.trim() || undefined,
    page: 1,
    pageSize,
    sort: q.trim() ? "name" : "recent",
    scopeCity,
  });
  return data.items ?? [];
}

/** Oyuncu seçici: değer oyuncu kimliği; en az 2 harfle aranır. */
export function playerOptionsLoader(user: AuthUser | null | undefined, { exclude = [] as number[] } = {}) {
  return async (q: string): Promise<Option<number>[]> => {
    if (q.trim().length < 2) return [];
    const skip = new Set(exclude.map(Number));
    const items = await searchPlayers(user, q);
    return items
      .filter((p) => !skip.has(Number(p.id)))
      .map((p) => ({
        value: p.id,
        label: p.player_name,
        hint: [p.team_name || "Serbest", p.player_position, `#${p.id}`].filter(Boolean).join(" · "),
      }));
  };
}
