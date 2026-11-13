/**
 * HAFTANIN ENLERİ — seçili ligin yayınlanmış haftalık ödülleri
 * (GET /api/weekly-awards/public; web'de lig ana sayfasındaki "Haftanın
 * Enleri" çubuğu ve haftanın kadrosu kartı).
 *
 * İKİNCİ TUR — KURGU:
 *   1. Lig seçici + hafta çipleri (son 8 yayın).
 *   2. HAFTANIN OYUNCUSU sahnesi (`StageCard`: mürekkep + aurora): altın
 *      halkalı büyük avatar, ad, takım ve haftanın sayıları (gol · asist ·
 *      reyting) dönen sayaçlarla.
 *   3. ÖDÜLLER: 2×2 ızgara — her ödülün kendi degrade ikon karosu (kaleci
 *      eldiven, defans kalkan, orta saha ağ, forvet şimşek, fair play el
 *      sıkışma, takım kupa), avatar/arma, ad ve istatistik satırı.
 *   4. HAFTANIN KADROSU sahada (`PitchView`): yuvalar ("GK1", "DEF2"…) hatta
 *      çevrilir, diziliş başlıkta; altında aynı kadronun ince listesi.
 *
 * Oyuncuya dokunmak profilini, takıma dokunmak takım sayfasını açar.
 * WEEKLY_AWARD_SET bildirimi buraya iner.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeaguePicker } from "@/components/LeaguePicker";
import {
  Avatar,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  IconTile,
  PitchView,
  Reveal,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  SkeletonCard,
  TeamLogo,
  Touchable,
  useHeaderScroll,
  useRefresh,
  type IconTileTone,
  type PitchPlayerView,
} from "@/components/ui";
import { StageCard, StageStat } from "@/components/league/kit";
import { WeeklyShare } from "@/components/share/ProfileShare";
import { getWeeklyAwards, type WeeklyAwardItem } from "@/lib/api/weeklyAwards";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { useScope } from "@/providers/ScopeProvider";
import { colors, glowStyle, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

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

/** Ödülün ikon karosu — mevki/ödül kimliği her haftada aynı renkte. */
const AWARD_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }> = {
  WEEKLY_PLAYER: { icon: "star", tone: "gold" },
  WEEKLY_GOALKEEPER: { icon: "hand-left", tone: "cyan" },
  WEEKLY_DEFENDER: { icon: "shield", tone: "mint" },
  WEEKLY_MIDFIELDER: { icon: "git-network", tone: "violet" },
  WEEKLY_FORWARD: { icon: "flash", tone: "pink" },
  WEEKLY_FAIR_PLAY: { icon: "heart", tone: "red" },
  WEEKLY_TEAM: { icon: "trophy", tone: "signature" },
};

/** Kadro yuvası ("GK1", "DEF2") → sahadaki hat (PitchView mevki metni). */
const SLOT_POSITION: Record<string, string> = {
  GK: "Kaleci",
  DEF: "Defans",
  MID: "Orta Saha",
  FWD: "Forvet",
};
const slotPosition = (item: WeeklyAwardItem) => {
  const slot = String(item.position_slot ?? "").replace(/\d+$/, "").toUpperCase();
  return SLOT_POSITION[slot] ?? item.player_position ?? null;
};

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

/* ═════════════════════════ ÖDÜL KAROSU ═════════════════════════ */

function AwardTile({ item, onPress }: { item: WeeklyAwardItem; onPress: () => void }) {
  const look = AWARD_ICON[item.award_type] ?? { icon: "ribbon" as const, tone: "neutral" as const };
  const name = item.player_name ?? item.team_name ?? "—";
  const sub = [item.player_team_name, statLine(item)].filter(Boolean).join(" · ");
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      style={styles.tile}
      accessibilityRole="button"
      accessibilityLabel={`${AWARD_LABELS[item.award_type] ?? item.award_type}: ${name}`}
    >
      <View style={styles.tileTop}>
        <IconTile icon={look.icon} tone={look.tone} size={28} glow={false} />
        <Text style={styles.tileLabel} numberOfLines={2} {...textScale.badge}>
          {upperTR(AWARD_LABELS[item.award_type] ?? item.award_type)}
        </Text>
      </View>
      <View style={styles.tileWho}>
        {item.player_id ? (
          <Avatar name={item.player_name ?? "?"} image={mediaUrl(item.player_img)} size={40} />
        ) : (
          <TeamLogo name={item.team_name ?? "?"} logo={mediaUrl(item.team_logo)} size={40} />
        )}
        <View style={styles.flex}>
          <Text style={styles.tileName} numberOfLines={2} {...textScale.dense}>
            {name}
          </Text>
        </View>
      </View>
      {sub ? (
        <Text style={styles.tileSub} numberOfLines={2} {...textScale.dense}>
          {sub}
        </Text>
      ) : null}
    </Touchable>
  );
}

export default function WeeklyAwardsScreen() {
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const { width } = useWindowDimensions();
  const [setId, setSetId] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

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

  const star = honors.find((item) => item.award_type === "WEEKLY_PLAYER") ?? null;
  const others = honors.filter((item) => item !== star);
  const pitchPlayers = useMemo<PitchPlayerView[]>(
    () =>
      squad.map((item) => ({
        key: String(item.id),
        name: item.player_name ?? "—",
        photo: mediaUrl(item.player_img),
        position: slotPosition(item),
        rating: item.stats?.rating ?? null,
        onPress: () => openItem(item),
      })),
    // openItem her çizimde yeni; kadro değişmedikçe saha yeniden kurulmaz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [squad],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Haftanın enleri"
        back
        scrollY={scrollY}
        actions={
          current
            ? [{ icon: "share-outline", onPress: () => setShareOpen(true), accessibilityLabel: "Haftanın enlerini paylaş" }]
            : undefined
        }
      />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
        <LeaguePicker pinned={false} flush />
        {!scope.ready || query.isLoading ? (
          <View style={styles.skeleton}>
            <Skeleton height={28} width="60%" radius="pill" />
            <Skeleton height={220} radius="xxl" />
            <SkeletonCard lines={4} />
          </View>
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
                    icon={item.id === current.id ? "calendar" : undefined}
                    label={weekLabel(item.start_date, item.end_date)}
                    selected={item.id === current.id}
                    onPress={() => setSetId(item.id)}
                  />
                ))}
              </ChipGroup>
            ) : null}

            {star ? (
              <Reveal index={0} scaleFrom={0.97} replayKey={current.id}>
                <Touchable
                  feedback="card"
                  haptic="selection"
                  onPress={() => openItem(star)}
                  accessibilityRole="button"
                  accessibilityLabel={`Haftanın oyuncusu: ${star.player_name ?? star.team_name ?? ""}`}
                >
                  <StageCard>
                    <View style={styles.hero}>
                      <View style={styles.heroTop}>
                        <Text style={styles.heroOver} {...textScale.badge}>
                          {upperTR("Haftanın oyuncusu")}
                        </Text>
                        <Text style={styles.heroWeek} numberOfLines={1} {...textScale.dense}>
                          {weekLabel(current.start_date, current.end_date)}
                        </Text>
                      </View>
                      <View style={styles.heroWho}>
                        <View style={[styles.heroRing, glowStyle(colors.medalGold[1], 2)]}>
                          <Avatar name={star.player_name ?? "?"} image={mediaUrl(star.player_img)} size={76} />
                        </View>
                        <View style={styles.heroTrophy}>
                          <IconTile icon="trophy" tone="gold" size={28} />
                        </View>
                      </View>
                      <Text style={styles.heroName} numberOfLines={2} {...textScale.dense}>
                        {star.player_name ?? star.team_name ?? "—"}
                      </Text>
                      {star.player_team_name ? (
                        <View style={styles.heroTeam}>
                          <TeamLogo
                            name={star.player_team_name}
                            logo={mediaUrl(star.player_team_logo)}
                            size={18}
                          />
                          <Text style={styles.heroTeamText} numberOfLines={1} {...textScale.dense}>
                            {star.player_team_name}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.heroStats}>
                        <StageStat label="Gol" value={star.stats?.goals ?? 0} />
                        <View style={styles.heroDivider} />
                        <StageStat label="Asist" value={star.stats?.assists ?? 0} />
                        <View style={styles.heroDivider} />
                        <StageStat
                          label="Reyting"
                          value={star.stats?.rating ? Number(star.stats.rating).toFixed(1) : "–"}
                          accent
                        />
                      </View>
                    </View>
                  </StageCard>
                </Touchable>
              </Reveal>
            ) : (
              <Text style={styles.title} {...textScale.dense}>
                {current.title || weekLabel(current.start_date, current.end_date)}
              </Text>
            )}

            {others.length ? (
              <View>
                <SectionHeader title="Ödüller" meta={`${others.length} ödül`} inset="flush" size="group" />
                <View style={styles.grid}>
                  {others.map((item, index) => (
                    <Reveal key={item.id} index={index + 1} style={styles.gridCell} replayKey={current.id}>
                      <AwardTile item={item} onPress={() => openItem(item)} />
                    </Reveal>
                  ))}
                </View>
              </View>
            ) : null}

            {squad.length ? (
              <View>
                <SectionHeader
                  title="Haftanın kadrosu"
                  meta={current.formation ? `Diziliş ${current.formation}` : `${squad.length} oyuncu`}
                  inset="flush"
                  size="group"
                />
                <View style={styles.pitchCard}>
                  <PitchView
                    players={pitchPlayers}
                    width={width - layout.screenPadding * 2 - space.sm * 2}
                  />
                </View>
                <View style={styles.squadList}>
                  {squad.map((item, index) => (
                    <Touchable
                      key={item.id}
                      feedback="row"
                      onPress={() => openItem(item)}
                      style={[styles.squadRow, index > 0 ? styles.squadRowBorder : null]}
                      accessibilityRole="button"
                      accessibilityLabel={item.player_name ?? "Oyuncu"}
                    >
                      <View style={styles.slot}>
                        <Text style={styles.slotText} {...textScale.badge}>
                          {String(item.position_slot ?? item.player_position ?? "—").replace(/\d+$/, "")}
                        </Text>
                      </View>
                      <Avatar name={item.player_name ?? "?"} image={mediaUrl(item.player_img)} size={32} />
                      <View style={styles.flex}>
                        <Text style={styles.squadName} numberOfLines={1} {...textScale.dense}>
                          {item.player_name ?? "—"}
                        </Text>
                        {item.player_team_name ? (
                          <Text style={styles.squadMeta} numberOfLines={1} {...textScale.dense}>
                            {item.player_team_name}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
                    </Touchable>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      {/* Paylaşım stüdyosu: haftanın oyuncusu, kadro sahası ve ödüller. */}
      <WeeklyShare
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        set={current}
        weekLabel={current ? current.title || weekLabel(current.start_date, current.end_date) : ""}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant, paddingTop: space.md, gap: space.lg },
  skeleton: { gap: space.md },
  title: { ...type.h2, color: colors.textPrimary },

  /* — Haftanın oyuncusu sahnesi — */
  hero: { alignItems: "center", padding: space.lg, gap: space.xs },
  heroTop: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  heroOver: { ...type.overline, color: colors.brandOnDark },
  heroWeek: { ...type.caption, color: colors.onDarkMuted, flexShrink: 1 },
  heroWho: { marginTop: space.md, marginBottom: space.sm },
  heroRing: { padding: 3, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.medalGold[0] },
  heroTrophy: { position: "absolute", right: -10, bottom: -4 },
  heroName: { ...type.display, color: colors.onDark, textAlign: "center" },
  heroTeam: { flexDirection: "row", alignItems: "center", gap: space.s },
  heroTeamText: { ...type.label, color: colors.onDarkMuted },
  heroStats: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    marginTop: space.md,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  heroDivider: { width: hairline, alignSelf: "stretch", backgroundColor: colors.inkTileBorder },

  /* — Ödül ızgarası — */
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  gridCell: { width: "48.6%", flexGrow: 1 },
  tile: {
    flex: 1,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  tileTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  tileLabel: { ...type.overline, color: colors.textTertiary, flex: 1 },
  tileWho: { flexDirection: "row", alignItems: "center", gap: space.sm },
  tileName: { ...type.h4, color: colors.textPrimary },
  tileSub: { ...type.caption, color: colors.textTertiary },

  /* — Haftanın kadrosu — */
  pitchCard: {
    padding: space.sm,
    borderRadius: radius.xxl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  squadList: {
    marginTop: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  squadRow: { flexDirection: "row", alignItems: "center", gap: space.m, paddingHorizontal: space.md, minHeight: 56 },
  squadRowBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  slot: {
    minWidth: 38,
    paddingHorizontal: space.xs,
    paddingVertical: space.xxs,
    borderRadius: radius.xs,
    alignItems: "center",
    backgroundColor: colors.brandDim,
  },
  slotText: { ...type.micro, color: colors.brandAccent },
  squadName: { ...type.h4, color: colors.textPrimary },
  squadMeta: { ...type.caption, color: colors.textTertiary },
});
