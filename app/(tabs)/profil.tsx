/**
 * PROFİL — eski sekme, yönlendirme.
 *
 * Profil sekmesi "Menü" oldu (app/(tabs)/menu.tsx): üye profili kartı en
 * üstte, altında oyunlar, keşif, bilgi ve ayarlar. Rota eski derin
 * bağlantılar kırılmasın diye durur ve Menü'ye yönlendirir.
 */

import { Redirect } from "expo-router";

export default function ProfileRedirect() {
  return <Redirect href="/(tabs)/menu" />;
}
