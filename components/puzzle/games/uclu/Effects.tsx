/**
 * Elit Üçlü efektleri — hepsi SONLU, tek Animated.Value ile sürülen, yerel
 * sürücülü küçük parçalar: parçacık patlaması, füze ışını, Röveşata halkası,
 * tahta parlaması, kombo metni ve hedef sayacına uçan simge.
 *
 * Her efekt bağlanınca kendi animasyonunu bir kez oynatır; listeden toplu
 * olarak (adım bitince) kaldırılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { radius, textScale, type } from "@/theme";
import { UCLU_BOARD, UCLU_OUTLINE } from "@/lib/puzzle/ucluPalette";
import { PieceGlyph } from "./Piece";

export type Fx =
  | { id: number; kind: "burst"; x: number; y: number; color: string; size: number; big?: boolean }
  | { id: number; kind: "beam"; dir: "row" | "col"; x: number; y: number; length: number; thick: number; delay: number }
  | { id: number; kind: "ring"; x: number; y: number; size: number; color: string }
  | { id: number; kind: "flash"; x: number; y: number; w: number; h: number }
  | { id: number; kind: "text"; x: number; y: number; text: string; big: boolean }
  | { id: number; kind: "fly"; x: number; y: number; tx: number; ty: number; size: number; glyph: FlyGlyph; delay: number }
  | { id: number; kind: "banner"; x: number; y: number; w: number; text: string; icon: IconName };

type IconName = keyof typeof Ionicons.glyphMap;
/** Kimliksiz efekt (birleşim türünde her üyeden ayrı ayrı `id` düşülür). */
export type FxInput = Fx extends infer T ? (T extends Fx ? Omit<T, "id"> : never) : never;
export type FlyGlyph = { piece: number } | { trophy: true } | { icon: IconName; color: string };

const ANGLES = [0, 60, 120, 180, 240, 300].map((a) => (a * Math.PI) / 180);
/** İkinci halka kıvılcımlar: ilk halkanın arasına, daha uzağa savrulan yıldızlar. */
const SPARKS = [30, 90, 150, 210, 270, 330].map((a) => (a * Math.PI) / 180);

/**
 * Patlama: parlak çekirdek, genişleyen halka, renkli toplar ve dönerek
 * savrulan yıldız kıvılcımları. Hepsi tek değerle sürülür (yerel sürücü).
 */
function Burst({ x, y, color, size, big }: { x: number; y: number; color: string; size: number; big?: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: big ? 620 : 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t, big]);
  const reach = size * (big ? 0.95 : 0.7);
  const dot = Math.max(4, Math.round(size * 0.16));
  const star = Math.max(9, Math.round(size * (big ? 0.3 : 0.24)));
  const ringScale = t.interpolate({ inputRange: [0, 1], outputRange: [0.3, big ? 1.9 : 1.35] });
  const fade = t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.7, 0] });
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
            opacity: t.interpolate({ inputRange: [0, 0.12, 0.4], outputRange: [0.9, 0.55, 0], extrapolate: "clamp" }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 0.4], outputRange: [0.4, 1.1], extrapolate: "clamp" }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          { width: size, height: size, left: -size / 2, top: -size / 2, borderRadius: size / 2, borderColor: color, opacity: fade, transform: [{ scale: ringScale }] },
        ]}
      />
      {ANGLES.map((a, i) => (
        <Animated.View
          key={i}
          style={[
            styles.abs,
            {
              width: dot,
              height: dot,
              left: -dot / 2,
              top: -dot / 2,
              borderRadius: dot / 2,
              backgroundColor: i % 2 ? color : UCLU_BOARD.beamCore,
              opacity: fade,
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * reach] }) },
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * reach + reach * 0.25] }) },
                { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1.2, 0.3] }) },
              ],
            },
          ]}
        />
      ))}
      {SPARKS.map((a, i) => (
        <Animated.View
          key={`s${i}`}
          style={[
            styles.abs,
            {
              left: -star / 2,
              top: -star / 2,
              opacity: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * reach * 1.35] }) },
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * reach * 1.35 + reach * 0.45] }) },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", i % 2 ? "220deg" : "-220deg"] }) },
                { scale: t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.2, 1, 0.4] }) },
              ],
            },
          ]}
        >
          <Ionicons name="star" size={star} color={i % 3 === 0 ? UCLU_BOARD.comboWarm : i % 3 === 1 ? UCLU_BOARD.beamCore : color} />
        </Animated.View>
      ))}
    </View>
  );
}

function Beam({ dir, x, y, length, thick, delay }: { dir: "row" | "col"; x: number; y: number; length: number; thick: number; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 360, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t, delay]);
  const grow = t.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.05, 1, 1] });
  const fade = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.9, 0] });
  const pinch = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1, 0.2] });
  const row = dir === "row";
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.beam,
        row
          ? { left: x - length / 2, top: y - thick / 2, width: length, height: thick, borderRadius: thick / 2 }
          : { left: x - thick / 2, top: y - length / 2, width: thick, height: length, borderRadius: thick / 2 },
        { opacity: fade, transform: row ? [{ scaleX: grow }, { scaleY: pinch }] : [{ scaleY: grow }, { scaleX: pinch }] },
      ]}
    >
      <View style={[styles.beamCore, row ? { height: thick * 0.4 } : { width: thick * 0.4 }]} />
    </Animated.View>
  );
}

function Ring({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
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
          opacity: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.95, 0.8, 0] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
        },
      ]}
    />
  );
}

function Flash({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.flash, { left: x, top: y, width: w, height: h, opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.85, 0] }) }]}
    />
  );
}

function ComboText({ x, y, text, big }: { x: number; y: number; text: string; big: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: big ? 1100 : 850, easing: Easing.linear, useNativeDriver: true }).start();
  }, [t, big]);
  const scale = t.interpolate({ inputRange: [0, 0.14, 0.24, 1], outputRange: [0.3, 1.18, 1, 1.02] });
  const opacity = t.interpolate({ inputRange: [0, 0.08, 0.75, 1], outputRange: [0, 1, 1, 0] });
  const rise = t.interpolate({ inputRange: [0, 1], outputRange: [0, -36] });
  return (
    <Animated.View pointerEvents="none" style={[styles.textWrap, { left: x - 140, top: y - 30, opacity, transform: [{ translateY: rise }, { scale }] }]}>
      <Text style={[big ? styles.comboBig : styles.combo]} {...textScale.badge} numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

function FlyToken({ x, y, tx, ty, size, glyph, delay }: { x: number; y: number; tx: number; ty: number; size: number; glyph: FlyGlyph; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 560, delay, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  }, [t, delay]);
  // Yay çizerek uçar: yatay doğrusal, dikey önce biraz yukarı sonra hedefe.
  const dx = t.interpolate({ inputRange: [0, 1], outputRange: [0, tx - x] });
  const dy = t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, Math.min(0, ty - y) * 0.35 - size, ty - y] });
  const scale = t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [1, 1.25, 0.55] });
  const opacity = t.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - size / 2, top: y - size / 2, opacity, transform: [{ translateX: dx }, { translateY: dy }, { scale }] }]}>
      {"piece" in glyph ? (
        <PieceGlyph kind="gem" color={glyph.piece} special="none" size={size} />
      ) : "trophy" in glyph ? (
        <PieceGlyph kind="trophy" color={-1} special="none" size={size} />
      ) : (
        <Ionicons name={glyph.icon} size={size} color={glyph.color} />
      )}
    </Animated.View>
  );
}

function Banner({ x, y, w, text, icon }: { x: number; y: number; w: number; text: string; icon: IconName }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true }).start();
  }, [t]);
  const slide = t.interpolate({ inputRange: [0, 0.18, 0.82, 1], outputRange: [-w, 0, 0, w] });
  return (
    <Animated.View pointerEvents="none" style={[styles.banner, { left: x, top: y - 26, width: w, transform: [{ translateX: slide }] }]}>
      <Ionicons name={icon} size={22} color={UCLU_BOARD.comboWarm} />
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
  ring: { position: "absolute", borderWidth: 4 },
  ringFill: { position: "absolute", borderWidth: 6, backgroundColor: UCLU_BOARD.selectGlow },
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
  beamCore: { alignSelf: "stretch", backgroundColor: UCLU_BOARD.beamCore, borderRadius: radius.pill, margin: 2 },
  flash: { position: "absolute", backgroundColor: UCLU_BOARD.flash, borderRadius: radius.lg },
  textWrap: { position: "absolute", width: 280, alignItems: "center" },
  combo: {
    ...type.scoreLg,
    color: UCLU_BOARD.comboText,
    textShadowColor: UCLU_BOARD.comboStroke,
    textShadowRadius: 1,
    textShadowOffset: { width: 0, height: 3 },
  },
  comboBig: {
    ...type.scoreHero,
    color: UCLU_BOARD.comboWarm,
    textShadowColor: UCLU_BOARD.comboStroke,
    textShadowRadius: 1,
    textShadowOffset: { width: 0, height: 4 },
  },
  banner: {
    position: "absolute",
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: UCLU_BOARD.hudTop,
    borderColor: UCLU_OUTLINE,
    borderWidth: 3,
    borderBottomWidth: 6,
    borderRadius: radius.pill,
  },
  bannerText: {
    ...type.h1,
    color: UCLU_BOARD.comboText,
    textShadowColor: UCLU_BOARD.comboStroke,
    textShadowRadius: 0,
    textShadowOffset: { width: 0, height: 2 },
  },
});
