/**
 * OYUNCU KİMLİK SAHNESİ — `ScreenHeader`ın `hero` yuvasına giren blok.
 *
 * Herkese açık profil (`/oyuncu/[id]`) ve üyenin kendi paneli (`/oyuncum`)
 * aynı kimliği gösterir; iki ekran aynı bileşeni kullanır.
 *
 * ANATOMİ (yukarıdan aşağıya):
 *   1. Fotoğraf (mevki renkli halka + forma no) · MEVKİ etiketi · AD ·
 *      kulüp hapı (dokununca takım sayfası) · künye satırı (şehir, yaş, sıra)
 *   2. Sayı şeridi — tek bir cam panelde, ince ayraçlarla bölünmüş 3–4 sayı.
 *      Eski tasarımda dört ayrı cam kutu vardı; dört kutu dört düğme gibi
 *      duruyordu. Tek panel "bunlar bir cümlenin parçaları" der.
 *   3. Eylem şeridi (takip et, takım sayfası …) — çağıran verir.
 *
 * İKİNCİ TUR: fotoğraf 96px, mevki renginden camgöbeğine akan degrade
 * halkada ve parıltılı; forma numarası halkanın sağ altında degrade rozet,
 * takım arması sol altta küçük rozet. Sayı şeridi dört cam karoya ayrıldı,
 * rakamlar `Odometer` ile döner; ortalama puan karosu reyting renginde ve
 * imza çizgisiyle vurgulu.
 *
 * KENDİ YÜZEYİ YOK: sahne gradyanı başlığındır (Arena §1.2 — sahne ekranda
 * bir kez). Bu bileşen yalnız ekran kenarı dolgusu ve iç ritmi taşır.
 *
 * RENK: sahne iki temada da koyu olduğu için mevki ve reyting renkleri daima
 * koyu temanın (açık tonlu) sürümünden okunur — bkz. `stageRatingColor`.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, Reveal, TeamLogo, Touchable } from "@/components/ui";
import { HaloFrame, StageStat } from "@/components/teampage/ProfileKit";
import { positionLabel, positionLine } from "@/lib/api/team";
import {
  colors,
  dark,
  glowStyle,
  hairline,
  layout,
  positionColor,
  positionLineLabel,
  radius,
  space,
  textScale,
  type,
  upperTR,
  type PositionLine,
} from "@/theme";
import { stageRatingColor } from "./shared";

/** Sayı şeridindeki tek hücre. Değeri olmayan hücre HİÇ verilmez — uydurma yok. */
export interface HeroFact {
  key: string;
  value: string;
  label: string;
  /** Verilirse rakam reyting tonuyla boyanır (ortalama puan hücresi). */
  rating?: number | null;
}

export interface PlayerHeroProps {
  name: string;
  image: string | null;
  /** Ham mevki: kod ("STP") ya da serbest metin ("Sol Bek"); yoksa null. */
  position: string | null;
  jersey?: number | null;
  teamName?: string | null;
  teamLogo?: string | null;
  onOpenTeam?: () => void;
  /** Künye parçaları ("Ankara", "27 yaş"); boş olanlar süzülür. */
  details?: (string | null | undefined)[];
  /** Künye satırının sonuna eklenen küçük rozetler (TR sırası, PASİF …). */
  badges?: React.ReactNode;
  facts: HeroFact[];
  actions?: React.ReactNode;
}

/** Fotoğraf çapı — sahnenin tek büyük görseli. */
const AVATAR = 92;

/** Bilinen sayı anahtarlarının ikonları — anahtar tanınmazsa ikon çizilmez. */
const FACT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  matches: "shirt",
  goals: "football",
  assists: "git-branch",
  rating: "star",
};

/* Degrade rozet yatay, sağdan sola (yüzey gradyanı kuralı). */
const BADGE_START = { x: 1, y: 0.5 };
const BADGE_END = { x: 0, y: 0.5 };

export const PlayerHero = React.memo(function PlayerHero({
  name,
  image,
  position,
  jersey,
  teamName,
  teamLogo,
  onOpenTeam,
  details,
  badges,
  facts,
  actions,
}: PlayerHeroProps) {
  /*
   * Mevki YOKSA hat da yok — `positionLine` boş girdide "MID" döndürür (saha
   * dizilişi için doğru varsayım), ama bilinmeyen bir oyuncuyu "Orta saha"
   * diye etiketlemek yanlış bilgi olurdu; halka o zaman imza degradesi kalır.
   */
  const line: PositionLine | null = useMemo(
    () => (position && String(position).trim() ? (positionLine(position) as PositionLine) : null),
    [position],
  );
  const lineColor = positionColor(dark, line);
  const ring: readonly [string, string] = line ? [lineColor, colors.gradientSignature[1]] : colors.gradientSignature;

  /* Etikette insan-okur ad: kod gelirse ("STP") karşılığı, metin gelirse kendisi. */
  const positionText = position ? positionLabel(String(position).trim()) : "";
  const detailText = (details ?? []).filter((part): part is string => Boolean(part)).join(" · ");

  return (
    <View style={styles.root}>
      <View style={styles.identity}>
        <Reveal scaleFrom={0.86} distance={0}>
          <View>
            <HaloFrame size={AVATAR} ring={ring} thickness={3} gap={3}>
              <Avatar name={name} image={image} size={AVATAR} />
            </HaloFrame>
            {jersey != null ? (
              <View style={[styles.jersey, glowStyle(colors.glow, 1)]} accessible accessibilityLabel={`Forma numarası ${jersey}`}>
                <LinearGradient colors={colors.gradientBrand} start={BADGE_START} end={BADGE_END} style={StyleSheet.absoluteFill} />
                <Text style={styles.jerseyText} {...textScale.badge}>
                  {jersey}
                </Text>
              </View>
            ) : null}
            {teamName ? (
              <View style={styles.crestBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <TeamLogo name={teamName} logo={teamLogo ?? null} size={22} plain onDark />
              </View>
            ) : null}
          </View>
        </Reveal>

        <View style={styles.body}>
          {/* MEVKİ ÜST ETİKET: mevki renginde kapsül. Mevki yoksa çizilmez. */}
          {line ? (
            <View
              style={[styles.positionChip, { borderColor: lineColor }]}
              accessible
              accessibilityLabel={`Mevki: ${positionText || positionLineLabel(line)}`}
            >
              <View style={[styles.positionDot, { backgroundColor: lineColor }]} />
              <Text style={[styles.positionText, { color: lineColor }]} numberOfLines={1} {...textScale.badge}>
                {upperTR(positionText || positionLineLabel(line))}
              </Text>
            </View>
          ) : null}

          <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
            {name}
          </Text>

          {/* KULÜP HAPI — dokununca takım sayfası. */}
          {teamName ? (
            <Touchable
              feedback="chip"
              haptic="selection"
              onPress={onOpenTeam}
              disabled={!onOpenTeam}
              accessibilityRole="link"
              accessibilityLabel={`${teamName} takım sayfası`}
              style={styles.teamPill}
            >
              <TeamLogo name={teamName} logo={teamLogo ?? null} size={18} plain onDark />
              <Text style={styles.teamName} numberOfLines={1} {...textScale.dense}>
                {teamName}
              </Text>
              {onOpenTeam ? <Ionicons name="chevron-forward" size={12} color={colors.onDarkMuted} /> : null}
            </Touchable>
          ) : null}

          {detailText || badges ? (
            <View style={styles.detailRow}>
              {detailText ? (
                <Text style={styles.detail} numberOfLines={1} {...textScale.dense}>
                  {detailText}
                </Text>
              ) : null}
              {badges}
            </View>
          ) : null}
        </View>
      </View>

      {facts.length ? (
        <View style={styles.strip}>
          {facts.map((fact) => (
            <StageStat
              key={fact.key}
              value={fact.value}
              label={fact.label}
              icon={FACT_ICON[fact.key]}
              color={fact.rating != null ? stageRatingColor(fact.rating) : undefined}
              highlight={fact.rating != null}
            />
          ))}
        </View>
      ) : null}

      {actions}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xs,
    paddingBottom: space.md,
    gap: space.lg,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
  },
  /* Forma numarası halkanın sağ altına biner: degrade rozet + parıltı. */
  jersey: {
    position: "absolute",
    right: -space.xs,
    bottom: space.xxs,
    minWidth: 30,
    height: 26,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.inkBlock,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Forma numarası bir SAYIDIR: Archivo, etiket fontu değil. */
  jerseyText: {
    ...type.tableNumStrong,
    color: colors.textOnBrand,
  },
  crestBadge: {
    position: "absolute",
    left: -space.xxs,
    bottom: space.xxs,
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.inkBlock,
    borderWidth: 1,
    borderColor: colors.inkPillBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  body: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    gap: space.s,
  },
  positionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.inkTile,
  },
  positionDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  positionText: {
    ...type.overline,
    flexShrink: 1,
  },
  name: {
    ...type.display,
    color: colors.onDark,
  },
  teamPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    maxWidth: "100%",
    paddingLeft: space.xs,
    paddingRight: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  teamName: {
    ...type.label,
    color: colors.onDark,
    flexShrink: 1,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.s,
  },
  detail: {
    ...type.caption,
    color: colors.onDarkMuted,
    flexShrink: 1,
  },

  /* — Sayı şeridi: dört cam karo — */
  strip: {
    flexDirection: "row",
    gap: space.sm,
  },
});
