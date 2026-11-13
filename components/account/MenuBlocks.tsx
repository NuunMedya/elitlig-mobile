/**
 * MENÜ YAPI TAŞLARI — Menü ve Ayarlar ekranlarının ortak parçaları.
 *
 *   <QuickGrid>  → hızlı erişim ızgarası (4 sütun, IconTile + kısa ad + iz)
 *   <MenuGroup>  → ikonlu bölüm başlığı + TEK kart içinde satırlar
 *   <MenuItemRow>→ grup satırı: önde `IconTile` (36 px), başlık + meta,
 *                  sonda değer / rozet / anahtar / chevron
 *
 * NEDEN AYRI DOSYA: iki ekran da "araç menüsü" kurgusundadır (bkz.
 * docs/gece-temasi.md · Detay rehberi · Kategori/araç menüleri); satır
 * anatomisi ve ızgara ölçüleri iki yerde aynı kalsın.
 *
 * Kart içinde kart yok: grup kartının içinde satırlar `ListRow` değil, kendi
 * hafif satırlarıdır (zemin kartındır; satır yalnız basılı hâli boyar).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  Badge,
  IconTile,
  Reveal,
  SectionHeader,
  Toggle,
  Touchable,
  type IconTileTone,
} from "@/components/ui";
import { colors, elevate, fonts, hairline, radius, space, textScale, type } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/* ═══════════════════════════════ HIZLI ERİŞİM ═══════════════════════════════ */

export interface QuickItem {
  key: string;
  icon: IconName;
  label: string;
  /** Karonun altında küçük iz (ör. "7/10", "Yeni"). */
  hint?: string;
  tone: IconTileTone;
  onPress: () => void;
}

export const QuickGrid = React.memo(function QuickGrid({
  items,
  style,
}: {
  items: QuickItem[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.quickGrid, style]}>
      {items.map((item, index) => (
        <View key={item.key} style={styles.quickCell}>
          <Reveal index={index} distance={8} scaleFrom={0.94}>
            <QuickTile item={item} />
          </Reveal>
        </View>
      ))}
    </View>
  );
});

const QuickTile = React.memo(function QuickTile({ item }: { item: QuickItem }) {
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={item.hint ? `${item.label}, ${item.hint}` : item.label}
      style={styles.quickTile}
    >
      <IconTile icon={item.icon} tone={item.tone} size={42} />
      <Text style={styles.quickLabel} numberOfLines={1} {...textScale.dense}>
        {item.label}
      </Text>
      <Text style={[styles.quickHint, !item.hint && styles.quickHintEmpty]} numberOfLines={1} {...textScale.badge}>
        {item.hint ?? " "}
      </Text>
    </Touchable>
  );
});

/* ═══════════════════════════════ GRUP + SATIR ═══════════════════════════════ */

export interface MenuItemSpec {
  key: string;
  icon: IconName;
  tone?: IconTileTone;
  title: string;
  subtitle?: string;
  /** Sağda sayı/metin (Archivo, tablo hizalı). */
  value?: string;
  /** Sağda sayaç rozeti. */
  badge?: string;
  destructive?: boolean;
  /** Anahtar satırı — satırın tamamı basılabilir, chevron çizilmez. */
  toggle?: { value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean };
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export const MenuGroup = React.memo(function MenuGroup({
  title,
  icon,
  tone = "violet",
  subtitle,
  action,
  items,
  children,
  style,
}: {
  title?: string;
  icon?: IconName;
  tone?: IconTileTone;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  items?: MenuItemSpec[];
  /** Satırlardan önce kartın içine çizilecek serbest içerik. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.group, style]}>
      {title ? (
        <SectionHeader title={title} icon={icon} iconTone={tone} subtitle={subtitle} action={action} inset="flush" />
      ) : null}
      <View style={styles.card}>
        {children}
        {items?.map((item, index) => (
          <MenuItemRow key={item.key} item={item} last={index === items.length - 1} />
        ))}
      </View>
    </View>
  );
});

export const MenuItemRow = React.memo(function MenuItemRow({ item, last }: { item: MenuItemSpec; last?: boolean }) {
  const { toggle, onPress } = item;
  const handlePress = useCallback(() => {
    if (toggle && !toggle.disabled) toggle.onValueChange(!toggle.value);
    else onPress?.();
  }, [onPress, toggle]);
  const tone: IconTileTone = item.destructive ? "red" : (item.tone ?? "neutral");
  const label =
    item.accessibilityLabel ??
    [item.title, item.subtitle, item.value, toggle ? (toggle.value ? "açık" : "kapalı") : undefined]
      .filter(Boolean)
      .join(". ");
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      disabled={!onPress && !toggle}
      accessibilityRole={toggle ? "switch" : "button"}
      accessibilityState={toggle ? { checked: toggle.value } : undefined}
      accessibilityLabel={label}
      testID={item.testID}
      style={styles.row}
    >
      <IconTile icon={item.icon} tone={tone} size={36} glow={false} />
      <View style={[styles.rowBody, !last && styles.rowDivider]}>
        <View style={styles.rowText}>
          <Text
            style={[styles.rowTitle, item.destructive && styles.rowTitleDanger]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={1} {...textScale.dense}>
              {item.subtitle}
            </Text>
          ) : null}
        </View>
        {item.value ? (
          <Text style={styles.rowValue} numberOfLines={1} {...textScale.dense}>
            {item.value}
          </Text>
        ) : null}
        {item.badge ? <Badge label={item.badge} tone="brand" variant="solid" size="xs" /> : null}
        {toggle ? (
          <Toggle
            value={toggle.value}
            onValueChange={toggle.onValueChange}
            disabled={toggle.disabled}
            accessibilityLabel={item.title}
          />
        ) : onPress ? (
          <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
        ) : null}
      </View>
    </Touchable>
  );
});

/* ═══════════════════════════════ STİLLER ═══════════════════════════════ */

const ROW_MIN = 60;

const styles = StyleSheet.create({
  quickGrid: {
    flexDirection: "row",
    gap: space.sm,
  },
  quickCell: { flex: 1, minWidth: 0 },
  quickTile: {
    alignItems: "center",
    gap: space.s,
    paddingTop: space.md,
    paddingBottom: space.m,
    paddingHorizontal: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  quickLabel: {
    ...type.labelSm,
    color: colors.textPrimary,
    textAlign: "center",
    marginTop: space.xxs,
  },
  quickHint: {
    ...type.numSm,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: -space.xs,
  },
  quickHintEmpty: { opacity: 0 },

  group: { gap: 0 },
  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevate(1),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingLeft: space.md,
    minHeight: ROW_MIN,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingRight: space.md,
    paddingVertical: space.m,
  },
  rowDivider: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { ...type.h3, color: colors.textPrimary },
  rowTitleDanger: { color: colors.danger },
  rowSubtitle: { ...type.bodySm, color: colors.textTertiary },
  rowValue: {
    ...type.tableNum,
    fontFamily: fonts.bold,
    color: colors.textSecondary,
    maxWidth: 140,
  },
});
