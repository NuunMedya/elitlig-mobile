/**
 * MemberCard — üye listesi kartı ve üye rozetleri (web AdminUsers tablosu satırı).
 */

import React from "react";

import { RecordCard, type BadgeSpec } from "@/components/admin";
import type { Tone } from "@/components/ui";
import { ACCOUNT_STATUS_LABELS, ACCOUNT_TYPE_LABELS, PROFILE_TYPE_LABELS, type AdminMember } from "@/lib/api/admin/users";

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

export const MemberCard = React.memo(function MemberCard({
  member,
  onPress,
  onLongPress,
}: {
  member: AdminMember;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const links = [member.player?.player_name ? `Oyuncu: ${member.player.player_name}` : null, member.managedTeam?.team_name ? `Takım: ${member.managedTeam.team_name}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <RecordCard
      title={member.fullName || member.username || `Üye #${member.id}`}
      subtitle={[`@${member.username}`, member.city, member.phone].filter(Boolean).join(" · ")}
      meta={links || null}
      avatar={{ name: member.fullName || member.username, image: member.player?.player_img ?? member.managedTeam?.logo ?? null }}
      badges={memberBadges(member)}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
});
