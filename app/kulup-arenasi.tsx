/**
 * KULÜP ARENASI — takımların haftalık arena tablosu ve takımımın derbi düellosu.
 *
 *   GET /api/arena/clubs        oyuncuların son 7 gündeki doğrulanmış oyunları;
 *                               oyuncu başına günde en çok 5 oyun × 2 puan
 *   GET /api/arena/duels/mine   takımımın önümüzdeki maçının Penaltı düellosu
 *
 * Katılım ödüllendirilir: takım arkadaşlarını uygulamaya çağırmak puandır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DuelCard } from "@/components/matchpage/Community";
import { SignatureStripe, StageCard, StageStat, StatPill } from "@/components/league/kit";
import {
  Button,
  EmptyState,
  ErrorState,
  GradientBar,
  RankBadge,
  Reveal,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonHero,
  SkeletonListRow,
  TeamLogo,
  Touchable,
  useHeaderScroll,
  useRefresh,
  type SegmentedItem,
} from "@/components/ui";
import { getClubBoard, getMyDuel } from "@/lib/api/community";
import { mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

type BoardScope = "tr" | "city";

/*
 * YENİDEN TASARIM (ikinci tur): kural paragrafı + düz liste yerine
 *   1. SAHNE — kuralın iki sayısı (oyun başına puan, günlük sınır), takımının
 *      sırası ve "Oyna" çağrısı tek koyu blokta;
 *   2. derbi düellosu (varsa);
 *   3. kapsam segmenti (Türkiye / şehrim);
 *   4. tablo: tek grup kartı; ilk üç madalya, puan hapı ve lidere göre
 *      degrade çubuk; kendi takımın imza şeridiyle.
 */
export default function ClubArenaScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  // Varsayılan Türkiye geneli; il yalnız süzgeç.
  const [cityOnly, setCityOnly] = useState(false);
  const cityId = cityOnly ? scope.cityId : null;

  const board = useQuery({ queryKey: ["arena", "clubs", cityId], queryFn: () => getClubBoard(cityId), staleTime: 60_000 });
  const duel = useQuery({ queryKey: ["arena", "duel", "mine"], queryFn: getMyDuel, enabled: Boolean(auth.user?.player_id), staleTime: 60_000 });
  const refresh = useRefresh(board.refetch, { refreshing: board.isRefetching });

  const entries = board.data?.entries ?? [];
  const mine = board.data?.mine ?? null;
  const leader = Math.max(1, ...entries.map((entry) => entry.points || 0));
  const scopeItems: SegmentedItem<BoardScope>[] = [
    { key: "tr", label: "Tüm Türkiye" },
    { key: "city", label: scope.cityLabel || "Şehrim" },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Kulüp Arenası" subtitle="Takımların haftalık arena yarışı" back scrollY={scrollY} />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
        <Reveal>
          <StageCard style={styles.hero}>
            <Text style={styles.heroOver} {...textScale.badge}>
              {upperTR("Bu haftanın yarışı")}
            </Text>
            <Text style={styles.heroTitle} {...textScale.dense}>
              {mine?.rank ? `Takımın ${mine.rank}. sırada` : "Takımını zirveye taşı"}
            </Text>
            <Text style={styles.heroBody} {...textScale.long}>
              Takımındaki oyuncuların her doğrulanmış oyunu takımına puan getirir. En çok katılan takım kazanır.
            </Text>
            {board.data?.rules.rewards?.length ? (
              <Text style={styles.heroBody} {...textScale.long}>
                Hafta sonunda ilindeki sıraya göre o hafta oynayan her takım üyesi Kulüp Şehri yıldızı alır:{" "}
                {board.data.rules.rewards.map((r) => `${r.from === r.to ? `${r.from}.` : `${r.from}–${r.to}.`} ${r.stars} yıldız`).join(" · ")}
              </Text>
            ) : null}
            <View style={styles.heroStats}>
              <StageStat label="Puan / oyun" value={board.data?.rules.pointsPerGame ?? 2} accent />
              <View style={styles.heroDivider} />
              <StageStat label="Günlük oyun" value={board.data?.rules.dailyGames ?? 5} />
              <View style={styles.heroDivider} />
              <StageStat label="Takımın" value={mine?.points ?? 0} />
            </View>
            <Button
              label="Oyna, puan getir"
              icon="game-controller"
              onPress={() => router.push("/(tabs)/oyunlar")}
              fullWidth
            />
          </StageCard>
        </Reveal>

        {duel.data?.duel ? <DuelCard matchId={duel.data.duel.matchId} /> : null}

        <SegmentedControl
          items={scopeItems}
          value={cityOnly ? "city" : "tr"}
          onChange={(next) => setCityOnly(next === "city")}
          size="sm"
          stretch
        />

        {mine && !mine.rank ? (
          <View style={styles.nudge}>
            <Ionicons name="flash" size={16} color={colors.warn} />
            <Text style={styles.nudgeText} {...textScale.long}>
              Takımın bu hafta henüz puan almadı. İlk oyunu sen oyna.
            </Text>
          </View>
        ) : null}

        <SectionHeader
          title="Haftalık tablo"
          meta={entries.length ? String(entries.length) : undefined}
          icon="podium"
          iconTone="gold"
          inset="flush"
        />

        {board.isLoading ? (
          <>
            <SkeletonHero />
            <SkeletonListRow count={6} />
          </>
        ) : board.isError ? (
          <ErrorState variant="inline" error={board.error} onRetry={board.refetch} />
        ) : !entries.length ? (
          <EmptyState icon="shield-outline" title="Bu hafta henüz puan yok" body="Oyuncu profili bağlı üyeler oynadıkça takımlar tabloya girer." variant="inline" />
        ) : (
          <View style={styles.table}>
            {entries.map((entry, index) => {
              const own = entry.teamId === mine?.teamId;
              return (
                <Reveal key={entry.teamId} index={index} limit={8}>
                  <Touchable
                    feedback="row"
                    haptic="selection"
                    onPress={() => router.push(`/takim/${entry.teamId}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${entry.rank ?? index + 1}. ${entry.name ?? "Takım"}, ${entry.points} puan`}
                    style={[styles.row, index > 0 ? styles.rowDivider : null, own ? styles.rowMine : null]}
                  >
                    {own ? <SignatureStripe /> : null}
                    <RankBadge rank={entry.rank ?? index + 1} size={26} />
                    <TeamLogo name={entry.name ?? "?"} logo={mediaUrl(entry.logo ?? null)} size={38} />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
                        {entry.name ?? "Takım"}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
                        {`${entry.members} oyuncu · ${entry.games ?? 0} oyun`}
                      </Text>
                      <GradientBar value={(entry.points || 0) / leader} height={3} style={styles.rowBar} />
                    </View>
                    <StatPill value={String(entry.points)} unit="P" tone={entry.rank === 1 ? "gold" : own ? "brand" : "neutral"} />
                  </Touchable>
                </Reveal>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm, paddingBottom: space.giant, gap: space.md },
  hero: { padding: space.lg, gap: space.sm },
  heroOver: { ...type.overline, color: colors.brandOnDark },
  heroTitle: { ...type.display, color: colors.onDark },
  heroBody: { ...type.bodySm, color: colors.onDarkMuted },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  heroDivider: { width: hairline, alignSelf: "stretch", backgroundColor: colors.borderOnDark },
  nudge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.warnDim,
  },
  nudgeText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  table: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevate(1),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowDivider: { borderTopWidth: hairline, borderTopColor: colors.separator },
  rowMine: { backgroundColor: colors.brandDim },
  rowBody: { flex: 1, minWidth: 0, gap: space.xxs },
  rowTitle: { ...type.h4, color: colors.textPrimary },
  rowMeta: { ...type.caption, color: colors.textTertiary },
  rowBar: { marginTop: space.xxs },
});
