import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { colors, radius, spacing, type } from "@/constants/theme";
import { openLink } from "@/lib/links";
import { instagramUrl } from "@/lib/socials";
import { youtubeChannelUrl } from "@/lib/youtube";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";

/**
 * Menü — sekme çubuğuna sığmayan her şeyin evi.
 *
 * Satırlar üç grupta toplanır: Keşfet, Bilgi, Bizi Takip Et. Tüm satırlar tek
 * tip MenuRow bileşenidir ve yönlendirme router.push ile yapılır — Link
 * kullanılmaz, çünkü Link + asChild sarmalaması satır düzenini bozuyordu.
 */
export default function MenuScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const user = auth?.user ?? null;
  const channelUrl = youtubeChannelUrl(scope.cityLabel);
  const igUrl = instagramUrl(scope.cityLabel);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Menü" />

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => router.push("/profile")}
          style={({ pressed }) => [styles.userCard, pressed && styles.pressed]}
        >
          <View style={styles.avatar}>
            <Ionicons
              name={user ? "person" : "person-outline"}
              size={24}
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
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <Text style={styles.groupTitle}>KEŞFET</Text>
        <View style={styles.group}>
          <MenuRow
            icon="map-outline"
            label="Şehir değiştir"
            note={scope.cityLabel || "Bölgeni seç"}
            onPress={() => router.push("/sehir")}
          />
          <MenuRow
            icon="game-controller-outline"
            label="Arena"
            note="Seri Modu · rekoru kovala"
            onPress={() => router.push("/arena")}
          />
          <MenuRow
            icon="newspaper-outline"
            label="Haberler"
            note="Manşetler, transferler, duyurular"
            onPress={() => router.push("/news")}
          />
          <MenuRow
            icon="archive-outline"
            label="Arşiv"
            note="Tamamlanan lig ve sezonlar"
            onPress={() => router.push("/arsiv")}
            last
          />
        </View>

        <Text style={styles.groupTitle}>BİLGİ</Text>
        <View style={styles.group}>
          <MenuRow
            icon="book-outline"
            label="Lig Kuralları"
            note="Resmî müsabaka kuralları"
            onPress={() => router.push("/kurallar")}
          />
          <MenuRow
            icon="alert-circle-outline"
            label="Cezalar"
            note="Disiplin kayıtları"
            onPress={() => router.push("/cezalar")}
          />
          <MenuRow
            icon="mail-outline"
            label="İletişim"
            note="Telefon, WhatsApp, e-posta"
            onPress={() => router.push("/iletisim")}
            last
          />
        </View>

        <Text style={styles.groupTitle}>BİZİ TAKİP ET</Text>
        <View style={styles.group}>
          {igUrl ? (
            <MenuRow
              icon="logo-instagram"
              label="Instagram"
              note={`${scope.cityLabel} hesabı`}
              onPress={() => openLink(igUrl)}
            />
          ) : null}
          {channelUrl ? (
            <MenuRow
              icon="logo-youtube"
              label="YouTube"
              note="Canlı yayınlar ve maç özetleri"
              onPress={() => openLink(channelUrl)}
            />
          ) : null}
          <MenuRow
            icon="globe-outline"
            label="elitlig.com"
            note="Web sitemiz"
            onPress={() => openLink("https://elitlig.com")}
            last
          />
        </View>

        <Text style={styles.version}>ElitLig Mobil</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({
  icon,
  label,
  note,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  note?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.pressed]}
    >
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={18} color={colors.turf} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {note ? (
          <Text style={styles.rowNote} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
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
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  groupTitle: {
    ...type.caption,
    color: colors.muted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  group: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.faint,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: radius.sm + 1,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
  },
  rowLabel: {
    ...type.body,
    color: colors.line,
    fontWeight: "600",
  },
  rowNote: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: 1,
  },
  version: {
    ...type.caption,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  pressed: {
    opacity: 0.7,
  },
});
