/**
 * Sorular ve Ücretler alt sayfaları.
 *
 *   QuestionSheet  soru ekle / düzenle: metin, açıklama, kategori, ağırlık
 *                  (1-5), cevap türü, "uygulanamaz" izni ve cevaba bağlı
 *                  bonus / kesinti (yapıldı-yapılmadı tutarı ya da puan
 *                  aralığı kuralları).
 *   SettingSheet   alanın taban ücreti ve formun toplam skoruna bağlı
 *                  eşikler (%90-100 → +300 ₺ gibi). Kayıtlı formlar da yeni
 *                  ücretle sunucuda güncellenir.
 *
 * Web: evaluations/QuestionsTab.js (AmountInput, RangeRules, AreaSettingsCard).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChipsField, SegmentField, ToggleField } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, Input, Touchable } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { toNumber } from "@/lib/admin/format";
import type { AreaSetting, EvalQuestion, QuestionPayload, ScoreRule } from "@/lib/api/admin/evaluations";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

type Kind = "none" | "bonus" | "kesinti";
interface RuleForm {
  min: string;
  max: string;
  kind: Exclude<Kind, "none">;
  amount: string;
}

const kindOf = (amount: number | null | undefined): Kind => (Number(amount) > 0 ? "bonus" : Number(amount) < 0 ? "kesinti" : "none");
const signed = (kind: Kind, amount: string) => {
  const v = Math.abs(toNumber(amount) ?? 0);
  return kind === "bonus" ? v : kind === "kesinti" ? -v : 0;
};
const rulesToForm = (rules: ScoreRule[] = []): RuleForm[] =>
  rules.map((r) => ({ min: String(r.min), max: String(r.max), kind: Number(r.amount) < 0 ? "kesinti" : "bonus", amount: String(Math.abs(r.amount)) }));
const rulesFromForm = (rules: RuleForm[]): ScoreRule[] =>
  rules.map((r) => ({ min: Number(r.min), max: Number(r.max), amount: signed(r.kind, r.amount) }));

const KIND_OPTIONS = [
  { key: "none", label: "Yok" },
  { key: "bonus", label: "Bonus" },
  { key: "kesinti", label: "Kesinti" },
];

function AmountRow({ label, kind, amount, onKind, onAmount }: { label: string; kind: Kind; amount: string; onKind: (k: Kind) => void; onAmount: (v: string) => void }) {
  return (
    <View style={styles.amount}>
      <SegmentField<string> label={label} value={kind} options={KIND_OPTIONS} onChange={(k) => onKind(k as Kind)} />
      {kind !== "none" ? <Input value={amount} onChangeText={onAmount} keyboardType="decimal-pad" placeholder="Tutar ₺" /> : null}
    </View>
  );
}

/** Aralık kuralları: puan (1-10) ya da skor (%0-100). */
function RangeRules({ rules, onChange, unit, addDefaults }: { rules: RuleForm[]; onChange: (r: RuleForm[]) => void; unit: "puan" | "%"; addDefaults: (count: number) => RuleForm }) {
  const patch = (i: number, v: Partial<RuleForm>) => onChange(rules.map((r, idx) => (idx === i ? { ...r, ...v } : r)));
  return (
    <View style={styles.rules}>
      {rules.map((rule, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={i} style={styles.rule}>
          <View style={styles.ruleRow}>
            <Input containerStyle={styles.ruleNum} size="sm" label={unit === "%" ? "En az %" : "En az"} value={rule.min} keyboardType="number-pad" onChangeText={(t) => patch(i, { min: t })} />
            <Input containerStyle={styles.ruleNum} size="sm" label={unit === "%" ? "En çok %" : "En çok"} value={rule.max} keyboardType="number-pad" onChangeText={(t) => patch(i, { max: t })} />
            <Touchable onPress={() => onChange(rules.filter((_, idx) => idx !== i))} accessibilityLabel="Aralığı kaldır" accessibilityRole="button" style={styles.ruleRemove}>
              <Ionicons name="close" size={18} color={colors.danger} />
            </Touchable>
          </View>
          <View style={styles.ruleRow}>
            <ChipGroup contentPadding={0}>
              <Chip size="sm" label="Bonus" selected={rule.kind === "bonus"} onPress={() => patch(i, { kind: "bonus" })} />
              <Chip size="sm" label="Kesinti" selected={rule.kind === "kesinti"} onPress={() => patch(i, { kind: "kesinti" })} />
            </ChipGroup>
            <Input containerStyle={styles.flex} size="sm" value={rule.amount} keyboardType="decimal-pad" placeholder="Tutar ₺" onChangeText={(t) => patch(i, { amount: t })} />
          </View>
        </View>
      ))}
      <Button label="Aralık ekle" icon="add" size="sm" variant="secondary" onPress={() => onChange([...rules, addDefaults(rules.length)])} />
    </View>
  );
}

interface QForm {
  text: string;
  help: string;
  category: string;
  weight: string;
  allowNa: boolean;
  answerType: "yes_no" | "score";
  yesKind: Kind;
  yesAmount: string;
  noKind: Kind;
  noAmount: string;
  rules: RuleForm[];
}

const EMPTY: QForm = { text: "", help: "", category: "", weight: "1", allowNa: false, answerType: "yes_no", yesKind: "none", yesAmount: "", noKind: "kesinti", noAmount: "", rules: [] };

const formFrom = (q: EvalQuestion): QForm => ({
  text: q.text,
  help: q.help || "",
  category: q.category || "",
  weight: String(q.weight || 1),
  allowNa: Boolean(q.allowNa),
  answerType: q.answerType,
  yesKind: kindOf(q.yesAmount),
  yesAmount: q.yesAmount ? String(Math.abs(q.yesAmount)) : "",
  noKind: kindOf(q.noAmount),
  noAmount: q.noAmount ? String(Math.abs(q.noAmount)) : "",
  rules: rulesToForm(q.scoreRules),
});

export function QuestionSheet({
  visible,
  onClose,
  area,
  areaLabel,
  question,
  categories,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  area: string;
  areaLabel: string;
  question: EvalQuestion | null;
  categories: string[];
  onSubmit: (payload: QuestionPayload) => Promise<unknown>;
}) {
  const [form, setForm] = useState<QForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const set = (v: Partial<QForm>) => setForm((p) => ({ ...p, ...v }));

  useEffect(() => {
    if (visible) {
      setForm(question ? formFrom(question) : EMPTY);
      setFailure("");
    }
  }, [visible, question]);

  const submit = async () => {
    if (!form.text.trim()) return setFailure("Soru metni zorunludur.");
    setBusy(true);
    setFailure("");
    try {
      await onSubmit({
        area,
        text: form.text,
        help: form.help,
        category: form.category,
        weight: Number(form.weight) || 1,
        allowNa: form.allowNa,
        answerType: form.answerType,
        yesAmount: form.answerType === "yes_no" ? signed(form.yesKind, form.yesAmount) : 0,
        noAmount: form.answerType === "yes_no" ? signed(form.noKind, form.noAmount) : 0,
        scoreRules: form.answerType === "score" ? rulesFromForm(form.rules) : [],
      });
      onClose();
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title={`${question ? "Soruyu düzenle" : "Yeni soru"} · ${areaLabel}`}
      snap="full"
      footer={<Button label={question ? "Kaydet" : "Soru ekle"} onPress={() => void submit()} loading={busy} haptic="success" />}
    >
      <View style={styles.form}>
        <Group title="Soru" icon="help-circle">
        <Input label="Soru *" value={form.text} maxLength={300} onChangeText={(t) => set({ text: t })} placeholder="Örn. Maça zamanında geldi mi?" multiline />
        <Input floating label="Açıklama (isteğe bağlı)" value={form.help} maxLength={500} onChangeText={(t) => set({ help: t })} />
        <Input floating label="Kategori" value={form.category} maxLength={60} onChangeText={(t) => set({ category: t })} />
        {categories.length ? (
          <ChipGroup scrollable contentPadding={0}>
            {categories.map((c) => (
              <Chip key={c} size="sm" label={c} selected={form.category === c} onPress={() => set({ category: c })} />
            ))}
          </ChipGroup>
        ) : null}
        </Group>
        <Group title="Puanlama" icon="speedometer">
        <ChipsField<string>
          label="Ağırlık (skora etkisi)"
          value={form.weight}
          options={["1", "2", "3", "4", "5"].map((w) => ({ key: w, label: w === "1" ? "1 (normal)" : `${w} kat` }))}
          onChange={(v) => set({ weight: typeof v === "string" ? v : "1" })}
        />
        <SegmentField<string>
          label="Cevap türü"
          value={form.answerType}
          options={[
            { key: "yes_no", label: "Yapıldı / Yapılmadı" },
            { key: "score", label: "1-10 Puan" },
          ]}
          onChange={(v) => set({ answerType: v as QForm["answerType"] })}
        />
        <ToggleField
          label="“Uygulanamaz” cevabına izin ver"
          hint="Örn. sakatlık olmayan maçta müdahale sorusu; skora ve tutara girmez."
          value={form.allowNa}
          onChange={(v) => set({ allowNa: v })}
        />
        </Group>
        <Group title="Bonus / kesinti" icon="cash">
        {form.answerType === "yes_no" ? (
          <>
            <AmountRow label="Yapıldı" kind={form.yesKind} amount={form.yesAmount} onKind={(k) => set({ yesKind: k })} onAmount={(v) => set({ yesAmount: v })} />
            <AmountRow label="Yapılmadı" kind={form.noKind} amount={form.noAmount} onKind={(k) => set({ noKind: k })} onAmount={(v) => set({ noAmount: v })} />
          </>
        ) : (
          <>
            <Text style={styles.hint} {...textScale.long}>
              Verilen puan bir aralığa düşerse o aralığın bonusu ya da kesintisi uygulanır.
            </Text>
            <RangeRules
              rules={form.rules}
              onChange={(rules) => set({ rules })}
              unit="puan"
              addDefaults={(n) => (n ? { min: "9", max: "10", kind: "bonus", amount: "" } : { min: "1", max: "4", kind: "kesinti", amount: "" })}
            />
          </>
        )}
        </Group>
        {failure ? (
          <Text style={styles.error} {...textScale.long}>
            {failure}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

export function SettingSheet({
  visible,
  onClose,
  areaLabel,
  setting,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  areaLabel: string;
  setting: AreaSetting | null | undefined;
  onSubmit: (body: AreaSetting) => Promise<unknown>;
}) {
  const [baseFee, setBaseFee] = useState("");
  const [rules, setRules] = useState<RuleForm[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (!visible) return;
    setBaseFee(setting?.baseFee ? String(setting.baseFee) : "");
    setRules(rulesToForm(setting?.scoreRules));
    setFailure("");
  }, [visible, setting]);

  const submit = async () => {
    setBusy(true);
    setFailure("");
    try {
      await onSubmit({ baseFee: toNumber(baseFee) ?? 0, scoreRules: rulesFromForm(rules) });
      onClose();
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title={`Ücret ve hakediş · ${areaLabel}`}
      snap="full"
      footer={<Button label="Ücret ayarını kaydet" onPress={() => void submit()} loading={busy} haptic="success" />}
    >
      <View style={styles.form}>
        <Text style={styles.hint} {...textScale.long}>
          Hakediş = taban ücret + bonuslar − kesintiler. Kayıtlı formlar da yeni ücretle güncellenir.
        </Text>
        <Group title="Taban ücret" icon="wallet">
          <Input floating label="Taban ücret (her form için)" value={baseFee} onChangeText={setBaseFee} keyboardType="decimal-pad" />
        </Group>
        <Group title="Toplam skora göre bonus / kesinti" icon="trending-up">
        <RangeRules
          rules={rules}
          onChange={setRules}
          unit="%"
          addDefaults={(n) => (n ? { min: "90", max: "100", kind: "bonus", amount: "" } : { min: "0", max: "49", kind: "kesinti", amount: "" })}
        />
        </Group>
        {failure ? (
          <Text style={styles.error} {...textScale.long}>
            {failure}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** Cam grup kartı: versal başlık + küçük ikon; form alanları içinde. */
function Group({ title, icon, children }: { title: string; icon: React.ComponentProps<typeof Ionicons>["name"]; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Ionicons name={icon} size={13} color={colors.brandAccent} />
        <Text style={styles.groupTitle} accessibilityRole="header" {...textScale.badge}>
          {title.toLocaleUpperCase("tr-TR")}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  group: { gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.glass, borderWidth: hairline, borderColor: colors.glassLine },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  groupTitle: { ...type.overline, color: colors.textSecondary },
  flex: { flex: 1 },
  amount: { gap: space.sm },
  rules: { gap: space.sm },
  rule: {
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  ruleRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-end" },
  ruleNum: { flex: 1 },
  ruleRemove: { padding: space.sm },
  hint: { ...type.bodySm, color: colors.textSecondary },
  label: { ...type.label, color: colors.textSecondary },
  error: { ...type.bodySm, color: colors.danger },
});
