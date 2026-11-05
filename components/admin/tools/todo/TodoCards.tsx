/**
 * YAPILACAKLAR KARTLARI — liste satırı ve pano kartı.
 *
 * LİSTE SATIRI (web TodoRows Row): solda tek dokunuşla bitirme kutusu,
 * sağda "Başla / Duraklat"; satıra dokununca ayrıntı açılır. Başkasına
 * atadığım kart salt izlenir (kutu yerine göz).
 *
 * PANO KARTI (web TodoBoard BoardCard): sürükle-bırak yerine "Taşı" menüsü
 * (ekranda ⋯): önceki/sonraki sütun, sütunda yukarı/aşağı, en üste.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Badge, Touchable, withAlpha } from "@/components/ui";
import { initialsOf } from "@/lib/admin/format";
import { avatarTone, todoLabelHex } from "@/lib/admin/toolPalette";
import type { TodoStatus, TodoTask } from "@/lib/api/todos";
import { colors, hairline, radius, space, textScale, touchSlop, type } from "@/theme";

import { KIND_ICONS, SOURCES, dueOf, formatDue, isLate, personOf, progressOf } from "./boardUtils";

export function PersonDot({ person, size = 20 }: { person: { id?: number; name?: string | null } | null | undefined; size?: number }) {
  if (!person) return null;
  return (
    <View style={[styles.ava, { width: size, height: size, backgroundColor: avatarTone(person) }]}>
      <Text style={styles.avaText} {...textScale.badge}>
        {initialsOf(person.name)}
      </Text>
    </View>
  );
}

export function LabelChips({ labels }: { labels: { text: string; color: string }[] }) {
  if (!labels?.length) return null;
  return (
    <View style={styles.labels}>
      {labels.map((label) => {
        const hex = todoLabelHex(label.color);
        return (
          <View key={label.text} style={[styles.label, { backgroundColor: withAlpha(hex, 0.18), borderColor: hex }]}>
            <Text style={styles.labelText} numberOfLines={1} {...textScale.badge}>
              {label.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const share = total ? done / total : 0;
  return (
    <View style={styles.progressRow} accessibilityLabel={`${total} aşamadan ${done} tanesi tamam`}>
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${share * 100}%` }, done === total ? styles.progressFull : null]} />
      </View>
      <Text style={styles.progressText} {...textScale.badge}>
        {done}/{total}
      </Text>
    </View>
  );
}

/* ═══════════════════════════ LİSTE SATIRI ═══════════════════════════ */

export const TodoRow = memo(function TodoRow({
  task,
  hidePerson,
  onOpen,
  onStatus,
}: {
  task: TodoTask;
  hidePerson?: boolean;
  onOpen: (task: TodoTask) => void;
  onStatus: (task: TodoTask, status: TodoStatus) => void;
}) {
  const canMove = Boolean(task.permissions?.canChangeStatus);
  const done = task.status === "done";
  const late = isLate(task);
  const progress = progressOf(task);
  const due = dueOf(task);
  const person = hidePerson ? null : personOf(task);
  const high = task.priority === "high" && !done;

  return (
    <View style={[styles.row, late ? styles.rowLate : null, task.status === "in_progress" ? styles.rowActive : null]}>
      {canMove ? (
        <Touchable
          feedback="icon"
          haptic={done ? "light" : "success"}
          onPress={() => onStatus(task, done ? "open" : "done")}
          hitSlop={touchSlop(24)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? `${task.title} yeniden aç` : `${task.title} tamamlandı`}
        >
          <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={24} color={done ? colors.win : late ? colors.danger : colors.textTertiary} />
        </Touchable>
      ) : (
        <View accessibilityLabel={`${task.owner?.name} yürütüyor; sen izliyorsun`}>
          <Ionicons name={done ? "checkmark" : "eye-outline"} size={22} color={colors.textTertiary} />
        </View>
      )}

      <Touchable feedback="row" onPress={() => onOpen(task)} style={styles.rowMain} accessibilityRole="button" accessibilityLabel={`${task.title} kartını aç`}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, done ? styles.doneText : null]} numberOfLines={2} {...textScale.dense}>
            {task.title}
          </Text>
          {high ? <Ionicons name="flag" size={14} color={colors.warn} /> : null}
          {task.pinned ? <Ionicons name="pin" size={14} color={colors.brandAccent} /> : null}
        </View>
        <View style={styles.meta}>
          {task.status === "in_progress" ? <Badge label="Sürüyor" tone="info" size="xs" /> : null}
          {due ? (
            <Badge
              label={`${late ? (task.kind === "match_duty" ? "Maç saati geçti · " : "Gecikti · ") : ""}${formatDue(due)}`}
              tone={late ? "danger" : "neutral"}
              size="xs"
              icon={task.kind === "match_duty" ? "time-outline" : "calendar-outline"}
            />
          ) : null}
          {task.kind !== "task" ? <Badge label={task.dutyLabel || task.kindLabel} size="xs" icon={KIND_ICONS[task.kind]} /> : null}
          {progress ? <Badge label={`${progress.done}/${progress.total}`} size="xs" icon="checkbox-outline" tone={progress.done === progress.total ? "win" : "neutral"} /> : null}
          {task.body ? <Ionicons name="reorder-three-outline" size={14} color={colors.textTertiary} accessibilityLabel="Açıklama var" /> : null}
        </View>
        {task.match && task.kind !== "match_duty" ? (
          <Text style={styles.ctx} numberOfLines={1} {...textScale.dense}>
            {task.match.label}
          </Text>
        ) : task.kind === "match_duty" && task.match?.field ? (
          <Text style={styles.ctx} numberOfLines={1} {...textScale.dense}>
            {task.match.field}
          </Text>
        ) : null}
        {task.player || task.team ? (
          <Text style={styles.ctx} numberOfLines={1} {...textScale.dense}>
            {[task.player?.name, task.team?.name].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        <LabelChips labels={task.labels} />
        {person ? (
          <View style={styles.person}>
            <PersonDot person={person} size={16} />
            <Text style={styles.ctx} numberOfLines={1} {...textScale.dense}>
              {task.source === "assigned_by_me" ? `→ ${person.name}` : `${person.name} atadı`}
            </Text>
          </View>
        ) : null}
      </Touchable>

      {canMove && !done ? (
        <Touchable
          feedback="icon"
          haptic="selection"
          onPress={() => onStatus(task, task.status === "in_progress" ? "open" : "in_progress")}
          style={[styles.step, task.status === "in_progress" ? styles.stepOn : null]}
          accessibilityLabel={task.status === "in_progress" ? `${task.title} duraklat` : `${task.title} başla`}
        >
          <Ionicons name={task.status === "in_progress" ? "pause" : "play"} size={16} color={task.status === "in_progress" ? colors.textOnBrand : colors.brandAccent} />
        </Touchable>
      ) : !canMove ? (
        <Badge label={task.statusLabel} size="xs" tone={done ? "win" : task.status === "in_progress" ? "info" : "neutral"} />
      ) : null}
    </View>
  );
});

/* ═══════════════════════════ PANO KARTI ═══════════════════════════ */

export const BoardCard = memo(function BoardCard({
  task,
  onOpen,
  onMove,
}: {
  task: TodoTask;
  onOpen: (task: TodoTask) => void;
  onMove: (task: TodoTask) => void;
}) {
  const canMove = Boolean(task.permissions?.canChangeStatus);
  const progress = progressOf(task);
  const source = SOURCES[task.source] || SOURCES.own;
  const person = personOf(task);
  const late = isLate(task);
  return (
    <Touchable
      feedback="card"
      onPress={() => onOpen(task)}
      onLongPress={canMove ? () => onMove(task) : undefined}
      style={[styles.card, late ? styles.cardLate : null]}
      accessibilityRole="button"
      accessibilityLabel={`${task.title} kartını aç`}
      accessibilityHint={canMove ? "Taşımak için basılı tut" : undefined}
    >
      <View style={styles.cardTop}>
        <Badge label={source.short} tone={source.tone} size="xs" />
        <View style={styles.kind}>
          <Ionicons name={KIND_ICONS[task.kind] ?? "ellipse-outline"} size={12} color={colors.textTertiary} />
          <Text style={styles.kindText} numberOfLines={1} {...textScale.badge}>
            {task.dutyLabel || task.kindLabel}
          </Text>
        </View>
        {task.pinned ? <Ionicons name="pin" size={14} color={colors.brandAccent} /> : null}
        {canMove ? (
          <Touchable feedback="icon" onPress={() => onMove(task)} hitSlop={touchSlop(20)} accessibilityLabel="Kartı taşı">
            <Ionicons name="swap-horizontal" size={18} color={colors.textSecondary} />
          </Touchable>
        ) : null}
      </View>
      <LabelChips labels={task.labels} />
      <Text style={[styles.cardTitle, task.status === "done" ? styles.doneText : null]} numberOfLines={3} {...textScale.dense}>
        {task.title}
      </Text>
      {task.match ? (
        <Text style={styles.ctx} numberOfLines={1} {...textScale.dense}>
          {task.match.label}
          {task.match.startsAt ? ` · ${formatDue(task.match.startsAt)}` : ""}
        </Text>
      ) : null}
      <View style={styles.meta}>
        {task.dueAt && task.kind !== "match_duty" ? (
          <Badge label={formatDue(task.dueAt)} tone={late ? "danger" : "neutral"} size="xs" icon="calendar-outline" />
        ) : null}
        {task.kind === "match_duty" && late ? <Badge label="Maç saati geçti" tone="danger" size="xs" /> : null}
        {task.priority === "high" && task.kind !== "match_duty" ? <Badge label="Yüksek" tone="warn" size="xs" icon="flag" /> : null}
        {task.checklist?.length && !task.workflow ? (
          <Badge label={`${task.checklist.filter((i) => i.done).length}/${task.checklist.length}`} size="xs" icon="checkbox-outline" />
        ) : null}
        {task.body ? <Ionicons name="reorder-three-outline" size={14} color={colors.textTertiary} /> : null}
        <View style={styles.flex} />
        <PersonDot person={person} />
      </View>
      {progress && task.workflow ? <ProgressBar done={progress.done} total={progress.total} /> : null}
      {!canMove ? (
        <Text style={styles.readonly} {...textScale.dense}>
          {task.owner?.name} yürütüyor
        </Text>
      ) : null}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  ava: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  avaText: { ...type.nano, color: colors.onDark },
  labels: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  label: { paddingHorizontal: space.s, paddingVertical: 1, borderRadius: radius.xs, borderWidth: hairline, maxWidth: 160 },
  labelText: { ...type.micro, color: colors.textPrimary },
  progressRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  progress: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: colors.brandAccent },
  progressFull: { backgroundColor: colors.win },
  progressText: { ...type.numSm, color: colors.textTertiary },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  rowLate: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  rowActive: { borderLeftWidth: 3, borderLeftColor: colors.info },
  rowMain: { flex: 1, gap: space.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  title: { flex: 1, ...type.h4, color: colors.textPrimary },
  doneText: { textDecorationLine: "line-through", color: colors.textTertiary },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  ctx: { ...type.caption, color: colors.textSecondary },
  person: { flexDirection: "row", alignItems: "center", gap: space.xs },
  step: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  stepOn: { backgroundColor: colors.brand },

  card: {
    gap: space.s,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  cardLate: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  kind: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.xxs },
  kindText: { ...type.caption, color: colors.textTertiary },
  cardTitle: { ...type.h4, color: colors.textPrimary },
  readonly: { ...type.caption, color: colors.textTertiary },
});
