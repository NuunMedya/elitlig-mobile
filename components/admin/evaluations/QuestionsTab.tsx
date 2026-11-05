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

import { ActionSheet, InfoLine, Panel, RecordCard, confirmAction, useAdminMutation } from "@/components/admin";
import { Badge, Button, Chip, ChipGroup, EmptyState, ErrorState, SkeletonListRow, Touchable } from "@/components/ui";
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
import { colors, space, textScale, type } from "@/theme";

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
      <ChipGroup scrollable contentPadding={0}>
        {areas.map((a) => (
          <Chip key={a.key} size="sm" label={a.label} count={countOf(a.key)} selected={area === a.key} onPress={() => setArea(a.key)} />
        ))}
      </ChipGroup>
      <Text style={styles.muted} {...textScale.long}>
        {areaInfo?.label} formu · {areaInfo?.period === "week" ? "her hafta" : "her maç"} doldurulur · {active.length} soru · toplam ağırlık {totalWeight}
      </Text>

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
          <RecordCard
            key={q.id}
            title={`${i + 1}. ${q.text}`}
            subtitle={amountSummary(q) || "Tutar yok"}
            badges={[
              { label: q.answerType === "yes_no" ? "Yapıldı / Yapılmadı" : "1-10 Puan", tone: "brand" },
              q.category ? { label: q.category } : null,
              q.weight > 1 ? { label: `Ağırlık ×${q.weight}`, tone: "info" } : null,
              q.allowNa ? { label: "Uygulanamaz seçeneği" } : null,
            ]}
            onPress={() => setEditing(q)}
            onLongPress={() => setMenu(q)}
            trailing={
              <View style={styles.order}>
                <Touchable onPress={() => move(i, -1)} disabled={i === 0 || reorder.isPending} accessibilityLabel="Yukarı taşı" accessibilityRole="button" hitSlop={8}>
                  <Ionicons name="chevron-up" size={20} color={i === 0 ? colors.textDisabled : colors.textSecondary} />
                </Touchable>
                <Touchable onPress={() => move(i, 1)} disabled={i === active.length - 1 || reorder.isPending} accessibilityLabel="Aşağı taşı" accessibilityRole="button" hitSlop={8}>
                  <Ionicons name="chevron-down" size={20} color={i === active.length - 1 ? colors.textDisabled : colors.textSecondary} />
                </Touchable>
              </View>
            }
          />
        ))
      )}
      {active.length ? (
        <Text style={styles.muted} {...textScale.dense}>
          Soruya dokun: düzenle · basılı tut: kaldır
        </Text>
      ) : null}

      {archived.length ? (
        <Panel title={`Arşivlenen sorular (${archived.length})`}>
          {archived.map((q) => (
            <View key={q.id} style={styles.archived}>
              <Text style={styles.archivedText} {...textScale.long}>
                {q.text}
              </Text>
              <Button label="Forma geri al" size="sm" variant="ghost" onPress={() => restore.mutate(q)} />
            </View>
          ))}
        </Panel>
      ) : null}

      <Panel title="Ücret ve hakediş" action={{ label: "Düzenle", onPress: () => setSettingOpen(true) }}>
        <InfoLine label="Taban ücret" value={setting?.baseFee ? formatTl(setting.baseFee) : "Tanımlı değil"} />
        {(setting?.scoreRules ?? []).length ? (
          <View style={styles.rules}>
            {(setting?.scoreRules ?? []).map((r) => (
              <Badge key={`${r.min}-${r.max}`} label={`%${r.min}-${r.max}: ${formatTl(r.amount, true)}`} tone={r.amount >= 0 ? "win" : "danger"} size="xs" />
            ))}
          </View>
        ) : (
          <Text style={styles.muted} {...textScale.dense}>
            Skor eşiği tanımlı değil.
          </Text>
        )}
      </Panel>

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
  muted: { ...type.caption, color: colors.textTertiary },
  order: { gap: space.xs, alignItems: "center" },
  archived: { flexDirection: "row", alignItems: "center", gap: space.sm },
  archivedText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  rules: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
