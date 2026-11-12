/**
 * ŞEHİR SEÇİMİ — sitedeki "Haritada şehirleri keşfet" sayfasının mobil hâli.
 *
 * NE: Türkiye haritası (dokunulabilir iller) + arama kutusu + şehir listesi.
 * Kullanıcı şehrini haritadan ya da listeden seçer, misafir olarak devam eder.
 * Menü → "Şehir değiştir" ile sonradan da açılır; o yüzden yığında geri
 * dönülecek bir ekran varsa başlıkta geri oku çıkar.
 *
 * İKİ KİP:
 *   · İLK AÇILIŞ (`INTRO_SEEN_KEY` yok) → sihirbazın 1. adımı (ADIM 1 / 4).
 *     Seçim `scope.selectCity` ile kaydedilir (lig ve sezon sıfırlanır, sunucu
 *     yenisini önerir) ve `/baslangic` açılır: lig → takım → bildirim. Bayrak
 *     orada, son adımda yazılır. "Atla" şehri değiştirmeden ilerler.
 *   · SONRADAN (bayrak var, ör. "Şehir değiştir") → tek adımlık seçici: şehri
 *     seçer ve geri döner; yığında geri yoksa sekmelere gider.
 *
 * ROZET NE ANLATIR: `/api/meta/cities` yalnız lig verisi olan şehirleri
 * döndürür; arşivlenmiş olanlar `is_archived` ile işaretlenir. ARENA: renk
 * sinyaldir — eskiden HER satırda yeşil "Aktif lig" rozeti vardı ve on bir
 * satırın on birinde aynı şeyi söyleyen rozet hiçbir şey söylemiyordu. Artık
 * kural tersine çevrildi: yalnız İSTİSNA (arşivlenmiş şehir) nötr "Arşiv"
 * rozeti taşır. Seçili şehir vurgulu zemin + onay işaretiyle okunur, alt
 * düğme şehrin adını söyler ("Ankara ile devam et").
 *
 * ARAMA TÜRKÇEYE GÖRE: "istanbul" yazınca "İstanbul" bulunsun diye
 * karşılaştırma `toLocaleLowerCase("tr-TR")` ile yapılır (I/İ tuzağı).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { TurkeyMap } from "@/components/TurkeyMap";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  ListRow,
  Reveal,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  SkeletonListRow,
  useHeaderScroll,
} from "@/components/ui";
import { queryKeys } from "@/lib/queryKeys";
import { INTRO_SEEN_KEY } from "@/lib/storage";
import type { MetaOption } from "@/lib/types";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  fonts,
  glowStyle,
  hairline,
  haptics,
  layout,
  radius,
  space,
  textScale,
  type,
} from "@/theme";

/** Türkçe küçük harf — arama karşılaştırmasının tek yeri. */
const norm = (value: string) => value.trim().toLocaleLowerCase("tr-TR");

/* ═════════════════════════ ŞEHİR SATIRI ═════════════════════════ */

/**
 * NEDEN AYRI VE MEMO'LU: `ListRow` memo'ludur; satırı liste içinde inline
 * yazsaydık `onPress` her çizimde yeni referans alır ve memo hiç tutmazdı.
 * Bileşen yalnız ilkel prop alır, basma geri çağrısı içeride sabitlenir.
 */
const CityRow = React.memo(function CityRow({
  id,
  label,
  active,
  selected,
  position,
  onSelect,
}: {
  id: number;
  label: string;
  /** Arşivlenmemiş, yani güncel lig verisi olan şehir. */
  active: boolean;
  selected: boolean;
  position: "single" | "first" | "middle" | "last";
  onSelect: (cityId: number) => void;
}) {
  const press = useCallback(() => onSelect(id), [id, onSelect]);

  return (
    <ListRow
      leading={<CityMonogram label={label} selected={selected} />}
      title={label}
      subtitle={selected ? "Seçili şehir" : undefined}
      badge={active ? undefined : <Badge label="Arşiv" tone="neutral" size="xs" />}
      trailing={
        selected ? (
          <Ionicons name="checkmark-circle" size={20} color={colors.brandAccent} />
        ) : undefined
      }
      chevron={false}
      highlighted={selected}
      position={position}
      onPress={press}
    />
  );
});

/**
 * Şehir pulu — adın ilk iki harfi Archivo ile, plaka gibi. Seçili şehirde
 * imza degradesi + parıltı, diğerlerinde sönük yüzey.
 */
const CityMonogram = React.memo(function CityMonogram({ label, selected }: { label: string; selected: boolean }) {
  const letters = label.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, "").slice(0, 2).toLocaleUpperCase("tr-TR");
  return (
    <View style={[styles.mono, selected ? glowStyle(colors.glow, 1) : null]}>
      {selected ? (
        <LinearGradient
          colors={colors.gradientSignature}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.monoFill]}
        />
      ) : null}
      <Text style={[styles.monoText, selected ? styles.monoTextOn : null]} {...textScale.badge}>
        {letters}
      </Text>
    </View>
  );
});

/* ═════════════════════════ EKRAN ═════════════════════════ */

export default function CityIntroScreen() {
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<number | null>(scope.cityId);
  const [query, setQuery] = useState("");

  /* Kapsam bu ekrandan SONRA yüklenebilir (ilk açılış: önerilen şehir sunucudan
     gelir). Kullanıcı henüz seçim yapmadıysa öneri seçili gelsin — yoksa alt
     düğme "Bir şehir seç" diye pasif kalıyor ve kullanıcı neden ilerleyemediğini
     anlamıyordu. Kullanıcının kendi seçimi asla ezilmez. */
  const scopeCityId = scope.cityId;
  useEffect(() => {
    if (scopeCityId != null) setSelectedId((current) => current ?? scopeCityId);
  }, [scopeCityId]);

  /** Şehir listesi alınamadıysa yeniden dene (bağlantı geri geldiğinde). */
  const retryCities = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cities() });
  }, [queryClient]);

  /** Geri oku yalnız menüden gelindiğinde anlamlı; ilk açılışta yığın boştur. */
  const canGoBack = useMemo(() => router.canGoBack(), [router]);

  /** İlk açılış mı? null = bayrak henüz okunmadı. */
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then((value) => setFirstRun(!value))
      .catch(() => setFirstRun(false));
  }, []);

  const cities = scope.cities;
  const loading = cities.length === 0 && scope.loading;

  const filtered = useMemo(() => {
    const needle = norm(query);
    if (!needle) return cities;
    return cities.filter((city) => norm(city.label).includes(needle));
  }, [cities, query]);

  const activeCount = useMemo(
    () => cities.filter((city) => !city.is_archived).length,
    [cities]
  );

  const select = useCallback((cityId: number) => {
    setSelectedId(cityId);
    haptics.select();
  }, []);

  const finish = useCallback(() => {
    if (!selectedId) return;
    if (selectedId !== scope.cityId) scope.selectCity(selectedId);
    if (firstRun) router.replace("/baslangic");
    else if (canGoBack) router.back();
    else router.replace("/(tabs)");
  }, [canGoBack, firstRun, router, scope, selectedId]);

  /** İlk açılışta şehir adımı da atlanabilir: önerilen kapsamla sürer. */
  const skip = useCallback(() => router.replace("/baslangic"), [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: MetaOption; index: number }) => (
      <CityRow
        id={item.id}
        label={item.label}
        active={!item.is_archived}
        selected={item.id === selectedId}
        position={
          filtered.length === 1
            ? "single"
            : index === 0
              ? "first"
              : index === filtered.length - 1
                ? "last"
                : "middle"
        }
        onSelect={select}
      />
    ),
    [filtered.length, select, selectedId]
  );

  const search = (
    <View style={styles.searchBand}>
      <Input
        variant="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Şehir ara"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Şehir ara"
      />
    </View>
  );

  const listHeader = (
    <View style={styles.listHeader}>
      {/* Harita: illere dokunmak da seçim yapar, liste ile aynı durumu yazar. */}
      <Reveal style={styles.mapCard} scaleFrom={0.97}>
        <TurkeyMap cities={cities} selectedId={selectedId} onSelect={select} />
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotLeague]} />
            <Text style={styles.mapHint} {...textScale.dense}>
              Lig var
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendDotOn]} />
            <Text style={styles.mapHint} {...textScale.dense}>
              Seçili
            </Text>
          </View>
          <Text style={[styles.mapHint, styles.legendHint]} numberOfLines={1} {...textScale.dense}>
            Haritaya ya da listeye dokun
          </Text>
        </View>
      </Reveal>

      <SectionHeader
        title="Şehirler"
        icon="location"
        iconTone="cyan"
        meta={
          query
            ? `${filtered.length} sonuç`
            : activeCount > 0
              ? `${activeCount} şehirde lig`
              : undefined
        }
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScreenHeader
        title="Şehrini seç"
        overline={firstRun ? `ADIM 1 / 4` : "ELİTLİG"}
        subtitle="Lig, fikstür ve yıldızlar şehrine göre gelir"
        back={canGoBack}
        scrollY={scrollY}
        bottom={search}
      />

      {loading ? (
        <View style={styles.loading}>
          <Skeleton width="100%" height={210} radius="lg" />
          <SkeletonListRow count={6} />
        </View>
      ) : (
        <FlatList
          {...scrollProps}
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            cities.length === 0 ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="Şehir listesi alınamadı"
                body="Bağlantını kontrol edip yeniden dene."
                action={{ label: "Yeniden dene", onPress: retryCities }}
                variant="inline"
              />
            ) : (
              <EmptyState
                icon="search-outline"
                title="Şehir bulunamadı"
                body={`"${query}" için eşleşen şehir yok.`}
                variant="inline"
                compact
              />
            )
          }
        />
      )}

      <View style={styles.footer}>
        {firstRun ? (
          <Button label="Atla" variant="ghost" size="lg" onPress={skip} testID="intro-city-skip" />
        ) : null}
        <Button
          label={
            selectedId
              ? `${cities.find((city) => city.id === selectedId)?.label ?? "Şehir"} ile devam et`
              : "Bir şehir seç"
          }
          onPress={finish}
          disabled={!selectedId}
          icon="arrow-forward"
          iconPosition="right"
          size="lg"
          fullWidth={!firstRun}
          style={firstRun ? styles.footerPrimary : undefined}
          testID="intro-city-next"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  searchBand: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },

  loading: {
    padding: layout.screenPadding,
    gap: space.md,
  },

  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xxl,
  },
  listHeader: {
    paddingTop: space.md,
  },

  mono: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  monoFill: { borderRadius: 12 },
  monoText: { ...type.label, fontFamily: fonts.bold, color: colors.textSecondary, letterSpacing: 0.5 },
  monoTextOn: { color: colors.onDark },
  legend: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendDotLeague: { backgroundColor: colors.brandAccent },
  legendDotOn: { backgroundColor: colors.brandStrong },
  legendHint: { flex: 1, textAlign: "right" },
  mapCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.md,
  },
  mapHint: {
    ...type.caption,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textTertiary,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  footerPrimary: {
    flex: 1,
  },
});
