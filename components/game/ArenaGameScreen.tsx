/**
 * ARENA OYUN EKRANI — penaltı, slalom ve top sektir'in ORTAK kabuğu.
 *
 * Oyunun kendisi `WebGame` içindeki Canvas'tadır (bkz. games/*.js). Bu dosya
 * yalnız oyunun ÇEVRESİNİ çizer ve üç oyunda birebir aynıdır:
 *   · Başlık: geri, ses aç/kapa, rekor tablosu.
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
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ArenaResultCard, ArenaShareSheet, formatCount, SCORE_UNIT, useArenaScore } from "@/components/game/ArenaResult";
import { PenaltySetup } from "@/components/game/PenaltySetup";
import { WebGame, type GameOverPayload, type WebGameHandle } from "@/components/game/WebGame";
import { Button, ScreenHeader, Touchable, useReduceMotion } from "@/components/ui";
import { getPenaltyRoster } from "@/lib/api/arena";
import { getPlayerCareer } from "@/lib/api/career";
import type { WebGameKey } from "@/lib/game/web/games.generated";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, fonts, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ============================ SÖZLEŞME ============================ */

export interface ArenaGameRule {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}

export interface ArenaGameConfig {
  game: WebGameKey;
  title: string;
  /** Başlığın altındaki tek satır. */
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Giriş kartındaki 3–4 kısa kural. */
  rules: ArenaGameRule[];
  /** Cihazdaki kişisel rekor anahtarı — `(tabs)/oyunlar.tsx` aynı anahtarı okur. */
  bestKey: string;
  /** Bitiş kartındaki istatistik satırı: "12 gol · Seviye 4". */
  describe: (stats: Record<string, number>) => string[];
  /** Tur kötü bittiğinde başlık ("Hakların bitti"). */
  overTitle: string;
  /** Paylaşım kartındaki meydan okuma. */
  taunt: string;
}

type Phase = "loading" | "ready" | "playing" | "over";

const SOUND_KEY = "elitlig.arena.sound.v1";
const SHOOTER_KEY = "elitlig.penalti.shooter.v1";

/* ================================= EKRAN ================================= */

export function ArenaGameScreen({ config }: { config: ArenaGameConfig }) {
  const router = useRouter();
  const scope = useScope();
  const reduceMotion = useReduceMotion();
  const run = useArenaScore(config.game, config.bestKey);
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

  /* Penaltı: gerçek ligden atıcılar ve kaleci merdiveni. Seçilen atıcı
     cihazda hatırlanır; kadro gelmezse oyun varsayılan kadroyla oynanır. */
  const isPenalty = config.game === "penalti";
  const rosterQuery = useQuery({
    queryKey: ["arena", "penalti", "roster", scope.cityId ?? 0, auth.user?.player_id ?? 0],
    queryFn: () => getPenaltyRoster(scope.cityId),
    enabled: isPenalty,
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const [shooterId, setShooterId] = useState<number | null>(null);
  useEffect(() => {
    if (!isPenalty) return;
    AsyncStorage.getItem(SHOOTER_KEY).then((value) => {
      if (value) setShooterId((current) => current ?? Number(value));
    });
  }, [isPenalty]);
  const chooseShooter = useCallback((id: number) => {
    setShooterId(id);
    void AsyncStorage.setItem(SHOOTER_KEY, String(id));
  }, []);
  const roster = useMemo(() => {
    const data = rosterQuery.data;
    if (!isPenalty || !data || !data.shooters.length) return null;
    // Kendi oyuncusu varsa ve henüz seçim yapılmadıysa o seçilir.
    const shooter = data.shooters.find((item) => item.id === shooterId) ?? data.shooters.find((item) => item.mine) ?? data.shooters[0];
    return { shooter, keepers: data.keepers };
  }, [isPenalty, rosterQuery.data, shooterId]);

  const game = useRef<WebGameHandle>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const phaseRef = useRef<Phase>("loading");
  const [result, setResult] = useState<GameOverPayload | null>(null);
  const [sound, setSound] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

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
    game.current?.send({ type: "config", sound, reduceMotion, perks, roster });
  }, [sound, reduceMotion, phase, perks, roster]);

  /* Odak: başka ekrana geçince oyun durur, dönünce sürer. */
  useFocusEffect(
    useCallback(() => {
      game.current?.send({ type: "resume" });
      return () => game.current?.send({ type: "pause" });
    }, []),
  );

  const { finish } = run;
  const onOver = useCallback(
    (payload: GameOverPayload) => {
      if (phaseRef.current !== "playing") return;
      setResult(payload);
      setPhaseBoth("over");
      finish(payload.score);
    },
    [finish],
  );

  const onReady = useCallback(() => {
    game.current?.send({ type: "config", sound, reduceMotion, perks, roster });
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

  const headerActions = useMemo(
    () => [
      {
        icon: (sound ? "volume-high-outline" : "volume-mute-outline") as keyof typeof Ionicons.glyphMap,
        onPress: toggleSound,
        accessibilityLabel: sound ? "Sesi kapat" : "Sesi aç",
      },
      { icon: "trophy-outline" as const, onPress: openBoard, accessibilityLabel: "Rekor tablosu" },
    ],
    [sound, toggleSound, openBoard],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={config.title}
        overline={upperTR("Elitlig Arena")}
        subtitle={config.subtitle}
        back
        actions={headerActions}
      />

      <View style={styles.arena}>
        <WebGame ref={game} game={config.game} onReady={onReady} onOver={onOver} />

        {phase === "loading" || phase === "ready" ? (
          <StartCard
            config={config}
            best={run.best}
            loading={phase === "loading"}
            onStart={start}
            onBoard={openBoard}
            setup={
              isPenalty ? (
                <PenaltySetup
                  roster={rosterQuery.data ?? null}
                  loading={rosterQuery.isLoading}
                  selectedId={roster?.shooter.id ?? null}
                  onSelect={chooseShooter}
                />
              ) : null
            }
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
            secondary={isPenalty && roster ? { label: "Atıcı değiştir", icon: "swap-horizontal", onPress: () => setPhaseBoth("ready") } : undefined}
          />
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
  /** Oyuna özgü kurulum (Penaltı: atıcı seçimi). Varsa kurallar kısalır. */
  setup?: ReactNode;
}) {
  const rules = setup ? config.rules.slice(0, 2) : config.rules;
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <ScrollView style={styles.cardScroll} contentContainerStyle={styles.cardScrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.startIcon}>
            <Ionicons name={config.icon} size={22} color={colors.brandAccent} />
          </View>
          <Text style={styles.overline} {...textScale.badge}>
            {upperTR("Elitlig Arena")}
          </Text>
          <Text style={styles.startTitle} {...textScale.dense}>
            {config.title}
          </Text>

          <View style={styles.rules}>
            {rules.map((rule) => (
              <View key={rule.text} style={styles.rule}>
                <Ionicons name={rule.icon} size={15} color={colors.brandAccent} style={styles.ruleIcon} />
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
            <Ionicons name="trophy" size={13} color={colors.star} />
            <Text style={styles.bestText} {...textScale.dense}>
              {best > 0 ? `Rekorun ${formatCount(best)} ${SCORE_UNIT}` : "Henüz rekorun yok"}
            </Text>
            <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
          </Touchable>

          {setup}

          <Button label={loading ? "Hazırlanıyor" : "Başla"} icon="play" size="lg" fullWidth loading={loading} onPress={onStart} />
        </View>
      </ScrollView>
    </View>
  );
}

/* ================================ STİLLER ================================ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  arena: {
    flex: 1,
    marginHorizontal: layout.screenPadding,
    marginBottom: layout.screenPadding,
    marginTop: space.xs,
    borderRadius: radius.xl,
    overflow: "hidden",
    // Oyun yüklenirken görünen zemin: iki temada da koyu sahne.
    backgroundColor: colors.inkBlock,
    ...elevate(2),
    borderWidth: 0,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  cardScroll: { alignSelf: "stretch", flexGrow: 0 },
  cardScrollContent: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  card: {
    alignSelf: "stretch",
    maxWidth: 380,
    width: "100%",
    borderRadius: radius.xl,
    ...elevate(4),
    padding: space.xl,
    gap: space.xs,
    alignItems: "center",
  },
  startIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    marginBottom: space.xxs,
  },
  overline: { ...type.micro, color: colors.brandAccent },
  startTitle: { ...type.display, color: colors.textPrimary },
  rules: { alignSelf: "stretch", gap: space.s, marginVertical: space.sm },
  rule: { flexDirection: "row", gap: space.s, alignItems: "flex-start" },
  ruleIcon: { marginTop: 2 },
  ruleText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  bestPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    marginBottom: space.m,
  },
  bestText: { ...type.bodySm, fontFamily: fonts.bold, color: colors.textPrimary },

});
