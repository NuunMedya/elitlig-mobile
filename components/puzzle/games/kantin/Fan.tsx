/**
 * Taraftar figürü — react-native-svg. Forma rengi/deseni siparişten gelir,
 * yüz ifadesi sabra göre değişir (mutlu → tamam → tedirgin → kızgın).
 * VIP taraftar altın atkı taşır. Sade çizim: doğal orantı, kontur yok.
 */

import React, { memo } from "react";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

import {
  kantinFaceInk as INK,
  kantinHair,
  kantinJerseys,
  kantinMouth,
  kantinScene as S,
  kantinSkins,
} from "@/lib/puzzle/kantinPalette";

export type FanMood = "joy" | "happy" | "ok" | "worried" | "angry";

/** Saç / başlık — kontursuz düz dolgu. */
function Hair({ kind, color, cap }: { kind: number; color: string; cap: string }) {
  switch (kind % 6) {
    case 0:
      return <Path d="M17 26 Q17 12 32 12 Q47 12 47 26 Q43 18.5 32 19 Q22 18.5 17 26 Z" fill={color} />;
    case 1:
      return (
        <G fill={color}>
          <Circle cx={22} cy={18} r={4.6} />
          <Circle cx={27.5} cy={14.5} r={5} />
          <Circle cx={34} cy={14} r={5} />
          <Circle cx={40.5} cy={17} r={4.6} />
          <Circle cx={44.5} cy={22} r={3.2} />
          <Circle cx={19.5} cy={22} r={3.2} />
        </G>
      );
    case 2:
      return <Path d="M17.5 28 Q17 21 20 18.5 Q26 14 32 14 Q38 14 44 18.5 Q47 21 46.5 28 Q44 21 32 20.5 Q20 21 17.5 28 Z" fill={color} />;
    case 3:
      // Bere — forma renginde.
      return (
        <G>
          <Path d="M16.5 25 Q16 11 32 11 Q48 11 47.5 25 Z" fill={cap} />
          <Rect x={16} y={22} width={32} height={4.5} rx={2.2} fill={S.white} />
        </G>
      );
    case 4:
      return <Path d="M16.5 33 Q15 13 32 12 Q49 13 47.5 33 Q46 23 42 20 Q32 22.5 22 20 Q18 23 16.5 33 Z" fill={color} />;
    default:
      // Kasket — siperli şapka.
      return (
        <G>
          <Path d="M40 22 Q49 21.5 52 23.5 Q49 25.5 40 25 Z" fill={cap} />
          <Path d="M17 23.5 Q17 11 32 11 Q47 11 47 23.5 Z" fill={cap} />
        </G>
      );
  }
}

/** Sade göz: küçük koyu nokta. */
function Eye({ x, y }: { x: number; y: number }) {
  return <Ellipse cx={x} cy={y} rx={1.5} ry={1.8} fill={INK} />;
}

function Face({ mood }: { mood: FanMood }) {
  if (mood === "joy" || mood === "happy") {
    return (
      <G>
        <Path d="M24.5 28.5 Q26.5 26.5 28.5 28.5" stroke={INK} strokeWidth={1.3} strokeLinecap="round" fill="none" />
        <Path d="M35.5 28.5 Q37.5 26.5 39.5 28.5" stroke={INK} strokeWidth={1.3} strokeLinecap="round" fill="none" />
        {mood === "joy" ? (
          <Path d="M27.5 34 Q32 39 36.5 34 Z" fill={kantinMouth} />
        ) : (
          <Path d="M28 34.5 Q32 37.5 36 34.5" stroke={INK} strokeWidth={1.3} strokeLinecap="round" fill="none" />
        )}
      </G>
    );
  }
  if (mood === "ok") {
    return (
      <G>
        <Eye x={26.5} y={28.5} />
        <Eye x={37.5} y={28.5} />
        <Path d="M28.5 35 Q32 36.6 35.5 35" stroke={INK} strokeWidth={1.3} strokeLinecap="round" fill="none" />
      </G>
    );
  }
  if (mood === "worried") {
    return (
      <G>
        <Path d="M24 25 L28.5 24" stroke={INK} strokeWidth={1.1} strokeLinecap="round" />
        <Path d="M40 25 L35.5 24" stroke={INK} strokeWidth={1.1} strokeLinecap="round" />
        <Eye x={26.5} y={28.8} />
        <Eye x={37.5} y={28.8} />
        <Path d="M28.5 36 Q32 34.6 35.5 36" stroke={INK} strokeWidth={1.3} strokeLinecap="round" fill="none" />
      </G>
    );
  }
  return (
    <G>
      <Path d="M24 23.8 L29 25.3" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M40 23.8 L35 25.3" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      <Eye x={26.5} y={28.8} />
      <Eye x={37.5} y={28.8} />
      <Path d="M28.5 36.5 Q32 34 35.5 36.5" stroke={INK} strokeWidth={1.4} strokeLinecap="round" fill="none" />
    </G>
  );
}

function Jersey({ jersey }: { jersey: (typeof kantinJerseys)[number] }) {
  const body = "M8 73 Q8.5 54 20 49.5 H44 Q55.5 54 56 73 Z";
  return (
    <G>
      <Path d={body} fill={jersey.body} />
      {jersey.style === "stripes" ? (
        <G fill={jersey.trim} opacity={0.9}>
          <Rect x={20} y={50} width={4.5} height={23} />
          <Rect x={29.75} y={49.5} width={4.5} height={23.5} />
          <Rect x={39.5} y={50} width={4.5} height={23} />
        </G>
      ) : null}
      {jersey.style === "sash" ? <Path d="M12 59 L18 51.5 L52 71 L48 73 H40 Z" fill={jersey.trim} opacity={0.95} /> : null}
      {jersey.style === "half" ? <Path d="M32 49.5 H44 Q55.5 54 56 73 H32 Z" fill={jersey.trim} opacity={0.95} /> : null}
      {/* Omuz ışığı ve yan gölge: hacim, kontur yok. */}
      <Path d="M14 57 Q16 52.5 20 51" stroke={S.white} strokeOpacity={0.25} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Path d="M48 56 Q54 60 55.5 73 H50 Q50 62 48 56 Z" fill={S.ink} opacity={0.12} />
      <Path d="M26 49.5 L32 55 L38 49.5" stroke={jersey.style === "plain" ? jersey.trim : S.white} strokeWidth={2.2} strokeLinejoin="round" fill="none" />
    </G>
  );
}

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
  const skin = kantinSkins[face % kantinSkins.length];
  const hair = kantinHair[(face * 7 + jersey) % kantinHair.length];
  return (
    <Svg width={size} height={(size * 72) / 64} viewBox="0 -3 64 75">
      {/* Boyun */}
      <Rect x={28} y={40} width={8} height={11} rx={3} fill={skin} />
      <Rect x={28} y={46} width={8} height={4} fill={S.ink} opacity={0.1} />
      <Jersey jersey={j} />
      {vip ? (
        <G>
          <Path d="M21 49 Q32 55 43 49 L43 52.5 Q32 58.5 21 52.5 Z" fill={S.vip} />
          <Path d="M37.5 54 L40.5 65 L36.5 63.5 L35 54.5 Z" fill={S.vipDeep} />
        </G>
      ) : null}
      {/* Doğal orantılı baş: gövdeye göre küçük, boyunla oturur. */}
      <G transform="translate(32 31) scale(0.9) translate(-32 -28)">
        <Ellipse cx={18} cy={29} rx={2.6} ry={3.2} fill={skin} />
        <Ellipse cx={46} cy={29} rx={2.6} ry={3.2} fill={skin} />
        <Ellipse cx={32} cy={28} rx={14} ry={15} fill={skin} />
        <Path d="M38 15 Q46 20 46 30 Q45 40 36 43 Q43 36 43 28 Q43 20 38 15 Z" fill={S.ink} opacity={0.07} />
        <Hair kind={face} color={hair} cap={j.body} />
        <Face mood={mood} />
      </G>
    </Svg>
  );
});
