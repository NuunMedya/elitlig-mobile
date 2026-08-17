import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, type } from "@/constants/theme";
import { openLink } from "@/lib/links";

/**
 * Maç alma düğmesi — başlıkta küçük yuvarlak telefon logosu.
 *
 * Numara ekranda görünmez; dokununca "Maç almak için:" başlıklı küçük bir
 * pencere açılır ve iki seçenek sunar: WhatsApp veya telefon araması.
 */

const PHONE = "05071690888";
const WHATSAPP = "905071690888";

export function CallCenterButton() {
  const [open, setOpen] = useState(false);

  const call = async () => {
    setOpen(false);
    try {
      await Linking.openURL(`tel:${PHONE}`);
    } catch {
      Alert.alert("Arama başlatılamadı", `Numaramız: 0507 169 08 88`);
    }
  };

  const whatsapp = async () => {
    setOpen(false);
    // Önce WhatsApp uygulaması doğrudan denenir; kurulu değilse wa.me sistemce açılır.
    try {
      await Linking.openURL(`whatsapp://send?phone=${WHATSAPP}`);
      return;
    } catch {}
    try {
      await Linking.openURL(`https://wa.me/${WHATSAPP}`);
    } catch {
      Alert.alert("WhatsApp açılamadı", `Numaramız: 0507 169 08 88`);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name="call" size={19} color="#FFFFFF" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Maç almak için:</Text>
            <View style={styles.optionsRow}>
              <Pressable
                onPress={whatsapp}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              >
                <View style={[styles.optionIcon, styles.whatsapp]}>
                  <Ionicons name="logo-whatsapp" size={30} color="#FFFFFF" />
                </View>
                <Text style={styles.optionLabel}>WhatsApp</Text>
              </Pressable>
              <Pressable
                onPress={call}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              >
                <View style={[styles.optionIcon, styles.phone]}>
                  <Ionicons name="call" size={28} color="#FFFFFF" />
                </View>
                <Text style={styles.optionLabel}>Telefon</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#34C759",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    minWidth: 260,
  },
  title: {
    ...type.subtitle,
    color: colors.line,
  },
  optionsRow: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  option: {
    alignItems: "center",
    gap: spacing.sm,
  },
  optionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  whatsapp: {
    backgroundColor: "#25D366",
  },
  phone: {
    backgroundColor: "#34C759",
  },
  optionLabel: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
  },
});
