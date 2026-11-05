import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { hasAnyPermission } from "@/lib/admin/access";
import { useAuth } from "@/providers/AuthProvider";

import { get } from "../../http";
import { getTodos, getTodoSummary, todoKeys, type TodoSummary, type TodoTask } from "../todos";

/**
 * KONTROL PANELİ ÖZETİ — web /editor (editor_pages/Editor.js) kartlarının verisi.
 *
 * Web ile aynı uçlar, aynı yetki süzgeci:
 *   GET /api/admin/dashboard-counts       takım / oyuncu / maç sayısı (il kapsamlı)
 *   GET /api/chat/content/matches         bugünün maçları + maç personeli (İstanbul günü)
 *   GET /api/todos/summary                açık / geciken / bugün / maç görevi
 *   GET /api/todos?view=mine&status=active  ilk 5 açık kart
 *   GET /api/admin/requests/summary       bekleyen talepler, kategori kategori
 *   GET /api/chat/unread-count            okunmamış mesaj
 *
 * NEDEN AYRI SORGULAR: biri 403 ya da hata dönse bile diğer kartlar çizilsin
 * (web Promise.allSettled ile aynı davranış). `retry: false`: yetki hatası
 * tekrar denenmez, kart sessizce "yüklenemedi" der.
 */

export const MATCH_PERMISSIONS = ["matches.view", "matches.create", "matches.update", "matches.live", "venues.view", "staff.view", "staff.assign"];
export const TEAM_PERMISSIONS = ["teams.create", "teams.update", "teams.delete", "teams.directory"];
export const PLAYER_PERMISSIONS = ["players.create", "players.update", "players.delete"];

export interface DashboardCounts {
  scope: string;
  teams: number;
  players: number;
  matches: number;
}

export interface DayMatch {
  id: number;
  date: string;
  time: string | null;
  home: string;
  away: string;
  home_score: number | null;
  away_score: number | null;
  field: string | null;
  league: string | null;
  city: string | null;
  crew: Record<string, { name?: string | null } | null>;
}

export type MatchPhase = "upcoming" | "live" | "done" | "late";

export const MATCH_PHASE_LABELS: Record<MatchPhase, string> = {
  upcoming: "Sırada",
  live: "Oynanıyor",
  done: "Bitti",
  late: "Sonuç bekleniyor",
};

export interface RequestCategory {
  key: string;
  label: string;
  open: number;
  path?: string;
}

export interface RequestsSummary {
  total: number;
  categories: RequestCategory[];
}

/** Hızlı işlemler — web adminNav COMMAND_ACTIONS'ın mobil rotalı karşılığı. */
export interface QuickAction {
  key: string;
  label: string;
  icon: "add-circle-outline" | "newspaper-outline" | "hammer-outline" | "people-outline" | "shuffle-outline" | "checkbox-outline" | "file-tray-full-outline" | "person-circle-outline";
  route: string;
  permissions?: string[];
}

export const QUICK_ACTIONS: QuickAction[] = [
  { key: "new-match", label: "Yeni maç", icon: "add-circle-outline", route: "/yonetim/mac-olustur", permissions: ["matches.create"] },
  { key: "new-news", label: "Haber yayınla", icon: "newspaper-outline", route: "/yonetim/haberler", permissions: ["news.create"] },
  { key: "new-penalty", label: "Yeni ceza", icon: "hammer-outline", route: "/yonetim/ceza-yeni", permissions: ["penalties.create"] },
  { key: "bulk-staff", label: "Personel ata", icon: "people-outline", route: "/yonetim/toplu-atama", permissions: ["staff.assign"] },
  { key: "run-draw", label: "Kura çek", icon: "shuffle-outline", route: "/yonetim/kura", permissions: ["draws.run"] },
  { key: "new-todo", label: "Yeni görev", icon: "checkbox-outline", route: "/yonetim/gorev-yeni" },
  { key: "open-requests", label: "Bekleyen talepler", icon: "file-tray-full-outline", route: "/yonetim/talepler" },
  { key: "account", label: "Hesabım", icon: "person-circle-outline", route: "/yonetim/hesabim" },
];

export const getDashboardCounts = () => get<DashboardCounts>("/api/admin/dashboard-counts", undefined, { retry: false });
export const getMatchesOfDay = () =>
  get<{ date: string; items: DayMatch[] }>("/api/chat/content/matches", undefined, { retry: false }).then((d) => d.items ?? []);
export const getRequestsSummary = () =>
  get<RequestsSummary>("/api/admin/requests/summary", undefined, { retry: false }).then((d) => ({
    total: Number(d?.total || 0),
    categories: (d?.categories ?? []).map((c) => ({ ...c, open: Number(c.open || 0) })),
  }));
export const getUnreadMessages = () =>
  get<{ count: number }>("/api/chat/unread-count", undefined, { retry: false }).then((d) => Number(d?.count || 0));

/** Maçın şu anki durumu (saat ve skora göre tahmini) — web Editor.matchPhase. */
export function matchPhase(match: Pick<DayMatch, "time" | "home_score" | "away_score">, now = new Date()): MatchPhase {
  const scored = match.home_score != null && match.away_score != null;
  if (!match.time) return scored ? "done" : "upcoming";
  const [h, m] = String(match.time).split(":").map(Number);
  // Saat İstanbul saatidir; cihazın saat dilimi ne olursa olsun İstanbul'a göre kıyaslanır.
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(now)
    .split(":")
    .map(Number);
  const minutes = parts[0] * 60 + parts[1] - ((h || 0) * 60 + (m || 0));
  if (minutes < 0) return "upcoming";
  if (minutes <= 75) return "live";
  return scored ? "done" : "late";
}

export const dashboardKeys = {
  all: ["admin", "dashboard"] as const,
  counts: ["admin", "dashboard", "counts"] as const,
  matches: ["admin", "dashboard", "matches-of-day"] as const,
  requests: ["admin", "dashboard", "requests-summary"] as const,
  unread: ["admin", "dashboard", "unread"] as const,
  todos: ["admin", "todos", "list", "dashboard"] as const,
};

const POLL_MS = 60_000;

export interface AdminDashboard {
  canMatches: boolean;
  canTeams: boolean;
  canPlayers: boolean;
  counts: DashboardCounts | null;
  matches: (DayMatch & { phase: MatchPhase })[] | null;
  liveCount: number;
  requests: RequestsSummary | null;
  /** Bekleyen talebi olan kategoriler, çoktan aza. */
  openCategories: RequestCategory[];
  todoSummary: TodoSummary | null;
  todos: TodoTask[];
  unread: number | null;
  quickActions: QuickAction[];
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
}

/**
 * Kontrol paneli verisi. Uygulama ön plandayken dakikada bir tazelenir
 * (web 60 sn'lik kabuk sayaçlarıyla aynı aralık).
 */
export function useAdminDashboard(): AdminDashboard {
  const auth = useAuth();
  const appActive = useAppActive();
  const queryClient = useQueryClient();
  const user = auth.user;
  const enabled = Boolean(user) && auth.isManagement;
  const poll = appActive ? POLL_MS : false;

  const canMatches = hasAnyPermission(user, MATCH_PERMISSIONS);
  const canTeams = hasAnyPermission(user, TEAM_PERMISSIONS);
  const canPlayers = hasAnyPermission(user, PLAYER_PERMISSIONS);

  const counts = useQuery({
    queryKey: dashboardKeys.counts,
    queryFn: getDashboardCounts,
    enabled: enabled && (canTeams || canPlayers || canMatches),
    staleTime: 60_000,
    retry: false,
  });
  const matches = useQuery({
    queryKey: dashboardKeys.matches,
    queryFn: getMatchesOfDay,
    enabled: enabled && canMatches,
    refetchInterval: poll,
    staleTime: 30_000,
    retry: false,
  });
  const requests = useQuery({
    queryKey: dashboardKeys.requests,
    queryFn: getRequestsSummary,
    enabled,
    refetchInterval: poll,
    staleTime: 30_000,
    retry: false,
  });
  const todoSummary = useQuery({
    queryKey: todoKeys.summary(),
    queryFn: getTodoSummary,
    enabled,
    refetchInterval: poll,
    staleTime: 15_000,
    retry: false,
  });
  const todos = useQuery({
    queryKey: dashboardKeys.todos,
    queryFn: () => getTodos("mine", "active").then((items) => items.slice(0, 5)),
    enabled,
    refetchInterval: poll,
    staleTime: 15_000,
    retry: false,
  });
  const unread = useQuery({
    queryKey: dashboardKeys.unread,
    queryFn: getUnreadMessages,
    enabled,
    refetchInterval: poll,
    staleTime: 30_000,
    retry: false,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    void queryClient.invalidateQueries({ queryKey: todoKeys.all });
  }, [queryClient]);

  return useMemo(() => {
    const now = new Date();
    const dayMatches = matches.data ? matches.data.map((m) => ({ ...m, phase: matchPhase(m, now) })) : null;
    const openCategories = (requests.data?.categories ?? []).filter((c) => c.open > 0).sort((a, b) => b.open - a.open);
    return {
      canMatches,
      canTeams,
      canPlayers,
      counts: counts.data ?? null,
      matches: dayMatches,
      liveCount: dayMatches?.filter((m) => m.phase === "live").length ?? 0,
      requests: requests.data ?? null,
      openCategories,
      todoSummary: todoSummary.data ?? null,
      todos: todos.data ?? [],
      unread: unread.data ?? null,
      quickActions: QUICK_ACTIONS.filter((a) => !a.permissions || hasAnyPermission(user, a.permissions)),
      loading: requests.isLoading || todoSummary.isLoading || (canMatches && matches.isLoading),
      refreshing: requests.isRefetching || todoSummary.isRefetching || matches.isRefetching,
      refresh,
    };
  }, [
    canMatches,
    canTeams,
    canPlayers,
    counts.data,
    matches.data,
    matches.isLoading,
    matches.isRefetching,
    requests.data,
    requests.isLoading,
    requests.isRefetching,
    todoSummary.data,
    todoSummary.isLoading,
    todoSummary.isRefetching,
    todos.data,
    unread.data,
    user,
    refresh,
  ]);
}
