/**
 * OYUN KADROSU — Arena oyunlarının gerçek lig içeriği (Penaltı, Slalom).
 *
 * Kadroyu sunucudan alır, oyuncunun seçimini cihazda hatırlar, giriş kartı
 * için kurulum düğümünü (RosterSetup) ve oyuna gönderilecek kadroyu üretir:
 *   Penaltı  { shooter, keepers, takers }   (bkz. games/penalti.js; takers: rakip
 *            kulüplerin atıcıları — ligin golcü listesinin tamamı)
 *   Slalom   { runner, defenses }   (bkz. games/slalom.js)
 *   Sektir   { juggler, rivals }    (bkz. games/sektir.js; Slalom listesinden:
 *            rakipler oyuncuların sezon gol + asist sayısı, artan sırada)
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
  sektir: "elitlig.sektir.juggler.v1",
};

/** Sektir rakipleri: gol + asist değerleri artan, eşit aralıklı en çok 12 oyuncu. */
const RIVALS = 12;

export function useGameRoster(game: WebGameKey, cityId: number | null, playerId: number | null): GameRoster {
  const supported = game === "penalti" || game === "slalom" || game === "sektir";
  const query = useQuery({
    // Sektir, Slalom'un oyuncu listesini kullanır (aynı önbellek anahtarı).
    queryKey: ["arena", game === "sektir" ? "slalom" : game, "roster", cityId ?? 0, playerId ?? 0],
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
        roster: shooter ? { shooter, keepers, takers: people.filter((p) => p.id !== shooter.id) } : null,
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
            ladderTitle={`Rakip kulüpler · ${keepers.length} maç`}
            ladder={keepers.map((k) => ({ id: k.id, name: k.name, image: k.image, color: k.team.kit.primary }))}
            finalText={final ? `Final: ${final.short} · ${final.stats.saves} kurtarış${final.team.name ? ` · ${final.team.name}` : ""}` : null}
          />
        ),
      };
    }

    if (game === "sektir") {
      const data = query.data as Awaited<ReturnType<typeof getSlalomRoster>> | undefined;
      const people = data?.runners ?? [];
      const juggler = people.find((p) => p.id === selectedId) ?? people.find((p) => p.mine) ?? people[0];
      const pool = people
        .filter((p) => p.id !== juggler?.id && p.stats.goals + p.stats.assists > 0)
        .map((p) => ({ id: p.id, short: p.short, name: p.name, image: p.image, team: p.team, value: p.stats.goals + p.stats.assists }))
        .sort((a, b) => a.value - b.value);
      const rivals =
        pool.length <= RIVALS ? pool : Array.from({ length: RIVALS }, (_, i) => pool[Math.round((i * (pool.length - 1)) / (RIVALS - 1))]);
      const final = rivals[rivals.length - 1];
      return {
        roster: juggler ? { juggler, rivals } : null,
        changeLabel: juggler ? "Oyuncu değiştir" : null,
        setup: (
          <RosterSetup
            loading={loading}
            people={people}
            scope={data?.scope}
            selectedId={juggler?.id ?? null}
            onSelect={choose}
            title="Topu kim sektirecek?"
            loadingText="Ligin oyuncuları yükleniyor…"
            emptyText="Gerçek kadro şu an yüklenemedi; ElitLig oyuncusuyla oynayabilirsin."
            attrs={[
              { key: "control", label: "Kontrol" },
              { key: "agility", label: "Denge" },
            ]}
            chipMeta={(p) => `${p.stats.goals}G ${p.stats.assists}A`}
            detailMeta={(p) => [p.team.name, `${p.stats.goals} gol`, `${p.stats.assists} asist`].filter(Boolean).join(" · ")}
            ladderTitle={`Geçeceğin oyuncular · sekme = gol + asist`}
            ladder={rivals.map((r) => ({ id: r.id, name: r.name, image: r.image, color: r.team.kit.primary }))}
            finalText={final ? `Final: ${final.short} · ${final.value} gol + asist` : null}
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
