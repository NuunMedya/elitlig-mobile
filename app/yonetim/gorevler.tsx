/**
 * GÖREVLERİM — yönetim kullanıcısının yapılacaklar listesi (yerel ekran).
 *
 * NE: web'deki Yapılacaklar panosunun mobil özü. Üç görünüm:
 *   BANA        bana ait açık kartlar (kendi notlarım + bana atananlar + maç görevlerim)
 *   ATADIKLARIM başkalarına atadığım ve henüz bitmemiş kartlar
 *   BİTENLER    tamamladıklarım
 * Karta dokununca açılır: açıklama, maç bilgisi, aşamalar, cevap ve durum
 * düğmeleri (Başla / Tamamla / Yeniden aç).
 *
 * Panonun tamamı (sürükle-bırak, etiketler, ekip takibi, haftanın enleri
 * koordinasyonu, maç masası) web sürümündedir; sağ üstteki düğme onu
 * uygulama içinde açar (app/yonetim/web.tsx).
 *
 * BİLDİRİM: görev atandığında, atadığın görev ilerlediğinde / bittiğinde ve
 * süresi dolarken push gelir (elitlig-server services/todoNotifications.js);
 * bildirime dokunmak bu ekranı açar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FAB,
  Input,
  ScreenHeader,
  SegmentedControl,
  SkeletonListRow,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
} from "@/components/ui";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import {
  getTodoSummary,
  getTodos,
  todoKeys,
  TODO_PRIORITY_LABELS,
  updateTodo,
  type TodoPatch,
  type TodoStatus,
  type TodoListTab,
  type TodoTask,
} from "@/lib/api/todos";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type TodoTab = TodoListTab;

const TABS: SegmentedItem<TodoTab>[] = [
  { key: "mine", label: "Bana" },
  { key: "assigned", label: "Atadıklarım" },
  { key: "done", label: "Bitenler" },
];

const POLL_MS = 60_000;

/** "Bugün 18:00", "Yarın 09:30", "12 Ekim 14:00" */
function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const day = (value: Date) => value.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  const clock = date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (day(date) === day(now)) return `Bugün ${clock}`;
  if (day(date) === day(tomorrow)) return `Yarın ${clock}`;
  return `${date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" })} ${clock}`;
}

export default function AdminTodosScreen() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const appActive = useAppActive();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ id?: string; tab?: string }>();

  const initialTab: TodoTab = params.tab === "assigned" || params.tab === "done" ? params.tab : "mine";
  const [tab, setTab] = useState<TodoTab>(initialTab);
  const [expanded, setExpanded] = useState<number | null>(params.id ? Number(params.id) : null);

  // Bildirimden gelinirse ilgili kart açık başlar.
  useEffect(() => {
    if (params.id) setExpanded(Number(params.id));
  }, [params.id]);

  const enabled = Boolean(auth.user) && auth.isManagement;
  const poll = appActive ? POLL_MS : false;

  const listQuery = useQuery({
    queryKey: todoKeys.list(tab),
    queryFn: () =>
      tab === "assigned" ? getTodos("assigned", "active") : tab === "done" ? getTodos("mine", "done") : getTodos("mine", "active"),
    enabled,
    refetchInterval: poll,
    staleTime: 15_000,
  });

  const summaryQuery = useQuery({
    queryKey: todoKeys.summary(),
    queryFn: getTodoSummary,
    enabled,
    refetchInterval: poll,
    staleTime: 15_000,
    retry: false,
  });

  const refresh = useRefresh(
    () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all });
    },
    { refreshing: listQuery.isRefetching }
  );

  const mutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TodoPatch }) => updateTodo(id, patch),
    onSuccess: (item, { patch }) => {
      // Kart yerinde güncellenir; durum değiştiyse liste yeniden çekilir.
      queryClient.setQueryData<TodoTask[]>(todoKeys.list(tab), (current) =>
        current?.map((task) => (task.id === item.id ? item : task))
      );
      if (patch.status) {
        void queryClient.invalidateQueries({ queryKey: todoKeys.all });
        toast.show({
          message:
            patch.status === "done"
              ? "Görev tamamlandı."
              : patch.status === "in_progress"
                ? "Görev sürüyor olarak işaretlendi."
                : "Görev yeniden açıldı.",
          tone: patch.status === "done" ? "success" : "neutral",
        });
      } else if (patch.response !== undefined) {
        toast.show({ message: "Cevabın kaydedildi.", tone: "success" });
      }
    },
    onError: (error) => {
      toast.show({
        message: error instanceof Error && error.message ? error.message : "Görev güncellenemedi.",
        tone: "danger",
      });
    },
  });

  const change = useCallback((id: number, patch: TodoPatch) => mutation.mutate({ id, patch }), [mutation]);
  const toggle = useCallback((id: number) => setExpanded((current) => (current === id ? null : id)), []);

  const openBoard = useCallback(
    () =>
      router.push({
        pathname: "/yonetim/web",
        params: { path: "/yonetim/yapilacaklar", title: "Yapılacaklar Panosu" },
      }),
    [router]
  );
  const openCreate = useCallback(() => router.push("/yonetim/gorev-yeni"), [router]);

  const summary = summaryQuery.data;
  const summaryText = useMemo(() => {
    if (!summary) return null;
    const parts = [`${summary.open} açık`];
    if (summary.overdue) parts.push(`${summary.overdue} gecikmiş`);
    if (summary.today) parts.push(`${summary.today} bugün`);
    if (summary.matchDuties) parts.push(`${summary.matchDuties} maç görevi`);
    return parts.join(" · ");
  }, [summary]);

  if (!enabled) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Görevlerim" back />
        <EmptyState
          icon="lock-closed-outline"
          title="Bu bölüm yönetime açık"
          body="Yapılacaklar listesi yönetim hesaplarına açıktır."
          action={{ label: "Yönetim girişi", onPress: () => router.push("/giris?yonetim=1") }}
        />
      </SafeAreaView>
    );
  }

  const items = listQuery.data ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Görevlerim"
        back
        scrollY={scrollY}
        actions={[{ icon: "albums-outline", onPress: openBoard, accessibilityLabel: "Web panosunu aç" }]}
        bottom={
          <View style={styles.segmentWrap}>
            <SegmentedControl<TodoTab> items={TABS} value={tab} onChange={setTab} />
          </View>
        }
      />

      <FlatList
        {...scrollProps}
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
        ListHeaderComponent={
          summaryText ? (
            <View style={[styles.summary, summary?.overdue ? styles.summaryWarn : null]}>
              <Ionicons
                name={summary?.overdue ? "alert-circle-outline" : "checkbox-outline"}
                size={16}
                color={summary?.overdue ? colors.danger : colors.brandAccent}
              />
              <Text style={styles.summaryText} {...textScale.dense}>
                {summaryText}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          listQuery.isLoading ? (
            <SkeletonListRow count={6} avatar={false} />
          ) : listQuery.error ? (
            <ErrorState error={listQuery.error} onRetry={listQuery.refetch} />
          ) : (
            <EmptyState
              icon="checkmark-done-outline"
              title={tab === "done" ? "Tamamlanan görev yok" : tab === "assigned" ? "Açık atadığın görev yok" : "Açık görevin yok"}
              body={tab === "mine" ? "Yeni görev eklemek için + düğmesine dokun." : undefined}
              variant="inline"
            />
          )
        }
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            expanded={expanded === item.id}
            onToggle={toggle}
            onChange={change}
            busy={mutation.isPending && mutation.variables?.id === item.id}
            onOpenMatch={(matchId) => router.push({ pathname: "/mac/[id]", params: { id: String(matchId) } })}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <FAB icon="add" onPress={openCreate} accessibilityLabel="Yeni görev" label="Görev" extended />
    </SafeAreaView>
  );
}

/* ═══════════════════════════ GÖREV KARTI ═══════════════════════════ */

const STATUS_TONE: Record<TodoStatus, "neutral" | "info" | "win"> = {
  open: "neutral",
  in_progress: "info",
  done: "win",
};

const TaskCard = memo(function TaskCard({
  task,
  expanded,
  onToggle,
  onChange,
  busy,
  onOpenMatch,
}: {
  task: TodoTask;
  expanded: boolean;
  onToggle: (id: number) => void;
  onChange: (id: number, patch: TodoPatch) => void;
  busy: boolean;
  onOpenMatch: (matchId: number) => void;
}) {
  const [response, setResponse] = useState(task.response || "");
  useEffect(() => setResponse(task.response || ""), [task.response]);

  const due = formatDue(task.dueAt);
  const owner = task.permissions.isOwner;
  const canStatus = task.permissions.canChangeStatus;
  const subtitle = [
    task.dutyLabel || task.kindLabel,
    owner ? (task.assignedBy ? `Atayan: ${task.assignedBy.name}` : null) : `Sorumlu: ${task.owner.name}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const toggleChecklist = (itemId: string) =>
    onChange(task.id, {
      checklist: task.checklist.map((entry) => (entry.id === itemId ? { ...entry, done: !entry.done } : entry)),
    });

  return (
    <View style={[styles.card, task.overdue ? styles.cardOverdue : null]}>
      <Touchable
        feedback="card"
        onPress={() => onToggle(task.id)}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}. ${task.statusLabel}${due ? `. Bitiş ${due}` : ""}`}
        style={styles.cardHead}
      >
        <Ionicons
          name={task.status === "done" ? "checkmark-circle" : task.status === "in_progress" ? "time-outline" : "ellipse-outline"}
          size={22}
          color={task.status === "done" ? colors.win : task.overdue ? colors.danger : colors.brandAccent}
        />
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, task.status === "done" ? styles.doneTitle : null]} numberOfLines={expanded ? 4 : 2} {...textScale.dense}>
            {task.title}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1} {...textScale.dense}>
            {subtitle}
          </Text>
          <View style={styles.badges}>
            <Badge label={task.statusLabel} tone={STATUS_TONE[task.status]} size="xs" />
            {task.priority === "high" ? <Badge label="Yüksek öncelik" tone="warn" size="xs" /> : null}
            {due ? <Badge label={due} tone={task.overdue ? "danger" : "neutral"} size="xs" icon="time-outline" /> : null}
            {task.checklist.length ? (
              <Badge
                label={`${task.checklist.filter((entry) => entry.done).length}/${task.checklist.length} aşama`}
                tone="neutral"
                size="xs"
              />
            ) : null}
          </View>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
      </Touchable>

      {expanded ? (
        <View style={styles.detail}>
          {task.body ? (
            <Text style={styles.bodyText} {...textScale.long}>
              {task.body}
            </Text>
          ) : null}

          {task.match ? (
            <Touchable onPress={() => onOpenMatch(task.match!.id)} style={styles.linkRow} accessibilityRole="link">
              <Ionicons name="football-outline" size={14} color={colors.brandAccent} />
              <Text style={styles.linkText} numberOfLines={2} {...textScale.dense}>
                {[task.match.label, task.match.league, task.match.field].filter(Boolean).join(" · ")}
              </Text>
            </Touchable>
          ) : null}
          {task.team ? (
            <Text style={styles.meta} {...textScale.dense}>
              Takım: {task.team.name}
            </Text>
          ) : null}
          {task.player ? (
            <Text style={styles.meta} {...textScale.dense}>
              Oyuncu: {task.player.name}
            </Text>
          ) : null}
          <Text style={styles.meta} {...textScale.dense}>
            Öncelik: {TODO_PRIORITY_LABELS[task.priority] ?? task.priority}
          </Text>

          {task.checklist.length ? (
            <View style={styles.checklist}>
              {task.checklist.map((entry) => (
                <Touchable
                  key={entry.id}
                  onPress={() => toggleChecklist(entry.id)}
                  disabled={busy}
                  style={styles.checkRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: entry.done }}
                >
                  <Ionicons
                    name={entry.done ? "checkbox" : "square-outline"}
                    size={18}
                    color={entry.done ? colors.win : colors.textSecondary}
                  />
                  <Text style={[styles.checkText, entry.done ? styles.doneTitle : null]} {...textScale.dense}>
                    {entry.text}
                  </Text>
                </Touchable>
              ))}
            </View>
          ) : null}

          {owner ? (
            <View style={styles.responseBox}>
              <Input
                label="Cevap / not"
                value={response}
                onChangeText={setResponse}
                placeholder="Atayan kişiye iletilecek not"
                multiline
                size="sm"
              />
              {response.trim() !== (task.response || "").trim() ? (
                <Button
                  label="Cevabı kaydet"
                  size="sm"
                  variant="secondary"
                  icon="send-outline"
                  loading={busy}
                  onPress={() => onChange(task.id, { response })}
                />
              ) : null}
            </View>
          ) : task.response ? (
            <View style={styles.responseView}>
              <Text style={styles.meta} {...textScale.dense}>
                {task.owner.name} cevabı:
              </Text>
              <Text style={styles.bodyText} {...textScale.long}>
                {task.response}
              </Text>
            </View>
          ) : null}

          {canStatus ? (
            <View style={styles.actions}>
              {task.status === "open" ? (
                <Button label="Başla" size="sm" variant="secondary" icon="play-outline" loading={busy} onPress={() => onChange(task.id, { status: "in_progress" })} />
              ) : null}
              {task.status !== "done" ? (
                <Button label="Tamamla" size="sm" icon="checkmark" loading={busy} onPress={() => onChange(task.id, { status: "done" })} />
              ) : (
                <Button label="Yeniden aç" size="sm" variant="ghost" icon="refresh-outline" loading={busy} onPress={() => onChange(task.id, { status: "open" })} />
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

/* ═══════════════════════════ STİLLER ═══════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  segmentWrap: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  list: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant * 2, flexGrow: 1 },
  separator: { height: space.sm },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    marginBottom: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
  },
  summaryWarn: { backgroundColor: colors.dangerDim },
  summaryText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  card: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  cardOverdue: { borderColor: colors.danger },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.md },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { ...type.h3, color: colors.textPrimary },
  doneTitle: { textDecorationLine: "line-through", color: colors.textSecondary },
  cardSub: { ...type.caption, color: colors.textSecondary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xs },
  detail: {
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  bodyText: { ...type.bodySm, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textSecondary },
  linkRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  linkText: { ...type.bodySm, color: colors.brandAccent, flex: 1 },
  checklist: { gap: space.xs },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xxs },
  checkText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  responseBox: { gap: space.xs },
  responseView: { gap: 2 },
  actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
});
