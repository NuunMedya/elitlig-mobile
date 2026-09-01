/**
 * ScreenHeader — MOR BLOK. Her ekranın açılışı.
 *
 * TEMANIN BİRİNCİ KURALI BURADA KURULUR: her ekran koyu mor bir başlık
 * bloğuyla açılır, kâğıt üstünde okunur, mor menü rayıyla kapanır. Blok
 * uygulamanın kimliğini taşıyan yüzeydir; ekranlar arası fark İÇERİKTE olur,
 * çerçevede değil. Önceki sürümde başlık sayfanın kendi kâğıdındaydı ve
 * altmış ekranın hiçbirinde ortak bir kimlik yoktu — her ekran kendi
 * başlığını kendi tonunda çiziyordu.
 *
 * BLOK GÜVENLİ ALANI DA BOYAR: durum çubuğunun arkası da mordur. Bunu
 * `marginTop: -insets.top` + `paddingTop: insets.top` çifti kurar — blok
 * yukarı kayar, içeriği aynı kadar aşağı itilir. Böylece ekranlar
 * `SafeAreaView edges={["top"]}` kullanmaya devam edebilir; tek satır bile
 * değişmez ve blok yine de durum çubuğunun altına uzanır. (Negatif konumlu
 * bir çocuk denenmedi: Android'de kapsayıcı sınırının dışına taşan çocuk
 * güvenilir biçimde çizilmez.)
 *
 * SAYFA SEKMELERİ BLOĞUN İÇİNDE (`tabs` yuvası): şerit kâğıtta ayrı bir kutu
 * olarak durduğunda ekranın tepesinde iki gezinme katmanı oluşuyordu. `tabs`
 * bloğun içine, `bottom` ise bloğun ALTINA (kâğıda) çizilir; süzgeç
 * segmentleri, tarih şeridi ve kapsam çipleri kâğıda aittir.
 *
 * ═══ eski başlık notu ═══
 * ScreenHeader — kaydırınca daralan premium başlık (§4.27).
 *
 * ESKİ DOSYA YERİNDE DURUYOR: `components/ScreenHeader.tsx` hâlâ 20'den fazla
 * ekran tarafından kullanılıyor. Bu dosya onun yerini alacak YENİ bileşendir;
 * ekranlar tek tek geçirilir, geçiş bitince eskisi silinir.
 *
 * DARALMA NASIL ÇALIŞIR:
 *   0 → 56 px kaydırma arasında `progress` 0'dan 1'e gider.
 *   · yükseklik 72 → 42
 *   · üst satır (geri + eylemler) YERİNDE KALIR, hiç kıpırdamaz
 *   · başlık bloğu yukarı ve sağa kayar, 14px'ten 13px'e "küçülür"
 *   · overline ve alt başlık söner
 *   · alt kenarda hairline çizgi belirir, şeffaf başlıkta zemin opaklaşır
 *
 * NEDEN fontSize DEĞİL scale: yazı boyutunu animasyonla değiştirmek her karede
 * metin ölçümü (layout) tetikler. Bunun yerine 13/14 = 0.929 ölçek uygulanır ve
 * ölçek merkeze doğru küçülttüğü için sola hizalama `translateX` ile geri
 * alınır — metnin sol kenarı sabit kalır, yalnızca boyu değişir.
 *
 * NEDEN `useHeaderScroll()` ZORUNLU: yükseklik animasyonu (layout özelliği)
 * yerel sürücüyle çalışamaz. `scrollY` yerel sürücülü bir `Animated.event` ile
 * beslenirse RN çalışma anında hata verir. Bu tuzağı ortadan kaldırmak için
 * doğru yapılandırılmış hazır kancayı veriyoruz:
 *
 *   const { scrollY, scrollProps } = useHeaderScroll();
 *   <ScreenHeader title="Maçlar" scrollY={scrollY} />
 *   <Animated.FlatList {...scrollProps} … />
 *
 * TEMA DÜĞMESİ YOK: her ekranın köşesinde duran güneş/ay düğmesi görsel
 * gürültüdür ve günde bir kez kullanılır; Ayarlar/Profil ekranına taşındı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, hairline, layout, space, textScale, touchSlop, type } from "@/theme";
import { Badge, toneColors, type Tone } from "./Badge";
import { Touchable } from "./Pressable";

/** Başlığın tamamen daralması için gereken kaydırma mesafesi. */
const COLLAPSE_RANGE = 56;
/** 13 / 14 — daralmış başlığın ölçeği. Açık başlık `type.h1` (14px). */
const TITLE_SCALE = 13 / 14;
/** Geri düğmesi + boşluk: daralınca başlık bu kadar sağa kayar. */
const BACK_OFFSET = 36;
/** Üst satırın (geri/eylem) yüksekliği; daralmış başlık da bu şeride oturur. */
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
  /** Üstte küçük marka/bağlam satırı ("ELİTLİG", lig adı). */
  overline?: string;
  subtitle?: string;
  /** Kaydırma konumu — verilirse başlık daralır. `useHeaderScroll()` ile üretin. */
  scrollY?: Animated.Value;
  /** Geri düğmesi (detay ekranları). */
  back?: boolean;
  /** Geri düğmesinin özel davranışı; verilmezse router.back(). */
  onBack?: () => void;
  /** Sağ eylemler — en fazla 3 ikon. */
  actions?: ScreenHeaderAction[];
  /**
   * SAYFA SEKMELERİ — mor bloğun İÇİNDE çizilir (bkz. components/ui/Tabs.tsx).
   * Yalnız gezinme şeridi buraya girer: sekme sayfayı değiştirir.
   */
  tabs?: React.ReactNode;
  /**
   * Bloğun ALTINDA, kâğıdın üstünde duran bant: süzgeç segmenti, tarih
   * şeridi, kapsam çipleri. Bunlar veriyi süzer, sayfayı değiştirmez — bu
   * yüzden kâğıda aittir.
   */
  bottom?: React.ReactNode;
  /** Şeffaf hero üstünde mi (maç/takım detayı). */
  transparent?: boolean;
  /**
   * KOYU BİR ATMOSFERİN ÜSTÜNDE Mİ.
   *
   * Maç detayında başlık şeridi, sayfanın arkasındaki mor atmosferin en koyu
   * bölgesinde duruyor: `textPrimary` (mor mürekkep) orada okunmaz. Bu bayrak
   * başlığı, alt başlığı, geri okunu ve eylem ikonlarını `onDark` ailesine
   * çevirir. Daralmış hâlde zemin opaklaştığı için renkler de geri döner —
   * bu yüzden değer sabit değil, `progress` ile geçişlidir.
   */
  onDark?: boolean;
  /**
   * Daralınca altına serilecek zemin. Verilmezse `bg` kullanılır; maç
   * detayı gibi kendi kâğıdı olan ekranlar kendi rengini verir, aksi hâlde
   * şerit sayfadan farklı bir tonda kalıp yatay bir dikiş çizgisi yapar.
   */
  surface?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Daralan başlık için doğru yapılandırılmış kaydırma bağlantısı.
 * `useNativeDriver: false` ZORUNLUDUR — başlığın yüksekliği animasyonlanıyor.
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
  subtitle,
  scrollY,
  back = false,
  onBack,
  actions,
  tabs,
  bottom,
  transparent = false,
  onDark = false,
  surface,
  style,
}: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /**
   * MÜREKKEP BLOK MU: şeffaf başlık (maç detayı, kendi atmosferi var) dışında
   * her başlık mor bloktur. `onDark` bayrağı zaten "koyu zemin" demek
   * olduğundan renk seti ikisinde de aynı yerden gelir.
   */
  const isInk = !transparent;
  const staticProgress = useRef(new Animated.Value(0)).current;
  /** Başlık metninin ölçülen kutusu — ölçek telafisi ve dikey ortalama için. */
  const [titleBox, setTitleBox] = useState({ width: 0, y: 0, height: 0 });
  /**
   * Başlık bloğunun (overline + başlık + alt başlık) ölçülen yüksekliği.
   *
   * NEDEN ÖLÇÜLÜYOR: açık başlığın yüksekliği eskiden 88px'e SABİTLENMİŞTİ ve
   * bu, yalnız iki satırlık içeriğe yetiyordu. Üçü birden verilen ekranlarda
   * (maç detayı, oyunlar) alt başlık kadrajın dışında kalıp KIRPILIYORDU —
   * ekranda yarısı kesilmiş bir satır olarak görünüyordu. Artık yükseklik
   * içerikten türetiliyor; 88px alt sınır olarak korunuyor ki iki satırlık
   * başlıklarda düzen değişmesin.
   */
  const [blockHeight, setBlockHeight] = useState(0);

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

  const handleTitleLayout = (event: LayoutChangeEvent) => {
    const { width, y, height } = event.nativeEvent.layout;
    setTitleBox((prev) =>
      prev.width === width && prev.y === y && prev.height === height ? prev : { width, y, height },
    );
  };

  /**
   * Başlığın dikeyde ne kadar yükseleceği: daralmış şeridin ortası ile
   * başlığın şu anki ortası arasındaki fark. Ölçüm `onLayout`'tan geldiği için
   * overline/alt başlık olsun olmasın doğru hesaplanır.
   */
  const titleCenter = BAR_HEIGHT + titleBox.y + titleBox.height / 2;
  const titleRise = titleBox.height > 0 ? BAR_HEIGHT / 2 - titleCenter : 0;
  const scaleShift = (titleBox.width * (1 - TITLE_SCALE)) / 2;
  const titleSlide = (back ? BACK_OFFSET : 0) - scaleShift;

  /*
   * MÜREKKEP SETİ. `onDark` verildiğinde şerit, koyu bir atmosferin üstünde
   * duruyor demektir ve daralınca da koyu bir zemine (`surface`) oturuyordur —
   * yani renkler her iki uçta da AYNI kalabilir, geçiş gerekmez. Renkleri
   * kaydırmayla döndürmek gerekseydi ikon renkleri için `Animated` sarmalayıcı
   * gerekirdi; sabit koyu zemin bu karmaşıklığı tümden ortadan kaldırıyor.
   */
  const ink = onDark || isInk ? colors.onDark : colors.textPrimary;
  const inkMuted = onDark || isInk ? colors.onDarkMuted : colors.textSecondary;

  const expandedHeight = Math.max(
    layout.headerHeightExpanded,
    BAR_HEIGHT + blockHeight + space.m,
  );

  const containerHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [expandedHeight, layout.headerHeightCollapsed],
  });
  const fadeOut = progress.interpolate({ inputRange: [0, 0.7], outputRange: [1, 0], extrapolate: "clamp" });
  const appear = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={style}>
      {/* MOR BLOK. Güvenli alanı da kaplar: yukarı kayar, içeriği aynı kadar
          aşağı itilir — bkz. dosya başlığı. */}
      <View
        style={[
          isInk ? styles.inkWrap : null,
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
        ) : null}
      <Animated.View
        style={[
          styles.container,
          transparent ? styles.transparent : isInk ? styles.transparent : styles.opaque,
          { height: containerHeight },
        ]}
      >
        {/* Şeffaf başlıkta zemin, daralma ilerledikçe opaklaşır. */}
        {transparent ? (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.background,
              surface ? { backgroundColor: surface } : null,
              { opacity: appear },
            ]}
          />
        ) : null}

        {/* Üst şerit: geri düğmesi ve eylemler — daralmadan etkilenmez. */}
        <View style={styles.bar}>
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

          <View style={styles.barSpacer} />

          {actions?.slice(0, 3).map((action) => (
            <Touchable
              key={action.icon + action.accessibilityLabel}
              feedback="icon"
              haptic="light"
              onPress={action.onPress}
              hitSlop={touchSlop(34)}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              style={styles.action}
            >
              <Ionicons
                name={action.icon}
                size={21}
                color={action.tone ? toneColors(action.tone).fg : inkMuted}
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
                  accessibilityLabel={
                    action.badge === "dot" ? "Yeni" : `${action.badge} yeni`
                  }
                />
              ) : null}
            </Touchable>
          ))}
        </View>

        {/* Başlık bloğu: daralınca yukarı-sağa kayar ve küçülür. */}
        <View
          pointerEvents="box-none"
          onLayout={(e) => {
            const next = Math.round(e.nativeEvent.layout.height);
            setBlockHeight((current) => (current === next ? current : next));
          }}
          style={[styles.titleBlock, { paddingRight: space.sm + (actions?.length ?? 0) * 36 }]}
        >
          {overline ? (
            <Animated.Text
              numberOfLines={1}
              style={[
                styles.overline,
                onDark || isInk ? styles.overlineOnDark : null,
                { opacity: fadeOut },
              ]}
              {...textScale.badge}
            >
              {overline}
            </Animated.Text>
          ) : null}

          <Animated.View
            onLayout={handleTitleLayout}
            style={[
              styles.titleWrapper,
              {
                transform: [
                  { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, titleSlide] }) },
                  { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, titleRise] }) },
                  { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, TITLE_SCALE] }) },
                ],
              },
            ]}
          >
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.title, { color: ink }]}
              {...textScale.dense}
            >
              {title}
            </Text>
          </Animated.View>

          {subtitle ? (
            <Animated.Text
              numberOfLines={1}
              style={[styles.subtitle, { color: inkMuted }, { opacity: fadeOut }]}
              {...textScale.dense}
            >
              {subtitle}
            </Animated.Text>
          ) : null}
        </View>

        {/* Alt kenarlık: yalnız kaydırma başlayınca belirir. Mor blokta
            şeridi kâğıttan değil, bloğun kendi ışığından ayırır. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.border,
            onDark || isInk ? styles.borderOnDark : null,
            { opacity: appear },
          ]}
        />
      </Animated.View>

        {/* Sayfa sekmeleri bloğun İÇİNDE: başlıkla aynı yüzeye aittir. */}
        {tabs}
      </View>

      {bottom}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Mor bloğun kabı. Zemin rengi gradyanın YEDEĞİdir: `expo-linear-gradient`
   * yüklenemezse (web, eski cihaz) blok yine de koyu kalır ve üstündeki beyaz
   * metin okunur — yedeksiz bir gradyan, o cihazlarda beyaz üstüne beyaz
   * yazardı.
   */
  inkWrap: {
    backgroundColor: colors.inkBlock,
    overflow: "hidden",
  },
  container: {
    overflow: "hidden",
    justifyContent: "flex-start",
  },
  opaque: {
    backgroundColor: colors.bg,
  },
  transparent: {
    backgroundColor: "transparent",
  },
  background: {
    backgroundColor: colors.bg,
  },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    gap: space.xs,
  },
  /* Dokunma alanı 40px: 52px'lik çubuğun içinde kalan en büyük kare ve
     44px tabanına hitSlop'la tamamlanır. Ölçek büyüyünce ikon 21 → 24
     oldu, kutu da onunla büyüdü. */
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  barSpacer: {
    flex: 1,
  },
  action: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * Rozet, ikonla karışmasın diye 2px halkayla ayrılır. Halkanın rengi mor
   * BLOĞUN rengidir, kâğıdın değil: kâğıt renginde bir halka, koyu bloğun
   * üstünde ikonun yanında parlayan beyaz bir çentik bırakıyordu.
   */
  actionBadge: {
    top: 2,
    right: 2,
    borderWidth: 2,
    borderColor: colors.inkBlock,
  },
  titleBlock: {
    paddingHorizontal: layout.screenPadding,
  },
  /** Genişlik metin kadar olsun: ölçek telafisi ölçülen genişliğe dayanır. */
  titleWrapper: {
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  overline: {
    ...type.overline,
    color: colors.brandAccent,
  },
  /* Koyu atmosfer üstünde `brandAccent` mor üstüne mor kalır (~1,8:1); orada
     marka etiketinin rengi açık lavantadır. */
  overlineOnDark: {
    color: colors.brandOnDark,
  },
  title: {
    ...type.h1,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.bodySm,
    color: colors.textSecondary,
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
