import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
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
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import {
  getMyMessages,
  replyPanelThread,
  sendPanelMessage,
  type PanelThread,
} from "@/lib/api/panel";
import { formatDateShort, formatTime } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Mesajlarım — yönetimle başvuru/yazışma sistemi (Faz 4, final).
 *
 * Konu başlıkları (thread) listelenir; açınca yazışma balonları görünür ve
 * yanıt yazılabilir. Yeni başvuru penceresinde kategori, sunucunun
 * gönderdiği sözlükten seçilir — ekranda sabit etiket yazılmaz (döküm
 * uyarısı). Kapanmış konulara yanıt alanı gösterilmez.
 */

/** Kategori → ikon */
function categoryIcon(cat: string): string {
  const c = String(cat).toLowerCase();
  if (c.includes("transfer") || c.includes("sozlesme")) return "swap-horizontal-outline";
  if (c.includes("disiplin") || c.includes("ceza"))     return "shield-outline";
  if (c.includes("fikstur") || c.includes("mac"))       return "calendar-outline";
  if (c.includes("odeme") || c.includes("uyelik"))      return "card-outline";
  if (c.includes("teknik") || c.includes("sorun"))      return "construct-outline";
  if (c.includes("oneri"))                               return "bulb-outline";
  return "chatbubble-outline";
}

/** Bugün ise saat, başka günse kısa tarih */
function smartDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    }
    return formatDateShort(iso);
  } catch {
    return "";
  }
}

/** Durum → renk */
function statusColor(status: string): string {
  if (status === "open")       return "#178A50";
  if (status === "in_review")  return "#E8B00A";
  if (status === "answered")   return "#3B72E8";
  if (status === "closed")     return "#8B8797";
  return "#8B8797";
}

/** Sunucunun kısa durum etiketini daha açıklayıcıya çevir */
function friendlyStatus(serverLabel: string): string {
  const map: Record<string, string> = {
    "Açık":        "Bekliyor",
    "İncelemede":  "İnceleniyor",
    "Yanıtlandı":  "Yanıtlandı",
    "Kapalı":      "Kapatıldı",
    "open":        "Bekliyor",
    "in_review":   "İnceleniyor",
    "answered":    "Yanıtlandı",
    "closed":      "Kapatıldı",
  };
  return map[serverLabel] ?? serverLabel;
}

export default function MessagesScreen() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [openThreadId, setOpenThreadId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["panel", "messages"],
    queryFn: getMyMessages,
    enabled: Boolean(auth.user),
    staleTime: 5_000,
    // Ekran açıkken sessiz yoklama: yeni mesajlar bildirimsiz de düşer.
    refetchInterval: 8_000,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["panel", "messages"] });

  const replyMutation = useMutation({
    mutationFn: (input: { threadId: number; body: string }) =>
      replyPanelThread(input.threadId, input.body),
    onSuccess: () => {
      setReply("");
      refresh();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    },
    onError: (error) =>
      Alert.alert("Gönderilemedi", error instanceof Error ? error.message : "Bilinmeyen hata."),
  });

  const sendMutation = useMutation({
    mutationFn: () => sendPanelMessage(subject.trim(), body.trim(), category ?? "genel"),
    onSuccess: () => {
      setComposeOpen(false);
      setSubject("");
      setBody("");
      setCategory(null);
      Alert.alert("Başvurun iletildi", "Yönetim yanıtladığında burada görünecek.");
      refresh();
    },
    onError: (error) =>
      Alert.alert("Gönderilemedi", error instanceof Error ? error.message : "Bilinmeyen hata."),
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const threads = query.data?.threads ?? [];
  const openThreadForEffect = threads.find((t) => t.id === openThreadId) ?? null;
  useEffect(() => {
    if (openThreadForEffect) {
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      return () => clearTimeout(t);
    }
  }, [openThreadId, openThreadForEffect?.messages.length]);
  const categories = query.data?.categories ?? {};
  const openThread = threads.find((t) => t.id === openThreadId) ?? null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Mesajlarım" subtitle="Yönetimle yazışmaların" />

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <>
          <Pressable
            onPress={() => setComposeOpen(true)}
            style={({ pressed }) => [styles.newBtn, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={16} color={colors.surface} />
            <Text style={styles.newBtnText}>Yeni Başvuru</Text>
          </Pressable>

          {threads.length === 0 ? (
            <EmptyState
              icon="chatbubbles-outline"
              title="Mesaj yok"
              body="Yönetime bir başvuru gönderdiğinde yazışma burada başlar."
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
                    styles.threadRow,
                    item.unread > 0 && styles.threadRowUnread,
                    pressed && styles.pressed,
                  ]}
                >
                  {/* Kategori ikonu */}
                  <View style={styles.threadIcon}>
                    <Ionicons name={categoryIcon(item.category_label) as any} size={18} color={colors.turf} />
                  </View>

                  <View style={styles.threadBody}>
                    {/* Üst satır: kategori adı + zaman */}
                    <View style={styles.threadTopRow}>
                      <Text
                        style={[styles.threadSubject, item.unread > 0 && styles.threadSubjectUnread]}
                        numberOfLines={1}
                      >
                        {item.category_label || "Genel Başvuru"}
                      </Text>
                      <Text style={styles.threadTime}>{smartDate(item.last_message_at)}</Text>
                    </View>
                    {/* Orta satır: konu başlığı */}
                    <Text style={styles.threadTopic} numberOfLines={1}>
                      {item.subject}
                    </Text>
                    {/* Alt satır: son mesaj + okunmamış rozet */}
                    <View style={styles.threadBottomRow}>
                      <Text style={styles.threadPreview} numberOfLines={1}>
                        {item.last_message_preview}
                      </Text>
                      {item.unread > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadText}>{item.unread}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={[styles.statusChipInline, { backgroundColor: statusColor(item.status) + "18" }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
                      <Text style={[styles.statusInlineText, { color: statusColor(item.status) }]}>
                        {friendlyStatus(item.status_label)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              )}
            />
          )}
        </>
      )}

      {/* Konu detayı */}
      <Modal
        visible={Boolean(openThread)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpenThreadId(null)}
      >
        <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.threadHead}>
              <Pressable onPress={() => setOpenThreadId(null)} hitSlop={10}>
                <Ionicons name="chevron-back" size={22} color={colors.line} />
              </Pressable>
              <View style={styles.threadHeadBody}>
                <Text style={styles.threadTitle} numberOfLines={1}>
                  ElitLig Yönetimi
                </Text>
                <Text style={styles.threadHeadMeta} numberOfLines={1}>
                  {openThread?.subject}
                  {openThread?.messages.length ? ` · ${openThread.messages.length} mesaj` : ""}
                </Text>
              </View>
              <View style={[
                styles.statusChip,
                { backgroundColor: statusColor(openThread?.status ?? "") + "18" }
              ]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor(openThread?.status ?? "") }]} />
                <Text style={[styles.statusText, { color: statusColor(openThread?.status ?? "") }]}>
                  {friendlyStatus(openThread?.status_label ?? "")}
                </Text>
              </View>
            </View>

            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.bubbles}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {openThread?.messages.map((message) => {
                const mine = message.direction === "to_admin";
                return (
                  <View
                    key={message.id}
                    style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                  >
                    {!mine ? (
                      <View style={styles.adminRow}>
                        <Ionicons name="shield-checkmark" size={11} color={colors.turf} />
                        <Text style={styles.adminName}>
                          {message.sender || "ElitLig"} · Yönetici
                        </Text>
                      </View>
                    ) : null}
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

            {openThread && openThread.status !== "closed" ? (
              <View style={styles.replyRow}>
                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  placeholder="Yanıt yaz…"
                  placeholderTextColor={colors.muted}
                  style={styles.replyInput}
                  multiline
                />
                <Pressable
                  onPress={() =>
                    openThread && replyMutation.mutate({ threadId: openThread.id, body: reply.trim() })
                  }
                  disabled={reply.trim().length < 2 || replyMutation.isPending}
                  style={({ pressed }) => [
                    styles.sendBtn,
                    (pressed || reply.trim().length < 2) && styles.pressed,
                  ]}
                >
                  <Ionicons name="send" size={16} color={colors.surface} />
                </Pressable>
              </View>
            ) : (
              <Text style={styles.closedNote}>Bu konu kapatılmış; yeni başvuru açabilirsin.</Text>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Yeni başvuru */}
      <Modal
        visible={composeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setComposeOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.kav}
          >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Yeni Başvuru</Text>
            <View style={styles.catRow}>
              {Object.entries(categories).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setCategory(key)}
                  style={({ pressed }) => [
                    styles.catChip,
                    category === key && styles.catChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.catText, category === key && styles.catTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="Konu"
              placeholderTextColor={colors.muted}
              style={styles.subjectInput}
            />
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Mesajını yaz…"
              placeholderTextColor={colors.muted}
              style={styles.bodyInput}
              multiline
            />
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => setComposeOpen(false)}
                style={({ pressed }) => [styles.btn, styles.cancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>Vazgeç</Text>
              </Pressable>
              <Pressable
                onPress={() => sendMutation.mutate()}
                disabled={subject.trim().length < 3 || body.trim().length < 5 || sendMutation.isPending}
                style={({ pressed }) => [
                  styles.btn,
                  styles.solidBtn,
                  (pressed || subject.trim().length < 3 || body.trim().length < 5) && styles.pressed,
                ]}
              >
                <Text style={styles.solidText}>
                  {sendMutation.isPending ? "Gönderiliyor…" : "Gönder"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
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
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    alignSelf: "center",
    backgroundColor: colors.turf,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  newBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.surface,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  threadRowUnread: {
    borderColor: colors.turf + "66",
  },
  threadIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  threadTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  threadBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  threadTime: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginLeft: "auto",
    flexShrink: 0,
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.turf,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    marginLeft: "auto",
    flexShrink: 0,
  },
  unreadText: {
    fontSize: 10,
    fontWeight: "900",
    color: colors.surface,
  },
  statusChipInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusInlineText: {
    fontSize: 9,
    fontWeight: "800",
  },
  threadHeadBody: {
    flex: 1,
  },
  threadHeadMeta: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.faint,
  },
  dotUnread: {
    backgroundColor: colors.live,
  },
  threadBody: {
    flex: 1,
  },
  threadSubject: {
    ...type.small,
    color: colors.line,
  },
  threadSubjectUnread: {
    fontWeight: "800",
  },
  threadTopic: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.line,
    marginTop: 1,
  },
  threadPreview: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  threadMeta: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
  },
  statusChip: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.line,
  },
  statusBarSpacer: {
    height: Platform.OS === "ios" ? 60 : 28,
    backgroundColor: colors.pitch,
  },
  threadHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  threadTitle: {
    ...type.subtitle,
    color: colors.line,
    flex: 1,
  },
  bubbles: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  adminRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 3,
  },
  adminName: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.turf,
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
  replyRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.faint,
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
  closedNote: {
    ...type.caption,
    color: colors.muted,
    textAlign: "center",
    letterSpacing: 0,
    padding: spacing.md,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  kav: {
    alignSelf: "stretch",
  },
  sheet: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  catRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  catChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.faint,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  catChipActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  catText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  catTextActive: {
    color: colors.surface,
  },
  subjectInput: {
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.sm,
    padding: spacing.sm,
    ...type.small,
    color: colors.line,
  },
  bodyInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.sm,
    padding: spacing.sm,
    ...type.small,
    color: colors.line,
    textAlignVertical: "top",
  },
  sheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 3,
  },
  cancelBtn: {
    backgroundColor: colors.surfaceRaised,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.line,
  },
  solidBtn: {
    backgroundColor: colors.turf,
  },
  solidText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.surface,
  },
  pressed: {
    opacity: 0.6,
  },
});
