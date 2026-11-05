/**
 * Personele yönetim paneli hesabı açma — tek kişi ve toplu.
 *
 * Web: pages/management/staff/StaffAccountForm.js. Kullanıcı adı ad soyaddan
 * önerilir, şifre üretilir; yönetici değiştirebilir. Şifre sunucuda özet
 * olarak tutulduğu için yalnız açılış anında görünür: bilgiler panoya
 * kopyalanır ya da paylaşılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useMutation } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";

import { FormSheet, SelectField, ToggleField, type FieldDef } from "@/components/admin";
import { BottomSheet, Button, Input, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { ROLE_LABELS } from "@/lib/api/admin";
import {
  createStaffAccount,
  generatePassword,
  isNationwideRole,
  passwordProblem,
  pickDefaultRole,
  suggestUsername,
  USERNAME_PATTERN,
  type ManagementRole,
  type StaffMember,
} from "@/lib/api/admin/staff";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

interface Credential {
  fullName: string;
  username: string;
  password: string;
  role: string;
}

const roleText = (roles: ManagementRole[], key: string) => roles.find((r) => r.key === key)?.label || ROLE_LABELS[key] || key;

const credentialsText = (rows: Credential[], roles: ManagementRole[]) =>
  rows.map((r) => `${r.fullName} — kullanıcı adı: ${r.username} · şifre: ${r.password} · rol: ${roleText(roles, r.role)}`).join("\n");

function validate(v: { username: string; password: string; role: string; city: string }, needsCity: boolean): string {
  if (!USERNAME_PATTERN.test(v.username || "")) return "Kullanıcı adı 3-40 karakter olmalı; harf, rakam, . _ - kullanılabilir.";
  const problem = passwordProblem(v.password);
  if (problem) return problem;
  if (!v.role) return "Rol seç.";
  if (needsCity && !v.city) return "Bu rol il bazlı çalışır; il seç.";
  return "";
}

/** Açılan hesabın bilgileri: kopyala / paylaş. */
export function CredentialsCard({ rows, roles }: { rows: Credential[]; roles: ManagementRole[] }) {
  const toast = useToast();
  const text = credentialsText(rows, roles);
  return (
    <View style={styles.creds}>
      <View style={styles.credsHead}>
        <Ionicons name="checkmark-circle" size={18} color={colors.win} />
        <Text style={styles.credsTitle} {...textScale.dense}>
          {rows.length > 1 ? `${rows.length} hesap oluşturuldu` : "Hesap oluşturuldu"}
        </Text>
      </View>
      {rows.map((r) => (
        <Text key={r.username} style={styles.credsLine} selectable {...textScale.long}>
          {rows.length > 1 ? `${r.fullName}: ` : ""}
          {r.username} · {r.password} · {roleText(roles, r.role)}
        </Text>
      ))}
      <Text style={styles.hint} {...textScale.long}>
        Şifre yalnız şimdi görünür. Kişiye iletmek için kopyala ya da paylaş.
      </Text>
      <View style={styles.row}>
        <Button
          label="Kopyala"
          icon="copy-outline"
          size="sm"
          variant="secondary"
          onPress={async () => {
            await Clipboard.setStringAsync(text);
            toast.show({ message: "Hesap bilgileri kopyalandı.", tone: "success" });
          }}
        />
        <Button label="Paylaş" icon="share-outline" size="sm" variant="secondary" onPress={() => void Share.share({ message: text })} />
      </View>
    </View>
  );
}

/** Tek personel için hesap açma alt sayfası. */
export function StaffAccountSheet({
  visible,
  onClose,
  person,
  roles,
  cities,
  nationwide,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  person: StaffMember;
  roles: ManagementRole[];
  cities: { id: number; label: string }[];
  nationwide: boolean;
  onCreated: (cred: Credential) => void;
}) {
  const assignable = roles.filter((r) => r.assignable !== false);
  const fields: FieldDef[] = [
    { key: "username", label: "Kullanıcı adı", kind: "text", required: true },
    { key: "password", label: "Şifre", kind: "text", required: true, hint: "En az 8 karakter; bir harf ve bir rakam." },
    { key: "role", label: "Rol", kind: "select", required: true, options: assignable.map((r) => ({ value: r.key, label: r.label || roleText(roles, r.key) })) },
    {
      key: "city",
      label: "İl",
      kind: "select",
      options: cities.map((c) => ({ value: c.label, label: c.label })),
      hidden: (v) => !nationwide || isNationwideRole(roles, String(v.role ?? "")),
    },
  ];
  const initial = useMemo(
    () => ({ username: suggestUsername(person.fullName), password: generatePassword(), role: pickDefaultRole(roles), city: person.city || "" }),
    // Sayfa her açılışta yeni şifre üretsin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, person.id]
  );

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Yönetim hesabı aç"
      submitLabel="Hesabı oluştur"
      intro="Hesap açılınca kişi panele kendi kullanıcı adı ve şifresiyle girer; görevlendirildiği maçlar Yapılacaklar listesine kart olarak düşer."
      fields={fields}
      initial={initial}
      onSubmit={async (v) => {
        const values = { username: String(v.username ?? "").trim(), password: String(v.password ?? ""), role: String(v.role ?? ""), city: String(v.city ?? "") };
        const needsCity = nationwide && !isNationwideRole(roles, values.role);
        const problem = validate(values, needsCity);
        if (problem) throw new Error(problem);
        const body: { username: string; password: string; role: string; city?: string } = {
          username: values.username,
          password: values.password,
          role: values.role,
        };
        // Türkiye geneli yönetici il seçer; Türkiye geneli rolde il boş gider.
        if (nationwide) body.city = needsCity ? values.city : "";
        await createStaffAccount(person.id, body);
        onCreated({ fullName: person.fullName, username: values.username, password: values.password, role: values.role });
      }}
    />
  );
}

interface BulkRow {
  id: number;
  fullName: string;
  selected: boolean;
  username: string;
  password: string;
  state: "idle" | "saving" | "done" | "error";
  error: string;
}

/** Hesabı olmayan aktif personel için toplu hesap açma. */
export function StaffAccountsBulkSheet({
  visible,
  onClose,
  people,
  roles,
  cities,
  nationwide,
}: {
  visible: boolean;
  onClose: () => void;
  people: StaffMember[];
  roles: ManagementRole[];
  cities: { id: number; label: string }[];
  nationwide: boolean;
}) {
  const [role, setRole] = useState(() => pickDefaultRole(roles));
  const [city, setCity] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkRow[]>(() => {
    const taken = new Set<string>();
    return people.map((p) => {
      const username = suggestUsername(p.fullName, taken);
      taken.add(username);
      return { id: p.id, fullName: p.fullName, selected: true, username, password: generatePassword(), state: "idle", error: "" };
    });
  });
  const [done, setDone] = useState<Credential[]>([]);
  const cityOf = (id: number) => people.find((p) => p.id === id)?.city || city || "";
  const needsCity = nationwide && !isNationwideRole(roles, role);

  const run = useMutation({
    mutationFn: async () => {
      const created: Credential[] = [];
      for (const row of rows) {
        if (!row.selected || row.state === "done") continue;
        const values = { username: row.username.trim(), password: row.password, role, city: cityOf(row.id) };
        const problem = validate(values, needsCity);
        if (problem) {
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, state: "error", error: problem } : r)));
          continue;
        }
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, state: "saving", error: "" } : r)));
        try {
          // eslint-disable-next-line no-await-in-loop
          await createStaffAccount(row.id, { ...values, city: nationwide ? (needsCity ? values.city : "") : undefined });
          created.push({ fullName: row.fullName, username: values.username, password: values.password, role });
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, state: "done" } : r)));
        } catch (error) {
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, state: "error", error: errorText(error) } : r)));
        }
      }
      return created;
    },
    onSuccess: (created) => setDone((prev) => [...prev, ...created]),
  });

  const selected = rows.filter((r) => r.selected && r.state !== "done").length;
  const assignable = roles.filter((r) => r.assignable !== false);

  return (
    <BottomSheet
      visible={visible}
      onClose={run.isPending ? () => undefined : onClose}
      title="Toplu hesap oluştur"
      snap="full"
      footer={
        <Button
          label={selected ? `Hesapları oluştur (${selected})` : "Seçili kişi yok"}
          onPress={() => run.mutate()}
          loading={run.isPending}
          disabled={!selected}
          haptic="success"
        />
      }
    >
      <View style={styles.bulk}>
        {done.length ? <CredentialsCard rows={done} roles={roles} /> : null}
        <SelectField<string>
          label="Rol (hepsi için)"
          value={role}
          options={assignable.map((r) => ({ value: r.key, label: r.label || roleText(roles, r.key) }))}
          onChange={(v) => setRole(v ?? "")}
        />
        {needsCity ? (
          <SelectField<string>
            label="İl (ili belirtilmemiş kişiler için)"
            value={city}
            options={cities.map((c) => ({ value: c.label, label: c.label }))}
            onChange={setCity}
            clearable
          />
        ) : null}
        {rows.map((row) => (
          <View key={row.id} style={styles.bulkRow}>
            <ToggleField
              label={row.fullName}
              hint={row.state === "done" ? "Hesap açıldı" : row.state === "saving" ? "Oluşturuluyor" : row.error || undefined}
              value={row.selected}
              disabled={row.state === "done"}
              onChange={(v) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, selected: v } : r)))}
            />
            {row.selected && row.state !== "done" ? (
              <View style={styles.row}>
                <Input
                  containerStyle={styles.flex}
                  size="sm"
                  label="Kullanıcı adı"
                  value={row.username}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(t) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, username: t } : r)))}
                />
                <Input
                  containerStyle={styles.flex}
                  size="sm"
                  label="Şifre"
                  value={row.password}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(t) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, password: t } : r)))}
                />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bulk: { gap: space.md },
  bulkRow: { gap: space.sm, paddingBottom: space.md, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  row: { flexDirection: "row", gap: space.sm, alignItems: "flex-end" },
  flex: { flex: 1 },
  creds: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.winDim,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  credsHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  credsTitle: { ...type.h4, color: colors.textPrimary },
  credsLine: { ...type.bodySm, color: colors.textPrimary },
  hint: { ...type.caption, color: colors.textSecondary },
});
