/**
 * HAFTANIN ENLERİ — seçili ligin yayınlanmış haftalık ödülleri
 * (GET /api/weekly-awards/public; web'de lig ana sayfasındaki "Haftanın
 * Enleri" çubuğu ve haftanın kadrosu kartı).
 *
 * Üstte hafta çipleri (son 8 yayın), altında ödüller (haftanın oyuncusu,
 * mevki enleri, fair play, haftanın takımı) ve haftanın kadrosu. Oyuncuya
 * dokunmak profilini açar. WEEKLY_AWARD_SET bildirimi buraya iner.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeaguePicker } from "@/components/LeaguePicker";
import {
  Avatar,
  Badge,
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
import { getWeeklyAwards, type WeeklyAwardItem } from "@/lib/api/weeklyAwards";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, space, textScale, type } from "@/theme";

const AWARD_LABELS: Record<string, string> = {
  WEEKLY_PLAYER: "Haftanın oyuncusu",
  WEEKLY_GOALKEEPER: "Haftanın kalecisi",
  WEEKLY_DEFENDER: "Haftanın defansı",
  WEEKLY_MIDFIELDER: "Haftanın orta sahası",
  WEEKLY_FORWARD: "Haftanın forveti",
  WEEKLY_FAIR_PLAY: "Fair play",
  WEEKLY_TEAM: "Haftanın takımı",
};
const AWARD_ORDER = Object.keys(AWARD_LABELS);

const statLine = (item: WeeklyAwardItem) => {
  const s = item.stats;
  if (!s) return null;
  return [
    s.goals ? `${s.goals} gol` : null,
    s.assists ? `${s.assists} asist` : null,
    s.rating ? `${Number(s.rating).toFixed(1)} reyting` : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

const position = (index: number, length: number) =>
  length === 1 ? "single" : index === 0 ? "first" : index === length - 1 ? "last" : "middle";

export default function WeeklyAwardsScreen() {
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [setId, setSetId] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ["weekly-awards", scope.cityId, scope.leagueId, scope.seasonId],
    queryFn: () => getWeeklyAwards({ cityId: scope.cityId, leagueId: scope.leagueId, seasonId: scope.seasonId }),
    enabled: scope.ready,
    staleTime: 10 * 60_000,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const sets = useMemo(() => query.data ?? [], [query.data]);
  const current = sets.find((item) => item.id === setId) ?? sets[0] ?? null;

  const honors = useMemo(
    () =>
      (current?.items ?? [])
        .filter((item) => item.award_type !== "WEEKLY_SQUAD_PLAYER")
        .sort((a, b) => AWARD_ORDER.indexOf(a.award_type) - AWARD_ORDER.indexOf(b.award_type)),
    [current],
  );
  const squad = useMemo(
    () =>
      (current?.items ?? [])
        .filter((item) => item.award_type === "WEEKLY_SQUAD_PLAYER")
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [current],
  );

  const openItem = (item: WeeklyAwardItem) => {
    if (item.player_id) router.push(`/oyuncu/${item.player_id}`);
    else if (item.team_id) router.push(`/takim/${item.team_id}`);
  };

  const weekLabel = (start: string | null, end: string | null) =>
    [formatDateShort(start), formatDateShort(end)].filter(Boolean).join(" – ") || "Hafta";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Haftanın enleri" back scrollY={scrollY} />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
        <LeaguePicker pinned={false} flush />
        {!scope.ready || query.isLoading ? (
          <SkeletonCard lines={6} />
        ) : query.isError ? (
          <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
        ) : !current ? (
          <EmptyState
            icon="trophy-outline"
            title="Bu ligde yayınlanmış ödül yok"
            body="Lig yönetimi haftanın enlerini yayınladığında burada görünür."
            variant="inline"
          />
        ) : (
          <>
            {sets.length > 1 ? (
              <ChipGroup contentPadding={0}>
                {sets.map((item) => (
                  <Chip
                    key={item.id}
                    size="sm"
                    label={weekLabel(item.start_date, item.end_date)}
                    selected={item.id === current.id}
                    onPress={() => setSetId(item.id)}
                  />
                ))}
              </ChipGroup>
            ) : null}
            <Text style={styles.title} {...textScale.dense}>
              {current.title || weekLabel(current.start_date, current.end_date)}
            </Text>

            {honors.length ? (
              <View>
                {honors.map((item, index) => (
                  <ListRow
                    key={item.id}
                    leading={
                      item.player_id ? (
                        <Avatar name={item.player_name ?? "?"} image={mediaUrl(item.player_img)} size={layout.crestLg} />
                      ) : (
                        <TeamLogo name={item.team_name ?? "?"} logo={mediaUrl(item.team_logo)} size={layout.crestLg} />
                      )
                    }
                    title={item.player_name ?? item.team_name ?? "—"}
                    subtitle={[item.player_team_name, statLine(item)].filter(Boolean).join(" · ") || undefined}
                    badge={<Badge label={AWARD_LABELS[item.award_type] ?? item.award_type} tone={item.award_type === "WEEKLY_PLAYER" ? "warn" : "info"} size="xs" />}
                    position={position(index, honors.length)}
                    onPress={() => openItem(item)}
                  />
                ))}
              </View>
            ) : null}

            {squad.length ? (
              <>
                <Text style={styles.section} {...textScale.badge}>
                  {`HAFTANIN KADROSU${current.formation ? ` · ${current.formation}` : ""}`}
                </Text>
                <View>
                  {squad.map((item, index) => (
                    <ListRow
                      key={item.id}
                      leading={<Avatar name={item.player_name ?? "?"} image={mediaUrl(item.player_img)} size={layout.crestLg} />}
                      title={item.player_name ?? "—"}
                      subtitle={[item.position_slot ?? item.player_position, item.player_team_name].filter(Boolean).join(" · ") || undefined}
                      position={position(index, squad.length)}
                      onPress={() => openItem(item)}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant, paddingTop: space.md, gap: space.md },
  title: { ...type.h3, color: colors.textPrimary },
  section: { ...type.overline, color: colors.textTertiary },
});

