/**
 * SEKME ÇUBUĞU — uygulamanın iki yüzü, tek sekme gezgini.
 *
 * ÜYE UYGULAMASI (misafir, üye, takım başkanı, oyuncu — ve "üye gözünden"
 * bakan yönetici): Maçlar · Lig · Yönetim · Mesajlar · Menü. Uygulama MAÇLAR
 * ile açılır (rota adı tarihsel olarak `skorlar`).
 *   · Maçlar   → "Şu an ve bugün ne oynanıyor?"
 *   · Lig      → "Ligde durum ne?" Puan · Fikstür · Oyuncular · İstatistik · Haber
 *   · Yönetim  → "Benim işim ne?" (rota `kulubum`) Kulübüm / Kariyerim
 *   · Mesajlar → "Bana ne geldi?" Sohbetler
 *   · Menü     → Kimlik, oyun merkezi, takip, lig araçları, destek, ayarlar
 *
 * YÖNETİM MODU (yönetim rolündeki hesap; providers/AdminModeProvider):
 * uygulama bambaşka bir kimliğe bürünür — gece laciverti bar, altın vurgu:
 *   · Panel    → yönetim ana ekranı: sayaçlar, uygulamalar, bugün
 *   · İşler    → Yapılacaklar
 *   · ◉        → UYGULAMALAR çekmecesi (rota değil): Muhasebe, Projeler,
 *                Yayın stüdyosu, Talepler… her şey iki dokunuş
 *   · Mesajlar → sohbetler + üye mesajları
 *   · Lig      → Lig yönetimi (maç günü, ligler, takımlar, oyuncular, disiplin)
 * Geçiş tek düğmedir: yönetim modunda "Üye gözünden gör"; üye görünümünde
 * barın üstündeki "Yönetime dön" şeridi.
 *
 * GİZLİ SEKMELER (`href: null`) — eski derin bağlantılar ve kısayollar:
 *   index → mod kökü · maclar → skorlar · favoriler → takip · profil → menu ·
 *   takip · takimlar/oyuncular → ligler · oyunlar (oyun merkezi). Diğer modun
 *   sekmeleri de gizli rota olarak durur; çubukta görünmezler.
 *
 * Çubuğun çizimi `components/ui/GlowTabBar.tsx` içindedir.
 *
 * İlk açılışta (karşılama akışı henüz tamamlanmamışsa) sekmeler yerine
 * /sehir ekranına yönlendirilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, Tabs, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppDrawer } from "@/components/admin/home/AppDrawer";
import { GlowTabBar, Touchable, type GlowTab, type GlowTabCenter } from "@/components/ui";
import { useAdminCounters } from "@/hooks/useAdminCounters";
import { useLiveFavoriteCount } from "@/hooks/useLiveFavoriteCount";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { INTRO_SEEN_KEY } from "@/lib/storage";
import { ADMIN_HOME, MEMBER_HOME, useAdminMode } from "@/providers/AdminModeProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/** Uygulama Maçlar ile açılır; "/" (index) yalnız yönlendirmedir. */
export const unstable_settings = { initialRouteName: "skorlar" };

const ADMIN_TAB_PREFIX = "yonetim-";

export default function TabsLayout() {
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);
  const mode = useAdminMode();
  const router = useRouter();
  const segments = useSegments();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Rozet kaynakları: hepsi kendi içinde "girişsizde sorgu açma" ve
  // "uygulama arka plandayken yoklama yapma" kurallarını uygular.
  const live = useLiveFavoriteCount();
  const unread = useUnreadCount();
  const counters = useAdminCounters(mode.adminActive);

  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then((value) => setIntroSeen(Boolean(value)))
      .catch(() => setIntroSeen(true)); // Depolama okunamazsa girişte takılı kalma.
  }, []);

  /* MOD ↔ SEKME EŞLEMESİ. Mod değiştiğinde (giriş, çıkış, açılışta saklanan
     tercih) açık sekme öbür moda aitse o modun köküne inilir. Üstte bir detay
     ekranı ya da giriş modalı varken BEKLENİR: yönlendirme, kullanıcı sekmelere
     döndüğü anda yapılır — modalın altından sekme değiştirip kapanışı bozmaz. */
  const lastAdmin = useRef<boolean | null>(null);
  const pending = useRef<"admin" | "member" | null>(null);
  const topGroup = segments[0] as string | undefined;
  const topTab = (segments as string[])[1] ?? "index";
  useEffect(() => {
    if (!mode.ready) return;
    if (lastAdmin.current !== mode.adminActive) {
      if (lastAdmin.current !== null || mode.adminActive) pending.current = mode.adminActive ? "admin" : "member";
      lastAdmin.current = mode.adminActive;
    }
    if (!pending.current || topGroup !== "(tabs)") return;
    const target = pending.current;
    pending.current = null;
    const onAdminTab = topTab.startsWith(ADMIN_TAB_PREFIX);
    if (target === "admin" && !onAdminTab) router.replace(ADMIN_HOME);
    else if (target === "member" && onAdminTab) router.replace(MEMBER_HOME);
  }, [mode.adminActive, mode.ready, router, topGroup, topTab]);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  if (introSeen === null) return null; // Bayrak okunana dek kısa boşluk.
  if (!introSeen) return <Redirect href="/sehir" />;

  /** Üye uygulamasının sekmeleri — SIRA BURADAKİ SIRADIR. */
  const memberTabs: readonly GlowTab[] = [
    { name: "skorlar", label: "Maçlar", icon: "football", badge: live.count, badgeTone: "live" },
    { name: "ligler", label: "Lig", icon: "trophy", accessibilityLabel: "Lig: puan, fikstür, oyuncular, istatistik, haber" },
    { name: "kulubum", label: "Yönetim", icon: "shield", accessibilityLabel: "Yönetim: takımın, kariyerin ve araçların" },
    // Okunmamış bildirim + sohbet mesajı: hepsi Mesajlar'da.
    { name: "mesajlar", label: "Mesajlar", icon: "chatbubbles", badge: unread.messages },
    { name: "menu", label: "Menü", icon: "menu", accessibilityLabel: "Menü: profil, oyun merkezi, lig araçları, ayarlar" },
  ];

  /** Yönetim modunun sekmeleri; ortadaki düğme `adminCenter`. */
  const adminTabs: readonly GlowTab[] = [
    { name: "yonetim-panel", label: "Panel", icon: "speedometer", accessibilityLabel: "Panel: yönetim ana ekranı" },
    {
      name: "yonetim-isler",
      label: "İşler",
      icon: "checkbox",
      badge: counters.openTodos ?? undefined,
      badgeTone: counters.overdueTodos > 0 ? "live" : "unread",
      accessibilityLabel: "İşler: yapılacaklar listesi",
    },
    { name: "mesajlar", label: "Mesajlar", icon: "chatbubbles", badge: counters.messages },
    { name: "yonetim-lig", label: "Lig", icon: "trophy", accessibilityLabel: "Lig yönetimi" },
  ];

  const adminCenter: GlowTabCenter = {
    icon: "apps",
    label: "Uygulamalar",
    onPress: openDrawer,
    accessibilityLabel: "Uygulamalar: muhasebe, projeler, yayın stüdyosu ve diğer araçlar",
    badge: counters.requests ?? undefined,
  };

  /* Yöneticinin üye görünümü: barın üstünde tek dokunuşluk dönüş şeridi. */
  const banner = mode.memberPreview ? (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={mode.enterAdmin}
      style={styles.banner}
      accessibilityRole="button"
      accessibilityLabel="Üye görünümündesin. Yönetim moduna dön"
      testID="member-preview-banner"
    >
      <Ionicons name="eye" size={14} color={colors.adminAccent} />
      <Text style={styles.bannerText} numberOfLines={1} {...textScale.dense}>
        Üye görünümündesin
      </Text>
      <View style={styles.bannerAction}>
        <Text style={styles.bannerActionText} numberOfLines={1} {...textScale.badge}>
          Yönetime dön
        </Text>
        <Ionicons name="arrow-forward" size={12} color={colors.adminAccentInk} />
      </View>
    </Touchable>
  ) : null;

  return (
    <>
      <Tabs
        /* GECE TEMASI: sekme değişince içerik kapsülle aynı yöne hafifçe
           kayarak gelir (PUSH SLIDE); alt menünün hareketiyle tek cümle. */
        screenOptions={{ headerShown: false, animation: "shift" }}
        tabBar={(props) =>
          mode.adminActive ? (
            <GlowTabBar {...props} tabs={adminTabs} variant="admin" center={adminCenter} />
          ) : (
            <GlowTabBar {...props} tabs={memberTabs} banner={banner} />
          )
        }
      >
        <Tabs.Screen name="skorlar" options={{ title: "Maçlar" }} />
        <Tabs.Screen name="ligler" options={{ title: "Lig" }} />
        <Tabs.Screen name="kulubum" options={{ title: "Yönetim" }} />
        <Tabs.Screen name="mesajlar" options={{ title: "Mesajlar" }} />
        <Tabs.Screen name="menu" options={{ title: "Menü" }} />

        {/* — Yönetim modunun sekmeleri — */}
        <Tabs.Screen name="yonetim-panel" options={{ title: "Panel" }} />
        <Tabs.Screen name="yonetim-isler" options={{ title: "İşler" }} />
        <Tabs.Screen name="yonetim-lig" options={{ title: "Lig yönetimi" }} />

        {/* — Çubukta yuvası olmayan, ama bu gruba ait ekranlar —
            Kısayollardan ve derin bağlantılardan açılırlar; sekme
            çubuğu ekranda kalır. */}
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="maclar" options={{ href: null }} />
        <Tabs.Screen name="favoriler" options={{ href: null }} />
        <Tabs.Screen name="takip" options={{ href: null }} />
        <Tabs.Screen name="profil" options={{ href: null }} />
        <Tabs.Screen name="takimlar" options={{ href: null }} />
        <Tabs.Screen name="oyuncular" options={{ href: null }} />
        <Tabs.Screen name="oyunlar" options={{ href: null }} />
      </Tabs>

      {/* Uygulama çekmecesi — yönetim barının ortasındaki düğme açar. */}
      {mode.adminActive ? <AppDrawer visible={drawerOpen} onClose={closeDrawer} counters={counters} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 36,
    marginHorizontal: layout.screenPadding,
    marginBottom: space.xs,
    paddingLeft: space.md,
    paddingRight: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.adminBar,
    borderWidth: hairline,
    borderColor: colors.adminBarBorder,
  },
  bannerText: {
    ...type.labelSm,
    color: colors.onDark,
    flex: 1,
  },
  bannerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    height: 26,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.adminAccent,
  },
  bannerActionText: {
    ...type.micro,
    letterSpacing: 0,
    color: colors.adminAccentInk,
  },
});
