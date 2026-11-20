/**
 * TRANSFER BORSASI — satılık ve kiralık oyuncu ilanları (routes/transferMarket.js).
 *
 *   İLANLAR         GET /api/transfer-market/listings   açık ilanlar (tüm üyeler), sayfalı
 *   TÜM OYUNCULAR   GET /api/player-database            ilana çıkmamış oyuncular da, sayfalı
 *   İLANLARIM       GET /api/transfer-market/mine       takımın ilanları (başkan)
 *                   POST /listings  ·  DELETE /listings/:id
 *
 * NEDEN "TÜM OYUNCULAR": borsa yalnız ilana çıkarılmış oyuncuları (ilk 300
 * ilan) gösteriyordu; başkan ilanda olmayan oyuncuya buradan teklif
 * veremiyordu ("tüm oyuncular görünmüyor"). Artık iki liste de sunucuda
 * sayfalanır ve aranır, sonsuz kaydırmayla yüklenir. Teklif verilemeyen
 * oyuncuda (kendi oyuncun) düğme yerine sunucunun verdiği neden yazar; il
 * kilidi gereği listenin hangi ille sınırlı olduğu başlıkta söylenir.
 *
 * İlana teklif, normal transfer teklifi akışıyla verilir (/takimim/teklif-ver);
 * düğme satırın sağındadır (OfferCta), alt sayfada da tekrarlanır.
 * Oyuncu başına tek açık ilan olur; oyuncu takımdan ayrılınca ilan kapanır.
 *
 * TASARIM (gece teması): üstte piyasa özeti (açık ilan · satılık · kiralık),
 * arama ve tür seçici (SegmentedControl). Her ilan bir PİYASA KARTI: oyuncu
 * kimliği + tür hapı, takım satırı, değer şeridi (piyasa değeri · istenen
 * bedel · ▲▼ fark yüzdesi), ilan notu ve eylem. İstenen bedel piyasa
 * değerinin altındaysa ▼ yeşil ("fırsat"), üstündeyse ▲ kırmızı.
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OfferCta, offerHref } from "@/components/club/team/OfferCta";
import { useTeamAccess } from "@/components/club/team/useTeamAccess";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  MetricGrid,
  MetricTile,
  Reveal,
  ScreenHeader,
  SegmentedControl,
  Skeleton,
  SkeletonListFooter,
  SkeletonListRow,
  TeamLogo,
  Touchable,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
} from "@/components/ui";
import { getTeamRoster } from "@/lib/api/team";
import { DATABASE_ERRORS, searchPlayerDatabase, type DatabasePlayer } from "@/lib/api/club/playerDatabase";
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
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";
import { parseAmount } from "@/lib/api/admin/accounting";

type Segment = "borsa" | "oyuncular" | "ilanlarim";
type TypeFilter = "all" | TransferType;

/** Yazarken her harfte istek atılmasın: 400 ms gecikmeli arama terimi. */
function useDebounced(value: string, ms = 400) {
  const [debounced, setDebounced] = useState(value.trim());
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), ms);
    return () => clearTimeout(timer);
  }, [ms, value]);
  return debounced;
}

const TYPE_ITEMS: SegmentedItem<TypeFilter>[] = [
  { key: "all", label: "Tümü" },
  { key: "sale", label: "Satılık" },
  { key: "loan", label: "Kiralık" },
];

function ageOf(birth?: string | null): number | null {
  if (!birth) return null;
  const date = new Date(birth);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  if (now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())) age -= 1;
  return age > 0 && age < 80 ? age : null;
}

function ago(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  if (days < 30) return `${days} gün önce`;
  return `${Math.floor(days / 30)} ay önce`;
}

/** Kısa tutar: 142.000 → "142 B ₺". */
function shortFee(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} Mn ₺`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} B ₺`;
  return `${Math.round(n)} ₺`;
}

function MarketSkeleton() {
  return (
    <View style={styles.loading}>
      <Skeleton height={76} radius="xl" />
      <Skeleton height={44} radius="lg" />
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} height={196} radius="xl" />
      ))}
    </View>
  );
}

export default function TransferMarketScreen() {
  const params = useLocalSearchParams<{ bolum?: string }>();
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  // Takım yetkisi web ile aynı kaynaktan (panel/me) — bkz. useTeamAccess.
  const access = useTeamAccess();
  const isPresident = access.canManage;
  const [segment, setSegment] = useState<Segment>(
    params.bolum === "ilanlarim" ? "ilanlarim" : params.bolum === "oyuncular" ? "oyuncular" : "borsa",
  );
  /** İlanlarda bulunamayan aramayı "Tüm oyuncular"a taşır. */
  const [carry, setCarry] = useState("");
  const segments: SegmentedItem<Segment>[] = [
    { key: "borsa", label: "İlanlar" },
    { key: "oyuncular", label: "Tüm oyuncular" },
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
        actions={isPresident ? [{ icon: "paper-plane-outline", onPress: () => router.push("/takimim/transfer" as Href), accessibilityLabel: "Transfer yönetimi" }] : undefined}
      />
      <View style={styles.segment}>
        <SegmentedControl items={segments} value={segment} onChange={setSegment} />
      </View>
      {segment === "ilanlarim" && isPresident ? (
        <MyListings scrollProps={scrollProps} />
      ) : segment === "oyuncular" ? (
        <AllPlayers key={carry} scrollProps={scrollProps} canOffer={isPresident} initialSearch={carry} />
      ) : (
        <Market
          scrollProps={scrollProps}
          canOffer={isPresident}
          ownTeamId={access.teamId}
          onBrowseAll={(term) => {
            setCarry(term.trim());
            setSegment("oyuncular");
          }}
        />
      )}
    </SafeAreaView>
  );
}

type ScrollProps = ReturnType<typeof useHeaderScroll>["scrollProps"];

/* ═══════════════════════════════ BORSA ═══════════════════════════════ */

function Market({
  scrollProps,
  canOffer,
  ownTeamId,
  onBrowseAll,
}: {
  scrollProps: ScrollProps;
  canOffer: boolean;
  ownTeamId: number | null;
  onBrowseAll: (term: string) => void;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [term, setTerm] = useState("");
  const search = useDebounced(term);
  const [picked, setPicked] = useState<Listing | null>(null);

  // Sayfalı + sunucuda arama: eskiden ilk 300 ilan çekilip bellekte süzülüyordu.
  const query = useInfiniteQuery({
    queryKey: ["transfer-market", "listings", filter, search],
    queryFn: ({ pageParam }) => getListings({ type: filter === "all" ? undefined : filter, q: search, page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching && !query.isFetchingNextPage });

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  if (query.isLoading) return <MarketSkeleton />;
  if (query.isError && !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const firstPage = query.data?.pages[0];
  const totalItems = firstPage?.totalItems ?? items.length;
  const counts = firstPage?.counts;
  const saleCount = counts?.sale ?? items.filter((item) => item.listing_type === "sale").length;
  const loanCount = counts?.loan ?? items.filter((item) => item.listing_type === "loan").length;
  const allCount = counts?.total ?? saleCount + loanCount;

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
        ItemSeparatorComponent={Gap}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        ListFooterComponent={query.isFetchingNextPage ? <SkeletonListFooter /> : null}
        ListHeaderComponent={
          <View style={styles.header}>
            <MetricGrid columns={3}>
              <MetricTile label="İlan" value={String(allCount)} icon="storefront" tone="brand" />
              <MetricTile label="Satılık" value={String(saleCount)} icon="pricetag" tone="warn" onPress={() => setFilter(filter === "sale" ? "all" : "sale")} />
              <MetricTile label="Kiralık" value={String(loanCount)} icon="repeat" tone="accent" onPress={() => setFilter(filter === "loan" ? "all" : "loan")} />
            </MetricGrid>
            <Input variant="search" leadingIcon="search" size="sm" value={term} onChangeText={setTerm} placeholder="Oyuncu ya da takım ara" autoCorrect={false} />
            <SegmentedControl items={TYPE_ITEMS} value={filter} onChange={setFilter} />
            <Text style={styles.resultText} {...textScale.dense}>
              {`${totalItems} ilan${filter !== "all" || search ? " · süzgeçli" : ""}`}
            </Text>
            <Touchable
              feedback="row"
              onPress={() => onBrowseAll(term)}
              accessibilityRole="button"
              accessibilityLabel="Tüm oyuncular listesini aç"
              style={styles.browseAll}
            >
              <Text style={styles.browseAllText} {...textScale.dense}>
                {canOffer ? "Aradığın oyuncu ilanda değil mi? Tüm oyuncular listesinden teklif ver." : "İlana çıkmamış oyuncular için Tüm oyuncular listesine bak."}
              </Text>
            </Touchable>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="storefront-outline"
            title="İlan yok"
            body="Şu an bu süzgece uyan açık ilan bulunmuyor. İlanda olmayan oyuncular Tüm oyuncular listesinde."
            variant="inline"
            action={{ label: search ? `"${search}" için tüm oyuncularda ara` : "Tüm oyuncuları göster", onPress: () => onBrowseAll(term) }}
          />
        }
        renderItem={({ item, index }) => {
          /* Teklif düğmesi KARTTA: eskiden yalnız ilana dokununca açılan alt
             sayfadaydı; başkan teklif verebildiğini görmüyordu. */
          const mine = item.is_mine || (ownTeamId != null && item.team.id === ownTeamId);
          return (
            <Reveal index={index} limit={6} distance={8}>
              <ListingCard
                listing={item}
                mine={mine}
                onPress={() => setPicked(item)}
                action={
                  canOffer && !mine ? (
                    <OfferCta
                      layout="compact"
                      playerId={item.player.id}
                      playerName={item.player.name ?? "Oyuncu"}
                      playerTeamId={item.team.id}
                    />
                  ) : undefined
                }
              />
            </Reveal>
          );
        }}
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
                  router.push(offerHref(picked.player.id, picked.player.name ?? "", picked.listing_type) as Href);
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

/* ═══════════════════════════════ TÜM OYUNCULAR ═══════════════════════════════ */

/**
 * İlana çıkmamış oyuncular dahil, üyenin görebildiği tüm oyuncular
 * (GET /api/player-database). Sunucuda sayfalanır ve aranır; liste sonuna
 * gelince sıradaki sayfa yüklenir. Teklif kararı sunucunun
 * `canReceiveOffer / activeOfferPublicId / offerBlockedReason` alanlarından
 * gelir; istemci kural uydurmaz.
 */
function AllPlayers({ scrollProps, canOffer, initialSearch }: { scrollProps: ScrollProps; canOffer: boolean; initialSearch: string }) {
  const router = useRouter();
  const [term, setTerm] = useState(initialSearch);
  const search = useDebounced(term);

  const query = useInfiniteQuery({
    queryKey: ["transfer-market", "players", search],
    queryFn: ({ pageParam }) => searchPlayerDatabase({ search, sort: "name:ASC", page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    staleTime: 60_000,
    retry: false,
    placeholderData: (previous) => previous,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching && !query.isFetchingNextPage });
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  const errorCode = query.error instanceof ApiError ? query.error.code : undefined;
  if (errorCode === "MEMBER_CITY_REQUIRED") {
    return (
      <EmptyState
        icon="location-outline"
        title="İl bilgin eksik"
        body={DATABASE_ERRORS.MEMBER_CITY_REQUIRED}
        action={{ label: "Hesabımı düzenle", onPress: () => router.push("/hesabim") }}
      />
    );
  }
  if (query.isLoading) return <MarketSkeleton />;
  if (query.isError && !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const firstPage = query.data?.pages[0];
  const total = firstPage?.totalItems ?? items.length;
  const scope = firstPage?.scope;

  return (
    <FlatList
      {...scrollProps}
      data={items}
      keyExtractor={(item) => String(item.id)}
      refreshControl={refresh.control}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      ItemSeparatorComponent={Gap}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      ListFooterComponent={query.isFetchingNextPage ? <SkeletonListFooter /> : null}
      ListHeaderComponent={
        <View style={styles.header}>
          <Input variant="search" leadingIcon="search" size="sm" value={term} onChangeText={setTerm} placeholder="Oyuncu adı ara" autoCorrect={false} />
          <Text style={styles.resultText} {...textScale.dense}>
            {`${total} oyuncu${search ? " · aramaya uyan" : ""}${scope?.locked && scope.cityName ? ` · ${scope.cityName}` : ""}`}
          </Text>
          {scope?.locked ? (
            <Text style={styles.scopeNote} {...textScale.long}>
              {`İl kuralı gereği yalnız kayıtlı olduğun ildeki${scope.cityName ? ` (${scope.cityName})` : ""} oyuncular listelenir.`}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="search-outline"
          title="Eşleşen oyuncu yok"
          body={search ? "Farklı bir ad dene." : "Listelenecek oyuncu bulunmuyor."}
          variant="inline"
          action={search ? { label: "Aramayı temizle", onPress: () => setTerm("") } : undefined}
        />
      }
      renderItem={({ item, index }) => (
        <Reveal index={index} limit={6} distance={8}>
          <PlayerRow player={item} canOffer={canOffer} onOpen={() => router.push(`/oyuncu/${item.id}`)} />
        </Reveal>
      )}
    />
  );
}

const PlayerRow = React.memo(function PlayerRow({ player, canOffer, onOpen }: { player: DatabasePlayer; canOffer: boolean; onOpen: () => void }) {
  const market = player.marketValue != null ? Number(player.marketValue) : null;
  const facts = [player.position, player.age != null ? `${player.age} yaş` : null, shortFee(market && market > 0 ? market : null)].filter(Boolean).join(" · ");
  const blocked = player.isOwnPlayer ? (player.offerBlockedReason ?? "Kendi oyuncunuz; teklif verilemez.") : null;

  let action: React.ReactNode = null;
  if (canOffer) {
    action = blocked ? (
      <Text style={styles.blocked} {...textScale.dense}>
        {`Bu oyuncuya teklif verilemez: ${blocked}`}
      </Text>
    ) : (
      <OfferCta
        layout="compact"
        playerId={player.id}
        playerName={player.displayName}
        playerTeamId={player.teamId}
        activeOfferId={player.activeOfferPublicId ?? (player.canReceiveOffer === undefined ? undefined : null)}
      />
    );
  }

  return (
    <Touchable
      onPress={onOpen}
      feedback="card"
      accessibilityRole="button"
      accessibilityLabel={[player.displayName, player.position, player.teamName ?? "Serbest"].filter(Boolean).join(", ")}
      style={[styles.card, player.isOwnPlayer && styles.cardMine]}
    >
      {player.isOwnPlayer ? <View style={styles.mineStripe} /> : null}
      <View style={styles.cardTop}>
        <Avatar name={player.displayName} image={mediaUrl(player.profileImage)} size={46} />
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName} numberOfLines={1} {...textScale.dense}>
            {player.displayName}
          </Text>
          {facts ? (
            <Text style={styles.cardFacts} numberOfLines={1} {...textScale.dense}>
              {facts}
            </Text>
          ) : null}
        </View>
        {player.isFreeAgent ? <Badge label="Serbest" tone="win" size="sm" /> : null}
      </View>
      {player.teamName ? (
        <View style={styles.teamRow}>
          <TeamLogo name={player.teamName} logo={mediaUrl(player.teamLogo)} size={20} />
          <Text style={styles.teamName} numberOfLines={1} {...textScale.dense}>
            {player.teamName}
          </Text>
          {player.isOwnPlayer ? <Badge label="Kadronda" tone="brand" size="xs" /> : null}
        </View>
      ) : null}
      {action ? <View style={styles.cardFooter}>{action}</View> : null}
    </Touchable>
  );
});

function Gap() {
  return <View style={styles.gap} />;
}

/**
 * PİYASA KARTI — oyuncu kimliği, takım, değer şeridi (▲▼ fark), not, eylem.
 * Kart basılınca ayrıntı alt sayfası açılır; eylem alanı kendi dokunuşunu taşır.
 */
const ListingCard = React.memo(function ListingCard({
  listing,
  mine,
  onPress,
  action,
  footer,
}: {
  listing: Listing;
  mine?: boolean;
  onPress?: () => void;
  action?: React.ReactNode;
  /** İlanlarım: durum + kapat düğmesi. */
  footer?: React.ReactNode;
}) {
  const open = listing.status === "open";
  const loan = listing.listing_type === "loan";
  const market = listing.player.market_value != null ? Number(listing.player.market_value) : null;
  const asking = listing.asking_fee != null ? Number(listing.asking_fee) : null;
  const diff = market && asking != null && market > 0 ? Math.round(((asking - market) / market) * 100) : null;
  const age = ageOf(listing.player.birth_date);
  const facts = [listing.player.position, age ? `${age} yaş` : null].filter(Boolean).join(" · ");
  const when = ago(listing.created_at);

  return (
    <Touchable
      onPress={onPress}
      disabled={!onPress}
      feedback="card"
      accessibilityRole="button"
      accessibilityLabel={[listing.player.name, listing.type_label, listing.team.name, asking != null ? `istenen ${formatMoney(asking)}` : null].filter(Boolean).join(", ")}
      style={[styles.card, mine && styles.cardMine, !open && styles.cardClosed]}
    >
      {mine ? <View style={styles.mineStripe} /> : null}
      <View style={styles.cardTop}>
        <Avatar name={listing.player.name ?? "?"} image={mediaUrl(listing.player.image ?? null)} size={46} />
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName} numberOfLines={1} {...textScale.dense}>
            {listing.player.name ?? "Oyuncu"}
          </Text>
          {facts ? (
            <Text style={styles.cardFacts} numberOfLines={1} {...textScale.dense}>
              {facts}
            </Text>
          ) : null}
        </View>
        <Badge
          label={open ? listing.type_label : "Kapalı"}
          tone={!open ? "neutral" : loan ? "info" : "warn"}
          icon={!open ? "lock-closed" : loan ? "repeat" : "pricetag"}
          size="sm"
        />
      </View>

      <View style={styles.teamRow}>
        <TeamLogo name={listing.team.name ?? "?"} logo={mediaUrl(listing.team.logo ?? null)} size={20} />
        <Text style={styles.teamName} numberOfLines={1} {...textScale.dense}>
          {listing.team.name ?? "Takım"}
        </Text>
        {mine ? <Badge label="Senin ilanın" tone="brand" size="xs" /> : null}
        <View style={styles.flex} />
        {when ? (
          <Text style={styles.when} {...textScale.badge}>
            {when}
          </Text>
        ) : null}
      </View>

      <View style={styles.valueStrip}>
        <View style={styles.valueCell}>
          <Text style={styles.valueLabel} {...textScale.badge}>
            PİYASA DEĞERİ
          </Text>
          <Text style={styles.valueNum} numberOfLines={1} {...textScale.badge}>
            {shortFee(market) ?? "—"}
          </Text>
        </View>
        <View style={styles.valueDivider} />
        <View style={styles.valueCell}>
          <Text style={styles.valueLabel} {...textScale.badge}>
            {loan ? "KİRALAMA BEDELİ" : "İSTENEN BEDEL"}
          </Text>
          <Text style={[styles.valueNum, styles.valueAsk]} numberOfLines={1} {...textScale.badge}>
            {asking != null ? shortFee(asking) : loan ? "Bedelsiz" : "Pazarlıkla"}
          </Text>
        </View>
        {diff != null ? (
          <View style={[styles.diff, { backgroundColor: diff <= 0 ? colors.winDim : colors.lossDim }]}>
            <Text style={[styles.diffText, { color: diff <= 0 ? colors.win : colors.loss }]} {...textScale.badge}>
              {`${diff <= 0 ? "▼" : "▲"} %${Math.abs(diff)}`}
            </Text>
            <Text style={[styles.diffHint, { color: diff <= 0 ? colors.win : colors.loss }]} {...textScale.badge}>
              {diff <= 0 ? "değerin altı" : "değerin üstü"}
            </Text>
          </View>
        ) : null}
      </View>

      {listing.note ? (
        <View style={styles.note}>
          <Text style={styles.noteText} numberOfLines={2} {...textScale.long}>
            {listing.note}
          </Text>
        </View>
      ) : null}

      {action || footer ? <View style={styles.cardFooter}>{footer ?? action}</View> : null}
    </Touchable>
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

  if (query.isLoading) return <MarketSkeleton />;
  if (query.isError && !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const openCount = items.filter((item) => item.status === "open").length;

  return (
    <>
      <FlatList
        {...scrollProps}
        data={items}
        keyExtractor={(item) => item.public_id}
        refreshControl={refresh.control}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={
          <View style={styles.header}>
            <MetricGrid columns={2}>
              <MetricTile label="Yayında" value={String(openCount)} icon="radio" tone="win" />
              <MetricTile label="Kapanan" value={String(items.length - openCount)} icon="archive" />
            </MetricGrid>
            <Button label="Yeni ilan ver" icon="add" size="lg" onPress={() => setCreateOpen(true)} fullWidth />
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
          <Reveal index={index} limit={6} distance={8}>
            <ListingCard
              listing={item}
              footer={
                item.status === "open" ? (
                  <View style={styles.mineFooter}>
                    <Badge label="Yayında" tone="win" icon="radio" size="sm" />
                    <View style={styles.flex} />
                    <Button label="İlanı kapat" variant="ghost" size="sm" icon="close-circle-outline" onPress={() => setClosing(item)} />
                  </View>
                ) : (
                  <View style={styles.mineFooter}>
                    <Badge label="Kapandı" tone="neutral" icon="lock-closed" size="sm" />
                    {item.closed_at ? (
                      <Text style={styles.when} {...textScale.badge}>
                        {ago(item.closed_at)}
                      </Text>
                    ) : null}
                  </View>
                )
              }
            />
          </Reveal>
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
  // Muhasebedeki ortak kural: "15.000" on beş bin (önceden 15 okunuyordu).
  const feeNumber = fee.trim() ? parseAmount(fee) : null;
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
  loading: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, gap: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { gap: space.md, paddingVertical: space.md },
  resultText: { ...type.caption, color: colors.textTertiary },
  scopeNote: { ...type.caption, color: colors.textSecondary },
  browseAll: { paddingVertical: space.xs },
  browseAllText: { ...type.caption, color: colors.accentText },
  blocked: { ...type.caption, color: colors.textTertiary },
  gap: { height: space.md },

  /* Piyasa kartı */
  card: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  cardMine: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  cardClosed: { opacity: 0.72 },
  mineStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.brand },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  cardIdentity: { flex: 1, minWidth: 0, gap: space.xxs },
  cardName: { ...type.h3, color: colors.textPrimary },
  cardFacts: { ...type.caption, color: colors.textTertiary },
  teamRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  teamName: { ...type.labelSm, color: colors.textSecondary, flexShrink: 1 },
  when: { ...type.meta, color: colors.textTertiary },
  valueStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
  },
  valueCell: { flex: 1, minWidth: 0, gap: space.xxs },
  valueDivider: { width: hairline, alignSelf: "stretch", backgroundColor: colors.separator },
  valueLabel: { ...type.nano, color: colors.textTertiary },
  valueNum: { ...type.scoreXs, color: colors.textPrimary },
  valueAsk: { color: colors.accentText },
  diff: { alignItems: "center", paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.md },
  diffText: { ...type.numSmStrong, fontFamily: fonts.bold },
  diffHint: { ...type.nano },
  note: { borderLeftWidth: 2, borderLeftColor: colors.brandBorder, paddingLeft: space.sm },
  noteText: { ...type.bodySm, color: colors.textSecondary },
  cardFooter: { borderTopWidth: hairline, borderTopColor: colors.separator, paddingTop: space.sm, alignItems: "flex-start" },
  mineFooter: { flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "stretch" },

  sheet: { gap: space.md },
  sheetText: { ...type.body, color: colors.textSecondary },
  label: { ...type.label, color: colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  footer: { flexDirection: "row", gap: space.sm },
  error: { ...type.caption, color: colors.danger },
});
