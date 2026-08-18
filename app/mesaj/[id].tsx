import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getMyMessages, replyPanelThread } from "@/lib/api/panel";

function smartDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch { return ""; }
}

function statusColor(s: string): string {
  if (s === "open")      return "#178A50";
  if (s === "in_review") return "#E8B00A";
  if (s === "answered")  return "#3B72E8";
  return "#8B8797";
}

function friendlyStatus(label: string): string {
  const map: Record<string, string> = {
    "Açık":"Bekliyor","İncelemede":"İnceleniyor","Yanıtlandı":"Yanıtlandı","Kapalı":"Kapatıldı",
    "open":"Bekliyor","in_review":"İnceleniyor","answered":"Yanıtlandı","closed":"Kapatıldı",
  };
  return map[label] ?? label;
}

export default function ThreadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const threadId = Number(id);
  const router = useRouter();
  const qc = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [reply, setReply] = useState("");

  const query = useQuery({
    queryKey: ["panel", "messages"],
    queryFn: getMyMessages,
    refetchInterval: 8_000,
    staleTime: 4_000,
  });

  const thread = query.data?.threads?.find((t) => t.id === threadId) ?? null;

  const replyMutation = useMutation({
    mutationFn: ({ body }: { body: string }) => replyPanelThread(threadId, body),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["panel", "messages"] });
    },
  });

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }, [thread?.messages.length]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.line} />
        </Pressable>
        <View style={styles.headBody}>
          <Text style={styles.headTitle} numberOfLines={1}>ElitLig Yönetimi</Text>
          <Text style={styles.headMeta} numberOfLines={1}>
            {thread?.subject ?? ""}
            {thread?.messages.length ? ` · ${thread.messages.length} mesaj` : ""}
          </Text>
        </View>
        {thread ? (
          <View style={[styles.statusChip, { backgroundColor: statusColor(thread.status) + "18" }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(thread.status) }]} />
            <Text style={[styles.statusText, { color: statusColor(thread.status) }]}>
              {friendlyStatus(thread.status_label)}
            </Text>
          </View>
        ) : null}
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.bubbles}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {thread?.messages.map((msg) => {
            const mine = msg.direction === "to_admin";
            return (
              <View key={msg.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                {!mine ? (
                  <View style={styles.adminRow}>
                    <Ionicons name="shield-checkmark" size={11} color={colors.turf} />
                    <Text style={styles.adminName}>{msg.sender || "ElitLig"} · Yönetici</Text>
                  </View>
                ) : null}
                <Text style={[styles.bubbleTxt, mine && styles.bubbleTxtMine]}>{msg.body}</Text>
                <Text style={[styles.bubbleDate, mine && styles.bubbleDateMine]}>{smartDate(msg.created_at)}</Text>
              </View>
            );
          })}
        </ScrollView>

        {thread && thread.status !== "closed" ? (
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
              onPress={() => replyMutation.mutate({ body: reply.trim() })}
              disabled={reply.trim().length < 2 || replyMutation.isPending}
              style={({ pressed }) => [styles.sendBtn, (pressed || reply.trim().length < 2) && styles.pressed]}
            >
              <Ionicons name="send" size={16} color={colors.surface} />
            </Pressable>
          </View>
        ) : (
          <Text style={styles.closedNote}>Bu konu kapatılmış.</Text>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pitch },
  flex: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.faint },
  headBody: { flex: 1 },
  headTitle: { ...type.subtitle, color: colors.line },
  headMeta: { ...type.caption, color: colors.muted, letterSpacing: 0, marginTop: 1 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "800" },
  bubbles: { flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  bubble: { maxWidth: "80%", borderRadius: 16, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.turf },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.faint },
  adminRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 },
  adminName: { fontSize: 10, fontWeight: "800", color: colors.turf },
  bubbleTxt: { ...type.small, color: colors.line },
  bubbleTxtMine: { color: colors.surface },
  bubbleDate: { fontSize: 10, color: colors.muted, marginTop: 3 },
  bubbleDateMine: { color: "rgba(255,255,255,0.65)" },
  replyRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.faint },
  replyInput: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.faint, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, maxHeight: 100, color: colors.line, fontSize: 14 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.turf, alignItems: "center", justifyContent: "center" },
  closedNote: { ...type.small, color: colors.muted, textAlign: "center", padding: spacing.md },
  pressed: { opacity: 0.6 },
});
