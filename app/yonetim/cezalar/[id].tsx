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

import Ionicons from "@expo/vector-icons/Ionicons";

import { AdminScreen, useAdminMutation } from "@/components/admin";
import { durationBody, PenaltyDecisionFields, PenaltyTimeline, STATUS_ICON, type DecisionValue } from "@/components/admin/penalties/PenaltyBits";
import { FactRow, GroupCard, IdentityStage, ListLine, StagePill } from "@/components/admin/team/ManageKit";
import { SubmissionReviewSheet } from "@/components/admin/penalties/SubmissionReviewSheet";
import { Avatar, BottomSheet, Button, ErrorState, IconTile, Input, Reveal, SegmentedControl, SkeletonCard, SkeletonHero, type Tone } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import {
  banSummary,
  collapseEvents,
  durationText,
  getPenalty,
  PENALTY_STATUS_LABELS,
  PENALTY_STATUS_ORDER,
  PENALTY_STATUS_SHORT,
  SIDE_LABELS,
  SUBMISSION_TYPE_LABELS,
  updatePenalty,
  type Penalty,
  type PenaltyEvent,
} from "@/lib/api/admin/penalties";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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
          <SkeletonHero />
          <SkeletonCard lines={4} />
        </>
      ) : query.error || !penalty ? (
        <ErrorState error={query.error ?? new Error("Ceza kaydı bulunamadı.")} onRetry={query.refetch} variant="inline" />
      ) : (
        <>
          {/* KİMLİK SAHNESİ — oyuncu, aşama, ceza ilerlemesi. */}
          <Reveal scaleFrom={0.97}>
            <IdentityStage
              leading={
                <View style={[styles.ring, { borderColor: penalty.ban_state?.active ? colors.danger : colors.inkTileBorder }]}>
                  <Avatar name={penalty.player_name} image={penalty.player_img} size={64} />
                </View>
              }
              overline={PENALTY_STATUS_SHORT[penalty.status] ?? penalty.status}
              title={penalty.player_name || "Oyuncu"}
              subtitle={[penalty.team_name || "Takım belirtilmedi", penalty.match_label].filter(Boolean).join(" · ")}
              pills={
                <>
                  {penalty.ban_state?.active != null ? (
                    <StagePill label={penalty.ban_state.active ? "Cezalı" : "Ceza sona erdi"} tone={penalty.ban_state.active ? "danger" : "win"} icon={penalty.ban_state.active ? "alert-circle" : "checkmark-circle"} />
                  ) : null}
                  <StagePill label={durationText(penalty)} icon={penalty.duration_type === "suresiz" ? "ban" : "football"} />
                  {penalty.submission_summary?.pending ? <StagePill label={`${penalty.submission_summary.pending} başvuru`} icon="document-attach" tone="gold" /> : null}
                </>
              }
              stats={
                penalty.ban_state?.duration_type === "mac"
                  ? [
                      { label: "Ceza", value: penalty.ban_state.matches_required ?? penalty.match_count ?? 0 },
                      { label: "Oynandı", value: penalty.ban_state.matches_played ?? 0 },
                      { label: "Kalan", value: penalty.ban_state.matches_remaining ?? 0, tone: (penalty.ban_state.matches_remaining ?? 0) > 0 ? "danger" : "win" },
                    ]
                  : [
                      { label: "Başlangıç", value: penalty.ban_start_at ? formatDate(penalty.ban_start_at, false) : "—" },
                      { label: "Tavan", value: penalty.ban_end_at ? formatDate(penalty.ban_end_at, false) : "—" },
                      { label: "Başvuru", value: submissions.length },
                    ]
              }
            />
          </Reveal>

          {/* AŞAMA ÇİZGİSİ — dört disiplin aşaması, şu anki vurgulu. */}
          <View style={styles.steps} accessible accessibilityLabel={`Aşama: ${PENALTY_STATUS_LABELS[penalty.status]}`}>
            {PENALTY_STATUS_ORDER.map((st, i) => {
              const at = PENALTY_STATUS_ORDER.indexOf(penalty.status);
              const done = i < at;
              const now = i === at;
              return (
                <View key={st} style={styles.step}>
                  <View style={styles.stepTrack}>
                    {i ? <View style={[styles.stepLine, i <= at ? styles.stepLineOn : null]} /> : <View style={styles.stepLineGhost} />}
                    <View style={[styles.stepDot, done ? styles.stepDone : null, now ? styles.stepNow : null]}>
                      {done ? <Ionicons name="checkmark" size={11} color={colors.textOnBrand} /> : <Ionicons name={STATUS_ICON[st]} size={11} color={now ? colors.textOnBrand : colors.textTertiary} />}
                    </View>
                    {i < PENALTY_STATUS_ORDER.length - 1 ? <View style={[styles.stepLine, i < at ? styles.stepLineOn : null]} /> : <View style={styles.stepLineGhost} />}
                  </View>
                  <Text style={[styles.stepLabel, now ? styles.stepLabelNow : null]} numberOfLines={2} {...textScale.badge}>
                    {PENALTY_STATUS_SHORT[st]}
                  </Text>
                </View>
              );
            })}
          </View>

          <GroupCard title="Ceza özeti" icon="hammer" tone="red" action={canUpdate ? { label: "Güncelle", onPress: () => setEditing(true) } : undefined}>
            <Text style={styles.summary} {...textScale.long}>
              {banSummary(penalty)}
            </Text>
            <View>
              <FactRow icon="flag-outline" label="Aşama" value={PENALTY_STATUS_LABELS[penalty.status] ?? penalty.status} />
              <FactRow icon="timer-outline" label="Ceza süresi" value={durationText(penalty)} />
              <FactRow icon="football-outline" label="Maç" value={penalty.match_label || null} />
              <FactRow icon="calendar-outline" label="Maç tarihi" value={penalty.match_date ? formatDate(penalty.match_date) : null} />
              <FactRow icon="play-outline" label="Ceza başlangıcı" value={penalty.ban_start_at ? formatDate(penalty.ban_start_at) : null} />
              <FactRow icon="hourglass-outline" label="Zaman tavanı" value={penalty.ban_end_at ? formatDate(penalty.ban_end_at) : null} last={!penalty.defense_deadline_at && !penalty.objection_deadline_at} />
              {penalty.defense_deadline_at ? <FactRow icon="shield-outline" label="Savunma süresi" value={formatDateTime(penalty.defense_deadline_at)} tone="warn" last={!penalty.objection_deadline_at} /> : null}
              {penalty.objection_deadline_at ? <FactRow icon="git-pull-request-outline" label="İtiraz süresi" value={formatDateTime(penalty.objection_deadline_at)} tone="warn" last /> : null}
            </View>
          </GroupCard>

          {penalty.disiplin_karari ? (
            <GroupCard title="Disiplin kararı" icon="document-text" tone="violet">
              <View style={styles.quoteBox}>
                <Text style={styles.body} selectable {...textScale.long}>
                  {penalty.disiplin_karari}
                </Text>
              </View>
            </GroupCard>
          ) : null}

          <GroupCard
            title={`Savunma ve itirazlar · ${submissions.length}`}
            icon="document-attach"
            tone="cyan"
            padded={false}
            action={canReview ? { label: "Kutuyu aç", onPress: () => router.push("/yonetim/savunmalar" as Href) } : undefined}
          >
            <View style={styles.foot}>
              {submissions.length ? (
                submissions.map((sub, i) => {
                  const status = sub.review_status ?? "pending";
                  return (
                    <ListLine
                      key={sub.id}
                      leading={<IconTile icon={sub.event_type === "objection" ? "git-pull-request" : "document-text"} tone={status === "pending" ? "gold" : "neutral"} size={36} glow={false} />}
                      title={`${SUBMISSION_TYPE_LABELS[sub.event_type as "defense"] ?? "Başvuru"} · ${SIDE_LABELS[sub.submitted_by_side ?? ""] ?? "Taraf"}`}
                      subtitle={[formatDateTime(sub.createdAt), sub.review_note ? `Kurul: ${sub.review_note}` : sub.description].filter(Boolean).join(" · ")}
                      pills={[{ label: sub.review_status_label ?? "Değerlendirme bekliyor", tone: REVIEW_TONE[status] }]}
                      onPress={canReview && status === "pending" ? () => setReviewing(sub) : undefined}
                      last={i === submissions.length - 1}
                    />
                  );
                })
              ) : (
                <Text style={[styles.summary, styles.inset]} {...textScale.dense}>
                  Bu dosyaya savunma ya da itiraz gönderilmedi.
                </Text>
              )}
            </View>
          </GroupCard>

          <GroupCard title="Sürecin tamamı" icon="git-commit" tone="neutral">
            <SegmentedControl<"ozet" | "tumu">
              items={[
                { key: "ozet", label: "Aşamalar" },
                { key: "tumu", label: "Tüm kayıtlar" },
              ]}
              value={timelineMode}
              onChange={setTimelineMode}
              size="sm"
            />
            <PenaltyTimeline events={timeline} />
          </GroupCard>

          <View style={styles.actions}>
            {penalty.player_id ? (
              <Button label="Oyuncu profili" icon="person-outline" variant="secondary" onPress={() => router.push(`/oyuncu/${penalty.player_id}` as Href)} style={styles.grow} />
            ) : null}
            {penalty.match_id ? (
              <Button label="Maçı aç" icon="football-outline" variant="secondary" onPress={() => router.push(`/mac/${penalty.match_id}` as Href)} style={styles.grow} />
            ) : null}
          </View>
          {canUpdate ? <Button label="Kararı güncelle" icon="create-outline" size="lg" onPress={() => setEditing(true)} fullWidth /> : null}
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
        <GroupCard title="Aşama ve süre" step={1}>
          <PenaltyDecisionFields value={decision} onChange={setDecision} />
        </GroupCard>
        <GroupCard title="Karar metni" step={2}>
          <Input label="Disiplin kararı" value={karar} onChangeText={setKarar} multiline numberOfLines={5} placeholder="Disiplin kararı / gerekçe metni" />
          <Input label="Süreç notu (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Bu güncellemeyle ilgili kısa not" />
        </GroupCard>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2, borderRadius: radius.pill, padding: 2 },
  summary: { ...type.bodySm, color: colors.textSecondary },
  body: { ...type.body, color: colors.textPrimary },
  quoteBox: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2, borderLeftWidth: 3, borderLeftColor: colors.brandAccent },
  inset: { paddingHorizontal: space.lg },
  foot: { paddingBottom: space.sm },
  actions: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  form: { gap: space.md },
  steps: {
    flexDirection: "row",
    paddingVertical: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  step: { flex: 1, alignItems: "center", gap: space.xs },
  stepTrack: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.separator },
  stepLineOn: { backgroundColor: colors.brandAccent },
  stepLineGhost: { flex: 1 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  stepDone: { backgroundColor: colors.brandAccent, borderColor: colors.brandAccent },
  stepNow: { backgroundColor: colors.danger, borderColor: colors.danger },
  stepLabel: { ...type.micro, color: colors.textTertiary, textAlign: "center", paddingHorizontal: space.xxs },
  stepLabelNow: { color: colors.textPrimary },
});
