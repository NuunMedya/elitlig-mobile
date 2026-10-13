/**
 * BAŞARILAR — eşiklerden kendiliğinden kazanılan rozetler.
 *
 * Eski sürüm düz metin rozetleri yan yana diziyordu ("100 gol kulübü", "50+
 * maç"); rozetin NEDEN kazanıldığı yazmıyordu. Her rozet artık ikonlu bir
 * madalyon + başlık + kanıt satırıdır ("118 gol"). Kanıt satırı uydurma
 * değildir: eşiği tetikleyen gerçek sayıyı yazar.
 *
 * İKON PULU BİR KATEGORİ KİMLİĞİ TAŞIR (Arena §1.1 istisnası): ton rozetin
 * türünü söyler — sıralama zirvesi `warn` (altın), hacim `brand`, süreklilik
 * `info`, başarı oranı `win`.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { toneColors, type Tone } from "@/components/ui";
import { colors, radius, space, textScale, type } from "@/theme";
import { surfaces } from "./shared";

export interface Achievement {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  proof: string;
  tone: Tone;
}

/** Eşikler eski ekrandan korunmuştur; hiçbiri tutmazsa liste boş döner. */
export function buildAchievements({
  goals,
  matches,
  winRate,
  pointsRank,
  goalsRank,
}: {
  goals: number;
  matches: number;
  winRate: number | null;
  pointsRank: number | null;
  goalsRank: number | null;
}): Achievement[] {
  const list: Achievement[] = [];
  if (pointsRank === 1) {
    list.push({ key: "points", icon: "trophy", title: "Puan lideri", proof: "Puan sıralamasında 1.", tone: "warn" });
  }
  if (goalsRank === 1) {
    list.push({ key: "scorer", icon: "medal", title: "Gol kralı", proof: "Gol sıralamasında 1.", tone: "warn" });
  }
  if (goals >= 100) {
    list.push({ key: "goals", icon: "flame", title: "100 gol kulübü", proof: `${goals} gol`, tone: "brand" });
  } else if (goals >= 50) {
    list.push({ key: "goals", icon: "flame", title: "50+ gol", proof: `${goals} gol`, tone: "brand" });
  }
  if (matches >= 100) {
    list.push({ key: "matches", icon: "shield-checkmark", title: "100+ maç", proof: `${matches} maç`, tone: "info" });
  } else if (matches >= 50) {
    list.push({ key: "matches", icon: "shield-checkmark", title: "50+ maç", proof: `${matches} maç`, tone: "info" });
  }
  if (winRate != null && winRate >= 0.6 && matches >= 10) {
    list.push({
      key: "winrate",
      icon: "trending-up",
      title: "Kazanan",
      proof: `%${Math.round(winRate * 100)} galibiyet`,
      tone: "win",
    });
  }
  return list;
}

export const Achievements = React.memo(function Achievements({ items }: { items: Achievement[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const tone = toneColors(item.tone);
        return (
          <View
            key={item.key}
            style={[surfaces.card, styles.tile]}
            accessible
            accessibilityLabel={`Başarı: ${item.title}, ${item.proof}`}
          >
            <View style={[styles.medal, { backgroundColor: tone.dim }]}>
              <Ionicons name={item.icon} size={18} color={tone.fg} />
            </View>
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
                {item.title}
              </Text>
              <Text style={styles.proof} numberOfLines={1} {...textScale.dense}>
                {item.proof}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  /* İki sütun: gap'i düşerek yarım genişlik. */
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    padding: space.md,
  },
  medal: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    ...type.h4,
    color: colors.textPrimary,
  },
  proof: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
