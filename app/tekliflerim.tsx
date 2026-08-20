/**
 * TRANSFER TEKLİFLERİM — oyuncuya gelen tekliflerin gelen kutusu.
 *
 * NE DEĞİŞTİ: eski ekran her teklifi bir kart olarak çiziyor, Kabul/Reddet
 * düğmelerini ve ret gerekçesi penceresini satır içinde taşıyordu. Bir kart
 * ~140px yer kaplıyordu; beş teklifte ekran doluyordu ve "hangi teklif ne
 * durumda" sorusu ancak kaydırarak yanıtlanıyordu. Artık liste YOĞUN
 * (`ListRow`, 64px) ve karar verme işi teklif belgesinin açıldığı
 * `/teklif/[id]` ekranına taşındı (şartname §5, satır 11).
 *
 * NEDEN DURUM ÇİPLERİ: teklif kaydı hiç silinmez; kabul/ret/geri çekilme
 * sonrası da listede kalır. Birkaç sezon sonra gelen kutusunun büyük kısmı
 * kapanmış tekliflerden oluşur. Çipler hem süzgeç hem sayaçtır (rozetli sayı),
 * böylece "cevap bekleyen kaç teklifim var" tek bakışta okunur. Seçim URL
 * parametresiyle taşınır (`?durum=`) — bildirimden gelen derin bağlantı da
 * doğrudan doğru süzgeçle açılabilsin.
 *
 * SUNUCU SÖZLEŞMESİ (korunuyor): `GET /api/transfer-offers/inbox`, kayıt
 * anahtarı sayısal id değil `public_id`'dir; ekranlar arası gezinme de bu
 * anahtarla yapılır (bildirimlerin `entity_public_id` alanıyla aynı değer).
 */

import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SkeletonListRow,
  TeamLogo,
  useHeaderScroll,
  useRefresh,
  type Tone,
} from "@/components/ui";
import { getOfferInbox, type TransferOffer } from "@/lib/api/panel";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space, textScale, type } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/** Sunucudaki OFFER_STATUSES (constants/transfer.js) → etiket ve ton. */
const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Taslak", tone: "neutral" },
  SENT: { label: "Bekliyor", tone: "warn" },
  REVISION_REQUESTED: { label: "Revizyon istendi", tone: "info" },
  ACCEPTED: { label: "Kabul edildi", tone: "win" },
  REJECTED: { label: "Reddedildi", tone: "danger" },
  WITHDRAWN: { label: "Geri çekildi", tone: "neutral" },
  EXPIRED: { label: "Süresi doldu", tone: "neutral" },
  CANCELLED: { label: "İptal edildi", tone: "neutral" },
};

const statusMeta = (status: string): { label: string; tone: Tone } =>
  STATUS_META[status] ?? { label: status, tone: "neutral" };

type OfferFilter = "tumu" | "bekleyen" | "revizyon" | "kabul" | "ret" | "kapanan";

interface FilterDef {
  key: OfferFilter;
  label: string;
  /** Hangi sunucu durumları bu çipe düşer. */
  match: (status: string) => boolean;
}

const FILTERS: FilterDef[] = [
  { key: "tumu", label: "Tümü", match: () => true },
  { key: "bekleyen", label: "Bekleyen", match: (s) => s === "SENT" || s === "DRAFT" },
  { key: "revizyon", label: "Revizyon", match: (s) => s === "REVISION_REQUESTED" },
  { key: "kabul", label: "Kabul", match: (s) => s === "ACCEPTED" },
  { key: "ret", label: "Ret", match: (s) => s === "REJECTED" },
  {
    key: "kapanan",
    label: "Kapanan",
    match: (s) => s === "WITHDRAWN" || s === "EXPIRED" || s === "CANCELLED",
  },
];

const FILTER_KEYS = FILTERS.map((item) => item.key);

/** Sorgu parametresi tek değer ya da dizi olarak gelebilir. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilter(raw: unknown): OfferFilter {
  const key = String(raw ?? "").trim().toLowerCase();
  return (FILTER_KEYS as string[]).includes(key) ? (key as OfferFilter) : "tumu";
}

/** Son gün yaklaştı mı? (24 saat içinde kapanan teklif ayrı vurgulanır.) */
function isUrgent(offer: TransferOffer): boolean {
  if (offer.status !== "SENT" || !offer.expires_at) return false;
  const left = new Date(offer.expires_at).getTime() - Date.now();
  return left > 0 && left <= 24 * 60 * 60 * 1000;
}

/** Grup içi konum — ListRow köşe ve ayracını buradan alır. */
function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/* ================================= EKRAN ================================== */

export default function OffersScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ durum?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const filter = resolveFilter(firstParam(params.durum));

  const query = useQuery({
    queryKey: ["panel", "offers"],
    queryFn: () => getOfferInbox(),
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  /** Her çipin sayacı — tek geçişte hesaplanır. */
  const counts = useMemo(() => {
    const result: Record<OfferFilter, number> = {
      tumu: items.length,
      bekleyen: 0,
      revizyon: 0,
      kabul: 0,
      ret: 0,
      kapanan: 0,
    };
    for (const offer of items) {
      for (const def of FILTERS) {
        if (def.key !== "tumu" && def.match(offer.status)) result[def.key] += 1;
      }
    }
    return result;
  }, [items]);

  const visible = useMemo(() => {
    const def = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
    return items.filter((offer) => def.match(offer.status));
  }, [filter, items]);

  /** Cevap bekleyen teklif sayısı — başlık altındaki özet cümlesi. */
  const waiting = counts.bekleyen + counts.revizyon;

  const selectFilter = useCallback(
    (next: OfferFilter) => {
      scrollY.setValue(0);
      router.setParams({ durum: next });
    },
    [router, scrollY],
  );

  const openOffer = useCallback(
    (publicId: string) => router.push(`/teklif/${publicId}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: TransferOffer; index: number }) => (
      <OfferRow
        offer={item}
        position={rowPosition(index, visible.length)}
        onPress={openOffer}
      />
    ),
    [openOffer, visible.length],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <ChipGroup style={styles.chips}>
          {FILTERS.map((def) => (
            <FilterChip
              key={def.key}
              def={def}
              count={counts[def.key]}
              selected={def.key === filter}
              onSelect={selectFilter}
            />
          ))}
        </ChipGroup>

        {waiting > 0 ? (
          <Text style={styles.summary} {...textScale.long}>
            {waiting} teklif senden cevap bekliyor. Teklife dokunup belgeyi
            aç: kabul, ret ve revizyon istekleri orada.
          </Text>
        ) : null}

        {/* Liste dolu ama sorgu hata verdiyse veri silinmez, hata şerit olur. */}
        {query.isError && items.length > 0 ? (
          <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
        ) : null}
      </View>
    ),
    [counts, filter, items.length, query.error, query.isError, query.refetch, selectFilter, waiting],
  );

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Transfer Tekliflerim"
        subtitle="Takımlardan gelen teklifler"
        back
        scrollY={scrollY}
      />

      {query.isLoading ? (
        <View style={styles.loading}>
          <SkeletonListRow count={6} />
        </View>
      ) : query.isError && items.length === 0 ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="swap-horizontal-outline"
          title="Teklif yok"
          body="Bir takım sana transfer teklifi gönderdiğinde burada görünür."
        />
      ) : (
        <FlatList
          {...scrollProps}
          data={visible}
          keyExtractor={(item) => item.public_id}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="funnel-outline"
              title="Bu süzgeçte teklif yok"
              body="Başka bir durum çipini seçebilirsin."
              variant="inline"
              compact
            />
          }
          contentContainerStyle={styles.content}
          refreshControl={refresh.control}
          initialNumToRender={12}
        />
      )}
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================= */

/** Süzgeç çipi — memo'lu; `onSelect` sabit olduğu için satır yeniden çizilmez. */
const FilterChip = React.memo(function FilterChip({
  def,
  count,
  selected,
  onSelect,
}: {
  def: FilterDef;
  count: number;
  selected: boolean;
  onSelect: (key: OfferFilter) => void;
}) {
  const handlePress = useCallback(() => onSelect(def.key), [def.key, onSelect]);
  return (
    <Chip
      label={def.label}
      count={count}
      selected={selected}
      onPress={handlePress}
      size="sm"
    />
  );
});

/**
 * Tek teklif satırı.
 *
 * Vurgulu (`highlighted`) hâl iki durumda açılır: teklif hiç görüntülenmemişse
 * (sunucu `viewed_at` yazana kadar) ya da oyuncunun karar vermesi bekleniyorsa.
 * Böylece "yeni/aksiyon" ile "arşiv" satırları aynı listede karışmaz.
 */
const OfferRow = React.memo(function OfferRow({
  offer,
  position,
  onPress,
}: {
  offer: TransferOffer;
  position: "single" | "first" | "middle" | "last";
  onPress: (publicId: string) => void;
}) {
  const handlePress = useCallback(() => onPress(offer.public_id), [offer.public_id, onPress]);

  const meta = statusMeta(offer.status);
  const urgent = isUrgent(offer);
  const needsAction = Boolean(offer.actions?.accept || offer.actions?.reject);

  const subtitle = [
    offer.sent_at ? `Gönderildi ${formatDateShort(offer.sent_at)}` : null,
    offer.expires_at ? `Son gün ${formatDateShort(offer.expires_at)}` : null,
    offer.awaiting_admin_approval ? "Yönetici onayı bekliyor" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const leading = useMemo(
    () => (
      <TeamLogo
        name={offer.team?.team_name ?? "?"}
        logo={mediaUrl(offer.team?.logo ?? null)}
        size={layout.crestLg}
      />
    ),
    [offer.team?.logo, offer.team?.team_name],
  );

  const badge = (
    <Badge
      label={urgent ? "SON GÜN" : meta.label}
      tone={urgent ? "live" : meta.tone}
      size="xs"
    />
  );

  return (
    <ListRow
      leading={leading}
      title={offer.team?.team_name ?? "Takım"}
      subtitle={subtitle || undefined}
      badge={badge}
      highlighted={needsAction || !offer.viewed_at}
      position={position}
      onPress={handlePress}
    />
  );
});

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
  },
  headerBlock: {
    gap: space.sm,
    paddingBottom: space.md,
  },
  /**
   * Çip şeridi ekran kenarına kadar kayabilsin: olumsuz kenar boşluğu listenin
   * iç boşluğunu iptal eder, çiplerin kendi iç boşluğunu ChipGroup verir.
   */
  chips: {
    marginHorizontal: -layout.screenPadding,
  },
  summary: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
    lineHeight: 16,
  },
});
