/**
 * Puan tablosu bölgeleri (şampiyonluk / play-off / düşme).
 *
 * Bölge bilgisi ligden gelmeli; gelmiyorsa takım sayısına göre türetilir.
 * Görsel karşılığı satırın SOL KENARINDA 3px dikey raydır (SofaScore/Maçkolik
 * kalıbı) — satır zemini boyanmaz, çünkü boyalı satır tabloyu okunmaz yapar ve
 * renk körü kullanıcı için tek başına anlam taşımaz (sıra numarası zaten var).
 */

import type { Palette } from "./palette";

export type StandingZone =
  | "champion"
  | "promotion"
  | "playoff"
  | "relegationPlayoff"
  | "relegation"
  | "none";

export interface ZoneRule {
  from: number;
  to: number;
  zone: StandingZone;
}

/** Sunucu kural vermezse: 1 şampiyon, 2–3 play-off, son 2 düşme. */
export function defaultZoneRules(teamCount: number): ZoneRule[] {
  return [
    { from: 1, to: 1, zone: "champion" },
    { from: 2, to: Math.min(3, teamCount), zone: "playoff" },
    { from: Math.max(teamCount - 1, 2), to: teamCount, zone: "relegation" },
  ];
}

/** Bölgenin ray rengi; "none" için null (ray çizilmez). */
export function zoneColor(p: Palette, zone: StandingZone): string | null {
  switch (zone) {
    case "champion":          return p.zoneChampion;
    case "promotion":         return p.zonePromotion;
    case "playoff":           return p.zonePlayoff;
    case "relegationPlayoff": return p.zoneRelegationPlayoff;
    case "relegation":        return p.zoneRelegation;
    default:                  return null;
  }
}

/** Sıra numarasına düşen bölgeyi bulur; kural yoksa "none". */
export function zoneForRank(rank: number, rules: ZoneRule[]): StandingZone {
  for (const rule of rules) {
    if (rank >= rule.from && rank <= rule.to) return rule.zone;
  }
  return "none";
}

/** Ekran okuyucu ve açıklama satırı için Türkçe bölge adı. */
export function zoneLabel(zone: StandingZone): string | null {
  switch (zone) {
    case "champion":          return "Şampiyon";
    case "promotion":         return "Yükselme";
    case "playoff":           return "Play-off";
    case "relegationPlayoff": return "Düşme play-off";
    case "relegation":        return "Düşme hattı";
    default:                  return null;
  }
}
