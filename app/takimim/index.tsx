import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, Loading } from "@/components/States";
import { TeamCrest } from "@/components/TeamCrest";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getTeamDashboard } from "@/lib/api/team";
import { mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Takım Panelim — başkanın giriş kapısı.
 *
 * /api/team-management/dashboard tek çağrıyla takımı, kadroyu ve bekleyen
 * talepleri getirir. Üst kartta takım kimliği ve hızlı sayılar (kadro
 * büyüklüğü, puan, lig), altında panelin alt ekranlarına giden satırlar
 * bulunur. Takım yönetimi yetkisi olmayan hesaplara nazik bir açıklama
 * gösterilir (sunucu managed:false + onboarding metni döndürür).
 */

const LINKS: {
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
}[] = [
  {
    href: "/takimim/kadro",
    icon: "people-outline",
    title: "Kadro Yönetimi",
    desc: "Forma numarası, mevki ve kadro rolleri",
  },
  {
    href: "/takimim/mac-merkezi",
    icon: "football-outline",
    title: "Maç Merkezi",
    desc: "Fikstür, yoklama ve maç karnesi",
  },
  {
    href: "/takimim/kasa",
    icon: "wallet-outline",
    title: "Kulüp Kasası",
    desc: "Gelir-gider, kadro değeri ve FFP durumu",
  },
  {
    href: "/davetler",
    icon: "mail-open-outline",
    title: "Davet ve Başvurular",
    desc: "Oyuncu davetleri ve katılım başvuruları",
  },
  {
    href: "/mesajlarim",
    icon: "chatbubbles-outline",
    title: "Mesajlar",
    desc: "Lig yönetimiyle yazışmaların",
  },
];

export default function TeamPanelScreen() {
  const auth = useAuth();
  const router = useRouter();

  const hasTeamScope = Boolean(
    auth.user &&
      (auth.user.managed_team_id ||
        auth.user.profile_type === "takim_baskani" ||
        auth.user.profile_type === "double")
  );

  const query = useQuery({
    queryKey: ["takim", "dashboard"],
    queryFn: getTeamDashboard,
    enabled: Boolean(auth.user) && hasTeamScope,
    staleTime: 60_000,
    retry: false,
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  if (!hasTeamScope) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Takım Panelim" />
        <EmptyState
          icon="shield-outline"
          title="Takım başkanlığı gerekli"
          body="Bu alan, bir takımın yönetimini üstlenen başkanlara özeldir. Takımını sahiplenmek veya yeni takım oluşturmak için elitlig.com üzerinden takım yönetimi başvurusu yapabilirsin."
        />
      </SafeAreaView>
    );
  }

  const data = query.data;
  const squadSize = data
    ? data.roster.contracted.length + data.roster.withoutContract.length
    : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Takım Panelim" subtitle="Kulübünün yönetim merkezi" />

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !data ? null : !data.managed || !data.team ? (
        <EmptyState
          icon="shield-outline"
          title={data.onboarding?.title ?? "Henüz bir takım yönetmiyorsun"}
          body={
            data.onboarding?.description ??
            "Takım yönetimi başvurusu elitlig.com üzerinden yapılır."
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Takım kimlik kartı */}
          <Pressable
            onPress={() => router.push(`/takim/${data.team!.id}`)}
            style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
          >
            <TeamCrest name={data.team.team_name} logo={mediaUrl(data.team.logo)} size={52} />
            <View style={styles.heroBody}>
              <Text style={styles.heroName} numberOfLines={1}>
                {data.team.team_name.toLocaleUpperCase("tr-TR")}
              </Text>
              <Text style={styles.heroMeta} numberOfLines={1}>
                {[data.team.current_league, data.team.current_season]
                  .filter(Boolean)
                  .join(" · ") || "Lig bilgisi yok"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#D9CBF6" />
          </Pressable>

          {/* Hızlı sayılar */}
          <View style={styles.kpiRow}>
            <Kpi label="KADRO" value={String(squadSize)} />
            <Kpi label="SÖZLEŞMELİ" value={String(data.roster.contracted.length)} />
            <Kpi
              label="PUAN"
              value={data.team.team_points != null ? String(data.team.team_points) : "—"}
            />
            <Kpi
              label="G-B-M"
              value={
                data.team.team_wins != null
                  ? `${data.team.team_wins ?? 0}-${data.team.team_draws ?? 0}-${data.team.team_losses ?? 0}`
                  : "—"
              }
            />
          </View>

          {/* Bekleyen değişiklik talepleri */}
          {data.pendingChanges.length > 0 ? (
            <View style={styles.pendingCard}>
              <Ionicons name="hourglass-outline" size={15} color={colors.yellow} />
              <Text style={styles.pendingText}>
                {data.pendingChanges.length} değişiklik talebi yönetici onayı bekliyor
              </Text>
            </View>
          ) : null}

          {/* Alt ekran bağlantıları */}
          {LINKS.map((link) => (
            <Pressable
              key={link.title}
              onPress={() => router.push(link.href)}
              style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
            >
              <View style={styles.navIcon}>
                <Ionicons name={link.icon} size={17} color={colors.turf} />
              </View>
              <View style={styles.heroBody}>
                <Text style={styles.navTitle}>{link.title}</Text>
                <Text style={styles.navDesc}>{link.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.kpiLabel}>{label}</Text>
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
  hero: {
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
  kpiRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  kpi: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
  },
  kpiValue: {
    ...type.subtitle,
    color: colors.line,
    fontVariant: ["tabular-nums"],
  },
  kpiLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.muted,
  },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.goldDim,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pendingText: {
    ...type.caption,
    color: colors.line,
    letterSpacing: 0,
    flex: 1,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  navIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    ...type.small,
    fontWeight: "800",
    color: colors.line,
  },
  navDesc: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
