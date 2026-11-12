/**
 * GÖREV KARTI — /gorevler listesinin satırı.
 *
 *   [simge]  SAHA · ●●○ ORTA                      YENİ
 *            Başlık
 *            açıklama (iki satır)
 *   ▰▰▰▰▰▱▱▱▱▱▱▱▱  2 / 5 maç                       %40
 *   [+75 XP] [★ +5]                              [ Yap › ]
 *
 * Renk kategori kimliğidir (saha · oyun · şehir · tribün); biten görev `win`e
 * döner. "Yap" yalnız görevin yapılacağı ekran biliniyorsa çizilir (görevin
 * `route`u ya da lib/quests.ts yedek haritası); yoksa nerede sayıldığını
 * söyleyen kısa bir ipucu durur ("Sahada tamamlanır").
 *
 * Ödül sunucuda kendiliğinden yazılır. `fresh`: bu açılışta ilk kez görülen
 * biten görev — kart bir kez yaylanır, simgenin çevresinde yıldızlar bir kez
 * saçılır ve ödül çipi "alındı" olur ("Hareketi azalt" açıksa hareket yok).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { Touchable, useReduceMotion, withAlpha } from "@/components/ui";
import type { CareerQuest, QuestCategory, QuestDifficulty } from "@/lib/api/career";
import { questTone } from "@/lib/questPalette";
import { DIFFICULTY_LABEL, QUEST_CATEGORY_LABEL, categoryOf, difficultyOf, progressText, questHint, questIcon } from "@/lib/quests";
import { colors, duration, easing, fonts, hairline, radius, space, spring, textScale, type, upperTR } from "@/theme";

import { QuestBar } from "./QuestProgress";

/** Kategori rengi (kâğıt yüzey üstünde metin / simge). */
export const QUEST_CATEGORY_TINT: Record<QuestCategory, string> = {
  saha: questTone("saha").fg,
  oyun: questTone("oyun").fg,
  sehir: questTone("sehir").fg,
  tribun: questTone("tribun").fg,
  kesif: questTone("kesif").fg,
};

const DIFFICULTY_TINT: Record<QuestDifficulty, string> = { kolay: colors.win, orta: colors.warn, zor: colors.danger };
const DIFFICULTY_STEP: Record<QuestDifficulty, number> = { kolay: 1, orta: 2, zor: 3 };

const formatInt = (value: number) => value.toLocaleString("tr-TR");

/* Kutlama: simgenin çevresine bir kez saçılan yıldızlar (sonlu animasyon). */
const BURST = [0, 60, 120, 180, 240, 300].map((deg) => ({
  x: Math.cos((deg * Math.PI) / 180) * 30,
  y: Math.sin((deg * Math.PI) / 180) * 30,
}));

export const QuestCard = memo(function QuestCard({
  quest,
  onOpen,
  fresh = false,
  index = 0,
}: {
  quest: CareerQuest;
  /** Görevin yapılacağı ekranı açar; verilmezse düğme çizilmez. */
  onOpen?: (quest: CareerQuest) => void;
  fresh?: boolean;
  /** Listede kademeli çubuk dolumu için sıra. */
  index?: number;
}) {
  const category = categoryOf(quest);
  const tone = questTone(category);
  const tint = quest.done ? colors.win : tone.fg;
  const ratio = quest.target ? Math.min(1, quest.progress / quest.target) : 0;
  const difficulty = difficultyOf(quest);
  const hint = questHint(quest);
  const stars = quest.stars ?? 0;
  const reduceMotion = useReduceMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!fresh || reduceMotion) return;
    pop.setValue(0.94);
    burst.setValue(0);
    const run = Animated.parallel([
      Animated.spring(pop, { toValue: 1, ...spring.bounce }),
      Animated.timing(burst, { toValue: 1, duration: duration.flash, easing: easing.decelerate, useNativeDriver: true }),
    ]);
    run.start();
    return () => run.stop();
  }, [fresh, reduceMotion, pop, burst]);

  const reward = `${quest.xp} XP${stars ? ` ve ${stars} yıldız` : ""}`;
  const label = `${quest.title}. ${quest.description}. ${quest.done ? "Tamamlandı" : progressText(quest)}. Ödül ${reward}. ${
    DIFFICULTY_LABEL[difficulty]
  }, ${QUEST_CATEGORY_LABEL[category]}${quest.is_new && !quest.done ? ". Bu hafta yeni" : ""}`;

  return (
    <Animated.View
      style={[styles.card, quest.done ? styles.cardDone : null, fresh ? styles.cardFresh : null, { transform: [{ scale: pop }] }]}
      accessible={!onOpen}
      accessibilityLabel={onOpen ? undefined : label}
    >
      <View style={styles.head}>
        <View style={styles.iconWrap}>
          <View style={[styles.icon, { backgroundColor: quest.done ? colors.winDim : tone.bg, borderColor: withAlpha(tint, 0.28) }]}>
            <Ionicons name={quest.done ? "checkmark-circle" : questIcon(quest)} size={22} color={tint} />
          </View>
          {fresh && !reduceMotion
            ? BURST.map((point, i) => (
                <Animated.View
                  key={i}
                  pointerEvents="none"
                  style={[
                    styles.spark,
                    {
                      opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                      transform: [
                        { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, point.x] }) },
                        { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, point.y] }) },
                        { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.1, 0.6] }) },
                      ],
                    },
                  ]}
                >
                  <Ionicons name="star" size={10} color={i % 2 ? colors.yellowCard : colors.win} />
                </Animated.View>
              ))
            : null}
        </View>

        <View style={styles.body}>
          <View style={styles.meta}>
            <Text style={[styles.category, { color: tint }]} {...textScale.badge}>
              {upperTR(QUEST_CATEGORY_LABEL[category])}
            </Text>
            <View style={styles.dot} />
            <View style={styles.pips} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {[1, 2, 3].map((step) => (
                <View
                  key={step}
                  style={[styles.pip, step <= DIFFICULTY_STEP[difficulty] ? { backgroundColor: DIFFICULTY_TINT[difficulty] } : null]}
                />
              ))}
            </View>
            <Text style={styles.metaText} {...textScale.badge}>
              {upperTR(DIFFICULTY_LABEL[difficulty])}
            </Text>
            <View style={styles.flex} />
            {quest.done ? (
              <View style={[styles.tag, styles.tagDone]}>
                <Ionicons name="checkmark" size={10} color={colors.win} />
                <Text style={[styles.tagText, styles.tagDoneText]} {...textScale.badge}>
                  {upperTR(fresh ? "Yeni bitti" : "Bitti")}
                </Text>
              </View>
            ) : quest.featured ? (
              <View style={[styles.tag, styles.tagFeatured]}>
                <Ionicons name="flame" size={10} color={colors.warn} />
                <Text style={[styles.tagText, styles.tagFeaturedText]} {...textScale.badge}>
                  {upperTR("Haftanın oyunu")}
                </Text>
              </View>
            ) : quest.is_new ? (
              <View style={styles.tag}>
                <Text style={styles.tagText} {...textScale.badge}>
                  {upperTR("Yeni")}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.title, quest.done ? styles.titleDone : null]} numberOfLines={2} {...textScale.dense}>
            {quest.title}
          </Text>
          {quest.description ? (
            <Text style={styles.desc} numberOfLines={2} {...textScale.dense}>
              {quest.description}
            </Text>
          ) : null}
        </View>
      </View>

      {!quest.done ? (
        <View style={styles.progressRow}>
          <QuestBar value={ratio} color={tint} height={8} delay={Math.min(index, 8) * 30} style={styles.bar} />
          <Text style={styles.count} numberOfLines={1} {...textScale.badge}>
            {progressText(quest)}
          </Text>
        </View>
      ) : null}

      <View style={styles.foot}>
        <View style={[styles.reward, quest.done ? styles.rewardDone : null]}>
          <Ionicons name={quest.done ? "checkmark-circle" : "flash"} size={13} color={quest.done ? colors.win : colors.inkBlock} />
          <Text style={[styles.rewardText, quest.done ? styles.rewardTextDone : null]} {...textScale.badge}>
            +{formatInt(quest.xp)} XP
          </Text>
        </View>
        {stars ? (
          <View style={[styles.reward, styles.rewardStar, quest.done ? styles.rewardDone : null]}>
            <Ionicons name="star" size={12} color={quest.done ? colors.win : colors.warn} />
            <Text style={[styles.rewardText, styles.rewardStarText, quest.done ? styles.rewardTextDone : null]} {...textScale.badge}>
              +{formatInt(stars)}
            </Text>
          </View>
        ) : null}
        <View style={styles.flex} />
        {quest.done ? (
          <Text style={styles.doneText} numberOfLines={1} {...textScale.badge}>
            {fresh ? "Ödül hesabına yazıldı" : "Ödül alındı"}
          </Text>
        ) : onOpen ? (
          <Touchable
            onPress={() => onOpen(quest)}
            style={[styles.go, { backgroundColor: tone.solid }]}
            haptic="selection"
            feedback="button"
            accessibilityRole="button"
            accessibilityLabel={`${label}. Görevi yap`}
            hitSlop={8}
          >
            <Text style={[styles.goText, { color: tone.onSolid }]} {...textScale.badge}>
              Yap
            </Text>
            <Ionicons name="arrow-forward" size={13} color={tone.onSolid} />
          </Touchable>
        ) : hint ? (
          <Text style={styles.hint} numberOfLines={1} {...textScale.badge}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  cardDone: { backgroundColor: colors.surface2 },
  cardFresh: { borderColor: colors.win, backgroundColor: colors.winDim },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  iconWrap: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  icon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  spark: { position: "absolute" },
  body: { flex: 1, gap: space.xxs },
  meta: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 18 },
  category: { ...type.micro, fontFamily: fonts.bold },
  dot: { width: 3, height: 3, borderRadius: radius.pill, backgroundColor: colors.textTertiary },
  pips: { flexDirection: "row", gap: space.px },
  pip: { width: 5, height: 9, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  metaText: { ...type.micro, color: colors.textTertiary },
  title: { ...type.h3, color: colors.textPrimary },
  titleDone: { color: colors.textSecondary },
  desc: { ...type.bodySm, color: colors.textSecondary },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.s,
    paddingVertical: space.px,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
  },
  tagText: { ...type.micro, color: colors.brandAccent },
  tagFeatured: { backgroundColor: colors.warnDim },
  tagFeaturedText: { color: colors.warn },
  tagDone: { backgroundColor: colors.winDim },
  tagDoneText: { color: colors.win },
  progressRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  bar: { flex: 1, alignSelf: "center" },
  count: { ...type.tableNumStrong, color: colors.textPrimary, flexShrink: 0 },
  foot: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 32 },
  reward: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.yellowCard,
  },
  rewardText: { ...type.label, fontFamily: fonts.bold, color: colors.inkBlock },
  rewardStar: { backgroundColor: colors.warnDim, borderWidth: hairline, borderColor: colors.warn },
  rewardStarText: { color: colors.warn },
  rewardDone: { backgroundColor: colors.winDim, borderWidth: 0 },
  rewardTextDone: { color: colors.win },
  go: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingLeft: space.md,
    paddingRight: space.sm,
    minHeight: 32,
    borderRadius: radius.pill,
  },
  goText: { ...type.label, fontFamily: fonts.bold, color: colors.textOnBrand },
  hint: { ...type.caption, color: colors.textTertiary, maxWidth: 150 },
  doneText: { ...type.caption, color: colors.win },
});
