/**
 * Oyuncu sayfalarının ortak küçük yardımcıları ve yüzey stilleri.
 *
 * NEDEN AYRI DOSYA: `/oyuncu/[id]` (herkese açık profil) ile `/oyuncum`
 * (üyenin kendi paneli) aynı görsel dili konuşur — aynı kimlik sahnesi, aynı
 * maç satırı, aynı kart yüzeyi. Bu parçalar iki ekranda ayrı ayrı
 * kopyalanınca ilk düzeltmede birbirinden kopuyordu; burada tek yerde durur.
 */

import { StyleSheet } from "react-native";
import { formatDateShort } from "@/lib/format";
import { colors, dark, elevate, radius, ratingColors, space } from "@/theme";

/** Grup içi konum — köşe yuvarlaması ve ayraç buradan gelir. */
export type RowPosition = "single" | "first" | "middle" | "last";

export function rowPosition(index: number, total: number): RowPosition {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Sayıya güvenli çeviri: sürücü DECIMAL'i dize döndürebiliyor ("6.92"). */
export const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * SAHNE ÜSTÜNDEKİ REYTİNG RENGİ — sahne iki temada da koyu olduğu için
 * reyting tonu daima koyu temanın (açık tonlu) sürümünden okunur; açık
 * temanın koyu yeşili grafit zeminde kaybolurdu. `onDark` kuralıyla aynı.
 */
export function stageRatingColor(value: number | null | undefined): string {
  return ratingColors(dark, value).fg;
}

/** Ondalığı Türkçe yazar: 1.55 → "1,55". Rakam kahramandır, nokta değil virgül. */
export function decimalTR(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

/**
 * Yıllı kısa tarih: "1 Mar 2026". Kariyer geçişleri ve sözleşmeler yıllara
 * yayılır; yılsız "1 Mar → 1 Mar" hangi yıl olduğunu söylemiyordu. Yıl dizeden
 * okunur (saat dilimi kaydırmasın).
 */
export function dateWithYear(value: string | null | undefined): string {
  if (!value) return "";
  const short = formatDateShort(value);
  const year = String(value).match(/^(\d{4})-/)?.[1];
  return year && short ? `${short} ${year}` : short;
}

/**
 * Ortak kart yüzeyi (Arena §2): beyaz kart, hairline kenar, 1. seviye gölge.
 * `Card` bileşeni başlık ve dolgu dayattığı için, iç düzenini kendisi kuran
 * bloklar (form şeridi, tablo, zaman çizelgesi) bu stili doğrudan kullanır.
 */
export const surfaces = StyleSheet.create({
  /* `overflow: hidden` YOK: iOS'ta gölgeyi de kırpar. Köşeye değen iç
     zeminler (tablo başlığı gibi) kendi köşe yarıçapını taşır. */
  card: {
    ...elevate(1),
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
  },
  cardPadded: {
    ...elevate(1),
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    padding: space.lg,
  },
});
