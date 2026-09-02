/**
 * MENÜ — KEŞİF tarafının haritası. Kişisel olan hiçbir şey burada yoktur.
 *
 * TEK KAPI KURALI (sadeleştirme): bir hedefe uygulamada TEK bir mantıklı
 * yerden ulaşılır. Menü ile Profil arasındaki iş bölümü şudur:
 *
 *   MENÜ   = herkese aynı görünen şeyler → lig, oyun, kural, iletişim.
 *   PROFİL = yalnız sana ait olanlar → hesap, kulüp, kariyer, tercihler.
 *
 * NEDEN DEĞİŞTİ: önceki sürümde Menü 34 satırdı ve Profil'in neredeyse
 * yarısını tekrar ediyordu — Yönetim Paneli, Takım Panelim, Mesajlarım,
 * Bildirimler, Favorilerim hem burada hem oradaydı. Üstüne, listedeki
 * hedeflerin aynısını gösteren 8 kutuluk bir kısayol ızgarası vardı; yani bazı
 * ekranlara tek bir sekmenin İÇİNDE bile iki ayrı yerden gidiliyordu.
 * Kullanıcı "aynı yere farklı menü basamaklarından erişiliyor" diyerek haklı
 * olarak şikâyet etti. Menü artık dokuz satır ve hiçbiri Profil'de yok.
 *
 * NEDEN OYUNLAR TEK SATIR: altı oyunun her biri ayrı satırdı ve hepsi zaten
 * Oyun Merkezi ekranında listeleniyordu. Menü artık yalnız merkezin kapısını
 * ve rekor tablosunu taşır.
 *
 * NEDEN HABERLER/ARŞİV YOK: ikisi de `/(tabs)/ligler` içindeki birer sekme.
 * Menüden ayrı satır olarak vermek, aynı ekrana ikinci bir kapı açıyordu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { SectionList, StyleSheet, View, type SectionListRenderItemInfo } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ListRow,
  ScreenHeader,
  SectionHeader,
  useHeaderScroll,
  type Tone,
} from "@/components/ui";
import { openLink } from "@/lib/links";
import { instagramUrl } from "@/lib/socials";
import { youtubeChannelUrl } from "@/lib/youtube";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, space } from "@/theme";

/** Web sitesi — üyelik ve kurumsal sayfalar orada yaşıyor. */
const SITE_URL = "https://elitlig.com";

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
      style={styles.rowInset}
    />
  );
});

export default function MenuScreen() {
  const router = useRouter();
  const scope = useScope();
  const { scrollY, scrollProps } = useHeaderScroll();

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

  /*
   * RENK KURALI — İKON RENGİ ANLAM TAŞIR, SÜS DEĞİLDİR.
   *
   * Menü daha önce her satıra ayrı bir ton veriyordu: mor kupa, kırmızı
   * anten, mavi karşılaştır, mavi kumanda, turuncu sütun, kırmızı çekiç,
   * yeşil telefon. Yan yana dizilince on bir satırlık liste yedi renkli bir
   * şerit oluyor ve hiçbir renk bir şey söylemiyordu — göz "hangisi önemli"
   * sorusuna cevap bulamıyordu.
   *
   * Artık ton yalnız GERÇEKTEN durum bildiren yerlerde var:
   *   · "Canlı Maçlar" → `live` (şu an oynanan maç varsa oraya gidilir)
   *   · "Ligler"       → `brand` (bölümün ana kapısı)
   *   · YouTube        → `danger` (markanın kendi rengi)
   * Kalan satırlar `textSecondary` ikonla durur; liste tek sesle okunur.
   */
  const sections = useMemo<MenuSection[]>(() => {
    const result: MenuSection[] = [];

    /* 1 — LİG: kapsam (şehir/lig/sezon) bazlı her şeyin kapısı. */
    result.push({
      key: "lig",
      title: "Lig",
      data: [
        {
          key: "ligler",
          icon: "trophy",
          title: "Ligler",
          subtitle: "Puan durumu, fikstür, istatistik, haber, arşiv",
          tone: "brand",
          route: "/(tabs)/ligler",
        },
        {
          key: "canli",
          icon: "radio",
          title: "Canlı Maçlar",
          subtitle: "Şu anda oynanan maçlar",
          tone: "live",
          route: "/canli",
        },
        {
          key: "h2h",
          icon: "git-compare",
          title: "Takım Karşılaştır",
          subtitle: "İki takımı yan yana koy",
          route: "/h2h",
        },
      ],
    });

    /* 2 — OYUNLAR: tek kapı. Oyunların kendisi Oyun Merkezi'nde listelenir. */
    result.push({
      key: "oyunlar",
      title: "Oyunlar",
      data: [
        {
          key: "oyun-merkezi",
          icon: "game-controller",
          title: "Oyun Merkezi",
          subtitle: "Altı oyun, rozetler ve günlük seri",
          route: "/(tabs)/oyunlar",
        },
        {
          key: "rekorlar",
          icon: "podium",
          title: "Rekor Tablosu",
          subtitle: "Oyun rekorları lider tablosu",
          route: "/siralama",
        },
      ],
    });

    /* 3 — BİLGİ: kural ve başvuru metinleri. */
    result.push({
      key: "bilgi",
      title: "Bilgi",
      data: [
        {
          key: "kurallar",
          icon: "document-text",
          title: "Lig Kuralları",
          subtitle: "Resmî müsabaka kuralları",
          route: "/kurallar",
        },
        {
          key: "cezalar",
          icon: "hammer",
          title: "Cezalar",
          subtitle: "Disiplin talimatı ve kurul kararları",
          route: "/cezalar",
        },
        {
          key: "iletisim",
          icon: "call",
          title: "İletişim",
          subtitle: "Telefon, WhatsApp, e-posta",
          route: "/iletisim",
        },
      ],
    });

    /* 4 — SOSYAL: dış bağlantılar. */
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
        tone: "danger",
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
  }, [channelUrl, igUrl, scope.cityLabel]);

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
      {/* GERİ DÜĞMESİ VAR: menü artık sekme çubuğunda yuvası olan bir kök
          ekran değil (bkz. app/(tabs)/_layout.tsx), Profil'deki kısayoldan
          açılıyor. Geri yığını boşsa geldiği yere — Profil'e — dönülür. */}
      <ScreenHeader
        title="Menü"
        overline="ELİTLİG"
        back
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profil"))}
        scrollY={scrollY}
      />

      <SectionList
        {...scrollProps}
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
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
    paddingTop: space.md,
    paddingBottom: space.xxxl,
  },
  /*
   * SATIRLAR BÖLÜM BAŞLIĞIYLA AYNI HİZADAN BAŞLAR.
   *
   * `SectionList` yatay boşluk vermez ve `ListRow` kendi kenar boşluğunu
   * taşımaz; ikisi bir araya gelince satırlar ekranın iki ucuna dayanıyor,
   * başlıklar ise 16px içeriden başlıyordu. Aynı ekranda iki hiza olması
   * menüyü "kutuları taşmış" gösteriyordu. Yuvarlak köşeler zaten satırın
   * grup içindeki konumundan geliyor: kenar boşluğu eklenince grup, ekranın
   * geri kalanıyla aynı genişlikte bir karta dönüşür.
   */
  rowInset: {
    marginHorizontal: layout.screenPadding,
  },
  sectionGap: {
    height: space.md,
  },
});
