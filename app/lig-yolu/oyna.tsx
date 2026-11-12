/**
 * LİG YOLU ▸ OYUN EKRANI — /lig-yolu/oyna?oyun=<anahtar>&seviye=<n>&on=<güçlendiriciler>
 *
 * Çerçeve ile oyun arasındaki köprü:
 *   · oyunun Game bileşenini çizer (tahta + oyunun kendi hedef çubuğu);
 *   · güçlendirici stoğunu yerelde tutar, oyunun isteğini onaylar ve harcananı
 *     sayar (seviye sonunda sunucuya tek seferde bildirilir);
 *   · oyun bitince sonucu sunucuya yazar (yıldız, jeton ya da can kaybı)
 *     ve Sonuç penceresini açar;
 *   · seviyeden çıkmak isteyene "çıkarsan 1 can gider" diye sorar (türün
 *     alışık olunan kuralı).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { confirmAction } from "@/components/admin";
import { GameButton, ResultSheet } from "@/components/puzzle/LevelSheets";
import { ShopSheet } from "@/components/puzzle/sheets";
import { StageBackdrop } from "@/components/puzzle/StageBackdrop";
import { ConfettiBurst } from "@/components/game/Celebration";
import { Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { finishLevel, livesFor, type FinishResponse } from "@/lib/puzzle/api";
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
  const params = useLocalSearchParams<{ oyun?: string; seviye?: string; on?: string }>();
  const module = puzzleGame(params.oyun);
  const level = Math.max(1, Number(params.seviye) || 1);
  const preBoosters = useMemo(() => String(params.on || "").split(",").filter(Boolean), [params.on]);

  const query = usePuzzleMe();
  const me = query.data;

  /** Oyun içi stok: profil stoğu − seviye öncesi seçilenler − bu oyunda harcananlar. */
  const used = useRef<Record<string, number>>({});
  const [stock, setStock] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!me || stock) return;
    const next = { ...me.profile.boosters };
    for (const key of preBoosters) next[key] = Math.max(0, (next[key] ?? 0) - 1);
    setStock(next);
    used.current = Object.fromEntries(preBoosters.map((k) => [k, 1]));
  }, [me, preBoosters, stock]);

  const [shopOpen, setShopOpen] = useState(false);
  /** Oyun alanının ölçüsü: oyun bu alanı tam doldurur. */
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<{ res: PuzzleResult; server: FinishResponse | null } | null>(null);
  const finished = useRef(false);

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

  const report = useCallback(
    async (res: PuzzleResult) => {
      if (!module || finished.current) return;
      finished.current = true;
      try {
        const server = await finishLevel(module.key, {
          level,
          won: res.won,
          stars: res.won ? Math.max(1, res.stars) : 0,
          boosters_used: used.current,
        });
        cache(server.profile, server.game);
        setResult({ res, server });
      } catch (error) {
        toast.show({ message: errorText(error), tone: "danger" });
        setResult({ res, server: null });
      }
    },
    [cache, level, module, toast]
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
            paused={paused || shopOpen || result != null}
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

      <ConfettiBurst trigger={result?.res.won ? level : 0} count={24} />
      {result ? (
        <ResultSheet
          visible
          won={result.res.won}
          stars={result.res.stars}
          level={level}
          coins={result.server?.reward?.coins ?? 0}
          firstClear={Boolean(result.server?.reward?.firstClear)}
          summary={result.res.summary}
          livesLeft={lives}
          profile={gameProfile}
          game={module.key}
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
