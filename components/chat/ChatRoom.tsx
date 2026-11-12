/**
 * SOHBET ODASI — WhatsApp düzeni; web ve masaüstü Mesajlar ile aynı görünüm ve
 * (masaüstüyle) aynı özellikler. Üye (/sohbet/[id]) ve yönetim
 * (/yonetim/sohbet/[id], "Üye mesajları" ortak kutusu) ortak kullanır.
 *
 *   · Başlık: avatar, ad, yazıyor… / çevrimiçi / son görülme; sesli arama,
 *     sohbette arama (sonuçlar arasında yukarı / aşağı), menü.
 *   · Akış: TERS çevrilmiş sanal liste (en yeni mesaj altta, yukarı kaydırınca
 *     eski sayfa yüklenir), gün ayraçları, okunmamış ayracı, sabit mesaj çubuğu,
 *     "en alta git" düğmesi (yeni mesaj sayacıyla), mesaja git + vurgu.
 *   · Mesaj: uzun bas → tepki, yanıtla, ilet, yıldızla, sabitle, kopyala,
 *     düzenle (15 dk), bilgi (kimler okudu), seç, herkesten sil; çoklu seçim.
 *   · Gönderim: iyimser balon; bağlantı yoksa METİN giden kutusuna yazılır ve
 *     bağlantı gelince kendiliğinden gider (lib/chatDrafts.ts), diğer hatalarda
 *     balonun altından yeniden denenir.
 *   · Ekler: fotoğraf (albüm), kamera, video, sesli mesaj, konum, anket;
 *     yönetimde hazır içerikler (günün maçları, "Ben talibim", Haftanın Enleri).
 *
 * ÜYE MESAJLARI (admin): /api/admin/chat uçları; yanıt ElitLig Yönetimi adına
 * gider, okundu ortak damgadır. Tepki, yıldız, sabitleme, düzenleme, silme,
 * iletme ve arama bu görünümde yoktur (sunucu yönetim görünümünde desteklemez).
 *
 * PERFORMANS: yazma alanının metni Composer'da yaşar (liste tuş vuruşunda
 * çizilmez); "yazıyor…" yalnız başlık satırını çizer; balonlar `memo`dur ve
 * eylemler tek kararlı nesneyle iner.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AttachPreviewSheet, AttachSheet, type AttachMode, type AttachPick, type ContentKey } from "@/components/chat/AttachSheet";
import { AttendanceCard, CallChip, MatchOfferBubble, NotificationCard, SystemChip } from "@/components/chat/ChatBubbles";
import { ChatHeader, SelectionHeader, type HeaderAction } from "@/components/chat/ChatHeader";
import { Composer } from "@/components/chat/Composer";
import { AwardSheet, MatchesSheet, SignupSheet } from "@/components/chat/ContentSheets";
import { ImageViewer, type ViewerImage } from "@/components/chat/ImageViewer";
import { DayDivider, MessageBubble, ReactionChips, RowShell, UnreadDivider, type BubbleActions } from "@/components/chat/MessageBubble";
import { ActionMenu, ForwardSheet, MessageInfoSheet, MessageMenu, ReactionsSheet, VotersSheet, type MessageMenuItem } from "@/components/chat/MessageSheets";
import { ReportSheet, type ReportTarget } from "@/components/chat/ReportSheet";
import { AwardPollCard, MatchesCard, PollBubble, SignupCard } from "@/components/chat/RichBubbles";
import { useConversationActions } from "@/components/chat/useConversationActions";
import { BottomSheet, Button, ChatStatusBar, EmptyState, ErrorState, SkeletonListRow, Touchable, errorMessage } from "@/components/chat/kit";
import { useToast } from "@/components/ui";
import {
  PAGE_SIZE,
  patchConversationCache,
  patchMessageCache,
  setActiveChatConversation,
  updateMessagesCache,
  useAdminConversationMessages,
  useChatConnected,
  useConversationMessages,
  usePresence,
} from "@/hooks/useChat";
import { hasAnyPermission } from "@/lib/admin/access";
import {
  adminChat,
  assignSignup,
  callAction,
  closeSignup,
  deleteMessage,
  editMessage,
  forwardMessages,
  getMessages,
  makeClientId,
  markConversationRead,
  pinMessage,
  reactToMessage,
  resolveAction,
  respondMatchOffer,
  searchMessages,
  sendContentAward,
  sendContentMatches,
  sendContentSignup,
  sendMessage,
  starMessage,
  toggleSignup,
  uploadAudio,
  uploadFile,
  votePoll,
  type ChatAction,
  type ChatLocationMeta,
  type ChatMessage,
  type ChatParticipant,
  type ChatRetry,
  type ConversationsResponse,
  type MessagesResponse,
  type SendMessageInput,
} from "@/lib/api/chat";
import { addMatchAttendancePlayers, getTeamRoster, removeMatchAttendancePlayer, respondMatchAttendance, type AttendancePlayer } from "@/lib/api/team";
import { chatDraftOwner, outboxAdd, outboxFor, outboxRemove, loadChatDrafts } from "@/lib/chatDrafts";
import { pickFromLibrary, takePhoto, type PickedFile, type VoiceRecording } from "@/lib/chatMedia";
import { chatPalette, colors, elevate, wa } from "@/lib/chatPalette";
import {
  applyReaction,
  buildRows,
  canDelete,
  canEdit,
  canForward,
  canInteract,
  isGroupChat,
  lastSeenLabel,
  mergeMessages,
  messageSummary,
  type ChatRow,
} from "@/lib/chatUtils";
import { LIVE_SOCKET_ENABLED } from "@/lib/config";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useCall } from "@/providers/CallProvider";
import { hairline, layout, radius, space, textScale, type } from "@/theme";

const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_PARTICIPANTS: ChatParticipant[] = [];
const rowKey = (item: ChatRow) => item.key;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Bağlantı hatası (sunucuya ulaşılamadı): giden kutusuna alınır. Sunucunun reddi (4xx) alınmaz. */
const isOffline = (error: unknown) => !(error instanceof ApiError) || error.status === 0;

/**
 * Üye mesajları görünümü: "ElitLig Yönetimi" adına yazılanlar (gönderen
 * kimliksiz) bizim tarafımızdır ve sağda görünür. Aynı mesaj için aynı nesne
 * döner (WeakMap), böylece balonlar boşuna yeniden çizilmez.
 */
const inboxViews = new WeakMap<ChatMessage, ChatMessage>();
function asInboxMessage(message: ChatMessage): ChatMessage {
  if (!message.sender.is_management || message.sender.is_me) return message;
  let view = inboxViews.get(message);
  if (!view) {
    view = { ...message, sender: { ...message.sender, is_me: true } };
    inboxViews.set(message, view);
  }
  return view;
}

export interface ChatRoomProps {
  conversationId: number;
  admin?: boolean;
  /** Açılışta gidilecek mesaj (arama sonucu, yıldızlı mesaj, medya). */
  jumpTo?: number | null;
}

export function ChatRoom({ conversationId, admin = false, jumpTo = null }: ChatRoomProps) {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const call = useCall();
  const queryClient = useQueryClient();
  const connected = useChatConnected();
  const conversationActions = useConversationActions();
  const listRef = useRef<FlatList<ChatRow>>(null);
  const viewerId = auth.user?.id ?? null;
  const meName = auth.user?.fullName ?? auth.user?.username ?? "Sen";

  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [edit, setEdit] = useState<ChatMessage | null>(null);
  const [menu, setMenu] = useState<ChatMessage[] | null>(null);
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [reactionsOf, setReactionsOf] = useState<number | null>(null);
  const [infoOf, setInfoOf] = useState<ChatMessage | null>(null);
  const [votersOf, setVotersOf] = useState<number | null>(null);
  const [forwardIds, setForwardIds] = useState<number[] | null>(null);
  const [forwardBusy, setForwardBusy] = useState(false);
  const [attach, setAttach] = useState<AttachMode>(null);
  const [picked, setPicked] = useState<PickedFile[] | null>(null);
  const [content, setContent] = useState<ContentKey | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [assign, setAssign] = useState<{ message: ChatMessage; slotId: string } | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchHits, setSearchHits] = useState<number[] | null>(null);
  const [searchCursor, setSearchCursor] = useState(0);
  const [attendancePick, setAttendancePick] = useState<ChatMessage | null>(null);
  const [anchorVersion, setAnchorVersion] = useState(0);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/(tabs)/mesajlar", params: admin ? { bolum: "uye" } : {} });
  }, [admin, router]);

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
  const rawMessages = query.data?.messages ?? EMPTY_MESSAGES;
  const messages = useMemo(() => (admin ? rawMessages.map(asInboxMessage) : rawMessages), [admin, rawMessages]);
  const grouped = isGroupChat(conversation);
  const participants = conversation?.participants ?? EMPTY_PARTICIPANTS;
  const mentionPeople = grouped && !admin ? participants : EMPTY_PARTICIPANTS;
  const other = conversation?.type === "direct" ? conversation.other_user : null;
  const presence = usePresence(useMemo(() => (other && !admin ? [other.user_id] : []), [admin, other]));
  const otherPresence = other ? presence[String(other.user_id)] : undefined;

  const canReplyAsManagement = !admin || hasAnyPermission(auth.user, ["messages.reply"]);
  const disabledReason = !conversation
    ? null
    : conversation.removed
      ? "Bu gruptan çıkarıldın; yeni mesaj yazamazsın."
      : admin && !canReplyAsManagement
        ? "Yönetim adına yazma yetkin yok (messages.reply). Mesajları okuyabilirsin."
        : conversation.blocked_by_me
          ? null
          : conversation.can_write === false
            ? conversation.restricted_reason || "Bu sohbete mesaj yazılamaz."
            : conversation.only_admins_send && conversation.my_role !== "admin"
              ? "Bu gruba yalnız grup yöneticileri mesaj gönderebilir."
              : null;
  const canWrite = Boolean(conversation) && !disabledReason && !conversation?.blocked_by_me;
  /** Tepki, yıldız, sabitleme, düzenleme, silme, iletme: yalnız kişisel sohbetlerde (üye API'si). */
  const extras = !admin;

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.chatMessages(conversationId) });
  }, [conversationId, queryClient]);

  /* ---------- okunmamış ayracı: ilk yüklemede bir kez belirlenir ---------- */
  const unreadAnchor = useRef<{ id: number; count: number } | null | undefined>(undefined);
  if (unreadAnchor.current === undefined && conversation && messages.length) {
    // Sohbet listesi önbelleği soketle güncel kalır; açık sohbet özetinden yeni olabilir.
    const listed = queryClient.getQueryData<ConversationsResponse>(queryKeys.chatConversations())?.conversations.find((item) => item.id === conversationId);
    const count = Math.max(Number(conversation.unread) || 0, admin ? 0 : Number(listed?.unread) || 0);
    const incoming = messages.filter((item) => !item.sender.is_me && item.id > 0 && item.kind !== "system");
    const first = count > 0 ? incoming[Math.max(0, incoming.length - count)] : undefined;
    unreadAnchor.current = first ? { id: first.id, count } : null;
  }

  /* ---------- satırlar (ters liste: en yeni mesaj 0. sırada) ---------- */
  const { rows, albums } = useMemo(() => {
    const built = buildRows(messages, { unreadFromId: unreadAnchor.current?.id ?? null, unreadCount: unreadAnchor.current?.count ?? 0 });
    const albumMap = new Map<number, ChatMessage[]>();
    built.forEach((row) => {
      if (row.type === "album") albumMap.set(row.messages[row.messages.length - 1].id, row.messages);
    });
    return { rows: built.reverse(), albums: albumMap };
    // anchorVersion: ayraç kaldırıldığında satırlar yeniden kurulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, anchorVersion]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  /* ---------- okundu ---------- */
  const newestIncomingId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) if (!messages[i].sender.is_me && messages[i].id > 0) return messages[i].id;
    return 0;
  }, [messages]);
  const needsRead = Boolean(conversation && (conversation.unread > 0 || conversation.marked_unread));
  const hasConversation = Boolean(conversation);
  const lastReadId = useRef(0);
  useEffect(() => {
    if (!hasConversation) return;
    if (!needsRead && newestIncomingId <= lastReadId.current) return;
    lastReadId.current = newestIncomingId;
    patchConversationCache(queryClient, conversationId, { unread: 0, marked_unread: false });
    void api
      .read(conversationId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chatUnread() });
        if (admin) void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
      })
      .catch(() => {});
  }, [admin, api, conversationId, hasConversation, needsRead, newestIncomingId, queryClient]);

  /* ---------- kaydırma ---------- */
  const atBottomRef = useRef(true);
  const scrollToBottom = useCallback((animated = true) => {
    listRef.current?.scrollToOffset({ offset: 0, animated });
    setNewBelow(0);
  }, []);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const bottom = event.nativeEvent.contentOffset.y < 140;
    if (bottom !== atBottomRef.current) {
      atBottomRef.current = bottom;
      setAtBottom(bottom);
      if (bottom) setNewBelow(0);
    }
  }, []);
  // Aşağıda değilken gelen mesajlar "en alta git" düğmesinde sayılır.
  const newestSeen = useRef(0);
  useEffect(() => {
    const real = messages.filter((item) => item.id > 0);
    const newest = real.length ? real[real.length - 1].id : 0;
    if (newestSeen.current && newest > newestSeen.current && !atBottomRef.current) {
      const fresh = real.filter((item) => item.id > newestSeen.current && !item.sender.is_me && item.kind !== "system").length;
      if (fresh) setNewBelow((count) => count + fresh);
    }
    newestSeen.current = Math.max(newestSeen.current, newest);
  }, [messages]);

  /* ---------- eski mesajlar ---------- */
  const olderBusy = useRef(false);
  const loadOlder = useCallback(async (): Promise<boolean> => {
    const data = queryClient.getQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId));
    const first = data?.messages.find((item) => item.id > 0);
    if (!data?.has_more || !first || olderBusy.current) return false;
    olderBusy.current = true;
    setLoadingOlder(true);
    try {
      const older = await api.getMessages(conversationId, { before: first.id, limit: PAGE_SIZE });
      queryClient.setQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId), (previous) =>
        previous ? { ...previous, has_more: older.has_more, messages: mergeMessages(previous.messages, older.messages) } : previous,
      );
      return older.messages.length > 0;
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: "danger" });
      return false;
    } finally {
      olderBusy.current = false;
      setLoadingOlder(false);
    }
  }, [api, conversationId, queryClient, toast]);

  /* ---------- mesaja git ---------- */
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (highlightTimer.current && clearTimeout(highlightTimer.current)), []);
  const jumpToMessage = useCallback(
    async (messageId: number) => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const index = rowsRef.current.findIndex((row) => (row.type === "msg" ? row.message.id === messageId : row.type === "album" ? row.messages.some((item) => item.id === messageId) : false));
        if (index >= 0) {
          listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
          setHighlight(messageId);
          if (highlightTimer.current) clearTimeout(highlightTimer.current);
          highlightTimer.current = setTimeout(() => setHighlight(null), 1800);
          return;
        }
        // eslint-disable-next-line no-await-in-loop
        if (!(await loadOlder())) break;
        // eslint-disable-next-line no-await-in-loop
        await wait(80);
      }
      toast.show({ message: "Mesaj bulunamadı; silinmiş ya da çok eski olabilir.", tone: "warn" });
    },
    [loadOlder, toast],
  );
  const jumped = useRef<number | null>(null);
  useEffect(() => {
    if (jumpTo && jumped.current !== jumpTo && messages.length) {
      jumped.current = jumpTo;
      const timer = setTimeout(() => void jumpToMessage(jumpTo), 250);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [jumpTo, jumpToMessage, messages.length]);

  /* ---------- gönderim ---------- */
  const afterSent = useCallback(
    (message: ChatMessage) => {
      updateMessagesCache(queryClient, conversationId, (list) => mergeMessages(list, [message]));
      patchConversationCache(queryClient, conversationId, { last_message: message, last_message_at: message.created_at, marked_unread: false, unread: 0 });
      if (admin) void queryClient.invalidateQueries({ queryKey: ["chat", "admin", "conversations"] });
    },
    [admin, conversationId, queryClient],
  );

  const makeOptimistic = useCallback(
    (extra: Partial<ChatMessage> & Pick<ChatMessage, "kind">): ChatMessage => {
      const clientId = extra.client_id ?? makeClientId();
      const asManagement = admin;
      return {
        id: -Date.now() - Math.floor(Math.random() * 1000),
        public_id: clientId,
        conversation_id: conversationId,
        body: null,
        meta: null,
        client_id: clientId,
        sender: { user_id: asManagement ? null : viewerId, name: asManagement ? "ElitLig Yönetimi" : meName, avatar: null, is_me: true, is_management: asManagement },
        reply_to: null,
        deleted: false,
        edited_at: null,
        created_at: new Date().toISOString(),
        reactions: [],
        pending: true,
        ...extra,
      };
    },
    [admin, conversationId, meName, viewerId],
  );

  const pushOptimistic = useCallback(
    (message: ChatMessage) => {
      if (unreadAnchor.current) {
        unreadAnchor.current = null;
        setAnchorVersion((value) => value + 1);
      }
      updateMessagesCache(queryClient, conversationId, (list) => mergeMessagesKeepLocal(list, message));
      requestAnimationFrame(() => scrollToBottom(false));
    },
    [conversationId, queryClient, scrollToBottom],
  );

  /** Yükleme (varsa) + gönderim. Başarısızlıkta balon "gönderilemedi" olur; metin, bağlantı hatasında kuyruğa girer. */
  const deliver = useCallback(
    async (clientId: string, retry: ChatRetry) => {
      try {
        let input = retry.input;
        if (retry.upload) {
          const file = { uri: retry.upload.uri, name: retry.upload.name, type: retry.upload.type };
          if (retry.upload.field === "audio") {
            const uploaded = await uploadAudio(file);
            input = { ...input, meta: { audio: { url: uploaded.url, duration_ms: retry.upload.duration_ms ?? 0, mime: uploaded.mime } } };
          } else {
            const uploaded = await uploadFile(file);
            input = {
              ...input,
              kind: uploaded.is_image ? "image" : "file",
              meta: { file: { url: uploaded.url, name: uploaded.name ?? retry.upload.name, mime: uploaded.mime ?? retry.upload.type, size: uploaded.size, width: retry.upload.width ?? null, height: retry.upload.height ?? null } },
            };
          }
        }
        const { message } = await api.send(conversationId, { ...input, client_id: clientId });
        outboxRemove(clientId);
        afterSent(message);
        return true;
      } catch (error) {
        const queueable = !retry.upload && (retry.input.kind ?? "text") === "text" && isOffline(error);
        if (queueable) {
          outboxAdd({ conversation_id: conversationId, client_id: clientId, body: retry.input.body ?? "", reply_to_id: retry.input.reply_to_id ?? null, mentions: retry.input.mentions, admin, at: new Date().toISOString() });
        } else {
          outboxRemove(clientId);
          toast.show({ message: errorMessage(error), tone: "danger" });
        }
        patchMessageCache(queryClient, conversationId, clientId, { pending: false, failed: true, queued: queueable, retry });
        return false;
      }
    },
    [admin, afterSent, api, conversationId, queryClient, toast],
  );

  const replyQuote = (target: ChatMessage | null) =>
    target ? { id: target.id, body: messageSummary(target).text, kind: target.kind, sender_name: target.sender.is_me ? meName : target.sender.name } : null;

  const sendText = useCallback(
    (text: string, mentions: number[]) => {
      const target = reply;
      setReply(null);
      const input: SendMessageInput = { kind: "text", body: text, reply_to_id: target?.id ?? null, ...(mentions.length ? { mentions } : {}) };
      const optimistic = makeOptimistic({ kind: "text", body: text, reply_to: replyQuote(target), meta: mentions.length ? { mentions } : null });
      pushOptimistic(optimistic);
      void deliver(optimistic.client_id as string, { input });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deliver, makeOptimistic, pushOptimistic, reply],
  );

  const sendFiles = useCallback(
    async (files: PickedFile[], caption: string) => {
      setPicked(null);
      const target = reply;
      setReply(null);
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        // Açıklama son kareye yazılır (albümün altında görünür).
        const text = i === files.length - 1 ? caption : "";
        const optimistic = makeOptimistic({
          kind: file.isImage ? "image" : "file",
          body: text || null,
          local_uri: file.isImage ? file.uri : null,
          reply_to: i === 0 ? replyQuote(target) : null,
          meta: { file: { url: "", name: file.name, mime: file.type, size: file.size ?? 0, width: file.width, height: file.height }, caption: text || null },
        });
        pushOptimistic(optimistic);
        // eslint-disable-next-line no-await-in-loop
        await deliver(optimistic.client_id as string, {
          input: { kind: file.isImage ? "image" : "file", body: text || undefined, reply_to_id: i === 0 ? target?.id ?? null : null },
          upload: { field: "file", uri: file.uri, name: file.name, type: file.type, width: file.width, height: file.height },
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deliver, makeOptimistic, pushOptimistic, reply],
  );

  const sendVoice = useCallback(
    (recording: VoiceRecording) => {
      const target = reply;
      setReply(null);
      const optimistic = makeOptimistic({ kind: "audio", body: "Sesli mesaj", local_uri: recording.uri, reply_to: replyQuote(target), meta: { audio: { url: "", duration_ms: recording.durationMs, mime: recording.mime } } });
      pushOptimistic(optimistic);
      void deliver(optimistic.client_id as string, {
        input: { kind: "audio", reply_to_id: target?.id ?? null },
        upload: { field: "audio", uri: recording.uri, name: recording.name, type: recording.mime, duration_ms: recording.durationMs },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deliver, makeOptimistic, pushOptimistic, reply],
  );

  /** Anket, konum: sunucudan dönmeden balon çizilmez (kimlikler sunucuda üretilir). */
  const sendRich = useCallback(
    async (input: SendMessageInput) => {
      const { message } = await api.send(conversationId, { ...input, client_id: makeClientId() });
      afterSent(message);
      requestAnimationFrame(() => scrollToBottom(false));
    },
    [afterSent, api, conversationId, scrollToBottom],
  );
  const onSendLocation = useCallback((location: Partial<ChatLocationMeta>) => sendRich({ kind: "location", meta: { location } }), [sendRich]);
  const onSendPoll = useCallback((poll: { question: string; multiple: boolean; options: string[] }) => sendRich({ kind: "poll", body: poll.question, meta: { poll } }), [sendRich]);

  const retry = useCallback(
    (message: ChatMessage) => {
      if (!message.failed || !message.client_id) return;
      const again: ChatRetry = message.retry ?? { input: { kind: "text", body: message.body ?? "", reply_to_id: message.reply_to?.id ?? null } };
      patchMessageCache(queryClient, conversationId, message.client_id, { pending: true, failed: false, queued: false });
      void deliver(message.client_id, again);
    },
    [conversationId, deliver, queryClient],
  );

  /* ---------- giden kutusu: sohbet açılınca ve bağlantı gelince yeniden dene ---------- */
  const flushOutbox = useCallback(async () => {
    await loadChatDrafts();
    const sender = chatDraftOwner();
    const items = outboxFor(conversationId).filter((item) => Boolean(item.admin) === admin);
    for (const item of items) {
      // Kuyruk boşalırken hesap değiştiyse kalanlar yeni hesap adına gönderilmez.
      if (!sender || chatDraftOwner() !== sender) break;
      const known = queryClient.getQueryData<MessagesResponse>(queryKeys.chatMessages(conversationId))?.messages.find((message) => message.client_id === item.client_id);
      if (known?.pending) continue;
      if (known && known.id > 0) {
        outboxRemove(item.client_id);
        continue;
      }
      const input: SendMessageInput = { kind: "text", body: item.body, reply_to_id: item.reply_to_id, ...(item.mentions?.length ? { mentions: item.mentions } : {}) };
      if (!known) updateMessagesCache(queryClient, conversationId, (list) => mergeMessagesKeepLocal(list, makeOptimistic({ kind: "text", body: item.body, client_id: item.client_id, created_at: item.at })));
      else patchMessageCache(queryClient, conversationId, item.client_id, { pending: true, failed: false, queued: false });
      // eslint-disable-next-line no-await-in-loop
      if (!(await deliver(item.client_id, { input }))) break;
    }
  }, [admin, conversationId, deliver, makeOptimistic, queryClient]);
  const loaded = Boolean(query.data);
  useEffect(() => {
    if (loaded && (connected || !LIVE_SOCKET_ENABLED)) void flushOutbox();
  }, [connected, flushOutbox, loaded]);
  // Kuyrukta bekleyen varken 15 sn'de bir yeniden denenir (soket bağlıyken HTTP kopmuş olabilir).
  const hasQueued = useMemo(() => rawMessages.some((item) => item.queued), [rawMessages]);
  useEffect(() => {
    if (!hasQueued) return undefined;
    const timer = setInterval(() => void flushOutbox(), 15_000);
    return () => clearInterval(timer);
  }, [flushOutbox, hasQueued]);

  /* ---------- mesaj eylemleri ---------- */
  const mergeUpdated = useCallback(
    (message: ChatMessage) => {
      updateMessagesCache(queryClient, conversationId, (list) => {
        const known = list.find((item) => item.id === message.id);
        return known ? mergeMessages(list, [{ ...message, sender: known.sender }]) : list;
      });
      if (admin) void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
    },
    [admin, conversationId, queryClient],
  );

  const react = useCallback(
    (message: ChatMessage, emoji: string) => {
      const before = message.reactions;
      patchMessageCache(queryClient, conversationId, message.id, { reactions: applyReaction(message.reactions, emoji, { user_id: viewerId, name: meName }) });
      void reactToMessage(conversationId, message.id, emoji)
        .then(({ message: updated }) => mergeUpdated(updated))
        .catch((error: unknown) => {
          patchMessageCache(queryClient, conversationId, message.id, { reactions: before });
          toast.show({ message: errorMessage(error), tone: "danger" });
        });
    },
    [conversationId, meName, mergeUpdated, queryClient, toast, viewerId],
  );

  const star = useCallback(
    (list: ChatMessage[], on: boolean) => {
      list.forEach((message) => {
        patchMessageCache(queryClient, conversationId, message.id, { starred: on });
        void starMessage(conversationId, message.id, on).catch((error: unknown) => {
          patchMessageCache(queryClient, conversationId, message.id, { starred: !on });
          toast.show({ message: errorMessage(error), tone: "danger" });
        });
      });
      void queryClient.invalidateQueries({ queryKey: ["chat", "starred"] });
    },
    [conversationId, queryClient, toast],
  );

  const removeMessages = useCallback(
    (list: ChatMessage[]) => {
      Alert.alert(list.length > 1 ? `${list.length} mesaj silinsin mi?` : "Mesaj silinsin mi?", "Mesaj herkesten silinir; sohbette “Bu mesaj silindi” yazar.", [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Herkesten sil",
          style: "destructive",
          onPress: () => {
            setSelected(null);
            void (async () => {
              for (const message of list) {
                try {
                  // eslint-disable-next-line no-await-in-loop
                  await deleteMessage(conversationId, message.id);
                  patchMessageCache(queryClient, conversationId, message.id, { deleted: true, body: null, meta: null, reactions: [], starred: false });
                } catch (error) {
                  toast.show({ message: errorMessage(error), tone: "danger" });
                  break;
                }
              }
            })();
          },
        },
      ]);
    },
    [conversationId, queryClient, toast],
  );

  const pin = useCallback(
    (message: ChatMessage | null) => {
      const current = conversationRef.current?.pinned_message_id ?? null;
      const next = message && current !== message.id ? message.id : null;
      patchConversationCache(queryClient, conversationId, { pinned_message_id: next });
      void pinMessage(conversationId, next).catch((error: unknown) => {
        patchConversationCache(queryClient, conversationId, { pinned_message_id: current });
        toast.show({ message: errorMessage(error), tone: "danger" });
      });
    },
    [conversationId, queryClient, toast],
  );

  const saveEdit = useCallback(
    (text: string) => {
      const target = edit;
      setEdit(null);
      if (!target || text === target.body) return;
      patchMessageCache(queryClient, conversationId, target.id, { body: text, edited_at: new Date().toISOString() });
      void editMessage(conversationId, target.id, text)
        .then(({ message }) => mergeUpdated(message))
        .catch((error: unknown) => {
          patchMessageCache(queryClient, conversationId, target.id, { body: target.body, edited_at: target.edited_at });
          toast.show({ message: errorMessage(error), tone: "danger" });
        });
    },
    [conversationId, edit, mergeUpdated, queryClient, toast],
  );

  const forward = useCallback(
    (targets: number[]) => {
      const ids = forwardIds;
      if (!ids?.length || !targets.length) return;
      setForwardBusy(true);
      void forwardMessages(ids, targets)
        .then((result) => {
          toast.show({ message: `${result.sent} mesaj iletildi.`, tone: "success" });
          setForwardIds(null);
          setSelected(null);
          void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
        })
        .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }))
        .finally(() => setForwardBusy(false));
    },
    [forwardIds, queryClient, toast],
  );

  const copy = useCallback(
    (list: ChatMessage[]) => {
      const text = list.length === 1
        ? list[0].kind === "text" ? list[0].body ?? "" : list[0].meta?.caption ?? ""
        : list.map((message) => `[${new Date(message.created_at).toLocaleString("tr-TR")}] ${message.sender.is_me ? meName : message.sender.name ?? "Üye"}: ${message.body ?? ""}`).join("\n");
      void Clipboard.setStringAsync(text).then(() => toast.show({ message: "Kopyalandı.", tone: "success" }));
    },
    [meName, toast],
  );

  const reportMessage = useCallback(
    (message: ChatMessage) => {
      const summary = messageSummary(message);
      setReport({
        userId: message.sender.user_id,
        userName: message.sender.name,
        conversationId,
        messageId: message.kind === "call" ? null : message.id,
        callId: message.kind === "call" ? message.meta?.call?.id ?? null : null,
        excerpt: summary.text || null,
      });
    },
    [conversationId],
  );

  const toggleSelect = useCallback(
    (message: ChatMessage) => {
      const ids = (albums.get(message.id) ?? [message]).map((item) => item.id).filter((id) => id > 0);
      setSelected((current) => {
        const next = new Set(current ?? []);
        const on = ids.every((id) => next.has(id));
        ids.forEach((id) => (on ? next.delete(id) : next.add(id)));
        return next;
      });
    },
    [albums],
  );

  const selecting = selected !== null;
  const handlers = useRef({
    longPress: (_message: ChatMessage) => {},
    press: (_message: ChatMessage) => {},
    openImage: (_message: ChatMessage) => {},
  });
  handlers.current.longPress = (message) => {
    if (selecting) {
      toggleSelect(message);
      return;
    }
    if (message.pending) return;
    if (message.failed) {
      setMenu([message]);
      return;
    }
    const reportable = !admin && !message.sender.is_me && !message.sender.is_management && Boolean(message.sender.user_id);
    if (!canInteract(message) && !(message.kind === "call" && reportable)) return;
    setMenu(albums.get(message.id) ?? [message]);
  };
  handlers.current.press = (message) => {
    if (selecting && message.id > 0) toggleSelect(message);
  };
  handlers.current.openImage = (message) => {
    if (selecting) toggleSelect(message);
    else setViewer(message.client_id ?? String(message.id));
  };
  const openError = useCallback(() => toast.show({ message: "Açılamadı. Bağlantını kontrol edip tekrar dene.", tone: "danger" }), [toast]);
  const actions = useMemo<BubbleActions>(
    () => ({
      onLongPress: (message) => handlers.current.longPress(message),
      onPress: (message) => handlers.current.press(message),
      onJump: (messageId) => void jumpToMessage(messageId),
      onOpenImage: (message) => handlers.current.openImage(message),
      onReactions: (message) => setReactionsOf(message.id),
      onRetry: retry,
      onOpenError: openError,
    }),
    [jumpToMessage, openError, retry],
  );

  const menuItems = useMemo<MessageMenuItem[]>(() => {
    if (!menu?.length) return [];
    const last = menu[menu.length - 1];
    const multi = menu.length > 1;
    const items: (MessageMenuItem | false | null | undefined)[] = [];
    if (last.failed) {
      return [
        { key: "retry", label: "Tekrar dene", icon: "refresh", onPress: () => retry(last) },
        {
          key: "discard",
          label: "Mesajı at",
          icon: "trash-outline",
          danger: true,
          onPress: () => {
            outboxRemove(last.client_id);
            updateMessagesCache(queryClient, conversationId, (list) => list.filter((item) => item.client_id !== last.client_id));
          },
        },
      ];
    }
    const reportable = !admin && !last.sender.is_me && !last.sender.is_management && Boolean(last.sender.user_id);
    if (last.kind === "call") return reportable ? [{ key: "report", label: "Şikayet et", icon: "flag-outline", danger: true, onPress: () => reportMessage(last) }] : [];
    const copyable = !multi && (last.kind === "text" || Boolean(last.meta?.caption));
    items.push(canWrite && { key: "reply", label: "Yanıtla", icon: "arrow-undo-outline", onPress: () => { setEdit(null); setReply(last); } });
    items.push(copyable && { key: "copy", label: "Kopyala", icon: "copy-outline", onPress: () => copy([last]) });
    if (extras) {
      const allStarred = menu.every((item) => item.starred);
      items.push(menu.every(canForward) && { key: "forward", label: "İlet", icon: "arrow-redo-outline", onPress: () => setForwardIds(menu.map((item) => item.id)) });
      items.push({ key: "star", label: allStarred ? "Yıldızı kaldır" : "Yıldızla", icon: allStarred ? "star" : "star-outline", onPress: () => star(menu, !allStarred) });
      items.push({ key: "pin", label: conversation?.pinned_message_id === last.id ? "Sabitlemeyi kaldır" : "Sabitle", icon: "pin-outline", onPress: () => pin(last) });
      items.push(!multi && canEdit(last) && { key: "edit", label: "Düzenle", icon: "create-outline", onPress: () => { setReply(null); setEdit(last); } });
      items.push(!multi && last.sender.is_me && { key: "info", label: "Bilgi", icon: "information-circle-outline", onPress: () => setInfoOf(last) });
    }
    items.push({ key: "select", label: "Seç", icon: "checkmark-circle-outline", onPress: () => setSelected(new Set(menu.map((item) => item.id))) });
    items.push(reportable && { key: "report", label: "Şikayet et", icon: "flag-outline", danger: true, onPress: () => reportMessage(last) });
    items.push(extras && menu.every(canDelete) && { key: "delete", label: "Herkesten sil", icon: "trash-outline", danger: true, onPress: () => removeMessages(menu) });
    return items.filter(Boolean) as MessageMenuItem[];
  }, [admin, canWrite, conversation?.pinned_message_id, conversationId, copy, extras, menu, pin, queryClient, removeMessages, reportMessage, retry, star]);
  const menuTarget = menu?.length ? menu[menu.length - 1] : null;

  /* ---------- kart eylemleri (bildirim, teklif, anket, görev anketi, yoklama) ---------- */
  const runAction = useCallback(
    (action: ChatAction, message: ChatMessage) => {
      if (action.api) {
        const proceed = () => {
          setBusyKey(action.key);
          void callAction(action)
            .then(() => api.resolve(conversationId, message.id, { key: action.key, label: `${action.label}: tamamlandı` }))
            .then(({ message: updated }) => {
              patchMessageCache(queryClient, conversationId, message.id, { meta: updated.meta });
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
      void api
        .respond(conversationId, message.id, { response })
        .then(({ message: updated }) => patchMessageCache(queryClient, conversationId, message.id, { meta: updated.meta }))
        .catch((error: unknown) => Alert.alert("Yanıt gönderilemedi", errorMessage(error)))
        .finally(() => setBusyKey(null));
    },
    [api, conversationId, queryClient],
  );

  const vote = useCallback(
    (message: ChatMessage, optionIds: string[]) => {
      setBusyKey(`poll-${message.id}`);
      void votePoll(conversationId, message.id, { option_ids: optionIds })
        .then(({ message: updated }) => mergeUpdated(updated))
        .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }))
        .finally(() => setBusyKey(null));
    },
    [conversationId, mergeUpdated, toast],
  );
  const signup = useCallback(
    (message: ChatMessage, slotId: string, on: boolean) => {
      setBusyKey(`signup-${message.id}-${slotId}`);
      void toggleSignup(conversationId, message.id, { slot_id: slotId, on })
        .then(({ message: updated }) => {
          mergeUpdated(updated);
          toast.show({ message: on ? "Talip oldun; görevlendirilince bildirim gelir." : "Taliplikten vazgeçtin.", tone: "success" });
        })
        .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }))
        .finally(() => setBusyKey(null));
    },
    [conversationId, mergeUpdated, toast],
  );
  const canAssign = auth.isManagement && !admin && hasAnyPermission(auth.user, ["staff.assign"]);
  const openAssign = useCallback((message: ChatMessage, slotId: string) => setAssign({ message, slotId }), []);
  const assignTo = useCallback(
    (message: ChatMessage, slotId: string, userId: number | null, name?: string) => {
      setBusyKey(`signup-${message.id}-${slotId}`);
      void assignSignup(conversationId, message.id, { slot_id: slotId, user_id: userId })
        .then(({ message: updated }) => {
          mergeUpdated(updated);
          toast.show({ message: userId ? `${name ?? "Kişi"} görevlendirildi; maç ekibine yazıldı.` : "Görev boşaltıldı.", tone: "success" });
        })
        .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }))
        .finally(() => setBusyKey(null));
    },
    [conversationId, mergeUpdated, toast],
  );
  const toggleSignupClosed = useCallback(
    (message: ChatMessage, closed: boolean) => {
      const run = () =>
        void closeSignup(conversationId, message.id, closed)
          .then(({ message: updated }) => {
            mergeUpdated(updated);
            toast.show({ message: closed ? "Anket kapandı." : "Anket yeniden açıldı.", tone: "success" });
          })
          .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }));
      if (closed) Alert.alert("Anket kapatılsın mı?", "Kapanan ankete yeni talip gelmez. İstediğinde yeniden açabilirsin.", [{ text: "Vazgeç", style: "cancel" }, { text: "Anketi kapat", onPress: run }]);
      else run();
    },
    [conversationId, mergeUpdated, toast],
  );

  /* Yoklama kartı: yanıt sunucuya yazılır, sunucu kartı günceller (chat:updated). */
  const respondAttendance = useCallback(
    (message: ChatMessage, status: "coming" | "not_coming" | "maybe") => {
      const matchId = message.meta?.attendance?.match_id;
      if (!matchId) return;
      setBusyKey(`att-${message.id}`);
      void respondMatchAttendance(matchId, status)
        .then((result) => toast.show({ message: result.message, tone: "success" }))
        .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }))
        .finally(() => setBusyKey(null));
    },
    [toast],
  );
  const rosterQuery = useQuery({ queryKey: ["takim", "roster"], queryFn: getTeamRoster, enabled: Boolean(attendancePick), staleTime: 60_000 });
  const removeAttendancePlayer = useCallback(
    (message: ChatMessage, player: AttendancePlayer) => {
      const matchId = message.meta?.attendance?.match_id;
      if (!matchId) return;
      Alert.alert("Kadrodan çıkar", `${player.name} yoklamadan ve maç kadrosundan çıkarılacak; gruptan alınır.`, [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Çıkar",
          style: "destructive",
          onPress: () => {
            setBusyKey(`att-${message.id}`);
            void removeMatchAttendancePlayer(matchId, player.player_id)
              .then((result) => {
                toast.show({ message: result.message, tone: "success" });
                void queryClient.invalidateQueries({ queryKey: ["takim", "attendance", matchId] });
              })
              .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }))
              .finally(() => setBusyKey(null));
          },
        },
      ]);
    },
    [queryClient, toast],
  );
  const openAttendancePicker = useCallback((message: ChatMessage) => setAttendancePick(message), []);
  const addAttendancePlayer = useCallback(
    (playerId: number) => {
      const message = attendancePick;
      const matchId = message?.meta?.attendance?.match_id;
      if (!message || !matchId) return;
      setAttendancePick(null);
      setBusyKey(`att-${message.id}`);
      void addMatchAttendancePlayers(matchId, [playerId])
        .then((result) => {
          toast.show({ message: result.message, tone: "success" });
          void queryClient.invalidateQueries({ queryKey: ["takim", "attendance", matchId] });
        })
        .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }))
        .finally(() => setBusyKey(null));
    },
    [attendancePick, queryClient, toast],
  );
  const attendanceCandidates = useMemo(() => {
    const inPoll = new Set((attendancePick?.meta?.attendance?.players ?? []).map((p) => p.player_id));
    return (rosterQuery.data?.roster ?? []).filter((p) => !inPoll.has(p.id));
  }, [attendancePick, rosterQuery.data]);

  /* ---------- ekler ve hazır içerikler ---------- */
  const onPick = useCallback(
    (kind: AttachPick) => {
      // Ek sayfası kapandıktan sonra sistem seçicisi açılır (iOS iki pencereyi üst üste açamaz).
      setTimeout(() => {
        void (kind === "camera" ? takePhoto() : pickFromLibrary(kind === "video" ? "videos" : "images"))
          .then((files) => {
            if (files.length) setPicked(files);
          })
          .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" }));
      }, 320);
    },
    [toast],
  );
  const contentKeys = useMemo<ContentKey[]>(() => {
    if (!auth.isManagement || admin || !canWrite) return [];
    return hasAnyPermission(auth.user, ["todos.assign"]) ? ["matches", "signup", "award"] : ["matches", "signup"];
  }, [admin, auth.isManagement, auth.user, canWrite]);
  const sendContent = useCallback(
    async (request: Promise<{ message: ChatMessage }>, done: string): Promise<boolean> => {
      try {
        const { message } = await request;
        afterSent(message);
        requestAnimationFrame(() => scrollToBottom(false));
        toast.show({ message: done, tone: "success" });
        return true;
      } catch (error) {
        toast.show({ message: errorMessage(error), tone: "danger" });
        return false;
      }
    },
    [afterSent, scrollToBottom, toast],
  );

  /* ---------- fotoğraf görüntüleyici ---------- */
  const images = useMemo<ViewerImage[]>(
    () =>
      messages
        .filter((item) => item.kind === "image" && !item.deleted && (item.local_uri || item.meta?.file?.url))
        .map((item) => ({
          key: item.client_id ?? String(item.id),
          uri: (item.local_uri || item.meta?.file?.url) as string,
          caption: item.meta?.caption ?? null,
          sender: item.sender.is_me ? "Sen" : item.sender.name,
          created_at: item.created_at,
          messageId: item.id > 0 ? item.id : undefined,
        })),
    [messages],
  );
  const viewerIndex = viewer ? images.findIndex((item) => item.key === viewer) : -1;

  /* ---------- sohbette arama ---------- */
  useEffect(() => {
    const q = searchText.trim();
    if (!searchOpen || q.length < 2) {
      setSearchHits(null);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void searchMessages(q, conversationId)
        .then((items) => {
          if (!alive) return;
          const ids = items.map((item) => item.id);
          setSearchHits(ids);
          setSearchCursor(0);
          if (ids.length) void jumpToMessage(ids[0]);
        })
        .catch(() => alive && setSearchHits([]));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [conversationId, jumpToMessage, searchOpen, searchText]);
  const stepSearch = useCallback(
    (delta: number) => {
      if (!searchHits?.length) return;
      const next = Math.max(0, Math.min(searchHits.length - 1, searchCursor + delta));
      setSearchCursor(next);
      void jumpToMessage(searchHits[next]);
    },
    [jumpToMessage, searchCursor, searchHits],
  );
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchText("");
    setSearchHits(null);
  }, []);

  /* ---------- satır çizimi ---------- */
  const pinnedId = conversation?.pinned_message_id ?? null;
  const renderItem = useCallback(
    ({ item }: { item: ChatRow }) => {
      if (item.type === "day") return <DayDivider label={item.label} />;
      if (item.type === "unread") return <UnreadDivider count={item.count} />;
      const message = item.type === "album" ? item.messages[item.messages.length - 1] : item.message;
      const isSelected = Boolean(selected?.has(message.id));
      const isHighlighted = highlight != null && (item.type === "album" ? item.messages.some((frame) => frame.id === highlight) : message.id === highlight);
      const adminName = admin && message.sender.is_management ? message.meta?.admin_name ?? null : null;
      if (item.type === "album") {
        return (
          <MessageBubble message={message} album={item.messages} first={item.first} last={item.last} grouped={grouped} participants={participants} pinned={pinnedId === message.id} selecting={selecting} selected={isSelected} highlighted={isHighlighted} adminName={adminName} actions={actions} />
        );
      }
      const shell = (children: React.ReactNode, center = false) => (
        <RowShell mine={message.sender.is_me} selecting={selecting && canInteract(message)} selected={isSelected} highlighted={isHighlighted} last={item.last} center={center} onPress={() => actions.onPress(message)} onLongPress={() => actions.onLongPress(message)}>
          {children}
          {center ? null : <ReactionChips message={message} onPress={actions.onReactions} />}
        </RowShell>
      );
      const showSender = grouped && !message.sender.is_me;
      if (!message.deleted) {
        switch (message.kind) {
          case "notification":
            return shell(<NotificationCard message={message} busyKey={busyKey} onAction={runAction} />, true);
          case "call":
            return shell(<CallChip message={message} />, true);
          case "system":
            return <SystemChip text={message.body ?? ""} />;
          case "match_offer":
            return shell(<MatchOfferBubble message={message} canRespond={!message.sender.is_me} busy={busyKey === `offer-${message.id}`} onRespond={respondOffer} />);
          case "attendance":
            return shell(<AttendanceCard message={message} viewerPlayerId={auth.user?.player_id} viewerUserId={viewerId} busy={busyKey === `att-${message.id}`} onRespond={respondAttendance} onRemove={removeAttendancePlayer} onAdd={openAttendancePicker} />);
          case "poll":
            if (!message.meta?.poll) break;
            return shell(<PollBubble message={message} showSender={showSender} viewerId={viewerId} busy={busyKey === `poll-${message.id}` || admin} onVote={vote} onVoters={(target) => setVotersOf(target.id)} />);
          case "matches":
            if (!message.meta?.matches) break;
            return shell(<MatchesCard message={message} showSender={showSender} onOpenMatch={(matchId) => router.push({ pathname: "/mac/[id]", params: { id: String(matchId) } })} />);
          case "signup":
            if (!message.meta?.signup) break;
            return shell(
              <SignupCard
                message={message}
                showSender={showSender}
                viewerId={viewerId}
                busySlot={busyKey?.startsWith(`signup-${message.id}-`) ? busyKey.slice(`signup-${message.id}-`.length) : null}
                onToggle={signup}
                onAssignMenu={canAssign ? openAssign : undefined}
                onCloseToggle={admin ? undefined : toggleSignupClosed}
              />,
            );
          case "award_poll":
            return shell(<AwardPollCard message={message} showSender={showSender} onOpenTodos={auth.isManagement ? () => router.push("/yonetim/gorevler") : undefined} />);
          default:
            break;
        }
      } else if (message.kind === "system" || message.kind === "call" || message.kind === "notification") {
        return null;
      }
      return (
        <MessageBubble message={message} first={item.first} last={item.last} grouped={grouped} participants={participants} pinned={pinnedId === message.id} selecting={selecting} selected={isSelected} highlighted={isHighlighted} adminName={adminName} actions={actions} />
      );
    },
    [actions, admin, auth.isManagement, auth.user?.player_id, busyKey, canAssign, grouped, highlight, openAssign, openAttendancePicker, participants, pinnedId, removeAttendancePlayer, respondAttendance, respondOffer, router, runAction, selected, selecting, signup, toggleSignupClosed, viewerId, vote],
  );

  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
    setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: false }), 160);
  }, []);

  if (!auth.user) return <Redirect href="/giris" />;

  /* ---------- başlık ---------- */
  const title = conversation?.title ?? "Sohbet";
  const status = !conversation
    ? ""
    : admin
      ? conversation.subtitle || "ElitLig Yönetimi sohbeti"
      : grouped
        ? participants.map((p) => (p.is_me ? "Sen" : p.name.split(" ")[0])).slice(0, 8).join(", ") || conversation.subtitle
        : lastSeenLabel(otherPresence) || conversation.subtitle;
  const openInfo = conversation && !admin && !conversation.is_admin_feed ? () => router.push({ pathname: "/sohbet/bilgi/[id]", params: { id: String(conversationId) } }) : undefined;
  const headerActions: HeaderAction[] = [
    ...(conversation?.can_call ? [{ icon: "call-outline" as const, label: "Sesli ara", onPress: () => void call.startCall(conversation) }] : []),
    ...(conversation && extras ? [{ icon: "search" as const, label: "Sohbette ara", onPress: () => setSearchOpen(true) }] : []),
    ...(conversation ? [{ icon: "ellipsis-vertical" as const, label: "Sohbet menüsü", onPress: () => setHeaderMenu(true) }] : []),
  ];
  const selectedList = selected ? messages.filter((item) => selected.has(item.id)) : [];
  const selectionActions = [
    { icon: "copy-outline" as const, label: "Seçilenleri kopyala", disabled: !selectedList.length || !selectedList.every((item) => item.kind === "text" && !item.deleted), onPress: () => { copy(selectedList); setSelected(null); } },
    ...(extras
      ? [
          { icon: "star-outline" as const, label: "Seçilenleri yıldızla", disabled: !selectedList.length || !selectedList.every(canInteract), onPress: () => { star(selectedList, !selectedList.every((item) => item.starred)); setSelected(null); } },
          { icon: "trash-outline" as const, label: "Seçilenleri herkesten sil", disabled: !selectedList.length || !selectedList.every(canDelete), onPress: () => removeMessages(selectedList) },
          { icon: "arrow-redo-outline" as const, label: "Seçilenleri ilet", disabled: !selectedList.length || !selectedList.every(canForward), onPress: () => setForwardIds(selectedList.map((item) => item.id)) },
        ]
      : []),
  ];
  const header = selecting ? (
    <SelectionHeader count={selected?.size ?? 0} onClose={() => setSelected(null)} actions={selectionActions} />
  ) : (
    <ChatHeader conversation={conversation} title={title} status={status} online={Boolean(otherPresence?.online)} onBack={goBack} onPressTitle={openInfo} actions={headerActions} />
  );

  if (!conversation) {
    return (
      <SafeAreaView style={styles.screenPlain} edges={["top"]}>
        <ChatStatusBar />
        {header}
        {query.isLoading ? (
          <View style={styles.skeleton}><SkeletonListRow count={6} avatar={false} /></View>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={refetch} />
        ) : (
          <EmptyState icon="chatbubble-ellipses-outline" title="Sohbet bulunamadı" body="Bu sohbet silinmiş ya da erişiminin dışında olabilir." action={{ label: "Mesajlara dön", onPress: () => router.replace("/(tabs)/mesajlar") }} />
        )}
      </SafeAreaView>
    );
  }

  const headerMenuItems: MessageMenuItem[] = admin
    ? [
        { key: "select", label: "Mesajları seç", icon: "checkmark-circle-outline", onPress: () => setSelected(new Set()) },
        ...(hasAnyPermission(auth.user, ["messages.delete"])
          ? [
              {
                key: "delete",
                label: "Sohbeti sil",
                icon: "trash-outline" as const,
                danger: true,
                onPress: () =>
                  Alert.alert("Sohbeti sil", `"${conversation.title}" sohbeti yönetim kutusundan kaldırılacak; kayıt çöp kutusuna taşınır. Üye yeniden yazarsa sohbet yeniden açılır.`, [
                    { text: "Vazgeç", style: "cancel" },
                    {
                      text: "Sil",
                      style: "destructive",
                      onPress: () =>
                        void adminChat
                          .deleteConversation(conversationId)
                          .then((data) => {
                            queryClient.removeQueries({ queryKey: queryKeys.chatMessages(conversationId) });
                            void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
                            toast.show({ message: data.message ?? "Sohbet silindi.", tone: "success" });
                            goBack();
                          })
                          .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" })),
                    },
                  ]),
              },
            ]
          : []),
      ]
    : ([
        openInfo && { key: "info", label: grouped ? "Grup bilgisi" : "Kişi bilgisi", icon: "information-circle-outline", onPress: openInfo },
        openInfo && { key: "media", label: "Medya, bağlantılar ve belgeler", icon: "images-outline", onPress: () => router.push({ pathname: "/sohbet/bilgi/[id]", params: { id: String(conversationId), bolum: "medya" } }) },
        { key: "starred", label: "Yıldızlı mesajlar", icon: "star-outline", onPress: () => router.push({ pathname: "/sohbet/yildizli", params: { sohbet: String(conversationId) } }) },
        { key: "select", label: "Mesajları seç", icon: "checkmark-circle-outline", onPress: () => setSelected(new Set()) },
        { key: "mute", label: conversation.muted ? "Bildirimleri aç" : "Sessize al", icon: conversation.muted ? "notifications-outline" : "notifications-off-outline", onPress: () => conversationActions.mute(conversation) },
        !conversation.archived && { key: "pin", label: conversation.pinned ? "Sohbet sabitlemesini kaldır" : "Sohbeti sabitle", icon: "pin-outline", onPress: () => conversationActions.pin(conversation) },
        { key: "archive", label: conversation.archived ? "Arşivden çıkar" : "Arşivle", icon: "archive-outline", onPress: () => conversationActions.archive(conversation) },
        { key: "unread", label: "Okunmadı olarak işaretle", icon: "ellipse", onPress: () => { conversationActions.markUnread(conversation); goBack(); } },
        other && other.kind !== "staff" && { key: "block", label: conversation.blocked_by_me ? "Engeli kaldır" : "Engelle", icon: "ban-outline", danger: !conversation.blocked_by_me, onPress: () => conversationActions.block(conversation) },
        !conversation.is_admin_feed && !conversation.is_management && other?.kind !== "staff" && { key: "report", label: "Şikayet et", icon: "flag-outline", danger: true, onPress: () => setReport({ userId: other?.user_id ?? null, userName: other?.name ?? null, conversationId }) },
        conversation.type === "group" && { key: "leave", label: "Gruptan çık", icon: "exit-outline", danger: true, onPress: () => conversationActions.leave(conversation, goBack) },
        !conversation.is_admin_feed && { key: "delete", label: "Sohbeti sil", icon: "trash-outline", danger: true, onPress: () => conversationActions.remove(conversation, goBack) },
      ].filter(Boolean) as MessageMenuItem[]);

  const pinnedMessage = pinnedId ? messages.find((item) => item.id === pinnedId) : null;
  const pinnedSummary = pinnedMessage ? messageSummary(pinnedMessage) : null;
  const emptyText = conversation.type === "management"
    ? admin ? "Üyenin ElitLig Yönetimi sohbeti. Yanıtların yönetim adına gider." : "Yönetimle yazışmaların burada birikir."
    : conversation.type === "admin" ? "Onay bekleyen işlemler burada kart olarak görünür."
      : grouped ? "Grupta henüz mesaj yok. İlk mesajı sen yaz." : `${conversation.title} ile sohbeti başlat.`;
  const assignSlot = assign ? assign.message.meta?.signup?.slots.find((slot) => slot.id === assign.slotId) : null;
  const assignVolunteers = assign ? (messages.find((item) => item.id === assign.message.id) ?? assign.message).meta?.signup?.volunteers?.[assign.slotId] ?? [] : [];
  const reactionsMessage = reactionsOf ? messages.find((item) => item.id === reactionsOf) ?? null : null;
  const votersMessage = votersOf ? messages.find((item) => item.id === votersOf) ?? null : null;
  const showConnecting = LIVE_SOCKET_ENABLED && !connected;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ChatStatusBar />
      {/* Üst güvenli alan başlık rengindedir; alt güvenli alan yazma çubuğunun (duvarın) rengini alır. */}
      <View pointerEvents="none" style={[styles.topInset, { height: insets.top }]} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {header}

        {searchOpen ? (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textTertiary} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Bu sohbette ara"
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.brand}
              cursorColor={colors.brand}
              autoFocus
              returnKeyType="search"
              accessibilityLabel="Bu sohbette ara"
              style={styles.searchInput}
              {...textScale.dense}
            />
            <Text style={styles.searchCount} {...textScale.badge}>
              {searchHits == null ? "" : searchHits.length ? `${searchCursor + 1}/${searchHits.length}` : "Sonuç yok"}
            </Text>
            <Touchable feedback="icon" haptic="selection" onPress={() => stepSearch(1)} disabled={!searchHits?.length || searchCursor >= (searchHits?.length ?? 0) - 1} accessibilityRole="button" accessibilityLabel="Önceki (daha eski) sonuç" style={styles.searchButton}>
              <Ionicons name="chevron-up" size={22} color={colors.textSecondary} />
            </Touchable>
            <Touchable feedback="icon" haptic="selection" onPress={() => stepSearch(-1)} disabled={!searchHits?.length || searchCursor <= 0} accessibilityRole="button" accessibilityLabel="Sonraki (daha yeni) sonuç" style={styles.searchButton}>
              <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
            </Touchable>
            <Touchable feedback="icon" haptic="light" onPress={closeSearch} accessibilityRole="button" accessibilityLabel="Aramayı kapat" style={styles.searchButton}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Touchable>
          </View>
        ) : null}

        {pinnedId && !selecting ? (
          <Touchable feedback="row" haptic="selection" onPress={() => void jumpToMessage(pinnedId)} accessibilityRole="button" accessibilityLabel={`Sabitlenmiş mesaj: ${pinnedSummary?.text ?? "görmek için dokun"}`} style={styles.pinBar}>
            <Ionicons name="pin" size={16} color={colors.brandAccent} />
            <View style={styles.pinBody}>
              <Text style={styles.pinTitle} {...textScale.badge}>Sabitlenmiş mesaj</Text>
              <Text style={styles.pinText} numberOfLines={1} {...textScale.dense}>
                {pinnedMessage ? `${pinnedMessage.sender.is_me ? "Sen" : pinnedMessage.sender.name ?? "Üye"}: ${pinnedSummary?.text ?? ""}` : "Görmek için dokun"}
              </Text>
            </View>
            {extras ? (
              <Touchable feedback="icon" haptic="light" onPress={() => pin(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Sabitlemeyi kaldır" style={styles.pinClose}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Touchable>
            ) : null}
          </Touchable>
        ) : null}

        {query.isError ? <ErrorState error={query.error} onRetry={refetch} variant="banner" style={styles.banner} /> : null}
        {showConnecting ? (
          <View style={styles.connecting} accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.connectingText} {...textScale.dense}>Canlı bağlantı kuruluyor… Yazdığın metin mesajları bağlantı gelince gönderilir.</Text>
          </View>
        ) : null}

        <View style={styles.wall}>
          <Wallpaper />
          {rows.length ? (
            <FlatList
              ref={listRef}
              data={rows}
              inverted
              keyExtractor={rowKey}
              renderItem={renderItem}
              onScroll={onScroll}
              scrollEventThrottle={64}
              contentContainerStyle={styles.thread}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              onEndReached={() => void loadOlder()}
              onEndReachedThreshold={0.4}
              onScrollToIndexFailed={onScrollToIndexFailed}
              maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
              initialNumToRender={18}
              maxToRenderPerBatch={12}
              windowSize={11}
              ListFooterComponent={
                loadingOlder ? (
                  <SystemChip text="Eski mesajlar yükleniyor…" icon="time-outline" />
                ) : !query.data?.has_more ? (
                  <SystemChip text={admin ? "Üyenin ElitLig Yönetimi sohbeti · yanıtların yönetim adına gider." : "Mesajlar ElitLig sunucusunda saklanır; yalnız sohbetteki kişiler görür."} icon="lock-closed" />
                ) : null
              }
            />
          ) : (
            <View style={styles.empty}>
              {query.isLoading ? <SkeletonListRow count={5} avatar={false} /> : <SystemChip text={emptyText} icon="lock-closed" />}
            </View>
          )}
          {!atBottom && rows.length ? (
            <Touchable feedback="fab" haptic="light" onPress={() => scrollToBottom(true)} accessibilityRole="button" accessibilityLabel={newBelow ? `${newBelow} yeni mesaj. En alta git` : "En alta git"} style={[elevate(3), styles.down]}>
              <Ionicons name="chevron-down" size={24} color={colors.textSecondary} />
              {newBelow ? (
                <View style={styles.downBadge}>
                  <Text style={styles.downBadgeText} {...textScale.badge}>{newBelow > 99 ? "99+" : newBelow}</Text>
                </View>
              ) : null}
            </Touchable>
          ) : null}
        </View>

        {selecting ? null : conversation.blocked_by_me ? (
          <View style={styles.notice}>
            <Ionicons name="ban" size={18} color={colors.textSecondary} />
            <Text style={styles.noticeText} {...textScale.long}>Bu üyeyi engelledin. Mesaj yazamaz ve arayamazsın.</Text>
            <Button label="Engeli kaldır" variant="secondary" size="sm" onPress={() => conversationActions.block(conversation)} />
          </View>
        ) : disabledReason ? (
          <View style={styles.notice}>
            <Ionicons name="lock-closed" size={18} color={colors.textSecondary} />
            <Text style={styles.noticeText} {...textScale.long}>{disabledReason}</Text>
          </View>
        ) : (
          <Composer
            conversationId={conversationId}
            placeholder={conversation.type === "management" ? (admin ? "ElitLig Yönetimi adına yaz…" : "Yönetime mesaj yaz…") : "Mesaj yaz"}
            participants={mentionPeople}
            reply={reply}
            edit={edit}
            onCancelReply={() => setReply(null)}
            onCancelEdit={() => setEdit(null)}
            onSendText={sendText}
            onSaveEdit={saveEdit}
            onAttach={() => setAttach("menu")}
            onCamera={() => onPick("camera")}
            onVoice={sendVoice}
            noTyping={admin}
          />
        )}
      </KeyboardAvoidingView>

      <MessageMenu message={menuTarget} items={menuItems} onReact={extras && menuTarget && canInteract(menuTarget) && !menuTarget.failed ? (emoji) => react(menuTarget, emoji) : undefined} onClose={() => setMenu(null)} />
      <ActionMenu visible={headerMenu} title={conversation.title} items={headerMenuItems} onClose={() => setHeaderMenu(false)} />
      <ReactionsSheet message={reactionsMessage} viewerId={viewerId} onClose={() => setReactionsOf(null)} onRemoveMine={(message) => { setReactionsOf(null); react(message, ""); }} />
      <MessageInfoSheet conversationId={conversationId} message={infoOf} onClose={() => setInfoOf(null)} />
      <VotersSheet message={votersMessage} participants={participants} viewerId={viewerId} onClose={() => setVotersOf(null)} />
      <ForwardSheet visible={Boolean(forwardIds)} count={forwardIds?.length ?? 0} busy={forwardBusy} onClose={() => setForwardIds(null)} onSend={forward} />
      <ActionMenu
        visible={Boolean(assign)}
        title={assignSlot ? `Görevlendir · ${assignSlot.duty_label}` : "Görevlendir"}
        onClose={() => setAssign(null)}
        items={
          assign
            ? [
                ...assignVolunteers.map((person) => ({
                  key: `v-${person.user_id}`,
                  label: Number(assignSlot?.assigned?.user_id) === Number(person.user_id) ? `${person.name} (görevli)` : person.name,
                  icon: (Number(assignSlot?.assigned?.user_id) === Number(person.user_id) ? "checkmark-circle" : "person-outline") as keyof typeof Ionicons.glyphMap,
                  onPress: () => assignTo(assign.message, assign.slotId, person.user_id, person.name),
                })),
                ...(assignSlot?.assigned ? [{ key: "clear", label: "Görevi boşalt", icon: "close-circle-outline" as const, danger: true, onPress: () => assignTo(assign.message, assign.slotId, null) }] : []),
              ]
            : []
        }
      />
      <AttachSheet
        mode={attach}
        onChangeMode={setAttach}
        conversation={conversation}
        admin={admin}
        onSendLocation={onSendLocation}
        onSendPoll={canWrite && !admin ? onSendPoll : undefined}
        onPick={onPick}
        contentKeys={contentKeys}
        onContent={(key) => setTimeout(() => setContent(key), 260)}
      />
      <AttachPreviewSheet files={picked} onClose={() => setPicked(null)} onSend={(files, caption) => void sendFiles(files, caption)} />
      <MatchesSheet visible={content === "matches"} title={conversation.title} onClose={() => setContent(null)} onSend={(body) => sendContent(sendContentMatches(conversationId, body), "Maç programı gönderildi.")} />
      <SignupSheet visible={content === "signup"} title={conversation.title} onClose={() => setContent(null)} onSend={(body) => sendContent(sendContentSignup(conversationId, body), "Görev anketi gönderildi.")} />
      <AwardSheet visible={content === "award"} title={conversation.title} onClose={() => setContent(null)} onSend={(body) => sendContent(sendContentAward(conversationId, body), "Haftanın Enleri anketi gönderildi; aday öneri kartları açıldı.")} />
      <ImageViewer
        images={images}
        index={viewerIndex >= 0 ? viewerIndex : null}
        onClose={() => setViewer(null)}
        onReply={canWrite ? (image) => { const target = messages.find((item) => item.id === image.messageId); setViewer(null); if (target) { setEdit(null); setReply(target); } } : undefined}
        onForward={extras ? (image) => { setViewer(null); if (image.messageId) setForwardIds([image.messageId]); } : undefined}
      />
      <ReportSheet target={report} onClose={() => setReport(null)} onBlocked={() => { void queryClient.invalidateQueries({ queryKey: queryKeys.chatMessages(conversationId) }); void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() }); void queryClient.invalidateQueries({ queryKey: queryKeys.chatBlocks() }); }} />
      <BottomSheet visible={Boolean(attendancePick)} onClose={() => setAttendancePick(null)} title="Yoklamaya oyuncu ekle" snap="half" scrollable={false}>
        <Text style={styles.attendanceHint} {...textScale.long}>Seçtiğin oyuncu gruba alınır ve maç kadrosuna yedek olarak eklenir.</Text>
        <FlatList
          data={attendanceCandidates}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Touchable feedback="row" haptic="selection" onPress={() => addAttendancePlayer(item.id)} style={styles.attendanceRow} accessibilityLabel={`${item.player_name} ekle`}>
              <Text style={styles.attendanceName} numberOfLines={1}>{item.player_name}</Text>
              <Text style={styles.attendanceMeta}>{item.team_position ?? item.profile_position ?? ""}</Text>
              <Ionicons name="add-circle-outline" size={20} color={colors.brandAccent} />
            </Touchable>
          )}
          ListEmptyComponent={<Text style={styles.attendanceHint}>{rosterQuery.isLoading ? "Kadro yükleniyor…" : "Eklenecek oyuncu kalmadı."}</Text>}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

/** İyimser balonu listeye ekler (aynı `client_id` varsa dokunmaz). */
function mergeMessagesKeepLocal(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return list.some((item) => item.client_id === message.client_id) ? list : [...list, message];
}

/* ---------- duvar kâğıdı ---------- */

const DOODLES: (keyof typeof Ionicons.glyphMap)[] = ["football-outline", "trophy-outline", "chatbubble-outline", "shirt-outline", "star-outline", "flag-outline", "stopwatch-outline", "people-outline", "medal-outline", "megaphone-outline", "heart-outline", "happy-outline"];

/** WhatsApp duvarındaki soluk desen: sabit, dokunulmaz, bir kez çizilir. */
const Wallpaper = memo(function Wallpaper() {
  return (
    <View style={styles.wallpaper} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 48 }, (_unused, index) => (
        <View key={index} style={[styles.doodle, index % 2 ? styles.doodleShift : null]}>
          <Ionicons name={DOODLES[(index * 5 + Math.floor(index / 4)) % DOODLES.length]} size={26} color={chatPalette.wallPattern} />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  /* Zemin yazma çubuğunun rengidir (alt güvenli alan onunla dolar); üst güvenli
     alanı `topInset` başlık rengine boyar. */
  screen: { flex: 1, backgroundColor: wa.composerBar },
  screenPlain: { flex: 1, backgroundColor: colors.surface1 },
  topInset: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: colors.surface1 },
  flex: { flex: 1 },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  banner: { marginHorizontal: layout.screenPadding, marginVertical: space.xs },
  wall: { flex: 1, backgroundColor: chatPalette.wall },
  wallpaper: { ...StyleSheet.absoluteFillObject, flexDirection: "row", flexWrap: "wrap", overflow: "hidden" },
  doodle: { width: "25%", height: 92, alignItems: "center", justifyContent: "center" },
  doodleShift: { transform: [{ translateY: 22 }, { rotate: "-14deg" }] },
  thread: { paddingVertical: space.sm },
  empty: { flex: 1, justifyContent: "flex-end", paddingHorizontal: layout.screenPadding, paddingBottom: space.lg },

  searchBar: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingLeft: space.md, paddingRight: space.xs, minHeight: 48, backgroundColor: colors.surface1, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  searchInput: { ...type.body, flex: 1, color: colors.textPrimary, paddingVertical: space.sm, ...({ outlineStyle: "none" } as object) },
  searchCount: { ...type.numSm, color: colors.textTertiary },
  searchButton: { width: 38, height: 44, alignItems: "center", justifyContent: "center" },

  pinBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.md, minHeight: 48, backgroundColor: colors.surface1, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  pinBody: { flex: 1, minWidth: 0 },
  pinTitle: { ...type.labelXs, color: colors.brandAccent },
  pinText: { ...type.bodySm, color: colors.textSecondary },
  pinClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },

  connecting: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs, backgroundColor: colors.surface1, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  connectingText: { ...type.caption, color: colors.textSecondary, flex: 1 },

  down: { position: "absolute", right: space.md, bottom: space.md, width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: chatPalette.bubbleTheirs, borderWidth: 0 },
  downBadge: { position: "absolute", top: -space.s, right: -space.xs, minWidth: 20, height: 20, paddingHorizontal: space.xs, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: wa.badge },
  downBadgeText: { ...type.nano, color: wa.onBadge },

  notice: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: layout.screenPadding, paddingVertical: space.md, backgroundColor: wa.composerBar },
  noticeText: { ...type.caption, color: colors.textSecondary, flex: 1 },

  attendanceHint: { ...type.bodySm, color: colors.textSecondary, paddingVertical: space.xs },
  attendanceRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  attendanceName: { ...type.body, color: colors.textPrimary, flex: 1 },
  attendanceMeta: { ...type.caption, color: colors.textTertiary },
});
