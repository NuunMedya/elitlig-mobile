/**
 * ScopeSelects — il → lig → sezon seçimi (routes/meta.js).
 *
 * Üst seviye değişince altı sıfırlanır; lig il seçilmeden, sezon lig
 * seçilmeden açılmaz. Liste filtrelerinde ve sevk / haber formlarında aynı
 * davranış kullanılır.
 */

import { useQuery } from "@tanstack/react-query";
import React from "react";
import { StyleSheet, View } from "react-native";

import { SelectField } from "@/components/admin";
import { getCities, getLeagues, getSeasons } from "@/lib/api/meta";
import { space } from "@/theme";

export interface ScopeValue {
  cityId: number | null;
  leagueId: number | null;
  seasonId: number | null;
}

export function ScopeSelects({
  value,
  onChange,
  required,
  lockCity,
  allLabels,
  hideSeason,
}: {
  value: ScopeValue;
  onChange: (next: ScopeValue) => void;
  required?: boolean;
  /** İl kısıtlı yetkili: il seçimi kilitli. */
  lockCity?: boolean;
  /** Boş seçim "tümü" anlamına gelir (haber kapsamı). */
  allLabels?: { city?: string; league?: string; season?: string };
  hideSeason?: boolean;
}) {
  const cities = useQuery({ queryKey: ["admin", "meta", "cities"], queryFn: getCities, staleTime: 10 * 60_000 });
  const leagues = useQuery({
    queryKey: ["admin", "meta", "leagues", value.cityId],
    queryFn: () => getLeagues(value.cityId as number),
    enabled: value.cityId != null,
    staleTime: 10 * 60_000,
  });
  const seasons = useQuery({
    queryKey: ["admin", "meta", "seasons", value.cityId, value.leagueId],
    queryFn: () => getSeasons(value.cityId as number, value.leagueId as number),
    enabled: value.cityId != null && value.leagueId != null,
    staleTime: 10 * 60_000,
  });

  return (
    <View style={styles.wrap}>
      <SelectField<number>
        label="İl"
        required={required}
        value={value.cityId}
        options={(cities.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
        placeholder={cities.isLoading ? "Yükleniyor" : allLabels?.city ?? "İl seç"}
        clearable={!required && !lockCity}
        disabled={lockCity}
        icon="location-outline"
        onChange={(cityId) => onChange({ cityId, leagueId: null, seasonId: null })}
      />
      <SelectField<number>
        label="Lig"
        required={required}
        value={value.leagueId}
        options={(leagues.data ?? []).map((l) => ({ value: l.id, label: l.label }))}
        placeholder={value.cityId == null ? "Önce il seç" : allLabels?.league ?? "Lig seç"}
        clearable={!required}
        disabled={value.cityId == null}
        icon="trophy-outline"
        onChange={(leagueId) => onChange({ ...value, leagueId, seasonId: null })}
      />
      {hideSeason ? null : (
        <SelectField<number>
          label="Sezon"
          required={required}
          value={value.seasonId}
          options={(seasons.data ?? []).map((s) => ({ value: s.id, label: s.label }))}
          placeholder={value.leagueId == null ? "Önce lig seç" : allLabels?.season ?? "Sezon seç"}
          clearable={!required}
          disabled={value.leagueId == null}
          icon="calendar-outline"
          onChange={(seasonId) => onChange({ ...value, seasonId })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
});
