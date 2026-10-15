/**
 * KADRO KURULUMU — Arena oyunlarının giriş kartında gerçek ligden oyuncu
 * seçimi ve rakip merdiveni (Penaltı, Slalom).
 *
 *   · Oyuncu şeridi: gerçek ligin oyuncuları (bağlı oyuncu kaydı olan üye
 *     kendini en başta "Sen" olarak görür). Seçilen oyuncunun özellikleri
 *     gerçek istatistiklerinden gelir ve oyunda küçük, dengeli etki yapar.
 *   · Merdiven: oyunun seviyeleri boyunca karşına çıkacak rakipler (Penaltı:
 *     kaleciler, Slalom: takım savunmaları); son basamak ligin en iyisi.
 *
 * Forma renkleri kulübün verisidir (tasarım tokenı değil): çerçeve ve
 * şeritlerde dinamik stil olarak kullanılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar, Touchable } from "@/components/ui";
import type { PenaltyKit } from "@/lib/api/arena";
import { colors, fonts, radius, space, textScale, type, upperTR } from "@/theme";

export interface RosterPerson {
  id: number;
  name: string;
  short: string;
  image: string | null;
  shirt: number | null;
  team: { name: string | null; kit: PenaltyKit };
  attrs: Record<string, number>;
  mine?: boolean;
}

export interface RosterStep {
  id: number;
  name: string;
  image?: string | null;
  color: string;
}

export interface RosterSetupProps<T extends RosterPerson> {
  loading: boolean;
  people: T[];
  scope?: "city" | "all";
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** "Atıcını seç" */
  title: string;
  /** Yüklenirken / kadro yokken gösterilen satırlar. */
  loadingText: string;
  emptyText: string;
  attrs: { key: string; label: string }[];
  /** Şeritteki küçük satır ("12 gol"). */
  chipMeta: (person: T) => string;
  /** Seçili oyuncunun altındaki satır ("Takım · 12 gol · 3 penaltı golü"). */
  detailMeta: (person: T) => string;
  ladderTitle: string;
  ladder: RosterStep[];
  finalText: string | null;
}

export function RosterSetup<T extends RosterPerson>(props: RosterSetupProps<T>) {
  const { loading, people, scope, selectedId, onSelect, title, attrs, ladder, finalText } = props;
  if (loading) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.muted} {...textScale.dense}>
          {props.loadingText}
        </Text>
      </View>
    );
  }
  if (!people.length) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.muted} {...textScale.long}>
          {props.emptyText}
        </Text>
      </View>
    );
  }
  const selected = people.find((item) => item.id === selectedId) ?? people[0];

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.overline} {...textScale.badge}>
          {upperTR(title)}
        </Text>
        {scope === "all" ? (
          <Text style={styles.scope} {...textScale.badge}>
            Türkiye geneli
          </Text>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {people.map((item) => (
          <PersonChip key={item.id} person={item} meta={props.chipMeta(item)} selected={item.id === selected.id} onPress={() => onSelect(item.id)} />
        ))}
      </ScrollView>

      <View style={styles.detail}>
        <View style={[styles.kitBar, { backgroundColor: selected.team.kit.primary }]} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {selected.shirt ? `${selected.shirt} · ${selected.name}` : selected.name}
          </Text>
          <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
            {props.detailMeta(selected)}
          </Text>
          {attrs.map((attr) => (
            <AttrBar key={attr.key} label={attr.label} value={selected.attrs[attr.key] ?? 75} color={selected.team.kit.primary} />
          ))}
        </View>
      </View>

      {ladder.length ? (
        <>
          <Text style={styles.overline} {...textScale.badge}>
            {upperTR(props.ladderTitle)}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ladder}>
            {ladder.map((step, index) => (
              <View key={step.id} style={styles.step}>
                <View style={[styles.ring, { borderColor: step.color }, index === ladder.length - 1 && styles.finalRing]}>
                  <Avatar name={step.name} image={step.image ?? null} size={30} />
                </View>
                <Text style={styles.stepText} numberOfLines={1} {...textScale.badge}>
                  {index === ladder.length - 1 ? "Final" : `${index + 1}.`}
                </Text>
              </View>
            ))}
          </ScrollView>
          {finalText ? (
            <View style={styles.finalRow}>
              <Ionicons name="trophy" size={13} color={colors.star} />
              <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                {finalText}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const PersonChip = memo(function PersonChip({
  person,
  meta,
  selected,
  onPress,
}: {
  person: RosterPerson;
  meta: string;
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
      accessibilityLabel={`${person.name}, ${meta}`}
    >
      <View style={[styles.chip, selected && styles.chipSelected]}>
        <View style={[styles.ring, { borderColor: person.team.kit.primary }]}>
          <Avatar name={person.name} image={person.image} size={40} />
        </View>
        <Text style={[styles.chipName, selected && styles.chipNameSelected]} numberOfLines={1} {...textScale.badge}>
          {person.mine ? "Sen" : person.short}
        </Text>
        <Text style={styles.chipMeta} numberOfLines={1} {...textScale.badge}>
          {meta}
        </Text>
      </View>
    </Touchable>
  );
});

function AttrBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(1, (value - 50) / 50));
  return (
    <View style={styles.attr}>
      <Text style={styles.attrLabel} {...textScale.badge}>
        {label}
      </Text>
      <View style={styles.attrTrack}>
        <View style={[styles.attrFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
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
  placeholder: { alignSelf: "stretch", paddingVertical: space.md, alignItems: "center" },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  chipSelected: { borderColor: colors.brandAccent, backgroundColor: colors.brandDim },
  chipName: { ...type.micro, color: colors.textPrimary, maxWidth: 64 },
  chipNameSelected: { color: colors.brandAccent },
  chipMeta: { ...type.micro, color: colors.textTertiary },
  ring: { borderWidth: 2, borderRadius: radius.pill, padding: 1 },
  finalRing: { borderWidth: 3 },
  detail: { flexDirection: "row", gap: space.sm, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface3 },
  kitBar: { width: 4, borderRadius: radius.pill },
  name: { ...type.label, fontFamily: fonts.bold, color: colors.textPrimary },
  attr: { flexDirection: "row", alignItems: "center", gap: space.s },
  attrLabel: { ...type.micro, color: colors.textSecondary, width: 50 },
  attrTrack: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: "hidden" },
  attrFill: { height: 6, borderRadius: radius.pill },
  attrValue: { ...type.micro, color: colors.textPrimary, width: 22, textAlign: "right" },
  ladder: { gap: space.s, paddingVertical: space.xxs },
  step: { alignItems: "center", gap: space.xxs },
  stepText: { ...type.micro, color: colors.textTertiary },
  finalRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
