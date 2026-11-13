/**
 * Bir alanın değerlendirme formu (hakem, spiker, ... ya da sosyal medya).
 *
 * Web: evaluations/EvaluationForm.js. Sorular kategoriye göre gruplanır.
 * Yapıldı / Yapılmadı soruları iki düğme, 1-10 puan soruları tek raylı
 * puan seçici (seçilene kadar degradeyle dolar, seçilen hücre yaylanır); "Uygulanamaz" izinli sorularda üçüncü düğme. Aksayan
 * maddede (yapılmadı ya da 1-4 puan) açıklama alanı kendiliğinden açılır.
 *
 * Üstteki canlı özet cevap verildikçe güncellenir: skor, bonus / kesinti,
 * skor eşiği ve hakediş. Kayıtta asıl hesap sunucuda yapılır.
 * Kayıtlı form önce OKUNUR özet olarak açılır; "Düzenle" forma çevirir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { Panel, SelectField } from "@/components/admin";
import { Badge, Button, EmptyState, GradientBar, Input, Touchable, toneColors, useReduceMotion } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import {
  amountSummary,
  answerComment,
  answersFromEvaluation,
  answerValue,
  formatDay,
  formatPct,
  formatTl,
  groupByCategory,
  NA,
  previewEvaluation,
  SCORE_VALUES,
  type AnswerEntry,
  type AnswerValue,
  type AreaSetting,
  type EvalQuestion,
  type EvalStaffOption,
  type Evaluation,
  type SavePayload,
} from "@/lib/api/admin/evaluations";
import { colors, hairline, radius, space, spring, textScale, type } from "@/theme";

import { levelGradient, ScoreDial } from "./EvalParts";
import { LevelBadge, MoneyText } from "./widgets";

const isFail = (q: EvalQuestion, v: AnswerValue | undefined) =>
  v !== undefined && v !== null && v !== NA && (q.answerType === "yes_no" ? v === false : Number(v) < 5);

export interface EvaluationFormProps {
  questions: EvalQuestion[];
  staff: EvalStaffOption[];
  defaultStaffId?: number | null;
  evaluation?: Evaluation | null;
  setting?: AreaSetting | null;
  lockStaff?: boolean;
  canSubmit: boolean;
  onSave: (payload: SavePayload) => Promise<unknown>;
  onSaveNext?: (payload: SavePayload) => Promise<unknown>;
  onDelete?: () => void;
  emptyHint?: string;
  emptyAction?: { label: string; onPress: () => void } | null;
}

export function EvaluationForm({
  questions,
  staff,
  defaultStaffId,
  evaluation,
  setting,
  lockStaff,
  canSubmit,
  onSave,
  onSaveNext,
  onDelete,
  emptyHint,
  emptyAction,
}: EvaluationFormProps) {
  const [staffId, setStaffId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerEntry>>({});
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(!evaluation);

  // Kayıt ya da önerilen kişi değişince form baştan kurulur.
  useEffect(() => {
    setStaffId(evaluation?.staffId ?? defaultStaffId ?? null);
    setAnswers(answersFromEvaluation(evaluation, questions));
    setOpenComments({});
    setNote(evaluation?.note || "");
    setError("");
    setEditing(!evaluation);
  }, [evaluation, defaultStaffId, questions]);

  const preview = useMemo(() => previewEvaluation(questions, answers, setting), [questions, answers, setting]);
  const groups = useMemo(() => groupByCategory(questions), [questions]);
  const readOnly = !canSubmit;

  const setValue = (id: number, value: AnswerValue) =>
    setAnswers((prev) => {
      const comment = answerComment(prev[id]);
      return { ...prev, [id]: comment ? { value, comment } : value };
    });
  const setComment = (id: number, comment: string) =>
    setAnswers((prev) => {
      const value = answerValue(prev[id]);
      if (value === undefined) return prev;
      return { ...prev, [id]: { value, comment } };
    });
  const fillAllYes = () =>
    setAnswers((prev) => {
      const next = { ...prev };
      questions.forEach((q) => {
        if (q.answerType === "yes_no" && answerValue(next[q.id]) === undefined) next[q.id] = true;
      });
      return next;
    });

  const submit = async (goNext: boolean) => {
    if (!staffId) return setError("Değerlendirilen personeli seç.");
    if (!preview.complete) return setError(`Tüm soruları cevapla (${preview.answered}/${preview.total}).`);
    setSaving(true);
    setError("");
    try {
      const payload = Object.fromEntries(Object.entries(answers).filter(([, e]) => answerValue(e) !== undefined));
      await (goNext && onSaveNext ? onSaveNext : onSave)({ staffId, answers: payload, note });
      setEditing(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (!questions.length && !evaluation) {
    return (
      <EmptyState
        icon="list-outline"
        title="Bu alan için henüz soru yok"
        body={emptyHint || "Sorular ve Ücretler sekmesinden bu alanın sorularını ekle."}
        action={emptyAction ?? undefined}
        variant="inline"
      />
    );
  }

  if (evaluation && !editing) {
    return <EvaluationSummary evaluation={evaluation} canSubmit={canSubmit} onEdit={() => setEditing(true)} onDelete={onDelete} />;
  }

  const unansweredYesNo = questions.some((q) => q.answerType === "yes_no" && answerValue(answers[q.id]) === undefined);
  const suggested = defaultStaffId != null && defaultStaffId === staffId;

  return (
    <View style={styles.form}>
      {/* Canlı özet: skor halkası, cevap ilerlemesi, para kalemleri. */}
      <View style={styles.live}>
        <View style={styles.liveTop}>
          <ScoreDial value={preview.scorePct} size={78} caption="canlı skor" />
          <View style={styles.flex}>
            <Text style={styles.overline} {...textScale.dense}>
              CANLI ÖZET
            </Text>
            <Text style={styles.liveCount} {...textScale.dense}>
              {preview.answered}/{preview.total} soru cevaplandı
            </Text>
            <GradientBar value={preview.total ? preview.answered / preview.total : 0} height={6} />
            <View style={styles.liveBadges}>
              <LevelBadge value={preview.scorePct} />
              {preview.fails > 0 ? <Badge label={`${preview.fails} aksayan`} tone="danger" icon="warning-outline" size="xs" /> : null}
            </View>
          </View>
        </View>
        <PayoutLines baseFee={preview.baseFee} bonus={preview.bonus} deduction={preview.deduction} areaAmount={preview.areaAmount} net={preview.net} payout={preview.payout} />
      </View>

      <SelectField<number>
        label={suggested ? "Değerlendirilen personel (görevli)" : "Değerlendirilen personel"}
        required
        value={staffId}
        disabled={readOnly || lockStaff}
        placeholder="Personel seç"
        options={staff.map((p) => ({ value: p.id, label: `${p.fullName}${p.status === "passive" ? " (pasif)" : ""}` }))}
        onChange={(v) => setStaffId(v)}
      />
      {canSubmit && unansweredYesNo ? (
        <Button label="Boş kalanları “Yapıldı” işaretle" icon="checkmark-done-outline" size="sm" variant="secondary" onPress={fillAllYes} />
      ) : null}

      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          {groups.length > 1 ? (
            <Text style={styles.overline} {...textScale.dense}>
              {group.label}
            </Text>
          ) : null}
          {group.items.map((q, index) => {
            const value = answerValue(answers[q.id]);
            const comment = answerComment(answers[q.id]);
            const fail = isFail(q, value);
            const showComment = fail || openComments[q.id] || Boolean(comment);
            const money = amountSummary(q);
            return (
              <View key={q.id} style={[styles.question, value !== undefined ? styles.answered : null, fail ? styles.failed : null]}>
                <View style={styles.qHead}>
                  <View style={[styles.qNo, value !== undefined ? (fail ? styles.qNoFail : styles.qNoDone) : null]}>
                    {value !== undefined ? (
                      <Ionicons name={fail ? "alert" : "checkmark"} size={13} color={colors.onDark} />
                    ) : (
                      <Text style={styles.qNoText} {...textScale.badge}>
                        {index + 1}
                      </Text>
                    )}
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.qText} {...textScale.long}>
                      {q.text}
                    </Text>
                    {q.weight > 1 || money ? (
                      <View style={styles.qTags}>
                        {q.weight > 1 ? <Badge label={`Ağırlık ×${q.weight}`} tone="brand" size="xs" /> : null}
                        {money ? <Badge label={money} tone="neutral" icon="cash-outline" size="xs" /> : null}
                      </View>
                    ) : null}
                    {q.help ? (
                      <Text style={styles.help} {...textScale.long}>
                        {q.help}
                      </Text>
                    ) : null}
                  </View>
                  {canSubmit && !showComment && value !== undefined ? (
                    <Touchable onPress={() => setOpenComments((p) => ({ ...p, [q.id]: true }))} accessibilityLabel="Açıklama ekle" accessibilityRole="button" hitSlop={10}>
                      <Ionicons name="chatbubble-outline" size={18} color={colors.textTertiary} />
                    </Touchable>
                  ) : null}
                </View>

                {q.answerType === "yes_no" ? (
                  <View style={styles.choices}>
                    <Choice label="Yapıldı" icon="checkmark" tone="win" on={value === true} onPress={() => setValue(q.id, true)} disabled={readOnly} />
                    <Choice label="Yapılmadı" icon="close" tone="danger" on={value === false} onPress={() => setValue(q.id, false)} disabled={readOnly} />
                    {q.allowNa ? <Choice label="Uygulanamaz" tone="neutral" on={value === NA} onPress={() => setValue(q.id, NA)} disabled={readOnly} /> : null}
                  </View>
                ) : (
                  <>
                    <ScoreScale value={value === undefined || value === NA ? null : Number(value)} onChange={(v) => setValue(q.id, v)} disabled={readOnly} />
                    {q.allowNa ? (
                      <View style={styles.choices}>
                        <Choice label="Uygulanamaz" tone="neutral" on={value === NA} onPress={() => setValue(q.id, NA)} disabled={readOnly} />
                      </View>
                    ) : null}
                  </>
                )}

                {showComment ? (
                  <Input
                    size="sm"
                    value={comment}
                    maxLength={300}
                    editable={!readOnly && value !== undefined}
                    onChangeText={(t) => setComment(q.id, t)}
                    placeholder={fail ? "Neden aksadı? (isteğe bağlı)" : "Açıklama (isteğe bağlı)"}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ))}

      <Input label="Genel not (isteğe bağlı)" value={note} onChangeText={setNote} multiline numberOfLines={3} maxLength={1000} editable={!readOnly} placeholder="Genel gözlem ya da geri bildirim" />

      {error ? (
        <Text style={styles.error} {...textScale.long}>
          {error}
        </Text>
      ) : null}
      {canSubmit ? (
        <View style={styles.actions}>
          {evaluation ? <Button label="Vazgeç" variant="ghost" onPress={() => setEditing(false)} disabled={saving} /> : null}
          {onSaveNext ? <Button label="Kaydet ve sonraki" variant="secondary" icon="arrow-forward" iconPosition="right" onPress={() => void submit(true)} disabled={saving} /> : null}
          <Button label="Kaydet" onPress={() => void submit(false)} loading={saving} haptic="success" style={styles.flex} />
        </View>
      ) : null}
    </View>
  );
}

/** Para kalemleri: küçük cam karolar (taban · bonus · kesinti · eşik) + vurgulu hakediş. */
function PayoutLines({ baseFee, bonus, deduction, areaAmount, net, payout }: { baseFee: number; bonus: number; deduction: number; areaAmount: number; net: number; payout: number }) {
  const cells = [
    baseFee > 0 ? { label: "Taban", value: formatTl(baseFee), tone: colors.textPrimary } : null,
    { label: "Bonus", value: formatTl(bonus, true), tone: bonus ? colors.win : colors.textSecondary },
    { label: "Kesinti", value: formatTl(-deduction, true), tone: deduction ? colors.danger : colors.textSecondary },
    areaAmount !== 0 ? { label: "Skor eşiği", value: formatTl(areaAmount, true), tone: areaAmount > 0 ? colors.win : colors.danger } : null,
  ].filter(Boolean) as { label: string; value: string; tone: string }[];
  return (
    <View style={styles.pay}>
      <View style={styles.payCells}>
        {cells.map((c) => (
          <View key={c.label} style={styles.payCell}>
            <Text style={styles.payLabel} {...textScale.badge}>
              {c.label.toLocaleUpperCase("tr-TR")}
            </Text>
            <Text style={[styles.payValue, { color: c.tone }]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
              {c.value}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.payTotal}>
        <Text style={styles.payTotalLabel} {...textScale.dense}>
          {baseFee > 0 ? "Hakediş" : "Net"}
        </Text>
        {baseFee > 0 ? (
          <Text style={styles.payTotalValue} {...textScale.badge}>
            {formatTl(payout)}
          </Text>
        ) : (
          <MoneyText value={net} style={styles.payTotalValue} />
        )}
      </View>
    </View>
  );
}

/** Kayıtlı formun okunur özeti. */
function EvaluationSummary({ evaluation, canSubmit, onEdit, onDelete }: { evaluation: Evaluation; canSubmit: boolean; onEdit: () => void; onDelete?: () => void }) {
  const groups = groupByCategory(evaluation.answers);
  return (
    <View style={styles.form}>
      <View style={styles.live}>
        <View style={styles.liveTop}>
          <ScoreDial value={evaluation.scorePct} size={78} />
          <View style={styles.flex}>
            <Text style={styles.overline} {...textScale.dense}>
              KAYITLI DEĞERLENDİRME
            </Text>
            <Text style={styles.who} numberOfLines={1} {...textScale.dense}>
              {evaluation.staffName || `Personel #${evaluation.staffId}`}
            </Text>
            <View style={styles.liveBadges}>
              <LevelBadge value={evaluation.scorePct} />
              {evaluation.failCount ? <Badge label={`${evaluation.failCount} aksayan`} tone="danger" size="xs" /> : <Badge label="Aksama yok" tone="win" size="xs" />}
            </View>
          </View>
        </View>
        <PayoutLines
          baseFee={evaluation.baseFee}
          bonus={evaluation.bonus}
          deduction={evaluation.deduction}
          areaAmount={evaluation.areaAmount}
          net={evaluation.net}
          payout={evaluation.payout}
        />
      </View>
      {groups.map((group) => (
        <Panel key={group.key} title={groups.length > 1 ? group.label : undefined}>
          {group.items.map((a) => (
            <View key={a.questionId} style={styles.answerRow}>
              <AnswerIcon answer={a} />
              <View style={styles.flex}>
                <Text style={styles.answerText} {...textScale.long}>
                  {a.text}
                </Text>
                {a.comment ? (
                  <Text style={styles.help} {...textScale.long}>
                    “{a.comment}”
                  </Text>
                ) : null}
              </View>
              <View style={styles.answerSide}>
                <AnswerBadge answer={a} />
                {a.amount ? <MoneyText value={a.amount} /> : null}
              </View>
            </View>
          ))}
        </Panel>
      ))}
      {evaluation.note ? (
        <Panel title="Not">
          <Text style={styles.answerText} {...textScale.long}>
            {evaluation.note}
          </Text>
        </Panel>
      ) : null}
      <Text style={styles.help} {...textScale.dense}>
        {[evaluation.evaluatorName, evaluation.updatedAt ? formatDay(String(evaluation.updatedAt).slice(0, 10)) : null].filter(Boolean).join(" · ")}
      </Text>
      {canSubmit ? (
        <View style={styles.actions}>
          {onDelete ? <Button label="Sil" icon="trash-outline" variant="danger" onPress={onDelete} /> : null}
          <Button label="Düzenle" icon="create-outline" variant="secondary" onPress={onEdit} style={styles.flex} />
        </View>
      ) : null}
    </View>
  );
}

function AnswerBadge({ answer }: { answer: Evaluation["answers"][number] }) {
  if (answer.na) return <Badge label="Uygulanamaz" size="xs" />;
  if (answer.type === "yes_no") return answer.value ? <Badge label="Yapıldı" tone="win" icon="checkmark" size="xs" /> : <Badge label="Yapılmadı" tone="danger" icon="close" size="xs" />;
  const pts = Number(answer.points ?? answer.value);
  return <Badge label={`${answer.value}/10`} tone={pts < 5 ? "danger" : pts >= 8 ? "win" : "neutral"} size="xs" />;
}

function Choice({ label, icon, tone, on, onPress, disabled }: { label: string; icon?: keyof typeof Ionicons.glyphMap; tone: "win" | "danger" | "neutral"; on: boolean; onPress: () => void; disabled?: boolean }) {
  const c = toneColors(tone);
  const pop = usePop(on);
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      haptic="selection"
      style={styles.choiceWrap}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
    >
      <Animated.View style={[styles.choice, on ? { backgroundColor: c.solidBg, borderColor: c.solidBg } : null, { transform: [{ scale: pop }] }]}>
        {icon ? (
          <View style={[styles.choiceIcon, { backgroundColor: on ? colors.inkPill : c.dim }]}>
            <Ionicons name={icon} size={13} color={on ? c.solidFg : c.fg} />
          </View>
        ) : null}
        <Text style={[styles.choiceText, { color: on ? c.solidFg : colors.textPrimary }]} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
      </Animated.View>
    </Touchable>
  );
}

/**
 * PUAN SEÇİCİ — 1-10 tek ray. Seçilen değere kadar olan hücreler seviye
 * degradesiyle dolar; seçilen hücre yaylanarak (spring.pop) büyür.
 */
function ScoreScale({ value, onChange, disabled }: { value: number | null; onChange: (v: number) => void; disabled?: boolean }) {
  const fill = value == null ? null : levelGradient(value * 10);
  return (
    <View style={styles.scale} accessibilityRole="radiogroup">
      {SCORE_VALUES.map((score) => (
        <ScaleCell key={score} score={score} filled={value != null && score <= value} on={value === score} gradient={fill} onPress={() => onChange(score)} disabled={disabled} />
      ))}
    </View>
  );
}

function ScaleCell({ score, filled, on, gradient, onPress, disabled }: { score: number; filled: boolean; on: boolean; gradient: readonly [string, string] | null; onPress: () => void; disabled?: boolean }) {
  const pop = usePop(on);
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      haptic="selection"
      style={styles.scaleCell}
      accessibilityRole="radio"
      accessibilityLabel={`${score} puan`}
      accessibilityState={{ checked: on }}
    >
      <Animated.View style={[styles.scaleBtn, filled ? styles.scaleFilled : null, on ? styles.scaleOn : null, { transform: [{ scale: pop }] }]}>
        {filled && gradient ? <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: on ? 1 : 0.55 }]} /> : null}
        <Text style={[styles.scaleText, filled ? { color: colors.onDark } : null]} {...textScale.badge}>
          {score}
        </Text>
      </Animated.View>
    </Touchable>
  );
}

/** Seçilince bir kez yaylanan ölçek (1 → 1.14 → 1). Hareket azaltılmışsa durağan. */
function usePop(on: boolean): Animated.Value {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!on || reduce) return;
    v.setValue(1.14);
    Animated.spring(v, { toValue: 1, ...spring.pop }).start();
  }, [on, reduce, v]);
  return v;
}

function AnswerIcon({ answer }: { answer: Evaluation["answers"][number] }) {
  const pts = Number(answer.points ?? answer.value);
  const tone = answer.na ? "neutral" : answer.type === "yes_no" ? (answer.value ? "win" : "danger") : pts < 5 ? "danger" : pts >= 8 ? "win" : "brand";
  const c = toneColors(tone);
  return (
    <View style={[styles.answerIcon, { backgroundColor: c.dim }]}>
      {answer.type === "score" && !answer.na ? (
        <Text style={[styles.answerIconText, { color: c.fg }]} {...textScale.badge}>
          {String(answer.value)}
        </Text>
      ) : (
        <Ionicons name={answer.na ? "remove" : answer.value ? "checkmark" : "close"} size={13} color={c.fg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  live: { gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  liveTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  liveCount: { ...type.label, color: colors.textPrimary },
  liveBadges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 2 },
  overline: { ...type.overline, color: colors.textTertiary },
  who: { ...type.h3, color: colors.textPrimary },
  pay: { gap: space.sm },
  payCells: { flexDirection: "row", gap: space.xs },
  payCell: { flex: 1, minWidth: 0, gap: 2, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  payLabel: { ...type.nano, color: colors.textTertiary },
  payValue: { ...type.numSmStrong },
  payTotal: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.brandDim },
  payTotalLabel: { ...type.label, color: colors.textPrimary },
  payTotalValue: { ...type.scoreSm, color: colors.textPrimary },
  group: { gap: space.sm },
  question: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  answered: { borderColor: colors.borderStrong },
  failed: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  qHead: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  qNo: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  qNoDone: { backgroundColor: colors.win },
  qNoFail: { backgroundColor: colors.danger },
  qNoText: { ...type.numSmStrong, color: colors.textSecondary },
  qText: { ...type.label, color: colors.textPrimary },
  qTags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 2 },
  help: { ...type.caption, color: colors.textTertiary },
  choices: { flexDirection: "row", gap: space.sm },
  choiceWrap: { flex: 1 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
  },
  choiceIcon: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  choiceText: { ...type.labelSm, flexShrink: 1 },
  scale: { flexDirection: "row", gap: 3, padding: 3, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  scaleCell: { flex: 1 },
  scaleBtn: {
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    overflow: "hidden",
  },
  scaleFilled: {},
  scaleOn: { borderWidth: 2, borderColor: colors.onDark },
  scaleText: { ...type.tableNumStrong, color: colors.textSecondary },
  answerRow: { flexDirection: "row", gap: space.sm, paddingVertical: space.xs, alignItems: "flex-start" },
  answerIcon: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  answerIconText: { ...type.numSmStrong },
  answerText: { ...type.bodySm, color: colors.textPrimary },
  answerSide: { alignItems: "flex-end", gap: 2 },
  error: { ...type.bodySm, color: colors.danger },
  actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
});
