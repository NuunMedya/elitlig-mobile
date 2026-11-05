/**
 * Sezon kadrosu taslağı incelemesi (web editor_pages/rosters/DraftReview.js).
 *
 * Taslak aktif kadroyla farkı (eklenecek / çıkarılacak / lisansı değişecek)
 * ve transfer hakkı etkisiyle gösterilir. Onayda fark uygulanır, yalnız net
 * eklemeler kadar transfer hakkı düşer. Kural hatası olan taslak onaylanamaz.
 * Ret gerekçesi zorunludur (takım taslağı düzeltip yeniden gönderir).
 */

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { InfoLine, Panel, RecordCard, StatRow, confirmAction, useAdminMutation } from "@/components/admin";
import { BottomSheet, Button, Input, TeamLogo } from "@/components/ui";
import { formatDateTime } from "@/lib/admin/format";
import { positionLabel } from "@/lib/api/admin/players";
import { ROW_STATUS_LABELS, approveRosterDraft, rejectRosterDraft, type DraftMember, type RosterDraft } from "@/lib/api/admin/rosters";
import { colors, space, textScale, type } from "@/theme";

const rightsText = (r?: { unlimited?: boolean; none?: boolean; available?: number } | null) =>
  !r ? "Sınırsız" : r.unlimited ? "Limitsiz" : r.none ? "0" : String(r.available ?? 0);

function DiffList({ title, list, tone }: { title: string; list?: DraftMember[]; tone: "add" | "remove" | "license" }) {
  return (
    <Panel title={`${title} · ${list?.length ?? 0}`}>
      {list?.length ? (
        list.map((m) => (
          <RecordCard
            key={m.player_id}
            title={m.name}
            subtitle={[
              m.position ? positionLabel(m.position) : null,
              m.kind === "loan" ? "Kiralık" : null,
              tone === "license" ? (m.is_licensed ? "Lisanslı olacak" : "Lisans kalkacak") : m.is_licensed ? "Lisanslı" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
            avatar={{ name: m.name, image: m.image }}
            iconTone={tone === "add" ? "win" : tone === "remove" ? "danger" : "info"}
          />
        ))
      ) : (
        <Text style={styles.muted}>Yok</Text>
      )}
    </Panel>
  );
}

export function DraftReviewSheet({
  draft,
  onClose,
  invalidate,
}: {
  draft: RosterDraft | null;
  onClose: () => void;
  invalidate: readonly (readonly unknown[])[];
}) {
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  useEffect(() => {
    setNote("");
    setNoteError(null);
  }, [draft?.id]);

  const approve = useAdminMutation((d: RosterDraft) => approveRosterDraft(d.id, note.trim()), {
    success: (r) => r?.message || "Taslak onaylandı ve aktif kadroya uygulandı.",
    invalidate: [...invalidate],
    onSuccess: onClose,
  });
  const reject = useAdminMutation((d: RosterDraft) => rejectRosterDraft(d.id, note.trim()), {
    success: (r) => r?.message || "Taslak reddedildi.",
    invalidate: [...invalidate],
    onSuccess: onClose,
  });

  if (!draft) return <BottomSheet visible={false} onClose={onClose}><View /></BottomSheet>;

  const diff = draft.diff || {};
  const rules = draft.rules || {};
  const problems = draft.errors || [];
  const pending = draft.status === "submitted";
  const decided = draft.last_decision;
  const licensed = (draft.members || []).filter((m) => m.is_licensed).length;

  const decide = async (kind: "approve" | "reject") => {
    if (kind === "reject" && !note.trim()) {
      setNoteError("Ret gerekçesini yaz; takım taslağı buna göre düzeltir.");
      return;
    }
    const ok = await confirmAction({
      title: kind === "approve" ? "Taslak onaylansın mı?" : "Taslak reddedilsin mi?",
      message:
        kind === "approve"
          ? `${draft.team?.name ?? "Takım"} · ${draft.season?.name ?? "sezon"} kadrosuna ${diff.additions?.length ?? 0} oyuncu eklenecek, ${diff.removals?.length ?? 0} oyuncu çıkarılacak. Transfer hakkı yalnız eklenen oyuncu sayısı kadar düşer.`
          : "Takım taslağını düzenleyip yeniden gönderebilir.",
      confirmLabel: kind === "approve" ? "Onayla ve uygula" : "Reddet",
      destructive: kind === "reject",
    });
    if (!ok) return;
    if (kind === "approve") approve.mutate(draft);
    else reject.mutate(draft);
  };

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="Sezon kadrosu taslağı"
      snap="full"
      footer={
        pending ? (
          <View style={styles.footer}>
            <Button label="Reddet" variant="danger" icon="close" onPress={() => void decide("reject")} loading={reject.isPending} />
            <Button
              label="Onayla ve uygula"
              icon="checkmark"
              onPress={() => void decide("approve")}
              loading={approve.isPending}
              disabled={problems.length > 0}
              style={styles.grow}
              haptic="success"
            />
          </View>
        ) : undefined
      }
    >
      <View style={styles.stack}>
        <View style={styles.head}>
          <TeamLogo name={draft.team?.name} logo={draft.team?.logo} size={44} />
          <View style={styles.grow}>
            <Text style={styles.title} {...textScale.dense}>
              {draft.team?.name ?? `Takım #${draft.team_id}`}
            </Text>
            <Text style={styles.muted} {...textScale.dense}>
              {[draft.team?.city, draft.season?.league_name, draft.season?.name].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>
        <InfoLine
          label="Durum"
          value={
            pending
              ? `${ROW_STATUS_LABELS.pending} · ${formatDateTime(draft.submitted_at)}`
              : `${decided ? ROW_STATUS_LABELS[decided] : "Taslak"} · ${formatDateTime(draft.last_decision_at)}`
          }
          tone={pending ? "warn" : decided === "approved" ? "win" : decided === "rejected" ? "danger" : undefined}
        />
        {draft.note ? <InfoLine label="Takımın notu" value={`“${draft.note}”`} /> : null}
        {!pending && draft.last_decision_note ? <InfoLine label="Yönetim notu" value={`“${draft.last_decision_note}”`} /> : null}
        <StatRow
          items={[
            { label: "Taslak kadro", value: `${draft.members?.length ?? 0}${rules.applies && rules.general && !rules.general.unlimited ? `/${rules.general.cap}` : ""}` },
            { label: "Lisanslı", value: `${licensed}${rules.applies && rules.licensed && !rules.licensed.unlimited ? `/${rules.licensed.cap}` : ""}` },
            {
              label: "Transfer hakkı",
              value: rules.applies ? `${rightsText(rules.transfer_rights)}${rules.transfer_rights && !rules.transfer_rights.unlimited ? ` → ${rules.rights_after ?? "?"}` : ""}` : "Sınırsız",
            },
            { label: "Hak tüketimi", value: rules.rights_needed ?? diff.additions?.length ?? 0 },
          ]}
        />
        {problems.length ? (
          <Panel title="KURAL HATALARI">
            {problems.map((e, i) => (
              <Text key={`${e.code}-${i}`} style={styles.error} {...textScale.long}>
                • {e.message}
              </Text>
            ))}
            <Text style={styles.muted} {...textScale.long}>
              Kural hatası olan taslak onaylanamaz; gerekçeyle reddet.
            </Text>
          </Panel>
        ) : null}
        <DiffList title="EKLENECEK" list={diff.additions} tone="add" />
        <DiffList title="ÇIKARILACAK" list={diff.removals} tone="remove" />
        <DiffList title="LİSANS DEĞİŞİKLİĞİ" list={diff.license_changes} tone="license" />
        {pending ? (
          <Input
            label="Takıma not"
            value={note}
            onChangeText={(t) => {
              setNote(t);
              setNoteError(null);
            }}
            maxLength={500}
            multiline
            placeholder="Onayda isteğe bağlı; retteki gerekçe burada yazılır."
            error={noteError ?? undefined}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1 },
  footer: { flexDirection: "row", gap: space.sm },
  title: { ...type.h3, color: colors.textPrimary },
  muted: { ...type.bodySm, color: colors.textTertiary },
  error: { ...type.bodySm, color: colors.danger },
});
