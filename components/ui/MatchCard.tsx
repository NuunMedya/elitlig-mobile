/**
 * MatchCard — maçın iki biçimi: KART (vitrin, şerit) ve SATIR (yoğun liste).
 *
 * KART (`variant="card"`, varsayılan) — iki takım YAN YANA, sonuç ORTADA:
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ FREELİG · ANKARA                 Bugün   ☆   │  üst şerit
 *   │                                               │
 *   │    ◆◆◆              2 – 1              ◆◆◆     │  amblemler + skor/saat
 *   │  KARASANCAK          MS          TİMUÇİN SK   │  adlar + durum
 *   │                                               │
 *   │ ⌖ ERYAMAN ATA HALISAHA                        │  saha (isteğe bağlı)
 *   └───────────────────────────────────────────────┘
 *
 *   Kartta amblem 44px, adlar iki satıra kadar kırılabilir (uzun BÜYÜK HARF
 *   adlar kırpılmaz) ve skor ya da başlama saati kartın tam ortasında, en
 *   büyük öğe olarak durur. Özet ekranların şeritleri ve takım sayfası bunu
 *   kullanır: az maç, çok kimlik.
 *
 * SATIR (`variant="compact"`) — gün listesi, canlı merkez, favoriler:
 *
 *   │   KARASANCAK ◆     2 – 1     ◆ TİMUÇİN SK   │
 *   │                  MS                          │
 *   │          ⌖ ERYAMAN ATA HALISAHA           ☆  │   alt şerit (isteğe bağlı)
 *
 *   NEDEN İKİNCİ BİÇİM: bir günde on iki maç olan listede kart başına 146px,
 *   ekranda dört maç demekti; kullanıcı "kim kiminle, kaç kaç" sorusunu
 *   kaydırarak yanıtlıyordu. Satır aynı okuma eksenini (ev · skor · dep)
 *   62px'e sığdırır; durum (dakika, MS, gün) skorun altında durur, yıldız
 *   ve saha alt şeritte. Ana satırda yan sütun YOKTUR — skor bloğu satırın
 *   geometrik merkezinde kalır ve takım adları satırın tamamını kullanır.
 *   Satırlar `position` ile grup kurar (ListRow ile aynı sözleşme): ilk ve
 *   son satır köşeyi, aradakiler ayracı çizer; listenin kartı ayrıca sarılmaz.
 *
 * YOĞUN SATIR (`variant="compact"` + `dense`) — Maçlar ekranı:
 *
 *   │   KARASANCAK ◆  2 – 1  ◆ TİMUÇİN SK      ☆ │   tek satır, 46px
 *   │                 MS                          │
 *
 *   Bir günde onlarca maç olan "Tüm Türkiye" görünümünde 78px'lik satır
 *   ekrana altı maç sığdırıyordu. Yoğun satır saha şeridini bırakır (saha maç
 *   detayında), yıldızı ana satırın sağına alır ve SOLDA aynı genişlikte boş
 *   bir sütun tutar — skor ekseni yine satırın tam ortasındadır. Adlar tek
 *   satır, 12px; amblem 20px.
 *
 * SABİT YÜKSEKLİK: uzun listelerde `getItemLayout` kurulabilsin diye iki
 * biçimin de yüksekliği içerikten değil seçeneklerden gelir (`matchCardHeight`).
 *
 * DURUMLAR:
 *   · Oynanmamış → ortada saat (20:30).
 *   · Canlı      → skor `live` renginde, dakika rozeti; kartın tepesinde ince
 *                  canlı çizgisi. (Eski kırmızı çerçeve, canlı merkezde altı
 *                  kartı altı alarm kutusuna çeviriyordu; sinyal çizgide.)
 *   · Bitti      → skor + "MS"; kazanan kalın, kaybeden soluk.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback, useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { colors, elevate, fonts, hairline, radius, space, textScale, touchSlop, type } from "@/theme";
import { haptics } from "@/lib/haptics";
import { formatScore, formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";
import { GradientFill } from "./GradientFill";
import { LiveBadge } from "./LiveBadge";
import { TeamLogo } from "./TeamLogo";
import { Touchable } from "./Pressable";

export type MatchCardVariant = "card" | "compact";
export type MatchCardPosition = "single" | "first" | "middle" | "last";

export interface MatchCardProps {
  match: ApiMatch;
  homeLogo?: string | null;
  awayLogo?: string | null;
  /**
   * "card" (varsayılan): amblemler büyük, adlar altta. "compact": tek satırlık
   * skor satırı — gruplu, yoğun listeler için.
   */
  variant?: MatchCardVariant;
  /**
   * Yalnız `compact`: grup içindeki konum. Verilmezse satır kendi başına,
   * dört köşesi yuvarlak bir karttır.
   */
  position?: MatchCardPosition;
  /** Kart: üst şeritte ne yazsın — lig adı (varsayılan), saha ya da hiçbir şey. */
  meta?: "league" | "field" | "none";
  /** Kart: üst şeridin sağında gün etiketi. Satır: sol sütunda gün ("Yarın", "14 Eki"). */
  showDate?: boolean;
  /** Saha adı — kartta alt şerit, satırda skorun altında ikinci satır. */
  showVenue?: boolean;
  /** Yalnız `compact`: tek satırlık ince biçim (saha şeridi yok, yıldız sağda). */
  dense?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onPress?: () => void;
  /** Canlı dakika (soket/sayaçtan). */
  minute?: number | null;
  addedTime?: number | null;
  halftime?: boolean;
  /** Kullanıcının/bakılan takımın kimliği — adı vurgulanır. */
  highlightTeamId?: number | null;
  highlightTeamName?: string | null;
  /** Kartın altına eklenen eylem şeridi (ör. "Takvime ekle"). Sabit yükseklik hesabına girmez. */
  footer?: ReactNode;
  /** Yatay kaydırıcıda sabit genişlik vermek için. */
  style?: StyleProp<ViewStyle>;
}

/* ───────────────────────────── ÖLÇÜLER ───────────────────────────── */

const CREST = 44;
const NAME_LINES = 2;
const NAME_LINE_HEIGHT = type.label.lineHeight;
const PAD_V = space.lg;
const HEAD_H = 18;
const VENUE_H = 26; // ayraç + 16px satır
/** Kartlar arası dikey boşluk — listeler bu değeri satır yüksekliğine ekler. */
export const MATCH_CARD_GAP = space.m;

/** Satır biçimi: ana satır ve isteğe bağlı alt şerit (saha · yıldız). */
const COMPACT_LINE_H = 62;
const COMPACT_LINE_H_META = 56;
const COMPACT_META_H = 22;
const COMPACT_CREST = 24;
/** Skor sütunu — "MS · 12 Eki" durum satırı da buna sığar. */
const COMPACT_CENTER_W = 70;
/** Alt şeridin yan sütunları (yıldızın dokunma genişliği). */
const COMPACT_META_SIDE_W = 44;
/** Yoğun satır: tek satır, küçük amblem, yan sütunlar (yıldız | boşluk). */
const DENSE_LINE_H = 46;
const DENSE_CREST = 20;
const DENSE_CENTER_W = 60;
const DENSE_SIDE_W = 30;

/** Kart/satır yüksekliği (boşluk HARİÇ). Listeler `getItemLayout` için bunu kullanır. */
export function matchCardHeight(
  options: {
    showVenue?: boolean;
    meta?: "league" | "field" | "none";
    showDate?: boolean;
    variant?: MatchCardVariant;
    /** Yalnız compact: satır yıldız taşıyor mu (`onToggleFavorite` verildi mi). */
    favoritable?: boolean;
    /** Yalnız compact: tek satırlık yoğun biçim. */
    dense?: boolean;
  } = {},
): number {
  if (options.variant === "compact" && options.dense) return DENSE_LINE_H;
  if (options.variant === "compact") {
    return options.showVenue || options.favoritable
      ? COMPACT_LINE_H_META + COMPACT_META_H
      : COMPACT_LINE_H;
  }
  const head = options.meta === "none" && !options.showDate ? 0 : HEAD_H + space.md;
  const body = CREST + space.s + NAME_LINE_HEIGHT * NAME_LINES;
  const venue = options.showVenue ? VENUE_H + space.sm : 0;
  return PAD_V * 2 + head + body + venue;
}

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/** Tarihi yerel gün olarak okur ve bugünden farkını verir. */
function dayOffset(value?: string | null): { date: Date; diff: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { date, diff: Math.round((date.getTime() - today.getTime()) / 86_400_000) };
}

/** "Bugün" / "Yarın" / "Dün" / "12 Eki Pzt". Tarih yerel gün olarak okunur. */
export function matchDayLabel(value?: string | null): string {
  const parsed = dayOffset(value);
  if (!parsed) return "";
  const { date, diff } = parsed;
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${DAYS[date.getDay()]}`;
}

/** Dar sütun için kısa gün: "Bugün" / "Yarın" / "Dün" / "12 Eki". */
function shortDayLabel(value?: string | null): string {
  const parsed = dayOffset(value);
  if (!parsed) return "";
  const { date, diff } = parsed;
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

const sameTeam = (
  id: number | null | undefined,
  name: string | null | undefined,
  hid: number | null | undefined,
  hname: string | null | undefined,
) => {
  if (hid != null && id != null) return Number(hid) === Number(id);
  if (!hname || !name) return false;
  return hname.trim().toLocaleLowerCase("tr-TR") === name.trim().toLocaleLowerCase("tr-TR");
};

/* ───────────────────────────── PARÇALAR ───────────────────────────── */

function Side({
  name,
  logo,
  won,
  lost,
  mine,
}: {
  name: string | null | undefined;
  logo: string | null | undefined;
  won: boolean;
  lost: boolean;
  mine: boolean;
}) {
  return (
    <View style={styles.side}>
      <View style={[styles.crestWrap, mine && styles.crestMine]}>
        <TeamLogo name={name} logo={logo} size={CREST} dimmed={lost} />
      </View>
      <View style={styles.nameBox}>
        <Text
          style={[styles.name, won && styles.nameWon, lost && styles.nameLost, mine && styles.nameMine]}
          numberOfLines={NAME_LINES}
          {...textScale.badge}
        >
          {name}
        </Text>
      </View>
    </View>
  );
}

/** Satır biçiminin bir yanı: ad amblemin İÇ tarafında, skora yaslı. */
function CompactSide({
  name,
  logo,
  won,
  lost,
  mine,
  align,
  dense = false,
}: {
  name: string | null | undefined;
  logo: string | null | undefined;
  won: boolean;
  lost: boolean;
  mine: boolean;
  align: "home" | "away";
  dense?: boolean;
}) {
  const home = align === "home";
  return (
    <View style={[styles.cSide, dense && styles.dSide, home ? styles.cSideHome : null]}>
      <TeamLogo name={name} logo={logo} size={dense ? DENSE_CREST : COMPACT_CREST} dimmed={lost} />
      <Text
        style={[
          styles.cName,
          dense && styles.dName,
          home ? styles.cNameHome : null,
          won && styles.cNameWon,
          lost && styles.nameLost,
          mine && styles.nameMine,
        ]}
        numberOfLines={dense ? 1 : 2}
        {...textScale.badge}
      >
        {name}
      </Text>
    </View>
  );
}

/* ───────────────────────────── BİLEŞEN ───────────────────────────── */

export const MatchCard = memo(function MatchCard({
  match,
  homeLogo,
  awayLogo,
  variant = "card",
  position,
  meta = "league",
  showDate = false,
  showVenue = false,
  dense = false,
  isFavorite = false,
  onToggleFavorite,
  onPress,
  minute,
  addedTime,
  halftime = false,
  highlightTeamId,
  highlightTeamName,
  footer,
  style,
}: MatchCardProps) {
  const state = matchState(match);
  const live = state === "live";
  const finished = state === "finished";
  const played = state !== "scheduled";

  const homeScore = Number(match.first_team_score ?? 0);
  const awayScore = Number(match.second_team_score ?? 0);
  const homeWon = finished && homeScore > awayScore;
  const awayWon = finished && awayScore > homeScore;

  const homeMine = sameTeam(match.home_team_id, match.first_team_name, highlightTeamId, highlightTeamName);
  const awayMine = sameTeam(match.away_team_id, match.second_team_name, highlightTeamId, highlightTeamName);

  const day = matchDayLabel(match.date);
  const compact = variant === "compact";

  const handleFavorite = useCallback(() => {
    haptics.light();
    onToggleFavorite?.();
  }, [onToggleFavorite]);

  const speech = useMemo(() => {
    const home = match.first_team_name ?? "Ev sahibi";
    const away = match.second_team_name ?? "Deplasman";
    if (live) {
      const clock = halftime ? "devre arası" : minute != null ? `${minute}. dakika` : "canlı";
      return `${home} ${homeScore}, ${away} ${awayScore}, ${clock}`;
    }
    if (played) return `${home} ${homeScore}, ${away} ${awayScore}, maç sonu`;
    const time = formatTime(match.time);
    return `${home} – ${away}${day ? `, ${day}` : ""}${time ? ` saat ${time}` : ""}`;
  }, [live, played, halftime, minute, homeScore, awayScore, day, match.first_team_name, match.second_team_name, match.time]);

  const star = onToggleFavorite ? (
    <Pressable
      onPress={handleFavorite}
      hitSlop={STAR_SLOP}
      accessibilityRole="button"
      accessibilityState={{ selected: isFavorite }}
      accessibilityLabel={isFavorite ? "Maçı takipten çıkar" : "Maçı takip et"}
      style={compact ? (dense ? styles.dStar : styles.cStar) : styles.star}
    >
      <Ionicons
        name={isFavorite ? "star" : "star-outline"}
        size={dense ? 14 : 16}
        color={isFavorite ? colors.brand : colors.starEmpty}
      />
    </Pressable>
  ) : null;

  const scoreText = (
    <>
      <Text style={awayWon ? styles.scoreDim : null}>{formatScore(match.first_team_score)}</Text>
      <Text style={styles.scoreDash}>{compact ? "–" : " – "}</Text>
      <Text style={homeWon ? styles.scoreDim : null}>{formatScore(match.second_team_score)}</Text>
    </>
  );

  /* ══════════════════════════ YOĞUN SATIR ══════════════════════════ */
  if (compact && dense) {
    const grouped = position != null;
    const divider = position === "first" || position === "middle";
    const shortDay = showDate ? shortDayLabel(match.date) : "";

    return (
      <Touchable
        feedback="row"
        haptic="selection"
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={speech}
        style={[
          styles.cRow,
          { height: DENSE_LINE_H },
          grouped ? styles.cGrouped : styles.cSingle,
          position === "first" ? styles.cFirst : null,
          position === "last" ? styles.cLast : null,
          position === "single" ? styles.cSingleGroup : null,
          style,
        ]}
      >
        {live ? <View style={styles.dLiveEdge} /> : null}

        <View style={styles.dMain}>
          {/* Sol boş sütun yıldız sütununun eşidir: skor ekseni ortada kalır. */}
          <View style={styles.dEdge} />
          <CompactSide
            name={match.first_team_name}
            logo={homeLogo}
            won={homeWon}
            lost={awayWon}
            mine={homeMine}
            align="home"
            dense
          />

          <View style={styles.dCenter}>
            {played ? (
              <Text style={[styles.dScore, live && styles.scoreLive]} numberOfLines={1} {...textScale.badge}>
                {scoreText}
              </Text>
            ) : (
              <Text style={styles.dTime} numberOfLines={1} {...textScale.badge}>
                {formatTime(match.time) || "--:--"}
              </Text>
            )}
            {live ? (
              <LiveBadge minute={minute} addedTime={addedTime} halftime={halftime} />
            ) : finished ? (
              <Text style={styles.dState} numberOfLines={1} {...textScale.badge}>
                {shortDay ? `MS · ${shortDay}` : "MS"}
              </Text>
            ) : shortDay ? (
              <Text style={styles.dState} numberOfLines={1} {...textScale.badge}>
                {shortDay}
              </Text>
            ) : null}
          </View>

          <CompactSide
            name={match.second_team_name}
            logo={awayLogo}
            won={awayWon}
            lost={homeWon}
            mine={awayMine}
            align="away"
            dense
          />
          <View style={styles.dEdge}>{star}</View>
        </View>

        {divider ? <View style={styles.cDivider} /> : null}
      </Touchable>
    );
  }

  /* ═════════════════════════════ SATIR ═════════════════════════════ */
  if (compact) {
    const venue = showVenue ? match.match_field : null;
    const favoritable = Boolean(onToggleFavorite);
    const hasMeta = showVenue || favoritable;
    const height = matchCardHeight({ variant: "compact", showVenue, favoritable });
    const grouped = position != null;
    const divider = position === "first" || position === "middle";
    const shortDay = showDate ? shortDayLabel(match.date) : "";

    return (
      <Touchable
        feedback="row"
        haptic="selection"
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={speech}
        style={[
          styles.cRow,
          { height },
          grouped ? styles.cGrouped : styles.cSingle,
          position === "first" ? styles.cFirst : null,
          position === "last" ? styles.cLast : null,
          position === "single" ? styles.cSingleGroup : null,
          style,
        ]}
      >
        {/* Canlı satırın sol kenarında ince kırmızı çizgi — kırmızı skorla
            birlikte göz listede canlı maçı ilk taramada bulur. */}
        {live ? <View style={styles.cLiveEdge} /> : null}

        <View style={[styles.cMain, hasMeta ? styles.cMainWithMeta : null]}>
          <CompactSide
            name={match.first_team_name}
            logo={homeLogo}
            won={homeWon}
            lost={awayWon}
            mine={homeMine}
            align="home"
          />

          {/* ORTA: skor ya da saat; altında durum (dakika, MS, gün). */}
          <View style={styles.cCenter}>
            {played ? (
              <Text style={[styles.cScore, live && styles.scoreLive]} numberOfLines={1} {...textScale.badge}>
                {scoreText}
              </Text>
            ) : (
              <Text style={styles.cTime} numberOfLines={1} {...textScale.badge}>
                {formatTime(match.time) || "--:--"}
              </Text>
            )}
            {live ? (
              <LiveBadge minute={minute} addedTime={addedTime} halftime={halftime} />
            ) : finished ? (
              <Text style={styles.cState} numberOfLines={1} {...textScale.badge}>
                {shortDay ? `MS · ${shortDay}` : "MS"}
              </Text>
            ) : shortDay ? (
              <Text style={styles.cDay} numberOfLines={1} {...textScale.badge}>
                {shortDay}
              </Text>
            ) : null}
          </View>

          <CompactSide
            name={match.second_team_name}
            logo={awayLogo}
            won={awayWon}
            lost={homeWon}
            mine={awayMine}
            align="away"
          />
        </View>

        {/* ALT ŞERİT: ortada saha, sağda yıldız. Yıldız ana satırda olsaydı
            iki yandan da eşit sütun ayırmak gerekirdi (skor ekseni ortada
            kalsın diye) ve takım adları ~80px'e sıkışıp hece ortasından
            kırılırdı; burada adlar satırın tamamını kullanır. */}
        {hasMeta ? (
          <View style={styles.cMeta}>
            <View style={styles.cMetaSide} />
            <View style={styles.cVenue}>
              {venue ? (
                <>
                  <Ionicons name="location-outline" size={11} color={colors.textTertiary} />
                  <Text style={styles.cVenueText} numberOfLines={1} {...textScale.badge}>
                    {venue}
                  </Text>
                </>
              ) : null}
            </View>
            <View style={styles.cMetaSide}>{star}</View>
          </View>
        ) : null}

        {divider ? <View style={styles.cDivider} /> : null}
      </Touchable>
    );
  }

  /* ═════════════════════════════ KART ═════════════════════════════ */

  const showHead = meta !== "none" || showDate || Boolean(onToggleFavorite);
  const height = matchCardHeight({ showVenue: showVenue && Boolean(match.match_field), meta, showDate: showDate || Boolean(onToggleFavorite) });

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={speech}
      style={[styles.card, footer ? null : { height }, style]}
    >
      <GradientFill radius="xl" />
      {live ? <View style={styles.liveLine} /> : null}

      {showHead ? (
        <View style={styles.head}>
          {meta === "field" && match.match_field ? (
            <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
          ) : null}
          <Text style={styles.league} numberOfLines={1} {...textScale.badge}>
            {meta === "league" ? match.league_name : meta === "field" ? match.match_field ?? "" : ""}
          </Text>
          {showDate && day ? (
            <Text style={styles.day} numberOfLines={1} {...textScale.badge}>
              {day}
            </Text>
          ) : null}
          {star}
        </View>
      ) : null}

      <View style={styles.body}>
        <Side name={match.first_team_name} logo={homeLogo} won={homeWon} lost={awayWon} mine={homeMine} />

        <View style={styles.center}>
          {played ? (
            <Text style={[styles.score, live && styles.scoreLive]} numberOfLines={1} {...textScale.badge}>
              {scoreText}
            </Text>
          ) : (
            <Text style={styles.time} numberOfLines={1} {...textScale.badge}>
              {formatTime(match.time) || "--:--"}
            </Text>
          )}

          <View style={styles.stateRow}>
            {live ? (
              <LiveBadge minute={minute} addedTime={addedTime} halftime={halftime} />
            ) : played ? (
              <View style={styles.statePill}>
                <Text style={styles.stateText} {...textScale.badge}>
                  MS
                </Text>
              </View>
            ) : !showDate && day ? (
              /* Gün üst şeritte yazmıyorsa saatin altına düşer; yazıyorsa
                 tekrarlanmaz — saat tek başına, daha sakin durur. */
              <Text style={styles.dayUnder} numberOfLines={1} {...textScale.badge}>
                {day}
              </Text>
            ) : null}
          </View>
        </View>

        <Side name={match.second_team_name} logo={awayLogo} won={awayWon} lost={homeWon} mine={awayMine} />
      </View>

      {showVenue && match.match_field ? (
        <View style={styles.venue}>
          <Ionicons name="location-outline" size={13} color={colors.textTertiary} />
          <Text style={styles.venueText} numberOfLines={1} {...textScale.badge}>
            {match.match_field}
          </Text>
        </View>
      ) : null}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Touchable>
  );
});

const STAR_SLOP = touchSlop(18);

const styles = StyleSheet.create({
  /* ─────────── KART ─────────── */
  card: {
    ...elevate(1),
    backgroundColor: colors.surface1,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: PAD_V,
    overflow: "hidden",
  },
  /** Canlı kartın tepesindeki 2px çizgi — çerçeve değil, sinyal. */
  liveLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.live,
  },
  head: {
    height: HEAD_H,
    marginBottom: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  league: {
    ...type.overline,
    color: colors.textTertiary,
    flex: 1,
    minWidth: 0,
  },
  day: {
    ...type.caption,
    fontFamily: fonts.semibold,
    color: colors.textSecondary,
  },
  star: {
    width: 24,
    alignItems: "flex-end",
  },
  body: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  side: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space.s,
  },
  crestWrap: {
    width: CREST + 8,
    height: CREST,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Vurgulanan takım: amblemin altında zümrüt bir çizgi (veri vurgusu). */
  crestMine: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  nameBox: {
    height: NAME_LINE_HEIGHT * NAME_LINES,
    justifyContent: "center",
    alignSelf: "stretch",
  },
  name: {
    ...type.label,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    textAlign: "center",
  },
  nameWon: { fontFamily: fonts.semibold },
  nameLost: { color: colors.textTertiary },
  nameMine: { color: colors.accentText, fontFamily: fonts.semibold },
  center: {
    width: 104,
    height: CREST + space.s + NAME_LINE_HEIGHT * NAME_LINES,
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
  },
  score: {
    ...type.scoreLg,
    color: colors.textPrimary,
  },
  scoreLive: { color: colors.live },
  scoreDim: { color: colors.textTertiary },
  scoreDash: { color: colors.textTertiary },
  time: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  stateRow: {
    minHeight: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  statePill: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
  },
  stateText: {
    ...type.micro,
    color: colors.textSecondary,
  },
  dayUnder: {
    ...type.caption,
    color: colors.textTertiary,
  },
  venue: {
    height: VENUE_H,
    marginTop: space.sm,
    paddingTop: space.m,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  footer: {
    marginTop: space.md,
    paddingTop: space.m,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  venueText: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
  },

  /* ─────────── SATIR ─────────── */
  /**
   * Satır kabuğu: kart yüzeyi + saç teli kenarlık, GÖLGESİZ. Gruplu satırlar
   * kenarlığı satır satır çizer (ListRow ile aynı yöntem); gölge her satırda
   * ayrı düşer ve grup tek kart gibi değil üst üste kâğıtlar gibi görünürdü.
   */
  cRow: {
    backgroundColor: colors.surface1,
    borderColor: colors.border,
    justifyContent: "center",
    overflow: "hidden",
  },
  cSingle: {
    ...elevate(1),
    borderRadius: radius.xl,
  },
  cGrouped: {
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
  },
  cFirst: {
    borderTopWidth: hairline,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  cLast: {
    borderBottomWidth: hairline,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  cSingleGroup: {
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderRadius: radius.xl,
  },
  cLiveEdge: {
    position: "absolute",
    left: 0,
    top: space.md,
    bottom: space.md,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: colors.live,
  },
  cMain: {
    height: COMPACT_LINE_H,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
  },
  cMainWithMeta: {
    height: COMPACT_LINE_H_META,
    paddingTop: space.xs,
  },
  cSide: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  /** Ev sahibi: ad amblemin solunda, sağa yaslı — skora bakar. */
  cSideHome: {
    flexDirection: "row-reverse",
  },
  cName: {
    ...type.label,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  cNameHome: {
    textAlign: "right",
  },
  cNameWon: {
    fontFamily: fonts.semibold,
  },
  cCenter: {
    width: COMPACT_CENTER_W,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  cScore: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  cTime: {
    ...type.scoreSm,
    fontFamily: fonts.display,
    color: colors.textPrimary,
  },
  cState: {
    ...type.micro,
    color: colors.textTertiary,
  },
  cDay: {
    ...type.caption,
    color: colors.textSecondary,
  },
  cMeta: {
    height: COMPACT_META_H,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  cMetaSide: {
    width: COMPACT_META_SIDE_W,
    alignItems: "center",
  },
  cStar: {
    width: COMPACT_META_SIDE_W,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  cVenue: {
    flex: 1,
    minWidth: 0,
    height: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
  },
  cVenueText: {
    ...type.meta,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  /* ─────────── YOĞUN SATIR ─────────── */
  dLiveEdge: {
    position: "absolute",
    left: 0,
    top: space.sm,
    bottom: space.sm,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: colors.live,
  },
  dMain: {
    height: DENSE_LINE_H,
    flexDirection: "row",
    alignItems: "center",
  },
  dEdge: {
    width: DENSE_SIDE_W,
    height: DENSE_LINE_H,
    alignItems: "center",
    justifyContent: "center",
  },
  dStar: {
    width: DENSE_SIDE_W,
    height: DENSE_LINE_H,
    alignItems: "center",
    justifyContent: "center",
  },
  dSide: {
    gap: space.xs,
  },
  /* Yalnız punto küçülür; ağırlık (medium, kazananda semibold) cName'den gelir. */
  dName: {
    fontSize: type.labelSm.fontSize,
    lineHeight: type.labelSm.lineHeight,
  },
  dCenter: {
    width: DENSE_CENTER_W,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  dScore: {
    ...type.scoreXs,
    color: colors.textPrimary,
  },
  dTime: {
    ...type.scoreXs,
    fontFamily: fonts.display,
    color: colors.textPrimary,
  },
  dState: {
    ...type.micro,
    color: colors.textTertiary,
  },
  cDivider: {
    position: "absolute",
    left: space.md,
    right: space.md,
    bottom: 0,
    height: hairline,
    backgroundColor: colors.separator,
  },
});
