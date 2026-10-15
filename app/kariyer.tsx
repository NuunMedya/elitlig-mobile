/**
 * KARİYERİM — Kariyer Modu (GET /api/career/me).
 *
 *   Elit Seviye    üç katmandan XP: saha (gerçek maçlar), tribün (Tahmin Ligi,
 *                  katılım bildirimi), arena (doğrulanmış oyunlar). Saha dışı
 *                  XP seviyeyi en çok 30'a taşır; üstü sahadan gelir.
 *   Elit Kart      bağlı oyuncu kaydı varsa (yalnız sahadan hesaplanır).
 *   Haftalık görevler, Kupa Dolabı (rozetler), son XP hareketleri.
 *
 * Ekranın her açılışı sunucuda XP defterini eşitler; yeni açılan rozetler
 * bir bildirimle kutlanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EliteCard } from "@/components/career/EliteCard";
import {
  Button,
  Chip,
  ChipGroup,
  ErrorState,
  ScreenHeader,
  SkeletonCard,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import { getMyCareer, LAYER_LABELS, type CareerAchievement, type CareerLayer } from "@/lib/api/career";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

const LAYER_ICONS: Record<CareerLayer, keyof typeof Ionicons.glyphMap> = { saha: "football", tribun: "megaphone", arena: "game-controller" };
const LAYER_COLORS: Record<CareerLayer, string> = { saha: colors.win, tribun: colors.info, arena: colors.accent };

type Filter = "all" | CareerLayer;

export default function CareerScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [filter, setFilter] = useState<Filter>("all");

  const query = useQuery({ queryKey: ["career", "me"], queryFn: getMyCareer, enabled: Boolean(auth.user), staleTime: 30_000 });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const data = query.data;

  /* Yeni rozet: bir kez kutlanır (aynı yanıtı ikinci kez göstermez). */
  const celebrated = useRef(new Set<string>());
  useEffect(() => {
    const fresh = (data?.new_achievements ?? []).filter((code) => !celebrated.current.has(code));
    if (!fresh.length || !data) return;
    fresh.forEach((code) => celebrated.current.add(code));
    const titles = data.achievements.filter((item) => fresh.includes(item.code)).map((item) => item.title);
    toast.show({ message: `Yeni rozet: ${titles.join(", ")}`, tone: "success", icon: "trophy", haptic: "success" });
  }, [data, toast]);

  const achievements = useMemo(
    () =>
      (data?.achievements ?? [])
        .filter((item) => filter === "all" || item.layer === filter)
        .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progress / b.target - a.progress / a.target),
    [data, filter],
  );
  const unlockedCount = (data?.achievements ?? []).filter((item) => item.unlocked).length;

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Kariyerim" back scrollY={scrollY} />
      {query.isLoading ? (
        <View style={styles.pad}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={6} />
        </View>
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
          {/* ── Elit Seviye ── */}
          <View style={styles.card}>
            <View style={styles.levelRow}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelNumber} {...textScale.dense}>
                  {data.level.level}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.overline} {...textScale.badge}>
                  {upperTR("Elit Seviye")}
                </Text>
                <Text style={styles.title} {...textScale.dense}>
                  {data.level.next ? `${data.level.xp.toLocaleString("tr-TR")} / ${data.level.next.toLocaleString("tr-TR")} XP` : "En üst seviye"}
                </Text>
              </View>
            </View>
            <Bar value={data.level.progress} color={colors.accent} />
            {(["saha", "tribun", "arena"] as CareerLayer[]).map((layer) => (
              <View key={layer} style={styles.layerRow}>
                <Ionicons name={LAYER_ICONS[layer]} size={16} color={LAYER_COLORS[layer]} />
                <Text style={styles.layerLabel} {...textScale.dense}>
                  {LAYER_LABELS[layer]}
                </Text>
                <Text style={styles.layerValue} {...textScale.dense}>
                  {`${(data.layers[layer] ?? 0).toLocaleString("tr-TR")} XP`}
                </Text>
              </View>
            ))}
            <Text style={styles.hint} {...textScale.long}>
              {data.level.fan_capped
                ? `Tribün ve arena XP'si seviye ${data.level.fan_level_cap}'a kadar sayılır. Daha yukarısı sahadaki maçlarınla açılır.`
                : `Gerçek maçlar en çok XP'yi getirir. Tribün ve arena XP'si seviye ${data.level.fan_level_cap}'a kadar sayılır; oyunlar piyasa değerini etkilemez.`}
            </Text>
          </View>

          {/* ── Elit Kart ── */}
          {data.card ? (
            <EliteCard card={data.card} level={data.level.level} />
          ) : (
            <View style={styles.card}>
              <Text style={styles.title} {...textScale.dense}>
                Elit Kartın seni bekliyor
              </Text>
              <Text style={styles.hint} {...textScale.long}>
                Oyuncu profilini bağla; maç istatistiklerinden kartın oluşsun, saha XP'si kazanmaya başla.
              </Text>
              <Button label="Oyuncu profilimi bağla" icon="link-outline" variant="secondary" onPress={() => router.push("/oyuncum/bagla")} />
            </View>
          )}

          {/* ── Haftalık görevler ── */}
          <Text style={styles.section} {...textScale.badge}>
            {upperTR(`Haftalık görevler · ${formatDateShort(data.week.ends_at)} sıfırlanır`)}
          </Text>
          <View style={styles.card}>
            {data.quests.map((quest, index) => (
              <View key={quest.code} style={[styles.quest, index > 0 && styles.questBorder]}>
                <Ionicons
                  name={quest.done ? "checkmark-circle" : LAYER_ICONS[quest.layer]}
                  size={22}
                  color={quest.done ? colors.win : LAYER_COLORS[quest.layer]}
                />
                <View style={styles.flex}>
                  <Text style={styles.questTitle} {...textScale.dense}>
                    {quest.title}
                  </Text>
                  <Text style={styles.hint} {...textScale.long}>
                    {quest.description}
                  </Text>
                  <Bar value={quest.progress / quest.target} color={quest.done ? colors.win : LAYER_COLORS[quest.layer]} />
                </View>
                <Text style={styles.xp} {...textScale.dense}>
                  {quest.done ? "Tamam" : `+${quest.xp}`}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.actions}>
            <Button label="Tahmin Ligi" icon="podium-outline" variant="secondary" size="sm" onPress={() => router.push("/tahmin-ligi")} style={styles.flex} />
            <Button label="Arena" icon="game-controller-outline" variant="secondary" size="sm" onPress={() => router.push("/(tabs)/oyunlar")} style={styles.flex} />
          </View>

          {/* ── Kupa Dolabı ── */}
          <Text style={styles.section} {...textScale.badge}>
            {upperTR(`Kupa dolabı · ${unlockedCount}/${data.achievements.length}`)}
          </Text>
          <ChipGroup contentPadding={0}>
            <Chip size="sm" label="Tümü" selected={filter === "all"} onPress={() => setFilter("all")} />
            {(["saha", "tribun", "arena"] as CareerLayer[]).map((layer) => (
              <Chip key={layer} size="sm" label={LAYER_LABELS[layer]} selected={filter === layer} onPress={() => setFilter(layer)} />
            ))}
          </ChipGroup>
          <View style={styles.grid}>
            {achievements.map((item) => (
              <Badge key={item.code} item={item} />
            ))}
          </View>

          {/* ── Son hareketler ── */}
          {data.recent.length ? (
            <>
              <Text style={styles.section} {...textScale.badge}>
                {upperTR("Son XP hareketleri")}
              </Text>
              <View style={styles.card}>
                {data.recent.map((row, index) => (
                  <View key={`${row.source}-${index}`} style={[styles.recent, index > 0 && styles.questBorder]}>
                    <Ionicons name={LAYER_ICONS[row.layer]} size={14} color={LAYER_COLORS[row.layer]} />
                    <Text style={[styles.flex, styles.recentLabel]} numberOfLines={1} {...textScale.dense}>
                      {row.label ?? row.source}
                    </Text>
                    <Text style={styles.xp} {...textScale.dense}>
                      {`+${row.xp}`}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={styles.bar}>
      <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

const Badge = React.memo(function Badge({ item }: { item: CareerAchievement }) {
  const color = item.unlocked ? LAYER_COLORS[item.layer] : colors.textTertiary;
  return (
    <View style={[styles.badge, item.unlocked && { borderColor: color }]} accessible accessibilityLabel={`${item.title}: ${item.unlocked ? "açıldı" : `${item.progress}/${item.target}`}`}>
      <Ionicons name={item.unlocked ? "trophy" : "lock-closed-outline"} size={22} color={color} />
      <Text style={[styles.badgeTitle, !item.unlocked && styles.locked]} numberOfLines={2} {...textScale.dense}>
        {item.title}
      </Text>
      <Text style={styles.badgeMeta} numberOfLines={2} {...textScale.dense}>
        {item.unlocked ? `+${item.xp} XP` : `${item.progress.toLocaleString("tr-TR")}/${item.target.toLocaleString("tr-TR")}`}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pad: { padding: layout.screenPadding, gap: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant, gap: space.md },
  card: {
    gap: space.s,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  levelRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  levelBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  levelNumber: { ...type.scoreLg, color: colors.onDark },
  overline: { ...type.overline, color: colors.textTertiary },
  title: { ...type.h3, color: colors.textPrimary },
  hint: { ...type.caption, color: colors.textSecondary },
  layerRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  layerLabel: { ...type.label, color: colors.textPrimary, flex: 1 },
  layerValue: { ...type.label, color: colors.textSecondary },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.s },
  quest: { flexDirection: "row", alignItems: "flex-start", gap: space.s, paddingVertical: space.s },
  questBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  questTitle: { ...type.label, color: colors.textPrimary },
  xp: { ...type.label, color: colors.accentText },
  actions: { flexDirection: "row", gap: space.sm },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: "hidden", marginTop: space.xs },
  barFill: { height: 6, borderRadius: radius.pill },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  badge: {
    width: "31%",
    minHeight: 104,
    alignItems: "center",
    gap: space.xs,
    padding: space.s,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  badgeTitle: { ...type.label, color: colors.textPrimary, textAlign: "center" },
  locked: { color: colors.textTertiary },
  badgeMeta: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
  recent: { flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.s },
  recentLabel: { ...type.caption, color: colors.textSecondary },
});
