import { useQueries, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PlayerAvatar } from "@/components/TeamCrest";
import { colors, radius, spacing } from "@/constants/theme";
import { getMatchKadro, getMatches } from "@/lib/api/matches";
import { formatDateShort } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiMatch, KadroPlayer } from "@/lib/types";

/**
 * Haftanın 7'si — son 7 günün kadro puanlarından tamamen otomatik seçilen
 * yeşil saha vitrini.
 *
 * Veri: kapsamdaki maç listesi (ana ekranla aynı önbellek) → son 7 günün
 * oynanmış maçları (en çok 12) → her birinin kadro puanları toplanır (maç
 * detayıyla aynı önbellek anahtarı kullanılır, mükerrer istek atılmaz).
 * Kaleci mevkiinden en yükseği kaleye, kalan en iyi 6 oyuncu 1-3-2 düzeninde
 * dizilir. Yeterli veri yoksa bölüm kendini gizler; misafir oyuncular
 * (profili olmayanlar) değerlendirmeye alınmaz.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MATCHES = 12;

interface Aggregated {
  id: number;
  name: string;
  image: string | null;
  isKeeper: boolean;
  total: number;
  matches: number;
}

export function WeekSeven() {
  const scope = useScope();
  const router = useRouter();
  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const matchesQuery = useQuery({
    queryKey: queryKeys.matches(scopeKey),
    queryFn: () =>
      getMatches({ leagueId: scope.leagueId!, seasonId: scope.seasonId!, limit: 300 }),
    enabled: scope.ready,
    staleTime: 60_000,
  });

  const weekMatches = useMemo(() => {
    const now = Date.now();
    const timeOf = (m: ApiMatch) =>
      new Date(`${String(m.date).slice(0, 10)}T${m.time || "00:00:00"}`).getTime();
    return (matchesQuery.data ?? [])
      .filter((m) => matchState(m) === "finished" && now - timeOf(m) <= WEEK_MS)
      .sort((a, b) => timeOf(b) - timeOf(a))
      .slice(0, MAX_MATCHES);
  }, [matchesQuery.data]);

  const kadroQueries = useQueries({
    queries: weekMatches.map((m) => ({
      queryKey: [...queryKeys.match(Number(m.id)), "kadro"] as const,
      queryFn: () => getMatchKadro(Number(m.id)),
      staleTime: 60 * 60_000,
    })),
  });

  const seven = useMemo(() => {
    if (weekMatches.length === 0) return null;
    if (kadroQueries.some((q) => q.isLoading)) return null;

    const pool = new Map<number, Aggregated>();
    const feed = (players: KadroPlayer[] | undefined) => {
      for (const p of players ?? []) {
        const id = Number(p.playerId ?? p.oyuncu_id ?? p.id);
        const points = Number(p.puan);
        if (!id || p.isGuest || !Number.isFinite(points)) continue;
        const name = String(p.playerName ?? "").trim();
        if (!name) continue;
        const entry = pool.get(id) ?? {
          id,
          name,
          image: p.playerImg ?? null,
          isKeeper: false,
          total: 0,
          matches: 0,
        };
        entry.total += points;
        entry.matches += 1;
        if (String(p.position ?? "").toLocaleLowerCase("tr-TR").includes("kaleci")) {
          entry.isKeeper = true;
        }
        if (!entry.image && p.playerImg) entry.image = p.playerImg;
        pool.set(id, entry);
      }
    };
    for (const q of kadroQueries) {
      feed(q.data?.home);
      feed(q.data?.away);
    }

    const ranked = [...pool.values()]
      .filter((p) => p.total > 0)
      .sort((a, b) => b.total - a.total);
    if (ranked.length < 7) return null;

    // Kaleci: mevkii kaleci olan en iyi oyuncu; hiç kaleci yoksa 7. sıradaki.
    const keeper = ranked.find((p) => p.isKeeper) ?? ranked[6];
    const outfield = ranked.filter((p) => p.id !== keeper.id).slice(0, 6);
    if (outfield.length < 6) return null;
    return { keeper, outfield };
  }, [kadroQueries, weekMatches]);

  if (!seven) return null;

  const rangeStart = formatDateShort(new Date(Date.now() - WEEK_MS).toISOString());
  const rangeEnd = formatDateShort(new Date().toISOString());

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>HAFTANIN 7'Sİ</Text>
        <Text style={styles.range}>
          {rangeStart} – {rangeEnd}
        </Text>
      </View>

      <View style={styles.pitch}>
        {/* Çim biçme şeritleri */}
        <View style={styles.stripes} pointerEvents="none">
          {Array.from({ length: 6 }).map((_, index) => (
            <View
              key={index}
              style={[styles.stripe, index % 2 === 1 && styles.stripeAlt]}
            />
          ))}
        </View>
        {/* Saha çizgileri */}
        <View style={styles.midLine} pointerEvents="none" />
        <View style={styles.centerCircle} pointerEvents="none" />
        <View style={styles.centerDot} pointerEvents="none" />
        <View style={[styles.penaltyBox, styles.penaltyBoxTop]} pointerEvents="none" />
        <View style={[styles.penaltyBox, styles.penaltyBoxBottom]} pointerEvents="none" />
        <View style={[styles.penaltyDot, styles.penaltyDotTop]} pointerEvents="none" />
        <View style={[styles.penaltyDot, styles.penaltyDotBottom]} pointerEvents="none" />

        {/* 1 forvet — haftanın en iyisi */}
        <View style={styles.row}>
          <Slot player={seven.outfield[0]} onPress={(id) => router.push(`/oyuncu/${id}`)} star />
        </View>
        {/* 3 orta saha */}
        <View style={styles.row}>
          {seven.outfield.slice(1, 4).map((p) => (
            <Slot key={p.id} player={p} onPress={(id) => router.push(`/oyuncu/${id}`)} />
          ))}
        </View>
        {/* 2 savunma */}
        <View style={styles.row}>
          {seven.outfield.slice(4, 6).map((p) => (
            <Slot key={p.id} player={p} onPress={(id) => router.push(`/oyuncu/${id}`)} />
          ))}
        </View>
        {/* kaleci */}
        <View style={styles.row}>
          <Slot player={seven.keeper} onPress={(id) => router.push(`/oyuncu/${id}`)} keeper />
        </View>
      </View>
    </View>
  );
}

function Slot({
  player,
  onPress,
  star,
  keeper,
}: {
  player: Aggregated;
  onPress: (id: number) => void;
  star?: boolean;
  keeper?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onPress(player.id)}
      style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
    >
      <View style={[styles.ring, star && styles.ringStar]}>
        <PlayerAvatar name={player.name} image={player.image} size={40} />
      </View>
      <Text style={styles.slotName} numberOfLines={1}>
        {shortName(player.name)}
        {keeper ? " 🧤" : ""}
      </Text>
      <Text style={styles.slotPoints}>{player.total} puan</Text>
    </Pressable>
  );
}

/** "Doğukan YILDIRIM" → "D. YILDIRIM" (dar alan için). */
function shortName(full: string) {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full.toLocaleUpperCase("tr-TR");
  const first = parts[0][0];
  const last = parts[parts.length - 1];
  return `${first}. ${last}`.toLocaleUpperCase("tr-TR");
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0A3520",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.yellow,
  },
  range: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9CC7AE",
  },
  pitch: {
    borderWidth: 2,
    borderColor: "#4C8F68",
    borderRadius: radius.sm + 2,
    paddingVertical: spacing.md,
    gap: spacing.md,
    overflow: "hidden",
    backgroundColor: "#0F4A2C",
  },
  stripes: {
    ...StyleSheet.absoluteFillObject,
  },
  stripe: {
    flex: 1,
    backgroundColor: "#0F4A2C",
  },
  stripeAlt: {
    backgroundColor: "#125534",
  },
  midLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 2,
    backgroundColor: "#3E7D58",
  },
  centerCircle: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -26,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#3E7D58",
  },
  centerDot: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#3E7D58",
  },
  penaltyBox: {
    position: "absolute",
    alignSelf: "center",
    width: "46%",
    height: 30,
    borderWidth: 2,
    borderColor: "#3E7D58",
  },
  penaltyBoxTop: {
    top: -2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  penaltyBoxBottom: {
    bottom: -2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  penaltyDot: {
    position: "absolute",
    alignSelf: "center",
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#3E7D58",
  },
  penaltyDotTop: {
    top: 40,
  },
  penaltyDotBottom: {
    bottom: 40,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "flex-start",
  },
  slot: {
    alignItems: "center",
    width: 86,
  },
  ring: {
    borderWidth: 2,
    borderColor: colors.yellow,
    borderRadius: 26,
    padding: 2,
  },
  ringStar: {
    borderColor: "#FFD54A",
    borderWidth: 3,
  },
  slotName: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 4,
    maxWidth: 84,
  },
  slotPoints: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.yellow,
    marginTop: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
