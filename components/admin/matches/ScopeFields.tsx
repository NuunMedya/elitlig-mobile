/**
 * YÖNETİM KAPSAM SEÇİCİSİ — il → lig → sezon (+ isteğe bağlı grup).
 *
 * Uygulamanın genel kapsamından (useScope) başlar ama ona yazmaz: yönetici
 * maç oluştururken ya da puan durumunu düzeltirken başka bir lige bakabilir,
 * üye tarafındaki seçimi bozmadan. Seçenekler /api/meta uçlarından gelir.
 */

import { useQuery } from "@tanstack/react-query";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { SelectField } from "@/components/admin";
import { getSeasonGroups } from "@/lib/api/admin/matches";
import { getCities, getLeagues, getSeasons } from "@/lib/api/meta";
import { useScope } from "@/providers/ScopeProvider";
import { space } from "@/theme";

export interface AdminScope {
  cityId: number | null;
  cityLabel: string;
  leagueId: number | null;
  leagueLabel: string;
  seasonId: number | null;
  seasonLabel: string;
  groupId: number | null;
  groupLabel: string;
}

export const EMPTY_SCOPE: AdminScope = {
  cityId: null,
  cityLabel: "",
  leagueId: null,
  leagueLabel: "",
  seasonId: null,
  seasonLabel: "",
  groupId: null,
  groupLabel: "",
};

/** Uygulama kapsamından başlangıç değeri. */
export function useInitialScope(): AdminScope | null {
  const scope = useScope();
  if (!scope.ready && scope.loading) return null;
  return {
    cityId: scope.cityId,
    cityLabel: scope.cityLabel,
    leagueId: scope.leagueId,
    leagueLabel: scope.leagueLabel,
    seasonId: scope.seasonId,
    seasonLabel: scope.seasonLabel,
    groupId: null,
    groupLabel: "",
  };
}

export function ScopeFields({
  value,
  onChange,
  withGroup,
  groupRequired,
  onGroupsLoaded,
  compact,
}: {
  value: AdminScope;
  onChange: (next: AdminScope) => void;
  withGroup?: boolean;
  /** Sezon gruplara ayrılmışsa grup zorunlu (maç oluşturma). */
  groupRequired?: boolean;
  onGroupsLoaded?: (hasGroups: boolean) => void;
  compact?: boolean;
}) {
  const cities = useQuery({ queryKey: ["admin", "matches", "meta-cities"], queryFn: getCities, staleTime: 10 * 60_000 });
  const leagues = useQuery({
    queryKey: ["admin", "matches", "leagues", value.cityId],
    queryFn: () => getLeagues(value.cityId as number),
    enabled: Boolean(value.cityId),
    staleTime: 5 * 60_000,
  });
  const seasons = useQuery({
    queryKey: ["admin", "matches", "seasons", value.cityId, value.leagueId],
    queryFn: () => getSeasons(value.cityId as number, value.leagueId as number),
    enabled: Boolean(value.cityId && value.leagueId),
    staleTime: 5 * 60_000,
  });
  const groups = useQuery({
    queryKey: ["admin", "matches", "groups", value.seasonId],
    queryFn: () => getSeasonGroups(value.seasonId as number),
    enabled: Boolean(withGroup && value.seasonId),
    staleTime: 5 * 60_000,
  });

  const groupList = groups.data ?? [];
  useEffect(() => {
    if (withGroup) onGroupsLoaded?.(groupList.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupList.length, withGroup]);

  return (
    <View style={[styles.stack, compact ? styles.compact : null]}>
      <SelectField<number>
        label="İl"
        value={value.cityId}
        valueLabel={value.cityLabel || null}
        options={(cities.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
        icon="map-outline"
        clearable={false}
        onChange={(v, o) => onChange({ ...EMPTY_SCOPE, cityId: v, cityLabel: o?.label ?? "" })}
      />
      <SelectField<number>
        label="Lig"
        value={value.leagueId}
        valueLabel={value.leagueLabel || null}
        options={(leagues.data ?? []).map((l) => ({ value: l.id, label: l.label }))}
        icon="trophy-outline"
        clearable={false}
        disabled={!value.cityId}
        onChange={(v, o) =>
          onChange({ ...value, leagueId: v, leagueLabel: o?.label ?? "", seasonId: null, seasonLabel: "", groupId: null, groupLabel: "" })
        }
      />
      <SelectField<number>
        label="Sezon"
        value={value.seasonId}
        valueLabel={value.seasonLabel || null}
        options={(seasons.data ?? []).map((s) => ({ value: s.id, label: s.label }))}
        icon="calendar-outline"
        clearable={false}
        disabled={!value.leagueId}
        onChange={(v, o) => onChange({ ...value, seasonId: v, seasonLabel: o?.label ?? "", groupId: null, groupLabel: "" })}
      />
      {withGroup && groupList.length ? (
        <SelectField<number>
          label="Grup"
          value={value.groupId}
          valueLabel={value.groupLabel || null}
          options={groupList.map((g) => ({ value: g.id, label: g.group_name }))}
          icon="grid-outline"
          required={groupRequired}
          clearable={!groupRequired}
          placeholder={groupRequired ? "Grup seç" : "Tüm sezon"}
          onChange={(v, o) => onChange({ ...value, groupId: v, groupLabel: o?.label ?? "" })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  compact: { gap: space.sm },
});
