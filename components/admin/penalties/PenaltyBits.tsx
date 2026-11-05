/**
 * Ceza ekranlarının ortak parçaları (web PenaltyShared.js karşılığı).
 *
 *   PenaltyCard          liste kartı: oyuncu, takım, aşama, aktiflik, kalan ceza
 *   PenaltyTimeline      sürecin tamamı (savunma / itiraz dahil)
 *   PenaltyDecisionFields aşama + süre türü + maç sayısı (detay, sevk, savunma kutusu)
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { FieldLabel, RecordCard, type BadgeSpec } from "@/components/admin";
import { Input, SegmentedControl, type Tone } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import {
  banSummary,
  DURATION_HINTS,
  PENALTY_STATUS_LABELS,
  PENALTY_STATUS_ORDER,
  PENALTY_STATUS_SHORT,
  PENALTY_STAGE_HINTS,
  SIDE_LABELS,
  type DurationType,
  type Penalty,
  type PenaltyEvent,
  type PenaltyStatus,
} from "@/lib/api/admin/penalties";
import { colors, radius, space, textScale, type } from "@/theme";

import { RadioGroup } from "./RadioRow";

export const STATUS_TONE: Record<PenaltyStatus, Tone> = {
  sevk: "warn",
  kurul_karari: "danger",
  cas_basvuru: "info",
  cas_karari: "brand",
};

/** Aşama + aktiflik + kalan ceza rozetleri. */
export function penaltyBadges(penalty: Penalty, short = true): BadgeSpec[] {
  const badges: BadgeSpec[] = [
    { label: short ? PENALTY_STATUS_SHORT[penalty.status] ?? penalty.status : PENALTY_STATUS_LABELS[penalty.status], tone: STATUS_TONE[penalty.status] },
  ];
  const state = penalty.ban_state;
  if (state && state.active != null) {
    badges.push(state.active ? { label: "Cezalı", tone: "danger", icon: "alert-circle" } : { label: "Ceza sona erdi", tone: "neutral" });
  }
  if (state?.duration_type === "suresiz") badges.push({ label: "Süresiz ihraç", tone: "danger" });
  if (state?.duration_type === "mac" && state.matches_remaining != null) {
    badges.push(
      state.matches_remaining > 0
        ? { label: `Kalan ${state.matches_remaining} maç`, tone: "warn" }
        : { label: "Ceza tamamlandı", tone: "win" }
    );
  }
  if (penalty.submission_summary?.pending) badges.push({ label: `${penalty.submission_summary.pending} başvuru`, tone: "info", icon: "document-attach-outline" });
  return badges;
}

export const PenaltyCard = React.memo(function PenaltyCard({ penalty, onPress }: { penalty: Penalty; onPress?: () => void }) {
  const match = penalty.match_label ? `${penalty.match_label}${penalty.match_date ? ` · ${formatDate(penalty.match_date)}` : ""}` : null;
  return (
    <RecordCard
      title={penalty.player_name || "Oyuncu"}
      subtitle={penalty.team_name || "Takım belirtilmedi"}
      meta={match}
      avatar={{ name: penalty.player_name, image: penalty.player_img }}
      badges={penaltyBadges(penalty)}
      onPress={onPress}
    >
      <Text style={styles.summary} numberOfLines={2} {...textScale.dense}>
        {banSummary(penalty)}
      </Text>
    </RecordCard>
  );
});

const SIDE_TONE: Record<string, string> = {
  team: colors.info,
  player: colors.info,
  system: colors.textTertiary,
  admin: colors.brandAccent,
};

/** Sürecin tamamı — yönetim görünümünde savunma / itiraz da gösterilir. */
export function PenaltyTimeline({ events }: { events: PenaltyEvent[] }) {
  if (!events.length) {
    return (
      <Text style={styles.summary} {...textScale.dense}>
        Henüz süreç kaydı yok.
      </Text>
    );
  }
  return (
    <View style={styles.timeline}>
      {events.map((event, index) => {
        const side = event.actor_side || "admin";
        return (
          <View key={event.id} style={styles.tlItem}>
            <View style={styles.tlRail}>
              <View style={[styles.tlDot, { backgroundColor: SIDE_TONE[side] ?? colors.brandAccent }]} />
              {index < events.length - 1 ? <View style={styles.tlLine} /> : null}
            </View>
            <View style={styles.tlBody}>
              <Text style={styles.tlMeta} {...textScale.dense}>
                {formatDateTime(event.createdAt)} · {SIDE_LABELS[side] ?? "Disiplin Kurulu"}
              </Text>
              <Text style={styles.tlTitle} {...textScale.dense}>
                {event.title || event.status_label || "Kayıt"}
              </Text>
              {event.description ? (
                <Text style={styles.tlText} selectable {...textScale.long}>
                  {event.description}
                </Text>
              ) : null}
              {event.duration_type ? (
                <Text style={styles.tlNote} {...textScale.dense}>
                  Süre: {event.duration_type === "suresiz" ? "Süresiz (2 takvim yılı)" : `${event.match_count ?? 1} maç`}
                </Text>
              ) : null}
              {event.is_submission && event.review_status_label ? (
                <Text style={styles.tlNote} {...textScale.dense}>
                  Kurul: {event.review_status_label}
                  {event.review_note ? ` — ${event.review_note}` : ""}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export interface DecisionValue {
  status: PenaltyStatus;
  duration_type: DurationType | "";
  match_count: string;
}

/**
 * Aşama + süre seçimi. `allowKeep` savunma kutusunda "değiştirme" seçeneğini
 * açar (boş aşama / boş süre = mevcut değer kalır).
 */
export function PenaltyDecisionFields({
  value,
  onChange,
  showStatus = true,
  forceDuration,
}: {
  value: DecisionValue;
  onChange: (next: DecisionValue) => void;
  showStatus?: boolean;
  /** Süre alanlarını aşamadan bağımsız göster. */
  forceDuration?: boolean;
}) {
  const showDuration = forceDuration || value.status !== "sevk";
  return (
    <View style={styles.fields}>
      {showStatus ? (
        <View style={styles.field}>
          <FieldLabel label="Ceza aşaması" />
          <RadioGroup
            options={PENALTY_STATUS_ORDER.map((s) => ({ value: s, label: PENALTY_STATUS_LABELS[s], hint: PENALTY_STAGE_HINTS[s] }))}
            value={value.status}
            onChange={(status) => onChange({ ...value, status })}
          />
        </View>
      ) : null}
      {showDuration ? (
        <View style={styles.field}>
          <FieldLabel label="Ceza süresi" />
          <SegmentedControl<"" | DurationType>
            items={[
              { key: "", label: "Belirleme" },
              { key: "mac", label: "Maç men" },
              { key: "suresiz", label: "Süresiz" },
            ]}
            value={value.duration_type}
            onChange={(duration_type) => onChange({ ...value, duration_type })}
            size="sm"
          />
          {value.duration_type ? (
            <Text style={styles.hint} {...textScale.dense}>
              {DURATION_HINTS[value.duration_type]}
            </Text>
          ) : null}
          {value.duration_type === "mac" ? (
            <Input
              label="Maç sayısı"
              value={value.match_count}
              onChangeText={(text) => onChange({ ...value, match_count: text.replace(/\D/g, "") })}
              keyboardType="number-pad"
              placeholder="Örn: 3"
              maxLength={3}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Süre değerini sunucu gövdesine çevirir (boş tür = gönderme). */
export function durationBody(value: DecisionValue): { duration_type?: DurationType; match_count?: number } {
  if (!value.duration_type) return {};
  return {
    duration_type: value.duration_type,
    ...(value.duration_type === "mac" ? { match_count: Math.max(1, Number(value.match_count) || 1) } : {}),
  };
}

const styles = StyleSheet.create({
  summary: { ...type.caption, color: colors.textSecondary, marginTop: space.xs },
  fields: { gap: space.lg },
  field: { gap: space.sm },
  hint: { ...type.caption, color: colors.textTertiary },
  timeline: { gap: 0 },
  tlItem: { flexDirection: "row", gap: space.md },
  tlRail: { width: 12, alignItems: "center" },
  tlDot: { width: 10, height: 10, borderRadius: radius.pill, marginTop: space.xs },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.separator, marginVertical: space.xxs },
  tlBody: { flex: 1, gap: 2, paddingBottom: space.lg },
  tlMeta: { ...type.caption, color: colors.textTertiary },
  tlTitle: { ...type.label, color: colors.textPrimary },
  tlText: { ...type.bodySm, color: colors.textSecondary },
  tlNote: { ...type.caption, color: colors.textSecondary },
});
