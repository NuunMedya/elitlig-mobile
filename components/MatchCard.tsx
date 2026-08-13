import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, type } from "@/constants/theme";
import type { Match } from "@/lib/types";

function kickoffTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

/** Canlı maçlarda yanıp sönen kırmızı nokta */
function LiveDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.2,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.liveDot, { opacity }]} />;
}

export function MatchCard({ match }: { match: Match }) {
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const hasScore = match.homeScore !== null && match.awayScore !== null;

  return (
    <View style={[styles.card, isLive && styles.cardLive]}>
      <View style={styles.statusRow}>
        {isLive ? (
          <View style={styles.liveBadge}>
            <LiveDot />
            <Text style={styles.liveText}>CANLI · {match.minute}'</Text>
          </View>
        ) : (
          <Text style={styles.statusText}>
            {isFinished ? "MAÇ SONUCU" : kickoffTime(match.kickoffAt)}
          </Text>
        )}
        {match.streamUrl && isLive && (
          <Text style={styles.streamText}>📺 Spikerli yayında</Text>
        )}
      </View>

      <View style={styles.scoreRow}>
        <Text style={styles.teamName} numberOfLines={1}>
          {match.home.shortName}
        </Text>
        <View style={styles.scoreBox}>
          {hasScore ? (
            <Text style={[styles.score, isLive && styles.scoreLive]}>
              {match.homeScore} - {match.awayScore}
            </Text>
          ) : (
            <Text style={styles.vs}>vs</Text>
          )}
        </View>
        <Text style={[styles.teamName, styles.teamAway]} numberOfLines={1}>
          {match.away.shortName}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  cardLive: {
    borderColor: colors.turf,
    backgroundColor: colors.surfaceRaised,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.live,
  },
  liveText: {
    ...type.caption,
    color: colors.live,
  },
  statusText: {
    ...type.caption,
    color: colors.muted,
  },
  streamText: {
    ...type.caption,
    color: colors.turf,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamName: {
    ...type.body,
    color: colors.line,
    flex: 1,
    fontWeight: "700",
  },
  teamAway: {
    textAlign: "right",
  },
  scoreBox: {
    minWidth: 84,
    alignItems: "center",
  },
  score: {
    ...type.score,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  scoreLive: {
    color: colors.turf,
  },
  vs: {
    ...type.body,
    color: colors.faint,
  },
});
