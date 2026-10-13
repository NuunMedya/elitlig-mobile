/**
 * TAKIM KİMLİĞİ — sahne başlığının `hero` yuvasında.
 *
 * KENDİ YÜZEYİ YOK: `ScreenHeader`ın grafit sahnesinin üstünde çizilir;
 * kaydırınca kapanması, adın başlık satırına gelmesi başlığın işidir.
 *
 * OKUMA SIRASI (yukarıdan aşağı, en önemliden en aza):
 *   1. Arma + ad — "neredeyim?"
 *   2. Bağlam — lig · sezon (üst etiket), şehir · takipçi (alt satır)
 *   3. Skor şeridi — SIRA · PUAN · AVERAJ · KADRO; tek camda, ince
 *      ayraçlarla. Eskiden dört ayrı kutuydu ve sahnede dört düğme gibi
 *      duruyordu; sayılar dokunulmaz, yalnız okunur — tek bant bunu söyler.
 *   4. Form — son 5 + sezon karnesi (22G 3B 2M)
 *   5. Eylemler — takip / bildirim / karşılaştır
 *
 * Değeri olmayan sayı HİÇ çizilmez: kapsam takımın ligini tutmuyorsa sıra ve
 * puan yoktur, şerit kalan hücrelerle kurulur. Uydurma yok.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { FormChips, TeamLogo } from "@/components/ui";
import { colors, layout, radius, space, textScale, type } from "@/theme";
import { signed } from "./model";

/** Kimlik arması — `crestXl` (52) sahnede küçük kalıyordu; ad iki satıra
    kırıldığında arma adın yanında bir simge gibi duruyordu. */
const CREST = 64;

interface Fact {
  key: string;
  value: string;
  label: string;
}

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

  const facts: Fact[] = [];
  if (rank != null) facts.push({ key: "rank", value: `${rank}.`, label: "SIRA" });
  if (points != null) facts.push({ key: "points", value: String(points), label: "PUAN" });
  if (goalDiff != null) facts.push({ key: "diff", value: signed(goalDiff), label: "AVERAJ" });
  if (squadCount != null) facts.push({ key: "squad", value: String(squadCount), label: "KADRO" });

  return (
    <View style={styles.identity}>
      <View style={styles.top}>
        <TeamLogo name={teamName} logo={logo} size={CREST} />
        <View style={styles.body}>
          {kicker ? (
            <Text style={styles.kicker} numberOfLines={1} {...textScale.badge}>
              {kicker.toLocaleUpperCase("tr-TR")}
            </Text>
          ) : null}
          <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
            {teamName}
          </Text>
          {city || followers != null ? (
            <View style={styles.metaRow}>
              {city ? (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={12} color={colors.onDarkMuted} />
                  <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                    {city}
                  </Text>
                </View>
              ) : null}
              {followers != null ? (
                <View style={styles.metaItem}>
                  <Ionicons name="people-outline" size={12} color={colors.onDarkMuted} />
                  <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                    {followers} takipçi
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {facts.length ? (
        <View style={styles.strip}>
          {facts.map((fact, index) => (
            <View
              key={fact.key}
              style={[styles.fact, index > 0 ? styles.factDivided : null]}
              accessible
              accessibilityLabel={`${fact.label.toLocaleLowerCase("tr-TR")} ${fact.value}`}
            >
              <Text style={styles.factValue} numberOfLines={1} {...textScale.dense}>
                {fact.value}
              </Text>
              <Text style={styles.factLabel} numberOfLines={1} {...textScale.badge}>
                {fact.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {form || record ? (
        <View style={styles.formRow}>
          {form ? (
            <>
              <Text style={styles.formLabel} {...textScale.badge}>
                FORM
              </Text>
              <FormChips form={form} size="sm" />
            </>
          ) : null}
          {record && record.played > 0 ? (
            <Text
              style={styles.record}
              numberOfLines={1}
              accessibilityLabel={`${record.played} maç, ${record.wins} galibiyet, ${record.draws} beraberlik, ${record.losses} mağlubiyet`}
              {...textScale.dense}
            >
              {record.played} maç · {record.wins}G {record.draws}B {record.losses}M
            </Text>
          ) : null}
        </View>
      ) : null}

      {actions}
    </View>
  );
});

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
    gap: space.md,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  kicker: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  /* Sahnedeki ad sayfanın en yüksek sesi: `display` (22) Archivo. */
  name: {
    ...type.display,
    color: colors.onDark,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: space.md,
    rowGap: space.xxs,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  meta: {
    ...type.caption,
    color: colors.onDarkMuted,
  },

  /* — Skor şeridi: tek cam, ince ayraçlar — */
  strip: {
    flexDirection: "row",
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.inkTileBorder,
    paddingVertical: space.m,
  },
  fact: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  factDivided: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.borderOnDark,
  },
  factValue: {
    ...type.metricSm,
    color: colors.onDark,
  },
  factLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },

  formRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  formLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  record: {
    ...type.caption,
    color: colors.onDarkMuted,
    marginLeft: "auto",
    flexShrink: 1,
  },
});
