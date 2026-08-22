/**
 * YouTube canlı yayın şeridi.
 *
 * Şehrin kanalı tanımlıysa görünür; canlı maç varken /live kısayoluna
 * (doğrudan yayına), yokken kanal sayfasına götürür.
 *
 * TOKEN GEÇİŞİ: elle yazılmış `isDark ? "#33191C" : "#FDECEC"` çiftleri
 * kaldırıldı — zemin `colors.dangerDim`, çerçeve `danger`in %30 saydamı.
 * Böylece şerit her iki temada da paletle birlikte hareket eder ve dosyada
 * tema dallanması kalmaz.
 *
 * SABİT HEX — TEK İSTİSNA: YouTube kırmızısı ÜÇÜNCÜ TARAF MARKA RENGİDİR;
 * logo her temada aynı kırmızıdır, paletten türetilemez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text } from "react-native";
import { Touchable, withAlpha } from "@/components/ui";
import { openLink } from "@/lib/links";
import {
  colors,
  fonts,
  radius,
  space,
  textScale,
  type,
} from "@/theme";
import { youtubeChannelUrl, youtubeLiveUrl } from "@/lib/youtube";

/** YouTube kurumsal kırmızısı — üçüncü taraf marka rengi, temadan bağımsızdır. */
const YOUTUBE_RED = "#FF0000";

export function YoutubeBanner({
  cityLabel,
  live,
}: {
  cityLabel?: string | null;
  live: boolean;
}) {
  const url = live ? youtubeLiveUrl(cityLabel) : youtubeChannelUrl(cityLabel);
  if (!url) return null;

  const label = live ? "Canlı yayını YouTube'da izle" : "YouTube kanalına git";

  return (
    <Touchable
      feedback="card"
      haptic="light"
      onPress={() => openLink(url)}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={styles.banner}
    >
      <Ionicons name="logo-youtube" size={20} color={YOUTUBE_RED} />
      <Text style={styles.text} {...textScale.dense}>
        {label}
      </Text>
      <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.dangerDim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(colors.danger, 0.3),
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    marginBottom: space.sm,
  },
  text: {
    ...type.bodySm,
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    flex: 1,
  },
});
