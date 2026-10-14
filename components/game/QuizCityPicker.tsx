/**
 * İL SEÇİCİ — bilgi yarışmalarında "sorular nereden gelsin?".
 *
 * İlk satır "Tüm Türkiye"dir; ardından kullanıcının kendi ili, sonra bütün
 * iller alfabetik (Türkçe sıralama). Uzun liste için arama kutusu vardır.
 * Seçim cihazda oyun başına saklanır (bkz. QuizScreen).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Input, Touchable } from "@/components/ui";
import type { MetaOption } from "@/lib/types";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

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
    <BottomSheet visible={visible} onClose={onClose} title="Sorular nereden gelsin?" snap="full" scrollable={false}>
      <Input variant="search" placeholder="İl ara" value={query} onChangeText={setQuery} leadingIcon="search" containerStyle={styles.search} />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = (item.city?.id ?? null) === (value?.id ?? null);
          return (
            <Touchable
              feedback="row"
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
              <View style={[styles.icon, !item.city && styles.iconAll]}>
                <Ionicons name={item.city ? "location" : "earth"} size={16} color={item.city ? colors.textSecondary : colors.brandAccent} />
              </View>
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
              {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.brandAccent} /> : null}
            </Touchable>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.list}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: { marginBottom: space.sm },
  list: { paddingBottom: space.xxl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingVertical: space.m,
    paddingHorizontal: space.s,
    borderRadius: radius.md,
  },
  rowSelected: { backgroundColor: colors.brandDim },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  iconAll: { backgroundColor: colors.brandDim },
  label: { ...type.body, fontFamily: fonts.semibold, color: colors.textPrimary },
  sub: { ...type.caption, letterSpacing: 0, color: colors.textTertiary },
  separator: { height: hairline, backgroundColor: colors.separator, marginLeft: space.s + 32 + space.m },
});
