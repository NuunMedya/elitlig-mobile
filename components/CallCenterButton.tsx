/**
 * Maç alma düğmesi — başlıkta küçük yuvarlak telefon logosu.
 *
 * Numara ekranda görünmez; dokununca "Maç almak için:" başlıklı küçük bir
 * pencere açılır ve iki seçenek sunar: WhatsApp veya telefon araması.
 *
 * TOKEN GEÇİŞİ: `@/constants/theme` kapısı kapatıldı, renk/uzay/tipografi
 * `@/theme` tokenlarından geliyor; basılabilir öğeler `Touchable`. Pencere
 * yüzeyi `elevate(4)` ile (modal katmanı) kuruluyor.
 *
 * SABİT HEX — TEK İSTİSNA: WhatsApp yeşili ÜÇÜNCÜ TARAF MARKA RENGİDİR;
 * uygulamanın paletinden türetilemez, temayla da değişmez (WhatsApp logosu her
 * temada aynı yeşildir). Arama düğmesinin yeşili ise marka değil "olumlu eylem"
 * anlamı taşıdığı için `colors.win` tokenına bağlandı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Alert, Linking, Modal, StyleSheet, Text, View } from "react-native";
import { Touchable } from "@/components/ui";
import { colors, elevate, radius, space, textScale, touchSlop, type } from "@/theme";

const PHONE = "05071690888";
const WHATSAPP = "905071690888";

/** WhatsApp kurumsal yeşili — üçüncü taraf marka rengi, temadan bağımsızdır. */
const WHATSAPP_GREEN = "#25D366";

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
      <Touchable
        feedback="icon"
        haptic="light"
        onPress={() => setOpen(true)}
        hitSlop={touchSlop(36)}
        accessibilityRole="button"
        accessibilityLabel="Maç al — bize ulaş"
        style={styles.button}
      >
        <Ionicons name="call" size={19} color={colors.textOnStatus} />
      </Touchable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Zemine dokunuş pencereyi kapatır. */}
        <Touchable
          feedback="none"
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
          style={styles.backdrop}
        >
          {/*
            Pencere dokunuşu YUTMALIDIR: zemin bir Pressable olduğu için, çocuk
            düğüm dokunuşa talip olmazsa pencerenin ortasına basmak pencereyi
            kapatırdı. `onStartShouldSetResponder` ile pencere dokunma
            sorumluluğunu üstlenir — sahte bir "düğme" düğümü eklemeden.
          */}
          <View
            onStartShouldSetResponder={() => true}
            style={[styles.sheet, elevate(4)]}
          >
            <Text style={styles.title} {...textScale.dense}>
              Maç almak için:
            </Text>
            <View style={styles.optionsRow}>
              <Touchable
                feedback="card"
                haptic="light"
                onPress={whatsapp}
                accessibilityRole="button"
                accessibilityLabel="WhatsApp ile yaz"
                style={styles.option}
              >
                <View style={[styles.optionIcon, styles.whatsapp]}>
                  <Ionicons name="logo-whatsapp" size={30} color={colors.textOnStatus} />
                </View>
                <Text style={styles.optionLabel} {...textScale.dense}>
                  WhatsApp
                </Text>
              </Touchable>
              <Touchable
                feedback="card"
                haptic="light"
                onPress={call}
                accessibilityRole="button"
                accessibilityLabel="Telefonla ara"
                style={styles.option}
              >
                <View style={[styles.optionIcon, styles.phone]}>
                  <Ionicons name="call" size={28} color={colors.textOnStatus} />
                </View>
                <Text style={styles.optionLabel} {...textScale.dense}>
                  Telefon
                </Text>
              </Touchable>
            </View>
          </View>
        </Touchable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.win,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  sheet: {
    borderRadius: radius.xl,
    paddingVertical: space.xl,
    paddingHorizontal: space.xxl,
    alignItems: "center",
    gap: space.lg,
    minWidth: 260,
  },
  title: {
    ...type.h2,
    color: colors.textPrimary,
  },
  optionsRow: {
    flexDirection: "row",
    gap: space.xxxl,
  },
  option: {
    alignItems: "center",
    gap: space.sm,
  },
  optionIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  whatsapp: {
    backgroundColor: WHATSAPP_GREEN,
  },
  phone: {
    backgroundColor: colors.win,
  },
  optionLabel: {
    ...type.caption,
    color: colors.textSecondary,
    letterSpacing: 0,
  },
});
