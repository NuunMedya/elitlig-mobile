import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { mediaUrl } from "@/lib/format";
import { useFavorite } from "@/providers/FavoriteProvider";

export default function FavorilerScreen() {
  const { favorites, removeFavorite } = useFavorite();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.line} />
        </Pressable>
        <Text style={styles.headerTitle}>Favori Takımlarım</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {favorites.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="star-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>Henüz favori takım yok</Text>
            <Text style={styles.emptyDesc}>
              Takım sayfalarında "Favorilere Ekle" butonuna basarak
              takımları buraya ekleyebilirsin. Maç bildirimleri de alırsın.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.infoCard}>
              <Ionicons name="notifications-outline" size={16} color={colors.turf} />
              <Text style={styles.infoText}>
                Favori takımlarının maçları için bildirim alırsın.
              </Text>
            </View>

            {favorites.map((team) => (
              <Pressable
                key={team.id}
                onPress={() => router.push(`/takim/${team.id}`)}
                style={({ pressed }) => [styles.teamRow, pressed && styles.pressed]}
              >
                <TeamCrest
                  name={team.name}
                  logo={team.logo ? mediaUrl(team.logo) : undefined}
                  size={40}
                />
                <Text style={styles.teamName} numberOfLines={1}>
                  {team.name}
                </Text>
                <Pressable
                  onPress={() => removeFavorite(team.id)}
                  hitSlop={10}
                  style={styles.removeBtn}
                >
                  <Ionicons name="star" size={20} color={colors.yellow} />
                </Pressable>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pitch },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.faint,
  },
  headerTitle: { ...type.subtitle, color: colors.line },
  content: { padding: spacing.md, gap: spacing.sm },
  infoCard: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.turfDim,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  infoText: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.line, lineHeight: 18 },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.faint,
    padding: spacing.md,
  },
  teamName: { flex: 1, ...type.body, fontWeight: "700", color: colors.line },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.goldDim,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl * 2 },
  emptyTitle: { ...type.subtitle, color: colors.line },
  emptyDesc: {
    ...type.small,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.xl,
  },
  pressed: { opacity: 0.7 },
});
