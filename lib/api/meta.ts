import { get } from "../http";
import type { DefaultScope, MetaLeague, MetaOption, MetaSeason } from "../types";

/**
 * Kapsam uçları — routes/meta.js
 *
 * Sitenin tamamı şehir → lig → sezon üçlüsüyle çalışır; mobil de aynı sırayı
 * izler. Arşivlenmiş lig/sezonlar varsayılan olarak dönmez.
 */

export const getCities = () =>
  get<{ cities: MetaOption[] }>("/api/meta/cities").then((data) => data.cities ?? []);

export const getLeagues = (cityId: number) =>
  get<{ leagues: MetaLeague[] }>("/api/meta/leagues", { cityId }).then((data) => data.leagues ?? []);

export const getSeasons = (cityId: number, leagueId: number) =>
  get<{ seasons: MetaSeason[] }>("/api/meta/seasons", { cityId, leagueId }).then(
    (data) => data.seasons ?? []
  );

/** Şehir seçildiğinde ilk lig + sezonu sunucu belirler. */
export const getDefaultScope = (cityId: number) =>
  get<DefaultScope>("/api/meta/default-scope", { cityId });
