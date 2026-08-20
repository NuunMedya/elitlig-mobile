import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Touchable } from "@/components/ui";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useAuth } from "@/providers/AuthProvider";
import { colors, radius, space, touchSlop, type } from "@/theme";

/**
 * MESAJ KISAYOLU — her ana ekranın başlığında duran zarf düğmesi.
 *
 * NEDEN BAŞLIKTA: mesajlaşma daha önce Profil → Kulübüm → Mesajlarım
 * altındaydı; yönetimle yazışmak için üç dokunuş gerekiyordu ve gelen mesaj
 * yalnız Profil sekmesinin rozetinden fark ediliyordu. Yazışma bu uygulamada
 * bir "ayar" değil, sık kullanılan bir iş: sekme çubuğunu altıncı sekmeyle
 * şişirmeden her ekrandan tek dokunuşa indiriliyor.
 *
 * Rozet YALNIZ okunmamış mesaj sayısını gösterir (bildirim sayısını değil):
 * zarf ikonunun yanındaki sayı bildirimleri sayarsa kullanıcı mesaj sanıp
 * açar ve boş liste görür.
 *
 * Girişsiz kullanıcıda hiç çizilmez — gidecek bir yazışma kutusu yok.
 */
export const MessagesButton = memo(function MessagesButton() {
  const router = useRouter();
  const auth = useAuth();
  const { messages } = useUnreadCount();

  if (!auth.user) return null;

  const count = messages > 99 ? "99+" : messages > 0 ? String(messages) : null;

  return (
    <Touchable
      feedback="icon"
      haptic="light"
      onPress={() => router.push("/mesajlarim")}
      hitSlop={touchSlop(36)}
      accessibilityLabel={
        messages > 0 ? `Mesajlar, ${messages} okunmamış` : "Mesajlar"
      }
      style={styles.button}
    >
      <Ionicons
        name={messages > 0 ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
        size={20}
        color={messages > 0 ? colors.brandAccent : colors.textSecondary}
      />
      {count ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} allowFontScaling={false} numberOfLines={1}>
            {count}
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
    alignItems: "center",
    justifyContent: "center",
    // Zeminden ayrılsın: koyu temada rozet ikonun üstüne binince okunmuyor.
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  badgeText: {
    ...type.micro,
    color: colors.textOnStatus,
    letterSpacing: 0,
    lineHeight: 13,
  },
});
