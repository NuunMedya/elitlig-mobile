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
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { ActionSheet, Panel, SegmentField, confirmAction, useAdminMutation } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, EmptyState, SkeletonListRow, Stepper, Touchable } from "@/components/ui";
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
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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

  const events = useMemo(() => [...(eventsQuery.data ?? [])].sort(sortEvents), [eventsQuery.data]);
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

  /* ───────── skor ───────── */
  const eventScore = useMemo(() => scoreFromEvents(events, homeTeamId, awayTeamId), [events, homeTeamId, awayTeamId]);
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
          writeTimer(await putTimer(matchId, true, nowMs));
          return "Saat çalışıyor.";
        case "pause":
          writeTimer(await putTimer(matchId, false, nowMs));
          return "Saat durduruldu.";
        case "halftime":
          writeTimer(await putTimer(matchId, false, HALF_MS));
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
      for (const ev of events) {
        if (String(ev.olay_kodu).toUpperCase() !== "SUBSTITUTION") continue;
        if (eventSide(ev, homeTeamId, awayTeamId) !== s) continue;
        if (ev.oyuncu_cikan_id) set.delete(String(ev.oyuncu_cikan_id));
        if (ev.oyuncu_giren_id) set.add(String(ev.oyuncu_giren_id));
      }
      return set;
    };
    return { home: build("home"), away: build("away") };
  }, [squads, events, homeTeamId, awayTeamId]);

  const [sheet, setSheet] = useState<{ draft: EventDraft; editing: MatchEvent | null } | null>(null);
  const [actionFor, setActionFor] = useState<MatchEvent | null>(null);
  const [showAll, setShowAll] = useState(false);

  const openNew = (side: Side) =>
    setSheet({
      editing: null,
      draft: { side, code: "", playerId: null, inPlayerId: null, minute: currentMinute, period, note: "" },
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

  const submitEvent = async (draft: EventDraft) => {
    const teamId = draft.side === "home" ? homeTeamId : awayTeamId;
    if (!teamId) throw new Error("Maçın takım kimliği eksik; Maç öncesi adımında takımları seç.");
    const body = draftToBody(draft, teamId, auth.user?.id);
    if (sheet?.editing) await updateEvent(matchId, sheet.editing.id, body);
    else await createEvent(matchId, { ...body, client_event_id: clientEventId() });
    await syncScore();
  };

  const removeEvent = useAdminMutation(
    async (ev: MatchEvent) => {
      await deleteEvent(matchId, ev.id);
      await syncScore();
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
        for (const ev of events) {
          if (!row.test(String(ev.olay_kodu).toUpperCase())) continue;
          const s = eventSide(ev, homeTeamId, awayTeamId);
          if (s === "home") home += 1;
          else if (s === "away") away += 1;
        }
        return { ...row, home, away };
      }),
    [events, homeTeamId, awayTeamId]
  );

  /* ───────── yayın ekranı ───────── */
  const [overlay, setOverlay] = useState<string | null>(match.overlay_status ?? null);
  const [led, setLed] = useState<string | null>(match.led_overlay_status ?? null);
  const overlayMut = useAdminMutation((mode: string) => setOverlayStatus(matchId, mode), { success: "Skorboard modu güncellendi." });
  const ledMut = useAdminMutation((mode: string) => setLedStatus(matchId, mode), { success: "LED ekran içeriği güncellendi." });

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
        {canLive ? (
          <View style={styles.controls}>
            <Button
              label={primary.label}
              icon={primary.icon}
              variant={"danger" in primary && primary.danger ? "danger" : "primary"}
              onPress={primary.run}
              loading={busy}
              haptic="medium"
              fullWidth
            />
            {status === "canli" ? (
              <View style={styles.controlRow}>
                <Button
                  label={running ? "Saati durdur" : "Saati başlat"}
                  icon={running ? "pause" : "play"}
                  variant="secondary"
                  size="sm"
                  onPress={() => control.mutate(running ? "pause" : "resume")}
                  disabled={busy}
                  style={styles.flex}
                />
                <Button label="Süre / devre" icon="create-outline" variant="secondary" size="sm" onPress={openClock} style={styles.flex} />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Olay girişi */}
      {canLive ? (
        <View style={styles.controlRow}>
          <Button label={`${homeName} olayı`} icon="add" onPress={() => openNew("home")} style={styles.flex} size="sm" />
          <Button label={`${awayName} olayı`} icon="add" onPress={() => openNew("away")} style={styles.flex} size="sm" />
        </View>
      ) : null}
      {status !== "canli" && canLive ? (
        <Note text="Olay girmek için maçın canlı olması gerekmez; ancak dakika maç saatinden önerilir. Maçı başlatınca saat çalışır." />
      ) : null}

      <Panel
        title={`OLAYLAR (${events.length})`}
        action={{ label: showAll ? "Yalnız önemli olaylar" : "Tüm olaylar", onPress: () => setShowAll((v) => !v) }}
      >
        {eventsQuery.isLoading ? (
          <SkeletonListRow count={4} />
        ) : shown.length === 0 ? (
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
          <Text style={styles.error} {...textScale.long}>
            {errorText(eventsQuery.error)}
          </Text>
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
                  setOverlay(m.key);
                  overlayMut.mutate(m.key);
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
                  setLed(m.key);
                  ledMut.mutate(m.key);
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
