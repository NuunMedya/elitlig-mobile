import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getMyMatches, type MyMatch } from "@/lib/api/panel";
import {
  AVAILABILITY_LABELS,
  getMyAvailability,
  setMyAvailability,
  type AvailabilityStatus,
} from "@/lib/api/team";
import { formatDateShort, formatTime } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Maçlarım — Profilim'in Faz 2 ekranı (match-center).
 *
 * Takımın tüm maçları iki sekmede listelenir: Yaklaşan ve Oynanan.
 * Sunucunun ayrımı esas alınır (saate değil duruma bakar). Her satırda
 * rakip, ev/deplasman bilgisi ve kadro rozeti (⚽ kadrodaydın) vardır;
 * oynananlarda skor ve G/B/M sonucu gösterilir. Satır maç detayına gider.
 * Oyuncu profili bağlı değilse sunucunun 403'ü nazikçe karşılanır.
 *
 * Yaklaşan maçlarda müsaitlik yoklaması vardır (routes/matchAvailability.js):
 * Geliyorum / Belirsiz / Gelemiyorum. Seçim iyimser güncellenir; sunucu
 * reddederse eski seçim geri gelir.
 */

type Tab = "upcoming" | "past";

export default function MyMatchesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upcoming");

  const query = useQuery({
    queryKey: ["panel", "my-matches"],
    queryFn: getMyMatches,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const needsProfile =
    query.isError && String((query.error as Error)?.message ?? "").includes("PLAYER_PROFILE");

  const rows = tab === "upcoming" ? query.data?.upcoming ?? [] : query.data?.past ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Maçlarım" subtitle="Takımının fikstürü ve sonuçları" />

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
      ) : needsProfile ? (
        <EmptyState
          icon="person-add-outline"
          title="Oyuncu profili gerekli"
          body="Maçlarım için hesabına bağlı bir oyuncu profili olmalı. Profil bağlama şimdilik web panelinden yapılıyor."
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
          renderItem={({ item }) => (
            <MatchRow match={item} past={tab === "past"} onPress={() => router.push(`/mac/${item.id}`)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function MatchRow({
  match,
  past,
  onPress,
}: {
  match: MyMatch;
  past: boolean;
  onPress: () => void;
}) {
  const ours = match.is_home ? match.first_team_score : match.second_team_score;
  const theirs = match.is_home ? match.second_team_score : match.first_team_score;
  const result =
    ours == null || theirs == null ? null : ours > theirs ? "G" : ours < theirs ? "M" : "B";
  const opponent =
    match.opponent_name ?? (match.is_home ? match.second_team_name : match.first_team_name);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.rowInner, pressed && styles.pressed]}
      >
      <View style={styles.rowLeft}>
        <Text style={styles.rowDate}>{formatDateShort(match.date)}</Text>
        <Text style={styles.rowTime}>{match.time ? formatTime(match.time) : ""}</Text>
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowOpponent} numberOfLines={1}>
          {String(opponent ?? "").toLocaleUpperCase("tr-TR")}
        </Text>
        <View style={styles.rowMetaLine}>
          <Text style={styles.rowMeta}>{match.is_home ? "Ev sahibi" : "Deplasman"}</Text>
          {match.in_squad ? (
            <View style={styles.squadChip}>
              <Text style={styles.squadChipText}>⚽ kadrodaydın</Text>
            </View>
          ) : null}
        </View>
      </View>

      {past ? (
        <View style={styles.rowRight}>
          {result ? (
            <View
              style={[
                styles.resultChip,
                result === "G"
                  ? styles.resultWin
                  : result === "M"
                    ? styles.resultLoss
                    : styles.resultDraw,
              ]}
            >
              <Text style={styles.resultText}>{result}</Text>
            </View>
          ) : null}
          <Text style={styles.score}>
            {ours ?? "-"} - {theirs ?? "-"}
          </Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      )}
      </Pressable>

      {/* Yaklaşan maçta müsaitlik yoklaması */}
      {!past ? <AvailabilityRow matchId={match.id} /> : null}
    </View>
  );
}

/** Müsaitlik seçenekleri sabit sırada; renk seçime göre değişir. */
const AVAILABILITY_OPTIONS: { status: AvailabilityStatus; color: string }[] = [
  { status: "coming", color: colors.green },
  { status: "maybe", color: colors.yellow },
  { status: "not_coming", color: colors.live },
];

function AvailabilityRow({ matchId }: { matchId: number }) {
  const queryClient = useQueryClient();
  const queryKey = ["takim", "availability-mine", matchId] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => getMyAvailability(matchId),
    staleTime: 60_000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (status: AvailabilityStatus) => setMyAvailability(matchId, status),
    // İyimser güncelleme: seçim anında boyanır, hata olursa geri alınır.
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ status: AvailabilityStatus | null }>(queryKey);
      queryClient.setQueryData(queryKey, { status });
      return { previous };
    },
    onError: (error, _status, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      Alert.alert(
        "Yanıt kaydedilemedi",
        error instanceof ApiError ? error.userMessage : "Bilinmeyen hata."
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const current = query.data?.status ?? null;

  return (
    <View style={styles.availRow}>
      <Text style={styles.availLabel}>Yoklama</Text>
      {AVAILABILITY_OPTIONS.map((option) => {
        const active = current === option.status;
        return (
          <Pressable
            key={option.status}
            onPress={() => {
              if (!active) mutation.mutate(option.status);
            }}
            disabled={mutation.isPending}
            style={({ pressed }) => [
              styles.availBtn,
              active && { backgroundColor: option.color, borderColor: option.color },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.availBtnText, active && styles.availBtnTextActive]}>
              {AVAILABILITY_LABELS[option.status]}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowLeft: {
    width: 52,
  },
  rowDate: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  rowTime: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  rowBody: {
    flex: 1,
  },
  rowOpponent: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  rowMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 3,
  },
  rowMeta: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  squadChip: {
    backgroundColor: colors.turfDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  squadChipText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.turf,
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 3,
  },
  resultChip: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  resultWin: { backgroundColor: colors.green },
  resultDraw: { backgroundColor: "#B9B5C6" },
  resultLoss: { backgroundColor: colors.live },
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
  availRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.faint,
    paddingTop: spacing.sm + 2,
  },
  availLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.muted,
    marginRight: 2,
  },
  availBtn: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surfaceRaised,
    paddingVertical: 5,
  },
  availBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.muted,
  },
  availBtnTextActive: {
    color: colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
});
