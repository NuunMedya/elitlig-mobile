/**
 * TAKIM KİMLİĞİ — sahne başlığının `hero` yuvasında.
 *
 * KENDİ YÜZEYİ YOK: `ScreenHeader`ın aurora sahnesinin üstünde çizilir;
 * kaydırınca kapanması, adın başlık satırına gelmesi başlığın işidir.
 *
 * İKİNCİ TUR KURGUSU (yukarıdan aşağı):
 *   1. Kimlik — degrade halkalı, parlayan büyük arma; lig · sezon hapı, ad,
 *      şehir · takipçi.
 *   2. Metrik şeridi — SIRA · PUAN · AVERAJ · KADRO dört cam karoda, rakamlar
 *      `Odometer` ile döner. Sıra karosu imza çizgisiyle vurgulanır ve ilk
 *      üçte madalya renginde yazılır; averaj işaretine göre nane/kırmızı.
 *   3. Form — iri kapsüller (en yeni geniş ve parlak) + G/B/M karnesi.
 *   4. Eylemler — takip / bildirim / karşılaştır (çağıran verir).
 *
 * Değeri olmayan sayı HİÇ çizilmez: kapsam takımın ligini tutmuyorsa sıra ve
 * puan yoktur, şerit kalan karolarla kurulur. Uydurma yok.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Reveal, TeamLogo } from "@/components/ui";
import { colors, dark, hairline, layout, radius, space, textScale, type } from "@/theme";
import { signed } from "./model";
import { FormCapsules, HaloFrame, StageStat } from "./ProfileKit";

/** Kimlik arması — sahnenin tek büyük görseli. */
const CREST = 72;

export interface TeamHeroProps {
  teamName: string;
  logo: string | null;
  city: string | null;
  league: string | null;
  season: string | null;
  followers: number | null;
  rank: number | null;
  points: number | null;
  goalDiff: number | null;
  squadCount: number | null;
  form: string;
  /** Kapsamdaki sezon karnesi; puan durumunda satır yoksa null. */
  record: { played: number; wins: number; draws: number; losses: number } | null;
  actions?: React.ReactNode;
}

/** Sahne iki temada da koyu: sonuç renkleri koyu temanın açık tonundan. */
const STAGE_WIN = dark.win;
const STAGE_DRAW = dark.draw;
const STAGE_LOSS = dark.loss;

function rankColor(rank: number): string | undefined {
  if (rank === 1) return colors.medalGold[0];
  if (rank === 2) return colors.medalSilver[0];
  if (rank === 3) return colors.medalBronze[0];
  return undefined;
}

export const TeamHero = React.memo(function TeamHero({
  teamName,
  logo,
  city,
  league,
  season,
  followers,
  rank,
  points,
  goalDiff,
  squadCount,
  form,
  record,
  actions,
}: TeamHeroProps) {
  const kicker = [league, season].filter(Boolean).join(" · ");
  const hasStats = rank != null || points != null || goalDiff != null || squadCount != null;

  return (
    <View style={styles.identity}>
      <View style={styles.top}>
        <Reveal scaleFrom={0.86} distance={0}>
          <HaloFrame size={CREST} shape="rounded" thickness={2} gap={4}>
            <TeamLogo name={teamName} logo={logo} size={CREST} plain onDark />
          </HaloFrame>
        </Reveal>
        <View style={styles.body}>
          {kicker ? (
            <View style={styles.kickerPill}>
              <Ionicons name="trophy" size={10} color={colors.brandOnDark} />
              <Text style={styles.kicker} numberOfLines={1} {...textScale.badge}>
                {kicker.toLocaleUpperCase("tr-TR")}
              </Text>
            </View>
          ) : null}
          <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
            {teamName}
          </Text>
          {city || followers != null ? (
            <View style={styles.metaRow}>
              {city ? (
                <View style={styles.metaItem}>
                  <Ionicons name="location" size={12} color={colors.onDarkMuted} />
                  <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                    {city}
                  </Text>
                </View>
              ) : null}
              {city && followers != null ? <View style={styles.metaDot} /> : null}
              {followers != null ? (
                <View style={styles.metaItem}>
                  <Ionicons name="people" size={12} color={colors.onDarkMuted} />
                  <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                    <Text style={styles.metaStrong}>{followers}</Text> takipçi
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {hasStats ? (
        <View style={styles.strip}>
          {rank != null ? (
            <StageStat value={rank} suffix="." label="SIRA" icon="podium" color={rankColor(rank)} highlight />
          ) : null}
          {points != null ? <StageStat value={points} label="PUAN" icon="star" /> : null}
          {goalDiff != null ? (
            <StageStat
              value={signed(goalDiff)}
              label="AVERAJ"
              icon="swap-vertical"
              color={goalDiff > 0 ? STAGE_WIN : goalDiff < 0 ? STAGE_LOSS : undefined}
            />
          ) : null}
          {squadCount != null ? <StageStat value={squadCount} label="KADRO" icon="people" /> : null}
        </View>
      ) : null}

      {form || (record && record.played > 0) ? (
        <View style={styles.formRow}>
          {form ? (
            <View style={styles.formLeft}>
              <Text style={styles.formLabel} {...textScale.badge}>
                FORM
              </Text>
              <FormCapsules form={form} />
            </View>
          ) : null}
          {record && record.played > 0 ? (
            <View
              style={styles.record}
              accessible
              accessibilityLabel={`${record.played} maç, ${record.wins} galibiyet, ${record.draws} beraberlik, ${record.losses} mağlubiyet`}
            >
              <RecordBit value={record.wins} letter="G" color={STAGE_WIN} />
              <RecordBit value={record.draws} letter="B" color={STAGE_DRAW} />
              <RecordBit value={record.losses} letter="M" color={STAGE_LOSS} />
            </View>
          ) : null}
        </View>
      ) : null}

      {actions}
    </View>
  );
});

function RecordBit({ value, letter, color }: { value: number; letter: string; color: string }) {
  return (
    <View style={styles.recordBit}>
      <View style={[styles.recordDot, { backgroundColor: color }]} />
      <Text style={styles.recordValue} {...textScale.badge}>
        {value}
        <Text style={styles.recordLetter}>{letter}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xs,
    paddingBottom: space.md,
    gap: space.md,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
  },
  body: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    gap: space.xs,
  },
  kickerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    maxWidth: "100%",
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  kicker: {
    ...type.overline,
    color: colors.brandOnDark,
    flexShrink: 1,
  },
  name: {
    ...type.display,
    color: colors.onDark,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: space.sm,
    rowGap: space.xxs,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.onDarkMuted,
  },
  meta: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
  metaStrong: {
    color: colors.onDark,
  },

  strip: {
    flexDirection: "row",
    gap: space.sm,
  },

  formRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  formLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  formLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  record: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  recordBit: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  recordDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  recordValue: {
    ...type.numSmStrong,
    color: colors.onDark,
  },
  recordLetter: {
    ...type.numSm,
    color: colors.onDarkMuted,
  },
});
