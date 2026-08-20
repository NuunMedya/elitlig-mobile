import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import {
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  FormChips,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonCard,
  SkeletonListRow,
  StatBar,
  TeamLogo,
  Touchable,
  useHeaderScroll,
  useRefresh,
  useToast,
  type SegmentedItem,
} from "@/components/ui";
import { getTeamMatches } from "@/lib/api/matches";
import { getStandings } from "@/lib/api/standings";
import { formatDateShort } from "@/lib/format";
import { matchState } from "@/lib/match";
import { queryKeys } from "@/lib/queryKeys";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";
import type { ApiMatch, StandingRow } from "@/lib/types";

/**
 * H2H — iki takımın karşılaştırması.
 *
 * NEDEN AYRI EKRAN OLARAK KALDI: maç detayının H2H segmenti YALNIZ o maçın iki
 * takımını karşılaştırır. Bu ekran ise takım profilindeki "H2H karşılaştır"
 * kapısından herhangi iki takım için açılır (aralarında oynanmış maç olması
 * bile gerekmez). Rota parametreleri değişmedi:
 *   /h2h?homeId=&homeName=&awayId=&awayName=
 *
 * VERİ MANTIĞI KORUNDU (eski sürümle birebir):
 *   • Karşılaşmalar EV SAHİBİ takımın maç listesinden süzülür; kimlik varsa
 *     `home_team_id`/`away_team_id`, yoksa takım ADI eşleşmesi kullanılır —
 *     eski kayıtlarda takım kimliği boş gelebiliyor.
 *   • Yalnız BİTMİŞ maçlar sayılır; galibiyet/gol dağılımı ev sahibi gözünden
 *     okunur.
 *   • Form, her takımın KENDİ maç listesinden son 5 bitmiş maçtır.
 *   • Sıra ve puan, ekrandaki kapsamın puan tablosundan gelir.
 *
 * DEĞİŞEN SUNUM: eski ekran her şeyi tek `ScrollView` içinde çiziyor ve
 * karşılaşmaları 8'le kırpıyordu. Artık liste sanaldır (`FlatList`), bu yüzden
 * kırpma kalktı: iki takımın TÜM geçmişi görülebiliyor.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Yardımcılar
   ══════════════════════════════════════════════════════════════════════════ */

/** expo-router aynı anahtarı dizi olarak da verebilir; ilkini al. */
function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Türkçe katlamalı ad normalizasyonu (I/İ tuzağı). */
function normalizeName(value?: string | null): string {
  return String(value ?? "").trim().toLocaleLowerCase("tr-TR");
}

function kickoffAt(item: ApiMatch): number {
  const day = String(item.date ?? "").slice(0, 10);
  const time = item.time ? String(item.time) : "00:00:00";
  const stamp = new Date(`${day}T${time}`).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

/** Bakılan takım bu maçta "birinci takım" tarafında mı? */
function sideIsFirst(item: ApiMatch, teamId: number | null, nameLower: string): boolean {
  if (teamId && Number(item.home_team_id)) return Number(item.home_team_id) === teamId;
  return normalizeName(item.first_team_name) === nameLower;
}

/** Maçın, bakılan takım gözünden sonucu. */
function resultFor(item: ApiMatch, teamId: number | null, nameLower: string): "G" | "B" | "M" {
  const first = sideIsFirst(item, teamId, nameLower);
  const ours = first ? item.first_team_score : item.second_team_score;
  const theirs = first ? item.second_team_score : item.first_team_score;
  if (ours == null || theirs == null) return "B";
  if (ours > theirs) return "G";
  if (ours < theirs) return "M";
  return "B";
}

/** Son 5 bitmiş maçın form dizgesi — FormChips G/B/M harflerini de çözer. */
function formString(
  matches: ApiMatch[] | undefined,
  teamId: number | null,
  nameLower: string,
): string {
  return (matches ?? [])
    .filter((item) => matchState(item) === "finished")
    .sort((a, b) => kickoffAt(b) - kickoffAt(a))
    .slice(0, 5)
    .reverse()
    .map((item) => resultFor(item, teamId, nameLower))
    .join("");
}

const matchKey = (item: ApiMatch) => String(item.id);

/* ══════════════════════════════════════════════════════════════════════════
   EKRAN
   ══════════════════════════════════════════════════════════════════════════ */

export default function H2HScreen() {
  const params = useLocalSearchParams<{
    homeId?: string;
    homeName?: string;
    awayId?: string;
    awayName?: string;
  }>();
  const router = useRouter();
  const scope = useScope();
  const toast = useToast();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [shareOpen, setShareOpen] = useState(false);

  const homeId = Number(firstParam(params.homeId)) || null;
  const awayId = Number(firstParam(params.awayId)) || null;
  const homeName = firstParam(params.homeName);
  const awayName = firstParam(params.awayName);
  const homeLower = normalizeName(homeName);
  const awayLower = normalizeName(awayName);

  /** Kimlik de ad da yoksa karşılaştırılacak bir şey yok. */
  const hasTargets = Boolean((homeId || homeLower) && (awayId || awayLower));

  const homeMatchesQuery = useQuery({
    queryKey: queryKeys.teamMatches(homeId ?? 0),
    queryFn: () => getTeamMatches(homeId as number),
    enabled: Boolean(homeId),
    staleTime: 60_000,
  });

  const awayMatchesQuery = useQuery({
    queryKey: queryKeys.teamMatches(awayId ?? 0),
    queryFn: () => getTeamMatches(awayId as number),
    enabled: Boolean(awayId),
    staleTime: 60_000,
  });

  const standingsQuery = useQuery({
    queryKey: queryKeys.standings({
      cityId: scope.cityId ?? undefined,
      leagueId: scope.leagueId ?? undefined,
      seasonId: scope.seasonId ?? undefined,
    }),
    queryFn: () =>
      getStandings({ cityId: scope.cityId!, leagueId: scope.leagueId!, seasonId: scope.seasonId! }),
    enabled: scope.ready,
    staleTime: 5 * 60_000,
  });

  /* ---- Karşılaşmalar: ev sahibinin listesinden süzülür ---- */
  const meetings = useMemo(() => {
    const list = homeMatchesQuery.data ?? [];
    const involves = (item: ApiMatch) => {
      const first = Number(item.home_team_id);
      const second = Number(item.away_team_id);
      if (homeId && awayId && first && second) {
        return (first === homeId && second === awayId) || (first === awayId && second === homeId);
      }
      const firstName = normalizeName(item.first_team_name);
      const secondName = normalizeName(item.second_team_name);
      return (
        (firstName === homeLower && secondName === awayLower) ||
        (firstName === awayLower && secondName === homeLower)
      );
    };

    return list
      .filter((item) => matchState(item) === "finished" && involves(item))
      .sort((a, b) => kickoffAt(b) - kickoffAt(a));
  }, [awayId, awayLower, homeId, homeLower, homeMatchesQuery.data]);

  /* ---- Galibiyet ve gol dağılımı (ev sahibi gözünden) ---- */
  const tally = useMemo(() => {
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let homeGoals = 0;
    let awayGoals = 0;

    for (const item of meetings) {
      const first = item.first_team_score;
      const second = item.second_team_score;
      if (first == null || second == null) continue;
      const homeIsFirst = sideIsFirst(item, homeId, homeLower);
      const ours = homeIsFirst ? first : second;
      const theirs = homeIsFirst ? second : first;
      homeGoals += ours;
      awayGoals += theirs;
      if (ours > theirs) homeWins += 1;
      else if (ours < theirs) awayWins += 1;
      else draws += 1;
    }

    return { homeWins, draws, awayWins, homeGoals, awayGoals };
  }, [homeId, homeLower, meetings]);

  const homeForm = useMemo(
    () => formString(homeMatchesQuery.data, homeId, homeLower),
    [homeId, homeLower, homeMatchesQuery.data],
  );
  const awayForm = useMemo(
    () => formString(awayMatchesQuery.data, awayId, awayLower),
    [awayId, awayLower, awayMatchesQuery.data],
  );

  /* ---- Puan tablosu satırları: sıra, puan, amblem ---- */
  const rows = standingsQuery.data ?? [];
  const homeStanding = useMemo(() => findRow(rows, homeId, homeLower), [homeId, homeLower, rows]);
  const awayStanding = useMemo(() => findRow(rows, awayId, awayLower), [awayId, awayLower, rows]);

  const refresh = useRefresh(
    useCallback(async () => {
      await Promise.all([
        homeMatchesQuery.refetch(),
        awayMatchesQuery.refetch(),
        standingsQuery.refetch(),
      ]);
    }, [awayMatchesQuery, homeMatchesQuery, standingsQuery]),
    { refreshing: homeMatchesQuery.isRefetching || awayMatchesQuery.isRefetching },
  );

  /* ---- Geri çağrılar: satırlar memo'lu, kimlikleri sabit kalmalı ---- */
  const openMatch = useCallback((matchId: number) => router.push(`/mac/${matchId}`), [router]);
  const openHome = useCallback(() => {
    if (homeId) router.push(`/takim/${homeId}`);
  }, [homeId, router]);
  const openAway = useCallback(() => {
    if (awayId) router.push(`/takim/${awayId}`);
  }, [awayId, router]);
  const openShare = useCallback(() => setShareOpen(true), []);
  const closeShare = useCallback(() => setShareOpen(false), []);
  const shareFailed = useCallback(
    () => toast.show({ message: "Paylaşım açılamadı.", tone: "danger", icon: "alert-circle" }),
    [toast],
  );

  const renderItem = useCallback(
    ({ item }: { item: ApiMatch }) => (
      <MeetingRow meeting={item} result={resultFor(item, homeId, homeLower)} onOpen={openMatch} />
    ),
    [homeId, homeLower, openMatch],
  );

  const loading =
    (homeMatchesQuery.isLoading || awayMatchesQuery.isLoading) && meetings.length === 0;
  const failed = homeMatchesQuery.isError && !homeMatchesQuery.data;

  const header = (
    <ScreenHeader
      title="H2H"
      overline="KARŞILAŞTIRMA"
      subtitle={hasTargets ? `${homeName} – ${awayName}` : undefined}
      scrollY={scrollY}
      back
      actions={
        hasTargets
          ? [
              {
                icon: "share-social-outline",
                onPress: openShare,
                accessibilityLabel: "Karşılaştırmayı paylaş",
              },
            ]
          : undefined
      }
    />
  );

  if (!hasTargets) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="git-compare-outline"
          title="Karşılaştırma bilgisi eksik"
          body="Bu ekran iki takımla açılır. Takım sayfasındaki “H2H karşılaştır” düğmesini kullan."
          action={{ label: "Geri dön", onPress: () => router.back() }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      {loading ? (
        <View style={styles.loading}>
          <SkeletonCard lines={3} />
          <SkeletonListRow count={6} avatar={false} />
        </View>
      ) : failed ? (
        <ErrorState error={homeMatchesQuery.error} onRetry={homeMatchesQuery.refetch} />
      ) : (
        <FlatList
          {...scrollProps}
          data={meetings}
          renderItem={renderItem}
          keyExtractor={matchKey}
          refreshControl={refresh.control}
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          windowSize={9}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {/* ————— İki takım ————— */}
              <View style={styles.versus}>
                <TeamColumn
                  name={homeName}
                  logo={homeStanding?.logo ?? null}
                  rank={rankOf(rows, homeStanding)}
                  points={homeStanding?.display_points ?? null}
                  form={homeForm}
                  onPress={homeId ? openHome : undefined}
                />

                <View style={styles.versusMiddle}>
                  <Text style={styles.versusCount} {...textScale.dense}>
                    {meetings.length}
                  </Text>
                  <Text style={styles.overline} {...textScale.badge}>
                    KARŞILAŞMA
                  </Text>
                </View>

                <TeamColumn
                  name={awayName}
                  logo={awayStanding?.logo ?? null}
                  rank={rankOf(rows, awayStanding)}
                  points={awayStanding?.display_points ?? null}
                  form={awayForm}
                  onPress={awayId ? openAway : undefined}
                  align="right"
                />
              </View>

              {meetings.length > 0 ? (
                <>
                  {/* ————— Galibiyet dağılımı ————— */}
                  <View style={styles.tally}>
                    <TallyCell value={tally.homeWins} label="GALİBİYET" color={colors.win} />
                    <TallyCell
                      value={tally.draws}
                      label="BERABERLİK"
                      color={colors.textSecondary}
                    />
                    <TallyCell value={tally.awayWins} label="GALİBİYET" color={colors.live} />
                  </View>

                  {/* ————— Karşılaştırma çubukları ————— */}
                  <View style={styles.barsCard}>
                    <StatBar label="Galibiyet" home={tally.homeWins} away={tally.awayWins} />
                    <StatBar label="Atılan gol" home={tally.homeGoals} away={tally.awayGoals} />
                  </View>

                  <SectionHeader
                    title="Geçmiş karşılaşmalar"
                    meta={`rozetler ${homeName} gözünden`}
                  />
                </>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="git-compare-outline"
              variant="inline"
              title="Karşılaşma yok"
              body="Bu iki takım daha önce tamamlanmış bir maçta karşılaşmamış. Form karşılaştırması yukarıda."
            />
          }
        />
      )}

      <ShareSheet
        visible={shareOpen}
        onClose={closeShare}
        homeName={homeName}
        awayName={awayName}
        homeLogo={homeStanding?.logo ?? null}
        awayLogo={awayStanding?.logo ?? null}
        homeRank={rankOf(rows, homeStanding)}
        awayRank={rankOf(rows, awayStanding)}
        homeForm={homeForm}
        awayForm={awayForm}
        tally={tally}
        meetings={meetings.length}
        onError={shareFailed}
      />
    </SafeAreaView>
  );
}

/** Puan tablosunda takımın satırı — kimlik yoksa ada göre bulunur. */
function findRow(rows: StandingRow[], teamId: number | null, nameLower: string): StandingRow | null {
  if (teamId) {
    const byId = rows.find((row) => Number(row.team_id) === teamId);
    if (byId) return byId;
  }
  if (!nameLower) return null;
  return rows.find((row) => normalizeName(row.team_name) === nameLower) ?? null;
}

/** Satırın tablodaki sırası (1 tabanlı); satır yoksa null. */
function rankOf(rows: StandingRow[], row: StandingRow | null): number | null {
  if (!row) return null;
  const index = rows.indexOf(row);
  return index >= 0 ? index + 1 : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Parçalar
   ══════════════════════════════════════════════════════════════════════════ */

const TeamColumn = memo(function TeamColumn({
  name,
  logo,
  rank,
  points,
  form,
  onPress,
  align = "left",
}: {
  name: string;
  logo: string | null;
  rank: number | null;
  points: number | null;
  form: string;
  onPress?: () => void;
  align?: "left" | "right";
}) {
  const body = (
    <>
      <TeamLogo name={name} logo={logo} size={layout.crestXl} />
      <Text style={styles.teamName} numberOfLines={2} {...textScale.dense}>
        {upperTR(name)}
      </Text>
      {rank != null ? (
        <View style={styles.teamMeta}>
          <Badge label={`${rank}. sıra`} tone="brand" size="xs" />
          {points != null ? <Badge label={`${points} puan`} tone="neutral" size="xs" /> : null}
        </View>
      ) : null}
      <FormChips form={form} size="xs" />
    </>
  );

  if (!onPress) {
    return <View style={[styles.teamColumn, align === "right" && styles.teamColumnRight]}>{body}</View>;
  }

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} takım sayfası`}
      style={[styles.teamColumn, align === "right" && styles.teamColumnRight]}
    >
      {body}
    </Touchable>
  );
});

const TallyCell = memo(function TallyCell({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.tallyCell}>
      <Text style={[styles.tallyValue, { color }]} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.overline} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

const MeetingRow = memo(function MeetingRow({
  meeting,
  result,
  onOpen,
}: {
  meeting: ApiMatch;
  result: "G" | "B" | "M";
  onOpen: (matchId: number) => void;
}) {
  const open = useCallback(() => onOpen(Number(meeting.id)), [meeting.id, onOpen]);

  const first = meeting.first_team_score ?? null;
  const second = meeting.second_team_score ?? null;

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      style={styles.meetRow}
      accessibilityRole="button"
      accessibilityLabel={`${meeting.first_team_name} ${first ?? "-"} ${second ?? "-"} ${meeting.second_team_name}`}
    >
      <Text style={styles.meetDate} {...textScale.dense}>
        {formatDateShort(meeting.date)}
      </Text>

      <View
        style={[
          styles.meetChip,
          result === "G"
            ? styles.meetChipWin
            : result === "M"
              ? styles.meetChipLoss
              : styles.meetChipDraw,
        ]}
      >
        <Text style={styles.meetChipText} {...textScale.badge}>
          {result}
        </Text>
      </View>

      <Text style={styles.meetTeams} numberOfLines={1} {...textScale.dense}>
        {meeting.first_team_name} – {meeting.second_team_name}
      </Text>

      <Text style={styles.meetScore} {...textScale.dense}>
        {first ?? "-"}–{second ?? "-"}
      </Text>
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   PAYLAŞIM KARTI — iki boyda, tema renkleriyle
   ══════════════════════════════════════════════════════════════════════════ */

type ShareFormat = "story" | "post";

const SHARE_WIDTH = 264;
const SHARE_FORMATS: Record<ShareFormat, { label: string; height: number }> = {
  story: { label: "Hikâye 9:16", height: Math.round((SHARE_WIDTH * 16) / 9) },
  post: { label: "Gönderi 3:4", height: Math.round((SHARE_WIDTH * 4) / 3) },
};

const SHARE_ITEMS: SegmentedItem<ShareFormat>[] = [
  { key: "story", label: SHARE_FORMATS.story.label },
  { key: "post", label: SHARE_FORMATS.post.label },
];

function ShareSheet({
  visible,
  onClose,
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  homeRank,
  awayRank,
  homeForm,
  awayForm,
  tally,
  meetings,
  onError,
}: {
  visible: boolean;
  onClose: () => void;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeRank: number | null;
  awayRank: number | null;
  homeForm: string;
  awayForm: string;
  tally: { homeWins: number; draws: number; awayWins: number; homeGoals: number; awayGoals: number };
  meetings: number;
  onError: () => void;
}) {
  const [format, setFormat] = useState<ShareFormat>("story");
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      } else {
        onError();
      }
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  }, [busy, onError]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Karşılaştırmayı paylaş" snap="full">
      <SegmentedControl items={SHARE_ITEMS} value={format} onChange={setFormat} />

      <View style={styles.shareCardWrap}>
        <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
          <View style={[styles.shareCard, { height: SHARE_FORMATS[format].height }]}>
            <LinearGradient colors={[colors.brand, colors.brandStrong]} style={styles.shareStrip} />

            <View style={styles.shareBody}>
              <View style={styles.shareTop}>
                <Text style={styles.shareBrand} {...textScale.badge}>
                  elitlig
                </Text>
                <Text style={styles.shareKicker} {...textScale.badge}>
                  {upperTR("H2H karşılaştırma")}
                </Text>
              </View>

              <View style={styles.shareTeams}>
                <View style={styles.shareTeam}>
                  <TeamLogo name={homeName} logo={homeLogo} size={40} />
                  <Text style={styles.shareTeamName} numberOfLines={2} {...textScale.badge}>
                    {upperTR(homeName)}
                  </Text>
                  {homeRank != null ? (
                    <Text style={styles.shareTeamRank} {...textScale.badge}>
                      {homeRank}. sıra
                    </Text>
                  ) : null}
                </View>

                <View style={styles.shareVersus}>
                  <Text style={styles.shareVersusText} {...textScale.badge}>
                    VS
                  </Text>
                  <Text style={styles.shareVersusMeta} {...textScale.badge}>
                    {meetings} maç
                  </Text>
                </View>

                <View style={[styles.shareTeam, styles.shareTeamRight]}>
                  <TeamLogo name={awayName} logo={awayLogo} size={40} />
                  <Text
                    style={[styles.shareTeamName, styles.shareTextRight]}
                    numberOfLines={2}
                    {...textScale.badge}
                  >
                    {upperTR(awayName)}
                  </Text>
                  {awayRank != null ? (
                    <Text
                      style={[styles.shareTeamRank, styles.shareTextRight]}
                      {...textScale.badge}
                    >
                      {awayRank}. sıra
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.shareTally}>
                <ShareStat label="GALİBİYET" value={tally.homeWins} tone={colors.win} />
                <ShareStat label="BERABERLİK" value={tally.draws} tone={colors.textSecondary} />
                <ShareStat label="GALİBİYET" value={tally.awayWins} tone={colors.live} />
              </View>

              <View style={styles.shareGoals}>
                <ShareStat label="ATILAN GOL" value={tally.homeGoals} />
                <ShareStat label="ATILAN GOL" value={tally.awayGoals} />
              </View>

              <View style={styles.shareForm}>
                <FormChips form={homeForm} size="xs" />
                <Text style={styles.shareFormLabel} {...textScale.badge}>
                  FORM
                </Text>
                <FormChips form={awayForm} size="xs" />
              </View>

              <View style={styles.shareSpacer} />

              <Text style={styles.shareFooter} {...textScale.badge}>
                ELİTLİG.COM
              </Text>
            </View>
          </View>
        </ViewShot>
      </View>

      <Button
        label={busy ? "Hazırlanıyor" : "Paylaş"}
        icon="share-social"
        onPress={share}
        loading={busy}
        fullWidth
      />
      <Text style={styles.shareHint} {...textScale.dense}>
        İndirmek için: Paylaş → Görüntüyü Kaydet
      </Text>
    </BottomSheet>
  );
}

const ShareStat = memo(function ShareStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <View style={styles.shareStat}>
      <Text style={[styles.shareStatValue, tone ? { color: tone } : null]} {...textScale.badge}>
        {value}
      </Text>
      <Text style={styles.shareStatLabel} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
  },
  headerBlock: {
    gap: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  overline: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* — İki takım — */
  versus: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.md,
  },
  teamColumn: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xs,
  },
  teamColumnRight: {
    alignItems: "center",
  },
  teamName: {
    ...type.label,
    color: colors.textPrimary,
    textAlign: "center",
  },
  teamMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space.xs,
  },
  versusMiddle: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
    paddingTop: space.lg,
    gap: space.xxs,
  },
  versusCount: {
    ...type.scoreLg,
    color: colors.textPrimary,
  },

  /* — Galibiyet dağılımı — */
  tally: {
    flexDirection: "row",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  tallyCell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
    paddingVertical: space.md,
  },
  tallyValue: {
    ...type.scoreLg,
  },

  /* — Karşılaştırma çubukları — */
  barsCard: {
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
  },

  /* — Karşılaşma satırı — */
  meetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface1,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  meetDate: {
    ...type.caption,
    color: colors.textTertiary,
    width: 52,
  },
  meetChip: {
    width: 18,
    height: 18,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  meetChipWin: {
    backgroundColor: colors.win,
  },
  meetChipDraw: {
    backgroundColor: colors.draw,
  },
  meetChipLoss: {
    backgroundColor: colors.loss,
  },
  meetChipText: {
    ...type.micro,
    color: colors.textOnBrand,
  },
  meetTeams: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
  meetScore: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },

  /* — Paylaşım kartı — */
  shareCardWrap: {
    alignItems: "center",
    paddingVertical: space.md,
  },
  shareCard: {
    width: SHARE_WIDTH,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  shareStrip: {
    height: 6,
  },
  shareBody: {
    flex: 1,
    padding: space.md,
    gap: space.sm,
  },
  shareTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareBrand: {
    ...type.label,
    color: colors.brand,
  },
  shareKicker: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareTeams: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  shareTeam: {
    flex: 1,
    gap: space.xxs,
  },
  shareTeamRight: {
    alignItems: "flex-end",
  },
  shareTeamName: {
    ...type.caption,
    color: colors.textPrimary,
  },
  shareTeamRank: {
    ...type.micro,
    color: colors.brand,
  },
  shareTextRight: {
    textAlign: "right",
  },
  shareVersus: {
    alignItems: "center",
    gap: space.xxs,
    paddingTop: space.sm,
  },
  shareVersusText: {
    ...type.h2,
    color: colors.textSecondary,
  },
  shareVersusMeta: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareTally: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingVertical: space.sm,
  },
  shareGoals: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingVertical: space.sm,
  },
  shareStat: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  shareStatValue: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  shareStatLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareForm: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  shareFormLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  shareSpacer: {
    flex: 1,
  },
  shareFooter: {
    ...type.micro,
    color: colors.textTertiary,
    textAlign: "center",
  },
  shareHint: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.sm,
  },
});
