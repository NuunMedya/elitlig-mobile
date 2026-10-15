/**
 * TRANSFER BORSASI — satılık ve kiralık oyuncu ilanları (routes/transferMarket.js).
 *
 *   BORSA      GET /api/transfer-market/listings   açık ilanlar (tüm üyeler)
 *   İLANLARIM  GET /api/transfer-market/mine       takımın ilanları (başkan)
 *              POST /listings  ·  DELETE /listings/:id
 *
 * İlana teklif, normal transfer teklifi akışıyla verilir (/takimim/teklif-ver).
 * Oyuncu başına tek açık ilan olur; oyuncu takımdan ayrılınca ilan kapanır.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  ListRow,
  ScreenHeader,
  SegmentedControl,
  SkeletonListRow,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
} from "@/components/ui";
import { getPanelMe } from "@/lib/api/panel";
import { getTeamRoster } from "@/lib/api/team";
import {
  closeListing,
  createListing,
  formatMoney,
  getListings,
  getMyListings,
  type Listing,
  type TransferType,
} from "@/lib/api/transfers";
import { mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space, textScale, type } from "@/theme";

type Segment = "borsa" | "ilanlarim";
type TypeFilter = "all" | TransferType;

const fold = (value: string) => value.toLocaleLowerCase("tr-TR").trim();
const positionOf = (index: number, length: number) =>
  length === 1 ? "single" : index === 0 ? "first" : index === length - 1 ? "last" : "middle";

export default function TransferMarketScreen() {
  const params = useLocalSearchParams<{ bolum?: string }>();
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  const meQuery = useQuery({ queryKey: ["panel", "me"], queryFn: getPanelMe, enabled: Boolean(auth.user), staleTime: 60_000 });
  const isPresident = Boolean(meQuery.data?.team);
  const [segment, setSegment] = useState<Segment>(params.bolum === "ilanlarim" ? "ilanlarim" : "borsa");
  const segments: SegmentedItem<Segment>[] = [
    { key: "borsa", label: "Borsa" },
    ...(isPresident ? [{ key: "ilanlarim" as const, label: "İlanlarım" }] : []),
  ];

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Transfer borsası"
        subtitle="Satılık ve kiralık oyuncular"
        back
        scrollY={scrollY}
        actions={isPresident ? [{ icon: "paper-plane-outline", onPress: () => router.push("/takimim/teklifler"), accessibilityLabel: "Giden teklifler" }] : undefined}
      />
      {segments.length > 1 ? (
        <View style={styles.segment}>
          <SegmentedControl items={segments} value={segment} onChange={setSegment} />
        </View>
      ) : null}
      {segment === "ilanlarim" && isPresident ? (
        <MyListings scrollProps={scrollProps} />
      ) : (
        <Market scrollProps={scrollProps} canOffer={isPresident} ownTeamId={meQuery.data?.team?.id ?? null} />
      )}
    </SafeAreaView>
  );
}

type ScrollProps = ReturnType<typeof useHeaderScroll>["scrollProps"];

/* ═══════════════════════════════ BORSA ═══════════════════════════════ */

function Market({ scrollProps, canOffer, ownTeamId }: { scrollProps: ScrollProps; canOffer: boolean; ownTeamId: number | null }) {
  const router = useRouter();
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<Listing | null>(null);

  const query = useQuery({ queryKey: ["transfer-market", "listings"], queryFn: () => getListings(), staleTime: 60_000 });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const items = useMemo(() => {
    const needle = fold(term);
    return (query.data?.items ?? []).filter(
      (item) =>
        (filter === "all" || item.listing_type === filter) &&
        (!needle || fold(`${item.player.name ?? ""} ${item.team.name ?? ""}`).includes(needle)),
    );
  }, [filter, query.data, term]);

  if (query.isLoading) return <View style={styles.loading}><SkeletonListRow count={6} /></View>;
  if (query.isError && !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const own = picked ? picked.is_mine || (ownTeamId != null && picked.team.id === ownTeamId) : false;

  return (
    <>
      <FlatList
        {...scrollProps}
        data={items}
        keyExtractor={(item) => item.public_id}
        refreshControl={refresh.control}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Input variant="search" size="sm" value={term} onChangeText={setTerm} placeholder="Oyuncu ya da takım ara" autoCorrect={false} />
            <ChipGroup contentPadding={0}>
              <Chip size="sm" label="Tümü" selected={filter === "all"} onPress={() => setFilter("all")} />
              <Chip size="sm" label="Satılık" selected={filter === "sale"} onPress={() => setFilter("sale")} />
              <Chip size="sm" label="Kiralık" selected={filter === "loan"} onPress={() => setFilter("loan")} />
            </ChipGroup>
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="storefront-outline" title="İlan yok" body="Şu an bu süzgece uyan açık ilan bulunmuyor." variant="inline" />
        }
        renderItem={({ item, index }) => (
          <ListingRow listing={item} position={positionOf(index, items.length)} onPress={() => setPicked(item)} />
        )}
      />
      <BottomSheet visible={Boolean(picked)} onClose={() => setPicked(null)} title={picked?.player.name ?? "İlan"} snap="content">
        {picked ? (
          <View style={styles.sheet}>
            <Text style={styles.sheetText} {...textScale.long}>
              {[picked.type_label, picked.team.name, picked.player.position].filter(Boolean).join(" · ")}
              {picked.asking_fee != null ? `\nİstenen bedel: ${formatMoney(picked.asking_fee)}` : ""}
              {picked.note ? `\n\n${picked.note}` : ""}
            </Text>
            <Button
              label="Oyuncu profili"
              variant="secondary"
              icon="person-outline"
              onPress={() => {
                setPicked(null);
                router.push(`/oyuncu/${picked.player.id}`);
              }}
              fullWidth
            />
            {canOffer && !own ? (
              <Button
                label="Teklif ver"
                icon="swap-horizontal"
                onPress={() => {
                  setPicked(null);
                  router.push(
                    `/takimim/teklif-ver?playerId=${picked.player.id}&playerName=${encodeURIComponent(picked.player.name ?? "")}&tur=${picked.listing_type}`,
                  );
                }}
                fullWidth
              />
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
}

const ListingRow = React.memo(function ListingRow({
  listing,
  position,
  onPress,
  trailing,
}: {
  listing: Listing;
  position: "single" | "first" | "middle" | "last";
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  const subtitle = [
    listing.player.position,
    listing.team.name,
    listing.asking_fee != null ? formatMoney(listing.asking_fee) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ListRow
      leading={<Avatar name={listing.player.name ?? "?"} image={mediaUrl(listing.player.image ?? null)} size={layout.crestLg} />}
      title={listing.player.name ?? "Oyuncu"}
      subtitle={subtitle || undefined}
      badge={
        <Badge
          label={listing.status === "open" ? listing.type_label : "Kapalı"}
          tone={listing.status !== "open" ? "neutral" : listing.listing_type === "loan" ? "info" : "warn"}
          size="xs"
        />
      }
      position={position}
      onPress={onPress}
      trailing={trailing}
    />
  );
});

/* ═══════════════════════════════ İLANLARIM ═══════════════════════════════ */

function MyListings({ scrollProps }: { scrollProps: ScrollProps }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [closing, setClosing] = useState<Listing | null>(null);

  const query = useQuery({ queryKey: ["transfer-market", "mine"], queryFn: getMyListings, staleTime: 30_000 });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const items = query.data?.items ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["transfer-market"] });
  };

  const close = useMutation({
    mutationFn: (listing: Listing) => closeListing(listing.public_id),
    onSuccess: (data) => {
      setClosing(null);
      invalidate();
      toast.show({ message: data.message || "İlan kapatıldı.", tone: "neutral" });
    },
    onError: (error) => toast.show({ message: error instanceof ApiError ? error.userMessage : "İlan kapatılamadı.", tone: "danger" }),
  });

  if (query.isLoading) return <View style={styles.loading}><SkeletonListRow count={4} /></View>;
  if (query.isError && !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <>
      <FlatList
        {...scrollProps}
        data={items}
        keyExtractor={(item) => item.public_id}
        refreshControl={refresh.control}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button label="Yeni ilan ver" icon="add" onPress={() => setCreateOpen(true)} fullWidth />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="pricetag-outline"
            title="Henüz ilanın yok"
            body="Kadrondaki bir oyuncuyu satılık ya da kiralık listesine koyabilirsin; oyuncuya da bildirilir."
            variant="inline"
          />
        }
        renderItem={({ item, index }) => (
          <ListingRow
            listing={item}
            position={positionOf(index, items.length)}
            onPress={item.status === "open" ? () => setClosing(item) : undefined}
          />
        )}
      />
      <CreateListingSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        takenPlayerIds={items.filter((item) => item.status === "open").map((item) => item.player.id)}
        onCreated={(message) => {
          setCreateOpen(false);
          invalidate();
          toast.show({ message, tone: "success" });
        }}
      />
      <BottomSheet
        visible={Boolean(closing)}
        onClose={() => setClosing(null)}
        title="İlanı kapat"
        snap="content"
        footer={
          <View style={styles.footer}>
            <Button label="Vazgeç" variant="ghost" onPress={() => setClosing(null)} style={styles.flex} />
            <Button
              label="Kapat"
              variant="danger"
              onPress={() => closing && close.mutate(closing)}
              loading={close.isPending}
              style={styles.flex}
            />
          </View>
        }
      >
        <Text style={styles.sheetText} {...textScale.long}>
          {closing?.player.name} için açtığın {closing?.type_label.toLocaleLowerCase("tr-TR")} ilanı kapatılacak.
        </Text>
      </BottomSheet>
    </>
  );
}

function CreateListingSheet({
  visible,
  onClose,
  onCreated,
  takenPlayerIds,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (message: string) => void;
  takenPlayerIds: number[];
}) {
  const rosterQuery = useQuery({ queryKey: ["takim", "roster"], queryFn: getTeamRoster, enabled: visible, staleTime: 60_000 });
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [listingType, setListingType] = useState<TransferType>("sale");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Kiralık gelen oyuncu ilana konamaz: kaydı kendi kulübünde (sunucu 404 döner).
  const players = (rosterQuery.data?.roster ?? []).filter(
    (player) => !player.is_loan && !takenPlayerIds.includes(player.id),
  );
  const feeNumber = fee.trim() ? Number(fee.replace(",", ".")) : null;
  const feeInvalid = feeNumber != null && (!Number.isFinite(feeNumber) || feeNumber < 0);

  const create = useMutation({
    mutationFn: () => createListing({ player_id: playerId as number, listing_type: listingType, asking_fee: feeNumber, note: note.trim() }),
    onSuccess: (data) => {
      setPlayerId(null);
      setFee("");
      setNote("");
      setError(null);
      onCreated(data.message || "İlan açıldı.");
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.userMessage : "İlan açılamadı."),
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Yeni ilan"
      snap="full"
      footer={
        <Button
          label="İlanı yayınla"
          onPress={() => create.mutate()}
          loading={create.isPending}
          disabled={!playerId || feeInvalid}
          fullWidth
        />
      }
    >
      <View style={styles.sheet}>
        <Text style={styles.label} {...textScale.dense}>
          Oyuncu
        </Text>
        {rosterQuery.isLoading ? (
          <SkeletonListRow count={4} />
        ) : players.length ? (
          <View style={styles.chips}>
            {players.map((player) => (
              <Chip key={player.id} size="sm" label={player.player_name} selected={playerId === player.id} onPress={() => setPlayerId(player.id)} />
            ))}
          </View>
        ) : (
          <Text style={styles.sheetText} {...textScale.long}>
            İlana koyulabilecek oyuncu yok.
          </Text>
        )}
        <Text style={styles.label} {...textScale.dense}>
          Tür
        </Text>
        <View style={styles.chips}>
          <Chip label="Satılık" selected={listingType === "sale"} onPress={() => setListingType("sale")} />
          <Chip label="Kiralık" selected={listingType === "loan"} onPress={() => setListingType("loan")} />
        </View>
        <Input
          label="İstenen bedel (isteğe bağlı)"
          value={fee}
          onChangeText={setFee}
          keyboardType="decimal-pad"
          error={feeInvalid ? "0 ya da pozitif bir tutar gir." : undefined}
        />
        <Input label="Not (isteğe bağlı)" value={note} onChangeText={setNote} multiline maxLength={500} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  segment: { paddingHorizontal: layout.screenPadding, paddingTop: space.md },
  loading: { paddingHorizontal: layout.screenPadding, paddingTop: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { gap: space.sm, paddingVertical: space.md },
  sheet: { gap: space.md },
  sheetText: { ...type.body, color: colors.textSecondary },
  label: { ...type.label, color: colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  footer: { flexDirection: "row", gap: space.sm },
  error: { ...type.caption, color: colors.danger },
});
