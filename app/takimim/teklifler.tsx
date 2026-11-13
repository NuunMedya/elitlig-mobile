/**
 * GİDEN TEKLİFLER — takım başkanının gönderdiği transfer teklifleri
 * (GET /api/transfer-offers/outbox).
 *
 * Satır teklif belgesini açar (/teklif/[id]); belgede takım tarafının
 * eylemleri (geri çek, revize et) sunucunun `actions` alanına göre çıkar.
 * Oyuncu revizyon istediyse satır vurgulanır: sıradaki hamle takımdadır.
 * Serbest kalma izni bekleyen teklif ayrıca etiketlenir.
 *
 * TASARIM: üstte açık/tümü seçici ve durum dağılımı (parçalı çubuk +
 * lejant); teklifler OfferCard ile (durum hapı, süreç adımları, notlar).
 */

import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter, type Href } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LegendItem, SplitBar } from "@/components/team/ClubKit";
import { OfferCard } from "@/components/team/OfferCard";
import {
  EmptyState,
  ErrorState,
  Reveal,
  ScreenHeader,
  SegmentedControl,
  Skeleton,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import { getOfferOutbox } from "@/lib/api/transfers";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space } from "@/theme";

type Filter = "acik" | "tumu";
const OPEN = new Set(["SENT", "REVISION_REQUESTED"]);

export default function OutboxScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [filter, setFilter] = useState<Filter>("acik");

  const query = useQuery({
    queryKey: ["takim", "outbox"],
    queryFn: () => getOfferOutbox(),
    enabled: Boolean(auth.user),
    staleTime: 30_000,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const openCount = items.filter((item) => OPEN.has(item.status)).length;
  const accepted = items.filter((item) => item.status === "ACCEPTED").length;
  const rejected = items.filter((item) => item.status === "REJECTED").length;
  const visible = filter === "acik" ? items.filter((item) => OPEN.has(item.status)) : items;

  const open = useCallback((publicId: string) => router.push(`/teklif/${publicId}`), [router]);

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Giden teklifler"
        subtitle="Takımının gönderdiği transfer teklifleri"
        back
        scrollY={scrollY}
        actions={[
          { icon: "add-circle-outline", onPress: () => router.push("/takimim/oyuncu-ara" as Href), accessibilityLabel: "Yeni teklif ver" },
          { icon: "storefront-outline", onPress: () => router.push("/takimim/borsa"), accessibilityLabel: "Transfer borsası" },
        ]}
      />
      {query.isLoading ? (
        <View style={styles.loading}>
          <Skeleton height={44} radius="lg" />
          <Skeleton height={140} radius="xl" />
          <Skeleton height={140} radius="xl" />
        </View>
      ) : query.isError && !items.length ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <FlatList
          {...scrollProps}
          data={visible}
          keyExtractor={(item) => item.public_id}
          refreshControl={refresh.control}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={Gap}
          ListHeaderComponent={
            <View style={styles.header}>
              <SegmentedControl
                items={[
                  { key: "acik", label: `Açık (${openCount})` },
                  { key: "tumu", label: `Tümü (${items.length})` },
                ]}
                value={filter}
                onChange={setFilter}
              />
              {items.length ? (
                <View style={styles.dist}>
                  <SplitBar
                    height={8}
                    parts={[
                      { key: "open", value: openCount, color: colors.warn },
                      { key: "ok", value: accepted, color: colors.win },
                      { key: "no", value: rejected, color: colors.loss },
                      { key: "rest", value: items.length - openCount - accepted - rejected, color: colors.slateSoft },
                    ]}
                  />
                  <View style={styles.legend}>
                    <LegendItem color={colors.warn} label="Süreçte" value={openCount} />
                    <LegendItem color={colors.win} label="Kabul" value={accepted} />
                    <LegendItem color={colors.loss} label="Ret" value={rejected} />
                  </View>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="swap-horizontal-outline"
              title={filter === "acik" ? "Açık teklifin yok" : "Henüz teklif göndermedin"}
              body="Futbolcu veritabanında oyuncu bul; satırdaki “Teklif ver” ile şartları gönder."
              action={{ label: "Oyuncu ara", onPress: () => router.push("/takimim/oyuncu-ara" as Href) }}
              secondaryAction={{ label: "Transfer borsası", onPress: () => router.push("/takimim/borsa") }}
              variant="inline"
            />
          }
          renderItem={({ item, index }) => (
            <Reveal index={index} limit={6} distance={8}>
              <OfferCard offer={item} onPress={open} />
            </Reveal>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loading: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, gap: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { paddingVertical: space.md, gap: space.md },
  dist: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  legend: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  gap: { height: space.md },
});
