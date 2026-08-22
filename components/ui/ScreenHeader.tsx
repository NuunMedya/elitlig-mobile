/**
 * ScreenHeader — kaydırınca daralan premium başlık (§4.27).
 *
 * ESKİ DOSYA YERİNDE DURUYOR: `components/ScreenHeader.tsx` hâlâ 20'den fazla
 * ekran tarafından kullanılıyor. Bu dosya onun yerini alacak YENİ bileşendir;
 * ekranlar tek tek geçirilir, geçiş bitince eskisi silinir.
 *
 * DARALMA NASIL ÇALIŞIR:
 *   0 → 56 px kaydırma arasında `progress` 0'dan 1'e gider.
 *   · yükseklik 104 → 50
 *   · üst satır (geri + eylemler) YERİNDE KALIR, hiç kıpırdamaz
 *   · başlık bloğu yukarı ve sağa kayar, 22px'ten 17px'e "küçülür"
 *   · overline ve alt başlık söner
 *   · alt kenarda hairline çizgi belirir, şeffaf başlıkta zemin opaklaşır
 *
 * NEDEN fontSize DEĞİL scale: yazı boyutunu animasyonla değiştirmek her karede
 * metin ölçümü (layout) tetikler. Bunun yerine 17/22 = 0.773 ölçek uygulanır ve
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
import { colors, hairline, layout, space, textScale, touchSlop, type } from "@/theme";
import { Badge, toneColors, type Tone } from "./Badge";
import { Touchable } from "./Pressable";

/** Başlığın tamamen daralması için gereken kaydırma mesafesi. */
const COLLAPSE_RANGE = 56;
/** 17 / 22 — daralmış başlığın ölçeği. Açık başlık `type.h1` (22px). */
const TITLE_SCALE = 17 / 22;
/** Geri düğmesi + boşluk: daralınca başlık bu kadar sağa kayar. */
const BACK_OFFSET = 44;
/** Üst satırın (geri/eylem) yüksekliği; daralmış başlık da bu şeride oturur. */
const BAR_HEIGHT = layout.headerHeightCollapsed;

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
  /** Başlığın altında sabit kalan bant (Tabs, DateStrip, ScopeBar). */
  bottom?: React.ReactNode;
  /** Şeffaf hero üstünde mi (maç/takım detayı). */
  transparent?: boolean;
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
  bottom,
  transparent = false,
  style,
}: ScreenHeaderProps) {
  const router = useRouter();
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

  const expandedHeight = Math.max(
    layout.headerHeightExpanded,
    BAR_HEIGHT + blockHeight + space.lg,
  );

  const containerHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [expandedHeight, layout.headerHeightCollapsed],
  });
  const fadeOut = progress.interpolate({ inputRange: [0, 0.7], outputRange: [1, 0], extrapolate: "clamp" });
  const appear = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={style}>
      <Animated.View
        style={[
          styles.container,
          transparent ? styles.transparent : styles.opaque,
          { height: containerHeight },
        ]}
      >
        {/* Şeffaf başlıkta zemin, daralma ilerledikçe opaklaşır. */}
        {transparent ? (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.background, { opacity: appear }]}
          />
        ) : null}

        {/* Üst şerit: geri düğmesi ve eylemler — daralmadan etkilenmez. */}
        <View style={styles.bar}>
          {back ? (
            <Touchable
              feedback="icon"
              onPress={handleBack}
              hitSlop={touchSlop(44)}
              accessibilityRole="button"
              accessibilityLabel="Geri"
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
            </Touchable>
          ) : null}

          <View style={styles.barSpacer} />

          {actions?.slice(0, 3).map((action) => (
            <Touchable
              key={action.icon + action.accessibilityLabel}
              feedback="icon"
              haptic="light"
              onPress={action.onPress}
              hitSlop={touchSlop(40)}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              style={styles.action}
            >
              <Ionicons
                name={action.icon}
                size={22}
                color={action.tone ? toneColors(action.tone).fg : colors.textSecondary}
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
          style={[styles.titleBlock, { paddingRight: space.sm + (actions?.length ?? 0) * 44 }]}
        >
          {overline ? (
            <Animated.Text
              numberOfLines={1}
              style={[styles.overline, { opacity: fadeOut }]}
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
              style={styles.title}
              {...textScale.dense}
            >
              {title}
            </Text>
          </Animated.View>

          {subtitle ? (
            <Animated.Text
              numberOfLines={1}
              style={[styles.subtitle, { opacity: fadeOut }]}
              {...textScale.dense}
            >
              {subtitle}
            </Animated.Text>
          ) : null}
        </View>

        {/* Alt kenarlık: yalnız kaydırma başlayınca belirir. */}
        <Animated.View pointerEvents="none" style={[styles.border, { opacity: appear }]} />
      </Animated.View>

      {bottom}
    </View>
  );
}

const styles = StyleSheet.create({
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
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  barSpacer: {
    flex: 1,
  },
  action: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Rozet, ikonla karışmasın diye zemin renginde 2px halkayla ayrılır. */
  actionBadge: {
    top: 2,
    right: 2,
    borderWidth: 2,
    borderColor: colors.bg,
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
  title: {
    ...type.h1,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.body,
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
});
