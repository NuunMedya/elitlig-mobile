/**
 * SAHA SIRALAMASI — gerçek maçların haftalık ve aylık liderlik tablosu
 * (GET /api/career/leaderboard).
 *
 * NE: üstte iki segment (Oyuncular / Takımlar / XP · dönem), altında
 * kapsam çip şeridi (Türkiye + iller; varsayılan Türkiye geneli)
 * ve "bu dönem / geçen dönem" çipi. İlk üç podyumda, kalanı yoğun liste.
 * Kendi satırın (oyuncu ya da takımın) listede vurgulanır; listenin dışında
 * kalıyorsa üstte sabit bir kartla gösterilir.
 *
 * PUAN:
 *   Oyuncular  dönemde oynanan maçların SAHA XP'si (maç, gol, asist, kurtarış,
 *              reyting, sonuç, kartsız — Kariyerim'deki standart saha XP'si)
 *   Takımlar   takım puanı: maç başına 10, galibiyet başına 5 + biten takım
 *              görevleri (Kariyerim → Takım)
 *   XP         Elit Seviye XP'si (saha + seyirci + oyunlar): haftalık (bu hafta
 *              kazanılan) ya da tüm zamanlar (Elit Seviye ile)
 *
 * NEDEN AYRI DÖNEMLER: haftalık tablo her Pazartesi sıfırlanır (her hafta
 * yeni şans, her hafta sahaya çıkma nedeni); aylık tablo ayın emeğini
 * ödüllendirir. İkisi ayrı tutulur, karışmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LinearGradient } from "expo-linear-gradient";
import {
  Avatar,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Odometer,
  RankBadge,
  Reveal,
  ScreenHeader,
  SegmentedControl,
  SkeletonHero,
  SkeletonListRow,
  TeamLogo,
  Touchable,
  useRefresh,
  type SegmentedItem,
} from "@/components/ui";
import { SignatureStripe, StageCard, StatPill } from "@/components/league/kit";
import {
  getSahaLeaderboard,
  getXpLeaderboard,
  type LeaderType,
  type PeriodKind,
  type SahaLeaderRow,
  type XpLeaderRow,
  type XpPeriod,
} from "@/lib/api/career";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, glowStyle, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

type Kind = LeaderType | "xp";
const TYPES: SegmentedItem<Kind>[] = [
  { key: "players", label: "Oyuncular" },
  { key: "teams", label: "Takımlar" },
  { key: "xp", label: "XP" },
];
const XP_PERIODS: SegmentedItem<XpPeriod>[] = [
  { key: "week", label: "Haftalık" },
  { key: "all", label: "Tüm zamanlar" },
];

/** Ekranın ortak tablosu: saha ve XP sıralaması aynı satırlarla çizilir. */
interface Board {
  label: string;
  total: number;
  rows: SahaLeaderRow[];
  me: SahaLeaderRow | null;
  starts_at: string | null;
  ends_at: string | null;
}
const fromXp = (row: XpLeaderRow): SahaLeaderRow => ({
  rank: row.rank,
  score: row.xp,
  matches: 0,
  goals: 0,
  name: row.name,
  city: row.city,
  city_id: row.city_id,
  player_id: row.player_id ?? undefined,
  image: row.image,
  user_id: row.user_id,
  team_name: row.team_name,
  level: row.level,
  layers: row.layers,
});
const PERIODS: SegmentedItem<PeriodKind>[] = [
  { key: "week", label: "Haftalık" },
  { key: "month", label: "Aylık" },
];

export default function SahaSiralamasiScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; period?: string }>();
  const auth = useAuth();
  const scope = useScope();
  const [kind, setKind] = useState<Kind>(params.type === "teams" ? "teams" : params.type === "xp" ? "xp" : "players");
  const [period, setPeriod] = useState<PeriodKind>(params.period === "month" ? "month" : "week");
  const [xpPeriod, setXpPeriod] = useState<XpPeriod>(params.period === "all" ? "all" : "week");
  const [offset, setOffset] = useState(0);
  // null = Türkiye geneli (varsayılan): herkes herkesle yarışır; il bir süzgeç.
  const [cityId, setCityId] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ["career", "leaderboard", kind, kind === "xp" ? xpPeriod : period, kind === "xp" ? 0 : offset, cityId],
    queryFn: async (): Promise<Board> => {
      if (kind === "xp") {
        const res = await getXpLeaderboard({ period: xpPeriod, cityId });
        return { label: res.scope.label, total: res.total, rows: res.rows.map(fromXp), me: res.me ? fromXp(res.me) : null, starts_at: res.period.starts_at, ends_at: res.period.ends_at };
      }
      const res = await getSahaLeaderboard({ type: kind, period, offset, cityId });
      return { label: res.scope.label, total: res.total, rows: res.rows, me: res.me, starts_at: res.period.starts_at, ends_at: res.period.ends_at };
    },
    staleTime: 60_000,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const data = query.data;
  const myPlayer = auth.user?.player_id ?? null;

  const isMine = (row: SahaLeaderRow) =>
    Boolean(data?.me && (kind === "xp" ? row.user_id === data.me.user_id : kind === "players" ? row.player_id === data.me.player_id : row.id === data.me.id));
  const meOutside = data?.me && !data.rows.some(isMine) ? data.me : null;
  const cities = useMemo(() => scope.cities.filter((city) => !city.is_archived), [scope.cities]);

  const periodLabel =
    kind === "xp" ? (xpPeriod === "week" ? "Bu hafta" : "Tüm zamanlar") : period === "week" ? (offset ? "Geçen hafta" : "Bu hafta") : offset ? "Geçen ay" : "Bu ay";
  const range =
    data && data.starts_at && data.ends_at
      ? `${formatDateShort(data.starts_at)} – ${formatDateShort(new Date(new Date(data.ends_at).getTime() - 1000).toISOString())} · `
      : "";
  const unit = kind === "teams" ? "takım" : kind === "xp" ? "üye" : "oyuncu";
  const open = (row: SahaLeaderRow) => {
    if ((kind === "players" || kind === "xp") && row.player_id) router.push(`/oyuncu/${row.player_id}`);
    else if (kind === "teams" && row.id) router.push(`/takim/${row.id}`);
  };

  const header = (
    <View style={styles.head}>
      <SegmentedControl items={TYPES} value={kind} onChange={setKind} stretch />
      <View style={styles.controlRow}>
        <View style={styles.flex}>
          {kind === "xp" ? (
            <SegmentedControl items={XP_PERIODS} value={xpPeriod} onChange={setXpPeriod} size="sm" stretch />
          ) : (
            <SegmentedControl items={PERIODS} value={period} onChange={(next) => { setPeriod(next); setOffset(0); }} size="sm" stretch />
          )}
        </View>
        {kind !== "xp" ? (
          <Chip
            label={offset ? (period === "week" ? "Bu hafta" : "Bu ay") : period === "week" ? "Geçen hafta" : "Geçen ay"}
            icon={offset ? "arrow-forward" : "time-outline"}
            selected={offset > 0}
            onPress={() => setOffset(offset ? 0 : 1)}
            size="sm"
          />
        ) : null}
      </View>
      <ChipGroup contentPadding={layout.screenPadding} style={styles.bleed}>
        <Chip label="Türkiye" icon="earth-outline" selected={cityId == null} onPress={() => setCityId(null)} size="sm" />
        {cities.map((city) => (
          <Chip key={city.id} label={city.label} selected={cityId === city.id} onPress={() => setCityId(city.id)} size="sm" />
        ))}
      </ChipGroup>

      {/* ÖZET SAHNESİ — kapsam, dönem, katılımcı sayısı ve podyum tek blokta. */}
      {data ? (
        <Reveal>
          <StageCard style={styles.stage}>
            <View style={styles.stageTop}>
              <View style={styles.flex}>
                <Text style={styles.stageOver} {...textScale.badge}>
                  {upperTR(`${data.label ?? (cityId ? "İl" : "Türkiye")} · ${periodLabel}`)}
                </Text>
                <Text style={styles.stageRange} numberOfLines={1} {...textScale.dense}>
                  {range ? range.replace(/ · $/, "") : kind === "xp" ? "Elit Seviye XP'si" : "Saha sıralaması"}
                </Text>
              </View>
              <View style={styles.stageCount}>
                <Odometer value={data.total} style={styles.stageCountValue} />
                <Text style={styles.stageCountUnit} {...textScale.badge}>
                  {upperTR(unit)}
                </Text>
              </View>
            </View>
            {data.rows.length >= 3 ? (
              <Podium rows={data.rows.slice(0, 3)} kind={kind} onPress={open} isMine={isMine} />
            ) : null}
          </StageCard>
        </Reveal>
      ) : null}

      <View style={styles.ruleRow}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
        <Text style={styles.rule} {...textScale.long}>
          {kind === "players"
            ? "Puan: dönemde oynadığın maçların saha XP'si (maç, gol, asist, kurtarış, reyting, galibiyet, kartsız)."
            : kind === "teams"
              ? "Puan: maç başına 10, galibiyet başına 5 + biten takım görevleri. Daha çok maç, daha çok puan."
              : "Elit Seviye XP'si: maçlar, görevler, rozetler, tahminler ve oyunlar. Kariyerim'i açtıkça XP'n güncellenir."}
        </Text>
      </View>
      {meOutside ? (
        <View style={styles.pinnedWrap}>
          <Text style={styles.pinnedLabel} {...textScale.badge}>
            {upperTR("Senin sıran")}
          </Text>
          <Row row={meOutside} kind={kind} mine onPress={() => open(meOutside)} pinned />
        </View>
      ) : null}
      {data && data.rows.length > 3 ? (
        <Text style={styles.listLabel} {...textScale.badge}>
          {upperTR("Sıralama")}
        </Text>
      ) : null}
    </View>
  );

  const listRows = data ? (data.rows.length >= 3 ? data.rows.slice(3) : data.rows) : [];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Saha Sıralaması" subtitle="Sahadaki emeğin haftalık tablosu" back />
      {query.isLoading ? (
        <View style={styles.pad}>
          <SkeletonHero />
          <SkeletonListRow count={6} />
        </View>
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <FlatList
          data={listRows}
          keyExtractor={(row) => `${kind}-${row.user_id ?? row.player_id ?? row.id}`}
          ListHeaderComponent={header}
          contentContainerStyle={styles.content}
          refreshControl={refresh.control}
          renderItem={({ item, index }) => (
            <Reveal index={index} limit={8}>
              <Row
                row={item}
                kind={kind}
                mine={isMine(item)}
                first={index === 0}
                last={index === listRows.length - 1}
                onPress={() => open(item)}
              />
            </Reveal>
          )}
          ListEmptyComponent={
            data.rows.length ? null : (
              <EmptyState
                icon="podium-outline"
                title="Bu dönemde henüz maç yok"
                body={
                  kind === "players"
                    ? "Maça çık, saha XP'si topla, sıralamaya ilk sen gir."
                    : kind === "teams"
                      ? "Takımınla maç al ve oyna; görevleri bitir, sıralamaya ilk siz girin."
                      : "Görevleri bitir, maça çık, oyun oyna; XP topla, sıralamaya ilk sen gir."
                }
              />
            )
          }
          ListFooterComponent={
            (!myPlayer && kind === "players") || (!auth.user && kind === "xp") ? (
              <Text style={styles.footer} {...textScale.long}>
                {kind === "xp" ? "Kendi sıranı görmek için giriş yap." : "Kendi sıranı görmek için Kariyerim'den oyuncu profilini bağla."}
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function subtitleOf(row: SahaLeaderRow, kind: Kind) {
  if (kind === "xp") {
    const parts = [row.level ? `Sv ${row.level}` : null, row.team_name, row.city];
    if (row.layers && !row.level) parts.push(`Saha ${row.layers.saha} · Oyun ${row.layers.arena} · Seyirci ${row.layers.tribun}`);
    return parts.filter(Boolean).join(" · ");
  }
  if (kind === "players") {
    const parts = [row.team?.name, `${row.matches} maç`, row.goals ? `${row.goals} gol` : null, row.assists ? `${row.assists} asist` : null];
    return parts.filter(Boolean).join(" · ");
  }
  const parts = [row.city, `${row.matches} maç`, row.wins ? `${row.wins} galibiyet` : null, row.quests_total ? `${row.quests_done}/${row.quests_total} görev` : null];
  return parts.filter(Boolean).join(" · ");
}

function Leading({ row, kind, size }: { row: SahaLeaderRow; kind: Kind; size: number }) {
  return kind !== "teams" ? <Avatar name={row.name} image={row.image ?? null} size={size} /> : <TeamLogo name={row.name} logo={row.logo ?? null} size={size} />;
}

/**
 * Sıralama satırı. Satırlar tek bir grup kartının dilimleridir (ilk satır
 * üst, son satır alt köşeleri yuvarlar). Sıra solda tabular rakam; puan
 * sağda değer hapı. Kendi satırın `brandDim` zemin + imza şeridi taşır;
 * listenin dışındaysan üstte ayrı, çerçeveli bir kart olarak sabitlenir.
 */
function Row({ row, kind, mine, first, last, pinned, onPress }: { row: SahaLeaderRow; kind: Kind; mine?: boolean; first?: boolean; last?: boolean; pinned?: boolean; onPress: () => void }) {
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.rank}. ${row.name}, ${row.score} puan`}
      style={[
        styles.row,
        pinned ? styles.rowPinned : [first ? styles.rowFirst : styles.rowBorder, last ? styles.rowLast : null],
        mine ? styles.rowMine : null,
      ]}
    >
      {mine ? <SignatureStripe /> : null}
      {row.rank <= 3 ? (
        <RankBadge rank={row.rank} size={26} style={styles.rankBadge} />
      ) : (
        <Text style={[styles.rank, mine && styles.rankMine]} {...textScale.dense}>
          {row.rank}
        </Text>
      )}
      <Leading row={row} kind={kind} size={38} />
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
          {row.name}
          {mine ? <Text style={styles.youTag}>{"  · sen"}</Text> : null}
        </Text>
        <Text style={styles.caption} numberOfLines={1} {...textScale.dense}>
          {subtitleOf(row, kind)}
        </Text>
      </View>
      <StatPill value={row.score.toLocaleString("tr-TR")} unit={kind === "teams" ? "PUAN" : "XP"} tone={mine ? "brand" : "neutral"} minWidth={56} />
    </Touchable>
  );
}

/** Podyum basamak yükseklikleri (dizin = sıra − 1). */
const STEP_HEIGHT = [58, 42, 30] as const;
const MEDAL_GRADIENT = [colors.medalGold, colors.medalSilver, colors.medalBronze] as const;

/**
 * Sahnenin içindeki podyum: 2 · 1 · 3 düzeni, madalya degradeli halka +
 * `RankBadge`, basamak üstünde puan. Birinci büyük ve ışık halkalı.
 */
function Podium({ rows, kind, onPress, isMine }: { rows: SahaLeaderRow[]; kind: Kind; onPress: (row: SahaLeaderRow) => void; isMine: (row: SahaLeaderRow) => boolean }) {
  const order = [1, 0, 2];
  return (
    <View style={styles.podium}>
      {order.map((place, column) => {
        const row = rows[place];
        if (!row) return <View key={`empty-${place}`} style={styles.podiumCol} />;
        const first = place === 0;
        const medal = MEDAL_GRADIENT[place];
        return (
          <Reveal key={`${row.user_id ?? row.player_id ?? row.id}`} index={column + 1} distance={14} style={styles.podiumCol}>
            <Touchable
              feedback="card"
              haptic="selection"
              onPress={() => onPress(row)}
              style={styles.podiumInner}
              accessibilityRole="button"
              accessibilityLabel={`${row.rank}. ${row.name}, ${row.score} ${kind === "teams" ? "puan" : "XP"}`}
            >
              <View style={styles.podiumAvatar}>
                <View style={[styles.podiumRing, { borderColor: medal[0] }, first ? glowStyle(medal[1], 2) : null, isMine(row) ? styles.podiumMine : null]}>
                  <Leading row={row} kind={kind} size={first ? 58 : 44} />
                </View>
                <RankBadge rank={row.rank} size={first ? 24 : 20} style={styles.podiumMedal} />
              </View>
              <Text style={first ? styles.podiumNameFirst : styles.podiumName} numberOfLines={first ? 2 : 1} {...textScale.dense}>
                {row.name}
              </Text>
              <View style={[styles.step, { height: STEP_HEIGHT[place] }]}>
                <LinearGradient colors={medal} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.stepTop} />
                <Text style={first ? styles.stepValueFirst : styles.stepValue} numberOfLines={1} {...textScale.dense}>
                  {row.score.toLocaleString("tr-TR")}
                </Text>
                <Text style={styles.stepUnit} {...textScale.badge}>
                  {kind === "teams" ? "PUAN" : "XP"}
                </Text>
              </View>
            </Touchable>
          </Reveal>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  pad: { padding: layout.screenPadding, gap: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  head: { gap: space.md, paddingTop: space.md, paddingBottom: space.sm },
  bleed: { marginHorizontal: -layout.screenPadding },
  controlRow: { flexDirection: "row", alignItems: "center", gap: space.sm },

  /* Sahne */
  stage: { paddingTop: space.md, paddingBottom: 0 },
  stageTop: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg },
  stageOver: { ...type.overline, color: colors.brandOnDark },
  stageRange: { ...type.h4, color: colors.onDark, marginTop: space.xxs },
  stageCount: {
    alignItems: "center",
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  stageCountValue: { ...type.scoreSm, color: colors.onDark },
  stageCountUnit: { ...type.micro, color: colors.onDarkMuted },

  podium: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.md },
  podiumCol: { flex: 1, minWidth: 0 },
  podiumInner: { alignItems: "center", gap: space.px },
  podiumAvatar: { alignItems: "center", marginBottom: space.m },
  podiumRing: { borderWidth: 2, borderRadius: radius.pill, padding: 2 },
  podiumMine: { borderStyle: "dashed" },
  podiumMedal: { position: "absolute", bottom: -9, alignSelf: "center" },
  podiumName: { ...type.labelSm, color: colors.onDark, textAlign: "center", alignSelf: "stretch" },
  podiumNameFirst: { ...type.h4, color: colors.onDark, textAlign: "center", alignSelf: "stretch" },
  step: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.s,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderBottomWidth: 0,
    borderColor: colors.inkTileBorder,
    overflow: "hidden",
  },
  stepTop: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  stepValue: { ...type.scoreXs, color: colors.onDark },
  stepValueFirst: { ...type.scoreMd, color: colors.onDark },
  stepUnit: { ...type.micro, color: colors.onDarkMuted },

  ruleRow: { flexDirection: "row", alignItems: "flex-start", gap: space.s, paddingHorizontal: space.xxs },
  rule: { ...type.caption, color: colors.textTertiary, flex: 1 },
  pinnedWrap: { gap: space.s },
  pinnedLabel: { ...type.overline, color: colors.brandAccent, paddingHorizontal: space.xxs },
  listLabel: { ...type.overline, color: colors.textTertiary, paddingHorizontal: space.xxs, marginTop: space.xs },
  footer: { ...type.caption, color: colors.textTertiary, textAlign: "center", marginTop: space.md },

  /* Satır */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 60,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface1,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  rowFirst: { borderTopWidth: hairline, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  rowBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  rowLast: { borderBottomWidth: hairline, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  rowMine: { backgroundColor: colors.brandDim },
  rowPinned: { borderRadius: radius.xl, borderWidth: hairline, borderColor: colors.brandBorder, ...elevate(1) },
  rank: { ...type.tableNumStrong, color: colors.textTertiary, width: 26, textAlign: "center" },
  rankBadge: { marginHorizontal: 0 },
  rankMine: { color: colors.brandAccent },
  name: { ...type.h4, color: colors.textPrimary },
  youTag: { color: colors.brandAccent },
  caption: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },
});
