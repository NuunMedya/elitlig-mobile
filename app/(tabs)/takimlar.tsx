/**
 * TAKIMLAR — eski sekme rotası.
 *
 * Takım listesi Lig merkezinin "Takımlar" sekmesine taşındı (bkz.
 * `app/(tabs)/ligler.tsx`, `components/league/TeamsPane.tsx`); puan tablosu
 * aynı merkezin "Puan" sekmesidir. Rota eski derin bağlantılar kırılmasın diye
 * durur, oraya yönlendirir.
 */

import { Redirect } from "expo-router";

export default function TeamsRedirect() {
  return <Redirect href="/(tabs)/ligler?tab=takimlar" />;
}
