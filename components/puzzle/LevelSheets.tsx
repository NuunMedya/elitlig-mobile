/**
 * Seviye pencereleri — Başlangıç ve Sonuç.
 *
 * BAŞLANGIÇ: seviye numarası, lig basamağı, kupa rozeti, kısıt (hamle/süre),
 * hedefler, yeni mekanik ipucu ve seviye öncesi güçlendirici seçimi; "Oyna".
 * SONUÇ: kazanınca yıldızların tek tek düşmesi (sonlu yay animasyonu), jeton
 * ve XP; kaybedince can kaybı ve "Tekrar dene".
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, useReduceMotion } from "@/components/ui";
import type { PuzzleProfile } from "@/lib/puzzle/api";
import type { PuzzleBoosterDef, PuzzleGameModule } from "@/lib/puzzle/types";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

import { tierOf } from "./LevelMap";
import { WatchAdForLife } from "./RewardedLife";
import { BoosterChip } from "./sheets";

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
  /** Reklamla can düğmesi için (can bitince gösterilir). */
  profile?: PuzzleProfile;
}) {
  const goal = module.goalSummary(level);
  const pre = module.boosters.filter((b) => b.kind === "pre");
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`${level}. seviye`}
      footer={
        lives < 1 && profile?.ad_lives ? (
          <WatchAdForLife profile={profile} size="lg" />
        ) : (
          <Button
            label={lives > 0 ? "Oyna" : "Canın kalmadı"}
            icon={lives > 0 ? "play" : "heart-dislike"}
            onPress={onPlay}
            loading={busy}
            disabled={lives < 1}
            fullWidth
            size="lg"
            haptic="medium"
          />
        )
      }
    >
      <View style={styles.headRow}>
        <Text style={styles.tier} {...textScale.dense}>{tierOf(level)}</Text>
        {goal.badge ? (
          <View style={styles.badge}>
            <Ionicons name="trophy" size={14} color={colors.yellowCard} />
            <Text style={styles.badgeText} {...textScale.badge}>{goal.badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.goalBox}>
        <Text style={styles.limit} {...textScale.dense}>{goal.limit}</Text>
        <View style={styles.goals}>
          {goal.goals.map((g, i) => (
            <View key={`${g.label}${i}`} style={styles.goal}>
              <Ionicons name={g.icon as keyof typeof Ionicons.glyphMap} size={26} color={colors.brandAccent} />
              {g.count != null ? <Text style={styles.goalCount} {...textScale.badge}>{g.count}</Text> : null}
              <Text style={styles.goalLabel} numberOfLines={2} {...textScale.dense}>{g.label}</Text>
            </View>
          ))}
        </View>
      </View>
      {goal.tip ? (
        <View style={styles.tip}>
          <Ionicons name="bulb" size={18} color={colors.warn} />
          <Text style={styles.tipText} {...textScale.long}>{goal.tip}</Text>
        </View>
      ) : null}
      {pre.length ? (
        <>
          <Text style={styles.section} {...textScale.dense}>Güçlendirici seç</Text>
          <View style={styles.boosters}>
            {pre.map((b) => (
              <View key={b.key} style={styles.booster}>
                <BoosterChip icon={b.icon} title={b.title} count={stock[b.key] ?? 0} selected={selected.includes(b.key)} onPress={() => onToggleBooster(b)} />
                <Text style={styles.boosterName} numberOfLines={2} {...textScale.badge}>{b.title}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </BottomSheet>
  );
}

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
  /** Kaybedip canı biten oyuncuya "Reklam izle · +1 can". */
  profile?: PuzzleProfile;
}) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onMap}
      dismissible={false}
      title={won ? (level % 10 === 0 ? "Kupa senin!" : "Seviye geçildi!") : "Bu sefer olmadı"}
      footer={
        <View style={styles.footerCol}>
          {!won && livesLeft < 1 && profile?.ad_lives ? <WatchAdForLife profile={profile} /> : null}
        <View style={styles.footer}>
          <Button label="Harita" variant="secondary" onPress={onMap} />
          {won ? (
            <Button label={`${level + 1}. seviye`} icon="arrow-forward" iconPosition="right" onPress={onNext} style={styles.grow} haptic="medium" />
          ) : (
            <Button label={livesLeft > 0 ? "Tekrar dene" : "Can yok"} icon="refresh" onPress={onRetry} disabled={livesLeft < 1} style={styles.grow} />
          )}
        </View>
        </View>
      }
    >
      {won ? (
        <>
          <View style={styles.starRow}>
            {[1, 2, 3].map((n) => (
              <BigStar key={n} index={n} lit={n <= stars} visible={visible} />
            ))}
          </View>
          <View style={styles.rewards}>
            <Reward icon="disc" tint={colors.yellowCard} value={`+${coins}`} label="jeton" />
            {xp > 0 ? <Reward icon="flash" tint={colors.brandAccent} value={`+${xp}`} label="XP" /> : null}
            {firstClear ? <Reward icon="star" tint={colors.yellowCard} value={`+${stars}`} label="stadyum yıldızı" /> : null}
          </View>
        </>
      ) : (
        <View style={styles.lost}>
          <Ionicons name="heart-dislike" size={44} color={colors.live} />
          <Text style={styles.lostText} {...textScale.long}>
            1 can kaybettin. {livesLeft > 0 ? `${livesLeft} canın kaldı.` : "Can dolunca ya da mağazadan doldurup devam et."}
          </Text>
        </View>
      )}
      {summary ? <Text style={styles.summary} {...textScale.long}>{summary}</Text> : null}
    </BottomSheet>
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
      Animated.delay(250 + index * 280),
      Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [index, reduce, v, visible]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  return (
    <Animated.View style={[index === 2 ? styles.starBig : styles.starSide, { opacity: v, transform: [{ scale }] }]}>
      <Ionicons name="star" size={index === 2 ? 64 : 48} color={lit ? colors.yellowCard : colors.starEmpty} />
    </Animated.View>
  );
}

function Reward({ icon, tint, value, label }: { icon: keyof typeof Ionicons.glyphMap; tint: string; value: string; label: string }) {
  return (
    <View style={styles.reward}>
      <Ionicons name={icon} size={22} color={tint} />
      <Text style={styles.rewardValue} {...textScale.badge}>{value}</Text>
      <Text style={styles.rewardLabel} {...textScale.badge}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm },
  tier: { ...type.overline, color: colors.textTertiary },
  badge: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.warnDim },
  badgeText: { ...type.micro, color: colors.warn },
  goalBox: { borderRadius: radius.xl, backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border, padding: space.lg, gap: space.md, alignItems: "center" },
  limit: { ...type.h2, fontFamily: fonts.bold, color: colors.textPrimary },
  goals: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.lg },
  goal: { alignItems: "center", gap: 2, width: 84 },
  goalCount: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary },
  goalLabel: { ...type.caption, color: colors.textSecondary, textAlign: "center" },
  tip: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", marginTop: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.warnDim },
  tipText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.lg, marginBottom: space.sm },
  boosters: { flexDirection: "row", gap: space.lg },
  booster: { alignItems: "center", gap: space.xs, width: 72 },
  boosterName: { ...type.micro, color: colors.textSecondary, textAlign: "center" },
  footer: { flexDirection: "row", gap: space.sm },
  footerCol: { gap: space.sm },
  grow: { flex: 1 },
  starRow: { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: space.md, marginVertical: space.md },
  starBig: { marginBottom: space.md },
  starSide: {},
  rewards: { flexDirection: "row", justifyContent: "center", gap: space.xl, marginTop: space.sm },
  reward: { alignItems: "center", gap: 2 },
  rewardValue: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary },
  rewardLabel: { ...type.micro, color: colors.textTertiary },
  lost: { alignItems: "center", gap: space.md, paddingVertical: space.md },
  lostText: { ...type.body, color: colors.textSecondary, textAlign: "center" },
  summary: { ...type.bodySm, color: colors.textSecondary, textAlign: "center", marginTop: space.md },
});
