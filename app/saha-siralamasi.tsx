/**
 * SAHA SIRALAMASI — gerçek maçların haftalık ve aylık liderlik tablosu
 * (GET /api/career/leaderboard).
 *
 * NE: üstte iki segment (Oyuncular / Takımlar / XP · dönem), altında
 * kapsam çip şeridi (Türkiye + iller; varsayılan seçili il, yoksa Türkiye)
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

import {
  Avatar,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  ScreenHeader,
  SegmentedControl,
  SkeletonCard,
  TeamLogo,
  Touchable,
  useRefresh,
  withAlpha,
  type SegmentedItem,
} from "@/components/ui";
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
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

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
// Rekor Tablosu ile aynı podyum tonları (altın · gümüş · bronz).
const MEDALS = [colors.yellowCard, colors.onDarkMuted, colors.zoneRelegationPlayoff];

export default function SahaSiralamasiScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; period?: string }>();
  const auth = useAuth();
  const scope = useScope();
  const [kind, setKind] = useState<Kind>(params.type === "teams" ? "teams" : params.type === "xp" ? "xp" : "players");
  const [period, setPeriod] = useState<PeriodKind>(params.period === "month" ? "month" : "week");
  const [xpPeriod, setXpPeriod] = useState<XpPeriod>(params.period === "all" ? "all" : "week");
  const [offset, setOffset] = useState(0);
  // null = Türkiye geneli; varsayılan kullanıcının seçili ili
  const [cityId, setCityId] = useState<number | null>(scope.cityId ?? null);

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
      {kind === "xp" ? (
        <SegmentedControl items={XP_PERIODS} value={xpPeriod} onChange={setXpPeriod} stretch />
      ) : (
        <SegmentedControl items={PERIODS} value={period} onChange={(next) => { setPeriod(next); setOffset(0); }} stretch />
      )}
      <ChipGroup contentPadding={0}>
        <Chip label="Türkiye" icon="earth-outline" selected={cityId == null} onPress={() => setCityId(null)} size="sm" />
        {cities.map((city) => (
          <Chip key={city.id} label={city.label} selected={cityId === city.id} onPress={() => setCityId(city.id)} size="sm" />
        ))}
      </ChipGroup>
      <View style={styles.metaRow}>
        <View style={styles.flex}>
          <Text style={styles.metaTitle} {...textScale.dense}>
            {`${data?.label ?? (cityId ? "İl" : "Türkiye")} · ${periodLabel}`}
          </Text>
          <Text style={styles.caption} {...textScale.dense}>
            {data ? `${range}${data.total} ${unit}` : " "}
          </Text>
        </View>
        {kind !== "xp" ? (
          <Chip label={offset ? (period === "week" ? "Bu hafta" : "Bu ay") : period === "week" ? "Geçen hafta" : "Geçen ay"} icon="time-outline" onPress={() => setOffset(offset ? 0 : 1)} size="sm" />
        ) : null}
      </View>
      <Text style={styles.rule} {...textScale.long}>
        {kind === "players"
          ? "Puan: dönemde oynadığın maçların saha XP'si (maç, gol, asist, kurtarış, reyting, galibiyet, kartsız)."
          : kind === "teams"
            ? "Puan: maç başına 10, galibiyet başına 5 + biten takım görevleri. Daha çok maç, daha çok puan."
            : "Elit Seviye XP'si: maçlar, görevler, rozetler, tahminler ve oyunlar. Kariyerim'i açtıkça XP'n güncellenir."}
      </Text>
      {meOutside ? <Row row={meOutside} kind={kind} mine onPress={() => open(meOutside)} pinned /> : null}
      {data && data.rows.length >= 3 ? <Podium rows={data.rows.slice(0, 3)} kind={kind} onPress={open} isMine={isMine} /> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Saha Sıralaması" back />
      {query.isLoading ? (
        <View style={styles.pad}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={8} />
        </View>
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <FlatList
          data={data.rows.length >= 3 ? data.rows.slice(3) : data.rows}
          keyExtractor={(row) => `${kind}-${row.user_id ?? row.player_id ?? row.id}`}
          ListHeaderComponent={header}
          contentContainerStyle={styles.content}
          refreshControl={refresh.control}
          renderItem={({ item, index }) => <Row row={item} kind={kind} mine={isMine(item)} first={index === 0} onPress={() => open(item)} />}
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

function Row({ row, kind, mine, first, pinned, onPress }: { row: SahaLeaderRow; kind: Kind; mine?: boolean; first?: boolean; pinned?: boolean; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${row.rank}. ${row.name}, ${row.score} puan`}>
      <View style={[styles.row, !first && !pinned && styles.rowBorder, mine && styles.rowMine, pinned && styles.rowPinned]}>
        <Text style={[styles.rank, mine && styles.rankMine]} {...textScale.dense}>
          {row.rank}
        </Text>
        <Leading row={row} kind={kind} size={36} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {pinned ? `${row.name} · sen` : row.name}
          </Text>
          <Text style={styles.caption} numberOfLines={1} {...textScale.dense}>
            {subtitleOf(row, kind)}
          </Text>
        </View>
        <View style={styles.scoreBox}>
          <Text style={styles.score} {...textScale.dense}>
            {row.score.toLocaleString("tr-TR")}
          </Text>
          <Text style={styles.scoreUnit} {...textScale.badge}>
            {kind === "teams" ? upperTR("puan") : "XP"}
          </Text>
        </View>
      </View>
    </Touchable>
  );
}

function Podium({ rows, kind, onPress, isMine }: { rows: SahaLeaderRow[]; kind: Kind; onPress: (row: SahaLeaderRow) => void; isMine: (row: SahaLeaderRow) => boolean }) {
  // ikinci · birinci · üçüncü
  const order = [rows[1], rows[0], rows[2]];
  return (
    <View style={styles.podium}>
      {order.map((row, i) => {
        const place = i === 1 ? 0 : i === 0 ? 1 : 2;
        const medal = MEDALS[place];
        return (
          <Touchable key={`${row.user_id ?? row.player_id ?? row.id}`} onPress={() => onPress(row)} style={styles.podiumCol} accessibilityRole="button" accessibilityLabel={`${row.rank}. ${row.name}`}>
            <View style={[styles.podiumRing, { borderColor: medal }, isMine(row) && styles.podiumMine]}>
              <Leading row={row} kind={kind} size={place === 0 ? 60 : 48} />
            </View>
            <View style={[styles.medal, { borderColor: medal }]}>
              <Text style={styles.medalText} {...textScale.badge}>
                {row.rank}
              </Text>
            </View>
            <Text style={styles.podiumName} numberOfLines={2} {...textScale.dense}>
              {row.name}
            </Text>
            <Text style={styles.podiumScore} {...textScale.dense}>
              {`${row.score.toLocaleString("tr-TR")} ${kind === "teams" ? "puan" : "XP"}`}
            </Text>
            <View style={[styles.podiumBase, { height: place === 0 ? 34 : place === 1 ? 24 : 16, backgroundColor: withAlpha(medal, 0.3) }]} />
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pad: { padding: layout.screenPadding, gap: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant },
  head: { gap: space.md, paddingTop: space.md, paddingBottom: space.md },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  metaTitle: { ...type.h3, color: colors.textPrimary },
  caption: { ...type.caption, color: colors.textSecondary },
  rule: { ...type.caption, color: colors.textTertiary },
  footer: { ...type.caption, color: colors.textTertiary, textAlign: "center", marginTop: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.surface1 },
  rowBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  rowMine: { backgroundColor: withAlpha(colors.accent, 0.12) },
  rowPinned: { borderRadius: radius.lg, borderWidth: hairline, borderColor: colors.accent },
  rank: { ...type.label, color: colors.textTertiary, width: 28, textAlign: "center" },
  rankMine: { color: colors.accentText },
  name: { ...type.label, color: colors.textPrimary },
  scoreBox: { alignItems: "flex-end" },
  score: { ...type.h3, color: colors.textPrimary },
  scoreUnit: { ...type.overline, color: colors.textTertiary },
  podium: { flexDirection: "row", alignItems: "flex-end", gap: space.s, paddingTop: space.s },
  podiumCol: { flex: 1, alignItems: "center", gap: space.xxs },
  podiumRing: { borderWidth: 2, borderRadius: radius.pill, padding: 2 },
  podiumMine: { shadowColor: colors.accent, shadowOpacity: 0.6, shadowRadius: 8 },
  medal: { marginTop: -12, minWidth: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, backgroundColor: colors.surface1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xs },
  medalText: { ...type.overline, color: colors.textPrimary },
  podiumName: { ...type.label, color: colors.textPrimary, textAlign: "center" },
  podiumScore: { ...type.caption, color: colors.textSecondary },
  podiumBase: { alignSelf: "stretch", borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, marginTop: space.xs },
});
