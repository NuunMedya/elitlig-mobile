import { useQuery } from "@tanstack/react-query";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getNewsFeed } from "@/lib/api/news";
import { stripHtml, timeAgo } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";

/**
 * Cezalar — sitedeki disiplin sayfasının uygulama içi hali.
 *
 * Disiplin kayıtları haber akışındaki `kind === "penalty"` girdilerinden
 * gelir. Sitedeki karar durumu filtreleri (devam eden / geçmiş) bu uçta
 * bulunmadığından tüm kayıtlar tarih sırasıyla listelenir; sunucu bu alanları
 * sunduğunda filtreler eklenecektir.
 */
export default function PenaltiesScreen() {
  const scope = useScope();
  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const query = useQuery({
    queryKey: queryKeys.newsFeed(scopeKey),
    queryFn: () => getNewsFeed(scopeKey),
    staleTime: 2 * 60_000,
  });

  const penalties = (query.data?.items ?? []).filter((item) => item.kind === "penalty");

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader
        title="Cezalar"
        subtitle={`${scope.cityLabel} · disiplin kayıtları`}
      />

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <FlatList
          data={penalties}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={
            penalties.length ? (
              <View style={styles.countCard}>
                <Text style={styles.countValue}>{penalties.length}</Text>
                <Text style={styles.countLabel}>toplam kayıt</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const detail = item.summary?.trim() || stripHtml(item.content, 200);
            return (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>CEZALI</Text>
                  </View>
                  <Text style={styles.time}>{timeAgo(item.published_at)}</Text>
                </View>
                <Text style={styles.title}>{item.title}</Text>
                {detail ? <Text style={styles.detail}>{detail}</Text> : null}
              </View>
            );
          }}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={query.refetch}
              tintColor={colors.turf}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="shield-checkmark-outline"
              title="Ceza kaydı yok"
              body="Bu kapsamda aktif disiplin kaydı bulunmuyor — centilmenlik kazanıyor."
            />
          }
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
    flexGrow: 1,
  },
  countCard: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  countValue: {
    ...type.title,
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  countLabel: {
    ...type.small,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pill: {
    backgroundColor: "#B4232A",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#FFFFFF",
  },
  time: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginLeft: "auto",
  },
  title: {
    ...type.body,
    color: colors.line,
    fontWeight: "700",
  },
  detail: {
    ...type.small,
    color: colors.muted,
    lineHeight: 20,
  },
});
