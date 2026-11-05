/**
 * Açık projenin durumu ve işlemleri (web ProjectContext.js karşılığı).
 *
 * NE: tek bir GET /:id yanıtı (aşamalar, adımlar, kişiler, sorular, geçmiş,
 * portföy, üyeler) React Query önbelleğinde tutulur; tüm sekmeler ve alt
 * sayfalar aynı kaynağı okur. Değişiklikler önce ekranda (iyimser), sonra
 * sunucuda yapılır; hata olursa eski hâline döner ve sunucunun cümlesi toast
 * olarak söylenir.
 *
 * NEDEN gecikmeli tazeleme: sunucu durum / aşama değişikliğinde iletişim
 * geçmişine kendiliğinden "durum" kaydı yazar. Bunu ekrana getirmek için
 * ilgili işlemlerden kısa süre sonra proje sessizce yeniden okunur.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

import { useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import {
  bulkLeads,
  bulkSteps,
  closeLead as apiCloseLead,
  createItem,
  createPortfolio,
  importDirectory,
  listPeople,
  projectKeys,
  removeItem,
  removePortfolio as apiRemovePortfolio,
  reorderProject,
  setProjectMembers,
  updateItem,
  updatePortfolio,
  updateProject,
  type Activity,
  type BulkStepInput,
  type CloseLeadInput,
  type CloseLeadResult,
  type ItemKind,
  type Lead,
  type LeadKind,
  type Person,
  type Phase,
  type PortfolioItem,
  type Project,
  type ProjectDetail,
  type ProjectInput,
  type Question,
  type Step,
} from "@/lib/api/admin/projects";
import { closedStages, leadStats, stepStats, type ProjectTab } from "@/lib/admin/projectUtils";

/** Sekmeye geçerken taşınan süzgeçler (web adres parametreleriyle aynı adlar). */
export interface TabParams {
  asama?: string;
  tur?: "musteri" | "tedarik";
  takip?: boolean;
  soru?: number;
  asamaid?: number;
}

export interface ProjectNav {
  tab: ProjectTab;
  params: TabParams;
  /** Her sekme geçişinde artar: sekmeler süzgeçlerini buna göre yeniden kurar. */
  version: number;
  go: (tab: ProjectTab, params?: TabParams) => void;
  openStep: (id: number) => void;
  closeStep: () => void;
  openLead: (id: number) => void;
  closeLead: () => void;
  /** Adımın proje içi aracı açıkken o adım (sekme adıma süzülü). */
  toolStep: Step | null;
  openTool: (step: Step) => void;
  closeTool: () => void;
}

type ListKey = "phases" | "steps" | "questions" | "leads" | "activities";

export interface ProjectOps {
  reload: () => Promise<unknown>;
  saveProject: (body: ProjectInput, opts?: { rethrow?: boolean }) => Promise<Project | null>;
  addPhase: (body: Partial<Phase>) => Promise<Phase | null>;
  savePhase: (id: number, body: Partial<Phase>) => Promise<Phase | null>;
  removePhase: (id: number, params?: Record<string, string>) => Promise<boolean>;
  addStep: (body: Partial<Step>) => Promise<Step | null>;
  saveStep: (id: number, body: Partial<Step>) => Promise<Step | null>;
  removeStep: (id: number) => Promise<boolean>;
  reorder: (order: { id: number; phase_id: number | null }[] | null, phaseOrder?: number[]) => Promise<boolean>;
  bulkSteps: (body: { phase_id: number | null; items: BulkStepInput[] }) => Promise<{ created: number }>;
  addLead: (body: Partial<Lead>) => Promise<Lead | null>;
  saveLead: (id: number, body: Partial<Lead>) => Promise<Lead | null>;
  removeLead: (id: number) => Promise<boolean>;
  bulkLeads: (items: Record<string, unknown>[], kind: LeadKind) => Promise<{ created: number; skipped: number }>;
  importDirectory: (body: { items: { source: string; ref_id: number }[]; kind: LeadKind; stage?: string }) => Promise<{ created: number; skipped: number }>;
  logActivity: (body: Record<string, unknown>) => Promise<{ item: Activity; lead?: Lead | null } | null>;
  removeActivity: (id: number) => Promise<boolean>;
  closeLead: (id: number, body: CloseLeadInput) => Promise<CloseLeadResult | null>;
  addQuestion: (body: Partial<Question>) => Promise<Question | null>;
  saveQuestion: (id: number, body: Partial<Question>) => Promise<Question | null>;
  removeQuestion: (id: number) => Promise<boolean>;
  addPortfolio: (body: Partial<PortfolioItem>) => Promise<PortfolioItem | null>;
  savePortfolio: (id: number, body: Partial<PortfolioItem>) => Promise<PortfolioItem | null>;
  removePortfolio: (id: number) => Promise<boolean>;
  setMembers: (members: { user_id: number; role: string }[]) => Promise<ProjectDetail["members"] | null>;
}

export interface ProjectCtxValue {
  id: number;
  data: ProjectDetail;
  project: Project;
  settings: Project["settings"];
  canEdit: boolean;
  isOwner: boolean;
  closed: Set<string>;
  stats: {
    steps: ReturnType<typeof stepStats>;
    leads: ReturnType<typeof leadStats>;
    suppliers: ReturnType<typeof leadStats>;
  };
  directory: Person[];
  me: number | null;
  personName: (id: number | null | undefined) => string;
  ops: ProjectOps;
  nav: ProjectNav;
  notify: (message: string, tone?: "success" | "danger" | "neutral", action?: { label: string; onPress: () => void }) => void;
}

const Ctx = createContext<ProjectCtxValue | null>(null);

export function useProject(): ProjectCtxValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useProject: ProjectProvider dışında kullanıldı.");
  return value;
}

/** Yönetim kullanıcıları (atanan, rol eşleme, üye seçimi) — uzun önbellekli. */
export function usePeopleDirectory() {
  return useQuery({
    queryKey: projectKeys.people,
    queryFn: () => listPeople().then((r) => r.items ?? []),
    staleTime: 10 * 60_000,
  });
}

const byId = <T extends { id: number }>(list: T[], item: T) => list.map((x) => (x.id === item.id ? { ...x, ...item } : x));
const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

export function ProjectProvider({
  id,
  data,
  nav,
  children,
}: {
  id: number;
  data: ProjectDetail;
  nav: ProjectNav;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const people = usePeopleDirectory();
  const key = projectKeys.detail(id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const notify = useCallback<ProjectCtxValue["notify"]>(
    (message, tone = "success", action) => toast.show({ message, tone, action }),
    [toast]
  );

  const ops = useMemo<ProjectOps>(() => {
    const read = () => queryClient.getQueryData<ProjectDetail>(key) ?? dataRef.current;
    const write = (fn: (d: ProjectDetail) => ProjectDetail) =>
      queryClient.setQueryData<ProjectDetail>(key, (d) => (d ? fn(d) : d));
    const fail = (err: unknown, fallback: string) => notify(errorText(err, fallback), "danger");
    /** Ana sayfa listesi ve takip istatistikleri bayatladı (geri dönünce tazelenir). */
    const touchLists = () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "projects", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "projects", "followups"] });
    };
    const reload = () => queryClient.invalidateQueries({ queryKey: key, exact: true });
    const refreshSoon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void reload(), 700);
    };

    async function create<T extends { id: number }>(kind: ItemKind, body: Record<string, unknown>, prepend = false): Promise<T | null> {
      try {
        const res = await createItem<T>(id, kind, body);
        write((d) => ({ ...d, [kind]: prepend ? [res.item, ...(d[kind as ListKey] as unknown as T[])] : [...(d[kind as ListKey] as unknown as T[]), res.item] }));
        touchLists();
        return res.item;
      } catch (err) {
        fail(err, "Kaydedilemedi.");
        return null;
      }
    }
    async function patchItem<T extends { id: number }>(kind: ItemKind, itemId: number, body: Record<string, unknown>): Promise<T | null> {
      const list = read()[kind as ListKey] as unknown as T[];
      const prev = list.find((x) => x.id === itemId);
      if (prev) write((d) => ({ ...d, [kind]: byId(d[kind as ListKey] as unknown as T[], { ...prev, ...body, id: itemId } as T) }));
      try {
        const res = await updateItem<T>(id, kind, itemId, body);
        write((d) => ({ ...d, [kind]: byId(d[kind as ListKey] as unknown as T[], res.item) }));
        touchLists();
        return res.item;
      } catch (err) {
        if (prev) write((d) => ({ ...d, [kind]: byId(d[kind as ListKey] as unknown as T[], prev) }));
        fail(err, "Güncellenemedi.");
        return null;
      }
    }
    async function removeOne(kind: ItemKind, itemId: number, params?: Record<string, string>): Promise<boolean> {
      const before = read()[kind as ListKey];
      write((d) => ({ ...d, [kind]: (d[kind as ListKey] as { id: number }[]).filter((x) => x.id !== itemId) }));
      try {
        await removeItem(id, kind, itemId, params);
        touchLists();
        return true;
      } catch (err) {
        write((d) => ({ ...d, [kind]: before }));
        fail(err, "Silinemedi.");
        return false;
      }
    }

    return {
      reload,
      saveProject: async (body, opts) => {
        try {
          const res = await updateProject(id, body);
          write((d) => ({ ...d, item: { ...d.item, ...res.item } }));
          touchLists();
          if (body.status) refreshSoon();
          return res.item;
        } catch (err) {
          if (opts?.rethrow) throw err;
          fail(err, "Proje kaydedilemedi.");
          return null;
        }
      },

      addPhase: (body) => create<Phase>("phases", body as Record<string, unknown>),
      savePhase: (pid, body) => patchItem<Phase>("phases", pid, body as Record<string, unknown>),
      removePhase: async (pid, params) => {
        const ok = await removeOne("phases", pid, params);
        if (ok) await reload();
        return ok;
      },

      addStep: (body) => create<Step>("steps", body as Record<string, unknown>),
      saveStep: async (sid, body) => {
        const item = await patchItem<Step>("steps", sid, body as Record<string, unknown>);
        if (item && has(body, "status")) refreshSoon();
        return item;
      },
      removeStep: (sid) => removeOne("steps", sid),
      reorder: async (order, phaseOrder) => {
        const before = read();
        write((d) => {
          const pos = new Map<number, { phase_id: number | null; position: number }>();
          const counters = new Map<number | null, number>();
          (order || []).forEach((s) => {
            const n = counters.get(s.phase_id) || 0;
            counters.set(s.phase_id, n + 1);
            pos.set(s.id, { phase_id: s.phase_id, position: n });
          });
          const phasePos = new Map((phaseOrder || []).map((pid, i) => [pid, i]));
          return {
            ...d,
            steps: d.steps.map((s) => (pos.has(s.id) ? { ...s, ...pos.get(s.id)! } : s)),
            phases: phaseOrder ? d.phases.map((p) => (phasePos.has(p.id) ? { ...p, position: phasePos.get(p.id)! } : p)) : d.phases,
          };
        });
        try {
          await reorderProject(id, { ...(order ? { steps: order } : {}), ...(phaseOrder ? { phases: phaseOrder } : {}) });
          return true;
        } catch (err) {
          queryClient.setQueryData(key, before);
          fail(err, "Sıralama kaydedilemedi.");
          return false;
        }
      },
      bulkSteps: async (body) => {
        const res = await bulkSteps(id, body);
        await reload();
        touchLists();
        return res;
      },

      addLead: (body) => create<Lead>("leads", body as Record<string, unknown>, true),
      saveLead: async (lid, body) => {
        const item = await patchItem<Lead>("leads", lid, body as Record<string, unknown>);
        if (item && has(body, "stage")) refreshSoon();
        return item;
      },
      removeLead: async (lid) => {
        const ok = await removeOne("leads", lid);
        if (ok) write((d) => ({ ...d, activities: d.activities.filter((a) => a.lead_id !== lid) }));
        return ok;
      },
      bulkLeads: async (items, kind) => {
        const res = await bulkLeads(id, { items, kind });
        await reload();
        touchLists();
        return res;
      },
      importDirectory: async (body) => {
        const res = await importDirectory(id, body);
        await reload();
        touchLists();
        return res;
      },
      logActivity: async (body) => {
        try {
          const res = await createItem<Activity>(id, "activities", body);
          const prev = res.lead ? read().leads.find((l) => l.id === res.lead!.id) : null;
          write((d) => ({
            ...d,
            activities: [res.item, ...d.activities],
            leads: res.lead ? byId(d.leads, res.lead) : d.leads,
          }));
          touchLists();
          if (prev && res.lead && prev.stage !== res.lead.stage) refreshSoon();
          return res;
        } catch (err) {
          fail(err, "Kayıt eklenemedi.");
          return null;
        }
      },
      removeActivity: (aid) => removeOne("activities", aid),
      closeLead: async (lid, body) => {
        try {
          const res = await apiCloseLead(id, lid, body);
          write((d) => ({
            ...d,
            leads: byId(d.leads, res.lead),
            portfolio: res.portfolio ? [res.portfolio, ...d.portfolio] : d.portfolio,
          }));
          touchLists();
          void queryClient.invalidateQueries({ queryKey: projectKeys.finance(id) });
          void queryClient.invalidateQueries({ queryKey: projectKeys.portfolio });
          refreshSoon();
          return res;
        } catch (err) {
          fail(err, "İşlem tamamlanamadı.");
          return null;
        }
      },

      addQuestion: (body) => create<Question>("questions", body as Record<string, unknown>, true),
      saveQuestion: (qid, body) => patchItem<Question>("questions", qid, body as Record<string, unknown>),
      removeQuestion: (qid) => removeOne("questions", qid),

      addPortfolio: async (body) => {
        try {
          const res = await createPortfolio({ ...body, project_id: id });
          write((d) => ({ ...d, portfolio: [res.item, ...d.portfolio] }));
          void queryClient.invalidateQueries({ queryKey: projectKeys.portfolio });
          touchLists();
          return res.item;
        } catch (err) {
          fail(err, "Portföy kaydı eklenemedi.");
          return null;
        }
      },
      savePortfolio: async (pid, body) => {
        try {
          const res = await updatePortfolio(pid, body);
          write((d) => ({ ...d, portfolio: byId(d.portfolio, res.item) }));
          void queryClient.invalidateQueries({ queryKey: projectKeys.portfolio });
          return res.item;
        } catch (err) {
          fail(err, "Portföy kaydı güncellenemedi.");
          return null;
        }
      },
      removePortfolio: async (pid) => {
        try {
          await apiRemovePortfolio(pid);
          write((d) => ({
            ...d,
            portfolio: d.portfolio.filter((p) => p.id !== pid),
            leads: d.leads.map((l) => (l.portfolio_id === pid ? { ...l, portfolio_id: null } : l)),
          }));
          void queryClient.invalidateQueries({ queryKey: projectKeys.portfolio });
          touchLists();
          return true;
        } catch (err) {
          fail(err, "Silinemedi.");
          return false;
        }
      },
      setMembers: async (members) => {
        try {
          const res = await setProjectMembers(id, members);
          write((d) => ({ ...d, members: res.members }));
          touchLists();
          return res.members;
        } catch (err) {
          fail(err, "Üyeler kaydedilemedi.");
          return null;
        }
      },
    };
  }, [id, key, notify, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const directory = useMemo(() => people.data ?? [], [people.data]);

  const value = useMemo<ProjectCtxValue>(() => {
    const settings = data.item.settings;
    const peopleMap: Record<string, { name: string }> = {
      ...Object.fromEntries(directory.map((u) => [String(u.id), u])),
      ...(data.people || {}),
    };
    return {
      id,
      data,
      project: data.item,
      settings,
      canEdit: Boolean(data.item.access?.can_edit),
      isOwner: Boolean(data.item.access?.is_owner),
      closed: closedStages(settings),
      stats: {
        steps: stepStats(data.steps),
        leads: leadStats(data.leads, settings),
        suppliers: leadStats(data.leads, settings, "supplier"),
      },
      directory,
      me: directory.find((u) => u.me)?.id ?? null,
      personName: (uid) => (uid == null ? "" : peopleMap[String(uid)]?.name || `#${uid}`),
      ops,
      nav,
      notify,
    };
  }, [data, directory, id, nav, notify, ops]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
