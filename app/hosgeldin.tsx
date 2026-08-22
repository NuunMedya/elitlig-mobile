/**
 * KARŞILAMA — uygulamanın ilk karesi.
 *
 * İKİ AYRI DAVRANIŞ, TEK EKRAN:
 *
 *  1. İLK AÇILIŞ (`INTRO_SEEN_KEY` yok) → ÜÇ SLAYT. Kullanıcı ürünün ne
 *     yaptığını üç cümlede öğrenir ve sonunda ligini seçer. Slaytlar KENDİ
 *     KENDİNE İLERLEMEZ: okuma hızı kişiseldir ve otomatik geçen bir tanıtım,
 *     okumaya çalışan kullanıcıyla güreşir.
 *
 *  2. SONRAKİ AÇILIŞLAR → 2,2 saniyelik tek kare, otomatik geçiş. Tanıtımı bir
 *     kez gören kullanıcıya her açılışta üç slayt tıklatmak, tanıtımı
 *     tanıtımdan çok bir gişeye çevirirdi.
 *
 * SON DÜĞMENİN ADI SONUCUN ADIDIR: "Başlayalım" değil **"Ligini seç"** —
 * çünkü düğmeye basınca gerçekten şehir/lig seçim ekranı açılır. Butonun adı
 * ile varılan yerin adı aynı olmalı.
 *
 * GÖRSEL DİLİ: stok oyuncu fotoğrafı YOK. Uygulamanın kendi imza öğesi olan
 * tebeşir geometrisi (`ChalkArc`) koyu blok üstünde kullanılıyor. Sahip
 * olmadığımız bir fotoğrafı temsili koymak, ürünün geri kalanında ısrarla
 * kaçınılan "hazır şablon" hissinin ta kendisi olurdu.
 *
 * NEDEN ODAĞA BAĞLI ZAMANLAYICI (hızlı yol): "Hesabım var, giriş yap" giriş
 * modalını yığına PUSH eder; hosgeldin unmount OLMAZ, dolayısıyla sıradan bir
 * `useEffect` temizliği koşmaz ve zamanlayıcı ateşlenmeye devam ederdi.
 * Ateşlendiğinde `router.replace` giriş modalının KENDİSİNİ `(tabs)` ile
 * değiştirir — kullanıcı formu doldururken ekran elinden alınır. Odak
 * kaybında iptal ediyor, geri dönüldüğünde sıfırdan kuruyoruz.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, ChalkArc, Touchable, useReduceMotion } from "@/components/ui";
import { INTRO_SEEN_KEY } from "@/lib/storage";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";

/** Hızlı yolun süresi. İlerleme çubuğu bu süreyi birebir çizer. */
const AUTO_ADVANCE_MS = 2200;

/** Marka işaretinin kenar uzunluğu. */
const LOGO_SIZE = 104;

/**
 * Üç slayt — üç cümle.
 *
 * Metinler ürünün GERÇEKTEN yaptığı şeyi söyler; "hayalini yaşa" tarzı bir
 * vaat yok. Her başlık 16px (sayfa başlığı istisnası), gövde 13px.
 */
const SLIDES = [
  {
    key: "lig",
    icon: "trophy-outline" as const,
    title: "Şehrindeki amatör lig, cebinde",
    body: "Fikstür, puan durumu, canlı skor ve kadrolar — hepsi kendi ligin için.",
  },
  {
    key: "mac",
    icon: "football-outline" as const,
    title: "Maçı dakika dakika takip et",
    body: "Goller, kartlar ve değişiklikler canlı düşer; takımın gol atınca telefonun titrer.",
  },
  {
    key: "oyuncu",
    icon: "person-outline" as const,
    title: "Kendi istatistiğini gör",
    body: "Maç puanların, gollerin ve piyasa değerin oyuncu sayfanda birikir.",
  },
];

export default function HosgeldinScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  /** null = henüz okunmadı; ekran o an hiçbir şey çizmez (tek kare). */
  const [intro, setIntro] = useState<boolean | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then((value) => setIntro(value !== "1"))
      .catch(() => setIntro(false));
  }, []);

  const finish = useCallback(() => router.replace("/(tabs)"), [router]);
  /** Tanıtımın sonu: şehir/lig seçimi. Düğmenin adı buranın adıdır. */
  const chooseLeague = useCallback(() => router.replace("/sehir"), [router]);

  return intro === null ? (
    <SafeAreaView style={styles.screen} />
  ) : intro ? (
    <IntroSlides
      width={width}
      index={index}
      onIndex={setIndex}
      onSkip={finish}
      onFinish={chooseLeague}
    />
  ) : (
    <FastSplash
      width={width}
      reduceMotion={reduceMotion}
      navigation={navigation}
      onFinish={finish}
      onLogin={() => router.push("/giris")}
    />
  );
}

/* ============================== ÜÇ SLAYT ============================== */

function IntroSlides({
  width,
  index,
  onIndex,
  onSkip,
  onFinish,
}: {
  width: number;
  index: number;
  onIndex: (value: number) => void;
  onSkip: () => void;
  onFinish: () => void;
}) {
  const listRef = useRef<FlatList<(typeof SLIDES)[number]>>(null);
  const last = index === SLIDES.length - 1;

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      if (next !== index && next >= 0 && next < SLIDES.length) onIndex(next);
    },
    [width, index, onIndex],
  );

  const next = useCallback(() => {
    if (last) {
      onFinish();
      return;
    }
    listRef.current?.scrollToOffset({ offset: (index + 1) * width, animated: true });
    onIndex(index + 1);
  }, [last, index, width, onFinish, onIndex]);

  return (
    <SafeAreaView style={[styles.screen, styles.dark]} edges={["top", "bottom"]}>
      <View style={styles.skipRow}>
        <Touchable
          feedback="button"
          haptic="none"
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Tanıtımı geç"
        >
          <Text style={styles.skip} {...textScale.dense}>
            Geç
          </Text>
        </Touchable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => <Slide slide={item} width={width} />}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      />

      <View style={styles.footer}>
        {/* Sayfa noktaları — aktif olan mercan, diğerleri sönük. */}
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View key={slide.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <Button
          label={last ? "Ligini seç" : "Devam"}
          size="lg"
          fullWidth
          onPress={next}
          accessibilityHint={last ? "Şehir ve lig seçim ekranını açar" : undefined}
        />
      </View>
    </SafeAreaView>
  );
}

/**
 * Tek slayt. Görsel yerine imza geometrisi: koyu blok + tebeşir yayı + ikon.
 * Sahip olmadığımız bir stok fotoğrafı koymaktansa ürünün kendi dili.
 */
function Slide({ slide, width }: { slide: (typeof SLIDES)[number]; width: number }) {
  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.art}>
        <ChalkArc
          width={width - space.xl * 2}
          height={220}
          color={colors.onDarkMuted}
          thickness={1}
        />
        <View style={styles.artIcon}>
          <Ionicons name={slide.icon} size={30} color={colors.brand} />
        </View>
      </View>

      <Text style={styles.slideTitle} {...textScale.dense}>
        {slide.title}
      </Text>
      <Text style={styles.slideBody} {...textScale.long}>
        {slide.body}
      </Text>
    </View>
  );
}

/* ============================== HIZLI YOL ============================== */

/** Tanıtımı görmüş kullanıcı: 2,2 saniyelik tek kare, otomatik geçiş. */
function FastSplash({
  width,
  reduceMotion,
  navigation,
  onFinish,
  onLogin,
}: {
  width: number;
  reduceMotion: boolean;
  /** Yalnız odak sorgusu için; tam gezinme tipi burada gerekmiyor. */
  navigation: { isFocused: () => boolean };
  onFinish: () => void;
  onLogin: () => void;
}) {
  const logoAnim = useRef(new Animated.Value(0)).current;
  const textAnim = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  /**
   * Çubuğun piksel genişliği. `scaleX` görünümü MERKEZDEN büyütür; sola
   * yaslamak için aynı ilerlemeden türetilen bir `translateX` ile telafi
   * edilir (ikisi de yerel sürücüde çalışır, JS iş parçacığı boşta kalır).
   */
  const barWidth = Math.max(1, width - space.xl * 2);

  useFocusEffect(
    useCallback(() => {
      progress.setValue(0);
      const bar = Animated.timing(progress, {
        toValue: 1,
        duration: AUTO_ADVANCE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      });
      bar.start();

      const timer = setTimeout(() => {
        // Odak olayı gezinmeden bir kare sonra düşebilir; son kontrol canlı
        // durumdan okunur.
        if (!navigation.isFocused()) return;
        onFinish();
      }, AUTO_ADVANCE_MS);

      return () => {
        clearTimeout(timer);
        bar.stop();
      };
    }, [navigation, progress, onFinish]),
  );

  useEffect(() => {
    if (reduceMotion) {
      logoAnim.setValue(1);
      textAnim.setValue(1);
      return;
    }
    const entrance = Animated.sequence([
      Animated.timing(logoAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(textAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [reduceMotion, logoAnim, textAnim]);

  const logoStyle = {
    opacity: logoAnim,
    transform: [{ scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
  };
  const textStyle = {
    opacity: textAnim,
    transform: [
      { translateY: textAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
    ],
  };
  const barStyle = {
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-barWidth / 2, 0] }) },
      { scaleX: progress },
    ],
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.fast}>
        <Animated.View style={logoStyle}>
          <Image
            source={require("../assets/images/splash-icon.png")}
            style={styles.logo}
            resizeMode="contain"
            accessible={false}
          />
        </Animated.View>

        <Animated.View style={[styles.fastTexts, textStyle]}>
          <Text style={styles.fastOverline} {...textScale.badge}>
            {upperTR("Elitlig")}
          </Text>
          <Text style={styles.fastTitle} {...textScale.dense}>
            Ligin başlıyor
          </Text>
        </Animated.View>
      </View>

      <View style={styles.fastFooter}>
        <View style={[styles.barTrack, { width: barWidth }]}>
          <Animated.View style={[styles.barFill, { width: barWidth }, barStyle]} />
        </View>

        <Touchable
          feedback="button"
          haptic="none"
          onPress={onLogin}
          accessibilityRole="button"
          accessibilityLabel="Giriş yap"
        >
          <Text style={styles.fastLink} {...textScale.dense}>
            Hesabım var, giriş yap
          </Text>
        </Touchable>
      </View>
    </SafeAreaView>
  );
}

/* ================================ STİLLER ================================ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  /* Tanıtım koyu blok üstünde: üç slayt ürünün "sahne" hâlidir.
     DAİMA KOYU (`inkBlock`): `inverse` koyu temada açık bir yüzeydir ve
     slaytların beyaz metni orada görünmüyordu. */
  dark: {
    backgroundColor: colors.inkBlock,
  },

  /* — Üç slayt — */
  skipRow: {
    alignItems: "flex-end",
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  skip: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
  slide: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  art: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xxl,
  },
  artIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  slideTitle: {
    ...type.h1,
    color: colors.onDark,
  },
  slideBody: {
    ...type.body,
    color: colors.onDarkMuted,
  },
  footer: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  dots: {
    flexDirection: "row",
    gap: space.s,
    justifyContent: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.onDarkMuted,
    opacity: 0.4,
  },
  dotActive: {
    backgroundColor: colors.brand,
    opacity: 1,
  },

  /* — Hızlı yol — */
  fast: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xl,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  fastTexts: {
    alignItems: "center",
    gap: space.xs,
  },
  fastOverline: {
    ...type.overline,
    color: colors.textTertiary,
  },
  fastTitle: {
    ...type.h1,
    color: colors.textPrimary,
  },
  fastFooter: {
    alignItems: "center",
    gap: space.lg,
    paddingBottom: space.xl,
  },
  barTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  barFill: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.brand,
  },
  fastLink: {
    ...type.label,
    color: colors.brandAccent,
  },
});
