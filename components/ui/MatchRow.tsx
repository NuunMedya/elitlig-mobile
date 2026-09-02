/**
 * MatchRow — maç listesinin tek satırı. Sistemin görsel kalbi.
 *
 * DÜZEN — İKİ TAKIM ÜST ÜSTE, SKOR SAĞDA (tema.html §6 ".mrow"):
 *
 *   ┌──────────── flex ────────────┬ 30 ┬ 42 ┬ 42 ┐
 *   │ ◆ FC ANGARA                  │ 10 │ MS │ ☆ │
 *   │ ◆ LAST DANCE                 │ 10 │    │   │
 *   └──────────────────────────────┴────┴────┴────┘
 *      arma + ad (sola yaslı)       skor  zaman yıldız
 *
 * NEDEN TEK SATIRDAN İKİ SATIRA DÖNDÜ: tek satırlı simetrik düzen
 * ("ev · arma · 2–1 · arma · dep") 390px'te iki takım adına toplam ~150px
 * bırakıyordu. Bu ligde adlar uzun ve BÜYÜK HARF ("ASYA KARTALLARI",
 * "BOZKURTLAR FC"); neredeyse her satır "FC ANG…" / "LAST DA…" diye kırpılıyor
 * ve maç satırı, söylemesi gereken tek şeyi — kim kime karşı — söyleyemez
 * hâle geliyordu. Üst üste düzende her ada satırın ~200px'i kalır; iki satırın
 * bedeli (54 → 58px) ekrana giren maç sayısını neredeyse hiç değiştirmez.
 *
 * OKUMA EKSENİ: skor sağda, sabit genişlikli bir sütunda ve SAĞA yaslı durur;
 * onun sağında saç teli ayraçla ayrılmış sabit genişlikli "ne zaman" sütunu
 * (MS / 67' / 20:30). Adlar ne kadar uzun olursa olsun bu iki sütun liste
 * boyunca aynı yerde kalır: göz soldan adı, sağdan sonucu okur.
 *
 * ÜÇ SÜTUN AYNI ÇİZGİYE OTURUR: takım satırı, skor satırı ve (canlıda)
 * dakika, hepsi aynı sabit çizgi yüksekliğini (`LINE`) ve aynı çizgi
 * boşluğunu paylaşır. Amblem 22px, ad 17px, skor 21px olduğu hâlde ev
 * sahibinin rakamı ev sahibinin adıyla, deplasmanınki deplasmanınkiyle aynı
 * hizada durur — aksi hâlde iki sütun birbirinden bir iki piksel kayar ve
 * satır "yamuk" okunur.
 *
 * KAZANAN/KAYBEDEN RENKLE VE AĞIRLIKLA AYRILIR: kazanan `fonts.semibold` +
 * `textPrimary`; kaybedenin adı da skoru da `textTertiary`, amblemi soluk.
 * Berabere ve oynanmamış maçta iki taraf da "normal"dir (`fonts.medium`);
 * canlı maçta ağırlık yok, skor `live` rengindedir — henüz kazanan yok.
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
  /** Kompakt: iki satır daha sıkı (bodySm, 18px çizgi), 46px */
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
/** Meta satırı (saha/lig) 14px ekler. */
export const MATCH_ROW_META_HEIGHT = 14;

/**
 * Bir takım/skor çizgisinin yüksekliği. Amblem (crestSm 22) satırdaki en
 * uzun öğe olduğu için çizgi ona göre kurulur; skor (scoreSm, 21) ve ad
 * (label, 17) bu çizginin içinde ortalanır. Kompaktta amblem de çizgi de 18'e
 * iner ve skor `tableNumStrong` (18) ile çizgiyi tam doldurur.
 */
const LINE = layout.crestSm;
const LINE_COMPACT = 18;
/**
 * Skor sütunu: SABİT 30px, sağa yaslı. Archivo Bold 17px'te "10" ~20px;
 * 30px iki basamağı rahat taşır ve üç basamak zaten yok. `layout.scoreColumnWidth`
 * (56) tek satırlı "12–10" bloğu içindi; burada iki rakam alt alta durduğu
 * için o genişlik ad alanından 26px çalardı.
 */
const SCORE_COLUMN_WIDTH = 30;
/** Kullanıcının takımı rayı — 3×12, satır dolgusunun (14px) içinde durur. */
const RAIL_WIDTH = 3;
const RAIL_HEIGHT = 12;

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

/**
 * Bir takım çizgisi: [ray] arma · ad. Ev ve deplasman aynı anatomiyi paylaşır;
 * fark yalnız kazandı/kaybetti/benim durumundan gelir.
 *
 * Ray `position: absolute` ile satır dolgusunun içine (sola) taşar: çizginin
 * akışına girseydi o çizginin arması diğerinin armasından 11px sağa kayar ve
 * iki amblem alt alta hizalanmazdı. Amblem hizası, kullanıcının takımını
 * işaretlemekten daha önemli — ikisi birden oluyor.
 */
function TeamLine({
  name,
  logo,
  compact,
  won,
  lost,
  mine,
}: {
  name: string | null | undefined;
  logo: string | null | undefined;
  compact: boolean;
  won: boolean;
  lost: boolean;
  mine: boolean;
}) {
  return (
    <View style={compact ? styles.sideCompact : styles.side}>
      {mine ? <View style={[styles.rail, compact && styles.railCompact]} /> : null}
      <TeamLogo name={name} logo={logo} size={compact ? LINE_COMPACT : LINE} dimmed={lost} />
      <Text
        style={[
          compact ? styles.teamNameCompact : styles.teamName,
          won && styles.teamNameWinner,
          lost && styles.teamNameDim,
          mine && styles.teamNameMine,
        ]}
        numberOfLines={1}
        {...textScale.dense}
      >
        {name}
      </Text>
    </View>
  );
}

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
  // Kazanan/kaybeden yalnız BİTMİŞ maçta vardır; canlıda öne geçen takım
  // henüz kazanmadı, satır onu kalınlaştırmaz.
  const homeWon = finished && homeScore > awayScore;
  const awayWon = finished && awayScore > homeScore;

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

  /** Ekran okuyucu için TEK cümle: "FC Angara 3, Last Dance 1, maç sonu". */
  const speech = useMemo(() => {
    const home = match.first_team_name ?? "Ev sahibi";
    const away = match.second_team_name ?? "Deplasman";
    if (live) {
      const clock = halftime ? "devre arası" : minute != null ? `${minute}. dakika` : "canlı";
      return `${home} ${homeScore}, ${away} ${awayScore}, ${clock}`;
    }
    if (played) return `${home} ${homeScore}, ${away} ${awayScore}, maç sonu`;
    const time = formatTime(match.time);
    return `${home} – ${away}${time ? `, saat ${time}` : ""}`;
  }, [live, played, halftime, minute, homeScore, awayScore, match.first_team_name, match.second_team_name, match.time]);

  const scoreStyle = compact ? styles.scoreCompact : styles.score;
  const numberTransform = { transform: [{ scale: numberScale }] };

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
        {/* Takımlar: iki çizgi üst üste, kalan tüm genişliği alır. */}
        <View style={compact ? styles.teamsCompact : styles.teams}>
          <TeamLine
            name={match.first_team_name}
            logo={homeLogo}
            compact={compact}
            won={homeWon}
            lost={awayWon}
            mine={homeMine}
          />
          <TeamLine
            name={match.second_team_name}
            logo={awayLogo}
            compact={compact}
            won={awayWon}
            lost={homeWon}
            mine={awayMine}
          />
        </View>

        {/* Skor: iki rakam alt alta, takım çizgileriyle aynı hizada. */}
        <View style={compact ? styles.scoreColumnCompact : styles.scoreColumn}>
          {played ? (
            <>
              <View style={compact ? styles.lineCompact : styles.line}>
                <Animated.Text
                  style={[scoreStyle, live && styles.scoreLive, awayWon && styles.scoreDim, numberTransform]}
                  numberOfLines={1}
                  {...textScale.dense}
                >
                  {formatScore(match.first_team_score)}
                </Animated.Text>
              </View>
              <View style={compact ? styles.lineCompact : styles.line}>
                <Animated.Text
                  style={[scoreStyle, live && styles.scoreLive, homeWon && styles.scoreDim, numberTransform]}
                  numberOfLines={1}
                  {...textScale.dense}
                >
                  {formatScore(match.second_team_score)}
                </Animated.Text>
              </View>
            </>
          ) : (
            /* Oynanmamış maçta rakamların yerini iki çizgi tutar: sütun boş
               kalmaz, sağdaki "ne zaman" sütunu kaymaz. */
            <>
              <View style={compact ? styles.lineCompact : styles.line}>
                <Text style={styles.scorePending} {...textScale.badge}>
                  –
                </Text>
              </View>
              <View style={compact ? styles.lineCompact : styles.line}>
                <Text style={styles.scorePending} {...textScale.badge}>
                  –
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Ne zaman: MS / dakika / saat. Solunda saç teli ayraç; `alignSelf:
            "stretch"` ile ayraç yalnız iki takım çizgisi boyunca uzar, meta
            satırına ve satır dolgusuna girmez. */}
        <View style={styles.whenColumn}>
          {live ? (
            /* Dakika 42px sütuna yatay sığmıyor: rozet DİKEY kurulur —
               üstte dakika/İY/CANLI, altında nokta. */
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
          Yıldız sütunu yalnız favori eylemi VARSA çizilir. Eski tek satırlı
          düzen, ortadaki skorun ekseni kaymasın diye boş bir sütun tutuyordu;
          burada skor ve "ne zaman" sütunu SAĞA yaslıdır, yani eksen satırın
          sağ kenarından okunur ve yıldız olmayan listelerde o 42px ada döner.
        */}
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
              size={14}
              color={isFavorite ? colors.star : colors.starEmpty}
            />
          </Pressable>
        ) : null}
      </View>

      {position !== "last" && position !== "single" ? <View style={styles.divider} /> : null}
    </Pressable>
  );
});

const ANDROID_RIPPLE = { color: colors.ripple } as const;
const STAR_SLOP = touchSlop(14);

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
  /** Lig/saha etiketi — takım çizgileriyle aynı sol hizada, onların üstünde. */
  meta: {
    ...type.micro,
    color: colors.textTertiary,
    lineHeight: MATCH_ROW_META_HEIGHT,
    height: MATCH_ROW_META_HEIGHT,
  },
  main: {
    flexDirection: "row",
    alignItems: "center",
  },
  /** Takım sütunu: iki çizgi alt alta, aradaki boşluk skor sütunuyla AYNI. */
  teams: {
    flex: 1,
    minWidth: 0,
    gap: space.s,
  },
  teamsCompact: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  /** Bir takım çizgisi: arma + ad. Yüksekliği sabit ki skorla hizalansın. */
  side: {
    height: LINE,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  sideCompact: {
    height: LINE_COMPACT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  /** Kullanıcının takımı — satır dolgusunun içinde, armanın solunda ince ray. */
  rail: {
    position: "absolute",
    left: -space.sm,
    top: (LINE - RAIL_HEIGHT) / 2,
    width: RAIL_WIDTH,
    height: RAIL_HEIGHT,
    borderRadius: 2,
    backgroundColor: colors.brand,
  },
  railCompact: {
    top: (LINE_COMPACT - RAIL_HEIGHT) / 2,
  },
  /**
   * Takım adı 13px, Inter Medium: maketin "normal" ağırlığı. Kazanan
   * `fonts.semibold` ile ayrışır (arayüzün en kalını), kaybeden renkle
   * söner. Ad çizgideki kalan tüm genişliği alır ve gerekirse sonundan
   * kırpılır — artık ~200px alanı var, gerçek adların hepsi sığıyor.
   */
  teamName: {
    ...type.label,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  teamNameCompact: {
    ...type.bodySm,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  teamNameWinner: {
    fontFamily: fonts.semibold,
  },
  teamNameDim: {
    color: colors.textTertiary,
  },
  teamNameMine: {
    color: colors.brandAccent,
  },
  /**
   * Skor sütunu: SABİT genişlik, rakamlar SAĞA yaslı. Liste boyunca aynı
   * yerde durması, iki satırlı düzenin okuma eksenini kuran şeydir; genişlik
   * içerikten gelseydi "9" ile "10" farklı hizada dururdu.
   */
  scoreColumn: {
    width: SCORE_COLUMN_WIDTH,
    marginLeft: space.m,
    alignItems: "flex-end",
    gap: space.s,
  },
  scoreColumnCompact: {
    width: SCORE_COLUMN_WIDTH,
    marginLeft: space.m,
    alignItems: "flex-end",
    gap: space.xs,
  },
  /** Bir skor çizgisi — takım çizgisiyle aynı yükseklik, rakam ortada. */
  line: {
    height: LINE,
    justifyContent: "center",
  },
  lineCompact: {
    height: LINE_COMPACT,
    justifyContent: "center",
  },
  score: {
    ...type.scoreSm,
    color: colors.textPrimary,
    textAlign: "right",
  },
  scoreCompact: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
    textAlign: "right",
  },
  scoreLive: {
    color: colors.live,
  },
  /** Kaybedenin rakamı adı gibi söner. */
  scoreDim: {
    color: colors.textTertiary,
  },
  /** Oynanmamış maçta rakamın yerini tutar: sütun boş kalmaz, hiza bozulmaz. */
  scorePending: {
    ...type.tableNum,
    color: colors.textTertiary,
    textAlign: "right",
  },
  /**
   * "Ne zaman" sütunu: sabit genişlik, solunda saç teli ayraç. Kâğıt
   * üstündeyiz, ayraç `separator`dır (`borderOnDark` değil).
   */
  whenColumn: {
    width: layout.timeColumnWidth,
    marginLeft: space.m,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.separator,
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
  starColumn: {
    width: layout.starColumnWidth,
    alignSelf: "stretch",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  /** Ayraç satır dolgusundan başlar ve yüksekliği etkilemez. */
  divider: {
    position: "absolute",
    left: layout.rowPaddingH,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
});
