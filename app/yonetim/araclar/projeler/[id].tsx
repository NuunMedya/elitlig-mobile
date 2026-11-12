/**
 * PROJE AYRINTISI — Araçlar → Projeler → <proje> (web ProjectDetail karşılığı).
 *
 * Sekmeler: Genel bakış · Süreç · Kişiler · Bütçe · Sorular · İletişim ·
 * Portföy · Ayarlar. Adım ve kişi ayrıntıları alt sayfada açılır.
 *
 * DERİN BAĞLANTI (web adres parametreleriyle aynı adlar):
 *   ?sekme=genel|surec|kisiler|butce|sorular|iletisim|portfoy|ayarlar
 *   &adim=<id>          adım ayrıntısı açık
 *   &adim=<id>&arac=1   adımın proje içi aracı açık (sekme o adıma süzülü)
 *   &kisi=<id>          kişi kartı açık
 *   &asama=<anahtar>    Kişiler aşama süzgeci   &tur=musteri|tedarik
 *   &takip=1            Kişiler "bugün aranacak" süzgeci
 *   &soru=<id>          soru vurgulu            &asamaid=<id> süreçte o aşama
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen } from "@/components/admin";
import { Activity } from "@/components/admin/projects/Activity";
import { Budget } from "@/components/admin/projects/Budget";
import { LeadSheet } from "@/components/admin/projects/LeadSheet";
import { Leads } from "@/components/admin/projects/Leads";
import { Overview } from "@/components/admin/projects/Overview";
import { PortfolioList } from "@/components/admin/projects/Portfolio";
import { Process } from "@/components/admin/projects/Process";
import { ProjectProvider, useProject, type ProjectNav, type TabParams } from "@/components/admin/projects/ProjectContext";
import { Questions } from "@/components/admin/projects/Questions";
import { Settings } from "@/components/admin/projects/Settings";
import { StepSheet } from "@/components/admin/projects/StepSheet";
import { Pill, ProgressBar } from "@/components/admin/projects/ui";
import { StageChip, ToolStage } from "@/components/admin/tools/ToolKit";
import { Button, EmptyState, ErrorState, GradientBar, Reveal, SkeletonCard, SkeletonHero, Tabs, useToast, withAlpha } from "@/components/ui";
import { formatDate } from "@/lib/admin/format";
import { PROJECT_STATUS_META, TABS, TOOL_META, isProjectTab, projectIcon, stageOf, type ProjectTab } from "@/lib/admin/projectUtils";
import { getProject, projectKeys, type Lead, type Step } from "@/lib/api/admin/projects";
import { ApiError } from "@/lib/http";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

type RouteParams = {
  id?: string;
  sekme?: string;
  adim?: string;
  arac?: string;
  kisi?: string;
  asama?: string;
  tur?: string;
  takip?: string;
  soru?: string;
  asamaid?: string;
};

const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);

export default function ProjectDetailScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<RouteParams>();
  const id = num(params.id) ?? 0;
  const query = useQuery({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id), enabled: id > 0 });

  /* --------------------------- gezinme durumu --------------------------- */
  const [tab, setTab] = useState<ProjectTab>(isProjectTab(params.sekme) ? params.sekme : "genel");
  const [tabParams, setTabParams] = useState<TabParams>({});
  const [version, setVersion] = useState(0);
  const [stepId, setStepId] = useState<number | null>(null);
  const [leadId, setLeadId] = useState<number | null>(null);
  const [toolStepId, setToolStepId] = useState<number | null>(null);

  // Adres parametreleri değişince (bildirim, başka ekrandan bağlantı) durumu kur.
  const routeKey = JSON.stringify([params.sekme, params.adim, params.arac, params.kisi, params.asama, params.tur, params.takip, params.soru, params.asamaid]);
  useEffect(() => {
    const adim = num(params.adim);
    const toolMode = params.arac === "1" && adim != null;
    setTab(isProjectTab(params.sekme) ? params.sekme : adim && !toolMode ? "surec" : params.kisi ? "kisiler" : "genel");
    setTabParams({
      asama: params.asama || undefined,
      tur: params.tur === "tedarik" ? "tedarik" : params.tur === "musteri" ? "musteri" : undefined,
      takip: params.takip === "1" || undefined,
      soru: num(params.soru) ?? undefined,
      asamaid: num(params.asamaid) ?? undefined,
    });
    setVersion((v) => v + 1);
    setToolStepId(toolMode ? adim : null);
    setStepId(toolMode ? null : adim);
    setLeadId(num(params.kisi));
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = query.data;
  const step = data && stepId ? data.steps.find((s) => s.id === stepId) ?? null : null;
  const lead = data && leadId ? data.leads.find((l) => l.id === leadId) ?? null : null;
  const toolStep = data && toolStepId ? data.steps.find((s) => s.id === toolStepId) ?? null : null;

  // Silinmiş adım / kişi bağlantısı: alt sayfayı kapat, söyle.
  const warned = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (stepId && !step && warned.current !== `s${stepId}`) {
      warned.current = `s${stepId}`;
      toast.show({ message: "Adım bulunamadı (silinmiş olabilir).", tone: "danger" });
      setStepId(null);
    }
    if (leadId && !lead && warned.current !== `l${leadId}`) {
      warned.current = `l${leadId}`;
      toast.show({ message: "Kişi bulunamadı (silinmiş olabilir).", tone: "danger" });
      setLeadId(null);
    }
  }, [data, stepId, step, leadId, lead, toast]);

  // Web'de toolStep internal tool tab'ı; mobilde aynı sekmeye geçer, o adıma süzülür.
  const openTool = useCallback(
    (s: Step) => {
      const meta = s.tool ? TOOL_META[s.tool] : null;
      if (!meta) return;
      if (meta.internal && meta.tab) {
        setStepId(null);
        setToolStepId(s.id);
        setTab(meta.tab);
        setTabParams(
          s.tool === "leads" || s.tool === "suppliers"
            ? { tur: s.tool === "suppliers" ? "tedarik" : "musteri", asama: s.tool_ref || undefined }
            : {}
        );
        setVersion((v) => v + 1);
        return;
      }
      if (meta.route) router.push(meta.route as never);
      else toast.show({ message: `${meta.label} aracının mobil karşılığı yok; web panelinden açın.`, tone: "neutral" });
    },
    [router, toast]
  );

  const nav = useMemo<ProjectNav>(
    () => ({
      tab,
      params: tabParams,
      version,
      go: (key, extra = {}) => {
        setTab(key);
        setTabParams(extra);
        setToolStepId(null);
        setStepId(null);
        setLeadId(null);
        setVersion((v) => v + 1);
      },
      openStep: (sid) => { setLeadId(null); setStepId(sid); },
      closeStep: () => setStepId(null),
      openLead: (lid) => { setStepId(null); setLeadId(lid); },
      closeLead: () => setLeadId(null),
      toolStep,
      openTool,
      closeTool: () => setToolStepId(null),
    }),
    [tab, tabParams, version, toolStep, openTool]
  );

  /* ------------------------------- çizim ------------------------------- */
  if (!data) {
    const notFound = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403);
    return (
      <AdminScreen app="projeler" title="Proje" onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
        {query.isLoading || id <= 0 ? (
          id <= 0 ? (
            <EmptyState icon="alert-circle-outline" title="Proje açılamadı" body="Bağlantıdaki proje numarası geçersiz." />
          ) : (
            <>
              <SkeletonHero />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )
        ) : notFound ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Proje açılamadı"
            body="Proje bulunamadı ya da erişiminiz yok."
            action={{ label: "Projelere dön", onPress: () => router.replace("/yonetim/araclar/projeler" as never) }}
          />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </AdminScreen>
    );
  }

  return (
    <ProjectProvider id={id} data={data} nav={nav}>
      <DetailBody refreshing={query.isRefetching} onRefresh={() => void query.refetch()} step={step} lead={lead} onCloseStep={() => setStepId(null)} onCloseLead={() => setLeadId(null)} onTab={nav.go} />
    </ProjectProvider>
  );
}

function DetailBody({
  refreshing,
  onRefresh,
  step,
  lead,
  onCloseStep,
  onCloseLead,
  onTab,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  step: Step | null;
  lead: Lead | null;
  onCloseStep: () => void;
  onCloseLead: () => void;
  onTab: (t: ProjectTab) => void;
}) {
  const { data, stats, canEdit, nav, settings, project } = useProject();
  const p = project;
  const st = PROJECT_STATUS_META[p.status] || PROJECT_STATUS_META.active;
  const s = stats;
  const counts: Partial<Record<ProjectTab, number>> = {
    surec: s.steps.overdue || undefined,
    kisiler: s.leads.due + s.suppliers.due || undefined,
    sorular: data.questions.filter((q) => q.status === "open").length || undefined,
    portfoy: data.portfolio.length || undefined,
  };
  const tabItems = TABS.map((t) => ({ key: t.key, label: t.label, badge: counts[t.key] }));
  const toolStep = nav.toolStep;
  const toolMeta = toolStep?.tool ? TOOL_META[toolStep.tool] : null;
  // Araç modundaki sekme adımın aracına aitse süz; kullanıcı başka sekmeye geçtiyse bırak.
  const scoped = toolStep && toolMeta?.tab === nav.tab ? toolStep : null;
  const toolStage =
    scoped && (scoped.tool === "leads" || scoped.tool === "suppliers") && scoped.tool_ref
      ? stageOf(settings, scoped.tool_ref, scoped.tool === "suppliers" ? "supplier" : "customer")
      : null;

  const subtitle = [
    st.label,
    p.start_date || p.end_date ? `${p.start_date ? formatDate(p.start_date) : "…"} – ${p.end_date ? formatDate(p.end_date) : "…"}` : null,
    p.owner_name ? `${p.owner_name}${data.members.length ? ` + ${data.members.length} üye` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AdminScreen
      app="projeler"
      title={p.name}
      subtitle={subtitle}
      onRefresh={onRefresh}
      refreshing={refreshing}
      bottom={<Tabs<ProjectTab> items={tabItems} value={nav.tab} onChange={onTab} distribute="scroll" />}
    >
      {nav.tab === "genel" ? (
        <Reveal index={0}>
          <ToolStage
            icon={projectIcon(p.icon)}
            tone="cyan"
            overline={`${st.label} · ilerleme`}
            value={`%${s.steps.progress}`}
            caption={subtitle}
            chips={
              <>
                {!canEdit ? <StageChip icon="eye-outline" label="Yalnız görüntüleme" /> : null}
                {p.archived ? <StageChip icon="archive-outline" tone="warn" label="Arşivde" /> : null}
                <StageChip icon="git-commit-outline" label={`${s.steps.done}/${s.steps.total} adım`} />
              </>
            }
            stats={[
              { label: "Geciken", value: s.steps.overdue, tone: s.steps.overdue ? "danger" : undefined, onPress: () => onTab("surec") },
              { label: "Bugün ara", value: s.leads.due + s.suppliers.due, tone: s.leads.due ? "warn" : undefined, onPress: () => onTab("kisiler") },
              { label: "Açık soru", value: data.questions.filter((q) => q.status === "open").length, onPress: () => onTab("sorular") },
            ]}
          >
            <GradientBar value={s.steps.progress / 100} height={6} gradient={[withAlpha(p.color || colors.brand, 0.6), p.color || colors.brand]} track={colors.inkTile} />
          </ToolStage>
        </Reveal>
      ) : (
        <View style={styles.head}>
          <View style={styles.headRow}>
            <Pill label={st.label} color={st.color} icon={st.icon} />
            {!canEdit ? <Pill label="Yalnız görüntüleme" color={colors.textSecondary} icon="eye-outline" /> : null}
            {p.archived ? <Pill label="Arşivde" color={colors.textSecondary} icon="archive-outline" /> : null}
            <View style={styles.flex} />
            <Text style={styles.progress} {...textScale.badge}>%{s.steps.progress}</Text>
            <Text style={styles.progressSub} {...textScale.dense}>{s.steps.done}/{s.steps.total} adım</Text>
          </View>
          <ProgressBar value={s.steps.progress} color={p.color} thin />
        </View>
      )}

      {scoped && toolMeta ? (
        <View style={styles.banner}>
          <View style={styles.flex}>
            <Text style={styles.bannerTitle} numberOfLines={1} {...textScale.dense}>{toolMeta.label} · {scoped.title}</Text>
            <Text style={styles.bannerSub} numberOfLines={1} {...textScale.dense}>
              Adımın aracı{toolStage ? ` · aşama: ${toolStage.label}` : ""} · kayıtlar bu adıma bağlanır
            </Text>
          </View>
          <Button label="Adıma dön" size="sm" variant="secondary" onPress={() => { const sid = scoped.id; nav.closeTool(); nav.openStep(sid); }} />
          <Button label="Tümü" size="sm" variant="ghost" onPress={() => nav.closeTool()} />
        </View>
      ) : null}

      {nav.tab === "genel" ? <Overview /> : null}
      {nav.tab === "surec" ? <Process /> : null}
      {nav.tab === "kisiler" ? (
        <Leads
          key={`leads-${scoped ? scoped.id : "all"}`}
          fixedKind={scoped ? (scoped.tool === "suppliers" ? "supplier" : "customer") : null}
          initialStage={scoped?.tool_ref || ""}
        />
      ) : null}
      {nav.tab === "butce" ? <Budget stepId={scoped?.id ?? null} /> : null}
      {nav.tab === "sorular" ? <Questions stepId={scoped?.id ?? null} /> : null}
      {nav.tab === "iletisim" ? <Activity stepId={scoped?.id ?? null} /> : null}
      {nav.tab === "portfoy" ? <ProjectPortfolio /> : null}
      {nav.tab === "ayarlar" ? <Settings /> : null}

      <StepSheet step={step} onClose={onCloseStep} />
      <LeadSheet lead={lead} stepId={toolStep && (toolStep.tool === "leads" || toolStep.tool === "suppliers") ? toolStep.id : null} onClose={onCloseLead} />
    </AdminScreen>
  );
}

/** Proje içi portföy (o projenin kayıtları). */
function ProjectPortfolio() {
  const { data, ops, canEdit, settings, notify } = useProject();
  return (
    <PortfolioList
      items={data.portfolio}
      categories={settings.portfolio_categories}
      canEdit={canEdit}
      canAdd={canEdit}
      title={`${data.item.name} - portfoy`}
      onAdd={async (body) => {
        const item = await ops.addPortfolio(body);
        if (!item) throw new Error("Portföy kaydı eklenemedi.");
        notify("Portföye eklendi.");
      }}
      onSave={async (pid, body) => {
        const item = await ops.savePortfolio(pid, body);
        if (!item) throw new Error("Portföy kaydı güncellenemedi.");
        notify("Portföy kaydı güncellendi.");
      }}
      onRemove={async (pid) => {
        if (await ops.removePortfolio(pid)) notify("Portföy kaydı silindi.");
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { gap: space.sm },
  headRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xs },
  progress: { ...type.tableNumStrong, color: colors.textPrimary },
  progressSub: { ...type.caption, color: colors.textTertiary },
  banner: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.brandDim, borderWidth: hairline, borderColor: colors.brandBorder },
  bannerTitle: { ...type.label, color: colors.textPrimary },
  bannerSub: { ...type.caption, color: colors.textSecondary },
});
