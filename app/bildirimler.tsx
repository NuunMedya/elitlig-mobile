/**
 * BİLDİRİMLER — panel bildirim merkezi.
 *
 * NE: `GET /api/panel-notifications` üyenin tüm sistem bildirimlerini
 * döndürür (transfer, sözleşme, ceza, mesaj, davet, maç talebi, haftanın
 * enleri…). Push bildirimi kaçırılmış olsa bile bu ekran her şeyi gösterir;
 * "telefonuma düşmedi" ile "hiç olmadı" burada ayrılır.
 *
 * NEDEN İKİ SIRALAMA (segment): bildirim merkezi iki farklı soruya cevap verir
 * — "bekleyen işim var mı" ve "dün ne oldu". İlkinde okunmamışlar üstte
 * toplanmalı, ikincisinde zaman sırası bozulmamalı. Seçim `?tab=` ile ROTADA
 * taşınır: derin bağlantı, geri dönüş ve ekran tazelemesi seçimi korur.
 *
 * NEDEN İKONLAR lib/notifications.ts İLE EŞLEŞİR: bildirime dokunulunca
 * gidilecek ekranı `routeFromNotif` çözer; ikon ve ton da AYNI sırayla
 * (önce entity_type, sonra type öneki) çözülür. Böylece bir bildirimin
 * simgesi ile açtığı ekran hiçbir zaman ayrışmaz — yeni bir sunucu türü
 * eklendiğinde ikisi de aynı yerden, aynı önekle türer.
 *
 * NEDEN İYİMSER OKUNDU: satıra dokunulduğu an rozet sönmeli; istek arkada
 * gider. Yanıt beklenirse kullanıcı zaten başka bir ekrandadır ve geri
 * döndüğünde satır hâlâ okunmamış görünür.
 *
 * NEDEN SAYFALAMA: uç sayfa başına 50 kayıt veriyor ve `totalItems` ile
 * toplamı söylüyor. Tek sayfa çekmek eski bildirimleri erişilemez kılıyordu;
 * "daha fazlasını yükle" aynı uçla listeyi uzatır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import {
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonListRow,
  Touchable,
  errorMessage,
  toneColors,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
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

type NotifTab = "okunmamis" | "kronolojik";

const TAB_ITEMS: SegmentedItem<NotifTab>[] = [
  { key: "okunmamis", label: "Okunmamış üstte" },
  { key: "kronolojik", label: "Zaman sırası" },
];

interface NotifLook {
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
}

/** Bilinmeyen tür: nötr zil. Ekran asla boş bir kutu çizmez. */
const DEFAULT_LOOK: NotifLook = { icon: "notifications", tone: "neutral" };

/**
 * entity_type → görünüm. lib/notifications.ts'teki `targetFromEntity` ile aynı
 * anahtarlar; entity daha dar bir sözleşme olduğu için önce o bakılır.
 */
const ENTITY_LOOK: Record<string, NotifLook> = {
  TRANSFER_OFFER: { icon: "swap-horizontal", tone: "brand" },
  CONTRACT: { icon: "document-text", tone: "info" },
  PENALTY: { icon: "shield", tone: "danger" },
  PANEL_MESSAGE: { icon: "chatbubble-ellipses", tone: "info" },
  MATCH_REQUEST: { icon: "calendar", tone: "warn" },
  TEAM_JOIN_REQUEST: { icon: "people", tone: "brand" },
};

/**
 * type öneki → görünüm. SIRA ÖNEMLİ, ilk eşleşen kazanır — tıpkı
 * lib/notifications.ts'teki TYPE_PREFIX_TARGETS gibi. Maç kaynaklı türler
 * canlı tonunu alır (gol, başlangıç, devre, sonuç); genel "MATCH_" en sonda
 * durur ki MATCH_REQUEST onun altında kalmasın.
 */
const TYPE_PREFIX_LOOK: ReadonlyArray<readonly [string, NotifLook]> = [
  ["MATCH_GOAL", { icon: "football", tone: "live" }],
  ["MATCH_START", { icon: "play-circle", tone: "live" }],
  ["MATCH_HALFTIME", { icon: "pause-circle", tone: "live" }],
  ["MATCH_RESULT", { icon: "flag", tone: "live" }],
  ["MATCH_FIXTURE", { icon: "calendar-number", tone: "live" }],
  ["MATCH_REMINDER", { icon: "alarm", tone: "live" }],
  ["TRANSFER_", { icon: "swap-horizontal", tone: "brand" }],
  ["OFFER_", { icon: "swap-horizontal", tone: "brand" }],
  ["CONTRACT_", { icon: "document-text", tone: "info" }],
  ["PENALTY_", { icon: "shield", tone: "danger" }],
  ["PANEL_MESSAGE", { icon: "chatbubble-ellipses", tone: "info" }],
  ["TEAM_INVITE", { icon: "people", tone: "brand" }],
  ["TEAM_APPLICATION", { icon: "people", tone: "brand" }],
  ["MATCH_REQUEST", { icon: "calendar", tone: "warn" }],
  ["WEEKLY_AWARD", { icon: "trophy", tone: "warn" }],
  ["MEMBERSHIP_", { icon: "card", tone: "neutral" }],
  ["ACCOUNT_REQUEST_", { icon: "person-circle", tone: "neutral" }],
  ["TEAM_TRANSFER", { icon: "swap-horizontal", tone: "brand" }],
  ["PASSWORD_RESET", { icon: "key", tone: "neutral" }],
  ["MATCH_", { icon: "football", tone: "live" }],
  ["NEWS", { icon: "newspaper", tone: "neutral" }],
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

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTab(value: string | undefined): NotifTab {
  return value === "kronolojik" ? "kronolojik" : "okunmamis";
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

/* ══════════════════════════════════ EKRAN ═════════════════════════════════ */

export default function NotificationsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const appActive = useAppActive();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const tab = normalizeTab(firstParam(params.tab));

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

  /** Önbellekteki bütün sayfaları tek geçişte günceller. */
  const patchCache = useCallback(
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

  const readMutation = useMutation({
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

  const readAllMutation = useMutation({
    mutationFn: markAllNotifsRead,
    onMutate: () => {
      const now = new Date().toISOString();
      patchCache((item) => (item.is_read ? item : { ...item, is_read: true, read_at: now }));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifCount() });
      toast.show({ message: "Tüm bildirimler okundu işaretlendi.", tone: "success" });
    },
    onError: (error) => {
      refetchAll();
      toast.show({ message: errorMessage(error), tone: "danger" });
    },
  });

  const { mutate: markRead } = readMutation;
  const { mutate: markAllRead } = readAllMutation;

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

  const handleMarkAll = useCallback(() => markAllRead(), [markAllRead]);
  const selectTab = useCallback((next: NotifTab) => router.setParams({ tab: next }), [router]);
  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [query]);

  /* ──────────────────────────── BÖLÜMLER ──────────────────────────── */

  const sections = useMemo<NotifSection[]>(() => {
    if (items.length === 0) return [];

    if (tab === "okunmamis") {
      const fresh = items.filter((item) => !item.is_read);
      const old = items.filter((item) => item.is_read);
      const result: NotifSection[] = [];
      if (fresh.length) result.push({ key: "okunmamis", title: "Okunmamış", data: fresh });
      if (old.length) result.push({ key: "okunmus", title: "Daha önce", data: old });
      return result;
    }

    // Kronolojik: gün başlıklarıyla ("Bugün", "Dün", "12 Ağustos Salı").
    const groups: NotifSection[] = [];
    for (const item of items) {
      const key = dayKey(item.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.data.push(item);
      } else {
        groups.push({ key, title: formatDayHeading(item.createdAt), data: [item] });
      }
    }
    return groups;
  }, [items, tab]);

  const renderItem = useCallback(
    ({ item }: SectionListRenderItemInfo<PanelNotification, NotifSection>) => (
      <NotificationRow notif={item} onPress={openNotif} />
    ),
    [openNotif],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: NotifSection }) => <SectionHeader title={section.title} />,
    [],
  );

  /* ───────────────────────────── GÖRÜNÜM ───────────────────────────── */

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const listHeader = (
    <View style={styles.header}>
      {/* Veri EKRANDAYKEN hata bant olur; liste silinmez (§5.6). */}
      {query.isError && items.length > 0 ? (
        <ErrorState error={query.error} onRetry={refetchAll} variant="banner" />
      ) : null}

      {/*
        BİLDİRİM TERCİHLERİ SATIRI KALDIRILDI. Tercihlere önceden dört ayrı
        yerden gidiliyordu: Profil, Hesabım, bu listenin başı ve boş durumu.
        Tek kanonik kapı Profil → Tercihler → Bildirim Tercihleri'dir; burası
        bildirimlerin OKUNDUĞU yerdir, ayarlandığı yer değil. Üstelik satır her
        açılışta gerçek bildirimleri bir satır aşağı itiyordu.
      */}
      {unread > 0 ? (
        <ListRow
          leading={{ icon: "checkmark-done", tone: "win" }}
          title="Tümünü okundu işaretle"
          value={String(unread)}
          chevron={false}
          position="single"
          onPress={handleMarkAll}
        />
      ) : null}
    </View>
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
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Bildirimler"
        subtitle={unread > 0 ? `${unread} okunmamış bildirim` : "Tümü okundu"}
        back
        scrollY={scrollY}
        actions={
          unread > 0
            ? [
                {
                  icon: "checkmark-done",
                  onPress: handleMarkAll,
                  accessibilityLabel: "Tümünü okundu işaretle",
                },
              ]
            : undefined
        }
        bottom={
          <View style={styles.segment}>
            <SegmentedControl<NotifTab>
              items={TAB_ITEMS}
              value={tab}
              onChange={selectTab}
              size="sm"
            />
          </View>
        }
      />

      {query.isLoading ? (
        <View style={styles.skeleton}>
          <SkeletonListRow count={7} avatar />
        </View>
      ) : query.isError && items.length === 0 ? (
        <ErrorState error={query.error} onRetry={refetchAll} />
      ) : (
        <SectionList
          {...scrollProps}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-off-outline"
              title="Bildirim yok"
              body="Transfer teklifleri, sözleşmeler, disiplin dosyaları ve yönetim mesajları için bildirimler burada toplanır. Hangilerini alacağını Profil → Bildirim Tercihleri'nden seçebilirsin."
            />
          }
          contentContainerStyle={styles.list}
          refreshControl={refresh.control}
          initialNumToRender={12}
          windowSize={8}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
        />
      )}
    </SafeAreaView>
  );
}

/* ═══════════════════════════════ LİSTE SATIRI ═════════════════════════════ */

/**
 * Bildirim satırı. Okunmamışta ikon kutusu türünün tonunda YANAR, satır marka
 * çerçevesi alır ve sağda nokta durur; okunmuşta hepsi sessizleşir — renk
 * "yeni" bilgisini taşır, süs değildir.
 */
const NotificationRow = memo(function NotificationRow({
  notif,
  onPress,
}: {
  notif: PanelNotification;
  onPress: (notif: PanelNotification) => void;
}) {
  const handlePress = useCallback(() => onPress(notif), [notif, onPress]);
  const look = notifLook(notif);
  const palette = toneColors(look.tone);
  const unread = !notif.is_read;

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${notif.title}${notif.description ? `. ${notif.description}` : ""}${
        unread ? ". Okunmadı" : ""
      }`}
      style={[styles.row, unread ? styles.rowUnread : null]}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: unread ? palette.dim : colors.surface3 },
        ]}
      >
        <Ionicons
          name={look.icon}
          size={18}
          color={unread ? palette.fg : colors.textTertiary}
        />
      </View>

      <View style={styles.rowBody}>
        <Text
          style={[styles.title, unread ? styles.titleUnread : null]}
          numberOfLines={2}
          {...textScale.dense}
        >
          {notif.title}
        </Text>
        {notif.description ? (
          <Text style={styles.description} numberOfLines={3} {...textScale.dense}>
            {notif.description}
          </Text>
        ) : null}
        <Text style={styles.time} {...textScale.badge}>
          {relativeTime(notif.createdAt)}
        </Text>
      </View>

      {unread ? <View style={styles.dot} /> : null}
    </Touchable>
  );
});

/* ═════════════════════════════════ STİLLER ════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  segment: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
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

  /* Bildirim satırı */
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  rowUnread: {
    borderColor: colors.brandBorder,
    backgroundColor: colors.surface2,
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
  title: {
    ...type.bodySm,
    color: colors.textPrimary,
  },
  titleUnread: {
    ...type.h3,
    color: colors.textPrimary,
  },
  description: {
    ...type.caption,
    color: colors.textSecondary,
  },
  time: {
    ...type.micro,
    color: colors.textTertiary,
    marginTop: space.xxs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandAccent,
    marginTop: space.xs,
  },
});
