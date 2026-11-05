import { del, get, post, put } from "../../http";

/**
 * TAKIM FİNANSI & FFP uçları — routes/adminTeamFinance.js
 * (services/teamFinance). Web: src/api/teamFinanceApi.js.
 *
 *   GET    /api/admin/team-finance/overview?cityId&search   (team_finance.view)
 *   GET    /api/admin/team-finance/teams/:teamId            (team_finance.view)
 *   POST   /api/admin/team-finance/teams/:teamId/entries    (team_finance.manage) yalnız düzeltme kaydı
 *   DELETE /api/admin/team-finance/entries/:entryId         (team_finance.manage) yalnız düzeltme kaydı
 *   GET    /api/admin/team-finance/settings                 (team_finance.view)
 *   PUT    /api/admin/team-finance/settings                 (team_finance.manage)
 *
 * İl rolü yalnız kendi ilinin takımlarını görür; admin ?cityId ile süzer.
 */

export const TEAM_FINANCE_PERMISSIONS = ["team_finance.view", "team_finance.manage"] as const;

export type FfpStatus = "DISABLED" | "COMPLIANT" | "WARNING" | "BREACH";
export type TeamEntryType = "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT_INCOME" | "ADJUSTMENT_EXPENSE";

export const ENTRY_TYPE_LABELS: Record<TeamEntryType, string> = {
  TRANSFER_IN: "Oyuncu alımı (gider)",
  TRANSFER_OUT: "Oyuncu satışı (gelir)",
  ADJUSTMENT_INCOME: "Düzeltme — gelir",
  ADJUSTMENT_EXPENSE: "Düzeltme — gider",
};

export const FFP_STATUS_LABELS: Record<FfpStatus, string> = {
  DISABLED: "FFP kapalı",
  COMPLIANT: "Uyumlu",
  WARNING: "Sınırda",
  BREACH: "İhlal",
};

/** FFP durumunun rozet tonu. */
export const FFP_TONE: Record<FfpStatus, "win" | "warn" | "danger" | "neutral"> = {
  COMPLIANT: "win",
  WARNING: "warn",
  BREACH: "danger",
  DISABLED: "neutral",
};

export const FFP_CHECK_LABELS: Record<string, string> = {
  netSpend: "Net transfer harcaması",
  squadValue: "Kadro toplam değeri",
};

export const INCOME_TYPES: TeamEntryType[] = ["TRANSFER_OUT", "ADJUSTMENT_INCOME"];
export const MANUAL_TYPES: TeamEntryType[] = ["ADJUSTMENT_INCOME", "ADJUSTMENT_EXPENSE"];

export interface FfpSettings {
  enabled: boolean;
  maxNetSpend: number | null;
  maxSquadValue: number | null;
  warningThresholdPct: number;
}

export interface TeamFinanceRow {
  id: number;
  teamName: string;
  logo: string | null;
  city: string | null;
  cityId: number | null;
  league?: string | null;
  season?: string | null;
  playerCount: number;
  squadValue: number | null;
  avgValue: number | null;
  topValue: number | null;
  income: number;
  expense: number;
  netSpend: number;
  ffpStatus: FfpStatus;
}

export interface FfpCheck {
  key: string;
  value: number;
  limit: number;
  usagePct: number;
  status: string;
}

export interface TeamFinanceEntry {
  id: number;
  entryType: TeamEntryType;
  amount: number;
  currency: string | null;
  playerId: number | null;
  contractId: number | null;
  counterpartyTeamId: number | null;
  description: string | null;
  createdAt: string | null;
  playerName: string | null;
  counterpartyTeamName: string | null;
}

export interface TeamFinanceDetail {
  team: { id: number; teamName: string; logo: string | null; city: string | null; cityId: number | null; league: string | null; season: string | null };
  squad: { id: number; playerName: string; position: string | null; image: string | null; marketValue: number | null; marketScore: number | null; globalRank: number | null }[];
  squadValue: number;
  playerCount: number;
  entries: TeamFinanceEntry[];
  totals: { income: number; expense: number; netSpend: number };
  ffp: { enabled: boolean; status: FfpStatus; netSpend: number; checks: FfpCheck[] };
  settings: FfpSettings;
}

const B = "/api/admin/team-finance";

export const teamFinanceOverview = (params: { cityId?: number | string | null; search?: string } = {}) =>
  get<{ settings: FfpSettings | null; teams: TeamFinanceRow[] }>(`${B}/overview`, {
    cityId: params.cityId ?? undefined,
    search: params.search || undefined,
  });

export const teamFinanceDetail = (teamId: number) => get<TeamFinanceDetail>(`${B}/teams/${teamId}`);

export const addTeamFinanceEntry = (teamId: number, body: { entryType: TeamEntryType; amount: number; description: string }) =>
  post<TeamFinanceEntry>(`${B}/teams/${teamId}/entries`, body);

export const removeTeamFinanceEntry = (entryId: number) => del<{ removed: boolean; id: number }>(`${B}/entries/${entryId}`);

export const getFfpSettings = () => get<{ settings: FfpSettings }>(`${B}/settings`);

export const updateFfpSettings = (settings: FfpSettings) => put<{ settings: FfpSettings }>(`${B}/settings`, { settings });

/** "1.250.000 TRY" — web TeamFinanceAdmin.money. */
export function teamMoney(value: unknown, currency = "TRY"): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Math.round(Number(value)).toLocaleString("tr-TR")} ${currency}`;
}
