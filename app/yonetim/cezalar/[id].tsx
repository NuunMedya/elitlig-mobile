/**
 * CEZA DOSYASI — tek disiplin kaydının ayrıntısı ve yönetimi
 * (web /editor/cezalar/:publicId, PenaltyDetail.js).
 *
 * NE: özet (aşama, maç, ceza başlangıcı, zaman tavanı, savunma ve itiraz
 * süreleri), disiplin kararı metni, gelen savunma / itirazlar (kurul burada
 * da sonuçlandırabilir), sürecin tamamı ve "Kararı güncelle" formu (aşama,
 * süre, karar metni, süreç notu).
 *
 * İPTAL / SİLME: sunucuda ceza silme ucu yoktur (routes/penalties.js); dosya
 * aşama ve karar güncellemesiyle yönetilir — web'de de böyledir.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, InfoLine, Panel, RecordCard, useAdminMutation } from "@/components/admin";
import { durationBody, penaltyBadges, PenaltyDecisionFields, PenaltyTimeline, type DecisionValue } from "@/components/admin/penalties/PenaltyBits";
import { SubmissionReviewSheet } from "@/components/admin/penalties/SubmissionReviewSheet";
import { Avatar, Badge, BottomSheet, Button, ErrorState, Input, SegmentedControl, SkeletonCard, type Tone } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import {
  banSummary,
  collapseEvents,
  durationText,
  getPenalty,
  PENALTY_STATUS_LABELS,
  SIDE_LABELS,
  SUBMISSION_TYPE_LABELS,
  updatePenalty,
  type Penalty,
  type PenaltyEvent,
} from "@/lib/api/admin/penalties";
import { useAuth } from "@/providers/AuthProvider";
import { colors, radius, space, textScale, type } from "@/theme";

const REVIEW_TONE: Record<string, Tone> = { pending: "warn", accepted: "win", rejected: "danger", noted: "info" };

export default function PenaltyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const publicId = String(id ?? "");
  const auth = useAuth();
  const router = useRouter();
  const canUpdate = hasAnyPermission(auth.user, ["penalties.update"]);
  const canReview = hasAnyPermission(auth.user, ["penalties.review"]);

  const query = useQuery({
    queryKey: ["admin", "penalties", "detail", publicId],
    queryFn: () => getPenalty(publicId),
    enabled: Boolean(publicId),
  });
  const penalty = query.data;

  const [timelineMode, setTimelineMode] = useState<"ozet" | "tumu">("ozet");
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState<PenaltyEvent | null>(null);

  const events = useMemo(() => penalty?.events ?? [], [penalty?.events]);
  const submissions = useMemo(() => events.filter((e) => e.is_submission).reverse(), [events]);
  const timeline = timelineMode === "ozet" ? collapseEvents(events) : events;

  return (
    <AdminScreen
      title={penalty?.player_name || "Ceza dosyası"}
      subtitle={penalty ? [penalty.team_name || "Takım belirtilmedi", penalty.match_label].filter(Boolean).join(" · ") : undefined}
      permission={["penalties.view"]}
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
      actions={canUpdate && penalty ? [{ icon: "create-outline", onPress: () => setEditing(true), accessibilityLabel: "Kararı güncelle" }] : undefined}
    >
      {query.isLoading ? (
        <>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </>
      ) : query.error || !penalty ? (
        <ErrorState error={query.error ?? new Error("Ceza kaydı bulunamadı.")} onRetry={query.refetch} variant="inline" />
      ) : (
        <>
          <View style={styles.hero}>
            <Avatar name={penalty.player_name} image={penalty.player_img} size={56} />
            <View style={styles.heroText}>
              <Text style={styles.heroTitle} {...textScale.dense}>
                {penalty.player_name || "Oyuncu"}
              </Text>
              <Text style={styles.heroSub} {...textScale.dense}>
                {penalty.team_name || "Takım belirtilmedi"}
              </Text>
              <View style={styles.badges}>
                {penaltyBadges(penalty, false).map((b) => (
                  <Badge key={b.label} label={b.label} tone={b.tone} icon={b.icon} size="xs" />
                ))}
              </View>
            </View>
          </View>

          <Panel title="Ceza özeti">
            <InfoLine label="Durum" value={PENALTY_STATUS_LABELS[penalty.status] ?? penalty.status} />
            <InfoLine label="Ceza süresi" value={durationText(penalty)} />
            <InfoLine label="Maç" value={penalty.match_label || "—"} />
            <InfoLine label="Maç tarihi" value={penalty.match_date ? formatDate(penalty.match_date) : "—"} />
            <InfoLine label="Ceza başlangıcı" value={penalty.ban_start_at ? formatDate(penalty.ban_start_at) : "—"} />
            <InfoLine label="Zaman tavanı" value={penalty.ban_end_at ? formatDate(penalty.ban_end_at) : "—"} />
            {penalty.defense_deadline_at ? <InfoLine label="Savunma süresi" value={formatDateTime(penalty.defense_deadline_at)} /> : null}
            {penalty.objection_deadline_at ? <InfoLine label="İtiraz süresi" value={formatDateTime(penalty.objection_deadline_at)} /> : null}
            <Text style={styles.summary} {...textScale.long}>
              {banSummary(penalty)}
            </Text>
          </Panel>

          {penalty.disiplin_karari ? (
            <Panel title="Disiplin kararı">
              <Text style={styles.body} selectable {...textScale.long}>
                {penalty.disiplin_karari}
              </Text>
            </Panel>
          ) : null}

          <Panel
            title={`Savunma ve itirazlar${submissions.length ? ` (${submissions.length})` : ""}`}
            action={canReview ? { label: "Kutuyu aç", onPress: () => router.push("/yonetim/savunmalar" as Href) } : undefined}
          >
            {submissions.length ? (
              <View style={styles.list}>
                {submissions.map((s) => {
                  const status = s.review_status ?? "pending";
                  return (
                    <RecordCard
                      key={s.id}
                      title={`${SUBMISSION_TYPE_LABELS[s.event_type as "defense"] ?? "Başvuru"} · ${SIDE_LABELS[s.submitted_by_side ?? ""] ?? "Taraf"}`}
                      subtitle={s.description}
                      meta={formatDateTime(s.createdAt)}
                      icon={s.event_type === "objection" ? "git-pull-request-outline" : "document-text-outline"}
                      iconTone={status === "pending" ? "warn" : "neutral"}
                      badges={[{ label: s.review_status_label ?? "Değerlendirme bekliyor", tone: REVIEW_TONE[status] }]}
                      numberOfLines={4}
                      onPress={canReview && status === "pending" ? () => setReviewing(s) : undefined}
                    >
                      {s.review_note ? (
                        <Text style={styles.reviewNote} {...textScale.dense}>
                          Kurul notu: {s.review_note}
                        </Text>
                      ) : null}
                    </RecordCard>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.summary} {...textScale.dense}>
                Bu dosyaya savunma ya da itiraz gönderilmedi.
              </Text>
            )}
          </Panel>

          <Panel title="Sürecin tamamı">
            <SegmentedControl<"ozet" | "tumu">
              items={[
                { key: "ozet", label: "Aşamalar" },
                { key: "tumu", label: "Tüm kayıtlar" },
              ]}
              value={timelineMode}
              onChange={setTimelineMode}
              size="sm"
            />
            <View style={styles.timeline}>
              <PenaltyTimeline events={timeline} />
            </View>
          </Panel>

          <View style={styles.actions}>
            {penalty.player_id ? (
              <Button label="Oyuncu profili" icon="person-outline" variant="secondary" onPress={() => router.push(`/oyuncu/${penalty.player_id}` as Href)} style={styles.grow} />
            ) : null}
            {penalty.match_id ? (
              <Button label="Maçı aç" icon="football-outline" variant="secondary" onPress={() => router.push(`/mac/${penalty.match_id}` as Href)} style={styles.grow} />
            ) : null}
          </View>
          {canUpdate ? <Button label="Kararı güncelle" icon="create-outline" onPress={() => setEditing(true)} fullWidth /> : null}
        </>
      )}

      {penalty ? <UpdateSheet visible={editing} onClose={() => setEditing(false)} publicId={publicId} initial={penalty} /> : null}
      <SubmissionReviewSheet submission={reviewing} penalty={penalty} onClose={() => setReviewing(null)} />
    </AdminScreen>
  );
}

/* ═══════════════════════ KARAR GÜNCELLEME ═══════════════════════ */

function UpdateSheet({
  visible,
  onClose,
  publicId,
  initial,
}: {
  visible: boolean;
  onClose: () => void;
  publicId: string;
  initial: Penalty;
}) {
  const [decision, setDecision] = useState<DecisionValue>({ status: initial.status, duration_type: initial.duration_type ?? "", match_count: initial.match_count ? String(initial.match_count) : "" });
  const [karar, setKarar] = useState(initial.disiplin_karari ?? "");
  const [note, setNote] = useState("");

  React.useEffect(() => {
    if (!visible) return;
    setDecision({ status: initial.status, duration_type: initial.duration_type ?? "", match_count: initial.match_count ? String(initial.match_count) : "" });
    setKarar(initial.disiplin_karari ?? "");
    setNote("");
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAdminMutation(
    () =>
      updatePenalty(publicId, {
        status: decision.status,
        disiplin_karari: karar,
        note: note.trim() || undefined,
        ...(decision.status !== "sevk" ? durationBody(decision) : {}),
      }),
    { success: "Ceza kaydı güncellendi.", invalidate: [["admin", "penalties"]], onSuccess: onClose }
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={save.isPending ? () => undefined : onClose}
      title="Kararı güncelle"
      snap="full"
      footer={<Button label="Güncelle ve kaydet" onPress={() => save.mutate(undefined)} loading={save.isPending} haptic="success" fullWidth />}
    >
      <View style={styles.form}>
        <PenaltyDecisionFields value={decision} onChange={setDecision} />
        <Input label="Disiplin kararı" value={karar} onChangeText={setKarar} multiline numberOfLines={5} placeholder="Disiplin kararı / gerekçe metni" />
        <Input label="Süreç notu (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Bu güncellemeyle ilgili kısa not" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroText: { flex: 1, gap: 2 },
  heroTitle: { ...type.h2, color: colors.textPrimary },
  heroSub: { ...type.bodySm, color: colors.textSecondary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xs },
  summary: { ...type.bodySm, color: colors.textSecondary },
  body: { ...type.body, color: colors.textPrimary },
  list: { gap: space.sm },
  reviewNote: { ...type.caption, color: colors.textSecondary, marginTop: space.xs, padding: space.sm, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  timeline: { marginTop: space.md },
  actions: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  form: { gap: space.lg },
});
