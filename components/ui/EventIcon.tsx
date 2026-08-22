/**
 * EventIcon — maç olaylarının ikon sözlüğü, tamamı inline SVG.
 *
 * NEDEN İKON SETİ DEĞİL: Ionicons'ta futbol topu var ama SARI KART yok; en
 * yakını yuvarlak köşeli genel bir kare. Kart, futbolda dikey ve keskin
 * köşelidir; yuvarlatılınca "kart" olmaktan çıkar. Bir olay ailesinin yarısını
 * hazır setten, yarısını elle çizmek iki farklı çizgi kalınlığı ve iki farklı
 * optik ağırlık demek — zaman tünelinde bu, satırların hizasız görünmesine yol
 * açıyordu. Altı olayın altısı da burada, aynı ızgarada, aynı kalınlıkta.
 *
 * EMOJİ KESİNLİKLE YOK: emoji cihazın yazı tipine göre değişir, renk
 * tokenlarına uymaz, ekran okuyucuda "yüz" diye okunur.
 *
 * IZGARA: her ikon 16×16 kutuya çizilir ve `size` ile ölçeklenir; böylece
 * hepsi aynı optik ağırlıkta durur. Çizgi kalınlığı 1.5, dolgu gerektiren
 * ikonlar (kart) dolu çizilir.
 *
 * RENK: `tone` verilmezse olay tipinin anlamı renk verir (gol kazanır yeşili
 * değil MÜREKKEP — gol zaten kartla vurgulanıyor; kartlar kendi renkleri).
 */

import { memo } from "react";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { colors } from "@/theme";
import type { EventKind } from "@/lib/match";

/** Zaman tünelinde çizilen olay aileleri (EventKind + asist). */
export type EventIconKind = EventKind | "assist" | "var";

export interface EventIconProps {
  kind: EventIconKind;
  /** Varsayılan 15 — 12px dakika metniyle aynı optik ağırlıkta durur. */
  size?: number;
  /** Rengi elle vermek için; verilmezse olay tipinden gelir. */
  color?: string;
  /**
   * Mürekkep blok (maç skoru şeridi, saha) üstünde mi çiziliyor.
   * Nötr tonlar (gol topu, değişiklik oku) burada mürekkep değil BEYAZ olur;
   * kart renkleri iki zeminde de kendi rengini korur.
   */
  onDark?: boolean;
}

/** Olay tipinin varsayılan rengi. */
function toneFor(kind: EventIconKind, onDark: boolean): string {
  switch (kind) {
    case "yellow":
      return colors.yellowCard;
    case "red":
      return colors.redCard;
    case "ownGoal":
      return colors.live;
    case "substitution":
      return onDark ? colors.onDarkMuted : colors.textTertiary;
    case "assist":
      return onDark ? colors.onDarkMuted : colors.accent;
    default:
      return onDark ? colors.onDark : colors.textPrimary;
  }
}

export const EventIcon = memo(function EventIcon({
  kind,
  size = 15,
  color,
  onDark = false,
}: EventIconProps) {
  const stroke = color ?? toneFor(kind, onDark);
  const sw = 1.5;

  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      {renderKind(kind, stroke, sw)}
    </Svg>
  );
});

function renderKind(kind: EventIconKind, c: string, sw: number) {
  switch (kind) {
    /* Top: daire + beşgen panel. Dolu daire "nokta"ya benziyordu; panel
       çizgileri onu tartışmasız bir futbol topu yapıyor. */
    case "goal":
    case "ownGoal":
      return (
        <G>
          <Circle cx="8" cy="8" r="6" stroke={c} strokeWidth={sw} fill="none" />
          <Path
            d="M8 4.6 L10.6 6.5 L9.6 9.6 L6.4 9.6 L5.4 6.5 Z"
            stroke={c}
            strokeWidth={sw * 0.8}
            strokeLinejoin="round"
            fill="none"
          />
        </G>
      );

    /* Kart: DİKEY, keskin köşeli, dolu dikdörtgen. Futbolun en tanınır
       işareti; yuvarlatmak ya da yatay çizmek onu kart olmaktan çıkarır. */
    case "yellow":
    case "red":
      return <Rect x="5" y="2.5" width="6" height="11" rx="0.5" fill={c} />;

    /* Değişiklik: iki yönlü ok. Giren üstte sağa, çıkan altta sola. */
    case "substitution":
      return (
        <G stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M2.5 5.5 H11" />
          <Path d="M9 3.5 L11 5.5 L9 7.5" />
          <Path d="M13.5 10.5 H5" />
          <Path d="M7 8.5 L5 10.5 L7 12.5" />
        </G>
      );

    /* Asist: ince tek ok — golü hazırlayan hareket. */
    case "assist":
      return (
        <G stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M2.5 11 C 5.5 5, 9.5 4, 13 4.5" />
          <Path d="M10.5 2.5 L13.2 4.5 L11.5 7" />
        </G>
      );

    /* VAR: kare ekran çerçevesi. */
    case "var":
      return (
        <G stroke={c} strokeWidth={sw} strokeLinejoin="round" fill="none">
          <Rect x="2.5" y="3.5" width="11" height="9" rx="1" />
          <Path d="M6 13.5 H10" strokeLinecap="round" />
        </G>
      );

    /* Tanınmayan olay: içi boş küçük daire — bir şey oldu ama ne olduğu
       kodlanmamış. Boş bırakmak satırın hizasını bozardı. */
    default:
      return <Circle cx="8" cy="8" r="3.5" stroke={c} strokeWidth={sw} fill="none" />;
  }
}
