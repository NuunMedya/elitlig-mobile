/**
 * ŞEHİR SIRALAMASI — /kulup-sehri-siralama (Kulüp Şehri 2.0)
 *
 * Ekranın bütün içeriği components/city2/windows/LeaderboardWindow.tsx'te: şehrin içinde
 * aynı pencere tam ekran şehrin üstünde katman olarak açılır; bu rota derin
 * bağlantılar ve bildirimler için aynı pencereyi kendi sayfasında çizer.
 */

import { LeaderboardWindow } from "@/components/city2/windows/LeaderboardWindow";

export default function Route() {
  return <LeaderboardWindow />;
}
