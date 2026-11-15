import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { loadMirror, saveMirror } from "@/lib/offline/mirror";
import { isOfflineError, noteOnline, noteRequestError } from "@/lib/offline/net";
import { useAuth } from "@/providers/AuthProvider";

import { getPuzzleMe, puzzleKeys, type PuzzleGameProgress, type PuzzleMe, type PuzzleProfile } from "./api";
import type { PuzzleGameKey } from "./types";

/**
 * Lig Yolu cüzdanı ve ilerlemesi — tek sorgu (["puzzle","me"]); her mutasyon
 * sunucunun döndürdüğü güncel profili önbelleğe yazar (yeniden çekme yok).
 *
 * ÇEVRİMDIŞI (sözleşme §7): her yeni veri hesap başına cihaz aynasına yazılır;
 * sunucuya ulaşılamazsa (yalnız ağ hatası) ayna döner — canlara geçen süre
 * yerelde işlenmiş olarak.
 */
export function usePuzzleMe() {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const query = useQuery({
    queryKey: puzzleKeys.me(),
    queryFn: async () => {
      try {
        const me = await getPuzzleMe();
        noteOnline();
        return me;
      } catch (error) {
        noteRequestError(error);
        if (userId != null && isOfflineError(error)) {
          const mirror = await loadMirror(userId);
          if (mirror) return mirror;
        }
        throw error;
      }
    },
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });
  const data = query.data;
  useEffect(() => {
    if (data && userId != null) saveMirror(userId, data);
  }, [data, userId]);
  return query;
}

/** Sunucudan dönen profili (ve varsa oyun ilerlemesini) önbelleğe yazar. */
export function usePuzzleCache() {
  const queryClient = useQueryClient();
  return useCallback(
    (profile: PuzzleProfile, game?: PuzzleGameProgress) => {
      queryClient.setQueryData<PuzzleMe>(puzzleKeys.me(), (current) => {
        if (!current) return current;
        return {
          ...current,
          profile,
          games: game ? { ...current.games, [game.game]: game } : current.games,
        };
      });
    },
    [queryClient]
  );
}

/**
 * Can geri sayımı — sunucunun `next_life_at` anından saniye saniye. Süre
 * dolunca can istemcide de bir artar (sunucu zaten aynı hesabı yapar); tam
 * doğruluk için süre dolunca profil arkada yeniden çekilir.
 */
export function useLifeCountdown(profile: PuzzleProfile | undefined): { lives: number; label: string | null } {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const nextAt = profile?.next_life_at ? new Date(profile.next_life_at).getTime() : null;

  useEffect(() => {
    if (!nextAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nextAt]);

  useEffect(() => {
    if (nextAt && now >= nextAt) void queryClient.invalidateQueries({ queryKey: puzzleKeys.me() });
  }, [nextAt, now, queryClient]);

  if (!profile) return { lives: 0, label: null };
  if (!nextAt || profile.lives >= profile.max_lives) return { lives: profile.lives, label: profile.lives >= profile.max_lives ? "Dolu" : null };
  const left = Math.max(0, nextAt - now);
  const min = Math.floor(left / 60000);
  const sec = Math.floor((left % 60000) / 1000);
  return { lives: profile.lives, label: `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}` };
}

/** Oynanabilir (sıradaki) seviye. */
export const nextLevelOf = (progress: PuzzleGameProgress | undefined) => (progress?.level ?? 0) + 1;

export type { PuzzleGameKey };
