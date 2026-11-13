/**
 * GRUP / ETAP PROGRAMI (web editor_pages/groups/GroupSchedule + FixtureDialog).
 *
 * Kurgudan üretilen eşleşmeler tur tur listelenir. Maçı olmayan eşleşme
 * "Fikstüre ekle" ile tarih/saat girilerek maça dönüşür; bağlı maçın bağı
 * kaldırılabilir (maç silinmez). Berabere biten eleme eşleşmesinde galip
 * (penaltılar / kura) elle seçilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ActionSheet,
  FormSheet,
  OptionSheet,
  confirmAction,
  useAdminMutation,
  type FormValues,
} from "@/components/admin";
import { Badge, BottomSheet, EmptyState, TeamLogo, Touchable } from "@/components/ui";
import { OpsGroup } from "@/components/admin/matches/opsKit";
import { formatDate } from "@/lib/admin/format";
import {
  addMeetingFixture,
  pickMeetingWinner,
  unlinkMeeting,
  type Meeting,
  type SeasonGroup,
} from "@/lib/api/admin/leagues";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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
          {rounds.map((round) => {
            const played = round.meetings.filter((m) => m.match && m.match.home_score != null && m.match.away_score != null).length;
            return (
              <OpsGroup
                key={`${round.round}-${round.leg ?? 1}`}
                title={round.round_label || `${round.round}. hafta`}
                right={
                  <Text style={styles.roundCount} {...textScale.badge}>
                    {played}/{round.meetings.length}
                  </Text>
                }
                flush
              >
                {round.meetings.map((m, i) => (
                  <MeetingRow key={m.key} meeting={m} divider={i > 0} onPress={canEdit ? () => setMeeting(m) : undefined} />
                ))}
              </OpsGroup>
            );
          })}
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

/** Eşleşme satırı: ev sahibi · skor/saat plakası · deplasman; altta tarih/saha ve durum hapları. */
function MeetingRow({ meeting: m, divider, onPress }: { meeting: Meeting; divider?: boolean; onPress?: () => void }) {
  const scored = m.match && m.match.home_score != null && m.match.away_score != null;
  const home = sideName(m.home);
  const away = sideName(m.away);
  const homeWon = scored && Number(m.match!.home_score) > Number(m.match!.away_score);
  const awayWon = scored && Number(m.match!.away_score) > Number(m.match!.home_score);
  const meta = m.match ? [formatDate(m.match.date), m.match.venue].filter(Boolean).join(" · ") : "Maç oluşturulmadı";
  const badges = [
    m.leg > 1 ? { label: "Rövanş", tone: "neutral" as const } : null,
    m.needs_winner ? { label: "Galip seçilmeli", tone: "warn" as const } : null,
    m.decided_by === "manual" ? { label: "Galip elle", tone: "info" as const } : null,
  ].filter(Boolean) as { label: string; tone: "neutral" | "warn" | "info" }[];
  const body = (
    <>
      <View style={styles.fixture}>
        <View style={[styles.side, styles.sideHome]}>
          <Text style={[styles.team, styles.teamHome, awayWon ? styles.dim : null]} numberOfLines={1} {...textScale.dense}>
            {home}
          </Text>
          <TeamLogo name={home} logo={m.home.team?.logo ?? null} size={24} />
        </View>
        <View style={[styles.plate, !m.match ? styles.plateEmpty : null]}>
          {scored ? (
            <Text style={styles.plateScore} {...textScale.badge}>
              {m.match!.home_score}–{m.match!.away_score}
            </Text>
          ) : m.match ? (
            <Text style={styles.plateTime} {...textScale.badge}>
              {m.match.time?.slice(0, 5) || "—"}
            </Text>
          ) : (
            <Ionicons name="add" size={16} color={colors.textTertiary} />
          )}
        </View>
        <View style={styles.side}>
          <TeamLogo name={away} logo={m.away.team?.logo ?? null} size={24} />
          <Text style={[styles.team, homeWon ? styles.dim : null]} numberOfLines={1} {...textScale.dense}>
            {away}
          </Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, !m.match ? styles.metaEmpty : null]} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
        {badges.map((b) => (
          <Badge key={b.label} label={b.label} tone={b.tone} size="xs" />
        ))}
      </View>
    </>
  );
  const style = [styles.row, divider ? styles.rowDivider : null];
  const label = `${home} – ${away}, ${scored ? `${m.match!.home_score}-${m.match!.away_score}` : meta}`;
  return onPress ? (
    <Touchable onPress={onPress} feedback="row" style={style} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </Touchable>
  ) : (
    <View style={style} accessible accessibilityLabel={label}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  roundCount: { ...type.numSmStrong, color: colors.textTertiary },
  row: { paddingHorizontal: space.lg, paddingVertical: space.m, gap: space.xs },
  rowDivider: { borderTopWidth: hairline, borderTopColor: colors.separator },
  fixture: { flexDirection: "row", alignItems: "center", gap: space.sm },
  side: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.s },
  sideHome: { justifyContent: "flex-end" },
  team: { ...type.h4, color: colors.textPrimary, flexShrink: 1 },
  teamHome: { textAlign: "right" },
  dim: { opacity: 0.5 },
  plate: {
    minWidth: 56,
    height: 30,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  plateEmpty: { borderStyle: "dashed", backgroundColor: "transparent", borderColor: colors.border },
  plateScore: { ...type.scoreXs, color: colors.textPrimary },
  plateTime: { ...type.tableNumStrong, color: colors.brandAccent },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, flexWrap: "wrap" },
  meta: { ...type.caption, color: colors.textTertiary },
  metaEmpty: { fontStyle: "italic" },
});
