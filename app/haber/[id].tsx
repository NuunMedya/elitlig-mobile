import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { ErrorState, Loading } from "@/components/States";
import { colors, radius, spacing, type } from "@/constants/theme";
import { getNews } from "@/lib/api/news";
import { formatDateLong, mediaUrl, stripHtml } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Haber detayı — GET /api/news/:publicId
 *
 * İçerik sunucuda temizlenmiş HTML olarak saklanıyor. React Native'de HTML
 * doğrudan render edilemediği için paragraflara ayrılıp düz metin gösterilir;
 * bu, ek bir HTML render bağımlılığı getirmeden okunur bir sonuç verir.
 */
export default function NewsDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const publicId = String(id ?? "");

  const query = useQuery({
    queryKey: queryKeys.news(publicId),
    queryFn: () => getNews(publicId),
    enabled: Boolean(publicId),
  });

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Haber" />
        <Loading />
      </SafeAreaView>
    );
  }

  if (query.isError || !query.data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <DetailHeader title="Haber" />
        <ErrorState error={query.error} onRetry={query.refetch} />
      </SafeAreaView>
    );
  }

  const item = query.data;
  const cover = mediaUrl(item.cover_image_url);
  const paragraphs = toParagraphs(item.content);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title={item.category_label || "Haber"} />

      <ScrollView contentContainerStyle={styles.content}>
        {cover ? <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" /> : null}

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.date}>{formatDateLong(item.published_at)}</Text>

        {item.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}

        {paragraphs.length ? (
          paragraphs.map((paragraph, index) => (
            <Text key={index} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))
        ) : (
          <Text style={styles.placeholder}>Bu haberin içeriği bulunmuyor.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pitch,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  cover: {
    width: "100%",
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  title: {
    ...type.title,
    color: colors.line,
    lineHeight: 28,
  },
  date: {
    ...type.caption,
    color: colors.muted,
    letterSpacing: 0,
    marginTop: -spacing.sm,
  },
  summary: {
    ...type.body,
    color: colors.muted,
    lineHeight: 23,
  },
  paragraph: {
    ...type.body,
    color: colors.line,
    lineHeight: 24,
  },
  placeholder: {
    ...type.small,
    color: colors.faint,
  },
});
