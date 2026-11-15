/**
 * KARİYER MERDİVENİ — /kulup-sehri-merdiven (Kulüp Şehri 2.0)
 *
 * Ekranın bütün içeriği components/city2/windows/LadderWindow.tsx'te: şehrin içinde
 * aynı pencere tam ekran şehrin üstünde katman olarak açılır; bu rota derin
 * bağlantılar ve bildirimler için aynı pencereyi kendi sayfasında çizer.
 */

import { LadderWindow } from "@/components/city2/windows/LadderWindow";

export default function Route() {
  return <LadderWindow />;
}
