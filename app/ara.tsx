/**
 * ARA — takım ve oyuncu araması (modal).
 *
 * NEDEN BU DOSYA VAR: `app/_layout.tsx` yığında `ara` ekranını tanımlıyor,
 * Maçlar sekmesinin başlığındaki 🔍 ve Favoriler sekmesindeki "Takım ekle"
 * düğmesi buraya gidiyor. Dosya olmadan expo-router açılışta "No route named
 * ara" ile düşüyordu.
 *
 * NE YAPAR: tek arama kutusu, iki segment (Takımlar / Oyuncular). Takım listesi
 * uygulama genelindedir (favori takım başka şehirde olabilir), oyuncu listesi
 * seçili kapsamdan gelir — sunucu oyuncu sıralamasını kapsamsız veremiyor.
 * Satırdaki yıldız takımı doğrudan favoriye alır; böylece "arayıp favoriye
 * ekle" akışı tek ekranda biter ve kullanıcı takım sayfasına gidip geri
 * dönmek zorunda kalmaz.
 *
 * ARAMA TÜRKÇE KATLANIR: "İ/I/ı" ailesi ve şapkalı harfler normalleştirilir,
 * yoksa "Ünye" yazan kullanıcı "unye"yi bulamaz.
 *
 * DERİN BAĞLANTI: `/ara?tip=takim | oyuncu` (varsayılan "takim").
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Avatar,
  EmptyState,
  ErrorState,
  Input,
  ListRow,
  ScreenHeader,
  SegmentedControl,
  SkeletonListRow,
  TeamLogo,
  Touchable,
  useToast,
} from "@/components/ui";
import { getPlayerRankings } from "@/lib/api/players";
import { getTeams } from "@/lib/api/teams";
import { queryKeys } from "@/lib/queryKeys";
import type { ApiTeam, PlayerRankRow } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, space, textScale, touchSlop, type } from "@/theme";

type SearchKind = "takim" | "oyuncu";

const SEGMENTS = [
  { key: "takim" as const, label: "Takımlar" },
  { key: "oyuncu" as const, label: "Oyuncular" },
];

/** En az bu kadar harf yazılmadan liste açılmaz (tam liste ezber gibi görünür). */
const MIN_QUERY = 2;

/**
 * Türkçe arama katlaması. `toLocaleLowerCase("tr-TR")` tek başına yetmez:
 * kullanıcı "Unye" yazıp "Ünye"yi bulmak ister. Aksanlar ayrıştırılıp atılır.
 */
function fold(value: string): string {
  return value
    .replace(/[İIı]/g, "i")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveKind(raw: string | string[] | undefined): SearchKind {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return fold(String(value ?? "")) === "oyuncu" ? "oyuncu" : "takim";
}

/* ── Satırlar ─────────────────────────────────────────────────────────────── */

const TeamResult = React.memo(function TeamResult({
  teamId,
  name,
  logo,
  meta,
  favorite,
  position,
  onOpen,
  onToggleFavorite,
}: {
  teamId: number;
  name: string;
  logo: string | null;
  meta: string;
  favorite: boolean;
  position: "single" | "first" | "middle" | "last";
  onOpen: (teamId: number) => void;
  onToggleFavorite: (teamId: number, name: string, logo: string | null) => void;
}) {
  const open = useCallback(() => onOpen(teamId), [onOpen, teamId]);
  const star = useCallback(
    () => onToggleFavorite(teamId, name, logo),
    [logo, name, onToggleFavorite, teamId],
  );

  return (
    <ListRow
      position={position}
      title={name}
      subtitle={meta || undefined}
      onPress={open}
      leading={<TeamLogo name={name} logo={logo} size={layout.crestLg} />}
      trailing={
        <Touchable
          onPress={star}
          feedback="icon"
          haptic="light"
          hitSlop={touchSlop(20)}
          accessibilityRole="button"
          accessibilityLabel={favorite ? `${name} favorilerden çıkar` : `${name} favoriye al`}
        >
          <Ionicons
            name={favorite ? "star" : "star-outline"}
            size={20}
            color={favorite ? colors.star : colors.starEmpty}
          />
        </Touchable>
      }
    />
  );
});

const PlayerResult = React.memo(function PlayerResult({
  playerId,
  name,
  image,
  meta,
  position,
  onOpen,
}: {
  playerId: number;
  name: string;
  image: string | null;
  meta: string;
  position: "single" | "first" | "middle" | "last";
  onOpen: (playerId: number) => void;
}) {
  const open = useCallback(() => onOpen(playerId), [onOpen, playerId]);
  return (
    <ListRow
      position={position}
      title={name}
      subtitle={meta || undefined}
      onPress={open}
      leading={<Avatar name={name} image={image} size={layout.crestLg} />}
    />
  );
});

const groupPosition = (index: number, total: number) =>
  total === 1 ? "single" : index === 0 ? "first" : index === total - 1 ? "last" : "middle";

/* ── Ekran ────────────────────────────────────────────────────────────────── */

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tip?: string; q?: string }>();
  const scope = useScope();
  const toast = useToast();
  const { isFavorite, toggleFavorite } = useFavorite();

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
    queryKey: queryKeys.playerRankings(scopeKey, "mostValuable"),
    queryFn: () => getPlayerRankings(scopeKey, "mostValuable"),
    enabled: kind === "oyuncu" && scope.ready,
    staleTime: 60_000,
  });

  const teams = useMemo(() => {
    if (!enough) return [];
    return (teamsQuery.data ?? [])
      .filter((team) => fold(team.team_name ?? "").includes(needle))
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

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);
  const openPlayer = useCallback((playerId: number) => router.push(`/oyuncu/${playerId}`), [router]);

  const starTeam = useCallback(
    (teamId: number, name: string, logo: string | null) => {
      const wasFavorite = isFavorite(teamId);
      toggleFavorite({ id: teamId, name, logo: logo ?? undefined });
      toast.show({
        message: wasFavorite ? `${name} favorilerden çıkarıldı` : `${name} favorilere eklendi`,
        tone: wasFavorite ? "neutral" : "success",
      });
    },
    [isFavorite, toast, toggleFavorite],
  );

  const renderTeam = useCallback(
    ({ item, index }: { item: ApiTeam; index: number }) => (
      <TeamResult
        teamId={item.id}
        name={item.team_name}
        logo={item.logo ?? null}
        meta={[item.city, item.current_league].filter(Boolean).join(" · ")}
        favorite={isFavorite(item.id)}
        position={groupPosition(index, teams.length)}
        onOpen={openTeam}
        onToggleFavorite={starTeam}
      />
    ),
    [isFavorite, openTeam, starTeam, teams.length],
  );

  const renderPlayer = useCallback(
    ({ item, index }: { item: PlayerRankRow; index: number }) => (
      <PlayerResult
        playerId={item.id}
        name={item.name}
        image={item.image ?? null}
        meta={[item.teamName, item.city].filter(Boolean).join(" · ")}
        position={groupPosition(index, players.length)}
        onOpen={openPlayer}
      />
    ),
    [openPlayer, players.length],
  );

  const activeQuery = kind === "takim" ? teamsQuery : playersQuery;
  const loading = enough && activeQuery.isLoading;
  const failed = enough && activeQuery.isError;

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
              placeholder="Takım ya da oyuncu adı"
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
            />
            <SegmentedControl<SearchKind> items={SEGMENTS} value={kind} onChange={setKind} />
          </View>
        }
      />

      {kind === "takim" ? (
        <FlatList
          data={loading || failed ? [] : teams}
          keyExtractor={teamKey}
          renderItem={renderTeam}
          getItemLayout={rowLayout}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          windowSize={8}
          ListEmptyComponent={
            <ResultPlaceholder
              enough={enough}
              loading={loading}
              failed={failed}
              error={activeQuery.error}
              onRetry={activeQuery.refetch}
              emptyTitle="Takım bulunamadı"
              emptyBody={`"${query}" aramasına uyan takım yok.`}
            />
          }
        />
      ) : (
        <FlatList
          data={loading || failed ? [] : players}
          keyExtractor={playerKey}
          renderItem={renderPlayer}
          getItemLayout={rowLayout}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          windowSize={8}
          ListHeaderComponent={
            enough && scope.ready ? (
              <Text style={styles.scopeNote} {...textScale.long}>
                {scope.leagueLabel || "Seçili lig"} · {scope.seasonLabel || "sezon"} kadrolarında
                aranıyor.
              </Text>
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
            ) : (
              <ResultPlaceholder
                enough={enough}
                loading={loading}
                failed={failed}
                error={activeQuery.error}
                onRetry={activeQuery.refetch}
                emptyTitle="Oyuncu bulunamadı"
                emptyBody={`"${query}" aramasına uyan oyuncu yok.`}
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

/** Üç boş hâl tek yerde: az harf · yükleniyor · hata · sonuç yok. */
const ResultPlaceholder = React.memo(function ResultPlaceholder({
  enough,
  loading,
  failed,
  error,
  onRetry,
  emptyTitle,
  emptyBody,
}: {
  enough: boolean;
  loading: boolean;
  failed: boolean;
  error: unknown;
  onRetry: () => void;
  emptyTitle: string;
  emptyBody: string;
}) {
  if (!enough) {
    return (
      <EmptyState
        icon="search-outline"
        title="Aramaya başla"
        body={`En az ${MIN_QUERY} harf yazınca sonuçlar listelenir.`}
        variant="inline"
      />
    );
  }
  if (loading) {
    return (
      <View>
        {PLACEHOLDER_ROWS.map((key) => (
          <SkeletonListRow key={key} />
        ))}
      </View>
    );
  }
  if (failed) return <ErrorState error={error} onRetry={onRetry} variant="inline" />;
  return <EmptyState icon="sad-outline" title={emptyTitle} body={emptyBody} variant="inline" />;
});

const PLACEHOLDER_ROWS = ["p1", "p2", "p3", "p4", "p5"] as const;

const teamKey = (item: ApiTeam) => String(item.id);
const playerKey = (item: PlayerRankRow) => String(item.id);
const rowLayout = (_data: ArrayLike<unknown> | null | undefined, index: number) => ({
  length: layout.listRowHeightTwoLine,
  offset: layout.listRowHeightTwoLine * index,
  index,
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { gap: space.sm, paddingHorizontal: layout.screenPadding },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xxxl,
    flexGrow: 1,
  },
  scopeNote: {
    ...type.caption,
    color: colors.textTertiary,
    letterSpacing: 0,
    paddingBottom: space.sm,
  },
});
