/**
 * HeroCarousel — açılış ekranının manşet şeridi.
 *
 * NE: tam genişlik, 16:10, yatay yapışkan kaydırma. Her slayt bir kapak
 * görseli, üstünde alttan yükselen okunabilirlik scrim'i ve üç katman metin:
 * lig etiketi (+ canlı rozeti), manşet, kaynak + zaman.
 *
 * MANŞET TAM CÜMLEDİR: "Salah'ın 43. dakika golü Anfield'da dengeyi kurdu" —
 * "Bunu görmelisiniz" değil. Tıklama tuzağı, bir spor uygulamasında güveni
 * ödünç alıp geri ödemeyen tek öğedir. İki satırda biter; üçüncü satıra taşan
 * manşet zaten manşet değildir.
 *
 * SAYFA GÖSTERGESİ NOKTA DEĞİL ÇİZGİ: noktalar kaç slayt olduğunu söyler ama
 * NEREDE olduğunuzu söylemez. Eşit bölünmüş ince çizgi segmentleri hem sayıyı
 * hem konumu verir; aktif segment ayrıca otomatik geçişin ne kadar kaldığını
 * DOLARAK gösterir. Böylece "birazdan değişecek" bilgisi hareketten değil
 * göstergeden okunur.
 *
 * OTOMATİK GEÇİŞ: 6 saniye. Kullanıcı dokunduğu an durur ve BİR DAHA
 * BAŞLAMAZ — yarıda kesilip yeniden devralan bir karusel, okumaya çalışan
 * kullanıcıyla güreşir. "Hareketi azalt" açıksa hiç başlamaz ve ilerleme
 * çubuğu da çizilmez.
 *
 * NEDEN `scaleX` + YERLİ SÜRÜCÜ: ilerleme çubuğu 6 saniye boyunca sürekli
 * animasyonlanıyor. `width` animasyonu yerel sürücüyle yapılamaz ve bu süre
 * boyunca her karede JS thread'ini meşgul ederdi — altındaki liste kaydırması
 * takılırdı. `scaleX` yerel sürücüde çalışır; sola sabitlemek için çubuk
 * translate-scale-translate üçlemesiyle çizilir.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";
import { useReduceMotion } from "./LiveBadge";
import { Touchable } from "./Pressable";

/** Otomatik geçiş süresi. */
const AUTOPLAY_MS = 6000;
/** 16:10 — manşet görseli için yeterince geniş, listeyi ekrandan itmeyecek kadar alçak. */
const ASPECT = 10 / 16;

export interface HeroSlide {
  key: string;
  /** Kapak görseli adresi. Yoksa koyu blok + metin çizilir. */
  image?: string | null;
  /** Üstteki küçük büyük-harf etiket: lig ya da kategori. */
  eyebrow?: string | null;
  /** Manşet — tam cümle, en fazla iki satır. */
  headline: string;
  /** Alt satır: kaynak · zaman. */
  meta?: string | null;
  /** Canlı rozeti göster. */
  live?: boolean;
  onPress?: () => void;
}

export interface HeroCarouselProps {
  slides: HeroSlide[];
  /** Ekran genişliği — yükseklik bundan türetilir. */
  width: number;
  /** Yatay kenar boşluğu. Kart bu kadar içeride durur. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}

export const HeroCarousel = memo(function HeroCarousel({
  slides,
  width,
  inset = 0,
  style,
}: HeroCarouselProps) {
  const listRef = useRef<FlatList<HeroSlide>>(null);
  const [index, setIndex] = useState(0);
  const reduceMotion = useReduceMotion();
  /** Kullanıcı bir kez dokunduysa otomatik geçiş bir daha başlamaz. */
  const [autoplay, setAutoplay] = useState(true);

  const cardWidth = Math.max(0, width - inset * 2);
  const cardHeight = Math.round(cardWidth * ASPECT);
  const progress = useRef(new Animated.Value(0)).current;

  const running = autoplay && !reduceMotion && slides.length > 1;

  /* Otomatik geçiş + ilerleme çubuğu tek zamanlayıcıda: çubuk dolduğunda
     slayt değişir, yani gösterge gerçeği söyler. */
  useEffect(() => {
    if (!running) {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: AUTOPLAY_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (!finished) return;
      const next = (index + 1) % slides.length;
      listRef.current?.scrollToOffset({ offset: next * cardWidth, animated: true });
      setIndex(next);
    });
    return () => run.stop();
  }, [running, index, slides.length, cardWidth, progress]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (cardWidth <= 0) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
      setIndex((current) => (next !== current && next >= 0 && next < slides.length ? next : current));
    },
    [cardWidth, slides.length],
  );

  /** Dokunuş: otomatik geçiş kalıcı olarak durur. */
  const onTouch = useCallback(() => setAutoplay(false), []);

  const getItemLayout = useCallback(
    (_: unknown, i: number) => ({ length: cardWidth, offset: cardWidth * i, index: i }),
    [cardWidth],
  );

  const renderItem = useCallback(
    ({ item }: { item: HeroSlide }) => (
      <HeroSlideCard slide={item} width={cardWidth} height={cardHeight} />
    ),
    [cardWidth, cardHeight],
  );

  if (slides.length === 0 || cardWidth <= 0) return null;

  return (
    <View style={style}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth}
        decelerationRate="fast"
        onScrollBeginDrag={onTouch}
        onMomentumScrollEnd={onScroll}
        contentContainerStyle={{ paddingHorizontal: inset }}
        style={{ width }}
      />

      {slides.length > 1 ? (
        <Segments
          count={slides.length}
          index={index}
          progress={running ? progress : null}
          width={cardWidth}
          inset={inset}
        />
      ) : null}
    </View>
  );
});

/* ─────────────────────────────── tek slayt ─────────────────────────────── */

const HeroSlideCard = memo(function HeroSlideCard({
  slide,
  width,
  height,
}: {
  slide: HeroSlide;
  width: number;
  height: number;
}) {
  return (
    <Touchable
      feedback={slide.onPress ? "card" : "none"}
      haptic="none"
      onPress={slide.onPress}
      disabled={!slide.onPress}
      accessibilityRole={slide.onPress ? "button" : "text"}
      accessibilityLabel={[slide.eyebrow, slide.headline, slide.meta].filter(Boolean).join(". ")}
      style={[styles.card, { width, height }]}
    >
      {slide.image ? (
        <Image
          source={{ uri: slide.image }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          // Görsel yüklenene kadar yerini koyu blok tutar; düzen zıplamaz.
          accessible={false}
        />
      ) : null}

      {/* Okunabilirlik scrim'i — uygulamadaki TEK meşru gradient. */}
      <LinearGradient
        colors={[colors.scrimGradientTop, colors.scrimGradientBottom]}
        locations={[0.38, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.cardBody}>
        <View style={styles.eyebrowRow}>
          {slide.eyebrow ? (
            <Text style={styles.eyebrow} numberOfLines={1} {...textScale.badge}>
              {upperTR(slide.eyebrow)}
            </Text>
          ) : null}
          {slide.live ? (
            <View style={styles.liveTag}>
              <Text style={styles.liveText} {...textScale.badge}>
                {upperTR("Canlı")}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.headline} numberOfLines={2} {...textScale.dense}>
          {slide.headline}
        </Text>

        {slide.meta ? (
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {slide.meta}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
});

/* ───────────────────────── sayfa göstergesi (çizgi) ────────────────────── */

const Segments = memo(function Segments({
  count,
  index,
  progress,
  width,
  inset,
}: {
  count: number;
  index: number;
  progress: Animated.Value | null;
  width: number;
  inset: number;
}) {
  const segmentWidth = useMemo(
    () => (width - (count - 1) * space.xs) / count,
    [width, count],
  );

  return (
    <View style={[styles.segments, { paddingHorizontal: inset }]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.segmentTrack, { width: segmentWidth }]}>
          {i < index ? <View style={styles.segmentDone} /> : null}
          {i === index ? (
            progress ? (
              <Animated.View
                style={[
                  styles.segmentFill,
                  {
                    width: segmentWidth,
                    // scaleX'i SOLA sabitlemek için: merkeze taşı, ölçekle, geri taşı.
                    transform: [
                      { translateX: -segmentWidth / 2 },
                      { scaleX: progress },
                      { translateX: segmentWidth / 2 },
                    ],
                  },
                ]}
              />
            ) : (
              <View style={[styles.segmentFill, { width: segmentWidth }]} />
            )
          ) : null}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.inverse,
    justifyContent: "flex-end",
  },
  cardBody: {
    padding: space.lg,
    gap: space.xs,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  eyebrow: {
    ...type.overline,
    color: colors.onDarkMuted,
    flexShrink: 1,
  },
  liveTag: {
    paddingHorizontal: space.s,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.live,
  },
  liveText: {
    ...type.overline,
    color: colors.textOnStatus,
  },
  headline: {
    ...type.h1,
    color: colors.onDark,
  },
  meta: {
    ...type.caption,
    color: colors.onDarkMuted,
  },
  segments: {
    flexDirection: "row",
    gap: space.xs,
    paddingTop: space.sm,
  },
  segmentTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  segmentDone: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.borderStrong,
  },
  segmentFill: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.brand,
  },
});

/** Otomatik geçiş süresi — çağıranların testte kullanması için dışa açık. */
export { AUTOPLAY_MS as HERO_AUTOPLAY_MS };
