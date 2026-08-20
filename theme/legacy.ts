/**
 * Geriye dönük uyumluluk katmanı — eski token adları yeni değerlere bağlanır.
 *
 * NEDEN: kod tabanında 58 dosyada ~1542 adet `colors.*` kullanımı var. Hepsini
 * tek seferde yeniden yazmak hem riskli hem gereksiz; palet nesnesine takma ad
 * alanları eklendiğinde eski adlar yeni renklere işaret eder ve tüm ekranlar
 * derlenmeye devam ederken renkler ANINDA iyileşir.
 *
 * KADEMELİ GEÇİŞ: bir ekran elden geçirildiğinde eski adlar yenileriyle
 * değiştirilir (colors.line → colors.textPrimary gibi). Tüm ekranlar geçtiğinde
 * bu dosya silinir; `withLegacy` çağrısı `theme/index.ts` içinden kaldırılır.
 *
 * AD ÇAKIŞMASI: eski `pitch` ekran zemini anlamına geliyordu, yeni palette
 * `pitch` saha grafiğinin yeşilidir. Bu katmanda ESKİ anlam kazanır (geriye
 * uyumluluk şart); yeni saha yeşiline `pitchGreen` adıyla erişilir.
 */

import type { Palette } from "./palette";

/** Eski `constants/theme.ts` renk anahtarları. */
export interface LegacyAliases {
  pitch: string;
  surface: string;
  surfaceRaised: string;
  turf: string;
  turfDim: string;
  live: string;
  yellow: string;
  red: string;
  line: string;
  muted: string;
  faint: string;
  green: string;
  goldDim: string;
}

/**
 * Takma ad çakışması yüzünden erişilemez kalan yeni tokenların kurtarma adları.
 * Legacy katmanı kalktığında bunlar da kalkar.
 */
export interface LegacyExtras {
  /** Saha grafiği yeşili — eski `pitch` (ekran zemini) adı üstünü örttüğü için. */
  pitchGreen: string;
}

/** Palete eski adları ekler; yeni adların hepsi de erişilebilir kalır. */
export function withLegacy(p: Palette): Palette & LegacyAliases & LegacyExtras {
  return {
    ...p,
    pitchGreen:    p.pitch,         // yeni saha yeşili, çakışmayan adla
    pitch:         p.bg,            // eski "pitch" = ekran zemini
    surface:       p.surface1,
    surfaceRaised: p.surface2,
    turf:          p.brandAccent,
    turfDim:       p.brandDim,
    yellow:        p.warn,
    red:           p.danger,
    line:          p.textPrimary,
    muted:         p.textSecondary,
    faint:         p.border,
    green:         p.win,
    goldDim:       p.warnDim,
  };
}

/** Eski adlar dâhil tam renk sözlüğünün tipi. */
export type LegacyPalette = Palette & LegacyAliases & LegacyExtras;
