/**
 * HAFTALIK SOSYAL MEDYA FORMU.
 *
 * Web: evaluations/WeeklyTab.js. Bir hafta içinde her kişi bir kez
 * değerlendirilir; aynı kişiyi yeniden kaydetmek kaydını günceller. Üstte
 * değerlendirilen kişiler çip olarak durur, "Yeni değerlendirme" henüz
 * değerlendirilmemiş kişilerle boş form açar. Türkiye geneli kullanıcı
 * il seçtiyse form o il adına kaydedilir.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { AdminScreen, confirmAction, useAdminMutation } from "@/components/admin";
import { EvaluationForm } from "@/components/admin/evaluations/EvaluationForm";
import { Chip, ChipGroup, EmptyState, ErrorState, SkeletonCard, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { deleteEvaluation, formatPct, formatTl, getWeekDetail, saveWeekEvaluation, type SavePayload } from "@/lib/api/admin/evaluations";
import { useAuth } from "@/providers/AuthProvider";
import { colors, textScale, type } from "@/theme";

const PERMS = ["evaluations.view", "evaluations.submit", "evaluations.manage"] as const;
const NEW = -1;

export default function WeekEvaluationScreen() {
  const params = useLocalSearchParams<{ week: string; cityId?: string; cityName?: string; nationwide?: string }>();
  const week = String(params.week);
  const cityId = params.cityId || "";
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canSubmit = hasAnyPermission(auth.user, ["evaluations.submit"]);

  const key = ["admin", "evaluations", "week", week, cityId];
  const query = useQuery({ queryKey: key, queryFn: () => getWeekDetail(week, cityId) });
  const [selected, setSelected] = useState<number>(NEW);

  const area = query.data?.areas?.[0];
  const evaluations = useMemo(() => area?.evaluations ?? [], [area]);
  const current = selected === NEW ? null : evaluations.find((e) => e.id === selected) ?? null;
  // Bu hafta değerlendirilmiş kişiler yeni formda tekrar önerilmez.
  const freeStaff = useMemo(() => {
    const done = new Set(evaluations.map((e) => e.staffId));
    return (query.data?.staff ?? []).filter((p) => !done.has(p.id));
  }, [evaluations, query.data]);

  const refresh = async () => {
    await query.refetch();
    void queryClient.invalidateQueries({ queryKey: ["admin", "evaluations", "weeks"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "evaluations", "analysis"] });
  };

  const save = async (payload: SavePayload) => {
    if (!area) return;
    const res = await saveWeekEvaluation(week, area.key, cityId ? { ...payload, cityId: Number(cityId) } : payload);
    toast.show({ message: `${res.item.staffName || "Personel"} değerlendirmesi kaydedildi.`, tone: "success" });
    await refresh();
    setSelected(res.item.id);
  };

  const remove = useAdminMutation((id: number) => deleteEvaluation(id), { success: "Değerlendirme silindi." });

  const note = params.nationwide
    ? params.cityName
      ? ` Formlar ${params.cityName} adına kaydedilir.`
      : " İl seçilmezse form personelin iline yazılır."
    : "";

  return (
    <AdminScreen
      title={query.data?.week.label ?? "Sosyal medya · haftalık"}
      subtitle="Sosyal medya · haftalık"
      permission={PERMS}
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
    >
      {query.isLoading ? (
        <SkeletonCard />
      ) : query.error || !area ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="inline" />
      ) : (
        <>
          <Text style={styles.meta} {...textScale.long}>
            Haftalık paylaşım performansı. Her kişi bu hafta için bir kez değerlendirilir.{note}
          </Text>
          <ChipGroup scrollable contentPadding={0}>
            {evaluations.map((e) => (
              <Chip
                key={e.id}
                size="sm"
                label={`${e.staffName || `#${e.staffId}`} · ${formatPct(e.scorePct)} · ${formatTl(e.net, true)}`}
                selected={selected === e.id}
                onPress={() => setSelected(e.id)}
              />
            ))}
            {canSubmit && area.questions.length ? (
              <Chip size="sm" icon="add" label={`Yeni değerlendirme (${freeStaff.length} kişi)`} selected={selected === NEW} onPress={() => setSelected(NEW)} />
            ) : null}
          </ChipGroup>

          {current ? (
            <EvaluationForm
              key={`e-${current.id}`}
              questions={area.questions}
              staff={query.data?.staff ?? []}
              evaluation={current}
              setting={area.setting}
              lockStaff
              canSubmit={canSubmit}
              onSave={save}
              onDelete={async () => {
                if (!(await confirmAction({ title: `${current.staffName || "Bu"} değerlendirmesi silinsin mi?`, confirmLabel: "Sil", destructive: true }))) return;
                await remove.mutateAsync(current.id);
                setSelected(NEW);
                await refresh();
              }}
            />
          ) : canSubmit || !area.questions.length ? (
            <EvaluationForm
              key={`new-${week}-${evaluations.length}`}
              questions={area.questions}
              staff={freeStaff}
              setting={area.setting}
              canSubmit={canSubmit}
              onSave={save}
              emptyHint="Sosyal medya için henüz soru tanımlanmadı."
            />
          ) : (
            <EmptyState icon="share-social-outline" title="Bu hafta değerlendirme yok" variant="inline" />
          )}
        </>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  meta: { ...type.caption, color: colors.textSecondary },
});
