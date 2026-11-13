/**
 * SEZON — /kulup-sehri-sezon (Kulüp Şehri 2.0 · Faz 5)
 *
 * 3 aylık sezonun bütün durumu GET /api/puzzle/city2/season'dan (sezon sonu
 * dilimi bu okumada verilir; yanıt şehir önbelleğine de yazılır):
 *   · Üst panel: sezon adı, tarih aralığı, kalan süre, sezon puanı, sıra ve
 *     sıraya göre tahmini dilim (bronz · gümüş · altın), arma.
 *   · Puan kırılımı: kalem kalem (gelişim, EL, sembol yapı, maç, maçın oyuncusu,
 *     gol + asist, taraftar yolu, görevler, alkış) birim, tavan ve puan.
 *   · Sezon sonu dilimleri, geçmiş sezonlar ve rozetler.
 *
 * Kupa, rozet ve çerçeve yalnız görünüştür. Eski sunucuda (404 ya da `season`
 * alanı yok) "yakında" çizilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CrestBadge, RewardTiers, SeasonEndSheet, SeasonHistoryList, SeasonParts, TierMedal } from "@/components/city2/Season";
import { SectionTitle, fmt } from "@/components/city2/shared";
import { Button, EmptyState, ErrorState, ScreenHeader, SkeletonCard, refreshControlProps, useRefresh } from "@/components/ui";
import { estimateTier, seasonLeftText, spanText } from "@/lib/puzzle/city2";
import { CITY2_UI, CITY_UI } from "@/lib/puzzle/cityPalette";
import { useCity2, useCity2Season } from "@/lib/puzzle/useCity2";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export default function SeasonScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { city2, legacy } = useCity2();
  const { query, season: fresh, crest: freshCrest, supported } = useCity2Season();
  const season = fresh ?? city2?.season;
  const crest = freshCrest ?? city2?.crest;
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  if (!auth.user) return <Redirect href="/giris" />;

  const cur = season?.current ?? null;
  const est = season ? estimateTier(season) : null;
  const unsupported = legacy || !supported || (city2 != null && !city2.season && !fresh);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Sezon"
        subtitle={cur ? `${cur.title} · ${cur.name}` : season?.preseason ? season.preseason.season.title : "Kulüp Şehri"}
        back
        actions={unsupported ? undefined : [{ icon: "podium-outline", onPress: () => router.push({ pathname: "/kulup-sehri-siralama", params: { tab: "season" } }), accessibilityLabel: "Sezon sıralaması" }]}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}>
        {unsupported ? (
          <EmptyState icon="calendar-outline" title="Sezonlar yakında" body="Sezon puanı ve sezon kupaları sunucu güncellemesiyle açılacak." variant="inline" action={{ label: "Şehre dön", onPress: () => router.back(), haptic: "light" }} />
        ) : !season && query.isLoading ? (
          <SkeletonCard lines={6} />
        ) : !season ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <View style={styles.hero}>
              <LinearGradient colors={CITY2_UI.panel} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
              <View style={styles.heroTop}>
                <CrestBadge crest={crest} size={52} onDark />
                <View style={styles.flex}>
                  <Text style={styles.heroOver} {...textScale.badge}>
                    {cur ? `${cur.title} · ${cur.name}`.toLocaleUpperCase("tr-TR") : "SEZON ÖNCESİ"}
                  </Text>
                  <Text style={styles.heroRange} numberOfLines={1} {...textScale.dense}>
                    {cur ? cur.range_text : season.preseason?.season.range_text ?? ""}
                  </Text>
                </View>
                {cur ? null : (
                <View style={styles.countdown}>
                  <Ionicons name="time-outline" size={14} color={CITY2_UI.panelMuted} />
                  <Text style={styles.countdownText} {...textScale.badge}>
                    {spanText(season.preseason?.starts_at) ?? "yakında"}
                  </Text>
                </View>
                )}
              </View>
              {cur ? (
                <>
                  <View style={styles.heroScore}>
                    <Text style={styles.heroValue} {...textScale.dense}>
                      {fmt(cur.score)}
                    </Text>
                    <Text style={styles.heroUnit} {...textScale.dense}>
                      sezon puanı
                    </Text>
                  </View>
                  <View style={styles.heroStats}>
                    <HeroStat value={cur.rank != null ? `${fmt(cur.rank)}.` : "—"} label={cur.rank != null && cur.ranked ? `sıra · ${fmt(cur.ranked)} kişi` : "sıra · 100 puanla"} />
                    <View style={styles.heroRule} />
                    <View style={styles.heroStat}>
                      <View style={styles.estLine}>
                        <TierMedal tier={est?.tier ?? null} size={22} />
                        <Text style={styles.heroStatValue} {...textScale.dense}>
                          {est ? est.title : "—"}
                        </Text>
                      </View>
                      <Text style={styles.heroStatLabel} {...textScale.dense}>
                        tahmini dilim
                      </Text>
                    </View>
                    <View style={styles.heroRule} />
                    <HeroStat value={seasonLeftText(cur)} label="kaldı" />
                  </View>
                  {est ? null : (
                    <Text style={styles.heroNote} {...textScale.long}>
                      Dilimler sezon sonunda en az 100 puanı olanlar arasındaki sıraya göre verilir.
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.heroNote} {...textScale.long}>
                  {season.preseason?.text ?? "Sezon yakında başlıyor."} Sezon başlayınca şehrini geliştirdikçe ve sahada oynadıkça puan toplarsın.
                </Text>
              )}
            </View>

            <Text style={styles.intro} {...textScale.long}>
              {season.intro}
            </Text>

            {cur ? (
              <>
                <SectionTitle title="Puanın nasıl oluşuyor" meta="kalem başına sezon tavanı var" />
                <SeasonParts parts={cur.parts} />
              </>
            ) : null}

            <SectionTitle title="Sezon sonu dilimleri" />
            <RewardTiers season={season} />

            {season.history.length ? (
              <>
                <SectionTitle title="Geçmiş sezonlar" meta={`${season.history.length} sezon`} />
                <SeasonHistoryList history={season.history} />
              </>
            ) : null}

            <Button label="Sezon sıralaması" icon="podium-outline" variant="secondary" onPress={() => router.push({ pathname: "/kulup-sehri-siralama", params: { tab: "season" } })} fullWidth />
          </>
        )}
      </ScrollView>
      <SeasonEndSheet city2={city2 ? { ...city2, season: season ?? city2.season } : undefined} />
    </SafeAreaView>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue} numberOfLines={1} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.heroStatLabel} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant * 2, gap: space.md },
  flex: { flex: 1 },
  hero: { borderRadius: radius.xxl, padding: space.lg, gap: space.md, overflow: "hidden", borderWidth: hairline, borderColor: CITY2_UI.panelEdge },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroOver: { ...type.overline, color: CITY2_UI.star },
  heroRange: { ...type.bodySm, color: CITY2_UI.panelMuted },
  countdown: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: CITY2_UI.panelChip },
  countdownText: { ...type.labelXs, fontFamily: fonts.bold, color: CITY_UI.white },
  heroScore: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  heroValue: { ...type.scoreLg, color: CITY_UI.white },
  heroUnit: { ...type.label, color: CITY2_UI.panelMuted },
  heroStats: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: CITY2_UI.panelChip },
  heroStat: { flex: 1, alignItems: "center", gap: 2 },
  heroStatValue: { ...type.h3, fontFamily: fonts.bold, color: CITY_UI.white },
  heroStatLabel: { ...type.caption, color: CITY2_UI.panelMuted },
  heroRule: { width: hairline, alignSelf: "stretch", backgroundColor: CITY2_UI.panelEdge },
  estLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  heroNote: { ...type.bodySm, color: CITY2_UI.panelMuted },
  intro: { ...type.bodySm, color: colors.textSecondary },
});
