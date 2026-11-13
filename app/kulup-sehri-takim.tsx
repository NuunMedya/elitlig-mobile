/**
 * TAKIM TESİSİ — /kulup-sehri-takim (Kulüp Şehri 2.0 · Faz 5)
 *
 * Gerçek takımının ortak binası (GET /api/puzzle/city2/team):
 *   · Üst panel: takım adı, seviye ve aşama adı, sıradaki seviyeye ilerleme,
 *     bütün üyelere verdiği EL üretim bonusu, takımlar arasındaki sıra.
 *   · Takım sembol yapısı ("Takım tesisi kapısı", 5. seviyede açılır).
 *   · Bağış: yıldız ve Elit Lira (günlük tavan, kalan hak, puan karşılığı).
 *     POST /team/donate → takım görünümü + şehir (yıldız, kasa) önbelleğe yazılır.
 *   · Seviyeler, takım içi katkı sıralaması, takım sıralamasına bağlantı.
 *
 * Takımı olmayan üye: sunucunun açıklaması. Eski sunucu (404): "yakında".
 * Bağışlar oyun içidir (yıldız ve Elit Lira); hiçbir şey satın alınmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LandmarkIcon, SectionTitle, fmt } from "@/components/city2/shared";
import { ContributionList, DonateCard, LevelList, TeamTile } from "@/components/city2/Team";
import { Button, EmptyState, ErrorState, ScreenHeader, SkeletonCard, Touchable, refreshControlProps, useRefresh } from "@/components/ui";
import { fmtPct } from "@/lib/puzzle/city2";
import { CITY2_EL, CITY2_UI, CITY_UI } from "@/lib/puzzle/cityPalette";
import { useCity2, useCity2Donate, useCity2Team } from "@/lib/puzzle/useCity2";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export default function TeamFacilityScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { city2, legacy } = useCity2();
  const { query, view, supported } = useCity2Team();
  const donate = useCity2Donate();
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  if (!auth.user) return <Redirect href="/giris" />;

  const team = view?.team ?? null;
  const unsupported = legacy || !supported;
  const maxed = team ? team.next_cost == null || team.level >= team.max_level : false;
  const toBoard = () => router.push({ pathname: "/kulup-sehri-siralama", params: { tab: "team" } });

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Takım tesisi"
        subtitle={team ? team.name : "Kulüp Şehri"}
        back
        actions={team ? [{ icon: "podium-outline", onPress: toBoard, accessibilityLabel: "Takım sıralaması" }] : undefined}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}>
        {unsupported ? (
          <EmptyState icon="people-outline" title="Takım tesisi yakında" body="Takımınla ortak bina kurmak sunucu güncellemesiyle açılacak." variant="inline" action={{ label: "Şehre dön", onPress: () => router.back(), haptic: "light" }} />
        ) : query.isLoading ? (
          <SkeletonCard lines={6} />
        ) : query.isError || !view ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !team ? (
          <EmptyState icon="people-outline" title="Takımın yok" body={view.text ?? "Takım tesisi, oyuncu kartın bir takıma bağlı olduğunda açılır."} variant="inline" action={{ label: "Şehre dön", onPress: () => router.back(), haptic: "light" }} />
        ) : (
          <>
            <View style={styles.hero}>
              <LinearGradient colors={CITY2_UI.panel} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
              <View style={styles.heroTop}>
                <TeamTile size={52} />
                <View style={styles.flex}>
                  <Text style={styles.heroOver} {...textScale.badge}>
                    {`SEVİYE ${team.level}/${team.max_level}`}
                  </Text>
                  <Text style={styles.heroTitle} numberOfLines={2} {...textScale.dense}>
                    {team.level > 0 ? team.stage_title : "Tesis kurulmadı"}
                  </Text>
                  <Text style={styles.heroMeta} numberOfLines={1} {...textScale.dense}>
                    {fmt(team.size)} oyunculu kadro · {fmt(team.contributors)} bağışçı
                  </Text>
                </View>
              </View>
              {!maxed && team.next_cost ? (
                <View style={styles.progress}>
                  <View style={styles.progressHead}>
                    <Text style={styles.progressTitle} numberOfLines={1} {...textScale.dense}>
                      {team.level + 1}. seviye · {team.next_stage_title}
                    </Text>
                    <Text style={styles.progressValue} {...textScale.badge}>
                      {fmt(team.progress)}/{fmt(team.next_cost)}
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.round(Math.min(1, team.progress / team.next_cost) * 100)}%` as const }]} />
                  </View>
                </View>
              ) : (
                <Text style={styles.heroMeta} {...textScale.dense}>
                  Tesis en üst seviyede.
                </Text>
              )}
              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue} {...textScale.dense}>
                    +{fmtPct(team.el_pct)}
                  </Text>
                  <Text style={styles.heroStatLabel} numberOfLines={1} {...textScale.dense}>
                    üyelere EL üretimi
                  </Text>
                </View>
                <View style={styles.heroRule} />
                <Touchable feedback="chip" onPress={toBoard} style={styles.heroStat} accessibilityRole="button" accessibilityLabel="Takım sıralaması">
                  <Text style={styles.heroStatValue} {...textScale.dense}>
                    {view.rank?.rank != null ? `${fmt(view.rank.rank)}.` : "—"}
                  </Text>
                  <Text style={styles.heroStatLabel} numberOfLines={1} {...textScale.dense}>
                    {view.rank ? `${fmt(view.rank.total)} takım içinde` : "takım sırası"}
                  </Text>
                </Touchable>
                <View style={styles.heroRule} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue} {...textScale.dense}>
                    {fmt(team.points_total)}
                  </Text>
                  <Text style={styles.heroStatLabel} numberOfLines={1} {...textScale.dense}>
                    toplam puan
                  </Text>
                </View>
              </View>
              {team.next_el_pct != null && !maxed ? (
                <Text style={styles.heroNote} {...textScale.long}>
                  Sıradaki seviyede takımın bütün üyelerinin EL üretimi +{fmtPct(team.next_el_pct)} olur. Bonus, prestij bonusuyla toplanır.
                </Text>
              ) : null}
            </View>

            <View style={styles.landmark}>
              <LandmarkIcon landmarkKey={team.landmark.key} tier="onur" size={40} off={!team.landmark.unlocked} />
              <View style={styles.flex}>
                <Text style={styles.landmarkTitle} {...textScale.dense}>
                  Takım tesisi kapısı
                </Text>
                <Text style={styles.landmarkMeta} {...textScale.dense}>
                  {team.landmark.unlocked ? "Açıldı · takımın bütün üyelerinin deposunda" : `${team.landmark.level}. seviyede takımın bütün üyelerine açılır`}
                </Text>
              </View>
              <Ionicons name={team.landmark.unlocked ? "checkmark-circle" : "lock-closed"} size={18} color={team.landmark.unlocked ? colors.win : colors.textTertiary} />
            </View>

            {view.today && !maxed ? (
              <>
                <SectionTitle title="Bağış yap" meta={`günde en çok ${fmt(view.today.cap.stars)} yıldız + ${fmt(view.today.cap.el)} EL`} />
                <DonateCard
                  team={team}
                  today={view.today}
                  stars={city2?.stars.available ?? 0}
                  el={city2?.el?.balance ?? 0}
                  busy={donate.isPending}
                  onDonate={(body) => donate.mutate(body)}
                />
              </>
            ) : null}

            {view.contributions ? (
              <>
                <SectionTitle title="Katkı sıralaması" meta={view.contributions.me.rank ? `sen ${fmt(view.contributions.me.rank)}.` : null} />
                {view.contributions.top.length ? (
                  <ContributionList top={view.contributions.top} me={view.contributions.me} />
                ) : (
                  <EmptyState icon="heart-outline" title="Henüz bağış yok" body="İlk bağışı sen yap, tesis ilk seviyeye yaklaşsın." variant="inline" compact />
                )}
              </>
            ) : null}

            <SectionTitle title="Seviyeler" meta={`${fmt(team.size_counted)} oyunculu kadroya göre`} />
            <LevelList team={team} />

            <Text style={styles.intro} {...textScale.long}>
              {team.intro}
            </Text>
            <Button label="Takım sıralaması" icon="podium-outline" variant="secondary" onPress={toBoard} fullWidth />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant * 2, gap: space.md },
  flex: { flex: 1 },
  hero: { borderRadius: radius.xxl, padding: space.lg, gap: space.md, overflow: "hidden", borderWidth: hairline, borderColor: CITY2_UI.panelEdge },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroOver: { ...type.overline, color: CITY2_EL.gain },
  heroTitle: { ...type.h1, color: CITY_UI.white },
  heroMeta: { ...type.caption, color: CITY2_UI.panelMuted },
  progress: { gap: space.xs },
  progressHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  progressTitle: { ...type.labelSm, color: CITY_UI.white, flex: 1 },
  progressValue: { ...type.numSmStrong, color: CITY_UI.white },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: CITY2_EL.track, overflow: "hidden" },
  fill: { height: 10, borderRadius: radius.pill, backgroundColor: CITY2_EL.gain },
  heroStats: { flexDirection: "row", alignItems: "stretch", paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: CITY2_UI.panelChip },
  heroStat: { flex: 1, alignItems: "center", gap: 2, justifyContent: "center" },
  heroStatValue: { ...type.h3, fontFamily: fonts.bold, color: CITY_UI.white },
  heroStatLabel: { ...type.caption, color: CITY2_UI.panelMuted },
  heroRule: { width: hairline, backgroundColor: CITY2_UI.panelEdge },
  heroNote: { ...type.caption, color: CITY2_UI.panelMuted },
  landmark: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  landmarkTitle: { ...type.h4, color: colors.textPrimary },
  landmarkMeta: { ...type.caption, color: colors.textTertiary },
  intro: { ...type.bodySm, color: colors.textSecondary },
});
