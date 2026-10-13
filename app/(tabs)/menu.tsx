/**
 * MENÜ — eski rota.
 *
 * Menü'nün içeriği (oyunlar, bilgi, sosyal bağlantılar) Profil sekmesine,
 * lig bağlantıları alt çubuktaki Lig sekmesine taşındı. Rota, eski derin
 * bağlantılar kırılmasın diye durur ve Profil'e yönlendirir.
 */

import { Redirect } from "expo-router";

export default function MenuRedirect() {
  return <Redirect href="/(tabs)/profil" />;
}
