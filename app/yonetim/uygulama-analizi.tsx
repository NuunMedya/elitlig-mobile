/**
 * UYGULAMA ANALİZİ — mobil uygulamada geçen süre, oturumlar, ekranlar ve
 * oyunlar (web pages/management/analytics/app/AppAnalytics.js, analytics.view).
 *
 * NE: aralık (7/30/90 gün), platform (iOS / Android) ve "yönetim hesaplarını
 * dahil et" süzgeçleri. Kullanım göstergeleri (önceki döneme göre), günlük
 * süre / aktif cihaz / oturum grafiği, bağlılık (DAU, WAU, MAU, yapışkanlık),
 * platform payı, oturum süresi ve sürüm dağılımları, ekran süreleri, saatlere
 * göre kullanım; oyunlar (arena oyun kartları, karşılaştırma, günlük
 * oynanma, rekabet ve kariyer özellikleri) ve en çok oynayanlar.
 *
 * Veri: GET /api/admin/analytics/app (sunucu services/analytics/appReports.js).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, InfoLine, Panel } from "@/components/admin";
import { BarList, KpiGrid, KpiTile, SERIES_COLORS, TrendChart, WeekHourGrid } from "@/components/admin/system/charts";
import { DataList } from "@/components/admin/system/DataList";
import { Badge, Chip, ChipGroup, ErrorState, SegmentedControl, SkeletonCard, Toggle } from "@/components/ui";
import { APP_PLATFORMS, APP_RANGES, fmtBucket, fmtDuration, fmtNum, fmtPct, getAppReport, systemKeys } from "@/lib/api/admin/system";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["analytics.view"];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const list = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

type TrendMetric = "time" | "devices" | "sessions";
type GameMetric = "plays" | "players" | "time";

const toMinutes = (ms: unknown) => Math.round((Number(ms || 0) / 60000) * 10) / 10;
const fmtMinutes = (m: number) => (m >= 120 ? `${Math.round(m / 60).toLocaleString("tr-TR")} sa` : `${Math.round(m).toLocaleString("tr-TR")} dk`);
const fmtHours = (h: number) => `${h.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sa`;

export default function AppAnalyticsScreen() {
  const [range, setRange] = useState<string>("30d");
  const [platform, setPlatform] = useState<string>("");
  const [withManagement, setWithManagement] = useState(false);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("time");
  const [gameMetric, setGameMetric] = useState<GameMetric>("plays");
  const [playerGame, setPlayerGame] = useState("");

  const params = { range, platform, withManagement };
  const query = useQuery({
    queryKey: systemKeys.app(params),
    queryFn: () => getAppReport(params),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
  const data = query.data;
  const usage = data?.usage;
  const games = data?.games;
  const k = usage?.kpis ?? {};
  const prev = usage?.previous ?? {};
  const series = list(usage?.series);

  const inHours = trendMetric === "time" && Math.max(0, ...series.map((p) => p.totalMs || 0)) > 3 * 3_600_000;
  const trendData = series.map((p) =>
    trendMetric !== "time" ? Number(p[trendMetric] || 0) : inHours ? Math.round((p.totalMs / 3_600_000) * 10) / 10 : toMinutes(p.totalMs)
  );
  const trendFormat = trendMetric === "time" ? (inHours ? fmtHours : fmtMinutes) : (v: number) => fmtNum(v);

  const gameList = list(games?.games);
  const arena = gameList.filter((g) => g.kind === "arena");
  const features = gameList.filter((g) => g.kind !== "arena");
  const compare = useMemo(() => {
    const value = (g: Row) => (gameMetric === "time" ? toMinutes(g.playMs) : Number(g[gameMetric] || 0));
    return [...arena].sort((a, b) => value(b) - value(a)).map((g) => ({ key: g.key, label: g.name, value: value(g) }));
  }, [arena, gameMetric]);
  const playsSeries = list(games?.series);
  const platformTotal = list(usage?.platforms).reduce((a, p) => a + Number(p.devices || 0), 0);
  const players = playerGame ? list(data?.players?.byGame?.[playerGame]) : list(data?.players?.top);
  const noUsage = usage && !k.sessions;
  const gameName = (key: string) => gameList.find((g) => g.key === key)?.name || key;

  return (
    <AdminScreen title="Uygulama analizi" permission={PERMS} onRefresh={query.refetch} refreshing={query.isRefetching}>
      <SegmentedControl items={APP_RANGES.map((r) => ({ key: r.key, label: r.label }))} value={range} onChange={setRange} stretch />
      <ChipGroup scrollable contentPadding={0}>
        {APP_PLATFORMS.map((p) => (
          <Chip
            key={p.key || "all"}
            label={p.label}
            size="sm"
            icon={p.key === "ios" ? "logo-apple" : p.key === "android" ? "logo-android" : undefined}
            selected={platform === p.key}
            onPress={() => setPlatform(p.key)}
          />
        ))}
      </ChipGroup>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel} {...textScale.dense}>
          Yönetim hesaplarını dahil et
        </Text>
        <Toggle value={withManagement} onValueChange={setWithManagement} accessibilityLabel="Yönetim hesaplarını dahil et" />
      </View>
      {data?.range ? (
        <Text style={styles.hint} {...textScale.dense}>
          {fmtBucket(data.range.from)} – {fmtBucket(data.range.to)}
        </Text>
      ) : null}

      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} variant={data ? "banner" : "inline"} /> : null}
      {!data ? (
        query.isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : null
      ) : (
        <View style={[styles.stack, query.isFetching ? styles.refreshing : null]}>
          {data.method?.truncated ? (
            <View style={styles.warn}>
              <Ionicons name="warning-outline" size={16} color={colors.warn} />
              <Text style={styles.warnText} {...textScale.long}>
                Aralık çok büyük: ilk {fmtNum(data.method.rows)} ekran olayı hesaplandı. Daha kısa bir aralık seç.
              </Text>
            </View>
          ) : null}

          <KpiGrid>
            <KpiTile label="Aktif cihaz" value={k.devices} previous={prev.devices} />
            <KpiTile label="Aktif üye" value={k.members} previous={prev.members} />
            <KpiTile label="Oturum" value={k.sessions} previous={prev.sessions} />
            <KpiTile label="Ortalama oturum" value={k.avgSessionMs} format={fmtDuration} hint={`Ortanca ${fmtDuration(k.medianSessionMs)}`} />
            <KpiTile label="Toplam süre" value={k.totalMs} format={fmtDuration} />
            <KpiTile label="Cihaz başına günlük" value={k.avgDailyMsPerDevice} format={fmtDuration} />
            <KpiTile label="Günlük toplam (ort.)" value={k.avgPerDayMs} format={fmtDuration} />
            <KpiTile label="Yeni cihaz" value={k.newDevices} hint="İlk kez açan (yeni kurulum)" />
          </KpiGrid>

          {noUsage ? (
            <Panel>
              <Text style={styles.hint} {...textScale.long}>
                Bu aralıkta uygulamadan ekran olayı gelmedi. Aralığı genişlet ya da platform süzgecini kaldır.
              </Text>
            </Panel>
          ) : usage ? (
            <>
              <Panel title="Uygulamada geçen süre · günlük">
                <SegmentedControl<TrendMetric>
                  items={[
                    { key: "time", label: "Süre" },
                    { key: "devices", label: "Aktif cihaz" },
                    { key: "sessions", label: "Oturum" },
                  ]}
                  value={trendMetric}
                  onChange={setTrendMetric}
                  size="sm"
                  stretch
                />
                <TrendChart
                  type={trendMetric === "time" ? "bar" : "line"}
                  labels={series.map((p) => fmtBucket(p.key))}
                  series={[{ label: trendMetric === "time" ? "Süre" : trendMetric === "devices" ? "Aktif cihaz" : "Oturum", data: trendData }]}
                  format={trendFormat}
                />
              </Panel>

              <Panel title="Bağlılık · aralığın son gününe göre">
                <InfoLine label="Günlük aktif (DAU)" value={fmtNum(usage.engagement?.dau)} />
                <InfoLine label="Haftalık aktif (WAU)" value={fmtNum(usage.engagement?.wau)} />
                <InfoLine label="Aylık aktif (MAU)" value={fmtNum(usage.engagement?.mau)} />
                <InfoLine label="Ortalama DAU" value={fmtNum(usage.engagement?.avgDau)} />
                <InfoLine label="Yapışkanlık (DAU/MAU)" value={fmtPct(usage.engagement?.stickiness, 0)} />
                <InfoLine label="Ekran / oturum" value={String(k.screensPerSession ?? "—").replace(".", ",")} />
                {usage.errors?.count > 0 ? (
                  <InfoLine label="Uygulama hatası" value={`${fmtNum(usage.errors.count)} (${fmtNum(usage.errors.sessions)} oturumda)`} tone="danger" />
                ) : null}
              </Panel>

              <Panel title="Platform">
                <View style={styles.split}>
                  {list(usage.platforms).map((p, i) => (
                    <View
                      key={p.key}
                      style={[styles.splitPart, { flex: Math.max(0.02, platformTotal ? p.devices / platformTotal : 0), backgroundColor: SERIES_COLORS[i] }]}
                    />
                  ))}
                </View>
                <BarList
                  rows={list(usage.platforms).map((p, i) => ({ key: p.key, label: p.key, value: p.devices, note: "cihaz", color: SERIES_COLORS[i] }))}
                />
              </Panel>

              <Panel title="Oturum süresi dağılımı">
                <BarList rows={list(usage.sessionLengths).map((b) => ({ key: b.key, label: b.label, value: b.sessions }))} />
              </Panel>
              <Panel title="Cihaz başına oturum">
                <BarList rows={list(usage.sessionsPerDevice).map((b) => ({ key: b.key, label: b.label, value: b.devices }))} />
              </Panel>
              <Panel title="Uygulama sürümleri · cihaz">
                <BarList
                  rows={list(usage.versions).map((v) => ({ key: v.key, label: v.key === "Bilinmiyor" ? "Bilinmiyor (eski kayıt)" : `Sürüm ${v.key}`, value: v.devices }))}
                  limit={6}
                />
              </Panel>

              <Panel title="Ekran süreleri">
                <DataList
                  rows={[...list(usage.screens)].sort((a, b) => b.totalMs - a.totalMs)}
                  primary={(r) => `${r.gameArea ? "Oyun · " : ""}${r.name}${r.name !== r.key ? ` (${r.key})` : ""}`}
                  primaryLabel="Ekran"
                  csvTitle="Uygulama ekran süreleri"
                  columns={[
                    { key: "totalMs", label: "Toplam", render: (r) => fmtDuration(r.totalMs) },
                    { key: "share", label: "Pay", render: (r) => fmtPct(r.share) },
                    { key: "avgMs", label: "Ortalama", render: (r) => fmtDuration(r.avgMs) },
                    { key: "views", label: "Görüntüleme" },
                    { key: "devices", label: "Cihaz" },
                    { key: "exitShare", label: "Son ekran", render: (r) => fmtPct(r.exitShare, 0) },
                  ]}
                />
              </Panel>

              <Panel title="Saatlere göre kullanım · başlayan oturumlar">
                <WeekHourGrid grid={usage.heatmap} unit="oturum" />
              </Panel>
            </>
          ) : null}

          <Text style={styles.section} {...textScale.dense}>
            OYUNLAR
          </Text>
          <KpiGrid>
            <KpiTile label="Oynanma" value={games?.totals?.plays} />
            <KpiTile label="Oyuncu" value={games?.totals?.players} />
            <KpiTile label="Oyun süresi" value={games?.totals?.playMs} format={fmtDuration} />
            <KpiTile label="Oyun ekranlarında" value={games?.totals?.screenMs} format={fmtDuration} />
          </KpiGrid>

          {!games?.totals?.plays && !games?.totals?.screenMs ? (
            <Panel>
              <Text style={styles.hint} {...textScale.dense}>
                Bu aralıkta oyun oynanmadı.
              </Text>
            </Panel>
          ) : (
            <>
              {arena.map((g) => (
                <GameCard key={g.key} game={g} />
              ))}
              <Panel title="Oyun karşılaştırması">
                <SegmentedControl<GameMetric>
                  items={[
                    { key: "plays", label: "Oynanma" },
                    { key: "players", label: "Oyuncu" },
                    { key: "time", label: "Süre" },
                  ]}
                  value={gameMetric}
                  onChange={setGameMetric}
                  size="sm"
                  stretch
                />
                <BarList rows={compare} limit={12} format={gameMetric === "time" ? fmtMinutes : (v) => fmtNum(v)} />
              </Panel>
              <Panel title="Günlük oynanma · tüm arena oyunları">
                <TrendChart type="bar" labels={playsSeries.map((p) => fmtBucket(p.key))} series={[{ label: "Oynanma", data: playsSeries.map((p) => p.plays) }]} height={140} />
              </Panel>
              {features.length ? (
                <>
                  <Text style={styles.section} {...textScale.dense}>
                    REKABET VE KARİYER
                  </Text>
                  {features.map((g) => (
                    <GameCard key={g.key} game={g} />
                  ))}
                </>
              ) : null}
            </>
          )}

          <Panel title={playerGame ? `En çok oynayanlar · ${gameName(playerGame)}` : "En çok oynayanlar · tüm arena oyunları"}>
            <ChipGroup scrollable contentPadding={0}>
              <Chip label="Tüm oyunlar" size="sm" selected={!playerGame} onPress={() => setPlayerGame("")} />
              {arena
                .filter((g) => g.plays)
                .map((g) => (
                  <Chip key={g.key} label={g.name} size="sm" selected={playerGame === g.key} onPress={() => setPlayerGame(g.key)} />
                ))}
            </ChipGroup>
            <DataList
              rows={players.map((p, i): Row => ({ ...p, rank: i + 1 }))}
              primary={(r) => `${r.rank}. ${r.name}${r.username ? ` (@${r.username})` : ""}`}
              primaryLabel="Üye"
              csvTitle="En çok oynayanlar"
              limit={10}
              columns={[
                { key: "plays", label: "Oynanma" },
                playerGame ? { key: "best", label: "En iyi skor" } : { key: "favoriteName", label: "En çok", render: (r) => r.favoriteName || "—" },
                ...(playerGame ? [] : [{ key: "games", label: "Oyun" }]),
                { key: "playMs", label: "Süre", render: (r: Row) => fmtDuration(r.playMs) },
              ]}
              emptyText="Bu aralıkta skor kaydı yok."
            />
          </Panel>

          <Text style={styles.foot} {...textScale.long}>
            Uygulama her ekran değişiminde bir kayıt gönderir. Ekranda geçen süre, aynı oturumdaki bir sonraki ekrana kadar geçen zamandır (en
            fazla {Math.round((data.method?.screenCapMs || 600000) / 60000)} dk). Oturumun son ekranı ortanca ekran süresiyle (
            {fmtDuration(data.method?.lastScreenMs)}) tamamlanır. Cihaz, uygulamanın cihaza yazdığı rastgele kimlikle sayılır. Saatler Türkiye saatidir.
          </Text>
        </View>
      )}
    </AdminScreen>
  );
}

function GameCard({ game }: { game: Row }) {
  const isArena = game.kind === "arena";
  const hasPlays = game.plays != null;
  const quiet = !hasPlays && !game.screenMs;
  const series: number[] = Array.isArray(game.series) ? game.series : [];
  return (
    <View style={[styles.game, quiet ? styles.quiet : null]}>
      <View style={styles.gameHead}>
        <View style={styles.gameIcon}>
          <Ionicons name={isArena ? "game-controller-outline" : "trophy-outline"} size={18} color={colors.brandAccent} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.gameName} {...textScale.dense}>
            {game.name}
          </Text>
          {game.desc ? (
            <Text style={styles.hint} numberOfLines={2} {...textScale.dense}>
              {game.desc}
            </Text>
          ) : null}
        </View>
        {isArena && game.completionRate != null ? <Badge label={`Tamamlanma ${fmtPct(game.completionRate, 0)}`} size="xs" tone="info" /> : null}
      </View>
      <View style={styles.nums}>
        <Num
          label={isArena ? "Oynanma" : game.key === "fantezi" ? "Kadro" : game.key === "tahmin-ligi" ? "Tahmin" : "Görüntüleme"}
          value={fmtNum(hasPlays ? game.plays : game.screenViews)}
        />
        <Num label={hasPlays ? "Oyuncu" : "Cihaz"} value={fmtNum(hasPlays ? game.players : game.screenDevices)} />
        <Num label={isArena ? "Oyun süresi" : "Ekranda"} value={fmtDuration(isArena ? game.playMs : game.screenMs)} />
        <Num
          label={isArena ? "Ort. oyun" : "Ort. ziyaret"}
          value={isArena ? fmtDuration(game.avgPlayMs) : fmtDuration(game.screenViews ? game.screenMs / game.screenViews : 0)}
        />
      </View>
      {isArena && series.some(Boolean) ? (
        <TrendChart type="bar" labels={series.map((_, i) => `${i + 1}. gün`)} series={[{ label: "Oynanma", data: series }]} height={56} />
      ) : null}
      <Text style={styles.hint} {...textScale.dense}>
        {isArena
          ? [`Ekranda ${fmtDuration(game.screenMs)}`, game.bestScore != null ? `Rekor ${fmtNum(game.bestScore)}` : null].filter(Boolean).join(" · ")
          : game.screenViews
            ? `${fmtNum(game.screenViews)} ziyaret`
            : "Bu aralıkta açılmadı"}
      </Text>
    </View>
  );
}

function Num({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.num}>
      <Text style={styles.numLabel} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
      <Text style={styles.numValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const styles = StyleSheet.create({
  stack: { gap: space.md },
  refreshing: { opacity: 0.6 },
  flex: { flex: 1 },
  hint: { ...type.caption, color: colors.textTertiary },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.sm },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  toggleLabel: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  warn: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.warnDim },
  warnText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  split: { flexDirection: "row", height: 10, borderRadius: radius.pill, overflow: "hidden", gap: 2 },
  splitPart: { height: 10 },
  game: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  quiet: { opacity: 0.6 },
  gameHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  gameIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandDim, alignItems: "center", justifyContent: "center" },
  gameName: { ...type.h4, color: colors.textPrimary },
  nums: { flexDirection: "row", gap: space.sm },
  num: { flex: 1, gap: 2 },
  numLabel: { ...type.micro, color: colors.textTertiary },
  numValue: { ...type.numSmStrong, color: colors.textPrimary },
  foot: { ...type.caption, color: colors.textTertiary, marginTop: space.md },
});
