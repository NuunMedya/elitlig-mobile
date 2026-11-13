/**
 * ARA — takım ve oyuncu araması (modal).
 *
 * NEDEN BU DOSYA VAR: `app/_layout.tsx` yığında `ara` ekranını tanımlıyor,
 * Maçlar/Lig başlığındaki büyüteç ve Favoriler sekmesindeki "Takım ekle"
 * düğmesi buraya gidiyor.
 *
 * NE YAPAR: tek arama kutusu, iki segment (Takımlar / Oyuncular). Takım listesi
 * uygulama genelindedir (favori takım başka şehirde olabilir), oyuncu listesi
 * seçili kapsamdan gelir — sunucu oyuncu sıralamasını kapsamsız veremiyor.
 * Satırdaki yıldız takımı doğrudan favoriye alır; "arayıp takip et" akışı tek
 * ekranda biter.
 *
 * ARENA DÜZENİ:
 *   · BOŞ EKRAN BOŞ DEĞİL. Yazmaya başlamadan önce Takımlar segmenti TAKİP
 *     ETTİĞİN takımları listeler (en sık aranan şey kullanıcının kendi
 *     takımıdır); Oyuncular segmenti aramanın hangi kapsamda yapılacağını
 *     söyler ve kapsamı değiştirme kapısı verir.
 *   · EŞLEŞEN PARÇA VURGULANIR: sonuç adında yazılan harfler marka renginde
 *     ve kalın. Kırk benzer takım adı arasında "neden bu sonuç geldi"
 *     sorusunu göz tek bakışta yanıtlar.
 *   · Sonuçlar tek kartta, üstte sayıyla ("12 takım").
 *
 * ARAMA TÜRKÇE KATLANIR: "İ/I/ı" ailesi ve şapkalı harfler normalleştirilir,
 * yoksa "Ünye" yazan kullanıcı "unye"yi bulamaz. Katlama harf sayısını
 * değiştirmediği için vurgu konumu katlanmış metinden asıl metne taşınabilir.
 *
 * DERİN BAĞLANTI: `/ara?tip=takim | oyuncu` (varsayılan "takim"), `q=` ön dolgu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Avatar,
  Badge,
  Chip,
  EmptyState,
  ErrorState,
  IconTile,
  Input,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  SkeletonListRow,
  TeamLogo,
  Touchable,
  useToast,
} from "@/components/ui";
import { GroupSeparator, groupRowStyle } from "@/components/league/shared";
import { getPlayerRankings } from "@/lib/api/players";
import { getTeams } from "@/lib/api/teams";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiTeam, PlayerRankRow } from "@/lib/types";
import { useFavorite, type FavoriteTeam } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, fonts, hairline, layout, radius, space, textScale, touchSlop, type, upperTR } from "@/theme";

type SearchKind = "takim" | "oyuncu";

const SEGMENTS = [
  { key: "takim" as const, label: "Takımlar" },
  { key: "oyuncu" as const, label: "Oyuncular" },
];

/** En az bu kadar harf yazılmadan liste açılmaz (tam liste ezber gibi görünür). */
const MIN_QUERY = 2;
const ROW_HEIGHT = 64;
/** Son aramalar — cihazda tutulur, en fazla sekiz. */
const RECENT_KEY = "elitlig.ara.recent.v1";
const RECENT_MAX = 8;

/**
 * Türkçe arama katlaması. `toLocaleLowerCase("tr-TR")` tek başına yetmez:
 * kullanıcı "Unye" yazıp "Ünye"yi bulmak ister. Aksanlar ayrıştırılıp atılır.
 *
 * KARAKTER KARAKTER katlanır ki çıktı girdiyle aynı uzunlukta kalsın — vurgu
 * konumu katlanmış metinde bulunup asıl metne uygulanır.
 */
function fold(value: string): string {
  let out = "";
  for (const char of value) {
    const folded = char
      .replace(/[İIı]/g, "i")
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    out += folded.length === 1 ? folded : char;
  }
  return out;
}

function resolveKind(raw: string | string[] | undefined): SearchKind {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return fold(String(value ?? "")) === "oyuncu" ? "oyuncu" : "takim";
}

/** Adı üç parçaya böler: önce · eşleşen · sonra. Eşleşme yoksa tamamı "önce". */
function splitMatch(name: string, needle: string): [string, string, string] {
  if (!needle) return [name, "", ""];
  const at = fold(name).indexOf(needle);
  if (at < 0) return [name, "", ""];
  const chars = [...name];
  return [
    chars.slice(0, at).join(""),
    chars.slice(at, at + [...needle].length).join(""),
    chars.slice(at + [...needle].length).join(""),
  ];
}

/* ── Satırlar ─────────────────────────────────────────────────────────────── */

const MatchName = React.memo(function MatchName({ name, needle }: { name: string; needle: string }) {
  const [before, hit, after] = splitMatch(name, needle);
  return (
    <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
      {before}
      {hit ? <Text style={styles.nameHit}>{hit}</Text> : null}
      {after}
    </Text>
  );
});

const TeamResult = React.memo(function TeamResult({
  teamId,
  name,
  logo,
  meta,
  needle,
  favorite,
  style,
  onOpen,
  onToggleFavorite,
}: {
  teamId: number;
  name: string;
  logo: string | null;
  meta: string;
  needle: string;
  favorite: boolean;
  style: object;
  onOpen: (teamId: number) => void;
  onToggleFavorite: (teamId: number, name: string, logo: string | null) => void;
}) {
  const open = useCallback(() => onOpen(teamId), [onOpen, teamId]);
  const star = useCallback(
    () => onToggleFavorite(teamId, name, logo),
    [logo, name, onToggleFavorite, teamId],
  );

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      style={[styles.row, style]}
      accessibilityRole="button"
      accessibilityLabel={`${name}${meta ? `, ${meta}` : ""}`}
    >
      <TeamLogo name={name} logo={logo} size={40} />
      <View style={styles.rowBody}>
        <MatchName name={name} needle={needle} />
        {meta ? (
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Touchable
        onPress={star}
        feedback="icon"
        haptic="light"
        hitSlop={touchSlop(20)}
        accessibilityRole="button"
        accessibilityLabel={favorite ? `${name} takibini bırak` : `${name} takımını takip et`}
        style={[styles.starButton, favorite ? styles.starButtonOn : null]}
      >
        <Ionicons
          name={favorite ? "star" : "star-outline"}
          size={18}
          color={favorite ? colors.star : colors.textTertiary}
        />
      </Touchable>
    </Touchable>
  );
});

const PlayerResult = React.memo(function PlayerResult({
  playerId,
  name,
  image,
  meta,
  needle,
  style,
  onOpen,
}: {
  playerId: number;
  name: string;
  image: string | null;
  meta: string;
  needle: string;
  style: object;
  onOpen: (playerId: number) => void;
}) {
  const open = useCallback(() => onOpen(playerId), [onOpen, playerId]);
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      style={[styles.row, style]}
      accessibilityRole="button"
      accessibilityLabel={`${name}${meta ? `, ${meta}` : ""}`}
    >
      <Avatar name={name} image={image} size={40} />
      <View style={styles.rowBody}>
        <MatchName name={name} needle={needle} />
        {meta ? (
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
    </Touchable>
  );
});

/* ── Ekran ────────────────────────────────────────────────────────────────── */

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tip?: string; q?: string }>();
  const scope = useScope();
  const toast = useToast();
  const { isFavorite, toggleFavorite, favorites } = useFavorite();

  const [kind, setKind] = useState<SearchKind>(() => resolveKind(params.tip));
  const [term, setTerm] = useState(() => {
    const raw = Array.isArray(params.q) ? params.q[0] : params.q;
    return typeof raw === "string" ? raw : "";
  });

  const query = term.trim();
  const enough = query.length >= MIN_QUERY;
  const needle = useMemo(() => fold(query), [query]);

  // Takımlar uygulama genelinde aranır: favori takım seçili şehirde olmayabilir.
  const teamsQuery = useQuery({
    queryKey: queryKeys.teams(),
    queryFn: getTeams,
    enabled: kind === "takim",
    staleTime: 10 * 60_000,
  });

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  // Oyuncu listesi kapsamlıdır; sunucu kapsamsız tam liste vermiyor.
  const playersQuery = useQuery({
    /* Lig sekmesiyle AYNI anahtar: uç her `sort` için aynı (≈1 MB) listeyi
       döndürür; ayrı anahtar aynı veriyi ikinci kez indiriyordu. */
    queryKey: queryKeys.playerRankings(scopeKey, "topScorers"),
    queryFn: () => getPlayerRankings(scopeKey, "topScorers"),
    enabled: kind === "oyuncu" && scope.ready,
    staleTime: 60_000,
  });

  const teams = useMemo(() => {
    if (!enough) return [];
    const matches = (teamsQuery.data ?? []).filter((team) => fold(team.team_name ?? "").includes(needle));
    // Adı aramayla BAŞLAYANLAR önce: "kar" yazana "Karadeniz", "Okar"dan önce gelir.
    return matches
      .sort(
        (a, b) =>
          Number(fold(b.team_name ?? "").startsWith(needle)) -
          Number(fold(a.team_name ?? "").startsWith(needle)),
      )
      .slice(0, 50);
  }, [enough, needle, teamsQuery.data]);

  const players = useMemo(() => {
    if (!enough) return [];
    return (playersQuery.data?.players ?? [])
      .filter(
        (player) =>
          fold(player.name ?? "").includes(needle) ||
          fold(player.teamName ?? "").includes(needle),
      )
      .slice(0, 50);
  }, [enough, needle, playersQuery.data]);

  const openTeam = useCallback(
    (teamId: number) => {
      rememberRef.current(term);
      router.push(`/takim/${teamId}`);
    },
    [router, term],
  );
  const openPlayer = useCallback(
    (playerId: number) => {
      rememberRef.current(term);
      router.push(`/oyuncu/${playerId}`);
    },
    [router, term],
  );
  /* `remember` aşağıda tanımlanır; açıcılar ona ref üstünden ulaşır. */
  const rememberRef = useRef<(value: string) => void>(() => undefined);

  const starTeam = useCallback(
    (teamId: number, name: string, logo: string | null) => {
      const wasFavorite = isFavorite(teamId);
      toggleFavorite({ id: teamId, name, logo: logo ?? undefined });
      toast.show({
        message: wasFavorite ? `${name} takipten çıkarıldı` : `${name} takip ediliyor`,
        tone: wasFavorite ? "neutral" : "success",
      });
    },
    [isFavorite, toast, toggleFavorite],
  );

  /* ── Son aramalar: cihazda tutulan kısa geçmiş (sonuç açılınca kaydedilir). ── */
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        const list = raw ? (JSON.parse(raw) as unknown) : [];
        if (Array.isArray(list)) setRecent(list.filter((item): item is string => typeof item === "string").slice(0, RECENT_MAX));
      })
      .catch(() => undefined);
  }, []);
  const remember = useCallback((value: string) => {
    const clean = value.trim();
    if (clean.length < MIN_QUERY) return;
    setRecent((current) => {
      const next = [clean, ...current.filter((item) => fold(item) !== fold(clean))].slice(0, RECENT_MAX);
      void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);
  rememberRef.current = remember;
  const clearRecent = useCallback(() => {
    setRecent([]);
    void AsyncStorage.removeItem(RECENT_KEY).catch(() => undefined);
  }, []);

  /* ── Ligler: kapsamın zaten yüklü lig listesinden süzülür (yeni istek yok). ── */
  const leagues = useMemo(
    () => (enough && kind === "takim" ? scope.leagues.filter((league) => fold(league.label ?? "").includes(needle)).slice(0, 4) : []),
    [enough, kind, needle, scope.leagues],
  );
  const openLeague = useCallback(
    (leagueId: number) => {
      remember(query);
      scope.selectLeague(leagueId);
      router.push("/(tabs)/ligler");
    },
    [query, remember, router, scope],
  );

  /* Boş arama: takip edilen takımlar (yalnız Takımlar segmentinde). */
  const followed = useMemo<FavoriteTeam[]>(() => (enough ? [] : favorites), [enough, favorites]);

  const renderTeam = useCallback(
    ({ item, index }: { item: ApiTeam; index: number }) => (
      <TeamResult
        teamId={item.id}
        name={item.team_name}
        logo={item.logo ?? null}
        meta={[item.city, item.current_league].filter(Boolean).join(" · ")}
        needle={needle}
        favorite={isFavorite(item.id)}
        style={groupRowStyle(index, teams.length, false)}
        onOpen={openTeam}
        onToggleFavorite={starTeam}
      />
    ),
    [isFavorite, needle, openTeam, starTeam, teams.length],
  );

  const renderFollowed = useCallback(
    ({ item, index }: { item: FavoriteTeam; index: number }) => (
      <TeamResult
        teamId={item.id}
        name={item.name}
        logo={item.logo ?? null}
        meta=""
        needle=""
        favorite
        style={groupRowStyle(index, followed.length, false)}
        onOpen={openTeam}
        onToggleFavorite={starTeam}
      />
    ),
    [followed.length, openTeam, starTeam],
  );

  const renderPlayer = useCallback(
    ({ item, index }: { item: PlayerRankRow; index: number }) => (
      <PlayerResult
        playerId={item.id}
        name={item.name}
        image={item.image ?? null}
        meta={[item.teamName, item.city].filter(Boolean).join(" · ")}
        needle={needle}
        style={groupRowStyle(index, players.length, false)}
        onOpen={openPlayer}
      />
    ),
    [needle, openPlayer, players.length],
  );

  const activeQuery = kind === "takim" ? teamsQuery : playersQuery;
  const loading = enough && activeQuery.isLoading;
  const failed = enough && activeQuery.isError;
  const scopeLine = [scope.cityLabel, scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ");

  const placeholder = (
    <ResultPlaceholder
      enough={enough}
      loading={loading}
      failed={failed}
      error={activeQuery.error}
      onRetry={activeQuery.refetch}
      emptyTitle={kind === "takim" ? "Takım bulunamadı" : "Oyuncu bulunamadı"}
      emptyBody={
        kind === "takim"
          ? `"${query}" aramasına uyan takım yok. Yazımı kontrol et ya da daha kısa yaz.`
          : `"${query}" bu kapsamın kadrolarında yok. Başka bir lig ya da sezonda olabilir.`
      }
      emptyAction={
        kind === "oyuncu" ? { label: "Kapsamı değiştir", onPress: () => scope.openScopeSheet("league") } : undefined
      }
      onClear={() => setTerm("")}
    />
  );

  /* Takım sonuçlarının üstü: lig eşleşmeleri + takım grubu başlığı. */
  const teamHeader =
    !loading && !failed && (teams.length > 0 || leagues.length > 0) ? (
      <View style={styles.groups}>
        {leagues.length > 0 ? (
          <View>
            <SectionHeader title="Ligler" meta={String(leagues.length)} icon="trophy" iconTone="gold" inset="flush" style={styles.groupHead} />
            <View style={styles.groupCard}>
              {leagues.map((league, index) => (
                <Touchable
                  key={league.id}
                  feedback="row"
                  haptic="selection"
                  onPress={() => openLeague(league.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${league.label} ligi, ${scope.cityLabel}`}
                  style={[styles.row, index > 0 ? styles.rowDivider : null]}
                >
                  <IconTile icon="trophy" tone="gold" size={40} glow={false} />
                  <View style={styles.rowBody}>
                    <MatchName name={league.label} needle={needle} />
                    <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                      {scope.cityLabel} · lig sayfasını aç
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
                </Touchable>
              ))}
            </View>
          </View>
        ) : null}
        {teams.length > 0 ? (
          <SectionHeader
            title="Takımlar"
            meta={teams.length >= 50 ? "ilk 50" : String(teams.length)}
            icon="shield"
            iconTone="violet"
            inset="flush"
            style={styles.groupHead}
          />
        ) : null}
      </View>
    ) : null;

  /* Boş ekranın başı: son aramalar çipleri. */
  const recentBlock = recent.length ? (
    <View style={styles.recent}>
      <View style={styles.recentHead}>
        <Text style={styles.recentTitle} {...textScale.badge}>
          {upperTR("Son aramalar")}
        </Text>
        <Touchable feedback="chip" onPress={clearRecent} accessibilityRole="button" accessibilityLabel="Son aramaları temizle">
          <Text style={styles.recentClear} {...textScale.dense}>
            Temizle
          </Text>
        </Touchable>
      </View>
      <View style={styles.recentChips}>
        {recent.map((item) => (
          <Chip key={item} label={item} icon="time-outline" size="sm" onPress={() => setTerm(item)} />
        ))}
      </View>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Ara"
        back
        bottom={
          <View style={styles.controls}>
            <Input
              variant="search"
              value={term}
              onChangeText={setTerm}
              placeholder={kind === "takim" ? "Takım ya da lig adı yaz" : "Oyuncu ya da takım adı yaz"}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => remember(term)}
            />
            <SegmentedControl<SearchKind> items={SEGMENTS} value={kind} onChange={setKind} />
          </View>
        }
      />

      {kind === "takim" ? (
        enough ? (
          <FlatList
            key="teams"
            data={loading || failed ? [] : teams}
            keyExtractor={teamKey}
            renderItem={renderTeam}
            ItemSeparatorComponent={GroupSeparator}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.list}
            initialNumToRender={12}
            windowSize={8}
            ListHeaderComponent={teamHeader}
            ListEmptyComponent={leagues.length ? null : placeholder}
          />
        ) : (
          <FlatList
            key="followed"
            data={followed}
            keyExtractor={followedKey}
            renderItem={renderFollowed}
            ItemSeparatorComponent={GroupSeparator}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View>
                {recentBlock}
                {followed.length > 0 ? (
                  <SectionHeader
                    title="Takip ettiğin takımlar"
                    meta={String(followed.length)}
                    icon="star"
                    iconTone="gold"
                    inset="flush"
                    style={styles.groupHead}
                  />
                ) : null}
              </View>
            }
            ListFooterComponent={followed.length > 0 ? <SearchHint /> : null}
            ListEmptyComponent={
              <View style={styles.idle}>
                <IconTile icon="search" tone="signature" size={56} />
                <Text style={styles.idleTitle} {...textScale.dense}>
                  Takımını bul
                </Text>
                <Text style={styles.idleBody} {...textScale.long}>
                  Tüm şehirlerdeki takımlar ve bu ilin ligleri arasında arar. En az {MIN_QUERY} harf yaz, yıldızla takip et.
                </Text>
                <View style={styles.idleKinds}>
                  <Badge label="Takımlar" tone="brand" icon="shield" />
                  <Badge label="Ligler" tone="warn" icon="trophy" />
                  <Badge label="Oyuncular" tone="accent" icon="person" />
                </View>
              </View>
            }
          />
        )
      ) : (
        <FlatList
          key="players"
          data={loading || failed ? [] : players}
          keyExtractor={playerKey}
          renderItem={renderPlayer}
          ItemSeparatorComponent={GroupSeparator}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          windowSize={8}
          ListHeaderComponent={
            scope.ready ? (
              <View>
                {enough ? null : recentBlock}
                <Touchable
                  feedback="card"
                  haptic="selection"
                  onPress={() => scope.openScopeSheet("league")}
                  style={styles.scopeCard}
                  accessibilityRole="button"
                  accessibilityLabel={`Arama kapsamı: ${scopeLine}. Değiştir`}
                >
                  <IconTile icon="funnel" tone="cyan" size={36} glow={false} />
                  <View style={styles.rowBody}>
                    <Text style={styles.scopeLabel} {...textScale.badge}>
                      KADROLARDA ARANIYOR
                    </Text>
                    <Text style={styles.scopeValue} numberOfLines={1} {...textScale.dense}>
                      {scopeLine}
                    </Text>
                  </View>
                  <Text style={styles.scopeAction} {...textScale.dense}>
                    Değiştir
                  </Text>
                </Touchable>
                {enough && !loading && !failed && players.length > 0 ? (
                  <SectionHeader
                    title="Oyuncular"
                    meta={players.length >= 50 ? "ilk 50" : String(players.length)}
                    icon="person"
                    iconTone="cyan"
                    inset="flush"
                    style={styles.groupHead}
                  />
                ) : null}
              </View>
            ) : null
          }
          ListEmptyComponent={
            !scope.ready ? (
              <EmptyState
                icon="options-outline"
                title="Lig seçilmedi"
                body="Oyuncu araması seçili lig ve sezon kadrolarında yapılır."
                action={{ label: "Kapsam seç", onPress: () => scope.openScopeSheet("city") }}
              />
            ) : enough ? (
              placeholder
            ) : (
              <EmptyState
                icon="person-outline"
                title="Oyuncu ara"
                body={`Ad ya da takım adıyla ara; en az ${MIN_QUERY} harf yeter.`}
                variant="inline"
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const SearchHint = React.memo(function SearchHint() {
  return (
    <View style={styles.hint}>
      <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
      <Text style={styles.hintText} {...textScale.dense}>
        Başka bir takım için yukarıya en az {MIN_QUERY} harf yaz.
      </Text>
    </View>
  );
});

/** Hâller tek yerde: az harf · yükleniyor · hata · sonuç yok. */
const ResultPlaceholder = React.memo(function ResultPlaceholder({
  enough,
  loading,
  failed,
  error,
  onRetry,
  emptyTitle,
  emptyBody,
  emptyAction,
  onClear,
}: {
  enough: boolean;
  loading: boolean;
  failed: boolean;
  error: unknown;
  onRetry: () => void;
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: { label: string; onPress: () => void };
  onClear: () => void;
}) {
  if (!enough) return null;
  if (loading) {
    return (
      <View style={styles.skeleton}>
        <SkeletonListRow count={6} />
      </View>
    );
  }
  if (failed) return <ErrorState error={error} onRetry={onRetry} variant="inline" />;
  return (
    <EmptyState
      icon="search-outline"
      title={emptyTitle}
      body={emptyBody}
      action={emptyAction ?? { label: "Aramayı temizle", onPress: onClear }}
      variant="inline"
    />
  );
});

const teamKey = (item: ApiTeam) => String(item.id);
const followedKey = (item: FavoriteTeam) => String(item.id);
const playerKey = (item: PlayerRankRow) => String(item.id);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: {
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.xxxl,
    flexGrow: 1,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  rowDivider: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  starButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  starButtonOn: {
    backgroundColor: colors.warnDim,
  },
  groups: {
    gap: space.xs,
  },
  groupHead: {
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  groupCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevate(1),
  },
  recent: {
    gap: space.sm,
    marginBottom: space.md,
  },
  recentHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recentTitle: {
    ...type.overline,
    color: colors.textTertiary,
  },
  recentClear: {
    ...type.label,
    color: colors.brandAccent,
  },
  recentChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  idle: {
    alignItems: "center",
    gap: space.sm,
    paddingTop: space.huge,
    paddingHorizontal: space.xl,
  },
  idleTitle: {
    ...type.h2,
    color: colors.textPrimary,
    marginTop: space.sm,
  },
  idleBody: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
  },
  idleKinds: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space.sm,
    marginTop: space.sm,
  },
  name: {
    ...type.h3,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },
  nameHit: {
    fontFamily: fonts.semibold,
    color: colors.brandAccent,
  },
  meta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  skeleton: {
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  scopeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    marginBottom: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  scopeLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  scopeValue: {
    ...type.label,
    color: colors.textPrimary,
  },
  scopeAction: {
    ...type.label,
    color: colors.brandAccent,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingTop: space.md,
    paddingHorizontal: space.xxs,
  },
  hintText: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
  },
});
