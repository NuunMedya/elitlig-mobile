/**
 * Futbol topu — gerçek 3B desenli, gölgelendirilmiş, dönebilen.
 *
 * Katmanlar (alttan üste):
 *   1. Gövde: beyazdan kenarda griye inen radyal gradyan → küre hacmi.
 *   2. Yamalar: `lib/game/sphere.ts` yönelim matrisinden izdüşümlenen beşgenler.
 *   3. Gölgelendirme: merkezde saydam, kenarda koyulaşan ikinci gradyan;
 *      yamaları da kenarda karartır — top düz bir çıkartma gibi durmaz.
 *   4. Parlama: sol üstte küçük bir yansıma, projektör ışığını okutur.
 *
 * Gradyan kimlikleri `BallDefs` ile her `<Svg>`'nin `<Defs>`'ine bir kez
 * eklenir; aynı tuvaldeki bütün toplar onları paylaşır.
 */

import { Circle, Ellipse, G, Path, RadialGradient, Stop } from "react-native-svg";

import { art } from "@/lib/game/art";
import { patchPath, type Orientation } from "@/lib/game/sphere";

export function BallDefs() {
  return (
    <>
      <RadialGradient id="ballBody" cx="38%" cy="34%" r="70%">
        <Stop offset="0" stopColor={art.ballBody} />
        <Stop offset="0.62" stopColor={art.ballBody} />
        <Stop offset="1" stopColor={art.ballEdge} />
      </RadialGradient>
      <RadialGradient id="ballShade" cx="40%" cy="36%" r="68%">
        <Stop offset="0.55" stopColor={art.outline} stopOpacity={0} />
        <Stop offset="1" stopColor={art.outline} stopOpacity={0.42} />
      </RadialGradient>
    </>
  );
}

export function SoccerBall({
  cx,
  cy,
  r,
  orientation,
  opacity = 1,
}: {
  cx: number;
  cy: number;
  r: number;
  orientation: Orientation;
  opacity?: number;
}) {
  if (r < 0.6) return null;
  // Çok küçük topta yama ayrıntısı piksel gürültüsüdür; yalnız gövde çizilir.
  const detailed = r >= 3;
  return (
    <G opacity={opacity}>
      <Circle cx={cx} cy={cy} r={r} fill="url(#ballBody)" />
      {detailed ? (
        <Path
          d={patchPath(orientation, r * 0.985, cx, cy)}
          fill={art.ballPatch}
          stroke={art.ballPatchEdge}
          strokeWidth={Math.max(0.3, r * 0.04)}
          strokeLinejoin="round"
        />
      ) : null}
      <Circle cx={cx} cy={cy} r={r} fill="url(#ballShade)" />
      {detailed ? (
        <Ellipse
          cx={cx - r * 0.36}
          cy={cy - r * 0.42}
          rx={r * 0.28}
          ry={r * 0.17}
          fill={art.white}
          opacity={0.75}
          transform={`rotate(-30 ${(cx - r * 0.36).toFixed(2)} ${(cy - r * 0.42).toFixed(2)})`}
        />
      ) : null}
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={art.outline}
        strokeOpacity={0.35}
        strokeWidth={Math.max(0.4, r * 0.06)}
      />
    </G>
  );
}

/** Topun zemindeki yumuşak gölgesi — yükseldikçe küçülür ve solar. */
export function BallShadow({
  cx,
  cy,
  r,
  height = 0,
}: {
  cx: number;
  cy: number;
  r: number;
  /** Topun yerden yüksekliği, top yarıçapı cinsinden. */
  height?: number;
}) {
  const lift = Math.min(1, height / 6);
  return (
    <Ellipse
      cx={cx + r * 0.25}
      cy={cy}
      rx={r * (1.05 - lift * 0.45)}
      ry={r * (0.32 - lift * 0.14)}
      fill={art.shadow}
      opacity={0.42 * (1 - lift * 0.7)}
    />
  );
}
