import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getAdminMatches, MATCH_STATUS_LABELS, patchMatchScore, patchMatchStatus } from "@/lib/api/admin";
import { formatDateShort, formatTime } from "@/lib/format";
import { ApiError } from "@/lib/http";
import type { ApiMatch, MacDurumu } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";

/**
 * Maç Yönetimi — seçili kapsamdaki (şehir → lig → sezon) tüm maçlar,
 * taslaklar dahil (includeDraft=1). Satıra dokununca hızlı işlem penceresi
 * açılır: skor girişi, durum değiştirme ve maç sayfasına geçiş.
 */

const STATUS_ORDER: MacDurumu[] = ["taslak", "zamanlanmis", "canli", "yayinlanmis"];

/** Durum → renk (rozetler ve durum düğmeleri). */
function statusColor(status: MacDurumu | null): string {
  if (status === "taslak") return colors.muted;
  if (status === "zamanlanmis") return colors.turf;
  if (status === "canli") return colors.live;
  if (status === "yayinlanmis") return colors.green;
  return colors.muted;
}

/** Hata → kullanıcı mesajı (ApiError.userMessage varsa o). */
const errorText = (error: unknown) =>
  error instanceof ApiError ? error.userMessage : "Beklenmeyen bir hata oluştu.";

export default function AdminMatchesScreen() {
  const router = useRouter();
  const auth = useAuth();
  const scope = useScope();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<MacDurumu | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ApiMatch | null>(null);
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");

  const queryKey = ["admin", "matches", scope.cityId, scope.leagueId, scope.seasonId] as const;

  const matchesQuery = useQuery({
    queryKey,
    queryFn: () =>
      getAdminMatches({
        leagueId: scope.leagueId ?? undefined,
        seasonId: scope.seasonId ?? undefined,
        limit: 500,
      }),
    enabled: Boolean(auth.user) && auth.isManagement && scope.ready,
    staleTime: 10_000,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });

  const openMatch = (match: ApiMatch) => {
    setSelected(match);
    setHomeScore(match.first_team_score == null ? "" : String(match.first_team_score));
    setAwayScore(match.second_team_score == null ? "" : String(match.second_team_score));
  };

  const closeModal = () => {
    setSelected(null);
    Keyboard.dismiss();
  };

  const scoreMutation = useMutation({
    mutationFn: (input: { id: number; home: number; away: number }) =>
      patchMatchScore(input.id, input.home, input.away),
    onSuccess: () => {
      refresh();
      closeModal();
      Alert.alert("Skor güncellendi", "Puan durumu yeniden hesaplandı.");
    },
    onError: (error) => Alert.alert("Skor kaydedilemedi", errorText(error)),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: MacDurumu }) =>
      patchMatchStatus(input.id, input.status),
    onSuccess: (result) => {
      refresh();
      // Pencerede güncel durumu göster; kapatmadan başka işlem yapılabilir.
      setSelected((prev) => (prev && prev.id === result.match.id ? result.match : prev));
    },
    onError: (error) => Alert.alert("Durum değiştirilemedi", errorText(error)),
  });

  const submitScore = () => {
    if (!selected) return;
    const home = Number.parseInt(homeScore, 10);
    const away = Number.parseInt(awayScore, 10);
    if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) {
      Alert.alert("Eksik skor", "Her iki takım için de geçerli bir sayı girin.");
      return;
    }
    scoreMutation.mutate({ id: selected.id, home, away });
  };

  const matches = matchesQuery.data ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    return matches.filter((match) => {
      if (statusFilter && match.mac_durumu !== statusFilter) return false;
      if (!term) return true;
      return (
        match.first_team_name.toLocaleLowerCase("tr-TR").includes(term) ||
        match.second_team_name.toLocaleLowerCase("tr-TR").includes(term)
      );
    });
  }, [matches, statusFilter, search]);

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }
  if (!auth.isManagement) {
    return <Redirect href="/yonetim" />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader
        title="Maç Yönetimi"
        subtitle={[scope.cityLabel, scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ")}
      />

      {/* Durum filtresi */}
      <View style={styles.chips}>
        <Pressable
          onPress={() => setStatusFilter(null)}
          style={({ pressed }) => [
            styles.chip,
            statusFilter === null && styles.chipActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.chipText, statusFilter === null && styles.chipTextActive]}>Tümü</Text>
        </Pressable>
        {STATUS_ORDER.map((status) => (
          <Pressable
            key={status}
            onPress={() => setStatusFilter((prev) => (prev === status ? null : status))}
            style={({ pressed }) => [
              styles.chip,
              statusFilter === status && styles.chipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.chipText, statusFilter === status && styles.chipTextActive]}>
              {MATCH_STATUS_LABELS[status]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Takım adına göre arama */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Takım adı ara…"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {matchesQuery.isLoading || (!scope.ready && scope.loading) ? (
        <Loading />
      ) : matchesQuery.isError ? (
        <ErrorState error={matchesQuery.error} onRetry={matchesQuery.refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="football-outline"
          title="Maç bulunamadı"
          body="Bu kapsam ve filtrede maç yok. Filtreyi değiştirmeyi deneyin."
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const hasScore = item.first_team_score != null && item.second_team_score != null;
            return (
              <Pressable
                onPress={() => openMatch(item)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.rowBody}>
                  <Text style={styles.teams} numberOfLines={1}>
                    {item.first_team_name}
                    <Text style={styles.vs}>  –  </Text>
                    {item.second_team_name}
                  </Text>
                  <Text style={styles.meta}>
                    {formatDateShort(item.date)} · {formatTime(item.time)}
                    {item.match_field ? ` · ${item.match_field}` : ""}
                  </Text>
                </View>
                {hasScore ? (
                  <View style={styles.scorePill}>
                    <Text style={styles.scoreText}>
                      {item.first_team_score} - {item.second_team_score}
                    </Text>
                  </View>
                ) : null}
                <View
                  style={[styles.statusPill, { backgroundColor: statusColor(item.mac_durumu) + "1F" }]}
                >
                  <Text style={[styles.statusPillText, { color: statusColor(item.mac_durumu) }]}>
                    {item.mac_durumu ? MATCH_STATUS_LABELS[item.mac_durumu] : "—"}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Hızlı işlem penceresi */}
      <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <Pressable style={styles.backdrop} onPress={closeModal}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {selected ? (
              <>
                <Text style={styles.sheetTitle} numberOfLines={2}>
                  {selected.first_team_name} – {selected.second_team_name}
                </Text>
                <Text style={styles.sheetMeta}>
                  {formatDateShort(selected.date)} · {formatTime(selected.time)}
                </Text>

                {/* Skor girişi */}
                <Text style={styles.sectionLabel}>Skor</Text>
                <View style={styles.scoreRow}>
                  <TextInput
                    value={homeScore}
                    onChangeText={setHomeScore}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    style={styles.scoreInput}
                  />
                  <Text style={styles.scoreDash}>–</Text>
                  <TextInput
                    value={awayScore}
                    onChangeText={setAwayScore}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    style={styles.scoreInput}
                  />
                  <Pressable
                    onPress={submitScore}
                    disabled={scoreMutation.isPending}
                    style={({ pressed }) => [
                      styles.saveBtn,
                      (pressed || scoreMutation.isPending) && styles.pressed,
                    ]}
                  >
                    <Text style={styles.saveText}>
                      {scoreMutation.isPending ? "Kaydediliyor…" : "Skoru Kaydet"}
                    </Text>
                  </Pressable>
                </View>

                {/* Durum değiştirme */}
                <Text style={styles.sectionLabel}>Durum</Text>
                <View style={styles.statusRow}>
                  {STATUS_ORDER.map((status) => {
                    const active = selected.mac_durumu === status;
                    return (
                      <Pressable
                        key={status}
                        disabled={active || statusMutation.isPending}
                        onPress={() => statusMutation.mutate({ id: selected.id, status })}
                        style={({ pressed }) => [
                          styles.statusBtn,
                          active && { backgroundColor: statusColor(status), borderColor: statusColor(status) },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBtnText,
                            active && styles.statusBtnTextActive,
                          ]}
                        >
                          {MATCH_STATUS_LABELS[status]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Maç sayfası */}
                <Pressable
                  onPress={() => {
                    closeModal();
                    router.push(`/mac/${selected.id}`);
                  }}
                  style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="open-outline" size={15} color={colors.turf} />
                  <Text style={styles.linkText}>Maç sayfasını aç</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  chipActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  chipTextActive: {
    color: colors.surface,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    ...type.small,
    color: colors.line,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowBody: {
    flex: 1,
  },
  teams: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.line,
  },
  vs: {
    color: colors.muted,
    fontWeight: "600",
  },
  meta: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
  },
  scorePill: {
    backgroundColor: colors.goldDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  scoreText: {
    fontSize: 11,
    fontWeight: "900",
    color: colors.line,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "800",
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
  },
  sheetTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  sheetMeta: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  sectionLabel: {
    ...type.caption,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  scoreInput: {
    width: 52,
    height: 44,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: colors.line,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  scoreDash: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.muted,
  },
  saveBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.turf,
  },
  saveText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.surface,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  statusBtn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  statusBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.line,
  },
  statusBtnTextActive: {
    color: colors.surface,
    fontWeight: "800",
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.turf + "55",
  },
  linkText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.turf,
  },
  pressed: {
    opacity: 0.6,
  },
});
