/**
 * ZENGİN MESAJ BALONLARI — sesli mesaj, konum, maç teklifi, bildirim kartı.
 * Üye ve yönetim sohbet ekranları ortak kullanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { memo, useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Touchable, withAlpha } from "@/components/ui";
import { formatDurationMs, type ChatAction, type ChatMessage } from "@/lib/api/chat";
import { openMap } from "@/lib/chatMedia";
import { colors, radius, space, textScale, type } from "@/theme";

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

export const AudioPlayerRow = memo(function AudioPlayerRow({ url, durationMs, onDark }: { url: string | null | undefined; durationMs?: number | null; onDark?: boolean }) {
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
  const fg = onDark ? colors.textOnBrand : colors.textPrimary;
  const track = onDark ? withAlpha(colors.textOnBrand, 0.28) : colors.surface3;
  return (
    <View style={styles.audioRow}>
      <Touchable feedback="icon" haptic="light" onPress={toggle} accessibilityRole="button" accessibilityLabel={playing ? "Duraklat" : "Oynat"} style={[styles.playButton, { backgroundColor: onDark ? withAlpha(colors.textOnBrand, 0.2) : colors.brandDim }]}>
        <Ionicons name={playing ? "pause" : "play"} size={16} color={onDark ? colors.textOnBrand : colors.brand} />
      </Touchable>
      <View style={styles.audioBody}>
        <View style={[styles.track, { backgroundColor: track }]}>
          <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: onDark ? colors.textOnBrand : colors.brand }]} />
        </View>
        <Text style={[styles.audioTime, { color: onDark ? withAlpha(colors.textOnBrand, 0.8) : colors.textSecondary }]} {...textScale.badge}>
          {playing || status.currentTime > 0 ? `${formatDurationMs(status.currentTime * 1000)} / ` : ""}
          {formatDurationMs(total)}
        </Text>
      </View>
      <Ionicons name="mic" size={14} color={fg} />
    </View>
  );
});

export const AudioBubble = memo(function AudioBubble({ message, showSender }: { message: ChatMessage; showSender: boolean }) {
  const mine = message.sender.is_me;
  const audio = message.meta?.audio;
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      {showSender && !mine ? <Text style={styles.sender} numberOfLines={1} {...textScale.dense}>{message.sender.name ?? "Üye"}</Text> : null}
      <AudioPlayerRow url={audio?.url} durationMs={audio?.duration_ms} onDark={mine} />
      <Text style={[styles.stamp, mine ? styles.stampMine : null]} {...textScale.badge}>{clockLabel(message.created_at)}</Text>
    </View>
  );
});

/* ---------- konum ---------- */

export const LocationBubble = memo(function LocationBubble({ message, showSender }: { message: ChatMessage; showSender: boolean }) {
  const mine = message.sender.is_me;
  const location = message.meta?.location;
  const title = location?.venue_name ?? location?.label ?? "Konum";
  return (
    <Touchable feedback="card" haptic="selection" onPress={() => void openMap(location)} accessibilityRole="button" accessibilityLabel={`${title} konumunu haritada aç`} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      {showSender && !mine ? <Text style={styles.sender} numberOfLines={1} {...textScale.dense}>{message.sender.name ?? "Üye"}</Text> : null}
      <View style={styles.locationRow}>
        <View style={styles.pin}><Ionicons name="location" size={18} color={colors.danger} /></View>
        <View style={styles.locationBody}>
          <Text style={[styles.locationTitle, mine ? styles.textMine : null]} numberOfLines={2} {...textScale.dense}>{title}</Text>
          {location?.address ? <Text style={[styles.locationSub, mine ? styles.subMine : null]} numberOfLines={2} {...textScale.dense}>{location.address}</Text> : null}
          {location?.lat != null && location?.lng != null ? <Text style={[styles.locationSub, mine ? styles.subMine : null]} {...textScale.badge}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</Text> : null}
        </View>
      </View>
      <View style={styles.linkRow}>
        <Ionicons name="map-outline" size={13} color={mine ? colors.textOnBrand : colors.brandAccent} />
        <Text style={[styles.linkText, mine ? styles.textMine : null]} {...textScale.dense}>Haritada aç</Text>
      </View>
      <Text style={[styles.stamp, mine ? styles.stampMine : null]} {...textScale.badge}>{clockLabel(message.created_at)}</Text>
    </Touchable>
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
        <Ionicons name="football" size={16} color={mine ? colors.textOnBrand : colors.brandAccent} />
        <Text style={[styles.cardTitle, mine ? styles.textMine : null]} {...textScale.dense}>Maç Teklifi</Text>
        <View style={[styles.statusPill, { backgroundColor: withAlpha(statusColor, mine ? 0.35 : 0.16) }]}>
          <Text style={[styles.statusText, { color: mine ? colors.textOnBrand : statusColor }]} {...textScale.badge}>{OFFER_LABEL[status]}</Text>
        </View>
      </View>
      <View style={[styles.teams, { backgroundColor: mine ? withAlpha(colors.textOnBrand, 0.14) : colors.surface3 }]}>
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

function Fact({ icon, text, mine }: { icon: keyof typeof Ionicons.glyphMap; text: string; mine: boolean }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={13} color={mine ? withAlpha(colors.textOnBrand, 0.85) : colors.textSecondary} />
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
        {call?.recording_url ? <AudioPlayerRow url={call.recording_url} durationMs={call.recording_duration_ms} /> : null}
      </View>
    </View>
  );
});

export const SystemChip = memo(function SystemChip({ text, icon }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.chipRow}>
      <View style={styles.chip}>
        <View style={styles.chipLine}>
          {icon ? <Ionicons name={icon} size={12} color={colors.textTertiary} /> : null}
          <Text style={styles.chipText} {...textScale.dense}>{text}</Text>
        </View>
      </View>
    </View>
  );
});

const PLAY = 34;

const styles = StyleSheet.create({
  bubble: { maxWidth: "86%", borderRadius: radius.lg, padding: space.md, gap: space.xs },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.brand, borderBottomRightRadius: radius.xs },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: colors.surface2, borderBottomLeftRadius: radius.xs },
  sender: { ...type.micro, color: colors.brandAccent },
  stamp: { ...type.micro, color: colors.textTertiary, alignSelf: "flex-end", marginTop: space.xxs },
  stampMine: { color: withAlpha(colors.textOnBrand, 0.72) },
  textMine: { color: colors.textOnBrand },
  subMine: { color: withAlpha(colors.textOnBrand, 0.85) },

  audioRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minWidth: 220 },
  playButton: { width: PLAY, height: PLAY, borderRadius: PLAY / 2, alignItems: "center", justifyContent: "center" },
  audioBody: { flex: 1, gap: space.xs },
  track: { height: 4, borderRadius: radius.xs, overflow: "hidden" },
  trackFill: { height: 4, borderRadius: radius.xs },
  audioTime: { ...type.micro },

  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  pin: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.dangerDim, alignItems: "center", justifyContent: "center" },
  locationBody: { flex: 1, minWidth: 0, gap: space.xxs },
  locationTitle: { ...type.h4, color: colors.textPrimary },
  locationSub: { ...type.caption, color: colors.textSecondary },
  linkRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs },
  linkText: { ...type.label, color: colors.brandAccent },

  card: { maxWidth: "92%", borderLeftWidth: 3, gap: space.sm },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cardIcon: { width: 30, height: 30, borderRadius: radius.sm, backgroundColor: colors.brandDim, alignItems: "center", justifyContent: "center" },
  cardTitle: { ...type.h4, color: colors.textPrimary, flex: 1 },
  bodyText: { ...type.bodySm, color: colors.textPrimary },
  statusPill: { paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill },
  statusText: { ...type.micro },
  teams: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md },
  teamName: { ...type.h4, color: colors.textPrimary, flexShrink: 1 },
  vs: { ...type.micro, color: colors.textTertiary },
  fact: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
  factText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
  resolved: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs },
  resolvedText: { ...type.label, color: colors.win },

  chipRow: { alignItems: "center", paddingVertical: space.xxs },
  chip: { maxWidth: "92%", paddingHorizontal: space.md, paddingVertical: space.s, borderRadius: radius.lg, backgroundColor: colors.surface2, gap: space.xs },
  chipWide: { minWidth: 260 },
  chipLine: { flexDirection: "row", alignItems: "center", gap: space.s },
  chipText: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  chipDanger: { color: colors.danger },
  chipTime: { ...type.micro, color: colors.textTertiary },
});
