/**
 * SAVUNMA HATTI — eski skor oyunu rotası. Oyun artık BÖLÜMLÜDÜR (sözleşme §1): Lig
 * Yolu modülü (components/puzzle/games/savunma, lib/puzzle/registry.ts) ve kendi
 * ana sayfası /lig-yolu/savunma. Eski bağlantılar (bildirim, paylaşım) oraya yönlenir.
 */

import { Redirect } from "expo-router";

export default function SavunmaRedirect() {
  return <Redirect href="/lig-yolu/savunma" />;
}
