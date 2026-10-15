/**
 * İL SEÇİCİ — profil formları için aramalı alt sayfa (GET /api/meta/cities).
 */

import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { BottomSheet, ErrorState, Input, SkeletonCard, Touchable } from "@/components/ui";
import { getCities } from "@/lib/api/meta";
import { queryKeys } from "@/lib/queryKeys";
import type { MetaOption } from "@/lib/types";
import { colors, hairline, space, textScale, type } from "@/theme";

const fold = (value: string) => value.toLocaleLowerCase("tr-TR").trim();

export function useCities() {
  return useQuery({ queryKey: queryKeys.cities(), queryFn: getCities, staleTime: 60 * 60_000 });
}

export function CityPickerSheet({
  visible,
  onClose,
  onPick,
  selectedId,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (city: MetaOption) => void;
  selectedId: number | null;
}) {
  const query = useCities();
  const [term, setTerm] = useState("");
  const list = useMemo(() => {
    const needle = fold(term);
    const all = query.data ?? [];
    return needle ? all.filter((city) => fold(city.label).includes(needle)) : all;
  }, [query.data, term]);

  const close = () => {
    setTerm("");
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={close} title="İl seç" snap="full" scrollable={false}>
      <View style={styles.body}>
        <Input variant="search" size="sm" value={term} onChangeText={setTerm} placeholder="İl ara" autoCorrect={false} />
        {query.isLoading ? (
          <SkeletonCard lines={6} />
        ) : query.isError ? (
          <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
        ) : (
          <FlatList
            data={list}
            keyExtractor={(city) => String(city.id)}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            ItemSeparatorComponent={Separator}
            renderItem={({ item }) => (
              <Touchable
                feedback="row"
                haptic="selection"
                onPress={() => {
                  setTerm("");
                  onPick(item);
                }}
                style={styles.row}
                accessibilityRole="button"
                accessibilityState={{ selected: item.id === selectedId }}
              >
                <Text style={[styles.name, item.id === selectedId && styles.selected]} {...textScale.dense}>
                  {item.label}
                </Text>
              </Touchable>
            )}
          />
        )}
      </View>
    </BottomSheet>
  );
}

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  body: { flex: 1, gap: space.sm },
  list: { flex: 1 },
  row: { minHeight: 48, justifyContent: "center", paddingVertical: space.s },
  name: { ...type.label, color: colors.textPrimary },
  selected: { color: colors.accent },
  separator: { height: hairline, backgroundColor: colors.separator },
});
