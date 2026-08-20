/**
 * CANLI rozeti — nabız atan nokta + dakika.
 *
 * NEDEN NABIZ: Skor listesinde "canlı" bilgisi tek başına renkle verilemez;
 * kırmızı bir nokta durağan kaldığında bitmiş maçtaki kırmızı kart ikonundan
 * ayırt edilemiyor. Nabız, hareketle "bu satır şu anda değişiyor" der.
 *
 * NEDEN REANIMATED YOK: projede reanimated kurulu değil. Döngü, RN çekirdeğinin
 * `Animated.loop`'u ile ve `useNativeDriver: true` ile kurulur — opaklık ve
 * ölçek JS thread'ine hiç uğramaz, canlı liste 60fps'i korur.
 *
 * ERİŞİLEBİLİRLİK: "Reduce Motion" açıksa animasyon hiç başlatılmaz; nokta
 * sabit `live` renginde kalır, bilgi kaybolmaz (§5.8).
 */

import { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import { colors, duration, space, textScale, type } from "@/theme";

export interface LiveBadgeProps {
  /** Dakika verilirse "67'" gösterir, yoksa "CANLI" */
  minute?: number | null;
  /** Uzatma: 45+2 */
  addedTime?: number | null;
  /** Devre arası — nabız durur, "İY" yazar */
  halftime?: boolean;
  size?: "sm" | "md";
  /** Yalnız nokta (satır içi dar alan) */
  compact?: boolean;
}

/**
 * Sistem "Hareketi azalt" ayarı.
 *
 * NOT: şartname bunu `hooks/useReduceMotion.ts` altında konumlandırıyor; hook
 * dosyası açılana kadar tek kopya burada durur ve animasyonlu bileşenler
 * (MatchRow skor flash'ı, ProgressRing, StatBar) buradan içe aktarır. Hook
 * dosyası eklendiğinde burası ona yönlendiren bir yeniden dışa aktarım olur.
 */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setOn(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return on;
}

/** Rozetin okunacak metni — ekran okuyucu "67 kesme işareti" demesin diye ayrı. */
function speech(minute: number | null | undefined, addedTime: number | null | undefined, halftime?: boolean): string {
  if (halftime) return "Devre arası";
  if (minute == null) return "Maç canlı";
  return addedTime ? `Canlı, ${minute}+${addedTime}. dakika` : `Canlı, ${minute}. dakika`;
}

export const LiveBadge = memo(function LiveBadge({
  minute,
  addedTime,
  halftime = false,
  size = "sm",
  compact = false,
}: LiveBadgeProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (halftime || reduceMotion) {
      pulse.setValue(0);
      return;
    }
    const half = duration.pulse / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: half, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: half, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [halftime, reduceMotion, pulse]);

  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  const label = halftime
    ? "İY"
    : minute != null
      ? `${minute}${addedTime ? `+${addedTime}` : ""}'`
      : "CANLI";

  return (
    <View
      style={size === "md" ? styles.wrapMd : styles.wrap}
      accessible
      accessibilityRole="text"
      accessibilityLabel={speech(minute, addedTime, halftime)}
    >
      <View style={styles.dotBox}>
        {size === "md" && !halftime ? (
          <Animated.View style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
        ) : null}
        <Animated.View style={[styles.dot, halftime && styles.dotHalftime, { opacity: dotOpacity }]} />
      </View>
      {compact ? null : (
        <Text
          style={[size === "md" ? styles.textMd : styles.text, halftime && styles.textHalftime]}
          {...textScale.badge}
        >
          {label}
        </Text>
      )}
    </View>
  );
});

const DOT = 6;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  wrapMd: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  dotBox: {
    width: DOT,
    height: DOT,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.live,
  },
  dotHalftime: {
    backgroundColor: colors.textTertiary,
  },
  ring: {
    position: "absolute",
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.liveGlow,
  },
  text: {
    ...type.micro,
    color: colors.live,
  },
  textMd: {
    ...type.caption,
    color: colors.live,
  },
  textHalftime: {
    color: colors.textTertiary,
  },
});
