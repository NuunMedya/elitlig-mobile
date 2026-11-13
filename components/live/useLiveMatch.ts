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
 *   İSİMSİZ GOL  oyuncu belirtilmeden yazılan gol. Önce GERÇEK OLAY olarak
 *          gönderilir (oyuncu_id = null): güncel sunucu bunu kabul eder,
 *          skor olaydan hesaplanır, maç sayfasının akışında görünür ve web
 *          rejisi silmez. Eski sunucu reddederse (OYUNCU_ID_REQUIRED) yedek
 *          yol: doğrudan maç skoruna (PATCH /maclar/:id) +1 yazılır.
 *          Kayıttaki skorun olaylardan fazlası "isimsiz gol" sayılır ve her
 *          eşitlemede korunur: skor = olay golleri + isimsiz goller. Sayfa
 *          yenilenince de aynı hesap kayıttaki skordan yeniden çıkar.
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
  isGoalCode,
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
  const serverScore = { home: Number(match?.first_team_score) || 0, away: Number(match?.second_team_score) || 0 };
  /*
   * Maç ayrıntısı sunucuda 15 sn önbellekte (GET /maclar/:id). Kendi yazdığımız
   * skor o süre içinde eski görünebilir; yazılan değer, sunucu aynısını
   * döndürene kadar (en çok 30 sn) esas alınır.
   */
  const writtenRef = useRef<{ home: number; away: number; until: number } | null>(null);
  const written = writtenRef.current;
  const holdWritten = Boolean(written && written.until > now && (written.home !== serverScore.home || written.away !== serverScore.away));
  const recorded = holdWritten && written ? { home: written.home, away: written.away } : serverScore;
  /** İşlem sürerken isimsiz gol sayısı sabit tutulur (olay önbelleği skordan önce güncellenir). */
  const [opAnon, setOpAnon] = useState<{ home: number; away: number } | null>(null);
  /** Sunucu oyuncusuz gol olayını kabul ediyor mu (ilk denemede öğrenilir). */
  const anonEventsSupported = useRef<boolean | null>(null);
  /*
   * SKORDAN TÜRETİLEN "isimsiz gol" (kayıttaki skor − olay golleri) YALNIZ eski
   * sunucu yedek yolunda ve olay listesi TAZE iken sayılır. Aksi hâlde olaylar
   * henüz gelmemişken (events = []) ya da başka bir rejinin yazdığı skor
   * olaylardan önce geldiğinde kayıttaki skorun fazlası "hayalet gol" sayılıp
   * bir sonraki yazımda skora İKİNCİ KEZ ekleniyordu (2-1'de gol → 5-2).
   * Güncel sunucuda isimsiz gol gerçek olaydır; skor yalnız olaylardan gelir.
   */
  const derivedAnonAllowed =
    anonEventsSupported.current === false && eventsQuery.isSuccess && !eventsQuery.isFetching;
  const anon =
    manual || !derivedAnonAllowed
      ? { home: 0, away: 0 }
      : opAnon ?? { home: Math.max(0, recorded.home - eventScore.home), away: Math.max(0, recorded.away - eventScore.away) };
  const score = manual
    ? serverScore
    : eventsQuery.isSuccess
      ? { home: eventScore.home + anon.home, away: eventScore.away + anon.away }
      : serverScore;
  const anonRef = useRef(anon);
  anonRef.current = anon;
  const recordedRef = useRef(recorded);
  recordedRef.current = recorded;

  const writeScore = useCallback(
    async (next: { home: number; away: number }) => {
      const cur = recordedRef.current;
      if (next.home === cur.home && next.away === cur.away) return;
      await updateMatch(matchId, { first_team_score: next.home, second_team_score: next.away });
      writtenRef.current = { ...next, until: Date.now() + 30_000 };
      void queryClient.invalidateQueries({ queryKey: detailKey });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchId, queryClient]
  );

  /** Skor = (taze) olay golleri + isimsiz goller (`base`: işlem başındaki sayı). */
  const syncScore = useCallback(
    async (base?: { home: number; away: number }) => {
      const fresh = await queryClient.fetchQuery({ queryKey: eventsKey, queryFn: () => getEvents(matchId), staleTime: 0 });
      if (manual || !match) return;
      // Skordan türetilen isimsiz gol yalnız eski sunucu yedek yolunda eklenir.
      const extra = anonEventsSupported.current === false ? base ?? anonRef.current : { home: 0, away: 0 };
      const fromEvents = scoreFromEvents(fresh, homeTeamId, awayTeamId);
      await writeScore({ home: fromEvents.home + extra.home, away: fromEvents.away + extra.away });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [awayTeamId, homeTeamId, manual, match, matchId, queryClient, writeScore]
  );

  /* ───────── isimsiz goller için yerel GOL bandı ───────── */
  // Sunucuda olay kaydı olmadığı için bant / GOL kartı yerel bir sahte olayla çizilir.
  const [localGoals, setLocalGoals] = useState<{ event: MatchEvent; side: "home" | "away" }[]>([]);
  const localSide = useMemo(() => new Map(localGoals.map((g) => [Number(g.event.id), g.side])), [localGoals]);
  /** Olayın (sahte isimsiz gol dahil) takımı. */
  const sideOfEvent = useCallback(
    (ev: MatchEvent): "home" | "away" => localSide.get(Number(ev.id)) ?? (Number(ev.takim_id) === Number(homeTeamId) ? "home" : "away"),
    [homeTeamId, localSide]
  );

  /* ───────── skorbord alt bandı: son gol / kart ───────── */
  const timeline = useMemo(() => events.filter((e) => TIMELINE_CODES.has(String(e.olay_kodu).toUpperCase())), [events]);
  // EN YENİ olay = en büyük kimlik. Liste dakikaya göre sıralıdır; sona bakmak,
  // geriye dönük dakikayla girilen (ya da başka rejiden gelen) olayı kaçırırdı.
  const newestTimeline = useMemo(
    () => timeline.reduce<MatchEvent | null>((best, e) => (!best || Number(e.id) > Number(best.id) ? e : best), null),
    [timeline]
  );
  const newestId = newestTimeline ? Number(newestTimeline.id) : 0;
  const seenRef = useRef<number | null>(null);
  const [banner, setBanner] = useState<{ id: number; since: number; until: number } | null>(null);
  useEffect(() => {
    if (!eventsQuery.isSuccess) return;
    // İlk yüklemede eski olayı bant olarak gösterme.
    if (seenRef.current === null) {
      seenRef.current = newestId;
      return;
    }
    if (newestId > seenRef.current) {
      seenRef.current = newestId;
      if (bugEventOf(newestTimeline)) {
        const since = Date.now();
        setBanner({ id: newestId, since, until: since + BUG_EVENT_MS });
      }
    }
  }, [eventsQuery.isSuccess, newestId, newestTimeline]);

  const bannerSource = useMemo(() => {
    if (!banner || banner.until < now) return null;
    const ev = events.find((e) => Number(e.id) === banner.id) ?? localGoals.find((g) => Number(g.event.id) === banner.id)?.event;
    return ev ? { event: ev, since: banner.since } : null;
  }, [banner, events, localGoals, now]);

  const bannerEvent = useMemo(() => {
    const ev = bannerSource?.event;
    const meta = bugEventOf(ev);
    if (!ev || !meta) return null;
    const anonSide = localSide.get(Number(ev.id));
    // İsimsiz gol: oyuncu adı yerine golü atan takımın adı.
    const player = anonSide
      ? (anonSide === "home" ? match?.first_team_name : match?.second_team_name) || null
      : nameOf(ev.oyuncu_id ?? ev.oyuncu_giren_id);
    return { ...meta, player: player ? player.toLocaleUpperCase("tr-TR") : null };
  }, [bannerSource, localSide, match?.first_team_name, match?.second_team_name, nameOf]);

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
            // İsimsiz goller dahil (olay golleri + isimsiz).
            ...(manual ? {} : { first_team_score: score.home, second_team_score: score.away }),
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
    [clockMs, score.away, score.home, manual, matchId, refresh]
  );

  /** Saati elle düzelt (± saniye). */
  const nudgeClock = useCallback(
    async (deltaMs: number) => {
      writeTimer(await putTimer(matchId, running, Math.max(0, clockMs + deltaMs)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clockMs, matchId, running]
  );

  /**
   * Skoru maç kaydına yaz. Olay zaten kaydedildi/silindi; bu adım başarısız
   * olursa işlem "başarısız" SAYILMAZ (aksi halde kullanıcı aynı golü bir daha
   * girerdi). Skor, bir sonraki olayda ya da web rejide yeniden eşitlenir.
   */
  const syncScoreSafely = useCallback(async (base?: { home: number; away: number }) => {
    try {
      await syncScore(base);
    } catch {
      void queryClient.invalidateQueries({ queryKey: eventsKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, syncScore]);

  const addEvent = useCallback(
    async (input: {
      side: "home" | "away";
      code: string;
      playerId?: string | null;
      /** Değişiklik: çıkan / giren oyuncu. */
      outPlayerId?: string | null;
      inPlayerId?: string | null;
      /** Aynı dokunuşun yeniden denemesi çift kayıt üretmesin diye sabit kimlik. */
      clientId?: string;
    }) => {
      const teamId = input.side === "home" ? homeTeamId : awayTeamId;
      const sub = input.code.toUpperCase() === "SUBSTITUTION";
      const goal = isGoalCode(input.code);
      const base = { ...anonRef.current };
      if (goal) setOpAnon(base);
      try {
        const created = await createEvent(matchId, {
          takim_id: teamId,
          olay_kodu: input.code,
          dakika: minute,
          devre: period,
          oyuncu_id: sub ? null : Number(input.playerId) || null,
          oyuncu_cikan_id: sub ? Number(input.outPlayerId) || null : null,
          oyuncu_giren_id: sub ? Number(input.inPlayerId) || null : null,
          aciklama: null,
          olusturan_kullanici_id: userId ?? null,
          client_event_id: input.clientId ?? clientEventId(),
        });
        queryClient.setQueryData<MatchEvent[]>(eventsKey, (prev) => {
          const list = prev ?? [];
          return list.some((e) => Number(e.id) === Number(created.id)) ? list : [...list, created];
        });
        if (goal) await syncScoreSafely(base);
        return created;
      } finally {
        if (goal) setOpAnon(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [awayTeamId, homeTeamId, matchId, minute, period, queryClient, syncScoreSafely, userId]
  );

  const removeEvent = useCallback(
    async (eventId: number) => {
      const base = { ...anonRef.current };
      setOpAnon(base);
      try {
        await deleteEvent(matchId, eventId);
        queryClient.setQueryData<MatchEvent[]>(eventsKey, (prev) => (prev ?? []).filter((e) => Number(e.id) !== eventId));
        await syncScoreSafely(base);
      } finally {
        setOpAnon(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchId, queryClient, syncScoreSafely]
  );

  /**
   * İSİMSİZ GOL: oyuncu belirtmeden takıma gol yazar (maç skoru +1).
   * `own` → kendi kalesine: gol rakibin hanesine yazılır.
   * Elle / hükmen tescilli maçta skor değişmez (genel güncelleme ucu yok sayar).
   */
  const addAnonymousGoal = useCallback(
    async (side: "home" | "away", code = "GOAL_RIGHT_FOOT") => {
      if (manual) throw new Error("Skor elle / hükmen tescil edildi; gol skoru değiştirmez.");
      if (!match) throw new Error("Maç yüklenmedi.");
      const own = code.toUpperCase() === "GOAL_OWN";
      const scoring: "home" | "away" = own ? (side === "home" ? "away" : "home") : side;
      /* 1) Gerçek olay (güncel sunucu oyuncusuz golü kabul eder). */
      if (anonEventsSupported.current !== false) {
        try {
          await addEvent({ side, code, playerId: null });
          anonEventsSupported.current = true;
          const fresh = queryClient.getQueryData<MatchEvent[]>(eventsKey) ?? [];
          const s2 = scoreFromEvents(fresh, homeTeamId, awayTeamId);
          return { side: scoring, score: { home: s2.home + anonRef.current.home, away: s2.away + anonRef.current.away } };
        } catch (err) {
          const codeOf = (err as { code?: string } | null)?.code;
          if (codeOf !== "OYUNCU_ID_REQUIRED" && codeOf !== "PLAYER_NOT_IN_ROSTER") throw err;
          anonEventsSupported.current = false;
        }
      }
      /* 2) Yedek: eski sunucu — skor doğrudan maç kaydına yazılır. */
      const cur = { home: eventScore.home + anonRef.current.home, away: eventScore.away + anonRef.current.away };
      const next = { ...cur, [scoring]: cur[scoring] + 1 };
      await writeScore(next);
      const id = -Date.now();
      const event = {
        id,
        mac_id: matchId,
        takim_id: (scoring === "home" ? homeTeamId : awayTeamId) ?? null,
        olay_kodu: own ? "GOAL_RIGHT_FOOT" : code,
        dakika: minute,
        devre: period,
        oyuncu_id: null,
      } as unknown as MatchEvent;
      setLocalGoals((list) => [...list.slice(-9), { event, side: scoring }]);
      const since = Date.now();
      setBanner({ id, since, until: since + BUG_EVENT_MS });
      return { side: scoring, score: next };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addEvent, awayTeamId, eventScore.away, eventScore.home, homeTeamId, manual, match, matchId, minute, period, queryClient, writeScore]
  );

  /** Son isimsiz golü geri al (o takımda isimsiz gol yoksa hata). */
  const removeAnonymousGoal = useCallback(
    async (side: "home" | "away") => {
      if (manual) throw new Error("Skor elle / hükmen tescil edildi.");
      /* Sunucuda oyuncusuz gol OLAYI varsa en yenisini sil. */
      const teamId = side === "home" ? homeTeamId : awayTeamId;
      const otherId = side === "home" ? awayTeamId : homeTeamId;
      // Bu tarafa puan yazan oyuncusuz goller: kendi golleri + rakibin kendi kalesine.
      const anonEvent = events
        .filter((e) => {
          const code = String(e.olay_kodu).toUpperCase();
          if (!isGoalCode(code) || e.oyuncu_id) return false;
          return code === "GOAL_OWN" ? Number(e.takim_id) === Number(otherId) : Number(e.takim_id) === Number(teamId);
        })
        .reduce<MatchEvent | null>((best, e) => (!best || Number(e.id) > Number(best.id) ? e : best), null);
      if (anonEvent && Number(anonEvent.id) > 0) {
        await removeEvent(Number(anonEvent.id));
        return;
      }
      if (anonRef.current[side] <= 0) throw new Error("Bu takımın isimsiz golü yok.");
      const cur = { home: eventScore.home + anonRef.current.home, away: eventScore.away + anonRef.current.away };
      await writeScore({ ...cur, [side]: Math.max(0, cur[side] - 1) });
      setLocalGoals((list) => {
        const i = list.map((g) => g.side).lastIndexOf(side);
        return i < 0 ? list : [...list.slice(0, i), ...list.slice(i + 1)];
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [awayTeamId, eventScore.away, eventScore.home, events, homeTeamId, manual, removeEvent, writeScore]
  );

  /** Sunucuda kayıtlı oyuncusuz gol olayları (kendi kalesine hariç) — "N isimsiz" sayacı. */
  const anonEventCount = useMemo(() => {
    const out = { home: 0, away: 0 };
    for (const e of events) {
      const code = String(e.olay_kodu).toUpperCase();
      if (!isGoalCode(code) || e.oyuncu_id) continue;
      // Sayaç, golün PUANI hangi tarafa yazdıysa onu sayar: kendi kalesine
      // golde olayın takımı golü atan oyuncunun takımıdır, puan rakibe gider.
      const own = code === "GOAL_OWN";
      const isHome = Number(e.takim_id) === Number(homeTeamId);
      const isAway = Number(e.takim_id) === Number(awayTeamId);
      if ((isHome && !own) || (isAway && own)) out.home += 1;
      else if ((isAway && !own) || (isHome && own)) out.away += 1;
    }
    return out;
  }, [awayTeamId, events, homeTeamId]);

  /** Sahadaki oyuncular: ilk 11 + girenler − çıkanlar (değişiklik seçicisi için). */
  const onPitch = useMemo(() => {
    const build = (side: "home" | "away") => {
      const teamId = side === "home" ? homeTeamId : awayTeamId;
      const set = new Set(squads[side].filter((p) => p.role === "starter").map((p) => p.id));
      for (const ev of events) {
        if (String(ev.olay_kodu).toUpperCase() !== "SUBSTITUTION" || Number(ev.takim_id) !== Number(teamId)) continue;
        if (ev.oyuncu_cikan_id) set.delete(String(ev.oyuncu_cikan_id));
        if (ev.oyuncu_giren_id) set.add(String(ev.oyuncu_giren_id));
      }
      return set;
    };
    return { home: build("home"), away: build("away") };
  }, [awayTeamId, events, homeTeamId, squads]);

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
    /** Kayıttaki skorun olaylardan fazlası: oyuncu belirtilmeden yazılmış goller. */
    anonGoals: { home: anon.home + anonEventCount.home, away: anon.away + anonEventCount.away },
    bannerEvent,
    /** Bandın ham olayı ve başladığı an (GOL bandı aşamaları için). */
    bannerSource,
    onPitch,
    control,
    nudgeClock,
    addEvent,
    removeEvent,
    addAnonymousGoal,
    removeAnonymousGoal,
    sideOfEvent,
  };
}

export type LiveMatch = ReturnType<typeof useLiveMatch>;
