/**
 * OYUNCU MAÇ GEÇMİŞİ — son 5 maç (hangi takımda oynadığıyla).
 *
 * Veri: GET /api/team-management/squad-list → players[].history
 * (sunucu: services/playerAppearanceService.js). Web'deki
 * src/components/PlayerMatchHistory.js'in mobil karşılığıdır.
 *
 *  LastMatchesStrip  Kadro satırına sığan şerit: en yeni maç solda, her maç
 *                    sonuç harfli (G/B/M) kare. Başka takımda oynanan maç
 *                    turuncu çerçeveli — renk sinyaldir, harf okunur.
 *  LastMatchesList   Alt sayfada ayrıntı: tarih, takım (başka takımsa etiket),
 *                    rakip, skor ve gol.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PlayerMatch } from "@/lib/api/team";
import { colors, fonts, radius, space, textScale, type } from "@/theme";

type Result = "G" | "B" | "M";

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

const parse = (value: string | null | undefined) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`) : null);

/** "12 Eki" — yıl bu yıl değilse "12 Eki 25". */
export function shortDate(value: string | null | undefined): string {
  const d = parse(value);
  if (!d || Number.isNaN(d.getTime())) return "—";
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${String(d.getFullYear()).slice(2)}`;
}

/** "5 gün önce", "2 ay önce". */
export function daysAgo(value: string | null | undefined): string | null {
  const d = parse(value);
  if (!d) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "bugün";
  if (days < 31) return `${days} gün önce`;
  if (days < 365) return `${Math.floor(days / 30)} ay önce`;
  return `${Math.floor(days / 365)} yıl önce`;
}

function resultOf(match: PlayerMatch): Result | null {
  if (match.team_score == null || match.opponent_score == null) return null;
  if (match.team_score > match.opponent_score) return "G";
  return match.team_score < match.opponent_score ? "M" : "B";
}

const RESULT_TONE: Record<Result, { bg: string; fg: string; speech: string }> = {
  G: { bg: colors.winDim, fg: colors.win, speech: "galibiyet" },
  B: { bg: colors.drawDim, fg: colors.draw, speech: "beraberlik" },
  M: { bg: colors.lossDim, fg: colors.loss, speech: "mağlubiyet" },
};

const isOwn = (match: PlayerMatch, teamId: number | null | undefined) =>
  teamId != null && Number(match.team_id) === Number(teamId);

/** Kadro satırındaki kompakt şerit. */
export const LastMatchesStrip = React.memo(function LastMatchesStrip({
  matches,
  teamId,
}: {
  matches: PlayerMatch[];
  teamId: number | null | undefined;
}) {
  if (!matches.length) return null;
  const speech = matches
    .map((m) => `${shortDate(m.date)} ${m.team_name ?? "takım belirsiz"}${resultOf(m) ? ` ${RESULT_TONE[resultOf(m) as Result].speech}` : ""}`)
    .join(", ");
  return (
    <View style={styles.strip} accessible accessibilityLabel={`Son ${matches.length} maç: ${speech}`}>
      {matches.map((m) => {
        const result = resultOf(m);
        const tone = result ? RESULT_TONE[result] : null;
        return (
          <View
            key={m.match_id}
            style={[
              styles.cell,
              { backgroundColor: tone?.bg ?? colors.surface3 },
              isOwn(m, teamId) ? null : styles.cellOther,
            ]}
          >
            <Text style={[styles.cellText, { color: tone?.fg ?? colors.textTertiary }]} {...textScale.badge}>
              {result ?? "–"}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

/** Alt sayfadaki ayrıntılı liste. */
export function LastMatchesList({
  matches,
  teamId,
}: {
  matches: PlayerMatch[];
  teamId: number | null | undefined;
}) {
  if (!matches.length) {
    return (
      <Text style={styles.empty} {...textScale.dense}>
        Kayıtlı maçı yok.
      </Text>
    );
  }
  return (
    <View style={styles.list}>
      {matches.map((m) => {
        const result = resultOf(m);
        const own = isOwn(m, teamId);
        return (
          <View key={m.match_id} style={[styles.item, own ? null : styles.itemOther]}>
            <Text style={styles.itemDate} {...textScale.badge}>
              {shortDate(m.date)}
            </Text>
            <View style={styles.itemTexts}>
              <View style={styles.itemTeamRow}>
                <Text style={styles.itemTeam} numberOfLines={1} {...textScale.dense}>
                  {m.team_name ?? "Takım belirsiz"}
                </Text>
                {own ? null : (
                  <Text style={styles.otherTag} {...textScale.badge}>
                    BAŞKA TAKIM
                  </Text>
                )}
              </View>
              <Text style={styles.itemMeta} numberOfLines={1} {...textScale.dense}>
                {[m.opponent_name ? `vs ${m.opponent_name}` : null, m.goals ? `${m.goals} gol` : null].filter(Boolean).join(" · ") || "—"}
              </Text>
            </View>
            {m.team_score != null && m.opponent_score != null ? (
              <View style={[styles.score, { backgroundColor: result ? RESULT_TONE[result].bg : colors.surface3 }]}>
                <Text style={[styles.scoreText, { color: result ? RESULT_TONE[result].fg : colors.textSecondary }]} {...textScale.badge}>
                  {m.team_score}-{m.opponent_score}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const CELL = 18;

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    gap: 3,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: radius.xs - 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  cellOther: {
    borderColor: colors.warn,
  },
  cellText: {
    ...type.nano,
  },
  empty: {
    ...type.caption,
    color: colors.textTertiary,
  },
  list: {
    gap: space.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingVertical: space.s,
    paddingHorizontal: space.m,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  itemOther: {
    backgroundColor: colors.warnDim,
  },
  itemDate: {
    ...type.caption,
    width: 46,
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
  },
  itemTexts: {
    flex: 1,
    gap: 1,
  },
  itemTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  itemTeam: {
    ...type.label,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  otherTag: {
    ...type.micro,
    color: colors.warn,
    fontFamily: fonts.semibold,
  },
  itemMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  score: {
    minWidth: 40,
    paddingHorizontal: space.s,
    paddingVertical: 3,
    borderRadius: radius.xs,
    alignItems: "center",
  },
  scoreText: {
    ...type.numSmStrong,
  },
});
