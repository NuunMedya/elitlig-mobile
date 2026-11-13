/**
 * MESAJ BALONU — WhatsApp işlevselliği, Gece dili (ikinci tur).
 *
 * GECE DİLİ:
 *   · Giden balon mor tonlu degradedir (sağda `bubbleMine`, solda bir tık
 *     maviye kayan `bubbleMineEdge`); gelen balon yüzey rengi + ışıklı ince
 *     kenar. Köşeler 18 px; dizinin ilk balonunda kuyruk tarafındaki üst köşe
 *     4 px'e iner ve küçük bir kuyruk çıkar.
 *   · BUBBLE RISE: oda açıldıktan SONRA gelen ya da gönderilen mesaj, kendi
 *     köşesinden (gidende sağ alt, gelende sol alt) küçükten büyüyüp yukarı
 *     yaylanarak girer. Açılışta zaten var olan mesajlar ve kaydırınca yeniden
 *     bağlanan satırlar oynamaz (kimlik kümesi).
 *   · READ RECEIPTS: tik "okundu"ya döndüğünde camgöbeği çift tik zıplar.
 *   · SWIPE TO REPLY: balon sağa çekilince solunda yanıt oku belirir; eşik
 *     geçilip bırakılırsa mesaj yanıtlanır (uzun basma menüsündeki "Yanıtla").
 *   · Alıntı kutusu, belge / konum / ses kartları, gün hapı ve okunmamış
 *     ayracı aynı cam + degrade diliyle çizilir.
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
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Image, Linking, PanResponder, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Touchable, fireHaptic } from "@/components/chat/kit";
import { useReduceMotion } from "@/components/ui";
import { formatDurationMs, type ChatMessage, type ChatParticipant } from "@/lib/api/chat";
import { openMap } from "@/lib/chatMedia";
import { chatPalette, colors, senderColor } from "@/lib/chatPalette";
import { clockTime, emojiOnlyCount, formatBytes, isVideoFile, messageSummary, parseRich, tickStatus, waveform, type TickStatus } from "@/lib/chatUtils";
import { fonts, glowStyle, hairline, palette, radius, space, spring, textScale, type } from "@/theme";

/** Degrade yönü: sağdan sola (açık uç sağda). */
const G_START = { x: 1, y: 0.5 } as const;
const G_END = { x: 0, y: 0.5 } as const;

export interface BubbleActions {
  onLongPress: (message: ChatMessage) => void;
  onPress: (message: ChatMessage) => void;
  onJump: (messageId: number) => void;
  onOpenImage: (message: ChatMessage) => void;
  onReactions: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
  onOpenError: () => void;
  /** Kaydırarak yanıtla (verilmezse balon kaydırılmaz). */
  onReply?: (message: ChatMessage) => void;
}

/* ---------- bubble rise: yeni mesajın girişi ---------- */

/** Oda açılış anı: bundan sonra gelen mesajlar yükselerek girer. */
let riseSince = Number.POSITIVE_INFINITY;
/** Girişini oynatmış (ya da oynatmayacak) mesajlar — kaydırmada yeniden oynamaz. */
const risen = new Set<string>();

/** Sohbet odası açılınca çağrılır; açılıştaki mesajlar yükselmez. */
export function beginRiseSession(): void {
  riseSince = Date.now();
}

function riseKey(message: ChatMessage): string {
  return message.client_id ?? String(message.id);
}

/** Bu mesaj ilk kez mi çiziliyor ve oda açıldıktan sonra mı geldi? */
function shouldRise(message: ChatMessage): boolean {
  const key = riseKey(message);
  if (risen.has(key)) return false;
  risen.add(key);
  if (message.pending) return true;
  const at = Date.parse(message.created_at);
  return Number.isFinite(at) && at > riseSince - 1500;
}

function useRise(message: ChatMessage | undefined): { style: Animated.WithAnimatedObject<ViewStyle> | null } {
  const reduceMotion = useReduceMotion();
  const fresh = useRef(message ? shouldRise(message) && !reduceMotion : false).current;
  const progress = useRef(new Animated.Value(fresh ? 0 : 1)).current;
  useEffect(() => {
    if (!fresh) return;
    Animated.spring(progress, { toValue: 1, ...spring.pop }).start();
  }, [fresh, progress]);
  if (!fresh || !message) return { style: null };
  const mine = message.sender.is_me;
  return {
    style: {
      opacity: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
      transformOrigin: mine ? "right bottom" : "left bottom",
      transform: [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
      ],
    } as Animated.WithAnimatedObject<ViewStyle>,
  };
}

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

/** READ RECEIPTS: tik "okundu"ya döndüğünde çift tik yaylanarak zıplar. */
export const Ticks = memo(function Ticks({ status, size = 15, color }: { status: TickStatus | null; size?: number; color?: string }) {
  const reduceMotion = useReduceMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const previous = useRef(status);
  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (reduceMotion || !was || was === status || (status !== "read" && status !== "delivered" && status !== "sent")) return;
    pop.setValue(0.4);
    Animated.spring(pop, { toValue: 1, ...spring.pop }).start();
  }, [pop, reduceMotion, status]);
  if (!status) return null;
  const tint = status === "read" ? chatPalette.tickRead : status === "failed" ? colors.danger : color ?? chatPalette.tickSent;
  return (
    <Animated.View style={{ transform: [{ scale: pop }] }}>
      <Ionicons name={TICK_ICON[status]} size={size} color={tint} accessibilityLabel={TICK_LABEL[status]} />
    </Animated.View>
  );
});

/* ---------- balon altı bilgi satırı ---------- */

function MetaRow({ message, pinned, onMedia }: { message: ChatMessage; pinned: boolean; onMedia?: boolean }) {
  const tint = onMedia ? chatPalette.viewerText : chatPalette.bubbleMeta;
  return (
    <View style={[styles.meta, onMedia ? styles.metaOnMedia : null]} pointerEvents="none">
      {pinned ? <Ionicons name="pin" size={11} color={tint} /> : null}
      {message.starred ? <Ionicons name="star" size={11} color={tint} /> : null}
      {message.edited_at && !message.deleted ? <Text style={[styles.metaText, { color: tint }]} {...textScale.badge}>düzenlendi</Text> : null}
      <Text style={[styles.metaText, styles.metaClock, { color: tint }]} {...textScale.badge}>{clockTime(message.created_at)}</Text>
      <Ticks status={tickStatus(message)} color={tint} />
    </View>
  );
}

/** Metnin son satırında saat + tik için yer ayıran görünmez boşluk. */
/**
 * Balonun son satırında saat + tik için yer ayıran GÖRÜNMEZ metin. Boşluk
 * karakterleri dar olduğu (ve satır sonunda kırpılabildiği) için yer, gerçek
 * içerikle aynı genişlikteki karakterlerle ayrılır: saat "00:00", her simge "M".
 */
function metaSpacer(message: ChatMessage, pinned: boolean): string {
  let text = `${NBSP}${NBSP}${NBSP}00:00`;
  if (message.sender.is_me) text += `${NBSP}MM`;
  if (message.edited_at) text += `${NBSP}düzenlendi`;
  if (message.starred) text += `${NBSP}M`;
  if (pinned) text += `${NBSP}M`;
  return ` ${text}`;
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
      style={[styles.quote, { backgroundColor: message.sender.is_me ? chatPalette.quoteMine : chatPalette.quoteTheirs }]}
    >
      <View style={[styles.quoteBar, { backgroundColor: tint }]} />
      <View style={styles.quoteBody}>
        <View style={styles.quoteHead}>
          <Ionicons name="arrow-undo" size={10} color={tint} />
          <Text style={[styles.quoteName, { color: tint }]} numberOfLines={1} {...textScale.dense}>{reply.sender_name ?? "Üye"}</Text>
        </View>
        <View style={styles.quoteLine}>
          {summary.icon ? <Ionicons name={summary.icon} size={12} color={chatPalette.bubbleMeta} /> : null}
          <Text style={styles.quoteText} numberOfLines={2} {...textScale.dense}>{summary.text || "Mesaj"}</Text>
        </View>
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
      {/* Yüklenene kadar (ya da yüklenemezse) soluk fotoğraf simgesi görünür. */}
      <View style={styles.photoPlaceholder} pointerEvents="none">
        <Ionicons name="image-outline" size={28} color={chatPalette.bubbleMeta} />
      </View>
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

/** Uzantıya göre belge karosunun degradesi (PDF kırmızı, tablo nane, sunum altın…). */
function fileTone(ext: string, video: boolean): readonly [string, string] {
  if (video) return colors.tileTones.pink;
  if (ext === "PDF") return colors.tileTones.red;
  if (["XLS", "XLSX", "CSV"].includes(ext)) return colors.tileTones.mint;
  if (["PPT", "PPTX", "KEY"].includes(ext)) return colors.tileTones.gold;
  if (["DOC", "DOCX", "TXT", "RTF"].includes(ext)) return colors.tileTones.cyan;
  return colors.tileTones.violet;
}

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
      <View style={[styles.fileIcon, glowStyle(fileTone(ext, video)[1], 1)]}>
        <LinearGradient colors={fileTone(ext, video)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.fileIconFill]} />
        <Ionicons name={video ? "videocam" : "document-text"} size={18} color={colors.onDark} />
        {ext && !video ? <Text style={styles.fileExt} numberOfLines={1} {...textScale.badge}>{ext}</Text> : null}
      </View>
      <View style={styles.fileBody}>
        <Text style={styles.fileName} numberOfLines={2} {...textScale.dense}>{file?.name ?? "Belge"}</Text>
        <Text style={styles.fileMeta} numberOfLines={1} {...textScale.dense}>
          {[message.pending ? "Yükleniyor…" : null, formatBytes(file?.size), ext].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <View style={styles.fileAction}>
        <Ionicons name={message.pending ? "cloud-upload-outline" : "arrow-down"} size={16} color={chatPalette.bubbleText} />
      </View>
    </Touchable>
  );
}

/* ---------- sesli mesaj ---------- */

const SPEEDS = [1, 1.5, 2];
const SPEED_LABEL: Record<number, string> = { 1: "1×", 1.5: "1,5×", 2: "2×" };
/** Aynı anda tek sesli mesaj çalar: yeni başlayan öncekini duraklatır. */
let pauseCurrent: (() => void) | null = null;

function Wave({ bars, progress }: { bars: number[]; progress: number }) {
  const cut = Math.round(progress * bars.length);
  const half = bars.length / 2;
  return (
    <View style={styles.wave} pointerEvents="none">
      {bars.map((h, index) => (
        <View
          key={index}
          style={[
            styles.waveBar,
            // Çalınan kısım imza degradesini taklit eder: ilk yarı mor, ikinci yarı camgöbeği.
            { height: Math.round(4 + h * 20), backgroundColor: index < cut ? (index < half ? colors.gradientSignature[0] : colors.gradientSignature[1]) : chatPalette.waveIdle },
          ]}
        />
      ))}
    </View>
  );
}

function VoiceFrame({
  playing,
  played = false,
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
  /** Dinlenmeye başlandı: mikrofon simgesi yeşilden maviye döner (WhatsApp). */
  played?: boolean;
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
        style={[styles.voicePlay, disabled ? null : glowStyle(colors.glow, 1)]}
      >
        <LinearGradient colors={colors.gradientBrand} start={G_START} end={G_END} style={[StyleSheet.absoluteFill, styles.voicePlayFill]} />
        <Ionicons name={disabled ? "cloud-upload-outline" : playing ? "pause" : "play"} size={disabled ? 18 : 20} color={palette.textOnBrand} style={playing || disabled ? null : styles.playNudge} />
      </Touchable>
      <View style={styles.voiceBody}>
        <Wave bars={bars} progress={progress} />
        <Text style={styles.voiceTime} {...textScale.badge}>{label}</Text>
      </View>
      {onSpeed ? (
        <Touchable feedback="chip" haptic="selection" onPress={onSpeed} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Oynatma hızı ${SPEED_LABEL[speed ?? 1]}. Değiştirmek için dokun`} style={styles.speed}>
          <Text style={styles.speedText} {...textScale.badge}>{SPEED_LABEL[speed ?? 1]}</Text>
        </Touchable>
      ) : null}
      <View style={styles.voiceMic}>
        <Ionicons name="mic" size={13} color={played ? chatPalette.voiceMicPlayed : chatPalette.voiceMic} accessibilityLabel={played ? "Dinlendi" : "Sesli mesaj"} />
      </View>
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
      played
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

/** Harita önizlemesindeki "sokak" çizgileri (yüzde konumlar). */
const MAP_LINES: ViewStyle[] = [
  { top: "28%", left: 0, right: 0, height: 2 },
  { top: "68%", left: 0, right: 0, height: 1 },
  { left: "22%", top: 0, bottom: 0, width: 1 },
  { left: "64%", top: 0, bottom: 0, width: 2 },
  { left: "84%", top: 0, bottom: 0, width: 1 },
];

function LocationBody({ message, onLong }: { message: ChatMessage; onLong: () => void }) {
  const location = message.meta?.location;
  const title = location?.venue_name || location?.label || "Konum";
  return (
    <Touchable feedback="none" haptic="light" onPress={() => void openMap(location)} onLongPress={onLong} delayLongPress={260} accessibilityRole="link" accessibilityLabel={`${title}. Haritada açmak için dokun`} style={styles.location}>
      {/* Harita önizlemesi: gece mürekkebi zemin, ızgara sokaklar, parıltılı iğne. */}
      <View style={styles.locationMap}>
        <LinearGradient colors={colors.gradientInk} start={G_START} end={G_END} style={StyleSheet.absoluteFill} />
        {MAP_LINES.map((line, index) => (
          <View key={index} style={[styles.mapLine, line]} />
        ))}
        <View style={styles.pinHalo} />
        <View style={[styles.pin, glowStyle(colors.live, 2)]}>
          <Ionicons name="location" size={18} color={colors.onDark} />
        </View>
      </View>
      <View style={styles.locationBody}>
        <Text style={styles.fileName} numberOfLines={2} {...textScale.dense}>{title}</Text>
        {location?.address ? <Text style={styles.fileMeta} numberOfLines={2} {...textScale.dense}>{location.address}</Text> : null}
        <View style={styles.locationChip}>
          <Ionicons name="navigate" size={12} color={chatPalette.link} />
          <Text style={styles.locationLink} {...textScale.dense}>Haritada aç</Text>
        </View>
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
  /**
   * Satır tek erişilebilirlik öğesi mi? İçinde kendi düğmeleri olan satırlarda
   * (fotoğraf, ses, belge, kartlar) false verilir ki ekran okuyucu iç
   * düğmelere ulaşabilsin; seçim kipinde satırın tamamı tek öğedir.
   */
  whole?: boolean;
  /** Verilirse satır BUBBLE RISE girişini oynatır (oda açıldıktan sonra gelen mesaj). */
  message?: ChatMessage;
  /** Verilirse satır sağa çekilerek yanıtlanır. */
  onSwipeReply?: () => void;
}

const REPLY_TRIGGER = 64;

/** Hizalama, seçim işareti ve "mesaja git" vurgusu — balonlar ve kartlar ortak kullanır. */
export function RowShell({ mine, selecting, selected, highlighted, last, onPress, onLongPress, center, children, accessibilityLabel, whole = false, message, onSwipeReply }: RowShellProps) {
  const rise = useRise(message);
  const dx = useRef(new Animated.Value(0)).current;
  const armed = useRef(false);
  const replyRef = useRef(onSwipeReply);
  replyRef.current = onSwipeReply;
  const swipeable = Boolean(onSwipeReply) && !selecting && !center;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          const x = Math.max(0, g.dx);
          dx.setValue(x > REPLY_TRIGGER ? REPLY_TRIGGER + (x - REPLY_TRIGGER) * 0.3 : x);
          const now = x > REPLY_TRIGGER;
          if (now !== armed.current) {
            armed.current = now;
            if (now) fireHaptic("light");
          }
        },
        onPanResponderRelease: () => {
          if (armed.current) replyRef.current?.();
          armed.current = false;
          Animated.spring(dx, { toValue: 0, ...spring.slide }).start();
        },
        onPanResponderTerminate: () => {
          armed.current = false;
          Animated.spring(dx, { toValue: 0, ...spring.slide }).start();
        },
      }),
    [dx],
  );
  const arrow = {
    opacity: dx.interpolate({ inputRange: [0, 20, REPLY_TRIGGER], outputRange: [0, 0.3, 1], extrapolate: "clamp" }),
    transform: [{ scale: dx.interpolate({ inputRange: [0, REPLY_TRIGGER, REPLY_TRIGGER + 20], outputRange: [0.4, 1, 1.15], extrapolate: "clamp" }) }],
  };

  return (
    <Touchable
      feedback="none"
      haptic="none"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      accessible={selecting || whole}
      accessibilityRole={selecting ? "checkbox" : "text"}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={selecting ? undefined : whole ? "Mesaj seçenekleri için basılı tut" : undefined}
      accessibilityState={selecting ? { checked: selected } : undefined}
      style={[styles.row, last ? styles.rowLast : null, selected || highlighted ? styles.rowMarked : null]}
    >
      {selecting ? (
        <View style={styles.check}>
          <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? colors.brand : chatPalette.bubbleMeta} />
        </View>
      ) : null}
      {swipeable ? (
        <Animated.View pointerEvents="none" style={[styles.replyHint, arrow]}>
          <Ionicons name="arrow-undo" size={16} color={colors.brandAccent} />
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.rowBody, rise.style]} pointerEvents={selecting ? "none" : "box-none"}>
        <Animated.View
          style={[styles.rowSlide, center ? styles.rowCenter : mine ? styles.rowMine : styles.rowTheirs, swipeable ? { transform: [{ translateX: dx }] } : null]}
          pointerEvents="box-none"
          {...(swipeable ? responder.panHandlers : null)}
        >
          {children}
        </Animated.View>
      </Animated.View>
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
      whole={deleted || (kind === "text" && !message.reply_to)}
      accessibilityLabel={`${mine ? "Sen" : message.sender.name ?? "Üye"}: ${summary.text}, ${clockTime(message.created_at)}`}
      message={album ? album[album.length - 1] : message}
      onSwipeReply={actions.onReply && !deleted && message.id > 0 && !message.failed ? () => actions.onReply?.(message) : undefined}
    >
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, first ? (mine ? styles.tailCornerMine : styles.tailCornerTheirs) : null, mediaOnly ? styles.bubbleMedia : null, message.pending ? styles.bubblePending : null]}>
        {first ? <View style={[styles.tail, mine ? styles.tailMine : styles.tailTheirs]} pointerEvents="none" /> : null}
        {mine ? (
          <LinearGradient
            pointerEvents="none"
            colors={[chatPalette.bubbleMine, chatPalette.bubbleMineEdge]}
            start={G_START}
            end={G_END}
            style={[StyleSheet.absoluteFill, styles.bubbleFill, first ? styles.tailCornerMine : null]}
          />
        ) : null}
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

/** Gün hapı: cam kapsül, büyük harf etiket, iki yanında sönen ince çizgi. */
export const DayDivider = memo(function DayDivider({ label }: { label: string }) {
  return (
    <View style={styles.dayRow} accessibilityRole="header">
      <View style={styles.dayLine} />
      <View style={styles.dayPill}>
        <Ionicons name="calendar-clear-outline" size={11} color={chatPalette.dayText} />
        <Text style={styles.dayText} {...textScale.badge}>{label.toLocaleUpperCase("tr-TR")}</Text>
      </View>
      <View style={styles.dayLine} />
    </View>
  );
});

/** Okunmamış ayracı: imza degradesi çizgi + ortada mor kapsül. */
export const UnreadDivider = memo(function UnreadDivider({ count }: { count: number }) {
  return (
    <View style={styles.unreadRow}>
      <LinearGradient colors={colors.gradientSignature} start={G_START} end={G_END} style={styles.unreadLine} />
      <View style={[styles.unreadPill, glowStyle(colors.glow, 1)]}>
        <LinearGradient colors={colors.gradientBrand} start={G_START} end={G_END} style={[StyleSheet.absoluteFill, styles.unreadPillFill]} />
        <Ionicons name="arrow-down" size={11} color={palette.textOnBrand} />
        <Text style={styles.unreadText} {...textScale.badge}>{count > 0 ? `${count} okunmamış mesaj` : "Okunmamış mesajlar"}</Text>
      </View>
    </View>
  );
});

const TAIL = 7;
const BUBBLE_R = 18;

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.md, paddingVertical: space.px },
  rowLast: { paddingBottom: space.s },
  rowMarked: { backgroundColor: chatPalette.highlight },
  check: { width: 30, alignItems: "flex-start", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0 },
  rowSlide: { alignSelf: "stretch" },
  rowMine: { alignItems: "flex-end" },
  rowTheirs: { alignItems: "flex-start" },
  rowCenter: { alignItems: "stretch" },

  /* WhatsApp balonu: 8 px köşe, altta 1 px gölge çizgisi. Genişlik satırın en çok
     %84'ü: 360 pt ekranda seçim kipinde (30 pt işaret sütunu) 248 pt medya sığsın. */
  bubble: { maxWidth: "84%", minWidth: 76, borderRadius: BUBBLE_R, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm },
  /* Giden: degrade katmanı `bubbleFill` çizer; zemin rengi kuyruk ve yedek içindir. */
  bubbleMine: { backgroundColor: chatPalette.bubbleMine, ...glowStyle(colors.glow, 1), shadowOpacity: 0.18 },
  bubbleTheirs: { backgroundColor: chatPalette.bubbleTheirs, borderWidth: hairline, borderColor: chatPalette.bubbleLine },
  bubbleFill: { borderRadius: BUBBLE_R },
  bubbleMedia: { paddingHorizontal: space.xs, paddingTop: space.xs, paddingBottom: space.xs },
  bubblePending: { opacity: 0.86 },
  tailCornerMine: { borderTopRightRadius: radius.xs - 3 },
  tailCornerTheirs: { borderTopLeftRadius: radius.xs - 3 },
  tail: { position: "absolute", top: 0, width: 0, height: 0, borderTopWidth: TAIL, borderBottomWidth: 0, borderBottomColor: "transparent" },
  tailMine: { right: -TAIL + 1, borderTopColor: chatPalette.bubbleMine, borderRightWidth: TAIL, borderRightColor: "transparent" },
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
  metaClock: { ...type.numSm, fontSize: type.meta.fontSize, lineHeight: type.meta.lineHeight },
  metaFloat: { position: "absolute", right: space.sm, bottom: space.xs },
  metaFlow: { alignSelf: "flex-end", marginTop: space.xxs },
  metaOnMedia: { position: "absolute", right: space.sm, bottom: space.sm, paddingHorizontal: space.s, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: chatPalette.viewerChrome },

  quote: { flexDirection: "row", borderRadius: radius.md, overflow: "hidden", marginBottom: space.s, minWidth: 160, borderWidth: hairline, borderColor: chatPalette.bubbleLine },
  quoteBar: { width: 3 },
  quoteBody: { flexShrink: 1, paddingHorizontal: space.sm, paddingVertical: space.s, gap: space.px },
  quoteHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  quoteName: { ...type.labelXs },
  quoteLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  quoteText: { ...type.bodySm, color: chatPalette.bubbleMeta, flexShrink: 1 },

  photo: { borderRadius: radius.md, overflow: "hidden", backgroundColor: chatPalette.quoteTheirs },
  photoCaptioned: { marginBottom: space.xs },
  photoPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  photoBusy: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: chatPalette.viewerChrome },
  photoMore: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: chatPalette.viewerChrome },
  photoMoreText: { ...type.scoreMd, color: chatPalette.viewerText },
  album: { width: MEDIA_W, flexDirection: "row", flexWrap: "wrap", gap: space.xxs },

  file: { width: MEDIA_W, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, borderRadius: radius.md, borderWidth: hairline, borderColor: chatPalette.bubbleLine },
  fileIcon: { width: 42, height: 48, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", gap: space.px },
  fileIconFill: { borderRadius: radius.sm },
  fileExt: { ...type.nano, color: colors.onDark },
  fileAction: { width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: chatPalette.bubbleInset },
  fileBody: { flex: 1, minWidth: 0, gap: space.px },
  fileName: { ...type.label, color: chatPalette.bubbleText },
  fileMeta: { ...type.caption, color: chatPalette.bubbleMeta },

  voice: { width: MEDIA_W, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xxs },
  voicePlay: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  voicePlayFill: { borderRadius: radius.pill },
  playNudge: { marginLeft: 2 },
  voiceMic: { width: 22, height: 22, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: chatPalette.bubbleInset },
  voiceBody: { flex: 1, gap: space.xxs },
  wave: { height: 26, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  waveBar: { width: 3, borderRadius: 2 },
  voiceTime: { ...type.numSm, color: chatPalette.bubbleMeta },
  speed: { minWidth: 40, height: 24, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: chatPalette.bubbleInset },
  speedText: { ...type.labelXs, color: chatPalette.bubbleText },

  location: { width: MEDIA_W, borderRadius: radius.md, overflow: "hidden" },
  locationMap: { height: 110, alignItems: "center", justifyContent: "center", borderRadius: radius.md, overflow: "hidden" },
  mapLine: { position: "absolute", backgroundColor: colors.glassLine },
  pinHalo: { position: "absolute", width: 56, height: 56, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.live, opacity: 0.35 },
  pin: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.live },
  locationBody: { paddingTop: space.sm, paddingHorizontal: space.xxs, gap: space.px },
  locationChip: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs, alignSelf: "flex-start" },
  locationLink: { ...type.labelSm, color: chatPalette.link },

  reactions: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: -space.s, marginHorizontal: space.md, paddingHorizontal: space.sm, height: 24, borderRadius: radius.pill, backgroundColor: chatPalette.bubbleTheirs, borderWidth: 1.5, borderColor: chatPalette.wall },
  reactionsMine: { backgroundColor: colors.brandDim },
  reactionEmoji: { ...type.label, color: chatPalette.bubbleText },
  reactionCount: { ...type.numSmStrong, color: chatPalette.bubbleMeta },

  failed: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs },
  failedText: { ...type.labelXs, color: colors.danger },

  dayRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xl, paddingVertical: space.md },
  dayLine: { flex: 1, height: hairline, backgroundColor: chatPalette.bubbleLine },
  dayPill: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, height: 24, borderRadius: radius.pill, backgroundColor: chatPalette.dayPill, borderWidth: hairline, borderColor: colors.glassLine },
  dayText: { ...type.overline, color: chatPalette.dayText },
  unreadRow: { alignItems: "center", justifyContent: "center", paddingVertical: space.md, marginVertical: space.xs },
  unreadLine: { position: "absolute", left: space.xl, right: space.xl, height: 1.5, borderRadius: radius.pill, opacity: 0.7 },
  unreadPill: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, height: 24, borderRadius: radius.pill },
  unreadPillFill: { borderRadius: radius.pill },
  unreadText: { ...type.labelXs, color: palette.textOnBrand },
  replyHint: { position: "absolute", left: space.md, width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
});
