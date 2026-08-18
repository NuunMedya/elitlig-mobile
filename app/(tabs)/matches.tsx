import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScopeBar } from "@/components/ScopeBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { YoutubeBanner } from "@/components/YoutubeBanner";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getMatches } from "@/lib/api/matches";
import { formatDayHeading, formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { getPanelMe } from "@/lib/api/panel";
import type { ApiMatch } from "@/lib/types";

type Tab = "results" | "fixtures" | "live";

const TABS: { key: Tab; label: string }[] = [
  { key: "results", label: "Sonuçlar" },
  { key: "fixtures", label: "Fikstür" },
  { key: "live", label: "Canlı" },
];

/**
 * Maç Merkezi — sitedeki Maçlar sayfasının mobil karşılığı.
 *
 * Üstte Canlı / Planlanan / Tamamlanan sayaçları, altın aktif sekme hapları,
 * takım arama kutusu; liste tarihe göre gruplanır (sağda "N maç"), satırlar
 * sitedeki gibi ortalanır: TAKIM amblem SKOR amblem TAKIM.
 *
 * Tek /maclar isteği üç sekmeye burada ayrılır; limit sezonun tamamını
 * kapsayacak kadar geniştir — ilk haftadan son maça kadar hepsi listelenir.
 */
export default function MatchesScreen() {
  const scope = useScope();
  const teams = useTeamLogos();
  const auth  = useAuth();
  const [tab, setTab] = useState<Tab>("results");
  const [search, setSearch] = useState("");
  const [myTeamOnly, setMyTeamOnly] = useState(false);

  const panelQ = useQuery({
    queryKey: ["panel","me"],
    queryFn: getPanelMe,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  const myTeamId   = panelQ.data?.playerTeam?.id ?? panelQ.data?.team?.id ?? null;
  const myTeamName = panelQ.data?.playerTeam?.team_name ?? panelQ.data?.team?.team_name ?? null;

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const query = useQuery({
    queryKey: queryKeys.matches(scopeKey),
    queryFn: () =>
      getMatches({ leagueId: scope.leagueId!, seasonId: scope.seasonId!, limit: 1000 }),
    enabled: scope.ready,
    refetchInterval: 60_000,
  });

  const buckets = useMemo(() => split(query.data ?? []), [query.data]);



  // Haftalık: bu haftanın günleri
  const weekDays = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, []);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const visible = useMemo(() => {
    let list = buckets[tab];
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (q) list = list.filter(m =>
      m.first_team_name.toLocaleLowerCase("tr-TR").includes(q) ||
      m.second_team_name.toLocaleLowerCase("tr-TR").includes(q));
    if (myTeamOnly && (myTeamId || myTeamName)) {
      list = list.filter(m =>
        (myTeamId && (Number(m.home_team_id) === myTeamId || Number(m.away_team_id) === myTeamId)) ||
        (myTeamName && (m.first_team_name === myTeamName || m.second_team_name === myTeamName)));
    }
    if (selectedDay) {
      list = list.filter(m => String(m.date).slice(0,10) === selectedDay);
    }
    return list;
  }, [buckets, tab, search, myTeamOnly, myTeamId, myTeamName, selectedDay]);

  const sections = useMemo(() => groupByDay(visible, tab), [visible, tab]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Maçlar" />
      <ScopeBar />

      <View style={styles.counters}>
        <Counter label="CANLI" value={buckets.live.length} accent={buckets.live.length > 0} />
        <View style={styles.counterDivider} />
        <Counter label="PLANLANAN" value={buckets.fixtures.length} />
        <View style={styles.counterDivider} />
        <Counter label="TAMAMLANAN" value={buckets.results.length} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((item) => {
          const active = item.key === tab;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={({ pressed }) => [
                styles.tab,
                active && styles.tabActive,
                pressed && styles.tabPressed,
              ]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {item.label}
                {item.key === "live" && buckets.live.length > 0
                  ? ` (${buckets.live.length})`
                  : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Takım ara..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {/* Haftalık takvim (fikstür sekmesinde) */}
      {tab === "fixtures" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekRow}>
          <Pressable
            onPress={() => setSelectedDay(null)}
            style={[styles.dayChip, !selectedDay && styles.dayChipActive]}
          >
            <Text style={[styles.dayChipTxt, !selectedDay && styles.dayChipTxtActive]}>Tümü</Text>
          </Pressable>
          {weekDays.map((d) => {
            const iso = d.toISOString().slice(0,10);
            const active = selectedDay === iso;
            const isToday = iso === new Date().toISOString().slice(0,10);
            const hasMatch = buckets.fixtures.some(m => String(m.date).slice(0,10) === iso);
            return (
              <Pressable key={iso} onPress={() => setSelectedDay(active ? null : iso)}
                style={[styles.dayChip, active && styles.dayChipActive, !hasMatch && styles.dayChipDim]}>
                <Text style={[styles.dayChipDay, active && styles.dayChipTxtActive]}>
                  {d.toLocaleDateString("tr-TR",{weekday:"short"}).toLocaleUpperCase("tr-TR")}
                </Text>
                <Text style={[styles.dayChipNum, active && styles.dayChipTxtActive, isToday && styles.dayToday]}>
                  {d.getDate()}
                </Text>
                {hasMatch ? <View style={[styles.dayDot, active && styles.dayDotActive]} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Takımımın Maçları filtresi */}
      {auth.user && myTeamName ? (
        <Pressable
          onPress={() => setMyTeamOnly(!myTeamOnly)}
          style={[styles.myTeamBtn, myTeamOnly && styles.myTeamBtnActive]}
        >
          <Ionicons name="football-outline" size={13} color={myTeamOnly ? colors.surface : colors.turf} />
          <Text style={[styles.myTeamTxt, myTeamOnly && styles.myTeamTxtActive]}>
            {myTeamName}
          </Text>
          {myTeamOnly ? <Ionicons name="close" size={13} color={colors.surface} /> : null}
        </Pressable>
      ) : null}

      {tab === "live" && (
        <View style={{ paddingHorizontal: spacing.md }}>
          <YoutubeBanner cityLabel={scope.cityLabel} live={buckets.live.length > 0} />
        </View>
      )}

      {scope.loading || (query.isLoading && scope.ready) ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !scope.ready ? (
        <EmptyState
          icon="options-outline"
          title="Lig seçilmedi"
          body="Yukarıdan şehir, lig ve sezon seçerek başlayın."
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, index, section }) => (
            <MatchRow
              match={item}
              first={index === 0}
              last={index === section.data.length - 1}
              homeLogo={teams.logoFor(item.home_team_id, item.first_team_name)}
              awayLogo={teams.logoFor(item.away_team_id, item.second_team_name)}
            />
          )}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionCount}>{section.data.length} maç</Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={query.refetch}
              tintColor={colors.turf}
            />
          }
          ListEmptyComponent={<EmptyForTab tab={tab} searching={search.length > 0} />}
        />
      )}
    </SafeAreaView>
  );
}

/** Sitedeki satır düzeni: TAKIM amblem SKOR amblem TAKIM, ortalanmış. */
function MatchRow({
  match,
  first,
  last,
  homeLogo,
  awayLogo,
}: {
  match: ApiMatch;
  first: boolean;
  last: boolean;
  homeLogo?: string | null;
  awayLogo?: string | null;
}) {
  const router = useRouter();
  const state = matchState(match);
  const played = state !== "scheduled";

  const hs = Number(match.first_team_score ?? 0);
  const as = Number(match.second_team_score ?? 0);
  const homeWin = played && hs > as;
  const awayWin = played && as > hs;
  const isLive  = state === "live";

  return (
    <Pressable
      onPress={() => router.push(`/mac/${match.id}`)}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        isLive && styles.rowLive,
        pressed && styles.rowPressed,
      ]}
    >
      {/* Ev sahibi */}
      <View style={styles.teamCol}>
        <TeamCrest name={match.first_team_name} logo={homeLogo} size={28} />
        <Text style={[styles.team, homeWin && styles.teamWin, awayWin && styles.teamLose]} numberOfLines={1}>
          {match.first_team_name.toLocaleUpperCase("tr-TR")}
        </Text>
      </View>

      {/* Orta: skor veya saat + CANLI rozeti */}
      <View style={styles.scoreCol}>
        {isLive ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTxt}>CANLI</Text>
          </View>
        ) : null}
        {played ? (
          <Text style={[styles.rowScore, isLive && styles.rowScoreLive]}>
            {hs} - {as}
          </Text>
        ) : (
          <View style={styles.timePill}>
            <Text style={styles.timeText}>{formatTime(match.time) || "—"}</Text>
          </View>
        )}
        {played && !isLive ? (
          <Text style={styles.resultLabel}>
            {homeWin ? "MS" : awayWin ? "MS" : "BER"}
          </Text>
        ) : null}
      </View>

      {/* Deplasman */}
      <View style={[styles.teamCol, styles.teamColAway]}>
        <TeamCrest name={match.second_team_name} logo={awayLogo} size={28} />
        <Text style={[styles.team, awayWin && styles.teamWin, homeWin && styles.teamLose]} numberOfLines={1}>
          {match.second_team_name.toLocaleUpperCase("tr-TR")}
        </Text>
      </View>
    </Pressable>
  );
}

function Counter({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <View style={styles.counter}>
      <Text style={styles.counterLabel}>{label}</Text>
      <Text style={[styles.counterValue, accent && styles.counterValueAccent]}>
        {value}
      </Text>
    </View>
  );
}

/** Maçları duruma göre üçe ayırır. */
function split(matches: ApiMatch[]) {
  const live: ApiMatch[] = [];
  const fixtures: ApiMatch[] = [];
  const results: ApiMatch[] = [];

  matches.forEach((match) => {
    const state = matchState(match);
    if (state === "live") live.push(match);
    else if (state === "scheduled") fixtures.push(match);
    else results.push(match);
  });

  fixtures.sort(byKickoff("asc"));
  results.sort(byKickoff("desc"));
  live.sort(byKickoff("asc"));

  return { live, fixtures, results };
}

const byKickoff = (direction: "asc" | "desc") => (a: ApiMatch, b: ApiMatch) => {
  const at = Date.parse(`${String(a.date).slice(0, 10)}T${a.time || "00:00:00"}`);
  const bt = Date.parse(`${String(b.date).slice(0, 10)}T${b.time || "00:00:00"}`);
  const diff = (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
  return direction === "asc" ? diff : -diff;
};

/** Gün başlıkları. Canlı sekmesinde tarih anlamsız olduğu için gruplanmaz. */
function groupByDay(matches: ApiMatch[], tab: Tab) {
  if (tab === "live") return [{ title: "", data: matches }];

  const map = new Map<string, ApiMatch[]>();
  matches.forEach((match) => {
    const key = String(match.date).slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(match);
    map.set(key, list);
  });

  return Array.from(map, ([date, data]) => ({
    title: formatDayHeading(date).toLocaleUpperCase("tr-TR"),
    data,
  }));
}

function EmptyForTab({ tab, searching }: { tab: Tab; searching: boolean }) {
  if (searching) {
    return (
      <EmptyState
        icon="search-outline"
        title="Eşleşen maç yok"
        body="Farklı bir takım adı deneyin."
      />
    );
  }
  if (tab === "live") {
    return (
      <EmptyState
        icon="radio-outline"
        title="Şu anda canlı maç yok"
        body="Maç başladığında skor burada anlık olarak akar."
      />
    );
  }
  if (tab === "fixtures") {
    return (
      <EmptyState
        icon="calendar-outline"
        title="Yaklaşan maç yok"
        body="Fikstür açıklandığında burada görünecek."
      />
    );
  }
  return (
    <EmptyState
      icon="trophy-outline"
      title="Henüz oynanmış maç yok"
      body="Sezon başladığında sonuçlar burada listelenir."
    />
  );
}

const styles = StyleSheet.create({
  weekRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  dayChip: { alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.faint, backgroundColor: colors.surface, minWidth: 44, gap: 2 },
  dayChipActive: { backgroundColor: colors.turf, borderColor: colors.turf },
  dayChipDim: { opacity: 0.4 },
  dayChipTxt: { fontSize: 11, fontWeight: "700", color: colors.muted },
  dayChipTxtActive: { color: "#FFF" },
  dayChipDay: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3, color: colors.muted },
  dayChipNum: { fontSize: 14, fontWeight: "900", color: colors.line },
  dayToday: { color: colors.turf },
  dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.turf },
  dayDotActive: { backgroundColor: "#FFF" },
  myTeamBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.turfDim, borderRadius: radius.pill, paddingHorizontal: spacing.sm+4, paddingVertical: 6, borderWidth: 1, borderColor: colors.turf+"55" },
  myTeamBtnActive: { backgroundColor: colors.turf },
  myTeamTxt: { fontSize: 11, fontWeight: "800", color: colors.turf },
  myTeamTxtActive: { color: "#FFF" },
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  counters: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
  },
  counter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  counterDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: colors.faint,
  },
  counterLabel: {
    ...type.caption,
    fontSize: 10,
    color: colors.muted,
  },
  counterValue: {
    ...type.subtitle,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  counterValueAccent: {
    color: colors.live,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: colors.goldDim,
    borderColor: colors.yellow,
  },
  tabPressed: {
    opacity: 0.8,
  },
  tabText: {
    ...type.caption,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.line,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.pill,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    ...type.small,
    color: colors.line,
    flex: 1,
    padding: 0,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...type.caption,
    color: colors.turf,
  },
  sectionCount: {
    ...type.caption,
    color: colors.muted,
  },
  teamCol: { flex: 1, alignItems: "center", gap: 4 },
  teamColAway: { },
  teamWin: { fontWeight: "900", color: colors.green },
  teamLose: { color: colors.muted, fontWeight: "500" },
  scoreCol: { alignItems: "center", gap: 2, paddingHorizontal: 4 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.live+"18", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.live },
  liveTxt: { fontSize: 8, fontWeight: "900", color: colors.live, letterSpacing: 0.5 },
  rowLive: { borderColor: colors.live+"55", backgroundColor: colors.live+"08" },
  resultLabel: { fontSize: 8, fontWeight: "700", color: colors.muted, letterSpacing: 0.3 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    borderWidth: 1,
    borderColor: colors.faint,
    borderBottomWidth: 0,
  },
  rowFirst: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  rowPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  team: {
    ...type.small,
    color: colors.line,
    fontWeight: "700",
    flex: 1,
  },
  teamHome: {
    textAlign: "right",
  },
  teamAway: {
    textAlign: "left",
  },
  rowScore: {
    ...type.body,
    color: colors.turf,
    fontWeight: "800",
    minWidth: 52,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  rowScoreLive: {
    color: colors.live,
  },
  timePill: {
    minWidth: 52,
    alignItems: "center",
    backgroundColor: colors.goldDim,
    borderRadius: radius.pill,
    paddingVertical: 3,
  },
  timeText: {
    ...type.caption,
    color: colors.line,
  },
});
