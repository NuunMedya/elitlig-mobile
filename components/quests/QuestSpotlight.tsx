/**
 * HAFTALIK GÖREVLER VİTRİNİ — Yönetim sekmesinin en üstü.
 *
 * NE: grafit sahnede haftanın görev durumu tek bakışta:
 *   · başlık + haftanın bitimine kalan süre + Elit Seviye rozeti,
 *   · "N/40 görev · bu hafta +X XP" ve bonus durakları (10, 20, 30, 40.
 *     görevde ek XP) olan ilerleme yolu,
 *   · bitmeye en yakın görevlerin yatay kart şeridi — karta dokununca görevi
 *     yapmanın yeri açılır (tahmin, oyun, maç al…),
 *   · "Tüm görevler" → /gorevler.
 *
 * NEDEN BURADA: görevler eskiden Menü ▸ Oyun merkezi ▸ Elit Kariyer'in bir
 * sekmesindeydi (üç dokunuş). XP'nin asıl kaynağı oldukları için en sık
 * açılan bölümün en üstüne alındı; her rol (başkan, oyuncu, yönetim) görür.
 *
 * Veri: GET /api/career/me (["career","me"] — Elit Kariyer ile aynı önbellek).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { memo, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { GradientFill, Skeleton, Touchable, withAlpha } from "@/components/ui";
import { getMyCareer, type CareerLayer, type CareerQuest, type CareerSummary } from "@/lib/api/career";
import { LAYER_ICON, LAYER_TITLES, openXp, questRoute, sortByCloseness, timeLeft, weekXp, weeklyOf } from "@/lib/quests";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, radius, space, textScale, type, upperTR } from "@/theme";

const LAYER_TINT: Record<CareerLayer, string> = { saha: colors.win, tribun: colors.info, arena: colors.brandOnDark };
const RAIL_LIMIT = 8;

export function QuestSpotlight() {
  const auth = useAuth();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["career", "me"],
    queryFn: getMyCareer,
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });

  if (!auth.user) {
    return (
      <Touchable onPress={() => router.push("/giris")} style={styles.stage} accessibilityRole="button">
        <GradientFill tone="ink" />
        <View style={styles.guest}>
          <Ionicons name="flash" size={28} color={colors.yellowCard} />
          <View style={styles.flex}>
            <Text style={styles.title} {...textScale.dense}>Haftalık görevler</Text>
            <Text style={styles.sub} {...textScale.dense}>
              Giriş yap; maç, tahmin ve oyun görevleriyle her hafta XP kazan, Elit Seviye'ni yükselt.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.onDarkMuted} />
        </View>
      </Touchable>
    );
  }

  if (query.isLoading) {
    return (
      <View style={styles.stage}>
        <GradientFill tone="ink" />
        <Skeleton height={20} width="60%" />
        <Skeleton height={10} style={styles.skelGap} />
        <Skeleton height={110} style={styles.skelGap} />
      </View>
    );
  }
  if (!query.data) return null;
  return <Spotlight data={query.data} onOpen={(href) => router.push(href as never)} />;
}

function Spotlight({
  data,
  onOpen,
}: {
  data: CareerSummary;
  onOpen: (href: string) => void;
}) {
  const weekly = useMemo(() => weeklyOf(data), [data]);
  const rail = useMemo(() => sortByCloseness(weekly.active).slice(0, RAIL_LIMIT), [weekly.active]);
  const left = timeLeft(data.week?.ends_at);
  const thisWeek = weekXp(data);
  const remaining = openXp(weekly);
  const total = Math.max(1, weekly.total);
  const pct = Math.min(1, weekly.done_count / total);

  return (
    <View style={styles.stage}>
      <GradientFill tone="ink" />

      {/* Başlık satırı */}
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.overline} {...textScale.badge}>{upperTR("Haftalık görevler")}</Text>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {weekly.done_count}/{weekly.total} görev
            {thisWeek != null ? <Text style={styles.titleXp}>{`  ·  +${thisWeek.toLocaleString("tr-TR")} XP`}</Text> : null}
          </Text>
        </View>
        <Touchable onPress={() => onOpen("/kariyer")} style={styles.level} accessibilityRole="button" accessibilityLabel={`Elit Seviye ${data.level.level}`}>
          <Text style={styles.levelLabel} {...textScale.badge}>SEVİYE</Text>
          <Text style={styles.levelValue} {...textScale.badge}>{data.level.level}</Text>
        </Touchable>
      </View>

      {/* İlerleme yolu + bonus durakları */}
      <View style={styles.trackWrap}>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${pct * 100}%` }]} />
        </View>
        {weekly.bonuses.map((bonus) => {
          const at = Math.min(1, bonus.at / total);
          return (
            <View key={bonus.at} style={[styles.node, { left: `${at * 100}%` }]} pointerEvents="none">
              <View style={[styles.nodeDot, bonus.earned ? styles.nodeDotOn : null]}>
                <Ionicons name={bonus.earned ? "checkmark" : "gift"} size={11} color={bonus.earned ? colors.inkBlock : colors.onDarkMuted} />
              </View>
              <Text style={[styles.nodeText, bonus.earned ? styles.nodeTextOn : null]} {...textScale.badge}>+{bonus.xp}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.metaRow}>
        {left ? (
          <View style={styles.meta}>
            <Ionicons name="time-outline" size={13} color={colors.onDarkMuted} />
            <Text style={styles.metaText} {...textScale.badge}>{left} kaldı</Text>
          </View>
        ) : null}
        {remaining > 0 ? (
          <View style={styles.meta}>
            <Ionicons name="flash" size={13} color={colors.yellowCard} />
            <Text style={styles.metaText} {...textScale.badge}>{remaining.toLocaleString("tr-TR")} XP seni bekliyor</Text>
          </View>
        ) : null}
      </View>

      {/* Görev kartları */}
      {rail.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} decelerationRate="fast" snapToInterval={CARD_W + space.sm}>
          {rail.map((quest) => (
            <QuestCard key={quest.code} quest={quest} onOpen={onOpen} />
          ))}
          <Touchable onPress={() => onOpen("/gorevler")} style={[styles.card, styles.moreCard]} accessibilityRole="button">
            <Ionicons name="list" size={22} color={colors.brandOnDark} />
            <Text style={styles.moreText} {...textScale.dense}>Tüm görevler</Text>
            {weekly.locked ? <Text style={styles.moreSub} {...textScale.badge}>sırada {weekly.locked} görev daha</Text> : null}
          </Touchable>
        </ScrollView>
      ) : (
        <Touchable onPress={() => onOpen("/gorevler")} style={styles.allDone} accessibilityRole="button">
          <Ionicons name="trophy" size={22} color={colors.yellowCard} />
          <Text style={styles.allDoneText} {...textScale.dense}>Bu haftanın bütün görevleri bitti! Yeni görevler Pazartesi.</Text>
        </Touchable>
      )}

      <Touchable onPress={() => onOpen("/gorevler")} style={styles.cta} accessibilityRole="button" haptic="selection">
        <Text style={styles.ctaText} {...textScale.dense}>Tüm görevler ve takım görevleri</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.textOnBrand} />
      </Touchable>
    </View>
  );
}

const CARD_W = 196;

const QuestCard = memo(function QuestCard({ quest, onOpen }: { quest: CareerQuest; onOpen: (href: string) => void }) {
  const tint = LAYER_TINT[quest.layer];
  const route = questRoute(quest);
  const ratio = quest.target ? Math.min(1, quest.progress / quest.target) : 0;
  return (
    <Touchable
      onPress={() => onOpen((route as string) ?? "/gorevler")}
      haptic="selection"
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${quest.title}. ${quest.progress} / ${quest.target}. ${quest.xp} XP`}
    >
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, { backgroundColor: withAlpha(tint, 0.18) }]}>
          <Ionicons name={LAYER_ICON[quest.layer]} size={16} color={tint} />
        </View>
        <Text style={[styles.cardLayer, { color: tint }]} {...textScale.badge}>{upperTR(LAYER_TITLES[quest.layer])}</Text>
        <View style={styles.xp}>
          <Text style={styles.xpText} {...textScale.badge}>+{quest.xp} XP</Text>
        </View>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2} {...textScale.dense}>{quest.title}</Text>
      <View style={styles.cardBar}>
        <View style={[styles.cardBarFill, { width: `${ratio * 100}%`, backgroundColor: tint }]} />
      </View>
      <View style={styles.cardFoot}>
        <Text style={styles.cardCount} {...textScale.badge}>
          {quest.progress.toLocaleString("tr-TR")}/{quest.target.toLocaleString("tr-TR")}
        </Text>
        {route ? (
          <View style={styles.go}>
            <Text style={styles.goText} {...textScale.badge}>Yap</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.brandOnDark} />
          </View>
        ) : null}
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stage: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
    padding: space.lg,
    gap: space.md,
  },
  skelGap: { marginTop: space.sm },
  guest: { flexDirection: "row", alignItems: "center", gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  overline: { ...type.overline, color: colors.yellowCard },
  title: { ...type.h2, fontFamily: fonts.bold, color: colors.onDark },
  titleXp: { ...type.h3, color: colors.brandOnDark },
  sub: { ...type.bodySm, color: colors.onDarkMuted, marginTop: 2 },
  level: {
    alignItems: "center",
    justifyContent: "center",
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.yellowCard,
    backgroundColor: colors.inkTile,
  },
  levelLabel: { ...type.nano, color: colors.onDarkMuted },
  levelValue: { ...type.h1, fontFamily: fonts.bold, color: colors.onDark },
  trackWrap: { height: 34, justifyContent: "flex-start", marginTop: space.xs },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.inkTile, overflow: "hidden", marginTop: 6 },
  trackFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.yellowCard },
  node: { position: "absolute", top: 0, alignItems: "center", marginLeft: -11, width: 22 },
  nodeDot: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  nodeDotOn: { backgroundColor: colors.yellowCard, borderColor: colors.yellowCard },
  nodeText: { ...type.nano, color: colors.onDarkMuted, marginTop: 1, width: 40, textAlign: "center" },
  nodeTextOn: { color: colors.yellowCard },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  meta: { flexDirection: "row", alignItems: "center", gap: space.xs },
  metaText: { ...type.caption, color: colors.onDarkMuted },
  rail: { gap: space.sm, paddingRight: space.sm },
  card: {
    width: CARD_W,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space.xs },
  cardIcon: { width: 26, height: 26, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  cardLayer: { ...type.micro, flex: 1 },
  xp: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.yellowCard },
  xpText: { ...type.micro, fontFamily: fonts.bold, color: colors.inkBlock },
  cardTitle: { ...type.label, color: colors.onDark, minHeight: 36 },
  cardBar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.inkPill, overflow: "hidden" },
  cardBarFill: { height: 6, borderRadius: radius.pill },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardCount: { ...type.caption, color: colors.onDarkMuted },
  go: { flexDirection: "row", alignItems: "center", gap: 2 },
  goText: { ...type.micro, color: colors.brandOnDark },
  moreCard: { width: 132, alignItems: "center", justifyContent: "center" },
  moreText: { ...type.label, color: colors.onDark, textAlign: "center" },
  moreSub: { ...type.micro, color: colors.onDarkMuted, textAlign: "center" },
  allDone: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.inkTile },
  allDoneText: { ...type.bodySm, color: colors.onDark, flex: 1 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  ctaText: { ...type.label, color: colors.textOnBrand },
});
