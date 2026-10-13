/**
 * ProfileHero — Profil sekmesinin kimlik sahnesi.
 *
 * NEDEN SAHNE: Arena'da sahne (grafit) "kimlik ve skor anları" içindir ve
 * Profil'in tepesi kullanıcının KENDİ kimliğidir. Ekranın tek koyu yüzeyi
 * burasıdır; altındaki her şey kâğıttır (bkz. docs/arena-tasarim-dili.md §1.2).
 *
 * ÜÇ SAYI: takip edilen takım · lig/sezon · maç. Kullanıcının bu uygulamadaki
 * "hesap özeti" bunlardır ve hepsi cihazda saklandığı için misafirde de
 * gerçektir — uydurma bir istatistik yoktur. Her sayı takip ekranının ilgili
 * sekmesine götürür; yönetmek bir dokunuştur.
 *
 * MİSAFİRDE: kimlik yerine giriş çağrısı çizilir, sayılar yine görünür (takip
 * cihazdadır) — "giriş yapınca bunlar kaybolmaz" mesajını kendiliğinden verir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, Button, GradientFill, TeamLogo, Touchable } from "@/components/ui";
import { colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

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
  onAccount: () => void;
  onSignIn: () => void;
  onRegister: () => void;
}

export const ProfileHero = React.memo(function ProfileHero({
  user,
  stats,
  onAccount,
  onSignIn,
  onRegister,
}: ProfileHeroProps) {
  return (
    <View style={styles.stage}>
      <GradientFill tone="ink" radius="xxl" />
      {user ? <Identity user={user} onAccount={onAccount} /> : <Guest onSignIn={onSignIn} onRegister={onRegister} />}
      <View style={styles.statRow}>
        {stats.map((stat, index) => (
          <React.Fragment key={stat.key}>
            {index > 0 ? <View style={styles.statDivider} /> : null}
            <StatCell stat={stat} />
          </React.Fragment>
        ))}
      </View>
    </View>
  );
});

/* -------------------------------- KİMLİK -------------------------------- */

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
      <Avatar name={user.name} image={user.avatar} size={60} ring="brand" />
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

/* -------------------------------- MİSAFİR -------------------------------- */

const Guest = React.memo(function Guest({
  onSignIn,
  onRegister,
}: {
  onSignIn: () => void;
  onRegister: () => void;
}) {
  return (
    <View style={styles.guest}>
      <Text style={styles.overline} {...textScale.badge}>
        {upperTR("Misafir")}
      </Text>
      <Text style={styles.guestTitle} {...textScale.dense}>
        Ligini cebinde taşı
      </Text>
      <Text style={styles.guestBody} {...textScale.long}>
        Giriş yap; gol bildirimlerini al, takımınla yazış, sözleşme ve tekliflerini yönet.
      </Text>
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
      <Text style={[styles.statValue, stat.value === 0 ? styles.statValueZero : null]} {...textScale.dense}>
        {stat.value}
      </Text>
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
  identityBody: {
    flex: 1,
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

  guest: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.s,
  },
  overline: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  guestTitle: {
    ...type.display,
    color: colors.onDark,
  },
  guestBody: {
    ...type.bodySm,
    color: colors.onDarkMuted,
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
    borderRadius: radius.md,
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
