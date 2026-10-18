/**
 * MENÜ sekmesi — uygulamanın her köşesine giden tek liste (eski Profil).
 *
 * DÜZEN (yukarıdan aşağı):
 *   1. ÜYE PROFİLİ — kimlik sahnesi (ProfileHero): ad, roller, takip
 *      sayıları (her sayı Takip ettiklerin ekranını açar). Misafirde giriş /
 *      üyelik çağrısı.
 *   2. Oyun karoları — Günün Testi ve Oyun merkezi.
 *   3. Mesajlar kısayolu (girişli) — okunmamış toplamıyla; alt menüdeki
 *      Mesajlar sekmesini açar.
 *   4. Takip · Keşfet (canlı, takım ve oyuncu karşılaştırma, rekorlar, arama)
 *      · Bilgi ve destek · Ayarlar (bildirim türleri, hesap, hesabı sil).
 *   5. Dipte sosyal hesaplar ve sürüm.
 *
 * Takip ettiklerin artık alt menüde değil (yer Mesajlar'a açıldı); burada
 * ilk grupta durur. Rol araçları (Takım paneli, oyuncu paneli, yönetim)
 * YÖNETİM sekmesindedir.
 *
 * NEDEN SectionList: satırların sayısı role göre değişir; SectionList +
 * memo'lu satır rozet güncellemelerinde daha az yeniden çizer.
 *
 * GİRİŞSİZ: kimlik kartı yerine giriş çağrısı çizilir; Mesajlar satırı hiç
 * üretilmez. Takip sayıları ve Günün Testi cihazda saklandığı için misafirde
 * de gerçektir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  HubGrid,
  HubTile,
  ListRow,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type Tone,
} from "@/components/ui";
import { ProfileHero, type ProfileHeroStat } from "@/components/account/ProfileHero";
import { unreadBadgeLabel, useUnreadCount } from "@/hooks/useUnreadCount";
import { getPanelMe } from "@/lib/api/panel";
import { formatNumber, mediaUrl } from "@/lib/format";
import { openLink } from "@/lib/links";
import { instagramUrl } from "@/lib/socials";
import { youtubeChannelUrl } from "@/lib/youtube";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/** Web sitesi — üyelik, şifre sıfırlama ve kurumsal sayfalar orada yaşıyor. */
const SITE_URL = "https://elitlig.com";

/** Takım başkanı sayılan profil tipleri (sunucudaki `profile_type` değerleri). */
const PRESIDENT_PROFILES = new Set(["takim_baskani", "double"]);

/** Satırın dokunulduğunda ne yapacağı — hepsi tek `onSelect` içinde çözülür. */
type MenuAction =
  | { kind: "route"; route: string }
  | { kind: "link"; url: string };

interface MenuItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** Sağda gri metin (şehir adı, görünüm tercihi, favori sayısı). */
  value?: string;
  /** Sağda menekşe sayaç rozeti (okunmamış bildirim + mesaj). */
  badge?: string;
  /** Sol ikonun tonu — varsayılan nötr gri. */
  tone?: Tone;
  destructive?: boolean;
  action: MenuAction;
}

interface MenuSection {
  key: string;
  /** Başlıksız grup (çıkış satırı) için boş bırakılır. */
  title?: string;
  data: MenuItem[];
}

/** Günün Testi'nin o güne ait sonucu — app/gunun.tsx ile AYNI anahtar (UTC gün). */
const dailyResultKey = (day: string) => `elitlig.gunun.${day}.v1`;

/* ============================== SAF YARDIMCILAR ============================= */

/** Grup içi konum — ListRow köşe yuvarlamasını ve ayracı buradan alır. */
function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Günün Testi sonucu → "7/10 doğru"; bozuk ya da yoksa null. */
function parseDaily(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { correct?: unknown };
    const correct = Number(parsed.correct);
    return Number.isFinite(correct) ? `${formatNumber(correct)}/10 doğru` : null;
  } catch {
    return null;
  }
}

/**
 * Sürüm satırı: "ElitLig Mobil v1.0.0 (12)".
 * Yayın (build) numarası yalnız derlenmiş uygulamada bulunur; Expo Go'da
 * okunamadığında parantez hiç yazılmaz.
 */
function versionLabel(): string {
  const version = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "";
  const build = Constants.nativeBuildVersion;
  if (!version) return "ElitLig Mobil";
  return build ? `ElitLig Mobil v${version} (${build})` : `ElitLig Mobil v${version}`;
}

/* ================================= EKRAN ================================== */

export default function MenuTabScreen() {
  const auth = useAuth();
  const scope = useScope();
  const favorite = useFavorite();
  const router = useRouter();
  const queryClient = useQueryClient();
  const unread = useUnreadCount();
  const { scrollY, scrollProps } = useHeaderScroll();

  const user = auth.user;

  /**
   * Kimlik kartının avatarı ve takım amblemi için panel özeti.
   * Anahtar `["panel","me"]` — /hesabim ile AYNI önbellek. Panel rolü olmayan
   * hesapta sunucu 403 döndürür; kart o zaman sadece harf yedeğiyle çizilir.
   */
  const meQuery = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
  });

  /**
   * Günün Testi'nin bugünkü sonucu — cihazdan (app/gunun.tsx yazar). Odakta
   * yeniden okunur: oyundan dönünce karo "oynadın" demeli.
   */
  const [dailyDone, setDailyDone] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const today = new Date().toISOString().slice(0, 10);
      let alive = true;
      AsyncStorage.getItem(dailyResultKey(today))
        .then((raw) => {
          if (alive) setDailyDone(parseDaily(raw));
        })
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, [])
  );

  /**
   * Aşağı çekince rozetler ve kimlik kartı tazelenir. Misafirde tazelenecek
   * sunucu verisi olmadığı için gösterge hiç bağlanmaz.
   */
  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifCount() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.chatUnread() });
    void meQuery.refetch();
  }, [meQuery, queryClient]);

  const refresh = useRefresh(refreshAll, { refreshing: meQuery.isRefetching });
  /**
   * `refresh.control` düğümünün tipi `ReactElement<unknown>`; RN'in
   * `refreshControl` prop'u `ReactElement<RefreshControlProps>` bekler. Aynı
   * davranış kancanın alanlarıyla ve ortak renk sözlüğüyle kurulur.
   */
  const refreshControl = (
    <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
  );

  const me = meQuery.data;
  const teamCard = me?.team ?? me?.playerTeam ?? null;
  const teamName = teamCard?.team_name ?? user?.teamName ?? null;

  const isPresident = Boolean(
    user && (user.managed_team_id || PRESIDENT_PROFILES.has(String(user.profile_type ?? "")))
  );
  const isPlayer = Boolean(user?.player_id);

  /* ------------------------------ EYLEMLER ------------------------------- */

  const onSelect = useCallback(
    (item: MenuItem) => {
      switch (item.action.kind) {
        case "route":
          router.push(item.action.route as never);
          return;
        case "link":
          void openLink(item.action.url);
      }
    },
    [router]
  );

  const openAccount = useCallback(() => router.push("/hesabim"), [router]);
  const openSignIn = useCallback(() => router.push("/giris"), [router]);
  // App Store 4 (Design): üyelik tarayıcıda değil, uygulama içindeki
  // /kayit ekranında açılır.
  const openRegister = useCallback(() => router.push("/kayit"), [router]);
  const openSettings = useCallback(() => router.push("/ayarlar"), [router]);
  const openDaily = useCallback(() => router.push("/gunun"), [router]);
  const openGames = useCallback(() => router.push("/(tabs)/oyunlar"), [router]);
  /** Bildirim yoksa ama sohbet varsa doğrudan Sohbetler kutusu; değilse Özet. */
  const openInbox = useCallback(() => {
    const kutu = unread.notifications === 0 && unread.messages > 0 ? "sohbetler" : "ozet";
    router.push(`/(tabs)/mesajlar?kutu=${kutu}`);
  }, [router, unread.messages, unread.notifications]);

  /* ------------------------------ SATIRLAR ------------------------------- */

  const favoriteScopeCount = favorite.favoriteLeagues.length + favorite.favoriteSeasons.length;
  const followCount = favorite.favorites.length + favoriteScopeCount + favorite.favoriteMatches.length;

  const igUrl = instagramUrl(scope.cityLabel);
  const channelUrl = youtubeChannelUrl(scope.cityLabel);

  /**
   * MENÜ BÖLÜMLERİ — takip, keşif, bilgi, ayarlar. Mesajlar ve oyunlar
   * listenin başlığında (kimliğin hemen altında) durur.
   */
  const sections = useMemo<MenuSection[]>(() => {
    const result: MenuSection[] = [];

    /* 1 — TAKİP (alt menüden buraya taşındı) */
    result.push({
      key: "takip",
      title: "Takip",
      data: [
        {
          key: "takip",
          icon: "star",
          title: "Takip ettiklerin",
          subtitle: "Takımların, liglerin ve maçların",
          value: followCount ? formatNumber(followCount) : undefined,
          tone: "brand",
          action: { kind: "route", route: "/(tabs)/takip" },
        },
        {
          key: "takip-bildirim",
          icon: "notifications",
          title: "Takip bildirimleri",
          subtitle: "Hangi takip için hangi bildirim",
          action: { kind: "route", route: "/takip-bildirimleri" },
        },
      ],
    });

    /* 2 — KEŞFET */
    result.push({
      key: "kesfet",
      title: "Keşfet",
      data: [
        {
          key: "kariyer",
          icon: "ribbon",
          title: "Kariyerim",
          subtitle: "Elit Seviye, Elit Kart, rozetler ve görevler",
          action: { kind: "route", route: "/kariyer" },
        },
        {
          key: "saha-siralamasi",
          icon: "trophy",
          title: "Saha Sıralaması",
          subtitle: "Haftalık ve aylık · Türkiye ve il · oyuncular ve takımlar",
          action: { kind: "route", route: "/saha-siralamasi" },
        },
        {
          key: "tahmin-ligi",
          icon: "podium",
          title: "Tahmin Ligi",
          subtitle: "Liginin maçlarına skor tahmini yap",
          action: { kind: "route", route: "/tahmin-ligi" },
        },
        {
          key: "fantezi",
          icon: "people",
          title: "Fantezi ElitLig",
          subtitle: "Haftalık 5 kişilik kadronu kur",
          action: { kind: "route", route: "/fantezi" },
        },
        {
          key: "kulup-arenasi",
          icon: "shield",
          title: "Kulüp Arenası",
          subtitle: "Takımların arena yarışı ve derbi düellosu",
          action: { kind: "route", route: "/kulup-arenasi" },
        },
        {
          key: "sezon-ozeti",
          icon: "sparkles",
          title: "Sezon Özeti",
          subtitle: "Sezonunun paylaşılabilir hikâyesi",
          action: { kind: "route", route: "/sezon-ozeti" },
        },
        {
          key: "canli",
          icon: "radio",
          title: "Canlı maçlar",
          tone: "live",
          action: { kind: "route", route: "/(tabs)/skorlar?tab=canli&tum=1" },
        },
        {
          key: "siralama",
          icon: "podium",
          title: "Rekor tablosu",
          subtitle: "Oyun rekorları lider tablosu",
          action: { kind: "route", route: "/siralama" },
        },
        {
          key: "h2h",
          icon: "git-compare",
          title: "Takım karşılaştır",
          subtitle: "İki takımı yan yana koy",
          action: { kind: "route", route: "/h2h" },
        },
        {
          key: "oyuncu-karsilastir",
          icon: "people",
          title: "Oyuncu karşılaştır",
          subtitle: "Gol, maç, kart, piyasa değeri",
          action: { kind: "route", route: "/oyuncu-karsilastir" },
        },
        {
          key: "borsa",
          icon: "storefront",
          title: "Transfer borsası",
          subtitle: "Satılık ve kiralık oyuncular",
          action: { kind: "route", route: "/takimim/borsa" },
        },
        {
          key: "haftanin-enleri",
          icon: "trophy",
          title: "Haftanın enleri",
          subtitle: "Haftanın kadrosu ve ödülleri",
          action: { kind: "route", route: "/haftanin-enleri" },
        },
        {
          key: "ara",
          icon: "search",
          title: "Takım, oyuncu ara",
          action: { kind: "route", route: "/ara" },
        },
      ],
    });

    /* 3 — BİLGİ VE DESTEK. Sosyal hesaplar ve site liste satırı değil,
       listenin dibinde üç yuvarlak düğmedir (bkz. `listFooter`). */
    result.push({
      key: "bilgi",
      title: "Bilgi ve destek",
      data: [
        { key: "kurallar", icon: "book", title: "Lig kuralları", action: { kind: "route", route: "/kurallar" } },
        {
          key: "cezalar",
          icon: "hammer",
          title: "Cezalar",
          subtitle: "Disiplin talimatı ve kurul kararları",
          action: { kind: "route", route: "/cezalar" },
        },
        {
          key: "iletisim",
          icon: "call",
          title: "İletişim",
          subtitle: "Telefon, WhatsApp, e-posta",
          action: { kind: "route", route: "/iletisim" },
        },
      ],
    });

    /* 4 — AYARLAR (app/ayarlar.tsx). Hesabı sil oradaki "Oturum" grubunda
       da durur; App Store 5.1.1-v için girişli üyede Menü'nün en altında da
       doğrudan kapı olarak kalır (docs/magaza-inceleme.md §1). */
    result.push({
      key: "ayarlar",
      title: "Ayarlar",
      data: [
        {
          key: "ayarlar",
          icon: "settings",
          title: "Ayarlar",
          subtitle: user
            ? "Bildirimler, görünüm, lig, hesap ve güvenlik"
            : "Görünüm, lig ve bildirim seçimi",
          tone: "brand",
          action: { kind: "route", route: "/ayarlar" },
        },
        {
          key: "bildirim-tercihleri",
          icon: "notifications-circle",
          title: "Bildirim türleri",
          action: { kind: "route", route: "/bildirim-tercihleri" },
        },
        ...(user
          ? [
              {
                key: "hesabim",
                icon: "person-circle",
                title: "Hesabım",
                subtitle: "Profil bilgileri, şifre, roller",
                action: { kind: "route", route: "/hesabim" },
              } satisfies MenuItem,
              {
                key: "hesap-sil",
                icon: "trash",
                title: "Hesabı sil",
                subtitle: "Hesabını ve kişisel verilerini kalıcı olarak sil",
                tone: "danger",
                destructive: true,
                action: { kind: "route", route: "/hesap-sil" },
              } satisfies MenuItem,
            ]
          : []),
      ],
    });

    return result;
  }, [user, followCount]);

  /* ------------------------------ ÇİZİM ---------------------------------- */

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<MenuItem, MenuSection>) => (
      <MenuRow item={item} position={rowPosition(index, section.data.length)} onSelect={onSelect} />
    ),
    [onSelect]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: MenuSection }) =>
      /* İçerik kabı zaten 14px dolgu basıyor; başlık kendi dolgusunu basmaz. */
      section.title ? <SectionHeader title={section.title} inset="flush" /> : null,
    []
  );

  const renderSectionFooter = useCallback(() => <View style={styles.sectionGap} />, []);

  /**
   * KİMLİK SAHNESİNİN ÜÇ SAYISI — takip edilen takım · lig/sezon · maç.
   * Üçü de cihazda saklanır (FavoriteProvider), misafirde de gerçektir; her
   * sayı Takip sekmesini açar (Takip'e kısa yol).
   */
  const heroStats = useMemo<ProfileHeroStat[]>(
    () => [
      {
        key: "takim",
        label: "Takım",
        value: favorite.favorites.length,
        onPress: () => router.push("/(tabs)/takip?tab=takimlar"),
      },
      {
        key: "lig",
        label: "Lig · sezon",
        value: favoriteScopeCount,
        onPress: () => router.push("/(tabs)/takip?tab=ligler"),
      },
      {
        key: "mac",
        label: "Maç",
        value: favorite.favoriteMatches.length,
        onPress: () => router.push("/(tabs)/takip?tab=maclar"),
      },
    ],
    [favorite.favoriteMatches.length, favorite.favorites.length, favoriteScopeCount, router]
  );

  const heroUser = useMemo(() => {
    if (!user) return null;
    const roles: { key: string; label: string }[] = [];
    if (auth.isManagement) roles.push({ key: "yonetim", label: "Yönetim" });
    if (isPresident) roles.push({ key: "baskan", label: "Başkan" });
    if (isPlayer) roles.push({ key: "oyuncu", label: "Oyuncu" });
    return {
      name: user.fullName ?? user.username,
      username: user.username,
      avatar: mediaUrl(me?.player?.player_img),
      teamName,
      teamLogo: mediaUrl(teamCard?.logo),
      roles,
    };
  }, [auth.isManagement, isPlayer, isPresident, me?.player?.player_img, teamCard?.logo, teamName, user]);

  /** Mesajlar satırının alt metni: "3 bildirim · 1 mesaj" / "Hepsi okundu". */
  const inboxSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (unread.notifications > 0) parts.push(`${formatNumber(unread.notifications)} bildirim`);
    if (unread.messages > 0) parts.push(`${formatNumber(unread.messages)} mesaj`);
    return parts.length ? `${parts.join(" · ")} okunmadı` : "Sohbetler, istekler, bildirimler · hepsi okundu";
  }, [unread.messages, unread.notifications]);

  const inboxBadge = unreadBadgeLabel(unread.total);

  const listHeader = useMemo(
    () => (
      <>
        <SectionHeader title="Üye profili" inset="flush" />
        {auth.initializing ? (
          <Skeleton height={196} radius="xxl" style={styles.heroSkeleton} />
        ) : (
          <ProfileHero
            user={heroUser}
            stats={heroStats}
            onAccount={openAccount}
            onSignIn={openSignIn}
            onRegister={openRegister}
          />
        )}

        {/* Oyunlar: Günün Testi kimliğin hemen altında; oyun merkezi yanında. */}
        <HubGrid inset="flush" style={styles.games}>
          <HubTile
            icon="bulb"
            title="Günün Testi"
            subtitle={dailyDone ? `Bugün oynadın · ${dailyDone}` : "Bugünün 10 sorusu seni bekliyor"}
            tone="brand"
            onPress={openDaily}
          />
          <HubTile
            icon="game-controller"
            title="Oyunlar"
            subtitle="Penaltı, Arena, Kim Bu? ve daha fazlası"
            tone="win"
            onPress={openGames}
          />
        </HubGrid>

        {user ? (
          <ListRow
            leading={{ icon: "mail-unread", tone: "brand" }}
            title="Mesajlar"
            subtitle={inboxSubtitle}
            badge={inboxBadge ? <Badge label={inboxBadge} tone="brand" variant="solid" size="xs" /> : undefined}
            position="single"
            onPress={openInbox}
            accessibilityLabel={
              inboxBadge ? `Mesajlar, ${inboxBadge} okunmamış` : "Mesajlar, hepsi okundu"
            }
            style={styles.inbox}
          />
        ) : null}
        <View style={styles.sectionGap} />
      </>
    ),
    [
      auth.initializing,
      dailyDone,
      heroStats,
      heroUser,
      inboxBadge,
      inboxSubtitle,
      openAccount,
      openDaily,
      openGames,
      openInbox,
      openRegister,
      openSignIn,
      user,
    ]
  );

  const listFooter = useMemo(() => {
    const socials: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; url: string }[] = [];
    if (igUrl) socials.push({ key: "ig", icon: "logo-instagram", label: `Instagram, ${scope.cityLabel} hesabı`, url: igUrl });
    if (channelUrl) socials.push({ key: "yt", icon: "logo-youtube", label: "YouTube kanalı", url: channelUrl });
    socials.push({ key: "site", icon: "globe-outline", label: "elitlig.com", url: SITE_URL });
    return (
      <View style={styles.footer}>
        <View style={styles.socialRow}>
          {socials.map((item) => (
            <Touchable
              key={item.key}
              feedback="icon"
              haptic="selection"
              onPress={() => void openLink(item.url)}
              accessibilityRole="link"
              accessibilityLabel={item.label}
              style={styles.socialButton}
            >
              <Ionicons name={item.icon} size={20} color={colors.textSecondary} />
            </Touchable>
          ))}
        </View>
        <Text style={styles.version} {...textScale.dense}>
          {versionLabel()}
        </Text>
      </View>
    );
  }, [channelUrl, igUrl, scope.cityLabel]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Menü"
        scrollY={scrollY}
        actions={[{ icon: "settings-outline", onPress: openSettings, accessibilityLabel: "Ayarlar" }]}
      />

      <SectionList
        {...scrollProps}
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.content}
        refreshControl={user ? refreshControl : undefined}
        initialNumToRender={14}
      />
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================= */

/**
 * Menü satırı — `item` nesnesi useMemo'lu bölümlerden geldiği için referansı
 * sabittir; memo bu sayede yalnız rozet/değer değişince yeniden çizer.
 */
const MenuRow = React.memo(function MenuRow({
  item,
  position,
  onSelect,
}: {
  item: MenuItem;
  position: "single" | "first" | "middle" | "last";
  onSelect: (item: MenuItem) => void;
}) {
  const handlePress = useCallback(() => onSelect(item), [item, onSelect]);
  const leading = useMemo(() => ({ icon: item.icon, tone: item.tone }), [item.icon, item.tone]);

  return (
    <ListRow
      leading={leading}
      title={item.title}
      subtitle={item.subtitle}
      value={item.value}
      badge={item.badge ? <Badge label={item.badge} tone="brand" variant="solid" size="xs" /> : undefined}
      destructive={item.destructive}
      position={position}
      onPress={handlePress}
    />
  );
});

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xxl,
  },
  sectionGap: {
    height: layout.sectionGap,
  },

  heroSkeleton: {
    marginTop: space.xs,
  },
  games: {
    marginTop: space.md,
  },
  inbox: {
    marginTop: space.md,
  },

  footer: {
    alignItems: "center",
    gap: space.md,
    marginTop: space.xs,
  },
  socialRow: {
    flexDirection: "row",
    gap: space.md,
  },
  socialButton: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  version: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
});
