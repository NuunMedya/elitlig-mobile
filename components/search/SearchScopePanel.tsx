/**
 * SearchScopePanel — Ara ekranının il → lig → sezon seçicisi (ekran İÇİ katman).
 *
 * NEDEN ScopeSheet DEĞİL: `ara` yığında `presentation: "modal"` ile açılır.
 * Kök düzende (app/_layout.tsx) duran ScopeSheet bir RN `<Modal>`'dır; iOS'ta
 * yerel modal ekran sunulmuşken kökten ikinci bir modal sunulamaz (UIKit
 * "zaten bir ekran sunuluyor" der). Sayfa görünmez ama `visible` kalır ve
 * dokunuşları yutar: kullanıcı için uygulama DONAR. Bu katman ise Modal
 * kullanmaz; ekranın kendi ağacında mutlak konumlu bir görünümdür, yani
 * hangi sunum biçiminde açılırsa açılsın üstte çizilir.
 *
 * İKİ KİP:
 *   · "players": küresel kapsamı değiştirir (ScopeProvider) — oyuncu araması
 *     seçili il · lig · sezon kadrolarında yapılır. Seçim anında uygulanır,
 *     adım kendiliğinden ilerler (ScopeSheet ile aynı davranış).
 *   · "teams": yalnız il süzgecidir ve YERELDİR — takım araması uygulama
 *     genelindedir; il seçmek sonuçları o ile daraltır, "Tüm iller" kaldırır.
 *     Küresel kapsam değişmez (Maçlar / Lig sekmesi etkilenmez).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, FlatList, Pressable, StyleSheet, Text, View, type ListRenderItemInfo } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconTile, Input, SkeletonListRow, Touchable, type IconTileTone } from "@/components/ui";
import { useScope, type ScopeStep } from "@/providers/ScopeProvider";
import { colors, elevate, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

export type SearchScopeMode = "players" | "teams";

/** "Tüm iller" satırının kimliği — gerçek il kimlikleriyle çakışmaz. */
const ALL_ID = 0;
const ROW_H = 52;
/** Arama kutusu bu sayının üstünde görünür (81 il listesi). */
const SEARCH_THRESHOLD = 10;

const STEPS: { key: ScopeStep; label: string; icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }[] = [
  { key: "city", label: "İl", icon: "location", tone: "cyan" },
  { key: "league", label: "Lig", icon: "trophy", tone: "violet" },
  { key: "season", label: "Sezon", icon: "calendar", tone: "pink" },
];

interface Option {
  id: number;
  label: string;
  caption?: string;
  all?: boolean;
}

/** Türkçe katlama: "izmir" yazan "İzmir"i bulur. */
const fold = (value: string) =>
  value
    .trim()
    .replace(/[İIı]/g, "i")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const OptionRow = React.memo(function OptionRow({
  option,
  selected,
  onSelect,
}: {
  option: Option;
  selected: boolean;
  onSelect: (option: Option) => void;
}) {
  const press = useCallback(() => onSelect(option), [onSelect, option]);
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={press}
      style={[styles.row, selected && styles.rowOn]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={option.caption ? `${option.label}, ${option.caption}` : option.label}
    >
      {option.all ? (
        <IconTile icon="earth" tone={selected ? "signature" : "cyan"} size={30} glow={false} />
      ) : (
        <View style={[styles.mono, selected && styles.monoOn]}>
          <Text style={[styles.monoText, selected && styles.monoTextOn]} {...textScale.badge}>
            {option.label.trim().charAt(0).toLocaleUpperCase("tr-TR")}
          </Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, selected && styles.rowLabelOn]} numberOfLines={1} {...textScale.dense}>
          {option.label}
        </Text>
        {option.caption ? (
          <Text style={styles.rowCaption} numberOfLines={1} {...textScale.dense}>
            {option.caption}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <View style={styles.check}>
          <Ionicons name="checkmark" size={14} color={colors.textOnBrand} />
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
      )}
    </Touchable>
  );
});

export function SearchScopePanel({
  visible,
  mode,
  initialStep,
  teamCityId,
  onTeamCity,
  onClose,
}: {
  visible: boolean;
  mode: SearchScopeMode;
  initialStep: ScopeStep;
  /** Takım kipinde seçili il (null = tüm iller). */
  teamCityId: number | null;
  onTeamCity: (cityId: number | null) => void;
  onClose: () => void;
}) {
  const scope = useScope();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<ScopeStep>(initialStep);
  const [search, setSearch] = useState("");
  /** Kapanış animasyonu bitene dek ağaçta kalır. */
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setStep(mode === "teams" ? "city" : initialStep);
      setSearch("");
      Animated.spring(anim, { toValue: 1, damping: 18, stiffness: 190, mass: 0.8, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // `mounted` bilerek bağımlılıkta değil: yalnız görünürlük değişimi tetikler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialStep, mode, anim]);

  // Android geri tuşu katmanı kapatır (ekranı değil).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const options = useMemo<Option[]>(() => {
    if (step === "city") {
      const cities = scope.cities.map((c) => ({ id: c.id, label: c.label }));
      return mode === "teams" ? [{ id: ALL_ID, label: "Tüm iller", caption: "Bütün Türkiye'deki takımlar", all: true }, ...cities] : cities;
    }
    if (step === "league") return scope.leagues.map((l) => ({ id: l.id, label: l.label }));
    return scope.seasons.map((s) => ({
      id: s.id,
      label: s.label,
      caption: [s.season_year ? String(s.season_year) : null, s.is_archived ? "Arşiv" : null].filter(Boolean).join(" · ") || undefined,
    }));
  }, [step, mode, scope.cities, scope.leagues, scope.seasons]);

  const filtered = useMemo(() => {
    const term = fold(search);
    if (!term) return options;
    return options.filter((o) => !o.all && fold(o.label).includes(term));
  }, [options, search]);

  const selectedId =
    mode === "teams"
      ? teamCityId ?? ALL_ID
      : step === "city"
        ? scope.cityId
        : step === "league"
          ? scope.leagueId
          : scope.seasonId;

  const { selectCity, selectLeague, selectSeason, cityId, leagueId, seasonId } = scope;
  const handleSelect = useCallback(
    (option: Option) => {
      setSearch("");
      if (mode === "teams") {
        onTeamCity(option.all ? null : option.id);
        onClose();
        return;
      }
      if (step === "city") {
        // Aynı ili yeniden seçmek ligi silmez; yalnız adımı ilerletir.
        if (option.id !== cityId) selectCity(option.id);
        setStep("league");
        return;
      }
      if (step === "league") {
        if (option.id !== leagueId) selectLeague(option.id);
        setStep("season");
        return;
      }
      if (option.id !== seasonId) selectSeason(option.id);
      onClose();
    },
    [mode, step, cityId, leagueId, seasonId, selectCity, selectLeague, selectSeason, onTeamCity, onClose],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Option>) => <OptionRow option={item} selected={item.id === selectedId} onSelect={handleSelect} />,
    [selectedId, handleSelect],
  );

  if (!mounted) return null;

  const values: Record<ScopeStep, string> = {
    city: mode === "teams" ? (teamCityId ? scope.cities.find((c) => c.id === teamCityId)?.label ?? "" : "Tüm iller") : scope.cityLabel,
    league: scope.leagueLabel,
    season: scope.seasonLabel,
  };
  const steps = mode === "teams" ? STEPS.slice(0, 1) : STEPS;
  const loading = options.length === 0 && scope.loading;
  const emptyText =
    step === "league" && !scope.cityId ? "Önce il seç." : step === "season" && !scope.leagueId ? "Önce lig seç." : search ? `"${search.trim()}" için sonuç yok.` : "Seçenek bulunamadı.";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Seçiciyi kapat" />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          { paddingBottom: Math.max(insets.bottom, space.md) },
          { transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) }] },
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.head}>
          <Text style={styles.title} {...textScale.dense}>
            {mode === "teams" ? "Takımları ile göre süz" : "Arama kapsamı"}
          </Text>
          <Touchable feedback="icon" onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Touchable>
        </View>

        <View style={styles.steps} accessibilityRole="tablist">
          {steps.map((item, i) => {
            const active = item.key === step;
            const disabled = (item.key === "league" && !scope.cityId) || (item.key === "season" && !scope.leagueId);
            return (
              <Touchable
                key={item.key}
                feedback="row"
                haptic="selection"
                disabled={disabled}
                onPress={() => {
                  setStep(item.key);
                  setSearch("");
                }}
                style={[styles.step, active && styles.stepOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active, disabled }}
                accessibilityLabel={`${item.label}: ${values[item.key] || "seçilmedi"}`}
              >
                <View style={styles.stepHead}>
                  <IconTile icon={item.icon} tone={disabled ? "neutral" : item.tone} size={20} glow={false} />
                  <Text style={[styles.stepLabel, active && styles.stepLabelOn]} {...textScale.badge}>
                    {steps.length > 1 ? `${i + 1}. ` : ""}
                    {upperTR(item.label)}
                  </Text>
                </View>
                <Text style={[styles.stepValue, !values[item.key] && styles.stepEmpty]} numberOfLines={1} {...textScale.dense}>
                  {values[item.key] || "Seç"}
                </Text>
              </Touchable>
            );
          })}
        </View>

        {options.length > SEARCH_THRESHOLD ? (
          <Input
            variant="search"
            value={search}
            onChangeText={setSearch}
            placeholder={step === "city" ? "İl ara" : step === "league" ? "Lig ara" : "Sezon ara"}
            autoCorrect={false}
          />
        ) : null}

        <FlatList
          key={step}
          data={filtered}
          keyExtractor={optionKey}
          renderItem={renderItem}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={14}
          windowSize={7}
          getItemLayout={itemLayout}
          ListEmptyComponent={
            loading ? (
              <SkeletonListRow count={5} />
            ) : (
              <Text style={styles.empty} {...textScale.long}>
                {emptyText}
              </Text>
            )
          }
        />
      </Animated.View>
    </View>
  );
}

const optionKey = (item: Option) => String(item.id);
const itemLayout = (_: ArrayLike<Option> | null | undefined, index: number) => ({ length: ROW_H, offset: ROW_H * index, index });

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.overlay },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82%",
    gap: space.md,
    paddingTop: space.md,
    paddingHorizontal: layout.screenPadding,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    backgroundColor: colors.surface1,
    borderTopWidth: hairline,
    borderColor: colors.border,
    ...elevate(4),
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...type.h2, color: colors.textPrimary },
  close: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  steps: { flexDirection: "row", gap: space.sm },
  step: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  stepOn: { borderColor: colors.brandAccent, backgroundColor: colors.surface1 },
  stepHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  stepLabel: { ...type.overline, color: colors.textTertiary },
  stepLabelOn: { color: colors.brandAccent },
  stepValue: { ...type.label, color: colors.textPrimary },
  stepEmpty: { color: colors.textTertiary },
  list: { flexGrow: 0 },
  row: {
    height: ROW_H,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  rowOn: { backgroundColor: colors.surface2 },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { ...type.h3, fontFamily: fonts.medium, color: colors.textPrimary },
  rowLabelOn: { fontFamily: fonts.semibold, color: colors.brandAccent },
  rowCaption: { ...type.caption, color: colors.textTertiary },
  mono: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  monoOn: { backgroundColor: colors.brandAccent },
  monoText: { ...type.label, fontFamily: fonts.semibold, color: colors.textSecondary },
  monoTextOn: { color: colors.textOnBrand },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandAccent,
  },
  empty: { ...type.bodySm, color: colors.textTertiary, textAlign: "center", paddingVertical: space.xl },
});
