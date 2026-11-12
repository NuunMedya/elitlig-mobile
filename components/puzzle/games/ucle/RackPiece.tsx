import React, { memo, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { UCLE_COLORS, UCLE_KINDS } from "@/lib/puzzle/uclePalette";
import { TileFace } from "./TileFace";

export interface FlyFrom {
  x: number;
  y: number;
  /** Tahtadaki karo genişliği / raf hücresi oranı. */
  scale: number;
}

interface Props {
  id: number;
  kind: number;
  x: number;
  y: number;
  size: number;
  from: FlyFrom | null;
  clearing: boolean;
  onCleared: (id: number) => void;
  /** Hareketi azalt açık: kıvılcım / kırık yok, yalın sönme. */
  still?: boolean;
  /** Üçlü birleşme noktası (üçlünün ortası, sahne x'i). */
  mergeX?: number;
  /** Üçlünün patlamasını (halka + kıvılcım) bu rozet çizer. */
  leader?: boolean;
}

const FLIGHT_MS = 230;
const SPARKS = 8;
/** Rozetin raf yuvasına oranı. */
const INNER = 0.9;

/**
 * Raftaki karo. Tahtadaki yerinden rafa uçar, raf kayınca yaylanarak
 * yer değiştirir; üçlü olunca şişip söner ve kıvılcım saçar.
 */
function RackPieceBase({ id, kind, x, y, size, from, clearing, onCleared, still, mergeX, leader = true }: Props) {
  const tx = useRef(new Animated.Value(from ? from.x : x)).current;
  const ty = useRef(new Animated.Value(from ? from.y : y)).current;
  const scale = useRef(new Animated.Value(from ? from.scale / INNER : 0.4)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const boom = useRef(new Animated.Value(0)).current;
  const squash = useRef(new Animated.Value(1)).current;
  const landed = useRef(false);
  const prevTarget = useRef({ x, y });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(tx, {
        toValue: x,
        duration: FLIGHT_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(ty, {
        toValue: y,
        duration: FLIGHT_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.12,
          duration: FLIGHT_MS * 0.7,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          speed: 24,
          bounciness: 10,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      landed.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Raf kaydı: yeni hücreye yaylan.
  useEffect(() => {
    if (prevTarget.current.x === x && prevTarget.current.y === y) return;
    prevTarget.current = { x, y };
    if (!landed.current) {
      // Uçuş sürerken hedef değişti: uçuşu yeni hedefe çevir.
      Animated.parallel([
        Animated.timing(tx, {
          toValue: x,
          duration: FLIGHT_MS * 0.6,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ty, {
          toValue: y,
          duration: FLIGHT_MS * 0.6,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        landed.current = true;
      });
      return;
    }
    Animated.parallel([
      Animated.spring(tx, {
        toValue: x,
        speed: 22,
        bounciness: 6,
        useNativeDriver: true,
      }),
      Animated.spring(ty, {
        toValue: y,
        speed: 22,
        bounciness: 6,
        useNativeDriver: true,
      }),
    ]).start();
  }, [x, y, tx, ty]);

  useEffect(() => {
    if (!clearing) return;
    const target = mergeX ?? x;
    Animated.sequence([
      Animated.delay(FLIGHT_MS + 20),
      // Üçlü birleşir: yanlardaki rozetler ortadakinin üstüne kayar.
      Animated.parallel([
        Animated.timing(tx, {
          toValue: still ? x : target,
          duration: 150,
          easing: Easing.in(Easing.back(1.4)),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.12,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.38,
            duration: 90,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0,
            duration: 170,
            easing: Easing.in(Easing.back(2)),
            useNativeDriver: true,
          }),
        ]),
        // "Pop": yassılıp (squash) uzayarak söner.
        Animated.sequence([
          Animated.timing(squash, {
            toValue: 0.82,
            duration: 80,
            useNativeDriver: true,
          }),
          Animated.timing(squash, {
            toValue: 1.16,
            duration: 140,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(fade, {
          toValue: 0,
          duration: leader ? 240 : 60,
          delay: leader ? 90 : 0,
          useNativeDriver: true,
        }),
        Animated.timing(boom, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => onCleared(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearing]);

  const inner = Math.round(size * INNER);
  const slab = Math.max(2, Math.round(inner * 0.09));
  const color = UCLE_KINDS[kind].face;
  const burst = clearing && leader;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.root,
        {
          width: size,
          height: size,
          transform: [{ translateX: tx }, { translateY: ty }],
        },
      ]}
    >
      {burst ? (
        <>
          <Animated.View
            style={[
              styles.ring,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderColor: color,
                opacity: boom.interpolate({
                  inputRange: [0, 0.2, 1],
                  outputRange: [0, 1, 0],
                }),
                transform: [
                  {
                    scale: boom.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 2.2],
                    }),
                  },
                ],
              },
            ]}
          />
          {/* Beyaz flaş halkası (dolgulu) */}
          <Animated.View
            style={[
              styles.flash,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                opacity: boom.interpolate({
                  inputRange: [0, 0.08, 0.35],
                  outputRange: [0, 0.85, 0],
                  extrapolate: "clamp",
                }),
                transform: [
                  {
                    scale: boom.interpolate({
                      inputRange: [0, 0.35],
                      outputRange: [0.5, 1.5],
                      extrapolate: "clamp",
                    }),
                  },
                ],
              },
            ]}
          />
          {Array.from({ length: still ? 0 : SPARKS }, (_, i) => {
            const a = (i / SPARKS) * Math.PI * 2 + id * 0.7;
            const d = size * (0.85 + (i % 3) * 0.2);
            const dot = Math.max(5, Math.round(size * (i % 2 ? 0.12 : 0.17)));
            return (
              <Animated.View
                key={i}
                style={[
                  styles.spark,
                  {
                    width: dot,
                    height: dot,
                    borderRadius: dot * 0.18,
                    left: size / 2 - dot / 2,
                    top: size / 2 - dot / 2,
                    backgroundColor: i % 2 ? UCLE_COLORS.white : UCLE_COLORS.rim,
                    opacity: boom.interpolate({
                      inputRange: [0, 0.1, 0.75, 1],
                      outputRange: [0, 1, 1, 0],
                    }),
                    transform: [
                      {
                        translateX: boom.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, Math.cos(a) * d],
                        }),
                      },
                      {
                        translateY: boom.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, Math.sin(a) * d],
                        }),
                      },
                      { rotate: "45deg" },
                      {
                        scale: boom.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0.2],
                        }),
                      },
                    ],
                  },
                ]}
              />
            );
          })}
        </>
      ) : null}
      <Animated.View
        style={{
          opacity: fade,
          transform: [
            { scale },
            { scaleY: squash },
            {
              scaleX: squash.interpolate({
                inputRange: [0.8, 1, 1.2],
                outputRange: [1.18, 1, 0.86],
                extrapolate: "clamp",
              }),
            },
          ],
        }}
      >
        {/* Rozet raf yuvasının içinde biraz küçük durur (yuvanın kenarı görünsün). */}
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: inner, height: inner }}>
            <TileFace kind={kind} w={inner} h={inner} slab={slab} />
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export const RackPiece = memo(RackPieceBase);

const styles = StyleSheet.create({
  root: { position: "absolute", left: 0, top: 0 },
  ring: { position: "absolute", left: 0, top: 0, borderWidth: 4 },
  spark: { position: "absolute" },
  flash: {
    position: "absolute",
    left: 0,
    top: 0,
    backgroundColor: UCLE_COLORS.white,
  },
});

/** Boş raf hücresi. */
export const RackSlot = memo(function RackSlot({ size, style }: { size: number; style: object }) {
  return <View style={[{ width: size, height: size }, style]} />;
});
