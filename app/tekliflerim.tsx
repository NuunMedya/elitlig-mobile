import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import {
  acceptOffer,
  getOfferInbox,
  rejectOffer,
  type TransferOffer,
} from "@/lib/api/panel";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Transfer Tekliflerim — oyuncuya gelen teklifler (Faz 3).
 *
 * Gelen kutusu listelenir; Kabul/Reddet aksiyonları sunucunun actions
 * bayraklarına göre görünür. Her aksiyon teklifin güncel sürümünü
 * (expectedVersion) gönderir; 409 sürüm çakışmasında liste tazelenir ve
 * kullanıcı bilgilendirilir. Reddetmede kısa bir gerekçe istenir.
 */

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  withdrawn: "Geri çekildi",
  expired: "Süresi doldu",
};

export default function OffersScreen() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<TransferOffer | null>(null);
  const [reason, setReason] = useState("");

  const query = useQuery({
    queryKey: ["panel", "offers"],
    queryFn: () => getOfferInbox(),
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["panel", "offers"] });
    queryClient.invalidateQueries({ queryKey: ["panel", "contracts"] });
    queryClient.invalidateQueries({ queryKey: ["panel", "me"] });
  };

  const handleError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409) {
      Alert.alert("Teklif güncellendi", "Bu teklifte değişiklik yapılmış. Liste tazelendi, lütfen tekrar bak.");
      refreshAll();
      return;
    }
    Alert.alert("İşlem yapılamadı", error instanceof Error ? error.message : "Bilinmeyen hata.");
  };

  const acceptMutation = useMutation({
    mutationFn: (offer: TransferOffer) =>
      acceptOffer(offer.public_id, offer.current_version ?? offer.version),
    onSuccess: () => {
      Alert.alert("Teklif kabul edildi 🎉", "Sözleşmen oluşturuldu; Sözleşmelerim'de görebilirsin.");
      refreshAll();
    },
    onError: handleError,
  });

  const rejectMutation = useMutation({
    mutationFn: (input: { offer: TransferOffer; reason: string }) =>
      rejectOffer(
        input.offer.public_id,
        input.offer.current_version ?? input.offer.version,
        input.reason
      ),
    onSuccess: () => {
      setRejecting(null);
      setReason("");
      refreshAll();
    },
    onError: handleError,
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const confirmAccept = (offer: TransferOffer) => {
    Alert.alert(
      "Teklifi kabul et",
      `${offer.team?.team_name ?? "Takım"} teklifini kabul etmek üzeresin. Sözleşme oluşturulacak.`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Kabul et", onPress: () => acceptMutation.mutate(offer) },
      ]
    );
  };

  const items = query.data?.items ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Transfer Tekliflerim" subtitle="Takımlardan gelen teklifler" />

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="swap-horizontal-outline"
          title="Teklif yok"
          body="Bir takım sana transfer teklifi gönderdiğinde burada görünür."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.public_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <TeamCrest
                  name={item.team?.team_name ?? "?"}
                  logo={mediaUrl(item.team?.logo ?? null)}
                  size={36}
                />
                <View style={styles.cardBody}>
                  <Text style={styles.teamName} numberOfLines={1}>
                    {item.team?.team_name ?? "Takım"}
                  </Text>
                  <Text style={styles.meta}>
                    {item.sent_at ? `Gönderildi: ${formatDateShort(item.sent_at)}` : ""}
                    {item.expires_at ? ` · Son gün: ${formatDateShort(item.expires_at)}` : ""}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusChip,
                    item.status === "accepted" && styles.statusOk,
                    (item.status === "rejected" || item.status === "expired") && styles.statusBad,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Text>
                </View>
              </View>

              {item.awaiting_admin_approval ? (
                <Text style={styles.adminNote}>⏳ Yönetici onayı bekleniyor</Text>
              ) : null}

              {item.actions?.accept || item.actions?.reject ? (
                <View style={styles.actionRow}>
                  {item.actions?.reject ? (
                    <Pressable
                      onPress={() => setRejecting(item)}
                      style={({ pressed }) => [styles.btn, styles.rejectBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.rejectText}>Reddet</Text>
                    </Pressable>
                  ) : null}
                  {item.actions?.accept ? (
                    <Pressable
                      onPress={() => confirmAccept(item)}
                      disabled={acceptMutation.isPending}
                      style={({ pressed }) => [styles.btn, styles.acceptBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="checkmark" size={15} color={colors.surface} />
                      <Text style={styles.acceptText}>
                        {acceptMutation.isPending ? "İşleniyor…" : "Kabul et"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
        />
      )}

      {/* Ret gerekçesi penceresi */}
      <Modal
        visible={Boolean(rejecting)}
        transparent
        animationType="fade"
        onRequestClose={() => setRejecting(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Teklifi reddet</Text>
            <Text style={styles.sheetBody}>
              {rejecting?.team?.team_name ?? "Takım"} teklifini reddediyorsun. Kısa bir gerekçe yaz:
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Örn. Mevcut takımımda kalmak istiyorum"
              placeholderTextColor={colors.muted}
              style={styles.input}
              multiline
            />
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => {
                  setRejecting(null);
                  setReason("");
                }}
                style={({ pressed }) => [styles.btn, styles.cancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>Vazgeç</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  rejecting && rejectMutation.mutate({ offer: rejecting, reason: reason.trim() })
                }
                disabled={reason.trim().length < 3 || rejectMutation.isPending}
                style={({ pressed }) => [
                  styles.btn,
                  styles.rejectSolid,
                  (pressed || reason.trim().length < 3) && styles.pressed,
                ]}
              >
                <Text style={styles.acceptText}>
                  {rejectMutation.isPending ? "Gönderiliyor…" : "Reddet"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
    gap: spacing.md,
  },
  cardBody: {
    flex: 1,
  },
  teamName: {
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
  statusOk: {
    backgroundColor: "#EAF7F0",
  },
  statusBad: {
    backgroundColor: "#FBEDEE",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.line,
  },
  adminNote: {
    ...type.caption,
    color: colors.yellow,
    letterSpacing: 0,
    marginTop: spacing.sm,
    fontWeight: "700",
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
  acceptBtn: {
    backgroundColor: colors.green,
  },
  acceptText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.surface,
  },
  rejectBtn: {
    backgroundColor: "#FBEDEE",
  },
  rejectText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.live,
  },
  rejectSolid: {
    backgroundColor: colors.live,
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
    minHeight: 70,
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
