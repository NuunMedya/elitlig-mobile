/**
 * AdBanner — uygulama içi reklam alanı (app_home, app_match, app_inline).
 *
 * Alana atanmış sponsor varsa onun görseli (birden çoksa belirli aralıkla
 * döner), yoksa ve alan modu izin veriyorsa Google AdMob banner'ı. AdMob
 * yerel modülü bu sürümde yoksa (bkz. lib/ads/admob.ts) alan hiç çizilmez.
 * Alan çizilince bir gösterim, dokununca tıklama sayılır.
 */

import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Touchable } from "@/components/ui/Pressable";
import { adImage, resolveAppZone, trackAd, type AdSponsor, type AppAdZoneKey } from "@/lib/ads/api";
import { getAdmob, unitFor } from "@/lib/ads/admob";
import { colors, radius, space, textScale, type } from "@/theme";
import { useAppAds } from "./useAppAds";

interface Props {
  zone: Exclude<AppAdZoneKey, "app_popup">;
  style?: StyleProp<ViewStyle>;
}

export function openSponsor(sponsor: AdSponsor, zone: AppAdZoneKey) {
  trackAd(sponsor.id, zone, "click");
  if (sponsor.linkUrl) void WebBrowser.openBrowserAsync(sponsor.linkUrl).catch(() => {});
}

function useRotation(count: number, seconds = 9) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    if (count < 2) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), Math.max(4, seconds) * 1000);
    return () => clearInterval(id);
  }, [count, seconds]);
  return count ? index % count : 0;
}

function GoogleBanner({ unitId, nonPersonalized }: { unitId: string; nonPersonalized?: boolean }) {
  const admob = getAdmob();
  const [failed, setFailed] = useState(false);
  if (!admob || failed) return null;
  const { BannerAd, BannerAdSize } = admob;
  return (
    <View style={styles.google}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: Boolean(nonPersonalized) }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

export function AdBanner({ zone, style }: Props) {
  const ads = useAppAds();
  const { config, sponsors, google } = resolveAppZone(ads, zone);
  const index = useRotation(sponsors.length, config?.rotateSeconds);
  const sponsor = sponsors[index] ?? null;
  const seen = useRef(new Set<number>());

  // Ekrana çizilince bir gösterim — bu alanda sponsor başına bir kez.
  useEffect(() => {
    if (sponsor && !seen.current.has(sponsor.id)) {
      seen.current.add(sponsor.id);
      trackAd(sponsor.id, zone, "view");
    }
  }, [sponsor, zone]);

  if (!config) return null;

  if (sponsor) {
    const uri = adImage(sponsor, zone);
    if (!uri) return null;
    return (
      <View style={[styles.wrap, style]}>
        <Touchable
          feedback="card"
          onPress={() => openSponsor(sponsor, zone)}
          accessibilityRole={sponsor.linkUrl ? "link" : "image"}
          accessibilityLabel={`Sponsor: ${sponsor.name}`}
          style={styles.card}
        >
          <Image key={sponsor.id} source={{ uri }} style={styles.image} resizeMode="cover" />
        </Touchable>
        <Text style={styles.tag} {...textScale.badge}>SPONSOR</Text>
      </View>
    );
  }

  const unitId = unitFor(google);
  if (unitId && getAdmob()) {
    return (
      <View style={[styles.wrap, style]}>
        <GoogleBanner unitId={unitId} nonPersonalized={ads.google?.nonPersonalized} />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: { marginVertical: space.md, gap: space.xs },
  card: { borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.surface3 },
  image: { width: "100%", aspectRatio: 4 },
  tag: { ...type.caption, color: colors.textTertiary, alignSelf: "flex-end", letterSpacing: 1.2 },
  google: { alignItems: "center", minHeight: 50 },
});
