/**
 * LİG YOLU ▸ OYUN EKRANI — /lig-yolu/oyna?oyun=<anahtar>&seviye=<n>&on=<güçlendiriciler>
 *
 * Çerçeve ile oyun arasındaki köprü:
 *   · oyunun Game bileşenini çizer (tahta + oyunun kendi hedef çubuğu);
 *   · güçlendirici stoğunu yerelde tutar, oyunun isteğini onaylar ve harcananı
 *     sayar (seviye sonunda sunucuya tek seferde bildirilir);
 *   · oyun bitince sonucu sunucuya yazar (yıldız, jeton, XP ya da can kaybı)
 *     ve Sonuç penceresini açar;
 *   · seviyeden çıkmak isteyene "çıkarsan 1 can gider" diye sorar (türün
 *     alışık olunan kuralı).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { confirmAction } from "@/components/admin";
import { ResultSheet } from "@/components/puzzle/LevelSheets";
import { ShopSheet } from "@/components/puzzle/sheets";
import { StageBackdrop } from "@/components/puzzle/StageBackdrop";
import { Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { finishLevel, type FinishResponse } from "@/lib/puzzle/api";
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
  const { width } = useWindowDimensions();
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
  const goToMap = (next?: number) =>
    router.replace({ pathname: "/lig-yolu/[oyun]", params: { oyun: module.key, ...(next ? { sonraki: String(next) } : {}) } });

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <StageBackdrop />
      <View style={styles.top}>
        <Touchable onPress={() => void leave()} hitSlop={touchSlop(28)} accessibilityLabel="Seviyeden çık" style={styles.close}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Touchable>
        <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
          {module.title} · {level}. seviye
        </Text>
        <Touchable onPress={() => setPaused((p) => !p)} hitSlop={touchSlop(28)} accessibilityLabel={paused ? "Devam et" : "Duraklat"} style={styles.close}>
          <Ionicons name={paused ? "play" : "pause"} size={22} color={colors.textPrimary} />
        </Touchable>
      </View>

      {stock ? (
        <View style={styles.board}>
          <Game
            key={`${module.key}-${level}`}
            level={level}
            maxWidth={Math.min(width - layout.screenPadding * 2, 520)}
            preBoosters={preBoosters}
            boosterStock={stock}
            useBooster={useBooster}
            onFinish={(res) => void report(res)}
            paused={paused || shopOpen || result != null}
          />
        </View>
      ) : null}

      {paused && !shopOpen && !result ? (
        <View style={styles.pauseLayer}>
          <View style={styles.pauseCard}>
            <Ionicons name="pause-circle" size={48} color={colors.brandAccent} />
            <Text style={styles.pauseText} {...textScale.dense}>Oyun duraklatıldı</Text>
            <Touchable onPress={() => setPaused(false)} style={styles.resume} accessibilityRole="button">
              <Text style={styles.resumeText} {...textScale.dense}>Devam et</Text>
            </Touchable>
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

      {result ? (
        <ResultSheet
          visible
          won={result.res.won}
          stars={result.res.stars}
          level={level}
          coins={result.server?.reward?.coins ?? 0}
          xp={result.server?.reward?.xp ?? 0}
          firstClear={Boolean(result.server?.reward?.firstClear)}
          summary={result.res.summary}
          livesLeft={result.server?.profile.lives ?? me?.profile.lives ?? 0}
          onNext={() => goToMap(level + 1)}
          onRetry={() => goToMap(level)}
          onMap={() => goToMap()}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: layout.screenPadding, paddingVertical: space.sm },
  close: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  title: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary, flex: 1, textAlign: "center" },
  board: { flex: 1, alignItems: "center", paddingHorizontal: layout.screenPadding },
  pauseLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
  pauseCard: { alignItems: "center", gap: space.md, padding: space.xl, borderRadius: radius.xxl, backgroundColor: colors.surface1 },
  pauseText: { ...type.h3, color: colors.textPrimary },
  resume: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill, backgroundColor: colors.brand },
  resumeText: { ...type.label, color: colors.textOnBrand },
});
