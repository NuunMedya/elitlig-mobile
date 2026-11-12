/**
 * EKİP TAKİBİ — il yöneticisi kendi ilindeki, admin il süzgeciyle tüm
 * illerdeki yönetim kullanıcılarının görevlerini görür (todos.oversee).
 * Web todos/TeamOverview.js. Kişinin kendine yazdığı notlar özeldir; burada
 * yalnız atanmış ve sistem kartları görünür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SelectField } from "@/components/admin";
import { Badge, Chip, ChipGroup, EmptyState, ErrorState, Odometer, SkeletonListRow, Touchable } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/api/admin";
import { getTodoOverview, todoKeys, type TodoTask } from "@/lib/api/todos";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

import { PersonDot, ProgressBar } from "./TodoCards";
import { formatDue } from "./boardUtils";

const STATUS = [
  { key: "active", label: "Yapılmayan" },
  { key: "overdue", label: "Geciken" },
  { key: "done", label: "Yapılan" },
  { key: "all", label: "Tümü" },
];

export function TeamOverview() {
  const [cityId, setCityId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [status, setStatus] = useState("active");
  const params = { city_id: cityId, user_id: userId, status };
  const query = useQuery({ queryKey: todoKeys.overview(params), queryFn: () => getTodoOverview(params), placeholderData: keepPreviousData });
  const data = query.data;
  const people = data?.people ?? [];
  const selected = people.find((p) => p.user.id === userId);

  if (query.error && !data) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return (
    <View style={styles.wrap}>
      {data?.nationwide ? (
        <SelectField<number>
          label="İl"
          value={cityId}
          options={(data.cities || []).map((c) => ({ value: c.id, label: c.name }))}
          placeholder="Tüm iller"
          clearable
          onChange={(v) => {
            setCityId(v);
            setUserId(null);
          }}
          icon="map-outline"
        />
      ) : data?.city ? (
        <Badge label={data.city.name} icon="map-outline" size="sm" />
      ) : null}

      <ChipGroup contentPadding={0}>
        {STATUS.map((s) => (
          <Chip key={s.key} label={s.label} size="sm" selected={status === s.key} onPress={() => setStatus(s.key)} />
        ))}
      </ChipGroup>
      {data ? (
        <View style={styles.totals}>
          {([
            ["Yapılmayan", data.totals.active, colors.info, "active"],
            ["Geciken", data.totals.overdue, colors.danger, "overdue"],
            ["Yapılan", data.totals.done, colors.win, "done"],
          ] as const).map(([label, value, color, key]) => (
            <Touchable key={key} feedback="card" onPress={() => setStatus(key)} style={[styles.total, status === key ? { borderColor: color } : null]} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
              <View style={[styles.totalMark, { backgroundColor: color }]} />
              <Odometer value={value} style={[styles.totalValue, { color }]} />
              <Text style={styles.totalLabel} {...textScale.badge}>
                {upperTR(label)}
              </Text>
            </Touchable>
          ))}
        </View>
      ) : null}

      <Text style={styles.label} accessibilityRole="header" {...textScale.dense}>
        {upperTR("Kişiler")}
      </Text>
      <ChipGroup contentPadding={0}>
        <Chip label={`Herkes · ${people.length}`} size="sm" selected={!userId} onPress={() => setUserId(null)} />
        {people.map((p) => (
          <Chip
            key={p.user.id}
            label={`${p.user.name} · ${p.counts.active}`}
            size="sm"
            tone={p.counts.overdue ? "danger" : undefined}
            selected={userId === p.user.id}
            onPress={() => setUserId(p.user.id)}
          />
        ))}
      </ChipGroup>

      {selected ? (
        <View style={styles.personCard}>
          <PersonDot person={selected.user} size={32} />
          <View style={styles.flex}>
            <Text style={styles.h4} {...textScale.dense}>
              {selected.user.name}
            </Text>
            <Text style={styles.muted} {...textScale.dense}>
              {[ROLE_LABELS[selected.user.role] ?? selected.user.role, selected.user.city].filter(Boolean).join(" · ")}
            </Text>
            <Text style={styles.muted} {...textScale.dense}>
              {selected.counts.active} yapılmayan{selected.counts.overdue ? ` · ${selected.counts.overdue} geciken` : ""} · {selected.counts.done} yapılan
            </Text>
            {selected.counts.total ? <ProgressBar done={selected.counts.done} total={selected.counts.total} /> : null}
          </View>
        </View>
      ) : null}

      <Text style={styles.label} {...textScale.dense}>
        {selected ? `${selected.user.name} · ` : ""}
        {STATUS.find((s) => s.key === status)?.label} görevler{data ? ` (${data.items.length})` : ""}
      </Text>
      {query.isLoading ? (
        <SkeletonListRow count={4} avatar={false} />
      ) : !data?.items.length ? (
        <EmptyState variant="inline" compact icon="people-outline" title="Bu süzgeçle görev yok" />
      ) : (
        data.items.map((task) => <OverviewRow key={task.id} task={task} />)
      )}
    </View>
  );
}

function OverviewRow({ task }: { task: TodoTask }) {
  const [open, setOpen] = useState(false);
  const stages = task.workflow?.stages || [];
  const checklist = task.checklist || [];
  const progress = task.workflow
    ? { done: task.workflow.done, total: task.workflow.total }
    : checklist.length
      ? { done: checklist.filter((i) => i.done).length, total: checklist.length }
      : null;
  const detail = stages.length > 0 || checklist.length > 0 || Boolean(task.response) || Boolean(task.body);
  const late = task.overdue && task.status !== "done";
  return (
    <View style={[styles.row, late ? styles.rowLate : null]}>
      <View style={styles.rowTop}>
        <Badge label={task.dutyLabel ? `${task.dutyLabel} görevi` : task.kindLabel} size="xs" />
        <Badge label={task.statusLabel} size="xs" tone={task.status === "done" ? "win" : task.status === "in_progress" ? "info" : "neutral"} />
      </View>
      <Text style={[styles.h4, task.status === "done" ? styles.done : null]} {...textScale.dense}>
        {task.title}
      </Text>
      <Text style={styles.muted} {...textScale.dense}>
        {task.owner?.name}
        {task.assignedBy ? ` · atayan: ${task.assignedBy.name}` : ""}
      </Text>
      <View style={styles.rowTop}>
        {task.dueAt ? <Badge label={`${late ? "Gecikti · " : ""}${formatDue(task.dueAt)}`} tone={late ? "danger" : "neutral"} size="xs" icon="calendar-outline" /> : null}
        {task.completedAt && task.status === "done" ? <Badge label={`Bitti · ${formatDue(task.completedAt)}`} tone="win" size="xs" /> : null}
      </View>
      {progress ? <ProgressBar done={progress.done} total={progress.total} /> : null}
      {detail ? (
        <Touchable feedback="none" onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Text style={styles.link} {...textScale.dense}>
            {open ? "Ayrıntıyı gizle" : "Ne yapıldı, ne kaldı?"}
          </Text>
        </Touchable>
      ) : null}
      {open ? (
        <View style={styles.detail}>
          {task.body ? (
            <Text style={styles.body} {...textScale.long}>
              {task.body}
            </Text>
          ) : null}
          {stages.map((stage) => (
            <View key={stage.key} style={styles.step}>
              <Ionicons name={stage.done ? "checkmark-circle" : stage.locked ? "lock-closed-outline" : "ellipse-outline"} size={14} color={stage.done ? colors.win : colors.textTertiary} />
              <Text style={styles.stepText} {...textScale.dense}>
                {stage.done ? stage.label : stage.pendingLabel || stage.label}
              </Text>
            </View>
          ))}
          {checklist.map((item) => (
            <View key={item.id} style={styles.step}>
              <Ionicons name={item.done ? "checkmark-circle" : "ellipse-outline"} size={14} color={item.done ? colors.win : colors.textTertiary} />
              <Text style={styles.stepText} {...textScale.dense}>
                {item.text}
              </Text>
            </View>
          ))}
          {task.response ? (
            <Text style={styles.body} {...textScale.long}>
              Cevap: {task.response}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  label: { ...type.overline, color: colors.textTertiary, marginTop: space.xs },
  totals: { flexDirection: "row", gap: space.sm },
  total: { flex: 1, gap: 2, padding: space.md, borderRadius: radius.lg, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1, overflow: "hidden" },
  totalMark: { width: 14, height: 3, borderRadius: radius.pill, marginBottom: space.xs },
  totalValue: { ...type.metric },
  totalLabel: { ...type.nano, color: colors.textTertiary },
  muted: { ...type.caption, color: colors.textTertiary },
  h4: { ...type.h4, color: colors.textPrimary },
  body: { ...type.bodySm, color: colors.textPrimary },
  link: { ...type.labelSm, color: colors.brandAccent },
  done: { textDecorationLine: "line-through", color: colors.textTertiary },
  personCard: { flexDirection: "row", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.brandDim, borderWidth: hairline, borderColor: colors.brandBorder },
  row: { gap: space.xs, padding: space.md, borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1 },
  rowLate: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  rowTop: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  detail: { gap: space.xs, paddingTop: space.xs },
  step: { flexDirection: "row", alignItems: "center", gap: space.xs },
  stepText: { flex: 1, ...type.caption, color: colors.textSecondary },
});
