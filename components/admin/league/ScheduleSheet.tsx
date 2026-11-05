/**
 * GRUP / ETAP PROGRAMI (web editor_pages/groups/GroupSchedule + FixtureDialog).
 *
 * Kurgudan üretilen eşleşmeler tur tur listelenir. Maçı olmayan eşleşme
 * "Fikstüre ekle" ile tarih/saat girilerek maça dönüşür; bağlı maçın bağı
 * kaldırılabilir (maç silinmez). Berabere biten eleme eşleşmesinde galip
 * (penaltılar / kura) elle seçilir.
 */

import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ActionSheet,
  FormSheet,
  OptionSheet,
  RecordCard,
  confirmAction,
  useAdminMutation,
  type FormValues,
} from "@/components/admin";
import { BottomSheet, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/admin/format";
import {
  addMeetingFixture,
  pickMeetingWinner,
  unlinkMeeting,
  type Meeting,
  type SeasonGroup,
} from "@/lib/api/admin/leagues";
import { colors, space, textScale, type } from "@/theme";

const sideName = (side: Meeting["home"]) => side.team?.team_name || side.label || "Belirlenmedi";

export function ScheduleSheet({
  visible,
  onClose,
  group,
  canEdit,
  invalidateKey,
}: {
  visible: boolean;
  onClose: () => void;
  group: SeasonGroup | null;
  canEdit: boolean;
  invalidateKey: readonly unknown[];
}) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [fixtureFor, setFixtureFor] = useState<Meeting | null>(null);
  const [winnerFor, setWinnerFor] = useState<Meeting | null>(null);
  const isStage = group?.group_kind === "etap";

  const addFixture = useAdminMutation(
    (v: FormValues & { m: Meeting }) =>
      addMeetingFixture(group!.id, {
        homeSlotId: v.m.home_slot_id,
        awaySlotId: v.m.away_slot_id,
        leg: v.m.leg || 1,
        date: String(v.date ?? ""),
        time: String(v.time ?? ""),
        venue: (v.venue as string) || undefined,
      }),
    { success: "Maç fikstüre eklendi.", invalidate: [invalidateKey] }
  );

  const unlink = useAdminMutation(
    (m: Meeting) => unlinkMeeting(group!.id, { homeSlotId: m.home_slot_id, awaySlotId: m.away_slot_id, leg: m.leg || 1 }),
    { success: "Maç bağı kaldırıldı.", invalidate: [invalidateKey] }
  );

  const winner = useAdminMutation(
    ({ m, teamId }: { m: Meeting; teamId: number | null }) =>
      pickMeetingWinner(group!.id, { homeSlotId: m.home_slot_id, awaySlotId: m.away_slot_id, winnerTeamId: teamId }),
    { success: (_, v) => (v.teamId ? "Eşleşmenin galibi seçildi." : "Galip seçimi kaldırıldı."), invalidate: [invalidateKey] }
  );

  const rounds = group?.schedule ?? [];

  return (
    <BottomSheet visible={visible} onClose={onClose} title={group ? `${group.group_name} · program` : "Program"} snap="full">
      {!rounds.length ? (
        <EmptyState
          icon="calendar-outline"
          variant="inline"
          title="Program yok"
          body={
            group?.group_format === "serbest" && !isStage
              ? "Serbest grupta program üretilmez; maçlar elle oluşturulur."
              : "Kutular doldukça eşleşmeler burada görünür."
          }
        />
      ) : (
        <View style={styles.stack}>
          {rounds.map((round) => (
            <View key={`${round.round}-${round.leg ?? 1}`} style={styles.round}>
              <Text style={styles.roundLabel} {...textScale.dense}>
                {(round.round_label || `${round.round}. hafta`).toLocaleUpperCase("tr-TR")}
              </Text>
              {round.meetings.map((m) => {
                const score =
                  m.match && m.match.home_score != null && m.match.away_score != null
                    ? `${m.match.home_score} - ${m.match.away_score}`
                    : null;
                return (
                  <RecordCard
                    key={m.key}
                    title={`${sideName(m.home)} – ${sideName(m.away)}`}
                    subtitle={
                      m.match
                        ? [formatDate(m.match.date), m.match.time?.slice(0, 5), m.match.venue].filter(Boolean).join(" · ")
                        : "Maç oluşturulmadı"
                    }
                    icon={m.match ? "football-outline" : "add-circle-outline"}
                    iconTone={m.match ? "brand" : "neutral"}
                    value={score}
                    badges={[
                      m.leg > 1 && { label: "Rövanş" },
                      m.needs_winner && { label: "Galip seçilmeli", tone: "warn" },
                      m.decided_by === "manual" && { label: "Galip elle seçildi", tone: "info" },
                    ]}
                    onPress={canEdit ? () => setMeeting(m) : undefined}
                  />
                );
              })}
            </View>
          ))}
        </View>
      )}

      <ActionSheet
        visible={meeting != null}
        onClose={() => setMeeting(null)}
        title={meeting ? `${sideName(meeting.home)} – ${sideName(meeting.away)}` : undefined}
        actions={
          meeting
            ? [
                {
                  label: "Fikstüre ekle",
                  hint: "Tarih ve saat girerek maç oluştur",
                  icon: "calendar-outline",
                  hidden: Boolean(meeting.match),
                  disabled: !meeting.home.team || !meeting.away.team,
                  onPress: () => setFixtureFor(meeting),
                },
                {
                  label: "Maç bağını kaldır",
                  hint: "Maç silinmez",
                  icon: "unlink-outline",
                  hidden: !meeting.linked,
                  onPress: () =>
                    void confirmAction({ title: "Bağ kaldırılsın mı?", message: "Maç bu eşleşmeden ayrılır; maç ve skor silinmez.", confirmLabel: "Kaldır" }).then(
                      (ok) => ok && unlink.mutate(meeting)
                    ),
                },
                {
                  label: "Galibi seç",
                  hint: "Berabere biten eleme eşleşmesi (penaltılar / kura)",
                  icon: "trophy-outline",
                  hidden: !isStage || !(meeting.drawn || meeting.decided_by === "manual"),
                  onPress: () => setWinnerFor(meeting),
                },
              ]
            : []
        }
      />

      <FormSheet
        visible={fixtureFor != null}
        onClose={() => setFixtureFor(null)}
        title="Fikstüre ekle"
        intro={fixtureFor ? `${sideName(fixtureFor.home)} – ${sideName(fixtureFor.away)}` : undefined}
        fields={[
          { key: "date", label: "Tarih", kind: "date", required: true },
          { key: "time", label: "Saat", kind: "text", required: true, placeholder: "20:00", maxLength: 5 },
          { key: "venue", label: "Saha", kind: "text" },
        ]}
        submitLabel="Maçı oluştur"
        onSubmit={(v) => addFixture.mutateAsync({ ...v, m: fixtureFor! })}
      />

      <OptionSheet<number>
        visible={winnerFor != null}
        onClose={() => setWinnerFor(null)}
        title="Eşleşmenin galibi"
        clearable
        value={winnerFor?.picked_winner_team_id ?? null}
        options={
          winnerFor
            ? [winnerFor.home, winnerFor.away]
                .filter((s) => s.team)
                .map((s) => ({ value: s.team!.team_id, label: s.team!.team_name }))
            : []
        }
        onSelect={(v) => {
          const m = winnerFor;
          if (m) winner.mutate({ m, teamId: (v as number | null) ?? null });
        }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.lg },
  round: { gap: space.sm },
  roundLabel: { ...type.overline, color: colors.textTertiary },
});
