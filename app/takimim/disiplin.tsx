/**
 * DİSİPLİN SÜREÇLERİ — takımın disiplin dosyaları; savunma ve itiraz.
 * `/takimim/disiplin?durum=aksiyon`
 *
 * Web: pages/panel/TeamPenaltyDefense.js. Liste GET /api/penalties/mine'dan
 * gelir; sunucu her dosya için üyenin hangi SIFATLA savunma yapabileceğini
 * (`available_sides`) döndürür. Takım ekranı yalnız "team" sıfatı olan
 * dosyaları gösterir — oyuncunun kişisel cezaları Kariyerim'dedir. Savunma ve
 * itiraz metni dosya ekranında (`/ceza/[id]`) yazılır; o ekran sıfat seçimini
 * zaten `available_sides` ile yapar.
 *
 * "Süre işliyor" kuralı Kulübüm'deki dikkat kartıyla AYNIDIR
 * (useClubSignals.penaltyNeedsAction) — iki yerde farklı sayı çıkmaz.
 */

import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { penaltyNeedsAction } from "@/components/club/useClubSignals";
import {
  Badge,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SkeletonListRow,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import { getMyPenalties, type Penalty } from "@/lib/api/panel";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space } from "@/theme";

type Filter = "aksiyon" | "tumu";
const positionOf = (index: number, length: number) =>
  length === 1 ? "single" : index === 0 ? "first" : index === length - 1 ? "last" : "middle";

function deadlineText(penalty: Penalty): string | null {
  const open = (value: string | null) => Boolean(value && new Date(value).getTime() > Date.now());
  if (open(penalty.defense_deadline_at)) return `Savunma son gün ${formatDateShort(penalty.defense_deadline_at)}`;
  if (penalty.status === "kurul_karari" && open(penalty.objection_deadline_at)) return `İtiraz son gün ${formatDateShort(penalty.objection_deadline_at)}`;
  return null;
}

export default function TeamDisciplineScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ durum?: string }>();
  const [filter, setFilter] = useState<Filter>(params.durum === "aksiyon" ? "aksiyon" : "tumu");

  // Anahtar cezalarim/ceza/[id] ile ortak: bir savunma gönderilince liste tazelenir.
  const query = useQuery({
    queryKey: ["panel", "penalties"],
    queryFn: getMyPenalties,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const teamItems = useMemo(
    () => (query.data?.items ?? []).filter((item) => item.available_sides?.includes("team") || item.viewer_side === "team"),
    [query.data],
  );
  const actionable = teamItems.filter(penaltyNeedsAction);
  const visible = filter === "aksiyon" ? actionable : teamItems;

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Disiplin süreçleri" subtitle="Takımının disiplin dosyaları" back scrollY={scrollY} />
      <FlatList
        {...scrollProps}
        data={query.isLoading ? [] : visible}
        keyExtractor={(item) => item.public_id}
        refreshControl={refresh.control}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <ChipGroup contentPadding={0}>
              <Chip size="sm" label="Süre işleyen" count={actionable.length || undefined} selected={filter === "aksiyon"} onPress={() => setFilter("aksiyon")} />
              <Chip size="sm" label="Tümü" count={teamItems.length || undefined} selected={filter === "tumu"} onPress={() => setFilter("tumu")} />
            </ChipGroup>
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <SkeletonListRow count={5} />
          ) : query.isError ? (
            <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
          ) : (
            <EmptyState
              variant="inline"
              icon="shield-checkmark-outline"
              title={filter === "aksiyon" ? "Süresi işleyen dosya yok" : "Disiplin dosyası yok"}
              body="Takımın hakkında açılan dosyalar ve kurul kararları burada listelenir."
            />
          )
        }
        renderItem={({ item, index }) => {
          const deadline = deadlineText(item);
          return (
            <ListRow
              leading={{ icon: deadline ? "alert-circle" : "document-text-outline", tone: deadline ? "danger" : "neutral" }}
              title={item.player_name ?? item.team_name ?? "Disiplin dosyası"}
              subtitle={[deadline, item.match_label, item.disiplin_karari].filter(Boolean).join(" · ") || undefined}
              badge={<Badge label={item.status_label} tone={deadline ? "danger" : "neutral"} size="xs" />}
              highlighted={Boolean(deadline)}
              position={positionOf(index, visible.length)}
              onPress={() => router.push(`/ceza/${item.public_id}` as Href)}
            />
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { paddingVertical: space.md },
});
