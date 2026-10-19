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
 * yerde, aynı biçimde biter.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import ViewShot, { captureRef } from "react-native-view-shot";

import {
  Badge,
  Button,
  SegmentedControl,
  Touchable,
  useToast,
  withAlpha,
  type SegmentedItem,
} from "@/components/ui";
import {
  getArenaLeaderboard,
  getMyArenaRank,
  startArenaSession,
  submitArenaScore,
  type ArenaEntry,
  type ArenaGame,
} from "@/lib/api/arena";
import { instagramUrl } from "@/lib/socials";
import { useAuth } from "@/providers/AuthProvider";
import { colors, dark as inkPalette, elevate, fonts, hairline, radius, space, textScale, type, upperTR } from "@/theme";

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
        .then(() => {
          // Bu arada yeni tur başladıysa onun oturumuna dokunulmaz.
          if (sessionRef.current === pending) sessionRef.current = null;
          setSubmit("sent");
          void queryClient.invalidateQueries({ queryKey: ["arena"] });
        })
        .catch(() => setSubmit("failed"));
    },
    [auth.user, game, queryClient],
  );

  /* Misafir giriş yapıp döndüyse bekleyen skor kendiliğinden gönderilir. */
  useEffect(() => {
    if (auth.user && submit === "guest" && score != null) send(score);
  }, [auth.user, submit, score, send]);

  /** Tur bitti: rekoru güncelle, skoru gönder. */
  const finish = useCallback(
    (value: number) => {
      setScore(value);
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
    sessionRef.current = auth.user
      ? startArenaSession(game)
          .then((data) => data.sessionId)
          .catch(() => null)
      : null;
  }, [auth.user, game]);

  return {
    best,
    score: score ?? 0,
    isRecord: score != null && score > 0 && score > prevBest,
    submit,
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
}

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
}: ArenaResultCardProps) {
  return (
    <View style={styles.scrim}>
      <ScrollView contentContainerStyle={styles.scrimContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {isRecord ? <Badge label={upperTR("Yeni rekor")} tone="warn" icon="trophy" variant="soft" /> : null}
          <Text style={styles.resultTitle} {...textScale.dense}>
            {isRecord ? "Rekorunu kırdın!" : overTitle}
          </Text>
          <Text style={styles.resultScore} {...textScale.dense}>
            {formatCount(score)}
          </Text>
          <Text style={styles.resultUnit} {...textScale.badge}>
            {upperTR(SCORE_UNIT)}
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

          {extra}

          <Text style={styles.resultBest} {...textScale.dense}>
            {`Kişisel rekorun ${formatCount(best)} ${SCORE_UNIT}`}
          </Text>

          <SubmitLine state={submit} onRetry={onRetrySubmit} onSignIn={onSignIn} />

          <View style={styles.replayRow}>
            <Button label="Tekrar oyna" icon="refresh" size="lg" onPress={onRestart} style={styles.flex} />
            {secondary ? (
              <Button label={secondary.label} icon={secondary.icon} size="lg" variant="secondary" onPress={secondary.onPress} style={styles.flex} />
            ) : null}
          </View>

          <MiniBoard game={game} justSent={submit === "sent"} onBoard={onBoard} />

          <View style={styles.resultRow}>
            <Button label="Tüm tablo" icon="trophy-outline" variant="secondary" onPress={onBoard} style={styles.flex} />
            <Button label="Meydan oku" icon="share-social" variant="ghost" onPress={onShare} style={styles.flex} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ═════════════════════════ MİNİ REKOR TABLOSU ═════════════════════════ */

/**
 * Türkiye geneli ilk 5 + senin sıran. Kapsam bilerek Türkiye: oyunlar herkesin
 * birbiriyle yarıştığı tek tablodur; şehir kırılımı Rekor Tablosu ekranında.
 */
function MiniBoard({ game, justSent, onBoard }: { game: ArenaGame; justSent: boolean; onBoard: () => void }) {
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
        {board.isFetching || (justSent && me.isFetching) ? <ActivityIndicator size="small" color={colors.textTertiary} /> : null}
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
                <Text style={styles.boardGapText}>···</Text>
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

/* ═════════════════════════ SKOR GÖNDERİM SATIRI ═════════════════════════ */

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
              {upperTR(isRecord ? `${SCORE_UNIT} · yeni rekor` : SCORE_UNIT)}
            </Text>
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

/* ═════════════════════════ STİLLER ═════════════════════════ */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  scrimContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: space.md },
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
  resultTitle: { ...type.h1, color: colors.textPrimary, marginTop: space.xs, textAlign: "center" },
  resultScore: { ...type.scoreHero, color: colors.brandAccent, marginTop: space.xs },
  resultUnit: { ...type.micro, color: colors.textTertiary },
  facts: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.xs, marginTop: space.sm },
  fact: { backgroundColor: colors.surface3, borderRadius: radius.pill, paddingHorizontal: space.m, paddingVertical: space.xxs + 1 },
  factText: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.textSecondary },
  resultBest: { ...type.bodySm, color: colors.textSecondary, marginTop: space.s },
  replayRow: { flexDirection: "row", gap: space.m, alignSelf: "stretch", marginTop: space.md },
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
  row: { flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.xs, paddingHorizontal: space.s, borderRadius: radius.md },
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

  submitLine: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.s, paddingVertical: space.xs },
  submitGuest: { backgroundColor: colors.brandDim, borderRadius: radius.pill, paddingHorizontal: space.md },
  submitInfo: { ...type.caption, fontFamily: fonts.semibold, letterSpacing: 0, color: colors.textTertiary },
  submitLink: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.brandAccent },
  submitFail: { ...type.caption, fontFamily: fonts.bold, letterSpacing: 0, color: colors.danger },

  shareBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.lg },
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
  shareScore: { ...type.scoreJumbo, color: inkPalette.warn, marginTop: space.sm },
  shareUnit: { ...type.micro, color: inkPalette.textPrimary },
  shareSub: { ...type.caption, color: inkPalette.textSecondary, marginTop: space.xxs },
  shareDivider: { alignSelf: "stretch", height: hairline, backgroundColor: withAlpha(inkPalette.textPrimary, 0.2), marginVertical: space.md },
  shareTaunt: { ...type.bodySm, fontFamily: fonts.bold, color: inkPalette.textSecondary },
  shareFooter: { ...type.micro, color: inkPalette.textTertiary, marginTop: space.sm },
  shareActions: { flexDirection: "row", gap: space.m },
});
