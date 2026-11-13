/**
 * LİG YOLU ▸ OYUN HARİTASI — /lig-yolu/<oyun>
 *
 * Seviye yolu (LevelMap), tepede cüzdan şeridi. Düğüme dokununca Başlangıç
 * penceresi açılır (hedefler + seviye öncesi güçlendirici seçimi); "Oyna"
 * sunucuya sorar (seviye açık mı, can var mı) ve oyun ekranına geçer.
 *
 * `?sonraki=<seviye>`: sonuç penceresinden "Sıradaki seviye" / "Tekrar dene"
 * ile gelinince o seviyenin Başlangıç penceresi kendiliğinden açılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LevelMap } from "@/components/puzzle/LevelMap";
import { LevelStartSheet } from "@/components/puzzle/LevelSheets";
import { ShopSheet } from "@/components/puzzle/sheets";
import { WalletBar } from "@/components/puzzle/WalletBar";
import { EmptyState, ErrorState, SkeletonCard, Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { livesFor, startLevel } from "@/lib/puzzle/api";
import { MAP_COMMON, zoneOf } from "@/lib/puzzle/mapPalette";
import { puzzleGame } from "@/lib/puzzle/registry";
import type { PuzzleBoosterDef } from "@/lib/puzzle/types";
import { nextLevelOf, usePuzzleCache, usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, layout, radius, space, textScale, touchSlop, type } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export default function PuzzleMapScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const cache = usePuzzleCache();
  const params = useLocalSearchParams<{ oyun?: string; sonraki?: string }>();
  const module = puzzleGame(params.oyun);
  const query = usePuzzleMe();
  const me = query.data;
  const progress = module && me ? me.games[module.key] : undefined;

  const [level, setLevel] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [shop, setShop] = useState<"lives" | "all" | null>(null);
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  const [barH, setBarH] = useState(140);
  // Bu oyunun canları (her oyunun kendi 5 canı var).
  const profile = livesFor(me?.profile, module?.key);

  // Sonuç penceresinden dönüş: istenen seviyenin penceresi açık gelir.
  useEffect(() => {
    const wanted = Number(params.sonraki);
    if (wanted > 0 && progress && wanted <= nextLevelOf(progress)) {
      setLevel(wanted);
      router.setParams({ sonraki: "" });
    }
  }, [params.sonraki, progress, router]);

  const toggle = useCallback(
    (b: PuzzleBoosterDef) => {
      const stock = me?.profile.boosters[b.key] ?? 0;
      setSelected((cur) => {
        if (cur.includes(b.key)) return cur.filter((k) => k !== b.key);
        if (stock < 1) {
          setShop("all");
          return cur;
        }
        return [...cur, b.key];
      });
    },
    [me]
  );

  const play = useCallback(async () => {
    if (!module || level == null) return;
    setBusy(true);
    try {
      const res = await startLevel(module.key, level);
      cache(res.profile);
      const pre = selected.join(",");
      setLevel(null);
      setSelected([]);
      router.push({ pathname: "/lig-yolu/oyna", params: { oyun: module.key, seviye: String(level), on: pre, oturum: res.play ?? "" } });
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
      if ((error as { code?: string }).code === "NO_LIVES") setShop("lives");
    } finally {
      setBusy(false);
    }
  }, [cache, level, module, router, selected, toast]);

  if (!auth.user) return <Redirect href="/giris" />;
  if (!module) return <Redirect href="/lig-yolu" />;

  const zone = zoneOf((progress?.level ?? 0) + 1);

  return (
    <View style={[styles.screen, { backgroundColor: zone.ground[1] }]}>
      {query.isLoading ? (
        <View style={[styles.pad, { paddingTop: barH }]}>
          <SkeletonCard lines={6} />
        </View>
      ) : query.isError ? (
        <View style={[styles.fill, { paddingTop: barH }]}>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </View>
      ) : progress ? (
        <LevelMap cleared={progress.level} stars={progress.stars} onPlay={setLevel} contentTop={barH} />
      ) : (
        <View style={[styles.fill, { paddingTop: barH }]}>
          <EmptyState icon="game-controller-outline" title="Oyun yüklenemedi" />
        </View>
      )}

      {/* Oyun içi üst şerit: haritanın üstünde, sisli zemin */}
      <View style={styles.bar} pointerEvents="box-none" onLayout={(e) => setBarH(e.nativeEvent.layout.height)}>
        <LinearGradient colors={[MAP_COMMON.scrim, MAP_COMMON.scrimClear]} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[styles.barRow, { paddingTop: insets.top + space.xs }]}>
          <Touchable onPress={() => router.back()} hitSlop={touchSlop(40)} accessibilityLabel="Geri" style={styles.round} haptic="light">
            <Ionicons name="chevron-back" size={24} color={MAP_COMMON.white} />
          </Touchable>
          <View style={styles.titleBox}>
            <Text style={styles.title} numberOfLines={1} {...textScale.dense}>{module.title}</Text>
            <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
              {progress ? `${progress.level} seviye · ${progress.total_stars} yıldız` : module.tagline}
            </Text>
          </View>
          <Touchable onPress={() => router.push("/lig-yolu/siralama")} hitSlop={touchSlop(40)} accessibilityLabel="Sıralama" style={styles.round} haptic="light">
            <Ionicons name="podium" size={20} color={MAP_COMMON.white} />
          </Touchable>
        </View>
        <View style={styles.wallet}>
          <WalletBar profile={profile} onDark onCoins={() => setShop("all")} onLives={() => setShop("lives")} onStars={() => router.push("/kulup-sehri")} />
        </View>
      </View>

      {level != null && me ? (
        <LevelStartSheet
          visible
          onClose={() => {
            setLevel(null);
            setSelected([]);
          }}
          module={module}
          level={level}
          stock={me.profile.boosters}
          selected={selected}
          onToggleBooster={toggle}
          onPlay={play}
          busy={busy}
          lives={profile?.lives ?? 0}
          profile={profile}
        />
      ) : null}
      <ShopSheet visible={shop != null} onClose={() => setShop(null)} me={me} game={module.key} focus={shop === "lives" ? "lives" : null} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  bar: { position: "absolute", top: 0, left: 0, right: 0, paddingBottom: space.lg },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: layout.screenPadding },
  round: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: MAP_COMMON.scrim,
    borderWidth: 2,
    borderColor: MAP_COMMON.white,
  },
  titleBox: { flex: 1, alignItems: "center" },
  title: {
    ...type.h2,
    fontFamily: fonts.bold,
    color: MAP_COMMON.white,
    textShadowColor: MAP_COMMON.inkShadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  subtitle: { ...type.caption, color: MAP_COMMON.white, opacity: 0.85 },
  wallet: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  pad: { padding: layout.screenPadding },
});
