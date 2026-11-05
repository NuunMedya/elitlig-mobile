/**
 * Üye ayrıntısı bölümleri (web AdminUsers.js çekmecesi).
 *
 *   MembershipPlanCard  oyuncu / takım planı: durum, başlangıç-bitiş, "Free yap",
 *                       "Premium'u onaya gönder" (PUT /memberships/:plan)
 *   ResetCodeCard       tek kullanımlık şifre sıfırlama kodu: kopyala,
 *                       WhatsApp / SMS ile ilet
 */

import * as Clipboard from "expo-clipboard";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DateField, InfoLine, Panel } from "@/components/admin";
import { Badge, Button, useToast } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { PLAN_LABELS, whatsappUrl, type PlanMembership } from "@/lib/api/admin/users";
import { colors, radius, space, textScale, type } from "@/theme";

import { openExternal } from "./contact";

const day = (value?: string | null) => (value ? String(value).slice(0, 10) : null);

export function MembershipPlanCard({
  plan,
  current,
  canEdit,
  busy,
  onFree,
  onPremium,
}: {
  plan: "player" | "team";
  current?: PlanMembership;
  canEdit: boolean;
  busy: boolean;
  onFree: () => void;
  onPremium: (startedAt: string, expiresAt: string) => void;
}) {
  const premium = Boolean(current?.isPremium);
  const [start, setStart] = useState<string | null>(day(current?.startedAt));
  const [end, setEnd] = useState<string | null>(day(current?.expiresAt));
  useEffect(() => {
    setStart(day(current?.startedAt));
    setEnd(day(current?.expiresAt));
  }, [current?.startedAt, current?.expiresAt]);

  const iso = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toISOString();

  return (
    <Panel title={`${PLAN_LABELS[plan] ?? plan} planı`}>
      <View style={styles.row}>
        <Badge label={premium ? "Premium" : current?.expired ? "Süresi doldu" : "Free"} tone={premium ? "brand" : "neutral"} size="xs" />
        {current?.available === false ? <Badge label="Bu hesap için uygun değil" tone="neutral" size="xs" /> : null}
        {current?.pendingOrder ? <Badge label="Onay bekleyen sipariş" tone="warn" size="xs" /> : null}
      </View>
      {current?.startedAt ? <InfoLine label="Başlangıç" value={formatDate(current.startedAt)} /> : null}
      {current?.expiresAt ? <InfoLine label="Bitiş" value={`${formatDate(current.expiresAt)}${current.daysLeft != null ? ` · ${current.daysLeft} gün` : ""}`} /> : null}
      {canEdit ? (
        <>
          <View style={styles.dates}>
            <View style={styles.grow}>
              <DateField label="Başlangıç" value={start} onChange={setStart} />
            </View>
            <View style={styles.grow}>
              <DateField label="Bitiş" value={end} onChange={setEnd} />
            </View>
          </View>
          <View style={styles.row}>
            <Button label="Free yap" variant="secondary" size="sm" onPress={onFree} disabled={busy || !premium} />
            <Button
              label={premium ? "Süre uzatmayı onaya gönder" : "Premium'u onaya gönder"}
              size="sm"
              onPress={() => start && end && onPremium(iso(start), iso(end))}
              disabled={busy || !start || !end || (end ?? "") < (start ?? "")}
              loading={busy}
              style={styles.grow}
            />
          </View>
        </>
      ) : null}
    </Panel>
  );
}

export function ResetCodeCard({
  code,
  expiresAt,
  username,
  phone,
}: {
  code: string;
  expiresAt: string;
  username?: string | null;
  phone?: string | null;
}) {
  const toast = useToast();
  const message = `ElitLig şifre sıfırlama kodun: ${code}\nGiriş ekranında "Şifremi unuttum" adımında${username ? ` @${username} kullanıcı adınla` : ""} kullan. Kod ${formatDateTime(expiresAt)} tarihine kadar geçerlidir.`;
  const wa = whatsappUrl(phone, message);
  return (
    <View style={styles.code}>
      <Text style={styles.codeText} selectable {...textScale.badge}>
        {code}
      </Text>
      <Text style={styles.codeMeta} {...textScale.dense}>
        Geçerlilik: {formatDateTime(expiresAt)} · Bu kod bir daha gösterilmeyecek.
      </Text>
      <View style={styles.row}>
        <Button
          label="Kopyala"
          icon="copy-outline"
          size="sm"
          variant="secondary"
          onPress={async () => {
            await Clipboard.setStringAsync(code);
            toast.show({ message: "Kod kopyalandı.", tone: "success" });
          }}
        />
        {wa ? <Button label="WhatsApp" icon="logo-whatsapp" size="sm" variant="secondary" onPress={() => void openExternal(wa)} /> : null}
        {phone ? (
          <Button label="SMS" icon="chatbubble-outline" size="sm" variant="secondary" onPress={() => void openExternal(`sms:${phone}?body=${encodeURIComponent(message)}`)} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap", alignItems: "center" },
  dates: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  code: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.brandDim, gap: space.sm, alignItems: "flex-start" },
  codeText: { ...type.scoreLg, color: colors.textPrimary, letterSpacing: 4 },
  codeMeta: { ...type.caption, color: colors.textSecondary },
});
