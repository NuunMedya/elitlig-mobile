/**
 * Bir alanın değerlendirme formu (hakem, spiker, ... ya da sosyal medya).
 *
 * Web: evaluations/EvaluationForm.js. Sorular kategoriye göre gruplanır.
 * Yapıldı / Yapılmadı soruları iki düğme, 1-10 puan soruları on düğmelik
 * sarmalayan sıra; "Uygulanamaz" izinli sorularda üçüncü düğme. Aksayan
 * maddede (yapılmadı ya da 1-4 puan) açıklama alanı kendiliğinden açılır.
 *
 * Üstteki canlı özet cevap verildikçe güncellenir: skor, bonus / kesinti,
 * skor eşiği ve hakediş. Kayıtta asıl hesap sunucuda yapılır.
 * Kayıtlı form önce OKUNUR özet olarak açılır; "Düzenle" forma çevirir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { InfoLine, Panel, SelectField } from "@/components/admin";
import { Badge, Button, EmptyState, Input, Touchable, toneColors } from "@/components/ui";
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
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { LevelBadge, MoneyText, ScoreBar } from "./widgets";

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
      <Panel>
        <View style={styles.summaryRow}>
          <View style={styles.flex}>
            <Text style={styles.overline} {...textScale.dense}>
              Canlı özet · {preview.answered}/{preview.total} cevaplandı
            </Text>
            <ScoreBar value={preview.scorePct} />
          </View>
          <LevelBadge value={preview.scorePct} />
        </View>
        {preview.fails > 0 ? <Badge label={`${preview.fails} aksayan madde`} tone="danger" icon="warning-outline" size="xs" /> : null}
        <PayoutLines baseFee={preview.baseFee} bonus={preview.bonus} deduction={preview.deduction} areaAmount={preview.areaAmount} net={preview.net} payout={preview.payout} />
      </Panel>

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
                  <Text style={styles.qNo} {...textScale.dense}>
                    {index + 1}
                  </Text>
                  <View style={styles.flex}>
                    <Text style={styles.qText} {...textScale.long}>
                      {q.text}
                      {q.weight > 1 ? <Text style={styles.weight}>  ×{q.weight}</Text> : null}
                    </Text>
                    {q.help ? (
                      <Text style={styles.help} {...textScale.long}>
                        {q.help}
                      </Text>
                    ) : null}
                    {money ? (
                      <Text style={styles.money} {...textScale.dense}>
                        {money}
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
                    <View style={styles.scale}>
                      {SCORE_VALUES.map((s) => (
                        <ScaleButton key={s} score={s} on={value !== NA && Number(value) === s && value !== undefined} onPress={() => setValue(q.id, s)} disabled={readOnly} />
                      ))}
                    </View>
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

function PayoutLines({ baseFee, bonus, deduction, areaAmount, net, payout }: { baseFee: number; bonus: number; deduction: number; areaAmount: number; net: number; payout: number }) {
  return (
    <View>
      {baseFee > 0 ? <InfoLine label="Taban ücret" value={formatTl(baseFee)} /> : null}
      <InfoLine label="Bonus" value={<MoneyText value={bonus} />} />
      <InfoLine label="Kesinti" value={<MoneyText value={-deduction} />} />
      {areaAmount !== 0 ? <InfoLine label="Skor eşiği" value={<MoneyText value={areaAmount} />} /> : null}
      <InfoLine label={baseFee > 0 ? "Hakediş" : "Net"} value={baseFee > 0 ? formatTl(payout) : <MoneyText value={net} />} />
    </View>
  );
}

/** Kayıtlı formun okunur özeti. */
function EvaluationSummary({ evaluation, canSubmit, onEdit, onDelete }: { evaluation: Evaluation; canSubmit: boolean; onEdit: () => void; onDelete?: () => void }) {
  const groups = groupByCategory(evaluation.answers);
  return (
    <View style={styles.form}>
      <Panel>
        <View style={styles.summaryRow}>
          <View style={styles.flex}>
            <Text style={styles.overline} {...textScale.dense}>
              Değerlendirilen
            </Text>
            <Text style={styles.who} {...textScale.dense}>
              {evaluation.staffName || `Personel #${evaluation.staffId}`}
            </Text>
          </View>
          <LevelBadge value={evaluation.scorePct} />
        </View>
        <ScoreBar value={evaluation.scorePct} />
        <PayoutLines
          baseFee={evaluation.baseFee}
          bonus={evaluation.bonus}
          deduction={evaluation.deduction}
          areaAmount={evaluation.areaAmount}
          net={evaluation.net}
          payout={evaluation.payout}
        />
      </Panel>
      {groups.map((group) => (
        <Panel key={group.key} title={groups.length > 1 ? group.label : undefined}>
          {group.items.map((a) => (
            <View key={a.questionId} style={styles.answerRow}>
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
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      haptic="selection"
      style={[styles.choice, on ? { backgroundColor: c.solidBg, borderColor: c.solidBg } : null]}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
    >
      {icon ? <Ionicons name={icon} size={16} color={on ? c.solidFg : c.fg} /> : null}
      <Text style={[styles.choiceText, { color: on ? c.solidFg : colors.textPrimary }]} {...textScale.dense}>
        {label}
      </Text>
    </Touchable>
  );
}

function ScaleButton({ score, on, onPress, disabled }: { score: number; on: boolean; onPress: () => void; disabled?: boolean }) {
  const c = toneColors(score < 5 ? "danger" : score >= 8 ? "win" : "brand");
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      haptic="selection"
      style={[styles.scaleBtn, on ? { backgroundColor: c.solidBg, borderColor: c.solidBg } : null]}
      accessibilityRole="radio"
      accessibilityLabel={`${score} puan`}
      accessibilityState={{ checked: on }}
    >
      <Text style={[styles.scaleText, { color: on ? c.solidFg : colors.textPrimary }]} {...textScale.badge}>
        {score}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  flex: { flex: 1 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  overline: { ...type.overline, color: colors.textTertiary, marginBottom: space.xs },
  who: { ...type.h3, color: colors.textPrimary },
  group: { gap: space.sm },
  question: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  answered: { borderColor: colors.borderStrong },
  failed: { borderColor: colors.danger },
  qHead: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  qNo: { ...type.numSmStrong, color: colors.textTertiary, width: 18 },
  qText: { ...type.body, color: colors.textPrimary },
  weight: { ...type.caption, color: colors.brandAccent },
  help: { ...type.caption, color: colors.textTertiary },
  money: { ...type.caption, color: colors.textSecondary },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
  },
  choiceText: { ...type.label },
  scale: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  scaleBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
  },
  scaleText: { ...type.tableNumStrong },
  answerRow: { flexDirection: "row", gap: space.md, paddingVertical: space.xs, alignItems: "flex-start" },
  answerText: { ...type.bodySm, color: colors.textPrimary },
  answerSide: { alignItems: "flex-end", gap: 2 },
  error: { ...type.bodySm, color: colors.danger },
  actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
});

