/**
 * SubmissionReviewSheet — savunma / itiraz başvurusunu sonuçlandırma formu.
 *
 * NE: web DefenseInbox karar formunun alt sayfa hâli. Karar (kabul / ret /
 * dikkate al), kurula ait gerekçe notu ve isteğe bağlı olarak AYNI İŞLEMDE
 * ceza dosyasının aşaması ve süresi güncellenir
 * (POST /api/penalties/admin/submissions/:eventId/review, `penalty` alanı).
 * Gerekçe ilgili takıma ve oyuncuya bildirimle gider.
 */

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";

import { SelectField, ToggleField, useAdminMutation } from "@/components/admin";
import { DangerNote, FactRow, GroupCard } from "@/components/admin/team/ManageKit";
import { Avatar, Badge, BottomSheet, Button, Input } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDateTime } from "@/lib/admin/format";
import {
  banSummary,
  durationText,
  PENALTY_STATUS_LABELS,
  PENALTY_STATUS_ORDER,
  REVIEW_DECISIONS,
  reviewSubmission,
  SIDE_LABELS,
  SUBMISSION_TYPE_LABELS,
  type Penalty,
  type PenaltyEvent,
  type PenaltyStatus,
  type PenaltyUpdate,
  type ReviewStatus,
} from "@/lib/api/admin/penalties";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { durationBody, PenaltyDecisionFields, type DecisionValue } from "./PenaltyBits";
import { RadioGroup } from "./RadioRow";

export function SubmissionReviewSheet({
  submission,
  penalty,
  onClose,
}: {
  submission: PenaltyEvent | null;
  penalty: Penalty | null | undefined;
  onClose: () => void;
}) {
  const [decision, setDecision] = useState<Exclude<ReviewStatus, "pending">>("accepted");
  const [note, setNote] = useState("");
  const [alsoUpdate, setAlsoUpdate] = useState(false);
  const [stage, setStage] = useState<PenaltyStatus | null>(null);
  const [duration, setDuration] = useState<DecisionValue>({ status: "kurul_karari", duration_type: "", match_count: "" });
  const [failure, setFailure] = useState<string | null>(null);

  // Yeni başvuru açılınca form cezanın güncel değerleriyle sıfırlanır.
  useEffect(() => {
    if (!submission) return;
    setDecision("accepted");
    setNote("");
    setAlsoUpdate(false);
    setStage(null);
    setDuration({
      status: penalty?.status ?? "kurul_karari",
      duration_type: "",
      match_count: penalty?.match_count ? String(penalty.match_count) : "",
    });
    setFailure(null);
  }, [submission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const review = useAdminMutation(
    () => {
      const body: { review_status: Exclude<ReviewStatus, "pending">; review_note: string | null; penalty?: PenaltyUpdate } = {
        review_status: decision,
        review_note: note.trim() || null,
      };
      if (alsoUpdate) {
        const update: PenaltyUpdate = { ...durationBody(duration) };
        if (stage && stage !== penalty?.status) update.status = stage;
        if (note.trim()) update.note = note.trim();
        if (Object.keys(update).length) body.penalty = update;
      }
      return reviewSubmission(submission!.id, body);
    },
    {
      success: "Başvuru değerlendirildi ve ilgili tarafa bildirildi.",
      invalidate: [["admin", "penalties"]],
      silentError: true,
      onSuccess: onClose,
    }
  );

  const submit = async () => {
    setFailure(null);
    try {
      await review.mutateAsync(undefined);
    } catch (error) {
      setFailure(errorText(error));
    }
  };

  const side = submission?.submitted_by_side ?? submission?.actor_side ?? "";

  return (
    <BottomSheet
      visible={submission != null}
      onClose={review.isPending ? () => undefined : onClose}
      title={submission ? `${SUBMISSION_TYPE_LABELS[submission.event_type as "defense"] ?? "Başvuru"} · ${SIDE_LABELS[side] ?? "Taraf"}` : "Başvuru"}
      snap="full"
      footer={<Button label="Kararı kaydet ve bildir" icon="checkmark" size="lg" onPress={submit} loading={review.isPending} haptic="success" fullWidth />}
    >
      {submission ? (
        <View style={styles.body}>
          <View style={styles.from}>
            <Avatar name={penalty?.player_name} image={penalty?.player_img} size={44} />
            <View style={styles.grow}>
              <Text style={styles.fromName} numberOfLines={1} {...textScale.dense}>
                {penalty?.player_name ?? "Oyuncu"}
              </Text>
              <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                {[penalty?.team_name, formatDateTime(submission.createdAt)].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Badge label={SUBMISSION_TYPE_LABELS[submission.event_type as "defense"] ?? "Başvuru"} tone={submission.event_type === "objection" ? "info" : "warn"} size="sm" />
          </View>
          <View style={styles.quote}>
            <Ionicons name="chatbox-ellipses" size={16} color={colors.warn} />
            <Text style={styles.quoteText} selectable {...textScale.long}>
              {submission.description || "Metin yok."}
            </Text>
          </View>

          {penalty ? <PenaltyFacts penalty={penalty} /> : null}

          <GroupCard title="Kararın" step={1}>
            <RadioGroup options={REVIEW_DECISIONS.map((d) => ({ value: d.value, label: d.label, hint: d.hint }))} value={decision} onChange={setDecision} />
          </GroupCard>

          <GroupCard title="Gerekçe" step={2}>
            <Input
              label="Gerekçe / karar notu"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={4}
              placeholder="Bu metin ilgili takıma ve oyuncuya iletilir."
              maxLength={3000}
            />
          </GroupCard>

          <GroupCard title="Ceza dosyası" step={3}>
            <ToggleField
              label="Aynı anda ceza dosyasını da güncelle"
              hint="Aşamayı ilerlet ve/veya ceza süresini yeniden belirle."
              value={alsoUpdate}
              onChange={setAlsoUpdate}
            />
            {alsoUpdate ? (
              <View style={styles.field}>
                <SelectField<PenaltyStatus>
                  label="Ceza aşaması"
                  value={stage}
                  options={PENALTY_STATUS_ORDER.map((st) => ({ value: st, label: PENALTY_STATUS_LABELS[st] }))}
                  placeholder="Değiştirme"
                  clearable
                  onChange={setStage}
                />
                <PenaltyDecisionFields value={duration} onChange={setDuration} showStatus={false} forceDuration />
              </View>
            ) : null}
          </GroupCard>

          {failure ? <DangerNote title="Kaydedilemedi" body={failure} /> : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

/** Başvurunun bağlı olduğu ceza dosyasının kısa özeti. */
export function PenaltyFacts({ penalty }: { penalty: Penalty }) {
  return (
    <GroupCard title="Bağlı ceza dosyası" icon="hammer" tone="red">
      <Text style={styles.meta} {...textScale.dense}>
        {banSummary(penalty)}
      </Text>
      <View>
        <FactRow icon="flag-outline" label="Güncel aşama" value={PENALTY_STATUS_LABELS[penalty.status] ?? penalty.status} />
        <FactRow icon="timer-outline" label="Ceza süresi" value={durationText(penalty)} />
        <FactRow icon="shield-outline" label="Savunma süresi" value={penalty.defense_deadline_at ? formatDateTime(penalty.defense_deadline_at) : null} />
        <FactRow icon="git-pull-request-outline" label="İtiraz süresi" value={penalty.objection_deadline_at ? formatDateTime(penalty.objection_deadline_at) : null} last />
      </View>
      {penalty.disiplin_karari ? (
        <View style={styles.karar}>
          <Text style={styles.kararText} selectable numberOfLines={6} {...textScale.long}>
            {penalty.disiplin_karari}
          </Text>
        </View>
      ) : null}
    </GroupCard>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  karar: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2, borderLeftWidth: 3, borderLeftColor: colors.brandAccent },
  kararText: { ...type.bodySm, color: colors.textPrimary },
  body: { gap: space.md },
  meta: { ...type.caption, color: colors.textTertiary },
  from: { flexDirection: "row", alignItems: "center", gap: space.md },
  fromName: { ...type.h3, color: colors.textPrimary },
  quote: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.warnDim, borderWidth: hairline, borderColor: colors.warn },
  quoteText: { ...type.body, color: colors.textPrimary, flex: 1 },
  field: { gap: space.md },
});
