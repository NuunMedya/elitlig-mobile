import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/constants/theme";
import { useScope } from "@/providers/ScopeProvider";
import type { MetaOption } from "@/lib/types";

/**
 * Şehir / lig / sezon seçici.
 *
 * Sitedeki üst filtre çubuğunun mobil karşılığı. Ekranın tepesinde tek satır
 * kaplar; dokununca tam ekran liste açılır — küçük ekranda açılır menü yerine
 * liste, uzun lig adlarını kesmeden gösterir.
 */
export function ScopeBar() {
  const scope = useScope();
  const [picker, setPicker] = useState<"city" | "league" | "season" | null>(null);

  const config = {
    city: {
      title: "Şehir",
      options: scope.cities,
      selected: scope.cityId,
      onSelect: scope.selectCity,
    },
    league: {
      title: "Lig",
      options: scope.leagues as MetaOption[],
      selected: scope.leagueId,
      onSelect: scope.selectLeague,
    },
    season: {
      title: "Sezon",
      options: scope.seasons as MetaOption[],
      selected: scope.seasonId,
      onSelect: scope.selectSeason,
    },
  } as const;

  const current = picker ? config[picker] : null;

  return (
    <>
      <View style={styles.bar}>
        <Chip
          label={scope.cityLabel || "Şehir"}
          icon="location-outline"
          onPress={() => setPicker("city")}
        />
        <Chip
          label={scope.leagueLabel || "Lig"}
          icon="trophy-outline"
          onPress={() => setPicker("league")}
          disabled={!scope.cityId}
          flexible
        />
        <Chip
          label={scope.seasonLabel || "Sezon"}
          icon="calendar-outline"
          onPress={() => setPicker("season")}
          disabled={!scope.leagueId}
        />
      </View>

      <Modal
        visible={Boolean(picker)}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setPicker(null)}
      >
        <SafeAreaView style={styles.sheet} edges={["top", "bottom"]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{current?.title} seç</Text>
            <Pressable onPress={() => setPicker(null)} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.line} />
            </Pressable>
          </View>

          <FlatList
            data={current?.options ?? []}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.sheetList}
            renderItem={({ item }) => {
              const active = item.id === current?.selected;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.option,
                    active && styles.optionActive,
                    pressed && styles.optionPressed,
                  ]}
                  onPress={() => {
                    current?.onSelect(item.id);
                    setPicker(null);
                  }}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {item.label}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={20} color={colors.turf} /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>Bu seçim için kayıt bulunamadı.</Text>
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

function Chip({
  label,
  icon,
  onPress,
  disabled,
  flexible,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  flexible?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        flexible && styles.chipFlexible,
        disabled && styles.chipDisabled,
        pressed && styles.chipPressed,
      ]}
    >
      <Ionicons name={icon} size={14} color={colors.muted} />
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={13} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.faint,
    // Lig adları uzun olabiliyor; üç çip dar ekranda taşmasın diye hepsi küçülür,
    // uzun ad ise satırın kalanını alır.
    flexShrink: 1,
  },
  chipFlexible: {
    flexGrow: 1,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  chipText: {
    ...type.caption,
    color: colors.line,
    flexShrink: 1,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  sheetTitle: {
    ...type.title,
    color: colors.line,
  },
  sheetList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  optionActive: {
    borderWidth: 1,
    borderColor: colors.turf,
  },
  optionPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  optionText: {
    ...type.body,
    color: colors.line,
    flexShrink: 1,
  },
  optionTextActive: {
    color: colors.turf,
    fontWeight: "700",
  },
  empty: {
    ...type.small,
    color: colors.muted,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
});
