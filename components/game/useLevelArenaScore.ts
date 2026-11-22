import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";

import type { GameOverPayload } from "@/components/game/WebGame";
import { startArenaSession, submitArenaScore, type ArenaGame } from "@/lib/api/arena";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Lig Yolu bölüm modundaki arena oyunlarının (Penaltı, Savunma Hattı, Kadro
 * Koşusu) skorunu arena tablosuna da yazar.
 *
 * NEDEN: bu oyunların haftalık görevleri (weekBest_*, weekWins_*,
 * weekWonLevel_*, weekPerfect_*, weekMax_<oyun>_<alan>) ve /siralama tabloları
 * yalnız DOĞRULANMIŞ arena skorundan beslenir (sunucu services/career/compute.js,
 * services/arenaLeaderboard.js). Bölüm sonucu /api/puzzle/:game/finish'e gider
 * ve "puzzle" olayı yazar; arena tarafını hiç doldurmaz. Bu kanca bölüm
 * başlarken oyun oturumu açar (sunucu süreyle doğrular; bu üç oyunda oturum
 * can düşürmez — rules.ARENA_LIFE_GAMES) ve bitişte skoru istatistikleriyle
 * gönderir. Lig Yolu metrikleri (weekPuzzle*) ayrı olaylardan sayılır; çift
 * sayım olmaz.
 *
 * Sessizdir: misafirde, ağ hatasında ya da eski sunucuda hiçbir şey göstermez;
 * bölüm akışı bundan etkilenmez.
 */
export function useLevelArenaScore(game: Extract<ArenaGame, "penalti" | "savunma" | "kadro">) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const session = useRef<Promise<string | null> | null>(null);
  /* Ref: begin/submit kimlikleri sabit kalsın (oyun köprüsünün onReady/onOver geri çağrıları). */
  const signedIn = useRef(false);
  signedIn.current = Boolean(auth.user);

  /** Bölüm başladı: girişliyse oturum açılır (yalnız bir kez). */
  const begin = useCallback(() => {
    if (!signedIn.current || session.current) return;
    session.current = startArenaSession(game)
      .then((data) => data.sessionId ?? null)
      .catch(() => null);
  }, [game]);

  /** Bölüm bitti: skor + istatistik oturumla gider. Oturum tek kullanımlıktır. */
  const submit = useCallback(
    (payload: GameOverPayload) => {
      const pending = session.current;
      session.current = null;
      if (!signedIn.current || !pending) return;
      const score = Math.max(0, Math.round(Number(payload.score) || 0));
      pending
        .then((sessionId) => (sessionId ? submitArenaScore(game, score, sessionId, payload.stats) : null))
        .then((response) => {
          if (!response) return;
          void queryClient.invalidateQueries({ queryKey: ["arena"] });
          void queryClient.invalidateQueries({ queryKey: ["career"] });
          if (response.entry?.stars) void queryClient.invalidateQueries({ queryKey: ["puzzle"] });
        })
        .catch(() => undefined);
    },
    [game, queryClient],
  );

  return useMemo(() => ({ begin, submit }), [begin, submit]);
}
