/**
 * Elit Üçlü tahta katmanları.
 *
 * SAKİN TAHTA: hücre başına kutu / karo YOKTUR. Tahtanın tamamı tek bir
 * durağan SVG'dir (`BoardBed`): şekli izleyen ince, sıcak altın çerçeve,
 * altında kısık lacivert bir yatak ve üstünde iki yakın soluk tonda yarı
 * saydam dama. Delik (maske) hücrelerinde arka sahne görünür; çerçeve
 * deliklerin çevresini de sarar.
 *
 * Hücre başına yalnız ENGELLER çizilir (çamur birikintisi, sade toprak/çim,
 * ahşap krampon kutusu) ve taşın üstündeki kilitler (buz kalıbı, kale ağı).
 * Hepsi hücre başına memo'lu; yalnız değeri değişen hücre yeniden çizilir.
 * Vuruş alan hücre kısa bir sarsıntıyla, çimlenen hücre "büyüme"
 * sıçramasıyla tepki verir.
 */

import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { UCLU_BOARD } from "@/lib/puzzle/ucluPalette";

/* ───────────────────────────── engeller ───────────────────────────── */

export interface CellViewProps {
  row: number;
  col: number;
  cell: number;
  mud: number;
  crate: number;
  /** 0 yok, 1 çıplak toprak, 2 çimli. */
  turf: number;
}

/**
 * Çim hedefi — bilerek SADE: yarı saydam toprak / çim lekesi ve ince desen.
 * Damadan ayırt edilir ama göz alıcı bir yeşil blok değildir.
 */
export function Turf({ size, grown }: { size: number; grown: boolean }) {
  if (!grown)
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Rect x={4} y={4} width={92} height={92} rx={22} fill={UCLU_BOARD.turfDirt} />
        <G fill={UCLU_BOARD.turfDirtLo}>
          <Circle cx={24} cy={28} r={3} />
          <Circle cx={70} cy={22} r={2.4} />
          <Circle cx={78} cy={64} r={3.2} />
          <Circle cx={36} cy={74} r={2.6} />
          <Circle cx={54} cy={48} r={2} />
        </G>
        <G fill={UCLU_BOARD.turfDirtSpot}>
          <Circle cx={30} cy={44} r={5} />
          <Circle cx={66} cy={78} r={6} />
          <Circle cx={60} cy={30} r={3.5} />
        </G>
      </Svg>
    );
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
      <Rect x={4} y={4} width={92} height={92} rx={22} fill={UCLU_BOARD.turfGrass} />
      {/* Biçme şeridi: yarısı biraz açık (sahadaki çim deseni). */}
      <Path d="M4 50 L96 50 L96 74 Q96 96 74 96 L26 96 Q4 96 4 74 Z" fill={UCLU_BOARD.turfGrassHi} />
      <G stroke={UCLU_BOARD.turfBlade} strokeWidth={2.6} strokeLinecap="round">
        <Line x1={22} y1={30} x2={25} y2={22} />
        <Line x1={28} y1={31} x2={29} y2={24} />
        <Line x1={68} y1={74} x2={71} y2={66} />
        <Line x1={74} y1={75} x2={75} y2={68} />
        <Line x1={72} y1={32} x2={75} y2={25} />
        <Line x1={30} y1={78} x2={33} y2={71} />
      </G>
    </Svg>
  );
}

const MUD_BLOB = "M20 30 C16 14 40 9 51 16 C64 8 88 14 85 34 C95 46 93 70 81 80 C70 93 40 93 28 85 C10 78 8 50 20 30 Z";
const MUD_INNER = "M32 38 C30 28 46 25 53 30 C62 25 76 30 73 42 C80 50 76 66 66 70 C56 78 40 76 34 70 C24 64 24 48 32 38 Z";

/** Çamur birikintisi: parlak, katmanlı bir leke (iki katlıda koyu iç halka). */
export function Mud({ size, layers }: { size: number; layers: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={`umud${layers}`} cx="40%" cy="34%" r="70%">
          <Stop offset="0" stopColor={UCLU_BOARD.mudHi} />
          <Stop offset="0.55" stopColor={layers >= 2 ? UCLU_BOARD.mudDeep : UCLU_BOARD.mud} />
          <Stop offset="1" stopColor={UCLU_BOARD.mudDeep} />
        </RadialGradient>
      </Defs>
      <Path d={MUD_BLOB} fill={UCLU_BOARD.mudDeep} transform="translate(0 3)" opacity={0.6} />
      <Path d={MUD_BLOB} fill={`url(#umud${layers})`} />
      {layers >= 2 ? <Path d={MUD_INNER} fill={UCLU_BOARD.mudDeep} opacity={0.55} /> : null}
      <Ellipse cx={36} cy={28} rx={10} ry={4.5} transform="rotate(-24 36 28)" fill={UCLU_BOARD.mudGloss} />
      <Circle cx={72} cy={66} r={4.5} fill={UCLU_BOARD.mudGloss} />
      <Circle cx={24} cy={60} r={2.6} fill={UCLU_BOARD.mudGloss} />
      <Circle cx={62} cy={22} r={2.2} fill={UCLU_BOARD.mudGloss} />
    </Svg>
  );
}

/** Ahşap krampon kutusu: tahta damarlı kalaslar, metal köşelikler, çiviler; canı arttıkça metal kuşak. */
export function Crate({ size, hp }: { size: number; hp: number }) {
  const nail = (x: number, y: number) => (
    <G key={`${x}-${y}`}>
      <Circle cx={x} cy={y} r={3.4} fill={UCLU_BOARD.metalLo} />
      <Circle cx={x - 0.8} cy={y - 0.8} r={1.9} fill={UCLU_BOARD.metalHi} />
    </G>
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="uwood" x1="0" y1="0" x2="0.3" y2="1">
          <Stop offset="0" stopColor={UCLU_BOARD.woodHi} />
          <Stop offset="0.5" stopColor={UCLU_BOARD.wood} />
          <Stop offset="1" stopColor={UCLU_BOARD.woodLo} />
        </LinearGradient>
        <LinearGradient id="umetal" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UCLU_BOARD.metalHi} />
          <Stop offset="0.5" stopColor={UCLU_BOARD.metal} />
          <Stop offset="1" stopColor={UCLU_BOARD.metalLo} />
        </LinearGradient>
        <ClipPath id="ucrc">
          <Rect x={7} y={6} width={86} height={84} rx={9} />
        </ClipPath>
      </Defs>
      <Ellipse cx={50} cy={93} rx={42} ry={5} fill={UCLU_BOARD.pieceShadow} />
      <Rect x={5} y={4} width={90} height={88} rx={11} fill={UCLU_BOARD.woodDeep} />
      <Rect x={7} y={6} width={86} height={84} rx={9} fill="url(#uwood)" />
      <G clipPath="url(#ucrc)">
        {/* Kalaslar ve damar. */}
        <G stroke={UCLU_BOARD.woodDeep} strokeOpacity={0.7} strokeWidth={2.2}>
          <Line x1={0} y1={34} x2={100} y2={34} />
          <Line x1={0} y1={62} x2={100} y2={62} />
        </G>
        <G fill="none" stroke={UCLU_BOARD.woodGrain} strokeWidth={1.6} strokeLinecap="round">
          <Path d="M14 18 Q34 14 52 20 T88 18" />
          <Path d="M12 26 Q30 24 44 28" />
          <Path d="M20 46 Q40 42 60 48 T90 46" />
          <Path d="M48 54 Q64 52 80 56" />
          <Path d="M12 74 Q32 70 52 76 T88 74" />
          <Path d="M26 82 Q44 80 60 84" />
        </G>
        <Ellipse cx={70} cy={46} rx={4} ry={2.2} fill={UCLU_BOARD.woodGrain} />
        {/* Çapraz destek. */}
        <Path d="M10 88 L90 10" stroke={UCLU_BOARD.woodDeep} strokeOpacity={0.35} strokeWidth={9} />
        <Path d="M10 85 L87 8" stroke={UCLU_BOARD.woodHi} strokeOpacity={0.55} strokeWidth={6} />
        {/* Üst parlama. */}
        <Rect x={7} y={6} width={86} height={9} fill={UCLU_BOARD.beamCore} opacity={0.22} />
        {hp >= 2 ? <Rect x={0} y={41} width={100} height={14} fill="url(#umetal)" stroke={UCLU_BOARD.metalLo} strokeWidth={1.2} /> : null}
        {hp >= 3 ? <Rect x={43} y={0} width={14} height={100} fill="url(#umetal)" stroke={UCLU_BOARD.metalLo} strokeWidth={1.2} /> : null}
      </G>
      {/* Metal köşelikler. */}
      <G fill="url(#umetal)" stroke={UCLU_BOARD.metalLo} strokeWidth={1.2} strokeLinejoin="round">
        <Path d="M5 26 L5 14 Q5 4 15 4 L27 4 L27 12 L13 12 L13 26 Z" />
        <Path d="M95 26 L95 14 Q95 4 85 4 L73 4 L73 12 L87 12 L87 26 Z" />
        <Path d="M5 70 L5 82 Q5 92 15 92 L27 92 L27 84 L13 84 L13 70 Z" />
        <Path d="M95 70 L95 82 Q95 92 85 92 L73 92 L73 84 L87 84 L87 70 Z" />
      </G>
      {[nail(19, 18), nail(81, 18), nail(19, 78), nail(81, 78)]}
      {hp >= 2 ? [nail(12, 48), nail(88, 48)] : null}
    </Svg>
  );
}

function CellViewBase({ row, col, cell, mud, crate, turf }: CellViewProps) {
  const shake = useRef(new Animated.Value(0)).current;
  const grow = useRef(new Animated.Value(1)).current;
  const prev = useRef({ mud, crate, turf });

  useEffect(() => {
    const was = prev.current;
    prev.current = { mud, crate, turf };
    if (was.turf !== turf && turf === 2) {
      grow.setValue(0.4);
      Animated.spring(grow, { toValue: 1, damping: 7, stiffness: 260, mass: 0.6, useNativeDriver: true }).start();
    }
    if (was.mud === mud && was.crate === crate) return;
    shake.setValue(0);
    Animated.timing(shake, {
      toValue: 1,
      duration: 260,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [mud, crate, turf, shake, grow]);

  // Engelsiz hücre hiç çizilmez: zemini tek parça `BoardBed` verir.
  if (!turf && !mud && !crate) return null;
  const dx = shake.interpolate({
    inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
    outputRange: [0, -3, 3, -2, 2, 0],
  });
  const crateSize = Math.round(cell * 0.96);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.cell,
        {
          left: col * cell,
          top: row * cell,
          width: cell,
          height: cell,
        },
      ]}
    >
      {turf > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: turf === 2 ? grow : 1 }] }]}>
          <Turf size={cell} grown={turf === 2} />
        </Animated.View>
      ) : null}
      {mud > 0 ? <Mud size={cell} layers={mud} /> : null}
      {crate > 0 ? (
        <Animated.View style={[styles.center, { transform: [{ translateX: dx }] }]}>
          <Crate size={crateSize} hp={crate} />
        </Animated.View>
      ) : null}
    </View>
  );
}

export const CellView = React.memo(CellViewBase);

/* ───────────────────────────── tahta yatağı ve çerçeve ───────────────────────────── */

/**
 * Tahtanın tamamı tek, durağan SVG: her dolu hücre için büyütülmüş
 * dikdörtgenler üst üste çizilir; birleşimleri tahtanın ŞEKLİNİ izleyen
 * yumuşak gölge → koyu dış çizgi → ince sıcak altın çerçeve → koyu iç çizgi
 * → lacivert yatak katmanlarını verir. En üstte yarı saydam soluk dama.
 * `mask` ("1" dolu, "0" delik) ve hücre boyu değişmedikçe yeniden çizilmez.
 * Çekiç seçiliyken çerçeve vurgu renginde yanar (hedef seçme kipi).
 */
export const BoardBed = React.memo(function BoardBed({
  cols,
  cell,
  pad,
  mask,
  hammer,
}: {
  cols: number;
  cell: number;
  pad: number;
  mask: string;
  hammer: boolean;
}) {
  const rows = Math.ceil(mask.length / cols);
  const w = cols * cell + pad * 2;
  const h = rows * cell + pad * 2;
  const on: { x: number; y: number; r: number; c: number }[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== "1") continue;
    const r = Math.floor(i / cols);
    const c = i % cols;
    on.push({ x: pad + c * cell, y: pad + r * cell, r, c });
  }
  const grow = (e: number, rx: number, fill: string, dy = 0) =>
    on.map((q, k) => <Rect key={k} x={q.x - e} y={q.y - e + dy} width={cell + e * 2} height={cell + e * 2} rx={rx} fill={fill} />);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="ubframe" x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={hammer ? UCLU_BOARD.accentHi : UCLU_BOARD.frameWoodHi} />
          <Stop offset="0.5" stopColor={hammer ? UCLU_BOARD.accent : UCLU_BOARD.frameWood} />
          <Stop offset="1" stopColor={hammer ? UCLU_BOARD.accentLo : UCLU_BOARD.frameWoodLo} />
        </LinearGradient>
        <LinearGradient id="ubglow" x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={UCLU_BOARD.beamCore} stopOpacity={0.1} />
          <Stop offset="0.6" stopColor={UCLU_BOARD.beamCore} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {/* Yumuşak gölge (grup saydamlığı: üst üste binen kareler koyulaşmaz). */}
      <G opacity={0.5}>{grow(Math.min(pad, 10), 14, UCLU_BOARD.vignetteInk, 4)}</G>
      <G>{grow(Math.min(pad - 1, 8), 12, UCLU_BOARD.frameWoodRim)}</G>
      <G>{grow(Math.min(pad - 2, 6.5), 10.5, "url(#ubframe)")}</G>
      <G>{grow(2.6, 7, UCLU_BOARD.frameWoodRim)}</G>
      <G>{grow(1.4, 6, UCLU_BOARD.well)}</G>
      {on.map((q, k) => (
        <Rect key={k} x={q.x} y={q.y} width={cell} height={cell} fill={(q.r + q.c) % 2 === 0 ? UCLU_BOARD.cellA : UCLU_BOARD.cellB} />
      ))}
      <G>{on.map((q, k) => (q.r < rows / 2 ? <Rect key={k} x={q.x} y={q.y} width={cell} height={cell} fill="url(#ubglow)" /> : null))}</G>
    </Svg>
  );
});

/**
 * Tahtanın üstünden geçen ışık süpürmesi: seviye açılışında bir kez, sonra
 * `repeat` açıkken ara ara (her süpürme sonlu bir animasyon; zamanlayıcı
 * bileşen kalkınca / repeat kapanınca temizlenir). Eğik, yumuşak bir parıltı
 * soldan sağa akar.
 */
export function ShineSweep({ size, tick, repeat = false }: { size: number; tick: number; repeat?: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  const [round, setRound] = useState(0);
  useEffect(() => {
    t.setValue(0);
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: 1100,
      delay: 250,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [tick, round, t]);
  useEffect(() => {
    if (!repeat) return;
    const timer = setTimeout(() => setRound((r) => r + 1), 7000 + (round % 3) * 1500);
    return () => clearTimeout(timer);
  }, [repeat, round]);
  const band = size * 0.42;
  const x = t.interpolate({
    inputRange: [0, 1],
    outputRange: [-band * 1.6, size + band * 0.6],
  });
  const opacity = t.interpolate({
    inputRange: [0, 0.1, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sweepClip]}>
      <Animated.View
        style={{
          position: "absolute",
          top: -size * 0.2,
          width: band,
          height: size * 1.4,
          opacity,
          transform: [{ translateX: x }, { rotate: "18deg" }],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="ubsweep" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={UCLU_BOARD.floodlight} stopOpacity={0} />
              <Stop offset="0.5" stopColor={UCLU_BOARD.floodlight} stopOpacity={0.22} />
              <Stop offset="1" stopColor={UCLU_BOARD.floodlight} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={10} height={10} fill="url(#ubsweep)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* ───────────────────────────── kilit katmanı ───────────────────────────── */

/** Buz kalıbı: yarı saydam, köşeli bir buz bloğu; parlak üst kenar ve çatlaklar (içindeki taş görünür). */
export function IceBlock({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="uice" x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor={UCLU_BOARD.iceHi} />
          <Stop offset="0.35" stopColor={UCLU_BOARD.iceBody} />
          <Stop offset="1" stopColor={UCLU_BOARD.iceLo} />
        </LinearGradient>
      </Defs>
      <Rect x={4} y={4} width={92} height={92} rx={14} fill="url(#uice)" stroke={UCLU_BOARD.iceHi} strokeWidth={2.4} />
      {/* Eğik bevel: üst-sol açık, alt-sağ koyu. */}
      <Path d="M8 22 Q8 8 22 8 L78 8 L70 16 L24 16 Q16 16 16 24 L16 70 L8 78 Z" fill={UCLU_BOARD.iceHi} opacity={0.65} />
      <Path d="M92 30 L92 78 Q92 92 78 92 L30 92 L38 84 L76 84 Q84 84 84 76 L84 38 Z" fill={UCLU_BOARD.iceLo} opacity={0.7} />
      <G stroke={UCLU_BOARD.iceCrack} strokeWidth={1.8} strokeLinecap="round" fill="none">
        <Path d="M60 16 L54 30 L62 38 L56 50" />
        <Path d="M54 30 L44 34" />
        <Path d="M84 60 L72 64 L68 76" />
      </G>
      <Path d="M22 26 L34 18" stroke={UCLU_BOARD.beamCore} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={22} cy={36} r={2} fill={UCLU_BOARD.beamCore} />
    </Svg>
  );
}

/** Kale ağı: düğümlü ip örgüsü (gölgeli), kalın beyaz kenar halatı. */
export function NetLock({ size }: { size: number }) {
  const lines = [20, 35, 50, 65, 80];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={5} y={5} width={90} height={90} rx={12} fill={UCLU_BOARD.netShade} />
      {/* İp gölgesi (hafif kaydırılmış koyu örgü) → kabartma etkisi. */}
      <G stroke={UCLU_BOARD.ropeLo} strokeWidth={4} transform="translate(1.2 1.8)">
        {lines.map((p) => (
          <React.Fragment key={p}>
            <Line x1={p} y1={6} x2={p} y2={94} />
            <Line x1={6} y1={p} x2={94} y2={p} />
          </React.Fragment>
        ))}
      </G>
      <G stroke={UCLU_BOARD.rope} strokeWidth={2.8}>
        {lines.map((p) => (
          <React.Fragment key={p}>
            <Line x1={p} y1={6} x2={p} y2={94} />
            <Line x1={6} y1={p} x2={94} y2={p} />
          </React.Fragment>
        ))}
      </G>
      <G fill={UCLU_BOARD.rope}>
        {lines.map((x) => lines.map((y) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={2.6} />))}
      </G>
      <Rect x={5} y={5} width={90} height={90} rx={12} fill="none" stroke={UCLU_BOARD.ropeLo} strokeWidth={7} transform="translate(0.8 1.4)" />
      <Rect x={5} y={5} width={90} height={90} rx={12} fill="none" stroke={UCLU_BOARD.post} strokeWidth={5} />
      <Rect x={9} y={7} width={40} height={2.4} rx={1.2} fill={UCLU_BOARD.beamCore} />
    </Svg>
  );
}

export interface LockViewProps {
  row: number;
  col: number;
  cell: number;
  snow: number;
  net: number;
}

function LockViewBase({ row, col, cell, snow, net }: LockViewProps) {
  const fade = useRef(new Animated.Value(snow > 0 || net > 0 ? 1 : 0)).current;
  const on = snow > 0 || net > 0;
  const kind = useRef<"snow" | "net">(snow > 0 ? "snow" : "net");
  if (on) kind.current = snow > 0 ? "snow" : "net";

  useEffect(() => {
    Animated.timing(fade, {
      toValue: on ? 1 : 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [on, fade]);

  const scale = fade.interpolate({
    inputRange: [0, 1],
    outputRange: [1.35, 1],
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.cell,
        {
          left: col * cell,
          top: row * cell,
          width: cell,
          height: cell,
          opacity: fade,
          transform: [{ scale }],
        },
      ]}
    >
      {kind.current === "snow" ? <IceBlock size={cell} /> : <NetLock size={cell} />}
    </Animated.View>
  );
}

export const LockView = React.memo(LockViewBase);

const styles = StyleSheet.create({
  cell: { position: "absolute" },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  sweepClip: { overflow: "hidden" },
});
