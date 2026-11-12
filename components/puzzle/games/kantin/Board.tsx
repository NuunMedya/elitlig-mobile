/**
 * Kantin tahtasının parçaları — hepsi memo'lu; yalnız kendi verisi değişince
 * yeniden çizilir (süre tik'i HUD ve taraftarlar dışında hiçbir şeye dokunmaz).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Ellipse, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { kantinScene as S } from "@/lib/puzzle/kantinPalette";
import { KANTIN_PRODUCTS, type KantinItem, type KantinOrder } from "@/lib/puzzle/levels/kantin";
import { fonts, radius, space, textScale, type } from "@/theme";

import { FanFigure, type FanMood } from "./Fan";
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
  const rowH = 17;
  const rows = Math.max(2, Math.min(7, Math.floor((h - awn - 6) / rowH)));
  const step = 17;
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
        <Rect key={`row${r}`} x={0} y={awn + 8 + r * rowH + 9} width={w} height={rowH - 9} fill={r % 2 ? S.seatA : S.seatB} />
      ))}
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const x = c * step + (r % 2 ? step / 2 : 0) - 4;
          const y = awn + 8 + r * rowH + 6;
          const tone = S.crowd[(c * 5 + r * 3 + ((c * r) % 4)) % S.crowd.length];
          return (
            <React.Fragment key={`c${r}-${c}`}>
              <Ellipse cx={x} cy={y + 7} rx={6.5} ry={5} fill={tone} fillOpacity={0.55} />
              <Ellipse cx={x} cy={y} rx={3.8} ry={3.8} fill={S.crowdSkin} fillOpacity={0.5} />
            </React.Fragment>
          );
        }),
      )}
      {Array.from({ length: segs }, (_, i) => {
        const x = i * seg;
        const d = `M ${x} 0 H ${x + seg} V ${awn * 0.62} Q ${x + seg / 2} ${awn * 1.25} ${x} ${awn * 0.62} Z`;
        return <Path key={`a${i}`} d={d} fill={i % 2 ? S.awningB : S.awningA} stroke={S.awningEdge} strokeOpacity={0.35} strokeWidth={1} />;
      })}
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
  const pill = Math.max(34, Math.min(46, height - 10));
  return (
    <View style={[styles.hud, { height }]}>
      <View style={[styles.hudGoal, { height: pill, borderRadius: pill / 2 }]} accessibilityLabel={`Sipariş ${served} / ${total}`}>
        <Animated.View style={[styles.hudIcon, { width: pill + 4, height: pill + 4, borderRadius: (pill + 4) / 2, transform: [{ scale: goalPop }] }]}>
          <Ionicons name="restaurant" size={Math.round(pill * 0.46)} color={S.white} />
        </Animated.View>
        <View style={styles.hudGoalText}>
          <Text {...textScale.badge} style={styles.hudValue}>
            {served}
            <Text style={styles.hudOf}>/{total}</Text>
          </Text>
          <View style={styles.hudBar}>
            <View style={[styles.hudBarFill, { width: `${Math.round(pct * 100)}%` }]} />
          </View>
        </View>
      </View>
      {timeLeft !== null ? (
        <Animated.View
          style={[styles.hudTimer, { height: pill, borderRadius: pill / 2, transform: [{ scale: pop }] }, low && styles.hudTimerLow]}
          accessibilityLabel={`Kalan süre ${mm} dakika ${ss} saniye`}
        >
          <Ionicons name="alarm" size={Math.round(pill * 0.44)} color={S.white} />
          <Text {...textScale.badge} style={styles.hudTime}>
            {mm}:{String(ss).padStart(2, "0")}
          </Text>
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.hudTips, { height: pill, borderRadius: pill / 2, transform: [{ scale: bump }] }]} accessibilityLabel={`Bahşiş ${tips}`}>
        <CoinIcon size={Math.round(pill * 0.52)} />
        <Text {...textScale.badge} style={styles.hudTipsValue}>
          {tips}
        </Text>
      </Animated.View>
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
  const btnH = Math.max(40, Math.min(58, height - 16));
  return (
    <View style={[styles.dock, { height }]}>
      <View style={styles.dockLeft}>
        <View style={styles.queueChip} accessibilityLabel={queueLeft > 0 ? `Sırada ${queueLeft} taraftar` : "Sırada taraftar kalmadı"}>
          <Ionicons name="people" size={16} color={S.white} />
          <Text {...textScale.badge} style={styles.queueValue}>
            {queueLeft}
          </Text>
          <Text {...textScale.badge} style={styles.queueLabel} numberOfLines={1}>
            {queueLeft > 0 ? "sırada" : "son tur"}
          </Text>
        </View>
        {extras.length ? (
          <View style={styles.extras}>
            {extras.map((e) => (
              <View key={e} style={styles.extraChip}>
                <Ionicons name="checkmark-circle" size={11} color={S.progress} />
                <Text {...textScale.badge} style={styles.extraText} numberOfLines={1}>
                  {e}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Pressable
        onPress={onHizli}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Hızlı Servis, stok ${hizliStock}`}
        style={({ pressed }) => [
          styles.boost,
          { height: btnH, borderRadius: radius.xl },
          pressed && styles.boostPressed,
          disabled && styles.disabled,
        ]}
        hitSlop={4}
      >
        <View style={[styles.boostShine, { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]} />
        <View style={[styles.boostIcon, { width: btnH - 14, height: btnH - 14, borderRadius: (btnH - 14) / 2 }]}>
          <Ionicons name="flash" size={Math.round(btnH * 0.42)} color={S.boostFace} />
        </View>
        <Text {...textScale.badge} style={styles.boostText}>
          HIZLI{"\n"}SERVİS
        </Text>
        <View style={[styles.badge, hizliStock > 0 ? null : styles.badgePlus]}>
          <Text {...textScale.badge} style={styles.badgeText}>
            {hizliStock > 0 ? hizliStock : "+"}
          </Text>
        </View>
      </Pressable>
    </View>
  );
});

/* ───────────────────────────── taraftar + balon ───────────────────────────── */

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
}: {
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
      <View style={styles.fanWrap}>
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
      </View>
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
  useEffect(() => {
    Animated.spring(x, { toValue: index * step, friction: 7, tension: 120, useNativeDriver: true }).start();
  }, [index, step, x]);
  return (
    <Animated.View style={[styles.holdItem, { width: size, height: size, opacity: hidden ? 0 : 1, transform: [{ translateX: x }] }]}>
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
        {!(danger || lost) ? <WoodGrain w={rowW + 12} h={Math.max(10, height - headH)} r={radius.md} base={S.wood} dark={S.woodDark} light={S.woodLight} /> : null}
        {Array.from({ length: cap }, (_, k) => (
          <View
            key={k}
            style={[styles.holdSlot, { width: size, height: size, left: 6 + k * (size + gap) }, k === cap - 1 && styles.holdSlotLast]}
          />
        ))}
        <View style={[styles.holdItems, { left: 6 }]}>
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
}: {
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
        <WoodGrain w={width - 2} h={height - 2} r={radius.md} base={S.shelf} dark={S.counterEdge} light={S.counter} />
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
              <View
                key={it.uid}
                style={[
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
              </View>
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
  hud: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm },
  hudGoal: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: S.hudFace,
    paddingRight: space.md,
    borderBottomWidth: 4,
    borderColor: S.hudEdge,
  },
  hudIcon: {
    marginLeft: -2,
    backgroundColor: S.goalFace,
    borderBottomWidth: 4,
    borderColor: S.goalEdge,
    alignItems: "center",
    justifyContent: "center",
  },
  hudGoalText: { flex: 1, gap: 2 },
  hudValue: { ...type.scoreSm, color: S.inkOnLight },
  hudOf: { ...type.numSmStrong, color: S.inkSoft },
  hudBar: { height: 8, borderRadius: radius.xs, backgroundColor: S.hudTrack, overflow: "hidden" },
  hudBarFill: { height: 8, borderRadius: radius.xs, backgroundColor: S.progress, borderBottomWidth: 2, borderColor: S.progressEdge },
  hudTimer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: S.timerFace,
    paddingHorizontal: space.md,
    borderBottomWidth: 4,
    borderColor: S.timerEdge,
  },
  hudTimerLow: { backgroundColor: S.timerLowFace, borderColor: S.timerLowEdge },
  hudTime: { ...type.scoreSm, color: S.white, minWidth: 40, textShadowColor: S.textShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  hudTips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: S.tipsFace,
    paddingLeft: space.xs,
    paddingRight: space.md,
    borderBottomWidth: 4,
    borderColor: S.tipsEdge,
  },
  hudTipsValue: { ...type.scoreSm, color: S.inkOnLight, minWidth: 18 },

  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: S.dock,
    borderTopWidth: 3,
    borderColor: S.dockTop,
  },
  dockLeft: { flex: 1, gap: space.xs, minWidth: 0 },
  queueChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 30,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    backgroundColor: S.chipFace,
    borderWidth: 1,
    borderColor: S.chipBorder,
  },
  queueValue: { ...type.scoreXs, color: S.white },
  queueLabel: { ...type.labelXs, color: S.white },
  extras: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
  extraChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 18,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    backgroundColor: S.chipFace,
  },
  extraText: { ...type.nano, color: S.white },
  boost: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.s,
    paddingRight: space.lg,
    backgroundColor: S.boostFace,
    borderBottomWidth: 5,
    borderColor: S.boostEdge,
  },
  boostPressed: { borderBottomWidth: 2, transform: [{ translateY: 3 }] },
  boostShine: { position: "absolute", left: 6, right: 6, top: 3, height: "38%", backgroundColor: S.boostShine },
  boostIcon: { backgroundColor: S.white, alignItems: "center", justifyContent: "center" },
  boostText: { ...type.labelSm, fontFamily: fonts.bold, color: S.white, textShadowColor: S.textShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  disabled: { opacity: 0.5 },
  badge: {
    position: "absolute",
    right: -6,
    top: -8,
    minWidth: 24,
    height: 24,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    backgroundColor: S.badgeRed,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: S.white,
  },
  badgePlus: { backgroundColor: S.badgeGreen },
  badgeText: { ...type.numSmStrong, color: S.white },

  fanSpot: { alignItems: "center" },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: space.s,
    backgroundColor: S.bubble,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: S.bubbleEdge,
  },
  bubbleVip: { borderColor: S.vip, borderWidth: 2 },
  bubbleItem: { alignItems: "center", justifyContent: "center" },
  bubbleItemDone: { opacity: 0.45 },
  check: {
    position: "absolute",
    right: -3,
    bottom: -2,
    width: 13,
    height: 13,
    borderRadius: radius.pill,
    backgroundColor: S.check,
    alignItems: "center",
    justifyContent: "center",
  },
  tail: {
    position: "absolute",
    bottom: -6,
    left: "50%",
    marginLeft: -5,
    width: 10,
    height: 10,
    backgroundColor: S.bubble,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: S.bubbleEdge,
    transform: [{ rotate: "45deg" }],
  },
  tailVip: { borderColor: S.vip },
  fanWrap: { marginTop: 6, alignItems: "center" },
  vipBar: {
    position: "absolute",
    bottom: 2,
    width: 40,
    height: 6,
    borderRadius: 3,
    backgroundColor: S.shadow,
    overflow: "hidden",
  },
  vipFill: { height: 6, borderRadius: 3 },

  plateOuter: {
    backgroundColor: S.plate,
    borderWidth: 2,
    borderColor: S.plateRim,
    padding: 3,
    shadowColor: S.ink,
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  plateVip: { borderColor: S.vip },
  plateInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: S.plateRim,
  },
  ghostDot: { borderWidth: 1.5, borderColor: S.plateRim, borderStyle: "dashed" },

  holdWrap: { alignItems: "center" },
  holdHead: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 4 },
  holdLabel: { ...type.labelSm, fontFamily: fonts.bold, color: S.inkSoft },
  holdCount: { ...type.scoreXs, color: S.inkOnLight },
  holdLabelDanger: { color: S.danger },
  holdRow: {
    flex: 1,
    backgroundColor: S.wood,
    borderRadius: radius.md,
    borderBottomWidth: 4,
    borderColor: S.woodEdge,
  },
  holdRowDanger: { backgroundColor: S.danger, borderColor: S.woodEdge },
  holdSlot: {
    position: "absolute",
    top: 5,
    borderRadius: radius.sm,
    backgroundColor: S.holdSlot,
    borderWidth: 1,
    borderColor: S.holdEdge,
  },
  holdBadge: {
    position: "absolute",
    right: -8,
    top: -8,
    minWidth: 30,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: S.woodDark,
    borderWidth: 1.5,
    borderColor: S.white,
    alignItems: "center",
    justifyContent: "center",
  },
  holdBadgeDanger: { backgroundColor: S.danger },
  holdBadgeText: { ...type.nano, color: S.white },
  holdSlotLast: { borderColor: S.danger, borderWidth: 1.5, borderStyle: "dashed" },
  holdItems: { position: "absolute", top: 5 },
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
    borderRadius: radius.md,
    backgroundColor: S.shelf,
    borderWidth: 1,
    borderColor: S.counterEdge,
    overflow: "hidden",
  },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  tileTop: {
    backgroundColor: S.tile,
    borderColor: S.tileEdge,
    borderBottomWidth: 3,
    shadowColor: S.ink,
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tileLow: { backgroundColor: S.tileDim, borderColor: S.tileEdge, opacity: 0.88 },
  tileCrate: { backgroundColor: S.crate, borderColor: S.crateDark },
  lock: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: S.lockBg,
    alignItems: "center",
    justifyContent: "center",
  },
  lockText: { ...type.nano, color: S.white },
  more: {
    position: "absolute",
    bottom: 4,
    paddingHorizontal: 6,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: S.woodDark,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { ...type.nano, color: S.white },
});
