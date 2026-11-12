/**
 * KULÜP ŞEHRİ SIRALAMASI — /kulup-sehri-siralama
 *
 * Gelişim puanına göre ilk 50 şehir: Türkiye ya da kendi ilin. Her satırda
 * kulüp statüsü (Okul takımı … Avrupa devi); kendi satırın vurgulu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar, EmptyState, ErrorState, ScreenHeader, SegmentedControl, SkeletonListRow } from "@/components/ui";
import { cityKeys, getCityLeaderboard } from "@/lib/puzzle/api";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

export default function ClubCityLeaderboardScreen() {
  const auth = useAuth();
  const [scope, setScope] = useState<"all" | "city">("all");
  const query = useQuery({
    queryKey: cityKeys.leaderboard(scope),
    queryFn: () => getCityLeaderboard(scope),
    enabled: Boolean(auth.user),
    staleTime: 60_000,
  });

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Şehir sıralaması"
        subtitle="Gelişim puanına göre"
        back
        bottom={
          <View style={styles.filters}>
            <SegmentedControl
              items={[
                { key: "all", label: "Türkiye" },
                { key: "city", label: auth.user.city ? auth.user.city : "İlim" },
              ]}
              value={scope}
              onChange={(v) => setScope(v as "all" | "city")}
              stretch
              size="sm"
            />
          </View>
        }
      />
      {query.isLoading ? (
        <View style={styles.pad}>
          <SkeletonListRow count={8} avatar />
        </View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          data={query.data?.items ?? []}
          keyExtractor={(row) => String(row.user_id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="business-outline" title="Henüz şehir yok" body="İlk binayı sen kur." />}
          renderItem={({ item }) => (
            <View style={[styles.row, item.me ? styles.rowMe : null]}>
              <Text style={[styles.rank, item.rank <= 3 ? styles.rankTop : null]} {...textScale.badge}>
                {item.rank}
              </Text>
              <Avatar name={item.name} size={36} />
              <View style={styles.texts}>
                <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                  {item.me ? `${item.name} (sen)` : item.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
                  {item.city ? `${item.city} · ` : ""}
                  {item.tier}
                </Text>
              </View>
              <Ionicons name="trending-up" size={16} color={colors.brandAccent} />
              <Text style={styles.dev} {...textScale.badge}>
                {item.dev.toLocaleString("tr-TR")}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filters: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  pad: { padding: layout.screenPadding },
  list: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  rowMe: { borderColor: colors.brandAccent, backgroundColor: colors.brandDim },
  rank: { ...type.h3, fontFamily: fonts.bold, color: colors.textSecondary, width: 28, textAlign: "center" },
  rankTop: { color: colors.yellowCard },
  texts: { flex: 1, gap: 2 },
  name: { ...type.body, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textTertiary },
  dev: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary },
});
