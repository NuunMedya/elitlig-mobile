/**
 * CANLI — eski rota.
 *
 * Kapsamdan bağımsız canlı maç akışı Skorlar sekmesine taşındı: "Canlı"
 * segmenti seçiliyken "Tüm şehirler" anahtarı açık olduğunda aynı akış
 * (`/maclar/live`, kapsam filtresiz) orada gösterilir. Push (`match_start`)
 * ve eski derin bağlantılar kırılmasın diye rota durur ve oraya yönlendirir.
 */

import { Redirect } from "expo-router";

export default function LiveRedirect() {
  return <Redirect href={{ pathname: "/(tabs)/skorlar", params: { tab: "canli", tum: "1" } }} />;
}
