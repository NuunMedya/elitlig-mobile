/**
 * YAZMA ALANI — WhatsApp düzeni: "+" ek düğmesi, büyüyen metin kutusu, gönder
 * ya da (metin yokken) basılı tutarak sesli mesaj.
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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from "react-native";

import { Avatar, Touchable, errorMessage, fireHaptic, useToast } from "@/components/ui";
import { formatDurationMs, type ChatMessage, type ChatParticipant } from "@/lib/api/chat";
import { getDraft, loadChatDrafts, setDraft } from "@/lib/chatDrafts";
import { MAX_VOICE_MS, useVoiceRecorder, type VoiceRecording } from "@/lib/chatMedia";
import { chatPalette, senderColor } from "@/lib/chatPalette";
import { emitTyping } from "@/lib/chatSocket";
import { extractMentions, insertMention, mentionQuery, messageSummary } from "@/lib/chatUtils";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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
  onVoice: (recording: VoiceRecording) => void;
  /** Üye mesajları kutusu: yönetim adına yazarken "yazıyor" yayınlanmaz. */
  noTyping?: boolean;
}

export const Composer = memo(function Composer({ conversationId, placeholder, participants, reply, edit, onCancelReply, onCancelEdit, onSendText, onSaveEdit, onAttach, onVoice, noTyping }: ComposerProps) {
  const toast = useToast();
  const recorder = useVoiceRecorder();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState(() => getDraft(conversationId));
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [recording, setRecording] = useState(false);
  const [willCancel, setWillCancel] = useState(false);
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
  }, [conversationId, editing, onSaveEdit, onSendText, participants, stopTyping]);

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
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Touchable>
        </View>
      ) : null}

      <View style={styles.bar}>
        {recording ? (
          <View style={[styles.field, styles.recording]} accessibilityLiveRegion="polite">
            <View style={styles.recDot} />
            <Text style={styles.recTime} {...textScale.badge}>{formatDurationMs(recorder.durationMs || recorder.elapsedMs)}</Text>
            <View style={styles.recHint}>
              <Ionicons name={willCancel ? "trash" : "chevron-back"} size={15} color={willCancel ? colors.danger : colors.textTertiary} />
              <Text style={[styles.recHintText, willCancel ? styles.recCancel : null]} numberOfLines={1} {...textScale.dense}>
                {willCancel ? "Bırak: kayıt silinir" : "İptal için sola kaydır"}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.field}>
            {editing ? null : (
              <Touchable feedback="icon" haptic="light" onPress={onAttach} hitSlop={6} accessibilityRole="button" accessibilityLabel="Ek gönder: fotoğraf, belge, konum, anket" style={styles.fieldButton}>
                <Ionicons name="add" size={26} color={colors.textSecondary} />
              </Touchable>
            )}
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={onChangeText}
              onSelectionChange={onSelectionChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={8000}
              accessibilityLabel="Mesaj metni"
              style={[styles.input, editing ? styles.inputEditing : null]}
              {...textScale.dense}
            />
          </View>
        )}

        {trimmed || editing ? (
          <Touchable feedback="button" haptic="medium" onPress={submit} disabled={!trimmed} accessibilityRole="button" accessibilityLabel={editing ? "Düzenlemeyi kaydet" : "Gönder"} style={[styles.send, !trimmed ? styles.sendOff : null]}>
            <Ionicons name={editing ? "checkmark" : "send"} size={editing ? 22 : 18} color={colors.textOnBrand} />
          </Touchable>
        ) : (
          <View
            {...pan.panHandlers}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Sesli mesaj"
            accessibilityHint="Kaydetmek için basılı tut, göndermek için bırak, iptal için sola kaydır"
            style={[styles.send, recording ? styles.sendRecording : null, willCancel ? styles.sendCancel : null]}
          >
            <Ionicons name={recorder.busy ? "ellipsis-horizontal" : "mic"} size={recording ? 24 : 20} color={colors.textOnBrand} />
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { backgroundColor: chatPalette.composerBar, borderTopWidth: hairline, borderTopColor: colors.separator },
  bar: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.s },
  field: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "flex-end", borderRadius: radius.xxl + space.xxs, backgroundColor: chatPalette.composerField, borderWidth: hairline, borderColor: colors.border },
  fieldButton: { width: 42, height: 44, alignItems: "center", justifyContent: "center" },
  input: {
    ...type.body,
    fontSize: type.bodyLg.fontSize,
    flex: 1,
    minHeight: 44,
    maxHeight: 128,
    color: colors.textPrimary,
    paddingTop: space.m + space.px,
    paddingBottom: space.m + space.px,
    paddingRight: space.lg,
    paddingLeft: 0,
    textAlignVertical: "center",
    ...({ outlineStyle: "none" } as object),
  },
  inputEditing: { paddingLeft: space.lg },
  send: { width: 46, height: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  sendOff: { opacity: 0.5 },
  sendRecording: { transform: [{ scale: 1.25 }], backgroundColor: colors.danger },
  sendCancel: { backgroundColor: colors.textTertiary },

  recording: { alignItems: "center", gap: space.sm, paddingHorizontal: space.lg },
  recDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.danger },
  recTime: { ...type.tableNumStrong, color: colors.textPrimary, minWidth: 40 },
  recHint: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space.xs },
  recHintText: { ...type.caption, color: colors.textTertiary },
  recCancel: { color: colors.danger },

  banner: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.sm, marginTop: space.s, borderRadius: radius.md, backgroundColor: chatPalette.composerField, overflow: "hidden" },
  bannerBar: { width: 4, alignSelf: "stretch" },
  bannerBody: { flex: 1, minWidth: 0, paddingVertical: space.s, gap: space.px },
  bannerTitle: { ...type.labelSm },
  bannerLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  bannerText: { ...type.bodySm, color: colors.textSecondary, flexShrink: 1 },
  bannerClose: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  mentions: { marginHorizontal: space.sm, marginTop: space.s, borderRadius: radius.md, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border, overflow: "hidden" },
  mentionRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, minHeight: 44 },
  mentionName: { ...type.label, color: colors.textPrimary, flexShrink: 1 },
  mentionSub: { ...type.caption, color: colors.textTertiary, flex: 1 },
});
