/**
 * ESKİ "STADYUMUNU KUR" — /lig-yolu/stadyum
 *
 * Kasım 2026'dan beri stadyum, Kulüp Şehri'nin bir parçası (/kulup-sehri).
 * Eski bağlantılar (bildirim, görev, paylaşım) bozulmasın diye bu rota şehre
 * yönlendirir.
 */

import { Redirect } from "expo-router";

export default function StadiumRedirect() {
  return <Redirect href="/kulup-sehri" />;
}
