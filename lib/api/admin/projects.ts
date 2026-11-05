import { del, get, patch, post, put } from "../../http";

/**
 * Araçlar → Projeler uçları (/api/tools/projects).
 *
 * Kaynak: elitlig-server routes/toolProjects.js + services/toolProjects.js
 * (dispatch → ROUTES) ve web istemcisi src/api/projectsApi.js. Alan adları
 * sunucu serileştiricilerinden (serializeProject, serializeStep, serializeLead
 * …) birebir alınmıştır. Uçlar yalnız yönetim rollerine açıktır; proje içi
 * düzenleme yetkisi `item.access.can_edit` ile gelir (izleyici üye salt okur).
 */

const BASE = "/api/tools/projects";

/* ============================== türler ============================== */

export type ProjectStatus = "planning" | "active" | "on_hold" | "done" | "cancelled";
export type StepStatus = "todo" | "doing" | "waiting" | "blocked" | "done" | "skipped";
export type Priority = "low" | "normal" | "high" | "urgent";
export type QuestionStatus = "open" | "answered" | "closed";
export type ActivityType = "call" | "whatsapp" | "email" | "meeting" | "visit" | "sms" | "note" | "status" | "system";
export type LeadKind = "customer" | "supplier";
export type PortfolioStatus = "active" | "passive" | "renewal";
export type EntryStatus = "planned" | "pending" | "paid" | "cancelled";
export type EntryType = "income" | "expense";
export type ProjectTool =
  | "leads" | "suppliers" | "finance" | "questions" | "portfolio" | "activity"
  | "todos" | "agenda" | "notes" | "sheets" | "accounting" | "contacts" | "calc" | "focus";

export interface LeadStage {
  key: string;
  label: string;
  color: string;
  won?: boolean;
  lost?: boolean;
}

export interface LeadOutcome {
  key: string;
  label: string;
  stage?: string;
  next_days?: number;
}

export interface ProjectRole {
  name: string;
  user_id: number | null;
  person: string | null;
}

export interface ProjectSettings {
  lead_stages: LeadStage[];
  outcomes: LeadOutcome[];
  supplier_stages: LeadStage[];
  supplier_outcomes: LeadOutcome[];
  supplier_categories: string[];
  finance_categories: string[];
  roles: ProjectRole[];
  portfolio_categories: string[];
  lead_sources: string[];
  question_categories: string[];
  default_account_id: number | null;
}

export interface ProjectAccess {
  role: "owner" | "editor" | "viewer";
  can_edit: boolean;
  is_owner: boolean;
}

export interface StepStatsSummary {
  total: number;
  done: number;
  skipped: number;
  overdue: number;
  by_status: Record<string, number>;
  progress: number;
}

export interface LeadStatsSummary {
  total: number;
  won: number;
  lost: number;
  open: number;
  due: number;
  by_stage: Record<string, number>;
  won_value: number;
  pipeline_value: number;
}

export interface FinanceTotals {
  planned_income: number;
  planned_expense: number;
  pending_income: number;
  pending_expense: number;
  paid_income: number;
  paid_expense: number;
  estimate_income: number;
  estimate_expense: number;
  estimate_net: number;
  paid_net: number;
  open_income: number;
  open_expense: number;
}

export interface ProjectListStats {
  steps: StepStatsSummary;
  leads: LeadStatsSummary;
  suppliers?: LeadStatsSummary;
  finance?: FinanceTotals | null;
  open_questions: number;
  portfolio: number;
  mine?: number;
  next_due?: { id: number; title: string; due_date: string; overdue: boolean } | null;
}

export interface Project {
  id: number;
  owner_id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
  icon: string;
  start_date: string | null;
  end_date: string | null;
  template_key: string | null;
  archived: boolean;
  settings: ProjectSettings;
  created_at: string | null;
  updated_at: string | null;
  access?: ProjectAccess;
  owner_name?: string | null;
  member_count?: number;
  stats?: ProjectListStats;
}

export interface Phase {
  id: number;
  project_id: number;
  name: string;
  color: string;
  note: string;
  position: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface StepLink {
  label: string;
  url: string;
}

export interface Step {
  id: number;
  project_id: number;
  phase_id: number | null;
  title: string;
  description: string;
  result: string;
  responsible: string[];
  assignee_id: number | null;
  status: StepStatus;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  done_at: string | null;
  position: number;
  tool: ProjectTool | null;
  tool_ref: string | null;
  links: StepLink[];
  checklist: ChecklistItem[];
  updated_at: string | null;
}

export interface Question {
  id: number;
  project_id: number;
  step_id: number | null;
  lead_id: number | null;
  question: string;
  answer: string;
  status: QuestionStatus;
  priority: Priority;
  category: string | null;
  due_date: string | null;
  asked_by: number | null;
  answered_by: number | null;
  answered_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Lead {
  id: number;
  project_id: number;
  kind: LeadKind;
  item: string;
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  city: string;
  source: string;
  stage: string;
  value: number | null;
  tags: string;
  note: string;
  owner_id: number | null;
  next_action_at: string | null;
  next_action: string;
  last_contact_at: string | null;
  contact_count: number;
  won_at: string | null;
  lost_reason: string;
  portfolio_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Activity {
  id: number;
  project_id: number;
  lead_id: number | null;
  step_id: number | null;
  type: ActivityType;
  outcome: string | null;
  note: string;
  occurred_at: string | null;
  next_action_at: string | null;
  created_by: number | null;
  created_at: string | null;
}

export interface PortfolioItem {
  id: number;
  owner_id: number;
  project_id: number | null;
  lead_id: number | null;
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  city: string;
  category: string;
  value: number | null;
  status: PortfolioStatus;
  start_date: string | null;
  tags: string;
  note: string;
  created_at: string | null;
  updated_at: string | null;
  /** Yalnız genel portföy listesinde. */
  project_name?: string | null;
  project_color?: string | null;
  can_edit?: boolean;
}

export interface ProjectMember {
  user_id: number;
  role: "editor" | "viewer";
  name: string | null;
}

export interface Person {
  id: number;
  name: string;
  username?: string;
  role?: string;
  city?: string | null;
  me?: boolean;
}

export interface ProjectDetail {
  item: Project;
  phases: Phase[];
  steps: Step[];
  questions: Question[];
  leads: Lead[];
  activities: Activity[];
  portfolio: PortfolioItem[];
  members: ProjectMember[];
  people: Record<string, Person>;
}

export interface Template {
  key: string;
  id: number | null;
  name: string;
  description: string;
  icon: string;
  color: string;
  builtin: boolean;
  phase_count: number;
  step_count: number;
  phases: string[];
  roles: string[];
}

export interface FollowupLead extends Lead {
  project_name?: string;
  project_color?: string;
  stage_label?: string;
}
export interface FollowupStep extends Step {
  project_name?: string;
  project_color?: string;
}
export interface FollowupQuestion extends Question {
  project_name?: string;
  project_color?: string;
}
export interface Followups {
  leads: FollowupLead[];
  steps: FollowupStep[];
  questions: FollowupQuestion[];
}

export interface FinanceEntry {
  id: number;
  type: EntryType;
  amount: number | null;
  estimate: number | null;
  effective: number;
  status: EntryStatus;
  entry_date: string | null;
  due_date: string | null;
  paid_date: string | null;
  category: string | null;
  party: string | null;
  description: string | null;
  document_no: string | null;
  note: string | null;
  account_id: number | null;
  account_name?: string | null;
  lead_id: number | null;
  step_id: number | null;
  lead_name?: string | null;
  step_title?: string | null;
  can_edit?: boolean;
}

export interface FinanceAccount {
  id: number;
  name: string;
  scope: string;
  kind?: string;
  color?: string | null;
  balance?: number | null;
}

export interface ProjectFinance {
  items: FinanceEntry[];
  totals: FinanceTotals;
  accounts: FinanceAccount[];
  default_account_id: number | null;
  can_edit: boolean;
}

export interface DirectoryRow {
  source: "contacts" | "members" | "portfolio";
  ref_id: number;
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  city: string;
  category: string;
  in_project: number | null;
}

export interface DirectoryResult {
  items: DirectoryRow[];
  has_more: boolean;
  sources: { key: string; label: string; available: boolean }[];
}

export type ItemKind = "phases" | "steps" | "questions" | "leads" | "activities";

/* ============================== uçlar ============================== */

export const projectKeys = {
  all: ["admin", "projects"] as const,
  list: (archived: boolean) => ["admin", "projects", "list", archived ? "all" : "0"] as const,
  followups: (days: number) => ["admin", "projects", "followups", days] as const,
  portfolio: ["admin", "projects", "portfolio"] as const,
  templates: ["admin", "projects", "templates"] as const,
  people: ["admin", "projects", "people"] as const,
  detail: (id: number) => ["admin", "projects", "detail", id] as const,
  lead: (id: number, leadId: number) => ["admin", "projects", "detail", id, "lead", leadId] as const,
  finance: (id: number) => ["admin", "projects", "detail", id, "finance"] as const,
  directory: (id: number) => ["admin", "projects", "detail", id, "directory"] as const,
};

/** archived: "0" (varsayılan) | "1" | "all" */
export const listProjects = (archived: "0" | "1" | "all" = "0") =>
  get<{ items: Project[] }>(BASE, { archived });

export interface ProjectInput {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  color?: string;
  icon?: string;
  start_date?: string | null;
  end_date?: string | null;
  template?: string | null;
  archived?: boolean;
  settings?: Partial<ProjectSettings>;
  move_stage_to?: string;
  move_supplier_stage_to?: string;
}

export const createProject = (body: ProjectInput) =>
  post<{ item: Project; created: { phases: number; steps: number } }>(BASE, body);
export const listTemplates = () => get<{ items: Template[] }>(`${BASE}/templates`);
export const saveTemplate = (body: { project_id: number; name: string; description?: string | null }) =>
  post<{ item: Template }>(`${BASE}/templates`, body);
export const removeTemplate = (key: string) => del<{ ok: boolean }>(`${BASE}/templates/${encodeURIComponent(key)}`);
export const listPeople = (q?: string) => get<{ items: Person[] }>(`${BASE}/people`, q ? { q } : undefined);
export const getFollowups = (days: number) => get<Followups>(`${BASE}/followups`, { days });

export const listPortfolio = () =>
  get<{ items: PortfolioItem[]; categories: string[] }>(`${BASE}/portfolio`);
export const createPortfolio = (body: Partial<PortfolioItem>) => post<{ item: PortfolioItem }>(`${BASE}/portfolio`, body);
export const updatePortfolio = (pid: number, body: Partial<PortfolioItem>) =>
  patch<{ item: PortfolioItem }>(`${BASE}/portfolio/${pid}`, body);
export const removePortfolio = (pid: number) => del<{ ok: boolean }>(`${BASE}/portfolio/${pid}`);

export const getProject = (id: number) => get<ProjectDetail>(`${BASE}/${id}`);
export const updateProject = (id: number, body: ProjectInput) => patch<{ item: Project }>(`${BASE}/${id}`, body);
export const removeProject = (id: number) => del<{ ok: boolean }>(`${BASE}/${id}`);
export const setProjectMembers = (id: number, members: { user_id: number; role: string }[]) =>
  put<{ members: ProjectMember[] }>(`${BASE}/${id}/members`, { members });
export const leaveProject = (id: number) => del<{ ok: boolean }>(`${BASE}/${id}/members/me`);
export const duplicateProject = (id: number, body: { name?: string } = {}) =>
  post<{ item: Project; created: { phases: number; steps: number } }>(`${BASE}/${id}/duplicate`, body);
/** Dizideki sıra = konum. */
export const reorderProject = (id: number, body: { phases?: number[]; steps?: { id: number; phase_id: number | null }[] }) =>
  post<{ ok: boolean }>(`${BASE}/${id}/reorder`, body);

export interface BulkStepInput {
  title: string;
  responsible?: string;
  phase?: string;
  description?: string;
  due_date?: string | null;
  priority?: Priority;
}
export const bulkSteps = (id: number, body: { phase_id: number | null; items: BulkStepInput[] }) =>
  post<{ created: number }>(`${BASE}/${id}/steps/bulk`, body);
export const bulkLeads = (id: number, body: { items: Record<string, unknown>[]; kind?: LeadKind }) =>
  post<{ created: number; skipped: number }>(`${BASE}/${id}/leads/bulk`, body);

export const getLeadDetail = (id: number, leadId: number) =>
  get<{ item: Lead; activities: Activity[]; questions: Question[] }>(`${BASE}/${id}/leads/${leadId}`);

export interface CloseLeadInput {
  portfolio?: boolean;
  category?: string | null;
  value?: number | null;
  start_date?: string | null;
  note?: string;
  entry?:
    | false
    | {
        amount: number;
        account_id: number | null;
        status: EntryStatus;
        due_date?: string | null;
        category?: string | null;
        description?: string | null;
      };
}
export interface CloseLeadResult {
  lead: Lead;
  portfolio: PortfolioItem | null;
  entry: (FinanceEntry & { account_name?: string | null }) | null;
}
export const closeLead = (id: number, leadId: number, body: CloseLeadInput) =>
  post<CloseLeadResult>(`${BASE}/${id}/leads/${leadId}/close`, body);

export const getProjectFinance = (id: number) => get<ProjectFinance>(`${BASE}/${id}/finance`);
export interface EntryInput {
  type: EntryType;
  amount: number | null;
  estimate: number | null;
  status: EntryStatus;
  entry_date?: string | null;
  due_date?: string | null;
  paid_date?: string | null;
  category?: string | null;
  party?: string | null;
  description?: string | null;
  document_no?: string | null;
  note?: string | null;
  account_id: number | null;
  lead_id?: number | null;
  step_id?: number | null;
}
export const createEntry = (id: number, body: EntryInput) =>
  post<{ item: FinanceEntry }>(`${BASE}/${id}/finance`, body);
export const updateEntry = (id: number, eid: number, body: Partial<EntryInput>) =>
  patch<{ item: FinanceEntry }>(`${BASE}/${id}/finance/${eid}`, body);
export const removeEntry = (id: number, eid: number) => del<{ ok: boolean }>(`${BASE}/${id}/finance/${eid}`);

export const getDirectory = (
  id: number,
  params: { source: string; kind: LeadKind; q?: string; category?: string; page?: number }
) => get<DirectoryResult>(`${BASE}/${id}/directory`, params);
export const importDirectory = (
  id: number,
  body: { items: { source: string; ref_id: number }[]; kind: LeadKind; stage?: string }
) => post<{ created: number; skipped: number }>(`${BASE}/${id}/directory/import`, body);

export const createItem = <T>(id: number, kind: ItemKind, body: Record<string, unknown>) =>
  post<{ item: T; lead?: Lead }>(`${BASE}/${id}/${kind}`, body);
export const updateItem = <T>(id: number, kind: ItemKind, itemId: number, body: Record<string, unknown>) =>
  patch<{ item: T }>(`${BASE}/${id}/${kind}/${itemId}`, body);
/** Aşama silinirken: { move_to } ya da { delete_steps: "1" } sorgu parametresi. */
export const removeItem = (id: number, kind: ItemKind, itemId: number, params?: Record<string, string>) =>
  del<{ ok: boolean }>(`${BASE}/${id}/${kind}/${itemId}`, undefined, params ? { params } : undefined);

/** Ajanda (Araçlar → /api/tools/events): kişinin sonraki aksiyonu takvime. */
export const createAgendaEvent = (body: {
  title: string;
  description?: string;
  category: string;
  all_day: boolean;
  start_at: string;
  end_at: string;
  recurrence: string;
  remind_minutes: number;
}) => post<{ item: unknown }>("/api/tools/events", body);
