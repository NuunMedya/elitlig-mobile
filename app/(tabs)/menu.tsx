/**
 * MENÜ sekmesi — uygulamanın her köşesine giden kapı (eski Profil).
 *
 * KURGU (Gece teması · ikinci tur — uzun tekdüze liste yerine hiyerarşi):
 *   1. KİMLİK SAHNESİ (ProfileHero) — girişlide avatar + imza halkası, rol /
 *      takım hapları, ELİT SEVİYE şeridi (XP + GradientBar) ve takip
 *      sayıları; misafirde davet + giriş / üye ol.
 *   2. HIZLI ERİŞİM — dört renkli karo: Oyun merkezi · Tahmin Ligi ·
 *      Fantezi · Görevler. Altında Günün Testi şeridi (bugün oynandı mı).
 *   3. GRUPLAR — her biri ikonlu başlık + TEK kart:
 *        Takip · Görevler ve ödüller · Lig ve istatistik (karşılaştırma
 *        çifti + liste) · Destek · Ayarlar (tema anahtarı burada).
 *   4. Dipte sosyal hesaplar ve sürüm.
 *
 * Rol araçları (Takım paneli, oyuncu paneli, yönetim) YÖNETİM sekmesindedir.
 *
 * GİRİŞSİZ: kimlik kartı yerine davet çizilir; Hesabım / Hesabı sil satırları
 * üretilmez. Takip sayıları ve Günün Testi cihazda saklandığı için misafirde
 * de gerçektir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  IconTile,
  Reveal,
  ScreenHeader,
  Skeleton,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import { MenuGroup, MenuItemRow as MenuGroupRow, QuickGrid, type MenuItemSpec, type QuickItem } from "@/components/account/MenuBlocks";
import { ProfileHero, type ProfileHeroLevel, type ProfileHeroStat } from "@/components/account/ProfileHero";
import { THEME_STORAGE_KEY, setStoredTheme } from "@/constants/themePreference";
import { useNotificationBell } from "@/hooks/useNotificationBell";
import { getMyCareer } from "@/lib/api/career";
import { resolveProfileType, scopesForProfileType } from "@/lib/api/member/player";
import { getPanelMe } from "@/lib/api/panel";
import { formatNumber, mediaUrl } from "@/lib/format";
import { openLink } from "@/lib/links";
import { instagramUrl } from "@/lib/socials";
import { reloadForTheme } from "@/lib/themeTransition";
import { youtubeChannelUrl } from "@/lib/youtube";
import { queryKeys } from "@/lib/queryKeys";
import { useAdminMode } from "@/providers/AdminModeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, fonts, hairline, isDark, layout, radius, space, textScale, type } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/** Web sitesi — üyelik, şifre sıfırlama ve kurumsal sayfalar orada yaşıyor. */
const SITE_URL = "https://elitlig.com";

/** Günün Testi'nin o güne ait sonucu — app/gunun.tsx ile AYNI anahtar (UTC gün). */
const dailyResultKey = (day: string) => `elitlig.gunun.${day}.v1`;

/* ============================== SAF YARDIMCILAR ============================= */

/** Günün Testi sonucu → doğru sayısı; bozuk ya da yoksa null. */
function parseDaily(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { correct?: unknown };
    const correct = Number(parsed.correct);
    return Number.isFinite(correct) ? correct : null;
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
  const adminMode = useAdminMode();
  const scope = useScope();
  const favorite = useFavorite();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { scrollY, scrollProps } = useHeaderScroll();
  const bell = useNotificationBell();

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
   * Elit Seviye şeridi — Görevler / Elit Kariyer ile AYNI önbellek
   * (`["career","me"]`); ikinci istek atılmaz. Gelmezse şerit çizilmez.
   */
  const careerQuery = useQuery({
    queryKey: ["career", "me"],
    queryFn: getMyCareer,
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
  });

  /**
   * Günün Testi'nin bugünkü sonucu — cihazdan (app/gunun.tsx yazar). Odakta
   * yeniden okunur: oyundan dönünce şerit "oynadın" demeli.
   */
  const [dailyCorrect, setDailyCorrect] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      const today = new Date().toISOString().slice(0, 10);
      let alive = true;
      AsyncStorage.getItem(dailyResultKey(today))
        .then((raw) => {
          if (alive) setDailyCorrect(parseDaily(raw));
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
    void careerQuery.refetch();
  }, [careerQuery, meQuery, queryClient]);

  const refresh = useRefresh(refreshAll, { refreshing: meQuery.isRefetching });

  const me = meQuery.data;
  const teamCard = me?.team ?? me?.playerTeam ?? null;
  const teamName = teamCard?.team_name ?? user?.teamName ?? null;

  /* Roller = PROFİL MODLARI (Kulübüm/Kariyerim ile aynı kural): "Oyuncu modu"
     kapalıysa rozet de çizilmez. */
  const profileScopes = user ? scopesForProfileType(resolveProfileType(user)) : null;
  const isPresident = Boolean(profileScopes?.team);
  const isPlayer = Boolean(profileScopes?.player && user?.player_id);

  /* ------------------------------ EYLEMLER ------------------------------- */

  const go = useCallback((route: string) => router.push(route as never), [router]);
  const openAccount = useCallback(() => router.push("/hesabim"), [router]);
  const openSignIn = useCallback(() => router.push("/giris"), [router]);
  // App Store 4 (Design): üyelik tarayıcıda değil, uygulama içindeki
  // /kayit ekranında açılır.
  const openRegister = useCallback(() => router.push("/kayit"), [router]);

  /**
   * TEMA ANAHTARI — Ayarlar'daki Görünüm seçiminin ikili kısayolu. Aynı
   * depolama anahtarına yazar; palet açılışta donduğu için uygulama bir kez
   * tazelenir (Portal Open — lib/themeTransition.ts). Üç durumlu seçim
   * (Sistem dahil) Ayarlar ▸ Görünüm'de kalır.
   */
  const [darkOn, setDarkOn] = useState(isDark);
  const toggleTheme = useCallback(
    (next: boolean) => {
      setDarkOn(next);
      const choice = next ? "dark" : "light";
      void AsyncStorage.setItem(THEME_STORAGE_KEY, choice)
        .then(() => {
          setStoredTheme(choice);
          return reloadForTheme().then((reloaded) => {
            if (reloaded) return;
            toast.show({
              message: `Görünüm: ${next ? "Koyu" : "Açık"}. Uygulamayı yeniden açınca uygulanacak.`,
              tone: "warn",
              duration: 5000,
            });
          });
        })
        .catch(() => {
          setDarkOn(isDark);
          toast.show({ message: "Tema tercihi kaydedilemedi.", tone: "danger" });
        });
    },
    [toast]
  );

  /* ------------------------------ SAYILAR -------------------------------- */

  const favoriteScopeCount = favorite.favoriteLeagues.length + favorite.favoriteSeasons.length;
  const followCount = favorite.favorites.length + favoriteScopeCount + favorite.favoriteMatches.length;

  const igUrl = instagramUrl(scope.cityLabel);
  const channelUrl = youtubeChannelUrl(scope.cityLabel);

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

  const career = careerQuery.data;
  const heroLevel = useMemo<ProfileHeroLevel | null>(() => {
    const lv = career?.level;
    if (!lv) return null;
    return {
      level: lv.level,
      xp: lv.xp,
      progress: lv.progress,
      toNext: lv.next != null ? Math.max(0, lv.next - lv.xp) : null,
      onPress: () => router.push("/gorevler"),
    };
  }, [career?.level, router]);

  /** Haftalık görev özeti: "4/20 · +120 XP" — karo ve satır izi. */
  const weekly = career?.weekly_quests;
  const questHint = weekly ? `${formatNumber(weekly.done_count)}/${formatNumber(weekly.total)}` : undefined;
  const weekXp = career?.layers_week
    ? Object.values(career.layers_week).reduce((sum, value) => sum + (Number(value) || 0), 0)
    : null;

  /* ------------------------------ İÇERİK --------------------------------- */

  const quick = useMemo<QuickItem[]>(
    () => [
      { key: "oyun", icon: "game-controller", label: "Oyunlar", hint: "Merkez", tone: "violet", onPress: () => go("/(tabs)/oyunlar") },
      { key: "tahmin", icon: "podium", label: "Tahmin", hint: "Skor bil", tone: "cyan", onPress: () => go("/tahmin-ligi") },
      { key: "fantezi", icon: "people-circle", label: "Fantezi", hint: "Kadro kur", tone: "pink", onPress: () => go("/fantezi") },
      { key: "gorev", icon: "flag", label: "Görevler", hint: questHint ?? "XP kazan", tone: "gold", onPress: () => go("/gorevler") },
    ],
    [go, questHint]
  );

  const followItems = useMemo<MenuItemSpec[]>(
    () => [
      {
        key: "takip",
        icon: "star",
        tone: "violet",
        title: "Takip ettiklerin",
        subtitle: "Takımların, liglerin ve maçların",
        value: followCount ? formatNumber(followCount) : undefined,
        onPress: () => go("/(tabs)/takip"),
      },
      {
        key: "takip-bildirim",
        icon: "notifications",
        tone: "cyan",
        title: "Takip bildirimleri",
        subtitle: "Her takım ve maç için ayrı aç/kapat",
        onPress: () => go("/takip-bildirimleri"),
      },
    ],
    [followCount, go]
  );

  const rewardItems = useMemo<MenuItemSpec[]>(
    () => [
      {
        key: "gorevler",
        icon: "flag",
        tone: "gold",
        title: "Haftalık görevler",
        subtitle:
          weekXp != null && weekXp > 0
            ? `Bu hafta +${formatNumber(weekXp)} XP kazandın`
            : "Görevleri tamamla, XP ve rozet kazan",
        value: questHint,
        onPress: () => go("/gorevler"),
      },
      {
        key: "haftanin-enleri",
        icon: "medal",
        tone: "pink",
        title: "Haftanın enleri",
        subtitle: "Haftanın kadrosu ve ödülleri",
        onPress: () => go("/haftanin-enleri"),
      },
    ],
    [go, questHint, weekXp]
  );

  const leagueItems = useMemo<MenuItemSpec[]>(
    () => [
      {
        key: "turkiye",
        icon: "earth",
        tone: "cyan",
        title: "Türkiye sıralaması",
        subtitle: "Tüm şehirlerin gol, asist ve takım liderleri",
        onPress: () => go("/turkiye"),
      },
      {
        key: "borsa",
        icon: "storefront",
        tone: "mint",
        title: "Transfer borsası",
        subtitle: "Satılık ve kiralık oyuncular",
        onPress: () => go("/takimim/borsa"),
      },
      {
        key: "cezalar",
        icon: "hammer",
        tone: "red",
        title: "Kurul kararları",
        subtitle: "Disiplin talimatı ve verilen cezalar",
        onPress: () => go("/cezalar"),
      },
    ],
    [go]
  );

  const supportItems = useMemo<MenuItemSpec[]>(
    () => [
      { key: "kurallar", icon: "book", tone: "neutral", title: "Lig kuralları", subtitle: "Talimatlar ve oyun kuralları", onPress: () => go("/kurallar") },
      { key: "iletisim", icon: "chatbubbles", tone: "mint", title: "İletişim", subtitle: "Telefon, WhatsApp, e-posta", onPress: () => go("/iletisim") },
    ],
    [go]
  );

  /* AYARLAR — tema anahtarı + tek Ayarlar kapısı. Hesabı sil App Store
     5.1.1-v için girişli üyede Menü'de de doğrudan kapı olarak kalır
     (docs/magaza-inceleme.md §1). */
  const settingsItems = useMemo<MenuItemSpec[]>(() => {
    const list: MenuItemSpec[] = [
      {
        key: "tema",
        icon: darkOn ? "moon" : "sunny",
        tone: "violet",
        title: "Koyu tema",
        subtitle: darkOn ? "Gece moru açık" : "Lavanta sis açık",
        toggle: { value: darkOn, onValueChange: toggleTheme },
        testID: "menu-theme-toggle",
      },
      {
        key: "ayarlar",
        icon: "settings",
        tone: "neutral",
        title: "Ayarlar",
        subtitle: user ? "Bildirimler, lig, hesap ve güvenlik" : "Görünüm, lig ve bildirim seçimi",
        onPress: () => go("/ayarlar"),
      },
      {
        key: "sehir",
        icon: "location",
        tone: "cyan",
        title: "Şehir",
        value: scope.cityLabel || "Seç",
        onPress: () => scope.openScopeSheet("city"),
      },
    ];
    if (user) {
      list.push({
        key: "hesabim",
        icon: "person",
        tone: "violet",
        title: "Hesabım",
        subtitle: "Bilgiler, şifre, engellenenler",
        onPress: openAccount,
      });
    }
    return list;
  }, [darkOn, go, openAccount, scope, toggleTheme, user]);

  const dangerItems = useMemo<MenuItemSpec[]>(
    () =>
      user
        ? [
            {
              key: "hesap-sil",
              icon: "trash",
              title: "Hesabı sil",
              subtitle: "Hesabını ve kişisel verilerini kalıcı olarak sil",
              destructive: true,
              onPress: () => go("/hesap-sil"),
            },
          ]
        : [],
    [go, user]
  );

  const socials = useMemo(() => {
    const list: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; url: string }[] = [];
    if (igUrl) list.push({ key: "ig", icon: "logo-instagram", label: `Instagram, ${scope.cityLabel} hesabı`, url: igUrl });
    if (channelUrl) list.push({ key: "yt", icon: "logo-youtube", label: "YouTube kanalı", url: channelUrl });
    list.push({ key: "site", icon: "globe-outline", label: "elitlig.com", url: SITE_URL });
    return list;
  }, [channelUrl, igUrl, scope.cityLabel]);

  /* ------------------------------ ÇİZİM ---------------------------------- */

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Menü" scrollY={scrollY} actions={bell ? [bell] : undefined} />

      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={
          user ? <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} /> : undefined
        }
      >
        {auth.initializing ? (
          <Skeleton height={232} radius="xxl" style={styles.heroSkeleton} />
        ) : (
          <Reveal distance={12}>
            <ProfileHero
              user={heroUser}
              stats={heroStats}
              level={heroLevel}
              onAccount={openAccount}
              onSignIn={openSignIn}
              onRegister={openRegister}
            />
          </Reveal>
        )}

        {/* Yönetici üye görünümünde: yönetim moduna tek dokunuşla dönüş. */}
        {adminMode.memberPreview ? (
          <Touchable
            feedback="card"
            haptic="selection"
            onPress={adminMode.enterAdmin}
            style={styles.adminGate}
            accessibilityRole="button"
            accessibilityLabel="Yönetim moduna geç"
            testID="menu-enter-admin"
          >
            <View style={styles.adminGateIcon}>
              <Ionicons name="shield-checkmark" size={18} color={colors.adminAccent} />
            </View>
            <View style={styles.adminGateBody}>
              <Text style={styles.adminGateTitle} numberOfLines={1} {...textScale.dense}>
                Yönetim moduna geç
              </Text>
              <Text style={styles.adminGateHint} numberOfLines={1} {...textScale.dense}>
                Şu an üye gözünden bakıyorsun
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.adminAccent} />
          </Touchable>
        ) : null}

        {/* HIZLI ERİŞİM — dört karo + Günün Testi şeridi. */}
        <View style={styles.section}>
          <QuickGrid items={quick} />
          <DailyStrip correct={dailyCorrect} onPress={() => go("/gunun")} />
        </View>

        <MenuGroup title="Takip" icon="star" tone="violet" items={followItems} style={styles.section} />

        <MenuGroup
          title="Görevler ve ödüller"
          icon="trophy"
          tone="gold"
          items={rewardItems}
          style={styles.section}
        />

        <MenuGroup title="Lig ve istatistik" icon="stats-chart" tone="cyan" style={styles.section}>
          {/* Karşılaştırma çifti — iki araç yan yana; kartın üst bandı. */}
          <View style={styles.comparePair}>
            <CompareTile
              icon="git-compare"
              title="Takım karşılaştır"
              hint="İki takım yan yana"
              onPress={() => go("/h2h")}
            />
            <View style={styles.compareDivider} />
            <CompareTile
              icon="people"
              title="Oyuncu karşılaştır"
              hint="Gol, maç, değer"
              onPress={() => go("/oyuncu-karsilastir")}
            />
          </View>
          <View style={styles.compareRule} />
          {leagueItems.map((item, index) => (
            <MenuGroupRow key={item.key} item={item} last={index === leagueItems.length - 1} />
          ))}
        </MenuGroup>

        <MenuGroup title="Destek" icon="help-buoy" tone="mint" items={supportItems} style={styles.section} />

        <MenuGroup title="Ayarlar" icon="settings" tone="neutral" items={settingsItems} style={styles.section} />

        {dangerItems.length ? <MenuGroup items={dangerItems} style={styles.dangerGroup} /> : null}

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
      </ScrollView>
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================= */

/** Günün Testi şeridi — bugün oynandıysa skor, oynanmadıysa çağrı. */
const DailyStrip = React.memo(function DailyStrip({
  correct,
  onPress,
}: {
  correct: number | null;
  onPress: () => void;
}) {
  const played = correct != null;
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={played ? `Günün Testi: bugün ${correct}/10 doğru` : "Günün Testi: bugünün 10 sorusu seni bekliyor"}
      style={styles.daily}
    >
      <IconTile icon={played ? "checkmark-done" : "bulb"} tone="mint" size={36} glow={false} />
      <View style={styles.dailyBody}>
        <Text style={styles.dailyTitle} numberOfLines={1} {...textScale.dense}>
          Günün Testi
        </Text>
        <Text style={styles.dailyHint} numberOfLines={1} {...textScale.dense}>
          {played ? "Bugünkü testi bitirdin · yarın yeni sorular" : "Herkese aynı 10 soru, günde bir kez"}
        </Text>
      </View>
      {played ? (
        <View style={styles.dailyScore}>
          <Text style={styles.dailyScoreValue} {...textScale.badge}>
            {correct}
          </Text>
          <Text style={styles.dailyScoreUnit} {...textScale.badge}>
            /10
          </Text>
        </View>
      ) : (
        <View style={styles.dailyCta}>
          <Text style={styles.dailyCtaText} {...textScale.badge}>
            Oyna
          </Text>
          <Ionicons name="play" size={11} color={colors.brandAccent} />
        </View>
      )}
    </Touchable>
  );
});

/** Lig ve istatistik kartının üst bandındaki karşılaştırma aracı. */
const CompareTile = React.memo(function CompareTile({
  icon,
  title,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${hint}`}
      style={styles.compareTile}
    >
      <IconTile icon={icon} tone="signature" size={32} glow={false} />
      <Text style={styles.compareTitle} numberOfLines={2} {...textScale.dense}>
        {title}
      </Text>
      <Text style={styles.compareHint} numberOfLines={1} {...textScale.dense}>
        {hint}
      </Text>
    </Touchable>
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
    paddingBottom: space.huge,
  },
  section: {
    marginTop: space.xl,
  },
  dangerGroup: {
    marginTop: space.md,
  },
  heroSkeleton: {
    marginTop: space.sm,
  },

  adminGate: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.adminBar,
    borderWidth: hairline,
    borderColor: colors.adminBarBorder,
  },
  adminGateIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.adminCapsule,
  },
  adminGateBody: { flex: 1, minWidth: 0 },
  adminGateTitle: { ...type.h3, color: colors.onDark },
  adminGateHint: { ...type.caption, color: colors.onDarkMuted, marginTop: 1 },

  daily: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  dailyBody: { flex: 1, minWidth: 0, gap: 1 },
  dailyTitle: { ...type.h4, color: colors.textPrimary },
  dailyHint: { ...type.caption, color: colors.textTertiary },
  dailyScore: { flexDirection: "row", alignItems: "baseline" },
  dailyScoreValue: { ...type.scoreSm, color: colors.win },
  dailyScoreUnit: { ...type.numSm, color: colors.textTertiary },
  dailyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  dailyCtaText: { ...type.labelXs, color: colors.brandAccent },

  comparePair: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  compareTile: {
    flex: 1,
    gap: space.xs,
    padding: space.md,
  },
  compareTitle: { ...type.h4, color: colors.textPrimary, marginTop: space.xs },
  compareHint: { ...type.caption, color: colors.textTertiary },
  compareDivider: { width: hairline, backgroundColor: colors.separator, marginVertical: space.md },
  compareRule: { height: hairline, backgroundColor: colors.separator },

  footer: {
    alignItems: "center",
    gap: space.md,
    marginTop: space.xxl,
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
    fontFamily: fonts.medium,
    color: colors.textTertiary,
    textAlign: "center",
  },
});
