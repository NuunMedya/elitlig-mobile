/**
 * MatchCard — fikstür ve sonuç listelerinin KART hâli.
 *
 * DÜZEN — iki takım YAN YANA, sonuç ORTADA:
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
 * NEDEN KART: önceki satır düzeni (iki takım üst üste, skor sağda) yoğun bir
 * skor tablosuydu; amblemler 22px'te kalıyor, "kim kime karşı" bilgisi
 * listenin sağ kenarındaki iki küçük rakama sıkışıyordu. Kartta amblem 44px,
 * adlar iki satıra kadar kırılabilir (uzun BÜYÜK HARF adlar kırpılmaz) ve
 * skor ya da başlama saati kartın tam ortasında, en büyük öğe olarak durur.
 *
 * SABİT YÜKSEKLİK: uzun listelerde `getItemLayout` kurulabilsin diye kartın
 * yüksekliği içerikten değil seçeneklerden gelir (`matchCardHeight`). Adlar
 * her zaman İKİ satırlık yer kaplar; tek satırlık ad dikeyde ortalanır.
 *
 * DURUMLAR:
 *   · Oynanmamış → ortada saat (20:30), altında gün ("Yarın").
 *   · Canlı      → skor `live` renginde, altında dakika rozeti; kart kenarı kırmızı.
 *   · Bitti      → skor, altında "MS"; kazanan kalın, kaybeden soluk.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback, useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { colors, elevate, fonts, radius, space, textScale, touchSlop, type } from "@/theme";
import { haptics } from "@/lib/haptics";
import { formatScore, formatTime } from "@/lib/format";
import { matchState } from "@/lib/match";
import type { ApiMatch } from "@/lib/types";
import { GradientFill } from "./GradientFill";
import { LiveBadge } from "./LiveBadge";
import { TeamLogo } from "./TeamLogo";
import { Touchable } from "./Pressable";

export interface MatchCardProps {
  match: ApiMatch;
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** Üst şeritte ne yazsın: lig adı (varsayılan), saha ya da hiçbir şey. */
  meta?: "league" | "field" | "none";
  /** Üst şeridin sağında gün etiketi ("Bugün", "12 Eki Paz"). */
  showDate?: boolean;
  /** Alt şeritte saha adı. */
  showVenue?: boolean;
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

const CREST = 44;
const NAME_LINES = 2;
const NAME_LINE_HEIGHT = type.label.lineHeight;
const PAD_V = space.lg;
const HEAD_H = 18;
const VENUE_H = 26; // ayraç + 16px satır
/** Kartlar arası dikey boşluk — listeler bu değeri satır yüksekliğine ekler. */
export const MATCH_CARD_GAP = space.m;

/** Kart yüksekliği (boşluk HARİÇ). Listeler `getItemLayout` için bunu kullanır. */
export function matchCardHeight(options: { showVenue?: boolean; meta?: "league" | "field" | "none"; showDate?: boolean } = {}): number {
  const head = options.meta === "none" && !options.showDate ? 0 : HEAD_H + space.md;
  const body = CREST + space.s + NAME_LINE_HEIGHT * NAME_LINES;
  const venue = options.showVenue ? VENUE_H + space.sm : 0;
  return PAD_V * 2 + head + body + venue;
}

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/** "Bugün" / "Yarın" / "Dün" / "12 Eki Pzt". Tarih yerel gün olarak okunur. */
export function matchDayLabel(value?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!m) return "";
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${DAYS[date.getDay()]}`;
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

export const MatchCard = memo(function MatchCard({
  match,
  homeLogo,
  awayLogo,
  meta = "league",
  showDate = false,
  showVenue = false,
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
  const showHead = meta !== "none" || showDate || Boolean(onToggleFavorite);

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

  const height = matchCardHeight({ showVenue: showVenue && Boolean(match.match_field), meta, showDate: showDate || Boolean(onToggleFavorite) });

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={speech}
      style={[styles.card, footer ? null : { height }, live && styles.cardLive, style]}
    >
      <GradientFill radius="xl" />

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
          {onToggleFavorite ? (
            <Pressable
              onPress={handleFavorite}
              hitSlop={STAR_SLOP}
              accessibilityRole="button"
              accessibilityState={{ selected: isFavorite }}
              accessibilityLabel={isFavorite ? "Maçı takipten çıkar" : "Maçı takip et"}
              style={styles.star}
            >
              <Ionicons
                name={isFavorite ? "star" : "star-outline"}
                size={16}
                color={isFavorite ? colors.star : colors.starEmpty}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.body}>
        <Side name={match.first_team_name} logo={homeLogo} won={homeWon} lost={awayWon} mine={homeMine} />

        <View style={styles.center}>
          {played ? (
            <Text style={[styles.score, live && styles.scoreLive]} numberOfLines={1} {...textScale.badge}>
              <Text style={awayWon ? styles.scoreDim : null}>{formatScore(match.first_team_score)}</Text>
              <Text style={styles.scoreDash}> – </Text>
              <Text style={homeWon ? styles.scoreDim : null}>{formatScore(match.second_team_score)}</Text>
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
            ) : (
              <Text style={styles.dayUnder} numberOfLines={1} {...textScale.badge}>
                {showDate ? "Oynanacak" : day || "Oynanacak"}
              </Text>
            )}
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

const STAR_SLOP = touchSlop(16);

const styles = StyleSheet.create({
  card: {
    ...elevate(1),
    backgroundColor: colors.surface1,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: PAD_V,
    overflow: "hidden",
  },
  cardLive: {
    borderColor: colors.live,
    borderWidth: 1,
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
  /** Vurgulanan takım: amblemin altında camgöbeği bir çizgi (veri vurgusu). */
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
  nameWon: { fontFamily: fonts.bold },
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  footer: {
    marginTop: space.md,
    paddingTop: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  venueText: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
  },
});
