/**
 * Scoreboard — MAÇIN SKOR KAHRAMANI. Sayfanın tek sahne nesnesi.
 *
 * NE: atmosferin (`MatchAtmosphere`) ortasında duran gece kartı. Zemin
 * `gradientInk`, üstünde kayan `Aurora` ışığı; canlı maçta kenarda dolaşan
 * `GlowRim`. Kart sahneyle kâğıt arasındaki köprüdür.
 *
 * DİZİLİŞ (yukarıdan aşağı, tek bakışta okunma sırası):
 *
 *            [🏆 FREELİG · 15. SEZON]          ← yarışma, cam hap
 *    ◎arma◎      16 – 1        ◎arma◎          ← parlak halkalı armalar, Odometer skor
 *    EV ADI    ( ✓ MS · İY 6–0 )   DEP ADI     ← durum hapı (MS / İY / canlı halka)
 *   ┌───────────── ⚽ GOLLER ──────────────┐
 *   │  F. KAAN 1'  ⚽  │  ⚽  Y. MUMCU 46'  │    ← iki sütun, ikonlu
 *   └──────────────────────────────────────┘
 *    [📅 Bugün · 20:00]  [📍 Ostim 1]          ← künye cam hapları
 *    [ ★ Takip et ]  [ ⤴ Paylaş ]              ← takip + paylaşım
 *
 * KAZANAN PARLAR: biten maçta kazananın armasını imza degradeli halka ve mor
 * parıltı sarar; kaybedenin adı ve rakamı sönükleşir. Canlı maçta iki taraf
 * da tam parlaklıktadır.
 *
 * GOLCÜLER SINIRLI: her tarafta EN FAZLA DÖRT satır, üç golden fazlası "×7"
 * olarak toplanır, taşan "+2 golcü" diye özetlenir. Tam döküm Özet'in zaman
 * tünelindedir.
 *
 * DÖRT DURUM:
 *   · Oynanmamış — ortada başlama saati; hap günü, altında geri sayım karoları.
 *   · Canlı      — hapın içinde kendi kendine ilerleyen dakika halkası
 *                  (`MinuteRing`) + "CANLI"; devre arasında halka "İY"de durur.
 *   · Bitti      — "MS" hapı (+ tutarlıysa ilk yarı skoru), kazanan vurgulu.
 *   · Yükleniyor — `ScoreboardSkeleton` (aynı kart, aynı ölçüler, içi boş).
 *
 * PERFORMANS: canlı sayaç saniyede bir tikler; tik yalnız `LiveRing`
 * bileşenini yeniden çizer, tabloyu değil. Geri sayım da kendi bileşenindedir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FollowActions, type FollowExtraAction } from "@/components/FollowActions";
import {
  Aurora,
  EventIcon,
  GlowRim,
  HeaderToneContext,
  MinuteRing,
  Odometer,
  Reveal,
  TeamLogo,
  Touchable,
} from "@/components/ui";
import { useLiveClock } from "@/hooks/useLiveMatch";
import { formatDateLong, formatDateShort, formatDayHeading, formatTime } from "@/lib/format";
import { scoreDelta } from "@/lib/match";
import { colors, fonts, glowStyle, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";
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

/** Arma halkası: arma + 3px halka + 4px nefes. */
const CREST = layout.crestXl;
const HALO = CREST + 16;

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
  /** Verilirse eylem şeridinde "Paylaş" düğmesi çizilir (başlıktaki ikonla aynı iş). */
  onShare?: () => void;
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
  onShare,
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
   * söylemektir: kazananın arması parlar, kaybedenin adı ve rakamı sönükleşir.
   */
  const decided = state === "finished" && homeScore != null && awayScore != null;
  const homeWon = decided && (homeScore as number) > (awayScore as number);
  const awayWon = decided && (awayScore as number) > (homeScore as number);

  const halftimeScore = useHalftimeScore(timeline, homeTeamId, awayTeamId, homeScore, awayScore, state);

  const extra = useMemo<FollowExtraAction[]>(() => {
    const list: FollowExtraAction[] = [];
    if (state === "scheduled") list.push({ icon: "calendar-outline", label: "Takvime ekle", onPress: onAddToCalendar });
    if (onShare) list.push({ icon: "share-social-outline", label: "Paylaş", onPress: onShare });
    return list;
  }, [onAddToCalendar, onShare, state]);

  const hasScorers = played && (scorers.home.length > 0 || scorers.away.length > 0);
  const league = upperTR([match.league_name, match.match_season].filter(Boolean).join(" · "));
  const kickoff = formatTime(match.time);

  /* Künye hapları: tarih (oynanmış maçta saatle birlikte) ve saha. Oynanmamış
     maçta saat zaten kartın ortasında kocaman yazılı; hapta yalnız gün. */
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
      <View style={[styles.card, live ? styles.cardLive : null]}>
        <LinearGradient
          colors={colors.gradientInk}
          start={INK_START}
          end={INK_END}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Aurora variant="stage" style={StyleSheet.absoluteFill} />
        {live ? <GlowRim radius={radius.xxl} color={colors.liveOnDark} /> : null}

        {/* — Yarışma: kartın tepesinde cam hap — */}
        {league ? (
          <View style={styles.leagueRow}>
            <View style={styles.leaguePill}>
              <Ionicons name="trophy" size={11} color={colors.brandOnDark} />
              <Text style={styles.league} numberOfLines={1} {...textScale.badge}>
                {league}
              </Text>
            </View>
          </View>
        ) : null}

        {/* — Takımlar ve skor — */}
        <View style={styles.teams}>
          <TeamColumn
            name={match.first_team_name}
            role="EV SAHİBİ"
            logo={homeLogo}
            winner={homeWon}
            dimmed={awayWon}
            onPress={homeTeamId ? openHome : undefined}
          />

          <View style={styles.middle} accessible accessibilityLabel={scoreSpeech}>
            {played ? (
              <View style={styles.scoreRow}>
                <Odometer value={homeScore ?? 0} style={[styles.score, awayWon ? styles.scoreDim : null]} />
                <Text style={styles.scoreDash} {...textScale.badge}>
                  –
                </Text>
                <Odometer value={awayScore ?? 0} style={[styles.score, homeWon ? styles.scoreDim : null]} />
              </View>
            ) : (
              <Text style={styles.kickoff} {...textScale.dense}>
                {kickoff || "—"}
              </Text>
            )}

            {/* Durum hapı skorun ALTINDA: göz önce skoru, sonra onun ne
                zamana ait olduğunu okur. */}
            <StatusPill state={state} snapshot={snapshot} date={match.date} halftimeScore={halftimeScore} />

            {live ? (
              <LivePeriod snapshot={snapshot} />
            ) : state === "scheduled" ? (
              <Countdown target={kickoffAt(match)} />
            ) : null}
          </View>

          <TeamColumn
            name={match.second_team_name}
            role="DEPLASMAN"
            logo={awayLogo}
            winner={awayWon}
            dimmed={homeWon}
            onPress={awayTeamId ? openAway : undefined}
          />
        </View>

        {/* — Golcüler: cam panelde iki sütun — */}
        {hasScorers ? (
          <Reveal index={1} distance={6}>
            <View style={styles.scorersPanel}>
              <View style={styles.scorersHead}>
                <View style={styles.headLine} />
                <EventIcon kind="goal" size={12} onDark />
                <Text style={styles.scorersTitle} {...textScale.badge}>
                  GOLLER
                </Text>
                <View style={styles.headLine} />
              </View>
              <View style={styles.scorers}>
                <ScorerColumn lines={scorers.home} side="home" />
                <View style={styles.scorersAxis} />
                <ScorerColumn lines={scorers.away} side="away" />
              </View>
            </View>
          </Reveal>
        ) : null}

        {/* — Künye — */}
        <View style={styles.facts}>
          {dateChip ? <FactChip icon="calendar-clear" label={dateChip} /> : null}
          {match.match_field ? <FactChip icon="location" label={match.match_field} /> : null}
        </View>

        {/* — Takip + paylaşım — */}
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

/**
 * Arma halkası + ad. Kazananın halkası imza degradesi ve parıltı taşır;
 * diğerleri ince cam halka. Dokununca takım sayfası.
 */
const TeamColumn = memo(function TeamColumn({
  name,
  role,
  logo,
  winner,
  dimmed,
  onPress,
}: {
  name: string;
  role: string;
  logo: string | null;
  winner: boolean;
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
      <Reveal scaleFrom={0.86} distance={0}>
        <View style={[styles.halo, winner ? glowStyle(colors.glow, 3) : null]}>
          <LinearGradient
            colors={winner ? colors.gradientSignature : colors.rimDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.haloRing]}
          />
          <View style={styles.haloInner}>
            <TeamLogo name={name} logo={logo} size={CREST} dimmed={dimmed} />
          </View>
          {winner ? (
            <View style={styles.crown}>
              <Ionicons name="trophy" size={10} color={colors.onDark} />
            </View>
          ) : null}
        </View>
      </Reveal>
      <Text
        style={[styles.teamName, nameFit(name), dimmed ? styles.teamNameDim : null]}
        numberOfLines={2}
        {...textScale.dense}
      >
        {name}
      </Text>
      <Text style={styles.teamRole} {...textScale.badge}>
        {role}
      </Text>
    </Touchable>
  );
});

/**
 * Uzun TEK KELİMELİ adlar ("MENDERESGÜCÜ") sütuna sığmayıp hece ortasından
 * kırılıyordu. Satır kırılmaz; en uzun kelimeye göre punto bir-iki kademe iner.
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
 *   oynanmamış → "BUGÜN" / "YARIN" / "PERŞEMBE" — maçın günü (saat üstte)
 *   canlı      → pembe çerçeve + dakika halkası + ilerleyen dakika
 *   devre arası→ halka "İY"de durur, hap söner
 *   bitti      → "✓ MS" (+ "İY 6–0")
 */
const StatusPill = memo(function StatusPill({
  state,
  snapshot,
  date,
  halftimeScore,
}: {
  state: MatchState;
  snapshot: LiveSnapshot | undefined;
  date: string | null | undefined;
  halftimeScore: string | null;
}) {
  if (state === "live") {
    const halftime = isHalftime(snapshot);
    return (
      <View
        style={[styles.pill, styles.pillRing, halftime ? null : styles.pillLive]}
        accessibilityLabel={halftime ? "Devre arası" : undefined}
      >
        <LiveRing snapshot={snapshot} />
        {halftime ? (
          <Text style={styles.pillText} {...textScale.badge}>
            DEVRE ARASI
          </Text>
        ) : (
          /* Dakika halkanın içinde yazılı; hap yalnız "CANLI" der. */
          <Text style={[styles.pillText, styles.pillTextLive]} {...textScale.badge}>
            CANLI
          </Text>
        )}
      </View>
    );
  }

  if (state === "finished") {
    return (
      <View style={styles.pill} accessibilityLabel={halftimeScore ? `Maç sonu, ilk yarı ${halftimeScore}` : "Maç sonu"}>
        <View style={styles.pillCheck}>
          <Ionicons name="checkmark" size={10} color={colors.onDark} />
        </View>
        <Text style={[styles.pillText, styles.pillTextStrong]} {...textScale.badge}>
          MS
        </Text>
        {halftimeScore ? (
          <>
            <View style={styles.pillSep} />
            <Text style={styles.pillText} {...textScale.badge}>
              {`İY ${halftimeScore}`}
            </Text>
          </>
        ) : null}
      </View>
    );
  }

  /* Oynanmamış maçta tarih zaten künye hapında yazılı; hap GÜNÜ söyler. */
  const heading = formatDayHeading(date);
  const relative = heading === "Bugün" || heading === "Yarın" || heading === "Dün";
  const label = upperTR(relative ? heading : weekdayOf(date));
  return (
    <View style={styles.pill}>
      <Ionicons name="time" size={11} color={colors.brandOnDark} />
      <Text style={styles.pillText} numberOfLines={1} {...textScale.badge}>
        {label || "YAKLAŞAN"}
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

/**
 * Hapın içindeki dakika halkası. `useLiveClock` SANİYEDE BİR tikler; bu
 * yüzden tablo gövdesinde değil burada çağrılır.
 */
const LiveRing = memo(function LiveRing({ snapshot }: { snapshot: LiveSnapshot | undefined }) {
  const clockMs = useLiveClock(snapshot);
  const { minute, added } = minuteParts(clockMs);
  const speech = isHalftime(snapshot) ? "Devre arası" : minute == null ? "Maç canlı" : `Canlı, ${minute}. dakika`;
  return (
    <View accessible accessibilityLabel={speech}>
      <MinuteRing minute={minute} addedTime={added} halftime={isHalftime(snapshot)} size={24} thickness={2} onDark />
    </View>
  );
});

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
 * Geri sayım — oynanmamış maçta hapın altında üç küçük cam karo:
 * [2 GÜN] [04 SA] [12 DK]; son saatte [DK] [SN]. Kendi bileşeninde tikler.
 */
const Countdown = memo(function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    // Bir saatten uzaksa yarım dakikada bir tik yeter; son saatte saniyelik.
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

  const cells: { value: string; unit: string }[] =
    days > 0
      ? [
          { value: String(days), unit: "GÜN" },
          { value: pad2(hours), unit: "SA" },
          { value: pad2(minutes), unit: "DK" },
        ]
      : hours > 0
        ? [
            { value: String(hours), unit: "SA" },
            { value: pad2(minutes), unit: "DK" },
          ]
        : [
            { value: pad2(minutes), unit: "DK" },
            { value: pad2(seconds), unit: "SN" },
          ];

  const speech = cells.map((cell) => `${cell.value} ${cell.unit.toLocaleLowerCase("tr-TR")}`).join(" ") + " sonra";
  return (
    <View style={styles.countdown} accessible accessibilityLabel={speech}>
      {cells.map((cell) => (
        <View key={cell.unit} style={styles.countCell}>
          <Odometer value={cell.value} style={styles.countValue} />
          <Text style={styles.countUnit} {...textScale.badge}>
            {cell.unit}
          </Text>
        </View>
      ))}
    </View>
  );
});

/**
 * Bir tarafın golcüleri. Ev sahibi sütunu sağa (eksene), deplasman sola
 * yaslıdır; top ikonu eksenin dibinde durur, göz ortadaki çizgiyi takip eder.
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
        <View key={group.key} style={styles.scorerRow}>
          {home ? null : <EventIcon kind={group.ownGoal ? "ownGoal" : "goal"} size={11} onDark />}
          <Text style={[styles.scorer, home ? styles.alignRight : null]} numberOfLines={1} {...textScale.dense}>
            {group.name}
            {group.ownGoal ? " (k.k.)" : ""}
          </Text>
          <Text style={styles.scorerMinutes} numberOfLines={1} {...textScale.badge}>
            {minutesLabel(group)}
          </Text>
          {home ? <EventIcon kind={group.ownGoal ? "ownGoal" : "goal"} size={11} onDark /> : null}
        </View>
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

/** Künye hapı — ikon karosu + tek satır metin, cam dolgu. */
const FactChip = memo(function FactChip({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.fact}>
      <View style={styles.factIcon}>
        <Ionicons name={icon} size={10} color={colors.onDark} />
      </View>
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

/** Orta sütun: "16 – 1" ve "22:30" rahat sığar, iki takım sütunu eşit kalır. */
const MIDDLE_WIDTH = 132;

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
  cardLive: {
    borderColor: colors.liveOnDark,
  },

  /* — Yarışma hapı — */
  leagueRow: {
    alignItems: "center",
    marginBottom: space.md,
    paddingHorizontal: space.lg,
  },
  leaguePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    maxWidth: "100%",
    height: 22,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  league: {
    ...type.overline,
    color: colors.brandOnDark,
    flexShrink: 1,
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
    height: 26,
    marginTop: space.sm,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  pillRing: {
    height: 32,
    paddingLeft: space.xs,
  },
  pillLive: {
    borderColor: colors.liveOnDark,
  },
  pillCheck: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.win,
    alignItems: "center",
    justifyContent: "center",
  },
  pillSep: {
    width: hairline,
    height: 12,
    backgroundColor: colors.inkPillBorder,
  },
  pillText: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  pillTextStrong: {
    color: colors.onDark,
    fontFamily: fonts.bold,
  },
  pillTextLive: {
    color: colors.liveOnDark,
    fontFamily: fonts.bold,
  },

  /* — Takımlar + skor — */
  teams: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: space.sm,
  },
  team: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xxs,
    borderRadius: radius.md,
  },
  halo: {
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  haloRing: {
    borderRadius: HALO / 2,
  },
  haloInner: {
    width: HALO - 6,
    height: HALO - 6,
    borderRadius: (HALO - 6) / 2,
    backgroundColor: colors.inkBlock,
    alignItems: "center",
    justifyContent: "center",
  },
  crown: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: colors.inkBlock,
    alignItems: "center",
    justifyContent: "center",
  },
  teamName: {
    ...type.h4,
    color: colors.onDark,
    textAlign: "center",
    paddingHorizontal: space.xxs,
  },
  teamNameSm: {
    ...type.labelSm,
  },
  teamNameXs: {
    ...type.labelXs,
  },
  teamNameDim: {
    color: colors.onDarkMuted,
  },
  teamRole: {
    ...type.overline,
    color: colors.onDarkMuted,
    opacity: 0.8,
  },
  middle: {
    width: MIDDLE_WIDTH,
    alignItems: "center",
    minHeight: HALO,
    justifyContent: "center",
    paddingTop: space.xs,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  score: {
    ...type.scoreJumbo,
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
    marginTop: space.xs,
  },

  /* — Geri sayım — */
  countdown: {
    flexDirection: "row",
    gap: space.xs,
    marginTop: space.sm,
  },
  countCell: {
    minWidth: 36,
    alignItems: "center",
    paddingVertical: space.xxs,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  countValue: {
    ...type.scoreXs,
    color: colors.onDark,
  },
  countUnit: {
    ...type.overline,
    color: colors.onDarkMuted,
  },

  /* — Golcüler — */
  scorersPanel: {
    marginTop: space.lg,
    marginHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  scorersHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  headLine: {
    flex: 1,
    height: hairline,
    backgroundColor: colors.borderOnDark,
  },
  scorersTitle: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  scorers: {
    flexDirection: "row",
    paddingHorizontal: space.md,
    gap: space.sm,
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
  scorerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    maxWidth: "100%",
  },
  scorer: {
    ...type.labelSm,
    color: colors.onDark,
    flexShrink: 1,
  },
  scorerMinutes: {
    ...type.numSm,
    color: colors.brandOnDark,
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
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    maxWidth: "100%",
    height: 28,
    paddingLeft: space.xs,
    paddingRight: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  factIcon: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
    alignItems: "center",
    justifyContent: "center",
  },
  factText: {
    ...type.caption,
    color: colors.onDark,
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
  ghostPill: { width: 120, height: 22 },
  ghostCrest: { width: HALO, height: HALO, borderRadius: HALO / 2 },
  ghostLine: { width: 84, height: 12, marginTop: space.xs },
  ghostScore: { width: 104, height: 48, borderRadius: radius.md },
  ghostChip: { width: 120, height: 28 },
  ghostButton: { height: 40 },
});
