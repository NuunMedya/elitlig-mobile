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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";

import { AdminScreen, confirmAction, useAdminMutation } from "@/components/admin";
import { EvaluationForm } from "@/components/admin/evaluations/EvaluationForm";
import { SysStage, toneFg } from "@/components/admin/system/SysKit";
import { Avatar, EmptyState, ErrorState, IconTile, SkeletonCard, Touchable, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { deleteEvaluation, formatPct, formatTl, getWeekDetail, saveWeekEvaluation, scoreLevel, type SavePayload } from "@/lib/api/admin/evaluations";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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
  const canManage = hasAnyPermission(auth.user, ["evaluations.manage"]);
  const router = useRouter();

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
          <SysStage eyebrow="Sosyal medya · haftalık" title={query.data?.week.label ?? "Hafta"} icon="share-social" tone="signature">
            <Text style={styles.stageNote} {...textScale.long}>
              Haftalık paylaşım performansı. Her kişi bu hafta için bir kez değerlendirilir.{note}
            </Text>
          </SysStage>

          {/* Kişi seçici: değerlendirilen kişiler avatar karosu, sonda "yeni". */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people}>
            {evaluations.map((e) => {
              const on = selected === e.id;
              return (
                <Touchable key={e.id} feedback="card" haptic="selection" onPress={() => setSelected(e.id)} style={[styles.person, on ? styles.personOn : null]} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${e.staffName || e.staffId}, ${formatPct(e.scorePct)}`}>
                  <Avatar name={e.staffName || "?"} size={36} />
                  <Text style={styles.personName} numberOfLines={1} {...textScale.dense}>
                    {e.staffName || `#${e.staffId}`}
                  </Text>
                  <Text style={[styles.personScore, { color: toneFg(scoreLevel(e.scorePct).tone) }]} {...textScale.badge}>
                    {formatPct(e.scorePct)}
                  </Text>
                  <Text style={styles.personNet} {...textScale.badge}>
                    {formatTl(e.net, true)}
                  </Text>
                </Touchable>
              );
            })}
            {canSubmit && area.questions.length ? (
              <Touchable feedback="card" haptic="selection" onPress={() => setSelected(NEW)} style={[styles.person, styles.personNew, selected === NEW ? styles.personOn : null]} accessibilityRole="tab" accessibilityState={{ selected: selected === NEW }} accessibilityLabel="Yeni değerlendirme">
                <IconTile icon="add" tone="violet" size={36} glow={false} />
                <Text style={styles.personName} numberOfLines={1} {...textScale.dense}>
                  Yeni form
                </Text>
                <Text style={styles.personNet} {...textScale.badge}>
                  {freeStaff.length} kişi
                </Text>
              </Touchable>
            ) : null}
          </ScrollView>

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
              emptyAction={canManage ? { label: "Sorular ve Ücretler’e git", onPress: () => router.push({ pathname: "/yonetim/degerlendirmeler", params: { tab: "questions" } }) } : null}
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
  stageNote: { ...type.caption, color: colors.onDarkMuted },
  people: { gap: space.sm, paddingRight: space.lg },
  person: { width: 96, alignItems: "center", gap: 3, padding: space.sm, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  personNew: { borderStyle: "dashed" },
  personOn: { backgroundColor: colors.brandDim, borderColor: colors.brand },
  personName: { ...type.labelSm, color: colors.textPrimary },
  personScore: { ...type.scoreXs },
  personNet: { ...type.micro, color: colors.textTertiary },
});
