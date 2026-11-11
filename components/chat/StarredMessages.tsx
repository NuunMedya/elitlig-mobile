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

import { EmptyState, ErrorState, ScreenHeader, SkeletonListRow, Touchable, errorMessage, useRefresh, useToast } from "@/components/ui";
import { patchMessageCache } from "@/hooks/useChat";
import { getStarred, starMessage, type StarredMessage } from "@/lib/api/chat";
import { listTime, messageSummary } from "@/lib/chatUtils";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, space, textScale, type } from "@/theme";

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
      <ScreenHeader title="Yıldızlı mesajlar" subtitle={items.length ? `${items.length} mesaj` : undefined} back />
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

const StarredRow = memo(function StarredRow({ item, showChat, onPress, onUnstar }: { item: StarredMessage; showChat: boolean; onPress: (item: StarredMessage) => void; onUnstar: (item: StarredMessage) => void }) {
  const summary = messageSummary(item);
  return (
    <Touchable feedback="row" haptic="selection" onPress={() => onPress(item)} accessibilityRole="button" accessibilityLabel={`${item.sender.is_me ? "Sen" : item.sender.name ?? "Üye"}: ${summary.text}. Mesaja gitmek için dokun`} style={styles.row}>
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={styles.who} numberOfLines={1} {...textScale.dense}>
            {item.sender.is_me ? "Sen" : item.sender.is_management ? "ElitLig Yönetimi" : item.sender.name ?? "Üye"}
            {showChat && item.conversation_title ? <Text style={styles.chat}> · {item.conversation_title}</Text> : null}
          </Text>
          <Text style={styles.time} {...textScale.badge}>{listTime(item.created_at)}</Text>
        </View>
        <View style={styles.line}>
          {summary.icon ? <Ionicons name={summary.icon} size={14} color={colors.textTertiary} /> : null}
          <Text style={styles.text} numberOfLines={3} {...textScale.long}>{summary.text}</Text>
        </View>
      </View>
      <Touchable feedback="icon" haptic="light" onPress={() => onUnstar(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Yıldızı kaldır" style={styles.star}>
        <Ionicons name="star" size={20} color={colors.star} />
      </Touchable>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  list: { flexGrow: 1, paddingBottom: space.giant },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: layout.screenPadding, paddingVertical: space.m, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  body: { flex: 1, minWidth: 0, gap: space.xxs },
  line: { flexDirection: "row", alignItems: "center", gap: space.xs },
  who: { ...type.label, color: colors.textPrimary, flex: 1 },
  chat: { ...type.caption, color: colors.textTertiary },
  time: { ...type.numSm, color: colors.textTertiary },
  text: { ...type.body, color: colors.textSecondary, flex: 1 },
  star: { width: 48, height: 44, alignItems: "center", justifyContent: "center" },
});
