import { patch } from "../../http";
import type { TeamDetailsResponse } from "../profile";

/**
 * TAKIM SAYFASI — kaptan ve ana sayfa görünümü.
 * PATCH /api/panel/me/team/details (services/teamDetailsService.js).
 *
 * `lib/api/profile.ts` sarmalayıcısı yalnız metin alanlarını (tarihçe, slogan,
 * başarılar, sosyal, gol müziği) taşıyor; web TeamDetails ekranındaki kaptan
 * seçimi ve ana sayfa anahtarları mobilde yoktu. Sunucu aynı uçta iki alanı da
 * kabul eder: `captain_player_id` takımın oyuncusu olmalı (400), `homepage`
 * yalnız HOMEPAGE_KEYS anahtarlarını okur.
 */

export const HOMEPAGE_KEYS = [
  { key: "show_history", label: "Tarihçe" },
  { key: "show_achievements", label: "Başarılar" },
  { key: "show_social", label: "Sosyal medya" },
  { key: "show_captain", label: "Kaptan" },
  { key: "show_sponsors", label: "Sponsorlar" },
  { key: "show_goal_music", label: "Gol müziği" },
] as const;

export type HomepageKey = (typeof HOMEPAGE_KEYS)[number]["key"];

export const updateTeamCaptain = (playerId: number | null) =>
  patch<{ message: string } & TeamDetailsResponse>("/api/panel/me/team/details", { captain_player_id: playerId });

export const updateTeamHomepage = (homepage: Partial<Record<HomepageKey, boolean>>) =>
  patch<{ message: string } & TeamDetailsResponse>("/api/panel/me/team/details", { homepage });
