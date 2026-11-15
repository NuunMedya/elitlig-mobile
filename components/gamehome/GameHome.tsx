/**
 * OYUN ANA SAYFASI — her oyunun evi (sözleşme §6).
 *
 *   ┌ ‹ · can (sayaç) · jeton · yıldız · ayarlar ┐   ince, düz üst şerit
 *   │ çevrimdışı hapı · ince ilerleme satırı      │
 *   │                                             │
 *   │          harita / sahne (tam ekran)         │
 *   │                                             │
 *   │  [Ödüller]   [Sıralama]   [Diğer]           │   en çok 3 etiketli çip
 *   └  [        Bölüm 24  · ZOR        ]         ┘   tek odak: OYNA
 *
 * 2026-11 SADELEŞTİRME: dört yanda yüzen yedi parlak düğme haritanın
 * üstüne biniyor, etiketleri dekora ve düğümlere çarpıyordu; hepsi tek çip
 * satırına indi. "Ödüller" günlük hediye + reklamla ödül + çarkı, "Diğer"
 * mağaza + seri + kuralları açar. Nokta yalnız alınacak ödül varken.
 *
 * Arka plan (harita ya da sahne) `background` ile gelir ve tam ekrandır;
 * üst ve alt şerit onun üstünde hafif sisli zeminde durur. Can kapısı burada:
 * canı biten oyuncu OYNA'ya basınca oyun değil can penceresi açılır.
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

import { HomeActions, HomeTopBar, PlayButton, type Difficulty, type HomeAction } from "./GameHomeKit";
import { AdOffersSheet, LivesSheet, MoreSheet, RulesSheet, SettingsSheet, SpinSheet, StreakSheet } from "./HomeSheets";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

/** "Diğer" penceresine oyunun eklediği satır. */
export interface HomeSide {
  key: string;
  icon: HomeAction["icon"];
  label: string;
  sub?: string | null;
  onPress: () => void;
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
  /** "Diğer" penceresine ek satırlar. */
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
  const [sheet, setSheet] = useState<null | "lives" | "settings" | "rules" | "ads" | "spin" | "gift" | "streak" | "more">(null);
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
  const stars = me ? me.city?.stars.available ?? me.profile.stadium?.available ?? null : null;
  const dailyReady = Boolean(auth.user && me?.profile.daily?.available);
  const spinLeft = Boolean(lives.profile?.ads?.spin?.left);

  // En çok 3 çip. "Ödüller": canlı oyunda reklam/çark/hediye penceresi, Günün Testi'nde doğrudan günlük hediye.
  const actions: HomeAction[] = [
    ...(livesGame || auth.user
      ? [{ key: "rewards", icon: "gift" as const, label: "Ödüller", onPress: () => setSheet(livesGame ? "ads" : "gift"), dot: dailyReady || (Boolean(livesGame) && spinLeft) }]
      : []),
    { key: "board", icon: "podium", label: "Sıralama", onPress: onBoard },
    { key: "more", icon: "grid", label: "Diğer", onPress: () => setSheet("more") },
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
          onInsets?.(h, sizes.current.bottom);
        }}
      >
        <LinearGradient colors={GH.scrimTop} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[styles.topInner, { paddingTop: insets.top + space.sm, paddingLeft: insets.left + layout.screenPadding, paddingRight: insets.right + layout.screenPadding }]} pointerEvents="box-none">
          <HomeTopBar
            onBack={back}
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

      {/* Alt: çip satırı + OYNA */}
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
        <View style={[styles.bottomInner, { paddingBottom: insets.bottom + space.md, paddingLeft: insets.left + layout.screenPadding, paddingRight: insets.right + layout.screenPadding }]} pointerEvents="box-none">
          <HomeActions items={actions} />
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
        <AdOffersSheet
          visible={sheet === "ads"}
          onClose={() => setSheet(null)}
          game={livesGame}
          lives={lives}
          boosters={Boolean(adBoosters)}
          onSpin={() => setSheet("spin")}
          gift={auth.user ? { ready: dailyReady, onOpen: () => setSheet("gift") } : null}
        />
      ) : null}
      {livesGame ? <SpinSheet visible={sheet === "spin"} onClose={() => setSheet(null)} game={livesGame} lives={lives} /> : null}
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
      {auth.user ? <DailyRewardSheet visible={sheet === "gift"} onClose={() => setSheet(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GH.sceneSky[0] },
  top: { position: "absolute", top: 0, left: 0, right: 0 },
  topInner: { paddingBottom: space.xl, gap: space.sm },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  bottomInner: { paddingTop: space.xl, gap: space.md, alignItems: "stretch", alignSelf: "center", width: "100%", maxWidth: 480 },
});
