/**
 * MAÇ MERKEZİ — başkanın maç günü ekranı.
 * `/takimim/mac-merkezi?tab=<yaklasan|oynanan>`
 *
 * NE: `GET /api/match-center/team/matches` takımın maçlarını duruma göre ikiye
 * ayırır (saate değil `mac_durumu`'na bakar: canlıya/yayına geçmemiş maç, saati
 * geçse bile "yaklaşan" sayılır). Segment seçimi `?tab=` ile URL'de taşınır.
 *
 * YAKLAŞAN MAÇ: kart açıldığında takımın yoklama dağılımı TEMBEL yüklenir
 * (`GET /api/match-availability/:matchId/team` — başkana özel). Dört sayaç
 * rozeti (Geliyor / Belirsiz / Gelmiyor / Yanıtsız) ve gelemeyecek oyuncuların
 * adları gösterilir. Yoklama isteği düşerse düz metin değil `ErrorState`
 * çizilir; "Tekrar dene" düğmesi yalnız o kartın sorgusunu yeniler.
 *
 * OYNANAN MAÇ: "Maç Karnesi" alt sayfası altı görevliyi 1-10 arası puanlar
 * (`PUT /api/match-center/matches/:matchId/review`). Sunucu altı alanı da
 * zorunlu tutar (400 INVALID_SCORE), bu yüzden Stepper'lar 1-10 sınırlıdır ve
 * varsayılan 5'ten başlar. Mevcut değerlendirme `my-review` ile ön doldurulur;
 * ikinci kayıt upsert'tir, yani karne güncellenebilir.
 *
 * NEDEN KARNE DÜĞMESİ HER OYNANAN MAÇTA: bu liste zaten YALNIZ yönetilen
 * takımın maçlarını döndürür; sunucu tarafında başkan kendi takımının her
 * oynanmış maçını değerlendirebilir (`managesThisMatch`). Yetki hatası
 * doğmadığı için düğme kilitlenmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SegmentedControl,
  Skeleton,
  SkeletonMatchRow,
  Stepper,
  Touchable,
  refreshControlProps,
  toneColors,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
  type Tone,
} from "@/components/ui";
import {
  REVIEW_SCORE_FIELDS,
  getMyMatchReview,
  getTeamAvailability,
  getTeamMatches,
  submitMatchReview,
  type MatchReviewScores,
  type TeamMatch,
} from "@/lib/api/team";
import { formatDateShort, formatTime } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Sabitler ve saf yardımcılar
   ══════════════════════════════════════════════════════════════════════════ */

type CenterTab = "yaklasan" | "oynanan";

const TAB_ITEMS: SegmentedItem<CenterTab>[] = [
  { key: "yaklasan", label: "Yaklaşan" },
  { key: "oynanan", label: "Oynanan" },
];

/** Karne varsayılanı — sunucu altı alanı da zorunlu tutar. */
const DEFAULT_SCORES: MatchReviewScores = {
  announcer_score: 5,
  director_score: 5,
  referee_score: 5,
  photographer_score: 5,
  medic_score: 5,
  opponent_score: 5,
};

function resolveTab(raw: string | string[] | undefined): CenterTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "oynanan" ? "oynanan" : "yaklasan";
}

/** Takımımızın attığı / yediği gol — ev sahibi olup olmamaya göre. */
function ourScore(match: TeamMatch): { ours: number | null; theirs: number | null } {
  return match.is_home
    ? { ours: match.first_team_score, theirs: match.second_team_score }
    : { ours: match.second_team_score, theirs: match.first_team_score };
}

type MatchResult = "G" | "B" | "M" | null;

function resultOf(match: TeamMatch): MatchResult {
  const { ours, theirs } = ourScore(match);
  if (ours == null || theirs == null) return null;
  if (ours > theirs) return "G";
  if (ours < theirs) return "M";
  return "B";
}

const RESULT_TONE: Record<"G" | "B" | "M", Tone> = {
  G: "win",
  B: "neutral",
  M: "danger",
};

const RESULT_LABEL: Record<"G" | "B" | "M", string> = {
  G: "Galibiyet",
  B: "Beraberlik",
  M: "Mağlubiyet",
};

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

export default function MatchCenterScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState<TeamMatch | null>(null);

  const tab = resolveTab(params.tab);

  const query = useQuery({
    queryKey: ["takim", "matches"],
    queryFn: getTeamMatches,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const refreshControl = (
    <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
  );

  const rows = useMemo(
    () => (tab === "yaklasan" ? query.data?.upcoming ?? [] : query.data?.past ?? []),
    [query.data, tab]
  );

  const changeTab = useCallback(
    (next: CenterTab) => {
      setExpandedId(null);
      scrollY.setValue(0);
      router.setParams({ tab: next });
    },
    [router, scrollY]
  );

  const toggleExpanded = useCallback((matchId: number) => {
    setExpandedId((prev) => (prev === matchId ? null : matchId));
  }, []);

  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);
  const openReview = useCallback((match: TeamMatch) => setReviewing(match), []);
  const closeReview = useCallback(() => setReviewing(null), []);

  const renderItem = useCallback(
    ({ item }: { item: TeamMatch }) =>
      tab === "yaklasan" ? (
        <UpcomingCard
          match={item}
          expanded={expandedId === item.id}
          onToggle={toggleExpanded}
          onOpenMatch={openMatch}
        />
      ) : (
        <PastCard match={item} onReview={openReview} onOpenMatch={openMatch} />
      ),
    [expandedId, openMatch, openReview, tab, toggleExpanded]
  );

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const noAccess =
    query.isError && query.error instanceof ApiError && query.error.status === 403;

  const header = (
    <ScreenHeader
      title="Maç Merkezi"
      subtitle="Fikstür, yoklama ve maç karnesi"
      back
      scrollY={scrollY}
      bottom={
        <View style={styles.headerBottom}>
          <SegmentedControl items={TAB_ITEMS} value={tab} onChange={changeTab} />
        </View>
      }
    />
  );

  if (query.isLoading && !query.data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <View style={styles.loading}>
          <SkeletonMatchRow count={6} />
        </View>
      </SafeAreaView>
    );
  }

  if (noAccess) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="shield-outline"
          title="Takım başkanlığı gerekli"
          body="Maç merkezi yalnızca takımının yönetimini üstlenen başkanlara açıktır."
        />
      </SafeAreaView>
    );
  }

  if (query.isError && !query.data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <ErrorState error={query.error} onRetry={query.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      <FlatList
        {...scrollProps}
        data={rows}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}
        initialNumToRender={8}
        ListHeaderComponent={
          query.isError ? (
            <ErrorState
              error={query.error}
              onRetry={query.refetch}
              variant="banner"
              style={styles.banner}
            />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title={tab === "yaklasan" ? "Yaklaşan maç yok" : "Oynanan maç yok"}
            body={
              tab === "yaklasan"
                ? "Takımının programına maç eklendiğinde burada görünür."
                : "Takımının oynadığı maçlar sonuçlandıkça burada listelenir."
            }
            variant="inline"
          />
        }
      />

      {reviewing ? <ReviewSheet match={reviewing} onClose={closeReview} /> : null}
    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Yaklaşan maç kartı
   ══════════════════════════════════════════════════════════════════════════ */

const UpcomingCard = React.memo(function UpcomingCard({
  match,
  expanded,
  onToggle,
  onOpenMatch,
}: {
  match: TeamMatch;
  expanded: boolean;
  onToggle: (matchId: number) => void;
  onOpenMatch: (matchId: number) => void;
}) {
  const handleToggle = useCallback(() => onToggle(match.id), [match.id, onToggle]);
  const handleOpen = useCallback(() => onOpenMatch(match.id), [match.id, onOpenMatch]);

  /** Tembel yükleme: yalnızca kart açıldığında istenir. */
  const availability = useQuery({
    queryKey: ["takim", "availability", match.id],
    queryFn: () => getTeamAvailability(match.id),
    enabled: expanded,
    staleTime: 30_000,
    retry: false,
  });

  const counts = availability.data?.counts;
  const notComing = useMemo(
    () => (availability.data?.players ?? []).filter((player) => player.status === "not_coming"),
    [availability.data]
  );

  const venue = [match.is_home ? "Ev sahibi" : "Deplasman", match.match_field]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.card}>
      <Touchable
        feedback="row"
        haptic="selection"
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={`${match.opponent_name ?? "Rakip"} maçının yoklamasını ${expanded ? "kapat" : "aç"}`}
        style={styles.cardHead}
      >
        <View style={styles.dateCol}>
          <Text style={styles.dateText} numberOfLines={1} {...textScale.dense}>
            {formatDateShort(match.date)}
          </Text>
          <Text style={styles.timeText} numberOfLines={1} {...textScale.dense}>
            {match.time ? formatTime(match.time) : "—"}
          </Text>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.opponent} numberOfLines={1} {...textScale.dense}>
            {upperTR(String(match.opponent_name ?? "Rakip belirlenmedi"))}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {venue}
          </Text>
        </View>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.textTertiary}
        />
      </Touchable>

      {expanded ? (
        <View style={styles.panel}>
          {availability.isLoading ? (
            <View style={styles.availLoading}>
              <Skeleton width="60%" height={14} radius="sm" />
              <Skeleton width="90%" height={14} radius="sm" />
            </View>
          ) : availability.isError ? (
            <ErrorState
              error={availability.error}
              onRetry={availability.refetch}
              variant="inline"
            />
          ) : counts ? (
            <>
              <View style={styles.countRow}>
                <Badge label={`Geliyor ${counts.coming}`} tone="win" size="sm" />
                <Badge label={`Belirsiz ${counts.maybe}`} tone="warn" size="sm" />
                <Badge label={`Gelmiyor ${counts.not_coming}`} tone="danger" size="sm" />
                <Badge label={`Yanıtsız ${counts.unanswered}`} tone="neutral" size="sm" />
              </View>

              {notComing.length > 0 ? (
                <Text style={styles.notComing} numberOfLines={4} {...textScale.long}>
                  <Text style={styles.notComingLead}>Gelemeyenler: </Text>
                  {notComing.map((player) => player.name).join(", ")}
                </Text>
              ) : (
                <Text style={styles.panelNote} {...textScale.long}>
                  Kadrondan gelemeyeceğini bildiren yok.
                </Text>
              )}
            </>
          ) : null}

          <Button
            label="Maç detayı"
            variant="secondary"
            size="sm"
            icon="football-outline"
            onPress={handleOpen}
            fullWidth
          />
        </View>
      ) : null}
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Oynanan maç kartı
   ══════════════════════════════════════════════════════════════════════════ */

const PastCard = React.memo(function PastCard({
  match,
  onReview,
  onOpenMatch,
}: {
  match: TeamMatch;
  onReview: (match: TeamMatch) => void;
  onOpenMatch: (matchId: number) => void;
}) {
  const handleReview = useCallback(() => onReview(match), [match, onReview]);
  const handleOpen = useCallback(() => onOpenMatch(match.id), [match.id, onOpenMatch]);

  const { ours, theirs } = ourScore(match);
  const result = resultOf(match);
  const palette = toneColors(result ? RESULT_TONE[result] : "neutral");

  return (
    <View style={styles.card}>
      <Touchable
        feedback="row"
        haptic="selection"
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={`${match.opponent_name ?? "Rakip"} maçının detayı`}
        style={styles.cardHead}
      >
        <View style={styles.dateCol}>
          <Text style={styles.dateText} numberOfLines={1} {...textScale.dense}>
            {formatDateShort(match.date)}
          </Text>
          <Text style={styles.timeText} numberOfLines={1} {...textScale.dense}>
            {match.is_home ? "Ev sahibi" : "Deplasman"}
          </Text>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.opponent} numberOfLines={1} {...textScale.dense}>
            {upperTR(String(match.opponent_name ?? "Rakip"))}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {result ? RESULT_LABEL[result] : "Sonuç girilmedi"}
          </Text>
        </View>

        {result ? (
          <View style={[styles.resultChip, { backgroundColor: palette.solidBg }]}>
            <Text style={[styles.resultText, { color: palette.solidFg }]} {...textScale.badge}>
              {result}
            </Text>
          </View>
        ) : null}

        <Text style={styles.score} numberOfLines={1} {...textScale.dense}>
          {ours ?? "-"}–{theirs ?? "-"}
        </Text>
      </Touchable>

      <View style={styles.cardFooter}>
        <Button
          label="Maç Karnesi"
          variant="secondary"
          size="sm"
          icon="clipboard-outline"
          onPress={handleReview}
          fullWidth
        />
      </View>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Maç karnesi alt sayfası
   ══════════════════════════════════════════════════════════════════════════ */

function ReviewSheet({ match, onClose }: { match: TeamMatch; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [scores, setScores] = useState<MatchReviewScores>(DEFAULT_SCORES);
  const [comment, setComment] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  const myReview = useQuery({
    queryKey: ["takim", "my-review", match.id],
    queryFn: () => getMyMatchReview(match.id),
    staleTime: 30_000,
    retry: false,
  });

  /** Mevcut değerlendirme geldiğinde BİR KEZ ön doldurulur. */
  useEffect(() => {
    if (prefilled || !myReview.data) return;
    const review = myReview.data.review;
    if (review) {
      setScores({
        announcer_score: review.announcer_score,
        director_score: review.director_score,
        referee_score: review.referee_score,
        photographer_score: review.photographer_score,
        medic_score: review.medic_score,
        opponent_score: review.opponent_score,
      });
      setComment(review.comment ?? "");
    }
    setPrefilled(true);
  }, [myReview.data, prefilled]);

  const submitMutation = useMutation({
    mutationFn: () => submitMatchReview(match.id, scores, comment.trim() || undefined),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["takim", "my-review", match.id] });
      toast.show({ message: result.message, tone: "success" });
      onClose();
    },
    onError: (error: unknown) => {
      toast.show({
        message: error instanceof ApiError ? error.userMessage : "Karne kaydedilemedi.",
        tone: "danger",
      });
    },
  });

  const setScore = useCallback((key: keyof MatchReviewScores, value: number) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  }, []);

  const submit = useCallback(() => submitMutation.mutate(), [submitMutation]);

  const existing = Boolean(myReview.data?.review);
  const loading = myReview.isLoading && !prefilled;

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="Maç Karnesi"
      snap="content"
      footer={
        <Button
          label={existing ? "Karneyi güncelle" : "Karneyi kaydet"}
          icon="checkmark"
          onPress={submit}
          loading={submitMutation.isPending}
          disabled={loading || submitMutation.isPending}
          haptic="success"
          fullWidth
        />
      }
    >
      <View style={styles.sheetBody}>
        <View style={styles.sheetHead}>
          <View style={styles.cardBody}>
            <Text style={styles.sheetTitle} numberOfLines={1} {...textScale.dense}>
              {match.opponent_name ?? "Rakip"}
            </Text>
            <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
              {formatDateShort(match.date)}
              {match.match_field ? ` · ${match.match_field}` : ""}
            </Text>
          </View>
          {existing ? <Badge label="KAYITLI" tone="win" size="xs" /> : null}
        </View>

        {loading ? (
          <View style={styles.availLoading}>
            <Skeleton width="100%" height={32} radius="md" />
            <Skeleton width="100%" height={32} radius="md" />
            <Skeleton width="100%" height={32} radius="md" />
          </View>
        ) : (
          <>
            <Text style={styles.fieldLabel} {...textScale.badge}>
              {upperTR("Puanlama (1-10)")}
            </Text>

            {REVIEW_SCORE_FIELDS.map((field) => (
              <ScoreRow
                key={field.key}
                field={field.key}
                label={field.label}
                value={scores[field.key]}
                onChange={setScore}
              />
            ))}

            <Text style={styles.fieldLabel} {...textScale.badge}>
              {upperTR("Yorum (isteğe bağlı)")}
            </Text>
            <Input
              value={comment}
              onChangeText={setComment}
              placeholder="Organizasyonla ilgili notun…"
              multiline
              maxLength={1000}
              hint="En fazla 1000 karakter."
            />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

/** Tek puanlama satırı — etiket solda, Stepper sağda. */
const ScoreRow = React.memo(function ScoreRow({
  field,
  label,
  value,
  onChange,
}: {
  field: keyof MatchReviewScores;
  label: string;
  value: number;
  onChange: (field: keyof MatchReviewScores, value: number) => void;
}) {
  const handleChange = useCallback((next: number) => onChange(field, next), [field, onChange]);

  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
      <Stepper
        value={value}
        onChange={handleChange}
        min={1}
        max={10}
        size="sm"
        accessibilityLabel={`${label} puanı`}
      />
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerBottom: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xxxl,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
  },
  banner: {
    marginBottom: space.sm,
  },

  /* Maç kartı */
  card: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    marginBottom: space.sm,
    overflow: "hidden",
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: layout.listRowHeightTwoLine,
    paddingHorizontal: layout.rowPaddingH,
    paddingVertical: space.sm,
  },
  dateCol: {
    width: 56,
    gap: 2,
  },
  dateText: {
    ...type.bodySm,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  timeText: {
    ...type.caption,
    color: colors.textTertiary,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  opponent: {
    ...type.body,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  meta: {
    ...type.caption,
    color: colors.textSecondary,
  },
  resultChip: {
    width: 20,
    height: 20,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  resultText: {
    ...type.micro,
  },
  score: {
    ...type.scoreSm,
    color: colors.textPrimary,
    minWidth: 38,
    textAlign: "right",
  },
  cardFooter: {
    paddingHorizontal: layout.rowPaddingH,
    paddingBottom: space.md,
  },

  /* Açılan yoklama paneli */
  panel: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    paddingHorizontal: layout.rowPaddingH,
    paddingVertical: space.md,
    gap: space.md,
  },
  availLoading: {
    gap: space.sm,
  },
  countRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  notComing: {
    ...type.caption,
    color: colors.textSecondary,
  },
  notComingLead: {
    color: colors.danger,
    fontWeight: "700",
  },
  panelNote: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* Karne alt sayfası */
  sheetBody: {
    gap: space.xs,
    paddingBottom: space.sm,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingBottom: space.sm,
  },
  sheetTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  fieldLabel: {
    ...type.micro,
    color: colors.textTertiary,
    marginTop: space.md,
    marginBottom: space.xs,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    minHeight: 44,
  },
  scoreLabel: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
});
