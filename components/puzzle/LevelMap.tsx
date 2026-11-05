/**
 * LİG YOLU HARİTASI — aşağıdan yukarı kıvrılan seviye yolu.
 *
 * NE: her satır bir seviye düğümü; düğümler bir sinüs eğrisiyle sağa sola
 * kıvrılır, aralarında küçük adım noktaları vardır. Geçilmiş düğüm yıldızlarını
 * taşır, sıradaki düğüm büyük ve vurgulu ("OYNA"), kilitliler sönük. Her 10.
 * seviye kupa düğümü; her 20 seviyede bir lig basamağı başlığı (Amatör Lig →
 * Elit Lig).
 *
 * NEDEN TERS FLATLIST: yol aşağıdan yukarı okunur (seviye 1 en altta) ve açılışta
 * kullanıcının bulunduğu yere kaydırılır; sabit satır yüksekliği getItemLayout
 * ile sanallaştırmayı ucuz tutar — 300+ seviyede de akıcı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, FlatList, StyleSheet, Text, View } from "react-native";

import { Touchable, useReduceMotion } from "@/components/ui";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

const ROW = 96;
const NODE = 60;
const NODE_CURRENT = 76;
/** Haritada açık seviyenin ötesinde gösterilen kilitli seviye sayısı. */
const AHEAD = 25;

/** Lig basamakları — her 20 seviye bir basamak. */
export const LEAGUE_TIERS = [
  "Amatör Lig",
  "Mahalle Kupası",
  "Bölgesel Amatör Lig",
  "3. Lig",
  "2. Lig",
  "1. Lig",
  "Süper Lig",
  "Şampiyonlar Gecesi",
  "Elit Lig",
];

export const tierOf = (level: number) => LEAGUE_TIERS[Math.min(LEAGUE_TIERS.length - 1, Math.floor((level - 1) / 20))];

interface Row {
  level: number;
  stars: number;
  state: "done" | "current" | "locked";
}

export function LevelMap({
  cleared,
  stars,
  onPlay,
  tone,
  header,
}: {
  /** Geçilmiş son seviye. */
  cleared: number;
  stars: Record<string, number>;
  onPlay: (level: number) => void;
  /** Düğüm rengi. */
  tone: string;
  header?: React.ReactElement | null;
}) {
  const current = cleared + 1;
  const data = useMemo<Row[]>(() => {
    const total = current + AHEAD;
    return Array.from({ length: total }, (_, i) => {
      const level = i + 1;
      return { level, stars: Number(stars[String(level)] || 0), state: level < current ? "done" : level === current ? "current" : "locked" };
    });
  }, [current, stars]);

  const listRef = useRef<FlatList<Row>>(null);
  const renderItem = useCallback(
    ({ item }: { item: Row }) => <LevelNode row={item} tone={tone} onPlay={onPlay} />,
    [onPlay, tone]
  );

  return (
    <FlatList
      ref={listRef}
      data={data}
      inverted
      keyExtractor={(item) => String(item.level)}
      renderItem={renderItem}
      getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
      initialScrollIndex={Math.max(0, current - 3)}
      initialNumToRender={14}
      windowSize={7}
      contentContainerStyle={styles.content}
      ListFooterComponent={header ?? null}
      showsVerticalScrollIndicator={false}
    />
  );
}

/** Düğümün yatay konumu: yumuşak bir yılan yolu (-1…1). */
const sway = (level: number) => Math.sin(level * 0.85) * 0.62;

const LevelNode = React.memo(function LevelNode({ row, tone, onPlay }: { row: Row; tone: string; onPlay: (level: number) => void }) {
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  const isCurrent = row.state === "current";
  const cup = row.level % 10 === 0;

  useEffect(() => {
    if (!isCurrent || reduce) return;
    // Sonlu nabız: dikkat çeker ama pil yemez (tasarım kuralı: sonsuz döngü yok).
    const beat = Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    const anim = Animated.loop(beat, { iterations: 6 });
    anim.start();
    return () => anim.stop();
  }, [isCurrent, pulse, reduce]);

  const size = isCurrent ? NODE_CURRENT : NODE;
  const offset = `${50 + sway(row.level) * 50}%` as const;
  const tierStart = (row.level - 1) % 20 === 0;
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <View style={styles.row}>
      {tierStart ? (
        <View style={styles.tier} pointerEvents="none">
          <View style={styles.tierLine} />
          <Text style={styles.tierText} {...textScale.badge}>{tierOf(row.level)}</Text>
          <View style={styles.tierLine} />
        </View>
      ) : null}
      <View style={[styles.dotTrail, { left: `${50 + ((sway(row.level) + sway(row.level + 1)) / 2) * 50}%` }]} pointerEvents="none">
        <View style={[styles.dot, row.state === "locked" ? styles.dotLocked : { backgroundColor: tone }]} />
      </View>
      <Animated.View style={[styles.nodeWrap, { left: offset, width: size, marginLeft: -size / 2, transform: [{ scale }] }]}>
        <Touchable
          onPress={() => row.state !== "locked" && onPlay(row.level)}
          disabled={row.state === "locked"}
          haptic="selection"
          style={[
            styles.node,
            { width: size, height: size, borderRadius: size / 2 },
            row.state === "locked" ? styles.nodeLocked : { backgroundColor: tone },
            cup && row.state !== "locked" ? styles.nodeCup : null,
            isCurrent ? styles.nodeCurrent : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${row.level}. seviye${cup ? ", kupa maçı" : ""}${row.state === "done" ? `, ${row.stars} yıldız` : row.state === "locked" ? ", kilitli" : ", oyna"}`}
        >
          {row.state === "locked" ? (
            <Ionicons name={cup ? "trophy-outline" : "lock-closed"} size={20} color={colors.textTertiary} />
          ) : cup ? (
            <Ionicons name="trophy" size={isCurrent ? 30 : 24} color={colors.star} />
          ) : (
            <Text style={[styles.nodeText, isCurrent ? styles.nodeTextCurrent : null]} {...textScale.badge}>
              {row.level}
            </Text>
          )}
        </Touchable>
        {row.state === "done" ? (
          <View style={styles.stars}>
            {[1, 2, 3].map((n) => (
              <Ionicons key={n} name="star" size={n === 2 ? 16 : 13} color={n <= row.stars ? colors.star : colors.starEmpty} style={n === 2 ? styles.starMid : null} />
            ))}
          </View>
        ) : isCurrent ? (
          <View style={styles.playTag}>
            <Text style={styles.playText} {...textScale.badge}>OYNA</Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  content: { paddingVertical: space.xl },
  row: { height: ROW, justifyContent: "center" },
  tier: { position: "absolute", left: 0, right: 0, bottom: ROW - 16, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg },
  tierLine: { flex: 1, height: hairline, backgroundColor: colors.borderStrong },
  tierText: { ...type.overline, color: colors.textSecondary },
  dotTrail: { position: "absolute", bottom: -4, marginLeft: -4 },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  dotLocked: { backgroundColor: colors.border },
  nodeWrap: { position: "absolute", alignItems: "center" },
  node: { alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.surface1 },
  nodeLocked: { backgroundColor: colors.surface3, borderColor: colors.border },
  nodeCup: { borderColor: colors.star },
  nodeCurrent: { borderWidth: 4, borderColor: colors.surface1 },
  nodeText: { ...type.h3, fontFamily: fonts.bold, color: colors.textOnBrand },
  nodeTextCurrent: { ...type.h1, fontFamily: fonts.bold, color: colors.textOnBrand },
  stars: { flexDirection: "row", alignItems: "flex-end", marginTop: 2 },
  starMid: { marginBottom: 3 },
  playTag: { marginTop: 4, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.brand },
  playText: { ...type.micro, color: colors.textOnBrand },
});
