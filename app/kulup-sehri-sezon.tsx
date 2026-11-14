/**
 * SEZON — /kulup-sehri-sezon (Kulüp Şehri 2.0)
 *
 * Ekranın bütün içeriği components/city2/windows/SeasonWindow.tsx'te: şehrin içinde
 * aynı pencere tam ekran şehrin üstünde katman olarak açılır; bu rota derin
 * bağlantılar ve bildirimler için aynı pencereyi kendi sayfasında çizer.
 */

import { SeasonWindow } from "@/components/city2/windows/SeasonWindow";

export default function Route() {
  return <SeasonWindow />;
}
