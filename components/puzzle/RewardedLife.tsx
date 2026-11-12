/**
 * REKLAMLA CAN — Lig Yolu oyunlarında canı biten oyuncu ödüllü reklam izleyip
 * +1 can alır (günde sunucunun belirlediği hak kadar; varsayılan 5).
 *
 * AKIŞ (sunucu: POST /api/puzzle/ad-life/start → /claim):
 *   1. "Reklam izle" → sunucu izlemeyi başlatır ve tek kullanımlık jeton verir.
 *   2. Reklam kaynağı, yönetimdeki "Ödüllü reklam (can)" alanına (app_rewarded)
 *      göre seçilir:
 *        · Google: AdMob ödüllü reklamı (yerel modül kuruluysa). Ödül olayı
 *          gelince ödül istenir.
 *        · Sponsor: alana atanmış sponsorun tam ekran görseli, geri sayımla.
 *        · İkisi de yoksa ElitLig'in kendi tanıtımı (geri sayımlı).
 *   3. Geri sayım biter (ya da Google ödülü verir) → ödül istenir, can eklenir.
 * Reklamı erken kapatan ödül alamaz. Sunucu da en az 12 sn ister.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Modal, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { openSponsor } from "@/components/ads/AdBanner";
import { useAppAds } from "@/components/ads/useAppAds";
import { Button, Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { getAdmob, unitFor } from "@/lib/ads/admob";
import { adImage, resolveAppZone, trackAd, type AdSponsor } from "@/lib/ads/api";
import { claimAdLife, startAdLife, type PuzzleProfile } from "@/lib/puzzle/api";
import type { PuzzleGameKey } from "@/lib/puzzle/types";
import { usePuzzleCache } from "@/lib/puzzle/usePuzzle";
import { colors, fonts, radius, space, textScale, type } from "@/theme";

/** Sunucunun istediği en kısa izleme (ms) — Google ödülü daha erken gelirse beklenir. */
const MIN_WATCH_MS = 12_500;

const HOUSE = [
  { icon: "business" as const, title: "Kulüp Şehrini kur", body: "Oyunlardan ve görevlerden kazandığın yıldızlarla okul bahçesinden Avrupa devine yüksel." },
  { icon: "trophy" as const, title: "Haftalık görevler", body: "Görevleri tamamla, XP kazan, Kulüp Şehri'nde yıldıza çevir." },
  { icon: "football" as const, title: "Gerçek maçların burada", body: "Liginin fikstürü, canlı skorlar ve oyuncu istatistikleri ElitLig'de." },
];

/**
 * "Reklam izle · +1 can" düğmesi; reklam ekranını kendi içinde açar.
 * profile: hak ve can durumu için (eski sunucuda ad_lives yoksa düğme gizlenir).
 */
export function WatchAdForLife({
  profile,
  onRewarded,
  size = "md",
  fullWidth = true,
}: {
  profile: PuzzleProfile | undefined;
  onRewarded?: (profile: PuzzleProfile) => void;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cache = usePuzzleCache();
  const ad = profile?.ad_lives;
  if (!profile || !ad) return null;
  const full = profile.lives >= profile.max_lives;
  const left = ad.left;
  return (
    <>
      <Button
        label={left > 0 ? `Reklam izle · +1 can (${left})` : "Bugünkü reklam hakkın bitti"}
        icon="play-circle"
        variant="secondary"
        size={size}
        fullWidth={fullWidth}
        disabled={full || left < 1}
        onPress={() => setOpen(true)}
        haptic="medium"
        accessibilityLabel={left > 0 ? `Reklam izleyip bir can kazan, bugün ${left} hakkın var` : "Bugünkü reklam hakkın bitti"}
      />
      <RewardedAdModal
        visible={open}
        game={profile.life_game}
        onClose={() => setOpen(false)}
        onRewarded={(next) => {
          cache(next);
          onRewarded?.(next);
        }}
      />
    </>
  );
}

type Source = { kind: "sponsor"; sponsor: AdSponsor } | { kind: "house"; index: number } | { kind: "google" };

export function RewardedAdModal({
  visible,
  onClose,
  onRewarded,
  game,
}: {
  visible: boolean;
  onClose: () => void;
  onRewarded: (profile: PuzzleProfile) => void;
  /** Canın ekleneceği oyun (her oyunun kendi canı var). */
  game?: PuzzleGameKey | null;
}) {
  const ads = useAppAds();
  const toast = useToast();
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<"loading" | "watching" | "ready" | "claiming">("loading");
  const [source, setSource] = useState<Source | null>(null);
  const [left, setLeft] = useState(15);
  const token = useRef<string | null>(null);
  const startedAt = useRef(0);
  const progress = useRef(new Animated.Value(0)).current;
  const alive = useRef(false);

  const claim = useCallback(async () => {
    const t = token.current;
    if (!t) return;
    setPhase("claiming");
    const wait = MIN_WATCH_MS - (Date.now() - startedAt.current);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await claimAdLife(t);
      token.current = null;
      if (!alive.current) return;
      onRewarded(res.profile);
      toast.show({ message: "+1 can kazandın!", tone: "success" });
      onClose();
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
      onClose();
    }
  }, [onClose, onRewarded, toast]);

  /** Geri sayımlı reklam (sponsor ya da ElitLig tanıtımı). */
  const runCountdown = useCallback(
    (seconds: number) => {
      setLeft(seconds);
      setPhase("watching");
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: seconds * 1000, easing: Easing.linear, useNativeDriver: false }).start();
      const id = setInterval(() => {
        setLeft((s) => {
          if (s <= 1) {
            clearInterval(id);
            if (alive.current) setPhase("ready");
            return 0;
          }
          return s - 1;
        });
      }, 1000);
      return () => clearInterval(id);
    },
    [progress],
  );

  useEffect(() => {
    if (!visible) return undefined;
    alive.current = true;
    let stop: (() => void) | undefined;
    setPhase("loading");
    setSource(null);
    (async () => {
      let seconds = 15;
      try {
        const res = await startAdLife(game);
        token.current = res.token;
        seconds = Math.max(12, res.seconds || 15);
        startedAt.current = Date.now();
      } catch (error) {
        toast.show({ message: errorText(error), tone: "danger" });
        onClose();
        return;
      }
      if (!alive.current) return;
      const zone = resolveAppZone(ads, "app_rewarded");
      // 1) Sponsor
      if (zone.sponsors.length) {
        const pick = zone.sponsors[Math.floor(Math.random() * zone.sponsors.length)];
        trackAd(pick.id, "app_rewarded", "view");
        setSource({ kind: "sponsor", sponsor: pick });
        stop = runCountdown(seconds);
        return;
      }
      // 2) Google ödüllü reklam
      const admob = getAdmob();
      const unitId = unitFor(zone.google);
      if (admob?.RewardedAd && admob.RewardedAdEventType && unitId) {
        setSource({ kind: "google" });
        try {
          const ad = admob.RewardedAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: Boolean(ads.google?.nonPersonalized) });
          let earned = false;
          const offs: (() => void)[] = [];
          offs.push(ad.addAdEventListener(admob.RewardedAdEventType.LOADED, () => ad.show().catch(() => fallback())));
          offs.push(ad.addAdEventListener(admob.RewardedAdEventType.EARNED_REWARD, () => (earned = true)));
          offs.push(
            ad.addAdEventListener(admob.AdEventType.CLOSED, () => {
              offs.forEach((off) => off());
              if (earned) void claim();
              else onClose();
            }),
          );
          offs.push(ad.addAdEventListener(admob.AdEventType.ERROR, () => fallback()));
          const fallback = () => {
            offs.forEach((off) => off());
            if (!alive.current) return;
            setSource({ kind: "house", index: Math.floor(Math.random() * HOUSE.length) });
            stop = runCountdown(seconds);
          };
          ad.load();
          return;
        } catch {
          /* aşağıda tanıtıma düşer */
        }
      }
      // 3) ElitLig tanıtımı
      setSource({ kind: "house", index: Math.floor(Math.random() * HOUSE.length) });
      stop = runCountdown(seconds);
    })();
    return () => {
      alive.current = false;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible || source?.kind === "google") return null;

  const cardW = Math.min(width - space.xl * 2, 420);
  const cardH = Math.min(cardW * 1.5, height * 0.66);
  const sponsor = source?.kind === "sponsor" ? source.sponsor : null;
  const house = source?.kind === "house" ? HOUSE[source.index] : null;
  const uri = sponsor ? adImage(sponsor, "app_rewarded") : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={[styles.head, { width: cardW }]}>
          <View style={styles.reward}>
            <Ionicons name="heart" size={16} color={colors.live} />
            <Text style={styles.rewardText} {...textScale.dense}>
              {phase === "ready" || phase === "claiming" ? "Ödülün hazır: +1 can" : phase === "watching" ? `Ödül ${left} sn sonra: +1 can` : "Reklam hazırlanıyor…"}
            </Text>
          </View>
          <Touchable feedback="icon" onPress={onClose} accessibilityRole="button" accessibilityLabel="Reklamı kapat, ödül alınmaz" hitSlop={12} style={styles.close}>
            <Ionicons name="close" size={20} color={colors.onDark} />
          </Touchable>
        </View>

        <Touchable
          feedback="card"
          disabled={!sponsor?.linkUrl}
          onPress={() => sponsor && openSponsor(sponsor, "app_rewarded")}
          accessibilityRole={sponsor?.linkUrl ? "link" : "image"}
          accessibilityLabel={sponsor ? `Sponsor: ${sponsor.name}` : house?.title ?? "Reklam"}
          style={[styles.card, { width: cardW, height: cardH }]}
        >
          {uri ? (
            <Image source={{ uri }} style={styles.image} resizeMode="cover" />
          ) : house ? (
            <View style={styles.house}>
              <View style={styles.houseIcon}>
                <Ionicons name={house.icon} size={56} color={colors.yellowCard} />
              </View>
              <Text style={styles.houseBrand} {...textScale.badge}>
                ELİTLİG
              </Text>
              <Text style={styles.houseTitle} {...textScale.dense}>
                {house.title}
              </Text>
              <Text style={styles.houseBody} {...textScale.long}>
                {house.body}
              </Text>
            </View>
          ) : null}
        </Touchable>

        <View style={[styles.track, { width: cardW }]}>
          <Animated.View style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
        </View>
        {sponsor ? (
          <Text style={styles.tag} {...textScale.badge}>
            SPONSOR · {sponsor.name}
          </Text>
        ) : null}
        <View style={{ width: cardW }}>
          <Button
            label={phase === "ready" ? "Ödülü al · +1 can" : phase === "claiming" ? "Can ekleniyor" : `${left} sn`}
            icon="heart"
            size="lg"
            fullWidth
            disabled={phase !== "ready"}
            loading={phase === "claiming" || phase === "loading"}
            onPress={() => void claim()}
            haptic="success"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reward: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.inkBlock },
  rewardText: { ...type.bodySm, fontFamily: fonts.bold, color: colors.onDark },
  close: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.inkBlock },
  card: { borderRadius: radius.xxl, overflow: "hidden", backgroundColor: colors.inkBlock },
  image: { width: "100%", height: "100%" },
  house: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md },
  houseIcon: { width: 112, height: 112, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.inkTileBorder },
  houseBrand: { ...type.micro, color: colors.yellowCard, letterSpacing: 2 },
  houseTitle: { ...type.display, color: colors.onDark, textAlign: "center" },
  houseBody: { ...type.body, color: colors.onDarkMuted, textAlign: "center" },
  track: { height: 6, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.inkBlock },
  fill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.yellowCard },
  tag: { ...type.caption, color: colors.onDark, letterSpacing: 1.2 },
});
