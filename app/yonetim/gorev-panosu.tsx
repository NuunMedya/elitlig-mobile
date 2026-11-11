/**
 * YAPILACAKLAR PANOSU — web /yonetim/yapilacaklar sayfasının yerel karşılığı.
 *
 * LİSTELER (üstte kayan şerit): Bugün, Yaklaşan, Tüm işler · Bana atananlar,
 * Atadıklarım, Maç görevleri · Ekip takibi (todos.oversee) · her etiket ·
 * Tamamlanan. Listeler aynı verinin (GET /api/todos?view=board) farklı
 * açılarıdır; sayaçlar bitmemiş işleri sayar.
 *
 * GÖRÜNÜM: Liste (zaman / durum / gün / kişi gruplu, katlanır gruplar) ya da
 * Pano (Yapılacak · Sürüyor · Tamamlandı sütunları yatay kaydırılır). Web'deki
 * sürükle-bırak yerine kartın "Taşı" menüsü: önceki/sonraki sütun, sütunda
 * yukarı/aşağı, en üste (POST /api/todos/reorder). Seçimler cihazda hatırlanır.
 *
 * EYLEMLER: hızlı ekleme (listeye uygun gün ve etiketle), ayrıntılı ekleme
 * ve ekibe görev atama (todos.assign), kart ayrıntısı (durum, etiket, aşama,
 * cevap, maç masası), sabitleme, arşivleme, silme, tamamlananları arşivleme,
 * bitirmeyi geri alma. Maç personeli görevlendirme "Toplu personel atama"
 * ekranına gider (staff.assign).
 *
 * Bildirimden ya da ajandadan `?id=` ile gelinirse kart açık başlar.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { ActionSheet, AdminScreen, SegmentField, confirmAction, type SheetAction } from "@/components/admin";
import { ToolFab, ToolSummary, ToolTabs } from "@/components/admin/tools/ToolApp";
import { QuickAddBar } from "@/components/admin/tools/todo/QuickAddBar";
import { TeamOverview } from "@/components/admin/tools/todo/TeamOverview";
import { TodoComposerSheet, type ComposerState } from "@/components/admin/tools/todo/TodoComposerSheet";
import { BoardCard, PersonDot, ProgressBar, TodoRow } from "@/components/admin/tools/todo/TodoCards";
import { TodoDetailSheet } from "@/components/admin/tools/todo/TodoDetailSheet";
import {
  COLUMNS,
  FIXED_GROUPING,
  KIND_FILTERS,
  PERSONAL_VIEWS,
  STATUS_LABELS,
  TEAM_VIEWS,
  VIEWS,
  buildGroups,
  endOfDay,
  inView,
  isDelegated,
  isDueToday,
  isLate,
  labelView,
  matchesSearch,
  openCount,
  orderAfterDrop,
  sortColumn,
  viewLabel,
  type GroupBy,
  type RowGroup,
} from "@/components/admin/tools/todo/boardUtils";
import {
  BottomSheet,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  SkeletonListRow,
  Touchable,
  refreshControlProps,
  useRefresh,
  useToast,
} from "@/components/ui";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { errorText } from "@/lib/admin/errors";
import {
  archiveDoneTodos,
  createTodo,
  deleteTodo,
  getBoardTodos,
  getTodoCatalog,
  reorderTodos,
  todoKeys,
  updateTodo,
  type TodoCreateInput,
  type TodoPatch,
  type TodoStatus,
  type TodoTask,
} from "@/lib/api/todos";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";

const MODE_KEY = "todo:view";
const LIST_KEY = "todo:list";
const GROUP_KEY = "todo:groupBy";
const COLLAPSE_KEY = "todo:collapsed";

const EMPTY: Record<string, { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }> = {
  today: { icon: "sunny-outline", title: "Bugün için planlı iş yok", text: "Yukarıya yazdığın iş bugüne eklenir. İleriye dönük işler Yaklaşan listesinde." },
  upcoming: { icon: "calendar-outline", title: "Tarihli iş yok", text: "Bir işe gün verdiğinde burada gün gün sıralanır." },
  all: { icon: "clipboard-outline", title: "Listen boş", text: "İlk işini yukarıdaki kutuya yaz. Sana atanan görevler ve maç görevlerin de burada belirir." },
  assigned_to_me: { icon: "file-tray-outline", title: "Sana atanmış görev yok", text: "Ekipten biri sana görev verdiğinde burada belirir." },
  assigned_by_me: { icon: "paper-plane-outline", title: "Henüz kimseye görev vermedin", text: "Ekibe verdiğin görevleri burada kişi kişi, ne kadarının bittiğiyle izlersin." },
  system: { icon: "mic-outline", title: "Maç görevi yok", text: "Bir maça görevlendirildiğinde kartı kendiliğinden buraya düşer." },
  done: { icon: "checkmark-done-outline", title: "Henüz tamamlanan yok", text: "Bitirdiğin işler 30 gün burada durur." },
  label: { icon: "pricetag-outline", title: "Bu etiketle kart kalmadı", text: "Yukarıya yazdığın iş bu etiketle eklenir." },
};

type Row = { type: "group"; group: RowGroup; closed: boolean } | { type: "task"; task: TodoTask; hidePerson: boolean };

export default function TodoBoardScreen() {
  const router = useRouter();
  const toast = useToast();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string; list?: string; tab?: string }>();
  const appActive = useAppActive();
  // Eski "Görevlerim" bağlantıları (?tab=assigned|done) ilgili listeye açılır.
  const paramList = params.list || (params.tab === "assigned" ? "assigned_by_me" : params.tab === "done" ? "done" : "");

  const [mode, setMode] = useState<"list" | "board">("list");
  const [list, setList] = useState<string>(paramList || "all");
  const [groupBy, setGroupBy] = useState<"date" | "status">("date");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(params.id ? Number(params.id) : null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [moving, setMoving] = useState<TodoTask | null>(null);
  const [menu, setMenu] = useState<TodoTask | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [m, l, g, c] = await Promise.all([
          AsyncStorage.getItem(MODE_KEY),
          AsyncStorage.getItem(LIST_KEY),
          AsyncStorage.getItem(GROUP_KEY),
          AsyncStorage.getItem(COLLAPSE_KEY),
        ]);
        if (m === "board" || m === "list") setMode(m);
        if (l && !paramList) setList(JSON.parse(l));
        if (g === "status" || g === "date") setGroupBy(g);
        if (c) setCollapsed(JSON.parse(c));
      } catch {
        /* varsayılanlar */
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (params.id) setOpenId(Number(params.id));
  }, [params.id]);

  const remember = (key: string, value: string) => void AsyncStorage.setItem(key, value).catch(() => undefined);

  const boardKey = todoKeys.board();
  const boardQuery = useQuery({ queryKey: boardKey, queryFn: getBoardTodos, staleTime: 15_000, refetchInterval: appActive ? 60_000 : false });
  const catalogQuery = useQuery({ queryKey: todoKeys.catalog(), queryFn: getTodoCatalog, staleTime: 5 * 60_000 });
  const catalog = catalogQuery.data;
  const canAssign = Boolean(catalog?.canAssign);
  const canOversee = Boolean(catalog?.canOversee);
  const canAssignCrew = Boolean(catalog?.canAssignCrew);
  const items = useMemo(() => boardQuery.data ?? [], [boardQuery.data]);

  const refresh = useRefresh(
    () => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all });
    },
    { refreshing: boardQuery.isRefetching }
  );

  /** Önbelleği gelen kartlarla günceller (arşivlenenler düşer). */
  const upsert = useCallback(
    (incoming: TodoTask | TodoTask[]) => {
      const listIn = (Array.isArray(incoming) ? incoming : [incoming]).filter(Boolean);
      if (!listIn.length) return;
      queryClient.setQueryData<TodoTask[]>(boardKey, (prev = []) => {
        const map = new Map(prev.map((row) => [row.id, row] as const));
        listIn.forEach((item) => {
          if (item.archived) map.delete(item.id);
          else map.set(item.id, item);
        });
        return [...map.values()];
      });
      // Diğer görev ekranları (Görevlerim, özetler) tazelensin.
      void queryClient.invalidateQueries({ queryKey: todoKeys.summary() });
      void queryClient.invalidateQueries({ queryKey: ["admin", "todos", "list"] });
    },
    [queryClient, boardKey]
  );
  const setLocal = (fn: (prev: TodoTask[]) => TodoTask[]) => queryClient.setQueryData<TodoTask[]>(boardKey, (prev = []) => fn(prev));

  const fail = (error: unknown, fallback: string) => toast.show({ message: errorText(error, fallback), tone: "danger" });

  /** Durum değişimi: önce ekranda, sonra sunucuda; hata olursa geri al. */
  const handleStatus = useCallback(
    async (task: TodoTask, status: TodoStatus) => {
      setLocal((prev) =>
        prev.map((row) =>
          row.id === task.id ? { ...row, status, statusLabel: STATUS_LABELS[status], completedAt: status === "done" ? new Date().toISOString() : null } : row
        )
      );
      try {
        const saved = await updateTodo(task.id, { status });
        upsert(saved);
        if (status === "done") {
          toast.show({ message: `“${task.title}” tamamlandı.`, tone: "success", action: { label: "Geri al", onPress: () => void handleStatus(saved, task.status) } });
        }
      } catch (error) {
        upsert(task);
        fail(error, "Durum değiştirilemedi.");
      }
    },
    [upsert] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Pano taşıma: sütun ve sıra. */
  const handleMove = async (task: TodoTask, status: TodoStatus, orderedIds: number[]) => {
    const positions = new Map(orderedIds.map((id, index) => [id, index] as const));
    setLocal((prev) =>
      prev.map((row) => {
        if (row.id === task.id) {
          return { ...row, status, statusLabel: STATUS_LABELS[status], position: positions.get(task.id), completedAt: status === "done" ? row.completedAt || new Date().toISOString() : null };
        }
        return positions.has(row.id) && row.permissions?.canChangeStatus ? { ...row, position: positions.get(row.id) } : row;
      })
    );
    try {
      upsert(await reorderTodos({ status, ids: orderedIds, moved_id: task.id }));
    } catch (error) {
      void boardQuery.refetch();
      fail(error, "Kart taşınamadı.");
    }
  };

  const patchTask = useCallback(
    async (task: TodoTask, payload: TodoPatch) => {
      const saved = await updateTodo(task.id, payload);
      upsert(saved);
      if (payload.archived) toast.show({ message: "Kart arşivlendi.", tone: "success" });
      return saved;
    },
    [upsert, toast]
  );

  const knownLabels = useMemo(() => {
    const map = new Map<string, { text: string; color: string; count: number }>();
    items.forEach((item) =>
      (item.labels || []).forEach((entry) => {
        const key = entry.text.toLocaleLowerCase("tr-TR");
        if (!map.has(key)) map.set(key, { ...entry, count: 0 });
        if (item.status !== "done") map.get(key)!.count += 1;
      })
    );
    return [...map.values()].sort((a, b) => a.text.localeCompare(b.text, "tr"));
  }, [items]);

  // Kayıtlı liste artık yoksa (etiket silindi, yetki yok) "Tüm işler"e düş.
  const current = useMemo(() => {
    const label = viewLabel(list);
    if (label) return knownLabels.some((e) => e.text === label) || boardQuery.isLoading ? list : "all";
    if (list === "team") return canOversee ? "team" : "all";
    return VIEWS[list] ? list : "all";
  }, [list, knownLabels, boardQuery.isLoading, canOversee]);
  const currentLabel = viewLabel(current);
  const currentLabelEntry = currentLabel ? knownLabels.find((e) => e.text === currentLabel) : null;

  const chooseList = (next: string) => {
    setList(next);
    remember(LIST_KEY, JSON.stringify(next));
  };

  const counts = useMemo(() => {
    const result: Record<string, number> = { open: 0, overdue: 0, dueToday: 0 };
    [...PERSONAL_VIEWS, ...TEAM_VIEWS, "done"].forEach((key) => {
      result[key] = openCount(items, key);
    });
    items.forEach((item) => {
      if (item.status === "done" || isDelegated(item)) return;
      result.open += 1;
      if (isLate(item)) result.overdue += 1;
      else if (isDueToday(item)) result.dueToday += 1;
    });
    return result;
  }, [items]);

  const inList = useMemo(() => items.filter((item) => inView(item, current)), [items, current]);
  const visible = useMemo(() => inList.filter((item) => (!kind || item.kind === kind) && matchesSearch(item, search)), [inList, kind, search]);
  const filtered = Boolean(search || kind);

  const fixedGrouping = FIXED_GROUPING[current];
  const rowsGroupBy: GroupBy = fixedGrouping || groupBy;
  const boardAllowed = current !== "done" && current !== "team";
  const shownMode = boardAllowed ? mode : "list";
  const showSystem = counts.system > 0 || canAssignCrew;
  const progress = { done: inList.filter((i) => i.status === "done").length, total: inList.length };
  const showRing = !["all", "upcoming", "done", "team"].includes(current) && progress.total > 0;

  const headline =
    boardQuery.isLoading && !items.length
      ? "Yükleniyor…"
      : counts.open === 0
        ? "Bekleyen işin yok"
        : [counts.dueToday ? `bugün ${counts.dueToday} iş` : null, counts.overdue ? `${counts.overdue} geciken` : null, `toplam ${counts.open} açık iş`].filter(Boolean).join(" · ");

  /* ───────────── ekleme ───────────── */

  const create = async (payload: TodoCreateInput) => {
    const created = await createTodo({ ...payload, kind: payload.kind ?? "task" });
    upsert(created);
    return created;
  };

  const handleQuickAdd = async (payload: { title: string; due_at: string | null; priority: "low" | "normal" | "high" }) => {
    const extra = currentLabelEntry ? { labels: [{ text: currentLabelEntry.text, color: currentLabelEntry.color }] } : {};
    try {
      const created = await create({ kind: "task", ...payload, ...extra });
      const hidden = created.some((item) => !inView(item, current)) || (kind && created.some((item) => item.kind !== kind)) || search;
      toast.show({ message: hidden ? "Eklendi; şu anki liste ya da süzgeç yüzünden burada görünmüyor olabilir." : "Listene eklendi.", tone: "success" });
      return true;
    } catch (error) {
      fail(error, "Kart eklenemedi.");
      return false;
    }
  };

  const handleColumnAdd = async (status: TodoStatus, title: string) => {
    try {
      await create({ kind: "task", title, status });
      return true;
    } catch (error) {
      fail(error, "Kart eklenemedi.");
      return false;
    }
  };

  const handleArchiveDone = async () => {
    const ok = await confirmAction({
      title: "Tamamlananlar kaldırılsın mı?",
      message: "Tamamladığın kartlar listeden kaldırılır. Başkasına atadığın kartlar kalır.",
      confirmLabel: "Arşivle",
    });
    if (!ok) return;
    try {
      const result = await archiveDoneTodos();
      setLocal((prev) => prev.filter((row) => !(row.status === "done" && row.permissions?.isOwner)));
      toast.show({ message: result?.message || "Tamamlananlar arşivlendi.", tone: "success" });
    } catch (error) {
      fail(error, "Arşivlenemedi.");
    }
  };

  const handleRemove = async (task: TodoTask) => {
    const ok = await confirmAction({ title: "Kart silinsin mi?", message: `“${task.title}” kalıcı olarak silinir.`, confirmLabel: "Sil", destructive: true });
    if (!ok) return;
    try {
      await deleteTodo(task.id);
      setLocal((prev) => prev.filter((row) => row.id !== task.id));
      setOpenId(null);
      toast.show({ message: "Kart silindi.", tone: "success" });
      void queryClient.invalidateQueries({ queryKey: todoKeys.summary() });
    } catch (error) {
      fail(error, "Kart silinemedi.");
    }
  };

  const openComposer = (extra: ComposerState = {}) => {
    setOpenId(null);
    setComposer(extra);
  };

  /* ───────────── taşıma menüsü ───────────── */

  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, cards: sortColumn(visible.filter((item) => item.status === column.key), column.key) })),
    [visible]
  );

  const moveActions: SheetAction[] = (() => {
    if (!moving) return [];
    const colIndex = COLUMNS.findIndex((c) => c.key === moving.status);
    const column = columns[colIndex];
    const index = column ? column.cards.findIndex((c) => c.id === moving.id) : -1;
    const prev = COLUMNS[colIndex - 1];
    const next = COLUMNS[colIndex + 1];
    const toColumn = (key: TodoStatus) => {
      const target = columns.find((c) => c.key === key);
      void handleMove(moving, key, orderAfterDrop(target?.cards ?? [], moving.id, 0));
    };
    return [
      { label: `${prev?.title ?? ""} sütununa taşı`, icon: "arrow-back", hidden: !prev, onPress: () => prev && toColumn(prev.key) },
      { label: `${next?.title ?? ""} sütununa taşı`, icon: "arrow-forward", hidden: !next, onPress: () => next && toColumn(next.key) },
      {
        label: "En üste al",
        icon: "arrow-up-circle-outline",
        hidden: index <= 0,
        onPress: () => column && void handleMove(moving, moving.status, orderAfterDrop(column.cards, moving.id, 0)),
      },
      {
        label: "Bir yukarı",
        icon: "chevron-up",
        hidden: index <= 0,
        onPress: () => column && void handleMove(moving, moving.status, orderAfterDrop(column.cards, moving.id, index - 1)),
      },
      {
        label: "Bir aşağı",
        icon: "chevron-down",
        hidden: !column || index < 0 || index >= column.cards.length - 1,
        onPress: () => column && void handleMove(moving, moving.status, orderAfterDrop(column.cards, moving.id, index + 1)),
      },
      { label: "Kartı aç", icon: "open-outline", onPress: () => setOpenId(moving.id) },
    ];
  })();

  /* ───────────── basılı tut: hızlı eylemler ───────────── */

  const quickPatch = (task: TodoTask, payload: TodoPatch, message: string) =>
    void patchTask(task, payload)
      .then(() => {
        if (!payload.archived) toast.show({ message, tone: "success" });
      })
      .catch((error) => fail(error, "Kart güncellenemedi."));

  const menuActions: SheetAction[] = (() => {
    if (!menu) return [];
    const task = menu;
    const canStatus = Boolean(task.permissions?.canChangeStatus);
    const canEdit = Boolean(task.permissions?.canEdit);
    const done = task.status === "done";
    return [
      { label: "Tamamla", icon: "checkmark-circle-outline", hidden: !canStatus || done, onPress: () => void handleStatus(task, "done") },
      { label: "Başladım (sürüyor)", icon: "play-outline", hidden: !canStatus || task.status !== "open", onPress: () => void handleStatus(task, "in_progress") },
      { label: "Yeniden aç", icon: "refresh-outline", hidden: !canStatus || !done, onPress: () => void handleStatus(task, "open") },
      { label: "Bugüne al", icon: "sunny-outline", hidden: !canEdit || done, onPress: () => quickPatch(task, { due_at: endOfDay(0).toISOString() }, "Bugüne alındı.") },
      { label: "Yarına ertele", icon: "arrow-redo-outline", hidden: !canEdit || done, onPress: () => quickPatch(task, { due_at: endOfDay(1).toISOString() }, "Yarına ertelendi.") },
      { label: "Haftaya ertele", icon: "calendar-outline", hidden: !canEdit || done, onPress: () => quickPatch(task, { due_at: endOfDay(7).toISOString() }, "Bir hafta ertelendi.") },
      {
        label: task.priority === "high" ? "Önceliği normale çek" : "Önemli olarak işaretle",
        icon: "flag-outline",
        hidden: !canEdit || done,
        onPress: () => quickPatch(task, { priority: task.priority === "high" ? "normal" : "high" }, task.priority === "high" ? "Öncelik normale çekildi." : "Önemli olarak işaretlendi."),
      },
      {
        label: task.pinned ? "Sabitlemeyi kaldır" : "Üste sabitle",
        icon: "pin-outline",
        hidden: !task.permissions?.isOwner,
        onPress: () => quickPatch(task, { pinned: !task.pinned }, task.pinned ? "Sabitleme kaldırıldı." : "Üste sabitlendi."),
      },
      { label: "Düzenle", icon: "create-outline", hidden: !canEdit, onPress: () => openComposer({ task }) },
      { label: "Sil", icon: "trash-outline", danger: true, hidden: !task.permissions?.canDelete, onPress: () => void handleRemove(task) },
    ];
  })();

  /* ───────────── liste satırları ───────────── */

  const rows = useMemo<Row[]>(() => {
    const groups = buildGroups(visible, rowsGroupBy);
    const out: Row[] = [];
    for (const group of groups) {
      const closed = collapsed[group.key] ?? Boolean(group.collapsed);
      out.push({ type: "group", group, closed });
      if (!closed) group.cards.forEach((task) => out.push({ type: "task", task, hidePerson: Boolean(group.person) }));
    }
    return out;
  }, [visible, rowsGroupBy, collapsed]);

  const toggleGroup = (group: RowGroup) =>
    setCollapsed((prev) => {
      const next = { ...prev, [group.key]: !(prev[group.key] ?? Boolean(group.collapsed)) };
      remember(COLLAPSE_KEY, JSON.stringify(next));
      return next;
    });

  const quickAdd =
    current === "assigned_to_me" || current === "system" || current === "done" || current === "team"
      ? null
      : current === "assigned_by_me"
        ? "assign"
        : {
            defaultWhen: (current === "today" ? "today" : current === "upcoming" ? "tomorrow" : "") as "" | "today" | "tomorrow",
            placeholder: current === "today" ? "Bugün ne yapacaksın? Örn. 14:00 sahayı ara !" : undefined,
            hint: currentLabelEntry ? `“${currentLabelEntry.text}” etiketiyle eklenir` : undefined,
          };

  const empty = EMPTY[currentLabel ? "label" : current] ?? EMPTY.all;
  const meta = currentLabel ? { title: currentLabel, icon: "pricetag-outline" as const, hint: "Bu etiketi taşıyan kartlar" } : VIEWS[current];
  const openCard = openId ? items.find((item) => item.id === openId) ?? null : null;

  const listHeader = (
    <View style={styles.header}>
      {items.length ? (
        <ToolSummary
          app="gorevler"
          stats={[
            { label: "AÇIK", value: counts.open, tone: "accent", onPress: () => chooseList("all") },
            { label: "GECİKMİŞ", value: counts.overdue, tone: counts.overdue ? "danger" : undefined, onPress: () => chooseList("today") },
            { label: "BUGÜN", value: counts.dueToday, onPress: () => chooseList("today") },
            { label: "BANA ATANAN", value: counts.assigned_to_me ?? 0, onPress: () => chooseList("assigned_to_me") },
          ]}
        />
      ) : null}
      <View style={styles.titleRow}>
        <Ionicons name={meta.icon} size={22} color={colors.brandAccent} />
        <View style={styles.flex}>
          <Text style={styles.listTitle} {...textScale.dense}>
            {meta.title}
          </Text>
          <Text style={styles.muted} {...textScale.dense}>
            {meta.hint}
          </Text>
        </View>
        {showRing ? (
          <View style={styles.ring}>
            <ProgressBar done={progress.done} total={progress.total} />
          </View>
        ) : null}
      </View>
      <Input variant="search" value={search} onChangeText={setSearch} placeholder="Ara: başlık, oyuncu, takım, kişi…" leadingIcon="search" size="sm" />
      {filtered ? (
        <View style={styles.activeRow}>
          <Text style={[styles.muted, styles.flex]} {...textScale.dense}>
            {visible.length} / {inList.length} kart gösteriliyor
          </Text>
          {kind ? <Chip label={KIND_FILTERS.find((k) => k.key === kind)?.label ?? kind} size="sm" selected onDismiss={() => setKind("")} /> : null}
          <Touchable feedback="none" onPress={() => { setSearch(""); setKind(""); }} accessibilityRole="button">
            <Text style={styles.link} {...textScale.dense}>
              Temizle
            </Text>
          </Touchable>
        </View>
      ) : null}
      {quickAdd === "assign" ? (
        canAssign ? (
          <Touchable feedback="card" onPress={() => openComposer({ audience: "team" })} style={styles.assignCta} accessibilityRole="button">
            <Ionicons name="paper-plane-outline" size={22} color={colors.brandAccent} />
            <View style={styles.flex}>
              <Text style={styles.h4} {...textScale.dense}>
                Ekibe yeni görev ver
              </Text>
              <Text style={styles.muted} {...textScale.dense}>
                Bir ya da birden fazla kişiye aynı anda atayabilirsin
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Touchable>
        ) : null
      ) : quickAdd ? (
        <QuickAddBar
          onAdd={handleQuickAdd}
          onDetailed={(title) => openComposer({ title })}
          detailedLabel={canAssign ? "Ayrıntılı / ata" : "Ayrıntılı"}
          defaultWhen={quickAdd.defaultWhen}
          placeholder={quickAdd.placeholder}
          hint={quickAdd.hint}
        />
      ) : null}
    </View>
  );

  const emptyNode = boardQuery.isLoading ? (
    <SkeletonListRow count={6} avatar={false} />
  ) : boardQuery.error ? (
    <ErrorState error={boardQuery.error} onRetry={boardQuery.refetch} />
  ) : filtered && !visible.length ? (
    <EmptyState variant="inline" icon="search-outline" title="Süzgece uyan kart yok" action={{ label: "Süzgeçleri temizle", onPress: () => { setSearch(""); setKind(""); } }} />
  ) : (
    <EmptyState
      variant="inline"
      icon={empty.icon}
      title={empty.title}
      body={empty.text}
      action={current === "today" && counts.upcoming > 0 ? { label: `Yaklaşan ${counts.upcoming} işe bak`, onPress: () => chooseList("upcoming") } : undefined}
    />
  );

  const refreshControl = <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />;

  let body: ReactNode;
  if (current === "team") {
    body = (
      <ScrollView contentContainerStyle={[styles.list, styles.gapMd]} refreshControl={refreshControl}>
        <View style={styles.titleRow}>
          <Ionicons name="people-outline" size={22} color={colors.brandAccent} />
          <View style={styles.flex}>
            <Text style={styles.listTitle} {...textScale.dense}>
              Ekip takibi
            </Text>
            <Text style={styles.muted} {...textScale.dense}>
              Kim neyi yaptı, ne kaldı
            </Text>
          </View>
        </View>
        <TeamOverview />
      </ScrollView>
    );
  } else if (shownMode === "board") {
    const colWidth = Math.min(width - layout.screenPadding * 2, 360);
    body = (
      <ScrollView contentContainerStyle={styles.boardWrap} refreshControl={refreshControl} keyboardShouldPersistTaps="handled">
        <View style={styles.boardHead}>{listHeader}</View>
        {visible.length ? (
          <ScrollView
            horizontal
            snapToInterval={colWidth + space.md}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.columns}
          >
            {columns.map((column) => {
              const late = column.cards.filter((c) => c.overdue && c.status !== "done").length;
              return (
                <View key={column.key} style={[styles.column, { width: colWidth }]}>
                  <View style={styles.colHead}>
                    <Text style={styles.colTitle} {...textScale.dense}>
                      {column.title}
                    </Text>
                    <Text style={styles.colCount} {...textScale.badge}>
                      {column.cards.length}
                    </Text>
                    {late ? (
                      <Text style={styles.late} {...textScale.badge}>
                        {late} geciken
                      </Text>
                    ) : null}
                    <View style={styles.flex} />
                    {column.key === "done" && column.cards.length ? (
                      <Touchable feedback="none" onPress={handleArchiveDone} accessibilityRole="button" accessibilityLabel="Tamamlananları arşivle">
                        <Text style={styles.link} {...textScale.dense}>
                          Arşivle
                        </Text>
                      </Touchable>
                    ) : null}
                  </View>
                  <Text style={styles.muted} {...textScale.dense}>
                    {column.hint}
                  </Text>
                  {column.cards.map((task) => (
                    <BoardCard key={task.id} task={task} onOpen={(t) => setOpenId(t.id)} onMove={setMoving} />
                  ))}
                  {!column.cards.length ? (
                    <Text style={styles.colEmpty} {...textScale.long}>
                      {column.key === "done" ? "Bitirdiğin kartlar burada toplanır." : "Kart yok. Buraya taşıyabilir ya da ekleyebilirsin."}
                    </Text>
                  ) : null}
                  {quickAdd && quickAdd !== "assign" ? <ColumnAdd onAdd={(title) => handleColumnAdd(column.key, title)} /> : null}
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.boardHead}>{emptyNode}</View>
        )}
      </ScrollView>
    );
  } else {
    body = (
      <FlatList
        data={visible.length ? rows : []}
        keyExtractor={(row) => (row.type === "group" ? `g-${row.group.key}` : `t-${row.task.id}`)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyNode}
        renderItem={({ item }) =>
          item.type === "group" ? (
            <GroupHeader group={item.group} closed={item.closed} onToggle={() => toggleGroup(item.group)} onArchive={item.group.archive ? handleArchiveDone : undefined} />
          ) : (
            <TodoRow task={item.task} hidePerson={item.hidePerson} onOpen={(t) => setOpenId(t.id)} onStatus={handleStatus} onMenu={setMenu} />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    );
  }

  const listChips = [
    ...PERSONAL_VIEWS.map((key) => ({ key: key as string, label: VIEWS[key].title, icon: VIEWS[key].icon, count: counts[key], alert: key === "today" && counts.overdue > 0 })),
    ...TEAM_VIEWS.filter((key) => key !== "system" || showSystem).map((key) => ({ key: key as string, label: VIEWS[key].title, icon: VIEWS[key].icon, count: counts[key], alert: false })),
    ...(canOversee ? [{ key: "team", label: VIEWS.team.title, icon: VIEWS.team.icon, count: 0, alert: false }] : []),
    ...knownLabels.map((label) => ({ key: labelView(label.text) as string, label: label.text, icon: "pricetag" as const, count: label.count, alert: false })),
    { key: "done", label: VIEWS.done.title, icon: VIEWS.done.icon, count: counts.done, alert: false },
  ];

  return (
    <AdminScreen
      app="gorevler"
      title="Yapılacaklar"
      subtitle={headline}
      scroll={false}
      actions={[
        ...(boardAllowed
          ? [
              {
                icon: (mode === "board" ? "list-outline" : "albums-outline") as keyof typeof Ionicons.glyphMap,
                onPress: () => {
                  const next = mode === "board" ? "list" : "board";
                  setMode(next);
                  remember(MODE_KEY, next);
                },
                accessibilityLabel: mode === "board" ? "Liste görünümü" : "Pano görünümü",
              },
            ]
          : []),
        { icon: "options-outline", onPress: () => setFiltersOpen(true), accessibilityLabel: "Süzgeç ve gruplama", badge: kind ? ("dot" as const) : undefined },
      ]}
      appTabs={
        <ToolTabs
          app="gorevler"
          items={listChips.map((chip) => ({ key: chip.key, label: chip.label, icon: chip.icon, count: chip.count || undefined, alert: chip.alert }))}
          value={current}
          onChange={chooseList}
        />
      }
      overlay={
        current === "team" ? null : (
          <ToolFab
            app="gorevler"
            label={current === "assigned_by_me" && canAssign ? "Görev ata" : "Yeni iş"}
            onPress={() => openComposer({ audience: current === "assigned_by_me" ? "team" : "me" })}
            accessibilityLabel={current === "assigned_by_me" && canAssign ? "Ekibe görev ata" : "Yeni iş ekle"}
          />
        )
      }
    >
      {body}

      <TodoDetailSheet
        task={openCard}
        catalog={catalog}
        knownLabels={knownLabels}
        onClose={() => setOpenId(null)}
        onPatch={patchTask}
        onChange={upsert}
        onEdit={(task) => openComposer({ task })}
        onRemove={handleRemove}
      />

      <TodoComposerSheet
        state={composer}
        canAssign={canAssign}
        onClose={() => setComposer(null)}
        onCreate={async (input) => {
          const created = await create(input);
          const others = created.filter((item) => item.owner?.id !== auth.user?.id);
          toast.show({
            message: others.length ? `${others.length} kişiye görev atandı; “Atadıklarım” listesinden izleyebilirsin.` : "Listene eklendi.",
            tone: "success",
          });
        }}
        onUpdate={async (task, payload) => {
          await patchTask(task, payload);
          toast.show({ message: "Kart güncellendi.", tone: "success" });
        }}
      />

      <ActionSheet visible={menu != null} onClose={() => setMenu(null)} title={menu?.title} actions={menuActions} />

      <ActionSheet visible={moving != null} onClose={() => setMoving(null)} title={moving ? `Taşı: ${moving.title}` : "Taşı"} actions={moveActions} />

      <BottomSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Süzgeç ve gruplama" snap="content">
        <View style={styles.filterBody}>
          <Text style={styles.label} {...textScale.dense}>
            Kart türü
          </Text>
          <View style={styles.wrapChips}>
            {KIND_FILTERS.map((k) => (
              <Chip key={k.key || "all"} label={k.label} size="sm" selected={kind === k.key} onPress={() => setKind(k.key)} />
            ))}
          </View>
          {shownMode === "list" && !fixedGrouping ? (
            <SegmentField
              label="Gruplama"
              value={groupBy}
              onChange={(v) => {
                setGroupBy(v);
                remember(GROUP_KEY, v);
              }}
              options={[
                { key: "date", label: "Tarihe göre" },
                { key: "status", label: "Duruma göre" },
              ]}
            />
          ) : null}
          {canAssignCrew ? (
            <Touchable feedback="row" onPress={() => { setFiltersOpen(false); router.push("/yonetim/toplu-atama" as never); }} style={styles.crewRow} accessibilityRole="button">
              <Ionicons name="mic-outline" size={20} color={colors.brandAccent} />
              <Text style={[styles.h4, styles.flex]} {...textScale.dense}>
                Maç görevlendir (personel atama)
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Touchable>
          ) : null}
          {canAssign ? (
            <Touchable feedback="row" onPress={() => { setFiltersOpen(false); openComposer({ audience: "team" }); }} style={styles.crewRow} accessibilityRole="button">
              <Ionicons name="paper-plane-outline" size={20} color={colors.brandAccent} />
              <Text style={[styles.h4, styles.flex]} {...textScale.dense}>
                Ekibe görev ata
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Touchable>
          ) : null}
        </View>
      </BottomSheet>
    </AdminScreen>
  );
}

/* ═══════════════════════════ PARÇALAR ═══════════════════════════ */

function GroupHeader({ group, closed, onToggle, onArchive }: { group: RowGroup; closed: boolean; onToggle: () => void; onArchive?: () => void }) {
  const share = group.person && group.cards.length ? (group.done ?? 0) / group.cards.length : null;
  return (
    <View style={styles.group}>
      <Touchable feedback="row" onPress={onToggle} style={styles.groupMain} accessibilityRole="button" accessibilityState={{ expanded: !closed }}>
        <Ionicons name={closed ? "chevron-forward" : "chevron-down"} size={16} color={colors.textTertiary} />
        {group.person ? <PersonDot person={group.person} size={22} /> : null}
        <Text style={[styles.groupTitle, group.tone === "danger" ? styles.dangerText : group.tone === "accent" ? styles.accentText : null]} numberOfLines={1} {...textScale.dense}>
          {group.title}
        </Text>
        <Text style={styles.colCount} {...textScale.badge}>
          {group.cards.length}
        </Text>
        {group.hint ? (
          <Text style={[styles.muted, styles.flex]} numberOfLines={1} {...textScale.dense}>
            {group.hint}
          </Text>
        ) : (
          <View style={styles.flex} />
        )}
      </Touchable>
      {onArchive && !closed ? (
        <Touchable feedback="none" onPress={onArchive} accessibilityRole="button" accessibilityLabel="Tamamlananları arşivle">
          <Text style={styles.link} {...textScale.dense}>
            Arşivle
          </Text>
        </Touchable>
      ) : null}
      {share != null ? (
        <View style={styles.groupBar}>
          <View style={[styles.groupBarFill, { width: `${share * 100}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

function ColumnAdd({ onAdd }: { onAdd: (title: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Touchable feedback="row" onPress={() => setOpen(true)} style={styles.colAdd} accessibilityRole="button">
        <Ionicons name="add" size={18} color={colors.textSecondary} />
        <Text style={styles.muted} {...textScale.dense}>
          Kart ekle
        </Text>
      </Touchable>
    );
  }
  const submit = async () => {
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    const ok = await onAdd(value);
    setBusy(false);
    if (ok) setTitle("");
  };
  return (
    <View style={styles.colAddBox}>
      <Input value={title} onChangeText={setTitle} placeholder="Kart başlığı" autoFocus maxLength={200} onSubmitEditing={submit} returnKeyType="done" size="sm" />
      <View style={styles.activeRow}>
        <Touchable feedback="none" onPress={() => { setOpen(false); setTitle(""); }} accessibilityRole="button">
          <Text style={styles.muted} {...textScale.dense}>
            Vazgeç
          </Text>
        </Touchable>
        <View style={styles.flex} />
        <Touchable feedback="none" onPress={submit} disabled={busy || !title.trim()} accessibilityRole="button">
          <Text style={styles.link} {...textScale.dense}>
            Ekle
          </Text>
        </Touchable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant * 2, flexGrow: 1 },
  gapMd: { gap: space.md },
  sep: { height: space.sm },
  header: { gap: space.md, marginBottom: space.md },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  listTitle: { ...type.h2, color: colors.textPrimary },
  ring: { width: 96 },
  muted: { ...type.caption, color: colors.textTertiary },
  h4: { ...type.h4, color: colors.textPrimary },
  label: { ...type.label, color: colors.textSecondary },
  link: { ...type.labelSm, color: colors.brandAccent },
  activeRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  assignCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    backgroundColor: colors.brandDim,
  },
  group: { gap: space.xs, paddingTop: space.sm },
  groupMain: { flexDirection: "row", alignItems: "center", gap: space.sm },
  groupTitle: { ...type.h4, color: colors.textPrimary, maxWidth: "55%" },
  dangerText: { color: colors.danger },
  accentText: { color: colors.brandAccent },
  groupBar: { height: 3, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  groupBarFill: { height: 3, backgroundColor: colors.win },
  colCount: { ...type.numSmStrong, color: colors.textTertiary },
  boardWrap: { paddingTop: space.md, paddingBottom: space.giant * 2 },
  boardHead: { paddingHorizontal: layout.screenPadding },
  columns: { paddingHorizontal: layout.screenPadding, gap: space.md },
  column: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface2,
    alignSelf: "flex-start",
  },
  colHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  colTitle: { ...type.h3, color: colors.textPrimary },
  late: { ...type.micro, color: colors.danger },
  colEmpty: { ...type.bodySm, color: colors.textTertiary, paddingVertical: space.md },
  colAdd: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.sm },
  colAddBox: { gap: space.sm },
  filterBody: { gap: space.md },
  wrapChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  crewRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, borderTopWidth: hairline, borderTopColor: colors.separator },
});
