/**
 * OYUN KADROSU — Arena oyunlarının gerçek lig içeriği (Penaltı, Slalom).
 *
 * Kadroyu sunucudan alır, oyuncunun seçimini cihazda hatırlar, giriş kartı
 * için kurulum düğümünü (RosterSetup) ve oyuna gönderilecek kadroyu üretir:
 *   Penaltı  { shooter, keepers }   (bkz. games/penalti.js)
 *   Slalom   { runner, defenses }   (bkz. games/slalom.js)
 * Kadro gelmezse oyun kendi varsayılan kadrosuyla oynanır (roster null).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { RosterSetup } from "@/components/game/RosterSetup";
import { getPenaltyRoster, getSlalomRoster } from "@/lib/api/arena";
import type { WebGameKey } from "@/lib/game/web/games.generated";

export interface GameRoster {
  /** Oyuna {type:"config", roster} ile giden kadro; yoksa null. */
  roster: Record<string, unknown> | null;
  /** Giriş kartındaki seçim arayüzü; bu oyunda kadro yoksa null. */
  setup: ReactNode;
  /** Bitiş kartındaki "… değiştir" düğmesi etiketi. */
  changeLabel: string | null;
}

const KEYS: Partial<Record<WebGameKey, string>> = {
  penalti: "elitlig.penalti.shooter.v1",
  slalom: "elitlig.slalom.runner.v1",
};

export function useGameRoster(game: WebGameKey, cityId: number | null, playerId: number | null): GameRoster {
  const supported = game === "penalti" || game === "slalom";
  const query = useQuery({
    queryKey: ["arena", game, "roster", cityId ?? 0, playerId ?? 0],
    queryFn: (): Promise<unknown> => (game === "penalti" ? getPenaltyRoster(cityId) : getSlalomRoster(cityId)),
    enabled: supported,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    const key = KEYS[game];
    if (!key) return;
    AsyncStorage.getItem(key).then((value) => {
      if (value) setSelectedId((current) => current ?? Number(value));
    });
  }, [game]);
  const choose = useCallback(
    (id: number) => {
      setSelectedId(id);
      const key = KEYS[game];
      if (key) void AsyncStorage.setItem(key, String(id));
    },
    [game],
  );

  return useMemo<GameRoster>(() => {
    if (!supported) return { roster: null, setup: null, changeLabel: null };
    const loading = query.isLoading;

    if (game === "penalti") {
      const data = query.data as Awaited<ReturnType<typeof getPenaltyRoster>> | undefined;
      const people = data?.shooters ?? [];
      const shooter = people.find((p) => p.id === selectedId) ?? people.find((p) => p.mine) ?? people[0];
      const keepers = data?.keepers ?? [];
      const final = keepers[keepers.length - 1];
      return {
        roster: shooter ? { shooter, keepers } : null,
        changeLabel: shooter ? "Atıcı değiştir" : null,
        setup: (
          <RosterSetup
            loading={loading}
            people={people}
            scope={data?.scope}
            selectedId={shooter?.id ?? null}
            onSelect={choose}
            title="Atıcını seç"
            loadingText="Ligin golcüleri yükleniyor…"
            emptyText="Gerçek kadro şu an yüklenemedi; ElitLig atıcısıyla oynayabilirsin."
            attrs={[
              { key: "power", label: "Şut" },
              { key: "accuracy", label: "İsabet" },
              { key: "curve", label: "Falso" },
            ]}
            chipMeta={(p) => `${p.stats.goals} gol`}
            detailMeta={(p) =>
              [p.team.name, `${p.stats.goals} gol`, p.stats.penalty_goals ? `${p.stats.penalty_goals} penaltı golü` : null].filter(Boolean).join(" · ")
            }
            ladderTitle={`Kaleci merdiveni · ${keepers.length} kaleci`}
            ladder={keepers.map((k) => ({ id: k.id, name: k.name, image: k.image, color: k.team.kit.primary }))}
            finalText={final ? `Final: ${final.short} · ${final.stats.saves} kurtarış${final.team.name ? ` · ${final.team.name}` : ""}` : null}
          />
        ),
      };
    }

    const data = query.data as Awaited<ReturnType<typeof getSlalomRoster>> | undefined;
    const people = data?.runners ?? [];
    const runner = people.find((p) => p.id === selectedId) ?? people.find((p) => p.mine) ?? people[0];
    const defenses = data?.defenses ?? [];
    const final = defenses[defenses.length - 1];
    return {
      roster: runner ? { runner, defenses } : null,
      changeLabel: runner ? "Oyuncu değiştir" : null,
      setup: (
        <RosterSetup
          loading={loading}
          people={people}
          scope={data?.scope}
          selectedId={runner?.id ?? null}
          onSelect={choose}
          title="Topu kim sürecek?"
          loadingText="Ligin oyuncuları yükleniyor…"
          emptyText="Gerçek kadro şu an yüklenemedi; ElitLig oyuncusuyla oynayabilirsin."
          attrs={[
            { key: "agility", label: "Çeviklik" },
            { key: "control", label: "Kontrol" },
            { key: "pace", label: "Hız" },
          ]}
          chipMeta={(p) => `${p.stats.goals}G ${p.stats.assists}A`}
          detailMeta={(p) => [p.team.name, `${p.stats.goals} gol`, `${p.stats.assists} asist`].filter(Boolean).join(" · ")}
          ladderTitle={`Rakip savunmalar · ${defenses.length} takım`}
          ladder={defenses.map((d) => ({ id: d.team.id, name: d.team.name ?? "Takım", color: d.team.kit.primary }))}
          finalText={final ? `Final: ${final.team.name ?? "Takım"} · maç başı ${final.conceded_per_match} gol yiyor` : null}
        />
      ),
    };
  }, [supported, game, query.isLoading, query.data, selectedId, choose]);
}
