/**
 * ZENGİN MESAJLAR — anket, fotoğraf/belge ve yönetimin hazır içerik kartları.
 *
 * Web ve masaüstü Mesajlar bu türleri gönderebiliyordu; mobil sohbet ise
 * hepsini düz metin balonu olarak (sunucunun simgeli yedek gövdesiyle)
 * gösteriyor, ankete oy verilemiyor, "Ben talibim" anketine telefondan talip
 * olunamıyordu. Buradaki kartlar o boşluğu kapatır:
 *
 *   PollBubble     anket: seçeneğe dokun → oy (tek/çok seçimli), canlı yüzdeler
 *   MatchesCard    "Günün maçları" kartı; maça dokununca maç sayfası
 *   SignupCard     "Ben talibim" görev anketi: satır satır talip ol / vazgeç
 *   AwardPollCard  Haftanın Enleri aday çağrısı → Yapılacaklar'daki aday kartı
 *
 * GECE DİLİ (ikinci tur): kart 20 px köşeli; giden kart mor degrade, gelen
 * kart yüzey + ışıklı kenar. Başlıkta degrade ikon karosu + tür etiketi.
 * Anket seçenekleri yüzde ve imza degradesi çubuk (GradientBar) taşır; en çok
 * oy alan seçenek "önde" işaretlenir. Maç kartı saat karosu + alt alta iki
 * takım + saha / lig satırıyla bilet gibi okunur.
 *
 * Oylar ve talipler sunucudan `chat:message:updated` olayıyla canlı güncellenir
 * (hooks/useChat.ts); kartlar yalnız `message.meta`yı çizer.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { Touchable } from "@/components/chat/kit";
import { GradientBar, IconTile, type IconTileTone } from "@/components/ui";
import { getAwardStatus, type ChatMessage } from "@/lib/api/chat";
import { chatPalette, colors } from "@/lib/chatPalette";
import { fonts, glowStyle, hairline, palette, radius, space, textScale, type } from "@/theme";

/** Degrade yönü: sağdan sola (açık uç sağda). */
const G_START = { x: 1, y: 0.5 } as const;
const G_END = { x: 0, y: 0.5 } as const;

/**
 * Kartlar balon renklerinde durur (giden yeşil, gelen beyaz / gri). Vurgu rengi
 * iki balonda da 4,5:1 okunan tondur; gömme zemin ve çizgiler yarı saydamdır,
 * böylece aynı stil iki tarafta da çalışır.
 */
const ACCENT = chatPalette.bubbleAccentMine;

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};
const dayLabel = (ymd: string | null | undefined) => {
  if (!ymd) return "";
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
};

/** Kart türüne göre başlık karosunun tonu. */
const TONE_BY_ICON: Partial<Record<keyof typeof Ionicons.glyphMap, IconTileTone>> = {
  "stats-chart": "violet",
  football: "mint",
  "hand-left": "gold",
  trophy: "gold",
};

function Frame({ message, showSender, icon, label, children }: { message: ChatMessage; showSender?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; children: React.ReactNode }) {
  const mine = message.sender.is_me;
  return (
    <View style={[styles.card, mine ? styles.mine : styles.theirs]}>
      {mine ? <LinearGradient pointerEvents="none" colors={[chatPalette.bubbleMine, chatPalette.bubbleMineEdge]} start={G_START} end={G_END} style={[StyleSheet.absoluteFill, styles.cardFill]} /> : null}
      <View style={styles.head}>
        <IconTile icon={icon} tone={TONE_BY_ICON[icon] ?? "violet"} size={26} glow={false} />
        <Text style={styles.kind} numberOfLines={1} {...textScale.badge}>
          {label.toLocaleUpperCase("tr-TR")}
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
  const top = Math.max(0, ...poll.options.map((o) => (votes[o.id] ?? []).length));

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
              <View style={styles.optionLine}>
                {selected ? (
                  <View style={[styles.check, poll.multiple ? styles.checkSquare : null]}>
                    <LinearGradient colors={colors.gradientBrand} start={G_START} end={G_END} style={[StyleSheet.absoluteFill, poll.multiple ? styles.checkSquare : styles.checkRound]} />
                    <Ionicons name="checkmark" size={12} color={palette.textOnBrand} />
                  </View>
                ) : (
                  <View style={[styles.check, styles.checkIdle, poll.multiple ? styles.checkSquare : null]} />
                )}
                <Text style={styles.optionText} numberOfLines={2} {...textScale.dense}>
                  {option.text}
                </Text>
                {count > 0 && count === top ? (
                  <View style={styles.lead}>
                    <Ionicons name="trending-up" size={10} color={colors.win} />
                    <Text style={styles.leadText} {...textScale.badge}>önde</Text>
                  </View>
                ) : null}
                <Text style={styles.optionPct} {...textScale.badge}>
                  %{Math.round(share * 100)}
                </Text>
              </View>
              <View style={styles.optionBarRow}>
                <GradientBar value={share} height={5} track={chatPalette.bubbleInset} style={styles.flex} />
                <Text style={styles.optionCount} {...textScale.badge}>
                  {count} oy
                </Text>
              </View>
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
          <Ionicons name="people-outline" size={14} color={ACCENT} />
          <Text style={styles.slotBtnText} {...textScale.badge}>
            Oyları gör
          </Text>
        </Touchable>
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
              {/* Bilet: solda saat (ya da skor) karosu, ortada alt alta iki takım. */}
              <View style={[styles.ticket, played ? styles.ticketPlayed : null]}>
                <Text style={styles.matchTime} {...textScale.badge}>
                  {played ? `${match.home_score}-${match.away_score}` : match.time ?? "—"}
                </Text>
                <Text style={styles.ticketLabel} {...textScale.badge}>{played ? "SKOR" : "SAAT"}</Text>
              </View>
              <View style={styles.flex}>
                <View style={styles.teamLine}>
                  <View style={[styles.side, styles.sideHome]} />
                  <Text style={styles.matchTeams} numberOfLines={1} {...textScale.dense}>{match.home}</Text>
                </View>
                <View style={styles.teamLine}>
                  <View style={[styles.side, styles.sideAway]} />
                  <Text style={styles.matchTeams} numberOfLines={1} {...textScale.dense}>{match.away}</Text>
                </View>
                {match.field || match.league ? (
                  <View style={styles.teamLine}>
                    <Ionicons name="location-outline" size={11} color={chatPalette.bubbleMeta} />
                    <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
                      {[match.field, match.league].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.go}>
                <Ionicons name="chevron-forward" size={14} color={chatPalette.bubbleText} />
              </View>
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
                  <Ionicons name={mine ? "checkmark" : "hand-left-outline"} size={14} color={mine ? colors.textOnBrand : ACCENT} />
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
                  <Ionicons name={assigned ? "person-circle" : "person-add-outline"} size={20} color={assigned ? colors.win : ACCENT} />
                </Touchable>
              ) : null}
            </View>
          );
        })}
      </View>
      {onCloseToggle && message.sender.is_me ? (
        <Touchable feedback="chip" haptic="selection" onPress={() => onCloseToggle(message, !signup.closed)} style={styles.slotBtn} accessibilityRole="button" accessibilityLabel={signup.closed ? "Anketi yeniden aç" : "Anketi kapat"}>
          <Ionicons name={signup.closed ? "lock-open-outline" : "lock-closed-outline"} size={14} color={ACCENT} />
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
          <View>
            <GradientBar value={total ? submitted / total : 0} height={6} track={chatPalette.bubbleInset} />
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
          <Ionicons name="checkbox-outline" size={14} color={ACCENT} />
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
  flex: { flex: 1, minWidth: 0 },
  card: {
    width: "86%",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
  },
  cardFill: { borderRadius: radius.xl },
  mine: { alignSelf: "flex-end", backgroundColor: chatPalette.bubbleMine, ...glowStyle(colors.glow, 1), shadowOpacity: 0.18 },
  theirs: { alignSelf: "flex-start", backgroundColor: chatPalette.bubbleTheirs, borderWidth: hairline, borderColor: chatPalette.bubbleLine },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  kind: { ...type.overline, color: ACCENT, flex: 1 },
  stamp: { ...type.meta, color: chatPalette.bubbleMeta },
  title: { ...type.h3, color: chatPalette.bubbleText },
  body: { ...type.bodySm, color: chatPalette.bubbleText },
  muted: { ...type.caption, color: chatPalette.bubbleMeta },
  assigned: { color: colors.win },
  options: { gap: space.sm },
  option: {
    gap: space.s,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: chatPalette.bubbleLine,
    backgroundColor: chatPalette.bubbleInset,
  },
  optionSelected: { borderColor: colors.brandBorder },
  optionLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  optionBarRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  check: { width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  checkRound: { borderRadius: radius.pill },
  checkSquare: { borderRadius: radius.xs - 1 },
  checkIdle: { borderWidth: 1.5, borderColor: chatPalette.bubbleMeta },
  optionText: { ...type.label, color: chatPalette.bubbleText, flex: 1 },
  optionPct: { ...type.numSmStrong, color: chatPalette.bubbleText },
  optionCount: { ...type.numSm, color: chatPalette.bubbleMeta, minWidth: 34, textAlign: "right" },
  lead: { flexDirection: "row", alignItems: "center", gap: space.xxs, paddingHorizontal: space.xs, height: 16, borderRadius: radius.pill, backgroundColor: colors.winDim },
  leadText: { ...type.micro, color: colors.win },
  rows: { borderRadius: radius.lg, borderWidth: hairline, borderColor: chatPalette.bubbleLine, backgroundColor: chatPalette.bubbleInset, overflow: "hidden" },
  divided: { borderTopWidth: hairline, borderTopColor: chatPalette.bubbleLine },
  matchRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.sm, paddingVertical: space.sm, minHeight: 64 },
  ticket: { width: 52, paddingVertical: space.s, borderRadius: radius.sm, alignItems: "center", gap: space.px, backgroundColor: chatPalette.bubbleInset, borderWidth: hairline, borderColor: colors.brandBorder },
  ticketPlayed: { borderColor: colors.win },
  ticketLabel: { ...type.micro, color: chatPalette.bubbleMeta },
  matchTime: { ...type.scoreXs, color: chatPalette.bubbleText },
  teamLine: { flexDirection: "row", alignItems: "center", gap: space.s, minWidth: 0 },
  side: { width: 6, height: 6, borderRadius: radius.pill },
  sideHome: { backgroundColor: colors.gradientSignature[0] },
  sideAway: { backgroundColor: colors.gradientSignature[1] },
  matchTeams: { ...type.labelSm, fontFamily: fonts.semibold, color: chatPalette.bubbleText, flexShrink: 1 },
  go: { width: 26, height: 26, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: chatPalette.bubbleInset },
  slot: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  slotBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xs,
    minHeight: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: chatPalette.bubbleLine,
    backgroundColor: chatPalette.bubbleInset,
  },
  slotBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  slotBtnText: { ...type.labelSm, color: ACCENT },
  slotBtnTextOn: { color: colors.textOnBrand },
  dim: { opacity: 0.5 },
});
