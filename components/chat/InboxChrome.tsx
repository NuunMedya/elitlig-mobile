/**
 * SOHBET LİSTESİ ÇERÇEVESİ — başlık, arama, süzgeç hapları ve yüzen
 * "yeni sohbet" düğmesi (Gece teması · ikinci tur).
 *
 *   · BAŞLIK: üstte küçük "ELİTLİG · SOHBET" satırı, altında büyük "Mesajlar".
 *     Sağda CAM eylem düğmeleri (yarı saydam daire + ışıklı kenar); ilki arama.
 *   · ARAMA — ICON EXPAND: arama bir cam daire olarak durur; dokununca
 *     yerinden sola doğru uzayıp başlık satırının tamamını kaplayan alana
 *     dönüşür (diğer düğmeler ve başlık söner, alanın solunda "geri" belirir).
 *     Kapatınca aynı yoldan daireye geri büzülür. Genişlik canlandırıldığı için
 *     yerel sürücü yoktur; tek seferlik 240 ms, "hareketi azalt" açıkken anında.
 *   · HAPLAR — SLIDING PILL: haplar cam zeminde durur; seçili hapın ARKASINDA
 *     mor degrade (gradientBrand) bir kapsül yaylanarak bir haptan ötekine kayar.
 *     Sayaç hapın içinde küçük bir kabarcıktır.
 *   · FAB: degrade dolgulu, mor parıltılı yuvarlatılmış kare; ilk çizimde
 *     aşağıdan yaylanarak belirir, kaydırınca ve arama sırasında gizlenir.
 *
 * Dışa açılan adlar ve prop'lar ilk turla aynıdır (`InboxHeader`,
 * `FilterPills`, `InboxFab`, `FILTER_BAR_HEIGHT`).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from "react-native";

import { Touchable } from "@/components/chat/kit";
import { Aurora, useReduceMotion } from "@/components/ui";
import { colors, wa } from "@/lib/chatPalette";
import { duration, easing, fonts, glowStyle, hairline, layout, palette, radius, space, spring, textScale, type } from "@/theme";

/** Degrade yönü: sağdan sola (açık uç sağda). */
const G_START = { x: 1, y: 0.5 } as const;
const G_END = { x: 0, y: 0.5 } as const;

/* --------------------------------- başlık --------------------------------- */

export interface InboxHeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  badge?: number | "dot";
}

export interface InboxHeaderProps {
  title: string;
  /** Yığın (stack) ekranında geri oku. */
  onBack?: () => void;
  actions: InboxHeaderAction[];
  /** Arama alanı gösterilsin mi (misafirde kapalı). */
  searchable?: boolean;
  searching: boolean;
  value: string;
  placeholder: string;
  /** Ekran okuyucu etiketi; verilmezse `placeholder` okunur. */
  searchLabel?: string;
  onChangeText: (value: string) => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
}

const HEADER_HEIGHT = 64;
const ACTION = 40;
const ACTION_GAP = space.sm;

/** Cam eylem düğmesi (başlık ve sohbet başlığı aynı biçimi kullanır). */
export const GlassAction = memo(function GlassAction({ icon, onPress, accessibilityLabel, badge }: InboxHeaderAction) {
  return (
    <Touchable feedback="icon" haptic="light" onPress={onPress} hitSlop={2} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={styles.action}>
      <Ionicons name={icon} size={20} color={colors.textPrimary} />
      {badge === "dot" ? (
        <View style={styles.actionDot} />
      ) : badge ? (
        <View style={styles.actionBadge}>
          <Text style={styles.actionBadgeText} {...textScale.badge}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
    </Touchable>
  );
});

export const InboxHeader = memo(function InboxHeader({ title, onBack, actions, searchable = true, searching, value, placeholder, searchLabel, onChangeText, onOpenSearch, onCloseSearch }: InboxHeaderProps) {
  const reduceMotion = useReduceMotion();
  const input = useRef<TextInput>(null);
  const mode = useRef(new Animated.Value(searching ? 1 : 0)).current;
  const [rowWidth, setRowWidth] = useState(0);

  useEffect(() => {
    Animated.timing(mode, { toValue: searching ? 1 : 0, duration: reduceMotion ? duration.instant : duration.medium, easing: easing.emphasized, useNativeDriver: false }).start();
    if (!searching) input.current?.blur();
  }, [mode, reduceMotion, searching]);

  const openSearch = useCallback(() => {
    onOpenSearch();
    // Alan büyürken klavye açılsın: odak bir sonraki karede verilir.
    requestAnimationFrame(() => input.current?.focus());
  }, [onOpenSearch]);

  const onLayout = useCallback((event: LayoutChangeEvent) => setRowWidth(event.nativeEvent.layout.width), []);

  /* Arama dairesi eylemlerin en solundadır; sağ kenardan uzaklığı eylem sayısından gelir. */
  const restRight = layout.screenPadding + actions.length * (ACTION + ACTION_GAP);
  const fullWidth = Math.max(ACTION, rowWidth - layout.screenPadding * 2);
  const fieldStyle = {
    right: mode.interpolate({ inputRange: [0, 1], outputRange: [restRight, layout.screenPadding] }),
    width: mode.interpolate({ inputRange: [0, 1], outputRange: [ACTION, fullWidth] }),
  };
  const fade = { opacity: mode.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] }) };
  const titleShift = { transform: [{ translateX: mode.interpolate({ inputRange: [0, 1], outputRange: [0, -24] }) }] };
  const inner = { opacity: mode.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] }) };

  return (
    <View style={styles.header} onLayout={onLayout}>
      {/* Gece teması: başlığın arkasında kayan mor ışık. */}
      <Aurora fadeTo={wa.bg} style={styles.aurora} />
      <Animated.View style={[styles.titleRow, fade]} pointerEvents={searching ? "none" : "box-none"} accessibilityElementsHidden={searching} importantForAccessibility={searching ? "no-hide-descendants" : "auto"}>
        {onBack ? (
          <Touchable feedback="icon" haptic="light" onPress={onBack} hitSlop={6} accessibilityRole="button" accessibilityLabel="Geri" style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Touchable>
        ) : null}
        <Animated.View style={[styles.titleBlock, titleShift]}>
          <Text style={styles.kicker} numberOfLines={1} {...textScale.badge}>ELİTLİG · SOHBET</Text>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header" {...textScale.dense}>{title}</Text>
        </Animated.View>
        <View style={styles.actions}>
          {searchable ? <View style={styles.actionSlot} /> : null}
          {actions.map((action) => (
            <GlassAction key={action.icon} {...action} />
          ))}
        </View>
      </Animated.View>

      {searchable ? (
        <Animated.View style={[styles.field, searching ? styles.fieldOpen : null, fieldStyle]}>
          {searching ? (
            <Animated.View style={inner}>
              <Touchable feedback="icon" haptic="light" onPress={onCloseSearch} hitSlop={6} accessibilityRole="button" accessibilityLabel="Aramayı kapat" style={styles.fieldBack}>
                <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              </Touchable>
            </Animated.View>
          ) : null}
          <Touchable
            feedback="icon"
            haptic="light"
            onPress={searching ? () => input.current?.focus() : openSearch}
            disabled={searching}
            accessibilityRole="button"
            accessibilityLabel={searchLabel ?? placeholder}
            style={styles.fieldIcon}
          >
            <Ionicons name="search" size={searching ? 17 : 20} color={searching ? colors.brandAccent : colors.textPrimary} />
          </Touchable>
          <Animated.View style={[styles.inputWrap, inner]} pointerEvents={searching ? "auto" : "none"}>
            <TextInput
              ref={input}
              value={value}
              onChangeText={onChangeText}
              onFocus={searching ? undefined : onOpenSearch}
              placeholder={placeholder}
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.brand}
              cursorColor={colors.brand}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={searchLabel ?? placeholder}
              style={styles.input}
              {...textScale.dense}
            />
            {value ? (
              <Touchable feedback="icon" haptic="light" onPress={() => onChangeText("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Aramayı temizle" style={styles.clear}>
                <Ionicons name="close" size={14} color={colors.textPrimary} />
              </Touchable>
            ) : null}
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
});

/* ------------------------------ süzgeç hapları ------------------------------ */

export const FILTER_BAR_HEIGHT = 52;

export interface FilterPillItem<K extends string> {
  key: K;
  label: string;
  count?: number;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface FilterPillsProps<K extends string> {
  items: FilterPillItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** İkinci sıra (alt süzgeç): daha alçak, çerçeveli haplar. */
  secondary?: boolean;
  accessibilityLabel: string;
}

function FilterPillsInner<K extends string>({ items, value, onChange, secondary = false, accessibilityLabel }: FilterPillsProps<K>) {
  const reduceMotion = useReduceMotion();
  const frames = useRef<Record<string, { x: number; width: number }>>({});
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const [placed, setPlaced] = useState(false);

  const slideTo = useCallback(
    (key: string, animate: boolean) => {
      const frame = frames.current[key];
      if (!frame) return;
      if (!animate || reduceMotion) {
        x.setValue(frame.x);
        width.setValue(frame.width);
        setPlaced(true);
        return;
      }
      Animated.parallel([
        Animated.spring(x, { toValue: frame.x, ...spring.slide, useNativeDriver: false }),
        Animated.spring(width, { toValue: frame.width, ...spring.slide, useNativeDriver: false }),
      ]).start();
    },
    [reduceMotion, width, x],
  );

  const first = useRef(true);
  useEffect(() => {
    slideTo(value, !first.current);
    first.current = false;
  }, [slideTo, value]);

  return (
    <View style={[styles.pillBar, secondary ? styles.pillBarSecondary : null]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pillTrack} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
        {/* Kayan kapsül: seçili hapın arkasında. */}
        <Animated.View pointerEvents="none" style={[styles.slider, secondary ? styles.sliderSecondary : null, { left: x, width, opacity: placed ? 1 : 0 }]}>
          {secondary ? null : <LinearGradient colors={colors.gradientBrand} start={G_START} end={G_END} style={[StyleSheet.absoluteFill, styles.sliderFill]} />}
        </Animated.View>
        {items.map((item) => {
          const selected = item.key === value;
          const tint = selected ? (secondary ? colors.brandAccent : palette.textOnBrand) : colors.textSecondary;
          return (
            <Touchable
              key={item.key}
              feedback="chip"
              haptic="selection"
              onPress={() => onChange(item.key)}
              onLayout={(event: LayoutChangeEvent) => {
                const { x: left, width: w } = event.nativeEvent.layout;
                frames.current[item.key] = { x: left, width: w };
                if (item.key === value) slideTo(item.key, false);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.count ? `${item.label}, ${item.count}` : item.label}
              style={[styles.pill, secondary ? styles.pillSecondary : null, selected ? styles.pillSelected : null]}
            >
              {item.icon ? <Ionicons name={item.icon} size={14} color={tint} /> : null}
              <Text style={[styles.pillLabel, { color: tint }]} numberOfLines={1} {...textScale.badge}>{item.label}</Text>
              {item.count ? (
                <View style={[styles.pillCount, selected && !secondary ? styles.pillCountSelected : null]}>
                  <Text style={[styles.pillCountText, selected && !secondary ? styles.pillCountTextSelected : null]} {...textScale.badge}>{item.count > 99 ? "99+" : item.count}</Text>
                </View>
              ) : null}
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export const FilterPills = memo(FilterPillsInner) as typeof FilterPillsInner;

/* ----------------------------------- FAB ----------------------------------- */

export const InboxFab = memo(function InboxFab({ visible, bottom, onPress }: { visible: boolean; bottom: number; onPress: () => void }) {
  const reduceMotion = useReduceMotion();
  // 0'dan başlar: düğme ilk çizimde de aynı hareketle belirir.
  const shown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      shown.setValue(visible ? 1 : 0);
      return;
    }
    if (visible) Animated.spring(shown, { toValue: 1, ...spring.pop }).start();
    else Animated.timing(shown, { toValue: 0, duration: duration.fast, easing: easing.accelerate, useNativeDriver: true }).start();
  }, [reduceMotion, shown, visible]);

  return (
    <Animated.View
      pointerEvents={visible ? "box-none" : "none"}
      style={[
        styles.fabWrap,
        { bottom, opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] },
      ]}
    >
      <Touchable feedback="fab" haptic="medium" onPress={onPress} accessibilityRole="button" accessibilityLabel="Yeni sohbet" style={[styles.fab, glowStyle(colors.glow, 2)]}>
        <LinearGradient colors={colors.gradientBrand} start={G_START} end={G_END} style={[StyleSheet.absoluteFill, styles.fabFill]} />
        <View style={styles.fabShine} />
        <Ionicons name="chatbubble-ellipses" size={24} color={palette.textOnBrand} />
        <View style={styles.fabPlus}>
          <Ionicons name="add" size={12} color={colors.brand} />
        </View>
      </Touchable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  header: { height: HEADER_HEIGHT + space.sm, backgroundColor: colors.bg, justifyContent: "center" },
  aurora: { top: -70 },
  titleRow: { height: HEADER_HEIGHT, flexDirection: "row", alignItems: "center", paddingLeft: layout.screenPadding, paddingRight: layout.screenPadding },
  back: { width: 36, height: 44, marginLeft: -space.sm, alignItems: "center", justifyContent: "center" },
  titleBlock: { flex: 1, minWidth: 0 },
  kicker: { ...type.overline, color: colors.brandAccent },
  title: { ...type.largeTitle, color: wa.title },
  actions: { flexDirection: "row", alignItems: "center", gap: ACTION_GAP },
  actionSlot: { width: ACTION, height: ACTION },
  action: {
    width: ACTION,
    height: ACTION,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  actionDot: { position: "absolute", top: 7, right: 7, width: 9, height: 9, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.bg, backgroundColor: colors.live },
  actionBadge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, paddingHorizontal: space.xs, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.bg, alignItems: "center", justifyContent: "center", backgroundColor: colors.live },
  actionBadgeText: { ...type.nano, color: colors.textOnStatus },

  /* Arama: kapalıyken eylem satırındaki ilk cam daire, açıkken tam genişlik alan. */
  field: {
    position: "absolute",
    top: (HEADER_HEIGHT - ACTION) / 2 + space.xs,
    height: ACTION,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  fieldOpen: { borderColor: colors.brandBorder, backgroundColor: wa.searchField },
  fieldBack: { width: 36, height: ACTION, alignItems: "center", justifyContent: "center" },
  fieldIcon: { width: ACTION - 2, height: ACTION, alignItems: "center", justifyContent: "center" },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", paddingRight: space.sm },
  input: { ...type.body, lineHeight: undefined, color: colors.textPrimary, flex: 1, paddingVertical: 0 },
  clear: { width: 22, height: 22, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },

  pillBar: { height: FILTER_BAR_HEIGHT, justifyContent: "center" },
  pillBarSecondary: { height: FILTER_BAR_HEIGHT - space.sm, justifyContent: "flex-start" },
  pillTrack: { alignItems: "center", gap: space.sm, paddingHorizontal: layout.screenPadding },
  slider: { position: "absolute", top: (FILTER_BAR_HEIGHT - 34) / 2, height: 34, borderRadius: radius.pill, ...glowStyle(colors.glow, 1) },
  sliderSecondary: { top: 0, height: 30, backgroundColor: colors.brandDim, borderWidth: hairline, borderColor: colors.brandBorder, shadowOpacity: 0, elevation: 0 },
  sliderFill: { borderRadius: radius.pill },
  pill: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.md + space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  pillSecondary: { height: 30, backgroundColor: "transparent", borderColor: colors.border },
  pillSelected: { backgroundColor: "transparent", borderColor: "transparent" },
  pillLabel: { ...type.label, fontFamily: fonts.semibold },
  pillCount: { minWidth: 18, height: 18, paddingHorizontal: space.xs, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  pillCountSelected: { backgroundColor: palette.textOnBrand },
  pillCountText: { ...type.nano, color: colors.brandAccent },
  pillCountTextSelected: { color: palette.brandStrong },

  fabWrap: { position: "absolute", right: layout.screenPadding },
  fab: { width: 58, height: 58, borderRadius: radius.xl, alignItems: "center", justifyContent: "center" },
  fabFill: { borderRadius: radius.xl },
  fabShine: { position: "absolute", top: 1, left: 1, right: 1, height: 28, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.glassLine },
  fabPlus: { position: "absolute", top: 15, right: 13, width: 16, height: 16, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: palette.textOnBrand },
});
