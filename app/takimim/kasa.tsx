/**
 * KULÜP KASASI — salt okunur mali görünüm.
 * `/takimim/kasa?tab=<defter|kadro>`
 *
 * NE: `GET /api/team-management/finance` kulübün gelir/gider toplamlarını,
 * kadro piyasa değerini, FFP değerlendirmesini ve kasa defterini tek çağrıda
 * döndürür (services/teamFinance getTeamFinanceDetail). Kayıt eklemek/silmek
 * yönetici yetkisidir; başkan yalnızca izler.
 *
 * BAKİYE SAHNESİ: koyu mor sahne (gradientInk + Aurora) üstünde bakiye
 * dönen sayıyla (Odometer); altında gelir/gider oran çubuğu ve cam şerit
 * (▲ gelir · ▼ gider · kadro değeri). Kadro değeri şeritte ayrı hücredir;
 * bakiyeyle aynı ağırlıkta durunca "kasada 712 bin var" diye yanlış
 * okunuyordu (değer nakit değildir).
 *
 * HAREKETLER: ay ay gruplanır (versal ay etiketi + o ayın neti); satır
 * anatomisi: yön IconTile'ı (nane gelir / kırmızı gider), karşı taraf ya da
 * açıklama başlıkta, kayıt türü · tarih meta satırında, işaretli tutar sonda.
 * KADRO DEĞERİ: ilk üç RankBadge, her satırda en değerli oyuncuya oranlı
 * degrade çubuk.
 *
 * NEDEN İKİ SEKME (başlıkta, Arena: sekme sayfayı değiştirir): yanıtın `squad[]` alanı (oyuncu bazlı piyasa değeri ve
 * ülke geneli sıra) eski sürümde HİÇ çizilmiyordu — yalnız toplamı
 * görünüyordu. Kadro değeri kulübün en büyük varlığı olduğu için kendi
 * segmentini hak ediyor. Seçim `?tab=` ile URL'de taşınır.
 *
 * FFP KARTI: durum IconTile + rozet; her sınır için durum tonlu degrade
 * çubuk (GradientBar). Sınır aşıldığında çubuk tavana dayanır ve yüzde
 * metni gerçek değeri söyler.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InkStage, StagePill, StageStats, SplitBar, TILE_TONE, shortMoney } from "@/components/team/ClubKit";
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  GradientBar,
  IconTile,
  Odometer,
  RankBadge,
  Reveal,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  SkeletonListRow,
  Tabs,
  refreshControlProps,
  toneColors,
  useHeaderScroll,
  useRefresh,
  type TabItem,
  type Tone,
} from "@/components/ui";
import {
  FINANCE_ENTRY_LABELS,
  FINANCE_INCOME_TYPES,
  getTeamFinance,
  positionLabel,
  type FfpCheck,
  type FfpStatus,
  type FinanceLedgerEntry,
  type FinanceSquadPlayer,
} from "@/lib/api/team";
import { formatDateShort, formatMoney, mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Sabitler ve saf yardımcılar
   ══════════════════════════════════════════════════════════════════════════ */

type FinanceTab = "defter" | "kadro";

const TAB_ITEMS: TabItem<FinanceTab>[] = [
  { key: "defter", label: "Kasa defteri" },
  { key: "kadro", label: "Kadro değeri" },
];

/** FFP durumu → rozet tonu + başlık + ikon. Renk `toneColors` sözlüğünden. */
const FFP_META: Record<FfpStatus, { tone: Tone; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  COMPLIANT: { tone: "win", label: "Uyumlu", icon: "shield-checkmark" },
  WARNING: { tone: "warn", label: "Sınırda", icon: "alert-circle" },
  BREACH: { tone: "danger", label: "İhlal", icon: "close-circle" },
  DISABLED: { tone: "neutral", label: "Kapalı", icon: "remove-circle" },
};

/** `services/teamFinance` içindeki kontrol anahtarlarının Türkçe adları. */
const FFP_CHECK_LABELS: Record<string, string> = {
  netSpend: "Net transfer harcaması",
  squadValue: "Kadro değeri sınırı",
};

/**
 * İşaretli para birimi. `formatMoney` sıfır ve altını "—" yaptığı için
 * bakiye (eksiye düşebilir) burada ayrı biçimlenir.
 */
function signedMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
  if (value === 0) return "0 ₺";
  return `${value < 0 ? "−" : ""}${abs} ₺`;
}

/** Yüzdeyi 0–1 aralığına sıkıştırır; sonsuz/NaN değerler tavana dayanır. */
function usageRatio(check: FfpCheck): number {
  if (!Number.isFinite(check.usagePct)) return 1;
  return Math.max(0, Math.min(1, check.usagePct / 100));
}

function usageLabel(check: FfpCheck): string {
  if (!Number.isFinite(check.usagePct)) return "%∞";
  return `%${Math.round(check.usagePct)}`;
}

type RowPosition = "single" | "first" | "middle" | "last";

function rowPosition(index: number, total: number): RowPosition {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Defter satırları ay ay: başlık öğesi + o ayın kayıtları (sıra korunur). */
type LedgerItem =
  | { kind: "month"; key: string; label: string; net: number }
  | { kind: "entry"; key: string; entry: FinanceLedgerEntry; position: RowPosition };

const isIncome = (entry: FinanceLedgerEntry) => FINANCE_INCOME_TYPES.includes(entry.entryType);

function groupLedger(entries: FinanceLedgerEntry[]): LedgerItem[] {
  const groups: { key: string; label: string; rows: FinanceLedgerEntry[] }[] = [];
  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? `${date.getFullYear()}-${date.getMonth()}` : "?";
    const label = valid ? `${MONTHS[date.getMonth()]} ${date.getFullYear()}` : "Tarihsiz";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(entry);
    else groups.push({ key, label, rows: [entry] });
  }
  const items: LedgerItem[] = [];
  for (const group of groups) {
    const net = group.rows.reduce((sum, row) => sum + (isIncome(row) ? 1 : -1) * (Number(row.amount) || 0), 0);
    items.push({ kind: "month", key: `m-${group.key}`, label: group.label, net });
    group.rows.forEach((entry, index) =>
      items.push({ kind: "entry", key: `e-${entry.id}`, entry, position: rowPosition(index, group.rows.length) }),
    );
  }
  return items;
}

/** Satır meta'sındaki kısa kayıt türü — uzun ad başlığa sığmıyordu. */
const ENTRY_SHORT: Record<string, string> = {
  TRANSFER_IN: "Oyuncu alımı",
  TRANSFER_OUT: "Oyuncu satışı",
  ADJUSTMENT_INCOME: "Düzeltme",
  ADJUSTMENT_EXPENSE: "Düzeltme",
};

/** Tam tutar, birimsiz: "22.000" — sahnedeki dönen sayı için. */
const plainAmount = (value: number) => `${value < 0 ? "−" : ""}${Math.abs(Math.round(value)).toLocaleString("tr-TR")}`;

function resolveTab(raw: string | string[] | undefined): FinanceTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "kadro" ? "kadro" : "defter";
}

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

export default function ClubFinanceScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  const tab = resolveTab(params.tab);

  const query = useQuery({
    queryKey: ["takim", "finance"],
    queryFn: getTeamFinance,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });
  const refreshControl = (
    <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
  );

  const data = query.data;

  const changeTab = useCallback(
    (next: FinanceTab) => {
      scrollY.setValue(0);
      router.setParams({ tab: next });
    },
    [router, scrollY]
  );

  /** Kadro, değeri yüksekten düşüğe — kulübün en pahalı varlıkları üstte. */
  const squad = useMemo(
    () =>
      [...(data?.squad ?? [])].sort(
        (a, b) => (Number(b.marketValue) || 0) - (Number(a.marketValue) || 0)
      ),
    [data?.squad]
  );
  const topValue = Number(squad[0]?.marketValue) || 0;

  const ledger = useMemo(() => groupLedger(data?.entries ?? []), [data?.entries]);

  const listHeader = useMemo(() => {
    if (!data) return null;
    return (
      <View style={styles.header}>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
        ) : null}

        <Reveal index={0} scaleFrom={0.97}>
          <BalanceStage
            income={data.totals.income}
            expense={data.totals.expense}
            squadValue={data.squadValue}
            playerCount={data.playerCount}
            season={data.team.season}
            onSquadValue={() => changeTab("kadro")}
          />
        </Reveal>

        <Reveal index={1}>
          <FfpCard
            status={data.ffp.status}
            enabled={data.ffp.enabled}
            netSpend={data.ffp.netSpend}
            checks={data.ffp.checks}
          />
        </Reveal>

        <SectionHeader
          title={tab === "defter" ? "Hareketler" : "Oyuncu bazlı değer"}
          inset="flush"
          style={styles.sectionHead}
          meta={
            tab === "defter"
              ? `${data.entries.length} kayıt`
              : `${squad.length} oyuncu`
          }
        />
      </View>
    );
  }, [changeTab, data, query.error, query.isError, query.refetch, squad.length, tab]);

  const renderLedger = useCallback(({ item, index }: { item: LedgerItem; index: number }) => {
    if (item.kind === "month") return <MonthHeader label={item.label} net={item.net} first={index === 0} />;
    return (
      <Reveal index={index} limit={10} distance={6}>
        <LedgerRow entry={item.entry} position={item.position} />
      </Reveal>
    );
  }, []);

  const renderSquad = useCallback(
    ({ item, index }: { item: FinanceSquadPlayer; index: number }) => (
      <Reveal index={index} limit={8} distance={6}>
        <SquadValueRow
          player={item}
          rank={index + 1}
          share={topValue > 0 ? (Number(item.marketValue) || 0) / topValue : 0}
          position={rowPosition(index, squad.length)}
        />
      </Reveal>
    ),
    [squad.length, topValue]
  );

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const noAccess =
    query.isError && query.error instanceof ApiError && query.error.status === 403;

  const header = (
    <ScreenHeader
      title="Kulüp Kasası"
      subtitle={data?.team.teamName}
      back
      scrollY={scrollY}
      tabs={data ? <Tabs items={TAB_ITEMS} value={tab} onChange={changeTab} sticky /> : undefined}
    />
  );

  if (query.isLoading && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <View style={styles.loading}>
          <Skeleton height={232} radius="xxl" />
          <Skeleton height={120} radius="xl" />
          <SkeletonListRow count={5} />
        </View>
      </SafeAreaView>
    );
  }

  if (noAccess) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="wallet-outline"
          title="Takım başkanlığı gerekli"
          body="Kulüp kasası yalnızca takımının yönetimini üstlenen başkanlara açıktır."
        />
      </SafeAreaView>
    );
  }

  if ((query.isError && !data) || !data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <ErrorState error={query.error} onRetry={query.refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      {tab === "defter" ? (
        <FlatList
          {...scrollProps}
          data={ledger}
          keyExtractor={(item) => item.key}
          renderItem={renderLedger}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="Kasa hareketi yok"
              body="Transferler sözleşme yürürlüğe girdiğinde defterine otomatik işlenir."
              variant="inline"
            />
          }
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
          initialNumToRender={14}
        />
      ) : (
        <FlatList
          {...scrollProps}
          data={squad}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSquad}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="Kadro değeri hesaplanmadı"
              body="Oyuncuların piyasa değeri belirlendiğinde kadro dökümü burada listelenir."
              variant="inline"
            />
          }
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
          initialNumToRender={12}
        />
      )}
    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Alt bileşenler
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Bakiye sahnesi — koyu mor sahnede dönen bakiye, gelir/gider oran çubuğu
 * ve cam şerit (▲ gelir · ▼ gider · kadro değeri).
 */
const BalanceStage = React.memo(function BalanceStage({
  income,
  expense,
  squadValue,
  playerCount,
  season,
  onSquadValue,
}: {
  income: number;
  expense: number;
  squadValue: number;
  playerCount: number;
  season: string | null;
  onSquadValue: () => void;
}) {
  const balance = income - expense;
  return (
    <InkStage>
      <View style={styles.stagePills}>
        <StagePill label="Kulüp kasası" icon="wallet" />
        {season ? <StagePill label={season} tone="muted" /> : null}
      </View>
      <View>
        <Text style={styles.stageLabel} {...textScale.badge}>
          BAKİYE
        </Text>
        <View style={styles.balanceRow} accessible accessibilityLabel={`Bakiye ${signedMoney(balance)}`}>
          <Odometer value={plainAmount(balance)} style={[styles.balanceValue, balance < 0 && { color: colors.liveOnDark }]} />
          <Text style={styles.balanceUnit} {...textScale.badge}>
            ₺
          </Text>
        </View>
      </View>
      <SplitBar
        height={8}
        track={colors.inkTile}
        parts={[
          { key: "in", value: income, color: colors.win },
          { key: "out", value: expense, color: colors.liveOnDark },
        ]}
      />
      <StageStats
        items={[
          { key: "in", label: "▲ Gelir", value: shortMoney(income).replace(" ₺", ""), suffix: "₺", color: colors.win },
          { key: "out", label: "▼ Gider", value: shortMoney(expense).replace(" ₺", ""), suffix: "₺", color: colors.liveOnDark },
          {
            key: "value",
            label: `Kadro · ${playerCount}`,
            value: shortMoney(squadValue).replace(" ₺", ""),
            suffix: "₺",
            onPress: onSquadValue,
          },
        ]}
      />
    </InkStage>
  );
});

/** Mali fair play kartı — durum başlığı + her sınır için degrade çubuk. */
const FfpCard = React.memo(function FfpCard({
  status,
  enabled,
  netSpend,
  checks,
}: {
  status: FfpStatus;
  enabled: boolean;
  netSpend: number;
  checks: FfpCheck[];
}) {
  const meta = FFP_META[status] ?? FFP_META.DISABLED;

  return (
    <View style={styles.card}>
      <View style={styles.ffpHead}>
        <IconTile icon={meta.icon} tone={TILE_TONE[meta.tone]} size={38} glow={false} />
        <View style={styles.flex}>
          <Text style={styles.cardTitle} {...textScale.dense}>
            Mali fair play
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1} {...textScale.dense}>
            Net transfer harcaması {signedMoney(netSpend)}
          </Text>
        </View>
        <Badge label={meta.label} tone={meta.tone} size="sm" />
      </View>

      {!enabled ? (
        <Text style={styles.ffpNote} {...textScale.long}>
          Bu sezon için mali fair play sınırı tanımlı değil.
        </Text>
      ) : checks.length === 0 ? (
        <Text style={styles.ffpNote} {...textScale.long}>
          Mali fair play açık ama tanımlı bir sınır yok.
        </Text>
      ) : (
        checks.map((check) => <FfpCheckRow key={check.key} check={check} />)
      )}
    </View>
  );
});

/** Tek bir FFP sınırı: etiket, yüzde, kullanım/limit ve degrade çubuk. */
const FfpCheckRow = React.memo(function FfpCheckRow({ check }: { check: FfpCheck }) {
  const tone = FFP_META[check.status]?.tone ?? "neutral";
  const ratio = usageRatio(check);

  return (
    <View style={styles.check}>
      <View style={styles.checkTop}>
        <Text style={styles.checkLabel} numberOfLines={1} {...textScale.dense}>
          {FFP_CHECK_LABELS[check.key] ?? check.key}
        </Text>
        <Text style={[styles.checkPct, { color: toneColors(tone).fg }]} {...textScale.badge}>
          {usageLabel(check)}
        </Text>
      </View>
      <GradientBar value={ratio} height={8} gradient={colors.tileTones[TILE_TONE[tone]]} />
      <Text style={styles.checkValue} numberOfLines={1} {...textScale.dense}>
        {signedMoney(check.value)} <Text style={styles.checkLimit}>/ {signedMoney(check.limit)} sınır</Text>
      </Text>
    </View>
  );
});

/** Ay başlığı — versal ay adı ve o ayın net akışı. */
function MonthHeader({ label, net, first }: { label: string; net: number; first: boolean }) {
  return (
    <View style={[styles.month, !first && styles.monthGap]}>
      <Text style={styles.monthLabel} {...textScale.badge}>
        {upperTR(label)}
      </Text>
      <Text style={[styles.monthNet, { color: net > 0 ? colors.win : net < 0 ? colors.loss : colors.textTertiary }]} {...textScale.badge}>
        {`${net > 0 ? "▲ +" : net < 0 ? "▼ " : ""}${signedMoney(net)}`}
      </Text>
    </View>
  );
}

/** Kasa defteri satırı: yön kutusu, karşı taraf, tür · tarih, işaretli tutar. */
const LedgerRow = React.memo(function LedgerRow({
  entry,
  position,
}: {
  entry: FinanceLedgerEntry;
  position: RowPosition;
}) {
  const income = isIncome(entry);
  const who = entry.playerName ?? entry.description ?? entry.counterpartyTeamName ?? FINANCE_ENTRY_LABELS[entry.entryType];
  const counterpart = entry.playerName && entry.counterpartyTeamName ? `${income ? "→" : "←"} ${entry.counterpartyTeamName}` : null;

  return (
    <View style={[styles.row, positionStyle(position)]}>
      <IconTile icon={income ? "arrow-down" : "arrow-up"} tone={income ? "mint" : "red"} size={36} glow={false} />

      <View style={[styles.rowBody, (position === "first" || position === "middle") && styles.rowDivider]}>
        <View style={styles.rowTexts}>
          <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
            {who}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
            {[formatDateShort(entry.createdAt), ENTRY_SHORT[entry.entryType] ?? entry.entryType, counterpart].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Text style={[styles.amount, { color: income ? colors.win : colors.loss }]} numberOfLines={1} {...textScale.dense}>
          {income ? "+" : "−"}
          {formatMoney(entry.amount, entry.currency)}
        </Text>
      </View>
    </View>
  );
});

/** Kadro değeri satırı: sıra/madalya, avatar, ad/mevki, oranlı çubuk ve değer. */
const SquadValueRow = React.memo(function SquadValueRow({
  player,
  rank,
  share,
  position,
}: {
  player: FinanceSquadPlayer;
  /** Kulüp içi değer sırası — liste değere göre sıralıdır. */
  rank: number;
  /** En değerli oyuncuya oran (0–1). */
  share: number;
  position: RowPosition;
}) {
  return (
    <View style={[styles.row, positionStyle(position)]}>
      <RankBadge rank={rank} size={22} />
      <Avatar name={player.playerName} image={mediaUrl(player.image)} size={36} />

      <View style={[styles.rowBody, (position === "first" || position === "middle") && styles.rowDivider]}>
        <View style={styles.rowTexts}>
          <View style={styles.nameRow}>
            <Text style={[styles.rowTitle, styles.flexShrink]} numberOfLines={1} {...textScale.dense}>
              {player.playerName}
            </Text>
            <Text style={styles.amount} numberOfLines={1} {...textScale.dense}>
              {formatMoney(player.marketValue)}
            </Text>
          </View>
          <GradientBar value={share} height={4} />
          <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
            {[positionLabel(player.position) || "Mevki belirtilmedi", player.globalRank != null ? `Türkiye #${player.globalRank}` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>
    </View>
  );
});

function positionStyle(position: RowPosition) {
  return position === "single" ? styles.rowSingle : position === "first" ? styles.rowFirst : position === "last" ? styles.rowLast : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.xxxl },
  loading: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, gap: space.md },
  header: { paddingTop: space.md, gap: space.md },
  sectionHead: { marginTop: space.sm },

  /* Bakiye sahnesi */
  stagePills: { flexDirection: "row", alignItems: "center", gap: space.s },
  stageLabel: { ...type.overline, color: colors.onDarkMuted },
  balanceRow: { flexDirection: "row", alignItems: "flex-end", gap: space.xs },
  balanceValue: { ...type.scoreHero, color: colors.onDark },
  balanceUnit: { ...type.h1, color: colors.brandOnDark, marginBottom: space.xs },

  /* FFP kartı */
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  ffpHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  cardTitle: { ...type.h3, color: colors.textPrimary },
  cardMeta: { ...type.caption, color: colors.textTertiary },
  ffpNote: { ...type.bodySm, color: colors.textSecondary },
  check: { gap: space.xs },
  checkTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  checkLabel: { ...type.label, color: colors.textPrimary, flexShrink: 1 },
  checkPct: { ...type.scoreXs },
  checkValue: { ...type.numSmStrong, color: colors.textSecondary },
  checkLimit: { ...type.numSm, color: colors.textTertiary },

  /* Ay başlığı */
  month: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.xs, paddingBottom: space.s },
  monthGap: { paddingTop: space.lg },
  monthLabel: { ...type.overline, color: colors.textTertiary },
  monthNet: { ...type.numSmStrong },

  /* Satırlar */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 62,
    paddingLeft: space.md,
    backgroundColor: colors.surface1,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
  },
  rowSingle: { borderRadius: radius.xl, borderWidth: hairline },
  rowFirst: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: hairline },
  rowLast: { borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, borderBottomWidth: hairline },
  rowBody: { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: space.sm, paddingRight: space.md, paddingVertical: space.sm },
  rowDivider: { borderBottomWidth: hairline, borderBottomColor: colors.separator },
  rowTexts: { flex: 1, minWidth: 0, gap: space.xs },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space.sm, justifyContent: "space-between" },
  rowTitle: { ...type.h4, color: colors.textPrimary },
  rowMeta: { ...type.caption, color: colors.textTertiary },
  amount: { ...type.tableNumStrong, color: colors.textPrimary },
});
