import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { formatScore, formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";

/**
 * Fikstür / sonuç / canlı — üç durumu da tek kart gösterir.
 *
 * Oynanmamış maçta skor yerine başlama saati, canlı maçta yanıp sönmeyen ama
 * belirgin bir CANLI rozeti görünür. Takım logoları için `home_team_id` boş
 * olabilen eski kayıtlarda ada göre çözülen logo dışarıdan verilir.
 */
export function MatchCard({
  match,
  homeLogo,
  awayLogo,
}: {
  match: ApiMatch;
  homeLogo?: string | null;
  awayLogo?: string | null;
}) {
  const state = matchState(match);
  const isLive = state === "live";
  const played = state !== "scheduled";

  const homeScore = Number(match.first_team_score ?? 0);
  const awayScore = Number(match.second_team_score ?? 0);
  const homeWon = played && homeScore > awayScore;
  const awayWon = played && awayScore > homeScore;

  return (
    <Link href={`/mac/${match.id}`} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.meta}>
          <Text style={styles.metaText} numberOfLines={1}>
            {match.match_field || match.league_name}
          </Text>
          {isLive ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>CANLI</Text>
            </View>
          ) : (
            <Text style={styles.metaText}>{formatTime(match.time)}</Text>
          )}
        </View>

        <Row
          name={match.first_team_name}
          logo={homeLogo}
          score={played ? formatScore(match.first_team_score) : null}
          dimmed={played && !homeWon && homeScore !== awayScore}
          live={isLive}
        />
        <Row
          name={match.second_team_name}
          logo={awayLogo}
          score={played ? formatScore(match.second_team_score) : null}
          dimmed={played && !awayWon && homeScore !== awayScore}
          live={isLive}
        />
      </Pressable>
    </Link>
  );
}

function Row({
  name,
  logo,
  score,
  dimmed,
  live,
}: {
  name: string;
  logo?: string | null;
  score: string | null;
  dimmed: boolean;
  live: boolean;
}) {
  return (
    <View style={styles.row}>
      <TeamCrest name={name} logo={logo} size={28} />
      <Text style={[styles.teamName, dimmed && styles.teamNameDim]} numberOfLines={1}>
        {name}
      </Text>
      {score !== null ? (
        <Text style={[styles.score, live && styles.scoreLive, dimmed && styles.teamNameDim]}>
          {score}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  metaText: {
    ...type.caption,
    color: colors.muted,
    flexShrink: 1,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  teamName: {
    ...type.body,
    color: colors.line,
    flex: 1,
  },
  teamNameDim: {
    color: colors.muted,
  },
  score: {
    ...type.score,
    fontSize: 20,
    color: colors.line,
    minWidth: 24,
    textAlign: "right",
  },
  scoreLive: {
    color: colors.turf,
  },
});
