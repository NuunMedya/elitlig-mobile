import { del, get, post, put } from "../../http";

/**
 * MAÇ DEĞERLENDİRMELERİ — routes/adminEvaluations.js (/api/admin/evaluations)
 *
 * Web: pages/management/evaluations/*. Maç başına hakem, spiker, reji,
 * fotoğrafçı, sağlıkçı, call center; hafta başına sosyal medya formları.
 * Soru ve tutarlar "Sorular ve Ücretler"de tanımlanır (evaluations.manage).
 *
 * Önizleme hesabı sunucudakiyle (services/evaluations/scoring.js) aynıdır:
 *   Yapıldı = 10, Yapılmadı = 0, puan = kendisi, Uygulanamaz = hesaba girmez
 *   skor = Σ(ağırlık × puan) / Σ(ağırlık × 10) × 100
 *   hakediş = taban ücret + soru tutarları + skor eşiği tutarı
 */

const BASE = "/api/admin/evaluations";

export type AnswerType = "yes_no" | "score";

export interface EvalArea {
  key: string;
  label: string;
  period: "match" | "week";
  duty?: string | null;
  icon?: string;
}

export interface ScoreRule {
  min: number;
  max: number;
  amount: number;
}

export interface EvalQuestion {
  id: number;
  area: string;
  text: string;
  help?: string | null;
  category?: string | null;
  weight: number;
  allowNa: boolean;
  answerType: AnswerType;
  yesAmount: number;
  noAmount: number;
  scoreRules: ScoreRule[];
  sortOrder?: number;
  status: "active" | "archived" | string;
}

export interface AreaSetting {
  baseFee: number;
  scoreRules: ScoreRule[];
}

export interface EvalAnswer {
  questionId: number;
  text: string;
  category?: string | null;
  type: AnswerType;
  value: boolean | number | null;
  na?: boolean;
  points?: number | null;
  amount?: number;
  comment?: string | null;
}

export interface Evaluation {
  id: number;
  staffId: number;
  staffName: string | null;
  scorePct: number | null;
  failCount: number;
  bonus: number;
  deduction: number;
  net: number;
  baseFee: number;
  payout: number;
  areaAmount: number;
  note?: string | null;
  evaluatorName?: string | null;
  updatedAt?: string | null;
  answers: EvalAnswer[];
}

export interface EvalStaffOption {
  id: number;
  fullName: string;
  status?: string;
}

export interface MatchListItem {
  id: number;
  label: string;
  day: string | null;
  time: string | null;
  field?: string | null;
  league?: string | null;
  season?: string | null;
  city?: string | null;
  areas: Record<string, { id: number; staffId: number; staffName: string | null; scorePct: number | null; net: number; failCount: number }>;
  doneCount: number;
  areaCount: number;
  averageScore: number | null;
  net: number;
}

export interface MatchListResponse {
  items: MatchListItem[];
  areas: EvalArea[];
  summary: { matchCount: number; slots: number; done: number; coveragePct: number | null; completeCount: number; untouchedCount: number } | null;
}

export interface MatchDetailArea extends EvalArea {
  assignedStaffId: number | null;
  assignedStaffName?: string | null;
  questions: EvalQuestion[];
  evaluation: Evaluation | null;
  setting?: AreaSetting | null;
}

export interface MatchDetail {
  match: {
    id: number;
    day: string | null;
    time: string | null;
    homeTeam: string | null;
    awayTeam: string | null;
    city?: string | null;
    league?: string | null;
    season?: string | null;
    field?: string | null;
  };
  staff: EvalStaffOption[];
  areas: MatchDetailArea[];
}

export interface WeekItem {
  weekStart: string;
  label: string;
  current?: boolean;
  evaluations: { id: number; staffId: number; staffName: string | null; scorePct: number | null; net: number }[];
  averageScore: number | null;
  net: number;
}

export interface WeekDetail {
  week: { weekStart: string; label: string };
  staff: EvalStaffOption[];
  areas: (EvalArea & { questions: EvalQuestion[]; evaluations: Evaluation[]; setting?: AreaSetting | null })[];
}

export interface StaffRankRow {
  staffId: number;
  name: string;
  rank: number;
  averageScore: number | null;
  change: number | null;
  evaluationCount: number;
  failCount: number;
  net: number;
  bonus: number;
  deduction: number;
  payout: number;
  areas: { area: string; label: string; averageScore?: number | null; evaluationCount?: number }[];
  trend?: (number | null)[];
}

export interface RecentRow {
  id: number;
  periodDate: string;
  label: string;
  matchId?: number | null;
  areaLabel: string;
  staffId: number;
  staffName: string | null;
  scorePct: number | null;
  failCount: number;
  bonus: number;
  deduction: number;
  net: number;
  baseFee: number;
  payout: number;
  evaluatorName?: string | null;
  note?: string | null;
}

export interface Analysis {
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  areas: EvalArea[];
  totals: {
    averageScore: number | null;
    evaluationCount: number;
    staffCount: number;
    failRate: number | null;
    failCount: number;
    bonus: number;
    deduction: number;
    net: number;
    baseFee: number;
    payout: number;
    change: { averageScore: number | null; failRate: number | null; net: number | null };
  };
  coverage: {
    matchCount: number;
    slots: number;
    done: number;
    coveragePct: number | null;
    weekCount: number;
    weeksDone: number;
    pendingMatches: { id: number; label: string; day: string | null; doneCount: number; areaCount: number }[];
  };
  trend: { label: string; title?: string; averageScore: number | null; count: number }[];
  byArea: { area: string; label: string; averageScore: number | null; change: number | null; evaluationCount: number; failRate: number | null; net: number }[];
  byStaff: StaffRankRow[];
  byCategory: { category: string; successPct: number | null; answered: number; failCount: number }[];
  byQuestion: {
    questionId: number;
    text: string;
    areaLabel: string;
    category?: string | null;
    type: AnswerType;
    answered: number;
    yesRate?: number | null;
    averageScore?: number | null;
    successPct: number | null;
    topFailers: { staffId: number; name: string; count: number }[];
    comments: { text: string; staffName?: string | null }[];
  }[];
  recent: RecentRow[];
}

export interface StaffCard {
  staff: { id: number; fullName: string };
  range: { from: string; to: string };
  summary: {
    averageScore: number | null;
    peerAverage: number | null;
    gap: number | null;
    rank: number | null;
    peerCount: number;
    failRate: number | null;
    failCount: number;
    evaluationCount: number;
    bonus: number;
    deduction: number;
    net: number;
    baseFee: number;
    payout: number;
    previous: { averageScore: number | null };
    change: { averageScore: number | null; failRate: number | null };
  };
  byArea: { area: string; label: string; averageScore: number | null; peerAverage: number | null; gap: number | null; evaluationCount: number }[];
  strengths: { questionId: number; text: string; areaLabel: string; answered: number; failCount: number; successPct: number | null; peerSuccessPct: number | null }[];
  weaknesses: StaffCard["strengths"];
  byCategory: Analysis["byCategory"];
  notes: { id: number; date: string; label: string; note: string }[];
  history: (RecentRow & { answers: EvalAnswer[] })[];
}

export interface CompareRow {
  id?: number;
  cityId?: number;
  name: string;
  rank: number;
  index: number | null;
  averageScore: number | null;
  change: number | null;
  coveragePct: number | null;
  evaluationCount: number;
  matchCount: number;
  failRate: number | null;
  net: number;
  payout: number;
  staffCount: number;
  leagueName?: string | null;
  city?: string | null;
}

export interface FilterScope {
  cityId?: string;
  leagueId?: string;
  seasonId?: string;
}

const scopeParams = (f: FilterScope = {}) => ({
  cityId: f.cityId || undefined,
  leagueId: f.leagueId || undefined,
  seasonId: f.seasonId || undefined,
});

/* ───────────────────────────── uçlar ───────────────────────────── */

export const getEvalMeta = () =>
  get<{ areas: EvalArea[]; suggestedCategories?: string[] }>(`${BASE}/meta`);

export const listQuestions = (includeArchived = true) =>
  get<{ items: EvalQuestion[] }>(`${BASE}/questions`, { includeArchived: includeArchived ? 1 : undefined }).then((d) => d.items ?? []);

export type QuestionPayload = Omit<EvalQuestion, "id" | "status" | "sortOrder"> & { status?: string };

export const createQuestion = (body: QuestionPayload) => post<{ message: string; item: EvalQuestion }>(`${BASE}/questions`, body);
export const updateQuestion = (id: number, body: Partial<QuestionPayload>) => put<{ message: string; item: EvalQuestion }>(`${BASE}/questions/${id}`, body);
export const deleteQuestion = (id: number) => del<{ message: string; archived?: boolean }>(`${BASE}/questions/${id}`);
export const reorderQuestions = (area: string, ids: number[]) => put<{ items: EvalQuestion[] }>(`${BASE}/questions/order`, { area, ids });
export const seedStarterQuestions = (area: string) => post<{ message: string }>(`${BASE}/questions/starter`, { area });
export const listCategories = () => get<{ items: string[] }>(`${BASE}/categories`).then((d) => d.items ?? []);

export const getAreaSettings = () => get<{ settings: Record<string, AreaSetting> }>(`${BASE}/settings`).then((d) => d.settings ?? {});
export const saveAreaSetting = (area: string, body: AreaSetting) => put<{ message: string; item: AreaSetting }>(`${BASE}/settings/${area}`, body);

export const listEvalMatches = (params: { from: string; to: string; status?: string } & FilterScope) =>
  get<MatchListResponse>(`${BASE}/matches`, { from: params.from, to: params.to, status: params.status || undefined, ...scopeParams(params) });

export const getMatchDetail = (matchId: number) => get<MatchDetail>(`${BASE}/matches/${matchId}`);

export interface SavePayload {
  staffId: number;
  answers: Record<string, unknown>;
  note: string;
  cityId?: number;
}

export const saveMatchEvaluation = (matchId: number, area: string, body: SavePayload) =>
  put<{ message: string; item: Evaluation }>(`${BASE}/matches/${matchId}/areas/${area}`, body);

export const listWeeks = (params: { count?: number; cityId?: string }) =>
  get<{ items: WeekItem[] }>(`${BASE}/weeks`, { count: params.count ?? 16, cityId: params.cityId || undefined }).then((d) => d.items ?? []);

export const getWeekDetail = (weekStart: string, cityId?: string) => get<WeekDetail>(`${BASE}/weeks/${weekStart}`, { cityId: cityId || undefined });

export const saveWeekEvaluation = (weekStart: string, area: string, body: SavePayload) =>
  put<{ message: string; item: Evaluation }>(`${BASE}/weeks/${weekStart}/areas/${area}`, body);

export const deleteEvaluation = (id: number) => del<{ message: string }>(`${BASE}/evaluations/${id}`);

export const getAnalysis = (params: { from: string; to: string; area?: string } & FilterScope) =>
  get<Analysis>(`${BASE}/analysis`, { from: params.from, to: params.to, area: params.area || undefined, ...scopeParams(params) });

export const getStaffCard = (staffId: number, params: { from: string; to: string } & FilterScope) =>
  get<StaffCard>(`${BASE}/staff/${staffId}`, { from: params.from, to: params.to, ...scopeParams(params) });

export const getCityOptions = () => get<{ nationwide: boolean; items: { id: number; name: string }[] }>(`${BASE}/city-options`);

export const getCompetitionOptions = (cityId?: string) =>
  get<{
    leagues: { id: number; name: string; cityId: number | null; city: string | null; archived: boolean }[];
    seasons: { id: number; name: string; year?: number | null; leagueId: number; leagueName: string; archived: boolean }[];
  }>(`${BASE}/competition-options`, { cityId: cityId || undefined });

export const getCityComparison = (params: { from: string; to: string; area?: string } & FilterScope) =>
  get<{ items: CompareRow[] }>(`${BASE}/cities`, { from: params.from, to: params.to, area: params.area || undefined, leagueId: params.leagueId || undefined, seasonId: params.seasonId || undefined });

export const getCompetitionComparison = (params: { from: string; to: string; area?: string; groupBy: "league" | "season" } & FilterScope) =>
  get<{ items: CompareRow[]; groupBy: string }>(`${BASE}/competitions`, {
    from: params.from,
    to: params.to,
    area: params.area || undefined,
    groupBy: params.groupBy,
    ...scopeParams(params),
  });

/* ─────────────────────────── sözlükler ─────────────────────────── */

export const FALLBACK_AREAS: EvalArea[] = [
  { key: "hakem", label: "Hakem", period: "match" },
  { key: "spiker", label: "Spiker", period: "match" },
  { key: "reji", label: "Reji", period: "match" },
  { key: "fotografci", label: "Fotoğrafçı", period: "match" },
  { key: "saglikci", label: "Sağlıkçı", period: "match" },
  { key: "call_center", label: "Call Center", period: "match" },
  { key: "sosyal_medya", label: "Sosyal Medya", period: "week" },
];

/** Alan ikonları (web Font Awesome karşılıkları → Ionicons). */
export const AREA_ICONS: Record<string, string> = {
  hakem: "flag-outline",
  spiker: "mic-outline",
  reji: "videocam-outline",
  fotografci: "camera-outline",
  saglikci: "medkit-outline",
  call_center: "headset-outline",
  sosyal_medya: "share-social-outline",
};

export const PERIOD_PRESETS = [
  { key: "week", label: "Bu hafta" },
  { key: "14", label: "Son 14 gün" },
  { key: "30", label: "Son 30 gün" },
  { key: "90", label: "Son 90 gün" },
  { key: "month", label: "Bu ay" },
  { key: "lastMonth", label: "Geçen ay" },
  { key: "365", label: "Son 1 yıl" },
  { key: "all", label: "Tüm zamanlar" },
] as const;
export type PeriodKey = (typeof PERIOD_PRESETS)[number]["key"];

/* ─────────────────────────── yardımcılar ─────────────────────────── */

export const SCORE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const NA = "na";
export type AnswerValue = boolean | number | typeof NA;
export type AnswerEntry = AnswerValue | { value: AnswerValue; comment: string };

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const shiftDay = (day: string, count: number) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);

export function presetRange(key: PeriodKey | string): { from: string; to: string } {
  const today = todayIso();
  if (key === "all") return { from: "2020-01-01", to: today };
  if (key === "week") {
    const offset = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    return { from: shiftDay(today, -offset), to: today };
  }
  if (key === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  if (key === "lastMonth") {
    const end = shiftDay(`${today.slice(0, 8)}01`, -1);
    return { from: `${end.slice(0, 8)}01`, to: end };
  }
  const days = Number(key) || 30;
  return { from: shiftDay(today, -(days - 1)), to: today };
}

const money = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const num1 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

/** 1250 → "1.250 ₺"; işaretli gösterimde "+1.250 ₺" / "−200 ₺". */
export function formatTl(value: unknown, signed = false): string {
  const n = Number(value) || 0;
  const body = `${money.format(Math.abs(n))} ₺`;
  if (n < 0) return `−${body}`;
  return signed && n > 0 ? `+${body}` : body;
}

export const formatPct = (v: number | null | undefined) => (v == null ? "—" : `%${num1.format(v)}`);
export const formatDelta = (v: number | null | undefined, suffix = "") =>
  v == null ? "" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${num1.format(Math.abs(v))}${suffix}`;

export function scoreLevel(v: number | null | undefined): { label: string; tone: "neutral" | "win" | "info" | "warn" | "danger" } {
  if (v == null) return { label: "—", tone: "neutral" };
  if (v >= 85) return { label: "Mükemmel", tone: "win" };
  if (v >= 70) return { label: "İyi", tone: "info" };
  if (v >= 50) return { label: "Orta", tone: "warn" };
  return { label: "Zayıf", tone: "danger" };
}

export function formatDay(day: string | null | undefined, withWeekday = true): string {
  if (!day) return "";
  const date = new Date(`${String(day).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: withWeekday ? "long" : "short", weekday: withWeekday ? "short" : undefined, timeZone: "UTC" });
}

export const answerValue = (e: AnswerEntry | undefined): AnswerValue | undefined => (e && typeof e === "object" ? e.value : e);
export const answerComment = (e: AnswerEntry | undefined): string => (e && typeof e === "object" ? e.comment || "" : "");

function ruleAmount(rules: ScoreRule[] | undefined, value: number | null) {
  if (value == null) return 0;
  const rule = (rules || []).find((r) => value >= Number(r.min) && value <= Number(r.max));
  return rule ? Number(rule.amount) || 0 : 0;
}

/** Cevaplardan anlık skor, tutar ve hakediş önizlemesi. */
export function previewEvaluation(questions: EvalQuestion[], answers: Record<number, AnswerEntry>, setting?: AreaSetting | null) {
  let points = 0;
  let weights = 0;
  let answered = 0;
  let fails = 0;
  const amounts: number[] = [];
  questions.forEach((q) => {
    const value = answerValue(answers[q.id]);
    if (value === undefined || value === null) return;
    answered += 1;
    if (value === NA) return;
    const weight = Number(q.weight) || 1;
    let point: number;
    let amount: number;
    if (q.answerType === "yes_no") {
      point = value ? 10 : 0;
      amount = value ? q.yesAmount : q.noAmount;
    } else {
      point = Number(value);
      amount = ruleAmount(q.scoreRules, point);
    }
    points += weight * point;
    weights += weight;
    if (point < 5) fails += 1;
    amounts.push(Number(amount) || 0);
  });
  const scorePct = weights ? Math.round((points / (weights * 10)) * 1000) / 10 : null;
  const areaAmount = scorePct == null ? 0 : ruleAmount(setting?.scoreRules, Math.floor(scorePct));
  const all = [...amounts, areaAmount];
  const bonus = all.filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const deduction = -all.filter((v) => v < 0).reduce((s, v) => s + v, 0);
  const baseFee = Number(setting?.baseFee) || 0;
  return {
    answered,
    total: questions.length,
    complete: questions.length > 0 && answered === questions.length,
    scorePct,
    areaAmount,
    bonus,
    deduction,
    net: bonus - deduction,
    baseFee,
    payout: baseFee + bonus - deduction,
    fails,
  };
}

/** Kayıtlı değerlendirmenin cevaplarını forma çevirir (yalnız hâlâ formda olan sorular). */
export function answersFromEvaluation(evaluation: Evaluation | null | undefined, questions: EvalQuestion[]): Record<number, AnswerEntry> {
  const map: Record<number, AnswerEntry> = {};
  const ids = new Set(questions.map((q) => q.id));
  (evaluation?.answers || []).forEach((a) => {
    if (!ids.has(a.questionId)) return;
    const value = a.na ? NA : a.value;
    if (value === null || value === undefined) return;
    map[a.questionId] = a.comment ? { value: value as AnswerValue, comment: a.comment } : (value as AnswerValue);
  });
  return map;
}

/** "Yapılmadı −200 ₺ · Yapıldı +50 ₺" */
export function amountSummary(q: Pick<EvalQuestion, "answerType" | "yesAmount" | "noAmount" | "scoreRules">): string {
  if (q.answerType === "yes_no") {
    const parts: string[] = [];
    if (q.yesAmount) parts.push(`Yapıldı ${formatTl(q.yesAmount, true)}`);
    if (q.noAmount) parts.push(`Yapılmadı ${formatTl(q.noAmount, true)}`);
    return parts.join(" · ");
  }
  return (q.scoreRules || [])
    .map((r) => `${r.min === r.max ? r.min : `${r.min}-${r.max}`} puan ${formatTl(r.amount, true)}`)
    .join(" · ");
}

/** Sorular kategoriye göre (sıra korunarak) gruplanır. */
export function groupByCategory<T extends { category?: string | null }>(questions: T[]) {
  const groups: { key: string; label: string; items: T[] }[] = [];
  questions.forEach((q) => {
    const key = q.category || "";
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: key || "Genel", items: [] };
      groups.push(g);
    }
    g.items.push(q);
  });
  return groups;
}

/** CSV satırı (Excel'de Türkçe karakter bozulmasın diye BOM ve ";" ayıraç). */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return `﻿${[header, ...rows].map((r) => r.map(esc).join(";")).join("\n")}`;
}

export const csvNumber = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
