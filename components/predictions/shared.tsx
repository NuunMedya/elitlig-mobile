/**
 * Tahmin Ligi ortak parçaları: takım sütunu, başlama/kilit etiketi, sonuç
 * rozetinin anlamı ve "son tahminler"den türetilen isabet/seri özeti.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TeamLogo, type Tone } from "@/components/ui";
import type { PredictionMatch } from "@/lib/api/career";
import { formatDateShort, formatTime } from "@/lib/format";
import { colors, radius, space, textScale, type } from "@/theme";

export type Outcome = NonNullable<NonNullable<PredictionMatch["prediction"]>["outcome"]>;

/** Sonuç rozeti: kısa ad, puan, ton. Tek kaynak; liste ve kart aynı dili konuşur. */
export const OUTCOME: Record<Outcome, { label: string; short: string; tone: Tone; icon: keyof typeof Ionicons.glyphMap }> = {
  exact: { label: "Tam skor", short: "Tam skor", tone: "win", icon: "star" },
  diff: { label: "Sonuç + fark", short: "Fark", tone: "brand", icon: "checkmark-done" },
  result: { label: "Doğru sonuç", short: "Sonuç", tone: "brand", icon: "checkmark" },
  miss: { label: "Tutmadı", short: "Tutmadı", tone: "neutral", icon: "close" },
  void: { label: "Geçersiz", short: "Geçersiz", tone: "neutral", icon: "remove" },
};

/** "15 Kas · 19:00" */
export function kickoffLabel(match: Pick<PredictionMatch, "date" | "time">): string {
  return [formatDateShort(match.date), match.time ? formatTime(match.time) : null].filter(Boolean).join(" · ");
}

/** Başlamaya 48 saatten az kaldıysa "3 sa 20 dk kaldı" gibi kısa bir geri sayım. */
export function countdownLabel(match: Pick<PredictionMatch, "kickoff">, now: number = Date.now()): string | null {
  if (!match.kickoff) return null;
  const at = Date.parse(match.kickoff);
  if (!Number.isFinite(at)) return null;
  const ms = at - now;
  if (ms <= 0 || ms > 48 * 3600_000) return null;
  const hours = Math.floor(ms / 3600_000);
  const minutes = Math.floor((ms % 3600_000) / 60_000);
  if (hours >= 1) return `${hours} sa ${minutes} dk kaldı`;
  return `${Math.max(1, minutes)} dk kaldı`;
}

export interface FormSummary {
  /** Puanlanmış tahmin sayısı (geçersizler hariç). */
  graded: number;
  /** Puan alınan (sonuç ya da daha iyisi) tahmin sayısı. */
  hits: number;
  exact: number;
  points: number;
  /** En yeni maçtan geriye, puan alınan ardışık tahmin sayısı. */
  streak: number;
  accuracy: number | null;
}

/** Son maçlardaki tahminlerden form özeti (sunucu ek çağrı gerektirmez). */
export function summarizeForm(recent: PredictionMatch[]): FormSummary {
  const graded = recent.filter((m) => m.prediction?.outcome && m.prediction.outcome !== "void");
  const ordered = [...graded].sort((a, b) => (b.kickoff ?? b.date).localeCompare(a.kickoff ?? a.date));
  let streak = 0;
  for (const m of ordered) {
    if (m.prediction?.outcome === "miss") break;
    streak += 1;
  }
  const hits = graded.filter((m) => m.prediction?.outcome !== "miss").length;
  return {
    graded: graded.length,
    hits,
    exact: graded.filter((m) => m.prediction?.outcome === "exact").length,
    points: graded.reduce((sum, m) => sum + (m.prediction?.points ?? 0), 0),
    streak,
    accuracy: graded.length ? Math.round((hits / graded.length) * 100) : null,
  };
}

/** Kartın iki yanındaki takım sütunu: amblem üstte, ad altta (iki satıra kadar). */
export const TeamColumn = memo(function TeamColumn({ name, dimmed = false }: { name: string; dimmed?: boolean }) {
  return (
    <View style={styles.team}>
      <TeamLogo name={name} size={40} dimmed={dimmed} />
      <Text style={[styles.teamName, dimmed && styles.teamDim]} numberOfLines={2} {...textScale.dense}>
        {name}
      </Text>
    </View>
  );
});

/** Küçük durum hapı: ikon + metin. Kilit, canlı, açık. */
export function StatePill({
  icon,
  label,
  tone = "neutral",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: "neutral" | "brand" | "live" | "win";
}) {
  const fg = tone === "brand" ? colors.brandAccent : tone === "live" ? colors.live : tone === "win" ? colors.win : colors.textTertiary;
  const bg = tone === "brand" ? colors.brandDim : tone === "live" ? colors.liveDim : tone === "win" ? colors.winDim : colors.surface3;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={12} color={fg} />
      <Text style={[styles.pillText, { color: fg }]} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  team: { flex: 1, alignItems: "center", gap: space.s, minWidth: 0 },
  teamName: { ...type.labelSm, color: colors.textPrimary, textAlign: "center" },
  teamDim: { color: colors.textSecondary },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pillText: { ...type.micro },
});
