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
 * Favori takım — giriş gerektirmeyen kişiselleştirme.
 *
 * Kullanıcı bir takımı yıldızlar; seçim cihazda saklanır ve Genel Bakış
 * "Takımım" kartıyla açılır. Tek takım tutulur (halı saha kullanıcısı kendi
 * takımının oyuncusudur); ileride çoklu takip gerekirse yapı diziye çevrilir.
 */

const STORAGE_KEY = "elitlig.favoriteTeam.v1";

interface FavoriteTeam {
  id: number;
  name: string;
}

interface FavoriteContextValue {
  favorite: FavoriteTeam | null;
  isFavorite: (teamId?: number | null) => boolean;
  toggleFavorite: (team: FavoriteTeam) => void;
  clearFavorite: () => void;
}

const FavoriteContext = createContext<FavoriteContextValue | null>(null);

export function FavoriteProvider({ children }: { children: ReactNode }) {
  const [favorite, setFavorite] = useState<FavoriteTeam | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const stored = JSON.parse(raw) as FavoriteTeam;
          if (stored?.id) setFavorite(stored);
        } catch {
          // Bozuk kayıt yok sayılır.
        }
      })
      .finally(() => setRestored(true));
  }, []);

  useEffect(() => {
    if (!restored) return;
    if (favorite) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(favorite)).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  }, [favorite, restored]);

  const toggleFavorite = useCallback((team: FavoriteTeam) => {
    setFavorite((current) => (current?.id === team.id ? null : team));
  }, []);

  const clearFavorite = useCallback(() => setFavorite(null), []);

  const isFavorite = useCallback(
    (teamId?: number | null) => favorite != null && Number(teamId) === favorite.id,
    [favorite]
  );

  const value = useMemo(
    () => ({ favorite, isFavorite, toggleFavorite, clearFavorite }),
    [favorite, isFavorite, toggleFavorite, clearFavorite]
  );

  return <FavoriteContext.Provider value={value}>{children}</FavoriteContext.Provider>;
}

export function useFavorite(): FavoriteContextValue {
  const context = useContext(FavoriteContext);
  if (!context) throw new Error("useFavorite, FavoriteProvider içinde kullanılmalıdır.");
  return context;
}
