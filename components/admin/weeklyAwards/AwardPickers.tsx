/**
 * Haftanın enleri seçicileri — oyuncu ve takım (alt sayfa).
 *
 * Web: components/weeklyAwards/PlayerPicker.js + TeamPicker.js. Arama şehir
 * havuzunda yapılır (tarih aralığı şartı yok). Oyuncu seçicide "yalnız bu
 * mevki" anahtarı mevki ödüllerinde açık başlar; mevkisi girilmemiş oyuncular
 * süzgeçte elenmez (sunucu kuralı). Seçilmiş oyuncular listede görünmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { ToggleField } from "@/components/admin";
import { Avatar, BottomSheet, EmptyState, Input, SkeletonListRow, TeamLogo, Touchable } from "@/components/ui";
import { formatEtl, POS_GROUPS, searchAwardPlayers, searchAwardTeams, type AwardPlayer, type AwardTeam, type PositionGroup } from "@/lib/api/admin/weeklyAwards";
import { mediaUrl } from "@/lib/format";
import { colors, hairline, space, textScale, type } from "@/theme";

function useDebounced(value: string, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value.trim()), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function PlayerPickerSheet({
  visible,
  onClose,
  title,
  position,
  cityId,
  exclude,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  position?: PositionGroup | null;
  cityId?: number | null;
  exclude?: number[];
  onPick: (player: AwardPlayer) => void;
}) {
  const [term, setTerm] = useState("");
  const [only, setOnly] = useState(Boolean(position));
  const q = useDebounced(term);
  useEffect(() => {
    if (visible) {
      setTerm("");
      setOnly(Boolean(position));
    }
  }, [visible, position]);

  const query = useQuery({
    queryKey: ["admin", "weeklyAwards", "players", q, only && position ? position : "", cityId ?? null],
    queryFn: () => searchAwardPlayers({ search: q, position: only && position ? position : undefined, cityId }),
    enabled: visible,
    staleTime: 60_000,
  });
  const ex = new Set(exclude ?? []);
  const results = (query.data ?? []).filter((p) => !ex.has(Number(p.playerId)));
  const posLabel = (p: AwardPlayer) => POS_GROUPS.find((g) => g.value === p.positionGroup)?.label ?? p.position ?? "Mevki yok";

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} snap="full" scrollable={false}>
      <View style={styles.wrap}>
        <Input variant="search" leadingIcon="search" value={term} onChangeText={setTerm} placeholder="Oyuncu ara" autoCorrect={false} />
        {position ? <ToggleField label={`Yalnız ${POS_GROUPS.find((g) => g.value === position)?.label.toLocaleLowerCase("tr-TR")} oyuncular`} value={only} onChange={setOnly} /> : null}
        <FlatList
          data={results}
          keyExtractor={(p) => String(p.playerId)}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={query.isLoading ? <SkeletonListRow count={6} /> : <EmptyState icon="person-outline" title="Oyuncu bulunamadı" variant="inline" compact />}
          renderItem={({ item }) => (
            <Touchable
              style={styles.row}
              onPress={() => {
                onPick(item);
                onClose();
              }}
              accessibilityRole="button"
            >
              <Avatar name={item.playerName} image={mediaUrl(item.playerImg)} size={40} />
              <View style={styles.texts}>
                <Text style={styles.name} {...textScale.dense}>
                  {item.playerName}
                </Text>
                <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                  {[posLabel(item), item.teamName, item.marketValue != null ? formatEtl(item.marketValue) : null].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={colors.brandAccent} />
            </Touchable>
          )}
        />
      </View>
    </BottomSheet>
  );
}

export function TeamPickerSheet({
  visible,
  onClose,
  cityId,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  cityId?: number | null;
  onPick: (team: AwardTeam) => void;
}) {
  const [term, setTerm] = useState("");
  const q = useDebounced(term);
  useEffect(() => {
    if (visible) setTerm("");
  }, [visible]);
  const query = useQuery({
    queryKey: ["admin", "weeklyAwards", "teams", q, cityId ?? null],
    queryFn: () => searchAwardTeams({ search: q, cityId }),
    enabled: visible,
    staleTime: 60_000,
  });
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Haftanın takımı" snap="full" scrollable={false}>
      <View style={styles.wrap}>
        <Input variant="search" leadingIcon="search" value={term} onChangeText={setTerm} placeholder="Takım ara" autoCorrect={false} />
        <FlatList
          data={query.data ?? []}
          keyExtractor={(t) => String(t.teamId)}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={query.isLoading ? <SkeletonListRow count={6} /> : <EmptyState icon="shield-outline" title="Takım bulunamadı" variant="inline" compact />}
          renderItem={({ item }) => (
            <Touchable
              style={styles.row}
              onPress={() => {
                onPick(item);
                onClose();
              }}
              accessibilityRole="button"
            >
              <TeamLogo name={item.teamName} logo={mediaUrl(item.teamLogo)} size={36} />
              <Text style={[styles.name, styles.texts]} {...textScale.dense}>
                {item.teamName}
              </Text>
              <Ionicons name="add-circle-outline" size={22} color={colors.brandAccent} />
            </Touchable>
          )}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  texts: { flex: 1, gap: 2 },
  name: { ...type.body, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
});
