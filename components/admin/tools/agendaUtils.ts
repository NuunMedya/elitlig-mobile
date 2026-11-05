/**
 * AJANDA HESAPLARI — takvim ızgarası, görünüm aralığı, güne düşen etkinlikler
 * ve form ↔ API dönüşümü. Web elitlig-client tools/agendaUtils.js'in TS
 * karşılığı; hafta pazartesi başlar, hesaplar cihazın yerel saatiyle yapılır.
 */

import type { AgendaOccurrence, EventCategory, EventInput, Recurrence, ToolEvent } from "@/lib/api/admin/tools";

export type AgendaView = "month" | "week" | "day" | "list";

export const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const pad = (n: number) => String(n).padStart(2, "0");

export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes());
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** Pazartesi = 0 … Pazar = 6 */
export const weekdayIndex = (date: Date) => (date.getDay() + 6) % 7;
export const startOfWeek = (date: Date) => addDays(startOfDay(date), -weekdayIndex(date));

/** Yerel tarih → "YYYY-MM-DD". */
export const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** Yerel tarih → "YYYY-MM-DDTHH:mm" (DateField değeri). */
export const localInput = (date: Date) => `${isoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
/** "YYYY-MM-DD" ya da "YYYY-MM-DDTHH:mm" → yerel Date. */
export function parseLocal(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match && value.length <= 16) {
    const [, y, m, d, h, mi] = match.map(Number);
    return new Date(y, m - 1, d, h, mi);
  }
  return new Date(value);
}

/** Ay görünümü: ayın ilk haftasının pazartesisinden başlayan 6×7 gün. */
export function monthGrid(year: number, month: number): Date[] {
  const first = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

export const weekDays = (date: Date): Date[] => {
  const first = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
};

/** API'den istenecek aralık (görünümün ilk gününden son gününün sonuna). */
export function rangeFor(view: AgendaView, cursor: Date): { from: Date; to: Date } {
  let from: Date;
  let days: number;
  if (view === "month") {
    from = monthGrid(cursor.getFullYear(), cursor.getMonth())[0];
    days = 42;
  } else if (view === "week") {
    from = startOfWeek(cursor);
    days = 7;
  } else if (view === "day") {
    from = startOfDay(cursor);
    days = 1;
  } else {
    // Liste: imleçten itibaren 60 gün.
    from = startOfDay(cursor);
    days = 60;
  }
  const to = new Date(addDays(from, days).getTime() - 1);
  return { from, to };
}

export function shiftCursor(view: AgendaView, cursor: Date, step: number): Date {
  if (view === "month") return new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
  if (view === "week") return addDays(cursor, 7 * step);
  if (view === "day") return addDays(cursor, step);
  return addDays(cursor, 30 * step);
}

export function titleFor(view: AgendaView, cursor: Date): string {
  if (view === "month") return cursor.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  if (view === "day") return cursor.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
  if (view === "week") {
    const days = weekDays(cursor);
    const first = days[0];
    const last = days[6];
    const sameMonth = first.getMonth() === last.getMonth();
    return `${first.toLocaleDateString("tr-TR", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${last.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`;
  }
  const end = addDays(startOfDay(cursor), 59);
  return `${cursor.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} · 60 gün`;
}

const startOf = (item: AgendaOccurrence) => new Date(item.occurrence_start);
const endOf = (item: AgendaOccurrence) => (item.occurrence_end ? new Date(item.occurrence_end) : startOf(item));

/** Güne düşen etkinlikler: tüm gün olanlar önce, sonra başlama saatine göre. */
export function itemsOnDay(items: AgendaOccurrence[], day: Date): AgendaOccurrence[] {
  const dayStart = startOfDay(day);
  const dayEnd = new Date(addDays(dayStart, 1).getTime() - 1);
  return items
    .filter((item) => startOf(item) <= dayEnd && endOf(item) >= dayStart)
    .sort(
      (a, b) =>
        Number(Boolean(b.all_day)) - Number(Boolean(a.all_day)) || startOf(a).getTime() - startOf(b).getTime()
    );
}

/** Gün/hafta görünümünde saatli etkinliğin dikey konumu (dakika cinsinden). */
export function timeBox(item: AgendaOccurrence, day: Date): { top: number; height: number } {
  const dayStart = startOfDay(day).getTime();
  const start = Math.max(0, (startOf(item).getTime() - dayStart) / 60000);
  const rawEnd = item.occurrence_end ? (endOf(item).getTime() - dayStart) / 60000 : start + 45;
  const end = Math.min(24 * 60, Math.max(start + 30, rawEnd));
  return { top: start, height: end - start };
}

/** Saat sütununda üst üste binen etkinliklerin yan yana dizilmesi (şerit sırası ve sayısı). */
export function layoutLanes(items: AgendaOccurrence[], day: Date): { item: AgendaOccurrence; lane: number; lanes: number; top: number; height: number }[] {
  const boxes = items.map((item) => ({ item, ...timeBox(item, day), lane: 0, lanes: 1 }));
  const groups: (typeof boxes)[] = [];
  let current: typeof boxes = [];
  let groupEnd = -1;
  for (const box of boxes.sort((a, b) => a.top - b.top)) {
    if (current.length && box.top >= groupEnd) {
      groups.push(current);
      current = [];
      groupEnd = -1;
    }
    const used = new Set(current.filter((other) => other.top + other.height > box.top).map((other) => other.lane));
    let lane = 0;
    while (used.has(lane)) lane += 1;
    box.lane = lane;
    current.push(box);
    groupEnd = Math.max(groupEnd, box.top + box.height);
  }
  if (current.length) groups.push(current);
  for (const group of groups) {
    const lanes = Math.max(...group.map((box) => box.lane)) + 1;
    group.forEach((box) => {
      box.lanes = lanes;
    });
  }
  return boxes;
}

/* ═══════════════════════════ FORM ═══════════════════════════ */

export interface EventForm {
  id?: number;
  title: string;
  description: string;
  location: string;
  category: EventCategory;
  color: string;
  all_day: boolean;
  /** "YYYY-MM-DDTHH:mm" */
  start_at: string;
  end_at: string;
  /** "YYYY-MM-DD" */
  start_date: string;
  end_date: string;
  recurrence: Recurrence;
  repeat_until: string;
  /** "" = yok */
  remind_minutes: string;
}

export function blankForm(day: Date = new Date(), hour: number | null = null): EventForm {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour ?? Math.min(22, new Date().getHours() + 1), 0);
  const end = new Date(start.getTime() + 60 * 60000);
  return {
    title: "",
    description: "",
    location: "",
    category: "general",
    color: "",
    all_day: false,
    start_at: localInput(start),
    end_at: localInput(end),
    start_date: isoDate(start),
    end_date: isoDate(start),
    recurrence: "none",
    repeat_until: "",
    remind_minutes: "",
  };
}

export function formFromEvent(event: Partial<ToolEvent> & { id: number; start_at?: string; occurrence_start?: string }): EventForm {
  const start = new Date(event.start_at || event.occurrence_start || Date.now());
  const end = event.end_at ? new Date(event.end_at) : null;
  return {
    id: event.id,
    title: event.title || "",
    description: event.description || "",
    location: event.location || "",
    category: event.category || "general",
    color: event.color || "",
    all_day: Boolean(event.all_day),
    start_at: localInput(start),
    end_at: end ? localInput(end) : "",
    start_date: isoDate(start),
    end_date: end ? isoDate(end) : isoDate(start),
    recurrence: event.recurrence || "none",
    repeat_until: event.repeat_until || "",
    remind_minutes: event.remind_minutes == null ? "" : String(event.remind_minutes),
  };
}

/** Form → API gövdesi. Tüm gün etkinliğinde saatler gün başı/sonuna çekilir. */
export function eventPayload(form: EventForm): EventInput {
  const allDay = Boolean(form.all_day);
  const start = allDay ? parseLocal(form.start_date) : parseLocal(form.start_at);
  let end: Date | null = null;
  if (allDay) {
    const last = parseLocal(form.end_date || form.start_date);
    end = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59);
  } else if (form.end_at) {
    end = parseLocal(form.end_at);
  }
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    location: form.location.trim() || null,
    category: form.category || "general",
    color: form.color || null,
    all_day: allDay,
    start_at: start.toISOString(),
    end_at: end ? end.toISOString() : null,
    recurrence: form.recurrence || "none",
    repeat_until: form.recurrence !== "none" && form.repeat_until ? form.repeat_until : null,
    remind_minutes: form.remind_minutes === "" ? null : Number(form.remind_minutes),
  };
}

/** Başlangıç değişince bitiş aynı süre kadar kayar (web EventForm kuralı). */
export function shiftEnd(prev: EventForm, nextStart: string): string {
  if (!prev.start_at || !prev.end_at || !nextStart) return prev.end_at;
  const duration = parseLocal(prev.end_at).getTime() - parseLocal(prev.start_at).getTime();
  if (duration < 0) return prev.end_at;
  return localInput(new Date(parseLocal(nextStart).getTime() + duration));
}

/** Hatırlatma anı (ms). Yoksa null. */
export function reminderAt(item: AgendaOccurrence): number | null {
  if (item.source !== "event" || item.remind_minutes == null) return null;
  return startOf(item).getTime() - item.remind_minutes * 60000;
}

export function formatClock(value: string | Date): string {
  return new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

/** "Bugün", "Yarın", "Dün" ya da "Perşembe, 12 Kas". */
export function relativeDayLocal(value: string | Date, now = new Date()): string {
  const date = new Date(value);
  const diff = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86400000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  return date.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "short" });
}
