/**
 * HABER DETAYI — okuma ekranı (GET /api/news/:publicId).
 *
 * NE DEĞİŞTİ: eski ekran kapak görselini kartın içinde küçük bir resim gibi
 * gösteriyor, başlığı görselin altına yığıyordu; paylaş düğmesi ise tarihin
 * yanında kaybolmuş bir dairenin içindeydi. Artık ekran bir OKUMA ekranıdır:
 *
 *   1. Kapak GÖRSELİ tam genişlikte, metinsiz durur. (Önceki sürüm başlığı
 *      görselin üstüne koyuyordu; koyu scrim'in üstünde `textPrimary` —
 *      açık temada siyah — başlık okunmuyordu. Afiş türü kapaklarda da
 *      başlık afişin kendi yazısıyla çakışıyordu.) Başlık görselin ALTINDA,
 *      kâğıtta, editoryal düzende: üst satır (kategori · tarih · okuma
 *      süresi) → büyük başlık → kaynak.
 *   2. Görsel yoksa aynı blok görselsiz çizilir; hiyerarşi değişmez.
 *   3. Gövde `type.bodyLg` + 26px satır aralığıyla ve `textScale.long` ile
 *      yazılır: uzun metin kullanıcının yazı tipi tercihine kadar büyüyebilir
 *      (tavan ×2), çünkü burada tabloya sığma kaygısı yoktur.
 *   4. PAYLAŞ yalnız başlığın SAĞ ÜST köşesindedir ("share-outline", RN
 *      `Share`) — detay sayfalarının ortak sözleşmesi; metnin akışını bölmez.
 *      Gövdenin sonundaki ikinci "Haberi paylaş" düğmesi kaldırıldı (tek
 *      eylem, tek yer).
 *
 * İÇERİK HTML: sunucu içeriği temizlenmiş HTML olarak saklar. React Native
 * HTML render etmediği için blok etiketleri paragraf sınırı sayılıp düz metne
 * indirgenir. GÖVDEDEKİ GÖRSELLER (`<img>`) artık atılmaz: kendi blokları
 * olur ve gerçek oranlarıyla tam genişlikte çizilir — editörün afişi
 * haberin parçasıdır. Kapakla aynı görsel ve başlığı tekrar eden ilk
 * paragraf ikinci kez gösterilmez.
 *
 * İLGİLİ BAĞLANTI: editör haberinin gövdesinde maç/takım kimliği YOKTUR;
 * sunucu `serializeNews` yalnız kapsam alanlarını (city/league/season) döndürür.
 * Otomatik üretilen duyurular (transfer/disiplin) ise `meta` taşır. Bu yüzden
 * bağlantı kartı savunmacı okunur: `meta` içinde maç/takım/oyuncu kimliği VARSA
 * kart çizilir, yoksa hiç çizilmez — uydurma bağlantı kullanıcıyı 404'e götürür.
 */

import { useQuery } from "@tanstack/react-query";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BrandMark,
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
import { webNewsUrl } from "@/lib/links";
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
  upperTR,
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

/** Gövde bloğu: düz paragraf ya da görsel. */
type BodyBlock = { kind: "text"; text: string } | { kind: "image"; uri: string };

const IMAGE_MARK = "\u0000IMG:";

/**
 * Blok etiketlerini paragraf sınırı sayarak HTML'i okunur bloklara çevirir.
 * `<img src>` kendi bloğu olur; kapakla aynı görsel ve başlığın tekrarı atılır.
 */
function toBlocks(html: string | null | undefined, skip: { cover: string | null; title: string }): BodyBlock[] {
  if (!html) return [];
  const blocks = String(html)
    .replace(/<img[^>]*?src=["']([^"']+)["'][^>]*>/gi, (_m, src: string) => `\n\n${IMAGE_MARK}${src}\n\n`)
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n\n")
    .map((block): BodyBlock | null => {
      const trimmed = block.trim();
      if (trimmed.startsWith(IMAGE_MARK)) {
        const uri = mediaUrl(trimmed.slice(IMAGE_MARK.length));
        return uri ? { kind: "image", uri } : null;
      }
      const text = stripHtml(block, 5000);
      return text ? { kind: "text", text } : null;
    })
    .filter((block): block is BodyBlock => block != null);

  const title = skip.title.trim();
  return blocks.filter((block, index) => {
    if (block.kind === "image") return block.uri !== skip.cover;
    // Başlığın gövdede birebir tekrarı (ilk birkaç blokta) atılır.
    return !(index < 3 && block.text.trim() === title);
  });
}

/**
 * Gövde görseli: gerçek oranıyla tam genişlikte. Oran yüklenene kadar 4:3
 * yer tutulur ki metin zıplamasın; aşırı uç oranlar (çok uzun afiş) 3:4'te
 * sınırlanır, yoksa tek görsel üç ekran boyu kaplar.
 */
const BodyImage = React.memo(function BodyImage({ uri }: { uri: string }) {
  const [ratio, setRatio] = React.useState(4 / 3);
  React.useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (alive && width > 0 && height > 0) setRatio(Math.min(2.2, Math.max(0.75, width / height)));
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  return (
    <View style={[styles.bodyImage, { aspectRatio: ratio }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
    </View>
  );
});

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
  const blocks = useMemo(
    () => toBlocks(item?.content, { cover, title: item?.title ?? "" }),
    [item?.content, item?.title, cover],
  );
  const links = useMemo(() => (item ? relatedLinks(item) : []), [item]);

  /**
   * Paylaşım metni: başlık + özet + sitedeki tekil haber adresi
   * (`/haberler?haber=<id>` haberi pencerede açar).
   */
  const share = useCallback(() => {
    if (!item) return;
    const summary = item.summary?.trim() || stripHtml(item.content, 220);
    const url = webNewsUrl(publicId);
    void Share.share({
      title: item.title,
      message: [item.title, summary, url].filter(Boolean).join("\n\n"),
    }).catch(() => {
      toast.show({ message: "Paylaşım penceresi açılamadı.", tone: "danger" });
    });
  }, [item, publicId, toast]);

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
        title="Haber"
        back
        scrollY={scrollY}
        actions={headerActions}
      />

      <Animated.ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={refresh.control}
      >
        <Hero cover={cover} width={width} />

        <View style={styles.body}>
          <View style={styles.titleBlock}>
            <View style={styles.kickerRow}>
              <Text style={styles.kicker} {...textScale.badge}>
                {upperTR(category)}
              </Text>
              <View style={styles.metaDot} />
              <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                {formatDateLong(item.published_at)}
              </Text>
              <View style={styles.metaDot} />
              <Text style={styles.meta} {...textScale.dense}>
                {minutes} dk okuma
              </Text>
            </View>
            <Text style={styles.title} accessibilityRole="header" {...textScale.long}>
              {item.title}
            </Text>
            <View style={styles.sourceRow}>
              <BrandMark size="sm" />
              <Text style={styles.source} {...textScale.dense}>
                {SOURCE_LABEL}
              </Text>
            </View>
          </View>

          {item.summary ? (
            <Text style={styles.lead} {...textScale.long}>
              {item.summary.trim()}
            </Text>
          ) : null}

          <Divider variant="section" />

          {blocks.length ? (
            blocks.map((block, index) =>
              block.kind === "image" ? (
                <BodyImage key={`img-${index}`} uri={block.uri} />
              ) : (
                <Text key={`p-${index}`} style={styles.paragraph} {...textScale.long}>
                  {block.text}
                </Text>
              ),
            )
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
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================ */

/**
 * Kapak: tam genişlikte, metinsiz görsel (bkz. dosya başlığı). Görsel yoksa
 * hiçbir şey çizilmez — başlık bloğu doğrudan kâğıtta başlar.
 */
const Hero = React.memo(function Hero({ cover, width }: { cover: string | null; width: number }) {
  if (!cover) return null;
  return (
    <View style={[styles.hero, { height: Math.round(width * 0.62) }]}>
      <Image
        source={{ uri: cover }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
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
    backgroundColor: colors.surface3,
  },

  /* — Gövde — */
  body: {
    paddingHorizontal: layout.screenPadding + space.xxs,
    paddingTop: space.lg,
    gap: space.lg,
  },
  titleBlock: {
    gap: space.sm,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
  },
  kicker: {
    ...type.overline,
    color: colors.brandAccent,
  },
  meta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  /** Meta parçaları arasındaki 3px ayraç noktası. */
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.textTertiary,
  },
  title: {
    ...type.display,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.xxs,
  },
  source: {
    ...type.label,
    color: colors.textSecondary,
  },
  lead: {
    ...type.article,
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
  },
  paragraph: {
    ...type.article,
    color: colors.textPrimary,
  },
  bodyImage: {
    width: "100%",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface3,
  },
  related: {
    marginTop: space.sm,
  },
  /** SectionHeader kendi yatay boşluğunu taşır; gövdenin boşluğu geri alınır. */
  relatedHeader: {
    marginHorizontal: -layout.screenPadding,
  },
});
