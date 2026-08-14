import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Loading } from "@/components/States";
import { TurkeyMap } from "@/components/TurkeyMap";
import { colors, radius, spacing, type } from "@/constants/theme";
import { INTRO_SEEN_KEY } from "@/lib/storage";
import { useScope } from "@/providers/ScopeProvider";

/**
 * İlk açılış — sitedeki "Haritada şehirleri keşfet" sayfasının mobil hali.
 *
 * Kullanıcı şehrini haritadan ya da listeden seçer, misafir olarak devam
 * eder. Web'deki kullanıcı girişi mobilde hazır olduğunda bu ekrana
 * "Giriş yap" seçeneği eklenecek; akış buna göre kurgulandı.
 *
 * Menü → "Şehir değiştir" ile sonradan da açılabilir.
 */
export default function CityIntroScreen() {
  const scope = useScope();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(scope.cityId);

  const finish = async () => {
    if (!selectedId) return;
    if (selectedId !== scope.cityId) scope.selectCity(selectedId);
    await AsyncStorage.setItem(INTRO_SEEN_KEY, "1").catch(() => {
      // Bayrak yazılamazsa ekran bir dahaki açılışta yine gelir; engel değil.
    });
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>ELİTLİG</Text>
        <Text style={styles.kicker}>ŞEHİR BAZLI KEŞİF</Text>
        <Text style={styles.title}>Şehrini seç, ligini takip et</Text>
        <Text style={styles.subtitle}>
          Maçlar, puan tabloları ve yıldız oyuncular — hepsi seçtiğin şehre göre.
        </Text>

        {scope.cities.length === 0 ? (
          <Loading label="Şehirler yükleniyor" />
        ) : (
          <>
            <View style={styles.mapCard}>
              <TurkeyMap
                cities={scope.cities}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <Text style={styles.mapHint}>
                Parlak iller aktif lig verisi olduğunu gösterir
              </Text>
            </View>

            <View style={styles.chips}>
              {scope.cities.map((city) => {
                const active = city.id === selectedId;
                return (
                  <Pressable
                    key={city.id}
                    onPress={() => setSelectedId(city.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="location"
                      size={14}
                      color={active ? colors.surface : colors.turf}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {city.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={finish}
          disabled={!selectedId}
          style={({ pressed }) => [
            styles.cta,
            !selectedId && styles.ctaDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.ctaText}>
            {selectedId ? "Misafir olarak devam et" : "Bir şehir seç"}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={colors.surface} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  brand: {
    ...type.caption,
    color: colors.turf,
    letterSpacing: 2,
  },
  kicker: {
    ...type.caption,
    color: colors.muted,
    marginTop: spacing.lg,
  },
  title: {
    ...type.title,
    fontSize: 26,
    color: colors.line,
    marginTop: spacing.xs,
  },
  subtitle: {
    ...type.body,
    color: colors.muted,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  mapCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.faint,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  mapHint: {
    ...type.caption,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.turf,
    borderColor: colors.turf,
  },
  chipText: {
    ...type.small,
    color: colors.line,
    fontWeight: "700",
  },
  chipTextActive: {
    color: colors.surface,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  ctaDisabled: {
    backgroundColor: colors.muted,
  },
  ctaText: {
    ...type.subtitle,
    color: colors.surface,
  },
  pressed: {
    opacity: 0.8,
  },
});
