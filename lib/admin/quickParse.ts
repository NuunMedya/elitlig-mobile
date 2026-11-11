/**
 * DOĞAL DİLLE HIZLI KAYIT — "yarın 14:00 sahayı ara !" → başlık + tarih + öncelik.
 *
 * Masaüstü Elitlig Araçlar'daki ⌃⌥N hızlı kayıt penceresinin ayrıştırıcısı
 * (elitlig-mac renderer/src/lib/helpers.js parseQuickTask) ile aynı kurallar,
 * telefonda sık yazılan birkaç ek kalıpla:
 *
 *   gün      bugün · yarın · öbür gün / ertesi gün · haftaya · pazartesi…pazar
 *            · "3 gün sonra" · "12.11" / "12/11/2026" · "12 kasım"
 *   saat     14:00 · 14.30 · "saat 9" · "akşam" (19:00) · "sabah" (09:00) · "öğlen" (12:00)
 *   öncelik  tek başına "!" (ya da !!, !!!) · "acil" · "önemli"
 *
 * Saat verilmeden gün yazılırsa son tarih GÜN SONUDUR (23:59): Yapılacaklar
 * panosu 23:59'u "saatsiz" sayar ve yalnız günü gösterir. Yalnız saat
 * yazılırsa bugün, saat geçtiyse yarın kabul edilir.
 *
 * Tarihler cihazın yerel saatiyle kurulur (pano ve ajanda da öyle çalışır).
 */

export interface QuickParse {
  /** Tarih/öncelik sözcükleri ayıklanmış başlık. */
  title: string;
  /** ISO son tarih ya da null. */
  dueAt: string | null;
  /** Kullanıcı açıkça saat yazdı mı (yoksa gün sonu). */
  hasTime: boolean;
  priority: "normal" | "high";
}

const WEEKDAYS = ["pazar", "pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi"];
const MONTHS = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];
const PART_OF_DAY: [RegExp, number][] = [
  [/\ssabah(?:a|tan)?\s/i, 9],
  [/\sö[ğg]len?(?:e|den)?\s/i, 12],
  [/\sak[şs]am(?:a|dan|üstü)?\s/i, 19],
  [/\sgece\s/i, 22],
];

const lower = (text: string) => text.toLocaleLowerCase("tr-TR");

export function parseQuickTask(text: string, now: Date = new Date()): QuickParse {
  let rest = ` ${String(text || "").replace(/\s+/g, " ").trim()} `;
  let day: Date | null = null;
  let hour: number | null = null;
  let minute = 0;
  let priority: QuickParse["priority"] = "normal";

  const cut = (match: string) => {
    rest = rest.replace(match, " ");
  };
  const dayAt = (add: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);

  // Öncelik
  const bang = rest.match(/\s!{1,3}(?=\s)/);
  if (bang) {
    priority = "high";
    cut(bang[0]);
  } else if (/!{1,3}\s$/.test(rest) && rest.trim().length > 1) {
    // "sahayı ara!" — sona yapışık ünlem de öncelik sayılır.
    priority = "high";
    rest = rest.replace(/!{1,3}\s$/, " ");
  }
  const urgent = rest.match(/\s(acil|önemli)\s/i);
  if (urgent && rest.trim().split(" ").length > 1) {
    priority = "high";
    cut(urgent[0]);
  }

  // Gün sözcükleri
  const words: [RegExp, number][] = [
    [/\sbugün\s/i, 0],
    [/\syarın\s/i, 1],
    [/\s(?:öbür gün|ertesi gün)\s/i, 2],
    [/\shaftaya\s/i, 7],
  ];
  for (const [re, add] of words) {
    const hit = rest.match(re);
    if (hit) {
      day = dayAt(add);
      cut(hit[0]);
      break;
    }
  }
  if (!day) {
    const later = rest.match(/\s(\d{1,3}) (gün|hafta) sonra\s/i);
    if (later) {
      day = dayAt(Number(later[1]) * (lower(later[2]) === "hafta" ? 7 : 1));
      cut(later[0]);
    }
  }
  if (!day) {
    const named = rest.match(new RegExp(`\\s(\\d{1,2}) (${MONTHS.join("|")})(?: (\\d{4}))?\\s`, "i"));
    if (named) {
      const month = MONTHS.indexOf(lower(named[2]));
      const dom = Number(named[1]);
      if (dom >= 1 && dom <= 31) {
        let candidate = new Date(named[3] ? Number(named[3]) : now.getFullYear(), month, dom);
        if (!named[3] && candidate.getTime() < dayAt(0).getTime()) candidate = new Date(now.getFullYear() + 1, month, dom);
        day = candidate;
        cut(named[0]);
      }
    }
  }
  if (!day) {
    const numeric = rest.match(/\s(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\s/);
    // "14.30" saat olabilir: ay 1–12 ve gün 1–31 değilse ya da açıkça saat gibi duruyorsa tarihe çevirme.
    if (numeric && Number(numeric[2]) >= 1 && Number(numeric[2]) <= 12 && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 31 && (numeric[3] || numeric[0].includes("/"))) {
      let candidate = new Date(numeric[3] ? Number(numeric[3]) : now.getFullYear(), Number(numeric[2]) - 1, Number(numeric[1]));
      if (!numeric[3] && candidate.getTime() < dayAt(0).getTime()) candidate = new Date(now.getFullYear() + 1, Number(numeric[2]) - 1, Number(numeric[1]));
      day = candidate;
      cut(numeric[0]);
    }
  }
  if (!day) {
    const weekday = rest.match(/\s(pazartesi|salı|çarşamba|perşembe|cumartesi|cuma|pazar)(?:ya|ye|a|e|ye kadar|a kadar)?\s/i);
    if (weekday) {
      const target = WEEKDAYS.indexOf(lower(weekday[1]));
      let add = (target - now.getDay() + 7) % 7;
      if (add === 0) add = 7;
      day = dayAt(add);
      cut(weekday[0]);
    }
  }

  // Saat
  const clock = rest.match(/\s(?:saat )?(\d{1,2})[:.](\d{2})(?:'?[a-zçğıöşü]{1,3})?\s/i);
  if (clock && Number(clock[1]) < 24 && Number(clock[2]) < 60) {
    hour = Number(clock[1]);
    minute = Number(clock[2]);
    cut(clock[0]);
  } else {
    const bare = rest.match(/\ssaat (\d{1,2})(?:'?[a-zçğıöşü]{1,3})?\s/i);
    if (bare && Number(bare[1]) < 24) {
      hour = Number(bare[1]);
      cut(bare[0]);
    }
  }
  // "yarın akşam", "akşam 7": gün dilimi yalnız bir gün ya da saatle birlikte
  // yazıldıysa saat sayılır — "akşam yemeği al" başlığı bozulmaz.
  if (day || hour != null) {
    for (const [re, base] of PART_OF_DAY) {
      const hit = rest.match(re);
      if (!hit) continue;
      if (hour == null) hour = base;
      else if (base >= 12 && hour < 12) hour += 12;
      cut(hit[0]);
      break;
    }
  }

  let due: Date | null = null;
  if (hour != null) {
    if (day) due = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
    else {
      due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
      if (due.getTime() < now.getTime()) due = new Date(due.getTime() + 86_400_000);
    }
  } else if (day) {
    due = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59);
  }

  const title = rest.replace(/\s+/g, " ").trim();
  return {
    // Her şey ayıklandıysa ("yarın 14:00") yazılanı başlık olarak koru.
    title: title || String(text || "").trim(),
    dueAt: due ? due.toISOString() : null,
    hasTime: hour != null,
    priority,
  };
}

/** "1.250,50 hakem ücreti" / "250 tl top" → { amount, description }. Tutar başta olmalı. */
export function parseQuickAmount(text: string): { amount: number; description: string } | null {
  const match = String(text || "").trim().match(/^(?:₺\s*)?(\d[\d.,]*)\s*(?:tl|₺|lira)?\s*(.*)$/i);
  if (!match) return null;
  let raw = match[1].replace(/[.,]$/, "");
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  // Virgülsüz yazımda nokta binlik ayırıcıdır ("1.250"); "12.5" gibi tek/iki haneli kesir ondalıktır.
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount: Math.round(amount * 100) / 100, description: match[2].trim() };
}
