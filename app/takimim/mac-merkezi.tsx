import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import {
  getMyMatchReview,
  getTeamAvailability,
  getTeamMatches,
  REVIEW_SCORE_FIELDS,
  submitMatchReview,
  type MatchReviewScores,
  type TeamMatch,
} from "@/lib/api/team";
import { formatDateShort, formatTime } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Maç Merkezi — başkanın fikstür görünümü.
 *
 * GET /api/match-center/team/matches maçları duruma göre yaklaşan/oynanan
 * ayırır (saate değil mac_durumu'na bakar). Yaklaşan maç kartı açıldığında
 * takımın yoklama dağılımı tembel yüklenir (GET /api/match-availability/
 * :matchId/team — başkana özel). Oynanan maçlarda "Maç Karnesi" ile maç
 * görevlileri ve rakip 1-10 arası puanlanır (PUT /api/match-center/matches/
 * :matchId/review); mevcut değerlendirme my-review'dan ön doldurulur.
 */

type Tab = "upcoming" | "past";

export default function MatchCenterScreen() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState<TeamMatch | null>(null);

  const query = useQuery({
    queryKey: ["takim", "matches"],
    queryFn: getTeamMatches,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const noAccess =
    query.isError && query.error instanceof ApiError && query.error.status === 403;

  const rows = tab === "upcoming" ? query.data?.upcoming ?? [] : query.data?.past ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Maç Merkezi" subtitle="Takımının fikstürü, yoklama ve karne" />

      <View style={styles.tabs}>
        {(
          [
            ["upcoming", "Yaklaşan"],
            ["past", "Oynanan"],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={({ pressed }) => [
              styles.tab,
              tab === key && styles.tabActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading ? (
        <Loading />
      ) : noAccess ? (
        <EmptyState
          icon="shield-outline"
          title="Takım başkanlığı gerekli"
          body="Maç merkezi yalnızca takımının yönetimini üstlenen başkanlara açıktır."
        />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title={tab === "upcoming" ? "Yaklaşan maç yok" : "Oynanan maç yok"}
          body={
            tab === "upcoming"
              ? "Takımının programına maç eklendiğinde burada görünür."
              : "Takımının oynadığı maçlar burada listelenir."
          }
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            tab === "upcoming" ? (
              <UpcomingCard
                match={item}
                expanded={expandedId === item.id}
                onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              />
            ) : (
              <PastCard match={item} onReview={() => setReviewing(item)} />
            )
          }
        />
      )}

      {reviewing ? (
        <ReviewModal match={reviewing} onClose={() => setReviewing(null)} />
      ) : null}
    </SafeAreaView>
  );
}

/** Yaklaşan maç kartı: açılınca yoklama özeti yüklenir. */
function UpcomingCard({
  match,
  expanded,
  onToggle,
}: {
  match: TeamMatch;
  expanded: boolean;
  onToggle: () => void;
}) {
  const availability = useQuery({
    queryKey: ["takim", "availability", match.id],
    queryFn: () => getTeamAvailability(match.id),
    // Tembel yükleme: yalnızca kart açıldığında istenir.
    enabled: expanded,
    staleTime: 30_000,
    retry: false,
  });

  const counts = availability.data?.counts;
  const notComing = (availability.data?.players ?? []).filter(
    (player) => player.status === "not_coming"
  );

  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.cardHead, pressed && styles.pressed]}>
        <View style={styles.dateCol}>
          <Text style={styles.dateText}>{formatDateShort(match.date)}</Text>
          <Text style={styles.timeText}>{match.time ? formatTime(match.time) : ""}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.opponent} numberOfLines={1}>
            {String(match.opponent_name ?? "").toLocaleUpperCase("tr-TR")}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {match.is_home ? "Ev sahibi" : "Deplasman"}
            {match.match_field ? ` · ${match.match_field}` : ""}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.muted}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.availBox}>
          {availability.isLoading ? (
            <Text style={styles.availLoading}>Yoklama yükleniyor…</Text>
          ) : availability.isError ? (
            <Text style={styles.availLoading}>
              {availability.error instanceof ApiError
                ? availability.error.userMessage
                : "Yoklama yüklenemedi."}
            </Text>
          ) : counts ? (
            <>
              <View style={styles.countRow}>
                <CountChip color={colors.green} label={`Geliyor ${counts.coming}`} />
                <CountChip color={colors.yellow} label={`Belirsiz ${counts.maybe}`} />
                <CountChip color={colors.live} label={`Gelmiyor ${counts.not_coming}`} />
                <CountChip color={colors.muted} label={`Yanıtsız ${counts.unanswered}`} />
              </View>
              {notComing.length > 0 ? (
                <Text style={styles.notComing} numberOfLines={3}>
                  Gelemeyenler: {notComing.map((player) => player.name).join(", ")}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function CountChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={[styles.countChip, { backgroundColor: color + "18" }]}>
      <Text style={[styles.countChipText, { color }]}>{label}</Text>
    </View>
  );
}

/** Oynanan maç kartı: skor + sonuç + karne düğmesi. */
function PastCard({ match, onReview }: { match: TeamMatch; onReview: () => void }) {
  const ours = match.is_home ? match.first_team_score : match.second_team_score;
  const theirs = match.is_home ? match.second_team_score : match.first_team_score;
  const result =
    ours == null || theirs == null ? null : ours > theirs ? "G" : ours < theirs ? "M" : "B";
  const resultColor =
    result === "G" ? colors.green : result === "M" ? colors.live : "#B9B5C6";

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.dateCol}>
          <Text style={styles.dateText}>{formatDateShort(match.date)}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.opponent} numberOfLines={1}>
            {String(match.opponent_name ?? "").toLocaleUpperCase("tr-TR")}
          </Text>
          <Text style={styles.meta}>{match.is_home ? "Ev sahibi" : "Deplasman"}</Text>
        </View>
        {result ? (
          <View style={[styles.resultChip, { backgroundColor: resultColor }]}>
            <Text style={styles.resultText}>{result}</Text>
          </View>
        ) : null}
        <Text style={styles.score}>
          {ours ?? "-"} - {theirs ?? "-"}
        </Text>
      </View>
      <Pressable
        onPress={onReview}
        style={({ pressed }) => [styles.reviewBtn, pressed && styles.pressed]}
      >
        <Ionicons name="clipboard-outline" size={14} color={colors.turf} />
        <Text style={styles.reviewBtnText}>Maç Karnesi</Text>
      </Pressable>
    </View>
  );
}

const DEFAULT_SCORES: MatchReviewScores = {
  announcer_score: 5,
  director_score: 5,
  referee_score: 5,
  photographer_score: 5,
  medic_score: 5,
  opponent_score: 5,
};

/** Maç karnesi penceresi: 6 puan (1-10) + yorum. */
function ReviewModal({ match, onClose }: { match: TeamMatch; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<MatchReviewScores>(DEFAULT_SCORES);
  const [comment, setComment] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  const myReview = useQuery({
    queryKey: ["takim", "my-review", match.id],
    queryFn: () => getMyMatchReview(match.id),
    staleTime: 30_000,
    retry: false,
  });

  // Mevcut değerlendirme geldiğinde bir kez ön doldurulur.
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
      queryClient.invalidateQueries({ queryKey: ["takim", "my-review", match.id] });
      Alert.alert("Karne kaydedildi", result.message);
      onClose();
    },
    onError: (error: unknown) => {
      Alert.alert(
        "Kaydedilemedi",
        error instanceof ApiError ? error.userMessage : "Bilinmeyen hata."
      );
    },
  });

  const bump = (key: keyof MatchReviewScores, delta: number) => {
    setScores((prev) => ({
      ...prev,
      [key]: Math.min(10, Math.max(1, prev[key] + delta)),
    }));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <View style={styles.cardBody}>
              <Text style={styles.sheetTitle}>Maç Karnesi</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {match.opponent_name ?? ""} · {formatDateShort(match.date)}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {myReview.isLoading && !prefilled ? (
            <Text style={styles.availLoading}>Mevcut değerlendirme yükleniyor…</Text>
          ) : (
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              {REVIEW_SCORE_FIELDS.map((field) => (
                <View key={field.key} style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>{field.label}</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => bump(field.key, -1)}
                      hitSlop={6}
                      style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="remove" size={15} color={colors.turf} />
                    </Pressable>
                    <Text style={styles.scoreValue}>{scores[field.key]}</Text>
                    <Pressable
                      onPress={() => bump(field.key, 1)}
                      hitSlop={6}
                      style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="add" size={15} color={colors.turf} />
                    </Pressable>
                  </View>
                </View>
              ))}

              <Text style={styles.fieldLabel}>YORUM (İSTEĞE BAĞLI)</Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Organizasyonla ilgili notun…"
                placeholderTextColor={colors.muted}
                style={styles.input}
                multiline
              />
            </ScrollView>
          )}

          <Pressable
            onPress={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            style={({ pressed }) => [styles.submitBtn, pressed && styles.pressed]}
          >
            <Ionicons name="checkmark" size={15} color={colors.surface} />
            <Text style={styles.submitText}>
              {submitMutation.isPending ? "Gönderiliyor…" : "Karneyi Kaydet"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    paddingVertical: spacing.sm + 2,
  },
  tabActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  tabText: {
    ...type.small,
    fontWeight: "700",
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.surface,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dateCol: {
    width: 52,
  },
  dateText: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  timeText: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  cardBody: {
    flex: 1,
  },
  opponent: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  meta: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 2,
  },
  availBox: {
    marginTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.faint,
    paddingTop: spacing.sm + 2,
    gap: spacing.sm,
  },
  availLoading: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  countRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
  },
  countChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  countChipText: {
    fontSize: 10,
    fontWeight: "800",
  },
  notComing: {
    ...type.caption,
    color: colors.live,
    letterSpacing: 0,
    lineHeight: 15,
  },
  resultChip: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  resultText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.surface,
  },
  score: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  reviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.turfDim,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm + 2,
  },
  reviewBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.turf,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "88%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sheetTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs + 2,
  },
  scoreLabel: {
    ...type.small,
    fontWeight: "700",
    color: colors.line,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
    width: 22,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.sm,
    padding: spacing.sm,
    ...type.small,
    color: colors.line,
    textAlignVertical: "top",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    paddingVertical: spacing.sm + 3,
  },
  submitText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.surface,
  },
  pressed: {
    opacity: 0.6,
  },
});
