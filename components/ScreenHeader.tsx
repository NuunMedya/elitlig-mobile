import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, isDark, spacing, type } from "@/constants/theme";
import { CallCenterButton } from "@/components/CallCenterButton";
import { toggleTheme } from "@/lib/themeToggle";

/** Sekme ekranlarının tepesi: marka + sayfa adı. */
export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        <Text style={styles.brand}>ELİTLİG</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      {right}
      <CallCenterButton />
      <Pressable
        onPress={toggleTheme}
        hitSlop={10}
        style={({ pressed }) => [styles.themeBtn, pressed && styles.pressed]}
      >
        <Ionicons
          name={isDark ? "sunny-outline" : "moon-outline"}
          size={20}
          color={colors.muted}
        />
      </Pressable>
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
    flex: 1,
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
  themeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
});
