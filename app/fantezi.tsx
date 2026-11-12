/**
 * FANTEZİ ELİTLİG — seçili ligin gerçek oyuncularından haftalık 5 kişilik
 * kadro (routes/fantasy.js · services/fantasy.js). Oyun merkezinden açılır.
 *
 *   Kadrom    Saha görünümünde kadro: 1 kaleci + 4 saha oyuncusu, aynı
 *             hattan en çok 2, aynı takımdan en çok 2, 45 kredi bütçe.
 *             Kaptan ×2; yardımcı kaptan kaptan oynamazsa ×2. Oyuncuya
 *             dokun → kaptan / yardımcı / çıkar; boş yuvaya dokun → pazar.
 *             Kilit OYUNCU BAŞINA: takımının maçı başlamış oyuncu kilitli.
 *             Haftanın maçları bitince ekran gelecek haftaya geçer; bu
 *             haftanın sonucu ayrı sahada görünür.
 *   Pazar     Fiyat son forma göre (son 5 maç, aktiflik, sezon gücü) ve
 *             hafta içinde sabit. Mevki / sıralama süzgeci, trend oku,
 *             son 5 maç çubukları, "aktif değil" işareti, engel gerekçesi.
 *   Sıralama  bu hafta / sezon toplamı; eşitlikte belirleyici sıra.
 *
 * Görsel dil: ciddi bir istatistik uygulaması + küçük oyun dokunuşları
 * (components/fantasy). Renkler uygulama temasından: açık/koyu temada okunur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeaguePicker } from "@/components/LeaguePicker";
import {
  BudgetMeter,
  FantasyPitch,
  FormBars,
  HowToPlay,
  LineChip,
  Panel,
  PlayerMarketRow,
  PriceTag,
  RoleBadge,
  StatChip,
  WeekHero,
  type PitchSlot,
} from "@/components/fantasy";
import {
  Avatar,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  ListRow,
  ScreenHeader,
  SegmentedControl,
  SkeletonCard,
  Touchable,
  useHeaderScroll,
  useToast,
  type SegmentedItem,
} from "@/components/ui";
import {
  getFantasyBoard,
  getFantasyMe,
  getFantasyPool,
  saveFantasy,
  type FantasyLine,
  type FantasyLineupView,
  type FantasyPlayer,
} from "@/lib/api/community";
import {
  asLine,
  filterPlayers,
  formatCredit,
  formatNumber,
  LINE_META,
  lineupHints,
  normalizeRules,
  pickBlocker,
  SORTS,
  weekNo,
  type SortKey,
} from "@/lib/fantasy";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, radius, space, textScale, type } from "@/theme";

type Segment = "kadro" | "siralama";
const SEGMENTS: SegmentedItem<Segment>[] = [
  { key: "kadro", label: "Kadrom" },
  { key: "siralama", label: "Sıralama" },
];
type Scope = { leagueId: number; seasonId: number };
/** Bu puanın üstündeki hafta küçük bir kutlamayla karşılanır. */
const GOOD_WEEK = 40;

export default function FantasyScreen() {
  const auth = useAuth();
  const scope = useScope();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [segment, setSegment] = useState<Segment>("kadro");
  const [rulesOpen, setRulesOpen] = useState(false);
  const ready = scope.ready && scope.leagueId != null && scope.seasonId != null;
  const fantasyScope = ready ? { leagueId: scope.leagueId as number, seasonId: scope.seasonId as number } : null;

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Fantezi ElitLig"
        subtitle="5 oyuncu · 45 kredi · kaptan ×2"
        back
        scrollY={scrollY}
        actions={[{ icon: "help-circle-outline", onPress: () => setRulesOpen(true), accessibilityLabel: "Nasıl oynanır" }]}
      />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <LeaguePicker pinned={false} flush />
        <SegmentedControl items={SEGMENTS} value={segment} onChange={setSegment} />
        {!fantasyScope ? (
          <EmptyState icon="football-outline" title="Lig seç" body="Fantezi kadrosu bir lig ve sezon için kurulur." variant="inline" />
        ) : segment === "kadro" ? (
          <Lineup key={`${fantasyScope.leagueId}-${fantasyScope.seasonId}`} scope={fantasyScope} onRules={() => setRulesOpen(true)} />
        ) : (
          <Board scope={fantasyScope} />
        )}
      </ScrollView>
      <BottomSheet visible={rulesOpen} onClose={() => setRulesOpen(false)} title="Nasıl oynanır" snap="full">
        <HowToPlay />
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ═══════════════════════════ KADROM ═══════════════════════════ */

function Lineup({ scope, onRules }: { scope: Scope; onRules: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const poolQuery = useQuery({ queryKey: ["fantasy", "pool", scope.leagueId, scope.seasonId], queryFn: () => getFantasyPool(scope), staleTime: 10 * 60_000 });
  const meQuery = useQuery({ queryKey: ["fantasy", "me", auth.user?.id ?? 0, scope.leagueId, scope.seasonId], queryFn: () => getFantasyMe(scope), staleTime: 30_000 });
  const [picks, setPicks] = useState<number[] | null>(null);
  const [captain, setCaptain] = useState<number | null>(null);
  const [vice, setVice] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ line: FantasyLine | "ALL" } | null>(null);
  const [focus, setFocus] = useState<FantasyPlayer | null>(null);

  const me = meQuery.data;
  const pool = poolQuery.data;
  const byId = useMemo(() => new Map((pool?.players ?? []).map((player) => [player.id, player])), [pool]);
  const rules = normalizeRules(pool?.rules ?? me?.rules, pool);

  /* Başlangıç kadrosu: bu haftanın kadrosu ya da geçen haftanın önerisi.
     Havuzda artık olmayan (takımından ayrılmış) oyuncular ayıklanır. */
  useEffect(() => {
    if (!me || picks || !pool) return;
    const base = me.lineup ?? me.suggestion;
    const ids = (base?.playerIds ?? []).filter((id) => byId.has(id));
    setPicks(ids);
    const cap = base?.captainId != null && ids.includes(base.captainId) ? base.captainId : ids[0] ?? null;
    setCaptain(cap);
    const v = base?.viceCaptainId != null && ids.includes(base.viceCaptainId) && base.viceCaptainId !== cap ? base.viceCaptainId : null;
    setVice(v);
  }, [byId, me, picks, pool]);

  const selected = (picks ?? []).map((id) => byId.get(id)).filter(Boolean) as FantasyPlayer[];
  const selectedIds = selected.map((player) => player.id);

  // Eski sunucu bütün haftayı kilitler; yenisi yalnız maçı başlamış takımları.
  const weekLocked = Boolean(me?.week.locked);
  const lockedTeams = useMemo(() => new Set(me?.week.lockedTeamIds ?? []), [me?.week.lockedTeamIds]);
  const savedIds = me?.lineup?.playerIds ?? [];
  const isLocked = (player: FantasyPlayer) => lockedTeams.has(player.teamId);
  const frozen = (player: FantasyPlayer) => weekLocked || (isLocked(player) && savedIds.includes(player.id));
  const captainFrozen = (() => {
    const p = captain != null ? byId.get(captain) : undefined;
    return Boolean(p && isLocked(p) && me?.lineup?.captainId === captain);
  })();
  const viceFrozen = (() => {
    const p = vice != null ? byId.get(vice) : undefined;
    return Boolean(p && isLocked(p) && me?.lineup?.viceCaptainId === vice);
  })();
  const nextWeek = me?.week.mode === "next";
  const sameSet = (a: number[], b: number[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const saved = Boolean(
    me?.lineup && sameSet(me.lineup.playerIds, selectedIds) && me.lineup.captainId === captain && (!rules.viceCaptain || (me.lineup.viceCaptainId ?? null) === vice),
  );

  const { hints, cost, blocking } = lineupHints(selected, rules, captain, vice, saved);

  const save = useMutation({
    mutationFn: () => saveFantasy(scope, selectedIds, captain as number, vice),
    onSuccess: (data) => {
      toast.show({ message: `${data.message} (${formatCredit(data.cost)} kredi)`, tone: "success" });
      if (data.viceCaptainId != null) setVice(data.viceCaptainId);
      void queryClient.invalidateQueries({ queryKey: ["fantasy"] });
      void queryClient.invalidateQueries({ queryKey: ["career", "me"] });
    },
    onError: (error) => toast.show({ message: error instanceof ApiError ? error.userMessage : "Kadro kaydedilemedi.", tone: "danger" }),
  });

  if (poolQuery.isLoading || meQuery.isLoading || (!picks && !poolQuery.isError && !meQuery.isError)) return <SkeletonCard lines={6} />;
  if (poolQuery.isError || meQuery.isError) {
    return <ErrorState variant="inline" error={poolQuery.error ?? meQuery.error} onRetry={() => { void poolQuery.refetch(); void meQuery.refetch(); }} />;
  }
  if (!pool?.players.length) {
    return <EmptyState icon="people-outline" title="Oyuncu havuzu boş" body="Bu ligde henüz fikstürü olan takım yok." variant="inline" />;
  }

  const deadline = me?.week.deadline
    ? `${formatDateShort(me.week.deadline)} ${new Date(me.week.deadline).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}`
    : "";
  const remove = (id: number) => {
    setPicks((current) => (current ?? []).filter((item) => item !== id));
    if (captain === id) {
      setCaptain(vice);
      setVice(null);
    } else if (vice === id) setVice(null);
  };
  const add = (player: FantasyPlayer) => {
    // Hızlı çift dokunuşta 6. oyuncu eklenmesin: sınır güncel durumda denetlenir.
    setPicks((current) => {
      const list = current ?? [];
      if (list.length >= rules.size || list.includes(player.id)) return list;
      const next = [...list, player.id];
      if (next.length >= rules.size) setPicker(null);
      return next;
    });
    setCaptain((current) => current ?? player.id);
    setVice((current) => (current == null && captain != null && captain !== player.id && rules.viceCaptain ? player.id : current));
  };
  const makeCaptain = (id: number) => {
    if (vice === id) setVice(captain);
    setCaptain(id);
  };
  const makeVice = (id: number) => {
    if (captain === id) return;
    setVice(id);
  };

  const breakdown = new Map((me?.lineup?.breakdown ?? []).map((item) => [item.id, item]));
  const anyPlayed = (me?.lineup?.breakdown ?? []).some((item) => item.played ?? item.points !== 0);
  const slots: PitchSlot[] = selected.map((player) => ({
    player,
    captain: captain === player.id,
    vice: vice === player.id,
    locked: frozen(player),
  }));
  const gkCount = selected.filter((p) => asLine(p.line) === "GK").length;
  const empty = Math.max(0, rules.size - selected.length);
  const status = weekLocked
    ? "Kadro bu hafta kilitli."
    : nextWeek
      ? "Bu haftanın maçları oynandı; gelecek haftanın kadrosunu kur."
      : lockedTeams.size
        ? "Maçı başlamış oyuncular kilitli; diğerleri serbest."
        : deadline
          ? `İlk maç ${deadline}. Oyuncu, kendi maçı başlayınca kilitlenir.`
          : "Kadronu dilediğin zaman değiştir.";
  const weekPoints = me?.lineup && !nextWeek && anyPlayed ? me.lineup.points : null;

  return (
    <>
      <WeekHero
        overline={`FANTEZİ ELİTLİG · ${nextWeek ? "GELECEK HAFTA" : "BU HAFTA"}`}
        title={`Hafta ${weekNo(me?.week.key)}`}
        status={status}
        points={weekPoints}
        celebrate={weekPoints != null && weekPoints >= GOOD_WEEK}
      />

      {me?.live ? <WeekResult title={`Hafta ${weekNo(me.live.week)} sonucu`} lineup={me.live} byId={byId} /> : null}

      <Panel>
        <BudgetMeter cost={cost} budget={rules.budget} picked={selected.length} size={rules.size} />
      </Panel>

      <FantasyPitch
        slots={slots}
        empty={weekLocked ? 0 : empty}
        emptyGk={!weekLocked && rules.requireGoalkeeper && gkCount === 0 && empty > 0}
        onSlotPress={(player) => setFocus(player)}
        onEmptyPress={(line) => setPicker({ line })}
      />

      {!weekLocked ? (
        <>
          <View style={styles.hints}>
            {hints.map((hint) => (
              <View key={hint.key} style={styles.hint}>
                <Ionicons
                  name={hint.tone === "ok" ? "checkmark-circle" : hint.tone === "danger" ? "alert-circle" : "ellipse-outline"}
                  size={14}
                  color={hint.tone === "ok" ? colors.win : hint.tone === "danger" ? colors.danger : colors.textTertiary}
                />
                <Text style={[styles.hintText, hint.tone === "danger" && styles.hintDanger]} {...textScale.long}>
                  {hint.text}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.actions}>
            {selected.length < rules.size ? (
              <Button label="Pazar" icon="search" variant="secondary" onPress={() => setPicker({ line: "ALL" })} style={styles.flex} />
            ) : null}
            <Button
              label={saved ? "Kaydedildi" : "Kadroyu kaydet"}
              icon={saved ? "checkmark" : undefined}
              onPress={() => save.mutate()}
              loading={save.isPending}
              disabled={saved || blocking}
              style={styles.flex}
            />
          </View>
        </>
      ) : null}

      {me?.lineup && !nextWeek && anyPlayed ? <WeekResult title="Bu haftanın puanları" lineup={me.lineup} byId={byId} /> : null}

      {me?.history.length ? <History items={me.history} /> : null}

      <Touchable feedback="row" onPress={onRules} accessibilityLabel="Nasıl oynanır">
        <View style={styles.rulesLink}>
          <Ionicons name="book-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.rulesText} {...textScale.dense}>
            Nasıl oynanır · fiyatlar nasıl belirlenir?
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
      </Touchable>

      <PlayerSheet
        player={focus}
        onClose={() => setFocus(null)}
        captain={captain}
        vice={vice}
        viceEnabled={rules.viceCaptain}
        canRemove={Boolean(focus && !frozen(focus))}
        canCaptain={Boolean(focus && !weekLocked && !captainFrozen && !(isLocked(focus) && captain !== focus.id))}
        canVice={Boolean(focus && !weekLocked && !viceFrozen && !isLocked(focus) && captain !== focus.id)}
        points={focus ? breakdown.get(focus.id)?.points ?? null : null}
        onCaptain={(id) => { makeCaptain(id); setFocus(null); }}
        onVice={(id) => { makeVice(id); setFocus(null); }}
        onRemove={(id) => { remove(id); setFocus(null); }}
      />

      <MarketSheet
        visible={picker != null}
        initialLine={picker?.line ?? "ALL"}
        onClose={() => setPicker(null)}
        players={pool.players}
        selected={selected}
        rules={rules}
        budgetLeft={rules.budget - cost}
        lockedTeams={lockedTeams}
        onPick={add}
      />
    </>
  );
}

/** Haftanın sonucu: oyuncu başına puan, kaptan / yardımcı ve ×2 işareti. */
function WeekResult({ title, lineup, byId }: { title: string; lineup: FantasyLineupView; byId: Map<number, FantasyPlayer> }) {
  const items = lineup.breakdown
    .map((item) => ({ item, player: byId.get(item.id) }))
    .filter((x): x is { item: FantasyLineupView["breakdown"][number]; player: FantasyPlayer } => Boolean(x.player))
    .sort((a, b) => b.item.points - a.item.points);
  return (
    <Panel title={title} right={<StatChip value={`${lineup.points} puan`} tone={lineup.points >= GOOD_WEEK ? "ok" : "accent"} />}>
      {items.map(({ item, player }) => (
        <View key={item.id} style={styles.resultRow}>
          <LineChip line={asLine(player.line)} />
          <Text style={styles.resultName} numberOfLines={1} {...textScale.dense}>
            {player.name}
          </Text>
          {item.captain ? <RoleBadge role="captain" size={16} /> : item.vice ? <RoleBadge role="vice" size={16} /> : null}
          {(item.multiplier ?? 1) > 1 ? <StatChip value="×2" tone="ok" /> : null}
          {item.played === false ? (
            <Text style={styles.resultMuted} {...textScale.badge}>
              {item.pending ? "maç bekleniyor" : "oynamadı"}
            </Text>
          ) : null}
          <Text style={styles.resultPoints} {...textScale.dense}>
            {item.points}
          </Text>
        </View>
      ))}
    </Panel>
  );
}

function History({ items }: { items: { week: string; points: number }[] }) {
  const list = [...items].reverse();
  const max = Math.max(10, ...list.map((item) => item.points));
  return (
    <Panel title="Geçmiş haftalar" right={<StatChip label="ort." value={formatNumber(list.reduce((s, i) => s + i.points, 0) / list.length)} />}>
      <View style={styles.history}>
        {list.map((item) => (
          <View key={item.week} style={styles.historyCol}>
            <Text style={styles.historyValue} {...textScale.badge}>
              {item.points}
            </Text>
            <View style={styles.historyTrack}>
              <View style={[styles.historyBar, { height: `${Math.max(4, (Math.max(0, item.points) / max) * 100)}%` }, item.points >= GOOD_WEEK && styles.historyHot]} />
            </View>
            <Text style={styles.historyWeek} {...textScale.badge}>
              {`H${weekNo(item.week)}`}
            </Text>
          </View>
        ))}
      </View>
    </Panel>
  );
}

/* ─────────────────────── oyuncu kartı ─────────────────────── */

function PlayerSheet({
  player,
  onClose,
  captain,
  vice,
  viceEnabled,
  canRemove,
  canCaptain,
  canVice,
  points,
  onCaptain,
  onVice,
  onRemove,
}: {
  player: FantasyPlayer | null;
  onClose: () => void;
  captain: number | null;
  vice: number | null;
  viceEnabled: boolean;
  canRemove: boolean;
  canCaptain: boolean;
  canVice: boolean;
  points: number | null;
  onCaptain: (id: number) => void;
  onVice: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <BottomSheet visible={player != null} onClose={onClose} title={player?.name ?? ""} snap="content">
      {player ? (
        <View style={styles.sheetBody}>
          <PlayerSummary player={player} />
          {points != null ? <StatChip label="Bu hafta" value={`${points} puan`} tone="accent" /> : null}
          <View style={styles.sheetActions}>
            <Button
              label={captain === player.id ? "Kaptan" : "Kaptan yap"}
              icon="star"
              variant={captain === player.id ? "primary" : "secondary"}
              disabled={captain === player.id || !canCaptain}
              onPress={() => onCaptain(player.id)}
              fullWidth
            />
            {viceEnabled ? (
              <Button
                label={vice === player.id ? "Yardımcı kaptan" : "Yardımcı kaptan yap"}
                icon="star-half"
                variant="secondary"
                disabled={vice === player.id || captain === player.id || !canVice}
                onPress={() => onVice(player.id)}
                fullWidth
              />
            ) : null}
            <Button label={canRemove ? "Kadrodan çıkar" : "Maçı başladı · kilitli"} icon={canRemove ? "remove-circle-outline" : "lock-closed"} variant="ghost" disabled={!canRemove} onPress={() => onRemove(player.id)} fullWidth />
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

function PlayerSummary({ player }: { player: FantasyPlayer }) {
  const line = asLine(player.line);
  return (
    <View style={styles.summary}>
      <View style={styles.summaryHead}>
        <Avatar name={player.name} image={mediaUrl(player.image)} size={layout.crestLg} />
        <View style={styles.flex}>
          <View style={styles.summaryTitle}>
            <LineChip line={line} label={player.lineLabel ?? LINE_META[line].label} />
            {player.inactive ? <StatChip icon="moon" value="aktif değil" tone="warn" /> : null}
          </View>
          <Text style={styles.summaryTeam} {...textScale.dense}>
            {player.teamName ?? ""}
          </Text>
        </View>
        <View style={styles.summaryPrice}>
          <PriceTag price={player.price} trend={player.trend} prevPrice={player.prevPrice} />
          <Text style={styles.summaryPrev} {...textScale.badge}>
            {player.prevPrice != null && player.prevPrice !== player.price ? `geçen hafta ${formatCredit(player.prevPrice)}` : "kredi"}
          </Text>
        </View>
      </View>
      <View style={styles.statsGrid}>
        <Stat label="Form" value={formatNumber(player.form)} />
        <Stat label="Maç başı" value={formatNumber(player.ppm)} />
        <Stat label="Maç" value={String(player.matches ?? "–")} />
        <Stat label="Gol" value={String(player.goals ?? "–")} />
        <Stat label="Asist" value={String(player.assists ?? "–")} />
        <Stat label="Aktiflik" value={player.activity == null ? "–" : `%${Math.round(player.activity * 100)}`} />
      </View>
      <View style={styles.summaryForm}>
        <Text style={styles.summaryLabel} {...textScale.dense}>
          Son 5 maç
        </Text>
        <FormBars values={player.last5} height={22} />
        <Text style={styles.summaryLabel} {...textScale.dense}>
          {(player.last5 ?? []).map((v) => (v == null ? "–" : v)).join(" · ") || "veri yok"}
        </Text>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.statLabel} {...textScale.dense}>
        {label}
      </Text>
    </View>
  );
}

/* ─────────────────────── pazar ─────────────────────── */

const LINE_FILTERS: { key: FantasyLine | "ALL"; label: string }[] = [
  { key: "ALL", label: "Tümü" },
  { key: "GK", label: "Kaleci" },
  { key: "DEF", label: "Defans" },
  { key: "MID", label: "Orta saha" },
  { key: "FWD", label: "Hücum" },
];

function MarketSheet({
  visible,
  initialLine,
  onClose,
  players,
  selected,
  rules,
  budgetLeft,
  lockedTeams,
  onPick,
}: {
  visible: boolean;
  initialLine: FantasyLine | "ALL";
  onClose: () => void;
  players: FantasyPlayer[];
  selected: FantasyPlayer[];
  rules: ReturnType<typeof normalizeRules>;
  budgetLeft: number;
  lockedTeams: Set<number>;
  onPick: (player: FantasyPlayer) => void;
}) {
  const [term, setTerm] = useState("");
  const [line, setLine] = useState<FantasyLine | "ALL">(initialLine);
  const [sort, setSort] = useState<SortKey>("price");
  // Varsayılan: yalnız alınabilir oyuncular (bütçe, kilit, takım ve hat sınırı).
  const [onlyOpen, setOnlyOpen] = useState(true);
  useEffect(() => {
    if (visible) setLine(initialLine);
  }, [visible, initialLine]);
  const rows = useMemo(() => {
    const list = filterPlayers(players, { term, line, sort, exclude: selected.map((p) => p.id) }).map((player) => ({
      player,
      blocker: pickBlocker(player, selected, rules, budgetLeft, lockedTeams),
    }));
    return onlyOpen ? list.filter((row) => !row.blocker) : list;
  }, [players, term, line, sort, selected, rules, budgetLeft, lockedTeams, onlyOpen]);
  return (
    <BottomSheet visible={visible} onClose={onClose} title={`Pazar · ${formatCredit(budgetLeft)} kredi kaldı`} snap="full" scrollable={false}>
      <View style={styles.sheet}>
        <Input variant="search" size="sm" value={term} onChangeText={setTerm} placeholder="Oyuncu ya da takım ara" autoCorrect={false} />
        <ChipGroup contentPadding={0}>
          {LINE_FILTERS.map((item) => (
            <Chip key={item.key} size="sm" label={item.label} selected={line === item.key} onPress={() => setLine(item.key)} />
          ))}
        </ChipGroup>
        <ChipGroup contentPadding={0}>
          {SORTS.map((item) => (
            <Chip key={item.key} size="sm" tone="neutral" icon={sort === item.key ? "swap-vertical" : undefined} label={item.label} selected={sort === item.key} onPress={() => setSort(item.key)} />
          ))}
          <Chip size="sm" tone="win" icon="checkmark" label="Alınabilir" selected={onlyOpen} onPress={() => setOnlyOpen((v) => !v)} />
        </ChipGroup>
        <FlatList
          data={rows}
          keyExtractor={(row) => String(row.player.id)}
          keyboardShouldPersistTaps="handled"
          style={styles.flex}
          initialNumToRender={14}
          ListEmptyComponent={<EmptyState icon="search-outline" title="Oyuncu yok" body="Süzgeci değiştir ya da aramayı temizle." variant="inline" />}
          renderItem={({ item }) => <PlayerMarketRow player={item.player} blocker={item.blocker} onPress={onPick} />}
        />
      </View>
    </BottomSheet>
  );
}

/* ═══════════════════════════ SIRALAMA ═══════════════════════════ */

function Board({ scope }: { scope: Scope }) {
  const [period, setPeriod] = useState<"week" | "season">("week");
  const query = useQuery({
    queryKey: ["fantasy", "board", scope.leagueId, scope.seasonId, period],
    queryFn: () => getFantasyBoard(scope, period),
    staleTime: 60_000,
  });
  const entries = query.data?.entries ?? [];
  const me = query.data?.me;
  return (
    <>
      <ChipGroup contentPadding={0}>
        <Chip size="sm" label="Bu hafta" selected={period === "week"} onPress={() => setPeriod("week")} />
        <Chip size="sm" label="Sezon" selected={period === "season"} onPress={() => setPeriod("season")} />
      </ChipGroup>
      {query.isLoading ? (
        <SkeletonCard lines={6} />
      ) : query.isError ? (
        <ErrorState variant="inline" error={query.error} onRetry={query.refetch} />
      ) : !entries.length ? (
        <EmptyState icon="podium-outline" title="Henüz kadro yok" body="Kadrolar kuruldukça ve maçlar oynandıkça sıralama oluşur." variant="inline" />
      ) : (
        <>
          {me ? (
            <WeekHero
              overline={period === "week" ? `HAFTA ${weekNo(query.data?.week)} · SIRAN` : "SEZON · SIRAN"}
              title={`${me.rank}. sıra`}
              status={`${query.data?.totalPlayers ?? entries.length} menajer${period === "season" && me.bestWeek != null ? ` · en iyi hafta ${me.bestWeek}` : ""}`}
              points={me.points}
              celebrate={me.rank <= 3}
            />
          ) : null}
          <View>
            {entries.map((entry, index) => (
              <ListRow
                key={entry.userId}
                leading={
                  <View style={[styles.rank, entry.rank <= 3 && styles.rankTop]}>
                    <Text style={[styles.rankText, entry.rank <= 3 && styles.rankTextTop]} {...textScale.badge}>
                      {entry.rank}
                    </Text>
                  </View>
                }
                title={entry.name}
                subtitle={[entry.teamName, period === "season" ? `${entry.weeks} hafta` : null, period === "season" && entry.bestWeek != null ? `en iyi ${entry.bestWeek}` : null].filter(Boolean).join(" · ")}
                value={`${entry.points} p`}
                highlighted={entry.userId === me?.userId}
                position={entries.length === 1 ? "single" : index === 0 ? "first" : index === entries.length - 1 ? "last" : "middle"}
              />
            ))}
          </View>
          <Text style={styles.footnote} {...textScale.long}>
            {period === "week" ? "Eşit puanda kadrosunu daha erken kaydeden öne geçer." : "Eşit puanda en iyi haftası yüksek olan, sonra daha az haftada toplayan öne geçer."}
          </Text>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant, gap: space.md },
  hints: { gap: space.xs },
  hint: { flexDirection: "row", alignItems: "center", gap: space.s },
  hintText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  hintDanger: { color: colors.danger },
  actions: { flexDirection: "row", gap: space.sm },
  rulesLink: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.md },
  rulesText: { ...type.label, color: colors.textSecondary, flex: 1 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.xs },
  resultName: { ...type.body, color: colors.textPrimary, flex: 1 },
  resultMuted: { ...type.caption, color: colors.textTertiary },
  resultPoints: { ...type.scoreXs, color: colors.textPrimary, minWidth: 28, textAlign: "right" },
  history: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, height: 110 },
  historyCol: { flex: 1, alignItems: "center", gap: space.xxs, height: "100%" },
  historyValue: { ...type.numSmStrong, color: colors.textPrimary },
  historyTrack: { flex: 1, width: 18, justifyContent: "flex-end" },
  historyBar: { width: "100%", borderRadius: radius.xs, backgroundColor: colors.accent },
  historyHot: { backgroundColor: colors.win },
  historyWeek: { ...type.meta, color: colors.textTertiary },
  sheet: { flex: 1, gap: space.sm, paddingHorizontal: layout.screenPadding },
  sheetBody: { gap: space.md, paddingBottom: space.lg },
  sheetActions: { gap: space.sm },
  summary: { gap: space.md },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  summaryTitle: { flexDirection: "row", alignItems: "center", gap: space.s },
  summaryTeam: { ...type.bodySm, color: colors.textSecondary, marginTop: space.xxs },
  summaryPrice: { alignItems: "flex-end" },
  summaryPrev: { ...type.meta, color: colors.textTertiary },
  summaryForm: { flexDirection: "row", alignItems: "center", gap: space.md },
  summaryLabel: { ...type.caption, color: colors.textTertiary },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: space.sm },
  stat: { width: "33.33%", gap: space.xxs },
  statValue: { ...type.metricSm, color: colors.textPrimary },
  statLabel: { ...type.caption, color: colors.textTertiary },
  rank: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  rankTop: { backgroundColor: colors.accent },
  rankText: { ...type.numSmStrong, color: colors.textSecondary },
  rankTextTop: { color: colors.textOnAccent },
  footnote: { ...type.caption, color: colors.textTertiary },
});
