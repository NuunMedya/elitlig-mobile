/**
 * PublicAppeals — herkese açık disiplin başvuruları (Disiplin ▸ Başvurular).
 *
 * Web'deki Disiplin sayfasının "Başvurular" sekmesiyle aynı veri ve kurallar:
 * GET /api/penalties/public/appeals?city_id=. Başvurunun YALNIZCA nedeni
 * (kural hatası itirazı, cezalı oyuncu oynatılması…), tarafları ve aşaması
 * görünür. Takımın itiraz metni ve ekleri hiçbir zaman gelmez; karar metni
 * yalnız kurul "herkese açık" yayımladıysa gelir, aksi hâlde sunucu durumu
 * "decided" (Sonuçlandı) olarak gönderir.
 *
 * Süzgeç: Tümü / İncelemede / Kararlar. Satıra dokununca aşama ve karar alt
 * sayfada açılır.
 */

import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";
import { Badge, BottomSheet, Chip, ChipGroup, EmptyState, ErrorState, KeyValueRow, Skeleton, Touchable, useRefresh, type Tone } from "@/components/ui";
import { getPublicAppeals, type PublicAppeal } from "@/lib/api/panel";
import { formatDateShort } from "@/lib/format";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type Filter = "all" | "review" | "decided";

const STAGE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Başvuru alındı", tone: "warn" },
  in_review: { label: "İncelemede", tone: "warn" },
  accepted: { label: "Kabul edildi", tone: "win" },
  partially_accepted: { label: "Kısmen kabul edildi", tone: "win" },
  rejected: { label: "Reddedildi", tone: "danger" },
  decided: { label: "Sonuçlandı", tone: "neutral" },
};
const stageOf = (appeal: PublicAppeal) => STAGE[appeal.status] ?? STAGE.pending;

/** Lig / sezon seçimine uyan ya da o seviyesi boş kalan kayıtlar. */
const fits = (value: number | null | undefined, selected: number | null | undefined) => value == null || selected == null || Number(value) === Number(selected);

export function PublicAppeals({ cityId, leagueId, seasonId }: { cityId?: number | null; leagueId?: number | null; seasonId?: number | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<PublicAppeal | null>(null);

  const query = useQuery({
    queryKey: ["public", "appeals", cityId ?? null],
    queryFn: () => getPublicAppeals(cityId!),
    enabled: cityId != null,
    staleTime: 2 * 60_000,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const all = useMemo(
    () => (query.data ?? []).filter((item) => fits(item.league_id, leagueId) && fits(item.season_id, seasonId)),
    [query.data, leagueId, seasonId],
  );
  const decidedCount = all.filter((item) => item.is_decided).length;
  const visible = filter === "all" ? all : all.filter((item) => (filter === "decided" ? item.is_decided : !item.is_decided));

  return (
    <>
      <FlatList
        data={query.isLoading ? [] : visible}
        keyExtractor={(item) => item.public_id}
        refreshControl={refresh.control}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <ChipGroup scrollable contentPadding={0}>
              <Chip label="Tümü" count={all.length} size="sm" selected={filter === "all"} onPress={() => setFilter("all")} />
              <Chip label="İncelemede" count={all.length - decidedCount} size="sm" selected={filter === "review"} onPress={() => setFilter("review")} />
              <Chip label="Kararlar" count={decidedCount} size="sm" selected={filter === "decided"} onPress={() => setFilter("decided")} />
            </ChipGroup>
            <View style={styles.lock}>
              <Ionicons name="lock-closed" size={12} color={colors.textTertiary} />
              <Text style={styles.lockText} {...textScale.dense}>
                Başvurularda yalnızca itiraz nedeni yayımlanır; itiraz metni ve ekler gösterilmez.
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <View style={styles.skeleton}>
              <Skeleton height={84} radius="xl" />
              <Skeleton height={84} radius="xl" />
            </View>
          ) : query.isError ? (
            <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
          ) : (
            <EmptyState variant="inline" icon="scale-outline" title={all.length ? "Bu süzgeçte başvuru yok" : "Disiplin başvurusu yok"} />
          )
        }
        ItemSeparatorComponent={Gap}
        renderItem={({ item }) => {
          const stage = stageOf(item);
          return (
            <Touchable
              onPress={() => setDetail(item)}
              feedback="card"
              accessibilityRole="button"
              accessibilityLabel={[item.team_name, item.category_label, stage.label].filter(Boolean).join(", ")}
              style={styles.card}
            >
              <View style={styles.texts}>
                <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
                  {item.category_label}
                </Text>
                <Text style={styles.meta} numberOfLines={2} {...textScale.dense}>
                  {[item.team_name, item.match_label, formatDateShort(item.decided_at ?? item.createdAt)].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Badge label={stage.label} tone={stage.tone} size="sm" />
            </Touchable>
          );
        }}
      />

      <BottomSheet visible={detail != null} onClose={() => setDetail(null)} title="Disiplin başvurusu" snap="content">
        {detail ? (
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle} {...textScale.dense}>
              {detail.category_label}
            </Text>
            <Badge label={stageOf(detail).label} tone={stageOf(detail).tone} size="sm" />
            <View>
              <KeyValueRow label="Başvuran takım" value={detail.team_name ?? "—"} />
              {detail.opponent_team_name ? <KeyValueRow label="Rakip takım" value={detail.opponent_team_name} /> : null}
              {detail.match_label ? <KeyValueRow label="Maç" value={detail.match_label} /> : null}
              <KeyValueRow label="Başvuru tarihi" value={formatDateShort(detail.createdAt)} />
              {detail.is_decided && detail.decided_at ? <KeyValueRow label="Karar tarihi" value={formatDateShort(detail.decided_at)} /> : null}
            </View>
            <View style={styles.verdict}>
              <Text style={styles.verdictLabel} {...textScale.badge}>
                KARAR
              </Text>
              <Text style={styles.verdictText} {...textScale.long}>
                {detail.decision_text
                  ? detail.decision_text
                  : detail.is_decided
                    ? "Başvuru karara bağlanmış ve karar ilgili taraflara tebliğ edilmiştir."
                    : "Başvuru Merkez Disiplin Kurulunun incelemesindedir."}
              </Text>
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { paddingVertical: space.md, gap: space.sm },
  lock: { flexDirection: "row", alignItems: "center", gap: space.xs },
  lockText: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  skeleton: { gap: space.sm },
  gap: { height: space.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  texts: { flex: 1, minWidth: 0, gap: space.xxs },
  title: { ...type.h4, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  sheet: { gap: space.md, alignItems: "flex-start" },
  sheetTitle: { ...type.h3, color: colors.textPrimary },
  verdict: { alignSelf: "stretch", gap: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  verdictLabel: { ...type.nano, color: colors.textTertiary },
  verdictText: { ...type.label, color: colors.textPrimary },
});
