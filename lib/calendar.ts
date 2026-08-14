import * as Calendar from "expo-calendar";
import { Alert, Platform } from "react-native";
import type { ApiMatch } from "./types";

/**
 * Fikstürdeki maçı telefon takvimine ekler.
 *
 * İlk kullanımda sistem takvim izni ister; reddedilirse kullanıcı kibarca
 * bilgilendirilir. Maç süresi bilinmediğinden etkinlik 1 saat olarak açılır.
 */
export async function addMatchToCalendar(match: ApiMatch): Promise<void> {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Takvim izni gerekli",
        "Maçı ekleyebilmek için Ayarlar'dan takvim erişimine izin verin."
      );
      return;
    }

    const calendarId = await defaultCalendarId();
    if (!calendarId) {
      Alert.alert("Takvim bulunamadı", "Yazılabilir bir takvim bulunamadı.");
      return;
    }

    const start = new Date(`${String(match.date).slice(0, 10)}T${match.time || "20:00:00"}`);
    if (Number.isNaN(start.getTime())) {
      Alert.alert("Tarih okunamadı", "Bu maçın tarihi eklenemedi.");
      return;
    }
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    await Calendar.createEventAsync(calendarId, {
      title: `⚽ ${match.first_team_name} - ${match.second_team_name}`,
      startDate: start,
      endDate: end,
      location: match.match_field ?? undefined,
      notes: `${match.league_name} · ElitLig`,
      alarms: [{ relativeOffset: -60 }], // 1 saat önce hatırlat
    });

    Alert.alert("Takvime eklendi", "Maç, 1 saat öncesinden hatırlatmalı olarak eklendi.");
  } catch {
    Alert.alert("Eklenemedi", "Takvim etkinliği oluşturulurken bir sorun oluştu.");
  }
}

async function defaultCalendarId(): Promise<string | null> {
  if (Platform.OS === "ios") {
    const calendar = await Calendar.getDefaultCalendarAsync().catch(() => null);
    if (calendar) return calendar.id;
  }
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((item) => item.allowsModifications);
  return writable?.id ?? null;
}
