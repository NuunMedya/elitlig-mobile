/**
 * Sonsuz kaydırmalı sıralama: 50'şer satırlık sayfalar (limit + offset).
 * Eski sunucu sayfa bilgisi döndürmezse ilk yanıt tek sayfa sayılır
 * (`nextPageOffset`), aynı satırlar iki kez gelmez.
 */

import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { mergePages, nextPageOffset, type PageMeta } from "@/lib/leaderboard";

export function useBoardPages<P extends PageMeta, R>({
  queryKey,
  enabled = true,
  fetchPage,
  rowsOf,
  keyOf,
}: {
  queryKey: QueryKey;
  enabled?: boolean;
  fetchPage: (offset: number) => Promise<P>;
  rowsOf: (page: P) => R[];
  keyOf: (row: R) => string | number;
}) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: P, _all: P[], lastParam: number) => nextPageOffset(last, lastParam, rowsOf(last).length),
    enabled,
    staleTime: 30_000,
  });

  const pages = query.data?.pages;
  const rows = useMemo(() => mergePages((pages ?? []).map(rowsOf), keyOf), [pages, rowsOf, keyOf]);
  const first = pages?.[0];

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return { query, rows, first, loadMore };
}
