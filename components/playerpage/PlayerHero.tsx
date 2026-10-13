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
 * KENDİ YÜZEYİ YOK: sahne gradyanı başlığındır (Arena §1.2 — sahne ekranda
 * bir kez). Bu bileşen yalnız ekran kenarı dolgusu ve iç ritmi taşır.
 *
 * RENK: sahne iki temada da koyu olduğu için mevki ve reyting renkleri daima
 * koyu temanın (açık tonlu) sürümünden okunur — bkz. `stageRatingColor`.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar, TeamLogo, Touchable } from "@/components/ui";
import { positionLabel, positionLine } from "@/lib/api/team";
import {
  colors,
  dark,
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

/** Fotoğraf çapı — sahnenin tek büyük görseli; 56 kimliği taşımıyordu. */
const AVATAR = 76;
const RING = 2;
const RING_GAP = 3;

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
   * diye etiketlemek yanlış bilgi olurdu; halka o zaman nötr kalır.
   */
  const line: PositionLine | null = useMemo(
    () => (position && String(position).trim() ? (positionLine(position) as PositionLine) : null),
    [position],
  );
  const lineColor = positionColor(dark, line);

  /* Etikette insan-okur ad: kod gelirse ("STP") karşılığı, metin gelirse kendisi. */
  const positionText = position ? positionLabel(String(position).trim()) : "";
  const detailText = (details ?? []).filter((part): part is string => Boolean(part)).join(" · ");

  return (
    <View style={styles.root}>
      <View style={styles.identity}>
        {/* Halka avatarın DIŞINDA: `borderWidth` verilseydi fotoğrafın görsel
            çapı küçülürdü. Ayrı bir kap ölçüyü sabit tutar. */}
        <View>
          <View style={[styles.ring, { borderColor: lineColor }]}>
            <Avatar name={name} image={image} size={AVATAR} />
          </View>
          {jersey != null ? (
            <View style={styles.jersey} accessible accessibilityLabel={`Forma numarası ${jersey}`}>
              <Text style={styles.jerseyText} {...textScale.badge}>
                {jersey}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          {/* MEVKİ ÜST ETİKET: mevki renginde nokta + tam ad. Üç harfli kod
              ("FOR") tam adın yanında aynı şeyi iki kez söylüyordu; kod
              yalnız dar listelerde (kadro satırı) işe yarar. Mevki yoksa
              satır hiç çizilmez. */}
          {line ? (
            <View
              style={styles.positionRow}
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

          {/* KULÜP HAPI — sahnede hap dili dokunulan şeye ayrılmıştır; kulüp
              adı takım sayfasına götürdüğü için haptır, düz metin değil. */}
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
              {onOpenTeam ? (
                <Ionicons name="chevron-forward" size={12} color={colors.onDarkMuted} />
              ) : null}
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
          {facts.map((fact, index) => (
            <View
              key={fact.key}
              style={[styles.cell, index > 0 && styles.cellDivider]}
              accessible
              accessibilityLabel={`${fact.label.toLocaleLowerCase("tr-TR")} ${fact.value}`}
            >
              <Text
                style={[
                  styles.cellValue,
                  fact.rating != null ? { color: stageRatingColor(fact.rating) } : null,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                {...textScale.dense}
              >
                {fact.value}
              </Text>
              <Text style={styles.cellLabel} numberOfLines={1} {...textScale.badge}>
                {fact.label}
              </Text>
            </View>
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
  ring: {
    width: AVATAR + (RING + RING_GAP) * 2,
    height: AVATAR + (RING + RING_GAP) * 2,
    borderRadius: radius.pill,
    borderWidth: RING,
    padding: RING_GAP,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Forma numarası halkanın sağ altına biner; mürekkep zemin + ince cam
     kenar onu hem fotoğraftan hem halkadan ayırır. Dokunulmaz → hap değil. */
  jersey: {
    position: "absolute",
    right: -space.xxs,
    bottom: 0,
    minWidth: 24,
    height: 22,
    paddingHorizontal: space.xs,
    borderRadius: radius.xs,
    backgroundColor: colors.inkBlock,
    borderWidth: 1,
    borderColor: colors.inkPillBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Forma numarası bir SAYIDIR: Archivo, etiket fontu değil. */
  jerseyText: {
    ...type.tableNumStrong,
    color: colors.onDark,
  },
  body: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    gap: space.s,
  },
  positionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
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

  /* — Sayı şeridi: tek cam panel, hücreler ince ayraçla — */
  strip: {
    flexDirection: "row",
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    paddingVertical: space.m,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: space.xs,
    gap: space.xxs,
  },
  cellDivider: {
    borderLeftWidth: hairline,
    borderLeftColor: colors.borderOnDark,
  },
  cellValue: {
    ...type.metric,
    color: colors.onDark,
  },
  cellLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
});
