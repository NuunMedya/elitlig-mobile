import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getAdminMessages, ROLE_LABELS } from "@/lib/api/admin";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Yönetim Paneli — yönetim rollerine açılan giriş ekranı.
 *
 * Kartlar üç alt ekrana götürür: Maç Yönetimi, Mesaj Yönetimi (okunmamış
 * rozetiyle) ve Saha Yönetimi. Yetkisiz üyeler nazik bir uyarı görür;
 * misafirler giriş ekranına yönlendirilir.
 */

interface PanelCard {
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const CARDS: PanelCard[] = [
  {
    href: "/yonetim/maclar",
    icon: "football-outline",
    title: "Maç Yönetimi",
    body: "Skor gir, durum değiştir, taslakları yönet",
  },
  {
    href: "/yonetim/mesajlar",
    icon: "chatbubbles-outline",
    title: "Mesaj Yönetimi",
    body: "Üye başvurularını yanıtla ve kapat",
  },
  {
    href: "/yonetim/sahalar",
    icon: "location-outline",
    title: "Saha Yönetimi",
    body: "Maç taleplerini incele, saha programını düzenle",
  },
];

export default function YonetimIndexScreen() {
  const router = useRouter();
  const auth = useAuth();

  // Okunmamış başvuru rozeti: mesaj listesi zaten sayaçları döndürüyor,
  // ayrı bir uç gerekmez. Yetki yoksa sorgu hiç çalışmaz.
  const messagesQuery = useQuery({
    queryKey: ["admin", "messages", "badge"],
    queryFn: () => getAdminMessages({ limit: 100 }),
    enabled: Boolean(auth.user) && auth.isManagement,
    staleTime: 30_000,
    retry: false,
  });

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  if (!auth.isManagement) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Yönetim Paneli" />
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.faint} />
          <Text style={styles.centerTitle}>Yetkiniz yok</Text>
          <Text style={styles.centerBody}>
            Bu bölüm yalnızca ElitLig yönetim rollerine açıktır. Yetkiniz olduğunu
            düşünüyorsanız yönetimle iletişime geçin.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const roleLabel = ROLE_LABELS[auth.user.role] ?? auth.user.role;
  const unreadThreads = messagesQuery.data?.counts.unread ?? 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Yönetim Paneli" subtitle="ElitLig yönetim araçları" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Yönetici kimlik şeridi */}
        <View style={styles.identity}>
          <View style={styles.identityIcon}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.turf} />
          </View>
          <View style={styles.identityBody}>
            <Text style={styles.identityName} numberOfLines={1}>
              {auth.user.fullName || auth.user.username}
            </Text>
            <View style={styles.roleChip}>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        {CARDS.map((card) => {
          const showBadge = card.href === "/yonetim/mesajlar" && unreadThreads > 0;
          return (
            <Pressable
              key={card.title}
              onPress={() => router.push(card.href)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardIcon}>
                <Ionicons name={card.icon} size={22} color={colors.turf} />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  {showBadge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadThreads}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardText}>{card.body}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
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
    gap: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  centerTitle: {
    ...type.subtitle,
    color: colors.line,
  },
  centerBody: {
    ...type.small,
    color: colors.muted,
    textAlign: "center",
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.turfDim,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  identityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  identityBody: {
    flex: 1,
    gap: 3,
  },
  identityName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.line,
  },
  roleChip: {
    alignSelf: "flex-start",
    backgroundColor: colors.turf,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.surface,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.line,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.live,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  cardText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.6,
  },
});
