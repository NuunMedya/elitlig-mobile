/**
 * KARİYERİM — Kariyer Modu (GET /api/career/me).
 *
 * Ekran üç sekmeye ayrılır; üstte her zaman Elit Seviye özeti durur:
 *
 *   Özet       Elit Seviye + üç katman (Saha, Seyirci, Oyunlar): toplam XP
 *              ve bu haftaki artış yan yana. Saha dışı XP seviyeyi en çok
 *              30'a taşır; üstü sahadan gelir.
 *   Görevler   40 görevlik haftalık sıra: 20 görev aynı anda açık, biten
 *              görevin yerine yenisi gelir; 10, 20, 30 ve 40 görevde bonus. Göreve dokununca görevin
 *              yapılacağı ekran açılır (Tahmin Ligi, Fantezi, oyun…).
 *              Altında "XP nasıl kazanılır?" (her maç / oyun / tahminin
 *              standart XP'si).
 *   Kariyer    Elit Kart, tüm zamanlar kariyer görevleri (kademeli), Sezon
 *              Özeti, son XP hareketleri.
 *   Takım      takımın haftalık ve aylık ortak görevleri (maç talebi, maç
 *              almak, maç sayısı, kadro, katılım), takım puanı, Türkiye ve
 *              il sırası; Saha Sıralaması ekranına geçiş.
 *   Rozetler   Kupa Dolabı, katmana göre süzülür.
 *
 * Ekranın her açılışı sunucuda XP defterini eşitler; yeni açılan rozetler
 * bir bildirimle kutlanır.
 *
 * KARİYERİM KÖPRÜSÜ: `/kariyer?tab=kariyer|rozetler|takim` doğrudan o sekmeyi
 * açar (Yönetim ▸ Kariyerim'deki OVR rozeti ve seviye çubuğu buraya gelir);
 * Kariyer sekmesindeki kısayollar da geri, Kariyerim / Maçlarım / Profilim'e
 * götürür. İki ekran aynı ["career","me"] önbelleğini okur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EliteCard } from "@/components/career/EliteCard";
import {
  Aurora,
  Button,
  Chip,
  ChipGroup,
  ErrorState,
  GradientBar,
  IconTile,
  Odometer,
  Reveal,
  SectionHeader,
  type IconTileTone,
  ScreenHeader,
  SegmentedControl,
  SkeletonCard,
  Touchable,
  useHeaderScroll,
  useRefresh,
  useToast,
  withAlpha,
  type SegmentedItem,
} from "@/components/ui";
import {
  getMyCareer,
  getMyTeamQuests,
  LAYER_LABELS,
  type PeriodKind,
  type TeamQuest,
  type CareerAchievement,
  type CareerChain,
  type CareerLayer,
  type CareerQuest,
  type CareerSummary,
  type StandardXpRule,
} from "@/lib/api/career";
import { questRoute } from "@/lib/quests";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, glowStyle, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

const LAYER_ORDER: CareerLayer[] = ["saha", "tribun", "arena"];
const LAYER_ICONS: Record<CareerLayer, keyof typeof Ionicons.glyphMap> = { saha: "football", tribun: "analytics", arena: "game-controller" };
const LAYER_COLORS: Record<CareerLayer, string> = { saha: colors.win, tribun: colors.info, arena: colors.accent };
/** Katman → degrade karo tonu (Gece teması). */
const LAYER_TILE: Record<CareerLayer, IconTileTone> = { saha: "mint", tribun: "cyan", arena: "violet" };
const layerGradient = (layer: CareerLayer) => colors.tileTones[LAYER_TILE[layer]];
const CHAIN_PREVIEW = 5;

type Tab = "gorevler" | "takim" | "kariyer" | "rozetler";
const TAB_KEYS: Tab[] = ["gorevler", "takim", "kariyer", "rozetler"];
/** `?tab=` derin bağlantısı: Kariyerim panelindeki Elit Kart / OVR kapıları
 *  doğrudan Kariyer sekmesini açar. Bilinmeyen değer Görevler'e düşer. */
const resolveTab = (raw: unknown): Tab => {
  const value = String(Array.isArray(raw) ? raw[0] : raw ?? "").toLowerCase();
  return (TAB_KEYS as string[]).includes(value) ? (value as Tab) : "gorevler";
};

const TABS: SegmentedItem<Tab>[] = [
  { key: "gorevler", label: "Görevler" },
  { key: "takim", label: "Takım" },
  { key: "kariyer", label: "Kariyer" },
  { key: "rozetler", label: "Rozetler" },
];

export default function CareerScreen() {
  const auth = useAuth();
  const toast = useToast();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ tab?: string }>();
  const routeTab = resolveTab(params.tab);
  const [tab, setTab] = useState<Tab>(routeTab);
  useEffect(() => setTab(routeTab), [routeTab]);

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

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Elit Kariyer" back scrollY={scrollY} />
      {query.isLoading ? (
        <View style={styles.pad}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={6} />
        </View>
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
          <LevelHero data={data} />
          <SegmentedControl items={TABS} value={tab} onChange={setTab} stretch />
          {tab === "gorevler" ? (
            <QuestsTab data={data} />
          ) : tab === "takim" ? (
            <TeamTab />
          ) : tab === "kariyer" ? (
            <CareerTab data={data} />
          ) : (
            <BadgesTab data={data} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ═══════════════════════════ ÖZET ═══════════════════════════ */

function LevelHero({ data }: { data: CareerSummary }) {
  const { level } = data;
  const remaining = level.next ? level.next - level.xp : 0;
  const weekTotal = data.layers_week ? LAYER_ORDER.reduce((sum, layer) => sum + (data.layers_week?.[layer] ?? 0), 0) : null;
  return (
    <Reveal>
      <View style={styles.hero}>
        <LinearGradient colors={colors.gradientInk} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Aurora variant="stage" style={StyleSheet.absoluteFill} />
        <View style={styles.heroTop}>
          {/* Seviye madalyonu: imza degradeli halka + koyu çekirdek. */}
          <View style={styles.levelRing} accessible accessibilityLabel={`Elit Seviye ${level.level}`}>
            <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.levelCore}>
              <Text style={styles.levelSmall} {...textScale.badge}>
                {upperTR("Seviye")}
              </Text>
              <Odometer value={level.level} style={styles.levelNumber} />
            </View>
          </View>
          <View style={styles.flex}>
            <Text style={styles.heroOver} {...textScale.badge}>
              {upperTR("Elit Seviye")}
            </Text>
            <View style={styles.heroXpRow}>
              <Odometer value={level.xp.toLocaleString("tr-TR")} style={styles.heroTitle} />
              <Text style={styles.heroUnit} {...textScale.badge}>
                XP
              </Text>
            </View>
            {weekTotal != null ? (
              <Text style={styles.heroWeek} {...textScale.dense}>
                {`▲ +${weekTotal.toLocaleString("tr-TR")} bu hafta`}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.heroBar}>
          <View style={styles.heroBarHead}>
            <Text style={styles.heroSub} {...textScale.dense}>
              {level.next ? `Seviye ${level.level + 1}` : "En üst seviye"}
            </Text>
            <Text style={styles.heroSubStrong} {...textScale.badge}>
              {level.next ? `${remaining.toLocaleString("tr-TR")} XP kaldı` : "Tamam"}
            </Text>
          </View>
          <GradientBar value={level.progress} height={8} track={colors.inkTile} />
        </View>
        <View style={styles.layers}>
          {LAYER_ORDER.map((layer) => (
            <View key={layer} style={styles.layer}>
              <View style={styles.layerHead}>
                <IconTile icon={LAYER_ICONS[layer]} tone={LAYER_TILE[layer]} size={22} glow={false} />
                <Text style={styles.layerName} numberOfLines={1} {...textScale.badge}>
                  {upperTR(LAYER_LABELS[layer])}
                </Text>
              </View>
              <Odometer value={(data.layers[layer] ?? 0).toLocaleString("tr-TR")} style={styles.layerXp} />
              {data.layers_week ? (
                <Text style={[styles.layerWeek, (data.layers_week[layer] ?? 0) > 0 ? styles.layerWeekUp : null]} {...textScale.dense}>
                  {(data.layers_week[layer] ?? 0) > 0 ? `▲ +${(data.layers_week[layer] ?? 0).toLocaleString("tr-TR")}` : "—"}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        {level.fan_capped ? (
          <Text style={styles.heroNote} {...textScale.long}>
            {`Saha dışı XP (görevler, tribün) seviye ${level.fan_level_cap}'a kadar sayılır; daha yukarısı sahadaki maçlarınla açılır.`}
          </Text>
        ) : null}
      </View>
    </Reveal>
  );
}

/* ═══════════════════════════ GÖREVLER ═══════════════════════════ */

function QuestsTab({ data }: { data: CareerSummary }) {
  const router = useRouter();
  const [showCompleted, setShowCompleted] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // Eski sunucu weekly_quests göndermez: düz listeden kurulur.
  const weekly = useMemo(() => {
    if (data.weekly_quests) return data.weekly_quests;
    const completed = data.quests.filter((quest) => quest.done);
    return { active: data.quests.filter((quest) => !quest.done), completed, revealed: data.quests.length, total: data.quests.length, done_count: completed.length, locked: 0, bonuses: [] };
  }, [data]);
  const open = (quest: CareerQuest) => {
    const route = questRoute(quest);
    if (route) router.push(route);
  };

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle} {...textScale.dense}>
              Haftalık görevler
            </Text>
            <Text style={styles.caption} {...textScale.dense}>
              {`${formatDateShort(data.week.ends_at)} yenilenir`}
            </Text>
          </View>
          <Text style={styles.counter} {...textScale.dense}>
            {`${weekly.done_count}/${weekly.total}`}
          </Text>
        </View>
        <Segments total={weekly.total} done={weekly.done_count} />
        {weekly.bonuses.length ? (
          <View style={styles.bonusRow}>
            {weekly.bonuses.map((bonus) => (
              <View key={bonus.at} style={[styles.bonus, bonus.earned && styles.bonusEarned]}>
                <Ionicons name={bonus.earned ? "checkmark-circle" : "gift-outline"} size={13} color={bonus.earned ? colors.win : colors.textTertiary} />
                <Text style={[styles.bonusText, bonus.earned && styles.bonusTextEarned]} {...textScale.dense}>
                  {`${bonus.at} görev · +${bonus.xp} XP`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.list}>
        {weekly.active.map((quest, index) => (
          <QuestRow key={quest.code} quest={quest} first={index === 0} onPress={questRoute(quest) ? () => open(quest) : undefined} />
        ))}
        {!weekly.active.length ? (
          <View style={styles.emptyRow}>
            <Ionicons name="sparkles" size={20} color={colors.win} />
            <Text style={[styles.flex, styles.caption]} {...textScale.long}>
              Bu haftanın bütün görevleri bitti. Yeni görevler Pazartesi gelir.
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.note} {...textScale.long}>
        {weekly.locked ? `Bir görevi bitirince yerine yenisi gelir · sırada ${weekly.locked} görev var.` : "Bu haftanın bütün görevleri açıldı."}
      </Text>

      {weekly.completed.length ? (
        <>
          <Toggle open={showCompleted} label={`Tamamlananlar · ${weekly.completed.length}`} onPress={() => setShowCompleted((value) => !value)} />
          {showCompleted ? (
            <View style={styles.list}>
              {weekly.completed.map((quest, index) => (
                <QuestRow key={quest.code} quest={quest} first={index === 0} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.shortcuts}>
        <Shortcut icon="game-controller-outline" tone="violet" label="Oyun merkezi" onPress={() => router.push("/(tabs)/oyunlar")} />
        <Shortcut icon="podium-outline" tone="cyan" label="XP sıralaması" onPress={() => router.push("/saha-siralamasi?type=xp")} />
      </View>

      {data.rules.standard?.length ? (
        <>
          <Toggle open={showRules} label="XP nasıl kazanılır?" icon="information-circle-outline" onPress={() => setShowRules((value) => !value)} />
          {showRules ? <XpRules rules={data.rules.standard} /> : null}
        </>
      ) : null}
    </>
  );
}

/** 20 parçalı ilerleme şeridi; 10. ve 20. parça bonus eşiğidir. */
function Segments({ total, done }: { total: number; done: number }) {
  return (
    <View style={styles.segments}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[styles.segment, index < done && styles.segmentDone, (index + 1) % 10 === 0 && index >= done && styles.segmentGoal]}
        />
      ))}
    </View>
  );
}

function QuestRow({ quest, first, onPress }: { quest: CareerQuest; first?: boolean; onPress?: () => void }) {
  const color = quest.done ? colors.win : LAYER_COLORS[quest.layer];
  const body = (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <IconTile icon={quest.done ? "checkmark" : LAYER_ICONS[quest.layer]} tone={quest.done ? "mint" : LAYER_TILE[quest.layer]} size={36} glow={false} />
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, quest.done && styles.rowTitleDone]} numberOfLines={2} {...textScale.dense}>
          {quest.title}
        </Text>
        <Text style={styles.caption} numberOfLines={1} {...textScale.dense}>
          {quest.done ? `${LAYER_LABELS[quest.layer]} · tamamlandı` : `${LAYER_LABELS[quest.layer]} · ${quest.progress.toLocaleString("tr-TR")}/${quest.target.toLocaleString("tr-TR")} · ${quest.description}`}
        </Text>
        {!quest.done && quest.target > 1 ? <Bar value={quest.progress / quest.target} color={color} gradient={layerGradient(quest.layer)} /> : null}
      </View>
      <View style={styles.rowEnd}>
        <Text style={[styles.xpPill, quest.done && styles.xpPillDone]} {...textScale.dense}>
          {`+${quest.xp}`}
        </Text>
        {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
      </View>
    </View>
  );
  return onPress ? (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${quest.title}, ${quest.progress}/${quest.target}`}>
      {body}
    </Touchable>
  ) : (
    body
  );
}

function XpRules({ rules }: { rules: StandardXpRule[] }) {
  return (
    <View style={styles.card}>
      {LAYER_ORDER.map((layer) => {
        const list = rules.filter((rule) => rule.layer === layer);
        if (!list.length) return null;
        return (
          <View key={layer} style={styles.rules}>
            <View style={styles.layerHead}>
              <Ionicons name={LAYER_ICONS[layer]} size={14} color={LAYER_COLORS[layer]} />
              <Text style={styles.rulesTitle} {...textScale.badge}>
                {upperTR(LAYER_LABELS[layer])}
              </Text>
            </View>
            {list.map((rule) => (
              <View key={rule.label} style={styles.ruleRow}>
                <Text style={[styles.flex, styles.ruleLabel]} {...textScale.long}>
                  {rule.label}
                </Text>
                <Text style={styles.ruleXp} {...textScale.dense}>
                  {`+${rule.xp}`}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/* ═══════════════════════════ TAKIM ═══════════════════════════ */

const PERIODS: SegmentedItem<PeriodKind>[] = [
  { key: "week", label: "Bu hafta" },
  { key: "month", label: "Bu ay" },
];

function TeamTab() {
  const router = useRouter();
  const [kind, setKind] = useState<PeriodKind>("week");
  const query = useQuery({ queryKey: ["career", "team"], queryFn: getMyTeamQuests, staleTime: 30_000 });

  if (query.isLoading) return <SkeletonCard lines={6} />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const data = query.data;
  if (!data.team || !data.periods) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle} {...textScale.dense}>
          Takım görevleri
        </Text>
        <Text style={styles.caption} {...textScale.long}>
          Oyuncu profilin bir takıma bağlı olduğunda takımının haftalık ve aylık görevleri burada görünür: maç alın, sahaya çıkın, kadroyu genişletin; takım sıralamasında yükselin.
        </Text>
        <Button label="Oyuncu profilimi bağla" icon="link-outline" variant="secondary" size="sm" onPress={() => router.push("/oyuncum/bagla")} />
        <Button label="Saha sıralaması" icon="podium-outline" variant="secondary" size="sm" onPress={() => router.push("/saha-siralamasi")} />
      </View>
    );
  }
  const period = data.periods[kind];
  const done = period.quests.filter((quest) => quest.done).length;
  const rank = period.rank;
  const rankText = rank
    ? [
        rank.turkey ? `Türkiye ${rank.turkey}. / ${rank.turkey_total}` : null,
        rank.city && rank.city_name ? `${rank.city_name} ${rank.city}. / ${rank.city_total}` : null,
      ].filter(Boolean).join("  ·  ")
    : "";
  const quests = [...period.quests].sort((a, b) => Number(a.done) - Number(b.done) || b.progress / b.target - a.progress / a.target);

  return (
    <>
      <SegmentedControl items={PERIODS} value={kind} onChange={setKind} stretch />
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
              {data.team.name}
            </Text>
            <Text style={styles.caption} {...textScale.dense}>
              {`${done}/${period.quests.length} görev · ${formatDateShort(period.ends_at)} yenilenir`}
            </Text>
          </View>
          <View style={styles.teamScore}>
            <Text style={styles.counter} {...textScale.dense}>
              {period.score.toLocaleString("tr-TR")}
            </Text>
            <Text style={styles.caption} {...textScale.badge}>
              {upperTR("takım puanı")}
            </Text>
          </View>
        </View>
        <Segments total={period.quests.length} done={done} />
        <View style={styles.teamStats}>
          <TeamStat icon="football-outline" label="Maç" value={period.metrics.matches} />
          <TeamStat icon="trophy-outline" label="Galibiyet" value={period.metrics.wins} />
          <TeamStat icon="calendar-outline" label="Talep" value={period.metrics.requests} />
          <TeamStat icon="people-outline" label="Oyuncu" value={period.metrics.players} />
        </View>
        {rankText ? (
          <Touchable onPress={() => router.push("/saha-siralamasi?type=teams")} accessibilityRole="button" accessibilityLabel={`Takım sırası: ${rankText}`}>
            <View style={styles.rankRow}>
              <Ionicons name="podium-outline" size={15} color={colors.accentText} />
              <Text style={[styles.flex, styles.rankText]} {...textScale.dense}>
                {rankText}
              </Text>
              <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
            </View>
          </Touchable>
        ) : null}
        <Text style={[styles.caption, period.contributed ? styles.contribOk : null]} {...textScale.long}>
          {period.contributed
            ? "Bu dönem forma giydin: biten takım görevlerinin XP'si sana da yazılır."
            : "Takım görevlerinin XP'si bu dönem forma giyen oyunculara yazılır — sen de sahaya çık."}
        </Text>
      </View>

      <View style={styles.list}>
        {quests.map((quest, index) => (
          <TeamQuestRow key={quest.code} quest={quest} first={index === 0} />
        ))}
      </View>
      <Text style={styles.note} {...textScale.long}>
        {`Takım puanı: maç başına ${data.rules?.match_points ?? 10}, galibiyet başına ${data.rules?.win_points ?? 5} puan + biten görevler.`}
      </Text>
      <View style={styles.shortcuts}>
        <Shortcut icon="calendar-outline" tone="mint" label="Maç al" onPress={() => router.push("/takimim/mac-al")} />
        <Shortcut icon="hand-left-outline" tone="pink" label="Katılım bildir" onPress={() => router.push("/(tabs)/kulubum")} />
        <Shortcut icon="podium-outline" tone="gold" label="Sıralama" onPress={() => router.push("/saha-siralamasi?type=teams")} />
      </View>
    </>
  );
}

function TeamStat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  return (
    <View style={styles.teamStat}>
      <Ionicons name={icon} size={14} color={colors.textTertiary} />
      <Text style={styles.teamStatValue} {...textScale.dense}>
        {value.toLocaleString("tr-TR")}
      </Text>
      <Text style={styles.caption} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

function TeamQuestRow({ quest, first }: { quest: TeamQuest; first?: boolean }) {
  const color = quest.done ? colors.win : colors.info;
  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <IconTile icon={quest.done ? "checkmark" : "people"} tone={quest.done ? "mint" : "gold"} size={36} glow={false} />
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, quest.done && styles.rowTitleDone]} numberOfLines={2} {...textScale.dense}>
          {quest.title}
        </Text>
        <Text style={styles.caption} numberOfLines={2} {...textScale.dense}>
          {quest.done ? `Tamamlandı · +${quest.points} takım puanı` : `${quest.progress}/${quest.target} · ${quest.description}`}
        </Text>
        {!quest.done && quest.target > 1 ? <Bar value={quest.progress / quest.target} color={color} gradient={colors.tileTones.gold} /> : null}
      </View>
      <View style={styles.teamReward}>
        <Text style={[styles.xpPill, quest.done && styles.xpPillDone]} {...textScale.dense}>
          {`+${quest.points}`}
        </Text>
        <Text style={styles.caption} {...textScale.badge}>
          {`+${quest.xp} XP`}
        </Text>
      </View>
    </View>
  );
}

/* ═══════════════════════════ KARİYER ═══════════════════════════ */

function CareerTab({ data }: { data: CareerSummary }) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  // Bitmeye en yakın görevler önce; bütün kademeleri biten zincirler sonda.
  const chains = useMemo(
    () => [...(data.career_quests ?? [])].sort((a, b) => Number(a.done) - Number(b.done) || b.progress / b.target - a.progress / a.target),
    [data],
  );
  const visible = showAll ? chains : chains.slice(0, CHAIN_PREVIEW);
  const tiersDone = chains.reduce((sum, chain) => sum + chain.completed_tiers, 0);
  const milestones = useMemo(() => buildMilestones(data), [data]);

  return (
    <>
      {data.card ? (
        <>
          <EliteCard card={data.card} level={data.level.level} />
          <Button label="Sezon Özetim" icon="sparkles-outline" variant="secondary" size="sm" onPress={() => router.push("/sezon-ozeti")} />
          {/* Elit Kariyer ↔ Kariyerim köprüsü: kartın arkasındaki gerçek maçlar,
              teklifler ve profil Yönetim ▸ Kariyerim'de. */}
          <View style={styles.shortcuts}>
            <Shortcut icon="briefcase-outline" tone="violet" label="Kariyerim" onPress={() => router.push("/kulubum?rol=oyuncu" as Href)} />
            <Shortcut icon="football-outline" tone="mint" label="Maçlarım" onPress={() => router.push("/oyuncum?tab=maclarim" as Href)} />
            <Shortcut icon="stats-chart-outline" tone="cyan" label="İstatistik" onPress={() => router.push("/oyuncum?tab=istatistik" as Href)} />
            <Shortcut icon="person-circle-outline" tone="pink" label="Profilim" onPress={() => router.push("/oyuncum/profil" as Href)} />
          </View>
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle} {...textScale.dense}>
            Elit Kartın seni bekliyor
          </Text>
          <Text style={styles.caption} {...textScale.long}>
            Oyuncu profilini bağla; maç istatistiklerinden kartın oluşsun, saha XP'si kazanmaya başla.
          </Text>
          <Button label="Oyuncu profilimi bağla" icon="link-outline" variant="secondary" size="sm" onPress={() => router.push("/oyuncum/bagla")} />
        </View>
      )}

      {chains.length ? (
        <>
          <SectionTitle title="Kariyer görevleri" icon="ribbon" tone="gold" meta={`Tüm zamanlar · ${tiersDone} kademe tamam`} />
          <View style={styles.list}>
            {visible.map((chain, index) => (
              <ChainRow key={chain.code} chain={chain} first={index === 0} />
            ))}
          </View>
          {chains.length > CHAIN_PREVIEW ? (
            <Toggle open={showAll} label={showAll ? "Daha az göster" : `Tümünü gör · ${chains.length}`} onPress={() => setShowAll((value) => !value)} />
          ) : null}
        </>
      ) : null}

      {milestones.length ? (
        <>
          <SectionTitle title="Kilometre taşları" icon="flag" tone="signature" meta="Açtığın rozetler ve son XP hareketlerin" />
          <View style={styles.timeline}>
            {milestones.map((item, index) => (
              <Reveal key={item.key} index={index} limit={8}>
                <View style={styles.tlRow}>
                  {/* Sol: tarih ekseni — nokta + dikey çizgi (son öğede çizgi yok). */}
                  <View style={styles.tlAxis}>
                    <IconTile icon={item.icon} tone={item.tone} size={30} glow={item.kind === "badge"} />
                    {index < milestones.length - 1 ? <View style={styles.tlLine} /> : null}
                  </View>
                  <View style={styles.tlBody}>
                    <Text style={styles.tlDate} {...textScale.badge}>
                      {upperTR(`${formatDateShort(item.date)} · ${item.kind === "badge" ? "Rozet" : LAYER_LABELS[item.layer]}`)}
                    </Text>
                    <Text style={styles.tlTitle} numberOfLines={2} {...textScale.dense}>
                      {item.title}
                    </Text>
                  </View>
                  <Text style={[styles.tlXp, item.kind === "badge" ? styles.tlXpBadge : null]} {...textScale.badge}>
                    {`+${item.xp}`}
                  </Text>
                </View>
              </Reveal>
            ))}
          </View>
        </>
      ) : null}
    </>
  );
}

/** Zaman çizelgesi öğesi: açılan rozet ya da XP hareketi. */
interface Milestone {
  key: string;
  kind: "badge" | "xp";
  layer: CareerLayer;
  title: string;
  date: string;
  xp: number;
  icon: keyof typeof Ionicons.glyphMap;
  tone: IconTileTone;
}

function buildMilestones(data: CareerSummary): Milestone[] {
  const badges: Milestone[] = data.achievements
    .filter((item) => item.unlocked && item.unlocked_at)
    .map((item) => ({
      key: `b-${item.code}`,
      kind: "badge",
      layer: item.layer,
      title: `${item.title} rozeti açıldı`,
      date: item.unlocked_at as string,
      xp: item.xp,
      icon: "trophy",
      tone: "gold",
    }));
  const moves: Milestone[] = data.recent.slice(0, 8).map((row, index) => ({
    key: `x-${row.source}-${index}`,
    kind: "xp",
    layer: row.layer,
    title: row.label ?? row.source,
    date: row.created_at,
    xp: row.xp,
    icon: LAYER_ICONS[row.layer],
    tone: LAYER_TILE[row.layer],
  }));
  return [...badges, ...moves].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 10);
}

function ChainRow({ chain, first }: { chain: CareerChain; first?: boolean }) {
  const color = chain.done ? colors.win : LAYER_COLORS[chain.layer];
  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <IconTile icon={chain.done ? "medal" : LAYER_ICONS[chain.layer]} tone={chain.done ? "gold" : LAYER_TILE[chain.layer]} size={36} glow={false} />
      <View style={styles.flex}>
        <View style={styles.chainHead}>
          <Text style={[styles.rowTitle, styles.flex]} numberOfLines={1} {...textScale.dense}>
            {chain.title}
          </Text>
          <TierDots total={chain.tiers} done={chain.completed_tiers} color={color} />
        </View>
        <Text style={styles.caption} numberOfLines={1} {...textScale.dense}>
          {chain.done
            ? `Bütün kademeler tamam · ${chain.value.toLocaleString("tr-TR")}`
            : `${chain.progress.toLocaleString("tr-TR")}/${chain.description}`}
        </Text>
        {!chain.done ? <Bar value={chain.progress / chain.target} color={color} gradient={layerGradient(chain.layer)} /> : null}
      </View>
      {!chain.done ? (
        <Text style={styles.xpPill} {...textScale.dense}>
          {`+${chain.xp}`}
        </Text>
      ) : null}
    </View>
  );
}

function TierDots({ total, done, color }: { total: number; done: number; color: string }) {
  return (
    <View style={styles.dots} accessibilityLabel={`${done}/${total} kademe`}>
      {Array.from({ length: total }, (_, index) => (
        <View key={index} style={[styles.dot, index < done && { backgroundColor: color }]} />
      ))}
    </View>
  );
}

/* ═══════════════════════════ ROZETLER ═══════════════════════════ */

type Filter = "all" | CareerLayer;

function BadgesTab({ data }: { data: CareerSummary }) {
  const [filter, setFilter] = useState<Filter>("all");
  const achievements = useMemo(
    () =>
      data.achievements
        .filter((item) => filter === "all" || item.layer === filter)
        .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progress / b.target - a.progress / a.target),
    [data, filter],
  );
  const count = (layer: Filter) => {
    const list = data.achievements.filter((item) => layer === "all" || item.layer === layer);
    return `${list.filter((item) => item.unlocked).length}/${list.length}`;
  };
  const unlocked = data.achievements.filter((item) => item.unlocked).length;
  return (
    <>
      <View style={styles.badgeSummary}>
        <IconTile icon="trophy" tone="gold" size={44} />
        <View style={styles.flex}>
          <Text style={styles.cardTitle} {...textScale.dense}>
            Kupa Dolabı
          </Text>
          <GradientBar value={data.achievements.length ? unlocked / data.achievements.length : 0} gradient={colors.medalGold} height={6} style={styles.badgeSummaryBar} />
        </View>
        <Text style={styles.badgeSummaryCount} {...textScale.badge}>
          {unlocked}
          <Text style={styles.badgeSummaryOf}>{`/${data.achievements.length}`}</Text>
        </Text>
      </View>
      <ChipGroup contentPadding={0}>
        <Chip size="sm" label={`Tümü ${count("all")}`} selected={filter === "all"} onPress={() => setFilter("all")} />
        {LAYER_ORDER.map((layer) => (
          <Chip key={layer} size="sm" label={`${LAYER_LABELS[layer]} ${count(layer)}`} selected={filter === layer} onPress={() => setFilter(layer)} />
        ))}
      </ChipGroup>
      <View style={styles.grid}>
        {achievements.map((item, index) => (
          <Reveal key={item.code} index={index} limit={9} replayKey={filter} style={styles.badgeCell}>
            <Badge item={item} />
          </Reveal>
        ))}
      </View>
    </>
  );
}

const Badge = React.memo(function Badge({ item }: { item: CareerAchievement }) {
  const ratio = item.target ? Math.min(1, item.progress / item.target) : 0;
  return (
    <View
      style={[styles.badge, item.unlocked ? styles.badgeOn : null]}
      accessible
      accessibilityLabel={`${item.title}: ${item.description} ${item.unlocked ? "açıldı" : `${item.progress}/${item.target}`}`}
    >
      <View style={!item.unlocked ? styles.badgeLocked : null}>
        <IconTile icon={item.unlocked ? "trophy" : LAYER_ICONS[item.layer]} tone={item.unlocked ? LAYER_TILE[item.layer] : "neutral"} size={44} glow={item.unlocked} />
        {!item.unlocked ? (
          <View style={styles.lockPip}>
            <Ionicons name="lock-closed" size={10} color={colors.textSecondary} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.badgeTitle, !item.unlocked && styles.locked]} numberOfLines={2} {...textScale.dense}>
        {item.title}
      </Text>
      {item.unlocked ? (
        <Text style={styles.badgeXp} {...textScale.badge}>
          {`+${item.xp} XP`}
        </Text>
      ) : (
        <View style={styles.badgeProgress}>
          <GradientBar value={ratio} height={4} gradient={layerGradient(item.layer)} style={styles.flex} />
          <Text style={styles.badgeCount} {...textScale.badge}>
            {`${item.progress.toLocaleString("tr-TR")}/${item.target.toLocaleString("tr-TR")}`}
          </Text>
        </View>
      )}
      <Text style={styles.badgeMeta} numberOfLines={2} {...textScale.dense}>
        {item.description}
      </Text>
    </View>
  );
});

/* ═══════════════════════════ ORTAK ═══════════════════════════ */

function Bar({ value, color, track, gradient }: { value: number; color: string; track?: string; gradient?: readonly [string, string] }) {
  return (
    <GradientBar
      value={value}
      height={5}
      gradient={gradient ?? [withAlpha(color, 0.55), color]}
      track={track ?? colors.surface3}
      style={styles.bar}
    />
  );
}

function SectionTitle({ title, meta, icon, tone }: { title: string; meta?: string; icon?: keyof typeof Ionicons.glyphMap; tone?: IconTileTone }) {
  return <SectionHeader title={title} subtitle={meta} icon={icon} iconTone={tone} inset="flush" />;
}

function Toggle({ open, label, icon, onPress }: { open: boolean; label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <View style={styles.toggle}>
        {icon ? <Ionicons name={icon} size={16} color={colors.textSecondary} /> : null}
        <Text style={[styles.flex, styles.toggleText]} {...textScale.dense}>
          {label}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
      </View>
    </Touchable>
  );
}

function Shortcut({ icon, label, onPress, tone = "violet" }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: IconTileTone }) {
  return (
    <Touchable onPress={onPress} style={styles.flex} feedback="card" accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.shortcut}>
        <IconTile icon={icon} tone={tone} size={34} glow={false} />
        <Text style={styles.shortcutText} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pad: { padding: layout.screenPadding, gap: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant, gap: space.md },

  hero: { borderRadius: radius.xxl, padding: space.lg, gap: space.lg, overflow: "hidden", backgroundColor: colors.inkBlock, borderWidth: hairline, borderColor: colors.borderOnDark },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.lg },
  levelRing: { width: 76, height: 76, borderRadius: radius.pill, padding: 3, overflow: "hidden", ...glowStyle(colors.glow, 2) },
  levelCore: { flex: 1, borderRadius: radius.pill, backgroundColor: colors.inkBlock, alignItems: "center", justifyContent: "center" },
  levelSmall: { ...type.nano, color: colors.onDarkMuted, letterSpacing: 0.8 },
  levelNumber: { ...type.scoreLg, color: colors.onDark },
  heroOver: { ...type.overline, color: colors.onDarkMuted },
  heroXpRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  heroTitle: { ...type.scoreLg, color: colors.onDark },
  heroUnit: { ...type.h3, color: colors.brandOnDark, marginBottom: space.xxs },
  heroWeek: { ...type.labelSm, color: colors.tileTones.mint[0] },
  heroBar: { gap: space.xs },
  heroBarHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  heroSub: { ...type.caption, color: colors.onDarkMuted },
  heroSubStrong: { ...type.numSmStrong, color: colors.onDark },
  heroNote: { ...type.caption, color: colors.onDarkMuted },
  layers: { flexDirection: "row", gap: space.s },
  layer: {
    flex: 1,
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  layerHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  layerName: { ...type.nano, color: colors.onDarkMuted, flexShrink: 1 },
  layerXp: { ...type.metricSm, color: colors.onDark },
  layerWeek: { ...type.caption, color: colors.onDarkMuted },
  layerWeekUp: { color: colors.tileTones.mint[0] },

  card: { gap: space.s, padding: space.md, borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.glassLine, backgroundColor: colors.surface1 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.s },
  cardTitle: { ...type.h3, color: colors.textPrimary },
  counter: { ...type.scoreMd, color: colors.textPrimary },
  caption: { ...type.caption, color: colors.textSecondary },
  note: { ...type.caption, color: colors.textTertiary, textAlign: "center", marginTop: -space.xs },

  segments: { flexDirection: "row", gap: space.xxs },
  segment: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  segmentDone: { backgroundColor: colors.brand },
  segmentGoal: { borderWidth: 1, borderColor: colors.warn },
  bonusRow: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
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
  bonusText: { ...type.caption, color: colors.textTertiary },
  bonusTextEarned: { color: colors.win },

  list: { borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.glassLine, backgroundColor: colors.surface1, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 60 },
  rowBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  rowIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  rowTitle: { ...type.h4, color: colors.textPrimary },
  rowTitleDone: { color: colors.textSecondary },
  rowEnd: { flexDirection: "row", alignItems: "center", gap: space.xs },
  xpPill: { ...type.numSmStrong, color: colors.medalInk, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.yellowCard, overflow: "hidden" },
  xpPillDone: { color: colors.win, backgroundColor: withAlpha(colors.win, 0.12) },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: space.s, padding: space.md },
  chainHead: { flexDirection: "row", alignItems: "center", gap: space.s },
  teamScore: { alignItems: "flex-end" },
  teamStats: { flexDirection: "row", gap: space.s },
  teamStat: { flex: 1, alignItems: "center", gap: space.xxs, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  teamStatValue: { ...type.metricSm, color: colors.textPrimary },
  rankRow: { flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.xs },
  rankText: { ...type.label, color: colors.textPrimary },
  contribOk: { color: colors.win },
  teamReward: { alignItems: "flex-end", gap: space.xxs },
  dots: { flexDirection: "row", gap: space.xxs },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.surface2 },

  shortcuts: { flexDirection: "row", gap: space.s },
  shortcut: { alignItems: "center", gap: space.s, paddingVertical: space.md, borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.glassLine, backgroundColor: colors.surface1 },
  shortcutText: { ...type.labelXs, color: colors.textPrimary },

  toggle: { flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: layout.minTouch, borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.glassLine, backgroundColor: colors.surface1 },
  toggleText: { ...type.label, color: colors.textPrimary },

  rules: { gap: space.xs, paddingBottom: space.s },
  rulesTitle: { ...type.overline, color: colors.textTertiary },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  ruleLabel: { ...type.caption, color: colors.textSecondary },
  ruleXp: { ...type.label, color: colors.accentText },

  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: space.s },
  section: { ...type.overline, color: colors.textTertiary },
  sectionMeta: { ...type.caption, color: colors.textTertiary },
  recent: { flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: space.md, paddingVertical: space.s },
  recentLabel: { ...type.caption, color: colors.textSecondary },

  bar: { marginTop: space.xs, alignSelf: "stretch" },
  barFill: { height: 5 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  badge: {
    flex: 1,
    minHeight: 168,
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.s,
    paddingVertical: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    backgroundColor: colors.surface1,
  },
  badgeTitle: { ...type.labelSm, color: colors.textPrimary, textAlign: "center" },
  locked: { color: colors.textSecondary },
  badgeCell: { width: "31.8%" },
  badgeOn: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  badgeLocked: { opacity: 0.7 },
  lockPip: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
    borderWidth: 2,
    borderColor: colors.surface1,
  },
  badgeXp: { ...type.numSmStrong, color: colors.win },
  badgeProgress: { flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "stretch" },
  badgeCount: { ...type.nano, color: colors.textSecondary },
  badgeSummary: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.glassLine, backgroundColor: colors.surface1 },
  badgeSummaryBar: { marginTop: space.s },
  badgeSummaryCount: { ...type.scoreMd, color: colors.textPrimary },
  badgeSummaryOf: { ...type.tableNum, color: colors.textTertiary },
  timeline: { borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.glassLine, backgroundColor: colors.surface1, paddingHorizontal: space.md, paddingTop: space.md },
  tlRow: { flexDirection: "row", gap: space.md, minHeight: 58 },
  tlAxis: { width: 30, alignItems: "center" },
  tlLine: { flex: 1, width: 2, marginVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.separator },
  tlBody: { flex: 1, gap: space.xxs, paddingBottom: space.md },
  tlDate: { ...type.overline, color: colors.textTertiary },
  tlTitle: { ...type.h4, color: colors.textPrimary },
  tlXp: { ...type.numSmStrong, color: colors.brandAccent, paddingTop: space.xs },
  tlXpBadge: { color: colors.warn },
  badgeMeta: { ...type.meta, color: colors.textTertiary, textAlign: "center" },
});
