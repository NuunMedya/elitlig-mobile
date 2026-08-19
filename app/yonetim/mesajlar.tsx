import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import {
  deleteAdminThread,
  getAdminMessages,
  markAdminThreadRead,
  MESSAGE_PRIORITY_LABELS,
  MESSAGE_STATUS_LABELS,
  replyAdminThread,
  updateAdminThread,
  type AdminThread,
  type MessagePriority,
  type MessageStatus,
} from "@/lib/api/admin";
import { formatDateShort } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Mesaj Yönetimi — üye başvuru kutusunun yönetici yüzü.
 *
 * Zincir listesi durum filtresi ve aramayla süzülür; zincire dokununca tam
 * ekran yazışma açılır (üye solda, yönetim sağda). Açılışta zincir okundu
 * işaretlenir. Yanıt gönderilirken "yanıt sonrası durum" seçilir; öncelik,
 * kapatma/yeniden açma ve silme işlemleri de bu pencereden yapılır.
 */

const STATUS_FILTERS: (MessageStatus | null)[] = [null, "open", "in_review", "answered", "closed"];
const REPLY_STATUSES: MessageStatus[] = ["answered", "in_review", "closed"];
const PRIORITY_ORDER: MessagePriority[] = ["low", "normal", "high", "urgent"];

/** Durum → renk (üye tarafındaki mesajlarim.tsx ile aynı palet). */
function statusColor(status: string): string {
  if (status === "open") return colors.green;
  if (status === "in_review") return colors.yellow;
  if (status === "answered") return colors.turf;
  return colors.muted;
}

/** Öncelik → renk (acilse kırmızıya kayar). */
function priorityColor(priority: string): string {
  if (priority === "urgent") return colors.red;
  if (priority === "high") return colors.yellow;
  if (priority === "low") return colors.muted;
  return colors.turf;
}

/** Bugün ise saat, başka günse kısa tarih. */
function smartDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (d.toDateString() === new Date().toDateString()) {
      return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    }
    return formatDateShort(iso);
  } catch {
    return "";
  }
}

const errorText = (error: unknown) =>
  error instanceof ApiError ? error.userMessage : "Beklenmeyen bir hata oluştu.";

export default function AdminMessagesScreen() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);

  const [statusFilter, setStatusFilter] = useState<MessageStatus | null>(null);
  const [search, setSearch] = useState("");
  const [openThreadId, setOpenThreadId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [replyStatus, setReplyStatus] = useState<MessageStatus>("answered");

  const query = useQuery({
    queryKey: ["admin", "messages", "list", statusFilter, search.trim()],
    queryFn: () =>
      getAdminMessages({
        status: statusFilter ?? undefined,
        search: search.trim() || undefined,
        limit: 300,
      }),
    enabled: Boolean(auth.user) && auth.isManagement,
    staleTime: 5_000,
    // Ekran açıkken sessiz yoklama: yeni başvurular kendiliğinden düşer.
    refetchInterval: 10_000,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "messages"] });

  const threads = query.data?.threads ?? [];
  const counts = query.data?.counts;
  const openThread: AdminThread | null = threads.find((t) => t.id === openThreadId) ?? null;

  /* Zincir açılınca okundu işaretle ve yazışmayı sona kaydır. */
  const readMutation = useMutation({
    mutationFn: (threadId: number) => markAdminThreadRead(threadId),
    onSuccess: refresh,
    // Okundu işareti ikincil; hatası kullanıcıyı rahatsız etmesin.
    onError: () => {},
  });

  useEffect(() => {
    if (openThreadId != null) {
      readMutation.mutate(openThreadId);
      setReplyStatus("answered");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openThreadId]);

  useEffect(() => {
    if (openThread) {
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
      return () => clearTimeout(t);
    }
  }, [openThreadId, openThread?.messages.length]);

  const replyMutation = useMutation({
    mutationFn: (input: { threadId: number; body: string; status: MessageStatus }) =>
      replyAdminThread(input.threadId, input.body, input.status),
    onSuccess: () => {
      setReply("");
      refresh();
    },
    onError: (error) => Alert.alert("Yanıt gönderilemedi", errorText(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      threadId: number;
      updates: { status?: MessageStatus; priority?: MessagePriority };
    }) => updateAdminThread(input.threadId, input.updates),
    onSuccess: refresh,
    onError: (error) => Alert.alert("Güncellenemedi", errorText(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (threadId: number) => deleteAdminThread(threadId),
    onSuccess: () => {
      setOpenThreadId(null);
      refresh();
      Alert.alert("Silindi", "Mesaj zinciri çöp kutusuna taşındı.");
    },
    onError: (error) => Alert.alert("Silinemedi", errorText(error)),
  });

  const confirmDelete = (thread: AdminThread) => {
    Alert.alert(
      "Zinciri sil",
      `"${thread.subject}" başvurusu çöp kutusuna taşınacak. Emin misiniz?`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Sil", style: "destructive", onPress: () => deleteMutation.mutate(thread.id) },
      ]
    );
  };

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }
  if (!auth.isManagement) {
    return <Redirect href="/yonetim" />;
  }

  const chipLabel = (status: MessageStatus | null) => {
    if (status === null) return "Tümü";
    const count = counts ? counts[status] : undefined;
    const base = status === "open" ? "Açık" : MESSAGE_STATUS_LABELS[status];
    return count != null && count > 0 ? `${base} (${count})` : base;
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Mesaj Yönetimi" subtitle="Üye başvuruları" />

      {/* Durum filtresi */}
      <View style={styles.chips}>
        {STATUS_FILTERS.map((status) => (
          <Pressable
            key={status ?? "all"}
            onPress={() => setStatusFilter(status)}
            style={({ pressed }) => [
              styles.chip,
              statusFilter === status && styles.chipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.chipText, statusFilter === status && styles.chipTextActive]}>
              {chipLabel(status)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Arama */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Konu, gönderen veya metin ara…"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : threads.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="Başvuru yok"
          body="Bu filtrede bekleyen üye başvurusu bulunmuyor."
        />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setOpenThreadId(item.id)}
              style={({ pressed }) => [
                styles.row,
                item.unread > 0 && styles.rowUnread,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={[styles.sender, item.unread > 0 && styles.senderUnread]} numberOfLines={1}>
                    {item.sender}
                  </Text>
                  <Text style={styles.time}>{smartDate(item.last_message_at)}</Text>
                </View>
                <Text style={styles.subject} numberOfLines={1}>
                  {item.subject}
                </Text>
                <View style={styles.rowBottom}>
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.last_message_preview}
                  </Text>
                  {item.unread > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unread}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.tagRow}>
                  <View style={[styles.tag, { backgroundColor: statusColor(item.status) + "1F" }]}>
                    <Text style={[styles.tagText, { color: statusColor(item.status) }]}>
                      {item.status_label}
                    </Text>
                  </View>
                  <View style={[styles.tag, { backgroundColor: priorityColor(item.priority) + "1F" }]}>
                    <Text style={[styles.tagText, { color: priorityColor(item.priority) }]}>
                      {item.priority_label}
                    </Text>
                  </View>
                  {item.category_label ? (
                    <View style={[styles.tag, { backgroundColor: colors.surfaceRaised }]}>
                      <Text style={[styles.tagText, { color: colors.muted }]}>{item.category_label}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* Yazışma penceresi (tam ekran) */}
      <Modal
        visible={openThread !== null}
        animationType="slide"
        onRequestClose={() => setOpenThreadId(null)}
      >
        <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
          {openThread ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.flex}
            >
              {/* Başlık: geri + konu + sil */}
              <View style={styles.threadHead}>
                <Pressable onPress={() => setOpenThreadId(null)} hitSlop={12}>
                  <Ionicons name="chevron-back" size={26} color={colors.line} />
                </Pressable>
                <View style={styles.threadHeadBody}>
                  <Text style={styles.threadTitle} numberOfLines={1}>
                    {openThread.subject}
                  </Text>
                  <Text style={styles.threadMeta} numberOfLines={1}>
                    {openThread.sender}
                    {openThread.category_label ? ` · ${openThread.category_label}` : ""}
                  </Text>
                </View>
                <Pressable onPress={() => confirmDelete(openThread)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={colors.red} />
                </Pressable>
              </View>

              {/* Öncelik ve kapatma/yeniden açma */}
              <View style={styles.toolbar}>
                {PRIORITY_ORDER.map((priority) => {
                  const active = openThread.priority === priority;
                  return (
                    <Pressable
                      key={priority}
                      disabled={active || updateMutation.isPending}
                      onPress={() =>
                        updateMutation.mutate({ threadId: openThread.id, updates: { priority } })
                      }
                      style={({ pressed }) => [
                        styles.priorityChip,
                        active && {
                          backgroundColor: priorityColor(priority),
                          borderColor: priorityColor(priority),
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.priorityText, active && styles.priorityTextActive]}>
                        {MESSAGE_PRIORITY_LABELS[priority]}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  disabled={updateMutation.isPending}
                  onPress={() =>
                    updateMutation.mutate({
                      threadId: openThread.id,
                      updates: { status: openThread.status === "closed" ? "open" : "closed" },
                    })
                  }
                  style={({ pressed }) => [styles.toggleBtn, pressed && styles.pressed]}
                >
                  <Ionicons
                    name={openThread.status === "closed" ? "lock-open-outline" : "lock-closed-outline"}
                    size={13}
                    color={colors.line}
                  />
                  <Text style={styles.toggleText}>
                    {openThread.status === "closed" ? "Yeniden Aç" : "Kapat"}
                  </Text>
                </Pressable>
              </View>

              {/* Yazışma balonları: üye solda, yönetim sağda */}
              <ScrollView ref={scrollRef} contentContainerStyle={styles.bubbles}>
                {openThread.messages.map((message) => {
                  const mine = message.direction === "to_member";
                  return (
                    <View
                      key={message.id}
                      style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                    >
                      {!mine ? <Text style={styles.bubbleSender}>{message.sender}</Text> : null}
                      <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                        {message.body}
                      </Text>
                      <Text style={[styles.bubbleDate, mine && styles.bubbleDateMine]}>
                        {smartDate(message.created_at)}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>

              {/* Yanıt sonrası durum seçici + yanıt alanı */}
              <View style={styles.replyStatusRow}>
                <Text style={styles.replyStatusLabel}>Yanıt sonrası:</Text>
                {REPLY_STATUSES.map((status) => (
                  <Pressable
                    key={status}
                    onPress={() => setReplyStatus(status)}
                    style={({ pressed }) => [
                      styles.replyStatusChip,
                      replyStatus === status && styles.replyStatusChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.replyStatusText,
                        replyStatus === status && styles.replyStatusTextActive,
                      ]}
                    >
                      {MESSAGE_STATUS_LABELS[status]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.replyRow}>
                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  placeholder="Yanıtınızı yazın…"
                  placeholderTextColor={colors.muted}
                  style={styles.replyInput}
                  multiline
                />
                <Pressable
                  onPress={() =>
                    replyMutation.mutate({
                      threadId: openThread.id,
                      body: reply.trim(),
                      status: replyStatus,
                    })
                  }
                  disabled={reply.trim().length < 2 || replyMutation.isPending}
                  style={({ pressed }) => [
                    styles.sendBtn,
                    (pressed || reply.trim().length < 2 || replyMutation.isPending) && styles.pressed,
                  ]}
                >
                  <Ionicons name="send" size={17} color={colors.surface} />
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  flex: {
    flex: 1,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  chipActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  chipTextActive: {
    color: colors.surface,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    ...type.small,
    color: colors.line,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowUnread: {
    borderColor: colors.turf + "66",
  },
  rowBody: {
    gap: 2,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sender: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: colors.line,
  },
  senderUnread: {
    fontWeight: "900",
  },
  time: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
  },
  subject: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.line,
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  preview: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.turf,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadText: {
    fontSize: 10,
    fontWeight: "900",
    color: colors.surface,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 3,
  },
  tag: {
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 9,
    fontWeight: "800",
  },
  threadHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  threadHeadBody: {
    flex: 1,
  },
  threadTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  threadMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 1,
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  priorityChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
  },
  priorityTextActive: {
    color: colors.surface,
    fontWeight: "800",
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.line,
  },
  bubbles: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  bubble: {
    maxWidth: "84%",
    borderRadius: radius.md,
    padding: spacing.sm + 2,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.turf,
  },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceRaised,
  },
  bubbleSender: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.turf,
    marginBottom: 3,
  },
  bubbleText: {
    ...type.small,
    color: colors.line,
    lineHeight: 19,
  },
  bubbleTextMine: {
    color: colors.surface,
  },
  bubbleDate: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 4,
  },
  bubbleDateMine: {
    color: "#D9CBF6",
  },
  replyStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.faint,
  },
  replyStatusLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
  },
  replyStatusChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.faint,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  replyStatusChipActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  replyStatusText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
  },
  replyStatusTextActive: {
    color: colors.surface,
  },
  replyRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  replyInput: {
    flex: 1,
    maxHeight: 110,
    minHeight: 42,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: 21,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...type.small,
    color: colors.line,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.turf,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
});
