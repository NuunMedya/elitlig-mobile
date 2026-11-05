/**
 * Kantin tahtasının parçaları — hepsi memo'lu; yalnız kendi verisi değişince
 * yeniden çizilir (süre tik'i HUD ve taraftarlar dışında hiçbir şeye dokunmaz).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { kantinScene as S } from "@/lib/puzzle/kantinPalette";
import { KANTIN_PRODUCTS, type KantinItem, type KantinOrder } from "@/lib/puzzle/levels/kantin";
import { colors, radius, space, textScale, type } from "@/theme";

import { FanFigure, type FanMood } from "./Fan";
import { CoinIcon, CrateIcon, ProductIcon } from "./ProductIcon";

export const productName = (p: number) => KANTIN_PRODUCTS[p]?.name ?? "Ürün";

/* ───────────────────────────── HUD ───────────────────────────── */

export const Hud = memo(function Hud({
  served,
  total,
  timeLeft,
  tips,
  tipsBump,
  hizliStock,
  onHizli,
  disabled,
  height,
}: {
  served: number;
  total: number;
  timeLeft: number | null;
  tips: number;
  tipsBump: number;
  hizliStock: number;
  onHizli: () => void;
  disabled: boolean;
  height: number;
}) {
  const bump = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!tipsBump) return;
    bump.setValue(1.35);
    Animated.spring(bump, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [tipsBump, bump]);
  const low = timeLeft !== null && timeLeft <= 15;
  const mm = timeLeft !== null ? Math.floor(Math.max(0, timeLeft) / 60) : 0;
  const ss = timeLeft !== null ? Math.floor(Math.max(0, timeLeft) % 60) : 0;
  const pct = total ? served / total : 0;
  return (
    <View style={[styles.hud, { height }]}>
      <View style={styles.hudGoal} accessibilityLabel={`Sipariş ${served} / ${total}`}>
        <View style={styles.hudIcon}>
          <Ionicons name="restaurant" size={16} color={colors.textOnBrand} />
        </View>
        <View style={styles.hudGoalText}>
          <Text {...textScale.dense} style={styles.hudValue}>
            {served}/{total}
          </Text>
          <View style={styles.hudBar}>
            <View style={[styles.hudBarFill, { width: `${Math.round(pct * 100)}%` }]} />
          </View>
        </View>
      </View>
      {timeLeft !== null ? (
        <View
          style={[styles.hudTimer, low && styles.hudTimerLow]}
          accessibilityLabel={`Kalan süre ${mm} dakika ${ss} saniye`}
        >
          <Ionicons name="time" size={15} color={low ? colors.textOnStatus : colors.textPrimary} />
          <Text {...textScale.dense} style={[styles.hudTime, low && styles.hudTimeLow]}>
            {mm}:{String(ss).padStart(2, "0")}
          </Text>
        </View>
      ) : null}
      <Animated.View style={[styles.hudTips, { transform: [{ scale: bump }] }]} accessibilityLabel={`Bahşiş ${tips}`}>
        <CoinIcon size={18} />
        <Text {...textScale.dense} style={styles.hudValue}>
          {tips}
        </Text>
      </Animated.View>
      <Pressable
        onPress={onHizli}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Hızlı Servis, stok ${hizliStock}`}
        style={({ pressed }) => [styles.hizli, pressed && styles.pressed, disabled && styles.disabled]}
        hitSlop={4}
      >
        <Ionicons name="flash" size={20} color={colors.textOnBrand} />
        <View style={styles.badge}>
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
  const icon = Math.min(22, Math.floor((width - 16) / n) - 2);
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
              <View style={styles.check}>
                <Ionicons name="checkmark" size={9} color={S.white} />
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
      <View style={styles.holdHead}>
        <Text {...textScale.dense} style={[styles.holdLabel, (danger || lost) && styles.holdLabelDanger]}>
          {lost ? "Tezgâh doldu!" : danger ? "Son yuva! Dikkat" : "Bekleme tezgâhı"}
        </Text>
        <Text {...textScale.dense} style={[styles.holdCount, (danger || lost) && styles.holdLabelDanger]}>
          {hold.length}/{cap}
        </Text>
      </View>
      <Animated.View
        style={[
          styles.holdRow,
          { width: rowW + 12, transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }] },
          (danger || lost) && styles.holdRowDanger,
        ]}
        accessibilityLabel={`Bekleme tezgâhı ${hold.length} / ${cap}: ${hold.map((it) => productName(it.p)).join(", ") || "boş"}`}
      >
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
      <View style={[styles.shelf, { width, height }]} />
      <Animated.View
        style={{
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
                    top: 6 + d * rowStep + (isTop ? 0 : (tile - size) / 2),
                    width: size,
                    height: size,
                    zIndex: STACK_VISIBLE - d,
                  },
                  isTop ? styles.tileTop : styles.tileLow,
                  hidden && styles.tileCrate,
                ]}
              >
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
  hud: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs },
  hudGoal: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface1,
    borderRadius: radius.pill,
    paddingVertical: space.xs,
    paddingLeft: space.xs,
    paddingRight: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hudIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  hudGoalText: { flex: 1, gap: 3 },
  hudValue: { ...type.numSmStrong, color: colors.textPrimary },
  hudBar: { height: 5, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
  hudBarFill: { height: 5, borderRadius: 3, backgroundColor: colors.win },
  hudTimer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface1,
    borderRadius: radius.pill,
    paddingHorizontal: space.m,
    height: 38,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hudTimerLow: { backgroundColor: colors.live, borderColor: colors.live },
  hudTime: { ...type.numSmStrong, color: colors.textPrimary, minWidth: 34 },
  hudTimeLow: { color: colors.textOnStatus },
  hudTips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface1,
    borderRadius: radius.pill,
    paddingHorizontal: space.m,
    height: 38,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hizli: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.94 }] },
  disabled: { opacity: 0.5 },
  badge: {
    position: "absolute",
    right: -3,
    top: -3,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    backgroundColor: colors.star,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  badgeText: { ...type.nano, color: S.ink },

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
  holdHead: { flexDirection: "row", alignItems: "center", gap: space.sm, height: 18, marginBottom: 4 },
  holdLabel: { ...type.labelXs, color: colors.textSecondary },
  holdCount: { ...type.numSmStrong, color: colors.textSecondary },
  holdLabelDanger: { color: colors.live },
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
