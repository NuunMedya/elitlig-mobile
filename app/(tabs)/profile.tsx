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

function pendingLabel(type: string, targetType: string): { icon: string; title: string; desc: string } {
  const t = String(type).toLowerCase();
  const tt = String(targetType).toLowerCase();
  if (t.includes("transfer")) return { icon: "swap-horizontal-outline", title: "Transfer Talebi", desc: "Takım değişikliği onay bekliyor" };
  if (t.includes("contract") || tt.includes("contract")) return { icon: "document-text-outline", title: "Sözleşme Talebi", desc: "Sözleşme güncellemesi onay bekliyor" };
  if (t.includes("squad") || tt.includes("squad")) return { icon: "people-outline", title: "Kadro Değişikliği", desc: "Kadro güncellemesi onay bekliyor" };
  if (t.includes("photo")) return { icon: "camera-outline", title: "Fotoğraf Talebi", desc: "Profil fotoğrafı onay bekliyor" };
  return { icon: "hourglass-outline", title: "Bekleyen Talep", desc: "Onay bekleniyor" };
}

function pendingRoute(type: string): string | null {
  const t = String(type).toLowerCase();
  if (t.includes("transfer")) return "/tekliflerim";
  if (t.includes("contract")) return "/sozlesmelerim";
  if (t.includes("squad") || t.includes("kadro")) return "/maclarim";
  if (t.includes("penalty") || t.includes("ceza")) return "/cezalarim";
  return null; // fotoğraf vb. → modal
}

function statusColor(status: string): string {
  if (status === "approved") return "#178A50";
  if (status === "rejected") return "#DC2626";
  return "#E8B00A";
}

function statusLabel(status: string): string {
  if (status === "approved") return "Onaylandı";
  if (status === "rejected") return "Reddedildi";
  if (status === "pending")  return "Bekliyor";
  return status;
}

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

          {/* Teklifler ve sözleşmeler kapıları */}
          <Pressable
            onPress={() => router.push("/tekliflerim")}
            style={({ pressed }) => [styles.card, styles.navRow, pressed && styles.pressed]}
          >
            <Ionicons name="swap-horizontal-outline" size={18} color={colors.turf} />
            <View style={styles.heroBody}>
              <Text style={styles.navTitle}>Transfer Tekliflerim</Text>
              <Text style={styles.heroMeta}>Gelen teklifleri gör, kabul et ya da reddet</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/sozlesmelerim")}
            style={({ pressed }) => [styles.card, styles.navRow, pressed && styles.pressed]}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.turf} />
            <View style={styles.heroBody}>
              <Text style={styles.navTitle}>Sözleşmelerim</Text>
              <Text style={styles.heroMeta}>Aktif ve geçmiş sözleşmelerin</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            onPress={() => router.push("/cezalarim")}
            style={({ pressed }) => [styles.card, styles.navRow, pressed && styles.pressed]}
          >
            <Ionicons name="shield-half-outline" size={18} color={colors.turf} />
            <View style={styles.heroBody}>
              <Text style={styles.navTitle}>Cezalarım ve Savunma</Text>
              <Text style={styles.heroMeta}>Disiplin dosyaların, savunma ve itiraz</Text>
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


          {/* Bekleyen talepler */}
          {me.pendingChanges.length > 0 ? (
            <View style={styles.card}>
              <View style={styles.cardKickerRow}>
                <Text style={styles.cardKicker}>BEKLEYEN TALEPLERİM</Text>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeTxt}>{me.pendingChanges.length}</Text>
                </View>
              </View>
              {me.pendingChanges.map((change) => {
                const label = pendingLabel(change.type, change.target_type);
                const route = pendingRoute(change.type);
                return (
                  <Pressable
                    key={change.id}
                    onPress={() => {
                      if (route) {
                        router.push(route as any);
                      } else {
                        const { Alert } = require("react-native");
                        Alert.alert(
                          "Talep İnceleniyor",
                          `"${label.title}" talebiniz yönetim tarafından inceleniyor. Onaylandığında bildirim alacaksınız.`,
                          [{ text: "Tamam" }]
                        );
                      }
                    }}
                    style={({ pressed }) => [styles.changeRow, pressed && styles.pressed]}
                  >
                    <View style={styles.changeIcon}>
                      <Ionicons name={label.icon as any} size={16} color={colors.yellow} />
                    </View>
                    <View style={styles.changeBody}>
                      <Text style={styles.changeText} numberOfLines={1}>{label.title}</Text>
                      <Text style={styles.changeDesc} numberOfLines={1}>{label.desc}</Text>
                    </View>
                    <View style={[styles.changeChip, { backgroundColor: statusColor(change.status) + "18" }]}>
                      <Text style={[styles.changeChipTxt, { color: statusColor(change.status) }]}>
                        {statusLabel(change.status)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
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
  cardKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  pendingBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.yellow,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  pendingBadgeTxt: {
    fontSize: 11,
    fontWeight: "900",
    color: "#000",
  },
  changeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.yellow + "18",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  changeBody: {
    flex: 1,
    gap: 2,
  },
  changeDesc: {
    fontSize: 10,
    fontWeight: "500",
    color: colors.muted,
  },
  changeChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  changeChipTxt: {
    fontSize: 9,
    fontWeight: "800",
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
