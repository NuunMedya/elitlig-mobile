import { get, post, put } from "../../http";

/**
 * PİYASA DEĞERİ yönetimi.
 *
 *   routes/adminMarketValue.js → /api/admin/market-value
 *     settings (GET/PUT), stat-weights (PUT), recalculate (POST, toplu),
 *     recalculate/:playerId (POST), players/:id/adjust (POST), audit-log,
 *     formula-versions (+ /:id/activate)
 *   routes/marketValues.js     → /api/market-values/rankings, /api/players/:id/market-value(/history|/breakdown)
 *
 * Etiketler web src/api/marketValueApi.js ve MarketValueAdmin.js ile aynı.
 */

export const BREAKDOWN_LABELS: Record<string, string> = {
  generalPerformance: "Genel Performans",
  recentForm: "Son Dönem Formu",
  positionPerformance: "Pozisyona Özel",
  awards: "Ödüller",
  experience: "Tecrübe ve Süreklilik",
  discipline: "Disiplin",
  teamContribution: "Takım Katkısı",
};

export const COMPONENT_HINTS: Record<string, string> = {
  generalPerformance: "Maç puanı ortalaması ve toplam üretim",
  recentForm: "Son 5 maçın ağırlıklı ortalaması",
  positionPerformance: "Mevkiye özel istatistikler",
  awards: "Maçın/haftanın enleri ödülleri",
  experience: "Maç sayısı, süre ve süreklilik",
  discipline: "Kartlar ve disiplin cezaları",
  teamContribution: "Oynadığı maçlarda takımın kazanma oranı",
};

export const GROWTH_POINT_LABELS: Record<string, string> = {
  matchCompleted: "Maç tamamlama",
  rating7Plus: "7.00+ maç puanı",
  rating8Plus: "8.00+ maç puanı",
  manOfTheMatch: "Maçın oyuncusu",
  matchPositionAward: "Maçın mevki ödülü",
  weeklyPositionAward: "Haftanın mevki ödülü",
  weeklySquad: "Haftanın kadrosu",
  weeklyFairPlay: "Haftanın centilmeni",
  redCard: "Kırmızı kart",
  disciplineBanPerMatch: "Ceza (maç başına)",
};

export const AWARD_POINT_LABELS: Record<string, string> = {
  MAN_OF_THE_MATCH: "Maçın oyuncusu",
  MATCH_GOALKEEPER: "Maçın kalecisi",
  MATCH_DEFENDER: "Maçın defansı",
  MATCH_MIDFIELDER: "Maçın orta sahası",
  MATCH_FORWARD: "Maçın forveti",
  MATCH_GOAL: "Maçın golü",
  MATCH_SAVE: "Maçın kurtarışı",
  WEEKLY_PLAYER: "Haftanın oyuncusu",
  WEEKLY_GOALKEEPER: "Haftanın kalecisi",
  WEEKLY_DEFENDER: "Haftanın defansı",
  WEEKLY_MIDFIELDER: "Haftanın orta sahası",
  WEEKLY_FORWARD: "Haftanın forveti",
  WEEKLY_FAIR_PLAY: "Haftanın centilmeni",
  WEEKLY_SQUAD: "Haftanın kadrosu",
  WEEKLY_TEAM: "Haftanın takımı",
};

/** İnce ayar alanları: [anahtar, etiket, yol, birim, ipucu]. */
export const FINE_FIELDS: { key: string; label: string; path: [string, string]; suffix?: string; hint?: string }[] = [
  { key: "bayesianDefaultAverage", label: "Varsayılan maç puanı (Bayesian)", path: ["bayesian", "defaultAverage"], hint: "Az maçı olan oyuncular bu ortalamaya çekilir." },
  { key: "bayesianPriorMatches", label: "Ön-kabul maç sayısı", path: ["bayesian", "priorMatches"] },
  { key: "launchMinValue", label: "Alt değer", path: ["launch", "minValue"], suffix: "ETL" },
  { key: "launchMaxValue", label: "Üst değer", path: ["launch", "maxValue"], suffix: "ETL" },
  { key: "launchExponent", label: "Dağılım üssü", path: ["launch", "exponent"], hint: "Büyüdükçe üst değerlere ulaşmak zorlaşır." },
  { key: "smoothingPerEventMaxPct", label: "Tek olay değişim sınırı", path: ["smoothing", "perEventMaxPct"], suffix: "%" },
  { key: "smoothingNightlyMaxPct", label: "Gece toplu değişim sınırı", path: ["smoothing", "nightlyMaxPct"], suffix: "%" },
  { key: "inactivityGraceDays", label: "Hareketsizlik tolerans süresi", path: ["inactivity", "graceDays"], suffix: "gün" },
  { key: "inactivityStepDays", label: "Düşüş adımı", path: ["inactivity", "stepDays"], suffix: "gün" },
  { key: "inactivityStepPct", label: "Adım başına düşüş", path: ["inactivity", "stepPct"], suffix: "%" },
  { key: "inactivityMaxPct", label: "Azami düşüş", path: ["inactivity", "maxPct"], suffix: "%" },
  { key: "growthDivisor", label: "Gelişim puanı böleni", path: ["growth", "divisor"] },
  { key: "growthClampMin", label: "Gelişim alt sınırı", path: ["growth", "clampMin"] },
  { key: "growthClampMax", label: "Gelişim üst sınırı", path: ["growth", "clampMax"] },
  { key: "awardReferenceValue", label: "Ödül normalizasyon referansı", path: ["awardNormalization", "referenceValue"], hint: "Bu kadar ödül puanı %100 ödül skoru demektir." },
];

export const POSITION_GROUP_LABELS: Record<string, string> = {
  GOALKEEPER: "Kaleci",
  DEFENDER: "Defans",
  MIDFIELDER: "Orta Saha",
  FORWARD: "Forvet",
};

export const STAT_KEY_LABELS: Record<string, string> = {
  generalRatingScore: "Genel puan skoru",
  goalsPer90: "Gol / 90dk",
  assistsPer90: "Asist / 90dk",
  goalContributionsPer90: "Gol katkısı / 90dk",
  scoringMatchRatio: "Gollü maç oranı",
  savesPer90: "Kurtarış / 90dk",
  blocksPer90: "Kritik blok / 90dk",
  tacklesPer90: "İkili mücadele / 90dk",
  keyPassesPer90: "Yaratılan pozisyon / 90dk",
  cleanSheetRatio: "Gol yemeden bitirme oranı",
  goalsConcededPer90: "Yenilen gol / 90dk",
  penaltySaves: "Penaltı kurtarışı",
  duelWinRatio: "İkili mücadele kazanma oranı",
  shotsPer90: "Şut / 90dk",
};

export const CALC_REASON_LABELS: Record<string, string> = {
  INITIAL_CALCULATION: "Başlangıç hesabı",
  MATCH_COMPLETED: "Maç tamamlandı",
  MATCH_RATING_UPDATED: "Maç puanı güncellendi",
  MATCH_AWARD_UPDATED: "Maç ödülü güncellendi",
  WEEKLY_AWARD_PUBLISHED: "Haftanın enleri yayınlandı",
  WEEKLY_AWARD_REMOVED: "Haftanın enleri geri alındı",
  DISCIPLINE_UPDATED: "Disiplin güncellendi",
  NIGHTLY_RECALCULATION: "Gece toplu hesap",
  MANUAL_RECALCULATION: "Manuel yeniden hesap",
  MANUAL_ADJUSTMENT: "Yönetici düzeltmesi",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  MARKET_VALUE_INITIALIZE: "Başlangıç hesabı",
  BACKFILL_DEFAULT_RATINGS: "Eksik puan tamamlama (6.00)",
  MARKET_VALUE_RECALCULATE: "Yeniden hesap",
  MARKET_VALUE_SETTINGS_UPDATED: "Formül ayarı güncellendi",
  MARKET_VALUE_STAT_WEIGHTS_UPDATED: "Pozisyon ağırlıkları güncellendi",
  MARKET_VALUE_MANUAL_ADJUSTMENT: "Manuel değer düzeltmesi",
  MARKET_VALUE_FORMULA_CREATED: "Formül versiyonu oluşturuldu",
  MARKET_VALUE_FORMULA_ACTIVATED: "Formül versiyonu aktifleştirildi",
  TEAM_FINANCE_ENTRY_ADDED: "Takım kasa kaydı eklendi",
  TEAM_FINANCE_ENTRY_REMOVED: "Takım kasa kaydı silindi",
  TEAM_FINANCE_SETTINGS_UPDATED: "FFP ayarları güncellendi",
};

export const RANKING_SORTS = [
  { key: "marketValue", label: "Değer" },
  { key: "marketValueChange", label: "Değişim" },
  { key: "marketScore", label: "Skor" },
  { key: "goals", label: "Gol" },
  { key: "matches", label: "Maç" },
];

/* ---------- ayarlar ---------- */

export type MarketSettings = Record<string, Record<string, unknown> & { points?: Record<string, number> }> & {
  componentWeights?: Record<string, number>;
  awardPoints?: Record<string, number>;
};

export interface StatWeightRow {
  position: string;
  stat_key: string;
  weight: number | string;
  is_active: number | boolean;
  normalization_type?: string;
  reference_value?: number | null;
  is_negative?: boolean | number;
}

export interface SettingsResponse {
  settings: MarketSettings;
  statWeights?: Record<string, StatWeightRow[]>;
}

const A = "/api/admin/market-value";

export const getMarketSettings = () => get<SettingsResponse>(`${A}/settings`);

export const updateMarketSettings = (settings: Partial<MarketSettings>) =>
  put<{ settings: MarketSettings }>(`${A}/settings`, { settings });

export const updateStatWeights = (weights: { position: string; stat_key: string; weight: number; is_active: boolean }[]) =>
  put<unknown>(`${A}/stat-weights`, { weights });

export interface AuditRow {
  id: number;
  action: string;
  user_id?: number | null;
  user_name?: string | null;
  createdAt?: string | null;
  new_data?: unknown;
}

export const getAuditLog = () => get<{ items?: AuditRow[]; total?: number }>(`${A}/audit-log`, { limit: 50 });

export interface FormulaVersion {
  id: number;
  version: string;
  name?: string | null;
  is_active?: boolean | number;
}

export const getFormulaVersions = () => get<{ items?: FormulaVersion[] }>(`${A}/formula-versions`).then((d) => d.items ?? []);

export const activateFormulaVersion = (id: number) => post<unknown>(`${A}/formula-versions/${id}/activate`);

/* ---------- hesaplama ---------- */

/** Toplu yeniden hesap: oyuncu verilmezse sunucu kapsamdaki tüm oyuncuları bulur. */
export const recalculateAll = (body: { cityId?: number | null; seasonId?: number | null; dryRun?: boolean } = {}) =>
  post<{ processed: number; dryRun: boolean }>(`${A}/recalculate`, { ...body, reason: "MANUAL_RECALCULATION" }, { timeout: 120_000 });

export const recalculatePlayer = (playerId: number) =>
  post<{ playerId: number; currentValue?: number; newValue?: number; message?: string }>(`${A}/recalculate/${playerId}`, {});

export const adjustPlayerValue = (playerId: number, newValue: number, note: string) =>
  post<{ oldValue: number; newValue: number }>(`${A}/players/${playerId}/adjust`, { newValue, note });

/* ---------- okuma ---------- */

export interface RankingRow {
  playerId: number;
  playerName: string;
  playerImg: string | null;
  teamId: number | null;
  position: string | null;
  positionGroup?: string | null;
  currentValue: number;
  previousValue: number | null;
  marketScore?: number | null;
  globalRank: number | null;
  cityRank: number | null;
  positionRank: number | null;
  totalGoals?: number;
  totalMatches?: number;
  changeAmount?: number;
  changePercentage?: number;
}

export const getRankings = (q: { offset: number; sort: string; position?: string; search?: string; cityId?: number | null }) =>
  get<{ items?: RankingRow[]; total?: number }>("/api/market-values/rankings", {
    limit: 50,
    offset: q.offset,
    sort: q.sort,
    position: q.position || undefined,
    search: q.search?.trim() || undefined,
    cityId: q.cityId ?? undefined,
  });

export interface PlayerMarketValue {
  currentValue: number;
  previousValue?: number | null;
  changeAmount: number;
  changePercentage: number;
  marketScore: number;
  globalRank: number | null;
  cityRank: number | null;
  positionRank: number | null;
  positionGroup?: string | null;
  growthPoints?: number;
  lastCalculatedAt?: string | null;
}

export const getPlayerMarketValue = (playerId: number) => get<PlayerMarketValue>(`/api/players/${playerId}/market-value`);

export const getPlayerBreakdown = (playerId: number) =>
  get<{ breakdown?: Record<string, number> | null }>(`/api/players/${playerId}/market-value/breakdown`).then((d) => d.breakdown ?? null);

export interface MarketHistoryRow {
  id: number;
  calculation_reason: string;
  old_value: number | null;
  new_value: number;
  createdAt?: string | null;
}

export const getPlayerHistory = (playerId: number) =>
  get<{ items?: MarketHistoryRow[] }>(`/api/players/${playerId}/market-value/history`, { limit: 10 }).then((d) => d.items ?? []);

export function formatEtl(value: unknown): string {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("tr-TR")} ETL`;
}

/** "1.234,5" gibi girdileri sayıya çevirir. */
export const parseNumber = (value: unknown): number => {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};
