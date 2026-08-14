import Ionicons from "@expo/vector-icons/Ionicons";
import { Link } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Menü — sekme çubuğuna sığmayan her şeyin evi.
 *
 * Haberler ve Profil rotaları yaşamaya devam eder (app/(tabs) altında,
 * href: null ile sekmeden gizli); buradan ulaşılır. Yeni sayfalar eklendikçe
 * (ayarlar, hakkında, iletişim...) bu liste büyür.
 */
export default function MenuScreen() {
  const auth = useAuth();
  const user = auth?.user ?? null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Menü" />

      <ScrollView contentContainerStyle={styles.content}>
        <Link href="/profile" asChild>
          <Pressable style={({ pressed }) => [styles.userCard, pressed && styles.pressed]}>
            <View style={styles.avatar}>
              <Ionicons
                name={user ? "person" : "person-outline"}
                size={22}
                color={colors.turf}
              />
            </View>
            <View style={styles.userBody}>
              <Text style={styles.userTitle}>
                {user ? user.fullName ?? user.username : "Giriş yap"}
              </Text>
              <Text style={styles.userMeta}>
                {user ? "Profilini görüntüle" : "Takımını takip et, profilini yönet"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        </Link>

        <View style={styles.group}>
          <MenuItem href="/news" icon="newspaper-outline" label="Haberler" />
          <MenuItem
            icon="globe-outline"
            label="elitlig.com"
            onPress={() => Linking.openURL("https://elitlig.com")}
            last
          />
        </View>

        <Text style={styles.version}>ElitLig Mobil</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({
  href,
  icon,
  label,
  onPress,
  last,
}: {
  href?: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const row = (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, !last && styles.itemBorder, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={colors.turf} />
      <Text style={styles.itemLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
    </Pressable>
  );

  if (href) {
    return (
      <Link href={href} asChild>
        {row}
      </Link>
    );
  }
  return row;
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
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  userBody: {
    flex: 1,
  },
  userTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  userMeta: {
    ...type.small,
    color: colors.muted,
    marginTop: 2,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
  },
  itemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.faint,
  },
  itemLabel: {
    ...type.body,
    color: colors.line,
    flex: 1,
    fontWeight: "600",
  },
  version: {
    ...type.caption,
    color: colors.faint,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  pressed: {
    opacity: 0.7,
  },
});
