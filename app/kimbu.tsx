/**
 * KİM BU? — gizemli oyuncu bilmecesi.
 *
 * OYUN MANTIĞI KORUNDU (dokunulmadı): Türkiye havuzundan (ilk 80 golcü) 10
 * gizemli oyuncu seçilir; her soru 30 puanla başlar, açılan her ipucu 10 puan
 * götürür. Doğru tahmin kalan puanı yazar, yanlış tahmin soruyu yakar ve doğru
 * cevabı gösterir. İpuçları sırayla: takım → maç/gol → Türkiye gol sırası.
 *
 * BU DOSYADA YENİLENEN YALNIZ SUNUM:
 *   • PUAN DÜŞÜŞÜ artık iki yerde birden okunur: ortadaki halka (kalan puan /
 *     30) ve altındaki üç kutucuk (her kutucuk bir ipucu = −10 puan). Kutucuk
 *     söndükçe "ne kaybettiğini" görürsün.
 *   • İpucu kartları kilitli/açık ayrımını ikon ve renkle söyler; kilitli
 *     satırda bedeli yazar.
 *   • Şıklar dokunsaldır (doğru → success, yanlış → error) ve cevap açıldığında
 *     dolu renkle işaretlenir; seçilmeyen şıklar söner.
 *   • Sonuç ekranı halka + üç sayı (doğru · puan · rekor) ile özetler.
 *   • Paylaşım kartı tema tokenlarıyla yeniden çizildi ve modal yerine
 *     `BottomSheet` içine taşındı; hata artık Alert değil toast.
 *
 * ESKİ KAPILAR KAPATILDI: `components/ScreenHeader` → `components/ui`
 * `ScreenHeader`, `components/States` → `components/ui`, `TeamCrest`in
 * `PlayerAvatar`ı → `components/ui` `Avatar`, `constants/theme` → `@/theme`.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  ProgressRing,
  ScreenHeader,
  Skeleton,
  Touchable,
  useToast,
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
  hairline,
  haptics,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

/* ═════════════════════════ OYUN SABİTLERİ (değişmedi) ═════════════════════ */

const BEST_KEY = "elitlig.kimbu.best.v1";
const ROUND = 10;
const START_POINTS = 30;
const HINT_COST = 10;
const REVEAL_MS = 1300;
const JUNK = /hükmen|hukmen|antpl/i;

/** Kaç ipucu var — puan kutucukları da bu sayıdan türer. */
const HINT_COUNT = 3;

interface Mystery {
  secret: PlayerRankRow;
  options: PlayerRankRow[];
  hints: string[];
}

type QPhase = "guess" | "reveal";

/* ═════════════════════════ SAF YARDIMCILAR ═════════════════════════ */

/** 1240 → "1.240" (binlik ayracı Türkçe nokta). */
function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Kalan puana göre halka tonu — düştükçe uyarıya döner. */
function pointsTone(potential: number): "brand" | "warn" | "danger" {
  if (potential <= 0) return "danger";
  if (potential <= HINT_COST) return "warn";
  return "brand";
}

/* ═════════════════════════ KÜÇÜK PARÇALAR ═════════════════════════ */

/** Sonuç şeridinde tek hücre (doğru · puan · rekor). */
const StatCell = React.memo(function StatCell({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={accent ? styles.statValueAccent : styles.statValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

/**
 * İPUCU SATIRI — kilitliyken bedelini, açıkken metnini gösterir.
 * Basılabilir DEĞİLDİR: ipucu açma tek kapıdan (aşağıdaki düğme) geçsin ki
 * "yanlışlıkla dokundum, 10 puan gitti" olmasın.
 */
const HintRow = React.memo(function HintRow({
  index,
  text,
  open,
  first,
}: {
  index: number;
  text: string;
  open: boolean;
  /** İlk satırda üst ayraç çizilmez. */
  first: boolean;
}) {
  return (
    <View style={[styles.hintRow, first ? null : styles.hintRowBorder]}>
      <Ionicons
        name={open ? "bulb" : "lock-closed"}
        size={14}
        color={open ? colors.warn : colors.textTertiary}
      />
      {open ? (
        <Text style={styles.hintText} numberOfLines={2} {...textScale.dense}>
          {text}
        </Text>
      ) : (
        <>
          <Text style={styles.hintLocked} numberOfLines={1} {...textScale.dense}>
            {`${index + 1}. ipucu`}
          </Text>
          <View style={styles.flex} />
          <Text style={styles.hintCost} {...textScale.badge}>
            {`−${HINT_COST}`}
          </Text>
        </>
      )}
    </View>
  );
});

/* ═════════════════════════ EKRAN ═════════════════════════ */

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
    /* Yalnız geri bildirim — skora etkisi yok. */
    if (correct) haptics.success();
    else haptics.error();
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

  const revealed = phase === "reveal";
  const guessedRight =
    revealed && current != null && Number(chosen) === Number(current.secret.id);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Kim Bu?" subtitle="Az ipucu, çok puan" back />

      {query.isLoading ? (
        <View style={styles.loading}>
          <Skeleton width="100%" height={64} radius="lg" />
          <Skeleton width="100%" height={168} radius="lg" />
          <Skeleton width="100%" height={124} radius="lg" />
          <Skeleton width="100%" height={50} radius="md" />
          <Skeleton width="100%" height={50} radius="md" />
        </View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : pool.length < 12 ? (
        <EmptyState
          icon="help-circle-outline"
          title="Havuz hazır değil"
          body="Oyuncu verisi şu an yüklenemedi, birazdan tekrar dene."
          action={{ label: "Tekrar dene", onPress: () => query.refetch(), haptic: "light" }}
        />
      ) : finished ? (
        <RoundOver
          total={total}
          correct={correctCount}
          best={best}
          onRestart={buildRound}
          scopeCity={scope.cityLabel}
          signedIn={Boolean(auth.user)}
        />
      ) : !current ? (
        <View style={styles.loading}>
          <Skeleton width="100%" height={64} radius="lg" />
          <Skeleton width="100%" height={168} radius="lg" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* — Durum şeridi — */}
          <View style={styles.hud}>
            <StatCell value={`${qIndex + 1}/${round.length}`} label="soru" />
            <View style={styles.statDivider} />
            <StatCell value={formatCount(total)} label="puan" accent />
            <View style={styles.statDivider} />
            <StatCell value={best > 0 ? formatCount(best) : "—"} label="rekor" />
          </View>

          {/* — Gizemli oyuncu + puan düşüşü — */}
          <View style={styles.mysteryCard}>
            {revealed ? (
              <Avatar
                name={current.secret.name}
                image={current.secret.image}
                size={72}
                ring={guessedRight ? "brand" : "none"}
              />
            ) : (
              <View style={styles.mysteryMarkBox}>
                <Text style={styles.mysteryMark} {...textScale.badge}>
                  ?
                </Text>
              </View>
            )}

            {revealed ? (
              <>
                <Text style={styles.secretName} numberOfLines={1} {...textScale.dense}>
                  {upperTR(current.secret.name)}
                </Text>
                <Badge
                  label={guessedRight ? `Doğru · +${Math.max(0, potential)} puan` : "Bilemedin"}
                  tone={guessedRight ? "win" : "danger"}
                  size="sm"
                />
              </>
            ) : (
              <>
                <ProgressRing
                  value={potential / START_POINTS}
                  size={72}
                  thickness={6}
                  tone={pointsTone(potential)}
                  label={String(Math.max(0, potential))}
                  sublabel="puan"
                />

                {/* Puan düşüşü: her kutucuk bir ipucu = −10 puan. */}
                <View style={styles.dropRow}>
                  {Array.from({ length: HINT_COUNT }, (_, index) => (
                    <View
                      key={index}
                      style={[styles.dropCell, index < hintsOpen ? styles.dropCellSpent : null]}
                    />
                  ))}
                </View>
                <Text style={styles.dropHint} numberOfLines={1} {...textScale.badge}>
                  {hintsOpen === 0
                    ? upperTR("Hiç ipucu açmadın")
                    : upperTR(`${hintsOpen} ipucu · −${hintsOpen * HINT_COST} puan`)}
                </Text>
              </>
            )}
          </View>

          {/* — İpuçları — */}
          <View style={styles.hintsCard}>
            {current.hints.map((hint, index) => (
              <HintRow
                key={`${index}-${hint}`}
                index={index}
                text={hint}
                open={index < hintsOpen || revealed}
                first={index === 0}
              />
            ))}

            {phase === "guess" && hintsOpen < HINT_COUNT ? (
              <Button
                label={`İpucu aç · −${HINT_COST} puan`}
                icon="bulb-outline"
                variant="secondary"
                size="sm"
                fullWidth
                haptic="light"
                onPress={openHint}
                style={styles.hintButton}
              />
            ) : null}
          </View>

          {/* — Şıklar — */}
          <View style={styles.options}>
            {current.options.map((option) => {
              const isSecret = Number(option.id) === Number(current.secret.id);
              const isChosen = Number(option.id) === Number(chosen);
              const right = revealed && isSecret;
              const wrong = revealed && isChosen && !isSecret;
              return (
                <Touchable
                  key={option.id}
                  feedback="button"
                  /* Titreşim şıkta değil `answer()` içinde: doğru ve yanlış
                     ayrı ton çalar. */
                  haptic="none"
                  onPress={() => answer(Number(option.id))}
                  disabled={phase !== "guess"}
                  accessibilityRole="button"
                  accessibilityLabel={option.name}
                  accessibilityState={{ disabled: phase !== "guess" }}
                  style={[
                    styles.option,
                    right ? styles.optionRight : null,
                    wrong ? styles.optionWrong : null,
                    revealed && !right && !wrong ? styles.optionMuted : null,
                  ]}
                >
                  <Text
                    style={[styles.optionText, right || wrong ? styles.optionTextOn : null]}
                    numberOfLines={1}
                    {...textScale.dense}
                  >
                    {upperTR(option.name)}
                  </Text>
                  {right ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.textOnStatus} />
                  ) : wrong ? (
                    <Ionicons name="close-circle" size={18} color={colors.textOnStatus} />
                  ) : null}
                </Touchable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ═════════════════════════ TUR SONU + PAYLAŞIM ═════════════════════════ */

function RoundOver({
  total,
  correct,
  best,
  onRestart,
  scopeCity,
  signedIn,
}: {
  total: number;
  correct: number;
  best: number;
  onRestart: () => void;
  scopeCity: string;
  signedIn: boolean;
}) {
  const toast = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);
  const isRecord = total > 0 && total >= best;

  const igHandle = useMemo(() => {
    const url = instagramUrl(scopeCity);
    const handle = url?.split("instagram.com/")[1]?.replace(/\/+$/, "");
    return handle ? `@${handle}` : "elitlig.com";
  }, [scopeCity]);

  const openShare = useCallback(() => setShareOpen(true), []);
  const closeShare = useCallback(() => setShareOpen(false), []);

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      } else {
        toast.show({ message: "Bu cihazda paylaşım kapalı.", tone: "warn" });
      }
    } catch {
      toast.show({ message: "Görsel oluşturulamadı, tekrar dener misin?", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }, [busy, toast]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.overCard}>
        <ProgressRing
          value={correct / ROUND}
          size={96}
          thickness={7}
          tone={correct >= 8 ? "win" : correct >= 5 ? "brand" : "warn"}
          label={`${correct}/${ROUND}`}
          sublabel="doğru"
        />

        <Text style={styles.overScore} {...textScale.dense}>
          {formatCount(total)}
        </Text>
        <View style={styles.overUnitRow}>
          <Text style={styles.overUnit} {...textScale.badge}>
            {upperTR("puan")}
          </Text>
          {isRecord ? <Badge label="Yeni rekor" tone="warn" size="xs" icon="trophy" /> : null}
        </View>

        {/* Puan yukarıda büyük yazıyor; şerit onu tekrarlamaz. */}
        <View style={styles.statRow}>
          <StatCell value={`${correct}/${ROUND}`} label="doğru" />
          <View style={styles.statDivider} />
          <StatCell value={best > 0 ? formatCount(best) : "—"} label="rekor" accent />
        </View>

        {!signedIn ? (
          <Text style={styles.overMeta} numberOfLines={2} {...textScale.dense}>
            Skorun rekor tablosuna yazılsın diye giriş yapabilirsin.
          </Text>
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <Button
          label="Yeni Tur"
          icon="refresh"
          onPress={onRestart}
          haptic="medium"
          style={styles.actionButton}
        />
        <Button
          label="Meydan Oku"
          icon="share-social"
          variant="secondary"
          onPress={openShare}
          style={styles.actionButton}
        />
      </View>

      <BottomSheet visible={shareOpen} onClose={closeShare} title="Turunu paylaş" snap="full">
        <View style={styles.shareWrap}>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <View style={styles.shareCard}>
              <View style={styles.shareStrip} />

              <View style={styles.shareBody}>
                <View style={styles.shareTop}>
                  <Text style={styles.shareBrand} {...textScale.badge}>
                    elitlig
                  </Text>
                  <Text style={styles.shareKicker} {...textScale.badge}>
                    {upperTR("Kim Bu?")}
                  </Text>
                </View>

                <Text style={styles.shareScore} {...textScale.badge}>
                  {formatCount(total)}
                </Text>
                <Text style={styles.shareUnit} {...textScale.badge}>
                  {upperTR(`puan · ${correct}/${ROUND} doğru${isRecord ? " · rekor" : ""}`)}
                </Text>

                <View style={styles.shareDivider} />

                <Text style={styles.shareChallenge} {...textScale.badge}>
                  Geç de görelim
                </Text>

                <View style={styles.flex} />

                <Text style={styles.shareFooter} {...textScale.badge}>
                  {upperTR(`elitlig.com · ${igHandle}`)}
                </Text>
              </View>
            </View>
          </ViewShot>
        </View>

        <Button
          label={busy ? "Hazırlanıyor" : "Paylaş"}
          icon="share-social"
          onPress={share}
          loading={busy}
          fullWidth
        />
        <Text style={styles.shareHint} {...textScale.dense}>
          İndirmek için: Paylaş → Görüntüyü Kaydet
        </Text>
      </BottomSheet>
    </ScrollView>
  );
}

/* ═════════════════════════ STİLLER ═════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  loading: {
    padding: layout.screenPadding,
    gap: space.md,
  },
  content: {
    padding: layout.screenPadding,
    paddingBottom: space.giant,
    gap: space.md,
  },

  /* — Durum şeridi — */
  hud: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingVertical: space.m,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  statDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.separator,
  },
  statValue: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  statValueAccent: {
    ...type.scoreSm,
    color: colors.brandAccent,
  },
  statLabel: {
    ...type.caption,
    fontWeight: "600",
    letterSpacing: 0,
    color: colors.textTertiary,
  },

  /* — Gizemli oyuncu kartı — */
  mysteryCard: {
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
  },
  mysteryMarkBox: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  mysteryMark: {
    ...type.scoreHero,
    color: colors.brandAccent,
  },
  secretName: {
    ...type.h2,
    color: colors.textPrimary,
    textAlign: "center",
  },

  /* — Puan düşüşü göstergesi — */
  dropRow: {
    flexDirection: "row",
    gap: space.xs,
    alignSelf: "stretch",
    paddingHorizontal: space.xxl,
  },
  dropCell: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brandAccent,
  },
  /* Harcanan ipucu: kutucuk söner — kaybedilen 10 puanın karşılığı. */
  dropCellSpent: {
    backgroundColor: colors.surface3,
  },
  dropHint: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* — İpucu kartı — */
  hintsCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 40,
    paddingVertical: space.s,
  },
  hintRowBorder: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  hintText: {
    ...type.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  hintLocked: {
    ...type.body,
    color: colors.textTertiary,
  },
  hintCost: {
    ...type.caption,
    fontWeight: "800",
    letterSpacing: 0,
    color: colors.warn,
  },
  hintButton: {
    marginTop: space.xs,
    marginBottom: space.sm,
  },

  /* — Şıklar — */
  options: { gap: space.m },
  option: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    backgroundColor: colors.surface1,
  },
  optionRight: {
    backgroundColor: colors.win,
    borderColor: colors.win,
  },
  optionWrong: {
    backgroundColor: colors.loss,
    borderColor: colors.loss,
  },
  optionMuted: {
    opacity: 0.5,
    borderColor: colors.border,
  },
  optionText: {
    ...type.h3,
    color: colors.textPrimary,
    textAlign: "center",
    flexShrink: 1,
  },
  optionTextOn: { color: colors.textOnStatus },

  /* — Tur sonu — */
  overCard: {
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.lg,
  },
  overScore: {
    ...type.scoreHero,
    color: colors.brandAccent,
  },
  overUnitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: -space.sm,
  },
  overUnit: {
    ...type.micro,
    color: colors.textTertiary,
  },
  overMeta: {
    ...type.caption,
    fontWeight: "600",
    letterSpacing: 0,
    color: colors.textTertiary,
    textAlign: "center",
  },

  actionRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  actionButton: { flex: 1 },

  /* — Paylaşım kartı — */
  shareWrap: {
    alignItems: "center",
    paddingVertical: space.md,
  },
  shareCard: {
    width: 264,
    height: 396,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  shareStrip: {
    height: 6,
    backgroundColor: colors.brand,
  },
  shareBody: {
    flex: 1,
    padding: space.md,
    alignItems: "center",
    gap: space.xs,
  },
  shareTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
  },
  shareBrand: {
    ...type.label,
    color: colors.brand,
  },
  shareKicker: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareScore: {
    ...type.scoreHero,
    fontSize: 52,
    lineHeight: 58,
    color: colors.brandAccent,
    marginTop: space.xxl,
  },
  shareUnit: {
    ...type.micro,
    color: colors.textPrimary,
    textAlign: "center",
  },
  shareDivider: {
    alignSelf: "stretch",
    height: hairline,
    backgroundColor: colors.separator,
    marginVertical: space.md,
  },
  shareChallenge: {
    ...type.caption,
    fontWeight: "700",
    letterSpacing: 0,
    color: colors.textSecondary,
    textAlign: "center",
  },
  shareFooter: {
    ...type.micro,
    color: colors.textTertiary,
    textAlign: "center",
  },
  shareHint: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.sm,
  },
});
