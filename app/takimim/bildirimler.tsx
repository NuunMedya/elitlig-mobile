/**
 * TAKIM BİLDİRİMLERİ — Transfer · Disiplin · Maç.
 * `/takimim/bildirimler?tur=<transfer|disiplin|mac>`
 *
 * Web: pages/panel/NotificationList.js — tek uç (/api/panel-notifications),
 * türe göre üç sekme. Satıra dokununca bildirim okundu işaretlenir
 * (PATCH /:id/read) ve ilgili YEREL ekran açılır (lib/api/club/
 * notifications.ts → notificationHref). "Tümünü okundu say" PATCH /read-all.
 *
 * Genel gelen kutusundan farkı: yalnız kulüp işleri, web menüsündeki üç
 * başlıkla aynı ayrım ve her sekmede okunmamış sayısı.
 */

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SkeletonListFooter,
  SkeletonListRow,
  Tabs,
  useHeaderScroll,
  useRefresh,
  type TabItem,
} from "@/components/ui";
import {
  NOTIFICATION_KINDS,
  notificationHref,
  notificationKind,
  type NotificationKind,
} from "@/lib/api/club/notifications";
import { getPanelNotifications, markAllNotifsRead, markNotifRead, type PanelNotification } from "@/lib/api/panel";
import { timeAgo } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space, textScale, type } from "@/theme";

const PARAM_TO_KIND: Record<string, NotificationKind> = { transfer: "transfer", disiplin: "discipline", mac: "match" };
const KIND_TO_PARAM: Record<NotificationKind, string> = { transfer: "transfer", discipline: "disiplin", match: "mac" };
const KIND_ICON = { transfer: "swap-horizontal", discipline: "alert-circle", match: "football" } as const;
const KIND_TONE = { transfer: "brand", discipline: "danger", match: "live" } as const;
const PAGE = 50;

const positionOf = (index: number, length: number) =>
  length === 1 ? "single" : index === 0 ? "first" : index === length - 1 ? "last" : "middle";

export default function TeamNotificationsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ tur?: string }>();
  const [kind, setKind] = useState<NotificationKind>(PARAM_TO_KIND[String(params.tur)] ?? "transfer");

  const query = useInfiniteQuery({
    queryKey: ["club", "notifications", "all"],
    queryFn: ({ pageParam }) => getPanelNotifications(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * PAGE < last.totalItems ? last.page + 1 : undefined),
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const all = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const unread = useMemo(() => {
    const counts: Record<NotificationKind, number> = { transfer: 0, discipline: 0, match: 0 };
    for (const item of all) {
      const k = notificationKind(item);
      if (k && !item.is_read) counts[k] += 1;
    }
    return counts;
  }, [all]);
  const visible = useMemo(() => all.filter((item) => notificationKind(item) === kind), [all, kind]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["club", "notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["panel", "notifications"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifCount() });
  };
  const readOne = useMutation({ mutationFn: (id: number) => markNotifRead(id), onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: markAllNotifsRead, onSuccess: invalidate });

  const open = (item: PanelNotification) => {
    if (!item.is_read) readOne.mutate(item.id);
    const href = notificationHref(item);
    if (href) router.push(href as Href);
  };

  const tabs: TabItem<NotificationKind>[] = (Object.keys(NOTIFICATION_KINDS) as NotificationKind[]).map((key) => ({
    key,
    label: NOTIFICATION_KINDS[key].label,
    badge: unread[key] || undefined,
  }));

  if (!auth.user) return <Redirect href="/giris" />;
  const totalUnread = unread.transfer + unread.discipline + unread.match;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Kulüp bildirimleri"
        back
        scrollY={scrollY}
        actions={
          totalUnread
            ? [{ icon: "checkmark-done-outline", onPress: () => readAll.mutate(), accessibilityLabel: "Tümünü okundu say" }]
            : undefined
        }
        tabs={
          <Tabs
            items={tabs}
            value={kind}
            onChange={(next) => {
              setKind(next);
              router.setParams({ tur: KIND_TO_PARAM[next] });
            }}
            sticky
          />
        }
      />
      <FlatList
        {...scrollProps}
        data={query.isLoading ? [] : visible}
        keyExtractor={(item) => String(item.id)}
        refreshControl={refresh.control}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <Text style={styles.hint} {...textScale.long}>
            {NOTIFICATION_KINDS[kind].hint}
          </Text>
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        ListFooterComponent={query.isFetchingNextPage ? <SkeletonListFooter /> : null}
        ListEmptyComponent={
          query.isLoading ? (
            <SkeletonListRow count={6} />
          ) : query.isError ? (
            <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
          ) : (
            <EmptyState variant="inline" icon="notifications-off-outline" title="Bildirim yok" body="Bu başlıkta yeni bir şey olduğunda burada görünür." />
          )
        }
        renderItem={({ item, index }) => (
          <ListRow
            leading={{ icon: KIND_ICON[kind], tone: item.is_read ? "neutral" : KIND_TONE[kind] }}
            title={item.title}
            subtitle={[item.description, timeAgo(item.createdAt)].filter(Boolean).join(" · ")}
            highlighted={!item.is_read}
            position={positionOf(index, visible.length)}
            onPress={() => open(item)}
            chevron={Boolean(notificationHref(item))}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  hint: { ...type.caption, color: colors.textTertiary, paddingVertical: space.md },
});
