/**
 * Kulüp Şehri 2.0 — küçük ortak parçalar: bina ikon karosu, yıldız bedeli,
 * ilerleme çubuğu, durum işareti, maliyet düğmesi.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Touchable } from "@/components/ui";
import { CITY2_UI, CITY2_UNIT_COLORS, CITY_ICONS, CITY_UI, LANDMARK_ICONS, LANDMARK_TIER_STYLE } from "@/lib/puzzle/cityPalette";
import { fonts, radius, space, textScale, type } from "@/theme";
import { CG, CP } from "@/lib/puzzle/cityGamePalette";

export const fmt = (n: number) => n.toLocaleString("tr-TR");
const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;
const LEFT = { x: 0, y: 0.5 } as const;
const RIGHT = { x: 1, y: 0.5 } as const;

type IconName = keyof typeof Ionicons.glyphMap;
const asIcon = (name: string | undefined, fallback: IconName): IconName =>
  name && name in Ionicons.glyphMap ? (name as IconName) : fallback;

export const unitColors2 = (key: string): [string, string] => CITY2_UNIT_COLORS[key] ?? CITY2_UNIT_COLORS.halisaha;

/** Bina karosu: açık binada renkli, kapalıda gri. */
export function BuildingIcon({ buildingKey, icon, size = 48, off, stage }: { buildingKey: string; icon?: string; size?: number; off?: boolean; stage?: number }) {
  const name = asIcon(icon || CITY_ICONS[buildingKey], "business");
  const box = { width: size, height: size, borderRadius: size >= 44 ? radius.lg : radius.md };
  return (
    <View>
      {off ? (
        <View style={[styles.icon, box, styles.iconOff]}>
          <Ionicons name={name} size={Math.round(size * 0.5)} color={CP.textTertiary} />
        </View>
      ) : (
        <LinearGradient colors={unitColors2(buildingKey)} start={TOP} end={BOTTOM} style={[styles.icon, box]}>
          <Ionicons name={name} size={Math.round(size * 0.5)} color={CITY_UI.white} />
        </LinearGradient>
      )}
      {stage != null && stage > 0 ? (
        <View style={styles.stageBadge}>
          <Text style={styles.stageBadgeText} {...textScale.badge}>
            {stage}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Sembol yapı karosu (kademe rengi + yapının ikonu). */
export function LandmarkIcon({ landmarkKey, tier, size = 44, off }: { landmarkKey: string; tier: string; size?: number; off?: boolean }) {
  const style = LANDMARK_TIER_STYLE[tier] ?? LANDMARK_TIER_STYLE.sus;
  const name = asIcon(LANDMARK_ICONS[landmarkKey] ?? style.icon, "flower");
  const box = { width: size, height: size, borderRadius: size >= 40 ? radius.md : radius.sm };
  if (off) {
    return (
      <View style={[styles.icon, box, styles.iconOff]}>
        <Ionicons name={name} size={Math.round(size * 0.5)} color={CP.textTertiary} />
      </View>
    );
  }
  return (
    <LinearGradient colors={style.colors} start={TOP} end={BOTTOM} style={[styles.icon, box]}>
      <Ionicons name={name} size={Math.round(size * 0.5)} color={CITY_UI.white} />
    </LinearGradient>
  );
}

/** "★ 120" — yıldız bedeli. */
export function StarCost({ value, muted, style }: { value: number; muted?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.cost, style]}>
      <Ionicons name="star" size={12} color={muted ? CP.textTertiary : CP.yellowCard} />
      <Text style={[styles.costText, muted ? styles.costMuted : null]} {...textScale.badge}>
        {fmt(value)}
      </Text>
    </View>
  );
}

const BAR_FILL = { go: CG.barGreen, brand: CG.league } as const;

/** Parlak ilerleme çubuğu (0..1): oyun yeşili ya da lig moru. */
export function Bar({ value, tone = "go", style }: { value: number; tone?: "go" | "brand"; style?: StyleProp<ViewStyle> }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const fill = BAR_FILL[tone];
  return (
    <View style={[styles.track, style]}>
      {v > 0 ? <LinearGradient colors={fill} start={LEFT} end={RIGHT} style={[styles.fill, { width: `${Math.max(4, Math.round(v * 100))}%` as const }]} /> : null}
    </View>
  );
}

/** Koşul işareti: tamam (yeşil tik) ya da bekliyor (boş daire). */
export function Check({ ok, size = 18 }: { ok: boolean; size?: number }) {
  return <Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={size} color={ok ? CP.win : CP.textTertiary} />;
}

/**
 * Yıldızla ödenen küçük eylem düğmesi: ★ bedel. Yetmiyorsa sönük ve
 * "eksik" yazar; kilitliyse kilit ikonu.
 */
export function CostButton({
  cost,
  available,
  onPress,
  busy,
  disabled,
  accessibilityLabel,
}: {
  cost: number;
  available: number;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const short = available < cost;
  const off = disabled || short || busy;
  return (
    <Touchable
      onPress={onPress}
      disabled={off}
      haptic="success"
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off) }}
      accessibilityLabel={short ? `${accessibilityLabel}, ${cost - available} yıldız eksik` : accessibilityLabel}
      style={[styles.costBtn, short ? styles.costBtnShort : null, off && !short ? styles.costBtnOff : null]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={CP.textOnBrand} />
      ) : (
        <>
          <Ionicons name="star" size={13} color={short ? CP.textTertiary : CITY_UI.white} />
          <Text style={[styles.costBtnText, short ? styles.costBtnTextShort : null]} {...textScale.badge}>
            {fmt(cost)}
          </Text>
        </>
      )}
    </Touchable>
  );
}

/** Bölüm başlığı (parşömen içi): altın elmas + büyük harf başlık + tahta çizgi. */
export function SectionTitle({ title, meta, action }: { title: string; meta?: string | null; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.section} accessibilityRole="header">
      <LinearGradient colors={CG.rivet} start={TOP} end={BOTTOM} style={styles.sectionGem} />
      <Text style={styles.sectionTitle} numberOfLines={1} {...textScale.dense}>
        {title.toLocaleUpperCase("tr-TR")}
      </Text>
      <View style={styles.sectionRule} />
      {action ? (
        <Touchable onPress={action.onPress} feedback="icon" hitSlop={8} accessibilityRole="button" accessibilityLabel={action.label}>
          <Text style={styles.sectionAction} {...textScale.dense}>
            {action.label}
          </Text>
        </Touchable>
      ) : null}
      {meta ? (
        <Text style={styles.sectionMeta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center", justifyContent: "center" },
  iconOff: { backgroundColor: CP.surface3 },
  stageBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: space.xxs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CITY_UI.ink,
    borderWidth: 1.5,
    borderColor: CP.surface1,
  },
  stageBadgeText: { ...type.micro, fontFamily: fonts.bold, color: CITY_UI.white },
  cost: { flexDirection: "row", alignItems: "center", gap: 3 },
  costText: { ...type.numSmStrong, color: CP.textPrimary },
  costMuted: { color: CP.textTertiary },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: CG.track, overflow: "hidden" },
  fill: { height: 10, borderRadius: radius.pill },
  costBtn: {
    minWidth: 72,
    height: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    backgroundColor: CITY2_UI.go,
  },
  costBtnShort: { backgroundColor: CP.surface3 },
  costBtnOff: { opacity: 0.5 },
  costBtnText: { ...type.label, fontFamily: fonts.bold, color: CITY_UI.white },
  costBtnTextShort: { color: CP.textTertiary },
  section: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm, flexWrap: "wrap" },
  sectionGem: { width: 12, height: 12, borderRadius: 2, transform: [{ rotate: "45deg" }], borderWidth: 1.5, borderColor: CG.woodLip },
  sectionTitle: { ...type.h3, fontFamily: fonts.bold, color: CP.textPrimary, letterSpacing: 0.6, flexShrink: 1 },
  sectionRule: { flex: 1, minWidth: 24, height: 2, borderRadius: 1, backgroundColor: CP.border },
  sectionMeta: { ...type.caption, fontFamily: fonts.semibold, color: CP.textTertiary, flexBasis: "100%", marginLeft: space.md + space.xxs },
  sectionAction: { ...type.label, fontFamily: fonts.bold, color: CP.brandAccent },
});

/** Parşömen kartı: açık krem, kalın altın-kahve kenar, altta kalın "dudak". */
export const cardStyle = {
  borderRadius: radius.xl,
  backgroundColor: CP.surface1,
  borderWidth: 2,
  borderBottomWidth: 4,
  borderColor: CP.border,
} as const;
