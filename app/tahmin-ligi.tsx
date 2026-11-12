/**
 * TAHMİN LİGİ — seçili ligin gerçek maçlarına skor tahmini (routes/predictions.js).
 *
 *   Tahminler  yaklaşan maçlar (14 gün): her maça iki sayaçla skor, maç
 *              başlayana kadar değiştirilebilir. Son biten maçlar puanıyla.
 *   Sıralama   haftalık / sezonluk puan tablosu (kapsamın maçları).
 *
 * Puan: tam skor 5 · doğru sonuç + gol farkı 3 · doğru sonuç 2. İsteğe bağlı
 * golcü tahmini ("kim gol atar?"): seçilen oyuncu gol atarsa +3. Puanlar
 * Kulüp Şehri'ne YILDIZ olarak geçer (haftalık tavanla; tahminler XP vermez,
 * XP yalnız sahadan ve görevlerden gelir). Oyuncu kendi takımının maçına
 * tahmin yapamaz.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeaguePicker } from "@/components/LeaguePicker";
import { PredictionHero, PredictionMatchCard, ResultCard, Standings, summarizeForm } from "@/components/predictions";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  ListRow,
  Reveal,
  ScreenHeader,
  SegmentedControl,
  SkeletonCard,
  useHeaderScroll,
  useToast,
  type SegmentedItem,
} from "@/components/ui";
import {
  getPredictionBoard,
  getPredictionMatches,
  getScorerOptions,
  savePrediction,
  type PredictionMatch,
  type ScorerOption,
} from "@/lib/api/career";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, haptics, layout, space, textScale, type, upperTR } from "@/theme";

type Segment = "tahmin" | "siralama";
const SEGMENTS: SegmentedItem<Segment>[] = [
  { key: "tahmin", label: "Tahminler" },
  { key: "siralama", label: "Sıralama" },
];

export default function PredictionLeagueScreen() {
  const scope = useScope();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [segment, setSegment] = useState<Segment>("tahmin");
  const scopeArgs = { cityId: scope.cityId, leagueId: scope.leagueId, seasonId: scope.seasonId };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Tahmin Ligi" subtitle="Gerçek maçlara skor tahmini" back scrollY={scrollY} />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <LeaguePicker pinned={false} flush />
        <SegmentedControl items={SEGMENTS} value={segment} onChange={setSegment} />
        {!scope.ready ? (
          <SkeletonCard lines={4} />
        ) : segment === "tahmin" ? (
          <Predictions scope={scopeArgs} />
        ) : (
          <Board scope={scopeArgs} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type ScopeArgs = { cityId: number | null; leagueId: number | null; seasonId: number | null };

const boardKey = (period: "weekly" | "season", scope: ScopeArgs) =>
  ["predictions", "board", period, scope.cityId, scope.leagueId, scope.seasonId] as const;

function Predictions({ scope }: { scope: ScopeArgs }) {
  const auth = useAuth();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["predictions", "matches", scope.cityId, scope.leagueId, scope.seasonId, auth.user?.id ?? 0],
    queryFn: () => getPredictionMatches(scope),
    staleTime: 30_000,
  });
  /* Başlıktaki sezon sırası: Sıralama sekmesinin sezon sorgusuyla AYNI anahtar,
     yani iki sekme tek önbelleği paylaşır. Yalnız girişliyken sorulur. */
  const season = useQuery({
    queryKey: boardKey("season", scope),
    queryFn: () => getPredictionBoard("season", scope),
    staleTime: 60_000,
    enabled: Boolean(auth.user),
  });

  if (query.isLoading) return <SkeletonCard lines={5} />;
  if (query.isError || !query.data) return <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />;
  const { upcoming, recent, points } = query.data;
  const me = season.data?.me ?? null;

  return (
    <>
      <PredictionHero
        signedIn={Boolean(auth.user)}
        onSignIn={() => router.push("/giris")}
        season={me ? { rank: me.rank, points: me.points, exact: me.exact } : null}
        totalPlayers={season.data?.totalPlayers ?? null}
        form={auth.user ? summarizeForm(recent) : null}
        rules={points}
      />
      <SectionTitle title="Yaklaşan maçlar" count={upcoming.length} />
      {upcoming.length ? (
        upcoming.map((match, index) => (
          <Reveal key={match.id} index={index} limit={6}>
            <PredictionCard match={match} canEdit={Boolean(auth.user)} />
          </Reveal>
        ))
      ) : (
        <EmptyState icon="calendar-outline" title="Yaklaşan maç yok" body="Bu ligde önümüzdeki iki haftada maç görünmüyor." variant="inline" />
      )}
      {recent.length ? (
        <>
          <SectionTitle title="Son maçlar" count={recent.length} />
          {recent.map((match) => (
            <ResultCard key={match.id} match={match} />
          ))}
        </>
      ) : null}
    </>
  );
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionRow} accessibilityRole="header">
      <Text style={styles.section} {...textScale.badge}>
        {upperTR(title)}
      </Text>
      {count ? (
        <Text style={styles.sectionCount} {...textScale.badge}>
          {count}
        </Text>
      ) : null}
      <View style={styles.sectionRule} />
    </View>
  );
}

const PredictionCard = React.memo(function PredictionCard({ match, canEdit }: { match: PredictionMatch; canEdit: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [home, setHome] = useState(match.prediction?.home ?? 0);
  const [away, setAway] = useState(match.prediction?.away ?? 0);
  /* Sunucudaki tahmin değişince (başka cihaz, yenileme) sayaçlar eşitlenir. */
  const savedHome = match.prediction?.home;
  const savedAway = match.prediction?.away;
  useEffect(() => {
    if (savedHome != null) setHome(savedHome);
    if (savedAway != null) setAway(savedAway);
  }, [savedHome, savedAway]);
  const savedScorer = match.prediction?.scorer ?? null;
  const [scorer, setScorer] = useState<{ id: number; name: string } | null>(savedScorer);
  const savedScorerId = savedScorer?.id ?? null;
  useEffect(() => {
    setScorer(savedScorer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedScorerId]);
  const [picking, setPicking] = useState(false);
  const [savedPulse, setSavedPulse] = useState(0);
  const saved =
    match.prediction && match.prediction.home === home && match.prediction.away === away && (scorer?.id ?? null) === savedScorerId;

  const save = useMutation({
    mutationFn: () => savePrediction(match.id, home, away, scorer?.id ?? null),
    onSuccess: () => {
      haptics.success();
      setSavedPulse((n) => n + 1);
      toast.show({ message: "Tahminin kaydedildi.", tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["predictions"] });
      void queryClient.invalidateQueries({ queryKey: ["career", "me"] });
    },
    onError: (error) => toast.show({ message: error instanceof ApiError ? error.userMessage : "Tahmin kaydedilemedi.", tone: "danger" }),
  });

  return (
    <>
      <PredictionMatchCard
        match={match}
        home={home}
        away={away}
        onHome={setHome}
        onAway={setAway}
        canEdit={canEdit}
        scorer={scorer}
        onScorerPress={() => setPicking(true)}
        saved={Boolean(saved)}
        saving={save.isPending}
        onSave={() => save.mutate()}
        savedPulse={savedPulse}
      />
      {picking ? (
        <ScorerSheet
          match={match}
          selectedId={scorer?.id ?? null}
          onClose={() => setPicking(false)}
          onSelect={(player) => {
            setScorer(player);
            setPicking(false);
          }}
        />
      ) : null}
    </>
  );
});

/** Golcü seçimi: iki takımın kadrosu, çok gol atan üstte. */
function ScorerSheet({
  match,
  selectedId,
  onClose,
  onSelect,
}: {
  match: PredictionMatch;
  selectedId: number | null;
  onClose: () => void;
  onSelect: (player: { id: number; name: string } | null) => void;
}) {
  const [side, setSide] = useState<"home" | "away">("home");
  const query = useQuery({ queryKey: ["predictions", "scorers", match.id], queryFn: () => getScorerOptions(match.id), staleTime: 10 * 60_000 });
  const list: ScorerOption[] = query.data?.[side].players ?? [];
  return (
    <BottomSheet visible onClose={onClose} title="Kim gol atar?" snap="full">
      <View style={styles.sheet}>
        <SegmentedControl
          size="sm"
          stretch
          items={[
            { key: "home", label: match.home.name },
            { key: "away", label: match.away.name },
          ]}
          value={side}
          onChange={setSide}
        />
        {selectedId ? <Button label="Golcü seçimini kaldır" variant="ghost" size="sm" icon="close-circle-outline" onPress={() => onSelect(null)} /> : null}
        {query.isLoading ? (
          <SkeletonCard lines={6} />
        ) : query.isError ? (
          <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
        ) : !list.length ? (
          <EmptyState icon="people-outline" title="Kadro bulunamadı" body="Bu takımın oyuncu listesi henüz yok." variant="inline" />
        ) : (
          list.map((player, index) => (
            <ListRow
              key={player.id}
              leading={<Avatar name={player.name} image={player.image} size={36} />}
              title={player.name}
              subtitle={[player.position, `${player.goals} gol`].filter(Boolean).join(" · ")}
              badge={player.id === selectedId ? <Badge label="Seçili" tone="win" size="xs" /> : undefined}
              highlighted={player.id === selectedId}
              onPress={() => onSelect({ id: player.id, name: player.name })}
              position={list.length === 1 ? "single" : index === 0 ? "first" : index === list.length - 1 ? "last" : "middle"}
            />
          ))
        )}
      </View>
    </BottomSheet>
  );
}

function Board({ scope }: { scope: ScopeArgs }) {
  const [period, setPeriod] = useState<"weekly" | "season">("weekly");
  const query = useQuery({
    queryKey: boardKey(period, scope),
    queryFn: () => getPredictionBoard(period, scope),
    staleTime: 60_000,
  });

  return (
    <>
      <ChipGroup contentPadding={0}>
        <Chip size="sm" label="Bu hafta" selected={period === "weekly"} onPress={() => setPeriod("weekly")} />
        <Chip size="sm" label="Sezon" selected={period === "season"} onPress={() => setPeriod("season")} />
      </ChipGroup>
      {query.isLoading ? (
        <SkeletonCard lines={6} />
      ) : query.isError || !query.data ? (
        <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
      ) : !query.data.entries.length ? (
        <EmptyState icon="podium-outline" title="Henüz puan yok" body="Maçlar bitip tahminler puanlandıkça sıralama oluşur." variant="inline" />
      ) : (
        <Standings
          entries={query.data.entries}
          me={query.data.me}
          totalPlayers={query.data.totalPlayers}
          periodLabel={period === "weekly" ? "Bu hafta" : "Sezon"}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant, gap: space.md },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm },
  section: { ...type.overline, color: colors.textTertiary },
  sectionCount: { ...type.numSmStrong, color: colors.brandAccent },
  sectionRule: { flex: 1, height: 1, backgroundColor: colors.border },
  sheet: { gap: space.s, paddingBottom: space.lg },
});
