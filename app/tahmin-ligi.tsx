/**
 * TAHMİN LİGİ — seçili ligin gerçek maçlarına skor tahmini (routes/predictions.js).
 *
 *   Tahminler  yaklaşan maçlar (14 gün): her maça iki sayaçla skor, maç
 *              başlayana kadar değiştirilebilir. Son biten maçlar puanıyla.
 *   Sıralama   haftalık / sezonluk puan tablosu (kapsamın maçları).
 *
 * Puan: tam skor 5 · doğru sonuç + gol farkı 3 · doğru sonuç 2. İsteğe bağlı
 * golcü tahmini ("kim gol atar?"): seçilen oyuncu gol atarsa +3. Puanlar
 * Kariyer Modu'nun Seyirci katmanına XP olarak geçer. Oyuncu kendi takımının
 * maçına tahmin yapamaz.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeaguePicker } from "@/components/LeaguePicker";
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
  ScreenHeader,
  SegmentedControl,
  SkeletonCard,
  Stepper,
  useHeaderScroll,
  useToast,
  type SegmentedItem,
  type Tone,
} from "@/components/ui";
import {
  getPredictionBoard,
  getPredictionMatches,
  getScorerOptions,
  savePrediction,
  type PredictionMatch,
  type ScorerOption,
} from "@/lib/api/career";
import { formatDateShort, formatTime } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

type Segment = "tahmin" | "siralama";
const SEGMENTS: SegmentedItem<Segment>[] = [
  { key: "tahmin", label: "Tahminler" },
  { key: "siralama", label: "Sıralama" },
];

const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  exact: { label: "Tam skor · 5", tone: "win" },
  diff: { label: "Fark · 3", tone: "info" },
  result: { label: "Sonuç · 2", tone: "info" },
  miss: { label: "0 puan", tone: "neutral" },
  void: { label: "Geçersiz", tone: "neutral" },
};

export default function PredictionLeagueScreen() {
  const scope = useScope();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [segment, setSegment] = useState<Segment>("tahmin");
  const scopeArgs = { cityId: scope.cityId, leagueId: scope.leagueId, seasonId: scope.seasonId };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Tahmin Ligi" subtitle="Tam skor 5 · fark 3 · sonuç 2 · golcü 3 puan" back scrollY={scrollY} />
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

function Predictions({ scope }: { scope: ScopeArgs }) {
  const auth = useAuth();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["predictions", "matches", scope.cityId, scope.leagueId, scope.seasonId, auth.user?.id ?? 0],
    queryFn: () => getPredictionMatches(scope),
    staleTime: 30_000,
  });

  if (query.isLoading) return <SkeletonCard lines={5} />;
  if (query.isError || !query.data) return <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />;
  const { upcoming, recent } = query.data;

  return (
    <>
      {!auth.user ? (
        <View style={styles.card}>
          <Text style={styles.text} {...textScale.long}>
            Tahmin yapmak ve sıralamaya girmek için giriş yap.
          </Text>
          <Button label="Giriş yap" onPress={() => router.push("/giris")} />
        </View>
      ) : null}
      <Text style={styles.section} {...textScale.badge}>
        {upperTR("Yaklaşan maçlar")}
      </Text>
      {upcoming.length ? (
        upcoming.map((match) => <PredictionCard key={match.id} match={match} canEdit={Boolean(auth.user)} />)
      ) : (
        <EmptyState icon="calendar-outline" title="Yaklaşan maç yok" body="Bu ligde önümüzdeki iki haftada maç görünmüyor." variant="inline" />
      )}
      {recent.length ? (
        <>
          <Text style={styles.section} {...textScale.badge}>
            {upperTR("Son maçlar")}
          </Text>
          {recent.map((match) => (
            <ResultRow key={match.id} match={match} />
          ))}
        </>
      ) : null}
    </>
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
  const saved =
    match.prediction && match.prediction.home === home && match.prediction.away === away && (scorer?.id ?? null) === savedScorerId;

  const save = useMutation({
    mutationFn: () => savePrediction(match.id, home, away, scorer?.id ?? null),
    onSuccess: () => {
      toast.show({ message: "Tahminin kaydedildi.", tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["predictions"] });
      void queryClient.invalidateQueries({ queryKey: ["career", "me"] });
    },
    onError: (error) => toast.show({ message: error instanceof ApiError ? error.userMessage : "Tahmin kaydedilemedi.", tone: "danger" }),
  });

  const meta = [formatDateShort(match.date), match.time ? formatTime(match.time) : null, match.league_name].filter(Boolean).join(" · ");
  const locked = !canEdit || !match.can_predict;

  return (
    <View style={styles.card}>
      <Text style={styles.meta} {...textScale.dense}>
        {meta}
      </Text>
      <Stepper label={match.home.name} value={home} onChange={setHome} min={0} max={30} size="sm" disabled={locked} accessibilityLabel={`${match.home.name} golü`} />
      <Stepper label={match.away.name} value={away} onChange={setAway} min={0} max={30} size="sm" disabled={locked} accessibilityLabel={`${match.away.name} golü`} />
      {!match.own_match && (scorer || !locked) ? (
        <ListRow
          leading={{ icon: "football-outline", tone: scorer ? "brand" : "neutral" }}
          title={scorer ? scorer.name : "Kim gol atar?"}
          subtitle={scorer ? "Golcü tahminin · tutarsa +3 puan" : "İsteğe bağlı · bir oyuncu seç, gol atarsa +3 puan"}
          chevron={!locked}
          onPress={locked ? undefined : () => setPicking(true)}
          position="single"
        />
      ) : null}
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
      {match.own_match ? (
        <Text style={styles.text} {...textScale.long}>
          Kendi takımının maçına tahmin yapamazsın.
        </Text>
      ) : match.status === "live" ? (
        <Badge label="Canlı · tahmin kapandı" tone="live" size="xs" />
      ) : canEdit && match.can_predict ? (
        <Button
          label={saved ? "Kaydedildi" : match.prediction ? "Tahmini güncelle" : "Tahmini kaydet"}
          size="sm"
          variant={saved ? "secondary" : "primary"}
          disabled={Boolean(saved)}
          loading={save.isPending}
          onPress={() => save.mutate()}
        />
      ) : null}
    </View>
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

function ResultRow({ match }: { match: PredictionMatch }) {
  const outcome = match.prediction?.outcome ? OUTCOME[match.prediction.outcome] : null;
  const scorer = match.prediction?.scorer;
  const scorerText = scorer ? ` · Golcü: ${scorer.name}${match.prediction?.scorer_hit ? " (tuttu, +3)" : match.prediction?.scorer_hit === false ? " (tutmadı)" : ""}` : "";
  return (
    <ListRow
      title={`${match.home.name} ${match.score?.home ?? "-"} – ${match.score?.away ?? "-"} ${match.away.name}`}
      subtitle={match.prediction ? `Tahminin: ${match.prediction.home} – ${match.prediction.away}${scorerText}` : "Tahmin yapmadın"}
      badge={outcome ? <Badge label={outcome.label} tone={outcome.tone} size="xs" /> : undefined}
      position="single"
      style={styles.row}
    />
  );
}

function Board({ scope }: { scope: ScopeArgs }) {
  const [period, setPeriod] = useState<"weekly" | "season">("weekly");
  const query = useQuery({
    queryKey: ["predictions", "board", period, scope.cityId, scope.leagueId, scope.seasonId],
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
        <>
          {query.data.me ? (
            <View style={[styles.card, styles.me]}>
              <Text style={styles.text} {...textScale.dense}>
                {`Sıran: ${query.data.me.rank}. · ${query.data.me.points} puan · ${query.data.me.exact} tam skor`}
              </Text>
            </View>
          ) : null}
          <View>
            {query.data.entries.map((entry, index, list) => (
              <ListRow
                key={entry.userId}
                leading={
                  <View style={styles.rank}>
                    <Text style={styles.rankText} {...textScale.dense}>
                      {entry.rank}
                    </Text>
                  </View>
                }
                title={entry.name}
                subtitle={[entry.teamName, `${entry.predictions} tahmin · ${entry.exact} tam skor`].filter(Boolean).join(" · ")}
                value={`${entry.points} p`}
                highlighted={entry.userId === query.data?.me?.userId}
                position={list.length === 1 ? "single" : index === 0 ? "first" : index === list.length - 1 ? "last" : "middle"}
              />
            ))}
          </View>
        </>
      )}
    </>
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
  me: { borderColor: colors.accent },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.s },
  meta: { ...type.caption, color: colors.textTertiary },
  text: { ...type.body, color: colors.textSecondary },
  row: { marginBottom: space.s },
  rank: { width: 32, alignItems: "center" },
  rankText: { ...type.h3, color: colors.textPrimary },
  sheet: { gap: space.s, paddingBottom: space.lg },
});
