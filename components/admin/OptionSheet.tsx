/**
 * OptionSheet — alt sayfada seçim listesi (tekli / çoklu, yerel / uzak arama).
 *
 * NE: lig, sezon, takım, oyuncu, kişi gibi uzun listelerden seçim. `options`
 * sabit listedir; `loadOptions(q)` verilirse arama sunucuya gider (takım ve
 * oyuncu araması gibi). Çoklu seçimde altta "Seç (3)" düğmesi çıkar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, EmptyState, Input, SkeletonListRow, Touchable } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export interface Option<V extends string | number = string | number> {
  value: V;
  label: string;
  hint?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
}

export interface OptionSheetProps<V extends string | number> {
  visible: boolean;
  onClose: () => void;
  title: string;
  options?: Option<V>[];
  /** Uzak arama — sorgu metniyle çağrılır. */
  loadOptions?: (q: string) => Promise<Option<V>[]>;
  /** Uzak aramanın önbellek anahtarı öneki. */
  queryKey?: readonly unknown[];
  multiple?: boolean;
  value?: V | V[] | null;
  onSelect: (value: V | V[] | null, option?: Option<V> | Option<V>[]) => void;
  /** "Seçimi kaldır" satırı. */
  clearable?: boolean;
  searchable?: boolean;
}

const norm = (text: string) => text.toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function OptionSheet<V extends string | number>({
  visible,
  onClose,
  title,
  options,
  loadOptions,
  queryKey,
  multiple,
  value,
  onSelect,
  clearable,
  searchable,
}: OptionSheetProps<V>) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<V[]>([]);

  useEffect(() => {
    if (!visible) return;
    setQ("");
    setDebounced("");
    setPicked(Array.isArray(value) ? value : value != null ? [value] : []);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const remote = useQuery({
    queryKey: [...(queryKey ?? ["option-sheet", title]), debounced],
    queryFn: () => loadOptions!(debounced),
    enabled: visible && Boolean(loadOptions),
    staleTime: 60_000,
  });

  const list = useMemo(() => {
    const base = loadOptions ? remote.data ?? [] : options ?? [];
    if (loadOptions || !q.trim()) return base;
    const needle = norm(q.trim());
    return base.filter((o) => norm(`${o.label} ${o.hint ?? ""}`).includes(needle));
  }, [loadOptions, remote.data, options, q]);

  const showSearch = searchable ?? (Boolean(loadOptions) || (options?.length ?? 0) > 8);

  const toggle = (option: Option<V>) => {
    if (!multiple) {
      onSelect(option.value, option);
      onClose();
      return;
    }
    setPicked((current) =>
      current.includes(option.value) ? current.filter((v) => v !== option.value) : [...current, option.value]
    );
  };

  const confirm = () => {
    const all = loadOptions ? remote.data ?? [] : options ?? [];
    onSelect(picked, all.filter((o) => picked.includes(o.value)));
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      snap="full"
      scrollable={false}
      footer={
        multiple ? (
          <Button label={picked.length ? `Seç (${picked.length})` : "Seç"} onPress={confirm} fullWidth />
        ) : undefined
      }
    >
      <View style={styles.body}>
        {showSearch ? (
          <Input
            variant="search"
            leadingIcon="search"
            value={q}
            onChangeText={setQ}
            placeholder="Ara"
            autoCorrect={false}
            autoCapitalize="none"
            containerStyle={styles.search}
          />
        ) : null}
        <FlatList
          data={list}
          keyExtractor={(item) => String(item.value)}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            clearable && !multiple ? (
              <Row
                label="Seçimi kaldır"
                icon="close-circle-outline"
                selected={value == null}
                onPress={() => {
                  onSelect(null);
                  onClose();
                }}
              />
            ) : null
          }
          ListEmptyComponent={
            remote.isLoading ? (
              <SkeletonListRow count={5} />
            ) : (
              <EmptyState icon="search-outline" title="Sonuç yok" variant="inline" compact />
            )
          }
          renderItem={({ item }) => (
            <Row
              label={item.label}
              hint={item.hint}
              icon={item.icon}
              selected={multiple ? picked.includes(item.value) : value === item.value}
              multiple={multiple}
              onPress={() => toggle(item)}
            />
          )}
        />
      </View>
    </BottomSheet>
  );
}

const Row = React.memo(function Row({
  label,
  hint,
  icon,
  selected,
  multiple,
  onPress,
}: {
  label: string;
  hint?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  multiple?: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable onPress={onPress} haptic="selection" style={styles.row} accessibilityRole="button" accessibilityState={{ selected }}>
      {icon ? <Ionicons name={icon} size={18} color={colors.textSecondary} /> : null}
      <View style={styles.rowText}>
        <Text style={[styles.label, selected ? styles.labelOn : null]} numberOfLines={2} {...textScale.dense}>
          {label}
        </Text>
        {hint ? (
          <Text style={styles.hint} numberOfLines={1} {...textScale.dense}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={multiple ? (selected ? "checkbox" : "square-outline") : selected ? "checkmark-circle" : "ellipse-outline"}
        size={20}
        color={selected ? colors.brandAccent : colors.textTertiary}
      />
    </Touchable>
  );
});

const styles = StyleSheet.create({
  body: { flex: 1 },
  search: { marginBottom: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
    borderRadius: radius.none,
  },
  rowText: { flex: 1, gap: 2 },
  label: { ...type.body, color: colors.textPrimary },
  labelOn: { color: colors.brandAccent },
  hint: { ...type.caption, color: colors.textTertiary },
});
