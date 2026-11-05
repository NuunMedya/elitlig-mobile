/**
 * MAÇ FORMU — bir maçın alan alan değerlendirmesi.
 *
 * Web: evaluations/MatchFormsTab.js sağ paneli. Üstte maç bilgisi, altında
 * alan çipleri (hakem, spiker, reji, fotoğrafçı, sağlıkçı, call center);
 * ilk eksik alan açılır. "Kaydet ve sonraki" bir sonraki eksik alana, alanlar
 * bitince listedeki sıradaki eksik maça geçer (liste sırası `ids` ile gelir).
 * Önceki / sonraki maç düğmeleri başlıktadır.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, confirmAction, useAdminMutation } from "@/components/admin";
import { EvaluationForm } from "@/components/admin/evaluations/EvaluationForm";
import { Chip, ChipGroup, EmptyState, ErrorState, SkeletonCard, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import {
  deleteEvaluation,
  formatDay,
  formatPct,
  getMatchDetail,
  saveMatchEvaluation,
  type Evaluation,
  type MatchDetail,
  type SavePayload,
} from "@/lib/api/admin/evaluations";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["evaluations.view", "evaluations.submit", "evaluations.manage"] as const;

export default function MatchEvaluationScreen() {
  const params = useLocalSearchParams<{ id: string; ids?: string }>();
  const matchId = Number(params.id);
  const order = useMemo(() => String(params.ids || "").split(",").map(Number).filter(Boolean), [params.ids]);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const canSubmit = hasAnyPermission(auth.user, ["evaluations.submit"]);
  const canManage = hasAnyPermission(auth.user, ["evaluations.manage"]);

  const key = ["admin", "evaluations", "match", matchId];
  const query = useQuery({ queryKey: key, queryFn: () => getMatchDetail(matchId), enabled: Number.isFinite(matchId) });
  const detail = query.data;
  const [activeArea, setActiveArea] = useState<string | null>(null);

  useEffect(() => {
    if (!detail || activeArea) return;
    const first = detail.areas.find((a) => !a.evaluation && a.questions.length) || detail.areas[0];
    setActiveArea(first?.key ?? null);
  }, [detail, activeArea]);

  // Kayıt sonrası yalnız o alan güncellenir; listeler arka planda tazelenir.
  const applySaved = (areaKey: string, evaluation: Evaluation | null) => {
    queryClient.setQueryData<MatchDetail>(key, (prev) =>
      prev ? { ...prev, areas: prev.areas.map((a) => (a.key === areaKey ? { ...a, evaluation } : a)) } : prev
    );
    void queryClient.invalidateQueries({ queryKey: ["admin", "evaluations", "matches"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "evaluations", "analysis"] });
  };

  const remove = useAdminMutation((ev: Evaluation) => deleteEvaluation(ev.id), { success: "Değerlendirme silindi." });

  const index = order.indexOf(matchId);
  const goMatch = (id: number | undefined) => {
    if (!id) return;
    router.replace({ pathname: "/yonetim/degerlendirmeler/mac/[id]", params: { id: String(id), ids: params.ids ?? "" } });
  };

  const save = async (areaKey: string, payload: SavePayload) => {
    const res = await saveMatchEvaluation(matchId, areaKey, payload);
    applySaved(areaKey, res.item);
    toast.show({ message: `${detail?.areas.find((a) => a.key === areaKey)?.label || "Alan"} değerlendirmesi kaydedildi.`, tone: "success" });
    return res.item;
  };

  const saveNext = async (areaKey: string, payload: SavePayload) => {
    await save(areaKey, payload);
    const areas = detail?.areas ?? [];
    const start = areas.findIndex((a) => a.key === areaKey);
    const next = [...areas.slice(start + 1), ...areas.slice(0, start)].find((a) => !a.evaluation && a.questions.length && a.key !== areaKey);
    if (next) return setActiveArea(next.key);
    const nextMatch = index >= 0 ? order[index + 1] : undefined;
    if (nextMatch) goMatch(nextMatch);
    else toast.show({ message: "Bu maçın tüm alanları değerlendirildi.", tone: "success" });
  };

  const area = detail?.areas.find((a) => a.key === activeArea);
  const doneAreas = detail ? detail.areas.filter((a) => a.evaluation).length : 0;
  const m = detail?.match;

  return (
    <AdminScreen
      title={m ? `${m.homeTeam || "?"} – ${m.awayTeam || "?"}` : "Maç formu"}
      subtitle={m ? [formatDay(m.day), m.time].filter(Boolean).join(" · ") : undefined}
      permission={PERMS}
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
      actions={
        order.length > 1
          ? [
              ...(index > 0 ? [{ icon: "chevron-up" as const, onPress: () => goMatch(order[index - 1]), accessibilityLabel: "Önceki maç" }] : []),
              ...(index >= 0 && index < order.length - 1 ? [{ icon: "chevron-down" as const, onPress: () => goMatch(order[index + 1]), accessibilityLabel: "Sonraki maç" }] : []),
            ]
          : undefined
      }
    >
      {query.isLoading ? (
        <SkeletonCard />
      ) : query.error || !detail || !m ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="inline" />
      ) : (
        <>
          <Text style={styles.meta} {...textScale.long}>
            {[m.city, m.league, m.season, m.field].filter(Boolean).join(" · ")} · {doneAreas}/{detail.areas.length} alan tamam
          </Text>
          <ChipGroup scrollable contentPadding={0}>
            {detail.areas.map((a) => {
              const done = a.evaluation;
              return (
                <Chip
                  key={a.key}
                  size="sm"
                  icon={done ? "checkmark" : undefined}
                  tone={done ? "win" : undefined}
                  label={`${a.label}${done ? ` · ${formatPct(done.scorePct)}` : a.questions.length ? "" : " · soru yok"}`}
                  selected={a.key === activeArea}
                  onPress={() => setActiveArea(a.key)}
                />
              );
            })}
          </ChipGroup>
          {area ? (
            <View style={styles.form}>
              <Text style={styles.who} {...textScale.dense}>
                {area.evaluation?.staffName || area.assignedStaffName || (area.duty ? "Görevli yok" : "Personel seçilecek")}
              </Text>
              <EvaluationForm
                key={`${m.id}-${area.key}`}
                questions={area.questions}
                staff={detail.staff}
                defaultStaffId={area.assignedStaffId}
                evaluation={area.evaluation}
                setting={area.setting}
                canSubmit={canSubmit}
                onSave={(p) => save(area.key, p)}
                onSaveNext={(p) => saveNext(area.key, p)}
                onDelete={
                  area.evaluation
                    ? async () => {
                        const ev = area.evaluation;
                        if (!ev) return;
                        if (!(await confirmAction({ title: "Bu değerlendirme silinsin mi?", confirmLabel: "Sil", destructive: true }))) return;
                        await remove.mutateAsync(ev);
                        applySaved(area.key, null);
                      }
                    : undefined
                }
                emptyAction={canManage ? { label: "Sorular ve Ücretler’e git", onPress: () => router.back() } : null}
              />
            </View>
          ) : (
            <EmptyState icon="clipboard-outline" title="Alan seç" variant="inline" />
          )}
        </>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  meta: { ...type.caption, color: colors.textSecondary },
  form: { gap: space.sm },
  who: { ...type.overline, color: colors.textTertiary },
});
