/**
 * TAKIMLAR — eski sekme rotası.
 *
 * Ayrı takım listesi kalktı: Lig merkezinin "Puan" sekmesindeki tablo her
 * takımı satır olarak gösterir; satıra dokununca takım sayfası açılır,
 * satırdaki yıldız takımı takip eder (bkz. `app/(tabs)/ligler.tsx`,
 * `components/league/StandingsPane.tsx`). Rota eski derin bağlantılar
 * kırılmasın diye durur, oraya yönlendirir.
 */

import { Redirect } from "expo-router";

export default function TeamsRedirect() {
  return <Redirect href="/(tabs)/ligler?tab=puan" />;
}
