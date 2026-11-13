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
import Ionicons from "@expo/vector-icons/Ionicons";
import { AreaPicker } from "@/components/admin/evaluations/EvalParts";
import { SysStage } from "@/components/admin/system/SysKit";
import { Avatar, Badge, EmptyState, ErrorState, ProgressRing, SkeletonCard, useToast } from "@/components/ui";
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
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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
          {/* Maç sahnesi: iki takım, tarih/saha hapları, alan ilerleme halkası. */}
          <SysStage>
            <View style={styles.stageTop}>
              <View style={styles.flex}>
                <Text style={styles.eyebrow} {...textScale.badge}>
                  {[formatDay(m.day), m.time].filter(Boolean).join(" · ").toLocaleUpperCase("tr-TR")}
                </Text>
                <Text style={styles.team} numberOfLines={1} {...textScale.dense}>
                  {m.homeTeam || "?"}
                </Text>
                <Text style={styles.vs} {...textScale.badge}>
                  VS
                </Text>
                <Text style={styles.team} numberOfLines={1} {...textScale.dense}>
                  {m.awayTeam || "?"}
                </Text>
              </View>
              <View style={styles.ring}>
                <ProgressRing value={detail.areas.length ? doneAreas / detail.areas.length : 0} size={78} thickness={7} tone={doneAreas === detail.areas.length ? "win" : "accent"} label={`${doneAreas}/${detail.areas.length}`} sublabel="alan" />
              </View>
            </View>
            <View style={styles.pills}>
              {[
                { icon: "location" as const, text: m.field },
                { icon: "trophy" as const, text: [m.league, m.season].filter(Boolean).join(" · ") },
                { icon: "business" as const, text: m.city },
              ]
                .filter((p) => p.text)
                .map((p) => (
                  <View key={p.icon} style={styles.pill}>
                    <Ionicons name={p.icon} size={11} color={colors.onDarkMuted} />
                    <Text style={styles.pillText} numberOfLines={1} {...textScale.badge}>
                      {p.text}
                    </Text>
                  </View>
                ))}
            </View>
          </SysStage>

          <AreaPicker
            value={activeArea}
            onChange={setActiveArea}
            items={detail.areas.map((a) => {
              const done = a.evaluation;
              return {
                key: a.key,
                label: a.label,
                status: done ? formatPct(done.scorePct) : a.questions.length ? "Bekliyor" : "Soru yok",
                tone: done ? (done.failCount ? "danger" : "win") : a.questions.length ? "warn" : "neutral",
              };
            })}
          />
          {area ? (
            <View style={styles.form}>
              <View style={styles.who}>
                <Avatar name={area.evaluation?.staffName || area.assignedStaffName || "?"} size={36} />
                <View style={styles.flex}>
                  <Text style={styles.whoLabel} {...textScale.badge}>
                    {area.label.toLocaleUpperCase("tr-TR")} · DEĞERLENDİRİLEN
                  </Text>
                  <Text style={styles.whoName} numberOfLines={1} {...textScale.dense}>
                    {area.evaluation?.staffName || area.assignedStaffName || (area.duty ? "Görevli yok" : "Personel seçilecek")}
                  </Text>
                </View>
                {area.evaluation ? <Badge label={formatPct(area.evaluation.scorePct)} tone={area.evaluation.failCount ? "warn" : "win"} size="sm" /> : <Badge label="Yeni form" tone="neutral" size="sm" />}
              </View>
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
                emptyAction={canManage ? { label: "Sorular ve Ücretler’e git", onPress: () => router.push({ pathname: "/yonetim/degerlendirmeler", params: { tab: "questions" } }) } : null}
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
  flex: { flex: 1, minWidth: 0 },
  stageTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  eyebrow: { ...type.overline, color: colors.adminAccent, marginBottom: space.xs },
  team: { ...type.h2, color: colors.onDark },
  vs: { ...type.micro, color: colors.onDarkMuted, marginVertical: 2 },
  ring: { padding: space.xs, borderRadius: radius.pill, backgroundColor: colors.inkPill },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%", paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.inkPill, borderWidth: hairline, borderColor: colors.inkPillBorder },
  pillText: { ...type.labelXs, color: colors.onDark, flexShrink: 1 },
  form: { gap: space.md },
  who: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  whoLabel: { ...type.micro, color: colors.textTertiary },
  whoName: { ...type.h4, color: colors.textPrimary },
});
