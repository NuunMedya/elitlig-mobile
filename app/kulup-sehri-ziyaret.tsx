/**
 * ŞEHİRLERİ GEZ — /kulup-sehri-ziyaret (Kulüp Şehri 2.0)
 *
 * Ekranın bütün içeriği components/city2/windows/VisitWindow.tsx'te: şehrin içinde
 * aynı pencere tam ekran şehrin üstünde katman olarak açılır; bu rota derin
 * bağlantılar ve bildirimler için aynı pencereyi kendi sayfasında çizer.
 */

import { VisitWindow } from "@/components/city2/windows/VisitWindow";

export default function Route() {
  return <VisitWindow />;
}
