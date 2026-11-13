import { get, post } from "../http";
import { cityKeys, type CityState, type CityXp, type DailyStatus } from "./api";

/**
 * KULÜP ŞEHRİ 2.0 (Faz 1) API — elitlig-server services/city2.
 *
 * Her şey veriden gelir: basamak adları, maliyetler, koşullar, aşama ve kilit
 * listeleri, sembol yapı kataloğu ve yuva ızgarası. İstemci yalnız gösterir;
 * hiçbir maliyet ya da ad burada sabit yazılmaz.
 *
 *   GET  /api/puzzle/city2                 bütün durum (ilk okumada eski şehir taşınır)
 *   POST /api/puzzle/city2/lock   {building, lock}
 *   POST /api/puzzle/city2/stage  {building}
 *   POST /api/puzzle/city2/step
 *   POST /api/puzzle/city2/landmark {key}
 *   POST /api/puzzle/city2/place  {id?, key?, slot|null}
 *
 * FAZ 2 · ELİT LİRA (EL): oyun içi kulüp kasası (satın alınmaz).
 *   GET  /api/puzzle/city2            → city2.el + buildings[].income
 *   POST /api/puzzle/city2/collect    {building?}  (yoksa hepsi)
 *   POST /api/puzzle/city2/upgrade    {building, kind: "depo"|"personel"}
 *   GET  /api/puzzle/city2/el/history ?limit&before
 * Eski sunucuda `el`/`income` yok: EL arayüzü hiç çizilmez.
 *
 * Eski sunucu GET /city2'ye 404 döner: ekran o zaman eski (v1) şehre düşer.
 */

/* ───────────────────────── Merdiven ───────────────────────── */

export interface City2StepView {
  /** 1..19 (16a = 16, 16b = 17). */
  rung: number;
  /** Tasarımdaki basamak numarası (1..18). */
  no: number;
  /** Gösterilecek etiket: "1".."15", "16a", "16b", "17", "18". */
  label: string;
  key: string;
  title: string;
}

export interface City2GateCondition {
  metric: string;
  label: string;
  min: number;
  have: number;
  ok: boolean;
}

/** Koşul ya tek ölçüdür ya da "bunlardan biri" grubudur. */
export type City2GateItem = City2GateCondition | { any: City2GateCondition[]; ok: boolean };

export interface City2GatePath {
  /** false: üyenin bağlı oyuncusu yok (yalnız taraftar yolu). */
  available: boolean;
  ok: boolean;
  conditions: City2GateItem[];
}

/** Yıldız yolu: gerçek hayat kilidini yıldızla açmak (herkese açık, daha pahalı). */
export interface City2GateStarPath {
  available: boolean;
  cost: number;
  have: number;
  ok: boolean;
}

export interface City2Gate {
  days: number;
  ok: boolean;
  via: "player" | "fan" | null;
  /** `stars` eski sunucuda yok. */
  paths: { player: City2GatePath; fan: City2GatePath; stars?: City2GateStarPath };
}

export interface City2StageNeed {
  building: string;
  title: string;
  need: number;
  need_title: string;
  have: number;
  ok: boolean;
}

export interface City2Next extends City2StepView {
  dev: { have: number; need: number; ok: boolean };
  stages: City2StageNeed[];
  gate: City2Gate | null;
  /** Ücretsiz atlanabilir (bütün koşullar, gerçek hayat kilidi dahil). */
  can_advance: boolean;
  /** Yalnız gerçek hayat kilidi eksik ve `buy_cost` ödenebilir → POST /step {pay:true}. */
  can_buy?: boolean;
  /** Kilidin yıldız bedeli (0 = kilit yok ya da zaten tamam). */
  buy_cost?: number;
}

/** Ham koşul tanımı (steps[].gate). */
export type City2RawCond = { metric: string; min: number } | { any: { metric: string; min: number }[] };
export interface City2RawGate {
  days: number;
  /** Yıldız yolunun bedeli. */
  stars?: number;
  player?: City2RawCond[];
  fan?: City2RawCond[];
}

export interface City2Step extends City2StepView {
  dev: number;
  stages: Record<string, number>;
  gate: City2RawGate | null;
  reached: boolean;
}

export interface City2History {
  rung: number;
  at: string | null;
  via: "migration" | "player" | "fan" | "stars" | null;
  /** Yıldızla açıldıysa ödenen bedel. */
  cost?: number;
}

export interface City2Ladder {
  rung: number;
  max_rung: number;
  current: City2StepView;
  next: City2Next | null;
  steps: City2Step[];
  history: City2History[];
}

/* ───────────────────────── Binalar ───────────────────────── */

export type City2LockState = "open" | "available" | "locked";

export interface City2Lock {
  key: string;
  title: string;
  desc: string | null;
  cost: number;
  state: City2LockState;
}

export type City2StageState = "done" | "current" | "next" | "locked";

export interface City2Stage {
  index: number;
  key: string;
  title: string;
  desc: string | null;
  min_rung: number;
  cost: number;
  value: number;
  state: City2StageState;
  locks: City2Lock[];
}

export type City2Action =
  | { kind: "lock"; lock: string; title: string; cost: number; left: number }
  | { kind: "stage"; stage: number; title: string; cost: number; blocked: { code: string; rung?: number } | null }
  | { kind: "maxed" }
  | { kind: "closed"; rung: number };

export interface City2Building {
  key: string;
  title: string;
  icon: string;
  /** Binanın açıldığı basamak (rung). */
  opens: number;
  open: boolean;
  stage: number;
  max: number;
  current: { index: number; key: string; title: string; desc: string | null } | null;
  locks_done: number;
  locks_total: number;
  next_action: City2Action;
  stages: City2Stage[];
  /** Faz 2 (EL). Eski sunucuda yok. */
  income?: City2Income;
}

/* ───────────────────────── Sembol yapılar ───────────────────────── */

export type City2LandmarkLock =
  | { code: "RUNG"; rung: number }
  | { code: "MAX_OWNED"; max: number }
  | { code: "GRANT_ONLY"; grant: string }
  | { code: string; [k: string]: unknown };

export interface City2CatalogueItem {
  key: string;
  title: string;
  tier: string;
  cost: number | null;
  min_rung: number;
  max: number;
  beauty: number;
  grant: string | null;
  owned: number;
  buyable: boolean;
  lock: City2LandmarkLock | null;
}

export interface City2OwnedLandmark {
  id: string;
  key: string;
  slot: string | null;
  at: string | null;
  granted?: boolean;
  title: string;
  beauty: number;
}

export interface City2Grid {
  cols: number;
  rows: number;
  open_rows: number;
  open_slots: number;
  taken: Record<string, string>;
}

export interface City2Landmarks {
  tiers: { key: string; title: string }[];
  catalogue: City2CatalogueItem[];
  owned: City2OwnedLandmark[];
  grid: City2Grid;
}

/* ───────────────────────── Cüzdan, taşıma ───────────────────────── */

export interface City2Stars {
  earned: number;
  refund: number;
  spent_base: number;
  spent: number;
  spent_total: number;
  available: number;
  /** Eski city.stars ile aynı kaynak kırılımı (Ekonomi A). */
  sources: Omit<CityState["stars"], "spent" | "available"> & { refund?: number };
  xp: CityXp;
}

export interface City2Migration {
  at: string;
  from: { levels: Record<string, number>; tier: number; spent: number };
  rung: number;
  value: number;
  refund: number;
  buildings: Record<string, { budget: number; floor: number; stage: number; locks: number; value: number; refund: number }>;
  /** Yalnız taşımanın yapıldığı yanıtta true. */
  just_now: boolean;
}

export interface City2State {
  version: number;
  ladder: City2Ladder;
  buildings: City2Building[];
  landmarks: City2Landmarks;
  stars: City2Stars;
  dev: number;
  beauty: number;
  stages_built: number;
  migration: City2Migration | null;
  gate_metrics: Record<string, { label: string; path: "player" | "fan" }>;
  /** Faz 2 · Elit Lira. Eski sunucuda yok → EL arayüzü gizlenir. */
  el?: City2El;
}

export interface City2Response {
  city2: City2State;
  daily?: DailyStatus;
}

/* ───────────────────────── Faz 2 · Elit Lira ───────────────────────── */

export interface City2IncomeStream {
  key: string;
  title: string;
  /** Akışın açıldığı aşama. */
  from: number;
  active: boolean;
  base_per_hour: number;
}

export type City2UpgradeKind = "depo" | "personel";

export interface City2Upgrade {
  title: string;
  text: string;
  level: number;
  max: number;
  next: { level: number; cost: number; min_stage: number; blocked: { code: string; stage?: number } | null } | null;
}

export interface City2IncomeBuilding {
  has_income: true;
  streams: City2IncomeStream[];
  base_per_hour: number;
  boost_pct: number;
  staff_pct: number;
  multiplier: number;
  per_hour: number;
  per_day: number;
  stored: number;
  stored_exact: number;
  collectable: number;
  cap: number;
  cap_hours: number;
  full: boolean;
  full_at: string | null;
  next_stage_per_hour: number | null;
  upgrades: Partial<Record<City2UpgradeKind, City2Upgrade>>;
  text: string | null;
}

export interface City2SupportEffect {
  kind: "income" | "expense";
  pct: number;
  per_stage: number;
  targets: string[] | null;
  text: string;
}

export type City2Income = City2IncomeBuilding | { has_income: false; effect: City2SupportEffect | null };

export interface City2FormPart {
  key: string;
  label: string;
  have: number | null;
  value: number;
  max: number;
  per?: number;
  cap?: number;
  /** Yalnız reyting: [eşik, katkı] basamakları. */
  steps?: [number, number][];
  rated?: number;
  min_rated?: number;
}

export interface City2FormPath {
  available: boolean;
  multiplier: number;
  max: number;
  parts: City2FormPart[];
}

export interface City2Form {
  multiplier: number;
  text: string;
  path: "player" | "fan" | "none";
  days: number;
  min: number;
  max: number;
  headline: string;
  tip: string;
  player: City2FormPath;
  fan: City2FormPath;
}

export interface City2ElDay {
  earned: number;
  expense: number;
  spent: number;
  admin: number;
}

export interface City2El {
  unit: string;
  title: string;
  intro: string;
  balance: number;
  earned_total: number;
  spent_total: number;
  expense_total: number;
  admin_total: number;
  per_hour: number;
  per_day: number;
  net_per_hour: number;
  stored: number;
  collectable: number;
  cap: number;
  producing: number;
  full: number;
  form: City2Form;
  expenses: {
    per_hour: number;
    per_day: number;
    salary_day: number;
    maintenance_day: number;
    reduction_pct: number;
    due: number;
    due_hours: number;
    cap_hours: number;
    text: string;
  };
  support: { building: string; kind: "income" | "expense"; pct: number; targets: string[] | null; text: string }[];
  today: City2ElDay;
  days: Record<string, City2ElDay>;
  started_at: string | null;
  last_collect_at: string | null;
}

export interface City2CollectResult {
  collected: number;
  by_building: Record<string, number>;
  expense: number;
  forgiven: number;
  net: number;
  balance: number;
  multiplier: number;
  city2: City2State;
}

export type City2LedgerKind = "production" | "expense" | "bonus" | "spend" | "admin";

export interface City2LedgerItem {
  id: number;
  kind: City2LedgerKind;
  building: string | null;
  building_title: string | null;
  amount: number;
  balance_after: number;
  multiplier: number | null;
  day: string | null;
  at: string | null;
  data: Record<string, unknown> | null;
}

export interface City2ElHistory {
  items: City2LedgerItem[];
  limit: number;
  next_before: number | null;
  balance: number;
  earned_total: number;
  spent_total: number;
  expense_total: number;
  days: Record<string, City2ElDay>;
}

/* ───────────────────────── Uçlar ───────────────────────── */

export const city2Keys = {
  /** ["puzzle","city"] önekinin altında: eski şehir tazelenince bu da tazelenir. */
  me: () => [...cityKeys.me(), "v2"] as const,
  elHistory: () => [...cityKeys.me(), "v2", "el-history"] as const,
};

export const getCity2 = () => get<City2Response>("/api/puzzle/city2", undefined, { retry: false });

export const buyCity2Lock = (building: string, lock: string) =>
  post<{ building: string; stage: number; lock: { key: string; title: string; cost: number }; cost: number; city2: City2State }>(
    "/api/puzzle/city2/lock",
    { building, lock },
    { retry: false },
  );

export const buildCity2Stage = (building: string) =>
  post<{ building: string; stage: { index: number; key: string; title: string; cost: number }; cost: number; city2: City2State }>(
    "/api/puzzle/city2/stage",
    { building },
    { retry: false },
  );

/** pay: gerçek hayat kilidini yıldızla aç (yalnız `ladder.next.can_buy` iken). */
export const advanceCity2Step = (pay?: boolean) =>
  post<{ rung: number; step: City2StepView; via: "player" | "fan" | "stars" | null; cost?: number; city2: City2State }>(
    "/api/puzzle/city2/step",
    pay ? { pay: true } : undefined,
    { retry: false },
  );

export const buyCity2Landmark = (key: string) =>
  post<{ landmark: { id: string; key: string; slot: null; at: string }; cost: number; city2: City2State }>(
    "/api/puzzle/city2/landmark",
    { key },
    { retry: false },
  );

export const placeCity2Landmark = (body: { id?: string; key?: string; slot: string | null }) =>
  post<{ landmark: City2OwnedLandmark; city2: City2State }>("/api/puzzle/city2/place", body, { retry: false });

/** Depodaki EL'i topla: tek bina ya da (building yoksa) hepsi. Toplanacak yoksa collected: 0. */
export const collectCity2El = (building?: string | null) =>
  post<City2CollectResult>("/api/puzzle/city2/collect", building ? { building } : undefined, { retry: false });

export const upgradeCity2El = (building: string, kind: City2UpgradeKind) =>
  post<{ building: string; upgrade: City2UpgradeKind; level: number; cost: number; balance: number; city2: City2State }>(
    "/api/puzzle/city2/upgrade",
    { building, kind },
    { retry: false },
  );

export const getCity2ElHistory = (before?: number | null, limit = 50) =>
  get<City2ElHistory>("/api/puzzle/city2/el/history", { limit, before: before ?? undefined }, { retry: false });

/* ───────────────────────── Yardımcılar ───────────────────────── */

/** Gelir binası mı (yeni sunucu)? */
export function incomeOf(b: Pick<City2Building, "income"> | null | undefined): City2IncomeBuilding | null {
  return b?.income && b.income.has_income ? b.income : null;
}

/** EL miktarı: tam sayılar "1.250", küçük oranlar bir ondalıkla "2,4". */
export function fmtEl(n: number, digits = 0): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** Saatlik oran: 100.ün altında bir ondalık. */
export const fmtRate = (n: number) => fmtEl(n, Math.abs(n) < 100 ? 1 : 0);

/** ×1,26 */
export const fmtMult = (n: number) => `×${(Number.isFinite(n) ? n : 1).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 0.04 → "%4", 0.015 → "%1,5" */
export const fmtPct = (n: number) => `%${(Math.round(n * 1000) / 10).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

/** Bir zamana kalan süre: "2 sa 15 dk" · "40 dk" · "az sonra". */
export function untilText(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 60_000) return "az sonra";
  const min = Math.round(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m} dk`;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}

/** Bütün gelir binaları içinde en erken dolacak depo. */
export function firstFullAt(buildings: City2Building[]): string | null {
  let best: string | null = null;
  for (const b of buildings) {
    const inc = incomeOf(b);
    if (!inc || !inc.full_at) continue;
    if (!best || new Date(inc.full_at).getTime() < new Date(best).getTime()) best = inc.full_at;
  }
  return best;
}

/* ───────────────────────── Yardımcılar (Faz 1) ───────────────────────── */

/** rung → gösterilecek etiket ("16a"); bilinmiyorsa sayının kendisi. */
export function rungLabel(ladder: Pick<City2Ladder, "steps"> | null | undefined, rung: number): string {
  return ladder?.steps.find((s) => s.rung === rung)?.label ?? String(rung);
}

/** "N. basamakta açılır" (16a/16b etiketleri de doğru okunur). */
export function rungOpensText(ladder: Pick<City2Ladder, "steps"> | null | undefined, rung: number): string {
  return `${rungLabel(ladder, rung)}. basamakta açılır`;
}

export const slotId = (row: number, col: number) => `r${row}c${col}`;
export function parseSlot(slot: string | null | undefined): { row: number; col: number } | null {
  const m = /^r(\d+)c(\d+)$/.exec(String(slot ?? ""));
  return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
}

/** Sembol yapının satın alınamama gerekçesi (Türkçe, kısa). */
export function landmarkLockText(lock: City2LandmarkLock | null, ladder: Pick<City2Ladder, "steps"> | null | undefined, grantTitle?: string | null): string | null {
  if (!lock) return null;
  if (lock.code === "RUNG" && typeof lock.rung === "number") return rungOpensText(ladder, lock.rung);
  if (lock.code === "MAX_OWNED") return Number(lock.max) === 1 ? "Bundan bir tane olur" : `En çok ${lock.max} tane`;
  if (lock.code === "GRANT_ONLY") return grantTitle ? `Seri ödülü · ${grantTitle}` : "Seri ödülü";
  return "Şu an alınamaz";
}

/** "streak14" → "14 günlük seri". */
export function grantText(grant: string | null | undefined): string | null {
  const m = /^streak(\d+)$/.exec(String(grant ?? ""));
  return m ? `${m[1]} günlük seri` : null;
}

/** Sahne rozeti: up = alınabilir eylem · lock = kilit bekliyor · max · closed. */
export function buildingMark(b: City2Building, available: number): "up" | "lock" | "max" | "closed" | null {
  const a = b.next_action;
  // Faz 2: deposu dolan gelir binası da "dokun" rozeti alır (topla ki üretim sürsün).
  if (b.open && incomeOf(b)?.full) return "up";
  if (a.kind === "closed") return "closed";
  if (a.kind === "maxed") return "max";
  if (a.kind === "lock") return available >= a.cost ? "up" : "lock";
  if (a.blocked) return null;
  return available >= a.cost ? "up" : null;
}
