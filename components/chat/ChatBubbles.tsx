/**
 * SOHBET KARTLARI — maç teklifi, yoklama, bildirim kartı, arama kaydı ve
 * sistem satırı. Metin, fotoğraf, belge, sesli mesaj ve konum balonları
 * MessageBubble.tsx'tedir. Üye ve yönetim sohbet ekranları ortak kullanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { memo, useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Touchable, withAlpha } from "@/components/chat/kit";
import { Touchable as AppTouchable } from "@/components/ui";
import { formatDurationMs, type ChatAction, type ChatMessage } from "@/lib/api/chat";
import type { AttendancePlayer } from "@/lib/api/team";
import { chatPalette, colors } from "@/lib/chatPalette";
import { colors as app, glowStyle, hairline, radius, space, textScale, type } from "@/theme";

export function clockLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  penalty: "shield",
  transfer: "swap-horizontal",
  contract: "document-text",
  invite: "people",
  match_request: "calendar",
  account: "person-circle",
  award: "star",
  general: "notifications",
};

/* ---------- ses oynatıcı ---------- */

/**
 * `chat`: sohbet balonu / arama hapı içinde — WhatsApp renkleri. Verilmezse
 * UYGULAMA temasıyla çizilir: bu satırı mesajlar bölümü dışındaki ekranlar da
 * kullanır (Yönetim ▸ Arama kayıtları) ve onlar mor kimliklerini korur.
 */
export const AudioPlayerRow = memo(function AudioPlayerRow({ url, durationMs, onDark, chat = false }: { url: string | null | undefined; durationMs?: number | null; onDark?: boolean; chat?: boolean }) {
  const player = useAudioPlayer(url ? { uri: url } : null);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const total = status.duration > 0 ? status.duration * 1000 : durationMs ?? 0;
  const progress = total > 0 ? Math.min(1, (status.currentTime * 1000) / total) : 0;
  const toggle = useCallback(() => {
    if (!url) return;
    if (playing) player.pause();
    else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) void player.seekTo(0);
      player.play();
    }
  }, [player, playing, status.currentTime, status.didJustFinish, status.duration, url]);
  const Press = chat ? Touchable : AppTouchable;
  const tone = chat
    ? { fg: chatPalette.voiceMic, track: chatPalette.waveIdle, fill: chatPalette.waveActive, button: "transparent", glyph: chatPalette.voicePlayTheirs, glyphSize: 26, time: chatPalette.dayText }
    : onDark
      ? { fg: app.textOnBrand, track: withAlpha(app.textOnBrand, 0.28), fill: app.textOnBrand, button: withAlpha(app.textOnBrand, 0.2), glyph: app.textOnBrand, glyphSize: 16, time: withAlpha(app.textOnBrand, 0.8) }
      : { fg: app.textPrimary, track: app.surface3, fill: app.brand, button: app.brandDim, glyph: app.brand, glyphSize: 16, time: app.textSecondary };
  return (
    <View style={styles.audioRow}>
      <Press feedback="icon" haptic="light" onPress={toggle} accessibilityRole="button" accessibilityLabel={playing ? "Duraklat" : "Oynat"} style={[styles.playButton, { backgroundColor: tone.button }]}>
        <Ionicons name={playing ? "pause" : "play"} size={tone.glyphSize} color={tone.glyph} />
      </Press>
      <View style={styles.audioBody}>
        <View style={[styles.track, { backgroundColor: tone.track }]}>
          <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: tone.fill }]} />
        </View>
        <Text style={[styles.audioTime, { color: tone.time }]} {...textScale.badge}>
          {playing || status.currentTime > 0 ? `${formatDurationMs(status.currentTime * 1000)} / ` : ""}
          {formatDurationMs(total)}
        </Text>
      </View>
      <Ionicons name="mic" size={14} color={tone.fg} />
    </View>
  );
});

/* ---------- maç teklifi ---------- */

const OFFER_LABEL = { pending: "Yanıt bekleniyor", accepted: "Kabul edildi", rejected: "Reddedildi" } as const;

export const MatchOfferBubble = memo(function MatchOfferBubble({
  message,
  canRespond,
  busy,
  onRespond,
}: {
  message: ChatMessage;
  canRespond: boolean;
  busy: boolean;
  onRespond: (message: ChatMessage, response: "accepted" | "rejected") => void;
}) {
  const mine = message.sender.is_me;
  const offer = message.meta?.match_offer;
  const status = offer?.status ?? "pending";
  const date = offer?.date ? new Date(`${offer.date}T${offer.time || "00:00"}:00`) : null;
  const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }) : offer?.date;
  const statusColor = status === "accepted" ? colors.win : status === "rejected" ? colors.danger : colors.warn;
  return (
    <View style={[styles.bubble, styles.card, mine ? styles.bubbleMine : styles.bubbleTheirs, { borderLeftColor: statusColor }]}>
      <View style={styles.cardHead}>
        <Ionicons name="football" size={16} color={mine ? chatPalette.bubbleAccentMine : chatPalette.bubbleAccentTheirs} />
        <Text style={[styles.cardTitle, mine ? styles.textMine : null]} {...textScale.dense}>Maç Teklifi</Text>
        <View style={[styles.statusPill, { backgroundColor: withAlpha(statusColor, 0.16) }]}>
          <Text style={[styles.statusText, { color: mine ? chatPalette.bubbleText : statusColor }]} {...textScale.badge}>{OFFER_LABEL[status]}</Text>
        </View>
      </View>
      <View style={[styles.teams, { backgroundColor: mine ? chatPalette.insetMine : chatPalette.insetTheirs }]}>
        <Text style={[styles.teamName, mine ? styles.textMine : null]} numberOfLines={1} {...textScale.dense}>{offer?.home_team_name ?? message.sender.name ?? "Takım"}</Text>
        <Text style={[styles.vs, mine ? styles.subMine : null]} {...textScale.badge}>vs</Text>
        <Text style={[styles.teamName, mine ? styles.textMine : null]} numberOfLines={1} {...textScale.dense}>{offer?.opponent_team_name ?? "Rakip"}</Text>
      </View>
      <Fact icon="calendar-outline" text={`${dateLabel ?? ""} · ${offer?.time ?? ""}`} mine={mine} />
      {offer?.venue_name ? <Fact icon="location-outline" text={[offer.venue_name, offer.venue_address].filter(Boolean).join(" · ")} mine={mine} /> : null}
      {offer?.note ? <Fact icon="chatbubble-outline" text={offer.note} mine={mine} /> : null}
      {status !== "pending" && offer?.responded_by_name ? <Fact icon="person-outline" text={`${offer.responded_by_name}${offer.response_note ? `: ${offer.response_note}` : ""}`} mine={mine} /> : null}
      {status === "pending" && canRespond ? (
        <View style={styles.actions}>
          <Button label="Kabul et" size="sm" icon="checkmark" onPress={() => onRespond(message, "accepted")} disabled={busy} loading={busy} />
          <Button label="Reddet" size="sm" variant="danger" icon="close" onPress={() => onRespond(message, "rejected")} disabled={busy} />
        </View>
      ) : null}
      <Text style={[styles.stamp, mine ? styles.stampMine : null]} {...textScale.badge}>{clockLabel(message.created_at)}</Text>
    </View>
  );
});

/* ---------- maç yoklaması kartı ---------- */

const ATT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { coming: "checkmark-circle", not_coming: "close-circle", maybe: "help-circle" };

const ATT_LINES: ReadonlyArray<readonly [string, string]> = [["FWD", "Forvet"], ["MID", "Orta saha"], ["DEF", "Defans"], ["GK", "Kaleci"]];

function AttendanceChip({ p, mine, isMe, canEdit, busy, onRemove }: { p: AttendancePlayer; mine: boolean; isMe: boolean; canEdit: boolean; busy: boolean; onRemove?: (p: AttendancePlayer) => void }) {
  const color = p.status === "coming" ? colors.win : p.status === "not_coming" ? colors.danger : p.status === "maybe" ? colors.warn : colors.textTertiary;
  return (
    <View style={[styles.attChip, { backgroundColor: mine ? chatPalette.insetMine : chatPalette.insetTheirs, borderColor: isMe ? colors.brand : withAlpha(color, 0.5) }]}>
      <Ionicons name={ATT_ICON[p.status ?? ""] ?? "time-outline"} size={13} color={color} />
      <View style={styles.attChipBody}>
        <Text style={[styles.attName, mine ? styles.textMine : null]} numberOfLines={1} {...textScale.dense}>{p.jersey ? `${p.jersey} · ` : ""}{p.name}{p.captain ? " (C)" : ""}</Text>
        <Text style={[styles.attStatus, mine ? styles.subMine : null]} {...textScale.badge}>{p.status_label}</Text>
      </View>
      {canEdit && onRemove ? (
        <Touchable feedback="icon" haptic="selection" onPress={() => onRemove(p)} disabled={busy} accessibilityLabel={`${p.name} kadrodan çıkar`} style={styles.attRemove}>
          <Ionicons name="close" size={14} color={colors.danger} />
        </Touchable>
      ) : null}
    </View>
  );
}

/* Maç yoklaması kartı: saha dizilişi (AS oyuncular hatlarıyla), yedekler ve
   kadro dışı. Yoklamayı kuran yönetici karttan oyuncu çıkarır / ekler; sunucu
   maç kadrosu planını da eşitler. */
export const AttendanceCard = memo(function AttendanceCard({
  message,
  viewerPlayerId,
  viewerUserId,
  busy,
  onRespond,
  onRemove,
  onAdd,
}: {
  message: ChatMessage;
  viewerPlayerId: number | null | undefined;
  viewerUserId?: number | null;
  busy: boolean;
  onRespond: (message: ChatMessage, status: "coming" | "not_coming" | "maybe") => void;
  onRemove?: (message: ChatMessage, player: AttendancePlayer) => void;
  onAdd?: (message: ChatMessage) => void;
}) {
  const mine = message.sender.is_me;
  const att = message.meta?.attendance;
  const players = att?.players ?? [];
  const me = players.find((p) => p.player_id === Number(viewerPlayerId));
  const canAnswer = Boolean(me) && !att?.reported_at;
  const canEdit = Boolean(onRemove) && att?.manager_user_id != null && Number(att.manager_user_id) === Number(viewerUserId) && !att?.reported_at;
  const counts = att?.counts ?? { coming: 0, not_coming: 0, maybe: 0, unanswered: 0 };
  const starters = players.filter((p) => p.role === "starter");
  const bench = players.filter((p) => p.role === "bench");
  const others = players.filter((p) => !p.role);
  const lines = ATT_LINES.map(([key, label]) => ({ key, label, list: starters.filter((p) => (p.line ?? "MID") === key) })).filter((line) => line.list.length);
  const chip = (p: AttendancePlayer) => <AttendanceChip key={p.player_id} p={p} mine={mine} isMe={p.player_id === Number(viewerPlayerId)} canEdit={canEdit} busy={busy} onRemove={onRemove ? (target) => onRemove(message, target) : undefined} />;
  return (
    <View style={[styles.bubble, styles.card, mine ? styles.bubbleMine : styles.bubbleTheirs, { borderLeftColor: colors.warn }]}>
      <View style={styles.cardHead}>
        <Ionicons name="clipboard-outline" size={16} color={mine ? chatPalette.bubbleAccentMine : chatPalette.bubbleAccentTheirs} />
        <Text style={[styles.cardTitle, mine ? styles.textMine : null]} {...textScale.dense}>Maç Yoklaması</Text>
        <View style={[styles.statusPill, { backgroundColor: withAlpha(colors.win, 0.16) }]}>
          <Text style={[styles.statusText, { color: mine ? chatPalette.bubbleText : colors.win }]} {...textScale.badge}>{counts.coming} geliyor · {counts.unanswered} bekliyor</Text>
        </View>
      </View>
      <Fact icon="football-outline" text={`${att?.is_home === false ? "Deplasman" : "Ev sahibi"} · ${att?.opponent ?? "Rakip"} · ${att?.when ?? ""}${att?.formation ? ` · ${att.formation}` : ""}`} mine={mine} />
      {att?.venue ? <Fact icon="location-outline" text={att.venue} mine={mine} /> : null}
      {lines.length ? (
        <View style={styles.attPitch}>
          {lines.map((line) => (
            <View key={line.key} style={styles.attLine}>
              <Text style={styles.attLineLabel} {...textScale.badge}>{line.label}</Text>
              <View style={styles.attRow}>{line.list.map(chip)}</View>
            </View>
          ))}
        </View>
      ) : null}
      {bench.length ? (
        <View style={styles.attGroup}>
          <Text style={[styles.attGroupLabel, mine ? styles.subMine : null]} {...textScale.badge}>Yedekler</Text>
          <View style={styles.attRow}>{bench.map(chip)}</View>
        </View>
      ) : null}
      {others.length ? (
        <View style={styles.attGroup}>
          <Text style={[styles.attGroupLabel, mine ? styles.subMine : null]} {...textScale.badge}>{lines.length || bench.length ? "Kadro dışı" : "Yoklama listesi"}</Text>
          <View style={styles.attRow}>{others.map(chip)}</View>
        </View>
      ) : null}
      {canAnswer ? (
        <View style={styles.actions}>
          <Button label="Geliyorum" size="sm" icon="checkmark" variant={me?.status === "coming" ? "primary" : "secondary"} onPress={() => onRespond(message, "coming")} disabled={busy} loading={busy} />
          <Button label="Gelemiyorum" size="sm" icon="close" variant={me?.status === "not_coming" ? "danger" : "secondary"} onPress={() => onRespond(message, "not_coming")} disabled={busy} />
        </View>
      ) : null}
      {canEdit && onAdd ? (
        <View style={styles.actions}>
          <Button label="Oyuncu ekle" size="sm" icon="person-add-outline" variant="secondary" onPress={() => onAdd(message)} disabled={busy} />
        </View>
      ) : null}
      {att?.reported_at ? <Fact icon="checkmark-done-outline" text="Kadro son şekliyle yönetime bildirildi." mine={mine} /> : null}
      <Text style={[styles.stamp, mine ? styles.stampMine : null]} {...textScale.badge}>{clockLabel(message.created_at)}</Text>
    </View>
  );
});

function Fact({ icon, text, mine }: { icon: keyof typeof Ionicons.glyphMap; text: string; mine: boolean }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={13} color={chatPalette.bubbleMeta} />
      <Text style={[styles.factText, mine ? styles.subMine : null]} {...textScale.long}>{text}</Text>
    </View>
  );
}

/* ---------- bildirim kartı ---------- */

export const NotificationCard = memo(function NotificationCard({
  message,
  busyKey,
  onAction,
}: {
  message: ChatMessage;
  busyKey: string | null;
  onAction: (action: ChatAction, message: ChatMessage) => void;
}) {
  const meta = message.meta ?? {};
  const lines = String(message.body ?? "").split("\n");
  const title = meta.notification?.title ?? lines[0];
  const rest = lines.slice(1).join("\n").trim();
  const category = meta.notification?.category ?? "general";
  const resolved = meta.resolved ?? null;
  const actions = resolved ? [] : (meta.actions ?? []).filter((action) => action && (action.mobile || action.api));
  return (
    <View style={[styles.bubble, styles.bubbleTheirs, styles.card, { borderLeftColor: colors.brand }]}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}><Ionicons name={CATEGORY_ICON[category] ?? CATEGORY_ICON.general} size={16} color={colors.brandAccent} /></View>
        <Text style={styles.cardTitle} {...textScale.long}>{title}</Text>
      </View>
      {rest ? <Text style={styles.bodyText} {...textScale.long}>{rest}</Text> : null}
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((action, index) => (
            <Button
              key={action.key ?? `${index}`}
              label={action.label}
              size="sm"
              variant={action.style === "danger" ? "danger" : action.style === "primary" || index === 0 ? "primary" : "secondary"}
              onPress={() => onAction(action, message)}
              loading={busyKey === action.key}
              disabled={Boolean(busyKey)}
            />
          ))}
        </View>
      ) : null}
      {resolved ? (
        <View style={styles.resolved}>
          <Ionicons name="checkmark-circle" size={14} color={colors.win} />
          <Text style={styles.resolvedText} {...textScale.dense}>{resolved.label ?? "İşlem tamamlandı"}</Text>
        </View>
      ) : null}
      <Text style={styles.stamp} {...textScale.badge}>{clockLabel(message.created_at)}</Text>
    </View>
  );
});

/* ---------- arama çipi ---------- */

export const CallChip = memo(function CallChip({ message }: { message: ChatMessage }) {
  const call = message.meta?.call;
  const ok = call?.status === "ended";
  return (
    <View style={styles.chipRow}>
      <View style={[styles.chip, call?.recording_url ? styles.chipWide : null]}>
        <View style={styles.chipLine}>
          <Ionicons name={ok ? "call" : "call-outline"} size={13} color={ok ? colors.win : colors.danger} />
          <Text style={[styles.chipText, ok ? null : styles.chipDanger]} {...textScale.dense}>{message.body ?? "Sesli arama"}</Text>
          <Text style={styles.chipTime} {...textScale.badge}>{clockLabel(message.created_at)}</Text>
        </View>
        {call?.recording_url ? <AudioPlayerRow url={call.recording_url} durationMs={call.recording_duration_ms} chat /> : null}
      </View>
    </View>
  );
});

export const SystemChip = memo(function SystemChip({ text, icon }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.chipRow}>
      <View style={styles.chip}>
        <View style={styles.chipLine}>
          {icon ? <Ionicons name={icon} size={12} color={chatPalette.dayText} /> : null}
          <Text style={styles.chipText} {...textScale.dense}>{text}</Text>
        </View>
      </View>
    </View>
  );
});

const PLAY = 34;

const styles = StyleSheet.create({
  attPitch: { gap: space.xs, marginTop: space.xs, padding: space.sm, borderRadius: radius.sm, backgroundColor: colors.win },
  attLine: { gap: space.xxs },
  attLineLabel: { ...type.caption, color: colors.textOnBrand },
  attGroup: { gap: space.xxs, marginTop: space.xs },
  attGroupLabel: { ...type.caption, color: chatPalette.bubbleMeta },
  attRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  attChip: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm, borderWidth: 1, minWidth: 120, maxWidth: "100%" },
  attChipBody: { flexShrink: 1 },
  attName: { ...type.bodySm, color: chatPalette.bubbleText },
  attStatus: { ...type.caption, color: chatPalette.bubbleMeta },
  attRemove: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },

  /* Kartlar balon renklerinde durur: giden açık yeşil (koyuda koyu yeşil), gelen
     beyaz (koyuda gri); metin her ikisinde balon metni rengidir. */
  /* Gece dili: 20 px köşe; giden kart mor + hafif parıltı, gelen kart yüzey + ışıklı kenar. */
  bubble: { maxWidth: "86%", borderRadius: radius.xl, padding: space.md, gap: space.s },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: chatPalette.bubbleMine, ...glowStyle(colors.glow, 1), shadowOpacity: 0.18 },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: chatPalette.bubbleTheirs, borderWidth: hairline, borderColor: chatPalette.bubbleLine },
  stamp: { ...type.meta, color: chatPalette.bubbleMeta, alignSelf: "flex-end", marginTop: space.xxs },
  stampMine: { color: chatPalette.bubbleMeta },
  textMine: { color: chatPalette.bubbleText },
  subMine: { color: chatPalette.bubbleMeta },

  audioRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minWidth: 220 },
  playButton: { width: PLAY, height: PLAY, borderRadius: PLAY / 2, alignItems: "center", justifyContent: "center" },
  audioBody: { flex: 1, gap: space.xs },
  track: { height: 4, borderRadius: radius.xs, overflow: "hidden" },
  trackFill: { height: 4, borderRadius: radius.xs },
  audioTime: { ...type.micro },

  card: { maxWidth: "92%", borderLeftWidth: 3, gap: space.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cardIcon: { width: 30, height: 30, borderRadius: radius.sm, backgroundColor: colors.brandDim, alignItems: "center", justifyContent: "center" },
  cardTitle: { ...type.h4, color: chatPalette.bubbleText, flex: 1 },
  bodyText: { ...type.body, color: chatPalette.bubbleText },
  statusPill: { paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill },
  statusText: { ...type.micro },
  teams: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: hairline, borderColor: chatPalette.bubbleLine },
  teamName: { ...type.h4, color: chatPalette.bubbleText, flexShrink: 1 },
  vs: { ...type.micro, color: chatPalette.bubbleMeta },
  fact: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
  factText: { ...type.bodySm, color: chatPalette.bubbleMeta, flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
  resolved: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs },
  resolvedText: { ...type.label, color: colors.win },

  /* Sistem / arama satırı: ortalanmış WhatsApp hapı (gün hapıyla aynı yüzey). */
  chipRow: { alignItems: "center", paddingVertical: space.s },
  chip: { maxWidth: "88%", paddingHorizontal: space.md, paddingVertical: space.s, borderRadius: radius.lg, backgroundColor: chatPalette.systemPill, gap: space.xs, borderWidth: hairline, borderColor: colors.glassLine },
  chipWide: { minWidth: 260 },
  chipLine: { flexDirection: "row", alignItems: "center", gap: space.s },
  chipText: { ...type.caption, color: chatPalette.dayText, flexShrink: 1 },
  chipDanger: { color: colors.danger },
  chipTime: { ...type.meta, color: chatPalette.dayText },
});
