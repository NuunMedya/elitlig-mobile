import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing } from "@/constants/theme";

const ONBOARDING_KEY = "elitlig.onboarding.done.v1";

export default function HosgeldinScreen() {
  const router = useRouter();
  const logoAnim  = useRef(new Animated.Value(0)).current;
  const textAnim  = useRef(new Animated.Value(0)).current;
  const btnAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(textAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(btnAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    router.replace("/(tabs)");
  };

  const logoStyle = {
    opacity: logoAnim,
    transform: [{ scale: logoAnim.interpolate({ inputRange: [0,1], outputRange: [0.7,1] }) }],
  };
  const textStyle  = { opacity: textAnim };
  const btnStyle   = { opacity: btnAnim };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.center}>
        {/* Logo */}
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <Image
            source={require("../assets/images/icon.png")}
            style={styles.logoImg}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Başlık */}
        <Animated.View style={[styles.textBlock, textStyle]}>
          <Text style={styles.title}>Halı Sahanın{"\n"}Dijital Ligi'ne{"\n"}Hoş Geldin</Text>
          <Text style={styles.subtitle}>
            Puan tablosu, fikstür, oyuncu istatistikleri{"\n"}ve çok daha fazlası tek yerde.
          </Text>
        </Animated.View>
      </View>

      {/* Butonlar */}
      <Animated.View style={[styles.buttons, btnStyle]}>
        <Pressable
          onPress={finish}
          style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
        >
          <Text style={styles.btnPrimaryTxt}>Keşfetmeye Başla</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/giris")}
          style={({ pressed }) => [styles.btnGhost, pressed && styles.pressed]}
        >
          <Text style={styles.btnGhostTxt}>Hesabım var, giriş yap</Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#17102B",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: 32,
  },
  logoWrap: {
    alignItems: "center",
  },
  logoImg: {
    width: 110,
    height: 110,
    borderRadius: 24,
  },
  textBlock: {
    alignItems: "center",
    gap: 10,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.turf,
    letterSpacing: 1.5,
    textAlign: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 21,
  },
  buttons: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  btnPrimary: {
    backgroundColor: colors.turf,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnPrimaryTxt: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  btnGhost: {
    paddingVertical: 12,
    alignItems: "center",
  },
  btnGhostTxt: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
  },
  pressed: {
    opacity: 0.7,
  },
});
