/**
 * SOHBET KOPYASI — kaynağı `components/ui/BottomSheet.tsx`.
 *
 * Mesajlar bölümü WhatsApp renk sistemini kullanır; ortak bileşen ise rengini
 * tema paletinden (mor) alır ve API'si değiştirilemez. Bu dosya kaynağın
 * BİREBİR kopyasıdır; tek fark `colors` / `elevate`in `@/lib/chatPalette`ten
 * gelmesidir. Kaynakta davranış değişirse buraya da taşınmalıdır.
 */

/**
 * BottomSheet — alttan açılan panel (§4.21).
 *
 * NEDEN AÇILIR MENÜ DEĞİL: şehir/lig/sezon seçimi, filtre ve uzun basma menüsü
 * gibi listeler telefonda ekranın üst yarısında açıldığında başparmakla
 * erişilemez ve uzun listede kaydırma sıkışır. Alt sayfa hem erişilebilir hem
 * de "geçici bir katman" olduğunu net söyler.
 *
 * KAPATMA YOLLARI — ÜÇÜ BİRDEN: scrim'e dokunma, tutamağa dokunma ve Android
 * donanım geri tuşu. Ayrıca tutamak bölgesinden aşağı SÜRÜKLEME de kapatır
 * (PanResponder, RN çekirdeği — gesture-handler kurulu değil). Sürükleme tek
 * başına bırakılmaz: dokunmayla kapatma her zaman çalışır, çünkü kaydırmayı
 * keşfetmeyen kullanıcı panelde mahsur kalmamalı.
 *
 * NEDEN animationType="none": Modal'ın kendi geçişi (slide/fade) scrim ile
 * paneli aynı anda ve aynı eğriyle taşır; burada scrim yumuşak SÖNER, panel
 * yaylanarak GELİR. Bu ayrım "ağır bir yüzey aşağıdan yükseldi" hissini verir
 * ve iki animasyon da `useNativeDriver: true` ile JS'e uğramaz.
 *
 * "Hareketi azalt" açıkken yaylanma yerine 120ms'lik opaklık kullanılır (§5.8).
 *
 * KLAVYE: panel ekranın altına yapışıktır; içindeki bir alan (ret gerekçesi,
 * savunma metni, not) odaklanınca klavye alanın ÜSTÜNE biniyordu — Modal
 * penceresi iOS'ta hiç, kenardan kenara Android'de güvenilir biçimde
 * küçülmez. Panel artık klavyenin örttüğü kadar alt boşluk alır: örtüşme
 * kökün ÖLÇÜLEN yüksekliği ile klavyenin üst kenarından hesaplanır, yani
 * pencere kendiliğinden küçüldüyse (örtüşme 0) ikinci kez itilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PanResponderInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { duration, easing, hairline, radius, space, spring, textScale, type } from "@/theme";
import { colors, elevate } from "@/lib/chatPalette";
import { useReduceMotion } from "@/components/ui/LiveBadge";
import { Touchable } from "./Pressable";

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Yükseklik: içerik kadar, yarım ekran veya (üst boşluk hariç) tam ekran. */
  snap?: "content" | "half" | "full";
  /** Üstte tutamak çubuğu (varsayılan true). */
  handle?: boolean;
  /** Sağ üstte kapatma X (varsayılan true). */
  dismissible?: boolean;
  /** Alt sabit eylem çubuğu. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** İçeriği ScrollView'e sarar (varsayılan true). Liste içeren sheet'lerde kapatın. */
  scrollable?: boolean;
}

/** Sürükleyerek kapatma eşikleri (§4.21). */
const CLOSE_DISTANCE = 100;
const CLOSE_VELOCITY = 0.6;

export function BottomSheet({
  visible,
  onClose,
  title,
  snap = "content",
  handle = true,
  dismissible = true,
  footer,
  children,
  scrollable = true,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const screenHeight = Dimensions.get("window").height;

  /** Modal'ın kendisi çıkış animasyonu bitene kadar açık kalmalı. */
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  /* Klavye örtüşmesi — ayrıntı dosya başındaki KLAVYE notunda. */
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [rootHeight, setRootHeight] = useState(0);
  useEffect(() => {
    if (!mounted) return;
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillChangeFrame" : "keyboardDidShow", (event) => {
      if (ios && !reduceMotion) {
        LayoutAnimation.configureNext({
          duration: event.duration || duration.base,
          update: { type: LayoutAnimation.Types.keyboard },
        });
      }
      setKeyboardTop(event.endCoordinates.screenY);
    });
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardTop(null));
    return () => {
      show.remove();
      hide.remove();
      setKeyboardTop(null);
    };
  }, [mounted, reduceMotion]);
  const keyboardInset = keyboardTop != null && rootHeight > 0 ? Math.max(0, Math.round(rootHeight - keyboardTop)) : 0;

  const animateIn = useCallback(() => {
    closingRef.current = false;
    translateY.setValue(reduceMotion ? 0 : screenHeight);
    scrim.setValue(0);
    Animated.parallel([
      Animated.timing(scrim, {
        toValue: 1,
        duration: duration.medium,
        easing: easing.decelerate,
        useNativeDriver: true,
      }),
      reduceMotion
        ? Animated.timing(translateY, {
            toValue: 0,
            duration: duration.fast,
            easing: easing.standard,
            useNativeDriver: true,
          })
        : Animated.spring(translateY, { toValue: 0, ...spring.sheet }),
    ]).start();
  }, [reduceMotion, screenHeight, scrim, translateY]);

  const animateOut = useCallback(
    (done: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      Animated.parallel([
        Animated.timing(scrim, {
          toValue: 0,
          duration: duration.base,
          easing: easing.accelerate,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: screenHeight,
          duration: duration.base,
          easing: easing.accelerate,
          useNativeDriver: true,
        }),
      ]).start(() => done());
    },
    [screenHeight, scrim, translateY],
  );

  /**
   * Animasyon fonksiyonları ref üzerinden okunur: efekt YALNIZ `visible`
   * değişince çalışmalı. Doğrudan bağımlılık verilseydi tema/ekran ölçüsü
   * değiştiğinde panel kendiliğinden yeniden açılıp kapanırdı.
   */
  const animateInRef = useRef(animateIn);
  const animateOutRef = useRef(animateOut);
  const mountedRef = useRef(mounted);
  animateInRef.current = animateIn;
  animateOutRef.current = animateOut;
  mountedRef.current = mounted;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Modal içeriği ilk kareyi çizdikten sonra animasyon başlar.
      const frame = requestAnimationFrame(() => animateInRef.current());
      return () => cancelAnimationFrame(frame);
    }
    if (mountedRef.current) animateOutRef.current(() => setMounted(false));
    return undefined;
  }, [visible]);

  /** Kapatma isteği: önce animasyon, sonra üst bileşene haber. */
  const requestClose = useCallback(() => {
    animateOut(() => {
      setMounted(false);
      onClose();
    });
  }, [animateOut, onClose]);

  const closeRef = useRef(requestClose);
  useEffect(() => {
    closeRef.current = requestClose;
  }, [requestClose]);

  const pan = useRef<PanResponderInstance>(
    PanResponder.create({
      // Dokunuş anında responder alınmaz: tutamağa DOKUNMAK da kapatmalı.
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > CLOSE_DISTANCE || gesture.vy > CLOSE_VELOCITY) {
          closeRef.current();
          return;
        }
        Animated.spring(translateY, { toValue: 0, ...spring.sheet }).start();
      },
    }),
  ).current;

  if (!mounted) return null;

  const panelStyle = [
    styles.panel,
    elevate(4),
    snap === "full"
      ? { height: screenHeight - insets.top - space.md }
      : snap === "half"
        ? // Klavye açıkken yarım panel klavye kadar uzar; içerik alanı korunur.
          { height: Math.min(screenHeight * 0.5 + keyboardInset, screenHeight - insets.top - space.md) }
        : { maxHeight: screenHeight * 0.86 },
    { paddingBottom: keyboardInset > 0 ? keyboardInset + space.sm : insets.bottom + space.md },
    { transform: [{ translateY }] },
  ];

  const body = scrollable ? (
    <ScrollView
      style={snap === "content" ? styles.scroll : styles.scrollFill}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={snap === "content" ? styles.plainBodyContent : styles.plainBody}>{children}</View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <View style={styles.root} onLayout={(event) => setRootHeight(event.nativeEvent.layout.height)}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrim }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel="Paneli kapat"
          />
        </Animated.View>

        <Animated.View style={panelStyle}>
          {/* Tutamak bölgesi: hem sürükleme alanı hem de kapatma düğmesi. */}
          <View {...pan.panHandlers}>
            {handle ? (
              <Touchable
                feedback="none"
                onPress={requestClose}
                accessibilityRole="button"
                accessibilityLabel="Paneli kapat"
                accessibilityHint="Aşağı sürükleyerek de kapatabilirsiniz"
                style={styles.handleArea}
              >
                <View style={styles.handle} />
              </Touchable>
            ) : null}

            {title || dismissible ? (
              <View style={styles.header}>
                <Text
                  style={styles.title}
                  numberOfLines={1}
                  accessibilityRole="header"
                  {...textScale.dense}
                >
                  {title ?? ""}
                </Text>
                {dismissible ? (
                  <Touchable
                    feedback="icon"
                    onPress={requestClose}
                    accessibilityRole="button"
                    accessibilityLabel="Kapat"
                    style={styles.closeButton}
                  >
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </Touchable>
                ) : null}
              </View>
            ) : null}
          </View>

          {body}

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    backgroundColor: colors.overlay,
  },
  panel: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    // Üst köşeler yuvarlak; alt köşeler ekran kenarına yapışır.
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
  },
  handleArea: {
    alignItems: "center",
    paddingTop: space.m,
    paddingBottom: space.s,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg + space.xxs,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  /* Başlık ayraçsızdır: tipografi (h1) bölgeyi zaten ayırır; çizgi, sheet'i
     "başlık + gövde" diye iki kutuya bölüyordu. */
  title: {
    ...type.h1,
    color: colors.textPrimary,
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  /** "content" snap'inde sheet içeriği kadar uzar; ekranı zorla doldurmaz. */
  scroll: {
    flexGrow: 0,
  },
  /** "half"/"full" snap'inde panelin kalan yüksekliğini doldurur. */
  scrollFill: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space.lg + space.xxs,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  plainBody: {
    flex: 1,
  },
  /**
   * "content" snap'inde panelin yüksekliği tanımsızdır (yalnız `maxHeight`);
   * `flex: 1` gövdeyi düzen motorunun kipine göre ya %86'ya gerer ya da sıfıra
   * çökertir. İçerik kadar yer kaplar, sığmazsa küçülür.
   */
  plainBodyContent: {
    flexShrink: 1,
  },
  footer: {
    paddingHorizontal: space.lg + space.xxs,
    paddingTop: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
});
