/**
 * Taraftar figürü — react-native-svg. Forma rengi/deseni siparişten gelir,
 * yüz ifadesi sabra göre değişir (mutlu → tamam → tedirgin → kızgın).
 * VIP taraftar altın atkı ve göğüs yıldızı taşır.
 */

import React, { memo } from "react";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

import { CARTOON } from "@/lib/game/cartoon";

import {
  kantinCheek,
  kantinHair,
  kantinJerseys,
  kantinMouth,
  kantinScene as S,
  kantinSkins,
} from "@/lib/puzzle/kantinPalette";

const O = CARTOON.outline;

export type FanMood = "joy" | "happy" | "ok" | "worried" | "angry";

function Hair({ kind, color, cap }: { kind: number; color: string; cap: string }) {
  switch (kind % 6) {
    case 0:
      return <Path d="M17 26 Q17 11 32 11 Q47 11 47 26 Q43 18 32 18.5 Q22 18 17 26 Z" fill={color} stroke={O} strokeWidth={2} strokeLinejoin="round" />;
    case 1:
      return (
        <G fill={color} stroke={O} strokeWidth={1.6}>
          <Circle cx={21} cy={17} r={5} />
          <Circle cx={27} cy={13} r={5.5} />
          <Circle cx={34} cy={12.5} r={5.5} />
          <Circle cx={41} cy={16} r={5} />
          <Circle cx={45} cy={22} r={3.5} />
          <Circle cx={18.5} cy={22} r={3.5} />
        </G>
      );
    case 2:
      return <Path d="M17 30 Q16 22 19 19 L21 27 Z M47 30 Q48 22 45 19 L43 27 Z" fill={color} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />;
    case 3:
      // Bere — forma renginde, ponponlu.
      return (
        <G>
          <Path d="M16.5 25 Q16 10 32 10 Q48 10 47.5 25 Z" fill={cap} stroke={O} strokeWidth={2} strokeLinejoin="round" />
          <Rect x={15.5} y={22} width={33} height={5} rx={2.5} fill={S.white} stroke={O} strokeWidth={1.6} />
          <Circle cx={32} cy={8.5} r={3.5} fill={S.white} stroke={O} strokeWidth={1.6} />
        </G>
      );
    case 4:
      return <Path d="M16 34 Q14 12 32 11 Q50 12 48 34 Q46 22 42 19 Q32 22 22 19 Q18 22 16 34 Z" fill={color} stroke={O} strokeWidth={2} strokeLinejoin="round" />;
    default:
      // Kasket — siperli şapka.
      return (
        <G>
          <Path d="M40 22 Q50 21 54 24 Q50 26 40 25 Z" fill={cap} stroke={O} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M17 23 Q17 10 32 10 Q47 10 47 23 Z" fill={cap} stroke={O} strokeWidth={2} strokeLinejoin="round" />
          <Circle cx={32} cy={11} r={1.8} fill={S.white} stroke={O} strokeWidth={1.2} />
        </G>
      );
  }
}

/** İri çizgi film gözü: lacivert oval + beyaz parıltı. */
function Eye({ x, y }: { x: number; y: number }) {
  return (
    <G>
      <Ellipse cx={x} cy={y} rx={2.3} ry={2.9} fill={O} />
      <Circle cx={x + 0.7} cy={y - 1} r={0.9} fill={S.white} />
    </G>
  );
}

function Face({ mood }: { mood: FanMood }) {
  const ink = O;
  if (mood === "joy" || mood === "happy") {
    return (
      <G>
        <Path d="M23.5 28 Q26 25 28.5 28" stroke={ink} strokeWidth={1.9} strokeLinecap="round" fill="none" />
        <Path d="M35.5 28 Q38 25 40.5 28" stroke={ink} strokeWidth={1.9} strokeLinecap="round" fill="none" />
        <Path d={mood === "joy" ? "M24.5 33.5 Q32 43 39.5 33.5 Z" : "M26 34 Q32 40 38 34 Z"} fill={kantinMouth} stroke={O} strokeWidth={1.4} strokeLinejoin="round" />
        <Circle cx={22} cy={33} r={2.6} fill={kantinCheek} />
        <Circle cx={42} cy={33} r={2.6} fill={kantinCheek} />
      </G>
    );
  }
  if (mood === "ok") {
    return (
      <G>
        <Eye x={26} y={28} />
        <Eye x={38} y={28} />
        <Path d="M27 35 Q32 38.5 37 35" stroke={ink} strokeWidth={1.9} strokeLinecap="round" fill="none" />
        <Circle cx={22} cy={33} r={2.6} fill={kantinCheek} />
        <Circle cx={42} cy={33} r={2.6} fill={kantinCheek} />
      </G>
    );
  }
  if (mood === "worried") {
    return (
      <G>
        <Path d="M22.5 24.5 L28 23" stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
        <Path d="M41.5 24.5 L36 23" stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
        <Eye x={26} y={28.5} />
        <Eye x={38} y={28.5} />
        <Path d="M27 36.5 Q29.5 34.8 32 36.5 T37 36.5" stroke={ink} strokeWidth={1.7} strokeLinecap="round" fill="none" />
      </G>
    );
  }
  return (
    <G>
      <Path d="M22.5 22.5 L29 25" stroke={ink} strokeWidth={2} strokeLinecap="round" />
      <Path d="M41.5 22.5 L35 25" stroke={ink} strokeWidth={2} strokeLinecap="round" />
      <Eye x={26} y={28.5} />
      <Eye x={38} y={28.5} />
      <Path d="M27 37.5 Q32 33 37 37.5" stroke={ink} strokeWidth={1.9} strokeLinecap="round" fill="none" />
      <Circle cx={22} cy={33} r={2.8} fill={S.dangerSoft} />
      <Circle cx={42} cy={33} r={2.8} fill={S.dangerSoft} />
    </G>
  );
}

function Jersey({ jersey }: { jersey: (typeof kantinJerseys)[number] }) {
  const body = "M9 73 Q9 52 21 47.5 H43 Q55 52 55 73 Z";
  return (
    <G>
      <Path d={body} fill={jersey.body} stroke={O} strokeWidth={2.4} strokeLinejoin="round" />
      {jersey.style === "stripes" ? (
        <G fill={jersey.trim} opacity={0.9}>
          <Rect x={20} y={49} width={5} height={23} />
          <Rect x={29.5} y={47.5} width={5} height={24.5} />
          <Rect x={39} y={49} width={5} height={23} />
        </G>
      ) : null}
      {jersey.style === "sash" ? <Path d="M12 58 L18 50 L52 70 L48 72 H40 Z" fill={jersey.trim} opacity={0.95} /> : null}
      {jersey.style === "half" ? <Path d="M32 47.5 H43 Q56 52 56 72 H32 Z" fill={jersey.trim} opacity={0.95} /> : null}
      <Path d="M14 56 Q16 51 20 49.5" stroke={S.white} strokeOpacity={0.5} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Path d={body} fill="none" stroke={O} strokeWidth={2.4} strokeLinejoin="round" />
      <Path d="M24.5 47.5 L32 55.5 L39.5 47.5" stroke={O} strokeWidth={5} strokeLinejoin="round" fill="none" />
      <Path d="M25 47.5 L32 55 L39 47.5" stroke={jersey.style === "plain" ? jersey.trim : S.white} strokeWidth={2.6} strokeLinejoin="round" fill="none" />
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
      <Jersey jersey={j} />
      {vip ? (
        <G>
          <Path d="M20 47 Q32 54 44 47 L44 51 Q32 58 20 51 Z" fill={S.vip} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
          <Path d="M38 52 L42 66 L37 64 L35 68 L34 53 Z" fill={S.vipDeep} stroke={O} strokeWidth={1.4} strokeLinejoin="round" />
          <Path
            d="M24 58 L25.4 61 L28.6 61.3 L26.2 63.4 L27 66.5 L24 64.8 L21 66.5 L21.8 63.4 L19.4 61.3 L22.6 61 Z"
            fill={S.vip}
            stroke={O}
            strokeWidth={1.2}
          />
        </G>
      ) : null}
      {/* Büyük kafa: boyun gizli, baş + kulaklar + saç + yüz %14 büyütülür. */}
      <G transform="translate(32 25) scale(1.14) translate(-32 -28)">
        <Circle cx={17.5} cy={29} r={3.4} fill={skin} stroke={O} strokeWidth={2} />
        <Circle cx={46.5} cy={29} r={3.4} fill={skin} stroke={O} strokeWidth={2} />
        <Circle cx={32} cy={28} r={15} fill={skin} stroke={O} strokeWidth={2.2} />
        <Hair kind={face} color={hair} cap={j.body} />
        <Face mood={mood} />
      </G>
    </Svg>
  );
});
