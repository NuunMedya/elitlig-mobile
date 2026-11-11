/**
 * MAÇ İŞ AKIŞI — tek maçın dört adımı (web /editor/maclar/:id/...).
 *
 *   1. Maç öncesi  — tarih/saat/saha/durum, yayın linki, görevlendirme (hakem dahil)
 *   2. Kadro       — iki takımın kadrosu, forma no, kaptan, İlk 11 / yedek
 *   3. Canlı akış  — saat, devre, olaylar, skor, yayın ekranı
 *   4. Maç sonu    — puanlar, maçın enleri, içerik, istatistik, yayınla
 *
 * Adımlar web ile aynı kuralla kilitlenir (taslakta yalnız 1. adım açık).
 * Açılışta maçın aşamasına uygun adım seçilir; `?adim=` ile doğrudan açılır.
 * Her adım kendi yetkisini ister; yetki yoksa adımın içi kilit gösterir.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AdminScreen, confirmAction } from "@/components/admin";
import { InfoStep } from "@/components/admin/matches/InfoStep";
import { LineupStep } from "@/components/admin/matches/LineupStep";
import { LiveStep } from "@/components/admin/matches/LiveStep";
import { PostStep } from "@/components/admin/matches/PostStep";
import { STEPS, defaultStep, stepAvailability, type StepKey } from "@/components/admin/matches/model";
import { MatchHero, StepBar } from "@/components/admin/matches/parts";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { hasAnyPermission } from "@/lib/admin/access";
import { getAdminMatch, getLineupStatus } from "@/lib/api/admin/matches";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { space } from "@/theme";

const PERMS = ["matches.view", "matches.create", "matches.update", "matches.lineup", "matches.live", "matches.stats"] as const;

const isStep = (v: unknown): v is StepKey => STEPS.some((s) => s.key === v);

export default function MatchWorkflowScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const queryClient = useQueryClient();
  const teams = useTeamLogos();
  const params = useLocalSearchParams<{ id: string; adim?: string }>();
  const matchId = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  const requested = Array.isArray(params.adim) ? params.adim[0] : params.adim;

  const detail = useQuery({
    queryKey: ["admin", "matches", "detail", matchId],
    queryFn: () => getAdminMatch(matchId),
    enabled: Number.isFinite(matchId) && matchId > 0 && Boolean(auth.user),
  });
  const lineupStatus = useQuery({
    queryKey: ["admin", "matches", "lineup-status", matchId],
    queryFn: () => getLineupStatus([matchId]),
    enabled: Number.isFinite(matchId) && matchId > 0 && Boolean(auth.user),
    staleTime: 30_000,
  });

  const match = detail.data ?? null;
  const [step, setStep] = useState<StepKey | null>(isStep(requested) ? requested : null);
  const [liveScore, setLiveScore] = useState<{ home: number; away: number } | null>(null);

  // İlk açılışta aşamaya uygun adım.
  useEffect(() => {
    if (step || !match || lineupStatus.isLoading) return;
    setStep(defaultStep(match.mac_durumu, lineupStatus.data?.statuses?.[String(matchId)]));
  }, [match, lineupStatus.isLoading, lineupStatus.data, step, matchId]);

  const current: StepKey = step ?? "bilgiler";
  const availability = match ? stepAvailability(current, match.mac_durumu) : { ready: true };
  const stepMeta = STEPS.find((s) => s.key === current)!;
  const allowed = hasAnyPermission(auth.user, stepMeta.permission);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });

  const subtitle = useMemo(
    () => (match ? `${match.first_team_name} – ${match.second_team_name}` : undefined),
    [match]
  );

  /* Adımın kaydedilmemiş değişikliği: adım değişince bileşen kapanır ve girilen
     kadro / puan / form kaybolurdu; geçişten önce sorulur. */
  const dirtyRef = useRef(false);
  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const changeStep = async (next: StepKey) => {
    if (next === current) return;
    if (dirtyRef.current) {
      const ok = await confirmAction({
        title: "Kaydedilmemiş değişiklikler var",
        message: `${stepMeta.label} adımındaki değişiklikler kaydedilmedi. Adımdan çıkarsan kaybolur.`,
        confirmLabel: "Kaydetmeden çık",
        cancelLabel: "Adımda kal",
        destructive: true,
      });
      if (!ok) return;
    }
    dirtyRef.current = false;
    setStep(next);
    router.setParams({ adim: next });
  };

  return (
    <AdminScreen
      title="Maç iş akışı"
      subtitle={subtitle}
      permission={PERMS}
      onRefresh={refresh}
      refreshing={detail.isRefetching}
      actions={
        match
          ? [{ icon: "open-outline", accessibilityLabel: "Maç sayfasını aç", onPress: () => router.push(`/mac/${matchId}`) }]
          : undefined
      }
    >
      {detail.isLoading ? (
        <View style={styles.stack}>
          <Skeleton height={150} radius="xl" />
          <Skeleton height={56} radius="lg" />
          <Skeleton height={240} radius="xl" />
        </View>
      ) : detail.isError || !match ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <View style={styles.stack}>
          <MatchHero
            match={match}
            homeLogo={teams.logoFor(match.home_team_id, match.first_team_name)}
            awayLogo={teams.logoFor(match.away_team_id, match.second_team_name)}
            score={current === "canli" ? liveScore : null}
          />
          <StepBar value={current} status={match.mac_durumu} onChange={(next) => void changeStep(next)} />

          {!availability.ready ? (
            <EmptyState
              icon="lock-closed-outline"
              title={`${stepMeta.label} henüz açılmadı`}
              body={availability.hint}
              action={{ label: "Maç öncesine git", onPress: () => void changeStep("bilgiler") }}
              variant="inline"
            />
          ) : !allowed ? (
            <EmptyState
              icon="lock-closed-outline"
              title="Bu adıma yetkin yok"
              body={`${stepMeta.label} için gereken yetki hesabında tanımlı değil.`}
              variant="inline"
            />
          ) : current === "bilgiler" ? (
            <InfoStep key={`info-${match.id}`} match={match} cityId={scope.cityId} onGoStep={(next) => void changeStep(next)} onDirtyChange={setDirty} />
          ) : current === "kadro" ? (
            <LineupStep key={`lineup-${match.id}`} match={match} onDirtyChange={setDirty} />
          ) : current === "canli" ? (
            <LiveStep key={`live-${match.id}`} match={match} onScore={setLiveScore} />
          ) : (
            <PostStep key={`post-${match.id}`} match={match} onDirtyChange={setDirty} />
          )}
        </View>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
});
