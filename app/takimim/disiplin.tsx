/**
 * DİSİPLİN SÜREÇLERİ — takımın disiplin dosyaları; savunma ve itiraz.
 * `/takimim/disiplin?durum=aksiyon`
 *
 * Web: pages/panel/TeamPenaltyDefense.js. Liste GET /api/penalties/mine'dan
 * gelir; sunucu her dosya için üyenin hangi SIFATLA savunma yapabileceğini
 * (`available_sides`) döndürür. Takım ekranı yalnız "team" sıfatı olan
 * dosyaları gösterir — oyuncunun kişisel cezaları Kariyerim'dedir. Savunma ve
 * itiraz metni dosya ekranında (`/ceza/[id]`) yazılır; o ekran sıfat seçimini
 * zaten `available_sides` ile yapar.
 *
 * "Süre işliyor" kuralı Kulübüm'deki dikkat kartıyla AYNIDIR
 * (useClubSignals.penaltyNeedsAction) — iki yerde farklı sayı çıkmaz.
 *
 * TASARIM (gece teması): üstte iki sayı (süresi işleyen · toplam) ve
 * SegmentedControl. DOSYA KARTI: durum IconTile'ı (süre işliyorsa kırmızı),
 * oyuncu/takım adı + maç, durum hapı; varsa kurul kararı kutusu ve son gün
 * satırı (24 saatten az kaldıysa kırmızı). Süresi işleyen kart sol şeritli.
 */

import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { penaltyNeedsAction } from "@/components/club/useClubSignals";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Badge,
  EmptyState,
  ErrorState,
  IconTile,
  MetricGrid,
  MetricTile,
  Reveal,
  ScreenHeader,
  SegmentedControl,
  Skeleton,
  Touchable,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import { getMyPenalties, type Penalty } from "@/lib/api/panel";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type Filter = "aksiyon" | "tumu";
function deadlineOf(penalty: Penalty): { text: string; urgent: boolean } | null {
  const open = (value: string | null) => Boolean(value && new Date(value).getTime() > Date.now());
  const left = (value: string | null) => {
    const hours = Math.floor((new Date(value ?? "").getTime() - Date.now()) / 3_600_000);
    return { label: hours < 24 ? `${Math.max(hours, 1)} saat kaldı` : `${Math.floor(hours / 24)} gün kaldı`, urgent: hours < 24 };
  };
  if (open(penalty.defense_deadline_at)) {
    const l = left(penalty.defense_deadline_at);
    return { text: `Savunma son gün ${formatDateShort(penalty.defense_deadline_at)} · ${l.label}`, urgent: l.urgent };
  }
  if (penalty.status === "kurul_karari" && open(penalty.objection_deadline_at)) {
    const l = left(penalty.objection_deadline_at);
    return { text: `İtiraz son gün ${formatDateShort(penalty.objection_deadline_at)} · ${l.label}`, urgent: l.urgent };
  }
  return null;
}

export default function TeamDisciplineScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ durum?: string }>();
  const [filter, setFilter] = useState<Filter>(params.durum === "aksiyon" ? "aksiyon" : "tumu");

  // Anahtar cezalarim/ceza/[id] ile ortak: bir savunma gönderilince liste tazelenir.
  const query = useQuery({
    queryKey: ["panel", "penalties"],
    queryFn: getMyPenalties,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const teamItems = useMemo(
    () => (query.data?.items ?? []).filter((item) => item.available_sides?.includes("team") || item.viewer_side === "team"),
    [query.data],
  );
  const actionable = teamItems.filter(penaltyNeedsAction);
  const visible = filter === "aksiyon" ? actionable : teamItems;

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Disiplin süreçleri" subtitle="Takımının disiplin dosyaları" back scrollY={scrollY} />
      <FlatList
        {...scrollProps}
        data={query.isLoading ? [] : visible}
        keyExtractor={(item) => item.public_id}
        refreshControl={refresh.control}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            {!query.isLoading ? (
              <MetricGrid columns={2}>
                <MetricTile label="Süre işleyen" value={String(actionable.length)} icon="alarm" tone={actionable.length ? "danger" : "neutral"} />
                <MetricTile label="Toplam dosya" value={String(teamItems.length)} icon="folder-open" />
              </MetricGrid>
            ) : null}
            <SegmentedControl
              items={[
                { key: "aksiyon", label: `Süre işleyen${actionable.length ? ` (${actionable.length})` : ""}` },
                { key: "tumu", label: `Tümü${teamItems.length ? ` (${teamItems.length})` : ""}` },
              ]}
              value={filter}
              onChange={(next) => setFilter(next as Filter)}
            />
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <View style={styles.skeleton}>
              <Skeleton height={130} radius="xl" />
              <Skeleton height={130} radius="xl" />
            </View>
          ) : query.isError ? (
            <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
          ) : (
            <EmptyState
              variant="inline"
              icon="shield-checkmark-outline"
              title={filter === "aksiyon" ? "Süresi işleyen dosya yok" : "Disiplin dosyası yok"}
              body="Takımın hakkında açılan dosyalar ve kurul kararları burada listelenir."
            />
          )
        }
        ItemSeparatorComponent={Gap}
        renderItem={({ item, index }) => (
          <Reveal index={index} limit={6} distance={8}>
            <PenaltyCard penalty={item} onPress={() => router.push(`/ceza/${item.public_id}` as Href)} />
          </Reveal>
        )}
      />
    </SafeAreaView>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const PenaltyCard = React.memo(function PenaltyCard({ penalty, onPress }: { penalty: Penalty; onPress: () => void }) {
  const deadline = deadlineOf(penalty);
  const banned = penalty.ban_state === "active";
  return (
    <Touchable
      onPress={onPress}
      feedback="card"
      accessibilityRole="button"
      accessibilityLabel={[penalty.player_name ?? penalty.team_name, penalty.status_label, deadline?.text].filter(Boolean).join(", ")}
      style={[styles.card, deadline && styles.cardAction]}
    >
      {deadline ? <View style={styles.stripe} /> : null}
      <View style={styles.top}>
        <IconTile
          icon={deadline ? "alert-circle" : penalty.disiplin_karari ? "hammer" : "document-text"}
          tone={deadline ? "red" : penalty.disiplin_karari ? "gold" : "neutral"}
          size={40}
          glow={false}
        />
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {penalty.player_name ?? `${penalty.team_name ?? "Takım"} (takım dosyası)`}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {[penalty.match_label, penalty.match_date ? formatDateShort(penalty.match_date) : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Badge label={penalty.status_label} tone={deadline ? "danger" : "neutral"} size="sm" />
      </View>
      {penalty.disiplin_karari ? (
        <View style={styles.verdict}>
          <Text style={styles.verdictLabel} {...textScale.badge}>
            KARAR
          </Text>
          <Text style={styles.verdictText} numberOfLines={2} {...textScale.dense}>
            {penalty.disiplin_karari}
          </Text>
          {banned ? <Badge label={penalty.ban_end_at ? `Ceza ${formatDateShort(penalty.ban_end_at)}'e dek` : "Ceza sürüyor"} tone="danger" size="xs" /> : null}
        </View>
      ) : null}
      {deadline ? (
        <View style={styles.deadline}>
          <Ionicons name="time-outline" size={14} color={deadline.urgent ? colors.danger : colors.warn} />
          <Text style={[styles.deadlineText, { color: deadline.urgent ? colors.danger : colors.warn }]} numberOfLines={1} {...textScale.dense}>
            {deadline.text}
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  header: { paddingVertical: space.md, gap: space.md },
  skeleton: { gap: space.md },
  gap: { height: space.sm },
  card: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardAction: { borderColor: colors.glassLine },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.danger },
  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  texts: { flex: 1, minWidth: 0, gap: space.xxs },
  title: { ...type.h4, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  verdict: { gap: space.xs, padding: space.sm, paddingHorizontal: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2, alignItems: "flex-start" },
  verdictLabel: { ...type.nano, color: colors.textTertiary },
  verdictText: { ...type.label, color: colors.textPrimary },
  deadline: { flexDirection: "row", alignItems: "center", gap: space.xs },
  deadlineText: { ...type.labelSm, flexShrink: 1 },
});
