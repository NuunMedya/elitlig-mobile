/**
 * PENALTI — eski skor oyunu rotası. Oyun artık BÖLÜMLÜDÜR (sözleşme §1): Lig
 * Yolu modülü (components/puzzle/games/penalti, lib/puzzle/registry.ts) ve kendi
 * ana sayfası /lig-yolu/penalti. Eski bağlantılar (bildirim, paylaşım) oraya yönlenir.
 */

import { Redirect } from "expo-router";

export default function PenaltiRedirect() {
  return <Redirect href="/lig-yolu/penalti" />;
}
