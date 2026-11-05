/**
 * TeamNotesSheet — takımın yönetim tarafındaki iletişim bilgisi ve iç notları
 * (web TeamNotesDialog + TeamContactForm).
 *
 * Üstte iletişim formu: dolu alanlar yetkilinin hesabındaki bilginin önüne
 * geçer; boş alanın yer tutucusu hesaptaki değeri gösterir. Altta iç notlar:
 * örnek çiplerle hızlı yazım, üste sabitleme, silme (onaylı).
 * Uçlar: /api/admin/team-notes/:teamId (teams.notes).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { confirmAction, useAdminMutation } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, ErrorState, Input, SkeletonListRow, Toggle, Touchable } from "@/components/ui";
import { timeAgo } from "@/lib/admin/format";
import {
  addTeamNote,
  deleteTeamNote,
  getTeamNotes,
  NOTE_EXAMPLES,
  saveTeamContact,
  TEAM_CONTACT_FIELDS,
  updateTeamNote,
  type AdminDirectoryTeam,
  type TeamNote,
} from "@/lib/api/admin/contacts";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

type ContactDraft = Record<string, string>;

const sortNotes = (list: TeamNote[]) =>
  [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.created_at || "").localeCompare(String(a.created_at || "")));

export function TeamNotesSheet({ team, onClose }: { team: AdminDirectoryTeam | null; onClose: () => void }) {
  const teamId = team?.id ?? 0;
  const query = useQuery({
    queryKey: ["admin", "team-notes", teamId],
    queryFn: () => getTeamNotes(teamId),
    enabled: Boolean(team),
  });
  const [contact, setContact] = useState<ContactDraft>({});
  const [draft, setDraft] = useState("");
  const [pin, setPin] = useState(false);

  useEffect(() => {
    const c = query.data?.contact;
    setContact(Object.fromEntries(TEAM_CONTACT_FIELDS.map((f) => [f.key, c?.[f.key] ?? ""])));
  }, [query.data]);

  useEffect(() => {
    if (!team) {
      setDraft("");
      setPin(false);
    }
  }, [team]);

  const invalidate = [["admin", "team-notes", teamId], ["admin", "teams-directory"]];
  const saveContact = useAdminMutation(() => saveTeamContact(teamId, contact), { success: "İletişim bilgisi kaydedildi.", invalidate });
  const add = useAdminMutation(() => addTeamNote(teamId, { body: draft.trim(), pinned: pin }), {
    success: "Not eklendi.",
    invalidate,
    onSuccess: () => {
      setDraft("");
      setPin(false);
    },
  });
  const togglePin = useAdminMutation((note: TeamNote) => updateTeamNote(teamId, note.id, { pinned: !note.pinned }), { invalidate });
  const remove = useAdminMutation((note: TeamNote) => deleteTeamNote(teamId, note.id), { success: "Not silindi.", invalidate });

  const askRemove = async (note: TeamNote) => {
    if (await confirmAction({ title: "Bu not silinsin mi?", confirmLabel: "Sil", destructive: true })) remove.mutate(note);
  };

  const notes = sortNotes(query.data?.notes ?? []);
  const manager = team?.manager;
  const updatedAt = query.data?.contact?.updated_at;

  return (
    <BottomSheet visible={team != null} onClose={onClose} title={team?.team_name ?? "Takım notları"} snap="full">
      <View style={styles.body}>
        <Text style={styles.intro} {...textScale.dense}>
          Notları yalnız il yöneticisi ve editör görür.
        </Text>
        {query.isLoading ? (
          <SkeletonListRow count={4} />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} variant="inline" />
        ) : (
          <>
            <Text style={styles.section} {...textScale.dense}>
              İLETİŞİM BİLGİSİ
            </Text>
            {TEAM_CONTACT_FIELDS.map((f) => (
              <Input
                key={f.key}
                label={f.label}
                value={contact[f.key] ?? ""}
                onChangeText={(v) => setContact((c) => ({ ...c, [f.key]: v }))}
                placeholder={f.managerKey && manager?.[f.managerKey] ? `Hesapta: ${manager[f.managerKey]}` : undefined}
                keyboardType={f.kind === "phone" ? "phone-pad" : f.kind === "email" ? "email-address" : "default"}
                autoCapitalize={f.kind === "text" ? "words" : "none"}
                maxLength={f.kind === "email" ? 160 : f.kind === "phone" ? 40 : 120}
              />
            ))}
            <Text style={styles.hint} {...textScale.dense}>
              {updatedAt
                ? `Son düzenleme ${timeAgo(updatedAt)}`
                : manager
                  ? "Boş alanlarda yetkilinin hesabındaki bilgi kullanılır."
                  : "Bu takımın yetkili hesabı yok; girdiğin kişi yetkili olarak görünür."}
            </Text>
            <Button label="İletişimi kaydet" icon="save-outline" onPress={() => saveContact.mutate(undefined)} loading={saveContact.isPending} />

            <Text style={[styles.section, styles.sectionGap]} {...textScale.dense}>
              {`NOTLAR · ${notes.length}`}
            </Text>
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder="Örn. çoğunlukla çarşamba günleri oynuyorlar"
              multiline
              maxLength={1000}
            />
            <ChipGroup scrollable contentPadding={0}>
              {NOTE_EXAMPLES.map((example) => (
                <Chip key={example} label={example} size="sm" onPress={() => setDraft(example)} />
              ))}
            </ChipGroup>
            <View style={styles.pinRow}>
              <Text style={styles.pinLabel} {...textScale.dense}>
                Üste sabitle
              </Text>
              <Toggle value={pin} onValueChange={setPin} accessibilityLabel="Üste sabitle" />
            </View>
            <Button label="Not ekle" icon="add" onPress={() => add.mutate(undefined)} disabled={!draft.trim()} loading={add.isPending} variant="secondary" />

            {notes.length === 0 ? (
              <Text style={styles.hint} {...textScale.dense}>
                Bu takım için henüz not yok.
              </Text>
            ) : (
              notes.map((note) => (
                <View key={note.id} style={[styles.note, note.pinned ? styles.notePinned : null]}>
                  <View style={styles.noteMain}>
                    <Text style={styles.noteBody} selectable {...textScale.long}>
                      {note.body}
                    </Text>
                    <Text style={styles.noteMeta} {...textScale.dense}>
                      {[note.author, note.created_at ? timeAgo(note.created_at) : null].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Touchable onPress={() => togglePin.mutate(note)} hitSlop={8} feedback="icon" accessibilityLabel={note.pinned ? "Sabitlemeyi kaldır" : "Üste sabitle"}>
                    <Ionicons name={note.pinned ? "pin" : "pin-outline"} size={18} color={note.pinned ? colors.brandAccent : colors.textTertiary} />
                  </Touchable>
                  <Touchable onPress={() => void askRemove(note)} hitSlop={8} feedback="icon" accessibilityLabel="Notu sil">
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Touchable>
                </View>
              ))
            )}
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingBottom: space.xl },
  intro: { ...type.bodySm, color: colors.textTertiary },
  section: { ...type.overline, color: colors.textTertiary },
  sectionGap: { marginTop: space.md },
  hint: { ...type.caption, color: colors.textTertiary },
  pinRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pinLabel: { ...type.body, color: colors.textPrimary },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  notePinned: { borderColor: colors.brandBorder, backgroundColor: colors.brandDim },
  noteMain: { flex: 1, gap: space.xxs },
  noteBody: { ...type.body, color: colors.textPrimary },
  noteMeta: { ...type.caption, color: colors.textTertiary },
});
