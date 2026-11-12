/**
 * ProfileHero — Menü sekmesinin kimlik sahnesi.
 *
 * NEDEN SAHNE: kimlik anı koyu sahnede durur (Gece teması: `gradientInk` +
 * `<Aurora variant="stage" />`, iki temada da beyaz metin). Ekranın tek koyu
 * yüzeyi burasıdır; altındaki her şey kâğıttır.
 *
 * GİRİŞLİ ÜYEDE (yukarıdan aşağı):
 *   1. Avatar, imza degradeli halkanın içinde; yanında ad, @kullanıcı adı,
 *      rol hapları ve takım hapı. Sağ üstte hesap düğmesi.
 *   2. ELİT SEVİYE şeridi (verilirse): seviye rozeti, toplam XP (dönen
 *      sayaç) ve sonraki seviyeye `GradientBar`.
 *   3. Üç sayı: takip edilen takım · lig/sezon · maç (dönen sayaç). Her sayı
 *      Takip ekranının ilgili sekmesini açar.
 *
 * MİSAFİRDE: davet — kısa başlık, üç kazanım satırı (ikonlu), giriş/üye ol.
 * Takip varsa sayılar yine görünür (takip cihazdadır); hiç takip yoksa sayı
 * satırı çizilmez.
 *
 * PROPS geriye uyumludur: `level` isteğe bağlıdır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Aurora, Avatar, Button, GradientBar, Odometer, TeamLogo, Touchable } from "@/components/ui";
import { colors, elevate, fonts, glowStyle, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

export interface ProfileHeroStat {
  key: string;
  label: string;
  value: number;
  onPress: () => void;
}

interface Role {
  key: string;
  label: string;
}

/** Elit Seviye özeti — `lib/api/career` CareerLevel'dan türetilir. */
export interface ProfileHeroLevel {
  level: number;
  xp: number;
  /** 0–1 arası: içinde bulunulan seviyenin dolan kısmı. */
  progress: number;
  /** Sonraki seviyeye kalan XP; en üst seviyede null. */
  toNext: number | null;
  onPress?: () => void;
}

export interface ProfileHeroProps {
  /** null → misafir kipi. */
  user: {
    name: string;
    username: string;
    avatar: string | null;
    teamName: string | null;
    teamLogo: string | null;
    roles: Role[];
  } | null;
  stats: ProfileHeroStat[];
  /** Elit Seviye şeridi — yalnız girişli üyede ve veri gelince. */
  level?: ProfileHeroLevel | null;
  onAccount: () => void;
  onSignIn: () => void;
  onRegister: () => void;
}

export const ProfileHero = React.memo(function ProfileHero({
  user,
  stats,
  level,
  onAccount,
  onSignIn,
  onRegister,
}: ProfileHeroProps) {
  const showStats = Boolean(user) || stats.some((stat) => stat.value > 0);
  return (
    <View style={styles.stage}>
      <LinearGradient
        colors={colors.gradientInk}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Aurora variant="stage" style={StyleSheet.absoluteFill} />
      {user ? <Identity user={user} onAccount={onAccount} /> : <Guest onSignIn={onSignIn} onRegister={onRegister} />}
      {user && level ? <LevelStrip level={level} /> : null}
      {/* Misafirin hiç takibi yoksa üç sıfır yalnız gürültüdür; çizilmez. */}
      {showStats ? (
        <View style={styles.statRow}>
          {stats.map((stat, index) => (
            <React.Fragment key={stat.key}>
              {index > 0 ? <View style={styles.statDivider} /> : null}
              <StatCell stat={stat} />
            </React.Fragment>
          ))}
        </View>
      ) : null}
    </View>
  );
});

/* -------------------------------- KİMLİK -------------------------------- */

const AVATAR = 64;
const RING = 3;

const Identity = React.memo(function Identity({
  user,
  onAccount,
}: {
  user: NonNullable<ProfileHeroProps["user"]>;
  onAccount: () => void;
}) {
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onAccount}
      accessibilityRole="button"
      accessibilityLabel={`${user.name}, @${user.username}. Hesap ve güvenlik`}
      style={styles.identity}
    >
      {/* İMZA HALKASI: mor → camgöbeği degrade halka + mor parıltı. */}
      <View style={[styles.ring, glowStyle(colors.glow, 2)]}>
        <LinearGradient
          colors={colors.gradientSignature}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.ringFill]}
        />
        <View style={styles.ringGap}>
          <Avatar name={user.name} image={user.avatar} size={AVATAR} />
        </View>
      </View>
      <View style={styles.identityBody}>
        <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
          {user.name}
        </Text>
        <Text style={styles.handle} numberOfLines={1} {...textScale.dense}>
          @{user.username}
        </Text>
        {user.roles.length || user.teamName ? (
          <View style={styles.metaRow}>
            {user.roles.map((role) => (
              <View key={role.key} style={styles.rolePill}>
                <Text style={styles.roleText} {...textScale.badge}>
                  {upperTR(role.label)}
                </Text>
              </View>
            ))}
            {user.teamName ? (
              <View style={styles.teamPill}>
                <TeamLogo name={user.teamName} logo={user.teamLogo} size={16} onDark />
                <Text style={styles.teamText} numberOfLines={1} {...textScale.dense}>
                  {user.teamName}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.accountChip}>
        <Ionicons name="settings-outline" size={16} color={colors.onDark} />
      </View>
    </Touchable>
  );
});

/* ------------------------------ ELİT SEVİYE ------------------------------ */

const LevelStrip = React.memo(function LevelStrip({ level }: { level: ProfileHeroLevel }) {
  const progress = Math.max(0, Math.min(1, Number(level.progress) || 0));
  const hint =
    level.toNext != null
      ? `Seviye ${level.level + 1} için ${level.toNext.toLocaleString("tr-TR")} XP`
      : "En üst seviyedesin";
  const body = (
    <>
      <View style={styles.levelBadge}>
        <LinearGradient
          colors={colors.gradientBrand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.levelBadgeFill]}
        />
        <Text style={styles.levelBadgeLabel} {...textScale.badge}>
          SV
        </Text>
        <Text style={styles.levelBadgeValue} {...textScale.badge}>
          {level.level}
        </Text>
      </View>
      <View style={styles.levelBody}>
        <View style={styles.levelHead}>
          <Text style={styles.levelTitle} numberOfLines={1} {...textScale.badge}>
            {upperTR("Elit seviye")}
          </Text>
          <View style={styles.levelXp}>
            <Odometer value={level.xp.toLocaleString("tr-TR")} style={styles.levelXpValue} />
            <Text style={styles.levelXpUnit} {...textScale.badge}>
              XP
            </Text>
          </View>
        </View>
        <GradientBar value={progress} height={6} track={colors.inkTile} />
        <Text style={styles.levelHint} numberOfLines={1} {...textScale.dense}>
          {hint}
        </Text>
      </View>
      {level.onPress ? <Ionicons name="chevron-forward" size={16} color={colors.onDarkMuted} /> : null}
    </>
  );
  if (!level.onPress) return <View style={styles.level}>{body}</View>;
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={level.onPress}
      accessibilityRole="button"
      accessibilityLabel={`Elit seviye ${level.level}, ${level.xp} XP. ${hint}`}
      style={styles.level}
    >
      {body}
    </Touchable>
  );
});

/* -------------------------------- MİSAFİR -------------------------------- */

const GUEST_PERKS: { key: string; icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { key: "gol", icon: "notifications", text: "Takımının gollerini anında öğren" },
  { key: "xp", icon: "flash", text: "Görevlerle XP topla, Elit Seviye'ni yükselt" },
  { key: "kulup", icon: "shield-half", text: "Takımınla yazış, tekliflerini yönet" },
];

const Guest = React.memo(function Guest({
  onSignIn,
  onRegister,
}: {
  onSignIn: () => void;
  onRegister: () => void;
}) {
  return (
    <View style={styles.guest}>
      <View style={styles.guestPill}>
        <View style={styles.guestDot} />
        <Text style={styles.overline} {...textScale.badge}>
          {upperTR("Misafir olarak geziyorsun")}
        </Text>
      </View>
      <Text style={styles.guestTitle} {...textScale.dense}>
        Ligini cebinde taşı
      </Text>
      <View style={styles.perks}>
        {GUEST_PERKS.map((perk) => (
          <View key={perk.key} style={styles.perk}>
            <View style={styles.perkIcon}>
              <Ionicons name={perk.icon} size={13} color={colors.brandOnDark} />
            </View>
            <Text style={styles.perkText} numberOfLines={1} {...textScale.dense}>
              {perk.text}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.guestActions}>
        <Button label="Giriş yap" onPress={onSignIn} style={styles.flex} />
        <Button label="Üye ol" variant="secondary" onDark onPress={onRegister} style={styles.flex} />
      </View>
    </View>
  );
});

/* --------------------------------- SAYI --------------------------------- */

const StatCell = React.memo(function StatCell({ stat }: { stat: ProfileHeroStat }) {
  const label = useMemo(() => `${stat.label}: ${stat.value}. Takip listesini aç`, [stat.label, stat.value]);
  return (
    <Touchable
      feedback="chip"
      haptic="selection"
      onPress={stat.onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.stat}
    >
      <Odometer value={stat.value} style={[styles.statValue, stat.value === 0 ? styles.statValueZero : null]} />
      <Text style={styles.statLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(stat.label)}
      </Text>
    </Touchable>
  );
});

/* -------------------------------- STİLLER -------------------------------- */

const styles = StyleSheet.create({
  stage: {
    marginTop: space.sm,
    borderRadius: radius.xxl,
    backgroundColor: colors.inkBlock,
    overflow: "hidden",
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    ...elevate(2),
  },
  flex: { flex: 1 },

  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  ring: {
    width: AVATAR + RING * 2 + 4,
    height: AVATAR + RING * 2 + 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  ringFill: { borderRadius: radius.pill },
  ringGap: {
    padding: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.inkBlock,
  },
  identityBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    ...type.display,
    color: colors.onDark,
  },
  handle: {
    ...type.bodySm,
    color: colors.onDarkMuted,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.xs,
    marginTop: space.s,
  },
  rolePill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  roleText: {
    ...type.micro,
    color: colors.brandOnDark,
  },
  teamPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    maxWidth: 170,
    paddingLeft: 3,
    paddingRight: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  teamText: {
    ...type.caption,
    color: colors.onDark,
    flexShrink: 1,
  },
  accountChip: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
    alignSelf: "flex-start",
  },

  level: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  levelBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    ...glowStyle(colors.glow, 1),
  },
  levelBadgeFill: { borderRadius: radius.md },
  levelBadgeLabel: { ...type.nano, color: colors.onDarkMuted },
  levelBadgeValue: { ...type.scoreSm, color: colors.onDark, marginTop: -2 },
  levelBody: { flex: 1, minWidth: 0, gap: space.xs },
  levelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  levelTitle: { ...type.overline, color: colors.onDarkMuted },
  levelXp: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  levelXpValue: { ...type.numSmStrong, color: colors.onDark },
  levelXpUnit: { ...type.micro, color: colors.onDarkMuted },
  levelHint: { ...type.caption, color: colors.onDarkMuted },

  guest: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.sm,
  },
  guestPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.s,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  guestDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandOnDark },
  overline: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  guestTitle: {
    ...type.display,
    color: colors.onDark,
  },
  perks: { gap: space.s, marginTop: space.xxs },
  perk: { flexDirection: "row", alignItems: "center", gap: space.sm },
  perkIcon: {
    width: 22,
    height: 22,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  perkText: {
    ...type.bodySm,
    color: colors.onDark,
    flex: 1,
  },
  guestActions: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.sm,
  },

  statRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginHorizontal: space.md,
    marginBottom: space.md,
    marginTop: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  statDivider: {
    width: hairline,
    marginVertical: space.m,
    backgroundColor: colors.borderOnDark,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.m,
    minHeight: layout.minTouch + space.md,
    gap: 2,
  },
  statValue: {
    ...type.metricSm,
    fontFamily: fonts.bold,
    color: colors.onDark,
  },
  statValueZero: {
    color: colors.onDarkMuted,
  },
  statLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
});
