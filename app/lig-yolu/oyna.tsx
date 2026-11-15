/**
 * LİG YOLU ▸ OYUN EKRANI — /lig-yolu/oyna?oyun=<anahtar>&seviye=<n>&on=<güçlendiriciler>&oturum=<oyun jetonu>
 *
 * Çerçeve ile oyun arasındaki köprü:
 *   · oyunun Game bileşenini çizer (tahta + oyunun kendi hedef çubuğu);
 *   · güçlendirici stoğunu yerelde tutar, oyunun isteğini onaylar ve harcananı
 *     sayar (seviye sonunda sunucuya tek seferde bildirilir);
 *   · oyun bitince sonucu sunucuya yazar (yıldız, jeton ya da can kaybı)
 *     ve Sonuç penceresini açar;
 *   · seviyeden çıkmak isteyene "çıkarsan 1 can gider" diye sorar (türün
 *     alışık olunan kuralı).
 *   · REKLAMLA DEVAM: oyun `requestContinue` çağırırsa (kaybetmek üzere)
 *     bölüm başına bir kez "Reklam izle · devam et" sorulur.
 *   · SERİ HEDİYESİ: `hediye=<anahtarlar>` ücretsiz güçlendiriciler (stoktan
 *     düşmez, harcanan olarak sayılmaz).
 *   · ÇEVRİMDIŞI (sözleşme §7): `cevrimdisi=1` ya da bitişte ağ hatası →
 *     sonuç kuyruğa yazılır, ilerleme aynada iyimser güncellenir, sonuç
 *     penceresi yine açılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { confirmAction } from "@/components/admin";
import { GameButton, ResultSheet } from "@/components/puzzle/LevelSheets";
import { ShopSheet } from "@/components/puzzle/sheets";
import { StageBackdrop } from "@/components/puzzle/StageBackdrop";
import { ConfettiBurst } from "@/components/game/Celebration";
import { OfflinePill } from "@/components/offline/OfflineSync";
import { RewardedAdModal, localAdFlow } from "@/components/puzzle/RewardedLife";
import { Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { applyOfflineLevel } from "@/lib/offline/mirror";
import { isOfflineError, monoNow, noteRequestError, useOffline } from "@/lib/offline/net";
import { enqueueOffline } from "@/lib/offline/queue";
import { finishLevel, livesFor, puzzleKeys, type FinishResponse, type PuzzleMe } from "@/lib/puzzle/api";
import { STAGE_COMMON } from "@/lib/puzzle/stagePalette";
import { puzzleGame } from "@/lib/puzzle/registry";
import type { PuzzleResult } from "@/lib/puzzle/types";
import { usePuzzleCache, usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, layout, radius, space, textScale, touchSlop, type } from "@/theme";

export default function PuzzlePlayScreen() {
  const auth = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const cache = usePuzzleCache();
  const queryClient = useQueryClient();
  const offlineNow = useOffline();
  const params = useLocalSearchParams<{ oyun?: string; seviye?: string; on?: string; oturum?: string; hediye?: string; cevrimdisi?: string }>();
  /** /start'ın verdiği oyun jetonu: kazanç yalnız bununla yazılır. */
  const playToken = params.oturum ? String(params.oturum) : undefined;
  const startedOffline = params.cevrimdisi === "1";
  const module = puzzleGame(params.oyun);
  const level = Math.max(1, Number(params.seviye) || 1);
  /** Stoktan seçilen seviye öncesi güçlendiriciler. */
  const paidBoosters = useMemo(() => String(params.on || "").split(",").filter(Boolean), [params.on]);
  /** Seri hediyesi: ücretsiz (stoktan düşmez, harcanan sayılmaz). */
  const giftBoosters = useMemo(() => String(params.hediye || "").split(",").filter(Boolean), [params.hediye]);
  const preBoosters = useMemo(() => [...paidBoosters, ...giftBoosters], [paidBoosters, giftBoosters]);
  /** Oyunun süresi (çevrimdışı kuyruk olayı için; monotonik). */
  const startedAt = useRef({ wall: Date.now(), mono: monoNow() });

  const query = usePuzzleMe();
  const me = query.data;

  /** Oyun içi stok: profil stoğu − seviye öncesi seçilenler − bu oyunda harcananlar. */
  const used = useRef<Record<string, number>>({});
  const [stock, setStock] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!me || stock) return;
    const next = { ...me.profile.boosters };
    const paid: Record<string, number> = {};
    for (const key of paidBoosters) {
      next[key] = Math.max(0, (next[key] ?? 0) - 1);
      paid[key] = (paid[key] ?? 0) + 1;
    }
    setStock(next);
    used.current = paid;
  }, [me, paidBoosters, stock]);

  const [shopOpen, setShopOpen] = useState(false);
  /** Oyun alanının ölçüsü: oyun bu alanı tam doldurur. */
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<{ res: PuzzleResult; server: FinishResponse | null; offline?: boolean } | null>(null);
  const finished = useRef(false);

  /* — Reklamla devam: bölüm başına bir kez — */
  const continueUsed = useRef(false);
  const [offer, setOffer] = useState<{ extra: string; resolve: (ok: boolean) => void } | null>(null);
  const [adOpen, setAdOpen] = useState(false);
  const requestContinue = useCallback(
    (o: { extra: string }) => {
      if (continueUsed.current || finished.current) return Promise.resolve(false);
      continueUsed.current = true;
      return new Promise<boolean>((resolve) => setOffer({ extra: o.extra, resolve }));
    },
    []
  );
  const settleOffer = useCallback((ok: boolean) => {
    setOffer((cur) => {
      cur?.resolve(ok);
      return null;
    });
    setAdOpen(false);
  }, []);

  const useBooster = useCallback(
    (key: string) => {
      const have = stock?.[key] ?? 0;
      if (have < 1) {
        toast.show({ message: "Bu güçlendiriciden kalmadı. Mağazadan alabilirsin.", tone: "warn" });
        setShopOpen(true);
        setPaused(true);
        return false;
      }
      setStock((cur) => ({ ...(cur ?? {}), [key]: Math.max(0, (cur?.[key] ?? 0) - 1) }));
      used.current[key] = (used.current[key] ?? 0) + 1;
      return true;
    },
    [stock, toast]
  );

  /** Sonuç kuyruğa (çevrimdışı) — ilerleme aynada iyimser güncellenir. */
  const queueResult = useCallback(
    async (res: PuzzleResult) => {
      if (!module || !auth.user) return;
      const stars = res.won ? Math.max(1, res.stars) : 0;
      const now = Date.now();
      await enqueueOffline(auth.user.id, {
        kind: "level",
        game: module.key,
        level,
        won: res.won,
        stars,
        ...(res.score != null ? { score: res.score } : {}),
        boosters_used: used.current,
        startedAt: startedAt.current.wall,
        finishedAt: now,
        durationMs: Math.max(0, Math.round(monoNow() - startedAt.current.mono)),
      });
      let gained = 0;
      queryClient.setQueryData<PuzzleMe>(puzzleKeys.me(), (cur) => {
        if (!cur) return cur;
        const next = applyOfflineLevel(cur, { game: module.key, level, won: res.won, stars, boosters_used: used.current });
        gained = next.starsGained;
        return next.me;
      });
      setResult({
        res,
        server: null,
        offline: true,
      });
      if (res.won && gained > 0) toast.show({ message: `+${gained} yıldız internet gelince hesabına yazılacak.`, tone: "success" });
    },
    [auth.user, level, module, queryClient, toast]
  );

  const report = useCallback(
    async (res: PuzzleResult) => {
      if (!module || finished.current) return;
      finished.current = true;
      // Oyun bekleyen "devam" sorusunu kapatır.
      if (offer) settleOffer(false);
      if (startedOffline && !playToken) {
        await queueResult(res);
        return;
      }
      try {
        const server = await finishLevel(module.key, {
          level,
          won: res.won,
          stars: res.won ? Math.max(1, res.stars) : 0,
          boosters_used: used.current,
          ...(playToken ? { play: playToken } : {}),
        });
        cache(server.profile, server.game);
        setResult({ res, server });
      } catch (error) {
        noteRequestError(error);
        if (isOfflineError(error)) {
          await queueResult(res);
          return;
        }
        toast.show({ message: errorText(error), tone: "danger" });
        setResult({ res, server: null });
      }
    },
    [cache, level, module, offer, playToken, queueResult, settleOffer, startedOffline, toast]
  );

  /** Seviyeden çıkış: oyun sürüyorsa onay ve can kaybı. */
  const leave = useCallback(async () => {
    if (finished.current) {
      router.back();
      return;
    }
    setPaused(true);
    const ok = await confirmAction({
      title: "Seviyeden çıkılsın mı?",
      message: "Çıkarsan bu seviye kaybedilmiş sayılır ve 1 can gider.",
      confirmLabel: "Çık",
      cancelLabel: "Devam et",
      destructive: true,
    });
    if (!ok) {
      setPaused(false);
      return;
    }
    await report({ won: false, stars: 0 });
    router.back();
  }, [report, router]);

  // Android geri tuşu ve kaydırarak geri: aynı onay.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      void leave();
      return true;
    });
    const unsub = navigation.addListener("beforeRemove", (event: { preventDefault: () => void }) => {
      if (finished.current) return;
      event.preventDefault();
      void leave();
    });
    return () => {
      sub.remove();
      unsub();
    };
  }, [leave, navigation]);

  if (!auth.user) return <Redirect href="/giris" />;
  if (!module) return <Redirect href="/lig-yolu" />;

  const Game = module.Game;
  const gameProfile = livesFor(me?.profile ?? result?.server?.profile, module.key);
  const lives = gameProfile?.lives ?? 0;
  const maxLives = gameProfile?.max_lives ?? 5;
  // Haritaya DÖN (yığındaki haritaya in): `replace` her seviyede yığına yeni bir
  // harita ekliyordu; geri tuşu birkaç kez basılmadan çıkmıyordu.
  const goToMap = (next?: number) =>
    router.dismissTo({ pathname: "/lig-yolu/[oyun]", params: { oyun: module.key, sonraki: next ? String(next) : "" } });

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <StageBackdrop game={module.key} />
      <View style={styles.top}>
        {/* Çıkış düğmesi yok: oyundan çıkış mola kartında (durdur → Oyundan çık). */}
        <View style={styles.roundSpacer} />
        <View style={styles.titleWrap}>
          <View style={styles.titlePill} accessibilityRole="header">
            <Text style={styles.titleSmall} numberOfLines={1} {...textScale.badge}>
              {module.title.toLocaleUpperCase("tr-TR")}
            </Text>
            <Text style={styles.titleBig} numberOfLines={1} {...textScale.badge}>
              Seviye {level}
            </Text>
          </View>
          {startedOffline || offlineNow ? <OfflinePill /> : null}
          <View style={styles.hearts} accessibilityLabel={`${lives} can`}>
            {Array.from({ length: maxLives }, (_, i) => (
              <Ionicons key={i} name={i < lives ? "heart" : "heart-outline"} size={13} color={i < lives ? STAGE_COMMON.heart : STAGE_COMMON.inkSoft} style={styles.heart} />
            ))}
          </View>
        </View>
        <RoundButton icon={paused ? "play" : "pause"} onPress={() => setPaused((p) => !p)} label={paused ? "Devam et" : "Duraklat"} />
      </View>

      <View style={styles.board} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {stock && area ? (
          <Game
            key={`${module.key}-${level}`}
            level={level}
            maxWidth={Math.min(area.w - space.sm * 2, 560)}
            maxHeight={Math.max(320, area.h - space.sm)}
            preBoosters={preBoosters}
            boosterStock={stock}
            useBooster={useBooster}
            onFinish={(res) => void report(res)}
            paused={paused || shopOpen || result != null || offer != null}
            requestContinue={requestContinue}
          />
        ) : null}
      </View>

      {paused && !shopOpen && !result ? (
        <View style={styles.pauseLayer}>
          <View style={styles.pauseCard} accessibilityViewIsModal>
            <View style={styles.pauseHead} accessibilityRole="header">
              <Text style={styles.pauseOver} numberOfLines={1} {...textScale.badge}>
                {module.title.toLocaleUpperCase("tr-TR")} · SEVİYE {level}
              </Text>
              <Text style={styles.pauseTitle} {...textScale.badge}>Mola</Text>
            </View>
            <View style={styles.pauseBtns}>
              <GameButton label="DEVAM ET" icon="play" onPress={() => setPaused(false)} />
              <GameButton label="OYUNDAN ÇIK" icon="exit-outline" tone="danger" small onPress={() => void leave()} />
            </View>
            <Text style={styles.quitText} {...textScale.dense}>Çıkarsan bu seviye kaybedilmiş sayılır, 1 can gider.</Text>
          </View>
        </View>
      ) : null}

      <ShopSheet
        visible={shopOpen}
        onClose={() => {
          setShopOpen(false);
          setPaused(false);
          // Mağazadan alınan güçlendiriciler oyun içi stoğa eklenir.
          const fresh = query.data?.profile.boosters;
          if (fresh) {
            setStock((cur) => {
              const next = { ...(cur ?? {}) };
              for (const [k, v] of Object.entries(fresh)) next[k] = Math.max(0, v - (used.current[k] ?? 0));
              return next;
            });
          }
        }}
        me={me}
        game={module.key}
      />

      {offer && !result ? (
        <View style={styles.pauseLayer}>
          <View style={styles.pauseCard} accessibilityViewIsModal>
            <View style={styles.pauseHead} accessibilityRole="header">
              <Text style={styles.pauseOver} numberOfLines={1} {...textScale.badge}>
                SEVİYE {level} · SON ŞANS
              </Text>
              <Text style={styles.pauseTitle} {...textScale.badge}>Az kaldı!</Text>
            </View>
            <Text style={styles.quitText} {...textScale.long}>
              Kısa bir reklam izle, kaldığın yerden devam et: {offer.extra}.
            </Text>
            <View style={styles.pauseBtns}>
              <GameButton label={`REKLAM İZLE · ${offer.extra.toLocaleUpperCase("tr-TR")}`} icon="play-circle" onPress={() => setAdOpen(true)} />
              <GameButton label="VAZGEÇ" icon="close" tone="danger" small onPress={() => settleOffer(false)} />
            </View>
          </View>
        </View>
      ) : null}
      <RewardedAdModal<true>
        visible={adOpen}
        onClose={() => setAdOpen(false)}
        flow={localAdFlow(offer?.extra ?? "devam")}
        onRewarded={() => settleOffer(true)}
      />

      <ConfettiBurst trigger={result?.res.won ? level : 0} count={24} />
      {result ? (
        <ResultSheet
          visible
          won={result.res.won}
          stars={result.res.stars}
          level={level}
          coins={result.server?.reward?.coins ?? 0}
          firstClear={Boolean(result.server?.reward?.firstClear) || Boolean(result.offline && result.res.won)}
          starsGained={result.server?.reward ? result.server.reward.starsGained : null}
          summary={result.res.summary}
          livesLeft={lives}
          profile={gameProfile}
          game={module.key}
          reward={result.server?.reward ?? null}
          offline={result.offline}
          onNext={() => goToMap(level + 1)}
          onRetry={() => goToMap(level)}
          onMap={() => goToMap()}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Üst şeritteki yuvarlak cam düğme (duraklat / devam). */
function RoundButton({ icon, onPress, label }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string }) {
  return (
    <Touchable onPress={onPress} hitSlop={touchSlop(44)} accessibilityRole="button" accessibilityLabel={label} style={styles.round} haptic="light">
      <Ionicons name={icon} size={20} color={STAGE_COMMON.white} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: layout.screenPadding, paddingTop: space.xs, paddingBottom: space.sm },
  round: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: STAGE_COMMON.glass,
    borderWidth: 1,
    borderColor: STAGE_COMMON.glassEdge,
  },
  roundSpacer: { width: 44, height: 44 },
  titleWrap: { flex: 1, alignItems: "center", gap: space.xs },
  titlePill: { alignItems: "center" },
  titleSmall: { ...type.micro, fontFamily: fonts.bold, color: STAGE_COMMON.inkSoft, letterSpacing: 1.5 },
  titleBig: { ...type.h2, fontFamily: fonts.bold, color: STAGE_COMMON.ink },
  hearts: { flexDirection: "row", paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: STAGE_COMMON.glass },
  heart: { marginHorizontal: 1 },
  board: { flex: 1, alignItems: "center", justifyContent: "center" },
  pauseLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: STAGE_COMMON.dim, alignItems: "center", justifyContent: "center", padding: space.lg },
  pauseCard: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    gap: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.lg,
    paddingHorizontal: space.lg,
    borderRadius: radius.xxl,
    backgroundColor: STAGE_COMMON.card[0],
    shadowColor: STAGE_COMMON.cardShadow,
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  pauseHead: { alignItems: "center", gap: space.xxs },
  pauseOver: { ...type.micro, fontFamily: fonts.bold, color: STAGE_COMMON.cardSoft, letterSpacing: 1.5 },
  pauseTitle: { ...type.display, fontFamily: fonts.bold, color: STAGE_COMMON.cardInk },
  pauseBtns: { alignSelf: "stretch", gap: space.sm },
  quitText: { ...type.caption, color: STAGE_COMMON.cardSoft, textAlign: "center" },
});
