/**
 * GÖREVLER — haftalık XP görevlerinin tam ekranı (/gorevler).
 *
 * NE (yukarıdan aşağı):
 *   · SAHNE: haftanın görev halkası (biten / toplam), Elit Seviye ilerlemesi
 *     ve sıradaki seviyeye KALAN XP, bu haftanın XP'si, bekleyen XP ve haftanın
 *     bitimine kalan süre (sunucu saatine göre; dakikada bir tazelenir).
 *   · BONUS YOLU: 10 · 20 · 30 · 40. görev durakları ve sıradaki bonusa kalan.
 *   · HAFTANIN OYUNU: o hafta görevleri öne çıkan mini oyun (tek dokunuşla oyna).
 *   · AÇIK GÖREVLER: kategori çipleri (Saha · Oyunlar · Tribün · Keşif) ve
 *     "Yeni" süzgeci; kartta zorluk, ilerleme, XP ve görevin yapıldığı ekrana
 *     giden "Git".
 *   · TAKIM GÖREVLERİ (haftalık + aylık; takımın varsa), tamamlananlar ve
 *     "XP nasıl kazanılır".
 *
 * ÖDÜL: görev XP'si sunucuda kendiliğinden yazılır (ayrı "ödülü al" adımı yok,
 * iki kez alınamaz). Yeni biten görevler bu ekran açıldığında bir kez toast +
 * titreşimle kutlanır (components/quests/useQuestCelebration).
 *
 * Yönetim sekmesinin tepesindeki vitrin (components/quests/QuestSpotlight)
 * buraya açılır. Veri Elit Kariyer ile aynı önbellekten (["career","me"]).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { QuestCard, QUEST_CATEGORY_TINT } from "@/components/quests/QuestCard";
import { QuestBar, QuestRing } from "@/components/quests/QuestProgress";
import { useQuestCelebration } from "@/components/quests/useQuestCelebration";
import {
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  GradientFill,
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
import {
  getMyCareer,
  getMyTeamQuests,
  type CareerLayer,
  type CareerQuest,
  type QuestCategory,
  type TeamQuest,
} from "@/lib/api/career";
import {
  LAYER_ICON,
  LAYER_TITLES,
  QUEST_CATEGORY_ICON,
  QUEST_CATEGORY_LABEL,
  QUEST_ROUTES,
  categoryCounts,
  categoryOf,
  endsSoon,
  nextBonus,
  openXp,
  questRoute,
  serverNow,
  sortForList,
  timeLeft,
  weekXp,
  weeklyOf,
  xpToNextLevel,
} from "@/lib/quests";
import { useAuth } from "@/providers/AuthProvider";
import { animateNextLayout, colors, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

const LAYERS: CareerLayer[] = ["saha", "tribun", "arena"];
const LAYER_TINT: Record<CareerLayer, string> = { saha: colors.win, tribun: colors.yellowCard, arena: colors.brandOnDark };
type Filter = "all" | "new" | QuestCategory;

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
  const { refetch: refetchCareer } = query;
  const { refetch: refetchTeam } = team;

  /* Bir görevi yapıp geri dönünce ilerleme tazelensin (oyun, tahmin, takip…). */
  useFocusEffect(
    useCallback(() => {
      if (signedIn) void refetchCareer();
    }, [signedIn, refetchCareer])
  );

  const refresh = useRefresh(
    () => {
      void refetchCareer();
      void refetchTeam();
    },
    { refreshing: query.isRefetching && !query.isLoading }
  );

  const data = query.data;
  const fresh = useQuestCelebration(data, auth.user?.id ?? null);
  const weekly = useMemo(() => (data ? weeklyOf(data) : null), [data]);
  const counts = useMemo(() => (weekly ? categoryCounts(weekly) : []), [weekly]);
  const newCount = useMemo(() => weekly?.active.filter((quest) => quest.is_new).length ?? 0, [weekly]);
  const active = useMemo(() => {
    if (!weekly) return [];
    const list = sortForList(weekly.active);
    if (filter === "all") return list;
    if (filter === "new") return list.filter((quest) => quest.is_new);
    return list.filter((quest) => categoryOf(quest) === filter);
  }, [filter, weekly]);

  /* Süzgeçteki kategori boşaldıysa (görevler bitti) "Tümü"ne dön. */
  useEffect(() => {
    if (!weekly || filter === "all") return;
    const stillThere = filter === "new" ? newCount > 0 : counts.some((item) => item.key === filter && item.open > 0);
    if (!stillThere) setFilter("all");
  }, [weekly, filter, counts, newCount]);

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
          body="Giriş yap; maç, tahmin, oyun ve keşif görevleriyle her hafta XP kazan, Elit Seviye'ni yükselt."
          action={{ label: "Giriş yap", onPress: () => router.push("/giris") }}
        />
      </SafeAreaView>
    );
  }

  const now = data ? serverNow(data.week?.server_time, query.dataUpdatedAt, clock) : clock;
  const left = data ? timeLeft(data.week?.ends_at, now) : null;
  const soon = data ? endsSoon(data.week?.ends_at, now) : false;
  const featuredRoute = weekly?.featured ? QUEST_ROUTES[weekly.featured.game === "tahmin" ? "tahmin_oyun" : weekly.featured.game] : undefined;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Görevler" subtitle="Görev tamamla, XP kazan, seviye atla" back scrollY={scrollY} />
      {query.isLoading ? (
        <View style={styles.pad}>
          <Skeleton height={196} radius="xxl" />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      ) : query.isError || !data || !weekly ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control} showsVerticalScrollIndicator={false}>
          {/* SAHNE: hafta + seviye */}
          <Reveal index={0}>
            <View style={styles.hero}>
              <GradientFill tone="ink" />
              <View style={styles.heroTop}>
                <QuestRing value={weekly.total ? weekly.done_count / weekly.total : 0}>
                  <Text style={styles.ringValue} {...textScale.badge}>
                    {weekly.done_count}
                  </Text>
                  <Text style={styles.ringLabel} {...textScale.badge}>
                    / {weekly.total} GÖREV
                  </Text>
                </QuestRing>
                <View style={styles.flex}>
                  <View style={styles.heroBadges}>
                    <View style={styles.weekPill}>
                      <Text style={styles.weekPillText} {...textScale.badge}>
                        {upperTR("Bu hafta")}
                      </Text>
                    </View>
                    {left ? (
                      <View style={[styles.timePill, soon ? styles.timePillSoon : null]}>
                        <Ionicons name="time-outline" size={12} color={soon ? colors.yellowCard : colors.onDarkMuted} />
                        <Text style={[styles.timeText, soon ? styles.timeTextSoon : null]} {...textScale.badge}>
                          {left} kaldı
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.heroTitle} {...textScale.dense}>
                    Elit Seviye {data.level.level}
                  </Text>
                  <Text style={styles.heroSub} {...textScale.dense}>
                    {xpToNextLevel(data.level) != null
                      ? `Sıradaki seviyeye ${formatInt(xpToNextLevel(data.level) ?? 0)} XP`
                      : "En üst seviyedesin"}
                  </Text>
                  <QuestBar
                    value={data.level.progress}
                    color={colors.yellowCard}
                    track={colors.inkTile}
                    height={8}
                    style={styles.levelBar}
                  />
                </View>
              </View>

              <View style={styles.heroStats}>
                <HeroStat label="Bu hafta" value={weekXp(data) != null ? `+${formatInt(weekXp(data) ?? 0)}` : "—"} unit="XP" />
                <View style={styles.heroDivider} />
                <HeroStat label="Bekleyen" value={formatInt(openXp(weekly))} unit="XP" />
                <View style={styles.heroDivider} />
                <HeroStat label="Sırada" value={String(weekly.locked)} unit="görev" />
              </View>

              {data.layers_week ? (
                <View style={styles.layerRow}>
                  {LAYERS.map((layer) => (
                    <View key={layer} style={styles.layerChip}>
                      <Ionicons name={LAYER_ICON[layer]} size={13} color={LAYER_TINT[layer]} />
                      <Text style={styles.layerChipText} {...textScale.badge}>
                        {LAYER_TITLES[layer]} +{formatInt(data.layers_week?.[layer] ?? 0)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
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
                <View style={styles.featuredIcon}>
                  <Ionicons name="star" size={18} color={colors.warn} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.featuredOverline} {...textScale.badge}>
                    {upperTR("Haftanın oyunu")}
                  </Text>
                  <Text style={styles.featuredTitle} numberOfLines={1} {...textScale.dense}>
                    {weekly.featured.title}
                  </Text>
                  <Text style={styles.featuredSub} numberOfLines={1} {...textScale.dense}>
                    Bu oyunun görevleri bu hafta sırada önde.
                  </Text>
                </View>
                <View style={styles.featuredGo}>
                  <Text style={styles.featuredGoText} {...textScale.badge}>
                    Oyna
                  </Text>
                  <Ionicons name="play" size={12} color={colors.textOnBrand} />
                </View>
              </Touchable>
            </Reveal>
          ) : null}

          {/* AÇIK GÖREVLER */}
          <SectionHeader
            title="Açık görevler"
            meta={newCount ? `${newCount} yeni görev` : `${weekly.active.length} görev`}
            inset="flush"
          />
          <ChipGroup contentPadding={0}>
            <Chip label="Tümü" count={weekly.active.length} selected={filter === "all"} onPress={() => setFilter("all")} size="sm" />
            {newCount ? (
              <Chip label="Yeni" icon="sparkles" count={newCount} selected={filter === "new"} onPress={() => setFilter("new")} size="sm" />
            ) : null}
            {counts.map((item) =>
              item.open ? (
                <Chip
                  key={item.key}
                  label={QUEST_CATEGORY_LABEL[item.key]}
                  icon={QUEST_CATEGORY_ICON[item.key]}
                  count={item.open}
                  selected={filter === item.key}
                  onPress={() => setFilter(item.key)}
                  size="sm"
                />
              ) : null
            )}
          </ChipGroup>

          {/* Kategori özeti: seçili kategoride kaç görev bitti. */}
          {filter !== "all" && filter !== "new" ? <CategorySummary item={counts.find((item) => item.key === filter)} /> : null}

          {active.length ? (
            active.map((quest, index) => (
              <QuestCard key={quest.code} quest={quest} index={index} onOpen={questRoute(quest) ? open : undefined} />
            ))
          ) : (
            <View style={styles.empty}>
              <Ionicons name={weekly.active.length ? "funnel-outline" : "trophy"} size={22} color={colors.win} />
              <Text style={styles.emptyText} {...textScale.long}>
                {weekly.active.length
                  ? "Bu süzgeçte açık görev kalmadı."
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
              <SectionHeader title="Takım görevleri" meta={team.data.team.name} inset="flush" />
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
                    <View style={styles.teamScore}>
                      <View>
                        <Text style={styles.teamScoreValue} {...textScale.badge}>
                          {formatInt(period.score)}
                        </Text>
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
                        <Text style={styles.note} {...textScale.dense}>
                          {timeLeft(period.ends_at, now) ? `${timeLeft(period.ends_at, now)} kaldı` : "Dönem bitti"}
                        </Text>
                      </View>
                    </View>
                    {period.quests.map((quest) => (
                      <TeamQuestRow key={quest.code} quest={quest} />
                    ))}
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

          {/* TAMAMLANANLAR */}
          {weekly.completed.length ? (
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
                <Ionicons name="checkmark-done" size={18} color={colors.win} />
                <Text style={styles.foldTitle} {...textScale.dense}>
                  Tamamlananlar
                </Text>
                <Text style={styles.foldMeta} {...textScale.badge}>
                  {weekly.completed.length} görev · +{formatInt(weekly.completed.reduce((sum, quest) => sum + quest.xp, 0))} XP
                </Text>
                <Ionicons name={showDone ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
              </Touchable>
              {showDone || fresh.size
                ? weekly.completed
                    .filter((quest) => showDone || fresh.has(quest.code))
                    .map((quest) => <QuestCard key={quest.code} quest={quest} fresh={fresh.has(quest.code)} />)
                : null}
            </>
          ) : null}

          {/* XP KURALLARI */}
          {data.rules.standard?.length ? (
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
                <Ionicons name="help-circle-outline" size={18} color={colors.brandAccent} />
                <Text style={styles.foldTitle} {...textScale.dense}>
                  XP nasıl kazanılır
                </Text>
                <Ionicons name={showRules ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
              </Touchable>
              {showRules ? (
                <View style={styles.rules}>
                  {data.rules.standard.map((rule, index) => (
                    <View key={`${rule.layer}-${index}`} style={[styles.rule, index ? styles.ruleBorder : null]}>
                      <Ionicons name={LAYER_ICON[rule.layer]} size={14} color={colors.textTertiary} />
                      <Text style={styles.ruleText} {...textScale.dense}>
                        {rule.label}
                      </Text>
                      <Text style={styles.ruleXp} {...textScale.badge}>
                        +{rule.xp}
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

function HeroStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.heroStat} accessible accessibilityLabel={`${label}: ${value} ${unit}`}>
      <Text style={styles.heroStatValue} numberOfLines={1} {...textScale.badge}>
        {value}
        <Text style={styles.heroStatUnit}> {unit}</Text>
      </Text>
      <Text style={styles.heroStatLabel} {...textScale.badge}>
        {upperTR(label)}
      </Text>
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

function CategorySummary({ item }: { item?: { key: QuestCategory; open: number; done: number; total: number } }) {
  if (!item || !item.total) return null;
  const tint = QUEST_CATEGORY_TINT[item.key];
  return (
    <View style={styles.catSummary}>
      <Text style={styles.catText} {...textScale.dense}>
        {QUEST_CATEGORY_LABEL[item.key]} · {item.done}/{item.total} tamamlandı
      </Text>
      <QuestBar value={item.done / item.total} color={tint} style={styles.catBar} />
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
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.lg },
  ringValue: { ...type.scoreMd, color: colors.onDark },
  ringLabel: { ...type.nano, color: colors.onDarkMuted },
  heroBadges: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.s, marginBottom: space.xs },
  weekPill: { paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.inkPill, borderWidth: hairline, borderColor: colors.inkPillBorder },
  weekPillText: { ...type.micro, color: colors.brandOnDark },
  timePill: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.inkTile },
  timePillSoon: { borderWidth: hairline, borderColor: colors.yellowCard },
  timeText: { ...type.micro, color: colors.onDarkMuted },
  timeTextSoon: { color: colors.yellowCard },
  heroTitle: { ...type.h1, color: colors.onDark },
  heroSub: { ...type.bodySm, color: colors.onDarkMuted },
  levelBar: { marginTop: space.sm },
  heroStats: { flexDirection: "row", borderRadius: radius.lg, backgroundColor: colors.inkTile, borderWidth: hairline, borderColor: colors.inkTileBorder, paddingVertical: space.md },
  heroStat: { flex: 1, alignItems: "center", gap: space.xxs },
  heroStatValue: { ...type.metricSm, color: colors.onDark },
  heroStatUnit: { ...type.caption, color: colors.onDarkMuted },
  heroStatLabel: { ...type.overline, color: colors.onDarkMuted },
  heroDivider: { width: hairline, alignSelf: "stretch", backgroundColor: colors.borderOnDark },
  layerRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  layerChip: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.inkPill },
  layerChipText: { ...type.micro, color: colors.onDark },

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
  featuredIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.warnDim },
  featuredOverline: { ...type.overline, color: colors.warn },
  featuredTitle: { ...type.h2, color: colors.textPrimary },
  featuredSub: { ...type.caption, color: colors.textSecondary },
  featuredGo: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, minHeight: 32, borderRadius: radius.pill, backgroundColor: colors.brand },
  featuredGoText: { ...type.label, color: colors.textOnBrand },

  /* — Liste — */
  catSummary: { flexDirection: "row", alignItems: "center", gap: space.md },
  catText: { ...type.caption, color: colors.textSecondary },
  catBar: { flex: 1 },
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

  /* — Açılır bölümler — */
  foldHead: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: layout.minTouch },
  foldTitle: { ...type.h3, color: colors.textPrimary, flex: 1 },
  foldMeta: { ...type.caption, color: colors.textTertiary },
  rules: { borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border, paddingHorizontal: space.md },
  rule: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  ruleBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  ruleText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  ruleXp: { ...type.tableNumStrong, color: colors.brandAccent },
  links: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
});
