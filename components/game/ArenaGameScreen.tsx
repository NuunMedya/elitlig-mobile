/**
 * ARENA OYUN EKRANI — WebView oyunlarının (penaltı, slalom, top sektir, savunma
 * hattı, kadro koşusu) ORTAK kabuğu.
 *
 * Oyunun kendisi `WebGame` içindeki Canvas'tadır (bkz. games/*.js). Bu dosya
 * yalnız oyunun ÇEVRESİNİ çizer ve bütün oyunlarda birebir aynıdır:
 *   · Başlık YOK: oyun ekranın tamamını kaplar (oyunun içinde hissi). Sağ
 *     üstte yuvarlak DURDUR düğmesi; basınca oyun durur ve mola kartı açılır:
 *     Devam et · Oyundan çık · ses · rekor tablosu. Android geri tuşu da
 *     mola kartını açar. Oyun HUD'u bu köşeyi boş bırakır (hudInset).
 *   · Giriş kartı: kurallar, kişisel rekor, "Başla". Arkada oyun vitrin
 *     modunda canlı oynar — kart boş bir zeminin üstünde durmaz.
 *   · Bitiş kartı: skor, yeni rekor rozeti, tur istatistikleri, skorun rekor
 *     tablosuna gönderimi ve TABLONUN KENDİSİ (Türkiye geneli, haftalık / tüm
 *     zamanlar, ilk 5 + senin sıran). Oyuncu kimi geçtiğini, kime yetişmek
 *     için kaç puan gerektiğini oyundan çıkmadan görür.
 *   · Misafir oyuncu: "Giriş yap" → giriş ekranından dönünce skor KENDİLİĞİNDEN
 *     gönderilir; tur kaybolmaz.
 *
 * Ekran odaktan çıkınca (başka sayfaya geçiş) oyun duraklar, dönünce sürer.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { BackHandler, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ArenaResultCard, ArenaShareSheet, formatCount, SCORE_UNIT, useArenaScore } from "@/components/game/ArenaResult";
import { useGameRoster } from "@/components/game/useGameRoster";
import { WebGame, type GameOverPayload, type WebGameHandle } from "@/components/game/WebGame";
import { GameButton } from "@/components/puzzle/LevelSheets";
import { Touchable, useReduceMotion } from "@/components/ui";
import { CARTOON } from "@/lib/game/cartoon";
import { ARENA_CARD } from "@/lib/game/arenaPalette";
import { getPlayerCareer } from "@/lib/api/career";
import { useGameSave, type SaveData } from "@/lib/puzzle/saves";
import type { WebGameKey } from "@/lib/game/web/games.generated";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, fonts, radius, space, textScale, touchSlop, type, upperTR } from "@/theme";

/* ============================ SÖZLEŞME ============================ */

export interface ArenaGameRule {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}

export interface ArenaGameConfig {
  /** Arena oyunu (Kulüp Şehri sahnesi `sehir` bir oyun değildir). */
  game: Exclude<WebGameKey, "sehir">;
  title: string;
  /** Başlığın altındaki tek satır. */
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Giriş kartındaki 3–4 kısa kural. */
  rules: ArenaGameRule[];
  /**
   * ESKİ cihaz rekor anahtarı (ARENA_BEST_KEYS). Rekor artık hesabın oyun
   * kaydındadır (lib/puzzle/saves `bests`, oyun adıyla); bu anahtar yalnız
   * ilk geçişte taşınır ve okunmaz.
   */
  bestKey?: string;
  /** Bitiş kartındaki istatistik satırı: "12 gol · Seviye 4". */
  describe: (stats: Record<string, number>) => string[];
  /** Tur kötü bittiğinde başlık ("Hakların bitti"). */
  overTitle: string;
  /** Paylaşım kartındaki meydan okuma. */
  taunt: string;
  /**
   * Bölümlü oyun (Savunma Hattı): bölüm sonu ekranı oyunun İÇİNDEDİR
   * (sonraki bölüm / tekrar / bölümler). Her bölüm sonunda skor sessizce
   * gönderilir ve yeni oturum açılır; kabuğun bitiş kartı açılmaz.
   */
  levelGame?: boolean;
}

type Phase = "loading" | "ready" | "playing" | "over";

const SOUND_KEY = "elitlig.arena.sound.v1";

/* ================================= EKRAN ================================= */

export function ArenaGameScreen({ config }: { config: ArenaGameConfig }) {
  const router = useRouter();
  const scope = useScope();
  const reduceMotion = useReduceMotion();
  const run = useArenaScore(config.game);
  const auth = useAuth();

  /* Kariyer avantajı (Elit Kart): bağlı oyuncunun gerçek istatistiklerinden
     gelen küçük oranlar oyuna iletilir. Yalnız penaltı bir avantaj okur. */
  const playerId = auth.user?.player_id ?? null;
  const careerQuery = useQuery({
    queryKey: ["career", "player", playerId],
    queryFn: () => getPlayerCareer(playerId as number),
    enabled: Boolean(playerId) && config.game === "penalti",
    staleTime: 10 * 60_000,
    retry: false,
  });
  const perks = careerQuery.data?.card.perks ?? null;

  /* Gerçek lig kadrosu (Penaltı: atıcı + kaleciler, Slalom: koşucu +
     rakip savunmalar). Gelmezse oyun varsayılan kadroyla oynanır. */
  const { roster, setup, changeLabel } = useGameRoster(config.game, scope.cityId ?? null, auth.user?.player_id ?? null);

  const game = useRef<WebGameHandle>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const phaseRef = useRef<Phase>("loading");
  const [result, setResult] = useState<GameOverPayload | null>(null);
  const [sound, setSound] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  /** Mola kartı açık mı (durdur düğmesi / geri tuşu). */
  const [menu, setMenu] = useState(false);

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => {
    AsyncStorage.getItem(SOUND_KEY).then((value) => {
      if (value === "0") setSound(false);
    });
  }, []);

  /* Ses / hareket tercihi oyuna her değiştiğinde iletilir. */
  useEffect(() => {
    game.current?.send({ type: "config", sound, reduceMotion, perks, roster, hudInset: HUD_INSET });
  }, [sound, reduceMotion, phase, perks, roster]);

  /* Odak: başka ekrana geçince oyun durur, dönünce sürer. */
  useFocusEffect(
    useCallback(() => {
      game.current?.send({ type: "resume" });
      return () => game.current?.send({ type: "pause" });
    }, []),
  );

  const { finish, reset } = run;
  const levelGame = Boolean(config.levelGame);
  const onOver = useCallback(
    (payload: GameOverPayload) => {
      if (phaseRef.current !== "playing") return;
      if (levelGame) {
        finish(payload.score, payload.stats);
        reset();
        return;
      }
      setResult(payload);
      setPhaseBoth("over");
      finish(payload.score, payload.stats);
    },
    [finish, reset, levelGame],
  );

  /* Oyunun kalıcı verisi (Savunma Hattı: açılan bölümler ve yıldızlar).
     WebView'in kendi depolaması kapalı; veri HESABA bağlı oyun kaydında
     durur (lib/puzzle/saves: cihaz önbelleği + sunucu) ve her değişince oyuna
     gönderilir — oyun kendi ilerlemesiyle birleştirir (büyüğü kalır). Sunucu
     kaydı geç gelirse (başka telefonda açılan bölümler) oyun açıkken de alınır. */
  const storeSave = useGameSave(config.game === "savunma" ? "savunma" : null);
  const storeRef = useRef<Record<string, unknown> | null>(null);
  storeRef.current = storeSave.data;
  useEffect(() => {
    if (storeSave.data) game.current?.send({ type: "config", store: storeSave.data });
  }, [storeSave.data]);
  const updateStore = storeSave.update;
  const onEvent = useCallback(
    (message: Record<string, unknown>) => {
      if (message.type === "store" && message.data && typeof message.data === "object") {
        updateStore(message.data as SaveData["savunma"]);
      }
    },
    [updateStore],
  );

  const onReady = useCallback(() => {
    if (storeRef.current) game.current?.send({ type: "config", store: storeRef.current });
    game.current?.send({ type: "config", sound, reduceMotion, perks, roster, hudInset: HUD_INSET });
    if (phaseRef.current === "loading") setPhaseBoth("ready");
  }, [sound, reduceMotion, perks, roster]);

  const start = () => {
    setResult(null);
    run.reset();
    setPhaseBoth("playing");
    game.current?.send({ type: "config", sound, reduceMotion, perks, roster });
    game.current?.send({ type: "start" });
  };

  const toggleSound = useCallback(() => {
    setSound((current) => {
      const next = !current;
      void AsyncStorage.setItem(SOUND_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const openBoard = useCallback(
    () => router.push({ pathname: "/siralama", params: { game: config.game } }),
    [router, config.game],
  );

  /* Mola: oyunu durdur, kartı aç. Oyun oynanmıyorsa (giriş / bitiş kartı)
     yalnız kart açılır. */
  const openMenu = useCallback(() => {
    if (phaseRef.current === "playing") game.current?.send({ type: "pause" });
    setMenu(true);
  }, []);
  const closeMenu = useCallback(() => {
    setMenu(false);
    if (phaseRef.current === "playing") game.current?.send({ type: "resume" });
  }, []);
  const exitGame = useCallback(() => {
    setMenu(false);
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/oyunlar");
  }, [router]);

  // Android geri tuşu: önce mola kartı; kart açıksa oyundan çıkar.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (menu) exitGame();
        else openMenu();
        return true;
      });
      return () => sub.remove();
    }, [menu, exitGame, openMenu]),
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>

      <View style={styles.arena}>
        <WebGame ref={game} game={config.game} onReady={onReady} onOver={onOver} onEvent={onEvent} />

        {phase === "loading" || phase === "ready" ? (
          <StartCard
            config={config}
            best={run.best}
            loading={phase === "loading"}
            onStart={start}
            onBoard={openBoard}
            setup={setup}
          />
        ) : null}

        {phase === "over" && result ? (
          <ArenaResultCard
            game={config.game}
            score={result.score}
            best={run.best}
            isRecord={run.isRecord}
            overTitle={config.overTitle}
            facts={config.describe(result.stats)}
            submit={run.submit}
            onRetrySubmit={run.retry}
            onSignIn={() => router.push("/giris")}
            onRestart={start}
            onBoard={openBoard}
            onShare={() => setShareOpen(true)}
            secondary={changeLabel ? { label: changeLabel, icon: "swap-horizontal", onPress: () => setPhaseBoth("ready") } : undefined}
            stars={run.stars}
            onCity={() => router.push("/kulup-sehri")}
          />
        ) : null}
        {/* Sağ üst: DURDUR — oyunun HUD'u bu köşeyi boş bırakır. */}
        <Touchable onPress={openMenu} hitSlop={touchSlop(44)} style={styles.pauseBtn} accessibilityRole="button" accessibilityLabel="Oyunu durdur" haptic="light">
          <Ionicons name="pause" size={20} color={CARTOON.white} />
        </Touchable>

        {menu ? (
          <View style={styles.menuLayer}>
            <View style={styles.menuWrap}>
              <View style={styles.menuCard} accessibilityViewIsModal>
                <View style={styles.menuHead} accessibilityRole="header">
                  <Text style={styles.menuOver} numberOfLines={1} {...textScale.badge}>
                    {upperTR(config.title)}
                  </Text>
                  <Text style={styles.menuTitle} {...textScale.badge}>
                    Mola
                  </Text>
                </View>
                <View style={styles.menuRow}>
                  <Touchable onPress={toggleSound} style={styles.menuIcon} accessibilityRole="button" accessibilityLabel={sound ? "Sesi kapat" : "Sesi aç"} haptic="light">
                    <Ionicons name={sound ? "volume-high" : "volume-mute"} size={22} color={CARTOON.navy} />
                  </Touchable>
                  <Touchable
                    onPress={() => {
                      setMenu(false);
                      openBoard();
                    }}
                    style={styles.menuIcon}
                    accessibilityRole="button"
                    accessibilityLabel="Rekor tablosu"
                    haptic="light"
                  >
                    <Ionicons name="trophy" size={22} color={CARTOON.navy} />
                  </Touchable>
                </View>
                <View style={styles.menuBtns}>
                  <GameButton label={phase === "playing" ? "DEVAM ET" : "KAPAT"} icon={phase === "playing" ? "play" : "close"} onPress={closeMenu} />
                  <GameButton label="OYUNDAN ÇIK" icon="exit-outline" tone="danger" small onPress={exitGame} />
                </View>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <ArenaShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        title={config.title}
        score={run.score}
        isRecord={run.isRecord}
        taunt={config.taunt}
        cityLabel={scope.cityLabel}
      />
    </SafeAreaView>
  );
}

/* ============================== GİRİŞ KARTI ============================== */

function StartCard({
  config,
  best,
  loading,
  onStart,
  onBoard,
  setup,
}: {
  config: ArenaGameConfig;
  best: number;
  loading: boolean;
  onStart: () => void;
  onBoard: () => void;
  /** Oyuna özgü kurulum (Penaltı/Slalom: oyuncu seçimi). Varsa kurallar kısalır. */
  setup?: ReactNode;
}) {
  const rules = setup ? config.rules.slice(0, 2) : config.rules;
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <ScrollView style={styles.cardScroll} contentContainerStyle={styles.cardScrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.cardWrap}>
          <View style={styles.card}>
            <Text style={styles.overline} {...textScale.badge}>
              {upperTR("Elitlig Arena")}
            </Text>
            <LinearGradient colors={ARENA_CARD.icon} start={TOP} end={BOTTOM} style={styles.startIcon}>
              <Ionicons name={config.icon} size={30} color={ARENA_CARD.white} />
            </LinearGradient>
            <Text style={styles.startTitle} {...textScale.dense}>
              {config.title}
            </Text>
            <Text style={styles.startSub} {...textScale.dense}>
              {config.subtitle}
            </Text>

            <View style={styles.rules}>
              {rules.map((rule) => (
                <View key={rule.text} style={styles.rule}>
                  <View style={styles.ruleIcon}>
                    <Ionicons name={rule.icon} size={16} color={colors.textPrimary} />
                  </View>
                  <Text style={styles.ruleText} {...textScale.long}>
                    {rule.text}
                  </Text>
                </View>
              ))}
            </View>

            <Touchable
              feedback="button"
              haptic="light"
              onPress={onBoard}
              style={styles.bestPill}
              accessibilityRole="button"
              accessibilityLabel="Rekor tablosunu aç"
            >
              <Ionicons name="trophy" size={16} color={colors.star} />
              <Text style={styles.bestText} {...textScale.dense}>
                {best > 0 ? `Rekorun ${formatCount(best)} ${SCORE_UNIT}` : "Henüz rekorun yok"}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
            </Touchable>

            {setup}

            <View style={styles.startBtn}>
              <GameButton label={loading ? "HAZIRLANIYOR…" : "BAŞLA"} icon="play" onPress={onStart} disabled={loading} accessibilityLabel={`${config.title} başla`} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ================================ STİLLER ================================ */

/** Oyun HUD'unun sağ üstte boş bırakacağı alan (durdur düğmesi), CSS px. */
const HUD_INSET = { top: 0, right: 64 };
const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CARTOON.night[2] },
  flex: { flex: 1 },

  // Oyun ekranı kenardan kenara (tam ekran); yüklenirken koyu sahne.
  arena: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: CARTOON.night[2],
  },
  pauseBtn: {
    position: "absolute",
    top: space.md,
    right: space.md,
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARTOON.glassDark,
    borderWidth: 1,
    borderColor: CARTOON.glassEdge,
  },
  menuLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: CARTOON.dim, alignItems: "center", justifyContent: "center", padding: space.lg },
  menuWrap: { width: "100%", maxWidth: 340 },
  menuCard: {
    alignItems: "center",
    gap: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.lg,
    paddingHorizontal: space.lg,
    borderRadius: radius.xxl,
    backgroundColor: CARTOON.card,
    shadowColor: CARTOON.softShadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  menuHead: { alignItems: "center", gap: space.xxs },
  menuOver: { ...type.micro, fontFamily: fonts.bold, color: CARTOON.cardMuted, letterSpacing: 1.5 },
  menuTitle: { ...type.display, fontFamily: fonts.bold, color: CARTOON.navy },
  menuRow: { flexDirection: "row", gap: space.md },
  menuIcon: { width: 52, height: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: CARTOON.cardSoft },
  menuBtns: { alignSelf: "stretch", gap: space.sm },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  cardScroll: { alignSelf: "stretch", flexGrow: 0 },
  cardScrollContent: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  cardWrap: { alignSelf: "stretch", maxWidth: 380, width: "100%" },
  card: {
    borderRadius: radius.xxl,
    backgroundColor: colors.surface1,
    ...elevate(4),
    paddingTop: space.xl,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.xs,
    alignItems: "center",
  },
  overline: { ...type.micro, fontFamily: fonts.bold, color: colors.textTertiary, letterSpacing: 1.5, marginBottom: space.sm },
  startIcon: { width: 64, height: 64, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: space.sm },
  startTitle: { ...type.display, fontFamily: fonts.bold, color: colors.textPrimary, textAlign: "center" },
  startSub: { ...type.bodySm, color: colors.textSecondary, textAlign: "center" },
  rules: { alignSelf: "stretch", gap: space.sm, marginVertical: space.md },
  rule: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  ruleIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  ruleText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  bestPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    marginBottom: space.m,
  },
  startBtn: { alignSelf: "stretch", marginTop: space.sm },
  bestText: { ...type.bodySm, fontFamily: fonts.bold, color: colors.textPrimary },

});
