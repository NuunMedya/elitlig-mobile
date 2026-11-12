/**
 * İL SEÇİCİ — bilgi yarışmalarında "sorular nereden gelsin?".
 *
 * İlk satır "Tüm Türkiye"dir; ardından kullanıcının kendi ili, sonra bütün
 * iller alfabetik (Türkçe sıralama). Uzun liste için arama kutusu vardır.
 * Seçim cihazda oyun başına saklanır (bkz. QuizScreen).
 *
 * GÖRÜNÜM: oyunun çizgi film dili — gece zemininin üstünde aşağıdan yükselen
 * beyaz, lacivert konturlu kart; kurdele başlık, kalın satırlar, seçili il
 * yeşil onay kabarcığıyla işaretlenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconBubble, OUTLINE, PopIn, Ribbon, RoundButton } from "@/components/game/QuizKit";
import { Touchable, useReduceMotion } from "@/components/ui";
import { CARTOON } from "@/lib/game/cartoon";
import { QUIZ } from "@/lib/game/quizPalette";
import type { MetaOption } from "@/lib/types";
import { fonts, radius, space, textScale, type } from "@/theme";

/** null = Tüm Türkiye */
export type QuizCity = { id: number; label: string } | null;

const fold = (text: string) => text.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "");

export function QuizCityPicker({
  visible,
  onClose,
  cities,
  homeCityId,
  value,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  cities: MetaOption[];
  homeCityId: number | null;
  value: QuizCity;
  onChange: (city: QuizCity) => void;
}) {
  const [query, setQuery] = useState("");
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      rise.setValue(0);
      return;
    }
    if (reduceMotion) rise.setValue(1);
    else Animated.spring(rise, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }).start();
  }, [visible, rise, reduceMotion]);

  const rows = useMemo(() => {
    const sorted = cities.slice().sort((a, b) => a.label.localeCompare(b.label, "tr"));
    const home = sorted.find((c) => c.id === homeCityId);
    const rest = sorted.filter((c) => c.id !== homeCityId);
    const all: { key: string; city: QuizCity; home?: boolean }[] = [
      { key: "tr", city: null },
      ...(home ? [{ key: `c${home.id}`, city: { id: home.id, label: home.label }, home: true }] : []),
      ...rest.map((c) => ({ key: `c${c.id}`, city: { id: c.id, label: c.label } })),
    ];
    const q = fold(query.trim());
    if (!q) return all;
    return all.filter((row) => fold(row.city ? row.city.label : "Tüm Türkiye").includes(q));
  }, [cities, homeCityId, query]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <Animated.View
          style={[
            styles.sheetWrap,
            { paddingTop: insets.top + space.xxl },
            { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }] },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.ribbon} pointerEvents="none">
            <Ribbon label="İl seç" icon="location" />
          </View>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
            <View style={styles.head}>
              <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
                Sorular nereden gelsin?
              </Text>
              <RoundButton icon="close" tone="ghost" size={40} onPress={onClose} accessibilityLabel="Kapat" />
            </View>

            <View style={styles.search}>
              <Ionicons name="search" size={18} color={CARTOON.cardMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="İl ara"
                placeholderTextColor={CARTOON.cardMuted}
                style={styles.searchInput}
                autoCorrect={false}
                accessibilityLabel="İl ara"
                returnKeyType="search"
              />
              {query ? (
                <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Aramayı temizle">
                  <Ionicons name="close-circle" size={18} color={CARTOON.cardMuted} />
                </Pressable>
              ) : null}
            </View>

            <FlatList
              data={rows}
              keyExtractor={(row) => row.key}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={styles.listContent}
              renderItem={({ item, index }) => {
                const selected = (item.city?.id ?? null) === (value?.id ?? null);
                return (
                  /* İlk satırlar sırayla yaylanarak gelir; kaydırınca çizilenler doğrudan yerinde. */
                  <PopIn delay={180 + index * 45} bouncy skip={index >= 9}>
                  <Touchable
                    feedback="card"
                    haptic="selection"
                    onPress={() => {
                      onChange(item.city);
                      onClose();
                    }}
                    style={[styles.row, selected && styles.rowSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={item.city ? item.city.label : "Tüm Türkiye"}
                  >
                    <IconBubble icon={item.city ? (item.home ? "home" : "location") : "earth"} tone="indigo" size={36} />
                    <View style={styles.flex}>
                      <Text style={styles.label} {...textScale.dense}>
                        {item.city ? item.city.label : "Tüm Türkiye"}
                      </Text>
                      {!item.city ? (
                        <Text style={styles.sub} {...textScale.dense}>
                          Bütün illerden karışık sorular
                        </Text>
                      ) : item.home ? (
                        <Text style={styles.sub} {...textScale.dense}>
                          Senin ilin
                        </Text>
                      ) : null}
                    </View>
                    {selected ? (
                      <PopIn bouncy delay={420}>
                        <View style={styles.check}>
                          <Ionicons name="checkmark" size={16} color={CARTOON.white} />
                        </View>
                      </PopIn>
                    ) : null}
                  </Touchable>
                  </PopIn>
                );
              }}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: CARTOON.dim },
  flex: { flex: 1 },
  sheetWrap: { flex: 1, justifyContent: "flex-end", paddingHorizontal: space.sm },
  sheet: {
    flexShrink: 1,
    maxHeight: "100%",
    backgroundColor: CARTOON.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: OUTLINE,
    borderBottomWidth: 0,
    borderColor: QUIZ.edge,
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
    gap: space.md,
  },
  ribbon: { alignItems: "center", marginBottom: -22, zIndex: 2, elevation: 2 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  title: { ...type.h1, fontFamily: fonts.heading, color: CARTOON.cardInk, flex: 1 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: 46,
    borderRadius: radius.pill,
    borderWidth: OUTLINE,
    borderColor: QUIZ.edge,
    backgroundColor: CARTOON.cardSoft,
  },
  searchInput: { ...type.body, fontFamily: fonts.semibold, color: CARTOON.cardInk, flex: 1, paddingVertical: space.sm },
  list: { flexGrow: 0 },
  listContent: { gap: space.sm, paddingBottom: space.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingVertical: space.sm,
    paddingHorizontal: space.m,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: QUIZ.edge,
    backgroundColor: CARTOON.card,
  },
  rowSelected: { borderWidth: 1.5, borderColor: QUIZ.indigoInk, backgroundColor: CARTOON.cardSoft },
  label: { ...type.h3, fontFamily: fonts.heading, color: CARTOON.cardInk },
  sub: { ...type.caption, fontFamily: fonts.semibold, letterSpacing: 0, color: CARTOON.cardMuted },
  check: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARTOON.correct,
    borderWidth: 1,
    borderColor: QUIZ.edge,
  },
});
