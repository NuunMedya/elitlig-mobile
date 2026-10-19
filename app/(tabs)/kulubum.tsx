/**
 * YÖNETİM — TEK KULÜP PANELİ (alt çubuğun 3. sekmesi; rota adı tarihsel
 * olarak `kulubum`). `/kulubum?rol=<takim|oyuncu|lig>`
 *
 * NEDEN TEK PANEL: eskiden bu sekme bir "kapı"ydı ve asıl panel ayrı bir
 * ekrandaydı (`/takimim` Kulüp Paneli, `/oyuncum` Özet sekmesi). İkisi aynı
 * kimliği, aynı "şimdi ilgilen" listesini, aynı sıradaki maçı iki kez
 * gösteriyordu; kullanıcı "panele git" düğmesine basıp aynı içeriğe
 * düşüyordu. Artık panel BURASIDIR:
 *   · `/takimim`               → buraya (`?rol=takim`) yönlenir.
 *   · `/oyuncum?tab=ozet`      → buraya (`?rol=oyuncu`) yönlenir; `/oyuncum`
 *                                yalnız ayrıntı ekranıdır (Maçlar · İstatistik
 *                                · Sözleşme).
 *
 * TASARIM ("az mürekkep, çok bilgi" — components/club/Panel.tsx):
 *   10px büyük harf bölüm etiketleri, 13px satır başlıkları, beyaz kart +
 *   kıl çizgisi. Grafit kahraman kartı, iri karolar, tekrar eden başlıklar yok.
 *
 * KULÜBÜM (başkan):
 *   kimlik satırı → araçlar (8) → MAÇ HAZIRLIĞI (yoklama · kadro · analiz,
 *   gerçek veriden durum + ilerleme) → yapılacaklar (tamamı) → kadro dengesi
 *   → sezon ve kasa.
 * KARİYERİM (oyuncu):
 *   kimlik satırı → araçlar (8) → sıradaki maç + "geliyor musun?" →
 *   yapılacaklar + değişiklik taleplerim → sezonum → son maçlarım.
 * LİG (yönetici):
 *   araçlar → modül listesi.
 *
 * MİSAFİR ve KULÜPSÜZ ÜYE: `JoinFlow` eylem akışı.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AvailabilityPicker } from "@/components/club/AvailabilityPicker";
import { JoinFlow } from "@/components/club/JoinFlow";
import { daysUntil, matchWhen } from "@/components/club/NextMatchCard";
import {
  IdentityRow,
  PanelCard,
  PanelEmpty,
  PanelRow,
  PanelSection,
  PrepChecklist,
  StatStrip,
  ThinProgress,
  ToolGrid,
  prepProgress,
  type PanelTool,
  type PrepStep,
  type StatItem,
} from "@/components/club/Panel";
import { countLines } from "@/components/club/SquadSnapshot";
import { CHANGE_LABELS, useClubSignals, type AttentionItem, type ClubSignals } from "@/components/club/useClubSignals";
import {
  BottomSheet,
  Button,
  ScreenHeader,
  SkeletonCard,
  Tabs,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type TabItem,
} from "@/components/ui";
import { MAX_STARTERS, getTeamFinance, getTeamMatchPlan } from "@/lib/api/team";
import { formatDateShort, formatDecimal, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, radius, space, textScale, type, upperTR } from "@/theme";

type RoleTab = "takim" | "oyuncu" | "lig";

const ROLE_LABELS: Record<RoleTab, string> = {
  takim: "Kulübüm",
  oyuncu: "Kariyerim",
  lig: "Lig",
};

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** Bakiye eksiye düşebilir; kısa biçim: 12,4 B ₺ / 850 ₺. */
function shortMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${formatDecimal(abs / 1_000_000, 1)} Mn ₺`;
  if (abs >= 1_000) return `${sign}${formatDecimal(abs / 1_000, 1)} B ₺`;
  return `${sign}${Math.round(abs)} ₺`;
}

export default function ClubHubScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ rol?: string }>();
  const signals = useClubSignals();
  const scrollRef = useRef<ScrollView>(null);
  const [changesOpen, setChangesOpen] = useState(false);

  const user = signals.user;
  const go = useCallback((href: string) => router.push(href as Href), [router]);

  /* ------------------------------ ROLLER ------------------------------- */

  const roles = useMemo<RoleTab[]>(() => {
    const list: RoleTab[] = [];
    if (signals.isPresident) list.push("takim");
    if (signals.isPlayer) list.push("oyuncu");
    if (signals.isManagement) list.push("lig");
    return list;
  }, [signals.isManagement, signals.isPlayer, signals.isPresident]);

  const rawRole = Array.isArray(params.rol) ? params.rol[0] : params.rol;
  const role: RoleTab | null = roles.includes(rawRole as RoleTab) ? (rawRole as RoleTab) : (roles[0] ?? null);

  const tabItems = useMemo<TabItem<RoleTab>[]>(
    () =>
      roles.map((key) => ({
        key,
        label: ROLE_LABELS[key],
        badge:
          key === "takim" && signals.clubAttention.length
            ? "dot"
            : key === "oyuncu" && signals.playerAttention.length
              ? "dot"
              : undefined,
      })),
    [roles, signals.clubAttention.length, signals.playerAttention.length],
  );

  const changeRole = useCallback(
    (next: RoleTab) => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      scrollY.setValue(0);
      router.setParams({ rol: next });
    },
    [router, scrollY],
  );

  /** Kasa özeti — yetki yoksa (403) bölüm sessizce çizilmez. */
  const finance = useQuery({
    queryKey: ["takim", "finance"],
    queryFn: getTeamFinance,
    enabled: signals.managed && role === "takim",
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(
    useCallback(() => {
      signals.refetchAll();
      if (signals.managed) void finance.refetch();
    }, [finance, signals]),
    { refreshing: signals.refreshing },
  );

  const openAttention = useCallback(
    (item: AttentionItem) => {
      if (item.action === "changes") setChangesOpen(true);
      else if (item.href) router.push(item.href);
    },
    [router],
  );

  /* ------------------------------- ÇİZİM ------------------------------- */

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Yönetim"
        scrollY={scrollY}
        tabs={roles.length > 1 && role ? <Tabs items={tabItems} value={role} onChange={changeRole} sticky /> : undefined}
      />

      <ScrollView
        ref={scrollRef}
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={user ? <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} /> : undefined}
      >
        {auth.initializing ? (
          <View style={styles.pad}>
            <SkeletonCard lines={3} />
          </View>
        ) : !user ? (
          <JoinFlow signedIn={false} go={go} />
        ) : role === "takim" ? (
          <ClubSection
            signals={signals}
            finance={finance.data ?? null}
            scopeLabel={[scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ")}
            go={go}
            onAttention={openAttention}
          />
        ) : role === "oyuncu" ? (
          <CareerSection signals={signals} go={go} onAttention={openAttention} />
        ) : role === "lig" ? (
          <LeagueSection go={go} />
        ) : (
          <JoinFlow signedIn go={go} />
        )}

      </ScrollView>

      {/* Onay bekleyen değişiklik talepleri (eski Kulüp Paneli'nden taşındı). */}
      <BottomSheet visible={changesOpen} onClose={() => setChangesOpen(false)} title="Onay bekleyen değişiklikler" snap="content">
        <View style={styles.sheetBody}>
          {signals.pendingChanges.length === 0 ? (
            <Text style={styles.sheetNote} {...textScale.long}>
              Bekleyen talep yok.
            </Text>
          ) : (
            <PanelCard padded={false}>
              {signals.pendingChanges.map((change, index) => (
                <PanelRow
                  key={change.id}
                  icon="hourglass-outline"
                  tone="warn"
                  title={CHANGE_LABELS[change.type] ?? change.type}
                  hint={change.created_at ? `${formatDateShort(change.created_at)} tarihinde gönderildi` : undefined}
                  value="İnceleniyor"
                  last={index === signals.pendingChanges.length - 1}
                />
              ))}
            </PanelCard>
          )}
          <Text style={styles.sheetNote} {...textScale.long}>
            Talepler yönetici onayından sonra yayına alınır. Yanlış gönderdiğin bir profil ya da takım talebini düzenleme ekranından geri çekebilirsin.
          </Text>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ═══════════════════════════════ KULÜBÜM ═══════════════════════════════ */

function ClubSection({
  signals,
  finance,
  scopeLabel,
  go,
  onAttention,
}: {
  signals: ClubSignals;
  finance: Awaited<ReturnType<typeof getTeamFinance>> | null;
  scopeLabel: string;
  go: (href: string) => void;
  onAttention: (item: AttentionItem) => void;
}) {
  const { team, standing, dashboard, counts } = signals;
  const data = dashboard.data;

  const tools = useMemo<PanelTool[]>(
    () => [
      { key: "kadro", icon: "people", label: "Kadro", href: "/takimim/kadro" },
      { key: "dizilis", icon: "grid", label: "Diziliş", href: "/takimim/kadro?gorunum=dizilis" },
      { key: "transfer", icon: "swap-horizontal", label: "Transfer", href: "/takimim/kadro?gorunum=transfer", count: counts.offersOpen },
      { key: "lisans", icon: "id-card", label: "Lisans", href: "/takimim/kadro?gorunum=sezon", tone: "info" },
      { key: "maclar", icon: "clipboard", label: "Maçlar", href: "/takimim/mac-merkezi", tone: "live" },
      { key: "mac-al", icon: "calendar", label: "Maç al", href: "/takimim/mac-al", tone: "win" },
      { key: "musaitlik", icon: "time", label: "Müsaitlik", href: "/takimim/musaitlik", tone: "win" },
      { key: "basvuru", icon: "mail-unread", label: "Davetler", href: "/davetler", tone: "warn", count: counts.applications },
      { key: "kasa", icon: "wallet", label: "Kasa", href: "/takimim/kasa", tone: "neutral" },
      { key: "teklifler", icon: "paper-plane", label: "Giden teklif", href: "/takimim/teklifler" },
      { key: "borsa", icon: "storefront", label: "Borsa", href: "/takimim/borsa", tone: "warn" },
      { key: "bilgiler", icon: "shield-half", label: "Kimlik", href: "/takimim/bilgiler", tone: "info" },
    ],
    [counts.applications, counts.offersOpen],
  );

  const lines = useMemo(
    () =>
      countLines([
        ...(data?.roster.contracted ?? []).map((player) => player.player_position),
        ...(data?.roster.withoutContract ?? []).map((player) => player.player_position),
      ]),
    [data],
  );

  if (dashboard.isLoading) {
    return (
      <View style={[styles.pad, styles.loading]}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </View>
    );
  }

  if (!team) {
    return (
      <PanelSection title="Kulüp">
        <PanelEmpty
          icon="shield-outline"
          text={
            dashboard.isError
              ? "Takım bilgisi alınamadı. Aşağı çekerek yeniden dene."
              : (data?.onboarding?.description ?? "Hesabına bağlı bir takım görünmüyor. Takımını bul ve yönetim yetkisi iste.")
          }
          action={
            dashboard.isError
              ? { label: "Tekrar dene", onPress: () => void dashboard.refetch() }
              : { label: "Takımını bağla", onPress: () => go("/oyuncum/bagla?tur=takim") }
          }
        />
      </PanelSection>
    );
  }

  const facts: { label: string; value: string }[] = [];
  if (standing) {
    facts.push({ label: "Sıra", value: `${standing.rank}.` });
    facts.push({ label: "Puan", value: String(standing.row.display_points) });
    facts.push({ label: "Averaj", value: signed(Number(standing.row.goal_diff) || 0) });
  } else if (team.team_points != null) {
    facts.push({ label: "Puan", value: String(team.team_points) });
  }
  facts.push({ label: "Kadro", value: String(signals.squadSize) });

  const record =
    team.team_wins != null ? `${team.team_wins ?? 0}-${team.team_draws ?? 0}-${team.team_losses ?? 0}` : null;
  const goals =
    team.goals_scored != null && team.goals_conceded != null ? `${team.goals_scored}:${team.goals_conceded}` : null;

  const seasonItems: StatItem[] = [];
  if (record) seasonItems.push({ label: "G-B-M", value: record });
  if (goals) seasonItems.push({ label: "Gol", value: goals });
  if (finance) {
    const balance = finance.totals.income - finance.totals.expense;
    seasonItems.push({ label: "Kadro değeri", value: shortMoney(finance.squadValue), onPress: () => go("/takimim/kasa?tab=kadro") });
    seasonItems.push({
      label: "Bakiye",
      value: shortMoney(balance),
      tone: balance < 0 || finance.ffp.status === "BREACH" ? "danger" : "neutral",
      onPress: () => go("/takimim/kasa"),
    });
  }

  const squadItems: StatItem[] = [
    { label: "Kaleci", value: String(lines.GK), tone: lines.GK === 0 ? "danger" : "neutral" },
    { label: "Defans", value: String(lines.DEF) },
    { label: "Orta", value: String(lines.MID) },
    { label: "Forvet", value: String(lines.FWD) },
    {
      label: "Sözleşme",
      value: `${signals.contracted}/${signals.squadSize}`,
      tone: signals.withoutContract > 0 ? "danger" : "win",
      onPress: signals.withoutContract > 0 ? () => go("/takimim/kadro?filtre=sozlesmesiz") : undefined,
    },
  ];

  return (
    <>
      <View style={styles.top}>
        <IdentityRow
          kind="team"
          role="Başkan"
          name={team.team_name}
          image={mediaUrl(team.logo)}
          context={scopeLabel || [team.current_league, team.current_season].filter(Boolean).join(" · ") || team.city}
          facts={facts}
          form={standing?.row.last5 ?? null}
          onPress={() => go(`/takim/${team.id}`)}
        />
      </View>

      <PanelSection title="Araçlar">
        <ToolGrid tools={tools} go={go} />
      </PanelSection>

      <MatchPrep signals={signals} go={go} />

      <PanelSection
        title="Yapılacaklar"
        meta={signals.clubAttention.length ? `${signals.clubAttention.length} iş` : undefined}
      >
        <AttentionRows items={signals.clubAttention} onPress={onAttention} empty="Bekleyen iş yok — kulüp güncel." />
      </PanelSection>

      <PanelSection title="Kadro dengesi" meta={`${signals.squadSize} oyuncu`} action={{ label: "Yönet", onPress: () => go("/takimim/kadro") }}>
        {signals.squadSize > 0 ? (
          <StatStrip items={squadItems} />
        ) : (
          <PanelEmpty
            icon="people-outline"
            text="Kadron boş. Oyuncu ara; davet ya da transfer teklifi gönder."
            action={{ label: "Oyuncu ekle", onPress: () => go("/takimim/kadro?gorunum=transfer") }}
          />
        )}
      </PanelSection>

      {seasonItems.length ? (
        <PanelSection title="Sezon ve kasa" meta={team.current_season ?? undefined}>
          <StatStrip items={seasonItems} />
        </PanelSection>
      ) : null}
    </>
  );
}

/* ═══════════════════════════ MAÇ HAZIRLIĞI ═══════════════════════════ */

/**
 * Başkanın sıradaki maçı için "hazır mıyız?" kartı. Adımlar gerçek veriden
 * durum alır ve her biri maç ekranının ilgili sekmesini açar:
 *   1. Yoklama — sıradaki maçın yoklama dağılımı (geliyor ≥ ilk 8 → tamam)
 *   2. Maç kadrosu — kayıtlı maç planı (ilk 8 dolu → tamam, eksik → uyarı)
 *   3. Rakip analizi — kadro kayıtlıysa senaryo karşılaştırması açılır
 * Plan sorgusunun anahtarı maç ekranıyla AYNIDIR (["takim","match-plan",id]):
 * kadro kaydedilince bu kart da kendiliğinden güncellenir.
 */
function MatchPrep({ signals, go }: { signals: ClubSignals; go: (href: string) => void }) {
  const { nextTeamMatch: match, teamAvailability, teamMatches } = signals;
  const matchId = match?.id ?? 0;

  const plan = useQuery({
    queryKey: ["takim", "match-plan", matchId],
    queryFn: () => getTeamMatchPlan(matchId),
    enabled: matchId > 0,
    staleTime: 60_000,
    retry: false,
  });

  if (teamMatches.isLoading) {
    return (
      <PanelSection title="Maç hazırlığı">
        <SkeletonCard lines={2} />
      </PanelSection>
    );
  }

  if (!match) {
    return (
      <PanelSection title="Maç hazırlığı" action={{ label: "Fikstür", onPress: () => go("/takimim/mac-merkezi") }}>
        <PanelEmpty
          icon="calendar-outline"
          text={teamMatches.isError ? "Fikstür alınamadı." : "Programda maç yok. Saha panosundan saat seç."}
          action={teamMatches.isError ? undefined : { label: "Maç al", onPress: () => go("/takimim/mac-al") }}
        />
      </PanelSection>
    );
  }

  const base = `/takimim/mac/${match.id}`;
  const counts = teamAvailability.data?.counts;
  const lineup = plan.data?.plan?.lineup ?? [];
  const starters = lineup.filter((row) => row.starter).length;
  const bench = lineup.length - starters;

  const steps: PrepStep[] = [
    {
      key: "yoklama",
      label: "Yoklama",
      state: !counts ? "todo" : counts.coming >= MAX_STARTERS ? "done" : "warn",
      detail: teamAvailability.isLoading
        ? "…"
        : counts
          ? `${counts.coming}/${MAX_STARTERS} geliyor${counts.unanswered ? ` · ${counts.unanswered} yanıtsız` : ""}`
          : "Bilgi yok",
      onPress: () => go(`${base}?sekme=yoklama`),
    },
    {
      key: "kadro",
      label: "Maç kadrosu",
      state: !lineup.length ? "todo" : starters >= MAX_STARTERS ? "done" : "warn",
      detail: plan.isLoading
        ? "…"
        : lineup.length
          ? `${starters} ilk · ${bench} yedek${plan.data?.plan?.formation ? ` · ${plan.data.plan.formation}` : ""}`
          : "Girilmedi",
      onPress: () => go(`${base}?sekme=kadro`),
    },
  ];
  const progress = prepProgress(steps);
  steps.push({
    key: "analiz",
    label: "Analiz ve tahmin",
    state: "todo",
    detail: lineup.length ? "Taktikleri karşılaştır" : "Önce kadro",
    onPress: () => go(`${base}?sekme=analiz`),
  });

  const countdown = daysUntil(match.date);

  return (
    <PanelSection title="Maç hazırlığı" action={{ label: "Fikstür", onPress: () => go("/takimim/mac-merkezi") }}>
      <PanelCard>
        <View style={styles.matchHead}>
          <View style={styles.flex}>
            <Text style={styles.matchSide} {...textScale.badge}>
              {upperTR(match.is_home ? "Ev sahibi" : "Deplasman")}
            </Text>
            <Text style={styles.matchOpponent} numberOfLines={1} {...textScale.dense}>
              {match.opponent_name ?? "Rakip belirlenmedi"}
            </Text>
            <Text style={styles.matchMeta} numberOfLines={1} {...textScale.dense}>
              {[matchWhen(match.date, match.time), match.match_field].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {countdown ? (
            <View style={styles.countdown}>
              <Text style={styles.countdownText} {...textScale.badge}>
                {upperTR(countdown)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.progressRow}>
          <View style={styles.flex}>
            <ThinProgress value={progress} tone={progress >= 100 ? "win" : progress >= 50 ? "brand" : "warn"} />
          </View>
          <Text style={styles.progressText} {...textScale.dense}>
            %{progress} hazır
          </Text>
        </View>

        <PrepChecklist steps={steps} />

        <View style={styles.matchActions}>
          <Button
            label={lineup.length ? "Kadroyu düzenle" : "Kadroyu kur"}
            icon="people-outline"
            size="sm"
            onPress={() => go(`${base}?sekme=kadro`)}
            style={styles.flex}
          />
          <Button
            label="Maç sayfası"
            size="sm"
            variant="secondary"
            onPress={() => go(`/mac/${match.id}`)}
            style={styles.flex}
          />
        </View>
      </PanelCard>
    </PanelSection>
  );
}

/* ═══════════════════════════════ KARİYERİM ═══════════════════════════════ */

function CareerSection({
  signals,
  go,
  onAttention,
}: {
  signals: ClubSignals;
  go: (href: string) => void;
  onAttention: (item: AttentionItem) => void;
}) {
  const { me, counts, user, nextPlayerMatch: match, myMatches } = signals;
  const data = me.data;
  const player = data?.player ?? null;
  const playerTeam = data?.playerTeam ?? null;
  const stats = data?.stats ?? null;

  const tools = useMemo<PanelTool[]>(
    () => [
      { key: "maclar", icon: "football", label: "Maçlarım", href: "/oyuncum?tab=maclarim" },
      { key: "istatistik", icon: "stats-chart", label: "İstatistik", href: "/oyuncum?tab=istatistik" },
      { key: "sozlesme", icon: "document-text", label: "Sözleşme", href: "/oyuncum?tab=sozlesme", tone: "info" },
      { key: "teklif", icon: "swap-horizontal", label: "Gelen teklif", href: "/tekliflerim", count: counts.offersAwaiting },
      { key: "disiplin", icon: "alert-circle", label: "Disiplin", href: "/cezalarim", tone: "warn", count: counts.penaltiesOpen },
      { key: "davet", icon: "git-pull-request", label: "Davetler", href: "/davetler", tone: "live", count: counts.invitesReceived },
      playerTeam
        ? { key: "takim", icon: "shield", label: "Takımım", href: `/takim/${playerTeam.id}`, tone: "neutral" }
        : { key: "takim-bul", icon: "search", label: "Takım bul", href: "/ara?tip=takim", tone: "neutral" },
      { key: "profil", icon: "create", label: "Profil", href: "/hesabim", tone: "neutral" },
    ],
    [counts.invitesReceived, counts.offersAwaiting, counts.penaltiesOpen, playerTeam],
  );

  if (me.isLoading) {
    return (
      <View style={[styles.pad, styles.loading]}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </View>
    );
  }

  const facts = stats
    ? [
        { label: "Maç", value: String(stats.matches ?? 0) },
        { label: "Gol", value: String(stats.goals ?? 0) },
        { label: "Asist", value: String(stats.assists ?? 0) },
        { label: "Reyting", value: stats.rating != null ? formatDecimal(stats.rating, 1) : "—" },
      ]
    : [];

  const matches = Number(stats?.matches ?? 0);
  const seasonItems: StatItem[] = stats
    ? [
        {
          label: "İlk 11",
          value: matches > 0 ? `%${Math.round((Number(stats.starts ?? 0) / matches) * 100)}` : "—",
        },
        {
          label: "G+A / maç",
          value: matches > 0 ? formatDecimal((Number(stats.goals ?? 0) + Number(stats.assists ?? 0)) / matches, 2) : "—",
          tone: "brand",
        },
        { label: "Sarı", value: String(stats.yellow_cards ?? 0) },
        { label: "Kırmızı", value: String(stats.red_cards ?? 0), tone: Number(stats.red_cards ?? 0) > 0 ? "danger" : "neutral" },
      ]
    : [];

  const changes = [...(data?.pendingChanges ?? [])]
    .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"))
    .slice(0, 4);
  const recent = (data?.recentMatches ?? []).slice(0, 3);

  return (
    <>
      <View style={styles.top}>
        {player ? (
          <IdentityRow
            kind="player"
            role="Oyuncu"
            name={player.player_name ?? user?.fullName ?? "Oyuncu"}
            image={mediaUrl(player.player_img)}
            context={[player.player_position, playerTeam?.team_name ?? "Serbest oyuncu", stats?.season].filter(Boolean).join(" · ")}
            facts={facts}
            onPress={() => go(`/oyuncu/${player.id}`)}
          />
        ) : (
          <PanelEmpty
            icon="person-add-outline"
            text="Oyuncu profilin bağlı değil. Kaydını bul ve sahiplen."
            action={{ label: "Bağla", onPress: () => go("/oyuncum/bagla") }}
          />
        )}
      </View>

      <PanelSection title="Araçlar">
        <ToolGrid tools={tools} go={go} />
      </PanelSection>

      <PanelSection
        title="Sıradaki maç"
        action={{ label: "Maçlarım", onPress: () => go("/oyuncum?tab=maclarim") }}
      >
        {myMatches.isLoading ? (
          <SkeletonCard lines={2} />
        ) : match ? (
          <PanelCard>
            <View style={styles.matchHead}>
              <View style={styles.flex}>
                <Text style={styles.matchSide} {...textScale.badge}>
                  {upperTR(match.in_squad ? "Kadrodasın" : match.is_home ? "Ev sahibi" : "Deplasman")}
                </Text>
                <Text style={styles.matchOpponent} numberOfLines={1} {...textScale.dense}>
                  {match.opponent_name ?? "Rakip belirlenmedi"}
                </Text>
                <Text style={styles.matchMeta} numberOfLines={1} {...textScale.dense}>
                  {[matchWhen(match.date, match.time), match.match_field].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {daysUntil(match.date) ? (
                <View style={styles.countdown}>
                  <Text style={styles.countdownText} {...textScale.badge}>
                    {upperTR(daysUntil(match.date) ?? "")}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.pickerWrap}>
              <AvailabilityPicker matchId={match.id} />
            </View>
          </PanelCard>
        ) : (
          <PanelEmpty
            icon="calendar-outline"
            text={myMatches.isError ? "Maç bilgisi alınamadı." : "Takımına maç yazılınca burada görünür."}
          />
        )}
      </PanelSection>

      <PanelSection
        title="Yapılacaklar"
        meta={signals.playerAttention.length ? `${signals.playerAttention.length} iş` : undefined}
      >
        <AttentionRows
          items={signals.playerAttention}
          onPress={onAttention}
          empty="Yanıt bekleyen teklif, davet ya da disiplin dosyan yok."
        />
      </PanelSection>

      {changes.length ? (
        <PanelSection title="Değişiklik taleplerim" action={{ label: "Hesabım", onPress: () => go("/hesabim") }}>
          <PanelCard padded={false}>
            {changes.map((change, index) => (
              <PanelRow
                key={change.id}
                icon="document-attach-outline"
                tone={change.status === "approved" ? "win" : change.status === "rejected" ? "danger" : "warn"}
                title={CHANGE_LABELS[change.type] ?? change.type}
                hint={change.created_at ? formatDateShort(change.created_at) : undefined}
                value={change.status === "approved" ? "Onaylandı" : change.status === "rejected" ? "Reddedildi" : "Bekliyor"}
                last={index === changes.length - 1}
              />
            ))}
          </PanelCard>
        </PanelSection>
      ) : null}

      {seasonItems.length ? (
        <PanelSection
          title="Sezonum"
          meta={stats?.season ?? undefined}
          action={{ label: "Ayrıntı", onPress: () => go("/oyuncum?tab=istatistik") }}
        >
          <StatStrip items={seasonItems} />
        </PanelSection>
      ) : null}

      {recent.length ? (
        <PanelSection title="Son maçlarım" action={{ label: "Tümü", onPress: () => go("/oyuncum?tab=maclarim&durum=oynanan") }}>
          <PanelCard padded={false}>
            {recent.map((item, index) => (
              <PanelRow
                key={item.id}
                leading={
                  <View style={styles.dateBox}>
                    <Text style={styles.dateText} {...textScale.badge}>
                      {formatDateShort(item.date)}
                    </Text>
                  </View>
                }
                title={`${item.home_team} – ${item.away_team}`}
                value={item.home_score != null && item.away_score != null ? `${item.home_score}-${item.away_score}` : "–"}
                onPress={() => go(`/mac/${item.id}`)}
                last={index === recent.length - 1}
              />
            ))}
          </PanelCard>
        </PanelSection>
      ) : null}
    </>
  );
}

/* ═══════════════════════════════ LİG ═══════════════════════════════ */

const LEAGUE_TOOLS: PanelTool[] = [
  { key: "gorevler", icon: "checkbox", label: "Görevler", href: "/yonetim/gorevler" },
  { key: "gorev-yeni", icon: "add-circle", label: "Yeni görev", href: "/yonetim/gorev-yeni" },
  { key: "maclar", icon: "football", label: "Maçlar", href: "/yonetim/maclar", tone: "live" },
  { key: "sahalar", icon: "location", label: "Sahalar", href: "/yonetim/sahalar", tone: "info" },
  { key: "basvuru", icon: "mail", label: "Mesajlar", href: "/yonetim/mesajlar", tone: "warn" },
  { key: "sohbet", icon: "chatbubbles", label: "Sohbet", href: "/yonetim/sohbet", tone: "neutral" },
  { key: "kayitlar", icon: "call", label: "Kayıtlar", href: "/yonetim/kayitlar", tone: "neutral" },
  { key: "panel", icon: "grid", label: "Tümü", href: "/yonetim", tone: "neutral" },
];

function LeagueSection({ go }: { go: (href: string) => void }) {
  return (
    <>
      <PanelSection title="Araçlar" style={styles.firstSection}>
        <ToolGrid tools={LEAGUE_TOOLS} go={go} />
      </PanelSection>
    </>
  );
}

/* ═══════════════════════════════ PARÇALAR ═══════════════════════════════ */

function AttentionRows({
  items,
  onPress,
  empty,
}: {
  items: AttentionItem[];
  onPress: (item: AttentionItem) => void;
  empty: string;
}) {
  if (!items.length) {
    return <PanelEmpty icon="checkmark-circle-outline" text={empty} />;
  }
  return (
    <PanelCard padded={false}>
      {items.map((item, index) => (
        <PanelRow
          key={item.key}
          icon={item.icon}
          tone={item.tone}
          title={item.title}
          hint={item.subtitle}
          count={item.count}
          onPress={item.href || item.action ? () => onPress(item) : undefined}
          last={index === items.length - 1}
        />
      ))}
    </PanelCard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: space.sm, paddingBottom: space.xxl },
  pad: { paddingHorizontal: layout.screenPadding },
  flex: { flex: 1, minWidth: 0 },
  loading: { gap: space.md, paddingTop: space.sm },
  top: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs },
  firstSection: { marginTop: space.sm },

  matchHead: { flexDirection: "row", alignItems: "flex-start", gap: space.m },
  matchSide: { ...type.micro, color: colors.brandAccent },
  matchOpponent: { ...type.h3, color: colors.textPrimary, marginTop: 2 },
  matchMeta: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
  countdown: {
    paddingHorizontal: space.s,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
  },
  countdownText: { ...type.micro, color: colors.brandAccent },

  progressRow: { flexDirection: "row", alignItems: "center", gap: space.m, marginTop: space.md, marginBottom: space.xs },
  progressText: { ...type.caption, color: colors.textSecondary },
  matchActions: { flexDirection: "row", gap: space.sm, marginTop: space.m },
  pickerWrap: { marginTop: space.md },

  dateBox: {
    width: 44,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: colors.surface3,
    alignItems: "center",
  },
  dateText: { ...type.micro, color: colors.textSecondary, letterSpacing: 0 },

  sheetBody: { gap: space.sm, paddingBottom: space.sm, paddingHorizontal: space.xs },
  sheetNote: { ...type.caption, color: colors.textTertiary, paddingHorizontal: layout.rowPaddingH, paddingTop: space.sm },
});
