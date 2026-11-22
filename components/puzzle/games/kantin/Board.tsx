/**
 * Kantin tahtasının parçaları (2026-11 yenilemesi) — hepsi memo'lu; yalnız
 * kendi verisi değişince yeniden çizilir (süre tik'i HUD ve sabır halkası
 * dışında hiçbir şeye dokunmaz).
 *
 * SAHNE (yukarıdan aşağı): HUD · çizgili kantin tentesi · gece stadyumu
 * (projektörler, kalabalık tribün) önünde sıraya girmiş taraftarlar ve
 * BÜYÜK sipariş balonları · ahşap tezgâh · bekleme tepsisi · ürün rafları ·
 * alt dok.
 *
 * SİPARİŞ BALONU sahnenin en okunaklı yüzeyidir: beyaz zemin, koyu kalın
 * kontur, her ürün kendi hücresinde büyük ikon. Hazır olan ürünün hücresi
 * yeşile döner ve üstüne büyük onay rozeti gelir; sağ üstte "kaç ürün kaldı"
 * rozeti, sol üstte sabır halkası (süre dolduğunda kızarır). VIP balonu
 * altın kenarlı ve yıldızlıdır. Servis edilen balon yeşile boyanır, ortada
 * kocaman bir onay belirir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";

import { kantinCrowd, kantinScene as S } from "@/lib/puzzle/kantinPalette";
import { KANTIN_PRODUCTS, type KantinItem, type KantinOrder } from "@/lib/puzzle/levels/kantin";
import { Touchable } from "@/components/ui";
import { fonts, radius, space, textScale, touchSlop, type } from "@/theme";

import { BoosterButton3D, HudPill, IconDisc, usePop, wave } from "../soyunma/CartoonKit";
import { FanFigure, type FanMood } from "./Fan";
import { CoinIcon, CrateIcon, ProductIcon, TileGloss } from "./ProductIcon";

export const productName = (p: number) => KANTIN_PRODUCTS[p]?.name ?? "Ürün";

/* ───────────────────────────── balon geometrisi ───────────────────────────── */

/** Balon kenar kalınlığı, iç boşluk, hücre aralığı, sabır şeridi. */
export const BUBBLE_BORDER = 3;
export const BUBBLE_PAD = 6;
export const CELL_GAP = 4;
/** Balonun üstündeki rozetler balon dışına taşar; bu pay yerleşimde ayrılır. */
export const BUBBLE_TOPPAD = 10;
export const BUBBLE_TAIL = 9;

export interface BubbleGeom {
  cols: number;
  rows: number;
  cell: number;
  w: number;
  h: number;
  /** i. hücrenin balon içi merkez konumu (balonun sol-üst köşesine göre). */
  at: (i: number) => { x: number; y: number };
}

/**
 * Balonun ızgarası: ürünler mümkünse tek satıra, sığmazsa 2×2'ye dizilir.
 * Hücre `cellMax`'ı aşmaz; balon genişliği sütun genişliğini aşmaz.
 */
export function bubbleGeom(n: number, maxW: number, cellMax: number): BubbleGeom {
  const inner = maxW - BUBBLE_PAD * 2 - BUBBLE_BORDER * 2;
  const oneRow = Math.floor((inner - (n - 1) * CELL_GAP) / n);
  const twoCols = Math.min(2, n);
  const twoRow = Math.floor((inner - (twoCols - 1) * CELL_GAP) / twoCols);
  // Tek satırda hücre en az iki satırlık hücrenin %72'si kadarsa tek satır.
  const single = n <= 2 || oneRow >= Math.min(cellMax, twoRow) * 0.72;
  const cols = single ? n : twoCols;
  const rows = Math.ceil(n / cols);
  const cell = Math.max(16, Math.min(cellMax, single ? oneRow : twoRow));
  const w = cols * cell + (cols - 1) * CELL_GAP + BUBBLE_PAD * 2 + BUBBLE_BORDER * 2;
  const h = rows * cell + (rows - 1) * CELL_GAP + BUBBLE_PAD * 2 + BUBBLE_BORDER * 2;
  return {
    cols,
    rows,
    cell,
    w,
    h,
    at: (i) => {
      const r = Math.floor(i / cols);
      // Son satır eksikse ortalanır (3 ürün: üstte 2, altta 1 ortada).
      const inRow = r === rows - 1 ? n - r * cols : cols;
      const c = i % cols;
      const rowW = inRow * cell + (inRow - 1) * CELL_GAP;
      const left = (w - rowW) / 2;
      return { x: left + c * (cell + CELL_GAP) + cell / 2, y: BUBBLE_BORDER + BUBBLE_PAD + r * (cell + CELL_GAP) + cell / 2 };
    },
  };
}

/* ───────────────────────────── tente ───────────────────────────── */

/** Kantinin çizgili tentesi: kırmızı-beyaz şeritler, dalgalı alt kenar. */
export const Awning = memo(function Awning({ w, h }: { w: number; h: number }) {
  const n = Math.max(6, Math.round(w / 34));
  const sw = w / n;
  const body = h * 0.62;
  const scallop = h - body;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: n }, (_, i) => {
        const x = i * sw;
        const color = i % 2 ? S.awningB : S.awningA;
        return (
          <G key={i}>
            <Rect x={x} y={0} width={sw + 0.5} height={body} fill={color} />
            <Path d={`M${x} ${body} Q${x + sw / 2} ${body + scallop * 2} ${x + sw} ${body} Z`} fill={color} />
          </G>
        );
      })}
      <Rect x={0} y={0} width={w} height={body * 0.28} fill={S.awningEdge} opacity={0.35} />
      <Rect x={0} y={body - 2} width={w} height={2} fill={S.awningEdge} opacity={0.25} />
    </Svg>
  );
});

/* ───────────────────────────── stadyum zemini ───────────────────────────── */

/**
 * Gece stadyumu: koyu gökyüzü, iki projektör ve ışık hüzmesi, iki katlı
 * tribün ve renkli kalabalık (belirlenimci desen), alt kenarda reklam panosu.
 * Statik çizimdir: yalnız ölçü değişince yeniden çizilir.
 */
export const Stadium = memo(function Stadium({ w, h }: { w: number; h: number }) {
  const crowd = useMemo(() => {
    const out: { x: number; y: number; r: number; c: string; arm: boolean }[] = [];
    const rows = Math.max(4, Math.round((h * 0.5) / 9));
    const top = h * 0.3;
    const rowH = (h * 0.56) / rows;
    for (let row = 0; row < rows; row += 1) {
      const r = Math.max(2.6, rowH * 0.36 + row * 0.12);
      const step = r * 2.5;
      const count = Math.ceil(w / step) + 1;
      for (let i = 0; i < count; i += 1) {
        const hash = (i * 73 + row * 151 + 17) % 97;
        out.push({
          x: i * step + (row % 2 ? step / 2 : 0) + ((hash % 5) - 2) * 0.6,
          y: top + row * rowH + rowH * 0.5 + ((hash % 3) - 1) * 0.8,
          r,
          c: kantinCrowd[hash % kantinCrowd.length],
          arm: hash % 11 === 0,
        });
      }
    }
    return out;
  }, [w, h]);
  const lamp = (cx: number) => (
    <G>
      <Rect x={cx - 2} y={h * 0.08} width={4} height={h * 0.26} fill={S.floodPole} />
      <Rect x={cx - 14} y={h * 0.02} width={28} height={13} rx={3} fill={S.floodPole} />
      {[0, 1, 2, 3].map((k) => (
        <Circle key={k} cx={cx - 9 + k * 6} cy={h * 0.02 + 6.5} r={2.4} fill={S.floodlight} />
      ))}
    </G>
  );
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="ksky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={S.skyTop} />
          <Stop offset="1" stopColor={S.skyBottom} />
        </LinearGradient>
        <LinearGradient id="kbeam" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={S.beam} stopOpacity={0.32} />
          <Stop offset="1" stopColor={S.beam} stopOpacity={0} />
        </LinearGradient>
        <RadialGradient id="kglow" cx="50%" cy="40%" r="60%">
          <Stop offset="0" stopColor={S.beam} stopOpacity={0.16} />
          <Stop offset="1" stopColor={S.beam} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="kstandfade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={S.standHigh} />
          <Stop offset="1" stopColor={S.standLow} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#ksky)" />
      {/* tribün katları */}
      <Rect x={0} y={h * 0.26} width={w} height={h * 0.62} fill="url(#kstandfade)" />
      <Rect x={0} y={h * 0.26} width={w} height={2} fill={S.standRail} />
      <Rect x={0} y={h * 0.56} width={w} height={2} fill={S.standRail} opacity={0.8} />
      {crowd.map((p, i) => (
        <G key={i}>
          <Circle cx={p.x} cy={p.y + p.r * 1.3} r={p.r * 1.15} fill={p.c} opacity={0.75} />
          <Circle cx={p.x} cy={p.y} r={p.r * 0.72} fill={S.standLow} opacity={0.85} />
          {p.arm ? <Rect x={p.x + p.r * 0.6} y={p.y - p.r * 2.4} width={p.r * 0.5} height={p.r * 2.4} fill={p.c} opacity={0.75} /> : null}
        </G>
      ))}
      {/* projektör hüzmeleri ve ışık */}
      <Polygon points={`${w * 0.12 - 10},${h * 0.06} ${w * 0.12 + 10},${h * 0.06} ${w * 0.5},${h} ${w * 0.05},${h}`} fill="url(#kbeam)" />
      <Polygon points={`${w * 0.88 - 10},${h * 0.06} ${w * 0.88 + 10},${h * 0.06} ${w * 0.95},${h} ${w * 0.5},${h}`} fill="url(#kbeam)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#kglow)" />
      {lamp(w * 0.12)}
      {lamp(w * 0.88)}
      {/* reklam panosu */}
      <Rect x={0} y={h * 0.88} width={w} height={h * 0.12} fill={S.signBoard} />
      <Rect x={0} y={h * 0.88} width={w} height={1.5} fill={S.signText} opacity={0.6} />
    </Svg>
  );
});

/* ───────────────────────────── tezgâh ───────────────────────────── */

/** Ahşap tezgâh: açık üst yüzey + ön tahta (damar çizgileri) + alt gölge. */
export const Counter = memo(function Counter({ w, h }: { w: number; h: number }) {
  const top = Math.max(6, Math.round(h * 0.34));
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="kwood" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={S.wood} />
          <Stop offset="1" stopColor={S.woodDark} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={top} width={w} height={h - top} fill="url(#kwood)" />
      {Array.from({ length: Math.ceil(w / 46) }, (_, i) => (
        <Path
          key={i}
          d={`M${i * 46 + 6} ${top + 4} Q${i * 46 + 26} ${top + (h - top) * 0.5} ${i * 46 + 12} ${h - 3}`}
          stroke={S.woodGrain}
          strokeWidth={1.4}
          fill="none"
        />
      ))}
      <Rect x={0} y={0} width={w} height={top} fill={S.counterTop} />
      <Rect x={0} y={top - 2} width={w} height={2} fill={S.counterTopEdge} />
      <Rect x={0} y={1} width={w} height={2} fill={S.white} opacity={0.5} />
      <Rect x={0} y={h - 3} width={w} height={3} fill={S.woodEdge} />
    </Svg>
  );
});

/* ───────────────────────────── HUD ───────────────────────────── */

export const Hud = memo(function Hud({
  served,
  total,
  timeLeft,
  tips,
  tipsBump,
  height,
  onPause,
  width,
}: {
  /** HUD genişliği: durdur düğmesiyle dar satırda haplar küçülür, sipariş hapında yalnız sayı kalır. */
  width?: number;
  /** Durdur: HUD satırının sağ ucunda, haplarla aynı dilde yuvarlak düğme. */
  onPause?: () => void;
  served: number;
  total: number;
  timeLeft: number | null;
  tips: number;
  tipsBump: number;
  height: number;
}) {
  const bump = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const goalPop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!tipsBump) return;
    bump.setValue(1.2);
    Animated.spring(bump, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [tipsBump, bump]);
  useEffect(() => {
    if (!served) return;
    goalPop.setValue(1.12);
    Animated.spring(goalPop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [served, goalPop]);
  const low = timeLeft !== null && timeLeft <= 15;
  const mm = timeLeft !== null ? Math.floor(Math.max(0, timeLeft) / 60) : 0;
  const ss = timeLeft !== null ? Math.floor(Math.max(0, timeLeft) % 60) : 0;
  // Son 15 saniyede her saniye kısa bir "tık" büyümesi (sonlu).
  useEffect(() => {
    if (!low) return;
    pop.setValue(1.08);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 180, useNativeDriver: true }).start();
  }, [low, ss, pop]);
  const pct = total ? served / total : 0;
  const narrow = Boolean(onPause) && (width ?? 999) < 430;
  const tight = Boolean(onPause) && (width ?? 999) < 360;
  const pill = tight ? 34 : Math.max(34, Math.min(44, height - 14));
  return (
    <View style={[styles.hud, tight && styles.hudTight, { height }]}>
      <HudPill
        height={pill}
        style={styles.hudGoalWrap}
        scale={goalPop}
        accessibilityLabel={`Sipariş ${served} / ${total}`}
        disc={<Ionicons name="restaurant" size={Math.round(pill * 0.46)} color={S.hudText} />}
      >
        <View style={styles.hudGoalText}>
          <Text {...textScale.badge} style={styles.hudValue}>
            {served}
            <Text style={styles.hudOf}>/{total}{narrow ? "" : " sipariş"}</Text>
          </Text>
          <View style={styles.hudBar}>
            <View style={[styles.hudBarFill, { width: `${Math.round(pct * 100)}%` }]} />
          </View>
        </View>
      </HudPill>
      {timeLeft !== null ? (
        <HudPill height={pill} tone={low ? "red" : "blue"} scale={pop} accessibilityLabel={`Kalan süre ${mm} dakika ${ss} saniye`}>
          <Ionicons name="time" size={Math.round(pill * 0.46)} color={S.white} />
          <Text {...textScale.badge} style={styles.hudTime}>
            {mm}:{String(ss).padStart(2, "0")}
          </Text>
        </HudPill>
      ) : null}
      <HudPill height={pill} scale={bump} accessibilityLabel={`Bahşiş ${tips}`} disc={<CoinIcon size={Math.round(pill * 0.66)} />}>
        <Text {...textScale.badge} style={styles.hudTipsValue}>
          {tips}
        </Text>
      </HudPill>
      {onPause ? (
        <Touchable onPress={onPause} hitSlop={touchSlop(pill)} accessibilityRole="button" accessibilityLabel="Oyunu durdur" haptic="light">
          <IconDisc icon="pause" size={pill} tone="pill" color={S.hudText} />
        </Touchable>
      ) : null}
    </View>
  );
});

/* ───────────────────────────── alt dok ───────────────────────────── */

export const BoosterDock = memo(function BoosterDock({
  height,
  queueLeft,
  hizliStock,
  onHizli,
  disabled,
  extras,
}: {
  height: number;
  queueLeft: number;
  hizliStock: number;
  onHizli: () => void;
  disabled: boolean;
  extras: string[];
}) {
  const btnH = Math.max(42, Math.min(56, height - 18));
  return (
    <View style={[styles.dock, { height }]}>
      <View style={styles.dockLeft}>
        <HudPill
          height={34}
          style={styles.queueChip}
          accessibilityLabel={queueLeft > 0 ? `Sırada ${queueLeft} taraftar` : "Sırada taraftar kalmadı"}
          disc={<Ionicons name="people" size={16} color={S.hudText} />}
        >
          <Text {...textScale.badge} style={styles.queueValue}>
            {queueLeft}
          </Text>
          <Text {...textScale.badge} style={styles.queueLabel} numberOfLines={1}>
            {queueLeft > 0 ? "sırada" : "son tur"}
          </Text>
        </HudPill>
        {extras.length ? (
          <View style={styles.extras}>
            {extras.map((e) => (
              <View key={e} style={styles.extraChip}>
                <Ionicons name="checkmark-circle" size={12} color={S.progress} />
                <Text {...textScale.badge} style={styles.extraText} numberOfLines={1}>
                  {e}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <BoosterButton3D
        icon="flash"
        label={"Hızlı\nservis"}
        stock={hizliStock}
        onPress={onHizli}
        disabled={disabled}
        height={btnH}
        tone="orange"
        accessibilityLabel={`Hızlı Servis, stok ${hizliStock}`}
        style={styles.boost}
      />
    </View>
  );
});

/* ───────────────────────────── sabır halkası ───────────────────────────── */

/** Saat gibi boşalan halka: yeşil → sarı → kırmızı. VIP ortada yıldız taşır. */
const PatienceRing = memo(function PatienceRing({ ratio, size, vip }: { ratio: number; size: number; vip: boolean }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, ratio));
  const color = v > 0.5 ? S.patienceGood : v > 0.25 ? S.patienceMid : S.patienceLow;
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, vip && styles.ringVip]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={S.patienceTrack} strokeWidth={4} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={4}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - v)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.ringCenter}>
          <Ionicons name={vip ? "star" : v > 0.25 ? "time" : "alert"} size={Math.round(size * 0.42)} color={vip ? S.vipDeep : color} />
        </View>
      </View>
    </View>
  );
});

/* ───────────────────────────── sipariş balonu ───────────────────────────── */

export const OrderBubble = memo(function OrderBubble({
  items,
  filledMask,
  geom,
  vip,
  served,
  ratio,
  showRing,
}: {
  items: number[];
  filledMask: number;
  geom: BubbleGeom;
  vip: boolean;
  served: boolean;
  /** Sabır oranı (0–1), 0.05 adımlı (memo dostu). */
  ratio: number;
  showRing: boolean;
}) {
  const servedPop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!served) return;
    servedPop.setValue(0);
    Animated.spring(servedPop, { toValue: 1, damping: 8, stiffness: 260, mass: 0.6, useNativeDriver: true }).start();
  }, [served, servedPop]);
  const remaining = items.filter((_, i) => !(filledMask & (1 << i))).length;
  const urgent = !served && ratio <= 0.25;
  const icon = Math.round(geom.cell * 0.84);
  const check = Math.max(16, Math.round(geom.cell * 0.46));
  const ringSize = Math.max(22, Math.min(30, Math.round(geom.cell * 0.62)));
  return (
    <View style={{ width: geom.w, height: geom.h + BUBBLE_TAIL }}>
      <View
        style={[
          styles.bubble,
          { width: geom.w, height: geom.h },
          vip && styles.bubbleVip,
          urgent && styles.bubbleUrgent,
          served && styles.bubbleServed,
        ]}
      >
        {items.map((p, i) => {
          const done = Boolean(filledMask & (1 << i));
          const at = geom.at(i);
          return (
            <View
              key={i}
              style={[
                styles.cell,
                { width: geom.cell, height: geom.cell, left: at.x - geom.cell / 2 - BUBBLE_BORDER, top: at.y - geom.cell / 2 - BUBBLE_BORDER },
                done && styles.cellDone,
              ]}
            >
              <View style={done ? styles.iconDone : null}>
                <ProductIcon p={p} size={icon} />
              </View>
              {done ? (
                <View style={[styles.check, { width: check, height: check, borderRadius: check / 2 }]}>
                  <Ionicons name="checkmark" size={Math.round(check * 0.72)} color={S.white} />
                </View>
              ) : null}
            </View>
          );
        })}
        {served ? (
          <Animated.View
            style={[
              styles.servedOverlay,
              { opacity: servedPop, transform: [{ scale: servedPop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] },
            ]}
          >
            <View style={[styles.servedBadge, { width: geom.cell * 1.1, height: geom.cell * 1.1, borderRadius: geom.cell }]}>
              <Ionicons name="checkmark" size={Math.round(geom.cell * 0.9)} color={S.white} />
            </View>
          </Animated.View>
        ) : null}
      </View>
      {/* kuyruk: balonun kenarıyla aynı kontur */}
      <View style={[styles.tail, vip && styles.tailVip, urgent && styles.tailUrgent, served && styles.tailServed, { left: geom.w / 2 - 8, top: geom.h - 10 }]} />
      {!served && remaining > 0 ? (
        <View style={[styles.left, urgent && styles.leftUrgent]} accessibilityElementsHidden>
          <Text {...textScale.badge} style={styles.leftText}>
            {remaining}
          </Text>
        </View>
      ) : null}
      {showRing && !served ? (
        <View style={[styles.ringWrap, { left: -ringSize * 0.35, top: -ringSize * 0.4 }]}>
          <PatienceRing ratio={ratio} size={ringSize} vip={vip} />
        </View>
      ) : null}
    </View>
  );
});

/* ───────────────────────────── taraftar yuvası ───────────────────────────── */

export const FanSpot = memo(function FanSpot({
  order,
  filledMask,
  mood,
  ratio,
  vip,
  served,
  jersey,
  face,
  width,
  zoneH,
  geom,
  fanSize,
  enterDelay,
  idle,
  phase,
}: {
  idle: Animated.Value;
  phase: number;
  order: KantinOrder;
  filledMask: number;
  mood: FanMood;
  ratio: number;
  vip: boolean;
  served: boolean;
  jersey: number;
  face: number;
  width: number;
  /** Balon bölgesinin yüksekliği (balon bu bölgenin altına yaslanır). */
  zoneH: number;
  geom: BubbleGeom;
  fanSize: number;
  enterDelay: number;
}) {
  const enter = useRef(new Animated.Value(enterDelay > 0 ? 0 : 1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (enterDelay <= 0) return;
    Animated.spring(enter, { toValue: 1, delay: enterDelay, damping: 11, stiffness: 160, mass: 0.8, useNativeDriver: true }).start();
  }, [enter, enterDelay]);
  useEffect(() => {
    if (mood !== "angry" && mood !== "worried") return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 90, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 70, useNativeDriver: true }),
    ]).start();
  }, [mood, shake]);
  // Ürün gelince balon zıplar (doluluk değişimi).
  const fillPop = usePop(filledMask, 1.08);
  const moodPop = usePop(mood, 1.06);
  const need = order.items.filter((_, i) => !(filledMask & (1 << i))).map(productName);
  const fanH = (fanSize * 72) / 64;
  return (
    <Animated.View
      style={[
        styles.fanSpot,
        { width },
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [fanH * 0.6, 0] }) },
            { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-4, 4] }) },
          ],
        },
      ]}
      accessibilityLabel={`${vip ? "VIP taraftar" : "Taraftar"} siparişi: ${order.items.map(productName).join(", ")}. Eksik: ${need.join(", ") || "yok"}`}
    >
      <View style={{ height: zoneH, justifyContent: "flex-end", alignItems: "center" }}>
        <Animated.View style={{ transform: [{ scale: fillPop }] }}>
          <OrderBubble items={order.items} filledMask={filledMask} geom={geom} vip={vip} served={served} ratio={ratio} showRing />
        </Animated.View>
      </View>
      <Animated.View
        style={[
          styles.fanWrap,
          {
            transform: [
              { translateY: wave(idle, phase, mood === "joy" || mood === "happy" ? 1.8 : 1) },
              { scaleY: moodPop },
            ],
          },
        ]}
      >
        <FanFigure size={fanSize} jersey={jersey} face={face} mood={mood} vip={vip} />
      </Animated.View>
    </Animated.View>
  );
});

/* ───────────────────────────── bekleme tepsisi ───────────────────────────── */

const HoldItemView = memo(function HoldItemView({ item, index, step, size, hidden }: { item: KantinItem; index: number; step: number; size: number; hidden: boolean }) {
  const x = useRef(new Animated.Value(index * step)).current;
  const land = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: index * step, friction: 7, tension: 120, useNativeDriver: true }).start();
  }, [index, step, x]);
  useEffect(() => {
    if (hidden) return;
    land.setValue(0);
    Animated.spring(land, { toValue: 1, damping: 10, stiffness: 260, mass: 0.6, useNativeDriver: true }).start();
  }, [hidden, land]);
  return (
    <Animated.View
      style={[
        styles.holdItem,
        {
          width: size,
          height: size,
          opacity: hidden ? 0 : 1,
          transform: [
            { translateX: x },
            { scaleX: land.interpolate({ inputRange: [0, 0.5, 1, 2], outputRange: [1.14, 0.95, 1, 1] }) },
            { scaleY: land.interpolate({ inputRange: [0, 0.5, 1, 2], outputRange: [0.86, 1.06, 1, 1] }) },
          ],
        },
      ]}
    >
      <ProductIcon p={item.p} size={size - 6} />
    </Animated.View>
  );
});

export const HoldRow = memo(function HoldRow({
  hold,
  cap,
  size,
  gap,
  hiddenKey,
  danger,
  lost,
  height,
  headH,
}: {
  hold: KantinItem[];
  cap: number;
  size: number;
  gap: number;
  hiddenKey: string;
  danger: boolean;
  lost: boolean;
  height: number;
  headH: number;
}) {
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!danger && !lost) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [danger, lost, shake]);
  const hidden = new Set(hiddenKey ? hiddenKey.split(",").map(Number) : []);
  const rowW = cap * size + (cap - 1) * gap;
  const alarm = danger || lost;
  return (
    <View style={[styles.holdWrap, { height }]}>
      {headH > 0 ? (
        <View style={[styles.holdHead, { height: headH - 4 }]}>
          <Ionicons name={alarm ? "warning" : "file-tray-stacked"} size={14} color={alarm ? S.dangerText : S.hudSoft} />
          <Text {...textScale.dense} style={[styles.holdLabel, alarm && styles.holdLabelDanger]}>
            {lost ? "Tezgâh doldu!" : danger ? "Son yuva! Dikkat" : "Bekleme tezgâhı"}
          </Text>
          <View style={[styles.holdCountPill, alarm && styles.holdCountPillDanger]}>
            <Text {...textScale.dense} style={styles.holdCount}>
              {hold.length}/{cap}
            </Text>
          </View>
        </View>
      ) : null}
      <Animated.View
        style={[
          styles.holdRow,
          { width: rowW + 12, height: size + 10, transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }] },
          alarm && styles.holdRowDanger,
        ]}
        accessibilityLabel={`Bekleme tezgâhı ${hold.length} / ${cap}: ${hold.map((it) => productName(it.p)).join(", ") || "boş"}`}
      >
        {Array.from({ length: cap }, (_, k) => (
          <View key={k} style={[styles.holdSlot, { width: size, height: size, left: 5 + k * (size + gap) }, k === cap - 1 && styles.holdSlotLast]} />
        ))}
        <View style={[styles.holdItems, { left: 5 }]}>
          {hold.map((it, k) => (
            <HoldItemView key={it.uid} item={it} index={k} step={size + gap} size={size} hidden={hidden.has(it.uid)} />
          ))}
        </View>
        {headH === 0 ? (
          <View style={[styles.holdBadge, alarm && styles.holdBadgeDanger]}>
            <Text {...textScale.badge} style={styles.holdBadgeText}>
              {hold.length}/{cap}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
});

/* ───────────────────────────── ürün rafı ───────────────────────────── */

export const STACK_VISIBLE = 5;

export const StackColumn = memo(function StackColumn({
  stack,
  index,
  served,
  width,
  tile,
  rowStep,
  height,
  onTap,
  nudge,
  padTop,
  idle,
  hint,
}: {
  idle: Animated.Value;
  stack: KantinItem[];
  index: number;
  served: number;
  width: number;
  tile: number;
  rowStep: number;
  height: number;
  onTap: (index: number) => void;
  nudge: number;
  padTop: number;
  /** Üstteki ürün bir balona uyuyor mu (hafif yeşil ışık). */
  hint: boolean;
}) {
  const slide = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const prevLen = useRef(stack.length);
  useEffect(() => {
    if (stack.length < prevLen.current) {
      slide.setValue(rowStep);
      Animated.spring(slide, { toValue: 0, friction: 7, tension: 140, useNativeDriver: true }).start();
    }
    prevLen.current = stack.length;
  }, [stack.length, rowStep, slide]);
  useEffect(() => {
    if (!nudge) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 70, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [nudge, shake]);

  const top = stack[0];
  const upperOpen = top ? !top.crate : false;
  const visible = stack.slice(0, STACK_VISIBLE);
  const extra = stack.length - visible.length;
  const topLocked = top ? top.lock > served : false;
  const label = !top
    ? "Boş raf"
    : topLocked
      ? `Kilitli kutu, ${top.lock - served} sipariş sonra açılır`
      : `${productName(top.p)} al. Rafta ${stack.length} ürün`;

  return (
    <Pressable
      onPress={() => onTap(index)}
      onPressIn={() => Animated.spring(press, { toValue: 0.92, damping: 14, stiffness: 400, mass: 0.5, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, damping: 9, stiffness: 300, mass: 0.6, useNativeDriver: true }).start()}
      disabled={!top}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.stackCol, { width, height }]}
    >
      <View style={[styles.shelf, { width, height }]} />
      {!top ? (
        <View style={[styles.emptyShelf, { top: padTop + tile * 0.3 }]}>
          <Ionicons name="checkmark-done" size={Math.round(tile * 0.4)} color={S.hudSoft} />
        </View>
      ) : null}
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transform: [{ translateY: slide }, { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-5, 5] }) }],
        }}
      >
        {visible
          .map((it, d) => {
            const hidden = it.crate && upperOpen;
            const locked = it.lock > served;
            const isTop = d === 0;
            const size = isTop ? tile : tile * (0.86 - d * 0.02);
            return (
              <Animated.View
                key={it.uid}
                style={[
                  isTop
                    ? { transform: [{ translateY: wave(idle, index * 0.23, 1) }, { scale: press }] }
                    : null,
                  styles.tile,
                  {
                    position: "absolute",
                    left: (width - size) / 2,
                    top: padTop + d * rowStep + (isTop ? 0 : (tile - size) / 2),
                    width: size,
                    height: size,
                    zIndex: STACK_VISIBLE - d,
                  },
                  isTop ? styles.tileTop : styles.tileLow,
                  isTop && hint && !locked ? styles.tileHint : null,
                  hidden && styles.tileCrate,
                ]}
              >
                {isTop && !hidden ? <TileGloss w={size - 4} h={size - 6} r={radius.md} /> : null}
                {hidden ? <CrateIcon size={size - 6} /> : <ProductIcon p={it.p} size={size - (isTop ? 8 : 12)} />}
                {locked && !hidden ? (
                  <View style={[styles.lock, { borderRadius: radius.md }]}>
                    <Ionicons name="lock-closed" size={Math.max(14, size * 0.34)} color={S.white} />
                    <View style={styles.lockPill}>
                      <Text {...textScale.badge} style={styles.lockText}>
                        {it.lock - served}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </Animated.View>
            );
          })
          .reverse()}
      </Animated.View>
      {extra > 0 ? (
        <View style={styles.more}>
          <Text {...textScale.badge} style={styles.moreText}>
            +{extra}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

/* ───────────────────────────── stiller ───────────────────────────── */

const lift = {
  shadowColor: S.dropShadow,
  shadowOpacity: 0.3,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 3 },
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  hud: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm },
  hudGoalWrap: { flex: 1 },
  hudGoalText: { flex: 1, gap: 3 },
  hudTight: { gap: space.xs, paddingHorizontal: space.xs },
  hudValue: { ...type.scoreSm, color: S.hudText },
  hudOf: { ...type.numSmStrong, fontFamily: fonts.bold, color: S.hudOfInk },
  hudBar: { height: 7, borderRadius: radius.pill, backgroundColor: S.track, overflow: "hidden" },
  hudBarFill: { height: 7, borderRadius: radius.pill, backgroundColor: S.progress },
  hudTime: { ...type.scoreSm, color: S.hudText, minWidth: 40 },
  hudTipsValue: { ...type.scoreSm, color: S.hudText, minWidth: 18 },

  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: S.panelDeep,
  },
  dockLeft: { flex: 1, gap: space.xs, minWidth: 0 },
  queueChip: { alignSelf: "flex-start" },
  queueValue: { ...type.scoreXs, color: S.hudText },
  queueLabel: { ...type.labelXs, fontFamily: fonts.semibold, color: S.hudSoft },
  extras: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
  extraChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 20,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: S.glass,
  },
  extraText: { ...type.nano, fontFamily: fonts.bold, color: S.hudText },
  boost: { width: 150, marginTop: space.xs },

  fanSpot: { alignItems: "center" },
  fanWrap: { marginTop: 2, alignItems: "center" },

  bubble: {
    position: "absolute",
    left: 0,
    top: 0,
    backgroundColor: S.bubble,
    borderWidth: BUBBLE_BORDER,
    borderColor: S.bubbleEdge,
    borderRadius: radius.lg,
    zIndex: 2,
    ...lift,
  },
  bubbleVip: { backgroundColor: S.vipBubble, borderColor: S.vipEdge },
  bubbleUrgent: { borderColor: S.danger },
  bubbleServed: { backgroundColor: S.served, borderColor: S.servedDeep },
  tail: {
    position: "absolute",
    width: 16,
    height: 16,
    backgroundColor: S.bubble,
    borderRightWidth: BUBBLE_BORDER,
    borderBottomWidth: BUBBLE_BORDER,
    borderColor: S.bubbleEdge,
    transform: [{ rotate: "45deg" }],
    zIndex: 3,
  },
  tailVip: { backgroundColor: S.vipBubble, borderColor: S.vipEdge },
  tailUrgent: { borderColor: S.danger },
  tailServed: { backgroundColor: S.served, borderColor: S.servedDeep },
  cell: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: S.bubbleCell,
    borderWidth: 1.5,
    borderColor: S.bubbleCellEdge,
  },
  cellDone: { backgroundColor: S.bubbleDone, borderColor: S.bubbleDoneEdge },
  iconDone: { opacity: 0.55 },
  check: {
    position: "absolute",
    right: -4,
    bottom: -4,
    backgroundColor: S.check,
    borderWidth: 2,
    borderColor: S.checkEdge,
    alignItems: "center",
    justifyContent: "center",
  },
  servedOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  servedBadge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: S.servedDeep,
    borderWidth: 3,
    borderColor: S.white,
  },
  left: {
    position: "absolute",
    right: -6,
    top: -8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: S.ink,
    borderWidth: 2,
    borderColor: S.white,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  leftUrgent: { backgroundColor: S.danger },
  leftText: { ...type.labelSm, fontFamily: fonts.bold, color: S.white },
  ringWrap: { position: "absolute", zIndex: 4 },
  ring: { backgroundColor: S.white, borderWidth: 2, borderColor: S.ink },
  ringVip: { backgroundColor: S.vipBubble, borderColor: S.vipEdge },
  ringCenter: { flex: 1, alignItems: "center", justifyContent: "center" },

  holdWrap: { alignItems: "center" },
  holdHead: { flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: 4, paddingHorizontal: space.md },
  holdLabel: { ...type.labelSm, fontFamily: fonts.semibold, color: S.hudSoft },
  holdLabelDanger: { color: S.dangerText },
  holdCountPill: { paddingHorizontal: space.s, borderRadius: radius.pill, backgroundColor: S.glass },
  holdCountPillDanger: { backgroundColor: S.danger },
  holdCount: { ...type.scoreXs, color: S.hudText },
  holdRow: {
    backgroundColor: S.tray,
    borderRadius: radius.lg,
    borderBottomWidth: 4,
    borderColor: S.trayLip,
    overflow: "hidden",
    ...lift,
  },
  holdRowDanger: { backgroundColor: S.dangerSoft, borderColor: S.dangerDeep },
  holdSlot: {
    position: "absolute",
    top: 4,
    borderRadius: radius.md,
    backgroundColor: S.traySlot,
    borderWidth: 1,
    borderColor: S.traySlotEdge,
  },
  holdSlotLast: { borderColor: S.danger, borderWidth: 1.5, borderStyle: "dashed" },
  holdItems: { position: "absolute", top: 4 },
  holdItem: { position: "absolute", left: 0, top: 0, alignItems: "center", justifyContent: "center" },
  holdBadge: {
    position: "absolute",
    right: 2,
    top: 2,
    minWidth: 32,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: S.panelDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  holdBadgeDanger: { backgroundColor: S.danger },
  holdBadgeText: { ...type.nano, fontFamily: fonts.bold, color: S.white },

  stackCol: { alignItems: "center" },
  shelf: {
    position: "absolute",
    left: 0,
    top: 0,
    borderRadius: radius.lg,
    backgroundColor: S.shelf,
    borderWidth: 1,
    borderColor: S.shelfEdge,
  },
  emptyShelf: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  tile: { alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  tileTop: { backgroundColor: S.tile, borderBottomWidth: 4, borderColor: S.tileLip, ...lift },
  tileHint: { borderColor: S.progress, borderWidth: 2, borderBottomWidth: 4 },
  tileLow: { backgroundColor: S.tileLow, borderBottomWidth: 2, borderColor: S.tileLowLip },
  tileCrate: { backgroundColor: S.crate, borderColor: S.crateDark },
  lock: { ...StyleSheet.absoluteFillObject, backgroundColor: S.lockBg, alignItems: "center", justifyContent: "center", gap: 2 },
  lockPill: { minWidth: 18, paddingHorizontal: 4, borderRadius: radius.pill, backgroundColor: S.white, alignItems: "center" },
  lockText: { ...type.nano, fontFamily: fonts.bold, color: S.ink },
  more: {
    position: "absolute",
    bottom: 4,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: S.panelDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { ...type.nano, fontFamily: fonts.semibold, color: S.hudSoft },
});
