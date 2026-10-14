/**
 * YÖNETİM — takım, oyuncu ve lig yönetiminin TEK kapısı (alt çubuğun 3. sekmesi;
 * rota adı tarihsel olarak `kulubum`). `/kulubum?rol=<takim|oyuncu|lig>`
 *
 * BİLGİ MİMARİSİ ("önce araç, sonra bağlam"):
 *
 *   1. ROL SEKMELERİ — bir hesap başkan + oyuncu + yönetici olabilir; her rol
 *      kendi sekmesidir, şerit YALNIZ birden çok rol varsa çizilir. Seçim
 *      `?rol=` ile URL'de taşınır (derin bağlantı, geri tuşu).
 *   2. HIZLI ERİŞİM — en üstte `QuickActions`: rolün asıl araçları dört
 *      sütunlu sıkı ızgarada, tek dokunuşta. Rozet gerçek sayıdır. Eski iki
 *      satırlık HubGrid karoları buraya toplandı: aynı kapılar, yarı yer.
 *   3. SIRADAKİ ETKİNLİK — `NextEventSection`: maç, gün/saat, saha, yoklama
 *      ölçeri (yalnız başkanın yoklama ucu `/api/match-availability/:id/team`
 *      okunabildiğinde) ve kullanıcının kendi "Geliyorum / Belki / Gelemem"
 *      yanıtı (`AvailabilityPicker`, yalnız oyuncu profili o maçın
 *      kadrosundaysa). Kaynak: başkanda `["takim","matches"]`, oyuncuda
 *      `["panel","my-matches"]`; lig sekmesinde hangisi varsa. Veri yoksa
 *      "Planlanmış etkinlik yok" — uydurma maç yok.
 *   4. ŞİMDİ İLGİLEN — gerçek bekleyen işler, aciliyete göre sıralı (bkz.
 *      components/club/useClubSignals.ts). İlk üçü burada, tamamı Kulüp
 *      Panelinde. Boşsa yeşil "her şey güncel" satırı — sessizlik değil.
 *   5. KİMLİK — sıkı grafit kart: takım (sıra, puan, averaj, kadro, son 5) ya
 *      da oyuncu (maç, gol, asist, reyting). Karta dokunmak herkese açık
 *      sayfayı açar; başkanda alttaki düğme Kulüp Panelini.
 *
 * MESAJLAR: başlıktaki mesaj ve zil ikonları Mesajlar sekmesine açılır
 * (`/(tabs)/mesajlar?kutu=sohbetler` / kutusuz). Takım sohbeti (`/sohbet`)
 * hızlı erişimde ayrı kalır.
 *
 * MİSAFİR ve KULÜPSÜZ ÜYE: tanıtım kartı yerine EYLEM AKIŞI (`JoinFlow`):
 * 1) Takımını bul → `/ara?tip=takim`, 2) Davet koduyla katıl → `/davetler`
 * (misafirde önce `/giris`), 3) Takım kurmak için başvur → `/iletisim?konu=…`.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useCallback, useMemo, useRef } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AttendanceMeter } from "@/components/club/AttendanceMeter";
import { AttentionList } from "@/components/club/AttentionList";
import { AvailabilityPicker } from "@/components/club/AvailabilityPicker";
import { ClubIdentity, type IdentityFact } from "@/components/club/ClubIdentity";
import { JoinFlow } from "@/components/club/JoinFlow";
import { NextMatchCard } from "@/components/club/NextMatchCard";
import { QuickActions, type QuickAction } from "@/components/club/QuickActions";
import { useClubSignals, type AttentionItem } from "@/components/club/useClubSignals";
import {
  Button,
  ListRow,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  SkeletonCard,
  Tabs,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type TabItem,
} from "@/components/ui";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { MAX_STARTERS } from "@/lib/api/team";
import { formatDecimal, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, radius, space, textScale, type } from "@/theme";

type RoleTab = "takim" | "oyuncu" | "lig";

const ROLE_LABELS: Record<RoleTab, string> = {
  takim: "Takımım",
  oyuncu: "Kariyerim",
  lig: "Lig yönetimi",
};

/** Bekleyen işlerin Yönetim sekmesinde gösterilen en fazla satırı; fazlası panele. */
const ATTENTION_LIMIT = 3;

/** Mesajlar sekmesi — `kutu` verilirse o kutu açık gelir. */
const INBOX = "/(tabs)/mesajlar";

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export default function ClubHubScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const unread = useUnreadCount();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{ rol?: string }>();
  const signals = useClubSignals();
  const scrollRef = useRef<ScrollView>(null);

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
      // Rol değişince içerik baştan okunur: hızlı erişim ekranın tepesinde.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      scrollY.setValue(0);
      router.setParams({ rol: next });
    },
    [router, scrollY],
  );

  const refresh = useRefresh(signals.refetchAll, { refreshing: signals.refreshing });

  const openAttention = useCallback(
    (item: AttentionItem) => {
      if (item.href) router.push(item.href);
    },
    [router],
  );

  /* ------------------------------- ÇİZİM ------------------------------- */

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Yönetim"
        overline={user ? (user.fullName ?? user.username ?? undefined) : "Takım, kariyer, lig"}
        scrollY={scrollY}
        actions={
          user
            ? [
                {
                  icon: "chatbubbles-outline",
                  accessibilityLabel: "Mesajlar: sohbetler",
                  onPress: () => go(`${INBOX}?kutu=sohbetler`),
                  badge: unread.messages || undefined,
                },
                {
                  icon: "notifications-outline",
                  accessibilityLabel: "Mesajlar: bildirimler",
                  onPress: () => go(INBOX),
                  badge: unread.notifications || undefined,
                },
              ]
            : undefined
        }
        tabs={
          roles.length > 1 && role ? (
            <Tabs items={tabItems} value={role} onChange={changeRole} sticky />
          ) : undefined
        }
      />

      <ScrollView
        ref={scrollRef}
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={
          user ? <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} /> : undefined
        }
      >
        {auth.initializing ? (
          <View style={styles.pad}>
            <SkeletonCard lines={3} />
          </View>
        ) : !user ? (
          <JoinFlow signedIn={false} go={go} />
        ) : role === "takim" ? (
          <PresidentSection
            signals={signals}
            scopeLabel={[scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ")}
            go={go}
            onAttention={openAttention}
          />
        ) : role === "oyuncu" ? (
          <PlayerSection signals={signals} go={go} onAttention={openAttention} />
        ) : role === "lig" ? (
          <ManagementSection signals={signals} go={go} />
        ) : (
          <JoinFlow signedIn go={go} />
        )}

        {/* ── TAKİP KISA YOLU — takip listesi Takip ekranında ─────────── */}
        <View style={styles.followLink}>
          <ListRow
            leading={{ icon: "star", tone: "brand" }}
            title="Takip ettiklerin"
            subtitle="Takımlar, ligler ve maçlar"
            onPress={() => go("/takip")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════════ BAŞKAN ═══════════════════════════════ */

function PresidentSection({
  signals,
  scopeLabel,
  go,
  onAttention,
}: {
  signals: ReturnType<typeof useClubSignals>;
  scopeLabel: string;
  go: (href: string) => void;
  onAttention: (item: AttentionItem) => void;
}) {
  const { team, standing, dashboard, counts } = signals;

  // Başkanın asıl araçları — eski "Yönetim araçları" karolarının tamamı.
  const actions = useMemo<QuickAction[]>(
    () => [
      {
        key: "kadro",
        icon: "people",
        label: "Kadro",
        href: "/takimim/kadro",
        tone: "brand",
        badge: signals.withoutContract,
        hint: `${signals.squadSize} oyuncu`,
      },
      {
        key: "transfer",
        icon: "swap-horizontal",
        label: "Transfer",
        href: "/takimim/kadro?gorunum=transfer",
        tone: "brand",
        badge: counts.offersOpen,
        hint: "Oyuncu ara, davet et, teklif ver",
      },
      {
        key: "davet",
        icon: "mail-unread",
        label: "Başvurular",
        href: "/davetler",
        tone: "live",
        badge: counts.applications,
        hint: "Katılım istekleri ve davetler",
      },
      {
        key: "sezon",
        icon: "id-card",
        label: "Lisans",
        href: "/takimim/kadro?gorunum=sezon",
        tone: "info",
        hint: "Sezon kadrosu, transfer hakkı, onay",
      },
      { key: "mac-al", icon: "calendar", label: "Maç al", href: "/takimim/mac-al", tone: "win", hint: "Saha panosundan saat seç" },
      {
        key: "mac-merkezi",
        icon: "clipboard",
        label: "Maçlar",
        href: "/takimim/mac-merkezi",
        tone: "info",
        hint: "Fikstür, yoklama, maç karnesi",
      },
      { key: "kasa", icon: "wallet", label: "Kasa", href: "/takimim/kasa", tone: "warn", hint: "Gelir, gider, kadro değeri" },
      { key: "sohbet", icon: "chatbubbles", label: "Sohbet", href: "/sohbet", tone: "neutral", hint: "Takım grubu" },
    ],
    [counts.applications, counts.offersOpen, signals.squadSize, signals.withoutContract],
  );

  if (dashboard.isLoading) {
    return (
      <View style={styles.pad}>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} style={styles.skeletonGap} />
      </View>
    );
  }

  if (!team) {
    return (
      <InfoCard
        icon="shield-outline"
        title={dashboard.data?.onboarding?.title ?? "Yönetilen takım bulunamadı"}
        body={
          dashboard.data?.onboarding?.description ??
          (dashboard.isError
            ? "Takım bilgisi alınamadı. Aşağı çekerek yeniden deneyebilirsin."
            : "Hesabına bağlı bir takım görünmüyor. Takım yönetimi başvurusu elitlig.com üzerinden yapılır.")
        }
        actionLabel={dashboard.isError ? "Tekrar dene" : "Kulüp paneli"}
        onAction={dashboard.isError ? () => void dashboard.refetch() : () => go("/takimim")}
      />
    );
  }

  const facts: IdentityFact[] = [];
  if (standing) {
    facts.push({ label: "Sıra", value: `${standing.rank}.` });
    facts.push({ label: "Puan", value: String(standing.row.display_points) });
    facts.push({ label: "Averaj", value: signed(Number(standing.row.goal_diff) || 0) });
  }
  facts.push({ label: "Kadro", value: String(signals.squadSize) });

  return (
    <>
      <QuickActions actions={actions} go={go} />

      <NextEventSection signals={signals} source="team" go={go} />

      <SectionHeader
        title="Şimdi ilgilen"
        meta={signals.clubAttention.length ? `${signals.clubAttention.length} iş` : undefined}
      />
      <AttentionList
        items={signals.clubAttention}
        onPress={onAttention}
        limit={ATTENTION_LIMIT}
        onSeeAll={() => go("/takimim")}
      />

      <SectionHeader title="Kulüp" action={{ label: "Takım sayfası", onPress: () => go(`/takim/${team.id}`) }} />
      <ClubIdentity
        kind="team"
        framed
        role="Başkan"
        name={team.team_name}
        image={mediaUrl(team.logo)}
        context={scopeLabel || [team.current_league, team.current_season].filter(Boolean).join(" · ") || team.city}
        facts={facts}
        form={standing?.row.last5 ?? null}
        onPress={() => go(`/takim/${team.id}`)}
        footer={
          <Button
            label="Kulüp paneli"
            onPress={() => go("/takimim")}
            variant="secondary"
            size="sm"
            icon="speedometer-outline"
            onDark
            fullWidth
          />
        }
      />
    </>
  );
}

/* ═══════════════════════════════ OYUNCU ═══════════════════════════════ */

function PlayerSection({
  signals,
  go,
  onAttention,
}: {
  signals: ReturnType<typeof useClubSignals>;
  go: (href: string) => void;
  onAttention: (item: AttentionItem) => void;
}) {
  const { me, counts, user } = signals;
  const data = me.data;
  const player = data?.player ?? null;
  const playerTeam = data?.playerTeam ?? null;
  const stats = data?.stats ?? null;

  // Oyuncunun asıl araçları — eski "Kariyerim" karolarının tamamı + panel.
  const actions = useMemo<QuickAction[]>(
    () => [
      { key: "maclar", icon: "football", label: "Maçlarım", href: "/oyuncum?tab=maclarim", tone: "brand", hint: "Kadro, yoklama, performans" },
      {
        key: "teklif",
        icon: "swap-horizontal",
        label: "Teklifler",
        href: "/tekliflerim",
        tone: "brand",
        badge: counts.offersAwaiting,
        hint: "Gelen transfer teklifleri",
      },
      { key: "sozlesme", icon: "document-text", label: "Sözleşme", href: "/sozlesmelerim", tone: "info", hint: "Aktif ve geçmiş" },
      {
        key: "disiplin",
        icon: "alert-circle",
        label: "Disiplin",
        href: "/cezalarim",
        tone: "warn",
        badge: counts.penaltiesOpen,
        hint: "Savunma ve itiraz",
      },
      {
        key: "davet",
        icon: "git-pull-request",
        label: "Davetler",
        href: "/davetler",
        tone: "live",
        badge: counts.invitesReceived,
        hint: "Takım davetleri, başvurular",
      },
      playerTeam
        ? { key: "takim", icon: "shield", label: "Takımım", href: `/takim/${playerTeam.id}`, tone: "neutral", hint: playerTeam.team_name }
        : { key: "takim-bul", icon: "search", label: "Takım bul", href: "/davetler", tone: "neutral", hint: "Oyuncu arayan takımlar" },
      { key: "sohbet", icon: "chatbubbles", label: "Sohbet", href: "/sohbet", tone: "neutral", hint: "Takım grubu" },
      { key: "panel", icon: "person-circle", label: "Panel", href: "/oyuncum", tone: "neutral", hint: "Oyuncu paneli" },
    ],
    [counts.invitesReceived, counts.offersAwaiting, counts.penaltiesOpen, playerTeam],
  );

  const facts: IdentityFact[] = stats
    ? [
        { label: "Maç", value: String(stats.matches ?? 0) },
        { label: "Gol", value: String(stats.goals ?? 0) },
        { label: "Asist", value: String(stats.assists ?? 0) },
        { label: "Reyting", value: stats.rating != null ? formatDecimal(stats.rating, 1) : "—" },
      ]
    : [];

  return (
    <>
      <QuickActions actions={actions} go={go} />

      <NextEventSection signals={signals} source="player" go={go} />

      <SectionHeader
        title="Şimdi ilgilen"
        meta={signals.playerAttention.length ? `${signals.playerAttention.length} iş` : undefined}
      />
      <AttentionList
        items={signals.playerAttention}
        onPress={onAttention}
        emptyText="Yanıt bekleyen teklif, davet ya da disiplin dosyan yok."
      />

      <SectionHeader title="Kariyer" />
      {me.isLoading ? (
        <View style={styles.pad}>
          <SkeletonCard lines={3} />
        </View>
      ) : (
        <ClubIdentity
          kind="player"
          framed
          role="Oyuncu"
          name={player?.player_name ?? user?.fullName ?? user?.username ?? "Oyuncu"}
          image={mediaUrl(player?.player_img)}
          context={[player?.player_position, playerTeam?.team_name ?? "Serbest oyuncu"].filter(Boolean).join(" · ")}
          facts={facts}
          onPress={() => go(player?.id ? `/oyuncu/${player.id}` : "/oyuncum")}
        />
      )}
    </>
  );
}

/* ═══════════════════════════ LİG YÖNETİMİ ═══════════════════════════ */

/** Lig yönetiminin araçları — hepsi `app/yonetim/*` altında. */
const MANAGEMENT_ACTIONS: QuickAction[] = [
  { key: "gorevler", icon: "checkbox", label: "Görevler", href: "/yonetim/gorevler", tone: "brand", hint: "Atanan ve açık görevler" },
  { key: "gorev-yeni", icon: "add-circle", label: "Yeni görev", href: "/yonetim/gorev-yeni", tone: "brand", hint: "Görev oluştur, ata" },
  { key: "maclar", icon: "football", label: "Maçlar", href: "/yonetim/maclar", tone: "live", hint: "Skor, durum, yayınlama" },
  { key: "sahalar", icon: "location", label: "Sahalar", href: "/yonetim/sahalar", tone: "info", hint: "Talepler, haftalık program" },
  { key: "basvuru", icon: "mail", label: "Başvurular", href: "/yonetim/mesajlar", tone: "warn", hint: "Üye mesajları" },
  { key: "sohbet", icon: "chatbubbles", label: "Sohbet", href: "/yonetim/sohbet", tone: "neutral", hint: "Üyelerle yazışma" },
  { key: "kayitlar", icon: "call", label: "Kayıtlar", href: "/yonetim/kayitlar", tone: "neutral", hint: "Yönetim aramaları" },
  { key: "panel", icon: "grid", label: "Tümü", href: "/yonetim", tone: "neutral", hint: "Web panelinin modülleri" },
];

function ManagementSection({
  signals,
  go,
}: {
  signals: ReturnType<typeof useClubSignals>;
  go: (href: string) => void;
}) {
  return (
    <>
      <QuickActions actions={MANAGEMENT_ACTIONS} go={go} />

      <NextEventSection signals={signals} source="auto" go={go} />
    </>
  );
}

/* ══════════════════════════ SIRADAKİ ETKİNLİK ══════════════════════════ */

/**
 * Hızlı erişimin altındaki blok. `source` hangi maç listesinin okunacağını söyler:
 *   - "team":   başkanın takım fikstürü (`signals.nextTeamMatch`)
 *   - "player": oyuncunun maçları (`signals.nextPlayerMatch`)
 *   - "auto":   lig sekmesi — hesabın hangisi varsa (önce takım)
 *
 * Yoklama ölçeri yalnız başkanın takım yoklaması okunabildiğinde (aynı maç),
 * "Geliyor musun?" yanıtı yalnız oyuncunun maç listesinde AYNI maç varsa
 * çizilir — başkanın oyuncu profili başka takımdaysa yanıt verdirilmez.
 */
function NextEventSection({
  signals,
  source,
  go,
}: {
  signals: ReturnType<typeof useClubSignals>;
  source: "team" | "player" | "auto";
  go: (href: string) => void;
}) {
  const { managed, isPlayer, nextTeamMatch, nextPlayerMatch, teamMatches, myMatches, teamAvailability } = signals;
  const kind: "team" | "player" | null =
    source === "team"
      ? managed
        ? "team"
        : null
      : source === "player"
        ? isPlayer
          ? "player"
          : null
        : managed
          ? "team"
          : isPlayer
            ? "player"
            : null;

  const loading = kind === "team" ? teamMatches.isLoading : kind === "player" ? myMatches.isLoading : false;
  const failed = kind === "team" ? teamMatches.isError : kind === "player" ? myMatches.isError : false;
  const match = kind === "team" ? nextTeamMatch : kind === "player" ? nextPlayerMatch : null;

  const header = (
    <SectionHeader
      title="Sıradaki etkinlik"
      action={
        kind === "team"
          ? { label: "Maç merkezi", onPress: () => go("/takimim/mac-merkezi") }
          : kind === "player"
            ? { label: "Maçlarım", onPress: () => go("/oyuncum?tab=maclarim") }
            : undefined
      }
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <View style={styles.pad}>
          <SkeletonCard lines={2} />
        </View>
      </>
    );
  }

  if (!match) {
    return (
      <>
        {header}
        <InfoCard
          icon="calendar-outline"
          title={failed ? "Etkinlik bilgisi alınamadı" : "Planlanmış etkinlik yok"}
          body={
            failed
              ? "Aşağı çekerek yeniden deneyebilirsin."
              : kind === "team"
                ? "Saha panosundan saat seç; onaylanınca maç burada görünür."
                : "Takımına maç yazılınca burada görünür."
          }
          actionLabel={failed ? undefined : kind === "team" ? "Maç al" : undefined}
          onAction={failed ? undefined : kind === "team" ? () => go("/takimim/mac-al") : undefined}
          compact
        />
      </>
    );
  }

  // Yoklama dağılımı: başkanın ucu, yalnız takımın sıradaki maçı için.
  const showMeter = managed && nextTeamMatch?.id === match.id;
  // Kişisel yanıt: oyuncu profili bu maçta (oyuncunun maç listesinde) ise.
  const showPicker = isPlayer && nextPlayerMatch?.id === match.id;

  const meter = showMeter ? (
    teamAvailability.isLoading ? (
      <Skeleton width="100%" height={8} radius="pill" />
    ) : teamAvailability.data ? (
      <AttendanceMeter counts={teamAvailability.data.counts} need={MAX_STARTERS} />
    ) : null
  ) : null;

  return (
    <>
      {header}
      <NextMatchCard
        opponent={match.opponent_name}
        date={match.date}
        time={match.time}
        isHome={match.is_home}
        venue={match.match_field}
        onPress={() => go(`/mac/${match.id}`)}
        footer={
          kind === "team" ? (
            <Button
              label="Maç kadrosunu gir"
              icon="people-outline"
              size="sm"
              onPress={() => go(`/takimim/mac/${match.id}`)}
              fullWidth
            />
          ) : undefined
        }
      >
        {meter || showPicker ? (
          <View style={styles.eventBody}>
            {meter}
            {showPicker ? <AvailabilityPicker matchId={match.id} /> : null}
          </View>
        ) : null}
      </NextMatchCard>
    </>
  );
}

/* ═══════════════════════════════ PARÇALAR ═══════════════════════════════ */

const InfoCard = React.memo(function InfoCard({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  compact,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Satır içi sürüm: ikon solda, düğme sağda — bölüm içi boş hâller için. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <View style={[styles.info, styles.infoCompact]}>
        <View style={styles.infoIcon}>
          <Ionicons name={icon} size={16} color={colors.brandAccent} />
        </View>
        <View style={styles.infoTexts}>
          <Text style={styles.infoTitleSm} numberOfLines={1} {...textScale.dense}>
            {title}
          </Text>
          <Text style={styles.infoBody} numberOfLines={2} {...textScale.dense}>
            {body}
          </Text>
        </View>
        {actionLabel && onAction ? (
          <Button label={actionLabel} onPress={onAction} size="sm" variant="secondary" />
        ) : null}
      </View>
    );
  }
  return (
    <View style={[styles.info, styles.infoTop]}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={colors.brandAccent} />
      </View>
      <Text style={styles.infoTitle} {...textScale.dense}>
        {title}
      </Text>
      <Text style={styles.infoBody} {...textScale.long}>
        {body}
      </Text>
      <View style={styles.infoActions}>
        {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} size="sm" /> : null}
        {secondaryLabel && onSecondary ? (
          <Button label={secondaryLabel} onPress={onSecondary} size="sm" variant="secondary" />
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Alt çubuk akışta (üstte yüzmüyor): büyük alt dolguya gerek yok.
  content: {
    paddingTop: space.sm,
    paddingBottom: space.xxl,
  },
  pad: { paddingHorizontal: layout.screenPadding },
  skeletonGap: { marginTop: space.sm },

  info: {
    marginHorizontal: layout.screenPadding,
    padding: space.md,
    gap: space.s,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  // Rolün ilk bloğu olduğunda (takım yok) bölüm başlığı olmadan üstte durur.
  infoTop: { marginTop: space.sm },
  infoCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingVertical: space.m,
  },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.brandDim,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTexts: { flex: 1, minWidth: 0, gap: space.xxs },
  infoTitle: { ...type.h3, color: colors.textPrimary },
  infoTitleSm: { ...type.h4, color: colors.textPrimary },
  infoBody: { ...type.bodySm, color: colors.textSecondary },
  infoActions: { flexDirection: "row", gap: space.sm, marginTop: space.xxs },

  eventBody: { gap: space.m },
  followLink: { paddingHorizontal: layout.screenPadding, marginTop: space.xl },
});
