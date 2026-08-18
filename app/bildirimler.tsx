import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import {
  getPanelNotifications,
  markAllNotifsRead,
  markNotifRead,
  type PanelNotification,
} from "@/lib/api/panel";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Bildirimler — panel-notifications ucu.
 * Girişli kullanıcının tüm sistem bildirimleri; okunmamışlar üstte.
 */

const NOTIF_ICONS: Record<string, string> = {
  transfer_offer:   "swap-horizontal-outline",
  contract:         "document-text-outline",
  penalty:          "shield-outline",
  match:            "football-outline",
  message:          "chatbubble-outline",
  default:          "notifications-outline",
};

function notifIcon(type: string): string {
  return NOTIF_ICONS[type] ?? NOTIF_ICONS.default;
}

function smartDate(iso: string): string {
  try {
    const d   = new Date(iso);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3_600_000;
    if (diffH < 1)   return "Az önce";
    if (diffH < 24)  return `${Math.floor(diffH)} saat önce`;
    if (diffH < 48)  return "Dün";
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export default function NotificationsScreen() {
  const auth        = useAuth();
  const router      = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["panel", "notifications"],
    queryFn:  () => getPanelNotifications(),
    enabled:  Boolean(auth.user),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const readMutation = useMutation({
    mutationFn: (id: number) => markNotifRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["panel", "notifications"] }),
  });

  const readAllMutation = useMutation({
    mutationFn: markAllNotifsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["panel", "notifications"] }),
  });

  if (!auth.user) return <Redirect href="/giris" />;

  const items: PanelNotification[]  = query.data?.items ?? [];
  const unread   = items.filter((n) => !n.is_read).length;

  const handlePress = (notif: PanelNotification) => {
    if (!notif.is_read) readMutation.mutate(notif.id);
    // Entity tipine göre yönlendir
    if (notif.entity_type === "transfer_offer" && notif.entity_public_id)
      router.push("/tekliflerim");
    else if (notif.entity_type === "contract")
      router.push("/sozlesmelerim");
    else if (notif.entity_type === "penalty")
      router.push("/cezalarim");
    else if (notif.entity_type === "message")
      router.push("/mesajlarim");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Bildirimler" subtitle={unread > 0 ? `${unread} okunmamış` : "Tümü okundu"} />

      {unread > 0 ? (
        <Pressable
          onPress={() => readAllMutation.mutate()}
          style={({ pressed }) => [styles.readAllBtn, pressed && styles.pressed]}
        >
          <Ionicons name="checkmark-done" size={14} color={colors.turf} />
          <Text style={styles.readAllText}>Tümünü okundu işaretle</Text>
        </Pressable>
      ) : null}

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title="Bildirim yok"
          body="Transfer teklifleri, sözleşmeler, cezalar ve mesajlar için bildirimler burada görünür."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handlePress(item)}
              style={({ pressed }) => [
                styles.row,
                !item.is_read && styles.rowUnread,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.iconBox, !item.is_read && styles.iconBoxUnread]}>
                <Ionicons name={notifIcon(item.type) as any} size={18} color={!item.is_read ? colors.turf : colors.muted} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, !item.is_read && styles.rowTitleUnread]} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.description ? (
                  <Text style={styles.rowDesc} numberOfLines={2}>{item.description}</Text>
                ) : null}
                <Text style={styles.rowTime}>{smartDate(item.createdAt)}</Text>
              </View>
              {!item.is_read ? <View style={styles.unreadDot} /> : null}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pitch },
  readAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.turfDim,
    borderRadius: radius.pill,
  },
  readAllText: { fontSize: 12, fontWeight: "800", color: colors.turf },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowUnread: {
    borderColor: colors.turf + "55",
    backgroundColor: colors.turfDim + "44",
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconBoxUnread: { backgroundColor: colors.turfDim },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { ...type.small, color: colors.line },
  rowTitleUnread: { fontWeight: "800", color: colors.line },
  rowDesc: { ...type.caption, color: colors.muted, letterSpacing: 0, lineHeight: 16 },
  rowTime: { fontSize: 10, fontWeight: "600", color: colors.muted },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.turf,
    marginTop: 4,
    flexShrink: 0,
  },
  pressed: { opacity: 0.7 },
});
