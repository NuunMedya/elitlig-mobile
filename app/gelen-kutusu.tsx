/**
 * /gelen-kutusu — ESKİ ROTA, yönlendirme.
 *
 * Gelen kutusu (Bildirimler | Mesajlar) alt menüdeki MESAJLAR sekmesine
 * taşındı (app/(tabs)/mesajlar.tsx): içerik türüne göre kutular. Eski
 * parametreler kutuya çevrilir:
 *   · tab=bildirimler&filtre=<kategori> → o kategorinin kutusu (takim → transfer,
 *     mesaj → yonetim, okunmamis → Tümü + okunmamış süzgeci)
 *   · tab=mesajlar&kutu=sohbetler|basvurular → sohbetler | yonetim
 *     (`durum`, `yeni` korunur)
 */

import { Redirect, useLocalSearchParams } from "expo-router";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const FILTER_BOX: Record<string, string> = {
  mac: "mac",
  takim: "transfer",
  transfer: "transfer",
  istek: "istekler",
  disiplin: "disiplin",
  mesaj: "yonetim",
  diger: "diger",
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

  let next: Record<string, string>;
  if (tab === "mesajlar") {
    next =
      first(params.kutu) === "basvurular"
        ? { kutu: "yonetim", ...(durum ? { durum } : {}), ...(yeni ? { yeni } : {}) }
        : { kutu: "sohbetler" };
  } else if (filtre && FILTER_BOX[filtre]) {
    next = { kutu: FILTER_BOX[filtre] };
  } else if (filtre === "okunmamis") {
    next = { kutu: "bildirimler", filtre };
  } else {
    next = { kutu: tab === "bildirimler" ? "bildirimler" : "ozet" };
  }

  return <Redirect href={{ pathname: "/(tabs)/mesajlar", params: next }} />;
}
