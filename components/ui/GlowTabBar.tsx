/**
 * GlowTabBar — ALT MENÜ RAYI. "Bar ekranın kenarına oturur; ışık kaynağı üstte."
 *
 * NE DEĞİŞTİ (ikinci tur): bir önceki sürüm ekranın altında YÜZEN bir haptı ve
 * seçili sekmenin üstüne bir ışık KONİSİ düşürüyordu. İki şikâyet de aynı
 * yerden geliyordu:
 *
 *   1. YÜZEN HAP YER YİYORDU. Hapın etrafındaki 16px boşluk sekme çubuğu
 *      yuvasına dâhildi; altı sekme 360px'e sıkışınca dokunma alanı 52px'e
 *      düşüyor, "Oyuncular" etiketi kırpılıyordu. Şimdi bar ekranın alt
 *      kenarına OTURUYOR: kazanılan 12px içeriğe döndü (bkz.
 *      `layout.tabBarHeight` 72 → 60) ve liste ekranlarında bir satır daha
 *      görünüyor.
 *
 *   2. KONİ NEREDEN GELDİĞİ BELLİ OLMAYAN BİR SİSTİ. İkonun üstünde asılı
 *      duran bir leke, seçimi ancak komşusuyla karşılaştırınca söylüyordu.
 *      Yerine İKİ NET SİNYAL kondu ve ikisi de aynı şeyi anlatır:
 *        · KAPSÜL — seçili ikonu saran mor pul (`tabCapsule`). Seçim ikonun
 *          KENDİ kutusunda okunur; komşuya bakmak gerekmez.
 *        · HUZME — barın üst kenarındaki 22px'lik parlak çizgi (`tabBeam`).
 *          Işığın kaynağı görünür bir çizgidir ve sekme değişince YAYLANARAK
 *          oraya kayar. Hareket, seçimin yönünü de söyler.
 *
 * BEŞ SEKME: "Menü" sekmesi kaldırıldı, içeriği Profil'in en üstündeki
 * kısayol ızgarasına taşındı (bkz. app/(tabs)/_layout.tsx başlığı). Beş yuva,
 * 360px'lik bir telefonda 72px dokunma alanı demektir; etiket kırpılmaz.
 *
 * NEDEN BAR İKİ TEMADA DA KOYU MOR: tema değiştiğinde uygulamanın kimliği
 * değişmemeli. Açık temada bar, beyaz kâğıdın üstündeki tek koyu adadır ve
 * markayı her ekranda taşır; koyu temada kâğıttan bir kademe AÇIK durur.
 * Bar iki temada da koyu olduğu için üstündeki bütün renkler (ikon, etiket,
 * huzme, kapsül) temadan bağımsızdır — tek yüzey, tek kural.
 *
 * NEDEN SEKMELER PROP OLARAK GELİYOR: `href: null` ile gizlenen rotalar
 * (ligler, favoriler, oyunlar, menu) gezinme durumunda DURMAYA devam eder;
 * expo-router onları yalnız `tabBarItemStyle: { display: "none" }` ile saklar.
 * Özel bir çubuğun bu iç ayrıntıyı okuması kırılgan olurdu. Görünen sekmelerin
 * listesi `app/(tabs)/_layout.tsx` içinde AÇIKÇA yazılır; burası yalnız çizer.
 *
 * ERİŞİLEBİLİRLİK: her yuva `role="tab"` + `selected` durumu taşır, dokunma
 * alanı barın tam yüksekliğidir (44px tabanının üstünde) ve "hareketi azalt"
 * açıkken huzme yaylanmadan doğrudan yeni sekmeye taşınır.
 */

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CommonActions } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  colors,
  hairline,
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

/* ÖLÇÜLER — barın iç geometrisi tek yerde.
   8 üst dolgu + 26 kapsül + 3 aralık + 13 etiket + 10 alt dolgu = 60
   (`layout.tabBarHeight`); güvenli alan bunun ALTINA eklenir. */
/** Seçili ikonu saran kapsül. */
const CAPSULE_WIDTH = 44;
const CAPSULE_HEIGHT = 26;
/** Üst kenardaki ışık kaynağı — kapsülden dar, ikondan geniş. */
const BEAM_WIDTH = 22;
const BEAM_HEIGHT = 3;

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
  /* Gizli bir rota açıkken (ör. Profil'den girilen "oyunlar") hiçbir sekme
     seçili değildir; huzme o sırada SON seçili sekmenin üstünde kalır — bir
     yere kaymaz, sönmez. Kaybolan bir ışık, kullanıcıya "çubuk bozuldu"
     dedirtiyordu. */
  const matchedIndex = tabs.findIndex((tab) => tab.name === activeName);
  const lastIndex = useRef(0);
  if (matchedIndex >= 0) lastIndex.current = matchedIndex;
  const activeIndex = matchedIndex >= 0 ? matchedIndex : lastIndex.current;

  /* Huzmenin konumu SEKME İNDİSİ olarak tutulur, piksel olarak değil: bar
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
     aşımı da bilerek kırpılmaz — huzmenin hedefi bir tık geçip geri oturması,
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
      style={[styles.bar, { paddingBottom: insets.bottom }]}
      onLayout={onBarLayout}
    >
      <LinearGradient
        colors={colors.gradientTabBar}
        start={BAR_START}
        end={BAR_END}
        style={styles.barFill}
        pointerEvents="none"
      />
      {/* Üst kenar: barı sayfadan ayıran ince ışık çizgisi. */}
      <View style={styles.edge} pointerEvents="none" />

      {/* Işık kaynağı — barın ÜST kenarında, seçili sekmeye yaylanarak kayar.
          Yuva genişliğinde saydam bir kutu içinde ortalanır; böylece huzmenin
          konumu sekme sayısından bağımsız olarak doğru hesaplanır. */}
      {slot > 0 ? (
        <Animated.View
          style={[styles.beamSlot, { width: slot, transform: [{ translateX }] }]}
          pointerEvents="none"
        >
          <View style={styles.beam} />
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
            {/* Kapsül seçili sekmede DOLU, diğerlerinde saydamdır; ikon her
                iki hâlde de aynı kutunun ortasında durur, yani seçim
                değişince ikon KIPIRDAMAZ. */}
            <View style={[styles.capsule, focused ? styles.capsuleOn : null]}>
              <TabBarIcon
                name={tab.icon}
                focused={focused}
                color={focused ? colors.tabActive : colors.tabInactive}
                size={22}
                badge={tab.badge && tab.badge > 0 ? tab.badge : undefined}
              />
            </View>
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
  );
}

/** Android dalgası sekmenin içinde kalır; renk barın kendi ışığından gelir. */
const ANDROID_RIPPLE = { color: colors.tabBarBorder, borderless: true } as const;

const styles = StyleSheet.create({
  /**
   * Bar ekranın alt kenarına OTURUR: yatay boşluk, köşe yarıçapı ve gölge
   * yoktur. Yüzen hap denendi ve kendi etrafındaki boşluğu sekme çubuğu
   * yuvasına saydırıp içerikten çalıyordu; kenara oturan bar o pikselleri
   * listeye geri verir. Yükseklik `layout.tabBarHeight`, güvenli alan
   * `paddingBottom` ile ALTINA eklenir — React Navigation yüksekliği
   * buradan ölçtüğü için ekranların ayrıca alt dolgu vermesi gerekmez.
   */
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    height: layout.tabBarHeight,
    /* Gradyan yüklenemezse (web/eski cihaz) düz zemin altta durur. */
    backgroundColor: colors.tabBar,
  },
  barFill: {
    ...StyleSheet.absoluteFillObject,
  },
  /**
   * Üst kenar — barı sayfadan ayıran tek çizgi. Gölge KULLANILMAZ: bar
   * yüzmüyor, oturuyor; oturan bir yüzeyin gölgesi olmaz, kenarı olur.
   */
  edge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: hairline,
    backgroundColor: colors.tabBarBorder,
  },
  /** Huzmenin taşıyıcısı: bir sekme yuvası genişliğinde, sola yaslı. */
  beamSlot: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
  },
  beam: {
    width: BEAM_WIDTH,
    height: BEAM_HEIGHT,
    /* Alt köşeler yuvarlak, üst köşeler değil: çizgi barın üst kenarından
       ÇIKIYOR gibi dursun; iki ucu da yuvarlak bir hap, kenardan kopmuş
       serbest bir çubuk gibi görünüyordu. */
    borderBottomLeftRadius: BEAM_HEIGHT,
    borderBottomRightRadius: BEAM_HEIGHT,
    backgroundColor: colors.tabBeam,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 3,
    paddingTop: space.sm,
    paddingBottom: space.m,
  },
  /** İkonun kutusu — seçilmemiş hâlde saydam, ölçüsü aynı. */
  capsule: {
    width: CAPSULE_WIDTH,
    height: CAPSULE_HEIGHT,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: hairline,
    borderColor: "transparent",
  },
  capsuleOn: {
    backgroundColor: colors.tabCapsule,
    borderColor: colors.tabCapsuleBorder,
  },
  /**
   * ETİKET SEÇİLİ OLMAYAN SEKMEDE DE OKUNUR. Yalnız seçili sekmeyi
   * etiketlemek modern duruyor ama beş bölümlü bir uygulamada kullanıcıyı
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
