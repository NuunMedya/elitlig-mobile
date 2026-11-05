import { del, get, patch, post } from "../http";

/**
 * Yapılacaklar (yönetim görevleri) — elitlig-server routes/todos.js.
 *
 * Her kart tek bir yönetim kullanıcısına aittir; başkası atadıysa
 * `assignedBy` doludur. Durumu yalnız kartın sahibi değiştirir, içeriği
 * oluşturan kişi. Maç görevi kartları (match_duty) sistemden gelir.
 */

export type TodoStatus = "open" | "in_progress" | "done";
export type TodoKind =
  | "note"
  | "reminder"
  | "task"
  | "award_nomination"
  | "award_coordination"
  | "match_duty"
  | "match_moment"
  | "sheet_share";
export type TodoPriority = "low" | "normal" | "high";
export type TodoView = "mine" | "assigned" | "board";

export interface TodoUserRef {
  id: number;
  name: string;
}

export interface TodoTask {
  id: number;
  kind: TodoKind;
  kindLabel: string;
  title: string;
  body: string;
  status: TodoStatus;
  statusLabel: string;
  priority: TodoPriority;
  pinned: boolean;
  dueAt: string | null;
  overdue: boolean;
  match: { id: number; label: string; field?: string | null; league?: string | null; startsAt?: string | null } | null;
  team: { id: number; name: string; logo?: string | null } | null;
  player: { id: number; name: string } | null;
  dutyLabel: string | null;
  checklist: { id: string; text: string; done: boolean }[];
  labels: { text: string; color: string }[];
  source: string;
  response: string;
  owner: TodoUserRef;
  assignedBy: TodoUserRef | null;
  isSystem: boolean;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  permissions: { isOwner: boolean; canEdit: boolean; canDelete: boolean; canChangeStatus: boolean };
  /** Panodaki elle verilen sıra (yoksa null). */
  position?: number | null;
  archived?: boolean;
  /** Maç görevi aşamaları (özet). */
  workflow?: { done: number; total: number; complete: boolean; stages: TodoStage[] } | null;
  /** Maç anı kartı. */
  moment?: { category: string | null; minute: number | null; period: number | null } | null;
  /** Paylaşılan tablo kartı. */
  sheet?: { id: number; title: string | null; role: string; sharedBy: string | null } | null;
  categories?: { key: string; label: string }[];
  nominations?: { category: string | null; categoryLabel: string | null; note: string | null; player: { id: number; name: string } | null }[];
}

/** Maç görevi aşaması (elitlig-server services/todo/matchWorkflow.js). */
export interface TodoStage {
  key: string;
  label: string;
  pendingLabel?: string;
  done: boolean;
  locked?: boolean;
  lockReason?: string;
  group: "hazirlik" | "yayin" | "mac_sonu";
  link?: string;
}

export interface TodoSummary {
  open: number;
  overdue: number;
  today: number;
  assignedToMe: number;
  matchDuties: number;
}

export interface TodoAssignee {
  id: number;
  name: string;
  username: string;
  role: string;
  city: string | null;
  isSelf: boolean;
}

export interface TodoCatalog {
  canAssign: boolean;
  canOversee?: boolean;
  /** Maç personeli görevlendirme (staff.assign). */
  canAssignCrew?: boolean;
  priorities?: { key: TodoPriority; label: string }[];
  moments?: { key: string; label: string }[];
  labelColors?: string[];
}

export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  open: "Yapılacak",
  in_progress: "Sürüyor",
  done: "Tamamlandı",
};

export const TODO_PRIORITY_LABELS: Record<TodoPriority, string> = {
  low: "Düşük",
  normal: "Normal",
  high: "Yüksek",
};

export const getTodos = (view: TodoView, status: "active" | "done" | "all" = "active") =>
  get<{ items: TodoTask[] }>("/api/todos", { view, status }).then((data) => data.items ?? []);

export const getTodoSummary = () => get<TodoSummary>("/api/todos/summary");

export const getTodoCatalog = () => get<TodoCatalog>("/api/todos/catalog");

export const getTodoAssignees = (search?: string) =>
  get<{ items: TodoAssignee[] }>("/api/todos/assignees", { search }).then((data) => data.items ?? []);

export interface TodoCreateInput {
  kind: "note" | "reminder" | "task";
  title: string;
  body?: string;
  priority?: TodoPriority;
  /** ISO tarih ya da "YYYY-MM-DD" (gün sonu kabul edilir). */
  due_at?: string | null;
  assignee_ids?: number[];
  /** Panoda sütuna eklerken başlangıç durumu (yalnız kendine). */
  status?: TodoStatus;
  labels?: { text: string; color: string }[];
  checklist?: { text: string }[];
  player_id?: number | null;
  team_id?: number | null;
  match_id?: number | null;
}

export const createTodo = (input: TodoCreateInput) =>
  post<{ items: TodoTask[] }>("/api/todos", input).then((data) => data.items ?? []);

export interface TodoPatch {
  status?: TodoStatus;
  response?: string;
  pinned?: boolean;
  archived?: boolean;
  title?: string;
  body?: string;
  priority?: TodoPriority;
  due_at?: string | null;
  checklist?: { id?: string; text: string; done: boolean }[];
  labels?: { text: string; color: string }[];
  player_id?: number | null;
  team_id?: number | null;
  match_id?: number | null;
  /** Maç görevi: takımın gol müziği bağlantısı. */
  goal_music?: { team_id: number; url: string };
}

export const updateTodo = (id: number, body: TodoPatch) =>
  patch<{ item: TodoTask }>(`/api/todos/${id}`, body).then((data) => data.item);

export const deleteTodo = (id: number) => del<{ deleted: boolean }>(`/api/todos/${id}`);

/* ═══════════════ PANO (app/yonetim/gorev-panosu.tsx) ═══════════════ */

/** Panonun tüm kartları: kendi kartlarım, bana atananlar, atadıklarım, sistem kartları ve son 30 günün bitenleri. */
export const getBoardTodos = () => get<{ items: TodoTask[] }>("/api/todos", { view: "board" }).then((data) => data.items ?? []);

/** Sütun sırası ve durum: { status, ids (sütunun yeni sırası), moved_id }. */
export const reorderTodos = (body: { status: TodoStatus; ids: number[]; moved_id?: number | null }) =>
  post<{ items: TodoTask[] }>("/api/todos/reorder", body).then((data) => data.items ?? []);

/** Tamamlanan kendi kartlarımı panodan kaldırır. */
export const archiveDoneTodos = () => post<{ message: string; archived: number }>("/api/todos/archive-done");

/** Bağlantı araması: type = player | team | match. */
export const lookupTodoLink = (type: "player" | "team" | "match", q: string) =>
  get<{ items: { id: number; label: string; sub?: string | null }[] }>("/api/todos/lookup", { type, q }).then((data) => data.items ?? []);

export interface TodoOverviewPerson {
  user: { id: number; name: string; role: string; city: string | null };
  counts: { open: number; in_progress: number; done: number; overdue: number; total: number; active: number; lastDoneAt: string | null };
}

export interface TodoOverview {
  city: { id: number | null; name: string } | null;
  nationwide: boolean;
  cities: { id: number; name: string }[];
  people: TodoOverviewPerson[];
  totals: { active: number; done: number; overdue: number; total: number };
  items: TodoTask[];
}

/** Ekip takibi (todos.oversee): status = active | overdue | done | all. */
export const getTodoOverview = (params: { city_id?: number | null; user_id?: number | null; status?: string }) =>
  get<TodoOverview>("/api/todos/overview", {
    city_id: params.city_id ?? undefined,
    user_id: params.user_id ?? undefined,
    status: params.status,
  });

export interface TodoDeskTeam {
  side: string;
  teamId: number | null;
  name: string;
  logo: string | null;
  contact: { name: string; phone: string; phone2: string; whatsapp: string; email: string; source: "yonetim" | "yetkili" } | null;
  hasManagerAccount: boolean;
  rosterCount: number;
  rosterReportedAt: string | null;
  goalMusic: { url: string; title?: string | null; label?: string | null; source?: string } | null;
  goalMusicRequestedAt: string | null;
  lineupRequest: { at: string; member: boolean } | null;
}

export interface TodoDesk {
  match: { id: number; status: string | null; score: string | null; streamUrl: string | null };
  teams: TodoDeskTeam[];
  stages: TodoStage[];
  done: number;
  total: number;
  liveUnlocked: boolean;
  lockReason: string | null;
  canAssignCrew?: boolean;
}

/** Maç görevi kartının maç masası. */
export const getTodoDesk = (id: number) => get<{ item: TodoTask; desk: TodoDesk }>(`/api/todos/${id}/desk`);

export const requestGoalMusic = (id: number, teamId: number) =>
  post<{ message: string; item: TodoTask; desk: TodoDesk }>(`/api/todos/${id}/goal-music-request`, { team_id: teamId });

export const requestLineup = (id: number, teamId: number) =>
  post<{ message: string; member: boolean; item: TodoTask; desk: TodoDesk }>(`/api/todos/${id}/lineup-request`, { team_id: teamId });

/** Görev listesi sekmeleri (app/yonetim/gorevler.tsx). */
export type TodoListTab = "mine" | "assigned" | "done";

/** React Query anahtarları — hepsi "admin" altında: panel yenilemesi hepsini tazeler. */
export const todoKeys = {
  all: ["admin", "todos"] as const,
  list: (tab: TodoListTab) => ["admin", "todos", "list", tab] as const,
  summary: () => ["admin", "todos", "summary"] as const,
  assignees: (search: string) => ["admin", "todos", "assignees", search] as const,
  catalog: () => ["admin", "todos", "catalog"] as const,
  board: () => ["admin", "todos", "board"] as const,
  overview: (params: Record<string, unknown>) => ["admin", "todos", "overview", params] as const,
  desk: (id: number) => ["admin", "todos", "desk", id] as const,
};
