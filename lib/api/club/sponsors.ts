import { del, get, post, put } from "../../http";

/**
 * TAKIM SPONSORLARI — routes/panel.js /me/sponsors (scope=team).
 *
 *   GET    /api/panel/me/sponsors?scope=team             3 alan (dolu/boş) + premium
 *   PUT    /api/panel/me/sponsors/:index?scope=team      ad, konum, bağlantı (ONAYLI)
 *   POST   /api/panel/me/sponsors/:index/image?scope=team  görsel (multipart "image")
 *   DELETE /api/panel/me/sponsors/:index?scope=team      kaldırma isteği (ONAYLI)
 *
 * Yazma uçları premium ister (402 PREMIUM_REQUIRED) ve değişikliği hemen
 * yayınlamaz: sunucu `sponsor_update` değişiklik talebi açar (202).
 */

export interface SponsorSlot {
  slot_index: number;
  sponsor_name: string | null;
  placement: string | null;
  image_url: string | null;
  link_url: string | null;
  active: boolean;
}

export interface SponsorsResponse {
  scope: "team" | "player";
  sponsors: SponsorSlot[];
  slotCount: number;
  isPremium: boolean;
}

/** routes/panel.js SPONSOR_PLACEMENTS — web constants/membership.js etiketleri. */
export const SPONSOR_PLACEMENTS: { key: string; label: string }[] = [
  { key: "header", label: "Sayfa üstü" },
  { key: "hero", label: "Profil kartı" },
  { key: "sidebar", label: "Yan panel" },
  { key: "footer", label: "Sayfa altı" },
  { key: "jersey", label: "Forma sponsoru" },
];

export const getTeamSponsors = () => get<SponsorsResponse>("/api/panel/me/sponsors", { scope: "team" });

export const saveTeamSponsor = (index: number, body: { sponsor_name: string | null; placement: string | null; link_url: string | null; active: boolean }) =>
  put<{ message: string }>(`/api/panel/me/sponsors/${index}?scope=team`, body);

export function uploadTeamSponsorImage(index: number, file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  // RN fetch dosya nesnesini { uri, name, type } üçlüsüyle tanır.
  form.append("image", file as unknown as Blob);
  return post<{ message: string }>(`/api/panel/me/sponsors/${index}/image?scope=team`, form, { timeout: 120_000 });
}

export const clearTeamSponsor = (index: number) => del<{ message: string }>(`/api/panel/me/sponsors/${index}?scope=team`);
