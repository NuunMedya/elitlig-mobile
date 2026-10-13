/**
 * OYUN FİGÜRLERİ — kaleci, arkadan görünen koşucu ve antrenman konisi.
 *
 * NEDEN ÇUBUK ADAM DEĞİL: eski kaleci beş çizgi ve bir daireydi; slalomdaki
 * "oyuncu" yalnız bir toptu, koniler düz üçgendi. Burada her figür bir
 * İSKELET (eklem noktaları) üstüne kurulur ve uzuvlar kontürlü kalın
 * çizgilerle çizilir — vektör illüstrasyon dili: koyu kontur + düz renk +
 * tek yönlü gölge. Pozlar eklemlerin ara değeriyle değişir; kalecinin hazır
 * duruşundan uçuşa geçişi kesintisizdir, koşucunun adımı sürekli bir döngüdür.
 *
 * BİRİM: her figür 100 birim boyunda, AYAKLARI orijinde (0,0) çizilir ve
 * çağıran `scale` ile piksele çevirir. Böylece perspektifteki her derinlikte
 * aynı çizim kullanılır.
 */

import { Fragment } from "react";
import {
  Circle,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polyline,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { art } from "@/lib/game/art";
import { fonts } from "@/theme";

type P = readonly [number, number];

const mix = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const pts = (...list: P[]) => list.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");

/** Kontürlü uzuv: önce koyu, kalın bir alt çizgi, üstüne asıl renk. */
function Limb({ points, color, width }: { points: P[]; color: string; width: number }) {
  const p = pts(...points);
  return (
    <>
      <Polyline
        points={p}
        stroke={art.outline}
        strokeWidth={width + 2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Polyline
        points={p}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  );
}

/* ═══════════════════════════════ DEFS ═══════════════════════════════ */

/** Figürlerin paylaştığı gradyanlar — her tuvalin `<Defs>`'ine bir kez. */
export function FigureDefs() {
  return (
    <>
      <LinearGradient id="keeperShirt" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={art.keeperJersey} />
        <Stop offset="1" stopColor={art.keeperJerseyDark} />
      </LinearGradient>
      <LinearGradient id="runnerShirt" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={art.playerJersey} />
        <Stop offset="1" stopColor={art.playerJerseyDark} />
      </LinearGradient>
      <LinearGradient id="coneBody" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor={art.coneLight} />
        <Stop offset="0.45" stopColor={art.coneMid} />
        <Stop offset="1" stopColor={art.coneDark} />
      </LinearGradient>
    </>
  );
}

/* ═══════════════════════════════ KALECİ ═══════════════════════════════ */

/**
 * İki uç poz: HAZIR (dizler kırık, eller açık, kameraya dönük) ve UÇUŞ
 * (gövdenin çerçevesinde kollar baş üstünde uzanmış, bacaklar geride).
 * Uçuşta bütün gövde kalça etrafında döner; poz ve dönüş aynı `dive`
 * değerinden gelir, yani geçiş tek bir sayıyla sürülür.
 */
const READY = {
  hip: [0, -46] as P,
  neck: [0, -79] as P,
  head: [0, -89] as P,
  lShoulder: [-14, -76] as P,
  rShoulder: [14, -76] as P,
  lElbow: [-25, -63] as P,
  rElbow: [25, -63] as P,
  lHand: [-33, -53] as P,
  rHand: [33, -53] as P,
  lHip: [-7, -46] as P,
  rHip: [7, -46] as P,
  lKnee: [-14, -24] as P,
  rKnee: [14, -24] as P,
  lFoot: [-16, -2] as P,
  rFoot: [16, -2] as P,
};

/** Sağa uçuş; sola uçuş x aynalanarak elde edilir. */
const DIVE: typeof READY = {
  hip: [0, -46],
  neck: [0, -79],
  head: [1, -89],
  lShoulder: [-13, -77],
  rShoulder: [13, -77],
  lElbow: [-7, -99],
  rElbow: [11, -99],
  lHand: [-5, -116],
  rHand: [15, -115],
  lHip: [-7, -46],
  rHip: [7, -46],
  lKnee: [-11, -22],
  rKnee: [10, -28],
  lFoot: [-13, 0],
  rFoot: [4, -10],
};

export function Keeper({
  x,
  y,
  scale,
  dive,
  lift,
  crouch,
}: {
  /** Ayakların ekrandaki konumu. */
  x: number;
  y: number;
  /** Piksel / birim. */
  scale: number;
  /** -1 (sola tam uçuş) … 0 (hazır) … 1 (sağa tam uçuş). */
  dive: number;
  /** Yerden yükselme, 0–1. */
  lift: number;
  /** Hazır duruştaki çömelme, 0–1 (bekleme sallanması). */
  crouch: number;
}) {
  const t = Math.min(1, Math.abs(dive));
  const dir = dive < 0 ? -1 : 1;
  const sink = crouch * 5 * (1 - t);

  // Eklemleri ara değerle; sola uçuşta DIVE aynalanır.
  const j = {} as Record<keyof typeof READY, P>;
  for (const key of Object.keys(READY) as (keyof typeof READY)[]) {
    let target = DIVE[key];
    if (dir < 0) {
      const mirrorKey = (key.startsWith("l")
        ? "r" + key.slice(1)
        : key.startsWith("r")
          ? "l" + key.slice(1)
          : key) as keyof typeof READY;
      const m = DIVE[mirrorKey];
      target = [-m[0], m[1]];
    }
    const base = READY[key];
    // Çömelme yalnız üst gövdeyi indirir; ayaklar yerde kalır.
    const crouched: P = key.endsWith("Foot") ? base : [base[0], base[1] + sink];
    j[key] = mix(crouched, target, t);
  }

  const angle = dir * t * 78;
  // Uçuşta gövde yatar; kalça yere doğru iner ki yatay gövde havada asılı
  // kalmasın. `lift` uçuşun ortasında onu yeniden kaldırır.
  const rise = lift * 34 - t * 30;
  const [hx, hy] = j.hip;

  return (
    <G transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)})`}>
      {/* Gölge zeminde kalır; uçuşta uzar ve solar. */}
      <Ellipse
        cx={dir * t * 30}
        cy={0}
        rx={20 + t * 34}
        ry={5}
        fill={art.shadow}
        opacity={0.35 * (1 - lift * 0.5)}
      />
      <G transform={`translate(${(dir * t * 8).toFixed(2)} ${(-rise).toFixed(2)}) rotate(${angle.toFixed(2)} ${hx} ${hy})`}>
        {/* Bacaklar: uyluk ten, baldır çorap. */}
        <Limb points={[j.lHip, j.lKnee]} color={art.skin} width={7} />
        <Limb points={[j.rHip, j.rKnee]} color={art.skin} width={7} />
        <Limb points={[j.lKnee, j.lFoot]} color={art.keeperJersey} width={6.5} />
        <Limb points={[j.rKnee, j.rFoot]} color={art.keeperJersey} width={6.5} />
        <Ellipse cx={j.lFoot[0] - 2} cy={j.lFoot[1] + 1} rx={5} ry={3} fill={art.boot} />
        <Ellipse cx={j.rFoot[0] + 2} cy={j.rFoot[1] + 1} rx={5} ry={3} fill={art.boot} />

        {/* Şort */}
        <Path
          d={`M ${j.lHip[0] - 5} ${hy - 6} L ${j.rHip[0] + 5} ${hy - 6} L ${j.rHip[0] + 7} ${hy + 9}
              L ${hx + 1.5} ${hy + 8} L ${hx} ${hy + 4} L ${hx - 1.5} ${hy + 8} L ${j.lHip[0] - 7} ${hy + 9} Z`}
          fill={art.keeperShorts}
          stroke={art.outline}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />

        {/* Kollar (forma kolu + eldiven) — gövdenin ARKASINDAN çıkar. */}
        <Limb points={[j.lShoulder, j.lElbow, j.lHand]} color={art.keeperJersey} width={7} />
        <Limb points={[j.rShoulder, j.rElbow, j.rHand]} color={art.keeperJersey} width={7} />

        {/* Gövde */}
        <Path
          d={`M ${j.lShoulder[0] - 3} ${j.lShoulder[1] - 1} Q ${hx} ${j.neck[1] - 3} ${j.rShoulder[0] + 3} ${j.rShoulder[1] - 1}
              L ${j.rHip[0] + 4} ${hy - 4} Q ${hx} ${hy - 1} ${j.lHip[0] - 4} ${hy - 4} Z`}
          fill="url(#keeperShirt)"
          stroke={art.outline}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        {/* Göğüs şeridi ve numara */}
        <Path
          d={`M ${j.lShoulder[0] - 1} ${j.lShoulder[1] + 6} L ${j.rShoulder[0] + 1} ${j.rShoulder[1] + 6}`}
          stroke={art.keeperTrim}
          strokeWidth={2}
          opacity={0.7}
        />
        <SvgText
          x={hx}
          y={(j.neck[1] + hy) / 2 + 6}
          fontSize={13}
          fontFamily={fonts.bold}
          fill={art.keeperTrim}
          textAnchor="middle"
          opacity={0.85}
        >
          1
        </SvgText>

        {/* Eldivenler — büyük ve beyaz: kalecinin imzası. */}
        <Circle cx={j.lHand[0]} cy={j.lHand[1]} r={6} fill={art.keeperGlove} stroke={art.outline} strokeWidth={1.3} />
        <Circle cx={j.rHand[0]} cy={j.rHand[1]} r={6} fill={art.keeperGlove} stroke={art.outline} strokeWidth={1.3} />
        <Path
          d={`M ${j.lHand[0] - 4} ${j.lHand[1] + 3} L ${j.lHand[0] + 4} ${j.lHand[1] + 3}`}
          stroke={art.keeperGloveCuff}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
        <Path
          d={`M ${j.rHand[0] - 4} ${j.rHand[1] + 3} L ${j.rHand[0] + 4} ${j.rHand[1] + 3}`}
          stroke={art.keeperGloveCuff}
          strokeWidth={2.2}
          strokeLinecap="round"
        />

        {/* Boyun ve baş */}
        <Rect x={j.neck[0] - 3} y={j.neck[1] - 4} width={6} height={6} fill={art.skinShade} />
        <Circle cx={j.head[0]} cy={j.head[1]} r={8.5} fill={art.skin} stroke={art.outline} strokeWidth={1.3} />
        <Path
          d={`M ${j.head[0] - 8.6} ${j.head[1] - 1} Q ${j.head[0] - 8} ${j.head[1] - 11} ${j.head[0]} ${j.head[1] - 10.5}
              Q ${j.head[0] + 8} ${j.head[1] - 11} ${j.head[0] + 8.6} ${j.head[1] - 1}
              Q ${j.head[0] + 4} ${j.head[1] - 6} ${j.head[0]} ${j.head[1] - 6} Q ${j.head[0] - 4} ${j.head[1] - 6} ${j.head[0] - 8.6} ${j.head[1] - 1} Z`}
          fill={art.hair}
        />
        <Circle cx={j.head[0] - 3} cy={j.head[1] + 0.5} r={1.1} fill={art.outline} />
        <Circle cx={j.head[0] + 3} cy={j.head[1] + 0.5} r={1.1} fill={art.outline} />
      </G>
    </G>
  );
}

/* ═════════════════════════ ARKADAN KOŞUCU ═════════════════════════ */

/**
 * Slalomun oyuncusu, kamera arkasında. Adım döngüsü tek bir `phase`
 * (radyan) ile sürülür: her bacak yarım tur faz farkıyla yerden kalkar, kollar
 * bacakların tersine sallanır, gövde her adımda hafifçe iner-kalkar.
 */
export function RunnerBack({
  x,
  y,
  scale,
  phase,
  tilt,
  opacity = 1,
}: {
  x: number;
  y: number;
  scale: number;
  phase: number;
  /** Gövdenin yatma açısı (derece). */
  tilt: number;
  opacity?: number;
}) {
  const bob = Math.abs(Math.cos(phase)) * 2.2;
  const legs = [0, Math.PI].map((offset, i) => {
    const side = i === 0 ? -1 : 1;
    const raise = Math.max(0, Math.sin(phase + offset));
    const hip: P = [side * 6, -44 + bob];
    const knee: P = [side * 7.5, -23 + bob - raise * 5];
    const foot: P = [side * 6.5, -raise * 19 + (raise > 0 ? bob * 0.3 : 0)];
    return { side, raise, hip, knee, foot };
  });
  const swing = Math.sin(phase) * 7;

  return (
    <G
      opacity={opacity}
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)}) rotate(${tilt.toFixed(2)} 0 -40)`}
    >
      <Ellipse cx={0} cy={1} rx={19} ry={5} fill={art.shadow} opacity={0.38} />

      {/* Bacaklar — havadaki ayağın tabanı (turuncu krampon) görünür. */}
      {legs.map(({ side, raise, hip, knee, foot }) => (
        <Fragment key={side}>
          <Limb points={[hip, knee]} color={art.skin} width={7.5} />
          <Limb points={[knee, foot]} color={art.playerSock} width={7} />
          <Ellipse
            cx={foot[0]}
            cy={foot[1] + 1}
            rx={4.6}
            ry={raise > 0.15 ? 4.2 : 3}
            fill={raise > 0.15 ? art.bootSole : art.boot}
            stroke={art.outline}
            strokeWidth={1}
          />
        </Fragment>
      ))}

      {/* Şort */}
      <Path
        d={`M -13 ${-52 + bob} L 13 ${-52 + bob} L 14.5 ${-36 + bob} L 1.5 ${-35 + bob} L 0 ${-39 + bob}
            L -1.5 ${-35 + bob} L -14.5 ${-36 + bob} Z`}
        fill={art.playerShorts}
        stroke={art.outline}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <Path
        d={`M 4 ${-51 + bob} L 13 ${-51 + bob} L 14 ${-37 + bob} L 6 ${-36.5 + bob} Z`}
        fill={art.playerShortsShade}
      />

      {/* Kollar */}
      <Limb
        points={[[-15, -76 + bob], [-21, -63 + bob + swing * 0.6], [-19, -51 + bob + swing]]}
        color={art.skin}
        width={6}
      />
      <Limb
        points={[[15, -76 + bob], [21, -63 + bob - swing * 0.6], [19, -51 + bob - swing]]}
        color={art.skin}
        width={6}
      />

      {/* Gövde — arkadan forma: isim ve numara. */}
      <Path
        d={`M -17 ${-77 + bob} Q 0 ${-82 + bob} 17 ${-77 + bob} L 13.5 ${-50 + bob} Q 0 ${-48 + bob} -13.5 ${-50 + bob} Z`}
        fill="url(#runnerShirt)"
        stroke={art.outline}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {/* Kısa kollar */}
      <Path d={`M -17 ${-77 + bob} L -22 ${-66 + bob} L -16 ${-64 + bob} Z`} fill={art.playerJerseyDark} stroke={art.outline} strokeWidth={1.1} strokeLinejoin="round" />
      <Path d={`M 17 ${-77 + bob} L 22 ${-66 + bob} L 16 ${-64 + bob} Z`} fill={art.playerJerseyDark} stroke={art.outline} strokeWidth={1.1} strokeLinejoin="round" />
      <SvgText
        x={0}
        y={-70 + bob}
        fontSize={4.6}
        fontFamily={fonts.bold}
        fill={art.playerTrim}
        textAnchor="middle"
        letterSpacing={0.6}
      >
        ELİTLİG
      </SvgText>
      <SvgText
        x={0}
        y={-54.5 + bob}
        fontSize={15}
        fontFamily={fonts.bold}
        fill={art.playerTrim}
        textAnchor="middle"
      >
        10
      </SvgText>

      {/* Boyun ve başın arkası */}
      <Rect x={-3.2} y={-82 + bob} width={6.4} height={6} fill={art.skinShade} />
      <Ellipse cx={-8.6} cy={-86 + bob} rx={1.8} ry={2.6} fill={art.skin} stroke={art.outline} strokeWidth={0.8} />
      <Ellipse cx={8.6} cy={-86 + bob} rx={1.8} ry={2.6} fill={art.skin} stroke={art.outline} strokeWidth={0.8} />
      <Circle cx={0} cy={-88 + bob} r={8.6} fill={art.hair} stroke={art.outline} strokeWidth={1.3} />
      <Path
        d={`M -6 ${-93 + bob} Q 0 ${-97 + bob} 5 ${-93 + bob}`}
        stroke={art.white}
        strokeOpacity={0.18}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
    </G>
  );
}

/* ═══════════════════════════════ KONİ ═══════════════════════════════ */

/** Bir yüksekliğin koni gövdesindeki yarı genişliği (tepe 7, taban 28). */
const coneHalf = (y: number) => 7 + 21 * ((y + 94) / 85);

function coneBand(top: number, bottom: number): string {
  const a = coneHalf(top);
  const b = coneHalf(bottom);
  return `M ${-a} ${top} Q 0 ${top + 2.5} ${a} ${top} L ${b} ${bottom} Q 0 ${bottom + 3} ${-b} ${bottom} Z`;
}

const CONE_BODY = "M -28 -9 L -7 -94 Q 0 -100 7 -94 L 28 -9 Q 0 -3 -28 -9 Z";
const CONE_BAND_HIGH = coneBand(-66, -54);
const CONE_BAND_LOW = coneBand(-38, -25);

/**
 * Turuncu antrenman konisi: kare taban, yansıtıcı beyaz bantlar, soldan gelen
 * ışık. `glow` sıyırma anında koninin etrafında yeşil bir hale açar.
 */
export function Cone({
  x,
  y,
  scale,
  rotation = 0,
  opacity = 1,
  glow = 0,
}: {
  x: number;
  y: number;
  scale: number;
  rotation?: number;
  opacity?: number;
  glow?: number;
}) {
  return (
    <G
      opacity={opacity}
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)}) rotate(${rotation.toFixed(1)} 0 -10)`}
    >
      <Ellipse cx={6} cy={2} rx={48} ry={9} fill={art.shadow} opacity={0.34} />
      {glow > 0 ? (
        <Ellipse cx={0} cy={-2} rx={52 + glow * 14} ry={12 + glow * 4} fill="none" stroke={art.goal} strokeWidth={4} opacity={glow} />
      ) : null}
      {/* Taban */}
      <Path d="M -44 -7 L 44 -7 L 40 4 L -40 4 Z" fill={art.coneBase} />
      <Path d="M -40 -12 L 40 -12 L 44 -7 L -44 -7 Z" fill={art.coneBaseTop} />
      {/* Gövde */}
      <Path d={CONE_BODY} fill="url(#coneBody)" stroke={art.coneDark} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d={CONE_BAND_HIGH} fill={art.coneBand} opacity={0.95} />
      <Path d={CONE_BAND_LOW} fill={art.coneBand} opacity={0.95} />
      {/* Soldan ışık */}
      <Path d="M -19 -16 L -5.5 -86" stroke={art.white} strokeOpacity={0.4} strokeWidth={3.2} strokeLinecap="round" />
    </G>
  );
}
