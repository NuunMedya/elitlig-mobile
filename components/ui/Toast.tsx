/**
 * Toast / Snackbar — kısa süreli geri bildirim (§4.20).
 *
 * NEDEN KUYRUK: uygulamada aynı anda iki olay tetiklenebiliyor (mutasyon
 * sonucu + soketten gelen gol bildirimi). İki toast üst üste binerse ikisi de
 * okunmaz. Burada AYNI ANDA TEK toast görünür; yenisi gelirse eskisi 120ms'de
 * çıkar, sıradaki girer. Kuyruk `useRef` içinde tutulur — kuyruğa eklemek
 * render tetiklemez, yalnız görünen toast değişince yeniden çizilir.
 *
 * NEDEN ALT TARAFTA: iki elle tutulan telefonda başparmak alt bölgededir;
 * eylemli toast ("Geri al") üstte olsa erişilemez. Konum
 * `insets.bottom + tabBarHeight + 8` — tab bar'ın hemen üstünde durur, alt
 * menüyü kapatmaz.
 *
 * NEDEN PanResponder: reanimated/gesture-handler kurulu değil. Aşağı sürükleme
 * RN çekirdeğinin PanResponder'ı ile okunur; giriş/çıkış ve sürükleme AYNI
 * `Animated.Value` üzerinden gider ki sürüklerken animasyonla kavga etmesin.
 *
 * HAPTİK: varsayılan "none". Toast çoğu zaman zaten titreşen bir eylemin
 * (kaydet, favori) ARDINDAN gelir; ikinci titreşim gereksizdir. §5.3'teki
 * 300ms throttle bunu ayrıca korur. Gol bildirimi gibi kendiliğinden gelen
 * olaylarda çağıran taraf açıkça `haptic` verir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type PanResponderInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, duration, easing, elevate, layout, radius, space, textScale, type } from "@/theme";
import { fireHaptic, Touchable, type HapticKind } from "./Pressable";

export type ToastTone = "neutral" | "success" | "warn" | "danger" | "live";

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** ms — varsayılan 2800; "sticky" kullanıcı kapatana kadar durur. */
  duration?: number | "sticky";
  action?: { label: string; onPress: () => void };
  icon?: keyof typeof Ionicons.glyphMap;
  /** Gol bildirimi gibi kendiliğinden gelen olaylarda hafif titreşim. */
  haptic?: "none" | "success" | "warning" | "error" | "impact";
}

export interface ToastApi {
  show: (options: ToastOptions) => void;
  hide: () => void;
}

const DEFAULT_DURATION = 2800;
const ENTER_MS = 220;
const EXIT_MS = 160;
/** Yeni toast gelince öndekinin hızlı çıkışı — kuyruk tıkanmasın. */
const REPLACE_MS = 120;
/** Sürükleyerek kapatma eşiği. */
const SWIPE_DISTANCE = 40;
const SWIPE_VELOCITY = 0.5;

const ToastContext = createContext<ToastApi | null>(null);

/** Ton → ikon + renk. Tonun kendisi zemin doldurmaz; yalnız şerit ve ikon renklenir. */
const TONES: Record<ToastTone, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  neutral: { color: colors.textSecondary, icon: "information-circle-outline" },
  success: { color: colors.win, icon: "checkmark-circle-outline" },
  warn: { color: colors.warn, icon: "alert-circle-outline" },
  danger: { color: colors.danger, icon: "close-circle-outline" },
  live: { color: colors.live, icon: "football-outline" },
};

/** ToastOptions.haptic → Pressable'daki ortak haptik sözlüğü. */
function hapticFor(kind: ToastOptions["haptic"]): HapticKind {
  switch (kind) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "error";
    case "impact":
      return "light";
    default:
      return "none";
  }
}

export function ToastProvider({
  children,
  /** Tab bar'ı olmayan ekranlarda (modal, sheet) daha alta çekmek için. */
  offsetBottom = layout.tabBarHeight + space.sm,
}: {
  children: React.ReactNode;
  offsetBottom?: number;
}) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastOptions | null>(null);

  const queue = useRef<ToastOptions[]>([]);
  /**
   * Ekrandaki toast'ın SENKRON kopyası. `current` state'i bir sonraki render'a
   * kadar güncellenmediği için, aynı karede iki kez `show()` çağrılırsa state
   * üzerinden bakmak ilk mesajı kaybettirirdi.
   */
  const currentRef = useRef<ToastOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  /** Çıkış animasyonu bitmeden ikinci kez tetiklenmesin. */
  const leaving = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /** Kuyruktaki ilk toast'ı ekrana alır; kuyruk boşsa alanı temizler. */
  const dequeue = useCallback(() => {
    const next = queue.current.shift() ?? null;
    leaving.current = false;
    currentRef.current = next;
    setCurrent(next);
  }, []);

  const dismiss = useCallback(
    (ms: number) => {
      if (leaving.current) return;
      leaving.current = true;
      clearTimer();
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: ms,
          easing: easing.accelerate,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 40,
          duration: ms,
          easing: easing.accelerate,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) dequeue();
        else leaving.current = false;
      });
    },
    [clearTimer, dequeue, opacity, translateY],
  );

  const show = useCallback(
    (options: ToastOptions) => {
      queue.current.push(options);
      // Ekranda toast varsa hızlı çıkar; yoksa doğrudan sıradakini al.
      if (currentRef.current) dismiss(REPLACE_MS);
      else if (!leaving.current) dequeue();
    },
    [dequeue, dismiss],
  );

  const hide = useCallback(() => dismiss(EXIT_MS), [dismiss]);

  // Görünen toast değişince: giriş animasyonu + otomatik kapanma zamanlayıcısı.
  useEffect(() => {
    if (!current) return;
    fireHaptic(hapticFor(current.haptic));
    translateY.setValue(40);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ENTER_MS,
        easing: easing.decelerate,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: ENTER_MS,
        easing: easing.decelerate,
        useNativeDriver: true,
      }),
    ]).start();

    if (current.duration === "sticky") return;
    const ms = current.duration ?? DEFAULT_DURATION;
    timer.current = setTimeout(() => dismiss(EXIT_MS), ms);
    return clearTimer;
  }, [clearTimer, current, dismiss, opacity, translateY]);

  useEffect(() => clearTimer, [clearTimer]);

  // PanResponder bir kez kurulur; güncel `dismiss`e ref üzerinden ulaşır.
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  const pan = useRef<PanResponderInstance>(
    PanResponder.create({
      // Dokunuşu HEMEN kapmayız; yalnız aşağı doğru gerçek bir sürükleme olursa.
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > SWIPE_DISTANCE || gesture.vy > SWIPE_VELOCITY) {
          dismissRef.current(EXIT_MS);
          return;
        }
        Animated.timing(translateY, {
          toValue: 0,
          duration: duration.fast,
          easing: easing.standard,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const api = useMemo<ToastApi>(() => ({ show, hide }), [hide, show]);

  const tone = TONES[current?.tone ?? "neutral"];

  return (
    <ToastContext.Provider value={api}>
      {children}

      {current ? (
        <Animated.View
          {...pan.panHandlers}
          pointerEvents="box-none"
          style={[
            styles.wrapper,
            { bottom: insets.bottom + offsetBottom },
            { opacity, transform: [{ translateY }] },
          ]}
        >
          <View
            accessibilityRole="alert"
            accessibilityLabel={current.message}
            accessibilityLiveRegion="polite"
            style={[styles.toast, elevate(3)]}
          >
            <View style={[styles.accent, { backgroundColor: tone.color }]} />
            <Ionicons name={current.icon ?? tone.icon} size={18} color={tone.color} />
            <Text style={styles.message} numberOfLines={2} {...textScale.dense}>
              {current.message}
            </Text>

            {current.action ? (
              <Touchable
                feedback="chip"
                haptic="light"
                onPress={() => {
                  current.action?.onPress();
                  hide();
                }}
                accessibilityRole="button"
                accessibilityLabel={current.action.label}
                style={styles.actionButton}
              >
                <Text style={styles.actionLabel} {...textScale.badge}>
                  {current.action.label}
                </Text>
              </Touchable>
            ) : null}

            {current.duration === "sticky" ? (
              <Touchable
                feedback="icon"
                onPress={hide}
                accessibilityRole="button"
                accessibilityLabel="Bildirimi kapat"
                style={styles.closeButton}
              >
                <Ionicons name="close" size={16} color={colors.textTertiary} />
              </Touchable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

/**
 * Toast API'si. Sağlayıcı yoksa (test ortamı, izole bir ekran) uygulamayı
 * çökertmek yerine sessizce hiçbir şey yapmaz — bir bilgi mesajı için ekranı
 * kaybetmek kabul edilemez.
 */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  return context ?? NOOP_TOAST;
}

const NOOP_TOAST: ToastApi = {
  show: () => {
    if (__DEV__) console.warn("useToast: ToastProvider bulunamadı, mesaj gösterilmedi.");
  },
  hide: () => {},
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: layout.screenPadding,
    right: layout.screenPadding,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 48,
    paddingVertical: space.m,
    paddingLeft: space.lg,
    paddingRight: space.md,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  /** Sol kenardaki 3px ton şeridi — zemini boyamadan durumu söyler. */
  accent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  message: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
  actionButton: {
    paddingHorizontal: space.sm,
    paddingVertical: space.s,
    borderRadius: radius.sm,
  },
  actionLabel: {
    ...type.caption,
    fontWeight: "800",
    color: colors.brandAccent,
  },
  closeButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
