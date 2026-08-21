/**
 * MENÜ — uygulamanın tamamının haritası.
 *
 * NEDEN VAR: altı sekmeye altı bölüm sığar; uygulamada ise otuzdan fazla ekran
 * var (oyunlar, ligler, favoriler, arşiv, haberler, kulüp işlemleri, kurallar,
 * iletişim…). Bunların hepsini Profil sekmesinin altına yığmak Profil'i 27
 * satırlık bir çekmeceye çeviriyordu ve "hesabım" ile "penaltı oyunu" aynı
 * listede yan yana duruyordu. Menü, KEŞİF ve ARAÇ niteliğindeki her şeyin
 * evidir; Profil ise yalnız KİMLİK ve TERCİH'tir.
 *
 * NEDEN OYUNLAR BURADA: oyunlar günde bir kez, keyif için açılır; kalıcı sekme
 * çubuğundaki bir yuvayı hak etmiyordu. Menü'nün ilk kısayolu ve ilk bölümü
 * olarak, "arayan bulur" mesafesinde duruyor. `/(tabs)/oyunlar` rotası aynen
 * korundu — mevcut derin bağlantılar ve oyun hatırlatma bildirimleri kırılmadı.
 *
 * ROL BAZLI GÖRÜNÜRLÜK: Kulüp bölümü yalnız yetkisi olana çizilir. Takım
 * başkanına kadro/maç merkezi/talepler doğrudan satır olarak verilir — panelin
 * içine girip orada aramak zorunda kalmasın diye; en sık yapılan üç iş bunlar.
 *
 * DÜZEN: üstte 8 kutuluk kısayol ızgarası (64px×2 satır), altında gruplanmış
 * liste. Izgara en çok kullanılan sekizi ikonla verir; liste geri kalanını
 * açıklamasıyla. Aynı hedefin ikisinde birden görünmesi bilinçlidir: ızgara
 * kas hafızası, liste keşif içindir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { SectionList, StyleSheet, View, type SectionListRenderItemInfo } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ActionRow,
  ActionTile,
  ListRow,
  ScreenHeader,
  SectionHeader,
  useHeaderScroll,
  type Tone,
} from "@/components/ui";
import { unreadBadgeLabel, useUnreadCount } from "@/hooks/useUnreadCount";
import { openLink } from "@/lib/links";
import { instagramUrl } from "@/lib/socials";
import { youtubeChannelUrl } from "@/lib/youtube";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, space } from "@/theme";

/** Web sitesi — üyelik ve kurumsal sayfalar orada yaşıyor. */
const SITE_URL = "https://elitlig.com";

/** Takım başkanı sayılan profil tipleri (sunucudaki `profile_type` değerleri). */
const PRESIDENT_PROFILES = new Set(["takim_baskani", "double"]);

interface MenuItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: Tone;
  /** Rota ya da dış bağlantı — ikisinden biri. */
  route?: string;
  url?: string;
}

interface MenuSection {
  key: string;
  title: string;
  data: MenuItem[];
}

/** Grup içi konum — ListRow köşe yuvarlamasını ve ayracı buradan alır. */
function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total === 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

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
  return (
    <ListRow
      position={position}
      title={item.title}
      subtitle={item.subtitle}
      value={item.badge}
      leading={{ icon: item.icon, tone: item.tone }}
      onPress={handlePress}
    />
  );
});

export default function MenuScreen() {
  const router = useRouter();
  const auth = useAuth();
  const scope = useScope();
  const unread = useUnreadCount();
  const { scrollY, scrollProps } = useHeaderScroll();

  const user = auth.user;
  const isPresident = Boolean(user && PRESIDENT_PROFILES.has(String(user.profile_type ?? "")));
  const igUrl = instagramUrl(scope.cityLabel);
  const channelUrl = youtubeChannelUrl(scope.cityLabel);

  const go = useCallback((route: string) => router.push(route as never), [router]);

  const onSelect = useCallback(
    (item: MenuItem) => {
      if (item.url) {
        void openLink(item.url);
        return;
      }
      if (item.route) go(item.route);
    },
    [go],
  );

  const sections = useMemo<MenuSection[]>(() => {
    const result: MenuSection[] = [];

    /* 1 — OYUNLAR: sekmeden inen bölüm, menünün ilk grubu. */
    result.push({
      key: "oyunlar",
      title: "Oyunlar",
      data: [
        {
          key: "oyun-merkezi",
          icon: "game-controller",
          title: "Oyun Merkezi",
          subtitle: "Tüm oyunlar, rozetler ve günlük seri",
          tone: "brand",
          route: "/(tabs)/oyunlar",
        },
        {
          key: "gunun",
          icon: "help-circle",
          title: "Günün Testi",
          subtitle: "Her gün yeni soru, seriyi bozma",
          route: "/gunun",
        },
        {
          key: "arena",
          icon: "flash",
          title: "Arena",
          subtitle: "Süreye karşı bilgi yarışı",
          route: "/arena",
        },
        {
          key: "penalti",
          icon: "football",
          title: "Penaltı",
          subtitle: "Nişan al, seriyi uzat",
          route: "/penalti",
        },
        {
          key: "sektir",
          icon: "tennisball",
          title: "Top Sektir",
          subtitle: "Engelleri aş, rekoru kır",
          route: "/sektir",
        },
        {
          key: "kimbu",
          icon: "eye",
          title: "Kim Bu?",
          subtitle: "Silüetten oyuncuyu bul",
          route: "/kimbu",
        },
        {
          key: "slalom",
          icon: "navigate",
          title: "Slalom",
          subtitle: "Topu kaptırmadan sür",
          route: "/slalom",
        },
        {
          key: "siralama",
          icon: "podium",
          title: "Rekor Tablosu",
          subtitle: "Oyun rekorları lider tablosu",
          tone: "warn",
          route: "/siralama",
        },
      ],
    });

    /* 2 — LİG: kapsam bağlı her şey. */
    result.push({
      key: "lig",
      title: "Lig",
      data: [
        {
          key: "ligler",
          icon: "trophy",
          title: "Ligler",
          subtitle: "Puan durumu, fikstür, istatistik, arşiv",
          tone: "brand",
          route: "/(tabs)/ligler",
        },
        {
          key: "canli",
          icon: "radio",
          title: "Canlı Maçlar",
          subtitle: "Şu anda oynanan maçlar",
          tone: "danger",
          route: "/canli",
        },
        {
          key: "favoriler",
          icon: "star",
          title: "Favorilerim",
          subtitle: "Takımlar, ligler ve maçlar",
          tone: "warn",
          route: "/(tabs)/favoriler",
        },
        {
          key: "haberler",
          icon: "newspaper",
          title: "Haberler",
          subtitle: "Manşetler, transferler, duyurular",
          route: "/(tabs)/ligler?tab=haberler",
        },
        {
          key: "arsiv",
          icon: "archive",
          title: "Arşiv",
          subtitle: "Tamamlanan lig ve sezonlar",
          route: "/(tabs)/ligler?tab=arsiv",
        },
        {
          key: "h2h",
          icon: "git-compare",
          title: "Takım Karşılaştır",
          subtitle: "İki takımı yan yana koy",
          route: "/h2h",
        },
        {
          key: "sehir",
          icon: "map",
          title: "Şehirler",
          subtitle: "Haritadan şehir seç",
          route: "/sehir",
        },
      ],
    });

    /* 3 — KULÜP: yalnız yetkisi olana. En sık yapılan üç iş panelin İÇİNE
       girmeden doğrudan satır olarak verilir. */
    if (user) {
      const club: MenuItem[] = [];

      if (auth.isManagement) {
        club.push(
          {
            key: "yonetim",
            icon: "shield-checkmark",
            title: "Yönetim Paneli",
            subtitle: "Maç, saha ve mesaj yönetimi",
            tone: "brand",
            route: "/yonetim",
          },
          {
            key: "yonetim-maclar",
            icon: "calendar",
            title: "Maç Yönetimi",
            subtitle: "Fikstür, skor ve durum düzenleme",
            route: "/yonetim/maclar",
          },
          {
            key: "yonetim-sahalar",
            icon: "grid",
            title: "Saha ve Talepler",
            subtitle: "Slot panosu ve maç talebi onayı",
            route: "/yonetim/sahalar",
          },
        );
      }

      if (isPresident) {
        club.push(
          {
            key: "takimim",
            icon: "home",
            title: "Takım Panelim",
            subtitle: "Genel bakış, kasa, davetler",
            tone: "brand",
            route: "/takimim",
          },
          {
            key: "kadro",
            icon: "people",
            title: "Kadro Yönetimi",
            subtitle: "Oyuncu düzenle, forma no, diziliş, fesih",
            route: "/takimim/kadro",
          },
          {
            key: "mac-merkezi",
            icon: "clipboard",
            title: "Maç Merkezi",
            subtitle: "Maç kadrosu, uygunluk, değerlendirme",
            route: "/takimim/mac-merkezi",
          },
          {
            key: "mac-al",
            icon: "add-circle",
            title: "Maç Talepleri",
            subtitle: "Saha panosundan maç al, taleplerini izle",
            route: "/takimim/mac-al",
          },
          {
            key: "kasa",
            icon: "wallet",
            title: "Kulüp Kasası",
            subtitle: "Gelir, gider ve bakiye",
            route: "/takimim/kasa",
          },
        );
      }

      club.push(
        {
          key: "mesajlarim",
          icon: "chatbubbles",
          title: "Mesajlarım",
          subtitle: "Yönetimle yazışmaların",
          badge: unreadBadgeLabel(unread.messages),
          route: "/mesajlarim",
        },
        {
          key: "bildirimler",
          icon: "notifications",
          title: "Bildirimler",
          subtitle: "Teklifler, cezalar, duyurular",
          badge: unreadBadgeLabel(unread.notifications),
          route: "/bildirimler",
        },
      );

      result.push({ key: "kulup", title: "Kulüp", data: club });
    }

    /* 4 — BİLGİ */
    result.push({
      key: "bilgi",
      title: "Bilgi",
      data: [
        {
          key: "kurallar",
          icon: "book",
          title: "Lig Kuralları",
          subtitle: "Resmî müsabaka kuralları",
          route: "/kurallar",
        },
        {
          key: "cezalar",
          icon: "hammer",
          title: "Cezalar",
          subtitle: "Disiplin talimatı ve kayıtlar",
          route: "/cezalar",
        },
        {
          key: "iletisim",
          icon: "mail",
          title: "İletişim",
          subtitle: "Telefon, WhatsApp, e-posta",
          route: "/iletisim",
        },
      ],
    });

    /* 5 — BİZİ TAKİP ET: şehir hesabı yoksa satır hiç çizilmez. */
    const social: MenuItem[] = [];
    if (igUrl) {
      social.push({
        key: "instagram",
        icon: "logo-instagram",
        title: "Instagram",
        subtitle: `${scope.cityLabel} hesabı`,
        url: igUrl,
      });
    }
    if (channelUrl) {
      social.push({
        key: "youtube",
        icon: "logo-youtube",
        title: "YouTube",
        subtitle: "Canlı yayınlar ve maç özetleri",
        url: channelUrl,
      });
    }
    social.push({
      key: "site",
      icon: "globe",
      title: "elitlig.com",
      subtitle: "Web sitemiz",
      url: SITE_URL,
    });
    result.push({ key: "sosyal", title: "Bizi takip et", data: social });

    return result;
  }, [
    auth.isManagement,
    channelUrl,
    igUrl,
    isPresident,
    scope.cityLabel,
    unread.messages,
    unread.notifications,
    user,
  ]);

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<MenuItem, MenuSection>) => (
      <MenuRow item={item} position={rowPosition(index, section.data.length)} onSelect={onSelect} />
    ),
    [onSelect],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: MenuSection }) => <SectionHeader title={section.title} />,
    [],
  );

  const renderSectionFooter = useCallback(() => <View style={styles.sectionGap} />, []);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Menü" overline="ELİTLİG" scrollY={scrollY} />

      <SectionList
        {...scrollProps}
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.shortcuts}>
            <ActionRow columns={4}>
              <ActionTile
                icon="game-controller"
                label="Oyunlar"
                tone="accent"
                onPress={() => go("/(tabs)/oyunlar")}
              />
              <ActionTile icon="trophy" label="Ligler" onPress={() => go("/(tabs)/ligler")} />
              <ActionTile icon="radio" label="Canlı" tone="live" onPress={() => go("/canli")} />
              <ActionTile
                icon="star"
                label="Favoriler"
                tone="warn"
                onPress={() => go("/(tabs)/favoriler")}
              />
              <ActionTile
                icon="newspaper"
                label="Haberler"
                tone="neutral"
                onPress={() => go("/(tabs)/ligler?tab=haberler")}
              />
              <ActionTile
                icon="chatbubbles"
                label="Mesajlar"
                badge={unread.messages}
                onPress={() => go("/mesajlarim")}
              />
              <ActionTile
                icon="notifications"
                label="Bildirim"
                badge={unread.notifications}
                onPress={() => go("/bildirimler")}
              />
              <ActionTile icon="map" label="Şehirler" tone="neutral" onPress={() => go("/sehir")} />
            </ActionRow>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    paddingBottom: space.xxxl,
  },
  shortcuts: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.m,
    paddingBottom: space.xs,
  },
  sectionGap: {
    height: space.lg,
  },
});
