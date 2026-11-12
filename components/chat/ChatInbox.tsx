/**
 * SOHBETLER — WhatsApp düzeninde sohbet listesi (web ve masaüstü Mesajlar ile
 * aynı süzgeçler ve kurallar).
 *
 *   · BAŞLIK: büyük "Mesajlar", sağda çıplak eylemler (bildirim zili, yeni
 *     sohbet, menü). Okunmamış özeti cümleyle değil hap sayaçları ve satır
 *     rozetleriyle söylenir. Çizimi `InboxChrome.tsx` içindedir.
 *   · ARAMA: başlığın altındaki alana dokununca ekranı devralır; sonuçlar
 *     SOHBETLER (ad eşleşmesi, arşiv dahil) · KİŞİLER (rehberde olup henüz
 *     sohbeti olmayanlar; dokununca sohbet açılır) · MESAJLAR (2+ harf, tüm
 *     sohbetlerin mesajları; dokununca sohbet o mesajda açılır) diye gruplanır.
 *   · SÜZGEÇLER: Tümü · Okunmamış · Sabitlenen · Gruplar · Üye mesajları
 *     (messages.view) · Arşiv. Haplar listeyle birlikte kayar.
 *   · SATIR: `InboxRow.tsx` — 54 px avatar, ad + saat, tik + önizleme, sağda
 *     bahsetme / sessiz / sabit / okunmamış sayacı; ayraç avatardan sonra başlar.
 *     Sabitlenenler üsttedir; arşiv varsa en üstte "Arşivlenmiş" satırı durur.
 *   · UZUN BAS: sabitle, sessize al, arşivle, okundu / okunmadı, gruptan çık,
 *     sil. (Kaydırma hareketi ve çoklu seçim yok: gesture-handler kurulu değil;
 *     aynı eylemler uzun basma menüsündedir.)
 *   · Sağ altta yüzen "yeni sohbet" düğmesi; menüde yeni grup, yıldızlı
 *     mesajlar, tümünü okundu say, mesaj tercihleri, engellenenler, (yetkiyle)
 *     arama kayıtları.
 *
 * ÜYE MESAJLARI: üyelerin "ElitLig Yönetimi" sohbetleri ortak gelen kutusudur
 * (/api/admin/chat); Takımlar / Oyuncular / Üyeler alt süzgeci. Eski talep
 * kartıyla biten ve ekip (staff) sohbetleri burada listelenmez — ekip
 * sohbetleri zaten kişisel listededir (masaüstü `inboxThreads` kuralı).
 *
 * PERFORMANS: liste sanaldır ve satır yükseklikleri sabittir (`getItemLayout`).
 * Satır `memo`dur; yazıyor…, taslak ve çevrimiçi durumunu satır KENDİ okur
 * (useSyncExternalStore) — bu olaylar listeyi yeniden çizmez. Satırlara giriş
 * animasyonu yoktur; yalnız liste ilk çizimde bir kez belirir.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, FlatList, Keyboard, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatPrefsSheet } from "@/components/chat/ChatPrefsSheet";
import { FILTER_BAR_HEIGHT, FilterPills, InboxFab, InboxHeader, type FilterPillItem, type InboxHeaderAction } from "@/components/chat/InboxChrome";
import { PresenceBridge } from "@/components/chat/inboxPresence";
import {
  ArchiveRow,
  ConversationRow,
  HitRow,
  INBOX_ARCHIVE_HEIGHT,
  INBOX_NOTE_HEIGHT,
  INBOX_ROW_HEIGHT,
  INBOX_SECTION_HEIGHT,
  InboxNote,
  InboxSection,
  InboxSkeleton,
  PersonRow,
} from "@/components/chat/InboxRow";
import { ActionMenu, type MessageMenuItem } from "@/components/chat/MessageSheets";
import { useConversationActions } from "@/components/chat/useConversationActions";
import { EmptyState, ErrorState, errorMessage, useFabAutoHide, useReduceMotion, useRefresh, useToast } from "@/components/ui";
import { useAdminConversations, useConversations } from "@/hooks/useChat";
import { hasAnyPermission } from "@/lib/admin/access";
import { adminChat, getDirectory, openConversation, searchMessages, type ChatConversation, type ChatSearchHit, type ChatUser } from "@/lib/api/chat";
import { chatCounts, filterChats, isUnread, sortChats, type ChatFilter } from "@/lib/chatUtils";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, duration, easing, space, upperTR } from "@/theme";

type Filter = ChatFilter | "inbox";
type InboxKind = "all" | "team" | "player" | "member";

const INBOX_KINDS: [InboxKind, string][] = [["all", "Tümü"], ["team", "Takımlar"], ["player", "Oyuncular"], ["member", "Üyeler"]];
const INBOX_SUB_HEIGHT = FILTER_BAR_HEIGHT - space.sm;
const MAX_PEOPLE = 8;
const MAX_HITS = 40;
const normalize = (value: string) => value.toLocaleLowerCase("tr-TR");

type Row =
  | { type: "archive"; key: string; count: number; unread: number }
  | { type: "chat"; key: string; conversation: ChatConversation; inbox: boolean }
  | { type: "section"; key: string; title: string; count?: number }
  | { type: "hit"; key: string; hit: ChatSearchHit }
  | { type: "person"; key: string; user: ChatUser }
  | { type: "note"; key: string; text: string };

const rowHeight = (row: Row): number =>
  row.type === "archive" ? INBOX_ARCHIVE_HEIGHT : row.type === "section" ? INBOX_SECTION_HEIGHT : row.type === "note" ? INBOX_NOTE_HEIGHT : INBOX_ROW_HEIGHT;

export interface ChatInboxProps {
  /** Açılışta "Üye mesajları" süzgeci seçili gelir (messages.view gerekir). */
  admin?: boolean;
  /** Sekme kökünde çizilir: geri oku yoktur, güvenli alanı ekran verir. */
  embedded?: boolean;
  /** Başlıkta "yeni sohbet" ve menüden ÖNCE duran eylemler (ör. bildirim zili). */
  headerActions?: InboxHeaderAction[];
  /** Liste kaydırma olayı (isteğe bağlı dinleyici). */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export function ChatInbox({ admin = false, embedded = false, headerActions, onScroll }: ChatInboxProps) {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const actions = useConversationActions();
  const reduceMotion = useReduceMotion();
  const fab = useFabAutoHide();
  const listRef = useRef<FlatList<Row>>(null);

  const meId = auth.user?.id ?? null;
  const canInbox = auth.isManagement && hasAnyPermission(auth.user, ["messages.view"]);
  const canCalls = auth.isManagement && hasAnyPermission(auth.user, ["messages.calls_view"]);
  const [filter, setFilter] = useState<Filter>(admin && canInbox ? "inbox" : "all");
  const [inboxKind, setInboxKind] = useState<InboxKind>("all");
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ conversation: ChatConversation; inbox: boolean } | null>(null);

  useEffect(() => {
    if (admin && canInbox) setFilter("inbox");
  }, [admin, canInbox]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /* ---------- arama kipi ---------- */
  const openSearch = useCallback(() => {
    setSearching(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);
  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearching(false);
    setSearch("");
    setQuery("");
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);
  // Android geri tuşu: önce aramayı kapatır.
  useEffect(() => {
    if (!searching) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeSearch();
      return true;
    });
    return () => sub.remove();
  }, [closeSearch, searching]);

  /* ---------- veri ---------- */
  const memberQuery = useConversations();
  const inboxQuery = useAdminConversations({ enabled: canInbox });
  const conversations = useMemo(() => memberQuery.data?.conversations ?? [], [memberQuery.data]);
  /** Ortak gelen kutusu: yalnız üyelerin yönetim sohbetleri, gerçek mesajı olanlar. */
  const inboxList = useMemo(
    () =>
      canInbox
        ? (inboxQuery.data?.conversations ?? []).filter((item) => {
            const last = item.last_message as (ChatConversation["last_message"] & { audience?: string | null }) | null;
            return item.type === "management" && item.entity?.kind !== "staff" && Boolean(last) && last?.kind !== "notification" && last?.audience !== "management";
          })
        : [],
    [canInbox, inboxQuery.data],
  );
  const counts = useMemo(() => chatCounts(conversations), [conversations]);
  const inboxUnread = useMemo(() => inboxList.filter(isUnread).length, [inboxList]);
  const byId = useMemo(() => new Map(conversations.map((item) => [item.id, item])), [conversations]);

  const deepSearch = Boolean(auth.user) && searching && query.length >= 2 && filter !== "inbox";
  const hits = useQuery({
    queryKey: ["chat", "search", query] as const,
    queryFn: () => searchMessages(query),
    enabled: deepSearch,
    staleTime: 20_000,
    retry: false,
  });
  const directory = useQuery({
    queryKey: [...queryKeys.chatDirectory(query), "member"] as const,
    queryFn: () => getDirectory(query),
    enabled: deepSearch,
    staleTime: 15_000,
    retry: false,
  });

  const presenceIds = useMemo(() => conversations.filter((item) => item.type === "direct" && item.other_user).map((item) => (item.other_user as NonNullable<ChatConversation["other_user"]>).user_id), [conversations]);

  /** Rehberde adı eşleşen, henüz birebir sohbeti olmayan kişiler. */
  const people = useMemo<ChatUser[]>(() => {
    const data = directory.data;
    if (!deepSearch || !data) return [];
    const known = new Set(presenceIds);
    const seen = new Set<number>();
    const out: ChatUser[] = [];
    [...(data.staff ?? []), ...data.managers, ...data.players, ...(data.members ?? [])].forEach((user) => {
      if (user.user_id === meId || known.has(user.user_id) || seen.has(user.user_id)) return;
      seen.add(user.user_id);
      out.push(user);
    });
    return out.slice(0, MAX_PEOPLE);
  }, [deepSearch, directory.data, meId, presenceIds]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const needle = normalize(query);
    const inboxRows = () =>
      inboxList
        .filter((item) => inboxKind === "all" || (item.entity?.kind ?? "member") === inboxKind)
        .filter((item) => !needle || normalize(`${item.title} ${item.subtitle ?? ""} ${item.entity?.name ?? ""} ${item.last_message?.body ?? ""}`).includes(needle))
        .sort((a, b) => Number(isUnread(b)) - Number(isUnread(a)) || new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime());

    if (searching) {
      if (!needle) return out;
      if (filter === "inbox") {
        const found = inboxRows();
        if (found.length) out.push({ type: "section", key: "s-inbox", title: "Üye mesajları", count: found.length });
        found.forEach((conversation) => out.push({ type: "chat", key: `i${conversation.id}`, conversation, inbox: true }));
        return out;
      }
      const chats = sortChats(conversations).filter((item) => normalize(`${item.title} ${item.subtitle ?? ""} ${item.other_user?.team_name ?? ""} ${item.entity?.name ?? ""}`).includes(needle));
      if (chats.length) {
        out.push({ type: "section", key: "s-chats", title: "Sohbetler", count: chats.length });
        chats.forEach((conversation) => out.push({ type: "chat", key: `p${conversation.id}`, conversation, inbox: false }));
      }
      if (people.length) {
        out.push({ type: "section", key: "s-people", title: "Kişiler", count: people.length });
        people.forEach((user) => out.push({ type: "person", key: `u${user.user_id}`, user }));
      }
      if (query.length >= 2) {
        const found = (hits.data ?? []).slice(0, MAX_HITS);
        if (found.length) {
          out.push({ type: "section", key: "s-hits", title: "Mesajlar", count: found.length });
          found.forEach((hit) => out.push({ type: "hit", key: `h${hit.id}`, hit }));
        } else if (hits.isFetching) out.push({ type: "note", key: "n-hits", text: "Mesajlarda aranıyor…" });
      }
      return out;
    }

    if (filter === "inbox") {
      inboxRows().forEach((conversation) => out.push({ type: "chat", key: `i${conversation.id}`, conversation, inbox: true }));
      return out;
    }
    if (filter === "all" && counts.archive > 0) out.push({ type: "archive", key: "archive", count: counts.archive, unread: counts.archiveUnread });
    filterChats(conversations, filter, "").forEach((conversation) => out.push({ type: "chat", key: `p${conversation.id}`, conversation, inbox: false }));
    return out;
  }, [conversations, counts.archive, counts.archiveUnread, filter, hits.data, hits.isFetching, inboxKind, inboxList, people, query, searching]);

  /* Sabit yükseklikler: satırın konumu ölçmeden bilinir. */
  const headerHeight = searching ? 0 : FILTER_BAR_HEIGHT + (filter === "inbox" ? INBOX_SUB_HEIGHT : 0);
  const offsets = useMemo(() => {
    const out = new Array<number>(rows.length);
    let y = 0;
    rows.forEach((row, index) => {
      out[index] = y;
      y += rowHeight(row);
    });
    return out;
  }, [rows]);
  const getItemLayout = useCallback(
    (data: ArrayLike<Row> | null | undefined, index: number) => ({ length: data?.[index] ? rowHeight(data[index]) : INBOX_ROW_HEIGHT, offset: headerHeight + (offsets[index] ?? 0), index }),
    [headerHeight, offsets],
  );

  const activeQuery = filter === "inbox" ? inboxQuery : memberQuery;
  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
    if (canInbox) void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
  }, [canInbox, queryClient]);
  const refresh = useRefresh(refetch, { refreshing: activeQuery.isRefetching });

  /* ---------- gezinme ---------- */
  const open = useCallback(
    (conversation: ChatConversation, inbox: boolean) => {
      if (inbox) router.push(`/yonetim/sohbet/${conversation.id}` as never);
      else router.push({ pathname: "/sohbet/[id]", params: { id: String(conversation.id) } });
    },
    [router],
  );
  const openHit = useCallback((hit: ChatSearchHit) => router.push({ pathname: "/sohbet/[id]", params: { id: String(hit.conversation_id), mesaj: String(hit.id) } }), [router]);
  const onLongPress = useCallback((conversation: ChatConversation, inbox: boolean) => setRowMenu({ conversation, inbox }), []);
  const compose = useCallback(() => router.push((filter === "inbox" ? "/yonetim/sohbet/yeni" : "/sohbet/yeni") as never), [filter, router]);
  const showArchive = useCallback(() => setFilter("archive"), []);

  const opening = useRef(false);
  const openPerson = useCallback(
    (user: ChatUser) => {
      if (opening.current) return;
      opening.current = true;
      void openConversation({ type: "direct", user_id: user.user_id })
        .then(({ conversation }) => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
          router.push({ pathname: "/sohbet/[id]", params: { id: String(conversation.id) } });
        })
        .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }))
        .finally(() => {
          opening.current = false;
        });
    },
    [queryClient, router, toast],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onScroll?.(event);
      fab.onScroll(event);
    },
    [fab, onScroll],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      switch (item.type) {
        case "archive":
          return <ArchiveRow count={item.count} unread={item.unread} onPress={showArchive} />;
        case "section":
          return <InboxSection title={upperTR(item.title)} count={item.count} />;
        case "note":
          return <InboxNote text={item.text} />;
        case "hit":
          return <HitRow hit={item.hit} conversation={byId.get(item.hit.conversation_id)} query={query} onPress={openHit} />;
        case "person":
          return <PersonRow user={item.user} query={query} onPress={openPerson} />;
        default:
          return <ConversationRow conversation={item.conversation} inbox={item.inbox} meId={meId} onPress={open} onLongPress={onLongPress} />;
      }
    },
    [byId, meId, onLongPress, open, openHit, openPerson, query, showArchive],
  );

  /* ---------- menüler ---------- */
  const markAllRead = useCallback(() => {
    const unread = conversations.filter((item) => !item.archived && isUnread(item));
    unread.forEach((item) => actions.markRead(item));
    toast.show({ message: unread.length ? `${unread.length} sohbet okundu sayıldı.` : "Okunmamış sohbet yok.", tone: "success" });
  }, [actions, conversations, toast]);

  const listMenu: MessageMenuItem[] = [
    { key: "group", label: "Yeni grup", icon: "people-outline", onPress: () => router.push({ pathname: "/sohbet/yeni", params: { sekme: "grup" } }) },
    { key: "starred", label: "Yıldızlı mesajlar", icon: "star-outline", onPress: () => router.push("/sohbet/yildizli" as never) },
    { key: "read", label: "Tümünü okundu say", icon: "checkmark-done-outline", onPress: markAllRead },
    ...(canCalls ? [{ key: "calls", label: "Arama kayıtları", icon: "recording-outline" as const, onPress: () => router.push("/yonetim/kayitlar") }] : []),
    ...(auth.isManagement ? [] : [{ key: "prefs", label: "Kimden mesaj kabul edeyim?", icon: "options-outline" as const, onPress: () => setPrefsOpen(true) }]),
    { key: "blocks", label: "Engellenenler", icon: "ban-outline", onPress: () => router.push("/engellenenler" as never) },
  ];

  const rowMenuItems = useMemo<MessageMenuItem[]>(() => {
    if (!rowMenu) return [];
    const c = rowMenu.conversation;
    if (rowMenu.inbox) {
      return isUnread(c)
        ? [
            {
              key: "read",
              label: "Okundu olarak işaretle",
              icon: "checkmark-done-outline",
              onPress: () =>
                void adminChat
                  .markRead(c.id)
                  .then(() => void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] }))
                  .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" })),
            },
          ]
        : [];
    }
    const items: (MessageMenuItem | false)[] = [
      !c.archived && { key: "pin", label: c.pinned ? "Sabitlemeyi kaldır" : "Sohbeti sabitle", icon: "pin-outline", onPress: () => actions.pin(c) },
      { key: "mute", label: c.muted ? "Bildirimleri aç" : "Sessize al", icon: c.muted ? "notifications-outline" : "notifications-off-outline", onPress: () => actions.mute(c) },
      { key: "archive", label: c.archived ? "Arşivden çıkar" : "Sohbeti arşivle", icon: "archive-outline", onPress: () => actions.archive(c) },
      isUnread(c)
        ? { key: "read", label: "Okundu olarak işaretle", icon: "checkmark-done-outline", onPress: () => actions.markRead(c) }
        : { key: "unread", label: "Okunmadı olarak işaretle", icon: "ellipse", onPress: () => actions.markUnread(c) },
      c.type === "group" && { key: "leave", label: "Gruptan çık", icon: "exit-outline", danger: true, onPress: () => actions.leave(c) },
      !c.is_admin_feed && { key: "delete", label: "Sohbeti sil", icon: "trash-outline", danger: true, onPress: () => actions.remove(c) },
    ];
    return items.filter(Boolean) as MessageMenuItem[];
  }, [actions, queryClient, rowMenu, toast]);

  /* ---------- başlık ve haplar ---------- */
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const barActions = useMemo<InboxHeaderAction[]>(
    () => [
      ...(headerActions ?? []),
      { icon: "create-outline", onPress: compose, accessibilityLabel: "Yeni sohbet" },
      { icon: "ellipsis-vertical", onPress: openMenu, accessibilityLabel: "Mesajlar menüsü: yeni grup, yıldızlı mesajlar, ayarlar" },
    ],
    [compose, headerActions, openMenu],
  );

  const filterItems = useMemo<FilterPillItem<Filter>[]>(() => {
    const items: (FilterPillItem<Filter> | false)[] = [
      { key: "all", label: "Tümü" },
      { key: "unread", label: "Okunmamış", count: counts.unread || undefined },
      (counts.pinned > 0 || filter === "pinned") && { key: "pinned", label: "Sabitlenen", count: counts.pinned || undefined },
      { key: "groups", label: "Gruplar", count: counts.groups || undefined },
      canInbox && { key: "inbox", label: "Üye mesajları", icon: "file-tray-full-outline", count: inboxUnread || undefined },
      (counts.archive > 0 || filter === "archive") && { key: "archive", label: "Arşiv", count: counts.archive || undefined },
    ];
    return items.filter(Boolean) as FilterPillItem<Filter>[];
  }, [canInbox, counts.archive, counts.groups, counts.pinned, counts.unread, filter, inboxUnread]);

  const kindItems = useMemo<FilterPillItem<InboxKind>[]>(
    () =>
      INBOX_KINDS.map(([key, label]) => ({
        key,
        label,
        count: key === "all" ? undefined : inboxList.filter((item) => (item.entity?.kind ?? "member") === key && isUnread(item)).length || undefined,
      })),
    [inboxList],
  );

  const pickFilter = useCallback((next: Filter) => {
    setFilter(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const chips = useMemo(
    () =>
      searching ? null : (
        <View>
          <FilterPills items={filterItems} value={filter} onChange={pickFilter} accessibilityLabel="Sohbet süzgeçleri" />
          {filter === "inbox" ? <FilterPills items={kindItems} value={inboxKind} onChange={setInboxKind} secondary accessibilityLabel="Üye mesajı türü" /> : null}
        </View>
      ),
    [filter, filterItems, inboxKind, kindItems, pickFilter, searching],
  );

  /* ---------- ilk çizim: liste bir kez belirir ---------- */
  const fade = useRef(new Animated.Value(0)).current;
  const ready = !activeQuery.isLoading;
  useEffect(() => {
    if (!ready) return;
    Animated.timing(fade, { toValue: 1, duration: reduceMotion ? duration.instant : duration.base, easing: easing.decelerate, useNativeDriver: true }).start();
  }, [fade, ready, reduceMotion]);

  /* ---------- misafir ---------- */
  if (!auth.user) {
    if (!embedded) return <Redirect href="/giris" />;
    return (
      <View style={styles.pane}>
        <InboxHeader title="Mesajlar" actions={headerActions ?? []} searchable={false} searching={false} value="" placeholder="" onChangeText={setSearch} onOpenSearch={openSearch} onCloseSearch={closeSearch} />
        <EmptyState
          icon="chatbubbles-outline"
          title="Mesajların hesabına bağlı"
          body="Yönetimle, takımınla ve takım arkadaşlarınla yazışmak için giriş yap."
          action={{ label: "Giriş yap", onPress: () => router.push("/giris") }}
        />
      </View>
    );
  }

  const searchEmpty = searching && !query;
  const searchBusy = searching && Boolean(query) && (search.trim() !== query || (deepSearch && (hits.isFetching || directory.isFetching)));
  const emptyTitle = searching
    ? "Sonuç bulunamadı"
    : filter === "inbox" ? "Üye mesajı yok"
      : filter === "archive" ? "Arşiv boş"
        : filter === "unread" ? "Okunmamış sohbet yok"
          : filter === "groups" ? "Henüz grup yok"
            : filter === "pinned" ? "Sabitlenen sohbet yok" : "Henüz sohbet yok";
  const emptyBody = searching
    ? "Başka bir ad ya da kelime dene."
    : filter === "inbox" ? "Takım, oyuncu ve üyelerin ElitLig Yönetimi'ne yazdığı mesajlar burada toplanır. Onay bekleyen talepler Talepler'dedir."
      : filter === "all" ? (auth.isManagement ? "Yönetimdeki arkadaşların, takım başkanları, oyuncular ve üyelerle yazışmaya başla." : "Yönetimle, takımınla ve takım arkadaşlarınla yazışmaya başla.")
        : "Bütün sohbetlerine dönmek için Tümü'ne dokun.";

  const empty = searchEmpty ? (
    <EmptyState
      icon="search-outline"
      title={filter === "inbox" ? "Üye mesajlarında ara" : "Sohbet, kişi ya da mesaj ara"}
      body={filter === "inbox" ? "Takım, oyuncu ya da üye adını yaz." : "Ad yaz ya da bir mesajda geçen kelimeyi ara; sonuca dokununca sohbet o mesajda açılır."}
      variant="inline"
    />
  ) : searchBusy ? (
    <InboxNote text="Aranıyor…" />
  ) : (
    <EmptyState
      icon={searching ? "search-outline" : filter === "inbox" ? "file-tray-outline" : filter === "archive" ? "archive-outline" : "chatbubbles-outline"}
      title={emptyTitle}
      body={emptyBody}
      variant={searching ? "inline" : "screen"}
      action={searching ? undefined : filter === "all" ? { label: "Yeni sohbet", onPress: compose } : filter === "inbox" ? undefined : { label: "Tümünü göster", onPress: () => setFilter("all") }}
    />
  );

  const content = (
    <View style={styles.pane}>
      <PresenceBridge userIds={presenceIds} />
      <InboxHeader
        title="Mesajlar"
        onBack={embedded ? undefined : router.back}
        actions={barActions}
        searching={searching}
        value={search}
        placeholder={filter === "inbox" ? "Takım, oyuncu ya da üye ara" : "Sohbetlerde ve mesajlarda ara"}
        onChangeText={setSearch}
        onOpenSearch={openSearch}
        onCloseSearch={closeSearch}
      />
      {activeQuery.isError && rows.length > 0 ? <ErrorState error={activeQuery.error} onRetry={refetch} variant="banner" /> : null}
      {activeQuery.isLoading ? (
        <View style={styles.pane}>
          {chips}
          <InboxSkeleton />
        </View>
      ) : activeQuery.isError && rows.length === 0 && !searching ? (
        <View style={styles.pane}>
          {chips}
          <ErrorState error={activeQuery.error} onRetry={refetch} />
        </View>
      ) : (
        <Animated.View style={[styles.pane, { opacity: fade }]}>
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={keyOf}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            onScroll={handleScroll}
            scrollEventThrottle={32}
            contentContainerStyle={styles.list}
            refreshControl={searching ? undefined : refresh.control}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={50}
            windowSize={9}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={chips}
            ListEmptyComponent={empty}
          />
        </Animated.View>
      )}
      <InboxFab visible={fab.visible && !searching} bottom={(embedded ? 0 : insets.bottom) + space.lg} onPress={compose} />
      <ActionMenu visible={menuOpen} title="Mesajlar" items={listMenu} onClose={() => setMenuOpen(false)} />
      <ActionMenu visible={Boolean(rowMenu) && rowMenuItems.length > 0} title={rowMenu?.conversation.title} items={rowMenuItems} onClose={() => setRowMenu(null)} />
      {auth.isManagement ? null : <ChatPrefsSheet visible={prefsOpen} onClose={() => setPrefsOpen(false)} />}
    </View>
  );

  if (embedded) return content;
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {content}
    </SafeAreaView>
  );
}

const keyOf = (item: Row) => item.key;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pane: { flex: 1 },
  /* Alt boşluk: son satır yüzen düğmenin altında kalmasın. */
  list: { paddingBottom: space.giant * 2, flexGrow: 1 },
});
