/**
 * SEZON ÖZETİ — oyuncunun sezonunun paylaşılabilir hikâyesi
 * (GET /api/career/season-summary).
 *
 * Kartlar yalnız gerçek veriden: maç, gol, asist, reyting, galibiyet dengesi,
 * en iyi maç, ödüller, ligdeki gol sırası, taraftar oylaması ve Tahmin Ligi.
 * Üstteki özet kartı görsel olarak paylaşılır (Instagram hikâyesi için).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";

import { EliteCard } from "@/components/career/EliteCard";
import { Button, EmptyState, ErrorState, ScreenHeader, SkeletonCard, useHeaderScroll, useToast } from "@/components/ui";
import { getSeasonSummary } from "@/lib/api/community";
import { formatDateShort } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

export default function SeasonSummaryScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { scrollY, scrollProps } = useHeaderScroll();
  const shotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  const query = useQuery({ queryKey: ["career", "season-summary"], queryFn: () => getSeasonSummary(), enabled: Boolean(auth.user), staleTime: 10 * 60_000 });
  const data = query.data;

  if (!auth.user) return <Redirect href="/giris" />;

  const share = async () => {
    setSharing(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "image/png" });
      else toast.show({ message: "Bu cihazda paylaşım kapalı.", tone: "warn" });
    } catch {
      toast.show({ message: "Görsel hazırlanamadı.", tone: "danger" });
    } finally {
      setSharing(false);
    }
  };

  const needsPlayer = query.error instanceof ApiError && query.error.code === "PLAYER_REQUIRED";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Sezon Özeti" back scrollY={scrollY} />
      {query.isLoading ? (
        <View style={styles.pad}>
          <SkeletonCard lines={8} />
        </View>
      ) : needsPlayer ? (
        <EmptyState
          icon="person-add-outline"
          title="Oyuncu profilini bağla"
          body="Sezon özeti, maçlarda oynayan oyuncunun gerçek istatistiklerinden hazırlanır."
          action={{ label: "Profilimi bağla", onPress: () => router.push("/oyuncum/bagla") }}
        />
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
            <LinearGradient colors={colors.gradientInk} style={styles.hero}>
              <Text style={styles.heroOver} {...textScale.badge}>
                {upperTR(`${data.season.league ?? "ElitLig"} · ${data.season.name ?? "Sezon"}`)}
              </Text>
              <Text style={styles.heroName} {...textScale.dense}>
                {data.player.name}
              </Text>
              <View style={styles.heroStats}>
                <HeroStat value={data.totals.matches} label="maç" />
                <HeroStat value={data.totals.goals} label="gol" />
                <HeroStat value={data.totals.assists} label="asist" />
                <HeroStat value={data.totals.rating != null ? data.totals.rating.toFixed(1) : "–"} label="reyting" />
              </View>
              {data.goalRank ? (
                <Text style={styles.heroLine} {...textScale.dense}>
                  {`Ligin gol krallığında ${data.goalRank.rank}. (${data.goalRank.of} oyuncu arasında, ilk %${Math.max(1, 100 - (data.goalRank.percentile ?? 0) + 1)})`}
                </Text>
              ) : null}
              <Text style={styles.heroBrand} {...textScale.badge}>
                ELİTLİG
              </Text>
            </LinearGradient>
          </ViewShot>
          <Button label="Özetimi paylaş" icon="share-outline" onPress={share} loading={sharing} />

          <Fact icon="trophy" title="Galibiyet dengesi" body={`${data.record.wins} galibiyet · ${data.record.draws} beraberlik · ${data.record.losses} mağlubiyet`} />
          {data.bestMatch ? (
            <Fact
              icon="flame"
              title="Sezonun en iyi maçın"
              body={`${data.bestMatch.label} · ${formatDateShort(data.bestMatch.date)}\n${data.bestMatch.goals} gol · ${data.bestMatch.assists} asist${data.bestMatch.rating != null ? ` · ${data.bestMatch.rating.toFixed(1)} reyting` : ""}`}
              onPress={() => router.push(`/mac/${data.bestMatch?.matchId}`)}
            />
          ) : null}
          <Fact icon="ribbon" title="Ödüller" body={`${data.awards.motm} kez maçın oyuncusu · ${data.awards.weekly} kez haftanın enleri`} />
          {data.fanVoteWins ? <Fact icon="people" title="Taraftarın oyuncusu" body={`${data.fanVoteWins} maçta taraftarlar seni seçti.`} /> : null}
          {data.predictions.points ? (
            <Fact icon="podium" title="Tahmin Ligi" body={`${data.predictions.points} puan · ${data.predictions.exact} tam skor`} />
          ) : null}
          {data.totals.saves ? <Fact icon="hand-left" title="Kurtarışlar" body={`${data.totals.saves} kurtarış`} /> : null}
          <Fact icon="card" title="Disiplin" body={`${data.totals.yellow} sarı · ${data.totals.red} kırmızı kart`} />

          {data.card ? <EliteCard card={data.card} /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function HeroStat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.heroLabel} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
}

function Fact({ icon, title, body, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; onPress?: () => void }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={22} color={colors.accent} />
      <View style={styles.flex}>
        <Text style={styles.factTitle} {...textScale.dense} onPress={onPress}>
          {title}
        </Text>
        <Text style={styles.factBody} {...textScale.long}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pad: { padding: layout.screenPadding },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant, gap: space.md },
  hero: { borderRadius: radius.xl, padding: space.lg, gap: space.s },
  heroOver: { ...type.overline, color: colors.onDarkMuted },
  heroName: { ...type.display, color: colors.onDark },
  heroStats: { flexDirection: "row", justifyContent: "space-between", marginTop: space.s },
  heroStat: { alignItems: "center", minWidth: 64 },
  heroValue: { ...type.scoreLg, color: colors.onDark },
  heroLabel: { ...type.overline, color: colors.onDarkMuted },
  heroLine: { ...type.label, color: colors.onDark, marginTop: space.s },
  heroBrand: { ...type.overline, color: colors.onDarkMuted, textAlign: "right", marginTop: space.s },
  fact: {
    flexDirection: "row",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  factTitle: { ...type.label, color: colors.textPrimary },
  factBody: { ...type.body, color: colors.textSecondary },
});
