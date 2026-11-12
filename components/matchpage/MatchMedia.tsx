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
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import type { ClipTeams } from "@/components/live/MatchGoalClips";
import { clipLabel, type GoalClip } from "@/lib/live/clips";
import { MatchHighlight } from "@/components/live/MatchHighlight";
import { VideoCard } from "@/components/live/VideoCard";
import { IconTile, Reveal, SectionHeader, TeamLogo, Touchable, withAlpha } from "@/components/ui";
import { openLink, openYouTube } from "@/lib/links";
import { RIG } from "@/lib/live/rig";
import {
  broadcastOf,
  formatDuration,
  interviewOf,
  readAwardMoments,
  type AwardMoment,
  type BroadcastSource,
} from "@/lib/matchMedia";
import type { ApiMatch, MatchState } from "@/lib/types";
import { colors, dark as darkPalette, fonts, glowStyle, hairline, layout, radius, space, textScale, type } from "@/theme";

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
          <PlayButton live={live} />
        </View>
        <View style={styles.foot}>
          <IconTile icon={youtube ? "logo-youtube" : "open-outline"} tone={youtube || live ? "red" : "violet"} size={36} glow={false} />
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

/** Oynat düğmesi: degrade daire + parıltı; canlıda pembe. */
function PlayButton({ live = false }: { live?: boolean }) {
  const pair = live ? colors.gradientLive : colors.gradientBrand;
  return (
    <View style={[styles.play, glowStyle(pair[0], 2)]}>
      <LinearGradient colors={pair} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.playFill]} />
      <Ionicons name="play" size={24} color={colors.onDark} />
    </View>
  );
}

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
          <PlayButton />
        </View>
        <View style={styles.foot}>
          <IconTile icon="mic" tone="pink" size={36} glow={false} />
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
  /** Maçın gol klipleri (dakika sırasıyla) — sorgu ve oynatıcı üst bileşende (SummaryTab). */
  clips: GoalClip[];
  onOpenClip: (clipId: number) => void;
}

export const MatchMedia = memo(function MatchMedia({
  match,
  state,
  nameOf,
  teams,
  onOpenPlayer,
  skipLiveBroadcast,
  clips,
  onOpenClip,
}: MatchMediaProps) {
  const live = state === "live";
  const broadcast = useBroadcast(match);
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
      <GoalClipGrid clips={clips} nameOf={nameOf} teams={teams} onOpen={onOpenClip} />
      {live ? null : <Interview match={match} />}
    </>
  );
});


/* ══════════════════════════════════════════════════════════════════════════
   Gol videoları — iki sütunlu ızgara
   ══════════════════════════════════════════════════════════════════════════ */

/** İlk açılışta gösterilen kart sayısı; fazlası "Tümünü göster" ile açılır. */
const GRID_PREVIEW = 6;

/** Kapak perdesi — fotoğraf üstü yazı için iki temada da koyu. */
const CLIP_SCRIM = [withAlpha(darkPalette.bg, 0), withAlpha(darkPalette.bg, 0.78)] as const;

/**
 * Gol videoları ızgarası. Eskiden yatay şeritti; 17 gollük bir maçta kullanıcı
 * hangi golün nerede olduğunu görmek için şeridi sonuna kadar kaydırıyordu.
 * Izgara ilk altı golü tek bakışta verir, kalanı tek dokunuşla açılır.
 * Oynatıcı üst bileşendedir (SummaryTab) — kart yalnız `onOpen` çağırır.
 */
const GoalClipGrid = memo(function GoalClipGrid({
  clips,
  nameOf,
  teams,
  onOpen,
}: {
  clips: GoalClip[];
  nameOf: NameOf;
  teams: ClipTeams;
  onOpen: (clipId: number) => void;
}) {
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const cardWidth = Math.floor((width - layout.screenPadding * 2 - space.sm) / 2);
  if (!clips.length) return null;
  const shown = expanded ? clips : clips.slice(0, GRID_PREVIEW);
  const hidden = clips.length - shown.length;

  const teamOf = (teamId: number | null) =>
    teamId == null
      ? null
      : Number(teamId) === teams.homeTeamId
        ? { name: teams.homeName ?? null, logo: teams.homeLogo ?? null }
        : Number(teamId) === teams.awayTeamId
          ? { name: teams.awayName ?? null, logo: teams.awayLogo ?? null }
          : null;

  return (
    <View style={styles.block}>
      <SectionHeader title="Gol videoları" meta={`${clips.length} gol`} />
      <View style={styles.grid}>
        {shown.map((clip, index) => (
          <Reveal key={clip.id} index={Math.min(index, 7)} distance={8}>
            <ClipTile
              clip={clip}
              width={cardWidth}
              title={nameOf(clip.player_id) ?? clipLabel(clip)}
              team={teamOf(clip.team_id)}
              onOpen={onOpen}
            />
          </Reveal>
        ))}
      </View>
      {hidden > 0 || expanded ? (
        <Touchable
          feedback="button"
          haptic="selection"
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Gol videolarını daralt" : `Tüm gol videolarını göster, ${clips.length}`}
          style={styles.more}
        >
          <Text style={styles.moreText} {...textScale.dense}>
            {expanded ? "Daha az göster" : `Tümünü göster · ${hidden} video daha`}
          </Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.brandAccent} />
        </Touchable>
      ) : null}
    </View>
  );
});

const ClipTile = memo(function ClipTile({
  clip,
  width,
  title,
  team,
  onOpen,
}: {
  clip: GoalClip;
  width: number;
  title: string;
  team: { name: string | null; logo: string | null } | null;
  onOpen: (clipId: number) => void;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  const duration = formatDuration(clip.duration_ms);
  const open = useCallback(() => onOpen(clip.id), [onOpen, clip.id]);
  return (
    <Touchable
      feedback="card"
      haptic="light"
      onPress={open}
      style={[styles.tile, { width }]}
      accessibilityRole="button"
      accessibilityLabel={`${clip.minute != null ? `${clip.minute}. dakika, ` : ""}${title} golünü izle`}
    >
      <View style={styles.tileThumb}>
        {clip.poster_url && !posterFailed ? (
          <Image
            source={{ uri: clip.poster_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            resizeMethod="resize"
            onError={() => setPosterFailed(true)}
          />
        ) : (
          <LinearGradient colors={colors.gradientInk} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={CLIP_SCRIM} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.tilePlay}>
          <Ionicons name="play" size={14} color={colors.onDark} />
        </View>
        {clip.minute != null ? (
          <View style={styles.tileMinute}>
            <LinearGradient
              colors={colors.gradientSignature}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.tileMinuteFill]}
            />
            <Text style={styles.tileMinuteText} {...textScale.badge}>
              {`${clip.minute}'`}
            </Text>
          </View>
        ) : null}
        {duration ? (
          <Text style={styles.tileDuration} {...textScale.badge}>
            {duration}
          </Text>
        ) : null}
      </View>
      <View style={styles.tileBody}>
        {team ? <TeamLogo name={team.name} logo={team.logo} size={20} /> : null}
        <Text style={styles.tileTitle} numberOfLines={1} {...textScale.dense}>
          {title}
          {clip.own_goal ? " (k.k.)" : ""}
        </Text>
      </View>
    </Touchable>
  );
});

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
  play: { width: 60, height: 60, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.inkPillBorder },
  playFill: { borderRadius: radius.pill },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
  },
  tile: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  tileThumb: {
    width: "100%",
    aspectRatio: 16 / 10,
    backgroundColor: colors.matchTint,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tilePlay: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  tileMinute: {
    position: "absolute",
    top: space.xs,
    left: space.xs,
    height: 20,
    minWidth: 32,
    paddingHorizontal: space.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  tileMinuteFill: { borderRadius: radius.pill },
  tileMinuteText: { ...type.numSmStrong, color: colors.onDark },
  tileDuration: {
    position: "absolute",
    right: space.s,
    bottom: space.xs,
    ...type.micro,
    color: colors.onDark,
  },
  tileBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  tileTitle: { ...type.labelSm, color: colors.textPrimary, flex: 1, minWidth: 0 },
  more: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    height: 40,
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  moreText: { ...type.label, color: colors.brandAccent },
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
