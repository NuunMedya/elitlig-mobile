/**
 * OYUN ANA SAYFASI — her oyunun evi (sözleşme §6).
 *
 *   ┌ ‹ · [♥ 4 12:31] [● 3.650 +] [★ 136] · ⚙ ┐   renkli HUD kapsülleri
 *   │ [▣ Yıldız sandığı ███████░░ 16/40]        │   etkinlik şeridi
 *   │ [Hediye]                       [Sıralama] │
 *   │ [Çark]      harita / sahne     [Mağaza]   │   yan raflar: SOL ödüller
 *   │ [Sandık]     (tam ekran)       [Diğer]    │   (mor/pembe), SAĞ araçlar
 *   │ [Penaltı]                                 │   (mavi/camgöbeği)
 *   │        (bilgi kartları: sonsuz oyunlar)   │
 *   └ [ ZOR ][        Bölüm 24          ▶ ]     ┘   tek odak: yeşil OYNA
 *
 * 2026-11 v3: v2'nin alt çip satırı ("Ödüller · Sıralama · Diğer") ve düz
 * yüzeyleri gitti. Gerçek günlük ödüller (Çark · Sandık Seç · Günün
 * Penaltısı · Günlük hediye) sol rafta, rozet YALNIZ alınabilir ödülde;
 * araçlar sağ rafta. Raflar harita düğümlerinin yolundan uzak durur
 * (`sideSafe` haritaya iletilir) ve kısa ekranda küçülür.
 *
 * Arka plan (harita ya da sahne) `background` ile gelir ve tam ekrandır.
 * Can kapısı burada: canı biten oyuncu OYNA'ya basınca can penceresi açılır.
 */

import type Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DailyRewardSheet } from "@/components/city/DailyReward";
import { OfflinePill, requestOfflineFlush } from "@/components/offline/OfflineSync";
import { GH } from "@/lib/game/gameHomePalette";
import type { LifeGameKey, PuzzleStreak } from "@/lib/puzzle/api";
import { useGameLives } from "@/lib/puzzle/useGameLives";
import { usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { layout, space } from "@/theme";

import { EventStrip, HomeTopBar, PlayButton, RailButton, railHeight, type Difficulty, type RailItem } from "./GameHomeKit";
import { AdOffersSheet, LivesSheet, MoreSheet, RulesSheet, SettingsSheet, StreakSheet } from "./HomeSheets";
import { ChestPickSheet, PenaltySheet, StarChestSheet, WheelSheet, useRewards, useStarChestOpened } from "./Rewards";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

/** "Diğer" penceresine oyunun eklediği satır. */
export interface HomeSide {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string | null;
  onPress: () => void;
}

/** Ekran ölçüleri: üst/alt şerit ve yan rafların kapladığı genişlik. */
export interface HomeInsets {
  top: number;
  bottom: number;
  /** Bir yan rafın sol/sağ kenardan kapladığı genişlik (harita düğümleri bunun içine girmez). */
  side: number;
}

export interface GameHomeProps {
  title: string;
  /** Can kapısı ve can hapı için oyun (Günün Testi: null → can yok). */
  livesGame: LifeGameKey | null;
  background: React.ReactNode;
  /** Etkinlik şeridi yerine özel içerik (yoksa `starChest` şeridi). */
  eventBar?: React.ReactNode;
  /** Yıldız sandığı ilerlemesi (bölümlü oyunlar): şerit + açılış animasyonu. */
  starChest?: { progress: number; every: number; opened: number } | null;
  /** OYNA'nın hemen üstünde (sonsuz oyunlarda bilgi kartları). */
  abovePlay?: React.ReactNode;
  play: { title: string; sub?: string | null; difficulty?: Difficulty; onPress: () => void; busy?: boolean; disabled?: boolean; accessibilityLabel?: string };
  rules: string[];
  starLine: string;
  onBoard: () => void;
  /** Güçlendirici mağazası (bölümlü oyunlar); yoksa düğme yok. */
  onShop?: () => void;
  /** Bölümlü oyunlarda seri (taçlar + pencere). */
  streak?: PuzzleStreak | null;
  /** Ücretsiz güçlendirici reklamı gösterilsin mi (bölümlü). */
  adBoosters?: boolean;
  /** "Diğer" penceresine ek satırlar. */
  extraRight?: HomeSide[];
  /** Şerit ve raf ölçüleri (haritanın kaydırma boşluğu, sahnenin yerleşimi). */
  onInsets?: (top: number, bottom: number, side: number) => void;
}

/** Raf düğmesi boyu: boş dikey alana göre 44–56. */
function railSize(free: number, count: number, width: number) {
  const max = width < 360 ? 48 : 56;
  for (let s = max; s > 40; s -= 2) if (count * railHeight(s) + (count - 1) * space.s <= free) return s;
  return 40;
}

export function GameHome({ title, livesGame, background, eventBar, starChest, abovePlay, play, rules, starLine, onBoard, onShop, streak, adBoosters, extraRight, onInsets }: GameHomeProps) {
  const router = useRouter();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const me = usePuzzleMe().data;
  const lives = useGameLives(livesGame);
  const rewards = useRewards();
  const [sheet, setSheet] = useState<null | "lives" | "settings" | "rules" | "ads" | "wheel" | "chest" | "penalty" | "gift" | "streak" | "more" | "star">(null);
  const [bars, setBars] = useState({ top: 120, bottom: 110 });
  // Ölçüler ref'te de tutulur: iki onLayout aynı karede gelince eski değer okunmasın.
  const sizes = useRef({ top: 0, bottom: 0, side: 0 });

  // Oyun ana sayfasına girince bekleyen çevrimdışı sonuçlar gönderilir.
  useFocusEffect(
    useCallback(() => {
      requestOfflineFlush();
    }, []),
  );

  const chestOpened = useStarChestOpened(starChest?.opened);
  const gated = Boolean(livesGame && lives.tracked && lives.lives < 1);
  const onPlay = useCallback(() => {
    if (gated) setSheet("lives");
    else play.onPress();
  }, [gated, play]);

  const back = useCallback(() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/oyunlar")), [router]);
  const stars = me ? me.city?.stars.available ?? me.profile.stadium?.available ?? null : null;
  const signedIn = Boolean(auth.user);
  const dailyReady = Boolean(signedIn && me?.profile.daily?.available);
  const game = livesGame;

  const left: RailItem[] = [
    { key: "gift", kind: "gift", label: "Hediye", onPress: () => setSheet("gift"), badge: dailyReady },
    { key: "wheel", kind: "wheel", label: "Çark", onPress: () => setSheet("wheel"), badge: Boolean(rewards?.wheel.free) },
    { key: "chest", kind: "chest", label: "Sandık", onPress: () => setSheet("chest"), badge: Boolean(rewards?.chest.available) },
    { key: "penalty", kind: "penalty", label: "Penaltı", onPress: () => setSheet("penalty"), badge: Boolean(rewards?.penalty.available) },
  ];
  const right: RailItem[] = [
    { key: "board", kind: "board", label: "Sıralama", onPress: onBoard },
    ...(onShop ? [{ key: "shop", kind: "shop" as const, label: "Mağaza", onPress: onShop }] : []),
    { key: "more", kind: "more", label: "Diğer", onPress: () => setSheet("more") },
  ];

  const free = height - bars.top - bars.bottom - space.md * 2;
  const rs = railSize(free, left.length, width);
  const side = rs + 8 + 12 + space.sm;
  const report = useCallback(() => {
    const s = sizes.current;
    onInsets?.(s.top, s.bottom, s.side);
    setBars((cur) => (Math.abs(cur.top - s.top) < 2 && Math.abs(cur.bottom - s.bottom) < 2 ? cur : { top: s.top, bottom: s.bottom }));
  }, [onInsets]);
  useEffect(() => {
    sizes.current.side = side;
    report();
  }, [report, side]);

  return (
    <View style={styles.screen}>
      <View style={StyleSheet.absoluteFill}>{background}</View>

      {/* Üst şerit */}
      <View
        style={styles.top}
        pointerEvents="box-none"
        onLayout={(e) => {
          sizes.current.top = e.nativeEvent.layout.height;
          report();
        }}
      >
        <LinearGradient colors={GH.scrimTop} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[styles.topInner, { paddingTop: insets.top + space.sm, paddingLeft: insets.left + space.md, paddingRight: insets.right + space.md }]} pointerEvents="box-none">
          <HomeTopBar
            onBack={back}
            coins={me ? me.profile.coins : null}
            onCoins={onShop ?? (signedIn ? () => router.push("/kulup-sehri") : undefined)}
            lives={livesGame ? { lives: lives.lives, max: lives.max, label: lives.label } : null}
            onLives={livesGame ? () => setSheet("lives") : undefined}
            stars={stars}
            onStars={signedIn ? () => router.push("/kulup-sehri") : undefined}
            onSettings={() => setSheet("settings")}
          />
          <OfflinePill />
          {eventBar ??
            (starChest ? (
              <EventStrip
                title="Yıldız Sandığı"
                sub={width >= 360 ? "Her 40 yıldızda bir sandık" : null}
                value={starChest.progress}
                max={starChest.every}
                ready={starChest.progress >= starChest.every * 0.75}
                onPress={() => setSheet("star")}
              />
            ) : null)}
        </View>
      </View>

      {/* Yan raflar: SOL ödüller, SAĞ araçlar */}
      <View pointerEvents="box-none" style={[styles.rail, { top: bars.top + space.xs, left: insets.left + space.xs }]}>
        {left.map((it, i) => (
          <RailButton key={it.key} item={it} size={rs} delay={i * 240} />
        ))}
      </View>
      <View pointerEvents="box-none" style={[styles.rail, { top: bars.top + space.xs, right: insets.right + space.xs }]}>
        {right.map((it) => (
          <RailButton key={it.key} item={it} size={rs} />
        ))}
      </View>

      {/* Alt: (bilgi kartları) + OYNA */}
      <View
        style={styles.bottom}
        pointerEvents="box-none"
        onLayout={(e) => {
          sizes.current.bottom = e.nativeEvent.layout.height;
          report();
        }}
      >
        <LinearGradient colors={GH.scrimBottom} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[styles.bottomInner, { paddingBottom: insets.bottom + space.md, paddingLeft: insets.left + layout.screenPadding, paddingRight: insets.right + layout.screenPadding }]} pointerEvents="box-none">
          {abovePlay}
          <PlayButton
            title={gated ? "CAN YOK" : play.title}
            sub={gated ? (lives.label ? `Sıradaki can ${lives.label}` : "Canını doldur") : play.sub}
            difficulty={gated ? null : play.difficulty}
            onPress={onPlay}
            busy={play.busy}
            disabled={play.disabled}
            accessibilityLabel={gated ? "Canın kalmadı, can penceresini aç" : play.accessibilityLabel}
          />
        </View>
      </View>

      {livesGame ? <LivesSheet visible={sheet === "lives"} onClose={() => setSheet(null)} game={livesGame} lives={lives} title={title} /> : null}
      {livesGame ? (
        <AdOffersSheet visible={sheet === "ads"} onClose={() => setSheet(null)} game={livesGame} lives={lives} boosters={Boolean(adBoosters)} onSpin={() => setSheet("wheel")} gift={signedIn ? { ready: dailyReady, onOpen: () => setSheet("gift") } : null} />
      ) : null}
      <WheelSheet visible={sheet === "wheel"} onClose={() => setSheet(null)} game={game} />
      <ChestPickSheet visible={sheet === "chest"} onClose={() => setSheet(null)} game={game} />
      <PenaltySheet visible={sheet === "penalty"} onClose={() => setSheet(null)} game={game} />
      <StarChestSheet
        visible={sheet === "star" || chestOpened.fresh}
        opening={chestOpened.fresh}
        onClose={() => {
          chestOpened.seen();
          setSheet(null);
        }}
      />
      <MoreSheet
        visible={sheet === "more"}
        onClose={() => setSheet(null)}
        title={title}
        onShop={
          onShop
            ? () => {
                setSheet(null);
                onShop();
              }
            : undefined
        }
        onAds={livesGame && signedIn ? () => setSheet("ads") : undefined}
        streak={streak === undefined ? undefined : streak}
        onStreak={() => setSheet("streak")}
        onRules={() => setSheet("rules")}
        extra={(extraRight ?? []).map((x) => ({
          ...x,
          onPress: () => {
            setSheet(null);
            x.onPress();
          },
        }))}
      />
      <SettingsSheet
        visible={sheet === "settings"}
        onClose={() => setSheet(null)}
        onRules={() => setSheet("rules")}
        onBoard={() => {
          setSheet(null);
          onBoard();
        }}
      />
      <RulesSheet visible={sheet === "rules"} onClose={() => setSheet(null)} title={title} rules={rules} starLine={starLine} />
      <StreakSheet visible={sheet === "streak"} onClose={() => setSheet(null)} streak={streak ?? undefined} />
      {signedIn ? <DailyRewardSheet visible={sheet === "gift"} onClose={() => setSheet(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GH.sceneSky[0] },
  top: { position: "absolute", top: 0, left: 0, right: 0 },
  topInner: { paddingBottom: space.md, gap: space.sm },
  rail: { position: "absolute", gap: space.s, alignItems: "center" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  bottomInner: { paddingTop: space.md, gap: space.sm, alignItems: "stretch", alignSelf: "center", width: "100%", maxWidth: 480 },
});
