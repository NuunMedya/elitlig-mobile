import { get, post, put } from "../http";
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
  /** Faz 5: "prestige" — prestijle 1. kademeye dönüş (`level` = yeni prestij seviyesi). */
  via: "migration" | "player" | "fan" | "stars" | "prestige" | null;
  level?: number;
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
  /** Şehir 2.1: ana yükseltmenin Elit Lira bedeli (eski sunucuda yok). */
  el?: number;
  value: number;
  state: City2StageState;
  locks: City2Lock[];
}

export type City2Action =
  | { kind: "lock"; lock: string; title: string; cost: number; left: number }
  | { kind: "stage"; stage: number; title: string; cost: number; /** Şehir 2.1: ana yükseltmenin EL şartı. */ el?: number; blocked: { code: string; rung?: number } | null }
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
  | { code: "GRANT_ONLY"; grant: string; text?: string }
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
  sources: Omit<CityState["stars"], "spent" | "available"> & { refund?: number; visit?: number };
  xp: CityXp;
  /** Faz 5: prestij yıldız bonusu (yalnız > 0; `available` içinde). */
  prestige_bonus?: number;
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
  /**
   * Faz 3 · Altyapı akademisi. `null`: akademi binası kurulmadı.
   * `undefined` (alan yok): eski sunucu → akademi arayüzü hiç çizilmez.
   */
  academy?: City2Academy | null;
  /* Faz 5 (eski sunucuda yok → ilgili arayüz hiç çizilmez). */
  season?: City2Season;
  prestige?: City2Prestige;
  crest?: City2Crest;
  team?: { team: City2TeamSummary | null; text: string | null };
  visit?: City2VisitSummary;
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

/** Şehir 2.1: tesis bakımı (eski sunucuda yok). */
export interface City2Care {
  /** Şu anki bakım durumu (%). */
  pct: number;
  /** En düşük durum: gelir bunun altına inmez. */
  floor: number;
  low: boolean;
  decay_per_day: number;
  /** %100'e getirmenin şu anki yıldız bedeli (0 = bakımlı). */
  cost: number;
  full_cost: number;
  since: string | null;
  floor_at: string | null;
}

export interface City2IncomeBuilding {
  has_income: true;
  streams: City2IncomeStream[];
  base_per_hour: number;
  boost_pct: number;
  staff_pct: number;
  /** Faz 5: prestij ve takım tesisi gelir bonusu (eski sunucuda yok). */
  prestige_pct?: number;
  team_pct?: number;
  multiplier: number;
  /** Bakım durumu dahil şu anki gelir. */
  per_hour: number;
  /** %100 bakımda gelir (Şehir 2.1). */
  per_hour_full?: number;
  per_day: number;
  care?: City2Care;
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
  per_hour_full?: number;
  per_day: number;
  net_per_hour: number;
  /** Şehir 2.1: EL → yıldız takası (haftada sınırlı; eski sunucuda yok). */
  star_trade?: { week: string; used: number; left: number; per_week: number; el: number; stars: number; total_stars: number };
  /** Şehir 2.1: tesis bakımı özeti (eski sunucuda yok). */
  care?: { avg_pct: number; cost: number; low: number; floor: number; decay_per_day: number; stars_per_stage: number; text: string };
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
  /** Faz 3: üyenin gizlilik tercihleri (akademide adının kullanılmaması). */
  privacy: () => ["users", "me", "privacy-preferences"] as const,
  /* Faz 5 */
  team: () => [...cityKeys.me(), "v2", "team"] as const,
  visitList: (kind: string) => [...cityKeys.me(), "v2", "visit-list", kind] as const,
  visit: (userId: number) => [...cityKeys.me(), "v2", "visit", userId] as const,
};

export const getCity2 = () => get<City2Response>("/api/puzzle/city2", undefined, { retry: false });

export const buyCity2Lock = (building: string, lock: string) =>
  post<{ building: string; stage: number; lock: { key: string; title: string; cost: number }; cost: number; city2: City2State }>(
    "/api/puzzle/city2/lock",
    { building, lock },
    { retry: false },
  );

export const buildCity2Stage = (building: string) =>
  post<{ building: string; stage: { index: number; key: string; title: string; cost: number; el?: number }; cost: number; el_cost?: number; city2: City2State }>(
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

/** Tesis bakımı (Şehir 2.1): yıldızla %100'e getirir; building yoksa bakımı eksik bütün binalar. */
export const careCity2 = (building?: string | null) =>
  post<{ cost: number; by_building: Record<string, number>; city2: City2State }>("/api/puzzle/city2/care", building ? { building } : undefined, { retry: false });

/** Şehir 2.1: Elit Lira'yı yıldıza çevir (pahalı, haftada sınırlı). */
export const tradeCity2ElForStars = () => post<{ stars: number; cost: number; city2: City2State }>("/api/puzzle/city2/el/stars", undefined, { retry: false });

export const upgradeCity2El = (building: string, kind: City2UpgradeKind) =>
  post<{ building: string; upgrade: City2UpgradeKind; level: number; cost: number; balance: number; city2: City2State }>(
    "/api/puzzle/city2/upgrade",
    { building, kind },
    { retry: false },
  );

export const getCity2ElHistory = (before?: number | null, limit = 50) =>
  get<City2ElHistory>("/api/puzzle/city2/el/history", { limit, before: before ?? undefined }, { retry: false });

/* ───────────────────────── Faz 3 · Altyapı akademisi ───────────────────────── */

export type City2NameStage = "minik" | "genc" | "profesyonel" | "tecrubeli";
export type City2PlayerSource = "self" | "team" | "city" | "generated";

export interface City2YouthPlayer {
  id: string;
  /** Sunucunun verdiği görünen ad (yaşa göre "Minik Ali", "Genç Ali", "Ali Yılmaz", "Tecrübeli Ali"). */
  name: string;
  first: string;
  last: string | null;
  source: City2PlayerSource;
  age: number;
  age_exact: number;
  name_stage: City2NameStage | string;
  next_birthday_at: string | null;
  retires_at: string | null;
  pos: string | null;
  pos_title: string | null;
  ovr: number;
  pot: number;
  value: number;
  team: "academy" | "a";
  listed: boolean;
  injured: boolean;
  injury_until: string | null;
  joined_at: string | null;
  promoted_at: string | null;
  offers: string[];
  can_list: boolean;
  can_promote: boolean;
}

export interface City2Offer {
  id: string;
  player_id: string;
  player_name: string | null;
  club: { key: string; name: string; tier: string; tier_title: string };
  amount: number;
  value: number | null;
  at: string;
  expires_at: string;
}

export type City2AcademyHistoryKind = "joined" | "sold" | "released" | "retired" | "promoted" | "injured";

export interface City2AcademyHistory {
  kind: City2AcademyHistoryKind | string;
  at: string;
  player_id: string | null;
  name: string;
  age: number | null;
  amount: number | null;
  club: { key: string; name: string | null } | null;
  hours: number | null;
}

export interface City2AcademyEffects {
  akademi: {
    stage: number;
    slots: number;
    intake_hours: number | null;
    potential_base: number | null;
    next: { stage: number; slots: number; intake_hours: number; potential_base: number } | null;
  };
  universite: { stage: number; growth_pct: number; peak_bonus: number; text: string };
  saglik: { stage: number; injury_pct: number; injury_reduction: number; recovery_reduction: number; text: string };
  scout: { stage: number; europe: boolean };
}

export interface City2Academy {
  built: boolean;
  stage: number;
  intro: string;
  time: { year_hours: number; text: string };
  names_text: string;
  name_stages: { key: string; title: string; min: number; max: number | null }[];
  slots: { used: number; max: number; by_stage: number[]; full: boolean; over?: number };
  /** Faz 5: akademi binası yokken (prestij sonrası) yeni oyuncu gelmez. */
  paused?: boolean;
  paused_text?: string | null;
  next_intake_at: string | null;
  intake_hours: number | null;
  full_text: string | null;
  squad: City2YouthPlayer[];
  a_team: { players: City2YouthPlayer[]; max: number; text: string };
  offers: City2Offer[];
  effects: City2AcademyEffects;
  sales: { today: number; daily_cap: number; left_today: number };
  totals: { income: number; sold: number; released: number; retired: number; promoted: number; injuries: number; intakes: number; skipped: number; best: number };
  history: City2AcademyHistory[];
  privacy: { opt_out: boolean; label: string; help: string };
  started_at: string | null;
}

/** Akademi yazma uçlarının ortak yanıtı. */
interface City2AcademyWrite {
  academy: City2Academy | null;
  city2: City2State;
}

export type City2AcceptResult = City2AcademyWrite & { player: string; amount: number; club: string; balance: number };

export const acceptAcademyOffer = (offer: string) =>
  post<City2AcceptResult>("/api/puzzle/city2/academy/offer/accept", { offer }, { retry: false });

export const rejectAcademyOffer = (offer: string) =>
  post<City2AcademyWrite & { offer: string; player: string }>("/api/puzzle/city2/academy/offer/reject", { offer }, { retry: false });

export const releaseAcademyPlayer = (player: string) =>
  post<City2AcademyWrite & { player: string }>("/api/puzzle/city2/academy/release", { player }, { retry: false });

export const promoteAcademyPlayer = (player: string) =>
  post<City2AcademyWrite & { player: string }>("/api/puzzle/city2/academy/promote", { player }, { retry: false });

export const listAcademyPlayer = (player: string, listed: boolean) =>
  post<City2AcademyWrite & { player: string; listed: boolean }>("/api/puzzle/city2/academy/list", { player, listed }, { retry: false });

/**
 * Gizlilik tercihleri: "Altyapı oyunlarında adım kullanılmasın" (Faz 3) ve
 * "Şehrimi ziyarete kapat" (Faz 5; eski sunucuda alan yok → anahtar gizlenir).
 * Eski sunucuda 404 → bütün ayar gizlenir.
 */
export type PrivacyKey = "academy_name_opt_out" | "city_visit_opt_out";
export interface PrivacyPreferences {
  preferences: { academy_name_opt_out?: boolean; city_visit_opt_out?: boolean };
  labels?: Partial<Record<PrivacyKey, string>>;
  help?: Partial<Record<PrivacyKey, string>>;
  message?: string;
  /** Hemen yeniden adlandırılan akademi sayısı. */
  renamed?: number;
}

export const getPrivacyPreferences = () => get<PrivacyPreferences>("/api/users/me/privacy-preferences", undefined, { retry: false });

/** Yalnız verilen anahtar yazılır (sunucu ikisini de tek tek kabul eder). */
export const setPrivacyPreferences = (body: Partial<Record<PrivacyKey, boolean>>) =>
  put<PrivacyPreferences>("/api/users/me/privacy-preferences", body, { retry: false });

/* ───────────── Akademi yardımcıları ───────────── */

/**
 * Yaş → değer eğrisi (tahmini). Sunucu yalnız bugünkü değeri yollar; eğrinin
 * BİÇİMİ sunucudaki tablolarla aynıdır (constants/city2academy.js: GROWTH,
 * AGE_VALUE, POT_WEIGHT, VALUE_EXP) ve eğri oyuncunun bugünkü değerinden
 * geçecek biçimde ölçeklenir. Böylece sunucu katsayıları değişse de bugünkü
 * nokta hep doğrudur; diğer yaşlar "yaklaşık" gösterilir.
 */
const CURVE = {
  ovrStart: 25,
  growthPeak: 26,
  exp: 3,
  growth: [[8, 0], [12, 0.2], [15, 0.42], [18, 0.64], [21, 0.82], [24, 0.94], [26, 1], [29, 1], [31, 0.95], [33, 0.87], [35, 0.78], [37, 0.7]] as [number, number][],
  ageValue: [[8, 0.12], [12, 0.25], [15, 0.45], [18, 0.65], [21, 0.82], [24, 0.94], [26, 1], [29, 1], [31, 0.78], [33, 0.52], [35, 0.3], [36, 0.2]] as [number, number][],
  potWeight: [[8, 0.6], [18, 0.6], [24, 0.2], [26, 0]] as [number, number][],
};

function interp(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i += 1) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

function rawValue(peak: number, age: number, uniGrowth: number): number {
  let g = interp(CURVE.growth, age);
  if (age < CURVE.growthPeak) g = Math.min(1, g * (1 + uniGrowth));
  const ovr = CURVE.ovrStart + (peak - CURVE.ovrStart) * g;
  const quality = ovr + (peak - ovr) * interp(CURVE.potWeight, age);
  return (quality / 60) ** CURVE.exp * interp(CURVE.ageValue, age);
}

export interface ValuePoint {
  age: number;
  value: number;
}

/** 8..35 yaş için tahmini değer noktaları ve zirve aralığı. */
export function valueCurve(p: Pick<City2YouthPlayer, "pot" | "value" | "age_exact">, uniGrowth = 0): { points: ValuePoint[]; peak: { from: number; to: number; value: number } } {
  const ageNow = Math.max(8, Math.min(35.99, p.age_exact));
  const now = rawValue(p.pot, ageNow, uniGrowth);
  const scale = now > 0 && p.value > 0 ? p.value / now : 1500;
  const points: ValuePoint[] = [];
  for (let age = 8; age <= 35; age += 1) points.push({ age, value: Math.max(10, Math.round((rawValue(p.pot, age, uniGrowth) * scale) / 10) * 10) });
  const best = Math.max(...points.map((x) => x.value));
  const top = points.filter((x) => x.value >= best * 0.985);
  return { points, peak: { from: top[0].age, to: top[top.length - 1].age, value: best } };
}

/** Adın kaynağı → kısa açıklama (oyuncu penceresinde). */
export const ACADEMY_SOURCE_TEXT: Record<string, string> = {
  self: "Senin adın",
  team: "Takım arkadaşın",
  city: "İlinden bir oyuncu",
  generated: "Akademinin adı",
};

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

/** Uzun süreler: "3 gün 4 sa" · "17 sa 25 dk" · "40 dk" · "az sonra". */
export function spanText(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  if (ms < 48 * 3_600_000) return untilText(iso, now);
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} gün ${h % 24} sa` : `${d} gün`;
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

/** Lig adı: "4. Amatör" (basamağın başlığı; bulunamazsa "Lig N"). */
export function rungTitle(ladder: Pick<City2Ladder, "steps"> | null | undefined, rung: number): string {
  return ladder?.steps.find((s) => s.rung === rung)?.title ?? `Lig ${rungLabel(ladder, rung)}`;
}

/** "4. Amatör olunca açılır" — kilitli bina/aşama/yapı için lig şartı. */
export function rungOpensText(ladder: Pick<City2Ladder, "steps"> | null | undefined, rung: number): string {
  return `${rungTitle(ladder, rung)} olunca açılır`;
}

/** Sıradaki ligin bu binadan istediği aşama (yoksa null). */
export function leagueNeedOf(ladder: City2Ladder | null | undefined, key: string): { need: number; title: string; ok: boolean } | null {
  const s = ladder?.next?.stages.find((x) => x.building === key);
  return s ? { need: s.need, title: s.need_title, ok: s.ok } : null;
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
  // Faz 5 onur yapıları (sezon kupası, prestij anıtı, takım kapısı) kendi açıklamasını taşır.
  if (lock.code === "GRANT_ONLY" && typeof lock.text === "string" && lock.text) return lock.text;
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

/* ═══════════════════════ FAZ 5 · SEZON, PRESTİJ, TAKIM, ZİYARET ═══════════════════════
 *
 *   GET  /api/puzzle/city2/season                → { season, crest, prestige } (sezon sonu dilimi bu okumada verilir)
 *   POST /api/puzzle/city2/prestige/preview      → { token, expires_at, preview, prestige, city2 }
 *   POST /api/puzzle/city2/prestige {token}      → { level, collected, unplaced, prestige, crest, city2 }
 *   GET  /api/puzzle/city2/team                  → takım tesisi + katkı sıralaması + bugünkü bağış hakkı
 *   POST /api/puzzle/city2/team/donate {stars?, el?}
 *   GET  /api/puzzle/city2/visit ?kind&limit     → listeler (featured · team · city · random)
 *   GET  /api/puzzle/city2/visit/:userId         → başka bir şehrin salt okunur görünümü
 *   POST /api/puzzle/city2/visit/:userId/applause
 *
 * Sezon kupaları, rozetler, arma çerçeveleri, prestij yıldızları ve takım
 * yapısı yalnız görünüştür; Elit Lira oyun içi paradır, hiçbir şey satın alınmaz.
 */

export type City2SeasonTier = "altin" | "gumus" | "bronz";
export type City2SeasonGroup = "city" | "real" | "quest" | "social";

export interface City2SeasonInfo {
  id: number;
  title: string;
  name: string;
  from: string;
  to: string;
  next: string;
  start_at: string;
  end_at: string;
  range_text: string;
}

export interface City2SeasonPart {
  key: string;
  label: string;
  group: City2SeasonGroup | string;
  have: number;
  per: number;
  points_per: number;
  cap: number;
  counted: number;
  points: number;
  max_points: number;
}

export interface City2SeasonCurrent extends City2SeasonInfo {
  days_left: number;
  score: number;
  parts: City2SeasonPart[];
  /** Sıra (en az 100 puanı olanlar arasında); puan < 100 ise null. */
  rank: number | null;
  ranked: number | null;
  ext_at: string | null;
}

export interface City2SeasonBadge {
  season: number;
  tier: City2SeasonTier | string;
  key: string;
  title: string;
  frame: string;
  frame_title: string;
}

export interface City2SeasonHistory extends City2SeasonInfo {
  score: number;
  parts: Record<string, number>;
  tier: City2SeasonTier | string | null;
  tier_title: string | null;
  rank: number | null;
  total: number | null;
  pct: number | null;
  basis: "rank" | "fallback" | string | null;
  /** Sıra henüz hesaplanmadı (bir sonraki okumada verilir). */
  pending: boolean;
  at: string | null;
  badge: City2SeasonBadge | null;
}

export interface City2SeasonReward {
  tier: City2SeasonTier | string;
  title: string;
  top_pct: number;
  landmark: string;
  min_score: number;
}

export interface City2Season {
  intro: string;
  current: City2SeasonCurrent | null;
  preseason: { text: string; starts_at: string; season: City2SeasonInfo } | null;
  rewards: City2SeasonReward[];
  weights: { key: string; label: string; group: string; per: number; points: number; cap: number }[];
  /** Yeniden eskiye. */
  history: City2SeasonHistory[];
  badges: City2SeasonBadge[];
}

export interface City2Prestige {
  level: number;
  max_level: number;
  min_rung: number;
  el_pct: number;
  star_pct: number;
  star_bonus: number;
  at: string | null;
  history: { level: number; at: string; dev_before: number; stars_at: number }[];
  can_prestige: boolean;
  blocked: null | "RUNG_REQUIRED" | "PRESTIGE_MAXED" | string;
  next: { level: number; el_pct: number; star_pct: number } | null;
  intro: string;
  warning: string;
}

export interface City2Crest {
  prestige_stars: number;
  frame: string | null;
  frame_title: string | null;
  best: City2SeasonBadge | null;
  badges: City2SeasonBadge[];
}

export interface City2TeamSummary {
  id: number;
  name: string;
  level: number;
  max_level: number;
  stage_title: string | null;
  el_pct: number;
  progress: number;
  next_cost: number | null;
  size: number;
}

export interface City2VisitSummary {
  applause: number;
  today: number;
  closed: boolean;
  privacy_label: string;
}

export interface City2SeasonResponse {
  season: City2Season;
  crest: City2Crest;
  prestige: City2Prestige;
}

export const getCity2Season = () => get<City2SeasonResponse>("/api/puzzle/city2/season", undefined, { retry: false });

/* ───────────── Prestij ───────────── */

export interface City2PrestigePreview {
  level: { before: number; after: number };
  gains: {
    el_pct: { before: number; after: number };
    star_pct: { before: number; after: number };
    landmark: { key: string; title: string; beauty: number } | null;
    crest_stars: number;
  };
  reset: {
    rung: { before: number; after: number };
    dev: { before: number; after: number };
    buildings: { key: string; title: string; before: number; after: number }[];
    landmarks_unplaced: string[];
    academy: { players: number; a_team: number; paused: boolean; text: string } | null;
  };
  keep: { el_balance: number; el_upgrades: boolean; landmarks: number; academy_players: number; history: boolean; stars_spent_refund: number };
  warning: string;
}

export interface City2PrestigePreviewResult {
  token: string;
  expires_at: string;
  preview: City2PrestigePreview;
  prestige: City2Prestige;
  city2: City2State;
}

export interface City2PrestigeResult {
  level: number;
  collected: number;
  unplaced: string[];
  prestige: City2Prestige;
  crest: City2Crest;
  city2: City2State;
}

export const previewCity2Prestige = () => post<City2PrestigePreviewResult>("/api/puzzle/city2/prestige/preview", undefined, { retry: false });
export const confirmCity2Prestige = (token: string) => post<City2PrestigeResult>("/api/puzzle/city2/prestige", { token }, { retry: false });

/* ───────────── Takım tesisi ───────────── */

export interface City2TeamContribution {
  rank: number;
  user_id: number;
  name: string;
  points: number;
  stars: number;
  el: number;
  last_at: string | null;
  me: boolean;
}

export interface City2TeamFacility {
  id: number;
  name: string;
  size: number;
  size_counted: number;
  level: number;
  max_level: number;
  stage_title: string | null;
  next_stage_title: string | null;
  progress: number;
  next_cost: number | null;
  points_total: number;
  stars_total: number;
  el_total: number;
  contributors: number;
  el_pct: number;
  next_el_pct: number | null;
  landmark: { key: string; level: number; unlocked: boolean };
  costs: { level: number; cost: number; title: string }[];
  rates: { star_points: number; el_per_point: number; daily_cap: { stars: number; el: number } };
  intro: string;
}

export interface City2TeamToday {
  stars: number;
  el: number;
  left: { stars: number; el: number };
  cap: { stars: number; el: number };
}

export interface City2TeamView {
  team: City2TeamFacility | null;
  rank?: { rank: number | null; total: number };
  contributions?: { top: City2TeamContribution[]; me: { rank: number | null; points: number; stars: number; el: number } };
  today?: City2TeamToday;
  text: string | null;
  intro?: string;
}

export interface City2DonateResult extends City2TeamView {
  stars: number;
  el: number;
  points: number;
  level: number;
  level_up: number;
  balance: number;
  city2: City2State;
}

export const getCity2Team = () => get<City2TeamView>("/api/puzzle/city2/team", undefined, { retry: false });
export const donateCity2Team = (body: { stars?: number; el?: number }) => post<City2DonateResult>("/api/puzzle/city2/team/donate", body, { retry: false });

/* ───────────── Şehir ziyareti ───────────── */

export type City2VisitKind = "featured" | "team" | "city" | "random";

export interface City2VisitCard {
  user_id: number;
  name: string;
  city: string | null;
  beauty: number;
  rung: number;
  step_label: string | null;
  step_title: string | null;
  prestige: number;
  applause: number;
  frame: string | null;
}

export interface City2VisitLists {
  intro: string;
  privacy: PrivacyPreferences;
  featured?: City2VisitCard[];
  team?: City2VisitCard[];
  team_info?: { id: number; name: string } | null;
  city?: City2VisitCard[];
  random?: City2VisitCard[];
}

export interface City2PublicCity {
  user_id: number;
  name: string;
  city: string | null;
  team_name: string | null;
  ladder: { rung: number; max_rung: number; no: number; label: string; key: string; title: string };
  buildings: { key: string; title: string; icon: string; stage: number; max: number; current: { key: string; title: string } | null }[];
  landmarks: { id: string; key: string; title: string; tier: string; beauty: number; slot: string }[];
  grid: { cols: number; rows: number; open_rows: number };
  beauty: number;
  dev: number;
  prestige: { level: number };
  crest: City2Crest;
  applause: { total: number; today: number };
  mine: boolean;
  applauded_today: boolean;
}

export interface City2VisitView {
  city: City2PublicCity;
  applause: { can: boolean; blocked: string | null; left_today: number; rewards: { visitor: number; target: number } };
}

export interface City2ApplauseResult {
  applauded: boolean;
  target_id: number;
  stars: { visitor: number; target: number };
  applause: { total: number; today: number };
  left_today: number;
}

export const getCity2VisitList = (kind: City2VisitKind, limit = 20) => get<City2VisitLists>("/api/puzzle/city2/visit", { kind, limit }, { retry: false });
export const getCity2Visit = (userId: number) => get<City2VisitView>(`/api/puzzle/city2/visit/${userId}`, undefined, { retry: false });
export const applaudCity2 = (userId: number) => post<City2ApplauseResult>(`/api/puzzle/city2/visit/${userId}/applause`, undefined, { retry: false });

/* ───────────── Faz 5 yardımcıları ───────────── */

/** "altin" → "Altın" (sunucu başlığı yoksa). */
export const SEASON_TIER_TITLE: Record<string, string> = { altin: "Altın", gumus: "Gümüş", bronz: "Bronz" };

/**
 * Bu sezon için tahmini dilim (yalnız sıra biliniyorsa): sunucunun kuralı
 * (en az 100 puanlılar arasında ilk %10 altın, ilk %35 gümüş, kalanlar bronz).
 */
export function estimateTier(season: Pick<City2Season, "current" | "rewards">): City2SeasonReward | null {
  const cur = season.current;
  if (!cur || cur.rank == null || !cur.ranked) return null;
  const rewards = [...season.rewards].sort((a, b) => a.top_pct - b.top_pct);
  if (!rewards.length || cur.score < (rewards[0]?.min_score ?? 100)) return null;
  for (const r of rewards) if (cur.rank <= Math.max(1, Math.ceil(r.top_pct * cur.ranked))) return r;
  return rewards[rewards.length - 1] ?? null;
}

/** Sezon bitimine kalan süre: "81 gün" · son iki günde saat/dakika. */
export function seasonLeftText(cur: Pick<City2SeasonCurrent, "days_left" | "end_at">, now = Date.now()): string {
  if (cur.days_left > 2) return `${cur.days_left} gün`;
  return spanText(cur.end_at, now) ?? `${Math.max(0, cur.days_left)} gün`;
}

/** Faz 5 alanları sunucuda var mı? */
export const hasFaz5 = (c: City2State | null | undefined) => Boolean(c && c.season && c.prestige);
