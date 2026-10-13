/**
 * Scoreboard — MAÇIN SKOR TABLOSU. Sayfanın tek sahne nesnesi.
 *
 * NE: atmosferin (`MatchAtmosphere`) ortasında duran grafit bir kart. Üst
 * yarısı koyu sahnenin, alt yarısı kâğıdın üstündedir; kart sahneyle kâğıt
 * arasındaki köprüdür. Zemini `gradientInk` (yatay, sağdan sola), kenarı
 * ince `glassBorder` — yarı saydam zemin DENENDİ ve okunmadı: sayfanın en
 * önemli tek bilgisi arkasındaki dokunun insafına bırakılamaz.
 *
 * DİZİLİŞ (yukarıdan aşağı, tek bakışta okunma sırası):
 *
 *            FREELİG · 15. SEZON            ← yarışma (lavanta versal)
 *    [arma]      2 – 1       [arma]         ← skor kahramandır (Archivo 40)
 *    EV ADI   ( ● 67' )      DEP ADI        ← durum hapı skorun altında
 *               2. YARI                     ← yarı / İY skoru / geri sayım
 *   ────────────── ⚽ ──────────────
 *       A. YILMAZ 12'  ·  K. DEMİR 55'      ← "kim attı": en çok sorulan soru
 *   ─────────────────────────────────
 *    📅 15 Ekim · 20:30   📍 Ostim 1         ← künye çipleri
 *    [ ★ Takip et ]  [ Takvime ekle ]       ← takip + o maçın bildirimleri
 *
 * GOLCÜLER YENİDEN TABLODA, AMA SINIRLI: eski sürüm 9-5 biten bir maçta
 * tabloyu dokuz satırlık bir dökümle yaran golcüleri Özet'e taşımıştı. Oysa
 * "kim attı", skorun hemen ardından gelen sorudur; Apple Sports ve FotMob da
 * golcüyü skorun altında verir. Çözüm: her tarafta EN FAZLA DÖRT oyuncu,
 * üç golden fazlası "×7" olarak toplanır, taşan "+2 golcü" diye özetlenir.
 * Tam döküm Özet'in zaman tünelindedir.
 *
 * DÖRT DURUM:
 *   · Oynanmamış — ortada başlama saati; hap günü, altındaki satır geri sayımı.
 *   · Canlı      — kırmızı çerçeveli hapta kendi kendine ilerleyen dakika;
 *                  devre arasında hap söner.
 *   · Bitti      — "MAÇ SONU" hapı, kazanan vurgulu, (tutarlıysa) ilk yarı skoru.
 *   · Yükleniyor — `ScoreboardSkeleton` (aynı kart, aynı ölçüler, içi boş).
 *
 * PERFORMANS: canlı sayaç saniyede bir tikler; tik yalnız `MatchClock`
 * bileşenini yeniden çizer, tabloyu değil. Geri sayım da kendi bileşenindedir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FollowActions, type FollowExtraAction } from "@/components/FollowActions";
import { EventIcon, HeaderToneContext, TeamLogo, Touchable } from "@/components/ui";
import { useLiveClock } from "@/hooks/useLiveMatch";
import { formatDateLong, formatDateShort, formatDayHeading, formatTime } from "@/lib/format";
import { scoreDelta } from "@/lib/match";
import { colors, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";
import type { ApiMatch, ApiMatchEvent, LiveSnapshot, MatchState } from "@/lib/types";
import {
  groupScorers,
  isHalftime,
  kickoffAt,
  minuteParts,
  pad2,
  type GoalGroup,
  type ScorerLine,
} from "./shared";

/** Kartın yüzey gradyanı — ışık daima sağdan gelir. */
const INK_START = { x: 1, y: 0.5 } as const;
const INK_END = { x: 0, y: 0.5 } as const;

/** Tarafta gösterilecek en fazla golcü satırı. */
const MAX_SCORER_ROWS = 4;
/** Bir oyuncunun dakikaları bu sayıyı geçerse "×N" olarak toplanır. */
const MAX_MINUTES_INLINE = 3;

export interface ScoreboardProps {
  match: ApiMatch;
  state: MatchState;
  snapshot: LiveSnapshot | undefined;
  homeScore: number | null;
  awayScore: number | null;
  homeLogo: string | null;
  awayLogo: string | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
  scorers: { home: ScorerLine[]; away: ScorerLine[] };
  /** Zaman tüneli olayları (eskiden yeniye) — ilk yarı skoru buradan. */
  timeline: ApiMatchEvent[];
  following: boolean;
  onToggleFollow: () => void;
  onOpenNotifications: () => void;
  onAddToCalendar: () => void;
}

export const Scoreboard = memo(function Scoreboard({
  match,
  state,
  snapshot,
  homeScore,
  awayScore,
  homeLogo,
  awayLogo,
  homeTeamId,
  awayTeamId,
  scorers,
  timeline,
  following,
  onToggleFollow,
  onOpenNotifications,
  onAddToCalendar,
}: ScoreboardProps) {
  const router = useRouter();
  const live = state === "live";
  const played = state !== "scheduled";

  const openHome = useCallback(() => {
    if (homeTeamId) router.push(`/takim/${homeTeamId}`);
  }, [homeTeamId, router]);
  const openAway = useCallback(() => {
    if (awayTeamId) router.push(`/takim/${awayTeamId}`);
  }, [awayTeamId, router]);

  /*
   * KAZANANI VURGULA. Bir skor tablosunun ilk işi "kim kazandı"yı bir bakışta
   * söylemektir: kaybeden tarafın adı ve rakamı sönükleşir. Canlı maçta
   * sonuç henüz yoktur — iki taraf da tam parlaklıkta kalır.
   */
  const decided = state === "finished" && homeScore != null && awayScore != null;
  const homeWon = decided && (homeScore as number) > (awayScore as number);
  const awayWon = decided && (awayScore as number) > (homeScore as number);

  const halftimeScore = useHalftimeScore(timeline, homeTeamId, awayTeamId, homeScore, awayScore, state);

  const extra = useMemo<FollowExtraAction[]>(
    () =>
      state === "scheduled"
        ? [{ icon: "calendar-outline", label: "Takvime ekle", onPress: onAddToCalendar }]
        : [],
    [onAddToCalendar, state],
  );

  const hasScorers = played && (scorers.home.length > 0 || scorers.away.length > 0);
  const league = upperTR([match.league_name, match.match_season].filter(Boolean).join(" · "));
  const kickoff = formatTime(match.time);

  /* Künye çipleri: tarih (oynanmış maçta saatle birlikte) ve saha. Oynanmamış
     maçta saat zaten tablonun ortasında kocaman yazılı; çipte yalnız gün. */
  const heading = formatDayHeading(match.date);
  const relativeDay = heading === "Bugün" || heading === "Dün" || heading === "Yarın";
  const dateChip = played
    ? [relativeDay ? heading : formatDateShort(match.date), kickoff].filter(Boolean).join(" · ")
    : formatDateLong(match.date) || null;

  const scoreSpeech = played
    ? `${match.first_team_name} ${homeScore ?? 0}, ${match.second_team_name} ${awayScore ?? 0}${
        live ? ", maç canlı" : ", maç sonu"
      }${halftimeScore ? `, ilk yarı ${halftimeScore}` : ""}`
    : `${match.first_team_name} ile ${match.second_team_name}, başlama ${kickoff || "belirsiz"}`;

  return (
    <HeaderToneContext.Provider value="ink">
      <View style={styles.card}>
        <LinearGradient
          colors={colors.gradientInk}
          start={INK_START}
          end={INK_END}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* — Lig · sezon: tablonun künye satırı. Başlık satırında da durabilirdi
            ama orada geri okunun üstünde asılı kalıyordu; kartın tepesinde
            maçın hangi yarışmaya ait olduğunu skorla aynı nesnede söyler. — */}
        {league ? (
          <Text style={styles.league} numberOfLines={1} {...textScale.badge}>
            {league}
          </Text>
        ) : null}

        {/* — Takımlar ve skor — */}
        <View style={styles.teams}>
          <TeamColumn
            name={match.first_team_name}
            logo={homeLogo}
            dimmed={awayWon}
            onPress={homeTeamId ? openHome : undefined}
          />

          <View style={styles.middle} accessible accessibilityLabel={scoreSpeech}>
            {played ? (
              <View style={styles.scoreRow}>
                <Text style={[styles.score, awayWon ? styles.scoreDim : null]} {...textScale.dense}>
                  {homeScore ?? 0}
                </Text>
                <Text style={styles.scoreDash} {...textScale.dense}>
                  –
                </Text>
                <Text style={[styles.score, homeWon ? styles.scoreDim : null]} {...textScale.dense}>
                  {awayScore ?? 0}
                </Text>
              </View>
            ) : (
              <Text style={styles.kickoff} {...textScale.dense}>
                {kickoff || "—"}
              </Text>
            )}

            {/* Durum hapı skorun ALTINDA (FotMob'un "FT" yeri): göz önce skoru,
                sonra onun ne zamana ait olduğunu okur. */}
            <StatusPill state={state} snapshot={snapshot} date={match.date} />

            {live ? (
              <LivePeriod snapshot={snapshot} />
            ) : state === "scheduled" ? (
              <Countdown target={kickoffAt(match)} />
            ) : halftimeScore ? (
              <Text style={styles.subline} {...textScale.badge}>
                {`İY ${halftimeScore}`}
              </Text>
            ) : null}
          </View>

          <TeamColumn
            name={match.second_team_name}
            logo={awayLogo}
            dimmed={homeWon}
            onPress={awayTeamId ? openAway : undefined}
          />
        </View>

        {/* — Golcüler — */}
        {hasScorers ? (
          <>
            <View style={styles.rule}>
              <View style={styles.ruleLine} />
              <EventIcon kind="goal" size={12} onDark />
              <View style={styles.ruleLine} />
            </View>
            <View style={styles.scorers}>
              <ScorerColumn lines={scorers.home} side="home" />
              <View style={styles.scorersAxis} />
              <ScorerColumn lines={scorers.away} side="away" />
            </View>
          </>
        ) : null}

        {/* — Künye — */}
        <View style={[styles.facts, hasScorers ? styles.factsRuled : null]}>
          {dateChip ? <FactChip icon="calendar-outline" label={dateChip} /> : null}
          {match.match_field ? <FactChip icon="location-outline" label={match.match_field} /> : null}
        </View>

        {/* Bağlantı durumu tabloda değil, Canlı sekmesinin panelinde: tablo her
            sekmede aynı yüksekliği korur, uyarı kendi bağlamında okunur. */}

        {/* — Takip — */}
        <View style={styles.follow}>
          <FollowActions
            following={following}
            onToggleFollow={onToggleFollow}
            onOpenNotifications={onOpenNotifications}
            extra={extra}
          />
        </View>
      </View>
    </HeaderToneContext.Provider>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Parçalar
   ══════════════════════════════════════════════════════════════════════════ */

/** Arma + ad. Dokununca takım sayfası. */
const TeamColumn = memo(function TeamColumn({
  name,
  logo,
  dimmed,
  onPress,
}: {
  name: string;
  logo: string | null;
  dimmed: boolean;
  onPress?: () => void;
}) {
  return (
    <Touchable
      style={styles.team}
      feedback="card"
      haptic="selection"
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={onPress ? `${name} takım sayfası` : name}
    >
      <TeamLogo name={name} logo={logo} size={layout.crestXl} />
      <Text
        style={[styles.teamName, nameFit(name), dimmed ? styles.teamNameDim : null]}
        numberOfLines={2}
        {...textScale.dense}
      >
        {name}
      </Text>
    </Touchable>
  );
});

/**
 * Uzun TEK KELİMELİ adlar ("MENDERESGÜCÜ") 107px'lik sütuna sığmayıp hece
 * ortasından kırılıyordu ("MENDERESGÜC / Ü"). Satır kırılmaz; en uzun kelimeye
 * göre punto bir-iki kademe iner.
 */
function nameFit(name: string) {
  const longest = String(name ?? "")
    .split(/\s+/)
    .reduce((max, word) => Math.max(max, word.length), 0);
  if (longest > 13) return styles.teamNameXs;
  if (longest > 10) return styles.teamNameSm;
  return null;
}

/**
 * Durum hapı — skorun altında, ortada.
 *
 *   oynanmamış → "BUGÜN" / "YARIN" / "15 EKİ" — maçın günü (saat üstte)
 *   canlı      → kırmızı çerçeve + nokta + kendi kendine ilerleyen dakika
 *   bitti      → "MAÇ SONU"
 */
const StatusPill = memo(function StatusPill({
  state,
  snapshot,
  date,
}: {
  state: MatchState;
  snapshot: LiveSnapshot | undefined;
  date: string | null | undefined;
}) {
  if (state === "live") {
    /* Devre arasında hap SÖNER: sayaç durmuştur, kırmızı "şu an oluyor"
       demek olurdu. Nokta kalır — maç hâlâ canlı yayındadır. */
    if (isHalftime(snapshot)) {
      return (
        <View style={styles.pill} accessibilityLabel="Devre arası">
          <View style={[styles.pillDot, styles.pillDotPaused]} />
          <Text style={styles.pillText} {...textScale.badge}>
            DEVRE ARASI
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.pill, styles.pillLive]}>
        <View style={styles.pillDot} />
        <MatchClock snapshot={snapshot} />
      </View>
    );
  }

  /* Oynanmamış maçta tarih zaten künye çipinde yazılı; hap GÜNÜ söyler:
     "BUGÜN", "YARIN" ya da haftanın günü. */
  const heading = formatDayHeading(date);
  const relative = heading === "Bugün" || heading === "Yarın" || heading === "Dün";
  const label = state === "finished" ? "MAÇ SONU" : upperTR(relative ? heading : weekdayOf(date));
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
    </View>
  );
});

/** "Perşembe" — tarih okunamazsa boş. */
function weekdayOf(date: string | null | undefined): string {
  const parsed = date ? new Date(date) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("tr-TR", { weekday: "long" });
}

/** Canlı maçın yarısı — hapın altında ("2. YARI"); devre arasında boş. */
const LivePeriod = memo(function LivePeriod({ snapshot }: { snapshot: LiveSnapshot | undefined }) {
  if (isHalftime(snapshot)) return null;
  const period = snapshot?.period === 1 || snapshot?.period === 2 ? snapshot.period : null;
  if (!period) return null;
  return (
    <Text style={styles.subline} {...textScale.badge}>
      {`${period}. YARI`}
    </Text>
  );
});

/**
 * Canlı dakika — skorun altında. `useLiveClock` SANİYEDE BİR tikler; bu yüzden
 * tablo gövdesinde değil burada çağrılır.
 */
const MatchClock = memo(function MatchClock({ snapshot }: { snapshot: LiveSnapshot | undefined }) {
  const clockMs = useLiveClock(snapshot);
  const halftime = isHalftime(snapshot);
  const { minute, added } = minuteParts(clockMs);

  const label = halftime ? "DEVRE ARASI" : minute == null ? "CANLI" : added != null ? `90+${added}'` : `${minute}'`;
  const speech = halftime ? "Devre arası" : minute == null ? "Maç canlı" : `Canlı, ${minute}. dakika`;
  return (
    <Text style={[styles.pillText, styles.pillTextLive]} accessibilityLabel={speech} {...textScale.badge}>
      {label}
    </Text>
  );
});

/** Geri sayım — oynanmamış maçta başlama saatinin altında, kendi bileşeninde tikler. */
const Countdown = memo(function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    // Bir saatten uzaksa dakikada bir tik yeter; son saatte saniyelik.
    const far = target - Date.now() > 3_600_000;
    const timer = setInterval(() => setNow(Date.now()), far ? 30_000 : 1_000);
    return () => clearInterval(timer);
  }, [target]);

  if (!target) return null;
  const diff = target - now;
  if (diff <= 0) {
    return (
      <Text style={styles.subline} {...textScale.badge}>
        BAŞLAMAK ÜZERE
      </Text>
    );
  }

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);

  const label =
    days > 0
      ? `${days} gün ${hours} sa sonra`
      : hours > 0
        ? `${hours} sa ${pad2(minutes)} dk sonra`
        : `${pad2(minutes)}:${pad2(seconds)}`;

  return (
    <Text style={styles.subline} {...textScale.dense}>
      {upperTR(label)}
    </Text>
  );
});

/**
 * Bir tarafın golcüleri. Ev sahibi sütunu sağa (eksene), deplasman sola
 * yaslıdır; göz ortadaki tek bir dikey çizgiyi takip eder.
 */
const ScorerColumn = memo(function ScorerColumn({
  lines,
  side,
}: {
  lines: ScorerLine[];
  side: "home" | "away";
}) {
  const groups = useMemo(() => groupScorers(lines), [lines]);
  const shown = groups.slice(0, MAX_SCORER_ROWS);
  const hidden = groups.length - shown.length;
  const home = side === "home";

  return (
    <View style={[styles.scorerCol, home ? styles.scorerColHome : null]}>
      {shown.map((group) => (
        <Text
          key={group.key}
          style={[styles.scorer, home ? styles.alignRight : null]}
          numberOfLines={1}
          {...textScale.dense}
        >
          {group.name}
          {group.ownGoal ? " (k.k.)" : ""}
          <Text style={styles.scorerMinutes}>{` ${minutesLabel(group)}`}</Text>
        </Text>
      ))}
      {hidden > 0 ? (
        <Text style={[styles.scorerMore, home ? styles.alignRight : null]} {...textScale.badge}>
          {`+${hidden} GOLCÜ`}
        </Text>
      ) : null}
    </View>
  );
});

/** "12' 29'" ya da üç golden fazlası için "×7". */
function minutesLabel(group: GoalGroup): string {
  if (group.minutes.length > MAX_MINUTES_INLINE) return `×${group.minutes.length}`;
  return group.minutes.map((minute) => `${minute}'`).join(" ");
}

/** Künye çipi — ikon + tek satır metin, cam dolgu. */
const FactChip = memo(function FactChip({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={12} color={colors.onDarkMuted} />
      <Text style={styles.factText} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   İlk yarı skoru
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * İlk yarı skoru — olay tablosundan TÜRETİLİR, uydurulmaz.
 *
 * GÜVENLİK ŞARTI: olaylardaki gollerin toplamı tablodaki skora eşit olmalı ve
 * olayların devre bilgisi bulunmalı. Skor elle girilmiş (olaysız) bir maçta
 * olaylardan türeyen "İY 1–0" yanlış olurdu; o durumda satır hiç çizilmez.
 */
function useHalftimeScore(
  timeline: ApiMatchEvent[],
  homeTeamId: number | null,
  awayTeamId: number | null,
  homeScore: number | null,
  awayScore: number | null,
  state: MatchState,
): string | null {
  return useMemo(() => {
    if (state !== "finished" || homeScore == null || awayScore == null) return null;
    let home = 0;
    let away = 0;
    let firstHome = 0;
    let firstAway = 0;
    let secondHalfSeen = false;
    for (const event of timeline) {
      const delta = scoreDelta(event, homeTeamId, awayTeamId);
      home += delta.home;
      away += delta.away;
      if (event.devre == null) return null;
      if (event.devre === 1) {
        firstHome += delta.home;
        firstAway += delta.away;
      } else {
        secondHalfSeen = true;
      }
    }
    if (!secondHalfSeen || home !== homeScore || away !== awayScore) return null;
    return `${firstHome}–${firstAway}`;
  }, [awayScore, awayTeamId, homeScore, homeTeamId, state, timeline]);
}

/* ══════════════════════════════════════════════════════════════════════════
   İskelet — aynı kart, içi boş
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Yüklenirken tablo yerinde durur: aynı kart, aynı ölçüler, cam bloklar.
 * Kâğıt iskeleti (`Skeleton`) açık gri parıltı taşır ve grafit kartın
 * üstünde yama gibi duruyordu; burada bloklar sahnenin kendi cam tonudur.
 */
export const ScoreboardSkeleton = memo(function ScoreboardSkeleton() {
  return (
    <View style={styles.card} accessibilityLabel="Maç yükleniyor">
      <LinearGradient
        colors={colors.gradientInk}
        start={INK_START}
        end={INK_END}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.ghostRow}>
        <View style={[styles.ghost, styles.ghostPill]} />
      </View>
      <View style={styles.teams}>
        <View style={styles.team}>
          <View style={[styles.ghost, styles.ghostCrest]} />
          <View style={[styles.ghost, styles.ghostLine]} />
        </View>
        <View style={styles.middle}>
          <View style={[styles.ghost, styles.ghostScore]} />
        </View>
        <View style={styles.team}>
          <View style={[styles.ghost, styles.ghostCrest]} />
          <View style={[styles.ghost, styles.ghostLine]} />
        </View>
      </View>
      <View style={styles.facts}>
        <View style={[styles.ghost, styles.ghostChip]} />
        <View style={[styles.ghost, styles.ghostChip]} />
      </View>
      <View style={styles.follow}>
        <View style={[styles.ghost, styles.ghostButton]} />
      </View>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

/** Orta sütun: "13 – 9" ve "22:30" rahat sığar, iki takım sütunu eşit kalır. */
const MIDDLE_WIDTH = 124;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.xxl,
    borderWidth: hairline,
    borderColor: colors.glassBorder,
    backgroundColor: colors.inkBlock,
    overflow: "hidden",
    paddingTop: space.md,
    paddingBottom: space.lg,
  },

  league: {
    ...type.overline,
    color: colors.brandOnDark,
    textAlign: "center",
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  ghostRow: {
    alignItems: "center",
    marginBottom: space.lg,
  },

  /* — Durum hapı — */
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    height: 22,
    marginTop: space.xs,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  pillLive: {
    borderColor: colors.liveOnDark,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.liveOnDark,
  },
  pillDotPaused: {
    backgroundColor: colors.onDarkMuted,
  },
  pillText: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  pillTextLive: {
    color: colors.liveOnDark,
  },

  /* — Takımlar + skor — */
  teams: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: space.md,
  },
  team: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.md,
  },
  teamName: {
    ...type.h4,
    color: colors.onDark,
    textAlign: "center",
    paddingHorizontal: space.xxs,
  },
  teamNameSm: {
    fontSize: 12,
    lineHeight: 16,
  },
  teamNameXs: {
    fontSize: 11,
    lineHeight: 15,
  },
  teamNameDim: {
    color: colors.onDarkMuted,
  },
  middle: {
    width: MIDDLE_WIDTH,
    alignItems: "center",
    // Skor, armanın (52px) dikey ortasına otursun.
    minHeight: layout.crestXl,
    justifyContent: "center",
    gap: space.xxs,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  score: {
    ...type.scoreHero,
    color: colors.onDark,
  },
  scoreDim: {
    color: colors.onDarkMuted,
  },
  scoreDash: {
    ...type.scoreLg,
    color: colors.onDarkMuted,
  },
  kickoff: {
    ...type.scoreHero,
    color: colors.onDark,
  },
  subline: {
    ...type.overline,
    color: colors.onDarkMuted,
  },

  /* — Golcüler — */
  rule: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.md,
    marginBottom: space.sm,
    paddingHorizontal: space.lg,
  },
  ruleLine: {
    flex: 1,
    height: hairline,
    backgroundColor: colors.borderOnDark,
  },
  scorers: {
    flexDirection: "row",
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  scorersAxis: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.borderOnDark,
  },
  scorerCol: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  scorerColHome: {
    alignItems: "flex-end",
  },
  scorer: {
    ...type.bodySm,
    fontFamily: fonts.medium,
    color: colors.onDark,
  },
  scorerMinutes: {
    ...type.bodySm,
    fontVariant: ["tabular-nums"],
    color: colors.onDarkMuted,
  },
  scorerMore: {
    ...type.micro,
    color: colors.onDarkMuted,
  },
  alignRight: {
    textAlign: "right",
  },

  /* — Künye — */
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space.s,
    marginTop: space.md,
    paddingHorizontal: space.md,
  },
  factsRuled: {
    marginTop: space.md,
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    maxWidth: "100%",
    height: 26,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  factText: {
    ...type.caption,
    color: colors.onDarkMuted,
    flexShrink: 1,
  },

  /* — Takip — */
  follow: {
    marginTop: space.md,
    paddingHorizontal: space.lg,
  },

  /* — İskelet blokları — */
  ghost: {
    backgroundColor: colors.inkTile,
    borderRadius: radius.pill,
  },
  ghostPill: { width: 96, height: 24 },
  ghostCrest: { width: layout.crestXl, height: layout.crestXl, borderRadius: radius.md },
  ghostLine: { width: 84, height: 12, marginTop: space.xs },
  ghostScore: { width: 92, height: 40, borderRadius: radius.md },
  ghostChip: { width: 120, height: 26 },
  ghostButton: { height: 40 },
});
