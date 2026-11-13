/**
 * OYUN KADROSU — Arena oyunlarının gerçek lig içeriği (Penaltı, Slalom).
 *
 * Kadroyu sunucudan alır, oyuncunun seçimini hesabın oyun kaydında hatırlar, giriş kartı
 * için kurulum düğümünü (RosterSetup) ve oyuna gönderilecek kadroyu üretir:
 *   Penaltı  { shooter, keepers, takers }   (bkz. games/penalti.js; takers: rakip
 *            kulüplerin atıcıları — ligin golcü listesinin tamamı)
 *   Slalom   { runner, defenses }   (bkz. games/slalom.js)
 *   Sektir   { juggler, rivals }    (bkz. games/sektir.js; Slalom listesinden:
 *            rakipler oyuncuların sezon gol + asist sayısı, artan sırada)
 *   Savunma Hattı / Kadro Koşusu   { captain, rivals }   (bkz. games/savunma.js,
 *            games/kadro.js; Slalom listesinden: kaptanın kulübünün forması
 *            giyilir, her dalga/bölüm ligin bir takımına karşıdır)
 * Kadro gelmezse oyun kendi varsayılan kadrosuyla oynanır (roster null).
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, type ReactNode } from "react";

import { RosterSetup } from "@/components/game/RosterSetup";
import { getPenaltyRoster, getSlalomRoster } from "@/lib/api/arena";
import { useGameSave } from "@/lib/puzzle/saves";
import type { WebGameKey } from "@/lib/game/web/games.generated";

export interface GameRoster {
  /** Oyuna {type:"config", roster} ile giden kadro; yoksa null. */
  roster: Record<string, unknown> | null;
  /** Giriş kartındaki seçim arayüzü; bu oyunda kadro yoksa null. */
  setup: ReactNode;
  /** Bitiş kartındaki "… değiştir" düğmesi etiketi. */
  changeLabel: string | null;
}

/** Seçim hatırlanan oyunlar (hesaba bağlı oyun kaydı `roster`: { oyun: oyuncu id }). */
const PICKABLE = new Set<WebGameKey>(["penalti", "slalom", "sektir", "savunma", "kadro"]);

/** Slalom'un kadro ucunu (oyuncular + takım merdiveni) kullanan oyunlar. */
const SLALOM_FED = new Set<WebGameKey>(["slalom", "sektir", "savunma", "kadro"]);

/** Sektir rakipleri: gol + asist değerleri artan, eşit aralıklı en çok 12 oyuncu. */
const RIVALS = 12;

export function useGameRoster(game: WebGameKey, cityId: number | null, playerId: number | null): GameRoster {
  const supported = game === "penalti" || SLALOM_FED.has(game);
  const query = useQuery({
    // Sektir, Slalom'un oyuncu listesini kullanır (aynı önbellek anahtarı).
    queryKey: ["arena", SLALOM_FED.has(game) ? "slalom" : game, "roster", cityId ?? 0, playerId ?? 0],
    queryFn: (): Promise<unknown> => (game === "penalti" ? getPenaltyRoster(cityId) : getSlalomRoster(cityId)),
    enabled: supported,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  // Seçilen oyuncu hesaba bağlıdır (lib/puzzle/saves): başka telefonda da aynı.
  const picks = useGameSave("roster");
  const selectedId = PICKABLE.has(game) ? (picks.data?.[game] ?? null) : null;
  const updatePicks = picks.update;
  const choose = useCallback(
    (id: number) => {
      // Kayıt oyun oyun birleşir: yalnız bu oyunun seçimi yazılır.
      if (PICKABLE.has(game)) updatePicks({ [game]: id });
    },
    [game, updatePicks],
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

    if (game === "savunma" || game === "kadro") {
      const data = query.data as Awaited<ReturnType<typeof getSlalomRoster>> | undefined;
      const people = data?.runners ?? [];
      const captain = people.find((p) => p.id === selectedId) ?? people.find((p) => p.mine) ?? people[0];
      // Kendi kulübünle karşılaşma: kaptanın takımı rakip listesinden çıkar.
      const rivals = (data?.defenses ?? []).filter((d) => d.team.id !== captain?.team.id);
      const final = rivals[rivals.length - 1];
      const waves = game === "savunma";
      return {
        roster: captain ? { captain, rivals } : null,
        changeLabel: captain ? "Kaptan değiştir" : null,
        setup: (
          <RosterSetup
            loading={loading}
            people={people}
            scope={data?.scope}
            selectedId={captain?.id ?? null}
            onSelect={choose}
            title={waves ? "Kaptanını seç · takımın onun formasını giyer" : "Kaptanını seç · kadron onun formasını giyer"}
            loadingText="Ligin oyuncuları yükleniyor…"
            emptyText="Gerçek kadro şu an yüklenemedi; ElitLig formasıyla oynayabilirsin."
            attrs={[]}
            chipMeta={(p) => `${p.stats.goals}G ${p.stats.assists}A`}
            detailMeta={(p) => [p.team.name, `${p.stats.goals} gol`, `${p.stats.assists} asist`].filter(Boolean).join(" · ")}
            ladderTitle={waves ? `Rakip takımlar · her dalga biri` : `Rakip takımlar · her bölüm biri`}
            ladder={rivals.map((d) => ({ id: d.team.id, name: d.team.name ?? "Takım", color: d.team.kit.primary }))}
            finalText={final ? `En zorlu rakip: ${final.team.name ?? "Takım"}` : null}
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
