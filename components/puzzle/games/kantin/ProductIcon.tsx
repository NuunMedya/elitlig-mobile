/**
 * Kantin ürünleri — react-native-svg çizimleri (emoji yasak).
 *
 * 2026-11 YENİLEMESİ: her ürün 64×64 görünüm kutusunda, koyu sıcak konturlu,
 * gölgeli ve parlamalı "yapışkan" çizimdir. Ürünler küçük boyda da (22 px)
 * siluetinden tanınmalı: simit halka, çay ince belli bardak, ayran mavi
 * şeritli kap, tost üçgen dilim… Renkler lib/puzzle/kantinPalette.ts'tedir.
 *
 * Ortak dil: altta yumuşak zemin gölgesi, gövde + kontur, iç gölge (sağ alt),
 * parlama (sol üst). Kontur kalınlığı sabit (2.4) — ölçek büyüdükçe kalınlaşır,
 * küçük boyda da kenar kaybolmaz.
 */

import React, { memo } from "react";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { kantinFood as F, kantinScene as S } from "@/lib/puzzle/kantinPalette";
import { KANTIN_PRODUCTS } from "@/lib/puzzle/levels/kantin";

const O = F.outline;
const SW = 2.4;

/** Zemin gölgesi — her ürünün altında. */
function Ground({ w = 22, y = 57 }: { w?: number; y?: number }) {
  return <Ellipse cx={32} cy={y} rx={w} ry={4} fill={F.ground} />;
}

const SESAME = Array.from({ length: 14 }, (_, k) => {
  const a = (k / 14) * Math.PI * 2 + 0.2;
  const rr = k % 2 ? 16.5 : 13.5;
  return { x: 32 + Math.cos(a) * rr, y: 30 + Math.sin(a) * rr * 0.9, r: (a * 180) / Math.PI + 90 };
});

function Simit() {
  return (
    <G>
      <Ground w={22} y={55} />
      {/* halka: kontur kalın çizgi, üstüne hamur — delik zemini gösterir */}
      <Ellipse cx={32} cy={30} rx={15.5} ry={14} fill="none" stroke={O} strokeWidth={15 + SW * 2} />
      <Ellipse cx={32} cy={30} rx={15.5} ry={14} fill="none" stroke={F.crust} strokeWidth={15} />
      {/* alt gölge ve üst ışık */}
      <Path d="M14 36 Q20 48 32 49 Q44 48 50 36 Q46 45 32 46 Q18 45 14 36 Z" fill={F.crustDark} opacity={0.55} />
      <Path d="M15 24 Q20 13 32 12 Q40 12 45 16" stroke={F.crustLight} strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.85} />
      {SESAME.map((s, i) => (
        <Ellipse key={i} cx={s.x} cy={s.y} rx={1.9} ry={1} fill={F.sesame} rotation={s.r} origin={`${s.x}, ${s.y}`} />
      ))}
    </G>
  );
}

function Ayran() {
  return (
    <G>
      <Ground w={15} />
      <Path d="M16 16 H48 L45 52 Q44.6 56 40.5 56 H23.5 Q19.4 56 19 52 Z" fill={F.cupWhite} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M17.4 28 H46.6 L45.6 40 H18.4 Z" fill={F.ayranBlue} />
      <Path d="M20 34 Q24 31 28 34 T36 34 T44 34" stroke={F.cupWhite} strokeWidth={1.8} fill="none" />
      <Path d="M40 18 L37.5 53" stroke={F.cupShade} strokeWidth={4} strokeLinecap="round" />
      <Path d="M22 19 L23.5 50" stroke={F.shine} strokeWidth={2.4} strokeLinecap="round" />
      {/* folyo kapak */}
      <Rect x={12.5} y={10} width={39} height={8} rx={3} fill={F.foil} stroke={O} strokeWidth={SW} />
      <Path d="M17 13 H40" stroke={S.white} strokeWidth={1.8} strokeLinecap="round" opacity={0.9} />
    </G>
  );
}

function Tost() {
  return (
    <G>
      <Ground w={22} />
      {/* üçgen dilim */}
      <Path d="M9 50 L32 9 Q34 6 36.5 9 L56 46 Q57.5 51 52 52 H13 Q7 52 9 50 Z" fill={F.crust} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M15.5 47 L33 15 L50.5 47 Z" fill={F.toast} />
      {/* ızgara izleri */}
      <Path d="M22 41 L36 27 M27 45 L41 31 M33 46 L44 35" stroke={F.toastGrill} strokeWidth={2.6} strokeLinecap="round" opacity={0.8} />
      {/* eriyen kaşar */}
      <Path d="M12 49 Q17 55 20 50 Q24 58 28 50 Q33 56 37 50 Q42 56 45 50 Q50 55 54 49 Z" fill={F.cheese} stroke={O} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M24 23 L30 13" stroke={F.crustLight} strokeWidth={2.4} strokeLinecap="round" />
    </G>
  );
}

function Cay() {
  return (
    <G>
      <Ground w={20} />
      {/* tabak */}
      <Ellipse cx={32} cy={52} rx={21} ry={5} fill={F.saucer} stroke={O} strokeWidth={SW} />
      <Ellipse cx={32} cy={51} rx={12} ry={2.2} fill={F.saucerEdge} />
      {/* ince belli bardak */}
      <Path
        d="M21 15 H43 Q43 22 38.5 29 Q36.5 32 38.5 35 Q44 42 42 50 H22 Q20 42 25.5 35 Q27.5 32 25.5 29 Q21 22 21 15 Z"
        fill={F.glass}
        stroke={O}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <Path d="M22.6 20 H41.4 Q41 24 38 28.5 Q35.6 32 37.8 35.5 Q42.4 42 40.6 48.5 H23.4 Q21.6 42 26.2 35.5 Q28.4 32 26 28.5 Q23 24 22.6 20 Z" fill={F.tea} />
      <Path d="M24 21 H40 Q39.5 23.5 38 26" stroke={F.teaLight} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Path d="M26 38 Q24.5 42 25 46" stroke={F.shine} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Path d="M25 17 Q25 21 27 25" stroke={F.shine} strokeWidth={2} strokeLinecap="round" fill="none" />
      {/* buhar */}
      <Path d="M28 11 Q25 7 28 4 M36 11 Q33 7 36 3" stroke={F.steam} strokeWidth={2} strokeLinecap="round" fill="none" />
    </G>
  );
}

const KERNELS = (() => {
  const out: { x: number; y: number }[] = [];
  for (let row = 0; row < 8; row += 1) {
    const y = 13 + row * 4.2;
    const half = row === 0 || row === 7 ? 1 : 2;
    for (let c = -half; c <= half; c += 1) out.push({ x: 32 + c * 3.8, y });
  }
  return out;
})();

function Misir() {
  return (
    <G>
      <Ground w={17} />
      <Ellipse cx={32} cy={31} rx={11} ry={22} fill={F.corn} stroke={O} strokeWidth={SW} />
      {KERNELS.map((k, i) => (
        <Ellipse key={i} cx={k.x} cy={k.y} rx={1.6} ry={1.7} fill={F.cornDark} opacity={0.7} />
      ))}
      <Path d="M26 14 Q24 26 26 44" stroke={F.shine} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      {/* koçan yaprakları */}
      <Path d="M32 56 Q14 52 12 30 Q20 42 30 44 Z" fill={F.husk} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M32 56 Q50 52 52 30 Q44 42 34 44 Z" fill={F.huskDark} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
    </G>
  );
}

function Su() {
  return (
    <G>
      <Ground w={13} />
      <Path d="M24 18 Q24 14 28 13 V9 H36 V13 Q40 14 40 18 V52 Q40 56 36 56 H28 Q24 56 24 52 Z" fill={F.water} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Rect x={27} y={4} width={10} height={6} rx={1.6} fill={F.waterCap} stroke={O} strokeWidth={SW} />
      <Rect x={24.8} y={28} width={14.4} height={12} fill={F.waterLabel} />
      <Path d="M28 34 Q32 31 36 34" stroke={S.white} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      <Path d="M36 19 V52" stroke={F.waterDeep} strokeWidth={3} strokeLinecap="round" />
      <Path d="M27.5 19 V26 M27.5 43 V51" stroke={F.shine} strokeWidth={2.2} strokeLinecap="round" />
    </G>
  );
}

function Doner() {
  return (
    <G>
      <Ground w={16} />
      {/* dürüm kağıdı */}
      <Path d="M20 30 L44 30 L40 56 H24 Z" fill={F.paper} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M21.6 38 H42.4 M22.6 45 H41.4" stroke={F.paperStripe} strokeWidth={2.4} />
      {/* lavaş + içerik */}
      <Path d="M18 31 Q18 12 32 9 Q46 12 46 31 Z" fill={F.lavash} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M22 29 Q23 17 32 15 Q41 17 42 29 Z" fill={F.meat} />
      <Path d="M24 25 Q28 20 32 22 Q36 19 40 24" stroke={F.meatLight} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Path d="M23 29 Q26 25 29 29 Q32 25 35 29 Q38 25 41 29" fill={F.lettuce} stroke={F.lettuceDark} strokeWidth={1} />
      <Circle cx={28} cy={20} r={2.2} fill={F.tomato} />
      <Circle cx={36} cy={22} r={2.2} fill={F.tomato} />
    </G>
  );
}

function Kola() {
  return (
    <G>
      <Ground w={13} />
      <Path d="M21 14 Q21 10 25 10 H39 Q43 10 43 14 V52 Q43 56 39 56 H25 Q21 56 21 52 Z" fill={F.cola} stroke={O} strokeWidth={SW} />
      <Rect x={21} y={10} width={22} height={6} rx={2} fill={F.can} stroke={O} strokeWidth={SW} />
      <Rect x={21} y={50} width={22} height={6} rx={2} fill={F.canDark} stroke={O} strokeWidth={SW} />
      <Path d="M23 30 Q32 22 41 30 Q32 38 23 30 Z" fill={F.colaLabel} />
      <Path d="M24 30 Q32 26 40 30" stroke={F.cola} strokeWidth={1.6} fill="none" />
      <Path d="M37 18 V48" stroke={F.colaDark} strokeWidth={4} strokeLinecap="round" />
      <Path d="M25.5 19 V27 M25.5 36 V47" stroke={F.shine} strokeWidth={2.4} strokeLinecap="round" />
    </G>
  );
}

function Gazoz() {
  return (
    <G>
      <Ground w={12} />
      <Path d="M27 13 H37 V20 Q43 24 43 32 V52 Q43 56 39 56 H25 Q21 56 21 52 V32 Q21 24 27 20 Z" fill={F.gazoz} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Rect x={26} y={7} width={12} height={7} rx={2} fill={F.gazozCap} stroke={O} strokeWidth={SW} />
      <Rect x={21.6} y={33} width={20.8} height={12} fill={F.gazozLabel} />
      <Circle cx={32} cy={39} r={3.4} fill={F.orange} />
      <Path d="M37 24 Q40 28 40 34 V52" stroke={F.gazozDark} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Circle cx={27} cy={28} r={1.4} fill={F.bubbles} />
      <Circle cx={30} cy={24} r={1} fill={F.bubbles} />
      <Circle cx={26} cy={50} r={1.2} fill={F.bubbles} />
    </G>
  );
}

function Kumpir() {
  return (
    <G>
      <Ground w={22} />
      {/* folyo kayık */}
      <Path d="M8 38 Q9 54 32 55 Q55 54 56 38 Z" fill={F.foil} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M14 44 Q32 50 50 44" stroke={F.foilEdge} strokeWidth={1.6} fill="none" />
      {/* patates + iç */}
      <Ellipse cx={32} cy={34} rx={22} ry={12} fill={F.potatoSkin} stroke={O} strokeWidth={SW} />
      <Ellipse cx={32} cy={32} rx={17} ry={8} fill={F.potato} />
      <Path d="M18 31 Q22 22 28 26 Q32 20 37 26 Q42 21 46 31" fill={F.potato} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
      <Circle cx={24} cy={30} r={2.6} fill={F.pickle} />
      <Circle cx={31} cy={27} r={2.2} fill={F.sausage} />
      <Circle cx={38} cy={30} r={2.4} fill={F.olive} />
      <Circle cx={34} cy={33} r={2} fill={F.cornDark} />
      <Circle cx={28} cy={34} r={1.8} fill={F.tomato} />
      <Path d="M21 23 Q24 20 27 22" stroke={F.butter} strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </G>
  );
}

function Kofte() {
  return (
    <G>
      <Ground w={22} />
      {/* yarım ekmek: alt */}
      <Path d="M6 38 Q6 50 18 52 H46 Q58 50 58 38 Z" fill={F.bread} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      {/* köfteler + marul + domates */}
      <Path d="M8 37 Q14 32 20 37 Q26 32 32 37 Q38 32 44 37 Q50 32 56 37 Z" fill={F.lettuce} stroke={F.lettuceDark} strokeWidth={1.2} />
      <Ellipse cx={18} cy={32} rx={8} ry={5} fill={F.meat} stroke={O} strokeWidth={SW} />
      <Ellipse cx={32} cy={31} rx={8} ry={5} fill={F.meat} stroke={O} strokeWidth={SW} />
      <Ellipse cx={46} cy={32} rx={8} ry={5} fill={F.meat} stroke={O} strokeWidth={SW} />
      <Path d="M14 30 Q17 28 20 29 M28 29 Q31 27 34 28 M42 30 Q45 28 48 29" stroke={F.meatLight} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      {/* üst ekmek */}
      <Path d="M7 29 Q8 12 32 11 Q56 12 57 29 Q57 27 52 27 H12 Q7 27 7 29 Z" fill={F.breadLight} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M15 19 Q24 14 34 15" stroke={F.shine} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <Path d="M22 21 L26 19 M34 19 L38 18 M44 21 L47 20" stroke={F.breadDark} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={25} cy={38} r={2.2} fill={F.tomato} />
      <Circle cx={39} cy={38} r={2.2} fill={F.tomato} />
    </G>
  );
}

function Sucuklu() {
  return (
    <G>
      <Ground w={22} />
      {/* kare tost, çapraz kesik */}
      <Rect x={9} y={11} width={46} height={42} rx={8} fill={F.crust} stroke={O} strokeWidth={SW} />
      <Rect x={13.5} y={15.5} width={37} height={33} rx={5} fill={F.toast} />
      <Path d="M14 48 L50 16" stroke={O} strokeWidth={SW} strokeLinecap="round" />
      <Path d="M18 27 L28 17 M18 40 L38 20 M30 44 L46 28" stroke={F.toastGrill} strokeWidth={2.4} strokeLinecap="round" opacity={0.75} />
      {/* kenardan taşan sucuk + kaşar */}
      <Circle cx={55} cy={26} r={6} fill={F.sausage} stroke={O} strokeWidth={SW} />
      <Circle cx={53.5} cy={25} r={1.2} fill={F.sausageDot} />
      <Circle cx={56.5} cy={28} r={1.1} fill={F.sausageDot} />
      <Circle cx={10} cy={38} r={5.5} fill={F.sausage} stroke={O} strokeWidth={SW} />
      <Circle cx={9} cy={37} r={1.1} fill={F.sausageDot} />
      <Path d="M24 53 Q26 59 29 53 Q32 58 35 53" fill={F.cheese} stroke={O} strokeWidth={1.6} strokeLinejoin="round" />
    </G>
  );
}

function Lahmacun() {
  return (
    <G>
      <Ground w={24} />
      <Ellipse cx={32} cy={32} rx={26} ry={22} fill={F.lavash} stroke={O} strokeWidth={SW} />
      <Ellipse cx={32} cy={31} rx={21} ry={17.5} fill={F.pepper} opacity={0.9} />
      <Ellipse cx={32} cy={31} rx={21} ry={17.5} fill={F.meatDark} opacity={0.25} />
      {[
        [22, 26], [31, 22], [41, 27], [26, 36], [37, 37], [44, 33], [20, 33], [32, 30],
      ].map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={1.8} fill={F.meatDark} />
      ))}
      <Path d="M24 24 L27 23 M36 40 L39 39 M42 30 L44 28" stroke={F.parsley} strokeWidth={2.4} strokeLinecap="round" />
      {/* limon dilimi */}
      <Path d="M40 47 A9 9 0 0 1 56 41 Z" fill={F.lemon} stroke={O} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M13 26 Q17 15 30 12" stroke={F.shine} strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </G>
  );
}

function Kokorec() {
  return (
    <G>
      <Ground w={22} />
      {/* yarım ekmek arası */}
      <Path d="M6 36 Q6 50 20 52 H44 Q58 50 58 36 Z" fill={F.bread} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M8 34 Q14 26 20 32 Q26 25 32 32 Q38 25 44 32 Q50 26 56 34 Q50 40 32 40 Q14 40 8 34 Z" fill={F.kokorec} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M14 33 Q18 30 22 33 M28 32 Q32 29 36 32 M42 33 Q46 30 50 33" stroke={F.kokorecDark} strokeWidth={2} strokeLinecap="round" fill="none" />
      {[
        [17, 35], [27, 36], [38, 35], [47, 36],
      ].map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={1.6} fill={F.pepper} />
      ))}
      <Path d="M7 27 Q9 12 32 11 Q55 12 57 27 Q46 23 32 24 Q18 23 7 27 Z" fill={F.breadLight} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M16 18 Q24 14 33 15" stroke={F.shine} strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </G>
  );
}

function Limonata() {
  return (
    <G>
      <Ground w={15} />
      {/* pipet */}
      <Path d="M36 22 L44 4 H49" stroke={F.straw} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M17 16 H47 L43.5 53 Q43 56 40 56 H24 Q21 56 20.5 53 Z" fill={F.glass} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M18.4 24 H45.6 L42.4 52 Q42 54 40 54 H24 Q22 54 21.6 52 Z" fill={F.lemonade} />
      <Rect x={24} y={30} width={7} height={7} rx={1.6} fill={S.white} opacity={0.75} />
      <Rect x={33} y={38} width={6} height={6} rx={1.4} fill={S.white} opacity={0.75} />
      {/* bardak kenarında limon */}
      <Circle cx={18} cy={17} r={8} fill={F.lemon} stroke={O} strokeWidth={SW} />
      <Circle cx={18} cy={17} r={5} fill={F.lemonade} />
      <Path d="M18 12 V22 M13 17 H23 M14.5 13.5 L21.5 20.5" stroke={F.lemonDark} strokeWidth={1.2} />
      <Path d="M23 27 L25 51" stroke={F.shine} strokeWidth={2.2} strokeLinecap="round" />
    </G>
  );
}

function Dondurma() {
  return (
    <G>
      <Ground w={10} />
      {/* külah */}
      <Path d="M20 30 L32 58 L44 30 Z" fill={F.cone} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M24 34 L37 47 M28 32 L40 39 M23.5 40 L33 32 M27 47 L39 35" stroke={F.coneDark} strokeWidth={1.6} strokeLinecap="round" />
      {/* iki top */}
      <Circle cx={32} cy={27} r={12} fill={F.creamVanilla} stroke={O} strokeWidth={SW} />
      <Path d="M20 30 Q24 35 27 30 Q31 36 34 30 Q38 35 44 30" fill={F.creamVanilla} stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Circle cx={32} cy={15} r={10} fill={F.creamPink} stroke={O} strokeWidth={SW} />
      <Path d="M24 17 Q28 21 32 18 Q36 21 40 17" stroke={F.creamPinkDark} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      <Circle cx={33} cy={5} r={3.4} fill={F.cherry} stroke={O} strokeWidth={1.8} />
      <Path d="M27 11 Q28 8 31 8" stroke={F.shine} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Path d="M24 25 Q25 22 28 21" stroke={F.shine} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </G>
  );
}

const DRAW: Record<string, () => React.JSX.Element> = {
  simit: Simit,
  ayran: Ayran,
  tost: Tost,
  cay: Cay,
  misir: Misir,
  su: Su,
  doner: Doner,
  kola: Kola,
  gazoz: Gazoz,
  kumpir: Kumpir,
  kofte: Kofte,
  sucuklu: Sucuklu,
  lahmacun: Lahmacun,
  kokorec: Kokorec,
  limonata: Limonata,
  dondurma: Dondurma,
};

export const ProductIcon = memo(function ProductIcon({ p, size }: { p: number; size: number }) {
  const id = KANTIN_PRODUCTS[p]?.id ?? "simit";
  const Draw = DRAW[id] ?? Simit;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Draw />
    </Svg>
  );
});

/** Kapalı koli — iki katlı yığının alt katı. */
export const CrateIcon = memo(function CrateIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect x={8} y={14} width={48} height={40} rx={5} fill={S.crate} stroke={O} strokeWidth={SW} />
      <Path d="M8 26 H56" stroke={S.crateDark} strokeWidth={2.4} />
      <Rect x={27} y={14} width={10} height={40} fill={S.crateTape} />
      <Path d="M14 34 H22 M14 40 H20 M42 34 H50 M44 40 H50" stroke={S.crateDark} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M12 18 H24" stroke={F.shine} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
});

/** Bahşiş jetonu. */
export const CoinIcon = memo(function CoinIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <RadialGradient id="kcoin" cx="38%" cy="32%" r="70%">
          <Stop offset="0" stopColor={S.coinShine} />
          <Stop offset="0.6" stopColor={S.coin} />
          <Stop offset="1" stopColor={S.coinEdge} />
        </RadialGradient>
      </Defs>
      <Circle cx={32} cy={34} r={26} fill={S.coinEdge} />
      <Circle cx={32} cy={31} r={26} fill="url(#kcoin)" stroke={O} strokeWidth={SW} />
      <Circle cx={32} cy={31} r={18} fill="none" stroke={S.coinEdge} strokeWidth={2.4} opacity={0.7} />
      <Path d="M26 22 V40 M26 31 H37 Q41 31 41 26.5 Q41 22 37 22 H26" stroke={S.coinEdge} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M17 22 Q22 13 32 12" stroke={S.white} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.75} />
    </Svg>
  );
});

/** Cam parlama katmanı (karo üstü): üstten ışık, altta gölge. */
export const TileGloss = memo(function TileGloss({ w, h, r }: { w: number; h: number; r: number }) {
  return (
    <Svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="ktgloss" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={S.white} stopOpacity={0.55} />
          <Stop offset="0.45" stopColor={S.white} stopOpacity={0} />
          <Stop offset="1" stopColor={S.ink} stopOpacity={0.07} />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} rx={r} fill="url(#ktgloss)" />
    </Svg>
  );
});
