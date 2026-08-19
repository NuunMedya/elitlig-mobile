import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  followFavorite,
  getMyFavorites,
  unfollowFavorite,
  type FavoriteKind,
} from "@/lib/api/favorites";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Favoriler — takım, lig ve sezon takibi.
 *
 * Kullanıcı istediği kadar takımı, ligi ve sezonu favoriye ekleyebilir.
 * Seçimler her zaman cihazda saklanır (misafir de kullanabilir); giriş
 * yapılmışsa sunucuya da yazılır — push bildirimleri (fikstür, maç sonucu)
 * sunucudaki kayda göre hedeflenir (routes/favorites.js).
 */

const STORAGE_KEY = "elitlig.favoriteTeams.v2";
const SCOPE_STORAGE_KEY = "elitlig.favoriteScopes.v1";

export interface FavoriteTeam {
  id: number;
  name: string;
  logo?: string | null;
}

export interface FavoriteScope {
  id: number;
  name: string;
}

interface FavoriteContextValue {
  favorites: FavoriteTeam[];
  isFavorite: (teamId?: number | null) => boolean;
  addFavorite: (team: FavoriteTeam) => void;
  removeFavorite: (teamId: number) => void;
  toggleFavorite: (team: FavoriteTeam) => void;
  clearFavorites: () => void;
  /** Lig favorileri */
  favoriteLeagues: FavoriteScope[];
  isFavoriteLeague: (leagueId?: number | null) => boolean;
  toggleFavoriteLeague: (league: FavoriteScope) => void;
  /** Sezon favorileri */
  favoriteSeasons: FavoriteScope[];
  isFavoriteSeason: (seasonId?: number | null) => boolean;
  toggleFavoriteSeason: (season: FavoriteScope) => void;
  // Geriye dönük uyumluluk
  favorite: FavoriteTeam | null;
}

const FavoriteContext = createContext<FavoriteContextValue | null>(null);

/** Sunucu senkronu ateşle-unut: çevrimdışıyken bile UI anında güncellenir. */
function syncServer(action: "follow" | "unfollow", kind: FavoriteKind, id: number, enabled: boolean) {
  if (!enabled) return;
  const call = action === "follow" ? followFavorite : unfollowFavorite;
  call(kind, id).catch(() => {});
}

export function FavoriteProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const signedIn = Boolean(auth.user);

  const [favorites, setFavorites] = useState<FavoriteTeam[]>([]);
  const [leagues, setLeagues] = useState<FavoriteScope[]>([]);
  const [seasons, setSeasons] = useState<FavoriteScope[]>([]);
  const [restored, setRestored] = useState(false);
  const syncedUserRef = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(SCOPE_STORAGE_KEY)])
      .then(([teamsRaw, scopesRaw]) => {
        if (teamsRaw) {
          try {
            const stored = JSON.parse(teamsRaw);
            // v1 uyumluluğu: eski tek nesne formatını dizi formatına çevir
            if (Array.isArray(stored)) setFavorites(stored.filter((t) => t?.id));
            else if (stored?.id) setFavorites([stored]);
          } catch {}
        }
        if (scopesRaw) {
          try {
            const stored = JSON.parse(scopesRaw);
            if (Array.isArray(stored?.leagues)) setLeagues(stored.leagues.filter((l: FavoriteScope) => l?.id));
            if (Array.isArray(stored?.seasons)) setSeasons(stored.seasons.filter((s: FavoriteScope) => s?.id));
          } catch {}
        }
      })
      .finally(() => setRestored(true));
  }, []);

  useEffect(() => {
    if (!restored) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)).catch(() => {});
  }, [favorites, restored]);

  useEffect(() => {
    if (!restored) return;
    AsyncStorage.setItem(SCOPE_STORAGE_KEY, JSON.stringify({ leagues, seasons })).catch(() => {});
  }, [leagues, seasons, restored]);

  // Girişte bir kez: cihazdaki favorileri sunucuya taşı (sunucuda olmayanlar
  // eklenir), böylece push hedeflemesi cihaz listesiyle örtüşür.
  useEffect(() => {
    if (!restored || !signedIn) {
      if (!signedIn) syncedUserRef.current = null;
      return;
    }
    const userKey = auth.user?.username ?? "user";
    if (syncedUserRef.current === userKey) return;
    syncedUserRef.current = userKey;

    (async () => {
      try {
        const server = await getMyFavorites();
        const serverTeams = new Set(server.teamIds);
        const serverLeagues = new Set(server.leagueIds);
        const serverSeasons = new Set(server.seasonIds);
        favorites.forEach((t) => {
          if (!serverTeams.has(t.id)) followFavorite("teams", t.id).catch(() => {});
        });
        leagues.forEach((l) => {
          if (!serverLeagues.has(l.id)) followFavorite("leagues", l.id).catch(() => {});
        });
        seasons.forEach((s) => {
          if (!serverSeasons.has(s.id)) followFavorite("seasons", s.id).catch(() => {});
        });
      } catch {
        // Sunucuya ulaşılamadıysa sonraki girişte tekrar denenir.
        syncedUserRef.current = null;
      }
    })();
  }, [restored, signedIn, auth.user?.username]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFavorite = useCallback(
    (teamId?: number | null) => favorites.some((t) => t.id === Number(teamId)),
    [favorites]
  );

  const addFavorite = useCallback((team: FavoriteTeam) => {
    setFavorites((prev) => (prev.some((t) => t.id === team.id) ? prev : [...prev, team]));
    syncServer("follow", "teams", team.id, signedIn);
  }, [signedIn]);

  const removeFavorite = useCallback((teamId: number) => {
    setFavorites((prev) => prev.filter((t) => t.id !== teamId));
    syncServer("unfollow", "teams", teamId, signedIn);
  }, [signedIn]);

  const toggleFavorite = useCallback((team: FavoriteTeam) => {
    setFavorites((prev) => {
      const exists = prev.some((t) => t.id === team.id);
      syncServer(exists ? "unfollow" : "follow", "teams", team.id, signedIn);
      return exists ? prev.filter((t) => t.id !== team.id) : [...prev, team];
    });
  }, [signedIn]);

  const clearFavorites = useCallback(() => {
    favorites.forEach((t) => syncServer("unfollow", "teams", t.id, signedIn));
    setFavorites([]);
  }, [favorites, signedIn]);

  const isFavoriteLeague = useCallback(
    (leagueId?: number | null) => leagues.some((l) => l.id === Number(leagueId)),
    [leagues]
  );

  const toggleFavoriteLeague = useCallback((league: FavoriteScope) => {
    setLeagues((prev) => {
      const exists = prev.some((l) => l.id === league.id);
      syncServer(exists ? "unfollow" : "follow", "leagues", league.id, signedIn);
      return exists ? prev.filter((l) => l.id !== league.id) : [...prev, league];
    });
  }, [signedIn]);

  const isFavoriteSeason = useCallback(
    (seasonId?: number | null) => seasons.some((s) => s.id === Number(seasonId)),
    [seasons]
  );

  const toggleFavoriteSeason = useCallback((season: FavoriteScope) => {
    setSeasons((prev) => {
      const exists = prev.some((s) => s.id === season.id);
      syncServer(exists ? "unfollow" : "follow", "seasons", season.id, signedIn);
      return exists ? prev.filter((s) => s.id !== season.id) : [...prev, season];
    });
  }, [signedIn]);

  const value = useMemo(
    () => ({
      favorites,
      isFavorite,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      clearFavorites,
      favoriteLeagues: leagues,
      isFavoriteLeague,
      toggleFavoriteLeague,
      favoriteSeasons: seasons,
      isFavoriteSeason,
      toggleFavoriteSeason,
      favorite: favorites[0] ?? null, // geriye dönük uyumluluk
    }),
    [
      favorites,
      isFavorite,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      clearFavorites,
      leagues,
      isFavoriteLeague,
      toggleFavoriteLeague,
      seasons,
      isFavoriteSeason,
      toggleFavoriteSeason,
    ]
  );

  return <FavoriteContext.Provider value={value}>{children}</FavoriteContext.Provider>;
}

export function useFavorite(): FavoriteContextValue {
  const context = useContext(FavoriteContext);
  if (!context) throw new Error("useFavorite, FavoriteProvider içinde kullanılmalıdır.");
  return context;
}
