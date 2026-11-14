/**
 * OYUN ANA SAYFASI — her oyunun Royal Match tarzı evi (sözleşme §6).
 *
 *   ┌ avatar · can (sayaç) · jeton (+) · yıldız · ayarlar ┐
 *   │ çevrimdışı hapı · etkinlik / sandık çubuğu          │
 *   │ (hediye)                                 (sıralama) │
 *   │ (reklam)        harita / sahne           (kurallar) │
 *   │ (çark)                                   (seri)     │
 *   │              seri tacı · ZOR rozeti                 │
 *   └          [   BÖLÜM 24   ]  büyük yeşil düğme       ┘
 *
 * Arka plan (harita ya da sahne) `background` ile gelir ve tam ekrandır;
 * üst ve alt şerit onun üstünde sisli zeminde durur. Can kapısı burada:
 * canı biten oyuncu OYNA'ya basınca oyun değil can penceresi açılır.
 * Pencereler (can, ayarlar, kurallar, reklamla ödül, çark, günlük hediye)
 * ana sayfanın kendisindedir; oyun yalnız `play` ve isteğe bağlı düğmeleri verir.
 */

import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DailyRewardSheet } from "@/components/city/DailyReward";
import { OfflinePill, requestOfflineFlush } from "@/components/offline/OfflineSync";
import { GH } from "@/lib/game/gameHomePalette";
import type { LifeGameKey, PuzzleStreak } from "@/lib/puzzle/api";
import { useGameLives } from "@/lib/puzzle/useGameLives";
import { usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { layout, space } from "@/theme";

import { HomeTopBar, PlayButton, SideButton, StreakCrowns, type Difficulty, type SideTone } from "./GameHomeKit";
import { AdOffersSheet, LivesSheet, RulesSheet, SettingsSheet, SpinSheet, StreakSheet } from "./HomeSheets";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export interface HomeSide {
  key: string;
  icon: React.ComponentProps<typeof SideButton>["icon"];
  label: string;
  tone: SideTone;
  onPress: () => void;
  badge?: string | number | null;
  dot?: boolean;
}

export interface GameHomeProps {
  title: string;
  /** Can kapısı ve can hapı için oyun (Günün Testi: null → can yok). */
  livesGame: LifeGameKey | null;
  background: React.ReactNode;
  /** Etkinlik / sandık çubuğu (üst şeridin altında). */
  eventBar?: React.ReactNode;
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
  /** Ek yan düğmeler (sağ sütunun sonuna). */
  extraRight?: HomeSide[];
  /** Üst ve alt şeridin ölçüsü (haritanın kaydırma boşluğu için). */
  onInsets?: (top: number, bottom: number) => void;
}

export function GameHome({ title, livesGame, background, eventBar, play, rules, starLine, onBoard, onShop, streak, adBoosters, extraRight, onInsets }: GameHomeProps) {
  const router = useRouter();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const me = usePuzzleMe().data;
  const lives = useGameLives(livesGame);
  const [sheet, setSheet] = useState<null | "lives" | "settings" | "rules" | "ads" | "spin" | "gift" | "streak">(null);
  const [topH, setTopH] = useState(0);
  // Ölçüler ref'te de tutulur: iki onLayout aynı karede gelince eski değer okunmasın.
  const sizes = useRef({ top: 0, bottom: 0 });

  // Oyun ana sayfasına girince bekleyen çevrimdışı sonuçlar gönderilir.
  useFocusEffect(
    useCallback(() => {
      requestOfflineFlush();
    }, []),
  );

  const gated = Boolean(livesGame && lives.tracked && lives.lives < 1);
  const onPlay = useCallback(() => {
    if (gated) setSheet("lives");
    else play.onPress();
  }, [gated, play]);

  const back = useCallback(() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/oyunlar")), [router]);
  const name = auth.user?.fullName || auth.user?.username || "";
  const initials = name
    ? name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toLocaleUpperCase("tr-TR"))
        .join("")
    : null;
  const stars = me ? me.city?.stars.available ?? me.profile.stadium?.available ?? null : null;
  const dailyReady = Boolean(me?.profile.daily?.available);

  const left: HomeSide[] = [
    ...(auth.user ? [{ key: "gift", icon: "gift" as const, label: "Hediye", tone: "gift" as const, onPress: () => setSheet("gift"), dot: dailyReady }] : []),
    ...(livesGame
      ? [
          { key: "ad", icon: "play-circle" as const, label: "Ücretsiz", tone: "ad" as const, onPress: () => setSheet("ads"), dot: Boolean(lives.profile?.ads?.booster?.left || lives.profile?.ads?.life?.left) },
          { key: "spin", icon: "sync-circle" as const, label: "Çark", tone: "spin" as const, onPress: () => setSheet("spin"), badge: lives.profile?.ads?.spin?.left || null },
        ]
      : []),
  ];
  const right: HomeSide[] = [
    { key: "board", icon: "podium", label: "Sıralama", tone: "board", onPress: onBoard },
    ...(onShop ? [{ key: "shop", icon: "flash" as const, label: "Mağaza", tone: "shop" as const, onPress: onShop }] : []),
    ...(streak !== undefined ? [{ key: "streak", icon: "trophy" as const, label: "Seri", tone: "streak" as const, onPress: () => setSheet("streak"), badge: streak?.tier || null }] : []),
    { key: "rules", icon: "book", label: "Kurallar", tone: "rules", onPress: () => setSheet("rules") },
    ...(extraRight ?? []),
  ];

  return (
    <View style={styles.screen}>
      <View style={StyleSheet.absoluteFill}>{background}</View>

      {/* Üst şerit */}
      <View
        style={styles.top}
        pointerEvents="box-none"
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          sizes.current.top = h;
          setTopH(h);
          onInsets?.(h, sizes.current.bottom);
        }}
      >
        <LinearGradient colors={GH.scrimTop} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[styles.topInner, { paddingTop: insets.top + space.xs }]} pointerEvents="box-none">
          <HomeTopBar
            onBack={back}
            initials={initials}
            coins={me ? me.profile.coins : null}
            onCoins={onShop ?? (auth.user ? () => router.push("/kulup-sehri") : undefined)}
            lives={livesGame ? { lives: lives.lives, max: lives.max, label: lives.label } : null}
            onLives={livesGame ? () => setSheet("lives") : undefined}
            stars={stars}
            onStars={auth.user ? () => router.push("/kulup-sehri") : undefined}
            onSettings={() => setSheet("settings")}
          />
          <OfflinePill />
          {eventBar}
        </View>
      </View>

      {/* Yan düğmeler */}
      <View style={[styles.sideCol, styles.sideLeft, { top: topH + space.sm }]} pointerEvents="box-none">
        {left.map((b) => (
          <SideButton key={b.key} icon={b.icon} label={b.label} tone={b.tone} onPress={b.onPress} badge={b.badge} dot={b.dot} />
        ))}
      </View>
      <View style={[styles.sideCol, styles.sideRight, { top: topH + space.sm }]} pointerEvents="box-none">
        {right.map((b) => (
          <SideButton key={b.key} icon={b.icon} label={b.label} tone={b.tone} onPress={b.onPress} badge={b.badge} dot={b.dot} />
        ))}
      </View>

      {/* Alt: seri taçları + büyük düğme */}
      <View
        style={styles.bottom}
        pointerEvents="box-none"
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          sizes.current.bottom = h;
          onInsets?.(sizes.current.top, h);
        }}
      >
        <LinearGradient colors={GH.scrimBottom} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[styles.bottomInner, { paddingBottom: insets.bottom + space.md }]} pointerEvents="box-none">
          {streak ? <StreakCrowns tier={streak.tier} /> : null}
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
        <AdOffersSheet visible={sheet === "ads"} onClose={() => setSheet(null)} game={livesGame} lives={lives} boosters={Boolean(adBoosters)} onSpin={() => setSheet("spin")} />
      ) : null}
      {livesGame ? <SpinSheet visible={sheet === "spin"} onClose={() => setSheet(null)} game={livesGame} lives={lives} /> : null}
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
      {auth.user ? <DailyRewardSheet visible={sheet === "gift"} onClose={() => setSheet(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GH.sceneSky[0] },
  top: { position: "absolute", top: 0, left: 0, right: 0 },
  topInner: { paddingHorizontal: layout.screenPadding, paddingBottom: space.lg, gap: space.sm },
  sideCol: { position: "absolute", gap: space.md },
  sideLeft: { left: space.xs },
  sideRight: { right: space.xs },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  bottomInner: { paddingTop: space.xl, paddingHorizontal: layout.screenPadding, gap: space.sm, alignItems: "center" },
});
