/**
 * FollowedSpotlight · FollowedHint — Maçlar listesinin tepesindeki takip
 * parçaları.
 *
 *   FollowedSpotlight  Takip edilen takımın CANLI ya da BUGÜNKÜ maçı; ekranın
 *                      tek sahnesi (`MatchStage`). Takımın o gün maçı yoksa
 *                      vitrin YOKTUR — yedek uydurulmaz (ekran bunun yerine
 *                      öne çıkan canlı maçı gösterebilir).
 *   FollowedHint       "Takip ettiklerin" grubu boşken çizilen kart.
 *                      · `invite` (hiç takip yok): davetkâr cam kart — degrade
 *                        yıldız karosu, iki satır gerekçe, birincil düğme ve
 *                        takip edince ne kazanılacağını söyleyen üç küçük hap.
 *                      · `quiet` (takip var ama o gün maç yok): tek satırlık
 *                        sakin bilgi satırı; yer kaplamaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, IconTile, Touchable } from "@/components/ui";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { MatchStage } from "./MatchStage";

export interface FollowedSpotlightProps {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  onOpen: (match: ApiMatch) => void;
}

export const FollowedSpotlight = memo(function FollowedSpotlight({
  match,
  homeLogo,
  awayLogo,
  onOpen,
}: FollowedSpotlightProps) {
  const state = matchState(match);
  // Etiket "Canlı" OLAMAZ: rozet zaten "CANLI" yazıyor.
  const eyebrow =
    state === "live" ? "Takımın sahada" : state === "scheduled" ? "Takımının bugünkü maçı" : "Takımın bugün oynadı";

  return (
    <MatchStage
      match={match}
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      eyebrow={eyebrow}
      onOpen={onOpen}
      testID="scores-spotlight"
    />
  );
});

export interface FollowedHintProps {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  /** `invite`: hiç takip yokken davet kartı; `quiet` (varsayılan): tek satır. */
  variant?: "invite" | "quiet";
}

const PERKS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "football-outline", label: "Gol bildirimi" },
  { icon: "flash-outline", label: "Maçın en üstte" },
  { icon: "trophy-outline", label: "Sonuç özeti" },
];

export const FollowedHint = memo(function FollowedHint({
  text,
  actionLabel,
  onAction,
  variant = "quiet",
}: FollowedHintProps) {
  if (variant === "invite") {
    return (
      <View style={styles.invite} testID="followed-hint">
        <View style={styles.inviteHead}>
          <IconTile icon="star" tone="signature" size={44} />
          <View style={styles.flex}>
            <Text style={styles.inviteOverline} {...textScale.badge}>
              {upperTR(text)}
            </Text>
            <Text style={styles.inviteTitle} numberOfLines={2} {...textScale.dense}>
              Takımını seç, maçı kaçırma
            </Text>
          </View>
        </View>
        <Text style={styles.inviteBody} {...textScale.long}>
          Takip ettiğin takımın maçı her gün listenin tepesinde, canlıysa sahnede durur.
        </Text>
        <View style={styles.perks}>
          {PERKS.map((perk) => (
            <View key={perk.label} style={styles.perk}>
              <Ionicons name={perk.icon} size={12} color={colors.brandAccent} />
              <Text style={styles.perkText} numberOfLines={1} {...textScale.badge}>
                {perk.label}
              </Text>
            </View>
          ))}
        </View>
        {actionLabel && onAction ? (
          <Button label={actionLabel} icon="star-outline" size="md" onPress={onAction} fullWidth />
        ) : null}
      </View>
    );
  }

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={onAction}
      disabled={!onAction}
      accessibilityRole="button"
      accessibilityLabel={actionLabel ? `${text}. ${actionLabel}` : text}
      style={styles.quiet}
      testID="followed-hint"
    >
      <IconTile icon="star" tone="neutral" size={28} glow={false} />
      <Text style={styles.quietText} numberOfLines={1} {...textScale.dense}>
        {text}
      </Text>
      {actionLabel ? (
        <Text style={styles.quietAction} {...textScale.dense}>
          {actionLabel}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
    </Touchable>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },

  invite: {
    marginTop: space.xl,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  inviteHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  inviteOverline: {
    ...type.overline,
    color: colors.brandAccent,
  },
  inviteTitle: {
    ...type.h2,
    color: colors.textPrimary,
    marginTop: space.xxs,
  },
  inviteBody: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  perks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  perk: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
  },
  perkText: {
    ...type.labelXs,
    color: colors.textPrimary,
  },

  quiet: {
    marginTop: space.md,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  quietText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  quietAction: {
    ...type.label,
    color: colors.brandAccent,
  },
});
