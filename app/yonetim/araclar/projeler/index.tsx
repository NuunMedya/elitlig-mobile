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
 * TASARIM: gece sahnesinde aktif proje sayısı + bugün aranacak / geciken
 * adım / kazanılan; proje kartı proje renginde degrade baş, yüzde halkası,
 * dört rakamlı gövde ve degrade ilerleme çubuğu.
 * "Yeni proje" şablondan (Organizasyon sezonu öne çıkar) ya da boş açılır.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";

import { ActionSheet, AdminScreen, RecordCard, ToggleField, confirmAction, type SheetAction } from "@/components/admin";
import { ToolStage } from "@/components/admin/tools/ToolKit";
import { ToolFab } from "@/components/admin/tools/ToolApp";
import { GlobalPortfolio } from "@/components/admin/projects/Portfolio";
import { NewProjectSheet } from "@/components/admin/projects/NewProjectSheet";
import { ContactActions, Pill, ProgressBar, SubHead } from "@/components/admin/projects/ui";
import {
  Badge,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  ProgressRing,
  Reveal,
  SegmentedControl,
  SkeletonCard,
  Touchable,
  useToast,
  withAlpha,
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
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

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
      app="projeler"
      title="Projeler"
      subtitle="Süreç, sorumlular, aranan kişiler, sorular ve portföy"
      onRefresh={() => {
        void list.refetch();
        void follow.refetch();
        void queryClient.invalidateQueries({ queryKey: projectKeys.portfolio });
      }}
      refreshing={refreshing}
      bottom={<SegmentedControl items={VIEWS} value={view} onChange={setView} />}
      overlay={<ToolFab app="projeler" label="Yeni proje" onPress={() => setCreating(true)} accessibilityLabel="Yeni proje" />}
    >
      <Reveal index={0}>
        <ToolStage
          icon="git-branch"
          tone="cyan"
          overline="Aktif proje"
          value={items ? totals.active : "–"}
          caption={items ? `${(items || []).filter((p) => !p.archived).length} proje · kazanılan ${formatMoney(totals.won, true)}` : "Projeler yükleniyor"}
          stats={[
            {
              label: "Bugün ara",
              value: follow.data ? (follow.data.leads || []).filter((l) => new Date(l.next_action_at || 0) <= endOfDay()).length : "–",
              tone: overdueCalls ? "warn" : undefined,
              onPress: () => { setDays("0"); setView("takip"); },
            },
            { label: "Geciken adım", value: items ? totals.overdue : "–", tone: totals.overdue ? "danger" : undefined, onPress: () => setView("takip") },
            { label: "Kazanılan", value: items ? formatMoney(totals.won, true) : "–", tone: "win", onPress: () => setView("portfoy") },
          ]}
        />
      </Reveal>

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
            shown.map((p, i) => (
              <Reveal key={p.id} index={i}>
                <ProjectCard p={p} onPress={() => open(p.id)} onLongPress={() => setMenuFor(p)} />
              </Reveal>
            ))
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

/** Portföy kartı: proje renginde degrade baş (simge, ad, durum, yüzde halkası),
    gövdede dört rakam (adım · kişi · soru · bütçe), sıradaki iş ve ilerleme çubuğu. */
function ProjectCard({ p, onPress, onLongPress }: { p: Project; onPress: () => void; onLongPress: () => void }) {
  const s = p.stats;
  const st = PROJECT_STATUS_META[p.status] || PROJECT_STATUS_META.active;
  const steps = s?.steps || { total: 0, done: 0, progress: 0, overdue: 0 };
  const calls = (s?.leads?.due || 0) + (s?.suppliers?.due || 0);
  const net = s?.finance ? s.finance.estimate_net : null;
  const tint = p.color || colors.brand;
  return (
    <Touchable
      feedback="card"
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.card, p.archived ? styles.cardMuted : null]}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}. ${st.label}. İlerleme yüzde ${steps.progress}. ${steps.done}/${steps.total} adım`}
    >
      <LinearGradient colors={[withAlpha(tint, 0.34), withAlpha(tint, 0.04)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: tint }]}>
          <Ionicons name={projectIcon(p.icon)} size={20} color={colors.onDark} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
            {p.name}
          </Text>
          {p.description ? (
            <Text style={styles.cardDesc} numberOfLines={1} {...textScale.dense}>
              {p.description}
            </Text>
          ) : null}
          <View style={styles.cardPills}>
            <Pill label={st.label} color={st.color} icon={st.icon} />
            {p.archived ? <Badge label="Arşiv" size="xs" /> : null}
            {p.access?.role === "viewer" ? <Badge label="İzleyici" tone="info" size="xs" /> : null}
          </View>
        </View>
        <ProgressRing value={steps.progress / 100} size={52} thickness={5} tone={steps.progress >= 100 ? "win" : "brand"} label={`%${steps.progress}`} animate />
      </LinearGradient>
      <View style={styles.cardBody}>
        <View style={styles.figures}>
          <Figure icon="git-commit-outline" label="Adım" value={`${steps.done}/${steps.total}`} />
          <Figure icon="people-outline" label="Kişi" value={String(s?.leads?.total ?? 0)} alert={calls ? `${calls} ara` : null} />
          <Figure icon="help-circle-outline" label="Soru" value={String(s?.open_questions ?? 0)} />
          <Figure icon="cash-outline" label="Bütçe" value={net == null ? "—" : formatMoney(net, true)} tone={net == null ? undefined : net >= 0 ? colors.win : colors.danger} />
        </View>
        <ProgressBar value={steps.progress} color={tint} thin />
        <View style={styles.nextRow}>
          <Ionicons name={s?.next_due?.overdue ? "alert-circle" : "flag-outline"} size={14} color={s?.next_due?.overdue ? colors.danger : colors.textTertiary} />
          <Text style={[styles.nextText, s?.next_due?.overdue ? { color: colors.danger } : null]} numberOfLines={1} {...textScale.dense}>
            {s?.next_due
              ? `${dueLabel(s.next_due.due_date)} · ${s.next_due.title}`
              : `Tarihli adım yok${p.owner_name ? ` · ${p.owner_name}${p.member_count ? ` + ${p.member_count} üye` : ""}` : ""}`}
          </Text>
          {steps.overdue > 0 ? <Badge label={`${steps.overdue} geciken`} tone="danger" size="xs" /> : null}
          {s?.mine ? <Badge label={`${s.mine} bende`} tone="brand" size="xs" /> : null}
        </View>
      </View>
    </Touchable>
  );
}

function Figure({ icon, label, value, tone, alert }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone?: string; alert?: string | null }) {
  return (
    <View style={styles.figure}>
      <View style={styles.figureHead}>
        <Ionicons name={icon} size={11} color={colors.textTertiary} />
        <Text style={styles.figureLabel} numberOfLines={1} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
      <Text style={[styles.figureValue, tone ? { color: tone } : null]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
        {value}
      </Text>
      {alert ? (
        <Text style={styles.figureAlert} numberOfLines={1} {...textScale.badge}>
          {alert}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  muted: { ...type.bodySm, color: colors.textTertiary },
  footHint: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
  card: { borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1, overflow: "hidden" },
  cardMuted: { opacity: 0.7 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  cardIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  cardTitle: { ...type.h3, color: colors.textPrimary },
  cardDesc: { ...type.caption, color: colors.textSecondary, marginTop: 1 },
  cardPills: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs, marginTop: space.xs },
  cardBody: { gap: space.sm, padding: space.md, paddingTop: space.sm },
  figures: { flexDirection: "row", gap: space.xs },
  figure: { flex: 1, gap: 2, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  figureHead: { flexDirection: "row", alignItems: "center", gap: 3 },
  figureLabel: { ...type.nano, color: colors.textTertiary },
  figureValue: { ...type.tableNumStrong, color: colors.textPrimary },
  figureAlert: { ...type.nano, color: colors.warn },
  nextRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  nextText: { ...type.caption, color: colors.textSecondary, flex: 1 },
});
