/**
 * ELİTLİG ARENA — Seri Modu ("daha fazla mı, daha az mı?").
 *
 * OYUN: kapsamdaki oyuncu sıralamasından iki oyuncu çekilir; üsttekinin değeri
 * (GOL / MAÇ / PUAN — turdan tura değişir) açık, alttakinin gizlidir. Doğru
 * bildikçe seri uzar, tek yanlışta biter. Sorular gerçek lig verisinden sonsuz
 * üretilir; sistem oyuncuları (HÜKMEN vb.) havuza alınmaz.
 *
 * OYUN MANTIĞI BU YENİLEMEDE DEĞİŞMEDİ: havuz kurulumu (`pool`), el dağıtımı
 * (`draw`/`start`/`advance`), tahmin değerlendirmesi (`guess`), rekor ve geçmiş
 * yazımı birebir korundu. Yenilenen yalnız SUNUM katmanıdır.
 *
 * SUNUM MİMARİSİ — tek durum makinesi, üç yüz:
 *   1. GİRİŞ — `started` yalnız bir sunum kapısıdır, oyunun `phase` durumuna
 *      dokunmaz. Havuz gelir gelmez ilk el arka planda kurulur (eski davranış);
 *      kullanıcı "Başla"ya basana kadar üstünde giriş kartı durur. Böylece oyun
 *      adı, tek cümlelik kural ve kişisel rekor okunmadan el harcanmaz.
 *   2. OYUN — üstte ince HUD şeridi (skor solda, tabular; rekor ve o turun
 *      metriği sağda), ortada iki oyuncu kartı, altta SABİT tahmin çubuğu.
 *      Çubuk kaydırma alanının DIŞINDADIR: uzayan rekor listesi tahmin
 *      düğmelerini ekrandan itemez.
 *   3. BİTİŞ — `BottomSheet`. Tam ekran kart yerine sheet seçildi; arkadaki son
 *      el görünür kalır, "neyi bilemedim" sorusu cevapsız kalmaz.
 *
 * PAYLAŞIM KARTI NEDEN SABİT PALETTEN: kart bir görüntü olarak uygulamadan
 * çıkar. Aktif temaya bağlansaydı aynı rekor, açık temadaki kullanıcıda beyaz
 * bir kâğıt olurdu. Bu yüzden `dark` paleti doğrudan içe aktarılır — renkler
 * yine tokenlardan gelir, yalnız kullanıcının tema seçiminden bağımsızdır.
 *
 * İKİ MODAL ÜST ÜSTE AÇILMAZ: bitiş sheet'i de paylaşım önizlemesi de `Modal`
 * kullanır; iOS'ta iki modalı üst üste bindirmek güvenilir değildir. Sheet
 * `!shareOpen` koşuluyla geri çekilir, paylaşım kapanınca geri gelir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  Touchable,
  useToast,
  withAlpha,
} from "@/components/ui";
import { submitArenaScore } from "@/lib/api/arena";
import { getPlayerRankings } from "@/lib/api/players";
import { queryKeys } from "@/lib/queryKeys";
import { instagramUrl } from "@/lib/socials";
import type { PlayerRankRow } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  dark as inkPalette,
  elevate,
  fonts,
  hairline,
  haptics,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

/* ========================= SABİTLER (oyun mantığı) ========================= */

const BEST_KEY = "elitlig.arena.best.v1";
const HISTORY_KEY = "elitlig.arena.history.v1";

interface HistoryEntry {
  streak: number;
  date: string;
}
const REVEAL_MS = 850;

const METRICS = [
  { key: "goals", label: "GOL" },
  { key: "matches", label: "MAÇ" },
  { key: "points", label: "PUAN" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

interface Contender {
  id: number;
  name: string;
  image: string | null;
  team: string;
  values: Record<MetricKey, number>;
}

type Phase = "guess" | "correct" | "wrong" | "over";

/** Skorun sunucuya gidişi — bitiş kartında tek satırla anlatılır. */
type SubmitState = "idle" | "guest" | "sending" | "sent" | "failed";

/** Alt oyuncu kartının okunuşu: değer gizli mi, doğru mu bilindi mi. */
type RevealState = "known" | "hidden" | "correct" | "wrong";

/* ================================ EKRAN ================================ */

export default function ArenaScreen() {
  const router = useRouter();
  const scope = useScope();
  const auth = useAuth();
  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const rankingsQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready,
    staleTime: 10 * 60_000,
  });

  const pool = useMemo<Contender[]>(() => {
    const junk = /hükmen|hukmen|antpl/i;
    return (rankingsQuery.data?.players ?? [])
      .filter((p) => p.name && !junk.test(p.name))
      .map((p: PlayerRankRow) => ({
        id: Number(p.id),
        name: p.name,
        image: p.image ?? null,
        team: p.teamName ?? "",
        values: {
          goals: Number(p.goals) || 0,
          matches: Number(p.matches) || 0,
          points: Number(p.points) || 0,
        },
      }))
      .filter((p) => p.id && p.values.matches > 0);
  }, [rankingsQuery.data]);

  const [best, setBest] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY).then((v) => setBest(Number(v) || 0));
    AsyncStorage.getItem(HISTORY_KEY).then((v) => {
      try {
        setHistory(JSON.parse(v ?? "[]"));
      } catch {
        setHistory([]);
      }
    });
  }, []);

  /** Biten seriyi geçmişe yazar (en iyi 20 tutulur). */
  const record = (finished: number) => {
    if (finished <= 0) return;
    setHistory((current) => {
      const next = [...current, { streak: finished, date: new Date().toISOString() }]
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 20);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const [streak, setStreak] = useState(0);
  const [phase, setPhase] = useState<Phase>("guess");
  const [metric, setMetric] = useState<MetricKey>("goals");
  const [top, setTop] = useState<Contender | null>(null);
  const [bottom, setBottom] = useState<Contender | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /* — Sunum durumu: oyunun durum makinesine karışmaz — */
  const [started, setStarted] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [shareOpen, setShareOpen] = useState(false);

  /** Değerleri eşit olmayan yeni bir rakip + metrik seçer. */
  const draw = (anchor: Contender | null): { next: Contender; m: MetricKey } | null => {
    if (pool.length < 2) return null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const m = METRICS[Math.floor(Math.random() * METRICS.length)].key;
      const next = pool[Math.floor(Math.random() * pool.length)];
      if (!next) continue;
      if (anchor && (next.id === anchor.id || next.values[m] === anchor.values[m])) continue;
      if (!anchor) return { next, m };
      return { next, m };
    }
    return null;
  };

  const start = () => {
    if (pool.length < 2) return;
    const first = pool[Math.floor(Math.random() * pool.length)];
    const second = draw(first);
    if (!second) return;
    setTop(first);
    setBottom(second.next);
    setMetric(second.m);
    setStreak(0);
    setPhase("guess");
  };

  // Havuz gelince ilk eli kur
  useEffect(() => {
    if (pool.length >= 2 && !top) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length]);

  const advance = () => {
    if (!bottom) return;
    const next = draw(bottom);
    if (!next) return;
    setTop(bottom);
    setBottom(next.next);
    setMetric(next.m);
    setPhase("guess");
  };

  /**
   * Skoru rekor tablosuna yollar. Tetikleme koşulu eskisiyle birebir aynı
   * (oturum var + seri > 0); tek fark, sonucun artık sessizce yutulmak yerine
   * bitiş kartında bir satır olarak görünmesi ve tekrar denenebilmesi.
   */
  const submitScore = (value: number) => {
    if (value <= 0) {
      setSubmit("idle");
      return;
    }
    if (!auth.user) {
      setSubmit("guest");
      return;
    }
    setSubmit("sending");
    submitArenaScore("seri", value)
      .then(() => setSubmit("sent"))
      .catch(() => setSubmit("failed"));
  };

  const guess = (higher: boolean) => {
    if (phase !== "guess" || !top || !bottom) return;
    const a = top.values[metric];
    const b = bottom.values[metric];
    const correct = higher ? b > a : b < a;
    if (correct) {
      const s = streak + 1;
      setStreak(s);
      setPhase("correct");
      if (s > best) {
        setBest(s);
        AsyncStorage.setItem(BEST_KEY, String(s));
      }
      haptics.light();
      timer.current = setTimeout(advance, REVEAL_MS);
    } else {
      setPhase("wrong");
      record(streak);
      submitScore(streak);
      haptics.warning();
      timer.current = setTimeout(() => setPhase("over"), REVEAL_MS);
    }
  };

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? "";
  const isRecord = streak > 0 && streak >= best;

  const openBoard = () => router.push({ pathname: "/siralama", params: { game: "seri" } });
  const openSignIn = () => router.push("/giris");

  /** Yeni el: sunum kapısı açık kalır, oyun sıfırdan kurulur. */
  const restart = () => {
    setSubmit("idle");
    setShareOpen(false);
    start();
  };

  const beginGame = () => {
    setSubmit("idle");
    setStarted(true);
    start();
  };

  const headerActions = useMemo(
    () => [
      {
        icon: "trophy-outline" as keyof typeof Ionicons.glyphMap,
        onPress: () => router.push({ pathname: "/siralama", params: { game: "seri" } }),
        accessibilityLabel: "Rekor tablosu",
      },
    ],
    [router]
  );

  const bottomReveal: RevealState =
    phase === "guess" ? "hidden" : phase === "correct" ? "correct" : "wrong";

  /**
   * NEDEN ALT BİLEŞENLER `React.memo` DEĞİL: her tahminde `phase` değişiyor ve
   * ekrandaki her şey zaten yeniden çiziliyor. Memo defterini tutmak burada
   * kazanç değil, sabit maliyettir (§bkz. components/ui/README "Tuzaklar").
   */
  const body = (() => {
    if (rankingsQuery.isLoading) return <PoolSkeleton />;

    if (rankingsQuery.isError && pool.length === 0) {
      return (
        <ErrorState
          error={rankingsQuery.error}
          onRetry={() => {
            void rankingsQuery.refetch();
          }}
        />
      );
    }

    if (pool.length < 2) {
      return (
        <EmptyState
          icon="game-controller-outline"
          title="Havuz hazır değil"
          body="Bu kapsamda yeterli oyuncu verisi yok. Üstten farklı bir lig ya da sezon seçmeyi dene."
          action={{ label: "Rekor tablosu", onPress: openBoard, haptic: "light" }}
        />
      );
    }

    if (!top || !bottom) return <PoolSkeleton />;

    if (!started) return <StartCard best={best} onStart={beginGame} />;

    return (
      <>
        {/* — HUD: skor solda (tabular), rekor ve tur metriği sağda — */}
        <View style={styles.hud}>
          <View style={styles.hudScoreBox}>
            <Text style={styles.hudLabel} {...textScale.badge}>
              {upperTR("Seri")}
            </Text>
            <Text style={styles.hudScore} {...textScale.dense}>
              {streak}
            </Text>
          </View>

          <View style={styles.hudRight}>
            <View style={styles.hudPill}>
              <Ionicons name="trophy" size={11} color={colors.star} />
              <Text style={styles.hudPillText} {...textScale.badge}>
                {best}
              </Text>
            </View>
            <View style={[styles.hudPill, styles.hudPillBrand]}>
              <Text style={styles.hudPillBrandText} {...textScale.badge}>
                {metricLabel}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ContenderCard
            name={top.name}
            team={top.team}
            image={top.image}
            metricLabel={metricLabel}
            value={top.values[metric]}
            state="known"
          />

          <View style={styles.connector}>
            <View style={styles.connectorLine} />
            <Text style={styles.connectorText} {...textScale.badge}>
              {upperTR(`${metricLabel} sayısı?`)}
            </Text>
            <View style={styles.connectorLine} />
          </View>

          <ContenderCard
            name={bottom.name}
            team={bottom.team}
            image={bottom.image}
            metricLabel={metricLabel}
            value={phase === "guess" ? null : bottom.values[metric]}
            state={bottomReveal}
          />

          <Text style={styles.hint} {...textScale.dense}>
            Üstteki oyuncunun {metricLabel.toLocaleLowerCase("tr-TR")} sayısı açık. Alttaki daha mı
            fazla, daha mı az?
          </Text>

          {history.length > 0 ? (
            <View style={styles.historyBlock}>
              <SectionHeader title="Rekor listem" meta={`${history.length} seri`} />
              <View style={styles.historyBox}>
                {history.slice(0, 5).map((entry, index) => (
                  <View
                    key={`${entry.date}-${index}`}
                    style={[styles.historyRow, index > 0 ? styles.historyRowBorder : null]}
                  >
                    <View style={[styles.historyRank, index === 0 ? styles.historyRankTop : null]}>
                      <Text
                        style={[
                          styles.historyRankText,
                          index === 0 ? styles.historyRankTextTop : null,
                        ]}
                        {...textScale.badge}
                      >
                        {index + 1}
                      </Text>
                    </View>
                    <Text style={styles.historyStreak} {...textScale.dense}>
                      {entry.streak}
                    </Text>
                    <Text style={styles.historyUnit} {...textScale.badge}>
                      seri
                    </Text>
                    <View style={styles.flex} />
                    <Text style={styles.historyDate} {...textScale.badge}>
                      {new Date(entry.date).toLocaleDateString("tr-TR", {
                        day: "numeric",
                        month: "short",
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        {/* — Sabit tahmin çubuğu: liste uzasa da başparmağın altında kalır — */}
        <View style={styles.guessBar}>
          <Touchable
            feedback="button"
            onPress={() => guess(true)}
            disabled={phase !== "guess"}
            style={[styles.guessBtn, styles.guessMore, phase !== "guess" ? styles.guessOff : null]}
            accessibilityRole="button"
            accessibilityLabel={`Alttaki oyuncunun ${metricLabel} sayısı daha fazla`}
          >
            <Ionicons name="arrow-up" size={18} color={colors.win} />
            <Text style={styles.guessMoreText} {...textScale.dense}>
              {upperTR("Daha fazla")}
            </Text>
          </Touchable>

          <Touchable
            feedback="button"
            onPress={() => guess(false)}
            disabled={phase !== "guess"}
            style={[styles.guessBtn, styles.guessLess, phase !== "guess" ? styles.guessOff : null]}
            accessibilityRole="button"
            accessibilityLabel={`Alttaki oyuncunun ${metricLabel} sayısı daha az`}
          >
            <Ionicons name="arrow-down" size={18} color={colors.loss} />
            <Text style={styles.guessLessText} {...textScale.dense}>
              {upperTR("Daha az")}
            </Text>
          </Touchable>
        </View>
      </>
    );
  })();

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Arena"
        overline={upperTR("Seri modu")}
        subtitle="Daha fazla mı, daha az mı?"
        back
        actions={headerActions}
      />

      {body}

      {/* Bitiş kartı — paylaşım önizlemesi açıkken geri çekilir (bkz. dosya başı). */}
      <BottomSheet visible={phase === "over" && !shareOpen} onClose={restart} snap="content">
        <View style={styles.over}>
          {isRecord ? (
            <Badge label={upperTR("Yeni rekor")} tone="warn" icon="trophy" variant="soft" />
          ) : null}

          <Text style={styles.overTitle} {...textScale.dense}>
            {isRecord ? "Rekorunu kırdın!" : "Seri bitti"}
          </Text>

          <Text style={styles.overScore} {...textScale.dense}>
            {streak}
          </Text>
          <Text style={styles.overUnit} {...textScale.badge}>
            {upperTR("doğru seri")}
          </Text>

          <Text style={styles.overBest} {...textScale.dense}>
            {`Rekorun ${best} seri`}
          </Text>

          <SubmitLine
            state={submit}
            onRetry={() => submitScore(streak)}
            onSignIn={openSignIn}
          />

          <View style={styles.overActions}>
            <Button label="Tekrar oyna" icon="refresh" size="lg" fullWidth onPress={restart} />
            <View style={styles.overRow}>
              <Button
                label="Rekor tablosu"
                icon="trophy-outline"
                variant="secondary"
                onPress={openBoard}
                style={styles.flex}
              />
              <Button
                label="Meydan oku"
                icon="share-social"
                variant="ghost"
                onPress={() => setShareOpen(true)}
                style={styles.flex}
              />
            </View>
          </View>
        </View>
      </BottomSheet>

      <ShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        streak={streak}
        isRecord={isRecord}
        cityLabel={scope.cityLabel}
      />
    </SafeAreaView>
  );
}

/* ============================ GİRİŞ KARTI ============================ */

/** Oyun adı, tek cümlelik kural, kişisel rekor ve tek büyük eylem. */
function StartCard({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <View style={styles.startWrap}>
      <LinearGradient
        colors={[withAlpha(colors.brand, 0.22), colors.surface1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.startCard}
      >
        <View style={styles.startIcon}>
          <Ionicons name="flame" size={22} color={colors.brandAccent} />
        </View>

        <Text style={styles.startOverline} {...textScale.badge}>
          {upperTR("Elitlig Arena")}
        </Text>
        <Text style={styles.startTitle} {...textScale.dense}>
          Seri Modu
        </Text>
        <Text style={styles.startRule} {...textScale.long}>
          İki oyuncudan alttakinin sayısı daha mı fazla, daha mı az — yanlışa kadar seriyi uzat.
        </Text>

        <View style={styles.startBest}>
          <Ionicons name="trophy" size={13} color={colors.star} />
          <Text style={styles.startBestText} {...textScale.dense}>
            {best > 0 ? `Rekorun ${best} seri` : "Henüz rekorun yok"}
          </Text>
        </View>

        <Button label="Başla" icon="play" size="lg" fullWidth onPress={onStart} />
      </LinearGradient>
    </View>
  );
}

/* ============================ OYUNCU KARTI ============================ */

function ContenderCard({
  name,
  team,
  image,
  metricLabel,
  value,
  state,
}: {
  name: string;
  team: string;
  image: string | null;
  metricLabel: string;
  /** null → değer henüz gizli. */
  value: number | null;
  state: RevealState;
}) {
  const boxStyle =
    state === "known"
      ? styles.cardKnown
      : state === "correct"
        ? styles.cardCorrect
        : state === "wrong"
          ? styles.cardWrong
          : styles.cardHidden;

  const valueColor =
    state === "known"
      ? styles.valueKnown
      : state === "correct"
        ? styles.valueCorrect
        : state === "wrong"
          ? styles.valueWrong
          : styles.valueHidden;

  return (
    <View
      style={[styles.card, boxStyle]}
      accessibilityRole="summary"
      accessibilityLabel={`${name}, ${team}. ${value == null ? "Değeri gizli" : `${value} ${metricLabel}`}`}
    >
      <Avatar
        name={name}
        image={image}
        size={40}
        ring={state === "known" ? "brand" : "none"}
      />

      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1} {...textScale.dense}>
          {upperTR(name)}
        </Text>
        <Text style={styles.cardTeam} numberOfLines={1} {...textScale.dense}>
          {team || "—"}
        </Text>
      </View>

      <View style={styles.cardValue}>
        <Text style={[styles.value, valueColor]} {...textScale.dense}>
          {value == null ? "?" : value}
        </Text>
        <Text style={styles.valueUnit} {...textScale.badge}>
          {metricLabel}
        </Text>
      </View>
    </View>
  );
}

/* ======================= SKOR GÖNDERİM SATIRI ======================= */

function SubmitLine({
  state,
  onRetry,
  onSignIn,
}: {
  state: SubmitState;
  onRetry: () => void;
  onSignIn: () => void;
}) {
  if (state === "idle") return null;

  if (state === "guest") {
    return (
      <Touchable
        feedback="button"
        haptic="light"
        onPress={onSignIn}
        style={styles.submitLine}
        accessibilityRole="button"
        accessibilityLabel="Giriş yap, skorun rekor tablosuna yazılsın"
      >
        <Ionicons name="log-in-outline" size={13} color={colors.brandAccent} />
        <Text style={styles.submitLink} {...textScale.dense}>
          Giriş yap, skorun tabloya yazılsın
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

/* ========================== İSKELET / PAYLAŞIM ========================== */

function PoolSkeleton() {
  return (
    <View style={styles.loading}>
      <Skeleton width="100%" height={72} radius="lg" />
      <Skeleton width="45%" height={12} radius="xs" style={styles.loadingCenter} />
      <Skeleton width="100%" height={72} radius="lg" />
      <Skeleton width="70%" height={12} radius="xs" style={styles.loadingCenter} />
    </View>
  );
}

/**
 * Meydan okuma kartı — ViewShot ile PNG'ye çevrilip paylaşılır.
 * Renkler `inkPalette` (sabit koyu palet) üstünden gelir; bkz. dosya başı.
 */
function ShareSheet({
  visible,
  onClose,
  streak,
  isRecord,
  cityLabel,
}: {
  visible: boolean;
  onClose: () => void;
  streak: number;
  isRecord: boolean;
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
          <LinearGradient
            colors={[inkPalette.brandDim, inkPalette.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.shareCard}
          >
            <Text style={styles.shareBrand} {...textScale.badge}>
              elitlig
            </Text>
            <Text style={styles.shareGame} {...textScale.badge}>
              {upperTR("Arena · Seri Modu")}
            </Text>

            <Text style={styles.shareScore} {...textScale.badge}>
              {streak}
            </Text>
            <Text style={styles.shareUnit} {...textScale.badge}>
              {upperTR(isRecord ? "seri · yeni rekor" : "seri")}
            </Text>

            <View style={styles.shareDivider} />

            <Text style={styles.shareTaunt} {...textScale.badge}>
              Geç de görelim
            </Text>
            <Text style={styles.shareFooter} {...textScale.badge}>
              {upperTR(`elitlig.com · ${igHandle}`)}
            </Text>
          </LinearGradient>
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

  /* — Yükleme — */
  loading: {
    padding: layout.screenPadding,
    gap: space.md,
  },
  loadingCenter: { alignSelf: "center" },

  /* — Giriş kartı — */
  startWrap: {
    flex: 1,
    justifyContent: "center",
    padding: layout.screenPadding,
  },
  startCard: {
    borderRadius: radius.xl,
    // Yüzen kart (§yükselti 4); marka çerçevesi kasıtlı olarak korunur.
    ...elevate(4),
    borderColor: colors.brandBorder,
    padding: space.xl,
    gap: space.s,
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
  startOverline: {
    ...type.micro,
    color: colors.brandAccent,
  },
  startTitle: {
    ...type.display,
    color: colors.textPrimary,
  },
  startRule: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: space.xs,
  },
  startBest: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    marginBottom: space.m,
  },
  startBestText: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },

  /* — HUD şeridi — */
  hud: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface1,
  },
  hudScoreBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.s,
  },
  hudLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  hudScore: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  hudRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  hudPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    borderRadius: radius.pill,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
    backgroundColor: colors.surface3,
  },
  hudPillText: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  hudPillBrand: {
    backgroundColor: colors.brandDim,
  },
  hudPillBrandText: {
    ...type.micro,
    color: colors.brandAccent,
  },

  /* — Oyun alanı — */
  content: {
    padding: layout.screenPadding,
    paddingBottom: space.xxl,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  cardKnown: {
    backgroundColor: colors.brandDim,
    borderColor: colors.brandBorder,
  },
  cardHidden: {
    backgroundColor: colors.surface1,
    borderColor: colors.border,
  },
  cardCorrect: {
    backgroundColor: colors.winDim,
    borderColor: colors.win,
  },
  cardWrong: {
    backgroundColor: colors.lossDim,
    borderColor: colors.loss,
  },
  cardBody: { flex: 1, gap: space.xxs },
  cardName: {
    ...type.h3,
    color: colors.textPrimary,
  },
  cardTeam: {
    ...type.caption,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textSecondary,
  },
  cardValue: {
    alignItems: "flex-end",
    minWidth: 54,
  },
  value: {
    ...type.scoreLg,
  },
  valueKnown: { color: colors.brandAccent },
  valueHidden: { color: colors.textTertiary },
  valueCorrect: { color: colors.win },
  valueWrong: { color: colors.loss },
  valueUnit: {
    ...type.micro,
    color: colors.textTertiary,
  },

  connector: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingVertical: space.md,
  },
  connectorLine: {
    flex: 1,
    height: hairline,
    backgroundColor: colors.separator,
  },
  connectorText: {
    ...type.micro,
    color: colors.textTertiary,
  },

  hint: {
    ...type.caption,
    fontFamily: fonts.medium,
    letterSpacing: 0,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.lg,
  },

  /* — Rekor listesi — */
  historyBlock: { marginTop: space.lg },
  historyBox: {
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.m,
  },
  historyRowBorder: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  historyRank: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  historyRankTop: {
    backgroundColor: colors.warnDim,
  },
  historyRankText: {
    ...type.micro,
    color: colors.textSecondary,
  },
  historyRankTextTop: {
    color: colors.star,
  },
  historyStreak: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  historyUnit: {
    ...type.micro,
    color: colors.textTertiary,
  },
  historyDate: {
    ...type.caption,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textTertiary,
  },

  /* — Sabit tahmin çubuğu — */
  guessBar: {
    flexDirection: "row",
    gap: space.m,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.surface1,
  },
  guessBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    height: 52,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  guessMore: {
    backgroundColor: colors.winDim,
    borderColor: colors.win,
  },
  guessLess: {
    backgroundColor: colors.lossDim,
    borderColor: colors.loss,
  },
  guessOff: { opacity: 0.45 },
  guessMoreText: {
    ...type.h3,
    color: colors.win,
  },
  guessLessText: {
    ...type.h3,
    color: colors.loss,
  },

  /* — Bitiş kartı — */
  over: {
    alignItems: "center",
    gap: space.xs,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  overTitle: {
    ...type.h1,
    color: colors.textPrimary,
    marginTop: space.xs,
  },
  overScore: {
    ...type.scoreHero,
    color: colors.brandAccent,
    marginTop: space.xs,
  },
  overUnit: {
    ...type.micro,
    color: colors.textTertiary,
  },
  overBest: {
    ...type.bodySm,
    color: colors.textSecondary,
    marginTop: space.xs,
  },
  overActions: {
    alignSelf: "stretch",
    gap: space.m,
    marginTop: space.lg,
  },
  overRow: {
    flexDirection: "row",
    gap: space.m,
  },

  submitLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginTop: space.sm,
    paddingVertical: space.xs,
  },
  submitInfo: {
    ...type.caption,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textTertiary,
  },
  submitLink: {
    ...type.caption,
    fontFamily: fonts.bold,
    letterSpacing: 0,
    color: colors.brandAccent,
  },
  submitFail: {
    ...type.caption,
    fontFamily: fonts.bold,
    letterSpacing: 0,
    color: colors.danger,
  },

  /* — Paylaşım kartı (sabit koyu palet) — */
  shareBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.lg,
  },
  shareCard: {
    width: 268,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: inkPalette.brandBorder,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    alignItems: "center",
    gap: space.xxs,
  },
  shareBrand: {
    ...type.h2,
    color: inkPalette.textPrimary,
  },
  shareGame: {
    ...type.micro,
    color: inkPalette.brandAccent,
  },
  shareScore: {
    ...type.scoreHero,
    fontSize: 56,
    lineHeight: 60,
    color: inkPalette.warn,
    marginTop: space.sm,
  },
  shareUnit: {
    ...type.micro,
    color: inkPalette.textPrimary,
  },
  shareDivider: {
    alignSelf: "stretch",
    height: hairline,
    backgroundColor: withAlpha(inkPalette.textPrimary, 0.2),
    marginVertical: space.md,
  },
  shareTaunt: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: inkPalette.textSecondary,
  },
  shareFooter: {
    ...type.micro,
    color: inkPalette.textTertiary,
    marginTop: space.sm,
  },
  shareActions: {
    flexDirection: "row",
    gap: space.m,
  },
});
