/**
 * MAÇ SAYFASI — MEDYA / YAYIN. Özet sekmesinde maçın tüm yayın içerikleri tek
 * düzende, durumuna göre:
 *
 *   CANLI  — en üstte canlı yayın kartı (CANLI rozeti); YouTube uygulamasında
 *            (yoksa uygulama içi tarayıcıda) açılır. Gol klipleri geldikçe şerit.
 *   BİTTİ  — maç özeti → maçın yayın kaydı → maçın golü / kurtarışı →
 *            gol videoları → röportaj.
 *
 * Veri yoksa ilgili kart hiç çizilmez (uydurma yer tutucu yok). YouTube
 * bağlantıları uygulamanın her yerinde olduğu gibi dışarıda açılır; doğrudan
 * videolar (MP4) VideoCard ile yerinde oynar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { MatchGoalClips, useMatchGoalClips, type ClipTeams } from "@/components/live/MatchGoalClips";
import { MatchHighlight } from "@/components/live/MatchHighlight";
import { VideoCard } from "@/components/live/VideoCard";
import { SectionHeader, TeamLogo, Touchable } from "@/components/ui";
import { openLink, openYouTube } from "@/lib/links";
import { RIG } from "@/lib/live/rig";
import { broadcastOf, interviewOf, readAwardMoments, type AwardMoment, type BroadcastSource } from "@/lib/matchMedia";
import type { ApiMatch, MatchState } from "@/lib/types";
import { colors, fonts, radius, space, textScale, type } from "@/theme";

import { partStyles } from "./parts";
import type { NameOf } from "./shared";

const MOMENT_LABEL: Record<AwardMoment["key"], string> = { best_goal: "Maçın golü", best_save: "Maçın kurtarışı" };

/* ══════════════════════════════════════════════════════════════════════════
   Canlı yayın / yayın kaydı
   ══════════════════════════════════════════════════════════════════════════ */

export function useBroadcast(match: ApiMatch): BroadcastSource | null {
  return useMemo(() => broadcastOf(match as unknown as Record<string, unknown>), [match]);
}

export const BroadcastCard = memo(function BroadcastCard({
  source,
  live,
  title,
}: {
  source: BroadcastSource;
  live: boolean;
  /** Kartın alt satırı, ör. "Kartal 2–1 Şahin". */
  title?: string | null;
}) {
  const heading = live ? "Canlı yayın" : "Maçın yayın kaydı";
  if (source.kind === "file") {
    return (
      <VideoCard
        title={heading}
        url={source.url}
        cta={live ? "Canlı izle" : "Kaydı izle"}
        accessibilityLabel={live ? "Canlı yayını izle" : "Maçın yayın kaydını izle"}
        badge={live ? "CANLI" : "YAYIN KAYDI"}
        badgeTone={live ? "live" : "brand"}
      />
    );
  }
  const youtube = source.kind === "youtube" || (source.kind === "link" && source.youtube);
  const open = () => void (youtube ? openYouTube(source.kind === "youtube" ? source.watchUrl : source.url) : openLink(source.url));
  const thumb = source.kind === "youtube" ? source.thumb : null;
  return (
    <View style={styles.block}>
      <SectionHeader title={heading} meta={live ? "Şu an yayında" : undefined} />
      <Touchable
        feedback="card"
        haptic="light"
        onPress={open}
        style={[partStyles.card, styles.broadcast, live ? styles.broadcastLive : null]}
        accessibilityRole="link"
        accessibilityLabel={youtube ? `${heading}: YouTube'da izle` : `${heading}: bağlantıyı aç`}
      >
        <View style={styles.thumb}>
          <BroadcastThumb uri={thumb} />
          <View style={styles.shade} />
          <View style={[styles.badge, live ? styles.badgeLive : null]}>
            {live ? <View style={styles.liveDot} /> : <Ionicons name="radio-outline" size={12} color={RIG.text} />}
            <Text style={styles.badgeText} {...textScale.badge}>
              {live ? "CANLI" : "YAYIN KAYDI"}
            </Text>
          </View>
          <View style={[styles.play, live ? styles.playLive : null]}>
            <Ionicons name="play" size={22} color={colors.textOnBrand} />
          </View>
        </View>
        <View style={styles.foot}>
          <Ionicons name={youtube ? "logo-youtube" : "open-outline"} size={20} color={live ? colors.live : colors.textSecondary} />
          <View style={styles.flex}>
            <Text style={styles.footTitle} numberOfLines={1} {...textScale.dense}>
              {title || heading}
            </Text>
            <Text style={styles.footSub} numberOfLines={1} {...textScale.dense}>
              {youtube ? (live ? "YouTube'da canlı izle" : "YouTube'da izle") : "Bağlantıyı aç"}
            </Text>
          </View>
          <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
        </View>
      </Touchable>
    </View>
  );
});

/** Kapak; yüklenemezse koyu sahne kalır. */
function BroadcastThumb({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return null;
  return <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />;
}

/* ══════════════════════════════════════════════════════════════════════════
   Maçın golü / kurtarışı
   ══════════════════════════════════════════════════════════════════════════ */

function MomentCards({
  moments,
  clipFor,
  nameOf,
  teams,
  onOpenPlayer,
}: {
  moments: AwardMoment[];
  clipFor: (moment: AwardMoment) => { url: string; poster: string | null; minute: number | null } | null;
  nameOf: NameOf;
  teams: ClipTeams;
  onOpenPlayer: (playerId: number) => void;
}) {
  if (!moments.length) return null;
  const teamOf = (teamId: number | null) =>
    teamId == null
      ? null
      : teamId === teams.homeTeamId
        ? { name: teams.homeName ?? null, logo: teams.homeLogo ?? null }
        : teamId === teams.awayTeamId
          ? { name: teams.awayName ?? null, logo: teams.awayLogo ?? null }
          : null;

  return (
    <View style={styles.block}>
      <SectionHeader title="Maçın anları" meta="Yayın ekibinin seçimi" />
      {moments.map((moment) => {
        const label = MOMENT_LABEL[moment.key];
        const name = moment.name ?? nameOf(moment.playerId) ?? "Oyuncu";
        const clip = clipFor(moment);
        const minute = moment.minute ?? clip?.minute ?? null;
        const team = teamOf(moment.teamId);
        const playerRow = (
          <Touchable
            feedback="row"
            haptic="selection"
            disabled={!moment.playerId}
            onPress={() => moment.playerId && onOpenPlayer(moment.playerId)}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${name}`}
            style={styles.momentRow}
          >
            <View style={[styles.momentIcon, moment.key === "best_save" ? styles.momentIconSave : null]}>
              <Ionicons name={moment.key === "best_save" ? "hand-left" : "football"} size={16} color={colors.textOnBrand} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.overline} {...textScale.badge}>
                {label.toLocaleUpperCase("tr-TR")}
              </Text>
              <Text style={styles.momentName} numberOfLines={1} {...textScale.dense}>
                {name}
              </Text>
              {team?.name || minute != null ? (
                <Text style={styles.momentSub} numberOfLines={1} {...textScale.dense}>
                  {[team?.name, minute != null ? `${minute}'` : null].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
            </View>
            {team ? <TeamLogo name={team.name} logo={team.logo} size={26} /> : null}
            {moment.playerId ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
          </Touchable>
        );
        return clip ? (
          <VideoCard
            key={moment.key}
            hideHeader
            title={label}
            url={clip.url}
            posterUrl={clip.poster}
            cta={moment.key === "best_save" ? "Kurtarışı izle" : "Golü izle"}
            accessibilityLabel={`${label} videosunu izle`}
            badge={label.toLocaleUpperCase("tr-TR")}
            badgeTone="gold"
            corner={minute != null ? `${minute}'` : null}
            footer={playerRow}
          />
        ) : (
          <View key={moment.key} style={partStyles.card}>
            {playerRow}
          </View>
        );
      })}
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Röportaj
   ══════════════════════════════════════════════════════════════════════════ */

function Interview({ match }: { match: ApiMatch }) {
  const media = useMemo(() => interviewOf(match as unknown as Record<string, unknown>), [match]);
  if (!media) return null;
  if (media.file) {
    return (
      <VideoCard
        title="Röportaj"
        meta="Maç sonu açıklamaları"
        url={media.file}
        posterUrl={media.poster}
        cta="Röportajı izle"
        accessibilityLabel="Maç sonu röportajını izle"
        icon="mic"
        badge="RÖPORTAJ"
      />
    );
  }
  const yt = media.youtube;
  if (!yt || yt.kind !== "youtube") return null;
  return (
    <View style={styles.block}>
      <SectionHeader title="Röportaj" meta="Maç sonu açıklamaları" />
      <Touchable
        feedback="card"
        haptic="light"
        onPress={() => void openYouTube(yt.watchUrl)}
        style={[partStyles.card, styles.broadcast]}
        accessibilityRole="link"
        accessibilityLabel="Maç sonu röportajını YouTube'da izle"
      >
        <View style={styles.thumb}>
          <BroadcastThumb uri={yt.thumb} />
          <View style={styles.shade} />
          <View style={styles.badge}>
            <Ionicons name="mic" size={12} color={RIG.text} />
            <Text style={styles.badgeText} {...textScale.badge}>
              RÖPORTAJ
            </Text>
          </View>
          <View style={styles.play}>
            <Ionicons name="play" size={22} color={colors.textOnBrand} />
          </View>
        </View>
        <View style={styles.foot}>
          <Ionicons name="logo-youtube" size={20} color={colors.textSecondary} />
          <View style={styles.flex}>
            <Text style={styles.footTitle} numberOfLines={1} {...textScale.dense}>
              Maç sonu röportajı
            </Text>
            <Text style={styles.footSub} numberOfLines={1} {...textScale.dense}>
              YouTube'da izle
            </Text>
          </View>
          <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
        </View>
      </Touchable>
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Medya bloğu (Özet sekmesi)
   ══════════════════════════════════════════════════════════════════════════ */

export interface MatchMediaProps {
  match: ApiMatch;
  state: MatchState;
  nameOf: NameOf;
  teams: ClipTeams;
  onOpenPlayer: (playerId: number) => void;
  /** Canlı yayın kartı ayrıca sekmenin en üstünde çiziliyorsa burada tekrarlanmaz. */
  skipLiveBroadcast?: boolean;
}

export function MatchMedia({ match, state, nameOf, teams, onOpenPlayer, skipLiveBroadcast }: MatchMediaProps) {
  const live = state === "live";
  const matchId = Number(match.id);
  const broadcast = useBroadcast(match);
  const clips = useMatchGoalClips(matchId, live);
  const moments = useMemo(() => readAwardMoments(match), [match]);

  // Maçın golü videosu: kayıttaki clip_url; yoksa seçilen olayın gol klibi.
  const clipFor = (moment: AwardMoment) => {
    if (moment.clipUrl) return { url: moment.clipUrl, poster: moment.posterUrl, minute: moment.minute };
    if (moment.key !== "best_goal" || moment.eventId == null) return null;
    const clip = clips.find((item) => item.event_id != null && Number(item.event_id) === moment.eventId);
    return clip ? { url: clip.url, poster: clip.poster_url ?? null, minute: clip.minute } : null;
  };
  const scoreTitle = [match.first_team_name, scoreText(match), match.second_team_name].filter(Boolean).join(" ");

  return (
    <>
      {broadcast && live && !skipLiveBroadcast ? <BroadcastCard source={broadcast} live title={scoreTitle} /> : null}
      {live ? null : <MatchHighlight highlight={match.highlight} />}
      {broadcast && !live ? <BroadcastCard source={broadcast} live={false} title={scoreTitle} /> : null}
      {live ? null : <MomentCards moments={moments} clipFor={clipFor} nameOf={nameOf} teams={teams} onOpenPlayer={onOpenPlayer} />}
      <MatchGoalClips matchId={matchId} nameOf={nameOf} live={live} teams={teams} />
      {live ? null : <Interview match={match} />}
    </>
  );
}

function scoreText(match: ApiMatch): string | null {
  const home = match.first_team_score;
  const away = match.second_team_score;
  return home != null && away != null ? `${home}–${away}` : null;
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  broadcast: { overflow: "hidden", padding: 0 },
  broadcastLive: { borderColor: colors.live, borderWidth: 1 },
  thumb: { width: "100%", aspectRatio: 16 / 9, backgroundColor: RIG.stage, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: RIG.glass, opacity: 0.35 },
  badge: {
    position: "absolute",
    top: space.sm,
    left: space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: RIG.glass,
  },
  badgeLive: { backgroundColor: RIG.live },
  liveDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: RIG.text },
  badgeText: { ...type.micro, fontFamily: fonts.bold, color: RIG.text, letterSpacing: 0.8 },
  play: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  playLive: { backgroundColor: colors.live },
  foot: { flexDirection: "row", alignItems: "center", gap: space.m, paddingHorizontal: space.lg, paddingVertical: space.md },
  footTitle: { ...type.body, fontFamily: fonts.semibold, color: colors.textPrimary },
  footSub: { ...type.caption, color: colors.textSecondary },
  momentRow: { flexDirection: "row", alignItems: "center", gap: space.m, paddingHorizontal: space.lg, paddingVertical: space.md },
  momentIcon: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  momentIconSave: { backgroundColor: colors.accent },
  overline: { ...type.micro, fontFamily: fonts.bold, color: colors.textTertiary, letterSpacing: 0.8 },
  momentName: { ...type.body, fontFamily: fonts.semibold, color: colors.textPrimary },
  momentSub: { ...type.caption, color: colors.textSecondary },
});
