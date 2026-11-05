/**
 * ŞİMDİ İLGİLEN — yatay kaydırılan renkli eylem kartları.
 *
 * Her kart tek bir işi söyler: ne (başlık), neden (alt satır), kaç tane
 * (iri rakam) ve rengiyle ne kadar acil olduğunu (danger > warn > brand >
 * info > neutral). Kart dokunulunca `onAttention` çağrılır; ana ekran ya
 * rotayı açar ya da kendi alt sayfasını (onay bekleyen değişiklikler).
 *
 * İş yoksa raf yerine tek satırlık "her şey yolunda" kartı çizilir; boş
 * bir başlık bırakmak "bir şey yüklenmedi mi?" sorusunu doğuruyordu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { AttentionItem } from "@/components/club/useClubSignals";
import { Touchable, toneColors } from "@/components/ui";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

export const AttentionRail = React.memo(function AttentionRail({
  items,
  onPress,
}: {
  items: AttentionItem[];
  onPress: (item: AttentionItem) => void;
}) {
  if (!items.length) {
    return (
      <View style={styles.calm}>
        <View style={[styles.calmIcon, { backgroundColor: toneColors("win").dim }]}>
          <Ionicons name="checkmark-done" size={18} color={colors.win} />
        </View>
        <View style={styles.calmTexts}>
          <Text style={styles.calmTitle} {...textScale.dense}>
            Bekleyen iş yok
          </Text>
          <Text style={styles.calmHint} {...textScale.dense}>
            Teklif, başvuru, yoklama ve disiplin tarafında her şey güncel.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} decelerationRate="fast" snapToInterval={CARD + space.sm}>
      {items.map((item) => {
        const tc = toneColors(item.tone);
        return (
          <Touchable
            key={item.key}
            onPress={() => onPress(item)}
            feedback="card"
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.count}, ${item.subtitle}`}
            style={[styles.card, { borderColor: tc.dim }]}
          >
            <View style={[styles.stripe, { backgroundColor: tc.solidBg }]} />
            <View style={styles.head}>
              <View style={[styles.icon, { backgroundColor: tc.dim }]}>
                <Ionicons name={item.icon} size={16} color={tc.fg} />
              </View>
              <Text style={[styles.count, { color: tc.fg }]} {...textScale.badge}>
                {item.count > 99 ? "99+" : item.count}
              </Text>
            </View>
            <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
              {item.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={2} {...textScale.dense}>
              {item.subtitle}
            </Text>
            <View style={styles.footer}>
              <Text style={[styles.go, { color: tc.fg }]} {...textScale.badge}>
                İlgilen
              </Text>
              <Ionicons name="arrow-forward" size={12} color={tc.fg} />
            </View>
          </Touchable>
        );
      })}
    </ScrollView>
  );
});

const CARD = 168;

const styles = StyleSheet.create({
  rail: { paddingHorizontal: layout.screenPadding, gap: space.sm },
  card: {
    width: CARD,
    minHeight: 150,
    padding: space.md,
    paddingTop: space.md + space.xxs,
    gap: space.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    overflow: "hidden",
  },
  stripe: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  icon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  count: { ...type.metric },
  title: { ...type.h4, color: colors.textPrimary },
  subtitle: { ...type.caption, color: colors.textTertiary, flex: 1 },
  footer: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  go: { ...type.labelXs },
  calm: {
    marginHorizontal: layout.screenPadding,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  calmIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  calmTexts: { flex: 1, gap: space.xxs },
  calmTitle: { ...type.h4, color: colors.textPrimary },
  calmHint: { ...type.caption, color: colors.textTertiary },
});
