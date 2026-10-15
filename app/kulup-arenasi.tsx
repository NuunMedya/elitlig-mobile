/**
 * KULÜP ARENASI — takımların haftalık arena tablosu ve takımımın derbi düellosu.
 *
 *   GET /api/arena/clubs        oyuncuların son 7 gündeki doğrulanmış oyunları;
 *                               oyuncu başına günde en çok 5 oyun × 2 puan
 *   GET /api/arena/duels/mine   takımımın önümüzdeki maçının Penaltı düellosu
 *
 * Katılım ödüllendirilir: takım arkadaşlarını uygulamaya çağırmak puandır.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DuelCard } from "@/components/matchpage/Community";
import {
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SkeletonCard,
  TeamLogo,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import { getClubBoard, getMyDuel } from "@/lib/api/community";
import { mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

export default function ClubArenaScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [cityOnly, setCityOnly] = useState(true);
  const cityId = cityOnly ? scope.cityId : null;

  const board = useQuery({ queryKey: ["arena", "clubs", cityId], queryFn: () => getClubBoard(cityId), staleTime: 60_000 });
  const duel = useQuery({ queryKey: ["arena", "duel", "mine"], queryFn: getMyDuel, enabled: Boolean(auth.user?.player_id), staleTime: 60_000 });
  const refresh = useRefresh(board.refetch, { refreshing: board.isRefetching });

  const entries = board.data?.entries ?? [];
  const mine = board.data?.mine ?? null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Kulüp Arenası" subtitle="Takımların haftalık arena yarışı" back scrollY={scrollY} />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
        <View style={styles.card}>
          <Text style={styles.text} {...textScale.long}>
            {`Takımındaki oyuncuların her doğrulanmış oyunu takımına ${board.data?.rules.pointsPerGame ?? 2} puan getirir (kişi başı günde en çok ${board.data?.rules.dailyGames ?? 5} oyun). En çok katılan takım kazanır.`}
          </Text>
          <Button label="Oyna" icon="game-controller-outline" size="sm" onPress={() => router.push("/(tabs)/oyunlar")} />
        </View>

        {duel.data?.duel ? <DuelCard matchId={duel.data.duel.matchId} /> : null}

        <ChipGroup contentPadding={0}>
          <Chip size="sm" label={scope.cityLabel || "Şehrim"} selected={cityOnly} onPress={() => setCityOnly(true)} />
          <Chip size="sm" label="Tüm Türkiye" selected={!cityOnly} onPress={() => setCityOnly(false)} />
        </ChipGroup>

        {mine ? (
          <View style={[styles.card, styles.mine]}>
            <Text style={styles.text} {...textScale.dense}>
              {mine.rank ? `Takımın ${mine.rank}. sırada · ${mine.points} puan · ${mine.members} oyuncu` : "Takımın bu hafta henüz puan almadı. İlk oyunu sen oyna."}
            </Text>
          </View>
        ) : null}

        {board.isLoading ? (
          <SkeletonCard lines={6} />
        ) : board.isError ? (
          <ErrorState variant="inline" error={board.error} onRetry={board.refetch} />
        ) : !entries.length ? (
          <EmptyState icon="shield-outline" title="Bu hafta henüz puan yok" body="Oyuncu profili bağlı üyeler oynadıkça takımlar tabloya girer." variant="inline" />
        ) : (
          <View>
            {entries.map((entry, index) => (
              <ListRow
                key={entry.teamId}
                leading={<TeamLogo name={entry.name ?? "?"} logo={mediaUrl(entry.logo ?? null)} size={layout.crestLg} />}
                title={`${entry.rank}. ${entry.name ?? "Takım"}`}
                subtitle={`${entry.members} oyuncu · ${entry.games ?? 0} oyun`}
                value={`${entry.points} p`}
                highlighted={entry.teamId === mine?.teamId}
                position={entries.length === 1 ? "single" : index === 0 ? "first" : index === entries.length - 1 ? "last" : "middle"}
                onPress={() => router.push(`/takim/${entry.teamId}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant, gap: space.md },
  card: {
    gap: space.s,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  mine: { borderColor: colors.accent },
  text: { ...type.body, color: colors.textSecondary },
});
