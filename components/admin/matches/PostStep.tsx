/**
 * 4. ADIM — MAÇ SONU (web MatchPostStep + matchContent + Enter_Stats).
 *
 * Bölümler:
 *   · Özet       — skor, golcüler, kartlar, değişiklik sayısı
 *   · Puanlar    — kadrodaki her oyuncuya 0–10 puan (PATCH /kadro/puan)
 *   · Enler      — Maçın Oyuncusu (maçın adamı), mevki ödülleri, maçın golü /
 *                  kurtarışı; puan ve gollerden öneri çıkar
 *   · İçerik     — manşet, rapor, kapak görseli, canlı yayın, röportaj, foto
 *   · İstatistik — oyuncu başına maç istatistiği (Enter_Stats)
 *
 * "Maçı yayınla" maç henüz tamamlanmadıysa görünür; skor kesinleşir ve puan
 * durumu yeniden hesaplanır (onaylı).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";

import { Panel, SelectField, confirmAction, useAdminMutation, type Option } from "@/components/admin";
import { Button, Chip, Input, SegmentedControl, SkeletonListRow } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import {
  HIGHLIGHT_FIELDS,
  buildPostPayload,
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
  setMatchStatus,
  sortEvents,
  updateMatch,
  uploadMatchCover,
  type AdminMatch,
  type HighlightKey,
  type PostContent,
} from "@/lib/api/admin/matches";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { eventSide, toSquad, type Side, type SquadPlayer } from "./model";
import { Note, SidePicker } from "./parts";
import { StatsEditor } from "./StatsEditor";

type Tab = "ratings" | "awards" | "content" | "stats";

const POSITION_WORDS: Partial<Record<HighlightKey, string[]>> = {
  best_goalkeeper: ["kaleci", "goalkeeper", "gk"],
  best_defender: ["defans", "defender", "stoper", "bek"],
  best_midfielder: ["orta saha", "ortasaha", "midfielder", "orta"],
  best_forward: ["forvet", "forward", "santrafor", "kanat"],
};

export function PostStep({ match }: { match: AdminMatch }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const matchId = Number(match.id);
  const homeTeamId = Number(match.home_team_id) || null;
  const awayTeamId = Number(match.away_team_id) || null;
  const canStats = hasAnyPermission(auth.user, ["matches.stats"]);
  const canContent = hasAnyPermission(auth.user, ["matches.update"]);
  const canPublish = hasAnyPermission(auth.user, ["matches.publish", "matches.update"]);
  const finished = normalizeMatchStatus(match.mac_durumu) === "yayinlanmis";

  const lineupQuery = useQuery({ queryKey: ["admin", "matches", "lineup", matchId], queryFn: () => getLineup(matchId) });
  const eventsQuery = useQuery({ queryKey: ["admin", "matches", "events", matchId], queryFn: () => getEvents(matchId) });

  const squads = useMemo<Record<Side, SquadPlayer[]>>(
    () => ({ home: toSquad(lineupQuery.data?.home), away: toSquad(lineupQuery.data?.away) }),
    [lineupQuery.data]
  );
  const allPlayers = useMemo(() => [...squads.home, ...squads.away], [squads]);
  const nameOf = (id: unknown) => allPlayers.find((p) => p.id === String(id))?.name ?? (id ? `Oyuncu #${id}` : "—");

  const [tab, setTab] = useState<Tab>("ratings");

  /* ───────── özet ───────── */
  const summary = useMemo(() => {
    const goals: Record<Side, { name: string; minute: number | null; own: boolean }[]> = { home: [], away: [] };
    const cards: Record<Side, { name: string; minute: number | null; red: boolean }[]> = { home: [], away: [] };
    let subs = 0;
    for (const ev of [...(eventsQuery.data ?? [])].sort(sortEvents)) {
      const code = String(ev.olay_kodu).toUpperCase();
      const s = eventSide(ev, homeTeamId, awayTeamId);
      if (!s) continue;
      if (code.startsWith("GOAL_")) {
        const own = code === "GOAL_OWN";
        goals[own ? (s === "home" ? "away" : "home") : s].push({ name: nameOf(ev.oyuncu_id), minute: ev.dakika, own });
      } else if (code === "YELLOW_CARD" || code === "RED_CARD") {
        cards[s].push({ name: nameOf(ev.oyuncu_id), minute: ev.dakika, red: code === "RED_CARD" });
      } else if (code === "SUBSTITUTION") subs += 1;
    }
    return { goals, cards, subs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsQuery.data, allPlayers, homeTeamId, awayTeamId]);

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
  useEffect(() => setRatings(savedRatings), [savedRatings]);
  const ratingsDirty = allPlayers.some((p) => (ratings[p.id] ?? "") !== (savedRatings[p.id] ?? ""));
  const invalidCount = allPlayers.filter((p) => isRatingInvalid(ratings[p.id])).length;
  const filled = allPlayers.filter((p) => ratings[p.id] && !isRatingInvalid(ratings[p.id])).length;

  const ratingMut = useAdminMutation(
    () =>
      saveRatings(
        matchId,
        allPlayers.map((p) => ({ playerId: Number(p.id), oyuncu_id: Number(p.id), puan: normalizeRating(ratings[p.id]) }))
      ),
    { success: "Oyuncu puanları kaydedildi.", invalidate: [["admin", "matches", "lineup", matchId]] }
  );

  /* ───────── içerik + enler ───────── */
  const savedContent = useMemo(() => readPostContent(match), [match]);
  const savedHighlights = useMemo(() => readHighlights(match, allPlayers), [match, allPlayers]);
  const [content, setContent] = useState<PostContent>(savedContent);
  const [highlights, setHighlights] = useState<Record<string, string>>(savedHighlights);
  useEffect(() => setContent(savedContent), [savedContent]);
  useEffect(() => setHighlights(savedHighlights), [savedHighlights]);
  const contentDirty =
    JSON.stringify(content) !== JSON.stringify(savedContent) ||
    HIGHLIGHT_FIELDS.some(({ key }) => (highlights[key] || "") !== (savedHighlights[key] || ""));

  const contentMut = useAdminMutation(() => updateMatch(matchId, buildPostPayload(content, highlights, nameOf)), {
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

  /* ───────── yayınla ───────── */
  const publishMut = useAdminMutation(
    () =>
      hasAnyPermission(auth.user, ["matches.publish"])
        ? setMatchStatus(matchId, "yayinlanmis")
        : updateMatch(matchId, { mac_durumu: "yayinlanmis" }),
    { success: "Maç yayınlandı. Puan durumu yeniden hesaplandı.", invalidate: [["admin", "matches"]] }
  );
  const askPublish = async () => {
    const ok = await confirmAction({
      title: "Maçı yayınla",
      message: `${match.first_team_name} ${match.first_team_score ?? 0} – ${match.second_team_score ?? 0} ${match.second_team_name}\n\nSkor kesinleşir, puan durumu yeniden hesaplanır ve üyelere sonuç bildirimi gider.`,
      confirmLabel: "Yayınla",
    });
    if (ok) publishMut.mutate(undefined);
  };

  const loading = lineupQuery.isLoading;

  return (
    <View style={styles.stack}>
      {!finished ? <Note tone="warn" text="Maç henüz tamamlanmadı. Skorun tescili için maçı Canlı akıştan bitir ya da aşağıdan yayınla." /> : null}

      {/* Özet */}
      <Panel title="MAÇ ÖZETİ">
        <View style={styles.summaryRow}>
          <SideSummary name={match.first_team_name} goals={summary.goals.home} cards={summary.cards.home} />
          <View style={styles.summaryScore}>
            <Text style={styles.score} {...textScale.badge}>
              {match.first_team_score ?? 0} – {match.second_team_score ?? 0}
            </Text>
            {isManualResult(match) ? (
              <Text style={styles.source} {...textScale.dense}>
                {resultSourceLabel(match)}
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
      </Panel>

      {!finished && canPublish ? (
        <Button label="Maçı yayınla (tamamla)" icon="checkmark-done-outline" onPress={askPublish} loading={publishMut.isPending} fullWidth />
      ) : null}

      <SegmentedControl<Tab>
        items={[
          { key: "ratings", label: "Puanlar", dot: ratingsDirty },
          { key: "awards", label: "Enler", dot: contentDirty },
          { key: "content", label: "İçerik", dot: contentDirty },
          { key: "stats", label: "İstatistik" },
        ]}
        value={tab}
        onChange={setTab}
        stretch
        size="sm"
      />

      {loading ? (
        <SkeletonListRow count={6} />
      ) : tab === "ratings" ? (
        <View style={styles.stack}>
          <Text style={styles.subtle} {...textScale.dense}>
            {filled} / {allPlayers.length} oyuncuya puan verildi{invalidCount ? ` · ${invalidCount} geçersiz` : ""} · 0–10 arası, ondalık olabilir
          </Text>
          <SidePicker value={ratingSide} onChange={setRatingSide} homeName={match.first_team_name || "Ev sahibi"} awayName={match.second_team_name || "Deplasman"} />
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
              </View>
            ))
          )}
          {canStats ? (
            <Button
              label="Puanları kaydet"
              icon="save-outline"
              onPress={() => ratingMut.mutate(undefined)}
              loading={ratingMut.isPending}
              disabled={!ratingsDirty || invalidCount > 0 || allPlayers.length === 0}
              fullWidth
              haptic="success"
            />
          ) : null}
        </View>
      ) : tab === "awards" ? (
        <View style={styles.stack}>
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
          {canContent ? (
            <Button label="Enleri kaydet" icon="save-outline" onPress={() => contentMut.mutate(undefined)} loading={contentMut.isPending} disabled={!contentDirty} fullWidth haptic="success" />
          ) : null}
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
          {canContent ? (
            <Button label="İçeriği kaydet" icon="save-outline" onPress={() => contentMut.mutate(undefined)} loading={contentMut.isPending} disabled={!contentDirty} fullWidth haptic="success" />
          ) : null}
        </View>
      ) : (
        <StatsEditor match={match} squads={squads} />
      )}
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
  ratingInput: { width: 76 },
  award: { gap: space.xs },
  cover: { gap: space.sm },
  coverImage: { width: "100%", aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.surface2 },
});
