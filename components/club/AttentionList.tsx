/**
 * DİKKAT LİSTESİ — yönetim merkezinin ilk bloğu: "şu an neyle ilgilenmeliyim?"
 *
 * NEDEN ISIZGARA DEĞİL LİSTE: bekleyen işler birbirine EŞİT değildir. Süresi
 * işleyen bir disiplin dosyası, gönderilmiş bir davetten önce gelir. Izgara
 * her karoyu aynı ağırlıkta gösterir; liste ise ağırlığa göre SIRALANIR
 * (`AttentionItem.weight`) ve göz yukarıdan aşağı en acil olandan başlar.
 *
 * SATIR DİLİ: solda tonlu ikon pulu (kategori), ortada iş + tek cümle bağlam,
 * sağda SAYI. Sayı Archivo'yla ve tonun renginde yazılır — Arena §1.5 "rakam
 * kahramandır": başkan satırı okumadan "3 başvuru, 2 sözleşmesiz" görür.
 *
 * BOŞ HÂL bir başarı hâlidir: yeşil onay ve "her şey güncel" cümlesi. Boş bir
 * kutu ya da hiç çizilmeyen bölüm, "veri mi gelmedi yoksa işim mi yok?"
 * sorusunu açık bırakırdı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { Touchable, toneColors } from "@/components/ui";
import { colors, elevate, hairline, layout, radius, space, textScale, type } from "@/theme";
import type { AttentionItem } from "./useClubSignals";

export interface AttentionListProps {
  items: AttentionItem[];
  onPress: (item: AttentionItem) => void;
  /** En fazla bu kadar satır; fazlası "Tümünü gör" satırına toplanır. */
  limit?: number;
  onSeeAll?: () => void;
  /** Liste boşken yazılacak cümle. */
  emptyText?: string;
  style?: StyleProp<ViewStyle>;
}

export const AttentionList = React.memo(function AttentionList({
  items,
  onPress,
  limit,
  onSeeAll,
  emptyText = "Bekleyen işin yok. Kadro, sözleşmeler ve talepler güncel.",
  style,
}: AttentionListProps) {
  if (items.length === 0) {
    return (
      <View style={[styles.card, styles.clear, style]}>
        <View style={[styles.pip, { backgroundColor: colors.winDim }]}>
          <Ionicons name="checkmark" size={16} color={colors.win} />
        </View>
        <Text style={styles.clearText} {...textScale.long}>
          {emptyText}
        </Text>
      </View>
    );
  }

  const visible = limit ? items.slice(0, limit) : items;
  const hidden = items.length - visible.length;

  return (
    <View style={[styles.card, style]}>
      {visible.map((item, index) => (
        <AttentionRow
          key={item.key}
          item={item}
          onPress={onPress}
          divider={index < visible.length - 1 || (hidden > 0 && Boolean(onSeeAll))}
        />
      ))}
      {hidden > 0 && onSeeAll ? (
        <Touchable
          feedback="row"
          haptic="selection"
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`${hidden} iş daha, tümünü gör`}
          style={styles.more}
        >
          <Text style={styles.moreText} {...textScale.dense}>
            {hidden} iş daha
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.brandAccent} />
        </Touchable>
      ) : null}
    </View>
  );
});

const AttentionRow = React.memo(function AttentionRow({
  item,
  onPress,
  divider,
}: {
  item: AttentionItem;
  onPress: (item: AttentionItem) => void;
  divider: boolean;
}) {
  const palette = toneColors(item.tone);
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${item.count} ${item.title}. ${item.subtitle}`}
      style={styles.row}
    >
      <View style={[styles.pip, { backgroundColor: palette.dim }]}>
        <Ionicons name={item.icon} size={16} color={palette.fg} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
          {item.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
          {item.subtitle}
        </Text>
      </View>
      <Text style={[styles.count, { color: palette.fg }]} {...textScale.badge}>
        {item.count > 99 ? "99+" : item.count}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      {divider ? <View pointerEvents="none" style={styles.divider} /> : null}
    </Touchable>
  );
});

const PIP = 32;

const styles = StyleSheet.create({
  card: {
    ...elevate(1),
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  clear: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
  },
  clearText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: layout.listRowHeightTwoLine,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  pip: {
    width: PIP,
    height: PIP,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...type.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  count: {
    ...type.metricSm,
    minWidth: 24,
    textAlign: "right",
  },
  divider: {
    position: "absolute",
    left: space.md + PIP + space.md,
    right: 0,
    bottom: 0,
    height: hairline,
    backgroundColor: colors.separator,
  },
  more: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: layout.minTouch,
  },
  moreText: {
    ...type.label,
    color: colors.brandAccent,
  },
});
