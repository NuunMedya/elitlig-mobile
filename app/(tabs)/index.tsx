/**
 * ANA SAYFA — kaldırıldı; kök rota Skorlar'a yönlendirir.
 *
 * Bilgi mimarisi turunda Ana Sayfa'nın bölümleri asıl evlerine dağıtıldı:
 *   · vitrin maç, canlı ve bugün          → Skorlar
 *   · takip edilen takımlar               → Takip
 *   · puan özeti, gol krallığı            → Lig
 *   · haberler                            → Takip akışı ve Lig ▸ Haber
 * Uygulama Skorlar ile açılır; "/" adresi eski bağlantılar için durur.
 */

import { Redirect } from "expo-router";

export default function HomeRedirect() {
  return <Redirect href="/(tabs)/skorlar" />;
}
