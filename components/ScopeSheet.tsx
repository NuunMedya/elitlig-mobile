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
 * seçim anında uygulanır, adım otomatik ilerler ve "Tamam" YALNIZCA kapatır.
 *
 * ARENA — ADIM KARTLARI: eski düz segment ("Şehir · Lig · Sezon") yalnız
 * adımın ADINI söylüyordu; kullanıcı neyin seçili olduğunu görmek için her
 * adıma tek tek girmek zorundaydı. Şimdi üstte üç adım kartı durur, her biri
 * adımın adını (overline) ve SEÇİLİ DEĞERİ taşır: "ŞEHİR · Ankara",
 * "LİG · FREELİG", "SEZON · 15. Sezon". Kapsamın tamamı tek bakışta okunur,
 * istenen adıma tek dokunuşla atlanır. Etkin adımın altında marka çizgisi.
 *
 * AYNI ŞEHRİ YENİDEN SEÇMEK KAPSAMI SİLMEZ: `selectCity` lig ve sezonu
 * sıfırlar; kullanıcı yalnız sonraki adıma geçmek için seçili şehre
 * dokunduğunda ligini kaybediyordu. Seçili değere dokunmak artık yalnız
 * adımı ilerletir.
 *
 * Tek örnek app/_layout.tsx'te mount edilir; açma/kapama ScopeProvider
 * üstünden yapılır (`openScopeSheet(step?)`).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View, type ListRenderItemInfo } from "react-native";
import {
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  Input,
  SkeletonListRow,
  Touchable,
} from "@/components/ui";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope, type ScopeStep } from "@/providers/ScopeProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/** Arama kutusunun görüneceği eşik — altında kutu gereksiz yer kaplar. */
const SEARCH_THRESHOLD = 12;

const STEPS: { key: ScopeStep; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "city", label: "Şehir", icon: "location-outline" },
  { key: "league", label: "Lig", icon: "trophy-outline" },
  { key: "season", label: "Sezon", icon: "calendar-outline" },
];

interface ScopeOption {
  id: number;
  label: string;
  archived: boolean;
}

/** Türkçe arama: "İzmir" araması "izmir" yazınca da bulunmalı. */
const fold = (value: string) => value.trim().toLocaleLowerCase("tr");

/** Liste satırı — FlatList içinde olduğu için memo'lu ve sabit yükseklikli. */
const OptionRow = React.memo(function OptionRow({
  option,
  selected,
  favorite,
  onSelect,
}: {
  option: ScopeOption;
  selected: boolean;
  favorite: boolean;
  onSelect: (id: number) => void;
}) {
  const handlePress = useCallback(() => onSelect(option.id), [onSelect, option.id]);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={option.label}
    >
      {favorite ? <Ionicons name="star" size={13} color={colors.star} /> : null}
      <Text
        style={[styles.rowLabel, selected && styles.rowLabelSelected]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {option.label}
      </Text>
      {option.archived ? <Badge label="Arşiv" tone="neutral" size="xs" /> : null}
      <View style={styles.rowSpacer} />
      {selected ? (
        <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
      )}
    </Touchable>
  );
});

/** Üstteki adım kartı: adımın adı + seçili değer. */
const StepCard = React.memo(function StepCard({
  step,
  label,
  icon,
  value,
  active,
  disabled,
  onPress,
}: {
  step: ScopeStep;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  active: boolean;
  disabled: boolean;
  onPress: (step: ScopeStep) => void;
}) {
  const handlePress = useCallback(() => onPress(step), [onPress, step]);
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      disabled={disabled}
      style={[styles.step, active && styles.stepActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={`${label}: ${value || "seçilmedi"}`}
    >
      <View style={styles.stepHead}>
        <Ionicons name={icon} size={11} color={active ? colors.brandAccent : colors.textTertiary} />
        <Text style={[styles.stepLabel, active && styles.stepLabelActive]} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
      <Text
        style={[styles.stepValue, !value && styles.stepValueEmpty]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {value || "Seç"}
      </Text>
      {active ? <View style={styles.stepBeam} /> : null}
    </Touchable>
  );
});

export function ScopeSheet() {
  const scope = useScope();
  const { isFavoriteLeague } = useFavorite();
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
    const list = source.map((item) => ({
      id: item.id,
      label: item.label,
      archived: Boolean(item.is_archived),
    }));
    // Ligler: favoriler başa (ScopeBar'daki çiplerle aynı sıra).
    if (step === "league") {
      return [...list].sort((a, b) => Number(isFavoriteLeague(b.id)) - Number(isFavoriteLeague(a.id)));
    }
    return list;
  }, [step, scope.cities, scope.leagues, scope.seasons, isFavoriteLeague]);

  const filtered = useMemo(() => {
    const term = fold(search);
    if (!term) return options;
    return options.filter((option) => fold(option.label).includes(term));
  }, [options, search]);

  const selectedId = step === "city" ? cityId : step === "league" ? leagueId : seasonId;

  /**
   * Seçim anında uygulanır; şehir → lig → sezon adımları kendiliğinden
   * ilerler. Seçili değere yeniden dokunmak yalnız ilerletir (bkz. başlık).
   */
  const handleSelect = useCallback(
    (id: number) => {
      setSearch("");
      if (step === "city") {
        if (id !== cityId) selectCity(id);
        setStep("league");
        return;
      }
      if (step === "league") {
        if (id !== leagueId) selectLeague(id);
        setStep("season");
        return;
      }
      if (id !== seasonId) selectSeason(id);
      // Son adım: seçim tamam, sayfa kendiliğinden kapanır.
      closeScopeSheet();
    },
    [step, cityId, leagueId, seasonId, selectCity, selectLeague, selectSeason, closeScopeSheet],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ScopeOption>) => (
      <OptionRow
        option={item}
        selected={item.id === selectedId}
        favorite={step === "league" && isFavoriteLeague(item.id)}
        onSelect={handleSelect}
      />
    ),
    [selectedId, handleSelect, step, isFavoriteLeague],
  );

  const keyExtractor = useCallback((item: ScopeOption) => String(item.id), []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<ScopeOption> | null | undefined, index: number) => ({
      length: ROW_CELL,
      offset: ROW_CELL * index,
      index,
    }),
    [],
  );

  const showSearch = options.length > SEARCH_THRESHOLD;
  const loading = options.length === 0 && scope.loading;

  const emptyTitle =
    step === "league" && !cityId
      ? "Önce şehir seç"
      : step === "season" && !leagueId
        ? "Önce lig seç"
        : search
          ? "Eşleşme yok"
          : "Seçenek bulunamadı";

  const emptyBody =
    search && options.length > 0 ? `"${search.trim()}" için sonuç çıkmadı.` : undefined;

  const values: Record<ScopeStep, string> = {
    city: scope.cityLabel,
    league: scope.leagueLabel,
    season: scope.seasonLabel,
  };

  return (
    <BottomSheet
      visible={sheetOpen}
      onClose={closeScopeSheet}
      title="Kapsamı değiştir"
      // NEDEN "full": 81 şehirlik liste + adım kartları + arama + alt çubuk
      // yarım ekranda listeye üç satır bırakıyordu.
      snap="full"
      // İçeride FlatList var: sheet kendi ScrollView'ini açmamalı (iç içe kaydırma).
      scrollable={false}
      footer={<Button label="Tamam" onPress={closeScopeSheet} fullWidth haptic="light" />}
    >
      <View style={styles.body}>
        <View style={styles.steps} accessibilityRole="tablist">
          {STEPS.map((item) => (
            <StepCard
              key={item.key}
              step={item.key}
              label={item.label}
              icon={item.icon}
              value={values[item.key]}
              active={item.key === step}
              disabled={(item.key === "league" && !cityId) || (item.key === "season" && !leagueId)}
              onPress={handleStepChange}
            />
          ))}
        </View>

        {showSearch ? (
          <Input
            variant="search"
            size="sm"
            value={search}
            onChangeText={setSearch}
            placeholder={step === "city" ? "Şehir ara" : step === "league" ? "Lig ara" : "Sezon ara"}
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

/** Satır + aradaki boşluk — `getItemLayout` için. */
const ROW_GAP = space.xxs;
const ROW_CELL = layout.listRowHeight + ROW_GAP;

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  /* — Adım kartları — */
  steps: {
    flexDirection: "row",
    gap: space.s,
    marginBottom: space.md,
  },
  step: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: space.m,
    paddingTop: space.sm,
    paddingBottom: space.m,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
    gap: space.xxs,
    overflow: "hidden",
  },
  stepActive: {
    backgroundColor: colors.brandDim,
    borderColor: colors.brandBorder,
  },
  stepHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  stepLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  stepLabelActive: {
    color: colors.brandAccent,
  },
  stepValue: {
    ...type.label,
    color: colors.textPrimary,
  },
  stepValueEmpty: {
    color: colors.textTertiary,
  },
  /** Etkin adımın alt kenarındaki marka çizgisi. */
  stepBeam: {
    position: "absolute",
    left: space.m,
    right: space.m,
    bottom: 0,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: colors.brand,
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
  /* — Seçenek satırı — */
  row: {
    height: layout.listRowHeight,
    marginBottom: ROW_GAP,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  rowSelected: {
    backgroundColor: colors.brandDim,
  },
  rowSpacer: {
    flex: 1,
  },
  rowLabel: {
    ...type.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  rowLabelSelected: {
    color: colors.brandAccent,
    fontFamily: fonts.semibold,
  },
});
