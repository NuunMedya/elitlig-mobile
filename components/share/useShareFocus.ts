/**
 * "Benim takımım / ben" — sıralama paylaşımlarının odağı.
 *
 * Öncelik: yönettiği takım (`managed_team_id`) → oyuncu hesabının takımı
 * (bağlı oyuncu kaydının `team_id`'si) → takip ettiği takımlar (favori
 * sırasıyla). Liste hangisini içeriyorsa ilk o seçilir; hiçbiri yoksa
 * çağıran aralık sorar.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getPlayer } from "@/lib/api/players";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";

export interface ShareFocus {
  /** Aday takım kimlikleri, öncelik sırasıyla. */
  teamIds: number[];
  /** Oturumdaki oyuncu kaydı. */
  playerId: number | null;
}

export function useShareFocus(enabled = true): ShareFocus {
  const { user } = useAuth();
  const { favorites } = useFavorite();
  const playerId = Number(user?.player_id) || null;

  const playerQuery = useQuery({
    queryKey: queryKeys.player(playerId ?? 0),
    queryFn: () => getPlayer(playerId as number),
    enabled: enabled && playerId != null,
    staleTime: 10 * 60_000,
  });

  return useMemo(() => {
    const ids = [Number(user?.managed_team_id) || null, Number(playerQuery.data?.team_id) || null, ...favorites.map((team) => Number(team.id) || null)];
    const teamIds = ids.filter((id, index): id is number => id != null && ids.indexOf(id) === index);
    return { teamIds, playerId };
  }, [favorites, playerId, playerQuery.data?.team_id, user?.managed_team_id]);
}

/** Aday listesinden, verilen kümede bulunan ilk takım. */
export function pickFocusTeam(focus: ShareFocus, present: (teamId: number) => boolean): number | null {
  return focus.teamIds.find(present) ?? null;
}
