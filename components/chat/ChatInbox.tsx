/**
 * SOHBETLER — WhatsApp mantığında mesaj kutusu (üye ve yönetim ortak).
 *
 * Tek liste: yönetim sohbeti (bildirimler + yönetimle yazışma), takım grubu,
 * birebir sohbetler ve kurulan gruplar; son mesaja göre sıralı. Sağ üstteki
 * kalem "Mesaj oluştur" ekranına götürür (yönetim / takım / oyuncu / grup).
 *
 * Gerçek zamanlı güncelleme hooks/useChat.ts (soket + yoklama).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  FAB,
  Input,
  ScreenHeader,
  SkeletonListRow,
  Touchable,
  useFabAutoHide,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import { useAdminConversations, useConversations, type AdminListType } from "@/hooks/useChat";
import { Chip, ChipGroup } from "@/components/ui";
import { conversationPreview, type ChatConversation } from "@/lib/api/chat";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const normalize = (value: string) => value.toLocaleLowerCase("tr-TR");

/** Liste satırı zamanı: bugün saat, dün "Dün", bu hafta gün adı, aksi hâlde tarih. */
function smartDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Dün";
  if (diffDays < 7) return date.toLocaleDateString("tr-TR", { weekday: "long" });
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

const TYPE_ICON: Record<ChatConversation["type"], keyof typeof Ionicons.glyphMap> = {
  management: "shield-checkmark",
  admin: "notifications",
  team: "people",
  group: "people-circle",
  direct: "person",
};

export interface ChatInboxProps {
  admin?: boolean;
}

export function ChatInbox({ admin = false }: ChatInboxProps) {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { scrollY, scrollProps } = useHeaderScroll();
  const fab = useFabAutoHide();
  const [search, setSearch] = useState("");
  const [listType, setListType] = useState<AdminListType>("management");
  const basePath = admin ? "/yonetim/sohbet" : "/sohbet";

  const memberQuery = useConversations();
  const adminQuery = useAdminConversations(listType);
  const query = admin ? adminQuery : memberQuery;
  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
    if (admin) void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] });
  }, [admin, queryClient]);
  const refresh = useRefresh(refetch, { refreshing: query.isRefetching });

  const conversations = useMemo(() => {
    const list = query.data?.conversations ?? [];
    const q = normalize(search.trim());
    if (!q) return list;
    return list.filter((item) => normalize(`${item.title} ${item.subtitle}`).includes(q));
  }, [query.data, search]);

  const unread = query.data?.unread ?? 0;

  const open = useCallback(
    (conversation: ChatConversation) => router.push(`${basePath}/${conversation.id}` as never),
    [basePath, router],
  );
  const compose = useCallback(() => router.push(`${basePath}/yeni` as never), [basePath, router]);

  const handleScroll = useCallback(
    (event: Parameters<typeof scrollProps.onScroll>[0]) => {
      scrollProps.onScroll(event);
      fab.onScroll(event);
    },
    [fab, scrollProps],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatConversation }) => <ConversationRow conversation={item} onPress={open} />,
    [open],
  );

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={admin ? "Yönetim Sohbeti" : "Mesajlar"}
        subtitle={unread > 0 ? `${unread} okunmamış mesaj` : admin ? "Üyeler, takım grupları, bildirimler" : "Yönetim, takımın ve oyuncular"}
        back
        scrollY={scrollY}
        actions={[{ icon: "create-outline", onPress: compose, accessibilityLabel: "Mesaj oluştur" }]}
        bottom={
          <View style={styles.searchWrap}>
            {admin ? (
              <View style={styles.typeRow}>
                <ChipGroup contentPadding={0}>
                  <Chip label="Üyeler" selected={listType === "management"} onPress={() => setListType("management")} size="sm" />
                  <Chip label="Takım grupları" selected={listType === "team"} onPress={() => setListType("team")} size="sm" />
                  <Chip label="Tümü" selected={listType === "all"} onPress={() => setListType("all")} size="sm" />
                </ChipGroup>
              </View>
            ) : null}
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder="Sohbet ara"
              variant="search"
              size="sm"
              leadingIcon="search"
              accessibilityLabel="Sohbet ara"
            />
          </View>
        }
      />

      {query.isLoading ? (
        <View style={styles.skeleton}>
          <SkeletonListRow count={7} avatar />
        </View>
      ) : query.isError && conversations.length === 0 ? (
        <ErrorState error={query.error} onRetry={refetch} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          onScroll={handleScroll}
          scrollEventThrottle={scrollProps.scrollEventThrottle}
          contentContainerStyle={styles.list}
          refreshControl={refresh.control}
          initialNumToRender={12}
          windowSize={8}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={query.isError ? <ErrorState error={query.error} onRetry={refetch} variant="banner" /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title={search ? "Eşleşen sohbet yok" : "Henüz sohbet yok"}
              body={search ? "Başka bir ad dene." : admin ? "Üyeler yazdıkça burada listelenir; kalem ile bir üyeye ya da takıma yazabilirsiniz." : "Yönetime, takım grubuna ya da bir oyuncuya ilk mesajı gönder."}
              action={search ? undefined : { label: "Mesaj oluştur", onPress: compose }}
            />
          }
        />
      )}

      <FAB
        icon="create-outline"
        label="Mesaj oluştur"
        extended
        visible={fab.visible}
        offsetBottom={insets.bottom + space.lg}
        onPress={compose}
        accessibilityLabel="Mesaj oluştur"
      />
    </SafeAreaView>
  );
}

const Separator = memo(function Separator() {
  return <View style={styles.separator} />;
});

const ConversationRow = memo(function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: ChatConversation;
  onPress: (conversation: ChatConversation) => void;
}) {
  const unread = conversation.unread > 0;
  const preview = conversationPreview(conversation);
  const lastMine = conversation.last_message?.sender.is_me || conversation.last_message?.sender.is_management;
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={() => onPress(conversation)}
      accessibilityRole="button"
      accessibilityLabel={`${conversation.title}${unread ? `, ${conversation.unread} okunmamış` : ""}`}
      style={styles.row}
    >
      <View style={styles.avatarWrap}>
        <Avatar name={conversation.title} image={conversation.avatar} size={50} ring={unread ? "brand" : "none"} />
        <View style={[styles.typePip, conversation.type === "management" || conversation.type === "admin" ? styles.typePipBrand : null]}>
          <Ionicons name={TYPE_ICON[conversation.type]} size={10} color={colors.textOnBrand} />
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={[styles.title, unread ? styles.titleUnread : null]} numberOfLines={1} {...textScale.dense}>
            {conversation.title}
          </Text>
          <Text style={[styles.time, unread ? styles.timeUnread : null]} {...textScale.badge}>
            {smartDate(conversation.last_message_at)}
          </Text>
        </View>
        <View style={styles.line}>
          <View style={styles.previewRow}>
            {lastMine ? <Ionicons name="checkmark-done" size={13} color={colors.info} /> : null}
            <Text style={[styles.preview, unread ? styles.previewUnread : null]} numberOfLines={1} {...textScale.dense}>
              {preview}
            </Text>
          </View>
          {unread ? (
            <Badge label={conversation.unread > 99 ? "99+" : conversation.unread} tone="win" variant="solid" size="sm" />
          ) : conversation.muted ? (
            <Ionicons name="notifications-off-outline" size={14} color={colors.textTertiary} />
          ) : null}
        </View>
      </View>
    </Touchable>
  );
});

const PIP = 18;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm, gap: space.sm },
  typeRow: { paddingTop: space.xs },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  list: { flexGrow: 1, paddingBottom: space.huge + space.giant },
  separator: { height: hairline, backgroundColor: colors.separator, marginLeft: layout.screenPadding + 50 + space.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.m,
    minHeight: layout.listRowHeightTwoLine,
  },
  avatarWrap: { width: 58, height: 58, alignItems: "center", justifyContent: "center" },
  typePip: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: PIP,
    height: PIP,
    borderRadius: PIP / 2,
    backgroundColor: colors.slate,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  typePipBrand: { backgroundColor: colors.brand },
  body: { flex: 1, gap: space.xs, minWidth: 0 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  title: { ...type.h3, color: colors.textPrimary, flex: 1 },
  titleUnread: { color: colors.textPrimary },
  time: { ...type.caption, color: colors.textTertiary },
  timeUnread: { color: colors.win },
  previewRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.xs, minWidth: 0 },
  preview: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  previewUnread: { color: colors.textPrimary, fontFamily: type.label.fontFamily },
});
