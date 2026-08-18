import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, Loading } from "@/components/States";
import { PlayerAvatar } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { submitArenaScore } from "@/lib/api/arena";
import { getPlayerRankings } from "@/lib/api/players";
import { queryKeys } from "@/lib/queryKeys";
import { instagramUrl } from "@/lib/socials";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import type { PlayerRankRow } from "@/lib/types";

/**
 * KİM BU? — gizemli oyuncu bilmecesi.
 *
 * Türkiye havuzundan (kapsamsız sıralama) 10 gizemli oyuncu seçilir. Her
 * soru 30 puanla başlar; oyuncu istediği kadar ipucu açabilir (ipucu başına
 * -10). Doğru tahmin kalan puanı kazandırır; yanlış tahmin soruyu yakar ve
 * doğru cevap gösterilir. İpuçları: takımı → maç/gol sayısı → Türkiye gol
 * sıralamasındaki yeri. Tur sonunda toplam puan rekola karşılaştırılır ve
 * koyu meydan okuma kartıyla paylaşılabilir. Sistem oyuncuları ayıklanır;
 * havuz tanınır kalsın diye ilk 80 golcüden kurulur.
 */

const BEST_KEY = "elitlig.kimbu.best.v1";
const ROUND = 10;
const START_POINTS = 30;
const HINT_COST = 10;
const REVEAL_MS = 1300;
const JUNK = /hükmen|hukmen|antpl/i;

interface Mystery {
  secret: PlayerRankRow;
  options: PlayerRankRow[];
  hints: string[];
}

type QPhase = "guess" | "reveal";

export default function KimBuScreen() {
  const scope = useScope();
  const auth = useAuth();

  const query = useQuery({
    queryKey: queryKeys.playerRankings({}, "topScorers"),
    queryFn: () => getPlayerRankings({}, "topScorers"),
    staleTime: 10 * 60_000,
  });

  const pool = useMemo(
    () =>
      (query.data?.players ?? [])
        .filter((p) => p.name && !JUNK.test(p.name) && Number(p.goals) > 0)
        .slice(0, 80),
    [query.data]
  );

  const [best, setBest] = useState(0);
  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY).then((v) => setBest(Number(v) || 0));
  }, []);

  const [round, setRound] = useState<Mystery[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [hintsOpen, setHintsOpen] = useState(0);
  const [phase, setPhase] = useState<QPhase>("guess");
  const [chosen, setChosen] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const buildRound = () => {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const secrets = shuffled.slice(0, ROUND);
    const questions: Mystery[] = secrets.map((secret) => {
      const others = pool
        .filter((p) => p.id !== secret.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      const options = [secret, ...others].sort(() => Math.random() - 0.5);
      const rank = pool.findIndex((p) => p.id === secret.id) + 1;
      const hints = [
        `Takımı: ${secret.teamName ?? "?"}`,
        `${Number(secret.matches) || 0} maçta ${Number(secret.goals) || 0} gol attı`,
        `Türkiye gol sıralamasında ${rank}. sırada`,
      ];
      return { secret, options, hints };
    });
    setRound(questions);
    setQIndex(0);
    setHintsOpen(0);
    setPhase("guess");
    setChosen(null);
    setTotal(0);
    setCorrectCount(0);
    setFinished(false);
  };

  useEffect(() => {
    if (pool.length >= 12 && round.length === 0) buildRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length]);

  const current = round[qIndex];
  const potential = START_POINTS - hintsOpen * HINT_COST;

  const openHint = () => {
    if (phase !== "guess") return;
    if (hintsOpen >= 3 || potential <= HINT_COST) {
      setHintsOpen(Math.min(3, hintsOpen + 1));
      return;
    }
    setHintsOpen(hintsOpen + 1);
  };

  const answer = (id: number) => {
    if (phase !== "guess" || !current) return;
    setChosen(id);
    setPhase("reveal");
    const correct = Number(id) === Number(current.secret.id);
    if (correct) {
      setTotal((t) => t + Math.max(0, potential));
      setCorrectCount((c) => c + 1);
    }
    timer.current = setTimeout(() => {
      if (qIndex + 1 >= round.length) {
        setFinished(true);
        const final = total + (correct ? Math.max(0, potential) : 0);
        if (auth.user && final > 0) submitArenaScore("kimbu", final).catch(() => {});
        setBest((b) => {
          if (final > b) {
            AsyncStorage.setItem(BEST_KEY, String(final));
            return final;
          }
          return b;
        });
      } else {
        setQIndex(qIndex + 1);
        setHintsOpen(0);
        setChosen(null);
        setPhase("guess");
      }
    }, REVEAL_MS);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Kim Bu?" subtitle="Az ipucu, çok puan" />

      {query.isLoading ? (
        <Loading />
      ) : pool.length < 12 ? (
        <EmptyState
          icon="help-circle-outline"
          title="Havuz hazır değil"
          body="Oyuncu verisi şu an yüklenemedi, birazdan tekrar dene."
        />
      ) : finished ? (
        <RoundOver
          total={total}
          correct={correctCount}
          best={best}
          onRestart={buildRound}
          scopeCity={scope.cityLabel}
        />
      ) : !current ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.statusRow}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>SORU {qIndex + 1}/{round.length}</Text>
            </View>
            <View style={[styles.statusPill, styles.pointsPill]}>
              <Text style={styles.pointsText}>PUAN: {total}</Text>
            </View>
            <View style={[styles.statusPill, styles.bestPill]}>
              <Text style={styles.bestText}>🏆 {best}</Text>
            </View>
          </View>

          {/* Gizemli oyuncu kartı */}
          <View style={styles.mysteryCard}>
            {phase === "reveal" ? (
              <PlayerAvatar name={current.secret.name} image={current.secret.image} size={72} />
            ) : (
              <View style={styles.mysteryAvatar}>
                <Text style={styles.mysteryMark}>?</Text>
              </View>
            )}
            <Text style={styles.potential}>
              {phase === "reveal"
                ? current.secret.name.toLocaleUpperCase("tr-TR")
                : `BU SORU: ${Math.max(0, potential)} PUAN`}
            </Text>
          </View>

          {/* İpuçları */}
          <View style={styles.hintsCard}>
            {current.hints.map((hint, index) => (
              <View key={index} style={[styles.hintRow, index > 0 && styles.hintRowBorder]}>
                {index < hintsOpen || phase === "reveal" ? (
                  <Text style={styles.hintText}>💡 {hint}</Text>
                ) : (
                  <Text style={styles.hintLocked}>🔒 İpucu {index + 1}</Text>
                )}
              </View>
            ))}
            {phase === "guess" && hintsOpen < 3 ? (
              <Pressable
                onPress={openHint}
                style={({ pressed }) => [styles.hintBtn, pressed && styles.pressed]}
              >
                <Ionicons name="bulb-outline" size={14} color={colors.turf} />
                <Text style={styles.hintBtnText}>İpucu aç (−{HINT_COST} puan)</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Şıklar */}
          <View style={styles.options}>
            {current.options.map((option) => {
              const isSecret = Number(option.id) === Number(current.secret.id);
              const isChosen = Number(option.id) === Number(chosen);
              return (
                <Pressable
                  key={option.id}
                  onPress={() => answer(Number(option.id))}
                  disabled={phase !== "guess"}
                  style={({ pressed }) => [
                    styles.option,
                    phase === "reveal" && isSecret && styles.optionRight,
                    phase === "reveal" && isChosen && !isSecret && styles.optionWrong,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      phase === "reveal" && (isSecret || (isChosen && !isSecret)) && styles.optionTextLight,
                    ]}
                    numberOfLines={1}
                  >
                    {option.name.toLocaleUpperCase("tr-TR")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function RoundOver({
  total,
  correct,
  best,
  onRestart,
  scopeCity,
}: {
  total: number;
  correct: number;
  best: number;
  onRestart: () => void;
  scopeCity: string;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);
  const isRecord = total > 0 && total >= best;

  const igHandle = (() => {
    const url = instagramUrl(scopeCity);
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
      Alert.alert("Bir sorun oldu", "Görsel oluşturulamadı, tekrar dener misin?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.overWrap}>
      <Text style={styles.overTitle}>{isRecord ? "🏆 YENİ REKOR!" : "Tur bitti!"}</Text>
      <Text style={styles.overScore}>{total} PUAN</Text>
      <Text style={styles.overSub}>
        {correct}/{ROUND} doğru · Rekorun: {best}
      </Text>
      <View style={styles.overButtons}>
        <Pressable
          onPress={onRestart}
          style={({ pressed }) => [styles.overBtn, styles.retryBtn, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={16} color={colors.surface} />
          <Text style={styles.retryText}>Yeni Tur</Text>
        </Pressable>
        <Pressable
          onPress={() => setShareOpen(true)}
          style={({ pressed }) => [styles.overBtn, styles.challengeBtn, pressed && styles.pressed]}
        >
          <Ionicons name="share-social" size={16} color={colors.turf} />
          <Text style={styles.challengeText}>Meydan Oku</Text>
        </Pressable>
      </View>

      <Modal
        visible={shareOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setShareOpen(false)}
      >
        <View style={styles.backdrop}>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <View style={styles.shareCard}>
              <Text style={styles.shareBrand}>elitlig</Text>
              <Text style={styles.shareArena}>ARENA · KİM BU?</Text>
              <Text style={styles.shareScore}>{total}</Text>
              <Text style={styles.shareLabel}>
                PUAN · {correct}/{ROUND} DOĞRU{isRecord ? " · REKOR 🏆" : ""}
              </Text>
              <View style={styles.shareDivider} />
              <Text style={styles.shareChallenge}>"Geç de görelim" 😏</Text>
              <Text style={styles.shareFooter}>ELİTLİG.COM · {igHandle}</Text>
            </View>
          </ViewShot>
          <View style={styles.overButtons}>
            <Pressable
              onPress={() => setShareOpen(false)}
              style={({ pressed }) => [styles.overBtn, styles.closeBtn, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>Kapat</Text>
            </Pressable>
            <Pressable
              onPress={share}
              style={({ pressed }) => [styles.overBtn, styles.retryBtn, pressed && styles.pressed]}
            >
              <Ionicons name="share-social" size={16} color={colors.surface} />
              <Text style={styles.retryText}>{busy ? "Hazırlanıyor…" : "Paylaş"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statusPill: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
  },
  pointsPill: {
    backgroundColor: colors.turfDim,
  },
  pointsText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  bestPill: {
    backgroundColor: colors.goldDim,
  },
  bestText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#8A6A06",
  },
  mysteryCard: {
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    marginBottom: spacing.sm,
  },
  mysteryAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  mysteryMark: {
    fontSize: 36,
    fontWeight: "900",
    color: colors.turf,
  },
  potential: {
    ...type.small,
    fontWeight: "800",
    color: colors.turf,
  },
  hintsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 2,
  },
  hintRow: {
    paddingVertical: 7,
  },
  hintRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.faint,
  },
  hintText: {
    ...type.small,
    color: colors.line,
    fontWeight: "600",
  },
  hintLocked: {
    ...type.small,
    color: colors.muted,
  },
  hintBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.turfDim,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  hintBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.turf,
  },
  options: {
    gap: spacing.sm,
  },
  option: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.turf,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  optionRight: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  optionWrong: {
    backgroundColor: colors.live,
    borderColor: colors.live,
  },
  optionText: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  optionTextLight: {
    color: "#FFFFFF",
  },
  overWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: spacing.lg,
  },
  overTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  overScore: {
    fontSize: 44,
    fontWeight: "900",
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  overSub: {
    ...type.small,
    color: colors.muted,
  },
  overButtons: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  overBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 3,
  },
  retryBtn: {
    backgroundColor: colors.turf,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.surface,
  },
  challengeBtn: {
    backgroundColor: colors.turfDim,
  },
  challengeText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.turf,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  shareCard: {
    width: 264,
    backgroundColor: "#18102C",
    borderRadius: 16,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: 4,
  },
  shareBrand: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  shareArena: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#B9A6E4",
  },
  shareScore: {
    fontSize: 48,
    fontWeight: "900",
    color: "#F0BE2E",
    marginTop: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  shareLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#FFFFFF",
  },
  shareDivider: {
    alignSelf: "stretch",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginVertical: spacing.md,
  },
  shareChallenge: {
    fontSize: 13,
    fontWeight: "700",
    color: "#D9CBF6",
  },
  shareFooter: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#8878B8",
    marginTop: spacing.sm,
  },
  closeBtn: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  closeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
});
