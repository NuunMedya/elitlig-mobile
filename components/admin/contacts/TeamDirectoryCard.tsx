/**
 * TeamDirectoryCard — Rehber → Takımlar listesinin satırı.
 *
 * Takım adı öne çıkar (büyük, iki satıra kadar); altında il · lig · sezon,
 * G-B-M ve sayaçlar (maç, hesaplı oyuncu / kadro, telefonu olan kişi).
 * En altta ilk başkan ve tek dokunuşla ara / WhatsApp / mesaj.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Badge, TeamLogo, Touchable } from "@/components/ui";
import type { DirectoryTeam, TeamRecord } from "@/lib/api/admin/contacts";
import { mediaUrl } from "@/lib/format";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { ContactButtons } from "./ContactButtons";
import type { ContactActions } from "./useContactActions";

export function RecordPills({ record }: { record: TeamRecord }) {
  return (
    <View style={styles.record} accessibilityLabel={`${record.wins} galibiyet, ${record.draws} beraberlik, ${record.losses} mağlubiyet`}>
      <Text style={[styles.pill, styles.win]} {...textScale.badge}>{`${record.wins || 0}G`}</Text>
      <Text style={[styles.pill, styles.draw]} {...textScale.badge}>{`${record.draws || 0}B`}</Text>
      <Text style={[styles.pill, styles.loss]} {...textScale.badge}>{`${record.losses || 0}M`}</Text>
    </View>
  );
}

export const TeamDirectoryCard = React.memo(function TeamDirectoryCard({
  team,
  actions,
  onPress,
}: {
  team: DirectoryTeam;
  actions: ContactActions;
  onPress: () => void;
}) {
  const lead = team.captains[0];
  const meta = [team.city, team.league, team.season].filter(Boolean).join(" · ");
  return (
    <Touchable onPress={onPress} style={styles.card} feedback="card" accessibilityLabel={`${team.team_name} takım kartı`}>
      <View style={styles.top}>
        <TeamLogo name={team.team_name} logo={mediaUrl(team.logo)} size={48} />
        <View style={styles.main}>
          <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
            {team.team_name}
          </Text>
          {meta ? (
            <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
              {meta}
            </Text>
          ) : null}
          <View style={styles.stats}>
            <RecordPills record={team.record} />
            <Stat icon="football-outline" value={team.total_matches} label="maç" />
            <Stat icon="person-circle-outline" value={`${team.player_accounts}/${team.roster_count}`} label="hesaplı oyuncu" />
            <Stat icon="call-outline" value={team.contact_count} label="telefonu olan kişi" />
            {!team.active ? <Badge label="Pasif" tone="neutral" size="xs" /> : null}
          </View>
        </View>
      </View>
      {lead ? (
        <View style={styles.captain}>
          <Ionicons name="shield-half-outline" size={14} color={colors.brandAccent} />
          <Text style={styles.captainName} numberOfLines={1} {...textScale.dense}>
            {lead.name}
            {team.captains.length > 1 ? ` +${team.captains.length - 1}` : ""}
          </Text>
          <ContactButtons
            name={lead.name}
            phone={lead.phone}
            email={lead.email}
            userId={lead.id}
            actions={actions}
            only={["tel", "wa", "chat"]}
          />
        </View>
      ) : (
        <Text style={styles.noCaptain} {...textScale.dense}>
          Başkan hesabı yok
        </Text>
      )}
    </Touchable>
  );
});

function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string | number; label: string }) {
  return (
    <View style={styles.stat} accessibilityLabel={`${value} ${label}`}>
      <Ionicons name={icon} size={12} color={colors.textTertiary} />
      <Text style={styles.statText} {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  top: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  main: { flex: 1, gap: space.xxs },
  name: { ...type.h2, color: colors.textPrimary },
  meta: { ...type.bodySm, color: colors.textSecondary },
  stats: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, marginTop: space.xxs },
  stat: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  statText: { ...type.numSm, color: colors.textSecondary },
  record: { flexDirection: "row", gap: space.xxs },
  pill: { ...type.numSmStrong, paddingHorizontal: space.xs, borderRadius: radius.xs, overflow: "hidden" },
  win: { color: colors.win, backgroundColor: colors.winDim },
  draw: { color: colors.draw, backgroundColor: colors.drawDim },
  loss: { color: colors.loss, backgroundColor: colors.lossDim },
  captain: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  captainName: { ...type.label, color: colors.textPrimary, flex: 1 },
  noCaptain: { ...type.caption, color: colors.textTertiary, paddingTop: space.xs },
});
