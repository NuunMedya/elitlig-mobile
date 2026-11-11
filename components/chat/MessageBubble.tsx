/**
 * MESAJ BALONU — WhatsApp düzeni (web ve masaüstü Mesajlar ile aynı görünüm).
 *
 * Balon: kuyruk (dizinin ilk mesajında), grupta renkli gönderen adı, yanıt
 * alıntısı (dokununca o mesaja gider), iletildi etiketi, bağlantı ve @bahsetme
 * ayrıştırması, fotoğraf (yüklenmeden ÖNCE boyutlandırılır) ve albüm ızgarası,
 * belge, dalga biçimli sesli mesaj (hız: 1× / 1,5× / 2×), konum kartı; sağ
 * altta düzenlendi · yıldız · saat · tik; balonun altında tepki hapları.
 *
 * PERFORMANS: bileşen `memo`dur ve yalnız kendi mesajı / seçimi değişince
 * çizilir. Eylemler tek bir kararlı nesneyle (`BubbleActions`) gelir; yazma
 * alanındaki her tuş vuruşu listeyi yeniden çizmez. Ses oynatıcısı ilk
 * dokunuşta kurulur (ekrandaki her sesli mesaj için yerel oynatıcı açılmaz).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Image, Linking, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Touchable } from "@/components/ui";
import { formatDurationMs, type ChatMessage, type ChatParticipant } from "@/lib/api/chat";
import { openMap } from "@/lib/chatMedia";
import { chatPalette, senderColor } from "@/lib/chatPalette";
import { clockTime, emojiOnlyCount, formatBytes, isVideoFile, messageSummary, parseRich, tickStatus, waveform, type TickStatus } from "@/lib/chatUtils";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

export interface BubbleActions {
  onLongPress: (message: ChatMessage) => void;
  onPress: (message: ChatMessage) => void;
  onJump: (messageId: number) => void;
  onOpenImage: (message: ChatMessage) => void;
  onReactions: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
  onOpenError: () => void;
}

const BUBBLE_MAX = 300;
const MEDIA_W = 248;
const NBSP = " ";

/* ---------- okundu tiki ---------- */

const TICK_ICON: Record<TickStatus, keyof typeof Ionicons.glyphMap> = {
  pending: "time-outline",
  queued: "cloud-offline-outline",
  failed: "alert-circle",
  sent: "checkmark",
  delivered: "checkmark-done",
  read: "checkmark-done",
};
const TICK_LABEL: Record<TickStatus, string> = {
  pending: "gönderiliyor",
  queued: "bağlantı bekleniyor",
  failed: "gönderilemedi",
  sent: "gönderildi",
  delivered: "bazıları okudu",
  read: "okundu",
};

export const Ticks = memo(function Ticks({ status, size = 15, color }: { status: TickStatus | null; size?: number; color?: string }) {
  if (!status) return null;
  const tint = status === "read" ? chatPalette.tickRead : status === "failed" ? colors.danger : color ?? chatPalette.tickSent;
  return <Ionicons name={TICK_ICON[status]} size={size} color={tint} accessibilityLabel={TICK_LABEL[status]} />;
});

/* ---------- balon altı bilgi satırı ---------- */

function MetaRow({ message, pinned, onMedia }: { message: ChatMessage; pinned: boolean; onMedia?: boolean }) {
  const tint = onMedia ? chatPalette.viewerText : chatPalette.bubbleMeta;
  return (
    <View style={[styles.meta, onMedia ? styles.metaOnMedia : null]} pointerEvents="none">
      {pinned ? <Ionicons name="pin" size={11} color={tint} /> : null}
      {message.starred ? <Ionicons name="star" size={11} color={tint} /> : null}
      {message.edited_at && !message.deleted ? <Text style={[styles.metaText, { color: tint }]} {...textScale.badge}>düzenlendi</Text> : null}
      <Text style={[styles.metaText, { color: tint }]} {...textScale.badge}>{clockTime(message.created_at)}</Text>
      <Ticks status={tickStatus(message)} color={tint} />
    </View>
  );
}

/** Metnin son satırında saat + tik için yer ayıran görünmez boşluk. */
function metaSpacer(message: ChatMessage, pinned: boolean): string {
  let n = 9;
  if (message.sender.is_me) n += 4;
  if (message.edited_at) n += 12;
  if (message.starred) n += 3;
  if (pinned) n += 3;
  return ` ${NBSP.repeat(n)}`;
}

/* ---------- metin ---------- */

const RichText = memo(function RichText({ message, participants, pinned, onOpenError }: { message: ChatMessage; participants: ChatParticipant[]; pinned: boolean; onOpenError: () => void }) {
  const body = message.kind === "image" || message.kind === "file" ? message.meta?.caption : message.body;
  const parts = useMemo(() => parseRich(body, participants), [body, participants]);
  const big = message.kind === "text" && !message.reply_to ? emojiOnlyCount(body) : 0;
  return (
    <Text style={[styles.text, big ? styles.textEmoji : null]} {...textScale.long}>
      {parts.map((part, index) => {
        if (part.t === "link") {
          return (
            <Text key={index} style={styles.link} onPress={() => void Linking.openURL(part.v).catch(onOpenError)} accessibilityRole="link">
              {part.v}
            </Text>
          );
        }
        if (part.t === "mention") return <Text key={index} style={styles.mention}>{part.v}</Text>;
        if (part.t === "bold") return <Text key={index} style={styles.bold}>{part.v}</Text>;
        return part.v;
      })}
      <Text style={styles.spacer}>{metaSpacer(message, pinned)}</Text>
    </Text>
  );
});

/* ---------- yanıt alıntısı ---------- */

function Quote({ message, onJump, onLong }: { message: ChatMessage; onJump: (id: number) => void; onLong: () => void }) {
  const reply = message.reply_to;
  if (!reply) return null;
  const summary = messageSummary({ kind: reply.kind, body: reply.body, meta: null, deleted: reply.body == null && reply.kind === "text" });
  const tint = senderColor(reply.sender_name ?? reply.id);
  return (
    <Touchable
      feedback="none"
      haptic="none"
      onPress={() => onJump(reply.id)}
      onLongPress={onLong}
      delayLongPress={260}
      accessibilityRole="button"
      accessibilityLabel={`Yanıtlanan mesaj: ${reply.sender_name ?? "Üye"}, ${summary.text}. Mesaja gitmek için dokun`}
      style={[styles.quote, { borderLeftColor: tint, backgroundColor: message.sender.is_me ? chatPalette.quoteMine : chatPalette.quoteTheirs }]}
    >
      <Text style={[styles.quoteName, { color: tint }]} numberOfLines={1} {...textScale.dense}>{reply.sender_name ?? "Üye"}</Text>
      <View style={styles.quoteLine}>
        {summary.icon ? <Ionicons name={summary.icon} size={12} color={chatPalette.bubbleMeta} /> : null}
        <Text style={styles.quoteText} numberOfLines={2} {...textScale.dense}>{summary.text || "Mesaj"}</Text>
      </View>
    </Touchable>
  );
}

/* ---------- fotoğraf ---------- */

/** Görsel kutusu yüklenmeden önce hesaplanır: liste yüklenirken zıplamaz. */
function imageBox(message: ChatMessage, width = MEDIA_W): { width: number; height: number } {
  const file = message.meta?.file;
  const ratio = file?.width && file?.height ? Math.min(1.9, Math.max(0.62, file.width / file.height)) : 4 / 3;
  return { width, height: Math.round(width / ratio) };
}

const imageUri = (message: ChatMessage) => message.local_uri || message.meta?.file?.url || null;

function Photo({ message, box, onPress, onLong, more, style }: { message: ChatMessage; box: { width: number; height: number }; onPress: () => void; onLong: () => void; more?: number; style?: StyleProp<ViewStyle> }) {
  const uri = imageUri(message);
  return (
    <Touchable
      feedback="none"
      haptic="none"
      onPress={onPress}
      onLongPress={onLong}
      delayLongPress={260}
      accessibilityRole="imagebutton"
      accessibilityLabel={more ? `Fotoğraf ve ${more} fotoğraf daha. Görmek için dokun` : "Fotoğraf. Tam ekran görmek için dokun"}
      style={[styles.photo, box, style]}
    >
      {uri ? <Image source={{ uri }} style={box} resizeMode="cover" /> : null}
      {message.pending ? (
        <View style={styles.photoBusy} pointerEvents="none">
          <Ionicons name="cloud-upload-outline" size={22} color={chatPalette.viewerText} />
        </View>
      ) : null}
      {more ? (
        <View style={styles.photoMore} pointerEvents="none">
          <Text style={styles.photoMoreText} {...textScale.badge}>+{more}</Text>
        </View>
      ) : null}
    </Touchable>
  );
}

function Album({ messages, onOpenImage, onLong }: { messages: ChatMessage[]; onOpenImage: (message: ChatMessage) => void; onLong: () => void }) {
  const shown = messages.slice(0, 4);
  const more = messages.length - shown.length;
  const cell = (MEDIA_W - space.xxs) / 2;
  const box = { width: cell, height: cell };
  return (
    <View style={styles.album}>
      {shown.map((item, index) => {
        // Üç karede ilk kare tam genişlik (WhatsApp albüm düzeni).
        const wide = shown.length === 3 && index === 0;
        return (
          <Photo
            key={item.client_id ?? item.id}
            message={item}
            box={wide ? { width: MEDIA_W, height: cell } : box}
            onPress={() => onOpenImage(item)}
            onLong={onLong}
            more={index === shown.length - 1 && more > 0 ? more : undefined}
          />
        );
      })}
    </View>
  );
}

/* ---------- belge ---------- */

function FileBody({ message, onOpenError, onLong }: { message: ChatMessage; onOpenError: () => void; onLong: () => void }) {
  const file = message.meta?.file;
  const video = isVideoFile(message);
  const ext = (file?.name?.split(".").pop() ?? "").toLocaleUpperCase("tr-TR").slice(0, 5);
  const open = () => {
    if (file?.url) void Linking.openURL(file.url).catch(onOpenError);
  };
  return (
    <Touchable
      feedback="none"
      haptic="light"
      onPress={open}
      onLongPress={onLong}
      delayLongPress={260}
      disabled={!file?.url}
      accessibilityRole="link"
      accessibilityLabel={`${file?.name ?? "Belge"}. Açmak için dokun`}
      style={[styles.file, { backgroundColor: message.sender.is_me ? chatPalette.quoteMine : chatPalette.quoteTheirs }]}
    >
      <View style={styles.fileIcon}>
        <Ionicons name={video ? "videocam" : "document-text"} size={20} color={colors.textOnBrand} />
      </View>
      <View style={styles.fileBody}>
        <Text style={styles.fileName} numberOfLines={2} {...textScale.dense}>{file?.name ?? "Belge"}</Text>
        <Text style={styles.fileMeta} numberOfLines={1} {...textScale.dense}>
          {[message.pending ? "Yükleniyor…" : null, formatBytes(file?.size), ext].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Ionicons name={message.pending ? "cloud-upload-outline" : "open-outline"} size={18} color={chatPalette.bubbleMeta} />
    </Touchable>
  );
}

/* ---------- sesli mesaj ---------- */

const SPEEDS = [1, 1.5, 2];
const SPEED_LABEL: Record<number, string> = { 1: "1×", 1.5: "1,5×", 2: "2×" };
/** Aynı anda tek sesli mesaj çalar: yeni başlayan öncekini duraklatır. */
let pauseCurrent: (() => void) | null = null;

function Wave({ bars, progress, mine }: { bars: number[]; progress: number; mine: boolean }) {
  const active = mine ? chatPalette.voiceMine : chatPalette.waveActive;
  const cut = Math.round(progress * bars.length);
  return (
    <View style={styles.wave} pointerEvents="none">
      {bars.map((h, index) => (
        <View key={index} style={[styles.waveBar, { height: Math.round(4 + h * 20), backgroundColor: index < cut ? active : chatPalette.waveIdle }]} />
      ))}
    </View>
  );
}

function VoiceFrame({
  playing,
  progress,
  label,
  bars,
  mine,
  speed,
  onToggle,
  onSpeed,
  disabled,
}: {
  playing: boolean;
  progress: number;
  label: string;
  bars: number[];
  mine: boolean;
  speed?: number;
  onToggle: () => void;
  onSpeed?: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.voice}>
      <Touchable
        feedback="icon"
        haptic="light"
        onPress={onToggle}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={playing ? "Sesli mesajı duraklat" : "Sesli mesajı oynat"}
        style={[styles.voicePlay, { backgroundColor: mine ? chatPalette.voiceMine : chatPalette.waveActive }]}
      >
        <Ionicons name={disabled ? "cloud-upload-outline" : playing ? "pause" : "play"} size={18} color={colors.textOnBrand} />
      </Touchable>
      <View style={styles.voiceBody}>
        <Wave bars={bars} progress={progress} mine={mine} />
        <Text style={styles.voiceTime} {...textScale.badge}>{label}</Text>
      </View>
      {onSpeed ? (
        <Touchable feedback="chip" haptic="selection" onPress={onSpeed} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Oynatma hızı ${SPEED_LABEL[speed ?? 1]}. Değiştirmek için dokun`} style={styles.speed}>
          <Text style={styles.speedText} {...textScale.badge}>{SPEED_LABEL[speed ?? 1]}</Text>
        </Touchable>
      ) : (
        <Ionicons name="mic" size={16} color={mine ? chatPalette.voiceMine : chatPalette.waveActive} />
      )}
    </View>
  );
}

function VoicePlayer({ url, durationMs, bars, mine }: { url: string; durationMs: number; bars: number[]; mine: boolean }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const [speed, setSpeed] = useState(1);
  const total = status.duration > 0 ? status.duration * 1000 : durationMs;
  const progress = total > 0 ? Math.min(1, (status.currentTime * 1000) / total) : 0;

  const pause = useCallback(() => {
    try {
      player.pause();
    } catch {
      // oynatıcı kapanmış olabilir (satır ekrandan çıktı)
    }
  }, [player]);

  const play = useCallback(() => {
    if (pauseCurrent && pauseCurrent !== pause) pauseCurrent();
    pauseCurrent = pause;
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) void player.seekTo(0);
    player.play();
  }, [pause, player, status.currentTime, status.didJustFinish, status.duration]);

  // İlk dokunuşta kurulur ve hemen çalar.
  useEffect(() => {
    if (pauseCurrent && pauseCurrent !== pause) pauseCurrent();
    pauseCurrent = pause;
    player.play();
    return () => {
      if (pauseCurrent === pause) pauseCurrent = null;
    };
  }, [pause, player]);

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const next = SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length];
      try {
        player.setPlaybackRate(next);
      } catch {
        // hız desteklenmiyorsa 1× sürer
      }
      return next;
    });
  }, [player]);

  return (
    <VoiceFrame
      playing={status.playing}
      progress={progress}
      label={status.playing || status.currentTime > 0 ? formatDurationMs(status.currentTime * 1000) : formatDurationMs(total)}
      bars={bars}
      mine={mine}
      speed={speed}
      onToggle={status.playing ? pause : play}
      onSpeed={cycleSpeed}
    />
  );
}

export const VoiceNote = memo(function VoiceNote({ url, durationMs, seed, mine, uploading }: { url: string | null | undefined; durationMs: number; seed: number | string; mine: boolean; uploading?: boolean }) {
  const [armed, setArmed] = useState(false);
  const bars = useMemo(() => waveform(seed), [seed]);
  if (armed && url) return <VoicePlayer url={url} durationMs={durationMs} bars={bars} mine={mine} />;
  return <VoiceFrame playing={false} progress={0} label={formatDurationMs(durationMs)} bars={bars} mine={mine} onToggle={() => setArmed(true)} disabled={!url || uploading} />;
});

/* ---------- konum ---------- */

function LocationBody({ message, onLong }: { message: ChatMessage; onLong: () => void }) {
  const location = message.meta?.location;
  const title = location?.venue_name || location?.label || "Konum";
  return (
    <Touchable feedback="none" haptic="light" onPress={() => void openMap(location)} onLongPress={onLong} delayLongPress={260} accessibilityRole="link" accessibilityLabel={`${title}. Haritada açmak için dokun`} style={styles.location}>
      <View style={styles.locationMap}>
        <Ionicons name="location" size={30} color={colors.danger} />
      </View>
      <View style={styles.locationBody}>
        <Text style={styles.fileName} numberOfLines={2} {...textScale.dense}>{title}</Text>
        {location?.address ? <Text style={styles.fileMeta} numberOfLines={2} {...textScale.dense}>{location.address}</Text> : null}
        <Text style={styles.locationLink} {...textScale.dense}>Haritada aç</Text>
      </View>
    </Touchable>
  );
}

/* ---------- tepkiler ---------- */

export const ReactionChips = memo(function ReactionChips({ message, onPress }: { message: ChatMessage; onPress: (message: ChatMessage) => void }) {
  const list = message.reactions;
  if (!list?.length || message.deleted) return null;
  const total = list.reduce((sum, item) => sum + item.count, 0);
  const mine = list.some((item) => item.mine);
  return (
    <Touchable
      feedback="chip"
      haptic="selection"
      onPress={() => onPress(message)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${total} tepki. Kimlerin tepki verdiğini görmek için dokun`}
      style={[styles.reactions, mine ? styles.reactionsMine : null]}
    >
      <Text style={styles.reactionEmoji} {...textScale.badge}>{list.slice(0, 3).map((item) => item.emoji).join("")}</Text>
      {total > 1 ? <Text style={styles.reactionCount} {...textScale.badge}>{total}</Text> : null}
    </Touchable>
  );
});

/* ---------- satır kabuğu ---------- */

export interface RowShellProps {
  mine: boolean;
  selecting: boolean;
  selected: boolean;
  highlighted: boolean;
  /** Dizinin son mesajı: altında daha geniş boşluk. */
  last: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  center?: boolean;
  children: ReactNode;
  accessibilityLabel?: string;
}

/** Hizalama, seçim işareti ve "mesaja git" vurgusu — balonlar ve kartlar ortak kullanır. */
export function RowShell({ mine, selecting, selected, highlighted, last, onPress, onLongPress, center, children, accessibilityLabel }: RowShellProps) {
  return (
    <Touchable
      feedback="none"
      haptic="none"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selecting ? { selected } : undefined}
      style={[styles.row, last ? styles.rowLast : null, selected || highlighted ? styles.rowMarked : null]}
    >
      {selecting ? (
        <View style={styles.check}>
          <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? colors.brand : chatPalette.bubbleMeta} />
        </View>
      ) : null}
      <View style={[styles.rowBody, center ? styles.rowCenter : mine ? styles.rowMine : styles.rowTheirs]} pointerEvents={selecting ? "none" : "box-none"}>
        {children}
      </View>
    </Touchable>
  );
}

/* ---------- balon ---------- */

export interface MessageBubbleProps {
  message: ChatMessage;
  /** Albüm: `message` son karedir (saat ve tik onun). */
  album?: ChatMessage[];
  first: boolean;
  last: boolean;
  /** Grup sohbeti: karşı tarafın adı dizinin ilk mesajında görünür. */
  grouped: boolean;
  participants: ChatParticipant[];
  pinned: boolean;
  selecting: boolean;
  selected: boolean;
  highlighted: boolean;
  /** Üye mesajları kutusu: yönetim adına yazan yöneticinin adı. */
  adminName?: string | null;
  actions: BubbleActions;
}

export const MessageBubble = memo(function MessageBubble({ message, album, first, last, grouped, participants, pinned, selecting, selected, highlighted, adminName, actions }: MessageBubbleProps) {
  const mine = message.sender.is_me;
  const deleted = message.deleted;
  const kind = message.kind;
  const caption = !deleted && (kind === "image" || kind === "file") ? message.meta?.caption : null;
  const mediaOnly = !deleted && (kind === "image" || Boolean(album)) && !caption && !message.reply_to;
  const showName = !mine && first && (grouped || message.sender.is_management);
  const nameTint = message.sender.is_management ? colors.brandAccent : senderColor(message.sender.user_id ?? message.sender.name);
  const forwarded = !deleted && (message.forwarded || message.meta?.forwarded);
  const summary = messageSummary(message);
  const onLong = () => actions.onLongPress(message);
  const textual = deleted || Boolean(caption) || (!album && !["image", "file", "audio", "location"].includes(kind));

  return (
    <RowShell
      mine={mine}
      selecting={selecting}
      selected={selected}
      highlighted={highlighted}
      last={last}
      onPress={() => actions.onPress(message)}
      onLongPress={onLong}
      accessibilityLabel={`${mine ? "Sen" : message.sender.name ?? "Üye"}: ${summary.text}, ${clockTime(message.created_at)}`}
    >
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, first ? (mine ? styles.tailCornerMine : styles.tailCornerTheirs) : null, mediaOnly ? styles.bubbleMedia : null, message.pending ? styles.bubblePending : null]}>
        {first ? <View style={[styles.tail, mine ? styles.tailMine : styles.tailTheirs]} pointerEvents="none" /> : null}
        {showName ? (
          <View style={[styles.nameRow, mediaOnly ? styles.padded : null]}>
            {message.sender.is_management ? <Ionicons name="shield-checkmark" size={12} color={nameTint} /> : null}
            <Text style={[styles.name, { color: nameTint }]} numberOfLines={1} {...textScale.dense}>
              {message.sender.is_management ? "ElitLig Yönetimi" : message.sender.name ?? "Üye"}
            </Text>
          </View>
        ) : null}
        {mine && adminName && first ? (
          <Text style={[styles.adminName, mediaOnly ? styles.padded : null]} numberOfLines={1} {...textScale.dense}>Yönetim adına · {adminName}</Text>
        ) : null}
        {forwarded ? (
          <View style={[styles.forwarded, mediaOnly ? styles.padded : null]}>
            <Ionicons name="arrow-redo" size={11} color={chatPalette.bubbleMeta} />
            <Text style={styles.forwardedText} {...textScale.badge}>İletildi</Text>
          </View>
        ) : null}
        {!deleted ? <Quote message={message} onJump={actions.onJump} onLong={onLong} /> : null}

        {deleted ? (
          <View style={styles.deleted}>
            <Ionicons name="ban" size={14} color={chatPalette.bubbleMeta} />
            <Text style={styles.deletedText} {...textScale.long}>
              Bu mesaj silindi
              <Text style={styles.spacer}>{metaSpacer(message, false)}</Text>
            </Text>
          </View>
        ) : album ? (
          <Album messages={album} onOpenImage={actions.onOpenImage} onLong={onLong} />
        ) : kind === "image" ? (
          <Photo message={message} box={imageBox(message)} onPress={() => actions.onOpenImage(message)} onLong={onLong} style={caption ? styles.photoCaptioned : null} />
        ) : kind === "file" ? (
          <FileBody message={message} onOpenError={actions.onOpenError} onLong={onLong} />
        ) : kind === "audio" ? (
          <VoiceNote url={message.local_uri || message.meta?.audio?.url} durationMs={message.meta?.audio?.duration_ms ?? 0} seed={message.client_id ?? message.id} mine={mine} uploading={message.pending} />
        ) : kind === "location" ? (
          <LocationBody message={message} onLong={onLong} />
        ) : (
          <RichText message={message} participants={participants} pinned={pinned} onOpenError={actions.onOpenError} />
        )}

        {caption ? <RichText message={message} participants={participants} pinned={pinned} onOpenError={actions.onOpenError} /> : null}
        {!textual ? (
          mediaOnly ? <MetaRow message={message} pinned={pinned} onMedia /> : <View style={styles.metaFlow}><MetaRow message={message} pinned={pinned} /></View>
        ) : (
          <View style={styles.metaFloat}><MetaRow message={message} pinned={pinned} /></View>
        )}
      </View>
      <ReactionChips message={message} onPress={actions.onReactions} />
      {message.failed ? (
        <Touchable feedback="chip" haptic="light" onPress={() => actions.onRetry(message)} accessibilityRole="button" accessibilityLabel="Mesaj gönderilemedi. Tekrar denemek için dokun" style={styles.failed}>
          <Ionicons name={message.queued ? "cloud-offline-outline" : "alert-circle"} size={13} color={colors.danger} />
          <Text style={styles.failedText} {...textScale.badge}>{message.queued ? "Bağlantı gelince gönderilecek · şimdi dene" : "Gönderilemedi · tekrar dene"}</Text>
        </Touchable>
      ) : null}
    </RowShell>
  );
});

/* ---------- gün ayracı, okunmamış ayracı ---------- */

export const DayDivider = memo(function DayDivider({ label }: { label: string }) {
  return (
    <View style={styles.dayRow} accessibilityRole="header">
      <View style={styles.dayPill}><Text style={styles.dayText} {...textScale.badge}>{label}</Text></View>
    </View>
  );
});

export const UnreadDivider = memo(function UnreadDivider({ count }: { count: number }) {
  return (
    <View style={styles.unreadRow}>
      <View style={styles.dayPill}>
        <Text style={styles.dayText} {...textScale.badge}>{count > 0 ? `${count} okunmamış mesaj` : "Okunmamış mesajlar"}</Text>
      </View>
    </View>
  );
});

const TAIL = 8;

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.md, paddingVertical: space.px },
  rowLast: { paddingBottom: space.s },
  rowMarked: { backgroundColor: chatPalette.highlight },
  check: { width: 30, alignItems: "flex-start", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0 },
  rowMine: { alignItems: "flex-end" },
  rowTheirs: { alignItems: "flex-start" },
  rowCenter: { alignItems: "stretch" },

  bubble: { maxWidth: BUBBLE_MAX, minWidth: 76, borderRadius: radius.md, paddingHorizontal: space.sm, paddingTop: space.s, paddingBottom: space.s, borderWidth: hairline, borderColor: chatPalette.bubbleBorder },
  bubbleMine: { backgroundColor: chatPalette.bubbleMine, marginLeft: space.huge },
  bubbleTheirs: { backgroundColor: chatPalette.bubbleTheirs, marginRight: space.huge },
  bubbleMedia: { paddingHorizontal: space.xxs + 1, paddingTop: space.xxs + 1, paddingBottom: space.xxs + 1 },
  bubblePending: { opacity: 0.86 },
  tailCornerMine: { borderTopRightRadius: 0 },
  tailCornerTheirs: { borderTopLeftRadius: 0 },
  tail: { position: "absolute", top: -hairline, width: 0, height: 0, borderTopWidth: TAIL, borderBottomWidth: 0, borderBottomColor: "transparent" },
  tailMine: { right: -TAIL, borderTopColor: chatPalette.bubbleMine, borderRightWidth: TAIL, borderRightColor: "transparent" },
  tailTheirs: { left: -TAIL, borderTopColor: chatPalette.bubbleTheirs, borderLeftWidth: TAIL, borderLeftColor: "transparent" },
  padded: { paddingHorizontal: space.s, paddingTop: space.xxs },

  nameRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: space.xxs },
  name: { ...type.labelSm, flexShrink: 1 },
  adminName: { ...type.meta, color: chatPalette.bubbleMeta, marginBottom: space.xxs },
  forwarded: { flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: space.xxs },
  forwardedText: { ...type.meta, color: chatPalette.bubbleMeta, fontStyle: "italic" },

  text: { ...type.body, fontSize: type.bodyLg.fontSize, lineHeight: 21, color: chatPalette.bubbleText },
  textEmoji: { fontSize: type.scoreLg.fontSize, lineHeight: type.scoreHero.lineHeight },
  link: { color: chatPalette.link, textDecorationLine: "underline" },
  mention: { color: chatPalette.mention, fontFamily: fonts.semibold },
  bold: { fontFamily: fonts.semibold },
  spacer: { ...type.meta, color: "transparent" },
  deleted: { flexDirection: "row", alignItems: "center", gap: space.xs },
  deletedText: { ...type.body, color: chatPalette.bubbleMeta, fontStyle: "italic" },

  meta: { flexDirection: "row", alignItems: "center", gap: space.xs },
  metaText: { ...type.meta },
  metaFloat: { position: "absolute", right: space.sm, bottom: space.xs },
  metaFlow: { alignSelf: "flex-end", marginTop: space.xxs },
  metaOnMedia: { position: "absolute", right: space.sm, bottom: space.sm, paddingHorizontal: space.s, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: chatPalette.viewerChrome },

  quote: { borderLeftWidth: 3, borderRadius: radius.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, marginBottom: space.xs, gap: space.px, minWidth: 140 },
  quoteName: { ...type.labelXs },
  quoteLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  quoteText: { ...type.bodySm, color: chatPalette.bubbleMeta, flexShrink: 1 },

  photo: { borderRadius: radius.sm, overflow: "hidden", backgroundColor: chatPalette.quoteTheirs },
  photoCaptioned: { marginBottom: space.xs },
  photoBusy: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: chatPalette.viewerChrome },
  photoMore: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: chatPalette.viewerChrome },
  photoMoreText: { ...type.scoreMd, color: chatPalette.viewerText },
  album: { width: MEDIA_W, flexDirection: "row", flexWrap: "wrap", gap: space.xxs },

  file: { width: MEDIA_W, flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.sm },
  fileIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  fileBody: { flex: 1, minWidth: 0, gap: space.px },
  fileName: { ...type.label, color: chatPalette.bubbleText },
  fileMeta: { ...type.caption, color: chatPalette.bubbleMeta },

  voice: { width: MEDIA_W, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xxs },
  voicePlay: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  voiceBody: { flex: 1, gap: space.xxs },
  wave: { height: 26, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  waveBar: { width: 3, borderRadius: 2 },
  voiceTime: { ...type.numSm, color: chatPalette.bubbleMeta },
  speed: { minWidth: 40, height: 26, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: chatPalette.quoteMine },
  speedText: { ...type.labelXs, color: chatPalette.bubbleText },

  location: { width: MEDIA_W, borderRadius: radius.sm, overflow: "hidden" },
  locationMap: { height: 92, alignItems: "center", justifyContent: "center", backgroundColor: chatPalette.quoteTheirs, borderRadius: radius.sm },
  locationBody: { paddingTop: space.s, gap: space.px },
  locationLink: { ...type.labelSm, color: chatPalette.link, marginTop: space.xxs },

  reactions: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: -space.s, marginHorizontal: space.sm, paddingHorizontal: space.sm, height: 24, borderRadius: radius.pill, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  reactionsMine: { borderColor: colors.brandBorder, backgroundColor: colors.brandDim },
  reactionEmoji: { ...type.label, color: colors.textPrimary },
  reactionCount: { ...type.numSmStrong, color: colors.textSecondary },

  failed: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs },
  failedText: { ...type.labelXs, color: colors.danger },

  dayRow: { alignItems: "center", paddingVertical: space.sm },
  unreadRow: { alignItems: "center", paddingVertical: space.sm, marginVertical: space.xs, backgroundColor: chatPalette.quoteTheirs },
  dayPill: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, backgroundColor: chatPalette.dayPill },
  dayText: { ...type.labelXs, color: chatPalette.dayText },
});
