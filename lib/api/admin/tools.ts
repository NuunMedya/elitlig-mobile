import { del, get, patch, post } from "../../http";

/**
 * ARAÇLAR — kişisel Not Defteri, Ajanda ve Araçlar Merkezi özeti.
 *
 * Sunucu: elitlig-server routes/tools.js + services/personalTools.js.
 *   GET    /api/tools/overview                 → hub özeti
 *   GET    /api/tools/notes?archived=0|1|all    → { items }
 *   GET    /api/tools/events?from=&to=&todos=0  → { items (açılmış tekrarlar), todos }
 *   POST   /api/tools/:tool                     → { item }
 *   PATCH  /api/tools/:tool/:id                 → { item }
 *   DELETE /api/tools/:tool/:id
 *
 * Kayıtlar yalnız sahibine görünür; ayrı bir yetki gerekmez (yönetim rolü yeter).
 * Muhasebe, rehber ve tablo uçları başka modüllerin dosyalarındadır; burada
 * yalnız hub'ın okuduğu özet sayılar var.
 */

/* ═══════════════════════════ NOT DEFTERİ ═══════════════════════════ */

export type NoteKind = "text" | "checklist";

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface ToolNote {
  id: number;
  kind: NoteKind;
  title: string | null;
  body: string | null;
  checklist: ChecklistItem[];
  tags: string[];
  /** "#rrggbb" ya da null (renksiz). */
  color: string | null;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteInput {
  kind?: NoteKind;
  title?: string | null;
  body?: string | null;
  checklist?: ChecklistItem[];
  tags?: string[];
  color?: string | null;
  pinned?: boolean;
  archived?: boolean;
}

export const listNotes = (archived: "0" | "1" | "all" = "0") =>
  get<{ items: ToolNote[] }>("/api/tools/notes", { archived }).then((d) => d.items ?? []);

export const createNote = (input: NoteInput) =>
  post<{ item: ToolNote }>("/api/tools/notes", input).then((d) => d.item);

export const updateNote = (id: number, input: NoteInput) =>
  patch<{ item: ToolNote }>(`/api/tools/notes/${id}`, input).then((d) => d.item);

export const deleteNote = (id: number) => del<{ ok: boolean; id: number }>(`/api/tools/notes/${id}`);

/** Notun düz metni (kopyalama ve paylaşım için). */
export function noteText(note: Pick<ToolNote, "title" | "body" | "checklist">): string {
  return [note.title, note.body, ...(note.checklist ?? []).map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`)]
    .filter(Boolean)
    .join("\n");
}

/** Tüm notlar Markdown olarak (web "Dışa aktar" ile aynı biçim). */
export function notesToMarkdown(notes: ToolNote[]): string {
  return notes
    .map((note) => {
      const lines = [`## ${note.title || "Başlıksız not"}`];
      if (note.tags?.length) lines.push(note.tags.map((tag) => `#${tag}`).join(" "));
      if (note.body) lines.push("", note.body);
      if (note.checklist?.length) lines.push("", ...note.checklist.map((item) => `- [${item.done ? "x" : " "}] ${item.text}`));
      return lines.join("\n");
    })
    .join("\n\n---\n\n");
}

/* ═══════════════════════════ AJANDA ═══════════════════════════ */

export type EventCategory = "general" | "match" | "meeting" | "training" | "deadline" | "personal" | "payment";
export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface ToolEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  category: EventCategory;
  color: string | null;
  all_day: boolean;
  start_at: string;
  end_at: string | null;
  recurrence: Recurrence;
  /** "YYYY-MM-DD" ya da null (süresiz). */
  repeat_until: string | null;
  remind_minutes: number | null;
}

/** Takvimde görünen tek kayıt: etkinliğin bir tekrarı ya da son tarihli Yapılacak kartı. */
export interface AgendaOccurrence extends Partial<ToolEvent> {
  id: number;
  title: string;
  occurrence_key: string;
  occurrence_start: string;
  occurrence_end: string | null;
  all_day: boolean;
  category: EventCategory;
  source: "event" | "todo";
  /** Yalnız Yapılacak kartlarında. */
  priority?: string;
  status?: string;
}

export interface EventInput {
  title: string;
  description: string | null;
  location: string | null;
  category: EventCategory;
  color: string | null;
  all_day: boolean;
  start_at: string;
  end_at: string | null;
  recurrence: Recurrence;
  repeat_until: string | null;
  remind_minutes: number | null;
}

export interface EventsResponse {
  from: string;
  to: string;
  items: AgendaOccurrence[];
  todos: AgendaOccurrence[];
}

/** Aralık en fazla 400 gün (sunucu sınırı). */
export const listEvents = (from: Date, to: Date, withTodos = true) =>
  get<EventsResponse>("/api/tools/events", {
    from: from.toISOString(),
    to: to.toISOString(),
    todos: withTodos ? undefined : "0",
  }).then((d) => ({ ...d, items: d.items ?? [], todos: d.todos ?? [] }));

export const createEvent = (input: EventInput) =>
  post<{ item: ToolEvent }>("/api/tools/events", input).then((d) => d.item);

export const updateEvent = (id: number, input: Partial<EventInput>) =>
  patch<{ item: ToolEvent }>(`/api/tools/events/${id}`, input).then((d) => d.item);

export const deleteEvent = (id: number) => del<{ ok: boolean; id: number }>(`/api/tools/events/${id}`);

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  general: "Genel",
  match: "Maç",
  meeting: "Toplantı",
  training: "Antrenman",
  deadline: "Son tarih",
  payment: "Ödeme",
  personal: "Kişisel",
};

/** Web'deki sıra (Genel, Maç, Toplantı, Antrenman, Son tarih, Ödeme, Kişisel). */
export const EVENT_CATEGORIES: EventCategory[] = ["general", "match", "meeting", "training", "deadline", "payment", "personal"];

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "Tekrarlanmaz",
  daily: "Her gün",
  weekly: "Her hafta",
  monthly: "Her ay",
  yearly: "Her yıl",
};

export const RECURRENCES: Recurrence[] = ["none", "daily", "weekly", "monthly", "yearly"];

/** Hatırlatma seçenekleri (dakika; "" = yok). */
export const REMINDER_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "Hatırlatma yok" },
  { key: "0", label: "Başladığında" },
  { key: "10", label: "10 dk önce" },
  { key: "30", label: "30 dk önce" },
  { key: "60", label: "1 saat önce" },
  { key: "1440", label: "1 gün önce" },
];

/* ═══════════════════════════ ARAÇLAR MERKEZİ ═══════════════════════════ */

export interface ToolsOverview {
  upcoming: AgendaOccurrence[];
  notes: ToolNote[];
  counts: { notes: number; contacts: number; sheets: number };
  ledger: { income: number; expense: number; net: number; receivable: number; payable: number; overdue: number };
}

export const getToolsOverview = () => get<ToolsOverview>("/api/tools/overview");

/** Hub kartı için proje özetleri (GET /api/tools/projects, istatistikli). */
export interface ProjectSummary {
  id: number;
  name: string;
  stats?: { steps?: { overdue?: number }; leads?: { due?: number } };
}

export const getProjectSummaries = () =>
  get<{ items: ProjectSummary[] }>("/api/tools/projects", { archived: "0" }).then((d) => d.items ?? []);

/** React Query anahtarları — hepsi "admin" altında. */
export const toolKeys = {
  all: ["admin", "tools"] as const,
  overview: () => ["admin", "tools", "overview"] as const,
  projects: () => ["admin", "tools", "projects-summary"] as const,
  notes: (archived: boolean) => ["admin", "tools", "notes", archived ? "1" : "0"] as const,
  notesAll: () => ["admin", "tools", "notes"] as const,
  events: (from: string, to: string) => ["admin", "tools", "events", from, to] as const,
  eventsAll: () => ["admin", "tools", "events"] as const,
};
