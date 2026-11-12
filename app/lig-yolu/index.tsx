/**
 * LİG YOLU — seviyeli bulmaca oyunlarının merkezi (/lig-yolu).
 *
 * NE: tepede grafit sahne (cüzdan: can, jeton, harcanabilir yıldız; günlük
 * ödül düğmesi), altında stadyum kartı (son hâlinin küçük çizimi + ilerleme),
 * dört oyunun kartları (sıradaki seviye, lig basamağı, yıldız), sıralama.
 *
 * NEDEN TEK MERKEZ: dört oyun aynı cüzdanı, aynı canı ve aynı stadyumu
 * paylaşır; kullanıcı hangi oyunda ilerlerse ilerlesin stadyumu büyür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { tierOf } from "@/components/puzzle/LevelMap";
import { DailySheet, ShopSheet } from "@/components/puzzle/sheets";
import { WalletBar } from "@/components/puzzle/WalletBar";
import { ErrorState, ScreenHeader, SectionHeader, SkeletonCard, Touchable, toneColors, useHeaderScroll, useRefresh } from "@/components/ui";
import { PUZZLE_GAMES } from "@/lib/puzzle/registry";
import { nextLevelOf, usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

export default function PuzzleHubScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const query = usePuzzleMe();
  const me = query.data;
  const refresh = useRefresh(() => query.refetch(), { refreshing: query.isRefetching });
  const [shop, setShop] = useState<"lives" | "all" | null>(null);
  const [daily, setDaily] = useState(false);

  if (!auth.user) return <Redirect href="/giris" />;

  const city = me?.city;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Lig Yolu" subtitle="Seviye seviye ilerle, kulüp şehrini kur" back scrollY={scrollY} />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
        {query.isLoading ? (
          <SkeletonCard lines={5} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : me ? (
          <>
            <WalletBar profile={me.profile} onCoins={() => setShop("all")} onLives={() => setShop("lives")} onStars={() => router.push("/kulup-sehri")} />

            {me.profile.daily.available ? (
              <Touchable onPress={() => setDaily(true)} style={styles.daily} haptic="medium" accessibilityRole="button">
                <Ionicons name="gift" size={26} color={colors.yellowCard} />
                <View style={styles.dailyTexts}>
                  <Text style={styles.dailyTitle} {...textScale.dense}>Günlük ödülün hazır</Text>
                  <Text style={styles.dailySub} {...textScale.dense}>
                    {me.profile.daily.next_streak}. gün · {me.profile.daily.reward.coins} jeton
                    {me.profile.daily.reward.boosters ? " + güçlendirici" : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onDarkMuted} />
              </Touchable>
            ) : null}

            {/* KULÜP ŞEHRİ KARTI — yıldızlar burada harcanır */}
            <Touchable onPress={() => router.push("/kulup-sehri")} style={styles.stadium} accessibilityRole="button" accessibilityLabel="Kulüp Şehrini kur">
              <View style={styles.stadiumBar}>
                <View style={styles.cityIcon}>
                  <Ionicons name="business" size={26} color={colors.yellowCard} />
                </View>
                <View style={styles.stadiumTexts}>
                  <Text style={styles.stadiumTitle} {...textScale.dense}>Kulüp Şehrini kur</Text>
                  <Text style={styles.stadiumSub} numberOfLines={2} {...textScale.dense}>
                    {city ? `${city.tier.title} · ${city.progress.built}/${city.progress.total} basamak` : "Okul bahçesinden Avrupa devine: yıldızlarını harca"}
                  </Text>
                </View>
                <View style={styles.starPill}>
                  <Ionicons name="star" size={16} color={colors.yellowCard} />
                  <Text style={styles.starPillText} {...textScale.badge}>{city?.stars.available ?? me.profile.stars}</Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${city ? (city.progress.built / city.progress.total) * 100 : 0}%` }]} />
              </View>
            </Touchable>

            <SectionHeader title="Oyunlar" meta={`${me.profile.stars} yıldız`} style={styles.section} />
            {PUZZLE_GAMES.map((game) => {
              const progress = me.games[game.key];
              const next = nextLevelOf(progress);
              const tone = toneColors(game.tone);
              return (
                <Touchable key={game.key} onPress={() => router.push({ pathname: "/lig-yolu/[oyun]", params: { oyun: game.key } })} style={styles.card} haptic="selection" accessibilityRole="button" accessibilityLabel={`${game.title}, ${next}. seviye`}>
                  <View style={[styles.cardIcon, { backgroundColor: tone.dim }]}>
                    <Ionicons name={game.icon as keyof typeof Ionicons.glyphMap} size={30} color={tone.fg} />
                  </View>
                  <View style={styles.cardTexts}>
                    <Text style={styles.cardTitle} {...textScale.dense}>{game.title}</Text>
                    <Text style={styles.cardSub} numberOfLines={2} {...textScale.dense}>{game.tagline}</Text>
                    <View style={styles.cardMeta}>
                      <Text style={[styles.cardTier, { color: tone.fg }]} {...textScale.badge}>{tierOf(next)}</Text>
                      <Ionicons name="star" size={12} color={colors.yellowCard} />
                      <Text style={styles.cardStars} {...textScale.badge}>{progress?.total_stars ?? 0}</Text>
                    </View>
                  </View>
                  <View style={[styles.levelBadge, { backgroundColor: tone.fg }]}>
                    <Text style={styles.levelNum} {...textScale.badge}>{next}</Text>
                    <Text style={styles.levelLabel} {...textScale.badge}>seviye</Text>
                  </View>
                </Touchable>
              );
            })}

            <Touchable onPress={() => router.push("/lig-yolu/siralama")} style={styles.rank} accessibilityRole="button">
              <Ionicons name="podium" size={22} color={colors.brandAccent} />
              <Text style={styles.rankText} {...textScale.dense}>Lig Yolu sıralaması</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Touchable>
          </>
        ) : null}
      </ScrollView>
      <ShopSheet visible={shop != null} onClose={() => setShop(null)} me={me} focus={shop === "lives" ? "lives" : null} />
      <DailySheet visible={daily} onClose={() => setDaily(false)} me={me} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant * 2, gap: space.md, paddingTop: space.sm },
  section: { paddingHorizontal: 0 },
  daily: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.inkBlock },
  dailyTexts: { flex: 1, gap: 2 },
  dailyTitle: { ...type.h3, color: colors.onDark },
  dailySub: { ...type.bodySm, color: colors.onDarkMuted },
  cityIcon: { width: 48, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.inkTileBorder },
  stadium: { borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.inkBlock, borderWidth: hairline, borderColor: colors.inkTileBorder },
  stadiumBar: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  stadiumTexts: { flex: 1, gap: 2 },
  stadiumTitle: { ...type.h3, color: colors.onDark },
  stadiumSub: { ...type.bodySm, color: colors.onDarkMuted },
  starPill: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.inkPill },
  starPillText: { ...type.label, fontFamily: fonts.bold, color: colors.onDark },
  progressTrack: { height: 4, backgroundColor: colors.inkTile },
  progressFill: { height: 4, backgroundColor: colors.yellowCard },
  card: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  cardIcon: { width: 58, height: 58, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  cardTexts: { flex: 1, gap: 2 },
  cardTitle: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary },
  cardSub: { ...type.bodySm, color: colors.textSecondary },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: 2 },
  cardTier: { ...type.micro, marginRight: space.sm },
  cardStars: { ...type.micro, color: colors.textSecondary },
  levelBadge: { width: 58, paddingVertical: space.sm, borderRadius: radius.lg, alignItems: "center" },
  levelNum: { ...type.h2, fontFamily: fonts.bold, color: colors.textOnBrand },
  levelLabel: { ...type.micro, color: colors.textOnBrand },
  rank: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  rankText: { ...type.body, color: colors.textPrimary, flex: 1 },
});
