/**
 * Seviye pencereleri — Başlangıç ve Sonuç, oyunun İÇİNDE gibi.
 *
 * Uygulama alt sayfası değil, oyun kartı: karartılmış sahnenin ortasında
 * zıplayarak açılan kalın beyaz çerçeveli kart, tepesinde oyunun renginde
 * kurdele ("SEVİYE 12"), büyük renkli hedef baloncukları, şeker gibi yuvarlak
 * güçlendirici düğmeleri (stok rozeti, seçilince yeşil tik ve parlama), oyunun
 * kendi 5 canı ve alt dudaklı 3B "OYNA" düğmesi.
 *
 * SONUÇ: kazanınca ışık hüzmeleri önünde yıldızların tek tek düşmesi (sonlu
 * yay animasyonu), jeton / XP / yıldız ödül hapları; kaybedince kırık kalp ve
 * "Tekrar dene".
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { SparkleBurst, Sunburst } from "@/components/game/Celebration";
import { Touchable, useReduceMotion } from "@/components/ui";
import type { PuzzleProfile } from "@/lib/puzzle/api";
import { STAGE_COMMON as S, STAGE_THEMES } from "@/lib/puzzle/stagePalette";
import type { PuzzleBoosterDef, PuzzleGameKey, PuzzleGameModule } from "@/lib/puzzle/types";
import { useLifeCountdown } from "@/lib/puzzle/usePuzzle";
import { colors, fonts, radius, space, textScale, touchSlop, type } from "@/theme";

import { tierOf } from "./LevelMap";
import { WatchAdForLife } from "./RewardedLife";

const LEFT = { x: 0, y: 0.5 } as const;
const RIGHT = { x: 1, y: 0.5 } as const;
const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

/* ═══════════════════════ ortak: oyun kartı ═══════════════════════ */

function GameCard({
  visible,
  onClose,
  game,
  ribbonTop,
  ribbon,
  children,
  footer,
  closable = true,
}: {
  visible: boolean;
  onClose: () => void;
  game: PuzzleGameKey;
  ribbonTop?: string;
  ribbon: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  closable?: boolean;
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
  const th = STAGE_THEMES[game];
  const cardW = Math.min(380, width - space.lg * 2);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closable ? onClose : () => undefined} statusBarTranslucent>
      <View style={styles.dim}>
        <Animated.View style={[styles.cardWrap, { width: cardW, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
          <View style={[styles.card, { maxHeight: height - 120 }]}>
            <LinearGradient colors={S.card} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
            <ScrollView contentContainerStyle={styles.cardBody} showsVerticalScrollIndicator={false} bounces={false}>
              {children}
            </ScrollView>
            <View style={styles.cardFoot}>{footer}</View>
          </View>
          {/* Kurdele kartın üst kenarına oturur */}
          <View pointerEvents="none" style={styles.ribbonLayer}>
            <View style={styles.ribbonTails}>
              <View style={[styles.ribbonTail, { backgroundColor: th.ribbon[1] }]} />
              <View style={[styles.ribbonTail, { backgroundColor: th.ribbon[1] }]} />
            </View>
            <LinearGradient colors={th.ribbon} start={LEFT} end={RIGHT} style={styles.ribbon}>
              {ribbonTop ? (
                <Text style={styles.ribbonTop} numberOfLines={1} {...textScale.badge}>
                  {ribbonTop}
                </Text>
              ) : null}
              <Text style={styles.ribbonText} numberOfLines={1} {...textScale.badge}>
                {ribbon}
              </Text>
            </LinearGradient>
          </View>
          {closable ? (
            <Touchable onPress={onClose} hitSlop={touchSlop(36)} accessibilityLabel="Kapat" style={styles.close} haptic="light">
              <LinearGradient colors={S.danger} start={TOP} end={BOTTOM} style={styles.closeFill}>
                <Ionicons name="close" size={22} color={S.white} />
              </LinearGradient>
            </Touchable>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Alt dudaklı, basınca çöken 3B oyun düğmesi. */
export function GameButton({
  label,
  icon,
  onPress,
  disabled,
  tone = "play",
  small,
  accessibilityLabel,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  tone?: "play" | "danger" | "game";
  small?: boolean;
  accessibilityLabel?: string;
  game?: PuzzleGameKey;
}) {
  const fill = tone === "danger" ? S.danger : S.play;
  const lip = tone === "danger" ? S.dangerLip : S.playLip;
  const h = small ? 50 : 62;
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      haptic="medium"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.gbtn, { height: h + 6, opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={[styles.gbtnLip, { height: h, backgroundColor: lip }]} />
      <LinearGradient colors={fill} start={TOP} end={BOTTOM} style={[styles.gbtnFill, { height: h }]}>
        <View style={styles.gbtnShine} />
        {icon ? <Ionicons name={icon} size={small ? 20 : 26} color={S.white} /> : null}
        <Text style={[styles.gbtnText, small && styles.gbtnTextSmall]} numberOfLines={1} {...textScale.badge}>
          {label}
        </Text>
      </LinearGradient>
    </Touchable>
  );
}

function Hearts({ profile }: { profile?: PuzzleProfile }) {
  const life = useLifeCountdown(profile);
  const max = profile?.max_lives ?? 5;
  return (
    <View style={styles.heartsRow} accessibilityLabel={`${life.lives} can${life.label && life.label !== "Dolu" ? `, sıradaki ${life.label}` : ""}`}>
      {Array.from({ length: max }, (_, i) => (
        <Ionicons key={i} name={i < life.lives ? "heart" : "heart-outline"} size={22} color={i < life.lives ? S.heart : S.starEmpty} />
      ))}
      {life.label && life.label !== "Dolu" ? (
        <Text style={styles.heartsTimer} {...textScale.badge}>
          +1 · {life.label}
        </Text>
      ) : null}
    </View>
  );
}

/* ═══════════════════════ BAŞLANGIÇ ═══════════════════════ */

export function LevelStartSheet({
  visible,
  onClose,
  module,
  level,
  stock,
  selected,
  onToggleBooster,
  onPlay,
  busy,
  lives,
  profile,
}: {
  visible: boolean;
  onClose: () => void;
  module: PuzzleGameModule;
  level: number;
  stock: Record<string, number>;
  selected: string[];
  onToggleBooster: (booster: PuzzleBoosterDef) => void;
  onPlay: () => void;
  busy?: boolean;
  lives: number;
  /** Bu oyunun canları (livesFor) — kalpler ve reklamla can için. */
  profile?: PuzzleProfile;
}) {
  const goal = module.goalSummary(level);
  const pre = module.boosters.filter((b) => b.kind === "pre");
  const th = STAGE_THEMES[module.key];
  const cup = level % 10 === 0;
  return (
    <GameCard
      visible={visible}
      onClose={onClose}
      game={module.key}
      ribbonTop={tierOf(level).toLocaleUpperCase("tr-TR")}
      ribbon={`SEVİYE ${level}`}
      footer={
        lives < 1 ? (
          <View style={styles.footCol}>
            {profile?.ad_lives ? <WatchAdForLife profile={profile} size="lg" /> : null}
            <GameButton label="CANIN KALMADI" icon="heart-dislike" onPress={onPlay} disabled tone="danger" />
          </View>
        ) : (
          <GameButton label={busy ? "HAZIRLANIYOR…" : "OYNA"} icon="play" onPress={onPlay} disabled={busy} accessibilityLabel={`${level}. seviyeyi oyna`} />
        )
      }
    >
      {cup || goal.badge ? (
        <View style={styles.cupBadge}>
          <Ionicons name="trophy" size={16} color={S.goldDeep} />
          <Text style={styles.cupText} {...textScale.badge}>
            {(goal.badge || "KUPA MAÇI").toLocaleUpperCase("tr-TR")}
          </Text>
        </View>
      ) : null}

      {/* Hedef paneli */}
      <View style={[styles.goalPanel, { borderColor: th.button[0] }]}>
        <LinearGradient colors={[th.sky[1], th.sky[0]]} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
        <Text style={styles.goalHead} {...textScale.badge}>HEDEF</Text>
        <View style={styles.goals}>
          {goal.goals.map((g, i) => (
            <View key={`${g.label}${i}`} style={styles.goal}>
              <View style={[styles.goalBubble, { backgroundColor: th.button[0], borderColor: S.white }]}>
                <Ionicons name={g.icon as keyof typeof Ionicons.glyphMap} size={30} color={S.white} />
                {g.count != null ? (
                  <View style={styles.goalCount}>
                    <Text style={styles.goalCountText} {...textScale.badge}>{g.count}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.goalLabel} numberOfLines={2} {...textScale.dense}>{g.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.limitPill}>
          <Ionicons name="hourglass" size={16} color={S.cardInk} />
          <Text style={styles.limitText} {...textScale.badge}>{goal.limit}</Text>
        </View>
      </View>

      {goal.tip ? (
        <View style={styles.tip}>
          <View style={styles.tipIcon}>
            <Ionicons name="bulb" size={18} color={S.white} />
          </View>
          <Text style={styles.tipText} {...textScale.long}>{goal.tip}</Text>
        </View>
      ) : null}

      {pre.length ? (
        <>
          <Text style={styles.section} {...textScale.badge}>GÜÇLENDİRİCİ SEÇ</Text>
          <View style={styles.boosters}>
            {pre.map((b) => (
              <BoosterBubble
                key={b.key}
                booster={b}
                count={stock[b.key] ?? 0}
                selected={selected.includes(b.key)}
                fill={th.button}
                onPress={() => onToggleBooster(b)}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.livesBox}>
        <Hearts profile={profile} />
      </View>
    </GameCard>
  );
}

function BoosterBubble({
  booster,
  count,
  selected,
  fill,
  onPress,
}: {
  booster: PuzzleBoosterDef;
  count: number;
  selected: boolean;
  fill: [string, string];
  onPress: () => void;
}) {
  const reduce = useReduceMotion();
  const lift = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      lift.setValue(selected ? 1 : 0);
      return;
    }
    Animated.spring(lift, { toValue: selected ? 1 : 0, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [lift, reduce, selected]);
  return (
    <Touchable
      onPress={onPress}
      haptic="selection"
      style={styles.booster}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${booster.title}, ${count} adet${selected ? ", seçildi" : ""}. ${booster.description}`}
    >
      <Animated.View
        style={[
          styles.bubbleWrap,
          { transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }, { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] },
        ]}
      >
        <View style={[styles.bubbleLip, { backgroundColor: fill[1] }]} />
        <LinearGradient colors={selected ? S.play : fill} start={TOP} end={BOTTOM} style={[styles.bubble, selected && styles.bubbleOn]}>
          <View style={styles.bubbleShine} />
          <Ionicons name={booster.icon as keyof typeof Ionicons.glyphMap} size={30} color={S.white} />
        </LinearGradient>
        <View style={[styles.stockBadge, selected ? styles.stockOn : count ? null : styles.stockZero]}>
          {selected ? (
            <Ionicons name="checkmark" size={14} color={S.white} />
          ) : (
            <Text style={styles.stockText} {...textScale.badge}>{count ? count : "+"}</Text>
          )}
        </View>
      </Animated.View>
      <Text style={styles.boosterName} numberOfLines={2} {...textScale.badge}>{booster.title}</Text>
    </Touchable>
  );
}

/* ═══════════════════════ SONUÇ ═══════════════════════ */

export function ResultSheet({
  visible,
  won,
  stars,
  level,
  coins,
  xp,
  firstClear,
  summary,
  onNext,
  onRetry,
  onMap,
  livesLeft,
  profile,
  game = "uclu",
}: {
  visible: boolean;
  won: boolean;
  stars: number;
  level: number;
  coins: number;
  xp: number;
  firstClear: boolean;
  summary?: string;
  onNext: () => void;
  onRetry: () => void;
  onMap: () => void;
  livesLeft: number;
  /** Kaybedip canı biten oyuncuya "Reklam izle · +1 can" (bu oyunun canı). */
  profile?: PuzzleProfile;
  game?: PuzzleGameKey;
}) {
  return (
    <GameCard
      visible={visible}
      onClose={onMap}
      closable={false}
      game={game}
      ribbonTop={`SEVİYE ${level}`}
      ribbon={won ? (level % 10 === 0 ? "KUPA SENİN!" : "TEBRİKLER!") : "OLMADI!"}
      footer={
        <View style={styles.footCol}>
          {!won && livesLeft < 1 && profile?.ad_lives ? <WatchAdForLife profile={profile} /> : null}
          {won ? (
            <GameButton label={`${level + 1}. SEVİYE`} icon="arrow-forward" onPress={onNext} />
          ) : (
            <GameButton label={livesLeft > 0 ? "TEKRAR DENE" : "CAN YOK"} icon="refresh" onPress={onRetry} disabled={livesLeft < 1} />
          )}
          <Touchable onPress={onMap} style={styles.mapLink} accessibilityRole="button" haptic="light">
            <Ionicons name="map" size={16} color={S.cardSoft} />
            <Text style={styles.mapLinkText} {...textScale.dense}>Haritaya dön</Text>
          </Touchable>
        </View>
      }
    >
      {won ? (
        <>
          <View style={styles.starRow}>
            <View pointerEvents="none" style={styles.burstWrap}>
              <Sunburst size={320} color={S.gold} opacity={0.5} />
            </View>
            {[1, 2, 3].map((n) => (
              <BigStar key={n} index={n} lit={n <= stars} visible={visible} />
            ))}
          </View>
          <View style={styles.rewards}>
            <Reward icon="disc" tint={S.gold} value={`+${coins}`} label="jeton" />
            {xp > 0 ? <Reward icon="flash" tint={colors.brandAccent} value={`+${xp}`} label="XP" /> : null}
            {firstClear ? <Reward icon="star" tint={S.gold} value={`+${stars}`} label="şehir yıldızı" /> : null}
          </View>
        </>
      ) : (
        <View style={styles.lost}>
          <View style={styles.lostHeart}>
            <Ionicons name="heart-dislike" size={56} color={S.heart} />
          </View>
          <Text style={styles.lostText} {...textScale.long}>
            1 can gitti. {livesLeft > 0 ? `Bu oyunda ${livesLeft} canın kaldı.` : "Can dolunca, reklam izleyerek ya da mağazadan doldurup devam et."}
          </Text>
          <Hearts profile={profile} />
        </View>
      )}
      {summary ? <Text style={styles.summary} {...textScale.long}>{summary}</Text> : null}
    </GameCard>
  );
}

function BigStar({ index, lit, visible }: { index: number; lit: boolean; visible: boolean }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (!visible) return;
    if (reduce) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    Animated.sequence([
      Animated.delay(300 + index * 300),
      Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [index, reduce, v, visible]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [2.2, 1] });
  const [spark, setSpark] = React.useState(0);
  useEffect(() => {
    if (!visible || !lit) return undefined;
    const id = setTimeout(() => setSpark((n) => n + 1), 300 + index * 300 + 160);
    return () => clearTimeout(id);
  }, [visible, lit, index]);
  const big = index === 2;
  return (
    <Animated.View
      style={[
        big ? styles.starBig : styles.starSide,
        { opacity: v, transform: [{ scale }, { rotate: v.interpolate({ inputRange: [0, 1], outputRange: [index === 1 ? "-40deg" : "40deg", index === 1 ? "-12deg" : index === 3 ? "12deg" : "0deg"] }) }] },
      ]}
    >
      <Ionicons name="star" size={big ? 84 : 62} color={lit ? S.goldDeep : S.starEmpty} style={styles.starBack} />
      <Ionicons name="star" size={big ? 84 : 62} color={lit ? S.gold : S.starEmpty} />
      {lit ? <SparkleBurst trigger={spark} radius={big ? 70 : 52} color={S.gold} /> : null}
    </Animated.View>
  );
}

function Reward({ icon, tint, value, label }: { icon: keyof typeof Ionicons.glyphMap; tint: string; value: string; label: string }) {
  return (
    <View style={styles.reward}>
      <Ionicons name={icon} size={22} color={tint} />
      <View>
        <Text style={styles.rewardValue} {...textScale.badge}>{value}</Text>
        <Text style={styles.rewardLabel} {...textScale.badge}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: S.dim, alignItems: "center", justifyContent: "center", paddingTop: space.huge },
  cardWrap: { marginTop: space.xl },
  card: {
    borderRadius: radius.xxl,
    borderWidth: 4,
    borderColor: S.white,
    overflow: "hidden",
    shadowColor: S.cardInk,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  cardBody: { paddingTop: space.giant, paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md },
  cardFoot: { paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.xs },
  ribbonLayer: { position: "absolute", top: -30, left: 0, right: 0, alignItems: "center" },
  ribbonTails: { position: "absolute", top: 12, left: space.sm, right: space.sm, flexDirection: "row", justifyContent: "space-between" },
  ribbonTail: { width: 36, height: 34, borderRadius: radius.xs },
  ribbon: {
    minWidth: 220,
    alignItems: "center",
    paddingHorizontal: space.xl,
    paddingVertical: space.xs,
    borderRadius: radius.lg,
    borderWidth: 4,
    borderColor: S.white,
  },
  ribbonTop: { ...type.micro, fontFamily: fonts.bold, color: S.ink, letterSpacing: 1.5, opacity: 0.92 },
  ribbonText: {
    ...type.h1,
    fontFamily: fonts.bold,
    color: S.ink,
    letterSpacing: 1.5,
    textShadowColor: S.inkShadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  close: { position: "absolute", top: -14, right: -10 },
  closeFill: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: S.white },
  footCol: { gap: space.sm },

  cupBadge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: S.gold,
    borderWidth: 2,
    borderColor: S.goldDeep,
  },
  cupText: { ...type.micro, fontFamily: fonts.bold, color: S.cardInk, letterSpacing: 1 },
  goalPanel: { borderRadius: radius.xl, borderWidth: 3, overflow: "hidden", paddingVertical: space.md, paddingHorizontal: space.sm, alignItems: "center", gap: space.sm },
  goalHead: { ...type.label, fontFamily: fonts.bold, color: S.ink, letterSpacing: 3, opacity: 0.9 },
  goals: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.md },
  goal: { alignItems: "center", gap: space.xs, width: 86 },
  goalBubble: { width: 62, height: 62, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3 },
  goalCount: {
    position: "absolute",
    bottom: -8,
    minWidth: 30,
    paddingHorizontal: space.xs,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: S.white,
    borderWidth: 2,
    borderColor: S.cardInk,
  },
  goalCountText: { ...type.label, fontFamily: fonts.bold, color: S.cardInk },
  goalLabel: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: S.ink,
    textAlign: "center",
    marginTop: space.xs,
    textShadowColor: S.inkShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  limitPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: S.white,
  },
  limitText: { ...type.h3, fontFamily: fonts.bold, color: S.cardInk },
  tip: { flexDirection: "row", gap: space.sm, alignItems: "center", padding: space.sm, borderRadius: radius.lg, backgroundColor: S.tip },
  tipIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: S.goldDeep },
  tipText: { ...type.bodySm, color: S.tipInk, flex: 1 },
  section: { ...type.label, fontFamily: fonts.bold, color: S.cardSoft, letterSpacing: 2, textAlign: "center", marginTop: space.xs },
  boosters: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: space.md },
  booster: { alignItems: "center", gap: space.xs, width: 84 },
  bubbleWrap: { width: 70, height: 76 },
  bubbleLip: { position: "absolute", top: 6, width: 70, height: 70, borderRadius: radius.pill },
  bubble: { width: 70, height: 70, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: S.white, overflow: "hidden" },
  bubbleOn: { borderColor: S.gold },
  bubbleShine: { position: "absolute", top: 6, left: 14, right: 14, height: 18, borderRadius: radius.pill, backgroundColor: S.white, opacity: 0.3 },
  stockBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 26,
    height: 26,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: S.badge,
    borderWidth: 2,
    borderColor: S.white,
  },
  stockOn: { backgroundColor: S.check },
  stockZero: { backgroundColor: S.cardSoft },
  stockText: { ...type.label, fontFamily: fonts.bold, color: S.white },
  boosterName: { ...type.micro, fontFamily: fonts.semibold, color: S.cardInk, textAlign: "center" },
  livesBox: { alignItems: "center", paddingVertical: space.xs, borderRadius: radius.lg, backgroundColor: S.panel, borderWidth: 2, borderColor: S.panelEdge },
  heartsRow: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingVertical: space.xs },
  heartsTimer: { ...type.label, fontFamily: fonts.bold, color: S.cardSoft, marginLeft: space.sm },

  gbtn: { alignSelf: "stretch" },
  gbtnLip: { position: "absolute", top: 6, left: 0, right: 0, borderRadius: radius.pill },
  gbtnFill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: S.white,
    overflow: "hidden",
  },
  gbtnShine: { position: "absolute", top: 5, left: space.xl, right: space.xl, height: 14, borderRadius: radius.pill, backgroundColor: S.white, opacity: 0.28 },
  gbtnText: {
    ...type.h2,
    fontFamily: fonts.bold,
    color: S.white,
    letterSpacing: 2,
    textShadowColor: S.inkShadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
  gbtnTextSmall: { ...type.h3, fontFamily: fonts.bold },
  mapLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, paddingVertical: space.xs },
  mapLinkText: { ...type.label, color: S.cardSoft },

  starRow: { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: space.xs, marginTop: space.sm, height: 120 },
  burstWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  starBig: { marginBottom: space.xl },
  starSide: {},
  starBack: { position: "absolute", top: 4 },
  rewards: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: space.sm },
  reward: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: S.panel,
    borderWidth: 2,
    borderColor: S.panelEdge,
  },
  rewardValue: { ...type.h3, fontFamily: fonts.bold, color: S.cardInk },
  rewardLabel: { ...type.micro, color: S.cardSoft },
  lost: { alignItems: "center", gap: space.md, paddingVertical: space.sm },
  lostHeart: { width: 96, height: 96, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: S.panel },
  lostText: { ...type.body, color: S.cardInk, textAlign: "center" },
  summary: { ...type.bodySm, color: S.cardSoft, textAlign: "center" },
});
