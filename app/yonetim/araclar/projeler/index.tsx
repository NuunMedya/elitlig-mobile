/**
 * PROJELER — Araçlar → Projeler ana sayfası (web ProjectsHome karşılığı).
 *
 * Üç görünüm (web ?gorunum= ile aynı):
 *   Projeler  proje kartları: ilerleme, geciken adım, bugünkü aramalar, açık
 *             soru, portföy; arama, durum süzgeci, arşivi göster. Karta
 *             dokun = aç; basılı tut = işlemler (sekmeye git, kopyala, arşivle,
 *             sil / ayrıl).
 *   Takip     tüm projelerde aranacak kişiler (tek dokunuş ara / WhatsApp),
 *             bana atanan ve son tarihi yaklaşan adımlar, açık sorular.
 *   Portföy   tüm projelerin + projeden bağımsız portföy kayıtları.
 * "Yeni proje" şablondan (Organizasyon sezonu öne çıkar) ya da boş açılır.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, AdminScreen, RecordCard, ToggleField, confirmAction, type SheetAction } from "@/components/admin";
import { GlobalPortfolio } from "@/components/admin/projects/Portfolio";
import { NewProjectSheet } from "@/components/admin/projects/NewProjectSheet";
import { ContactActions, Pill, ProgressBar, SubHead } from "@/components/admin/projects/ui";
import {
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  FAB,
  Input,
  MetricGrid,
  MetricTile,
  SegmentedControl,
  SkeletonCard,
  useToast,
} from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatMoney } from "@/lib/admin/format";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_META,
  dueLabel,
  isLeadOverdue,
  matches,
  projectIcon,
  todayIso,
  whenLabel,
  type ProjectTab,
} from "@/lib/admin/projectUtils";
import {
  duplicateProject,
  getFollowups,
  leaveProject,
  listProjects,
  projectKeys,
  removeProject,
  updateProject,
  type Project,
  type ProjectStatus,
} from "@/lib/api/admin/projects";
import { colors, radius, space, textScale, type } from "@/theme";

type View3 = "projeler" | "takip" | "portfoy";
const VIEWS: { key: View3; label: string }[] = [
  { key: "projeler", label: "Projeler" },
  { key: "takip", label: "Takip" },
  { key: "portfoy", label: "Portföy" },
];
const DAY_OPTIONS = [
  { key: "0", label: "Bugün" },
  { key: "7", label: "7 gün" },
  { key: "30", label: "30 gün" },
];

export default function ProjectsHome() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ gorunum?: string }>();
  const [view, setView] = useState<View3>(VIEWS.some((v) => v.key === params.gorunum) ? (params.gorunum as View3) : "projeler");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | ProjectStatus>("");
  const [archived, setArchived] = useState(false);
  const [days, setDays] = useState("7");
  const [creating, setCreating] = useState(false);
  const [menuFor, setMenuFor] = useState<Project | null>(null);

  const list = useQuery({ queryKey: projectKeys.list(archived), queryFn: () => listProjects(archived ? "all" : "0").then((r) => r.items ?? []) });
  const follow = useQuery({ queryKey: projectKeys.followups(Number(days)), queryFn: () => getFollowups(Number(days)) });

  const items = list.data;
  const shown = useMemo(
    () => (items || []).filter((p) => (!status || p.status === status) && matches(q, p.name, p.description, p.owner_name)),
    [items, status, q]
  );
  const totals = useMemo(() => {
    const live = (items || []).filter((p) => !p.archived);
    return {
      active: live.filter((p) => p.status === "active" || p.status === "planning").length,
      overdue: live.reduce((n, p) => n + (p.stats?.steps?.overdue || 0), 0),
      due: live.reduce((n, p) => n + (p.stats?.leads?.due || 0) + (p.stats?.suppliers?.due || 0), 0),
      won: live.reduce((n, p) => n + (p.stats?.leads?.won_value || 0), 0),
    };
  }, [items]);
  const overdueCalls = (follow.data?.leads || []).filter((l) => isLeadOverdue(l)).length;

  const open = (id: number, extra: Record<string, string | number> = {}) =>
    router.push({ pathname: "/yonetim/araclar/projeler/[id]", params: { id: String(id), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) } } as never);

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "projects", "list"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "projects", "followups"] });
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.show({ message: ok, tone: "success" });
      refreshAll();
    } catch (err) {
      toast.show({ message: errorText(err, "İşlem tamamlanamadı."), tone: "danger" });
    }
  };

  const menuActions = (p: Project): SheetAction[] => {
    const canEdit = p.access?.can_edit !== false;
    const owner = Boolean(p.access?.is_owner);
    const tab = (sekme: ProjectTab) => () => open(p.id, { sekme });
    return [
      { label: "Projeyi aç", icon: "arrow-forward", onPress: () => open(p.id) },
      { label: "Süreç", icon: "git-branch-outline", onPress: tab("surec") },
      { label: "Kişiler", icon: "people-outline", onPress: tab("kisiler") },
      { label: "Bütçe", icon: "cash-outline", onPress: tab("butce") },
      {
        label: "Kopyasını oluştur",
        icon: "copy-outline",
        onPress: () =>
          void act(async () => {
            const res = await duplicateProject(p.id, { name: `${p.name} (kopya)` });
            toast.show({ message: `Kopya oluşturuldu: ${res.item?.name || p.name} (${res.created?.steps ?? 0} adım).`, tone: "success" });
          }, "Kopya hazır."),
      },
      {
        label: p.archived ? "Arşivden çıkar" : "Arşivle",
        icon: p.archived ? "archive-outline" : "archive",
        hidden: !canEdit,
        onPress: () => void act(() => updateProject(p.id, { archived: !p.archived }), p.archived ? "Proje arşivden çıkarıldı." : "Proje arşivlendi."),
      },
      { label: "Ayarlar", icon: "options-outline", hidden: !canEdit, onPress: tab("ayarlar") },
      owner
        ? {
            label: "Projeyi sil",
            icon: "trash-outline",
            danger: true,
            onPress: async () => {
              const ok = await confirmAction({
                title: "Proje silinsin mi?",
                message: `"${p.name}" kalıcı olarak silinecek: adımlar, kişiler, sorular ve tüm geçmiş. Portföy kayıtları korunur.`,
                confirmLabel: "Kalıcı olarak sil",
                destructive: true,
              });
              if (ok) void act(() => removeProject(p.id), "Proje silindi.");
            },
          }
        : {
            label: "Projeden ayrıl",
            icon: "exit-outline",
            danger: true,
            onPress: async () => {
              const ok = await confirmAction({ title: "Projeden ayrılınsın mı?", message: `"${p.name}" projesine erişiminiz kalkacak.`, confirmLabel: "Ayrıl", destructive: true });
              if (ok) void act(() => leaveProject(p.id), "Projeden ayrıldınız.");
            },
          },
    ];
  };

  const refreshing = list.isRefetching || follow.isRefetching;

  return (
    <AdminScreen
      title="Projeler"
      subtitle="Süreç, sorumlular, aranan kişiler, sorular ve portföy"
      onRefresh={() => {
        void list.refetch();
        void follow.refetch();
        void queryClient.invalidateQueries({ queryKey: projectKeys.portfolio });
      }}
      refreshing={refreshing}
      bottom={<SegmentedControl items={VIEWS} value={view} onChange={setView} />}
      overlay={<FAB icon="add" label="Yeni proje" extended onPress={() => setCreating(true)} accessibilityLabel="Yeni proje" />}
    >
      <MetricGrid columns={2}>
        <MetricTile label="Aktif proje" value={items ? String(totals.active) : "—"} icon="git-branch-outline" tone="brand" onPress={() => setView("projeler")} />
        <MetricTile
          label="Bugünkü aramalar"
          value={follow.data ? String((follow.data.leads || []).filter((l) => new Date(l.next_action_at || 0) <= endOfDay()).length) : "—"}
          hint={overdueCalls ? `${overdueCalls} gecikmiş` : "gecikmiş yok"}
          icon="call-outline"
          tone={overdueCalls ? "warn" : "neutral"}
          onPress={() => { setDays("0"); setView("takip"); }}
        />
        <MetricTile label="Geciken adım" value={items ? String(totals.overdue) : "—"} icon="warning-outline" tone={totals.overdue ? "danger" : "neutral"} onPress={() => setView("takip")} />
        <MetricTile label="Kazanılan" value={items ? formatMoney(totals.won, true) : "—"} icon="trophy-outline" tone="win" onPress={() => setView("portfoy")} />
      </MetricGrid>

      {view === "projeler" ? (
        <>
          <Input variant="search" value={q} onChangeText={setQ} placeholder="Proje ara…" />
          <ChipGroup contentPadding={0}>
            <Chip label="Tüm durumlar" size="sm" selected={!status} onPress={() => setStatus("")} />
            {PROJECT_STATUSES.map((k) => (
              <Chip key={k} label={PROJECT_STATUS_META[k].label} size="sm" selected={status === k} onPress={() => setStatus(status === k ? "" : k)} />
            ))}
          </ChipGroup>
          <ToggleField label="Arşivi göster" value={archived} onChange={setArchived} />
          {list.isLoading ? (
            [0, 1, 2].map((i) => <SkeletonCard key={i} />)
          ) : list.error ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} variant="inline" />
          ) : !shown.length ? (
            <EmptyState
              variant="inline"
              icon="git-branch-outline"
              title={items?.length ? "Eşleşen proje yok" : "İlk projenizi açın"}
              body={items?.length ? "Arama ya da durum süzgecini değiştirin." : "Organizasyon sezonu şablonu aşamaları ve adımlarıyla hazır gelir; her adım düzenlenebilir."}
              action={items?.length ? undefined : { label: "Yeni proje", onPress: () => setCreating(true) }}
            />
          ) : (
            shown.map((p) => <ProjectCard key={p.id} p={p} onPress={() => open(p.id)} onLongPress={() => setMenuFor(p)} />)
          )}
          {totals.overdue > 0 || totals.due > 0 ? (
            <Text style={styles.footHint} {...textScale.long}>
              Projelerde toplam {totals.overdue} geciken adım, {totals.due} bugün aranacak kişi var. Takip görünümünden hepsine ulaşın.
            </Text>
          ) : null}
          {shown.length ? <Text style={styles.footHint} {...textScale.dense}>İşlemler için karta basılı tutun.</Text> : null}
        </>
      ) : null}

      {view === "takip" ? (
        <>
          <SegmentedControl items={DAY_OPTIONS} value={days} onChange={setDays} size="sm" />
          <Text style={styles.muted} {...textScale.dense}>{overdueCalls ? `${overdueCalls} gecikmiş arama var.` : "Gecikmiş arama yok."}</Text>
          {follow.isLoading ? (
            [0, 1, 2].map((i) => <SkeletonCard key={i} />)
          ) : follow.error ? (
            <ErrorState error={follow.error} onRetry={() => void follow.refetch()} variant="inline" />
          ) : (
            <>
              <SubHead icon="call-outline" title="Aranacaklar" count={follow.data?.leads.length || 0} />
              {!follow.data?.leads.length ? (
                <EmptyState compact variant="inline" icon="cafe-outline" title="Arama listesi boş" body="Görüşme sonucu girdiğinizde sonraki arama tarihi burada görünür." />
              ) : (
                follow.data.leads.map((l) => (
                  <RecordCard
                    key={`l${l.id}`}
                    accentColor={l.project_color}
                    title={l.company ? `${l.name} · ${l.company}` : l.name}
                    subtitle={`${whenLabel(l.next_action_at)} · ${l.next_action || l.stage_label || ""}`}
                    meta={l.project_name}
                    badges={[isLeadOverdue(l) ? { label: "Gecikti", tone: "danger" } : null]}
                    onPress={() => open(l.project_id, { sekme: "kisiler", kisi: l.id })}
                    trailing={<ContactActions phone={l.phone} name={l.name} />}
                  />
                ))
              )}
              <SubHead icon="list-outline" title="Adımlar" count={follow.data?.steps.length || 0} />
              {!follow.data?.steps.length ? (
                <EmptyState compact variant="inline" icon="checkmark-done-outline" title="Yaklaşan adım yok" body="Size atanan ve son tarihi yaklaşan adımlar burada." />
              ) : (
                follow.data.steps.map((s) => (
                  <RecordCard
                    key={`s${s.id}`}
                    accentColor={s.project_color}
                    title={s.title}
                    subtitle={`${s.due_date ? dueLabel(s.due_date) : "Tarihsiz"}${s.responsible?.length ? ` · ${s.responsible.join(", ")}` : ""}`}
                    meta={s.project_name}
                    badges={[s.due_date && s.due_date < todayIso() ? { label: "Gecikti", tone: "danger" } : null]}
                    onPress={() => open(s.project_id, { sekme: "surec", adim: s.id })}
                  />
                ))
              )}
              <SubHead icon="help-circle-outline" title="Açık sorular" count={follow.data?.questions.length || 0} />
              {!follow.data?.questions.length ? (
                <EmptyState compact variant="inline" icon="chatbubbles-outline" title="Açık soru yok" body="Cevap bekleyen sorular ve ihtiyaçlar burada." />
              ) : (
                follow.data.questions.map((x) => (
                  <RecordCard
                    key={`q${x.id}`}
                    accentColor={x.project_color}
                    title={x.question}
                    subtitle={`${x.category || "Soru"}${x.due_date ? ` · ${dueLabel(x.due_date)}` : ""}`}
                    meta={x.project_name}
                    onPress={() => open(x.project_id, { sekme: "sorular", soru: x.id })}
                  />
                ))
              )}
            </>
          )}
        </>
      ) : null}

      {view === "portfoy" ? <GlobalPortfolio projects={items || []} onOpenProject={(id) => open(id, { sekme: "portfoy" })} /> : null}

      <NewProjectSheet visible={creating} onClose={() => setCreating(false)} onCreated={(item) => { setCreating(false); open(item.id); }} />
      <ActionSheet visible={menuFor != null} onClose={() => setMenuFor(null)} title={menuFor?.name} actions={menuFor ? menuActions(menuFor) : []} />
    </AdminScreen>
  );
}

function endOfDay() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function ProjectCard({ p, onPress, onLongPress }: { p: Project; onPress: () => void; onLongPress: () => void }) {
  const s = p.stats;
  const st = PROJECT_STATUS_META[p.status] || PROJECT_STATUS_META.active;
  const steps = s?.steps || { total: 0, done: 0, progress: 0, overdue: 0 };
  const calls = (s?.leads?.due || 0) + (s?.suppliers?.due || 0);
  const badges = [
    steps.overdue > 0 ? { label: `${steps.overdue} geciken`, tone: "danger" as const, icon: "warning-outline" as const } : null,
    calls > 0 ? { label: `${calls} arama`, tone: "warn" as const, icon: "call-outline" as const } : null,
    s?.open_questions ? { label: `${s.open_questions} soru`, tone: "neutral" as const, icon: "help-circle-outline" as const } : null,
    s?.leads?.total ? { label: `${s.leads.total} kişi`, tone: "neutral" as const, icon: "people-outline" as const } : null,
    s?.portfolio ? { label: `${s.portfolio} portföy`, tone: "neutral" as const, icon: "briefcase-outline" as const } : null,
    s?.mine ? { label: `${s.mine} bende`, tone: "brand" as const, icon: "person-outline" as const } : null,
    p.archived ? { label: "Arşiv", tone: "neutral" as const } : null,
    p.access?.role === "viewer" ? { label: "İzleyici", tone: "info" as const } : null,
  ];
  return (
    <RecordCard
      icon={projectIcon(p.icon)}
      accentColor={p.color}
      title={p.name}
      subtitle={p.description || null}
      meta={
        s?.next_due
          ? `${dueLabel(s.next_due.due_date)} · ${s.next_due.title}`
          : `Tarihli adım yok${p.owner_name ? ` · ${p.owner_name}${p.member_count ? ` + ${p.member_count} üye` : ""}` : ""}`
      }
      value={`%${steps.progress}`}
      valueTone={steps.progress >= 100 ? "win" : "brand"}
      badges={badges}
      muted={p.archived}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.cardRow}>
        <Pill label={st.label} color={st.color} icon={st.icon} />
        <Text style={styles.muted} {...textScale.dense}>{steps.done}/{steps.total} adım</Text>
      </View>
      <ProgressBar value={steps.progress} color={p.color} thin style={styles.bar} />
    </RecordCard>
  );
}

const styles = StyleSheet.create({
  muted: { ...type.bodySm, color: colors.textTertiary },
  footHint: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.s },
  bar: { marginTop: space.s, borderRadius: radius.pill },
});
