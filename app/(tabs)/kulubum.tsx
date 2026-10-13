/**
 * KULÜBÜM — takım, oyuncu ve lig yönetiminin TEK kapısı (alt çubuğun 4. sekmesi).
 * `/kulubum?rol=<takim|oyuncu|lig>`
 *
 * BİLGİ MİMARİSİ (Arena "Merkez" kalıbı: sıradaki iş → kimlik → bekleyen işler → kapılar):
 *
 *   1. ROL SEKMELERİ — bir hesap başkan + oyuncu + yönetici olabilir; her rol
 *      kendi sekmesidir, şerit YALNIZ birden çok rol varsa çizilir. Seçim
 *      `?rol=` ile URL'de taşınır (derin bağlantı, geri tuşu).
 *   2. SIRADAKİ ETKİNLİK — her rolde EN ÜSTTE (`NextEventSection`): maç, gün/
 *      saat, saha, yoklama ölçeri (yalnız başkanın yoklama ucu
 *      `/api/match-availability/:id/team` okunabildiğinde) ve kullanıcının
 *      kendi "Geliyorum / Belki / Gelemem" yanıtı (`AvailabilityPicker`,
 *      yalnız oyuncu profili o maçın kadrosundaysa). Kaynak: başkanda
 *      `["takim","matches"]`, oyuncuda `["panel","my-matches"]`; lig
 *      sekmesinde hangisi varsa. Veri yoksa "Planlanmış etkinlik yok" —
 *      uydurma maç yok. Bu kâğıt kart, kimliğin grafit sahnesinin ÜSTÜNDE
 *      durur: kullanıcının en çok sorduğu "ne zaman, nerede, geliyor muyum?".
 *   3. KİMLİK — tek sahne kartı: takım (sıra, puan, averaj, kadro, son 5) ya
 *      da oyuncu (maç, gol, asist, reyting). Karta dokunmak herkese açık
 *      sayfayı, alttaki düğme yönetim panelini açar.
 *   4. ŞİMDİ İLGİLEN — gerçek bekleyen işler, aciliyete göre sıralı (bkz.
 *      components/club/useClubSignals.ts). İlk üçü burada, tamamı Kulüp
 *      Panelinde. Boşsa yeşil "her şey güncel" satırı — sessizlik değil.
 *   5. ARAÇLAR — `HubGrid`: her iş bir karo, rozet gerçek sayıdır (menekşe).
 *      Takım sohbeti kapısı (`/sohbet`) burada kalır.
 *   6. TAKİP KISA YOLU — takip edilen takımlar artık Takip sekmesinde; burada
 *      yalnız tek satırlık "Takip ettiklerin → /takip".
 *
 * GELEN KUTUSU: başlıktaki mesaj ve zil ikonları ayrı ekranlara değil tek
 * `/gelen-kutusu` ekranına açılır (`?tab=mesajlar` / `?tab=bildirimler`);
 * rozetler menekşe (okunmamış). Takım sohbeti ayrı kalır.
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
import { useClubSignals, type AttentionItem } from "@/components/club/useClubSignals";
import {
  Button,
  HubGrid,
  HubTile,
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

/** Bekleyen işlerin Kulübüm'de gösterilen en fazla satırı; fazlası panele. */
const ATTENTION_LIMIT = 3;

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
      // Rol değişince içerik baştan okunur: kimlik kartı ekranın tepesinde.
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
        title="Kulübüm"
        overline={user ? (user.fullName ?? user.username ?? undefined) : "Yönetim merkezi"}
        scrollY={scrollY}
        actions={
          user
            ? [
                {
                  icon: "chatbubbles-outline",
                  accessibilityLabel: "Gelen kutusu: mesajlar",
                  onPress: () => go("/gelen-kutusu?tab=mesajlar"),
                  badge: unread.messages || undefined,
                },
                {
                  icon: "notifications-outline",
                  accessibilityLabel: "Gelen kutusu: bildirimler",
                  onPress: () => go("/gelen-kutusu?tab=bildirimler"),
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

        {/* ── TAKİP KISA YOLU — takip listesi Takip sekmesinde ─────────── */}
        <View style={styles.followLink}>
          <ListRow
            leading={{ icon: "star", tone: "brand" }}
            title="Takip ettiklerin"
            subtitle="Takımlar, ligler ve maçlar Takip sekmesinde"
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
      <NextEventSection signals={signals} source="team" go={go} />

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
        style={styles.identity}
      />

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

      <SectionHeader title="Yönetim araçları" />
      <HubGrid>
        <HubTile
          icon="people"
          title="Kadro"
          subtitle={
            signals.withoutContract
              ? `${signals.withoutContract} sözleşmesiz · ${signals.squadSize} oyuncu`
              : `${signals.squadSize} oyuncu · forma, mevki, diziliş`
          }
          badge={signals.withoutContract}
          tone="brand"
          onPress={() => go("/takimim/kadro")}
        />
        <HubTile
          icon="swap-horizontal"
          title="Transfer"
          subtitle={counts.offersOpen ? `${counts.offersOpen} açık teklif` : "Oyuncu ara, davet et, teklif ver"}
          badge={counts.offersOpen}
          tone="accent"
          onPress={() => go("/takimim/kadro?gorunum=transfer")}
        />
        <HubTile
          icon="mail-unread"
          title="Davet ve başvuru"
          subtitle={counts.applications ? `${counts.applications} başvuru bekliyor` : "Katılım istekleri, davetler"}
          badge={counts.applications}
          tone="live"
          onPress={() => go("/davetler")}
        />
        <HubTile
          icon="id-card"
          title="Sezon kadrosu"
          subtitle="Lisans, transfer hakkı, onay"
          tone="info"
          onPress={() => go("/takimim/kadro?gorunum=sezon")}
        />
        <HubTile
          icon="clipboard"
          title="Maç merkezi"
          subtitle="Fikstür, yoklama, maç karnesi"
          tone="info"
          onPress={() => go("/takimim/mac-merkezi")}
        />
        <HubTile
          icon="calendar"
          title="Maç al"
          subtitle="Saha panosundan saat seç"
          tone="win"
          onPress={() => go("/takimim/mac-al")}
        />
        <HubTile
          icon="wallet"
          title="Kulüp kasası"
          subtitle="Gelir, gider, kadro değeri"
          tone="warn"
          onPress={() => go("/takimim/kasa")}
        />
        <HubTile
          icon="chatbubbles"
          title="Takım sohbeti"
          subtitle="Takım grubu, oyuncular"
          tone="neutral"
          onPress={() => go("/sohbet")}
        />
      </HubGrid>
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
      <NextEventSection signals={signals} source="player" go={go} />

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
          footer={
            <Button
              label="Oyuncu paneli"
              onPress={() => go("/oyuncum")}
              variant="secondary"
              size="sm"
              icon="person-circle-outline"
              onDark
              fullWidth
            />
          }
          style={styles.identity}
        />
      )}

      <SectionHeader
        title="Şimdi ilgilen"
        meta={signals.playerAttention.length ? `${signals.playerAttention.length} iş` : undefined}
      />
      <AttentionList
        items={signals.playerAttention}
        onPress={onAttention}
        emptyText="Yanıt bekleyen teklif, davet ya da disiplin dosyan yok."
      />

      <SectionHeader title="Kariyerim" />
      <HubGrid>
        <HubTile icon="football" title="Maçlarım" subtitle="Kadro, yoklama, performans" tone="brand" onPress={() => go("/oyuncum?tab=maclarim")} />
        <HubTile
          icon="swap-horizontal"
          title="Tekliflerim"
          subtitle={counts.offersAwaiting ? `${counts.offersAwaiting} yanıt bekliyor` : "Gelen transfer teklifleri"}
          badge={counts.offersAwaiting}
          tone="accent"
          onPress={() => go("/tekliflerim")}
        />
        <HubTile icon="document-text" title="Sözleşmelerim" subtitle="Aktif ve geçmiş" tone="info" onPress={() => go("/sozlesmelerim")} />
        <HubTile
          icon="alert-circle"
          title="Disiplin"
          subtitle={counts.penaltiesOpen ? "Süresi işleyen dosya var" : "Savunma ve itiraz"}
          badge={counts.penaltiesOpen}
          tone="warn"
          onPress={() => go("/cezalarim")}
        />
        <HubTile
          icon="git-pull-request"
          title="Davetlerim"
          subtitle={counts.invitesReceived ? `${counts.invitesReceived} kadro daveti` : "Takım davetleri, başvurular"}
          badge={counts.invitesReceived}
          tone="live"
          onPress={() => go("/davetler")}
        />
        {playerTeam ? (
          <HubTile icon="shield" title="Takımım" subtitle={playerTeam.team_name} tone="neutral" onPress={() => go(`/takim/${playerTeam.id}`)} />
        ) : (
          <HubTile icon="search" title="Takım bul" subtitle="Oyuncu arayan takımlar" tone="neutral" onPress={() => go("/davetler")} />
        )}
      </HubGrid>
    </>
  );
}

/* ═══════════════════════════ LİG YÖNETİMİ ═══════════════════════════ */

function ManagementSection({
  signals,
  go,
}: {
  signals: ReturnType<typeof useClubSignals>;
  go: (href: string) => void;
}) {
  return (
    <>
      <NextEventSection signals={signals} source="auto" go={go} />

      <SectionHeader title="Lig yönetimi" action={{ label: "Panel", onPress: () => go("/yonetim") }} />
      <HubGrid>
        <HubTile icon="checkbox" title="Görevlerim" subtitle="Atanan ve açık görevler" tone="brand" onPress={() => go("/yonetim/gorevler")} />
        <HubTile icon="football" title="Maç yönetimi" subtitle="Skor, durum, yayınlama" tone="live" onPress={() => go("/yonetim/maclar")} />
        <HubTile icon="location" title="Saha yönetimi" subtitle="Talepler, haftalık program" tone="info" onPress={() => go("/yonetim/sahalar")} />
        <HubTile icon="mail" title="Başvurular" subtitle="Üye mesajları" tone="warn" onPress={() => go("/yonetim/mesajlar")} />
        <HubTile icon="chatbubbles" title="Yönetim sohbeti" subtitle="Üyelerle yazışma" tone="accent" onPress={() => go("/yonetim/sohbet")} />
        <HubTile icon="grid" title="Tüm araçlar" subtitle="Web panelinin modülleri" tone="neutral" onPress={() => go("/yonetim")} />
      </HubGrid>
    </>
  );
}

/* ══════════════════════════ SIRADAKİ ETKİNLİK ══════════════════════════ */

/**
 * Her rolün en üst bloğu. `source` hangi maç listesinin okunacağını söyler:
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
        style={styles.event}
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
          <Ionicons name={icon} size={18} color={colors.brandAccent} />
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
    <View style={styles.info}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={20} color={colors.brandAccent} />
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
  content: {
    paddingTop: space.sm,
    paddingBottom: layout.tabBarHeight + space.huge,
  },
  pad: { paddingHorizontal: layout.screenPadding },
  skeletonGap: { marginTop: space.md },
  identity: { marginBottom: space.xs },

  info: {
    marginHorizontal: layout.screenPadding,
    padding: space.lg,
    gap: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  infoCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTexts: { flex: 1, minWidth: 0, gap: 2 },
  infoTitle: { ...type.h2, color: colors.textPrimary },
  infoTitleSm: { ...type.h3, color: colors.textPrimary },
  infoBody: { ...type.bodySm, color: colors.textSecondary },
  infoActions: { flexDirection: "row", gap: space.sm, marginTop: space.xs },

  event: { marginBottom: space.xs },
  eventBody: { gap: space.md },
  followLink: { paddingHorizontal: layout.screenPadding, marginTop: layout.sectionGap },
});
