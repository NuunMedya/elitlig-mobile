import { ApiError, del, get, patch, post, put } from "../../http";
import { normalizeWorkbook, type Workbook } from "../../admin/sheetEngine";

/**
 * TABLOLAR — elitlig-server routes/tools.js + services/toolSheets.js.
 *
 *   GET    /api/tools/sheets                      → { items } kendi + benimle paylaşılanlar (veri gövdesi yok)
 *   GET    /api/tools/sheets/share-candidates?q=  → { items } paylaşılabilecek yönetim kullanıcıları
 *   GET    /api/tools/sheets/:id                  → { item } sayfalar, hücreler, erişim, paylaşımlar
 *   GET    /api/tools/sheets/:id/version          → { version, updated_by_name } (canlı yenileme)
 *   POST   /api/tools/sheets                      → { item } { title, data }
 *   PATCH  /api/tools/sheets/:id                  → { item } { data, title, starred, base_version }
 *                                                   409 VERSION_CONFLICT: details[0] = güncel item
 *   DELETE /api/tools/sheets/:id                  → yalnız sahip
 *   PUT    /api/tools/sheets/:id/shares           → { shares } yalnız sahip
 *   DELETE /api/tools/sheets/:id/shares/me        → paylaşımdan ayrıl
 *
 * Erişim: owner (her şey) · editor (içerik ve ad) · viewer (yalnız okur).
 */

export type SheetAccess = "owner" | "editor" | "viewer";
export type ShareRole = "viewer" | "editor";

export interface SheetShare {
  user_id: number;
  role: ShareRole;
  name: string;
  username: string | null;
  user_role: string | null;
  city: string | null;
}

export interface SheetMeta {
  id: number;
  user_id: number;
  title: string;
  starred: boolean;
  sheet_count: number;
  cell_count: number;
  version: number | null;
  updated_by: number | null;
  updated_by_name: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  access: SheetAccess;
  share_count?: number;
  owner?: { id: number; name: string | null };
  shares?: SheetShare[];
}

export interface SheetItem extends SheetMeta {
  data: Workbook;
}

export interface ShareCandidate {
  id: number;
  name: string;
  username: string;
  role: string;
  city: string | null;
}

export const ACCESS_LABELS: Record<SheetAccess, string> = {
  owner: "Sahibi",
  editor: "Düzenleyici",
  viewer: "Görüntüleyici",
};

export const SHARE_ROLES: { key: ShareRole; label: string; hint: string }[] = [
  { key: "viewer", label: "Görüntüleyebilir", hint: "Okur, dışa aktarır" },
  { key: "editor", label: "Düzenleyebilir", hint: "Hücreleri ve sayfaları değiştirir" },
];

const withData = (item: SheetItem): SheetItem => ({ ...item, data: normalizeWorkbook(item.data) });

export const listSheets = () => get<{ items: SheetMeta[] }>("/api/tools/sheets", undefined, { retry: false });

export const getSheet = async (id: number) => {
  const res = await get<{ item: SheetItem }>(`/api/tools/sheets/${id}`, undefined, { retry: false });
  return { item: withData(res.item) };
};

export const getSheetVersion = (id: number) =>
  get<{ id: number; version: number | null; updatedAt: string | null; updated_by: number | null; updated_by_name: string | null }>(
    `/api/tools/sheets/${id}/version`,
    undefined,
    { retry: false }
  );

export const createSheet = (title: string, data: Workbook) => post<{ item: SheetMeta }>("/api/tools/sheets", { title, data });

export const updateSheet = (
  id: number,
  body: { title?: string; starred?: boolean; data?: Workbook; base_version?: number | null }
) => patch<{ item: SheetMeta }>(`/api/tools/sheets/${id}`, { ...body, base_version: body.base_version ?? undefined });

export const deleteSheet = (id: number) => del<{ ok: true; id: number }>(`/api/tools/sheets/${id}`);

export const setSheetShares = (id: number, shares: { user_id: number; role: ShareRole }[]) =>
  put<{ shares: SheetShare[]; notified: number }>(`/api/tools/sheets/${id}/shares`, { shares });

export const leaveSheet = (id: number) => del<{ ok: true }>(`/api/tools/sheets/${id}/shares/me`);

export const shareCandidates = (q: string) =>
  get<{ items: ShareCandidate[] }>("/api/tools/sheets/share-candidates", { q: q || undefined }, { retry: false });

/** 409 VERSION_CONFLICT yanıtındaki güncel dosya (yoksa null). */
export function conflictItem(error: unknown): SheetItem | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const details = (error.detail as { details?: unknown[] } | null)?.details;
  const item = Array.isArray(details) ? (details[0] as SheetItem | undefined) : undefined;
  return item && item.data ? withData(item) : null;
}
