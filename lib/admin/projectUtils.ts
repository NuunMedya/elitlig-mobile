/**
 * PROJELER — sabitler, biçimlendiriciler, istatistik ve tablo (CSV/TSV)
 * yardımcıları. Web projectUtils.js'in TypeScript karşılığı; iş kuralları
 * (gecikme, bugün aranacak, kazanıldı/kaybedildi, teklif karşılaştırma,
 * bütçe toplamları) birebir aynıdır.
 *
 * VERİ RENKLERİ BURADA: durum / aşama / öncelik renkleri tema tokenı değil,
 * veridir (web ve sunucu da aynı renkleri kullanır). Ekranlar bu sözlükten
 * okur; app/ ve components/ altında çıplak renk yazılmaz.
 */

import type Ionicons from "@expo/vector-icons/Ionicons";

import type {
  ActivityType,
  FinanceTotals,
  Lead,
  LeadKind,
  LeadOutcome,
  LeadStage,
  LeadStatsSummary,
  Phase,
  PortfolioStatus,
  Priority,
  ProjectSettings,
  ProjectStatus,
  ProjectTool,
  QuestionStatus,
  Step,
  StepStatsSummary,
  StepStatus,
  BulkStepInput,
  FinanceEntry,
  EntryStatus,
} from "@/lib/api/admin/projects";

type IconName = keyof typeof Ionicons.glyphMap;

/* ================================ sabitler ================================ */

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; color: string; icon: IconName }> = {
  planning: { label: "Planlama", color: "#7c3aed", icon: "bulb-outline" },
  active: { label: "Yürütülüyor", color: "#2563eb", icon: "play" },
  on_hold: { label: "Beklemede", color: "#ca8a04", icon: "pause" },
  done: { label: "Tamamlandı", color: "#16a34a", icon: "checkmark" },
  cancelled: { label: "İptal", color: "#64748b", icon: "ban-outline" },
};
export const PROJECT_STATUSES = Object.keys(PROJECT_STATUS_META) as ProjectStatus[];

export const STEP_STATUS_META: Record<StepStatus, { label: string; short: string; color: string; icon: IconName }> = {
  todo: { label: "Bekliyor", short: "Bekliyor", color: "#64748b", icon: "ellipse-outline" },
  doing: { label: "Devam ediyor", short: "Devam", color: "#2563eb", icon: "contrast-outline" },
  waiting: { label: "Yanıt bekleniyor", short: "Yanıt", color: "#ca8a04", icon: "hourglass-outline" },
  blocked: { label: "Takıldı", short: "Takıldı", color: "#dc2626", icon: "warning-outline" },
  done: { label: "Tamamlandı", short: "Tamam", color: "#16a34a", icon: "checkmark-circle" },
  skipped: { label: "Gerek yok", short: "Gerek yok", color: "#94a3b8", icon: "play-skip-forward-outline" },
};
export const STEP_STATUSES = Object.keys(STEP_STATUS_META) as StepStatus[];
export const CLOSED_STEP = new Set<StepStatus>(["done", "skipped"]);

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  low: { label: "Düşük", color: "#64748b" },
  normal: { label: "Normal", color: "#2563eb" },
  high: { label: "Yüksek", color: "#ea580c" },
  urgent: { label: "Acil", color: "#dc2626" },
};
export const PRIORITIES = Object.keys(PRIORITY_META) as Priority[];

export const QUESTION_STATUS_META: Record<QuestionStatus, { label: string; color: string }> = {
  open: { label: "Açık", color: "#ea580c" },
  answered: { label: "Cevaplandı", color: "#16a34a" },
  closed: { label: "Kapandı", color: "#64748b" },
};

export const ACTIVITY_META: Record<ActivityType, { label: string; short: string; icon: IconName; color: string }> = {
  call: { label: "Telefon araması", short: "Arama", icon: "call", color: "#2563eb" },
  whatsapp: { label: "WhatsApp", short: "WhatsApp", icon: "logo-whatsapp", color: "#16a34a" },
  email: { label: "E-posta", short: "E-posta", icon: "mail-outline", color: "#7c3aed" },
  meeting: { label: "Toplantı / görüşme", short: "Görüşme", icon: "people-outline", color: "#0891b2" },
  visit: { label: "Ziyaret", short: "Ziyaret", icon: "location-outline", color: "#db2777" },
  sms: { label: "SMS", short: "SMS", icon: "chatbox-outline", color: "#0d9488" },
  note: { label: "Not", short: "Not", icon: "document-text-outline", color: "#ca8a04" },
  status: { label: "Durum değişikliği", short: "Durum", icon: "sync-outline", color: "#64748b" },
  system: { label: "Sistem", short: "Sistem", icon: "settings-outline", color: "#94a3b8" },
};
export const CONTACT_TYPES: ActivityType[] = ["call", "whatsapp", "email", "meeting", "visit", "sms", "note"];
export const QUICK_TYPES: ActivityType[] = ["call", "whatsapp", "meeting", "email"];

export const PORTFOLIO_STATUS_META: Record<PortfolioStatus, { label: string; color: string }> = {
  active: { label: "Aktif", color: "#16a34a" },
  passive: { label: "Pasif", color: "#64748b" },
  renewal: { label: "Yenilenecek", color: "#ca8a04" },
};

export const ENTRY_STATUS_META: Record<EntryStatus, { label: string; income?: string; color: string; icon: IconName }> = {
  planned: { label: "Tahmin", color: "#7c3aed", icon: "bulb-outline" },
  pending: { label: "Bekliyor", color: "#ca8a04", icon: "hourglass-outline" },
  paid: { label: "Ödendi", income: "Tahsil edildi", color: "#16a34a", icon: "checkmark-circle" },
  cancelled: { label: "İptal", color: "#94a3b8", icon: "ban-outline" },
};
export const entryStatusLabel = (status: EntryStatus, type: "income" | "expense") =>
  status === "paid" && type === "income" ? ENTRY_STATUS_META.paid.income! : ENTRY_STATUS_META[status]?.label || status;
export const paidVerb = (type: "income" | "expense") => (type === "income" ? "Tahsil edildi" : "Ödendi");

/** Proje sekmeleri — anahtarlar web adresiyle aynı (?sekme=…). */
export type ProjectTab = "genel" | "surec" | "kisiler" | "butce" | "sorular" | "iletisim" | "portfoy" | "ayarlar";
export const TABS: { key: ProjectTab; label: string }[] = [
  { key: "genel", label: "Genel bakış" },
  { key: "surec", label: "Süreç" },
  { key: "kisiler", label: "Kişiler" },
  { key: "butce", label: "Bütçe" },
  { key: "sorular", label: "Sorular" },
  { key: "iletisim", label: "İletişim" },
  { key: "portfoy", label: "Portföy" },
  { key: "ayarlar", label: "Ayarlar" },
];
export const isProjectTab = (v: unknown): v is ProjectTab => TABS.some((t) => t.key === v);

/**
 * Adımın aracı: proje içi sekmeler (adımın bağlamında açılır) ve Araçlar
 * bölümündeki araçlar (mobil yolu). Odak sayacının mobil karşılığı yoktur.
 */
export const TOOL_META: Record<ProjectTool, { label: string; icon: IconName; internal?: boolean; tab?: ProjectTab; route?: string }> = {
  leads: { label: "Kişiler / CRM", icon: "people-outline", internal: true, tab: "kisiler" },
  suppliers: { label: "Tedarik görüşmeleri", icon: "car-outline", internal: true, tab: "kisiler" },
  finance: { label: "Bütçe / gelir-gider", icon: "cash-outline", internal: true, tab: "butce" },
  questions: { label: "Soru-cevap", icon: "help-circle-outline", internal: true, tab: "sorular" },
  portfolio: { label: "Portföy", icon: "briefcase-outline", internal: true, tab: "portfoy" },
  activity: { label: "İletişim geçmişi", icon: "time-outline", internal: true, tab: "iletisim" },
  todos: { label: "Yapılacaklar", icon: "checkbox-outline", route: "/yonetim/gorevler" },
  agenda: { label: "Ajanda", icon: "calendar-outline", route: "/yonetim/araclar/ajanda" },
  notes: { label: "Not Defteri", icon: "document-text-outline", route: "/yonetim/araclar/not-defteri" },
  sheets: { label: "Tablolar", icon: "grid-outline", route: "/yonetim/araclar/tablolar" },
  accounting: { label: "Muhasebe", icon: "receipt-outline", route: "/yonetim/araclar/muhasebe" },
  contacts: { label: "Rehber", icon: "call-outline", route: "/yonetim/araclar/rehber" },
  calc: { label: "Hesap Araçları", icon: "calculator-outline", route: "/yonetim/araclar/hesap-araclari" },
  focus: { label: "Odak Sayacı", icon: "timer-outline" },
};
export const TOOL_KEYS = Object.keys(TOOL_META) as ProjectTool[];

export const PROJECT_ICONS: Record<string, IconName> = {
  trophy: "trophy-outline",
  handshake: "hand-left-outline",
  folder: "folder-outline",
  rocket: "rocket-outline",
  bullhorn: "megaphone-outline",
  calendar: "calendar-outline",
  users: "people-outline",
  ball: "football-outline",
  chart: "trending-up-outline",
  star: "star-outline",
  flag: "flag-outline",
  lightbulb: "bulb-outline",
};
export const projectIcon = (key: string | null | undefined): IconName => PROJECT_ICONS[key || ""] || PROJECT_ICONS.folder;

/** Proje / aşama renk paleti (web COLORS ile aynı). */
export const PROJECT_COLORS = [
  "#7c3aed", "#2563eb", "#0891b2", "#0d9488", "#16a34a", "#ca8a04",
  "#ea580c", "#dc2626", "#db2777", "#4f46e5", "#64748b", "#0f172a",
] as const;
export const DEFAULT_PROJECT_COLOR = "#7c3aed";
/** Aşamasız grup ve bilinmeyen aşama rengi. */
export const NEUTRAL_COLOR = "#94a3b8";
export const UNKNOWN_STAGE_COLOR = "#64748b";
/** Tedarik ve teklif rozetleri. */
export const SUPPLIER_COLOR = "#0891b2";
export const QUOTE_COLOR = "#ea580c";
export const WIN_COLOR = "#16a34a";
export const ALERT_COLOR = "#dc2626";

export const LEAD_KINDS: { key: LeadKind; label: string; short: string; icon: IconName }[] = [
  { key: "customer", label: "Müşteri görüşmeleri", short: "Müşteri", icon: "people-outline" },
  { key: "supplier", label: "Tedarik görüşmeleri", short: "Tedarik", icon: "car-outline" },
];

export const LOST_REASONS = {
  customer: ["Bütçesi yok", "İlgilenmiyor", "Başka organizasyonda", "Ulaşılamadı", "Tarih uymadı"],
  supplier: ["Fiyat yüksek", "Teslim tarihi uymadı", "Kalite yetersiz", "Daha uygun teklif alındı", "Ulaşılamadı"],
};

/* ================================ yardımcılar ================================ */

export const lower = (v: unknown) => String(v ?? "").toLocaleLowerCase("tr-TR");
export const matches = (needle: string, ...values: unknown[]) => {
  const n = lower(needle).trim();
  if (!n) return true;
  return values.some((v) => lower(v).includes(n));
};

const pad = (n: number) => String(n).padStart(2, "0");
/** Yerel güne göre YYYY-MM-DD. */
export const isoDate = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoDate(new Date());
export const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

export const isStepOverdue = (step: Pick<Step, "due_date" | "status">, today = todayIso()) =>
  Boolean(step.due_date && !CLOSED_STEP.has(step.status) && step.due_date < today);
export const isLeadDue = (lead: Pick<Lead, "next_action_at" | "stage">, closed?: Set<string>) =>
  Boolean(lead.next_action_at && !closed?.has(lead.stage) && new Date(lead.next_action_at) <= endOfToday());
export const isLeadOverdue = (lead: Pick<Lead, "next_action_at" | "stage">, closed?: Set<string>) =>
  Boolean(lead.next_action_at && !closed?.has(lead.stage) && new Date(lead.next_action_at) < new Date());

export const kindOf = (lead: { kind?: string } | null | undefined): LeadKind => (lead?.kind === "supplier" ? "supplier" : "customer");
export const stagesOf = (settings: ProjectSettings | null | undefined, kind: LeadKind = "customer"): LeadStage[] =>
  (kind === "supplier" ? settings?.supplier_stages : settings?.lead_stages) || [];
export const outcomesOf = (settings: ProjectSettings | null | undefined, kind: LeadKind = "customer"): LeadOutcome[] =>
  (kind === "supplier" ? settings?.supplier_outcomes : settings?.outcomes) || [];
/** Tedarikte fiyatı soran sonuç ("Fiyat alındı"): seçilince teklif tutarı istenir. */
export const asksPrice = (outcome: LeadOutcome | null | undefined) =>
  Boolean(outcome && (/fiyat_alindi|teklif_alindi/.test(outcome.key) || /fiyat al|teklif al/i.test(outcome.label || "")));

/** Kazanıldı / kaybedildi (tedarikte anlaşıldı / vazgeçildi) aşamaları (açık sayılmaz). */
export const closedStages = (settings: ProjectSettings | null | undefined) =>
  new Set([...stagesOf(settings, "customer"), ...stagesOf(settings, "supplier")].filter((s) => s.won || s.lost).map((s) => s.key));

/** Aşama bilgisi; tür verilmezse önce müşteri, sonra tedarik aşamalarında aranır. */
export const stageOf = (settings: ProjectSettings | null | undefined, key: string | null | undefined, kind?: LeadKind): LeadStage => {
  const lists = kind ? [stagesOf(settings, kind)] : [stagesOf(settings, "customer"), stagesOf(settings, "supplier")];
  for (const list of lists) {
    const hit = list.find((s) => s.key === key);
    if (hit) return hit;
  }
  return { key: key || "", label: key || "—", color: UNKNOWN_STAGE_COLOR };
};
export const outcomeOf = (settings: ProjectSettings | null | undefined, key: string | null | undefined, kind?: LeadKind) =>
  (kind ? outcomesOf(settings, kind) : [...outcomesOf(settings, "customer"), ...outcomesOf(settings, "supplier")]).find((o) => o.key === key) || null;

export const sameItem = (a: unknown, b: unknown) => lower(a).trim() !== "" && lower(a).trim() === lower(b).trim();
/** Aynı tedarik konusundaki teklifler (ucuzdan pahalıya). */
export function priceComparison(leads: Lead[] = [], lead: Lead | null | undefined): Lead[] {
  if (!lead?.item) return [];
  return leads
    .filter((l) => kindOf(l) === "supplier" && sameItem(l.item, lead.item) && l.value != null)
    .sort((a, b) => Number(a.value) - Number(b.value) || a.id - b.id);
}

export const dayDiff = (iso: string, today = todayIso()) =>
  Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);

/** "Bugün", "Yarın", "3 gün gecikti", "Cuma", "12 Kas" */
export const dueLabel = (iso: string | null | undefined) => {
  if (!iso) return "";
  const diff = dayDiff(iso);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  if (diff < 0) return `${-diff} gün gecikti`;
  const d = new Date(`${iso}T00:00:00`);
  if (diff < 7) return d.toLocaleDateString("tr-TR", { weekday: "long" });
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    ...(iso.slice(0, 4) !== todayIso().slice(0, 4) ? { year: "numeric" } : {}),
  });
};

/** Tarih-saat: "Bugün 10:00", "Yarın 14:30", "6 Kas 10:00" */
export const whenLabel = (value: string | null | undefined) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const diff = dayDiff(isoDate(d));
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `Bugün ${time}`;
  if (diff === 1) return `Yarın ${time}`;
  if (diff === -1) return `Dün ${time}`;
  return `${d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  })} ${time}`;
};

/** Zaman çizelgesi gün başlığı: "Bugün", "Dün", "3 Kasım Salı" */
export const relativeDayLabel = (value: string | null | undefined) => {
  if (!value) return "";
  const d = new Date(value);
  const diff = dayDiff(isoDate(d));
  if (diff === 0) return "Bugün";
  if (diff === -1) return "Dün";
  if (diff === 1) return "Yarın";
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
};

export const timeAgo = (value: string | null | undefined) => {
  if (!value) return "";
  const diff = (Date.now() - new Date(value).getTime()) / 60000;
  if (diff < 1) return "az önce";
  if (diff < 60) return `${Math.round(diff)} dk önce`;
  if (diff < 1440) return `${Math.round(diff / 60)} sa önce`;
  if (diff < 1440 * 7) return `${Math.round(diff / 1440)} gün önce`;
  return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
};

/** Yerel "YYYY-MM-DDTHH:mm" (DateSheet biçimi) → ISO; boşsa null. */
export const localToIso = (value: string | null | undefined) => {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T10:00` : value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
/** ISO → yerel "YYYY-MM-DDTHH:mm". */
export const isoToLocal = (value: string | null | undefined) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** Bugünden `days` gün sonra saat 10:00 (yerel "YYYY-MM-DDTHH:mm"). */
export const daysFromNowAt10 = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${isoDate(d)}T10:00`;
};

/* ------------------------------- telefon ------------------------------- */

export const digits = (phone: unknown) => String(phone ?? "").replace(/\D/g, "");
export const telHref = (phone: string | null | undefined) => (digits(phone) ? `tel:${String(phone).replace(/[^\d+]/g, "")}` : null);
/** "0532 111 22 33" → https://wa.me/905321112233 */
export const waHref = (phone: string | null | undefined) => {
  let d = digits(phone);
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = `9${d}`;
  else if (d.length === 10) d = `90${d}`;
  return `https://wa.me/${d}`;
};
export const mailHref = (email: string | null | undefined) => (email ? `mailto:${String(email).trim()}` : null);
export const prettyPhone = (phone: string | null | undefined) => {
  const d = digits(phone).replace(/^(90|0)/, "");
  if (d.length !== 10) return phone || "";
  return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
};

/* -------------------------------- anahtar -------------------------------- */

/** Anahtar üretimi (aşama / sonuç): küçük harf, rakam, _ — en çok 24. */
export const slugKey = (label: string, taken: Set<string> = new Set()) => {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
  const base =
    lower(label)
      .replace(/[çğıöşüâîû]/g, (ch) => map[ch])
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 20) || "asama";
  let key = base;
  let n = 2;
  while (taken.has(key)) {
    key = `${base.slice(0, 20)}_${n}`;
    n += 1;
  }
  return key;
};

/* ------------------------------- bağlantı ------------------------------- */

export const isInternalLink = (url: string) => typeof url === "string" && url.startsWith("/") && !url.startsWith("//");
export const validLink = (url: string) => /^https?:\/\//i.test(url) || isInternalLink(url) || /^(mailto|tel):/i.test(url);
export const normalizeLink = (url: string) => {
  const v = String(url || "").trim();
  if (!v) return "";
  if (validLink(v)) return v;
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(v)) return `mailto:${v}`;
  if (/^\+?[\d\s()-]{7,}$/.test(v)) return `tel:${v.replace(/[^\d+]/g, "")}`;
  if (/^[\w-]+(\.[\w-]+)+/.test(v)) return `https://${v}`;
  return v;
};

/* ================================ istatistik ================================ */

export function stepStats(steps: Step[] = []): StepStatsSummary {
  const today = todayIso();
  const total = steps.length;
  const done = steps.filter((s) => s.status === "done").length;
  const skipped = steps.filter((s) => s.status === "skipped").length;
  const counted = total - skipped;
  const byStatus = Object.fromEntries(STEP_STATUSES.map((k) => [k, steps.filter((s) => s.status === k).length]));
  return {
    total,
    done,
    skipped,
    overdue: steps.filter((s) => isStepOverdue(s, today)).length,
    by_status: byStatus,
    progress: counted ? Math.round((done / counted) * 100) : 0,
  };
}

export function leadStats(allLeads: Lead[] = [], settings: ProjectSettings | null | undefined, kind: LeadKind = "customer"): LeadStatsSummary {
  const stages = stagesOf(settings, kind);
  const leads = allLeads.filter((l) => kindOf(l) === kind);
  const won = new Set(stages.filter((s) => s.won).map((s) => s.key));
  const lost = new Set(stages.filter((s) => s.lost).map((s) => s.key));
  const open = leads.filter((l) => !won.has(l.stage) && !lost.has(l.stage));
  const closed = new Set([...won, ...lost]);
  return {
    total: leads.length,
    won: leads.filter((l) => won.has(l.stage)).length,
    lost: leads.filter((l) => lost.has(l.stage)).length,
    open: open.length,
    due: open.filter((l) => isLeadDue(l, closed)).length,
    by_stage: Object.fromEntries(stages.map((s) => [s.key, leads.filter((l) => l.stage === s.key).length])),
    won_value: leads.filter((l) => won.has(l.stage)).reduce((sum, l) => sum + (Number(l.value) || 0), 0),
    pipeline_value: open.reduce((sum, l) => sum + (Number(l.value) || 0), 0),
  };
}

/** Bütçe özeti (sunucudaki finance.entryTotals ile aynı): tahmini, bekleyen, gerçekleşen. */
export function entryTotals(entries: Pick<FinanceEntry, "status" | "type" | "amount" | "estimate">[] = []): FinanceTotals {
  const t = {
    planned_income: 0, planned_expense: 0, pending_income: 0, pending_expense: 0,
    paid_income: 0, paid_expense: 0, estimate_income: 0, estimate_expense: 0,
  };
  entries.forEach((e) => {
    if (e.status === "cancelled") return;
    const side = e.type === "income" ? "income" : "expense";
    const val = Number(e.amount ?? e.estimate ?? 0);
    t[`estimate_${side}`] += Number(e.estimate ?? e.amount ?? 0);
    if (e.status === "planned") t[`planned_${side}`] += val;
    if (e.status === "pending") t[`pending_${side}`] += val;
    if (e.status === "paid") t[`paid_${side}`] += val;
  });
  const r = (v: number) => Math.round(v * 100) / 100;
  (Object.keys(t) as (keyof typeof t)[]).forEach((k) => {
    t[k] = r(t[k]);
  });
  return {
    ...t,
    estimate_net: r(t.estimate_income - t.estimate_expense),
    paid_net: r(t.paid_income - t.paid_expense),
    open_income: r(t.planned_income + t.pending_income),
    open_expense: r(t.planned_expense + t.pending_expense),
  };
}

/** Aşamalara göre sıralı adımlar (aşamasızlar en sonda). */
export function groupSteps(phases: Phase[] = [], steps: Step[] = []): { phase: Phase | null; steps: Step[] }[] {
  const byPhase = new Map<number, Step[]>(phases.map((p) => [p.id, []]));
  const loose: Step[] = [];
  steps.forEach((s) => {
    const list = s.phase_id != null && byPhase.has(s.phase_id) ? byPhase.get(s.phase_id)! : loose;
    list.push(s);
  });
  const sort = (list: Step[]) => list.sort((a, b) => a.position - b.position || a.id - b.id);
  const groups: { phase: Phase | null; steps: Step[] }[] = [...phases]
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((p) => ({ phase: p, steps: sort(byPhase.get(p.id)!) }));
  if (loose.length) groups.push({ phase: null, steps: sort(loose) });
  return groups;
}

/** Tutar metni ("1.250,50", "1250.5", "₺ 300") → sayı; boşsa null, bozuksa NaN. */
export const parseAmount = (value: unknown): number | null => {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim().replace(/\s|₺|TL/gi, "");
  if (!raw) return null;
  const normalized = raw.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
export const moneyText = (v: number | string | null | undefined) => (v == null || v === "" ? "" : String(v).replace(".", ","));

/* ============================= tablo (CSV / TSV) ============================= */

/**
 * Yapıştırılan tablo metnini satırlara böler. Excel / Google E-Tablolar'dan
 * kopyalanan alan SEKME ile ayrılır; CSV ise virgül ya da noktalı virgül.
 * Tırnaklı hücre ("a, b") desteklenir.
 */
export function parseTableText(text: string): string[][] {
  const src = String(text || "").replace(/\r\n?/g, "\n");
  const firstLine = src.split("\n").find((l) => l.trim()) || "";
  const delimiter = firstLine.includes("\t") ? "\t" : (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** Başlık satırını bulur; sütunları kalıplara göre eşler. */
export function mapColumns(rows: string[][], patterns: Record<string, RegExp>) {
  const limit = Math.min(rows.length, 15);
  let best: { index: number; map: Record<string, number>; score: number } = { index: -1, map: {}, score: 0 };
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i] || [];
    const map: Record<string, number> = {};
    Object.entries(patterns).forEach(([key, re]) => {
      const col = row.findIndex((h, c) => re.test(lower(h)) && !Object.values(map).includes(c));
      if (col >= 0) map[key] = col;
    });
    const score = Object.keys(map).length;
    if (score > best.score) best = { index: i, map, score };
  }
  return best;
}

/** "12.11.2026", "2026-11-12", Excel seri numarası → "YYYY-MM-DD" */
export function parseDay(value: unknown): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  if (/^\d{5}$/.test(v)) return new Date(Date.UTC(1899, 11, 30) + Number(v) * 86400000).toISOString().slice(0, 10);
  return null;
}

export const STEP_COLUMNS: Record<string, RegExp> = {
  title: /görev|iş kalemi|adım|başlık|yapılacak|title|task/,
  responsible: /sorumlu|rol|responsible/,
  phase: /aşama|faz|bölüm|phase|kategori/,
  description: /açıklama|detay|not|description/,
  due_date: /son tarih|termin|bitiş|tarih|due/,
  priority: /öncelik|priority/,
};
export const LEAD_COLUMNS: Record<string, RegExp> = {
  name: /^ad$|ad soyad|ad-soyad|isim|kişi|yetkili|name/,
  company: /kurum|şirket|firma|takım|kulüp|company/,
  title: /unvan|ünvan|pozisyon/,
  phone: /tel|gsm|cep|phone/,
  email: /e-?posta|mail/,
  city: /şehir|^il$|city/,
  source: /kaynak|source/,
  note: /not|açıklama|note/,
  value: /tutar|değer|bedel|value/,
  stage: /aşama|durum|stage/,
  item: /konu|ürün|hizmet|kalem|item/,
};

const PRIORITY_WORDS: Record<string, Priority> = { düşük: "low", normal: "normal", yüksek: "high", acil: "urgent", low: "low", high: "high", urgent: "urgent" };

export interface ParsedStep extends BulkStepInput {
  responsible: string;
  phase: string;
}

export function stepsFromRows(rows: string[][]): { items: ParsedStep[]; header: string[] | null } {
  const { index, map } = mapColumns(rows, STEP_COLUMNS);
  if (index < 0 || map.title == null) return { items: [], header: null };
  const items = rows
    .slice(index + 1)
    .map((r) => ({
      title: (r[map.title] || "").trim(),
      responsible: map.responsible != null ? r[map.responsible] || "" : "",
      phase: map.phase != null ? r[map.phase] || "" : "",
      description: map.description != null ? r[map.description] || "" : "",
      due_date: map.due_date != null ? parseDay(r[map.due_date]) : null,
      priority: map.priority != null ? PRIORITY_WORDS[lower(r[map.priority])] || undefined : undefined,
    }))
    .filter((s) => s.title && !/^\d+$/.test(s.title));
  return { items, header: rows[index] };
}

export interface ParsedLead {
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  city: string;
  source: string;
  note: string;
  value?: string;
  stage?: string;
  kind?: LeadKind;
  item?: string;
}

export function leadsFromRows(rows: string[][], settings: ProjectSettings, kind: LeadKind = "customer"): { items: ParsedLead[]; header: string[] | null } {
  const { index, map } = mapColumns(rows, LEAD_COLUMNS);
  if (index < 0 || (map.name == null && map.company == null)) return { items: [], header: null };
  const stageByLabel = new Map(stagesOf(settings, kind).flatMap((s) => [[lower(s.label), s.key], [s.key, s.key]] as [string, string][]));
  const pick = (r: string[], k: string) => (map[k] != null ? (r[map[k]] || "").trim() : "");
  const items = rows
    .slice(index + 1)
    .map((r) => ({
      name: pick(r, "name") || pick(r, "company"),
      company: map.name != null ? pick(r, "company") : "",
      title: pick(r, "title"),
      phone: pick(r, "phone"),
      email: pick(r, "email"),
      city: pick(r, "city"),
      source: pick(r, "source"),
      note: pick(r, "note"),
      value: pick(r, "value") || undefined,
      stage: stageByLabel.get(lower(pick(r, "stage"))) || undefined,
      ...(kind === "supplier" ? { kind, item: pick(r, "item") || undefined } : {}),
    }))
    .filter((l) => l.name);
  return { items, header: rows[index] };
}

/** Sütun tanımı: [başlık, değer okuyucu]. */
export type ExportColumn<T> = [string, (row: T) => unknown];

/** CSV metni (noktalı virgül ayraçlı: Türkçe Excel doğrudan açar). */
export function toCsv<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c[0])).join(";"), ...rows.map((r) => columns.map(([, read]) => esc(read(r))).join(";"))].join("\n");
}

const fmtStamp = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "";

export const STEP_EXPORT = (phases: Phase[], personName: (id: number | null) => string): ExportColumn<Step>[] => [
  ["Aşama", (s) => phases.find((p) => p.id === s.phase_id)?.name || ""],
  ["Görev / İş Kalemi", (s) => s.title],
  ["Ana Sorumlu Personel", (s) => s.responsible.join(" & ")],
  ["Atanan", (s) => (s.assignee_id ? personName(s.assignee_id) : "")],
  ["Durum", (s) => STEP_STATUS_META[s.status]?.label],
  ["Öncelik", (s) => PRIORITY_META[s.priority]?.label],
  ["Başlangıç", (s) => s.start_date || ""],
  ["Son tarih", (s) => s.due_date || ""],
  ["Kontrol listesi", (s) => (s.checklist.length ? `${s.checklist.filter((c) => c.done).length}/${s.checklist.length}` : "")],
  ["Sonuç / cevap", (s) => s.result],
  ["Açıklama", (s) => s.description],
];

export const LEAD_EXPORT = (settings: ProjectSettings, personName: (id: number | null) => string): ExportColumn<Lead>[] => [
  ["Ad", (l) => l.name], ["Kurum", (l) => l.company], ["Unvan", (l) => l.title], ["Telefon", (l) => prettyPhone(l.phone)],
  ["E-posta", (l) => l.email], ["Şehir", (l) => l.city], ["Kaynak", (l) => l.source], ["Aşama", (l) => stageOf(settings, l.stage).label],
  ["Değer", (l) => (l.value == null ? "" : l.value)], ["Sonraki aksiyon", (l) => fmtStamp(l.next_action_at)],
  ["Sonraki iş", (l) => l.next_action], ["Görüşme sayısı", (l) => l.contact_count],
  ["Son temas", (l) => (l.last_contact_at ? new Date(l.last_contact_at).toLocaleDateString("tr-TR") : "")],
  ["Sorumlu", (l) => (l.owner_id ? personName(l.owner_id) : "")], ["Kayıp nedeni", (l) => l.lost_reason], ["Not", (l) => l.note],
];

export const SUPPLIER_EXPORT = (settings: ProjectSettings, personName: (id: number | null) => string): ExportColumn<Lead>[] => [
  ["Tedarikçi", (l) => l.company || l.name], ["Yetkili", (l) => (l.company ? l.name : "")], ["Konu", (l) => l.item], ["Kategori", (l) => l.source],
  ["Teklif", (l) => (l.value == null ? "" : l.value)], ["Aşama", (l) => stageOf(settings, l.stage, "supplier").label], ["Telefon", (l) => prettyPhone(l.phone)],
  ["E-posta", (l) => l.email], ["Sonraki aksiyon", (l) => fmtStamp(l.next_action_at)],
  ["Sonraki iş", (l) => l.next_action], ["Sorumlu", (l) => (l.owner_id ? personName(l.owner_id) : "")], ["Not", (l) => l.note],
];

export const PORTFOLIO_EXPORT: ExportColumn<{
  name: string; company: string; category: string; status: PortfolioStatus; value: number | null; phone: string;
  email: string; city: string; start_date: string | null; project_name?: string | null; note: string;
}>[] = [
  ["Ad", (r) => r.name], ["Kurum", (r) => r.company], ["Kategori", (r) => r.category], ["Durum", (r) => PORTFOLIO_STATUS_META[r.status]?.label],
  ["Tutar", (r) => (r.value == null ? "" : r.value)], ["Telefon", (r) => prettyPhone(r.phone)], ["E-posta", (r) => r.email], ["Şehir", (r) => r.city],
  ["Başlangıç", (r) => r.start_date], ["Proje", (r) => r.project_name || ""], ["Not", (r) => r.note],
];
