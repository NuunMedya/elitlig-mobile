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
 *   CANLI      — sekmenin adı "Canlı" olur; dakika halkası + bağlantı durumu,
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
  Image,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
} from "react-native";

import { MatchPhotoSlider } from "@/components/MatchPhotoSlider";
import {
  EmptyState,
  FormChips,
  MinuteRing,
  SectionHeader,
  StatBar,
  TeamLogo,
  Touchable,
} from "@/components/ui";
import { useLiveClock } from "@/hooks/useLiveMatch";
import { formatDateLong, formatDateShort, formatTime, mediaUrl } from "@/lib/format";
import { openLink } from "@/lib/links";
import { matchState } from "@/lib/match";
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
  extractYouTubeId,
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
import { TimelineBreak, TimelineRow } from "./Timeline";

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
        />
      ),
    [flashId, nameOf, openPlayer, total],
  );

  /* — Başlık bölümü: zaman tünelinden ÖNCE gelenler — */
  const header = (
    <View style={styles.block}>
      {live ? <LivePanel match={match} snapshot={snapshot} realtime={realtime} /> : null}

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
        <PostMatchHeader match={match} meetings={meetings} nameOf={nameOf} onOpenPlayer={openPlayer} />
      )}

      {scheduled ? null : (
        <SectionHeader
          title={live ? "Canlı akış" : "Maç akışı"}
          meta={timeline.length > 1 ? undefined : timeline.length ? "1 olay" : undefined}
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
  );
}

const EMPTY_ITEMS: TimelineItem[] = [];
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
}: {
  match: ApiMatch;
  snapshot: LiveSnapshot | undefined;
  realtime: boolean;
}) {
  const liveUrl = youtubeLiveUrl(match.city);
  const halftime = isHalftime(snapshot);
  const period = snapshot?.period === 1 || snapshot?.period === 2 ? snapshot.period : null;
  const title = halftime ? "Devre arası" : period ? `${period}. yarı oynanıyor` : "Maç sürüyor";

  return (
    <PaperCard style={styles.liveCard}>
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
}: {
  match: ApiMatch;
  meetings: ApiMatch[];
  nameOf: NameOf;
  onOpenPlayer: (playerId: number) => void;
}) {
  const mvpId = match.match_mvp ? Number(match.match_mvp) : null;
  const mvpName = mvpId ? nameOf(mvpId) : null;
  const headline = headlineOf(match);
  const report = match.post_rapor?.trim() || null;

  const videoUrl = mediaUrl(match.match_video);
  const videoId = videoUrl ? extractYouTubeId(videoUrl) : null;
  const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;

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
        <Touchable
          feedback="card"
          haptic="selection"
          onPress={() => onOpenPlayer(mvpId)}
          accessibilityRole="button"
          accessibilityLabel={`Maçın yıldızı ${mvpName}`}
          style={[partStyles.card, styles.mvp]}
        >
          <View style={styles.mvpIcon}>
            <Ionicons name="star" size={18} color={colors.brandAccent} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.overline} {...textScale.badge}>
              MAÇIN YILDIZI
            </Text>
            <Text style={styles.mvpName} numberOfLines={1} {...textScale.dense}>
              {mvpName}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Touchable>
      ) : null}

      {/*
        VİDEO GERÇEKTEN VARSA AFİŞ, YOKSA HİÇ. Bu ligdeki maçların çoğunda
        video yok, yalnız kanal bağlantısı var; o durumda ekranın yarısını boş
        bir afiş kaplıyordu. Kanal bağlantısı künye kartında tek satırdır.
      */}
      {videoUrl ? (
        <Touchable
          feedback="card"
          haptic="light"
          onPress={() => void openLink(videoUrl)}
          style={[partStyles.card, styles.video]}
          accessibilityRole="link"
          accessibilityLabel="Maç videosunu YouTube'da izle"
        >
          <View style={styles.videoThumb}>
            {thumbnail ? (
              <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <Ionicons name="logo-youtube" size={34} color={colors.textTertiary} />
            )}
            <View style={styles.videoPlay}>
              <Ionicons name="play" size={18} color={colors.onDark} />
            </View>
          </View>
          <View style={styles.videoFoot}>
            <View style={styles.flex}>
              <Text style={styles.videoTitle} numberOfLines={1} {...textScale.dense}>
                Maçın videosu
              </Text>
              <Text style={styles.videoSub} numberOfLines={1} {...textScale.dense}>
                YouTube'da izle
              </Text>
            </View>
            <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
          </View>
        </Touchable>
      ) : null}

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
              <TallyCell value={tally.homeWins} label={`${firstWord(match.first_team_name)} kazandı`} />
              <View style={styles.tallyAxis} />
              <TallyCell value={tally.draws} label="Berabere" />
              <View style={styles.tallyAxis} />
              <TallyCell value={tally.awayWins} label={`${firstWord(match.second_team_name)} kazandı`} />
            </View>
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

const TallyCell = memo(function TallyCell({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.tallyCell}>
      <Text style={styles.tallyValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.tallyLabel} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
    </View>
  );
});

const MiniStandingRow = memo(function MiniStandingRow({ rank, row }: { rank: number; row: StandingRow }) {
  const diff = Number(row.goal_diff ?? 0);
  return (
    <View style={[styles.miniRow, styles.ruled]}>
      <Text style={[styles.miniCell, styles.miniRank]} {...textScale.dense}>
        {rank}
      </Text>
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
  const hasVideo = Boolean(mediaUrl(match.match_video));
  const rawNote = (match.post_manset || match.match_comment || "").trim();
  const note = rawNote && !isTrivialTitle(rawNote, match) ? rawNote : "";
  const league = [match.league_name, match.match_season].filter(Boolean).join(" · ");

  const rows: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [];
  if (league) rows.push({ key: "lig", icon: "trophy-outline", label: "Lig", value: league });
  rows.push({ key: "tarih", icon: "calendar-outline", label: "Tarih", value: formatDateLong(match.date) || "—" });
  rows.push({ key: "saat", icon: "time-outline", label: "Başlama", value: formatTime(match.time) || "—" });
  if (match.match_field) rows.push({ key: "saha", icon: "location-outline", label: "Saha", value: match.match_field });
  if (match.city) rows.push({ key: "sehir", icon: "map-outline", label: "Şehir", value: match.city });
  if (referee) rows.push({ key: "hakem", icon: "person-outline", label: "Hakem", value: referee });

  return (
    <>
      <SectionHeader title={state === "scheduled" ? "Maç bilgileri" : "Künye"} />
      <PaperCard>
        {rows.map((row, index) => (
          <InfoRow key={row.key} icon={row.icon} label={row.label} value={row.value} first={index === 0} />
        ))}
        {channelUrl && !hasVideo ? (
          <InfoRow
            icon="logo-youtube"
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
  },
  mvpIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
    alignItems: "center",
    justifyContent: "center",
  },
  mvpName: {
    ...type.h2,
    color: colors.textPrimary,
    marginTop: 2,
  },

  /* — Video — */
  video: {
    marginTop: space.lg,
  },
  videoThumb: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlay: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  videoFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  videoTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  videoSub: {
    ...type.bodySm,
    color: colors.textTertiary,
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
    alignItems: "center",
    paddingVertical: space.lg,
  },
  tallyCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space.xxs,
    paddingHorizontal: space.xs,
  },
  tallyAxis: {
    width: hairline,
    height: 32,
    backgroundColor: colors.separator,
  },
  tallyValue: {
    ...type.metric,
    color: colors.textPrimary,
  },
  tallyLabel: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
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
    textAlign: "center",
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
