/**
 * "Sen neredesin" — kendi satırın ekranda değilken altta sabit duran şerit
 * ("Sen: 37."). Dokununca, satırın yüklenmişse oraya kaydırır.
 *
 * `useRowVisibility`: FlatList'in görünür satırlarından kendi satırının
 * ekranda olup olmadığını izler; şerit yalnız o zaman gizlenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, type ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, Touchable } from "@/components/ui";
import { formatCount } from "@/lib/leaderboard";
import { colors, elevate, fonts, layout, radius, space, textScale, type } from "@/theme";

import { RankBadge } from "./RankBadge";

export function PinnedMe({
  name,
  rank,
  value,
  unit,
  caption,
  onPress,
}: {
  name: string;
  rank: number | null;
  value: number | null;
  unit: string;
  caption?: string;
  onPress?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <Touchable
        feedback="button"
        haptic="light"
        onPress={onPress}
        disabled={!onPress}
        style={styles.bar}
        accessibilityRole="button"
        accessibilityLabel={rank != null ? `Senin sıran: ${rank}` : "Bu tabloda henüz yoksun"}
      >
        <RankBadge rank={rank} mine />
        <Avatar name={name} size={32} ring="brand" />
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {rank != null ? `Sen: ${formatCount(rank)}.` : "Sen: sırasız"}
          </Text>
          {caption ? (
            <Text style={styles.caption} numberOfLines={1} {...textScale.dense}>
              {caption}
            </Text>
          ) : null}
        </View>
        {value != null ? (
          <View style={styles.valueBox}>
            <Text style={styles.value} {...textScale.badge}>
              {formatCount(value)}
            </Text>
            <Text style={styles.unit} {...textScale.badge}>
              {unit}
            </Text>
          </View>
        ) : null}
        {onPress ? <Ionicons name="arrow-down-circle" size={20} color={colors.brandAccent} /> : null}
      </Touchable>
    </View>
  );
}

/** Kendi satırının ekranda görünüp görünmediğini izler. */
export function useRowVisibility(isMine: (item: unknown) => boolean) {
  const [visible, setVisible] = useState(false);
  /** Ekrandaki en üst satırın sırası (liste başı görünüyor mu sorusu için). */
  const [topIndex, setTopIndex] = useState(0);
  const mineRef = useRef(isMine);
  mineRef.current = isMine;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const shown = viewableItems.filter((token) => token.isViewable);
    setVisible(shown.some((token) => mineRef.current(token.item)));
    setTopIndex(shown.reduce((min, token) => Math.min(min, token.index ?? min), Number.POSITIVE_INFINITY));
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  return { visible, topIndex, onViewableItemsChanged, viewabilityConfig };
}

/** Liste sonu: sonraki sayfa yükleniyor / hepsi listelendi. */
export function BoardFooter({ loading, done, count, total }: { loading: boolean; done: boolean; count: number; total?: number | null }) {
  if (loading) {
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={colors.textTertiary} />
      </View>
    );
  }
  if (!done || count === 0) return <View style={styles.footerSpace} />;
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText} {...textScale.dense}>
        {`${formatCount(total ?? count)} oyuncunun tamamı listelendi`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: layout.screenPadding },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.brandBorder,
    backgroundColor: colors.surface1,
    ...elevate(3),
  },
  texts: { flex: 1, gap: 1 },
  title: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary },
  caption: { ...type.caption, color: colors.textTertiary },
  valueBox: { alignItems: "flex-end" },
  value: { ...type.scoreSm, color: colors.brandAccent },
  unit: { ...type.micro, color: colors.textTertiary },
  footer: { paddingVertical: space.xl, alignItems: "center" },
  footerSpace: { height: space.xl },
  footerText: { ...type.caption, color: colors.textTertiary },
});
