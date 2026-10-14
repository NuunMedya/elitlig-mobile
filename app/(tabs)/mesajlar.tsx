/**
 * MESAJLAR — alt menüdeki iletişim merkezi: sohbetler, istekler ve bütün
 * bildirimler TEK yerde ama KUTU KUTU ayrı.
 *
 * NE: kullanıcıya yazılan, ondan yanıt bekleyen ya da onu ilgilendiren her
 * şey. Eski Gelen kutusu (Bildirimler | Mesajlar iki sekme + iç anahtar)
 * "bu bildirim hangi sekmede?" sorusunu kullanıcıya bırakıyordu. Şimdi
 * içerik TÜRÜNE göre kutulara ayrılır ve her kutu kendi rengini taşır:
 *
 *   Özet       → kutuların sayıları, yanıt bekleyen istekler, son gelenler
 *   Sohbetler  → takım grubu, birebir, yönetim sohbeti (components/chat)
 *   İstekler   → maç talebi, kadro isteği, davet, başvuru, görev… (amber)
 *   Transfer   → teklif, sözleşme, takım transferi (menekşe)
 *   Disiplin   → ceza, savunma, itiraz (kırmızı)
 *   Maç        → gol, sonuç, maçın adamı, haftanın enleri (canlı)
 *   Yönetim    → yönetime yapılan durumlu başvurular (components/inbox/PanelThreadsPane)
 *   Diğer      → üyelik, şifre, haber
 *   Tümü       → bütün bildirimler zaman sırasıyla
 *
 * KUTU ŞERİDİ: başlığın altında yatay çip şeridi; her çip ikon + ad +
 * okunmamış sayısı. Seçili kutu çipi kendi tonunda dolar — kullanıcı hangi
 * kutuda olduğunu renkten de okur. Seçim ROTADA taşınır (`?kutu=`): push
 * bildirimi, derin bağlantı ve geri dönüş doğru kutuya düşer.
 *
 * VERİ: bildirim kutuları aynı akışı (`useNotificationFeed`, tek önbellek)
 * süzer; Özet de oradan okur. Sohbet sayısı `useUnreadCount`, yönetim
 * başvurusu sayısı `/api/panel/me/messages` (PanelThreadsPane ile aynı anahtar).
 *
 * ESKİ ROTALAR: /gelen-kutusu, /bildirimler, /mesajlarim buraya yönlendirir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useMemo, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatInbox } from "@/components/chat/ChatInbox";
import {
  CATEGORY_ORDER,
  NotificationRow,
  NotificationsPane,
  notifLook,
  relativeTime,
  useMarkAllNotificationsRead,
  useNotificationFeed,
  type NotifCategory,
  type NotifFilter,
} from "@/components/inbox/NotificationsPane";
import { PanelThreadsPane } from "@/components/inbox/PanelThreadsPane";
import {
  EmptyState,
  ScreenHeader,
  SkeletonListRow,
  Touchable,
  toneColors,
  useHeaderScroll,
  type ScreenHeaderAction,
  type Tone,
} from "@/components/ui";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { getMyMessages, type PanelNotification } from "@/lib/api/panel";
import { formatNumber } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ═══════════════════════════════ KUTULAR ═══════════════════════════════ */

export type MessageBox =
  | "ozet"
  | "sohbetler"
  | "istekler"
  | "transfer"
  | "disiplin"
  | "mac"
  | "yonetim"
  | "diger"
  | "bildirimler";

interface BoxDef {
  key: MessageBox;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  /** Bildirim kutusuysa süzdüğü kategori. */
  category?: NotifCategory;
  /** Özet kutucuğunun alt yazısı (içerik yokken). */
  hint: string;
}

const categoryDef = (key: NotifCategory) => CATEGORY_ORDER.find((item) => item.key === key)!;

const BOXES: readonly BoxDef[] = [
  { key: "ozet", label: "Özet", icon: "grid-outline", tone: "neutral", hint: "" },
  { key: "sohbetler", label: "Sohbetler", icon: "chatbubbles-outline", tone: "brand", hint: "Takım, birebir ve yönetim" },
  { key: "istekler", label: "İstekler", icon: categoryDef("istek").icon, tone: "warn", category: "istek", hint: "Maç, kadro, davet, başvuru" },
  { key: "transfer", label: "Transfer", icon: categoryDef("transfer").icon, tone: "brand", category: "transfer", hint: "Teklif ve sözleşmeler" },
  { key: "disiplin", label: "Disiplin", icon: categoryDef("disiplin").icon, tone: "danger", category: "disiplin", hint: "Ceza, savunma, itiraz" },
  { key: "mac", label: "Maç", icon: categoryDef("mac").icon, tone: "live", category: "mac", hint: "Gol, sonuç, ödüller" },
  { key: "yonetim", label: "Yönetim", icon: "business-outline", tone: "info", hint: "Başvurular ve yanıtlar" },
  { key: "diger", label: "Diğer", icon: categoryDef("diger").icon, tone: "neutral", category: "diger", hint: "Üyelik, hesap, haber" },
  { key: "bildirimler", label: "Tümü", icon: "notifications-outline", tone: "neutral", hint: "Bütün bildirimler" },
];

const BOX_KEYS = new Set<string>(BOXES.map((box) => box.key));

/** Eski `?kutu=` değerleri: "basvurular" → Yönetim. */
function normalizeBox(value: string | undefined): MessageBox {
  if (value === "basvurular") return "yonetim";
  if (value && BOX_KEYS.has(value)) return value as MessageBox;
  return "ozet";
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Özet'te listelenen en çok satır. */
const PENDING_LIMIT = 4;
const RECENT_LIMIT = 6;

/* ═══════════════════════════════ EKRAN ═══════════════════════════════ */

export default function MessagesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const unread = useUnreadCount();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{
    kutu?: string | string[];
    filtre?: string | string[];
    durum?: string | string[];
    yeni?: string | string[];
  }>();

  const box = normalizeBox(firstParam(params.kutu));
  const signedIn = Boolean(auth.user);
  const feed = useNotificationFeed();
  const { markAll } = useMarkAllNotificationsRead();

  /** Yönetim başvurularının okunmamış sayısı — PanelThreadsPane ile aynı önbellek. */
  const threadsQuery = useQuery({
    queryKey: queryKeys.panelMessages(),
    queryFn: getMyMessages,
    enabled: signedIn,
    staleTime: 30_000,
    retry: false,
  });
  const threadUnread = threadsQuery.data?.unread ?? 0;

  /** Kutu başına okunmamış bildirim sayısı ve en yeni bildirim. */
  const byCategory = useMemo(() => {
    const unreadMap: Partial<Record<NotifCategory, number>> = {};
    const latest: Partial<Record<NotifCategory, PanelNotification>> = {};
    for (const item of feed.items) {
      const key = notifLook(item).category;
      if (!latest[key]) latest[key] = item;
      if (!item.is_read) unreadMap[key] = (unreadMap[key] ?? 0) + 1;
    }
    return { unread: unreadMap, latest };
  }, [feed.items]);

  const countOf = useCallback(
    (def: BoxDef): number => {
      if (def.key === "sohbetler") return unread.messages;
      if (def.key === "yonetim") return threadUnread + (byCategory.unread.mesaj ?? 0);
      if (def.key === "bildirimler") return feed.unread;
      if (def.category) return byCategory.unread[def.category] ?? 0;
      return 0;
    },
    [byCategory.unread, feed.unread, threadUnread, unread.messages],
  );

  /* ───────────────────────────── GEZİNME ───────────────────────────── */

  const selectBox = useCallback((next: MessageBox) => router.setParams({ kutu: next, filtre: "" }), [router]);
  const selectFilter = useCallback((next: NotifFilter) => router.setParams({ filtre: next }), [router]);
  const selectStatus = useCallback((next: string | null) => router.setParams({ durum: next ?? "" }), [router]);
  const clearCompose = useCallback(() => router.setParams({ yeni: "" }), [router]);
  const openPrefs = useCallback(() => router.push("/bildirim-tercihleri"), [router]);
  const openSignIn = useCallback(() => router.push("/giris"), [router]);
  const newChat = useCallback(() => router.push("/sohbet/yeni"), [router]);
  const newRequest = useCallback(() => router.setParams({ kutu: "yonetim", yeni: "1" }), [router]);

  /* ───────────────────────────── BAŞLIK ───────────────────────────── */

  const actions = useMemo<ScreenHeaderAction[]>(() => {
    if (!signedIn) return [];
    if (box === "sohbetler") {
      return [{ icon: "create-outline", onPress: newChat, accessibilityLabel: "Yeni sohbet" }];
    }
    if (box === "yonetim") {
      return [{ icon: "add", onPress: newRequest, accessibilityLabel: "Yönetime yeni başvuru" }];
    }
    const list: ScreenHeaderAction[] = [];
    if (feed.unread > 0) {
      list.push({ icon: "checkmark-done", onPress: markAll, accessibilityLabel: "Tüm bildirimleri okundu işaretle" });
    }
    list.push({ icon: "options-outline", onPress: openPrefs, accessibilityLabel: "Bildirim ayarları" });
    return list;
  }, [box, feed.unread, markAll, newChat, newRequest, openPrefs, signedIn]);

  const total = unread.total + threadUnread;
  const subtitle = !signedIn
    ? undefined
    : total > 0
      ? `${formatNumber(total)} okunmamış`
      : unread.loading
        ? undefined
        : "Hepsi okundu";

  /* ───────────────────────────── İÇERİK ───────────────────────────── */

  const def = BOXES.find((item) => item.key === box) ?? BOXES[0];

  let content: ReactNode;
  if (!signedIn) {
    content = (
      <EmptyState
        icon="chatbubbles-outline"
        title="Mesajların hesabına bağlı"
        body="Sohbetler, maç ve kadro istekleri, transfer ve disiplin bildirimleri için giriş yap."
        action={{ label: "Giriş yap", onPress: openSignIn }}
      />
    );
  } else if (box === "ozet") {
    content = (
      <Overview
        feed={feed}
        countOf={countOf}
        latest={byCategory.latest}
        onSelectBox={selectBox}
        onScroll={scrollProps.onScroll}
      />
    );
  } else if (box === "sohbetler") {
    content = <ChatInbox embedded onScroll={scrollProps.onScroll} />;
  } else if (box === "yonetim") {
    content = (
      <PanelThreadsPane
        status={firstParam(params.durum)}
        onStatusChange={selectStatus}
        composeRequested={Boolean(firstParam(params.yeni))}
        onComposeHandled={clearCompose}
        onScroll={scrollProps.onScroll}
        scrollEventThrottle={scrollProps.scrollEventThrottle}
      />
    );
  } else {
    content = (
      <NotificationsPane
        key={box}
        category={def.category}
        filter={firstParam(params.filtre)}
        onFilterChange={selectFilter}
        onOpenPrefs={openPrefs}
        onScroll={scrollProps.onScroll}
        scrollEventThrottle={scrollProps.scrollEventThrottle}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Mesajlar"
        subtitle={subtitle}
        scrollY={scrollY}
        actions={actions}
        bottom={signedIn ? <BoxRail value={box} countOf={countOf} onChange={selectBox} /> : undefined}
      />
      <View style={styles.body}>{content}</View>
    </SafeAreaView>
  );
}

/* ═══════════════════════════════ KUTU ŞERİDİ ═══════════════════════════════ */

const BoxRail = memo(function BoxRail({
  value,
  countOf,
  onChange,
}: {
  value: MessageBox;
  countOf: (def: BoxDef) => number;
  onChange: (next: MessageBox) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      accessibilityRole="tablist"
    >
      {BOXES.map((def) => (
        <BoxChip key={def.key} def={def} count={countOf(def)} selected={def.key === value} onPress={onChange} />
      ))}
    </ScrollView>
  );
});

const BoxChip = memo(function BoxChip({
  def,
  count,
  selected,
  onPress,
}: {
  def: BoxDef;
  count: number;
  selected: boolean;
  onPress: (key: MessageBox) => void;
}) {
  const handlePress = useCallback(() => onPress(def.key), [def.key, onPress]);
  const palette = toneColors(def.tone);
  return (
    <Touchable
      feedback="chip"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={count > 0 ? `${def.label}, ${count} okunmamış` : def.label}
      style={[styles.chip, selected && { backgroundColor: palette.dim, borderColor: palette.fg }]}
    >
      <Ionicons name={def.icon} size={13} color={selected ? palette.fg : colors.textSecondary} />
      <Text style={[styles.chipLabel, selected && { color: palette.fg }]} numberOfLines={1} {...textScale.dense}>
        {def.label}
      </Text>
      {count > 0 ? (
        <View style={[styles.chipCount, { backgroundColor: def.tone === "neutral" ? colors.brand : palette.fg }]}>
          <Text style={styles.chipCountText} {...textScale.badge}>
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
});

/* ═══════════════════════════════ ÖZET ═══════════════════════════════ */

/**
 * Özet: (1) kutu kutucukları — her kutunun sayısı ve son başlığı; (2) yanıt
 * bekleyen istekler; (3) son gelenler. Kullanıcı tek bakışta "beni bekleyen
 * ne var" sorusunu yanıtlar, sonra ilgili kutuya tek dokunuşla geçer.
 */
function Overview({
  feed,
  countOf,
  latest,
  onSelectBox,
  onScroll,
}: {
  feed: ReturnType<typeof useNotificationFeed>;
  countOf: (def: BoxDef) => number;
  latest: Partial<Record<NotifCategory, PanelNotification>>;
  onSelectBox: (key: MessageBox) => void;
  onScroll?: ReturnType<typeof useHeaderScroll>["scrollProps"]["onScroll"];
}) {
  const pending = useMemo(
    () => feed.items.filter((item) => !item.is_read && notifLook(item).category === "istek").slice(0, PENDING_LIMIT),
    [feed.items],
  );
  const recent = useMemo(() => feed.items.slice(0, RECENT_LIMIT), [feed.items]);
  const tiles = BOXES.filter((def) => def.key !== "ozet" && def.key !== "bildirimler");

  return (
    <ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.overview}
      refreshControl={feed.refresh.control}
    >
      <View style={styles.grid}>
        {tiles.map((def) => {
          const last = def.category ? latest[def.category] : def.key === "yonetim" ? latest.mesaj : undefined;
          return (
            <BoxTile
              key={def.key}
              def={def}
              count={countOf(def)}
              caption={last ? last.title : def.hint}
              time={last ? relativeTime(last.createdAt) : ""}
              onPress={onSelectBox}
            />
          );
        })}
      </View>

      <OverviewSection
        title="Yanıt bekleyen istekler"
        tone="warn"
        actionLabel="İstekler"
        onAction={() => onSelectBox("istekler")}
      >
        {feed.query.isLoading ? (
          <SkeletonListRow count={2} avatar />
        ) : pending.length ? (
          pending.map((item, index) => (
            <NotificationRow
              key={item.id}
              notif={item}
              onPress={feed.openNotif}
              first={index === 0}
              last={index === pending.length - 1}
            />
          ))
        ) : (
          <Text style={styles.quiet} {...textScale.dense}>
            Bekleyen istek yok.
          </Text>
        )}
      </OverviewSection>

      <OverviewSection
        title="Son gelenler"
        tone="neutral"
        actionLabel="Tümü"
        onAction={() => onSelectBox("bildirimler")}
      >
        {feed.query.isLoading ? (
          <SkeletonListRow count={3} avatar />
        ) : recent.length ? (
          recent.map((item, index) => (
            <NotificationRow
              key={item.id}
              notif={item}
              onPress={feed.openNotif}
              first={index === 0}
              last={index === recent.length - 1}
            />
          ))
        ) : (
          <Text style={styles.quiet} {...textScale.dense}>
            Henüz bildirim yok.
          </Text>
        )}
      </OverviewSection>
    </ScrollView>
  );
}

const BoxTile = memo(function BoxTile({
  def,
  count,
  caption,
  time,
  onPress,
}: {
  def: BoxDef;
  count: number;
  caption: string;
  time: string;
  onPress: (key: MessageBox) => void;
}) {
  const handlePress = useCallback(() => onPress(def.key), [def.key, onPress]);
  const palette = toneColors(def.tone);
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${def.label}${count > 0 ? `, ${count} okunmamış` : ""}. ${caption}`}
      style={[styles.tile, count > 0 && { borderColor: palette.fg }]}
    >
      {/* Sol kenarda kutunun renk rayı: kutular renkten de ayrılır. */}
      <View style={[styles.tileRail, { backgroundColor: palette.fg }]} />
      <View style={styles.tileHead}>
        <View style={[styles.tileIcon, { backgroundColor: palette.dim }]}>
          <Ionicons name={def.icon} size={14} color={palette.fg} />
        </View>
        <Text style={styles.tileLabel} numberOfLines={1} {...textScale.dense}>
          {def.label}
        </Text>
        {count > 0 ? (
          <Text style={[styles.tileCount, { color: palette.fg }]} {...textScale.badge}>
            {count > 99 ? "99+" : count}
          </Text>
        ) : null}
      </View>
      <Text style={styles.tileCaption} numberOfLines={1} {...textScale.dense}>
        {caption}
      </Text>
      {time ? (
        <Text style={styles.tileTime} numberOfLines={1} {...textScale.dense}>
          {time}
        </Text>
      ) : null}
    </Touchable>
  );
});

function OverviewSection({
  title,
  tone,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  tone: Tone;
  actionLabel: string;
  onAction: () => void;
  children: ReactNode;
}) {
  const palette = toneColors(tone);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionDot, { backgroundColor: palette.fg }]} />
        <Text style={styles.sectionTitle} {...textScale.dense}>
          {title}
        </Text>
        <Touchable feedback="chip" haptic="selection" onPress={onAction} accessibilityRole="link">
          <Text style={styles.sectionAction} {...textScale.dense}>
            {actionLabel} ›
          </Text>
        </Touchable>
      </View>
      {children}
    </View>
  );
}

/* ═══════════════════════════════ STİLLER ═══════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flex: 1,
  },

  /* Kutu şeridi */
  rail: {
    gap: space.s,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  chip: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  chipLabel: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
  },
  chipCount: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  chipCountText: {
    ...type.micro,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0,
    color: colors.textOnBrand,
  },

  /* Özet */
  overview: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: space.s,
  },
  tile: {
    width: "49%",
    minHeight: 72,
    paddingVertical: space.sm,
    paddingLeft: space.md,
    paddingRight: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    gap: 2,
  },
  tileRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  tileHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    marginBottom: 2,
  },
  tileIcon: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    ...type.label,
    fontSize: 12,
    lineHeight: 15,
    color: colors.textPrimary,
    flex: 1,
  },
  tileCount: {
    ...type.tableNumStrong,
    fontSize: 12,
    lineHeight: 15,
  },
  tileCaption: {
    ...type.caption,
    color: colors.textSecondary,
  },
  tileTime: {
    ...type.micro,
    fontSize: 9,
    lineHeight: 11,
    color: colors.textTertiary,
  },
  section: {
    gap: space.s,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionTitle: {
    ...type.overline,
    color: colors.textSecondary,
    flex: 1,
  },
  sectionAction: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.brandAccent,
  },
  quiet: {
    ...type.caption,
    color: colors.textTertiary,
    paddingVertical: space.sm,
  },
});
