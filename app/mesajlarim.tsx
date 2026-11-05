/**
 * /mesajlarim — ESKİ ROTA: yönetime yapılan başvurular artık
 * Bildirimler ▸ Başvurularım'da (`durum`, `yeni` korunur).
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
      href={{ pathname: "/bildirimler", params: { bolum: "basvurular", ...(durum ? { durum } : {}), ...(yeni ? { yeni } : {}) } }}
    />
  );
}
