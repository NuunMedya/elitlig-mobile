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
 * İKİNCİ TUR: kart bir "maç bileti"dir — koyu mürekkep zemin + aurora
 * ışığı, iri armalar, ortada dev saat; geri sayım kutuları cam karolarda
 * `Odometer` ile döner. Canlı maçta kenarda `GlowRim` dolaşır.
 *
 * GERİ SAYIM kendi küçük bileşeninde tıklar; saniyede bir bütün ekranı değil
 * yalnız o üç kutuyu yeniler.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Aurora, GlowRim, LiveBadge, Odometer, TeamLogo, Touchable, matchDayLabel } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";
import { colors, dark, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { matchTime, type LogoFor } from "./model";

const CREST = 56;
/* Yüzey gradyanı yatay, sağdan sola (bkz. scripts/check-tokens.mjs). */
const INK_START = { x: 1, y: 0.5 };
const INK_END = { x: 0, y: 0.5 };

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
      <View style={styles.notice}>
        <Ionicons name="flash" size={14} color={colors.brandOnDark} />
        <Text style={styles.noticeText} {...textScale.dense}>
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
      {units.map((unit, index) => (
        <React.Fragment key={unit.label}>
          {index > 0 ? (
            <Text style={styles.colon} {...textScale.badge}>
              :
            </Text>
          ) : null}
          <View style={styles.unit}>
            <Odometer value={unit.value} style={styles.unitValue} />
            <Text style={styles.unitLabel} {...textScale.badge}>
              {unit.label}
            </Text>
          </View>
        </React.Fragment>
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
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handleOpen}
      accessibilityRole="button"
      accessibilityLabel={`${match.first_team_name} – ${match.second_team_name}, ${day} ${time}`}
      style={[styles.ticket, style]}
    >
      <View style={styles.clip}>
        <LinearGradient colors={colors.gradientInk} start={INK_START} end={INK_END} style={StyleSheet.absoluteFill} />
        <Aurora variant="stage" style={StyleSheet.absoluteFill} />
      </View>
      {live ? <GlowRim radius={radius.xxl} /> : null}

      <View style={styles.content}>
        <View style={styles.head}>
          <View style={styles.leaguePill}>
            <Ionicons name="trophy" size={10} color={colors.brandOnDark} />
            <Text style={styles.league} numberOfLines={1} {...textScale.badge}>
              {upperTR(match.league_name || "Maç")}
            </Text>
          </View>
          <View style={[styles.sidePill, home ? styles.sidePillHome : null]}>
            <Ionicons name={home ? "home" : "airplane"} size={10} color={colors.onDark} />
            <Text style={styles.sidePillText} {...textScale.badge}>
              {home ? "İÇ SAHA" : "DEPLASMAN"}
            </Text>
          </View>
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
                <Text style={styles.kickoff} {...textScale.badge}>
                  {match.first_team_score ?? 0}–{match.second_team_score ?? 0}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.kickoff} {...textScale.badge}>
                  {time || "—"}
                </Text>
                <View style={styles.dayPill}>
                  <Text style={styles.day} numberOfLines={1} {...textScale.dense}>
                    {day}
                  </Text>
                </View>
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
          <View style={[styles.notice, styles.noticeWarn]}>
            <Ionicons name="hourglass" size={14} color={dark.warn} />
            <Text style={[styles.noticeText, { color: dark.warn }]} {...textScale.dense}>
              Maç oynandı, sonucu henüz girilmedi
            </Text>
          </View>
        ) : Number.isFinite(target) ? (
          <Countdown targetMs={target} />
        ) : null}

        <View style={styles.perforation} />

        <View style={styles.foot}>
          <View style={styles.venue}>
            {match.match_field ? (
              <>
                <Ionicons name="location" size={13} color={colors.onDarkMuted} />
                <Text style={styles.venueText} numberOfLines={1} {...textScale.dense}>
                  {match.match_field}
                </Text>
              </>
            ) : null}
          </View>
          {live || awaiting ? (
            <View style={styles.openHint}>
              <Text style={styles.openHintText} {...textScale.dense}>
                Maça git
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.onDarkMuted} />
            </View>
          ) : (
            <Touchable
              onPress={handleCalendar}
              feedback="chip"
              haptic="light"
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Maçı takvime ekle"
              style={styles.calendar}
            >
              <Ionicons name="calendar" size={13} color={colors.onDark} />
              <Text style={styles.calendarText} {...textScale.dense}>
                Takvime ekle
              </Text>
            </Touchable>
          )}
        </View>
      </View>
    </Touchable>
  );
});

const TeamSide = React.memo(function TeamSide({
  name,
  logo,
  focus,
}: {
  name: string;
  logo: string | null;
  /** Bu sayfanın takımı mı — adı tam beyaz ve altında imza çizgisi. */
  focus: boolean;
}) {
  return (
    <View style={styles.side}>
      <View style={[styles.crestWrap, focus ? styles.crestFocus : null]}>
        <TeamLogo name={name} logo={logo} size={CREST} plain onDark />
      </View>
      <Text style={[styles.sideName, focus ? null : styles.sideNameMuted]} numberOfLines={2} {...textScale.dense}>
        {name}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  ticket: {
    borderRadius: radius.xxl,
  },
  clip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.xxl,
    overflow: "hidden",
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  content: {
    padding: space.lg,
    gap: space.lg,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  leaguePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 1,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  league: {
    ...type.overline,
    color: colors.brandOnDark,
    flexShrink: 1,
  },
  sidePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
  },
  sidePillHome: {
    backgroundColor: colors.inkPill,
  },
  sidePillText: {
    ...type.overline,
    color: colors.onDark,
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
  crestWrap: {
    padding: space.s,
    borderRadius: radius.xl,
    backgroundColor: colors.inkTile,
  },
  crestFocus: {
    backgroundColor: colors.inkPill,
    borderWidth: 1,
    borderColor: colors.inkPillBorder,
  },
  sideName: {
    ...type.h4,
    color: colors.onDark,
    textAlign: "center",
  },
  sideNameMuted: {
    color: colors.onDarkMuted,
  },
  center: {
    width: 100,
    alignItems: "center",
    justifyContent: "center",
    minHeight: CREST + space.s * 2,
    gap: space.xs,
  },
  kickoff: {
    ...type.scoreLg,
    color: colors.onDark,
  },
  dayPill: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
  },
  day: {
    ...type.caption,
    color: colors.onDark,
  },

  countdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  colon: {
    ...type.metricSm,
    color: colors.onDarkMuted,
  },
  unit: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    gap: 1,
  },
  unitValue: {
    ...type.metric,
    color: colors.onDark,
  },
  unitLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    paddingVertical: space.m,
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  noticeWarn: {
    borderColor: colors.inkPillBorder,
  },
  noticeText: {
    ...type.label,
    color: colors.brandOnDark,
  },

  /* Bilet koçanı: kesik çizgi. */
  perforation: {
    height: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.inkPillBorder,
    marginHorizontal: -space.xs,
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
    color: colors.onDarkMuted,
    flexShrink: 1,
  },
  calendar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  calendarText: {
    ...type.labelSm,
    color: colors.onDark,
  },
  openHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  openHintText: {
    ...type.labelSm,
    color: colors.onDarkMuted,
  },
});
