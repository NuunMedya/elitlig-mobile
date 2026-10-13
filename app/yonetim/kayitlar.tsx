/**
 * KAYITLAR — yalnızca üyelerin yönetimle yaptığı sesli aramalar.
 *
 * Üyelerin kendi aralarındaki aramalar ve yazışmalar yönetime kapalıdır;
 * yalnızca yönetim aramaları kaydedilir. Listeyi görmek "messages.calls_view",
 * kaydı dinlemek "messages.listen" yetkisine bağlıdır (sunucu süzer; dinleme
 * yetkisi yoksa recording_url boş, has_recording dolu gelir).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AudioPlayerRow } from "@/components/chat/ChatBubbles";
import { Badge, Chip, ChipGroup, EmptyState, ErrorState, MetricGrid, MetricTile, ScreenHeader, SkeletonListRow, Touchable, useHeaderScroll, useRefresh } from "@/components/ui";
import { adminChat, formatDurationMs, type AdminCallRecord } from "@/lib/api/chat";
import { useAuth } from "@/providers/AuthProvider";
import { colors, elevate, layout, radius, space, textScale, type } from "@/theme";

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
  const [onlyRecorded, setOnlyRecorded] = useState(false);
  const enabled = Boolean(auth.user) && auth.isManagement;

  const stats = useQuery({ queryKey: ["chat", "admin", "stats"], queryFn: adminChat.getStats, enabled, staleTime: 30_000, retry: false });
  const calls = useQuery({ queryKey: ["chat", "admin", "calls", onlyRecorded], queryFn: () => adminChat.getCalls({ recorded: onlyRecorded ? "1" : undefined, limit: 100 }), enabled, staleTime: 15_000, retry: false });

  const refetch = useCallback(() => { void queryClient.invalidateQueries({ queryKey: ["chat", "admin"] }); }, [queryClient]);
  const refresh = useRefresh(refetch, { refreshing: calls.isRefetching });
  const canListen = calls.data?.can_listen ?? false;
  const openConversation = useCallback((id: number) => router.push(`/yonetim/sohbet/${id}` as never), [router]);

  if (!auth.user) return <Redirect href="/giris" />;
  if (!auth.isManagement) return <Redirect href={"/sohbet" as never} />;

  const header = (
    <View style={styles.headerBottom}>
      <ChipGroup>
        <Chip label="Tüm aramalar" icon="call" selected={!onlyRecorded} onPress={() => setOnlyRecorded(false)} />
        <Chip label="Yalnız kayıtlı" icon="recording" selected={onlyRecorded} onPress={() => setOnlyRecorded(true)} />
      </ChipGroup>
    </View>
  );

  const listHeader = (
    <View style={styles.listHeader}>
      {stats.data ? (
        <MetricGrid>
          <MetricTile label="Sohbet" value={String(stats.data.conversations)} />
          <MetricTile label="Arama" value={String(stats.data.calls)} />
          <MetricTile label="Kayıtlı" value={String(stats.data.recorded_calls)} />
        </MetricGrid>
      ) : null}
      <Text style={styles.lead} {...textScale.dense}>
        Yalnızca üyelerin yönetimle yaptığı aramalar kaydedilir; üyelerin kendi aralarındaki aramalar ve yazışmalar yönetime görünmez.
        {calls.data && !canListen ? " Kayıtları dinlemek için kayıt dinleme yetkisi gerekir." : ""}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Kayıtlar" subtitle="Yönetimle yapılan aramalar" back scrollY={scrollY} bottom={header} />
      {calls.isLoading ? (
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
          ListHeaderComponent={listHeader}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={<EmptyState icon="call-outline" title="Arama kaydı yok" body={onlyRecorded ? "Henüz ses kaydı yüklenmiş yönetim araması yok." : "Yönetimle yapılan aramalar burada listelenir."} />}
        />
      )}
    </SafeAreaView>
  );
}

const Separator = memo(function Separator() { return <View style={styles.separator} />; });

/** Arama durumu sözlüğü — sunucu kodu ("ended") kullanıcıya gösterilmez. */
const CALL_STATUS_LABELS: Record<AdminCallRecord["status"], string> = {
  ringing: "Çalıyor",
  accepted: "Görüşülüyor",
  rejected: "Reddedildi",
  missed: "Cevapsız",
  cancelled: "İptal edildi",
  busy: "Meşgul",
  ended: "Tamamlandı",
  failed: "Bağlanamadı",
};

/**
 * Arama kartı. Renk YALNIZ sonuç söyler: tamamlanan arama nötr ikondur,
 * cevapsız/başarısız arama kırmızıdır. Eskiden her başarılı arama yeşil bir
 * karoyla çiziliyordu ve listenin tamamı "kazanç" rengine bürünüyordu.
 */
const CallRow = memo(function CallRow({ call, onOpen }: { call: AdminCallRecord; onOpen: (id: number) => void }) {
  const ok = call.status === "ended" || call.status === "accepted";
  const statusLabel = call.label ?? CALL_STATUS_LABELS[call.status] ?? call.status;
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={[styles.icon, ok ? null : styles.iconFailed]}>
          <Ionicons name={ok ? "call-outline" : "call"} size={16} color={ok ? colors.textSecondary : colors.danger} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {call.caller.name}
            <Text style={styles.arrow}>{"  →  "}</Text>
            {call.callee.name}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
            {dateTime(call.started_at)} · <Text style={ok ? null : styles.failed}>{statusLabel}</Text>
            {call.duration_seconds ? ` · ${formatDurationMs(call.duration_seconds * 1000)}` : ""}
          </Text>
        </View>
        <Touchable feedback="icon" haptic="selection" onPress={() => onOpen(call.conversation_id)} accessibilityLabel="Sohbete git" style={styles.goto}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brandAccent} />
        </Touchable>
      </View>
      {call.recording_url ? (
        <View style={styles.player}>
          <AudioPlayerRow url={call.recording_url} durationMs={call.recording_duration_ms} />
        </View>
      ) : call.has_recording ? (
        <Badge label="Kayıt var, dinleme yetkisi yok" tone="warn" size="xs" icon="lock-closed" />
      ) : (
        <Text style={styles.noRecording} {...textScale.dense}>Ses kaydı yok</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBottom: { paddingBottom: space.sm },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  list: { flexGrow: 1, paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant },
  listHeader: { gap: space.md, marginBottom: space.md },
  lead: { ...type.bodySm, color: colors.textSecondary, paddingHorizontal: space.xxs },
  separator: { height: space.sm },
  row: {
    gap: space.md,
    padding: space.md + space.xxs,
    borderRadius: radius.xl,
    ...elevate(1),
  },
  rowHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  iconFailed: { backgroundColor: colors.dangerDim },
  rowBody: { flex: 1, minWidth: 0, gap: space.xxs },
  title: { ...type.h3, color: colors.textPrimary },
  arrow: { color: colors.textTertiary },
  subtitle: { ...type.bodySm, color: colors.textSecondary },
  failed: { color: colors.danger },
  goto: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  player: {
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  noRecording: { ...type.caption, color: colors.textTertiary },
});
