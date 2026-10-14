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
 * TEK LİG SEÇİCİ (bilgi mimarisi turu): bu sayfa `LeaguePicker` hapının
 * açtığı sayfadır. Lig adımında SABİTLENEN ligler (başka ilde olsalar da)
 * en üstte durur; her lig satırının sağındaki raptiye sabitler/çözer. Sezon
 * adımı güncel sezonları ve altında ARŞİV'i (eski Lig ▸ Arşiv sekmesi)
 * gösterir — geçmiş sezona geçmek ayrı bir sekme değil, sezon seçimidir.
 *
 * "TÜMÜ" SATIRLARI (yalnız Maçlar): `openScopeSheet(step, { allowAll: true })`
 * ile açıldığında il adımının başında "Tüm Türkiye", lig adımının başında
 * "Tüm ligler" satırı durur. Bunlar kapsamı DEĞİŞTİRMEZ, yalnız Maçlar'ın
 * görünüm genişliğini (`matchView`) ayarlar; Lig sekmesi tek ligde kalır.
 * Bir il seçmek görünümü o ilin tamamına, bir lig/sezon seçmek tek lige çeker.
 *
 * Tek örnek app/_layout.tsx'te mount edilir; açma/kapama ScopeProvider
 * üstünden yapılır (`openScopeSheet(step?, options?)`).
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
import { colors, fonts, hairline, layout, radius, space, textScale, touchSlop, type, upperTR } from "@/theme";

/** "Tüm Türkiye" / "Tüm ligler" satırlarının kimliği — gerçek id'lerle çakışmaz. */
const ALL_ID = 0;

/** Arama kutusunun görüneceği eşik — altında kutu gereksiz yer kaplar. */
const SEARCH_THRESHOLD = 12;

const STEPS: { key: ScopeStep; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "city", label: "Şehir", icon: "location-outline" },
  { key: "league", label: "Lig", icon: "trophy-outline" },
  { key: "season", label: "Sezon", icon: "calendar-outline" },
];

interface ScopeOption {
  /** Satır anahtarı — sabitlenen başka ildeki lig aynı id ile iki kez görünmesin. */
  key: string;
  kind: "option" | "header";
  id: number;
  label: string;
  /** Satırın ikinci satırı (sabitlenen başka ilde lig: il adı; sezon: yıl). */
  caption?: string;
  archived: boolean;
  /** Sabitlenen lig başka bir ildeyse il id'si — seçim `jumpTo` ile yapılır. */
  cityId?: number;
  /** "Tüm Türkiye" / "Tüm ligler" satırı. */
  all?: boolean;
}

/** Türkçe arama: "İzmir" araması "izmir" yazınca da bulunmalı. */
const fold = (value: string) => value.trim().toLocaleLowerCase("tr");

/** Liste satırı — FlatList içinde olduğu için memo'lu ve sabit yükseklikli. */
const OptionRow = React.memo(function OptionRow({
  option,
  selected,
  favorite,
  pinned,
  onSelect,
  onTogglePin,
}: {
  option: ScopeOption;
  selected: boolean;
  favorite: boolean;
  /** undefined → raptiye çizilmez (il ve sezon adımı). */
  pinned?: boolean;
  onSelect: (option: ScopeOption) => void;
  onTogglePin?: (option: ScopeOption) => void;
}) {
  const handlePress = useCallback(() => onSelect(option), [onSelect, option]);
  const handlePin = useCallback(() => onTogglePin?.(option), [onTogglePin, option]);

  if (option.kind === "header") {
    return (
      <View style={styles.groupHead}>
        <Text style={styles.groupLabel} {...textScale.badge}>
          {upperTR(option.label)}
        </Text>
      </View>
    );
  }

  const row = (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={option.label}
    >
      {option.all ? (
        <View style={[styles.allIcon, selected && styles.allIconOn]}>
          <Ionicons name="earth" size={15} color={selected ? colors.textOnBrand : colors.brandAccent} />
        </View>
      ) : null}
      {favorite ? <Ionicons name="star" size={13} color={colors.star} /> : null}
      <View style={styles.rowText}>
        <Text
          style={[styles.rowLabel, selected && styles.rowLabelSelected]}
          numberOfLines={1}
          {...textScale.dense}
        >
          {option.label}
        </Text>
        {option.caption ? (
          <Text style={styles.rowCaption} numberOfLines={1} {...textScale.dense}>
            {option.caption}
          </Text>
        ) : null}
      </View>
      {option.archived ? <Badge label="Arşiv" tone="neutral" size="xs" /> : null}
      <View style={styles.rowSpacer} />
      {selected ? (
        <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
      )}
    </Touchable>
  );

  if (pinned === undefined) return row;

  return (
    <View style={styles.rowWithPin}>
      <View style={styles.rowFlex}>{row}</View>
      <Touchable
        feedback="icon"
        haptic="selection"
        onPress={handlePin}
        hitSlop={touchSlop(40)}
        style={[styles.pin, pinned && styles.pinOn]}
        accessibilityRole="button"
        accessibilityState={{ selected: pinned }}
        accessibilityLabel={pinned ? `${option.label} sabitlemesini kaldır` : `${option.label} ligini sabitle`}
        testID={`pin-league-${option.id}`}
      >
        <Ionicons name={pinned ? "pin" : "pin-outline"} size={16} color={pinned ? colors.brandAccent : colors.textTertiary} />
      </Touchable>
    </View>
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
    jumpTo,
    cityId,
    leagueId,
    seasonId,
    pinnedLeagues,
    isPinnedLeague,
    togglePinLeague,
    sheetAllowAll,
    matchView,
    setMatchView,
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
    const toOption = (item: { id: number; label: string; is_archived?: boolean | null }, caption?: string): ScopeOption => ({
      key: `o:${item.id}`,
      kind: "option",
      id: item.id,
      label: item.label,
      caption,
      archived: Boolean(item.is_archived),
    });
    const header = (key: string, label: string): ScopeOption => ({
      key: `h:${key}`,
      kind: "header",
      id: -1,
      label,
      archived: false,
    });

    const allRow = (label: string, caption: string): ScopeOption => ({
      key: `all:${step}`,
      kind: "option",
      id: ALL_ID,
      label,
      caption,
      archived: false,
      all: true,
    });

    if (step === "city") {
      const cities = scope.cities.map((item) => toOption(item));
      return sheetAllowAll ? [allRow("Tüm Türkiye", "Bütün illerin maçları"), ...cities] : cities;
    }

    if (step === "league") {
      // Sabitlenenler (her ilden) en üstte; ardından bu ilin kalan ligleri,
      // takip edilenler başta.
      const pinnedRows: ScopeOption[] = pinnedLeagues.map((item) => ({
        key: `p:${item.leagueId}`,
        kind: "option",
        id: item.leagueId,
        label: item.label,
        caption: item.cityId === cityId ? undefined : item.cityLabel,
        archived: false,
        cityId: item.cityId,
      }));
      const rest = scope.leagues
        .filter((league) => !isPinnedLeague(league.id))
        .map((league) => toOption(league))
        .sort((a, b) => Number(isFavoriteLeague(b.id)) - Number(isFavoriteLeague(a.id)));
      const allRows =
        sheetAllowAll && cityId
          ? [allRow("Tüm ligler", scope.cityLabel ? `${scope.cityLabel} ilindeki bütün maçlar` : "Bu ilin bütün maçları")]
          : [];
      if (!pinnedRows.length) return [...allRows, ...rest];
      return [
        ...allRows,
        header("pinned", "Sabitlenenler"),
        ...pinnedRows,
        ...(rest.length ? [header("city", scope.cityLabel ? `${scope.cityLabel} ligleri` : "Ligler"), ...rest] : []),
      ];
    }

    // Sezon: güncel sezonlar, altında arşiv.
    const yearOf = (item: { season_year?: string | number | null }) =>
      item.season_year ? String(item.season_year) : undefined;
    const current = scope.seasons.filter((item) => !item.is_archived).map((item) => toOption(item, yearOf(item)));
    const archived = scope.seasons
      .filter((item) => item.is_archived)
      .map((item) => ({ ...toOption(item, yearOf(item)), archived: false }));
    if (!archived.length) return current;
    return [...current, header("archive", "Arşiv · geçmiş sezonlar"), ...archived];
  }, [step, scope.cities, scope.leagues, scope.seasons, scope.cityLabel, cityId, pinnedLeagues, isPinnedLeague, isFavoriteLeague, sheetAllowAll]);

  const filtered = useMemo(() => {
    const term = fold(search);
    if (!term) return options;
    return options.filter((option) => option.kind === "option" && !option.all && fold(option.label).includes(term));
  }, [options, search]);

  /** "Tümü" görünümündeyken seçili satır o adımın "Tümü" satırıdır. */
  const selectedId =
    step === "city"
      ? sheetAllowAll && matchView === "country"
        ? ALL_ID
        : cityId
      : step === "league"
        ? sheetAllowAll && matchView === "city"
          ? ALL_ID
          : leagueId
        : seasonId;

  /**
   * Seçim anında uygulanır; şehir → lig → sezon adımları kendiliğinden
   * ilerler. Seçili değere yeniden dokunmak yalnız ilerletir (bkz. başlık).
   */
  const handleSelect = useCallback(
    (option: ScopeOption) => {
      const id = option.id;
      setSearch("");
      if (option.all) {
        // "Tüm Türkiye" / "Tüm ligler": kapsam aynı kalır, görünüm genişler.
        setMatchView(step === "city" ? "country" : "city");
        closeScopeSheet();
        return;
      }
      if (step === "city") {
        if (id !== cityId) selectCity(id);
        // Maçlar'da il seçmek önce o ilin tamamını gösterir; lig adımında
        // "Tüm ligler" seçili durur, istenirse tek lige inilir.
        if (sheetAllowAll) setMatchView("city");
        setStep("league");
        return;
      }
      // Lig ya da sezon seçmek her zaman tek lig görünümüdür.
      setMatchView("league");
      if (step === "league") {
        // Başka ilde sabitlenmiş lig: il ve lig birlikte değişir.
        if (option.cityId && option.cityId !== cityId) jumpTo(option.cityId, id);
        else if (id !== leagueId) selectLeague(id);
        setStep("season");
        return;
      }
      if (id !== seasonId) selectSeason(id);
      // Son adım: seçim tamam, sayfa kendiliğinden kapanır.
      closeScopeSheet();
    },
    [step, cityId, leagueId, seasonId, selectCity, selectLeague, selectSeason, jumpTo, closeScopeSheet, sheetAllowAll, setMatchView],
  );

  const handleTogglePin = useCallback(
    (option: ScopeOption) => {
      const pinnedEntry = pinnedLeagues.find((item) => item.leagueId === option.id);
      togglePinLeague(
        pinnedEntry ?? {
          cityId: cityId as number,
          cityLabel: scope.cityLabel,
          leagueId: option.id,
          label: option.label,
        },
      );
    },
    [pinnedLeagues, togglePinLeague, cityId, scope.cityLabel],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ScopeOption>) => (
      <OptionRow
        option={item}
        selected={item.kind === "option" && item.id === selectedId}
        favorite={step === "league" && isFavoriteLeague(item.id)}
        pinned={step === "league" && cityId && !item.all ? isPinnedLeague(item.id) : undefined}
        onSelect={handleSelect}
        onTogglePin={handleTogglePin}
      />
    ),
    [selectedId, handleSelect, handleTogglePin, step, cityId, isFavoriteLeague, isPinnedLeague],
  );

  const keyExtractor = useCallback((item: ScopeOption) => item.key, []);

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

  const wide = sheetAllowAll ? matchView : "league";
  const values: Record<ScopeStep, string> = {
    city: wide === "country" ? "Tüm Türkiye" : scope.cityLabel,
    league: wide === "league" ? scope.leagueLabel : "Tümü",
    season: wide === "league" ? scope.seasonLabel : "Tümü",
  };

  return (
    <BottomSheet
      visible={sheetOpen}
      onClose={closeScopeSheet}
      title={sheetAllowAll ? "Maçları süz" : "Lig seç"}
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

/** Satırlar arası boşluk. */
const ROW_GAP = space.xxs;

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
  rowText: {
    flexShrink: 1,
    gap: 1,
  },
  rowCaption: {
    ...type.caption,
    color: colors.textTertiary,
  },
  rowWithPin: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  rowFlex: {
    flex: 1,
  },
  pin: {
    width: 36,
    height: 36,
    marginBottom: ROW_GAP,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pinOn: {
    backgroundColor: colors.brandDim,
  },
  groupHead: {
    paddingTop: space.md,
    paddingBottom: space.xs,
    paddingHorizontal: space.xs,
  },
  groupLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  rowLabel: {
    ...type.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  /** "Tümü" satırının yuvarlak dünya rozeti. */
  allIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    alignItems: "center",
    justifyContent: "center",
  },
  allIconOn: {
    backgroundColor: colors.brand,
  },
  rowLabelSelected: {
    color: colors.brandAccent,
    fontFamily: fonts.semibold,
  },
});
