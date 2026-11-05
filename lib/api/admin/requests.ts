import type Ionicons from "@expo/vector-icons/Ionicons";

import { del, get, patch, post, put } from "../../http";

/**
 * Talepler (onay merkezi) — elitlig-server routes/adminRequests.js +
 * services/chat/managementInbox.js. Web karşılığı: src/api/requestsApi.js,
 * src/pages/management/talepler/Talepler.js.
 *
 *   GET  /api/admin/requests           ?category=&status=open|info|resolved|all&q=&page=&limit=
 *   GET  /api/admin/requests/summary   { total, categories: [{ key, label, icon, open, path }] }
 *   POST /api/admin/requests/:id/dismiss  { label }  elle kapat ("not" olarak da yazılır)
 *
 * Onay / ret düğmeleri talebin `actions` listesinden gelir: `api` alanı olan
 * düğme ilgili mevcut uca gider (her uç kendi yetkisini denetler), `web` /
 * `mobile` alanı olan düğme ilgili sayfayı açar.
 */

export type RequestStatus = "open" | "info" | "resolved";

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  open: "Bekleyen",
  info: "Bilgilendirme",
  resolved: "Sonuçlanan",
};

export interface RequestCategory {
  key: string;
  label: string;
  icon?: string;
  open: number;
  path?: string;
}

/** constants/chatActions.js INBOX_CATEGORIES — özet gelmeden önce kullanılır. */
export const FALLBACK_CATEGORIES: RequestCategory[] = [
  { key: "profile", label: "Profil Değişiklikleri", open: 0 },
  { key: "account", label: "Sahiplenme ve Yetki", open: 0 },
  { key: "registration", label: "Yeni Üyeler", open: 0 },
  { key: "transfer", label: "Transferler", open: 0 },
  { key: "roster", label: "Kadrolar", open: 0 },
  { key: "match_request", label: "Maç Talepleri", open: 0 },
  { key: "match", label: "Maç Kadroları", open: 0 },
  { key: "penalty", label: "Disiplin", open: 0 },
  { key: "availability", label: "Müsaitlik", open: 0 },
  { key: "message", label: "Mesajlar", open: 0 },
  { key: "general", label: "Diğer", open: 0 },
];

/** Kategori ikonu (sunucu Font Awesome adı gönderir; mobil Ionicons kullanır). */
export const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  profile: "create-outline",
  account: "id-card-outline",
  registration: "person-add-outline",
  transfer: "swap-horizontal-outline",
  roster: "list-outline",
  match_request: "calendar-outline",
  match: "football-outline",
  penalty: "hammer-outline",
  availability: "time-outline",
  message: "chatbubble-ellipses-outline",
  general: "notifications-outline",
};

export interface RequestAction {
  key: string;
  label: string;
  style?: "primary" | "secondary" | "danger";
  api?: { method?: string; url: string; body?: Record<string, unknown>; confirm?: string } | null;
  web?: string;
  mobile?: string;
}

/** managementInbox.serializeRequest. */
export interface ManagementRequest {
  id: number;
  type: string;
  category: string;
  title: string;
  description: string;
  entity_type: string | null;
  entity_public_id: string | null;
  actions: RequestAction[];
  extra: Record<string, unknown> | null;
  team_id: number | null;
  player_id: number | null;
  actor_user_id: number | null;
  actor?: { id: number; name: string; role: string };
  city: string | null;
  informational: boolean;
  status: RequestStatus;
  resolved_at: string | null;
  resolved_label: string | null;
  resolved_by: number | null;
  created_at: string | null;
  path: string;
}

export interface RequestPage {
  items: ManagementRequest[];
  total: number;
  page: number;
  has_more: boolean;
}

export const listRequests = (params: { category?: string; status?: RequestStatus; q?: string; page?: number; limit?: number }) =>
  get<RequestPage>("/api/admin/requests", { limit: 30, ...params }, { retry: false });

export const getRequestsSummary = () =>
  get<{ total: number; categories: RequestCategory[] }>("/api/admin/requests/summary", undefined, { retry: false }).then((d) => ({
    total: Number(d?.total ?? 0),
    categories: (d?.categories ?? []).map((c) => ({ ...c, open: Number(c.open ?? 0) })),
  }));

export const dismissRequest = (id: number, label?: string) =>
  post<{ item: ManagementRequest }>(`/api/admin/requests/${encodeURIComponent(String(id))}/dismiss`, label ? { label } : {});

/** Talep düğmesi: { api: { method, url, body } } mevcut uca gider (web runAction). */
export function runRequestAction(action: RequestAction): Promise<{ message?: string } | null> {
  const api = action.api;
  if (!api) return Promise.resolve(null);
  const method = String(api.method || "POST").toUpperCase();
  if (method === "GET") return get(api.url);
  if (method === "DELETE") return del(api.url);
  if (method === "PATCH") return patch(api.url, api.body ?? {});
  if (method === "PUT") return put(api.url, api.body ?? {});
  return post(api.url, api.body ?? {});
}

/**
 * Web panel yolunu mobil yerel yönetim rotasına çevirir. Tanınmayan yol
 * null döner (o düğme gizlenir; WebView kullanılmaz).
 */
export function adminPathToRoute(path: string | null | undefined): string | null {
  if (!path) return null;
  const [pathname, search = ""] = path.split("?");
  const qs = new URLSearchParams(search);
  const penalty = pathname.match(/^\/editor\/cezalar\/([^/]+)$/);
  if (penalty) return `/yonetim/cezalar/${penalty[1]}`;
  const member = qs.get("uye");
  if (pathname === "/yonetim/admin/kullanicilar") {
    if (member) return `/yonetim/uyeler/${member}`;
    const section = qs.get("bolum");
    return section === "changes" || section === "requests" ? `/yonetim/uyeler?bolum=${section}` : "/yonetim/uyeler";
  }
  const table: Record<string, string> = {
    "/yonetim/talepler": "/yonetim/talepler",
    "/yonetim/admin/savunmalar": "/yonetim/savunmalar",
    "/editor/cezalar": "/yonetim/cezalar",
    "/yonetim/admin/transfer-onaylari": "/yonetim/transfer-onaylari",
    "/editor/kadrolar": "/yonetim/kadrolar",
    "/editor/sahalar": "/yonetim/sahalar",
    "/editor/maclar": "/yonetim/maclar",
    "/editor/musaitlik": "/yonetim/musaitlik",
    "/yonetim/araclar/mesajlar": "/yonetim/sohbet",
    "/editor/oyuncular": "/yonetim/oyuncular",
    "/editor/takimlar": "/yonetim/takimlar",
    "/yonetim/admin/sifre-talepleri": "/yonetim/sifre-talepleri",
    "/editor/premium-onaylari": "/yonetim/premium",
    "/editor/haberler": "/yonetim/haberler",
  };
  if (table[pathname]) return table[pathname];
  if (pathname.startsWith("/editor/takimlar/")) return "/yonetim/takimlar";
  if (pathname.startsWith("/editor/oyuncular/")) return "/yonetim/oyuncular";
  return null;
}

/** Düğmenin açacağı uygulama rotası: önce `mobile`, yoksa web yolunun karşılığı. */
export const actionRoute = (action: RequestAction): string | null => action.mobile || adminPathToRoute(action.web);

/** Talebin sahibine giden rota (web actorLink). */
export function actorRoute(item: ManagementRequest): string | null {
  if (item.actor_user_id) return `/yonetim/uyeler/${item.actor_user_id}`;
  if (item.team_id) return `/takim/${item.team_id}`;
  if (item.player_id) return `/oyuncu/${item.player_id}`;
  return null;
}
