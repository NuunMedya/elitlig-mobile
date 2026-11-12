/**
 * Dönem şeridi — Bu hafta · Bu ay · Tüm zamanlar · Tarih aralığı.
 *
 * "Tarih aralığı" seçilince takvim sayfası açılır; aralık seçiliyken çip
 * etiketi aralığın kendisidir ("3–9 Kas") ve tekrar dokununca takvim yeniden
 * açılır. Dört seçenek bir segmente sığmadığı için çip şerididir.
 */

import { useState } from "react";

import { Chip, ChipGroup } from "@/components/ui";
import { PERIOD_OPTIONS, formatRange, type BoardPeriod, type DayRange, type PeriodValue } from "@/lib/leaderboard";

import { DateRangeSheet } from "./DateRangeSheet";

export function PeriodBar({
  value,
  onChange,
  options = PERIOD_OPTIONS.map((item) => item.key),
}: {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  /** Gösterilecek dönemler (sıra PERIOD_OPTIONS'tan). */
  options?: BoardPeriod[];
}) {
  const [sheet, setSheet] = useState(false);

  const apply = (range: DayRange) => {
    setSheet(false);
    onChange({ period: "range", range });
  };

  return (
    <>
      <ChipGroup>
        {PERIOD_OPTIONS.filter((item) => options.includes(item.key)).map((item) => {
          const selected = value.period === item.key;
          const isRange = item.key === "range";
          return (
            <Chip
              key={item.key}
              size="sm"
              label={isRange && selected && value.range ? formatRange(value.range) : item.label}
              icon={isRange ? "calendar-outline" : undefined}
              selected={selected}
              onPress={() => (isRange ? setSheet(true) : onChange({ period: item.key }))}
            />
          );
        })}
      </ChipGroup>
      <DateRangeSheet
        visible={sheet}
        initial={value.period === "range" ? value.range : null}
        onClose={() => setSheet(false)}
        onApply={apply}
      />
    </>
  );
}
