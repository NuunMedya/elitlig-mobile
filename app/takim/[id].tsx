import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import ViewShot from "react-native-view-shot";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { PlayerAvatar, TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { getTeamMatches } from "@/lib/api/matches";
import { getPlayerRankings } from "@/lib/api/players";
import { getStandings } from "@/lib/api/standings";
import { getTeam } from "@/lib/api/teams";
import { addMatchToCalendar } from "@/lib/calendar";
import { formatDateShort, mediaUrl, formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiMatch, PlayerRankRow, StandingRow } from "@/lib/types";

/**
 * Takım profili — sitedeki takım sayfasının (alt sekmeleriyle) mobil hali.
 *
 * Üstte kimlik + bu sezon kartı (sıra, puan, form — puan tablosundan) ve tüm
 * zamanlar şeridi; altta üç sekme: Sonuçlar (takım gözünden G/B/M rozetli),
 * Fikstür (takvime ekle kısayollu) ve Kadro (sezon katkılarıyla, oyuncu
 * sıralamalarından teamId süzülerek). Sezonluk bölümler takım geçerli
 * kapsamda değilse kendini gizler; maç listesi kapsamdan bağımsızdır.
 */

type Tab = "results" | "fixtures" | "squad";

export default function TeamDetailScreen() {
  const [h2hOpen, setH2hOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFmt, setShareFmt] = useState<"story"|"post">("story");
  const [shareBusy, setShareBusy] = useState(false);
  const shotRef = useRef<any>(null);
  const CW = 272;
  const FMTS = {
    story: { label: "Hikaye 9:16", h: Math.round(CW*16/9) },
    post:  { label: "Gonderi 3:4", h: Math.round(CW*4/3) },
  } as const;
  const doShare = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const uri = await shotRef.current?.capture?.();
      if (uri) await Sharing.shareAsync(uri, { mimeType:"image/png" });
    } catch {} finally { setShareBusy(false); }
  };
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = Number(id);
  const validId = Number.isFinite(teamId) && teamId > 0;
  const router = useRouter();
  const scope = useScope();
  const logos = useTeamLogos();
  const { isFavorite, toggleFavorite } = useFavorite();
  const [tab, setTab] = useState<Tab>("results");

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const teamQuery = useQuery({
    queryKey: queryKeys.team(teamId),
    queryFn: () => getTeam(teamId),
    enabled: validId,
  });

  const matchesQuery = useQuery({
    queryKey: queryKeys.teamMatches(teamId),
    queryFn: () => getTeamMatches(teamId),
    enabled: validId,
    staleTime: 60_000,
  });

  const standingsQuery = useQuery({
    queryKey: queryKeys.standings(scopeKey),
    queryFn: () =>
      getStandings({ cityId: scope.cityId!, leagueId: scope.leagueId!, seasonId: scope.seasonId! }),
    enabled: scope.ready,
  });

  const squadQuery = useQuery({
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: scope.ready,
    staleTime: 5 * 60_000,
  });

  const team = teamQuery.data;
  const teamName = team?.team_name ?? "";

  const standing = useMemo(() => {
    const rows = standingsQuery.data ?? [];
    const index = rows.findIndex((row) => Number(row.team_id) === teamId);
    return index >= 0 ? { row: rows[index] as StandingRow, position: index + 1 } : null;
  }, [standingsQuery.data, teamId]);

  const { upcoming, recent } = useMemo(
    () => splitByState(matchesQuery.data ?? []),
    [matchesQuery.data]
  );

  const squad = useMemo(() => {
    const players = squadQuery.data?.players ?? [];
    return players
      .filter((player) => Number(player.teamId) === teamId)
      .sort(
        (a, b) =>
          (Number(b.points) || 0) - (Number(a.points) || 0) ||
          (Number(b.goals) || 0) - (Number(a.goals) || 0)
      );
  }, [squadQuery.data, teamId]);

  if (teamQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Takım" />
        <Loading />
      </SafeAreaView>
    );
  }

  if (teamQuery.isError || !team) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Takım" />
        <ErrorState error={teamQuery.error} onRetry={teamQuery.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title={team.team_name} subtitle={team.current_league ?? team.city ?? undefined} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={matchesQuery.isRefetching}
            onRefresh={() => {
              matchesQuery.refetch();
              standingsQuery.refetch();
              squadQuery.refetch();
            }}
            tintColor={colors.turf}
          />
        }
      >
        {/* Kimlik */}
        <View style={styles.hero}>
          <TeamCrest name={team.team_name} logo={team.logo} size={76} />
          <Text style={styles.teamName}>{team.team_name}</Text>
          {team.city ? <Text style={styles.teamMeta}>{team.city}</Text> : null}
          <Pressable
            onPress={() => toggleFavorite({ id: teamId, name: team.team_name })}
            hitSlop={10}
            style={({ pressed }) => [
              styles.favBtn,
              isFavorite(teamId) && styles.favBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={isFavorite(teamId) ? "star" : "star-outline"}
              size={16}
              color={isFavorite(teamId) ? colors.yellow : colors.muted}
            />
            <Text style={[styles.favText, isFavorite(teamId) && styles.favTextActive]}>
              {isFavorite(teamId) ? "Takımım" : "Takımım yap"}
            </Text>
          </Pressable>
        </View>

        {/* Bu sezon: puan tablosundan */}
        {standing ? (
          <View style={styles.seasonCard}>
            <Text style={styles.cardKicker}>BU SEZON · {scope.leagueLabel}</Text>
            <View style={styles.seasonRow}>
              <SeasonStat label="SIRA" value={`${standing.position}.`} highlight />
              <SeasonStat label="PUAN" value={String(standing.row.display_points)} highlight />
              <SeasonStat label="O" value={String(standing.row.played)} />
              <SeasonStat label="AV" value={String(standing.row.goal_diff)} />
              {standing.row.last5 ? <FormChips last5={standing.row.last5} /> : null}
            </View>
          </View>
        ) : null}

        {/* Takım Analizi */}
        {standing ? (
          <View style={styles.analysisCard}>
            <View style={styles.analysisHeader}>
              <Ionicons name="bar-chart-outline" size={14} color={colors.turf} />
              <Text style={styles.analysisKicker}>TAKİM ANALİZİ</Text>
            </View>
            <Text style={styles.analysisText}>
              {buildAnalysis(standing.row, team.team_name, standing.position)}
            </Text>
          </View>
        ) : null}

        {/* Takımın Yıldızları */}
        {squad.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>TAKIM YILDIZLARI</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.starsRow}>
              {squad.slice(0, 5).map((player, index) => (
                <Pressable
                  key={player.id}
                  onPress={() => router.push(`/oyuncu/${player.id}`)}
                  style={({ pressed }) => [styles.starCard, pressed && styles.pressed]}
                >
                  {/* Sıra rozeti */}
                  <View style={[styles.starRank, index === 0 && styles.starRankGold]}>
                    <Text style={styles.starRankTxt}>
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`}
                    </Text>
                  </View>

                  <PlayerAvatar name={player.name} image={player.image} size={52} />

                  <Text style={styles.starName} numberOfLines={2}>
                    {player.name.toLocaleUpperCase("tr-TR")}
                  </Text>

                  <View style={styles.starStats}>
                    <View style={styles.starStat}>
                      <Text style={styles.starStatVal}>{player.goals ?? 0}</Text>
                      <Text style={styles.starStatLbl}>GOL</Text>
                    </View>
                    <View style={styles.starDivider} />
                    <View style={styles.starStat}>
                      <Text style={styles.starStatVal}>{player.points ?? 0}</Text>
                      <Text style={styles.starStatLbl}>PUAN</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* Takım Paylaş butonu */}
        <Pressable
          onPress={() => setShareOpen(true)}
          style={({pressed}) => [styles.shareBtn, pressed && styles.pressed]}
        >
          <Ionicons name="share-social-outline" size={16} color={colors.turf} />
          <Text style={styles.shareBtnText}>Takımı Paylaş</Text>
        </Pressable>

        {/* H2H Karşılaştır */}
        {(standingsQuery.data ?? []).length > 1 ? (
          <>
            <Pressable
              onPress={() => setH2hOpen(true)}
              style={({ pressed }) => [styles.h2hBtn, pressed && styles.pressed]}
            >
              <Ionicons name="swap-horizontal-outline" size={16} color={colors.turf} />
              <Text style={styles.h2hBtnText}>H2H Karşılaştır</Text>
              <Ionicons name="chevron-down" size={14} color={colors.muted} />
            </Pressable>

            <Modal visible={h2hOpen} animationType="slide" onRequestClose={() => setH2hOpen(false)} transparent>
              <View style={styles.h2hOverlay}>
                <View style={styles.h2hSheet}>
                  <View style={styles.h2hSheetHead}>
                    <Text style={styles.h2hSheetTitle}>Rakip Seç</Text>
                    <Pressable onPress={() => setH2hOpen(false)} hitSlop={10}>
                      <Ionicons name="close" size={20} color={colors.line} />
                    </Pressable>
                  </View>
                  <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
                  {(standingsQuery.data ?? [])
                    .filter((row) => Number(row.team_id) !== teamId)
                    .map((row) => (
                      <Pressable
                        key={row.team_id}
                        onPress={() => {
                          setH2hOpen(false);
                          router.push({
                            pathname: "/h2h",
                            params: {
                              homeId: String(teamId),
                              homeName: team.team_name,
                              awayId: String(row.team_id),
                              awayName: row.team_name,
                            },
                          });
                        }}
                        style={({ pressed }) => [styles.h2hTeamRow, pressed && styles.pressed]}
                      >
                        <TeamCrest name={row.team_name} logo={row.logo} size={26} />
                        <Text style={styles.h2hTeamName} numberOfLines={1}>{row.team_name}</Text>
                        <Text style={styles.h2hTeamPts}>{row.display_points} puan</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </Modal>
          </>
        ) : null}

        {/* Tüm zamanlar */}
        <View style={styles.statsCard}>
          <Text style={styles.cardKicker}>TÜM ZAMANLAR</Text>
          <View style={styles.statsRow}>
            <Stat label="Maç" value={team.total_matches} />
            <Stat label="G" value={team.team_wins} />
            <Stat label="B" value={team.team_draws} />
            <Stat label="M" value={team.team_losses} />
            <Stat label="A" value={team.goals_scored} />
            <Stat label="Y" value={team.goals_conceded} />
          </View>
        </View>

        {/* Sekmeler */}
        <View style={styles.tabs}>
          <TabButton label="Sonuçlar" active={tab === "results"} onPress={() => setTab("results")} />
          <TabButton label="Fikstür" active={tab === "fixtures"} onPress={() => setTab("fixtures")} />
          <TabButton label="Kadro" active={tab === "squad"} onPress={() => setTab("squad")} />
        </View>

        {matchesQuery.isLoading ? (
          <Loading />
        ) : tab === "results" ? (
          recent.length ? (
            recent.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                teamId={teamId}
                teamName={teamName}
                logoFor={logos.logoFor}
                onPress={() => router.push(`/mac/${match.id}`)}
              />
            ))
          ) : (
            <EmptyState
              icon="football-outline"
              title="Sonuç yok"
              body="Bu takımın oynanmış maçı bulunmuyor."
            />
          )
        ) : tab === "fixtures" ? (
          upcoming.length ? (
            upcoming.map((match) => (
              <FixtureRow
                key={match.id}
                match={match}
                teamId={teamId}
                teamName={teamName}
                logoFor={logos.logoFor}
                onPress={() => router.push(`/mac/${match.id}`)}
              />
            ))
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="Yaklaşan maç yok"
              body="Fikstüre maç eklendiğinde burada görünecek."
            />
          )
        ) : squadQuery.isLoading ? (
          <Loading />
        ) : squad.length ? (
          <>
            <Text style={styles.squadHint}>
              Bu sezon forma giyen oyuncular · {scope.seasonLabel}
            </Text>
            {squad.map((player, index) => (
              <SquadRow
                key={player.id}
                player={player}
                rank={index + 1}
                onPress={() => router.push(`/oyuncu/${player.id}`)}
              />
            ))}
          </>
        ) : (
          <EmptyState
            icon="shirt-outline"
            title="Kadro verisi yok"
            body="Seçili sezonda bu takım için oyuncu kaydı bulunmuyor. Üstteki seçicilerden takımın oynadığı lig ve sezonu seçmeyi deneyin."
          />
        )}
      </ScrollView>

      <Modal visible={shareOpen} animationType="slide" onRequestClose={()=>setShareOpen(false)} transparent>
        <View style={styles.shareOverlay}>
          <View style={styles.shareSheet}>
            {/* Format seçici */}
            <View style={styles.sFmtRow}>
              {(["story","post"] as const).map(k=>(
                <Pressable key={k} onPress={()=>setShareFmt(k)} style={({pressed})=>[styles.sFmtPill,shareFmt===k&&styles.sFmtActive,pressed&&styles.pressed]}>
                  <Text style={styles.sFmtTxt}>{FMTS[k].label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Kart */}
            <ViewShot ref={shotRef} options={{format:"png",quality:1}}>
              <View style={[styles.sCard,{height:FMTS[shareFmt].h}]}>
                <LinearGradient colors={["#6D28D9","#4C1D95"]} style={styles.sStrip}/>
                <LinearGradient colors={["#CDBFE8","#EFEAF7","#FFF"]} start={{x:0.2,y:0}} end={{x:0.5,y:1}} style={styles.sBody}>
                  <Text style={styles.sWm}>elitlig</Text>

                  {/* Başlık */}
                  <View style={styles.sTopRow}>
                    <Text style={styles.sBrand}>elitlig</Text>
                    <Text style={styles.sBrandR}>TAKIM İSTATİSTİKLERİ</Text>
                  </View>

                  {/* Takım */}
                  <View style={styles.sTeamRow}>
                    <TeamCrest name={team.team_name} logo={team.logo ? mediaUrl(team.logo) : undefined} size={52}/>
                    <View style={styles.sTeamInfo}>
                      <Text style={styles.sTeamName} numberOfLines={2}>{team.team_name.toLocaleUpperCase("tr-TR")}</Text>
                      {standing ? (
                        <View style={styles.sRankRow}>
                          <Text style={styles.sRankBadge}>{standing.position}. SIRA</Text>
                          <Text style={styles.sPoints}>{standing.row.display_points} PUAN</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {/* Ana istatistikler */}
                  {standing ? (
                    <View style={styles.sStats}>
                      {[
                        {l:"GALİBİYET", v:String(standing.row.wins)},
                        {l:"BERABERLİK", v:String(standing.row.draws)},
                        {l:"MAĞLUBİYET", v:String(standing.row.losses)},
                        {l:"OYNANAN", v:String(standing.row.played)},
                      ].map(st=>(
                        <View key={st.l} style={styles.sStat}>
                          <Text style={styles.sStatV}>{st.v}</Text>
                          <Text style={styles.sStatL}>{st.l}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {/* Gol durumu */}
                  {standing ? (
                    <View style={styles.sGoals}>
                      <View style={styles.sGoalItem}>
                        <Text style={styles.sGoalV}>{standing.row.goals_for}</Text>
                        <Text style={styles.sGoalL}>ATILAN</Text>
                      </View>
                      <View style={styles.sGoalDiv}/>
                      <View style={styles.sGoalItem}>
                        <Text style={[styles.sGoalV,{color:"#DC2626"}]}>{standing.row.goals_against}</Text>
                        <Text style={styles.sGoalL}>YENİLEN</Text>
                      </View>
                      <View style={styles.sGoalDiv}/>
                      <View style={styles.sGoalItem}>
                        <Text style={[styles.sGoalV,{color: standing.row.goal_diff>=0?"#178A50":"#DC2626"}]}>
                          {standing.row.goal_diff>0?"+":""}{standing.row.goal_diff}
                        </Text>
                        <Text style={styles.sGoalL}>AVERAJ</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Form */}
                  {standing?.row.last5 ? (
                    <View style={styles.sFormRow}>
                      <Text style={styles.sFormLabel}>SON FORM</Text>
                      {standing.row.last5.split("").map((c,i)=>(
                        <View key={i} style={[styles.sFormChip,{backgroundColor:c==="W"?"#178A50":c==="L"?"#DC2626":"#9188A4"}]}>
                          <Text style={styles.sFormTxt}>{c==="W"?"G":c==="L"?"M":"B"}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <View style={{flex:1}}/>
                  <Text style={styles.sFtr}>ELİTLİG.COM</Text>
                </LinearGradient>
              </View>
            </ViewShot>

            {/* Aksiyonlar */}
            <View style={styles.sActions}>
              <Pressable onPress={()=>setShareOpen(false)} style={({pressed})=>[styles.sActBtn,styles.sClose,pressed&&styles.pressed]}>
                <Text style={styles.sCloseTxt}>Kapat</Text>
              </Pressable>
              <Pressable onPress={doShare} style={({pressed})=>[styles.sActBtn,styles.sGo,pressed&&styles.pressed]}>
                <Ionicons name="share-social" size={15} color="#FFF"/>
                <Text style={styles.sGoTxt}>{shareBusy?"Hazirlaniyor":"Paylas"}</Text>
              </Pressable>
            </View>
            <Text style={styles.sHint}>Indirmek icin: Paylas - Goruntüyu Kaydet</Text>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

/* ===================== Yardımcılar ===================== */

function splitByState(matches: ApiMatch[]) {
  const upcoming: ApiMatch[] = [];
  const recent: ApiMatch[] = [];
  for (const match of matches) {
    const state = matchState(match);
    if (state === "scheduled") upcoming.push(match);
    else if (state === "finished") recent.push(match);
  }
  const timeOf = (m: ApiMatch) =>
    new Date(`${String(m.date).slice(0, 10)}T${m.time || "00:00:00"}`).getTime();
  upcoming.sort((a, b) => timeOf(a) - timeOf(b));
  recent.sort((a, b) => timeOf(b) - timeOf(a));
  return { upcoming, recent };
}

/** Maçı bu takımın gözünden okur: rakip, skorlar, sonuç. */
function perspective(match: ApiMatch, teamId: number, teamName: string) {
  const home =
    Number(match.home_team_id) === teamId || match.first_team_name === teamName;
  const ours = home ? match.first_team_score : match.second_team_score;
  const theirs = home ? match.second_team_score : match.first_team_score;
  const opponentName = home ? match.second_team_name : match.first_team_name;
  const opponentId = home ? match.away_team_id : match.home_team_id;
  const result =
    ours == null || theirs == null ? null : ours > theirs ? "W" : ours < theirs ? "L" : "D";
  return { home, ours, theirs, opponentName, opponentId, result };
}

/* ===================== Parçalar ===================== */

function SeasonStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.seasonStat}>
      <Text style={[styles.seasonValue, highlight && styles.seasonValueHi]}>{value}</Text>
      <Text style={styles.seasonLabel}>{label}</Text>
    </View>
  );
}

function FormChips({ last5 }: { last5: string }) {
  return (
    <View style={styles.form}>
      {last5
        .slice(-5)
        .split("")
        .map((result, index) => (
          <View
            key={`${result}-${index}`}
            style={[
              styles.chip,
              result === "W" ? styles.chipWin : result === "L" ? styles.chipLoss : styles.chipDraw,
            ]}
          >
            <Text style={styles.chipText}>
              {result === "W" ? "G" : result === "L" ? "M" : "B"}
            </Text>
          </View>
        ))}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MatchRow({
  match,
  teamId,
  teamName,
  logoFor,
  onPress,
}: {
  match: ApiMatch;
  teamId: number;
  teamName: string;
  logoFor: (id?: number | null, name?: string | null) => string | null;
  onPress: () => void;
}) {
  const view = perspective(match, teamId, teamName);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.matchRow, pressed && styles.pressed]}>
      <View
        style={[
          styles.resultBadge,
          view.result === "W"
            ? styles.chipWin
            : view.result === "L"
              ? styles.chipLoss
              : styles.chipDraw,
        ]}
      >
        <Text style={styles.resultBadgeText}>
          {view.result === "W" ? "G" : view.result === "L" ? "M" : "B"}
        </Text>
      </View>
      <TeamCrest name={view.opponentName} logo={logoFor(view.opponentId, view.opponentName)} size={30} />
      <View style={styles.matchBody}>
        <Text style={styles.opponent} numberOfLines={1}>
          {String(view.opponentName ?? "").toLocaleUpperCase("tr-TR")}
        </Text>
        <Text style={styles.matchMeta} numberOfLines={1}>
          {formatDateShort(match.date)}
          {match.match_field ? ` · ${match.match_field}` : ""}
          {view.home ? " · İç saha" : " · Deplasman"}
        </Text>
      </View>
      <Text style={styles.score}>
        {view.ours ?? "-"}
        <Text style={styles.scoreDash}> - </Text>
        {view.theirs ?? "-"}
      </Text>
    </Pressable>
  );
}

function FixtureRow({
  match,
  teamId,
  teamName,
  logoFor,
  onPress,
}: {
  match: ApiMatch;
  teamId: number;
  teamName: string;
  logoFor: (id?: number | null, name?: string | null) => string | null;
  onPress: () => void;
}) {
  const view = perspective(match, teamId, teamName);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.matchRow, pressed && styles.pressed]}>
      <View style={styles.dateBox}>
        <Text style={styles.dateText}>{formatDateShort(match.date)}</Text>
        <Text style={styles.timeText}>{formatTime(match.time)}</Text>
      </View>
      <TeamCrest name={view.opponentName} logo={logoFor(view.opponentId, view.opponentName)} size={30} />
      <View style={styles.matchBody}>
        <Text style={styles.opponent} numberOfLines={1}>
          {String(view.opponentName ?? "").toLocaleUpperCase("tr-TR")}
        </Text>
        <Text style={styles.matchMeta} numberOfLines={1}>
          {match.match_field ?? "Saha bilgisi yok"}
          {view.home ? " · İç saha" : " · Deplasman"}
        </Text>
      </View>
      <Pressable
        onPress={() => addMatchToCalendar(match)}
        hitSlop={8}
        style={({ pressed }) => [styles.calBtn, pressed && styles.pressed]}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.turf} />
      </Pressable>
    </Pressable>
  );
}

function SquadRow({
  player,
  rank,
  onPress,
}: {
  player: PlayerRankRow;
  rank: number;
  onPress: () => void;
}) {
  const num = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.matchRow, pressed && styles.pressed]}>
      <Text style={styles.squadRank}>{rank}</Text>
      <PlayerAvatar name={player.name} image={player.image} size={34} />
      <View style={styles.matchBody}>
        <Text style={styles.opponent} numberOfLines={1}>
          {player.name.toLocaleUpperCase("tr-TR")}
        </Text>
        <Text style={styles.matchMeta}>{num(player.matches)} maç</Text>
      </View>
      <SquadStat label="G" value={num(player.goals)} />
      <SquadStat label="A" value={num(player.assists)} />
      <View style={styles.pointsBadge}>
        <Text style={styles.pointsValue}>{num(player.points)}</Text>
        <Text style={styles.pointsLabel}>PUAN</Text>
      </View>
    </Pressable>
  );
}

function SquadStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.squadStat}>
      <Text style={[styles.squadStatValue, value > 0 && styles.squadStatLead]}>{value}</Text>
      <Text style={styles.squadStatLabel}>{label}</Text>
    </View>
  );
}

/* ===================== Stiller ===================== */

/** Takım performansını otomatik Türkçe metne dönüştürür. */
function buildAnalysis(row: StandingRow, teamName: string, position: number): string {
  const { played, wins, draws, losses, goals_for, goals_against, goal_diff, last5 } = row;
  if (!played) return `${teamName} henüz bu sezonda maç oynamamış.`;

  const winRate = Math.round((wins / played) * 100);
  const teamLabel = teamName;

  // Form dizisi
  const form = last5 ? String(last5).split("") : [];
  const lastWin  = form.filter((f) => f === "G").length;
  const lastLoss = form.filter((f) => f === "M").length;

  // Giriş cümlesi
  let text = `${teamLabel} bu sezon ${played} maç oynadı; ${wins} galibiyet, ${draws} beraberlik, ${losses} mağlubiyet aldı. `;

  // Puan + sıra
  text += `Ligde ${position}. sırada yer alıyor. `;

  // Gol dengesi
  if (goal_diff > 0) {
    text += `${goals_for} gol atıp ${goals_against} gol yiyerek +${goal_diff} averajla avantajlı konumda. `;
  } else if (goal_diff < 0) {
    text += `${goals_for} gol atıp ${goals_against} gol yiyerek ${goal_diff} averajla geride. `;
  } else {
    text += `${goals_for} gol atıp ${goals_against} gol yedi, averajı dengede. `;
  }

  // Galibiyet oranı yorumu
  if (winRate === 100) {
    text += "Mükemmel bir galibiyet oranıyla sezona damga vuruyor! 🔥";
  } else if (winRate >= 70) {
    text += `%${winRate} galibiyet oranıyla güçlü bir sezonu sürdürüyor. 💪`;
  } else if (winRate >= 50) {
    text += `%${winRate} galibiyet oranıyla ligde rekabetçi konumunu koruyor.`;
  } else if (winRate >= 30) {
    text += `%${winRate} galibiyet oranıyla iyileşme arayan bir grafik çiziyor.`;
  } else {
    text += "Zorlu bir dönemden geçiyor; toparlanma adına kritik maçlar önünde.";
  }

  // Son form notu
  if (form.length >= 3) {
    if (lastWin >= 3) {
      text += ` Son maçlardaki ${lastWin} galibiyet serisi moralleri yüksek tutmaya devam ediyor. ✅`;
    } else if (lastLoss >= 3) {
      text += ` Ancak son ${lastLoss} mağlubiyetle form kaybı yaşıyor. ⚠️`;
    }
  }

  return text.trim();
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  starsRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  starCard: {
    width: 110,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.faint,
    padding: spacing.sm,
    alignItems: "center",
    gap: 5,
  },
  starRank: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  starRankGold: { backgroundColor: "#FEF3C7" },
  starRankTxt: { fontSize: 11 },
  starName: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.line,
    textAlign: "center",
    letterSpacing: -0.1,
    lineHeight: 12,
  },
  starPos: {
    fontSize: 8,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
  },
  starStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.turfDim,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 6,
    width: "100%",
    justifyContent: "center",
  },
  starStat: { alignItems: "center", gap: 1 },
  starStatVal: {
    fontSize: 13,
    fontWeight: "900",
    color: colors.turf,
    fontVariant: ["tabular-nums"],
  },
  starStatLbl: {
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.muted,
  },
  starDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.faint,
  },
  shareBtn: { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:6, backgroundColor:colors.turfDim, borderRadius:radius.pill, paddingVertical:spacing.sm+2, marginBottom:spacing.sm },
  shareBtnText: { fontSize:13, fontWeight:"800", color:colors.turf },
  shareOverlay: { flex:1, backgroundColor:"rgba(0,0,0,0.75)", justifyContent:"flex-end" },
  shareSheet: { backgroundColor:"#1A1524", borderTopLeftRadius:20, borderTopRightRadius:20, padding:spacing.md, gap:spacing.md, alignItems:"center" as const, paddingBottom:36 },
  sFmtRow: { flexDirection:"row", gap:8 },
  sFmtPill: { borderRadius:20, borderWidth:1, borderColor:"rgba(255,255,255,0.35)", paddingHorizontal:14, paddingVertical:7 },
  sFmtActive: { backgroundColor:colors.turf, borderColor:colors.turf },
  sFmtTxt: { fontSize:12, fontWeight:"800", color:"#FFF" },
  sCard: { width:272, backgroundColor:"#0B0A0E", borderRadius:14, padding:7, overflow:"hidden" },
  sStrip: { height:7, borderTopLeftRadius:8, borderTopRightRadius:8 },
  sBody: { flex:1, borderBottomLeftRadius:8, borderBottomRightRadius:8, paddingHorizontal:spacing.md, paddingTop:spacing.sm, paddingBottom:spacing.sm, overflow:"hidden", gap:6 },
  sWm: { position:"absolute", right:-28, bottom:16, fontSize:60, fontWeight:"900", color:"#6D28D9", opacity:0.06, transform:[{rotate:"-12deg"}] },
  sTopRow: { flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  sBrand: { fontSize:13, fontWeight:"900", color:"#6D28D9" },
  sBrandR: { fontSize:7, fontWeight:"800", letterSpacing:1, color:"#6D28D9", opacity:0.7 },
  sTeamRow: { flexDirection:"row", alignItems:"center", gap:spacing.sm, backgroundColor:"rgba(255,255,255,0.7)", borderRadius:10, padding:8 },
  sTeamInfo: { flex:1, gap:4 },
  sTeamName: { fontSize:12, fontWeight:"900", color:"#0A0812", letterSpacing:-0.3, lineHeight:15 },
  sRankRow: { flexDirection:"row", alignItems:"center", gap:6 },
  sRankBadge: { fontSize:8, fontWeight:"800", color:"#FFF", backgroundColor:"#6D28D9", borderRadius:4, paddingHorizontal:5, paddingVertical:2 },
  sPoints: { fontSize:10, fontWeight:"900", color:"#5B21B6" },
  sStats: { flexDirection:"row", backgroundColor:"rgba(255,255,255,0.7)", borderRadius:10, padding:8 },
  sStat: { flex:1, alignItems:"center" as const, gap:1 },
  sStatV: { fontSize:16, fontWeight:"900", color:"#5B21B6", fontVariant:["tabular-nums"] as any },
  sStatL: { fontSize:5.5, fontWeight:"800", letterSpacing:0.3, color:"#9188A4", textAlign:"center" as const },
  sGoals: { flexDirection:"row", backgroundColor:"rgba(255,255,255,0.65)", borderRadius:8, padding:7 },
  sGoalItem: { flex:1, alignItems:"center" as const, gap:1 },
  sGoalV: { fontSize:14, fontWeight:"900", color:"#5B21B6", fontVariant:["tabular-nums"] as any },
  sGoalL: { fontSize:6, fontWeight:"800", letterSpacing:0.4, color:"#9188A4" },
  sGoalDiv: { width:1, backgroundColor:"rgba(0,0,0,0.08)" },
  sFormRow: { flexDirection:"row", alignItems:"center", gap:4 },
  sFormLabel: { fontSize:7, fontWeight:"800", letterSpacing:0.5, color:"#9188A4", marginRight:2 },
  sFormChip: { width:20, height:20, borderRadius:5, alignItems:"center" as const, justifyContent:"center" as const },
  sFormTxt: { fontSize:9, fontWeight:"900", color:"#FFF" },
  sFtr: { fontSize:7.5, fontWeight:"800", letterSpacing:2.5, color:"#9188A4", textAlign:"center" as const },
  sActions: { flexDirection:"row", gap:spacing.sm, width:"100%" },
  sActBtn: { flex:1, flexDirection:"row", alignItems:"center", justifyContent:"center", gap:6, borderRadius:radius.pill, paddingVertical:spacing.sm+2 },
  sClose: { backgroundColor:"rgba(255,255,255,0.1)" },
  sCloseTxt: { fontSize:14, fontWeight:"700", color:"#FFF" },
  sGo: { backgroundColor:colors.turf },
  sGoTxt: { fontSize:14, fontWeight:"800", color:"#FFF" },
  sHint: { fontSize:11, fontWeight:"600", color:"rgba(255,255,255,0.5)" },
  h2hBtn: { flexDirection:"row", alignItems:"center", gap:spacing.sm, backgroundColor:colors.turfDim, borderRadius:radius.md, padding:spacing.md, marginBottom:spacing.sm },
  h2hBtnText: { flex:1, fontSize:14, fontWeight:"800", color:colors.turf },
  h2hOverlay: { flex:1, backgroundColor:"rgba(0,0,0,0.6)", justifyContent:"flex-end" },
  h2hSheet: { backgroundColor:colors.surface, borderTopLeftRadius:20, borderTopRightRadius:20, paddingHorizontal:spacing.md, paddingBottom:36, maxHeight:"75%" as any },
  h2hSheetHead: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingVertical:spacing.md, borderBottomWidth:1, borderBottomColor:colors.faint, marginBottom:spacing.sm },
  h2hSheetTitle: { fontSize:16, fontWeight:"800", color:colors.line },
  h2hTeamRow: { flexDirection:"row", alignItems:"center", gap:spacing.sm, paddingVertical:spacing.sm+2, borderBottomWidth:1, borderBottomColor:colors.faint },
  h2hTeamName: { flex:1, fontSize:13, fontWeight:"700", color:colors.line },
  h2hTeamPts: { fontSize:12, fontWeight:"800", color:colors.turf },
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  teamName: {
    ...type.title,
    color: colors.line,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  teamMeta: {
    ...type.small,
    color: colors.muted,
  },
  favBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  favBtnActive: {
    borderColor: colors.yellow,
    backgroundColor: colors.goldDim + "55",
  },
  favText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  favTextActive: {
    color: colors.line,
  },
  analysisCard: {
    backgroundColor: colors.turfDim,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  analysisHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  analysisKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
  },
  analysisText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.line,
    lineHeight: 20,
  },
  seasonCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.turf,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardKicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
    marginBottom: spacing.sm,
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  seasonStat: {
    alignItems: "center",
  },
  seasonValue: {
    ...type.subtitle,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  seasonValueHi: {
    color: colors.turf,
  },
  seasonLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  form: {
    flexDirection: "row",
    gap: 3,
    marginLeft: "auto",
  },
  chip: {
    width: 15,
    height: 15,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  chipWin: { backgroundColor: colors.green },
  chipDraw: { backgroundColor: "#B9B5C6" },
  chipLoss: { backgroundColor: colors.live },
  chipText: {
    fontSize: 8,
    fontWeight: "800",
    color: colors.surface,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stat: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    ...type.subtitle,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.4,
    marginTop: 1,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
  },
  tabActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  tabText: {
    ...type.caption,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.surface,
  },
  matchRow: {
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
  resultBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  resultBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.surface,
  },
  matchBody: {
    flex: 1,
  },
  opponent: {
    ...type.small,
    color: colors.line,
    fontWeight: "700",
  },
  matchMeta: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  score: {
    ...type.subtitle,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  scoreDash: {
    color: colors.muted,
  },
  dateBox: {
    alignItems: "center",
    minWidth: 52,
  },
  dateText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.line,
  },
  timeText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 1,
  },
  calBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  squadHint: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginBottom: spacing.sm,
  },
  squadRank: {
    ...type.small,
    color: colors.muted,
    width: 20,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  squadStat: {
    alignItems: "center",
    width: 24,
  },
  squadStatValue: {
    ...type.small,
    color: colors.muted,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  squadStatLead: {
    color: colors.line,
    fontWeight: "800",
  },
  squadStatLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: colors.muted,
  },
  pointsBadge: {
    alignItems: "center",
    backgroundColor: colors.turfDim,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    minWidth: 46,
  },
  pointsValue: {
    ...type.small,
    color: colors.turf,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  pointsLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: colors.turf,
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
