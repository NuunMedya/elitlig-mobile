/**
 * İSTATİSTİK SEKMESİ — iki takımın sayıları karşılıklı barlarda.
 *
 * DÜZEN: tek kart. Tepede takım cetveli (hangi renk hangi takım), altında üç
 * grup — Hücum · Mücadele · Disiplin — grup adları kartın içinde ince versal
 * birer etiket. Kartın altında "En iyi oyuncular".
 *
 * NEDEN GRUPLU: on iki satırı düz sıralamak hepsini eşit önemde gösteren bir
 * döküm üretiyordu; okuyucu "bu takım nerede iyi" sorusunu ancak tek tek
 * karşılaştırarak yanıtlayabiliyordu. Grup adı soruyu kendisi sorar.
 *
 * NEDEN BU ÜÇ GRUP: sunucunun gerçekten tuttuğu olay kodları bu üç aileye
 * ayrılıyor. TOPLA OYNAMA YÜZDESİ VE xG BİLEREK YOK — şemada karşılıkları
 * bulunmuyor ve uydurulmuş bir yüzde, gerçek verinin yanında duran sahte bir
 * sayı olurdu. Tanınmayan kodlar "Mücadele"ye düşer: sunucuya yeni bir olay
 * kodu eklendiğinde ekran onu sessizce yutmaz.
 *
 * SIFIR SATIRLAR ELENİR — "Kırmızı kart 0–0" barı hiçbir şey söylemez. Goller
 * tek istisnadır: 0–0 da bir sonuçtur.
 */

import { useRouter } from "expo-router";
import React, { memo, useCallback, useMemo } from "react";
import { Animated, StyleSheet, Text, View, type RefreshControlProps } from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";

import {
  Avatar,
  EmptyState,
  GradientBar,
  IconTile,
  Odometer,
  RankBadge,
  RatingPill,
  Reveal,
  SectionHeader,
  StatBar,
  Touchable,
  type IconTileTone,
} from "@/components/ui";
import { colors, fonts, hairline, layout, space, textScale, type } from "@/theme";
import type { StatRow, TopPlayer } from "@/lib/matchStats";
import type { ApiMatch, MatchState } from "@/lib/types";
import { PaperCard, TeamLegend } from "./parts";
import { statLabel, type ScrollChrome } from "./shared";

const STAT_GROUPS: { title: string; labels: string[]; icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }[] = [
  { title: "Hücum", labels: ["Goller", "Asistler", "Fırsat Yarat."], icon: "flash", tone: "violet" },
  { title: "Mücadele", labels: ["Kurtarışlar", "Kritik Blok", "Hava Topu", "İkili Müc."], icon: "shield-half", tone: "cyan" },
  { title: "Disiplin", labels: ["Fauller", "Sarı Kart", "Kırmızı Kart", "Sakatlık", "Değişiklik"], icon: "flag", tone: "gold" },
];

interface StatSection {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: IconTileTone;
  data: StatRow[];
}

export interface StatsTabProps {
  match: ApiMatch;
  state: MatchState;
  statRows: StatRow[];
  bestPlayers: TopPlayer[];
  homeLogo: string | null;
  awayLogo: string | null;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}

export function StatsTab({
  match,
  state,
  statRows,
  bestPlayers,
  homeLogo,
  awayLogo,
  scrollProps,
  refreshControl,
}: StatsTabProps) {
  const router = useRouter();

  const sections = useMemo<StatSection[]>(() => {
    const byLabel = new Map(statRows.map((row) => [row.label, row]));
    const known = new Set(STAT_GROUPS.flatMap((group) => group.labels));
    const unknown = statRows.filter((row) => !known.has(row.label));
    const keep = (row: StatRow) => row.label === "Goller" || row.home > 0 || row.away > 0;

    return STAT_GROUPS.map((group) => {
      const rows = group.labels
        .map((label) => byLabel.get(label))
        .filter((row): row is StatRow => row != null);
      const data = (group.title === "Mücadele" ? [...rows, ...unknown] : rows).filter(keep);
      return { title: group.title, icon: group.icon, tone: group.tone, data };
    }).filter((section) => section.data.length > 0);
  }, [statRows]);

  const openPlayer = useCallback((playerId: number) => router.push(`/oyuncu/${playerId}`), [router]);

  /* Oynanmamış maçın istatistiği olamaz; boş kart yerine ne zaman geleceğini söyle. */
  if (state === "scheduled") {
    return (
      <EmptyState
        icon="stats-chart-outline"
        title="Maç henüz oynanmadı"
        body="Maç başladığında goller, kurtarışlar ve kartlar burada iki takım karşılaştırmalı görünür."
      />
    );
  }

  /* Kahraman verileri: goller ve kaç kalemde kim önde. */
  const goalsRow = statRows.find((row) => row.label === "Goller") ?? null;
  const compared = statRows.filter((row) => row.home !== row.away && !["Fauller", "Sarı Kart", "Kırmızı Kart", "Sakatlık", "Değişiklik"].includes(row.label));
  const homeLeads = compared.filter((row) => row.home > row.away).length;
  const awayLeads = compared.length - homeLeads;
  const dominance =
    compared.length > 1
      ? {
          total: compared.length,
          won: Math.max(homeLeads, awayLeads),
          leader: homeLeads === awayLeads ? null : homeLeads > awayLeads ? match.first_team_name : match.second_team_name,
        }
      : null;

  /* Yalnız "Goller" satırı varsa (çoğu amatör maç) bölümler yine de anlamlı:
     gol karşılaştırması tek başına da bir istatistiktir. */
  const onlyGoals = sections.length === 1 && sections[0].data.length === 1;

  return (
    <Animated.ScrollView {...scrollProps} refreshControl={refreshControl} contentContainerStyle={styles.content}>
      {/* — Kahraman: gol payı halkası + takım cetveli — */}
      <Reveal scaleFrom={0.98}>
        <PaperCard>
          <TeamLegend
            homeName={match.first_team_name}
            awayName={match.second_team_name}
            homeLogo={homeLogo}
            awayLogo={awayLogo}
          />
          {goalsRow ? <ShareHero label="GOL PAYI" home={goalsRow.home} away={goalsRow.away} /> : null}
          {dominance ? (
            <View style={styles.dominance}>
              <View style={styles.dominanceHead}>
                <Text style={styles.groupTitle} {...textScale.badge}>
                  KARŞILAŞTIRMA ÜSTÜNLÜĞÜ
                </Text>
                <Text style={styles.dominanceValue} {...textScale.badge}>
                  {`${dominance.won}/${dominance.total} kalem`}
                </Text>
              </View>
              <GradientBar value={dominance.total ? dominance.won / dominance.total : 0} height={8} />
              <Text style={styles.dominanceNote} numberOfLines={2} {...textScale.dense}>
                {dominance.leader
                  ? `${dominance.leader} istatistik kalemlerinin çoğunda önde.`
                  : "İki takım istatistik kalemlerinde başa baş."}
              </Text>
            </View>
          ) : null}
        </PaperCard>
      </Reveal>

      {sections.map((section, index) => (
        <Reveal key={section.title} index={index + 1}>
          <View style={styles.groupHead}>
            <IconTile icon={section.icon} tone={section.tone} size={28} glow={false} />
            <Text style={styles.groupHeading} {...textScale.dense}>
              {section.title}
            </Text>
            <Text style={styles.groupCount} {...textScale.badge}>
              {`${section.data.length} KALEM`}
            </Text>
          </View>
          <PaperCard style={styles.groupCard}>
            {section.data.map((row) => (
              <StatBar key={row.label} label={statLabel(row.label)} home={row.home} away={row.away} />
            ))}
          </PaperCard>
        </Reveal>
      ))}

      {onlyGoals ? (
        <Text style={styles.note} {...textScale.dense}>
          Bu maç için yalnız goller girilmiş. Kurtarış, fırsat ve kart kayıtları girildikçe burada çıkar.
        </Text>
      ) : null}

      {bestPlayers.length ? (
        <>
          <SectionHeader title="En iyi oyuncular" meta="reytinge göre" />
          <PaperCard>
            {bestPlayers.map((player, index) => (
              <TopPlayerRow key={player.playerId} player={player} rank={index + 1} onOpen={openPlayer} />
            ))}
          </PaperCard>
        </>
      ) : null}
    </Animated.ScrollView>
  );
}

/**
 * GOL PAYI HALKASI — iki takımın gollerinin toplamdaki payı. Halka ev sahibi
 * (veri mavisi → camgöbeği degrade) ve deplasman (`slate`) yaylarından oluşur
 * — StatBar ve takım cetveliyle aynı taraf renkleri; ortada toplam,
 * iki yanda büyük yüzdeler (Odometer). Uydurma veri yok: yüzde gerçek
 * gollerden hesaplanır (topla oynama verisi şemada tutulmuyor).
 */
const RING = 116;
const STROKE = 12;
const ShareHero = memo(function ShareHero({ label, home, away }: { label: string; home: number; away: number }) {
  const total = home + away;
  const homePct = total ? Math.round((home / total) * 100) : 50;
  const awayPct = total ? 100 - homePct : 50;
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const homeLen = total ? (home / total) * c : c / 2;
  const gap = total && home && away ? 4 : 0;
  return (
    <View style={styles.hero} accessible accessibilityLabel={`${label}: ev sahibi yüzde ${homePct}, deplasman yüzde ${awayPct}`}>
      <View style={styles.heroSide}>
        <Odometer value={`${homePct}%`} style={[styles.heroPct, styles.heroPctHome]} />
        <Text style={styles.heroSub} {...textScale.badge}>
          {`${home} GOL`}
        </Text>
      </View>
      <View style={styles.ring}>
        <Svg width={RING} height={RING}>
          <Defs>
            <SvgGradient id="shareHome" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.gradientAccent[0]} />
              <Stop offset="1" stopColor={colors.gradientSignature[1]} />
            </SvgGradient>
          </Defs>
          <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.surface3} strokeWidth={STROKE} fill="none" />
          {away > 0 || !total ? (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              stroke={colors.slate}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0, c - homeLen - gap * 2)} ${c}`}
              strokeDashoffset={-(homeLen + gap)}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          ) : null}
          {home > 0 || !total ? (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              stroke="url(#shareHome)"
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0, homeLen - (away ? gap : 0))} ${c}`}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          ) : null}
        </Svg>
        <View style={styles.ringCenter}>
          <Odometer value={total} style={styles.ringTotal} />
          <Text style={styles.ringLabel} {...textScale.badge}>
            {label}
          </Text>
        </View>
      </View>
      <View style={[styles.heroSide, styles.heroSideAway]}>
        <Odometer value={`${awayPct}%`} style={[styles.heroPct, styles.heroPctAway]} />
        <Text style={styles.heroSub} {...textScale.badge}>
          {`${away} GOL`}
        </Text>
      </View>
    </View>
  );
});

const TopPlayerRow = memo(function TopPlayerRow({
  player,
  rank,
  onOpen,
}: {
  player: TopPlayer;
  rank: number;
  onOpen: (playerId: number) => void;
}) {
  const open = useCallback(() => onOpen(player.playerId), [onOpen, player.playerId]);
  const meta = [
    player.goals ? `${player.goals} gol` : null,
    player.assists ? `${player.assists} asist` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={open}
      style={[styles.topRow, rank > 1 ? styles.ruled : null]}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${player.name}${meta ? `, ${meta}` : ""}`}
    >
      <RankBadge rank={rank} size={24} />
      <Avatar name={player.name} image={player.image} size={36} />
      <View style={styles.topTexts}>
        <Text style={styles.topName} numberOfLines={1} {...textScale.dense}>
          {player.name}
        </Text>
        <Text style={styles.topMeta} numberOfLines={1} {...textScale.dense}>
          {meta || "Katkı kaydı yok"}
        </Text>
      </View>
      <RatingPill value={player.rating} size="md" best={rank === 1} />
    </Touchable>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingTop: space.lg,
    paddingBottom: space.huge * 2,
  },
  ruled: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
  groupHeading: {
    ...type.h2,
    color: colors.textPrimary,
    flex: 1,
  },
  groupCount: {
    ...type.overline,
    color: colors.textTertiary,
  },
  groupCard: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  groupTitle: {
    ...type.overline,
    color: colors.textTertiary,
  },
  note: {
    ...type.bodySm,
    color: colors.textTertiary,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
  },

  /* — Kahraman halka — */
  hero: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.lg,
  },
  heroSide: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  heroSideAway: {
    alignItems: "flex-end",
  },
  heroPct: {
    ...type.scoreLg,
  },
  heroPctHome: {
    color: colors.accentText,
  },
  heroPctAway: {
    color: colors.textSecondary,
  },
  heroSub: {
    ...type.overline,
    color: colors.textTertiary,
  },
  ring: {
    width: RING,
    height: RING,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ringTotal: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  ringLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  dominance: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  dominanceHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dominanceValue: {
    ...type.numSmStrong,
    fontFamily: fonts.bold,
    color: colors.brandAccent,
  },
  dominanceNote: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 64,
    paddingHorizontal: space.lg,
  },
  topTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  topName: {
    ...type.h3,
    color: colors.textPrimary,
  },
  topMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
