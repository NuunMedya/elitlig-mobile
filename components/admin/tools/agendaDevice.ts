/**
 * AJANDA ↔ TELEFON — hatırlatma bildirimleri ve telefon takvimine aktarım.
 *
 * HATIRLATMA: web, sayfa açıkken zamanı gelen etkinliği bildirir. Mobilde
 * daha iyisi yapılır: yüklenen aralıktaki hatırlatmalı etkinlikler için
 * cihazda YEREL bildirim planlanır (expo-notifications), uygulama kapalıyken
 * de çalar. Kimlik "ajanda:<occurrence_key>" olduğundan aynı tekrar yeniden
 * planlanınca üzerine yazılır; aralıkta artık bulunmayan (silinen/değişen)
 * planlar iptal edilir. Kullanıcı "Hatırlatma bildirimleri"ni açmadıkça hiçbir
 * şey planlanmaz.
 *
 * TAKVİME AKTAR: web .ics dosyası indirir; mobilde etkinlik tekrar kuralı ve
 * alarmıyla birlikte doğrudan telefon takvimine yazılır (expo-calendar).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import type { AgendaOccurrence, ToolEvent } from "@/lib/api/admin/tools";

import { formatClock, reminderAt } from "./agendaUtils";

const PREFIX = "ajanda:";
export const NOTIFY_KEY = "tools:agenda:notify";

export async function readNotifyPref(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NOTIFY_KEY)) === "1";
  } catch {
    return false;
  }
}

/** Bildirim iznini ister; verilirse tercihi açar. */
export async function enableReminders(): Promise<boolean> {
  try {
    const Notifications = await import("expo-notifications");
    let status = await Notifications.getPermissionsAsync();
    if (!status.granted) status = await Notifications.requestPermissionsAsync();
    if (!status.granted) return false;
    await AsyncStorage.setItem(NOTIFY_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/** Tercihi kapatır ve planlanmış tüm ajanda bildirimlerini iptal eder. */
export async function disableReminders(): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFY_KEY, "0");
    const Notifications = await import("expo-notifications");
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {
    /* bildirim modülü yok (Expo Go) — sessiz */
  }
}

/**
 * [from, to] aralığının hatırlatmalarını cihazla eşitler. Aralık dışındaki
 * planlara dokunulmaz (başka bir ay görünümünde planlanmış olabilir).
 */
export async function syncReminders(items: AgendaOccurrence[], from: Date, to: Date): Promise<void> {
  if (!(await readNotifyPref())) return;
  try {
    const Notifications = await import("expo-notifications");
    const status = await Notifications.getPermissionsAsync();
    if (!status.granted) return;
    const now = Date.now();
    const wanted = new Map<string, { at: number; item: AgendaOccurrence }>();
    for (const item of items) {
      const at = reminderAt(item);
      if (at == null || at <= now + 5000) continue;
      wanted.set(`${PREFIX}${item.occurrence_key}`, { at, item });
    }
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const entry of scheduled) {
      if (!entry.identifier.startsWith(PREFIX) || wanted.has(entry.identifier)) continue;
      const start = Number((entry.content.data as { start?: number } | null)?.start ?? 0);
      if (start >= from.getTime() && start <= to.getTime()) {
        await Notifications.cancelScheduledNotificationAsync(entry.identifier);
      }
    }
    for (const [identifier, { at, item }] of wanted) {
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: "Ajanda hatırlatması",
          body: `${item.title} · ${item.all_day ? "bugün" : formatClock(item.occurrence_start)}${item.location ? ` · ${item.location}` : ""}`,
          data: { kind: "agenda", start: new Date(item.occurrence_start).getTime() },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
      });
    }
  } catch {
    /* bildirim modülü yok — sessiz */
  }
}

/** Etkinliği (tekrar kuralı ve alarmıyla) telefon takvimine yazar. */
export async function exportToDeviceCalendar(event: Partial<ToolEvent> & { title: string; start_at: string }): Promise<"ok" | "denied" | "nocal"> {
  const Calendar = await import("expo-calendar");
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") return "denied";
  let calendarId: string | null = null;
  if (Platform.OS === "ios") {
    const def = await Calendar.getDefaultCalendarAsync().catch(() => null);
    calendarId = def?.id ?? null;
  }
  if (!calendarId) {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    calendarId = calendars.find((c) => c.allowsModifications)?.id ?? null;
  }
  if (!calendarId) return "nocal";
  const start = new Date(event.start_at);
  const end = event.end_at ? new Date(event.end_at) : new Date(start.getTime() + 60 * 60000);
  const FREQ: Record<string, string | undefined> = {
    daily: Calendar.Frequency.DAILY,
    weekly: Calendar.Frequency.WEEKLY,
    monthly: Calendar.Frequency.MONTHLY,
    yearly: Calendar.Frequency.YEARLY,
  };
  const freq = event.recurrence ? FREQ[event.recurrence] : undefined;
  await Calendar.createEventAsync(calendarId, {
    title: event.title,
    startDate: start,
    endDate: end,
    allDay: Boolean(event.all_day),
    location: event.location ?? undefined,
    notes: event.description ?? undefined,
    alarms: event.remind_minutes != null ? [{ relativeOffset: -event.remind_minutes }] : undefined,
    recurrenceRule: freq
      ? {
          frequency: freq as never,
          endDate: event.repeat_until ? new Date(`${event.repeat_until}T23:59:59`) : undefined,
        }
      : undefined,
  });
  return "ok";
}
