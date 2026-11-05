import React, { memo, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { UCLE_COLORS, UCLE_KINDS } from "@/lib/puzzle/uclePalette";
import type { TileBlock } from "@/lib/puzzle/levels/ucle";
import { TileFace } from "./TileFace";

interface Props {
  id: number;
  kind: number;
  left: number;
  top: number;
  w: number;
  h: number;
  slab: number;
  block: TileBlock;
  /** Yüzü görünüyor mu (ters karo açıldıysa true). */
  faceUp: boolean;
  /** Kilit grubu rengi dizini (kilitliyse). */
  lockGroup: number | null;
  /** Anahtar rozeti grubu. */
  keyGroup: number | null;
  /** İpucu / vurgulama. */
  glow: boolean;
  introDelay: number;
  onPress: (id: number) => void;
  onBlockedPress: (id: number) => void;
}

/**
 * Tahtadaki tek karo. Memo'lu: yalnız kendi durumu değişince çizilir.
 * Kapalı → açık geçişte karartma yumuşakça kalkar; ters karo döner;
 * kilit/zincir çözülünce rozet büyüyüp söner.
 */
function BoardTileBase(p: Props) {
  const appear = useRef(new Animated.Value(0)).current;
  const shade = useRef(new Animated.Value(p.block === "covered" ? 1 : 0)).current;
  const flip = useRef(new Animated.Value(1)).current;
  const press = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const lockFx = useRef(new Animated.Value(p.block === "locked" ? 1 : 0)).current;
  const chainFx = useRef(new Animated.Value(p.block === "chained" ? 1 : 0)).current;
  const glowFx = useRef(new Animated.Value(0)).current;
  const [showFace, setShowFace] = useState(p.faceUp);
  const [lockShown, setLockShown] = useState(p.block === "locked");
  const [chainShown, setChainShown] = useState(p.block === "chained");

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 320,
      delay: p.introDelay,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();
    // Yalnız ilk yerleşimde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(shade, { toValue: p.block === "covered" ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [p.block, shade]);

  // Ters karo açıldı: yatay dönüş, yarıda yüz değişir.
  useEffect(() => {
    if (!p.faceUp || showFace) return;
    Animated.timing(flip, { toValue: 0, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setShowFace(true);
      Animated.spring(flip, { toValue: 1, speed: 18, bounciness: 8, useNativeDriver: true }).start();
    });
  }, [p.faceUp, showFace, flip]);

  // Kilit açıldı / zincir koptu: rozet büyüyüp söner.
  useEffect(() => {
    if (p.block === "locked") {
      setLockShown(true);
      lockFx.setValue(1);
    } else if (lockShown) {
      Animated.timing(lockFx, { toValue: 2, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => setLockShown(false));
    }
    if (p.block === "chained") {
      setChainShown(true);
      chainFx.setValue(1);
    } else if (chainShown) {
      Animated.timing(chainFx, { toValue: 2, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => setChainShown(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.block]);

  useEffect(() => {
    if (!p.glow) {
      glowFx.setValue(0);
      return;
    }
    const pulse = Animated.sequence([
      Animated.timing(glowFx, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(glowFx, { toValue: 0.3, duration: 260, useNativeDriver: true }),
    ]);
    Animated.loop(pulse, { iterations: 3 }).start();
  }, [p.glow, glowFx]);

  const onPressIn = () => {
    if (p.block !== "free") return;
    Animated.timing(press, { toValue: 0.92, duration: 70, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(press, { toValue: 1, speed: 30, bounciness: 10, useNativeDriver: true }).start();
  };
  const handlePress = () => {
    if (p.block === "free") {
      p.onPress(p.id);
      return;
    }
    shake.setValue(0);
    Animated.timing(shake, { toValue: 1, duration: 260, easing: Easing.linear, useNativeDriver: true }).start();
    p.onBlockedPress(p.id);
  };

  const label = !showFace
    ? "Ters karo"
    : p.block === "locked"
      ? `Kilitli ${UCLE_KINDS[p.kind].label} karosu`
      : p.block === "chained"
        ? `Zincirli ${UCLE_KINDS[p.kind].label} karosu`
        : p.block === "covered"
          ? `Üstü kapalı ${UCLE_KINDS[p.kind].label} karosu`
          : `${UCLE_KINDS[p.kind].label} karosu${p.keyGroup != null ? ", anahtarlı" : ""}`;

  const shakeX = shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -4, 4, -3, 2, 0] });
  const lockScale = lockFx.interpolate({ inputRange: [0, 1, 2], outputRange: [0.6, 1, 1.8] });
  const lockOpacity = lockFx.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  const chainScale = chainFx.interpolate({ inputRange: [0, 1, 2], outputRange: [0.6, 1, 1.6] });
  const chainOpacity = chainFx.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  const lockColor = p.lockGroup != null ? UCLE_COLORS.locks[p.lockGroup % UCLE_COLORS.locks.length] : UCLE_COLORS.white;
  const keyColor = p.keyGroup != null ? UCLE_COLORS.locks[p.keyGroup % UCLE_COLORS.locks.length] : UCLE_COLORS.white;
  const faceH = p.h - p.slab;
  const r = Math.round(p.w * 0.2);
  const badge = Math.max(16, Math.round(p.w * 0.38));

  return (
    <Animated.View
      pointerEvents={p.block === "covered" ? "none" : "auto"}
      style={[
        styles.root,
        {
          left: p.left,
          top: p.top,
          width: p.w,
          height: p.h,
          opacity: appear,
          transform: [
            { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) },
            { translateX: shakeX },
            { scale: Animated.multiply(press, appear.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] })) },
            { scaleX: flip },
          ],
        },
      ]}
    >
      {/* Alt katmana düşen gölge — 2.5D derinlik. */}
      <View style={[styles.shadow, { top: p.slab + 2, left: 2, width: p.w, height: faceH, borderRadius: r }]} />
      <Pressable
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: p.block !== "free" }}
        style={StyleSheet.absoluteFill}
      >
        <TileFace kind={p.kind} w={p.w} h={p.h} slab={p.slab} back={!showFace} />
        {p.keyGroup != null && showFace ? (
          <View style={[styles.keyBadge, { width: badge, height: badge, borderRadius: badge / 2, backgroundColor: keyColor }]}>
            <MaterialCommunityIcons name="key-variant" size={Math.round(badge * 0.66)} color={UCLE_COLORS.lockInk} />
          </View>
        ) : null}
        {lockShown ? (
          <Animated.View style={[styles.center, { height: faceH, opacity: lockOpacity, transform: [{ scale: lockScale }] }]}>
            <View style={[styles.veil, { borderRadius: r, borderColor: lockColor }]} />
            <View style={[styles.lockDisc, { width: badge * 1.35, height: badge * 1.35, borderRadius: badge, backgroundColor: lockColor }]}>
              <MaterialCommunityIcons name="lock" size={Math.round(badge * 0.85)} color={UCLE_COLORS.lockInk} />
            </View>
          </Animated.View>
        ) : null}
        {chainShown ? (
          <Animated.View style={[styles.center, { height: faceH, opacity: chainOpacity, transform: [{ scale: chainScale }] }]}>
            <View style={[styles.chainFrame, { borderRadius: r }]} />
            <View style={[styles.chainDisc, { width: badge * 1.25, height: badge * 1.25, borderRadius: badge }]}>
              <MaterialCommunityIcons name="link-variant" size={Math.round(badge * 0.85)} color={UCLE_COLORS.chainInk} />
            </View>
          </Animated.View>
        ) : null}
        <Animated.View pointerEvents="none" style={[styles.shade, { height: p.h, borderRadius: r, opacity: shade }]} />
        {p.glow ? (
          <Animated.View pointerEvents="none" style={[styles.glow, { height: faceH, borderRadius: r, opacity: glowFx }]} />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export const BoardTile = memo(BoardTileBase);

const styles = StyleSheet.create({
  root: { position: "absolute" },
  shadow: { position: "absolute", backgroundColor: UCLE_COLORS.shadow },
  shade: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: UCLE_COLORS.shade },
  glow: { position: "absolute", left: -2, right: -2, top: -2, borderWidth: 3, borderColor: UCLE_COLORS.glow },
  center: { position: "absolute", left: 0, right: 0, top: 0, alignItems: "center", justifyContent: "center" },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: UCLE_COLORS.shade, borderWidth: 2 },
  lockDisc: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: UCLE_COLORS.lockInk },
  chainFrame: { ...StyleSheet.absoluteFillObject, borderWidth: 3, borderColor: UCLE_COLORS.chain, borderStyle: "dashed" },
  chainDisc: { alignItems: "center", justifyContent: "center", backgroundColor: UCLE_COLORS.chain },
  keyBadge: {
    position: "absolute",
    right: -4,
    top: -4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: UCLE_COLORS.lockInk,
  },
});
