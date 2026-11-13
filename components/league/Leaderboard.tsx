/**
 * Leaderboard — "ilk beş" lider tablosu kartı (İstatistik bölmesi).
 *
 * NEDEN ÇUBUK: eski İstatistik bölmesi her kategoriden YALNIZ birinciyi bir
 * menü satırı gibi yazıyordu ("CAPITAL FC · EN GOLCÜ ›"). Birincinin ne kadar
 * önde olduğu, ikincinin kim olduğu görünmüyordu — bir istatistik sayfasının
 * asıl sorusu ise tam olarak bu: FARK. Her satırın altındaki ince zümrüt
 * çubuk, değeri kategorinin birincisine oranlar; beş satıra bakınca yarışın
 * şekli okunur.
 *
 * ARENA: çubuk VERİDİR → `accent`. Birincinin rakamı bir kademe büyük (15px),
 * diğerleri tablo rakamı; sıra kutusu yoktur, sıra sönük bir rakamdır —
 * vurgu sayıdadır. Yoğun ölçü: satır 38px, arma/avatar 20–22px, ad 12px.
 *
 * İKİNCİ TUR: başlıkta degrade ikon karosu (`IconTile`, ton kategoriye
 * göre); ilk üç sırada kitin madalya rozeti; çubuk `GradientBar` (birincide
 * imza degradesi, diğerlerinde sönük) ve yaylanarak dolar; birincinin
 * satırı iri rakamla ve ince sönük zeminle öne çıkar.
 *
 * "Ters" ölçüt (en az gol yiyen): çubuk yine değeri gösterir ama oran
 * EN İYİYE göre ters kurulur (`invert`): az olan uzun çubuk alır. Aksi hâlde
 * birinci sıradaki takım en kısa çubukla dururdu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Avatar,
  GradientBar,
  IconTile,
  RankBadge,
  TeamLogo,
  Touchable,
  type IconTileTone,
} from "@/components/ui";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

/** Satırdaki arma ölçüsü (oyuncu avatarı 2px büyük — yuvarlak, gözde küçük kalır). */
const CREST = 28;

export interface LeaderEntry {
  id: number;
  name: string;
  /** Ad altındaki bağlam (takım adı, "27 maç"). */
  meta?: string;
  image?: string | null;
  value: number;
  /** Ekrana yazılan biçim (ör. "2,15"); verilmezse `value`. */
  display?: string;
}

export interface LeaderboardProps {
  title: string;
  /** Sağ üst köşede birim: "GOL", "KART". */
  unit: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Başlık karosunun tonu (varsayılan camgöbeği). */
  tone?: IconTileTone;
  kind: "team" | "player";
  entries: LeaderEntry[];
  /** Az olan iyi: çubuk oranı tersine kurulur. */
  invert?: boolean;
  onPressEntry: (id: number) => void;
  /** "Tümü" bağlantısı. */
  onSeeAll?: () => void;
}

const LeaderRow = React.memo(function LeaderRow({
  entry,
  rank,
  ratio,
  kind,
  first,
  onPress,
}: {
  entry: LeaderEntry;
  rank: number;
  ratio: number;
  kind: "team" | "player";
  first: boolean;
  onPress: (id: number) => void;
}) {
  const handlePress = useCallback(() => onPress(entry.id), [entry.id, onPress]);
  const display = entry.display ?? String(entry.value);
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      style={[styles.row, first ? styles.rowFirst : null]}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${entry.name}, ${display}`}
    >
      <RankBadge rank={rank} size={22} />
      {kind === "team" ? (
        <TeamLogo name={entry.name} logo={entry.image ?? null} size={CREST} />
      ) : (
        <Avatar name={entry.name} image={entry.image ?? null} size={CREST + 4} />
      )}
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {entry.name}
          </Text>
          {entry.meta ? (
            <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
              {entry.meta}
            </Text>
          ) : null}
        </View>
        <GradientBar
          value={Math.max(0.04, ratio)}
          height={first ? 5 : 4}
          gradient={first ? undefined : [colors.accentBorder, colors.accentBorder]}
        />
      </View>
      <Text style={first ? styles.valueFirst : styles.value} {...textScale.dense}>
        {display}
      </Text>
    </Touchable>
  );
});

export const Leaderboard = React.memo(function Leaderboard({
  title,
  unit,
  icon,
  tone = "cyan",
  kind,
  entries,
  invert = false,
  onPressEntry,
  onSeeAll,
}: LeaderboardProps) {
  if (entries.length === 0) return null;

  const values = entries.map((entry) => entry.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values);

  /** Çubuk oranı: düz ölçütte değer/en büyük, ters ölçütte en küçük/değer. */
  const ratioOf = (value: number) => {
    if (invert) return value <= 0 ? 1 : Math.max(min, 0.0001) / value;
    return max > 0 ? value / max : 0;
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <IconTile icon={icon} tone={tone} size={28} glow={false} />
        <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
          {title}
        </Text>
        <Text style={styles.unit} {...textScale.badge}>
          {upperTR(unit)}
        </Text>
      </View>

      {entries.map((entry, index) => (
        <LeaderRow
          key={entry.id}
          entry={entry}
          rank={index + 1}
          ratio={ratioOf(entry.value)}
          kind={kind}
          first={index === 0}
          onPress={onPressEntry}
        />
      ))}

      {onSeeAll ? (
        <Touchable
          feedback="row"
          haptic="selection"
          onPress={onSeeAll}
          style={styles.more}
          accessibilityRole="button"
          accessibilityLabel={`${title}: tüm sıralama`}
        >
          <Text style={styles.moreText} {...textScale.dense}>
            Tüm sıralama
          </Text>
          <Ionicons name="chevron-forward" size={12} color={colors.brandAccent} />
        </Touchable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.s,
  },
  title: {
    ...type.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  unit: {
    ...type.overline,
    letterSpacing: 1,
    color: colors.textTertiary,
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
  },
  /* Birincinin satırı: sönük mor zemin — kim önde, tek bakışta. */
  rowFirst: {
    backgroundColor: colors.brandDim,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space.s,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.xs,
  },
  name: {
    ...type.h4,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  meta: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 2,
  },
  value: {
    ...type.scoreXs,
    color: colors.textPrimary,
    minWidth: 32,
    textAlign: "right",
  },
  valueFirst: {
    ...type.scoreMd,
    color: colors.textPrimary,
    minWidth: 32,
    textAlign: "right",
  },
  more: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
    minHeight: 40,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  moreText: {
    ...type.label,
    color: colors.brandAccent,
  },
});
