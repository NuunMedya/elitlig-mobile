import { get } from "../http";
import type { NewsFeedResponse, NewsItem, Scope } from "../types";

/**
 * Haber uçları — routes/news.js
 *
 * `/feed` editör haberlerini, tamamlanan transferleri ve disiplin kararlarını
 * tek akışta birleştirir; mobil ana haber sekmesi bunu kullanır.
 */

export const getNewsFeed = (scope?: Partial<Pick<Scope, "cityId" | "leagueId" | "seasonId">>) =>
  get<NewsFeedResponse>("/api/news/feed", {
    cityId: scope?.cityId,
    leagueId: scope?.leagueId,
    seasonId: scope?.seasonId,
    limit: 40,
  });

export const getNews = (publicId: string) =>
  get<{ item: NewsItem }>(`/api/news/${encodeURIComponent(publicId)}`).then((data) => data.item);
