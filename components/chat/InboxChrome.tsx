/**
 * SOHBET LİSTESİ ÇERÇEVESİ — başlık, arama alanı, süzgeç hapları ve yüzen
 * "yeni sohbet" düğmesi (WhatsApp sohbet listesinin üst ve alt kabuğu).
 *
 *   · BAŞLIK: büyük "Mesajlar" + çıplak ikon eylemleri. Alt başlık yoktur;
 *     okunmamış özeti hap sayaçları ve satır rozetleri söyler.
 *   · ARAMA: başlığın altında hap biçimli alan. Odaklanınca başlık satırı
 *     kapanır, alan ekranın tepesine çıkar ve solunda "geri" belirir; liste
 *     arama sonuçlarına döner. Geçiş tek, kısa bir animasyondur ("hareketi
 *     azalt" açıkken anında).
 *   · HAPLAR: yatay kayan süzgeçler; seçili hap dolu, sayaç hapın içinde.
 *   · FAB: köşeleri yumuşak kare; ilk çizimde aşağıdan belirir, kaydırınca ve
 *     arama sırasında gizlenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useEffect, useRef } from "react";
import { Animated, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Touchable, useReduceMotion } from "@/components/ui";
import { colors, duration, easing, elevate, fonts, layout, radius, space, textScale, type } from "@/theme";

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
  onChangeText: (value: string) => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
}

const TITLE_HEIGHT = 52;
const SEARCH_HEIGHT = 40;
const BACK_WIDTH = 40;

export const InboxHeader = memo(function InboxHeader({ title, onBack, actions, searchable = true, searching, value, placeholder, onChangeText, onOpenSearch, onCloseSearch }: InboxHeaderProps) {
  const reduceMotion = useReduceMotion();
  const input = useRef<TextInput>(null);
  const mode = useRef(new Animated.Value(searching ? 1 : 0)).current;

  useEffect(() => {
    // Yükseklik canlandırıldığı için yerel sürücü kullanılamaz; tek seferlik 220 ms.
    Animated.timing(mode, { toValue: searching ? 1 : 0, duration: reduceMotion ? duration.instant : duration.base, easing: easing.standard, useNativeDriver: false }).start();
    if (!searching) input.current?.blur();
  }, [mode, reduceMotion, searching]);

  const titleStyle = {
    height: mode.interpolate({ inputRange: [0, 1], outputRange: [TITLE_HEIGHT, 0] }),
    opacity: mode.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0, 0] }),
  };
  const backStyle = {
    width: mode.interpolate({ inputRange: [0, 1], outputRange: [0, BACK_WIDTH] }),
    opacity: mode.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] }),
  };

  return (
    <View style={styles.header}>
      <Animated.View style={[styles.titleRow, titleStyle]} pointerEvents={searching ? "none" : "auto"} accessibilityElementsHidden={searching} importantForAccessibility={searching ? "no-hide-descendants" : "auto"}>
        {onBack ? (
          <Touchable feedback="icon" haptic="light" onPress={onBack} hitSlop={6} accessibilityRole="button" accessibilityLabel="Geri" style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </Touchable>
        ) : null}
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header" {...textScale.dense}>{title}</Text>
        <View style={styles.actions}>
          {actions.map((action) => (
            <Touchable key={action.icon} feedback="icon" haptic="light" onPress={action.onPress} hitSlop={2} accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} style={styles.action}>
              <Ionicons name={action.icon} size={23} color={colors.textPrimary} />
              {action.badge === "dot" ? (
                <View style={styles.actionDot} />
              ) : action.badge ? (
                <View style={styles.actionBadge}>
                  <Text style={styles.actionBadgeText} {...textScale.badge}>{action.badge > 99 ? "99+" : action.badge}</Text>
                </View>
              ) : null}
            </Touchable>
          ))}
        </View>
      </Animated.View>

      {searchable ? (
        <View style={styles.searchRow}>
          <Animated.View style={[styles.searchBack, backStyle]} pointerEvents={searching ? "auto" : "none"}>
            <Touchable feedback="icon" haptic="light" onPress={onCloseSearch} hitSlop={6} accessibilityRole="button" accessibilityLabel="Aramayı kapat" style={styles.searchBackButton}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </Touchable>
          </Animated.View>
          <View style={styles.field}>
            <Ionicons name="search" size={18} color={colors.textTertiary} />
            <TextInput
              ref={input}
              value={value}
              onChangeText={onChangeText}
              onFocus={onOpenSearch}
              placeholder={placeholder}
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.brand}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={placeholder}
              style={styles.input}
              {...textScale.dense}
            />
            {value ? (
              <Touchable feedback="icon" haptic="light" onPress={() => onChangeText("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Aramayı temizle">
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </Touchable>
            ) : null}
          </View>
        </View>
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
  return (
    <View style={[styles.pillBar, secondary ? styles.pillBarSecondary : null]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pillTrack} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
        {items.map((item) => {
          const selected = item.key === value;
          const tint = selected ? colors.textOnBrand : colors.textSecondary;
          return (
            <Touchable
              key={item.key}
              feedback="chip"
              haptic="selection"
              onPress={() => onChange(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.count ? `${item.label}, ${item.count}` : item.label}
              style={[styles.pill, selected ? styles.pillSelected : null]}
            >
              {item.icon ? <Ionicons name={item.icon} size={15} color={tint} /> : null}
              <Text style={[styles.pillLabel, { color: tint }]} numberOfLines={1} {...textScale.badge}>{item.label}</Text>
              {item.count ? (
                <Text style={[styles.pillCount, selected ? styles.pillCountSelected : null]} {...textScale.badge}>{item.count > 99 ? "99+" : item.count}</Text>
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
    Animated.timing(shown, { toValue: visible ? 1 : 0, duration: reduceMotion ? duration.instant : duration.base, easing: visible ? easing.decelerate : easing.accelerate, useNativeDriver: true }).start();
  }, [reduceMotion, shown, visible]);

  return (
    <Animated.View
      pointerEvents={visible ? "box-none" : "none"}
      style={[
        styles.fabWrap,
        { bottom, opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }, { scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] },
      ]}
    >
      <Touchable feedback="fab" haptic="medium" onPress={onPress} accessibilityRole="button" accessibilityLabel="Yeni sohbet" style={[elevate(3), styles.fab]}>
        <Ionicons name="chatbubble-ellipses" size={24} color={colors.textOnBrand} />
      </Touchable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  header: { backgroundColor: colors.bg, paddingBottom: space.xs },
  titleRow: { flexDirection: "row", alignItems: "center", paddingLeft: layout.screenPadding, paddingRight: space.xs, overflow: "hidden" },
  back: { width: 36, height: 44, marginLeft: -space.sm, alignItems: "center", justifyContent: "center" },
  title: { ...type.largeTitle, color: colors.textPrimary, flex: 1 },
  actions: { flexDirection: "row", alignItems: "center" },
  action: { width: 42, height: 44, alignItems: "center", justifyContent: "center" },
  actionDot: { position: "absolute", top: 10, right: 9, width: 9, height: 9, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.bg, backgroundColor: colors.live },
  actionBadge: { position: "absolute", top: 5, right: 2, minWidth: 17, height: 17, paddingHorizontal: space.xs, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.bg, alignItems: "center", justifyContent: "center", backgroundColor: colors.live },
  actionBadgeText: { ...type.nano, color: colors.textOnStatus },

  searchRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: layout.screenPadding, paddingVertical: space.xs },
  searchBack: { height: SEARCH_HEIGHT, overflow: "hidden", justifyContent: "center" },
  searchBackButton: { width: BACK_WIDTH, height: SEARCH_HEIGHT, marginLeft: -space.sm, alignItems: "center", justifyContent: "center" },
  field: { flex: 1, height: SEARCH_HEIGHT, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md + space.xxs, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  input: { ...type.bodyLg, lineHeight: undefined, color: colors.textPrimary, flex: 1, paddingVertical: 0 },

  pillBar: { height: FILTER_BAR_HEIGHT, justifyContent: "center" },
  pillBarSecondary: { height: FILTER_BAR_HEIGHT - space.sm, justifyContent: "flex-start" },
  pillTrack: { alignItems: "center", gap: space.sm, paddingHorizontal: layout.screenPadding },
  pill: { height: 34, flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: space.md + space.xxs, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  pillSelected: { backgroundColor: colors.brand },
  pillLabel: { ...type.label, fontFamily: fonts.semibold },
  pillCount: { ...type.numSmStrong, color: colors.brandAccent },
  pillCountSelected: { color: colors.textOnBrand, opacity: 0.85 },

  fabWrap: { position: "absolute", right: layout.screenPadding },
  fab: { width: 56, height: 56, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
});
