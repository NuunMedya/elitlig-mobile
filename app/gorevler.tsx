/**
 * GÖREVLER — haftalık XP görevlerinin tam ekranı (/gorevler).
 *
 * NE:
 *   · üstte seviye ilerlemesi (sıradaki seviyeye kalan XP), haftanın bitimine
 *     kalan süre ve bu haftanın katman katman XP'si;
 *   · bonus durakları (10, 20, 30, 40. görev);
 *   · katman süzgeçli açık görevler — her kartta ilerleme, XP ve "Yap" düğmesi
 *     (görevin yapıldığı ekranı açar);
 *   · takım görevleri (haftalık + aylık; takımın varsa);
 *   · tamamlananlar ve "XP nasıl kazanılır" kuralları.
 *
 * Yönetim sekmesinin tepesindeki vitrin (components/quests/QuestSpotlight)
 * buraya açılır. Veri Elit Kariyer ile aynı önbellekten (["career","me"]).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Chip,
  ChipGroup,
  ErrorState,
  GradientFill,
  ScreenHeader,
  SectionHeader,
  SegmentedControl,
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
  type TeamQuest,
} from "@/lib/api/career";
import { LAYER_ICON, LAYER_TITLES, openXp, questRoute, sortByCloseness, timeLeft, weekXp, weeklyOf } from "@/lib/quests";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

const LAYERS: CareerLayer[] = ["saha", "tribun", "arena"];
const LAYER_TINT: Record<CareerLayer, string> = { saha: colors.win, tribun: colors.info, arena: colors.brandAccent };
type Filter = "all" | CareerLayer;

export default function QuestsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [filter, setFilter] = useState<Filter>("all");
  const [teamPeriod, setTeamPeriod] = useState<"week" | "month">("week");
  const [showDone, setShowDone] = useState(false);

  const query = useQuery({ queryKey: ["career", "me"], queryFn: getMyCareer, enabled: Boolean(auth.user), staleTime: 30_000 });
  const team = useQuery({ queryKey: ["career", "team"], queryFn: getMyTeamQuests, enabled: Boolean(auth.user), staleTime: 30_000, retry: false });
  const refresh = useRefresh(
    () => {
      void query.refetch();
      void team.refetch();
    },
    { refreshing: query.isRefetching }
  );

  const data = query.data;
  const weekly = useMemo(() => (data ? weeklyOf(data) : null), [data]);
  const active = useMemo(
    () => (weekly ? sortByCloseness(weekly.active).filter((q) => filter === "all" || q.layer === filter) : []),
    [filter, weekly]
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: weekly?.active.length ?? 0 };
    for (const q of weekly?.active ?? []) c[q.layer] = (c[q.layer] ?? 0) + 1;
    return c;
  }, [weekly]);

  if (!auth.user) return <Redirect href="/giris" />;

  const open = (quest: CareerQuest) => {
    const route = questRoute(quest);
    if (route) router.push(route);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Görevler" subtitle="Görev tamamla, XP kazan, seviye atla" back scrollY={scrollY} />
      {query.isLoading ? (
        <View style={styles.pad}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={6} />
        </View>
      ) : query.isError || !data || !weekly ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
          {/* SEVİYE VE HAFTA */}
          <View style={styles.hero}>
            <GradientFill tone="ink" />
            <View style={styles.heroTop}>
              <View style={styles.levelRing}>
                <Text style={styles.levelLabel} {...textScale.badge}>SEVİYE</Text>
                <Text style={styles.levelValue} {...textScale.badge}>{data.level.level}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.heroTitle} {...textScale.dense}>Elit Seviye {data.level.level}</Text>
                <Text style={styles.heroSub} {...textScale.dense}>
                  {data.level.next != null
                    ? `Sıradaki seviyeye ${(data.level.next - data.level.current).toLocaleString("tr-TR")} XP`
                    : "En üst seviyedesin"}
                </Text>
                <View style={styles.levelBar}>
                  <View style={[styles.levelFill, { width: `${Math.min(100, Math.max(0, data.level.progress * 100))}%` }]} />
                </View>
              </View>
            </View>
            <View style={styles.heroStats}>
              <HeroStat label="Bu hafta" value={weekXp(data) != null ? `+${(weekXp(data) ?? 0).toLocaleString("tr-TR")} XP` : "—"} />
              <HeroStat label="Görev" value={`${weekly.done_count}/${weekly.total}`} />
              <HeroStat label="Kalan süre" value={timeLeft(data.week?.ends_at) ?? "—"} />
            </View>
            {data.layers_week ? (
              <View style={styles.layerRow}>
                {LAYERS.map((layer) => (
                  <View key={layer} style={styles.layerChip}>
                    <Ionicons name={LAYER_ICON[layer]} size={13} color={LAYER_TINT[layer]} />
                    <Text style={styles.layerChipText} {...textScale.badge}>
                      {LAYER_TITLES[layer]} +{(data.layers_week?.[layer] ?? 0).toLocaleString("tr-TR")}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {/* BONUS DURAKLARI */}
          {weekly.bonuses.length ? (
            <View style={styles.bonusRow}>
              {weekly.bonuses.map((bonus) => {
                const reached = weekly.done_count >= bonus.at;
                return (
                  <View key={bonus.at} style={[styles.bonus, bonus.earned || reached ? styles.bonusOn : null]}>
                    <Ionicons name={bonus.earned || reached ? "gift" : "gift-outline"} size={18} color={bonus.earned || reached ? colors.yellowCard : colors.textTertiary} />
                    <Text style={styles.bonusAt} {...textScale.badge}>{bonus.at}. görev</Text>
                    <Text style={styles.bonusXp} {...textScale.badge}>+{bonus.xp} XP</Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* AÇIK GÖREVLER */}
          <SectionHeader
            title="Açık görevler"
            meta={openXp(weekly) ? `${openXp(weekly).toLocaleString("tr-TR")} XP bekliyor` : undefined}
            style={styles.section}
          />
          <ChipGroup contentPadding={0}>
            <Chip label="Tümü" count={counts.all} selected={filter === "all"} onPress={() => setFilter("all")} size="sm" />
            {LAYERS.map((layer) =>
              counts[layer] ? (
                <Chip key={layer} label={LAYER_TITLES[layer]} icon={LAYER_ICON[layer]} count={counts[layer]} selected={filter === layer} onPress={() => setFilter(layer)} size="sm" />
              ) : null
            )}
          </ChipGroup>
          {active.length ? (
            active.map((quest) => <QuestCard key={quest.code} quest={quest} onOpen={questRoute(quest) ? () => open(quest) : undefined} />)
          ) : (
            <View style={styles.empty}>
              <Ionicons name="sparkles" size={22} color={colors.win} />
              <Text style={styles.emptyText} {...textScale.long}>
                {weekly.active.length ? "Bu süzgeçte açık görev yok." : "Bu haftanın bütün görevleri bitti. Yeni görevler Pazartesi gelir."}
              </Text>
            </View>
          )}
          {weekly.locked ? (
            <Text style={styles.note} {...textScale.long}>
              Bir görevi bitirince yerine yenisi açılır · sırada {weekly.locked} görev var.
            </Text>
          ) : null}

          {/* TAKIM GÖREVLERİ */}
          {team.data?.team && team.data.periods ? (
            <>
              <SectionHeader title={`Takım görevleri · ${team.data.team.name}`} style={styles.section} />
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
                return (
                  <>
                    <View style={styles.teamScore}>
                      <Text style={styles.teamScoreValue} {...textScale.badge}>{period.score}</Text>
                      <Text style={styles.teamScoreLabel} {...textScale.dense}>
                        takım puanı{period.rank?.city ? ` · ilde ${period.rank.city}.` : ""}{period.rank?.turkey ? ` · Türkiye'de ${period.rank.turkey}.` : ""}
                      </Text>
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
              <Touchable onPress={() => setShowDone((v) => !v)} style={styles.doneHead} accessibilityRole="button" accessibilityState={{ expanded: showDone }}>
                <Ionicons name="checkmark-done" size={18} color={colors.win} />
                <Text style={styles.doneTitle} {...textScale.dense}>Tamamlananlar ({weekly.completed.length})</Text>
                <Ionicons name={showDone ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
              </Touchable>
              {showDone ? weekly.completed.map((quest) => <QuestCard key={quest.code} quest={quest} />) : null}
            </>
          ) : null}

          {/* XP KURALLARI */}
          {data.rules.standard?.length ? (
            <>
              <SectionHeader title="XP nasıl kazanılır" style={styles.section} />
              <View style={styles.rules}>
                {data.rules.standard.map((rule, index) => (
                  <View key={`${rule.layer}-${index}`} style={[styles.rule, index ? styles.ruleBorder : null]}>
                    <Ionicons name={LAYER_ICON[rule.layer]} size={14} color={LAYER_TINT[rule.layer]} />
                    <Text style={styles.ruleText} {...textScale.dense}>{rule.label}</Text>
                    <Text style={styles.ruleXp} {...textScale.badge}>+{rule.xp}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <View style={styles.links}>
            <Touchable onPress={() => router.push("/kariyer")} style={styles.link} accessibilityRole="button">
              <Ionicons name="ribbon" size={18} color={colors.brandAccent} />
              <Text style={styles.linkText} {...textScale.dense}>Elit Kariyer ve rozetler</Text>
            </Touchable>
            <Touchable onPress={() => router.push("/saha-siralamasi?type=xp")} style={styles.link} accessibilityRole="button">
              <Ionicons name="podium" size={18} color={colors.brandAccent} />
              <Text style={styles.linkText} {...textScale.dense}>XP sıralaması</Text>
            </Touchable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue} numberOfLines={1} {...textScale.badge}>{value}</Text>
      <Text style={styles.heroStatLabel} {...textScale.badge}>{upperTR(label)}</Text>
    </View>
  );
}

function QuestCard({ quest, onOpen }: { quest: CareerQuest; onOpen?: () => void }) {
  const tint = quest.done ? colors.win : LAYER_TINT[quest.layer];
  const ratio = quest.target ? Math.min(1, quest.progress / quest.target) : 0;
  return (
    <View style={styles.card}>
      <View style={[styles.cardIcon, { backgroundColor: withAlpha(tint, 0.14) }]}>
        <Ionicons name={quest.done ? "checkmark" : LAYER_ICON[quest.layer]} size={20} color={tint} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.cardTitle, quest.done ? styles.cardTitleDone : null]} {...textScale.dense}>{quest.title}</Text>
        <Text style={styles.cardDesc} numberOfLines={2} {...textScale.dense}>{quest.description}</Text>
        {!quest.done ? (
          <View style={styles.progressRow}>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${ratio * 100}%`, backgroundColor: tint }]} />
            </View>
            <Text style={styles.count} {...textScale.badge}>
              {quest.progress.toLocaleString("tr-TR")}/{quest.target.toLocaleString("tr-TR")}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardEnd}>
        <View style={[styles.xp, quest.done ? styles.xpDone : null]}>
          <Text style={[styles.xpText, quest.done ? styles.xpTextDone : null]} {...textScale.badge}>+{quest.xp}</Text>
        </View>
        {onPress(onOpen)}
      </View>
    </View>
  );
}

function onPress(fn?: () => void) {
  if (!fn) return null;
  return (
    <Touchable onPress={fn} style={styles.goBtn} haptic="selection" accessibilityRole="button" accessibilityLabel="Görevi yap">
      <Text style={styles.goText} {...textScale.badge}>Yap</Text>
    </Touchable>
  );
}

function TeamQuestRow({ quest }: { quest: TeamQuest }) {
  const ratio = quest.target ? Math.min(1, quest.progress / quest.target) : 0;
  return (
    <View style={styles.card}>
      <View style={[styles.cardIcon, { backgroundColor: withAlpha(quest.done ? colors.win : colors.warn, 0.14) }]}>
        <Ionicons name={quest.done ? "checkmark" : "people"} size={20} color={quest.done ? colors.win : colors.warn} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.cardTitle} {...textScale.dense}>{quest.title}</Text>
        <Text style={styles.cardDesc} numberOfLines={2} {...textScale.dense}>{quest.description}</Text>
        {!quest.done ? (
          <View style={styles.progressRow}>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${ratio * 100}%`, backgroundColor: colors.warn }]} />
            </View>
            <Text style={styles.count} {...textScale.badge}>{quest.progress}/{quest.target}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardEnd}>
        <Text style={styles.points} {...textScale.badge}>{quest.points} puan</Text>
        {quest.xp ? <Text style={styles.count} {...textScale.badge}>+{quest.xp} XP</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: layout.screenPadding, gap: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant * 2, gap: space.md, paddingTop: space.sm },
  section: { paddingHorizontal: 0 },
  flex: { flex: 1 },
  hero: { borderRadius: radius.xxl, overflow: "hidden", backgroundColor: colors.inkBlock, padding: space.lg, gap: space.md },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  levelRing: { width: 66, height: 66, borderRadius: radius.pill, borderWidth: 3, borderColor: colors.yellowCard, alignItems: "center", justifyContent: "center", backgroundColor: colors.inkTile },
  levelLabel: { ...type.nano, color: colors.onDarkMuted },
  levelValue: { ...type.h1, fontFamily: fonts.bold, color: colors.onDark },
  heroTitle: { ...type.h2, fontFamily: fonts.bold, color: colors.onDark },
  heroSub: { ...type.bodySm, color: colors.onDarkMuted },
  levelBar: { height: 8, borderRadius: radius.pill, backgroundColor: colors.inkTile, overflow: "hidden", marginTop: space.sm },
  levelFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.yellowCard },
  heroStats: { flexDirection: "row", borderRadius: radius.lg, backgroundColor: colors.inkTile, borderWidth: hairline, borderColor: colors.inkTileBorder, paddingVertical: space.md },
  heroStat: { flex: 1, alignItems: "center", gap: 2 },
  heroStatValue: { ...type.h3, fontFamily: fonts.bold, color: colors.onDark },
  heroStatLabel: { ...type.micro, color: colors.onDarkMuted },
  layerRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  layerChip: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.inkPill },
  layerChipText: { ...type.micro, color: colors.onDark },
  bonusRow: { flexDirection: "row", gap: space.sm },
  bonus: { flex: 1, alignItems: "center", gap: 2, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  bonusOn: { borderColor: colors.yellowCard, backgroundColor: colors.warnDim },
  bonusAt: { ...type.micro, color: colors.textSecondary },
  bonusXp: { ...type.label, fontFamily: fonts.bold, color: colors.textPrimary },
  card: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  cardIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  cardTitle: { ...type.h4, color: colors.textPrimary },
  cardTitleDone: { color: colors.textTertiary },
  cardDesc: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm },
  bar: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: radius.pill },
  count: { ...type.caption, color: colors.textTertiary },
  cardEnd: { alignItems: "flex-end", gap: space.sm },
  xp: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.yellowCard },
  xpDone: { backgroundColor: colors.winDim },
  xpText: { ...type.micro, fontFamily: fonts.bold, color: colors.inkBlock },
  xpTextDone: { color: colors.win },
  goBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.brand },
  goText: { ...type.micro, color: colors.textOnBrand },
  empty: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.winDim },
  emptyText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  note: { ...type.caption, color: colors.textTertiary },
  teamScore: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  teamScoreValue: { ...type.scoreMd, color: colors.textPrimary },
  teamScoreLabel: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  points: { ...type.label, fontFamily: fonts.bold, color: colors.warn },
  doneHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  doneTitle: { ...type.h4, color: colors.textPrimary, flex: 1 },
  rules: { borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border, paddingHorizontal: space.md },
  rule: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  ruleBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  ruleText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  ruleXp: { ...type.label, fontFamily: fonts.bold, color: colors.brandAccent },
  links: { flexDirection: "row", gap: space.sm },
  link: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  linkText: { ...type.label, color: colors.textPrimary, flex: 1 },
});
