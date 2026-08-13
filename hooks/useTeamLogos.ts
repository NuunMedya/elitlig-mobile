import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getTeamsByCity } from "@/lib/api/teams";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiTeam } from "@/lib/types";

/**
 * Maç kayıtlarında logo yoktur; yalnızca takım adı ve (yeni kayıtlarda) id
 * bulunur. Eski maçlarda `home_team_id` boş olduğundan ada göre de eşleşmek
 * gerekir — web sitesi de aynı iki yollu eşleştirmeyi yapar.
 */
export function useTeamLogos() {
  const { cityLabel } = useScope();

  const { data } = useQuery({
    queryKey: queryKeys.teamsByCity(cityLabel || undefined),
    queryFn: () => getTeamsByCity(cityLabel),
    enabled: Boolean(cityLabel),
    staleTime: 10 * 60_000,
  });

  return useMemo(() => {
    const byId = new Map<number, ApiTeam>();
    const byName = new Map<string, ApiTeam>();

    (data ?? []).forEach((team) => {
      if (team?.id != null) byId.set(Number(team.id), team);
      if (team?.team_name) byName.set(team.team_name.trim().toLocaleLowerCase("tr-TR"), team);
    });

    const resolve = (teamId?: number | null, teamName?: string | null): ApiTeam | null => {
      if (teamId != null) {
        const found = byId.get(Number(teamId));
        if (found) return found;
      }
      if (teamName) {
        return byName.get(teamName.trim().toLocaleLowerCase("tr-TR")) ?? null;
      }
      return null;
    };

    return {
      resolve,
      logoFor: (teamId?: number | null, teamName?: string | null) =>
        resolve(teamId, teamName)?.logo ?? null,
      /** Maç kaydındaki ada karşılık gelen takım id'si — detay sayfasına geçiş için. */
      idFor: (teamId?: number | null, teamName?: string | null) =>
        resolve(teamId, teamName)?.id ?? (teamId ?? null),
    };
  }, [data]);
}
