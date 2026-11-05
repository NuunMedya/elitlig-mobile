/**
 * Elit Üçlü taşları: statik çizim (PieceGlyph) + konumu canlandırılan taş (TileView).
 *
 * Her tür hem RENK hem ŞEKİL taşır (daire, kare, altıgen, kalkan, karo,
 * sekizgen) — renk körlüğünde de ayırt edilsin diye. İkonlar Ionicons; düdük
 * Ionicons'ta olmadığı için SVG ile çizilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";
import { duration } from "@/theme";
import { UCLU_BOARD, UCLU_PIECE_COLORS } from "@/lib/puzzle/ucluPalette";
import type { Special, Tile } from "@/lib/puzzle/ucluEngine";

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: (IconName | null)[] = ["football", "shirt", "footsteps", "hand-left", null, "trophy"];

/** Şekiller 100×100 görünüm kutusunda. */
function Shape({ kind, fill, stroke }: { kind: number; fill: string; stroke: string }) {
  const common = { fill, stroke, strokeWidth: 3, strokeLinejoin: "round" as const };
  switch (kind) {
    case 0:
      return <Circle cx={50} cy={50} r={44} {...common} />;
    case 1:
      return <Rect x={7} y={7} width={86} height={86} rx={24} {...common} />;
    case 2:
      return <Polygon points="50,5 91,28 91,72 50,95 9,72 9,28" {...common} />;
    case 3:
      return <Path d="M50 6 L89 17 Q92 62 50 95 Q8 62 11 17 Z" {...common} />;
    case 4:
      return <Rect x={17} y={17} width={66} height={66} rx={14} transform="rotate(45 50 50)" {...common} />;
    default:
      return <Polygon points="31,6 69,6 94,31 94,69 69,94 31,94 6,69 6,31" {...common} />;
  }
}

/** Düdük: gövde + ağızlık + halka. */
function Whistle({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={40} cy={58} r={26} fill={color} />
      <Rect x={40} y={32} width={50} height={18} rx={6} fill={color} />
      <Circle cx={40} cy={58} r={9} fill={UCLU_BOARD.shadow} />
      <Circle cx={22} cy={24} r={9} fill="none" stroke={color} strokeWidth={6} />
    </Svg>
  );
}

function SpecialMarks({ special }: { special: Special }) {
  if (special === "h" || special === "v") {
    const rot = special === "v" ? "rotate(90 50 50)" : undefined;
    return (
      <G transform={rot}>
        <Rect x={4} y={36} width={92} height={7} rx={3} fill={UCLU_BOARD.beamCore} opacity={0.85} />
        <Rect x={4} y={57} width={92} height={7} rx={3} fill={UCLU_BOARD.beamCore} opacity={0.85} />
        <Polygon points="2,50 15,40 15,60" fill={UCLU_BOARD.beamCore} />
        <Polygon points="98,50 85,40 85,60" fill={UCLU_BOARD.beamCore} />
      </G>
    );
  }
  if (special === "bomb") {
    return (
      <G>
        <Circle cx={50} cy={50} r={36} fill="none" stroke={UCLU_BOARD.beamCore} strokeWidth={6} strokeDasharray="10 7" />
        <Circle cx={50} cy={50} r={44} fill="none" stroke={UCLU_BOARD.goldHi} strokeWidth={3} opacity={0.9} />
      </G>
    );
  }
  return null;
}

export interface PieceGlyphProps {
  kind: Tile["kind"];
  color: number;
  special: Special;
  size: number;
}

/** Statik taş çizimi — HUD hedeflerinde de kullanılır. */
export const PieceGlyph = React.memo(function PieceGlyph({ kind, color, special, size }: PieceGlyphProps) {
  if (kind === "trophy") return <TrophyGlyph size={size} />;
  if (special === "ball") return <GoldenBall size={size} />;
  const pal = UCLU_PIECE_COLORS[Math.max(0, color) % UCLU_PIECE_COLORS.length];
  const icon = ICONS[color] ?? null;
  const shape = Math.max(0, color);
  const iconSize = Math.round(size * (shape === 4 ? 0.44 : special === "bomb" ? 0.4 : 0.5));
  const gid = `ug${color}`;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={pal.hi} />
            <Stop offset="0.55" stopColor={pal.base} />
            <Stop offset="1" stopColor={pal.lo} />
          </LinearGradient>
        </Defs>
        <Shape kind={shape} fill={`url(#${gid})`} stroke={pal.lo} />
        <Path d="M24 26 Q50 10 76 26 Q50 22 24 34 Z" fill={UCLU_BOARD.shine} />
        <SpecialMarks special={special} />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {icon ? <Ionicons name={icon} size={iconSize} color={pal.ink} /> : <Whistle size={iconSize * 1.05} color={pal.ink} />}
      </View>
    </View>
  );
});

function GoldenBall({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="ugold" cx="38%" cy="32%" r="70%">
            <Stop offset="0" stopColor={UCLU_BOARD.goldHi} />
            <Stop offset="0.5" stopColor={UCLU_BOARD.gold} />
            <Stop offset="1" stopColor={UCLU_BOARD.goldLo} />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={50} r={46} fill={UCLU_BOARD.flash} opacity={0.35} />
        <Circle cx={50} cy={50} r={40} fill="url(#ugold)" stroke={UCLU_BOARD.goldLo} strokeWidth={3} />
        <Path d="M78 14 L81 22 L89 25 L81 28 L78 36 L75 28 L67 25 L75 22 Z" fill={UCLU_BOARD.beamCore} />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Ionicons name="football" size={Math.round(size * 0.54)} color={UCLU_BOARD.goldInk} />
      </View>
    </View>
  );
}

function TrophyGlyph({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="ucup" cx="50%" cy="45%" r="55%">
            <Stop offset="0" stopColor={UCLU_BOARD.goldHi} stopOpacity={0.7} />
            <Stop offset="1" stopColor={UCLU_BOARD.gold} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={50} r={48} fill="url(#ucup)" />
        <Rect x={28} y={80} width={44} height={10} rx={4} fill={UCLU_BOARD.goldLo} />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Ionicons name="trophy" size={Math.round(size * 0.8)} color={UCLU_BOARD.gold} />
      </View>
    </View>
  );
}

/* ───────────────────────────── canlandırılan taş ───────────────────────────── */

export interface TileViewProps {
  tile: Tile;
  row: number;
  col: number;
  cell: number;
  /** Tahtanın üstünden düşerek gelecekse başlangıç satırı (yalnız ilk çizimde okunur). */
  spawnRow?: number;
  dying: boolean;
  selected: boolean;
  /** İpucu sallaması: yön ve tetik sayacı. */
  hintDx: number;
  hintDy: number;
  hintTick: number;
}

function TileViewBase({ tile, row, col, cell, spawnRow, dying, selected, hintDx, hintDy, hintTick }: TileViewProps) {
  const startRow = spawnRow ?? row;
  const pos = useRef(new Animated.ValueXY({ x: col * cell, y: startRow * cell })).current;
  const scale = useRef(new Animated.Value(spawnRow === undefined ? 0.2 : 1)).current;
  const squash = useRef(new Animated.Value(1)).current;
  const wiggle = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const last = useRef({ row: startRow, col });

  // İlk çizim: yerinde doğan (özel taş) taş "pop" ile belirir.
  useEffect(() => {
    if (spawnRow === undefined) {
      Animated.spring(scale, { toValue: 1, damping: 9, stiffness: 260, mass: 0.7, useNativeDriver: true }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Konum değişimi: aşağı → yerçekimi (hızlanarak) + iniş esnemesi; diğer → kayma.
  useEffect(() => {
    const prev = last.current;
    if (prev.row === row && prev.col === col) return;
    const drop = row - prev.row;
    last.current = { row, col };
    const target = { x: col * cell, y: row * cell };
    if (drop > 0) {
      Animated.sequence([
        Animated.timing(pos, {
          toValue: target,
          duration: 110 + Math.sqrt(drop) * 75,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(squash, { toValue: 0.86, duration: 60, useNativeDriver: true }),
          Animated.spring(squash, { toValue: 1, damping: 7, stiffness: 320, mass: 0.6, useNativeDriver: true }),
        ]),
      ]).start();
    } else {
      Animated.timing(pos, { toValue: target, duration: duration.base - 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [row, col, cell, pos, squash]);

  useEffect(() => {
    if (!dying) return;
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 70, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.timing(opacity, { toValue: 0, duration: 190, useNativeDriver: true }),
    ]).start();
  }, [dying, scale, opacity]);

  useEffect(() => {
    if (dying) return;
    Animated.spring(scale, { toValue: selected ? 1.12 : 1, damping: 12, stiffness: 300, mass: 0.6, useNativeDriver: true }).start();
  }, [selected, dying, scale]);

  // İpucu: komşusuna doğru sonlu sallanma (3 tur).
  useEffect(() => {
    if (!hintTick) return;
    wiggle.setValue(0);
    const swing = Animated.sequence([
      Animated.timing(wiggle, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: 0, duration: 200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]);
    Animated.loop(swing, { iterations: 3 }).start();
  }, [hintTick, wiggle]);

  const inset = Math.round(cell * 0.06);
  const amp = cell * 0.14;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tile,
        {
          width: cell,
          height: cell,
          padding: inset,
          opacity,
          transform: [
            { translateX: pos.x },
            { translateY: pos.y },
            { translateX: wiggle.interpolate({ inputRange: [0, 1], outputRange: [0, hintDx * amp] }) },
            { translateY: wiggle.interpolate({ inputRange: [0, 1], outputRange: [0, hintDy * amp] }) },
            { translateY: squash.interpolate({ inputRange: [0.8, 1], outputRange: [cell * 0.06, 0] }) },
            { scaleY: squash },
            { scaleX: squash.interpolate({ inputRange: [0.8, 1], outputRange: [1.12, 1] }) },
            { scale },
          ],
        },
      ]}
    >
      <PieceGlyph kind={tile.kind} color={tile.color} special={tile.special} size={cell - inset * 2} />
    </Animated.View>
  );
}

/** spawnRow yalnız ilk çizimde okunur; değişmesi yeniden çizim gerektirmez. */
export const TileView = React.memo(TileViewBase, (a, b) =>
  a.tile === b.tile &&
  a.row === b.row &&
  a.col === b.col &&
  a.cell === b.cell &&
  a.dying === b.dying &&
  a.selected === b.selected &&
  a.hintTick === b.hintTick &&
  a.hintDx === b.hintDx &&
  a.hintDy === b.hintDy,
);

const styles = StyleSheet.create({
  tile: { position: "absolute", left: 0, top: 0 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});
