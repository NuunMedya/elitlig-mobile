/**
 * 3. ADIM — CANLI AKIŞ (web MatchLiveStep / "Reji Paneli").
 *
 * SAAT: sunucudaki sayaç satırı (çalışıyor mu + taban süre + devre) her
 * saniye yerelde ilerletilir; yazma işlemleri PUT /timer ve POST /timer/period
 * ile yapılır. Devre uzunluğu 25 dakikadır (web ile aynı: "Devre arası"
 * saati 25:00'te durdurur, 2. yarı 25:00'dan başlar).
 *
 * AŞAMA DÜĞMESİ: maçın durumuna ve saate göre tek bir doğru eylem gösterilir
 * (Maçı başlat → 1. yarıyı başlat → Devre arası → 2. yarıyı başlat → Maçı
 * bitir → Tekrar canlıya al). Bitirme onay ister.
 *
 * OLAYLAR: her ekleme / düzenleme / silmeden sonra skor olaylardan yeniden
 * hesaplanıp maç kaydına yazılır (elle / hükmen tescilde skor korunur).
 *
 * SAHA KENARI DAYANIKLILIĞI:
 *   · Yeni olay İYİMSER yazılır: girildiği anda listede ve skorda görünür,
 *     arka planda gönderilir (eventOutbox). Gönderilemeyen olay kaybolmaz;
 *     satırda "Tekrar dene / Vazgeç" durur, bağlantı gelince kendiliğinden
 *     yeniden denenir. Aynı `client_event_id` ikinci kez yazılmaz.
 *   · Saat düğmeleri (durdur / devam) anında tepki verir; sunucu reddederse
 *     saat eski hâline döner.
 *   · Olay silme anında listeden düşer; hata olursa geri gelir.
 *   · Eşitleme şeridi her an ne olduğunu söyler: eşitlendi / gönderiliyor /
 *     gönderilemedi / bağlantı yok.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, Panel, SegmentField, confirmAction, useAdminMutation } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, EmptyState, SkeletonListRow, Stepper, Touchable, fireHaptic, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import {
  LED_MODES,
  OVERLAY_MODES,
  TIMELINE_CODES,
  createEvent,
  deleteEvent,
  eventLabel,
  getEvents,
  getLineup,
  getTimer,
  isGoalCode,
  isManualResult,
  normalizeMatchStatus,
  putTimer,
  scoreFromEvents,
  setLedStatus,
  setOverlayStatus,
  setTimerPeriod,
  sortEvents,
  timerNowMs,
  updateEvent,
  updateMatch,
  type AdminMatch,
  type MatchEvent,
  type MatchTimer,
} from "@/lib/api/admin/matches";
import { timeAgo } from "@/lib/admin/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { outbox, useEventOutbox, type PendingEvent } from "./eventOutbox";
import { EventSheet, draftToBody, type EventDraft } from "./EventSheet";
import { clientEventId, clockText, eventSide, pad2, toSquad, type Side } from "./model";
import { Note } from "./parts";
import { ResultSheet } from "./ResultSheet";

const HALF_MS = 25 * 60 * 1000;

const STAT_ROWS = [
  { key: "chance", label: "Tehlike", test: (c: string) => c === "CHANCE_CREATED" },
  { key: "save", label: "Kurtarış", test: (c: string) => c === "SAVE" },
  { key: "duel", label: "İkili mücadele", test: (c: string) => c === "DUEL_WON" || c === "AERIAL_WON" },
  { key: "foul", label: "Faul", test: (c: string) => c === "FOUL" },
  { key: "yellow", label: "Sarı kart", test: (c: string) => c === "YELLOW_CARD" },
  { key: "red", label: "Kırmızı kart", test: (c: string) => c === "RED_CARD" },
];

/** Hızlı olay düğmeleri — en sık girilen dört olay tek dokunuşla açılır. */
const QUICK_EVENTS: { key: string; label: string; code: string; icon: keyof typeof Ionicons.glyphMap; tone: "goal" | "yellow" | "red" | "sub" | "more" }[] = [
  { key: "goal", label: "Gol", code: "GOAL_RIGHT_FOOT", icon: "football", tone: "goal" },
  { key: "yellow", label: "Sarı", code: "YELLOW_CARD", icon: "square", tone: "yellow" },
  { key: "red", label: "Kırmızı", code: "RED_CARD", icon: "square", tone: "red" },
  { key: "sub", label: "Değişiklik", code: "SUBSTITUTION", icon: "swap-vertical", tone: "sub" },
  { key: "more", label: "Diğer", code: "", icon: "ellipsis-horizontal", tone: "more" },
];

const MAX_AUTO_RETRY = 5;

/**
 * Canlı akış uçları hatayı { error: "Olay kaydedilemedi", detail: "<asıl neden>" }
 * biçiminde döndürür; doğrulama hatalarında asıl neden `detail`dedir.
 */
function liveErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403) {
    const detail = (error.detail as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  }
  return errorText(error);
}

/** Bağlantı / sunucu kaynaklı hata: aynı istek sonra yeniden denenebilir. */
const isRetryable = (error: unknown) => !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.status === 408 || error.status === 429;

type Phase = "notStarted" | "kickoff" | "first" | "halftime" | "second" | "extra" | "paused" | "finished";

const PHASE_LABEL: Record<Phase, string> = {
  notStarted: "Başlamadı",
  kickoff: "Başlama düdüğü bekleniyor",
  first: "1. yarı",
  halftime: "Devre arası",
  second: "2. yarı",
  extra: "Uzatma",
  paused: "Saat durdu",
  finished: "Maç bitti",
};

export function LiveStep({ match, onScore }: { match: AdminMatch; onScore?: (score: { home: number; away: number }) => void }) {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const matchId = Number(match.id);
  const homeTeamId = Number(match.home_team_id) || null;
  const awayTeamId = Number(match.away_team_id) || null;
  const homeName = match.first_team_name || "Ev sahibi";
  const awayName = match.second_team_name || "Deplasman";
  const canLive = hasAnyPermission(auth.user, ["matches.live"]);
  const status = normalizeMatchStatus(match.mac_durumu);
  const manual = isManualResult(match);

  const eventsKey = ["admin", "matches", "events", matchId] as const;
  const timerKey = ["admin", "matches", "timer", matchId] as const;

  const eventsQuery = useQuery({
    queryKey: eventsKey,
    queryFn: () => getEvents(matchId),
    refetchInterval: status === "canli" ? 20_000 : false,
  });
  const timerQuery = useQuery({
    queryKey: timerKey,
    queryFn: () => getTimer(matchId),
    refetchInterval: status === "canli" ? 15_000 : false,
  });
  const lineupQuery = useQuery({
    queryKey: ["admin", "matches", "lineup", matchId],
    queryFn: () => getLineup(matchId),
  });

  const pending = useEventOutbox(matchId);
  const events = useMemo(() => [...(eventsQuery.data ?? [])].sort(sortEvents), [eventsQuery.data]);
  /**
   * Sunucudaki olaylar + henüz yazılmamış olanlar (negatif geçici kimlikle).
   * Skor, saha dizilişi ve istatistikler bu birleşik listeden hesaplanır —
   * yönetici girdiği golü hemen skorda görür.
   */
  const allEvents = useMemo<MatchEvent[]>(() => {
    if (!pending.length) return events;
    const optimistic = pending.map((item, index) => ({
      id: -(index + 1),
      mac_id: matchId,
      takim_id: item.body.takim_id,
      oyuncu_id: item.body.oyuncu_id,
      oyuncu_cikan_id: item.body.oyuncu_cikan_id,
      oyuncu_giren_id: item.body.oyuncu_giren_id,
      dakika: item.body.dakika,
      devre: item.body.devre,
      olay_kodu: item.body.olay_kodu,
      aciklama: item.body.aciklama,
    }));
    return [...events, ...optimistic];
  }, [events, pending, matchId]);
  const squads = useMemo(
    () => ({ home: toSquad(lineupQuery.data?.home), away: toSquad(lineupQuery.data?.away) }),
    [lineupQuery.data]
  );
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    [...squads.home, ...squads.away].forEach((p) => map.set(p.id, p.name));
    return (id: unknown) => (id ? map.get(String(id)) ?? `Oyuncu #${id}` : "—");
  }, [squads]);

  /* ───────── saat ───────── */
  const timer = timerQuery.data ?? null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!timer?.running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer?.running]);
  const nowMs = timerNowMs(timer, now);
  const currentMinute = Math.floor(nowMs / 60000);
  const period = Number(timer?.period) > 0 ? Number(timer?.period) : 1;
  const running = Boolean(timer?.running);

  const phase: Phase = (() => {
    if (status === "yayinlanmis") return "finished";
    if (status !== "canli") return "notStarted";
    if (period >= 3) return running ? "extra" : "paused";
    if (period === 2) return running ? "second" : "paused";
    if (running) return "first";
    if (nowMs === 0) return "kickoff";
    return nowMs >= HALF_MS ? "halftime" : "paused";
  })();

  const writeTimer = (next: MatchTimer) => queryClient.setQueryData(timerKey, next);

  /** Saat yazımı iyimserdir: düğme anında tepki verir, hata olursa eski saat geri gelir. */
  const optimisticTimer = async (runningNext: boolean, baseMs: number) => {
    const previous = queryClient.getQueryData<MatchTimer>(timerKey);
    await queryClient.cancelQueries({ queryKey: timerKey });
    if (previous) {
      writeTimer({ ...previous, running: runningNext, base_ms: Math.max(0, Math.floor(baseMs)), base_at: new Date().toISOString() });
      setNow(Date.now());
    }
    try {
      writeTimer(await putTimer(matchId, runningNext, baseMs));
    } catch (error) {
      if (previous) writeTimer(previous);
      throw error;
    }
  };

  /* ───────── skor ───────── */
  const eventScore = useMemo(() => scoreFromEvents(allEvents, homeTeamId, awayTeamId), [allEvents, homeTeamId, awayTeamId]);
  const score = manual
    ? { home: Number(match.first_team_score) || 0, away: Number(match.second_team_score) || 0 }
    : eventScore;
  useEffect(() => {
    onScore?.(score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score.home, score.away]);

  /** Olay değişince skoru maç kaydına eşitle (elle tescilde dokunmaz). */
  const syncScore = async () => {
    const fresh = await queryClient.fetchQuery({ queryKey: eventsKey, queryFn: () => getEvents(matchId), staleTime: 0 });
    if (manual) return;
    const next = scoreFromEvents(fresh, homeTeamId, awayTeamId);
    if (next.home !== Number(match.first_team_score) || next.away !== Number(match.second_team_score)) {
      await updateMatch(matchId, { first_team_score: next.home, second_team_score: next.away });
      void queryClient.invalidateQueries({ queryKey: ["admin", "matches", "detail", matchId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "matches", "list"] });
    }
  };

  /* ───────── maç durumu ───────── */
  const refreshMatch = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
  };

  const control = useAdminMutation(
    async (action: "start" | "kickoff" | "halftime" | "second" | "resume" | "pause" | "finish" | "reopen") => {
      switch (action) {
        case "start":
          await updateMatch(matchId, { mac_durumu: "canli" });
          writeTimer(await putTimer(matchId, true, nowMs));
          writeTimer(await setTimerPeriod(matchId, 1));
          return "Maç canlı yayına alındı.";
        case "kickoff":
        case "resume":
          await optimisticTimer(true, nowMs);
          return "Saat çalışıyor.";
        case "pause":
          await optimisticTimer(false, nowMs);
          return "Saat durduruldu.";
        case "halftime":
          await optimisticTimer(false, HALF_MS);
          return "Devre arası: süre 25:00'da durduruldu.";
        case "second":
          writeTimer(await putTimer(matchId, true, HALF_MS));
          writeTimer(await setTimerPeriod(matchId, 2));
          return "2. yarı 25:00'dan başlatıldı.";
        case "finish":
          await updateMatch(matchId, {
            mac_durumu: "yayinlanmis",
            ...(manual ? {} : { first_team_score: eventScore.home, second_team_score: eventScore.away }),
          });
          writeTimer(await putTimer(matchId, false, nowMs));
          return "Maç bitti, skor tescil edildi.";
        case "reopen":
          await updateMatch(matchId, { mac_durumu: "canli" });
          return "Maç tekrar canlı akışa alındı.";
      }
    },
    { success: (msg) => msg ?? null, onSuccess: refreshMatch }
  );

  const primary = (() => {
    switch (phase) {
      case "notStarted":
        return { label: "Maçı başlat", icon: "play" as const, run: () => control.mutate("start") };
      case "kickoff":
        return { label: "1. yarıyı başlat", icon: "play" as const, run: () => control.mutate("kickoff") };
      case "first":
        return { label: "Devre arası", icon: "cafe-outline" as const, run: () => control.mutate("halftime") };
      case "halftime":
        return { label: "2. yarıyı başlat", icon: "play-forward" as const, run: () => control.mutate("second") };
      case "paused":
        return { label: "Saati devam ettir", icon: "play" as const, run: () => control.mutate("resume") };
      case "second":
      case "extra":
        return { label: "Maçı bitir", icon: "flag-outline" as const, danger: true, run: () => void askFinish() };
      case "finished":
        return { label: "Tekrar canlıya al", icon: "refresh-outline" as const, run: () => control.mutate("reopen") };
    }
  })();

  const askFinish = async () => {
    if (pending.length) {
      toast.show({
        message: `${pending.length} olay henüz sunucuya yazılmadı. Maçı bitirmeden önce gönder ya da vazgeç.`,
        tone: "warn",
      });
      return;
    }
    const ok = await confirmAction({
      title: "Maçı bitir",
      message: `Maç ${score.home} – ${score.away} skoruyla bitirilsin mi?\n\nSkor tescil edilir, puan durumu hesaplanır ve maç "Maç sonu" aşamasına geçer.`,
      confirmLabel: "Bitir",
      destructive: true,
    });
    if (ok) control.mutate("finish");
  };

  /* ───────── süre / devre düzeltme ───────── */
  const [clockOpen, setClockOpen] = useState(false);
  const [mm, setMm] = useState(0);
  const [ss, setSs] = useState(0);
  const [periodDraft, setPeriodDraft] = useState("1");
  const openClock = () => {
    setMm(Math.floor(nowMs / 60000));
    setSs(Math.floor((nowMs % 60000) / 1000));
    setPeriodDraft(String(period));
    setClockOpen(true);
  };
  const saveClock = useAdminMutation(
    async () => {
      writeTimer(await putTimer(matchId, running, (mm * 60 + ss) * 1000));
      if (Number(periodDraft) !== period) writeTimer(await setTimerPeriod(matchId, Number(periodDraft)));
    },
    { success: "Süre ve devre güncellendi.", onSuccess: () => setClockOpen(false) }
  );

  /* ───────── olaylar ───────── */
  const onPitch = useMemo(() => {
    const build = (s: Side) => {
      const set = new Set(squads[s].filter((p) => p.role === "starter").map((p) => p.id));
      for (const ev of allEvents) {
        if (String(ev.olay_kodu).toUpperCase() !== "SUBSTITUTION") continue;
        if (eventSide(ev, homeTeamId, awayTeamId) !== s) continue;
        if (ev.oyuncu_cikan_id) set.delete(String(ev.oyuncu_cikan_id));
        if (ev.oyuncu_giren_id) set.add(String(ev.oyuncu_giren_id));
      }
      return set;
    };
    return { home: build("home"), away: build("away") };
  }, [squads, allEvents, homeTeamId, awayTeamId]);

  const [sheet, setSheet] = useState<{ draft: EventDraft; editing: MatchEvent | null } | null>(null);
  const [actionFor, setActionFor] = useState<MatchEvent | null>(null);
  const [showAll, setShowAll] = useState(false);

  const openNew = (side: Side, code = "") =>
    setSheet({
      editing: null,
      draft: { side, code, playerId: null, inPlayerId: null, minute: currentMinute, period, note: "" },
    });

  const openEdit = (ev: MatchEvent) => {
    const sub = String(ev.olay_kodu).toUpperCase() === "SUBSTITUTION";
    setSheet({
      editing: ev,
      draft: {
        side: eventSide(ev, homeTeamId, awayTeamId) ?? "home",
        code: String(ev.olay_kodu).toUpperCase(),
        playerId: String((sub ? ev.oyuncu_cikan_id : ev.oyuncu_id) ?? "") || null,
        inPlayerId: sub ? String(ev.oyuncu_giren_id ?? "") || null : null,
        minute: Number(ev.dakika) || 0,
        period: Number(ev.devre) || 1,
        note: ev.aciklama ?? "",
      },
    });
  };

  /**
   * Kuyruktaki olayı sunucuya yazar. Başarıda olay önbelleğe eklenir ve
   * kuyruktan düşer; hata olursa satır "gönderilemedi" olarak kalır.
   * `syncScoreRef`: işlev her çizimde yenilenir, gönderim ise ekran yeniden
   * çizildikten sonra da sürebilir — güncel kopya ref üzerinden çağrılır.
   */
  const syncScoreRef = useRef(syncScore);
  syncScoreRef.current = syncScore;

  const sendPending = useCallback(
    async (item: PendingEvent) => {
      outbox.patch(matchId, item.clientId, { state: "sending", error: undefined, attempts: item.attempts + 1 });
      try {
        const saved = await createEvent(matchId, { ...item.body, client_event_id: item.clientId });
        queryClient.setQueryData<MatchEvent[]>(["admin", "matches", "events", matchId], (old) => {
          const list = old ?? [];
          return saved?.id && !list.some((ev) => ev.id === saved.id) ? [...list, saved] : list;
        });
        outbox.remove(matchId, item.clientId);
        // Skor eşitlemesi ikincildir: olay yazıldı, skor bir sonraki yoklamada da eşitlenir.
        await syncScoreRef.current().catch(() => undefined);
      } catch (error) {
        outbox.patch(matchId, item.clientId, { state: "failed", error: liveErrorText(error), retryable: isRetryable(error) });
        fireHaptic("warning");
      }
    },
    [matchId, queryClient]
  );

  const submitEvent = async (draft: EventDraft) => {
    const teamId = draft.side === "home" ? homeTeamId : awayTeamId;
    if (!teamId) throw new Error("Maçın takım kimliği eksik; Maç öncesi adımında takımları seç.");
    const body = draftToBody(draft, teamId, auth.user?.id);
    if (sheet?.editing) {
      try {
        await updateEvent(matchId, sheet.editing.id, body);
      } catch (error) {
        throw new Error(liveErrorText(error));
      }
      await syncScore();
      return;
    }
    // Yeni olay: alt sayfa beklemeden kapanır, gönderim arka planda sürer.
    const item: PendingEvent = { clientId: clientEventId(), body, state: "sending", attempts: 0, createdAt: Date.now() };
    outbox.add(matchId, item);
    void sendPending(item);
  };

  const retryAll = () => {
    outbox
      .get(matchId)
      .filter((item) => item.state === "failed")
      .forEach((item) => void sendPending(item));
  };

  const discardPending = async (item: PendingEvent) => {
    const ok = await confirmAction({
      title: "Olaydan vazgeç",
      message: `${item.body.dakika ?? "–"}' ${eventLabel(item.body.olay_kodu)} sunucuya yazılmadı. Listeden kaldırılsın mı?`,
      confirmLabel: "Kaldır",
      destructive: true,
    });
    if (ok) outbox.remove(matchId, item.clientId);
  };

  /* Bağlantı geri geldiğinde (olay listesi yeniden okunabildiğinde) bağlantı
     yüzünden gönderilemeyen olaylar kendiliğinden yeniden denenir. */
  const eventsUpdatedAt = eventsQuery.dataUpdatedAt;
  useEffect(() => {
    if (!eventsUpdatedAt) return;
    outbox
      .get(matchId)
      .filter((item) => item.state === "failed" && item.retryable && item.attempts < MAX_AUTO_RETRY)
      .forEach((item) => void sendPending(item));
  }, [eventsUpdatedAt, matchId, sendPending]);

  /** Silme iyimserdir: olay listeden hemen düşer, hata olursa geri gelir. */
  const removeEvent = useAdminMutation(
    async (ev: MatchEvent) => {
      await queryClient.cancelQueries({ queryKey: eventsKey });
      const previous = queryClient.getQueryData<MatchEvent[]>(eventsKey);
      queryClient.setQueryData<MatchEvent[]>(eventsKey, (old) => (old ?? []).filter((item) => item.id !== ev.id));
      try {
        await deleteEvent(matchId, ev.id);
      } catch (error) {
        // 404: olay başka bir cihazdan zaten silinmiş — hedeflenen sonuç bu.
        if (!(error instanceof ApiError && error.status === 404)) {
          if (previous) queryClient.setQueryData(eventsKey, previous);
          throw new Error(liveErrorText(error));
        }
      }
      await syncScore().catch(() => undefined);
    },
    { success: "Olay silindi.", invalidate: [eventsKey] }
  );

  const askRemove = async (ev: MatchEvent) => {
    const ok = await confirmAction({
      title: "Olayı sil",
      message: `${ev.dakika ?? "–"}' ${eventLabel(ev.olay_kodu)} · ${describe(ev)}\n\nSkor olaylardan yeniden hesaplanır.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) removeEvent.mutate(ev);
  };

  const describe = (ev: MatchEvent) => {
    const code = String(ev.olay_kodu).toUpperCase();
    if (code === "SUBSTITUTION") return `${nameOf(ev.oyuncu_cikan_id)} çıktı · ${nameOf(ev.oyuncu_giren_id)} girdi`;
    return nameOf(ev.oyuncu_id);
  };

  const shown = showAll ? events : events.filter((ev) => TIMELINE_CODES.has(String(ev.olay_kodu).toUpperCase()));

  const stats = useMemo(
    () =>
      STAT_ROWS.map((row) => {
        let home = 0;
        let away = 0;
        for (const ev of allEvents) {
          if (!row.test(String(ev.olay_kodu).toUpperCase())) continue;
          const s = eventSide(ev, homeTeamId, awayTeamId);
          if (s === "home") home += 1;
          else if (s === "away") away += 1;
        }
        return { ...row, home, away };
      }),
    [allEvents, homeTeamId, awayTeamId]
  );

  /* ───────── eşitleme durumu ───────── */
  const failed = pending.filter((item) => item.state === "failed");
  const sending = pending.length - failed.length;
  const offline = (eventsQuery.isError || timerQuery.isError) && !eventsQuery.isFetching;
  const sync: { tone: "ok" | "busy" | "bad"; icon: keyof typeof Ionicons.glyphMap; text: string } = failed.length
    ? { tone: "bad", icon: "alert-circle", text: `${failed.length} olay gönderilemedi` }
    : sending
      ? { tone: "busy", icon: "cloud-upload-outline", text: `${sending} olay gönderiliyor…` }
      : offline
        ? { tone: "bad", icon: "cloud-offline-outline", text: "Bağlantı yok — girilen olaylar sırada bekler" }
        : {
            tone: "ok",
            icon: "cloud-done-outline",
            text: eventsQuery.dataUpdatedAt ? `Eşitlendi · ${timeAgo(new Date(eventsQuery.dataUpdatedAt).toISOString())}` : "Eşitleniyor…",
          };

  /* ───────── yayın ekranı ───────── */
  const [overlay, setOverlay] = useState<string | null>(match.overlay_status ?? null);
  const [led, setLed] = useState<string | null>(match.led_overlay_status ?? null);
  const overlayMut = useAdminMutation(
    async ({ mode, previous }: { mode: string; previous: string | null }) => {
      try {
        return await setOverlayStatus(matchId, mode);
      } catch (error) {
        setOverlay(previous);
        throw error;
      }
    },
    { success: "Skorboard modu güncellendi." }
  );
  const ledMut = useAdminMutation(
    async ({ mode, previous }: { mode: string; previous: string | null }) => {
      try {
        return await setLedStatus(matchId, mode);
      } catch (error) {
        setLed(previous);
        throw error;
      }
    },
    { success: "LED ekran içeriği güncellendi." }
  );

  const [resultOpen, setResultOpen] = useState(false);
  const busy = control.isPending;

  return (
    <View style={styles.stack}>
      {manual ? <Note tone="warn" text="Skor elle / hükmen tescil edildi. Girilen olaylar skoru değiştirmez." /> : null}

      {/* Telefondan YouTube canlı yayın + yatay mobil reji */}
      {canLive ? (
        <Touchable
          style={styles.liveCta}
          onPress={() => router.push(`/yonetim/canli-yayin/${matchId}`)}
          accessibilityLabel="Telefondan canlı yayın başlat"
          haptic="light"
        >
          <View style={styles.liveCtaIcon}>
            <Ionicons name="videocam" size={20} color={colors.textOnBrand} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.liveCtaTitle} {...textScale.dense}>
              Canlı yayın başlat
            </Text>
            <Text style={styles.liveCtaBody} {...textScale.long}>
              Telefon kamerasıyla YouTube'da yayın; skorbord görüntünün üstünde, reji yatay ekranda.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Touchable>
      ) : null}

      {/* Skor ve saat */}
      <View style={styles.board}>
        <View style={styles.boardRow}>
          <Text style={styles.boardTeam} numberOfLines={2} {...textScale.dense}>
            {homeName}
          </Text>
          <Text style={styles.boardScore} {...textScale.badge}>
            {score.home} – {score.away}
          </Text>
          <Text style={[styles.boardTeam, styles.right]} numberOfLines={2} {...textScale.dense}>
            {awayName}
          </Text>
        </View>
        <View style={styles.clockRow}>
          <Ionicons name={running ? "timer-outline" : "pause-circle-outline"} size={18} color={running ? colors.live : colors.textTertiary} />
          <Text style={[styles.clock, running ? styles.clockLive : null]} {...textScale.badge}>
            {clockText(nowMs)}
          </Text>
          <Text style={styles.phase} {...textScale.dense}>
            {PHASE_LABEL[phase]} · {period === 3 ? "Uzatma" : `${period}. devre`}
          </Text>
        </View>
        <View
          style={styles.syncRow}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Eşitleme durumu: ${sync.text}`}
        >
          <Ionicons
            name={sync.icon}
            size={14}
            color={sync.tone === "bad" ? colors.danger : sync.tone === "busy" ? colors.warn : colors.textTertiary}
          />
          <Text style={[styles.syncText, sync.tone === "bad" ? styles.syncBad : null]} numberOfLines={1} {...textScale.dense}>
            {sync.text}
          </Text>
          {failed.length ? (
            <Touchable onPress={retryAll} haptic="light" hitSlop={12} accessibilityRole="button" accessibilityLabel="Gönderilemeyen olayları tekrar dene">
              <Text style={styles.syncAction} {...textScale.dense}>
                Tekrar dene
              </Text>
            </Touchable>
          ) : null}
        </View>
        {canLive ? (
          <View style={styles.controls}>
            <Button
              label={primary.label}
              icon={primary.icon}
              variant={"danger" in primary && primary.danger ? "danger" : "primary"}
              onPress={primary.run}
              loading={busy}
              size="lg"
              haptic="medium"
              fullWidth
            />
            {status === "canli" ? (
              <View style={styles.controlRow}>
                <Button
                  label={running ? "Saati durdur" : "Saati başlat"}
                  icon={running ? "pause" : "play"}
                  variant="secondary"
                  onPress={() => control.mutate(running ? "pause" : "resume")}
                  disabled={busy}
                  style={styles.flex}
                />
                <Button label="Süre / devre" icon="create-outline" variant="secondary" onPress={openClock} style={styles.flex} />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Olay girişi */}
      {canLive ? (
        <View style={styles.quick}>
          {(["home", "away"] as const).map((side) => (
            <View key={side} style={styles.quickSide}>
              <Text style={styles.quickTeam} numberOfLines={1} {...textScale.dense}>
                {side === "home" ? homeName : awayName}
              </Text>
              <View style={styles.quickRow}>
                {QUICK_EVENTS.map((q) => (
                  <Touchable
                    key={q.key}
                    onPress={() => openNew(side, q.code)}
                    haptic="light"
                    feedback="card"
                    style={styles.quickBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`${side === "home" ? homeName : awayName}: ${q.label} ekle`}
                  >
                    <Ionicons name={q.icon} size={20} color={quickColor(q.tone)} />
                    <Text style={styles.quickLabel} numberOfLines={1} {...textScale.badge}>
                      {q.label}
                    </Text>
                  </Touchable>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {status !== "canli" && canLive ? (
        <Note text="Olay girmek için maçın canlı olması gerekmez; ancak dakika maç saatinden önerilir. Maçı başlatınca saat çalışır." />
      ) : null}

      <Panel
        title={`OLAYLAR (${events.length + pending.length})`}
        action={{ label: showAll ? "Yalnız önemli olaylar" : "Tüm olaylar", onPress: () => setShowAll((v) => !v) }}
      >
        {pending.map((item) => (
          <View key={item.clientId} style={[styles.event, item.state === "failed" ? styles.eventFailed : null]}>
            <Text style={styles.minute} {...textScale.badge}>
              {item.body.dakika ?? "–"}&apos;
            </Text>
            <Ionicons
              name={item.state === "failed" ? "alert-circle" : "cloud-upload-outline"}
              size={16}
              color={item.state === "failed" ? colors.danger : colors.warn}
            />
            <View style={styles.eventText}>
              <Text style={styles.eventTitle} numberOfLines={1} {...textScale.dense}>
                {eventLabel(item.body.olay_kodu)} ·{" "}
                {item.body.olay_kodu === "SUBSTITUTION"
                  ? `${nameOf(item.body.oyuncu_cikan_id)} çıktı · ${nameOf(item.body.oyuncu_giren_id)} girdi`
                  : nameOf(item.body.oyuncu_id)}
              </Text>
              <Text style={[styles.eventMeta, item.state === "failed" ? styles.syncBad : null]} numberOfLines={2} {...textScale.dense}>
                {item.state === "failed" ? `Gönderilemedi: ${item.error ?? "bağlantı hatası"}` : "Gönderiliyor…"}
              </Text>
            </View>
            {item.state === "failed" ? (
              <View style={styles.pendingActions}>
                <Touchable onPress={() => void sendPending(item)} haptic="light" hitSlop={10} style={styles.pendingBtn} accessibilityRole="button" accessibilityLabel="Olayı tekrar gönder">
                  <Ionicons name="refresh" size={20} color={colors.brandAccent} />
                </Touchable>
                <Touchable onPress={() => void discardPending(item)} hitSlop={10} style={styles.pendingBtn} accessibilityRole="button" accessibilityLabel="Olaydan vazgeç">
                  <Ionicons name="close" size={20} color={colors.danger} />
                </Touchable>
              </View>
            ) : null}
          </View>
        ))}
        {eventsQuery.isLoading ? (
          <SkeletonListRow count={4} />
        ) : shown.length === 0 && pending.length === 0 ? (
          <EmptyState icon="football-outline" title="Henüz olay yok" body="Gol, kart ve değişiklikler burada sıralanır." variant="inline" compact />
        ) : (
          shown.map((ev) => {
            const s = eventSide(ev, homeTeamId, awayTeamId);
            const code = String(ev.olay_kodu).toUpperCase();
            return (
              <Touchable
                key={ev.id}
                onPress={canLive ? () => setActionFor(ev) : undefined}
                style={styles.event}
                accessibilityRole="button"
                accessibilityLabel={`${ev.dakika ?? ""}. dakika ${eventLabel(code)} ${describe(ev)}`}
              >
                <Text style={styles.minute} {...textScale.badge}>
                  {ev.dakika ?? "–"}&apos;
                </Text>
                <View style={[styles.dot, { backgroundColor: dotColor(code) }]} />
                <View style={styles.eventText}>
                  <Text style={styles.eventTitle} numberOfLines={1} {...textScale.dense}>
                    {eventLabel(code)}
                    {Number(ev.devre) === 2 ? " · 2. yarı" : Number(ev.devre) >= 3 ? " · uzatma" : ""}
                  </Text>
                  <Text style={styles.eventMeta} numberOfLines={2} {...textScale.dense}>
                    {describe(ev)} · {s === "home" ? homeName : s === "away" ? awayName : "Takım yok"}
                  </Text>
                </View>
                {canLive ? <Ionicons name="ellipsis-horizontal" size={18} color={colors.textTertiary} /> : null}
              </Touchable>
            );
          })
        )}
        {eventsQuery.isError ? (
          <Touchable onPress={() => void eventsQuery.refetch()} accessibilityRole="button" accessibilityLabel="Olayları yeniden yükle">
            <Text style={styles.error} {...textScale.long}>
              {eventsQuery.data ? "Olay listesi güncellenemedi; son bilinen liste gösteriliyor. " : ""}
              {errorText(eventsQuery.error)} Yeniden denemek için dokun.
            </Text>
          </Touchable>
        ) : null}
      </Panel>

      <Panel title="TAKIM İSTATİSTİKLERİ">
        <StatLine label="Gol" home={score.home} away={score.away} />
        {stats.map((row) => (
          <StatLine key={row.key} label={row.label} home={row.home} away={row.away} />
        ))}
      </Panel>

      {canLive ? (
        <Panel title="YAYIN EKRANI">
          <Text style={styles.subLabel} {...textScale.dense}>
            Skorboard (OBS / vMix)
          </Text>
          <ChipGroup scrollable={false} contentPadding={0}>
            {OVERLAY_MODES.map((m) => (
              <Chip
                key={m.key}
                label={m.label}
                size="sm"
                selected={overlay === m.key}
                disabled={overlayMut.isPending}
                onPress={() => {
                  overlayMut.mutate({ mode: m.key, previous: overlay });
                  setOverlay(m.key);
                }}
              />
            ))}
          </ChipGroup>
          <Text style={styles.subLabel} {...textScale.dense}>
            Sahadaki LED ekran
          </Text>
          <ChipGroup scrollable={false} contentPadding={0}>
            {LED_MODES.map((m) => (
              <Chip
                key={m.key}
                label={m.label}
                size="sm"
                selected={led === m.key}
                disabled={ledMut.isPending}
                onPress={() => {
                  ledMut.mutate({ mode: m.key, previous: led });
                  setLed(m.key);
                }}
              />
            ))}
          </ChipGroup>
        </Panel>
      ) : null}

      {hasAnyPermission(auth.user, ["matches.update", "matches.live"]) ? (
        <Button label="Sonucu elle / hükmen tescil et" icon="ribbon-outline" variant="ghost" onPress={() => setResultOpen(true)} />
      ) : null}

      <EventSheet
        visible={sheet != null}
        onClose={() => setSheet(null)}
        initial={sheet?.draft ?? { side: "home", code: "", playerId: null, inPlayerId: null, minute: 0, period: 1, note: "" }}
        editing={sheet?.editing}
        homeName={homeName}
        awayName={awayName}
        squads={squads}
        onPitch={onPitch}
        onSubmit={submitEvent}
      />

      <ActionSheet
        visible={actionFor != null}
        onClose={() => setActionFor(null)}
        title={actionFor ? `${actionFor.dakika ?? "–"}' ${eventLabel(actionFor.olay_kodu)}` : undefined}
        actions={[
          { label: "Olayı düzenle", icon: "create-outline", onPress: () => actionFor && openEdit(actionFor) },
          { label: "Olayı sil", icon: "trash-outline", danger: true, onPress: () => actionFor && void askRemove(actionFor) },
        ]}
      />

      <BottomSheet
        visible={clockOpen}
        onClose={() => setClockOpen(false)}
        title="Süre ve devre"
        snap="content"
        footer={<Button label="Kaydet" onPress={() => saveClock.mutate(undefined)} loading={saveClock.isPending} fullWidth />}
      >
        <View style={styles.stack}>
          <View style={styles.clockEdit}>
            <Stepper value={mm} onChange={setMm} min={0} max={130} label="Dakika" repeatOnHold accessibilityLabel="Dakika" />
            <Text style={styles.clock}>:</Text>
            <Stepper value={ss} onChange={setSs} min={0} max={59} label="Saniye" repeatOnHold accessibilityLabel="Saniye" />
          </View>
          <Text style={styles.preview} {...textScale.badge}>
            {pad2(mm)}:{pad2(ss)}
          </Text>
          <SegmentField<string>
            label="Devre"
            value={periodDraft}
            onChange={setPeriodDraft}
            options={[
              { key: "1", label: "1. yarı" },
              { key: "2", label: "2. yarı" },
              { key: "3", label: "Uzatma" },
            ]}
          />
          <Text style={styles.subLabel} {...textScale.long}>
            Saat çalışıyorsa yeni süreden devam eder; durmuşsa yeni sürede bekler.
          </Text>
        </View>
      </BottomSheet>

      <ResultSheet visible={resultOpen} onClose={() => setResultOpen(false)} match={match} onSaved={refreshMatch} />
    </View>
  );
}

function quickColor(tone: (typeof QUICK_EVENTS)[number]["tone"]) {
  if (tone === "goal") return colors.win;
  if (tone === "yellow") return colors.yellowCard;
  if (tone === "red") return colors.redCard;
  if (tone === "sub") return colors.info;
  return colors.textSecondary;
}

function dotColor(code: string) {
  if (isGoalCode(code)) return colors.win;
  if (code === "YELLOW_CARD") return colors.yellowCard;
  if (code === "RED_CARD") return colors.redCard;
  if (code === "SUBSTITUTION") return colors.info;
  return colors.textTertiary;
}

function StatLine({ label, home, away }: { label: string; home: number; away: number }) {
  const total = home + away;
  const pct = total ? Math.round((home / total) * 100) : 50;
  return (
    <View style={styles.statLine}>
      <View style={styles.statHead}>
        <Text style={styles.statNum} {...textScale.badge}>
          {home}
        </Text>
        <Text style={styles.statLabel} {...textScale.dense}>
          {label}
        </Text>
        <Text style={styles.statNum} {...textScale.badge}>
          {away}
        </Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barHome, { flex: Math.max(pct, 1) }]} />
        <View style={[styles.barAway, { flex: Math.max(100 - pct, 1) }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  liveCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.live,
  },
  liveCtaIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.live },
  liveCtaTitle: { ...type.h4, color: colors.textPrimary },
  liveCtaBody: { ...type.caption, color: colors.textSecondary, marginTop: space.xxs },
  flex: { flex: 1 },
  right: { textAlign: "right" },
  board: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  boardRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  boardTeam: { ...type.label, color: colors.textPrimary, flex: 1 },
  boardScore: { ...type.scoreLg, color: colors.textPrimary },
  clockRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  clock: { ...type.clock, color: colors.textPrimary },
  clockLive: { color: colors.live },
  phase: { ...type.caption, color: colors.textSecondary },
  controls: { gap: space.sm },
  controlRow: { flexDirection: "row", gap: space.sm },
  event: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  eventFailed: { backgroundColor: colors.dangerDim, borderRadius: radius.sm, paddingHorizontal: space.sm },
  pendingActions: { flexDirection: "row", gap: space.xs },
  pendingBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  syncRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, minHeight: 20 },
  syncText: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  syncBad: { color: colors.danger },
  syncAction: { ...type.labelSm, color: colors.brandAccent, marginLeft: space.sm },
  quick: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.md,
    gap: space.md,
  },
  quickSide: { gap: space.sm },
  quickTeam: { ...type.overline, color: colors.textTertiary },
  quickRow: { flexDirection: "row", gap: space.xs },
  quickBtn: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xxs,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  quickLabel: { ...type.labelXs, color: colors.textPrimary },
  minute: { ...type.tableNumStrong, color: colors.textPrimary, width: 36 },
  dot: { width: 8, height: 8, borderRadius: radius.xs },
  eventText: { flex: 1, gap: 2 },
  eventTitle: { ...type.label, color: colors.textPrimary },
  eventMeta: { ...type.caption, color: colors.textSecondary },
  error: { ...type.bodySm, color: colors.danger },
  subLabel: { ...type.caption, color: colors.textTertiary },
  statLine: { gap: space.xs },
  statHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statNum: { ...type.tableNumStrong, color: colors.textPrimary, minWidth: 24, textAlign: "center" },
  statLabel: { ...type.caption, color: colors.textSecondary },
  bar: { flexDirection: "row", height: 4, borderRadius: radius.xs, overflow: "hidden", gap: 2 },
  barHome: { backgroundColor: colors.brand },
  barAway: { backgroundColor: colors.accent },
  clockEdit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.lg },
  preview: { ...type.scoreMd, color: colors.textPrimary, textAlign: "center" },
});
