/**
 * GÖREVLER — haftalık görevlerin tam ekranı (/gorevler).
 *
 * EKONOMİ (bu ekranın anlatması gereken ayrım):
 *   · XP yalnız SAHADAN (gerçek maç performansı) ve GÖREVLERDEN gelir →
 *     Elit Seviye ve XP sıralaması (Saha sıralaması ▸ XP).
 *   · YILDIZ oyunlardan gelir (bulmaca, arcade, bilgi, Tahmin Ligi, Fantezi)
 *     → Kulüp Şehri. XP de yıldıza çevrilir: 10 XP = 1 yıldız (Kulüp
 *     Şehri'nde "Yıldızları topla"). Oyunlar doğrudan XP VERMEZ; oyun
 *     oynatan GÖREVLER XP verir.
 *
 * NE (yukarıdan aşağı):
 *   · SAHNE: bu haftanın XP'si, görev halkası (biten / toplam), Elit Seviye
 *     ilerlemesi, XP sıralamasındaki yerin (dokununca Saha sıralaması ▸ XP),
 *     bekleyen ödül ve haftanın yenilenmesine kalan süre (sunucu saatiyle).
 *   · BONUS YOLU ve HAFTANIN OYUNU.
 *   · SEKMELER: Hepsi · Saha · Oyun · Şehir · Tribün (açık görev sayılarıyla);
 *     kartta kategori rengi / simgesi, zorluk, ilerleme (2 / 5 maç), ödül
 *     (+XP, varsa +yıldız) ve görevin yapıldığı ekrana giden "Yap".
 *   · TAKIM GÖREVLERİ, TAMAMLANANLAR (yeni bitenler kutlanır), "XP ve
 *     Yıldız" açıklama kartı ve XP kuralları.
 *
 * ÖDÜL: görev XP'si (ve varsa yıldızı) sunucuda kendiliğinden yazılır (ayrı
 * "ödülü al" adımı yok, iki kez alınamaz). Yeni biten görevler bu ekran
 * açıldığında bir kez toast + titreşim + kart kutlamasıyla gösterilir
 * (components/quests/useQuestCelebration).
 *
 * ESKİ SUNUCU: `category`, `route`, `rewardXp`, `rewardStars`, `unit`,
 * `difficulty` gelmeyebilir; lib/api/career.ts normalizeQuest eksikleri eski
 * alanlardan doldurur, lib/quests.ts yedek rota haritasını tutar.
 *
 * Yönetim sekmesinin tepesindeki vitrin (components/quests/QuestSpotlight)
 * buraya açılır. Veri Elit Kariyer ile aynı önbellekten (["career","me"]).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LinearGradient } from "expo-linear-gradient";
import { QUEST_TILE_TONE, QuestCard, questGradient } from "@/components/quests/QuestCard";
import { QuestBar, QuestRing } from "@/components/quests/QuestProgress";
import { useQuestCelebration } from "@/components/quests/useQuestCelebration";
import {
  Aurora,
  Button,
  EmptyState,
  ErrorState,
  GradientBar,
  IconTile,
  Odometer,
  Reveal,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  SkeletonCard,
  Touchable,
  useHeaderScroll,
  useRefresh,
  withAlpha,
} from "@/components/ui";
import { getMyCareer, getMyTeamQuests, getXpLeaderboard, type CareerQuest, type TeamQuest } from "@/lib/api/career";
import { questTone } from "@/lib/questPalette";
import type { QuestCategory } from "@/lib/api/career";
import {
  LAYER_ICON,
  QUEST_CATEGORY_BLURB,
  QUEST_CATEGORY_ICON,
  QUEST_CATEGORY_LABEL,
  QUEST_CATEGORY_ORDER,
  XP_PER_STAR,
  categoryCounts,
  categoryOf,
  earnedStars,
  earnedXp,
  endsSoon,
  gameRoute,
  nextBonus,
  openStars,
  openXp,
  questRoute,
  serverNow,
  sortForList,
  timeLeft,
  weekXp,
  weeklyOf,
  xpToNextLevel,
  type CategoryCount,
  type QuestTab,
} from "@/lib/quests";
import { useAuth } from "@/providers/AuthProvider";
import { animateNextLayout, colors, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

type Filter = "all" | QuestTab;

const formatInt = (value: number) => value.toLocaleString("tr-TR");

/** Dakikada bir tazelenen saat — kalan süre ekranda donmasın. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function QuestsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [filter, setFilter] = useState<Filter>("all");
  const [teamPeriod, setTeamPeriod] = useState<"week" | "month">("week");
  const [showDone, setShowDone] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const clock = useMinuteClock();

  const signedIn = Boolean(auth.user);
  const query = useQuery({ queryKey: ["career", "me"], queryFn: getMyCareer, enabled: signedIn, staleTime: 30_000 });
  const team = useQuery({ queryKey: ["career", "team"], queryFn: getMyTeamQuests, enabled: signedIn, staleTime: 30_000, retry: false });
  /* XP sıralamasındaki yer (bu hafta): sahnedeki "Sıralama" kutusu. Gelmezse kutu "—" der. */
  const rank = useQuery({
    queryKey: ["career", "xp-rank", "week"],
    queryFn: () => getXpLeaderboard({ period: "week" }),
    enabled: signedIn,
    staleTime: 60_000,
    retry: false,
  });
  const { refetch: refetchCareer } = query;
  const { refetch: refetchTeam } = team;
  const { refetch: refetchRank } = rank;

  /* Bir görevi yapıp geri dönünce ilerleme tazelensin (oyun, tahmin, şehir…). */
  useFocusEffect(
    useCallback(() => {
      if (signedIn) void refetchCareer();
    }, [signedIn, refetchCareer])
  );

  const refresh = useRefresh(
    () => {
      void refetchCareer();
      void refetchTeam();
      void refetchRank();
    },
    { refreshing: query.isRefetching && !query.isLoading }
  );

  const data = query.data;
  const fresh = useQuestCelebration(data, auth.user?.id ?? null);
  const weekly = useMemo(() => (data ? weeklyOf(data) : null), [data]);
  const counts = useMemo(() => (weekly ? categoryCounts(weekly) : []), [weekly]);
  const active = useMemo(() => {
    if (!weekly) return [];
    const list = sortForList(weekly.active);
    return filter === "all" ? list : list.filter((quest) => categoryOf(quest) === filter);
  }, [filter, weekly]);
  const completed = useMemo(() => {
    if (!weekly) return [];
    /* Yeni bitenler en üstte. */
    return [...weekly.completed].sort((a, b) => Number(fresh.has(b.code)) - Number(fresh.has(a.code)));
  }, [weekly, fresh]);

  const open = useCallback(
    (quest: CareerQuest) => {
      const route = questRoute(quest);
      if (route) router.push(route);
    },
    [router]
  );

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Görevler" back />
        <EmptyState
          icon="flash-outline"
          title="Haftalık görevler üyelere açık"
          body="Giriş yap; saha, oyun, şehir ve tribün görevleriyle her hafta XP kazan, Elit Seviye'ni yükselt."
          action={{ label: "Giriş yap", onPress: () => router.push("/giris") }}
        />
      </SafeAreaView>
    );
  }

  const now = data ? serverNow(data.week?.server_time, query.dataUpdatedAt, clock) : clock;
  const left = data ? timeLeft(data.week?.ends_at, now) : null;
  const soon = data ? endsSoon(data.week?.ends_at, now) : false;
  const featuredRoute = weekly?.featured ? gameRoute(weekly.featured.game) : null;
  const myRank = rank.data?.me?.rank ?? null;
  const thisWeek = data ? weekXp(data) : null;
  const pendingXp = weekly ? openXp(weekly) : 0;
  const pendingStars = weekly ? openStars(weekly) : 0;
  const toNext = data ? xpToNextLevel(data.level) : null;
  const selected = filter === "all" ? null : counts.find((item) => item.key === filter);
  const rules = (data?.rules.standard ?? []).filter((rule) => rule.layer !== "arena");

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Haftalık görevler" subtitle="Görev bitir, XP kazan, sıralamada yüksel" back scrollY={scrollY} />
      {query.isLoading ? (
        <View style={styles.pad}>
          <Skeleton height={236} radius="xxl" />
          <Skeleton height={64} radius="xl" />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      ) : query.isError || !data || !weekly ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control} showsVerticalScrollIndicator={false}>
          {/* SAHNE */}
          <Reveal index={0}>
            <View style={styles.hero}>
              <LinearGradient colors={colors.gradientInk} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Aurora variant="stage" style={StyleSheet.absoluteFill} />
              <View style={styles.heroBadges}>
                <View style={styles.weekPill}>
                  <Ionicons name="calendar-outline" size={12} color={colors.brandOnDark} />
                  <Text style={styles.weekPillText} {...textScale.badge}>
                    {upperTR("Bu hafta")}
                  </Text>
                </View>
                {left ? (
                  <View style={[styles.timePill, soon ? styles.timePillSoon : null]}>
                    <Ionicons name="time-outline" size={12} color={soon ? colors.yellowCard : colors.onDarkMuted} />
                    <Text style={[styles.timeText, soon ? styles.timeTextSoon : null]} {...textScale.badge}>
                      Yenilenmeye {left}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.heroTop}>
                <View style={styles.flex}>
                  <Text style={styles.heroOverline} {...textScale.badge}>
                    {upperTR("Bu haftaki XP'n")}
                  </Text>
                  <View style={styles.heroXpRow} accessible accessibilityLabel={`Bu hafta ${thisWeek ?? earnedXp(weekly)} XP`}>
                    <Text style={styles.heroXp} {...textScale.badge}>
                      +
                    </Text>
                    <Odometer value={formatInt(thisWeek ?? earnedXp(weekly))} style={styles.heroXp} />
                    <Text style={styles.heroXpUnit} {...textScale.badge}>
                      XP
                    </Text>
                  </View>
                  <Text style={styles.heroSub} {...textScale.dense}>
                    Saha + görevler
                  </Text>
                </View>
                <QuestRing value={weekly.total ? weekly.done_count / weekly.total : 0} size={92} thickness={8} gradient={colors.gradientSignature}>
                  <Odometer value={weekly.done_count} style={styles.ringValue} />
                  <Text style={styles.ringLabel} {...textScale.badge}>
                    / {weekly.total} GÖREV
                  </Text>
                </QuestRing>
              </View>

              <Touchable
                onPress={() => router.push("/kariyer")}
                style={styles.levelRow}
                accessibilityRole="button"
                accessibilityLabel={`Elit Seviye ${data.level.level}. ${toNext != null ? `Sıradaki seviyeye ${toNext} XP` : "En üst seviye"}`}
              >
                <View style={styles.levelBadge}>
                  <LinearGradient colors={colors.medalGold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Text style={styles.levelBadgeLabel} {...textScale.badge}>
                    SEVİYE
                  </Text>
                  <Text style={styles.levelBadgeValue} {...textScale.badge}>
                    {data.level.level}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <View style={styles.levelHead}>
                    <Text style={styles.levelTitle} {...textScale.dense}>
                      Elit Seviye
                    </Text>
                    <Text style={styles.levelHint} numberOfLines={1} {...textScale.badge}>
                      {toNext != null ? `${formatInt(toNext)} XP kaldı` : "En üst seviye"}
                    </Text>
                  </View>
                  <GradientBar value={data.level.progress} gradient={colors.medalGold} track={colors.inkTile} height={8} />
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.onDarkMuted} />
              </Touchable>

              <View style={styles.heroStats}>
                <HeroStat
                  icon="podium"
                  label="XP sırası"
                  value={myRank ? `${formatInt(myRank)}.` : "—"}
                  onPress={() => router.push({ pathname: "/saha-siralamasi", params: { type: "xp" } })}
                />
                <View style={styles.heroDivider} />
                <HeroStat icon="flash" label="Bekleyen" value={`${formatInt(pendingXp)} XP`} />
                <View style={styles.heroDivider} />
                {pendingStars ? (
                  <HeroStat icon="star" label="Bonus yıldız" value={`+${formatInt(pendingStars)}`} />
                ) : (
                  <HeroStat icon="lock-closed" label="Sırada" value={`${weekly.locked} görev`} />
                )}
              </View>
            </View>
          </Reveal>

          {/* BONUS YOLU */}
          {weekly.bonuses.length ? (
            <Reveal index={1}>
              <BonusTrack doneCount={weekly.done_count} bonuses={weekly.bonuses} next={nextBonus(weekly)} />
            </Reveal>
          ) : null}

          {/* HAFTANIN OYUNU */}
          {weekly.featured && featuredRoute ? (
            <Reveal index={2}>
              <Touchable
                onPress={() => router.push(featuredRoute)}
                style={styles.featured}
                feedback="card"
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`Haftanın oyunu ${weekly.featured.title}. Görevleri bu hafta öncelikli. Oyna.`}
              >
                <View style={[styles.featuredIcon, { backgroundColor: questTone("oyun").bg }]}>
                  <Ionicons name="flame" size={20} color={questTone("oyun").fg} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.featuredOverline, { color: questTone("oyun").fg }]} {...textScale.badge}>
                    {upperTR("Haftanın oyunu")}
                  </Text>
                  <Text style={styles.featuredTitle} numberOfLines={1} {...textScale.dense}>
                    {weekly.featured.title}
                  </Text>
                  <Text style={styles.featuredSub} numberOfLines={1} {...textScale.dense}>
                    Görevleri bu hafta sırada önde
                  </Text>
                </View>
                <View style={[styles.featuredGo, { backgroundColor: questTone("oyun").solid }]}>
                  <Text style={[styles.featuredGoText, { color: questTone("oyun").onSolid }]} {...textScale.badge}>
                    Oyna
                  </Text>
                  <Ionicons name="play" size={12} color={questTone("oyun").onSolid} />
                </View>
              </Touchable>
            </Reveal>
          ) : null}

          {/* SEKMELER */}
          <SectionHeader
            title="Açık görevler"
            icon="flash"
            iconTone="signature"
            subtitle={`${weekly.active.length} görev · ${formatInt(pendingXp)} XP seni bekliyor`}
            inset="flush"
          />
          <CategoryTabs value={filter} onChange={setFilter} counts={counts} total={weekly.active.length} />
          {selected ? <CategorySummary item={selected} /> : null}

          {active.length ? (
            active.map((quest, index) => (
              <Reveal key={quest.code} index={index} limit={8} replayKey={filter}>
                <QuestCard quest={quest} index={index} onOpen={questRoute(quest) ? open : undefined} />
              </Reveal>
            ))
          ) : (
            <View style={styles.empty}>
              <IconTile icon={weekly.active.length ? "checkmark-done" : "trophy"} tone="mint" size={40} />
              <Text style={styles.emptyText} {...textScale.long}>
                {weekly.active.length
                  ? `${QUEST_CATEGORY_LABEL[filter as QuestTab] ?? "Bu"} sekmesinde açık görev kalmadı. Diğer sekmelere göz at.`
                  : "Bu haftanın bütün görevleri bitti. Yeni görevler Pazartesi 00.00'da gelir."}
              </Text>
            </View>
          )}
          {weekly.locked ? (
            <View style={styles.lockedRow}>
              <Ionicons name="lock-closed" size={13} color={colors.textTertiary} />
              <Text style={styles.note} {...textScale.long}>
                Bir görevi bitirince yerine yenisi açılır · sırada {weekly.locked} görev var.
              </Text>
            </View>
          ) : null}

          {/* TAMAMLANANLAR */}
          {completed.length ? (
            <>
              <Touchable
                onPress={() => {
                  animateNextLayout();
                  setShowDone((value) => !value);
                }}
                style={styles.foldHead}
                accessibilityRole="button"
                accessibilityState={{ expanded: showDone }}
              >
                <IconTile icon="checkmark-done" tone="mint" size={32} glow={false} />
                <Text style={styles.foldTitle} {...textScale.dense}>
                  Tamamlananlar
                </Text>
                <Text style={styles.foldMeta} {...textScale.badge}>
                  {completed.length} görev · +{formatInt(earnedXp(weekly))} XP
                  {earnedStars(weekly) ? ` · +${formatInt(earnedStars(weekly))}` : ""}
                </Text>
                {earnedStars(weekly) ? <Ionicons name="star" size={11} color={colors.warn} /> : null}
                <Ionicons name={showDone ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
              </Touchable>
              {completed
                .filter((quest) => showDone || fresh.has(quest.code))
                .map((quest) => (
                  <QuestCard key={quest.code} quest={quest} fresh={fresh.has(quest.code)} />
                ))}
            </>
          ) : null}

          {/* TAKIM GÖREVLERİ */}
          {team.isLoading ? (
            <SkeletonCard lines={3} />
          ) : team.isError ? (
            <Touchable onPress={() => void team.refetch()} style={styles.retryRow} accessibilityRole="button" haptic="light">
              <Ionicons name="refresh" size={16} color={colors.textSecondary} />
              <Text style={styles.retryText} {...textScale.dense}>
                Takım görevleri yüklenemedi · tekrar dene
              </Text>
            </Touchable>
          ) : team.data?.team && team.data.periods ? (
            <>
              <SectionHeader title="Takım görevleri" icon="people" iconTone="gold" subtitle={team.data.team.name} inset="flush" />
              <SegmentedControl
                items={[
                  { key: "week", label: "Bu hafta" },
                  { key: "month", label: "Bu ay" },
                ]}
                value={teamPeriod}
                onChange={setTeamPeriod}
                stretch
                size="sm"
              />
              {(() => {
                const period = team.data.periods?.[teamPeriod];
                if (!period) return null;
                const done = period.quests.filter((quest) => quest.done).length;
                return (
                  <>
                    <View style={styles.teamGroup}>
                    <View style={styles.teamScore}>
                      <View style={styles.teamScoreBox}>
                        <Odometer value={formatInt(period.score)} style={styles.teamScoreValue} />
                        <Text style={styles.teamScoreLabel} {...textScale.badge}>
                          {upperTR("Takım puanı")}
                        </Text>
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.teamMeta} {...textScale.dense}>
                          {done}/{period.quests.length} görev
                          {period.rank?.city ? ` · ilde ${period.rank.city}.` : ""}
                          {period.rank?.turkey ? ` · Türkiye'de ${period.rank.turkey}.` : ""}
                        </Text>
                        <GradientBar value={period.quests.length ? done / period.quests.length : 0} gradient={colors.tileTones.gold} height={6} />
                        <Text style={styles.note} {...textScale.dense}>
                          {timeLeft(period.ends_at, now) ? `${timeLeft(period.ends_at, now)} kaldı` : "Dönem bitti"}
                        </Text>
                      </View>
                    </View>
                    {period.quests.map((quest) => (
                      <TeamQuestRow key={quest.code} quest={quest} />
                    ))}
                    </View>
                    {!period.contributed ? (
                      <Text style={styles.note} {...textScale.long}>
                        Takım görevlerinin XP'si bu dönemde takımın bir maçında forma giyen oyunculara yazılır.
                      </Text>
                    ) : null}
                  </>
                );
              })()}
            </>
          ) : null}

          {/* XP ve YILDIZ */}
          <EconomyCard onCity={() => router.push("/kulup-sehri")} onGames={() => router.push("/(tabs)/oyunlar")} />

          {/* XP KURALLARI (yalnız saha + tribün kuralları: oyunlar XP vermez) */}
          {rules.length ? (
            <>
              <Touchable
                onPress={() => {
                  animateNextLayout();
                  setShowRules((value) => !value);
                }}
                style={styles.foldHead}
                accessibilityRole="button"
                accessibilityState={{ expanded: showRules }}
              >
                <IconTile icon="list" tone="violet" size={32} glow={false} />
                <Text style={styles.foldTitle} {...textScale.dense}>
                  Sahada XP tablosu
                </Text>
                <Ionicons name={showRules ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
              </Touchable>
              {showRules ? (
                <View style={styles.rules}>
                  {rules.map((rule, index) => (
                    <View key={`${rule.layer}-${index}`} style={[styles.rule, index ? styles.ruleBorder : null]}>
                      <Ionicons name={LAYER_ICON[rule.layer]} size={14} color={colors.textTertiary} />
                      <Text style={styles.ruleText} {...textScale.dense}>
                        {rule.label}
                      </Text>
                      <Text style={styles.ruleXp} {...textScale.badge}>
                        +{rule.xp} XP
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          <View style={styles.links}>
            <Button label="Elit Kariyer" icon="ribbon-outline" variant="secondary" onPress={() => router.push("/kariyer")} style={styles.flex} />
            <Button
              label="XP sıralaması"
              icon="podium-outline"
              variant="secondary"
              onPress={() => router.push({ pathname: "/saha-siralamasi", params: { type: "xp" } })}
              style={styles.flex}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ───────────────────────── Parçalar ───────────────────────── */

type IconName = ComponentProps<typeof Ionicons>["name"];

function HeroStat({ icon, label, value, onPress }: { icon: IconName; label: string; value: string; onPress?: () => void }) {
  const body = (
    <>
      <View style={styles.heroStatHead}>
        <Ionicons name={icon} size={12} color={icon === "star" || icon === "flash" ? colors.yellowCard : colors.brandOnDark} />
        <Text style={styles.heroStatLabel} numberOfLines={1} {...textScale.badge}>
          {upperTR(label)}
        </Text>
      </View>
      <View style={styles.heroStatValueRow}>
        <Text style={styles.heroStatValue} numberOfLines={1} {...textScale.badge}>
          {value}
        </Text>
        {onPress ? <Ionicons name="chevron-forward" size={12} color={colors.onDarkMuted} /> : null}
      </View>
    </>
  );
  if (onPress) {
    return (
      <Touchable onPress={onPress} style={styles.heroStat} accessibilityRole="button" accessibilityLabel={`${label}: ${value}. Sıralamayı aç`} haptic="selection">
        {body}
      </Touchable>
    );
  }
  return (
    <View style={styles.heroStat} accessible accessibilityLabel={`${label}: ${value}`}>
      {body}
    </View>
  );
}

/** Hepsi · Saha · Oyun · Şehir · Tribün — açık görev sayılarıyla; seçili sekme kategori renginde dolar. */
function CategoryTabs({
  value,
  onChange,
  counts,
  total,
}: {
  value: Filter;
  onChange: (next: Filter) => void;
  counts: CategoryCount[];
  total: number;
}) {
  const items: { key: Filter; label: string; icon: IconName; open: number; done: number }[] = [
    { key: "all", label: "Hepsi", icon: "apps", open: total, done: 0 },
    ...QUEST_CATEGORY_ORDER.map((key) => {
      const count = counts.find((item) => item.key === key);
      return { key, label: QUEST_CATEGORY_LABEL[key], icon: QUEST_CATEGORY_ICON[key], open: count?.open ?? 0, done: count?.done ?? 0 };
    }),
  ];
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {items.map((item) => {
        const selected = value === item.key;
        const tone = item.key === "all" ? null : questTone(item.key);
        const fill = tone ? tone.solid : colors.brand;
        const ink = tone ? tone.onSolid : colors.textOnBrand;
        const fg = tone ? tone.fg : colors.brandAccent;
        const allDone = item.key !== "all" && item.open === 0 && item.done > 0;
        const empty = item.key !== "all" && item.open === 0 && item.done === 0;
        return (
          <Touchable
            key={item.key}
            onPress={() => {
              animateNextLayout();
              onChange(item.key);
            }}
            style={[styles.tab, selected ? { backgroundColor: fill, borderColor: fill } : null, empty && !selected ? styles.tabEmpty : null]}
            haptic="selection"
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${item.label}: ${item.open} açık görev`}
          >
            <Ionicons name={allDone ? "checkmark-circle" : item.icon} size={18} color={selected ? ink : allDone ? colors.win : fg} />
            <Text style={[styles.tabLabel, selected ? { color: ink } : null]} numberOfLines={1} {...textScale.badge}>
              {item.label}
            </Text>
            <View style={[styles.tabCount, selected ? { backgroundColor: withAlpha(ink, 0.18) } : null]}>
              <Text style={[styles.tabCountText, selected ? { color: ink } : null]} {...textScale.badge}>
                {item.open}
              </Text>
            </View>
          </Touchable>
        );
      })}
    </View>
  );
}

function CategorySummary({ item }: { item: CategoryCount }) {
  const tone = questTone(item.key);
  return (
    <View style={[styles.catSummary, { backgroundColor: tone.bg }]}>
      <View style={styles.flex}>
        <Text style={[styles.catTitle, { color: tone.fg }]} {...textScale.dense}>
          {QUEST_CATEGORY_LABEL[item.key]} · {item.done}/{item.total} tamamlandı
        </Text>
        <Text style={styles.catText} numberOfLines={1} {...textScale.dense}>
          {QUEST_CATEGORY_BLURB[item.key]}
        </Text>
      </View>
      <QuestBar value={item.total ? item.done / item.total : 0} color={tone.fg} track={withAlpha(tone.fg, 0.16)} style={styles.catBar} />
    </View>
  );
}

/** XP ile yıldızın ayrımı: nereden gelir, ne işe yarar, nasıl çevrilir. */
function EconomyCard({ onCity, onGames }: { onCity: () => void; onGames: () => void }) {
  const saha = questTone("saha");
  const sehir = questTone("sehir");
  return (
    <View style={styles.eco}>
      <View style={styles.ecoHead}>
        <Ionicons name="information-circle" size={18} color={colors.brandAccent} />
        <Text style={styles.ecoTitle} {...textScale.dense}>
          XP ve Yıldız: iki ayrı yol
        </Text>
      </View>

      <View style={styles.ecoRow}>
        <View style={[styles.ecoIcon, { backgroundColor: saha.bg }]}>
          <Ionicons name="flash" size={18} color={saha.fg} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.ecoLabel} {...textScale.dense}>
            XP sahadan ve görevlerden gelir
          </Text>
          <Text style={styles.ecoText} {...textScale.long}>
            Gerçek maçlardaki performansın ve haftalık görevler. Elit Seviye'ni ve XP sıralamandaki yerini belirler.
          </Text>
        </View>
      </View>

      <View style={styles.ecoRow}>
        <View style={[styles.ecoIcon, { backgroundColor: sehir.bg }]}>
          <Ionicons name="star" size={18} color={sehir.fg} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.ecoLabel} {...textScale.dense}>
            Yıldız oyunlardan gelir
          </Text>
          <Text style={styles.ecoText} {...textScale.long}>
            Bulmaca, arcade ve bilgi oyunları, Tahmin Ligi ve Fantezi. Kulüp Şehri yıldızla kurulur.
          </Text>
        </View>
      </View>

      <View style={styles.ecoConvert}>
        <View style={styles.ecoPill}>
          <Ionicons name="flash" size={12} color={colors.inkBlock} />
          <Text style={styles.ecoPillText} {...textScale.badge}>
            {XP_PER_STAR} XP
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
        <View style={[styles.ecoPill, { backgroundColor: sehir.bg }]}>
          <Ionicons name="star" size={12} color={sehir.fg} />
          <Text style={[styles.ecoPillText, { color: sehir.fg }]} {...textScale.badge}>
            1 yıldız
          </Text>
        </View>
        <Text style={styles.ecoConvertText} numberOfLines={2} {...textScale.dense}>
          Kulüp Şehri'nde "Yıldızları topla"
        </Text>
      </View>

      <View style={styles.ecoActions}>
        <Button label="Kulüp Şehri" icon="business-outline" variant="secondary" size="sm" onPress={onCity} style={styles.flex} />
        <Button label="Oyunlar" icon="game-controller-outline" variant="secondary" size="sm" onPress={onGames} style={styles.flex} />
      </View>
    </View>
  );
}

/** Bonus durakları: tek ray üstünde dört durak; alınan dolu, sıradaki vurgulu. */
function BonusTrack({
  doneCount,
  bonuses,
  next,
}: {
  doneCount: number;
  bonuses: { at: number; xp: number; earned: boolean }[];
  next: { at: number; xp: number; left: number } | null;
}) {
  const last = bonuses[bonuses.length - 1]?.at ?? 1;
  return (
    <View style={styles.bonusCard}>
      <View style={styles.bonusHead}>
        <Ionicons name="gift" size={16} color={colors.warn} />
        <Text style={styles.bonusTitle} {...textScale.dense}>
          Bonus yolu
        </Text>
        <Text style={styles.bonusHint} numberOfLines={1} {...textScale.dense}>
          {next ? `${next.left} görev sonra +${next.xp} XP` : "Bütün bonuslar alındı"}
        </Text>
      </View>
      <QuestBar value={Math.min(1, doneCount / last)} color={colors.warn} height={8} />
      <View style={styles.bonusStops}>
        {bonuses.map((bonus) => {
          const isNext = next?.at === bonus.at;
          return (
            <View
              key={bonus.at}
              style={[styles.bonusStop, bonus.earned ? styles.bonusStopOn : isNext ? styles.bonusStopNext : null]}
              accessible
              accessibilityLabel={`${bonus.at}. görev bonusu ${bonus.xp} XP${bonus.earned ? ", alındı" : ""}`}
            >
              <Ionicons
                name={bonus.earned ? "checkmark-circle" : "gift-outline"}
                size={14}
                color={bonus.earned ? colors.win : isNext ? colors.warn : colors.textTertiary}
              />
              <Text style={styles.bonusAt} {...textScale.badge}>
                {bonus.at}. görev
              </Text>
              <Text style={[styles.bonusXp, bonus.earned ? styles.bonusXpOn : null]} {...textScale.badge}>
                +{bonus.xp}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TeamQuestRow({ quest }: { quest: TeamQuest }) {
  const ratio = quest.target ? Math.min(1, quest.progress / quest.target) : 0;
  const tint = quest.done ? colors.win : colors.warn;
  return (
    <View style={styles.teamCard}>
      <View style={[styles.teamIcon, { backgroundColor: withAlpha(tint, 0.14) }]}>
        <Ionicons name={quest.done ? "checkmark" : "people"} size={20} color={tint} />
      </View>
      <View style={styles.teamBody}>
        <Text style={[styles.teamTitle, quest.done ? styles.teamTitleDone : null]} {...textScale.dense}>
          {quest.title}
        </Text>
        <Text style={styles.teamDesc} numberOfLines={2} {...textScale.dense}>
          {quest.description}
        </Text>
        {!quest.done ? (
          <View style={styles.teamProgress}>
            <QuestBar value={ratio} color={tint} style={styles.flex} />
            <Text style={styles.teamCount} {...textScale.badge}>
              {quest.progress}/{quest.target}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.teamEnd}>
        <Text style={[styles.teamPoints, quest.done ? styles.teamPointsDone : null]} {...textScale.badge}>
          {quest.points} puan
        </Text>
        {quest.xp ? (
          <Text style={styles.teamXp} {...textScale.badge}>
            +{quest.xp} XP
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: layout.screenPadding, gap: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant * 2, gap: space.md, paddingTop: space.sm },
  flex: { flex: 1 },

  /* — Sahne — */
  hero: { borderRadius: radius.xxl, overflow: "hidden", backgroundColor: colors.inkBlock, padding: space.lg, gap: space.md },
  heroBadges: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.s },
  weekPill: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.inkPill, borderWidth: hairline, borderColor: colors.inkPillBorder },
  weekPillText: { ...type.micro, color: colors.brandOnDark },
  timePill: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.inkTile },
  timePillSoon: { borderWidth: hairline, borderColor: colors.yellowCard },
  timeText: { ...type.micro, color: colors.onDarkMuted },
  timeTextSoon: { color: colors.yellowCard },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.lg },
  heroOverline: { ...type.overline, color: colors.onDarkMuted },
  heroXp: { ...type.scoreLg, color: colors.yellowCard },
  heroXpUnit: { ...type.h3, color: colors.yellowCard },
  heroSub: { ...type.caption, color: colors.onDarkMuted },
  ringValue: { ...type.scoreMd, color: colors.onDark },
  ringLabel: { ...type.nano, color: colors.onDarkMuted },
  levelRow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.inkTile, borderWidth: hairline, borderColor: colors.inkTileBorder },
  levelBadge: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.yellowCard },
  levelBadgeLabel: { ...type.nano, color: colors.inkBlock },
  levelBadgeValue: { ...type.metricSm, color: colors.inkBlock },
  levelHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, marginBottom: space.xs },
  levelTitle: { ...type.h4, color: colors.onDark },
  levelHint: { ...type.caption, color: colors.onDarkMuted, flexShrink: 1 },
  heroStats: { flexDirection: "row", borderRadius: radius.lg, backgroundColor: colors.inkTile, borderWidth: hairline, borderColor: colors.inkTileBorder },
  heroStat: { flex: 1, gap: space.xxs, paddingVertical: space.sm, paddingHorizontal: space.sm, minHeight: layout.minTouch },
  heroStatHead: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  heroStatLabel: { ...type.nano, color: colors.onDarkMuted, flexShrink: 1 },
  heroStatValueRow: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  heroStatValue: { ...type.h3, fontFamily: fonts.bold, color: colors.onDark, flexShrink: 1 },
  heroDivider: { width: hairline, alignSelf: "stretch", backgroundColor: colors.borderOnDark },

  /* — Bonus yolu — */
  bonusCard: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  bonusHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  bonusTitle: { ...type.h4, color: colors.textPrimary },
  bonusHint: { ...type.caption, color: colors.textSecondary, flex: 1, textAlign: "right" },
  bonusStops: { flexDirection: "row", gap: space.s },
  bonusStop: { flex: 1, alignItems: "center", gap: space.xxs, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border },
  bonusStopOn: { backgroundColor: colors.winDim, borderColor: colors.win },
  bonusStopNext: { borderColor: colors.warn },
  bonusAt: { ...type.micro, color: colors.textSecondary },
  bonusXp: { ...type.tableNumStrong, color: colors.textPrimary },
  bonusXpOn: { color: colors.win },

  /* — Haftanın oyunu — */
  featured: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  featuredIcon: { width: 44, height: 44, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  featuredOverline: { ...type.overline },
  featuredTitle: { ...type.h2, color: colors.textPrimary },
  featuredSub: { ...type.caption, color: colors.textSecondary },
  featuredGo: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, minHeight: 34, borderRadius: radius.pill },
  featuredGoText: { ...type.label, fontFamily: fonts.bold },

  /* — Sekmeler — */
  tabs: { flexDirection: "row", gap: space.xs },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
    paddingTop: space.sm,
    paddingBottom: space.s,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    minHeight: layout.minTouch,
  },
  tabEmpty: { opacity: 0.55 },
  tabLabel: { ...type.micro, fontFamily: fonts.bold, color: colors.textPrimary },
  tabCount: { minWidth: 22, alignItems: "center", paddingHorizontal: space.xs, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  tabCountText: { ...type.micro, fontFamily: fonts.bold, color: colors.textSecondary },
  catSummary: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg },
  catTitle: { ...type.label, fontFamily: fonts.bold },
  catText: { ...type.caption, color: colors.textSecondary },
  catBar: { width: 72, alignSelf: "center" },

  /* — Liste — */
  empty: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.winDim },
  emptyText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  lockedRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  note: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  retryRow: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, minHeight: layout.minTouch, borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  retryText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },

  /* — Takım — */
  teamScore: { flexDirection: "row", alignItems: "center", gap: space.lg, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  teamScoreValue: { ...type.scoreMd, color: colors.textPrimary },
  teamScoreLabel: { ...type.overline, color: colors.textTertiary },
  teamMeta: { ...type.bodySm, color: colors.textPrimary },
  teamCard: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  teamIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  teamBody: { flex: 1, gap: space.xxs },
  teamTitle: { ...type.h3, color: colors.textPrimary },
  teamTitleDone: { color: colors.textSecondary },
  teamDesc: { ...type.bodySm, color: colors.textSecondary },
  teamProgress: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs },
  teamCount: { ...type.tableNumStrong, color: colors.textSecondary },
  teamEnd: { alignItems: "flex-end", gap: space.xxs },
  teamPoints: { ...type.label, fontFamily: fonts.bold, color: colors.warn },
  teamPointsDone: { color: colors.win },
  teamXp: { ...type.caption, color: colors.textTertiary },

  /* — XP ve yıldız — */
  eco: { gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  ecoHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  ecoTitle: { ...type.h3, color: colors.textPrimary },
  ecoRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  ecoIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  ecoLabel: { ...type.label, fontFamily: fonts.bold, color: colors.textPrimary },
  ecoText: { ...type.bodySm, color: colors.textSecondary },
  ecoConvert: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xs, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  ecoPill: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.yellowCard },
  ecoPillText: { ...type.label, fontFamily: fonts.bold, color: colors.inkBlock },
  ecoConvertText: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  ecoActions: { flexDirection: "row", gap: space.sm },

  /* — Açılır bölümler — */
  foldHead: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: layout.minTouch },
  foldIcon: { width: 30, height: 30, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  foldTitle: { ...type.h3, color: colors.textPrimary, flex: 1 },
  foldMeta: { ...type.caption, color: colors.textTertiary },
  rules: { borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border, paddingHorizontal: space.md },
  rule: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  ruleBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  ruleText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  ruleXp: { ...type.tableNumStrong, color: colors.brandAccent },
  links: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
});
