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
  | "match_moment";
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
  checklist?: { id: string; text: string; done: boolean }[];
}

export const updateTodo = (id: number, body: TodoPatch) =>
  patch<{ item: TodoTask }>(`/api/todos/${id}`, body).then((data) => data.item);

export const deleteTodo = (id: number) => del<{ deleted: boolean }>(`/api/todos/${id}`);

/** Görev listesi sekmeleri (app/yonetim/gorevler.tsx). */
export type TodoListTab = "mine" | "assigned" | "done";

/** React Query anahtarları — hepsi "admin" altında: panel yenilemesi hepsini tazeler. */
export const todoKeys = {
  all: ["admin", "todos"] as const,
  list: (tab: TodoListTab) => ["admin", "todos", "list", tab] as const,
  summary: () => ["admin", "todos", "summary"] as const,
  assignees: (search: string) => ["admin", "todos", "assignees", search] as const,
  catalog: () => ["admin", "todos", "catalog"] as const,
};
