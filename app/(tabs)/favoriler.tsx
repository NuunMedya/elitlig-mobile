/**
 * FAVORİLER — eski rota.
 *
 * Favoriler ekranının yerini alt çubuktaki "Takip" sekmesi aldı (bkz.
 * `app/(tabs)/takip.tsx`). Eski derin bağlantılar (`/favoriler?tab=…`)
 * kırılmasın diye rota durur ve Takip'e yönlendirir.
 */

import { Redirect, useLocalSearchParams } from "expo-router";

export default function FavoritesRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: "/(tabs)/takip", params }} />;
}
