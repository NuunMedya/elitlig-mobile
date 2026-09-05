/**
 * KAYITLAR — tüm sesli aramalar (ses kayıtları dinlenir) ve sesli mesajlar.
 * Yalnız yönetim hesapları; sunucu messages.view yetkisiyle süzer.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AudioPlayerRow } from "@/components/chat/ChatBubbles";
import { Badge, Chip, ChipGroup, EmptyState, ErrorState, MetricGrid, MetricTile, ScreenHeader, SkeletonListRow, Touchable, useHeaderScroll, useRefresh } from "@/components/ui";
import { adminChat, formatDurationMs, type AdminAudioMessage, type AdminCallRecord } from "@/lib/api/chat";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type Tab = "aramalar" | "sesli";

const dateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export default function RecordsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [tab, setTab] = useState<Tab>("aramalar");
  const [onlyRecorded, setOnlyRecorded] = useState(false);
  const enabled = Boolean(auth.user) && auth.isManagement;

  const stats = useQuery({ queryKey: ["chat", "admin", "stats"], queryFn: adminChat.getStats, enabled, staleTime: 30_000, retry: false });
  const calls = useQuery({ queryKey: ["chat", "admin", "calls", onlyRecorded], queryFn: () => adminChat.getCalls({ recorded: onlyRecorded ? "1" : undefined, limit: 100 }), enabled: enabled && tab === "aramalar", staleTime: 15_000, retry: false });
  const audio = useQuery({ queryKey: ["chat", "admin", "audio"], queryFn: () => adminChat.getAudioMessages({ limit: 100 }), enabled: enabled && tab === "sesli", staleTime: 15_000, retry: false });

  const refetch = useCallback(() => { void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] }); }, [queryClient]);
  const active = tab === "aramalar" ? calls : audio;
  const refresh = useRefresh(refetch, { refreshing: active.isRefetching });
  const openConversation = useCallback((id: number) => router.push(`/yonetim/sohbet/${id}` as never), [router]);

  if (!auth.user) return <Redirect href="/giris" />;
  if (!auth.isManagement) return <Redirect href={"/sohbet" as never} />;

  const header = (
    <View style={styles.headerBottom}>
      <ChipGroup>
        <Chip label="Aramalar" icon="call" selected={tab === "aramalar"} onPress={() => setTab("aramalar")} />
        <Chip label="Sesli mesajlar" icon="mic" selected={tab === "sesli"} onPress={() => setTab("sesli")} />
        {tab === "aramalar" ? <Chip label="Yalnız kayıtlı" icon="recording" selected={onlyRecorded} onPress={() => setOnlyRecorded((value) => !value)} /> : null}
      </ChipGroup>
    </View>
  );

  const statsRow = stats.data ? (
    <MetricGrid>
      <MetricTile label="Arama" value={String(stats.data.calls)} />
      <MetricTile label="Kayıtlı arama" value={String(stats.data.recorded_calls)} tone="brand" />
      <MetricTile label="Sesli mesaj" value={String(stats.data.audio_messages)} />
    </MetricGrid>
  ) : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Kayıtlar" subtitle="Aramalar ve sesli mesajlar" back scrollY={scrollY} bottom={header} />
      {tab === "aramalar" ? (
        calls.isLoading ? (
          <View style={styles.skeleton}><SkeletonListRow count={6} avatar /></View>
        ) : calls.isError ? (
          <ErrorState error={calls.error} onRetry={refetch} />
        ) : (
          <FlatList
            data={calls.data?.calls ?? []}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => <CallRow call={item} onOpen={openConversation} />}
            onScroll={scrollProps.onScroll}
            scrollEventThrottle={scrollProps.scrollEventThrottle}
            contentContainerStyle={styles.list}
            refreshControl={refresh.control}
            ListHeaderComponent={statsRow}
            ItemSeparatorComponent={Separator}
            ListEmptyComponent={<EmptyState icon="call-outline" title="Arama kaydı yok" body={onlyRecorded ? "Henüz ses kaydı yüklenmiş arama yok." : "Yapılan aramalar burada listelenir."} />}
          />
        )
      ) : audio.isLoading ? (
        <View style={styles.skeleton}><SkeletonListRow count={6} avatar /></View>
      ) : audio.isError ? (
        <ErrorState error={audio.error} onRetry={refetch} />
      ) : (
        <FlatList
          data={audio.data?.messages ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <AudioRow message={item} onOpen={openConversation} />}
          onScroll={scrollProps.onScroll}
          scrollEventThrottle={scrollProps.scrollEventThrottle}
          contentContainerStyle={styles.list}
          refreshControl={refresh.control}
          ListHeaderComponent={statsRow}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={<EmptyState icon="mic-outline" title="Sesli mesaj yok" body="Gönderilen sesli mesajlar burada listelenir." />}
        />
      )}
    </SafeAreaView>
  );
}

const Separator = memo(function Separator() { return <View style={styles.separator} />; });

const CallRow = memo(function CallRow({ call, onOpen }: { call: AdminCallRecord; onOpen: (id: number) => void }) {
  const ok = call.status === "ended";
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={[styles.icon, { backgroundColor: ok ? colors.winDim : colors.dangerDim }]}>
          <Ionicons name={ok ? "call" : "call-outline"} size={16} color={ok ? colors.win : colors.danger} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>{call.caller.name} → {call.callee.name}</Text>
          <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>{dateTime(call.started_at)} · {call.label ?? call.status}{call.duration_seconds ? ` · ${formatDurationMs(call.duration_seconds * 1000)}` : ""}</Text>
        </View>
        <Touchable feedback="icon" haptic="selection" onPress={() => onOpen(call.conversation_id)} accessibilityLabel="Sohbete git" style={styles.goto}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand} />
        </Touchable>
      </View>
      {call.recording_url ? <AudioPlayerRow url={call.recording_url} durationMs={call.recording_duration_ms} /> : <Badge label="Ses kaydı yok" tone="neutral" size="xs" />}
    </View>
  );
});

const AudioRow = memo(function AudioRow({ message, onOpen }: { message: AdminAudioMessage; onOpen: (id: number) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={[styles.icon, { backgroundColor: colors.brandDim }]}><Ionicons name="mic" size={16} color={colors.brand} /></View>
        <View style={styles.rowBody}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>{message.sender.name ?? "Üye"}</Text>
          <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>{dateTime(message.created_at)}{message.conversation ? ` · ${message.conversation.title}` : ""}</Text>
        </View>
        {message.conversation ? (
          <Touchable feedback="icon" haptic="selection" onPress={() => onOpen(message.conversation!.id)} accessibilityLabel="Sohbete git" style={styles.goto}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand} />
          </Touchable>
        ) : null}
      </View>
      <AudioPlayerRow url={message.meta?.audio?.url} durationMs={message.meta?.audio?.duration_ms} />
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBottom: { paddingBottom: space.sm },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  list: { flexGrow: 1, paddingHorizontal: layout.screenPadding, paddingVertical: space.md, gap: space.sm, paddingBottom: space.giant },
  separator: { height: hairline, backgroundColor: colors.separator },
  row: { gap: space.sm, paddingVertical: space.sm },
  rowHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0, gap: space.xxs },
  title: { ...type.h4, color: colors.textPrimary },
  subtitle: { ...type.caption, color: colors.textSecondary },
  goto: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
