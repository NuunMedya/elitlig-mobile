/**
 * KULÜP KİMLİK SAHNESİ — Kulübüm'ün ilk bakışı: "biz kimiz, nerdeyiz?"
 *
 * Koyu mor sahne (gradientInk + Aurora "stage"), üç kat:
 *   1. Haplar: rol (BAŞKAN) · lig; sağda kimlik düzenleme cam düğmesi.
 *   2. Kimlik: arma (cam kutuda, mor parıltı) + takım adı + sezon/şehir.
 *   3. Rakamlar: SIRA · PUAN · AVERAJ · KADRO cam şeridi — sayılar Odometer
 *      ile döner; altında galibiyet/beraberlik/mağlubiyet oran çubuğu ve son
 *      beş maçın formu.
 * Kartın tamamı takım sayfasını açar.
 *
 * RAKAMLAR UYDURULMAZ: sıra önce kapsam puan durumundan (useClubSignals),
 * yoksa panel özetinden (`/api/panel/me/overview` → standings) gelir; ikisi
 * de yoksa hücre çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { InkStage, SplitBar, StagePill, StageStats, type StageStat } from "@/components/team/ClubKit";
import { FormChips, TeamLogo, Touchable, type FormResult } from "@/components/ui";
import { colors, glowStyle, hairline, radius, space, textScale, type, upperTR } from "@/theme";

export interface HeroFact {
  label: string;
  value: string;
  /** Odometer'ın yanında küçük ek ("/14"). */
  suffix?: string;
  tone?: "win" | "danger" | "neutral";
  onPress?: () => void;
}

export interface HeroRecord {
  wins: number;
  draws: number;
  losses: number;
}

export interface ClubHeroProps {
  name: string;
  logo: string | null;
  role: string;
  /** Lig adı (hap). */
  league?: string | null;
  /** Sezon · şehir satırı. */
  context: string | null;
  facts: HeroFact[];
  /** "WWDLW" ya da ["W","D"] — eskiden yeniye. */
  form: string | string[] | null;
  record: HeroRecord | null;
  onOpen: () => void;
  onEdit: () => void;
}

const FACT_COLOR = { win: colors.win, danger: colors.liveOnDark, neutral: undefined } as const;

export const ClubHero = React.memo(function ClubHero({
  name,
  logo,
  role,
  league,
  context,
  facts,
  form,
  record,
  onOpen,
  onEdit,
}: ClubHeroProps) {
  const formValue = (Array.isArray(form) ? form : (form ?? "").split("")).filter((item) => /^[WDL]$/.test(item)) as FormResult[];
  const stats: StageStat[] = facts.map((fact) => ({
    key: fact.label,
    label: fact.label,
    value: fact.value,
    suffix: fact.suffix,
    color: FACT_COLOR[fact.tone ?? "neutral"],
    onPress: fact.onPress,
  }));
  const played = record ? record.wins + record.draws + record.losses : 0;

  return (
    <InkStage onPress={onOpen} accessibilityLabel={`${name} takım sayfası`}>
      <View style={styles.pills}>
        <StagePill label={role} icon="shield-checkmark" />
        {league ? <StagePill label={league} icon="trophy-outline" tone="muted" /> : null}
        <View style={styles.flex} />
        <Touchable onPress={onEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel="Takım bilgilerini düzenle" style={styles.edit}>
          <Ionicons name="create-outline" size={16} color={colors.onDark} />
        </Touchable>
      </View>

      <View style={styles.identity}>
        <View style={[styles.crest, glowStyle(colors.auroraViolet, 2)]}>
          <TeamLogo name={name} logo={logo} size={56} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
            {name}
          </Text>
          {context ? (
            <Text style={styles.context} numberOfLines={1} {...textScale.dense}>
              {context}
            </Text>
          ) : null}
        </View>
      </View>

      {stats.length ? <StageStats items={stats} /> : null}

      {record && played > 0 ? (
        <View style={styles.record}>
          <View style={styles.recordHead}>
            <Text style={styles.recordLabel} {...textScale.badge}>
              {upperTR(`${played} maç`)}
            </Text>
            <Text style={styles.recordText} numberOfLines={1} {...textScale.badge}>
              <Text style={styles.recordWin}>{`${record.wins}G`}</Text>
              {"  "}
              <Text style={styles.recordDraw}>{`${record.draws}B`}</Text>
              {"  "}
              <Text style={styles.recordLoss}>{`${record.losses}M`}</Text>
            </Text>
            <View style={styles.flex} />
            {formValue.length ? <FormChips form={formValue} size="sm" /> : null}
          </View>
          <SplitBar
            height={6}
            track={colors.inkTile}
            parts={[
              { key: "w", value: record.wins, color: colors.win },
              { key: "d", value: record.draws, color: colors.draw },
              { key: "l", value: record.losses, color: colors.liveOnDark },
            ]}
          />
        </View>
      ) : formValue.length ? (
        <View style={styles.recordHead}>
          <Text style={styles.recordLabel} {...textScale.badge}>
            SON MAÇLAR
          </Text>
          <View style={styles.flex} />
          <FormChips form={formValue} size="sm" />
        </View>
      ) : null}
    </InkStage>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pills: { flexDirection: "row", alignItems: "center", gap: space.s },
  edit: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  identity: { flexDirection: "row", alignItems: "center", gap: space.md },
  crest: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  texts: { flex: 1, minWidth: 0, gap: space.xxs },
  name: { ...type.display, color: colors.onDark },
  context: { ...type.caption, color: colors.onDarkMuted },
  record: { gap: space.sm },
  recordHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  recordLabel: { ...type.nano, color: colors.onDarkMuted },
  recordText: { ...type.numSmStrong, color: colors.onDark },
  recordWin: { color: colors.win },
  recordDraw: { color: colors.onDarkMuted },
  recordLoss: { color: colors.liveOnDark },
});
