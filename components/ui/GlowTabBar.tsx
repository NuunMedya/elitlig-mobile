/**
 * GlowTabBar — ALT MENÜ BARI. "Işık, dokunduğun sekmeye uzanır."
 *
 * NE DEĞİŞTİ: eski çubuk, ekranın alt kenarına yapışık, üstünde 1px çizgi olan
 * düz bir şeritti — yani platformun varsayılan sekme çubuğunun renkli hâli.
 * Uygulamanın HER ekranında görünen tek yüzey oydu ve hiçbir şey söylemiyordu.
 *
 * YENİ FİKİR TEK CÜMLE: bar ekranın altında YÜZEN koyu mor bir haptır ve
 * seçili sekmenin üstünde bir IŞIK yanar; başka bir sekmeye dokunduğunuzda o
 * ışık söndürülüp yeniden yakılmaz — yaylanarak oraya UZANIR. Seçimi anlatan
 * şey artık bir renk değil, bir hareket.
 *
 * IŞIK ÜÇ KATMANDIR (sırayla, üstten alta):
 *   1. ÇİZGİ (`tabBeam`) — barın üst kenarındaki 3px'lik parlak kaynak.
 *   2. KONİ (`tabGlow`) — çizginin altına düşen, aşağı doğru sönen dikey
 *      geçiş. Işığın ikonun üstüne düşen huzmesi budur.
 *   3. TABAN — koninin altındaki çok sönük mor pul; huzmenin "yere vurduğu"
 *      yer. Bu olmadan koni havada asılı kalıyor, ikonla ilişkisi kurulmuyordu.
 *
 * NEDEN BAR İKİ TEMADA DA KOYU MOR: tema değiştiğinde uygulamanın kimliği
 * değişmemeli. Açık temada bar, beyaz kâğıdın üstündeki tek koyu adadır ve
 * markayı her ekranda taşır; koyu temada kâğıttan bir kademe AÇIK durur ki
 * gece de yüzdüğü okunsun. Bar iki temada da koyu olduğu için üstündeki bütün
 * renkler (ikon, etiket, ışık) temadan bağımsızdır — tek bir yüzey, tek bir
 * kural.
 *
 * NEDEN YÜZEN AMA AKIŞTA: bar `position: absolute` DEĞİLDİR; sekme çubuğu
 * yuvasının tamamını (hap + boşluklar + güvenli alan) kaplayan saydam bir
 * kapsayıcının içinde durur. Böylece React Navigation yüksekliği doğru ölçer
 * ve ekranların içeriği barın ALTINA girmez — altmış ekranın hiçbirine alt
 * dolgu eklemek gerekmedi. Hapın etrafındaki boşluktan sayfanın kendi zemini
 * görünür; "yüzen" görüntüsünü kuran şey budur.
 *
 * NEDEN SEKMELER PROP OLARAK GELİYOR: `href: null` ile gizlenen rotalar
 * (ligler, favoriler, oyunlar) gezinme durumunda DURMAYA devam eder; expo-router
 * onları yalnız `tabBarItemStyle: { display: "none" }` ile saklar. Özel bir
 * çubuğun bu iç ayrıntıyı okuması kırılgan olurdu. Görünen sekmelerin listesi
 * `app/(tabs)/_layout.tsx` içinde AÇIKÇA yazılır; buradaki kod yalnız çizer.
 *
 * ERİŞİLEBİLİRLİK: her yuva `role="tab"` + `selected` durumu taşır, dokunma
 * alanı hapın tam yüksekliğidir (58px, 44px tabanının üstünde) ve "hareketi
 * azalt" açıkken ışık yaylanmadan doğrudan yeni sekmeye taşınır.
 */

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CommonActions } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  colors,
  haptics,
  layout,
  radius,
  space,
  spring,
  textScale,
  type,
} from "@/theme";
import { useReduceMotion } from "./LiveBadge";
import { TabBarIcon } from "./TabBarIcon";

/** Barın yüzey gradyanı — yüzeylerin ışığı daima sağdan gelir. */
const BAR_START = { x: 1, y: 0.5 } as const;
const BAR_END = { x: 0, y: 0.5 } as const;

/**
 * Işık konisinin ekseni — DİKEY, yukarıdan aşağı. Koni bir yüzey değil bir
 * IŞIK KAYNAĞIDIR; yatay yüzey kuralı (bkz. scripts/check-tokens.mjs) onun
 * için geçerli değildir, tıpkı maç sahnesinin `matchWash` yıkaması gibi.
 */
const GLOW_START = { x: 0.5, y: 0 } as const;
const GLOW_END = { x: 0.5, y: 1 } as const;

/* ÖLÇÜLER — hapın iç geometrisi tek yerde.
   Hap 58px: 11 üst dolgu + 22 ikon + 2 aralık + 15 etiket kutusu + 8 alt dolgu.
   Yuva yüksekliği (`layout.tabBarHeight`) = 6 üst boşluk + 58 hap + 8 alt
   boşluk; güvenli alan bunun altına eklenir. */
const BAR_HEIGHT = 58;
/** Işık çizgisinin genişliği — ikon kutusundan bir tık geniş. */
const BEAM_WIDTH = 30;
/** Koninin yüksekliği: ikonun tam üstünde biter, etiketi yıkamaz. */
const CONE_HEIGHT = 34;

/** Görünen bir sekme — sıra, etiket ve ikon `_layout.tsx` içinde tanımlanır. */
export interface GlowTab {
  /** `app/(tabs)/` altındaki rota adı. */
  name: string;
  label: string;
  /** Dolu varyantın adı; seçili olmayan sekmede "-outline" eklenir. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Sayısal rozet — 0/undefined ise çizilmez. */
  badge?: number;
  /** Ekran okuyucu etiketi; verilmezse `label` kullanılır. */
  accessibilityLabel?: string;
}

export interface GlowTabBarProps extends BottomTabBarProps {
  tabs: readonly GlowTab[];
}

export function GlowTabBar({ state, navigation, insets, tabs }: GlowTabBarProps) {
  const reduceMotion = useReduceMotion();
  const [barWidth, setBarWidth] = useState(0);

  /** Rota adı → gezinme durumundaki rota. Gizli rotalar burada yok sayılır. */
  const routeByName = useMemo(() => {
    const map = new Map<string, (typeof state.routes)[number]>();
    for (const route of state.routes) map.set(route.name, route);
    return map;
  }, [state.routes]);

  const activeName = state.routes[state.index]?.name;
  /* Gizli bir rota açıkken (ör. Menü'den girilen "oyunlar") hiçbir sekme
     seçili değildir; ışık o sırada SON seçili sekmenin üstünde kalır — bir
     yere kaymaz, sönmez. Kaybolan bir ışık, kullanıcıya "çubuk bozuldu"
     dedirtiyordu. */
  const matchedIndex = tabs.findIndex((tab) => tab.name === activeName);
  const lastIndex = useRef(0);
  if (matchedIndex >= 0) lastIndex.current = matchedIndex;
  const activeIndex = matchedIndex >= 0 ? matchedIndex : lastIndex.current;

  /* Işığın konumu SEKME İNDİSİ olarak tutulur, piksel olarak değil: bar
     ölçüsü değiştiğinde (döndürme, katlanır ekran) yeniden animasyon
     başlatmadan yalnız interpolasyonun çıktı aralığı değişir. */
  const travel = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    if (reduceMotion) {
      travel.setValue(activeIndex);
      return;
    }
    Animated.spring(travel, { toValue: activeIndex, ...spring.sheet }).start();
  }, [activeIndex, reduceMotion, travel]);

  const slot = tabs.length > 0 ? barWidth / tabs.length : 0;
  const span = Math.max(1, tabs.length - 1);

  /* İki noktalı doğrusal interpolasyon bütün indisleri kapsar; yayın hafif
     aşımı da bilerek kırpılmaz — ışığın hedefi bir tık geçip geri oturması,
     "uzanma" hissini veren şeyin ta kendisi. */
  const translateX = travel.interpolate({
    inputRange: [0, span],
    outputRange: [0, slot * span],
  });

  const onBarLayout = (event: LayoutChangeEvent) => {
    setBarWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      style={[
        styles.slot,
        { paddingBottom: (insets.bottom > 0 ? insets.bottom : space.sm) },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.bar} onLayout={onBarLayout}>
        <LinearGradient
          colors={colors.gradientTabBar}
          start={BAR_START}
          end={BAR_END}
          style={styles.barFill}
          pointerEvents="none"
        />

        {/* Işık — hapın içinde, içeriğin ALTINDA çizilir; ikon ve etiket
            huzmenin içinde durur, üstünde değil. */}
        {slot > 0 ? (
          <Animated.View
            style={[styles.light, { width: slot, transform: [{ translateX }] }]}
            pointerEvents="none"
          >
            <View style={styles.beam} />
            <LinearGradient
              colors={colors.tabGlow}
              start={GLOW_START}
              end={GLOW_END}
              style={styles.cone}
              pointerEvents="none"
            />
            <View style={styles.pool} />
          </Animated.View>
        ) : null}

        {tabs.map((tab, index) => {
          const route = routeByName.get(tab.name);
          const focused = index === activeIndex && matchedIndex >= 0;

          const onPress = () => {
            if (!route) return;
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (event.defaultPrevented) return;
            haptics.select();
            /* `navigate` yerine hedefi AÇIKÇA verilen bir eylem gönderilir:
               `navigation.navigate("maclar")` en yakın gezginde o adı arar ve
               iç içe gezginlerde yanlış yuvaya düşebilir. `target: state.key`
               eylemi doğrudan BU sekme gezginine bağlar. */
            navigation.dispatch({
              ...CommonActions.navigate(route.name, route.params),
              target: state.key,
            });
          };

          const onLongPress = () => {
            if (!route) return;
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <Pressable
              key={tab.name}
              onPress={onPress}
              onLongPress={onLongPress}
              android_ripple={ANDROID_RIPPLE}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.accessibilityLabel ?? tab.label}
              style={styles.tab}
              testID={`tab-${tab.name}`}
            >
              <TabBarIcon
                name={tab.icon}
                focused={focused}
                color={focused ? colors.tabActive : colors.tabInactive}
                size={22}
                badge={tab.badge && tab.badge > 0 ? tab.badge : undefined}
              />
              <Text
                style={[styles.label, focused ? styles.labelOn : null]}
                numberOfLines={1}
                {...textScale.badge}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Android dalgası hapın içinde kalır; renk barın kendi ışığından gelir. */
const ANDROID_RIPPLE = { color: colors.tabBarBorder, borderless: true } as const;

const styles = StyleSheet.create({
  /**
   * Sekme çubuğu yuvası — SAYDAM. React Navigation yüksekliği buradan ölçer;
   * hapın etrafındaki boşluktan sayfanın kendi zemini görünür.
   */
  slot: {
    paddingTop: space.s,
    paddingHorizontal: layout.screenPadding,
    backgroundColor: "transparent",
  },
  /** Yüzen hap. */
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    height: BAR_HEIGHT,
    borderRadius: radius.xl,
    /* İçerik hapın dışına taşmaz: ışık, yayın aşımında kenardan sızmasın diye
       burada kırpılır — sızan ışık, hapın köşesini kırık gösteriyordu. */
    overflow: "hidden",
    /* Gradyan yüklenemezse (web/eski cihaz) düz zemin altta durur. */
    backgroundColor: colors.tabBar,
    borderWidth: 1,
    borderColor: colors.tabBarBorder,
    /* Hap gerçekten yüzer: gölge iki temada da MOR ve geniştir. Açık temada
       beyaz kâğıdın üstünde barı kaldıran şey odur; koyu temada gölge
       görünmez ama Android'de `elevation` katman sırasını doğru tutar. */
    ...Platform.select({
      ios: {
        shadowColor: colors.shadowColor,
        shadowOpacity: 0.28,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 12 },
      default: {
        shadowColor: colors.shadowColor,
        shadowOpacity: 0.28,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
      },
    }),
  },
  barFill: {
    ...StyleSheet.absoluteFillObject,
  },
  /** Işık katmanı — bir sekme yuvası genişliğinde, sola yaslı, kaydırılır. */
  light: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
  },
  /** Kaynak: barın üst kenarına oturan parlak çizgi. */
  beam: {
    width: BEAM_WIDTH,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.tabBeam,
  },
  /** Huzme: çizginin altına düşen, aşağı doğru sönen koni. */
  cone: {
    position: "absolute",
    top: 0,
    left: space.s,
    right: space.s,
    height: CONE_HEIGHT,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  /**
   * Huzmenin yere vurduğu yer — ikonun arkasındaki çok sönük mor pul.
   * Koni tek başınayken havada asılı kalıyor, seçili ikonla ilişkisi
   * kurulmuyordu; pul ikonu ışığın İÇİNE oturtur.
   */
  pool: {
    position: "absolute",
    /* Yatayda merkezlenmesini kapsayıcının `alignItems: "center"`i sağlar
       (Yoga, sol/sağ verilmemiş mutlak çocuğu hizalama kuralına uyar);
       dikeyde ikonun merkezine oturur. */
    top: space.xs,
    width: BEAM_WIDTH + space.md,
    height: BEAM_WIDTH + space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.tabBarBorder,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingTop: space.m,
    paddingBottom: space.sm,
  },
  /**
   * ETİKET SEÇİLİ OLMAYAN SEKMEDE DE OKUNUR. Yalnız seçili sekmeyi
   * etiketlemek modern duruyor ama altı bölümlü bir uygulamada kullanıcıyı
   * ikon tahminine mahkûm eder; sönük etiket AA metin eşiğini geçer
   * (bkz. scripts/check-tokens.mjs).
   */
  label: {
    ...type.micro,
    letterSpacing: -0.1,
    textTransform: "none",
    color: colors.tabInactive,
  },
  labelOn: {
    color: colors.tabActive,
  },
});
