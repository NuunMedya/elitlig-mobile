/**
 * OYUN ANA SAYFASI PARÇALARI — ev ekranının yapı taşları (sözleşme §6).
 * Renkler `lib/game/gameHomePalette.ts`, ikon sanatı `./GameArt`.
 *
 *   · HomeTopBar   geri · CAN (kırmızı, sayaç) · JETON (altın, +) · YILDIZ
 *                  (sarı-turuncu) · ayarlar — her kapsül kendi renk ailesinde
 *   · EventStrip   yıldız sandığı ilerlemesi (sandık çizimi + çizgili dolgu)
 *   · RailButton   yan raf düğmesi (ödüller mor/pembe, araçlar mavi/camgöbeği)
 *   · PlayButton   TEK ODAK: parlak yeşil "Bölüm N" + zorluk etiketi
 *   · ChestIcon    sandık (eski imza; ChestArt'a gider)
 *   · StreakCrowns seri basamakları (3 kupa)
 *   · HomeModal    oyun penceresi: renkli başlık bandı + beyaz gövde
 *
 * 2026-11 v3: v2'nin düz koyu hapları birbirine ve haritaya karışıyordu.
 * Şimdi katmanlı yüzeyler (koyu kontur · gradyan · iç ışık · alt dudak) ve
 * öğe türü başına ayrı renk ailesi. KIRPILMA KURALI sürer: rozetler
 * ebeveynin İÇİNDE (negatif konum yok); sayılar `adjustsFontSizeToFit`e
 * güvenmez (web onu yok sayar), kısaltılır ve kapsül içeriğe göre genişler.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";

import { Touchable, useReduceMotion } from "@/components/ui";
import { GH } from "@/lib/game/gameHomePalette";
import { fonts, radius, space, textScale, touchSlop, type } from "@/theme";

import { BackArt, BoltArt, ChestArt, CoinArt, GearArt, GiftArt, GridArt, HeartArt, PenaltyArt, PlusArt, PodiumArt, StarArt, TrophyArt, WheelArt } from "./GameArt";
import { Bob, Shimmer } from "./GameMotion";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

/** Sayı kısaltma: 10.000 ve üstü "12,5B" (dar telefonda kapsül kesilmesin). */
export const fmtShort = (n: number) => {
  if (n < 10_000) return n.toLocaleString("tr-TR");
  if (n < 100_000) return `${(Math.floor(n / 100) / 10).toLocaleString("tr-TR")}B`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}B`;
  return `${(Math.floor(n / 100_000) / 10).toLocaleString("tr-TR")}M`;
};

/* ═══════════════════════ ÜST ŞERİT ═══════════════════════ */

export interface TopBarLives {
  lives: number;
  max: number;
  label: string | null;
}

/** Katmanlı yuvarlak araç düğmesi (geri, ayarlar). */
function RoundButton({ onPress, label, children, size }: { onPress: () => void; label: string; children: React.ReactNode; size: number }) {
  return (
    <Touchable onPress={onPress} hitSlop={touchSlop(size)} accessibilityRole="button" accessibilityLabel={label} haptic="light" feedback="icon" style={[styles.round, { width: size, height: size }]}>
      <LinearGradient colors={GH.roundBtn} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.roundFill]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.roundRim]} />
      {children}
    </Touchable>
  );
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
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const btn = narrow ? 34 : 40;
  const full = lives ? lives.lives >= lives.max : true;
  const timer = lives && !full && lives.label && lives.label !== "Dolu" ? lives.label : null;
  return (
    <View style={[styles.topRow, narrow && styles.topRowNarrow]}>
      <RoundButton onPress={onBack} label="Geri" size={btn}>
        <BackArt size={narrow ? 18 : 22} />
      </RoundButton>
      <View style={[styles.caps, narrow && styles.capsNarrow]}>
        {lives ? (
          <Capsule grow={!(full && narrow)} tint={GH.hudTint.lives} onPress={onLives} label={`Can ${lives.lives}/${lives.max}${timer ? `, sıradaki ${timer}` : ""}`} plus={!full && !narrow}>
            <View style={styles.heartBox}>
              <HeartArt size={30} empty={lives.lives < 1} />
              <Text style={styles.heartNum} {...textScale.badge}>{lives.lives}</Text>
            </View>
            {/* Dar ekranda dolu can yalnız kalple (sayı kalbin içinde); sayaç her zaman görünür. */}
            {full && narrow ? null : (
              <Text style={[styles.capValue, styles.capTimer]} numberOfLines={1} {...textScale.badge}>
                {full ? "DOLU" : timer ?? `${lives.lives}/${lives.max}`}
              </Text>
            )}
          </Capsule>
        ) : null}
        <Capsule tint={GH.hudTint.coins} onPress={onCoins} label={`Jeton ${coins ?? 0}`} plus={!narrow && Boolean(onCoins)}>
          <CoinArt size={narrow ? 24 : 28} />
          <Text style={styles.capValue} numberOfLines={1} {...textScale.badge}>
            {coins != null ? fmtShort(coins) : "–"}
          </Text>
        </Capsule>
        <Capsule tint={GH.hudTint.stars} onPress={onStars} label={`Yıldız ${stars ?? 0}`}>
          <StarArt size={narrow ? 24 : 28} />
          <Text style={styles.capValue} numberOfLines={1} {...textScale.badge}>
            {stars != null ? fmtShort(stars) : "–"}
          </Text>
        </Capsule>
      </View>
      <RoundButton onPress={onSettings} label="Ayarlar" size={btn}>
        <GearArt size={narrow ? 20 : 24} />
      </RoundButton>
    </View>
  );
});

function Capsule({ tint, onPress, label, plus, grow = true, children }: { tint: string; onPress?: () => void; label: string; plus?: boolean; grow?: boolean; children: React.ReactNode }) {
  return (
    <Touchable onPress={onPress} disabled={!onPress} haptic="selection" feedback="chip" style={[styles.cap, !grow && styles.capTight, { borderColor: GH.hudCapEdge }]} accessibilityRole="button" accessibilityLabel={label}>
      <LinearGradient colors={GH.hudCap} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.capFill]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.capTint, { borderColor: tint }]} />
      {children}
      {plus ? (
        <View style={styles.capPlus}>
          <PlusArt size={20} />
        </View>
      ) : null}
    </Touchable>
  );
}

/* ═══════════════════════ ETKİNLİK ŞERİDİ ═══════════════════════ */

/** Yıldız sandığı ilerlemesi: sandık çizimi · başlık · çizgili altın dolgu · "16/40". */
export const EventStrip = React.memo(function EventStrip({
  title,
  value,
  max,
  onPress,
  sub,
  ready,
}: {
  title: string;
  value: number;
  max: number;
  onPress?: () => void;
  /** Başlığın yanında küçük açıklama (ör. "150 jeton + 2 güçlendirici"). */
  sub?: string | null;
  /** Açılmayı bekleyen sandık: ışıltı. */
  ready?: boolean;
}) {
  const prog = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return (
    <Touchable onPress={onPress} disabled={!onPress} haptic="selection" feedback="card" style={styles.strip} accessibilityRole={onPress ? "button" : "text"} accessibilityLabel={`${title}: ${value}/${max}`}>
      <LinearGradient colors={GH.hudCap} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.stripFillBg]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.capTint, styles.stripTint]} />
      <Bob active={Boolean(ready)} amount={2}>
        <ChestArt size={40} glow={ready} />
      </Bob>
      <View style={styles.stripBody}>
        <View style={styles.stripHead}>
          <Text style={styles.stripTitle} numberOfLines={1} {...textScale.badge}>{title}</Text>
          {sub ? (
            <Text style={styles.stripSub} numberOfLines={1} {...textScale.badge}>{sub}</Text>
          ) : null}
        </View>
        <View style={styles.stripTrack}>
          <View style={[styles.stripBar, { width: `${Math.max(prog * 100, prog > 0 ? 8 : 0)}%` }]}>
            <LinearGradient colors={GH.stripFill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
            <View style={styles.stripGloss} />
          </View>
          <Text style={styles.stripValue} numberOfLines={1} {...textScale.badge}>
            {fmtShort(Math.min(value, max))}/{fmtShort(max)}
          </Text>
        </View>
      </View>
      <Shimmer active={Boolean(ready)} width={320} rounded={radius.lg} />
    </Touchable>
  );
});

/** Eski ad (v2): ince ilerleme satırı → EventStrip. */
export const ChestBar = EventStrip;

/* ═══════════════════════ YAN RAF DÜĞMESİ ═══════════════════════ */

export type RailKind = "gift" | "wheel" | "chest" | "penalty" | "board" | "shop" | "more";

const RAIL_ART: Record<RailKind, (size: number) => React.ReactNode> = {
  gift: (s) => <GiftArt size={s} />,
  wheel: (s) => <WheelArt size={s} />,
  chest: (s) => <ChestArt size={s} />,
  penalty: (s) => <PenaltyArt size={s} />,
  board: (s) => <PodiumArt size={s} />,
  shop: (s) => <BoltArt size={s} />,
  more: (s) => <GridArt size={s} />,
};

const COOL: RailKind[] = ["board", "shop", "more"];

export interface RailItem {
  key: string;
  kind: RailKind;
  label: string;
  onPress: () => void;
  /** Rozet: sayı ya da nokta — YALNIZ alınabilir bir şey varken. */
  badge?: number | boolean;
}

export const RailButton = React.memo(function RailButton({ item, size = 54, delay = 0 }: { item: RailItem; size?: number; delay?: number }) {
  const ready = Boolean(item.badge);
  const cool = COOL.includes(item.kind);
  const box = size + 8;
  return (
    <Touchable
      onPress={item.onPress}
      haptic="selection"
      feedback="icon"
      style={[styles.rail, { width: box + 12 }]}
      accessibilityRole="button"
      accessibilityLabel={ready ? `${item.label}, alınacak ödül var` : item.label}
    >
      <Bob active={ready} delay={delay}>
        <View style={{ width: box, height: box, paddingTop: 6, paddingRight: 6 }}>
          <View style={[styles.railTile, { width: size, height: size, borderColor: cool ? GH.railEdgeCool : GH.railEdge }]}>
            <LinearGradient colors={GH.rail[item.kind]} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.railFill]} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.railRim]} />
            <View pointerEvents="none" style={styles.railGloss} />
            {RAIL_ART[item.kind](Math.round(size * 0.68))}
            <Shimmer active={ready && !cool} width={size} rounded={radius.lg - 2} />
          </View>
          {ready ? (
            <View style={styles.badge}>
              <LinearGradient colors={GH.badge} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.badgeFill]} />
              {typeof item.badge === "number" ? (
                <Text style={styles.badgeText} {...textScale.badge}>{item.badge}</Text>
              ) : (
                <Text style={styles.badgeText} {...textScale.badge}>!</Text>
              )}
            </View>
          ) : null}
        </View>
      </Bob>
      <View style={styles.railLabel}>
        <Text style={styles.railText} numberOfLines={1} {...textScale.badge}>{item.label}</Text>
      </View>
    </Touchable>
  );
});

/** Raf düğmesinin toplam yüksekliği (yerleşim hesabı için). */
export const railHeight = (size: number) => size + 8 + 18;

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
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const tag = difficulty === "super" ? "SÜPER ZOR" : difficulty === "hard" ? "ZOR" : null;
  const H = narrow ? 60 : 66;
  const tagFill = difficulty === "super" ? GH.tagSuper : GH.tagHard;
  return (
    <View style={styles.playWrap}>
      <Touchable
        onPress={onPress}
        disabled={disabled || busy}
        haptic="medium"
        feedback="button"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy) }}
        style={[styles.play, { height: H + 6, opacity: disabled ? 0.6 : 1 }]}
      >
        <View style={[styles.playLip, { height: H + 6 }]} />
        <View style={[styles.playBody, { height: H }]}>
          <LinearGradient colors={GH.play} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.playFill]} />
          <LinearGradient colors={[GH.playGloss, GH.playGlossClear]} start={TOP} end={BOTTOM} style={styles.playGloss} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.playRim]} />
          <View style={styles.playTexts}>
            <Text style={[styles.playTitle, narrow && styles.playTitleNarrow]} numberOfLines={1} {...textScale.badge}>
              {busy ? "Hazırlanıyor…" : title}
            </Text>
            {sub && !busy ? (
              <Text style={styles.playSub} numberOfLines={1} {...textScale.badge}>{sub}</Text>
            ) : null}
          </View>
          <View style={styles.playIcon}>
            <Ionicons name="play" size={narrow ? 20 : 24} color={GH.playLip} />
          </View>
          <Shimmer active={!disabled && !busy} width={width} rounded={radius.xl} />
        </View>
      </Touchable>
      {tag && !busy ? (
        <View style={[styles.tag, { borderColor: difficulty === "super" ? GH.tagSuperEdge : GH.tagEdge }]} pointerEvents="none">
          <LinearGradient colors={tagFill} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.tagFill]} />
          <Ionicons name={difficulty === "super" ? "skull" : "flame"} size={12} color={GH.white} />
          <Text style={styles.tagText} {...textScale.badge}>{tag}</Text>
        </View>
      ) : null}
    </View>
  );
});

/* ═══════════════════════ SANDIK (eski imza) ═══════════════════════ */

export const ChestIcon = React.memo(function ChestIcon({ size = 40, open = false }: { size?: number; open?: boolean; tint?: string }) {
  return <ChestArt size={size} open={open} glow={open} />;
});

/* ═══════════════════════ SERİ KUPALARI ═══════════════════════ */

export const StreakCrowns = React.memo(function StreakCrowns({ tier, size = 26 }: { tier: number; size?: number }) {
  return (
    <View style={styles.crowns} accessibilityLabel={`Seri basamağı ${tier}/3`}>
      {[1, 2, 3].map((n) => (
        <View key={n} style={[styles.crown, { width: size + 14, height: size + 14 }, n <= tier ? styles.crownOn : null]}>
          <TrophyArt size={size} dim={n > tier} />
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
  tone = GH.modalHead,
  art,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  top?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Başlık bandının rengi (ödül pencereleri kendi renginde). */
  tone?: readonly [string, string];
  /** Bandın altında, ortada büyük çizim (sandık, çark …). */
  art?: React.ReactNode;
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
          <View style={[styles.card, { maxHeight: height - 64 }]}>
            <LinearGradient colors={GH.modalBody} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
            <View style={styles.cardBand} accessibilityRole="header">
              <LinearGradient colors={tone} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
              <View style={styles.cardBandGloss} />
              {top ? <Text style={styles.cardTop} numberOfLines={1} {...textScale.badge}>{top}</Text> : null}
              <Text style={styles.cardTitle} numberOfLines={2} {...textScale.badge}>{title}</Text>
            </View>
            <ScrollView contentContainerStyle={styles.cardBody} bounces={false} showsVerticalScrollIndicator={false}>
              {art ? <View style={styles.cardArt}>{art}</View> : null}
              {children}
            </ScrollView>
            {footer ? <View style={styles.cardFoot}>{footer}</View> : null}
          </View>
          <Touchable onPress={onClose} hitSlop={touchSlop(34)} accessibilityRole="button" accessibilityLabel="Kapat" style={styles.close} haptic="light">
            <Ionicons name="close" size={20} color={GH.white} />
          </Touchable>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Pencere içi satır: ikon kabarcığı + başlık/alt yazı + sağda öğe. */
export function ModalRow({ icon, tint, title, sub, right, art }: { icon: keyof typeof Ionicons.glyphMap; tint: string; title: string; sub?: string | null; right?: React.ReactNode; art?: React.ReactNode }) {
  return (
    <View style={styles.mrow}>
      <View style={styles.mrowIcon}>{art ?? <Ionicons name={icon} size={22} color={tint} />}</View>
      <View style={styles.mrowTexts}>
        <Text style={styles.mrowTitle} {...textScale.dense}>{title}</Text>
        {sub ? <Text style={styles.mrowSub} {...textScale.dense}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/* ═══════════════════════ STİLLER ═══════════════════════ */

const shadowText = { textShadowColor: GH.textShadow, textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 2 } as const;

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  topRowNarrow: { gap: space.xs },
  round: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: GH.roundBtnEdge, overflow: "hidden" },
  roundFill: { borderRadius: radius.pill },
  roundRim: { borderRadius: radius.pill, borderWidth: 1.5, borderColor: GH.hudCapRim, margin: 1 },
  caps: { flex: 1, minWidth: 0, flexDirection: "row", gap: space.s },
  capsNarrow: { gap: space.xs },
  cap: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    paddingLeft: 3,
    paddingRight: space.s,
    borderRadius: radius.pill,
    borderWidth: 2,
    overflow: "hidden",
  },
  capTight: { flexGrow: 0, flexShrink: 0, paddingRight: 3 },
  capFill: { borderRadius: radius.pill },
  capTint: { borderRadius: radius.pill, borderWidth: 1.5, margin: 0.5, opacity: 0.9 },
  capValue: { ...type.scoreXs, color: GH.white, flexShrink: 0, ...shadowText },
  capTimer: { ...type.numSmStrong, flexShrink: 1 },
  capPlus: { marginLeft: "auto", paddingLeft: space.xxs },
  heartBox: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  heartNum: { position: "absolute", top: 5, left: 0, right: 0, textAlign: "center", ...type.numSmStrong, color: GH.white, ...shadowText },

  strip: { flexDirection: "row", alignItems: "center", gap: space.sm, height: 52, paddingLeft: space.xs, paddingRight: space.md, borderRadius: radius.lg, borderWidth: 2, borderColor: GH.hudCapEdge, overflow: "hidden" },
  stripFillBg: { borderRadius: radius.lg },
  stripTint: { borderRadius: radius.lg, borderColor: GH.hudTint.coins, opacity: 0.55 },
  stripBody: { flex: 1, minWidth: 0, gap: 3 },
  stripHead: { flexDirection: "row", alignItems: "baseline", gap: space.s },
  stripTitle: { ...type.labelSm, fontFamily: fonts.bold, color: GH.white, letterSpacing: 0.3, flexShrink: 0, ...shadowText },
  stripSub: { ...type.meta, color: GH.hudSoft, flexShrink: 1 },
  stripTrack: { height: 16, borderRadius: radius.pill, backgroundColor: GH.stripTrack, borderWidth: 1.5, borderColor: GH.hudCapEdge, overflow: "hidden", justifyContent: "center" },
  stripBar: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radius.pill, overflow: "hidden" },
  stripGloss: { position: "absolute", left: 3, right: 3, top: 2, height: 4, borderRadius: radius.pill, backgroundColor: GH.stripStripe },
  stripValue: { ...type.nano, textAlign: "center", color: GH.white, ...shadowText },

  rail: { alignItems: "center" },
  railTile: { borderRadius: radius.lg, borderWidth: 2.5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  railFill: { borderRadius: radius.lg - 2 },
  railRim: { borderRadius: radius.lg - 3, borderWidth: 2, borderColor: GH.railRim, margin: 1.5, opacity: 0.6 },
  railGloss: { position: "absolute", left: 4, right: 4, top: 3, height: "36%", borderRadius: radius.md, backgroundColor: GH.shineTop },
  railLabel: { marginTop: -4, paddingHorizontal: space.s, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: GH.railLabelBg, maxWidth: "100%" },
  railText: { ...type.nano, fontFamily: fonts.bold, color: GH.white, letterSpacing: 0.2 },
  badge: { position: "absolute", top: 0, right: 0, minWidth: 22, height: 22, borderRadius: radius.pill, borderWidth: 2, borderColor: GH.badgeEdge, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, overflow: "hidden" },
  badgeFill: { borderRadius: radius.pill },
  badgeText: { ...type.nano, color: GH.white },

  playWrap: { alignSelf: "stretch", paddingTop: 10 },
  play: { alignSelf: "stretch" },
  playLip: { position: "absolute", left: 0, right: 0, top: 0, borderRadius: radius.xl + 2, backgroundColor: GH.playLip, borderWidth: 3, borderColor: GH.playEdge },
  playBody: { borderRadius: radius.xl + 2, borderWidth: 3, borderColor: GH.playEdge, overflow: "hidden", flexDirection: "row", alignItems: "center", paddingLeft: space.xl, paddingRight: space.sm },
  playFill: { borderRadius: radius.xl },
  playGloss: { position: "absolute", left: 6, right: 6, top: 3, height: "45%", borderRadius: radius.lg },
  playRim: { borderRadius: radius.xl, borderWidth: 1.5, borderColor: GH.playGloss, margin: 1 },
  playTexts: { flex: 1, minWidth: 0, alignItems: "center", paddingLeft: space.xxxl },
  playTitle: { ...type.display, fontFamily: fonts.bold, color: GH.playInk, letterSpacing: 0.3, textShadowColor: GH.playEdge, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1 },
  playTitleNarrow: { ...type.h1, fontFamily: fonts.bold },
  playSub: { ...type.labelXs, fontFamily: fonts.bold, color: GH.white, opacity: 0.95, textShadowColor: GH.playEdge, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  playIcon: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.white, borderWidth: 2.5, borderColor: GH.playEdge },
  tag: { position: "absolute", top: 0, left: space.lg, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: space.sm, height: 22, borderRadius: radius.pill, borderWidth: 2, overflow: "hidden" },
  tagFill: { borderRadius: radius.pill },
  tagText: { ...type.nano, fontFamily: fonts.bold, color: GH.white, letterSpacing: 0.6 },

  crowns: { flexDirection: "row", gap: space.xs, justifyContent: "center" },
  crown: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.panel },
  crownOn: { borderWidth: 2, borderColor: GH.coin, backgroundColor: GH.cardInk },

  dim: { flex: 1, backgroundColor: GH.dim, alignItems: "center", justifyContent: "center", paddingVertical: space.xl },
  card: { borderRadius: radius.xxl, overflow: "hidden", borderWidth: 3, borderColor: GH.hudCapEdge, elevation: 8, shadowColor: GH.inkShadow, shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  cardBand: { paddingTop: space.lg, paddingBottom: space.md, paddingHorizontal: space.huge + space.sm, alignItems: "center", gap: 2, overflow: "hidden" },
  cardBandGloss: { position: "absolute", left: 0, right: 0, top: 0, height: "45%", backgroundColor: GH.shineTop },
  cardTop: { ...type.overline, fontFamily: fonts.bold, color: GH.modalHeadInk, opacity: 0.85 },
  cardTitle: { ...type.h1, fontFamily: fonts.bold, color: GH.modalHeadInk, textAlign: "center", ...shadowText },
  cardArt: { alignItems: "center", marginTop: -space.xs },
  cardBody: { paddingTop: space.lg, paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md },
  cardFoot: { paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.xs, gap: space.sm },
  close: { position: "absolute", top: space.m, right: space.m, width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.closeBg, borderWidth: 2, borderColor: GH.closeEdge },

  mrow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, borderRadius: radius.lg, backgroundColor: GH.panel },
  mrowIcon: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: GH.white },
  mrowTexts: { flex: 1, gap: 2 },
  mrowTitle: { ...type.label, fontFamily: fonts.bold, color: GH.cardInk },
  mrowSub: { ...type.caption, color: GH.cardSoft },
});
