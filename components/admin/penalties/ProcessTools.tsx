/**
 * ProcessTools — disiplin süreçlerinin (oyuncu dosyası / maç-konu incelemesi)
 * yönetim ekranlarında ortak iki parça:
 *
 *   · VisibilityCard : süreç kime açık yürütülsün? Herkese açık, yalnızca ilgili
 *     taraflar ya da (başvurudan açılan incelemede) yalnızca başvuran takım.
 *   · PartyEntryCard : kurul, ilgili taraf adına savunma ya da itiraz girer
 *     (sözlü / telefonla iletilen beyanlar). Kayıt "kurul kaydı" olarak işlenir.
 */

import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SelectField } from "@/components/admin";
import { GroupCard } from "@/components/admin/team/ManageKit";
import { Button, Input, SegmentedControl } from "@/components/ui";
import { PROCESS_VISIBILITY_OPTIONS, type ProcessVisibility } from "@/lib/api/panel";
import { colors, space, textScale, type } from "@/theme";

export function VisibilityCard({
  value,
  allowed,
  onChange,
  pending,
}: {
  value: ProcessVisibility;
  /** Sunulacak seçenekler (oyuncu dosyasında "team" yoktur). */
  allowed: ProcessVisibility[];
  onChange: (next: ProcessVisibility) => void;
  pending?: boolean;
}) {
  const options = PROCESS_VISIBILITY_OPTIONS.filter((option) => allowed.includes(option.value));
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <GroupCard title="Süreç kime açık?" icon="eye" tone="neutral">
      <SelectField<ProcessVisibility>
        label="Görünürlük"
        value={current.value}
        onChange={(next) => {
          if (next && next !== value) onChange(next);
        }}
        options={options.map((option) => ({ value: option.value, label: option.label, hint: option.hint }))}
        disabled={pending}
        sheetTitle="Süreç kime açık yürütülsün?"
      />
      <Text style={styles.hint} {...textScale.dense}>
        {current.hint}
      </Text>
    </GroupCard>
  );
}

export interface EntryParty {
  key: string;
  label: string;
}

export function PartyEntryCard({
  parties,
  canObject,
  objectionLabel,
  objectionHint,
  onSubmit,
  pending,
}: {
  parties: EntryParty[];
  /** İtiraz bu aşamada girilebilir mi. */
  canObject: boolean;
  objectionLabel: string;
  objectionHint: string;
  onSubmit: (entry: { kind: "defense" | "objection"; party: string; text: string }) => Promise<unknown>;
  pending?: boolean;
}) {
  const [kind, setKind] = useState<"defense" | "objection">("defense");
  const [party, setParty] = useState<string | null>(parties[0]?.key ?? null);
  const [text, setText] = useState("");
  const effectiveKind = canObject ? kind : "defense";
  if (!parties.length) return null;

  const submit = async () => {
    if (!party || text.trim().length < 3) return;
    try {
      await onSubmit({ kind: effectiveKind, party, text: text.trim() });
      setText("");
    } catch {
      /* hata bildirimi çağıran tarafta gösterilir */
    }
  };

  return (
    <GroupCard title="Taraf adına kayıt ekle" icon="create" tone="neutral">
      <Text style={styles.hint} {...textScale.dense}>
        Sözlü, yazılı ya da telefonla iletilen beyanı ilgili taraf adına girebilirsin. Kayıt “kurul kaydı” olarak işaretlenir.
      </Text>
      {canObject ? (
        <SegmentedControl<"defense" | "objection">
          items={[
            { key: "defense", label: "Savunma" },
            { key: "objection", label: objectionLabel },
          ]}
          value={kind}
          onChange={setKind}
          size="sm"
        />
      ) : (
        <Text style={styles.hint} {...textScale.dense}>
          {objectionHint}
        </Text>
      )}
      <SelectField<string>
        label="Kimin adına?"
        value={party}
        onChange={setParty}
        options={parties.map((item) => ({ value: item.key, label: item.label }))}
        sheetTitle="Kimin adına?"
      />
      <Input
        label={effectiveKind === "objection" ? "İtiraz metni" : "Savunma metni"}
        value={text}
        onChangeText={setText}
        multiline
        numberOfLines={4}
        maxLength={5000}
        placeholder="Tarafın beyanını yaz."
      />
      <View style={styles.row}>
        <Button label="Kaydı ekle" icon="add" variant="secondary" size="sm" onPress={submit} loading={pending} disabled={!party || text.trim().length < 3} />
      </View>
    </GroupCard>
  );
}

const styles = StyleSheet.create({
  hint: { ...type.caption, color: colors.textTertiary },
  row: { flexDirection: "row", gap: space.sm },
});
