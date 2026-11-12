/**
 * ARENA SONUÇ KATMANI — bütün Arena oyunlarının ortak "tur bitti" parçaları.
 *
 *   · `useArenaScore`  kişisel rekor (cihazda), skorun rekor tablosuna
 *                      gönderimi ve misafirin giriş yapıp dönünce skorunun
 *                      KENDİLİĞİNDEN gönderilmesi.
 *   · `ArenaResultCard` skor, yeni rekor rozeti, tur istatistikleri, gönderim
 *                      satırı ve canlı Türkiye sıralaması (ilk 5 + senin sıran,
 *                      bir üsttekine kalan puan).
 *   · `ArenaShareSheet` "meydan oku" paylaşım kartı.
 *
 * Canvas oyunları (`ArenaGameScreen`) ve bilgi yarışmaları (`QuizScreen`)
 * aynı parçaları kullanır: oyuncu hangi oyunu oynarsa oynasın tur sonu aynı
 * yerde, aynı biçimde biter. Görünüm oyunların "canlı ama sade" temasıdır
 * (bkz. `lib/game/cartoon.ts`, `components/game/QuizKit.tsx`): yumuşak
 * gölgeli beyaz kart, kurdele, tek yeşil birincil düğme, nötr çip ve ikincil
 * düğmeler, sade madalyalı tablo satırları. Altın yalnız rekor ve yıldızda.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import ViewShot, { captureRef } from "react-native-view-shot";

import { Touchable, useToast, type SegmentedItem } from "@/components/ui";
import {
  getArenaLeaderboard,
  getMyArenaRank,
  startArenaSession,
  submitArenaScore,
  type ArenaEntry,
  type ArenaGame,
} from "@/lib/api/arena";
import { ConfettiBurst } from "@/components/game/Celebration";
import { CartoonButton, CartoonPanel, IconBubble, PopIn, Ribbon } from "@/components/game/QuizKit";
import { ARENA_RESULT } from "@/lib/game/arenaResultPalette";
import { CARTOON } from "@/lib/game/cartoon";
import { QUIZ } from "@/lib/game/quizPalette";
import { instagramUrl } from "@/lib/socials";
import { useAuth } from "@/providers/AuthProvider";
import { fonts, radius, space, textScale, type, upperTR } from "@/theme";

export type SubmitState = "idle" | "guest" | "sending" | "sent" | "failed";
type Period = "weekly" | "alltime";

export const SCORE_UNIT = "puan";

const PERIOD_ITEMS: SegmentedItem<Period>[] = [
  { key: "weekly", label: "Bu hafta" },
  { key: "alltime", label: "Tüm zamanlar" },
];

/** 1240 → "1.240" */
export const formatCount = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function readEntry(data: unknown): { rank: number; score: number } | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const entry = (root.entry && typeof root.entry === "object" ? root.entry : root) as Record<string, unknown>;
  const rank = Number(entry.rank);
  const score = Number(entry.score ?? entry.best);
  return Number.isFinite(rank) && Number.isFinite(score) ? { rank, score } : null;
}

/* ═════════════════════════ KANCA: rekor + gönderim ═════════════════════════ */

export function useArenaScore(game: ArenaGame, bestKey: string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [best, setBest] = useState(0);
  const [prevBest, setPrevBest] = useState(0);
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [score, setScore] = useState<number | null>(null);
  /** Sunucunun rekor hükmü (yanıt gelince); null: henüz bilinmiyor, cihaza bakılır. */
  const [serverRecord, setServerRecord] = useState<boolean | null>(null);
  /** Bu turun Kulüp Şehri'ne getirdiği yıldız (sunucu; doğrulanmamış skorda 0). */
  const [stars, setStars] = useState(0);
  const bestRef = useRef(0);
  bestRef.current = best;
  /** Bu turun oyun oturumu (Kariyer Modu doğrulaması); açılamazsa null. */
  const sessionRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(bestKey).then((value) => setBest(Number(value) || 0));
  }, [bestKey]);

  const send = useCallback(
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
      // Turun oturumu (reset'te açıldı) skorla gider; sunucu süreyle doğrular.
      // Oturum ancak gönderim BAŞARILI olunca bırakılır: ağ hatasından sonra
      // "Tekrar dene" aynı oturumla gider ve skor yine doğrulanabilir.
      const pending = sessionRef.current;
      (pending ?? Promise.resolve(null))
        .then((sessionId) => submitArenaScore(game, value, sessionId))
        .then((response) => {
          // Bu arada yeni tur başladıysa onun oturumuna dokunulmaz.
          if (sessionRef.current === pending) sessionRef.current = null;
          setSubmit("sent");
          // Rekor sunucuda da tutulur: başka cihazda yapılmış daha yüksek skor
          // varsa cihazdaki rekor ona çekilir ve bu tur "rekor" sayılmaz.
          const entry = response?.entry;
          if (entry && typeof entry.best === "number" && entry.best > bestRef.current) {
            setBest(entry.best);
            void AsyncStorage.setItem(bestKey, String(entry.best));
          }
          if (entry && typeof entry.record === "boolean") setServerRecord(Boolean(entry.record || entry.first));
          if (entry && typeof entry.stars === "number") setStars(entry.stars);
          if (entry && entry.stars) void queryClient.invalidateQueries({ queryKey: ["puzzle"] });
          void queryClient.invalidateQueries({ queryKey: ["arena"] });
          // Oyun görevleri ve XP: Görevler / Kariyer bir sonraki açılışta tazelensin.
          void queryClient.invalidateQueries({ queryKey: ["career"] });
        })
        .catch(() => setSubmit("failed"));
    },
    [auth.user, bestKey, game, queryClient],
  );

  /* Misafir giriş yapıp döndüyse bekleyen skor kendiliğinden gönderilir. */
  useEffect(() => {
    if (auth.user && submit === "guest" && score != null) send(score);
  }, [auth.user, submit, score, send]);

  /** Tur bitti: rekoru güncelle, skoru gönder. */
  const finish = useCallback(
    (value: number) => {
      setScore(value);
      setServerRecord(null);
      setStars(0);
      setPrevBest(bestRef.current);
      if (value > bestRef.current) {
        setBest(value);
        void AsyncStorage.setItem(bestKey, String(value));
      }
      send(value);
    },
    [bestKey, send],
  );

  /** Yeni tur: skor sıfırlanır ve girişliyse oyun oturumu açılır. */
  const reset = useCallback(() => {
    setScore(null);
    setSubmit("idle");
    setServerRecord(null);
    setStars(0);
    sessionRef.current = auth.user
      ? startArenaSession(game)
          .then((data) => data.sessionId)
          .catch(() => null)
      : null;
  }, [auth.user, game]);

  return {
    best,
    score: score ?? 0,
    isRecord: serverRecord ?? (score != null && score > 0 && score > prevBest),
    submit,
    stars,
    finish,
    retry: () => send(score ?? 0),
    reset,
  };
}

/* ═════════════════════════ BİTİŞ KARTI ═════════════════════════ */

export interface ArenaResultCardProps {
  game: ArenaGame;
  score: number;
  best: number;
  isRecord: boolean;
  overTitle: string;
  facts: string[];
  submit: SubmitState;
  onRetrySubmit: () => void;
  onSignIn: () => void;
  onRestart: () => void;
  onBoard: () => void;
  onShare: () => void;
  /** Skorun altında oyuna özgü ek içerik (ör. kaçırılan sorunun cevabı). */
  extra?: ReactNode;
  /** "Tekrar oyna"nın yanında ikinci eylem (ör. il değiştir). */
  secondary?: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void };
  /** Kulüp Şehri'ne giden yıldız (0: gösterilmez) ve şehre geçiş. */
  stars?: number;
  onCity?: () => void;
}

/**
 * Sade bitiş kartı: yumuşak gölgeli beyaz kart, üst kenarda kurdele (tur
 * başlığı ya da altın "YENİ REKOR!"), lacivert dev skor, nötr istatistik
 * çipleri, Kulüp Şehri yıldız hapı, TEK vurgu (yeşil "Tekrar oyna"), nötr
 * ikincil düğmeler ve rekor tablosu. Altın yalnız rekor ve yıldızlar içindir.
 */
export function ArenaResultCard({
  game,
  score,
  best,
  isRecord,
  overTitle,
  facts,
  submit,
  onRetrySubmit,
  onSignIn,
  onRestart,
  onBoard,
  onShare,
  extra,
  secondary,
  stars = 0,
  onCity,
}: ArenaResultCardProps) {
  return (
    <View style={styles.scrim} accessibilityViewIsModal>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrimContent} showsVerticalScrollIndicator={false}>
        <PopIn style={styles.cardWrap}>
          <CartoonPanel style={styles.card}>
            {isRecord ? (
              <View style={styles.recordBadge}>
                <View pointerEvents="none" style={styles.recordGlow}>
                  <Svg width={GLOW} height={GLOW}>
                    <Defs>
                      <RadialGradient id="arenaRecordGlow" cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor={ARENA_RESULT.recordGlow} stopOpacity={0.55} />
                        <Stop offset="0.55" stopColor={ARENA_RESULT.recordGlow} stopOpacity={0.18} />
                        <Stop offset="1" stopColor={ARENA_RESULT.recordGlow} stopOpacity={0} />
                      </RadialGradient>
                    </Defs>
                    <Rect x="0" y="0" width={GLOW} height={GLOW} fill="url(#arenaRecordGlow)" />
                  </Svg>
                </View>
                <IconBubble icon="trophy" tone="gold" size={60} />
                <Text style={styles.recordTitle} {...textScale.dense}>
                  Rekorunu kırdın!
                </Text>
              </View>
            ) : null}

            <View style={styles.scoreBlock} accessible accessibilityLabel={`${formatCount(score)} ${SCORE_UNIT}`}>
              <Text style={styles.score} numberOfLines={1} adjustsFontSizeToFit {...textScale.dense}>
                {formatCount(score)}
              </Text>
              <Text style={styles.unit} {...textScale.badge}>
                {upperTR(SCORE_UNIT)}
              </Text>
            </View>

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

            {extra}

            {stars > 0 ? (
              <Touchable
                feedback="button"
                haptic="light"
                onPress={onCity}
                style={styles.cityStars}
                accessibilityRole="button"
                accessibilityLabel={`${stars} yıldız Kulüp Şehri'ne eklendi, şehre git`}
              >
                <Ionicons name="star" size={16} color={CARTOON.warn} />
                <Text style={styles.cityStarsText} numberOfLines={1} {...textScale.dense}>
                  {`+${stars} yıldız · Kulüp Şehri'ne`}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={ARENA_RESULT.starInk} />
              </Touchable>
            ) : null}

            <View style={styles.bestRow}>
              <Ionicons name="trophy-outline" size={13} color={ARENA_RESULT.faint} />
              <Text style={styles.bestText} {...textScale.dense}>
                {`Kişisel rekorun ${formatCount(best)} ${SCORE_UNIT}`}
              </Text>
            </View>

            <SubmitLine state={submit} onRetry={onRetrySubmit} onSignIn={onSignIn} />

            <View style={styles.actions}>
              <CartoonButton label="Tekrar oyna" icon="refresh" tone="green" size="lg" onPress={onRestart} style={styles.stretch} />
              {secondary ? <SoftButton label={secondary.label} icon={secondary.icon} onPress={secondary.onPress} /> : null}
            </View>

            <MiniBoard game={game} justSent={submit === "sent"} onBoard={onBoard} />

            <View style={styles.resultRow}>
              <SoftButton label="Tüm tablo" icon="podium-outline" onPress={onBoard} compact />
              <SoftButton label="Meydan oku" icon="share-social-outline" onPress={onShare} compact />
            </View>
          </CartoonPanel>
          <View style={styles.ribbonLayer} pointerEvents="none">
            {isRecord ? <Ribbon label="Yeni rekor!" icon="trophy" fill={QUIZ.ribbonGold} /> : <Ribbon label={overTitle} icon="flag" />}
          </View>
        </PopIn>
      </ScrollView>
      <ConfettiBurst trigger={isRecord ? Math.max(1, score) : 0} count={24} />
    </View>
  );
}

/**
 * Nötr ikincil düğme (beyaz kart üstünde): açık gri yüz, ince kenar, 3 px alt
 * dudak; basınca dudağa çöker. Renk yok — vurgu yalnız birincil düğmede.
 */
function SoftButton({
  label,
  icon,
  onPress,
  compact = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Touchable
      feedback="button"
      haptic="light"
      onPress={onPress}
      style={compact ? styles.softWrapCompact : styles.softWrap}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.softFace, compact && styles.softFaceCompact]}>
        <Ionicons name={icon} size={compact ? 16 : 18} color={ARENA_RESULT.ink} />
        <Text style={compact ? styles.softTextCompact : styles.softText} numberOfLines={1} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
    </Touchable>
  );
}

/* ═════════════════════════ MİNİ REKOR TABLOSU ═════════════════════════ */

/**
 * Türkiye geneli ilk 5 + senin sıran. Kapsam bilerek Türkiye: oyunlar herkesin
 * birbiriyle yarıştığı tek tablodur; şehir kırılımı Rekor Tablosu ekranında.
 */
function MiniBoard({ game, justSent }: { game: ArenaGame; justSent: boolean; onBoard: () => void }) {
  const auth = useAuth();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("weekly");
  // Tüm tablo: aynı oyun ve önizlemede seçili dönemle açılır.
  const openFull = useCallback(() => router.push({ pathname: "/siralama", params: { game, period } }), [router, game, period]);
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
        <View style={styles.boardIcon}>
          <Ionicons name="podium" size={14} color={ARENA_RESULT.ink} />
        </View>
        <Text style={styles.boardTitle} {...textScale.dense}>
          {upperTR("Türkiye sıralaması")}
        </Text>
        {board.isFetching || (justSent && me.isFetching) ? <ActivityIndicator size="small" color={ARENA_RESULT.muted} /> : null}
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {PERIOD_ITEMS.map((item) => {
          const on = item.key === period;
          return (
            <Touchable
              key={item.key}
              haptic="light"
              onPress={() => setPeriod(item.key)}
              style={[styles.tab, on && styles.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.label}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1} {...textScale.badge}>
                {item.label}
              </Text>
            </Touchable>
          );
        })}
      </View>

      {board.isLoading ? (
        <View style={styles.boardEmpty}>
          <ActivityIndicator color={ARENA_RESULT.muted} />
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
            return (
              <BoardRow
                key={`${entry.userId}-${entry.rank}`}
                rank={entry.rank}
                name={isMe ? `${entry.name} (sen)` : entry.name}
                score={entry.score}
                mine={isMe}
              />
            );
          })}
          {mine && !meInTop ? (
            <>
              <View style={styles.boardGap}>
                {[0, 1, 2].map((dot) => (
                  <View key={dot} style={styles.boardGapDot} />
                ))}
              </View>
              <BoardRow rank={mine.rank} name="Sen" score={mine.score} mine />
            </>
          ) : null}
        </View>
      )}

      {gap != null && gap > 0 && ahead ? (
        <Text style={styles.boardHint} {...textScale.dense}>
          {`${ahead.name} adlı oyuncuyu geçmek için ${formatCount(gap)} ${SCORE_UNIT} daha.`}
        </Text>
      ) : mine?.rank === 1 ? (
        <Text style={styles.boardHint} {...textScale.dense}>
          Zirvedesin! Tahtını koru.
        </Text>
      ) : null}

      <Touchable feedback="button" haptic="light" onPress={openFull} style={styles.boardMore} accessibilityRole="button" accessibilityLabel="Tüm rekor tablosu">
        <Text style={styles.boardMoreText} {...textScale.dense}>
          Şehrine göre ve tüm liste
        </Text>
        <Ionicons name="chevron-forward" size={14} color={ARENA_RESULT.muted} />
      </Touchable>
    </View>
  );
}

function BoardRow({ rank, name, score, mine }: { rank: number; name: string; score: number; mine: boolean }) {
  // Madalya: yalnız ilk üçte yumuşak bir zemin; gerisi sade sıra numarası.
  const medal = rank === 1 ? ARENA_RESULT.medal.gold : rank === 2 ? ARENA_RESULT.medal.silver : rank === 3 ? ARENA_RESULT.medal.bronze : ARENA_RESULT.medal.plain;
  return (
    <View style={[styles.row, mine && styles.rowMine]} accessible accessibilityLabel={`${rank}. ${name}, ${formatCount(score)} ${SCORE_UNIT}`}>
      <View style={[styles.rank, { backgroundColor: medal.bg }]}>
        <Text style={[styles.rankText, { color: medal.ink }]} {...textScale.badge}>
          {rank}
        </Text>
      </View>
      <Text style={[styles.rowName, mine && styles.rowNameMine]} numberOfLines={1} {...textScale.dense}>
        {name}
      </Text>
      <Text style={[styles.rowScore, mine && styles.rowNameMine]} {...textScale.dense}>
        {formatCount(score)}
      </Text>
    </View>
  );
}

/* ═════════════════════════ SKOR GÖNDERİM SATIRI ═════════════════════════ */

function SubmitLine({ state, onRetry, onSignIn }: { state: SubmitState; onRetry: () => void; onSignIn: () => void }) {
  if (state === "idle") return null;

  if (state === "guest") {
    return (
      <Touchable
        feedback="button"
        haptic="light"
        onPress={onSignIn}
        style={[styles.submitPill, styles.submitGuest]}
        accessibilityRole="button"
        accessibilityLabel="Giriş yap, skorun rekor tablosuna yazılsın"
      >
        <Ionicons name="log-in" size={16} color={ARENA_RESULT.guestInk} />
        <Text style={[styles.submitPillText, { color: ARENA_RESULT.guestInk }]} {...textScale.dense}>
          Giriş yap — bu skor tabloya yazılsın
        </Text>
        <Ionicons name="chevron-forward" size={14} color={ARENA_RESULT.guestInk} />
      </Touchable>
    );
  }

  if (state === "failed") {
    return (
      <Touchable
        feedback="button"
        haptic="light"
        onPress={onRetry}
        style={[styles.submitPill, styles.submitFail]}
        accessibilityRole="button"
        accessibilityLabel="Skor gönderilemedi, tekrar dene"
      >
        <Ionicons name="refresh" size={15} color={ARENA_RESULT.failInk} />
        <Text style={[styles.submitPillText, { color: ARENA_RESULT.failInk }]} {...textScale.dense}>
          Skor gönderilemedi · tekrar dene
        </Text>
      </Touchable>
    );
  }

  const sent = state === "sent";
  return (
    <View style={styles.submitLine} accessibilityLiveRegion="polite">
      {sent ? <Ionicons name="checkmark-circle" size={16} color={ARENA_RESULT.sentInk} /> : <ActivityIndicator size="small" color={ARENA_RESULT.muted} />}
      <Text style={[styles.submitInfo, sent && { color: ARENA_RESULT.sentInk }]} {...textScale.dense}>
        {sent ? "Rekor tablosuna yazıldı" : "Rekor tablosuna gönderiliyor…"}
      </Text>
    </View>
  );
}

/* ═════════════════════════ PAYLAŞIM KARTI ═════════════════════════ */

export function ArenaShareSheet({
  visible,
  onClose,
  title,
  score,
  isRecord,
  taunt,
  cityLabel,
  subline,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  score: number;
  isRecord: boolean;
  taunt: string;
  cityLabel: string;
  /** Kartta skorun altına ek satır (ör. "Sorular: İzmir"). */
  subline?: string;
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
            <LinearGradient colors={CARTOON.night} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
            <Text style={styles.shareBrand} {...textScale.badge}>
              elitlig
            </Text>
            <View style={styles.shareGamePill}>
              <Text style={styles.shareGame} numberOfLines={1} {...textScale.badge}>
                {upperTR(`Arena · ${title}`)}
              </Text>
            </View>
            <Text style={styles.shareScore} {...textScale.badge}>
              {formatCount(score)}
            </Text>
            <View style={styles.shareUnitRow}>
              {isRecord ? <Ionicons name="trophy" size={14} color={CARTOON.star} /> : null}
              <Text style={styles.shareUnit} {...textScale.badge}>
                {upperTR(isRecord ? `${SCORE_UNIT} · yeni rekor` : SCORE_UNIT)}
              </Text>
            </View>
            {subline ? (
              <Text style={styles.shareSub} {...textScale.badge}>
                {subline}
              </Text>
            ) : null}
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
          <CartoonButton label="Kapat" icon="close" tone="navy" size="sm" onPress={onClose} style={styles.flex} />
          <CartoonButton
            label="Paylaş"
            icon="share-social"
            tone="green"
            size="sm"
            loading={busy}
            onPress={() => {
              void share();
            }}
            style={styles.flex}
          />
        </View>
      </View>
    </Modal>
  );
}

/* ═════════════════════════ STİLLER ═════════════════════════ */

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;
/** Rekor kupasının arkasındaki yumuşak altın hale (kart içinde kalır). */
const GLOW = 170;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stretch: { alignSelf: "stretch" },
  // overflow: hidden — kart dışına taşan hale/konfeti web'de yatay kaydırma açmasın.
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: CARTOON.dim, overflow: "hidden" },
  scroll: { flex: 1, width: "100%" },
  scrimContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md, paddingVertical: space.xl },
  cardWrap: { maxWidth: 380, width: "100%", alignSelf: "center", paddingTop: 18 },
  card: { alignItems: "center", gap: space.s, paddingTop: space.xxxl, paddingBottom: space.lg, paddingHorizontal: space.md },
  ribbonLayer: { position: "absolute", top: 0, left: space.md, right: space.md, alignItems: "center" },

  recordBadge: { alignItems: "center", gap: space.xs, marginTop: space.xxs },
  // Kupanın arkasında tek, yumuşak altın hale (dönen ışın yok); kupaya ortalı.
  recordGlow: { position: "absolute", top: 30 - GLOW / 2, width: GLOW, height: GLOW },
  recordTitle: { ...type.h1, fontFamily: fonts.bold, color: ARENA_RESULT.recordInk, textAlign: "center" },

  scoreBlock: { alignItems: "center", alignSelf: "stretch" },
  score: {
    ...type.scoreJumbo,
    fontSize: type.scoreJumbo.fontSize * 1.3,
    lineHeight: type.scoreJumbo.lineHeight * 1.3,
    color: ARENA_RESULT.score,
    textAlign: "center",
  },
  unit: { ...type.label, fontFamily: fonts.bold, color: ARENA_RESULT.faint, letterSpacing: 2, marginTop: -space.xs },

  facts: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.xs, marginTop: space.xs },
  fact: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: ARENA_RESULT.edge,
    backgroundColor: ARENA_RESULT.surface,
    paddingHorizontal: space.m,
    paddingVertical: space.xxs + 1,
  },
  factText: { ...type.label, fontFamily: fonts.semibold, color: ARENA_RESULT.ink },

  cityStars: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginTop: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: ARENA_RESULT.starEdge,
    backgroundColor: ARENA_RESULT.starBg,
    maxWidth: "100%",
  },
  cityStarsText: { ...type.label, fontFamily: fonts.bold, color: ARENA_RESULT.starInk, flexShrink: 1 },

  bestRow: { flexDirection: "row", alignItems: "center", gap: space.xxs, marginTop: space.xs },
  bestText: { ...type.bodySm, fontFamily: fonts.semibold, color: ARENA_RESULT.muted },

  actions: { alignSelf: "stretch", gap: space.sm, marginTop: space.s },
  resultRow: { flexDirection: "row", gap: space.sm, alignSelf: "stretch", marginTop: space.xs },

  softWrap: { alignSelf: "stretch" },
  softWrapCompact: { flex: 1, minWidth: 0 },
  softFace: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: ARENA_RESULT.edgeStrong,
    borderBottomColor: ARENA_RESULT.surfaceLip,
    backgroundColor: ARENA_RESULT.surface,
  },
  softFaceCompact: { minHeight: 44, borderRadius: radius.md, gap: space.xs, paddingHorizontal: space.s },
  softText: { ...type.h3, fontFamily: fonts.bold, color: ARENA_RESULT.ink, letterSpacing: 0.6, flexShrink: 1 },
  softTextCompact: { ...type.label, fontFamily: fonts.bold, color: ARENA_RESULT.ink, letterSpacing: 0.6, flexShrink: 1 },

  board: {
    alignSelf: "stretch",
    marginTop: space.sm,
    padding: space.m,
    gap: space.s,
    borderRadius: radius.xl,
    backgroundColor: ARENA_RESULT.surface,
  },
  boardHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  boardIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ARENA_RESULT.row,
    borderWidth: 1,
    borderColor: ARENA_RESULT.edge,
  },
  boardTitle: { ...type.label, fontFamily: fonts.bold, color: ARENA_RESULT.ink, letterSpacing: 1, flex: 1 },
  tabs: { flexDirection: "row", padding: 3, borderRadius: radius.pill, backgroundColor: ARENA_RESULT.tabTrack },
  tab: {
    flex: 1,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: space.s,
  },
  tabOn: {
    backgroundColor: ARENA_RESULT.tabOn,
    shadowColor: ARENA_RESULT.tabShadow,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabText: { ...type.label, fontFamily: fonts.semibold, color: ARENA_RESULT.muted },
  tabTextOn: { fontFamily: fonts.bold, color: ARENA_RESULT.ink },
  boardEmpty: { paddingVertical: space.md, alignItems: "center" },
  boardEmptyText: { ...type.bodySm, fontFamily: fonts.semibold, color: ARENA_RESULT.muted, textAlign: "center", paddingVertical: space.sm },
  boardList: { gap: space.xxs + 2 },
  boardGap: { flexDirection: "row", justifyContent: "center", gap: space.xxs, paddingVertical: space.xxs },
  boardGapDot: { width: 4, height: 4, borderRadius: radius.pill, backgroundColor: ARENA_RESULT.faint },
  boardHint: { ...type.label, fontFamily: fonts.semibold, color: ARENA_RESULT.muted, textAlign: "center" },
  boardMore: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xxs, paddingVertical: space.xxs },
  boardMoreText: { ...type.label, fontFamily: fonts.semibold, color: ARENA_RESULT.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    minHeight: 44,
    paddingVertical: space.xs,
    paddingLeft: space.xs,
    paddingRight: space.m,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: ARENA_RESULT.edge,
    backgroundColor: ARENA_RESULT.row,
  },
  rowMine: { backgroundColor: ARENA_RESULT.rowMine, borderColor: ARENA_RESULT.rowMineEdge },
  rank: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { ...type.tableNumStrong },
  rowName: { ...type.body, fontFamily: fonts.semibold, color: CARTOON.cardInk, flex: 1 },
  rowNameMine: { fontFamily: fonts.bold, color: ARENA_RESULT.rowMineInk },
  rowScore: { ...type.h3, fontFamily: fonts.bold, color: ARENA_RESULT.ink },

  submitLine: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xxs },
  submitPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.s,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    maxWidth: "100%",
  },
  submitGuest: { backgroundColor: ARENA_RESULT.guestBg },
  submitFail: { backgroundColor: ARENA_RESULT.failBg },
  submitPillText: { ...type.label, fontFamily: fonts.bold, flexShrink: 1 },
  submitInfo: { ...type.label, fontFamily: fonts.semibold, color: ARENA_RESULT.muted },

  shareBackdrop: { flex: 1, backgroundColor: CARTOON.dim, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.lg },
  shareCard: {
    width: 280,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: ARENA_RESULT.shareEdge,
    overflow: "hidden",
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    alignItems: "center",
    gap: space.xxs,
  },
  shareBrand: { ...type.h1, fontFamily: fonts.bold, color: CARTOON.white },
  shareGamePill: {
    marginTop: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: ARENA_RESULT.sharePill,
  },
  shareGame: { ...type.label, fontFamily: fonts.bold, color: CARTOON.white, letterSpacing: 1.2 },
  shareScore: {
    ...type.scoreJumbo,
    fontSize: type.scoreJumbo.fontSize * 1.4,
    lineHeight: type.scoreJumbo.lineHeight * 1.4,
    color: CARTOON.white,
    marginTop: space.sm,
  },
  shareUnitRow: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  shareUnit: { ...type.label, fontFamily: fonts.bold, color: QUIZ.muted, letterSpacing: 1.6 },
  shareSub: { ...type.caption, fontFamily: fonts.semibold, color: QUIZ.muted, marginTop: space.xxs },
  shareDivider: { alignSelf: "stretch", height: 1, backgroundColor: ARENA_RESULT.shareEdge, marginVertical: space.md },
  shareTaunt: { ...type.h3, fontFamily: fonts.bold, color: CARTOON.white, textAlign: "center" },
  shareFooter: { ...type.micro, color: QUIZ.faint, marginTop: space.sm },
  shareActions: { flexDirection: "row", gap: space.m, alignSelf: "stretch", maxWidth: 320, width: "100%" },
});
