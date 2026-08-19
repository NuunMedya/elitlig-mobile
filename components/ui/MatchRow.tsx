/**
 * MatchRow — maç listesinin tek satırı. Sistemin görsel kalbi.
 *
 * DÜZEN (SofaScore kalıbı, §4.12): ortalanmış "TAKIM — SKOR — TAKIM" kartı
 * yerine SOLA HİZALI sütunlar:
 *
 *   ┌ 44 ┬────────── flex ──────────┬ 30 ┬ 32 ┐
 *   │20:30│ ◆ Kartalspor            │ 2 │  ☆ │
 *   │ 67' │ ◆ Yıldızspor            │ 1 │    │
 *   └─────┴──────────────────────────┴────┴────┘
 *
 * NEDEN: göz listeyi tek bir dikey eksende tarar — saat sütunu, takım sütunu ve
 * skor sütunu her satırda AYNI yerdedir. Ortalı kartta her satırda takım adının
 * uzunluğuna göre skorun yeri kayıyor ve 10 maçlık bir liste okunmuyordu.
 *
 * SABİT YÜKSEKLİK ŞART: yüzlerce satırlık listede `getItemLayout` olmadan
 * kaydırma tökezliyor. Bu yüzden yükseklik varyanta göre SABİTTİR ve
 * `matchRowHeight()` ile dışarı verilir; çağıran taraf aynı formülü kullanır.
 *
 * PERFORMANS: bileşen `memo`'lu, tüm stiller `StyleSheet` içinde, render
 * sırasında nesne üretilmiyor (stil dizileri `useMemo` ile tutuluyor). Skor
 * flash'ı `useNativeDriver: true` ile çalışır: zemin rengi animasyonlanamadığı
 * için sabit renkli MUTLAK ÖRTÜNÜN opaklığı animasyonlanır (§5.4).
 */

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { colors, duration, layout, radius, space, textScale, touchSlop, type } from "@/theme";
import { haptics } from "@/lib/haptics";
import { formatScore, formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";
import { LiveBadge, useReduceMotion } from "./LiveBadge";
import { TeamLogo } from "./TeamLogo";

export type MatchRowVariant = "default" | "compact";
export type MatchRowMetaMode = "field" | "league" | "none";
export type MatchRowPosition = "single" | "first" | "middle" | "last";

export interface MatchRowProps {
  match: ApiMatch;
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** Grup içi konum — ayraç/köşe */
  position?: MatchRowPosition;
  /** Yıldız sütununu göster (varsayılan true) */
  showFavorite?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Kompakt: tek satır, 48px (profil "son maçlar" listesi) */
  variant?: MatchRowVariant;
  /** Saha adı ya da lig adı — satırın üstünde mikro etiket */
  metaMode?: MatchRowMetaMode;
  onPress?: () => void;
  /** Canlı skor değişiminde flash tetiklemesi */
  flashOnScoreChange?: boolean;
  /** Canlı dakika (soket/sayaçtan gelir; maç kaydında bu alan yoktur) */
  minute?: number | null;
  /** Uzatma dakikası — 45+2 */
  addedTime?: number | null;
  /** Devre arası */
  halftime?: boolean;
  /** Kullanıcının takımı — adın solunda 3px marka rayı ve vurgulu ad */
  myTeamId?: number | null;
  myTeamName?: string | null;
}

/** Sabit satır yükseklikleri — `getItemLayout` bunlardan hesaplanır. */
export const MATCH_ROW_HEIGHT = layout.matchRowHeight;
export const MATCH_ROW_HEIGHT_COMPACT = layout.matchRowHeightCompact;
/** Meta satırı (saha/lig) 12px ekler. */
export const MATCH_ROW_META_HEIGHT = 12;

/**
 * Satır yüksekliği. Bir listede varyant ve metaMode tüm satırlarda aynı olduğu
 * için sonuç sabittir; `getItemLayout` bu değerle kurulur.
 */
export function matchRowHeight(
  variant: MatchRowVariant = "default",
  metaMode: MatchRowMetaMode = "none",
): number {
  const base = variant === "compact" ? MATCH_ROW_HEIGHT_COMPACT : MATCH_ROW_HEIGHT;
  return metaMode === "none" ? base : base + MATCH_ROW_META_HEIGHT;
}

/**
 * Skor değişimi parlaması. Skor DEĞİŞTİĞİNDE (ilk render'da değil) satır 900ms
 * boyunca `live` rengiyle parlar ve rakam 1 → 1.14 → 1 ölçeklenir.
 * "Hareketi azalt" açıksa hiç tetiklenmez.
 */
function useScoreFlash(scoreKey: string, enabled: boolean) {
  const flash = useRef(new Animated.Value(0)).current;
  const previous = useRef(scoreKey);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (previous.current === scoreKey) return;
    previous.current = scoreKey;
    if (!enabled || reduceMotion) return;

    flash.setValue(0);
    const run = Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(flash, {
        toValue: 0,
        duration: duration.flash - 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    run.start();
    return () => run.stop();
  }, [scoreKey, enabled, flash, reduceMotion]);

  return useMemo(
    () => ({
      overlayOpacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.14] }),
      numberScale: flash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }),
    }),
    [flash],
  );
}

const sameTeam = (
  teamId: number | null | undefined,
  teamName: string | null | undefined,
  myTeamId: number | null | undefined,
  myTeamName: string | null | undefined,
): boolean => {
  if (myTeamId != null && teamId != null) return Number(myTeamId) === Number(teamId);
  if (!myTeamName || !teamName) return false;
  return myTeamName.trim().toLocaleLowerCase("tr-TR") === teamName.trim().toLocaleLowerCase("tr-TR");
};

export const MatchRow = memo(function MatchRow({
  match,
  homeLogo,
  awayLogo,
  position = "single",
  showFavorite = true,
  isFavorite = false,
  onToggleFavorite,
  variant = "default",
  metaMode = "none",
  onPress,
  flashOnScoreChange = false,
  minute,
  addedTime,
  halftime = false,
  myTeamId,
  myTeamName,
}: MatchRowProps) {
  const state = matchState(match);
  const live = state === "live";
  const finished = state === "finished";
  const played = state !== "scheduled";

  const homeScore = Number(match.first_team_score ?? 0);
  const awayScore = Number(match.second_team_score ?? 0);
  const homeWon = played && homeScore > awayScore;
  const awayWon = played && awayScore > homeScore;

  const { overlayOpacity, numberScale } = useScoreFlash(
    `${match.first_team_score ?? ""}-${match.second_team_score ?? ""}`,
    flashOnScoreChange && live,
  );

  const compact = variant === "compact";
  const metaText =
    metaMode === "field" ? match.match_field : metaMode === "league" ? match.league_name : null;
  const hasMeta = metaMode !== "none" && Boolean(metaText);

  const homeMine = sameTeam(match.home_team_id, match.first_team_name, myTeamId, myTeamName);
  const awayMine = sameTeam(match.away_team_id, match.second_team_name, myTeamId, myTeamName);

  const rowStyle = useMemo<StyleProp<ViewStyle>[]>(() => {
    const list: StyleProp<ViewStyle>[] = [styles.row, compact ? styles.rowCompact : styles.rowDefault];
    if (hasMeta) list.push(compact ? styles.rowCompactMeta : styles.rowDefaultMeta);
    if (position === "first") list.push(styles.cornersTop);
    if (position === "last") list.push(styles.cornersBottom);
    if (position === "single") list.push(styles.cornersAll);
    return list;
  }, [compact, hasMeta, position]);

  const pressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => (pressed ? [rowStyle, styles.rowPressed] : rowStyle),
    [rowStyle],
  );

  const handleFavorite = useCallback(() => {
    haptics.light();
    onToggleFavorite?.();
  }, [onToggleFavorite]);

  const speech = useMemo(() => {
    const teams = `${match.first_team_name} - ${match.second_team_name}`;
    if (live) {
      const clock = halftime ? "devre arası" : minute != null ? `${minute}. dakika` : "";
      return `Canlı${clock ? `, ${clock}` : ""}. ${teams}. Skor ${homeScore} ${awayScore}`;
    }
    if (played) return `Maç sonucu. ${teams}. Skor ${homeScore} ${awayScore}`;
    return `${formatTime(match.time)}. ${teams}`;
  }, [live, played, halftime, minute, homeScore, awayScore, match.first_team_name, match.second_team_name, match.time]);

  return (
    <Pressable
      style={pressableStyle}
      onPress={onPress}
      disabled={!onPress}
      android_ripple={ANDROID_RIPPLE}
      accessibilityRole="button"
      accessibilityLabel={speech}
    >
      {/* Gol parlaması: zemin rengi yerel sürücüyle animasyonlanamaz, sabit
          renkli örtünün opaklığı animasyonlanır. */}
      <Animated.View pointerEvents="none" style={[styles.flash, { opacity: overlayOpacity }]} />

      {hasMeta ? (
        <Text style={styles.meta} numberOfLines={1} {...textScale.badge}>
          {metaText}
        </Text>
      ) : null}

      <View style={styles.main}>
        <View style={styles.timeColumn}>
          {live ? (
            /* Dakika 44px sütuna yatay sığmıyor: rozet DİKEY kurulur —
               üstte dakika/İY/CANLI, altında nabız noktası. */
            <>
              <Text
                style={halftime ? styles.halftimeWord : minute != null ? styles.minute : styles.liveWord}
                {...textScale.badge}
              >
                {halftime ? "İY" : minute != null ? `${minute}${addedTime ? `+${addedTime}` : ""}'` : "CANLI"}
              </Text>
              <View
                style={styles.minuteDot}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <LiveBadge compact halftime={halftime} />
              </View>
            </>
          ) : played ? (
            <Text style={styles.stateLabel} {...textScale.badge}>
              MS
            </Text>
          ) : (
            <Text style={styles.time} {...textScale.badge}>
              {formatTime(match.time)}
            </Text>
          )}
        </View>

        {compact ? (
          <View style={styles.compactBody}>
            <TeamLogo name={match.first_team_name} logo={homeLogo} size={16} dimmed={finished && awayWon} />
            <Text
              style={[styles.teamName, homeWon && styles.teamNameWinner, finished && awayWon && styles.teamNameDim]}
              numberOfLines={1}
              {...textScale.dense}
            >
              {match.first_team_name}
            </Text>
            <Text style={[styles.compactScore, live && styles.compactScoreLive]} {...textScale.dense}>
              {played ? `${formatScore(match.first_team_score)} - ${formatScore(match.second_team_score)}` : "-"}
            </Text>
            <Text
              style={[
                styles.teamName,
                styles.teamNameRight,
                awayWon && styles.teamNameWinner,
                finished && homeWon && styles.teamNameDim,
              ]}
              numberOfLines={1}
              {...textScale.dense}
            >
              {match.second_team_name}
            </Text>
            <TeamLogo name={match.second_team_name} logo={awayLogo} size={16} dimmed={finished && homeWon} />
          </View>
        ) : (
          <>
            <View style={styles.teamColumn}>
              <TeamLine
                name={match.first_team_name}
                logo={homeLogo}
                winner={homeWon}
                dimmed={finished && awayWon}
                mine={homeMine}
              />
              <TeamLine
                name={match.second_team_name}
                logo={awayLogo}
                winner={awayWon}
                dimmed={finished && homeWon}
                mine={awayMine}
              />
            </View>

            <View style={styles.scoreColumn}>
              {played ? (
                <>
                  <Animated.Text
                    style={[
                      styles.score,
                      live && styles.scoreLive,
                      finished && awayWon && styles.scoreDim,
                      { transform: [{ scale: numberScale }] },
                    ]}
                    {...textScale.dense}
                  >
                    {homeScore}
                  </Animated.Text>
                  <Animated.Text
                    style={[
                      styles.score,
                      live && styles.scoreLive,
                      finished && homeWon && styles.scoreDim,
                      { transform: [{ scale: numberScale }] },
                    ]}
                    {...textScale.dense}
                  >
                    {awayScore}
                  </Animated.Text>
                </>
              ) : null}
            </View>
          </>
        )}

        {showFavorite && onToggleFavorite ? (
          <Pressable
            style={styles.starColumn}
            onPress={handleFavorite}
            hitSlop={STAR_SLOP}
            accessibilityRole="button"
            accessibilityState={{ selected: isFavorite }}
            accessibilityLabel={isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
          >
            <Ionicons
              name={isFavorite ? "star" : "star-outline"}
              size={17}
              color={isFavorite ? colors.star : colors.starEmpty}
            />
          </Pressable>
        ) : showFavorite ? (
          /* Favori eylemi verilmediyse sütun boş kalır: satırlar arası hiza bozulmasın. */
          <View style={styles.starColumn} />
        ) : null}
      </View>

      {position !== "last" && position !== "single" ? <View style={styles.divider} /> : null}
    </Pressable>
  );
});

/** Tek takım satırı: amblem + (kullanıcının takımıysa ray) + ad. */
const TeamLine = memo(function TeamLine({
  name,
  logo,
  winner,
  dimmed,
  mine,
}: {
  name: string;
  logo?: string | null;
  winner: boolean;
  dimmed: boolean;
  mine: boolean;
}) {
  return (
    <View style={styles.teamLine}>
      <TeamLogo name={name} logo={logo} size={20} dimmed={dimmed} />
      {mine ? <View style={styles.rail} /> : null}
      <Text
        style={[
          styles.teamName,
          winner && styles.teamNameWinner,
          dimmed && styles.teamNameDim,
          mine && styles.teamNameMine,
        ]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {name}
      </Text>
    </View>
  );
});

const ANDROID_RIPPLE = { color: colors.ripple } as const;
const STAR_SLOP = touchSlop(17);

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface1,
    paddingHorizontal: layout.rowPaddingH,
    justifyContent: "center",
    // Flash örtüsü ve ayraç, grubun ilk/son satırındaki yuvarlak köşelerin
    // dışına taşmasın.
    overflow: "hidden",
  },
  rowDefault: { height: MATCH_ROW_HEIGHT },
  rowDefaultMeta: { height: MATCH_ROW_HEIGHT + MATCH_ROW_META_HEIGHT },
  rowCompact: { height: MATCH_ROW_HEIGHT_COMPACT },
  rowCompactMeta: { height: MATCH_ROW_HEIGHT_COMPACT + MATCH_ROW_META_HEIGHT },
  rowPressed: {
    backgroundColor: colors.pressed,
  },
  cornersTop: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  cornersBottom: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  cornersAll: {
    borderRadius: radius.lg,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.live,
  },
  meta: {
    ...type.micro,
    color: colors.textTertiary,
    height: MATCH_ROW_META_HEIGHT,
    marginLeft: layout.timeColumnWidth,
  },
  main: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeColumn: {
    width: layout.timeColumnWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  time: {
    ...type.clock,
    color: colors.textSecondary,
  },
  minute: {
    ...type.clock,
    color: colors.live,
  },
  minuteDot: {
    marginTop: 3,
  },
  stateLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  liveWord: {
    ...type.micro,
    color: colors.live,
  },
  halftimeWord: {
    ...type.micro,
    color: colors.textTertiary,
  },
  teamColumn: {
    flex: 1,
    justifyContent: "center",
  },
  teamLine: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  /** Kullanıcının takımı — adın solunda 3px marka rayı. */
  rail: {
    width: 3,
    height: 14,
    borderRadius: 1.5,
    backgroundColor: colors.brand,
    marginRight: -space.xxs,
  },
  teamName: {
    ...type.body,
    color: colors.textPrimary,
    flexShrink: 1,
    flexGrow: 1,
  },
  teamNameWinner: {
    fontWeight: "700",
  },
  teamNameDim: {
    color: colors.textTertiary,
  },
  teamNameMine: {
    color: colors.brandAccent,
  },
  teamNameRight: {
    textAlign: "right",
  },
  scoreColumn: {
    width: layout.scoreColumnWidth,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  score: {
    ...type.scoreMd,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  scoreLive: {
    ...type.scoreLg,
    lineHeight: 24,
    color: colors.live,
  },
  scoreDim: {
    color: colors.textTertiary,
  },
  compactBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  compactScore: {
    ...type.scoreSm,
    color: colors.textPrimary,
    minWidth: 44,
    textAlign: "center",
  },
  compactScoreLive: {
    color: colors.live,
  },
  starColumn: {
    width: layout.starColumnWidth,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  /** Ayraç saat sütununu atlar (12 + 44 = 56) ve yüksekliği etkilemez. */
  divider: {
    position: "absolute",
    left: 56,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
});
