/**
 * SIRADAKİ MAÇ + HAZIRLIK — başkanın "maça hazır mıyız?" kartı.
 *
 * İKİ KAT, TEK KART:
 *   1. MAÇ ŞERİDİ — ev/deplasman ve geri sayım hapları; iki arma yan yana,
 *      ortada başlama saati (Archivo, iri) ve gün; altında saha.
 *   2. HAZIRLIK — imza degradeli ilerleme çubuğu (%), üç adım satırı:
 *        Yoklama — sıradaki maçın yoklama dağılımı (geliyor ≥ ilk 8 → tamam)
 *        Maç kadrosu — kayıtlı maç planı (ilk 8 dolu → tamam, eksik → uyarı)
 *        Rakip analizi — kadro kayıtlıysa senaryo karşılaştırması
 *      Her satır maç ekranının ilgili sekmesini açar. Altta iki eylem.
 * Plan sorgusunun anahtarı maç ekranıyla AYNIDIR (["takim","match-plan",id]):
 * kadro kaydedilince bu kart da kendiliğinden güncellenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { daysUntil } from "@/components/club/NextMatchCard";
import { PanelEmpty, prepProgress, type PrepStep } from "@/components/club/Panel";
import type { ClubSignals } from "@/components/club/useClubSignals";
import { ListCard, ToneRow } from "@/components/team/ClubKit";
import { Badge, Button, GradientBar, Odometer, Skeleton, TeamLogo } from "@/components/ui";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { MAX_STARTERS, getTeamMatchPlan } from "@/lib/api/team";
import { formatDateLong, formatTime, mediaUrl } from "@/lib/format";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

const STEP_LOOK = {
  done: { icon: "checkmark-circle", tone: "mint", color: colors.win },
  warn: { icon: "alert-circle", tone: "gold", color: colors.warn },
  todo: { icon: "ellipse-outline", tone: "neutral", color: colors.textTertiary },
} as const;

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
  /* Maç kaydı rakibin armasını taşımaz; il takım listesinden (ortak önbellek) çözülür. */
  const logos = useTeamLogos();

  const plan = useQuery({
    queryKey: ["takim", "match-plan", matchId],
    queryFn: () => getTeamMatchPlan(matchId),
    enabled: matchId > 0,
    staleTime: 60_000,
    retry: false,
  });

  if (teamMatches.isLoading) {
    return (
      <View style={styles.skeleton}>
        <Skeleton height={118} radius="xl" />
        <Skeleton height={150} radius="xl" />
      </View>
    );
  }

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
  const homeName = match.is_home ? teamName : (match.opponent_name ?? "Rakip");
  const awayName = match.is_home ? (match.opponent_name ?? "Rakip") : teamName;
  const opponentLogo = mediaUrl(logos.logoFor(match.opponent_team_id, match.opponent_name));
  const clock = match.time ? formatTime(match.time) : null;
  const ready = progress >= 100;

  return (
    <View style={styles.stack}>
      <ListCard style={styles.matchCard}>
        <View style={styles.head}>
          <Badge label={match.is_home ? "EV SAHİBİ" : "DEPLASMAN"} tone={match.is_home ? "brand" : "info"} size="xs" />
          {countdown ? <Badge label={upperTR(countdown)} tone="live" variant="solid" size="xs" icon="time-outline" /> : null}
        </View>

        <View style={styles.versus}>
          <Side name={homeName} logo={match.is_home ? teamLogo : opponentLogo} own={match.is_home} />
          <View style={styles.center}>
            {clock ? (
              <Odometer value={clock} style={styles.clock} />
            ) : (
              <Text style={styles.vs} {...textScale.badge}>
                VS
              </Text>
            )}
            <Text style={styles.date} numberOfLines={2} {...textScale.dense}>
              {formatDateLong(match.date)}
            </Text>
          </View>
          <Side name={awayName} logo={match.is_home ? opponentLogo : teamLogo} own={!match.is_home} />
        </View>

        {match.match_field ? (
          <View style={styles.venue}>
            <Ionicons name="location-outline" size={13} color={colors.textTertiary} />
            <Text style={styles.venueText} numberOfLines={1} {...textScale.dense}>
              {match.match_field}
            </Text>
          </View>
        ) : null}
      </ListCard>

      <ListCard>
        <View style={styles.progress}>
          <View style={styles.progressHead}>
            <Text style={styles.progressLabel} {...textScale.badge}>
              MAÇ HAZIRLIĞI
            </Text>
            <Text style={[styles.progressValue, { color: ready ? colors.win : colors.textPrimary }]} {...textScale.badge}>
              {`%${progress}`}
            </Text>
          </View>
          <GradientBar value={progress / 100} height={8} />
        </View>
        {steps.map((step, index) => {
          const look = STEP_LOOK[step.state];
          return (
            <ToneRow
              key={step.key}
              icon={look.icon}
              tone={look.tone}
              title={step.label}
              meta={step.detail}
              stripe={step.state === "warn" ? colors.warn : undefined}
              onPress={step.onPress}
              last={index === steps.length - 1}
            />
          );
        })}
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
      </ListCard>
    </View>
  );
}

function Side({ name, logo, own }: { name: string; logo: string | null; own: boolean }) {
  return (
    <View style={styles.side}>
      <View style={[styles.crest, own && styles.crestOwn]}>
        <TeamLogo name={name} logo={logo} size={44} />
      </View>
      <Text style={[styles.sideName, own && styles.sideOwn]} numberOfLines={2} {...textScale.dense}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  skeleton: { gap: space.sm },
  matchCard: { padding: space.lg, gap: space.md },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  versus: { flexDirection: "row", alignItems: "center", gap: space.sm },
  side: { flex: 1, alignItems: "center", gap: space.s },
  crest: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  crestOwn: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  sideName: { ...type.h4, color: colors.textSecondary, textAlign: "center" },
  sideOwn: { color: colors.textPrimary },
  center: { alignItems: "center", gap: space.xxs, minWidth: 92 },
  clock: { ...type.scoreLg, color: colors.textPrimary },
  vs: { ...type.h2, color: colors.textTertiary },
  date: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
  venue: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  venueText: { ...type.caption, color: colors.textTertiary },
  progress: { padding: space.md, paddingBottom: space.sm, gap: space.sm },
  progressHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  progressLabel: { ...type.overline, color: colors.textTertiary },
  progressValue: { ...type.scoreSm },
  actions: { flexDirection: "row", gap: space.sm, padding: space.md, borderTopWidth: hairline, borderTopColor: colors.separator },
  flex: { flex: 1 },
});
