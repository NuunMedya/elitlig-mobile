/**
 * Elit Üçlü efektleri — hepsi SONLU, tek Animated.Value ile sürülen, yerel
 * sürücülü küçük parçalar: parçacık patlaması (renkli kırıklar + yıldızlar),
 * iki yöne uçan füzeler ve iz ışınları, Röveşata şok dalgası, Altın Top
 * ışınları, hedefe uçan dron, tahta parlaması, kombo metni ve hedef sayacına
 * uçan simge.
 *
 * Her efekt bağlanınca kendi animasyonunu bir kez oynatır; listeden toplu
 * olarak (adım bitince) kaldırılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { radius, textScale, type } from "@/theme";
import { UCLU_BOARD } from "@/lib/puzzle/ucluPalette";
import type { UcluGoalType } from "@/lib/puzzle/levels/uclu";
import { GoalIcon } from "./GoalIcon";
import { PieceGlyph } from "./Piece";

export type Fx =
  | {
      id: number;
      kind: "burst";
      x: number;
      y: number;
      color: string;
      size: number;
      big?: boolean;
    }
  | {
      id: number;
      kind: "beam";
      dir: "row" | "col";
      x: number;
      y: number;
      length: number;
      thick: number;
      delay: number;
    }
  | {
      id: number;
      kind: "ring";
      x: number;
      y: number;
      size: number;
      color: string;
    }
  | { id: number; kind: "flash"; x: number; y: number; w: number; h: number }
  | {
      id: number;
      kind: "text";
      x: number;
      y: number;
      text: string;
      big: boolean;
    }
  | {
      id: number;
      kind: "fly";
      x: number;
      y: number;
      tx: number;
      ty: number;
      size: number;
      glyph: FlyGlyph;
      delay: number;
    }
  | {
      id: number;
      kind: "rocket";
      dir: "row" | "col";
      x: number;
      y: number;
      /** Eksen boyunca tahtanın başı ve sonu (kök koordinat). */
      lo: number;
      hi: number;
      size: number;
      delay: number;
    }
  | {
      id: number;
      kind: "drone";
      x: number;
      y: number;
      tx: number;
      ty: number;
      size: number;
      delay: number;
    }
  | { id: number; kind: "shock"; x: number; y: number; size: number }
  | {
      id: number;
      kind: "rays";
      x: number;
      y: number;
      targets: { x: number; y: number }[];
    }
  | {
      id: number;
      kind: "banner";
      x: number;
      y: number;
      w: number;
      text: string;
      icon: IconName;
    };

type IconName = keyof typeof Ionicons.glyphMap;
/** Kimliksiz efekt (birleşim türünde her üyeden ayrı ayrı `id` düşülür). */
export type FxInput = Fx extends infer T ? (T extends Fx ? Omit<T, "id"> : never) : never;
export type FlyGlyph = { piece: number } | { trophy: true } | { cone: true } | { goal: UcluGoalType };

/** Konfeti kırıkları: sekiz yöne, hafif düzensiz açılarla savrulur. */
const ANGLES = [-90, -45, 0, 45, 90, 135, 180, 225].map((a) => (a * Math.PI) / 180);

/**
 * Patlama (sade): kısa beyaz flaş, topun renginde genişleyen halka ve altı
 * küçük renkli parça. Hepsi tek değerle sürülür (yerel sürücü). Konfeti
 * yalnız kazanınca (bonus patlamaları) kullanılır; burada yok.
 */
function Burst({ x, y, color, size, big }: { x: number; y: number; color: string; size: number; big?: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: big ? 620 : 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [t, big]);
  const reach = size * (big ? 0.95 : 0.7);
  const dot = Math.max(5, Math.round(size * 0.2));
  const ringScale = t.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, big ? 1.9 : 1.35],
  });
  const fade = t.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [1, 0.7, 0],
  });
  const core = size * 0.9;
  return (
    <View pointerEvents="none" style={[styles.abs, { left: x, top: y }]}>
      <Animated.View
        style={[
          styles.abs,
          {
            width: core,
            height: core,
            left: -core / 2,
            top: -core / 2,
            borderRadius: core / 2,
            backgroundColor: UCLU_BOARD.flash,
            opacity: t.interpolate({
              inputRange: [0, 0.12, 0.4],
              outputRange: [0.9, 0.55, 0],
              extrapolate: "clamp",
            }),
            transform: [
              {
                scale: t.interpolate({
                  inputRange: [0, 0.4],
                  outputRange: [0.4, 1.1],
                  extrapolate: "clamp",
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            left: -size / 2,
            top: -size / 2,
            borderRadius: size / 2,
            borderColor: color,
            opacity: fade,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      {ANGLES.map((a, i) => {
        // Topun renginde konfeti kırıkları: dönerek savrulur, yerçekimiyle düşer.
        const d = reach * (1 + (i % 3) * 0.18);
        const w = dot * 0.9;
        const h = dot * 0.9;
        return (
          <Animated.View
            key={i}
            style={[
              styles.shard,
              {
                width: w,
                height: h,
                left: -w / 2,
                top: -h / 2,
                borderRadius: h / 2,
                backgroundColor: color,
                opacity: t.interpolate({
                  inputRange: [0, 0.7, 1],
                  outputRange: [1, 1, 0],
                }),
                transform: [
                  {
                    translateX: t.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.cos(a) * d],
                    }),
                  },
                  {
                    translateY: t.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0, Math.sin(a) * d * 0.8, Math.sin(a) * d + reach * 0.7],
                    }),
                  },
                  {
                    scale: t.interpolate({
                      inputRange: [0, 0.15, 1],
                      outputRange: [0.4, 1.15, 0.6],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}
      {big
        ? [0, 1, 2].map((k) => {
            const a = ((k * 120 + 30) * Math.PI) / 180;
            const st = size * 0.34;
            return (
              <Animated.View
                key={`s${k}`}
                style={[
                  styles.abs,
                  {
                    left: -st / 2,
                    top: -st / 2,
                    opacity: t.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                    transform: [
                      { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * reach * 1.3] }) },
                      { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * reach * 1.3] }) },
                      { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) },
                      { scale: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.2, 0.5] }) },
                    ],
                  },
                ]}
              >
                <Ionicons name="star" size={st} color={UCLU_BOARD.comboGold} />
              </Animated.View>
            );
          })
        : null}
    </View>
  );
}

/** İki yöne fırlayan füzeler; arkalarında tahtanın kenarına dek uzayan ışık izi. */
function RocketFx({ dir, x, y, lo, hi, size, delay }: { dir: "row" | "col"; x: number; y: number; lo: number; hi: number; size: number; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 420, delay, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
  }, [t, delay]);
  const row = dir === "row";
  const origin = row ? x : y;
  const thick = size * 0.42;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[-1, 1].map((side) => {
        const end = side < 0 ? lo : hi;
        const dist = end - origin;
        const L = Math.max(1, Math.abs(dist));
        const grow = t.interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] });
        // Ölçek ortadan yapılır; iz, kaynağa yapışık kalsın diye kaydırılır.
        const shift = t.interpolate({ inputRange: [0, 1], outputRange: [side > 0 ? -L / 2 : L / 2, 0] });
        const fade = t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0.95, 0.85, 0] });
        const trailBox = row
          ? { left: side > 0 ? x : x - L, top: y - thick / 2, width: L, height: thick }
          : { left: x - thick / 2, top: side > 0 ? y : y - L, width: thick, height: L };
        const fly = t.interpolate({ inputRange: [0, 1], outputRange: [0, dist + side * size * 0.6] });
        return (
          <React.Fragment key={side}>
            <Animated.View
              style={[
                styles.trail,
                trailBox,
                { borderRadius: thick / 2, opacity: fade, transform: row ? [{ translateX: shift }, { scaleX: grow }] : [{ translateY: shift }, { scaleY: grow }] },
              ]}
            >
              <View style={[styles.beamCore, row ? { height: thick * 0.35 } : { width: thick * 0.35 }]} />
            </Animated.View>
            <Animated.View
              style={[
                styles.abs,
                {
                  left: x - size / 2,
                  top: y - size / 2,
                  transform: [row ? { translateX: fly } : { translateY: fly }, { rotate: row ? (side > 0 ? "0deg" : "180deg") : side > 0 ? "0deg" : "180deg" }],
                },
              ]}
            >
              <PieceGlyph kind="gem" color={-1} special={row ? "h" : "v"} size={size} />
            </Animated.View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

/** Dron: kalkış yerinden hedefe yay çizerek uçar, pervaneleri titrer. */
function DroneFx({ x, y, tx, ty, size, delay }: { x: number; y: number; tx: number; ty: number; size: number; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 440, delay, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  }, [t, delay]);
  const lift = Math.max(size * 1.2, Math.abs(tx - x) * 0.25 + Math.abs(ty - y) * 0.15);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.abs,
        {
          left: x - size / 2,
          top: y - size / 2,
          opacity: t.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] }),
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, tx - x] }) },
            { translateY: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, Math.min(0, ty - y) * 0.4 - lift, ty - y] }) },
            { rotate: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ["0deg", "-14deg", "10deg", "-8deg", "0deg"] }) },
            { scale: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.35, 0.9] }) },
          ],
        },
      ]}
    >
      <PieceGlyph kind="gem" color={-1} special="drone" size={size} />
    </Animated.View>
  );
}

/** Röveşata şok dalgası: dolu sıcak daire + genişleyen kalın halka. */
function Shock({ x, y, size }: { x: number; y: number; size: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t]);
  const box = { left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2 };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.abs,
          box,
          {
            backgroundColor: UCLU_BOARD.shock,
            opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.shockRing,
          box,
          {
            opacity: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.7, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.25] }) }],
          },
        ]}
      />
    </View>
  );
}

/** Altın Top ışınları: merkezden her hedefe uzanan parlak çizgiler. */
function Rays({ x, y, targets }: { x: number; y: number; targets: { x: number; y: number }[] }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 560, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);
  const opacity = t.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.9, 0] });
  const thin = t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.3, 0.3] });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {targets.map((q, i) => {
        const dx = q.x - x;
        const dy = q.y - y;
        const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const ang = `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`;
        return (
          <Animated.View
            key={i}
            style={[
              styles.ray,
              {
                left: x + dx / 2 - len / 2,
                top: y + dy / 2 - 2.5,
                width: len,
                opacity,
                transform: [{ rotate: ang }, { scaleY: thin }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function Beam({ dir, x, y, length, thick, delay }: { dir: "row" | "col"; x: number; y: number; length: number; thick: number; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 360,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [t, delay]);
  const grow = t.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.05, 1, 1],
  });
  const fade = t.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.9, 0],
  });
  const pinch = t.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1, 0.2],
  });
  const row = dir === "row";
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.beam,
        row
          ? {
              left: x - length / 2,
              top: y - thick / 2,
              width: length,
              height: thick,
              borderRadius: thick / 2,
            }
          : {
              left: x - thick / 2,
              top: y - length / 2,
              width: thick,
              height: length,
              borderRadius: thick / 2,
            },
        {
          opacity: fade,
          transform: row ? [{ scaleX: grow }, { scaleY: pinch }] : [{ scaleY: grow }, { scaleX: pinch }],
        },
      ]}
    >
      <View style={[styles.beamCore, row ? { height: thick * 0.4 } : { width: thick * 0.4 }]} />
    </Animated.View>
  );
}

function Ring({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ringFill,
        {
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          opacity: t.interpolate({
            inputRange: [0, 0.3, 1],
            outputRange: [0.95, 0.8, 0],
          }),
          transform: [
            {
              scale: t.interpolate({
                inputRange: [0, 1],
                outputRange: [0.2, 1],
              }),
            },
          ],
        },
      ]}
    />
  );
}

function Flash({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.flash,
        {
          left: x,
          top: y,
          width: w,
          height: h,
          opacity: t.interpolate({
            inputRange: [0, 0.15, 1],
            outputRange: [0, 0.85, 0],
          }),
        },
      ]}
    />
  );
}

function ComboText({ x, y, text, big }: { x: number; y: number; text: string; big: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: big ? 1100 : 850,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [t, big]);
  const scale = t.interpolate({
    inputRange: [0, 0.14, 0.24, 1],
    outputRange: [0.3, 1.18, 1, 1.02],
  });
  const opacity = t.interpolate({
    inputRange: [0, 0.08, 0.75, 1],
    outputRange: [0, 1, 1, 0],
  });
  const rise = t.interpolate({ inputRange: [0, 1], outputRange: [0, -36] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.textWrap,
        {
          left: x - 140,
          top: y - 30,
          opacity,
          transform: [{ translateY: rise }, { scale }],
        },
      ]}
    >
      <Text style={[big ? styles.comboBig : styles.combo, styles.comboBack]} {...textScale.badge} numberOfLines={1}>
        {text}
      </Text>
      <Text style={[big ? styles.comboBig : styles.combo, styles.comboFront]} {...textScale.badge} numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

function FlyToken({ x, y, tx, ty, size, glyph, delay }: { x: number; y: number; tx: number; ty: number; size: number; glyph: FlyGlyph; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 560,
      delay,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [t, delay]);
  // Yay çizerek uçar: yatay doğrusal, dikey önce biraz yukarı sonra hedefe.
  const dx = t.interpolate({ inputRange: [0, 1], outputRange: [0, tx - x] });
  const dy = t.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, Math.min(0, ty - y) * 0.35 - size, ty - y],
  });
  const scale = t.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [1, 1.25, 0.55],
  });
  const opacity = t.interpolate({
    inputRange: [0, 0.9, 1],
    outputRange: [1, 1, 0],
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.abs,
        {
          left: x - size / 2,
          top: y - size / 2,
          opacity,
          transform: [{ translateX: dx }, { translateY: dy }, { scale }],
        },
      ]}
    >
      {"piece" in glyph ? (
        <PieceGlyph kind="gem" color={glyph.piece} special="none" size={size} />
      ) : "trophy" in glyph ? (
        <PieceGlyph kind="trophy" color={-1} special="none" size={size} />
      ) : "cone" in glyph ? (
        <PieceGlyph kind="cone" color={-1} special="none" size={size} />
      ) : (
        <GoalIcon type={glyph.goal} color={-1} size={size} />
      )}
    </Animated.View>
  );
}

function Banner({ x, y, w, text, icon }: { x: number; y: number; w: number; text: string; icon: IconName }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 1300,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [t]);
  const slide = t.interpolate({
    inputRange: [0, 0.18, 0.82, 1],
    outputRange: [-w, 0, 0, w],
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.banner, { left: x, top: y - 26, width: w, transform: [{ translateX: slide }] }]}>
      <Ionicons name={icon} size={22} color={UCLU_BOARD.accentHi} />
      <Text style={styles.bannerText} {...textScale.badge} numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

function FxViewBase({ fx }: { fx: Fx }) {
  switch (fx.kind) {
    case "burst":
      return <Burst x={fx.x} y={fx.y} color={fx.color} size={fx.size} big={fx.big} />;
    case "beam":
      return <Beam dir={fx.dir} x={fx.x} y={fx.y} length={fx.length} thick={fx.thick} delay={fx.delay} />;
    case "ring":
      return <Ring x={fx.x} y={fx.y} size={fx.size} color={fx.color} />;
    case "flash":
      return <Flash x={fx.x} y={fx.y} w={fx.w} h={fx.h} />;
    case "text":
      return <ComboText x={fx.x} y={fx.y} text={fx.text} big={fx.big} />;
    case "fly":
      return <FlyToken x={fx.x} y={fx.y} tx={fx.tx} ty={fx.ty} size={fx.size} glyph={fx.glyph} delay={fx.delay} />;
    case "rocket":
      return <RocketFx dir={fx.dir} x={fx.x} y={fx.y} lo={fx.lo} hi={fx.hi} size={fx.size} delay={fx.delay} />;
    case "drone":
      return <DroneFx x={fx.x} y={fx.y} tx={fx.tx} ty={fx.ty} size={fx.size} delay={fx.delay} />;
    case "shock":
      return <Shock x={fx.x} y={fx.y} size={fx.size} />;
    case "rays":
      return <Rays x={fx.x} y={fx.y} targets={fx.targets} />;
    case "banner":
      return <Banner x={fx.x} y={fx.y} w={fx.w} text={fx.text} icon={fx.icon} />;
  }
}

const FxView = React.memo(FxViewBase);

export const FxLayer = React.memo(function FxLayer({ items }: { items: Fx[] }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {items.map((fx) => (
        <FxView key={fx.id} fx={fx} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  ring: { position: "absolute", borderWidth: 3 },
  shard: { position: "absolute" },
  ringFill: {
    position: "absolute",
    borderWidth: 6,
    backgroundColor: UCLU_BOARD.selectGlow,
  },
  beam: {
    position: "absolute",
    backgroundColor: UCLU_BOARD.beam,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: UCLU_BOARD.beam,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  beamCore: {
    alignSelf: "stretch",
    backgroundColor: UCLU_BOARD.beamCore,
    borderRadius: radius.pill,
    margin: 2,
  },
  flash: {
    position: "absolute",
    backgroundColor: UCLU_BOARD.flash,
    borderRadius: radius.lg,
  },
  textWrap: { position: "absolute", width: 280, height: 64, alignItems: "center", justifyContent: "center" },
  comboBack: { position: "absolute", color: UCLU_BOARD.comboDeep, transform: [{ translateY: 3 }], textShadowColor: UCLU_BOARD.comboInk, textShadowRadius: 1 },
  comboFront: { position: "absolute", color: UCLU_BOARD.comboGold, textShadowColor: UCLU_BOARD.comboInk, textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  trail: {
    position: "absolute",
    backgroundColor: UCLU_BOARD.beam,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: UCLU_BOARD.beam,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  shockRing: { position: "absolute", borderWidth: 8, borderColor: UCLU_BOARD.comboWarm },
  ray: {
    position: "absolute",
    height: 5,
    borderRadius: 3,
    backgroundColor: UCLU_BOARD.ballBeam,
    shadowColor: UCLU_BOARD.gold,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  combo: {
    ...type.scoreLg,
    color: UCLU_BOARD.comboText,
    textShadowColor: UCLU_BOARD.textShadowSoft,
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 2 },
  },
  comboBig: {
    ...type.scoreHero,
    color: UCLU_BOARD.comboText,
    textShadowColor: UCLU_BOARD.textShadowSoft,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
  banner: {
    position: "absolute",
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: UCLU_BOARD.panelTop,
    borderColor: UCLU_BOARD.chromeEdge,
    borderWidth: 1,
    borderRadius: radius.pill,
    shadowColor: UCLU_BOARD.ink,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bannerText: {
    ...type.h1,
    color: UCLU_BOARD.comboText,
    textShadowColor: UCLU_BOARD.textShadowSoft,
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
});
