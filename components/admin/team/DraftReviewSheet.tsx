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

import { confirmAction, useAdminMutation } from "@/components/admin";
import { Badge, BottomSheet, Button, Input, TeamLogo } from "@/components/ui";
import { formatDateTime } from "@/lib/admin/format";
import { positionLabel } from "@/lib/api/admin/players";
import { ROW_STATUS_LABELS, approveRosterDraft, rejectRosterDraft, type DraftMember, type RosterDraft } from "@/lib/api/admin/rosters";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";

import { DangerNote, GroupCard, ListLine, PositionAvatar, QuotaBar } from "./ManageKit";

const rightsText = (r?: { unlimited?: boolean; none?: boolean; available?: number } | null) =>
  !r ? "Sınırsız" : r.unlimited ? "Limitsiz" : r.none ? "0" : String(r.available ?? 0);

const DIFF_TONE = {
  add: { icon: "add-circle" as const, tile: "mint" as const, sign: "+" },
  remove: { icon: "remove-circle" as const, tile: "red" as const, sign: "−" },
  license: { icon: "id-card" as const, tile: "cyan" as const, sign: "±" },
};

function DiffList({ title, list, tone }: { title: string; list?: DraftMember[]; tone: "add" | "remove" | "license" }) {
  const t = DIFF_TONE[tone];
  if (!list?.length) return null;
  return (
    <GroupCard title={`${title} · ${t.sign}${list.length}`} icon={t.icon} tone={t.tile} padded={false}>
      <View style={styles.listFoot}>
        {list.map((m, i) => (
          <ListLine
            key={m.player_id}
            leading={<PositionAvatar name={m.name} image={m.image} position={m.position} size={34} />}
            title={m.name}
            subtitle={[m.position ? positionLabel(m.position) : null, m.kind === "loan" ? "Kiralık" : null].filter(Boolean).join(" · ") || "Mevki yok"}
            pills={[
              tone === "license" ? { label: m.is_licensed ? "Lisanslı olacak" : "Lisans kalkacak", tone: m.is_licensed ? "info" : "warn" } : m.is_licensed && { label: "Lisanslı", tone: "info" },
            ]}
            last={i === list.length - 1}
          />
        ))}
      </View>
    </GroupCard>
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
            <Button label="Reddet" variant="secondary" icon="close" size="lg" onPress={() => void decide("reject")} loading={reject.isPending} />
            <Button
              label="Onayla ve uygula"
              icon="checkmark"
              size="lg"
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
          <TeamLogo name={draft.team?.name} logo={draft.team?.logo} size={52} />
          <View style={styles.grow}>
            <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
              {draft.team?.name ?? `Takım #${draft.team_id}`}
            </Text>
            <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
              {[draft.team?.city, draft.season?.league_name, draft.season?.name].filter(Boolean).join(" · ")}
            </Text>
            <View style={styles.pills}>
              <Badge
                label={pending ? ROW_STATUS_LABELS.pending : decided ? ROW_STATUS_LABELS[decided] : "Taslak"}
                tone={pending ? "warn" : decided === "approved" ? "win" : decided === "rejected" ? "danger" : "neutral"}
                size="xs"
              />
              <Text style={styles.time} {...textScale.dense}>
                {formatDateTime(pending ? draft.submitted_at : draft.last_decision_at)}
              </Text>
            </View>
          </View>
        </View>

        {/* FARK ÖZETİ — büyük +/− rakamlar. */}
        <View style={styles.delta}>
          {[
            { label: "Eklenecek", value: diff.additions?.length ?? 0, color: colors.win, sign: "+" },
            { label: "Çıkarılacak", value: diff.removals?.length ?? 0, color: colors.danger, sign: "−" },
            { label: "Lisans", value: diff.license_changes?.length ?? 0, color: colors.info, sign: "" },
          ].map((d) => (
            <View key={d.label} style={styles.deltaCell}>
              <Text style={[styles.deltaValue, { color: d.value ? d.color : colors.textTertiary }]} {...textScale.badge}>
                {d.value ? d.sign : ""}
                {d.value}
              </Text>
              <Text style={styles.deltaLabel} {...textScale.badge}>
                {upperTR(d.label)}
              </Text>
            </View>
          ))}
        </View>

        <GroupCard title="Kural durumu" icon="speedometer" tone="violet">
          <QuotaBar label="Taslak kadro" used={draft.members?.length ?? 0} cap={rules.applies && rules.general && !rules.general.unlimited ? rules.general.cap ?? null : null} />
          <QuotaBar label="Lisanslı" used={licensed} cap={rules.applies && rules.licensed && !rules.licensed.unlimited ? rules.licensed.cap ?? null : null} />
          <View style={styles.rights}>
            <Badge
              label={`Transfer hakkı: ${rules.applies ? `${rightsText(rules.transfer_rights)}${rules.transfer_rights && !rules.transfer_rights.unlimited ? ` → ${rules.rights_after ?? "?"}` : ""}` : "Sınırsız"}`}
              tone="info"
              icon="swap-horizontal"
              size="sm"
            />
            <Badge label={`Hak tüketimi: ${rules.rights_needed ?? diff.additions?.length ?? 0}`} tone="neutral" size="sm" />
          </View>
        </GroupCard>

        {problems.length ? (
          <DangerNote
            title={`${problems.length} kural hatası · onaylanamaz`}
            body={`${problems.map((e) => `• ${e.message}`).join("\n")}\nGerekçeyle reddet; takım düzeltip yeniden gönderir.`}
          />
        ) : null}

        {draft.note ? <DangerNote tone="info" icon="chatbox-ellipses" title="Takımın notu" body={`“${draft.note}”`} /> : null}
        {!pending && draft.last_decision_note ? <DangerNote tone="info" icon="shield-checkmark" title="Yönetim notu" body={`“${draft.last_decision_note}”`} /> : null}

        <DiffList title="Eklenecek" list={diff.additions} tone="add" />
        <DiffList title="Çıkarılacak" list={diff.removals} tone="remove" />
        <DiffList title="Lisans değişikliği" list={diff.license_changes} tone="license" />
        {!diff.additions?.length && !diff.removals?.length && !diff.license_changes?.length ? (
          <Text style={styles.muted} {...textScale.long}>
            Taslak aktif kadroyla aynı; değişiklik yok.
          </Text>
        ) : null}

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
  grow: { flex: 1, minWidth: 0 },
  footer: { flexDirection: "row", gap: space.sm },
  title: { ...type.h2, color: colors.textPrimary },
  muted: { ...type.bodySm, color: colors.textTertiary },
  pills: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs },
  time: { ...type.caption, color: colors.textTertiary },
  delta: { flexDirection: "row", borderRadius: radius.xl, backgroundColor: colors.surface2, paddingVertical: space.md },
  deltaCell: { flex: 1, alignItems: "center", gap: 2 },
  deltaValue: { ...type.scoreLg },
  deltaLabel: { ...type.micro, color: colors.textTertiary },
  rights: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  listFoot: { paddingBottom: space.xs },
});
