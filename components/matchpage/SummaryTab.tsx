/**
 * ÖZET / CANLI SEKMESİ — maçın hikâyesi, durumuna göre üç ayrı ekran.
 *
 * TEK SEKME, ÜÇ YÜZ: eskiden canlı maçta hem "Özet" hem "Canlı" sekmesi vardı
 * ve ikisi de aynı olay listesini farklı biçimde gösteriyordu; altı sekme ekrana
 * sığmıyor, kullanıcı "hangisinde ne var" diye ikisini de açıyordu. Artık:
 *
 *   OYNANMAMIŞ — maç öncesi karar verdiren bilgiler: künye (ne zaman, nerede),
 *                iki takımın son beş maçı, aralarındaki geçmiş, ligdeki yerleri.
 *                Hepsi gerçek veridir: maç kaydı, takım maçları, puan tablosu.
 *   CANLI      — sekmenin adı "Özet" kalır, yanında kırmızı nokta; dakika halkası + bağlantı durumu,
 *                ardından en yeni olay üstte akan zaman tüneli.
 *   BİTTİ      — maçın yıldızı, video/rapor, fotoğraflar, zaman tüneli,
 *                öne çıkan istatistikler ve künye.
 *
 * SIRA "EN YENİ ÖNCE" VARSAYILANDIR: maç detayı en çok canlı maçta ve maç
 * biter bitmez açılıyor; o anda merak edilen son olaydır, ilk düdük değil.
 * Hikâyeyi baştan okumak isteyen tek dokunuşla akışı çevirir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
} from "react-native";

import { MatchPhotoSlider } from "@/components/MatchPhotoSlider";
import { LinearGradient } from "expo-linear-gradient";
import {
  Aurora,
  EmptyState,
  FormChips,
  GlowRim,
  IconTile,
  MinuteRing,
  Odometer,
  RankBadge,
  Reveal,
  SectionHeader,
  StatBar,
  TeamLogo,
  Touchable,
  type IconTileTone,
} from "@/components/ui";
import { useLiveClock } from "@/hooks/useLiveMatch";
import { formatDateLong, formatDateShort, formatTime } from "@/lib/format";
import { GoalClipPlayer } from "@/components/live/GoalClipPlayer";
import { useMatchGoalClips } from "@/components/live/MatchGoalClips";
import type { GoalClip } from "@/lib/live/clips";
import { broadcastOf } from "@/lib/matchMedia";
import { openLink } from "@/lib/links";
import { eventKind, matchState } from "@/lib/match";
import { youtubeChannelUrl, youtubeLiveUrl } from "@/lib/youtube";
import {
  colors,
  fonts,
  hairline,
  layout,
  radius,
  space,
  textScale,
  type,
} from "@/theme";
import type { StatRow, TopPlayer } from "@/lib/matchStats";
import type { ApiMatch, ApiMatchEvent, LiveSnapshot, MatchState, StandingRow } from "@/lib/types";
import { InfoRow, PaperCard, partStyles } from "./parts";
import {
  headlineOf,
  isTrivialTitle,
  statLabel,
  isHalftime,
  minuteParts,
  normalizeName,
  refereeOf,
  useFormString,
  useGoalFlash,
  useHeadToHeadTally,
  useTimelineItems,
  type MatchTab,
  type NameOf,
  type ScrollChrome,
  type TimelineItem,
  type TimelineOrder,
} from "./shared";
import { DuelCard, FanVoteCard, useMatchReactions } from "./Community";
import { BroadcastCard, MatchMedia, useBroadcast } from "./MatchMedia";
import { TimelineBreak, TimelineRow } from "./Timeline";
import { AdBanner } from "@/components/ads/AdBanner";

export interface SummaryTabProps {
  match: ApiMatch;
  state: MatchState;
  snapshot: LiveSnapshot | undefined;
  realtime: boolean;
  /** Zaman tüneli olayları, eskiden yeniye. */
  timeline: ApiMatchEvent[];
  homeTeamId: number | null;
  awayTeamId: number | null;
  nameOf: NameOf;
  bestPlayers: TopPlayer[];
  statRows: StatRow[];
  meetings: ApiMatch[];
  homeMatches: ApiMatch[] | undefined;
  awayMatches: ApiMatch[] | undefined;
  standings: StandingRow[] | undefined;
  homeLogo: string | null;
  awayLogo: string | null;
  onOpenTab: (tab: MatchTab) => void;
  scrollProps: ScrollChrome;
  refreshControl: React.ReactElement<RefreshControlProps>;
}

const timelineKey = (item: TimelineItem) => item.key;

export function SummaryTab({
  match,
  state,
  snapshot,
  realtime,
  timeline,
  homeTeamId,
  awayTeamId,
  nameOf,
  bestPlayers,
  statRows,
  meetings,
  homeMatches,
  awayMatches,
  standings,
  homeLogo,
  awayLogo,
  onOpenTab,
  scrollProps,
  refreshControl,
}: SummaryTabProps) {
  const router = useRouter();
  const live = state === "live";
  const scheduled = state === "scheduled";

  const [order, setOrder] = useState<TimelineOrder>("yeni");
  const items = useTimelineItems(timeline, homeTeamId, awayTeamId, state === "finished", order);
  const flashId = useGoalFlash(live ? timeline : EMPTY_EVENTS);

  const openPlayer = useCallback((playerId: number) => router.push(`/oyuncu/${playerId}`), [router]);
  /* Olay tepkileri (gol ve kart satırlarında); planlı maçta olay yok. */
  const reactions = useMatchReactions(Number(match.id), !scheduled);
  const reactionData = reactions.data;
  const onReact = reactions.onReact;

  /* Gol videoları: tek sorgu; şerit (başlıkta), maç akışındaki "Golü izle"
     düğmeleri ve "maçın golü" kartı aynı listeyi paylaşır. Oynatıcı listenin
     DIŞINDA, sekmenin kökünde tek kez durur (tam ekran pencere). */
  const clips = useMatchGoalClips(Number(match.id), live, !scheduled);
  const clipByEvent = useMemo(() => {
    const map = new Map<number, number>();
    for (const clip of clips) if (clip.event_id != null) map.set(Number(clip.event_id), clip.id);
    return map;
  }, [clips]);
  const [openClipId, setOpenClipId] = useState<number | null>(null);
  const openClip = useCallback((clipId: number) => setOpenClipId(clipId), []);
  const openEventClip = useCallback(
    (eventId: number) => {
      const clipId = clipByEvent.get(eventId);
      if (clipId != null) setOpenClipId(clipId);
    },
    [clipByEvent],
  );
  const closeClip = useCallback(() => setOpenClipId(null), []);
  const clipScorer = useCallback((clip: GoalClip) => nameOf(clip.player_id), [nameOf]);
  const clipSubtitle = [match.first_team_name, match.second_team_name].filter(Boolean).join(" – ") || null;

  const total = items.length;
  const renderItem = useCallback(
    ({ item, index }: { item: TimelineItem; index: number }) =>
      item.kind === "break" ? (
        <TimelineBreak label={item.label} score={item.score} index={index} total={total} />
      ) : (
        <TimelineRow
          event={item.event}
          home={item.home}
          score={item.score}
          nameOf={nameOf}
          onOpenPlayer={openPlayer}
          index={index}
          total={total}
          flash={flashId != null && Number(item.event.id) === flashId}
          reactions={reactionData?.events[String(item.event.id)]}
          myReaction={reactionData?.mine[String(item.event.id)] ?? null}
          onReact={onReact}
          hasClip={clipByEvent.has(Number(item.event.id))}
          onClip={openEventClip}
        />
      ),
    [flashId, nameOf, openPlayer, total, reactionData, onReact, clipByEvent, openEventClip],
  );

  /* Medya / yayın: canlı yayın linki, özet, maçın anları, gol videoları, röportaj. */
  const broadcast = useBroadcast(match);
  const teams = useMemo(
    () => ({
      homeTeamId,
      awayTeamId,
      homeName: match.first_team_name,
      awayName: match.second_team_name,
      homeLogo,
      awayLogo,
    }),
    [homeTeamId, awayTeamId, match.first_team_name, match.second_team_name, homeLogo, awayLogo],
  );
  const media = scheduled ? null : (
    <MatchMedia
      match={match}
      state={state}
      nameOf={nameOf}
      teams={teams}
      onOpenPlayer={openPlayer}
      skipLiveBroadcast
      clips={clips}
      onOpenClip={openClip}
    />
  );

  /* — Başlık bölümü: zaman tünelinden ÖNCE gelenler — */
  const header = (
    <View style={styles.block}>
      {/* Canlı yayın sekmenin en üstünde: maç sürerken ilk aranan şey. */}
      {live && broadcast ? (
        <BroadcastCard
          source={broadcast}
          live
          title={`${match.first_team_name} ${snapshot?.homeScore ?? match.first_team_score ?? 0}–${snapshot?.awayScore ?? match.second_team_score ?? 0} ${match.second_team_name}`}
        />
      ) : null}
      {live ? <LivePanel match={match} snapshot={snapshot} realtime={realtime} hasBroadcast={Boolean(broadcast)} /> : null}
      {live ? media : null}

      {scheduled ? (
        <PreMatch
          match={match}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
          meetings={meetings}
          homeMatches={homeMatches}
          awayMatches={awayMatches}
          standings={standings}
          homeLogo={homeLogo}
          awayLogo={awayLogo}
          onOpenTab={onOpenTab}
        />
      ) : (
        <PostMatchHeader match={match} meetings={meetings} nameOf={nameOf} onOpenPlayer={openPlayer} media={live ? null : media} />
      )}

      {/* Reklam alanı "app_match" (yönetim → Sponsorlar → Reklam alanları). */}
      <AdBanner zone="app_match" />

      {/* Faz 4: maç öncesi arena düellosu, maç sonrası taraftar oylaması. */}
      {scheduled ? <DuelCard matchId={Number(match.id)} /> : null}
      {state === "finished" ? <FanVoteCard matchId={Number(match.id)} /> : null}

      {scheduled ? null : (
        <SectionHeader
          title={live ? "Canlı akış" : "Maç akışı"}
          meta={flowSummary(timeline)}
          action={
            timeline.length > 1
              ? {
                  // Etiket GİDİLECEK sıralamayı söyler; "Maç akışı" başlığının
                  // yanında yine "Maç akışı" yazan bir düğme ne yapacağını söylemez.
                  label: order === "yeni" ? "Baştan oku" : "En yeni üstte",
                  onPress: () => setOrder((current) => (current === "yeni" ? "akis" : "yeni")),
                }
              : undefined
          }
        />
      )}
    </View>
  );

  const footer = scheduled ? (
    <View style={styles.block}>
      <MatchFacts match={match} state={state} />
    </View>
  ) : (
    <View style={styles.block}>
      <StatsPreview statRows={statRows} bestPlayers={bestPlayers} onOpenTab={onOpenTab} />
      <MatchFacts match={match} state={state} />
    </View>
  );

  return (
    <>
    <FlatList
      {...scrollProps}
      data={scheduled ? EMPTY_ITEMS : items}
      keyExtractor={timelineKey}
      renderItem={renderItem}
      refreshControl={refreshControl}
      contentContainerStyle={styles.listContent}
      initialNumToRender={14}
      windowSize={9}
      ListHeaderComponent={header}
      ListEmptyComponent={
        scheduled ? null : (
          <PaperCard>
            <EmptyState
              icon={live ? "pulse-outline" : "time-outline"}
              variant="inline"
              compact
              title={live ? "Henüz olay yok" : "Olay girilmedi"}
              body={
                live
                  ? "Maç sürüyor. İlk gol, kart ya da değişiklik geldiğinde burada belirir."
                  : "Bu maç için gol, kart ya da değişiklik kaydı yok."
              }
            />
          </PaperCard>
        )
      }
      ListFooterComponent={footer}
    />
    <GoalClipPlayer
      visible={openClipId != null}
      initialId={openClipId}
      clips={clips}
      onClose={closeClip}
      nameFor={clipScorer}
      subtitle={clipSubtitle}
    />
    </>
  );
}

const EMPTY_ITEMS: TimelineItem[] = [];

/** Akış başlığının yanındaki kısa döküm: "17 gol · 2 kart · 3 değişiklik". */
function flowSummary(timeline: ApiMatchEvent[]): string | undefined {
  if (!timeline.length) return undefined;
  let goals = 0;
  let cards = 0;
  let subs = 0;
  for (const event of timeline) {
    const kind = eventKind(event);
    if (kind === "goal" || kind === "ownGoal") goals += 1;
    else if (kind === "yellow" || kind === "red") cards += 1;
    else if (kind === "substitution") subs += 1;
  }
  const parts = [
    goals ? `${goals} gol` : null,
    cards ? `${cards} kart` : null,
    subs ? `${subs} değişiklik` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : `${timeline.length} olay`;
}
const EMPTY_EVENTS: ApiMatchEvent[] = [];

/* ══════════════════════════════════════════════════════════════════════════
   Canlı panel
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Canlı panel — dakika halkası + bağlantı durumu + canlı yayın bağlantısı.
 *
 * HALKA BURADA, TABLODA DEĞİL: skor tablosunda dakika tek satır olarak akar;
 * halka (90 dakikanın ne kadarının geçtiğini gösterir) canlı sekmenin
 * kendisine aittir. Saniyelik tik yalnız `LiveClockRing` içinde.
 */
const LivePanel = memo(function LivePanel({
  match,
  snapshot,
  realtime,
  hasBroadcast,
}: {
  match: ApiMatch;
  snapshot: LiveSnapshot | undefined;
  realtime: boolean;
  /** Maçın kendi yayın linki üstte kart olarak çiziliyorsa kanal satırı tekrarlanmaz. */
  hasBroadcast?: boolean;
}) {
  const liveUrl = hasBroadcast ? null : youtubeLiveUrl(match.city);
  const halftime = isHalftime(snapshot);
  const period = snapshot?.period === 1 || snapshot?.period === 2 ? snapshot.period : null;
  const title = halftime ? "Devre arası" : period ? `${period}. yarı oynanıyor` : "Maç sürüyor";

  return (
    <PaperCard style={styles.liveCard}>
      <GlowRim radius={radius.xl} />
      <View style={styles.liveHead}>
        <LiveClockRing snapshot={snapshot} />
        <View style={styles.liveTexts}>
          <Text style={styles.liveTitle} numberOfLines={1} {...textScale.dense}>
            {title}
          </Text>
          <View style={styles.liveConn}>
            <View style={[styles.connDot, realtime ? styles.connDotOn : styles.connDotOff]} />
            <Text style={styles.liveSub} numberOfLines={2} {...textScale.dense}>
              {realtime
                ? "Anlık bağlantı açık — olaylar saniyeler içinde düşer"
                : "Anlık bağlantı yok — skor kısa aralıklarla yenileniyor"}
            </Text>
          </View>
        </View>
      </View>
      {liveUrl ? (
        <InfoRow
          icon="logo-youtube"
          tone="red"
          label="Canlı yayını izle"
          onPress={() => void openLink(liveUrl)}
          accessory={<View style={styles.flex} />}
        />
      ) : null}
    </PaperCard>
  );
});

const LiveClockRing = memo(function LiveClockRing({ snapshot }: { snapshot: LiveSnapshot | undefined }) {
  const clockMs = useLiveClock(snapshot);
  const { minute, added } = minuteParts(clockMs);
  return (
    <MinuteRing minute={minute} addedTime={added} halftime={isHalftime(snapshot)} size={56} thickness={3} />
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Maç sonrası başlık bölümü
   ══════════════════════════════════════════════════════════════════════════ */

const PostMatchHeader = memo(function PostMatchHeader({
  match,
  meetings,
  nameOf,
  onOpenPlayer,
  media,
}: {
  match: ApiMatch;
  meetings: ApiMatch[];
  nameOf: NameOf;
  onOpenPlayer: (playerId: number) => void;
  /** Maç sonu medya bloğu (özet, yayın kaydı, anlar, gol videoları, röportaj) — yıldızdan hemen sonra. */
  media?: React.ReactNode;
}) {
  const mvpId = match.match_mvp ? Number(match.match_mvp) : null;
  const mvpName = mvpId ? nameOf(mvpId) : null;
  const headline = headlineOf(match);
  const report = match.post_rapor?.trim() || null;


  /** Fotoğraf şeridi: bu maç + aynı eşleşmenin geçmiş maçları (fotoğrafı olanlar). */
  const photoMatches = useMemo(() => {
    const seen = new Set<number>([Number(match.id)]);
    const list: ApiMatch[] = [match];
    for (const item of meetings) {
      const id = Number(item.id);
      if (seen.has(id)) continue;
      seen.add(id);
      list.push(item);
    }
    return list;
  }, [match, meetings]);
  const hasPhotos = useMemo(
    () => photoMatches.some((item) => matchState(item) === "finished" && Boolean(item.match_picture)),
    [photoMatches],
  );

  return (
    <>
      {mvpId && mvpName ? (
        <Reveal scaleFrom={0.97}>
          <Touchable
            feedback="card"
            haptic="selection"
            onPress={() => onOpenPlayer(mvpId)}
            accessibilityRole="button"
            accessibilityLabel={`Maçın yıldızı ${mvpName}`}
            style={styles.mvp}
          >
            {/* Yıldız kartı sahnenin küçük bir yankısı: mürekkep zemin + aurora. */}
            <LinearGradient
              colors={colors.gradientInk}
              start={{ x: 1, y: 0.5 }}
              end={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <Aurora variant="stage" style={StyleSheet.absoluteFill} />
            <IconTile icon="star" tone="gold" size={44} />
            <View style={styles.flex}>
              <Text style={styles.mvpOverline} {...textScale.badge}>
                MAÇIN YILDIZI
              </Text>
              <Text style={styles.mvpName} numberOfLines={1} {...textScale.dense}>
                {mvpName}
              </Text>
            </View>
            <View style={styles.mvpGo}>
              <Ionicons name="chevron-forward" size={16} color={colors.onDark} />
            </View>
          </Touchable>
        </Reveal>
      ) : null}

      {/*
        MEDYA GERÇEKTEN VARSA, YOKSA HİÇ. Bu ligdeki maçların çoğunda video yok;
        yayın kaydı, özet, gol videoları ve röportaj ancak veri geldiyse çizilir.
      */}
      {media}

      {headline || report ? (
        <>
          <SectionHeader title="Maç raporu" />
          <PaperCard padded>
            {headline ? (
              <Text style={styles.headline} {...textScale.long}>
                {headline}
              </Text>
            ) : null}
            {report ? (
              <Text style={[styles.report, headline ? styles.reportSpaced : null]} {...textScale.long}>
                {report}
              </Text>
            ) : null}
          </PaperCard>
        </>
      ) : null}

      {hasPhotos ? (
        <>
          <SectionHeader title="Fotoğraflar" />
          <MatchPhotoSlider matches={photoMatches} />
        </>
      ) : null}
    </>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Maç öncesi
   ══════════════════════════════════════════════════════════════════════════ */

const PreMatch = memo(function PreMatch({
  match,
  homeTeamId,
  awayTeamId,
  meetings,
  homeMatches,
  awayMatches,
  standings,
  homeLogo,
  awayLogo,
  onOpenTab,
}: {
  match: ApiMatch;
  homeTeamId: number | null;
  awayTeamId: number | null;
  meetings: ApiMatch[];
  homeMatches: ApiMatch[] | undefined;
  awayMatches: ApiMatch[] | undefined;
  standings: StandingRow[] | undefined;
  homeLogo: string | null;
  awayLogo: string | null;
  onOpenTab: (tab: MatchTab) => void;
}) {
  const router = useRouter();
  const homeName = normalizeName(match.first_team_name);
  const awayName = normalizeName(match.second_team_name);
  const homeForm = useFormString(homeMatches, match.id, homeTeamId, homeName);
  const awayForm = useFormString(awayMatches, match.id, awayTeamId, awayName);
  const tally = useHeadToHeadTally(meetings, homeTeamId, homeName);
  const last = meetings[0] ?? null;

  /* Ligdeki yerleri: iki takımın tablo satırı ve sırası. */
  const table = useMemo(() => {
    const rows = standings ?? [];
    const find = (teamId: number | null, name: string) => {
      const index = rows.findIndex((row) =>
        teamId ? Number(row.team_id) === teamId : normalizeName(row.team_name) === name,
      );
      return index >= 0 ? { rank: index + 1, row: rows[index] } : null;
    };
    const home = find(homeTeamId, homeName);
    const away = find(awayTeamId, awayName);
    return home || away ? { home, away, power: rows[0]?.standings_type === "gucdengesi" } : null;
  }, [awayName, awayTeamId, homeName, homeTeamId, standings]);

  return (
    <>
      {homeForm || awayForm ? (
        <>
          <SectionHeader title="Form" meta="son 5 maç" />
          <PaperCard>
            <FormRow name={match.first_team_name} logo={homeLogo} form={homeForm} first />
            <FormRow name={match.second_team_name} logo={awayLogo} form={awayForm} />
          </PaperCard>
        </>
      ) : null}

      {meetings.length ? (
        <>
          <SectionHeader
            title="Aralarındaki maçlar"
            action={{ label: "Tümü", onPress: () => onOpenTab("h2h") }}
          />
          <PaperCard>
            <View style={styles.tally}>
              <TallyCell value={tally.homeWins} label={`${firstWord(match.first_team_name)}`} tone="home" />
              <TallyCell value={tally.draws} label="Berabere" tone="draw" />
              <TallyCell value={tally.awayWins} label={`${firstWord(match.second_team_name)}`} tone="away" />
            </View>
            <TallyStrip home={tally.homeWins} draws={tally.draws} away={tally.awayWins} />
            {last ? (
              <Touchable
                feedback="row"
                haptic="selection"
                onPress={() => router.push(`/mac/${last.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Son karşılaşma: ${last.first_team_name} ${last.first_team_score ?? "-"}, ${last.second_team_name} ${last.second_team_score ?? "-"}`}
                style={styles.lastMeeting}
              >
                <Text style={styles.lastLabel} {...textScale.badge}>
                  SON MAÇ
                </Text>
                <Text style={styles.lastTeams} numberOfLines={1} {...textScale.dense}>
                  {last.first_team_name}
                  <Text style={styles.lastScore}>{`  ${last.first_team_score ?? "-"}–${last.second_team_score ?? "-"}  `}</Text>
                  {last.second_team_name}
                </Text>
                <Text style={styles.lastDate} {...textScale.dense}>
                  {formatDateShort(last.date)}
                </Text>
              </Touchable>
            ) : null}
          </PaperCard>
        </>
      ) : null}

      {table ? (
        <>
          <SectionHeader title="Puan durumu" action={{ label: "Tablo", onPress: () => onOpenTab("puan") }} />
          <PaperCard>
            <View style={styles.miniHead}>
              <Text style={[styles.miniHeadText, styles.miniRank]} {...textScale.badge}>
                #
              </Text>
              <Text style={[styles.miniHeadText, styles.flex]} {...textScale.badge}>
                TAKIM
              </Text>
              <Text style={[styles.miniHeadText, styles.miniNum]} {...textScale.badge}>
                O
              </Text>
              <Text style={[styles.miniHeadText, styles.miniNum]} {...textScale.badge}>
                AV
              </Text>
              <Text style={[styles.miniHeadText, styles.miniNum]} {...textScale.badge}>
                {table.power ? "GP" : "P"}
              </Text>
            </View>
            {[table.home, table.away]
              .filter((entry): entry is { rank: number; row: StandingRow } => entry != null)
              .sort((a, b) => a.rank - b.rank)
              .map((entry) => (
                <MiniStandingRow key={entry.row.team_id} rank={entry.rank} row={entry.row} />
              ))}
          </PaperCard>
        </>
      ) : null}
    </>
  );
});

/** "ÖZMEN PETROL SPOR" → "ÖZMEN" — sayaç etiketi tek kelimeye sığmalı. */
function firstWord(name: string): string {
  return String(name ?? "").trim().split(/\s+/)[0] ?? name;
}

const FormRow = memo(function FormRow({
  name,
  logo,
  form,
  first = false,
}: {
  name: string;
  logo: string | null;
  form: string;
  first?: boolean;
}) {
  return (
    <View style={[styles.formRow, first ? null : styles.ruled]}>
      <TeamLogo name={name} logo={logo} size={layout.crestMd} />
      <Text style={styles.formName} numberOfLines={1} {...textScale.dense}>
        {name}
      </Text>
      {form ? (
        <FormChips form={form} size="sm" />
      ) : (
        <Text style={styles.muted} {...textScale.dense}>
          Maç yok
        </Text>
      )}
    </View>
  );
});

const TallyCell = memo(function TallyCell({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "home" | "draw" | "away";
}) {
  return (
    <View style={styles.tallyCell}>
      <Odometer
        value={value}
        style={[styles.tallyValue, tone === "home" ? styles.tallyHome : tone === "away" ? styles.tallyAway : null]}
      />
      <Text style={styles.tallyLabel} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
    </View>
  );
});

/** Üç parçalı sonuç şeridi — parçalar gerçek oranlarla. */
const TallyStrip = memo(function TallyStrip({ home, draws, away }: { home: number; draws: number; away: number }) {
  if (home + draws + away === 0) return null;
  return (
    <View style={styles.tallyStrip}>
      {home > 0 ? (
        <LinearGradient
          colors={colors.gradientAccent}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.tallyPart, { flex: home }]}
        />
      ) : null}
      {draws > 0 ? <View style={[styles.tallyPart, styles.tallyDraw, { flex: draws }]} /> : null}
      {away > 0 ? <View style={[styles.tallyPart, styles.tallyAwayPart, { flex: away }]} /> : null}
    </View>
  );
});

const MiniStandingRow = memo(function MiniStandingRow({ rank, row }: { rank: number; row: StandingRow }) {
  const diff = Number(row.goal_diff ?? 0);
  return (
    <View style={[styles.miniRow, styles.ruled, styles.miniRowMark]}>
      <LinearGradient
        colors={colors.gradientSignature}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.miniStripe}
      />
      <View style={styles.miniRank}>
        <RankBadge rank={rank} size={22} />
      </View>
      <TeamLogo name={row.team_name} logo={row.logo} size={layout.crestSm} />
      <Text style={[styles.miniName, styles.flex]} numberOfLines={1} {...textScale.dense}>
        {row.team_name}
      </Text>
      <Text style={[styles.miniCell, styles.miniNum]} {...textScale.dense}>
        {row.played}
      </Text>
      <Text style={[styles.miniCell, styles.miniNum]} {...textScale.dense}>
        {diff > 0 ? `+${diff}` : diff}
      </Text>
      <Text style={[styles.miniCell, styles.miniNum, styles.miniPoints]} {...textScale.dense}>
        {row.display_points}
      </Text>
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Alt bölüm: istatistik önizlemesi + künye
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Öne çıkan istatistikler — İstatistik sekmesinin üç satırlık özeti.
 *
 * Goller zaten skorun kendisidir; burada skor tablosunun SÖYLEMEDİĞİ sayılar
 * durur (fırsat, kurtarış, kart). Değeri olmayan satır seçilmez; hiçbiri yoksa
 * bölüm hiç çizilmez — amatör ligde çoğu maçta yalnız gol girilir.
 */
const StatsPreview = memo(function StatsPreview({
  statRows,
  bestPlayers,
  onOpenTab,
}: {
  statRows: StatRow[];
  bestPlayers: TopPlayer[];
  onOpenTab: (tab: MatchTab) => void;
}) {
  const rows = useMemo(
    () => statRows.filter((row) => row.label !== "Goller" && row.home + row.away > 0).slice(0, 3),
    [statRows],
  );
  if (rows.length === 0 && bestPlayers.length === 0) return null;

  return (
    <>
      <SectionHeader title="Öne çıkanlar" action={{ label: "İstatistik", onPress: () => onOpenTab("istatistik") }} />
      <PaperCard>
        {rows.length ? (
          <View style={styles.previewBars}>
            {rows.map((row) => (
              <StatBar key={row.label} label={statLabel(row.label)} home={row.home} away={row.away} />
            ))}
          </View>
        ) : null}
        {bestPlayers[0] ? (
          <View style={[styles.bestRow, rows.length ? styles.ruled : null]}>
            <Ionicons name="trophy-outline" size={16} color={colors.textTertiary} />
            <Text style={styles.bestLabel} {...textScale.dense}>
              En iyi oyuncu
            </Text>
            <Text style={styles.bestName} numberOfLines={1} {...textScale.dense}>
              {bestPlayers[0].name}
            </Text>
          </View>
        ) : null}
      </PaperCard>
    </>
  );
});

/**
 * KÜNYE — tek kartta ikonlu satırlar.
 *
 * Eski hâl iki sütunlu kutu ızgarasıydı: her bilgi kendi kartında, ekranda altı
 * küçük kart. Arena'da kart satırları bir arada tutar; künye tek bir kart,
 * satırlar saç teliyle ayrılır. YouTube kanalı da künyenin son satırıdır —
 * ayrı bir afiş değil.
 */
const MatchFacts = memo(function MatchFacts({ match, state }: { match: ApiMatch; state: MatchState }) {
  const referee = refereeOf(match);
  const channelUrl = youtubeChannelUrl(match.city);
  const hasVideo = Boolean(broadcastOf(match as unknown as Record<string, unknown>));
  const rawNote = (match.post_manset || match.match_comment || "").trim();
  const note = rawNote && !isTrivialTitle(rawNote, match) ? rawNote : "";
  const league = [match.league_name, match.match_season].filter(Boolean).join(" · ");

  const rows: {
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    tone: IconTileTone;
    label: string;
    value: string;
  }[] = [];
  if (league) rows.push({ key: "lig", icon: "trophy", tone: "gold", label: "Lig", value: league });
  rows.push({ key: "tarih", icon: "calendar", tone: "violet", label: "Tarih", value: formatDateLong(match.date) || "—" });
  rows.push({ key: "saat", icon: "time", tone: "cyan", label: "Başlama", value: formatTime(match.time) || "—" });
  if (match.match_field) rows.push({ key: "saha", icon: "location", tone: "pink", label: "Saha", value: match.match_field });
  if (match.city) rows.push({ key: "sehir", icon: "map", tone: "mint", label: "Şehir", value: match.city });
  if (referee) rows.push({ key: "hakem", icon: "person", tone: "neutral", label: "Hakem", value: referee });

  return (
    <>
      <SectionHeader title={state === "scheduled" ? "Maç bilgileri" : "Künye"} />
      <PaperCard>
        {rows.map((row, index) => (
          <InfoRow key={row.key} icon={row.icon} tone={row.tone} label={row.label} value={row.value} first={index === 0} />
        ))}
        {channelUrl && !hasVideo ? (
          <InfoRow
            icon="logo-youtube"
            tone="red"
            label="YouTube kanalı"
            value={state === "finished" ? "Video henüz yok" : undefined}
            onPress={() => void openLink(channelUrl)}
            accessory={state === "finished" ? null : <View style={styles.flex} />}
          />
        ) : null}
      </PaperCard>

      {note ? (
        <>
          <SectionHeader title="Maç notu" />
          <PaperCard padded>
            <Text style={styles.report} {...textScale.long}>
              {note}
            </Text>
          </PaperCard>
        </>
      ) : null}
    </>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: space.huge * 2,
  },
  block: {
    gap: 0,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  ruled: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  overline: {
    ...type.overline,
    color: colors.textTertiary,
  },
  muted: {
    ...type.bodySm,
    color: colors.textTertiary,
  },

  /* — Canlı panel — */
  liveCard: {
    marginTop: space.lg,
  },
  liveHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
  },
  liveTexts: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  liveTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  liveConn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  connDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  connDotOn: {
    backgroundColor: colors.win,
  },
  connDotOff: {
    backgroundColor: colors.warn,
  },
  liveSub: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },

  /* — Maçın yıldızı — */
  mvp: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    marginTop: space.lg,
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
    borderWidth: hairline,
    borderColor: colors.glassBorder,
  },
  mvpOverline: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  mvpName: {
    ...type.h1,
    color: colors.onDark,
    marginTop: 2,
  },
  mvpGo: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  /* — Rapor — */
  headline: {
    ...type.h2,
    color: colors.textPrimary,
  },
  report: {
    ...type.bodyLg,
    color: colors.textSecondary,
  },
  reportSpaced: {
    marginTop: space.sm,
  },

  /* — Form — */
  formRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: layout.listRowHeight,
    paddingHorizontal: space.lg,
  },
  formName: {
    ...type.h4,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },

  /* — Aralarındaki maçlar — */
  tally: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingTop: space.lg,
    paddingBottom: space.sm,
    paddingHorizontal: space.sm,
  },
  tallyCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.xs,
  },
  tallyValue: {
    ...type.scoreHero,
    color: colors.textSecondary,
  },
  tallyHome: {
    color: colors.accentText,
  },
  tallyAway: {
    color: colors.textPrimary,
  },
  tallyLabel: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
  tallyStrip: {
    flexDirection: "row",
    gap: space.xs,
    height: 8,
    marginHorizontal: space.lg,
    marginBottom: space.lg,
  },
  tallyPart: {
    height: 8,
    borderRadius: radius.pill,
  },
  tallyDraw: {
    backgroundColor: colors.slateSoft,
  },
  tallyAwayPart: {
    backgroundColor: colors.slate,
  },
  lastMeeting: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  lastLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  lastTeams: {
    ...type.bodySm,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  lastScore: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  lastDate: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Mini puan tablosu — */
  miniHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 32,
    paddingHorizontal: space.lg,
  },
  miniHeadText: {
    ...type.overline,
    color: colors.textTertiary,
  },
  miniRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 48,
    paddingHorizontal: space.lg,
  },
  miniCell: {
    ...type.tableNum,
    color: colors.textSecondary,
  },
  miniRank: {
    width: 30,
    alignItems: "center",
  },
  miniRowMark: {
    backgroundColor: colors.brandDim,
  },
  miniStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  miniName: {
    ...type.h4,
    color: colors.textPrimary,
  },
  miniNum: {
    width: 30,
    textAlign: "right",
  },
  miniPoints: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },

  /* — Öne çıkanlar — */
  previewBars: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  bestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: layout.listRowHeight,
    paddingHorizontal: space.lg,
  },
  bestLabel: {
    ...type.body,
    color: colors.textSecondary,
  },
  bestName: {
    ...type.body,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
});
