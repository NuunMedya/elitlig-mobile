/**
 * GÖREV KARTI (kâğıt) — /gorevler listesinin satırı.
 *
 *   [kategori pulu]  Başlık                          +75 XP
 *                    açıklama (iki satır)
 *                    ●●○ Orta · Yeni · Haftanın oyunu
 *                    ▰▰▰▰▱▱▱  2/5                     [ Git › ]
 *
 * Renk kategori kimliğidir (saha · oyun · tribün · keşif); biten görev `win`e
 * döner. "Git" yalnız görevin yapılacağı ekran biliniyorsa çizilir; yoksa
 * nerede sayıldığını söyleyen kısa bir ipucu durur ("Sahada tamamlanır").
 *
 * `fresh`: bu açılışta ilk kez görülen biten görev — kart bir kez yaylanır
 * ("Hareketi azalt" açıksa yaylanmaz).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { Touchable, useReduceMotion, withAlpha } from "@/components/ui";
import type { CareerQuest, QuestCategory } from "@/lib/api/career";
import { QUEST_CATEGORY_ICON, QUEST_CATEGORY_LABEL, TIER_LABEL, categoryOf, questHint } from "@/lib/quests";
import { colors, fonts, hairline, radius, space, spring, textScale, type, upperTR } from "@/theme";

import { QuestBar } from "./QuestProgress";

export const QUEST_CATEGORY_TINT: Record<QuestCategory, string> = {
  saha: colors.win,
  oyun: colors.brandAccent,
  tribun: colors.info,
  kesif: colors.accent,
};

const formatInt = (value: number) => value.toLocaleString("tr-TR");

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
  const tint = quest.done ? colors.win : QUEST_CATEGORY_TINT[category];
  const ratio = quest.target ? Math.min(1, quest.progress / quest.target) : 0;
  const tier = quest.tier ?? 1;
  const hint = questHint(quest);
  const reduceMotion = useReduceMotion();
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!fresh || reduceMotion) return;
    pop.setValue(0.94);
    const run = Animated.spring(pop, { toValue: 1, ...spring.bounce });
    run.start();
    return () => run.stop();
  }, [fresh, reduceMotion, pop]);

  const label = `${quest.title}. ${quest.description}. ${
    quest.done ? "Tamamlandı" : `${formatInt(quest.progress)} / ${formatInt(quest.target)}`
  }. ${quest.xp} XP. ${TIER_LABEL[tier] ?? ""}${quest.is_new && !quest.done ? ". Bu hafta yeni" : ""}`;

  return (
    <Animated.View
      style={[styles.card, fresh ? styles.cardFresh : null, { transform: [{ scale: pop }] }]}
      accessible={!onOpen}
      accessibilityLabel={onOpen ? undefined : label}
    >
      <View style={[styles.icon, { backgroundColor: withAlpha(tint, 0.14) }]}>
        <Ionicons name={quest.done ? "checkmark" : QUEST_CATEGORY_ICON[category]} size={20} color={tint} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, quest.done ? styles.titleDone : null]} numberOfLines={2} {...textScale.dense}>
            {quest.title}
          </Text>
          <View style={[styles.xp, quest.done ? styles.xpDone : null]}>
            <Text style={[styles.xpText, quest.done ? styles.xpTextDone : null]} {...textScale.badge}>
              +{quest.xp} XP
            </Text>
          </View>
        </View>

        <Text style={styles.desc} numberOfLines={2} {...textScale.dense}>
          {quest.description}
        </Text>

        <View style={styles.meta}>
          <View style={styles.pips} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[1, 2, 3].map((step) => (
              <View key={step} style={[styles.pip, step <= tier ? { backgroundColor: tint } : null]} />
            ))}
          </View>
          <Text style={styles.metaText} {...textScale.badge}>
            {upperTR(`${TIER_LABEL[tier] ?? "Kolay"} · ${QUEST_CATEGORY_LABEL[category]}`)}
          </Text>
          {quest.is_new && !quest.done ? (
            <View style={styles.tag}>
              <Text style={styles.tagText} {...textScale.badge}>
                {upperTR("Yeni")}
              </Text>
            </View>
          ) : null}
          {quest.featured && !quest.done ? (
            <View style={[styles.tag, styles.tagFeatured]}>
              <Ionicons name="star" size={9} color={colors.warn} />
              <Text style={[styles.tagText, styles.tagFeaturedText]} {...textScale.badge}>
                {upperTR("Haftanın oyunu")}
              </Text>
            </View>
          ) : null}
        </View>

        {quest.done ? (
          <View style={styles.doneRow}>
            <Ionicons name="checkmark-circle" size={14} color={colors.win} />
            <Text style={styles.doneText} {...textScale.dense}>
              {fresh ? "Yeni tamamlandı · XP hesabına yazıldı" : "Tamamlandı · XP hesabına yazıldı"}
            </Text>
          </View>
        ) : (
          <View style={styles.progressRow}>
            <QuestBar value={ratio} color={tint} delay={Math.min(index, 8) * 30} style={styles.flex} />
            <Text style={styles.count} {...textScale.badge}>
              {formatInt(quest.progress)}/{formatInt(quest.target)}
            </Text>
            {onOpen ? (
              <Touchable
                onPress={() => onOpen(quest)}
                style={styles.go}
                haptic="selection"
                feedback="button"
                accessibilityRole="button"
                accessibilityLabel={`${label}. Göreve git`}
                hitSlop={8}
              >
                <Text style={styles.goText} {...textScale.badge}>
                  Git
                </Text>
                <Ionicons name="chevron-forward" size={12} color={colors.textOnBrand} />
              </Touchable>
            ) : hint ? (
              <Text style={styles.hint} numberOfLines={1} {...textScale.badge}>
                {hint}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  cardFresh: { borderColor: colors.win, backgroundColor: colors.winDim },
  icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: space.xs },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  title: { ...type.h3, color: colors.textPrimary, flex: 1 },
  titleDone: { color: colors.textSecondary },
  desc: { ...type.bodySm, color: colors.textSecondary },
  xp: { paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.yellowCard },
  xpDone: { backgroundColor: colors.winDim },
  xpText: { ...type.micro, fontFamily: fonts.bold, color: colors.inkBlock },
  xpTextDone: { color: colors.win },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.s },
  pips: { flexDirection: "row", gap: space.xxs },
  pip: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  metaText: { ...type.micro, color: colors.textTertiary },
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
  progressRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs, minHeight: 26 },
  count: { ...type.tableNumStrong, color: colors.textSecondary },
  go: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingLeft: space.md,
    paddingRight: space.sm,
    minHeight: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  goText: { ...type.label, color: colors.textOnBrand },
  hint: { ...type.caption, color: colors.textTertiary, maxWidth: 130 },
  doneRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs },
  doneText: { ...type.caption, color: colors.win, flex: 1 },
});
