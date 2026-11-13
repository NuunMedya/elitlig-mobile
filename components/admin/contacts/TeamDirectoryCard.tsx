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

import { Avatar, Badge, TeamLogo, Touchable } from "@/components/ui";
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
  const r = team.record || { wins: 0, draws: 0, losses: 0 };
  const played = (r.wins || 0) + (r.draws || 0) + (r.losses || 0);
  const points = (r.wins || 0) * 3 + (r.draws || 0);
  const accountRatio = team.roster_count ? team.player_accounts / team.roster_count : 0;
  return (
    <Touchable onPress={onPress} style={[styles.card, !team.active ? styles.cardMuted : null]} feedback="card" accessibilityLabel={`${team.team_name} takım kartı`}>
      <View style={styles.top}>
        <TeamLogo name={team.team_name} logo={mediaUrl(team.logo)} size={48} />
        <View style={styles.main}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, styles.flex]} numberOfLines={2} {...textScale.dense}>
              {team.team_name}
            </Text>
            {!team.active ? <Badge label="Pasif" tone="neutral" size="xs" /> : null}
          </View>
          {meta ? (
            <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
              {meta}
            </Text>
          ) : null}
        </View>
        {played ? (
          <View style={styles.points} accessibilityLabel={`${points} puan`}>
            <Text style={styles.pointsValue} {...textScale.badge}>
              {points}
            </Text>
            <Text style={styles.pointsLabel} {...textScale.badge}>
              PUAN
            </Text>
          </View>
        ) : null}
      </View>

      {/* G-B-M oranı: tek şeritte üç renk; altında rakamlar. */}
      <View style={styles.recordWrap}>
        <View style={styles.recordBar}>
          {played ? (
            <>
              <View style={[styles.seg, { flex: r.wins || 0, backgroundColor: colors.win }]} />
              <View style={[styles.seg, { flex: r.draws || 0, backgroundColor: colors.draw }]} />
              <View style={[styles.seg, { flex: r.losses || 0, backgroundColor: colors.loss }]} />
            </>
          ) : null}
        </View>
        <RecordPills record={r} />
      </View>

      <View style={styles.cells}>
        <Cell icon="football-outline" value={String(team.total_matches)} label="Maç" />
        <Cell icon="person-circle-outline" value={`${team.player_accounts}/${team.roster_count}`} label="Hesaplı" ratio={accountRatio} />
        <Cell icon="call-outline" value={String(team.contact_count)} label="Telefonlu" warn={!team.contact_count} />
      </View>

      {lead ? (
        <View style={styles.captain}>
          <Avatar name={lead.name} size={30} />
          <View style={styles.flex}>
            <Text style={styles.captainName} numberOfLines={1} {...textScale.dense}>
              {lead.name}
              {team.captains.length > 1 ? ` +${team.captains.length - 1}` : ""}
            </Text>
            <Text style={styles.captainRole} {...textScale.dense}>
              Takım başkanı
            </Text>
          </View>
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
        <View style={styles.captain}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.warn} />
          <Text style={styles.noCaptain} {...textScale.dense}>
            Başkan hesabı yok
          </Text>
        </View>
      )}
    </Touchable>
  );
});

function Cell({ icon, value, label, ratio, warn }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; ratio?: number; warn?: boolean }) {
  return (
    <View style={styles.cell} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.cellHead}>
        <Ionicons name={icon} size={11} color={warn ? colors.warn : colors.textTertiary} />
        <Text style={styles.cellLabel} numberOfLines={1} {...textScale.badge}>
          {label.toLocaleUpperCase("tr-TR")}
        </Text>
      </View>
      <Text style={[styles.cellValue, warn ? { color: colors.warn } : null]} {...textScale.badge}>
        {value}
      </Text>
      {ratio != null ? (
        <View style={styles.cellBar}>
          <View style={[styles.cellBarFill, { width: `${Math.round(Math.min(1, ratio) * 100)}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    gap: space.m,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  cardMuted: { opacity: 0.75 },
  flex: { flex: 1, minWidth: 0 },
  top: { flexDirection: "row", gap: space.md, alignItems: "center" },
  main: { flex: 1, gap: space.xxs, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  name: { ...type.h2, color: colors.textPrimary },
  points: {
    alignItems: "center",
    minWidth: 48,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
  },
  pointsValue: { ...type.scoreMd, color: colors.brandAccent },
  pointsLabel: { ...type.nano, color: colors.textTertiary },
  recordWrap: { flexDirection: "row", alignItems: "center", gap: space.sm },
  recordBar: { flex: 1, height: 6, borderRadius: 3, flexDirection: "row", overflow: "hidden", backgroundColor: colors.surface3, gap: 2 },
  seg: { height: 6 },
  cells: { flexDirection: "row", gap: space.xs },
  cell: { flex: 1, gap: space.xxs, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  cellHead: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  cellLabel: { ...type.nano, color: colors.textTertiary },
  cellValue: { ...type.tableNumStrong, color: colors.textPrimary },
  cellBar: { height: 3, borderRadius: 2, backgroundColor: colors.surface3, overflow: "hidden" },
  cellBarFill: { height: 3, borderRadius: 2, backgroundColor: colors.brandAccent },
  meta: { ...type.bodySm, color: colors.textSecondary },
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
  captainName: { ...type.h4, color: colors.textPrimary },
  captainRole: { ...type.caption, color: colors.textTertiary },
  noCaptain: { ...type.caption, color: colors.warn, flex: 1 },
});
