/**
 * LİG YOLU ▸ OYUN ANA SAYFASI — /lig-yolu/<oyun> (sözleşme §6)
 *
 * Oyun evi (v3): üstte renkli HUD kapsülleri (can · jeton · yıldız) ve
 * yıldız sandığı şeridi; arkada mekân mekân değişen resimli harita
 * (LevelMap; mekân sırası oyuna göre döner); solda günlük ödüller rafı
 * (Hediye · Çark · Sandık · Penaltı), sağda araçlar (Sıralama · Mağaza ·
 * Diğer); altta tek odak yeşil "Bölüm N" (her 5. "Zor", her 10. "Süper Zor").
 * Düğüme ya da düğmeye basınca Başlangıç penceresi açılır
 * (hedefler + seviye öncesi güçlendirici + seri hediyesi); "Oyna" sunucuya
 * sorar (bölüm açık mı, can var mı) ve oyun ekranına geçer.
 *
 * ÇEVRİMDIŞI (§7): sunucuya ulaşılamazsa kilit ve can cihaz aynasından
 * denetlenir, oyun jetonsuz başlar (`cevrimdisi=1`); sonuç kuyruğa yazılır.
 *
 * `?sonraki=<seviye>`: sonuç penceresinden "Sıradaki seviye" / "Tekrar dene"
 * ile gelinince o seviyenin Başlangıç penceresi kendiliğinden açılır.
 */

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { GameHome } from "@/components/gamehome/GameHome";
import { difficultyOf } from "@/components/gamehome/GameHomeKit";
import { LevelMap, tierOf } from "@/components/puzzle/LevelMap";
import { LevelStartSheet } from "@/components/puzzle/LevelSheets";
import { ShopSheet } from "@/components/puzzle/sheets";
import { EmptyState, ErrorState, SkeletonCard, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { isOfflineError } from "@/lib/offline/net";
import { livesFor, startLevel } from "@/lib/puzzle/api";
import { zoneOf } from "@/lib/puzzle/mapPalette";
import { puzzleGame } from "@/lib/puzzle/registry";
import type { PuzzleBoosterDef } from "@/lib/puzzle/types";
import { nextLevelOf, usePuzzleCache, usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { layout } from "@/theme";

export default function PuzzleHomeScreen() {
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
  const [insets, setInsets] = useState({ top: 100, bottom: 150, side: 80 });
  // Bu oyunun canları (her oyunun kendi 5 canı var).
  const profile = livesFor(me?.profile, module?.key);
  const streak = module ? me?.profile.gifts?.streaks?.[module.key] : undefined;

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
    const pre = selected.join(",");
    const go = (extra: Record<string, string>) => {
      setLevel(null);
      setSelected([]);
      router.push({ pathname: "/lig-yolu/oyna", params: { oyun: module.key, seviye: String(level), on: pre, ...extra } });
    };
    try {
      const res = await startLevel(module.key, level);
      cache(res.profile);
      // Seri hediyesi: bu bölümde ücretsiz güçlendiriciler (stoktan düşmez).
      const gift = Object.entries(res.streak_boosters ?? {}).flatMap(([k, n]) => Array.from({ length: Math.max(0, n) }, () => k));
      go({ oturum: res.play ?? "", hediye: gift.join(",") });
    } catch (error) {
      if (isOfflineError(error)) {
        // Çevrimdışı: kilit ve can aynadan.
        const open = level <= nextLevelOf(progress);
        if (!open) toast.show({ message: "Bu bölüm henüz açılmadı.", tone: "warn" });
        else if ((profile?.lives ?? 0) < 1) setShop("lives");
        else go({ oturum: "", cevrimdisi: "1" });
      } else {
        toast.show({ message: errorText(error), tone: "danger" });
        if ((error as { code?: string }).code === "NO_LIVES") setShop("lives");
      }
    } finally {
      setBusy(false);
    }
  }, [cache, level, module, profile?.lives, progress, router, selected, toast]);

  const onInsets = useCallback((top: number, bottom: number, side: number) => {
    setInsets((cur) => (Math.abs(cur.top - top) < 2 && Math.abs(cur.bottom - bottom) < 2 && cur.side === side ? cur : { top, bottom, side }));
  }, []);

  if (!auth.user) return <Redirect href="/giris" />;
  if (!module) return <Redirect href="/lig-yolu" />;

  const next = nextLevelOf(progress);
  const zone = zoneOf(next, module.key);
  const initials = (auth.user.fullName || auth.user.username || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase("tr-TR"))
    .join("");
  const chest = me?.profile.gifts?.star_chest;
  const diff = difficultyOf(next);

  const background = query.isLoading ? (
    <View style={[styles.pad, { paddingTop: insets.top, backgroundColor: zone.ground[1] }]}>
      <SkeletonCard lines={6} />
    </View>
  ) : query.isError ? (
    <View style={[styles.fill, { paddingTop: insets.top, backgroundColor: zone.ground[1] }]}>
      <ErrorState error={query.error} onRetry={() => query.refetch()} />
    </View>
  ) : progress ? (
    <LevelMap
      cleared={progress.level}
      stars={progress.stars}
      onPlay={setLevel}
      contentTop={insets.top}
      contentBottom={insets.bottom}
      avatar={initials || null}
      game={module.key}
      side={insets.side}
    />
  ) : (
    <View style={[styles.fill, { paddingTop: insets.top, backgroundColor: zone.ground[1] }]}>
      <EmptyState icon="game-controller-outline" title="Oyun yüklenemedi" />
    </View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: zone.ground[0] }]}>
      <GameHome
        title={module.title}
        livesGame={module.key}
        background={background}
        onInsets={onInsets}
        starChest={chest ?? null}
        play={{
          title: `Bölüm ${next}`,
          sub: progress ? `${tierOf(next)} · ${progress.total_stars} yıldız` : module.tagline,
          difficulty: diff,
          onPress: () => setLevel(next),
          disabled: !progress,
          accessibilityLabel: `${next}. bölümü oyna${diff === "super" ? ", süper zor" : diff === "hard" ? ", zor" : ""}`,
        }}
        rules={[module.tagline, "Her bölümde hedefi hamle ya da süre bitmeden tamamla; kalan paya göre 1–3 yıldız.", "Bölüm öncesi güçlendirici seç; oyunda canlı güçlendiricileri kullan."]}
        starLine="Bölüm başına 1–3 yıldız + ilk geçişte bölüm primi. Her 10 bölümde bir bölüm sandığı."
        onBoard={() => router.push("/lig-yolu/siralama")}
        onShop={() => setShop("all")}
        streak={streak ?? null}
        adBoosters
      />

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
          streak={streak}
        />
      ) : null}
      <ShopSheet visible={shop != null} onClose={() => setShop(null)} me={me} game={module.key} focus={shop === "lives" ? "lives" : null} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { flex: 1, padding: layout.screenPadding },
});
