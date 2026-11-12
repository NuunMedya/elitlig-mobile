/**
 * YAPILACAKLAR KARTLARI — liste satırı ve pano kartı.
 *
 * LİSTE SATIRI (web TodoRows Row): solda tek dokunuşla bitirme kutusu,
 * sağda "Başla / Duraklat"; satıra dokununca ayrıntı açılır. Başkasına
 * atadığım kart salt izlenir (kutu yerine göz).
 *
 * PANO KARTI (web TodoBoard BoardCard): sürükle-bırak yerine "Taşı" menüsü
 * (ekranda ⋯): önceki/sonraki sütun, sütunda yukarı/aşağı, en üste.
 *
 * ANATOMİ (ikinci tur): kartın solunda 3 px ÖNCELİK ŞERİDİ (gecikmiş =
 * kırmızı, yüksek = altın, sürüyor = camgöbeği, diğerleri yok); bitirme
 * halkası önceliğin renginde; başlığın altında SON TARİH HAPI (ikonlu, gecikti
 * kırmızı / bugün altın / ileri nötr) ve tür/ilerleme hapları; sağ sütunda
 * ATANAN AVATARI ve Başla/Duraklat düğmesi. Bağlam (maç, oyuncu, takım)
 * ikonlu tek satır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { Badge, GradientBar, Touchable, withAlpha } from "@/components/ui";
import { initialsOf } from "@/lib/admin/format";
import { avatarTone, todoLabelHex } from "@/lib/admin/toolPalette";
import type { TodoStatus, TodoTask } from "@/lib/api/todos";
import { colors, glowStyle, hairline, radius, space, textScale, touchSlop, type } from "@/theme";

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
      <GradientBar value={share} height={5} gradient={done === total ? colors.tileTones.mint : undefined} style={styles.progress} />
      <Text style={styles.progressText} {...textScale.badge}>
        {done}/{total}
      </Text>
    </View>
  );
}

/** Kartın öncelik şeridi rengi (yoksa null). */
function stripeOf(task: TodoTask): string | null {
  if (task.status === "done") return null;
  if (isLate(task)) return colors.danger;
  if (task.priority === "high") return colors.warn;
  if (task.status === "in_progress") return colors.accentText;
  return null;
}

/** Son tarih hapının tonu: gecikti kırmızı, bugün altın, ileri nötr. */
function dueTone(task: TodoTask, iso: string): "danger" | "warn" | "neutral" {
  if (isLate(task)) return "danger";
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate() ? "warn" : "neutral";
}

/* ═══════════════════════════ LİSTE SATIRI ═══════════════════════════ */

export const TodoRow = memo(function TodoRow({
  task,
  hidePerson,
  onOpen,
  onStatus,
  onMenu,
}: {
  task: TodoTask;
  hidePerson?: boolean;
  onOpen: (task: TodoTask) => void;
  onStatus: (task: TodoTask, status: TodoStatus) => void;
  /** Basılı tutunca hızlı eylem menüsü (ertele, sabitle, sil…). */
  onMenu?: (task: TodoTask) => void;
}) {
  const canMove = Boolean(task.permissions?.canChangeStatus);
  const done = task.status === "done";
  const late = isLate(task);
  const progress = progressOf(task);
  const due = dueOf(task);
  const person = hidePerson ? null : personOf(task);
  const high = task.priority === "high" && !done;

  const stripe = stripeOf(task);
  const ring = done ? colors.win : late ? colors.danger : high ? colors.warn : task.status === "in_progress" ? colors.accentText : colors.textTertiary;
  const ctx =
    task.match && task.kind !== "match_duty"
      ? { icon: "football-outline" as const, text: task.match.label }
      : task.kind === "match_duty" && task.match?.field
        ? { icon: "location-outline" as const, text: task.match.field }
        : task.player || task.team
          ? { icon: "people-outline" as const, text: [task.player?.name, task.team?.name].filter(Boolean).join(" · ") }
          : null;

  return (
    <View style={[styles.row, done ? styles.rowDone : null]}>
      {stripe ? <View style={[styles.stripe, { backgroundColor: stripe }]} /> : null}
      {canMove ? (
        <Touchable
          feedback="icon"
          haptic={done ? "light" : "success"}
          onPress={() => onStatus(task, done ? "open" : "done")}
          hitSlop={touchSlop(26)}
          style={[styles.check, { borderColor: ring }, done ? styles.checkDone : null]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? `${task.title} yeniden aç` : `${task.title} tamamlandı`}
        >
          {done ? <Ionicons name="checkmark" size={16} color={colors.onDark} /> : null}
        </Touchable>
      ) : (
        <View style={[styles.check, styles.checkWatch]} accessibilityLabel={`${task.owner?.name} yürütüyor; sen izliyorsun`}>
          <Ionicons name={done ? "checkmark" : "eye-outline"} size={14} color={colors.textTertiary} />
        </View>
      )}

      <Touchable
        feedback="row"
        onPress={() => onOpen(task)}
        onLongPress={onMenu ? () => onMenu(task) : undefined}
        style={styles.rowMain}
        accessibilityRole="button"
        accessibilityLabel={`${task.title} kartını aç`}
        accessibilityHint={onMenu ? "Hızlı eylemler için basılı tut" : undefined}
      >
        <View style={styles.titleRow}>
          {task.pinned ? <Ionicons name="pin" size={13} color={colors.brandAccent} /> : null}
          <Text style={[styles.title, done ? styles.doneText : null]} numberOfLines={2} {...textScale.dense}>
            {task.title}
          </Text>
        </View>
        <View style={styles.meta}>
          {due ? (
            <Badge
              label={`${late ? (task.kind === "match_duty" ? "Maç saati geçti · " : "Gecikti · ") : ""}${formatDue(due)}`}
              tone={dueTone(task, due)}
              size="xs"
              icon={task.kind === "match_duty" ? "time-outline" : "calendar-outline"}
            />
          ) : null}
          {high ? <Badge label="Yüksek" tone="warn" size="xs" icon="flag" /> : null}
          {task.status === "in_progress" ? <Badge label="Sürüyor" tone="info" size="xs" icon="play" /> : null}
          {task.kind !== "task" ? <Badge label={task.dutyLabel || task.kindLabel} size="xs" icon={KIND_ICONS[task.kind]} /> : null}
          {progress ? <Badge label={`${progress.done}/${progress.total}`} size="xs" icon="checkbox-outline" tone={progress.done === progress.total ? "win" : "neutral"} /> : null}
          {task.body ? <Ionicons name="reorder-three-outline" size={14} color={colors.textTertiary} accessibilityLabel="Açıklama var" /> : null}
        </View>
        {ctx ? (
          <View style={styles.ctxRow}>
            <Ionicons name={ctx.icon} size={12} color={colors.textTertiary} />
            <Text style={styles.ctx} numberOfLines={1} {...textScale.dense}>
              {ctx.text}
            </Text>
          </View>
        ) : null}
        <LabelChips labels={task.labels} />
        {person ? (
          <Text style={styles.ctx} numberOfLines={1} {...textScale.dense}>
            {task.source === "assigned_by_me" ? `→ ${person.name} yürütüyor` : `${person.name} atadı`}
          </Text>
        ) : null}
      </Touchable>

      <View style={styles.side}>
        {person ? <PersonDot person={person} size={26} /> : null}
        {canMove && !done ? (
          <Touchable
            feedback="icon"
            haptic="selection"
            onPress={() => onStatus(task, task.status === "in_progress" ? "open" : "in_progress")}
            style={[styles.step, task.status === "in_progress" ? styles.stepOn : null]}
            accessibilityLabel={task.status === "in_progress" ? `${task.title} duraklat` : `${task.title} başla`}
          >
            {task.status === "in_progress" ? (
              <LinearGradient colors={colors.gradientBrand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.stepFill]} />
            ) : null}
            <Ionicons name={task.status === "in_progress" ? "pause" : "play"} size={15} color={task.status === "in_progress" ? colors.textOnBrand : colors.brandAccent} />
          </Touchable>
        ) : !canMove ? (
          <Badge label={task.statusLabel} size="xs" tone={done ? "win" : task.status === "in_progress" ? "info" : "neutral"} />
        ) : null}
      </View>
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
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${task.title} kartını aç`}
      accessibilityHint={canMove ? "Taşımak için basılı tut" : undefined}
    >
      {stripeOf(task) ? <View style={[styles.stripe, { backgroundColor: stripeOf(task) ?? undefined }]} /> : null}
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
        <PersonDot person={person} size={24} />
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
  ava: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.surface1 },
  avaText: { ...type.nano, color: colors.onDark },
  labels: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  label: { paddingHorizontal: space.s, paddingVertical: 1, borderRadius: radius.pill, borderWidth: hairline, maxWidth: 160 },
  labelText: { ...type.micro, color: colors.textPrimary },
  progressRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  progress: { flex: 1 },
  progressText: { ...type.numSm, color: colors.textTertiary },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    minHeight: 64,
    paddingVertical: space.md,
    paddingLeft: space.lg,
    paddingRight: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  rowDone: { backgroundColor: colors.surface2 },
  stripe: { position: "absolute", left: 0, top: space.md, bottom: space.md, width: 3, borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill },
  check: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkDone: { backgroundColor: colors.win, borderColor: colors.win },
  checkWatch: { borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface3 },
  rowMain: { flex: 1, gap: space.s },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  title: { flex: 1, ...type.h4, color: colors.textPrimary },
  doneText: { textDecorationLine: "line-through", color: colors.textTertiary },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  ctxRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  ctx: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  side: { alignItems: "center", gap: space.sm },
  step: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  stepOn: { ...glowStyle(colors.glow, 1) },
  stepFill: { borderRadius: radius.pill },

  card: {
    gap: space.s,
    padding: space.md,
    paddingLeft: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  kind: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.xxs },
  kindText: { ...type.caption, color: colors.textTertiary },
  cardTitle: { ...type.h4, color: colors.textPrimary },
  readonly: { ...type.caption, color: colors.textTertiary },
});
