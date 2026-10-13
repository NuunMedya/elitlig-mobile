/**
 * useFollowNews — takip edilenlerle ilgili haber / transfer / disiplin akışı.
 *
 * KAYNAK: `GET /api/news/feed` (lib/api/news.ts). Uç editör haberini,
 * tamamlanan transferleri ve disiplin kararlarını tek akışta birleştirir;
 * her kayıtta `kind` ("news" | "transfer" | "penalty"), `category_label` ve
 * kapsam alanları (`city_id`, `league_id`, `season_id`) vardır.
 *
 * SÜZGEÇ İSTEMCİDE: sunucu yalnız il/lig/sezon süzgeci destekler, TAKIM
 * süzgeci YOKTUR. Eşleşme sırası:
 *   · takım → transfer kaydının `meta.team_id`'si, disiplin kaydının
 *     `meta.team_name`'i; editör haberinde takım alanı yok, başlık / özet /
 *     içerikte takım adı geçiyor mu bakılır (Türkçe küçük harf).
 *   · lig / sezon / il → kaydın `league_id` / `season_id` / `city_id` alanı.
 *
 * NEREYE AÇILIR: transfer ve disiplin kayıtlarının tekil haber ucu yok
 * (`/api/news/<id>` 404). Transfer → oyuncu sayfası (`meta.player_id`),
 * disiplin → eşleşen takımın sayfası (yoksa açılmaz); haber → haber sayfası.
 * Çok kısa takım adları (2 harf ve altı) yanlış eşleşme üreteceği için ada
 * göre aranmaz.
 *
 * SORGULAR: genel akış + seçili il + takip edilen illerin akışları (uç 40
 * kayıtla sınırlı; il akışları kullanıcının yakın çevresini derinleştirir).
 * Kayıtlar `kind:id` ile tekilleştirilir, yayın tarihine göre sıralanır.
 */

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { getNewsFeed } from "@/lib/api/news";
import { queryKeys } from "@/lib/queryKeys";
import type { NewsItem } from "@/lib/types";
import type { FavoriteScope, FavoriteTeam } from "@/providers/FavoriteProvider";
import { normalizeName } from "./followMatches";

export interface FollowNewsItem {
  item: NewsItem;
  /** Neden bu akışta: eşleşen takımın / ligin adı. */
  reason: string;
  /** Dokununca açılacak rota; yoksa satır bilgi amaçlıdır. */
  href: string | null;
}

const MIN_NAME_LENGTH = 3;
const LIMIT = 12;

export function useFollowNews({
  teams,
  leagues,
  seasons,
  cities,
  scopeCityId,
}: {
  teams: FavoriteTeam[];
  leagues: FavoriteScope[];
  seasons: FavoriteScope[];
  cities: FavoriteScope[];
  scopeCityId: number | null;
}) {
  const hasFollows = teams.length + leagues.length + seasons.length + cities.length > 0;

  const cityIds = useMemo(() => {
    const ids = new Set<number>();
    if (scopeCityId) ids.add(scopeCityId);
    cities.forEach((city) => ids.add(city.id));
    return Array.from(ids);
  }, [cities, scopeCityId]);

  const queries = useQueries({
    queries: [
      {
        queryKey: queryKeys.newsFeed(),
        queryFn: () => getNewsFeed(),
        enabled: hasFollows,
        staleTime: 5 * 60_000,
      },
      ...cityIds.map((cityId) => ({
        queryKey: queryKeys.newsFeed({ cityId }),
        queryFn: () => getNewsFeed({ cityId }),
        enabled: hasFollows,
        staleTime: 5 * 60_000,
      })),
    ],
  });

  const items = useMemo<FollowNewsItem[]>(() => {
    if (!hasFollows) return [];
    const names = teams
      .map((team) => ({ team, key: normalizeName(team.name) }))
      .filter((entry) => entry.key.length >= MIN_NAME_LENGTH);
    const leagueById = new Map(leagues.map((league) => [league.id, league.name]));
    const seasonById = new Map(seasons.map((season) => [season.id, season.name]));
    const cityById = new Map(cities.map((city) => [city.id, city.name]));

    const seen = new Set<string>();
    const result: FollowNewsItem[] = [];

    queries.forEach((query) => {
      (query.data?.items ?? []).forEach((item) => {
        const key = `${item.kind}:${item.id}`;
        if (seen.has(key)) return;
        const metaTeamId = item.meta?.team_id != null ? Number(item.meta.team_id) : null;
        const metaTeamName = normalizeName(item.meta?.team_name);
        const haystack = normalizeName(`${item.title ?? ""} ${item.summary ?? ""} ${item.content ?? ""}`);
        const team =
          teams.find((entry) => metaTeamId != null && entry.id === metaTeamId) ??
          teams.find((entry) => metaTeamName !== "" && normalizeName(entry.name) === metaTeamName) ??
          (item.kind === "news" ? names.find((entry) => haystack.includes(entry.key))?.team : undefined);
        const reason =
          team?.name ??
          (item.league_id != null ? leagueById.get(Number(item.league_id)) : undefined) ??
          (item.season_id != null ? seasonById.get(Number(item.season_id)) : undefined) ??
          (item.city_id != null ? cityById.get(Number(item.city_id)) : undefined);
        if (!reason) return;
        seen.add(key);
        const href =
          item.kind === "transfer"
            ? item.meta?.player_id
              ? `/oyuncu/${item.meta.player_id}`
              : metaTeamId
                ? `/takim/${metaTeamId}`
                : null
            : item.kind === "penalty"
              ? team
                ? `/takim/${team.id}`
                : null
              : `/haber/${encodeURIComponent(item.id)}`;
        result.push({ item, reason, href });
      });
    });

    return result
      .sort((a, b) => String(b.item.published_at ?? "").localeCompare(String(a.item.published_at ?? "")))
      .slice(0, LIMIT);
  }, [cities, hasFollows, leagues, queries, seasons, teams]);

  const loading = hasFollows && queries.some((query) => query.isLoading);
  const error = queries.every((query) => query.isError) ? queries[0]?.error ?? null : null;

  return { items, loading, error, refetch: () => queries.forEach((query) => void query.refetch()) };
}
