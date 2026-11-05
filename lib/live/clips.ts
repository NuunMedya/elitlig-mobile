import { del, get, patch, post } from "../http";

/**
 * GOL KLİPLERİ — canlı yayında gol girildiği an telefonda kaydedilen son
 * ~10 saniyenin MP4'ü.
 *
 *   POST   /api/admin/live-streams/matches/:id/clips  (matches.live) klip yükle
 *   PATCH  /api/admin/live-streams/clips/:clipId      golcüyü düzelt / gizle
 *   DELETE /api/admin/live-streams/clips/:clipId      klibi sil
 *   GET    /api/goal-clips?player_id= | ?match_id=    herkese açık liste
 *
 * Klip, golü kaydeden olayın kimliğine (event_id) bağlanır; sunucu golcüyü
 * olaydan okur. Gol olayı silinirse klip gizlenir, golcü değişirse klip de
 * yeni oyuncuya geçer — istemci ayrıca bir şey yapmaz.
 */

export interface GoalClip {
  id: number;
  match_id: number;
  event_id: number | null;
  player_id: number | null;
  team_id: number | null;
  minute: number | null;
  period: number | null;
  olay_kodu: string | null;
  own_goal?: boolean;
  url: string;
  duration_ms: number | null;
  width?: number | null;
  height?: number | null;
  created_at?: string | null;
  match?: {
    id: number;
    date: string | null;
    home_team_name: string | null;
    away_team_name: string | null;
    home_team_score: number | null;
    away_team_score: number | null;
  } | null;
}

export interface ClipFile {
  uri: string;
  durationMs: number;
  width: number;
  height: number;
}

export function uploadGoalClip(matchId: number, eventId: number, clip: ClipFile) {
  const form = new FormData();
  // RN fetch dosya nesnesini { uri, name, type } üçlüsüyle tanır.
  form.append("file", { uri: clip.uri, name: `gol-${matchId}-${eventId}.mp4`, type: "video/mp4" } as unknown as Blob);
  form.append("event_id", String(eventId));
  form.append("duration_ms", String(Math.round(clip.durationMs)));
  form.append("width", String(clip.width));
  form.append("height", String(clip.height));
  return post<GoalClip>(`/api/admin/live-streams/matches/${matchId}/clips`, form, { timeout: 180_000 });
}

export const updateGoalClip = (clipId: number, body: { player_id?: number | null; hidden?: boolean }) =>
  patch<GoalClip>(`/api/admin/live-streams/clips/${clipId}`, body);

export const deleteGoalClip = (clipId: number) => del<{ message?: string }>(`/api/admin/live-streams/clips/${clipId}`);

/** Herkese açık liste; uç yoksa / hata verirse boş liste (ekranlar sessizce geçer). */
export async function listGoalClips(query: { player_id?: number; match_id?: number }): Promise<GoalClip[]> {
  try {
    const res = await get<{ items?: GoalClip[] }>("/api/goal-clips", query, { retry: false });
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

/** "12' Gol" / "12' Kendi kalesine" */
export function clipLabel(clip: Pick<GoalClip, "minute" | "olay_kodu" | "own_goal">): string {
  const own = clip.own_goal || String(clip.olay_kodu ?? "").toUpperCase() === "GOAL_OWN";
  const minute = clip.minute != null ? `${clip.minute}' ` : "";
  return `${minute}${own ? "Kendi kalesine" : "Gol"}`;
}
