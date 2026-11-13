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

import Ionicons from "@expo/vector-icons/Ionicons";

import { DateField } from "@/components/admin";
import { GroupCard } from "@/components/admin/team/ManageKit";
import { Badge, Button, GradientBar, useToast } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { PLAN_LABELS, whatsappUrl, type PlanMembership } from "@/lib/api/admin/users";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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

  /* Kalan süre çubuğu: başlangıç → bitiş aralığında bugünün yeri. */
  const startMs = current?.startedAt ? new Date(current.startedAt).getTime() : null;
  const endMs = current?.expiresAt ? new Date(current.expiresAt).getTime() : null;
  const left = startMs && endMs && endMs > startMs ? Math.max(0, Math.min(1, (endMs - Date.now()) / (endMs - startMs))) : null;

  return (
    <GroupCard title={`${PLAN_LABELS[plan] ?? plan} planı`} icon={plan === "team" ? "shield-half" : "football"} tone={premium ? "violet" : "neutral"}>
      <View style={styles.planHead}>
        <View style={[styles.planBadge, premium ? styles.planBadgeOn : null]}>
          <Ionicons name={premium ? "diamond" : "diamond-outline"} size={16} color={premium ? colors.textOnBrand : colors.textTertiary} />
          <Text style={[styles.planBadgeText, premium ? styles.planBadgeTextOn : null]} {...textScale.badge}>
            {premium ? "PREMIUM" : current?.expired ? "SÜRESİ DOLDU" : "FREE"}
          </Text>
        </View>
        {current?.daysLeft != null && premium ? (
          <Text style={styles.days} {...textScale.badge}>
            {current.daysLeft}
            <Text style={styles.daysUnit}> gün kaldı</Text>
          </Text>
        ) : null}
      </View>
      {left != null ? (
        <View style={styles.span}>
          <GradientBar value={left} height={6} />
          <View style={styles.spanRow}>
            <Text style={styles.spanText} {...textScale.badge}>
              {formatDate(current!.startedAt)}
            </Text>
            <Text style={styles.spanText} {...textScale.badge}>
              {formatDate(current!.expiresAt)}
            </Text>
          </View>
        </View>
      ) : null}
      {current?.available === false || current?.pendingOrder ? (
        <View style={styles.row}>
          {current?.available === false ? <Badge label="Bu hesap için uygun değil" tone="neutral" size="xs" /> : null}
          {current?.pendingOrder ? <Badge label="Onay bekleyen sipariş" tone="warn" icon="hourglass" size="xs" /> : null}
        </View>
      ) : null}
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
          <Button
            label={premium ? "Süre uzatmayı onaya gönder" : "Premium'u onaya gönder"}
            icon="diamond-outline"
            onPress={() => start && end && onPremium(iso(start), iso(end))}
            disabled={busy || !start || !end || (end ?? "") < (start ?? "")}
            loading={busy}
            fullWidth
          />
          {premium ? <Button label="Free yap" variant="ghost" size="sm" onPress={onFree} disabled={busy} fullWidth /> : null}
        </>
      ) : null}
    </GroupCard>
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
      <Text style={styles.codeLabel} {...textScale.badge}>
        TEK KULLANIMLIK KOD
      </Text>
      <View style={styles.digits} accessible accessibilityLabel={`Kod ${code.split("").join(" ")}`}>
        {code.split("").map((ch, i) => (
          <View key={`${i}-${ch}`} style={styles.digit}>
            <Text style={styles.digitText} selectable {...textScale.badge}>
              {ch}
            </Text>
          </View>
        ))}
      </View>
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
  planHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  planBadgeOn: { backgroundColor: colors.brand },
  planBadgeText: { ...type.labelSm, color: colors.textTertiary },
  planBadgeTextOn: { color: colors.textOnBrand },
  days: { ...type.scoreSm, color: colors.textPrimary },
  daysUnit: { ...type.caption, color: colors.textTertiary },
  span: { gap: space.xs },
  spanRow: { flexDirection: "row", justifyContent: "space-between" },
  spanText: { ...type.numSm, color: colors.textTertiary },
  code: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.brandDim, borderWidth: hairline, borderColor: colors.brandBorder, gap: space.md },
  codeLabel: { ...type.overline, color: colors.brandAccent },
  digits: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
  digit: {
    minWidth: 36,
    height: 46,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  digitText: { ...type.scoreMd, color: colors.textPrimary },
  codeMeta: { ...type.caption, color: colors.textSecondary },
});
