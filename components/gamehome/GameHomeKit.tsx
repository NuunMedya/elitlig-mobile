/**
 * OYUN ANA SAYFASI PARÇALARI — Royal Match tarzı ev ekranının yapı taşları
 * (sözleşme §6). Renkler `lib/game/gameHomePalette.ts`.
 *
 *   · HomeTopBar   avatar / geri · jeton (+) · can (sayaç) · yıldız · ayarlar
 *   · SideButton   yuvarlak parlak yan düğme (rozetli, altında etiket)
 *   · PlayButton   büyük yeşil "Bölüm N" / "OYNA" düğmesi (+ Zor / Süper Zor rozeti)
 *   · ChestBar     etkinlik / sandık ilerleme çubuğu
 *   · ChestIcon    sandık çizimi (harita, çubuk ve hediye açılışı)
 *   · StreakCrowns seri basamakları (3 taç)
 *   · HomeModal    oyun içi pencere (karartılmış sahnede beyaz kart)
 *
 * Performans: her parça React.memo; animasyonlar yerel sürücüde ve sonlu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Ellipse, Path, Rect } from "react-native-svg";

import { Touchable, useReduceMotion } from "@/components/ui";
import { GH } from "@/lib/game/gameHomePalette";
import { colors, fonts, radius, space, textScale, touchSlop, type } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;
const LEFT = { x: 0, y: 0.5 } as const;
const RIGHT = { x: 1, y: 0.5 } as const;
const fmt = (n: number) => n.toLocaleString("tr-TR");

/* ═══════════════════════ ÜST ŞERİT ═══════════════════════ */

export interface TopBarLives {
  lives: number;
  max: number;
  label: string | null;
}

export const HomeTopBar = React.memo(function HomeTopBar({
  onBack,
  initials,
  coins,
  onCoins,
  lives,
  onLives,
  stars,
  onStars,
  onSettings,
}: {
  onBack: () => void;
  /** Avatar harfleri (girişliyse); yoksa geri oku. */
  initials?: string | null;
  coins: number | null;
  onCoins?: () => void;
  lives: TopBarLives | null;
  onLives?: () => void;
  stars: number | null;
  onStars?: () => void;
  onSettings: () => void;
}) {
  return (
    <View style={styles.topRow}>
      <Touchable onPress={onBack} hitSlop={touchSlop(42)} accessibilityRole="button" accessibilityLabel="Geri" style={styles.round} haptic="light">
        {initials ? (
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText} {...textScale.badge}>{initials}</Text>
            <View style={styles.backBadge}>
              <Ionicons name="chevron-back" size={12} color={GH.ink} />
            </View>
          </View>
        ) : (
          <Ionicons name="chevron-back" size={24} color={GH.white} />
        )}
      </Touchable>
      <View style={styles.pills}>
        {lives ? (
          <TopPill
            icon="heart"
            tint={GH.heart}
            value={String(lives.lives)}
            hint={lives.lives >= lives.max ? "Dolu" : lives.label}
            plus={lives.lives < lives.max}
            onPress={onLives}
            label={`Can ${lives.lives}/${lives.max}${lives.label && lives.label !== "Dolu" ? `, sıradaki ${lives.label}` : ""}`}
          />
        ) : null}
        <TopPill icon="disc" tint={GH.coin} value={coins != null ? fmt(coins) : "–"} plus={Boolean(onCoins)} onPress={onCoins} label={`Jeton ${coins ?? 0}`} />
        <TopPill icon="star" tint={GH.star} value={stars != null ? fmt(stars) : "–"} onPress={onStars} label={`Yıldız ${stars ?? 0}`} />
      </View>
      <Touchable onPress={onSettings} hitSlop={touchSlop(42)} accessibilityRole="button" accessibilityLabel="Ayarlar" style={styles.round} haptic="light">
        <Ionicons name="settings-sharp" size={20} color={GH.white} />
      </Touchable>
    </View>
  );
});

function TopPill({
  icon,
  tint,
  value,
  hint,
  plus,
  onPress,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: string;
  hint?: string | null;
  plus?: boolean;
  onPress?: () => void;
  label: string;
}) {
  return (
    <Touchable onPress={onPress} disabled={!onPress} haptic="selection" style={styles.pill} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.pillIcon}>
        <Ionicons name={icon} size={24} color={tint} />
      </View>
      <View style={styles.pillTexts}>
        <Text style={styles.pillValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>{value}</Text>
        {hint ? <Text style={styles.pillHint} numberOfLines={1} {...textScale.badge}>{hint}</Text> : null}
      </View>
      {plus && onPress ? (
        <LinearGradient colors={GH.pillPlus} start={TOP} end={BOTTOM} style={styles.plus}>
          <Ionicons name="add" size={14} color={GH.white} />
        </LinearGradient>
      ) : null}
    </Touchable>
  );
}

/* ═══════════════════════ YAN DÜĞME ═══════════════════════ */

export type SideTone = keyof typeof GH.side;

export const SideButton = React.memo(function SideButton({
  icon,
  label,
  tone,
  onPress,
  badge,
  dot,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: SideTone;
  onPress: () => void;
  badge?: string | number | null;
  /** Kırmızı nokta: alınmayı bekleyen ödül. */
  dot?: boolean;
}) {
  return (
    <Touchable onPress={onPress} haptic="selection" style={styles.side} accessibilityRole="button" accessibilityLabel={badge != null ? `${label}, ${badge}` : label}>
      <View style={styles.sideLip} />
      <LinearGradient colors={GH.side[tone]} start={TOP} end={BOTTOM} style={styles.sideCircle}>
        <View style={styles.sideShine} />
        <Ionicons name={icon} size={26} color={GH.white} />
      </LinearGradient>
      {badge != null ? (
        <View style={styles.sideBadge}>
          <Text style={styles.sideBadgeText} {...textScale.badge}>{badge}</Text>
        </View>
      ) : dot ? (
        <View style={styles.sideDot} />
      ) : null}
      <Text style={styles.sideLabel} numberOfLines={1} {...textScale.badge}>{label}</Text>
    </Touchable>
  );
});

/* ═══════════════════════ BÜYÜK OYNA DÜĞMESİ ═══════════════════════ */

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
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || disabled) return undefined;
    // Sonlu nabız: dikkat çeker, pil yemez.
    const anim = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true })]), { iterations: 6 });
    anim.start();
    return () => anim.stop();
  }, [disabled, pulse, reduce]);
  const fill = difficulty === "super" ? GH.playSuper : difficulty === "hard" ? GH.playHard : GH.play;
  const lip = difficulty === "super" ? GH.playSuperLip : difficulty === "hard" ? GH.playHardLip : GH.playLip;
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const tagFill = difficulty === "super" ? GH.superHard : GH.hard;
  return (
    <Animated.View style={[styles.playWrap, { transform: [{ scale }] }]}>
      {difficulty ? (
        <LinearGradient colors={tagFill} start={LEFT} end={RIGHT} style={styles.diffTag}>
          <Ionicons name={difficulty === "super" ? "skull" : "flame"} size={14} color={GH.white} />
          <Text style={styles.diffText} {...textScale.badge}>{difficulty === "super" ? "SÜPER ZOR" : "ZOR"}</Text>
        </LinearGradient>
      ) : null}
      <Touchable
        onPress={onPress}
        disabled={disabled || busy}
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy) }}
        style={[styles.play, { opacity: disabled ? 0.6 : 1 }]}
      >
        <View style={[styles.playLip, { backgroundColor: lip }]} />
        <LinearGradient colors={fill} start={TOP} end={BOTTOM} style={styles.playFill}>
          <View style={styles.playShine} />
          <Text style={styles.playTitle} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
            {busy ? "Hazırlanıyor…" : title}
          </Text>
          {sub && !busy ? (
            <Text style={styles.playSub} numberOfLines={1} {...textScale.badge}>{sub}</Text>
          ) : null}
        </LinearGradient>
      </Touchable>
    </Animated.View>
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

export const ChestBar = React.memo(function ChestBar({
  title,
  value,
  max,
  onPress,
  icon,
  note,
}: {
  title: string;
  value: number;
  max: number;
  onPress?: () => void;
  /** Sol ikon yerine (ör. seri alevi); yoksa sandık. */
  icon?: keyof typeof Ionicons.glyphMap;
  note?: string | null;
}) {
  const prog = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return (
    <Touchable onPress={onPress} disabled={!onPress} haptic="selection" style={styles.bar} accessibilityRole="button" accessibilityLabel={`${title}: ${value}/${max}`}>
      <View style={styles.barIcon}>{icon ? <Ionicons name={icon} size={30} color={GH.coin} /> : <ChestIcon size={44} />}</View>
      <View style={styles.barBody}>
        <Text style={styles.barTitle} numberOfLines={1} {...textScale.badge}>{title}</Text>
        <View style={styles.barTrack}>
          <LinearGradient colors={GH.barFill} start={LEFT} end={RIGHT} style={[styles.barFill, { width: `${Math.max(6, prog * 100)}%` }]} />
          <Text style={styles.barValue} {...textScale.badge}>
            {fmt(Math.min(value, max))}/{fmt(max)}
          </Text>
        </View>
        {note ? <Text style={styles.barNote} numberOfLines={1} {...textScale.badge}>{note}</Text> : null}
      </View>
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
                <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>{title}</Text>
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

const shadowText = { textShadowColor: GH.inkShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 };

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  round: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.pill, borderWidth: 2, borderColor: GH.pillEdge },
  avatarWrap: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  avatarText: { ...type.label, fontFamily: fonts.bold, color: GH.white },
  backBadge: { position: "absolute", left: -6, bottom: -4, width: 18, height: 18, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.white },
  pills: { flex: 1, flexDirection: "row", gap: space.xs },
  pill: {
    flex: 1,
    minWidth: 0,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingRight: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: GH.pill,
    borderWidth: 2,
    borderColor: GH.pillEdge,
  },
  pillIcon: { marginLeft: -6, width: 30, alignItems: "center" },
  pillTexts: { flex: 1, minWidth: 0 },
  pillValue: { ...type.label, fontFamily: fonts.bold, color: GH.white, ...shadowText },
  pillHint: { ...type.nano, fontFamily: fonts.bold, color: GH.white, opacity: 0.85 },
  plus: { width: 22, height: 22, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: GH.white },

  side: { width: 70, alignItems: "center" },
  sideLip: { position: "absolute", top: 5, width: 58, height: 58, borderRadius: radius.pill, backgroundColor: GH.inkShadow },
  sideCircle: { width: 58, height: 58, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: GH.sideEdge, overflow: "hidden" },
  sideShine: { position: "absolute", top: 4, left: 10, right: 10, height: 16, borderRadius: radius.pill, backgroundColor: GH.playShine },
  sideBadge: { position: "absolute", top: -4, right: 2, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.badge, borderWidth: 2, borderColor: GH.white },
  sideBadgeText: { ...type.micro, fontFamily: fonts.bold, color: GH.white },
  sideDot: { position: "absolute", top: 0, right: 8, width: 16, height: 16, borderRadius: radius.pill, backgroundColor: GH.badge, borderWidth: 2, borderColor: GH.white },
  sideLabel: { ...type.micro, fontFamily: fonts.bold, color: GH.sideLabel, marginTop: space.xxs, ...shadowText },

  playWrap: { alignItems: "center", alignSelf: "center", width: "78%", maxWidth: 320 },
  diffTag: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.md, paddingVertical: space.xxs, borderRadius: radius.pill, marginBottom: -10, zIndex: 2, borderWidth: 2, borderColor: GH.white },
  diffText: { ...type.micro, fontFamily: fonts.bold, color: GH.white, letterSpacing: 1.2 },
  play: { alignSelf: "stretch", height: 80 },
  playLip: { position: "absolute", top: 8, left: 0, right: 0, height: 72, borderRadius: radius.xxl },
  playFill: { height: 72, borderRadius: radius.xxl, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: GH.playEdge, overflow: "hidden" },
  playShine: { position: "absolute", top: 5, left: 18, right: 18, height: 22, borderRadius: radius.pill, backgroundColor: GH.playShine },
  playTitle: { ...type.display, fontFamily: fonts.bold, color: GH.white, letterSpacing: 0.5, ...shadowText },
  playSub: { ...type.micro, fontFamily: fonts.bold, color: GH.white, opacity: 0.92, marginTop: -2 },

  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.xl, backgroundColor: GH.bar, borderWidth: 2, borderColor: GH.pillEdge },
  barIcon: { width: 44, alignItems: "center", marginTop: -10 },
  barBody: { flex: 1, gap: 3 },
  barTitle: { ...type.micro, fontFamily: fonts.bold, color: GH.white, letterSpacing: 0.8 },
  barTrack: { height: 20, borderRadius: radius.pill, backgroundColor: GH.barTrack, overflow: "hidden", justifyContent: "center" },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  barValue: { ...type.micro, fontFamily: fonts.bold, color: GH.white, textAlign: "center", ...shadowText },
  barNote: { ...type.nano, color: GH.white, opacity: 0.85 },

  crowns: { flexDirection: "row", gap: space.xs, justifyContent: "center" },
  crown: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.bar },
  crownOn: { borderWidth: 2, borderColor: GH.coin },

  dim: { flex: 1, backgroundColor: GH.dim, alignItems: "center", justifyContent: "center", paddingVertical: space.xl },
  card: { borderRadius: radius.xxl, overflow: "hidden", elevation: 12, shadowColor: GH.inkShadow, shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  cardBody: { paddingTop: space.xl, paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md },
  cardHead: { alignItems: "center", gap: space.xxs, paddingHorizontal: space.xl },
  cardTop: { ...type.micro, fontFamily: fonts.bold, color: GH.cardSoft, letterSpacing: 1.5 },
  cardTitle: { ...type.display, fontFamily: fonts.bold, color: GH.cardInk },
  cardFoot: { paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.xs, gap: space.sm },
  close: { position: "absolute", top: space.md, right: space.md, width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.panel },

  mrow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, borderRadius: radius.lg, backgroundColor: GH.panel },
  mrowIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.white },
  mrowTexts: { flex: 1, gap: 2 },
  mrowTitle: { ...type.label, fontFamily: fonts.bold, color: GH.cardInk },
  mrowSub: { ...type.caption, color: GH.cardSoft },
});
