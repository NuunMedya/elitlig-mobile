/**
 * PENALTI KURULUMU — giriş kartında atıcı seçimi ve kaleci merdiveni.
 *
 * Atıcılar ve kaleciler gerçek ligden gelir (GET /api/arena/penalti/roster):
 *   · Atıcı listesi gol sırasındadır; bağlı oyuncu kaydı olan üye kendisini
 *     en başta görür. Seçilen atıcının üç özelliği (şut, isabet, falso) gerçek
 *     istatistiklerinden gelir ve oyunda küçük, dengeli bir etki yapar.
 *   · Kaleci merdiveni: her seviyede sıradaki kaleci kaleye geçer; son kaleci
 *     ligin en çok kurtarış yapanıdır.
 *
 * Forma renkleri kulübün verisidir (tasarım tokenı değil): çerçeve ve
 * şeritlerde dinamik stil olarak kullanılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar, Touchable } from "@/components/ui";
import type { PenaltyPerson, PenaltyRoster } from "@/lib/api/arena";
import {
  colors,
  fonts,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

const ATTRS: { key: string; label: string }[] = [
  { key: "power", label: "Şut" },
  { key: "accuracy", label: "İsabet" },
  { key: "curve", label: "Falso" },
];

export function PenaltySetup({
  roster,
  loading,
  selectedId,
  onSelect,
}: {
  roster: PenaltyRoster | null;
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (loading) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.muted} {...textScale.dense}>
          Ligin golcüleri yükleniyor…
        </Text>
      </View>
    );
  }
  if (!roster || !roster.shooters.length) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.muted} {...textScale.long}>
          Gerçek kadro şu an yüklenemedi; ElitLig atıcısıyla oynayabilirsin.
        </Text>
      </View>
    );
  }
  const selected =
    roster.shooters.find((item) => item.id === selectedId) ??
    roster.shooters[0];
  const keepers = roster.keepers;
  const final = keepers[keepers.length - 1];

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.overline} {...textScale.badge}>
          {upperTR("Atıcını seç")}
        </Text>
        {roster.scope === "all" ? (
          <Text style={styles.scope} {...textScale.badge}>
            Türkiye geneli
          </Text>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {roster.shooters.map((item) => (
          <ShooterChip
            key={item.id}
            person={item}
            selected={item.id === selected.id}
            onPress={() => onSelect(item.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.detail}>
        <View
          style={[
            styles.kitBar,
            { backgroundColor: selected.team.kit.primary },
          ]}
        />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {selected.shirt
              ? `${selected.shirt} · ${selected.name}`
              : selected.name}
          </Text>
          <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
            {[
              selected.team.name,
              `${selected.stats.goals} gol`,
              selected.stats.penalty_goals
                ? `${selected.stats.penalty_goals} penaltı golü`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {ATTRS.map((attr) => (
            <AttrBar
              key={attr.key}
              label={attr.label}
              value={selected.attrs[attr.key] ?? 75}
              color={selected.team.kit.primary}
            />
          ))}
        </View>
      </View>

      {keepers.length ? (
        <>
          <Text style={styles.overline} {...textScale.badge}>
            {upperTR(`Kaleci merdiveni · ${keepers.length} kaleci`)}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.ladder}
          >
            {keepers.map((keeper, index) => (
              <View key={keeper.id} style={styles.step}>
                <View
                  style={[
                    styles.ring,
                    { borderColor: keeper.team.kit.primary },
                    index === keepers.length - 1 && styles.finalRing,
                  ]}
                >
                  <Avatar name={keeper.name} image={keeper.image} size={30} />
                </View>
                <Text
                  style={styles.stepText}
                  numberOfLines={1}
                  {...textScale.badge}
                >
                  {index === keepers.length - 1 ? "Final" : `${index + 1}.`}
                </Text>
              </View>
            ))}
          </ScrollView>
          {final ? (
            <View style={styles.finalRow}>
              <Ionicons name="trophy" size={13} color={colors.star} />
              <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                {`Final: ${final.short} · ${final.stats.saves} kurtarış${final.team.name ? ` · ${final.team.name}` : ""}`}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const ShooterChip = memo(function ShooterChip({
  person,
  selected,
  onPress,
}: {
  person: PenaltyPerson;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable
      onPress={onPress}
      feedback="button"
      haptic="selection"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${person.name}, ${person.stats.goals} gol`}
    >
      <View style={[styles.chip, selected && styles.chipSelected]}>
        <View style={[styles.ring, { borderColor: person.team.kit.primary }]}>
          <Avatar name={person.name} image={person.image} size={40} />
        </View>
        <Text
          style={[styles.chipName, selected && styles.chipNameSelected]}
          numberOfLines={1}
          {...textScale.badge}
        >
          {person.mine ? "Sen" : person.short}
        </Text>
        <Text style={styles.chipMeta} numberOfLines={1} {...textScale.badge}>
          {`${person.stats.goals} gol`}
        </Text>
      </View>
    </Touchable>
  );
});

function AttrBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(1, (value - 50) / 50));
  return (
    <View style={styles.attr}>
      <Text style={styles.attrLabel} {...textScale.badge}>
        {label}
      </Text>
      <View style={styles.attrTrack}>
        <View
          style={[
            styles.attrFill,
            { width: `${Math.round(pct * 100)}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.attrValue} {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", gap: space.s, marginTop: space.s },
  flex: { flex: 1, gap: space.xxs },
  placeholder: {
    alignSelf: "stretch",
    paddingVertical: space.md,
    alignItems: "center",
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  overline: { ...type.micro, color: colors.textTertiary },
  scope: { ...type.micro, color: colors.brandAccent },
  muted: { ...type.caption, color: colors.textSecondary },
  strip: { gap: space.s, paddingVertical: space.xxs },
  chip: {
    width: 68,
    alignItems: "center",
    gap: space.xxs,
    paddingVertical: space.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipSelected: {
    borderColor: colors.brandAccent,
    backgroundColor: colors.brandDim,
  },
  chipName: { ...type.micro, color: colors.textPrimary, maxWidth: 64 },
  chipNameSelected: { color: colors.brandAccent },
  chipMeta: { ...type.micro, color: colors.textTertiary },
  ring: { borderWidth: 2, borderRadius: radius.pill, padding: 1 },
  finalRing: { borderWidth: 3 },
  detail: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface3,
  },
  kitBar: { width: 4, borderRadius: radius.pill },
  name: { ...type.label, fontFamily: fonts.bold, color: colors.textPrimary },
  attr: { flexDirection: "row", alignItems: "center", gap: space.s },
  attrLabel: { ...type.micro, color: colors.textSecondary, width: 42 },
  attrTrack: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  attrFill: { height: 6, borderRadius: radius.pill },
  attrValue: {
    ...type.micro,
    color: colors.textPrimary,
    width: 22,
    textAlign: "right",
  },
  ladder: { gap: space.s, paddingVertical: space.xxs },
  step: { alignItems: "center", gap: space.xxs },
  stepText: { ...type.micro, color: colors.textTertiary },
  finalRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
