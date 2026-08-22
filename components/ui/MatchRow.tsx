/**
 * MatchRow — maç listesinin tek satırı. Sistemin görsel kalbi.
 *
 * DÜZEN — TEK SATIR, SİMETRİK:
 *
 *   ┌ 38 ┬────── flex ──────┬ 46 ┬────── flex ──────┬ 24 ┐
 *   │19:30│ ◆ Kartalspor     │2–1 │ Yıldızspor ◆     │ ☆ │
 *   └─────┴──────────────────┴────┴──────────────────┴────┘
 *     saat   logo + ev (sağa)  skor  dep (sola) + logo  yıldız
 *
 * NEDEN İKİ SATIRDAN TEK SATIRA: eski düzen ev sahibini üste, deplasmanı alta
 * yazıyor ve satır başına 56px istiyordu. Aynı bilgi 40px'e sığıyor; bir
 * ekrana neredeyse iki kat maç giriyor. Skor ORTADA sabit genişlikli bir
 * blokta durduğu için göz, liste boyunca tek bir dikey ekseni takip eder —
 * iki satırlı düzende skor sağdaydı ve takım adlarının uzunluğu okuma eksenini
 * her satırda kaydırıyordu.
 *
 * NEDEN İÇE HİZALI: ev sahibinin adı SAĞA, deplasmanınki SOLA yaslanır; ikisi
 * de ortadaki skora yaslandığı için "ev – skor – deplasman" tek bir okuma
 * birimi olur. Amblemler dışta durur ve iki kenarda sabit bir ritim kurar.
 *
 * SABİT YÜKSEKLİK ŞART: yüzlerce satırlık listede `getItemLayout` olmadan
 * kaydırma tökezliyor. Bu yüzden yükseklik varyanta göre SABİTTİR ve
 * `matchRowHeight()` ile dışarı verilir; çağıran taraf aynı formülü kullanır.
 *
 * IŞIKLI YÜZEY: satır grubu `gradientCard` geçişini taşır (bkz. GradientFill).
 * Gradyan katmanı yerleşimi etkilemez, yalnız zemini boyar.
 *
 * PERFORMANS: bileşen `memo`'lu, tüm stiller `StyleSheet` içinde, render
 * sırasında nesne üretilmiyor. Skor flash'ı `useNativeDriver: true` ile
 * çalışır: zemin rengi animasyonlanamadığı için sabit renkli MUTLAK ÖRTÜNÜN
 * opaklığı animasyonlanır.
 */

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import {
  colors,
  duration,
  fonts,
  layout,
  radius,
  space,
  textScale,
  touchSlop,
  type,
} from "@/theme";
import { haptics } from "@/lib/haptics";
import { formatScore, formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";
import { GradientFill } from "./GradientFill";
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
/** Meta satırı (saha/lig) 13px ekler. */
export const MATCH_ROW_META_HEIGHT = 13;

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
  /** Kompakt varyant yalnız amblemi küçültür; düzen ikisinde de aynıdır. */
  const crestSize = compact ? 14 : layout.crestSm;
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
      {/* Işıklı yüzey — kutu `overflow: "hidden"` taşıdığı için köşeleri
          kendiliğinden kırpılır. */}
      <GradientFill />

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

        {/*
          TEK SATIR GÖVDE. `compact` varyantı yalnız amblemleri küçültür ve
          yıldız sütununu düşürür; düzen ikisinde de aynıdır, çünkü iki farklı
          maç satırı düzeni listeler arasında geçerken okuma eksenini
          değiştiriyordu.
        */}
        <View style={styles.side}>
          {homeMine ? <View style={styles.rail} /> : null}
          <Text
            style={[
              styles.teamName,
              styles.teamNameRight,
              homeWon && styles.teamNameWinner,
              finished && awayWon && styles.teamNameDim,
              homeMine && styles.teamNameMine,
            ]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {match.first_team_name}
          </Text>
          <TeamLogo
            name={match.first_team_name}
            logo={homeLogo}
            size={crestSize}
            dimmed={finished && awayWon}
          />
        </View>

        <View style={styles.scoreColumn}>
          {played ? (
            <Animated.Text
              style={[
                styles.score,
                live && styles.scoreLive,
                { transform: [{ scale: numberScale }] },
              ]}
              numberOfLines={1}
              {...textScale.dense}
            >
              {`${formatScore(match.first_team_score)}–${formatScore(match.second_team_score)}`}
            </Animated.Text>
          ) : (
            <Text style={styles.scorePending} numberOfLines={1} {...textScale.badge}>
              vs
            </Text>
          )}
        </View>

        <View style={styles.side}>
          <TeamLogo
            name={match.second_team_name}
            logo={awayLogo}
            size={crestSize}
            dimmed={finished && homeWon}
          />
          <Text
            style={[
              styles.teamName,
              awayWon && styles.teamNameWinner,
              finished && homeWon && styles.teamNameDim,
              awayMine && styles.teamNameMine,
            ]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {match.second_team_name}
          </Text>
          {awayMine ? <View style={styles.rail} /> : null}
        </View>

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
              size={15}
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

const ANDROID_RIPPLE = { color: colors.ripple } as const;
const STAR_SLOP = touchSlop(15);

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface1,
    paddingHorizontal: layout.rowPaddingH,
    justifyContent: "center",
    // Flash örtüsü, gradyan katmanı ve ayraç, grubun ilk/son satırındaki
    // yuvarlak köşelerin dışına taşmasın.
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
    lineHeight: MATCH_ROW_META_HEIGHT,
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
    ...type.tableNum,
    color: colors.textSecondary,
  },
  minute: {
    ...type.tableNumStrong,
    color: colors.live,
  },
  minuteDot: {
    marginTop: 2,
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
  /**
   * Bir takım yanı: amblem + ad. İki yan da ortadaki skora YASLANIR — ev
   * sahibinde ad sağa, deplasmanda sola hizalıdır; amblemler dışta kalır.
   */
  side: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    minWidth: 0,
  },
  /** Kullanıcının takımı — adın dışında ince marka rayı. */
  rail: {
    width: 2,
    height: 12,
    borderRadius: 1,
    backgroundColor: colors.brand,
  },
  /* Takım adı 12px: tek satırda beş sütun (logo·ad·skor·ad·logo) yan yana
     durduğu için ad, skorun önüne geçmemeli. Kazanan `fonts.bold` ile ayrışır,
     puntoyla değil. */
  teamName: {
    ...type.label,
    color: colors.textPrimary,
    flexShrink: 1,
    flexGrow: 1,
  },
  teamNameRight: {
    textAlign: "right",
  },
  teamNameWinner: {
    fontFamily: fonts.bold,
  },
  teamNameDim: {
    color: colors.textTertiary,
  },
  teamNameMine: {
    color: colors.brandAccent,
  },
  /**
   * Skor bloğu: SABİT genişlik. Liste boyunca aynı yerde durması, tek satırlı
   * düzenin okuma eksenini kuran şeydir; genişlik içerikten gelseydi her
   * satırda kayardı.
   */
  scoreColumn: {
    width: layout.scoreColumnWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  score: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  scoreLive: {
    color: colors.live,
  },
  /** Oynanmamış maçta skorun yerini tutar: sütun boş kalmaz, hiza bozulmaz. */
  scorePending: {
    ...type.micro,
    color: colors.textDisabled,
  },
  starColumn: {
    width: layout.starColumnWidth,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  /** Ayraç saat sütununu atlar ve yüksekliği etkilemez. */
  divider: {
    position: "absolute",
    left: layout.rowPaddingH + layout.timeColumnWidth,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
});
