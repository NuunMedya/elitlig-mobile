import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { addMatchToCalendar } from "@/lib/calendar";
import { openLink } from "@/lib/links";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { YoutubeBanner } from "@/components/YoutubeBanner";
import { ErrorState, Loading } from "@/components/States";
import { PlayerAvatar, TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useLiveClock, useLiveMatch } from "@/hooks/useLiveMatch";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatch, getMatchKadro } from "@/lib/api/matches";
import { formatClock, formatDateLong, formatTime, mediaUrl } from "@/lib/format";
import { eventKind, goalDetail, isTimelineEvent, matchState } from "@/lib/match";
import { buildContributions, buildStatRows, buildTopPlayers } from "@/lib/matchStats";
import { queryKeys } from "@/lib/queryKeys";
import type { ContribRow, StatRow, TopPlayer } from "@/lib/matchStats";
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

  const statRows = buildStatRows(events, Number(homeTeamId) || null, Number(awayTeamId) || null);
  const bestPlayers = buildTopPlayers(events, kadroQuery.data);
  const contributions = buildContributions(events, kadroQuery.data);

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

        {live && <YoutubeBanner cityLabel={match.city} live />}

        {matchState(match) === "scheduled" && (
          <Pressable
            onPress={() => addMatchToCalendar(match)}
            style={({ pressed }) => [styles.calendarBtn, pressed && styles.pressedRow]}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.turf} />
            <Text style={styles.calendarText}>Takvime ekle</Text>
          </Pressable>
        )}

        <View style={styles.tabs}>
          <TabButton label="Özet" active={tab === "summary"} onPress={() => setTab("summary")} />
          <TabButton label="Kadrolar" active={tab === "lineup"} onPress={() => setTab("lineup")} />
        </View>

        {tab === "summary" ? (
          <Summary match={match} timeline={timeline} homeTeamId={homeTeamId} nameOf={nameOf} stats={statRows} best={bestPlayers} />
        ) : (
          <Lineups match={match} kadro={kadroQuery.data} loading={kadroQuery.isLoading} contrib={contributions} />
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
  stats,
  best,
}: {
  match: ApiMatch;
  timeline: ApiMatchEvent[];
  homeTeamId: number | null;
  nameOf: (playerId?: number | null) => string | null;
  stats: StatRow[];
  best: TopPlayer[];
}) {
  const mvpId = match.match_mvp ? Number(match.match_mvp) : null;
  const mvpName = mvpId ? nameOf(mvpId) : null;
  const videoUrl = mediaUrl(match.match_video);
  const router = useRouter();

  const rawHeadline = match.match_title?.trim();
  const heroImage = mediaUrl(match.match_picture);
  // "TAKIM1 vs TAKIM2" gibi otomatik başlıklar skorbordu tekrarlar; gizlenir.
  const squash = (value: string) =>
    value.toLocaleLowerCase("tr-TR").replace(/[\s·|-]+/g, " ").replace(/\bvs\.?\b/g, "vs").trim();
  const trivialTitle =
    !!rawHeadline &&
    squash(rawHeadline) === squash(`${match.first_team_name} vs ${match.second_team_name}`);
  const headline = trivialTitle ? null : rawHeadline;

  return (
    <View style={styles.section}>
      {headline || heroImage ? (
        <View style={styles.hero}>
          {heroImage ? <Image source={{ uri: heroImage }} style={styles.heroImage} /> : null}
          {headline ? (
            <View style={styles.heroBody}>
              <Text style={styles.heroKicker}>MAÇ MANŞETİ</Text>
              <Text style={styles.heroTitle}>{headline}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {mvpId && mvpName ? (
        <Pressable
          onPress={() => router.push(`/oyuncu/${mvpId}`)}
          style={({ pressed }) => [styles.mvpCard, pressed && styles.pressedRow]}
        >
          <Ionicons name="star" size={18} color={colors.yellow} />
          <View style={styles.mvpBody}>
            <Text style={styles.mvpKicker}>MAÇIN YILDIZI</Text>
            <Text style={styles.mvpName}>{mvpName.toLocaleUpperCase("tr-TR")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ) : null}

      {videoUrl ? (
        <Pressable
          onPress={() => openLink(videoUrl)}
          style={({ pressed }) => [styles.videoButton, pressed && styles.pressedRow]}
        >
          <Ionicons name="play-circle" size={20} color="#FF0000" />
          <Text style={styles.videoText}>Maç videosunu izle</Text>
          <Ionicons name="open-outline" size={16} color={colors.muted} />
        </Pressable>
      ) : null}

      <Text style={styles.sectionTitle}>Maç Olay Özeti</Text>
      <View style={styles.statCard}>
        {stats.map((row) => (
          <StatLine key={row.label} row={row} />
        ))}
      </View>

      {best.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, styles.sectionSpacer]}>En İyi Oyuncular</Text>
          <View style={styles.bestGrid}>
            {best.map((player, index) => (
              <BestPlayerCard key={player.playerId} player={player} rank={index + 1} />
            ))}
          </View>
        </>
      ) : null}

      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Maç Akışı</Text>

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

/**
 * Sitedeki ızgara satırı: sol ev, sağ deplasman, altta oran çubuğu.
 * Dürüst çubuk kuralları: iki taraf da sıfırsa nötr ince çizgi; tek taraf
 * sıfırsa çubuğun tamamı diğer tarafın rengi; ikisi de doluysa oranlı bölünür.
 */
function StatLine({ row }: { row: StatRow }) {
  const total = row.home + row.away;
  const lead = (mine: number, theirs: number) => total > 0 && mine >= theirs;

  return (
    <View style={styles.statLine}>
      <View style={styles.statValues}>
        <Text style={[styles.statValue, lead(row.home, row.away) && styles.statValueLead]}>
          {row.home}
        </Text>
        <Text style={styles.statLabel}>{row.label}</Text>
        <Text style={[styles.statValue, lead(row.away, row.home) && styles.statValueLead]}>
          {row.away}
        </Text>
      </View>
      {total === 0 ? (
        <View style={styles.statBarEmpty} />
      ) : (
        <View style={styles.statBar}>
          {row.home > 0 ? (
            <View style={[styles.statBarHome, { flex: row.home }]} />
          ) : null}
          {row.away > 0 ? (
            <View style={[styles.statBarAway, { flex: row.away }]} />
          ) : null}
        </View>
      )}
    </View>
  );
}

function BestPlayerCard({ player, rank }: { player: TopPlayer; rank: number }) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/oyuncu/${player.playerId}`)}
      style={({ pressed }) => [
        styles.bestCard,
        rank === 1 && styles.bestCardFirst,
        pressed && styles.pressedRow,
      ]}
    >
      <View style={styles.bestRank}>
        <Text style={styles.bestRankText}>{rank}</Text>
      </View>
      <PlayerAvatar name={player.name} image={player.image} size={40} />
      <Text style={styles.bestName} numberOfLines={1}>
        {player.name.toLocaleUpperCase("tr-TR")}
      </Text>
      <View style={styles.bestStats}>
        <BestStat label="GOL" value={String(player.goals)} />
        <BestStat label="ASİST" value={String(player.assists)} />
        <BestStat label="PUAN" value={player.rating != null ? player.rating.toFixed(1) : "—"} />
      </View>
    </Pressable>
  );
}

function BestStat({ label, value }: { label: string; value: string }) {
  const empty = value === "—";
  return (
    <View style={styles.bestStat}>
      <Text style={[styles.bestStatValue, empty && styles.bestStatEmpty]}>{value}</Text>
      <Text style={styles.bestStatLabel}>{label}</Text>
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
      <Text style={styles.eventMinute}>{event.dakika ? `${event.dakika}'` : "—"}</Text>
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
  contrib,
}: {
  match: ApiMatch;
  kadro: KadroResponse | undefined;
  loading: boolean;
  contrib: { home: ContribRow[]; away: ContribRow[] };
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
      <Text style={styles.sectionTitle}>Oyuncu Katkıları</Text>
      <ContribTable team={match.first_team_name} rows={contrib.home} homeSide />
      <ContribTable team={match.second_team_name} rows={contrib.away} />

      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>İlk 11 ve Yedekler</Text>
      <TeamLineup title={match.first_team_name} rows={home} />
      <TeamLineup title={match.second_team_name} rows={away} />
    </View>
  );
}

/** Sitedeki "Takım Kadroları" tablosu: yeşil/kırmızı başlık, G · A · K · PUAN. */
function ContribTable({
  team,
  rows,
  homeSide,
}: {
  team: string;
  rows: ContribRow[];
  homeSide?: boolean;
}) {
  const router = useRouter();
  if (!rows.length) return null;

  return (
    <View style={styles.contribCard}>
      <View style={[styles.contribHead, { backgroundColor: homeSide ? colors.green : colors.live }]}>
        <Text style={styles.contribTeam} numberOfLines={1}>
          {team.toLocaleUpperCase("tr-TR")}
        </Text>
        <Text style={styles.contribCol}>G</Text>
        <Text style={styles.contribCol}>A</Text>
        <Text style={styles.contribCol}>K</Text>
        <Text style={[styles.contribCol, styles.contribColWide]}>PUAN</Text>
      </View>
      {rows.map((row, index) => (
        <Pressable
          key={`${row.playerId ?? "guest"}-${index}`}
          disabled={!row.playerId || row.guest}
          onPress={() => router.push(`/oyuncu/${row.playerId}`)}
          style={({ pressed }) => [
            styles.contribRow,
            index % 2 === 1 && styles.contribRowAlt,
            pressed && styles.pressedRow,
          ]}
        >
          <Text style={styles.contribName} numberOfLines={1}>
            {row.name}
            {row.guest ? " · misafir" : ""}
          </Text>
          <Text style={[styles.contribNum, row.goals > 0 && styles.contribNumLead]}>{row.goals}</Text>
          <Text style={[styles.contribNum, row.assists > 0 && styles.contribNumLead]}>{row.assists}</Text>
          <Text style={styles.contribNum}>{row.cards}</Text>
          <Text style={[styles.contribNum, styles.contribColWide, styles.contribRating]}>
            {row.rating != null ? row.rating.toFixed(1) : "—"}
          </Text>
        </Pressable>
      ))}
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
  calendarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.turfDim,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  calendarText: {
    ...type.small,
    color: colors.turf,
    fontWeight: "800",
  },
  hero: {
    backgroundColor: "#17131F",
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  heroImage: {
    width: "100%",
    height: 160,
  },
  heroBody: {
    padding: spacing.md,
  },
  heroKicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.yellow,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...type.subtitle,
    color: "#FFFFFF",
    lineHeight: 22,
  },
  contribCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  contribHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  contribTeam: {
    ...type.caption,
    color: "#FFFFFF",
    flex: 1,
  },
  contribCol: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
    width: 26,
    textAlign: "center",
  },
  contribColWide: {
    width: 40,
  },
  contribRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  contribRowAlt: {
    backgroundColor: colors.surfaceRaised,
  },
  contribName: {
    ...type.small,
    color: colors.line,
    fontWeight: "600",
    flex: 1,
  },
  contribNum: {
    ...type.small,
    color: colors.muted,
    width: 26,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  contribNumLead: {
    color: colors.line,
    fontWeight: "800",
  },
  contribRating: {
    color: colors.turf,
    fontWeight: "800",
  },
  statCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statLine: {
    paddingVertical: spacing.xs + 2,
  },
  statValues: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statValue: {
    ...type.small,
    color: colors.muted,
    fontWeight: "800",
    width: 28,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  statValueLead: {
    color: colors.line,
  },
  statLabel: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  statBar: {
    flexDirection: "row",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 5,
  },
  statBarEmpty: {
    height: 5,
    borderRadius: 3,
    marginTop: 5,
    backgroundColor: colors.faint,
  },
  statBarHome: {
    backgroundColor: colors.green,
  },
  statBarAway: {
    backgroundColor: colors.live,
  },
  bestGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  bestCard: {
    flexBasis: "47%",
    flexGrow: 1,
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bestCardFirst: {
    borderColor: colors.yellow,
    backgroundColor: colors.goldDim + "55",
  },
  bestRank: {
    alignSelf: "flex-start",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  bestRankText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.turf,
  },
  bestName: {
    ...type.caption,
    color: colors.line,
    letterSpacing: 0,
  },
  bestStats: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: 2,
  },
  bestStat: {
    alignItems: "center",
  },
  bestStatValue: {
    ...type.small,
    color: colors.turf,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  bestStatEmpty: {
    color: colors.muted,
  },
  bestStatLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.5,
  },
  mvpCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.goldDim + "88",
    borderWidth: 1,
    borderColor: colors.yellow,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  mvpBody: {
    flex: 1,
  },
  mvpKicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.muted,
  },
  mvpName: {
    ...type.small,
    color: colors.line,
    fontWeight: "800",
  },
  videoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  videoText: {
    ...type.small,
    color: colors.line,
    fontWeight: "700",
    flex: 1,
  },
  pressedRow: {
    opacity: 0.7,
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
