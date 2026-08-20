/**
 * Hareket sabitleri ve dokunsal geri bildirim.
 *
 * react-native-reanimated KURULU DEĞİL: tüm hareket, RN çekirdeğindeki
 * `Animated` (mümkün olan her yerde `useNativeDriver: true`) ve
 * `LayoutAnimation` ile yazılır. Bu yüzden buradaki `spring` nesneleri doğrudan
 * `Animated.spring` yapılandırmasına serilebilecek biçimdedir.
 *
 * Süreler kısa tutulur: skor uygulaması sürekli veri tazeleyen bir yüzeydir,
 * uzun geçişler "yavaş uygulama" hissi verir.
 */

import { Easing, LayoutAnimation, Platform } from "react-native";
import * as Haptics from "expo-haptics";

export const duration = {
  instant: 0,
  fast:    120,   // basılı çıkışı, opaklık
  base:    180,   // sekme göstergesi, chip seçimi
  medium:  240,   // sheet giriş, toast
  slow:    320,   // hero daralma tamamlanışı
  flash:   900,   // skor değişim parlaması
  pulse:  1400,   // canlı nabız döngüsü
  shimmer:1100,   // iskelet parlaması
} as const;

export const easing = {
  standard:   Easing.bezier(0.2, 0, 0, 1),   // giriş+çıkış
  decelerate: Easing.out(Easing.cubic),      // giriş
  accelerate: Easing.in(Easing.cubic),       // çıkış
  emphasized: Easing.bezier(0.05, 0.7, 0.1, 1),
} as const;

export const spring = {
  press:  { damping: 18, stiffness: 320, mass: 0.7, useNativeDriver: true },
  sheet:  { damping: 22, stiffness: 260, mass: 1,   useNativeDriver: true },
  bounce: { damping: 12, stiffness: 200, mass: 0.9, useNativeDriver: true },
} as const;

/**
 * Basma geri bildirimi ölçüleri (§5.2). Liste satırında ölçek/opaklık YOKTUR —
 * yalnız zemin `pressed` rengine geçer; kart, buton ve FAB farklı davranır.
 */
export const press = {
  cardScale: 0.985,
  fabScale: 0.94,
  iconOpacity: 0.55,
  chipOpacity: 0.7,
  buttonOpacity: 0.7,
  hitSlop: 10,
} as const;

/** Liste ekleme/çıkarma için standart LayoutAnimation — kısa ve yumuşak. */
export function animateNextLayout(ms: number = duration.base): void {
  LayoutAnimation.configureNext({
    duration: ms,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}

/* ————————————————————————— Haptics ————————————————————————— */

/**
 * Kurallar:
 *  - Kaydırmayla tetiklenen hiçbir olayda haptik yok (DateStrip kaydırması
 *    dâhil; yalnız gün SEÇİMİ titrer).
 *  - Aynı 300ms içinde iki haptik tetiklenemez; mutasyon sonucu + toast
 *    birlikte gelirse yalnız biri titrer.
 *  - Otomatik veri yenilemede haptik yok; yalnız kullanıcı tetiklediyse.
 *  - Skor değişimi haptiği yalnız uygulama ön plandayken ve maç kullanıcının
 *    favorisi/takımıysa.
 */
let enabled = true;
let lastAt = 0;
const THROTTLE_MS = 300;

/** Ayarlar ekranından dokunsal geri bildirimi kapatmak için. */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

function run(fn: () => Promise<void>): void {
  if (!enabled || Platform.OS === "web") return;
  const now = Date.now();
  if (now - lastAt < THROTTLE_MS) return;
  lastAt = now;
  void fn().catch(() => {
    // Haptik motoru yoksa/izin yoksa sessizce geç — geri bildirim opsiyoneldir.
  });
}

export const haptics = {
  /** Seçim değişimi: sekme, chip, gün, stepper, segment */
  select: () => run(() => Haptics.selectionAsync()),
  /** Hafif onay: favori yıldızı, satır uzun basma menüsü */
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Birincil eylem: FAB, gönder, kaydet */
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** GOL — yalnız uygulama ön plandayken ve kullanıcının takımı/favorisi ise */
  goal: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
