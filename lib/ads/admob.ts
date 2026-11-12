import type { ComponentType } from "react";
import { NativeModules, Platform, TurboModuleRegistry } from "react-native";

/**
 * GOOGLE ADMOB — İSTEĞE BAĞLI YEREL MODÜL
 *
 * `react-native-google-mobile-ads` paketi ve app.json eklentisi (uygulama
 * kimlikleri) eklenip yeni bir mağaza sürümü derlenene kadar uygulamada AdMob
 * yoktur. Bu dosya o durumda sessizce `null` döner: sponsor reklamları OTA
 * güncellemeyle çalışır, Google alanları boş kalır ve eski sürümler çökmez.
 *
 * Metro, try/catch içindeki çözülemeyen `require`ı isteğe bağlı bağımlılık
 * sayar (allowOptionalDependencies); paket kurulu değilken de JS paketi derlenir.
 * Kurulum adımları: docs/REKLAM_ALANLARI.md
 */

type AdmobModule = {
  BannerAd: ComponentType<Record<string, unknown>>;
  BannerAdSize: Record<string, string>;
  InterstitialAd: { createForAdRequest: (unitId: string, opts?: Record<string, unknown>) => AdmobInterstitial };
  AdEventType: Record<string, string>;
  /** Ödüllü reklam (Lig Yolu: reklam izle, +1 can). */
  RewardedAd?: { createForAdRequest: (unitId: string, opts?: Record<string, unknown>) => AdmobInterstitial };
  RewardedAdEventType?: Record<string, string>;
  default?: () => { initialize: () => Promise<unknown> };
};

export type AdmobInterstitial = {
  addAdEventListener: (type: string, cb: (...args: unknown[]) => void) => () => void;
  load: () => void;
  show: () => Promise<void>;
};

let cached: AdmobModule | null | undefined;
let initialized = false;

const hasNativeModule = () => {
  try {
    return Boolean(
      (TurboModuleRegistry?.get && TurboModuleRegistry.get("RNGoogleMobileAdsModule")) ||
        NativeModules?.RNGoogleMobileAdsModule
    );
  } catch {
    return false;
  }
};

export function getAdmob(): AdmobModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS === "web" || !hasNativeModule()) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-google-mobile-ads") as AdmobModule;
    if (mod?.BannerAd) {
      cached = mod;
      if (!initialized && typeof mod.default === "function") {
        initialized = true;
        mod.default().initialize().catch(() => {});
      }
    }
  } catch {
    cached = null;
  }
  return cached;
}

/** Platforma göre reklam birimi. */
export const unitFor = (google: { android?: string; ios?: string } | null | undefined) =>
  (Platform.OS === "ios" ? google?.ios : google?.android) || null;
