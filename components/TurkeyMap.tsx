import Svg, { Path } from "react-native-svg";
import { colors } from "@/constants/theme";
import { PROVINCES } from "@/components/turkeyProvinces";
import type { MetaOption } from "@/lib/types";

/**
 * Türkiye il haritası — sitedeki "Haritada şehirleri keşfet" görselinin
 * birebir mobil karşılığı: gri iller ince çizgilerle ayrılır, aktif lig
 * verisi olan şehirlerin İLİN TAMAMI mor dolgulu görünür, seçili şehir
 * daha koyu morla vurgulanır.
 *
 * Eşleştirme il id'sine göredir (turkey-map-react verisi: "ankara",
 * "istanbul"...); API'nin şehir etiketi küçük harfe çevrilip aranır.
 */

const keyOf = (label: string) => label.trim().toLocaleLowerCase("tr-TR");

/** Aktif ama seçili olmayan il — sitenin parlak moru. */
const ACTIVE_FILL = "#8B5CF6";
/** Seçili il — koyu marka moru. */
const SELECTED_FILL = colors.turf;
/** Pasif il — gri zemin, beyaz sınır çizgileri. */
const IDLE_FILL = "#DFDDE9";

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
            stroke={colors.surface}
            strokeWidth={selected ? 2.5 : 1.2}
            onPress={city ? () => onSelect(city.id) : undefined}
          />
        );
      })}
    </Svg>
  );
}
