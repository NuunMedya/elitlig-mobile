/**
 * YAPILACAKLAR PANOSU YARDIMCILARI — liste görünümleri (akıllı listeler),
 * gruplama, sıralama ve pano sütunları. Web elitlig-client
 * management/todos/boardUtils.js'in TS karşılığı (aynı kurallar).
 */

import type Ionicons from "@expo/vector-icons/Ionicons";

import type { Tone } from "@/components/ui";
import type { TodoKind, TodoStatus, TodoTask } from "@/lib/api/todos";

export const COLUMNS: { key: TodoStatus; title: string; hint: string }[] = [
  { key: "open", title: "Yapılacak", hint: "Sırası gelen işler" },
  { key: "in_progress", title: "Sürüyor", hint: "Üzerinde çalışılanlar" },
  { key: "done", title: "Tamamlandı", hint: "Son 30 gün" },
];

export const STATUS_LABELS: Record<TodoStatus, string> = { open: "Yapılacak", in_progress: "Sürüyor", done: "Tamamlandı" };

export const SOURCES: Record<string, { label: string; short: string; tone: Tone }> = {
  own: { label: "Kendi kartım", short: "Kendi", tone: "neutral" },
  assigned_to_me: { label: "Bana atandı", short: "Bana atandı", tone: "info" },
  assigned_by_me: { label: "Atadığım", short: "Atadığım", tone: "warn" },
  system: { label: "Sistem kartı", short: "Sistem", tone: "brand" },
};

export const KIND_ICONS: Record<TodoKind, keyof typeof Ionicons.glyphMap> = {
  note: "document-text-outline",
  reminder: "notifications-outline",
  task: "checkmark-circle-outline",
  award_nomination: "star-outline",
  award_coordination: "trophy-outline",
  match_duty: "mic-outline",
  match_moment: "flash-outline",
  sheet_share: "grid-outline",
};

export const KIND_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Tüm türler" },
  { key: "task", label: "Görevler" },
  { key: "reminder", label: "Hatırlatmalar" },
  { key: "note", label: "Notlar" },
  { key: "match_duty", label: "Maç görevleri" },
  { key: "match_moment", label: "Maç anları" },
  { key: "award_nomination", label: "Aday önerileri" },
  { key: "award_coordination", label: "Haftanın enleri" },
  { key: "sheet_share", label: "Paylaşılan tablolar" },
];

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Bugünden `offset` gün sonranın gün sonu (23:59). */
export const endOfDay = (offset = 0, from = new Date()) => {
  const date = startOfDay(from);
  date.setDate(date.getDate() + offset);
  date.setHours(23, 59, 0, 0);
  return date;
};

const isEndOfDay = (date: Date) => date.getHours() === 23 && date.getMinutes() === 59;

/** "Bugün", "Yarın 14:00", "12 Kasım Prş" — 23:59 son tarihte saat gösterilmez. */
export function formatDue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY);
  const clock = isEndOfDay(date) ? "" : ` ${date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 0) return `Bugün${clock}`;
  if (days === 1) return `Yarın${clock}`;
  if (days === -1) return `Dün${clock}`;
  return `${date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" })}${clock}`;
}

export const dueOf = (task: TodoTask) => task.dueAt || (task.kind === "match_duty" ? task.match?.startsAt : null) || null;
export const isLate = (task: TodoTask) => Boolean(task.overdue && task.status !== "done");
/** Başkasına atadığım, bende yalnızca izlenen kart. */
export const isDelegated = (task: TodoTask) => task.source === "assigned_by_me" && !task.permissions?.isOwner;

export function dateBucket(task: TodoTask, now = new Date()): string {
  if (isDelegated(task)) return "delegated";
  if (task.status === "done") return "done";
  const iso = dueOf(task);
  if (!iso) return "someday";
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "someday";
  if (task.overdue || due.getTime() < now.getTime()) return "overdue";
  const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return "week";
  return "later";
}

export const statusBucket = (task: TodoTask) => (isDelegated(task) ? "delegated" : task.status);

export interface GroupDef {
  key: string;
  title: string;
  hint?: string;
  tone?: "danger" | "accent";
  collapsed?: boolean;
  archive?: boolean;
}

export const DATE_GROUPS: GroupDef[] = [
  { key: "overdue", title: "Geciken", tone: "danger" },
  { key: "today", title: "Bugün", tone: "accent" },
  { key: "tomorrow", title: "Yarın" },
  { key: "week", title: "Önümüzdeki 7 gün" },
  { key: "later", title: "Daha sonra" },
  { key: "someday", title: "Tarihsiz" },
  { key: "delegated", title: "Başkalarına atadıklarım", hint: "Sahibi yürütür, sen izlersin" },
  { key: "done", title: "Tamamlanan", hint: "Son 30 gün", collapsed: true },
];

export const STATUS_GROUPS: GroupDef[] = [
  { key: "in_progress", title: "Sürüyor", tone: "accent" },
  { key: "open", title: "Yapılacak" },
  { key: "delegated", title: "Başkalarına atadıklarım", hint: "Sahibi yürütür, sen izlersin" },
  { key: "done", title: "Tamamlanan", hint: "Son 30 gün", collapsed: true },
];

const TODAY_GROUPS: GroupDef[] = [
  { key: "overdue", title: "Geciken", tone: "danger" },
  { key: "today", title: "Bugün", tone: "accent" },
  { key: "done", title: "Bugün tamamladıkların", collapsed: false, archive: true },
];

const time = (value: string | null | undefined) => (value ? new Date(value).getTime() : 0);

/** Liste satırlarının sırası (web sortRows). */
export function sortRows(cards: TodoTask[], group: string): TodoTask[] {
  return [...cards].sort((a, b) => {
    if (group === "done") return time(b.completedAt || b.updatedAt) - time(a.completedAt || a.updatedAt);
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if ((a.status === "in_progress") !== (b.status === "in_progress")) return a.status === "in_progress" ? -1 : 1;
    if ((a.priority === "high") !== (b.priority === "high")) return a.priority === "high" ? -1 : 1;
    const da = dueOf(a);
    const db = dueOf(b);
    const due = (da ? time(da) : Infinity) - (db ? time(db) : Infinity);
    if (due && Number.isFinite(due)) return due;
    if (da && !db) return -1;
    if (!da && db) return 1;
    if (a.position != null && b.position != null && a.position !== b.position) return a.position - b.position;
    return time(b.createdAt) - time(a.createdAt);
  });
}

/** Pano sütunundaki sıra (web sortColumn). */
export function sortColumn(cards: TodoTask[], column: TodoStatus): TodoTask[] {
  return [...cards].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (column === "done" && (a.position == null || b.position == null)) {
      return time(b.completedAt || b.updatedAt) - time(a.completedAt || a.updatedAt);
    }
    if ((a.position == null) !== (b.position == null)) return a.position == null ? -1 : 1;
    if (a.position == null || b.position == null) {
      const due = (a.dueAt ? time(a.dueAt) : Infinity) - (b.dueAt ? time(b.dueAt) : Infinity);
      return (Number.isFinite(due) ? due : 0) || time(b.createdAt) - time(a.createdAt);
    }
    return a.position - b.position;
  });
}

/** Kartı sütunun belirli sırasına yerleştirir; sütunun yeni kimlik sırasını döndürür. */
export function orderAfterDrop(columnCards: TodoTask[], movedId: number, index: number): number[] {
  const ids = columnCards.map((card) => card.id).filter((id) => id !== movedId);
  const at = Math.max(0, Math.min(index, ids.length));
  ids.splice(at, 0, movedId);
  return ids;
}

export function progressOf(task: TodoTask): { done: number; total: number } | null {
  if (task.workflow) return { done: task.workflow.done, total: task.workflow.total };
  const list = task.checklist || [];
  return list.length ? { done: list.filter((item) => item.done).length, total: list.length } : null;
}

/* ═══════════════════════════ AKILLI LİSTELER ═══════════════════════════ */

export type ListKey = "today" | "upcoming" | "all" | "assigned_to_me" | "assigned_by_me" | "system" | "done" | "team" | `label:${string}`;

export const VIEWS: Record<string, { title: string; icon: keyof typeof Ionicons.glyphMap; hint: string }> = {
  today: { title: "Bugün", icon: "sunny-outline", hint: "Gecikenler ve bugün bitmesi gerekenler" },
  upcoming: { title: "Yaklaşan", icon: "calendar-outline", hint: "Tarihi olan işlerin gün gün planı" },
  all: { title: "Tüm işler", icon: "layers-outline", hint: "Kendi işlerin, sana atananlar ve takip ettiklerin" },
  assigned_to_me: { title: "Bana atananlar", icon: "file-tray-outline", hint: "Ekipten sana gelen görevler" },
  assigned_by_me: { title: "Atadıklarım", icon: "paper-plane-outline", hint: "Ekibe verdiğin görevler, kişi kişi" },
  system: { title: "Maç görevleri", icon: "mic-outline", hint: "Sistemin açtığı maç, ödül ve an kartları" },
  done: { title: "Tamamlanan", icon: "checkmark-done-outline", hint: "Son 30 günde bitenler" },
  team: { title: "Ekip takibi", icon: "people-outline", hint: "Kim neyi yaptı, ne kaldı" },
};

export const PERSONAL_VIEWS = ["today", "upcoming", "all"] as const;
export const TEAM_VIEWS = ["assigned_to_me", "assigned_by_me", "system"] as const;

export const labelView = (text: string): ListKey => `label:${text}`;
export const viewLabel = (view: string) => (String(view).startsWith("label:") ? String(view).slice(6) : null);

const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

export function isDueToday(task: TodoTask, now = new Date()): boolean {
  const iso = dueOf(task);
  if (!iso) return false;
  const due = new Date(iso);
  return !Number.isNaN(due.getTime()) && startOfDay(due) <= startOfDay(now);
}

export function inView(task: TodoTask, view: string, now = new Date()): boolean {
  const label = viewLabel(view);
  if (label) return (task.labels || []).some((entry) => entry.text === label);
  switch (view) {
    case "today":
      if (isDelegated(task)) return false;
      if (task.status === "done") return Boolean(task.completedAt) && sameDay(new Date(task.completedAt!), now);
      return isLate(task) || isDueToday(task, now);
    case "upcoming":
      if (isDelegated(task) || task.status === "done" || !dueOf(task)) return false;
      return !isLate(task) && !isDueToday(task, now);
    case "assigned_to_me":
    case "assigned_by_me":
    case "system":
      return task.source === view;
    case "done":
      return task.status === "done";
    default:
      return true;
  }
}

export const openCount = (items: TodoTask[], view: string, now = new Date()) =>
  items.filter((task) => inView(task, view, now) && (view === "done" ? true : task.status !== "done")).length;

export interface RowGroup extends GroupDef {
  cards: TodoTask[];
  person?: { id: number; name: string };
  done?: number;
}

function dayGroups(cards: TodoTask[], now = new Date()): RowGroup[] {
  const map = new Map<string, RowGroup & { order: number }>();
  cards.forEach((task) => {
    const due = new Date(dueOf(task)!);
    const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY);
    const key = days > 7 ? "later" : `d${days}`;
    if (!map.has(key)) {
      const title = key === "later" ? "Daha sonra" : days === 1 ? "Yarın" : due.toLocaleDateString("tr-TR", { weekday: "long" });
      const hint = key === "later" ? "" : due.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
      map.set(key, { key, title, hint, order: key === "later" ? 99 : days, cards: [] });
    }
    map.get(key)!.cards.push(task);
  });
  return [...map.values()].sort((a, b) => a.order - b.order).map((group) => ({ ...group, cards: sortRows(group.cards, group.key) }));
}

function personGroups(cards: TodoTask[]): RowGroup[] {
  const map = new Map<number, RowGroup>();
  cards.forEach((task) => {
    const person = task.owner || { id: 0, name: "—" };
    if (!map.has(person.id)) map.set(person.id, { key: `p${person.id}`, title: person.name, person, cards: [] });
    map.get(person.id)!.cards.push(task);
  });
  return [...map.values()]
    .map((group) => {
      const done = group.cards.filter((task) => task.status === "done").length;
      return { ...group, done, hint: `${done}/${group.cards.length} tamamlandı`, cards: sortRows(group.cards, "person") };
    })
    .sort((a, b) => b.cards.length - (b.done ?? 0) - (a.cards.length - (a.done ?? 0)) || a.title.localeCompare(b.title, "tr"));
}

export type GroupBy = "date" | "status" | "today" | "day" | "person" | "done";

/** Listenin kendi gruplaması; yoksa kullanıcının seçtiği (tarih / durum). */
export const FIXED_GROUPING: Record<string, GroupBy> = { today: "today", upcoming: "day", assigned_by_me: "person", done: "done" };

export function buildGroups(items: TodoTask[], groupBy: GroupBy): RowGroup[] {
  if (groupBy === "day") return dayGroups(items);
  if (groupBy === "person") return personGroups(items);
  if (groupBy === "done") {
    return items.length ? [{ key: "done-all", title: "Tamamlanan", hint: "Son 30 gün", archive: true, cards: sortRows(items, "done") }] : [];
  }
  const defs = groupBy === "status" ? STATUS_GROUPS : groupBy === "today" ? TODAY_GROUPS : DATE_GROUPS;
  const bucket = groupBy === "status" ? statusBucket : (task: TodoTask) => dateBucket(task);
  const map = new Map<string, TodoTask[]>(defs.map((def) => [def.key, []]));
  items.forEach((task) => map.get(bucket(task))?.push(task));
  return defs
    .map((def) => ({ ...def, archive: def.archive ?? def.key === "done", cards: sortRows(map.get(def.key) ?? [], def.key) }))
    .filter((group) => group.cards.length);
}

/** Kartla ilgili kişi: atadığım kartta yürüten, bana gelende atayan. */
export const personOf = (task: TodoTask) =>
  task.source === "assigned_by_me" ? task.owner : task.source === "assigned_to_me" || task.source === "system" ? task.assignedBy : null;

/** Arama: başlık, açıklama, oyuncu, takım, maç, kişi, etiket. */
export function matchesSearch(task: TodoTask, needle: string): boolean {
  const q = needle.trim().toLocaleLowerCase("tr-TR");
  if (!q) return true;
  return [task.title, task.body, task.player?.name, task.team?.name, task.match?.label, task.owner?.name, task.assignedBy?.name, ...(task.labels || []).map((l) => l.text)]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR")
    .includes(q);
}

/** "0532 111 22 33" → "905321112233" (WhatsApp). */
export function whatsappNumber(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("90")) return digits;
  if (digits.startsWith("0")) return `9${digits}`;
  return digits.length === 10 ? `90${digits}` : digits;
}
