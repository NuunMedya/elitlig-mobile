import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getMyContracts } from "@/lib/api/panel";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Sözleşmelerim — oyuncu sözleşmeleri listesi (Faz 3).
 *
 * scope=player ile çekilir (double rolündeki üyeye takım sözleşmeleri
 * karışmasın — sunucu dökümündeki tuzak). ACTIVE ve PENDING_ACTIVATION
 * yeşil "aktif" sayılır; tarih aralığı ve takım gösterilir.
 */

const ACTIVE_STATUSES = new Set(["ACTIVE", "PENDING_ACTIVATION"]);

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  PENDING_ACTIVATION: "Aktivasyon bekliyor",
  EXPIRED: "Süresi doldu",
  TERMINATED: "Feshedildi",
};

export default function ContractsScreen() {
  const auth = useAuth();

  const query = useQuery({
    queryKey: ["panel", "contracts"],
    queryFn: () => getMyContracts(),
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const items = query.data?.items ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Sözleşmelerim" subtitle="Oyuncu sözleşmelerin" />

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="Sözleşme yok"
          body="Bir teklifi kabul ettiğinde sözleşmen burada görünür."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.public_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const active = ACTIVE_STATUSES.has(item.status);
            return (
              <View style={styles.card}>
                <TeamCrest
                  name={item.team?.team_name ?? "?"}
                  logo={mediaUrl(item.team?.logo ?? null)}
                  size={36}
                />
                <View style={styles.body}>
                  <Text style={styles.teamName} numberOfLines={1}>
                    {item.team?.team_name ?? "Takım"}
                  </Text>
                  <Text style={styles.dates}>
                    {item.contract_start_date ? formatDateShort(item.contract_start_date) : "?"}
                    {"  →  "}
                    {item.contract_end_date ? formatDateShort(item.contract_end_date) : "?"}
                  </Text>
                </View>
                <View style={[styles.statusChip, active ? styles.statusActive : styles.statusPassive]}>
                  <Text style={[styles.statusText, active && styles.statusTextActive]}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  body: {
    flex: 1,
  },
  teamName: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  dates: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  statusChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusActive: {
    backgroundColor: "#EAF7F0",
  },
  statusPassive: {
    backgroundColor: colors.surfaceRaised,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.muted,
  },
  statusTextActive: {
    color: colors.green,
  },
  pressed: {
    opacity: 0.7,
  },
});
