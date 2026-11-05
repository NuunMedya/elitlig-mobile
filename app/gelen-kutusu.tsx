/**
 * /gelen-kutusu — ESKİ ROTA, yönlendirme.
 *
 * TEK MESAJLAŞMA KURALI: sohbetler Mesajlar sekmesinde, bildirimler zilin
 * açtığı /bildirimler ekranında, yönetime başvurular onun "Başvurularım"
 * bölümünde. Eski parametreler buna çevrilir:
 *   · tab=mesajlar&kutu=sohbetler     → Mesajlar
 *   · tab=mesajlar&kutu=basvurular    → Bildirimler ▸ Başvurularım (`durum`, `yeni` korunur)
 *   · tab=bildirimler&filtre=<kategori> → Bildirimler (süzgeçle)
 */

import { Redirect, useLocalSearchParams } from "expo-router";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const FILTER: Record<string, string> = {
  mac: "mac",
  takim: "transfer",
  transfer: "transfer",
  istek: "istek",
  disiplin: "disiplin",
  mesaj: "mesaj",
  diger: "diger",
  okunmamis: "okunmamis",
};

export default function InboxRedirect() {
  const params = useLocalSearchParams<{
    tab?: string | string[];
    filtre?: string | string[];
    kutu?: string | string[];
    durum?: string | string[];
    yeni?: string | string[];
  }>();
  const tab = first(params.tab);
  const filtre = first(params.filtre);
  const durum = first(params.durum);
  const yeni = first(params.yeni);

  if (tab === "mesajlar") {
    if (first(params.kutu) === "basvurular") {
      return (
        <Redirect
          href={{ pathname: "/bildirimler", params: { bolum: "basvurular", ...(durum ? { durum } : {}), ...(yeni ? { yeni } : {}) } }}
        />
      );
    }
    return <Redirect href="/(tabs)/mesajlar" />;
  }
  return <Redirect href={{ pathname: "/bildirimler", params: filtre && FILTER[filtre] ? { filtre: FILTER[filtre] } : {} }} />;
}
