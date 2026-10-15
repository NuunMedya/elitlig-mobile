/**
 * GİDEN TEKLİFLER — takım başkanının gönderdiği transfer teklifleri
 * (GET /api/transfer-offers/outbox).
 *
 * Satır teklif belgesini açar (/teklif/[id]); belgede takım tarafının
 * eylemleri (geri çek, revize et) sunucunun `actions` alanına göre çıkar.
 * Oyuncu revizyon istediyse satır vurgulanır: sıradaki hamle takımdadır.
 * Serbest kalma izni bekleyen teklif ayrıca etiketlenir.
 */

import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import { getOfferOutbox, type OutboxOffer } from "@/lib/api/transfers";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space } from "@/theme";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  SENT: { label: "Cevap bekliyor", tone: "warn" },
  REVISION_REQUESTED: { label: "Revizyon istendi", tone: "info" },
  ACCEPTED: { label: "Kabul edildi", tone: "win" },
  REJECTED: { label: "Reddedildi", tone: "danger" },
  WITHDRAWN: { label: "Geri çekildi", tone: "neutral" },
  EXPIRED: { label: "Süresi doldu", tone: "neutral" },
  CANCELLED: { label: "İptal edildi", tone: "neutral" },
};

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
        actions={[{ icon: "storefront-outline", onPress: () => router.push("/takimim/borsa"), accessibilityLabel: "Transfer borsası" }]}
      />
      {query.isLoading ? (
        <View style={styles.loading}>
          <SkeletonListRow count={6} />
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
          ListHeaderComponent={
            <View style={styles.header}>
              <ChipGroup contentPadding={0}>
                <Chip size="sm" label="Açık" count={openCount} selected={filter === "acik"} onPress={() => setFilter("acik")} />
                <Chip size="sm" label="Tümü" count={items.length} selected={filter === "tumu"} onPress={() => setFilter("tumu")} />
              </ChipGroup>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="swap-horizontal-outline"
              title={filter === "acik" ? "Açık teklifin yok" : "Henüz teklif göndermedin"}
              body="Bir oyuncunun profilinden ya da transfer borsasından teklif verebilirsin."
              action={{ label: "Transfer borsasını aç", onPress: () => router.push("/takimim/borsa") }}
              variant="inline"
            />
          }
          renderItem={({ item, index }) => (
            <OutboxRow
              offer={item}
              position={visible.length === 1 ? "single" : index === 0 ? "first" : index === visible.length - 1 ? "last" : "middle"}
              onPress={open}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const OutboxRow = React.memo(function OutboxRow({
  offer,
  position,
  onPress,
}: {
  offer: OutboxOffer;
  position: "single" | "first" | "middle" | "last";
  onPress: (publicId: string) => void;
}) {
  const meta = STATUS[offer.status] ?? { label: offer.status, tone: "neutral" as Tone };
  const subtitle = [
    offer.sent_at ? `Gönderildi ${formatDateShort(offer.sent_at)}` : null,
    offer.release_status === "PENDING" ? "Takımının izni bekleniyor" : null,
    offer.release_status === "REJECTED" ? "Takımı izin vermedi" : null,
    offer.awaiting_admin_approval ? "Yönetici onayı bekliyor" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ListRow
      leading={<Avatar name={offer.player?.player_name ?? "?"} image={mediaUrl(offer.player?.player_img ?? null)} size={layout.crestLg} />}
      title={offer.player?.player_name ?? "Oyuncu"}
      subtitle={subtitle || undefined}
      badge={<Badge label={meta.label} tone={meta.tone} size="xs" />}
      highlighted={offer.status === "REVISION_REQUESTED"}
      position={position}
      onPress={() => onPress(offer.public_id)}
    />
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loading: { paddingHorizontal: layout.screenPadding, paddingTop: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { paddingVertical: space.md },
});

