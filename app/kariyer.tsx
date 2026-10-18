/**
 * KARİYERİM — Kariyer Modu (GET /api/career/me).
 *
 * Ekran üç sekmeye ayrılır; üstte her zaman Elit Seviye özeti durur:
 *
 *   Özet       Elit Seviye + üç katman (Saha, Seyirci, Oyunlar): toplam XP
 *              ve bu haftaki artış yan yana. Saha dışı XP seviyeyi en çok
 *              30'a taşır; üstü sahadan gelir.
 *   Görevler   20 görevlik haftalık sıra: 5 açık görev, biri bitince yenisi
 *              gelir; 10 ve 20 görevde bonus. Göreve dokununca görevin
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
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useRouter, type Href } from "expo-router";
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
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

const LAYER_ORDER: CareerLayer[] = ["saha", "tribun", "arena"];
const LAYER_ICONS: Record<CareerLayer, keyof typeof Ionicons.glyphMap> = { saha: "football", tribun: "analytics", arena: "game-controller" };
const LAYER_COLORS: Record<CareerLayer, string> = { saha: colors.win, tribun: colors.info, arena: colors.accent };
const CHAIN_PREVIEW = 5;

/** Sunucudaki görev `go` anahtarı → açılacak ekran. */
const QUEST_ROUTES: Record<string, Href> = {
  tahmin: "/tahmin-ligi",
  fantezi: "/fantezi",
  maclar: "/(tabs)/maclar",
  kulubum: "/(tabs)/kulubum",
  oyunlar: "/(tabs)/oyunlar",
  penalti: "/penalti",
  slalom: "/slalom",
  sektir: "/sektir",
  kimbu: "/kimbu",
  seri: "/arena",
  tahmin_oyun: "/tahmin",
  gunun: "/gunun",
  mac_al: "/takimim/mac-al",
};

type Tab = "gorevler" | "takim" | "kariyer" | "rozetler";
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
  const [tab, setTab] = useState<Tab>("gorevler");

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
  return (
    <LinearGradient colors={colors.gradientInk} style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.levelBadge}>
          <Text style={styles.levelSmall} {...textScale.badge}>
            {upperTR("Sv")}
          </Text>
          <Text style={styles.levelNumber} {...textScale.dense}>
            {level.level}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.heroOver} {...textScale.badge}>
            {upperTR("Elit Seviye")}
          </Text>
          <Text style={styles.heroTitle} {...textScale.dense}>
            {`${level.xp.toLocaleString("tr-TR")} XP`}
          </Text>
          <Text style={styles.heroSub} {...textScale.dense}>
            {level.next ? `Seviye ${level.level + 1} için ${remaining.toLocaleString("tr-TR")} XP` : "En üst seviyedesin"}
          </Text>
        </View>
      </View>
      <Bar value={level.progress} color={colors.accent} track={withAlpha(colors.onDark, 0.15)} />
      <View style={styles.layers}>
        {LAYER_ORDER.map((layer) => (
          <View key={layer} style={styles.layer}>
            <View style={styles.layerHead}>
              <Ionicons name={LAYER_ICONS[layer]} size={14} color={LAYER_COLORS[layer]} />
              <Text style={styles.layerName} {...textScale.badge}>
                {upperTR(LAYER_LABELS[layer])}
              </Text>
            </View>
            <Text style={styles.layerXp} {...textScale.dense}>
              {(data.layers[layer] ?? 0).toLocaleString("tr-TR")}
            </Text>
            {data.layers_week ? (
              <Text style={styles.layerWeek} {...textScale.dense}>
                {`+${(data.layers_week[layer] ?? 0).toLocaleString("tr-TR")} bu hafta`}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {level.fan_capped ? (
        <Text style={styles.heroNote} {...textScale.long}>
          {`Seyirci ve oyun XP'si seviye ${level.fan_level_cap}'a kadar sayılır; daha yukarısı sahadaki maçlarınla açılır.`}
        </Text>
      ) : null}
    </LinearGradient>
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
    const route = quest.go ? QUEST_ROUTES[quest.go] : undefined;
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
          <QuestRow key={quest.code} quest={quest} first={index === 0} onPress={quest.go && QUEST_ROUTES[quest.go] ? () => open(quest) : undefined} />
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
        <Shortcut icon="analytics-outline" label="Tahmin Ligi" onPress={() => router.push("/tahmin-ligi")} />
        <Shortcut icon="people-outline" label="Fantezi" onPress={() => router.push("/fantezi")} />
        <Shortcut icon="game-controller-outline" label="Oyunlar" onPress={() => router.push("/(tabs)/oyunlar")} />
        <Shortcut icon="podium-outline" label="Sıralama" onPress={() => router.push("/saha-siralamasi")} />
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
      <View style={[styles.rowIcon, { backgroundColor: withAlpha(color, 0.14) }]}>
        <Ionicons name={quest.done ? "checkmark" : LAYER_ICONS[quest.layer]} size={18} color={color} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, quest.done && styles.rowTitleDone]} numberOfLines={2} {...textScale.dense}>
          {quest.title}
        </Text>
        <Text style={styles.caption} numberOfLines={1} {...textScale.dense}>
          {quest.done ? `${LAYER_LABELS[quest.layer]} · tamamlandı` : `${LAYER_LABELS[quest.layer]} · ${quest.progress.toLocaleString("tr-TR")}/${quest.target.toLocaleString("tr-TR")} · ${quest.description}`}
        </Text>
        {!quest.done && quest.target > 1 ? <Bar value={quest.progress / quest.target} color={color} /> : null}
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
        <Shortcut icon="calendar-outline" label="Maç al" onPress={() => router.push("/takimim/mac-al")} />
        <Shortcut icon="hand-left-outline" label="Katılım bildir" onPress={() => router.push("/(tabs)/kulubum")} />
        <Shortcut icon="podium-outline" label="Sıralama" onPress={() => router.push("/saha-siralamasi?type=teams")} />
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
      <View style={[styles.rowIcon, { backgroundColor: withAlpha(color, 0.14) }]}>
        <Ionicons name={quest.done ? "checkmark" : "people"} size={18} color={color} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, quest.done && styles.rowTitleDone]} numberOfLines={2} {...textScale.dense}>
          {quest.title}
        </Text>
        <Text style={styles.caption} numberOfLines={2} {...textScale.dense}>
          {quest.done ? `Tamamlandı · +${quest.points} takım puanı` : `${quest.progress}/${quest.target} · ${quest.description}`}
        </Text>
        {!quest.done && quest.target > 1 ? <Bar value={quest.progress / quest.target} color={color} /> : null}
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

  return (
    <>
      {data.card ? (
        <>
          <EliteCard card={data.card} level={data.level.level} />
          <Button label="Sezon Özetim" icon="sparkles-outline" variant="secondary" size="sm" onPress={() => router.push("/sezon-ozeti")} />
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
          <SectionTitle title="Kariyer görevleri" meta={`Tüm zamanlar · ${tiersDone} kademe`} />
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

      {data.recent.length ? (
        <>
          <SectionTitle title="Son XP hareketleri" />
          <View style={styles.list}>
            {data.recent.slice(0, 8).map((row, index) => (
              <View key={`${row.source}-${index}`} style={[styles.recent, index > 0 && styles.rowBorder]}>
                <Ionicons name={LAYER_ICONS[row.layer]} size={14} color={LAYER_COLORS[row.layer]} />
                <Text style={[styles.flex, styles.recentLabel]} numberOfLines={1} {...textScale.dense}>
                  {row.label ?? row.source}
                </Text>
                <Text style={styles.ruleXp} {...textScale.dense}>
                  {`+${row.xp}`}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </>
  );
}

function ChainRow({ chain, first }: { chain: CareerChain; first?: boolean }) {
  const color = chain.done ? colors.win : LAYER_COLORS[chain.layer];
  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <View style={[styles.rowIcon, { backgroundColor: withAlpha(color, 0.14) }]}>
        <Ionicons name={chain.done ? "medal" : LAYER_ICONS[chain.layer]} size={18} color={color} />
      </View>
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
        {!chain.done ? <Bar value={chain.progress / chain.target} color={color} /> : null}
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
  return (
    <>
      <ChipGroup contentPadding={0}>
        <Chip size="sm" label={`Tümü ${count("all")}`} selected={filter === "all"} onPress={() => setFilter("all")} />
        {LAYER_ORDER.map((layer) => (
          <Chip key={layer} size="sm" label={`${LAYER_LABELS[layer]} ${count(layer)}`} selected={filter === layer} onPress={() => setFilter(layer)} />
        ))}
      </ChipGroup>
      <View style={styles.grid}>
        {achievements.map((item) => (
          <Badge key={item.code} item={item} />
        ))}
      </View>
    </>
  );
}

const Badge = React.memo(function Badge({ item }: { item: CareerAchievement }) {
  const color = item.unlocked ? LAYER_COLORS[item.layer] : colors.textTertiary;
  return (
    <View
      style={[styles.badge, item.unlocked && { borderColor: withAlpha(color, 0.5), backgroundColor: withAlpha(color, 0.08) }]}
      accessible
      accessibilityLabel={`${item.title}: ${item.description} ${item.unlocked ? "açıldı" : `${item.progress}/${item.target}`}`}
    >
      <Ionicons name={item.unlocked ? "trophy" : "lock-closed-outline"} size={20} color={color} />
      <Text style={[styles.badgeTitle, !item.unlocked && styles.locked]} numberOfLines={2} {...textScale.dense}>
        {item.title}
      </Text>
      <Text style={styles.badgeMeta} numberOfLines={3} {...textScale.dense}>
        {item.unlocked ? `+${item.xp} XP` : item.description}
      </Text>
      {!item.unlocked && item.target > 1 ? <Bar value={item.progress / item.target} color={colors.textTertiary} /> : null}
    </View>
  );
});

/* ═══════════════════════════ ORTAK ═══════════════════════════ */

function Bar({ value, color, track }: { value: number; color: string; track?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={[styles.bar, track ? { backgroundColor: track } : null]}>
      <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section} {...textScale.badge}>
        {upperTR(title)}
      </Text>
      {meta ? (
        <Text style={styles.sectionMeta} {...textScale.badge}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
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

function Shortcut({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} style={styles.flex} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.shortcut}>
        <Ionicons name={icon} size={18} color={colors.accentText} />
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

  hero: { borderRadius: radius.xl, padding: space.lg, gap: space.md },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  levelBadge: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  levelSmall: { ...type.overline, color: colors.onDark },
  levelNumber: { ...type.scoreLg, color: colors.onDark, marginTop: -space.xxs },
  heroOver: { ...type.overline, color: colors.onDarkMuted },
  heroTitle: { ...type.h2, color: colors.onDark },
  heroSub: { ...type.caption, color: colors.onDarkMuted },
  heroNote: { ...type.caption, color: colors.onDarkMuted },
  layers: { flexDirection: "row", gap: space.s },
  layer: {
    flex: 1,
    gap: space.xxs,
    padding: space.s,
    borderRadius: radius.md,
    backgroundColor: withAlpha(colors.onDark, 0.08),
  },
  layerHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  layerName: { ...type.overline, color: colors.onDarkMuted },
  layerXp: { ...type.h3, color: colors.onDark },
  layerWeek: { ...type.caption, color: colors.onDarkMuted },

  card: {
    gap: space.s,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.s },
  cardTitle: { ...type.h3, color: colors.textPrimary },
  counter: { ...type.h2, color: colors.textPrimary },
  caption: { ...type.caption, color: colors.textSecondary },
  note: { ...type.caption, color: colors.textTertiary, textAlign: "center", marginTop: -space.xs },

  segments: { flexDirection: "row", gap: space.xxs },
  segment: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  segmentDone: { backgroundColor: colors.win },
  segmentGoal: { borderWidth: hairline, borderColor: colors.win },
  bonusRow: { flexDirection: "row", gap: space.s },
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

  list: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  rowBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  rowIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  rowTitle: { ...type.label, color: colors.textPrimary },
  rowTitleDone: { color: colors.textSecondary },
  rowEnd: { flexDirection: "row", alignItems: "center", gap: space.xs },
  xpPill: {
    ...type.label,
    color: colors.accentText,
    paddingHorizontal: space.s,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(colors.accent, 0.12),
    overflow: "hidden",
  },
  xpPillDone: { color: colors.win, backgroundColor: withAlpha(colors.win, 0.12) },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: space.s, padding: space.md },
  chainHead: { flexDirection: "row", alignItems: "center", gap: space.s },
  teamScore: { alignItems: "flex-end" },
  teamStats: { flexDirection: "row", gap: space.s },
  teamStat: { flex: 1, alignItems: "center", gap: space.xxs, paddingVertical: space.s, borderRadius: radius.md, backgroundColor: colors.surface2 },
  teamStatValue: { ...type.h3, color: colors.textPrimary },
  rankRow: { flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.xs },
  rankText: { ...type.label, color: colors.textPrimary },
  contribOk: { color: colors.win },
  teamReward: { alignItems: "flex-end", gap: space.xxs },
  dots: { flexDirection: "row", gap: space.xxs },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.surface2 },

  shortcuts: { flexDirection: "row", gap: space.s },
  shortcut: {
    alignItems: "center",
    gap: space.xxs,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  shortcutText: { ...type.caption, color: colors.textPrimary },

  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
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

  bar: { height: 5, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: "hidden", marginTop: space.xs, alignSelf: "stretch" },
  barFill: { height: 5, borderRadius: radius.pill },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  badge: {
    width: "31.5%",
    minHeight: 112,
    alignItems: "center",
    gap: space.xs,
    padding: space.s,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  badgeTitle: { ...type.label, color: colors.textPrimary, textAlign: "center" },
  locked: { color: colors.textSecondary },
  badgeMeta: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
});
