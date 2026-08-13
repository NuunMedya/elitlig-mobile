import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "@/constants/theme";

/** Sekme ekranlarının tepesi: marka + sayfa adı. */
export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        <Text style={styles.brand}>ELİTLİG</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

/** Detay ekranlarının tepesi: geri düğmesi + başlık. */
export function DetailHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();

  return (
    <View style={styles.detailHeader}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        hitSlop={12}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Ionicons name="chevron-back" size={26} color={colors.line} />
      </Pressable>
      <View style={styles.detailTitles}>
        <Text style={styles.detailTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.detailSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  titles: {
    flexShrink: 1,
  },
  brand: {
    ...type.caption,
    color: colors.turf,
  },
  title: {
    ...type.title,
    color: colors.line,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  detailTitles: {
    flex: 1,
  },
  detailTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  detailSubtitle: {
    ...type.caption,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.6,
  },
});
