/**
 * SOHBET ODASI — üye (/sohbet/[id]) ve yönetim (/yonetim/sohbet/[id]) ortak.
 *
 * Balonlar: metin, sesli mesaj, konum, maç teklifi (kabul/ret), bildirim kartı
 * (eylem düğmeleri: sayfaya git ya da doğrudan işlem — ör. transfer onayı),
 * arama kaydı (ses kaydı dinlenir). Composer: metin, mikrofonla sesli mesaj,
 * "+" ile konum/saha ve maç teklifi.
 *
 * Yönetim modu: /api/admin/chat uçları; üyenin yönetim sohbetinde yazılanlar
 * üye tarafında "ElitLig Yönetimi" olarak görünür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AttachSheet, type AttachMode } from "@/components/chat/AttachSheet";
import { AudioBubble, CallChip, LocationBubble, MatchOfferBubble, NotificationCard, SystemChip, clockLabel } from "@/components/chat/ChatBubbles";
import { Button, EmptyState, ErrorState, Input, ScreenHeader, SkeletonListRow, Touchable, errorMessage, useToast, withAlpha } from "@/components/ui";
import { setActiveChatConversation, useAdminConversationMessages, useConversationMessages } from "@/hooks/useChat";
import {
  adminChat,
  callAction,
  deleteMessage,
  formatDurationMs,
  getMessages,
  makeClientId,
  markConversationRead,
  resolveAction,
  respondMatchOffer,
  sendMessage,
  uploadAudio,
  type ChatAction,
  type ChatLocationMeta,
  type ChatMessage,
  type ConversationsResponse,
  type MatchOfferInput,
  type MessagesResponse,
  type SendMessageInput,
} from "@/lib/api/chat";
import { useVoiceRecorder } from "@/lib/chatMedia";
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

function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

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
    const showSender = grouped && !message.sender.is_me && ["text", "audio", "location"].includes(message.kind) && (!previous || previous.sender.user_id !== message.sender.user_id || previous.kind !== message.kind);
    entries.push({ kind: "message", key: `msg-${message.id}`, message, showSender });
  });
  return entries;
}

export interface ChatRoomProps {
  conversationId: number;
  admin?: boolean;
}

export function ChatRoom({ conversationId, admin = false }: ChatRoomProps) {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const call = useCall();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<Entry>>(null);
  const recorder = useVoiceRecorder();

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [attach, setAttach] = useState<AttachMode>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [tick, setTick] = useState(0);
  const lastTypingSent = useRef(0);
  const basePath = admin ? "/yonetim/sohbet" : "/sohbet";

  const api = useMemo(
    () =>
      admin
        ? { getMessages: adminChat.getMessages, send: adminChat.sendMessage, read: adminChat.markRead, respond: adminChat.respondMatchOffer, resolve: adminChat.resolveAction }
        : { getMessages, send: sendMessage, read: markConversationRead, respond: respondMatchOffer, resolve: resolveAction },
    [admin],
  );

  useEffect(() => {
    setActiveChatConversation(conversationId);
    return () => setActiveChatConversation(null);
  }, [conversationId]);

  const memberQuery = useConversationMessages(admin ? 0 : conversationId);
  const adminQuery = useAdminConversationMessages(admin ? conversationId : 0);
  const query = admin ? adminQuery : memberQuery;
  const conversation = query.data?.conversation ?? null;
  const grouped = conversation ? conversation.type === "team" || conversation.type === "group" : false;
  const entries = useMemo(() => buildEntries(query.data?.messages ?? [], grouped), [grouped, query.data?.messages]);
  const canWrite = Boolean(conversation) && conversation?.can_write !== false;

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.chatMessages(conversationId) });
  }, [conversationId, queryClient]);

  /* ---------- okundu ---------- */
  const messageCount = query.data?.messages.length ?? 0;
  useEffect(() => {
    if (!conversation || messageCount === 0) return;
    queryClient.setQueryData<ConversationsResponse>(queryKeys.chatConversations(), (previous) =>
      previous
        ? {
            ...previous,
            conversations: previous.conversations.map((item) => (item.id === conversationId ? { ...item, unread: 0 } : item)),
            unread: previous.conversations.reduce((sum, item) => sum + (item.id === conversationId ? 0 : item.unread), 0),
          }
        : previous,
    );
    void api.read(conversationId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chatUnread() });
        if (admin) void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
      })
      .catch(() => {});
  }, [admin, api, conversation, conversationId, messageCount, queryClient]);

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
  // Kayıt süresi göstergesi.
  useEffect(() => {
    if (!recorder.isRecording) return;
    const timer = setInterval(() => setTick((value) => value + 1), 500);
    return () => clearInterval(timer);
  }, [recorder.isRecording]);

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

  /* ---------- gönderim ---------- */
  const applySent = useCallback(
    (message: ChatMessage, clientId?: string) => {
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) => {
        if (!previous) return previous;
        const replaced = clientId ? previous.messages.some((item) => item.client_id === clientId && item.pending) : false;
        const messages = replaced
          ? previous.messages.map((item) => (item.client_id === clientId && item.pending ? message : item))
          : previous.messages.some((item) => item.id === message.id) ? previous.messages : [...previous.messages, message];
        return { ...previous, messages };
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
      if (admin) void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
    },
    [admin, conversationId, queryClient],
  );

  const send = useMutation({
    mutationFn: ({ input }: { input: SendMessageInput; optimistic?: ChatMessage }) => api.send(conversationId, input),
    onMutate: async ({ optimistic }) => {
      if (!optimistic) return;
      await queryClient.cancelQueries({ queryKey: queryKeys.chatMessages(conversationId) });
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
        previous ? { ...previous, messages: [...previous.messages, optimistic] } : previous,
      );
    },
    onSuccess: ({ message }, { input }) => applySent(message, input.client_id),
    onError: (error, { input }) => {
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
        previous
          ? { ...previous, messages: previous.messages.map((item) => (item.client_id === input.client_id ? { ...item, pending: false, failed: true } : item)) }
          : previous,
      );
      toast.show({ message: errorMessage(error), tone: "danger" });
    },
  });

  const canSend = draft.trim().length > 0 && canWrite;
  const handleSend = useCallback(() => {
    if (!canSend) return;
    const clientId = makeClientId();
    const asManagement = admin && conversation?.type === "management";
    const optimistic: ChatMessage = {
      id: -Date.now(),
      public_id: clientId,
      conversation_id: conversationId,
      kind: "text",
      body: draft.trim(),
      meta: null,
      client_id: clientId,
      sender: { user_id: asManagement ? null : auth.user?.id ?? null, name: asManagement ? "ElitLig Yönetimi" : auth.user?.fullName ?? auth.user?.username ?? "Sen", avatar: null, is_me: !asManagement, is_management: asManagement },
      reply_to: replyTo ? { id: replyTo.id, body: replyTo.body, kind: replyTo.kind, sender_name: replyTo.sender.name } : null,
      deleted: false,
      edited_at: null,
      created_at: new Date().toISOString(),
      pending: true,
    };
    send.mutate({ input: { body: draft.trim(), client_id: clientId, reply_to_id: replyTo?.id ?? null }, optimistic });
    setDraft("");
    setReplyTo(null);
    emitTyping(conversationId, false);
    lastTypingSent.current = 0;
  }, [admin, auth.user, canSend, conversation?.type, conversationId, draft, replyTo, send]);

  const sendRich = useCallback(
    async (input: SendMessageInput) => {
      const { message } = await api.send(conversationId, { ...input, client_id: makeClientId() });
      applySent(message);
    },
    [api, applySent, conversationId],
  );

  const retry = useCallback(
    (message: ChatMessage) => {
      if (!message.failed || !message.body) return;
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
        previous ? { ...previous, messages: previous.messages.filter((item) => item.client_id !== message.client_id) } : previous,
      );
      send.mutate({ input: { body: message.body, client_id: message.client_id ?? makeClientId(), reply_to_id: message.reply_to?.id ?? null }, optimistic: { ...message, pending: true, failed: false } });
    },
    [conversationId, queryClient, send],
  );

  /* ---------- sesli mesaj ---------- */
  const toggleRecording = useCallback(async () => {
    try {
      if (recorder.isRecording) {
        const result = await recorder.stop(false);
        if (!result) return;
        setUploading(true);
        const uploaded = await uploadAudio({ uri: result.uri, name: result.name, type: result.mime });
        await sendRich({ kind: "audio", meta: { audio: { url: uploaded.url, duration_ms: result.durationMs, mime: uploaded.mime } } });
      } else {
        await recorder.start();
      }
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: "danger" });
    } finally {
      setUploading(false);
    }
  }, [recorder, sendRich, toast]);

  const cancelRecording = useCallback(() => {
    void recorder.stop(true);
  }, [recorder]);

  /* ---------- eski mesajlar ---------- */
  const hasMore = Boolean(query.data?.has_more);
  const loadOlder = useCallback(async () => {
    const first = query.data?.messages[0];
    if (!first || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const older = await api.getMessages(conversationId, { before: first.id, limit: 50 });
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
        previous ? { ...previous, has_more: older.has_more, messages: [...older.messages, ...previous.messages] } : previous,
      );
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: "danger" });
    } finally {
      setLoadingOlder(false);
    }
  }, [api, conversationId, hasMore, loadingOlder, query.data?.messages, queryClient, toast]);

  /* ---------- silme / yanıt ---------- */
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
      const options: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [{ text: "Yanıtla", onPress: () => setReplyTo(message) }];
      if (message.sender.is_me && !admin) options.push({ text: "Sil", style: "destructive", onPress: () => remove(message) });
      options.push({ text: "Vazgeç", style: "cancel" });
      Alert.alert("Mesaj", message.body ?? "", options);
    },
    [admin, remove],
  );

  /* ---------- kart eylemleri ---------- */
  const runAction = useCallback(
    async (action: ChatAction, message: ChatMessage) => {
      if (action.api) {
        const proceed = () => {
          setBusyKey(action.key);
          void callAction(action)
            .then(() => api.resolve(conversationId, message.id, { key: action.key, label: `${action.label}: tamamlandı` }))
            .then(({ message: updated }) => {
              queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
                previous ? { ...previous, messages: previous.messages.map((item) => (item.id === message.id ? { ...item, meta: updated.meta } : item)) } : previous,
              );
              toast.show({ message: "İşlem tamamlandı.", tone: "success" });
            })
            .catch((error: unknown) => Alert.alert("İşlem yapılamadı", errorMessage(error)))
            .finally(() => setBusyKey(null));
        };
        if (action.api.confirm) {
          Alert.alert(action.label, action.api.confirm, [{ text: "Vazgeç", style: "cancel" }, { text: action.label, style: action.style === "danger" ? "destructive" : "default", onPress: proceed }]);
        } else proceed();
        return;
      }
      if (action.mobile) router.push(action.mobile as never);
    },
    [api, conversationId, queryClient, router, toast],
  );

  const respondOffer = useCallback(
    (message: ChatMessage, response: "accepted" | "rejected") => {
      setBusyKey(`offer-${message.id}`);
      void api.respond(conversationId, message.id, { response })
        .then(({ message: updated }) => {
          queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
            previous ? { ...previous, messages: previous.messages.map((item) => (item.id === message.id ? { ...item, meta: updated.meta } : item)) } : previous,
          );
        })
        .catch((error: unknown) => Alert.alert("Yanıt gönderilemedi", errorMessage(error)))
        .finally(() => setBusyKey(null));
    },
    [api, conversationId, queryClient],
  );

  const onSendLocation = useCallback((location: Partial<ChatLocationMeta>) => sendRich({ kind: "location", meta: { location } }), [sendRich]);
  const onSendOffer = useCallback((offer: MatchOfferInput) => sendRich({ kind: "match_offer", meta: { match_offer: offer } }), [sendRich]);

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
      const canRespondOffer = !message.sender.is_me && !(admin && message.sender.is_management);
      switch (message.kind) {
        case "notification":
          return <NotificationCard message={message} busyKey={busyKey} onAction={(action) => void runAction(action, message)} />;
        case "call":
          return <CallChip message={message} />;
        case "audio":
          return <AudioBubble message={message} showSender={item.showSender} />;
        case "location":
          return <LocationBubble message={message} showSender={item.showSender} />;
        case "match_offer":
          return <MatchOfferBubble message={message} canRespond={canRespondOffer} busy={busyKey === `offer-${message.id}`} onRespond={respondOffer} />;
        case "system":
          return <SystemChip text={message.body ?? ""} />;
        default:
          return <Bubble message={message} showSender={item.showSender} onLongPress={onLongPress} onRetry={retry} />;
      }
    },
    [admin, busyKey, onLongPress, respondOffer, retry, runAction],
  );

  if (!auth.user) return <Redirect href="/giris" />;

  const headerSubtitle = typingName ? (conversation?.type === "direct" ? "yazıyor…" : `${typingName} yazıyor…`) : conversation?.subtitle ?? "";
  const headerActions = conversation?.can_call ? [{ icon: "call" as const, onPress: () => void call.startCall(conversation), accessibilityLabel: "Sesli ara" }] : [];
  const header = <ScreenHeader title={conversation?.title ?? "Sohbet"} subtitle={headerSubtitle} back actions={headerActions} />;

  if (!conversation) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        {query.isLoading ? (
          <View style={styles.skeleton}><SkeletonListRow count={6} avatar={false} /></View>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={refetch} />
        ) : (
          <EmptyState icon="chatbubble-ellipses-outline" title="Sohbet bulunamadı" body="Bu sohbet silinmiş ya da erişiminiz dışında olabilir." action={{ label: "Mesajlara dön", onPress: () => router.replace(basePath as never) }} />
        )}
      </SafeAreaView>
    );
  }

  const emptyText = conversation.type === "management"
    ? admin ? "Üyenin bildirimleri ve yazışması burada birikir." : "Bildirimlerin ve yönetimle yazışmaların burada birikir."
    : conversation.type === "admin" ? "Onay bekleyen işlemler burada kart olarak görünür." : "Bu sohbette henüz mesaj yok. İlk mesajı sen yaz.";
  // `tick` yalnız yeniden çizim için; süre kaydedicinin kendi saatinden okunur.
  const elapsedLabel = formatDurationMs(recorder.durationMs || recorder.elapsedMs);
  void tick;

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
          ListHeaderComponent={hasMore ? <View style={styles.olderWrap}><Button label="Önceki mesajlar" variant="ghost" size="sm" icon="arrow-up" onPress={() => void loadOlder()} loading={loadingOlder} /></View> : null}
          ListEmptyComponent={<SystemChip text={emptyText} icon="lock-closed" />}
        />

        {replyTo ? (
          <View style={styles.replyBar}>
            <View style={styles.replyBody}>
              <Text style={styles.replyName} numberOfLines={1} {...textScale.dense}>{replyTo.sender.name ?? "Üye"}</Text>
              <Text style={styles.replyText} numberOfLines={1} {...textScale.dense}>{replyTo.body}</Text>
            </View>
            <Touchable feedback="icon" onPress={() => setReplyTo(null)} accessibilityLabel="Yanıtlamayı iptal et" style={styles.replyClose}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Touchable>
          </View>
        ) : null}

        {canWrite ? (
          recorder.isRecording ? (
            <View style={styles.composer}>
              <Touchable feedback="icon" haptic="light" onPress={cancelRecording} accessibilityLabel="Kaydı iptal et" style={styles.roundGhost}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Touchable>
              <View style={styles.recordingInfo}>
                <View style={styles.recDot} />
                <Text style={styles.recordingText} {...textScale.dense}>Kaydediliyor · {elapsedLabel}</Text>
              </View>
              <Touchable feedback="button" haptic="medium" onPress={() => void toggleRecording()} accessibilityRole="button" accessibilityLabel="Sesli mesajı gönder" style={styles.send}>
                <Ionicons name="send" size={17} color={colors.textOnBrand} />
              </Touchable>
            </View>
          ) : (
            <View style={styles.composer}>
              <Touchable feedback="icon" haptic="light" onPress={() => setAttach("menu")} accessibilityLabel="Ek gönder" style={styles.roundGhost}>
                <Ionicons name="add" size={22} color={colors.textSecondary} />
              </Touchable>
              <Input
                value={draft}
                onChangeText={onDraft}
                placeholder={conversation.type === "management" ? (admin ? "Yönetim adına yaz…" : "Yönetime mesaj yaz…") : "Mesaj yaz…"}
                multiline
                maxLength={8000}
                containerStyle={styles.composerInput}
                accessibilityLabel="Mesaj metni"
              />
              {draft.trim() ? (
                <Touchable feedback="button" haptic="medium" onPress={handleSend} accessibilityRole="button" accessibilityLabel="Gönder" style={styles.send}>
                  <Ionicons name="send" size={17} color={colors.textOnBrand} />
                </Touchable>
              ) : (
                <Touchable feedback="button" haptic="medium" onPress={() => void toggleRecording()} disabled={uploading || recorder.busy} accessibilityRole="button" accessibilityLabel="Sesli mesaj kaydet" style={[styles.send, styles.mic]}>
                  <Ionicons name={uploading ? "cloud-upload-outline" : "mic"} size={18} color={colors.textOnBrand} />
                </Touchable>
              )}
            </View>
          )
        ) : null}
      </KeyboardAvoidingView>

      <AttachSheet mode={attach} onChangeMode={setAttach} conversation={conversation} admin={admin} onSendLocation={onSendLocation} onSendOffer={onSendOffer} />
    </SafeAreaView>
  );
}

/* ---------- parçalar ---------- */

const DaySeparator = memo(function DaySeparator({ label }: { label: string }) {
  return (
    <View style={styles.dayRow}>
      <View style={styles.dayPill}><Text style={styles.dayLabel} {...textScale.badge}>{label}</Text></View>
    </View>
  );
});

const Bubble = memo(function Bubble({ message, showSender, onLongPress, onRetry }: { message: ChatMessage; showSender: boolean; onLongPress: (message: ChatMessage) => void; onRetry: (message: ChatMessage) => void }) {
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
      {showSender ? <Text style={styles.sender} numberOfLines={1} {...textScale.dense}>{message.sender.name ?? "Üye"}</Text> : null}
      {!mine && message.sender.is_management ? (
        <View style={styles.senderRow}>
          <Ionicons name="shield-checkmark" size={11} color={colors.brandAccent} />
          <Text style={styles.sender} numberOfLines={1} {...textScale.dense}>ElitLig Yönetimi</Text>
        </View>
      ) : null}
      {message.reply_to ? (
        <View style={[styles.quote, mine ? styles.quoteMine : null]}>
          <Text style={[styles.quoteName, mine ? styles.quoteNameMine : null]} numberOfLines={1} {...textScale.dense}>{message.reply_to.sender_name ?? "Üye"}</Text>
          <Text style={[styles.quoteText, mine ? styles.quoteTextMine : null]} numberOfLines={1} {...textScale.dense}>{message.reply_to.body ?? "Mesaj"}</Text>
        </View>
      ) : null}
      <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : null, message.deleted ? styles.deletedText : null]} {...textScale.long}>
        {message.deleted ? "Bu mesaj silindi" : message.body}
      </Text>
      <View style={styles.stampRow}>
        <Text style={[styles.stamp, mine ? styles.stampMine : null]} {...textScale.badge}>
          {message.failed ? "Gönderilemedi · dokun ve tekrar dene" : message.pending ? "Gönderiliyor…" : clockLabel(message.created_at)}
        </Text>
        {mine && !message.deleted ? <Ionicons name={message.failed ? "alert-circle" : message.pending ? "time-outline" : "checkmark-done"} size={12} color={message.failed ? colors.danger : withAlpha(colors.textOnBrand, 0.8)} /> : null}
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  banner: { marginHorizontal: layout.screenPadding, marginBottom: space.sm },
  thread: { flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: layout.screenPadding, paddingVertical: space.md, gap: space.sm },
  olderWrap: { alignItems: "center", paddingBottom: space.sm },
  dayRow: { alignItems: "center", paddingVertical: space.xs },
  dayPill: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  dayLabel: { ...type.micro, color: colors.textSecondary },

  bubble: { maxWidth: "86%", borderRadius: radius.lg, padding: space.md },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.brand, borderBottomRightRadius: radius.xs },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: colors.surface2, borderBottomLeftRadius: radius.xs },
  bubbleSending: { opacity: 0.72 },
  bubbleFailed: { borderWidth: 1, borderColor: colors.danger },
  senderRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: space.xxs },
  sender: { ...type.micro, color: colors.brandAccent, marginBottom: space.xxs },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.brandAccent, borderRadius: radius.xs, backgroundColor: withAlpha(colors.textPrimary, 0.06), paddingHorizontal: space.sm, paddingVertical: space.xs, marginBottom: space.xs, gap: space.px },
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

  replyBar: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: layout.screenPadding, marginBottom: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm, borderLeftWidth: 3, borderLeftColor: colors.brand, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  replyBody: { flex: 1, minWidth: 0 },
  replyName: { ...type.micro, color: colors.brandAccent },
  replyText: { ...type.caption, color: colors.textSecondary },
  replyClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },

  composer: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: layout.screenPadding, paddingTop: space.sm, paddingBottom: space.sm, borderTopWidth: hairline, borderTopColor: colors.separator, backgroundColor: colors.surface1 },
  composerInput: { flex: 1 },
  send: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  mic: { backgroundColor: colors.win },
  roundGhost: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  recordingInfo: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.dangerDim },
  recDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.danger },
  recordingText: { ...type.label, color: colors.danger, fontVariant: ["tabular-nums"] },
});
