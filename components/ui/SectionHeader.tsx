/**
 * SectionHeader — bölüm/grup başlığı, yapışkan kullanılabilir.
 *
 * TEK BİÇİM (tema.html §6 ".sh"): 3px mor ray + Archivo VERSAL 11px başlık +
 * sağda "Tümü ›" kapısı. Ekranın hangi bölümü olursa olsun başlık aynı sesle
 * konuşur; "bölüm başlığı dışında hiçbir yerde ikinci bir başlık biçimi yok"
 * maketin kendi cümlesidir.
 *
 * NEDEN VERSAL VE KÜÇÜK: bir önceki sürüm 16px karışık harfli `h2` idi ve
 * başlık, altındaki kartın satır başlığıyla (15px semibold) aynı boyda
 * duruyordu — "Bugün" ile "FC ANGARA" yarışıyordu. Versal 11px Archivo bir
 * ETİKETTİR: içerikle yarışmaz ama geniş harf aralığı ve ray sayesinde
 * uzaktan seçilir. Türkçe büyük harf daima `upperTR()` ile yapılır (I/İ
 * sorunu); erişilebilirlik etiketi özgün metni taşır, ekran okuyucu "BUGÜN"
 * diye bağırmaz.
 *
 * İKİ BOY, AYNI GÖRÜNÜM (`size`):
 *   · "section" (VARSAYILAN) — ekrandaki asıl bölüm başlığı.
 *   · "group" — yoğun bir listenin içindeki grup etiketi (lig adı, gün);
 *     yalnız dikey payı daha sıkıdır, çünkü yapışkan bir bant olarak kayar.
 *
 * DİKEY PAY: maket başlığa 20px üst / 9px alt boşluk verir. Üst boşluğu bu
 * bileşen DEĞİL ekran taşır — her ekran bölümler arasına zaten kendi nefesini
 * (space.lg / layout.sectionGap) koyuyor; ikisi üst üste binseydi bölümler
 * arası 36px'e çıkardı. Bileşen üstte yalnız küçük bir pay, altta maketin
 * 9px'ini basar.
 *
 * YAPIŞKAN KULLANIM: `sticky` verildiğinde zemin OPAK `bg` olur ve alta
 * hairline eklenir; şeffaf bırakılırsa altından kayan satırlar başlığın
 * içinden geçer.
 *
 * İMZA ÖĞESİ — RAY. Başlığın solunda 3×13px mor dikey işaret durur; bir
 * bölümün nerede başladığını renk değil GEOMETRİ söyler. `leading` (lig
 * amblemi) verildiğinde ray çizilmez — iki sol gösterge yan yana gelirse
 * ikisi de anlamını kaybeder.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  colors,
  duration,
  easing,
  fonts,
  hairline,
  layout,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";
import { Touchable } from "./Pressable";

export interface SectionHeaderProps {
  title: string;
  /** Sağda gri sayaç/etiket: "8 maç" */
  meta?: string;
  /** Sol ikon (lig logosu veya Ionicon düğümü). */
  leading?: React.ReactNode;
  /** Katlanabilir grup başlığı. */
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Sağda eylem: "Tümü" */
  action?: { label: string; onPress: () => void };
  /** SectionList'te sticky ise: opak zemin + alt kenarlık. */
  sticky?: boolean;
  /**
   * Başlığın boyu. "section" ekranın bölüm başlığı, "group" yoğun liste içi
   * grup etiketi. Varsayılan "section".
   */
  size?: "section" | "group";
  /**
   * Büyük harfe çevir. Varsayılan true — maket başlığı daima versaldır.
   * Resmî bir başlığın (kural maddesi) yazımı korunacaksa false verilir.
   */
  uppercase?: boolean;
  /** Ray işareti. Varsayılan true; `leading` varsa yok sayılır. */
  mark?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const SectionHeader = React.memo(function SectionHeader({
  title,
  meta,
  leading,
  collapsible,
  collapsed,
  onToggle,
  action,
  sticky,
  size = "section",
  uppercase = true,
  mark = true,
  style,
  testID,
}: SectionHeaderProps) {
  const spin = useRef(new Animated.Value(collapsed ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(spin, {
      toValue: collapsed ? 0 : 1,
      duration: duration.base,
      easing: easing.standard,
      useNativeDriver: true,
    }).start();
  }, [collapsed, spin]);

  const chevronStyle = useMemo(
    () => ({
      transform: [
        {
          rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }),
        },
      ],
    }),
    [spin],
  );

  const group = size === "group";
  const label = uppercase ? upperTR(title) : title;

  const body = (
    <>
      {collapsible ? (
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-forward" size={12} color={colors.textTertiary} />
        </Animated.View>
      ) : null}
      {leading ? (
        <View style={styles.leading}>{leading}</View>
      ) : mark ? (
        <View style={styles.mark} />
      ) : null}
      <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
      {meta ? (
        <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
          {upperTR(meta)}
        </Text>
      ) : null}
    </>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.header,
    group ? styles.headerGroup : styles.headerSection,
    sticky ? styles.sticky : null,
    style,
  ];

  return (
    <View style={styles.wrapper} testID={testID}>
      {collapsible && onToggle ? (
        <Touchable
          feedback="row"
          haptic="selection"
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded: !collapsed }}
          style={[containerStyle, styles.flex]}
        >
          {body}
        </Touchable>
      ) : (
        <View
          accessibilityRole="header"
          accessibilityLabel={meta ? `${title}, ${meta}` : title}
          style={[containerStyle, styles.flex]}
        >
          {body}
        </View>
      )}

      {action ? (
        <Touchable
          feedback="icon"
          haptic="none"
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={[styles.action, group ? styles.headerGroup : styles.headerSection, sticky ? styles.sticky : null]}
        >
          <Text style={styles.actionLabel} numberOfLines={1} {...textScale.dense}>
            {action.label}
          </Text>
          <Ionicons name="chevron-forward" size={12} color={colors.brandAccent} />
        </Touchable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
  },
  /** Maketin 9px alt payı: space.sm + 1. Üst pay ekranın bölüm boşluğuna eklenir. */
  headerSection: {
    paddingTop: space.xs,
    paddingBottom: space.sm + space.px,
  },
  /** Yapışkan bant: liste içinde kaydığı için üst/alt eşit ve sıkı. */
  headerGroup: {
    paddingVertical: space.s,
  },
  sticky: {
    backgroundColor: colors.bg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  leading: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Ray: 3×13px mor dikey işaret (maket ".sh i.bar"), başlıkla dikey ortalı. */
  mark: {
    width: 3,
    height: 13,
    borderRadius: 2,
    backgroundColor: colors.brand,
  },
  /** Archivo versal 11px, geniş aralık — etiket sesi, manşet değil. */
  title: {
    ...type.overline,
    fontFamily: fonts.display,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.4,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  /** "4 MAÇ": başlıkla aynı aile, bir punto küçük, üçüncül mürekkep. */
  meta: {
    ...type.micro,
    fontFamily: fonts.display,
    letterSpacing: 0.6,
    color: colors.textTertiary,
    marginLeft: "auto",
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: layout.screenPadding,
  },
  actionLabel: {
    ...type.caption,
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    color: colors.brandAccent,
  },
});
