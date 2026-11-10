import { useQuery } from "@tanstack/react-query";
import { EMPTY_ADS, getAppAds, type AppAds } from "@/lib/ads/api";
import { useScope } from "@/providers/ScopeProvider";

/**
 * Uygulamanın reklam yükü (alan ayarları + sponsorlar). Seçili ilin ve tüm
 * illerin sponsorları gelir; 5 dk taze sayılır, ekranlar arasında paylaşılır.
 */
export function useAppAds(): AppAds {
  const { cityId } = useScope();
  const query = useQuery({
    queryKey: ["ads", "app", cityId ?? "all"],
    queryFn: () => getAppAds(cityId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 0,
  });
  return query.data ?? EMPTY_ADS;
}
