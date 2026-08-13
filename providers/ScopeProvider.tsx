import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getCities, getDefaultScope, getLeagues, getSeasons } from "@/lib/api/meta";
import { DEFAULT_CITY_ID } from "@/lib/config";
import { queryKeys } from "@/lib/queryKeys";
import type { MetaLeague, MetaOption, MetaSeason } from "@/lib/types";

/**
 * Kapsam (şehir → lig → sezon) uygulamanın omurgasıdır: fikstür, puan durumu,
 * oyuncu sıralaması ve haber akışı hep seçili kapsamı gösterir. Web sitesindeki
 * useAltScopedPageData'nın mobil karşılığıdır.
 *
 * Seçim cihazda saklanır; kullanıcı uygulamayı her açtığında kendi ligiyle
 * karşılaşır.
 */

const STORAGE_KEY = "elitlig.scope.v1";

interface StoredScope {
  cityId: number;
  leagueId: number | null;
  seasonId: number | null;
}

interface ScopeContextValue {
  cityId: number | null;
  leagueId: number | null;
  seasonId: number | null;
  cityLabel: string;
  leagueLabel: string;
  seasonLabel: string;
  /** Üçü de seçili olmadan kapsam bağımlı sorgular çalıştırılmaz. */
  ready: boolean;
  loading: boolean;
  cities: MetaOption[];
  leagues: MetaLeague[];
  seasons: MetaSeason[];
  selectCity: (cityId: number) => void;
  selectLeague: (leagueId: number) => void;
  selectSeason: (seasonId: number) => void;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [cityId, setCityId] = useState<number | null>(null);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  // 1) Cihazda saklı seçimi geri yükle.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const stored = JSON.parse(raw) as StoredScope;
            setCityId(stored.cityId ?? null);
            setLeagueId(stored.leagueId ?? null);
            setSeasonId(stored.seasonId ?? null);
          } catch {
            // Bozuk kayıt: varsayılana düş.
          }
        }
      })
      .finally(() => {
        if (!cancelled) setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Seçim değiştikçe sakla.
  useEffect(() => {
    if (!restored || !cityId) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ cityId, leagueId, seasonId })).catch(() => {
      // Depolama hatası kapsamı bozmaz; oturum boyunca bellekte geçerli kalır.
    });
  }, [restored, cityId, leagueId, seasonId]);

  const citiesQuery = useQuery({
    queryKey: queryKeys.cities(),
    queryFn: getCities,
    staleTime: 30 * 60_000,
  });

  // 3) Hiç seçim yoksa yapılandırılmış varsayılan şehre (yoksa ilk şehre) düş.
  useEffect(() => {
    if (!restored || cityId || !citiesQuery.data?.length) return;
    const preferred = citiesQuery.data.find((city) => city.id === DEFAULT_CITY_ID);
    setCityId((preferred ?? citiesQuery.data[0]).id);
  }, [restored, cityId, citiesQuery.data]);

  const leaguesQuery = useQuery({
    queryKey: queryKeys.leagues(cityId ?? undefined),
    queryFn: () => getLeagues(cityId as number),
    enabled: Boolean(cityId),
    staleTime: 10 * 60_000,
  });

  const seasonsQuery = useQuery({
    queryKey: queryKeys.seasons(cityId ?? undefined, leagueId ?? undefined),
    queryFn: () => getSeasons(cityId as number, leagueId as number),
    enabled: Boolean(cityId && leagueId),
    staleTime: 10 * 60_000,
  });

  // 4) Lig/sezon boşsa sunucunun önerdiği varsayılan kapsamı kullan.
  const defaultScopeQuery = useQuery({
    queryKey: queryKeys.defaultScope(cityId ?? undefined),
    queryFn: () => getDefaultScope(cityId as number),
    enabled: Boolean(cityId) && (!leagueId || !seasonId),
    staleTime: 10 * 60_000,
    retry: false,
  });

  useEffect(() => {
    const suggestion = defaultScopeQuery.data;
    if (!suggestion) return;
    if (!leagueId) setLeagueId(suggestion.leagueId);
    if (!seasonId) setSeasonId(suggestion.seasonId);
  }, [defaultScopeQuery.data, leagueId, seasonId]);

  // 5) Seçili lig/sezon artık listede yoksa (arşivlendi, silindi) ilk geçerliye kay.
  useEffect(() => {
    const leagues = leaguesQuery.data;
    if (!leagues?.length) return;
    if (!leagues.some((league) => league.id === leagueId)) {
      setLeagueId(leagues[0].id);
      setSeasonId(null);
    }
  }, [leaguesQuery.data, leagueId]);

  useEffect(() => {
    const seasons = seasonsQuery.data;
    if (!seasons?.length) return;
    if (!seasons.some((season) => season.id === seasonId)) {
      setSeasonId(seasons[0].id);
    }
  }, [seasonsQuery.data, seasonId]);

  const selectCity = useCallback((next: number) => {
    // Şehir değişince lig ve sezon anlamını yitirir; sunucu yenisini önerir.
    setCityId(next);
    setLeagueId(null);
    setSeasonId(null);
  }, []);

  const selectLeague = useCallback((next: number) => {
    setLeagueId(next);
    setSeasonId(null);
  }, []);

  const selectSeason = useCallback((next: number) => setSeasonId(next), []);

  const labelOf = (options: MetaOption[] | undefined, id: number | null) =>
    options?.find((option) => option.id === id)?.label ?? "";

  const value = useMemo<ScopeContextValue>(
    () => ({
      cityId,
      leagueId,
      seasonId,
      cityLabel: labelOf(citiesQuery.data, cityId),
      leagueLabel: labelOf(leaguesQuery.data, leagueId),
      seasonLabel: labelOf(seasonsQuery.data, seasonId),
      ready: Boolean(cityId && leagueId && seasonId),
      loading:
        !restored ||
        citiesQuery.isLoading ||
        leaguesQuery.isLoading ||
        (Boolean(leagueId) && seasonsQuery.isLoading),
      cities: citiesQuery.data ?? [],
      leagues: leaguesQuery.data ?? [],
      seasons: seasonsQuery.data ?? [],
      selectCity,
      selectLeague,
      selectSeason,
    }),
    [
      cityId,
      leagueId,
      seasonId,
      restored,
      citiesQuery.data,
      citiesQuery.isLoading,
      leaguesQuery.data,
      leaguesQuery.isLoading,
      seasonsQuery.data,
      seasonsQuery.isLoading,
      selectCity,
      selectLeague,
      selectSeason,
    ]
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const context = useContext(ScopeContext);
  if (!context) throw new Error("useScope, ScopeProvider içinde kullanılmalıdır.");
  return context;
}

/** Kapsam bağımlı sorgular için kısayol: `enabled: scope.ready` ile birlikte kullanılır. */
export function useScopeParams() {
  const { cityId, leagueId, seasonId, ready } = useScope();
  return useMemo(
    () => ({
      cityId: cityId ?? undefined,
      leagueId: leagueId ?? undefined,
      seasonId: seasonId ?? undefined,
      ready,
    }),
    [cityId, leagueId, seasonId, ready]
  );
}
