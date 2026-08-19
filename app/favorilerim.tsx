import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";

/**
 * Favorilerim — takım, lig ve sezon takibi tek ekranda.
 *
 * Favoriye alınan takımın maçları, favori lig/sezondaki tüm maçlar için
 * fikstür ve sonuç bildirimi gelir. Girişli üyede liste sunucuyla eşitlenir
 * (push hedeflemesi sunucudan yapılır); misafirde yalnızca cihazda tutulur.
 */
export default function FavorilerScreen() {
  const {
    favorites,
    removeFavorite,
    favoriteLeagues,
    toggleFavoriteLeague,
    favoriteSeasons,
    toggleFavoriteSeason,
  } = useFavorite();
  const auth = useAuth();
  const router = useRouter();

  const empty =
    favorites.length === 0 && favoriteLeagues.length === 0 && favoriteSeasons.length === 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.line} />
        </Pressable>
        <Text style={styles.headerTitle}>Favorilerim</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {empty ? (
          <View style={styles.empty}>
            <Ionicons name="star-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>Henüz favori yok</Text>
            <Text style={styles.emptyDesc}>
              Takım sayfalarında "Favorilere Ekle" butonuyla takımları, Puan
              Durumu ekranındaki yıldızla ligi ve sezonu favoriye alabilirsin.
              Favorilerindeki maçlar için bildirim alırsın.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.infoCard}>
              <Ionicons name="notifications-outline" size={16} color={colors.turf} />
              <Text style={styles.infoText}>
                Favori takımlarının maçları ve favori lig/sezonlarındaki tüm
                maçlar için fikstür ve sonuç bildirimi alırsın.
                {!auth.user ? " Bildirimler için giriş yapman gerekir." : ""}
              </Text>
            </View>

            {favorites.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>TAKIMLAR</Text>
                {favorites.map((team) => (
                  <Pressable
                    key={`t-${team.id}`}
                    onPress={() => router.push(`/takim/${team.id}`)}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  >
                    <TeamCrest
                      name={team.name}
                      logo={team.logo ? mediaUrl(team.logo) : undefined}
                      size={36}
                    />
                    <Text style={styles.rowName} numberOfLines={1}>
                      {team.name}
                    </Text>
                    <Pressable
                      onPress={() => removeFavorite(team.id)}
                      hitSlop={10}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="star" size={19} color={colors.yellow} />
                    </Pressable>
                  </Pressable>
                ))}
              </>
            )}

            {favoriteLeagues.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>LİGLER</Text>
                {favoriteLeagues.map((league) => (
                  <View key={`l-${league.id}`} style={styles.row}>
                    <View style={styles.scopeIcon}>
                      <Ionicons name="trophy-outline" size={18} color={colors.turf} />
                    </View>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {league.name}
                    </Text>
                    <Pressable
                      onPress={() => toggleFavoriteLeague(league)}
                      hitSlop={10}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="star" size={19} color={colors.yellow} />
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            {favoriteSeasons.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>SEZONLAR</Text>
                {favoriteSeasons.map((season) => (
                  <View key={`s-${season.id}`} style={styles.row}>
                    <View style={styles.scopeIcon}>
                      <Ionicons name="calendar-outline" size={18} color={colors.turf} />
                    </View>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {season.name}
                    </Text>
                    <Pressable
                      onPress={() => toggleFavoriteSeason(season)}
                      hitSlop={10}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="star" size={19} color={colors.yellow} />
                    </Pressable>
                  </View>
                ))}
              </>
            )}
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
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  infoCard: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.turfDim,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  infoText: { flex: 1, fontSize: 11, fontWeight: "600", color: colors.line, lineHeight: 17 },
  sectionTitle: {
    ...type.caption,
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.faint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  pressed: { opacity: 0.75 },
  scopeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: { flex: 1, ...type.body, color: colors.line },
  removeBtn: { padding: 4 },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl * 2 },
  emptyTitle: { ...type.subtitle, color: colors.line },
  emptyDesc: {
    ...type.small,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
  },
});
