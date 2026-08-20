/**
 * KARŞILAMA — uygulamanın ilk karesi (2,2 saniye).
 *
 * NE: marka işareti belirir, başlık ve alt başlık sırayla açılır, en altta
 * ince bir ilerleme çubuğu otomatik geçişin ne kadar kaldığını gösterir.
 *
 * SÜRELER KORUNUR (davranış sözleşmesi):
 *   · giriş animasyonu 500 + 300 + 200 ms (logo → metin → düğmeler)
 *   · otomatik geçiş `AUTO_ADVANCE_MS` = 2200 ms sonra `/(tabs)`
 * İlerleme çubuğu da 2200 ms sürer; yani çubuk dolduğu an ekran değişir.
 * Kullanıcı beklemek istemezse "Keşfetmeye Başla" ile hemen geçer.
 *
 * NEDEN İKİ AYRI EFEKT: geçiş zamanlayıcısı BİR KEZ kurulur ve hiçbir şeye
 * bağlı değildir (bkz. aşağıdaki `useEffect`), giriş animasyonu ise "hareketi
 * azalt" ayarına bağlıdır. Tek efekte konsalardı, ayar geç okunduğunda
 * zamanlayıcı sıfırlanır ve açılış uzardı.
 *
 * NEDEN SABİT RENK YOK: eski sürüm mor bir zemine (#17102B) sabitlenmişti ve
 * açık temada da mor kalıyordu. Artık zemin `colors.bg` → `colors.brandDim`
 * geçişidir; marka hissi her iki temada da korunur, kimse ekranını yakmaz.
 */

import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, useReduceMotion, withAlpha } from "@/components/ui";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";

/** Otomatik geçiş süresi. İlerleme çubuğu bu süreyi birebir çizer. */
const AUTO_ADVANCE_MS = 2200;

/** Marka işaretinin kenar uzunluğu. */
const LOGO_SIZE = 104;

export default function HosgeldinScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  const logoAnim = useRef(new Animated.Value(0)).current;
  const textAnim = useRef(new Animated.Value(0)).current;
  const btnAnim = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  /**
   * Çubuğun piksel genişliği. `scaleX` görünümü MERKEZDEN büyütür; sola
   * yaslamak için aynı ilerlemeden türetilen bir `translateX` ile telafi
   * edilir (ikisi de yerel sürücüde çalışır, JS iş parçacığı boşta kalır).
   */
  const barWidth = Math.max(1, width - space.xl * 2);

  /* Otomatik geçiş + ilerleme çubuğu — bir kez kurulur, hiç sıfırlanmaz. */
  useEffect(() => {
    const bar = Animated.timing(progress, {
      toValue: 1,
      duration: AUTO_ADVANCE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    bar.start();

    const timer = setTimeout(() => router.replace("/(tabs)"), AUTO_ADVANCE_MS);
    return () => {
      clearTimeout(timer);
      bar.stop();
    };
    // Bilerek boş: süre sabittir, yeniden kurulursa açılış uzar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Giriş animasyonu — "hareketi azalt" açıksa her şey anında yerinde. */
  useEffect(() => {
    if (reduceMotion) {
      logoAnim.setValue(1);
      textAnim.setValue(1);
      btnAnim.setValue(1);
      return;
    }
    const entrance = Animated.sequence([
      Animated.timing(logoAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(textAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(btnAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [reduceMotion, logoAnim, textAnim, btnAnim]);

  const finish = useCallback(() => router.replace("/(tabs)"), [router]);
  const openLogin = useCallback(() => router.push("/giris"), [router]);

  const logoStyle = {
    opacity: logoAnim,
    transform: [
      { scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
    ],
  };
  const textStyle = {
    opacity: textAnim,
    transform: [
      { translateY: textAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
    ],
  };
  const btnStyle = { opacity: btnAnim };
  const barStyle = {
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-barWidth / 2, 0] }) },
      { scaleX: progress },
    ],
  };

  return (
    <LinearGradient
      colors={[colors.bg, colors.brandDim]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill} edges={["top", "bottom"]}>
        <View style={styles.center}>
          {/* Marka işareti — arkasındaki mor hâle logoyu zeminden ayırır. */}
          <Animated.View style={[styles.logoWrap, logoStyle]}>
            <View style={styles.glow} pointerEvents="none" />
            <Image
              source={require("../assets/images/icon.png")}
              style={styles.logo}
              resizeMode="contain"
              accessible
              accessibilityLabel="Elitlig"
            />
          </Animated.View>

          <Animated.View style={[styles.textBlock, textStyle]}>
            <Text style={styles.overline} {...textScale.badge}>
              {upperTR("Elitlig")}
            </Text>
            <Text style={styles.title} {...textScale.dense}>
              Halı Sahanın{"\n"}Dijital Ligi'ne{"\n"}Hoş Geldin
            </Text>
            <Text style={styles.subtitle} {...textScale.dense}>
              Puan tablosu, fikstür, oyuncu istatistikleri{"\n"}ve çok daha fazlası tek yerde.
            </Text>
          </Animated.View>
        </View>

        <Animated.View style={[styles.footer, btnStyle]}>
          <Button label="Keşfetmeye Başla" onPress={finish} fullWidth size="lg" />
          <Button
            label="Hesabım var, giriş yap"
            onPress={openLogin}
            variant="ghost"
            fullWidth
            haptic="light"
          />

          {/* İlerleme: otomatik geçişe kalan süre. Dekor değil, bilgi. */}
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityLabel="Uygulama açılıyor"
          >
            <Animated.View style={[styles.bar, barStyle]} />
          </View>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
    gap: space.xxxl,
  },

  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: LOGO_SIZE * 2.2,
    height: LOGO_SIZE * 2.2,
    borderRadius: LOGO_SIZE * 1.1,
    backgroundColor: withAlpha(colors.brand, 0.14),
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: radius.xxl,
  },

  textBlock: {
    alignItems: "center",
    gap: space.sm,
  },
  overline: {
    ...type.micro,
    color: colors.brandAccent,
  },
  title: {
    ...type.display,
    fontSize: 26,
    lineHeight: 34,
    color: colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  footer: {
    paddingHorizontal: space.xl,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  track: {
    height: 2,
    borderRadius: radius.pill,
    marginTop: space.sm,
    overflow: "hidden",
    backgroundColor: colors.border,
  },
  bar: {
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandAccent,
  },
});
