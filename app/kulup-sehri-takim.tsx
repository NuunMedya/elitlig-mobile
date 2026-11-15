/**
 * TAKIM TESİSİ — /kulup-sehri-takim (Kulüp Şehri 2.0)
 *
 * Ekranın bütün içeriği components/city2/windows/TeamWindow.tsx'te: şehrin içinde
 * aynı pencere tam ekran şehrin üstünde katman olarak açılır; bu rota derin
 * bağlantılar ve bildirimler için aynı pencereyi kendi sayfasında çizer.
 */

import { TeamWindow } from "@/components/city2/windows/TeamWindow";

export default function Route() {
  return <TeamWindow />;
}
