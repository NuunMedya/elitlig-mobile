/**
 * Profil sekmesi — kimlik kartı + rol bazlı kişisel menü.
 *
 * NE: eski `(tabs)/menu.tsx` (27 satırlık genel menü) ile `(tabs)/profile.tsx`
 * (hesap özeti) tek kavramın iki yarısıydı; menünün ilk satırı zaten profile
 * gidiyordu. Burada ikisi birleşir: en üstte kimlik kartı, altında YALNIZCA
 * kişisel/ayar niteliğindeki satırlar. Hesap detayı `/hesabim` ekranına iner.
 *
 * NEDEN ROL BAZLI GRUP: 27 satırlık düz liste herkese aynı şeyi gösteriyordu;
 * oyuncu olmayan biri "Sözleşmelerim"i, yönetici olmayan biri "Yönetim
 * Paneli"ni görüyordu. Artık satırlar kullanıcının gerçekten sahip olduğu
 * rollere göre üretilir (KULÜBÜM ve KARİYERİM grupları koşulludur) ve en sık
 * kullanılan grup en üste alınır.
 *
 * MENÜ SEKMESİYLE İŞ BÖLÜMÜ: Keşfet (haberler, arşiv, şehirler, rekorlar),
 * Bilgi (kurallar, cezalar, iletişim) ve sosyal bağlantılar MENÜ ekranında
 * durur. Profil'de KİMLİK ve TERCİH kalır — "ben kimim, neyi nasıl görmek
 * istiyorum". Aynı satırın iki yerde birden bulunması kullanıcıya "hangisi
 * doğru yer" sorusunu sordurur ve iki listeyi de şişirir.
 *
 * KISAYOL IZGARASI (menü sekmesi kalkınca eklendi): alt menüde artık Menü
 * yuvası yok (bkz. app/(tabs)/_layout.tsx). Menü ekranı DURUYOR ama ona
 * açılan kapı buradaki dört kutudur: Ligler · Canlı · Oyunlar · Menü. Izgara
 * kimlik kartının hemen altındadır, yani menünün eskiden tek dokunuşla
 * verdiği her şey hâlâ tek dokunuş uzakta — kaldırılan yuva kimseye bir
 * dokunuş maliyeti çıkarmadı.
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
  ActionRow,
  ActionTile,
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
  type Tone,
} from "@/components/ui";
import { THEME_STORAGE_KEY, getStoredTheme, setStoredTheme } from "@/constants/themePreference";
import { unreadBadgeLabel, useUnreadCount } from "@/hooks/useUnreadCount";
import { getPanelMe } from "@/lib/api/panel";
import { mediaUrl } from "@/lib/format";
import { openLink } from "@/lib/links";
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
  const openSite = useCallback(() => void openLink(SITE_URL), []);

  /* ------------------------------ SATIRLAR ------------------------------- */

  const favoriteScopeCount = favorite.favoriteLeagues.length + favorite.favoriteSeasons.length;

  const sections = useMemo<MenuSection[]>(() => {
    const result: MenuSection[] = [];

    /* 1 — KULÜBÜM: rolüne göre değişen, en sık kullanılan grup. */
    if (user) {
      const club: MenuItem[] = [];
      if (auth.isManagement) {
        club.push({
          key: "yonetim",
          icon: "shield-checkmark",
          title: "Yönetim Paneli",
          subtitle: "Maç, saha ve mesaj yönetimi",
          tone: "brand",
          action: { kind: "route", route: "/yonetim" },
        });
      }
      if (isPresident) {
        club.push({
          key: "takimim",
          icon: "people",
          title: "Takım Panelim",
          subtitle: "Kadro, kasa, davetler, maç merkezi",
          tone: "brand",
          action: { kind: "route", route: "/takimim" },
        });
      }
      if (isPlayer) {
        club.push({
          key: "oyuncum",
          icon: "shirt",
          title: "Oyuncu Profilim",
          subtitle: "İstatistiklerin, maçların ve sözleşmen",
          action: { kind: "route", route: "/oyuncum" },
        });
      }
      club.push(
        {
          key: "sohbet",
          icon: "chatbubbles",
          title: "Mesajlar",
          subtitle: "Yönetim, takımın ve oyuncularla yazış, sesli ara",
          badge: unreadBadgeLabel(unread.messages),
          action: { kind: "route", route: "/sohbet" },
        },
        {
          key: "bildirimler",
          icon: "notifications",
          title: "Bildirimler",
          subtitle: "Teklifler, cezalar, duyurular",
          badge: unreadBadgeLabel(unread.notifications),
          action: { kind: "route", route: "/bildirimler" },
        },
        {
          key: "davetler",
          icon: "git-pull-request",
          title: "Davet ve Başvurular",
          subtitle: "Takım davetlerin ve başvuruların",
          action: { kind: "route", route: "/davetler" },
        }
      );
      result.push({ key: "kulubum", title: "Kulübüm", data: club });
    }

    /* 2 — KARİYERİM: yalnız oyuncu profili bağlı hesaplarda. */
    if (user && isPlayer) {
      result.push({
        key: "kariyerim",
        title: "Kariyerim",
        data: [
          {
            // BÜTÜNLEŞTİRME NOTU: eski `/maclarim` ekranı Oyuncu Paneli'nin
            // Maçlarım segmentine taşındı (yoklama ve kadro rozeti dâhil),
            // rota dosyası silindi. Kapı artık doğrudan oraya açılıyor.
            key: "maclarim",
            icon: "football",
            title: "Maçlarım",
            subtitle: "Kadroda yer aldığın maçlar ve performansın",
            action: { kind: "route", route: "/oyuncum?tab=maclarim" },
          },
          {
            key: "tekliflerim",
            icon: "swap-horizontal",
            title: "Transfer Tekliflerim",
            subtitle: "Gelen teklifleri kabul et ya da reddet",
            action: { kind: "route", route: "/tekliflerim" },
          },
          {
            key: "sozlesmelerim",
            icon: "document-text",
            title: "Sözleşmelerim",
            subtitle: "Aktif ve geçmiş sözleşmelerin",
            action: { kind: "route", route: "/sozlesmelerim" },
          },
          {
            key: "cezalarim",
            icon: "alert-circle",
            title: "Disiplin Dosyalarım",
            subtitle: "Savunma ve itiraz hakların",
            tone: "warn",
            action: { kind: "route", route: "/cezalarim" },
          },
        ],
      });
    }

    /* 3 — FAVORİLER: cihazda saklanır, misafirde de çalışır. */
    result.push({
      key: "favoriler",
      title: "Favoriler",
      data: [
        {
          key: "fav-takimlar",
          icon: "star",
          title: "Favori Takımlarım",
          value: favorite.favorites.length ? String(favorite.favorites.length) : undefined,
          action: { kind: "route", route: "/(tabs)/favoriler?tab=takimlar" },
        },
        {
          key: "fav-ligler",
          icon: "trophy",
          title: "Favori Liglerim",
          subtitle: "Lig ve sezonlar",
          value: favoriteScopeCount ? String(favoriteScopeCount) : undefined,
          action: { kind: "route", route: "/(tabs)/favoriler?tab=ligler" },
        },
      ],
    });

    /* 4 — TERCİHLER */
    const prefs: MenuItem[] = [
      {
        key: "bildirim-tercihleri",
        icon: "notifications-circle",
        title: "Bildirim Tercihleri",
        subtitle: "Gol, maç, panel ve haber bildirimleri",
        action: { kind: "route", route: "/bildirim-tercihleri" },
      },
      {
        key: "gorunum",
        icon: "contrast",
        title: "Görünüm",
        value: THEME_LABELS[themeChoice],
        action: { kind: "theme" },
      },
      {
        key: "sehir",
        icon: "location",
        title: "Şehir",
        value: scope.cityLabel || "Seç",
        action: { kind: "city" },
      },
    ];
    if (user) {
      prefs.push({
        key: "hesabim",
        icon: "key",
        title: "Hesap ve Güvenlik",
        subtitle: "Bilgilerin, şifren ve oturumun",
        action: { kind: "route", route: "/hesabim" },
      });
    }
    result.push({ key: "tercihler", title: "Tercihler", data: prefs });

    /* NOT: Keşfet · Bilgi · Bizi takip et grupları MENÜ sekmesine taşındı.
       Profil artık yalnız KİMLİK ve TERCİH taşır; keşif ve araç niteliğindeki
       her şey Menü'nün evidir. Aynı satırı iki sekmede birden göstermek
       kullanıcıya "hangisi doğru yer" sorusunu sordurur. */

    /* 8 — Çıkış: kendi başına, kırmızı, başlıksız grup. */
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
        ],
      });
    }

    return result;
  }, [
    auth.isManagement,
    favorite.favorites.length,
    favoriteScopeCount,
    isPlayer,
    isPresident,
    scope.cityLabel,
    themeChoice,
    unread.messages,
    unread.notifications,
    user,
  ]);

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
   * KISAYOLLAR — kaldırılan Menü sekmesinin kapısı.
   *
   * Dört kutu, menünün en çok açılan dört hedefi. Dördüncüsü menünün
   * KENDİSİNE gider: keşfet/bilgi/sosyal ne varsa hepsi orada durmaya devam
   * ediyor ve buradan tek dokunuşla açılıyor. Izgara girişsiz kullanıcıda da
   * çizilir — dördü de giriş istemez.
   */
  const shortcuts = useMemo(
    () => (
      <ActionRow style={styles.shortcuts}>
        <ActionTile
          icon="trophy"
          label="Ligler"
          tone="brand"
          onPress={() => router.push("/(tabs)/ligler")}
        />
        <ActionTile
          icon="radio"
          label="Canlı"
          tone="live"
          onPress={() => router.push("/canli")}
        />
        <ActionTile
          icon="game-controller"
          label="Oyunlar"
          tone="accent"
          onPress={() => router.push("/(tabs)/oyunlar")}
        />
        <ActionTile
          icon="grid"
          label="Menü"
          tone="neutral"
          onPress={() => router.push("/(tabs)/menu")}
        />
      </ActionRow>
    ),
    [router],
  );

  const listHeader = useMemo(() => {
    if (auth.initializing) return <SkeletonCard lines={2} />;
    if (!user) {
      /* Misafirde de ızgara çizilir: dört hedefin dördü de giriş istemez ve
         menü sekmesi kalktığı için kapı burasıdır. */
      return (
        <>
          <GuestHero onSignIn={openSignIn} onRegister={openSite} />
          {shortcuts}
        </>
      );
    }
    return (
      <>
        <IdentityCard
          name={user.fullName ?? user.username}
          username={user.username}
          avatar={mediaUrl(me?.player?.player_img)}
          teamName={teamName}
          teamLogo={mediaUrl(teamCard?.logo)}
          isManagement={auth.isManagement}
          isPresident={isPresident}
          isPlayer={isPlayer}
          onPress={openAccount}
        />
        {shortcuts}
      </>
    );
  }, [
    auth.initializing,
    auth.isManagement,
    isPlayer,
    isPresident,
    me?.player?.player_img,
    openAccount,
    openSignIn,
    openSite,
    shortcuts,
    teamCard?.logo,
    teamName,
    user,
  ]);

  const listFooter = useMemo(
    () => (
      <Text style={styles.version} {...textScale.dense}>
        {versionLabel()}
      </Text>
    ),
    []
  );

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

/** Kimlik kartı — dokununca hesap ekranına iner. */
const IdentityCard = React.memo(function IdentityCard({
  name,
  username,
  avatar,
  teamName,
  teamLogo,
  isManagement,
  isPresident,
  isPlayer,
  onPress,
}: {
  name: string;
  username: string;
  avatar: string | null;
  teamName: string | null;
  teamLogo: string | null;
  isManagement: boolean;
  isPresident: boolean;
  isPlayer: boolean;
  onPress: () => void;
}) {
  const roles = useMemo(() => {
    const list: { key: string; label: string; tone: Tone }[] = [];
    if (isManagement) list.push({ key: "yonetim", label: "YÖNETİM", tone: "brand" });
    if (isPresident) list.push({ key: "baskan", label: "BAŞKAN", tone: "info" });
    if (isPlayer) list.push({ key: "oyuncu", label: "OYUNCU", tone: "win" });
    return list;
  }, [isManagement, isPlayer, isPresident]);

  // NEDEN Card DEĞİL: Card'ın basılabilir hâli ekran okuyucu etiketini `title`
  // prop'undan alıyor; burada başlık bir metin satırı değil, avatar + ad + rol
  // rozetlerinden oluşan bir blok. Yüzey Card'ın basılabilir hâliyle birebir
  // aynı (surface1 + hairline), yalnız etiketi elle veriyoruz.
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, @${username}. Hesap ve güvenlik`}
      style={styles.identityCard}
    >
      <Avatar name={name} image={avatar} size={56} ring="brand" />

      <View style={styles.identityBody}>
        <Text style={styles.identityName} numberOfLines={1} {...textScale.dense}>
          {name}
        </Text>
        <Text style={styles.identityHandle} numberOfLines={1} {...textScale.dense}>
          @{username}
        </Text>
        {roles.length ? (
          <View style={styles.roleRow}>
            {roles.map((role) => (
              <Badge key={role.key} label={role.label} tone={role.tone} size="xs" />
            ))}
          </View>
        ) : null}
      </View>

      {teamName ? <TeamLogo name={teamName} logo={teamLogo} size={layout.crestLg} /> : null}
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Touchable>
  );
});

/**
 * Misafir kartı — kimlik kartının yerine geçer.
 * Üyelik akışı mobilde yok; kayıt web sitesinde tamamlanır.
 */
const GuestHero = React.memo(function GuestHero({
  onSignIn,
  onRegister,
}: {
  onSignIn: () => void;
  onRegister: () => void;
}) {
  return (
    <Card padding="lg" style={styles.guestCard}>
      <View style={styles.guestIcon}>
        <Ionicons name="person-outline" size={22} color={colors.brandAccent} />
      </View>
      <Text style={styles.guestTitle} {...textScale.dense}>
        ElitLig&apos;e giriş yap
      </Text>
      <Text style={styles.guestBody} {...textScale.long}>
        Takımını takip et, gol bildirimlerini al, panelini ve sözleşmelerini yönet.
      </Text>
      <View style={styles.guestActions}>
        <Button label="Giriş yap" onPress={onSignIn} style={styles.guestButton} />
        <Button label="Üye ol" variant="secondary" onPress={onRegister} style={styles.guestButton} />
      </View>
    </Card>
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
  /** Izgara kimlik kartına yapışmasın; bölüm başlığı kadar nefes alsın. */
  shortcuts: {
    marginTop: space.md,
    marginBottom: space.sm,
  },
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

  /* Kimlik kartı — Card'ın basılabilir yüzeyiyle aynı ölçüler. */
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  identityBody: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    ...type.h2,
    color: colors.textPrimary,
  },
  identityHandle: {
    ...type.caption,
    color: colors.textSecondary,
  },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    marginTop: space.xs,
  },

  /* Misafir kartı */
  guestCard: {
    marginTop: space.sm,
    alignItems: "flex-start",
    gap: space.sm,
  },
  guestIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    alignItems: "center",
    justifyContent: "center",
  },
  guestTitle: {
    ...type.h1,
    color: colors.textPrimary,
  },
  guestBody: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  guestActions: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.xs,
    alignSelf: "stretch",
  },
  guestButton: {
    flex: 1,
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

  version: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.lg,
  },
});
