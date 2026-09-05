/**
 * TAKIM PANELİM — kulüp yönetiminin giriş kapısı.
 *
 * NE: başkanın "bugün ne yapmam gerekiyor?" sorusunu tek ekranda yanıtlar.
 * Üstte takım kimliği (hero), altında kulübün sayısal özeti (KPI şeridi),
 * sonra BEKLEYEN İŞLER şeridi ve en altta alt ekranlara açılan satır grubu.
 *
 * NEDEN "YAPILACAKLAR" ŞERİDİ: eski sürüm yalnızca bekleyen değişiklik
 * talebinin SAYISINI yazıyordu; satır tıklanamıyordu, listesi yoktu ve
 * imzasız oyuncu / bekleyen başvuru gibi gerçekten eylem isteyen durumlar
 * hiç görünmüyordu. Artık her bekleyen iş rozetli bir satırdır ve dokununca
 * ilgili ekrana iner; değişiklik talepleri alt sayfada tek tek listelenir.
 *
 * VERİ KAYNAKLARI (hepsi oturum + takım yönetimi yetkisi ister):
 *   GET /api/team-management/dashboard   takım, kadro, sözleşme, talepler
 *   GET /api/team-join-requests          bekleyen davet/başvuru sayacı
 *   GET /api/transfer-offers/outbox      kulübün açık transfer teklifleri
 *   GET /api/standings                   sıra rozeti (kapsam seçiliyse)
 *
 * ÖNBELLEK ORTAKLIĞI: `["takim","dashboard"]`, `["takim","join-requests"]` ve
 * `queryKeys.standings(...)` anahtarları `app/davetler.tsx` ve `(tabs)/ligler`
 * ile BİREBİR aynıdır — ekranlar arası geçişte ikinci istek atılmaz.
 *
 * SIRA ROZETİ NEDEN KOŞULLU: dashboard ucu takımın lig sırasını döndürmez.
 * Sıra, kullanıcının seçili kapsamındaki puan tablosunda takım bulunursa
 * gösterilir; bulunamazsa (başka şehir/lig seçili) rozet hiç çizilmez —
 * yanlış sıra göstermektense göstermemek yeğdir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter, type Href } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  BottomSheet,
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  SkeletonListRow,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type Tone,
} from "@/components/ui";
import { getStandings } from "@/lib/api/standings";
import { getJoinRequests, getTeamDashboard } from "@/lib/api/team";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { get } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Sabitler
   ══════════════════════════════════════════════════════════════════════════ */

/** Takım başkanı sayılan profil tipleri (sunucudaki `profile_type` değerleri). */
const PRESIDENT_PROFILES = new Set(["takim_baskani", "double"]);

interface NavItem {
  key: string;
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  tone?: Tone;
}

/** Alt ekranlar — panelin ikinci katmanı. */
const NAV_ITEMS: NavItem[] = [
  {
    key: "kadro",
    href: "/takimim/kadro",
    icon: "people",
    title: "Kadro Yönetimi",
    subtitle: "Oyuncu ekle, sezon kadrosu, forma ve mevki",
    tone: "brand",
  },
  {
    key: "kadro-kur",
    href: "/takimim/kadro?gorunum=sezon",
    icon: "person-add",
    title: "Transfer & Sezon Kadrosu",
    subtitle: "Oyuncu ara, tek dokunuşla davet/teklif; sezon kadrosunu doldur",
    tone: "brand",
  },
  {
    key: "mac-al",
    href: "/takimim/mac-al",
    icon: "calendar",
    title: "Maç Al",
    subtitle: "Saha panosundan boş saat seç, talep gönder",
    tone: "brand",
  },
  {
    key: "mac-merkezi",
    href: "/takimim/mac-merkezi",
    icon: "football",
    title: "Maç Merkezi",
    subtitle: "Fikstür, yoklama ve maç karnesi",
    tone: "brand",
  },
  {
    key: "kasa",
    href: "/takimim/kasa",
    icon: "wallet",
    title: "Kulüp Kasası",
    subtitle: "Gelir, gider, kadro değeri ve FFP",
  },
  {
    key: "davetler",
    href: "/davetler",
    icon: "git-pull-request",
    title: "Davet ve Başvurular",
    subtitle: "Oyuncu davetleri ve katılım başvuruları",
  },
  {
    key: "mesajlar",
    href: "/mesajlarim",
    icon: "chatbubbles",
    title: "Mesajlar",
    subtitle: "Lig yönetimiyle yazışmaların",
  },
];

/** `services/changeRequestService.js` TYPES kümesinin Türkçe karşılıkları. */
const CHANGE_LABELS: Record<string, string> = {
  team_update: "Takım bilgisi güncellemesi",
  team_logo: "Takım logosu değişikliği",
  player_update: "Oyuncu bilgisi güncellemesi",
  player_release: "Oyuncu serbest bırakma",
  sponsor_update: "Sponsor alanı güncellemesi",
};

/**
 * `constants/transfer.js` ACTIVE_STATUSES — hâlâ yanıt bekleyen teklifler.
 * Süresi dolmuş/geri çekilmiş teklif "yapılacak iş" değildir.
 */
const ACTIVE_OFFER_STATUSES = new Set(["DRAFT", "SENT", "REVISION_REQUESTED"]);

/**
 * Kulübün gönderdiği teklifler. `lib/api/team.ts` transfer uçlarını henüz
 * kapsamadığı için çağrı burada, YALNIZ SAYAÇ İÇİN, en dar tiple yapılır.
 */
interface OutboxOffer {
  id: number;
  status: string;
}

const getOfferOutbox = () =>
  get<{ items: OutboxOffer[]; totalItems: number }>("/api/transfer-offers/outbox", {
    limit: 100,
  });

/* ══════════════════════════════════════════════════════════════════════════
   Saf yardımcılar
   ══════════════════════════════════════════════════════════════════════════ */

/** Grup içi konum — ListRow köşe yuvarlamasını ve ayracı buradan alır. */
function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Averaj: gol farkı işaretiyle birlikte ("+7", "-3", "0"). */
function goalDiffLabel(scored?: number | null, conceded?: number | null): string {
  if (scored == null || conceded == null) return "—";
  const diff = Number(scored) - Number(conceded);
  if (!Number.isFinite(diff)) return "—";
  return diff > 0 ? `+${diff}` : String(diff);
}

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

export default function TeamPanelScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [changesOpen, setChangesOpen] = useState(false);

  const user = auth.user;
  const hasTeamScope = Boolean(
    user &&
      (user.managed_team_id || PRESIDENT_PROFILES.has(String(user.profile_type ?? "")))
  );

  const dashboard = useQuery({
    queryKey: ["takim", "dashboard"],
    queryFn: getTeamDashboard,
    enabled: Boolean(user) && hasTeamScope,
    staleTime: 60_000,
    retry: false,
  });

  const managed = Boolean(dashboard.data?.managed && dashboard.data.team);

  /** Bekleyen davet/başvuru sayacı — `app/davetler.tsx` ile aynı önbellek. */
  const joins = useQuery({
    queryKey: ["takim", "join-requests"],
    queryFn: getJoinRequests,
    enabled: managed,
    staleTime: 60_000,
    retry: false,
  });

  /** Açık transfer teklifleri — yetki yoksa sessizce boş kalır. */
  const offers = useQuery({
    queryKey: ["takim", "offers-outbox"],
    queryFn: getOfferOutbox,
    enabled: managed,
    staleTime: 60_000,
    retry: false,
  });

  const teamId = dashboard.data?.team?.id ?? null;
  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };

  const standings = useQuery({
    queryKey: queryKeys.standings(scopeKey),
    queryFn: () =>
      getStandings({
        cityId: scope.cityId as number,
        leagueId: scope.leagueId as number,
        seasonId: scope.seasonId as number,
      }),
    enabled: scope.ready && teamId != null,
    staleTime: 60_000,
    retry: false,
  });

  /* ------------------------------ TÜRETİLENLER --------------------------- */

  const rank = useMemo(() => {
    if (teamId == null || !standings.data) return null;
    const index = standings.data.findIndex((row) => Number(row.team_id) === Number(teamId));
    return index >= 0 ? index + 1 : null;
  }, [standings.data, teamId]);

  const pendingInbox = useMemo(
    () => (joins.data?.inbox ?? []).filter((item) => item.status === "pending"),
    [joins.data]
  );
  const pendingOutbox = useMemo(
    () => (joins.data?.outbox ?? []).filter((item) => item.status === "pending"),
    [joins.data]
  );
  const activeOffers = useMemo(
    () => (offers.data?.items ?? []).filter((item) => ACTIVE_OFFER_STATUSES.has(item.status)),
    [offers.data]
  );

  const data = dashboard.data;
  const contracted = data?.roster.contracted ?? [];
  const withoutContract = data?.roster.withoutContract ?? [];
  const squadSize = contracted.length + withoutContract.length;
  const pendingChanges = data?.pendingChanges ?? [];

  /* -------------------------------- EYLEMLER ----------------------------- */

  const refreshAll = useCallback(() => {
    void dashboard.refetch();
    if (managed) {
      void joins.refetch();
      void offers.refetch();
    }
    if (scope.ready && teamId != null) void standings.refetch();
  }, [dashboard, joins, managed, offers, scope.ready, standings, teamId]);

  const refresh = useRefresh(refreshAll, { refreshing: dashboard.isRefetching });
  const refreshControl = (
    <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
  );

  const openTeam = useCallback(() => {
    if (teamId != null) router.push(`/takim/${teamId}`);
  }, [router, teamId]);

  const openChanges = useCallback(() => setChangesOpen(true), []);
  const closeChanges = useCallback(() => setChangesOpen(false), []);

  const goto = useCallback((href: Href) => router.push(href), [router]);

  /* ------------------------- YAPILACAKLAR ŞERİDİ -------------------------- */

  const todos = useMemo<TodoItem[]>(() => {
    const list: TodoItem[] = [];

    if (pendingInbox.length > 0) {
      list.push({
        key: "basvuru",
        icon: "mail-unread",
        title: "Yanıt bekleyen başvuru",
        subtitle: "Kadrona katılmak isteyen oyuncular",
        count: pendingInbox.length,
        tone: "live",
        href: "/davetler",
      });
    }
    if (pendingOutbox.length > 0) {
      list.push({
        key: "davet",
        icon: "paper-plane",
        title: "Gönderilen davet",
        subtitle: "Oyuncunun yanıtı bekleniyor",
        count: pendingOutbox.length,
        tone: "info",
        href: "/davetler",
      });
    }
    if (withoutContract.length > 0) {
      list.push({
        key: "imzasiz",
        icon: "document-text",
        title: "Sözleşmesiz oyuncu",
        subtitle: "Kadroda ama aktif sözleşmesi yok",
        count: withoutContract.length,
        tone: "warn",
        href: "/takimim/kadro",
      });
    }
    if (activeOffers.length > 0) {
      list.push({
        key: "teklif",
        icon: "swap-horizontal",
        title: "Açık transfer teklifi",
        subtitle: "Gönderdiğin, hâlâ sonuçlanmamış teklifler",
        count: activeOffers.length,
        tone: "brand",
        href: "/takimim/kadro?gorunum=sezon",
      });
    }
    if (pendingChanges.length > 0) {
      list.push({
        key: "talep",
        icon: "hourglass",
        title: "Onay bekleyen değişiklik",
        subtitle: "Yönetici incelemesindeki taleplerin",
        count: pendingChanges.length,
        tone: "warn",
        onPress: openChanges,
      });
    }
    return list;
  }, [
    activeOffers.length,
    openChanges,
    pendingChanges.length,
    pendingInbox.length,
    pendingOutbox.length,
    withoutContract.length,
  ]);

  /* --------------------------------- ÇİZİM ------------------------------- */

  if (!user) {
    return <Redirect href="/giris" />;
  }

  const header = <ScreenHeader title="Takım Panelim" back scrollY={scrollY} />;

  if (!hasTeamScope) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="shield-outline"
          title="Takım başkanlığı gerekli"
          body="Bu alan, bir takımın yönetimini üstlenen başkanlara özeldir. Takımını sahiplenmek veya yeni takım kurmak için elitlig.com üzerinden takım yönetimi başvurusu yapabilirsin."
        />
      </SafeAreaView>
    );
  }

  if (dashboard.isLoading && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <View style={styles.loading}>
          <SkeletonCard lines={3} />
          <SkeletonListRow count={6} />
        </View>
      </SafeAreaView>
    );
  }

  if (dashboard.isError && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <ErrorState error={dashboard.error} onRetry={dashboard.refetch} />
      </SafeAreaView>
    );
  }

  if (data && !managed) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="shield-outline"
          title={data.onboarding?.title ?? "Henüz bir takım yönetmiyorsun"}
          body={
            data.onboarding?.description ??
            "Takım yönetimi başvurusu elitlig.com üzerinden yapılır."
          }
        />
      </SafeAreaView>
    );
  }

  const team = data?.team ?? null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}
      >
        {/* Bayat veri ekrandayken hata bandı — veri silinmez. */}
        {dashboard.isError ? (
          <ErrorState
            error={dashboard.error}
            onRetry={dashboard.refetch}
            variant="banner"
            style={styles.banner}
          />
        ) : null}

        {team ? (
          <TeamHero
            name={team.team_name}
            logo={mediaUrl(team.logo)}
            league={team.current_league}
            season={team.current_season}
            city={team.city}
            points={team.team_points ?? null}
            rank={rank}
            onPress={openTeam}
          />
        ) : null}

        {/* KPI şeridi — kulübün tek bakışta sayısal özeti. */}
        <View style={styles.kpiRow}>
          <StatTile label="KADRO" value={String(squadSize)} />
          <StatTile
            label="SÖZLEŞMELİ"
            value={String(contracted.length)}
            tone={withoutContract.length > 0 ? "warn" : "win"}
          />
          <StatTile
            label="G-B-M"
            value={
              team && team.team_wins != null
                ? `${team.team_wins ?? 0}-${team.team_draws ?? 0}-${team.team_losses ?? 0}`
                : "—"
            }
          />
          <StatTile
            label="AVERAJ"
            value={goalDiffLabel(team?.goals_scored, team?.goals_conceded)}
          />
        </View>

        {/* Yapılacaklar */}
        <SectionHeader
          title="Yapılacaklar"
          meta={todos.length > 0 ? `${todos.length} başlık` : undefined}
        />
        {todos.length === 0 ? (
          <View style={styles.clearCard}>
            <Ionicons name="checkmark-circle" size={18} color={colors.win} />
            <Text style={styles.clearText} {...textScale.dense}>
              Bekleyen işin yok. Kadro, sözleşmeler ve talepler güncel.
            </Text>
          </View>
        ) : (
          todos.map((item, index) => (
            <TodoRow
              key={item.key}
              item={item}
              position={rowPosition(index, todos.length)}
              onNavigate={goto}
            />
          ))
        )}

        {/* Alt ekranlar */}
        <SectionHeader title="Kulüp yönetimi" style={styles.navHeader} />
        {NAV_ITEMS.map((item, index) => (
          <NavRow
            key={item.key}
            item={item}
            position={rowPosition(index, NAV_ITEMS.length)}
            value={
              item.key === "kadro"
                ? `${squadSize}`
                : item.key === "davetler" && pendingInbox.length > 0
                  ? `${pendingInbox.length}`
                  : undefined
            }
            onNavigate={goto}
          />
        ))}
      </ScrollView>

      {/* Onay bekleyen değişiklik talepleri */}
      <BottomSheet
        visible={changesOpen}
        onClose={closeChanges}
        title="Onay bekleyen değişiklikler"
        snap="content"
      >
        <View style={styles.sheetBody}>
          {pendingChanges.length === 0 ? (
            <Text style={styles.sheetNote} {...textScale.long}>
              Bekleyen talep yok.
            </Text>
          ) : (
            pendingChanges.map((change, index) => (
              <ListRow
                key={change.id}
                leading={{ icon: "hourglass-outline", tone: "warn" }}
                title={CHANGE_LABELS[change.type] ?? change.type}
                subtitle={
                  change.created_at
                    ? `${formatDateShort(change.created_at)} tarihinde gönderildi`
                    : undefined
                }
                value="İnceleniyor"
                chevron={false}
                position={rowPosition(index, pendingChanges.length)}
              />
            ))
          )}
          <Text style={styles.sheetNote} {...textScale.long}>
            Talepler yönetici onayından sonra yayına alınır. Geri çekme işlemi şimdilik
            elitlig.com üzerinden yapılır.
          </Text>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Alt bileşenler
   ══════════════════════════════════════════════════════════════════════════ */

/** Takım kimlik kartı — dokununca herkese açık takım sayfasına iner. */
const TeamHero = React.memo(function TeamHero({
  name,
  logo,
  league,
  season,
  city,
  points,
  rank,
  onPress,
}: {
  name: string;
  logo: string | null;
  league: string | null;
  season: string | null;
  city: string | null;
  points: number | null;
  rank: number | null;
  onPress: () => void;
}) {
  const meta = [league, season].filter(Boolean).join(" · ") || city || "Lig bilgisi yok";

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} takım sayfası`}
      style={styles.hero}
    >
      <View style={styles.heroTop}>
        <TeamLogo name={name} logo={logo} size={layout.crestXl} />
        <View style={styles.heroBody}>
          <Text style={styles.heroName} numberOfLines={2} {...textScale.dense}>
            {upperTR(name)}
          </Text>
          <Text style={styles.heroMeta} numberOfLines={1} {...textScale.dense}>
            {meta}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </View>

      <View style={styles.heroStats}>
        <View style={styles.heroStat}>
          <Text style={styles.heroStatValue} {...textScale.dense}>
            {rank != null ? rank : "—"}
          </Text>
          <Text style={styles.heroStatLabel} {...textScale.badge}>
            SIRA
          </Text>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroStat}>
          <Text style={styles.heroStatValue} {...textScale.dense}>
            {points != null ? points : "—"}
          </Text>
          <Text style={styles.heroStatLabel} {...textScale.badge}>
            PUAN
          </Text>
        </View>
      </View>
    </Touchable>
  );
});

/** KPI kutucuğu — dört tanesi tek satırda yaşar. */
const StatTile = React.memo(function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  const color =
    tone === "win"
      ? colors.win
      : tone === "warn"
        ? colors.warn
        : tone === "brand"
          ? colors.brandAccent
          : colors.textPrimary;

  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]} numberOfLines={1} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

interface TodoItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  count: number;
  tone: Tone;
  href?: Href;
  onPress?: () => void;
}

/** Bekleyen iş satırı — sağda sayaç rozeti, varsa hedef ekrana iner. */
const TodoRow = React.memo(function TodoRow({
  item,
  position,
  onNavigate,
}: {
  item: TodoItem;
  position: "single" | "first" | "middle" | "last";
  onNavigate: (href: Href) => void;
}) {
  const handlePress = useCallback(() => {
    if (item.onPress) {
      item.onPress();
      return;
    }
    if (item.href) onNavigate(item.href);
  }, [item, onNavigate]);

  const leading = useMemo(() => ({ icon: item.icon, tone: item.tone }), [item.icon, item.tone]);
  const actionable = Boolean(item.href || item.onPress);

  return (
    <ListRow
      leading={leading}
      title={item.title}
      subtitle={item.subtitle}
      badge={<Badge label={String(item.count)} tone={item.tone} variant="solid" size="xs" />}
      chevron={actionable}
      position={position}
      onPress={actionable ? handlePress : undefined}
    />
  );
});

/** Alt ekran satırı. */
const NavRow = React.memo(function NavRow({
  item,
  position,
  value,
  onNavigate,
}: {
  item: NavItem;
  position: "single" | "first" | "middle" | "last";
  value?: string;
  onNavigate: (href: Href) => void;
}) {
  const handlePress = useCallback(() => onNavigate(item.href), [item.href, onNavigate]);
  const leading = useMemo(() => ({ icon: item.icon, tone: item.tone }), [item.icon, item.tone]);

  return (
    <ListRow
      leading={leading}
      title={item.title}
      subtitle={item.subtitle}
      value={value}
      position={position}
      onPress={handlePress}
    />
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xxxl,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
    gap: space.sm,
  },
  banner: {
    marginTop: space.sm,
  },

  /* Hero */
  hero: {
    marginTop: space.sm,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    padding: space.md,
    gap: space.md,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  heroBody: {
    flex: 1,
    gap: 2,
  },
  heroName: {
    ...type.h1,
    color: colors.textPrimary,
  },
  heroMeta: {
    ...type.caption,
    color: colors.textSecondary,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    paddingTop: space.md,
  },
  heroStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  heroDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.separator,
  },
  heroStatValue: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  heroStatLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* KPI şeridi */
  kpiRow: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.sm,
  },
  tile: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    paddingVertical: space.m,
    paddingHorizontal: space.xs,
  },
  tileValue: {
    ...type.tableNumStrong,
    fontSize: 15,
    lineHeight: 19,
  },
  tileLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* Yapılacaklar */
  clearCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    padding: space.md,
  },
  clearText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },

  navHeader: {
    marginTop: space.sm,
  },

  /* Alt sayfa */
  sheetBody: {
    gap: space.xs,
    paddingBottom: space.sm,
  },
  sheetNote: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: layout.rowPaddingH,
    paddingTop: space.sm,
  },
});
