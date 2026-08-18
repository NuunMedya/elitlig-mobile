import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Image, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getTeamMatches } from "@/lib/api/matches";
import { getStandings } from "@/lib/api/standings";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import ViewShot from "react-native-view-shot";
import { formatDateShort } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import type { ApiMatch } from "@/lib/types";

/**
 * H2H — İki takımın geçmiş karşılaşmaları + form + skor özeti.
 * Params: homeId, homeName, awayId, awayName
 */
export default function H2HScreen() {
  const { homeId, homeName, awayId, awayName } = useLocalSearchParams<{
    homeId: string; homeName: string; awayId: string; awayName: string;
  }>();
  const scope = useScope();
  const router = useRouter();

  const hId = Number(homeId);
  const aId = Number(awayId);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFmt, setShareFmt] = useState<"story"|"post">("story");
  const FMTS = {
    story: { label: "Hikâye 9:16", h: Math.round(300 * 16 / 9) },
    post:  { label: "Gönderi 3:4", h: Math.round(300 * 4  / 3) },
  } as const;
  const shotRef = useRef<any>(null);
  const doShare = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const uri = await shotRef.current?.capture?.();
      if (uri) await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch {} finally { setShareBusy(false); }
  };

  const homeMatchesQ = useQuery({
    queryKey: queryKeys.teamMatches(hId),
    queryFn: () => getTeamMatches(hId),
    enabled: Boolean(hId),
    staleTime: 60_000,
  });
  const awayMatchesQ = useQuery({
    queryKey: queryKeys.teamMatches(aId),
    queryFn: () => getTeamMatches(aId),
    enabled: Boolean(aId),
    staleTime: 60_000,
  });
  const standingsQ = useQuery({
    queryKey: queryKeys.standings({ cityId: scope.cityId ?? undefined, leagueId: scope.leagueId ?? undefined, seasonId: scope.seasonId ?? undefined }),
    queryFn: () => getStandings({ cityId: scope.cityId!, leagueId: scope.leagueId!, seasonId: scope.seasonId! }),
    enabled: scope.ready,
    staleTime: 5 * 60_000,
  });

  const homeLower = String(homeName ?? "").trim().toLocaleLowerCase("tr-TR");
  const awayLower = String(awayName ?? "").trim().toLocaleLowerCase("tr-TR");
  const norm = (v?: string | null) => String(v ?? "").trim().toLocaleLowerCase("tr-TR");

  const involves = (m: ApiMatch) => {
    const a = Number(m.home_team_id), b = Number(m.away_team_id);
    if (hId && aId && a && b)
      return (a === hId && b === aId) || (a === aId && b === hId);
    const f = norm(m.first_team_name), s = norm(m.second_team_name);
    return (f === homeLower && s === awayLower) || (f === awayLower && s === homeLower);
  };
  const timeOf = (m: ApiMatch) => new Date(`${String(m.date).slice(0, 10)}T${m.time || "00:00:00"}`).getTime();

  const meetings = useMemo(() => {
    if (!homeMatchesQ.data) return [];
    return homeMatchesQ.data
      .filter((m) => matchState(m) === "finished" && involves(m))
      .sort((a, b) => timeOf(b) - timeOf(a))
      .slice(0, 8);
  }, [homeMatchesQ.data, hId, aId]);

  // Kazanma istatistikleri
  const stats = useMemo(() => {
    let hw = 0, aw = 0, d = 0, hg = 0, ag = 0;
    for (const m of meetings) {
      const isHomeSide = hId ? Number(m.home_team_id) === hId : norm(m.first_team_name) === homeLower;
      const fs = Number(m.first_team_score ?? 0);
      const ss = Number(m.second_team_score ?? 0);
      const homeScore = isHomeSide ? fs : ss;
      const awayScore = isHomeSide ? ss : fs;
      hg += homeScore; ag += awayScore;
      if (homeScore > awayScore) hw++;
      else if (homeScore < awayScore) aw++;
      else d++;
    }
    return { hw, aw, d, hg, ag, total: meetings.length };
  }, [meetings]);

  // Form (son 5 maç)
  const form = (matches: ApiMatch[] | undefined, teamId: number, teamName: string) => {
    if (!matches) return [];
    return matches
      .filter((m) => matchState(m) === "finished")
      .sort((a, b) => timeOf(b) - timeOf(a))
      .slice(0, 5)
      .map((m) => {
        const isHome = teamId ? Number(m.home_team_id) === teamId : norm(m.first_team_name) === norm(teamName);
        const fs = Number(m.first_team_score ?? 0), ss = Number(m.second_team_score ?? 0);
        const mine = isHome ? fs : ss, opp = isHome ? ss : fs;
        return mine > opp ? "W" : mine < opp ? "L" : "D";
      });
  };

  const homeForm = form(homeMatchesQ.data, hId, String(homeName));
  const awayForm = form(awayMatchesQ.data, aId, String(awayName));

  // Puan tablosundaki bilgiler
  const rows = standingsQ.data ?? [];
  const homeRow = rows.find((r) => Number(r.team_id) === hId);
  const awayRow = rows.find((r) => Number(r.team_id) === aId);
  const homePos = homeRow ? rows.indexOf(homeRow) + 1 : null;
  const awayPos = awayRow ? rows.indexOf(awayRow) + 1 : null;

  const formColor = (r: string) => r === "W" ? colors.green : r === "L" ? colors.live : "#B9B5C6";
  const formLetter = (r: string) => r === "W" ? "G" : r === "L" ? "M" : "B";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.line} />
        </Pressable>
        <Text style={styles.headerTitle}>H2H Karşılaştırma</Text>
        <Pressable onPress={() => setShareOpen(true)} hitSlop={10} style={styles.shareIconBtn}>
          <Ionicons name="share-social-outline" size={20} color={colors.turf} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Takım başlıkları */}
        <View style={styles.teamsRow}>
          <Pressable onPress={() => router.push(`/takim/${hId}`)} style={styles.teamCol}>
            <TeamCrest name={String(homeName)} logo={homeRow?.logo} size={52} />
            <Text style={styles.teamName} numberOfLines={2}>{String(homeName).toLocaleUpperCase("tr-TR")}</Text>
            {homePos ? <Text style={styles.teamPos}>{homePos}. sıra · {homeRow?.display_points ?? 0} puan</Text> : null}
          </Pressable>

          <View style={styles.vsCol}>
            <Text style={styles.vsText}>VS</Text>
            {stats.total > 0 ? (
              <Text style={styles.meetCount}>{stats.total} karşılaşma</Text>
            ) : null}
          </View>

          <Pressable onPress={() => router.push(`/takim/${aId}`)} style={[styles.teamCol, styles.teamColRight]}>
            <TeamCrest name={String(awayName)} logo={awayRow?.logo} size={52} />
            <Text style={styles.teamName} numberOfLines={2}>{String(awayName).toLocaleUpperCase("tr-TR")}</Text>
            {awayPos ? <Text style={styles.teamPos}>{awayPos}. sıra · {awayRow?.display_points ?? 0} puan</Text> : null}
          </Pressable>
        </View>

        {/* Skor özeti */}
        {stats.total > 0 && (
          <View style={styles.scoreCard}>
            <View style={styles.scoreCol}>
              <Text style={styles.scoreNum}>{stats.hw}</Text>
              <Text style={styles.scoreLabel}>GALİBİYET</Text>
            </View>
            <View style={styles.scoreCol}>
              <Text style={[styles.scoreNum, styles.drawNum]}>{stats.d}</Text>
              <Text style={styles.scoreLabel}>BERABERLİK</Text>
            </View>
            <View style={styles.scoreCol}>
              <Text style={[styles.scoreNum, styles.awayNum]}>{stats.aw}</Text>
              <Text style={styles.scoreLabel}>GALİBİYET</Text>
            </View>
          </View>
        )}

        {/* Gol istatistikleri */}
        {stats.total > 0 && (
          <View style={styles.statRow}>
            <Text style={styles.statVal}>{stats.hg}</Text>
            <Text style={styles.statLabel}>Toplam Gol</Text>
            <Text style={styles.statVal}>{stats.ag}</Text>
          </View>
        )}

        {/* Form karşılaştırması */}
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Son Form</Text>
          <View style={styles.formRow}>
            <View style={styles.formChips}>
              {homeForm.map((r, i) => (
                <View key={i} style={[styles.chip, { backgroundColor: formColor(r) }]}>
                  <Text style={styles.chipText}>{formLetter(r)}</Text>
                </View>
              ))}
            </View>
            <View style={styles.formChips}>
              {awayForm.map((r, i) => (
                <View key={i} style={[styles.chip, { backgroundColor: formColor(r) }]}>
                  <Text style={styles.chipText}>{formLetter(r)}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Geçmiş maçlar */}
        {meetings.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Geçmiş Karşılaşmalar</Text>
            {meetings.map((m) => {
              const isHomeSide = hId ? Number(m.home_team_id) === hId : norm(m.first_team_name) === homeLower;
              const fs = m.first_team_score, ss = m.second_team_score;
              const hScore = isHomeSide ? fs : ss;
              const aScore = isHomeSide ? ss : fs;
              const result = Number(hScore) > Number(aScore) ? "W" : Number(hScore) < Number(aScore) ? "L" : "D";
              return (
                <Pressable
                  key={m.id}
                  onPress={() => router.push(`/mac/${m.id}`)}
                  style={({ pressed }) => [styles.meetRow, pressed && styles.pressed]}
                >
                  <Text style={styles.meetDate}>{formatDateShort(String(m.date))}</Text>
                  <Text style={styles.meetScore} numberOfLines={1}>
                    {m.first_team_name} {fs ?? "-"} – {ss ?? "-"} {m.second_team_name}
                  </Text>
                  <View style={[styles.meetChip, { backgroundColor: formColor(result) }]}>
                    <Text style={styles.meetChipText}>{formLetter(result)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="football-outline" size={32} color={colors.muted} />
            <Text style={styles.emptyText}>Bu iki takım daha önce karşılaşmamış.</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={shareOpen} animationType="slide" onRequestClose={() => setShareOpen(false)} transparent>
        <View style={styles.shareOverlay}>
          <View style={styles.shareSheet}>
            <View style={styles.fmtRow}>
              {(["story","post"] as const).map(k=>(
                <Pressable key={k} onPress={()=>setShareFmt(k)} style={({pressed})=>[styles.fmtPill, shareFmt===k&&styles.fmtPillActive, pressed&&styles.pressed]}>
                  <Text style={styles.fmtTxt}>{FMTS[k].label}</Text>
                </Pressable>
              ))}
            </View>
            <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
              <View style={[styles.shareCard, { height: FMTS[shareFmt].h }]}>
                <LinearGradient colors={["#6D28D9", "#4C1D95"]} style={styles.shareStrip} />
                <LinearGradient colors={["#CDBFE8", "#EFEAF7", "#FFF"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.shareBody}>
                  <Text style={styles.shareWm}>elitlig</Text>
                  <View style={styles.shareTopRow}>
                    <Text style={styles.shareBrand}>elitlig</Text>
                    <Text style={styles.shareBrandR}>H2H KARŞILAŞTIRMA</Text>
                  </View>

                  {/* İki takım */}
                  <View style={styles.shareTeamsRow}>
                    <View style={styles.shareTeamCol}>
                      <TeamCrest name={String(homeName)} logo={homeRow?.logo} size={40} />
                      <Text style={styles.shareTeamName} numberOfLines={2}>{String(homeName).toLocaleUpperCase("tr-TR")}</Text>
                      {homePos ? <Text style={styles.shareTeamPos}>{homePos}. sıra</Text> : null}
                    </View>
                    <View style={styles.shareVsCol}>
                      <Text style={styles.shareVs}>VS</Text>
                      <Text style={styles.shareMeetCount}>{stats.total} maç</Text>
                    </View>
                    <View style={[styles.shareTeamCol, { alignItems: "flex-end" }]}>
                      <TeamCrest name={String(awayName)} logo={awayRow?.logo} size={40} />
                      <Text style={[styles.shareTeamName, { textAlign: "right" }]} numberOfLines={2}>{String(awayName).toLocaleUpperCase("tr-TR")}</Text>
                      {awayPos ? <Text style={[styles.shareTeamPos, { textAlign: "right" }]}>{awayPos}. sıra</Text> : null}
                    </View>
                  </View>

                  {/* Skor */}
                  <View style={styles.shareStat}>
                    <Text style={[styles.shareStatVal, { color: colors.green }]}>{stats.hw}</Text>
                    <View style={styles.shareStatMid}>
                      <Text style={styles.shareStatLabel}>GALİBİYET · BER · GALİBİYET</Text>
                      <Text style={styles.shareDrawVal}>{stats.d}</Text>
                    </View>
                    <Text style={[styles.shareStatVal, { color: colors.live }]}>{stats.aw}</Text>
                  </View>

                  {/* Gol */}
                  <View style={styles.shareGoals}>
                    <Text style={styles.shareGoalVal}>{stats.hg}</Text>
                    <Text style={styles.shareGoalLabel}>TOPLAM GOL</Text>
                    <Text style={styles.shareGoalVal}>{stats.ag}</Text>
                  </View>

                  {/* Form */}
                  <View style={styles.shareFormRow}>
                    <View style={styles.shareFormChips}>
                      {homeForm.map((r, i) => (
                        <View key={i} style={[styles.shareChip, { backgroundColor: r==="W"?colors.green:r==="L"?colors.live:"#B9B5C6" }]}>
                          <Text style={styles.shareChipTxt}>{r==="W"?"G":r==="L"?"M":"B"}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.shareFormLabel}>FORM</Text>
                    <View style={styles.shareFormChips}>
                      {awayForm.map((r, i) => (
                        <View key={i} style={[styles.shareChip, { backgroundColor: r==="W"?colors.green:r==="L"?colors.live:"#B9B5C6" }]}>
                          <Text style={styles.shareChipTxt}>{r==="W"?"G":r==="L"?"M":"B"}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <Text style={styles.shareFooter}>ELİTLİG.COM</Text>
                </LinearGradient>
              </View>
            </ViewShot>

            <View style={styles.shareActions}>
              <Pressable onPress={() => setShareOpen(false)} style={({ pressed }) => [styles.sActBtn, styles.sClose, pressed && styles.pressed]}>
                <Text style={styles.sCloseTxt}>Kapat</Text>
              </Pressable>
              <Pressable onPress={doShare} style={({ pressed }) => [styles.sActBtn, styles.sGo, pressed && styles.pressed]}>
                <Ionicons name="share-social" size={15} color="#FFF" />
                <Text style={styles.sGoTxt}>{shareBusy ? "Hazırlanıyor…" : "Paylaş"}</Text>
              </Pressable>
            </View>
            <Text style={styles.sHint}>İndirmek için: Paylaş → "Görüntüyü Kaydet"</Text>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pitch },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { ...type.subtitle, color: colors.line },
  content: { padding: spacing.md, gap: spacing.md },
  teamsRow: { flexDirection: "row", alignItems: "flex-start" },
  teamCol: { flex: 1, alignItems: "center", gap: 6 },
  teamColRight: { alignItems: "center" },
  teamName: { ...type.small, fontWeight: "800", color: colors.line, textAlign: "center" },
  teamPos: { fontSize: 10, fontWeight: "600", color: colors.muted, textAlign: "center" },
  vsCol: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, paddingTop: 12 },
  vsText: { fontSize: 18, fontWeight: "900", color: colors.muted },
  meetCount: { fontSize: 10, fontWeight: "700", color: colors.muted, marginTop: 2 },
  scoreCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  scoreCol: { flex: 1, alignItems: "center", paddingVertical: spacing.md, gap: 4 },
  scoreNum: { fontSize: 32, fontWeight: "900", color: colors.green, fontVariant: ["tabular-nums"] },
  drawNum: { color: colors.muted },
  awayNum: { color: colors.live },
  scoreLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5, color: colors.muted },
  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.faint },
  statVal: { fontSize: 20, fontWeight: "900", color: colors.turf },
  statLabel: { fontSize: 10, fontWeight: "700", color: colors.muted },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.faint, gap: spacing.sm },
  sectionTitle: { ...type.small, fontWeight: "800", color: colors.muted, letterSpacing: 0.5 },
  formRow: { flexDirection: "row", justifyContent: "space-between" },
  formChips: { flexDirection: "row", gap: 4 },
  chip: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 10, fontWeight: "900", color: "#FFF" },
  meetRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm + 2, borderWidth: 1, borderColor: colors.faint },
  meetDate: { fontSize: 10, fontWeight: "600", color: colors.muted, width: 52 },
  meetScore: { flex: 1, fontSize: 11, fontWeight: "700", color: colors.line },
  meetChip: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  meetChipText: { fontSize: 10, fontWeight: "900", color: "#FFF" },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { ...type.small, color: colors.muted, textAlign: "center" },
  pressed: { opacity: 0.7 },
  shareIconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.turfDim, alignItems: "center", justifyContent: "center" },
  shareOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  shareSheet: { backgroundColor: "#1A1524", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.md, gap: spacing.md, alignItems: "center" as const, paddingBottom: 36 },
  fmtRow: { flexDirection: "row", gap: 8 },
  fmtPill: { borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", paddingHorizontal: 14, paddingVertical: 7 },
  fmtPillActive: { backgroundColor: colors.turf, borderColor: colors.turf },
  fmtTxt: { fontSize: 12, fontWeight: "800", color: "#FFF" },
  shareCard: { width: 300, backgroundColor: "#0B0A0E", borderRadius: 14, padding: 7, overflow: "hidden" },
  shareStrip: { height: 7, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  shareBody: { flex: 1, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, padding: spacing.md, gap: 8, overflow: "hidden" },
  shareWm: { position: "absolute", right: -28, bottom: 16, fontSize: 56, fontWeight: "900", color: "#6D28D9", opacity: 0.06, transform: [{ rotate: "-12deg" }] },
  shareTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shareBrand: { fontSize: 13, fontWeight: "900", color: "#6D28D9" },
  shareBrandR: { fontSize: 7, fontWeight: "800", letterSpacing: 1, color: "#6D28D9", opacity: 0.7 },
  shareTeamsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  shareTeamCol: { flex: 1, alignItems: "flex-start", gap: 3 },
  shareTeamName: { fontSize: 10, fontWeight: "900", color: "#0A0812", letterSpacing: -0.2 },
  shareTeamPos: { fontSize: 8, fontWeight: "700", color: "#6D28D9" },
  shareVsCol: { alignItems: "center" },
  shareVs: { fontSize: 16, fontWeight: "900", color: "#9188A4" },
  shareMeetCount: { fontSize: 8, fontWeight: "700", color: "#9188A4" },
  shareStat: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.75)", borderRadius: 10, padding: 10 },
  shareStatVal: { fontSize: 28, fontWeight: "900", fontVariant: ["tabular-nums"] as any, width: 44, textAlign: "center" as const },
  shareStatMid: { flex: 1, alignItems: "center", gap: 2 },
  shareStatLabel: { fontSize: 7, fontWeight: "800", color: "#9188A4", letterSpacing: 0.3 },
  shareDrawVal: { fontSize: 22, fontWeight: "900", color: "#9188A4", fontVariant: ["tabular-nums"] as any },
  shareGoals: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.6)", borderRadius: 8, padding: 8 },
  shareGoalVal: { fontSize: 18, fontWeight: "900", color: "#5B21B6", fontVariant: ["tabular-nums"] as any, flex: 1, textAlign: "center" as const },
  shareGoalLabel: { fontSize: 7, fontWeight: "800", letterSpacing: 0.5, color: "#9188A4", textAlign: "center" as const },
  shareFormRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  shareFormChips: { flexDirection: "row", gap: 3, flex: 1 },
  shareFormLabel: { fontSize: 8, fontWeight: "800", color: "#9188A4", letterSpacing: 0.5 },
  shareChip: { width: 20, height: 20, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  shareChipTxt: { fontSize: 9, fontWeight: "900", color: "#FFF" },
  shareFooter: { fontSize: 7.5, fontWeight: "800", letterSpacing: 2.5, color: "#9188A4", textAlign: "center" as const },
  shareActions: { flexDirection: "row", gap: spacing.sm, width: "100%" },
  sActBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.pill, paddingVertical: spacing.sm + 2 },
  sClose: { backgroundColor: "rgba(255,255,255,0.1)" },
  sCloseTxt: { fontSize: 14, fontWeight: "700", color: "#FFF" },
  sGo: { backgroundColor: colors.turf },
  sGoTxt: { fontSize: 14, fontWeight: "800", color: "#FFF" },
  sHint: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.5)" },
});
