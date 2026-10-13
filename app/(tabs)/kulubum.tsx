/**
 * KULÜBÜM — takım, oyuncu ve lig yönetiminin TEK kapısı (alt çubuğun 4. sekmesi).
 * `/kulubum?rol=<takim|oyuncu|lig>`
 *
 * BİLGİ MİMARİSİ (Arena "Merkez" kalıbı: kimlik → bekleyen işler → kapılar):
 *
 *   1. ROL SEKMELERİ — bir hesap başkan + oyuncu + yönetici olabilir. Eskiden
 *      üç rolün blokları alt alta diziliyordu: iki grafit kimlik kartı üst
 *      üste biniyor (Arena: sahne ekranda bir kez), oyuncu araçları başkanın
 *      on iki karosunun altında kayboluyordu. Artık her rol kendi sekmesidir;
 *      sekme şeridi YALNIZ birden çok rol varsa çizilir. Seçim `?rol=` ile
 *      URL'de taşınır (derin bağlantı, geri tuşu).
 *   2. KİMLİK — tek sahne kartı: takım (sıra, puan, averaj, kadro, son 5) ya
 *      da oyuncu (maç, gol, asist, reyting). Karta dokunmak herkese açık
 *      sayfayı, alttaki düğme yönetim panelini açar.
 *   3. ŞİMDİ İLGİLEN — gerçek bekleyen işler, aciliyete göre sıralı (bkz.
 *      components/club/useClubSignals.ts). İlk üçü burada, tamamı Kulüp
 *      Panelinde. Boşsa yeşil "her şey güncel" satırı — sessizlik değil.
 *   4. SIRADAKİ MAÇ — başkana yoklama ölçeri + "kadroyu gir", oyuncuya tek
 *      dokunuşla "geliyor musun?" yanıtı.
 *   5. ARAÇLAR — `HubGrid`: her iş bir karo, rozet gerçek sayıdır.
 *   6. TAKİP ETTİĞİM TAKIMLAR — her rolde (ve misafirde) en altta.
 *
 * MİSAFİR: grafit tanıtım kartı + "Giriş yap / Üye ol"; takip şeridi
 * misafirde de çalışır (favoriler cihazda tutulur).
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
import { NextMatchCard } from "@/components/club/NextMatchCard";
import { useClubSignals, type AttentionItem } from "@/components/club/useClubSignals";
import {
  Button,
  GradientFill,
  HubGrid,
  HubTile,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  SkeletonCard,
  Tabs,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type TabItem,
} from "@/components/ui";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { MAX_STARTERS } from "@/lib/api/team";
import { mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, fonts, layout, radius, space, textScale, type } from "@/theme";

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
  const { favorites } = useFavorite();
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
                  accessibilityLabel: "Mesajlar",
                  onPress: () => go("/sohbet"),
                  badge: unread.messages || undefined,
                },
                {
                  icon: "notifications-outline",
                  accessibilityLabel: "Bildirimler",
                  onPress: () => go("/bildirimler"),
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
          <GuestCard onSignIn={() => go("/giris")} onRegister={() => go("/kayit")} />
        ) : role === "takim" ? (
          <PresidentSection signals={signals} scopeLabel={[scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ")} go={go} onAttention={openAttention} unreadMessages={unread.messages} />
        ) : role === "oyuncu" ? (
          <PlayerSection signals={signals} go={go} onAttention={openAttention} />
        ) : role === "lig" ? (
          <ManagementSection go={go} />
        ) : (
          <InfoCard
            icon="people-circle-outline"
            title="Henüz bir kulübe bağlı değilsin"
            body="Bir takımdan gelen daveti kabul et ya da takım kurmak için lig yönetimiyle iletişime geç."
            actionLabel="Davetlerim"
            onAction={() => go("/davetler")}
            secondaryLabel="İletişim"
            onSecondary={() => go("/iletisim")}
          />
        )}

        {/* ── TAKİP ETTİĞİM TAKIMLAR ────────────────────────────────── */}
        <SectionHeader
          title="Takip ettiğim takımlar"
          meta={favorites.length ? `${favorites.length} takım` : undefined}
          action={favorites.length ? { label: "Yönet", onPress: () => go("/(tabs)/favoriler?tab=takimlar") } : undefined}
        />
        {favorites.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.follows}>
            {favorites.map((fav) => (
              <Touchable
                key={fav.id}
                feedback="card"
                haptic="selection"
                onPress={() => go(`/takim/${fav.id}`)}
                accessibilityRole="button"
                accessibilityLabel={fav.name}
                style={styles.followTile}
              >
                <TeamLogo name={fav.name} logo={fav.logo} size={40} />
                <Text style={styles.followName} numberOfLines={2} {...textScale.badge}>
                  {fav.name}
                </Text>
              </Touchable>
            ))}
            <Touchable
              feedback="card"
              haptic="selection"
              onPress={() => go("/(tabs)/ligler?tab=takimlar")}
              accessibilityRole="button"
              accessibilityLabel="Takım ekle"
              style={[styles.followTile, styles.followAdd]}
            >
              <Ionicons name="add" size={24} color={colors.brandAccent} />
              <Text style={[styles.followName, styles.followAddText]} {...textScale.badge}>
                Takım ekle
              </Text>
            </Touchable>
          </ScrollView>
        ) : (
          <InfoCard
            icon="star-outline"
            title="Takım takip etmiyorsun"
            body="Maçları öne çıkar, gol ve sonuç bildirimi gelir."
            actionLabel="Takım seç"
            onAction={() => go("/(tabs)/ligler?tab=takimlar")}
            compact
          />
        )}
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
  unreadMessages,
}: {
  signals: ReturnType<typeof useClubSignals>;
  scopeLabel: string;
  go: (href: string) => void;
  onAttention: (item: AttentionItem) => void;
  unreadMessages: number;
}) {
  const { team, standing, dashboard, nextTeamMatch, teamAvailability, counts } = signals;

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

      <SectionHeader
        title="Sıradaki maç"
        action={{ label: "Maç merkezi", onPress: () => go("/takimim/mac-merkezi") }}
      />
      {signals.teamMatches.isLoading ? (
        <View style={styles.pad}>
          <SkeletonCard lines={2} />
        </View>
      ) : nextTeamMatch ? (
        <NextMatchCard
          opponent={nextTeamMatch.opponent_name}
          date={nextTeamMatch.date}
          time={nextTeamMatch.time}
          isHome={nextTeamMatch.is_home}
          venue={nextTeamMatch.match_field}
          onPress={() => go(`/mac/${nextTeamMatch.id}`)}
          footer={
            <Button
              label="Maç kadrosunu gir"
              icon="people-outline"
              size="sm"
              onPress={() => go(`/takimim/mac/${nextTeamMatch.id}`)}
              fullWidth
            />
          }
        >
          {teamAvailability.isLoading ? (
            <Skeleton width="100%" height={8} radius="pill" />
          ) : teamAvailability.data ? (
            <AttendanceMeter counts={teamAvailability.data.counts} need={MAX_STARTERS} />
          ) : null}
        </NextMatchCard>
      ) : (
        <InfoCard
          icon="calendar-outline"
          title="Programda maç yok"
          body="Saha panosundan boş saat seç; yönetici onaylayınca maç takımına yazılır."
          actionLabel="Maç al"
          onAction={() => go("/takimim/mac-al")}
          compact
        />
      )}

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
          title="Mesajlar"
          subtitle="Takım grubu, oyuncular"
          badge={unreadMessages}
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
  const { me, nextPlayerMatch, counts, user } = signals;
  const data = me.data;
  const player = data?.player ?? null;
  const playerTeam = data?.playerTeam ?? null;
  const stats = data?.stats ?? null;

  const facts: IdentityFact[] = stats
    ? [
        { label: "Maç", value: String(stats.matches ?? 0) },
        { label: "Gol", value: String(stats.goals ?? 0) },
        { label: "Asist", value: String(stats.assists ?? 0) },
        { label: "Reyting", value: stats.rating != null ? Number(stats.rating).toFixed(1) : "—" },
      ]
    : [];

  return (
    <>
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

      {nextPlayerMatch ? (
        <>
          <SectionHeader
            title="Sıradaki maçın"
            action={{ label: "Maçlarım", onPress: () => go("/oyuncum?tab=maclarim") }}
          />
          <NextMatchCard
            opponent={nextPlayerMatch.opponent_name}
            date={nextPlayerMatch.date}
            time={nextPlayerMatch.time}
            isHome={nextPlayerMatch.is_home}
            venue={nextPlayerMatch.match_field}
            onPress={() => go(`/mac/${nextPlayerMatch.id}`)}
          >
            <AvailabilityPicker matchId={nextPlayerMatch.id} />
          </NextMatchCard>
        </>
      ) : null}

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

function ManagementSection({ go }: { go: (href: string) => void }) {
  return (
    <>
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
  actionLabel: string;
  onAction: () => void;
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
        <Button label={actionLabel} onPress={onAction} size="sm" variant="secondary" />
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
        <Button label={actionLabel} onPress={onAction} size="sm" />
        {secondaryLabel && onSecondary ? (
          <Button label={secondaryLabel} onPress={onSecondary} size="sm" variant="secondary" />
        ) : null}
      </View>
    </View>
  );
});

const GUEST_POINTS: [keyof typeof Ionicons.glyphMap, string, string][] = [
  ["pulse", "Şimdi ilgilen", "Başvuru, sözleşme, yoklama — bekleyen her iş tek listede"],
  ["people", "Kadro ve transfer", "Forma, mevki, diziliş; oyuncu ara, davet et, teklif ver"],
  ["calendar", "Maç günü", "Saha al, yoklama yap, maç kadrosunu gir"],
  ["wallet", "Kulüp kasası", "Gelir, gider, kadro değeri ve FFP"],
];

const GuestCard = React.memo(function GuestCard({
  onSignIn,
  onRegister,
}: {
  onSignIn: () => void;
  onRegister: () => void;
}) {
  return (
    <View style={styles.guest}>
      <GradientFill tone="ink" radius="xxl" />
      <Text style={styles.guestOverline} {...textScale.badge}>
        BAŞKAN · OYUNCU · YÖNETİCİ
      </Text>
      <Text style={styles.guestTitle} {...textScale.dense}>
        Kulübünü cebinden yönet
      </Text>
      <Text style={styles.guestBody} {...textScale.long}>
        Giriş yaptığında rolüne göre araçların burada açılır.
      </Text>
      <View style={styles.guestPoints}>
        {GUEST_POINTS.map(([icon, title, body]) => (
          <View key={title} style={styles.guestPoint}>
            <View style={styles.guestPip}>
              <Ionicons name={icon} size={16} color={colors.brandOnDark} />
            </View>
            <View style={styles.guestPointTexts}>
              <Text style={styles.guestPointTitle} {...textScale.dense}>
                {title}
              </Text>
              <Text style={styles.guestPointBody} {...textScale.dense}>
                {body}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.guestActions}>
        <Button label="Giriş yap" onPress={onSignIn} style={styles.flex} />
        <Button label="Üye ol" onPress={onRegister} variant="secondary" onDark style={styles.flex} />
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
  flex: { flex: 1 },
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

  guest: {
    marginHorizontal: layout.screenPadding,
    padding: space.xl,
    gap: space.sm,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
  },
  guestOverline: { ...type.overline, color: colors.brandOnDark },
  guestTitle: { ...type.display, color: colors.onDark },
  guestBody: { ...type.body, color: colors.onDarkMuted },
  guestPoints: { gap: space.md, marginVertical: space.sm },
  guestPoint: { flexDirection: "row", alignItems: "center", gap: space.md },
  guestPip: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.inkTileBorder,
  },
  guestPointTexts: { flex: 1, minWidth: 0, gap: 1 },
  guestPointTitle: { ...type.label, color: colors.onDark },
  guestPointBody: { ...type.caption, color: colors.onDarkMuted },
  guestActions: { flexDirection: "row", gap: space.sm, marginTop: space.xs },

  follows: {
    paddingHorizontal: layout.screenPadding,
    gap: space.sm,
  },
  followTile: {
    width: 88,
    alignItems: "center",
    gap: space.s,
    paddingVertical: space.md,
    paddingHorizontal: space.s,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  followName: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    textAlign: "center",
  },
  followAdd: {
    justifyContent: "center",
    borderStyle: "dashed",
    borderColor: colors.brandBorder,
    borderWidth: 1,
    backgroundColor: colors.bg,
  },
  followAddText: { color: colors.brandAccent },
});
