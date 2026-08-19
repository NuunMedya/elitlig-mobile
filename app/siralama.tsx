import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getArenaLeaderboard, getMyArenaRank, type ArenaGame } from "@/lib/api/arena";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Sharing from "expo-sharing";
import ViewShot from "react-native-view-shot";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";

const GAMES: { key: ArenaGame; label: string; emoji: string }[] = [
  { key: "seri",   label: "Seri Modu",    emoji: "🔥" },
  { key: "sektir", label: "Top Sektir",   emoji: "⚽" },
  { key: "kimbu",  label: "Kim Bu?",      emoji: "🕵️" },
  { key: "slalom", label: "Slalom",       emoji: "🚩" },
  { key: "gunun",  label: "Günün Testi",  emoji: "🧠" },
];

export default function ArenaLeaderboardScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const initial = GAMES.find((g) => g.key === params.game)?.key ?? "seri";
  const [game, setGame] = useState<ArenaGame>(initial);
  const [period, setPeriod] = useState<"weekly" | "alltime">("weekly");
  const [scopeMode, setScopeMode] = useState<"city" | "turkey">("city");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFmt, setShareFmt] = useState<"story"|"post">("story");
  const [shareBusy, setShareBusy] = useState(false);
  const shotRef = useRef<any>(null);
  const CW = 272;
  const SFMTS = {
    story: { label: "Hikâye 9:16", h: Math.round(CW*16/9) },
    post:  { label: "Gönderi 3:4", h: Math.round(CW*4/3) },
  } as const;
  const doShare = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const uri = await shotRef.current?.capture?.();
      if (uri) await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch {} finally { setShareBusy(false); }
  };
  const curGame = GAMES.find(g => g.key === game);
  const scope = useScope();
  const auth = useAuth();
  const cityId = scopeMode === "city" && scope.cityId ? Number(scope.cityId) : undefined;

  const boardQuery = useQuery({
    queryKey: ["arena", "board", game, period, cityId ?? "tr"],
    queryFn: () => getArenaLeaderboard(game, { cityId, period }),
    staleTime: 30_000,
  });

  const meQuery = useQuery({
    queryKey: ["arena", "me", game, cityId ?? "tr"],
    queryFn: () => getMyArenaRank(game, cityId),
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });

  const entries = boardQuery.data?.entries ?? [];
  const me = meQuery.data as { rank?: number; score?: number; best?: number } | undefined;
  const myRank = me?.rank ?? null;
  const myScore = me?.score ?? me?.best ?? null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Rekor Tablosu" subtitle="Oyunlarda kim önde?" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gameTabs} style={styles.gameTabsWrap}>
        {GAMES.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setGame(item.key)}
            style={({ pressed }) => [styles.gameTab, game === item.key && styles.gameTabActive, pressed && styles.pressed]}
          >
            <Text style={[styles.gameTabText, game === item.key && styles.gameTabTextActive]}>
              {item.emoji} {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.filterRow}>
        <TogglePair
          left="Haftalık" right="Tüm Zamanlar"
          value={period === "weekly" ? "left" : "right"}
          onChange={(s) => setPeriod(s === "left" ? "weekly" : "alltime")}
        />
        <TogglePair
          left={scope.cityLabel || "Şehrim"} right="Türkiye"
          value={scopeMode === "city" ? "left" : "right"}
          onChange={(s) => setScopeMode(s === "left" ? "city" : "turkey")}
        />
      </View>

      <Pressable onPress={() => setShareOpen(true)} style={({pressed})=>[styles.shareBtn, pressed&&styles.pressed]}>
        <Ionicons name="share-social-outline" size={15} color={colors.turf} />
        <Text style={styles.shareBtnTxt}>Tabloyu Paylaş</Text>
      </Pressable>

      {auth.user && (myRank != null || myScore != null) ? (
        <View style={styles.mePill}>
          <Text style={styles.meText}>
            SENİN SIRAN: {myRank != null ? `#${myRank}` : "—"}{myScore != null ? ` · ${myScore}` : ""}
          </Text>
        </View>
      ) : null}

      {boardQuery.isLoading ? (
        <Loading />
      ) : boardQuery.isError ? (
        <ErrorState error={boardQuery.error} onRetry={boardQuery.refetch} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title="Henüz skor yok"
          body={auth.user
            ? "İlk rekoru gönderen sen ol — oyna, skorun otomatik sıralamaya yazılsın!"
            : "Oyna ve giriş yap; skorun otomatik sıralamaya yazılsın."}
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => `${item.userId}-${item.rank}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mine = Number(item.userId) === Number(auth.user?.id);
            return (
              <View style={[styles.row, mine && styles.rowMine]}>
                <Text style={styles.rank}>
                  {item.rank === 1 ? "🥇" : item.rank === 2 ? "🥈" : item.rank === 3 ? "🥉" : item.rank}
                </Text>
                <View style={styles.rowBody}>
                  <Text style={[styles.name, mine && styles.nameMine]} numberOfLines={1}>
                    {item.name}{mine ? " (sen)" : ""}
                  </Text>
                  {item.teamName ? <Text style={styles.team} numberOfLines={1}>{item.teamName}</Text> : null}
                </View>
                <View style={styles.scoreBox}>
                  <Text style={[styles.score, mine && styles.nameMine]}>{item.score}</Text>
                  <Text style={styles.date}>{formatDateShort(item.date)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
      <Modal visible={shareOpen} animationType="slide" onRequestClose={()=>setShareOpen(false)} transparent>
        <View style={styles.shareOverlay}>
          <View style={styles.shareSheet}>
            <View style={styles.sFmtRow}>
              {(["story","post"] as const).map(k=>(
                <Pressable key={k} onPress={()=>setShareFmt(k)} style={({pressed})=>[styles.sFmtPill,shareFmt===k&&styles.sFmtActive,pressed&&styles.pressed]}>
                  <Text style={styles.sFmtTxt}>{SFMTS[k].label}</Text>
                </Pressable>
              ))}
            </View>
            <ViewShot ref={shotRef} options={{format:"png",quality:1}}>
              <View style={[styles.sCard,{height:SFMTS[shareFmt].h}]}>
                <LinearGradient colors={["#6D28D9","#4C1D95"]} style={styles.sStrip}/>
                <LinearGradient colors={["#CDBFE8","#EFEAF7","#FFF"]} start={{x:0.2,y:0}} end={{x:0.5,y:1}} style={styles.sBody}>
                  <Text style={styles.sWm}>elitlig</Text>
                  <View style={styles.sTopRow}>
                    <Text style={styles.sBrand}>elitlig</Text>
                    <Text style={styles.sBrandR}>REKOR TABLOSU</Text>
                  </View>
                  <Text style={styles.sKicker}>{curGame?.emoji} {curGame?.label?.toLocaleUpperCase("tr-TR")} · {period==="weekly"?"HAFTALIK":"TÜM ZAMANLAR"}</Text>
                  <View style={styles.sList}>
                    {entries.slice(0,5).map((e,i)=>(
                      <View key={e.userId} style={[styles.sRow, i>0&&styles.sRowBorder]}>
                        <Text style={styles.sRank}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`}</Text>
                        <Text style={styles.sName} numberOfLines={1}>{e.name}</Text>
                        <View style={styles.sValBox}>
                          <Text style={styles.sVal}>{e.score}</Text>
                          <Text style={styles.sUnit}>PUAN</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <View style={{flex:1}}/>
                  <Text style={styles.sFtr}>ELİTLİG.COM</Text>
                </LinearGradient>
              </View>
            </ViewShot>
            <View style={styles.sActions}>
              <Pressable onPress={()=>setShareOpen(false)} style={({pressed})=>[styles.sActBtn,styles.sClose,pressed&&styles.pressed]}>
                <Text style={styles.sCloseTxt}>Kapat</Text>
              </Pressable>
              <Pressable onPress={doShare} style={({pressed})=>[styles.sActBtn,styles.sGo,pressed&&styles.pressed]}>
                <Ionicons name="share-social" size={15} color="#FFF"/>
                <Text style={styles.sGoTxt}>{shareBusy?"Hazırlanıyor…":"Paylaş"}</Text>
              </Pressable>
            </View>
            <Text style={styles.sHint}>İndirmek için: Paylaş → "Görüntüyü Kaydet"</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TogglePair({ left, right, value, onChange }: {
  left: string; right: string; value: "left" | "right"; onChange: (s: "left" | "right") => void;
}) {
  return (
    <View style={styles.toggle}>
      {([ ["left", left], ["right", right] ] as const).map(([side, label]) => (
        <Pressable key={side} onPress={() => onChange(side)}
          style={({ pressed }) => [styles.toggleHalf, value === side && styles.toggleActive, pressed && styles.pressed]}
        >
          <Text style={[styles.toggleText, value === side && styles.toggleTextActive]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pitch },
  gameTabsWrap: { flexGrow: 0, flexShrink: 0 },
  gameTabs: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.sm, alignItems: "center" as const, height: 44 },
  gameTab: { borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.faint, paddingHorizontal: spacing.md, paddingVertical: 7, height: 36, justifyContent: "center" as const, alignItems: "center" as const },
  gameTabActive: { backgroundColor: colors.turf, borderColor: colors.turf },
  gameTabText: { fontSize: 12, fontWeight: "700" as const, color: colors.muted },
  gameTabTextActive: { color: colors.surface, fontWeight: "800" as const },
  filterRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  toggle: { flex: 1, flexDirection: "row", backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, padding: 3 },
  toggleHalf: { flex: 1, alignItems: "center", borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 4 },
  toggleActive: { backgroundColor: colors.turf },
  toggleText: { fontSize: 10, fontWeight: "800", color: colors.muted },
  toggleTextActive: { color: colors.surface },
  mePill: { alignSelf: "center", backgroundColor: colors.goldDim, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  meText: { fontSize: 11, fontWeight: "800", color: "#8A6A06", fontVariant: ["tabular-nums"] },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.faint, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  rowMine: { borderColor: colors.turf, backgroundColor: colors.turfDim },
  rank: { width: 30, fontSize: 13, fontWeight: "800", color: colors.muted, textAlign: "center", fontVariant: ["tabular-nums"] },
  rowBody: { flex: 1 },
  name: { ...type.small, fontWeight: "700", color: colors.line },
  nameMine: { color: colors.turf, fontWeight: "800" },
  team: { ...type.caption, color: colors.muted, letterSpacing: 0, marginTop: 1 },
  scoreBox: { alignItems: "flex-end" },
  score: { ...type.body, fontWeight: "800", color: colors.line, fontVariant: ["tabular-nums"] },
  date: { fontSize: 9, fontWeight: "600", color: colors.muted },
  shareBtn: { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:6, backgroundColor:colors.turfDim, borderRadius:radius.pill, paddingVertical:spacing.sm+2, marginHorizontal:spacing.md, marginBottom:spacing.sm },
  shareBtnTxt: { fontSize: 11, fontWeight:"800", color:colors.turf },
  shareOverlay: { flex:1, backgroundColor:"rgba(0,0,0,0.75)", justifyContent:"flex-end" },
  shareSheet: { backgroundColor:"#1A1524", borderTopLeftRadius:20, borderTopRightRadius:20, padding:spacing.md, gap:spacing.md, alignItems:"center" as const, paddingBottom:36 },
  sFmtRow: { flexDirection:"row", gap:8 },
  sFmtPill: { borderRadius:20, borderWidth:1, borderColor:"rgba(255,255,255,0.35)", paddingHorizontal:14, paddingVertical:7 },
  sFmtActive: { backgroundColor:colors.turf, borderColor:colors.turf },
  sFmtTxt: { fontSize: 11, fontWeight:"800", color:"#FFF" },
  sCard: { width:272, backgroundColor:"#0B0A0E", borderRadius:14, padding:7, overflow:"hidden" },
  sStrip: { height:7, borderTopLeftRadius:8, borderTopRightRadius:8 },
  sBody: { flex:1, borderBottomLeftRadius:8, borderBottomRightRadius:8, paddingHorizontal:spacing.md, paddingTop:spacing.sm, paddingBottom:spacing.sm, overflow:"hidden", gap:6 },
  sWm: { position:"absolute", right:-28, bottom:16, fontSize:60, fontWeight:"900", color:"#6D28D9", opacity:0.06, transform:[{rotate:"-12deg"}] },
  sTopRow: { flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  sBrand: { fontSize: 12, fontWeight:"900", color:"#6D28D9" },
  sBrandR: { fontSize:7, fontWeight:"800", letterSpacing:1.2, color:"#6D28D9", opacity:0.7 },
  sKicker: { fontSize:9, fontWeight:"800", letterSpacing:0.6, color:"#6D28D9", opacity:0.85 },
  sList: { backgroundColor:"#FFF", borderRadius:12, borderWidth:1, borderColor:"#E2D9F5", paddingVertical:2, paddingHorizontal:spacing.sm },
  sRow: { flexDirection:"row", alignItems:"center", gap:8, paddingVertical:6 },
  sRowBorder: { borderTopWidth:1, borderTopColor:"#F2EDFB" },
  sRank: { width:22, fontSize: 12, textAlign:"center" as const },
  sName: { flex:1, fontSize:10.5, fontWeight:"800", color:"#100D16" },
  sValBox: { alignItems:"flex-end" as const, gap:1 },
  sVal: { fontSize: 13, fontWeight:"900", color:"#5B21B6", fontVariant:["tabular-nums"] as any },
  sUnit: { fontSize:6.5, fontWeight:"800", letterSpacing:0.8, color:"#9B92AA" },
  sFtr: { fontSize:7.5, fontWeight:"800", letterSpacing:2.5, color:"#9188A4", textAlign:"center" as const },
  sActions: { flexDirection:"row", gap:spacing.sm, width:"100%" },
  sActBtn: { flex:1, flexDirection:"row", alignItems:"center", justifyContent:"center", gap:6, borderRadius:radius.pill, paddingVertical:spacing.sm+2 },
  sClose: { backgroundColor:"rgba(255,255,255,0.1)" },
  sCloseTxt: { fontSize: 13, fontWeight:"700", color:"#FFF" },
  sGo: { backgroundColor:colors.turf },
  sGoTxt: { fontSize: 13, fontWeight:"800", color:"#FFF" },
  sHint: { fontSize:11, fontWeight:"600", color:"rgba(255,255,255,0.5)" },
  pressed: { opacity: 0.7 },
});
