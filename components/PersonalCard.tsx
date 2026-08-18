import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { matchState } from "@/lib/match";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiMatch } from "@/lib/types";

/**
 * Kişisel hoş geldin kartı — girişli kullanıcıya ana ekranın tepesinde gösterilir.
 * Kullanıcı adıyla selam, takım logosu + sıralaması ve sıradaki maç geri sayımı.
 */
export function PersonalCard({
  userName,
  teamName,
  teamLogo,
  teamId,
  matches,
}: {
  userName: string;
  teamName: string | null;
  teamLogo: string | null;
  teamId: number | null;
  matches: ApiMatch[];
}) {
  const router = useRouter();
  const scope  = useScope();

  const firstName = userName.split(" ")[0];

  const nextMatch = useMemo(() => {
    if (!teamId && !teamName) return null;
    return matches
      .filter((m) => {
        const isMyTeam =
          Number(m.home_team_id) === teamId ||
          Number(m.away_team_id) === teamId ||
          m.first_team_name === teamName ||
          m.second_team_name === teamName;
        return isMyTeam && matchState(m) === "scheduled";
      })
      .sort((a, b) =>
        Date.parse(`${String(a.date).slice(0, 10)}T${a.time ?? "00:00:00"}`) -
        Date.parse(`${String(b.date).slice(0, 10)}T${b.time ?? "00:00:00"}`)
      )[0] ?? null;
  }, [matches, teamId, teamName]);

  const opponent = nextMatch
    ? Number(nextMatch.home_team_id) === teamId || nextMatch.first_team_name === teamName
      ? nextMatch.second_team_name
      : nextMatch.first_team_name
    : null;

  return (
    <LinearGradient
      colors={[colors.turf, "#4C1D95"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {/* Selam */}
      <View style={styles.greetRow}>
        <Text style={styles.greet}>Merhaba, {firstName} 👋</Text>
        {teamName ? (
          <Pressable
            onPress={() => teamId ? router.push(`/takim/${teamId}`) : null}
            style={({ pressed }) => [styles.teamChip, pressed && styles.pressed]}
          >
            {teamLogo ? <TeamCrest name={teamName} logo={teamLogo} size={20} /> : null}
            <Text style={styles.teamChipText} numberOfLines={1}>{teamName}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Sıradaki maç */}
      {nextMatch ? (
        <Pressable
          onPress={() => router.push(`/mac/${nextMatch.id}`)}
          style={({ pressed }) => [styles.matchBox, pressed && styles.pressed]}
        >
          <Text style={styles.matchLabel}>Sıradaki Maç</Text>
          <Text style={styles.matchOpponent} numberOfLines={1}>
            vs {String(opponent ?? "").toLocaleUpperCase("tr-TR")}
          </Text>
          <CountdownInline
            matchDate={String(nextMatch.date ?? "").slice(0, 10)}
            matchTime={nextMatch.time ? String(nextMatch.time).slice(0, 5) : null}
          />
        </Pressable>
      ) : (
        <View style={styles.matchBox}>
          <Text style={styles.matchLabel}>Takımına ait maç yok</Text>
          <Text style={styles.matchOpponent}>{scope.cityLabel}</Text>
        </View>
      )}
    </LinearGradient>
  );
}

function CountdownInline({ matchDate, matchTime }: { matchDate: string; matchTime: string | null }) {
  const target = useMemo(() => {
    try {
      const base = matchDate.slice(0, 10);
      const time = matchTime ?? "00:00";
      return new Date(`${base}T${time}:00`).getTime();
    } catch {
      return null;
    }
  }, [matchDate, matchTime]);

  const calc = () => {
    if (!target) return { h: 0, m: 0, s: 0 };
    const diff = Math.max(0, target - Date.now());
    return {
      h: Math.floor(diff / 3_600_000),
      m: Math.floor((diff % 3_600_000) / 60_000),
      s: Math.floor((diff % 60_000) / 1_000),
    };
  };

  const [tick, setTick] = useState(calc);
  const id = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    id.current = setInterval(() => setTick(calc()), 1_000);
    return () => { if (id.current) clearInterval(id.current); };
  }, [target]);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <View style={styles.countdown}>
      {[
        { val: pad(tick.h), label: "SAAT" },
        { val: pad(tick.m), label: "DAK" },
        { val: pad(tick.s), label: "SAN" },
      ].map((item, i) => (
        <View key={item.label} style={styles.countGroup}>
          {i > 0 ? <Text style={styles.sep}>:</Text> : null}
          <View style={styles.countBox}>
            <Text style={styles.countNum}>{item.val}</Text>
          </View>
          <Text style={styles.countLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  greetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  greet: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    flex: 1,
  },
  teamChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  teamChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    maxWidth: 120,
  },
  matchBox: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    gap: 4,
  },
  matchLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.65)",
  },
  matchOpponent: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  countdown: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    marginTop: 2,
  },
  countGroup: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  sep: {
    fontSize: 16,
    fontWeight: "900",
    color: "rgba(255,255,255,0.5)",
    paddingBottom: 8,
  },
  countBox: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 7,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  countNum: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  countLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 0.5,
    textAlign: "center",
    width: 40,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
