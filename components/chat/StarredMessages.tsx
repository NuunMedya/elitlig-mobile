/**
 * YILDIZLI MESAJLAR — kişiye özel işaretlenen mesajlar (masaüstü "Yıldızlı"
 * bölümü ve sohbet içi StarredPanel). Satıra dokununca sohbet o mesajda açılır;
 * yıldıza dokununca işaret kalkar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState, ErrorState, SkeletonListRow, Touchable, WaHeader, errorMessage, useRefresh } from "@/components/chat/kit";
import { InboxAvatar } from "@/components/chat/AvatarArt";
import { useToast } from "@/components/ui";
import { patchMessageCache } from "@/hooks/useChat";
import { getStarred, starMessage, type StarredMessage } from "@/lib/api/chat";
import { listTime, messageSummary } from "@/lib/chatUtils";
import { useAuth } from "@/providers/AuthProvider";
import { chatPalette, colors } from "@/lib/chatPalette";
import { hairline, layout, radius, space, textScale, type } from "@/theme";

const KEY = ["chat", "starred"] as const;

export function StarredMessages({ conversationId }: { conversationId: number | null }) {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: getStarred, enabled: Boolean(auth.user), staleTime: 10_000, retry: false });
  const refresh = useRefresh(() => void query.refetch(), { refreshing: query.isRefetching });
  const items = useMemo(() => (query.data ?? []).filter((item) => !conversationId || item.conversation_id === conversationId), [conversationId, query.data]);

  const open = useCallback(
    (item: StarredMessage) => router.push({ pathname: "/sohbet/[id]", params: { id: String(item.conversation_id), mesaj: String(item.id) } }),
    [router],
  );
  const unstar = useCallback(
    (item: StarredMessage) => {
      queryClient.setQueryData<StarredMessage[]>(KEY, (previous) => previous?.filter((x) => x.id !== item.id));
      patchMessageCache(queryClient, item.conversation_id, item.id, { starred: false });
      void starMessage(item.conversation_id, item.id, false).catch((error: unknown) => {
        toast.show({ message: errorMessage(error), tone: "danger" });
        void queryClient.invalidateQueries({ queryKey: KEY });
      });
    },
    [queryClient, toast],
  );
  const renderItem = useCallback(({ item }: { item: StarredMessage }) => <StarredRow item={item} showChat={!conversationId} onPress={open} onUnstar={unstar} />, [conversationId, open, unstar]);

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <WaHeader title="Yıldızlı mesajlar" subtitle={items.length ? `${items.length} mesaj` : undefined} back />
      {query.isLoading ? (
        <View style={styles.pad}><SkeletonListRow count={6} avatar={false} /></View>
      ) : query.isError && !items.length ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          refreshControl={refresh.control}
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          ListEmptyComponent={<EmptyState icon="star-outline" title="Yıldızlı mesaj yok" body="Önemli mesajlara basılı tutup “Yıldızla”ya dokun; burada toplanır." />}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Yıldızlı mesaj kartı (Gece dili): üstte gönderen avatarı + ad + sohbet adı +
 * zaman; altında mesajın kendisi küçük bir balon olarak (giden mor, gelen
 * yüzey); sağ üstte altın yıldız düğmesi (dokununca yıldız kalkar).
 */
const StarredRow = memo(function StarredRow({ item, showChat, onPress, onUnstar }: { item: StarredMessage; showChat: boolean; onPress: (item: StarredMessage) => void; onUnstar: (item: StarredMessage) => void }) {
  const summary = messageSummary(item);
  const who = item.sender.is_me ? "Sen" : item.sender.is_management ? "ElitLig Yönetimi" : item.sender.name ?? "Üye";
  return (
    <Touchable feedback="card" haptic="selection" onPress={() => onPress(item)} accessibilityRole="button" accessibilityLabel={`${who}: ${summary.text}. Mesaja gitmek için dokun`} style={styles.card}>
      <View style={styles.head}>
        <InboxAvatar type={item.sender.is_management ? "management" : "person"} title={who} image={item.sender.avatar} size={30} />
        <View style={styles.body}>
          <Text style={styles.who} numberOfLines={1} {...textScale.dense}>{who}</Text>
          {showChat && item.conversation_title ? (
            <View style={styles.line}>
              <Ionicons name="chatbubbles-outline" size={11} color={colors.textTertiary} />
              <Text style={styles.chat} numberOfLines={1} {...textScale.dense}>{item.conversation_title}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.time} {...textScale.badge}>{listTime(item.created_at)}</Text>
        <Touchable feedback="icon" haptic="light" onPress={() => onUnstar(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Yıldızı kaldır" style={styles.star}>
          <Ionicons name="star" size={16} color={colors.star} />
        </Touchable>
      </View>
      <View style={[styles.bubble, item.sender.is_me ? styles.bubbleMine : styles.bubbleTheirs]}>
        {summary.icon ? <Ionicons name={summary.icon} size={14} color={chatPalette.bubbleMeta} /> : null}
        <Text style={styles.text} numberOfLines={4} {...textScale.long}>{summary.text}</Text>
      </View>
      <View style={styles.footer}>
        <Text style={styles.go} {...textScale.badge}>Mesaja git</Text>
        <Ionicons name="arrow-forward" size={12} color={colors.brandAccent} />
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  list: { flexGrow: 1, gap: space.sm, paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  body: { flex: 1, minWidth: 0 },
  line: { flexDirection: "row", alignItems: "center", gap: space.xs },
  who: { ...type.label, color: colors.textPrimary },
  chat: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  time: { ...type.numSm, color: colors.textTertiary },
  star: { width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.warnDim },
  bubble: { flexDirection: "row", alignItems: "flex-start", gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: chatPalette.bubbleMine, borderTopRightRadius: radius.xs - 3, alignSelf: "flex-end", maxWidth: "92%" },
  bubbleTheirs: { backgroundColor: chatPalette.bubbleTheirs, borderTopLeftRadius: radius.xs - 3, alignSelf: "flex-start", maxWidth: "92%", borderWidth: hairline, borderColor: chatPalette.bubbleLine },
  text: { ...type.body, color: chatPalette.bubbleText, flexShrink: 1 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space.xs },
  go: { ...type.labelXs, color: colors.brandAccent },
});
