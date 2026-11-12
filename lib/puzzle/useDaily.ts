import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/providers/AuthProvider";

import { claimDaily, cityKeys, getCity, puzzleKeys, type CityResponse, type DailyClaimResponse, type DailyStatus, type PuzzleMe } from "./api";
import { dailyView } from "./daily";
import { usePuzzleMe } from "./usePuzzle";
import type { PuzzleGameKey } from "./types";

/**
 * Günlük ödül durumu: önce /me (profile.daily), yoksa /city (daily). İkisi
 * de aynı nesnedir; hangi ekran açıksa onun önbelleği kullanılır.
 */
export function useDailyStatus() {
  const auth = useAuth();
  const me = usePuzzleMe();
  const city = useQuery({ queryKey: cityKeys.me(), queryFn: getCity, enabled: Boolean(auth.user), staleTime: 60_000, retry: false });
  const raw: DailyStatus | undefined = me.data?.profile.daily ?? city.data?.daily;
  const view = useMemo(() => dailyView(raw), [raw]);
  return { raw, view, loading: !raw && (me.isLoading || city.isLoading) };
}

/** Yeni günlük durumunu iki önbelleğe de yazar. */
export function useDailyCache() {
  const queryClient = useQueryClient();
  return useCallback(
    (daily: DailyStatus | undefined, profile?: PuzzleMe["profile"]) => {
      queryClient.setQueryData<PuzzleMe>(puzzleKeys.me(), (current) =>
        current ? { ...current, profile: { ...(profile ?? current.profile), daily: daily ?? profile?.daily ?? current.profile.daily } } : current,
      );
      if (daily) queryClient.setQueryData<CityResponse>(cityKeys.me(), (current) => (current ? { ...current, daily } : current));
    },
    [queryClient],
  );
}

/**
 * Günlük ödülü al. Başarıda profil ve günlük durum önbelleğe yazılır; yıldız
 * şehre eklendiği için Kulüp Şehri ve sıralamalar yeniden çekilir.
 */
export function useClaimDaily() {
  const queryClient = useQueryClient();
  const write = useDailyCache();
  return useMutation({
    mutationFn: (body: { joker?: string; game?: PuzzleGameKey }) => claimDaily(body),
    onSuccess: (res: DailyClaimResponse) => {
      write(res.daily ?? res.profile.daily, res.profile);
      void queryClient.invalidateQueries({ queryKey: cityKeys.me() });
    },
  });
}

/** Dakikada bir tıklayan "şimdi" — geri sayım metinleri için. */
export function useMinuteNow(enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
