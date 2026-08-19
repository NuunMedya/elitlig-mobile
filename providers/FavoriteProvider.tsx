import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Favori takımlar — çoklu takip listesi.
 * Kullanıcı istediği kadar takımı favoriye ekleyebilir.
 * Seçimler cihazda saklanır, bildirimler için de kullanılır.
 */

const STORAGE_KEY = "elitlig.favoriteTeams.v2";

export interface FavoriteTeam {
  id: number;
  name: string;
  logo?: string | null;
}

interface FavoriteContextValue {
  favorites: FavoriteTeam[];
  isFavorite: (teamId?: number | null) => boolean;
  addFavorite: (team: FavoriteTeam) => void;
  removeFavorite: (teamId: number) => void;
  toggleFavorite: (team: FavoriteTeam) => void;
  clearFavorites: () => void;
  // Geriye dönük uyumluluk
  favorite: FavoriteTeam | null;
}

const FavoriteContext = createContext<FavoriteContextValue | null>(null);

export function FavoriteProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteTeam[]>([]);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const stored = JSON.parse(raw);
          // v1 uyumluluğu: eski tek nesne formatını dizi formatına çevir
          if (Array.isArray(stored)) {
            setFavorites(stored.filter((t) => t?.id));
          } else if (stored?.id) {
            setFavorites([stored]);
          }
        } catch {}
      })
      .finally(() => setRestored(true));
  }, []);

  useEffect(() => {
    if (!restored) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)).catch(() => {});
  }, [favorites, restored]);

  const isFavorite = useCallback(
    (teamId?: number | null) => favorites.some((t) => t.id === Number(teamId)),
    [favorites]
  );

  const addFavorite = useCallback((team: FavoriteTeam) => {
    setFavorites((prev) =>
      prev.some((t) => t.id === team.id) ? prev : [...prev, team]
    );
  }, []);

  const removeFavorite = useCallback((teamId: number) => {
    setFavorites((prev) => prev.filter((t) => t.id !== teamId));
  }, []);

  const toggleFavorite = useCallback((team: FavoriteTeam) => {
    setFavorites((prev) =>
      prev.some((t) => t.id === team.id)
        ? prev.filter((t) => t.id !== team.id)
        : [...prev, team]
    );
  }, []);

  const clearFavorites = useCallback(() => setFavorites([]), []);

  const value = useMemo(
    () => ({
      favorites,
      isFavorite,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      clearFavorites,
      favorite: favorites[0] ?? null, // geriye dönük uyumluluk
    }),
    [favorites, isFavorite, addFavorite, removeFavorite, toggleFavorite, clearFavorites]
  );

  return <FavoriteContext.Provider value={value}>{children}</FavoriteContext.Provider>;
}

export function useFavorite(): FavoriteContextValue {
  const context = useContext(FavoriteContext);
  if (!context) throw new Error("useFavorite, FavoriteProvider içinde kullanılmalıdır.");
  return context;
}
