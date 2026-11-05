/**
 * TAKIM SÖZLEŞMELERİ — kulübün oyuncularla yaptığı sözleşmeler.
 * `/takimim/sozlesmeler?durum=<ACTIVE|PENDING_ACTIVATION|…>`
 *
 * Web: TransferWorkspace → Contracts (scope="team"). GET /api/contracts?scope=team.
 * `scope=team` şart: double rolünde kapsamsız istek oyuncunun kendi
 * sözleşmelerini de karıştırır (bkz. lib/api/club/contracts.ts). Satır
 * sözleşme belgesini açar (/sozlesme/[id]).
 */

import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Avatar,
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
  type Tone,
} from "@/components/ui";
import { CONTRACT_STATUS_LABELS, getTeamContracts } from "@/lib/api/club/contracts";
import { formatMoney } from "@/lib/api/transfers";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space } from "@/theme";

const TONE: Record<string, Tone> = {
  ACTIVE: "win",
  PENDING_ACTIVATION: "warn",
  COMPLETED: "neutral",
  TERMINATED: "danger",
  CANCELLED: "neutral",
};
const STATUSES = Object.keys(CONTRACT_STATUS_LABELS);
const positionOf = (index: number, length: number) =>
  length === 1 ? "single" : index === 0 ? "first" : index === length - 1 ? "last" : "middle";

export default function TeamContractsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ durum?: string }>();
  const [status, setStatus] = useState<string | null>(STATUSES.includes(String(params.durum)) ? String(params.durum) : null);

  const query = useQuery({
    queryKey: ["club", "contracts", status ?? "all"],
    queryFn: () => getTeamContracts({ status }),
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Sözleşmeler"
        subtitle={query.data ? `${query.data.totalItems} sözleşme` : "Takımının oyuncu sözleşmeleri"}
        back
        scrollY={scrollY}
      />
      <FlatList
        {...scrollProps}
        data={query.isLoading ? [] : items}
        keyExtractor={(item) => item.public_id}
        refreshControl={refresh.control}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <ChipGroup contentPadding={0}>
              <Chip size="sm" label="Tümü" selected={!status} onPress={() => setStatus(null)} />
              {STATUSES.map((key) => (
                <Chip key={key} size="sm" label={CONTRACT_STATUS_LABELS[key]} selected={status === key} onPress={() => setStatus(key)} />
              ))}
            </ChipGroup>
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <SkeletonListRow count={6} />
          ) : query.isError ? (
            <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
          ) : (
            <EmptyState
              variant="inline"
              icon="document-text-outline"
              title="Sözleşme bulunamadı"
              body="Kabul edilen transfer teklifleri sözleşmeye dönüşür ve burada listelenir."
              action={{ label: "Transfer yönetimi", onPress: () => router.push("/takimim/transfer" as Href) }}
            />
          )
        }
        renderItem={({ item, index }) => (
          <ListRow
            leading={<Avatar name={item.player?.player_name ?? "?"} image={mediaUrl(item.player?.player_img ?? null)} size={layout.crestLg} />}
            title={item.player?.player_name ?? "Oyuncu"}
            subtitle={[
              `${formatDateShort(item.contract_start_date)} — ${item.contract_end_date ? formatDateShort(item.contract_end_date) : "süresiz"}`,
              item.transfer_fee != null && Number(item.transfer_fee) > 0 ? formatMoney(item.transfer_fee, item.currency ?? "TRY") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            badge={<Badge label={CONTRACT_STATUS_LABELS[item.status] ?? item.status} tone={TONE[item.status] ?? "neutral"} size="xs" />}
            position={positionOf(index, items.length)}
            onPress={() => router.push(`/sozlesme/${item.public_id}` as Href)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { paddingVertical: space.md },
});
