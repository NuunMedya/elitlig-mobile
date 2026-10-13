/**
 * BİLDİRİMLER BÖLMESİ — Gelen kutusunun "Bildirimler" sekmesi.
 *
 * NE: `GET /api/panel-notifications` üyenin tüm sistem bildirimlerini
 * döndürür (transfer, sözleşme, ceza, mesaj, davet, maç talebi, haftanın
 * enleri…). Push bildirimi kaçırılmış olsa bile bu liste her şeyi gösterir;
 * "telefonuma düşmedi" ile "hiç olmadı" burada ayrılır.
 *
 * NEREDE: yalnız app/gelen-kutusu.tsx (`?tab=bildirimler`). Eski
 * /bildirimler rotası buraya yönlendirir (lib/notifications.ts'teki
 * `/bildirimler` hedefleri bu sayede çalışmaya devam eder). Bölme kendi
 * başlığını çizmez; ekran başlığı (Bildirimler | Mesajlar sekmeleri, "tümünü
 * okundu" ve ayar eylemleri) gelen kutusundadır. Bölme süzgeç şeridini ve
 * listeyi çizer.
 *
 * TARANABİLİRLİK: liste DAİMA zaman sırasındadır ve gün başlıklarıyla
 * ("Bugün", "Dün", "12 Ağustos Salı") bölünür; her gün tek bir satır
 * grubudur. Okunmamış satır sol kenarda mor ray, kalın başlık ve nokta taşır —
 * "yeni" bilgisini renk + ağırlık + işaret birlikte söyler. Süzgeç şeridi:
 * Tümü · Okunmamış (sayı) · listede gerçekten bulunan kategoriler. Seçim
 * ROTADA taşınır (`?filtre=`; eski `/bildirimler?tab=` değeri yönlendirmede
 * buraya çevrilir): derin bağlantı, geri dönüş ve tazeleme korur.
 *
 * NEDEN İKONLAR lib/notifications.ts İLE EŞLEŞİR: bildirime dokunulunca
 * gidilecek ekranı `routeFromNotif` çözer; ikon ve ton da AYNI sırayla
 * (önce entity_type, sonra type öneki) çözülür. Böylece bir bildirimin
 * simgesi ile açtığı ekran hiçbir zaman ayrışmaz.
 *
 * NEDEN İYİMSER OKUNDU: satıra dokunulduğu an rozet sönmeli; istek arkada
 * gider. "Tümünü okundu" da aynı önbelleği yamar (`useMarkAllNotificationsRead`
 * — başlık eylemi gelen kutusunda olduğu için kanca dışa aktarılır).
 *
 * NEDEN SAYFALAMA: uç sayfa başına 50 kayıt veriyor ve `totalItems` ile
 * toplamı söylüyor; "daha fazlasını yükle" aynı uçla listeyi uzatır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import {
  SectionList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type SectionListRenderItemInfo,
} from "react-native";

import {
  Button,
  EmptyState,
  ErrorState,
  Chip,
  ChipGroup,
  SectionHeader,
  SkeletonListRow,
  Touchable,
  errorMessage,
  toneColors,
  useRefresh,
  useToast,
  type Tone,
} from "@/components/ui";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import {
  getPanelNotifications,
  markAllNotifsRead,
  markNotifRead,
  type PanelNotification,
  type PanelNotificationsResponse,
} from "@/lib/api/panel";
import { formatDateShort, formatDayHeading } from "@/lib/format";
import { routeFromNotif } from "@/lib/notifications";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ═══════════════════════════ SABİTLER / YARDIMCILAR ═══════════════════════ */

/** Ekran açıkken yoklama — bildirimler için soket yok (sunucu sözleşmesi). */
const POLL_MS = 30_000;

/** Sorgu anahtarı: başka ekran bu listeyi okumuyor, tek sahibi burası. */
const NOTIF_KEY = ["panel", "notifications"] as const;

/** Bildirim kategorisi — süzgeç şeridinin çipleri. */
type NotifCategory = "mac" | "takim" | "disiplin" | "mesaj" | "diger";

export type NotifFilter = "tumu" | "okunmamis" | NotifCategory;

const CATEGORY_ORDER: { key: NotifCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "mac", label: "Maç", icon: "football-outline" },
  { key: "takim", label: "Takım ve transfer", icon: "people-outline" },
  { key: "disiplin", label: "Disiplin", icon: "shield-outline" },
  { key: "mesaj", label: "Mesaj", icon: "chatbubble-ellipses-outline" },
  { key: "diger", label: "Diğer", icon: "ellipsis-horizontal" },
];

interface NotifLook {
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  category: NotifCategory;
}

/** Bilinmeyen tür: nötr zil. Ekran asla boş bir kutu çizmez. */
const DEFAULT_LOOK: NotifLook = { icon: "notifications", tone: "neutral", category: "diger" };

/**
 * entity_type → görünüm. lib/notifications.ts'teki `targetFromEntity` ile aynı
 * anahtarlar; entity daha dar bir sözleşme olduğu için önce o bakılır.
 */
const ENTITY_LOOK: Record<string, NotifLook> = {
  TRANSFER_OFFER: { icon: "swap-horizontal", tone: "brand", category: "takim" },
  CONTRACT: { icon: "document-text", tone: "info", category: "takim" },
  PENALTY: { icon: "shield", tone: "danger", category: "disiplin" },
  PANEL_MESSAGE: { icon: "chatbubble-ellipses", tone: "info", category: "mesaj" },
  MATCH_REQUEST: { icon: "calendar", tone: "warn", category: "mac" },
  TEAM_JOIN_REQUEST: { icon: "people", tone: "brand", category: "takim" },
};

/**
 * type öneki → görünüm. SIRA ÖNEMLİ, ilk eşleşen kazanır — tıpkı
 * lib/notifications.ts'teki TYPE_PREFIX_TARGETS gibi. Maç kaynaklı türler
 * canlı tonunu alır (gol, başlangıç, devre, sonuç); genel "MATCH_" en sonda
 * durur ki MATCH_REQUEST onun altında kalmasın.
 */
const TYPE_PREFIX_LOOK: ReadonlyArray<readonly [string, NotifLook]> = [
  ["MATCH_GOAL", { icon: "football", tone: "live", category: "mac" }],
  ["MATCH_START", { icon: "play-circle", tone: "live", category: "mac" }],
  ["MATCH_HALFTIME", { icon: "pause-circle", tone: "live", category: "mac" }],
  ["MATCH_RESULT", { icon: "flag", tone: "live", category: "mac" }],
  ["MATCH_FIXTURE", { icon: "calendar-number", tone: "live", category: "mac" }],
  ["MATCH_REMINDER", { icon: "alarm", tone: "live", category: "mac" }],
  ["TRANSFER_", { icon: "swap-horizontal", tone: "brand", category: "takim" }],
  ["OFFER_", { icon: "swap-horizontal", tone: "brand", category: "takim" }],
  ["CONTRACT_", { icon: "document-text", tone: "info", category: "takim" }],
  ["PENALTY_", { icon: "shield", tone: "danger", category: "disiplin" }],
  ["PANEL_MESSAGE", { icon: "chatbubble-ellipses", tone: "info", category: "mesaj" }],
  ["TEAM_INVITE", { icon: "people", tone: "brand", category: "takim" }],
  ["TEAM_APPLICATION", { icon: "people", tone: "brand", category: "takim" }],
  ["MATCH_REQUEST", { icon: "calendar", tone: "warn", category: "mac" }],
  ["WEEKLY_AWARD", { icon: "trophy", tone: "warn", category: "diger" }],
  ["MEMBERSHIP_", { icon: "card", tone: "neutral", category: "diger" }],
  ["ACCOUNT_REQUEST_", { icon: "person-circle", tone: "neutral", category: "diger" }],
  ["TEAM_TRANSFER", { icon: "swap-horizontal", tone: "brand", category: "takim" }],
  ["PASSWORD_RESET", { icon: "key", tone: "neutral", category: "diger" }],
  ["MATCH_", { icon: "football", tone: "live", category: "mac" }],
  ["NEWS", { icon: "newspaper", tone: "neutral", category: "diger" }],
] as const;

/** Bildirimin ikonu ve tonu — çözümleme sırası routeFromNotif ile aynıdır. */
function notifLook(notif: PanelNotification): NotifLook {
  const entity = String(notif.entity_type ?? "").trim().toUpperCase();
  const byEntity = ENTITY_LOOK[entity];
  if (byEntity) return byEntity;

  const kind = String(notif.type ?? "").trim().toUpperCase();
  const hit = TYPE_PREFIX_LOOK.find(([prefix]) => kind.startsWith(prefix));
  return hit ? hit[1] : DEFAULT_LOOK;
}

export function normalizeNotifFilter(value: string | undefined): NotifFilter {
  if (value === "okunmamis") return "okunmamis";
  if (CATEGORY_ORDER.some((item) => item.key === value)) return value as NotifCategory;
  // "kronolojik" (eski değer) ve bilinmeyen her şey: Tümü.
  return "tumu";
}

/** "Az önce · 12 dk · 5 sa · Dün · Sal · 14 Ağu" */
function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Az önce";
  if (minutes < 60) return `${minutes} dk önce`;

  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

  if (days <= 0) return `${Math.floor(minutes / 60)} saat önce`;
  if (days === 1) return "Dün";
  if (days < 7) return date.toLocaleDateString("tr-TR", { weekday: "short" });
  return formatDateShort(iso);
}

/** Gün ayracı anahtarı (yerel saat dilimi). */
function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "bilinmeyen";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

const newestFirst = (a: PanelNotification, b: PanelNotification) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

interface NotifSection {
  key: string;
  title: string;
  data: PanelNotification[];
}

const keyExtractor = (item: PanelNotification) => String(item.id);

type NotifPages = InfiniteData<PanelNotificationsResponse, number>;

/* ═══════════════════════════ ÖNBELLEK YAMASI ══════════════════════════════ */

/** Önbellekteki bütün sayfaları tek geçişte günceller. */
function usePatchNotifCache() {
  const queryClient = useQueryClient();
  return useCallback(
    (updater: (item: PanelNotification) => PanelNotification) => {
      queryClient.setQueryData<NotifPages>(NOTIF_KEY, (previous) =>
        previous
          ? {
              ...previous,
              pages: previous.pages.map((page) => ({ ...page, items: page.items.map(updater) })),
            }
          : previous,
      );
    },
    [queryClient],
  );
}

/**
 * "Tümünü okundu" — gelen kutusunun başlık eylemi. Liste ve sekme rozeti aynı
 * anda söner (iyimser); hata olursa liste sunucudan tazelenir.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const patchCache = usePatchNotifCache();

  const { mutate, isPending } = useMutation({
    mutationFn: markAllNotifsRead,
    onMutate: () => {
      const now = new Date().toISOString();
      patchCache((item) => (item.is_read ? item : { ...item, is_read: true, read_at: now }));
      queryClient.setQueryData(queryKeys.unreadNotifCount(), { count: 0 });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifCount() });
      toast.show({ message: "Tüm bildirimler okundu işaretlendi.", tone: "success" });
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: NOTIF_KEY });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifCount() });
      toast.show({ message: errorMessage(error), tone: "danger" });
    },
  });

  return { markAll: useCallback(() => mutate(), [mutate]), pending: isPending };
}

/* ══════════════════════════════════ BÖLME ═════════════════════════════════ */

export interface NotificationsPaneProps {
  /** Rotadaki süzgeç (`?filtre=`); bilinmeyen değer "Tümü"ye düşer. */
  filter: string | undefined;
  onFilterChange: (next: NotifFilter) => void;
  /** Bildirim türleri / ayarlar ekranı. */
  onOpenPrefs: () => void;
  /** Daralan başlığın kaydırma bağlantısı (ekranın useHeaderScroll'u). */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
}

export function NotificationsPane({
  filter,
  onFilterChange,
  onOpenPrefs,
  onScroll,
  scrollEventThrottle,
}: NotificationsPaneProps) {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const appActive = useAppActive();
  const queryClient = useQueryClient();
  const patchCache = usePatchNotifCache();

  const tab = normalizeNotifFilter(filter);

  /* ───────────────────────────── VERİ ───────────────────────────── */

  const query = useInfiniteQuery({
    queryKey: NOTIF_KEY,
    queryFn: ({ pageParam }) => getPanelNotifications(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((total, page) => total + page.items.length, 0);
      // Sunucu hasNextPage döndürmüyor; toplamla karşılaştırarak türetilir.
      return loaded < lastPage.totalItems ? allPages.length + 1 : undefined;
    },
    enabled: Boolean(auth.user),
    staleTime: 15_000,
    refetchInterval: appActive ? POLL_MS : false,
    retry: false,
  });

  const items = useMemo(() => {
    const pages = query.data?.pages ?? [];
    // Sayfa sınırında aynı kayıt iki kez gelebilir (araya yeni bildirim
    // düşerse kayma olur); id ile teklenir.
    const seen = new Set<number>();
    const list: PanelNotification[] = [];
    for (const page of pages) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        list.push(item);
      }
    }
    return list.sort(newestFirst);
  }, [query.data]);

  const unread = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  const refetchAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: NOTIF_KEY });
    void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifCount() });
  }, [queryClient]);

  const refresh = useRefresh(refetchAll, { refreshing: query.isRefetching });

  /* ──────────────────────── OKUNDU İŞARETLEME ──────────────────────── */

  const { mutate: markRead } = useMutation({
    mutationFn: (id: number) => markNotifRead(id),
    onMutate: (id: number) => {
      patchCache((item) =>
        item.id === id && !item.is_read
          ? { ...item, is_read: true, read_at: new Date().toISOString() }
          : item,
      );
    },
    // Hata sessiz kalmaz ama ekranı da kesmez: liste sunucudan tazelenir.
    onError: () => refetchAll(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifCount() });
    },
  });

  /* ──────────────────────────── EYLEMLER ──────────────────────────── */

  const isManagement = auth.isManagement;

  const openNotif = useCallback(
    (notif: PanelNotification) => {
      if (!notif.is_read) markRead(notif.id);

      /**
       * Hedef, push bildirimiyle AYNI çözümleyiciden geçer: uygulama içi satır
       * ile telefona düşen bildirim aynı ekranı açar. Rota nesnesi typedRoutes
       * altında dinamik olduğu için `as never` ile geçilir (hooks/
       * usePushNotifications.ts ile aynı kalıp).
       */
      const target = routeFromNotif(
        {
          notification_id: notif.id,
          type: notif.type,
          entity_type: notif.entity_type,
          entity_public_id: notif.entity_public_id,
        },
        { isManagement },
      );

      if (target) {
        router.push(target as never);
        return;
      }

      // Çözümlenemeyen bildirim: en azından okundu sayılır, ekran değişmez.
      toast.show({ message: "Bu bildirimin açılacak bir ekranı yok.", tone: "neutral" });
    },
    [isManagement, markRead, router, toast],
  );

  const selectTab = onFilterChange;
  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [query]);

  /* ──────────────────────────── BÖLÜMLER ──────────────────────────── */

  /** Listede gerçekten bulunan kategoriler — boş çip çizilmez. */
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<NotifCategory, number>> = {};
    for (const item of items) {
      const key = notifLook(item).category;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const visible = useMemo(() => {
    if (tab === "tumu") return items;
    if (tab === "okunmamis") return items.filter((item) => !item.is_read);
    return items.filter((item) => notifLook(item).category === tab);
  }, [items, tab]);

  /* Her süzgeçte zaman sırası + gün başlığı ("Bugün", "Dün", "12 Ağustos Salı"). */
  const sections = useMemo<NotifSection[]>(() => {
    const groups: NotifSection[] = [];
    for (const item of visible) {
      const key = dayKey(item.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.data.push(item);
      } else {
        groups.push({ key, title: formatDayHeading(item.createdAt), data: [item] });
      }
    }
    return groups;
  }, [visible]);

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<PanelNotification, NotifSection>) => (
      <NotificationRow
        notif={item}
        onPress={openNotif}
        first={index === 0}
        last={index === section.data.length - 1}
      />
    ),
    [openNotif],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: NotifSection }) => (
      <SectionHeader title={section.title} meta={`${section.data.length}`} inset="flush" />
    ),
    [],
  );

  /* ───────────────────────────── GÖRÜNÜM ───────────────────────────── */

  if (query.isLoading) {
    return (
      <View style={styles.skeleton}>
        <SkeletonListRow count={7} avatar />
      </View>
    );
  }

  if (query.isError && items.length === 0) {
    return <ErrorState error={query.error} onRetry={refetchAll} />;
  }

  const listHeader =
    query.isError && items.length > 0 ? (
      <View style={styles.header}>
        {/* Veri EKRANDAYKEN hata bant olur; liste silinmez (§5.6). */}
        <ErrorState error={query.error} onRetry={refetchAll} variant="banner" />
      </View>
    ) : null;

  /* SÜZGEÇ ŞERİDİ — Tümü · Okunmamış · listede bulunan kategoriler. */
  const presentCategories = CATEGORY_ORDER.filter((item) => categoryCounts[item.key]);
  const filterBar =
    items.length > 0 ? (
      <ChipGroup style={styles.filters}>
        <Chip label="Tümü" selected={tab === "tumu"} onPress={() => selectTab("tumu")} />
        <Chip
          label="Okunmamış"
          count={unread || undefined}
          selected={tab === "okunmamis"}
          onPress={() => selectTab("okunmamis")}
        />
        {presentCategories.length > 1
          ? presentCategories.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                icon={item.icon}
                selected={tab === item.key}
                onPress={() => selectTab(item.key)}
              />
            ))
          : null}
      </ChipGroup>
    ) : null;

  /* Süzgece göre boş durum: "hiç bildirim yok" ile "bu süzgeçte yok" ayrı. */
  const emptyState =
    items.length === 0 ? (
      <EmptyState
        icon="notifications-off-outline"
        title="Henüz bildirim yok"
        body="Teklifler, sözleşmeler, disiplin kararları ve yönetim mesajları geldikçe burada toplanır."
        action={{ label: "Bildirim türlerini seç", onPress: onOpenPrefs }}
      />
    ) : tab === "okunmamis" ? (
      <EmptyState
        icon="checkmark-done-outline"
        title="Hepsi okundu"
        body="Bekleyen bildirimin yok. Yeni bir şey gelince burada görürsün."
        action={{ label: "Tümünü göster", onPress: () => selectTab("tumu") }}
      />
    ) : (
      <EmptyState
        icon="filter-outline"
        title="Bu süzgeçte bildirim yok"
        action={{ label: "Tümünü göster", onPress: () => selectTab("tumu") }}
      />
    );

  const listFooter = query.hasNextPage ? (
    <Button
      label="Daha fazlasını yükle"
      variant="secondary"
      size="sm"
      onPress={loadMore}
      loading={query.isFetchingNextPage}
      fullWidth
      style={styles.more}
    />
  ) : null;

  return (
    <View style={styles.pane}>
      {filterBar}
      <SectionList
        onScroll={onScroll}
        scrollEventThrottle={scrollEventThrottle}
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={emptyState}
        contentContainerStyle={styles.list}
        refreshControl={refresh.control}
        initialNumToRender={12}
        windowSize={8}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
      />
    </View>
  );
}

/* ═══════════════════════════════ LİSTE SATIRI ═════════════════════════════ */

/**
 * Bildirim satırı — günün satır grubunun bir parçası (`first`/`last` grubun
 * köşelerini ve ayracını verir; Arena ListRow grubu ile aynı ölçü).
 *
 * OKUNMAMIŞ: sol kenarda 3px mor ray, ikon pulu türünün tonunda yanar, başlık
 * kalın, sağda nokta. OKUNMUŞ: pul sönük, başlık normal ağırlık. "Yeni"
 * bilgisini renk tek başına taşımaz; ağırlık ve işaret de söyler.
 */
const NotificationRow = memo(function NotificationRow({
  notif,
  onPress,
  first,
  last,
}: {
  notif: PanelNotification;
  onPress: (notif: PanelNotification) => void;
  first: boolean;
  last: boolean;
}) {
  const handlePress = useCallback(() => onPress(notif), [notif, onPress]);
  const look = notifLook(notif);
  const palette = toneColors(look.tone);
  const unread = !notif.is_read;

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? "Okunmadı. " : ""}${notif.title}${notif.description ? `. ${notif.description}` : ""}. ${relativeTime(notif.createdAt)}`}
      style={[
        styles.row,
        first ? styles.rowFirst : null,
        last ? styles.rowLast : styles.rowDivided,
      ]}
    >
      {unread ? <View style={[styles.rail, first ? styles.railFirst : null, last ? styles.railLast : null]} /> : null}

      <View style={[styles.icon, { backgroundColor: unread ? palette.dim : colors.surface2 }]}>
        <Ionicons name={look.icon} size={18} color={unread ? palette.fg : colors.textTertiary} />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, unread ? styles.titleUnread : null]}
            numberOfLines={2}
            {...textScale.dense}
          >
            {notif.title}
          </Text>
          <Text style={[styles.time, unread ? styles.timeUnread : null]} numberOfLines={1} {...textScale.dense}>
            {relativeTime(notif.createdAt)}
          </Text>
        </View>
        {notif.description ? (
          <Text style={styles.description} numberOfLines={2} {...textScale.dense}>
            {notif.description}
          </Text>
        ) : null}
      </View>

      {unread ? <View style={styles.dot} accessibilityElementsHidden /> : null}
    </Touchable>
  );
});

/* ═════════════════════════════════ STİLLER ════════════════════════════════ */

const styles = StyleSheet.create({
  pane: {
    flex: 1,
  },
  filters: {
    flexGrow: 0,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  skeleton: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
    flexGrow: 1,
  },
  header: {
    paddingTop: space.sm,
    gap: space.sm,
  },
  more: {
    marginTop: space.md,
  },

  /* Bildirim satırı — grup içi konumla köşe ve ayraç. */
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface1,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  rowFirst: {
    borderTopWidth: hairline,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  rowLast: {
    borderBottomWidth: hairline,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  rowDivided: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  rail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.brand,
  },
  railFirst: {
    borderTopLeftRadius: radius.lg,
  },
  railLast: {
    borderBottomLeftRadius: radius.lg,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  title: {
    ...type.body,
    color: colors.textPrimary,
    flex: 1,
  },
  titleUnread: {
    ...type.h3,
  },
  description: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  time: {
    ...type.caption,
    color: colors.textTertiary,
    paddingTop: 2,
  },
  timeUnread: {
    color: colors.brandAccent,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    marginTop: space.sm,
  },
});
