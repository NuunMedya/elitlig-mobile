import { get } from "../http";

/**
 * STÜDYO VERİ UÇLARI
 *
 *   GET /api/admin/live-streams/matches   (matches.live) il kapsamlı maç listesi —
 *       masaüstü Yayın Stüdyosu'nun "Maç yönetimi" listesiyle aynı uç. Kapsam
 *       sunucuda uygulanır: il kullanıcısı yalnız kendi ilinin maçlarını görür.
 *       `match_video` doluysa maçın yayın / kayıt bağlantısı vardır.
 *   GET /api/maclar/:id/broadcast-state   (matches.live) maçta kullanılabilecek
 *       sponsorlar + web / masaüstü rejide yazılmış altyazı satırları.
 */

export interface StudioMatch {
  id: number;
  first_team_name: string | null;
  second_team_name: string | null;
  first_team_score: number | null;
  second_team_score: number | null;
  date: string | null;
  time: string | null;
  match_field: string | null;
  league_name: string | null;
  match_season: string | null;
  city: string | null;
  city_id: number | null;
  league_id: number | null;
  season_id: number | null;
  home_team_id: number | null;
  away_team_id: number | null;
  mac_durumu: string | null;
  match_video: string | null;
}

export interface StudioMatchList {
  items: StudioMatch[];
  scope: { nationwide: boolean; city_id: number | null; city: string | null } | null;
}

export async function listStudioMatches(query: { date_from?: string; date_to?: string; limit?: number; city_id?: number | null } = {}): Promise<StudioMatchList> {
  const res = await get<Partial<StudioMatchList>>("/api/admin/live-streams/matches", {
    date_from: query.date_from,
    date_to: query.date_to,
    limit: query.limit ?? 300,
    city_id: query.city_id ?? undefined,
  });
  return { items: Array.isArray(res?.items) ? res.items : [], scope: res?.scope ?? null };
}

export interface BroadcastSponsor {
  id: number;
  name: string;
  tagline: string;
  brandColor: string;
  displaySeconds: number;
  /** Görsel yuvası → adres (logo, corner, lower_third…). */
  images: Record<string, string>;
  placements: string[];
}

export interface BroadcastDesk {
  sponsors: BroadcastSponsor[];
  /** Web / masaüstü rejide elle yazılmış altyazı satırları. */
  headlines: { tag: string; text: string }[];
}

const EMPTY_DESK: BroadcastDesk = { sponsors: [], headlines: [] };

function imageMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
    else if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string") out[k] = String((v as { url: string }).url).trim();
  }
  return out;
}

/** Sponsorun yayında kullanılacak logosu: köşe rozeti yoksa logo. */
export const sponsorLogo = (s: BroadcastSponsor | null | undefined): string | null => s?.images.corner || s?.images.logo || null;

/** Uç yoksa / yetki yoksa / hata verirse boş masa (stüdyo sponsorsuz çalışır). */
export async function getBroadcastDesk(matchId: number): Promise<BroadcastDesk> {
  try {
    const res = await get<{ sponsors?: unknown; state?: { subtitle?: { customHeadlines?: unknown } } }>(
      `/api/maclar/${encodeURIComponent(String(matchId))}/broadcast-state`,
      undefined,
      { retry: false }
    );
    const sponsors: BroadcastSponsor[] = (Array.isArray(res?.sponsors) ? res.sponsors : [])
      .map((raw): BroadcastSponsor | null => {
        const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
        const id = Number(s.id);
        const name = String(s.name ?? "").trim();
        if (!id || !name) return null;
        return {
          id,
          name,
          tagline: String(s.tagline ?? "").trim(),
          brandColor: String(s.brandColor ?? "").trim(),
          displaySeconds: Number(s.displaySeconds) || 0,
          images: imageMap(s.images),
          placements: Array.isArray(s.placements) ? s.placements.map(String) : [],
        };
      })
      .filter((s): s is BroadcastSponsor => s != null);
    const rawLines = res?.state?.subtitle?.customHeadlines;
    const headlines = (Array.isArray(rawLines) ? rawLines : [])
      .map((l) => {
        const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
        return { tag: String(o.tag ?? "").trim(), text: String(o.text ?? "").trim() };
      })
      .filter((l) => l.text)
      .slice(0, 20);
    return { sponsors, headlines };
  } catch {
    return EMPTY_DESK;
  }
}
