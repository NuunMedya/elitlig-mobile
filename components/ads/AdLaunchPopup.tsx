/**
 * AdLaunchPopup — uygulama açılışında reklam alanı "app_popup".
 *
 * Alana atanmış sponsor varsa gecikmeyle (yönetimde ayarlanır) tam ekran kart
 * açılır; aynı kullanıcıya en sık `frequencyHours` saatte bir. Birden çok popup
 * sponsoru varsa en uzun süredir gösterilmeyen seçilir. Sponsor yoksa ve alan
 * modu izin veriyorsa AdMob geçiş reklamı (interstitial) gösterilir.
 *
 * Giriş / kayıt / karşılama akışında ve yönetim ekranlarında açılmaz.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePathname } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Touchable } from "@/components/ui/Pressable";
import { adImage, resolveAppZone, trackAd, type AdSponsor } from "@/lib/ads/api";
import { getAdmob, unitFor } from "@/lib/ads/admob";
import { colors, radius, space, textScale, type } from "@/theme";
import { openSponsor } from "./AdBanner";
import { useAppAds } from "./useAppAds";
import { useAdminMode } from "@/providers/AdminModeProvider";

const STORE_KEY = "elitlig.adPopup.v1";
const BLOCKED = ["/giris", "/kayit", "/hosgeldin", "/baslangic", "/sifremi-unuttum", "/yonetim", "/canli"];

type Seen = { last?: number; [sponsorId: string]: number | undefined };

async function readSeen(): Promise<Seen> {
  try {
    return JSON.parse((await AsyncStorage.getItem(STORE_KEY)) || "{}") || {};
  } catch {
    return {};
  }
}

async function markSeen(id: number | "google") {
  const seen = await readSeen();
  seen[String(id)] = Date.now();
  seen.last = Date.now();
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(seen)).catch(() => {});
}

export function AdLaunchPopup() {
  const ads = useAppAds();
  const pathname = usePathname();
  const { config, sponsors, google } = resolveAppZone(ads, "app_popup");
  const [open, setOpen] = useState<AdSponsor | null>(null);
  const done = useRef(false);
  const { width, height } = useWindowDimensions();
  const adminMode = useAdminMode();
  /* Yönetim modunda reklam gösterilmez: orası bir çalışma aracıdır. */
  const blocked = adminMode.adminActive || !adminMode.ready || BLOCKED.some((p) => pathname?.startsWith(p));
  const sponsorKey = useMemo(() => sponsors.map((s) => s.id).join(","), [sponsors]);

  useEffect(() => {
    if (done.current || blocked || !config) return undefined;
    if (!sponsors.length && !unitFor(google)) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const seen = await readSeen();
      const gap = Math.max(0, Number(config.frequencyHours) || 0) * 3600 * 1000;
      if (cancelled || (gap && seen.last && Date.now() - seen.last < gap)) return;
      timer = setTimeout(() => {
        if (cancelled || done.current) return;
        done.current = true;
        if (sponsors.length) {
          const pick = [...sponsors].sort((a, b) => (seen[String(a.id)] || 0) - (seen[String(b.id)] || 0))[0];
          void markSeen(pick.id);
          trackAd(pick.id, "app_popup", "view");
          setOpen(pick);
          return;
        }
        // Google geçiş reklamı (AdMob yerel modülü varsa).
        const admob = getAdmob();
        const unitId = unitFor(google);
        if (!admob || !unitId) return;
        try {
          const ad = admob.InterstitialAd.createForAdRequest(unitId, {
            requestNonPersonalizedAdsOnly: Boolean(ads.google?.nonPersonalized),
          });
          const off = ad.addAdEventListener(admob.AdEventType.LOADED, () => {
            off();
            void markSeen("google");
            ad.show().catch(() => {});
          });
          ad.load();
        } catch {
          /* reklam yüklenemedi — sessizce geç */
        }
      }, Math.max(0, Number(config.delaySeconds) || 0) * 1000);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // sponsorKey: liste içeriği değişmedikçe zamanlayıcı yeniden kurulmaz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.mode, config?.delaySeconds, config?.frequencyHours, sponsorKey, google?.android, google?.ios, blocked]);

  if (!open) return null;
  const uri = adImage(open, "app_popup");
  const cardWidth = Math.min(width - space.xxl * 2, 420);
  const cardHeight = Math.min(cardWidth * 1.5, height * 0.72);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(null)} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={{ width: cardWidth }}>
          <Touchable
            feedback="card"
            onPress={() => {
              openSponsor(open, "app_popup");
              setOpen(null);
            }}
            accessibilityRole={open.linkUrl ? "link" : "image"}
            accessibilityLabel={`Sponsor: ${open.name}`}
            style={[styles.card, { height: cardHeight }]}
          >
            {uri ? <Image source={{ uri }} style={styles.image} resizeMode="cover" /> : null}
          </Touchable>
          <Touchable
            feedback="icon"
            onPress={() => setOpen(null)}
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            hitSlop={12}
            style={styles.close}
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </Touchable>
          <Text style={styles.tag} {...textScale.badge}>SPONSOR · {open.name}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: space.xxl },
  card: { width: "100%", borderRadius: radius.xxl, overflow: "hidden", backgroundColor: colors.surface3 },
  image: { width: "100%", height: "100%" },
  close: {
    position: "absolute",
    top: -space.md,
    right: -space.md,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  tag: { ...type.caption, color: colors.onDark, textAlign: "center", marginTop: space.sm, letterSpacing: 1.2 },
});
