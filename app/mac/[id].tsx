import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { ErrorState, Loading } from "@/components/States";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useLiveClock, useLiveMatch } from "@/hooks/useLiveMatch";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatch, getMatchKadro } from "@/lib/api/matches";
import { formatClock, formatDateLong, formatTime } from "@/lib/format";
import { eventKind, goalDetail, isTimelineEvent, matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiMatch, ApiMatchEvent, KadroPlayer, KadroResponse } from "@/lib/types";

type Tab = "summary" | "lineup";

/**
 * Maç detayı.
 *
 * Üç kaynak birleşir:
 *   - maç kaydı (lig, saha, tarih, kesinleşmiş skor, maç notu)
 *   - kadro ucu (oyuncu adları çözülmüş kadrolar)
 *   - canlı anlık görüntü (yalnızca maç canlıyken: skor, süre, olaylar)
 *
 * Canlı görüntü varken skor ve olaylar ondan okunur; maç kaydındaki skor
 * ancak maç yayınlandıktan sonra kesinleşir.
 */
export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const matchId = Number(id);
  const validId = Number.isFinite(matchId) && matchId > 0;
  const teams = useTeamLogos();
  const [tab, setTab] = useState<Tab>("summary");

  const matchQuery = useQuery({
    queryKey: queryKeys.match(matchId),
    queryFn: () => getMatch(matchId, ["timeline"]),
    enabled: validId,
  });

  const kadroQuery = useQuery({
    queryKey: [...queryKeys.match(matchId), "kadro"],
    queryFn: () => getMatchKadro(matchId),
    enabled: validId,
    staleTime: 5 * 60_000,
  });

  const match = matchQuery.data;
  const live = match ? matchState(match) === "live" : false;

  const { snapshot, realtime } = useLiveMatch(validId ? matchId : null, live);
  const clockMs = useLiveClock(snapshot);

  const events = (snapshot?.events ?? match?.timeline ?? []) as ApiMatchEvent[];

  const timeline = useMemo(
    () =>
      events
        .filter(isTimelineEvent)
        .slice()
        .sort((a, b) => (a.dakika ?? 0) - (b.dakika ?? 0) || a.id - b.id),
    [events]
  );

  const nameOf = usePlayerNames(kadroQuery.data);

  if (matchQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Maç" />
        <Loading />
      </SafeAreaView>
    );
  }

  if (matchQuery.isError || !match) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Maç" />
        <ErrorState error={matchQuery.error} onRetry={matchQuery.refetch} />
      </SafeAreaView>
    );
  }

  // Eski maçlarda home_team_id boş olabilir; kadro ucu bu durumda kadrodaki
  // ilk iki takımı ev/deplasman olarak çözer.
  const homeTeamId =
    match.home_team_id ?? kadroQuery.data?.meta?.home_team_id ?? teams.idFor(null, match.first_team_name);
  const awayTeamId =
    match.away_team_id ?? kadroQuery.data?.meta?.away_team_id ?? teams.idFor(null, match.second_team_name);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title={match.league_name} subtitle={match.match_season ?? undefined} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={matchQuery.isRefetching}
            onRefresh={() => {
              void matchQuery.refetch();
              void kadroQuery.refetch();
            }}
            tintColor={colors.turf}
          />
        }
      >
        <Scoreboard
          match={match}
          homeScore={snapshot?.homeScore ?? match.first_team_score}
          awayScore={snapshot?.awayScore ?? match.second_team_score}
          live={live}
          clockMs={clockMs}
          realtime={realtime}
          homeLogo={teams.logoFor(match.home_team_id, match.first_team_name)}
          awayLogo={teams.logoFor(match.away_team_id, match.second_team_name)}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
        />

        <View style={styles.tabs}>
          <TabButton label="Özet" active={tab === "summary"} onPress={() => setTab("summary")} />
          <TabButton label="Kadrolar" active={tab === "lineup"} onPress={() => setTab("lineup")} />
        </View>

        {tab === "summary" ? (
          <Summary match={match} timeline={timeline} homeTeamId={homeTeamId} nameOf={nameOf} />
        ) : (
          <Lineups match={match} kadro={kadroQuery.data} loading={kadroQuery.isLoading} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Olay satırlarındaki oyuncu adları kadro ucundan çözülür. */
function usePlayerNames(kadro: KadroResponse | undefined) {
  return useMemo(() => {
    const byId = new Map<number, string>();
    [...(kadro?.home ?? []), ...(kadro?.away ?? [])].forEach((row) => {
      const playerId = row.playerId ?? row.oyuncu_id;
      const name = row.playerName ?? row.guestName;
      if (playerId != null && name) byId.set(Number(playerId), name);
    });
    return (playerId?: number | null) =>
      playerId != null ? byId.get(Number(playerId)) ?? null : null;
  }, [kadro]);
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Scoreboard({
  match,
  homeScore,
  awayScore,
  live,
  clockMs,
  realtime,
  homeLogo,
  awayLogo,
  homeTeamId,
  awayTeamId,
}: {
  match: ApiMatch;
  homeScore: number | null;
  awayScore: number | null;
  live: boolean;
  clockMs: number | null;
  realtime: boolean;
  homeLogo?: string | null;
  awayLogo?: string | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
}) {
  const router = useRouter();
  const state = matchState(match);
  const played = state !== "scheduled";

  return (
    <View style={styles.board}>
      <View style={styles.boardStatus}>
        {live ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{clockMs != null ? formatClock(clockMs) : "CANLI"}</Text>
          </View>
        ) : (
          <Text style={styles.boardStatusText}>
            {state === "finished" ? "Maç sonucu" : `${formatTime(match.time)} · Fikstür`}
          </Text>
        )}
      </View>

      <View style={styles.boardTeams}>
        <Pressable
          style={styles.boardTeam}
          onPress={() => homeTeamId && router.push(`/takim/${homeTeamId}`)}
        >
          <TeamCrest name={match.first_team_name} logo={homeLogo} size={56} />
          <Text style={styles.boardTeamName} numberOfLines={2}>
            {match.first_team_name}
          </Text>
        </Pressable>

        <View style={styles.boardScore}>
          {played ? (
            <Text style={[styles.scoreText, live && styles.scoreLive]}>
              {homeScore ?? 0} - {awayScore ?? 0}
            </Text>
          ) : (
            <Text style={styles.kickoff}>{formatTime(match.time)}</Text>
          )}
        </View>

        <Pressable
          style={styles.boardTeam}
          onPress={() => awayTeamId && router.push(`/takim/${awayTeamId}`)}
        >
          <TeamCrest name={match.second_team_name} logo={awayLogo} size={56} />
          <Text style={styles.boardTeamName} numberOfLines={2}>
            {match.second_team_name}
          </Text>
        </Pressable>
      </View>

      <View style={styles.boardMeta}>
        <Text style={styles.boardMetaText}>{formatDateLong(match.date)}</Text>
        {match.match_field ? <Text style={styles.boardMetaText}>· {match.match_field}</Text> : null}
      </View>

      {live && !realtime ? (
        <Text style={styles.pollingNote}>
          Anlık bağlantı kurulamadı; skor kısa aralıklarla yenileniyor.
        </Text>
      ) : null}
    </View>
  );
}

function Summary({
  match,
  timeline,
  homeTeamId,
  nameOf,
}: {
  match: ApiMatch;
  timeline: ApiMatchEvent[];
  homeTeamId: number | null;
  nameOf: (playerId?: number | null) => string | null;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Maç Akışı</Text>

      {timeline.length === 0 ? (
        <Text style={styles.placeholder}>Bu maç için henüz olay girilmemiş.</Text>
      ) : (
        timeline.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            home={Number(event.takim_id) === Number(homeTeamId)}
            nameOf={nameOf}
          />
        ))
      )}

      {match.post_manset || match.match_comment ? (
        <>
          <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Maç Notu</Text>
          <Text style={styles.note}>{match.post_manset || match.match_comment}</Text>
        </>
      ) : null}
    </View>
  );
}

const EVENT_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  goal: { icon: "football", color: colors.turf },
  ownGoal: { icon: "football-outline", color: colors.live },
  yellow: { icon: "square", color: colors.yellow },
  red: { icon: "square", color: colors.red },
  substitution: { icon: "swap-horizontal", color: colors.muted },
  other: { icon: "ellipse-outline", color: colors.muted },
};

function EventRow({
  event,
  home,
  nameOf,
}: {
  event: ApiMatchEvent;
  home: boolean;
  nameOf: (playerId?: number | null) => string | null;
}) {
  const kind = eventKind(event);
  const visual = EVENT_ICON[kind] ?? EVENT_ICON.other;
  const detail = kind === "goal" ? goalDetail(event) : null;

  const label =
    kind === "substitution"
      ? [nameOf(event.oyuncu_giren_id), nameOf(event.oyuncu_cikan_id)]
          .filter(Boolean)
          .join(" ↔ ") || "Oyuncu değişikliği"
      : nameOf(event.oyuncu_id) || event.aciklama || "";

  return (
    <View style={[styles.eventRow, !home && styles.eventRowAway]}>
      <Text style={styles.eventMinute}>{event.dakika != null ? `${event.dakika}'` : "—"}</Text>
      <Ionicons name={visual.icon} size={15} color={visual.color} />
      <View style={styles.eventText}>
        <Text style={[styles.eventName, !home && styles.eventNameAway]} numberOfLines={1}>
          {label}
        </Text>
        {kind === "ownGoal" ? (
          <Text style={[styles.eventDetail, !home && styles.eventNameAway]}>kendi kalesine</Text>
        ) : detail ? (
          <Text style={[styles.eventDetail, !home && styles.eventNameAway]}>{detail}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Lineups({
  match,
  kadro,
  loading,
}: {
  match: ApiMatch;
  kadro: KadroResponse | undefined;
  loading: boolean;
}) {
  if (loading) return <Loading />;

  const home = kadro?.home ?? [];
  const away = kadro?.away ?? [];

  if (!home.length && !away.length) {
    return (
      <View style={styles.section}>
        <Text style={styles.placeholder}>Kadrolar henüz açıklanmadı.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <TeamLineup title={match.first_team_name} rows={home} />
      <TeamLineup title={match.second_team_name} rows={away} />
    </View>
  );
}

function TeamLineup({ title, rows }: { title: string; rows: KadroPlayer[] }) {
  const starters = rows.filter((row) => row.role === "starter");
  const subs = rows.filter((row) => row.role !== "starter");

  return (
    <View style={styles.lineupBlock}>
      <Text style={styles.sectionTitle}>{title}</Text>

      {starters.map((row, index) => (
        <PlayerRow key={`${row.playerId ?? "guest"}-${index}`} row={row} />
      ))}

      {subs.length ? (
        <>
          <Text style={styles.subsTitle}>Yedekler</Text>
          {subs.map((row, index) => (
            <PlayerRow key={`sub-${row.playerId ?? "guest"}-${index}`} row={row} dim />
          ))}
        </>
      ) : null}
    </View>
  );
}

function PlayerRow({ row, dim }: { row: KadroPlayer; dim?: boolean }) {
  const router = useRouter();
  const name = row.playerName || row.guestName || "İsimsiz oyuncu";
  const rating = row.puan != null ? Number(row.puan) : null;
  // Misafir oyuncuların kalıcı profili yoktur.
  const linkable = Boolean(row.playerId) && !row.isGuest;

  return (
    <Pressable
      style={({ pressed }) => [styles.playerRow, pressed && linkable && styles.pressed]}
      disabled={!linkable}
      onPress={() => router.push(`/oyuncu/${row.playerId}`)}
    >
      <Text style={styles.shirt}>{row.number === "" || row.number == null ? "-" : row.number}</Text>
      <Text style={[styles.playerName, dim && styles.playerNameDim]} numberOfLines={1}>
        {name}
        {row.captain ? " (K)" : ""}
        {row.isGuest ? " · misafir" : ""}
      </Text>
      {row.position ? <Text style={styles.position}>{row.position}</Text> : null}
      {rating != null && Number.isFinite(rating) && rating > 0 ? (
        <Text style={styles.rating}>{rating.toFixed(1)}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  board: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  boardStatus: {
    alignItems: "center",
  },
  boardStatusText: {
    ...type.caption,
    color: colors.muted,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,77,77,0.15)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  liveText: {
    ...type.caption,
    color: colors.live,
  },
  boardTeams: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  boardTeam: {
    flex: 1,
    alignItems: "center",
    gap: spacing.sm,
  },
  boardTeamName: {
    ...type.small,
    color: colors.line,
    textAlign: "center",
    fontWeight: "600",
  },
  boardScore: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
  },
  scoreText: {
    ...type.score,
    fontSize: 30,
    color: colors.line,
  },
  scoreLive: {
    color: colors.turf,
  },
  kickoff: {
    ...type.title,
    color: colors.muted,
  },
  boardMeta: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  boardMetaText: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  pollingNote: {
    ...type.caption,
    color: colors.faint,
    textAlign: "center",
    letterSpacing: 0,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: colors.turfDim,
  },
  tabText: {
    ...type.caption,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.turf,
  },
  pressed: {
    opacity: 0.8,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...type.caption,
    color: colors.muted,
    paddingBottom: spacing.xs,
  },
  sectionSpacer: {
    paddingTop: spacing.md,
  },
  placeholder: {
    ...type.small,
    color: colors.faint,
    paddingVertical: spacing.md,
  },
  note: {
    ...type.small,
    color: colors.line,
    lineHeight: 21,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    marginBottom: 2,
  },
  eventRowAway: {
    // Deplasman olayları sağa yaslanır; iki takımı ayırt etmenin en sade yolu.
    flexDirection: "row-reverse",
  },
  eventMinute: {
    ...type.caption,
    color: colors.muted,
    width: 30,
    textAlign: "center",
  },
  eventText: {
    flex: 1,
  },
  eventName: {
    ...type.small,
    color: colors.line,
  },
  eventNameAway: {
    textAlign: "right",
  },
  eventDetail: {
    ...type.caption,
    color: colors.faint,
    letterSpacing: 0,
  },
  lineupBlock: {
    marginBottom: spacing.lg,
  },
  subsTitle: {
    ...type.caption,
    color: colors.muted,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    marginBottom: 2,
  },
  shirt: {
    ...type.caption,
    color: colors.muted,
    width: 22,
    textAlign: "center",
  },
  playerName: {
    ...type.small,
    color: colors.line,
    flex: 1,
  },
  playerNameDim: {
    color: colors.muted,
  },
  position: {
    ...type.caption,
    color: colors.faint,
  },
  rating: {
    ...type.caption,
    color: colors.turf,
    minWidth: 26,
    textAlign: "right",
  },
});
