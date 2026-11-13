/**
 * Rehber → TAKIMLAR sekmesi (web RehberTeams.js liste görünümü).
 *
 * Sunucu süzgeçli ve sayfalı (GET /api/tools/contacts/teams): arama, il,
 * sıralama, "iletişimi olanlar". İl seçilmemişken yüklü takımlardan il
 * sayıları çip olarak çıkar (web .rt-cities); son bakılan takımlar üstte.
 * Takıma dokununca tam ekran takım kartı açılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AdminList, OptionSheet } from "@/components/admin";
import { CountStrip } from "@/components/admin/team/ManageKit";
import { Chip, ChipGroup, TeamLogo, Touchable } from "@/components/ui";
import { listDirectoryTeams, TEAM_SORTS, type DirectoryTeam, type TeamSort } from "@/lib/api/admin/contacts";
import { mediaUrl } from "@/lib/format";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { readRecentTeams, type RecentTeam } from "./recentTeams";
import { TeamDirectoryCard } from "./TeamDirectoryCard";
import type { ContactActions } from "./useContactActions";

const PAGE_SIZE = 60;

export function TeamsTab({ actions }: { actions: ContactActions }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [sort, setSort] = useState<TeamSort>("name");
  const [hasContact, setHasContact] = useState(false);
  const [picker, setPicker] = useState<"sort" | "city" | null>(null);
  const [recent, setRecent] = useState<RecentTeam[]>([]);

  // Karttan dönünce son bakılanlar tazelensin.
  useFocusEffect(
    useCallback(() => {
      void readRecentTeams().then(setRecent);
    }, [])
  );

  const query = useInfiniteQuery({
    queryKey: ["admin", "contacts", "teams", { q, city, sort, hasContact }],
    queryFn: ({ pageParam }) => listDirectoryTeams({ q, city, sort, has_contact: hasContact, page: pageParam, page_size: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const items = useMemo(() => query.data?.pages.flatMap((p) => p?.items ?? []) ?? [], [query.data]);
  const first = query.data?.pages[0];
  const cities = first?.cities ?? [];

  // İl sayıları (yüklü takımlardan), çoktan aza.
  const cityCounts = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((t) => {
      if (t.city) map.set(t.city, (map.get(t.city) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr")).slice(0, 12);
  }, [items]);

  const open = useCallback((id: number) => router.push(`/yonetim/araclar/rehber/takim/${id}` as never), [router]);
  const sortLabel = TEAM_SORTS.find((s) => s.key === sort)?.label ?? "Sıralama";

  const noCaptain = items.filter((t) => !t.captains?.length).length;
  const reachable = items.filter((t) => t.contact_count > 0).length;

  const header = (
    <View style={styles.extra}>
      {first ? (
        <CountStrip
          items={[
            { key: "total", label: "Takım", value: first.total, icon: "shield-outline" },
            { key: "contact", label: "Ulaşılır", value: reachable, tone: "info", icon: "call-outline", selected: hasContact, onPress: () => setHasContact((v) => !v) },
            { key: "nocap", label: "Başkansız", value: noCaptain, tone: noCaptain ? "warn" : undefined, icon: "alert-circle-outline" },
          ]}
        />
      ) : null}
      <ChipGroup scrollable contentPadding={0}>
        <Chip label={sortLabel} icon="swap-vertical" size="sm" onPress={() => setPicker("sort")} />
        <Chip
          label={city ?? "Tüm iller"}
          icon="location-outline"
          size="sm"
          selected={Boolean(city)}
          onPress={() => setPicker("city")}
          onDismiss={city ? () => setCity(null) : undefined}
        />
        <Chip label="İletişimi olanlar" icon="call-outline" size="sm" selected={hasContact} onPress={() => setHasContact((v) => !v)} />
      </ChipGroup>
      {!city && cityCounts.length > 1 ? (
        <ChipGroup scrollable contentPadding={0}>
          {cityCounts.map(([name, count]) => (
            <Chip key={name} label={name} count={count} size="sm" onPress={() => setCity(name)} />
          ))}
        </ChipGroup>
      ) : null}
      {recent.length && !q && !city ? (
        <View style={styles.recent}>
          <View style={styles.recentHead}>
            <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
            <Text style={styles.recentTitle} {...textScale.dense}>
              SON BAKILANLAR
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
            {recent.map((t) => (
              <Touchable key={t.team_id} onPress={() => open(t.team_id)} style={styles.recentItem} feedback="chip" accessibilityLabel={`${t.team_name} takım kartı`}>
                <TeamLogo name={t.team_name} logo={mediaUrl(t.logo)} size={22} />
                <Text style={styles.recentName} numberOfLines={1} {...textScale.dense}>
                  {t.team_name}
                </Text>
              </Touchable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <AdminList<DirectoryTeam>
        data={items}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => void query.refetch()}
        onEndReached={() => void query.fetchNextPage()}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Takım adı ara"
        extraHeader={header}
        summary={first ? `${items.length} / ${first.total} takım` : null}
        emptyIcon="shield-outline"
        emptyTitle={q || city || hasContact ? "Süzgece uyan takım yok" : "Takım yok"}
        emptyBody="Arama ya da il süzgecini değiştir."
        keyExtractor={(t) => String(t.team_id)}
        renderItem={({ item }) => <TeamDirectoryCard team={item} actions={actions} onPress={() => open(item.team_id)} />}
      />
      <OptionSheet<TeamSort>
        visible={picker === "sort"}
        onClose={() => setPicker(null)}
        title="Sıralama"
        options={TEAM_SORTS.map((s) => ({ value: s.key, label: s.label }))}
        value={sort}
        onSelect={(v) => {
          if (v) setSort(v as TeamSort);
          setPicker(null);
        }}
      />
      <OptionSheet<string>
        visible={picker === "city"}
        onClose={() => setPicker(null)}
        title="İl"
        options={cities.map((c) => ({ value: c, label: c }))}
        value={city}
        clearable
        searchable
        onSelect={(v) => {
          setCity((v as string | null) ?? null);
          setPicker(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  extra: { gap: space.sm },
  recent: { gap: space.xs },
  recentHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  recentTitle: { ...type.overline, color: colors.textTertiary },
  recentRow: { gap: space.s },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    maxWidth: 180,
  },
  recentName: { ...type.labelSm, color: colors.textPrimary, flexShrink: 1 },
});
