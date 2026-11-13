/**
 * YAZMA ALANI — WhatsApp işlevi, Gece dili (ikinci tur).
 *
 *   [ + ]  ( cam metin hapı ……………… 📷 )  ( degrade ➤ / 🎤 )
 *
 *   · Çubuk yarı saydam cam zemindir, üstünde ince ışık çizgisi. Solda cam
 *     daire "+" (ek menüsü), ortada cam metin hapı (odakta mor kenar), hapın
 *     içinde kamera; en sağda mor degrade, parıltılı yuvarlak düğme.
 *   · MİKROFONA DÖNÜŞEN DÜĞME: metin yokken mikrofon (basılı tut: sesli mesaj),
 *     metin yazılınca simge dönerek gönder okuna dönüşür (yaylı "pop").
 *   · ARROW LAUNCH: gönderince ok sağ üste fırlayıp kaybolur, ardından düğme
 *     mikrofona döner. Bunun için gönder düğmesi gönderimden sonra ~260 ms
 *     daha bağlı kalır.
 *
 *   · Metin durumu BURADA yaşar: her tuş vuruşunda yalnız bu bileşen çizilir,
 *     mesaj listesi çizilmez.
 *   · Sohbet başına taslak (lib/chatDrafts.ts): çıkıp dönünce metin durur.
 *   · Yanıt / düzenleme çubuğu, grupta "@" ile katılımcı önerisi.
 *   · Mikrofon: basılı tut → kayıt; sola kaydır → iptal; bırak → gönder.
 *     Kısa dokunuşta "basılı tut" ipucu gösterilir.
 *   · "Yazıyor…" bildirimi 2,5 sn'de bir, yazma durunca kapanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from "react-native";

import { Avatar, Touchable, errorMessage, fireHaptic } from "@/components/chat/kit";
import { useReduceMotion, useToast } from "@/components/ui";
import { formatDurationMs, type ChatMessage, type ChatParticipant } from "@/lib/api/chat";
import { getDraft, loadChatDrafts, setDraft } from "@/lib/chatDrafts";
import { MAX_VOICE_MS, useVoiceRecorder, type VoiceRecording } from "@/lib/chatMedia";
import { chatPalette, colors, senderColor, wa } from "@/lib/chatPalette";
import { emitTyping } from "@/lib/chatSocket";
import { extractMentions, insertMention, mentionQuery, messageSummary } from "@/lib/chatUtils";
import { easing, glowStyle, hairline, palette, radius, space, spring, textScale, type } from "@/theme";

/** Degrade yönü: sağdan sola (açık uç sağda). */
const G_START = { x: 1, y: 0.5 } as const;
const G_END = { x: 0, y: 0.5 } as const;
const LAUNCH_MS = 260;

/** Düğme simgesi takıldığında yaylanarak (dönerek) belirir: mikrofon ↔ ok dönüşümü. */
function MorphIcon({ children, spin = -60 }: { children: React.ReactNode; spin?: number }) {
  const reduceMotion = useReduceMotion();
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (!reduceMotion) Animated.spring(v, { toValue: 1, ...spring.pop }).start();
  }, [reduceMotion, v]);
  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { rotate: v.interpolate({ inputRange: [0, 1], outputRange: [`${spin}deg`, "0deg"] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

const TYPING_EVERY_MS = 2_500;
const TYPING_IDLE_MS = 4_000;
const CANCEL_DX = -90;
const MIN_HOLD_MS = 350;

export interface ComposerProps {
  conversationId: number;
  placeholder: string;
  /** Grup: "@" önerileri için katılımcılar (birebirde boş). */
  participants: ChatParticipant[];
  reply: ChatMessage | null;
  edit: ChatMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSendText: (text: string, mentions: number[]) => void;
  onSaveEdit: (text: string) => void;
  onAttach: () => void;
  /** Hap içindeki kamera: doğrudan fotoğraf çeker (verilmezse simge çizilmez). */
  onCamera?: () => void;
  onVoice: (recording: VoiceRecording) => void;
  /** Üye mesajları kutusu: yönetim adına yazarken "yazıyor" yayınlanmaz. */
  noTyping?: boolean;
}

export const Composer = memo(function Composer({ conversationId, placeholder, participants, reply, edit, onCancelReply, onCancelEdit, onSendText, onSaveEdit, onAttach, onCamera, onVoice, noTyping }: ComposerProps) {
  const toast = useToast();
  const recorder = useVoiceRecorder();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState(() => getDraft(conversationId));
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [recording, setRecording] = useState(false);
  const [willCancel, setWillCancel] = useState(false);
  const [launching, setLaunching] = useState(false);
  const launch = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  const typing = useRef<{ last: number; timer: ReturnType<typeof setTimeout> | null }>({ last: 0, timer: null });
  const hold = useRef({ active: false, startedAt: 0, cancel: false });
  const textRef = useRef(text);
  textRef.current = text;
  const editing = Boolean(edit);

  // Taslak diskten geç gelirse (ilk açılış) boş alana yerleştirilir.
  useEffect(() => {
    let alive = true;
    void loadChatDrafts().then(() => {
      if (alive && !textRef.current) setText(getDraft(conversationId));
    });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  // Düzenleme: mesaj metni alana gelir; vazgeçilince taslak geri yüklenir.
  const editId = edit?.id ?? null;
  useEffect(() => {
    if (editId != null) {
      setText(edit?.body ?? "");
      inputRef.current?.focus();
    } else setText(getDraft(conversationId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);
  const replyId = reply?.id ?? null;
  useEffect(() => {
    if (replyId != null) inputRef.current?.focus();
  }, [replyId]);

  const stopTyping = useCallback(() => {
    if (typing.current.timer) clearTimeout(typing.current.timer);
    typing.current.timer = null;
    if (typing.current.last) {
      typing.current.last = 0;
      if (!noTyping) emitTyping(conversationId, false);
    }
  }, [conversationId, noTyping]);
  useEffect(() => stopTyping, [stopTyping]);

  const onChangeText = useCallback(
    (value: string) => {
      setText(value);
      if (!editing) setDraft(conversationId, value);
      if (noTyping) return;
      if (!value.trim()) {
        stopTyping();
        return;
      }
      const now = Date.now();
      if (now - typing.current.last > TYPING_EVERY_MS) {
        typing.current.last = now;
        emitTyping(conversationId, true);
      }
      if (typing.current.timer) clearTimeout(typing.current.timer);
      typing.current.timer = setTimeout(stopTyping, TYPING_IDLE_MS);
    },
    [conversationId, editing, noTyping, stopTyping],
  );

  const onSelectionChange = useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => setCaret(event.nativeEvent.selection.end), []);

  /* ---------- @bahsetme ---------- */
  const mention = useMemo(() => (participants.length && focused ? mentionQuery(text, Math.min(caret, text.length)) : null), [caret, focused, participants.length, text]);
  const suggestions = useMemo(() => {
    if (!mention) return [];
    const needle = mention.query.toLocaleLowerCase("tr-TR");
    return participants.filter((p) => !p.is_me && p.name.toLocaleLowerCase("tr-TR").includes(needle)).slice(0, 5);
  }, [mention, participants]);
  const pickMention = useCallback(
    (person: ChatParticipant) => {
      if (!mention) return;
      const next = insertMention(text, mention.start, Math.min(caret, text.length), person.name);
      onChangeText(next);
      setCaret(mention.start + person.name.length + 2);
    },
    [caret, mention, onChangeText, text],
  );

  /* ---------- gönder ---------- */
  const trimmed = text.trim();
  const submit = useCallback(() => {
    const value = textRef.current.trim();
    if (!value) return;
    if (editing) onSaveEdit(value);
    else {
      onSendText(value, participants.length ? extractMentions(value, participants) : []);
      setDraft(conversationId, "");
    }
    setText("");
    stopTyping();
    // ARROW LAUNCH: ok sağ üste fırlar; düğme bu sürede bağlı kalır.
    if (!editing && !reduceMotion) {
      setLaunching(true);
      launch.setValue(0);
      Animated.timing(launch, { toValue: 1, duration: LAUNCH_MS, easing: easing.accelerate, useNativeDriver: true }).start(() => setLaunching(false));
    }
  }, [conversationId, editing, launch, onSaveEdit, onSendText, participants, reduceMotion, stopTyping]);

  /* ---------- sesli mesaj: basılı tut ---------- */
  const finishRecording = useCallback(
    async (cancel: boolean) => {
      setRecording(false);
      setWillCancel(false);
      try {
        const result = await recorder.stop(cancel);
        if (result) onVoice(result);
      } catch (error) {
        toast.show({ message: errorMessage(error), tone: "danger" });
      }
    },
    [onVoice, recorder, toast],
  );
  const finishRef = useRef(finishRecording);
  finishRef.current = finishRecording;
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const beginRecording = useCallback(async () => {
    hold.current = { active: true, startedAt: Date.now(), cancel: false };
    fireHaptic("medium");
    try {
      await recorderRef.current.start();
      // İzin penceresi açılırken parmak kalktıysa kayıt başlamadan bırakılır.
      if (!hold.current.active) {
        await recorderRef.current.stop(true);
        return;
      }
      setRecording(true);
    } catch (error) {
      hold.current.active = false;
      toast.show({ message: errorMessage(error), tone: "danger" });
    }
  }, [toast]);

  const endHold = useCallback(
    (cancelled: boolean) => {
      if (!hold.current.active) return;
      const heldMs = Date.now() - hold.current.startedAt;
      const cancel = cancelled || hold.current.cancel || heldMs < MIN_HOLD_MS;
      hold.current.active = false;
      if (heldMs < MIN_HOLD_MS) toast.show({ message: "Sesli mesaj için mikrofona basılı tut, bitince bırak.", tone: "neutral" });
      else if (cancel) fireHaptic("light");
      void finishRef.current(cancel);
    },
    [toast],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => void beginRecording(),
        onPanResponderMove: (_event, gesture) => {
          const cancel = gesture.dx < CANCEL_DX;
          if (cancel !== hold.current.cancel) {
            hold.current.cancel = cancel;
            setWillCancel(cancel);
            if (cancel) fireHaptic("warning");
          }
        },
        onPanResponderRelease: () => endHold(false),
        onPanResponderTerminate: () => endHold(true),
      }),
    [beginRecording, endHold],
  );

  // Azami süre dolunca kayıt kendiliğinden gönderilir.
  useEffect(() => {
    if (recording && recorder.durationMs >= MAX_VOICE_MS && hold.current.active) {
      hold.current.active = false;
      void finishRef.current(false);
    }
  }, [recorder.durationMs, recording]);
  // Ekrandan çıkılırsa süren kayıt iptal edilir.
  useEffect(() => () => void recorderRef.current.stop(true).catch(() => {}), []);

  const banner = edit ?? reply;
  const bannerSummary = banner ? messageSummary(banner) : null;
  const bannerTint = edit ? colors.brandAccent : senderColor(reply?.sender.user_id ?? reply?.sender.name);

  return (
    <View style={styles.wrap}>
      {suggestions.length ? (
        <View style={styles.mentions}>
          {suggestions.map((person) => (
            <Touchable key={person.user_id} feedback="row" haptic="selection" onPress={() => pickMention(person)} accessibilityRole="button" accessibilityLabel={`${person.name} kişisinden bahset`} style={styles.mentionRow}>
              <Avatar name={person.name} image={person.avatar} size={28} />
              <Text style={styles.mentionName} numberOfLines={1} {...textScale.dense}>{person.name}</Text>
              <Text style={styles.mentionSub} numberOfLines={1} {...textScale.dense}>{person.subtitle}</Text>
            </Touchable>
          ))}
        </View>
      ) : null}

      {banner && bannerSummary ? (
        <View style={styles.banner}>
          <View style={[styles.bannerBar, { backgroundColor: bannerTint }]} />
          <View style={styles.bannerBody}>
            <Text style={[styles.bannerTitle, { color: bannerTint }]} numberOfLines={1} {...textScale.dense}>
              {edit ? "Mesajı düzenle" : reply?.sender.is_me ? "Sen" : reply?.sender.name ?? "Üye"}
            </Text>
            <View style={styles.bannerLine}>
              {bannerSummary.icon ? <Ionicons name={bannerSummary.icon} size={12} color={colors.textSecondary} /> : null}
              <Text style={styles.bannerText} numberOfLines={1} {...textScale.dense}>{bannerSummary.text || "Mesaj"}</Text>
            </View>
          </View>
          <Touchable feedback="icon" haptic="light" onPress={edit ? onCancelEdit : onCancelReply} hitSlop={8} accessibilityRole="button" accessibilityLabel={edit ? "Düzenlemekten vazgeç" : "Yanıtlamaktan vazgeç"} style={styles.bannerClose}>
            <Ionicons name="close" size={20} color={wa.composerIcon} />
          </Touchable>
        </View>
      ) : null}

      <View style={styles.bar}>
        {editing || recording ? null : (
          <Touchable feedback="icon" haptic="light" onPress={onAttach} hitSlop={4} accessibilityRole="button" accessibilityLabel="Ek gönder: fotoğraf, video, konum, anket" style={styles.plus}>
            <Ionicons name="add" size={24} color={colors.textPrimary} />
          </Touchable>
        )}
        {recording ? (
          <View style={[styles.field, styles.recording]} accessibilityLiveRegion="polite">
            <View style={styles.recDot} />
            <Text style={styles.recTime} {...textScale.badge}>{formatDurationMs(recorder.durationMs || recorder.elapsedMs)}</Text>
            <View style={styles.recHint}>
              <Ionicons name={willCancel ? "trash" : "chevron-back"} size={15} color={willCancel ? colors.danger : wa.composerIcon} />
              <Text style={[styles.recHintText, willCancel ? styles.recCancel : null]} numberOfLines={1} {...textScale.dense}>
                {willCancel ? "Bırak: kayıt silinir" : "İptal için kaydır"}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.field, focused ? styles.fieldFocused : null]}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={onChangeText}
              onSelectionChange={onSelectionChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.brand}
              cursorColor={colors.brand}
              multiline
              maxLength={8000}
              accessibilityLabel="Mesaj metni"
              style={styles.input}
              {...textScale.dense}
            />
            {editing || trimmed || !onCamera ? null : (
              <Touchable feedback="icon" haptic="light" onPress={onCamera} hitSlop={4} accessibilityRole="button" accessibilityLabel="Kamerayla fotoğraf çek" style={[styles.fieldButton, styles.fieldButtonLast]}>
                <Ionicons name="camera-outline" size={21} color={wa.composerIcon} />
              </Touchable>
            )}
          </View>
        )}

        {trimmed || editing || launching ? (
          <Touchable feedback="fab" haptic="medium" onPress={submit} disabled={!trimmed} accessibilityRole="button" accessibilityLabel={editing ? "Düzenlemeyi kaydet" : "Gönder"} style={[styles.send, glowStyle(colors.glow, 2), !trimmed && !launching ? styles.sendOff : null]}>
            <LinearGradient colors={colors.gradientBrand} start={G_START} end={G_END} style={[StyleSheet.absoluteFill, styles.sendFill]} />
            <MorphIcon spin={-90}>
              <Animated.View
                style={{
                  opacity: launch.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                  transform: [
                    { translateX: launch.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
                    { translateY: launch.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
                    { rotate: launch.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-20deg"] }) },
                  ],
                }}
              >
                <Ionicons name={editing ? "checkmark" : "send"} size={editing ? 24 : 19} color={palette.textOnBrand} style={editing ? null : styles.sendGlyph} />
              </Animated.View>
            </MorphIcon>
          </Touchable>
        ) : (
          <View
            {...pan.panHandlers}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Sesli mesaj"
            accessibilityHint="Kaydetmek için basılı tut, göndermek için bırak, iptal için sola kaydır"
            style={[styles.send, glowStyle(willCancel ? colors.danger : colors.glow, recording ? 3 : 1), recording ? styles.sendRecording : null]}
          >
            {willCancel ? <View style={[StyleSheet.absoluteFill, styles.sendFill, styles.sendCancel]} /> : <LinearGradient colors={colors.gradientBrand} start={G_START} end={G_END} style={[StyleSheet.absoluteFill, styles.sendFill]} />}
            <MorphIcon spin={60}>
              <Ionicons name={recorder.busy ? "ellipsis-horizontal" : willCancel ? "trash" : "mic"} size={recording ? 24 : 22} color={palette.textOnBrand} />
            </MorphIcon>
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  /* Çubuk duvar kâğıdı rengindedir (WhatsApp): üst çizgi yok, hap zeminden ayrışır. */
  /* Cam çubuk: yarı saydam zemin + üstte ince ışık çizgisi. */
  wrap: { backgroundColor: colors.glass, borderTopWidth: hairline, borderTopColor: colors.glassLine },
  bar: { flexDirection: "row", alignItems: "flex-end", gap: space.s, paddingHorizontal: space.sm, paddingTop: space.sm, paddingBottom: space.sm },
  plus: { width: 44, height: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3, borderWidth: hairline, borderColor: colors.glassLine },
  field: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "flex-end", borderRadius: radius.xxl, backgroundColor: wa.composerField, borderWidth: 1, borderColor: colors.glassLine },
  fieldFocused: { borderColor: colors.brandBorder },
  fieldButton: { width: 40, height: 46, alignItems: "center", justifyContent: "center" },
  fieldButtonLast: { marginRight: space.xs },
  clip: { transform: [{ rotate: "-45deg" }] },
  input: {
    ...type.body,
    fontSize: type.article.fontSize,
    flex: 1,
    minHeight: 46,
    maxHeight: 132,
    color: colors.textPrimary,
    paddingTop: space.md,
    paddingBottom: space.md,
    paddingRight: space.xs,
    paddingLeft: space.lg,
    textAlignVertical: "center",
    ...({ outlineStyle: "none" } as object),
  },
  send: { width: 46, height: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  sendFill: { borderRadius: radius.pill },
  /* Kâğıt uçak simgesinin görsel ağırlığı solda; 2 px sağa alınca daireye oturur. */
  sendGlyph: { marginLeft: space.xxs },
  sendOff: { opacity: 0.5 },
  sendRecording: { transform: [{ scale: 1.25 }] },
  sendCancel: { backgroundColor: colors.danger },

  recording: { alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, minHeight: 46, borderColor: colors.dangerDim },
  recDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.danger },
  recTime: { ...type.tableNum, fontSize: type.bodyLg.fontSize, color: colors.textPrimary, minWidth: 44 },
  recHint: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space.xs },
  recHintText: { ...type.bodySm, color: colors.textSecondary },
  recCancel: { color: colors.danger },

  /* Yanıt / düzenleme çubuğu: hap renginde kart, solda renkli çubuk (yanıtta gönderenin rengi, düzenlemede yeşil). */
  banner: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.sm, marginTop: space.sm, borderRadius: radius.lg, backgroundColor: wa.composerField, borderWidth: hairline, borderColor: colors.glassLine, overflow: "hidden" },
  bannerBar: { width: 4, alignSelf: "stretch" },
  bannerBody: { flex: 1, minWidth: 0, paddingVertical: space.s, gap: space.px },
  bannerTitle: { ...type.labelSm },
  bannerLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  bannerText: { ...type.bodySm, color: colors.textSecondary, flexShrink: 1 },
  bannerClose: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  mentions: { marginHorizontal: space.sm, marginTop: space.sm, borderRadius: radius.lg, backgroundColor: wa.composerField, borderWidth: hairline, borderColor: colors.border, overflow: "hidden" },
  mentionRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, minHeight: 44 },
  mentionName: { ...type.label, color: colors.textPrimary, flexShrink: 1 },
  mentionSub: { ...type.caption, color: colors.textTertiary, flex: 1 },
});
