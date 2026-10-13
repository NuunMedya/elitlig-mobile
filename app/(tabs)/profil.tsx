/**
 * Profil sekmesi — kimlik kartı + rol bazlı kişisel menü.
 *
 * YENİ İŞ BÖLÜMÜ (beş sekmeli düzen, bkz. app/(tabs)/_layout.tsx):
 *   · Yönetim araçları (Takım Panelim, Oyuncu Profilim, Kariyerim, Yönetim
 *     Paneli) KULÜBÜM sekmesine taşındı.
 *   · Eski Menü'nün içeriği (oyunlar, keşif, bilgi, sosyal) buraya katıldı;
 *     lig bağlantıları alt çubuktaki LİG sekmesindedir.
 *   · Profil (merkez kalıbı): kimlik SAHNESİ (takip sayıları) → bekleyen işler
 *     (bildirim · mesaj) → takip edilen takımlar şeridi → bildirim ayarları ·
 *     oyunlar · keşfet · ayarlar · bilgi ve destek · oturum. ESKİ: kimlik kartı +
 *     dört kısayol (Takip · Bildirim · Oyunlar ·
 *     Kulübüm) + Takip ettiklerim · Bildirimler · Oyunlar · Keşfet · Bilgi ve
 *     destek · Ayarlar · oturum. Sıra kullanım sıklığına göredir.
 *
 * NEDEN SectionList: satırlar sabit bir menü gibi görünse de sayıları role ve
 * rozetlere göre değişir; SectionList + memo'lu satır, ScrollView + map'e göre
 * hem rozet güncellemelerinde daha az yeniden çizim yapar hem de proje kuralına
 * (uzun listede sanal liste) uyar.
 *
 * NEDEN GÖRÜNÜM SEÇİMİ BURADA: renk paleti açılışta donuyor (bkz. @/theme), bu
 * yüzden tema değişimi ekran başlıklarındaki bir düğmeyle değil, sonucu
 * anlatılabilen bir ayar satırıyla yapılmalı. Üç durumlu seçim (Açık/Koyu/
 * Sistem) satır içi alt sayfada toplanır.
 *
 * GİRİŞSİZ: kimlik kartı yerine giriş çağrısı kartı çizilir; KULÜBÜM ve
 * KARİYERİM grupları hiç üretilmez. Favoriler cihazda saklandığı için misafirde
 * de görünür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Appearance,
  DevSettings,
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
  BottomSheet,
  ListRow,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
  type Tone,
} from "@/components/ui";
import { FollowedTeamsRail } from "@/components/account/FollowedTeamsRail";
import { InboxStrip, type InboxItem } from "@/components/account/InboxStrip";
import { ProfileHero, type ProfileHeroStat } from "@/components/account/ProfileHero";
import { THEME_STORAGE_KEY, getStoredTheme, setStoredTheme } from "@/constants/themePreference";
import { unreadBadgeLabel, useUnreadCount } from "@/hooks/useUnreadCount";
import { getPanelMe } from "@/lib/api/panel";
import { mediaUrl } from "@/lib/format";
import { openLink } from "@/lib/links";
import { instagramUrl } from "@/lib/socials";
import { youtubeChannelUrl } from "@/lib/youtube";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, isDark, layout, radius, space, textScale, type } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/** Web sitesi — üyelik, şifre sıfırlama ve kurumsal sayfalar orada yaşıyor. */
const SITE_URL = "https://elitlig.com";

/** Takım başkanı sayılan profil tipleri (sunucudaki `profile_type` değerleri). */
const PRESIDENT_PROFILES = new Set(["takim_baskani", "double"]);

/** Satırın dokunulduğunda ne yapacağı — hepsi tek `onSelect` içinde çözülür. */
type MenuAction =
  | { kind: "route"; route: string }
  | { kind: "link"; url: string }
  | { kind: "theme" }
  | { kind: "city" }
  | { kind: "signOut" };

interface MenuItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** Sağda gri metin (şehir adı, görünüm tercihi, favori sayısı). */
  value?: string;
  /** Sağda kırmızı sayaç rozeti (okunmamış mesaj/bildirim). */
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

type ThemeChoice = "light" | "dark" | "system";

interface ThemeOption {
  value: ThemeChoice;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", label: "Açık", icon: "sunny-outline" },
  { value: "dark", label: "Koyu", icon: "moon-outline" },
  { value: "system", label: "Sistem", icon: "phone-portrait-outline" },
];

const THEME_LABELS: Record<ThemeChoice, string> = {
  light: "Açık",
  dark: "Koyu",
  system: "Sistem",
};

/* ============================== SAF YARDIMCILAR ============================= */

/** Grup içi konum — ListRow köşe yuvarlamasını ve ayracı buradan alır. */
function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/**
 * Cihazda saklı tema tercihi → üç durumlu seçim.
 * `getStoredTheme()` açılışta okunan değeri verir; null = kullanıcı seçmemiş.
 */
function storedThemeChoice(): ThemeChoice {
  return getStoredTheme() ?? "system";
}

/** Seçim uygulandığında ekranın koyu olup olmayacağı. */
function willBeDark(choice: ThemeChoice): boolean {
  if (choice === "system") return Appearance.getColorScheme() === "dark";
  return choice === "dark";
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

export default function ProfileTabScreen() {
  const auth = useAuth();
  const scope = useScope();
  const favorite = useFavorite();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const unread = useUnreadCount();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(storedThemeChoice);
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);

  const user = auth.user;

  /**
   * Kimlik kartının avatarı ve takım amblemi için panel özeti.
   * Anahtar `["panel","me"]` — /hesabim ve eski ekranlarla AYNI önbellek, iki
   * ekran arasında geçişte ikinci istek atılmaz. Panel rolü olmayan hesapta
   * sunucu 403 döndürür; kart o zaman sadece harf yedeğiyle çizilir.
   */
  const meQuery = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
  });

  /**
   * Aşağı çekince rozetler ve kimlik kartı tazelenir. Sorgular zaten 60 sn'de
   * bir yoklanıyor; elle çekme "şimdi bak" isteğidir, misafirde tazelenecek
   * sunucu verisi olmadığı için gösterge hiç bağlanmaz.
   */
  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifCount() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.panelMessages() });
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

  const openThemeSheet = useCallback(() => setThemeSheetOpen(true), []);
  const closeThemeSheet = useCallback(() => setThemeSheetOpen(false), []);

  const confirmSignOut = useCallback(() => {
    Alert.alert("Çıkış yap", "Oturumu kapatmak istediğine emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Çıkış yap",
        style: "destructive",
        onPress: () => {
          void auth.signOut().then(() => {
            toast.show({ message: "Çıkış yapıldı.", tone: "neutral" });
          });
        },
      },
    ]);
  }, [auth, toast]);

  const onSelect = useCallback(
    (item: MenuItem) => {
      switch (item.action.kind) {
        case "route":
          router.push(item.action.route as never);
          return;
        case "link":
          void openLink(item.action.url);
          return;
        case "theme":
          openThemeSheet();
          return;
        case "city":
          // Kapsam sayfası uygulamada TEK örnektir (app/_layout.tsx); ekran
          // kendi modalını açmaz, yalnız hangi adımla açılacağını söyler.
          scope.openScopeSheet("city");
          return;
        case "signOut":
          confirmSignOut();
      }
    },
    [confirmSignOut, openThemeSheet, router, scope]
  );

  /**
   * Tema tercihi: yaz, gerekiyorsa uygulamayı tazele.
   *
   * NEDEN lib/themeToggle.ts KULLANILMIYOR: o yardımcı ikili çalışır (mevcut
   * temanın tersine geçer) ve "Sistem" durumunu ifade edemez. Buradaki akış
   * aynı depolama anahtarını kullanır, yalnız üç durumu da yazabilir.
   * NEDEN YENİDEN YÜKLEME: palet modül yüklenirken donuyor; seçim etkin temayı
   * DEĞİŞTİRİYORSA JS'in bir kez tazelenmesi gerekir. Değiştirmiyorsa (ör.
   * sistem zaten koyu) hiç tazelenmez — bedava bir yeniden başlatma olmaz.
   *
   * NEDEN `__DEV__` SORULUYOR (try/catch YETMİYOR): `DevSettings.reload()`
   * YAYIN DERLEMESİNDE HATA ATMAZ — React Native, `__DEV__` false iken
   * DevSettings yerine gövdesi boş bir nesne koyar
   * (react-native/Libraries/Utilities/DevSettings.js: `reload() {}`).
   * Dolayısıyla eski `try { reload() } catch { uyar }` kurgusunda catch HİÇ
   * çalışmıyordu: kullanıcı yayındaki uygulamada "Koyu"yu seçiyor, sayfa
   * kapanıyor, tema değişmiyor ve HİÇBİR ŞEY SÖYLENMİYORDU. Sessiz başarısızlık
   * en kötü hata türüdür — düğme bozuk değil, YALANCI görünür.
   *
   * Tazeleme yalnız geliştirmede var; yayında kullanıcıya ne yapması
   * gerektiğini söylüyoruz. (Anında geçiş için ya `expo-updates` bağımlılığı
   * ya da paletin donmasını kaldıran stil düzeni gerekir; ikisi de bu
   * düzeltmenin kapsamı dışında.)
   */
  const chooseTheme = useCallback(
    (choice: ThemeChoice) => {
      setThemeChoice(choice);
      setThemeSheetOpen(false);

      const persist = choice === "system"
        ? AsyncStorage.removeItem(THEME_STORAGE_KEY)
        : AsyncStorage.setItem(THEME_STORAGE_KEY, choice);

      void persist
        .then(() => {
          setStoredTheme(choice === "system" ? null : choice);
          if (willBeDark(choice) === isDark) {
            toast.show({ message: `Görünüm: ${THEME_LABELS[choice]}`, tone: "success" });
            return;
          }
          if (__DEV__) {
            DevSettings.reload();
            return;
          }

          // Yayın derlemesinde tazeleme YOK; kullanıcıya dürüst ol.
          toast.show({
            message: `Görünüm: ${THEME_LABELS[choice]}. Uygulamayı tamamen kapatıp yeniden açınca uygulanacak.`,
            tone: "warn",
            duration: 5000,
          });
        })
        .catch(() => {
          setThemeChoice(storedThemeChoice());
          toast.show({ message: "Tema tercihi kaydedilemedi.", tone: "danger" });
        });
    },
    [toast]
  );

  const openAccount = useCallback(() => router.push("/hesabim"), [router]);
  const openSignIn = useCallback(() => router.push("/giris"), [router]);
  // App Store 4 (Design): üyelik tarayıcıda değil, uygulama içindeki
  // /kayit ekranında açılır.
  const openRegister = useCallback(() => router.push("/kayit"), [router]);

  /* ------------------------------ SATIRLAR ------------------------------- */

  const favoriteScopeCount = favorite.favoriteLeagues.length + favorite.favoriteSeasons.length;

  const igUrl = instagramUrl(scope.cityLabel);
  const channelUrl = youtubeChannelUrl(scope.cityLabel);

  /**
   * PROFİL BÖLÜMLERİ — "hesabım ve tercihlerim".
   *
   * Yönetim araçları (Takım Panelim, Oyuncu Profilim, Kariyerim, Yönetim
   * Paneli) KULÜBÜM sekmesine taşındı; Menü sekmesinin içeriği (oyunlar, bilgi,
   * sosyal) buraya katıldı. Sıra kullanım sıklığına göredir: takip → bildirim
   * → oyun → keşif → bilgi → ayar.
   */
  const sections = useMemo<MenuSection[]>(() => {
    const result: MenuSection[] = [];

    /* 1 — BİLDİRİM AYARLARI. Gelen kutusu ve mesajlar yukarıdaki "bekleyen
       işler" şeridine taşındı; burada yalnız NE ZAMAN ve KİMİN İÇİN
       bildirim alınacağı ayarlanır. İki ekranın farkı alt satırda tek
       cümleyle söylenir ki kullanıcı hangisini açacağını tahmin etmesin. */
    result.push({
      key: "bildirim",
      title: "Bildirim ayarları",
      data: [
        {
          key: "bildirim-tercihleri",
          icon: "notifications",
          title: "Bildirim türleri",
          subtitle: "Gol, maç başlangıcı, sonuç, haber ve panel",
          tone: "brand",
          action: { kind: "route", route: "/bildirim-tercihleri" },
        },
        {
          key: "takip-bildirimleri",
          icon: "options",
          title: "Takip ettiklerim için",
          subtitle: "Her takım, lig ve maç için ayrı aç/kapat",
          action: { kind: "route", route: "/takip-bildirimleri" },
        },
      ],
    });

    /* 2 — OYUNLAR */
    result.push({
      key: "oyunlar",
      title: "Oyunlar",
      data: [
        {
          key: "oyun-merkezi",
          icon: "game-controller",
          title: "Oyun Merkezi",
          subtitle: "Günün Testi, Penaltı, Arena, Kim Bu? ve daha fazlası",
          tone: "win",
          action: { kind: "route", route: "/(tabs)/oyunlar" },
        },
        {
          key: "siralama",
          icon: "podium",
          title: "Rekor tablosu",
          subtitle: "Oyun rekorları lider tablosu",
          action: { kind: "route", route: "/siralama" },
        },
      ],
    });

    /* 3 — KEŞFET */
    result.push({
      key: "kesfet",
      title: "Keşfet",
      data: [
        {
          key: "canli",
          icon: "radio",
          title: "Canlı maçlar",
          tone: "live",
          action: { kind: "route", route: "/canli" },
        },
        {
          key: "h2h",
          icon: "git-compare",
          title: "Takım karşılaştır",
          subtitle: "İki takımı yan yana koy",
          action: { kind: "route", route: "/h2h" },
        },
        {
          key: "ara",
          icon: "search",
          title: "Takım, oyuncu ara",
          action: { kind: "route", route: "/ara" },
        },
      ],
    });

    /* 4 — AYARLAR */
    const prefs: MenuItem[] = [
      {
        key: "kapsam",
        icon: "location",
        title: "İl, lig ve sezon",
        value: [scope.cityLabel, scope.leagueLabel].filter(Boolean).join(" · ") || "Seç",
        action: { kind: "city" },
      },
      {
        key: "gorunum",
        icon: "contrast",
        title: "Görünüm",
        value: THEME_LABELS[themeChoice],
        action: { kind: "theme" },
      },
    ];
    if (user) {
      prefs.push({
        key: "hesabim",
        icon: "key",
        title: "Hesap ve güvenlik",
        subtitle: "Bilgilerin, şifren, engellediklerin",
        action: { kind: "route", route: "/hesabim" },
      });
    }
    result.push({ key: "tercihler", title: "Ayarlar", data: prefs });

    /* 5 — BİLGİ VE DESTEK (eski Menü sekmesi) */
    const info: MenuItem[] = [
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
    ];
    /* Sosyal hesaplar ve site liste satırı değil, listenin dibinde üç
       yuvarlak düğmedir (bkz. `listFooter`): sık açılmazlar ve altı satırlık
       bir grubu yarı yarıya şişiriyorlardı. */
    result.push({ key: "bilgi", title: "Bilgi ve destek", data: info });

    /* 6 — Çıkış ve hesap silme: kendi başına, kırmızı, başlıksız grup.
       Hesap silme burada da durur; App Store (5.1.1-v) ve Google Play silme
       kapısının "kolayca bulunur" olmasını ister (bkz. app/hesap-sil.tsx). */
    if (user) {
      result.push({
        key: "oturum",
        data: [
          {
            key: "cikis",
            icon: "log-out",
            title: "Çıkış yap",
            tone: "danger",
            destructive: true,
            action: { kind: "signOut" },
          },
          {
            key: "hesap-sil",
            icon: "trash",
            title: "Hesabı sil",
            subtitle: "Kalıcı olarak silinir, geri alınamaz",
            tone: "danger",
            destructive: true,
            action: { kind: "route", route: "/hesap-sil" },
          },
        ],
      });
    }

    return result;
  }, [scope.cityLabel, scope.leagueLabel, themeChoice, user]);

  /* ------------------------------ ÇİZİM ---------------------------------- */

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<MenuItem, MenuSection>) => (
      <MenuRow item={item} position={rowPosition(index, section.data.length)} onSelect={onSelect} />
    ),
    [onSelect]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: MenuSection }) =>
      /* İçerik kabı zaten 14px dolgu basıyor; başlık kendi dolgusunu basmasın
         ki ray kart kenarıyla hizalansın. */
      section.title ? <SectionHeader title={section.title} style={styles.flushHeader} /> : null,
    []
  );

  const renderSectionFooter = useCallback(() => <View style={styles.sectionGap} />, []);

  /**
   * KİMLİK SAHNESİNİN ÜÇ SAYISI — takip edilen takım · lig/sezon · maç.
   * Üçü de cihazda saklanır (FavoriteProvider), misafirde de gerçektir; her
   * sayı takip ekranının ilgili sekmesini açar.
   */
  const heroStats = useMemo<ProfileHeroStat[]>(
    () => [
      {
        key: "takim",
        label: "Takım",
        value: favorite.favorites.length,
        onPress: () => router.push("/(tabs)/favoriler?tab=takimlar"),
      },
      {
        key: "lig",
        label: "Lig · sezon",
        value: favoriteScopeCount,
        onPress: () => router.push("/(tabs)/favoriler?tab=ligler"),
      },
      {
        key: "mac",
        label: "Maç",
        value: favorite.favoriteMatches.length,
        onPress: () => router.push("/(tabs)/favoriler?tab=maclar"),
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

  /** BEKLEYEN İŞLER — yalnız girişli kullanıcıda; ikisi de sunucudan sayılır. */
  const inboxItems = useMemo<InboxItem[]>(
    () => [
      {
        key: "bildirim",
        icon: "notifications",
        title: "Bildirimler",
        count: unread.notifications,
        idleLabel: "Hepsi okundu",
        onPress: () => router.push("/bildirimler"),
      },
      {
        key: "mesaj",
        icon: "chatbubbles",
        title: "Mesajlar",
        count: unread.messages,
        idleLabel: "Yeni mesaj yok",
        onPress: () => router.push("/sohbet"),
      },
    ],
    [router, unread.messages, unread.notifications]
  );

  const openTeam = useCallback((teamId: number) => router.push(`/takim/${teamId}`), [router]);
  const findTeam = useCallback(() => router.push("/(tabs)/ligler?tab=takimlar"), [router]);
  const manageFollows = useCallback(() => router.push("/(tabs)/favoriler?tab=takimlar"), [router]);

  const listHeader = useMemo(
    () => (
      <>
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
        {user ? <InboxStrip items={inboxItems} /> : null}

        <SectionHeader
          title="Takip ettiğin takımlar"
          action={favorite.favorites.length ? { label: "Yönet", onPress: manageFollows } : undefined}
          style={styles.flushHeader}
        />
        <FollowedTeamsRail teams={favorite.favorites} onOpenTeam={openTeam} onAdd={findTeam} />
        <View style={styles.sectionGap} />
      </>
    ),
    [
      auth.initializing,
      favorite.favorites,
      findTeam,
      heroStats,
      heroUser,
      inboxItems,
      manageFollows,
      openAccount,
      openRegister,
      openSignIn,
      openTeam,
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
      <ScreenHeader title="Profil" scrollY={scrollY} />

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

      <BottomSheet
        visible={themeSheetOpen}
        onClose={closeThemeSheet}
        title="Görünüm"
        snap="content"
      >
        {/* Üç sabit seçenek — veri listesi değil, bu yüzden map yeterli. */}
        <View style={styles.sheetBody}>
          {THEME_OPTIONS.map((option, index) => (
            <ThemeOptionRow
              key={option.value}
              option={option}
              selected={option.value === themeChoice}
              position={rowPosition(index, THEME_OPTIONS.length)}
              onSelect={chooseTheme}
            />
          ))}
          <Text style={styles.sheetNote} {...textScale.dense}>
            Renkler uygulama açılırken sabitlendiği için tema değişiminde uygulama bir kez
            tazelenir.
          </Text>
        </View>
      </BottomSheet>
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
      badge={item.badge ? <Badge label={item.badge} tone="live" variant="solid" size="xs" /> : undefined}
      destructive={item.destructive}
      position={position}
      onPress={handlePress}
    />
  );
});

/** Görünüm alt sayfasının tek seçeneği. */
const ThemeOptionRow = React.memo(function ThemeOptionRow({
  option,
  selected,
  position,
  onSelect,
}: {
  option: ThemeOption;
  selected: boolean;
  position: "single" | "first" | "middle" | "last";
  onSelect: (choice: ThemeChoice) => void;
}) {
  const handlePress = useCallback(() => onSelect(option.value), [onSelect, option.value]);
  const leading = useMemo(
    () => ({ icon: option.icon, tone: selected ? ("brand" as Tone) : undefined }),
    [option.icon, selected]
  );

  return (
    <ListRow
      leading={leading}
      title={option.label}
      position={position}
      chevron={false}
      trailing={
        selected ? <Ionicons name="checkmark" size={18} color={colors.brandAccent} /> : undefined
      }
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
  /* Bölüm başlığı, dolgulu kabın içinde kendi dolgusunu basmaz. */
  flushHeader: {
    paddingHorizontal: 0,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: layout.tabBarHeight + space.xxl,
  },
  sectionGap: {
    height: layout.sectionGap,
  },

  heroSkeleton: {
    marginTop: space.sm,
  },

  /* Görünüm alt sayfası */
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
