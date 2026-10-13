/**
 * MAÇLAR — eski sekme rotası.
 *
 * Maç listesi "Skorlar" sekmesine dönüştü (bkz. `app/(tabs)/skorlar.tsx`).
 * Rota eski derin bağlantılar (`/maclar?tab=canli&date=…`) kırılmasın diye
 * durur; parametreleri olduğu gibi Skorlar'a taşır.
 */

import { Redirect, useLocalSearchParams } from "expo-router";

export default function MatchesRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: "/(tabs)/skorlar", params }} />;
}
