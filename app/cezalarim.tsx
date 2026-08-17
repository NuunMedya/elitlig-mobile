import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
  getMyPenalties,
  submitDefense,
  submitObjection,
  type Penalty,
} from "@/lib/api/panel";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Cezalarım ve Savunma — üyenin taraf olduğu disiplin dosyaları (Faz 4).
 *
 * Dosyalar durum rozetleri ve süreç akışıyla listelenir; karta dokununca
 * olay zinciri açılır. Savunma (sevkten sonra 24 saat) ve itiraz (karardan
 * sonra 1 hafta) pencereleri açıksa gönderim düğmeleri belirir. side alanı
 * kaydın viewer_side değerinden alınır — asla elle yazılmaz.
 */

type Compose = { penalty: Penalty; kind: "defense" | "objection" } | null;

export default function PenaltiesScreen() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [compose, setCompose] = useState<Compose>(null);
  const [text, setText] = useState("");

  const query = useQuery({
    queryKey: ["panel", "penalties"],
    queryFn: getMyPenalties,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (input: { penalty: Penalty; kind: "defense" | "objection"; text: string }) => {
      const side = input.penalty.viewer_side ?? input.penalty.available_sides[0] ?? "player";
      return input.kind === "defense"
        ? submitDefense(input.penalty.public_id, input.text, side)
        : submitObjection(input.penalty.public_id, input.text, side);
    },
    onSuccess: (_, input) => {
      setCompose(null);
      setText("");
      Alert.alert(
        input.kind === "defense" ? "Savunman iletildi" : "İtirazın iletildi",
        "Kurul incelemesine düştü; sonucu bu ekrandan takip edebilirsin."
      );
      queryClient.invalidateQueries({ queryKey: ["panel", "penalties"] });
    },
    onError: (error) =>
      Alert.alert("Gönderilemedi", error instanceof Error ? error.message : "Bilinmeyen hata."),
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const items = query.data?.items ?? [];
  const now = Date.now();
  const windowOpen = (deadline: string | null) =>
    Boolean(deadline && new Date(deadline).getTime() > now);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Cezalarım ve Savunma" subtitle="Disiplin dosyaların" />

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="Dosya yok"
          body="Taraf olduğun bir disiplin dosyası yok — böyle devam! 🤝"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.public_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const open = openId === item.public_id;
            const canDefend = windowOpen(item.defense_deadline_at);
            const canObject = windowOpen(item.objection_deadline_at);
            return (
              <Pressable
                onPress={() => setOpenId(open ? null : item.public_id)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={styles.cardHead}>
                  <View style={styles.cardBody}>
                    <Text style={styles.matchLabel} numberOfLines={1}>
                      {item.match_label ?? item.team_name ?? "Disiplin dosyası"}
                    </Text>
                    <Text style={styles.meta}>
                      {item.player_name ? `${item.player_name} · ` : ""}
                      {item.match_date ? formatDateShort(item.match_date) : ""}
                    </Text>
                  </View>
                  <View style={styles.statusChip}>
                    <Text style={styles.statusText}>{item.status_label}</Text>
                  </View>
                </View>

                {item.disiplin_karari ? (
                  <Text style={styles.decision} numberOfLines={open ? undefined : 2}>
                    {item.disiplin_karari}
                  </Text>
                ) : null}

                {item.match_count ? (
                  <Text style={styles.banLine}>
                    ⛔ {item.match_count} maç
                    {item.ban_end_at ? ` · bitiş ${formatDateShort(item.ban_end_at)}` : ""}
                  </Text>
                ) : null}

                {canDefend ? (
                  <Text style={styles.deadline}>
                    ⏰ Savunma için son:{" "}
                    {formatDateShort(item.defense_deadline_at!)} — süre kaçmasın!
                  </Text>
                ) : null}

                {open ? (
                  <View style={styles.eventsBox}>
                    <Text style={styles.eventsTitle}>SÜREÇ AKIŞI</Text>
                    {item.events.length === 0 ? (
                      <Text style={styles.meta}>Henüz olay kaydı yok.</Text>
                    ) : (
                      item.events.map((event) => (
                        <View key={event.id} style={styles.eventRow}>
                          <View style={styles.eventDot} />
                          <View style={styles.eventBody}>
                            <Text style={styles.eventTitle}>
                              {event.title ?? event.event_type}
                              {event.review_status_label ? ` · ${event.review_status_label}` : ""}
                            </Text>
                            {event.description ? (
                              <Text style={styles.eventDesc}>{event.description}</Text>
                            ) : null}
                            <Text style={styles.eventDate}>{formatDateShort(event.createdAt)}</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                ) : null}

                {canDefend || canObject ? (
                  <View style={styles.actionRow}>
                    {canDefend ? (
                      <ActionButton
                        label="Savunma Gönder"
                        onPress={() => setCompose({ penalty: item, kind: "defense" })}
                      />
                    ) : null}
                    {canObject ? (
                      <ActionButton
                        label="İtiraz Et"
                        onPress={() => setCompose({ penalty: item, kind: "objection" })}
                      />
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      {/* Savunma / itiraz yazma penceresi */}
      <Modal
        visible={Boolean(compose)}
        transparent
        animationType="fade"
        onRequestClose={() => setCompose(null)}
      >
        <Pressable style={styles.backdrop} onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.kav}
          >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>
              {compose?.kind === "defense" ? "Savunma" : "İtiraz"} yaz
            </Text>
            <Text style={styles.sheetBody}>
              Metnin doğrudan kurula iletilir; gönderdikten sonra bu ekrandan takip edebilirsin.
            </Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Olayı kendi tarafından anlat…"
              placeholderTextColor={colors.muted}
              style={styles.input}
              multiline
            />
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => {
                  setCompose(null);
                  setText("");
                }}
                style={({ pressed }) => [styles.btn, styles.cancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>Vazgeç</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  compose && mutation.mutate({ penalty: compose.penalty, kind: compose.kind, text: text.trim() })
                }
                disabled={text.trim().length < 10 || mutation.isPending}
                style={({ pressed }) => [
                  styles.btn,
                  styles.sendBtn,
                  (pressed || text.trim().length < 10) && styles.pressed,
                ]}
              >
                <Ionicons name="send" size={14} color={colors.surface} />
                <Text style={styles.sendText}>
                  {mutation.isPending ? "Gönderiliyor…" : "Gönder"}
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

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, styles.actionBtn, pressed && styles.pressed]}
    >
      <Ionicons name="create-outline" size={14} color={colors.surface} />
      <Text style={styles.sendText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardBody: {
    flex: 1,
  },
  matchLabel: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  meta: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
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
  decision: {
    ...type.caption,
    color: colors.line,
    letterSpacing: 0,
    lineHeight: 16,
    marginTop: spacing.sm,
  },
  banLine: {
    ...type.caption,
    color: colors.live,
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: spacing.sm,
  },
  deadline: {
    ...type.caption,
    color: colors.yellow,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: spacing.sm,
  },
  eventsBox: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.faint,
    paddingTop: spacing.sm,
  },
  eventsTitle: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
    marginBottom: spacing.sm,
  },
  eventRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  eventDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.turf,
    marginTop: 4,
  },
  eventBody: {
    flex: 1,
  },
  eventTitle: {
    ...type.caption,
    fontWeight: "800",
    color: colors.line,
    letterSpacing: 0,
  },
  eventDesc: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    lineHeight: 15,
    marginTop: 1,
  },
  eventDate: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 3,
  },
  actionBtn: {
    backgroundColor: colors.turf,
  },
  sendBtn: {
    backgroundColor: colors.turf,
  },
  sendText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.surface,
  },
  cancelBtn: {
    backgroundColor: colors.surfaceRaised,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.line,
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
  sheetBody: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    lineHeight: 16,
  },
  input: {
    minHeight: 120,
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
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: 0.6,
  },
});
