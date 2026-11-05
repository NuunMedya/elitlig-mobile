/**
 * AJANDA VE TAKVİM — kişisel etkinlikler (web: /yonetim/araclar/ajanda).
 *
 * NE: ay, hafta, gün ve liste (60 gün) görünümleri. Tekrarlanan etkinlikler
 * sunucuda açılır; kullanıcının son tarihli açık Yapılacaklar kartları da
 * takvimde (kesik/köşeli işaretle) görünür ve dokununca Yapılacaklar
 * panosunda açılır. Türlere göre süzme ve Yapılacaklar'ı gizleme süzgeç
 * sayfasındadır; seçimler cihazda hatırlanır.
 *
 * MOBİL KARŞILIKLAR: web'deki çift tıklama → hücreye basılı tutma; .ics
 * indirme → etkinliği telefon takvimine ekleme; "sayfa açıkken bildirim" →
 * yerel bildirim planlama (uygulama kapalıyken de çalar, isteğe bağlı).
 *
 * UÇLAR: GET /api/tools/events?from&to, POST/PATCH/DELETE /api/tools/events.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { AdminScreen, ToggleField, confirmAction, useAdminMutation } from "@/components/admin";
import { DayList, MonthView, TimeGrid, groupByDay } from "@/components/admin/tools/AgendaViews";
import { disableReminders, enableReminders, exportToDeviceCalendar, readNotifyPref, syncReminders } from "@/components/admin/tools/agendaDevice";
import {
  addDays,
  blankForm,
  formFromEvent,
  itemsOnDay,
  rangeFor,
  relativeDayLocal,
  shiftCursor,
  startOfDay,
  titleFor,
  weekDays,
  type AgendaView,
  type EventForm,
} from "@/components/admin/tools/agendaUtils";
import { EventSheet } from "@/components/admin/tools/EventSheet";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  FAB,
  SectionHeader,
  SegmentedControl,
  Touchable,
  refreshControlProps,
  useRefresh,
  useToast,
} from "@/components/ui";
import { EVENT_CATEGORY_COLORS, AGENDA_TODO_COLOR } from "@/lib/admin/toolPalette";
import {
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  createEvent,
  deleteEvent,
  listEvents,
  toolKeys,
  updateEvent,
  type AgendaOccurrence,
  type EventCategory,
  type EventInput,
} from "@/lib/api/admin/tools";
import { colors, hairline, layout, radius, space, textScale, touchSlop, type } from "@/theme";

const VIEWS: { key: AgendaView; label: string }[] = [
  { key: "month", label: "Ay" },
  { key: "week", label: "Hafta" },
  { key: "day", label: "Gün" },
  { key: "list", label: "Liste" },
];
const VIEW_KEY = "tools:agenda:view";
const HIDDEN_KEY = "tools:agenda:hidden";
const TODOS_KEY = "tools:agenda:todos";

export default function AgendaScreen() {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<AgendaView>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [hidden, setHidden] = useState<EventCategory[]>([]);
  const [showTodos, setShowTodos] = useState(true);
  const [notify, setNotify] = useState(false);
  const [editor, setEditor] = useState<EventForm | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Cihazda hatırlanan görünüm ve süzgeçler.
  useEffect(() => {
    void (async () => {
      try {
        const [v, h, t] = await Promise.all([AsyncStorage.getItem(VIEW_KEY), AsyncStorage.getItem(HIDDEN_KEY), AsyncStorage.getItem(TODOS_KEY)]);
        if (v && VIEWS.some((item) => item.key === v)) setView(v as AgendaView);
        if (h) setHidden(JSON.parse(h));
        if (t != null) setShowTodos(t !== "0");
      } catch {
        /* bellek okunamadı — varsayılanlar */
      }
      setNotify(await readNotifyPref());
    })();
  }, []);
  const remember = (key: string, value: string) => void AsyncStorage.setItem(key, value).catch(() => undefined);

  const range = useMemo(() => rangeFor(view, view === "list" ? startOfDay(new Date()) : cursor), [view, cursor]);
  const eventsQuery = useQuery({
    queryKey: toolKeys.events(range.from.toISOString(), range.to.toISOString()),
    queryFn: () => listEvents(range.from, range.to),
    placeholderData: keepPreviousData,
  });
  const refresh = useRefresh(() => void eventsQuery.refetch(), { refreshing: eventsQuery.isRefetching });

  const data = eventsQuery.data;
  const items = useMemo(() => {
    const events = (data?.items ?? []).filter((item) => !hidden.includes(item.category));
    const all = showTodos ? [...events, ...(data?.todos ?? [])] : events;
    return all.sort((a, b) => a.occurrence_start.localeCompare(b.occurrence_start));
  }, [data, hidden, showTodos]);

  // Hatırlatmalar: yüklenen aralık cihaz bildirimleriyle eşitlenir.
  useEffect(() => {
    if (notify && data) void syncReminders(data.items, range.from, range.to);
  }, [notify, data, range]);

  const invalidate = [toolKeys.eventsAll(), toolKeys.overview()];
  const save = useAdminMutation(
    ({ payload, id }: { payload: EventInput; id?: number }) => (id ? updateEvent(id, payload) : createEvent(payload)),
    { success: (_r, v) => (v.id ? "Etkinlik güncellendi." : "Etkinlik eklendi."), invalidate }
  );
  const remove = useAdminMutation((id: number) => deleteEvent(id), { success: "Etkinlik silindi.", invalidate });

  const openCreate = useCallback((day: Date = selected, hour: number | null = null) => setEditor(blankForm(day, hour)), [selected]);
  const openItem = useCallback(
    (item: AgendaOccurrence) => {
      if (item.source === "todo") {
        router.push({ pathname: "/yonetim/gorev-panosu", params: { id: String(item.id) } });
        return;
      }
      setEditor(formFromEvent(item));
    },
    [router]
  );

  const changeView = (next: AgendaView) => {
    setView(next);
    remember(VIEW_KEY, next);
    if (next === "day" || next === "week") setCursor(selected);
  };
  const goToday = () => {
    const now = new Date();
    setCursor(now);
    setSelected(startOfDay(now));
  };
  const move = (step: number) => {
    const next = shiftCursor(view, cursor, step);
    setCursor(next);
    if (view === "day" || view === "week") setSelected(startOfDay(next));
    if (view === "month") setSelected(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  const askDelete = async (form: EventForm) => {
    const ok = await confirmAction({
      title: form.recurrence !== "none" ? "Tüm tekrarlar silinsin mi?" : "Etkinlik silinsin mi?",
      message: form.recurrence !== "none" ? "Tekrarlanan etkinliğin bütün tekrarları silinir." : undefined,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (!ok || !form.id) return;
    try {
      await remove.mutateAsync(form.id);
      setEditor(null);
    } catch {
      /* toast gösterildi */
    }
  };

  const exportEvent = async (payload: EventInput) => {
    try {
      const result = await exportToDeviceCalendar(payload);
      if (result === "ok") toast.show({ message: "Etkinlik telefon takvimine eklendi.", tone: "success" });
      else if (result === "denied") Alert.alert("Takvim izni gerekli", "Etkinliği eklemek için Ayarlar'dan takvim erişimine izin verin.");
      else toast.show({ message: "Yazılabilir bir takvim bulunamadı.", tone: "warn" });
    } catch {
      toast.show({ message: "Etkinlik telefon takvimine yazılamadı.", tone: "danger" });
    }
  };

  const toggleNotify = async (value: boolean) => {
    if (value) {
      const ok = await enableReminders();
      setNotify(ok);
      toast.show(ok ? { message: "Hatırlatmalar bu telefona bildirim olarak gelecek.", tone: "success" } : { message: "Bildirim izni verilmedi.", tone: "warn" });
    } else {
      await disableReminders();
      setNotify(false);
    }
  };

  const toggleCategory = (key: EventCategory) =>
    setHidden((current) => {
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      remember(HIDDEN_KEY, JSON.stringify(next));
      return next;
    });

  const today = new Date();
  const selectedItems = itemsOnDay(items, selected);
  const weekCount = items.filter((item) => {
    const at = new Date(item.occurrence_start);
    return at >= startOfDay(today) && at < addDays(startOfDay(today), 7);
  }).length;
  const filterCount = hidden.length + (showTodos ? 0 : 1);

  const navBar = (
    <View style={styles.nav}>
      <Touchable feedback="icon" onPress={() => move(-1)} hitSlop={touchSlop(28)} accessibilityLabel="Önceki">
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </Touchable>
      <Text style={styles.navTitle} numberOfLines={1} {...textScale.dense}>
        {titleFor(view, view === "list" ? today : cursor)}
      </Text>
      {eventsQuery.isFetching ? <ActivityIndicator size="small" color={colors.textTertiary} /> : null}
      <Touchable feedback="icon" onPress={() => move(1)} hitSlop={touchSlop(28)} accessibilityLabel="Sonraki">
        <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
      </Touchable>
    </View>
  );

  const refreshControl = <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />;

  let body: ReactNode;
  if (eventsQuery.error && !data) {
    body = <ErrorState error={eventsQuery.error} onRetry={eventsQuery.refetch} />;
  } else if (view === "month") {
    body = (
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
        <MonthView
          cursor={cursor}
          items={items}
          selected={selected}
          onSelect={setSelected}
          onCreate={(day) => {
            setSelected(day);
            openCreate(day);
          }}
        />
        <View style={styles.dayPanel}>
          <View style={styles.dayHead}>
            <View style={styles.flex}>
              <Text style={styles.dayTitle} {...textScale.dense}>
                {relativeDayLocal(selected)}
              </Text>
              <Text style={styles.daySub} {...textScale.dense}>
                {selected.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </Text>
            </View>
            <Touchable feedback="icon" onPress={() => openCreate(selected)} hitSlop={touchSlop(28)} accessibilityLabel="Seçili güne etkinlik ekle">
              <Ionicons name="add-circle-outline" size={28} color={colors.brandAccent} />
            </Touchable>
          </View>
          <DayList items={selectedItems} onOpen={openItem} emptyText="Bu gün için plan yok. Takvimde güne basılı tutarak da ekleyebilirsiniz." />
        </View>
        <Text style={styles.week} {...textScale.dense}>
          Önümüzdeki 7 günde {weekCount} kayıt
        </Text>
      </ScrollView>
    );
  } else if (view === "week" || view === "day") {
    body = (
      <View style={styles.timeWrap}>
        <TimeGrid days={view === "week" ? weekDays(cursor) : [startOfDay(cursor)]} items={items} onCreate={(day, hour) => openCreate(day, hour)} onOpen={openItem} />
      </View>
    );
  } else {
    const groups = groupByDay(items);
    body = (
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
        {groups.length ? (
          groups.map((group) => (
            <View key={group.key} style={styles.group}>
              <SectionHeader title={group.title} meta={group.hint} size="group" inset="flush" uppercase={false} />
              <DayList items={group.items} onOpen={openItem} />
            </View>
          ))
        ) : eventsQuery.isLoading ? null : (
          <EmptyState variant="inline" icon="calendar-clear-outline" title="Önünüzdeki 60 gün boş" body="Yeni bir etkinlik ekleyerek planlamaya başlayın." />
        )}
      </ScrollView>
    );
  }

  return (
    <AdminScreen
      title="Ajanda ve takvim"
      scroll={false}
      actions={[
        { icon: "today-outline", onPress: goToday, accessibilityLabel: "Bugüne git" },
        { icon: "funnel-outline", onPress: () => setFiltersOpen(true), accessibilityLabel: "Süzgeçler", badge: filterCount || undefined },
      ]}
      bottom={
        <View style={styles.segment}>
          <SegmentedControl items={VIEWS} value={view} onChange={changeView} />
        </View>
      }
      overlay={<FAB icon="add" label="Etkinlik" extended onPress={() => openCreate()} accessibilityLabel="Yeni etkinlik" />}
    >
      {navBar}
      {body}

      <EventSheet
        visible={editor != null}
        initial={editor}
        onClose={() => setEditor(null)}
        onSubmit={(payload, id) => save.mutateAsync({ payload, id })}
        onDelete={askDelete}
        onExport={exportEvent}
      />

      <BottomSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Süzgeçler" snap="content">
        <Text style={styles.filterHead} {...textScale.dense}>
          Türler
        </Text>
        {EVENT_CATEGORIES.map((key) => {
          const off = hidden.includes(key);
          return (
            <Touchable key={key} feedback="row" onPress={() => toggleCategory(key)} style={styles.filterRow} accessibilityRole="checkbox" accessibilityState={{ checked: !off }}>
              <View style={[styles.swatch, { backgroundColor: EVENT_CATEGORY_COLORS[key] }]} />
              <Text style={styles.filterLabel} {...textScale.dense}>
                {EVENT_CATEGORY_LABELS[key]}
              </Text>
              <Ionicons name={off ? "square-outline" : "checkbox"} size={22} color={off ? colors.textTertiary : colors.brandAccent} />
            </Touchable>
          );
        })}
        <Touchable
          feedback="row"
          onPress={() => {
            setShowTodos((v) => {
              remember(TODOS_KEY, v ? "0" : "1");
              return !v;
            });
          }}
          style={styles.filterRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: showTodos }}
        >
          <View style={[styles.swatch, styles.swatchTodo, { borderColor: AGENDA_TODO_COLOR }]} />
          <Text style={styles.filterLabel} {...textScale.dense}>
            Yapılacaklar (son tarih)
          </Text>
          <Ionicons name={showTodos ? "checkbox" : "square-outline"} size={22} color={showTodos ? colors.brandAccent : colors.textTertiary} />
        </Touchable>
        <View style={styles.filterDivider} />
        <ToggleField
          label="Hatırlatma bildirimleri"
          hint="Hatırlatmalı etkinlikler bu telefona, uygulama kapalıyken de bildirim olarak gelir."
          value={notify}
          onChange={(v) => void toggleNotify(v)}
        />
      </BottomSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  segment: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.sm,
  },
  navTitle: { flex: 1, ...type.h3, color: colors.textPrimary, textAlign: "center" },
  scroll: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant * 2, gap: space.md },
  timeWrap: { flex: 1, paddingHorizontal: space.sm, paddingBottom: space.sm },
  dayPanel: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  dayHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  dayTitle: { ...type.h2, color: colors.textPrimary },
  daySub: { ...type.caption, color: colors.textTertiary },
  week: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
  group: { gap: space.xs },
  filterHead: { ...type.label, color: colors.textSecondary, marginBottom: space.xs },
  filterRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  filterLabel: { flex: 1, ...type.body, color: colors.textPrimary },
  swatch: { width: 14, height: 14, borderRadius: radius.pill },
  swatchTodo: { backgroundColor: "transparent", borderWidth: 2, borderStyle: "dashed", borderRadius: 3 },
  filterDivider: { height: hairline, backgroundColor: colors.separator, marginVertical: space.md },
});
