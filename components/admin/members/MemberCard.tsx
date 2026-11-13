/**
 * MemberCard — üye listesi kartı ve üye rozetleri (web AdminUsers tablosu satırı).
 *
 * Anatomi: rol halkalı avatar (oyuncu camgöbeği, başkan mor, double altın) →
 * ad + @kullanıcı adı + il → rol rozeti, durum, premium ve bekleyen talep
 * hapları → bağlı oyuncu / takım satırı → hızlı iletişim (ara, WhatsApp,
 * e-posta). İletişim düğmeleri kartın basma alanından ayrıdır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { BadgeSpec } from "@/components/admin";
import { EntityCard } from "@/components/admin/team/ManageKit";
import { Avatar, Touchable, type Tone } from "@/components/ui";
import { intlPhone } from "@/lib/admin/format";
import { ACCOUNT_STATUS_LABELS, ACCOUNT_TYPE_LABELS, PROFILE_TYPE_LABELS, type AdminMember } from "@/lib/api/admin/users";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { openExternal } from "./contact";

export const STATUS_TONE: Record<string, Tone> = {
  active: "win",
  approved: "win",
  pending: "warn",
  suspended: "danger",
  rejected: "danger",
  inactive: "neutral",
};

export function isPremium(member: Pick<AdminMember, "memberships">): boolean {
  const now = Date.now();
  return (member.memberships ?? []).some((m) => m.expires_at && new Date(m.expires_at).getTime() > now);
}

export function memberBadges(member: AdminMember): BadgeSpec[] {
  const status = String(member.status ?? "").toLowerCase();
  return [
    { label: ACCOUNT_STATUS_LABELS[status] ?? (member.status || "—"), tone: STATUS_TONE[status] ?? "neutral" },
    { label: member.profileTypeLabel || PROFILE_TYPE_LABELS[member.profileType ?? ""] || ACCOUNT_TYPE_LABELS[member.accountType] || "Üye", tone: "info" },
    isPremium(member) ? { label: "Premium", tone: "brand", icon: "diamond-outline" } : null,
    member.pending?.premiumOrders ? { label: "Premium talebi", tone: "warn" } : null,
    member.pending?.accountRequests ? { label: `${member.pending.accountRequests} yetki talebi`, tone: "warn" } : null,
  ].filter(Boolean) as BadgeSpec[];
}

/** Rolün rengi: avatar halkası ve rol rozeti aynı tonu taşır. */
function roleTone(member: AdminMember): { tone: Tone; ring: string; icon: keyof typeof Ionicons.glyphMap } {
  const kind = member.profileType || member.accountType;
  if (kind === "double") return { tone: "warn", ring: colors.adminAccent, icon: "star" };
  if (kind === "takim_baskani" || kind === "team_manager") return { tone: "brand", ring: colors.brandAccent, icon: "shield-half" };
  if (kind === "oyuncu" || kind === "player") return { tone: "accent", ring: colors.accent, icon: "football" };
  return { tone: "neutral", ring: colors.border, icon: "person" };
}

/** Kart altındaki hızlı iletişim çipleri. */
export function ContactActions({ phone, email }: { phone?: string | null; email?: string | null }) {
  const wa = intlPhone(phone);
  const items = [
    phone ? { key: "tel", icon: "call" as const, label: "Ara", url: `tel:${phone}` } : null,
    wa ? { key: "wa", icon: "logo-whatsapp" as const, label: "WhatsApp", url: `https://wa.me/${wa}` } : null,
    email ? { key: "mail", icon: "mail" as const, label: "E-posta", url: `mailto:${email}` } : null,
  ].filter(Boolean) as { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; url: string }[];
  if (!items.length) return null;
  return (
    <View style={styles.contacts}>
      {items.map((it) => (
        <Touchable
          key={it.key}
          feedback="card"
          onPress={() => void openExternal(it.url)}
          style={styles.contact}
          accessibilityRole="button"
          accessibilityLabel={it.label}
        >
          <Ionicons name={it.icon} size={14} color={colors.brandAccent} />
          <Text style={styles.contactText} numberOfLines={1} {...textScale.dense}>
            {it.label}
          </Text>
        </Touchable>
      ))}
    </View>
  );
}

export const MemberCard = React.memo(function MemberCard({
  member,
  onPress,
  onLongPress,
}: {
  member: AdminMember;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const role = roleTone(member);
  const status = String(member.status ?? "").toLowerCase();
  const links = [member.player?.player_name ? `Oyuncu: ${member.player.player_name}` : null, member.managedTeam?.team_name ? `Takım: ${member.managedTeam.team_name}` : null]
    .filter(Boolean)
    .join(" · ");
  const roleLabel = member.profileTypeLabel || PROFILE_TYPE_LABELS[member.profileType ?? ""] || ACCOUNT_TYPE_LABELS[member.accountType] || "Üye";
  return (
    <EntityCard
      leading={
        <View style={[styles.ring, { borderColor: role.ring }]}>
          <Avatar name={member.fullName || member.username} image={member.player?.player_img ?? member.managedTeam?.logo ?? null} size={44} />
          <View style={[styles.roleDot, { backgroundColor: role.ring }]}>
            <Ionicons name={role.icon} size={10} color={colors.onDark} />
          </View>
        </View>
      }
      overline={[member.city, `#${member.id}`].filter(Boolean).join(" · ")}
      title={member.fullName || member.username || `Üye #${member.id}`}
      subtitle={`@${member.username}`}
      meta={links || null}
      pills={[
        { label: roleLabel, tone: role.tone, icon: role.icon },
        { label: ACCOUNT_STATUS_LABELS[status] ?? (member.status || "—"), tone: STATUS_TONE[status] ?? "neutral" },
        isPremium(member) && { label: "Premium", tone: "brand", icon: "diamond" },
        !!member.pending?.premiumOrders && { label: "Premium talebi", tone: "warn", icon: "hourglass" },
        !!member.pending?.accountRequests && { label: `${member.pending!.accountRequests} yetki talebi`, tone: "warn", icon: "hourglass" },
      ]}
      footer={<ContactActions phone={member.phone} email={member.email} />}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
});

const styles = StyleSheet.create({
  ring: { borderWidth: 2, borderRadius: radius.pill, padding: 1 },
  roleDot: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface1,
  },
  contacts: { flexDirection: "row", gap: space.sm, borderTopWidth: hairline, borderTopColor: colors.separator, paddingTop: space.sm },
  contact: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
  },
  contactText: { ...type.labelSm, color: colors.brandAccent },
});
