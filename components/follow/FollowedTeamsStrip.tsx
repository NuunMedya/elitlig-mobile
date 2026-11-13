/**
 * FollowedTeamsStrip — Takip sekmesinin "Takımlarım" yatay şeridi.
 *
 * NE: takip edilen her takım bir karo: amblem + zil (o takibin bildirim
 * türleri), ad, son beş maç formu (G/B/M çipleri) ve sıradaki maça kalan süre
 * ("3 gün", "5 sa", "Canlı"). Karoya dokunmak takım sayfasını açar; şeridin
 * sonundaki kesik çizgili karo "Takip et" — takım arama ekranına gider.
 *
 * NEDEN FORM + SAYAÇ: kullanıcı takımlarına baktığında iki şeyi merak eder —
 * "nasıl gidiyoruz" ve "ne zaman oynuyoruz". İkisi karoda; ayrıntı için takım
 * sayfası bir dokunuş uzakta.
 *
 * VERİ: karolar hesaplanmış özetleri (`form`, `countdown`) dışarıdan alır;
 * maç sorguları ekranda (`/maclar?team_id=`) tek yerde yapılır. Özet henüz
 * yoksa form satırı iskelet çizer, "yaklaşan maç yok" ise sayaç yazmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { FollowBell } from "@/components/FollowControls";
import { LinearGradient } from "expo-linear-gradient";
import { FormChips, IconTile, Skeleton, TeamLogo, Touchable, type FormResult } from "@/components/ui";
import type { FavoriteTeam } from "@/providers/FavoriteProvider";
import { colors, elevate, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

const TILE_W = 148;
/** elevate(1) gölgesi ScrollView kenarında kırpılmasın diye dikey pay. */
const SHADOW_TOP = space.xs;
const SHADOW_BOTTOM = space.lg;

export interface TeamStripSummary {
  form: FormResult[];
  /** Sıradaki maça kalan süre; maç yoksa boş. */
  countdown: string;
  live: boolean;
}

export interface FollowedTeamsStripProps {
  teams: FavoriteTeam[];
  /** Takım id → özet. Yoksa yükleniyor sayılır. */
  summaries: Map<number, TeamStripSummary>;
  /** Takım id → çözülmüş logo (takip kaydında logo yoksa). */
  logoFor: (team: FavoriteTeam) => string | null;
  onOpenTeam: (teamId: number) => void;
  onAdd: () => void;
}

export const FollowedTeamsStrip = React.memo(function FollowedTeamsStrip({
  teams,
  summaries,
  logoFor,
  onOpenTeam,
  onAdd,
}: FollowedTeamsStripProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.strip}
    >
      {teams.map((team) => (
        <TeamTile
          key={team.id}
          team={team}
          logo={team.logo ?? logoFor(team)}
          summary={summaries.get(team.id)}
          onOpen={onOpenTeam}
        />
      ))}
      <AddTile onPress={onAdd} />
    </ScrollView>
  );
});

const TeamTile = React.memo(function TeamTile({
  team,
  logo,
  summary,
  onOpen,
}: {
  team: FavoriteTeam;
  logo: string | null;
  summary?: TeamStripSummary;
  onOpen: (teamId: number) => void;
}) {
  const handle = useCallback(() => onOpen(team.id), [onOpen, team.id]);
  const target = useMemo(() => ({ type: "team" as const, id: team.id, name: team.name, logo }), [team.id, team.name, logo]);

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handle}
      accessibilityRole="button"
      accessibilityLabel={`${team.name} takım sayfası`}
      testID={`followed-team-${team.id}`}
      style={[styles.tile, summary?.live ? styles.tileLive : null]}
    >
      {/* Üst kenarda imza ışığı — karo "takip ettiğim" kimliğini taşır. */}
      <LinearGradient
        pointerEvents="none"
        colors={summary?.live ? colors.gradientLive : colors.gradientSignature}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.topLight}
      />
      <View style={styles.tileTop}>
        <View style={styles.crestRing}>
          <TeamLogo name={team.name} logo={logo} size={40} />
        </View>
        <FollowBell target={target} size={15} />
      </View>
      <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
        {team.name}
      </Text>
      <View style={styles.formRow}>
        {summary ? (
          summary.form.length ? (
            <FormChips form={summary.form} size="xs" />
          ) : (
            <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
              Form yok
            </Text>
          )
        ) : (
          <Skeleton width={78} height={13} />
        )}
      </View>
      <View style={[styles.countdown, summary?.live ? styles.countdownLiveBox : null]}>
        {summary?.live ? <View style={styles.liveDot} /> : <Ionicons name="time-outline" size={12} color={colors.brandAccent} />}
        <Text
          style={[styles.countdownText, summary?.live ? styles.countdownLive : null]}
          numberOfLines={1}
          {...textScale.dense}
        >
          {summary ? summary.countdown || "Fikstür yok" : " "}
        </Text>
      </View>
    </Touchable>
  );
});

const AddTile = React.memo(function AddTile({ onPress }: { onPress: () => void }) {
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Takım bul ve takip et"
      testID="followed-team-add"
      style={[styles.tile, styles.addTile]}
    >
      <IconTile icon="add" tone="signature" size={44} />
      <Text style={[styles.name, styles.addLabel]} numberOfLines={1} {...textScale.dense}>
        Takım ekle
      </Text>
      <Text style={styles.addHint} numberOfLines={2} {...textScale.dense}>
        Ara, yıldızla takip et
      </Text>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  scroller: {
    marginTop: -SHADOW_TOP,
    marginBottom: -SHADOW_BOTTOM,
  },
  strip: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: SHADOW_TOP,
    paddingBottom: SHADOW_BOTTOM,
    gap: space.sm,
  },
  tile: {
    width: TILE_W,
    gap: space.sm,
    padding: space.md,
    paddingTop: space.md + 2,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevate(1),
  },
  tileLive: {
    borderColor: colors.live,
  },
  topLight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  tileTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  crestRing: {
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  name: {
    ...type.h3,
    color: colors.textPrimary,
    minHeight: type.h3.lineHeight * 2,
  },
  formRow: {
    minHeight: 18,
    justifyContent: "center",
  },
  muted: {
    ...type.caption,
    color: colors.textTertiary,
  },
  countdown: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs + 1,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    maxWidth: "100%",
  },
  countdownLiveBox: {
    backgroundColor: colors.liveDim,
  },
  countdownText: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.brandAccent,
    flexShrink: 1,
  },
  countdownLive: {
    color: colors.live,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
  },
  addTile: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  addLabel: {
    color: colors.brandAccent,
    textAlign: "center",
    minHeight: 0,
    marginTop: space.xs,
  },
  addHint: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
});
