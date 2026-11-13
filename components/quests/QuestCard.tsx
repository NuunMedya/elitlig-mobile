/**
 * GÖREV KARTI — /gorevler listesinin satırı.
 *
 *   ┃[degrade simge]  SAHA            [ORTA ●●○]   YENİ
 *   ┃                 Başlık (iki satır)
 *   ┃                 açıklama (iki satır)
 *   ┃  2 / 5 maç                                       %40
 *   ┃  ▰▰▰▰▰▱▱▱▱▱▱▱▱ (kategori degradesi)
 *   ┃  ──────────────────────────────────────────────────
 *   ┃  ÖDÜL  ⚡ +75 XP  ★ +5                    [ Yap → ]
 *
 * Gece teması (ikinci tur): simge `IconTile` degrade karosu, zorluk tonlu hap
 * (kolay = win, orta = warn, zor = danger), çubuk kategori degradesi, ödül
 * satırı ayraçla ayrılmış bir "ödül kuşağı"; sol kenarda 3 px kategori şeridi
 * kartın kimliğini liste kayarken de taşır.
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
import { LinearGradient } from "expo-linear-gradient";
import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { IconTile, Touchable, useReduceMotion, withAlpha, type IconTileTone, type Tone, toneColors } from "@/components/ui";
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

/** Kategori → degrade karo tonu (Gece teması IconTile). */
export const QUEST_TILE_TONE: Record<QuestCategory, IconTileTone> = {
  saha: "mint",
  oyun: "violet",
  sehir: "gold",
  tribun: "cyan",
  kesif: "cyan",
};

/** Kategori degradesi — ilerleme çubuğu ve şerit. */
export const questGradient = (category: QuestCategory): readonly [string, string] => colors.tileTones[QUEST_TILE_TONE[category]];

const DIFFICULTY_TONE: Record<QuestDifficulty, Tone> = { kolay: "win", orta: "warn", zor: "danger" };
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
  const gradient = quest.done ? colors.tileTones.mint : questGradient(category);
  const ratio = quest.target ? Math.min(1, quest.progress / quest.target) : 0;
  const percent = Math.round(ratio * 100);
  const difficulty = difficultyOf(quest);
  const diff = toneColors(DIFFICULTY_TONE[difficulty]);
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
      {/* Sol kenar: kategori şeridi (biten görevde yeşil). */}
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.strip} />

      <View style={styles.head}>
        <View style={styles.iconWrap}>
          <IconTile
            icon={quest.done ? "checkmark" : questIcon(quest)}
            tone={quest.done ? "mint" : QUEST_TILE_TONE[category]}
            size={44}
            glow={!quest.done}
          />
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
            <Text style={[styles.category, { color: tint }]} numberOfLines={1} {...textScale.badge}>
              {upperTR(QUEST_CATEGORY_LABEL[category])}
            </Text>
            {/* Zorluk hapı: tonlu zemin + üç basamak. */}
            <View style={[styles.diff, { backgroundColor: diff.dim }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.pips}>
                {[1, 2, 3].map((step) => (
                  <View
                    key={step}
                    style={[styles.pip, { backgroundColor: step <= DIFFICULTY_STEP[difficulty] ? diff.fg : withAlpha(diff.fg, 0.25) }]}
                  />
                ))}
              </View>
              <Text style={[styles.diffText, { color: diff.fg }]} {...textScale.badge}>
                {upperTR(DIFFICULTY_LABEL[difficulty])}
              </Text>
            </View>
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
        <View style={styles.progress}>
          <View style={styles.progressHead}>
            <Text style={styles.count} numberOfLines={1} {...textScale.badge}>
              {progressText(quest)}
            </Text>
            <Text style={[styles.percent, { color: tint }]} {...textScale.badge}>
              %{percent}
            </Text>
          </View>
          <QuestBar value={ratio} color={tint} gradient={gradient} height={8} delay={Math.min(index, 8) * 30} />
        </View>
      ) : null}

      <View style={styles.foot}>
        <Text style={styles.footLabel} {...textScale.badge}>
          {upperTR(quest.done ? "Kazanıldı" : "Ödül")}
        </Text>
        <View style={[styles.reward, quest.done ? styles.rewardDone : null]}>
          <Ionicons name={quest.done ? "checkmark-circle" : "flash"} size={13} color={quest.done ? colors.win : colors.medalInk} />
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
            {fresh ? "Hesabına yazıldı" : "Alındı"}
          </Text>
        ) : onOpen ? (
          <Touchable
            onPress={() => onOpen(quest)}
            style={styles.go}
            haptic="selection"
            feedback="button"
            accessibilityRole="button"
            accessibilityLabel={`${label}. Görevi yap`}
            hitSlop={8}
          >
            <LinearGradient colors={colors.gradientBrand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.goText} {...textScale.badge}>
              Yap
            </Text>
            <Ionicons name="arrow-forward" size={13} color={colors.textOnBrand} />
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
    gap: space.md,
    paddingVertical: space.md,
    paddingLeft: space.md + space.xs,
    paddingRight: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  cardDone: { backgroundColor: colors.surface2, borderColor: colors.border },
  cardFresh: { borderColor: colors.win, backgroundColor: colors.winDim },
  strip: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  iconWrap: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  spark: { position: "absolute" },
  body: { flex: 1, gap: space.xxs },
  meta: { flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 20 },
  category: { ...type.micro, fontFamily: fonts.bold, flexShrink: 1 },
  diff: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.s,
    height: 18,
    borderRadius: radius.pill,
  },
  diffText: { ...type.micro },
  pips: { flexDirection: "row", gap: space.px },
  pip: { width: 4, height: 8, borderRadius: radius.pill },
  title: { ...type.h3, color: colors.textPrimary },
  titleDone: { color: colors.textSecondary },
  desc: { ...type.bodySm, color: colors.textSecondary },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.s,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
  },
  tagText: { ...type.micro, color: colors.brandAccent },
  tagFeatured: { backgroundColor: colors.warnDim },
  tagFeaturedText: { color: colors.warn },
  tagDone: { backgroundColor: colors.winDim },
  tagDoneText: { color: colors.win },
  progress: { gap: space.xs },
  progressHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  count: { ...type.tableNumStrong, color: colors.textPrimary, flexShrink: 1 },
  percent: { ...type.numSmStrong },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 34,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  footLabel: { ...type.overline, color: colors.textTertiary, marginRight: space.xxs },
  reward: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.sm,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.yellowCard,
  },
  rewardText: { ...type.labelSm, fontFamily: fonts.bold, color: colors.medalInk },
  rewardStar: { backgroundColor: colors.warnDim, borderWidth: hairline, borderColor: colors.warn },
  rewardStarText: { color: colors.warn },
  rewardDone: { backgroundColor: colors.winDim, borderWidth: 0 },
  rewardTextDone: { color: colors.win },
  go: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingLeft: space.lg,
    paddingRight: space.md,
    height: 34,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  goText: { ...type.label, fontFamily: fonts.bold, color: colors.textOnBrand },
  hint: { ...type.caption, color: colors.textTertiary, maxWidth: 150 },
  doneText: { ...type.caption, color: colors.win },
});
