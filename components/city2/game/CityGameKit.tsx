/**
 * KULÜP ŞEHRİ · OYUN KİTİ — tam ekran şehrin oyun-içi parçaları.
 *
 * Royal Match tarzı ev ekranının (components/gamehome/GameHomeKit) şehir ağzı:
 *   · GlossyButton  kalın alt dudaklı parlak düğme (yeşil/altın/mavi/…); bedel
 *                   (★ / EL) ve "yükleniyor" taşır.
 *   · CityRound     yuvarlak parlak yan düğme (rozet + kırmızı nokta + etiket).
 *   · Ribbon        kurdele başlık (katlı uçlar, SVG).
 *   · WoodFrame     ahşap çerçeve + krem parşömen iç kart, köşede altın perçin;
 *                   üstte kurdele, sağ üstte kırmızı kapat düğmesi.
 *   · GameBar       parlak ilerleme çubuğu (yazı içinde).
 *   · GameTabs      tahta sekme düğmeleri.
 *   · PaperRow      parşömen satırı (ikon kabarcığı + başlık/alt yazı + sağ öğe).
 *   · StarAmount / ElAmount  ★ ve EL tutarları.
 *
 * Renkler oyun dünyasınındır (iki temada aynı): lib/puzzle/cityGamePalette.ts.
 * Animasyonlar sonlu ve yerel sürücüde; "hareketi azalt"ta hiç oynamaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Touchable, useReduceMotion } from "@/components/ui";
import { fmtEl } from "@/lib/puzzle/city2";
import { CG, type CityBtnTone, type CitySideTone } from "@/lib/puzzle/cityGamePalette";
import { colors, fonts, radius, space, textScale, touchSlop, type } from "@/theme";

import { ElCoin } from "../ElCoin";

export const TOP = { x: 0.5, y: 0 } as const;
export const BOTTOM = { x: 0.5, y: 1 } as const;
const LEFT = { x: 0, y: 0.5 } as const;
const RIGHT = { x: 1, y: 0.5 } as const;
export const fmt = (n: number) => n.toLocaleString("tr-TR");
export const upper = (s: string) => s.toLocaleUpperCase("tr-TR");
type IconName = keyof typeof Ionicons.glyphMap;

const shadowText = { textShadowColor: CG.inkShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 };

/* ═══════════════════════ PARLAK DÜĞME ═══════════════════════ */

export const GlossyButton = React.memo(function GlossyButton({
  label,
  sub,
  icon,
  tone = "green",
  onPress,
  disabled,
  busy,
  small,
  stars,
  el,
  style,
  accessibilityLabel,
}: {
  label: string;
  sub?: string | null;
  icon?: IconName;
  tone?: CityBtnTone;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  /** Düğmenin sağında bedel: ★ ve/veya EL. */
  stars?: number | null;
  el?: number | null;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = CG.btn[disabled ? "grey" : tone];
  const h = small ? 40 : sub ? 58 : 52;
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled || busy}
      haptic="medium"
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy) }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.btn, { height: h + 5, opacity: disabled ? 0.85 : 1 }, style]}
    >
      <View style={[styles.btnLip, { height: h, backgroundColor: t.lip }]} />
      <LinearGradient colors={t.fill} start={TOP} end={BOTTOM} style={[styles.btnFill, { height: h }]}>
        <View style={styles.btnShine} />
        {busy ? (
          <ActivityIndicator size="small" color={t.ink} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={small ? 16 : 20} color={t.ink} /> : null}
            <View style={styles.btnTexts}>
              <Text style={[small ? styles.btnLabelSm : styles.btnLabel, { color: t.ink }, t.ink === CG.white ? shadowText : null]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
                {label}
              </Text>
              {sub ? (
                <Text style={[styles.btnSub, { color: t.ink }]} numberOfLines={1} {...textScale.badge}>
                  {sub}
                </Text>
              ) : null}
            </View>
            {stars != null || el != null ? (
              <View style={styles.btnCost}>
                {stars != null ? (
                  <View style={styles.btnCostItem}>
                    <Ionicons name="star" size={small ? 13 : 15} color={CG.star} />
                    <Text style={styles.btnCostText} {...textScale.badge}>{fmt(stars)}</Text>
                  </View>
                ) : null}
                {el != null ? (
                  <View style={styles.btnCostItem}>
                    <ElCoin size={small ? 14 : 16} />
                    <Text style={styles.btnCostText} {...textScale.badge}>{fmtEl(el)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </LinearGradient>
    </Touchable>
  );
});

/* ═══════════════════════ YUVARLAK YAN DÜĞME ═══════════════════════ */

export const CityRound = React.memo(function CityRound({
  icon,
  label,
  tone,
  onPress,
  badge,
  dot,
  size = 54,
}: {
  icon: IconName;
  label: string;
  tone: CitySideTone;
  onPress: () => void;
  badge?: string | number | null;
  dot?: boolean;
  size?: number;
}) {
  return (
    <Touchable onPress={onPress} haptic="selection" style={[styles.round, { width: size + 16 }]} accessibilityRole="button" accessibilityLabel={badge != null ? `${label}, ${badge}` : label}>
      <View style={[styles.roundLip, { width: size, height: size, top: 4 }]} />
      <LinearGradient colors={CG.side[tone]} start={TOP} end={BOTTOM} style={[styles.roundCircle, { width: size, height: size }]}>
        <View style={styles.roundShine} />
        <Ionicons name={icon} size={Math.round(size * 0.46)} color={CG.white} />
      </LinearGradient>
      {badge != null ? (
        <View style={styles.roundBadge}>
          <Text style={styles.roundBadgeText} {...textScale.badge}>{badge}</Text>
        </View>
      ) : dot ? (
        <View style={styles.roundDot} />
      ) : null}
      <Text style={styles.roundLabel} numberOfLines={1} {...textScale.badge}>{label}</Text>
    </Touchable>
  );
});

/* ═══════════════════════ KURDELE ═══════════════════════ */

export function Ribbon({ title, tone = "red", style }: { title: string; tone?: "red" | "league"; style?: StyleProp<ViewStyle> }) {
  const fill = tone === "league" ? CG.league : CG.ribbon;
  const fold = tone === "league" ? CG.leagueFold : CG.ribbonFold;
  return (
    <View style={[styles.ribbon, style]} accessibilityRole="header">
      <Svg width={22} height={34} viewBox="0 0 22 34" style={styles.ribbonTailL}>
        <Path d="M22 4 L0 4 L8 17 L0 30 L22 30 Z" fill={fold} />
      </Svg>
      <Svg width={22} height={34} viewBox="0 0 22 34" style={styles.ribbonTailR}>
        <Path d="M0 4 L22 4 L14 17 L22 30 L0 30 Z" fill={fold} />
      </Svg>
      <LinearGradient colors={fill} start={TOP} end={BOTTOM} style={styles.ribbonBody}>
        <View style={styles.ribbonShine} />
        <Text style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
          {upper(title)}
        </Text>
      </LinearGradient>
    </View>
  );
}

/* ═══════════════════════ AHŞAP ÇERÇEVE ═══════════════════════ */

export function CloseBubble({ onPress, label = "Kapat", style }: { onPress: () => void; label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Touchable onPress={onPress} hitSlop={touchSlop(38)} haptic="light" accessibilityRole="button" accessibilityLabel={label} style={[styles.close, style]}>
      <View style={styles.closeLip} />
      <LinearGradient colors={CG.btn.red.fill} start={TOP} end={BOTTOM} style={styles.closeFill}>
        <Ionicons name="close" size={22} color={CG.white} />
      </LinearGradient>
    </Touchable>
  );
}

function Rivet({ style }: { style: StyleProp<ViewStyle> }) {
  return <LinearGradient colors={CG.rivet} start={TOP} end={BOTTOM} style={[styles.rivet, style]} />;
}

/**
 * Ahşap çerçeveli parşömen pencere. `ribbon` verilirse üst kenarda kurdele;
 * `onClose` verilirse sağ üstte kırmızı kapat düğmesi. İçerik krem kartta.
 */
export function WoodFrame({
  ribbon,
  ribbonTone,
  onClose,
  surface = "paper",
  children,
  style,
  innerStyle,
}: {
  ribbon?: string | null;
  ribbonTone?: "red" | "league";
  onClose?: () => void;
  /** "page": temaya uyan iç sayfa (uygulama bileşenleri için). */
  surface?: "paper" | "page";
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.frameWrap, ribbon ? styles.frameWithRibbon : null, style]}>
      <View style={styles.frameLip} />
      <LinearGradient colors={CG.wood} start={TOP} end={BOTTOM} style={styles.frame}>
        {surface === "page" ? (
          <View style={[styles.paper, styles.page, innerStyle]}>{children}</View>
        ) : (
          <LinearGradient colors={CG.paper} start={TOP} end={BOTTOM} style={[styles.paper, innerStyle]}>
            {children}
          </LinearGradient>
        )}
        <Rivet style={styles.rivetTL} />
        <Rivet style={styles.rivetTR} />
        <Rivet style={styles.rivetBL} />
        <Rivet style={styles.rivetBR} />
      </LinearGradient>
      {ribbon ? <Ribbon title={ribbon} tone={ribbonTone} style={styles.frameRibbon} /> : null}
      {onClose ? <CloseBubble onPress={onClose} style={styles.frameClose} /> : null}
    </View>
  );
}

/* ═══════════════════════ ÇUBUK, SEKME, SATIR ═══════════════════════ */

export function GameBar({ value, tone = "green", label, height = 18, style }: { value: number; tone?: "green" | "gold" | "el" | "warn"; label?: string | null; height?: number; style?: StyleProp<ViewStyle> }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const fill = tone === "gold" ? CG.barGold : tone === "el" ? CG.barEl : tone === "warn" ? CG.barWarn : CG.barGreen;
  return (
    <View style={[styles.bar, { height }, style]}>
      {v > 0 ? <LinearGradient colors={fill} start={LEFT} end={RIGHT} style={[styles.barFill, { width: `${Math.max(6, Math.round(v * 100))}%` as const }]} /> : null}
      {label ? (
        <Text style={styles.barText} numberOfLines={1} {...textScale.badge}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export interface GameTab<K extends string> {
  key: K;
  label: string;
  icon: IconName;
  dot?: boolean;
}

export function GameTabs<K extends string>({ items, value, onChange }: { items: GameTab<K>[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {items.map((t) => {
        const on = t.key === value;
        return (
          <Touchable
            key={t.key}
            onPress={() => onChange(t.key)}
            haptic="selection"
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            style={[styles.tab, on ? styles.tabOn : null]}
          >
            {on ? <LinearGradient colors={CG.btn.gold.fill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} /> : null}
            <Ionicons name={t.icon} size={15} color={on ? CG.btn.gold.ink : CG.inkSoft} />
            <Text style={[styles.tabText, on ? styles.tabTextOn : null]} numberOfLines={1} {...textScale.badge}>
              {t.label}
            </Text>
            {t.dot ? <View style={styles.tabDot} /> : null}
          </Touchable>
        );
      })}
    </View>
  );
}

export function PaperRow({
  icon,
  tint,
  title,
  sub,
  right,
  done,
  children,
}: {
  icon: IconName;
  tint: string;
  title: string;
  sub?: string | null;
  right?: React.ReactNode;
  /** Tamamlanmış satır (yeşil zemin). */
  done?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.row, done ? styles.rowDone : null]}>
      <View style={styles.rowTop}>
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={20} color={tint} />
        </View>
        <View style={styles.rowTexts}>
          <Text style={styles.rowTitle} numberOfLines={2} {...textScale.dense}>
            {title}
          </Text>
          {sub ? (
            <Text style={styles.rowSub} numberOfLines={3} {...textScale.long}>
              {sub}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function StarAmount({ value, muted, size = 14 }: { value: number; muted?: boolean; size?: number }) {
  return (
    <View style={styles.amount}>
      <Ionicons name="star" size={size} color={muted ? CG.lock : CG.star} />
      <Text style={[styles.amountText, muted ? styles.amountMuted : null]} {...textScale.badge}>
        {fmt(value)}
      </Text>
    </View>
  );
}

export function ElAmount({ value, muted, size = 16 }: { value: number; muted?: boolean; size?: number }) {
  return (
    <View style={styles.amount}>
      <ElCoin size={size} />
      <Text style={[styles.amountText, muted ? styles.amountMuted : null]} {...textScale.badge}>
        {fmtEl(value)}
      </Text>
    </View>
  );
}

/** Parşömen üstü küçük başlık ("ARA ADIMLAR · 2/4"). */
export function PaperHead({ title, meta }: { title: string; meta?: string | null }) {
  return (
    <View style={styles.head}>
      <Text style={styles.headTitle} numberOfLines={1} {...textScale.badge}>
        {upper(title)}
      </Text>
      {meta ? (
        <Text style={styles.headMeta} numberOfLines={1} {...textScale.badge}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

/** Parşömen üstü düz metin. */
export function PaperText({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <Text style={[styles.text, center ? styles.textCenter : null]} {...textScale.long}>
      {children}
    </Text>
  );
}

/**
 * "YÜKSELDİ!" kutlama kurdelesi: `burst` her değiştiğinde panelin üstünde
 * zıplayarak belirir ve söner (sahne aynı anda inşaat/kıvılcım oynatır).
 */
export function CelebrateBurst({ burst, text }: { burst: number; text: string | null }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!burst || !text) return;
    v.setValue(0);
    if (reduce) {
      Animated.sequence([Animated.timing(v, { toValue: 1, duration: 1, useNativeDriver: true }), Animated.delay(1400), Animated.timing(v, { toValue: 0, duration: 1, useNativeDriver: true })]).start();
      return;
    }
    Animated.sequence([Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }), Animated.delay(1100), Animated.timing(v, { toValue: 0, duration: 260, useNativeDriver: true })]).start();
  }, [burst, reduce, text, v]);
  if (!text) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.burst, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}
    >
      <LinearGradient colors={CG.btn.gold.fill} start={TOP} end={BOTTOM} style={styles.burstFill}>
        <Ionicons name="sparkles" size={18} color={CG.btn.gold.ink} />
        <Text style={styles.burstText} numberOfLines={1} {...textScale.badge}>
          {text}
        </Text>
        <Ionicons name="sparkles" size={18} color={CG.btn.gold.ink} />
      </LinearGradient>
    </Animated.View>
  );
}

/* ═══════════════════════ STİLLER ═══════════════════════ */

const styles = StyleSheet.create({
  btn: { alignSelf: "stretch" },
  btnLip: { position: "absolute", top: 5, left: 0, right: 0, borderRadius: radius.xl },
  btnFill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, paddingHorizontal: space.md, borderRadius: radius.xl, borderWidth: 3, borderColor: CG.btnEdge, overflow: "hidden" },
  btnShine: { position: "absolute", top: 4, left: 14, right: 14, height: 14, borderRadius: radius.pill, backgroundColor: CG.shine },
  btnTexts: { flexShrink: 1, alignItems: "center" },
  btnLabel: { ...type.h3, fontFamily: fonts.bold, letterSpacing: 0.6 },
  btnLabelSm: { ...type.label, fontFamily: fonts.bold, letterSpacing: 0.4 },
  btnSub: { ...type.micro, fontFamily: fonts.bold, opacity: 0.9 },
  btnCost: { flexDirection: "row", alignItems: "center", gap: space.xs, marginLeft: space.xs, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: CG.inkShadow },
  btnCostItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  btnCostText: { ...type.labelSm, fontFamily: fonts.bold, color: CG.white },

  round: { alignItems: "center" },
  roundLip: { position: "absolute", borderRadius: radius.pill, backgroundColor: CG.inkShadow },
  roundCircle: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: CG.sideEdge, overflow: "hidden" },
  roundShine: { position: "absolute", top: 4, left: 10, right: 10, height: 14, borderRadius: radius.pill, backgroundColor: CG.shine },
  roundBadge: { position: "absolute", top: -4, right: 2, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: CG.badge, borderWidth: 2, borderColor: CG.white },
  roundBadgeText: { ...type.micro, fontFamily: fonts.bold, color: CG.white },
  roundDot: { position: "absolute", top: 0, right: 8, width: 16, height: 16, borderRadius: radius.pill, backgroundColor: CG.badge, borderWidth: 2, borderColor: CG.white },
  roundLabel: { ...type.micro, fontFamily: fonts.bold, color: CG.white, marginTop: space.xxs, ...shadowText },

  ribbon: { height: 38, alignSelf: "center", minWidth: 180, maxWidth: "86%", justifyContent: "center" },
  ribbonTailL: { position: "absolute", left: -16, top: 6 },
  ribbonTailR: { position: "absolute", right: -16, top: 6 },
  ribbonBody: { height: 38, borderRadius: radius.sm, paddingHorizontal: space.xl, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: CG.white, overflow: "hidden" },
  ribbonShine: { position: "absolute", top: 3, left: 8, right: 8, height: 10, borderRadius: radius.pill, backgroundColor: CG.shine },
  ribbonText: { ...type.h2, fontFamily: fonts.bold, color: CG.ribbonInk, letterSpacing: 1, ...shadowText },

  close: { width: 40, height: 44 },
  closeLip: { position: "absolute", top: 4, left: 0, width: 40, height: 40, borderRadius: radius.pill, backgroundColor: CG.btn.red.lip },
  closeFill: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: CG.white },

  frameWrap: { alignSelf: "stretch", flexShrink: 1 },
  frameWithRibbon: { paddingTop: 18 },
  frameLip: { position: "absolute", left: 0, right: 0, bottom: -5, top: 23, borderRadius: radius.xxl, backgroundColor: CG.woodLip },
  frame: { flexShrink: 1, padding: 7, borderRadius: radius.xxl, borderWidth: 2, borderColor: CG.woodEdge },
  paper: { flexShrink: 1, borderRadius: radius.xl, borderWidth: 2, borderColor: CG.paperEdge, overflow: "hidden" },
  page: { backgroundColor: colors.bg, borderColor: CG.woodLip },
  frameRibbon: { position: "absolute", top: 0, alignSelf: "center" },
  frameClose: { position: "absolute", top: 4, right: -4 },
  rivet: { position: "absolute", width: 10, height: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: CG.woodLip },
  rivetTL: { top: 3, left: 3 },
  rivetTR: { top: 3, right: 3 },
  rivetBL: { bottom: 3, left: 3 },
  rivetBR: { bottom: 3, right: 3 },

  bar: { alignSelf: "stretch", borderRadius: radius.pill, backgroundColor: CG.track, overflow: "hidden", justifyContent: "center" },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  barText: { ...type.micro, fontFamily: fonts.bold, color: CG.white, textAlign: "center", ...shadowText },

  tabs: { flexDirection: "row", gap: space.xs, padding: 3, borderRadius: radius.lg, backgroundColor: CG.paperDeep },
  tab: { flex: 1, height: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: radius.md, overflow: "hidden" },
  tabOn: { borderWidth: 2, borderColor: CG.white },
  tabText: { ...type.labelXs, fontFamily: fonts.bold, color: CG.inkSoft },
  tabTextOn: { color: CG.btn.gold.ink },
  tabDot: { position: "absolute", top: 4, right: 6, width: 9, height: 9, borderRadius: radius.pill, backgroundColor: CG.badge },

  row: { gap: space.sm, padding: space.sm, borderRadius: radius.lg, backgroundColor: CG.paperRow },
  rowDone: { backgroundColor: CG.paperRowOn },
  rowTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowIcon: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: CG.white, borderWidth: 2, borderColor: CG.paperEdge },
  rowTexts: { flex: 1, gap: 1 },
  rowTitle: { ...type.label, fontFamily: fonts.bold, color: CG.ink },
  rowSub: { ...type.caption, color: CG.inkSoft },

  amount: { flexDirection: "row", alignItems: "center", gap: 3 },
  amountText: { ...type.labelSm, fontFamily: fonts.bold, color: CG.ink },
  amountMuted: { color: CG.lock },

  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  headTitle: { ...type.micro, fontFamily: fonts.bold, color: CG.inkSoft, letterSpacing: 1.1, flexShrink: 1 },
  headMeta: { ...type.micro, fontFamily: fonts.bold, color: CG.inkSoft },
  text: { ...type.bodySm, color: CG.inkSoft },
  textCenter: { textAlign: "center" },

  burst: { position: "absolute", top: -26, alignSelf: "center", zIndex: 5 },
  burstFill: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.lg, height: 40, borderRadius: radius.pill, borderWidth: 3, borderColor: CG.white },
  burstText: { ...type.h3, fontFamily: fonts.bold, color: CG.btn.gold.ink, letterSpacing: 0.8 },
});
