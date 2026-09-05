/**
 * SOHBET — tek bir konuşmanın penceresi (WhatsApp mantığı).
 *
 * Balonlar: üyenin yazdığı sağda marka renginde; karşı taraf solda. Grup ve
 * takım sohbetlerinde gönderen adı balonun üstünde durur. Yönetim sohbetinde
 * bildirimler kart olarak gelir ve altındaki düğmeler ilgili ekrana götürür
 * ("Savunma Yap" → /ceza/[id], "Teklifi Aç" → /teklif/[id]...). Arama
 * kayıtları ortada ince bir çip olarak görünür.
 *
 * GÖNDERİM İYİMSERDİR: mesaj önce önbelleğe yazılır (client_id ile), istek
 * arkada gider; soketten gelen gerçek mesaj aynı client_id'yi bulup yerine
 * geçer. Hata olursa balon "gönderilemedi" işareti alır ve dokununca yeniden
 * denenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SkeletonListRow,
  Touchable,
  errorMessage,
  useToast,
  withAlpha,
} from "@/components/ui";
import { setActiveChatConversation, useConversationMessages } from "@/hooks/useChat";
import {
  deleteMessage,
  getMessages,
  makeClientId,
  markConversationRead,
  sendMessage,
  type ChatAction,
  type ChatMessage,
  type ConversationsResponse,
  type MessagesResponse,
} from "@/lib/api/chat";
import { CHAT_EVENTS, emitTyping, onChatEvent } from "@/lib/chatSocket";
import { formatDayHeading } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useCall } from "@/providers/CallProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type Entry =
  | { kind: "date"; key: string; label: string }
  | { kind: "message"; key: string; message: ChatMessage; showSender: boolean };

const entryKey = (item: Entry) => item.key;

function clockLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  penalty: "shield",
  transfer: "swap-horizontal",
  contract: "document-text",
  invite: "people",
  match_request: "calendar",
  account: "person-circle",
  award: "star",
  general: "notifications",
};

function buildEntries(messages: ChatMessage[], grouped: boolean): Entry[] {
  const entries: Entry[] = [];
  let lastDay = "";
  messages.forEach((message, index) => {
    const key = dayKey(message.created_at);
    if (key && key !== lastDay) {
      lastDay = key;
      entries.push({ kind: "date", key: `gun-${key}`, label: formatDayHeading(message.created_at) });
    }
    const previous = messages[index - 1];
    const showSender =
      grouped &&
      !message.sender.is_me &&
      message.kind === "text" &&
      (!previous || previous.sender.user_id !== message.sender.user_id || previous.kind !== "text");
    entries.push({ kind: "message", key: `msg-${message.id}`, message, showSender });
  });
  return entries;
}

export default function ChatRoomScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const call = useCall();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<Entry>>(null);

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const conversationId = Number(rawId);

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const lastTypingSent = useRef(0);

  // Kökteki soket köprüsü bu sohbeti "açık" sayar: gelen mesaj okunmamış
  // sayacını artırmaz, doğrudan okundu bildirilir.
  useEffect(() => {
    setActiveChatConversation(conversationId);
    return () => setActiveChatConversation(null);
  }, [conversationId]);
  const query = useConversationMessages(conversationId);
  const conversation = query.data?.conversation ?? null;
  const grouped = conversation ? conversation.type === "team" || conversation.type === "group" : false;
  const entries = useMemo(() => buildEntries(query.data?.messages ?? [], grouped), [grouped, query.data?.messages]);

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.chatMessages(conversationId) });
  }, [conversationId, queryClient]);

  /* ---------- okundu işaretle ---------- */
  const messageCount = query.data?.messages.length ?? 0;
  useEffect(() => {
    if (!conversation || messageCount === 0) return;
    queryClient.setQueryData<ConversationsResponse>(queryKeys.chatConversations(), (previous) =>
      previous
        ? {
            conversations: previous.conversations.map((item) => (item.id === conversationId ? { ...item, unread: 0 } : item)),
            unread: previous.conversations.reduce((sum, item) => sum + (item.id === conversationId ? 0 : item.unread), 0),
          }
        : previous,
    );
    void markConversationRead(conversationId)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.chatUnread() }))
      .catch(() => {});
  }, [conversation, conversationId, messageCount, queryClient]);

  /* ---------- yazıyor… ---------- */
  useEffect(() => {
    const off = onChatEvent<{ conversation_id: number; name: string; typing: boolean }>(CHAT_EVENTS.TYPING, (payload) => {
      if (payload.conversation_id !== conversationId) return;
      setTypingName(payload.typing ? payload.name : null);
    });
    return off;
  }, [conversationId]);
  useEffect(() => {
    if (!typingName) return;
    const timer = setTimeout(() => setTypingName(null), 4_000);
    return () => clearTimeout(timer);
  }, [typingName]);

  const onDraft = useCallback(
    (value: string) => {
      setDraft(value);
      const now = Date.now();
      if (value.trim() && now - lastTypingSent.current > 2_500) {
        emitTyping(conversationId, true);
        lastTypingSent.current = now;
      }
    },
    [conversationId],
  );

  /* ---------- gönderim (iyimser) ---------- */
  const send = useMutation({
    mutationFn: ({ text, clientId, replyToId }: { text: string; clientId: string; replyToId: number | null }) =>
      sendMessage(conversationId, { body: text, client_id: clientId, reply_to_id: replyToId }),
    onMutate: async ({ text, clientId, replyToId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.chatMessages(conversationId) });
      const optimistic: ChatMessage = {
        id: -Date.now(),
        public_id: clientId,
        conversation_id: conversationId,
        kind: "text",
        body: text,
        meta: null,
        client_id: clientId,
        sender: { user_id: auth.user?.id ?? null, name: auth.user?.fullName ?? auth.user?.username ?? "Sen", avatar: null, is_me: true, is_management: false },
        reply_to: replyTo && replyTo.id === replyToId ? { id: replyTo.id, body: replyTo.body, kind: replyTo.kind, sender_name: replyTo.sender.name } : null,
        deleted: false,
        edited_at: null,
        created_at: new Date().toISOString(),
        pending: true,
      };
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
        previous ? { ...previous, messages: [...previous.messages, optimistic] } : previous,
      );
    },
    onSuccess: ({ message }, { clientId }) => {
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
        previous
          ? { ...previous, messages: previous.messages.map((item) => (item.client_id === clientId && item.pending ? message : item)) }
          : previous,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
    },
    onError: (error, { clientId }) => {
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
        previous
          ? { ...previous, messages: previous.messages.map((item) => (item.client_id === clientId ? { ...item, pending: false, failed: true } : item)) }
          : previous,
      );
      toast.show({ message: errorMessage(error), tone: "danger" });
    },
  });

  const canSend = draft.trim().length > 0 && Boolean(conversation);
  const handleSend = useCallback(() => {
    if (!canSend) return;
    send.mutate({ text: draft.trim(), clientId: makeClientId(), replyToId: replyTo?.id ?? null });
    setDraft("");
    setReplyTo(null);
    emitTyping(conversationId, false);
    lastTypingSent.current = 0;
  }, [canSend, conversationId, draft, replyTo?.id, send]);

  const retry = useCallback(
    (message: ChatMessage) => {
      if (!message.failed || !message.body) return;
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
        previous ? { ...previous, messages: previous.messages.filter((item) => item.client_id !== message.client_id) } : previous,
      );
      send.mutate({ text: message.body, clientId: message.client_id ?? makeClientId(), replyToId: message.reply_to?.id ?? null });
    },
    [conversationId, queryClient, send],
  );

  /* ---------- eski mesajlar ---------- */
  const hasMore = Boolean(query.data?.has_more);
  const loadOlder = useCallback(async () => {
    const first = query.data?.messages[0];
    if (!first || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const older = await getMessages(conversationId, { before: first.id, limit: 50 });
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
        previous ? { ...previous, has_more: older.has_more, messages: [...older.messages, ...previous.messages] } : previous,
      );
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: "danger" });
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder, query.data?.messages, queryClient, toast]);

  /* ---------- silme ---------- */
  const remove = useCallback(
    (message: ChatMessage) => {
      Alert.alert("Mesajı sil", "Bu mesaj herkes için silinecek.", [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: () => {
            void deleteMessage(conversationId, message.id)
              .then(({ message: updated }) => {
                queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
                  previous ? { ...previous, messages: previous.messages.map((item) => (item.id === message.id ? updated : item)) } : previous,
                );
              })
              .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }));
          },
        },
      ]);
    },
    [conversationId, queryClient, toast],
  );

  const onLongPress = useCallback(
    (message: ChatMessage) => {
      if (message.deleted || message.pending || message.kind !== "text") return;
      const options: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [
        { text: "Yanıtla", onPress: () => setReplyTo(message) },
      ];
      if (message.sender.is_me) options.push({ text: "Sil", style: "destructive", onPress: () => remove(message) });
      options.push({ text: "Vazgeç", style: "cancel" });
      Alert.alert("Mesaj", message.body ?? "", options);
    },
    [remove],
  );

  const runAction = useCallback(
    (action: ChatAction) => {
      if (action.mobile) router.push(action.mobile as never);
    },
    [router],
  );

  /* ---------- kaydırma ---------- */
  const entryCount = entries.length;
  useEffect(() => {
    if (entryCount === 0) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(timer);
  }, [entryCount]);

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => {
      if (item.kind === "date") return <DaySeparator label={item.label} />;
      const { message } = item;
      if (message.kind === "notification") return <NotificationCard message={message} onAction={runAction} />;
      if (message.kind === "call") return <CallChip message={message} />;
      if (message.kind === "system") return <SystemChip text={message.body ?? ""} />;
      return <Bubble message={message} showSender={item.showSender} onLongPress={onLongPress} onRetry={retry} />;
    },
    [onLongPress, retry, runAction],
  );

  if (!auth.user) return <Redirect href="/giris" />;

  const headerSubtitle = typingName
    ? conversation?.type === "direct"
      ? "yazıyor…"
      : `${typingName} yazıyor…`
    : conversation?.subtitle ?? "";

  const headerActions = conversation?.can_call
    ? [{ icon: "call" as const, onPress: () => void call.startCall(conversation), accessibilityLabel: "Sesli ara" }]
    : [];

  const header = (
    <ScreenHeader
      title={conversation?.title ?? "Sohbet"}
      subtitle={headerSubtitle}
      back
      actions={headerActions}
    />
  );

  if (!conversation) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        {query.isLoading ? (
          <View style={styles.skeleton}>
            <SkeletonListRow count={6} avatar={false} />
          </View>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={refetch} />
        ) : (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="Sohbet bulunamadı"
            body="Bu sohbet silinmiş ya da başka bir hesaba ait olabilir."
            action={{ label: "Mesajlara dön", onPress: () => router.replace("/sohbet" as never) }}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {header}

        {query.isError ? <ErrorState error={query.error} onRetry={refetch} variant="banner" style={styles.banner} /> : null}

        <FlatList
          ref={listRef}
          data={entries}
          keyExtractor={entryKey}
          renderItem={renderItem}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          initialNumToRender={24}
          windowSize={10}
          ListHeaderComponent={
            hasMore ? (
              <View style={styles.olderWrap}>
                <Button label="Önceki mesajlar" variant="ghost" size="sm" icon="arrow-up" onPress={() => void loadOlder()} loading={loadingOlder} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <SystemChip
              text={
                conversation.type === "management"
                  ? "Bildirimlerin ve yönetimle yazışmaların burada birikir."
                  : "Bu sohbette henüz mesaj yok. İlk mesajı sen yaz."
              }
              icon="lock-closed"
            />
          }
        />

        {replyTo ? (
          <View style={styles.replyBar}>
            <View style={styles.replyBody}>
              <Text style={styles.replyName} numberOfLines={1} {...textScale.dense}>
                {replyTo.sender.name ?? "Üye"}
              </Text>
              <Text style={styles.replyText} numberOfLines={1} {...textScale.dense}>
                {replyTo.body}
              </Text>
            </View>
            <Touchable feedback="icon" onPress={() => setReplyTo(null)} accessibilityLabel="Yanıtlamayı iptal et" style={styles.replyClose}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Touchable>
          </View>
        ) : null}

        <View style={styles.composer}>
          <Input
            value={draft}
            onChangeText={onDraft}
            placeholder={conversation.type === "management" ? "Yönetime mesaj yaz…" : "Mesaj yaz…"}
            multiline
            maxLength={8000}
            containerStyle={styles.composerInput}
            accessibilityLabel="Mesaj metni"
          />
          <Touchable
            feedback="button"
            haptic="medium"
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Gönder"
            accessibilityState={{ disabled: !canSend }}
            style={[styles.send, canSend ? null : styles.sendDisabled]}
          >
            <Ionicons name="send" size={17} color={canSend ? colors.textOnBrand : colors.textDisabled} />
          </Touchable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════ PARÇALAR ════════════════════════════ */

const DaySeparator = memo(function DaySeparator({ label }: { label: string }) {
  return (
    <View style={styles.dayRow}>
      <View style={styles.dayPill}>
        <Text style={styles.dayLabel} {...textScale.badge}>
          {label}
        </Text>
      </View>
    </View>
  );
});

const SystemChip = memo(function SystemChip({ text, icon }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.chipRow}>
      <View style={styles.chip}>
        {icon ? <Ionicons name={icon} size={12} color={colors.textTertiary} /> : null}
        <Text style={styles.chipText} {...textScale.dense}>
          {text}
        </Text>
      </View>
    </View>
  );
});

const CallChip = memo(function CallChip({ message }: { message: ChatMessage }) {
  const ok = message.meta?.call?.status === "ended";
  return (
    <View style={styles.chipRow}>
      <View style={styles.chip}>
        <Ionicons name={ok ? "call" : "call-outline"} size={13} color={ok ? colors.win : colors.danger} />
        <Text style={[styles.chipText, ok ? null : styles.chipDanger]} {...textScale.dense}>
          {message.body ?? "Sesli arama"}
        </Text>
        <Text style={styles.chipTime} {...textScale.badge}>
          {clockLabel(message.created_at)}
        </Text>
      </View>
    </View>
  );
});

const NotificationCard = memo(function NotificationCard({
  message,
  onAction,
}: {
  message: ChatMessage;
  onAction: (action: ChatAction) => void;
}) {
  const meta = message.meta ?? {};
  const lines = String(message.body ?? "").split("\n");
  const title = meta.notification?.title ?? lines[0];
  const rest = lines.slice(1).join("\n").trim();
  const category = meta.notification?.category ?? "general";
  const actions = (meta.actions ?? []).filter((action) => action && action.mobile);
  return (
    <View style={[styles.bubble, styles.bubbleTheirs, styles.card]}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Ionicons name={CATEGORY_ICON[category] ?? CATEGORY_ICON.general} size={16} color={colors.brandAccent} />
        </View>
        <Text style={styles.cardTitle} {...textScale.long}>
          {title}
        </Text>
      </View>
      {rest ? (
        <Text style={styles.bubbleText} {...textScale.long}>
          {rest}
        </Text>
      ) : null}
      {actions.length ? (
        <View style={styles.cardActions}>
          {actions.map((action, index) => (
            <Button
              key={action.key ?? `${index}`}
              label={action.label}
              size="sm"
              variant={action.style === "primary" || index === 0 ? "primary" : "secondary"}
              onPress={() => onAction(action)}
            />
          ))}
        </View>
      ) : null}
      <Text style={styles.stamp} {...textScale.badge}>
        {clockLabel(message.created_at)}
      </Text>
    </View>
  );
});

const Bubble = memo(function Bubble({
  message,
  showSender,
  onLongPress,
  onRetry,
}: {
  message: ChatMessage;
  showSender: boolean;
  onLongPress: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
}) {
  const mine = message.sender.is_me;
  return (
    <Touchable
      feedback="none"
      haptic="none"
      onLongPress={() => onLongPress(message)}
      onPress={message.failed ? () => onRetry(message) : undefined}
      delayLongPress={280}
      accessibilityRole="text"
      style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, message.pending ? styles.bubbleSending : null, message.failed ? styles.bubbleFailed : null]}
    >
      {showSender ? (
        <Text style={styles.sender} numberOfLines={1} {...textScale.dense}>
          {message.sender.name ?? "Üye"}
        </Text>
      ) : null}
      {!mine && message.sender.is_management ? (
        <View style={styles.senderRow}>
          <Ionicons name="shield-checkmark" size={11} color={colors.brandAccent} />
          <Text style={styles.sender} numberOfLines={1} {...textScale.dense}>
            ElitLig Yönetimi
          </Text>
        </View>
      ) : null}
      {message.reply_to ? (
        <View style={[styles.quote, mine ? styles.quoteMine : null]}>
          <Text style={[styles.quoteName, mine ? styles.quoteNameMine : null]} numberOfLines={1} {...textScale.dense}>
            {message.reply_to.sender_name ?? "Üye"}
          </Text>
          <Text style={[styles.quoteText, mine ? styles.quoteTextMine : null]} numberOfLines={1} {...textScale.dense}>
            {message.reply_to.body ?? "Mesaj"}
          </Text>
        </View>
      ) : null}
      <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : null, message.deleted ? styles.deletedText : null]} {...textScale.long}>
        {message.deleted ? "Bu mesaj silindi" : message.body}
      </Text>
      <View style={styles.stampRow}>
        <Text style={[styles.stamp, mine ? styles.stampMine : null]} {...textScale.badge}>
          {message.failed ? "Gönderilemedi · dokun ve tekrar dene" : message.pending ? "Gönderiliyor…" : clockLabel(message.created_at)}
        </Text>
        {mine && !message.deleted ? (
          <Ionicons
            name={message.failed ? "alert-circle" : message.pending ? "time-outline" : "checkmark-done"}
            size={12}
            color={message.failed ? colors.danger : withAlpha(colors.textOnBrand, 0.8)}
          />
        ) : null}
      </View>
    </Touchable>
  );
});

/* ═════════════════════════════ STİLLER ════════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  banner: { marginHorizontal: layout.screenPadding, marginBottom: space.sm },
  thread: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.md,
    gap: space.sm,
  },
  olderWrap: { alignItems: "center", paddingBottom: space.sm },
  dayRow: { alignItems: "center", paddingVertical: space.xs },
  dayPill: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  dayLabel: { ...type.micro, color: colors.textSecondary },
  chipRow: { alignItems: "center", paddingVertical: space.xxs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    maxWidth: "92%",
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  chipText: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  chipDanger: { color: colors.danger },
  chipTime: { ...type.micro, color: colors.textTertiary },

  bubble: { maxWidth: "86%", borderRadius: radius.lg, padding: space.md },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.brand, borderBottomRightRadius: radius.xs },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: colors.surface2, borderBottomLeftRadius: radius.xs },
  bubbleSending: { opacity: 0.72 },
  bubbleFailed: { borderWidth: 1, borderColor: colors.danger },
  senderRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: space.xxs },
  sender: { ...type.micro, color: colors.brandAccent, marginBottom: space.xxs },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.brandAccent,
    borderRadius: radius.xs,
    backgroundColor: withAlpha(colors.textPrimary, 0.06),
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    marginBottom: space.xs,
    gap: space.px,
  },
  quoteMine: { backgroundColor: withAlpha(colors.textOnBrand, 0.16), borderLeftColor: colors.textOnBrand },
  quoteName: { ...type.micro, color: colors.brandAccent },
  quoteNameMine: { color: colors.textOnBrand },
  quoteText: { ...type.caption, color: colors.textSecondary },
  quoteTextMine: { color: withAlpha(colors.textOnBrand, 0.85) },
  bubbleText: { ...type.bodySm, color: colors.textPrimary },
  bubbleTextMine: { color: colors.textOnBrand },
  deletedText: { fontStyle: "italic", color: colors.textTertiary },
  stampRow: { flexDirection: "row", alignItems: "center", gap: space.xxs, alignSelf: "flex-end", marginTop: space.xs },
  stamp: { ...type.micro, color: colors.textTertiary },
  stampMine: { color: withAlpha(colors.textOnBrand, 0.72) },

  card: { maxWidth: "92%", borderLeftWidth: 3, borderLeftColor: colors.brand, gap: space.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cardIcon: { width: 30, height: 30, borderRadius: radius.sm, backgroundColor: colors.brandDim, alignItems: "center", justifyContent: "center" },
  cardTitle: { ...type.h4, color: colors.textPrimary, flex: 1 },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },

  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: layout.screenPadding,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  replyBody: { flex: 1, minWidth: 0 },
  replyName: { ...type.micro, color: colors.brandAccent },
  replyText: { ...type.caption, color: colors.textSecondary },
  replyClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    backgroundColor: colors.surface1,
  },
  composerInput: { flex: 1 },
  send: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  sendDisabled: { backgroundColor: colors.surface3 },
});
