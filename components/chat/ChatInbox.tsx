/**
 * SOHBETLER — WhatsApp düzeninde sohbet listesi (web ve masaüstü Mesajlar ile
 * aynı görünüm ve süzgeçler).
 *
 *   · Satır: avatar (birebirde çevrimiçi noktası), ad, saat; altta yazıyor… /
 *     Taslak: / tik + gönderen öneki + son mesaj; sağda sessiz, sabit, okunmamış
 *     sayacı (ya da "okunmadı" noktası).
 *   · Süzgeçler: Tümü · Okunmamış · Sabitlenen · Gruplar · Üye mesajları
 *     (messages.view) · Arşiv; "Arşivlenmiş" satırı listenin başında.
 *   · Arama: sohbet adlarında ve (2+ harf) tüm sohbetlerin MESAJLARINDA; mesaj
 *     sonucuna dokununca sohbet o mesajda açılır.
 *   · Uzun bas: sabitle, sessize al, arşivle, okundu / okunmadı, gruptan çık, sil.
 *     (Kaydırma hareketi yok: gesture-handler kurulu değil; aynı eylemler uzun
 *     basma menüsündedir.)
 *   · Sağ altta yüzen "yeni sohbet" düğmesi; menüde yeni grup, yıldızlı
 *     mesajlar, tümünü okundu say, mesaj tercihleri, engellenenler.
 *
 * ÜYE MESAJLARI: üyelerin "ElitLig Yönetimi" sohbetleri ortak gelen kutusudur
 * (/api/admin/chat); Takımlar / Oyuncular / Üyeler alt süzgeci. Eski talep
 * kartıyla biten ve ekip (staff) sohbetleri burada listelenmez — ekip
 * sohbetleri zaten kişisel listededir (masaüstü `inboxThreads` kuralı).
 *
 * PERFORMANS: satır `memo`dur; yazıyor… ve taslak durumunu satır KENDİ okur
 * (useSyncExternalStore), bir sohbette yazma olayı listeyi yeniden çizmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { TypingLine } from "@/components/chat/ChatHeader";
import { ChatPrefsSheet } from "@/components/chat/ChatPrefsSheet";
import { Ticks } from "@/components/chat/MessageBubble";
import { ActionMenu, ChatAvatar, type MessageMenuItem } from "@/components/chat/MessageSheets";
import { useConversationActions } from "@/components/chat/useConversationActions";
import { Chip, ChipGroup, EmptyState, ErrorState, FAB, Input, ScreenHeader, SkeletonListRow, Touchable, errorMessage, useFabAutoHide, useHeaderScroll, useRefresh, useToast } from "@/components/ui";
import { useAdminConversations, useConversations, usePresence, useTypingNames } from "@/hooks/useChat";
import { hasAnyPermission } from "@/lib/admin/access";
import { adminChat, searchMessages, type ChatConversation, type ChatSearchHit } from "@/lib/api/chat";
import { useDraft } from "@/lib/chatDrafts";
import { chatCounts, chatPreview, filterChats, isGroupChat, isUnread, listTime, messageSummary, tickStatus, type ChatFilter } from "@/lib/chatUtils";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type Filter = ChatFilter | "inbox";
type InboxKind = "all" | "team" | "player" | "member";

const INBOX_KINDS: [InboxKind, string][] = [["all", "Tümü"], ["team", "Takımlar"], ["player", "Oyuncular"], ["member", "Üyeler"]];
const KIND_LABEL: Record<string, string> = { team: "Takım", player: "Oyuncu", member: "Üye", general: "Genel", staff: "Yönetim ekibi" };
const normalize = (value: string) => value.toLocaleLowerCase("tr-TR");

type Row =
  | { type: "archive"; key: string; count: number; unread: number }
  | { type: "chat"; key: string; conversation: ChatConversation; inbox: boolean }
  | { type: "section"; key: string; title: string }
  | { type: "hit"; key: string; hit: ChatSearchHit }
  | { type: "note"; key: string; text: string };

export interface ChatInboxProps {
  /** Açılışta "Üye mesajları" süzgeci seçili gelir (messages.view gerekir). */
  admin?: boolean;
  /** Başka bir ekranın (Mesajlar sekmesi) içinde, başlıksız çizilir. */
  embedded?: boolean;
  /** Gömülüyken: ekranın daralan başlığına kaydırma bağlantısı. */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export function ChatInbox({ admin = false, embedded = false, onScroll }: ChatInboxProps) {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const actions = useConversationActions();
  const { scrollY, scrollProps } = useHeaderScroll();
  const fab = useFabAutoHide();

  const canInbox = auth.isManagement && hasAnyPermission(auth.user, ["messages.view"]);
  const [filter, setFilter] = useState<Filter>(admin && canInbox ? "inbox" : "all");
  const [inboxKind, setInboxKind] = useState<InboxKind>("all");
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

  const hits = useQuery({
    queryKey: ["chat", "search", query] as const,
    queryFn: () => searchMessages(query),
    enabled: Boolean(auth.user) && query.length >= 2 && filter !== "inbox",
    staleTime: 20_000,
    retry: false,
  });

  const presenceIds = useMemo(() => conversations.filter((item) => item.type === "direct" && item.other_user).map((item) => (item.other_user as NonNullable<ChatConversation["other_user"]>).user_id), [conversations]);
  const presence = usePresence(presenceIds);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (filter === "inbox") {
      const needle = normalize(query);
      inboxList
        .filter((item) => inboxKind === "all" || (item.entity?.kind ?? "member") === inboxKind)
        .filter((item) => !needle || normalize(`${item.title} ${item.subtitle ?? ""} ${item.entity?.name ?? ""} ${item.last_message?.body ?? ""}`).includes(needle))
        .sort((a, b) => Number(isUnread(b)) - Number(isUnread(a)) || new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime())
        .forEach((conversation) => out.push({ type: "chat", key: `i${conversation.id}`, conversation, inbox: true }));
      return out;
    }
    if (filter === "all" && !query && counts.archive > 0) out.push({ type: "archive", key: "archive", count: counts.archive, unread: counts.archiveUnread });
    filterChats(conversations, filter, query).forEach((conversation) => out.push({ type: "chat", key: `p${conversation.id}`, conversation, inbox: false }));
    if (query.length >= 2) {
      const found = hits.data ?? [];
      if (found.length) {
        out.push({ type: "section", key: "s-hits", title: "MESAJLAR" });
        found.slice(0, 40).forEach((hit) => out.push({ type: "hit", key: `h${hit.id}`, hit }));
      } else if (hits.isFetching) out.push({ type: "note", key: "n-hits", text: "Mesajlarda aranıyor…" });
    }
    return out;
  }, [conversations, counts.archive, counts.archiveUnread, filter, hits.data, hits.isFetching, inboxKind, inboxList, query]);

  const activeQuery = filter === "inbox" ? inboxQuery : memberQuery;
  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
    if (canInbox) void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
  }, [canInbox, queryClient]);
  const refresh = useRefresh(refetch, { refreshing: activeQuery.isRefetching });

  const open = useCallback(
    (conversation: ChatConversation, inbox: boolean, messageId?: number) => {
      if (inbox) router.push(`/yonetim/sohbet/${conversation.id}` as never);
      else router.push({ pathname: "/sohbet/[id]", params: messageId ? { id: String(conversation.id), mesaj: String(messageId) } : { id: String(conversation.id) } });
    },
    [router],
  );
  const openHit = useCallback((hit: ChatSearchHit) => router.push({ pathname: "/sohbet/[id]", params: { id: String(hit.conversation_id), mesaj: String(hit.id) } }), [router]);
  const onLongPress = useCallback((conversation: ChatConversation, inbox: boolean) => setRowMenu({ conversation, inbox }), []);
  const compose = useCallback(() => router.push((filter === "inbox" ? "/yonetim/sohbet/yeni" : "/sohbet/yeni") as never), [filter, router]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (embedded) onScroll?.(event);
      else scrollProps.onScroll(event);
      fab.onScroll(event);
    },
    [embedded, fab, onScroll, scrollProps],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      switch (item.type) {
        case "archive":
          return (
            <Touchable feedback="row" haptic="selection" onPress={() => setFilter("archive")} accessibilityRole="button" accessibilityLabel={`Arşivlenmiş sohbetler, ${item.count} sohbet`} style={styles.archiveRow}>
              <View style={styles.archiveIcon}><Ionicons name="archive-outline" size={20} color={colors.textSecondary} /></View>
              <Text style={styles.archiveLabel} {...textScale.dense}>Arşivlenmiş</Text>
              <Text style={[styles.archiveCount, item.unread ? styles.accent : null]} {...textScale.badge}>{item.unread || item.count}</Text>
            </Touchable>
          );
        case "section":
          return <Text style={styles.section} {...textScale.badge}>{item.title}</Text>;
        case "note":
          return <Text style={styles.note} {...textScale.dense}>{item.text}</Text>;
        case "hit":
          return <HitRow hit={item.hit} onPress={openHit} />;
        default:
          return (
            <ConversationRow
              conversation={item.conversation}
              inbox={item.inbox}
              online={item.conversation.type === "direct" && Boolean(presence[String(item.conversation.other_user?.user_id)]?.online)}
              onPress={open}
              onLongPress={onLongPress}
            />
          );
      }
    },
    [onLongPress, open, openHit, presence],
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

  if (!auth.user && !embedded) return <Redirect href="/giris" />;

  const controls = (
    <View style={[styles.controls, embedded ? styles.controlsEmbedded : null]}>
      <View style={styles.searchRow}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder={filter === "inbox" ? "Takım, oyuncu ya da üye ara" : "Sohbetlerde ve mesajlarda ara"}
          variant="search"
          size="sm"
          leadingIcon="search"
          accessibilityLabel="Sohbetlerde ve mesajlarda ara"
          containerStyle={styles.searchFlex}
        />
        <Touchable feedback="icon" haptic="selection" onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Mesajlar menüsü: yeni grup, yıldızlı mesajlar, ayarlar" style={styles.menuButton}>
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
        </Touchable>
      </View>
      <ChipGroup contentPadding={embedded ? 0 : undefined}>
        <Chip label="Tümü" selected={filter === "all"} onPress={() => setFilter("all")} size="sm" />
        <Chip label="Okunmamış" count={counts.unread || undefined} selected={filter === "unread"} onPress={() => setFilter("unread")} size="sm" />
        {counts.pinned ? <Chip label="Sabitlenen" selected={filter === "pinned"} onPress={() => setFilter("pinned")} size="sm" /> : null}
        <Chip label="Gruplar" selected={filter === "groups"} onPress={() => setFilter("groups")} size="sm" />
        {canInbox ? <Chip label="Üye mesajları" icon="file-tray-full-outline" count={inboxUnread || undefined} selected={filter === "inbox"} onPress={() => setFilter("inbox")} size="sm" /> : null}
        {counts.archive ? <Chip label="Arşiv" selected={filter === "archive"} onPress={() => setFilter("archive")} size="sm" /> : null}
      </ChipGroup>
      {filter === "inbox" ? (
        <ChipGroup contentPadding={embedded ? 0 : undefined}>
          {INBOX_KINDS.map(([key, label]) => {
            const unread = key === "all" ? 0 : inboxList.filter((item) => (item.entity?.kind ?? "member") === key && isUnread(item)).length;
            return <Chip key={key} label={label} count={unread || undefined} selected={inboxKind === key} onPress={() => setInboxKind(key)} size="sm" />;
          })}
        </ChipGroup>
      ) : null}
    </View>
  );

  const emptyTitle = query
    ? "Eşleşen sohbet yok"
    : filter === "inbox" ? "Üye mesajı yok"
      : filter === "archive" ? "Arşiv boş"
        : filter === "unread" ? "Okunmamış sohbet yok"
          : filter === "groups" ? "Henüz grup yok"
            : filter === "pinned" ? "Sabitlenen sohbet yok" : "Henüz sohbet yok";
  const emptyBody = query
    ? "Başka bir ad ya da kelime dene."
    : filter === "inbox" ? "Takım, oyuncu ve üyelerin ElitLig Yönetimi'ne yazdığı mesajlar burada toplanır. Onay bekleyen talepler Talepler'dedir."
      : filter === "all" ? (auth.isManagement ? "Yönetimdeki arkadaşların, takım başkanları, oyuncular ve üyelerle yazışmaya başla." : "Yönetimle, takımınla ve takım arkadaşlarınla yazışmaya başla.")
        : "Bütün sohbetlerine dönmek için Tümü'ne dokun.";

  const body = (
    <>
      {activeQuery.isLoading ? (
        <View style={styles.skeleton}><SkeletonListRow count={8} avatar /></View>
      ) : activeQuery.isError && rows.length === 0 ? (
        <ErrorState error={activeQuery.error} onRetry={refetch} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          onScroll={handleScroll}
          scrollEventThrottle={scrollProps.scrollEventThrottle}
          contentContainerStyle={styles.list}
          refreshControl={refresh.control}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={9}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={activeQuery.isError ? <ErrorState error={activeQuery.error} onRetry={refetch} variant="banner" /> : null}
          ListEmptyComponent={
            <EmptyState
              icon={filter === "inbox" ? "file-tray-outline" : filter === "archive" ? "archive-outline" : "chatbubbles-outline"}
              title={emptyTitle}
              body={emptyBody}
              action={query ? undefined : filter === "all" ? { label: "Yeni sohbet", onPress: compose } : filter === "inbox" ? undefined : { label: "Tümünü göster", onPress: () => setFilter("all") }}
            />
          }
        />
      )}
      <FAB icon="chatbubble-ellipses" visible={fab.visible} offsetBottom={insets.bottom + space.lg} onPress={compose} accessibilityLabel="Yeni sohbet" />
      <ActionMenu visible={menuOpen} title="Mesajlar" items={listMenu} onClose={() => setMenuOpen(false)} />
      <ActionMenu visible={Boolean(rowMenu) && rowMenuItems.length > 0} title={rowMenu?.conversation.title} items={rowMenuItems} onClose={() => setRowMenu(null)} />
      {auth.isManagement ? null : <ChatPrefsSheet visible={prefsOpen} onClose={() => setPrefsOpen(false)} />}
    </>
  );

  if (embedded) {
    return (
      <View style={styles.pane}>
        {controls}
        {body}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Mesajlar" subtitle={counts.unread > 0 ? `${counts.unread} okunmamış sohbet` : undefined} back scrollY={scrollY} bottom={controls} />
      {body}
    </SafeAreaView>
  );
}

/* ---------- sohbet satırı ---------- */

const ConversationRow = memo(function ConversationRow({
  conversation,
  inbox,
  online,
  onPress,
  onLongPress,
}: {
  conversation: ChatConversation;
  inbox: boolean;
  online: boolean;
  onPress: (conversation: ChatConversation, inbox: boolean) => void;
  onLongPress: (conversation: ChatConversation, inbox: boolean) => void;
}) {
  const draft = useDraft(inbox ? 0 : conversation.id);
  const typing = useTypingNames(inbox ? 0 : conversation.id).length > 0;
  const unread = isUnread(conversation);
  const preview = chatPreview(conversation, { inbox });
  const last = conversation.last_message;
  const mineLast = Boolean(last && (last.sender.is_me || (inbox && last.sender.is_management)) && last.kind !== "system" && last.kind !== "call");
  const team = !inbox && conversation.other_user?.team_name && conversation.other_user.team_name !== conversation.title ? conversation.other_user.team_name : null;
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={() => onPress(conversation, inbox)}
      onLongPress={() => onLongPress(conversation, inbox)}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel={`${conversation.title}${conversation.unread > 0 ? `, ${conversation.unread} okunmamış mesaj` : conversation.marked_unread ? ", okunmadı olarak işaretli" : ""}. ${preview.prefix}${preview.text}`}
      accessibilityHint="Sohbet seçenekleri için basılı tut"
      style={styles.row}
    >
      <ChatAvatar conversation={conversation} size={52} online={online} />
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={[styles.title, unread ? styles.titleUnread : null]} numberOfLines={1} {...textScale.dense}>{conversation.title}</Text>
          <Text style={[styles.time, unread ? styles.accent : null]} {...textScale.badge}>{listTime(conversation.last_message_at)}</Text>
        </View>
        <View style={styles.line}>
          {typing ? (
            <TypingLine conversationId={conversation.id} group={isGroupChat(conversation)} fallback="" tone="row" />
          ) : draft ? (
            <Text style={styles.preview} numberOfLines={1} {...textScale.dense}>
              <Text style={styles.draft}>Taslak: </Text>
              {draft}
            </Text>
          ) : (
            <View style={styles.previewRow}>
              {mineLast && !inbox ? <Ticks status={tickStatus(last)} size={15} color={colors.textTertiary} /> : null}
              {preview.icon ? <Ionicons name={preview.icon} size={14} color={colors.textTertiary} /> : null}
              <Text style={[styles.preview, preview.deleted ? styles.previewDeleted : null, unread ? styles.previewUnread : null]} numberOfLines={1} {...textScale.dense}>
                {preview.prefix}
                {preview.text}
              </Text>
            </View>
          )}
          <View style={styles.marks}>
            {conversation.muted ? <Ionicons name="notifications-off" size={14} color={colors.textTertiary} /> : null}
            {conversation.pinned ? <Ionicons name="pin" size={14} color={colors.textTertiary} /> : null}
            {conversation.unread > 0 ? (
              <View style={[styles.badge, conversation.muted ? styles.badgeMuted : null]}>
                <Text style={styles.badgeText} {...textScale.badge}>{conversation.unread > 99 ? "99+" : conversation.unread}</Text>
              </View>
            ) : conversation.marked_unread ? (
              <View style={styles.dot} />
            ) : null}
          </View>
        </View>
        {inbox ? (
          <Text style={styles.kind} numberOfLines={1} {...textScale.dense}>
            {KIND_LABEL[conversation.entity?.kind ?? "member"] ?? "Üye"}
            {conversation.subtitle ? ` · ${conversation.subtitle.replace(/^(Takım|Oyuncu|Üye)\s*·\s*/, "")}` : ""}
          </Text>
        ) : team ? (
          <Text style={styles.kind} numberOfLines={1} {...textScale.dense}>{team}</Text>
        ) : null}
      </View>
    </Touchable>
  );
});

/* ---------- mesaj arama sonucu ---------- */

const HitRow = memo(function HitRow({ hit, onPress }: { hit: ChatSearchHit; onPress: (hit: ChatSearchHit) => void }) {
  const summary = messageSummary(hit);
  return (
    <Touchable feedback="row" haptic="selection" onPress={() => onPress(hit)} accessibilityRole="button" accessibilityLabel={`${hit.conversation_title ?? "Sohbet"}: ${summary.text}`} style={styles.hit}>
      <View style={styles.line}>
        <Text style={styles.hitTitle} numberOfLines={1} {...textScale.dense}>{hit.conversation_title ?? "Sohbet"}</Text>
        <Text style={styles.time} {...textScale.badge}>{listTime(hit.created_at)}</Text>
      </View>
      <View style={styles.previewRow}>
        {summary.icon ? <Ionicons name={summary.icon} size={14} color={colors.textTertiary} /> : null}
        <Text style={styles.preview} numberOfLines={2} {...textScale.dense}>
          {hit.sender.is_me ? "Sen: " : hit.sender.name ? `${hit.sender.name}: ` : ""}
          {summary.text}
        </Text>
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pane: { flex: 1 },
  controls: { gap: space.sm, paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  controlsEmbedded: { paddingTop: space.xs },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  searchFlex: { flex: 1 },
  menuButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  list: { paddingBottom: space.giant * 2, flexGrow: 1 },

  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: layout.screenPadding, minHeight: 72, paddingVertical: space.sm },
  body: { flex: 1, minWidth: 0, gap: space.xxs, paddingBottom: space.xxs, borderBottomWidth: hairline, borderBottomColor: colors.separator, alignSelf: "stretch", justifyContent: "center" },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { ...type.h3, fontSize: type.bodyLg.fontSize, color: colors.textPrimary, flex: 1 },
  titleUnread: { fontFamily: type.h2.fontFamily },
  time: { ...type.numSm, color: colors.textTertiary },
  accent: { color: colors.brandAccent },
  previewRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.xs },
  preview: { ...type.body, color: colors.textSecondary, flex: 1 },
  previewUnread: { color: colors.textPrimary },
  previewDeleted: { fontStyle: "italic" },
  draft: { color: colors.danger, fontFamily: type.label.fontFamily },
  marks: { flexDirection: "row", alignItems: "center", gap: space.xs },
  badge: { minWidth: 22, height: 22, paddingHorizontal: space.s, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  badgeMuted: { backgroundColor: colors.textTertiary },
  badgeText: { ...type.numSmStrong, color: colors.textOnBrand },
  dot: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: colors.brand },
  kind: { ...type.caption, color: colors.textTertiary },

  archiveRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: layout.screenPadding, minHeight: 52 },
  archiveIcon: { width: 52, alignItems: "center" },
  archiveLabel: { ...type.h3, color: colors.textPrimary, flex: 1 },
  archiveCount: { ...type.numSmStrong, color: colors.textTertiary },
  section: { ...type.overline, color: colors.textTertiary, paddingHorizontal: layout.screenPadding, paddingTop: space.lg, paddingBottom: space.xs },
  note: { ...type.bodySm, color: colors.textSecondary, paddingHorizontal: layout.screenPadding, paddingVertical: space.md },
  hit: { paddingHorizontal: layout.screenPadding, paddingVertical: space.sm, gap: space.xxs, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  hitTitle: { ...type.label, color: colors.textPrimary, flex: 1 },
});
