/**
 * KULÜP KAHRAMAN KARTI — Kulübüm'ün ilk bakışı: "biz kimiz, nerdeyiz?"
 *
 * Koyu mor sahne (gradientInk, tema tokenı) üstünde: arma (arkasında marka
 * ışığı — Bloom), takım adı, rol + lig/sezon, dört rakam (sıra, puan,
 * averaj, kadro) ve son beş maçın formu. Kartın tamamı takım sayfasını açar;
 * sağ üstteki kalem kimlik düzenlemeyi.
 *
 * RAKAMLAR UYDURULMAZ: sıra önce kapsam puan durumundan (useClubSignals),
 * yoksa panel özetinden (`/api/panel/me/overview` → standings) gelir; ikisi
 * de yoksa hücre çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Bloom, FormChips, GradientFill, TeamLogo, Touchable } from "@/components/ui";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";

export interface HeroFact {
  label: string;
  value: string;
  tone?: "win" | "danger" | "neutral";
}

export interface ClubHeroProps {
  name: string;
  logo: string | null;
  role: string;
  context: string | null;
  facts: HeroFact[];
  /** "WWDLW" ya da ["W","D"] — eskiden yeniye. */
  form: string | string[] | null;
  record: string | null;
  onOpen: () => void;
  onEdit: () => void;
}

const FACT_COLOR = { win: colors.win, danger: colors.danger, neutral: colors.onDark } as const;

export const ClubHero = React.memo(function ClubHero({ name, logo, role, context, facts, form, record, onOpen, onEdit }: ClubHeroProps) {
  const formValue = Array.isArray(form) ? (form as ("W" | "D" | "L")[]) : form;
  return (
    <Touchable onPress={onOpen} feedback="card" accessibilityRole="button" accessibilityLabel={`${name} takım sayfası`} style={styles.card}>
      <GradientFill tone="ink" radius="xxl" />
      <Bloom width={220} height={180} color={colors.brand} intensity={0.55} style={styles.bloom} />

      <View style={styles.top}>
        <View style={styles.crest}>
          <TeamLogo name={name} logo={logo} size={56} />
        </View>
        <View style={styles.identity}>
          <Text style={styles.role} numberOfLines={1} {...textScale.badge}>
            {upperTR(role)}
          </Text>
          <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
            {name}
          </Text>
          {context ? (
            <Text style={styles.context} numberOfLines={1} {...textScale.dense}>
              {context}
            </Text>
          ) : null}
        </View>
        <Touchable onPress={onEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel="Takım bilgilerini düzenle" style={styles.edit}>
          <Ionicons name="create-outline" size={18} color={colors.onDark} />
        </Touchable>
      </View>

      {facts.length ? (
        <View style={styles.facts}>
          {facts.map((fact) => (
            <View key={fact.label} style={styles.fact}>
              <Text style={[styles.factValue, { color: FACT_COLOR[fact.tone ?? "neutral"] }]} numberOfLines={1} {...textScale.badge}>
                {fact.value}
              </Text>
              <Text style={styles.factLabel} numberOfLines={1} {...textScale.badge}>
                {upperTR(fact.label)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {formValue && formValue.length ? (
        <View style={styles.formRow}>
          <Text style={styles.formLabel} {...textScale.badge}>
            SON MAÇLAR
          </Text>
          <FormChips form={formValue} size="sm" />
          {record ? (
            <Text style={styles.record} numberOfLines={1} {...textScale.badge}>
              {record}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xxl,
    padding: space.lg,
    gap: space.md,
    backgroundColor: colors.inkBlock,
    overflow: "hidden",
  },
  bloom: { top: -60, left: -50 },
  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  crest: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderOnDark,
  },
  identity: { flex: 1, minWidth: 0, gap: space.xxs },
  role: { ...type.overline, color: colors.brandOnDark },
  name: { ...type.h2, color: colors.onDark },
  context: { ...type.caption, color: colors.onDarkMuted },
  edit: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glassBorder,
    alignSelf: "flex-start",
  },
  facts: { flexDirection: "row", gap: space.sm },
  fact: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: colors.glassBorder,
  },
  factValue: { ...type.metricSm },
  factLabel: { ...type.nano, color: colors.onDarkMuted },
  formRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  formLabel: { ...type.nano, color: colors.onDarkMuted },
  record: { ...type.labelXs, color: colors.onDarkMuted, marginLeft: "auto" },
});
