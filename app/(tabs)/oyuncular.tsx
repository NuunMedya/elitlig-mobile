/**
 * OYUNCULAR — eski sekme rotası.
 *
 * Oyuncu sıralamaları Lig merkezinin "Oyuncular" sekmesine taşındı (bkz.
 * `app/(tabs)/ligler.tsx`, `components/league/PlayersPane.tsx`). Rota eski
 * derin bağlantılar ve bildirimler kırılmasın diye durur, oraya yönlendirir.
 */

import { Redirect } from "expo-router";

export default function PlayersRedirect() {
  return <Redirect href="/(tabs)/ligler?tab=oyuncular" />;
}
