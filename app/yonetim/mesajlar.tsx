/**
 * MESAJ YÖNETİMİ — üye başvuru kutusunun yönetici yüzü.
 *
 * İKİ KATMAN: dışta zincir listesi (durum çipleri + arama + okunmamış rozeti),
 * içte TAM EKRAN yazışma. Yazışma ayrı bir rota değil, tam ekran bir katmandır;
 * böylece listenin süzgeci, kaydırma yeri ve yoklama durumu kapanınca aynen
 * korunur (yönetici sırayla onlarca başvuruyu açıp kapatır).
 *
 * BALON YÖNÜ: üye SOLDA, yönetim SAĞDA. Yön `direction` alanından okunur —
 * "to_member" yönetimin yazdığı, "to_admin" üyenin yazdığıdır.
 *
 * NEDEN "YANIT SONRASI DURUM": yanıtlamak ile zinciri kapatmak ayrı iki iş gibi
 * görünse de pratikte tek karardır. Sunucu `reply` ucunda durumu birlikte
 * kabul ettiği için gönderme anında seçilir; iki istek ve iki dokunuş yerine
 * bir tane olur.
 *
 * NEDEN YOKLAMA: mesaj ve bildirimler için soket yoktur (sunucu sözleşmesi) —
 * ekran açıkken 10 sn'de bir yoklanır, uygulama arkaya alınınca durur.
 *
 * ONAY GEREKTİRENLER: zinciri kapatmak (üye yeni mesaj yazamaz) ve silmek
 * (çöp kutusuna taşır). İkisi de Alert ile doğrulanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Avatar,
  Badge,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SkeletonListRow,
  Touchable,
  errorMessage,
  useHeaderScroll,
  useRefresh,
  useToast,
  withAlpha,
  type ScreenHeaderAction,
  type Tone,
} from "@/components/ui";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import {
  deleteAdminThread,
  getAdminMessages,
  markAdminThreadRead,
  MESSAGE_PRIORITY_LABELS,
  MESSAGE_STATUS_LABELS,
  replyAdminThread,
  updateAdminThread,
  type AdminThread,
  type AdminThreadMessage,
  type MessagePriority,
  type MessageStatus,
} from "@/lib/api/admin";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ═══════════════════════════ SABİTLER VE YARDIMCILAR ═══════════════════════ */

const STATUS_ORDER: MessageStatus[] = ["open", "in_review", "answered", "closed"];
const REPLY_STATUSES: MessageStatus[] = ["answered", "in_review", "closed"];
const PRIORITY_ORDER: MessagePriority[] = ["low", "normal", "high", "urgent"];

/** Durum → ton. "Açık" bekleyen iştir, bu yüzden uyarı tonunda okunur. */
const STATUS_TONE: Record<MessageStatus, Tone> = {
  open: "warn",
  in_review: "info",
  answered: "win",
  closed: "neutral",
};

/** Öncelik → ton. Acil kırmızı, yüksek turuncu, normal/düşük sessiz. */
const PRIORITY_TONE: Record<MessagePriority, Tone> = {
  low: "neutral",
  normal: "neutral",
  high: "warn",
  urgent: "danger",
};

/** Arama her tuşta sunucuya gitmesin. */
const SEARCH_DEBOUNCE_MS = 300;

/** Ekran açıkken sessiz yoklama aralığı. */
const POLL_MS = 10_000;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveStatus(raw: unknown): MessageStatus | null {
  const key = typeof raw === "string" ? raw.trim() : "";
  return (STATUS_ORDER as string[]).includes(key) ? (key as MessageStatus) : null;
}

/** Bugün ise saat, başka günse kısa tarih. */
function smartDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }
  return formatDateShort(iso);
}

/* ══════════════════════════════════ EKRAN ═════════════════════════════════ */

export default function AdminMessagesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const appActive = useAppActive();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ durum?: string | string[] }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  /** Durum süzgeci ROTADA taşınır (bildirimden gelen bağlantı doğru çipe düşer). */
  const status = resolveStatus(firstParam(params.durum));

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [openThreadId, setOpenThreadId] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  /* ───────────────────────────── VERİ ───────────────────────────── */

  const query = useQuery({
    queryKey: ["admin", "messages", "list", status, debouncedSearch],
    queryFn: () =>
      getAdminMessages({
        status: status ?? undefined,
        search: debouncedSearch || undefined,
        limit: 300,
      }),
    enabled: Boolean(auth.user) && auth.isManagement,
    staleTime: 5_000,
    refetchInterval: appActive ? POLL_MS : false,
    retry: false,
  });

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "messages"] });
  }, [queryClient]);

  const refresh = useRefresh(refetch, { refreshing: query.isRefetching });

  const threads = useMemo(() => query.data?.threads ?? [], [query.data]);
  const counts = query.data?.counts;
  const openThread = useMemo(
    () => threads.find((thread) => thread.id === openThreadId) ?? null,
    [threads, openThreadId],
  );

  /* ──────────────────────────── EYLEMLER ──────────────────────────── */

  const readMutation = useMutation({
    mutationFn: (threadId: number) => markAdminThreadRead(threadId),
    onSuccess: refetch,
    // Okundu işareti ikincil bir yan etkidir; hatası kullanıcıyı rahatsız etmez.
    onError: () => {},
  });

  // NOT: `mutate` referansı TanStack v5'te kararlıdır; bağımlılığa mutation
  // NESNESİ verilirse her çizimde değişir ve memo'lu satırlar boşa çizilir.
  const markRead = readMutation.mutate;

  const openThreadView = useCallback(
    (threadId: number) => {
      setOpenThreadId(threadId);
      markRead(threadId);
    },
    [markRead],
  );

  const closeThreadView = useCallback(() => setOpenThreadId(null), []);

  /**
   * GERİ BİLDİRİM KANALI: Toast yerel `Modal` katmanının ALTINDA kalır — tam
   * ekran yazışma açıkken görünmez. Bu yüzden yazışmadan tetiklenen hatalar
   * Alert ile (yerel katman, her zaman üstte) söylenir; başarının kanıtı
   * ekranın kendisidir (yeni balon, güncellenen durum/öncelik rozeti). Yalnız
   * SİLME, yazışmayı kapattığı için Toast kullanır.
   */
  const replyMutation = useMutation({
    mutationFn: (input: { threadId: number; body: string; status: MessageStatus }) =>
      replyAdminThread(input.threadId, input.body, input.status),
    onSuccess: () => refetch(),
    onError: (error) => Alert.alert("Yanıt gönderilemedi", errorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      threadId: number;
      updates: { status?: MessageStatus; priority?: MessagePriority };
    }) => updateAdminThread(input.threadId, input.updates),
    onSuccess: refetch,
    onError: (error) => Alert.alert("Güncellenemedi", errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (threadId: number) => deleteAdminThread(threadId),
    onSuccess: () => {
      setOpenThreadId(null);
      refetch();
      toast.show({ message: "Zincir çöp kutusuna taşındı.", tone: "neutral" });
    },
    onError: (error) => Alert.alert("Silinemedi", errorMessage(error)),
  });

  const removeThread = deleteMutation.mutate;
  const updateThread = updateMutation.mutate;
  const postReply = replyMutation.mutate;

  const confirmDelete = useCallback(
    (thread: AdminThread) => {
      Alert.alert(
        "Zinciri sil",
        `"${thread.subject}" başvurusu çöp kutusuna taşınacak. Üye bu yazışmayı bir daha göremez.`,
        [
          { text: "Vazgeç", style: "cancel" },
          { text: "Sil", style: "destructive", onPress: () => removeThread(thread.id) },
        ],
      );
    },
    [removeThread],
  );

  const confirmToggleClosed = useCallback(
    (thread: AdminThread) => {
      const closing = thread.status !== "closed";
      Alert.alert(
        closing ? "Zinciri kapat" : "Zinciri yeniden aç",
        closing
          ? "Kapatılan başvuruya üye yeni mesaj yazamaz. İstediğiniz zaman yeniden açabilirsiniz."
          : "Başvuru yeniden açılacak ve üye yazışmaya devam edebilecek.",
        [
          { text: "Vazgeç", style: "cancel" },
          {
            text: closing ? "Kapat" : "Yeniden aç",
            style: closing ? "destructive" : "default",
            onPress: () =>
              updateThread({
                threadId: thread.id,
                updates: { status: closing ? "closed" : "open" },
              }),
          },
        ],
      );
    },
    [updateThread],
  );

  const changePriority = useCallback(
    (threadId: number, priority: MessagePriority) => {
      updateThread({ threadId, updates: { priority } });
    },
    [updateThread],
  );

  const sendReply = useCallback(
    (threadId: number, body: string, nextStatus: MessageStatus) => {
      postReply({ threadId, body, status: nextStatus });
    },
    [postReply],
  );

  const selectStatus = useCallback(
    (next: MessageStatus | null) => {
      router.setParams({ durum: next ?? "" });
    },
    [router],
  );

  /* ───────────────────────────── ÇİZİM ───────────────────────────── */

  const renderItem = useCallback(
    ({ item }: { item: AdminThread }) => <ThreadRow thread={item} onPress={openThreadView} />,
    [openThreadView],
  );

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }
  if (!auth.isManagement) {
    return <Redirect href="/yonetim" />;
  }

  const unreadTotal = counts?.unread ?? 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Mesaj Yönetimi"
        subtitle={
          unreadTotal > 0 ? `${unreadTotal} okunmamış başvuru` : "Tüm başvurular okundu"
        }
        back
        scrollY={scrollY}
        bottom={
          <View style={styles.controls}>
            <ChipGroup>
              <Chip label="Tümü" selected={status === null} onPress={() => selectStatus(null)} />
              {STATUS_ORDER.map((item) => (
                <Chip
                  key={item}
                  label={MESSAGE_STATUS_LABELS[item]}
                  count={counts ? counts[item] : undefined}
                  tone={STATUS_TONE[item]}
                  selected={status === item}
                  onPress={() => selectStatus(status === item ? null : item)}
                />
              ))}
            </ChipGroup>

            <Input
              variant="search"
              size="sm"
              value={search}
              onChangeText={setSearch}
              placeholder="Konu, gönderen veya metin ara…"
              autoCorrect={false}
              containerStyle={styles.search}
              accessibilityLabel="Başvurularda ara"
            />
          </View>
        }
      />

      {query.isLoading ? (
        <View style={styles.skeleton}>
          <SkeletonListRow count={6} avatar />
        </View>
      ) : query.isError && threads.length === 0 ? (
        <ErrorState error={query.error} onRetry={refetch} />
      ) : (
        <FlatList
          {...scrollProps}
          data={threads}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={refresh.control}
          initialNumToRender={10}
          windowSize={8}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            query.isError ? (
              <ErrorState
                error={query.error}
                onRetry={refetch}
                variant="banner"
                style={styles.banner}
              />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="Başvuru yok"
              body={
                debouncedSearch
                  ? "Aramanızla eşleşen başvuru bulunamadı."
                  : "Bu durumda bekleyen üye başvurusu bulunmuyor."
              }
              action={
                status || debouncedSearch
                  ? {
                      label: "Süzgeci temizle",
                      onPress: () => {
                        setSearch("");
                        selectStatus(null);
                      },
                    }
                  : undefined
              }
            />
          }
        />
      )}

      {/* Tam ekran yazışma */}
      <Modal
        visible={openThread !== null}
        animationType="slide"
        onRequestClose={closeThreadView}
        statusBarTranslucent
      >
        {openThread ? (
          <ThreadView
            thread={openThread}
            onClose={closeThreadView}
            onDelete={confirmDelete}
            onToggleClosed={confirmToggleClosed}
            onChangePriority={changePriority}
            onSendReply={sendReply}
            sending={replyMutation.isPending}
            updating={updateMutation.isPending}
          />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const keyExtractor = (item: AdminThread) => String(item.id);

/* ═══════════════════════════════ LİSTE SATIRI ══════════════════════════════ */

/**
 * Zincir satırı. Okunmamışsa marka çerçevesi + sağda sayı rozeti alır; okunmuş
 * satır tamamen sessizdir — liste "işi olan" satırların üzerinde durur.
 */
const ThreadRow = memo(function ThreadRow({
  thread,
  onPress,
}: {
  thread: AdminThread;
  onPress: (threadId: number) => void;
}) {
  const handlePress = useCallback(() => onPress(thread.id), [onPress, thread.id]);
  const unread = thread.unread > 0;

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${thread.sender}, ${thread.subject}. ${
        unread ? `${thread.unread} okunmamış mesaj` : thread.status_label
      }`}
      style={[styles.row, unread ? styles.rowUnread : null]}
    >
      <Avatar name={thread.sender} size={36} />

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text
            style={[styles.sender, unread ? styles.senderUnread : null]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {thread.sender}
          </Text>
          <Text style={styles.time} {...textScale.dense}>
            {smartDate(thread.last_message_at)}
          </Text>
        </View>

        <Text style={styles.subject} numberOfLines={1} {...textScale.dense}>
          {thread.subject}
        </Text>

        <Text style={styles.preview} numberOfLines={2} {...textScale.dense}>
          {thread.last_message_preview}
        </Text>

        <View style={styles.tagRow}>
          <Badge label={thread.status_label} tone={STATUS_TONE[thread.status]} size="xs" />
          {thread.priority === "high" || thread.priority === "urgent" ? (
            <Badge
              label={thread.priority_label}
              tone={PRIORITY_TONE[thread.priority]}
              size="xs"
            />
          ) : null}
          {thread.category_label ? (
            <Badge label={thread.category_label} tone="neutral" size="xs" />
          ) : null}
          {thread.message_count > 1 ? (
            <Text style={styles.countText} {...textScale.badge}>
              {thread.message_count} mesaj
            </Text>
          ) : null}
        </View>
      </View>

      {unread ? <Badge label={thread.unread} tone="live" variant="solid" size="sm" /> : null}
    </Touchable>
  );
});

/* ══════════════════════════════ YAZIŞMA EKRANI ═════════════════════════════ */

const ThreadView = memo(function ThreadView({
  thread,
  onClose,
  onDelete,
  onToggleClosed,
  onChangePriority,
  onSendReply,
  sending,
  updating,
}: {
  thread: AdminThread;
  onClose: () => void;
  onDelete: (thread: AdminThread) => void;
  onToggleClosed: (thread: AdminThread) => void;
  onChangePriority: (threadId: number, priority: MessagePriority) => void;
  onSendReply: (threadId: number, body: string, status: MessageStatus) => void;
  sending: boolean;
  updating: boolean;
}) {
  const listRef = useRef<FlatList<AdminThreadMessage>>(null);
  const [reply, setReply] = useState("");
  const [replyStatus, setReplyStatus] = useState<MessageStatus>("answered");

  const closed = thread.status === "closed";
  const messageCount = thread.messages.length;

  /** Yeni mesaj düştükçe (ve açılışta) yazışmanın sonuna kay. */
  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(timer);
  }, [messageCount]);

  const canSend = reply.trim().length >= 2 && !sending;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSendReply(thread.id, reply.trim(), replyStatus);
    setReply("");
  }, [canSend, onSendReply, reply, replyStatus, thread.id]);

  const actions = useMemo<ScreenHeaderAction[]>(
    () => [
      {
        icon: closed ? "lock-open-outline" : "lock-closed-outline",
        onPress: () => onToggleClosed(thread),
        accessibilityLabel: closed ? "Zinciri yeniden aç" : "Zinciri kapat",
      },
      {
        icon: "trash-outline",
        tone: "danger",
        onPress: () => onDelete(thread),
        accessibilityLabel: "Zinciri sil",
      },
    ],
    [closed, onDelete, onToggleClosed, thread],
  );

  const renderMessage = useCallback(
    ({ item }: { item: AdminThreadMessage }) => <Bubble message={item} />,
    [],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScreenHeader
          title={thread.subject}
          subtitle={[thread.sender, thread.category_label].filter(Boolean).join(" · ")}
          back
          onBack={onClose}
          actions={actions}
        />

        {/* Durum + öncelik şeridi */}
        <View style={styles.threadMeta}>
          <Badge label={thread.status_label} tone={STATUS_TONE[thread.status]} size="xs" />
          <Text style={styles.threadMetaLabel} {...textScale.dense}>
            Öncelik
          </Text>
          <ChipGroup contentPadding={0} gap={space.xs} style={styles.priorityGroup}>
            {PRIORITY_ORDER.map((priority) => (
              <Chip
                key={priority}
                label={MESSAGE_PRIORITY_LABELS[priority]}
                size="sm"
                tone={PRIORITY_TONE[priority]}
                selected={thread.priority === priority}
                disabled={thread.priority === priority || updating}
                onPress={() => onChangePriority(thread.id, priority)}
              />
            ))}
          </ChipGroup>
        </View>

        {/* Balonlar: üye solda, yönetim sağda */}
        <FlatList
          ref={listRef}
          data={thread.messages}
          keyExtractor={messageKey}
          renderItem={renderMessage}
          contentContainerStyle={styles.bubbles}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          initialNumToRender={20}
        />

        {/* Yanıt kutusu */}
        <View style={styles.composer}>
          <View style={styles.replyStatusRow}>
            <Text style={styles.replyStatusLabel} {...textScale.dense}>
              Yanıt sonrası
            </Text>
            {REPLY_STATUSES.map((item) => (
              <Chip
                key={item}
                label={MESSAGE_STATUS_LABELS[item]}
                size="sm"
                tone={STATUS_TONE[item]}
                selected={replyStatus === item}
                onPress={() => setReplyStatus(item)}
              />
            ))}
          </View>

          <View style={styles.replyRow}>
            <Input
              value={reply}
              onChangeText={setReply}
              placeholder={closed ? "Zincir kapalı — yanıt yeniden açar" : "Yanıtınızı yazın…"}
              multiline
              containerStyle={styles.replyInput}
              accessibilityLabel="Yanıt metni"
            />
            <Touchable
              feedback="button"
              haptic="medium"
              onPress={handleSend}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Yanıtı gönder"
              accessibilityState={{ disabled: !canSend }}
              style={[styles.sendButton, canSend ? null : styles.sendButtonDisabled]}
            >
              <Ionicons
                name="send"
                size={17}
                color={canSend ? colors.textOnBrand : colors.textDisabled}
              />
            </Touchable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
});

const messageKey = (item: AdminThreadMessage) => String(item.id);

/** Tek balon. Yön `direction`'dan okunur; yönetimin yazdığı sağda ve markadır. */
const Bubble = memo(function Bubble({ message }: { message: AdminThreadMessage }) {
  const mine = message.direction === "to_member";

  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      {mine ? null : (
        <Text style={styles.bubbleSender} numberOfLines={1} {...textScale.dense}>
          {message.sender}
        </Text>
      )}
      <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : null]} {...textScale.long}>
        {message.body}
      </Text>
      <Text style={[styles.bubbleDate, mine ? styles.bubbleDateMine : null]} {...textScale.badge}>
        {smartDate(message.created_at)}
      </Text>
    </View>
  );
});

/* ═════════════════════════════════ STİLLER ═════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  controls: {
    gap: space.sm,
    paddingBottom: space.sm,
  },
  search: {
    paddingHorizontal: layout.screenPadding,
  },
  skeleton: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
    paddingTop: space.sm,
    gap: space.sm,
    flexGrow: 1,
  },
  banner: {
    marginBottom: space.sm,
  },

  /* Zincir satırı */
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  rowUnread: {
    borderColor: colors.brandBorder,
    backgroundColor: colors.surface2,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  sender: {
    ...type.label,
    color: colors.textPrimary,
    flex: 1,
  },
  senderUnread: {
    ...type.h3,
    color: colors.textPrimary,
  },
  time: {
    ...type.caption,
    color: colors.textTertiary,
  },
  subject: {
    ...type.bodySm,
    color: colors.textPrimary,
  },
  preview: {
    ...type.caption,
    color: colors.textSecondary,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.xs,
    marginTop: space.xs,
  },
  countText: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* Yazışma başlığı */
  threadMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  threadMetaLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  priorityGroup: {
    flex: 1,
  },

  /* Balonlar */
  bubbles: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.md,
    gap: space.sm,
  },
  bubble: {
    maxWidth: "86%",
    borderRadius: radius.lg,
    padding: space.md,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
    borderBottomRightRadius: radius.xs,
  },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface2,
    borderBottomLeftRadius: radius.xs,
  },
  bubbleSender: {
    ...type.micro,
    color: colors.brandAccent,
    marginBottom: space.xxs,
  },
  bubbleText: {
    ...type.bodySm,
    color: colors.textPrimary,
  },
  bubbleTextMine: {
    color: colors.textOnBrand,
  },
  bubbleDate: {
    ...type.micro,
    color: colors.textTertiary,
    marginTop: space.xs,
    alignSelf: "flex-end",
  },
  bubbleDateMine: {
    color: withAlpha(colors.textOnBrand, 0.72),
  },

  /* Yanıt kutusu */
  composer: {
    gap: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    backgroundColor: colors.surface1,
  },
  replyStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.xs,
    paddingHorizontal: layout.screenPadding,
  },
  replyStatusLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  replyRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
  },
  replyInput: {
    flex: 1,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surface3,
  },
});
