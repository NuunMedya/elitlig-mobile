/**
 * FANTEZİ ELİTLİG — seçili ligin gerçek oyuncularından haftalık 5 kişilik kadro
 * (routes/fantasy.js).
 *
 *   Kadrom    5 oyuncu, 40 kredi bütçe, takım başına en çok 2, bir kaptan (×2).
 *             Haftanın ilk maçı başlayınca kadro kilitlenir. Bu hafta kadro
 *             yoksa geçen haftanınki öneri olarak gelir.
 *   Sıralama  bu hafta / sezon toplamı.
 *
 * Puan gerçek maç istatistiklerinden gelir: oynadı 2, gol 4–6 (mevkiye göre),
 * asist 3, maçın oyuncusu 3, reyting ≥7,5 +2, kurtarış, kartlar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeaguePicker } from "@/components/LeaguePicker";
import {
  Avatar,
  Badge,
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
import { getFantasyBoard, getFantasyMe, getFantasyPool, saveFantasy, type FantasyPlayer } from "@/lib/api/community";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type Segment = "kadro" | "siralama";
const SEGMENTS: SegmentedItem<Segment>[] = [
  { key: "kadro", label: "Kadrom" },
  { key: "siralama", label: "Sıralama" },
];
const fold = (value: string) => value.toLocaleLowerCase("tr-TR").trim();

export default function FantasyScreen() {
  const auth = useAuth();
  const scope = useScope();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [segment, setSegment] = useState<Segment>("kadro");
  const ready = scope.ready && scope.leagueId != null && scope.seasonId != null;
  const fantasyScope = ready ? { leagueId: scope.leagueId as number, seasonId: scope.seasonId as number } : null;

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Fantezi ElitLig" subtitle="5 oyuncu · 40 kredi · kaptan ×2" back scrollY={scrollY} />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <LeaguePicker pinned={false} flush />
        <SegmentedControl items={SEGMENTS} value={segment} onChange={setSegment} />
        {!fantasyScope ? (
          <EmptyState icon="football-outline" title="Lig seç" body="Fantezi kadrosu bir lig ve sezon için kurulur." variant="inline" />
        ) : segment === "kadro" ? (
          <Lineup key={`${fantasyScope.leagueId}-${fantasyScope.seasonId}`} scope={fantasyScope} />
        ) : (
          <Board scope={fantasyScope} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type Scope = { leagueId: number; seasonId: number };

function Lineup({ scope }: { scope: Scope }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const poolQuery = useQuery({ queryKey: ["fantasy", "pool", scope.leagueId, scope.seasonId], queryFn: () => getFantasyPool(scope), staleTime: 10 * 60_000 });
  const auth = useAuth();
  const meQuery = useQuery({ queryKey: ["fantasy", "me", auth.user?.id ?? 0, scope.leagueId, scope.seasonId], queryFn: () => getFantasyMe(scope), staleTime: 30_000 });
  const [picks, setPicks] = useState<number[] | null>(null);
  const [captain, setCaptain] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const me = meQuery.data;
  const byId = useMemo(() => new Map((poolQuery.data?.players ?? []).map((player) => [player.id, player])), [poolQuery.data]);
  /* Başlangıç kadrosu: bu haftanın kadrosu ya da geçen haftanın önerisi.
     Havuzda artık olmayan (takımından ayrılmış) oyuncular ayıklanır. */
  useEffect(() => {
    if (!me || picks || !poolQuery.data) return;
    const base = me.lineup ?? me.suggestion;
    const ids = (base?.playerIds ?? []).filter((id) => byId.has(id));
    setPicks(ids);
    setCaptain(base?.captainId != null && ids.includes(base.captainId) ? base.captainId : ids[0] ?? null);
  }, [byId, me, picks, poolQuery.data]);

  const budget = poolQuery.data?.budget ?? 40;
  const size = poolQuery.data?.size ?? 5;
  const maxPerTeam = poolQuery.data?.maxPerTeam ?? 2;
  const selected = (picks ?? []).map((id) => byId.get(id)).filter(Boolean) as FantasyPlayer[];
  const selectedIds = selected.map((player) => player.id);
  const cost = selected.reduce((sum, player) => sum + player.price, 0);
  const locked = Boolean(me?.week.locked);
  const saved = me?.lineup && JSON.stringify([...me.lineup.playerIds].sort()) === JSON.stringify([...selectedIds].sort()) && me.lineup.captainId === captain;

  const save = useMutation({
    mutationFn: () => saveFantasy(scope, selectedIds, captain as number),
    onSuccess: (data) => {
      toast.show({ message: `${data.message} (${data.cost} kredi)`, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["fantasy"] });
      void queryClient.invalidateQueries({ queryKey: ["career", "me"] });
    },
    onError: (error) => toast.show({ message: error instanceof ApiError ? error.userMessage : "Kadro kaydedilemedi.", tone: "danger" }),
  });

  if (poolQuery.isLoading || meQuery.isLoading || !picks) return <SkeletonCard lines={6} />;
  if (poolQuery.isError || meQuery.isError) {
    return <ErrorState variant="inline" error={poolQuery.error ?? meQuery.error} onRetry={() => { void poolQuery.refetch(); void meQuery.refetch(); }} />;
  }
  if (!poolQuery.data?.players.length) {
    return <EmptyState icon="people-outline" title="Oyuncu havuzu boş" body="Bu ligde henüz fikstürü olan takım yok." variant="inline" />;
  }

  const deadline = me?.week.deadline
    ? `${formatDateShort(me.week.deadline)} ${new Date(me.week.deadline).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}`
    : "";
  const remove = (id: number) => {
    setPicks((current) => (current ?? []).filter((item) => item !== id));
    if (captain === id) setCaptain(null);
  };
  const add = (player: FantasyPlayer) => {
    // Hızlı çift dokunuşta 6. oyuncu eklenmesin: sınır güncel durumda denetlenir.
    setPicks((current) => {
      const list = current ?? [];
      if (list.length >= size || list.includes(player.id)) return list;
      const next = [...list, player.id];
      if (next.length >= size) setPickerOpen(false);
      return next;
    });
    setCaptain((current) => current ?? player.id);
  };
  const breakdown = new Map((me?.lineup?.breakdown ?? []).map((item) => [item.id, item.points]));

  return (
    <>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.title} {...textScale.dense}>
            {`Hafta ${me?.week.key.split("-W")[1] ?? ""}`}
          </Text>
          {locked ? <Badge label="Kilitli" tone="neutral" size="xs" /> : <Badge label={`Kilit: ${deadline}`} tone="warn" size="xs" />}
        </View>
        <Text style={styles.text} {...textScale.dense}>
          {`Bütçe ${cost}/${budget} kredi · ${selected.length}/${size} oyuncu${me?.lineup ? ` · bu hafta ${me.lineup.points} puan` : ""}`}
        </Text>
        <View style={styles.budget}>
          <View style={[styles.budgetFill, { width: `${Math.min(100, (cost / budget) * 100)}%` }, cost > budget && styles.over]} />
        </View>
      </View>

      <View>
        {selected.map((player, index) => (
          <ListRow
            key={player.id}
            leading={<Avatar name={player.name} image={mediaUrl(player.image)} size={layout.crestLg} />}
            title={player.name}
            subtitle={[player.teamName, `${player.price} kredi`, breakdown.has(player.id) ? `${breakdown.get(player.id)} puan` : null].filter(Boolean).join(" · ")}
            position={selected.length === 1 ? "single" : index === 0 ? "first" : index === selected.length - 1 ? "last" : "middle"}
            trailing={
              <View style={styles.actions}>
                <Touchable feedback="icon" haptic="selection" disabled={locked} onPress={() => setCaptain(player.id)} accessibilityLabel="Kaptan yap" accessibilityState={{ selected: captain === player.id }}>
                  <Ionicons name={captain === player.id ? "star" : "star-outline"} size={20} color={captain === player.id ? colors.star : colors.textTertiary} />
                </Touchable>
                {!locked ? (
                  <Touchable feedback="icon" haptic="selection" onPress={() => remove(player.id)} accessibilityLabel={`${player.name} kadrodan çıkar`}>
                    <Ionicons name="close-circle-outline" size={20} color={colors.textTertiary} />
                  </Touchable>
                ) : null}
              </View>
            }
          />
        ))}
      </View>

      {!locked ? (
        <>
          {selected.length < size ? (
            <Button label={`Oyuncu ekle (${size - selected.length})`} icon="add" variant="secondary" onPress={() => setPickerOpen(true)} />
          ) : null}
          <Button
            label={saved ? "Kaydedildi" : "Kadroyu kaydet"}
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={Boolean(saved) || selected.length !== size || captain == null || cost > budget}
            size="lg"
            fullWidth
          />
          <Text style={styles.hint} {...textScale.long}>
            {`Yıldızla kaptanını seç (puanı ×2). Aynı takımdan en çok ${maxPerTeam} oyuncu.`}
          </Text>
        </>
      ) : null}

      {me?.history.length ? (
        <View style={styles.card}>
          <Text style={styles.title} {...textScale.dense}>
            Geçmiş haftalar
          </Text>
          <Text style={styles.text} {...textScale.dense}>
            {me.history.map((item) => `H${item.week.split("-W")[1]}: ${item.points}`).join(" · ")}
          </Text>
        </View>
      ) : null}

      <PlayerPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        players={poolQuery.data.players}
        picks={picks}
        budgetLeft={budget - cost}
        maxPerTeam={maxPerTeam}
        selected={selected}
        onPick={add}
      />
    </>
  );
}

function PlayerPicker({
  visible,
  onClose,
  players,
  picks,
  budgetLeft,
  maxPerTeam,
  selected,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  players: FantasyPlayer[];
  picks: number[];
  budgetLeft: number;
  maxPerTeam: number;
  selected: FantasyPlayer[];
  onPick: (player: FantasyPlayer) => void;
}) {
  const [term, setTerm] = useState("");
  const perTeam = new Map<number, number>();
  selected.forEach((player) => perTeam.set(player.teamId, (perTeam.get(player.teamId) || 0) + 1));
  const needle = fold(term);
  const list = players.filter(
    (player) => !picks.includes(player.id) && (!needle || fold(`${player.name} ${player.teamName ?? ""}`).includes(needle)),
  );
  return (
    <BottomSheet visible={visible} onClose={onClose} title={`Oyuncu seç · ${budgetLeft} kredi kaldı`} snap="full" scrollable={false}>
      <View style={styles.sheet}>
        <Input variant="search" size="sm" value={term} onChangeText={setTerm} placeholder="Oyuncu ya da takım ara" autoCorrect={false} />
        <FlatList
          data={list}
          keyExtractor={(player) => String(player.id)}
          keyboardShouldPersistTaps="handled"
          style={styles.flex}
          renderItem={({ item }) => {
            const blocked = item.price > budgetLeft || (perTeam.get(item.teamId) || 0) >= maxPerTeam;
            return (
              <ListRow
                leading={<Avatar name={item.name} image={mediaUrl(item.image)} size={layout.crestLg} />}
                title={item.name}
                subtitle={[item.position, item.teamName].filter(Boolean).join(" · ")}
                value={`${item.price} kr`}
                disabled={blocked}
                position="single"
                onPress={() => onPick(item)}
                style={styles.pickRow}
              />
            );
          }}
        />
      </View>
    </BottomSheet>
  );
}

function Board({ scope }: { scope: Scope }) {
  const [period, setPeriod] = useState<"week" | "season">("week");
  const query = useQuery({
    queryKey: ["fantasy", "board", scope.leagueId, scope.seasonId, period],
    queryFn: () => getFantasyBoard(scope, period),
    staleTime: 60_000,
  });
  const entries = query.data?.entries ?? [];
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
        <View>
          {query.data?.me ? (
            <Text style={styles.text} {...textScale.dense}>
              {`Sıran: ${query.data.me.rank}. · ${query.data.me.points} puan`}
            </Text>
          ) : null}
          {entries.map((entry, index) => (
            <ListRow
              key={entry.userId}
              title={`${entry.rank}. ${entry.name}`}
              subtitle={[entry.teamName, `${entry.weeks} hafta`].filter(Boolean).join(" · ")}
              value={`${entry.points} p`}
              highlighted={entry.userId === query.data?.me?.userId}
              position={entries.length === 1 ? "single" : index === 0 ? "first" : index === entries.length - 1 ? "last" : "middle"}
            />
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant, gap: space.md },
  card: {
    gap: space.s,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...type.h3, color: colors.textPrimary },
  text: { ...type.body, color: colors.textSecondary },
  hint: { ...type.caption, color: colors.textTertiary },
  budget: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: "hidden" },
  budgetFill: { height: 6, backgroundColor: colors.accent },
  over: { backgroundColor: colors.danger },
  actions: { flexDirection: "row", alignItems: "center", gap: space.md },
  sheet: { flex: 1, gap: space.sm },
  pickRow: { marginBottom: space.xs },
});

