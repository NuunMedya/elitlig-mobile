/**
 * SIRADAKİ MAÇ + HAZIRLIK — başkanın "maça hazır mıyız?" kartı.
 *
 * Üstte maç (ev/deplasman, rakip, gün-saat-saha, geri sayım), altında üç
 * adım gerçek veriden durum alır ve her biri maç ekranının ilgili sekmesini
 * açar (web "Gelecek Maçlar": kadro kur, yoklama yap, rakip analizi):
 *   1. Yoklama — sıradaki maçın yoklama dağılımı (geliyor ≥ ilk 8 → tamam)
 *   2. Maç kadrosu — kayıtlı maç planı (ilk 8 dolu → tamam, eksik → uyarı)
 *   3. Rakip analizi — kadro kayıtlıysa senaryo karşılaştırması
 * Plan sorgusunun anahtarı maç ekranıyla AYNIDIR (["takim","match-plan",id]):
 * kadro kaydedilince bu kart da kendiliğinden güncellenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { daysUntil, matchWhen } from "@/components/club/NextMatchCard";
import { PanelCard, PanelEmpty, PrepChecklist, ThinProgress, prepProgress, type PrepStep } from "@/components/club/Panel";
import type { ClubSignals } from "@/components/club/useClubSignals";
import { Badge, Button, SkeletonCard, TeamLogo, toneColors } from "@/components/ui";
import { MAX_STARTERS, getTeamMatchPlan } from "@/lib/api/team";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";

export function NextMatchPrep({
  signals,
  teamName,
  teamLogo,
  go,
}: {
  signals: ClubSignals;
  teamName: string;
  teamLogo: string | null;
  go: (href: string) => void;
}) {
  const { nextTeamMatch: match, teamAvailability, teamMatches } = signals;
  const matchId = match?.id ?? 0;

  const plan = useQuery({
    queryKey: ["takim", "match-plan", matchId],
    queryFn: () => getTeamMatchPlan(matchId),
    enabled: matchId > 0,
    staleTime: 60_000,
    retry: false,
  });

  if (teamMatches.isLoading) return <SkeletonCard lines={3} />;

  if (!match) {
    return (
      <PanelEmpty
        icon="calendar-outline"
        text={teamMatches.isError ? "Fikstür alınamadı. Aşağı çekerek yenile." : "Programda maç yok. Saha panosundan boş saat seç, rakip bul."}
        action={teamMatches.isError ? undefined : { label: "Maç al", onPress: () => go("/takimim/mac-al") }}
      />
    );
  }

  const base = `/takimim/mac/${match.id}`;
  const counts = teamAvailability.data?.counts;
  const lineup = plan.data?.plan?.lineup ?? [];
  const starters = lineup.filter((row) => row.starter).length;
  const bench = lineup.length - starters;

  const steps: PrepStep[] = [
    {
      key: "yoklama",
      label: "Yoklama",
      state: !counts ? "todo" : counts.coming >= MAX_STARTERS ? "done" : "warn",
      detail: teamAvailability.isLoading
        ? "…"
        : counts
          ? `${counts.coming}/${MAX_STARTERS} geliyor${counts.unanswered ? ` · ${counts.unanswered} yanıtsız` : ""}`
          : "Yoklama başlat",
      onPress: () => go(`${base}?sekme=yoklama`),
    },
    {
      key: "kadro",
      label: "Maç kadrosu",
      state: !lineup.length ? "todo" : starters >= MAX_STARTERS ? "done" : "warn",
      detail: plan.isLoading
        ? "…"
        : lineup.length
          ? `${starters} ilk · ${bench} yedek${plan.data?.plan?.formation ? ` · ${plan.data.plan.formation}` : ""}`
          : "Girilmedi",
      onPress: () => go(`${base}?sekme=kadro`),
    },
  ];
  const progress = prepProgress(steps);
  steps.push({
    key: "analiz",
    label: "Rakip analizi",
    state: "todo",
    detail: lineup.length ? "Taktikleri karşılaştır" : "Önce kadro",
    onPress: () => go(`${base}?sekme=analiz`),
  });

  const countdown = daysUntil(match.date);
  const progressTone = progress >= 100 ? "win" : progress >= 50 ? "brand" : "warn";
  const homeName = match.is_home ? teamName : (match.opponent_name ?? "Rakip");
  const awayName = match.is_home ? (match.opponent_name ?? "Rakip") : teamName;

  return (
    <PanelCard style={styles.card}>
      <View style={styles.head}>
        <Badge label={match.is_home ? "EV SAHİBİ" : "DEPLASMAN"} tone={match.is_home ? "brand" : "info"} size="xs" />
        {countdown ? <Badge label={upperTR(countdown)} tone="live" size="xs" icon="time-outline" /> : null}
      </View>

      <View style={styles.versus}>
        <Side name={homeName} logo={match.is_home ? teamLogo : null} />
        <Text style={styles.vs} {...textScale.badge}>
          VS
        </Text>
        <Side name={awayName} logo={match.is_home ? null : teamLogo} />
      </View>
      <View style={styles.when}>
        <Ionicons name="calendar-outline" size={13} color={colors.textTertiary} />
        <Text style={styles.whenText} numberOfLines={1} {...textScale.dense}>
          {[matchWhen(match.date, match.time), match.match_field].filter(Boolean).join(" · ")}
        </Text>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.flex}>
          <ThinProgress value={progress} tone={progressTone} />
        </View>
        <Text style={[styles.progressText, { color: toneColors(progressTone).fg }]} {...textScale.dense}>
          %{progress} hazır
        </Text>
      </View>

      <PrepChecklist steps={steps} />

      <View style={styles.actions}>
        <Button
          label={lineup.length ? "Kadroyu düzenle" : "Kadroyu kur"}
          icon="people-outline"
          size="sm"
          onPress={() => go(`${base}?sekme=kadro`)}
          style={styles.flex}
        />
        <Button label="Maç sayfası" size="sm" variant="secondary" onPress={() => go(`/mac/${match.id}`)} style={styles.flex} />
      </View>
    </PanelCard>
  );
}

function Side({ name, logo }: { name: string; logo: string | null }) {
  return (
    <View style={styles.side}>
      <TeamLogo name={name} logo={logo} size={40} />
      <Text style={styles.sideName} numberOfLines={2} {...textScale.dense}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  versus: { flexDirection: "row", alignItems: "center", gap: space.sm },
  side: { flex: 1, alignItems: "center", gap: space.xs },
  sideName: { ...type.h4, color: colors.textPrimary, textAlign: "center" },
  vs: {
    ...type.labelXs,
    color: colors.textTertiary,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  when: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs },
  whenText: { ...type.caption, color: colors.textTertiary },
  progressRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  progressText: { ...type.labelXs },
  actions: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
});
