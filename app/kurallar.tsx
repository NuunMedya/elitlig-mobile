import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { colors, radius, spacing, type } from "@/constants/theme";
import { RULES_SECTIONS, RULES_UPDATED_AT } from "@/constants/rulesContent";
import { useScope } from "@/providers/ScopeProvider";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Lig Kuralları — resmî metnin uygulama içi hali.
 *
 * 11 bölüm akordiyon olarak listelenir; ilk bölüm açık gelir. Güç dengesi
 * katsayı tablosu 7. bölümün içinde metin olarak geçer; görsel tablo Puan
 * Durumu ekranındaki bilgi kutusunda zaten vardır.
 */
export default function RulesScreen() {
  const scope = useScope();
  const [open, setOpen] = useState<number>(0);

  const toggle = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((current) => (current === index ? -1 : index));
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Lig Kuralları" subtitle={`${scope.cityLabel} · ${scope.leagueLabel}`} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.metaRow}>
          <View style={styles.freshPill}>
            <Ionicons name="checkmark-circle" size={13} color={colors.green} />
            <Text style={styles.freshText}>Güncel</Text>
          </View>
          <Text style={styles.updated}>Son güncelleme: {RULES_UPDATED_AT}</Text>
        </View>

        {RULES_SECTIONS.map((section, index) => {
          const active = open === index;
          return (
            <View key={section.title} style={styles.card}>
              <Pressable
                onPress={() => toggle(index)}
                style={({ pressed }) => [styles.head, pressed && styles.pressed]}
              >
                <Text style={styles.headTitle}>{section.title}</Text>
                <Ionicons
                  name={active ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={colors.muted}
                />
              </Pressable>
              {active && (
                <View style={styles.body}>
                  {section.items.map((item, itemIndex) => (
                    <Text key={itemIndex} style={styles.item}>
                      {item}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  freshPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  freshText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.green,
  },
  updated: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headTitle: {
    ...type.small,
    color: colors.line,
    fontWeight: "800",
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  item: {
    ...type.small,
    color: colors.line,
    lineHeight: 21,
  },
  pressed: {
    opacity: 0.7,
  },
});
