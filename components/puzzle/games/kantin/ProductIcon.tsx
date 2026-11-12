/**
 * Kantin ürünleri — react-native-svg ile çizilmiş basit, okunaklı ikonlar
 * (emoji yasak). Hepsi 40×40 görünüm kutusunda; `size` ile ölçeklenir.
 */

import React, { memo } from "react";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

import { CARTOON } from "@/lib/game/cartoon";
import { kantinFood as F, kantinScene as S } from "@/lib/puzzle/kantinPalette";
import { KANTIN_PRODUCTS } from "@/lib/puzzle/levels/kantin";

const SESAME = Array.from({ length: 10 }, (_, k) => {
  const a = (k / 10) * Math.PI * 2 + 0.2;
  return { x: 20 + Math.cos(a) * 12.5, y: 20 + Math.sin(a) * 12.5, r: (a * 180) / Math.PI + 90 };
});

const KERNELS = (() => {
  const out: { x: number; y: number }[] = [];
  for (let row = 0; row < 7; row += 1) {
    const y = 8 + row * 3.3;
    const half = row === 0 || row === 6 ? 1 : 2;
    for (let c = -half; c <= half; c += 1) out.push({ x: 20 + c * 2.9, y });
  }
  return out;
})();

function Simit() {
  return (
    <G>
      <Circle cx={20} cy={20} r={12.5} fill="none" stroke={F.crust} strokeWidth={8.5} />
      <Circle cx={20} cy={20} r={12.5} fill="none" stroke={F.crustLight} strokeWidth={3} opacity={0.7} />
      {SESAME.map((s, i) => (
        <Ellipse key={i} cx={s.x} cy={s.y} rx={1.3} ry={0.7} fill={F.sesame} stroke="none" rotation={s.r} origin={`${s.x}, ${s.y}`} />
      ))}
    </G>
  );
}

function Ayran() {
  return (
    <G>
      <Path d="M11 11 H29 L27.2 33 Q27 35 25 35 H15 Q13 35 12.8 33 Z" fill={F.cupWhite} stroke={F.cupEdge} strokeWidth={1.2} />
      <Path d="M11.9 19 H28.1 L27.5 26 H12.5 Z" fill={F.ayranBlue} />
      <Path d="M14 22.5 Q17 20.5 20 22.5 T26 22.5" stroke={F.cupWhite} strokeWidth={1.2} fill="none" />
      <Rect x={9.5} y={8} width={21} height={4.5} rx={1.6} fill={F.foil} stroke={F.foilEdge} strokeWidth={0.8} />
    </G>
  );
}

function Tost() {
  return (
    <G>
      <Path d="M7 17 Q7 8 15 8 Q20 6 25 8 Q33 8 33 17 V31 Q33 34 30 34 H10 Q7 34 7 31 Z" fill={F.crust} />
      <Path d="M10 17 Q10 11 16 11 Q20 9.5 24 11 Q30 11 30 17 V30 Q30 31 29 31 H11 Q10 31 10 30 Z" fill={F.toast} />
      <Path d="M12 15 L20 23 M17 12.5 L28 23.5 M12 22 L20 30 M22 27 L27 31" stroke={F.toastDark} strokeWidth={1.7} strokeLinecap="round" opacity={0.75} />
      <Path d="M29.5 19 Q35 20 33.8 25.5 Q32.6 28 31.2 24.5 Z" fill={F.cheese} />
    </G>
  );
}

function Cay() {
  return (
    <G>
      <Ellipse cx={20} cy={34} rx={13} ry={3.2} fill={F.cupWhite} stroke={F.cupEdge} strokeWidth={1} />
      <Path
        d="M13 8 H27 Q25 14 24.5 19 Q27.2 25 25.2 31 Q24.6 33 20 33 Q15.4 33 14.8 31 Q12.8 25 15.5 19 Q15 14 13 8 Z"
        fill={F.glass}
        stroke={F.glassEdge}
        strokeWidth={1}
      />
      <Path
        d="M14.3 11.5 H25.7 Q24.3 15.5 23.9 19.5 Q26 25 24.3 30.3 Q23.8 32 20 32 Q16.2 32 15.7 30.3 Q14 25 16.1 19.5 Q15.7 15.5 14.3 11.5 Z"
        fill={F.tea}
      />
      <Path d="M16.8 14 Q17.6 17 17.2 21" stroke={F.teaLight} strokeWidth={1.4} strokeLinecap="round" fill="none" />
    </G>
  );
}

function Misir() {
  return (
    <G>
      <Ellipse cx={20} cy={18} rx={7.2} ry={13} fill={F.corn} />
      {KERNELS.map((k, i) => (
        <Circle key={i} cx={k.x} cy={k.y} r={1.15} fill={F.cornDark} stroke="none" opacity={0.55} />
      ))}
      <Path d="M20 37 Q7 32 9 14 Q13 26 20 30 Z" fill={F.husk} />
      <Path d="M20 37 Q33 32 31 14 Q27 26 20 30 Z" fill={F.huskDark} />
    </G>
  );
}

function Su() {
  return (
    <G>
      <Path d="M16.5 8 H23.5 L24 11 Q29 13 29 18 V33 Q29 36 26 36 H14 Q11 36 11 33 V18 Q11 13 16 11 Z" fill={F.water} stroke={F.waterEdge} strokeWidth={1.1} />
      <Rect x={11} y={20} width={18} height={7.5} fill={F.waterLabel} />
      <Path d="M13 24 Q15.5 22 18 24 T23 24 T28 24" stroke={F.cupWhite} strokeWidth={1.2} fill="none" />
      <Rect x={15.5} y={3.5} width={9} height={5} rx={1.2} fill={F.waterCap} />
      <Path d="M14.5 15 V31" stroke={F.cupWhite} strokeWidth={1.6} strokeLinecap="round" opacity={0.7} />
    </G>
  );
}

function Doner() {
  return (
    <G>
      <Path d="M9 18 Q10 8 20 8 Q30 8 31 18 Z" fill={F.lavash} />
      <Path d="M12 17.5 Q13 11 20 11 Q27 11 28 17.5 Z" fill={F.meat} />
      <Path d="M13 15 q2 -3 4 0 q2 -3 4 0 q2 -3 4 0" stroke={F.lettuce} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Circle cx={16.5} cy={13} r={1.4} fill={F.tomato} />
      <Circle cx={24} cy={13.2} r={1.4} fill={F.tomato} />
      <Path d="M9.5 17.5 H30.5 L22 37 Q20 39 18 37 Z" fill={F.paper} stroke={F.paperEdge} strokeWidth={1} />
      <Path d="M12.3 23 H27.7" stroke={F.paperStripe} strokeWidth={1.6} opacity={0.8} />
      <Path d="M14.6 28 H25.4" stroke={F.paperStripe} strokeWidth={1.6} opacity={0.8} />
    </G>
  );
}

function Kola() {
  return (
    <G>
      <Rect x={11} y={7} width={18} height={28} rx={3} fill={F.cola} />
      <Path d="M11 22 Q16 17 20 21 T29 19 V24.5 Q24 27.5 20 24.5 T11 26.5 Z" fill={F.cupWhite} />
      <Rect x={12} y={4.5} width={16} height={4.5} rx={2} fill={F.can} />
      <Rect x={12} y={33} width={16} height={3.5} rx={1.6} fill={F.can} />
      <Rect x={14} y={10} width={2.2} height={22} rx={1.1} fill={F.cupWhite} opacity={0.35} />
    </G>
  );
}

function Gazoz() {
  return (
    <G>
      <Path
        d="M17 5 H23 V10 Q23 13 26 15 Q28 17 28 21 V34 Q28 36 26 36 H14 Q12 36 12 34 V21 Q12 17 14 15 Q17 13 17 10 Z"
        fill={F.gazoz}
        stroke={F.gazozDark}
        strokeWidth={1.1}
      />
      <Rect x={12} y={22} width={16} height={7.5} fill={F.gazozLabel} />
      <Circle cx={20} cy={25.7} r={2.3} fill={F.orange} />
      <Rect x={16} y={2.5} width={8} height={3.6} rx={1.1} fill={F.gazozCap} />
      <Path d="M15 18 V33" stroke={F.cupWhite} strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
    </G>
  );
}

function Kumpir() {
  return (
    <G>
      <Path d="M5 25 Q8 36 20 36 Q32 36 35 25 L31 22.5 H9 Z" fill={F.foil} stroke={F.foilEdge} strokeWidth={1} />
      <Ellipse cx={20} cy={20.5} rx={14} ry={9} fill={F.potatoSkin} />
      <Ellipse cx={20} cy={19.5} rx={11} ry={6.3} fill={F.potato} />
      <Circle cx={14} cy={18} r={1.6} fill={F.corn} />
      <Circle cx={17.5} cy={21.5} r={1.6} fill={F.corn} />
      <Circle cx={24} cy={17} r={1.6} fill={F.corn} />
      <Circle cx={20.5} cy={16.5} r={1.8} fill={F.sausage} />
      <Circle cx={26.5} cy={21} r={1.8} fill={F.sausage} />
      <Rect x={21} y={20} width={3.6} height={1.8} rx={0.9} fill={F.pickle} />
      <Rect x={12.5} y={21} width={3.4} height={1.8} rx={0.9} fill={F.pickle} />
      <Circle cx={28} cy={17.5} r={1.2} fill={F.olive} />
    </G>
  );
}

function Kofte() {
  return (
    <G>
      <Path d="M5 24 Q5 32.5 12 32.5 H28 Q35 32.5 35 24 Z" fill={F.bread} />
      <Ellipse cx={13} cy={21.5} rx={5} ry={3.2} fill={F.meat} />
      <Ellipse cx={20} cy={21.5} rx={5} ry={3.2} fill={F.meatDark} />
      <Ellipse cx={27} cy={21.5} rx={5} ry={3.2} fill={F.meat} />
      <Path d="M6 24 Q9 21.5 12 24 T18 24 T24 24 T30 24 T34 24" stroke={F.lettuce} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <Path d="M6 18 Q8 9 20 9 Q32 9 34 18 Q34 19.5 32 19.5 H8 Q6 19.5 6 18 Z" fill={F.bread} stroke={F.breadDark} strokeWidth={0.8} />
      <Ellipse cx={14} cy={13.5} rx={1.2} ry={0.6} fill={F.sesame} />
      <Ellipse cx={20} cy={12} rx={1.2} ry={0.6} fill={F.sesame} />
      <Ellipse cx={26} cy={13.5} rx={1.2} ry={0.6} fill={F.sesame} />
    </G>
  );
}

function Sucuklu() {
  return (
    <G>
      <Path d="M7 34 V11 Q7 6 12 7.5 Q29 13 33 29.5 Q33.5 34 29 34 Z" fill={F.crust} />
      <Path d="M10 31 V13 Q10 10.5 12.5 11.3 Q27 16.5 30 29 Q30.2 31 28.5 31 Z" fill={F.toast} />
      <Circle cx={14.5} cy={19.5} r={3.1} fill={F.sausage} />
      <Circle cx={14.5} cy={27} r={3.1} fill={F.sausage} />
      <Circle cx={22} cy={27} r={3.1} fill={F.sausage} />
      <Circle cx={13.6} cy={18.6} r={0.7} fill={F.sausageDot} />
      <Circle cx={15.4} cy={27.8} r={0.7} fill={F.sausageDot} />
      <Circle cx={21.2} cy={26.2} r={0.7} fill={F.sausageDot} />
      <Path d="M29 22 Q34 23 33.2 27 Q32.2 29 31 26 Z" fill={F.cheese} />
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
};

export const ProductIcon = memo(function ProductIcon({ p, size }: { p: number; size: number }) {
  const Draw = DRAW[KANTIN_PRODUCTS[p]?.id ?? "simit"];
  return (
    <Svg width={size} height={size} viewBox="-1 -1 42 42">
      {/* Çizgi film konturu: kendi kenar rengi olmayan her parça lacivert konturlanır. */}
      <G stroke={CARTOON.outline} strokeWidth={size < 26 ? 1.6 : 1.9} strokeLinejoin="round">
        <Draw />
      </G>
    </Svg>
  );
});

/** İki katlı yığının kapalı kolisi. */
export const CrateIcon = memo(function CrateIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Rect x={5} y={8} width={30} height={26} rx={3} fill={S.crate} stroke={CARTOON.outline} strokeWidth={2.4} />
      <Path d="M6.5 17 H33.5 M6.5 25 H33.5" stroke={S.crateDark} strokeWidth={1.4} />
      <Rect x={17} y={8} width={6} height={26} fill={S.crateTape} stroke={CARTOON.outline} strokeWidth={1.4} />
      <Rect x={8} y={10.5} width={7} height={2.4} rx={1.2} fill={S.white} opacity={0.55} />
    </Svg>
  );
});

/** Bahşiş jetonu. */
export const CoinIcon = memo(function CoinIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx={20} cy={20} r={17} fill={S.coin} stroke={CARTOON.outline} strokeWidth={3} />
      <Circle cx={20} cy={20} r={11} fill="none" stroke={S.coinEdge} strokeWidth={1.6} opacity={0.6} />
      <Path d="M14 13 Q17 10 21 10.5" stroke={S.coinShine} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <Path d="M20 13 L22 18 L27 18.3 L23 21.4 L24.4 26.4 L20 23.6 L15.6 26.4 L17 21.4 L13 18.3 L18 18 Z" fill={S.coinEdge} opacity={0.75} />
    </Svg>
  );
});
