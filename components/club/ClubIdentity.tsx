/**
 * KULÜP KİMLİĞİ — takımın ya da oyuncunun SAHNE (grafit) üstündeki kimlik bloğu.
 *
 * İKİ KULLANIM:
 *   · `framed` → kendi sıkı grafit kartıyla (Yönetim sekmesi: hızlı
 *     erişimin altında, bağlam kartı). Amblem, ad ve sayılar bir kademe
 *     küçük çizilir — sahne değil, özet.
 *   · çerçevesiz → `ScreenHeader`ın `hero` yuvasında; zemini başlık bloğu
 *     verir, kaydırınca kapanır (Takım Paneli).
 * İki yerde aynı bileşen: amblem, ad, bağlam satırı, cam sayı kutuları ve
 * son beş maç. Böylece kulüp her yerde aynı yüzle tanınır.
 *
 * SAYI KUTULARI veriye bağlıdır: bilinmeyen değer "—" ile kutuda kalmaz,
 * kutu hiç çizilmez (kalanlar genişliği eşit paylaşır). Sahte sıfır yok.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { Avatar, FormChips, GradientFill, TeamLogo, Touchable } from "@/components/ui";
import { colors, layout, radius, space, textScale, type, upperTR } from "@/theme";

export interface IdentityFact {
  label: string;
  value: string;
}

export interface ClubIdentityProps {
  kind: "team" | "player";
  name: string;
  image: string | null;
  /** Bağlam satırı: "FREELİG · 2025-26" ya da "Orta saha · Yıldızspor". */
  context?: string | null;
  /** Bağlamın üstündeki küçük rol etiketi: "BAŞKAN", "OYUNCU". */
  role?: string;
  facts?: IdentityFact[];
  /** Son 5 maç ("WDLWW"). */
  form?: string | null;
  /** Kendi grafit kartı olsun mu (hero yuvası dışında kullanım). */
  framed?: boolean;
  /** Kimliğe dokununca (herkese açık sayfa). */
  onPress?: () => void;
  /** Kartın altına eklenen eylem satırı (yalnız `framed`). */
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const ClubIdentity = React.memo(function ClubIdentity({
  kind,
  name,
  image,
  context,
  role,
  facts = [],
  form,
  framed = false,
  onPress,
  footer,
  style,
}: ClubIdentityProps) {
  // Çerçeveli kart bir özettir: amblem bir kademe küçük.
  const crest = framed ? FRAMED_CREST : layout.crestXl;
  const top = (
    <View style={styles.top}>
      {kind === "team" ? (
        <TeamLogo name={name} logo={image} size={crest} />
      ) : (
        <Avatar name={name} image={image} size={crest} ring="brand" />
      )}
      <View style={styles.texts}>
        {role ? (
          <Text style={styles.role} numberOfLines={1} {...textScale.badge}>
            {upperTR(role)}
          </Text>
        ) : null}
        <Text style={[styles.name, framed ? styles.nameFramed : null]} numberOfLines={2} {...textScale.dense}>
          {name}
        </Text>
        {context ? (
          <Text style={styles.context} numberOfLines={1} {...textScale.dense}>
            {context}
          </Text>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.onDarkMuted} /> : null}
    </View>
  );

  const body = (
    <>
      {onPress ? (
        <Touchable
          feedback="card"
          haptic="selection"
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${name}${context ? `, ${context}` : ""}`}
        >
          {top}
        </Touchable>
      ) : (
        top
      )}

      {facts.length ? (
        <View style={styles.facts}>
          {facts.map((fact) => (
            <View
              key={fact.label}
              style={[styles.fact, framed ? styles.factFramed : null]}
              accessible
              accessibilityLabel={`${fact.label.toLocaleLowerCase("tr-TR")} ${fact.value}`}
            >
              <Text style={[styles.factValue, framed ? styles.factValueFramed : null]} numberOfLines={1} {...textScale.badge}>
                {fact.value}
              </Text>
              <Text style={styles.factLabel} numberOfLines={1} {...textScale.badge}>
                {upperTR(fact.label)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {form ? (
        <View style={styles.formRow}>
          <Text style={styles.formLabel} {...textScale.badge}>
            SON 5
          </Text>
          <FormChips form={form} size="sm" />
        </View>
      ) : null}

      {framed && footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  if (!framed) return <View style={[styles.hero, style]}>{body}</View>;

  return (
    <View style={[styles.framed, style]}>
      <GradientFill tone="ink" radius="xl" />
      {body}
    </View>
  );
});

/** Çerçeveli (özet) kartın amblem ölçüsü — crestLg ile crestXl arası. */
const FRAMED_CREST = 40;

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.md,
    gap: space.md,
  },
  framed: {
    marginHorizontal: layout.screenPadding,
    padding: space.md,
    gap: space.m,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  role: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  name: {
    ...type.h1,
    color: colors.onDark,
  },
  nameFramed: {
    ...type.h2,
  },
  context: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
  facts: {
    flexDirection: "row",
    gap: space.s,
  },
  fact: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.inkTileBorder,
  },
  factFramed: {
    paddingVertical: space.s,
    borderRadius: radius.sm,
  },
  factValue: {
    ...type.metricSm,
    color: colors.onDark,
  },
  factValueFramed: {
    ...type.scoreSm,
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
  footer: {
    flexDirection: "row",
    gap: space.sm,
  },
});
