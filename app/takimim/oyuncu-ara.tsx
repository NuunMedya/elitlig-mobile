/**
 * FUTBOLCU VERİTABANI / OYUNCU ARA — herkese açık arama, başkana teklif.
 * `/takimim/oyuncu-ara?q=&mevki=&serbest=1&siralama=goals:DESC`
 *
 * Web: features/transfers/PlayerDatabase.js (üye görünümü "Futbolcu
 * Veritabanı", başkan görünümü "Transfer Borsası"). Tek uç:
 * GET /api/player-database — liste üyenin kayıtlı ili ile sınırlıdır
 * (`scope.locked`); bu yüzden il seçici yok, il adı başlıkta yazar.
 *
 * KİM NE GÖRÜR:
 *   · Takım başkanı: her satırda belirgin "Teklif ver" (ya da "Aktif teklif");
 *     serbest ve hesabı olan oyuncuda "Davet et". Kendi oyuncusunda düğme yok.
 *     Karar sunucunun `canReceiveOffer / activeOfferPublicId / isOwnPlayer`
 *     alanlarından gelir.
 *   · Oyuncu profili bağlı OLMAYAN üye: "Bu oyuncu benim" sahiplenme talebi
 *     (POST /api/users/request-player-claim). En az 2 harf yazınca il dışı
 *     sahiplenilebilir kayıtlar da (GET /claimable) listenin sonuna eklenir.
 *   · Diğer üyeler: salt arama ve profil.
 *
 * SÜZGEÇLER: arama (400 ms gecikmeli), sıralama çipleri, mevki çipleri
 * (sunucunun il özetindeki mevki sayımlarıyla), "Serbest" ve alt sayfada
 * gelişmiş aralıklar (yaş, en az maç, en az puan). Seçim URL'de taşınır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OfferCta } from "@/components/club/team/OfferCta";
import { useTeamAccess } from "@/components/club/team/useTeamAccess";
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
  MetricGrid,
  MetricTile,
  ScreenHeader,
  SkeletonListRow,
  SkeletonListFooter,
  Touchable,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import {
  DATABASE_ERRORS,
  DATABASE_SORTS,
  requestPlayerClaim,
  searchClaimable,
  searchPlayerDatabase,
  type DatabasePlayer,
  type DatabaseQuery,
  type DatabaseSort,
} from "@/lib/api/club/playerDatabase";
import { formatEtlShort } from "@/lib/api/marketValue";
import { formatDecimal, formatNumber, mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

interface Advanced {
  minAge: string;
  maxAge: string;
  minMatches: string;
  minAverageRating: string;
}
const EMPTY_ADVANCED: Advanced = { minAge: "", maxAge: "", minMatches: "", minAverageRating: "" };
const ADVANCED_FIELDS: { key: keyof Advanced; label: string; placeholder: string }[] = [
  { key: "minAge", label: "En küçük yaş", placeholder: "16" },
  { key: "maxAge", label: "En büyük yaş", placeholder: "45" },
  { key: "minMatches", label: "En az maç", placeholder: "5" },
  { key: "minAverageRating", label: "En az puan", placeholder: "6" },
];
const toNumber = (value: string) => (value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined);

export default function PlayerSearchScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const access = useTeamAccess();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ q?: string; mevki?: string; serbest?: string; siralama?: string }>();

  const [draft, setDraft] = useState(first(params.q));
  const [search, setSearch] = useState(first(params.q));
  const [position, setPosition] = useState(first(params.mevki));
  const [freeOnly, setFreeOnly] = useState(first(params.serbest) === "1");
  const initialSort = DATABASE_SORTS.find((item) => item.key === first(params.siralama))?.key ?? "averageRating:DESC";
  const [sort, setSort] = useState<DatabaseSort>(initialSort);
  const [advanced, setAdvanced] = useState<Advanced>(EMPTY_ADVANCED);
  const [advancedDraft, setAdvancedDraft] = useState<Advanced>(EMPTY_ADVANCED);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [claimed, setClaimed] = useState<Set<number>>(() => new Set());

  // Arama 400 ms gecikmeyle uygulanır (web ile aynı); her tuşta istek atılmaz.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(draft.trim()), 400);
    return () => clearTimeout(timer);
  }, [draft]);

  // Seçim URL'de taşınır: geri tuşu ve paylaşılan bağlantı aynı listeyi açar.
  // İlk çizimde yazılmaz: değerler zaten URL'den geldi ve derin bağlantıyla
  // soğuk açılışta gezgin henüz hazır olmadığı için setParams hata veriyordu.
  const paramsReady = useRef(false);
  useEffect(() => {
    if (!paramsReady.current) {
      paramsReady.current = true;
      return;
    }
    router.setParams({ q: search || undefined, mevki: position || undefined, serbest: freeOnly ? "1" : undefined, siralama: sort });
  }, [freeOnly, position, router, search, sort]);

  const filter: DatabaseQuery = useMemo(
    () => ({
      search,
      position: position || undefined,
      isFreeAgent: freeOnly,
      sort,
      minAge: toNumber(advanced.minAge),
      maxAge: toNumber(advanced.maxAge),
      minMatches: toNumber(advanced.minMatches),
      minAverageRating: toNumber(advanced.minAverageRating),
    }),
    [advanced, freeOnly, position, search, sort],
  );

  const query = useInfiniteQuery({
    queryKey: ["club", "player-database", filter],
    queryFn: ({ pageParam }) => searchPlayerDatabase({ ...filter, page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const firstPage = query.data?.pages[0];
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const positions = useMemo(
    () => (firstPage?.summary?.positions ?? []).filter((row) => row.position && row.position !== "Belirtilmemiş"),
    [firstPage],
  );

  /* Sahiplenme: yalnız oyuncu profili olmayan, takım yönetmeyen üye. */
  const viewerCanClaim = Boolean(auth.user) && !auth.user?.player_id && !access.canManage;
  const claimSearch = useQuery({
    queryKey: ["club", "player-claimable", search],
    queryFn: () => searchClaimable(search),
    enabled: viewerCanClaim && search.length >= 2,
    staleTime: 60_000,
    retry: false,
  });
  const crossCity = useMemo(
    () => (claimSearch.data?.items ?? []).filter((player) => !items.some((item) => item.id === player.id)),
    [claimSearch.data, items],
  );

  const claim = useMutation({
    mutationFn: (player: DatabasePlayer) => requestPlayerClaim(player.id),
    onSuccess: (_data, player) => {
      setClaimed((current) => new Set(current).add(player.id));
      toast.show({ message: `${player.displayName} için sahiplenme talebin yönetici onayına gönderildi.`, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["panel", "me"] });
    },
    onError: (error) =>
      toast.show({ message: error instanceof ApiError ? error.userMessage : "Talep gönderilemedi.", tone: "danger" }),
  });

  const openPlayer = useCallback((id: number) => router.push(`/oyuncu/${id}`), [router]);

  const activeFilterCount =
    (search ? 1 : 0) + (position ? 1 : 0) + (freeOnly ? 1 : 0) + Object.values(advanced).filter((v) => v.trim()).length;
  const reset = () => {
    setDraft("");
    setSearch("");
    setPosition("");
    setFreeOnly(false);
    setAdvanced(EMPTY_ADVANCED);
    setAdvancedDraft(EMPTY_ADVANCED);
  };

  if (!auth.user) return <Redirect href="/giris" />;

  const cityName = firstPage?.scope?.cityName ?? auth.user.city ?? null;
  const errorCode = query.error instanceof ApiError ? query.error.code : undefined;
  const data: (DatabasePlayer & { crossCity?: boolean })[] = [...items, ...crossCity.map((p) => ({ ...p, crossCity: true }))];

  const header = (
    <View style={styles.header}>
      {firstPage?.summary ? (
        <MetricGrid columns={3}>
          <MetricTile label="Kayıtlı" value={formatNumber(firstPage.summary.totalPlayers)} icon="people" />
          <MetricTile
            label="Serbest"
            value={formatNumber(firstPage.summary.freeAgents)}
            icon="lock-open"
            tone="win"
            onPress={() => setFreeOnly((value) => !value)}
          />
          <MetricTile label="Takım" value={formatNumber(firstPage.summary.teams)} icon="shield" />
        </MetricGrid>
      ) : null}

      <Input
        variant="search"
        leadingIcon="search"
        value={draft}
        onChangeText={setDraft}
        placeholder={cityName ? `${cityName} ilindeki oyuncularda ara` : "Oyuncu adıyla ara"}
        autoCorrect={false}
        returnKeyType="search"
      />

      <ChipGroup contentPadding={0}>
        <Chip
          size="sm"
          icon="options-outline"
          label="Gelişmiş"
          count={Object.values(advanced).filter((v) => v.trim()).length || undefined}
          selected={Object.values(advanced).some((v) => v.trim())}
          onPress={() => {
            setAdvancedDraft(advanced);
            setAdvancedOpen(true);
          }}
        />
        <Chip size="sm" icon="lock-open-outline" label="Serbest" selected={freeOnly} onPress={() => setFreeOnly((v) => !v)} />
        {DATABASE_SORTS.map((item) => (
          <Chip key={item.key} size="sm" label={item.label} selected={sort === item.key} onPress={() => setSort(item.key)} />
        ))}
      </ChipGroup>

      {positions.length ? (
        <ChipGroup contentPadding={0}>
          <Chip size="sm" label="Tüm mevkiler" selected={!position} onPress={() => setPosition("")} />
          {positions.map((row) => (
            <Chip
              key={row.position}
              size="sm"
              label={row.position}
              count={row.total}
              selected={position === row.position}
              onPress={() => setPosition(position === row.position ? "" : row.position)}
            />
          ))}
        </ChipGroup>
      ) : null}

      <View style={styles.resultBar}>
        <Text style={styles.resultText} {...textScale.dense}>
          {firstPage ? `${formatNumber(firstPage.totalItems)} oyuncu${cityName ? ` · ${cityName}` : ""}` : " "}
        </Text>
        {activeFilterCount ? (
          <Touchable onPress={reset} hitSlop={8} accessibilityRole="button">
            <Text style={styles.reset} {...textScale.dense}>
              Süzgeçleri temizle
            </Text>
          </Touchable>
        ) : null}
      </View>
      {access.canManage ? (
        <View style={styles.tip}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.tipText} {...textScale.long}>
            Takımı olan oyuncuya teklif ver; serbest ve hesabı olan oyuncuyu doğrudan kadroya davet edebilirsin.
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={access.canManage ? "Oyuncu ara" : "Futbolcu veritabanı"}
        subtitle={cityName ? `${cityName} futbolcu havuzu` : undefined}
        back
        scrollY={scrollY}
        actions={
          access.canManage
            ? [{ icon: "paper-plane-outline", onPress: () => router.push("/takimim/transfer" as Href), accessibilityLabel: "Transfer yönetimi" }]
            : undefined
        }
      />
      {errorCode === "MEMBER_CITY_REQUIRED" ? (
        <EmptyState
          icon="location-outline"
          title="İl bilgin eksik"
          body={DATABASE_ERRORS.MEMBER_CITY_REQUIRED}
          action={{ label: "Hesabımı düzenle", onPress: () => router.push("/hesabim") }}
        />
      ) : (
        <FlatList
          {...scrollProps}
          data={query.isLoading ? [] : data}
          keyExtractor={(item) => `${item.crossCity ? "c" : "p"}-${item.id}`}
          refreshControl={refresh.control}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          ListEmptyComponent={
            query.isLoading ? (
              <SkeletonListRow count={8} />
            ) : query.isError ? (
              <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
            ) : (
              <EmptyState
                variant="inline"
                icon="search-outline"
                title="Eşleşen oyuncu yok"
                body="Süzgeçleri gevşet ya da farklı bir ad dene."
                action={activeFilterCount ? { label: "Süzgeçleri temizle", onPress: reset } : undefined}
              />
            )
          }
          ListFooterComponent={query.isFetchingNextPage ? <SkeletonListFooter /> : null}
          ItemSeparatorComponent={Separator}
          renderItem={({ item }) => (
            <PlayerCard
              player={item}
              crossCity={Boolean(item.crossCity)}
              canManage={access.canManage}
              canClaim={viewerCanClaim}
              claimPending={claimed.has(item.id) || Boolean(item.hasPendingClaim)}
              claimBusy={claim.isPending && claim.variables?.id === item.id}
              onClaim={() => claim.mutate(item)}
              onOpen={openPlayer}
            />
          )}
        />
      )}

      <BottomSheet
        visible={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        title="Gelişmiş süzgeç"
        snap="content"
        footer={
          <View style={styles.sheetFooter}>
            <Button
              label="Temizle"
              variant="secondary"
              onPress={() => {
                setAdvancedDraft(EMPTY_ADVANCED);
                setAdvanced(EMPTY_ADVANCED);
                setAdvancedOpen(false);
              }}
              style={styles.flex}
            />
            <Button
              label="Uygula"
              onPress={() => {
                setAdvanced(advancedDraft);
                setAdvancedOpen(false);
              }}
              style={styles.flex}
            />
          </View>
        }
      >
        <View style={styles.sheetGrid}>
          {ADVANCED_FIELDS.map((field) => (
            <Input
              key={field.key}
              label={field.label}
              size="sm"
              value={advancedDraft[field.key]}
              onChangeText={(value) => setAdvancedDraft((current) => ({ ...current, [field.key]: value.replace(/[^\d.,]/g, "").replace(",", ".") }))}
              placeholder={field.placeholder}
              keyboardType="decimal-pad"
              containerStyle={styles.sheetField}
            />
          ))}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

/** Bir oyuncu kartı: kimlik + dört sayı + rol kararlı eylem. */
const PlayerCard = React.memo(function PlayerCard({
  player,
  crossCity,
  canManage,
  canClaim,
  claimPending,
  claimBusy,
  onClaim,
  onOpen,
}: {
  player: DatabasePlayer;
  crossCity: boolean;
  canManage: boolean;
  canClaim: boolean;
  claimPending: boolean;
  claimBusy: boolean;
  onClaim: () => void;
  onOpen: (id: number) => void;
}) {
  const facts = [
    player.position,
    player.teamName ?? "Serbest",
    player.age != null ? `${player.age} yaş` : null,
    crossCity ? player.city : null,
  ].filter(Boolean);
  const value = player.marketValue != null && num(player.marketValue) > 0 ? formatEtlShort(num(player.marketValue)) : null;

  let action: React.ReactNode = null;
  if (canManage) {
    action = (
      <OfferCta
        layout="bar"
        playerId={player.id}
        playerName={player.displayName}
        playerTeamId={player.teamId}
        activeOfferId={player.activeOfferPublicId ?? null}
        allowInvite={player.isFreeAgent && Boolean(player.isClaimed)}
      />
    );
  } else if (player.isMine) {
    action = <Badge label="Profilin" tone="win" icon="checkmark-circle" size="sm" />;
  } else if (claimPending) {
    action = <Badge label="Onay bekliyor" tone="warn" icon="hourglass-outline" size="sm" />;
  } else if (canClaim && (player.canClaim ?? !player.isClaimed)) {
    action = <Button label="Bu oyuncu benim" icon="hand-left-outline" size="sm" variant="secondary" loading={claimBusy} onPress={onClaim} />;
  }

  return (
    <View style={styles.card}>
      <Touchable
        onPress={() => onOpen(player.id)}
        feedback="card"
        accessibilityRole="button"
        accessibilityLabel={`${player.displayName}, ${facts.join(", ")}`}
        style={styles.cardTop}
      >
        <Avatar name={player.displayName} image={mediaUrl(player.profileImage)} size={layout.crestXl} />
        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
              {player.displayName}
            </Text>
            {player.isFreeAgent ? <Badge label="SERBEST" tone="win" size="xs" /> : null}
            {player.isOwnPlayer ? <Badge label="KADRONDA" tone="brand" size="xs" /> : null}
          </View>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {facts.join(" · ")}
          </Text>
          <View style={styles.stats}>
            <Stat label="Maç" value={formatNumber(num(player.matches))} />
            <Stat label="Gol" value={formatNumber(num(player.goals))} />
            <Stat label="Asist" value={formatNumber(num(player.assists))} />
            <Stat label="Puan" value={num(player.averageRating) > 0 ? formatDecimal(num(player.averageRating), 1) : "—"} />
            {value ? <Stat label="Değer" value={value} /> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </Touchable>
      {action ? <View style={styles.cardAction}>{action}</View> : null}
    </View>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} {...textScale.badge}>
        {value}
      </Text>
      <Text style={styles.statLabel} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { gap: space.md, paddingTop: space.md, paddingBottom: space.md },
  resultBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultText: { ...type.caption, color: colors.textTertiary },
  reset: { ...type.caption, color: colors.brandAccent },
  tip: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
  tipText: { ...type.caption, color: colors.textTertiary, flex: 1 },
  separator: { height: space.sm },
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  cardBody: { flex: 1, minWidth: 0, gap: space.xxs },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  name: { ...type.h4, color: colors.textPrimary, flexShrink: 1 },
  meta: { ...type.caption, color: colors.textTertiary },
  stats: { flexDirection: "row", gap: space.lg, marginTop: space.xs },
  stat: { alignItems: "flex-start" },
  statValue: { ...type.numSmStrong, color: colors.textPrimary },
  statLabel: { ...type.nano, color: colors.textTertiary },
  cardAction: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  sheetGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.md, paddingBottom: space.md },
  sheetField: { width: "47%" },
  sheetFooter: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
});
