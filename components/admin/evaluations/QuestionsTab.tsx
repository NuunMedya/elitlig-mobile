/**
 * Sorular ve Ücretler sekmesi (evaluations.manage).
 *
 * Web: evaluations/QuestionsTab.js. Alan çipleri (hakem, spiker, ...), seçili
 * alanın soruları: yukarı / aşağı taşı (sürükle-bırak yerine), düzenle,
 * kaldır. Cevaplanmış soru silinmez, arşivlenir; arşivden forma geri alınır.
 * Boş alana "Örnek soruları ekle". Altta taban ücret ve skor eşikleri.
 */

import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, confirmAction, useAdminMutation } from "@/components/admin";
import { SysGroup, SysRow } from "@/components/admin/system/SysKit";
import { Badge, Button, EmptyState, ErrorState, GradientBar, IconTile, Reveal, SkeletonListRow, Touchable } from "@/components/ui";
import {
  amountSummary,
  createQuestion,
  deleteQuestion,
  formatTl,
  getAreaSettings,
  getEvalMeta,
  listCategories,
  listQuestions,
  reorderQuestions,
  saveAreaSetting,
  seedStarterQuestions,
  updateQuestion,
  type EvalArea,
  type EvalQuestion,
} from "@/lib/api/admin/evaluations";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { AreaPicker, areaIcon, areaTone } from "./EvalParts";

import { QuestionSheet, SettingSheet } from "./QuestionSheets";

const KEY = ["admin", "evaluations", "questions"] as const;

export function QuestionsTab({ areas }: { areas: EvalArea[] }) {
  const [area, setArea] = useState(areas[0]?.key ?? "hakem");
  const [editing, setEditing] = useState<EvalQuestion | null | "new">(null);
  const [menu, setMenu] = useState<EvalQuestion | null>(null);
  const [settingOpen, setSettingOpen] = useState(false);

  const questions = useQuery({ queryKey: [...KEY, "list"], queryFn: () => listQuestions(true) });
  const settings = useQuery({ queryKey: ["admin", "evaluations", "settings"], queryFn: getAreaSettings });
  const categories = useQuery({ queryKey: ["admin", "evaluations", "categories"], queryFn: listCategories });
  const meta = useQuery({ queryKey: ["admin", "evaluations", "meta"], queryFn: getEvalMeta, staleTime: 300_000 });

  const all = questions.data ?? [];
  const items = all.filter((q) => q.area === area);
  const active = items.filter((q) => q.status === "active");
  const archived = items.filter((q) => q.status !== "active");
  const areaInfo = areas.find((a) => a.key === area);
  const totalWeight = active.reduce((s, q) => s + (q.weight || 1), 0);
  const categoryOptions = useMemo(
    () => [...new Set([...(meta.data?.suggestedCategories ?? []), ...(categories.data ?? [])])],
    [meta.data, categories.data]
  );
  const setting = settings.data?.[area];

  const invalidate = [[...KEY], ["admin", "evaluations", "categories"]];
  const save = useAdminMutation(
    (body: Parameters<typeof createQuestion>[0]) => (editing && editing !== "new" ? updateQuestion(editing.id, body) : createQuestion(body)),
    { success: (r) => r.message, invalidate }
  );
  const remove = useAdminMutation((q: EvalQuestion) => deleteQuestion(q.id), { success: (r) => r.message, invalidate });
  const restore = useAdminMutation((q: EvalQuestion) => updateQuestion(q.id, { status: "active" }), { success: "Soru yeniden forma alındı.", invalidate });
  const reorder = useAdminMutation((ids: number[]) => reorderQuestions(area, ids), { invalidate });
  const seed = useAdminMutation(() => seedStarterQuestions(area), { success: (r) => r.message, invalidate });
  const saveSetting = useAdminMutation((body: Parameters<typeof saveAreaSetting>[1]) => saveAreaSetting(area, body), {
    success: (r) => r.message,
    invalidate: [["admin", "evaluations", "settings"]],
  });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= active.length) return;
    const ids = active.map((q) => q.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate([...ids, ...archived.map((q) => q.id)]);
  };

  const countOf = (key: string) => all.filter((q) => q.area === key && q.status === "active").length;

  return (
    <View style={styles.wrap}>
      <AreaPicker
        value={area}
        onChange={setArea}
        items={areas.map((a) => {
          const n = countOf(a.key);
          return { key: a.key, label: a.label, status: n ? `${n} soru` : "Soru yok", tone: n ? "win" : "warn" };
        })}
      />

      {/* Alan özeti: dönem, soru sayısı, ağırlık ve taban ücret tek kartta. */}
      <View style={styles.areaCard}>
        <IconTile icon={areaIcon(area)} tone={areaTone(area)} size={44} />
        <View style={styles.flex}>
          <Text style={styles.areaTitle} {...textScale.dense}>
            {areaInfo?.label} formu
          </Text>
          <Text style={styles.muted} {...textScale.dense}>
            {areaInfo?.period === "week" ? "Her hafta" : "Her maç"} doldurulur
          </Text>
        </View>
        <View style={styles.areaStats}>
          <View style={styles.areaStat}>
            <Text style={styles.areaStatValue} {...textScale.badge}>
              {active.length}
            </Text>
            <Text style={styles.areaStatLabel} {...textScale.badge}>
              SORU
            </Text>
          </View>
          <View style={styles.areaStat}>
            <Text style={styles.areaStatValue} {...textScale.badge}>
              {totalWeight}
            </Text>
            <Text style={styles.areaStatLabel} {...textScale.badge}>
              AĞIRLIK
            </Text>
          </View>
        </View>
      </View>

      <Button label="Yeni soru" icon="add" onPress={() => setEditing("new")} />

      {questions.isLoading ? (
        <SkeletonListRow count={4} />
      ) : questions.error ? (
        <ErrorState error={questions.error} onRetry={questions.refetch} variant="inline" />
      ) : !active.length ? (
        <EmptyState
          icon="list-outline"
          title="Bu alanda henüz soru yok"
          body={archived.length ? "Yeni soru ekle." : "Yeni soru ekle ya da örnek setle başla."}
          action={!archived.length ? { label: "Örnek soruları ekle", onPress: () => seed.mutate(undefined) } : undefined}
          variant="inline"
        />
      ) : (
        active.map((q, i) => (
          <Reveal key={q.id} index={i}>
            <Touchable
              feedback="card"
              onPress={() => setEditing(q)}
              onLongPress={() => setMenu(q)}
              style={styles.q}
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}. ${q.text}`}
              accessibilityHint="Düzenlemek için dokun, kaldırmak için basılı tut"
            >
              <View style={styles.qNo}>
                <Text style={styles.qNoText} {...textScale.badge}>
                  {i + 1}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.qText} {...textScale.long}>
                  {q.text}
                </Text>
                <View style={styles.qTags}>
                  <Badge label={q.answerType === "yes_no" ? "Yapıldı / Yapılmadı" : "1-10 puan"} icon={q.answerType === "yes_no" ? "checkbox-outline" : "star-outline"} tone="brand" size="xs" />
                  {q.category ? <Badge label={q.category} size="xs" /> : null}
                  {q.allowNa ? <Badge label="Uygulanamaz" size="xs" /> : null}
                </View>
                <View style={styles.qWeight}>
                  <Text style={styles.qWeightLabel} {...textScale.badge}>
                    ×{q.weight || 1}
                  </Text>
                  <GradientBar value={totalWeight ? (q.weight || 1) / totalWeight : 0} height={4} style={styles.flex} />
                  <Text style={styles.qMoney} numberOfLines={1} {...textScale.dense}>
                    {amountSummary(q) || "Tutar yok"}
                  </Text>
                </View>
              </View>
              <View style={styles.order}>
                <Touchable onPress={() => move(i, -1)} disabled={i === 0 || reorder.isPending} accessibilityLabel="Yukarı taşı" accessibilityRole="button" hitSlop={8} style={styles.orderBtn}>
                  <Ionicons name="chevron-up" size={16} color={i === 0 ? colors.textDisabled : colors.textSecondary} />
                </Touchable>
                <Touchable onPress={() => move(i, 1)} disabled={i === active.length - 1 || reorder.isPending} accessibilityLabel="Aşağı taşı" accessibilityRole="button" hitSlop={8} style={styles.orderBtn}>
                  <Ionicons name="chevron-down" size={16} color={i === active.length - 1 ? colors.textDisabled : colors.textSecondary} />
                </Touchable>
              </View>
            </Touchable>
          </Reveal>
        ))
      )}
      {active.length ? (
        <Text style={styles.muted} {...textScale.dense}>
          Soruya dokun: düzenle · basılı tut: kaldır
        </Text>
      ) : null}

      {archived.length ? (
        <SysGroup title={`Arşivlenen sorular (${archived.length})`} icon="archive" tone="neutral" flush>
          {archived.map((q, i) => (
            <SysRow key={q.id} first={i === 0} icon="archive-outline" tone="neutral" title={q.text} muted trailing={<Button label="Geri al" size="sm" variant="ghost" icon="arrow-undo-outline" onPress={() => restore.mutate(q)} />} />
          ))}
        </SysGroup>
      ) : null}

      <SysGroup title="Ücret ve hakediş" icon="cash" tone="mint" action={{ label: "Düzenle", onPress: () => setSettingOpen(true) }}>
        <View style={styles.fee}>
          <Text style={styles.feeLabel} {...textScale.dense}>
            Taban ücret
          </Text>
          <Text style={styles.feeValue} {...textScale.badge}>
            {setting?.baseFee ? formatTl(setting.baseFee) : "—"}
          </Text>
        </View>
        {(setting?.scoreRules ?? []).length ? (
          <View style={styles.rules}>
            {(setting?.scoreRules ?? []).map((r) => (
              <View key={`${r.min}-${r.max}`} style={[styles.rule, { backgroundColor: r.amount >= 0 ? colors.winDim : colors.dangerDim }]}>
                <Text style={styles.ruleRange} {...textScale.badge}>
                  %{r.min}–{r.max}
                </Text>
                <Text style={[styles.ruleAmount, { color: r.amount >= 0 ? colors.win : colors.danger }]} {...textScale.badge}>
                  {formatTl(r.amount, true)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted} {...textScale.dense}>
            Skor eşiği tanımlı değil.
          </Text>
        )}
      </SysGroup>

      <QuestionSheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        area={area}
        areaLabel={areaInfo?.label ?? ""}
        question={editing && editing !== "new" ? editing : null}
        categories={categoryOptions}
        onSubmit={(body) => save.mutateAsync(body)}
      />
      <SettingSheet
        visible={settingOpen}
        onClose={() => setSettingOpen(false)}
        areaLabel={areaInfo?.label ?? ""}
        setting={setting}
        onSubmit={(body) => saveSetting.mutateAsync(body)}
      />
      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.text}
        actions={[
          { label: "Düzenle", icon: "create-outline", onPress: () => menu && setEditing(menu) },
          {
            label: "Kaldır",
            icon: "trash-outline",
            danger: true,
            hint: "Cevaplanmışsa arşivlenir; geçmiş formlar korunur.",
            onPress: async () => {
              const q = menu;
              if (!q) return;
              if (await confirmAction({ title: "Soru kaldırılsın mı?", message: `“${q.text}”`, confirmLabel: "Kaldır", destructive: true })) remove.mutate(q);
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  muted: { ...type.caption, color: colors.textTertiary },
  areaCard: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  areaTitle: { ...type.h3, color: colors.textPrimary },
  areaStats: { flexDirection: "row", gap: space.sm },
  areaStat: { alignItems: "center", minWidth: 44, paddingVertical: space.xs, paddingHorizontal: space.xs, borderRadius: radius.md, backgroundColor: colors.surface2 },
  areaStatValue: { ...type.scoreSm, color: colors.textPrimary },
  areaStatLabel: { ...type.nano, color: colors.textTertiary },
  q: { flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  qNo: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  qNoText: { ...type.numSmStrong, color: colors.brandAccent },
  qText: { ...type.label, color: colors.textPrimary },
  qTags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  qWeight: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 2 },
  qWeightLabel: { ...type.numSmStrong, color: colors.textSecondary, minWidth: 22 },
  qMoney: { ...type.caption, color: colors.textSecondary, maxWidth: "55%" },
  order: { gap: space.xs, alignItems: "center", borderRadius: radius.pill, backgroundColor: colors.surface2, padding: 2 },
  orderBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  fee: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  feeLabel: { ...type.bodySm, color: colors.textSecondary },
  feeValue: { ...type.scoreMd, color: colors.textPrimary },
  rules: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  rule: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.md, alignItems: "center" },
  ruleRange: { ...type.micro, color: colors.textSecondary },
  ruleAmount: { ...type.numSmStrong },
});
