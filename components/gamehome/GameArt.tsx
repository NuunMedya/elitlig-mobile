/**
 * OYUN SANATI — ana sayfanın SVG ikon seti (özgün çizim; hiçbir oyunun
 * varlığı kopyalanmadı). Her ikon aynı dille çizilir:
 *   · koyu dış kontur (zeminden ayrışma),
 *   · üç duraklı dikey gradyan (açık üst · ana · koyu alt = hacim),
 *   · sol üstte parlak ışık lekesi (tek ışık kaynağı: sol üst),
 *   · altta yumuşak gölge.
 * Renk aileleri ayrıktır (lib/game/gameHomePalette → GH.art): jeton altın,
 * can kırmızı, yıldız sarı-turuncu, sandık ahşap + altın, çark mor + gökkuşağı,
 * hediye pembe-mor, kale beyaz, kürsü mavi.
 *
 * Gradyan kimlikleri örnek başına benzersizdir (useGid): web'de aynı
 * kimlikli iki <defs> çakışmasın.
 */

import React, { useId } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";

import { GH } from "@/lib/game/gameHomePalette";

const A = GH.art;

/**
 * İkon kutusu: web'de konumlu (absolute) kardeşler statik <svg>'nin ÜSTÜNE
 * boyanır (gradyan dolgu, kenar ışığı); RN View web'de `relative` olduğu için
 * ikonu kendi katmanına alır. Yerelde sıra zaten doğru.
 */
function ArtBox({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      {children}
    </View>
  );
}

/** Örnek başına benzersiz SVG kimliği (":" gibi karakterler url() içinde bozulur). */
export function useGid(prefix: string) {
  const id = useId();
  return `${prefix}${id.replace(/[^a-zA-Z0-9]/g, "")}`;
}

/** Dikey üç duraklı gradyan. */
export function Grad({ id, stops, x2 = 0, y2 = 1 }: { id: string; stops: readonly string[]; x2?: number; y2?: number }) {
  return (
    <SvgGradient id={id} x1="0" y1="0" x2={String(x2)} y2={String(y2)}>
      {stops.map((c, i) => (
        <Stop key={i} offset={stops.length === 1 ? 0 : i / (stops.length - 1)} stopColor={c} />
      ))}
    </SvgGradient>
  );
}

/** Beş köşeli yıldız noktaları (merkez cx,cy; dış r; iç oran). */
export function starPoints(cx: number, cy: number, r: number, inner = 0.48) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return pts.join(" ");
}

type IconProps = { size?: number };

/* ═══════════════════════ JETON ═══════════════════════ */

export const CoinArt = React.memo(function CoinArt({ size = 32 }: IconProps) {
  const g = useGid("coin");
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={`${g}a`} stops={A.coin} />
        <Grad id={`${g}b`} stops={[A.coin[2], A.coin[1]]} />
      </Defs>
      <Ellipse cx={24} cy={44} rx={15} ry={3} fill={A.shade} />
      <Circle cx={24} cy={23} r={20} fill={`url(#${g}a)`} stroke={A.coinEdge} strokeWidth={2.5} />
      <Circle cx={24} cy={23} r={14.5} fill={`url(#${g}b)`} stroke={A.coinEdge} strokeWidth={1.4} opacity={0.9} />
      <Polygon points={starPoints(24, 23.5, 9, 0.46)} fill={A.coin[0]} stroke={A.coinEdge} strokeWidth={1.2} strokeLinejoin="round" />
      <Ellipse cx={16} cy={13} rx={6} ry={3.6} fill={A.shine} transform="rotate(-35 16 13)" />
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ CAN ═══════════════════════ */

const HEART = "M24 41 C 10 31 4 24 4 15.5 C 4 9 9 4.5 15 4.5 C 19 4.5 22 6.5 24 10 C 26 6.5 29 4.5 33 4.5 C 39 4.5 44 9 44 15.5 C 44 24 38 31 24 41 Z";

export const HeartArt = React.memo(function HeartArt({ size = 32, empty = false }: IconProps & { empty?: boolean }) {
  const g = useGid("heart");
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={g} stops={empty ? A.starOff : A.heart} />
      </Defs>
      <Ellipse cx={24} cy={45} rx={13} ry={2.5} fill={A.shade} />
      <Path d={HEART} fill={`url(#${g})`} stroke={empty ? A.outline : A.heartEdge} strokeWidth={2.6} strokeLinejoin="round" />
      {empty ? null : <Ellipse cx={14} cy={13} rx={5.5} ry={3.6} fill={A.shine} transform="rotate(-30 14 13)" />}
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ YILDIZ ═══════════════════════ */

export const StarArt = React.memo(function StarArt({ size = 32, off = false }: IconProps & { off?: boolean }) {
  const g = useGid("star");
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={g} stops={off ? A.starOff : A.star} />
      </Defs>
      <Polygon points={starPoints(24, 26, 21, 0.5)} fill={`url(#${g})`} stroke={off ? A.outline : A.starEdge} strokeWidth={2.6} strokeLinejoin="round" />
      {off ? null : <Polygon points={starPoints(21.5, 20, 7, 0.5)} fill={A.shine} opacity={0.75} />}
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ SANDIK ═══════════════════════ */

export const ChestArt = React.memo(function ChestArt({ size = 40, open = false, glow = false, tone = "wood" }: IconProps & { open?: boolean; glow?: boolean; tone?: "wood" | "gold" | "gem" }) {
  const g = useGid("chest");
  const body = tone === "gold" ? A.gold : tone === "gem" ? A.gem : A.wood;
  const edge = tone === "wood" ? A.woodEdge : A.goldEdge;
  const band = tone === "gold" ? A.wood : A.gold;
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={`${g}b`} stops={body} />
        <Grad id={`${g}g`} stops={band} />
        <RadialGradient id={`${g}r`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={GH.chestGlow} />
          <Stop offset="1" stopColor={GH.burstClear} />
        </RadialGradient>
      </Defs>
      {glow || open ? <Circle cx={24} cy={20} r={22} fill={`url(#${g}r)`} /> : null}
      <Ellipse cx={24} cy={45} rx={18} ry={2.8} fill={A.shade} />
      {open ? (
        <>
          {/* geriye açılmış kapak (gövdenin ARKASINDA) */}
          <Path d="M 8 23 L 10 7 Q 24 2 38 7 L 40 23 Z" fill={`url(#${g}b)`} stroke={edge} strokeWidth={2.4} strokeLinejoin="round" />
          <Path d="M 21 4.6 L 27 4.6 L 27.5 23 L 20.5 23 Z" fill={`url(#${g}g)`} stroke={edge} strokeWidth={1.4} />
          <Path d="M 10 21 L 11.5 10 Q 24 6 36.5 10 L 38 21 Z" fill={A.shade} />
          {/* içerik: jeton yığını + parıltı */}
          <Ellipse cx={24} cy={23} rx={17} ry={4.5} fill={A.coin[2]} stroke={edge} strokeWidth={1.6} />
          <Circle cx={16} cy={20} r={4} fill={A.coin[1]} stroke={A.coinEdge} strokeWidth={1.2} />
          <Circle cx={24} cy={18} r={4.4} fill={A.coin[0]} stroke={A.coinEdge} strokeWidth={1.2} />
          <Circle cx={32} cy={20} r={4} fill={A.coin[1]} stroke={A.coinEdge} strokeWidth={1.2} />
          <Polygon points={starPoints(24, 18, 2.4)} fill={A.coin[2]} />
          <Polygon points={starPoints(13, 12, 3)} fill={A.bulb} />
          <Polygon points={starPoints(35, 11, 2.4)} fill={A.bulb} />
        </>
      ) : (
        <>
          <Path d="M 6 24 Q 6 9 24 9 Q 42 9 42 24 Z" fill={`url(#${g}b)`} stroke={edge} strokeWidth={2.4} strokeLinejoin="round" />
          <Path d="M 21 9.2 L 27 9.2 L 27 24 L 21 24 Z" fill={`url(#${g}g)`} stroke={edge} strokeWidth={1.4} />
          <Ellipse cx={14} cy={14.5} rx={5} ry={2.4} fill={A.shineSoft} transform="rotate(-25 14 14.5)" />
        </>
      )}
      {/* gövde */}
      <Rect x={6} y={22} width={36} height={21} rx={3.5} fill={`url(#${g}b)`} stroke={edge} strokeWidth={2.4} />
      <Rect x={6} y={22} width={36} height={5} fill={A.shade} opacity={0.8} />
      {/* ön kuşak + kilit */}
      <Rect x={21} y={22} width={6} height={21} fill={`url(#${g}g)`} stroke={edge} strokeWidth={1.4} />
      <Rect x={18.5} y={25} width={11} height={10} rx={2.5} fill={`url(#${g}g)`} stroke={edge} strokeWidth={1.8} />
      <Circle cx={24} cy={29} r={1.8} fill={edge} />
      <Rect x={23.2} y={29.5} width={1.6} height={3} fill={edge} />
      <Rect x={6} y={38} width={36} height={2.4} fill={A.shade} />
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ ÇARK ═══════════════════════ */

export const WheelArt = React.memo(function WheelArt({ size = 36 }: IconProps) {
  const g = useGid("wheel");
  const R = 17;
  const n = 8;
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={`${g}r`} stops={A.wheelRim} />
      </Defs>
      <Ellipse cx={24} cy={45} rx={14} ry={2.5} fill={A.shade} />
      <Circle cx={24} cy={25} r={R + 4} fill={`url(#${g}r)`} stroke={A.outline} strokeWidth={2.2} />
      {Array.from({ length: n }, (_, i) => {
        const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
        return (
          <Path
            key={i}
            d={`M 24 25 L ${24 + R * Math.cos(a0)} ${25 + R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${24 + R * Math.cos(a1)} ${25 + R * Math.sin(a1)} Z`}
            fill={A.wheel[i % A.wheel.length]}
            stroke={A.outline}
            strokeWidth={0.8}
          />
        );
      })}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        return <Circle key={`b${i}`} cx={24 + (R + 2) * Math.cos(a)} cy={25 + (R + 2) * Math.sin(a)} r={1.3} fill={A.bulb} />;
      })}
      <Circle cx={24} cy={25} r={4.2} fill={A.wheelHub[0]} stroke={A.outline} strokeWidth={1.8} />
      <Path d="M 24 10 L 19.5 2.5 L 28.5 2.5 Z" fill={A.heart[1]} stroke={A.outline} strokeWidth={1.8} strokeLinejoin="round" />
      <Ellipse cx={16} cy={14} rx={5} ry={2.4} fill={A.shineSoft} transform="rotate(-35 16 14)" />
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ HEDİYE ═══════════════════════ */

export const GiftArt = React.memo(function GiftArt({ size = 36 }: IconProps) {
  const g = useGid("gift");
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={`${g}b`} stops={A.giftBox} />
        <Grad id={`${g}r`} stops={A.ribbon} />
      </Defs>
      <Ellipse cx={24} cy={45} rx={16} ry={2.6} fill={A.shade} />
      <Rect x={8} y={21} width={32} height={22} rx={3} fill={`url(#${g}b)`} stroke={A.outline} strokeWidth={2.2} />
      <Rect x={5} y={14} width={38} height={9} rx={3} fill={`url(#${g}b)`} stroke={A.outline} strokeWidth={2.2} />
      <Rect x={20.5} y={14} width={7} height={29} fill={`url(#${g}r)`} stroke={A.outline} strokeWidth={1.6} />
      <Path d="M 24 14 C 18 4 9 6 12 12 C 13.5 15 19 14.5 24 14 Z" fill={`url(#${g}r)`} stroke={A.outline} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M 24 14 C 30 4 39 6 36 12 C 34.5 15 29 14.5 24 14 Z" fill={`url(#${g}r)`} stroke={A.outline} strokeWidth={1.8} strokeLinejoin="round" />
      <Ellipse cx={13} cy={17} rx={4} ry={1.6} fill={A.shineSoft} />
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ PENALTI (kale + top) ═══════════════════════ */

export const PenaltyArt = React.memo(function PenaltyArt({ size = 36 }: IconProps) {
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Ellipse cx={24} cy={44} rx={20} ry={2.6} fill={A.shade} />
      {/* ağ */}
      <Path d="M 6 36 L 6 9 L 42 9 L 42 36" fill={A.netShade} />
      {[12, 18, 24, 30, 36].map((x) => (
        <Path key={`v${x}`} d={`M ${x} 9 L ${x} 36`} stroke={A.net} strokeWidth={0.9} />
      ))}
      {[15, 21, 27, 33].map((y) => (
        <Path key={`h${y}`} d={`M 6 ${y} L 42 ${y}`} stroke={A.net} strokeWidth={0.9} />
      ))}
      <Path d="M 5 37 L 5 8 L 43 8 L 43 37" stroke={A.outline} strokeWidth={5} fill="none" strokeLinejoin="round" />
      <Path d="M 5 37 L 5 8 L 43 8 L 43 37" stroke={A.post} strokeWidth={2.6} fill="none" strokeLinejoin="round" />
      <BallShape cx={30} cy={33} r={9} />
    </Svg>
    </ArtBox>
  );
});

/** Futbol topu (SVG içinde kullanılır): beyaz küre, koyu beşgenler, ışık. */
export function BallShape({ cx, cy, r, outline = true }: { cx: number; cy: number; r: number; outline?: boolean }) {
  const p = (dx: number, dy: number, s: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      pts.push(`${(cx + dx * r + Math.cos(a) * r * s).toFixed(2)},${(cy + dy * r + Math.sin(a) * r * s).toFixed(2)}`);
    }
    return pts.join(" ");
  };
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={A.ball[0]} stroke={outline ? A.outline : A.ball[2]} strokeWidth={outline ? Math.max(1.2, r * 0.16) : r * 0.06} />
      <Path d={`M ${cx - r * 0.86} ${cy + r * 0.3} A ${r} ${r} 0 0 0 ${cx + r * 0.6} ${cy + r * 0.82}`} stroke={A.ball[2]} strokeWidth={r * 0.18} fill="none" opacity={0.6} />
      <Polygon points={p(0, 0, 0.36)} fill={A.ballPatch} />
      <Polygon points={p(-0.72, -0.42, 0.24)} fill={A.ballPatch} />
      <Polygon points={p(0.72, -0.42, 0.24)} fill={A.ballPatch} />
      <Polygon points={p(-0.5, 0.68, 0.22)} fill={A.ballPatch} />
      <Polygon points={p(0.5, 0.68, 0.22)} fill={A.ballPatch} />
      <Ellipse cx={cx - r * 0.38} cy={cy - r * 0.48} rx={r * 0.28} ry={r * 0.16} fill={A.shine} transform={`rotate(-35 ${cx - r * 0.38} ${cy - r * 0.48})`} />
    </G>
  );
}

/* ═══════════════════════ KÜRSÜ (sıralama) ═══════════════════════ */

export const PodiumArt = React.memo(function PodiumArt({ size = 36 }: IconProps) {
  const g = useGid("pod");
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={`${g}p`} stops={A.podium} />
        <Grad id={`${g}g`} stops={A.gold} />
      </Defs>
      <Ellipse cx={24} cy={45} rx={20} ry={2.5} fill={A.shade} />
      <Rect x={17} y={18} width={14} height={25} rx={2} fill={`url(#${g}g)`} stroke={A.outline} strokeWidth={2.2} />
      <Rect x={4} y={26} width={13} height={17} rx={2} fill={`url(#${g}p)`} stroke={A.outline} strokeWidth={2.2} />
      <Rect x={31} y={31} width={13} height={12} rx={2} fill={`url(#${g}p)`} stroke={A.outline} strokeWidth={2.2} />
      <Polygon points={starPoints(24, 10, 7)} fill={`url(#${g}g)`} stroke={A.outline} strokeWidth={1.8} strokeLinejoin="round" />
      <Rect x={20} y={23} width={8} height={9} rx={1.5} fill={A.shineSoft} />
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ MAĞAZA (şimşek) ═══════════════════════ */

export const BoltArt = React.memo(function BoltArt({ size = 36 }: IconProps) {
  const g = useGid("bolt");
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={g} stops={A.bolt} />
      </Defs>
      <Ellipse cx={24} cy={45} rx={12} ry={2.4} fill={A.shade} />
      <Path d="M 28 3 L 9 27 L 22 27 L 18 44 L 39 18 L 26 18 Z" fill={`url(#${g})`} stroke={A.outline} strokeWidth={2.6} strokeLinejoin="round" />
      <Path d="M 26 9 L 15 23.5 L 20 23.5 Z" fill={A.shine} opacity={0.7} />
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ DİĞER (ızgara) ═══════════════════════ */

export const GridArt = React.memo(function GridArt({ size = 36 }: IconProps) {
  const g = useGid("grid");
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={g} stops={A.gear} />
      </Defs>
      {[
        [7, 7],
        [26, 7],
        [7, 26],
        [26, 26],
      ].map(([x, y], i) => (
        <Rect key={i} x={x} y={y} width={15} height={15} rx={4.5} fill={`url(#${g})`} stroke={A.outline} strokeWidth={2.2} />
      ))}
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ AYAR ═══════════════════════ */

export const GearArt = React.memo(function GearArt({ size = 28 }: IconProps) {
  const g = useGid("gear");
  const teeth = 8;
  let d = "";
  for (let i = 0; i < teeth * 2; i += 1) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 ? 15 : 20;
    const a2 = a + Math.PI / (teeth * 2);
    d += `${i ? "L" : "M"} ${24 + Math.cos(a) * r} ${24 + Math.sin(a) * r} L ${24 + Math.cos(a2) * r} ${24 + Math.sin(a2) * r} `;
  }
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={g} stops={A.gear} />
      </Defs>
      <Path d={`${d}Z`} fill={`url(#${g})`} stroke={A.outline} strokeWidth={2.4} strokeLinejoin="round" />
      <Circle cx={24} cy={24} r={6} fill={GH.roundBtn[1]} stroke={A.outline} strokeWidth={2} />
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ KUPA ═══════════════════════ */

export const TrophyArt = React.memo(function TrophyArt({ size = 36, dim = false }: IconProps & { dim?: boolean }) {
  const g = useGid("cup");
  const stops = dim ? A.lock : A.gold;
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={g} stops={stops} />
      </Defs>
      <Path d="M 12 9 Q 3 9 4.5 17 Q 6 24 15 25" stroke={A.outline} strokeWidth={5} fill="none" />
      <Path d="M 36 9 Q 45 9 43.5 17 Q 42 24 33 25" stroke={A.outline} strokeWidth={5} fill="none" />
      <Path d="M 12 9 Q 3 9 4.5 17 Q 6 24 15 25" stroke={stops[1]} strokeWidth={2.4} fill="none" />
      <Path d="M 36 9 Q 45 9 43.5 17 Q 42 24 33 25" stroke={stops[1]} strokeWidth={2.4} fill="none" />
      <Path d="M 11 6 L 37 6 L 35 20 Q 33 30 24 31 Q 15 30 13 20 Z" fill={`url(#${g})`} stroke={A.outline} strokeWidth={2.4} strokeLinejoin="round" />
      <Rect x={20.5} y={30} width={7} height={7} fill={stops[2]} stroke={A.outline} strokeWidth={2} />
      <Rect x={13} y={37} width={22} height={7} rx={2} fill={`url(#${g})`} stroke={A.outline} strokeWidth={2.2} />
      <Ellipse cx={17.5} cy={13} rx={2.6} ry={5} fill={A.shine} opacity={dim ? 0.4 : 0.8} />
      {dim ? null : <Polygon points={starPoints(24, 17, 5)} fill={A.coin[0]} stroke={A.coinEdge} strokeWidth={1} />}
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ KİLİT ═══════════════════════ */

export const LockArt = React.memo(function LockArt({ size = 22 }: IconProps) {
  const g = useGid("lock");
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <Grad id={g} stops={A.lock} />
      </Defs>
      <Path d="M 15 22 L 15 15 Q 15 6 24 6 Q 33 6 33 15 L 33 22" stroke={A.outline} strokeWidth={8} fill="none" />
      <Path d="M 15 22 L 15 15 Q 15 6 24 6 Q 33 6 33 15 L 33 22" stroke={A.lock[1]} strokeWidth={4} fill="none" />
      <Rect x={9} y={20} width={30} height={23} rx={5} fill={`url(#${g})`} stroke={A.outline} strokeWidth={2.6} />
      <Circle cx={24} cy={30} r={3.2} fill={A.outline} />
      <Rect x={22.6} y={30} width={2.8} height={7} rx={1} fill={A.outline} />
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ GERİ OKU ═══════════════════════ */

export const BackArt = React.memo(function BackArt({ size = 24 }: IconProps) {
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M 30 8 L 14 24 L 30 40" stroke={A.outline} strokeWidth={11} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M 30 8 L 14 24 L 30 40" stroke={GH.white} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
    </ArtBox>
  );
});

/* ═══════════════════════ ARTI ═══════════════════════ */

export const PlusArt = React.memo(function PlusArt({ size = 20 }: IconProps) {
  const g = useGid("plus");
  return (
    <ArtBox size={size}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <Grad id={g} stops={GH.plus} />
      </Defs>
      <Circle cx={12} cy={12} r={10.5} fill={`url(#${g})`} stroke={GH.plusEdge} strokeWidth={1.8} />
      <Path d="M 12 6.5 L 12 17.5 M 6.5 12 L 17.5 12" stroke={GH.white} strokeWidth={3.2} strokeLinecap="round" />
      <Ellipse cx={8.5} cy={7.5} rx={3} ry={1.6} fill={A.shineSoft} transform="rotate(-30 8.5 7.5)" />
    </Svg>
    </ArtBox>
  );
});

/** Ödülün ikonu (jeton · güçlendirici · can · yıldız). */
export function PrizeArt({ kind, size = 32 }: { kind: "coins" | "booster" | "lives" | "stars"; size?: number }) {
  if (kind === "coins") return <CoinArt size={size} />;
  if (kind === "lives") return <HeartArt size={size} />;
  if (kind === "stars") return <StarArt size={size} />;
  return <BoltArt size={size} />;
}
