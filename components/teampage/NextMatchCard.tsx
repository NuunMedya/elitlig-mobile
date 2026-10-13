/**
 * SIRADAKİ MAÇ — Genel sekmesinin açılış kartı.
 *
 * Bir takım sayfasına gelen kullanıcının ilk sorusu "ne zaman oynuyorlar?"dır;
 * kart bu yüzden sekmenin en üstünde ve sayfanın en zengin kartıdır:
 *
 *   FREELİG                                     DEPLASMAN
 *   [arma]          21:30             [arma]
 *   ANSA YAPI     12 Eki Paz       CAPITAL FC
 *   ┌ 2 GÜN ┐ ┌ 05 SAAT ┐ ┌ 31 DK ┐
 *   ⌖ OSTİM HALISAHA 1                  📅 Takvime ekle
 *
 * ÜÇ DURUM: zamanlanmış (geri sayım), canlı (CANLI rozeti + skor), sonucu
 * bekleniyor (saati geçmiş, skor girilmemiş — geri sayım YOK; eskiden bu
 * maç için "Başlamak üzere" yazıyordu).
 *
 * GERİ SAYIM kendi küçük bileşeninde tıklar; saniyede bir bütün ekranı değil
 * yalnız o üç kutuyu yeniler.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Badge, Card, LiveBadge, TeamLogo, Touchable, matchDayLabel } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";
import { matchTime, type LogoFor } from "./model";

const CREST = 48;

const pad = (value: number) => String(value).padStart(2, "0");

interface Unit {
  value: string;
  label: string;
}

/** Kalan süreyi üç birime böler; bir günden azsa saniye görünür. */
function unitsFor(diff: number): Unit[] {
  const total = Math.max(0, Math.floor(diff / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return days > 0
    ? [
        { value: String(days), label: "GÜN" },
        { value: pad(hours), label: "SAAT" },
        { value: pad(minutes), label: "DK" },
      ]
    : [
        { value: pad(hours), label: "SAAT" },
        { value: pad(minutes), label: "DK" },
        { value: pad(seconds), label: "SN" },
      ];
}

const Countdown = React.memo(function Countdown({ targetMs }: { targetMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  // Bir günden uzaksa dakikada bir, yakınsa saniyede bir tıklar; uzak maçta
  // saniyelik render israfı olmasın diye eşik geçildiğinde etki yeniden kurulur.
  const fine = targetMs - now < 86_400_000;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), fine ? 1000 : 60_000);
    return () => clearInterval(timer);
  }, [fine, targetMs]);

  const diff = targetMs - now;
  if (diff <= 0) {
    return (
      <View style={styles.countdownSoon}>
        <Text style={styles.soonText} {...textScale.dense}>
          Başlamak üzere
        </Text>
      </View>
    );
  }

  const units = unitsFor(diff);
  return (
    <View
      style={styles.countdown}
      accessible
      accessibilityLabel={`Maça kalan: ${units.map((unit) => `${unit.value} ${unit.label.toLocaleLowerCase("tr-TR")}`).join(" ")}`}
    >
      {units.map((unit) => (
        <View key={unit.label} style={styles.unit}>
          <Text style={styles.unitValue} {...textScale.badge}>
            {unit.value}
          </Text>
          <Text style={styles.unitLabel} {...textScale.badge}>
            {unit.label}
          </Text>
        </View>
      ))}
    </View>
  );
});

export interface NextMatchCardProps {
  match: ApiMatch;
  teamId: number;
  teamName: string;
  logoFor: LogoFor;
  onOpen: (matchId: number) => void;
  onAddCalendar: (match: ApiMatch) => void;
  style?: StyleProp<ViewStyle>;
}

export const NextMatchCard = React.memo(function NextMatchCard({
  match,
  teamId,
  teamName,
  logoFor,
  onOpen,
  onAddCalendar,
  style,
}: NextMatchCardProps) {
  const handleOpen = useCallback(() => onOpen(Number(match.id)), [onOpen, match.id]);
  const handleCalendar = useCallback(() => onAddCalendar(match), [onAddCalendar, match]);

  const state = matchState(match);
  const live = state === "live";
  const target = matchTime(match);
  const awaiting = !live && Number.isFinite(target) && Date.now() - target > 2 * 3_600_000;
  const home = Number(match.home_team_id) === teamId || match.first_team_name === teamName;
  const time = formatTime(match.time);
  const day = matchDayLabel(match.date);

  return (
    <Card padding="lg" onPress={handleOpen} style={style} contentStyle={styles.card}>
      <View style={styles.head}>
        <Text style={styles.league} numberOfLines={1} {...textScale.badge}>
          {upperTR(match.league_name || "Maç")}
        </Text>
        <Badge label={home ? "İÇ SAHA" : "DEPLASMAN"} tone="neutral" size="xs" />
      </View>

      <View style={styles.teams}>
        <TeamSide
          name={match.first_team_name}
          logo={logoFor(match.home_team_id, match.first_team_name)}
          focus={home}
        />
        <View style={styles.center}>
          {live ? (
            <>
              <LiveBadge />
              <Text style={styles.score} {...textScale.badge}>
                {match.first_team_score ?? 0}–{match.second_team_score ?? 0}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.kickoff} {...textScale.badge}>
                {time || "—"}
              </Text>
              <Text style={styles.day} numberOfLines={1} {...textScale.dense}>
                {day}
              </Text>
            </>
          )}
        </View>
        <TeamSide
          name={match.second_team_name}
          logo={logoFor(match.away_team_id, match.second_team_name)}
          focus={!home}
        />
      </View>

      {live ? null : awaiting ? (
        <View style={styles.awaiting}>
          <Ionicons name="hourglass-outline" size={14} color={colors.warn} />
          <Text style={styles.awaitingText} {...textScale.dense}>
            Maç oynandı, sonucu henüz girilmedi
          </Text>
        </View>
      ) : Number.isFinite(target) ? (
        <Countdown targetMs={target} />
      ) : null}

      <View style={styles.foot}>
        <View style={styles.venue}>
          {match.match_field ? (
            <>
              <Ionicons name="location-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.venueText} numberOfLines={1} {...textScale.dense}>
                {match.match_field}
              </Text>
            </>
          ) : null}
        </View>
        {live || awaiting ? null : (
          <Touchable
            onPress={handleCalendar}
            feedback="icon"
            haptic="light"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Maçı takvime ekle"
            style={styles.calendar}
          >
            <Ionicons name="calendar-outline" size={15} color={colors.brandAccent} />
            <Text style={styles.calendarText} {...textScale.dense}>
              Takvime ekle
            </Text>
          </Touchable>
        )}
      </View>
    </Card>
  );
});

const TeamSide = React.memo(function TeamSide({
  name,
  logo,
  focus,
}: {
  name: string;
  logo: string | null;
  /** Bu sayfanın takımı mı — adı tam mürekkep, rakip ikincil. */
  focus: boolean;
}) {
  return (
    <View style={styles.side}>
      <TeamLogo name={name} logo={logo} size={CREST} />
      <Text
        style={[styles.sideName, focus ? null : styles.sideNameMuted]}
        numberOfLines={2}
        {...textScale.dense}
      >
        {name}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: space.lg,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  league: {
    ...type.overline,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  teams: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  side: {
    flex: 1,
    alignItems: "center",
    gap: space.sm,
  },
  sideName: {
    ...type.h4,
    color: colors.textPrimary,
    textAlign: "center",
  },
  sideNameMuted: {
    color: colors.textSecondary,
  },
  center: {
    width: 104,
    alignItems: "center",
    justifyContent: "center",
    minHeight: CREST,
    gap: space.xxs,
  },
  kickoff: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  day: {
    ...type.caption,
    color: colors.textTertiary,
  },
  score: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },

  countdown: {
    flexDirection: "row",
    gap: space.sm,
  },
  unit: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    gap: 1,
  },
  unitValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  unitLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  countdownSoon: {
    alignItems: "center",
    paddingVertical: space.m,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
  },
  soonText: {
    ...type.label,
    color: colors.brandAccent,
  },
  awaiting: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    paddingVertical: space.m,
    borderRadius: radius.md,
    backgroundColor: colors.warnDim,
  },
  awaitingText: {
    ...type.label,
    color: colors.warn,
  },

  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: -space.xs,
  },
  venue: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  venueText: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  calendar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 28,
  },
  calendarText: {
    ...type.label,
    color: colors.brandAccent,
  },
});
