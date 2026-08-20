/**
 * Türkiye il haritası — sitedeki "Haritada şehirleri keşfet" görselinin mobil
 * karşılığı: sönük iller ince çizgilerle ayrılır, aktif lig verisi olan
 * şehirlerin İLİN TAMAMI mor dolgulu görünür, seçili il daha koyu morla
 * vurgulanır ve çizgisi kalınlaşır.
 *
 * Eşleştirme il id'sine göredir (turkey-map-react verisi: "ankara",
 * "istanbul"...); API'nin şehir etiketi küçük harfe çevrilip aranır.
 *
 * TOKEN GEÇİŞİ: dört sabit hex (#8B5CF6 / #DFDDE9 …) kaldırıldı, dolgular
 * paletten geliyor. Seçili il artık HER İKİ TEMADA da aktiften koyudur:
 * `brandAccent` (aktif) → `brandStrong` (seçili). Eskiden seçili renk
 * `colors.turf`tu ve koyu temada aktiften AÇIK kalıyordu — dosyanın kendi
 * yorumuyla çelişen bu durum düzeltildi.
 *
 * NEDEN `Touchable` DEĞİL: basılabilir öğe bir SVG `Path` — bir View değil, bir
 * vektör şekli. `Touchable` ile sarılamaz (dikdörtgen bir kutuya dönerdi ve
 * komşu iller birbirinin dokunma alanını yerdi); dokunma react-native-svg'nin
 * kendi `onPress`iyle, ilin GERÇEK sınırları içinde çözülür.
 */

import Svg, { Path } from "react-native-svg";
import { colors } from "@/theme";
import { PROVINCES } from "@/components/turkeyProvinces";
import type { MetaOption } from "@/lib/types";

const keyOf = (label: string) => label.trim().toLocaleLowerCase("tr-TR");

/** Aktif ama seçili olmayan il — okunur marka moru. */
const ACTIVE_FILL = colors.brandAccent;
/** Seçili il — aktifin bir tık koyusu. */
const SELECTED_FILL = colors.brandStrong;
/** Pasif il — sönük yüzey; sınırlar `borderStrong` ile çizilir. */
const IDLE_FILL = colors.surface3;

export function TurkeyMap({
  cities,
  selectedId,
  onSelect,
}: {
  cities: MetaOption[];
  selectedId: number | null;
  onSelect: (cityId: number) => void;
}) {
  const activeByProvince = new Map<string, MetaOption>();
  for (const city of cities) activeByProvince.set(keyOf(city.label), city);

  return (
    <Svg viewBox="16 138 1020 458" width="100%" height={210}>
      {PROVINCES.map((province) => {
        const city = activeByProvince.get(province.id);
        const selected = city != null && city.id === selectedId;
        return (
          <Path
            key={province.id}
            d={province.d}
            fill={selected ? SELECTED_FILL : city ? ACTIVE_FILL : IDLE_FILL}
            stroke={colors.borderStrong}
            strokeWidth={selected ? 2.5 : 1.2}
            onPress={city ? () => onSelect(city.id) : undefined}
          />
        );
      })}
    </Svg>
  );
}
