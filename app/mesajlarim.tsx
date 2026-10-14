/**
 * /mesajlarim — ESKİ ROTA, yönlendirme.
 *
 * Yönetim başvuruları Mesajlar sekmesinin "Yönetim" kutusuna taşındı
 * (app/(tabs)/mesajlar.tsx; yönlendirme /gelen-kutusu üstünden, içerik
 * components/inbox/PanelThreadsPane.tsx). Rota silinmez: `PANEL_MESSAGE`
 * bildirimlerinin liste hedefi (lib/notifications.ts) ve app/mesaj/[id].tsx'in
 * "kutuya dön" / "yeni başvuru" (`?yeni=1`) bağlantıları buraya gelir.
 * `durum` ve `yeni` parametreleri olduğu gibi taşınır.
 */

import { Redirect, useLocalSearchParams } from "expo-router";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function MessagesRedirect() {
  const params = useLocalSearchParams<{ durum?: string | string[]; yeni?: string | string[] }>();
  const durum = first(params.durum);
  const yeni = first(params.yeni);
  return (
    <Redirect
      href={{
        pathname: "/gelen-kutusu",
        params: {
          tab: "mesajlar",
          kutu: "basvurular",
          ...(durum ? { durum } : {}),
          ...(yeni ? { yeni } : {}),
        },
      }}
    />
  );
}
