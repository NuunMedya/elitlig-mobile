/**
 * MAÇ İŞ AKIŞI — tek maçın dört adımı (web /editor/maclar/:id/...).
 *
 *   1. Maç öncesi  — tarih/saat/saha/durum, yayın linki, görevlendirme (hakem dahil)
 *   2. Kadro       — iki takımın kadrosu, forma no, kaptan, İlk 11 / yedek
 *   3. Canlı akış  — saat, devre, olaylar, skor, yayın ekranı
 *   4. Maç sonu    — puanlar, maçın enleri, içerik, istatistik, yayınla
 *
 * KİLİT: sunucu hiçbir yazımı maç durumuna göre reddetmez; bu yüzden Kadro
 * her durumda, Maç sonu zamanlanmış maçta da açıktır (model.stepAvailability).
 * Taslak maçta Canlı akış ve Maç sonu kapalıdır; kilit ekranı nedenini söyler
 * ve "Maçı zamanla" düğmesiyle tek dokunuşta açar.
 * Açılışta maçın aşamasına uygun adım seçilir; `?adim=` ile doğrudan açılır
 * (maç listesi, lig ana ekranı ve stüdyo "Kadro" / "Maç sonu" kısayolları).
 * Her adım kendi yetkisini ister; yetki yoksa adımın içi kilit gösterir.
 *
 * KAYDET: adımların kaydet düğmesi ekranın altında sabit durur (SaveBar);
 * kaydedilmemiş değişiklik varken adım değiştirmek ya da ekrandan çıkmak onay ister.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePreventRemove } from "@react-navigation/native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdminScreen, confirmAction, useAdminMutation } from "@/components/admin";
import { InfoStep } from "@/components/admin/matches/InfoStep";
import { LineupStep } from "@/components/admin/matches/LineupStep";
import { LiveStep } from "@/components/admin/matches/LiveStep";
import { PostStep } from "@/components/admin/matches/PostStep";
import { STEPS, defaultStep, stepAvailability, type StepKey } from "@/components/admin/matches/model";
import { MatchHero, Note, SaveBar, SaveBarContext, StepBar, type SaveBarSpec } from "@/components/admin/matches/parts";
import { Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { hasAnyPermission } from "@/lib/admin/access";
import { getAdminMatch, getLineupStatus, normalizeMatchStatus, setMatchStatus, updateMatch } from "@/lib/api/admin/matches";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { space } from "@/theme";

const PERMS = ["matches.view", "matches.create", "matches.update", "matches.lineup", "matches.live", "matches.stats"] as const;

const isStep = (v: unknown): v is StepKey => STEPS.some((s) => s.key === v);

export default function MatchWorkflowScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
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
  const availability: ReturnType<typeof stepAvailability> = match ? stepAvailability(current, match.mac_durumu) : { ready: true };
  const lineupReady = Boolean(lineupStatus.data?.statuses?.[String(matchId)]);
  const stepMeta = STEPS.find((s) => s.key === current)!;
  const allowed = hasAnyPermission(auth.user, stepMeta.permission);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });

  const subtitle = useMemo(
    () => (match ? `${match.first_team_name} – ${match.second_team_name}` : undefined),
    [match]
  );

  /* Adımın kaydedilmemiş değişikliği: adım değişince bileşen kapanır ve girilen
     kadro / puan / form kaybolurdu; geçişten ve ekrandan çıkmadan önce sorulur. */
  const dirtyRef = useRef(false);
  const [dirty, setDirtyState] = useState(false);
  const setDirty = useCallback((next: boolean) => {
    dirtyRef.current = next;
    setDirtyState(next);
  }, []);

  usePreventRemove(dirty, ({ data }) => {
    void confirmAction({
      title: "Kaydedilmemiş değişiklikler var",
      message: "Bu maçta girdiğin değişiklikler kaydedilmedi. Çıkarsan kaybolur.",
      confirmLabel: "Kaydetmeden çık",
      cancelLabel: "Ekranda kal",
      destructive: true,
    }).then((ok) => {
      if (ok) navigation.dispatch(data.action);
    });
  });

  /* Adımın sabit kaydet çubuğu (StepSaveBar → SaveBar). */
  const [saveBar, setSaveBar] = useState<SaveBarSpec | null>(null);

  /* Kilidi çözen tek dokunuş: taslak maçı "Zamanlandı" yap. Maç fikstürde
     yayınlanır; bildirim gitmez (sunucu yalnız canlı / tamamlandı geçişinde gönderir). */
  const canSchedule = hasAnyPermission(auth.user, ["matches.publish", "matches.update"]);
  const schedule = useAdminMutation(
    () =>
      hasAnyPermission(auth.user, ["matches.publish"])
        ? setMatchStatus(matchId, "zamanlanmis")
        : updateMatch(matchId, { mac_durumu: "zamanlanmis" }),
    {
      success: "Maç zamanlandı. Fikstürde yayında; tüm adımlar açıldı.",
      invalidate: [["admin", "matches"], ["studio"]],
    }
  );
  const isDraft = match ? (normalizeMatchStatus(match.mac_durumu) ?? "taslak") === "taslak" : false;

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
    setDirty(false);
    setSaveBar(null);
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
      overlay={match && availability.ready && allowed ? <SaveBar spec={saveBar} bottomInset={insets.bottom} /> : null}
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
          <StepBar
            value={current}
            status={match.mac_durumu}
            onChange={(next) => void changeStep(next)}
            done={{ kadro: lineupReady, "mac-sonu": normalizeMatchStatus(match.mac_durumu) === "yayinlanmis" }}
          />

          {!availability.ready ? (
            <View style={styles.locked}>
              <EmptyState
                icon="lock-closed-outline"
                title={`${stepMeta.label} kilitli: maç taslak`}
                body={
                  canSchedule
                    ? `${availability.hint} Tarih, saat ve sahayı Maç öncesinde sonra da düzeltebilirsin.`
                    : `${availability.hint} Maçı zamanlamak için hesabında maç güncelleme ya da yayınlama yetkisi olmalı.`
                }
                variant="inline"
                compact
              />
              {canSchedule && availability.fix === "schedule" ? (
                <Button
                  label={`Maçı zamanla ve ${stepMeta.label} adımını aç`}
                  icon="lock-open-outline"
                  onPress={() => schedule.mutate(undefined)}
                  loading={schedule.isPending}
                  fullWidth
                  haptic="success"
                />
              ) : null}
              <Button label="Maç öncesine git" variant="ghost" icon="clipboard-outline" onPress={() => void changeStep("bilgiler")} fullWidth />
            </View>
          ) : !allowed ? (
            <EmptyState
              icon="lock-closed-outline"
              title="Bu adıma yetkin yok"
              body={`${stepMeta.label} için gereken yetki hesabında tanımlı değil.`}
              variant="inline"
            />
          ) : (
            <SaveBarContext.Provider value={setSaveBar}>
              {availability.note ? <Note text={availability.note} tone={isDraft ? "warn" : "info"} /> : null}
              {availability.fix === "schedule" && canSchedule ? (
                <Button
                  label="Maçı zamanla"
                  icon="calendar-outline"
                  variant="secondary"
                  size="sm"
                  onPress={() => schedule.mutate(undefined)}
                  loading={schedule.isPending}
                />
              ) : null}
              {current === "bilgiler" ? (
            <InfoStep key={`info-${match.id}`} match={match} cityId={scope.cityId} onGoStep={(next) => void changeStep(next)} onDirtyChange={setDirty} />
          ) : current === "kadro" ? (
            <LineupStep key={`lineup-${match.id}`} match={match} onDirtyChange={setDirty} />
          ) : current === "canli" ? (
            <LiveStep key={`live-${match.id}`} match={match} onScore={setLiveScore} />
          ) : (
            <PostStep key={`post-${match.id}`} match={match} onDirtyChange={setDirty} onGoStep={(next) => void changeStep(next)} />
          )}
            </SaveBarContext.Provider>
          )}
        </View>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  locked: { gap: space.sm },
});
