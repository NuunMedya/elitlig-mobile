/**
 * Kantin efektleri — hepsi SONLU Animated dizileri (useNativeDriver) ve
 * bitince `onDone(id)` ile kendini kaldırır: uçan ürün, servis edilen tabak,
 * ayrılan taraftar, bahşiş jetonu, konfeti patlaması, metin patlaması.
 */

import React, { memo, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { kantinConfetti, kantinScene as S } from "@/lib/puzzle/kantinPalette";
import { fonts, radius, space, textScale, type } from "@/theme";
import { softShadow, toonShadow } from "../soyunma/CartoonKit";

import { FanFigure } from "./Fan";
import { CoinIcon, ProductIcon } from "./ProductIcon";

export interface Pt {
  x: number;
  y: number;
}

export type Fx =
  | { id: number; kind: "fly"; p: number; uid: number; from: Pt; to: Pt; size: number; toSize: number; delay: number }
  | { id: number; kind: "serve"; at: Pt; to: Pt; items: number[]; width: number; delay: number }
  | { id: number; kind: "leave"; at: Pt; size: number; jersey: number; face: number; vip: boolean; angry: boolean; delay: number }
  | { id: number; kind: "coin"; from: Pt; to: Pt; delay: number }
  | { id: number; kind: "burst"; at: Pt; delay: number }
  | { id: number; kind: "text"; at: Pt; text: string; tone: "win" | "warn" | "danger" | "gold"; big: boolean; delay: number };

/** Kimliksiz efekt (birleşim üyelerine dağıtılmış Omit). */
export type FxInput = Fx extends infer T ? (T extends Fx ? Omit<T, "id"> : never) : never;

type Done = (id: number) => void;

function useRun(duration: number, delay: number, onDone: () => void, easing = Easing.out(Easing.cubic)) {
  const t = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const anim = Animated.timing(t, { toValue: 1, duration, delay, easing, useNativeDriver: true });
    anim.start(({ finished }) => {
      if (finished) done.current();
    });
    return () => anim.stop();
  }, [t, duration, delay, easing]);
  return t;
}

const Flyer = memo(function Flyer({ fx, onDone }: { fx: Extract<Fx, { kind: "fly" }>; onDone: Done }) {
  const t = useRun(270, fx.delay, () => onDone(fx.id), Easing.inOut(Easing.quad));
  const lift = Math.min(fx.from.y, fx.to.y) - 34;
  const half = fx.size / 2;
  const style = {
    transform: [
      { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [fx.from.x - half, fx.to.x - half] }) },
      { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [fx.from.y - half, lift - half, fx.to.y - half] }) },
      { scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, fx.toSize / fx.size] }) },
    ],
    opacity: t.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 1, 1] }),
  };
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, style]}>
      <ProductIcon p={fx.p} size={fx.size} />
    </Animated.View>
  );
});

const ServeGhost = memo(function ServeGhost({ fx, onDone }: { fx: Extract<Fx, { kind: "serve" }>; onDone: Done }) {
  const t = useRun(420, fx.delay, () => onDone(fx.id), Easing.in(Easing.back(1.4)));
  const w = fx.width;
  const h = w * 0.42;
  const icon = Math.min(22, (w - 14) / Math.max(1, fx.items.length));
  const style = {
    transform: [
      { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [fx.at.x - w / 2, fx.to.x - w / 2] }) },
      { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [fx.at.y - h / 2, fx.to.y - h / 2] }) },
      { scale: t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [1, 1.08, 0.45] }) },
    ],
    opacity: t.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
  };
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { width: w, height: h }, style]}>
      <View style={[styles.ghostPlate, { borderRadius: h / 2 }]}>
        {fx.items.map((p, i) => (
          <ProductIcon key={i} p={p} size={icon} />
        ))}
      </View>
    </Animated.View>
  );
});

const LeavingFan = memo(function LeavingFan({ fx, onDone }: { fx: Extract<Fx, { kind: "leave" }>; onDone: Done }) {
  const t = useRun(560, fx.delay, () => onDone(fx.id), Easing.in(Easing.quad));
  const w = fx.size;
  const h = (w * 72) / 64;
  const style = {
    transform: [
      { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [fx.at.x - w / 2, fx.at.x - w / 2 + (fx.angry ? -26 : 22)] }) },
      // Mutlu taraftar zıplayarak çıkar, kızgın olan sallanarak.
      { translateY: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [fx.at.y - h / 2, fx.at.y - h / 2 - (fx.angry ? 2 : 14), fx.at.y - h / 2 - 6] }) },
      { rotate: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: fx.angry ? ["0deg", "-8deg", "8deg", "-8deg", "0deg"] : ["0deg", "4deg", "0deg", "-4deg", "0deg"] }) },
    ],
    opacity: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }),
  };
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, style]}>
      <FanFigure size={w} jersey={fx.jersey} face={fx.face} mood={fx.angry ? "angry" : "joy"} vip={fx.vip} />
    </Animated.View>
  );
});

const CoinFly = memo(function CoinFly({ fx, onDone }: { fx: Extract<Fx, { kind: "coin" }>; onDone: Done }) {
  const t = useRun(620, fx.delay, () => onDone(fx.id), Easing.inOut(Easing.cubic));
  const size = 20;
  const peak = Math.min(fx.from.y, fx.to.y) - 40;
  const style = {
    transform: [
      { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [fx.from.x - size / 2, fx.to.x - size / 2] }) },
      { translateY: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [fx.from.y - size / 2, peak, fx.to.y - size / 2] }) },
      { scale: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.3, 1.1, 0.8] }) },
    ],
  };
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, style]}>
      <CoinIcon size={size} />
    </Animated.View>
  );
});

const BURST_N = 8;
const BURST_DIRS = Array.from({ length: BURST_N }, (_, i) => {
  const a = (i / BURST_N) * Math.PI * 2;
  const r = 26 + (i % 3) * 6;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r - 8, color: kantinConfetti[i % kantinConfetti.length], s: 4 + (i % 2) * 2 };
});

const Burst = memo(function Burst({ fx, onDone }: { fx: Extract<Fx, { kind: "burst" }>; onDone: Done }) {
  const t = useRun(560, fx.delay, () => onDone(fx.id));
  return (
    <View pointerEvents="none" style={[styles.abs, { transform: [{ translateX: fx.at.x }, { translateY: fx.at.y }] }]}>
      {BURST_DIRS.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            styles.abs,
            {
              width: d.s,
              height: d.s,
              borderRadius: i % 2 ? d.s / 2 : 1,
              backgroundColor: d.color,
              opacity: t.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-d.s / 2, d.dx - d.s / 2] }) },
                { translateY: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [-d.s / 2, d.dy, d.dy + 14] }) },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${(i % 2 ? 1 : -1) * 120}deg`] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
});

const FloatText = memo(function FloatText({ fx, onDone }: { fx: Extract<Fx, { kind: "text" }>; onDone: Done }) {
  const t = useRun(fx.big ? 1050 : 850, fx.delay, () => onDone(fx.id));
  const color = fx.tone === "danger" ? S.danger : fx.tone === "warn" ? S.vipDeep : fx.tone === "gold" ? S.coinEdge : S.check;
  const style = {
    opacity: t.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
    transform: [
      { translateX: fx.at.x - 110 },
      { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [fx.at.y - 14, fx.at.y - (fx.big ? 46 : 34)] }) },
      { scaleX: t.interpolate({ inputRange: [0, 0.14, 0.22, 0.3, 1], outputRange: [0.6, fx.big ? 1.08 : 1.05, 0.98, 1, 1] }) },
      { scaleY: t.interpolate({ inputRange: [0, 0.14, 0.22, 0.3, 1], outputRange: [0.6, 0.96, 1.03, 1, 1] }) },
    ],
  };
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, styles.textBox, style]}>
      <View style={[styles.textPill, { backgroundColor: color }, fx.big ? styles.textPillBig : null]}>
        <Text {...textScale.badge} style={fx.big ? styles.bigText : styles.smallText} numberOfLines={1}>
          {fx.text}
        </Text>
      </View>
    </Animated.View>
  );
});

/** Efekt katmanı: board'un üstünde, dokunmayı engellemez. */
export const FxLayer = memo(function FxLayer({ fx, onDone }: { fx: Fx[]; onDone: Done }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {fx.map((f) => {
        switch (f.kind) {
          case "fly":
            return <Flyer key={f.id} fx={f} onDone={onDone} />;
          case "serve":
            return <ServeGhost key={f.id} fx={f} onDone={onDone} />;
          case "leave":
            return <LeavingFan key={f.id} fx={f} onDone={onDone} />;
          case "coin":
            return <CoinFly key={f.id} fx={f} onDone={onDone} />;
          case "burst":
            return <Burst key={f.id} fx={f} onDone={onDone} />;
          default:
            return <FloatText key={f.id} fx={f} onDone={onDone} />;
        }
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  abs: { position: "absolute", left: 0, top: 0 },
  ghostPlate: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: S.plate,
    ...softShadow,
  },
  textBox: { width: 220, alignItems: "center" },
  textPill: {
    paddingHorizontal: space.md,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    maxWidth: 220,
    ...softShadow,
  },
  textPillBig: { paddingHorizontal: space.lg },
  bigText: { ...type.scoreSm, color: S.white, ...toonShadow },
  smallText: { ...type.label, fontFamily: fonts.bold, color: S.white, ...toonShadow },
});
