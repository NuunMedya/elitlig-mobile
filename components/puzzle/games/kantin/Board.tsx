/**
 * Kantin tahtasının parçaları — hepsi memo'lu; yalnız kendi verisi değişince
 * yeniden çizilir (süre tik'i HUD ve taraftarlar dışında hiçbir şeye dokunmaz).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Defs, Ellipse, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { CARTOON } from "@/lib/game/cartoon";
import { kantinScene as S } from "@/lib/puzzle/kantinPalette";
import { KANTIN_PRODUCTS, type KantinItem, type KantinOrder } from "@/lib/puzzle/levels/kantin";
import { fonts, radius, space, textScale, type } from "@/theme";

import { FanFigure, type FanMood } from "./Fan";
import { BoosterButton3D, HudPill, IconDisc, OUT, toonShadow, usePop, wave } from "../soyunma/CartoonKit";
import { CoinIcon, CrateIcon, ProductIcon } from "./ProductIcon";

export const productName = (p: number) => KANTIN_PRODUCTS[p]?.name ?? "Ürün";

/* ───────────────────────────── parlaklık katmanları ───────────────────────────── */

/** Karo/kutu üstü cam parlaklığı: üstten ışık, altta gölge, kenar ışığı, parıltı. */
const Gloss = memo(function Gloss({ w, h, r }: { w: number; h: number; r: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="kgloss" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={S.white} stopOpacity={0.9} />
          <Stop offset="0.45" stopColor={S.white} stopOpacity={0} />
          <Stop offset="1" stopColor={S.ink} stopOpacity={0.14} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} rx={r} fill="url(#kgloss)" />
      <Rect x={1.2} y={1.2} width={w - 2.4} height={h - 2.4} rx={Math.max(1, r - 1)} fill="none" stroke={S.white} strokeOpacity={0.9} strokeWidth={1.2} />
      <Ellipse cx={w * 0.27} cy={h * 0.16} rx={w * 0.15} ry={h * 0.06} fill={S.white} fillOpacity={0.9} transform={`rotate(-20 ${w * 0.27} ${h * 0.16})`} />
    </Svg>
  );
});

/** Ahşap damarı (tezgâh ve raf): soldan sağa ışık, ince damar çizgileri. */
const WoodGrain = memo(function WoodGrain({ w, h, r, base, dark, light }: { w: number; h: number; r: number; base: string; dark: string; light: string }) {
  const lines = [0.22, 0.48, 0.71];
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={`kwood${base}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={light} />
          <Stop offset="0.35" stopColor={base} />
          <Stop offset="1" stopColor={dark} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} rx={r} fill={`url(#kwood${base})`} />
      {lines.map((y) => (
        <Path key={y} d={`M4 ${h * y} Q ${w * 0.3} ${h * y - 3} ${w * 0.55} ${h * y} T ${w - 4} ${h * y}`} stroke={dark} strokeOpacity={0.35} strokeWidth={1} fill="none" />
      ))}
      <Line x1={4} y1={1.5} x2={w - 4} y2={1.5} stroke={S.white} strokeOpacity={0.35} strokeWidth={1} />
    </Svg>
  );
});

/** Tabak parlaması: kenarda ışık yayı ve yumuşak iç gölge. */
const PlateShine = memo(function PlateShine({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="kplate" cx="50%" cy="55%" r="60%">
          <Stop offset="0.7" stopColor={S.ink} stopOpacity={0} />
          <Stop offset="1" stopColor={S.ink} stopOpacity={0.1} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} rx={h / 2} fill="url(#kplate)" />
      <Path d={`M ${h * 0.45} ${h * 0.22} Q ${w * 0.5} ${h * 0.02} ${w - h * 0.45} ${h * 0.22}`} stroke={S.white} strokeOpacity={0.95} strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
});

/* ───────────────────────────── sahne zemini ───────────────────────────── */

/**
 * Tribün arka planı: tente (kırmızı-beyaz dilimler), koltuk sıraları ve
 * renkli kalabalık. Tümü sabit (memo'lu tek SVG) — süre tik'i dokunmaz.
 */
export const Stands = memo(function Stands({ w, h, awn }: { w: number; h: number; awn: number }) {
  const seg = Math.max(22, Math.round(w / 14));
  const segs = Math.ceil(w / seg);
  const rowH = 19;
  const rows = Math.max(2, Math.min(7, Math.floor((h - awn - 6) / rowH)));
  const step = 19;
  const cols = Math.ceil(w / step) + 1;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="kstand" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={S.standTop} />
          <Stop offset="1" stopColor={S.standBottom} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#kstand)" />
      {Array.from({ length: rows }, (_, r) => (
        <Rect key={`row${r}`} x={0} y={awn + 8 + r * rowH + 11} width={w} height={rowH - 11} fill={r % 2 ? S.seatA : S.seatB} />
      ))}
      {/* Kalabalık: konturlu mini taraftarlar (baş + forma), soluk: öndeki müşteriler öne çıksın. */}
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const x = c * step + (r % 2 ? step / 2 : 0) - 4;
          const y = awn + 8 + r * rowH + 6;
          const tone = S.crowd[(c * 5 + r * 3 + ((c * r) % 4)) % S.crowd.length];
          const skin = S.crowdSkins[(c * 3 + r) % S.crowdSkins.length];
          return (
            <G key={`c${r}-${c}`} opacity={0.62}>
              <Path d={`M${x - 7} ${y + 13} Q${x - 7} ${y + 4} ${x} ${y + 4} Q${x + 7} ${y + 4} ${x + 7} ${y + 13} Z`} fill={tone} stroke={CARTOON.outline} strokeWidth={1.6} />
              <Circle cx={x} cy={y} r={4.6} fill={skin} stroke={CARTOON.outline} strokeWidth={1.6} />
            </G>
          );
        }),
      )}
      {Array.from({ length: segs }, (_, i) => {
        const x = i * seg;
        const d = `M ${x} 0 H ${x + seg} V ${awn * 0.62} Q ${x + seg / 2} ${awn * 1.3} ${x} ${awn * 0.62} Z`;
        return <Path key={`a${i}`} d={d} fill={i % 2 ? S.awningB : S.awningA} stroke={CARTOON.outline} strokeWidth={2} strokeLinejoin="round" />;
      })}
      <Rect x={0} y={0} width={w} height={3} fill={CARTOON.outline} />
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
}: {
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
    bump.setValue(1.35);
    Animated.spring(bump, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [tipsBump, bump]);
  useEffect(() => {
    if (!served) return;
    goalPop.setValue(1.25);
    Animated.spring(goalPop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [served, goalPop]);
  const low = timeLeft !== null && timeLeft <= 15;
  const mm = timeLeft !== null ? Math.floor(Math.max(0, timeLeft) / 60) : 0;
  const ss = timeLeft !== null ? Math.floor(Math.max(0, timeLeft) % 60) : 0;
  // Son 15 saniyede her saniye kısa bir "tık" büyümesi (sonlu, saniyede bir).
  useEffect(() => {
    if (!low) return;
    pop.setValue(1.14);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 180, useNativeDriver: true }).start();
  }, [low, ss, pop]);
  const pct = total ? served / total : 0;
  const pill = Math.max(34, Math.min(44, height - 14));
  return (
    <View style={[styles.hud, { height }]}>
      <HudPill
        height={pill}
        style={styles.hudGoalWrap}
        scale={goalPop}
        accessibilityLabel={`Sipariş ${served} / ${total}`}
        disc={<IconDisc icon="restaurant" size={pill + 2} tone="orange" />}
      >
        <View style={styles.hudGoalText}>
          <Text {...textScale.badge} style={styles.hudValue}>
            {served}
            <Text style={styles.hudOf}>/{total}</Text>
          </Text>
          <View style={styles.hudBar}>
            <View style={[styles.hudBarFill, { width: `${Math.round(pct * 100)}%` }]} />
          </View>
        </View>
      </HudPill>
      {timeLeft !== null ? (
        <HudPill
          height={pill}
          tone={low ? "red" : "blue"}
          scale={pop}
          accessibilityLabel={`Kalan süre ${mm} dakika ${ss} saniye`}
        >
          <Ionicons name="alarm" size={Math.round(pill * 0.5)} color={S.white} />
          <Text {...textScale.badge} style={styles.hudTime}>
            {mm}:{String(ss).padStart(2, "0")}
          </Text>
        </HudPill>
      ) : null}
      <HudPill height={pill} scale={bump} accessibilityLabel={`Bahşiş ${tips}`} disc={<CoinIcon size={pill + 4} />}>
        <Text {...textScale.badge} style={styles.hudTipsValue}>
          {tips}
        </Text>
      </HudPill>
    </View>
  );
});

/* ───────────────────────────── alt dok: sıra + güçlendirici ───────────────────────────── */

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
  /** Seviye öncesi etkin güçlendiricilerin kısa etiketleri. */
  extras: string[];
}) {
  const btnH = Math.max(40, Math.min(54, height - 22));
  return (
    <View style={[styles.dock, { height }]}>
      <View style={styles.dockLeft}>
        <HudPill
          height={32}
          style={styles.queueChip}
          accessibilityLabel={queueLeft > 0 ? `Sırada ${queueLeft} taraftar` : "Sırada taraftar kalmadı"}
          disc={<IconDisc icon="people" size={32} tone="purple" />}
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

/* ───────────────────────────── taraftar + balon ───────────────────────────── */

/** Faz kaydırmalı hafif sallanma açısı (derece dizileri). */
function rot(phase: number, amp: number) {
  return [0, 0.25, 0.5, 0.75, 1].map((x) => `${(Math.sin((x + phase) * Math.PI * 2) * amp).toFixed(2)}deg`);
}

export const FanSpot = memo(function FanSpot({
  order,
  filledMask,
  mood,
  vipRatio,
  jersey,
  face,
  width,
  bubbleH,
  fanSize,
  enterDelay,
  iconMax,
  idle,
  phase,
}: {
  /** Paylaşılan "nefes" sürücüsü + bu taraftarın fazı. */
  idle: Animated.Value;
  phase: number;
  order: KantinOrder;
  /** Siparişteki i. ürün dolu mu (bit maskesi — memo dostu). */
  filledMask: number;
  mood: FanMood;
  /** VIP sabır oranı (0–1); VIP değilse null. */
  vipRatio: number | null;
  jersey: number;
  face: number;
  width: number;
  bubbleH: number;
  fanSize: number;
  enterDelay: number;
  /** Balondaki ürün ikonunun üst sınırı (sahne ölçeğiyle büyür). */
  iconMax: number;
}) {
  const enter = useRef(new Animated.Value(enterDelay > 0 ? 0 : 1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (enterDelay <= 0) return;
    Animated.spring(enter, { toValue: 1, delay: enterDelay, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [enter, enterDelay]);
  useEffect(() => {
    if (mood !== "angry") return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 90, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 70, useNativeDriver: true }),
    ]).start();
  }, [mood, shake]);
  const moodPop = usePop(mood, 1.2);
  const n = order.items.length;
  const filled = order.items.map((_, i) => Boolean(filledMask & (1 << i)));
  const icon = Math.max(10, Math.min(iconMax, Math.floor((width - 16) / n) - 2));
  const vip = vipRatio !== null;
  const need = order.items.filter((_, i) => !filled[i]).map(productName);
  return (
    <Animated.View
      style={[
        styles.fanSpot,
        { width },
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
            { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-4, 4] }) },
          ],
        },
      ]}
      accessibilityLabel={`${vip ? "VIP taraftar" : "Taraftar"} siparişi: ${order.items.map(productName).join(", ")}. Eksik: ${need.join(", ") || "yok"}`}
    >
      <View style={[styles.bubble, vip && styles.bubbleVip, { height: bubbleH - 8, maxWidth: width - 4 }]}>
        {order.items.map((p, i) => (
          <View key={i} style={[styles.bubbleItem, filled[i] && styles.bubbleItemDone]}>
            <ProductIcon p={p} size={icon} />
            {filled[i] ? (
              <View style={[styles.check, { width: Math.max(13, icon * 0.6), height: Math.max(13, icon * 0.6) }]}>
                <Ionicons name="checkmark" size={Math.max(9, Math.round(icon * 0.42))} color={S.white} />
              </View>
            ) : null}
          </View>
        ))}
        <View style={[styles.tail, vip && styles.tailVip]} />
      </View>
      <Animated.View
        style={[
          styles.fanWrap,
          {
            transform: [
              { translateY: wave(idle, phase, mood === "joy" || mood === "happy" ? 2.6 : 1.4) },
              { rotate: idle.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: rot(phase, mood === "angry" ? 1 : 3) }) },
              { scaleX: moodPop.interpolate({ inputRange: [1, 1.25], outputRange: [1, 0.9] }) },
              { scaleY: moodPop },
            ],
          },
        ]}
      >
        <FanFigure size={fanSize} jersey={jersey} face={face} mood={mood} vip={vip} />
        {vip ? (
          <View style={styles.vipBar} accessibilityLabel={`VIP sabrı yüzde ${Math.round((vipRatio ?? 0) * 100)}`}>
            <View
              style={[
                styles.vipFill,
                {
                  width: `${Math.round(Math.max(0, vipRatio ?? 0) * 100)}%`,
                  backgroundColor: (vipRatio ?? 0) > 0.5 ? S.patienceGood : (vipRatio ?? 0) > 0.25 ? S.patienceMid : S.patienceLow,
                },
              ]}
            />
          </View>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
});

/* ───────────────────────────── tabak ───────────────────────────── */

export const PlateSpot = memo(function PlateSpot({
  items,
  shownMask,
  width,
  height,
  icon,
  vip,
}: {
  /** Siparişin ürünleri (yer tutucular). */
  items: number[];
  /** i. konumda görünür ürün var mı (bit maskesi; uçuştakiler gizli). */
  shownMask: number;
  width: number;
  height: number;
  icon: number;
  vip: boolean;
}) {
  return (
    <View style={[styles.plateOuter, { width, height, borderRadius: height / 2 }, vip && styles.plateVip]}>
      <PlateShine w={width - 4} h={height - 4} />
      <View style={[styles.plateInner, { borderRadius: (height - 10) / 2 }]}>
        {items.map((p, i) => (
          <View key={i} style={{ width: icon, height: icon, alignItems: "center", justifyContent: "center" }}>
            {shownMask & (1 << i) ? <ProductIcon p={p} size={icon} /> : <View style={[styles.ghostDot, { width: icon * 0.5, height: icon * 0.5, borderRadius: icon / 4 }]} />}
          </View>
        ))}
      </View>
    </View>
  );
});

/* ───────────────────────────── bekleme tezgâhı ───────────────────────────── */

const HoldItemView = memo(function HoldItemView({ item, index, step, size, hidden }: { item: KantinItem; index: number; step: number; size: number; hidden: boolean }) {
  const x = useRef(new Animated.Value(index * step)).current;
  const land = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: index * step, friction: 7, tension: 120, useNativeDriver: true }).start();
  }, [index, step, x]);
  // İniş: uçuş bitince ezilip-gerilerek oturur.
  useEffect(() => {
    if (hidden) return;
    land.setValue(0);
    Animated.spring(land, { toValue: 1, damping: 6, stiffness: 260, mass: 0.6, useNativeDriver: true }).start();
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
            { scaleX: land.interpolate({ inputRange: [0, 0.5, 1, 2], outputRange: [1.3, 0.9, 1, 1] }) },
            { scaleY: land.interpolate({ inputRange: [0, 0.5, 1, 2], outputRange: [0.7, 1.12, 1, 1] }) },
          ],
        },
      ]}
    >
      <ProductIcon p={item.p} size={size - 8} />
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
  /** Uçuştaki uid'ler ("," ile) — memo karşılaştırması için dize. */
  hiddenKey: string;
  danger: boolean;
  lost: boolean;
  height: number;
  /** Başlık şeridi yüksekliği; 0 ise sayaç tezgâhın üstünde rozet olur. */
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
  return (
    <View style={[styles.holdWrap, { height }]}>
      {headH > 0 ? (
      <View style={[styles.holdHead, { height: headH - 4 }]}>
        <Text {...textScale.dense} style={[styles.holdLabel, (danger || lost) && styles.holdLabelDanger]}>
          {lost ? "Tezgâh doldu!" : danger ? "Son yuva! Dikkat" : "Bekleme tezgâhı"}
        </Text>
        <Text {...textScale.dense} style={[styles.holdCount, (danger || lost) && styles.holdLabelDanger]}>
          {hold.length}/{cap}
        </Text>
      </View>
      ) : null}
      <Animated.View
        style={[
          styles.holdRow,
          { width: rowW + 12, transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }] },
          (danger || lost) && styles.holdRowDanger,
        ]}
        accessibilityLabel={`Bekleme tezgâhı ${hold.length} / ${cap}: ${hold.map((it) => productName(it.p)).join(", ") || "boş"}`}
      >
        {!(danger || lost) ? <WoodGrain w={rowW + 6} h={Math.max(10, height - headH - 9)} r={radius.md} base={S.wood} dark={S.woodDark} light={S.woodLight} /> : null}
        {Array.from({ length: cap }, (_, k) => (
          <View
            key={k}
            style={[styles.holdSlot, { width: size, height: size, left: 3 + k * (size + gap) }, k === cap - 1 && styles.holdSlotLast]}
          />
        ))}
        <View style={[styles.holdItems, { left: 3 }]}>
          {hold.map((it, k) => (
            <HoldItemView key={it.uid} item={it} index={k} step={size + gap} size={size} hidden={hidden.has(it.uid)} />
          ))}
        </View>
        {headH === 0 ? (
          <View style={[styles.holdBadge, (danger || lost) && styles.holdBadgeDanger]}>
            <Text {...textScale.badge} style={styles.holdBadgeText}>
              {hold.length}/{cap}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
});

/* ───────────────────────────── yığın ───────────────────────────── */

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
}: {
  idle: Animated.Value;
  stack: KantinItem[];
  index: number;
  /** Yalnız kilitli ürün içeren yığına gerçek değer gelir (gereksiz çizim yok). */
  served: number;
  width: number;
  tile: number;
  rowStep: number;
  height: number;
  onTap: (index: number) => void;
  /** Kilitli dokunuşta sallama tetikleyicisi. */
  nudge: number;
  /** Rafın üstündeki boşluk (fazla yükseklik dağıtılınca büyür). */
  padTop: number;
}) {
  const slide = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
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
    ? "Boş yığın"
    : topLocked
      ? `Kilitli kutu, ${top.lock - served} sipariş sonra açılır`
      : `${productName(top.p)} al. Yığında ${stack.length} ürün`;

  return (
    <Pressable
      onPress={() => onTap(index)}
      disabled={!top}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.stackCol, { width, height }]}
    >
      <View style={[styles.shelf, { width, height }]}>
        <WoodGrain w={width - 6} h={height - 6} r={radius.md} base={S.shelf} dark={S.counterEdge} light={S.counter} />
      </View>
      {/* Ürünler sütunun kendi koordinatlarında konumlanır: sarmalayıcı
          sütunu tam kaplar (yoksa ortalanan sıfır genişlikli kap kartları
          yarım sütun sağa kaydırıyordu). */}
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transform: [
            { translateY: slide },
            { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-5, 5] }) },
          ],
        }}
      >
        {visible
          .map((it, d) => {
            const hidden = it.crate && upperOpen;
            const locked = it.lock > served;
            const isTop = d === 0;
            const size = isTop ? tile : tile * 0.84;
            return (
              <Animated.View
                key={it.uid}
                style={[
                  isTop ? { transform: [{ translateY: wave(idle, index * 0.23, 1.8) }, { scale: Animated.add(1, wave(idle, index * 0.23 + 0.25, 0.025)) }] } : null,
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
                  hidden && styles.tileCrate,
                ]}
              >
                {isTop && !hidden ? <Gloss w={size - 2} h={size - 4} r={radius.sm} /> : null}
                {hidden ? <CrateIcon size={size - 4} /> : <ProductIcon p={it.p} size={size - (isTop ? 10 : 12)} />}
                {locked && !hidden ? (
                  <View style={[styles.lock, { borderRadius: radius.sm }]}>
                    <Ionicons name="lock-closed" size={Math.max(12, size * 0.32)} color={S.white} />
                    <Text {...textScale.badge} style={styles.lockText}>
                      {it.lock - served}
                    </Text>
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

const styles = StyleSheet.create({
  hud: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.sm + 4, paddingRight: space.sm },
  hudGoalWrap: { flex: 1 },
  hudGoalText: { flex: 1, gap: 2 },
  hudValue: { ...type.scoreSm, color: S.white, ...toonShadow },
  hudOf: { ...type.numSmStrong, fontFamily: fonts.bold, color: S.hudOfInk },
  hudBar: { height: 10, borderRadius: radius.pill, backgroundColor: CARTOON.outline, overflow: "hidden", borderWidth: 1.5, borderColor: CARTOON.outline },
  hudBarFill: { height: 7, borderRadius: radius.pill, backgroundColor: S.progress, borderBottomWidth: 2, borderColor: S.progressEdge },
  hudTime: { ...type.scoreSm, color: S.white, minWidth: 40, ...toonShadow },
  hudTipsValue: { ...type.scoreSm, color: S.white, minWidth: 18, ...toonShadow },

  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingLeft: space.md + 4,
    backgroundColor: S.dock,
    borderTopWidth: OUT,
    borderColor: CARTOON.outline,
  },
  dockLeft: { flex: 1, gap: space.xs, minWidth: 0 },
  queueChip: { alignSelf: "flex-start" },
  queueValue: { ...type.scoreXs, color: S.white, ...toonShadow },
  queueLabel: { ...type.labelXs, fontFamily: fonts.bold, color: S.white },
  extras: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
  extraChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 20,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: CARTOON.outline,
    borderWidth: 1.5,
    borderColor: S.chipBorder,
  },
  extraText: { ...type.nano, fontFamily: fonts.bold, color: S.white },
  boost: { width: 150, marginTop: space.xs },

  fanSpot: { alignItems: "center" },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: space.s,
    backgroundColor: S.bubble,
    borderRadius: radius.lg,
    borderWidth: 2.5,
    borderColor: CARTOON.outline,
  },
  bubbleVip: { backgroundColor: S.vipBubble },
  bubbleItem: { alignItems: "center", justifyContent: "center" },
  bubbleItemDone: { opacity: 0.4 },
  check: {
    position: "absolute",
    right: -3,
    bottom: -2,
    width: 13,
    height: 13,
    borderRadius: radius.pill,
    backgroundColor: S.check,
    borderWidth: 1.5,
    borderColor: CARTOON.outline,
    alignItems: "center",
    justifyContent: "center",
  },
  tail: {
    position: "absolute",
    bottom: -7,
    left: "50%",
    marginLeft: -6,
    width: 12,
    height: 12,
    backgroundColor: S.bubble,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: CARTOON.outline,
    transform: [{ rotate: "45deg" }],
  },
  tailVip: { backgroundColor: S.vipBubble },
  fanWrap: { marginTop: 6, alignItems: "center" },
  vipBar: {
    position: "absolute",
    bottom: 2,
    width: 44,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: CARTOON.outline,
    borderWidth: 1.5,
    borderColor: CARTOON.outline,
    overflow: "hidden",
  },
  vipFill: { height: 6, borderRadius: radius.pill },

  plateOuter: {
    backgroundColor: S.plate,
    borderWidth: 2.5,
    borderColor: CARTOON.outline,
    borderBottomWidth: 5,
    padding: 3,
  },
  plateVip: { backgroundColor: S.vipBubble },
  plateInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderWidth: 1.5,
    borderColor: S.plateRim,
  },
  ghostDot: { borderWidth: 2, borderColor: S.plateRim, borderStyle: "dashed" },

  holdWrap: { alignItems: "center" },
  holdHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: 4,
    paddingHorizontal: space.md,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: CARTOON.outline,
  },
  holdLabel: { ...type.labelSm, fontFamily: fonts.bold, color: S.white },
  holdCount: { ...type.scoreXs, color: S.white },
  holdLabelDanger: { color: S.dangerText },
  holdRow: {
    flex: 1,
    backgroundColor: S.wood,
    borderRadius: radius.lg,
    borderWidth: OUT,
    borderBottomWidth: 5,
    borderColor: CARTOON.outline,
    overflow: "hidden",
  },
  holdRowDanger: { backgroundColor: S.danger },
  holdSlot: {
    position: "absolute",
    top: 2,
    borderRadius: radius.sm,
    backgroundColor: S.holdSlot,
    borderWidth: 2,
    borderColor: CARTOON.outline,
  },
  holdBadge: {
    position: "absolute",
    right: -6,
    top: -6,
    minWidth: 32,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: CARTOON.outline,
    borderWidth: 2,
    borderColor: S.white,
    alignItems: "center",
    justifyContent: "center",
  },
  holdBadgeDanger: { backgroundColor: S.danger },
  holdBadgeText: { ...type.nano, fontFamily: fonts.bold, color: S.white },
  holdSlotLast: { borderColor: S.danger, borderWidth: 2.5, borderStyle: "dashed" },
  holdItems: { position: "absolute", top: 2 },
  holdItem: {
    position: "absolute",
    left: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  stackCol: { alignItems: "center" },
  shelf: {
    position: "absolute",
    left: 0,
    top: 0,
    borderRadius: radius.lg,
    backgroundColor: S.shelf,
    borderWidth: OUT,
    borderColor: CARTOON.outline,
    overflow: "hidden",
  },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 2.5,
    borderColor: CARTOON.outline,
  },
  tileTop: {
    backgroundColor: S.tile,
    borderBottomWidth: 6,
  },
  tileLow: { backgroundColor: S.tileDim },
  tileCrate: { backgroundColor: S.crate },
  lock: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: S.lockBg,
    alignItems: "center",
    justifyContent: "center",
  },
  lockText: { ...type.nano, fontFamily: fonts.bold, color: S.white },
  more: {
    position: "absolute",
    bottom: 4,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: CARTOON.outline,
    borderWidth: 1.5,
    borderColor: S.white,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { ...type.nano, fontFamily: fonts.bold, color: S.white },
});
