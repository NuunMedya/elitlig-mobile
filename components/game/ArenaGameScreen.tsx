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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";

import { WebGame, type GameOverPayload, type WebGameHandle } from "@/components/game/WebGame";
import {
  Badge,
  Button,
  ScreenHeader,
  SegmentedControl,
  Touchable,
  useReduceMotion,
  useToast,
  withAlpha,
  type SegmentedItem,
} from "@/components/ui";
import { getArenaLeaderboard, getMyArenaRank, submitArenaScore, type ArenaEntry } from "@/lib/api/arena";
import type { WebGameKey } from "@/lib/game/web/games.generated";
import { instagramUrl } from "@/lib/socials";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  dark as inkPalette,
  elevate,
  fonts,
  hairline,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

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
type SubmitState = "idle" | "guest" | "sending" | "sent" | "failed";
type Period = "weekly" | "alltime";

const SOUND_KEY = "elitlig.arena.sound.v1";
const UNIT = "puan";

const PERIOD_ITEMS: SegmentedItem<Period>[] = [
  { key: "weekly", label: "Bu hafta" },
  { key: "alltime", label: "Tüm zamanlar" },
];

/** 1240 → "1.240" */
const formatCount = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function readEntry(data: unknown): { rank: number; score: number } | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const entry = (root.entry && typeof root.entry === "object" ? root.entry : root) as Record<string, unknown>;
  const rank = Number(entry.rank);
  const score = Number(entry.score ?? entry.best);
  return Number.isFinite(rank) && Number.isFinite(score) ? { rank, score } : null;
}

/* ================================= EKRAN ================================= */

export function ArenaGameScreen({ config }: { config: ArenaGameConfig }) {
  const router = useRouter();
  const auth = useAuth();
  const scope = useScope();
  const queryClient = useQueryClient();
  const reduceMotion = useReduceMotion();

  const game = useRef<WebGameHandle>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const phaseRef = useRef<Phase>("loading");
  const [result, setResult] = useState<GameOverPayload | null>(null);
  const [best, setBest] = useState(0);
  const [prevBest, setPrevBest] = useState(0);
  const [sound, setSound] = useState(true);
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [shareOpen, setShareOpen] = useState(false);

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => {
    AsyncStorage.getItem(config.bestKey).then((value) => setBest(Number(value) || 0));
    AsyncStorage.getItem(SOUND_KEY).then((value) => {
      if (value === "0") setSound(false);
    });
  }, [config.bestKey]);

  /* Ses / hareket tercihi oyuna her değiştiğinde iletilir. */
  useEffect(() => {
    game.current?.send({ type: "config", sound, reduceMotion });
  }, [sound, reduceMotion, phase]);

  /* Odak: başka ekrana geçince oyun durur, dönünce sürer. */
  useFocusEffect(
    useCallback(() => {
      game.current?.send({ type: "resume" });
      return () => game.current?.send({ type: "pause" });
    }, []),
  );

  /* ─────────────────────────── skor gönderimi ─────────────────────────── */

  const submitScore = useCallback(
    (value: number) => {
      if (value <= 0) {
        setSubmit("idle");
        return;
      }
      if (!auth.user) {
        setSubmit("guest");
        return;
      }
      setSubmit("sending");
      submitArenaScore(config.game, value)
        .then(() => {
          setSubmit("sent");
          void queryClient.invalidateQueries({ queryKey: ["arena"] });
        })
        .catch(() => setSubmit("failed"));
    },
    [auth.user, config.game, queryClient],
  );

  /* Misafir giriş yapıp döndüyse bekleyen skor kendiliğinden gönderilir. */
  useEffect(() => {
    if (auth.user && submit === "guest" && result) submitScore(result.score);
  }, [auth.user, submit, result, submitScore]);

  const onOver = useCallback(
    (payload: GameOverPayload) => {
      if (phaseRef.current !== "playing") return;
      setResult(payload);
      setPhaseBoth("over");
      setPrevBest(best);
      if (payload.score > best) {
        setBest(payload.score);
        void AsyncStorage.setItem(config.bestKey, String(payload.score));
      }
      submitScore(payload.score);
    },
    [best, config.bestKey, submitScore],
  );

  const onReady = useCallback(() => {
    game.current?.send({ type: "config", sound, reduceMotion });
    if (phaseRef.current === "loading") setPhaseBoth("ready");
  }, [sound, reduceMotion]);

  const start = () => {
    setResult(null);
    setSubmit("idle");
    setPhaseBoth("playing");
    game.current?.send({ type: "config", sound, reduceMotion });
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

  const score = result?.score ?? 0;
  const isRecord = score > 0 && score > prevBest;

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
          <StartCard config={config} best={best} loading={phase === "loading"} onStart={start} onBoard={openBoard} />
        ) : null}

        {phase === "over" && result ? (
          <ResultCard
            config={config}
            result={result}
            best={best}
            isRecord={isRecord}
            submit={submit}
            onRetrySubmit={() => submitScore(score)}
            onSignIn={() => router.push("/giris")}
            onRestart={start}
            onBoard={openBoard}
            onShare={() => setShareOpen(true)}
          />
        ) : null}
      </View>

      <ShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        title={config.title}
        score={score}
        isRecord={isRecord}
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
}: {
  config: ArenaGameConfig;
  best: number;
  loading: boolean;
  onStart: () => void;
  onBoard: () => void;
}) {
  return (
    <View style={styles.overlay} pointerEvents="box-none">
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
          {config.rules.map((rule) => (
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
            {best > 0 ? `Rekorun ${formatCount(best)} ${UNIT}` : "Henüz rekorun yok"}
          </Text>
          <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
        </Touchable>

        <Button label={loading ? "Hazırlanıyor" : "Başla"} icon="play" size="lg" fullWidth loading={loading} onPress={onStart} />
      </View>
    </View>
  );
}

/* ============================== BİTİŞ KARTI ============================== */

function ResultCard({
  config,
  result,
  best,
  isRecord,
  submit,
  onRetrySubmit,
  onSignIn,
  onRestart,
  onBoard,
  onShare,
}: {
  config: ArenaGameConfig;
  result: GameOverPayload;
  best: number;
  isRecord: boolean;
  submit: SubmitState;
  onRetrySubmit: () => void;
  onSignIn: () => void;
  onRestart: () => void;
  onBoard: () => void;
  onShare: () => void;
}) {
  const facts = config.describe(result.stats);
  return (
    <View style={styles.scrim}>
      <ScrollView contentContainerStyle={styles.scrimContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {isRecord ? <Badge label={upperTR("Yeni rekor")} tone="warn" icon="trophy" variant="soft" /> : null}
          <Text style={styles.resultTitle} {...textScale.dense}>
            {isRecord ? "Rekorunu kırdın!" : config.overTitle}
          </Text>
          <Text style={styles.resultScore} {...textScale.dense}>
            {formatCount(result.score)}
          </Text>
          <Text style={styles.resultUnit} {...textScale.badge}>
            {upperTR(UNIT)}
          </Text>

          {facts.length ? (
            <View style={styles.facts}>
              {facts.map((fact) => (
                <View key={fact} style={styles.fact}>
                  <Text style={styles.factText} {...textScale.dense}>
                    {fact}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.resultBest} {...textScale.dense}>
            {`Kişisel rekorun ${formatCount(best)} ${UNIT}`}
          </Text>

          <SubmitLine state={submit} onRetry={onRetrySubmit} onSignIn={onSignIn} />

          <Button label="Tekrar oyna" icon="refresh" size="lg" fullWidth onPress={onRestart} style={styles.replay} />

          <MiniBoard game={config.game} justSent={submit === "sent"} onBoard={onBoard} />

          <View style={styles.resultRow}>
            <Button label="Tüm tablo" icon="trophy-outline" variant="secondary" onPress={onBoard} style={styles.flex} />
            <Button label="Meydan oku" icon="share-social" variant="ghost" onPress={onShare} style={styles.flex} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ========================= MİNİ REKOR TABLOSU ========================= */

/**
 * Türkiye geneli ilk 5 + senin sıran. Kapsam bilerek Türkiye: oyunlar herkesin
 * birbiriyle yarıştığı tek tablodur; şehir kırılımı Rekor Tablosu ekranında.
 */
function MiniBoard({ game, justSent, onBoard }: { game: WebGameKey; justSent: boolean; onBoard: () => void }) {
  const auth = useAuth();
  const [period, setPeriod] = useState<Period>("weekly");
  const myId = auth.user ? Number(auth.user.id) : null;

  const board = useQuery({
    queryKey: ["arena", "board", game, period, "tr"],
    queryFn: () => getArenaLeaderboard(game, { period }),
    staleTime: 15_000,
  });
  const me = useQuery({
    queryKey: ["arena", "me", game, period, "tr"],
    queryFn: () => getMyArenaRank(game, undefined, period),
    enabled: Boolean(auth.user),
    staleTime: 15_000,
    retry: false,
  });

  const entries: ArenaEntry[] = board.data?.entries ?? [];
  const top = entries.slice(0, 5);
  const mine = readEntry(me.data);
  const meInTop = myId != null && top.some((entry) => Number(entry.userId) === myId);
  // Bir üstündeki oyuncuya kaç puan var? — hedef koymak oyunu sürdürür.
  const ahead = mine && mine.rank > 1 ? entries.filter((entry) => entry.score > mine.score).pop() ?? null : null;
  const gap = ahead && mine ? ahead.score - mine.score + 1 : null;

  return (
    <View style={styles.board}>
      <View style={styles.boardHead}>
        <Ionicons name="podium-outline" size={15} color={colors.brandAccent} />
        <Text style={styles.boardTitle} {...textScale.dense}>
          Türkiye sıralaması
        </Text>
        {board.isFetching || (justSent && me.isFetching) ? (
          <ActivityIndicator size="small" color={colors.textTertiary} />
        ) : null}
      </View>
      <SegmentedControl items={PERIOD_ITEMS} value={period} onChange={setPeriod} size="sm" />

      {board.isLoading ? (
        <View style={styles.boardEmpty}>
          <ActivityIndicator color={colors.textTertiary} />
        </View>
      ) : board.isError ? (
        <Text style={styles.boardEmptyText} {...textScale.dense}>
          Tablo yüklenemedi.
        </Text>
      ) : top.length === 0 ? (
        <Text style={styles.boardEmptyText} {...textScale.dense}>
          Bu dönemde henüz skor yok — ilk sen ol!
        </Text>
      ) : (
        <View style={styles.boardList}>
          {top.map((entry) => {
            const isMe = myId != null && Number(entry.userId) === myId;
            return <BoardRow key={`${entry.userId}-${entry.rank}`} rank={entry.rank} name={isMe ? `${entry.name} (sen)` : entry.name} score={entry.score} mine={isMe} />;
          })}
          {mine && !meInTop ? (
            <>
              <View style={styles.boardGap}>
                <Text style={styles.boardGapText}>···</Text>
              </View>
              <BoardRow rank={mine.rank} name="Sen" score={mine.score} mine />
            </>
          ) : null}
        </View>
      )}

      {gap != null && gap > 0 && ahead ? (
        <Text style={styles.boardHint} {...textScale.dense}>
          {`${ahead.name} adlı oyuncuyu geçmek için ${formatCount(gap)} ${UNIT} daha.`}
        </Text>
      ) : mine?.rank === 1 ? (
        <Text style={styles.boardHint} {...textScale.dense}>
          Zirvedesin! Tahtını koru.
        </Text>
      ) : null}

      <Touchable feedback="button" haptic="light" onPress={onBoard} style={styles.boardMore} accessibilityRole="button" accessibilityLabel="Tüm rekor tablosu">
        <Text style={styles.boardMoreText} {...textScale.dense}>
          Şehrine göre ve tüm liste
        </Text>
        <Ionicons name="chevron-forward" size={13} color={colors.brandAccent} />
      </Touchable>
    </View>
  );
}

function BoardRow({ rank, name, score, mine }: { rank: number; name: string; score: number; mine: boolean }) {
  const medal = rank === 1 ? colors.yellowCard : rank === 2 ? colors.textTertiary : rank === 3 ? colors.zoneRelegationPlayoff : null;
  return (
    <View style={[styles.row, mine && styles.rowMine]}>
      <View style={[styles.rank, medal ? { backgroundColor: withAlpha(medal, 0.18) } : null]}>
        <Text style={[styles.rankText, medal ? { color: medal } : null]} {...textScale.badge}>
          {rank}
        </Text>
      </View>
      <Text style={[styles.rowName, mine && styles.rowNameMine]} numberOfLines={1} {...textScale.dense}>
        {name}
      </Text>
      <Text style={styles.rowScore} {...textScale.dense}>
        {formatCount(score)}
      </Text>
    </View>
  );
}

/* ========================= SKOR GÖNDERİM SATIRI ========================= */

function SubmitLine({ state, onRetry, onSignIn }: { state: SubmitState; onRetry: () => void; onSignIn: () => void }) {
  if (state === "idle") return null;

  if (state === "guest") {
    return (
      <Touchable
        feedback="button"
        haptic="light"
        onPress={onSignIn}
        style={[styles.submitLine, styles.submitGuest]}
        accessibilityRole="button"
        accessibilityLabel="Giriş yap, skorun rekor tablosuna yazılsın"
      >
        <Ionicons name="log-in-outline" size={14} color={colors.brandAccent} />
        <Text style={styles.submitLink} {...textScale.dense}>
          Giriş yap — bu skor tabloya yazılsın
        </Text>
      </Touchable>
    );
  }

  if (state === "failed") {
    return (
      <Touchable
        feedback="button"
        haptic="light"
        onPress={onRetry}
        style={styles.submitLine}
        accessibilityRole="button"
        accessibilityLabel="Skor gönderilemedi, tekrar dene"
      >
        <Ionicons name="refresh" size={13} color={colors.danger} />
        <Text style={styles.submitFail} {...textScale.dense}>
          Skor gönderilemedi · tekrar dene
        </Text>
      </Touchable>
    );
  }

  return (
    <View style={styles.submitLine}>
      <Ionicons
        name={state === "sent" ? "checkmark-circle" : "cloud-upload-outline"}
        size={13}
        color={state === "sent" ? colors.win : colors.textTertiary}
      />
      <Text style={styles.submitInfo} {...textScale.dense}>
        {state === "sent" ? "Rekor tablosuna yazıldı" : "Rekor tablosuna gönderiliyor…"}
      </Text>
    </View>
  );
}

/* ============================ PAYLAŞIM KARTI ============================ */

function ShareSheet({
  visible,
  onClose,
  title,
  score,
  isRecord,
  taunt,
  cityLabel,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  score: number;
  isRecord: boolean;
  taunt: string;
  cityLabel: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);

  const igHandle = (() => {
    const url = instagramUrl(cityLabel);
    const handle = url?.split("instagram.com/")[1]?.replace(/\/+$/, "");
    return handle ? `@${handle}` : "elitlig.com";
  })();

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      } else {
        toast.show({ message: "Bu cihazda paylaşım menüsü açılamıyor.", tone: "warn" });
      }
    } catch {
      toast.show({ message: "Görsel oluşturulamadı, tekrar dener misin?", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.shareBackdrop}>
        <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
          <View style={styles.shareCard}>
            <Text style={styles.shareBrand} {...textScale.badge}>
              elitlig
            </Text>
            <Text style={styles.shareGame} {...textScale.badge}>
              {upperTR(`Arena · ${title}`)}
            </Text>
            <Text style={styles.shareScore} {...textScale.badge}>
              {formatCount(score)}
            </Text>
            <Text style={styles.shareUnit} {...textScale.badge}>
              {upperTR(isRecord ? `${UNIT} · yeni rekor` : UNIT)}
            </Text>
            <View style={styles.shareDivider} />
            <Text style={styles.shareTaunt} {...textScale.badge}>
              {taunt}
            </Text>
            <Text style={styles.shareFooter} {...textScale.badge}>
              {upperTR(`elitlig.com · ${igHandle}`)}
            </Text>
          </View>
        </ViewShot>

        <View style={styles.shareActions}>
          <Button label="Kapat" variant="secondary" onPress={onClose} />
          <Button
            label="Paylaş"
            icon="share-social"
            loading={busy}
            onPress={() => {
              void share();
            }}
          />
        </View>
      </View>
    </Modal>
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

  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  scrimContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.md,
  },
  resultTitle: { ...type.h1, color: colors.textPrimary, marginTop: space.xs, textAlign: "center" },
  resultScore: { ...type.scoreHero, color: colors.brandAccent, marginTop: space.xs },
  resultUnit: { ...type.micro, color: colors.textTertiary },
  facts: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.xs, marginTop: space.sm },
  fact: {
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    paddingHorizontal: space.m,
    paddingVertical: space.xxs + 1,
  },
  factText: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.textSecondary },
  resultBest: { ...type.bodySm, color: colors.textSecondary, marginTop: space.s },
  replay: { marginTop: space.md },
  resultRow: { flexDirection: "row", gap: space.m, alignSelf: "stretch", marginTop: space.sm },

  board: {
    alignSelf: "stretch",
    marginTop: space.md,
    padding: space.m,
    gap: space.s,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  boardHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  boardTitle: { ...type.h4, color: colors.textPrimary, flex: 1 },
  boardEmpty: { paddingVertical: space.md, alignItems: "center" },
  boardEmptyText: { ...type.bodySm, color: colors.textTertiary, textAlign: "center", paddingVertical: space.sm },
  boardList: { gap: 2 },
  boardGap: { alignItems: "center" },
  boardGapText: { ...type.caption, color: colors.textTertiary },
  boardHint: { ...type.caption, fontFamily: fonts.semibold, letterSpacing: 0, color: colors.brandAccent, textAlign: "center" },
  boardMore: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xxs, paddingVertical: space.xxs },
  boardMoreText: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.brandAccent },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingVertical: space.xs,
    paddingHorizontal: space.s,
    borderRadius: radius.md,
  },
  rowMine: { backgroundColor: colors.brandDim },
  rank: {
    minWidth: 26,
    height: 22,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxs,
    backgroundColor: colors.surface3,
  },
  rankText: { ...type.tableNumStrong, color: colors.textSecondary },
  rowName: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  rowNameMine: { fontFamily: fonts.bold, color: colors.brandAccent },
  rowScore: { ...type.tableNumStrong, color: colors.textPrimary },

  submitLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginTop: space.s,
    paddingVertical: space.xs,
  },
  submitGuest: {
    backgroundColor: colors.brandDim,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
  },
  submitInfo: { ...type.caption, fontFamily: fonts.semibold, letterSpacing: 0, color: colors.textTertiary },
  submitLink: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.brandAccent },
  submitFail: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.danger },

  shareBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.lg,
  },
  shareCard: {
    backgroundColor: inkPalette.bg,
    width: 268,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: inkPalette.brandBorder,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    alignItems: "center",
    gap: space.xxs,
  },
  shareBrand: { ...type.h2, color: inkPalette.textPrimary },
  shareGame: { ...type.micro, color: inkPalette.brandAccent },
  shareScore: { ...type.scoreHero, fontSize: 56, lineHeight: 60, color: inkPalette.warn, marginTop: space.sm },
  shareUnit: { ...type.micro, color: inkPalette.textPrimary },
  shareDivider: {
    alignSelf: "stretch",
    height: hairline,
    backgroundColor: withAlpha(inkPalette.textPrimary, 0.2),
    marginVertical: space.md,
  },
  shareTaunt: { ...type.bodySm, fontFamily: fonts.bold, color: inkPalette.textSecondary },
  shareFooter: { ...type.micro, color: inkPalette.textTertiary, marginTop: space.sm },
  shareActions: { flexDirection: "row", gap: space.m },
});
