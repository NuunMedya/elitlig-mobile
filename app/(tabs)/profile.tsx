import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { ErrorState, Loading } from "@/components/States";
import { PlayerAvatar, TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getPanelMe } from "@/lib/api/panel";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Profilim — web'deki Oyuncu Yönetimi panelinin mobil özeti (Faz 1).
 *
 * Girişli üyenin /api/panel/me verisini gösterir: profil kartı, sezon
 * istatistikleri, son maçlar, mesaj önizlemesi ve bekleyen talepler.
 * Giriş yoksa /giris'e yönlendirir. Oyuncu profili henüz bağlanmamışsa
 * sunucunun onboarding metni gösterilir; talep akışları sonraki fazda.
 */

export default function ProfileScreen() {
  const auth = useAuth();
  const router = useRouter();

  const meQuery = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const me = meQuery.data;
  const unread = (me?.messages ?? []).filter((m) => !m.read).length;

  const confirmSignOut = () => {
    Alert.alert("Çıkış yap", "Oturumu kapatmak istediğine emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Çıkış yap",
        style: "destructive",
        onPress: () => auth.signOut().then(() => router.replace("/(tabs)/menu")),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Profilim" subtitle={auth.user.fullName ?? auth.user.username} />

      {meQuery.isLoading ? (
        <Loading />
      ) : meQuery.isError ? (
        <ErrorState error={meQuery.error} onRetry={meQuery.refetch} />
      ) : !me ? null : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Profil kartı */}
          {me.player ? (
            <Pressable
              onPress={() => router.push(`/oyuncu/${me.player!.id}`)}
              style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}
            >
              <PlayerAvatar
                name={me.player.player_name}
                image={mediaUrl(me.player.player_img)}
                size={56}
              />
              <View style={styles.heroBody}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {me.player.player_name.toLocaleUpperCase("tr-TR")}
                </Text>
                <Text style={styles.heroMeta} numberOfLines={1}>
                  {[me.player.player_position, me.playerTeam?.team_name]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ) : (
            <View style={styles.onboardCard}>
              <Text style={styles.onboardTitle}>
                {me.onboarding?.player?.title ?? "Oyuncu profilin henüz bağlı değil"}
              </Text>
              <Text style={styles.onboardBody}>
                {me.onboarding?.player?.description ??
                  "Profil oluşturma ve sahiplenme talepleri şimdilik web panelinden yapılıyor; yakında uygulamaya da geliyor."}
              </Text>
            </View>
          )}

          {/* Sezon istatistikleri */}
          {me.stats ? (
            <View style={styles.statsCard}>
              <Text style={styles.cardKicker}>
                SEZON İSTATİSTİKLERİ{me.stats.season ? ` · ${me.stats.season}` : ""}
              </Text>
              <View style={styles.statsRow}>
                <Stat label="MAÇ" value={String(me.stats.matches ?? 0)} />
                <Stat label="GOL" value={String(me.stats.goals ?? 0)} />
                <Stat label="ASİST" value={String(me.stats.assists ?? 0)} />
                <Stat
                  label="PUAN"
                  value={me.stats.rating != null ? String(me.stats.rating) : "—"}
                  highlight
                />
              </View>
            </View>
          ) : null}

          {/* Maçlarım kapısı */}
          <Pressable
            onPress={() => router.push("/maclarim")}
            style={({ pressed }) => [styles.card, styles.navRow, pressed && styles.pressed]}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.turf} />
            <View style={styles.heroBody}>
              <Text style={styles.navTitle}>Maçlarım</Text>
              <Text style={styles.heroMeta}>Yaklaşan ve oynanan tüm maçların</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          {/* Son maçlar */}
          {me.recentMatches.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardKicker}>SON MAÇLAR</Text>
              {me.recentMatches.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => router.push(`/mac/${m.id}`)}
                  style={({ pressed }) => [styles.matchRow, pressed && styles.pressed]}
                >
                  <Text style={styles.matchDate}>{formatDateShort(m.date)}</Text>
                  <Text style={styles.matchTeams} numberOfLines={1}>
                    {m.home_team} – {m.away_team}
                  </Text>
                  <Text style={styles.matchScore}>
                    {m.home_score ?? "-"} - {m.away_score ?? "-"}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Mesajlar önizleme */}
          <View style={styles.card}>
            <View style={styles.cardHeadRow}>
              <Text style={styles.cardKicker}>MESAJLAR</Text>
              {unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread} yeni</Text>
                </View>
              ) : null}
            </View>
            {me.messages.length === 0 ? (
              <Text style={styles.emptyLine}>Henüz mesajın yok.</Text>
            ) : (
              me.messages.slice(0, 3).map((msg) => (
                <View key={msg.id} style={styles.messageRow}>
                  <View style={[styles.dot, !msg.read && styles.dotUnread]} />
                  <View style={styles.messageBody}>
                    <Text
                      style={[styles.messageSubject, !msg.read && styles.messageSubjectUnread]}
                      numberOfLines={1}
                    >
                      {msg.subject}
                    </Text>
                    <Text style={styles.messagePreview} numberOfLines={1}>
                      {msg.preview}
                    </Text>
                  </View>
                  <Text style={styles.messageDate}>{formatDateShort(msg.created_at)}</Text>
                </View>
              ))
            )}
            <Text style={styles.soonLine}>Mesajlaşma ekranı yakında uygulamada.</Text>
          </View>

          {/* Bekleyen talepler */}
          {me.pendingChanges.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardKicker}>BEKLEYEN TALEPLERİM</Text>
              {me.pendingChanges.map((change) => (
                <View key={change.id} style={styles.changeRow}>
                  <Ionicons name="hourglass-outline" size={14} color={colors.yellow} />
                  <Text style={styles.changeText} numberOfLines={1}>
                    {change.type} · {change.target_type}
                  </Text>
                  <Text style={styles.changeStatus}>{change.status}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Yönetilen takım */}
          {me.team ? (
            <Pressable
              onPress={() => router.push(`/takim/${me.team!.id}`)}
              style={({ pressed }) => [styles.card, styles.teamRow, pressed && styles.pressed]}
            >
              <TeamCrest name={me.team.team_name} logo={mediaUrl(me.team.logo)} size={34} />
              <View style={styles.heroBody}>
                <Text style={styles.teamName}>{me.team.team_name}</Text>
                <Text style={styles.heroMeta}>Yönettiğin takım</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ) : null}

          <Pressable
            onPress={confirmSignOut}
            style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
          >
            <Ionicons name="log-out-outline" size={16} color={colors.live} />
            <Text style={styles.signOutText}>Çıkış yap</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, highlight && styles.statValueHighlight]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
    gap: spacing.sm,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.turf,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  heroBody: {
    flex: 1,
  },
  heroName: {
    ...type.body,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroMeta: {
    ...type.caption,
    color: "#D9CBF6",
    letterSpacing: 0,
    marginTop: 2,
  },
  onboardCard: {
    backgroundColor: colors.turfDim,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  onboardTitle: {
    ...type.small,
    fontWeight: "800",
    color: colors.turf,
  },
  onboardBody: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    lineHeight: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.turf,
    marginBottom: spacing.sm,
  },
  cardHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statsRow: {
    flexDirection: "row",
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    ...type.subtitle,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  statValueHighlight: {
    color: colors.turf,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.muted,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  matchDate: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    width: 46,
  },
  matchTeams: {
    ...type.caption,
    color: colors.line,
    letterSpacing: 0,
    flex: 1,
  },
  matchScore: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  badge: {
    backgroundColor: colors.live,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  emptyLine: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.faint,
  },
  dotUnread: {
    backgroundColor: colors.live,
  },
  messageBody: {
    flex: 1,
  },
  messageSubject: {
    ...type.small,
    color: colors.line,
  },
  messageSubjectUnread: {
    fontWeight: "800",
  },
  messagePreview: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
  messageDate: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
  },
  soonLine: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: spacing.sm,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 5,
  },
  changeText: {
    ...type.caption,
    color: colors.line,
    letterSpacing: 0,
    flex: 1,
  },
  changeStatus: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.yellow,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  navTitle: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  teamName: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.md,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.live,
  },
  pressed: {
    opacity: 0.7,
  },
});
