/**
 * ZENGİN MESAJLAR — anket, fotoğraf/belge ve yönetimin hazır içerik kartları.
 *
 * Web ve masaüstü Mesajlar bu türleri gönderebiliyordu; mobil sohbet ise
 * hepsini düz metin balonu olarak (sunucunun simgeli yedek gövdesiyle)
 * gösteriyor, ankete oy verilemiyor, "Ben talibim" anketine telefondan talip
 * olunamıyordu. Buradaki kartlar o boşluğu kapatır:
 *
 *   PollBubble     anket: seçeneğe dokun → oy (tek/çok seçimli), canlı yüzdeler
 *   FileBubble     fotoğraf (önizleme, dokununca tam boy) ve belge (dokununca açılır)
 *   MatchesCard    "Günün maçları" kartı; maça dokununca maç sayfası
 *   SignupCard     "Ben talibim" görev anketi: satır satır talip ol / vazgeç
 *   AwardPollCard  Haftanın Enleri aday çağrısı → Yapılacaklar'daki aday kartı
 *
 * Oylar ve talipler sunucudan `chat:message:updated` olayıyla canlı güncellenir
 * (hooks/useChat.ts); kartlar yalnız `message.meta`yı çizer.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { memo } from "react";
import { Image, Linking, StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import { getAwardStatus, type ChatMessage } from "@/lib/api/chat";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};
const dayLabel = (ymd: string | null | undefined) => {
  if (!ymd) return "";
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
};

function Frame({ message, showSender, icon, label, children }: { message: ChatMessage; showSender?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; children: React.ReactNode }) {
  const mine = message.sender.is_me;
  return (
    <View style={[styles.card, mine ? styles.mine : styles.theirs]}>
      <View style={styles.head}>
        <Ionicons name={icon} size={14} color={colors.brandAccent} />
        <Text style={styles.kind} numberOfLines={1} {...textScale.badge}>
          {label}
        </Text>
        <Text style={styles.stamp} {...textScale.badge}>
          {showSender || !mine ? `${message.sender.is_management ? "ElitLig Yönetimi" : message.sender.name ?? "Üye"} · ` : ""}
          {clock(message.created_at)}
        </Text>
      </View>
      {children}
    </View>
  );
}

/* ═══════════════════════════ ANKET ═══════════════════════════ */

export const PollBubble = memo(function PollBubble({
  message,
  showSender,
  viewerId,
  busy,
  onVote,
  onVoters,
}: {
  message: ChatMessage;
  showSender?: boolean;
  viewerId: number | null | undefined;
  busy: boolean;
  onVote: (message: ChatMessage, optionIds: string[]) => void;
  /** Kimlerin hangi seçeneğe oy verdiğini açar. */
  onVoters?: (message: ChatMessage) => void;
}) {
  const poll = message.meta?.poll;
  if (!poll) return null;
  const votes = poll.votes ?? {};
  const voters = new Set<number>();
  Object.values(votes).forEach((list) => (list ?? []).forEach((id) => voters.add(Number(id))));
  const total = voters.size;
  const mineIds = poll.options.filter((o) => (votes[o.id] ?? []).some((id) => Number(id) === Number(viewerId))).map((o) => o.id);

  const press = (optionId: string) => {
    if (busy) return;
    const has = mineIds.includes(optionId);
    if (poll.multiple) onVote(message, has ? mineIds.filter((id) => id !== optionId) : [...mineIds, optionId]);
    else onVote(message, has ? [] : [optionId]);
  };

  return (
    <Frame message={message} showSender={showSender} icon="stats-chart" label={poll.multiple ? "Anket · çok seçimli" : "Anket"}>
      <Text style={styles.title} {...textScale.long}>
        {poll.question}
      </Text>
      <View style={styles.options}>
        {poll.options.map((option) => {
          const count = (votes[option.id] ?? []).length;
          const share = total ? count / total : 0;
          const selected = mineIds.includes(option.id);
          return (
            <Touchable
              key={option.id}
              feedback="chip"
              haptic="selection"
              onPress={() => press(option.id)}
              disabled={busy}
              accessibilityRole={poll.multiple ? "checkbox" : "radio"}
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${option.text}, ${count} oy`}
              style={[styles.option, selected ? styles.optionSelected : null]}
            >
              <View style={[styles.optionFill, { width: `${Math.round(share * 100)}%` }]} pointerEvents="none" />
              <Ionicons
                name={selected ? (poll.multiple ? "checkbox" : "radio-button-on") : poll.multiple ? "square-outline" : "radio-button-off"}
                size={18}
                color={selected ? colors.brandAccent : colors.textTertiary}
              />
              <Text style={styles.optionText} {...textScale.dense}>
                {option.text}
              </Text>
              <Text style={styles.optionCount} {...textScale.badge}>
                {count}
              </Text>
            </Touchable>
          );
        })}
      </View>
      <Text style={styles.muted} {...textScale.dense}>
        {total ? `${total} kişi oy verdi` : "Henüz oy yok"}
        {mineIds.length ? " · oyunu değiştirmek için başka seçeneğe, geri almak için aynı seçeneğe dokun" : ""}
      </Text>
      {onVoters && total ? (
        <Touchable feedback="chip" haptic="selection" onPress={() => onVoters(message)} style={styles.slotBtn} accessibilityRole="button" accessibilityLabel="Oyları gör">
          <Ionicons name="people-outline" size={14} color={colors.brandAccent} />
          <Text style={styles.slotBtnText} {...textScale.badge}>
            Oyları gör
          </Text>
        </Touchable>
      ) : null}
    </Frame>
  );
});

/* ═══════════════════════════ FOTOĞRAF / BELGE ═══════════════════════════ */

const sizeLabel = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : bytes ? `${bytes} B` : "");

export const FileBubble = memo(function FileBubble({ message, showSender, onOpenError }: { message: ChatMessage; showSender?: boolean; onOpenError: () => void }) {
  const file = message.meta?.file;
  if (!file) return null;
  const image = message.kind === "image";
  const open = () => void Linking.openURL(file.url).catch(onOpenError);
  const ratio = file.width && file.height ? Math.min(1.6, Math.max(0.6, file.width / file.height)) : 4 / 3;
  return (
    <Frame message={message} showSender={showSender} icon={image ? "image" : "document-attach"} label={image ? "Fotoğraf" : "Belge"}>
      {image ? (
        <Touchable feedback="card" onPress={open} accessibilityRole="imagebutton" accessibilityLabel={`Fotoğraf${message.meta?.caption ? `: ${message.meta.caption}` : ""}. Tam boy açmak için dokun`}>
          <Image source={{ uri: file.url }} style={[styles.image, { aspectRatio: ratio }]} resizeMode="cover" />
        </Touchable>
      ) : (
        <Touchable feedback="row" onPress={open} style={styles.fileRow} accessibilityRole="link" accessibilityLabel={`${file.name} belgesini aç`}>
          <Ionicons name="document-text-outline" size={26} color={colors.brandAccent} />
          <View style={styles.flex}>
            <Text style={styles.fileName} numberOfLines={2} {...textScale.dense}>
              {file.name}
            </Text>
            <Text style={styles.muted} {...textScale.dense}>
              {[sizeLabel(file.size), "Açmak için dokun"].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textTertiary} />
        </Touchable>
      )}
      {message.meta?.caption ? (
        <Text style={styles.body} {...textScale.long}>
          {message.meta.caption}
        </Text>
      ) : null}
    </Frame>
  );
});

/* ═══════════════════════════ GÜNÜN MAÇLARI ═══════════════════════════ */

export const MatchesCard = memo(function MatchesCard({ message, showSender, onOpenMatch }: { message: ChatMessage; showSender?: boolean; onOpenMatch: (matchId: number) => void }) {
  const data = message.meta?.matches;
  if (!data) return null;
  return (
    <Frame message={message} showSender={showSender} icon="football" label="Günün maçları">
      <Text style={styles.title} {...textScale.dense}>
        {dayLabel(data.date) || "Maç programı"}
      </Text>
      {data.note ? (
        <Text style={styles.body} {...textScale.long}>
          {data.note}
        </Text>
      ) : null}
      <View style={styles.rows}>
        {data.items.map((match, index) => {
          const played = match.home_score != null && match.away_score != null;
          return (
            <Touchable
              key={match.id}
              feedback="row"
              onPress={() => onOpenMatch(match.id)}
              style={[styles.matchRow, index ? styles.divided : null]}
              accessibilityRole="link"
              accessibilityLabel={`${match.home} - ${match.away}${match.time ? `, saat ${match.time}` : ""}`}
            >
              <Text style={styles.matchTime} {...textScale.badge}>
                {played ? `${match.home_score}-${match.away_score}` : match.time ?? "—"}
              </Text>
              <View style={styles.flex}>
                <Text style={styles.matchTeams} numberOfLines={2} {...textScale.dense}>
                  {match.home} – {match.away}
                </Text>
                {match.field || match.league ? (
                  <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                    {[match.field, match.league].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Touchable>
          );
        })}
      </View>
    </Frame>
  );
});

/* ═══════════════════════════ BEN TALİBİM ═══════════════════════════ */

export const SignupCard = memo(function SignupCard({
  message,
  showSender,
  viewerId,
  busySlot,
  onToggle,
  onAssignMenu,
  onCloseToggle,
}: {
  message: ChatMessage;
  showSender?: boolean;
  viewerId: number | null | undefined;
  busySlot: string | null;
  onToggle: (message: ChatMessage, slotId: string, on: boolean) => void;
  /** Görevlendirme yetkisi (staff.assign) varsa: satırın talipleri arasından görevli seçilir. */
  onAssignMenu?: (message: ChatMessage, slotId: string) => void;
  /** Anketi gönderen kapatıp yeniden açabilir. */
  onCloseToggle?: (message: ChatMessage, closed: boolean) => void;
}) {
  const signup = message.meta?.signup;
  if (!signup) return null;
  return (
    <Frame message={message} showSender={showSender} icon="hand-left" label={signup.closed ? "Görev anketi · kapandı" : "Görev anketi"}>
      <Text style={styles.title} {...textScale.long}>
        {signup.title}
      </Text>
      {signup.note ? (
        <Text style={styles.body} {...textScale.long}>
          {signup.note}
        </Text>
      ) : null}
      <View style={styles.rows}>
        {signup.slots.map((slot, index) => {
          const volunteers = signup.volunteers?.[slot.id] ?? [];
          const mine = volunteers.some((v) => Number(v.user_id) === Number(viewerId));
          const assigned = slot.assigned?.name;
          return (
            <View key={slot.id} style={[styles.slot, index ? styles.divided : null]}>
              <View style={styles.flex}>
                <Text style={styles.matchTeams} numberOfLines={2} {...textScale.dense}>
                  {slot.duty_label} · {slot.match.home} – {slot.match.away}
                </Text>
                <Text style={styles.muted} numberOfLines={2} {...textScale.dense}>
                  {[dayLabel(slot.match.date), slot.match.time, slot.match.field].filter(Boolean).join(" · ")}
                </Text>
                <Text style={[styles.muted, assigned ? styles.assigned : null]} numberOfLines={2} {...textScale.dense}>
                  {assigned ? `Görevli: ${assigned}` : volunteers.length ? `Talip: ${volunteers.map((v) => v.name).join(", ")}` : "Henüz talip yok"}
                </Text>
              </View>
              {!signup.closed && !assigned ? (
                <Touchable
                  feedback="chip"
                  haptic="selection"
                  onPress={() => onToggle(message, slot.id, !mine)}
                  disabled={busySlot === slot.id}
                  accessibilityRole="button"
                  accessibilityLabel={mine ? `${slot.duty_label} görevinden vazgeç` : `${slot.duty_label} görevine talip ol`}
                  style={[styles.slotBtn, mine ? styles.slotBtnOn : null, busySlot === slot.id ? styles.dim : null]}
                >
                  <Ionicons name={mine ? "checkmark" : "hand-left-outline"} size={14} color={mine ? colors.textOnBrand : colors.brandAccent} />
                  <Text style={[styles.slotBtnText, mine ? styles.slotBtnTextOn : null]} {...textScale.badge}>
                    {mine ? "Talibim" : "Talip ol"}
                  </Text>
                </Touchable>
              ) : null}
              {onAssignMenu && (assigned || volunteers.length) ? (
                <Touchable
                  feedback="icon"
                  haptic="selection"
                  onPress={() => onAssignMenu(message, slot.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={assigned ? `${slot.duty_label} görevlisini değiştir` : `${slot.duty_label} için görevlendir`}
                  style={styles.slotIcon}
                >
                  <Ionicons name={assigned ? "person-circle" : "person-add-outline"} size={20} color={assigned ? colors.win : colors.brandAccent} />
                </Touchable>
              ) : null}
            </View>
          );
        })}
      </View>
      {onCloseToggle && message.sender.is_me ? (
        <Touchable feedback="chip" haptic="selection" onPress={() => onCloseToggle(message, !signup.closed)} style={styles.slotBtn} accessibilityRole="button" accessibilityLabel={signup.closed ? "Anketi yeniden aç" : "Anketi kapat"}>
          <Ionicons name={signup.closed ? "lock-open-outline" : "lock-closed-outline"} size={14} color={colors.brandAccent} />
          <Text style={styles.slotBtnText} {...textScale.badge}>
            {signup.closed ? "Anketi yeniden aç" : "Anketi kapat"}
          </Text>
        </Touchable>
      ) : null}
    </Frame>
  );
});

/* ═══════════════════════════ HAFTANIN ENLERİ ═══════════════════════════ */

export const AwardPollCard = memo(function AwardPollCard({ message, showSender, onOpenTodos }: { message: ChatMessage; showSender?: boolean; onOpenTodos?: () => void }) {
  const award = message.meta?.award;
  // İlerleme: kimler aday önerisini gönderdi (yalnız yönetim hesapları görür; üyede sorgu 403 döner ve satır çizilmez).
  const status = useQuery({
    queryKey: ["chat", "award-status", message.conversation_id, message.id] as const,
    queryFn: () => getAwardStatus(message.conversation_id, message.id),
    enabled: Boolean(onOpenTodos) && message.id > 0,
    staleTime: 30_000,
    retry: false,
  });
  const total = status.data?.total ?? 0;
  const submitted = status.data?.submitted ?? 0;
  const waiting = (status.data?.people ?? []).filter((person) => !person.submitted);
  const mineTask = Boolean(status.data?.my_task_id);
  const coordinator = Boolean(status.data?.coordination_task_id);
  return (
    <Frame message={message} showSender={showSender} icon="trophy" label="Haftanın Enleri">
      <Text style={styles.title} {...textScale.long}>
        {award?.week ? `${award.week}: adaylarını öner` : "Adaylarını öner"}
      </Text>
      {award?.note ? (
        <Text style={styles.body} {...textScale.long}>
          {award.note}
        </Text>
      ) : null}
      {total ? (
        <View style={styles.progressBox}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round((submitted / total) * 100)}%` }]} />
          </View>
          <Text style={styles.muted} {...textScale.dense}>
            {submitted === total ? `${total}/${total} öneri geldi · hepsi tamam` : `${submitted}/${total} öneri geldi`}
            {waiting.length && submitted !== total ? ` · bekleyen: ${waiting.map((person) => person.name).join(", ")}` : ""}
          </Text>
        </View>
      ) : null}
      <Text style={styles.muted} {...textScale.dense}>
        {coordinator
          ? "Önerileri Yapılacaklar'daki koordinasyon kartında toplayıp listeyi yayına alırsın."
          : mineTask
            ? "Aday önerin Yapılacaklar'daki “Aday önerisi” kartından gönderilir."
            : "Aday önerileri Yapılacaklar'daki “Aday önerisi” kartından gönderilir."}
      </Text>
      {onOpenTodos ? (
        <Touchable feedback="chip" onPress={onOpenTodos} style={styles.slotBtn} accessibilityRole="button" accessibilityLabel="Yapılacaklar'ı aç">
          <Ionicons name="checkbox-outline" size={14} color={colors.brandAccent} />
          <Text style={styles.slotBtnText} {...textScale.badge}>
            {coordinator ? "Önerileri topla" : mineTask ? "Adaylarını öner" : "Yapılacaklar'ı aç"}
          </Text>
        </Touchable>
      ) : null}
    </Frame>
  );
});

const styles = StyleSheet.create({
  slotIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  progressBox: { gap: space.xs },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  flex: { flex: 1, minWidth: 0 },
  card: {
    width: "88%",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  mine: { alignSelf: "flex-end", borderColor: colors.brandBorder },
  theirs: { alignSelf: "flex-start" },
  head: { flexDirection: "row", alignItems: "center", gap: space.xs },
  kind: { ...type.micro, color: colors.brandAccent, flex: 1 },
  stamp: { ...type.micro, color: colors.textTertiary },
  title: { ...type.h4, color: colors.textPrimary },
  body: { ...type.bodySm, color: colors.textPrimary },
  muted: { ...type.caption, color: colors.textTertiary },
  assigned: { color: colors.win },
  options: { gap: space.xs },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  optionSelected: { borderColor: colors.brandBorder },
  optionFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.brandDim },
  optionText: { ...type.bodySm, color: colors.textPrimary, flex: 1, paddingVertical: space.sm },
  optionCount: { ...type.numSmStrong, color: colors.textSecondary },
  image: { width: "100%", borderRadius: radius.md, backgroundColor: colors.surface3 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 },
  fileName: { ...type.h4, color: colors.textPrimary },
  rows: { borderRadius: radius.md, borderWidth: hairline, borderColor: colors.border, overflow: "hidden" },
  divided: { borderTopWidth: hairline, borderTopColor: colors.separator },
  matchRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48 },
  matchTime: { ...type.numSmStrong, color: colors.textPrimary, width: 44 },
  matchTeams: { ...type.labelSm, color: colors.textPrimary },
  slot: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  slotBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xs,
    minHeight: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    backgroundColor: colors.brandDim,
  },
  slotBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  slotBtnText: { ...type.labelSm, color: colors.brandAccent },
  slotBtnTextOn: { color: colors.textOnBrand },
  dim: { opacity: 0.5 },
});
