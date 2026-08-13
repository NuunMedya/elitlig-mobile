import Ionicons from "@expo/vector-icons/Ionicons";
import { Link, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Loading } from "@/components/States";
import { PlayerAvatar } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";

/**
 * Profil.
 *
 * Oturum açmamış kullanıcıya girişi anlatır; açmış kullanıcıya hesabını,
 * bağlı olduğu oyuncu/takım kaydını ve kısayolları gösterir. Yönetim işlemleri
 * (maç yönetimi, kadro onayları) web panelinde kalır — mobil, sahadaki
 * kullanıcının ihtiyacı olan okuma akışına odaklanır.
 */
export default function ProfileScreen() {
  const { user, initializing, signOut } = useAuth();
  const scope = useScope();
  const router = useRouter();

  if (initializing) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Profil" />
        <Loading />
      </SafeAreaView>
    );
  }

  const confirmSignOut = () => {
    Alert.alert("Çıkış yap", "Oturumunuz bu cihazda kapatılacak.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Çıkış yap", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Profil" />

      <ScrollView contentContainerStyle={styles.content}>
        {user ? (
          <>
            <View style={styles.identity}>
              <PlayerAvatar name={user.fullName || user.username} size={64} />
              <View style={styles.identityText}>
                <Text style={styles.name}>{user.fullName || user.username}</Text>
                <Text style={styles.meta}>@{user.username}</Text>
                {user.teamName ? <Text style={styles.meta}>{user.teamName}</Text> : null}
              </View>
            </View>

            <View style={styles.card}>
              <InfoRow icon="shield-checkmark-outline" label="Rol" value={roleLabel(user.role)} />
              <InfoRow icon="location-outline" label="Şehir" value={user.city || "—"} />
              {user.email ? <InfoRow icon="mail-outline" label="E-posta" value={user.email} /> : null}
            </View>

            {user.player_id ? (
              <Pressable
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                onPress={() => router.push(`/oyuncu/${user.player_id}`)}
              >
                <Ionicons name="person-circle-outline" size={20} color={colors.turf} />
                <Text style={styles.actionText}>Oyuncu profilim</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.faint} />
              </Pressable>
            ) : null}

            {user.managed_team_id ? (
              <Pressable
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                onPress={() => router.push(`/takim/${user.managed_team_id}`)}
              >
                <Ionicons name="shield-half-outline" size={20} color={colors.turf} />
                <Text style={styles.actionText}>Takımım</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.faint} />
              </Pressable>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              onPress={confirmSignOut}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.live} />
              <Text style={[styles.actionText, { color: colors.live }]}>Çıkış yap</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.guest}>
            <Ionicons name="person-circle-outline" size={56} color={colors.faint} />
            <Text style={styles.guestTitle}>Giriş yapın</Text>
            <Text style={styles.guestBody}>
              Maçları ve puan durumunu giriş yapmadan da izleyebilirsiniz. Hesabınızla
              girdiğinizde oyuncu profiliniz ve takımınız burada görünür.
            </Text>
            <Link href="/giris" asChild>
              <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Giriş yap</Text>
              </Pressable>
            </Link>
          </View>
        )}

        <View style={styles.scopeCard}>
          <Text style={styles.scopeTitle}>Takip edilen lig</Text>
          <Text style={styles.scopeValue}>
            {[scope.cityLabel, scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ") ||
              "Seçilmedi"}
          </Text>
          <Text style={styles.scopeHint}>
            Değiştirmek için herhangi bir sekmenin üstündeki filtreye dokunun.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={colors.muted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Sunucudaki rol adlarının Türkçe karşılıkları. */
function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Yönetici",
    editor: "Editör",
    moderator: "Moderatör",
    team: "Takım yetkilisi",
    player: "Oyuncu",
    user: "Üye",
  };
  return labels[role] ?? role;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...type.title,
    color: colors.line,
  },
  meta: {
    ...type.small,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  infoLabel: {
    ...type.small,
    color: colors.muted,
    width: 70,
  },
  infoValue: {
    ...type.small,
    color: colors.line,
    flex: 1,
    textAlign: "right",
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  actionText: {
    ...type.body,
    color: colors.line,
    flex: 1,
  },
  pressed: {
    opacity: 0.8,
  },
  guest: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  guestTitle: {
    ...type.title,
    color: colors.line,
  },
  guestBody: {
    ...type.small,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  primary: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.turf,
  },
  primaryText: {
    ...type.body,
    color: colors.pitch,
    fontWeight: "800",
  },
  scopeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  scopeTitle: {
    ...type.caption,
    color: colors.muted,
  },
  scopeValue: {
    ...type.body,
    color: colors.line,
  },
  scopeHint: {
    ...type.caption,
    color: colors.faint,
    letterSpacing: 0,
    lineHeight: 17,
  },
});
