/**
 * ŞEHİR İÇİ GEZİNME — tam ekran şehrin pencereleri (akademi, sezon, takım,
 * ziyaret, sıralama, ligler) hem ŞEHRİN ÜSTÜNDE katman olarak hem de kendi
 * rotalarında (/kulup-sehri-*) aynı bileşenle açılır.
 *
 *   · Şehrin içindeyken (`CityNavProvider`): `open` pencereyi değiştirir,
 *     `close` pencereyi kapatıp şehre döner, `building` pencereyi kapatıp o
 *     binanın panelini açar. Hiçbiri yeni sayfa açmaz.
 *   · Kendi rotasında (sağlayıcı yok): `open` rotayı iter, `close` geri döner,
 *     `building` şehre gidip binayı açar (?bina=). Derin bağlantılar bozulmaz.
 */

import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { createContext, useContext, useMemo } from "react";

export type CityWindowKey = "akademi" | "sezon" | "takim" | "ziyaret" | "siralama" | "merdiven";
export type CityWindowParams = Record<string, string>;

export const CITY_WINDOW_ROUTES: Record<CityWindowKey, string> = {
  akademi: "/kulup-sehri-akademi",
  sezon: "/kulup-sehri-sezon",
  takim: "/kulup-sehri-takim",
  ziyaret: "/kulup-sehri-ziyaret",
  siralama: "/kulup-sehri-siralama",
  merdiven: "/kulup-sehri-merdiven",
};

export interface CityNav {
  /** Şehrin üstünde katman olarak mı açık (true) yoksa kendi rotasında mı. */
  inCity: boolean;
  open: (key: CityWindowKey, params?: CityWindowParams) => void;
  close: () => void;
  building: (key: string) => void;
  /** Katmanın parametreleri (rotada `useLocalSearchParams`). */
  params: CityWindowParams;
}

const Ctx = createContext<CityNav | null>(null);

export const CityNavProvider = Ctx.Provider;

export function useCityNav(): CityNav {
  const ctx = useContext(Ctx);
  const router = useRouter();
  const routeParams = useLocalSearchParams();
  return useMemo<CityNav>(() => {
    if (ctx) return ctx;
    const params: CityWindowParams = {};
    for (const [k, v] of Object.entries(routeParams)) if (typeof v === "string") params[k] = v;
    return {
      inCity: false,
      params,
      open: (key, p) => router.push({ pathname: CITY_WINDOW_ROUTES[key], params: p ?? {} } as unknown as Href),
      close: () => (router.canGoBack() ? router.back() : router.replace("/kulup-sehri")),
      building: (key) => router.navigate({ pathname: "/kulup-sehri", params: { bina: key } }),
    };
  }, [ctx, routeParams, router]);
}
