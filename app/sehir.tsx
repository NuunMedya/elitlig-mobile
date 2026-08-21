/**
 * ŞEHİR SEÇİMİ — sitedeki "Haritada şehirleri keşfet" sayfasının mobil hâli.
 *
 * NE: Türkiye haritası (dokunulabilir iller) + arama kutusu + şehir listesi.
 * Kullanıcı şehrini haritadan ya da listeden seçer, misafir olarak devam eder.
 * Menü → "Şehir değiştir" ile sonradan da açılır; o yüzden yığında geri
 * dönülecek bir ekran varsa başlıkta geri oku çıkar.
 *
 * AKIŞ KORUNUR: seçim `scope.selectCity` ile kaydedilir (şehir değişince lig ve
 * sezon sıfırlanır, sunucu yenisini önerir), `INTRO_SEEN_KEY` yazılır ve ekran
 * `/(tabs)` ile değiştirilir. Bayrak yazılamazsa ekran bir sonraki açılışta
 * yine gelir — engel değil, o yüzden hata yutulur.
 *
 * ROZET NE ANLATIR: `/api/meta/cities` yalnız lig verisi olan şehirleri
 * döndürür; arşivlenmiş olanlar `is_archived` ile işaretlenir. "Aktif lig"
 * rozeti bu ayrımı gösterir ve haritadaki parlak illerle aynı şeyi söyler.
 *
 * ARAMA TÜRKÇEYE GÖRE: "istanbul" yazınca "İstanbul" bulunsun diye
 * karşılaştırma `toLocaleLowerCase("tr-TR")` ile yapılır (I/İ tuzağı).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TurkeyMap } from "@/components/TurkeyMap";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  ListRow,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  SkeletonListRow,
  useHeaderScroll,
} from "@/components/ui";
import { INTRO_SEEN_KEY } from "@/lib/storage";
import type { MetaOption } from "@/lib/types";
import { useScope } from "@/providers/ScopeProvider";
import {
  colors,
  fonts,
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
      leading={{ icon: selected ? "location" : "location-outline", tone: selected ? "brand" : "neutral" }}
      title={label}
      badge={active ? <Badge label="Aktif lig" tone="win" size="xs" /> : undefined}
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

/* ═════════════════════════ EKRAN ═════════════════════════ */

export default function CityIntroScreen() {
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [selectedId, setSelectedId] = useState<number | null>(scope.cityId);
  const [query, setQuery] = useState("");

  /** Geri oku yalnız menüden gelindiğinde anlamlı; ilk açılışta yığın boştur. */
  const canGoBack = useMemo(() => router.canGoBack(), [router]);

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

  const finish = useCallback(async () => {
    if (!selectedId) return;
    if (selectedId !== scope.cityId) scope.selectCity(selectedId);
    await AsyncStorage.setItem(INTRO_SEEN_KEY, "1").catch(() => {
      // Bayrak yazılamazsa ekran bir dahaki açılışta yine gelir; engel değil.
    });
    router.replace("/(tabs)");
  }, [router, scope, selectedId]);

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
      <View style={styles.mapCard}>
        <TurkeyMap cities={cities} selectedId={selectedId} onSelect={select} />
        <Text style={styles.mapHint} {...textScale.dense}>
          Parlak iller aktif lig verisi olduğunu gösterir
        </Text>
      </View>

      <SectionHeader
        title="Şehirler"
        meta={
          query
            ? `${filtered.length} sonuç`
            : activeCount > 0
              ? `${activeCount} aktif lig`
              : undefined
        }
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScreenHeader
        title="Şehrini seç"
        overline="ELİTLİG"
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
                body="Bağlantını kontrol edip ekranı yeniden açar mısın?"
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
        <Button
          label={selectedId ? "Misafir olarak devam et" : "Bir şehir seç"}
          onPress={finish}
          disabled={!selectedId}
          icon="arrow-forward"
          iconPosition="right"
          size="lg"
          fullWidth
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

  mapCard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.md,
  },
  mapHint: {
    ...type.caption,
    fontFamily: fonts.semibold,
    letterSpacing: 0,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.sm,
  },

  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
