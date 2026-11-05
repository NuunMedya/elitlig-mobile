/**
 * KARİYERİM KAHRAMAN KARTI — sekmenin tek "sahne" yüzeyi.
 *
 * NE: oyuncunun kimliği tek bakışta: fotoğraf (arkasında marka ışığı), ad,
 * mevki ve takım; sağ üstte Elit Kart genel değeri (OVR, kademe rengiyle);
 * altında sezonun dört sayısı (cam kutular), Elit Seviye ilerlemesi ve son
 * maç formu. İki eylem: profilim ve paylaş.
 *
 * NEDEN ELİT KARİYER BURADA: eskiden Elit Kariyer (seviye, kart, rozetler)
 * ile Kariyerim (maç, teklif, sözleşme) iki ayrı dünyaydı ve birinden
 * ötekine yol yoktu. Kahraman kartı ikisini birleştirir: OVR rozeti ve seviye
 * çubuğu Elit Kariyer'i açar; kartın kendisi herkese açık profili.
 *
 * SAHNE TEK: ekranda grafit yüzey yalnız budur; altındaki her şey kâğıttır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Bloom, FormChips, GradientFill, TeamLogo, Touchable, type FormResult } from "@/components/ui";
import type { CareerSummary } from "@/lib/api/career";
import { TIER_ACCENT } from "@/lib/careerTiers";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";

export interface CareerHeroProps {
  name: string;
  image: string | null;
  position: string | null;
  teamName: string | null;
  teamLogo: string | null;
  scopeLabel: string;
  stats: { label: string; value: string }[];
  form: FormResult[];
  /** Ek künye: piyasa değeri, lig sırası. */
  chips: { icon: keyof typeof Ionicons.glyphMap; label: string }[];
  career: CareerSummary | null;
  onOpenProfile: () => void;
  onOpenPublic: () => void;
  onOpenCareer: () => void;
  onShare: () => void;
}

export const CareerHero = React.memo(function CareerHero({
  name,
  image,
  position,
  teamName,
  teamLogo,
  scopeLabel,
  stats,
  form,
  chips,
  career,
  onOpenProfile,
  onOpenPublic,
  onOpenCareer,
  onShare,
}: CareerHeroProps) {
  const card = career?.card ?? null;
  const level = career?.level ?? null;
  const tierKey = card ? (card.in_form ? "formda" : card.tier) : null;
  const accent = tierKey ? TIER_ACCENT[tierKey] : colors.brandOnDark;
  const progress = level ? Math.max(0, Math.min(1, Number(level.progress) || 0)) : 0;

  return (
    <View style={styles.card}>
      <GradientFill tone="ink" radius="xxl" />
      <Bloom width={260} height={200} color={colors.brand} intensity={0.45} style={styles.bloom} />

      {/* Kimlik — dokununca herkese açık profil. */}
      <Touchable
        feedback="card"
        onPress={onOpenPublic}
        accessibilityRole="button"
        accessibilityLabel={`${name}, herkese açık profilim`}
        style={styles.identity}
      >
        <Avatar name={name} image={image} size={64} ring="brand" />
        <View style={styles.identityText}>
          <Text style={styles.overline} numberOfLines={1} {...textScale.badge}>
            {upperTR(["Oyuncu", position].filter(Boolean).join(" · "))}
          </Text>
          <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit {...textScale.dense}>
            {name}
          </Text>
          <View style={styles.teamRow}>
            {teamName ? <TeamLogo name={teamName} logo={teamLogo} size={16} /> : null}
            <Text style={styles.team} numberOfLines={1} {...textScale.dense}>
              {teamName ?? "Serbest oyuncu"}
            </Text>
          </View>
        </View>

        {card ? (
          <Touchable
            feedback="button"
            haptic="selection"
            onPress={onOpenCareer}
            accessibilityRole="button"
            accessibilityLabel={`Elit Kart ${card.ovr}, ${card.tier_label}`}
            style={[styles.ovr, { borderColor: accent }]}
          >
            <Text style={[styles.ovrValue, { color: accent }]} {...textScale.badge}>
              {card.ovr}
            </Text>
            <Text style={styles.ovrLabel} numberOfLines={1} {...textScale.badge}>
              {upperTR(card.in_form ? "Formda" : card.tier_label)}
            </Text>
          </Touchable>
        ) : null}
      </Touchable>

      {/* Sezon sayıları — cam kutular. */}
      <View style={styles.statsHead}>
        <Text style={styles.scope} {...textScale.badge}>
          {upperTR(scopeLabel)}
        </Text>
        {form.length ? <FormChips form={form} size="xs" order="newestFirst" /> : null}
      </View>
      <View style={styles.stats}>
        {stats.map((item) => (
          <View key={item.label} style={styles.stat}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
              {item.value}
            </Text>
            <Text style={styles.statLabel} numberOfLines={1} {...textScale.badge}>
              {upperTR(item.label)}
            </Text>
          </View>
        ))}
      </View>

      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <View key={chip.label} style={styles.chip}>
              <Ionicons name={chip.icon} size={11} color={colors.onDarkMuted} />
              <Text style={styles.chipText} numberOfLines={1} {...textScale.badge}>
                {chip.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Elit Seviye — Elit Kariyer'in kapısı. */}
      {level ? (
        <Touchable
          onPress={onOpenCareer}
          accessibilityRole="button"
          accessibilityLabel={`Elit Seviye ${level.level}, Elit Kariyer'i aç`}
          style={styles.level}
        >
          <View style={styles.levelHead}>
            <Ionicons name="sparkles" size={12} color={colors.brandOnDark} />
            <Text style={styles.levelText} numberOfLines={1} {...textScale.badge}>
              {upperTR(`Elit Seviye ${level.level}`)}
            </Text>
            <Text style={styles.levelXp} numberOfLines={1} {...textScale.badge}>
              {level.next ? `${level.xp} / ${level.next} XP` : `${level.xp} XP`}
            </Text>
            <Ionicons name="chevron-forward" size={12} color={colors.onDarkMuted} />
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { flex: progress }]} />
            <View style={{ flex: 1 - progress }} />
          </View>
        </Touchable>
      ) : null}

      <View style={styles.actions}>
        <HeroButton icon="person-circle-outline" label="Profilim" onPress={onOpenProfile} />
        <HeroButton icon="share-social-outline" label="Kartımı paylaş" onPress={onShare} />
      </View>
    </View>
  );
});

function HeroButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Touchable feedback="button" haptic="light" onPress={onPress} accessibilityRole="button" style={styles.button}>
      <Ionicons name={icon} size={15} color={colors.onDark} />
      <Text style={styles.buttonText} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    padding: space.lg,
    gap: space.md,
    backgroundColor: colors.inkBlock,
  },
  bloom: { position: "absolute", top: -60, left: -50 },
  identity: { flexDirection: "row", alignItems: "center", gap: space.md },
  identityText: { flex: 1, minWidth: 0 },
  overline: { ...type.overline, color: colors.brandOnDark },
  name: { ...type.display, color: colors.onDark, marginTop: space.xxs },
  teamRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xxs },
  team: { ...type.bodySm, color: colors.onDarkMuted, flexShrink: 1 },
  ovr: {
    minWidth: 54,
    alignItems: "center",
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.inkPill,
  },
  ovrValue: { ...type.scoreMd },
  ovrLabel: { ...type.nano, color: colors.onDarkMuted },
  statsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  scope: { ...type.micro, color: colors.onDarkMuted },
  stats: { flexDirection: "row", gap: space.sm },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: 1,
    borderColor: colors.inkTileBorder,
  },
  statValue: { ...type.metricSm, color: colors.onDark },
  statLabel: { ...type.micro, color: colors.onDarkMuted, marginTop: space.xxs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: 1,
    borderColor: colors.inkPillBorder,
  },
  chipText: { ...type.caption, color: colors.onDark },
  level: { gap: space.xs },
  levelHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  levelText: { ...type.micro, color: colors.brandOnDark, flex: 1 },
  levelXp: { ...type.numSm, color: colors.onDarkMuted },
  track: {
    height: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: colors.inkTile,
  },
  fill: { backgroundColor: colors.brandOnDark, borderRadius: radius.pill },
  actions: { flexDirection: "row", gap: space.sm },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.inkPill,
    borderWidth: 1,
    borderColor: colors.inkPillBorder,
  },
  buttonText: { ...type.label, color: colors.onDark },
});
