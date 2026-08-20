/**
 * ESKİ KAPI — `components/ui/ScreenHeader` üzerine ince uyumluluk katmanı.
 *
 * NEDEN DURUYOR: `ScreenHeader` ve `DetailHeader` adları geçiş öncesi yazılmış
 * ekranlarda hâlâ içe aktarılıyor. Bu dosya artık kendi başlığını ÇİZMEZ;
 * yalnız eski prop imzalarını (`{ title, right }` ve `{ title, subtitle }`)
 * yeni bileşenin imzasına çevirir. Böylece daralma animasyonu, erişilebilirlik
 * ve ölçüler tek yerde — `components/ui/ScreenHeader.tsx` içinde — yaşar.
 *
 * İKİ BİLİNÇLİ FARK:
 *  1. TEMA DÜĞMESİ KALDIRILDI. Her ekranın köşesinde duran güneş/ay düğmesi
 *     görsel gürültüdür ve günde bir kez kullanılır; yeri Ayarlar ekranıdır
 *     (§4.27). Düğmenin kendisi `lib/themeToggle.ts` ile hâlâ çalışıyor.
 *  2. "MAÇ ALMA" DÜĞMESİ KALDI. O bir tema tercihi değil, ticari bir eylem —
 *     başlıktaki yerini koruyor ve `right` düğümünün sağına yerleşiyor.
 *
 * NEDEN `right` MUTLAK KONUMLU: yeni başlık serbest bir sağ düğüm slotu almaz,
 * yalnız ikon tanımı (`actions`) alır — eski çağıranlar ise oraya keyfi JSX
 * veriyor. Bu yüzden düğüm, başlığın üst şeridi (48px) hizasında mutlak
 * konumla serilir; `pointerEvents="box-none"` sayesinde şeridin boş kısmı
 * altındaki başlığa dokunuşları engellemez.
 *
 * YENİ KOD BU DOSYAYI KULLANMAZ:
 *   import { ScreenHeader, useHeaderScroll } from "@/components/ui";
 * Son çağıran da geçtiğinde bu dosya silinecek.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { ScreenHeader as UIScreenHeader } from "@/components/ui";
import { CallCenterButton } from "@/components/CallCenterButton";
import { layout, space } from "@/theme";

/** Sekme ekranlarının tepesi: marka üst satırı + sayfa adı. */
export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View>
      <UIScreenHeader title={title} overline="ELİTLİG" />
      <View pointerEvents="box-none" style={styles.rightSlot}>
        {right}
        <CallCenterButton />
      </View>
    </View>
  );
}

/** Detay ekranlarının tepesi: geri düğmesi + başlık (+ alt başlık). */
export function DetailHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <UIScreenHeader title={title} subtitle={subtitle} back />;
}

const styles = StyleSheet.create({
  /** Yeni başlığın üst şeridiyle aynı yükseklik — eylemler o şeride oturur. */
  rightSlot: {
    position: "absolute",
    top: 0,
    right: space.sm,
    height: layout.headerHeightCollapsed,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
});
