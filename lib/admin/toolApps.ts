import type Ionicons from "@expo/vector-icons/Ionicons";

import { isDark } from "../../theme";

/**
 * ARAÇ UYGULAMALARI — her çalışma aracının "kendi uygulaması" kimliği.
 *
 * NE: yönetim modundaki her araç (Muhasebe, Yapılacaklar, Projeler, Mesajlar…)
 * telefonda ayrı bir uygulama gibi davranır: kendi vurgu rengi, kendi simgesi,
 * kendi başlığı (components/admin/tools/ToolAppHeader) ve kendi birincil
 * eylemi (ToolFab). Bu dosya o kimliklerin TEK kaynağıdır; yönetim ana
 * ekranındaki başlatıcı (launcher) da buradan okur.
 *
 * NEDEN lib/ ALTINDA: vurgu renkleri tema rengi değil, araç KİMLİĞİ verisidir
 * (masaüstü Elitlig Araçlar'daki kenar çubuğu renkleriyle aynı aile). Tasarım
 * denetimi app/ ve components/ altında çıplak hex'i yasaklar; palet bu yüzden
 * burada durur.
 *
 * KONTRAST: `accent` hem dolgu (üstünde `onAccent` metin/ikon) hem de kâğıt
 * üstünde METİN olarak kullanılabilir. Açık temada beyaz kâğıda karşı ≥ 4.5,
 * koyu temada koyu kâğıda karşı ≥ 7 olacak biçimde iki ayrı değer taşır;
 * tema uygulama açılışında donduğu için (theme/index.ts) çözülmüş değerler de
 * modül yüklenirken sabitlenir.
 */

export type ToolAppKey =
  | "projeler"
  | "gorevler"
  | "ajanda"
  | "not-defteri"
  | "muhasebe"
  | "tablolar"
  | "mesajlar"
  | "rehber"
  | "hesap-araclari"
  | "odak-sayaci"
  | "talepler";

export interface ToolApp {
  key: ToolAppKey;
  /** Uygulamanın tam adı ("Ajanda ve takvim"). */
  title: string;
  /** Başlatıcı karosu ve başlık için kısa ad ("Ajanda"). */
  shortTitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Uygulamanın açılış rotası. */
  route: string;
  /** Vurgu rengi — dolgu ve kâğıt üstü metin (aktif temaya göre çözülmüş). */
  accent: string;
  /** Vurgunun soluk zemini (ikon pulu, seçili çip, özet şeridi). */
  accentSoft: string;
  /** `accent` dolgusunun üstündeki metin/ikon rengi. */
  onAccent: string;
  /** Tek cümlelik tanım (başlatıcı ve erişilebilirlik etiketi). */
  tagline: string;
}

interface Swatch {
  accent: string;
  accentSoft: string;
}

interface ToolAppDef extends Omit<ToolApp, "accent" | "accentSoft" | "onAccent"> {
  light: Swatch;
  dark: Swatch;
}

const ON_ACCENT_LIGHT = "#FFFFFF";
const ON_ACCENT_DARK = "#14091F";

const DEFS: ToolAppDef[] = [
  {
    key: "muhasebe",
    title: "Muhasebe",
    shortTitle: "Muhasebe",
    icon: "wallet-outline",
    route: "/yonetim/araclar/muhasebe",
    tagline: "Hesaplar, virman, ön muhasebe ve maç muhasebesi",
    light: { accent: "#047857", accentSoft: "#D1FAE5" },
    dark: { accent: "#6EE7B7", accentSoft: "#0A3B2E" },
  },
  {
    key: "gorevler",
    title: "Yapılacaklar",
    shortTitle: "Yapılacaklar",
    icon: "checkbox-outline",
    route: "/yonetim/gorevler",
    tagline: "Bugünün işleri, atanan görevler ve maç görevleri",
    light: { accent: "#1D4ED8", accentSoft: "#DBEAFE" },
    dark: { accent: "#93C5FD", accentSoft: "#172B5C" },
  },
  {
    key: "projeler",
    title: "Projeler",
    shortTitle: "Projeler",
    icon: "git-branch-outline",
    route: "/yonetim/araclar/projeler",
    tagline: "Süreç adımları, sorumlular, kişiler ve bütçe",
    light: { accent: "#4338CA", accentSoft: "#E0E7FF" },
    dark: { accent: "#A5B4FC", accentSoft: "#26265E" },
  },
  {
    key: "mesajlar",
    title: "Mesajlar",
    shortTitle: "Mesajlar",
    icon: "chatbubbles-outline",
    route: "/mesajlar",
    tagline: "Ekip ve üyelerle yazışma, gruplar, hazır içerikler",
    light: { accent: "#A21CAF", accentSoft: "#FAE8FF" },
    dark: { accent: "#F0ABFC", accentSoft: "#4A1552" },
  },
  {
    key: "talepler",
    title: "Talepler",
    shortTitle: "Talepler",
    icon: "file-tray-full-outline",
    route: "/yonetim/talepler",
    tagline: "Onay bekleyen profil, transfer, kadro ve maç talepleri",
    light: { accent: "#0369A1", accentSoft: "#E0F2FE" },
    dark: { accent: "#7DD3FC", accentSoft: "#0C3550" },
  },
  {
    key: "ajanda",
    title: "Ajanda ve takvim",
    shortTitle: "Ajanda",
    icon: "calendar-outline",
    route: "/yonetim/araclar/ajanda",
    tagline: "Ay, hafta ve gün görünümü; tekrar eden etkinlikler",
    light: { accent: "#0E7490", accentSoft: "#CFFAFE" },
    dark: { accent: "#67E8F9", accentSoft: "#0B3C47" },
  },
  {
    key: "not-defteri",
    title: "Not defteri",
    shortTitle: "Notlar",
    icon: "document-text-outline",
    route: "/yonetim/araclar/not-defteri",
    tagline: "Renkli notlar, işaretlenebilir listeler, etiket ve arşiv",
    light: { accent: "#B45309", accentSoft: "#FEF3C7" },
    dark: { accent: "#FCD34D", accentSoft: "#4A3008" },
  },
  {
    key: "tablolar",
    title: "Tablolar",
    shortTitle: "Tablolar",
    icon: "grid-outline",
    route: "/yonetim/araclar/tablolar",
    tagline: "Formüllü hesap tabloları, çoklu sayfa ve paylaşım",
    light: { accent: "#4D7C0F", accentSoft: "#ECFCCB" },
    dark: { accent: "#BEF264", accentSoft: "#2B3F0C" },
  },
  {
    key: "rehber",
    title: "Rehber",
    shortTitle: "Rehber",
    icon: "call-outline",
    route: "/yonetim/araclar/rehber",
    tagline: "Takımlar, üyeler ve kişiler: ara, yaz, mesaj gönder",
    light: { accent: "#C2410C", accentSoft: "#FFEDD5" },
    dark: { accent: "#FDBA74", accentSoft: "#4F230B" },
  },
  {
    key: "hesap-araclari",
    title: "Hesap araçları",
    shortTitle: "Hesap",
    icon: "calculator-outline",
    route: "/yonetim/araclar/hesap-araclari",
    tagline: "KDV, yüzde, iskonto, aidat bölüştürme, taksit ve tarih",
    light: { accent: "#475569", accentSoft: "#E2E8F0" },
    dark: { accent: "#CBD5E1", accentSoft: "#2A3446" },
  },
  {
    key: "odak-sayaci",
    title: "Odak sayacı",
    shortTitle: "Odak",
    icon: "timer-outline",
    route: "/yonetim/araclar/odak-sayaci",
    tagline: "Pomodoro, geri sayım ve kronometre",
    light: { accent: "#BE123C", accentSoft: "#FFE4E6" },
    dark: { accent: "#FDA4AF", accentSoft: "#55142A" },
  },
];

function resolve(def: ToolAppDef, dark: boolean): ToolApp {
  const { light, dark: darkSwatch, ...rest } = def;
  const swatch = dark ? darkSwatch : light;
  return { ...rest, accent: swatch.accent, accentSoft: swatch.accentSoft, onAccent: dark ? ON_ACCENT_DARK : ON_ACCENT_LIGHT };
}

/** Aktif temaya göre çözülmüş kimlikler — başlatıcı sırasıyla. */
export const TOOL_APP_LIST: ToolApp[] = DEFS.map((def) => resolve(def, isDark));

/** Anahtarla erişim: `TOOL_APPS.muhasebe.accent`. */
export const TOOL_APPS = Object.fromEntries(TOOL_APP_LIST.map((app) => [app.key, app])) as Record<ToolAppKey, ToolApp>;

/** Başlatıcıda önce gösterilecek, sahibin "çok önemli" dediği dört araç. */
export const PRIMARY_TOOL_APPS: ToolAppKey[] = ["muhasebe", "gorevler", "projeler", "mesajlar"];

export function isToolAppKey(value: unknown): value is ToolAppKey {
  return typeof value === "string" && value in TOOL_APPS;
}

/** Anahtar bilinmiyorsa null (kayıt defterindeki araç dışı modüller için). */
export function toolApp(key: string | null | undefined): ToolApp | null {
  return isToolAppKey(key) ? TOOL_APPS[key] : null;
}

/** Belirli bir tema için kimlik (önizleme, ekran görüntüsü üretimi). */
export function toolAppFor(key: ToolAppKey, theme: "light" | "dark"): ToolApp {
  return resolve(DEFS.find((def) => def.key === key)!, theme === "dark");
}
