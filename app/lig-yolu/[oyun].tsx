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

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LevelMap } from "@/components/puzzle/LevelMap";
import { LevelStartSheet } from "@/components/puzzle/LevelSheets";
import { ShopSheet } from "@/components/puzzle/sheets";
import { WalletBar } from "@/components/puzzle/WalletBar";
import { EmptyState, ErrorState, ScreenHeader, SkeletonCard, toneColors, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { startLevel } from "@/lib/puzzle/api";
import { puzzleGame } from "@/lib/puzzle/registry";
import type { PuzzleBoosterDef } from "@/lib/puzzle/types";
import { nextLevelOf, usePuzzleCache, usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space } from "@/theme";

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
      router.push({ pathname: "/lig-yolu/oyna", params: { oyun: module.key, seviye: String(level), on: pre } });
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
      if ((error as { code?: string }).code === "NO_LIVES") setShop("lives");
    } finally {
      setBusy(false);
    }
  }, [cache, level, module, router, selected, toast]);

  const tone = useMemo(() => (module ? toneColors(module.tone).fg : colors.brand), [module]);

  if (!auth.user) return <Redirect href="/giris" />;
  if (!module) return <Redirect href="/lig-yolu" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={module.title}
        subtitle={progress ? `${progress.level} seviye geçildi · ${progress.total_stars} yıldız` : module.tagline}
        back
        bottom={
          <View style={styles.wallet}>
            <WalletBar
              profile={me?.profile}
              onCoins={() => setShop("all")}
              onLives={() => setShop("lives")}
              onStars={() => router.push("/lig-yolu/stadyum")}
            />
          </View>
        }
      />
      {query.isLoading ? (
        <View style={styles.pad}>
          <SkeletonCard lines={6} />
        </View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : progress ? (
        <LevelMap cleared={progress.level} stars={progress.stars} tone={tone} onPlay={setLevel} />
      ) : (
        <EmptyState icon="game-controller-outline" title="Oyun yüklenemedi" />
      )}

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
          lives={me.profile.lives}
        />
      ) : null}
      <ShopSheet visible={shop != null} onClose={() => setShop(null)} me={me} game={module.key} focus={shop === "lives" ? "lives" : null} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  wallet: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  pad: { padding: layout.screenPadding },
});
