/**
 * PAYLAŞIM TUVALİNİN GEOMETRİSİ — boylar, tasarım birimi, punto yardımcısı.
 *
 * TASARIM BİRİMİ (u): her şablon 360 birim genişliğinde bir tuvale çizilir.
 * Story 360 × 640, Post 360 × 450 birimdir (1080 × 1920 ve 1080 × 1350
 * piksellik çıktının üçte biri). Tuval hangi genişlikte çizilirse çizilsin
 * (stüdyodaki önizleme ~220 px, küçük resim 64 px, yakalama kabı 1080 px)
 * bütün ölçüler `u(n) = n × genişlik / 360` ile ölçeklenir; yani önizleme
 * çıktının BİREBİR küçültülmüş kopyasıdır, ayrı bir yerleşim değildir.
 *
 * NEDEN `type.*` DEĞİL: uygulama tipografi ölçeği bir TELEFON ARAYÜZÜ içindir
 * (tavan 28 / 48 px). Dışa aktarılan afişte skor 1080 px genişlikte 360 px'e
 * kadar çıkar ve punto, tuval genişliğine bağlı olmak zorundadır. Bu yüzden
 * tuvalin kendi ölçeği vardır (aşağıdaki `CANVAS_TYPE`) ve punto daima o
 * ölçekten `font()` ile türetilir. Aileler yine `fonts.*` tokenlarıdır:
 * rakam ve dev başlık Archivo, ad ve etiket Plus Jakarta.
 * (Aynı gerekçe `components/ShareScoreCard.tsx` için denetimde muafiyetle
 * kayıtlıdır; bu modül muafiyete gerek bırakmadan birim üzerinden çalışır.)
 */

import type { TextStyle } from "react-native";
import { fonts } from "@/theme/fonts";

export type ShareFormat = "story" | "post";

export const SHARE_FORMATS: Record<ShareFormat, { label: string; short: string; px: [number, number]; units: [number, number] }> = {
  story: { label: "Story 1080×1920", short: "Story", px: [1080, 1920], units: [360, 640] },
  post: { label: "Post 1080×1350", short: "Post", px: [1080, 1350], units: [360, 450] },
};

/** Tuvalin tasarım genişliği (birim). */
export const BASE_UNITS = 360;

export type Unit = (n: number) => number;

/** Verilen piksel genişliği için birim çevirici. */
export function unitFor(width: number): Unit {
  const k = width / BASE_UNITS;
  return (n: number) => n * k;
}

/** Tuval tipografi ölçeği — birim cinsinden. */
export const CANVAS_TYPE = {
  /** Dev skor (sade şablon). */
  mega: { size: 132, line: 0.9, family: fonts.bold, track: -6 },
  /** Afiş başlığı ("MAÇ GÜNÜ"). */
  poster: { size: 64, line: 1.0, family: fonts.bold, track: -2.6 },
  /** Büyük skor / sayı. */
  score: { size: 84, line: 0.92, family: fonts.bold, track: -3.4 },
  /** Bölüm başlığı ("PUAN DURUMU"). */
  title: { size: 30, line: 1, family: fonts.bold, track: -1 },
  /** Kahraman adı (oyuncu / takım). */
  hero: { size: 26, line: 1.06, family: fonts.heading, track: -0.8 },
  /** Takım adı (maç kartı). */
  name: { size: 15, line: 1.14, family: fonts.heading, track: -0.2 },
  /** Satır adı (tablo). */
  row: { size: 11.5, line: 1.2, family: fonts.semibold, track: -0.1 },
  /** Satır rakamı. */
  num: { size: 11.5, line: 1.2, family: fonts.display, track: 0 },
  /** Kalın rakam (puan, değer). */
  numStrong: { size: 13, line: 1.15, family: fonts.bold, track: -0.2 },
  /** Gövde / meta. */
  body: { size: 10.5, line: 1.3, family: fonts.semibold, track: 0 },
  /** Büyük harf etiket. */
  label: { size: 8, line: 1.2, family: fonts.heading, track: 1.4 },
  /** En küçük etiket (tablo başlığı). */
  micro: { size: 6.5, line: 1.2, family: fonts.heading, track: 1.1 },
} as const;

export type CanvasTypeKey = keyof typeof CANVAS_TYPE;

/**
 * Tuval puntosu. `scale` ile tokenın büyüklüğü oynatılır (ör. uzun ad
 * küçültmesi); satır yüksekliği ve harf aralığı orantılı kalır.
 */
export function font(u: Unit, key: CanvasTypeKey, scale = 1): TextStyle {
  const token = CANVAS_TYPE[key];
  const size = token.size * scale;
  return {
    fontSize: u(size),
    lineHeight: u(size * token.line),
    fontFamily: token.family,
    letterSpacing: u(token.track * scale),
    includeFontPadding: false,
    ...(key === "num" || key === "numStrong" || key === "score" || key === "mega"
      ? { fontVariant: ["tabular-nums" as const] }
      : null),
  };
}

/**
 * Uzun ad küçültmesi — kırpmak yerine punto düşer.
 *
 * `room` o puntoda tek satıra (ya da `lines` satıra) sığan karakter sayısıdır.
 * Ad bundan uzunsa punto oranla iner, `min` altına inmez. Çağıran ayrıca
 * `numberOfLines={lines}` verir; böylece hem satır kırılır hem punto düşer,
 * üç nokta görülmez.
 */
export function fitScale(text: string | null | undefined, room: number, min = 0.62, lines = 1): number {
  const value = String(text ?? "").trim();
  if (!value) return 1;
  if (lines > 1) {
    // Satır başına sığan karakter; en uzun kelime de tek satıra sığmalı.
    const longestWord = value.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
    const perLine = room;
    const needLines = Math.ceil(value.length / perLine);
    const byLines = needLines <= lines ? 1 : (perLine * lines) / value.length;
    const byWord = longestWord <= perLine ? 1 : perLine / longestWord;
    return Math.max(min, Math.min(1, byLines * 1.04, byWord));
  }
  return value.length <= room ? 1 : Math.max(min, room / value.length);
}
