/**
 * HABER DETAYI — okuma ekranı (GET /api/news/:publicId).
 *
 * NE DEĞİŞTİ: eski ekran kapak görselini kartın içinde küçük bir resim gibi
 * gösteriyor, başlığı görselin altına yığıyordu; paylaş düğmesi ise tarihin
 * yanında kaybolmuş bir dairenin içindeydi. Artık ekran bir OKUMA ekranıdır:
 *
 *   1. Kapak GÖRSELİ tam genişlikte durur ve üstüne okunabilirlik gradyanı
 *      (`colors.scrimGradientTop → scrimGradientBottom`) serilir. Gradyanın
 *      son durağı ekran zemininin %92 opak hâli olduğu için başlık, görsel ne
 *      kadar parlak/karanlık olursa olsun okunur ve iki temada da doğrudur.
 *   2. Kategori rozeti + başlık gradyanın üstünde durur; görsel yoksa aynı
 *      blok düz zeminde aynı hiyerarşiyle çizilir (yerleşim kaymaz).
 *   3. Gövde `type.bodyLg` + 26px satır aralığıyla ve `textScale.long` ile
 *      yazılır: uzun metin kullanıcının yazı tipi tercihine kadar büyüyebilir
 *      (tavan ×2), çünkü burada tabloya sığma kaygısı yoktur.
 *   4. Paylaş eylemi başlığın sağ üst köşesindedir (§4.27 eylem yuvası) —
 *      metnin akışını bölmez; gövdenin sonunda da tam genişlikte tekrar edilir,
 *      okuma bitince el zaten oradadır.
 *
 * İÇERİK HTML: sunucu içeriği temizlenmiş HTML olarak saklar. React Native
 * HTML render etmediği için blok etiketleri paragraf sınırı sayılıp düz metne
 * indirgenir; bu, ek bir render bağımlılığı getirmeden okunur sonuç verir.
 *
 * İLGİLİ BAĞLANTI: editör haberinin gövdesinde maç/takım kimliği YOKTUR;
 * sunucu `serializeNews` yalnız kapsam alanlarını (city/league/season) döndürür.
 * Otomatik üretilen duyurular (transfer/disiplin) ise `meta` taşır. Bu yüzden
 * bağlantı kartı savunmacı okunur: `meta` içinde maç/takım/oyuncu kimliği VARSA
 * kart çizilir, yoksa hiç çizilmez — uydurma bağlantı kullanıcıyı 404'e götürür.
 */

import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import {
  Animated,
  Image,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ColorValue,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import { getNews } from "@/lib/api/news";
import { formatDateLong, mediaUrl, stripHtml } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import type { NewsItem } from "@/lib/types";
import {
  colors,
  fonts,
  layout,
  radius,
  space,
  textScale,
  type,
} from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/**
 * Haberin kaynağı: uygulama içinde yayımlanan her haber Elitlig haber
 * merkezinden gelir (dış ajans beslemesi yok). Sunucu bir gün `source` alanı
 * eklerse bu sabit yerine o okunur.
 */
const SOURCE_LABEL = "Elitlig Haber Merkezi";

/** Ortalama okuma hızı — dakikada 200 kelime (basın standardı). */
const WORDS_PER_MINUTE = 200;

/**
 * Otomatik duyuruların taşıdığı ilişki bilgisi (newsService → transferItems /
 * penaltyItems `meta` alanı). Editör haberlerinde bulunmaz; bu yüzden her alan
 * isteğe bağlıdır ve varlığı tek tek sınanır.
 */
interface NewsRelation {
  match_id?: number | null;
  team_id?: number | null;
  team_name?: string | null;
  player_id?: number | null;
  player_name?: string | null;
}

/** Sunucu yanıtı + (varsa) ilişki bilgisi. */
type NewsDetail = NewsItem & { meta?: NewsRelation | null };

/** Kartta gösterilecek tek bir bağlantı satırı. */
interface RelatedLink {
  key: string;
  icon: "football-outline" | "shield-outline" | "person-outline";
  title: string;
  subtitle: string;
  href: string;
}

/* ============================== SAF YARDIMCILAR =========================== */

/** Blok etiketlerini paragraf sınırı sayarak HTML'i okunur metne çevirir. */
function toParagraphs(html?: string | null): string[] {
  if (!html) return [];
  return String(html)
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n\n")
    .map((block) => stripHtml(block, 5000))
    .filter(Boolean);
}

/** "4 dk okuma" — kelime sayısından tahmin, en az 1 dakika. */
function readingMinutes(content?: string | null): number {
  const words = stripHtml(content, 99_999).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/**
 * `meta` içinden gerçekten var olan rota bağlantılarını çıkarır.
 * Kimlik yoksa satır üretilmez — boş bir "ilgili" kartı gürültüdür.
 */
function relatedLinks(item: NewsDetail): RelatedLink[] {
  const meta = item.meta;
  if (!meta) return [];
  const links: RelatedLink[] = [];

  if (meta.match_id) {
    links.push({
      key: `match-${meta.match_id}`,
      icon: "football-outline",
      title: "Maç detayı",
      subtitle: "Kadro, olaylar ve istatistikler",
      href: `/mac/${meta.match_id}`,
    });
  }
  if (meta.team_id) {
    links.push({
      key: `team-${meta.team_id}`,
      icon: "shield-outline",
      title: meta.team_name?.trim() || "Takım sayfası",
      subtitle: "Kadro, fikstür ve form",
      href: `/takim/${meta.team_id}`,
    });
  }
  if (meta.player_id) {
    links.push({
      key: `player-${meta.player_id}`,
      icon: "person-outline",
      title: meta.player_name?.trim() || "Oyuncu sayfası",
      subtitle: "Sezon istatistikleri ve kariyer",
      href: `/oyuncu/${meta.player_id}`,
    });
  }
  return links;
}

function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/* ================================= EKRAN ================================== */

export default function NewsDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const publicId = String(id ?? "");
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { scrollY, scrollProps } = useHeaderScroll();

  const query = useQuery({
    queryKey: queryKeys.news(publicId),
    queryFn: () => getNews(publicId),
    enabled: Boolean(publicId),
    staleTime: 5 * 60_000,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const item = query.data as NewsDetail | undefined;
  const cover = mediaUrl(item?.cover_image_url);
  const paragraphs = useMemo(() => toParagraphs(item?.content), [item?.content]);
  const links = useMemo(() => (item ? relatedLinks(item) : []), [item]);

  /**
   * Paylaşım metni: başlık + özet. Sitede tekil haberin genel bir adresi
   * bulunmadığı için (yalnız /haberler listesi var) bağlantı EKLENMEZ —
   * çalışmayan bir URL paylaşmak, hiç paylaşmamaktan kötüdür.
   */
  const share = useCallback(() => {
    if (!item) return;
    const summary = item.summary?.trim() || stripHtml(item.content, 220);
    void Share.share({
      title: item.title,
      message: summary ? `${item.title}\n\n${summary}` : item.title,
    }).catch(() => {
      toast.show({ message: "Paylaşım penceresi açılamadı.", tone: "danger" });
    });
  }, [item, toast]);

  const openLink = useCallback((href: string) => router.push(href as never), [router]);

  const headerActions = useMemo(
    () =>
      item
        ? [
            {
              icon: "share-outline" as const,
              onPress: share,
              accessibilityLabel: "Haberi paylaş",
            },
          ]
        : undefined,
    [item, share],
  );

  /* ------------------------------- Yükleme ------------------------------- */

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Haber" back />
        <View style={styles.loading}>
          <Skeleton height={Math.round(width * 0.58)} radius="none" />
          <View style={styles.loadingText}>
            <Skeleton height={20} width="88%" />
            <Skeleton height={20} width="62%" />
            <Skeleton height={12} width="40%" />
            <Skeleton height={14} width="100%" />
            <Skeleton height={14} width="96%" />
            <Skeleton height={14} width="90%" />
            <Skeleton height={14} width="70%" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /* -------------------------------- Hata --------------------------------- */

  if (query.isError || !item) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Haber" back />
        {query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : (
          <EmptyState
            icon="newspaper-outline"
            title="Haber bulunamadı"
            body="Bu haber kaldırılmış ya da bağlantı geçersiz olabilir."
            action={{ label: "Haberlere dön", onPress: () => router.replace("/(tabs)/ligler?tab=haberler") }}
          />
        )}
      </SafeAreaView>
    );
  }

  /* ------------------------------- İçerik -------------------------------- */

  const minutes = readingMinutes(item.content);
  const category = item.category_label?.trim() || "Haber";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={category}
        overline="ELİTLİG HABER"
        back
        scrollY={scrollY}
        actions={headerActions}
      />

      <Animated.ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={refresh.control}
      >
        <Hero cover={cover} category={category} title={item.title} width={width} />

        <View style={styles.body}>
          <View style={styles.metaRow}>
            <Text style={styles.meta} numberOfLines={2} {...textScale.dense}>
              {formatDateLong(item.published_at)}
            </Text>
            <View style={styles.metaDot} />
            <Text style={styles.meta} {...textScale.dense}>
              {minutes} dk okuma
            </Text>
          </View>
          <Text style={styles.source} {...textScale.dense}>
            Kaynak: {SOURCE_LABEL}
          </Text>

          {item.summary ? (
            <>
              <Text style={styles.lead} {...textScale.long}>
                {item.summary.trim()}
              </Text>
              <Divider variant="section" />
            </>
          ) : null}

          {paragraphs.length ? (
            paragraphs.map((paragraph, index) => (
              <Text key={index} style={styles.paragraph} {...textScale.long}>
                {paragraph}
              </Text>
            ))
          ) : (
            <EmptyState
              icon="document-text-outline"
              title="İçerik yok"
              body="Bu haberin gövde metni henüz yayımlanmamış."
              variant="inline"
              compact
            />
          )}

          {links.length ? (
            <View style={styles.related}>
              {/* Liste kart içine SARILMAZ (§4.2): başlık + ListRow grubu. */}
              <SectionHeader title="İlgili sayfalar" style={styles.relatedHeader} />
              {links.map((link, index) => (
                <ListRow
                  key={link.key}
                  leading={{ icon: link.icon, tone: "brand" }}
                  title={link.title}
                  subtitle={link.subtitle}
                  position={rowPosition(index, links.length)}
                  onPress={() => openLink(link.href)}
                />
              ))}
            </View>
          ) : null}

          <Button
            label="Haberi paylaş"
            icon="share-outline"
            variant="secondary"
            fullWidth
            haptic="light"
            onPress={share}
            style={styles.shareButton}
          />
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================ */

/**
 * Kapak bloğu. Görsel varsa: tam genişlikte resim + üstünde gradyan + gradyanın
 * içinde rozet ve başlık. Görsel yoksa: aynı blok düz zeminde çizilir; böylece
 * görselsiz haberde başlık yukarı zıplamaz, hiyerarşi aynı kalır.
 */
const Hero = React.memo(function Hero({
  cover,
  category,
  title,
  width,
}: {
  cover: string | null;
  category: string;
  title: string;
  width: number;
}) {
  /** Gradyanın son durağı ekran zemininin %92'si — metin daima okunur. */
  const scrim: readonly [ColorValue, ColorValue] = [
    colors.scrimGradientTop,
    colors.scrimGradientBottom,
  ];

  if (!cover) {
    return (
      <View style={styles.heroPlain}>
        <Badge label={category} tone="brand" />
        <Text style={styles.title} {...textScale.long}>
          {title}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.hero, { minHeight: Math.round(width * 0.62) }]}>
      <Image
        source={{ uri: cover }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <LinearGradient
        colors={scrim}
        locations={[0.15, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.heroText}>
        <Badge label={category} tone="brand" variant="solid" />
        <Text style={styles.title} {...textScale.long}>
          {title}
        </Text>
      </View>
    </View>
  );
});

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: space.xxxl,
  },

  /* — Yükleme — */
  loading: {
    gap: space.lg,
  },
  loadingText: {
    paddingHorizontal: layout.screenPadding,
    gap: space.m,
  },

  /* — Kapak — */
  hero: {
    justifyContent: "flex-end",
    backgroundColor: colors.surface2,
  },
  heroText: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xxl,
    paddingBottom: space.lg,
    gap: space.sm,
    alignItems: "flex-start",
  },
  heroPlain: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.sm,
    alignItems: "flex-start",
  },
  title: {
    ...type.display,
    color: colors.textPrimary,
    lineHeight: 28,
  },

  /* — Gövde — */
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  meta: {
    ...type.label,
    color: colors.textSecondary,
  },
  /** İki meta arasındaki 3px ayraç noktası. */
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.textTertiary,
  },
  source: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: -space.sm,
  },
  lead: {
    ...type.bodyLg,
    color: colors.textSecondary,
    lineHeight: 23,
    fontFamily: fonts.semibold,
  },
  paragraph: {
    ...type.bodyLg,
    color: colors.textPrimary,
    lineHeight: 26,
  },
  related: {
    marginTop: space.sm,
  },
  /** SectionHeader kendi yatay boşluğunu taşır; gövdenin boşluğu geri alınır. */
  relatedHeader: {
    marginHorizontal: -layout.screenPadding,
  },
  shareButton: {
    marginTop: space.md,
  },
});
