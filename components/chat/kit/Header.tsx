/**
 * SOHBET ÜST ÇUBUĞU + DURUM ÇUBUĞU.
 *
 * `WaHeader`: mesajlar bölümündeki ikincil ekranların (kişi / grup bilgisi,
 * yıldızlı mesajlar, yeni sohbet) düz WhatsApp başlığı — geri oku, başlık,
 * isteğe bağlı alt başlık ve altına eklenen içerik (`bottom`: hap / arama).
 * Ortak `ScreenHeader` koyu mor blok çizdiği için burada kullanılmaz.
 *
 * `ChatStatusBar`: kök düzen durum çubuğunu DAİMA açık simgeli tutar (her
 * ekranın tepesinde koyu mor blok var). Mesajlar bölümünün başlıkları açık
 * temada BEYAZDIR; bu bileşen ekran odaktayken simgeleri koyuya çevirir,
 * odak gidince kendini kaldırır (kök ayar geri gelir). Sekme ekranı sekme
 * değişince sökülmediği için `useIsFocused` şarttır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/lib/chatPalette";
import { hairline, isDark, space, textScale, type } from "@/theme";

import { Touchable } from "./Pressable";

export function ChatStatusBar() {
  const focused = useIsFocused();
  return focused ? <StatusBar style={isDark ? "light" : "dark"} /> : null;
}

export interface WaHeaderProps {
  title: string;
  subtitle?: string;
  /** Geri oku gösterilsin mi; `onBack` verilmezse bir önceki ekrana döner. */
  back?: boolean;
  onBack?: () => void;
  /** Başlık satırının sağındaki öğeler. */
  right?: ReactNode;
  /** Başlığın altına, aynı yüzeyde çizilen içerik (hap, arama). */
  bottom?: ReactNode;
}

export const WaHeader = memo(function WaHeader({ title, subtitle, back, onBack, right, bottom }: WaHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const goBack = () => {
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  return (
    // Ekran `SafeAreaView edges={["top"]}` kullanır; başlık üst güvenli alanın
    // üstüne taşarak durum çubuğu bölgesini kendi yüzey rengiyle boyar
    // (ortak ScreenHeader ile aynı yöntem).
    <View style={[styles.wrap, { marginTop: -insets.top, paddingTop: insets.top }]}>
      <ChatStatusBar />
      <View style={styles.bar}>
        {back ? (
          <Touchable feedback="icon" haptic="light" onPress={goBack} hitSlop={6} accessibilityRole="button" accessibilityLabel="Geri" style={styles.back}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Touchable>
        ) : null}
        <View style={[styles.titles, back ? null : styles.titlesAlone]}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header" {...textScale.dense}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {bottom}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface1, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  bar: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: space.xs },
  back: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  titles: { flex: 1, minWidth: 0, paddingLeft: space.sm },
  titlesAlone: { paddingLeft: space.md },
  title: { ...type.h1, color: colors.textPrimary },
  subtitle: { ...type.bodySm, color: colors.textSecondary },
});
