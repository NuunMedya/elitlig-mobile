/**
 * Favori kapsamdaki CANLI maç sayısı — Favoriler sekmesinin rozeti (§1.2).
 *
 * sayı = favori takımın oynadığı + favori maç + favori lig/sezondaki canlı
 *        maçlar (tekilleştirilmiş)
 *
 * NEDEN GİRİŞSİZ DE ÇALIŞIR: favoriler cihazda saklanır (FavoriteProvider),
 * sunucu oturumu gerektirmez. Misafir kullanıcı da takımını yıldızlayıp canlı
 * rozetini görebilmeli.
 *
 * NEDEN KAPSAMDAN BAĞIMSIZ SORGU: kullanıcı Ankara 1. Lig'e bakarken favori
 * takımı başka ligde oynuyor olabilir; rozet seçili kapsamı değil FAVORİLERİ
 * temsil eder. Bu yüzden `/maclar/live` filtresiz çağrılır ve eşleştirme
 * istemcide yapılır — canlı maç sayısı zaten onlarla ölçülür, listeyi taramak
 * ucuzdur.
 *
 * NEDEN ARKA PLANDA DURUR: yoklama uygulama arka plandayken pil yakar ve
 * sonucu kimse görmez. AppState "active" değilken aralık kapanır, geri
 * dönüldüğünde ilk render'da yeniden başlar.
 *
 * TEK ZAMANLAYICI: aynı anahtarı (`liveFavoriteMatches`) Maçlar sekmesi de
 * okur. React Query her gözlemci için AYRI aralık kurar; iki ekran iki ayrı
 * zamanlayıcıyla aynı ucu vuruyordu. Favori varken yoklamayı yalnız sekme
 * çubuğundaki bu kanca yapar (ALL_LIVE_POLL_MS); diğer okuyucular aralık
 * kurmaz, önbelleği okur.
 */

import { useEffect, useMemo, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getLiveMatches } from "@/lib/api/matches";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";

/** Uygulama ön planda mı — yoklama aralıklarını kapatmak için. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState === "active");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      setActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  return active;
}

/** Kapsamsız canlı akışın (`/maclar/live`) ortak yoklama aralığı ve tazelik süresi. */
export const ALL_LIVE_POLL_MS = 30_000;
export const ALL_LIVE_STALE_MS = 10_000;

/** Takım adı karşılaştırması Türkçe küçük harfle yapılır (İ/I tuzağı). */
const normalizeName = (value: string) => value.trim().toLocaleLowerCase("tr");

export interface LiveFavoriteCount {
  /** Rozette gösterilen sayı. */
  count: number;
  /** Favori kapsamdaki canlı maçlar — Favoriler ekranı listeyi doğrudan kullanır. */
  matches: ApiMatch[];
  loading: boolean;
}

/**
 * @param options.poll false → yalnız önbelleği okur, kendi aralığını kurmaz
 *   (sekme çubuğundaki örnek zaten yokluyor; bkz. TEK ZAMANLAYICI).
 */
export function useLiveFavoriteCount({ poll = true }: { poll?: boolean } = {}): LiveFavoriteCount {
  const { favorites, favoriteLeagues, favoriteSeasons, favoriteMatches } = useFavorite();
  const appActive = useAppActive();

  const hasFavorites =
    favorites.length > 0 ||
    favoriteLeagues.length > 0 ||
    favoriteSeasons.length > 0 ||
    favoriteMatches.length > 0;

  const query = useQuery({
    queryKey: queryKeys.liveFavoriteMatches(),
    queryFn: () => getLiveMatches(),
    // Hiç favori yoksa ağa çıkmanın anlamı yok.
    enabled: hasFavorites,
    staleTime: ALL_LIVE_STALE_MS,
    refetchInterval: poll && hasFavorites && appActive ? ALL_LIVE_POLL_MS : false,
    retry: false,
  });

  const matches = useMemo(() => {
    const live = query.data;
    if (!live?.length || !hasFavorites) return [];

    const teamIds = new Set(favorites.map((team) => team.id));
    const teamNames = new Set(favorites.map((team) => normalizeName(team.name)));
    const leagueIds = new Set(favoriteLeagues.map((league) => league.id));
    const seasonIds = new Set(favoriteSeasons.map((season) => season.id));
    const matchIds = new Set(favoriteMatches);

    const picked = new Map<number, ApiMatch>();
    live.forEach((match) => {
      const byMatch = matchIds.has(match.id);
      // Kompakt yanıtta takım id'si gelmeyebilir; ada göre eşleşme yedeği.
      const byTeamId =
        (match.home_team_id != null && teamIds.has(match.home_team_id)) ||
        (match.away_team_id != null && teamIds.has(match.away_team_id));
      const byTeamName =
        teamNames.has(normalizeName(match.first_team_name ?? "")) ||
        teamNames.has(normalizeName(match.second_team_name ?? ""));
      const byLeague = match.league_id != null && leagueIds.has(match.league_id);
      const bySeason = match.season_id != null && seasonIds.has(match.season_id);

      if (byMatch || byTeamId || byTeamName || byLeague || bySeason) {
        picked.set(match.id, match); // Map tekilleştirmeyi kendi yapar.
      }
    });

    return Array.from(picked.values());
  }, [query.data, hasFavorites, favorites, favoriteLeagues, favoriteSeasons, favoriteMatches]);

  return {
    count: matches.length,
    matches,
    loading: hasFavorites && query.isLoading,
  };
}

/** Rozet metni — 9'dan sonrası "9+". 0'da rozet HİÇ çizilmez (undefined). */
export function liveBadgeLabel(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 9 ? "9+" : String(count);
}
