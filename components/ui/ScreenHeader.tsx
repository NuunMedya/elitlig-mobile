/**
 * ScreenHeader — MOR BLOK. Her ekranın açılışı.
 *
 * TEMANIN BİRİNCİ KURALI BURADA KURULUR: her ekran koyu mor bir başlık
 * bloğuyla açılır, kâğıt üstünde okunur, mor menü rayıyla kapanır. Blok
 * uygulamanın kimliğini taşıyan yüzeydir; ekranlar arası fark İÇERİKTE olur,
 * çerçevede değil.
 *
 * TEK SATIR (bu turun düzeltmesi): ilk sürüm eski beyaz başlığın düzenini
 * miras almıştı — üstte geri/eylem satırı, altta büyük başlık. Beyaz kâğıtta
 * bu "ferah" görünüyordu; koyu mor bir blokta ise 40px'lik boş mor bir
 * şeride dönüştü ve her ekran dev bir mor levhayla açılıyordu. Şimdi başlık,
 * üst başlık, geri oku ve eylemler TEK satırda durur (52px); blok yalnız
 * gerektiği kadar yüksektir.
 *
 *   [geri] [üst başlık / BAŞLIK / alt başlık ............] [eylem] [eylem]
 *   [kimlik — hero: amblem, ad, sayılar .......................... ]
 *   [sekme] [sekme] [sekme]
 *
 * KİMLİK BLOĞUN İÇİNDE (`hero`): takım ve oyuncu sayfalarında kimlik kartı
 * eskiden başlığın ALTINDA ikinci bir mor kart olarak duruyordu — mor üstüne
 * mor, ad iki kez. Artık kimlik bloğun içindedir; başlık satırı o sırada
 * yalnız geri oku ve eylemleri taşır, ad kaydırınca daralan satırda belirir.
 *
 * DARALMA: `scrollY` verilirse 0 → 56px kaydırma arasında
 *   · kimlik ölçülen yüksekliğinden 0'a iner ve söner,
 *   · üst/alt başlık söner, satır 52px'e iner,
 *   · kimlik varsa başlık adı belirir.
 * Yükseklik animasyonu düzen özelliği olduğu için `useHeaderScroll()`
 * ZORUNLUDUR (yerel sürücüsüz `Animated.event`).
 *
 * BLOK GÜVENLİ ALANI DA BOYAR: durum çubuğunun arkası da mordur. Bunu
 * `marginTop: -insets.top` + `paddingTop: insets.top` çifti kurar — blok
 * yukarı kayar, içeriği aynı kadar aşağı itilir; akıştaki net katkısı
 * değişmez. Böylece ekranlar `SafeAreaView edges={["top"]}` kullanmaya devam
 * eder. (Negatif konumlu bir çocuk denenmedi: Android'de kapsayıcı sınırının
 * dışına taşan çocuk güvenilir biçimde çizilmez.)
 *
 * SAYFA SEKMELERİ BLOĞUN İÇİNDE (`tabs`), SÜZGEÇLER DIŞINDA (`bottom`):
 * sekme sayfayı değiştirir ve başlıkla aynı yüzeye aittir; segment, tarih
 * şeridi ve kapsam çipleri veriyi süzer ve kâğıda aittir.
 *
 * ŞEFFAF KİP (`transparent`): maç detayı gibi kendi atmosferi olan ekranlar
 * bloğu boyamaz; başlık atmosferin üstünde durur ve daralınca `surface`
 * rengiyle opaklaşır. Bu kipte güvenli alan hilesi de uygulanmaz — atmosfer
 * zaten ekranın tepesinden başlar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, hairline, layout, radius, space, textScale, touchSlop, type } from "@/theme";
import { Badge, toneColors, type Tone } from "./Badge";
import { Touchable } from "./Pressable";

/** Başlığın tamamen daralması için gereken kaydırma mesafesi. */
const COLLAPSE_RANGE = 56;
/** Daralmış satır: yalnız başlık + ikonlar. */
const BAR_HEIGHT = layout.headerHeightCollapsed;

/** Mor bloğun yüzey gradyanı — yüzeylerin ışığı daima sağdan gelir. */
const INK_START = { x: 1, y: 0.5 } as const;
const INK_END = { x: 0, y: 0.5 } as const;

export interface ScreenHeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  badge?: number | "dot";
  tone?: Tone;
  accessibilityLabel: string;
}

export interface ScreenHeaderProps {
  title: string;
  /** Başlığın üstünde küçük bağlam satırı ("FREELİG", "14. Hafta"). */
  overline?: string;
  /**
   * KAPSAM ÇİPİ — üst başlığın YERİNE geçer (`<ScopeChip tone="ink" />`).
   * Kök sekmelerde kapsam (şehir · lig · sezon) hem bloğun üst başlığında
   * hem kâğıtta ayrı bir satırda yazılıyordu; artık yalnız burada, dokunulur.
   */
  scope?: React.ReactNode;
  subtitle?: string;
  /** Kaydırma konumu — verilirse blok daralır. `useHeaderScroll()` ile üretin. */
  scrollY?: Animated.Value;
  /** Geri düğmesi (detay ekranları). */
  back?: boolean;
  /** Geri düğmesinin özel davranışı; verilmezse router.back(). */
  onBack?: () => void;
  /** Sağ eylemler — en fazla 3 ikon. */
  actions?: ScreenHeaderAction[];
  /**
   * KİMLİK — bloğun içinde, başlık satırının altında: amblem/avatar, ad,
   * bağlam ve sayılar. Verildiğinde açık hâlde başlık metni ÇİZİLMEZ (ad
   * zaten kimlikte); kaydırınca kimlik kapanır ve ad satıra gelir.
   */
  hero?: React.ReactNode;
  /** SAYFA SEKMELERİ — bloğun içinde (bkz. components/ui/Tabs.tsx). */
  tabs?: React.ReactNode;
  /** Bloğun ALTINDA, kâğıtta duran bant: süzgeç segmenti, tarih şeridi, çip. */
  bottom?: React.ReactNode;
  /** Kendi atmosferi olan ekran (maç detayı): blok boyanmaz. */
  transparent?: boolean;
  /** Şeffaf kipte, arkadaki atmosfer koyuysa metinler `onDark` ailesinden. */
  onDark?: boolean;
  /** Şeffaf kipte daralınca altına serilecek zemin. */
  surface?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Daralan başlık için doğru yapılandırılmış kaydırma bağlantısı.
 * `useNativeDriver: false` ZORUNLUDUR — bloğun yüksekliği animasyonlanıyor.
 */
export function useHeaderScroll(): {
  scrollY: Animated.Value;
  scrollProps: {
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: number;
  };
} {
  const scrollY = useRef(new Animated.Value(0)).current;

  const scrollProps = useMemo(() => {
    const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
      useNativeDriver: false,
    }) as unknown as (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    return { onScroll, scrollEventThrottle: 16 };
  }, [scrollY]);

  return { scrollY, scrollProps };
}

export function ScreenHeader({
  title,
  overline,
  scope,
  subtitle,
  scrollY,
  back = false,
  onBack,
  actions,
  hero,
  tabs,
  bottom,
  transparent = false,
  onDark = false,
  surface,
  style,
}: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const staticProgress = useRef(new Animated.Value(0)).current;
  /**
   * Başlık bloğunun (üst başlık + başlık + alt başlık) doğal yüksekliği.
   * ANİMASYONLANAN SATIR DEĞİL, İÇİNDEKİ METİN BLOĞU ÖLÇÜLÜR: satırın kendi
   * yüksekliği daralmayla değişir, metin bloğununki değişmez; ayrıca üst
   * başlık çoğu ekranda veriyle sonradan gelir (lig adı), bu yüzden ölçüm
   * bir kez değil her değişimde yenilenir — yoksa sonradan gelen satır
   * kırpılırdı.
   */
  const [titleHeight, setTitleHeight] = useState(0);
  /** Kimlik bloğunun doğal yüksekliği — aynı gerekçeyle her değişimde. */
  const [heroHeight, setHeroHeight] = useState(0);

  const isInk = !transparent;
  const dark = isInk || onDark;

  const progress = useMemo(
    () =>
      scrollY
        ? scrollY.interpolate({
            inputRange: [0, COLLAPSE_RANGE],
            outputRange: [0, 1],
            extrapolate: "clamp",
          })
        : staticProgress,
    [scrollY, staticProgress],
  );

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const measure = (setter: React.Dispatch<React.SetStateAction<number>>) =>
    (event: LayoutChangeEvent) => {
      const next = Math.round(event.nativeEvent.layout.height);
      if (next > 0) setter((current) => (current === next ? current : next));
    };

  const ink = dark ? colors.onDark : colors.textPrimary;
  const inkMuted = dark ? colors.onDarkMuted : colors.textSecondary;
  const inkOverline = dark ? colors.brandOnDark : colors.brandAccent;

  /* Üst/alt başlık daralmanın ilk yarısında söner; satır 52px'e inerken
     ortalanmış başlık yerinde kalır, sönen satırlar kırpılır. */
  const fadeOut = progress.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: "clamp" });
  const appear = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  /* Kimlik varken başlık adı yalnız daralınca görünür. */
  const titleOpacity = hero ? progress.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: "clamp" }) : 1;

  /* Satırın doğal yüksekliği metin bloğundan türetilir; ölçüm gelmeden
     yükseklik dayatılmaz ki doğal yükseklik ölçülebilsin. */
  const hasExtras = Boolean(overline || scope || subtitle);
  const rowNatural = Math.max(BAR_HEIGHT, titleHeight + space.xs * 2);
  const rowStyle =
    scrollY && hasExtras && titleHeight > 0
      ? { height: progress.interpolate({ inputRange: [0, 1], outputRange: [rowNatural, BAR_HEIGHT] }) }
      : hasExtras
        ? null
        : { height: BAR_HEIGHT };
  const heroStyle =
    scrollY && heroHeight > 0
      ? {
          height: progress.interpolate({ inputRange: [0, 1], outputRange: [heroHeight, 0] }),
          opacity: fadeOut,
        }
      : null;

  return (
    <View style={style}>
      {/* MOR BLOK — güvenli alanı da kaplar (bkz. dosya başlığı). */}
      <View
        style={[
          isInk ? styles.inkWrap : styles.bareWrap,
          isInk ? { marginTop: -insets.top, paddingTop: insets.top } : null,
        ]}
      >
        {isInk ? (
          <LinearGradient
            colors={colors.gradientInk}
            start={INK_START}
            end={INK_END}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        ) : (
          /* Şeffaf kipte zemin, daralma ilerledikçe opaklaşır. */
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.background,
              surface ? { backgroundColor: surface } : null,
              { opacity: appear },
            ]}
          />
        )}

        {/* TEK SATIR: geri · başlık bloğu · eylemler. */}
        <Animated.View style={[styles.row, rowStyle]}>
          {back ? (
            <Touchable
              feedback="icon"
              onPress={handleBack}
              hitSlop={touchSlop(36)}
              accessibilityRole="button"
              accessibilityLabel="Geri"
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color={ink} />
            </Touchable>
          ) : null}

          <View
            style={[styles.titleBlock, back ? null : styles.titleBlockFlush]}
            pointerEvents="box-none"
            onLayout={measure(setTitleHeight)}
          >
            {scope ? (
              <Animated.View style={[styles.scope, { opacity: fadeOut }]}>{scope}</Animated.View>
            ) : overline ? (
              <Animated.Text
                numberOfLines={1}
                style={[styles.overline, { color: inkOverline, opacity: fadeOut }]}
                {...textScale.badge}
              >
                {overline}
              </Animated.Text>
            ) : null}
            <Animated.Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.title, { color: ink, opacity: titleOpacity }]}
              {...textScale.dense}
            >
              {title}
            </Animated.Text>
            {subtitle ? (
              <Animated.Text
                numberOfLines={1}
                style={[styles.subtitle, { color: inkMuted, opacity: fadeOut }]}
                {...textScale.dense}
              >
                {subtitle}
              </Animated.Text>
            ) : null}
          </View>

          {actions?.slice(0, 3).map((action) => (
            <Touchable
              key={action.icon + action.accessibilityLabel}
              feedback="icon"
              haptic="light"
              onPress={action.onPress}
              hitSlop={touchSlop(34)}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              style={[styles.action, dark ? styles.actionOnInk : null]}
            >
              <Ionicons
                name={action.icon}
                size={20}
                color={action.tone ? toneColors(action.tone).fg : ink}
              />
              {action.badge != null ? (
                <Badge
                  tone="live"
                  variant="solid"
                  size="xs"
                  dot={action.badge === "dot"}
                  label={action.badge === "dot" ? undefined : action.badge}
                  floating
                  style={styles.actionBadge}
                  accessibilityLabel={action.badge === "dot" ? "Yeni" : `${action.badge} yeni`}
                />
              ) : null}
            </Touchable>
          ))}
        </Animated.View>

        {/* KİMLİK — bloğun içinde; kaydırınca kapanır. */}
        {hero ? (
          <Animated.View style={[styles.hero, heroStyle]}>
            <View onLayout={measure(setHeroHeight)}>{hero}</View>
          </Animated.View>
        ) : null}

        {/* SAYFA SEKMELERİ — başlıkla aynı yüzeyde. */}
        {tabs}

        {/* Alt kenar: yalnız kaydırma başlayınca belirir. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.border, dark ? styles.borderOnDark : null, { opacity: appear }]}
        />
      </View>

      {bottom}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Mor bloğun kabı. Zemin rengi gradyanın YEDEĞİdir: `expo-linear-gradient`
   * yüklenemezse (web, eski cihaz) blok yine de koyu kalır ve üstündeki beyaz
   * metin okunur.
   */
  inkWrap: {
    backgroundColor: colors.inkBlock,
    overflow: "hidden",
  },
  bareWrap: {
    backgroundColor: "transparent",
  },
  background: {
    backgroundColor: colors.bg,
  },
  /* Satır: içerik dikeyde ortalanır; daralınca üst/alt başlık kırpılır,
     başlık yerinde kalır. */
  row: {
    minHeight: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    gap: space.xxs,
    overflow: "hidden",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  /* Geri oku yokken başlık ekranın sol kenar boşluğuna oturur. */
  titleBlockFlush: {
    paddingLeft: layout.screenPadding - space.sm,
  },
  overline: {
    ...type.overline,
    marginBottom: 1,
  },
  /* Çip 28px'lik kendi dokunma kutusunu taşır; başlıkla çakışmasın diye
     yalnız görünen metin kadar yer kaplar. */
  scope: {
    alignSelf: "flex-start",
    height: 16,
    justifyContent: "center",
    marginBottom: 1,
  },
  title: {
    ...type.h1,
  },
  subtitle: {
    ...type.bodySm,
    marginTop: 1,
  },
  /** Eylem ikonu: 36px kutu; blokta hafif cam pul, kâğıtta çıplak. */
  action: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: space.xs,
  },
  actionOnInk: {
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.borderOnDark,
  },
  /** Rozet halkası bloğun rengindedir; kâğıt renginde halka çentik bırakır. */
  actionBadge: {
    top: -2,
    right: -2,
    borderWidth: 2,
    borderColor: colors.inkBlock,
  },
  hero: {
    overflow: "hidden",
  },
  border: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: hairline,
    backgroundColor: colors.border,
  },
  borderOnDark: {
    backgroundColor: colors.chalk,
  },
});
