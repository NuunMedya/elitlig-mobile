/**
 * SEZON ÖZETİ — oyuncunun sezonunun paylaşılabilir hikâyesi
 * (GET /api/career/season-summary).
 *
 * Kartlar yalnız gerçek veriden: maç, gol, asist, reyting, galibiyet dengesi,
 * en iyi maç, ödüller, ligdeki gol sırası, taraftar oylaması ve Tahmin Ligi.
 * Üstteki özet kartı görsel olarak paylaşılır (Instagram hikâyesi için).
 *
 * İKİNCİ TUR — KURGU:
 *   1. PAYLAŞILAN SAHNE: mürekkep degradesi + aurora; avatar, ad, mevki,
 *      dört dönen sayı (maç · gol · asist · reyting) cam hücrelerde ve gol
 *      krallığı sırası imza çubuğuyla ("ilk %8").
 *   2. GALİBİYET DENGESİ: G/B/M tek yığılmış çubukta (nane · altın · kırmızı)
 *      ve altında üç sayı — "dengenin şekli" tek bakışta.
 *   3. SEZONUN EN İYİ MAÇI: geniş, basılabilir kart (skor satırı + sayılar).
 *   4. HİKÂYE KAROLARI: 2 sütun — ödüller, taraftar oyu, Tahmin Ligi,
 *      kurtarışlar, disiplin; her biri degrade ikon karosu ve iri rakam.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { captureRef } from "react-native-view-shot";

import { EliteCard } from "@/components/career/EliteCard";
import {
  Aurora,
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  GradientBar,
  IconTile,
  Odometer,
  Reveal,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  SkeletonCard,
  Touchable,
  useHeaderScroll,
  useToast,
  type IconTileTone,
} from "@/components/ui";
import { getSeasonSummary, type SeasonSummary } from "@/lib/api/community";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/** Gösterilecek hikâye karosu. */
interface Story {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: IconTileTone;
  label: string;
  value: string;
  caption: string;
}

export default function SeasonSummaryScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { scrollY, scrollProps } = useHeaderScroll();
  const shotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  const query = useQuery({ queryKey: ["career", "season-summary", auth.user?.id ?? 0], queryFn: () => getSeasonSummary(), enabled: Boolean(auth.user), staleTime: 10 * 60_000 });
  const data = query.data;

  if (!auth.user) return <Redirect href="/giris" />;

  const share = async () => {
    setSharing(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "image/png" });
      else toast.show({ message: "Bu cihazda paylaşım kapalı.", tone: "warn" });
    } catch {
      toast.show({ message: "Görsel hazırlanamadı.", tone: "danger" });
    } finally {
      setSharing(false);
    }
  };

  const needsPlayer = query.error instanceof ApiError && query.error.code === "PLAYER_REQUIRED";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Sezon Özeti" back scrollY={scrollY} />
      {query.isLoading ? (
        <View style={styles.pad}>
          <Skeleton height={300} radius="xxl" />
          <Skeleton height={48} radius="lg" />
          <SkeletonCard lines={3} />
        </View>
      ) : needsPlayer ? (
        <EmptyState
          icon="person-add-outline"
          title="Oyuncu profilini bağla"
          body="Sezon özeti, maçlarda oynayan oyuncunun gerçek istatistiklerinden hazırlanır."
          action={{ label: "Profilimi bağla", onPress: () => router.push("/oyuncum/bagla") }}
        />
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
          <Reveal index={0} scaleFrom={0.97}>
            <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
              <View style={styles.hero}>
                <LinearGradient colors={colors.gradientInk} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Aurora variant="stage" />
                <View style={styles.heroTop}>
                  <Text style={styles.heroOver} numberOfLines={1} {...textScale.badge}>
                    {upperTR(`${data.season.league ?? "ElitLig"} · ${data.season.name ?? "Sezon"}`)}
                  </Text>
                  <Text style={styles.heroBrand} {...textScale.badge}>
                    ELİTLİG
                  </Text>
                </View>
                <View style={styles.heroWho}>
                  <View style={styles.heroRing}>
                    <Avatar name={data.player.name} image={mediaUrl(data.player.image)} size={64} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.heroKicker} {...textScale.badge}>
                      {upperTR("Sezon özeti")}
                    </Text>
                    <Text style={styles.heroName} numberOfLines={2} {...textScale.dense}>
                      {data.player.name}
                    </Text>
                    {data.player.position ? (
                      <Text style={styles.heroPos} numberOfLines={1} {...textScale.dense}>
                        {data.player.position}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.heroStats}>
                  <HeroStat value={data.totals.matches} label="maç" />
                  <HeroStat value={data.totals.goals} label="gol" />
                  <HeroStat value={data.totals.assists} label="asist" />
                  <HeroStat value={data.totals.rating != null ? data.totals.rating.toFixed(1) : "–"} label="reyting" accent />
                </View>
                {data.goalRank ? (
                  <View style={styles.rankBox}>
                    <View style={styles.rankTop}>
                      <Text style={styles.rankText} numberOfLines={2} {...textScale.dense}>
                        Gol krallığında{" "}
                        <Text style={styles.rankStrong}>{`${data.goalRank.rank}.`}</Text>
                        {` · ${data.goalRank.of} oyuncu`}
                      </Text>
                      <Text style={styles.rankPct} {...textScale.dense}>
                        {`ilk %${topPercent(data.goalRank.percentile)}`}
                      </Text>
                    </View>
                    <GradientBar
                      value={1 - (data.goalRank.rank - 1) / Math.max(1, data.goalRank.of)}
                      height={6}
                      track={colors.inkTile}
                    />
                  </View>
                ) : null}
              </View>
            </ViewShot>
          </Reveal>
          <Button label="Özetimi paylaş" icon="share-outline" onPress={share} loading={sharing} size="lg" fullWidth />

          <Reveal index={1}>
            <SectionHeader title="Galibiyet dengesi" inset="flush" size="group" />
            <RecordCard wins={data.record.wins} draws={data.record.draws} losses={data.record.losses} />
          </Reveal>

          {data.bestMatch ? (
            <Reveal index={2}>
              <SectionHeader title="Sezonun en iyi maçın" inset="flush" size="group" />
              <Touchable
                feedback="card"
                haptic="selection"
                onPress={() => router.push(`/mac/${data.bestMatch?.matchId}`)}
                style={styles.best}
                accessibilityRole="button"
                accessibilityLabel={`En iyi maç: ${data.bestMatch.label}`}
              >
                <IconTile icon="flame" tone="pink" size={44} />
                <View style={styles.flex}>
                  <Text style={styles.bestTitle} numberOfLines={2} {...textScale.dense}>
                    {data.bestMatch.label}
                  </Text>
                  <Text style={styles.bestMeta} numberOfLines={1} {...textScale.dense}>
                    {formatDateShort(data.bestMatch.date)}
                  </Text>
                  <View style={styles.bestStats}>
                    <MiniStat value={String(data.bestMatch.goals)} label="gol" />
                    <MiniStat value={String(data.bestMatch.assists)} label="asist" />
                    {data.bestMatch.rating != null ? (
                      <MiniStat value={data.bestMatch.rating.toFixed(1)} label="reyting" />
                    ) : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
              </Touchable>
            </Reveal>
          ) : null}

          <Reveal index={3}>
            <SectionHeader title="Sezonun hikâyesi" inset="flush" size="group" />
            <View style={styles.grid}>
              {stories(data).map((story) => (
                <View key={story.key} style={styles.story}>
                  <IconTile icon={story.icon} tone={story.tone} size={32} glow={false} />
                  <Text style={styles.storyLabel} numberOfLines={1} {...textScale.badge}>
                    {upperTR(story.label)}
                  </Text>
                  <Text style={styles.storyValue} numberOfLines={1} {...textScale.dense}>
                    {story.value}
                  </Text>
                  <Text style={styles.storyCaption} numberOfLines={2} {...textScale.dense}>
                    {story.caption}
                  </Text>
                </View>
              ))}
            </View>
          </Reveal>

          {data.card ? <EliteCard card={data.card} /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** Gol krallığı yüzdelik dilimi → "ilk %8" (en az %1). */
function topPercent(percentile: number | null): number {
  return Math.max(1, 100 - (percentile ?? 0) + 1);
}

/** Yalnız gerçek veriden hikâye karoları; sıfır olan satır çizilmez. */
function stories(data: SeasonSummary): Story[] {
  const out: Story[] = [
    {
      key: "awards",
      icon: "ribbon",
      tone: "gold",
      label: "Ödüller",
      value: String(data.awards.motm + data.awards.weekly),
      caption: `${data.awards.motm} maçın oyuncusu · ${data.awards.weekly} haftanın enleri`,
    },
  ];
  if (data.fanVoteWins) {
    out.push({ key: "fans", icon: "people", tone: "pink", label: "Taraftar oyu", value: String(data.fanVoteWins), caption: "maçta taraftarlar seni seçti" });
  }
  if (data.predictions.points) {
    out.push({ key: "pred", icon: "podium", tone: "violet", label: "Tahmin Ligi", value: String(data.predictions.points), caption: `puan · ${data.predictions.exact} tam skor` });
  }
  if (data.totals.saves) {
    out.push({ key: "saves", icon: "hand-left", tone: "cyan", label: "Kurtarış", value: String(data.totals.saves), caption: "kritik müdahale" });
  }
  out.push({
    key: "cards",
    icon: "card",
    tone: data.totals.red ? "red" : "mint",
    label: "Disiplin",
    value: String(data.totals.yellow + data.totals.red),
    caption: `${data.totals.yellow} sarı · ${data.totals.red} kırmızı kart`,
  });
  return out;
}

function HeroStat({ value, label, accent = false }: { value: number | string; label: string; accent?: boolean }) {
  return (
    <View style={styles.heroStat}>
      <Odometer value={value} style={[styles.heroValue, accent ? styles.heroValueAccent : null]} />
      <Text style={styles.heroLabel} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.miniLabel} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

/** G/B/M tek yığılmış çubukta + üç sayı. */
function RecordCard({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  const total = Math.max(1, wins + draws + losses);
  const parts = [
    { key: "w", value: wins, label: "Galibiyet", color: colors.win },
    { key: "d", value: draws, label: "Beraberlik", color: colors.draw },
    { key: "l", value: losses, label: "Mağlubiyet", color: colors.loss },
  ];
  return (
    <View style={styles.record}>
      <View style={styles.recordBar}>
        {parts.map((part) =>
          part.value > 0 ? (
            <View key={part.key} style={{ flex: part.value / total, backgroundColor: part.color }} />
          ) : null,
        )}
      </View>
      <View style={styles.recordRow}>
        {parts.map((part) => (
          <View key={part.key} style={styles.recordCell}>
            <View style={styles.recordLabelRow}>
              <View style={[styles.recordDot, { backgroundColor: part.color }]} />
              <Text style={styles.recordLabel} {...textScale.badge}>
                {upperTR(part.label)}
              </Text>
            </View>
            <Text style={styles.recordValue} {...textScale.dense}>
              {part.value}
            </Text>
            <Text style={styles.recordPct} {...textScale.dense}>
              {`%${Math.round((part.value / total) * 100)}`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  pad: { padding: layout.screenPadding, gap: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant, gap: space.lg },

  /* — Paylaşılan sahne — */
  hero: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    padding: space.lg,
    gap: space.lg,
    backgroundColor: colors.inkBlock,
    borderWidth: hairline,
    borderColor: colors.borderOnDark,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  heroOver: { ...type.overline, color: colors.onDarkMuted, flexShrink: 1 },
  heroBrand: { ...type.overline, color: colors.brandOnDark },
  heroWho: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroRing: { padding: 3, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.brandOnDark },
  heroKicker: { ...type.overline, color: colors.brandOnDark },
  heroName: { ...type.display, color: colors.onDark },
  heroPos: { ...type.label, color: colors.onDarkMuted },
  heroStats: {
    flexDirection: "row",
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  heroStat: { flex: 1, alignItems: "center", gap: space.xxs },
  heroValue: { ...type.scoreMd, color: colors.onDark },
  heroValueAccent: { color: colors.brandOnDark },
  heroLabel: { ...type.overline, color: colors.onDarkMuted },
  rankBox: { gap: space.sm },
  rankTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  rankText: { ...type.bodySm, color: colors.onDarkMuted, flex: 1 },
  rankStrong: { ...type.h4, color: colors.onDark },
  rankPct: { ...type.scoreXs, color: colors.onDark },

  /* — Galibiyet dengesi — */
  record: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  recordBar: { flexDirection: "row", height: 10, borderRadius: radius.pill, overflow: "hidden", gap: 2, backgroundColor: colors.surface3 },
  recordRow: { flexDirection: "row" },
  recordCell: { flex: 1, gap: space.xxs },
  recordLabelRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  recordDot: { width: 8, height: 8, borderRadius: 4 },
  recordLabel: { ...type.overline, color: colors.textTertiary },
  recordValue: { ...type.metric, color: colors.textPrimary },
  recordPct: { ...type.caption, color: colors.textTertiary },

  /* — En iyi maç — */
  best: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  bestTitle: { ...type.h3, color: colors.textPrimary },
  bestMeta: { ...type.caption, color: colors.textTertiary },
  bestStats: { flexDirection: "row", gap: space.lg, marginTop: space.sm },
  mini: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  miniValue: { ...type.scoreSm, color: colors.brandAccent },
  miniLabel: { ...type.caption, color: colors.textTertiary },

  /* — Hikâye karoları — */
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  story: {
    width: "48.6%",
    flexGrow: 1,
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  storyLabel: { ...type.overline, color: colors.textTertiary, marginTop: space.s },
  storyValue: { ...type.metric, color: colors.textPrimary },
  storyCaption: { ...type.caption, color: colors.textTertiary },
});
