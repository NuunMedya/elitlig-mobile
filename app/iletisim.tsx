import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { colors, radius, spacing, type } from "@/constants/theme";
import { openLink } from "@/lib/links";
import { instagramUrl } from "@/lib/socials";
import { youtubeChannelUrl } from "@/lib/youtube";
import { useScope } from "@/providers/ScopeProvider";

/**
 * İletişim — sitedeki iletişim sayfasının uygulama içi hali.
 *
 * Satırlara dokunmak doğrudan eylemi başlatır: telefon aramayı, WhatsApp
 * sohbetini, e-posta taslağını açar. Sosyal medya adresleri SOCIALS
 * sözlüğünde tutulur; boş bırakılan kanal ekranda görünmez.
 */

const PHONE = "05071690888";
const WHATSAPP = "905071690888";
const EMAIL = "destek@elitlig.com";

/** Sosyal hesap adresleri — doldurulunca satır otomatik görünür. */
const SOCIALS: { icon: string; label: string; url: string }[] = [
  { icon: "logo-facebook", label: "Facebook", url: "" },
  { icon: "logo-instagram", label: "Instagram", url: "https://www.instagram.com/elitlig.ankara/" },
  { icon: "logo-tiktok", label: "TikTok", url: "" },
];

export default function ContactScreen() {
  const scope = useScope();
  const channelUrl = youtubeChannelUrl(scope.cityLabel);
  const igUrl = instagramUrl(scope.cityLabel);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="İletişim" subtitle="Her an yanınızdayız" />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Bize ulaşın: telefon, WhatsApp ve e-posta ile sorularınızı, maç
          taleplerinizi ve geri bildirimlerinizi iletebilirsiniz.
        </Text>

        <ContactRow
          icon="call"
          tint="#3B72E8"
          kicker="TELEFON"
          value="0507 169 08 88"
          onPress={() => openLink(`tel:${PHONE}`)}
        />
        <ContactRow
          icon="logo-whatsapp"
          tint="#22A45D"
          kicker="WHATSAPP"
          value="0507 169 08 88"
          onPress={() => openLink(`https://wa.me/${WHATSAPP}`)}
        />
        <ContactRow
          icon="mail"
          tint="#E0447C"
          kicker="E-POSTA"
          value={EMAIL}
          onPress={() => openLink(`mailto:${EMAIL}`)}
        />
        {igUrl ? (
          <ContactRow
            icon="logo-instagram"
            tint="#C13584"
            kicker="INSTAGRAM"
            value={`${scope.cityLabel} hesabı`}
            onPress={() => openLink(igUrl)}
          />
        ) : null}
        {channelUrl ? (
          <ContactRow
            icon="logo-youtube"
            tint="#FF0000"
            kicker="YOUTUBE"
            value={`${scope.cityLabel} kanalı`}
            onPress={() => openLink(channelUrl)}
          />
        ) : null}
        {SOCIALS.filter((social) => social.url).map((social) => (
          <ContactRow
            key={social.label}
            icon={social.icon as never}
            tint={colors.turf}
            kicker={social.label.toLocaleUpperCase("tr-TR")}
            value={social.label}
            onPress={() => openLink(social.url)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ContactRow({
  icon,
  tint,
  kicker,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  kicker: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.iconBox, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={20} color="#FFFFFF" />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.value}>{value}</Text>
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
  intro: {
    ...type.small,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radius.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.muted,
  },
  value: {
    ...type.body,
    color: colors.line,
    fontWeight: "700",
    marginTop: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
