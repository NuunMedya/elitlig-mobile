/**
 * ÇEVRİMDIŞI EŞİTLEME (sözleşme §7) — kökte bir kez çalışır, hiçbir şey çizmez.
 *
 * Kuyruk şu anlarda gönderilir: açılışta, uygulama öne gelince, herhangi bir
 * isteğin başarılı yanıtından sonra (bağlantı geri geldi; 20 sn'de en çok bir
 * kez) ve oyun merkezine girilince (`requestOfflineFlush`). Gönderim
 * başarılıysa güncel profil önbelleğe yazılır ve "Çevrimdışı oyunların
 * kaydedildi: +12 yıldız" bildirimi çıkar.
 *
 * `OfflinePill`: çevrimdışıyken ya da bekleyen sonuç varken oyun ekranlarının
 * tepesinde küçük bilgi hapı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { AppState, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useToast } from "@/components/ui";
import { setNetworkObserver } from "@/lib/http";
import { noteOnline, noteRequestError, useOffline } from "@/lib/offline/net";
import { flushOffline, pendingCount, usePendingCount } from "@/lib/offline/queue";
import { ApiError } from "@/lib/http";
import { puzzleKeys, type PuzzleMe } from "@/lib/puzzle/api";
import { GH } from "@/lib/game/gameHomePalette";
import { useAuth } from "@/providers/AuthProvider";
import { fonts, radius, space, textScale, type } from "@/theme";

const THROTTLE_MS = 20_000;
const flushRequests = new Set<() => void>();

/** Oyun merkezi / oyun ana sayfası odaklanınca: kuyruğu hemen göndermeyi iste. */
export function requestOfflineFlush() {
  flushRequests.forEach((fn) => fn());
}

export function OfflineSyncSetup() {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const queryClient = useQueryClient();
  const toast = useToast();
  const lastTry = useRef(0);

  const flush = useCallback(
    async (force?: boolean) => {
      if (userId == null) return;
      const now = Date.now();
      if (!force && now - lastTry.current < THROTTLE_MS) return;
      lastTry.current = now;
      if ((await pendingCount(userId)) < 1) return;
      const res = await flushOffline(userId).catch(() => null);
      if (!res) return;
      queryClient.setQueryData<PuzzleMe>(puzzleKeys.me(), (cur) =>
        cur ? { ...cur, profile: res.profile ?? cur.profile, games: res.games ? { ...cur.games, ...res.games } : cur.games } : cur,
      );
      void queryClient.invalidateQueries({ queryKey: ["puzzle", "city"] });
      void queryClient.invalidateQueries({ queryKey: ["arena"] });
      const stars = res.gained?.stars ?? 0;
      const coins = res.gained?.coins ?? 0;
      const parts = [stars > 0 ? `+${stars} yıldız` : "", coins > 0 ? `+${coins} jeton` : ""].filter(Boolean).join(" · ");
      toast.show({ message: parts ? `Çevrimdışı oyunların kaydedildi: ${parts}` : "Çevrimdışı oyunların kaydedildi.", tone: "success" });
    },
    [queryClient, toast, userId],
  );

  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    // http katmanı: başarılı yanıt → bağlantı var, kuyruğu dene; yanıtsız hata → çevrimdışı.
    setNetworkObserver({
      success: () => {
        noteOnline();
        void flushRef.current();
      },
      offline: () => noteRequestError(new ApiError("offline", 0, "NETWORK")),
    });
    return () => setNetworkObserver({});
  }, []);

  useEffect(() => {
    void flush(true);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void flushRef.current(true);
    });
    const req = () => void flushRef.current(true);
    flushRequests.add(req);
    return () => {
      sub.remove();
      flushRequests.delete(req);
    };
  }, [flush]);

  return null;
}

/** "Çevrimdışı · sonuçların internet gelince kaydedilecek" hapı. */
export function OfflinePill({ style, onDark = true }: { style?: StyleProp<ViewStyle>; onDark?: boolean }) {
  const offline = useOffline();
  const auth = useAuth();
  const pending = usePendingCount(auth.user?.id);
  if (!offline && pending < 1) return null;
  const text = offline
    ? auth.user
      ? "Çevrimdışı · sonuçların internet gelince kaydedilecek"
      : "Çevrimdışı · cihazında oynuyorsun"
    : `${pending} sonuç kaydedilmeyi bekliyor`;
  return (
    <View style={[styles.pill, onDark ? styles.pillDark : styles.pillLight, style]} accessibilityRole="text" accessibilityLabel={text}>
      <Ionicons name={offline ? "cloud-offline" : "cloud-upload"} size={14} color={onDark ? GH.white : GH.ink} />
      <Text style={[styles.text, { color: onDark ? GH.white : GH.ink }]} numberOfLines={1} {...textScale.badge}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "center", paddingHorizontal: space.md, paddingVertical: space.xxs, borderRadius: radius.pill, maxWidth: "100%" },
  pillDark: { backgroundColor: GH.offline },
  pillLight: { backgroundColor: GH.offlineLight },
  text: { ...type.micro, fontFamily: fonts.bold, flexShrink: 1 },
});
