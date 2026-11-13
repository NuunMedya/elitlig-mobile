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
import { CountStrip, DangerNote } from "@/components/admin/team/ManageKit";
import { Avatar, Badge, Chip, ChipGroup, EmptyState, ErrorState, ScreenHeader, SkeletonListRow, Touchable, useHeaderScroll, useRefresh } from "@/components/ui";
import { adminChat, formatDurationMs, type AdminCallRecord } from "@/lib/api/chat";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

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
  if (!auth.isManagement) return <Redirect href={"/(tabs)/mesajlar" as never} />;

  const header = (
    <View style={styles.headerBottom}>
      <ChipGroup>
        <Chip label="Tüm aramalar" icon="call" selected={!onlyRecorded} onPress={() => setOnlyRecorded(false)} />
        <Chip label="Yalnız kayıtlı" icon="recording" selected={onlyRecorded} onPress={() => setOnlyRecorded(true)} />
      </ChipGroup>
    </View>
  );

  const list = calls.data?.calls ?? [];
  const missed = list.filter((c) => c.status !== "ended" && c.status !== "accepted").length;
  const listHeader = (
    <View style={styles.listHeader}>
      {stats.data ? (
        <CountStrip
          items={[
            { key: "calls", label: "Arama", value: stats.data.calls, icon: "call" },
            { key: "rec", label: "Kayıtlı", value: stats.data.recorded_calls, tone: "brand", icon: "recording", selected: onlyRecorded, onPress: () => setOnlyRecorded((v) => !v) },
            { key: "missed", label: "Cevapsız", value: missed, tone: "danger", icon: "call-outline", hint: "bu listede" },
          ]}
        />
      ) : null}
      <DangerNote
        tone="info"
        icon="shield-checkmark"
        title="Yalnız yönetim aramaları"
        body={`Üyelerin kendi aralarındaki aramalar ve yazışmalar yönetime görünmez.${calls.data && !canListen ? " Kayıtları dinlemek için kayıt dinleme yetkisi gerekir." : ""}`}
      />
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
          data={list}
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
  const avatarOf = (u: AdminCallRecord["caller"]) => ("avatar" in u ? u.avatar : null);
  return (
    <View style={[styles.row, ok ? null : styles.rowFailed]}>
      {ok ? null : <View style={styles.failRail} />}
      <View style={styles.rowHead}>
        {/* ARAYAN → ARANAN: iki avatar ve aradaki yön oku. */}
        <View style={styles.pair}>
          <Avatar name={call.caller.name} image={avatarOf(call.caller)} size={34} />
          <View style={[styles.dir, ok ? null : styles.dirFailed]}>
            <Ionicons name={ok ? "arrow-forward" : "close"} size={10} color={ok ? colors.textOnBrand : colors.onDark} />
          </View>
          <Avatar name={call.callee.name} image={avatarOf(call.callee)} size={34} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {call.caller.name}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
            → {call.callee.name}
          </Text>
        </View>
        <Touchable feedback="icon" haptic="selection" onPress={() => onOpen(call.conversation_id)} accessibilityLabel="Sohbete git" style={styles.goto}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brandAccent} />
        </Touchable>
      </View>
      <View style={styles.meta}>
        <Badge label={statusLabel} tone={ok ? "neutral" : "danger"} icon={ok ? "checkmark" : "close"} size="xs" />
        {call.duration_seconds ? <Badge label={formatDurationMs(call.duration_seconds * 1000)} icon="time-outline" size="xs" /> : null}
        <Text style={styles.when} {...textScale.dense}>
          {dateTime(call.started_at)}
        </Text>
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
  separator: { height: space.sm },
  row: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  rowFailed: { borderColor: colors.dangerDim },
  failRail: { position: "absolute", left: 0, top: space.md, bottom: space.md, width: 3, borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill, backgroundColor: colors.danger },
  rowHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  pair: { flexDirection: "row", alignItems: "center" },
  dir: {
    width: 18,
    height: 18,
    marginHorizontal: -space.xs,
    zIndex: 1,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: colors.surface1,
  },
  dirFailed: { backgroundColor: colors.danger },
  rowBody: { flex: 1, minWidth: 0, gap: 1 },
  title: { ...type.h4, color: colors.textPrimary },
  subtitle: { ...type.bodySm, color: colors.textSecondary },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xs },
  when: { ...type.caption, color: colors.textTertiary, marginLeft: space.xxs },
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
