/**
 * ScopeSheet — şehir → lig → sezon seçicisinin tek evi.
 *
 * NEDEN ALT SAYFA: kapsam değişimi nadir ama üç adımlıdır; tam ekran modal
 * ekranı terk ettirir, açılır menü üç adımı taşıyamaz. Alt sayfa başparmakla
 * erişilebilir ve "geçici katman" olduğunu net söyler.
 *
 * NEDEN SEÇİM ANINDA UYGULANIR: ScopeProvider şehir değişince ligi, lig
 * değişince sezonu zaten sıfırlıyor ve sunucudan varsayılanı istiyor. "İptal"
 * için ara durum tutmak, bu zinciri iki kez çalıştırmak demekti. Bunun yerine
 * seçim anında uygulanır, adım otomatik ilerler ve "Uygula" YALNIZCA kapatır.
 *
 * Tek örnek app/_layout.tsx'te mount edilir; açma/kapama ScopeProvider
 * üstünden yapılır (`openScopeSheet(step?)`).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View, type ListRenderItemInfo } from "react-native";
import {
  BottomSheet,
  Button,
  EmptyState,
  Input,
  SegmentedControl,
  SkeletonListRow,
  Touchable,
  type SegmentedItem,
} from "@/components/ui";
import { useScope, type ScopeStep } from "@/providers/ScopeProvider";
import {
  colors,
  fonts,
  hairline,
  layout,
  space,
  textScale,
  type,
} from "@/theme";

/** Arama kutusunun görüneceği eşik — altında kutu gereksiz yer kaplar. */
const SEARCH_THRESHOLD = 12;

const STEPS: SegmentedItem<ScopeStep>[] = [
  { key: "city", label: "Şehir" },
  { key: "league", label: "Lig" },
  { key: "season", label: "Sezon" },
];

interface ScopeOption {
  id: number;
  label: string;
}

/** Türkçe arama: "İzmir" araması "izmir" yazınca da bulunmalı. */
const fold = (value: string) => value.trim().toLocaleLowerCase("tr");

/** Liste satırı — FlatList içinde olduğu için memo'lu ve sabit yükseklikli. */
const OptionRow = React.memo(function OptionRow({
  option,
  selected,
  onSelect,
}: {
  option: ScopeOption;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  const handlePress = useCallback(() => onSelect(option.id), [onSelect, option.id]);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={option.label}
    >
      <Text
        style={[styles.rowLabel, selected && styles.rowLabelSelected]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {option.label}
      </Text>
      {selected ? <Ionicons name="checkmark" size={18} color={colors.brandAccent} /> : null}
    </Touchable>
  );
});

export function ScopeSheet() {
  const scope = useScope();
  const {
    sheetOpen,
    sheetStep,
    closeScopeSheet,
    selectCity,
    selectLeague,
    selectSeason,
    cityId,
    leagueId,
    seasonId,
  } = scope;

  const [step, setStep] = useState<ScopeStep>(sheetStep);
  const [search, setSearch] = useState("");

  // Sayfa her açılışta istenen adımdan başlar; arama kutusu temizlenir.
  useEffect(() => {
    if (sheetOpen) {
      setStep(sheetStep);
      setSearch("");
    }
  }, [sheetOpen, sheetStep]);

  const handleStepChange = useCallback((next: ScopeStep) => {
    setStep(next);
    setSearch("");
  }, []);

  const options: ScopeOption[] = useMemo(() => {
    const source =
      step === "city" ? scope.cities : step === "league" ? scope.leagues : scope.seasons;
    return source.map((item) => ({ id: item.id, label: item.label }));
  }, [step, scope.cities, scope.leagues, scope.seasons]);

  const filtered = useMemo(() => {
    const term = fold(search);
    if (!term) return options;
    return options.filter((option) => fold(option.label).includes(term));
  }, [options, search]);

  const selectedId = step === "city" ? cityId : step === "league" ? leagueId : seasonId;

  /** Seçim anında uygulanır; şehir → lig → sezon adımları kendiliğinden ilerler. */
  const handleSelect = useCallback(
    (id: number) => {
      if (step === "city") {
        selectCity(id);
        setSearch("");
        setStep("league");
        return;
      }
      if (step === "league") {
        selectLeague(id);
        setSearch("");
        setStep("season");
        return;
      }
      selectSeason(id);
    },
    [step, selectCity, selectLeague, selectSeason]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ScopeOption>) => (
      <OptionRow option={item} selected={item.id === selectedId} onSelect={handleSelect} />
    ),
    [selectedId, handleSelect]
  );

  const keyExtractor = useCallback((item: ScopeOption) => String(item.id), []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<ScopeOption> | null | undefined, index: number) => ({
      length: layout.listRowHeight,
      offset: layout.listRowHeight * index,
      index,
    }),
    []
  );

  const showSearch = options.length > SEARCH_THRESHOLD;
  const loading = options.length === 0 && scope.loading;

  const emptyTitle =
    step === "league" && !cityId
      ? "Önce şehir seçin"
      : step === "season" && !leagueId
        ? "Önce lig seçin"
        : search
          ? "Eşleşme yok"
          : "Seçenek bulunamadı";

  const emptyBody =
    search && options.length > 0 ? `"${search.trim()}" için sonuç çıkmadı.` : undefined;

  return (
    <BottomSheet
      visible={sheetOpen}
      onClose={closeScopeSheet}
      title="Kapsam"
      // NEDEN "full": 81 şehirlik liste + 3 adımlı segment + arama + "Uygula"
      // çubuğu, yarım ekranda (~%50) listeye 3 satır bırakıyordu. Şartnamedeki
      // %70'e en yakın kullanılabilir seçenek budur; üstte kalan boşluk sayfanın
      // hâlâ geçici bir katman olduğunu gösterir.
      snap="full"
      // İçeride FlatList var: sheet kendi ScrollView'ini açmamalı (iç içe kaydırma).
      scrollable={false}
      footer={<Button label="Uygula" onPress={closeScopeSheet} fullWidth haptic="light" />}
    >
      <View style={styles.body}>
        <SegmentedControl<ScopeStep>
          items={STEPS}
          value={step}
          onChange={handleStepChange}
          style={styles.segments}
        />

        {showSearch ? (
          <Input
            variant="search"
            size="sm"
            value={search}
            onChangeText={setSearch}
            placeholder="Ara…"
            autoCorrect={false}
            containerStyle={styles.search}
            accessibilityLabel="Listede ara"
          />
        ) : null}

        {loading ? (
          <View style={styles.loading}>
            <SkeletonListRow count={6} avatar={false} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemLayout={getItemLayout}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <EmptyState icon="search-outline" title={emptyTitle} body={emptyBody} compact />
            }
          />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  segments: {
    marginBottom: space.md,
  },
  search: {
    marginBottom: space.sm,
  },
  loading: {
    flex: 1,
  },
  listContent: {
    paddingBottom: space.md,
  },
  row: {
    height: layout.listRowHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  rowLabel: {
    ...type.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  rowLabelSelected: {
    color: colors.brandAccent,
    fontFamily: fonts.bold,
  },
});
