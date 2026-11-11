/**
 * 4. ADIM — MAÇ SONU (web MatchPostStep + matchContent + Enter_Stats).
 *
 * Maçın içeriğine dair HER ŞEY buradan girilir; canlı takip edilmeden oynanan
 * (durumu hâlâ "Zamanlandı") maç için de açıktır.
 *
 *   · Sonuç      — skor, golcüler, kartlar; "Sonucu tescil et" (elle skor /
 *                  hükmen, POST /maclar/:id/result) ve "Maçı yayınla"
 *   · Takım ist. — olaylardan gol / tehlike / kurtarış / ikili mücadele / faul / kart
 *   · Kontrol    — puanlar, manşet, rapor, kapak, enler, röportaj (dokununca sekme)
 *   · Puanlar    — kadrodaki her oyuncuya 0–10 puan (PATCH /kadro/puan)
 *   · Enler      — Maçın Oyuncusu, mevki ödülleri, maçın golü / kurtarışı; öneriler
 *   · İçerik     — manşet, rapor, kapak görseli, yayın / maç videosu, röportaj, foto
 *   · İstatistik — oyuncu başına maç istatistiği + takım yüzdeleri (Enter_Stats)
 *   · Olaylar    — olay akışını sonradan ekle / düzelt / sil (gol, asist, kart,
 *                  değişiklik, kurtarış…); skor olaylardan yeniden eşitlenir
 *
 * Kaydet düğmesi ekranın altında sabittir (StepSaveBar).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";

import { ActionSheet, Panel, SelectField, confirmAction, useAdminMutation, type Option } from "@/components/admin";
import { Button, Chip, ChipGroup, EmptyState, Input, SkeletonListRow, StatBar, Touchable } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import {
  HIGHLIGHT_FIELDS,
  buildPostPayload,
  createEvent,
  deleteEvent,
  eventLabel,
  getEvents,
  getLineup,
  isManualResult,
  isRatingInvalid,
  normalizeMatchStatus,
  normalizeRating,
  readHighlights,
  readPostContent,
  resultSourceLabel,
  saveRatings,
  scoreFromEvents,
  setMatchStatus,
  sortEvents,
  updateEvent,
  updateMatch,
  uploadMatchCover,
  type AdminMatch,
  type HighlightKey,
  type MatchEvent,
  type PostContent,
} from "@/lib/api/admin/matches";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { EventSheet, draftToBody, type EventDraft } from "./EventSheet";
import { clientEventId, eventSide, toSquad, type Side, type SquadPlayer, type StepKey } from "./model";
import { Note, SidePicker, StepSaveBar } from "./parts";
import { ResultSheet } from "./ResultSheet";
import { StatsEditor } from "./StatsEditor";

type Tab = "ratings" | "awards" | "content" | "stats" | "events";

const POSITION_WORDS: Partial<Record<HighlightKey, string[]>> = {
  best_goalkeeper: ["kaleci", "goalkeeper", "gk"],
  best_defender: ["defans", "defender", "stoper", "bek"],
  best_midfielder: ["orta saha", "ortasaha", "midfielder", "orta"],
  best_forward: ["forvet", "forward", "santrafor", "kanat"],
};

/** Takım istatistikleri (web matchSummary.STAT_ROWS). */
const STAT_ROWS: { key: string; label: string; test: (code: string) => boolean }[] = [
  { key: "goal", label: "Gol", test: (c) => c.startsWith("GOAL_") },
  { key: "chance", label: "Tehlike", test: (c) => c === "CHANCE_CREATED" },
  { key: "save", label: "Kurtarış", test: (c) => c === "SAVE" },
  { key: "duel", label: "İkili mücadele", test: (c) => c === "DUEL_WON" || c === "AERIAL_WON" },
  { key: "foul", label: "Faul", test: (c) => c === "FOUL" },
  { key: "yellow", label: "Sarı kart", test: (c) => c === "YELLOW_CARD" },
  { key: "red", label: "Kırmızı kart", test: (c) => c === "RED_CARD" },
];

/** 4xx yanıtında sunucunun `detail` metni (ör. "Oyuncu bu maçın kadrosunda değil"). */
function eventErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403) {
    const detail = (error.detail as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  }
  return errorText(error);
}

function eventColor(code: string) {
  if (code.startsWith("GOAL_")) return colors.win;
  if (code === "YELLOW_CARD") return colors.warn;
  if (code === "RED_CARD") return colors.danger;
  if (code === "SUBSTITUTION") return colors.info;
  return colors.textTertiary;
}

const pctText = (value: unknown) => (value == null || Number(value) === 0 ? "" : String(value));

export function PostStep({
  match,
  onDirtyChange,
  onGoStep,
}: {
  match: AdminMatch;
  onDirtyChange?: (dirty: boolean) => void;
  onGoStep?: (step: StepKey) => void;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const matchId = Number(match.id);
  const homeTeamId = Number(match.home_team_id) || null;
  const awayTeamId = Number(match.away_team_id) || null;
  const homeName = match.first_team_name || "Ev sahibi";
  const awayName = match.second_team_name || "Deplasman";
  const canStats = hasAnyPermission(auth.user, ["matches.stats"]);
  const canContent = hasAnyPermission(auth.user, ["matches.update"]);
  const canPublish = hasAnyPermission(auth.user, ["matches.publish", "matches.update"]);
  const canResult = hasAnyPermission(auth.user, ["matches.update", "matches.live"]);
  const canEvents = hasAnyPermission(auth.user, ["matches.live"]);
  const status = normalizeMatchStatus(match.mac_durumu);
  const finished = status === "yayinlanmis";
  const manual = isManualResult(match);

  const lineupKey = useMemo(() => ["admin", "matches", "lineup", matchId] as const, [matchId]);
  const eventsKey = useMemo(() => ["admin", "matches", "events", matchId] as const, [matchId]);
  const lineupQuery = useQuery({ queryKey: lineupKey, queryFn: () => getLineup(matchId) });
  const eventsQuery = useQuery({ queryKey: eventsKey, queryFn: () => getEvents(matchId) });

  const squads = useMemo<Record<Side, SquadPlayer[]>>(
    () => ({ home: toSquad(lineupQuery.data?.home), away: toSquad(lineupQuery.data?.away) }),
    [lineupQuery.data]
  );
  const allPlayers = useMemo(() => [...squads.home, ...squads.away], [squads]);
  const nameOf = (id: unknown) => allPlayers.find((p) => p.id === String(id))?.name ?? (id ? `Oyuncu #${id}` : "—");

  const [tab, setTab] = useState<Tab>("ratings");
  const [resultOpen, setResultOpen] = useState(false);

  const refreshMatch = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
    void queryClient.invalidateQueries({ queryKey: ["studio"] });
  };

  /* ───────── özet ───────── */
  const sortedEvents = useMemo(() => [...(eventsQuery.data ?? [])].sort(sortEvents), [eventsQuery.data]);
  const summary = useMemo(() => {
    const goals: Record<Side, { name: string; minute: number | null; own: boolean }[]> = { home: [], away: [] };
    const cards: Record<Side, { name: string; minute: number | null; red: boolean }[]> = { home: [], away: [] };
    const stats = STAT_ROWS.map((row) => ({ key: row.key, label: row.label, home: 0, away: 0 }));
    let subs = 0;
    for (const ev of sortedEvents) {
      const code = String(ev.olay_kodu).toUpperCase();
      const s = eventSide(ev, homeTeamId, awayTeamId);
      if (!s) continue;
      const scoring: Side = code === "GOAL_OWN" ? (s === "home" ? "away" : "home") : s;
      STAT_ROWS.forEach((row, i) => {
        if (row.test(code)) stats[i][row.key === "goal" ? scoring : s] += 1;
      });
      if (code.startsWith("GOAL_")) {
        goals[scoring].push({ name: nameOf(ev.oyuncu_id), minute: ev.dakika, own: code === "GOAL_OWN" });
      } else if (code === "YELLOW_CARD" || code === "RED_CARD") {
        cards[s].push({ name: nameOf(ev.oyuncu_id), minute: ev.dakika, red: code === "RED_CARD" });
      } else if (code === "SUBSTITUTION") subs += 1;
    }
    return { goals, cards, subs, stats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedEvents, allPlayers, homeTeamId, awayTeamId]);

  /* ───────── puanlar ───────── */
  const savedRatings = useMemo(() => {
    const out: Record<string, string> = {};
    for (const row of [...(lineupQuery.data?.home ?? []), ...(lineupQuery.data?.away ?? [])]) {
      const id = String(row.playerId ?? row.oyuncu_id ?? "");
      if (id && row.puan != null) out[id] = String(row.puan);
    }
    return out;
  }, [lineupQuery.data]);
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [ratingSide, setRatingSide] = useState<Side>("home");
  const savedRatingsKey = JSON.stringify(savedRatings);
  useEffect(() => {
    setRatings(savedRatings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRatingsKey]);
  /* Sunucu boş puanı yok sayar (routes/MatchFlow.js: puan !== null süzgeci);
     kayıtlı bir puan silinemez, yalnız değiştirilir. Bu yüzden "kaydedilmemiş"
     sayılan yalnız geçerli ve farklı değerlerdir. */
  const changedRatings = allPlayers.filter((p) => {
    const next = normalizeRating(ratings[p.id]);
    return next != null && !isRatingInvalid(ratings[p.id]) && next !== normalizeRating(savedRatings[p.id]);
  });
  const clearedRatings = allPlayers.filter((p) => savedRatings[p.id] != null && (ratings[p.id] ?? "") === "").length;
  const ratingsDirty = changedRatings.length > 0;
  const invalidCount = allPlayers.filter((p) => isRatingInvalid(ratings[p.id])).length;
  const filled = allPlayers.filter((p) => ratings[p.id] && !isRatingInvalid(ratings[p.id])).length;

  const ratingMut = useAdminMutation(
    () =>
      saveRatings(
        matchId,
        allPlayers
          .map((p) => ({ playerId: Number(p.id), oyuncu_id: Number(p.id), puan: normalizeRating(ratings[p.id]) }))
          .filter((r) => r.puan != null)
      ),
    { success: "Oyuncu puanları kaydedildi.", invalidate: [lineupKey] }
  );

  const bumpRating = (id: string, delta: number) =>
    setRatings((r) => {
      const current = normalizeRating(r[id]);
      const next = Math.max(0, Math.min(10, Math.round(((current ?? 6) + (current == null ? 0 : delta)) * 2) / 2));
      return { ...r, [id]: String(next) };
    });

  /* ───────── içerik + enler ───────── */
  const savedContent = useMemo(() => readPostContent(match), [match]);
  const savedHighlights = useMemo(() => readHighlights(match, allPlayers), [match, allPlayers]);
  const [content, setContent] = useState<PostContent>(savedContent);
  const [highlights, setHighlights] = useState<Record<string, string>>(savedHighlights);
  /* Form yalnız KAYITLI DEĞER gerçekten değişince yenilenir. Nesne kimliğine
     bağlansaydı, puanlar kaydedilip kadro yeniden okunduğunda (yeni dizi =
     yeni nesne) kaydedilmemiş "Enler" seçimleri sessizce sıfırlanırdı. */
  const savedContentKey = JSON.stringify(savedContent);
  const savedHighlightsKey = JSON.stringify(savedHighlights);
  useEffect(() => {
    setContent(savedContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedContentKey]);
  useEffect(() => {
    setHighlights(savedHighlights);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedHighlightsKey]);
  const textDirty = JSON.stringify(content) !== JSON.stringify(savedContent);
  const awardsDirty = HIGHLIGHT_FIELDS.some(({ key }) => (highlights[key] || "") !== (savedHighlights[key] || ""));
  const contentDirty = textDirty || awardsDirty;
  const highlightCount = HIGHLIGHT_FIELDS.filter(({ key }) => Boolean(highlights[key])).length;

  const anyDirty = ratingsDirty || contentDirty;
  useEffect(() => {
    onDirtyChange?.(anyDirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyDirty]);

  const contentMut = useAdminMutation(() => updateMatch(matchId, buildPostPayload(content, highlights, nameOf, match)), {
    success: "Maç sonu içerikleri kaydedildi.",
    invalidate: [["admin", "matches"]],
  });

  const suggestions = useMemo(() => {
    const rated = allPlayers
      .map((p) => ({ ...p, score: normalizeRating(ratings[p.id]) }))
      .filter((p): p is SquadPlayer & { score: number } => p.score != null)
      .sort((a, b) => b.score - a.score);
    const out: Partial<Record<HighlightKey, { id: string; reason: string }>> = {};
    if (rated[0]) out.best_player = { id: rated[0].id, reason: `${rated[0].score} puan` };
    (Object.entries(POSITION_WORDS) as [HighlightKey, string[]][]).forEach(([key, words]) => {
      const found = rated.find((p) => words.some((w) => p.position.toLocaleLowerCase("tr-TR").includes(w)));
      if (found) out[key] = { id: found.id, reason: `${found.score} puan` };
    });
    const scorers = new Set<string>();
    for (const ev of eventsQuery.data ?? []) {
      const code = String(ev.olay_kodu).toUpperCase();
      if (code.startsWith("GOAL_") && code !== "GOAL_OWN" && ev.oyuncu_id) scorers.add(String(ev.oyuncu_id));
    }
    if (scorers.size === 1) out.best_goal = { id: [...scorers][0], reason: "maçın tek golcüsü" };
    return out;
  }, [allPlayers, ratings, eventsQuery.data]);

  const playerOptions: Option<string>[] = allPlayers.map((p) => ({
    value: p.id,
    label: p.name,
    hint: [p.id && squads.home.some((h) => h.id === p.id) ? match.first_team_name : match.second_team_name, p.position].filter(Boolean).join(" · "),
  }));

  /* ───────── kapak ───────── */
  const [uploading, setUploading] = useState(false);
  const pickCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("İzin gerekli", "Kapak görseli seçmek için fotoğraflarına erişim izni ver.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? "image/jpeg";
    setUploading(true);
    try {
      const res = await uploadMatchCover(matchId, {
        uri: asset.uri,
        name: asset.fileName ?? `mac-${matchId}-${Date.now()}.${mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg"}`,
        type: mime,
      });
      const url = res.url || res.match_picture;
      if (url) setContent((c) => ({ ...c, coverImage: url }));
      void queryClient.invalidateQueries({ queryKey: ["admin", "matches", "detail", matchId] });
    } catch (error) {
      Alert.alert("Kapak yüklenemedi", errorText(error));
    } finally {
      setUploading(false);
    }
  };

  /* ───────── takım yüzdeleri (Enter_Stats) ───────── */
  const savedPct = { home: pctText(match.first_team_percentage), away: pctText(match.second_team_percentage) };
  const [pct, setPct] = useState(savedPct);
  const savedPctKey = `${savedPct.home}|${savedPct.away}`;
  useEffect(() => {
    setPct(savedPct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPctKey]);
  const pctDirty = pct.home !== savedPct.home || pct.away !== savedPct.away;
  const pctInvalid = [pct.home, pct.away].some((v) => v !== "" && (!/^\d{1,3}$/.test(v) || Number(v) > 100));
  const pctMut = useAdminMutation(
    () => updateMatch(matchId, { first_team_percentage: Number(pct.home) || 0, second_team_percentage: Number(pct.away) || 0 }),
    { success: "Takım yüzdeleri kaydedildi.", invalidate: [["admin", "matches", "detail", matchId]] }
  );

  /* ───────── yayınla ───────── */
  const publishMut = useAdminMutation(
    () =>
      hasAnyPermission(auth.user, ["matches.publish"])
        ? setMatchStatus(matchId, "yayinlanmis")
        : updateMatch(matchId, { mac_durumu: "yayinlanmis" }),
    { success: "Maç yayınlandı. Puan durumu yeniden hesaplandı.", invalidate: [["admin", "matches"], ["studio"]] }
  );
  const askPublish = async () => {
    const ok = await confirmAction({
      title: "Maçı yayınla",
      message: `${match.first_team_name} ${match.first_team_score ?? 0} – ${match.second_team_score ?? 0} ${match.second_team_name}\n\nSkor kesinleşir, puan durumu yeniden hesaplanır ve üyelere sonuç bildirimi gider.`,
      confirmLabel: "Yayınla",
    });
    if (ok) publishMut.mutate(undefined);
  };

  /* ───────── olay akışı: sonradan ekle / düzelt / sil ───────── */
  const onPitch = useMemo(() => {
    const build = (s: Side) => new Set(squads[s].filter((p) => p.role === "starter").map((p) => p.id));
    return { home: build("home"), away: build("away") };
  }, [squads]);
  const [sheet, setSheet] = useState<{ draft: EventDraft; editing: MatchEvent | null } | null>(null);
  const [actionFor, setActionFor] = useState<MatchEvent | null>(null);
  const [eventSideFilter, setEventSideFilter] = useState<Side>("home");

  /** Olaylar değişince skor olaylardan eşitlenir (elle / hükmen tescilde dokunulmaz). */
  const syncScore = async () => {
    const fresh = await queryClient.fetchQuery({ queryKey: eventsKey, queryFn: () => getEvents(matchId), staleTime: 0 });
    if (manual) return;
    const next = scoreFromEvents(fresh, homeTeamId, awayTeamId);
    if (next.home !== Number(match.first_team_score ?? 0) || next.away !== Number(match.second_team_score ?? 0)) {
      await updateMatch(matchId, { first_team_score: next.home, second_team_score: next.away });
    }
    refreshMatch();
  };

  const openAdd = () => {
    const last = sortedEvents[sortedEvents.length - 1];
    setSheet({
      editing: null,
      draft: {
        side: eventSideFilter,
        code: "GOAL_RIGHT_FOOT",
        playerId: null,
        inPlayerId: null,
        minute: Number(last?.dakika) || 0,
        period: Number(last?.devre) || 1,
        note: "",
      },
    });
  };
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
    const eventBody = draftToBody(draft, teamId, auth.user?.id);
    try {
      if (sheet?.editing) await updateEvent(matchId, sheet.editing.id, eventBody);
      else await createEvent(matchId, { ...eventBody, client_event_id: clientEventId() });
    } catch (error) {
      throw new Error(eventErrorText(error));
    }
    setEventSideFilter(draft.side);
    await syncScore().catch(() => undefined);
  };

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
          throw new Error(eventErrorText(error));
        }
      }
      await syncScore().catch(() => undefined);
    },
    { success: "Olay silindi.", invalidate: [eventsKey] }
  );

  const describeEvent = (ev: MatchEvent) => {
    const code = String(ev.olay_kodu).toUpperCase();
    if (code === "SUBSTITUTION") return `${nameOf(ev.oyuncu_cikan_id)} çıktı · ${nameOf(ev.oyuncu_giren_id)} girdi`;
    return nameOf(ev.oyuncu_id);
  };

  const askRemove = async (ev: MatchEvent) => {
    const ok = await confirmAction({
      title: "Olayı sil",
      message: `${ev.dakika ?? "–"}' ${eventLabel(ev.olay_kodu)} · ${describeEvent(ev)}${manual ? "" : "\n\nSkor olaylardan yeniden hesaplanır."}`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) removeEvent.mutate(ev);
  };

  /* ───────── kontrol listesi (web MatchPostStep) ───────── */
  const checks: { key: string; label: string; done: boolean; meta?: string; tab: Tab }[] = [
    { key: "ratings", label: "Oyuncu puanları", done: allPlayers.length > 0 && filled === allPlayers.length, meta: `${filled}/${allPlayers.length}`, tab: "ratings" },
    { key: "title", label: "Manşet", done: Boolean(content.title.trim()), tab: "content" },
    { key: "report", label: "Maç raporu", done: Boolean(content.report.trim()), tab: "content" },
    { key: "cover", label: "Kapak görseli", done: Boolean(content.coverImage.trim()), tab: "content" },
    { key: "awards", label: "Maçın enleri", done: highlightCount === HIGHLIGHT_FIELDS.length, meta: `${highlightCount}/${HIGHLIGHT_FIELDS.length}`, tab: "awards" },
    { key: "interview", label: "Röportaj linki", done: Boolean(content.interview.trim()), tab: "content" },
  ];
  const checksDone = checks.filter((c) => c.done).length;

  const loading = lineupQuery.isLoading;
  const noSquad = !loading && allPlayers.length === 0;

  /* Sabit kaydet çubuğu: bulunduğun sekmenin kaydı; başka sekmedeysen bekleyen kayıt. */
  const barKind: "ratings" | "content" | null =
    tab === "ratings" ? (canStats ? "ratings" : null) : tab === "awards" || tab === "content" ? (canContent ? "content" : null) : ratingsDirty && canStats ? "ratings" : contentDirty && canContent ? "content" : null;

  return (
    <View style={styles.stack}>
      {!finished ? (
        <Note
          tone="warn"
          text={
            status === "canli"
              ? "Maç canlı. Skor kesinleşince maçı Canlı akıştan bitir ya da aşağıdan yayınla."
              : "Maç henüz tamamlanmadı. Skoru “Sonucu tescil et” ile gir ya da olayları ekleyip maçı yayınla; puan durumu yayınlanınca hesaplanır."
          }
        />
      ) : null}

      {/* Sonuç */}
      <Panel title={finished ? "MAÇ SONUCU" : "ANLIK SKOR"}>
        <View style={styles.summaryRow}>
          <SideSummary name={match.first_team_name} goals={summary.goals.home} cards={summary.cards.home} />
          <View style={styles.summaryScore}>
            <Text style={styles.score} {...textScale.badge}>
              {match.first_team_score ?? 0} – {match.second_team_score ?? 0}
            </Text>
            {manual ? (
              <Text style={styles.source} {...textScale.dense}>
                {resultSourceLabel(match)}
                {match.result_note ? ` · ${match.result_note}` : ""}
              </Text>
            ) : null}
            {summary.subs ? (
              <Text style={styles.subtle} {...textScale.dense}>
                {summary.subs} değişiklik
              </Text>
            ) : null}
          </View>
          <SideSummary name={match.second_team_name} goals={summary.goals.away} cards={summary.cards.away} alignRight />
        </View>
        <View style={styles.actions}>
          {canResult ? (
            <Button
              label={manual ? "Tescili düzenle" : "Sonucu tescil et"}
              icon="ribbon-outline"
              variant={finished ? "secondary" : "primary"}
              onPress={() => setResultOpen(true)}
              style={styles.flex}
              accessibilityHint="Elle skor ya da hükmen sonuç"
            />
          ) : null}
          {!finished && canPublish ? (
            <Button label="Maçı yayınla" icon="checkmark-done-outline" variant="secondary" onPress={askPublish} loading={publishMut.isPending} style={styles.flex} />
          ) : null}
        </View>
        {!finished && onGoStep && status !== "canli" ? (
          <Button label="Canlı akıştan dakika dakika gir" icon="radio-outline" variant="ghost" size="sm" onPress={() => onGoStep("canli")} />
        ) : null}
      </Panel>

      {noSquad ? (
        <View style={styles.stack}>
          <Note
            tone="warn"
            text="Bu maçın kadrosu girilmemiş. Puan, istatistik, maçın enleri ve olaylar kadrodaki oyunculara yazılır; önce iki takımın kadrosunu gir. Skor tescili ve içerik kadro olmadan da girilebilir."
          />
          {onGoStep ? <Button label="Kadroyu gir" icon="people-outline" onPress={() => onGoStep("kadro")} fullWidth /> : null}
        </View>
      ) : null}

      {/* Takım istatistikleri */}
      {sortedEvents.length ? (
        <Panel title="TAKIM İSTATİSTİKLERİ">
          {summary.stats.map((row) => (
            <StatBar key={row.key} label={row.label} home={row.home} away={row.away} tone={row.home + row.away ? "sides" : "neutral"} animate={false} />
          ))}
        </Panel>
      ) : null}

      {/* Kontrol listesi */}
      <Panel title={`KONTROL LİSTESİ · ${checksDone}/${checks.length}`}>
        <View style={styles.checks}>
          {checks.map((item) => (
            <Touchable
              key={item.key}
              onPress={() => setTab(item.tab)}
              haptic="selection"
              style={styles.check}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}${item.meta ? ` ${item.meta}` : ""}, ${item.done ? "tamam" : "eksik"}. Bölüme git`}
            >
              <Ionicons name={item.done ? "checkmark-circle" : "ellipse-outline"} size={18} color={item.done ? colors.win : colors.textTertiary} />
              <Text style={styles.checkText} numberOfLines={1} {...textScale.dense}>
                {item.label}
                {item.meta ? ` ${item.meta}` : ""}
              </Text>
            </Touchable>
          ))}
        </View>
        {anyDirty ? (
          <Text style={styles.source} {...textScale.dense}>
            Kaydedilmemiş değişiklik var{ratingsDirty ? " (puanlar)" : ""}
            {contentDirty ? " (içerik / enler)" : ""}.
          </Text>
        ) : null}
      </Panel>

      <ChipGroup contentPadding={0}>
        {(
          [
            { key: "ratings", label: "Puanlar", icon: "star-outline", dirty: ratingsDirty },
            { key: "awards", label: "Enler", icon: "trophy-outline", dirty: awardsDirty },
            { key: "content", label: "İçerik", icon: "newspaper-outline", dirty: textDirty },
            { key: "stats", label: "İstatistik", icon: "stats-chart-outline", dirty: pctDirty },
            { key: "events", label: "Olaylar", icon: "list-outline", dirty: false },
          ] as { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; dirty: boolean }[]
        ).map((item) => (
          <Chip
            key={item.key}
            label={item.dirty ? `${item.label} •` : item.label}
            icon={item.icon}
            tone="brand"
            selected={tab === item.key}
            onPress={() => setTab(item.key)}
            count={item.key === "events" && sortedEvents.length ? sortedEvents.length : undefined}
          />
        ))}
      </ChipGroup>

      {loading ? (
        <SkeletonListRow count={6} />
      ) : tab === "ratings" ? (
        <View style={styles.stack}>
          <Text style={styles.subtle} {...textScale.dense}>
            {filled} / {allPlayers.length} oyuncuya puan verildi{invalidCount ? ` · ${invalidCount} geçersiz` : ""} · 0–10 arası, ondalık olabilir
          </Text>
          <SidePicker value={ratingSide} onChange={setRatingSide} homeName={homeName} awayName={awayName} />
          {clearedRatings ? <Note text="Kayıtlı bir puan boşaltılarak silinemez; yeni bir değer yazarak değiştir." /> : null}
          {squads[ratingSide].length === 0 ? (
            <Note text="Bu takımın kadrosu boş; puan vermek için önce Kadro adımını tamamla." />
          ) : (
            squads[ratingSide].map((p) => (
              <View key={p.id} style={styles.ratingRow}>
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                    {p.number ? `#${p.number} ` : ""}
                    {p.name}
                  </Text>
                  <Text style={styles.subtle} numberOfLines={1} {...textScale.dense}>
                    {[p.role === "starter" ? "İlk 11" : p.role === "bench" ? "Yedek" : null, p.position].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {canStats ? (
                  <Touchable onPress={() => bumpRating(p.id, -0.5)} haptic="selection" style={styles.bump} accessibilityRole="button" accessibilityLabel={`${p.name} puanını yarım azalt`}>
                    <Ionicons name="remove" size={18} color={colors.textPrimary} />
                  </Touchable>
                ) : null}
                <Input
                  value={ratings[p.id] ?? ""}
                  onChangeText={(t) => setRatings((r) => ({ ...r, [p.id]: t.replace(/[^\d.,]/g, "").slice(0, 4) }))}
                  keyboardType="decimal-pad"
                  placeholder="–"
                  size="sm"
                  error={isRatingInvalid(ratings[p.id]) ? "0–10" : undefined}
                  containerStyle={styles.ratingInput}
                  editable={canStats}
                  accessibilityLabel={`${p.name} puanı`}
                />
                {canStats ? (
                  <Touchable onPress={() => bumpRating(p.id, 0.5)} haptic="selection" style={styles.bump} accessibilityRole="button" accessibilityLabel={`${p.name} puanını yarım artır`}>
                    <Ionicons name="add" size={18} color={colors.textPrimary} />
                  </Touchable>
                ) : null}
              </View>
            ))
          )}
        </View>
      ) : tab === "awards" ? (
        <View style={styles.stack}>
          {noSquad ? <Note text="Ödüller kadrodaki oyunculardan seçilir; önce Kadro adımını tamamla." /> : null}
          {HIGHLIGHT_FIELDS.map(({ key, label }) => {
            const suggestion = suggestions[key];
            return (
              <View key={key} style={styles.award}>
                <SelectField<string>
                  label={label}
                  value={highlights[key] || null}
                  options={playerOptions}
                  icon={key === "best_player" ? "star-outline" : "ribbon-outline"}
                  placeholder="Oyuncu seç"
                  clearable
                  disabled={!canContent}
                  onChange={(v) => setHighlights((h) => ({ ...h, [key]: v ?? "" }))}
                />
                {suggestion && suggestion.id !== highlights[key] && canContent ? (
                  <Chip
                    label={`Öneri: ${nameOf(suggestion.id)} (${suggestion.reason})`}
                    icon="sparkles-outline"
                    size="sm"
                    onPress={() => setHighlights((h) => ({ ...h, [key]: suggestion.id }))}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : tab === "content" ? (
        <View style={styles.stack}>
          <Input label="Manşet" value={content.title} onChangeText={(title) => setContent((c) => ({ ...c, title }))} placeholder="Maçın manşeti" maxLength={255} editable={canContent} />
          <Input
            label="Maç raporu / özet"
            value={content.report}
            onChangeText={(report) => setContent((c) => ({ ...c, report }))}
            placeholder="Maçın hikâyesi, öne çıkan anlar"
            multiline
            numberOfLines={6}
            editable={canContent}
          />
          <View style={styles.cover}>
            {content.coverImage ? <Image source={{ uri: content.coverImage }} style={styles.coverImage} resizeMode="cover" accessibilityLabel="Kapak görseli" /> : null}
            <Input
              label="Kapak görseli adresi"
              value={content.coverImage}
              onChangeText={(coverImage) => setContent((c) => ({ ...c, coverImage }))}
              placeholder="https://…"
              autoCapitalize="none"
              keyboardType="url"
              editable={canContent}
            />
            {canContent ? <Button label="Galeriden yükle" icon="image-outline" variant="secondary" size="sm" onPress={pickCover} loading={uploading} /> : null}
          </View>
          <Input
            label="Canlı yayın / maç videosu"
            value={content.liveLink}
            onChangeText={(liveLink) => setContent((c) => ({ ...c, liveLink }))}
            placeholder="https://youtube.com/…"
            autoCapitalize="none"
            keyboardType="url"
            editable={canContent}
          />
          <Input
            label="Röportaj linki"
            value={content.interview}
            onChangeText={(interview) => setContent((c) => ({ ...c, interview }))}
            placeholder="https://…"
            autoCapitalize="none"
            keyboardType="url"
            editable={canContent}
          />
          <Input
            label="Fotoğraflar linki"
            value={content.photos}
            onChangeText={(photos) => setContent((c) => ({ ...c, photos }))}
            placeholder="https://…"
            autoCapitalize="none"
            keyboardType="url"
            editable={canContent}
          />
        </View>
      ) : tab === "stats" ? (
        <View style={styles.stack}>
          <StatsEditor match={match} squads={squads} />
          <Panel title="TAKIM YÜZDELERİ">
            <Text style={styles.subtle} {...textScale.long}>
              Maç kaydındaki takım yüzdesi alanları (0–100); web “İstatistik Gir” ekranındaki İlk / İkinci Takım Yüzdesi ile aynıdır.
            </Text>
            <View style={styles.actions}>
              <Input
                label={homeName}
                value={pct.home}
                onChangeText={(t) => setPct((v) => ({ ...v, home: t.replace(/\D/g, "").slice(0, 3) }))}
                keyboardType="number-pad"
                placeholder="0"
                containerStyle={styles.flex}
                editable={canContent}
                error={pct.home !== "" && Number(pct.home) > 100 ? "0–100" : undefined}
              />
              <Input
                label={awayName}
                value={pct.away}
                onChangeText={(t) => setPct((v) => ({ ...v, away: t.replace(/\D/g, "").slice(0, 3) }))}
                keyboardType="number-pad"
                placeholder="0"
                containerStyle={styles.flex}
                editable={canContent}
                error={pct.away !== "" && Number(pct.away) > 100 ? "0–100" : undefined}
              />
            </View>
            {canContent ? (
              <Button label="Yüzdeleri kaydet" icon="save-outline" variant="secondary" onPress={() => pctMut.mutate(undefined)} loading={pctMut.isPending} disabled={!pctDirty || pctInvalid} />
            ) : null}
          </Panel>
        </View>
      ) : (
        <View style={styles.stack}>
          <Text style={styles.subtle} {...textScale.long}>
            {manual
              ? "Skor elle / hükmen tescilli: olaylar istatistik ve golcü listesi için yazılır, skoru değiştirmez."
              : "Gol olayı ekleyip sildikçe skor olaylardan yeniden hesaplanır."}
          </Text>
          {canEvents ? (
            <Button label="Olay ekle" icon="add-circle-outline" onPress={openAdd} disabled={noSquad} fullWidth />
          ) : (
            <Note text="Olay eklemek ve düzeltmek için hesabında canlı akış yetkisi olmalı." />
          )}
          {eventsQuery.isLoading ? (
            <SkeletonListRow count={4} />
          ) : eventsQuery.isError ? (
            <Note tone="danger" text={errorText(eventsQuery.error)} />
          ) : sortedEvents.length === 0 ? (
            <EmptyState
              icon="list-outline"
              title="Bu maç için olay girilmemiş"
              body={noSquad ? "Olaylar kadrodaki oyunculara yazılır; önce kadroyu gir." : "Gol, asist, kart, değişiklik ve kurtarışları buradan ekleyebilirsin."}
              variant="inline"
              compact
            />
          ) : (
            <View style={styles.timeline}>
              {sortedEvents.map((ev) => {
                const code = String(ev.olay_kodu).toUpperCase();
                const s = eventSide(ev, homeTeamId, awayTeamId);
                return (
                  <Touchable
                    key={ev.id}
                    onPress={canEvents ? () => setActionFor(ev) : undefined}
                    style={styles.event}
                    accessibilityRole="button"
                    accessibilityLabel={`${ev.dakika ?? "–"}. dakika ${eventLabel(code)}, ${describeEvent(ev)}. Düzenle ya da sil`}
                  >
                    <Text style={styles.minute} {...textScale.badge}>
                      {ev.dakika != null ? `${ev.dakika}'` : "–"}
                    </Text>
                    <View style={[styles.dot, { backgroundColor: eventColor(code) }]} />
                    <View style={styles.flex}>
                      <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                        {eventLabel(code)}
                      </Text>
                      <Text style={styles.subtle} numberOfLines={1} {...textScale.dense}>
                        {describeEvent(ev)} · {s === "home" ? homeName : s === "away" ? awayName : "Takım yok"}
                        {Number(ev.devre) > 1 ? ` · ${Number(ev.devre) === 2 ? "2. yarı" : "Uzatma"}` : ""}
                      </Text>
                    </View>
                    {canEvents ? <Ionicons name="ellipsis-horizontal" size={18} color={colors.textTertiary} /> : null}
                  </Touchable>
                );
              })}
            </View>
          )}
        </View>
      )}

      <StepSaveBar
        visible={barKind != null}
        label={barKind === "ratings" ? "Puanları kaydet" : tab === "awards" ? "Enleri kaydet" : "İçeriği kaydet"}
        note={
          barKind === "ratings"
            ? ratingsDirty
              ? `${changedRatings.length} puan kaydedilmedi${invalidCount ? ` · ${invalidCount} geçersiz` : ""}`
              : undefined
            : contentDirty
              ? "İçerik ve enler birlikte kaydedilir"
              : undefined
        }
        onPress={() => (barKind === "ratings" ? ratingMut.mutate(undefined) : contentMut.mutate(undefined))}
        loading={barKind === "ratings" ? ratingMut.isPending : contentMut.isPending}
        disabled={barKind === "ratings" ? !ratingsDirty || invalidCount > 0 : !contentDirty}
      />

      <ResultSheet visible={resultOpen} onClose={() => setResultOpen(false)} match={match} onSaved={refreshMatch} />

      <EventSheet
        visible={sheet != null}
        onClose={() => setSheet(null)}
        initial={sheet?.draft ?? { side: "home", code: "GOAL_RIGHT_FOOT", playerId: null, inPlayerId: null, minute: 0, period: 1, note: "" }}
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
    </View>
  );
}

function SideSummary({
  name,
  goals,
  cards,
  alignRight,
}: {
  name: string;
  goals: { name: string; minute: number | null; own: boolean }[];
  cards: { name: string; minute: number | null; red: boolean }[];
  alignRight?: boolean;
}) {
  const align = alignRight ? styles.right : null;
  return (
    <View style={styles.flex}>
      <Text style={[styles.name, align]} numberOfLines={2} {...textScale.dense}>
        {name}
      </Text>
      {goals.map((g, i) => (
        <Text key={`g${i}`} style={[styles.line, align]} numberOfLines={1} {...textScale.dense}>
          {g.name}
          {g.own ? " (k.k.)" : ""} {g.minute != null ? `${g.minute}'` : ""}
        </Text>
      ))}
      {cards.map((c, i) => (
        <Text key={`c${i}`} style={[styles.line, align, { color: c.red ? colors.danger : colors.warn }]} numberOfLines={1} {...textScale.dense}>
          {c.red ? "Kırmızı" : "Sarı"} · {c.name} {c.minute != null ? `${c.minute}'` : ""}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  flex: { flex: 1 },
  right: { textAlign: "right" },
  summaryRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  summaryScore: { alignItems: "center", gap: space.xxs, minWidth: 80 },
  score: { ...type.scoreMd, color: colors.textPrimary },
  source: { ...type.caption, color: colors.warn, textAlign: "center" },
  subtle: { ...type.caption, color: colors.textTertiary },
  name: { ...type.label, color: colors.textPrimary },
  line: { ...type.caption, color: colors.textSecondary },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  ratingInput: { width: 68 },
  bump: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  actions: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  checks: { flexDirection: "row", flexWrap: "wrap" },
  check: { flexBasis: "50%", flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 44, paddingRight: space.sm },
  checkText: { ...type.label, color: colors.textPrimary, flex: 1 },
  timeline: { gap: space.xs },
  event: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  minute: { ...type.tableNumStrong, color: colors.textPrimary, width: 36 },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  award: { gap: space.xs },
  cover: { gap: space.sm },
  coverImage: { width: "100%", aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.surface2 },
});
