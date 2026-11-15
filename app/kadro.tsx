/**
 * KADRO KOŞUSU — eski skor oyunu rotası. Oyun artık BÖLÜMLÜDÜR (sözleşme §1): Lig
 * Yolu modülü (components/puzzle/games/kadro, lib/puzzle/registry.ts) ve kendi
 * ana sayfası /lig-yolu/kadro. Eski bağlantılar (bildirim, paylaşım) oraya yönlenir.
 */

import { Redirect } from "expo-router";

export default function KadroRedirect() {
  return <Redirect href="/lig-yolu/kadro" />;
}
