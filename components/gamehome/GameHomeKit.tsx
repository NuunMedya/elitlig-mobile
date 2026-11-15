/**
 * OYUN ANA SAYFASI PARÇALARI — ev ekranının yapı taşları (sözleşme §6).
 * Renkler `lib/game/gameHomePalette.ts`.
 *
 *   · HomeTopBar   geri · can (sayaç) · jeton · yıldız · ayarlar (düz, ince)
 *   · HomeActions  en çok 3 etiketli eylem çipi (Ödüller · Sıralama · Diğer)
 *   · PlayButton   tek odak: düz yeşil "Bölüm N" / "OYNA" (zorluk alt satırda)
 *   · ChestBar     ince ilerleme satırı (sandık / bugünkü yıldız)
 *   · ChestIcon    sandık çizimi (harita, çubuk ve hediye açılışı)
 *   · StreakCrowns seri basamakları (3 taç)
 *   · HomeModal    oyun içi pencere (karartılmış sahnede beyaz kart)
 *
 * 2026-11 SADELEŞTİRME: parlama, kalın beyaz kenar, alt dudak ve nabız
 * kaldırıldı; dört yanda yüzen yuvarlak düğmeler tek bir çip satırına indi.
 * KIRPILMA KURALI: hiçbir rozet / nokta ebeveyninin dışına taşmaz (negatif
 * konum yok); sayılar `adjustsFontSizeToFit`e güvenmez (web onu yok sayar),
 * kısaltılır ve hap içeriğe göre genişler.
 *
 * Performans: her parça React.memo; animasyon yalnız pencere açılışında.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Ellipse, Path, Rect } from "react-native-svg";

import { Touchable, useReduceMotion } from "@/components/ui";
import { GH } from "@/lib/game/gameHomePalette";
import { fonts, radius, space, textScale, touchSlop, type } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

/** Sayı kısaltma: 10.000 ve üstü "12,5B" (dar telefonda hap kesilmesin). */
export const fmtShort = (n: number) => {
  if (n < 10_000) return n.toLocaleString("tr-TR");
  if (n < 1_000_000) return `${(Math.floor(n / 100) / 10).toLocaleString("tr-TR", { maximumFractionDigits: n < 100_000 ? 1 : 0 })}B`;
  return `${(Math.floor(n / 100_000) / 10).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}M`;
};

/* ═══════════════════════ ÜST ŞERİT ═══════════════════════ */

export interface TopBarLives {
  lives: number;
  max: number;
  label: string | null;
}

export const HomeTopBar = React.memo(function HomeTopBar({
  onBack,
  coins,
  onCoins,
  lives,
  onLives,
  stars,
  onStars,
  onSettings,
}: {
  onBack: () => void;
  coins: number | null;
  onCoins?: () => void;
  lives: TopBarLives | null;
  onLives?: () => void;
  stars: number | null;
  onStars?: () => void;
  onSettings: () => void;
}) {
  const timer = lives && lives.lives < lives.max && lives.label && lives.label !== "Dolu" ? lives.label : null;
  return (
    <View style={styles.topRow}>
      <Touchable onPress={onBack} hitSlop={touchSlop(36)} accessibilityRole="button" accessibilityLabel="Geri" style={styles.round} haptic="light">
        <Ionicons name="chevron-back" size={20} color={GH.white} />
      </Touchable>
      <View style={styles.pills}>
        {lives ? (
          <TopPill
            icon="heart"
            tint={GH.heart}
            value={String(lives.lives)}
            hint={timer}
            onPress={onLives}
            label={`Can ${lives.lives}/${lives.max}${timer ? `, sıradaki ${timer}` : ""}`}
          />
        ) : null}
        <TopPill icon="disc" tint={GH.coin} value={coins != null ? fmtShort(coins) : "–"} onPress={onCoins} label={`Jeton ${coins ?? 0}`} />
        <TopPill icon="star" tint={GH.star} value={stars != null ? fmtShort(stars) : "–"} onPress={onStars} label={`Yıldız ${stars ?? 0}`} />
      </View>
      <Touchable onPress={onSettings} hitSlop={touchSlop(36)} accessibilityRole="button" accessibilityLabel="Ayarlar" style={styles.round} haptic="light">
        <Ionicons name="settings-sharp" size={18} color={GH.white} />
      </Touchable>
    </View>
  );
});

function TopPill({
  icon,
  tint,
  value,
  hint,
  onPress,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: string;
  /** Değerin altında küçük satır (can sayacı). */
  hint?: string | null;
  onPress?: () => void;
  label: string;
}) {
  return (
    <Touchable onPress={onPress} disabled={!onPress} haptic="selection" style={styles.pill} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={18} color={tint} />
      <View style={styles.pillTexts}>
        <Text style={styles.pillValue} numberOfLines={1} {...textScale.badge}>{value}</Text>
        {hint ? <Text style={styles.pillHint} numberOfLines={1} {...textScale.badge}>{hint}</Text> : null}
      </View>
    </Touchable>
  );
}

/* ═══════════════════════ EYLEM ÇİPLERİ ═══════════════════════ */

export interface HomeAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** Küçük nokta: yalnız alınmayı bekleyen bir ödül varken. */
  dot?: boolean;
}

/**
 * Tek satır, eşit genişlikte etiketli çipler (en çok 3 önerilir). Dar
 * telefonda (< 360) ikon etiketin üstüne geçer: "Sıralama" yan yana
 * dizilişte 320px'te "Sırala…" diye kesiliyordu.
 */
export const HomeActions = React.memo(function HomeActions({ items }: { items: HomeAction[] }) {
  const { width } = useWindowDimensions();
  const stacked = width < 360;
  return (
    <View style={styles.actions}>
      {items.map((a) => (
        <Touchable key={a.key} onPress={a.onPress} haptic="selection" style={[styles.action, stacked && styles.actionStacked]} accessibilityRole="button" accessibilityLabel={a.dot ? `${a.label}, alınacak ödül var` : a.label}>
          <Ionicons name={a.icon} size={18} color={GH.white} />
          <Text style={styles.actionText} numberOfLines={1} {...textScale.badge}>{a.label}</Text>
          {a.dot ? <View style={styles.actionDot} /> : null}
        </Touchable>
      ))}
    </View>
  );
});

/* ═══════════════════════ OYNA DÜĞMESİ ═══════════════════════ */

export type Difficulty = "hard" | "super" | null;

/** Bölüm zorluğu: her 10. bölüm "Süper Zor", her 5. "Zor" (sözleşme §6). */
export const difficultyOf = (level: number): Difficulty => (level % 10 === 0 ? "super" : level % 5 === 0 ? "hard" : null);

export const PlayButton = React.memo(function PlayButton({
  title,
  sub,
  difficulty,
  onPress,
  disabled,
  busy,
  accessibilityLabel,
}: {
  title: string;
  sub?: string | null;
  difficulty?: Difficulty;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
}) {
  const fill = difficulty === "super" ? GH.playFlatSuper : difficulty === "hard" ? GH.playFlatHard : GH.playFlat;
  const edge = difficulty === "super" ? GH.playFlatSuperEdge : difficulty === "hard" ? GH.playFlatHardEdge : GH.playFlatEdge;
  const tag = difficulty === "super" ? "SÜPER ZOR" : difficulty === "hard" ? "ZOR" : null;
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled || busy}
      haptic="medium"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy) }}
      style={[styles.play, { backgroundColor: fill, borderBottomColor: edge, opacity: disabled ? 0.6 : 1 }]}
    >
      <Text style={styles.playTitle} numberOfLines={1} {...textScale.badge}>
        {busy ? "Hazırlanıyor…" : title}
      </Text>
      {(sub || tag) && !busy ? (
        <View style={styles.playSubRow}>
          {tag ? (
            <View style={styles.playTag}>
              <Ionicons name={difficulty === "super" ? "skull" : "flame"} size={11} color={GH.white} />
              <Text style={styles.playTagText} {...textScale.badge}>{tag}</Text>
            </View>
          ) : null}
          {sub ? (
            <Text style={styles.playSub} numberOfLines={1} {...textScale.badge}>{sub}</Text>
          ) : null}
        </View>
      ) : null}
    </Touchable>
  );
});

/* ═══════════════════════ SANDIK ═══════════════════════ */

export const ChestIcon = React.memo(function ChestIcon({ size = 40, open = false, tint }: { size?: number; open?: boolean; tint?: string }) {
  const body = tint ?? GH.chest;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Ellipse cx={20} cy={36} rx={15} ry={3} fill={GH.inkShadow} opacity={0.4} />
      {open ? <Ellipse cx={20} cy={16} rx={14} ry={9} fill={GH.chestGlow} /> : null}
      <Rect x={5} y={17} width={30} height={18} rx={3} fill={body} />
      <Rect x={5} y={17} width={30} height={5} fill={GH.chestDeep} opacity={0.35} />
      {open ? (
        <Path d="M 5 15 L 9 4 L 35 4 L 35 9 L 9 15 Z" fill={body} />
      ) : (
        <Path d="M 5 18 Q 5 7 20 7 Q 35 7 35 18 Z" fill={body} />
      )}
      <Rect x={17} y={open ? 4 : 7} width={6} height={open ? 11 : 28} fill={GH.chestBand} opacity={0.95} />
      <Rect x={16} y={20} width={8} height={8} rx={2} fill={GH.chestBand} />
      <Rect x={18.5} y={22.5} width={3} height={3} rx={1} fill={GH.chestDeep} />
      <Rect x={5} y={32} width={30} height={3} fill={GH.chestDeep} opacity={0.5} />
    </Svg>
  );
});

/** İnce ilerleme satırı: ikon · başlık · ince çubuk · "16/40". */
export const ChestBar = React.memo(function ChestBar({
  title,
  value,
  max,
  onPress,
  icon,
}: {
  title: string;
  value: number;
  max: number;
  onPress?: () => void;
  /** Sol ikon yerine (ör. yıldız); yoksa küçük sandık. */
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const prog = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return (
    <Touchable onPress={onPress} disabled={!onPress} haptic="selection" style={styles.bar} accessibilityRole={onPress ? "button" : "text"} accessibilityLabel={`${title}: ${value}/${max}`}>
      {icon ? <Ionicons name={icon} size={16} color={GH.coin} /> : <ChestIcon size={22} />}
      <Text style={styles.barTitle} numberOfLines={1} {...textScale.badge}>{title}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${prog * 100}%` }]} />
      </View>
      <Text style={styles.barValue} numberOfLines={1} {...textScale.badge}>
        {fmtShort(Math.min(value, max))}/{fmtShort(max)}
      </Text>
    </Touchable>
  );
});

/* ═══════════════════════ SERİ TAÇLARI ═══════════════════════ */

export const StreakCrowns = React.memo(function StreakCrowns({ tier, size = 26 }: { tier: number; size?: number }) {
  return (
    <View style={styles.crowns} accessibilityLabel={`Seri basamağı ${tier}/3`}>
      {[1, 2, 3].map((n) => (
        <View key={n} style={[styles.crown, n <= tier ? styles.crownOn : null]}>
          <Ionicons name="trophy" size={size * 0.62} color={n <= tier ? GH.coin : GH.crownOff} />
        </View>
      ))}
    </View>
  );
});

/* ═══════════════════════ PENCERE ═══════════════════════ */

export function HomeModal({
  visible,
  onClose,
  title,
  top,
  children,
  footer,
  style,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  top?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const pop = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (!visible) return;
    if (reduce) {
      pop.setValue(1);
      return;
    }
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [pop, reduce, visible]);
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.dim}>
        <Animated.View
          accessibilityViewIsModal
          style={[{ width: Math.min(380, width - space.lg * 2), opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }, style]}
        >
          <View style={[styles.card, { maxHeight: height - 96 }]}>
            <LinearGradient colors={GH.card} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
            <ScrollView contentContainerStyle={styles.cardBody} bounces={false} showsVerticalScrollIndicator={false}>
              <View style={styles.cardHead} accessibilityRole="header">
                {top ? <Text style={styles.cardTop} numberOfLines={1} {...textScale.badge}>{top}</Text> : null}
                <Text style={styles.cardTitle} numberOfLines={2} {...textScale.badge}>{title}</Text>
              </View>
              {children}
            </ScrollView>
            {footer ? <View style={styles.cardFoot}>{footer}</View> : null}
          </View>
          <Touchable onPress={onClose} hitSlop={touchSlop(36)} accessibilityRole="button" accessibilityLabel="Kapat" style={styles.close} haptic="light">
            <Ionicons name="close" size={20} color={GH.cardInk} />
          </Touchable>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Pencere içi satır: ikon kabarcığı + başlık/alt yazı + sağda öğe. */
export function ModalRow({ icon, tint, title, sub, right }: { icon: keyof typeof Ionicons.glyphMap; tint: string; title: string; sub?: string | null; right?: React.ReactNode }) {
  return (
    <View style={styles.mrow}>
      <View style={styles.mrowIcon}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <View style={styles.mrowTexts}>
        <Text style={styles.mrowTitle} {...textScale.dense}>{title}</Text>
        {sub ? <Text style={styles.mrowSub} {...textScale.dense}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/* ═══════════════════════ STİLLER ═══════════════════════ */

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  round: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.hud, borderWidth: 1, borderColor: GH.hudEdge },
  pills: { flex: 1, minWidth: 0, flexDirection: "row", gap: space.xs },
  // Hap içeriğe göre genişler (flexBasis auto), kalan yer eşit paylaşılır: "3.6…" kesilmesi biter.
  pill: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: GH.hud,
    borderWidth: 1,
    borderColor: GH.hudEdge,
  },
  pillTexts: { flexShrink: 0, alignItems: "flex-start" },
  pillValue: { ...type.tableNumStrong, color: GH.white },
  pillHint: { ...type.nano, color: GH.hudSoft, marginTop: -2 },

  actions: { flexDirection: "row", gap: space.sm, alignSelf: "stretch" },
  action: {
    flex: 1,
    minWidth: 0,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: GH.hud,
    borderWidth: 1,
    borderColor: GH.hudEdge,
  },
  actionStacked: { flexDirection: "column", height: 48, gap: 1, paddingHorizontal: space.xs },
  actionText: { ...type.labelSm, fontFamily: fonts.bold, color: GH.white, flexShrink: 1 },
  // Nokta çipin İÇİNDE (taşan rozet kırpılıyordu).
  actionDot: { position: "absolute", top: space.s, right: space.s, width: 8, height: 8, borderRadius: radius.pill, backgroundColor: GH.dot },

  play: {
    alignSelf: "stretch",
    minHeight: 56,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderBottomWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  playTitle: { ...type.h1, fontFamily: fonts.bold, color: GH.white },
  playSubRow: { flexDirection: "row", alignItems: "center", gap: space.s, marginTop: space.xxs, maxWidth: "100%" },
  playTag: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.s, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: GH.hud },
  playTagText: { ...type.micro, fontFamily: fonts.bold, color: GH.white },
  playSub: { ...type.caption, color: GH.white, opacity: 0.9, flexShrink: 1 },

  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, height: 32, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: GH.hud, borderWidth: 1, borderColor: GH.hudEdge },
  barTitle: { ...type.labelXs, fontFamily: fonts.bold, color: GH.white, flexShrink: 1 },
  barTrack: { flex: 1, minWidth: 48, height: 6, borderRadius: radius.pill, backgroundColor: GH.hudTrack, overflow: "hidden" },
  barFill: { height: 6, borderRadius: radius.pill, backgroundColor: GH.coin },
  barValue: { ...type.numSmStrong, color: GH.white },

  crowns: { flexDirection: "row", gap: space.xs, justifyContent: "center" },
  crown: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.bar },
  crownOn: { borderWidth: 2, borderColor: GH.coin },

  dim: { flex: 1, backgroundColor: GH.dim, alignItems: "center", justifyContent: "center", paddingVertical: space.xl },
  card: { borderRadius: radius.xxl, overflow: "hidden", elevation: 8, shadowColor: GH.inkShadow, shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  cardBody: { paddingTop: space.xl, paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md },
  // Yanlarda kapat düğmesi kadar boşluk: uzun başlık düğmenin altına girmesin.
  cardHead: { alignItems: "center", gap: space.xxs, paddingHorizontal: space.xxxl },
  cardTop: { ...type.overline, fontFamily: fonts.bold, color: GH.cardSoft },
  cardTitle: { ...type.h1, fontFamily: fonts.bold, color: GH.cardInk, textAlign: "center" },
  cardFoot: { paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.xs, gap: space.sm },
  close: { position: "absolute", top: space.md, right: space.md, width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.panel },

  mrow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, borderRadius: radius.lg, backgroundColor: GH.panel },
  mrowIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.white },
  mrowTexts: { flex: 1, gap: 2 },
  mrowTitle: { ...type.label, fontFamily: fonts.bold, color: GH.cardInk },
  mrowSub: { ...type.caption, color: GH.cardSoft },
});
