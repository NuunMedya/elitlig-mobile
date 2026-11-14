/**
 * Taraftar figürü — react-native-svg (64×72 görünüm kutusu, büst çizimi).
 *
 * 2026-11 YENİLEMESİ: taraftar tezgâhın arkasından görünen bir büsttür —
 * büyük, ifadeli baş; boynunda takım atkısı (iki renk şerit + püskül);
 * yakalı forma (düz / çubuklu / kuşak / bölünmüş). Koyu kontur, yanak
 * allığı, beyazlı gözler: küçük boyda da yüz ifadesi okunur.
 *
 * YÜZ İFADESİ sabra göre: sevinç (gözler kapalı, ağız açık) → mutlu →
 * idare eder → tedirgin (ter damlası) → kızgın (kaşlar çatık, kızarık yüz).
 * VIP taraftar altın atkı, güneş gözlüğü ve yıldız rozeti taşır.
 */

import React, { memo } from "react";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from "react-native-svg";

import {
  kantinCheek,
  kantinFaceInk as INK,
  kantinHair,
  kantinJerseys,
  kantinMouth,
  kantinOutline as O,
  kantinScene as S,
  kantinSkinShade,
  kantinSkins,
  kantinTongue,
} from "@/lib/puzzle/kantinPalette";

export type FanMood = "joy" | "happy" | "ok" | "worried" | "angry";

const SW = 2.2;
/** Başın merkezi ve yarıçapı (görünüm kutusu birimi). */
const HX = 32;
const HY = 27;
const HR = 15.5;

/** Saç / başlık — başın üstüne oturur. */
function Hair({ kind, color, cap, trim }: { kind: number; color: string; cap: string; trim: string }) {
  switch (kind % 6) {
    case 0:
      // Kısa, yana taranmış.
      return <Path d="M16.5 27 Q15 11 32 10.5 Q47 11 47.5 25 Q42 17 34 19 Q26 15.5 16.5 27 Z" fill={color} stroke={O} strokeWidth={SW} strokeLinejoin="round" />;
    case 1:
      // Kıvırcık.
      return (
        <G fill={color} stroke={O} strokeWidth={SW}>
          <Circle cx={20} cy={19} r={5} />
          <Circle cx={26} cy={14} r={5.5} />
          <Circle cx={33} cy={12.5} r={5.5} />
          <Circle cx={40} cy={14.5} r={5.2} />
          <Circle cx={45} cy={20} r={4.4} />
        </G>
      );
    case 2:
      // Atkuyruğu.
      return (
        <G>
          <Path d="M45 22 Q54 26 51 38 Q48 31 44 30 Z" fill={color} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
          <Path d="M16.5 28 Q16 13 32 11.5 Q48 13 47.5 28 Q44 19 32 18.5 Q20 19 16.5 28 Z" fill={color} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
        </G>
      );
    case 3:
      // Takım beresi (ponponlu).
      return (
        <G>
          <Circle cx={32} cy={6} r={4} fill={trim} stroke={O} strokeWidth={SW} />
          <Path d="M15.5 25 Q15 8.5 32 8.5 Q49 8.5 48.5 25 Z" fill={cap} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
          <Rect x={14.5} y={21} width={35} height={6} rx={3} fill={trim} stroke={O} strokeWidth={SW} />
        </G>
      );
    case 4:
      // Uzun saç.
      return <Path d="M15.5 36 Q13 11 32 10.5 Q51 11 48.5 36 Q47 24 43 20 Q32 23 21 20 Q17 24 15.5 36 Z" fill={color} stroke={O} strokeWidth={SW} strokeLinejoin="round" />;
    default:
      // Kasket — siperli, forma renginde.
      return (
        <G>
          <Path d="M38 22 Q52 21 55 24.5 Q50 27.5 38 26 Z" fill={trim} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
          <Path d="M16 24.5 Q16 9.5 32 9.5 Q48 9.5 48 24.5 Z" fill={cap} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
          <Circle cx={32} cy={10} r={1.8} fill={trim} />
        </G>
      );
  }
}

/** Beyazlı göz + bebek; `look` bebeğin yana kayması. */
function Eye({ x, y, look = 0 }: { x: number; y: number; look?: number }) {
  return (
    <G>
      <Ellipse cx={x} cy={y} rx={3} ry={3.4} fill={S.white} stroke={INK} strokeWidth={1.2} />
      <Circle cx={x + look} cy={y + 0.4} r={1.7} fill={INK} />
      <Circle cx={x + look + 0.6} cy={y - 0.4} r={0.6} fill={S.white} />
    </G>
  );
}

function Face({ mood, vip }: { mood: FanMood; vip: boolean }) {
  const ey = 27.5;
  const eyes =
    vip && mood !== "angry" ? (
      // VIP güneş gözlüğü.
      <G>
        <Path d="M20 24.5 H30 Q30 31 25 31 Q20 31 20 24.5 Z" fill={INK} />
        <Path d="M34 24.5 H44 Q44 31 39 31 Q34 31 34 24.5 Z" fill={INK} />
        <Path d="M30 25.5 H34" stroke={INK} strokeWidth={1.6} />
        <Path d="M22 26 L24.5 26" stroke={S.white} strokeWidth={1.2} strokeLinecap="round" opacity={0.7} />
      </G>
    ) : mood === "joy" ? (
      <G>
        <Path d="M22 28 Q25 24.5 28 28" stroke={INK} strokeWidth={1.8} strokeLinecap="round" fill="none" />
        <Path d="M36 28 Q39 24.5 42 28" stroke={INK} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      </G>
    ) : (
      <G>
        <Eye x={25} y={ey} look={mood === "worried" ? -0.6 : 0.4} />
        <Eye x={39} y={ey} look={mood === "worried" ? -0.6 : 0.4} />
      </G>
    );

  const brows =
    mood === "angry" ? (
      <G>
        <Path d="M20.5 21.5 L28.5 24" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
        <Path d="M43.5 21.5 L35.5 24" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      </G>
    ) : mood === "worried" ? (
      <G>
        <Path d="M21.5 22.5 L28 21" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <Path d="M42.5 22.5 L36 21" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
      </G>
    ) : vip ? null : (
      <G>
        <Path d="M21.5 21.5 Q25 19.5 28.5 21" stroke={INK} strokeWidth={1.6} strokeLinecap="round" fill="none" />
        <Path d="M35.5 21 Q39 19.5 42.5 21.5" stroke={INK} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      </G>
    );

  const mouth =
    mood === "joy" ? (
      <G>
        <Path d="M25 34 Q32 44 39 34 Z" fill={kantinMouth} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
        <Path d="M28.5 38.5 Q32 41 35.5 38.5 Q32 37 28.5 38.5 Z" fill={kantinTongue} />
      </G>
    ) : mood === "happy" ? (
      <Path d="M26.5 34.5 Q32 39.5 37.5 34.5" stroke={INK} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    ) : mood === "ok" ? (
      <Path d="M28 36 Q32 37.5 36 36" stroke={INK} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    ) : mood === "worried" ? (
      <Path d="M27.5 37.5 Q30 35 32 36.5 Q34 38 36.5 35.5" stroke={INK} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    ) : (
      <Path d="M27 38.5 Q32 33.5 37 38.5 Z" fill={kantinMouth} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
    );

  return (
    <G>
      {mood === "angry" ? <Ellipse cx={HX} cy={HY + 3} rx={HR - 2} ry={HR - 4} fill={S.danger} opacity={0.22} /> : null}
      {mood !== "angry" ? (
        <G>
          <Ellipse cx={21} cy={33} rx={3.2} ry={2} fill={kantinCheek} />
          <Ellipse cx={43} cy={33} rx={3.2} ry={2} fill={kantinCheek} />
        </G>
      ) : null}
      {brows}
      {eyes}
      {mouth}
      {mood === "worried" ? (
        <Path d="M46.5 17 Q49.5 22 46.5 23.5 Q43.5 22 46.5 17 Z" fill={S.white} stroke={INK} strokeWidth={1} opacity={0.95} />
      ) : null}
      {mood === "angry" ? (
        <Path d="M46 10 L49 13 M50 8 L50 12.5 M53.5 11 L50.5 13.5" stroke={S.danger} strokeWidth={2} strokeLinecap="round" />
      ) : null}
    </G>
  );
}

function Shirt({ jersey, id }: { jersey: (typeof kantinJerseys)[number]; id: string }) {
  const body = "M5 72 Q5 52 20 47 H44 Q59 52 59 72 Z";
  return (
    <G>
      <Defs>
        <ClipPath id={id}>
          <Path d={body} />
        </ClipPath>
      </Defs>
      <Path d={body} fill={jersey.body} />
      <G clipPath={`url(#${id})`}>
        {jersey.style === "stripes" ? (
          <G fill={jersey.trim}>
            <Rect x={14} y={44} width={6} height={30} />
            <Rect x={29} y={44} width={6} height={30} />
            <Rect x={44} y={44} width={6} height={30} />
          </G>
        ) : null}
        {jersey.style === "sash" ? <Path d="M4 56 L14 46 L62 70 L58 76 Z" fill={jersey.trim} /> : null}
        {jersey.style === "half" ? <Rect x={32} y={44} width={30} height={30} fill={jersey.trim} /> : null}
        {/* yan gölge */}
        <Path d="M46 50 Q57 55 59 72 H50 Q50 58 46 50 Z" fill={O} opacity={0.14} />
        <Path d="M10 58 Q13 51 19 49" stroke={S.white} strokeOpacity={0.35} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      </G>
      <Path d={body} fill="none" stroke={O} strokeWidth={SW} strokeLinejoin="round" />
    </G>
  );
}

/** Atkı: boyna sarılı iki renkli şerit + önden sarkan püsküllü uç. */
function Scarf({ a, b, vip }: { a: string; b: string; vip: boolean }) {
  const c1 = vip ? S.vip : a;
  const c2 = vip ? S.white : b;
  return (
    <G>
      {/* sarkan uç */}
      <Path d="M36 50 L44 50 L46 66 L38 66 Z" fill={c1} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M36.6 55 L44.6 55 M37.2 60 L45.2 60" stroke={c2} strokeWidth={2.6} />
      <Path d="M38.5 66 V70 M41 66 V70.5 M43.5 66 V70" stroke={c1} strokeWidth={1.6} strokeLinecap="round" />
      {/* boyun sarımı */}
      <Path d="M18 44 Q32 52 46 44 L47 50 Q32 59 17 50 Z" fill={c1} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M23 47.5 L25 53 M31 49 L31.5 55 M39 48 L38 54" stroke={c2} strokeWidth={3} strokeLinecap="round" />
      {vip ? (
        <G>
          <Circle cx={22} cy={60} r={4.6} fill={S.vip} stroke={O} strokeWidth={1.6} />
          <Path d="M22 56.8 L23 59.2 L25.4 59.4 L23.6 61 L24.1 63.4 L22 62.1 L19.9 63.4 L20.4 61 L18.6 59.4 L21 59.2 Z" fill={S.white} />
        </G>
      ) : null}
    </G>
  );
}

let clipSeq = 0;

export const FanFigure = memo(function FanFigure({
  size,
  jersey,
  face,
  mood,
  vip,
}: {
  size: number;
  jersey: number;
  face: number;
  mood: FanMood;
  vip: boolean;
}) {
  const j = kantinJerseys[jersey % kantinJerseys.length];
  const skinIdx = face % kantinSkins.length;
  const skin = kantinSkins[skinIdx];
  const shade = kantinSkinShade[skinIdx];
  const hair = kantinHair[(face * 7 + jersey) % kantinHair.length];
  // Her örnek kendi kırpma kimliğini taşır (aynı sahnede çok figür var).
  const clipId = React.useMemo(() => `kfan${(clipSeq += 1)}`, []);
  return (
    <Svg width={size} height={(size * 72) / 64} viewBox="0 0 64 72">
      <Shirt jersey={j} id={clipId} />
      {/* boyun */}
      <Rect x={27} y={38} width={10} height={10} rx={3} fill={shade} stroke={O} strokeWidth={SW} />
      {/* kulaklar + baş */}
      <Ellipse cx={HX - HR} cy={HY + 2} rx={3.2} ry={4} fill={skin} stroke={O} strokeWidth={SW} />
      <Ellipse cx={HX + HR} cy={HY + 2} rx={3.2} ry={4} fill={skin} stroke={O} strokeWidth={SW} />
      <Ellipse cx={HX} cy={HY} rx={HR} ry={HR + 0.8} fill={skin} stroke={O} strokeWidth={SW} />
      <Path d="M39 14 Q48 20 47 30 Q46 39 38 43 Q44 35 44 28 Q44 20 39 14 Z" fill={shade} opacity={0.7} />
      <Hair kind={face} color={hair} cap={j.body} trim={j.trim} />
      <Face mood={mood} vip={vip} />
      <Scarf a={j.scarf[0]} b={j.scarf[1]} vip={vip} />
    </Svg>
  );
});
