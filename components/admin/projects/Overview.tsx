/**
 * Genel bakış: göstergeler, adım durumları, kişi hunisi, aşama ilerlemesi,
 * yaklaşan / geciken adımlar, üzerinde çalışılanlar, bugünün aramaları ve son
 * hareketler. Her kutu ilgili sekmeyi / alt sayfayı açar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Panel } from "@/components/admin";
import { EmptyState, GradientBar, IconTile, Touchable, withAlpha, type IconTileTone } from "@/components/ui";
import { formatMoney } from "@/lib/admin/format";
import {
  ACTIVITY_META,
  CLOSED_STEP,
  NEUTRAL_COLOR,
  STEP_STATUSES,
  STEP_STATUS_META,
  dueLabel,
  groupSteps,
  isLeadDue,
  isLeadOverdue,
  isStepOverdue,
  kindOf,
  outcomeOf,
  stageOf,
  timeAgo,
  todayIso,
  whenLabel,
} from "@/lib/admin/projectUtils";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

import { useProject } from "./ProjectContext";
import { ContactActions, Dot, ProgressBar } from "./ui";

export function Overview() {
  const { data, stats, settings, nav, closed, personName } = useProject();
  const { steps: ss, leads: ls, suppliers } = stats;
  const today = todayIso();
  const groups = useMemo(() => groupSteps(data.phases, data.steps), [data.phases, data.steps]);
  const upcoming = useMemo(
    () => data.steps.filter((s) => !CLOSED_STEP.has(s.status) && s.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!)).slice(0, 8),
    [data.steps]
  );
  const active = useMemo(() => data.steps.filter((s) => s.status === "doing" || s.status === "waiting" || s.status === "blocked").slice(0, 8), [data.steps]);
  const dueLeads = useMemo(
    () => data.leads.filter((l) => isLeadDue(l, closed)).sort((a, b) => String(a.next_action_at).localeCompare(String(b.next_action_at))).slice(0, 8),
    [data.leads, closed]
  );
  const openQuestions = data.questions.filter((q) => q.status === "open");
  const recent = data.activities.slice(0, 8);
  const maxStage = Math.max(1, ...settings.lead_stages.map((st) => ls.by_stage[st.key] || 0));
  const phaseName = (pid: number | null) => data.phases.find((p) => p.id === pid)?.name;

  return (
    <View style={styles.wrap}>
      <View style={styles.tiles}>
        <StatTile icon="trophy-outline" tone="mint" label="Kazanılan" value={formatMoney(ls.won_value, true)} hint={`${ls.won} kişi`} onPress={() => nav.go("kisiler")} />
        <StatTile icon="funnel-outline" tone="violet" label="Huni" value={formatMoney(ls.pipeline_value, true)} hint={`${ls.open} açık · ${ls.total} kişi`} onPress={() => nav.go("kisiler")} />
        <StatTile icon="help-circle-outline" tone="gold" label="Açık soru" value={String(openQuestions.length)} hint={`${data.questions.length} soru / ihtiyaç`} onPress={() => nav.go("sorular")} />
        <StatTile icon="briefcase-outline" tone="cyan" label="Portföy" value={String(data.portfolio.length)} hint={formatMoney(data.portfolio.reduce((n, x) => n + (Number(x.value) || 0), 0), true)} onPress={() => nav.go("portfoy")} />
      </View>

      <Panel title="Adım durumları">
        <View style={styles.stack}>
          {STEP_STATUSES.map((k) => (ss.by_status[k] ? <View key={k} style={[styles.stackPart, { flex: ss.by_status[k], backgroundColor: STEP_STATUS_META[k].color }]} /> : null))}
        </View>
        <View style={styles.legend}>
          {STEP_STATUSES.map((k) => (
            <View key={k} style={[styles.legendItem, !ss.by_status[k] ? styles.legendOff : null]}>
              <Dot color={STEP_STATUS_META[k].color} size={8} />
              <Text style={styles.small} {...textScale.dense}>{STEP_STATUS_META[k].label}</Text>
              <Text style={styles.strong} {...textScale.badge}>{ss.by_status[k] || 0}</Text>
            </View>
          ))}
        </View>
      </Panel>

      <Panel title="Yaklaşan ve geciken adımlar" action={{ label: "Süreç", onPress: () => nav.go("surec") }}>
        {!upcoming.length ? (
          <EmptyState compact variant="inline" icon="calendar-outline" title="Tarihli açık adım yok" body="Adımlara son tarih verdiğinizde burada sıralanır." />
        ) : (
          upcoming.map((s) => (
            <MiniRow
              key={s.id}
              when={dueLabel(s.due_date)}
              alert={isStepOverdue(s, today)}
              title={s.title}
              sub={`${phaseName(s.phase_id) || "Aşamasız"}${s.responsible.length ? ` · ${s.responsible.join(", ")}` : ""}`}
              icon={STEP_STATUS_META[s.status].icon}
              iconColor={STEP_STATUS_META[s.status].color}
              onPress={() => nav.openStep(s.id)}
            />
          ))
        )}
      </Panel>

      {active.length ? (
        <Panel title={`Üzerinde çalışılan · ${active.length}`}>
          {active.map((s) => (
            <MiniRow
              key={s.id}
              when={STEP_STATUS_META[s.status].short}
              whenColor={STEP_STATUS_META[s.status].color}
              title={s.title}
              sub={s.assignee_id ? personName(s.assignee_id) : s.responsible.join(", ") || "Atanmadı"}
              onPress={() => nav.openStep(s.id)}
            />
          ))}
        </Panel>
      ) : null}

      <Panel title="Kişi hunisi" action={{ label: "Kişiler", onPress: () => nav.go("kisiler") }}>
        {!ls.total ? (
          <EmptyState compact variant="inline" icon="people-outline" title="Henüz kişi yok" body="Aranacak kişileri Kişiler sekmesinden ekleyin ya da rehberden aktarın." />
        ) : (
          settings.lead_stages.map((st) => (
            <Touchable key={st.key} onPress={() => nav.go("kisiler", { asama: st.key, tur: "musteri" })} style={styles.funnel} accessibilityRole="button">
              <View style={styles.funnelLabel}>
                <Dot color={st.color} size={8} />
                <Text style={styles.small} numberOfLines={1} {...textScale.dense}>{st.label}</Text>
              </View>
              <GradientBar value={(ls.by_stage[st.key] || 0) / maxStage} height={10} gradient={[withAlpha(st.color, 0.55), st.color]} style={styles.flex} />
              <Text style={styles.strong} {...textScale.dense}>{ls.by_stage[st.key] || 0}</Text>
            </Touchable>
          ))
        )}
      </Panel>

      <Panel title={`Bugünün aramaları · ${ls.due + suppliers.due}`} action={{ label: "Tümü", onPress: () => nav.go("kisiler", { takip: true }) }}>
        {!dueLeads.length ? (
          <EmptyState compact variant="inline" icon="cafe-outline" title="Bugün aranacak kimse yok" body="Görüşme sonucu girildikçe sonraki arama tarihi kendiliğinden ayarlanır." />
        ) : (
          dueLeads.map((l) => {
            const st = stageOf(settings, l.stage);
            return (
              <MiniRow
                key={l.id}
                when={whenLabel(l.next_action_at)}
                alert={isLeadOverdue(l, closed)}
                title={l.company ? `${l.name} · ${l.company}` : l.name}
                sub={l.next_action || st.label}
                onPress={() => nav.openLead(l.id)}
                trailing={<ContactActions phone={l.phone} name={l.name} />}
              />
            );
          })
        )}
      </Panel>

      <Panel title={`Aşamalar · ${groups.length}`}>
        {groups.map(({ phase, steps }) => {
          const counted = steps.filter((x) => x.status !== "skipped");
          const doneN = steps.filter((x) => x.status === "done").length;
          const pct = counted.length ? Math.round((doneN / counted.length) * 100) : 0;
          const late = steps.filter((x) => isStepOverdue(x, today)).length;
          return (
            <Touchable
              key={phase?.id ?? "none"}
              onPress={() => nav.go("surec", phase ? { asamaid: phase.id } : {})}
              style={styles.phaseRow}
              accessibilityRole="button"
            >
              <Dot color={phase?.color || NEUTRAL_COLOR} />
              <View style={styles.flex}>
                <View style={styles.phaseHead}>
                  <Text style={styles.phaseName} numberOfLines={1} {...textScale.dense}>{phase?.name || "Aşamasız"}</Text>
                  {late ? <Text style={styles.alert} {...textScale.badge}>{late} geciken</Text> : null}
                  <Text style={styles.small} {...textScale.dense}>{doneN}/{steps.length}</Text>
                </View>
                <ProgressBar value={pct} color={phase?.color} thin />
              </View>
            </Touchable>
          );
        })}
      </Panel>

      <Panel title="Son hareketler" action={{ label: "İletişim", onPress: () => nav.go("iletisim") }}>
        {!recent.length ? (
          <EmptyState compact variant="inline" icon="chatbubbles-outline" title="Henüz kayıt yok" body="Aramalar, notlar ve durum değişiklikleri burada akar." />
        ) : (
          recent.map((a) => {
            const m = ACTIVITY_META[a.type] || ACTIVITY_META.note;
            const l = a.lead_id ? data.leads.find((x) => x.id === a.lead_id) : null;
            const outcome = a.outcome ? outcomeOf(settings, a.outcome, kindOf(l))?.label : null;
            return (
              <Touchable key={a.id} onPress={l ? () => nav.openLead(l.id) : undefined} disabled={!l} style={styles.feed}>
                <View style={styles.feedRail}>
                  <View style={[styles.feedIcon, { backgroundColor: withAlpha(m.color, 0.18), borderColor: withAlpha(m.color, 0.5) }]}>
                    <Ionicons name={m.icon} size={14} color={m.color} />
                  </View>
                  <View style={styles.feedLine} />
                </View>
                <View style={styles.feedBody}>
                  <Text style={styles.feedTitle} numberOfLines={1} {...textScale.dense}>
                    {l ? l.name : m.short}
                    {outcome ? <Text style={styles.small}> · {outcome}</Text> : null}
                  </Text>
                  {a.note ? <Text style={styles.small} numberOfLines={2} {...textScale.dense}>{a.note}</Text> : null}
                  <Text style={styles.tiny} {...textScale.badge}>{timeAgo(a.occurred_at)}{a.created_by ? ` · ${personName(a.created_by)}` : ""}</Text>
                </View>
              </Touchable>
            );
          })
        )}
      </Panel>
    </View>
  );
}

function StatTile({ icon, tone, label, value, hint, onPress }: { icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone; label: string; value: string; hint?: string; onPress: () => void }) {
  return (
    <Touchable feedback="card" onPress={onPress} style={styles.tile} accessibilityRole="button" accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ""}`}>
      <IconTile icon={icon} tone={tone} size={32} glow={false} />
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
        {value}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
      {hint ? (
        <Text style={styles.tileHint} numberOfLines={1} {...textScale.dense}>
          {hint}
        </Text>
      ) : null}
    </Touchable>
  );
}

function MiniRow({
  when,
  whenColor,
  alert,
  title,
  sub,
  icon,
  iconColor,
  onPress,
  trailing,
}: {
  when: string;
  whenColor?: string;
  alert?: boolean;
  title: string;
  sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onPress: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <Touchable onPress={onPress} style={styles.mini} accessibilityRole="button" accessibilityLabel={`${when}: ${title}`}>
      <View style={[styles.whenBox, alert ? styles.whenAlert : null, whenColor ? { backgroundColor: withAlpha(whenColor, 0.14), borderColor: withAlpha(whenColor, 0.4) } : null]}>
        <Text style={[styles.when, alert ? styles.alert : null, whenColor ? { color: whenColor } : null]} numberOfLines={2} {...textScale.badge}>
          {when}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.miniTitle} numberOfLines={2} {...textScale.dense}>{title}</Text>
        {sub ? <Text style={styles.small} numberOfLines={1} {...textScale.dense}>{sub}</Text> : null}
      </View>
      {trailing}
      {icon ? <Ionicons name={icon} size={18} color={iconColor} /> : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: { flexBasis: "47%", flexGrow: 1, gap: space.xxs, padding: space.md, borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1 },
  tileValue: { ...type.metric, color: colors.textPrimary, marginTop: space.xs },
  tileLabel: { ...type.nano, color: colors.textTertiary },
  tileHint: { ...type.caption, color: colors.textSecondary },
  stack: { flexDirection: "row", height: 14, gap: 3 },
  stackPart: { borderRadius: radius.pill },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xxs + 1, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  legendOff: { opacity: 0.5 },
  small: { ...type.bodySm, color: colors.textSecondary },
  tiny: { ...type.meta, color: colors.textTertiary },
  strong: { ...type.numSmStrong, color: colors.textPrimary },
  alert: { color: colors.danger, ...type.labelXs },
  mini: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  whenBox: { width: 76, paddingVertical: space.xs, paddingHorizontal: space.xs, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border, alignItems: "center" },
  whenAlert: { backgroundColor: colors.dangerDim, borderColor: colors.danger },
  when: { ...type.labelXs, color: colors.textSecondary, textAlign: "center" },
  miniTitle: { ...type.h4, color: colors.textPrimary },
  funnel: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs + 1 },
  funnelLabel: { flexDirection: "row", alignItems: "center", gap: space.xs, width: 110 },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.s },
  phaseHead: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.xs },
  phaseName: { ...type.h4, color: colors.textPrimary, flex: 1 },
  feed: { flexDirection: "row", gap: space.md },
  feedRail: { alignItems: "center", width: 30 },
  feedIcon: { width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: hairline },
  feedLine: { flex: 1, width: 2, minHeight: space.md, backgroundColor: colors.separator, marginVertical: space.xxs },
  feedBody: { flex: 1, paddingBottom: space.md, gap: 2 },
  feedTitle: { ...type.h4, color: colors.textPrimary },
});
