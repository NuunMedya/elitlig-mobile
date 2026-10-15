/**
 * KARİYERİM — Kariyer Modu (GET /api/career/me).
 *
 *   Elit Seviye    üç katmandan XP: Saha (gerçek maçlar), Seyirci (Tahmin
 *                  Ligi, taraftar oyu, tepkiler, Fantezi), Oyunlar
 *                  (doğrulanmış oyunlar). Katman XP'si haftalık ya da tüm
 *                  zamanlar olarak görülür. Saha dışı XP seviyeyi en çok 30'a
 *                  taşır; üstü sahadan gelir.
 *   Elit Kart      bağlı oyuncu kaydı varsa (yalnız sahadan hesaplanır).
 *   Haftalık görevler  20 görevlik sıra; aynı anda 5 açık, biten yerine
 *                  sıradaki gelir; 10 ve 20 görevde bonus.
 *   Kariyer görevleri  tüm zamanlar, kademeli (bir kademe bitince üstü açılır).
 *   XP nasıl kazanılır (standart XP), Kupa Dolabı (rozetler), son XP hareketleri.
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
  SegmentedControl,
  SkeletonCard,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import {
  getMyCareer,
  LAYER_LABELS,
  type CareerAchievement,
  type CareerChain,
  type CareerLayer,
  type CareerQuest,
  type StandardXpRule,
} from "@/lib/api/career";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

const LAYER_ICONS: Record<CareerLayer, keyof typeof Ionicons.glyphMap> = { saha: "football", tribun: "megaphone", arena: "game-controller" };
const LAYER_COLORS: Record<CareerLayer, string> = { saha: colors.win, tribun: colors.info, arena: colors.accent };

const LAYER_ORDER: CareerLayer[] = ["saha", "tribun", "arena"];
const CHAIN_PREVIEW = 5;

type Filter = "all" | CareerLayer;
type Period = "week" | "all";

export default function CareerScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [filter, setFilter] = useState<Filter>("all");
  const [period, setPeriod] = useState<Period>("week");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAllChains, setShowAllChains] = useState(false);
  const [showRules, setShowRules] = useState(false);

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

  // Eski sunucu weekly_quests göndermez: düz listeden kurulur.
  const weekly = useMemo(() => {
    if (data?.weekly_quests) return data.weekly_quests;
    const quests = data?.quests ?? [];
    const completed = quests.filter((quest) => quest.done);
    return { active: quests.filter((quest) => !quest.done), completed, revealed: quests.length, total: quests.length, done_count: completed.length, locked: 0, bonuses: [] };
  }, [data]);

  // Kariyer görevleri: bitmeye en yakın olanlar önce; tamamen bitenler sonda.
  const chains = useMemo(
    () =>
      [...(data?.career_quests ?? [])].sort(
        (a, b) => Number(a.done) - Number(b.done) || b.progress / b.target - a.progress / a.target,
      ),
    [data],
  );
  const visibleChains = showAllChains ? chains : chains.slice(0, CHAIN_PREVIEW);
  const layerXp = period === "week" && data?.layers_week ? data.layers_week : data?.layers;

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
            {data.layers_week ? (
              <SegmentedControl
                size="sm"
                stretch
                items={[
                  { key: "week", label: "Bu hafta" },
                  { key: "all", label: "Tüm zamanlar" },
                ]}
                value={period}
                onChange={setPeriod}
              />
            ) : null}
            {LAYER_ORDER.map((layer) => (
              <View key={layer} style={styles.layerRow}>
                <Ionicons name={LAYER_ICONS[layer]} size={16} color={LAYER_COLORS[layer]} />
                <Text style={styles.layerLabel} {...textScale.dense}>
                  {LAYER_LABELS[layer]}
                </Text>
                <Text style={styles.layerValue} {...textScale.dense}>
                  {`${period === "week" && data.layers_week ? "+" : ""}${(layerXp?.[layer] ?? 0).toLocaleString("tr-TR")} XP`}
                </Text>
              </View>
            ))}
            <Text style={styles.hint} {...textScale.long}>
              {data.level.fan_capped
                ? `Seyirci ve oyun XP'si seviye ${data.level.fan_level_cap}'a kadar sayılır. Daha yukarısı sahadaki maçlarınla açılır.`
                : `Gerçek maçlar en çok XP'yi getirir. Seyirci ve oyun XP'si seviye ${data.level.fan_level_cap}'a kadar sayılır; oyunlar piyasa değerini etkilemez.`}
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
            {upperTR(`Haftalık görevler · ${formatDateShort(data.week.ends_at)} yenilenir`)}
          </Text>
          <View style={styles.card}>
            <View style={styles.layerRow}>
              <Text style={styles.questTitle} {...textScale.dense}>
                {`${weekly.done_count}/${weekly.total} görev tamam`}
              </Text>
              <View style={styles.flex} />
              {weekly.bonuses.map((bonus) => (
                <View key={bonus.at} style={[styles.bonus, bonus.earned && styles.bonusEarned]}>
                  <Ionicons name={bonus.earned ? "gift" : "gift-outline"} size={12} color={bonus.earned ? colors.win : colors.textTertiary} />
                  <Text style={[styles.bonusText, bonus.earned && styles.bonusTextEarned]} {...textScale.badge}>
                    {`${bonus.at} · +${bonus.xp}`}
                  </Text>
                </View>
              ))}
            </View>
            <Bar value={weekly.total ? weekly.done_count / weekly.total : 0} color={colors.win} />
            {weekly.active.map((quest, index) => (
              <QuestRow key={quest.code} quest={quest} first={index === 0} />
            ))}
            {!weekly.active.length ? (
              <Text style={styles.hint} {...textScale.long}>
                Bu haftanın bütün görevlerini bitirdin. Yeni görevler Pazartesi gelir.
              </Text>
            ) : null}
            <Text style={styles.hint} {...textScale.long}>
              {weekly.locked
                ? `Bir görevi bitirdiğinde yerine yenisi gelir · sırada ${weekly.locked} görev daha var.`
                : "Bu haftanın bütün görevleri açıldı."}
            </Text>
            {weekly.completed.length ? (
              <>
                <Button
                  label={showCompleted ? "Tamamlananları gizle" : `Tamamlananlar (${weekly.completed.length})`}
                  icon={showCompleted ? "chevron-up" : "chevron-down"}
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowCompleted((value) => !value)}
                />
                {showCompleted ? weekly.completed.map((quest) => <QuestRow key={quest.code} quest={quest} />) : null}
              </>
            ) : null}
          </View>

          {/* ── Kariyer görevleri (tüm zamanlar) ── */}
          {chains.length ? (
            <>
              <Text style={styles.section} {...textScale.badge}>
                {upperTR(`Kariyer görevleri · tüm zamanlar · ${chains.reduce((sum, chain) => sum + chain.completed_tiers, 0)} kademe`)}
              </Text>
              <View style={styles.card}>
                {visibleChains.map((chain, index) => (
                  <ChainRow key={chain.code} chain={chain} first={index === 0} />
                ))}
                {chains.length > CHAIN_PREVIEW ? (
                  <Button
                    label={showAllChains ? "Daha az göster" : `Tümünü gör (${chains.length})`}
                    icon={showAllChains ? "chevron-up" : "chevron-down"}
                    variant="ghost"
                    size="sm"
                    onPress={() => setShowAllChains((value) => !value)}
                  />
                ) : null}
              </View>
            </>
          ) : null}

          <View style={styles.actions}>
            <Button label="Tahmin Ligi" icon="podium-outline" variant="secondary" size="sm" onPress={() => router.push("/tahmin-ligi")} style={styles.flex} />
            <Button label="Fantezi" icon="people-outline" variant="secondary" size="sm" onPress={() => router.push("/fantezi")} style={styles.flex} />
            <Button label="Oyunlar" icon="game-controller-outline" variant="secondary" size="sm" onPress={() => router.push("/(tabs)/oyunlar")} style={styles.flex} />
          </View>
          {data.card ? (
            <Button label="Sezon Özetim" icon="sparkles-outline" variant="secondary" onPress={() => router.push("/sezon-ozeti")} />
          ) : null}

          {/* ── XP nasıl kazanılır ── */}
          {data.rules.standard?.length ? (
            <View style={styles.card}>
              <Button
                label="XP nasıl kazanılır?"
                icon={showRules ? "chevron-up" : "information-circle-outline"}
                variant="ghost"
                size="sm"
                onPress={() => setShowRules((value) => !value)}
              />
              {showRules ? <XpRules rules={data.rules.standard} /> : null}
            </View>
          ) : null}

          {/* ── Kupa Dolabı ── */}
          <Text style={styles.section} {...textScale.badge}>
            {upperTR(`Kupa dolabı · ${unlockedCount}/${data.achievements.length}`)}
          </Text>
          <ChipGroup contentPadding={0}>
            <Chip size="sm" label="Tümü" selected={filter === "all"} onPress={() => setFilter("all")} />
            {LAYER_ORDER.map((layer) => (
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

function QuestRow({ quest, first }: { quest: CareerQuest; first?: boolean }) {
  const color = quest.done ? colors.win : LAYER_COLORS[quest.layer];
  return (
    <View style={[styles.quest, !first && styles.questBorder]}>
      <Ionicons name={quest.done ? "checkmark-circle" : LAYER_ICONS[quest.layer]} size={22} color={color} />
      <View style={styles.flex}>
        <Text style={styles.questTitle} {...textScale.dense}>
          {quest.title}
        </Text>
        <Text style={styles.hint} {...textScale.long}>
          {`${LAYER_LABELS[quest.layer]} · ${quest.description}`}
        </Text>
        <Bar value={quest.progress / quest.target} color={color} />
      </View>
      <Text style={styles.xp} {...textScale.dense}>
        {quest.done ? "Tamam" : `+${quest.xp}`}
      </Text>
    </View>
  );
}

function ChainRow({ chain, first }: { chain: CareerChain; first?: boolean }) {
  const color = chain.done ? colors.win : LAYER_COLORS[chain.layer];
  return (
    <View style={[styles.quest, !first && styles.questBorder]}>
      <Ionicons name={chain.done ? "medal" : LAYER_ICONS[chain.layer]} size={22} color={color} />
      <View style={styles.flex}>
        <Text style={styles.questTitle} {...textScale.dense}>
          {`${chain.title} · ${chain.tier}/${chain.tiers}. kademe`}
        </Text>
        <Text style={styles.hint} {...textScale.long}>
          {chain.done
            ? `Bütün kademeler tamam · ${chain.value.toLocaleString("tr-TR")}`
            : `${chain.description} · ${chain.progress.toLocaleString("tr-TR")}/${chain.target.toLocaleString("tr-TR")}`}
        </Text>
        <Bar value={chain.progress / chain.target} color={color} />
      </View>
      <Text style={styles.xp} {...textScale.dense}>
        {chain.done ? "Tamam" : `+${chain.xp}`}
      </Text>
    </View>
  );
}

function XpRules({ rules }: { rules: StandardXpRule[] }) {
  return (
    <>
      {LAYER_ORDER.map((layer) => {
        const list = rules.filter((rule) => rule.layer === layer);
        if (!list.length) return null;
        return (
          <View key={layer} style={styles.rules}>
            <View style={styles.layerRow}>
              <Ionicons name={LAYER_ICONS[layer]} size={14} color={LAYER_COLORS[layer]} />
              <Text style={styles.questTitle} {...textScale.dense}>
                {LAYER_LABELS[layer]}
              </Text>
            </View>
            {list.map((rule) => (
              <View key={rule.label} style={styles.ruleRow}>
                <Text style={[styles.flex, styles.recentLabel]} {...textScale.long}>
                  {rule.label}
                </Text>
                <Text style={styles.xp} {...textScale.dense}>
                  {`+${rule.xp}`}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </>
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
  rules: { gap: space.xs, paddingTop: space.s },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  bonus: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.s,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  bonusEarned: { borderColor: colors.win },
  bonusText: { ...type.overline, color: colors.textTertiary },
  bonusTextEarned: { color: colors.win },
});
