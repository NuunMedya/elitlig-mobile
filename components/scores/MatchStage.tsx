/**
 * MatchStage — Maçlar ekranının tek SAHNESİ: öne çıkan maç, koyu mor sahnede.
 *
 *   ┌────────────────────────────────────────────┐
 *   │ ● CANLI  ÖNE ÇIKAN MAÇ            FREELİG ›│  bağlam
 *   │                                            │
 *   │   ◆◆◆          3 – 1           ◆◆◆          │  amblem · DEV SKOR · amblem
 *   │  EMA FC        ( 34' )       DOSTLAR FC    │  dakika halkası
 *   │ ────────────────────────────────────────── │
 *   │ ⌖ Eryaman Halısaha        +3 canlı maç ›   │  alt şerit
 *   └────────────────────────────────────────────┘
 *
 * ZEMİN: `gradientInk` + `<Aurora variant="stage">` (iki temada da koyu, metin
 * beyaz). Canlıyken kenarda `GlowRim` dolaşır.
 *
 * DAKİKA: liste yanıtı dakika taşımaz; halka BAŞLAMA SAATİNDEN geçen süreyle
 * çizilir (tahmini — erişilebilirlik etiketi de "yaklaşık" der). Başlama
 * saati yoksa ya da tutarsızsa (negatif / 2 saati aşan) halka "—" gösterir.
 *
 * DURUMLAR: canlı → skor + dakika halkası; fikstür → büyük saat + "2 sa 15 dk
 * sonra"; bitti → skor + MS pulu, kaybeden soluk.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Aurora, GlowRim, LiveBadge, MinuteRing, Reveal, ScoreFlash, TeamLogo, Touchable } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";
import { colors, fonts, hairline, radius, space, textScale, type, upperTR } from "@/theme";
import { kickoff } from "./scoreUtils";

export interface MatchStageProps {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  /** Üst satırdaki etiket: "Öne çıkan maç", "Takımın sahada". */
  eyebrow: string;
  onOpen: (match: ApiMatch) => void;
  /** Alt şeritte "+N canlı maç" kısayolu (Tümü segmentinde). */
  moreLive?: number;
  onMoreLive?: () => void;
  testID?: string;
}

const CREST = 52;
/** Başlama saatinden tahmini dakika — 2 saati aşan ya da negatif değer güvenilmez. */
const MAX_PLAUSIBLE_MIN = 120;

function estimateMinute(match: ApiMatch): number | null {
  const start = kickoff(match);
  if (!start || !match.time) return null;
  const elapsed = Math.floor((Date.now() - start) / 60_000) + 1;
  if (elapsed < 1 || elapsed > MAX_PLAUSIBLE_MIN) return null;
  return elapsed;
}

/** Başlamaya kalan süre: "2 sa 15 dk sonra" / "15 dk sonra". Geçmişse boş. */
function countdown(match: ApiMatch): string {
  const start = kickoff(match);
  if (!start || !match.time) return "";
  const minutes = Math.round((start - Date.now()) / 60_000);
  if (minutes <= 0 || minutes > 24 * 60) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} dk sonra`;
  return m === 0 ? `${h} sa sonra` : `${h} sa ${m} dk sonra`;
}

export const MatchStage = memo(function MatchStage({
  match,
  homeLogo,
  awayLogo,
  eyebrow,
  onOpen,
  moreLive = 0,
  onMoreLive,
  testID,
}: MatchStageProps) {
  const state = matchState(match);
  const live = state === "live";
  const scheduled = state === "scheduled";
  const handlePress = useCallback(() => onOpen(match), [onOpen, match]);

  const home = Number(match.first_team_score ?? 0);
  const away = Number(match.second_team_score ?? 0);
  const homeLost = state === "finished" && home < away;
  const awayLost = state === "finished" && away < home;
  const minute = live ? estimateMinute(match) : null;
  const time = formatTime(match.time) || "—";
  const until = scheduled ? countdown(match) : "";

  const homeName = match.first_team_name || "Ev sahibi";
  const awayName = match.second_team_name || "Deplasman";

  const speech = scheduled
    ? `${eyebrow}: ${homeName} – ${awayName}, ${time}`
    : `${eyebrow}: ${homeName} ${home}, ${awayName} ${away}${live ? ", canlı" : ", maç sonu"}${
        minute != null ? `, yaklaşık ${minute}. dakika` : ""
      }`;

  return (
    <Reveal distance={14} scaleFrom={0.97} style={styles.wrap}>
      <Touchable
        feedback="card"
        haptic="selection"
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={speech}
        style={styles.card}
        testID={testID}
      >
        <LinearGradient
          colors={colors.gradientInk}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Aurora variant="stage" height={210} />
        {live ? <GlowRim radius={radius.xxl} /> : null}

        {/* — Bağlam satırı — */}
        <View style={styles.head}>
          {live ? (
            <LiveBadge onDark size="sm" />
          ) : (
            <View style={styles.statePill}>
              <Ionicons
                name={scheduled ? "time-outline" : "flag-outline"}
                size={11}
                color={colors.onDark}
              />
              <Text style={styles.statePillText} {...textScale.badge}>
                {upperTR(scheduled ? "Bugün" : "Maç sonu")}
              </Text>
            </View>
          )}
          <Text style={styles.eyebrow} numberOfLines={1} {...textScale.badge}>
            {upperTR(eyebrow)}
          </Text>
          {match.league_name ? (
            <View style={styles.leaguePill}>
              <Text style={styles.leagueText} numberOfLines={1} {...textScale.badge}>
                {upperTR(match.league_name)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* — Skor tahtası — */}
        <View style={styles.board}>
          <View style={styles.side}>
            <View style={styles.crestHalo}>
              <TeamLogo logo={homeLogo} name={homeName} size={CREST} onDark dimmed={homeLost} />
            </View>
            <Text style={[styles.team, homeLost ? styles.dim : null]} numberOfLines={2} {...textScale.dense}>
              {homeName}
            </Text>
          </View>

          <View style={styles.center}>
            {scheduled ? (
              <>
                <Text style={styles.time} numberOfLines={1} {...textScale.badge}>
                  {time}
                </Text>
                {until ? (
                  <View style={styles.untilPill}>
                    <Text style={styles.untilText} numberOfLines={1} {...textScale.badge}>
                      {until}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <ScoreFlash value={`${home}-${away}`} active={live}>
                  <Text style={styles.score} numberOfLines={1} {...textScale.badge}>
                    <Text style={awayLost ? null : homeLost ? styles.dim : null}>{home}</Text>
                    <Text style={styles.dash}>{" – "}</Text>
                    <Text style={awayLost ? styles.dim : null}>{away}</Text>
                  </Text>
                </ScoreFlash>
                {live && minute != null ? (
                  <MinuteRing minute={minute} size={42} thickness={3} onDark />
                ) : live ? (
                  /* Dakika tahmin edilemiyorsa boş halka yerine başlama saati. */
                  <View style={styles.msPill}>
                    <Text style={styles.msText} numberOfLines={1} {...textScale.badge}>
                      {upperTR(match.time ? `Başlama ${time}` : "Oynanıyor")}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.msPill}>
                    <Text style={styles.msText} {...textScale.badge}>
                      MS
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          <View style={styles.side}>
            <View style={styles.crestHalo}>
              <TeamLogo logo={awayLogo} name={awayName} size={CREST} onDark dimmed={awayLost} />
            </View>
            <Text style={[styles.team, awayLost ? styles.dim : null]} numberOfLines={2} {...textScale.dense}>
              {awayName}
            </Text>
          </View>
        </View>

        {/* — Alt şerit — */}
        <View style={styles.footer}>
          <Ionicons name="location-outline" size={13} color={colors.onDarkMuted} />
          <Text style={styles.footnote} numberOfLines={1} {...textScale.dense}>
            {[match.match_field, match.city].filter(Boolean).join(" · ") || (scheduled ? `Başlama ${time}` : time)}
          </Text>
          {moreLive > 0 && onMoreLive ? (
            <Touchable
              feedback="chip"
              haptic="selection"
              onPress={onMoreLive}
              accessibilityRole="button"
              accessibilityLabel={`${moreLive} canlı maç daha. Canlı maçları göster`}
              style={styles.morePill}
            >
              <View style={styles.moreDot} />
              <Text style={styles.moreText} numberOfLines={1} {...textScale.badge}>
                {`+${moreLive} canlı`}
              </Text>
              <Ionicons name="chevron-forward" size={12} color={colors.onDark} />
            </Touchable>
          ) : (
            <View style={styles.cta}>
              <Text style={styles.ctaText} {...textScale.badge}>
                {live ? "Canlı izle" : "Maça git"}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.brandOnDark} />
            </View>
          )}
        </View>
      </Touchable>
    </Reveal>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: space.md,
  },
  card: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderWidth: hairline,
    borderColor: colors.borderOnDark,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  statePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  statePillText: {
    ...type.micro,
    color: colors.onDark,
  },
  eyebrow: {
    ...type.overline,
    color: colors.onDarkMuted,
    flex: 1,
    minWidth: 0,
  },
  leaguePill: {
    maxWidth: 130,
    paddingHorizontal: space.sm,
    height: 20,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  leagueText: {
    ...type.micro,
    color: colors.onDark,
  },
  board: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  side: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space.sm,
  },
  crestHalo: {
    padding: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  team: {
    ...type.labelSm,
    fontFamily: fonts.bold,
    color: colors.onDark,
    textAlign: "center",
  },
  dim: {
    opacity: 0.5,
  },
  center: {
    minWidth: 118,
    alignItems: "center",
    gap: space.s,
    paddingTop: space.xs,
  },
  score: {
    ...type.scoreHero,
    color: colors.onDark,
  },
  dash: {
    color: colors.onDarkMuted,
  },
  time: {
    ...type.scoreLg,
    color: colors.onDark,
    marginTop: space.xs,
  },
  untilPill: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
  },
  untilText: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.onDark,
  },
  msPill: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  msText: {
    ...type.micro,
    color: colors.onDark,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 44,
    borderTopWidth: hairline,
    borderTopColor: colors.borderOnDark,
  },
  footnote: {
    ...type.caption,
    color: colors.onDarkMuted,
    flex: 1,
    minWidth: 0,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  ctaText: {
    ...type.label,
    color: colors.brandOnDark,
  },
  morePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 28,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  moreDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.liveOnDark,
  },
  moreText: {
    ...type.labelXs,
    color: colors.onDark,
  },
});
