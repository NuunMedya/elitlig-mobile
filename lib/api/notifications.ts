import { get, patch } from "../http";

/**
 * Bildirim tercihleri — routes/users.js (`/api/users/me/notification-preferences`).
 *
 * NEDEN ANAHTAR LİSTESİ KODA GÖMÜLMEZ: sunucu 14 tercih anahtarını, Türkçe
 * etiketlerini, açıklamalarını ve grup düzenini kendisi gönderir
 * (constants/notificationPreferences.js). Yeni bir bildirim türü eklendiğinde
 * mobil sürüm çıkmadan ekranda görünsün diye ekran DAİMA sunucudan gelen
 * `labels` + `groups` üzerinden çizilir; istemci yalnızca normalize eder.
 *
 * TOLERANS: `groups` sunucu sürümüne göre hem nesne
 * (`{ mac: { label } }`) hem dizi (`[{ key: "mac", label }]`) gelebilir.
 * İkisi de aynı sıralı diziye indirgenir; ekran tek biçim görür.
 */

/** Tek bir tercih anahtarının sunucudan gelen tanımı. */
export interface NotificationLabel {
  label: string;
  description?: string;
  /** Ait olduğu grubun anahtarı (mac / panel / oyun / haber). */
  group: string;
}

/** Grup başlığı — normalize edilmiş biçim. */
export interface NotificationGroup {
  key: string;
  label: string;
  description?: string;
}

/** Sunucunun ham yanıtı — biçim toleransı burada tiplenir. */
interface RawNotificationPreferences {
  preferences?: Record<string, boolean> | null;
  defaults?: Record<string, boolean> | null;
  labels?: Record<string, NotificationLabel> | null;
  groups?:
    | Record<string, { label: string; description?: string }>
    | Array<{ key?: string; id?: string; label: string; description?: string }>
    | null;
}

/** Ekranın kullandığı normalize edilmiş biçim. */
export interface NotificationPreferences {
  /** Kullanıcının kayıtlı seçimleri (eksik anahtarlarda `defaults` geçerlidir). */
  preferences: Record<string, boolean>;
  /** Sunucu varsayılanları — kullanıcı hiç dokunmamışsa geçerli değer budur. */
  defaults: Record<string, boolean>;
  labels: Record<string, NotificationLabel>;
  /** Sunucudaki sırayı koruyan grup listesi. */
  groups: NotificationGroup[];
}

/** Hem nesne hem dizi biçimini tek sıralı diziye indirger. */
function normalizeGroups(raw: RawNotificationPreferences["groups"]): NotificationGroup[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((group) => ({
        key: String(group.key ?? group.id ?? "").trim(),
        label: group.label,
        description: group.description,
      }))
      .filter((group) => Boolean(group.key));
  }
  return Object.entries(raw).map(([key, group]) => ({
    key,
    label: group?.label ?? key,
    description: group?.description,
  }));
}

function normalize(raw: RawNotificationPreferences): NotificationPreferences {
  const labels = raw.labels ?? {};
  const groups = normalizeGroups(raw.groups);

  // Sunucu grup listesi göndermediyse etiketlerdeki `group` alanından türet:
  // ekran yine de bölümlenmiş bir liste çizebilsin.
  if (groups.length === 0) {
    const seen = new Set<string>();
    Object.values(labels).forEach((item) => {
      const key = String(item?.group ?? "").trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        groups.push({ key, label: key });
      }
    });
  }

  return {
    preferences: raw.preferences ?? {},
    defaults: raw.defaults ?? {},
    labels,
    groups,
  };
}

/** GET — anahtarlar, etiketler, gruplar ve kullanıcının seçimleri. */
export const getNotificationPreferences = () =>
  get<RawNotificationPreferences>("/api/users/me/notification-preferences").then(normalize);

/**
 * PATCH — YALNIZ değişen anahtarlar gönderilir (kısmi güncelleme).
 * Sunucu güncel tam durumu döndürür; dönmezse çağıran taraf iyimser değeri korur.
 */
export const updateNotificationPreferences = (patchBody: Record<string, boolean>) =>
  patch<RawNotificationPreferences>("/api/users/me/notification-preferences", {
    preferences: patchBody,
  }).then(normalize);

/** Bir anahtarın geçerli değeri: kullanıcı seçimi yoksa sunucu varsayılanı. */
export function effectivePreference(data: NotificationPreferences, key: string): boolean {
  const chosen = data.preferences[key];
  if (typeof chosen === "boolean") return chosen;
  return data.defaults[key] ?? false;
}

/** Tercih anahtarı + geçerli değeri — bölüm listesi için tek satır. */
export interface NotificationPreferenceItem {
  key: string;
  label: string;
  description?: string;
  value: boolean;
}

/** Bölüm — SectionList/ListRow grubu olarak doğrudan çizilebilir. */
export interface NotificationPreferenceSection {
  group: NotificationGroup;
  items: NotificationPreferenceItem[];
}

/**
 * Etiketleri gruplarına dağıtır. Grubu tanınmayan anahtarlar kaybolmasın diye
 * sonda "diger" başlığı altında toplanır.
 */
export function preferenceSections(
  data: NotificationPreferences
): NotificationPreferenceSection[] {
  const byGroup = new Map<string, NotificationPreferenceItem[]>();

  Object.entries(data.labels).forEach(([key, label]) => {
    const groupKey = String(label?.group ?? "").trim() || "diger";
    const list = byGroup.get(groupKey) ?? [];
    list.push({
      key,
      label: label?.label ?? key,
      description: label?.description,
      value: effectivePreference(data, key),
    });
    byGroup.set(groupKey, list);
  });

  const sections: NotificationPreferenceSection[] = [];
  data.groups.forEach((group) => {
    const items = byGroup.get(group.key);
    if (items?.length) {
      sections.push({ group, items });
      byGroup.delete(group.key);
    }
  });

  byGroup.forEach((items, key) => {
    sections.push({ group: { key, label: key === "diger" ? "Diğer" : key }, items });
  });

  return sections;
}
