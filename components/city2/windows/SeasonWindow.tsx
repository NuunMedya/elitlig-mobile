/**
 * SEZON PENCERESİ (Kulüp Şehri 2.0 · Faz 5) — şehrin üstünde katman olarak ve
 * /kulup-sehri-sezon rotasında aynı oyun penceresiyle açılır.
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
import { Redirect } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { CrestBadge, SeasonEndSheet, SeasonHistoryList, SeasonParts, TierMedal } from "@/components/city2/Season";
import { SectionTitle, fmt } from "@/components/city2/shared";
import { useCityNav } from "@/components/city2/game/CityNav";
import { CityWindow } from "@/components/city2/game/CityWindow";
import { refreshControlProps, useRefresh } from "@/components/ui";
import { estimateTier, seasonLeftText, spanText, type City2Season } from "@/lib/puzzle/city2";
import { CITY2_UI, CITY_UI } from "@/lib/puzzle/cityPalette";
import { useCity2, useCity2Season } from "@/lib/puzzle/useCity2";
import { useAuth } from "@/providers/AuthProvider";
import { fonts, hairline, layout, radius, space, textScale, type } from "@/theme";
import { CG, CP } from "@/lib/puzzle/cityGamePalette";
import { GameButton, GameEmpty, GameError, GameLoading } from "@/components/city2/game/GamePaper";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export function SeasonWindow() {
  const auth = useAuth();
  const nav = useCityNav();
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
    <CityWindow
      title="Sezon"
      subtitle={cur ? `${cur.title} · ${cur.name}` : season?.preseason ? season.preseason.season.title : "Kulüp Şehri"}
      actions={unsupported ? undefined : [{ icon: "podium-outline", onPress: () => nav.open("siralama", { tab: "season" }), accessibilityLabel: "Sezon sıralaması" }]}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}>
        {unsupported ? (
          <GameEmpty icon="calendar-outline" title="Sezonlar yakında" body="Sezon puanı ve sezon kupaları sunucu güncellemesiyle açılacak." variant="inline" action={{ label: "Şehre dön", onPress: nav.close, haptic: "light" }} />
        ) : !season && query.isLoading ? (
          <GameLoading lines={6} />
        ) : !season ? (
          <GameError error={query.error} onRetry={() => query.refetch()} />
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
                  <View style={styles.heroScoreRow}>
                    <View style={styles.trophyGlow}>
                      <TierMedal tier={est?.tier ?? null} size={76} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.heroUnit} {...textScale.dense}>
                        SEZON PUANI
                      </Text>
                      <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.dense}>
                        {fmt(cur.score)}
                      </Text>
                      <Text style={styles.heroUnit} numberOfLines={1} {...textScale.dense}>
                        {est ? `${est.title} kupasına gidiyorsun` : "100 puanla kupa yarışına gir"}
                      </Text>
                    </View>
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

            <SectionTitle title="Sezon sonu kupaları" />
            <TrophyShelf season={season} current={est?.tier ?? null} />

            {season.history.length ? (
              <>
                <SectionTitle title="Geçmiş sezonlar" meta={`${season.history.length} sezon`} />
                <SeasonHistoryList history={season.history} />
              </>
            ) : null}

            <GameButton label="Sezon sıralaması" icon="podium-outline" variant="secondary" onPress={() => nav.open("siralama", { tab: "season" })} fullWidth />
          </>
        )}
      </ScrollView>
      <SeasonEndSheet city2={city2 ? { ...city2, season: season ?? city2.season } : undefined} />
    </CityWindow>
  );
}

/** Kupa rafı: sezon sonu dilimleri tahta rafta yan yana (tahmini dilim parlar). */
function TrophyShelf({ season, current }: { season: City2Season; current: string | null }) {
  const min = season.rewards[0]?.min_score ?? 100;
  return (
    <View style={styles.shelfWrap}>
      <View style={styles.shelfRow}>
        {season.rewards.map((r, i) => {
          const on = r.tier === current;
          return (
            <View key={r.tier} style={[styles.cup, on ? styles.cupOn : null]} accessibilityLabel={`${r.title}: ${i === season.rewards.length - 1 || r.top_pct >= 1 ? `${min} puanı geçen herkes` : `ilk yüzde ${Math.round(r.top_pct * 100)}`}`}>
              {on ? (
                <View style={styles.cupTag}>
                  <Text style={styles.cupTagText} {...textScale.badge}>
                    SENİN
                  </Text>
                </View>
              ) : null}
              <TierMedal tier={r.tier} size={on ? 58 : 48} />
              <Text style={styles.cupTitle} numberOfLines={2} {...textScale.dense}>
                {r.title}
              </Text>
              <Text style={styles.cupMeta} numberOfLines={2} {...textScale.dense}>
                {i === season.rewards.length - 1 || r.top_pct >= 1 ? `${fmt(min)}+ puan` : `İlk %${Math.round(r.top_pct * 100)}`}
              </Text>
            </View>
          );
        })}
      </View>
      <LinearGradient colors={CG.wood} start={TOP} end={BOTTOM} style={styles.shelf} />
      <Text style={styles.shelfNote} {...textScale.long}>
        Her dilim rozet, arma çerçevesi ve sezon kupası verir; hepsi görünüştür.
      </Text>
    </View>
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
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant * 2, gap: space.md },
  flex: { flex: 1 },
  hero: { borderRadius: radius.xxl, padding: space.lg, gap: space.md, overflow: "hidden", borderWidth: hairline, borderColor: CITY2_UI.panelEdge },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroOver: { ...type.overline, color: CITY2_UI.star },
  heroRange: { ...type.bodySm, color: CITY2_UI.panelMuted },
  countdown: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: CITY2_UI.panelChip },
  countdownText: { ...type.labelXs, fontFamily: fonts.bold, color: CITY_UI.white },
  heroScoreRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  trophyGlow: { padding: 6, borderRadius: radius.pill, backgroundColor: CITY2_UI.panelChip },
  heroValue: { ...type.scoreLg, color: CITY_UI.white },
  heroUnit: { ...type.label, color: CITY2_UI.panelMuted },
  heroStats: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: CITY2_UI.panelChip },
  heroStat: { flex: 1, alignItems: "center", gap: 2 },
  heroStatValue: { ...type.h3, fontFamily: fonts.bold, color: CITY_UI.white },
  heroStatLabel: { ...type.caption, color: CITY2_UI.panelMuted },
  heroRule: { width: hairline, alignSelf: "stretch", backgroundColor: CITY2_UI.panelEdge },
  estLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  heroNote: { ...type.bodySm, color: CITY2_UI.panelMuted },
  shelfWrap: { gap: 0 },
  shelfRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs, paddingHorizontal: space.xs },
  cup: { flex: 1, alignItems: "center", gap: 3, paddingTop: space.md, paddingBottom: space.sm, paddingHorizontal: space.xxs, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  cupOn: { backgroundColor: CP.brandDim },
  cupTag: { paddingHorizontal: space.xs, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: CP.brandAccent, marginBottom: 2 },
  cupTagText: { ...type.micro, fontFamily: fonts.bold, color: CP.textOnBrand },
  cupTitle: { ...type.labelSm, fontFamily: fonts.bold, color: CP.textPrimary, textAlign: "center" },
  cupMeta: { ...type.caption, color: CP.textTertiary, textAlign: "center" },
  shelf: { height: 14, borderRadius: radius.sm, borderWidth: 2, borderColor: CG.woodEdge },
  shelfNote: { ...type.caption, color: CP.textTertiary, textAlign: "center", marginTop: space.xs },
  intro: { ...type.bodySm, color: CP.textSecondary },
});
