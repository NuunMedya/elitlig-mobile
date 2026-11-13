/**
 * OptionSheet — alt sayfada seçim listesi (tekli / çoklu, yerel / uzak arama).
 *
 * NE: lig, sezon, takım, oyuncu, kişi gibi uzun listelerden seçim. `options`
 * sabit listedir; `loadOptions(q)` verilirse arama sunucuya gider (takım ve
 * oyuncu araması gibi). Çoklu seçimde altta "Seç (3)" düğmesi çıkar.
 *
 * SATIR ANATOMİSİ (yönetim tasarım dili): solda ikon pulu (ya da ad baş
 * harfi), başlık + ipucu, sağda seçim işareti. Seçili satır `brandDim`
 * zemin + solda 3 px imza degrade şerit taşır; çoklu seçimde üstte seçili
 * sayısı ve "Temizle" kısayolu durur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { BottomSheet, Button, EmptyState, Input, SkeletonListRow, Touchable } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

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
          <Button label={picked.length ? `Seç (${picked.length})` : "Seç"} onPress={confirm} fullWidth size="lg" />
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
        {multiple ? (
          <View style={styles.pickedBar}>
            <Text style={styles.pickedText} {...textScale.dense}>
              {picked.length ? `${picked.length} seçili` : "Birden fazla seçebilirsin"}
            </Text>
            {picked.length ? (
              <Touchable feedback="none" onPress={() => setPicked([])} accessibilityRole="button" accessibilityLabel="Seçimleri temizle">
                <Text style={styles.pickedClear} {...textScale.dense}>
                  Temizle
                </Text>
              </Touchable>
            ) : null}
          </View>
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
  const initial = upperTR(label.trim().charAt(0) || "·");
  return (
    <Touchable
      feedback="row"
      onPress={onPress}
      haptic="selection"
      style={[styles.row, selected ? styles.rowOn : null]}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={multiple ? { checked: Boolean(selected) } : { selected: Boolean(selected) }}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
    >
      {selected ? (
        <LinearGradient colors={colors.gradientSignature} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.rowStripe} />
      ) : null}
      <View style={[styles.lead, selected ? styles.leadOn : null]}>
        {icon ? (
          <Ionicons name={icon} size={17} color={selected ? colors.brandAccent : colors.textSecondary} />
        ) : (
          <Text style={[styles.leadText, selected ? styles.labelOn : null]} {...textScale.badge}>
            {initial}
          </Text>
        )}
      </View>
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
        size={22}
        color={selected ? colors.brandAccent : colors.textDisabled}
      />
    </Touchable>
  );
});

const styles = StyleSheet.create({
  body: { flex: 1 },
  search: { marginBottom: space.sm },
  pickedBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xs,
    paddingBottom: space.sm,
  },
  pickedText: { ...type.caption, color: colors.textTertiary },
  pickedClear: { ...type.labelSm, color: colors.brandAccent },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
    overflow: "hidden",
  },
  rowOn: { backgroundColor: colors.brandDim, borderRadius: radius.md, borderBottomColor: "transparent" },
  rowStripe: { position: "absolute", left: 0, top: space.sm, bottom: space.sm, width: 3, borderRadius: radius.pill },
  lead: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  leadOn: { backgroundColor: colors.surface1 },
  leadText: { ...type.labelSm, color: colors.textSecondary },
  rowText: { flex: 1, gap: 2 },
  label: { ...type.h4, color: colors.textPrimary },
  labelOn: { color: colors.brandAccent },
  hint: { ...type.caption, color: colors.textTertiary },
});
