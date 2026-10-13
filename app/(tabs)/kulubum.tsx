/**
 * KULÜBÜM — takım, oyuncu ve lig yönetiminin TEK kapısı (alt çubuğun 4. sekmesi).
 *
 * NEDEN AYRI SEKME: yönetim araçları eskiden Profil sekmesindeki uzun bir
 * satır listesinin ("Kulübüm", "Kariyerim") içindeydi; Takım Panelim → Kadro
 * gibi bir iş için önce Profil'e, sonra panele, sonra alt ekrana inmek
 * gerekiyordu. Kulübüm bunu iki dokunuşa indirir: sekme → iş karosu.
 *
 * ROLE GÖRE BÖLÜMLER (bir hesap birden fazlasına sahip olabilir):
 *   · Takım başkanı → Takım kartı (sıra, kadro, bekleyen işler) + "Takım
 *     Yönetimi" ızgarası: kadro, transfer, davetler, maç merkezi, maç al,
 *     kasa, mesajlar, takım sayfası.
 *   · Oyuncu        → Oyuncu kartı + "Oyuncu Kariyerim" ızgarası: profil,
 *     maçlarım, teklifler, sözleşmeler, disiplin, davetler.
 *   · Yönetim       → "Lig Yönetimi" ızgarası: panel, görevler, maçlar,
 *     sahalar, mesajlar, sohbet.
 *   · Herkes        → Takip ettiğim takımlar şeridi (misafirde de çalışır).
 *
 * Karo rozetleri gerçek bekleyen sayılardır (başvuru, sözleşmesiz oyuncu,
 * açık teklif, okunmamış mesaj); sayı yoksa rozet çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Avatar,
  Button,
  GradientFill,
  HubGrid,
  HubTile,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { getPanelMe } from "@/lib/api/panel";
import { getStandings } from "@/lib/api/standings";
import { getJoinRequests, getTeamDashboard } from "@/lib/api/team";
import { mediaUrl } from "@/lib/format";
import { get } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, fonts, layout, radius, space, textScale, type } from "@/theme";

const PRESIDENT_PROFILES = new Set(["takim_baskani", "double"]);
const ACTIVE_OFFER_STATUSES = new Set(["DRAFT", "SENT", "REVISION_REQUESTED"]);

/** Takım panelindeki sayaçla AYNI uç ve AYNI önbellek anahtarı. */
const getOfferOutbox = () =>
  get<{ items: { id: number; status: string }[]; totalItems: number }>("/api/transfer-offers/outbox", {
    limit: 100,
  });

export default function ClubHubScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const unread = useUnreadCount();
  const { favorites } = useFavorite();
  const { scrollY, scrollProps } = useHeaderScroll();

  const user = auth.user;
  const isPresident = Boolean(
    user && (user.managed_team_id || PRESIDENT_PROFILES.has(String(user.profile_type ?? ""))),
  );
  const isPlayer = Boolean(user?.player_id);

  const go = useCallback((href: string) => router.push(href as Href), [router]);

  /* ------------------------------- VERİ -------------------------------- */

  const meQuery = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
  });

  const dashboard = useQuery({
    queryKey: ["takim", "dashboard"],
    queryFn: getTeamDashboard,
    enabled: isPresident,
    staleTime: 60_000,
    retry: false,
  });
  const managed = Boolean(dashboard.data?.managed && dashboard.data.team);

  const joins = useQuery({
    queryKey: ["takim", "join-requests"],
    queryFn: getJoinRequests,
    enabled: managed,
    staleTime: 60_000,
    retry: false,
  });

  const offers = useQuery({
    queryKey: ["takim", "offers-outbox"],
    queryFn: getOfferOutbox,
    enabled: managed,
    staleTime: 60_000,
    retry: false,
  });

  const team = dashboard.data?.team ?? null;
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
    enabled: scope.ready && team != null,
    staleTime: 60_000,
    retry: false,
  });

  const standing = useMemo(() => {
    if (!team || !standings.data) return null;
    const index = standings.data.findIndex((row) => Number(row.team_id) === Number(team.id));
    return index >= 0 ? { rank: index + 1, row: standings.data[index] } : null;
  }, [standings.data, team]);

  const roster = dashboard.data?.roster;
  const squadSize = (roster?.contracted.length ?? 0) + (roster?.withoutContract.length ?? 0);
  const withoutContract = roster?.withoutContract.length ?? 0;
  const pendingInbox = (joins.data?.inbox ?? []).filter((item) => item.status === "pending").length;
  const activeOffers = (offers.data?.items ?? []).filter((item) => ACTIVE_OFFER_STATUSES.has(item.status)).length;
  const pendingChanges = dashboard.data?.pendingChanges?.length ?? 0;

  const me = meQuery.data;
  const player = me?.player ?? null;
  const playerTeam = me?.playerTeam ?? null;

  const refreshAll = useCallback(() => {
    if (user) void meQuery.refetch();
    if (isPresident) void dashboard.refetch();
    if (managed) {
      void joins.refetch();
      void offers.refetch();
    }
  }, [dashboard, isPresident, joins, managed, meQuery, offers, user]);
  const refresh = useRefresh(refreshAll, { refreshing: meQuery.isRefetching || dashboard.isRefetching });

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
      />

      <ScrollView
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
        ) : null}

        {/* ── TAKIM YÖNETİMİ ─────────────────────────────────────────── */}
        {isPresident ? (
          <>
            <SectionHeader title="Takımım" meta={team ? undefined : "Başkan"} />
            {dashboard.isLoading ? (
              <View style={styles.pad}>
                <SkeletonCard lines={3} />
              </View>
            ) : team ? (
              <IdentityCard
                kind="team"
                name={team.team_name}
                image={mediaUrl(team.logo)}
                context={[scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ") || "Takım"}
                facts={[
                  { label: "SIRA", value: standing ? `${standing.rank}.` : "—" },
                  { label: "PUAN", value: standing ? String(standing.row.display_points) : "—" },
                  { label: "KADRO", value: String(squadSize) },
                  { label: "BEKLEYEN", value: String(pendingInbox + withoutContract + pendingChanges) },
                ]}
                onPress={() => go(`/takim/${team.id}`)}
                actionLabel="Takım Paneli"
                onAction={() => go("/takimim")}
              />
            ) : (
              <InfoCard
                icon="shield-outline"
                title="Takım bulunamadı"
                body="Hesabına bağlı yönetilen bir takım görünmüyor. Takım Paneli'nden durumu kontrol edebilirsin."
                actionLabel="Takım Paneli"
                onAction={() => go("/takimim")}
              />
            )}

            <SectionHeader title="Takım Yönetimi" />
            <HubGrid>
              <HubTile
                icon="people"
                title="Kadro"
                subtitle={withoutContract ? `${withoutContract} sözleşmesiz oyuncu` : "Oyuncu ekle, forma, mevki"}
                badge={withoutContract}
                tone={withoutContract ? "warn" : "brand"}
                onPress={() => go("/takimim/kadro")}
              />
              <HubTile
                icon="swap-horizontal"
                title="Transfer"
                subtitle={activeOffers ? `${activeOffers} açık teklif` : "Oyuncu ara, teklif, sezon kadrosu"}
                badge={activeOffers}
                tone="accent"
                onPress={() => go("/takimim/kadro?gorunum=sezon")}
              />
              <HubTile
                icon="mail-unread"
                title="Davet & Başvuru"
                subtitle={pendingInbox ? `${pendingInbox} yanıt bekliyor` : "Davetler ve katılım istekleri"}
                badge={pendingInbox}
                tone="live"
                onPress={() => go("/davetler")}
              />
              <HubTile
                icon="clipboard"
                title="Maç Merkezi"
                subtitle="Fikstür, yoklama, maç karnesi"
                tone="info"
                onPress={() => go("/takimim/mac-merkezi")}
              />
              <HubTile
                icon="calendar"
                title="Maç Al"
                subtitle="Boş saat seç, talep gönder"
                tone="win"
                onPress={() => go("/takimim/mac-al")}
              />
              <HubTile
                icon="wallet"
                title="Kulüp Kasası"
                subtitle="Gelir, gider, kadro değeri"
                tone="warn"
                onPress={() => go("/takimim/kasa")}
              />
              <HubTile
                icon="chatbubbles"
                title="Takım Mesajları"
                subtitle="Grup, oyuncular, yönetim"
                badge={unread.messages}
                tone="brand"
                onPress={() => go("/sohbet")}
              />
              <HubTile
                icon="hourglass"
                title="Onay Bekleyenler"
                subtitle={pendingChanges ? `${pendingChanges} değişiklik talebi` : "Yönetici incelemesi yok"}
                badge={pendingChanges}
                tone="neutral"
                onPress={() => go("/takimim")}
              />
            </HubGrid>
          </>
        ) : null}

        {/* ── OYUNCU KARİYERİ ───────────────────────────────────────── */}
        {isPlayer ? (
          <>
            <SectionHeader title="Oyuncu Profilim" />
            {meQuery.isLoading ? (
              <View style={styles.pad}>
                <SkeletonCard lines={2} />
              </View>
            ) : (
              <IdentityCard
                kind="player"
                name={player?.player_name ?? user?.fullName ?? user?.username ?? "Oyuncu"}
                image={mediaUrl(player?.player_img)}
                context={[player?.player_position, playerTeam?.team_name].filter(Boolean).join(" · ") || "Oyuncu"}
                facts={[
                  { label: "MAÇ", value: String(me?.stats?.matches ?? 0) },
                  { label: "GOL", value: String(me?.stats?.goals ?? 0) },
                  { label: "ASİST", value: String(me?.stats?.assists ?? 0) },
                  { label: "KART", value: String((me?.stats?.yellow_cards ?? 0) + (me?.stats?.red_cards ?? 0)) },
                ]}
                onPress={() => go(player?.id ? `/oyuncu/${player.id}` : "/oyuncum")}
                actionLabel="Oyuncu Paneli"
                onAction={() => go("/oyuncum")}
              />
            )}

            <SectionHeader title="Kariyerim" />
            <HubGrid>
              <HubTile icon="football" title="Maçlarım" subtitle="Kadro, yoklama, performans" tone="brand" onPress={() => go("/oyuncum?tab=maclarim")} />
              <HubTile icon="swap-horizontal" title="Tekliflerim" subtitle="Gelen transfer teklifleri" tone="accent" onPress={() => go("/tekliflerim")} />
              <HubTile icon="document-text" title="Sözleşmelerim" subtitle="Aktif ve geçmiş" tone="info" onPress={() => go("/sozlesmelerim")} />
              <HubTile icon="alert-circle" title="Disiplin" subtitle="Savunma ve itiraz" tone="warn" onPress={() => go("/cezalarim")} />
              <HubTile icon="git-pull-request" title="Davetlerim" subtitle="Takım davetleri, başvurular" tone="live" onPress={() => go("/davetler")} />
              {playerTeam ? (
                <HubTile icon="shield" title="Takımım" subtitle={playerTeam.team_name} tone="neutral" onPress={() => go(`/takim/${playerTeam.id}`)} />
              ) : null}
            </HubGrid>
          </>
        ) : null}

        {/* ── TAKIMI/OYUNCUSU OLMAYAN ÜYE ──────────────────────────────── */}
        {user && !isPresident && !isPlayer ? (
          <InfoCard
            icon="people-circle-outline"
            title="Henüz bir kulübe bağlı değilsin"
            body="Bir takımdan gelen daveti kabul et ya da takım kurmak için yönetimle iletişime geç."
            actionLabel="Davetlerim"
            onAction={() => go("/davetler")}
            secondaryLabel="İletişim"
            onSecondary={() => go("/iletisim")}
          />
        ) : null}

        {/* ── LİG YÖNETİMİ ──────────────────────────────────────────── */}
        {auth.isManagement ? (
          <>
            <SectionHeader title="Lig Yönetimi" action={{ label: "Panel", onPress: () => go("/yonetim") }} />
            <HubGrid>
              <HubTile icon="checkbox" title="Görevlerim" subtitle="Atanan ve açık görevler" tone="brand" onPress={() => go("/yonetim/gorevler")} />
              <HubTile icon="football" title="Maç Yönetimi" subtitle="Skor, durum, yayınlama" tone="live" onPress={() => go("/yonetim/maclar")} />
              <HubTile icon="location" title="Saha Yönetimi" subtitle="Talepler, haftalık program" tone="info" onPress={() => go("/yonetim/sahalar")} />
              <HubTile icon="mail" title="Başvurular" subtitle="Üye mesajları" tone="warn" onPress={() => go("/yonetim/mesajlar")} />
              <HubTile icon="chatbubbles" title="Yönetim Sohbeti" subtitle="Üyelerle yazışma" tone="accent" onPress={() => go("/yonetim/sohbet")} />
              <HubTile icon="grid" title="Tüm Araçlar" subtitle="Web panelinin modülleri" tone="neutral" onPress={() => go("/yonetim")} />
            </HubGrid>
          </>
        ) : null}

        {/* ── TAKİP ETTİĞİM TAKIMLAR ────────────────────────────────── */}
        <SectionHeader
          title="Takip ettiğim takımlar"
          meta={favorites.length ? `${favorites.length} takım` : undefined}
          action={{ label: "Yönet", onPress: () => go("/(tabs)/favoriler?tab=takimlar") }}
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
                <TeamLogo name={fav.name} logo={fav.logo} size={44} />
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
              <Ionicons name="add" size={26} color={colors.brandAccent} />
              <Text style={[styles.followName, styles.followAddText]} {...textScale.badge}>
                Takım ekle
              </Text>
            </Touchable>
          </ScrollView>
        ) : (
          <InfoCard
            icon="star-outline"
            title="Takım takip etmiyorsun"
            body="Takip ettiğin takımların maçları öne çıkar, gol ve sonuç bildirimleri gelir."
            actionLabel="Takım seç"
            onAction={() => go("/(tabs)/ligler?tab=takimlar")}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════════ PARÇALAR ═══════════════════════════════ */

const IdentityCard = React.memo(function IdentityCard({
  kind,
  name,
  image,
  context,
  facts,
  onPress,
  actionLabel,
  onAction,
}: {
  kind: "team" | "player";
  name: string;
  image: string | null;
  context: string;
  facts: { label: string; value: string }[];
  onPress: () => void;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${context}`}
      style={styles.identity}
    >
      <GradientFill tone="ink" radius="xxl" />
      <View style={styles.identityTop}>
        {kind === "team" ? (
          <TeamLogo name={name} logo={image} size={56} />
        ) : (
          <Avatar name={name} image={image} size={56} ring="brand" />
        )}
        <View style={styles.identityTexts}>
          <Text style={styles.identityName} numberOfLines={1} {...textScale.dense}>
            {name}
          </Text>
          <Text style={styles.identityContext} numberOfLines={1} {...textScale.dense}>
            {context}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.onDarkMuted} />
      </View>

      <View style={styles.facts}>
        {facts.map((fact) => (
          <View key={fact.label} style={styles.fact}>
            <Text style={styles.factValue} numberOfLines={1} {...textScale.badge}>
              {fact.value}
            </Text>
            <Text style={styles.factLabel} {...textScale.badge}>
              {fact.label}
            </Text>
          </View>
        ))}
      </View>

      <Button label={actionLabel} onPress={onAction} variant="secondary" size="sm" icon="settings-outline" onDark fullWidth />
    </Touchable>
  );
});

const InfoCard = React.memo(function InfoCard({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={styles.info}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={22} color={colors.brandAccent} />
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
      <Ionicons name="shield-half" size={30} color={colors.brandOnDark} />
      <Text style={styles.guestTitle} {...textScale.dense}>
        Kulübünü cebinden yönet
      </Text>
      <Text style={styles.guestBody} {...textScale.long}>
        Kadro, transfer, maç talepleri, kasa ve oyuncu kariyerin tek yerde. Başkan ve oyuncu
        araçları giriş yapınca burada açılır.
      </Text>
      <View style={styles.guestPoints}>
        {[
          ["people", "Kadro ve sözleşmeler"],
          ["swap-horizontal", "Transfer teklifleri"],
          ["calendar", "Maç al, yoklama, maç karnesi"],
          ["wallet", "Kulüp kasası"],
        ].map(([icon, label]) => (
          <View key={label} style={styles.guestPoint}>
            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={14} color={colors.brandOnDark} />
            <Text style={styles.guestPointText} {...textScale.dense}>
              {label}
            </Text>
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
  flex: { flex: 1 },

  identity: {
    marginHorizontal: layout.screenPadding,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
  },
  identityTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  identityTexts: { flex: 1, minWidth: 0, gap: 2 },
  identityName: {
    ...type.display,
    color: colors.onDark,
  },
  identityContext: {
    ...type.bodySm,
    color: colors.onDarkMuted,
  },
  facts: {
    flexDirection: "row",
    gap: space.s,
  },
  fact: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.inkTileBorder,
  },
  factValue: {
    ...type.metricSm,
    color: colors.onDark,
  },
  factLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },

  info: {
    marginHorizontal: layout.screenPadding,
    padding: space.lg,
    gap: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: { ...type.h2, color: colors.textPrimary },
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
  guestTitle: { ...type.display, color: colors.onDark },
  guestBody: { ...type.body, color: colors.onDarkMuted },
  guestPoints: { gap: space.s, marginVertical: space.xs },
  guestPoint: { flexDirection: "row", alignItems: "center", gap: space.sm },
  guestPointText: { ...type.bodySm, fontFamily: fonts.medium, color: colors.onDark },
  guestActions: { flexDirection: "row", gap: space.sm, marginTop: space.sm },

  follows: {
    paddingHorizontal: layout.screenPadding,
    gap: space.m,
  },
  followTile: {
    width: 96,
    alignItems: "center",
    gap: space.s,
    paddingVertical: space.md,
    paddingHorizontal: space.s,
    borderRadius: radius.xl,
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
