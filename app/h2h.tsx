import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";
import {
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  FormChips,
  ScreenHeader,
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
import { colors, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";
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
 *
 * ARENA DÜZENİ:
 *   · SAHNE: iki takımın kimliği (arma, ad, sıra · puan) ve aradaki skor
 *     cümlesi — "3 G · 1 B · 2 G" — grafit sahnede, ekranın tepesinde bir kez.
 *     Kaydırınca kapanır, başlıkta "A – B" kalır.
 *   · DAĞILIM ÇUBUĞU: galibiyet/beraberlik/galibiyet oranı tek yatay çubukta;
 *     ev sahibi zümrüt (veri), rakip kayrak, beraberlik nötr ray rengi
 *     (StatBar'ın taraf dili ile aynı).
 *   · KARŞILAŞTIRMA: galibiyet, atılan gol, maç başı gol çubukları tek kartta.
 *   · FORM: iki satır — arma + ad + son beş maç.
 *   · GEÇMİŞ: tarih · ev – deplasman skoru tek kartta; sonuç çipi ev sahibi
 *     gözünden.
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
  /** Menüden parametresiz açılınca iki takım bu seçiciyle seçilir. */
  const [picking, setPicking] = useState<"home" | "away" | null>(null);
  const [draftHome, setDraftHome] = useState<StandingRow | null>(null);

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
    ({ item, index }: { item: ApiMatch; index: number }) => (
      <MeetingRow
        meeting={item}
        result={resultFor(item, homeId, homeLower)}
        first={index === 0}
        last={index === meetings.length - 1}
        onOpen={openMatch}
      />
    ),
    [homeId, homeLower, meetings.length, openMatch],
  );

  const loading =
    (homeMatchesQuery.isLoading || awayMatchesQuery.isLoading) && meetings.length === 0;
  const failed = homeMatchesQuery.isError && !homeMatchesQuery.data;

  const homeRank = rankOf(rows, homeStanding);
  const awayRank = rankOf(rows, awayStanding);

  const hero = hasTargets ? (
    <View style={styles.hero}>
      <HeroTeam
        name={homeName}
        logo={homeStanding?.logo ?? null}
        rank={homeRank}
        points={homeStanding?.display_points ?? null}
        onPress={homeId ? openHome : undefined}
      />
      <View style={styles.heroMiddle}>
        {meetings.length > 0 ? (
          <Text style={styles.heroScore} {...textScale.dense}>
            {tally.homeWins}
            <Text style={styles.heroScoreDim}>{"  –  "}</Text>
            {tally.awayWins}
          </Text>
        ) : (
          <Text style={[styles.heroScore, styles.heroVs]} {...textScale.dense}>
            VS
          </Text>
        )}
        <Text style={styles.heroCaption} {...textScale.badge}>
          {meetings.length > 0
            ? upperTR(`${meetings.length} maç · ${tally.draws} beraberlik`)
            : upperTR("Karşılaşma yok")}
        </Text>
      </View>
      <HeroTeam
        name={awayName}
        logo={awayStanding?.logo ?? null}
        rank={awayRank}
        points={awayStanding?.display_points ?? null}
        onPress={awayId ? openAway : undefined}
      />
    </View>
  ) : undefined;

  const header = (
    <ScreenHeader
      title={hasTargets ? `${homeName} – ${awayName}` : "Karşılaştırma"}
      overline={hasTargets ? undefined : "KARŞILAŞTIRMA"}
      scrollY={scrollY}
      back
      variant={hasTargets ? "stage" : undefined}
      hero={hero}
      actions={
        hasTargets
          ? [
              {
                icon: "share-outline",
                onPress: openShare,
                accessibilityLabel: "Karşılaştırmayı paylaş",
              },
            ]
          : undefined
      }
    />
  );

  if (!hasTargets) {
    /* Menüdeki "Takım karşılaştır" ekranı parametresiz açar: iki takım
       seçili kapsamın puan tablosundan seçilir, sonra rota parametreleri
       yazılır ve ekran normal akışına döner. */
    const pickTeam = (row: StandingRow) => {
      if (picking === "home") {
        setDraftHome(row);
        setPicking("away");
        return;
      }
      const home = draftHome;
      setPicking(null);
      setDraftHome(null);
      if (!home) return;
      router.setParams({
        homeId: String(home.team_id),
        homeName: home.team_name,
        awayId: String(row.team_id),
        awayName: row.team_name,
      });
    };
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="git-compare-outline"
          title="İki takımı yan yana koy"
          body={
            scope.ready
              ? "Seçili ligin puan tablosundan iki takım seç; aralarındaki maçlar, form ve sıralama karşılaştırılır."
              : "Takım seçmek için önce bir lig seç."
          }
          action={
            scope.ready
              ? { label: "Takımları seç", onPress: () => setPicking("home") }
              : { label: "Geri dön", onPress: () => router.back() }
          }
        />
        <TeamPicker
          visible={picking !== null}
          title={picking === "away" ? "İkinci takımı seç" : "Birinci takımı seç"}
          rows={rows}
          loading={standingsQuery.isLoading}
          error={standingsQuery.isError && !standingsQuery.data ? standingsQuery.error : null}
          onRetry={standingsQuery.refetch}
          excludeId={picking === "away" ? draftHome?.team_id ?? null : null}
          onPick={pickTeam}
          onClose={() => {
            setPicking(null);
            setDraftHome(null);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      {loading ? (
        <View style={styles.loading}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={2} />
          <SkeletonListRow count={5} avatar={false} />
        </View>
      ) : failed ? (
        <ErrorState error={homeMatchesQuery.error} onRetry={homeMatchesQuery.refetch} />
      ) : (
        <FlatList
          {...scrollProps}
          data={meetings}
          renderItem={renderItem}
          keyExtractor={matchKey}
          ItemSeparatorComponent={MeetingSeparator}
          refreshControl={refresh.control}
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          windowSize={9}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {meetings.length > 0 ? (
                <View style={[styles.card, styles.cardPad]}>
                  <Text style={styles.cardTitle} {...textScale.dense}>
                    Galibiyet dağılımı
                  </Text>
                  <SplitBar home={tally.homeWins} draws={tally.draws} away={tally.awayWins} />
                  <View style={styles.splitLegend}>
                    <SplitLabel value={tally.homeWins} label={homeName} tone="home" />
                    <SplitLabel value={tally.draws} label="Beraberlik" tone="draw" />
                    <SplitLabel value={tally.awayWins} label={awayName} tone="away" align="right" />
                  </View>
                  <View style={styles.cardDivider} />
                  <View style={styles.bars}>
                    <StatBar label="Atılan gol" home={tally.homeGoals} away={tally.awayGoals} />
                    <StatBar
                      label="Maç başı gol"
                      home={Math.round((tally.homeGoals / meetings.length) * 10) / 10}
                      away={Math.round((tally.awayGoals / meetings.length) * 10) / 10}
                    />
                  </View>
                </View>
              ) : null}

              {/* ————— Form ————— */}
              {homeForm || awayForm ? (
                <View style={styles.card}>
                  <Text style={[styles.cardTitle, styles.cardTitlePad]} {...textScale.dense}>
                    Son 5 maç
                  </Text>
                  <FormLine name={homeName} logo={homeStanding?.logo ?? null} form={homeForm} />
                  <View style={styles.formDivider} />
                  <FormLine name={awayName} logo={awayStanding?.logo ?? null} form={awayForm} />
                </View>
              ) : null}

              {meetings.length > 0 ? (
                <View style={styles.listLabel}>
                  <Text style={styles.overline} {...textScale.badge}>
                    {upperTR("Geçmiş karşılaşmalar")}
                  </Text>
                  <Text style={styles.listLabelMeta} numberOfLines={1} {...textScale.dense}>
                    sonuç {homeName} gözünden
                  </Text>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="git-compare-outline"
              variant="inline"
              title="Henüz karşılaşmadılar"
              body="Bu iki takım tamamlanmış bir maçta karşılaşmamış. Form ve sıralama yukarıda."
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
        homeRank={homeRank}
        awayRank={awayRank}
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

/** Puan tablosundan takım seçici — menüden parametresiz açılışta kullanılır. */
function TeamPicker({
  visible,
  title,
  rows,
  loading,
  error,
  onRetry,
  excludeId,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  rows: StandingRow[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  excludeId: number | null;
  onPick: (row: StandingRow) => void;
  onClose: () => void;
}) {
  const list = useMemo(
    () => rows.filter((row) => Number(row.team_id) !== excludeId),
    [excludeId, rows],
  );
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} snap="full" scrollable={false}>
      {loading ? (
        <SkeletonCard lines={5} />
      ) : error ? (
        <ErrorState variant="inline" error={error} onRetry={onRetry} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(row) => String(row.team_id)}
          style={styles.pickerList}
          renderItem={({ item }) => (
            <Touchable
              feedback="row"
              haptic="selection"
              onPress={() => onPick(item)}
              style={styles.pickerRow}
              accessibilityRole="button"
              accessibilityLabel={item.team_name}
            >
              <TeamLogo name={item.team_name} logo={item.logo} size={layout.crestLg} />
              <View style={styles.pickerRowBody}>
                <Text style={styles.pickerName} numberOfLines={1} {...textScale.dense}>
                  {item.team_name}
                </Text>
                <Text style={styles.pickerMeta} numberOfLines={1} {...textScale.dense}>
                  {`${rows.indexOf(item) + 1}. sıra · ${item.display_points} puan`}
                </Text>
              </View>
            </Touchable>
          )}
          ListEmptyComponent={
            <EmptyState
              variant="inline"
              compact
              icon="shield-outline"
              title="Takım bulunamadı"
              body="Seçili ligin puan tablosu boş."
            />
          }
        />
      )}
    </BottomSheet>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Parçalar
   ══════════════════════════════════════════════════════════════════════════ */

/** Sahnedeki takım sütunu: arma, ad, sıra · puan. */
const HeroTeam = memo(function HeroTeam({
  name,
  logo,
  rank,
  points,
  onPress,
}: {
  name: string;
  logo: string | null;
  rank: number | null;
  points: number | null;
  onPress?: () => void;
}) {
  const body = (
    <>
      <TeamLogo name={name} logo={logo} size={layout.crestXl} onDark />
      <Text style={styles.heroName} numberOfLines={2} {...textScale.dense}>
        {name}
      </Text>
      {rank != null ? (
        <Text style={styles.heroMeta} numberOfLines={1} {...textScale.dense}>
          {rank}. sıra{points != null ? ` · ${points} P` : ""}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.heroTeam}>{body}</View>;
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} takım sayfası`}
      style={styles.heroTeam}
    >
      {body}
    </Touchable>
  );
});

/** Galibiyet · beraberlik · galibiyet oranı — tek yatay çubuk. */
const SplitBar = memo(function SplitBar({ home, draws, away }: { home: number; draws: number; away: number }) {
  const total = home + draws + away || 1;
  return (
    <View style={styles.split} accessibilityLabel={`${home} galibiyet, ${draws} beraberlik, ${away} mağlubiyet`}>
      {home > 0 ? <View style={[styles.splitPart, styles.splitHome, { flex: home / total }]} /> : null}
      {draws > 0 ? <View style={[styles.splitPart, styles.splitDraw, { flex: draws / total }]} /> : null}
      {away > 0 ? <View style={[styles.splitPart, styles.splitAway, { flex: away / total }]} /> : null}
    </View>
  );
});

const SplitLabel = memo(function SplitLabel({
  value,
  label,
  tone,
  align = "left",
}: {
  value: number;
  label: string;
  tone: "home" | "draw" | "away";
  align?: "left" | "right";
}) {
  return (
    <View style={[styles.splitLabel, align === "right" && styles.splitLabelRight]}>
      <Text
        style={[
          styles.splitValue,
          tone === "home" ? styles.splitValueHome : tone === "draw" ? styles.splitValueDraw : null,
        ]}
        {...textScale.dense}
      >
        {value}
      </Text>
      <Text style={[styles.splitName, align === "right" && styles.textRight]} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
    </View>
  );
});

const FormLine = memo(function FormLine({
  name,
  logo,
  form,
}: {
  name: string;
  logo: string | null;
  form: string;
}) {
  return (
    <View style={styles.formLine}>
      <TeamLogo name={name} logo={logo} size={layout.crestSm} />
      <Text style={styles.formName} numberOfLines={1} {...textScale.dense}>
        {name}
      </Text>
      {form ? (
        <FormChips form={form} size="sm" />
      ) : (
        <Text style={styles.formEmpty} {...textScale.dense}>
          maç yok
        </Text>
      )}
    </View>
  );
});

const MeetingSeparator = () => <View style={styles.meetSeparator} />;

const MeetingRow = memo(function MeetingRow({
  meeting,
  result,
  first,
  last,
  onOpen,
}: {
  meeting: ApiMatch;
  result: "G" | "B" | "M";
  first: boolean;
  last: boolean;
  onOpen: (matchId: number) => void;
}) {
  const open = useCallback(() => onOpen(Number(meeting.id)), [meeting.id, onOpen]);

  const homeScore = meeting.first_team_score ?? null;
  const awayScore = meeting.second_team_score ?? null;
  const homeWon = homeScore != null && awayScore != null && homeScore > awayScore;
  const awayWon = homeScore != null && awayScore != null && awayScore > homeScore;

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      style={[styles.meetRow, first && styles.meetRowFirst, last && styles.meetRowLast]}
      accessibilityRole="button"
      accessibilityLabel={`${meeting.first_team_name} ${homeScore ?? "-"} ${awayScore ?? "-"} ${meeting.second_team_name}`}
    >
      <Text style={styles.meetDate} {...textScale.dense}>
        {formatDateShort(meeting.date)}
      </Text>

      <Text
        style={[styles.meetTeam, styles.textRight, homeWon && styles.meetTeamWon]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {meeting.first_team_name}
      </Text>
      <View style={styles.meetScoreBox}>
        <Text style={styles.meetScore} {...textScale.dense}>
          {homeScore ?? "-"}–{awayScore ?? "-"}
        </Text>
      </View>
      <Text style={[styles.meetTeam, awayWon && styles.meetTeamWon]} numberOfLines={1} {...textScale.dense}>
        {meeting.second_team_name}
      </Text>

      <View
        style={[
          styles.meetChip,
          result === "G" ? styles.meetChipWin : result === "M" ? styles.meetChipLoss : styles.meetChipDraw,
        ]}
      >
        <Text style={styles.meetChipText} {...textScale.badge}>
          {result}
        </Text>
      </View>
    </Touchable>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   PAYLAŞIM KARTI — iki boyda, tema renkleriyle
   ══════════════════════════════════════════════════════════════════════════ */

type ShareFormat = "story" | "post";

const SHARE_WIDTH = 264;
/** Sahne gradyanının ekseni — yatay, sağdan sola (Arena kuralı). */
const INK_START = { x: 1, y: 0.5 };
const INK_END = { x: 0, y: 0.5 };
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
            {/* SAHNE: paylaşım kartı kimlik anıdır — grafit, sağdan sola ışık. */}
            <LinearGradient
              colors={colors.gradientInk}
              start={INK_START}
              end={INK_END}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

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
                  <TeamLogo name={homeName} logo={homeLogo} size={40} onDark />
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
                  <TeamLogo name={awayName} logo={awayLogo} size={40} onDark />
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
                <ShareStat label="GALİBİYET" value={tally.homeWins} tone={colors.brandOnDark} />
                <ShareStat label="BERABERLİK" value={tally.draws} />
                <ShareStat label="GALİBİYET" value={tally.awayWins} tone={colors.brandOnDark} />
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
  pickerList: {
    flex: 1,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 52,
    paddingVertical: space.s,
  },
  pickerRowBody: {
    flex: 1,
    minWidth: 0,
  },
  pickerName: {
    ...type.label,
    color: colors.textPrimary,
  },
  pickerMeta: {
    ...type.caption,
    color: colors.textTertiary,
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
    ...type.overline,
    color: colors.textTertiary,
  },
  textRight: {
    textAlign: "right",
  },

  /* — Sahne kimliği — */
  hero: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
  heroTeam: {
    flex: 1,
    alignItems: "center",
    gap: space.s,
  },
  heroName: {
    ...type.h4,
    color: colors.onDark,
    textAlign: "center",
  },
  heroMeta: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
  heroMiddle: {
    alignItems: "center",
    paddingTop: space.md,
    gap: space.xs,
    minWidth: 104,
  },
  heroScore: {
    ...type.scoreHero,
    color: colors.onDark,
  },
  heroVs: {
    color: colors.onDarkMuted,
  },
  heroScoreDim: {
    ...type.scoreMd,
    color: colors.onDarkMuted,
  },
  heroCaption: {
    ...type.overline,
    color: colors.brandOnDark,
    textAlign: "center",
  },

  /* — Kartlar — */
  card: {
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.xl,
  },
  cardPad: {
    padding: space.lg,
    gap: space.md,
  },
  cardTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  cardTitlePad: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  cardDivider: {
    height: hairline,
    backgroundColor: colors.separator,
  },
  bars: {
    gap: space.md,
  },

  /* — Dağılım çubuğu — */
  split: {
    flexDirection: "row",
    height: 10,
    gap: 3,
  },
  splitPart: {
    borderRadius: 3,
  },
  splitHome: { backgroundColor: colors.accent },
  splitDraw: { backgroundColor: colors.slateSoft },
  splitAway: { backgroundColor: colors.slate },
  splitLegend: {
    flexDirection: "row",
    gap: space.sm,
  },
  splitLabel: {
    flex: 1,
    minWidth: 0,
  },
  splitLabelRight: {
    alignItems: "flex-end",
  },
  splitValue: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  splitValueHome: {
    color: colors.accentText,
  },
  splitValueDraw: {
    color: colors.textSecondary,
  },
  splitName: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Form — */
  formLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  formName: {
    ...type.label,
    color: colors.textPrimary,
    flex: 1,
  },
  formEmpty: {
    ...type.caption,
    color: colors.textTertiary,
  },
  formDivider: {
    height: hairline,
    marginLeft: space.lg,
    backgroundColor: colors.separator,
  },

  /* — Geçmiş — */
  listLabel: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
    paddingHorizontal: space.xxs,
    paddingTop: space.sm,
  },
  listLabelMeta: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  meetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface1,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
  },
  meetRowFirst: {
    borderTopWidth: hairline,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  meetRowLast: {
    borderBottomWidth: hairline,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  meetSeparator: {
    height: hairline,
    backgroundColor: colors.separator,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
  },
  meetDate: {
    ...type.caption,
    color: colors.textTertiary,
    width: 50,
  },
  meetTeam: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  meetTeamWon: {
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  meetScoreBox: {
    minWidth: 44,
    paddingHorizontal: space.s,
    paddingVertical: space.xxs,
    borderRadius: radius.xs,
    backgroundColor: colors.surface3,
    alignItems: "center",
  },
  meetScore: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  meetChip: {
    width: 20,
    height: 20,
    borderRadius: radius.xs,
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
    color: colors.textOnStatus,
  },

  /* — Paylaşım kartı — */
  shareCardWrap: {
    alignItems: "center",
    paddingVertical: space.md,
  },
  shareCard: {
    width: SHARE_WIDTH,
    backgroundColor: colors.inkBlock,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  shareBody: {
    flex: 1,
    padding: space.lg,
    gap: space.md,
  },
  shareTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareBrand: {
    ...type.h4,
    color: colors.onDark,
  },
  shareKicker: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  shareTeams: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    marginTop: space.sm,
  },
  shareTeam: {
    flex: 1,
    gap: space.xs,
  },
  shareTeamRight: {
    alignItems: "flex-end",
  },
  shareTeamName: {
    ...type.label,
    color: colors.onDark,
  },
  shareTeamRank: {
    ...type.caption,
    color: colors.onDarkMuted,
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
    ...type.scoreSm,
    color: colors.onDarkMuted,
  },
  shareVersusMeta: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  shareTally: {
    flexDirection: "row",
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    borderRadius: radius.md,
    paddingVertical: space.md,
  },
  shareGoals: {
    flexDirection: "row",
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    borderRadius: radius.md,
    paddingVertical: space.md,
  },
  shareStat: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  shareStatValue: {
    ...type.scoreMd,
    color: colors.onDark,
  },
  shareStatLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  shareForm: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  shareFormLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  shareSpacer: {
    flex: 1,
  },
  shareFooter: {
    ...type.overline,
    color: colors.onDarkMuted,
    textAlign: "center",
  },
  shareHint: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.sm,
  },
});
