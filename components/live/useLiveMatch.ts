/**
 * MOBİL REJİ VERİSİ — tek maçın canlı durumu ve reji eylemleri.
 *
 * Masaüstü reji panelinin (LiveStep) kurallarıyla aynıdır; yalnız yayın
 * sırasında daha sık tazelenir ve eylemler tek dokunuşa indirgenmiştir:
 *
 *   SAAT   sunucu sayacı (PUT /timer, POST /timer/period) yerelde saniyede bir
 *          ilerletilir. Devre 25 dakika (web ile aynı).
 *   SKOR   olaylardan hesaplanır, her olaydan sonra maç kaydına yazılır (elle /
 *          hükmen tescilde kayıttaki skor esas).
 *   OLAY   createEvent / deleteEvent; client_event_id ile çift gönderim güvenli.
 *
 * Skoroverlay (web /skoroverlay) aynı sunucu kayıtlarını okuduğu için mobil
 * rejiden girilen her şey sitedeki yayın grafiğinde de anında görünür.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clientEventId, toSquad, type SquadPlayer } from "@/components/admin/matches/model";
import {
  createEvent,
  deleteEvent,
  getAdminMatch,
  getEvents,
  getLineup,
  getTimer,
  isManualResult,
  normalizeMatchStatus,
  putTimer,
  scoreFromEvents,
  setTimerPeriod,
  sortEvents,
  timerNowMs,
  updateMatch,
  TIMELINE_CODES,
  type MatchEvent,
  type MatchTimer,
} from "@/lib/api/admin/matches";
import { bugEventOf, BUG_EVENT_MS } from "@/lib/live/rig";

export const HALF_MS = 25 * 60 * 1000;

export type LivePhase = "notStarted" | "kickoff" | "first" | "halftime" | "second" | "extra" | "paused" | "finished";

export const PHASE_LABEL: Record<LivePhase, string> = {
  notStarted: "Başlamadı",
  kickoff: "Başlama bekleniyor",
  first: "1. yarı",
  halftime: "Devre arası",
  second: "2. yarı",
  extra: "Uzatma",
  paused: "Saat durdu",
  finished: "Maç bitti",
};

export type ControlAction = "start" | "kickoff" | "halftime" | "second" | "extra" | "resume" | "pause" | "finish" | "reopen";

export function useLiveMatch(matchId: number, userId?: number | null) {
  const queryClient = useQueryClient();
  const enabled = Number.isFinite(matchId) && matchId > 0;

  const detailKey = ["admin", "matches", "detail", matchId] as const;
  const eventsKey = ["admin", "matches", "events", matchId] as const;
  const timerKey = ["admin", "matches", "timer", matchId] as const;

  const detail = useQuery({ queryKey: detailKey, queryFn: () => getAdminMatch(matchId), enabled, refetchInterval: 15_000 });
  const eventsQuery = useQuery({ queryKey: eventsKey, queryFn: () => getEvents(matchId), enabled, refetchInterval: 6_000 });
  const timerQuery = useQuery({ queryKey: timerKey, queryFn: () => getTimer(matchId), enabled, refetchInterval: 10_000 });
  const lineupQuery = useQuery({
    queryKey: ["admin", "matches", "lineup", matchId],
    queryFn: () => getLineup(matchId),
    enabled,
    staleTime: 5 * 60_000,
  });

  const match = detail.data ?? null;
  const homeTeamId = Number(match?.home_team_id) || null;
  const awayTeamId = Number(match?.away_team_id) || null;
  const status = normalizeMatchStatus(match?.mac_durumu);
  const manual = isManualResult(match);

  const events = useMemo(() => [...(eventsQuery.data ?? [])].sort(sortEvents), [eventsQuery.data]);
  const squads = useMemo<{ home: SquadPlayer[]; away: SquadPlayer[] }>(
    () => ({ home: toSquad(lineupQuery.data?.home), away: toSquad(lineupQuery.data?.away) }),
    [lineupQuery.data]
  );
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    [...squads.home, ...squads.away].forEach((p) => map.set(p.id, p.name));
    return (id: unknown) => (id ? map.get(String(id)) ?? null : null);
  }, [squads]);

  /* ───────── saat ───────── */
  const timer = timerQuery.data ?? null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const clockMs = timerNowMs(timer, now);
  const period = Number(timer?.period) > 0 ? Number(timer?.period) : 1;
  const running = Boolean(timer?.running);
  const minute = Math.floor(clockMs / 60000);

  const phase: LivePhase = (() => {
    if (status === "yayinlanmis") return "finished";
    if (status !== "canli") return "notStarted";
    if (period >= 3) return running ? "extra" : "paused";
    if (period === 2) return running ? "second" : "paused";
    if (running) return "first";
    if (clockMs === 0) return "kickoff";
    return clockMs >= HALF_MS ? "halftime" : "paused";
  })();

  const writeTimer = (next: MatchTimer) => queryClient.setQueryData(timerKey, next);

  /* ───────── skor ───────── */
  const eventScore = useMemo(() => scoreFromEvents(events, homeTeamId, awayTeamId), [events, homeTeamId, awayTeamId]);
  const score = manual
    ? { home: Number(match?.first_team_score) || 0, away: Number(match?.second_team_score) || 0 }
    : eventScore;

  const syncScore = useCallback(async () => {
    const fresh = await queryClient.fetchQuery({ queryKey: eventsKey, queryFn: () => getEvents(matchId), staleTime: 0 });
    if (manual || !match) return;
    const next = scoreFromEvents(fresh, homeTeamId, awayTeamId);
    if (next.home !== Number(match.first_team_score) || next.away !== Number(match.second_team_score)) {
      await updateMatch(matchId, { first_team_score: next.home, second_team_score: next.away });
      void queryClient.invalidateQueries({ queryKey: detailKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awayTeamId, homeTeamId, manual, match, matchId, queryClient]);

  /* ───────── skorbord alt bandı: son gol / kart ───────── */
  const timeline = useMemo(() => events.filter((e) => TIMELINE_CODES.has(String(e.olay_kodu).toUpperCase())), [events]);
  const lastTimeline = timeline.length ? timeline[timeline.length - 1] : null;
  const seenRef = useRef<number | null>(null);
  const [banner, setBanner] = useState<{ id: number; until: number } | null>(null);
  useEffect(() => {
    if (!lastTimeline) return;
    // İlk yüklemede eski olayı bant olarak gösterme.
    if (seenRef.current === null) {
      seenRef.current = Number(lastTimeline.id);
      return;
    }
    if (Number(lastTimeline.id) > seenRef.current) {
      seenRef.current = Number(lastTimeline.id);
      if (bugEventOf(lastTimeline)) setBanner({ id: Number(lastTimeline.id), until: Date.now() + BUG_EVENT_MS });
    }
  }, [lastTimeline]);
  useEffect(() => {
    if (!eventsQuery.isSuccess || seenRef.current !== null) return;
    seenRef.current = lastTimeline ? Number(lastTimeline.id) : 0;
  }, [eventsQuery.isSuccess, lastTimeline]);

  const bannerEvent = useMemo(() => {
    if (!banner || banner.until < now) return null;
    const ev = events.find((e) => Number(e.id) === banner.id);
    const meta = bugEventOf(ev);
    if (!ev || !meta) return null;
    const player = nameOf(ev.oyuncu_id ?? ev.oyuncu_giren_id);
    return { ...meta, player: player ? player.toLocaleUpperCase("tr-TR") : null };
  }, [banner, events, nameOf, now]);

  /* ───────── eylemler ───────── */
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
  }, [queryClient]);

  const control = useCallback(
    async (action: ControlAction): Promise<string> => {
      switch (action) {
        case "start":
          await updateMatch(matchId, { mac_durumu: "canli" });
          writeTimer(await putTimer(matchId, true, clockMs));
          writeTimer(await setTimerPeriod(matchId, 1));
          refresh();
          return "Maç başladı, saat çalışıyor.";
        case "kickoff":
        case "resume":
          writeTimer(await putTimer(matchId, true, clockMs));
          return "Saat çalışıyor.";
        case "pause":
          writeTimer(await putTimer(matchId, false, clockMs));
          return "Saat durduruldu.";
        case "halftime":
          writeTimer(await putTimer(matchId, false, HALF_MS));
          return "Devre arası.";
        case "second":
          writeTimer(await putTimer(matchId, true, HALF_MS));
          writeTimer(await setTimerPeriod(matchId, 2));
          return "2. yarı başladı.";
        case "extra":
          writeTimer(await setTimerPeriod(matchId, 3));
          writeTimer(await putTimer(matchId, true, clockMs));
          return "Uzatma başladı.";
        case "finish":
          await updateMatch(matchId, {
            mac_durumu: "yayinlanmis",
            ...(manual ? {} : { first_team_score: eventScore.home, second_team_score: eventScore.away }),
          });
          writeTimer(await putTimer(matchId, false, clockMs));
          refresh();
          return "Maç bitti, skor tescil edildi.";
        case "reopen":
          await updateMatch(matchId, { mac_durumu: "canli" });
          refresh();
          return "Maç tekrar canlıya alındı.";
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clockMs, eventScore.away, eventScore.home, manual, matchId, refresh]
  );

  /** Saati elle düzelt (± saniye). */
  const nudgeClock = useCallback(
    async (deltaMs: number) => {
      writeTimer(await putTimer(matchId, running, Math.max(0, clockMs + deltaMs)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clockMs, matchId, running]
  );

  const addEvent = useCallback(
    async (input: { side: "home" | "away"; code: string; playerId?: string | null }) => {
      const teamId = input.side === "home" ? homeTeamId : awayTeamId;
      const created = await createEvent(matchId, {
        takim_id: teamId,
        olay_kodu: input.code,
        dakika: minute,
        devre: period,
        oyuncu_id: Number(input.playerId) || null,
        oyuncu_cikan_id: null,
        oyuncu_giren_id: null,
        aciklama: null,
        olusturan_kullanici_id: userId ?? null,
        client_event_id: clientEventId(),
      });
      queryClient.setQueryData<MatchEvent[]>(eventsKey, (prev) => {
        const list = prev ?? [];
        return list.some((e) => Number(e.id) === Number(created.id)) ? list : [...list, created];
      });
      await syncScore();
      return created;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [awayTeamId, homeTeamId, matchId, minute, period, queryClient, syncScore, userId]
  );

  const removeEvent = useCallback(
    async (eventId: number) => {
      await deleteEvent(matchId, eventId);
      queryClient.setQueryData<MatchEvent[]>(eventsKey, (prev) => (prev ?? []).filter((e) => Number(e.id) !== eventId));
      await syncScore();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchId, queryClient, syncScore]
  );

  return {
    match,
    loading: detail.isLoading,
    error: detail.error,
    refetch: () => void detail.refetch(),
    status,
    manual,
    homeTeamId,
    awayTeamId,
    events,
    timeline,
    squads,
    nameOf,
    clockMs,
    minute,
    period,
    running,
    phase,
    score,
    bannerEvent,
    control,
    nudgeClock,
    addEvent,
    removeEvent,
  };
}

export type LiveMatch = ReturnType<typeof useLiveMatch>;
