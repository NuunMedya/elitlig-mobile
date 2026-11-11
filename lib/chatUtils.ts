/**
 * SOHBET YARDIMCILARI — saf fonksiyonlar (masaüstü `chatUtils.js` ile aynı kurallar).
 *
 * Gün ayraçları, mesaj dizileri (aynı kişiden 5 dk içinde art arda), fotoğraf
 * albümü, okundu tikleri, tepki özeti, @bahsetme, bağlantı ayrıştırma, sohbet
 * listesi sıralaması / süzgeçleri ve önizleme metinleri. Emoji sabitleri de
 * burada durur: `app/` ve `components/` altında emoji karakteri yazılamaz
 * (scripts/check-tokens.mjs), tepki olarak GÖSTERİLMESİ ise serbesttir.
 */

import type { ChatConversation, ChatMessage, ChatParticipant, ChatPresence, ChatReaction } from "@/lib/api/chat";

const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (value: string | number | Date) => (value instanceof Date ? value : new Date(value));
const lower = (value: string) => value.toLocaleLowerCase("tr-TR");

/* --------------------------------- zaman --------------------------------- */

export function dayKey(value: string | Date): string {
  const d = toDate(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const cap = (s: string) => s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1);
const weekday = (d: Date) => cap(d.toLocaleDateString("tr-TR", { weekday: "long" }));
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayDiff = (value: Date, now: Date) => Math.round((startOfDay(now) - startOfDay(value)) / 86_400_000);

/** Gün ayracı: Bugün / Dün / Salı / 12 Ekim / 12 Ekim 2025 */
export function dayLabel(value: string | Date, now = new Date()): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "";
  const diff = dayDiff(d, now);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Dün";
  if (diff > 1 && diff < 7) return weekday(d);
  return d.toLocaleDateString("tr-TR", d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}

export function clockTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Liste satırı saati: bugün 14:05, dün "Dün", bu hafta gün adı, öncesi 12.10.2026 */
export function listTime(value: string | null | undefined, now = new Date()): string {
  if (!value) return "";
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "";
  const diff = dayDiff(d, now);
  if (diff <= 0) return clockTime(d);
  if (diff === 1) return "Dün";
  if (diff < 7) return weekday(d);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Başlıktaki durum: "çevrimiçi" / "son görülme bugün 14:05" */
export function lastSeenLabel(presence: ChatPresence | null | undefined, now = new Date()): string {
  if (!presence) return "";
  if (presence.online) return "çevrimiçi";
  if (!presence.last_seen) return "";
  const d = toDate(presence.last_seen);
  if (Number.isNaN(d.getTime())) return "";
  const diff = dayDiff(d, now);
  if (diff <= 0) return `son görülme bugün ${clockTime(d)}`;
  if (diff === 1) return `son görülme dün ${clockTime(d)}`;
  return `son görülme ${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${clockTime(d)}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes) || 0;
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",")} MB`;
}

/* ------------------------------ mesaj satırları ------------------------------ */

const RUN_GAP_MS = 5 * 60 * 1000;
/** Balon olarak değil, ortalanmış kart / şerit olarak çizilen türler: dizi kurmazlar. */
const STANDALONE = new Set(["system", "call", "notification"]);
const senderKey = (m: ChatMessage) => (m.sender.is_me ? "me" : String(m.sender.user_id ?? (m.sender.is_management ? "yonetim" : m.sender.name ?? "?")));

export type ChatRow =
  | { type: "day"; key: string; label: string }
  | { type: "unread"; key: string; count: number }
  | { type: "msg"; key: string; message: ChatMessage; first: boolean; last: boolean }
  | { type: "album"; key: string; messages: ChatMessage[]; first: boolean; last: boolean };

/** Kalıcı satır anahtarı: iyimser balon sunucu mesajına dönüşürken yeniden bağlanmaz. */
export const messageKey = (m: ChatMessage) => (m.client_id ? `c${m.client_id}` : `m${m.id}`);

const sameRun = (a: ChatMessage | undefined, b: ChatMessage | undefined) =>
  Boolean(
    a && b && !STANDALONE.has(a.kind) && !STANDALONE.has(b.kind) && senderKey(a) === senderKey(b) &&
      dayKey(a.created_at) === dayKey(b.created_at) &&
      Math.abs(toDate(b.created_at).getTime() - toDate(a.created_at).getTime()) < RUN_GAP_MS,
  );

const isAlbumImage = (m: ChatMessage) => m.kind === "image" && !m.deleted && Boolean(m.meta?.file || m.local_uri) && !m.failed;

/**
 * Mesajları (eskiden yeniye) çizim satırlarına çevirir: gün ayraçları, dizinin
 * ilki (ad + kuyruk) / sonuncusu, art arda açıklamasız fotoğraflardan albüm ve
 * "okunmamış mesajlar" ayracı (`unreadFromId`: ilk okunmamış mesajın kimliği).
 */
export function buildRows(messages: ChatMessage[], options: { unreadFromId?: number | null; unreadCount?: number; now?: Date } = {}): ChatRow[] {
  const now = options.now ?? new Date();
  const out: ChatRow[] = [];
  let prevDay = "";
  let prev: ChatMessage | undefined;
  messages.forEach((m, i) => {
    const key = dayKey(m.created_at || now);
    if (key !== prevDay) {
      out.push({ type: "day", key: `d${key}`, label: dayLabel(m.created_at || now, now) });
      prevDay = key;
      prev = undefined;
    }
    if (options.unreadFromId && m.id === options.unreadFromId) {
      out.push({ type: "unread", key: "unread", count: options.unreadCount ?? 0 });
      prev = undefined;
    }
    const next = messages[i + 1];
    const nextBreaks = Boolean(next && options.unreadFromId && next.id === options.unreadFromId);
    const first = !sameRun(prev, m);
    const last = nextBreaks || !sameRun(m, next);
    const tail = out[out.length - 1];
    // Albüm: aynı dizide art arda, açıklamasız fotoğraflar (açıklamalı kare albümü kapatır).
    if (isAlbumImage(m) && !first && tail) {
      if (tail.type === "album" && !tail.last && !tail.messages[tail.messages.length - 1].meta?.caption) {
        tail.messages.push(m);
        tail.last = last;
        prev = m;
        return;
      }
      if (tail.type === "msg" && isAlbumImage(tail.message) && !tail.message.meta?.caption && !tail.last) {
        out[out.length - 1] = { type: "album", key: `a${tail.key}`, messages: [tail.message, m], first: tail.first, last };
        prev = m;
        return;
      }
    }
    out.push({ type: "msg", key: messageKey(m), message: m, first, last });
    prev = m;
  });
  return out;
}

/* ------------------------------- okundu tiki ------------------------------- */

export type TickStatus = "pending" | "queued" | "failed" | "sent" | "delivered" | "read";

/**
 * Kendi mesajımın durumu: "pending" (saat), "queued" (bağlantı bekliyor),
 * "failed", "sent" (tek tik), "delivered" (çift gri tik: grupta bazıları okudu),
 * "read" (çift mavi tik). Başkasının mesajında null.
 */
export function tickStatus(m: ChatMessage | null | undefined): TickStatus | null {
  if (!m || !m.sender?.is_me || m.kind === "system" || m.deleted) return null;
  if (m.queued) return "queued";
  if (m.failed) return "failed";
  if (m.pending || m.id < 0) return "pending";
  if (m.status === "read") return "read";
  if (Number(m.read_count) > 0) return "delivered";
  return "sent";
}

/* --------------------------------- tepkiler --------------------------------- */

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
/** "+" ile açılan geniş tepki ızgarası. */
export const MORE_REACTIONS = [
  "👍", "👎", "❤️", "🔥", "👏", "🙏", "😂", "🤣", "😊", "😍", "😎", "🤔",
  "😮", "😢", "😭", "😡", "🥳", "🤝", "💪", "🙌", "👀", "✅", "❌", "⚽",
  "🏆", "🥇", "🎉", "💯", "⭐", "🤞", "😅", "🙈", "🤷", "👌", "🫡", "💜",
];

/** İyimser tepki: kişi başına tek tepki; aynı emoji kaldırır. */
export function applyReaction(reactions: ChatReaction[] | undefined, emoji: string, me: { user_id: number | null; name: string }): ChatReaction[] {
  const current = (reactions ?? []).map((r) => ({ ...r, users: [...(r.users ?? [])] }));
  const previous = current.find((r) => r.mine);
  if (previous) {
    previous.count -= 1;
    previous.mine = false;
    previous.users = previous.users.filter((u) => Number(u.user_id) !== Number(me.user_id));
  }
  if (emoji && previous?.emoji !== emoji) {
    const target = current.find((r) => r.emoji === emoji);
    const user = { user_id: Number(me.user_id), name: me.name };
    if (target) {
      target.count += 1;
      target.mine = true;
      target.users.push(user);
    } else current.push({ emoji, count: 1, mine: true, users: [user] });
  }
  return current.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
}

/* ------------------------------ metin işleme ------------------------------ */

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])/g;

export type RichPart = { t: "text" | "link" | "bold"; v: string } | { t: "mention"; v: string; id: number };

/** Mesaj gövdesi parçaları: bağlantılar, @bahsetmeler (katılımcı adıyla eşleşen) ve *kalın*. */
export function parseRich(text: string | null | undefined, participants: Pick<ChatParticipant, "user_id" | "name">[] = []): RichPart[] {
  const body = String(text ?? "");
  if (!body) return [];
  const names = participants.filter((p) => p?.name).map((p) => ({ id: p.user_id, name: p.name })).sort((a, b) => b.name.length - a.name.length);
  const out: RichPart[] = [];
  const pushText = (v: string) => {
    if (!v) return;
    const re = /\*([^*\n]+)\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(v))) {
      if (m.index > last) out.push({ t: "text", v: v.slice(last, m.index) });
      out.push({ t: "bold", v: m[1] });
      last = m.index + m[0].length;
    }
    if (last < v.length) out.push({ t: "text", v: v.slice(last) });
  };
  const pushMentions = (v: string) => {
    if (!names.length || !v.includes("@")) {
      pushText(v);
      return;
    }
    let i = 0;
    let buf = "";
    while (i < v.length) {
      if (v[i] === "@" && (i === 0 || /\s|\(/.test(v[i - 1]))) {
        const rest = v.slice(i + 1);
        const hit = names.find((n) => lower(rest).startsWith(lower(n.name)));
        if (hit) {
          pushText(buf);
          buf = "";
          out.push({ t: "mention", v: `@${rest.slice(0, hit.name.length)}`, id: hit.id });
          i += 1 + hit.name.length;
          continue;
        }
      }
      buf += v[i];
      i += 1;
    }
    pushText(buf);
  };
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, "g");
  while ((match = re.exec(body))) {
    pushMentions(body.slice(last, match.index));
    out.push({ t: "link", v: match[0] });
    last = match.index + match[0].length;
  }
  pushMentions(body.slice(last));
  return out;
}

/** Gönderirken metindeki @Ad'lardan bahsedilen kullanıcı kimlikleri. */
export function extractMentions(text: string, participants: Pick<ChatParticipant, "user_id" | "name">[]): number[] {
  const ids = new Set<number>();
  parseRich(text, participants).forEach((part) => {
    if (part.t === "mention") ids.add(Number(part.id));
  });
  return [...ids];
}

/** İmlecin solunda yazılan "@ka" sorgusu. */
export function mentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(^|\s)@([\p{L}\p{N}_.-]{0,30})$/u);
  if (!m) return null;
  return { query: m[2], start: before.length - m[2].length - 1 };
}

/** Bahsetme seçilince metni tamamlar: "@ka" → "@Kartallar FK " */
export function insertMention(text: string, start: number, caret: number, name: string): string {
  return `${text.slice(0, start)}@${name} ${text.slice(caret)}`;
}

const EMOJI_RE = /\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu;
/** Yalnız emojiden oluşan kısa mesaj (1–3 emoji) büyük çizilir: emoji sayısı ya da 0. */
export function emojiOnlyCount(text: string | null | undefined): number {
  const value = String(text ?? "").trim();
  if (!value || value.length > 24) return 0;
  const found = value.match(EMOJI_RE) ?? [];
  const rest = value.replace(EMOJI_RE, "").replace(/[\s️‍]/g, "");
  return !rest && found.length <= 3 ? found.length : 0;
}

/* ------------------------------ mesaj türleri ------------------------------ */

/** Ionicons adı (bileşen `keyof typeof Ionicons.glyphMap` olarak daraltır). */
export type PreviewIcon = "camera" | "document-text" | "mic" | "stats-chart" | "location" | "call" | "football" | "hand-left" | "trophy" | "ban" | "videocam";

const KIND_ICON: Partial<Record<ChatMessage["kind"], PreviewIcon>> = {
  image: "camera",
  file: "document-text",
  audio: "mic",
  poll: "stats-chart",
  location: "location",
  call: "call",
  matches: "football",
  signup: "hand-left",
  award_poll: "trophy",
};

/** Sunucunun simgeyle başlayan yedek gövdesinden simgeyi ayıklar ("📷 Fotoğraf" → "Fotoğraf"). */
const stripLeadEmoji = (text: string) => text.replace(/^(\p{Extended_Pictographic}️?\s*)+/u, "");

export const isVideoFile = (m: Pick<ChatMessage, "meta"> | null | undefined) => {
  const file = m?.meta?.file;
  return Boolean(file && (String(file.mime ?? "").startsWith("video/") || /\.(mp4|mov)$/i.test(file.name ?? "")));
};

/** Kısa içerik özeti (yanıt alıntısı, sabit mesaj çubuğu, arama sonucu): simge + metin. */
export function messageSummary(m: Pick<ChatMessage, "kind" | "body" | "meta" | "deleted"> | null | undefined): { icon: PreviewIcon | null; text: string } {
  if (!m) return { icon: null, text: "" };
  if (m.deleted) return { icon: "ban", text: "Bu mesaj silindi" };
  const body = stripLeadEmoji(String(m.body ?? "")).replace(/\s+/g, " ").trim();
  switch (m.kind) {
    case "image":
      return { icon: "camera", text: m.meta?.caption || "Fotoğraf" };
    case "audio":
      return { icon: "mic", text: "Sesli mesaj" };
    case "file":
      return { icon: isVideoFile(m) ? "videocam" : "document-text", text: m.meta?.caption || m.meta?.file?.name || body || "Belge" };
    case "poll":
      return { icon: "stats-chart", text: m.meta?.poll?.question || body || "Anket" };
    case "location":
      return { icon: "location", text: m.meta?.location?.label || m.meta?.location?.venue_name || body || "Konum" };
    case "matches":
      return { icon: "football", text: m.meta?.matches ? `Günün maçları · ${m.meta.matches.items?.length ?? 0} maç` : "Günün maçları" };
    case "signup":
      return { icon: "hand-left", text: m.meta?.signup?.title || body || "Görev anketi" };
    case "award_poll":
      return { icon: "trophy", text: `Haftanın Enleri${m.meta?.award?.week ? ` · ${m.meta.award.week}` : ""}` };
    case "call":
      return { icon: "call", text: body || "Sesli arama" };
    default:
      return { icon: KIND_ICON[m.kind] ?? null, text: body };
  }
}

/** Liste satırı önizlemesi: grupta gönderen adı, benimse "Sen". */
export function chatPreview(conversation: ChatConversation, options: { inbox?: boolean } = {}): { prefix: string; icon: PreviewIcon | null; text: string; deleted?: boolean } {
  const m = conversation.last_message;
  if (!m) {
    return { prefix: "", icon: null, text: conversation.type === "group" || conversation.type === "team" ? "Grup kuruldu" : conversation.type === "management" ? "Yönetimle yazışma" : "Sohbeti başlat" };
  }
  if (m.kind === "system") return { prefix: "", icon: null, text: m.body ?? "" };
  const isGroup = conversation.type === "group" || conversation.type === "team";
  const prefix = options.inbox && m.sender.is_management
    ? "Yönetim: "
    : m.sender.is_me
      ? "Sen: "
      : isGroup && m.sender.name
        ? `${String(m.sender.name).split(" ")[0]}: `
        : "";
  const summary = messageSummary(m);
  let text = summary.text;
  if (m.kind === "audio" && m.meta?.audio?.duration_ms) {
    const total = Math.round(m.meta.audio.duration_ms / 1000);
    text = `Sesli mesaj (${Math.floor(total / 60)}:${pad(total % 60)})`;
  }
  return { prefix: m.kind === "call" ? "" : prefix, icon: summary.icon, text, deleted: m.deleted };
}

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
const realId = (m: ChatMessage) => m.id > 0 && !m.pending && !m.failed;
export const canEdit = (m: ChatMessage | null | undefined, now = Date.now()) =>
  Boolean(m && m.sender.is_me && realId(m) && !m.deleted && m.kind === "text" && now - toDate(m.created_at).getTime() <= EDIT_WINDOW_MS);
export const canDelete = (m: ChatMessage | null | undefined) => Boolean(m && m.sender.is_me && realId(m) && !m.deleted && m.kind !== "system");
export const canForward = (m: ChatMessage | null | undefined) => Boolean(m && realId(m) && !m.deleted && ["text", "audio", "image", "file", "location"].includes(m.kind));
/** Tepki, yıldız, sabitleme: sunucuda kimliği olan, silinmemiş gerçek mesajlar. */
export const canInteract = (m: ChatMessage | null | undefined) => Boolean(m && realId(m) && !m.deleted && !["system", "call", "notification"].includes(m.kind));

/* ------------------------------ mesaj birleştirme ------------------------------ */

const sortValue = (m: ChatMessage) => (m.id > 0 ? m.id : Number.MAX_SAFE_INTEGER / 2 + toDate(m.created_at).getTime() / 1000);

/**
 * Sunucudan gelen mesajları listeye işler: kimlik ya da client_id eşleşirse
 * günceller (gelen yük tepki / yıldız / okundu taşımıyorsa eskisi korunur),
 * yoksa ekler. Gönderilmeyi bekleyenler sonda kalır.
 */
export function mergeMessages(list: ChatMessage[], incoming: (ChatMessage | null | undefined)[]): ChatMessage[] {
  const out = list.slice();
  let changed = false;
  for (const raw of incoming) {
    if (!raw) continue;
    const i = out.findIndex((m) => (raw.id > 0 && m.id === raw.id) || (raw.client_id != null && m.client_id === raw.client_id));
    if (i >= 0) {
      const prev = out[i];
      const next: ChatMessage = { ...prev, ...raw, pending: false, failed: false, queued: false, retry: null };
      if (!raw.reply_to && prev.reply_to) next.reply_to = prev.reply_to;
      if (raw.reactions === undefined && prev.reactions) next.reactions = prev.reactions;
      if (raw.starred === undefined && prev.starred !== undefined) next.starred = prev.starred;
      if (raw.status === undefined && prev.status) {
        next.status = prev.status;
        next.read_count = prev.read_count;
        next.recipient_count = prev.recipient_count;
      }
      // Yüklenen görsel sunucu adresine geçerken yerel kopya ekranda kalır (titreme olmaz).
      if (prev.local_uri && !raw.deleted) next.local_uri = prev.local_uri;
      out[i] = next;
    } else out.push(raw);
    changed = true;
  }
  return changed ? out.sort((a, b) => sortValue(a) - sortValue(b)) : list;
}

/** Okundu olayı: okuma anına kadarki kendi mesajlarım okundu (grupta sayaç artar). */
export function markReadUntil(list: ChatMessage[], readAt: string | Date, group: boolean): ChatMessage[] {
  const at = toDate(readAt).getTime();
  let changed = false;
  const out = list.map((m) => {
    if (!m.sender.is_me || m.id <= 0 || m.status === "read" || toDate(m.created_at).getTime() > at + 1000) return m;
    changed = true;
    if (group) {
      const total = Number(m.recipient_count) || 0;
      const count = total ? Math.min(total, (Number(m.read_count) || 0) + 1) : (Number(m.read_count) || 0) + 1;
      return { ...m, read_count: count, status: total && count >= total ? ("read" as const) : m.status };
    }
    return { ...m, status: "read" as const, read_count: Math.max(1, Number(m.read_count) || 0) };
  });
  return changed ? out : list;
}

/* ------------------------------- sohbet listesi ------------------------------- */

export const isGroupChat = (c: Pick<ChatConversation, "type"> | null | undefined) => c?.type === "group" || c?.type === "team";
export const isUnread = (c: ChatConversation | null | undefined) => Boolean(c && (Number(c.unread) > 0 || c.marked_unread));

/** Sabitlenenler üstte (en son sabitlenen önce), sonra son mesaj zamanına göre. */
export function sortChats(list: ChatConversation[]): ChatConversation[] {
  const time = (v: string | null | undefined) => (v ? new Date(v).getTime() || 0 : 0);
  return list.slice().sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) return time(b.pinned_at) - time(a.pinned_at);
    return time(b.last_message_at ?? b.created_at) - time(a.last_message_at ?? a.created_at);
  });
}

export type ChatFilter = "all" | "unread" | "pinned" | "groups" | "archive";

/** Süzgeçler: all (arşiv hariç), unread, pinned, groups, archive. q ad, alt başlık, takım adı ve son mesajda aranır. */
export function filterChats(list: ChatConversation[], filter: ChatFilter, q: string): ChatConversation[] {
  const needle = lower(q.trim());
  return sortChats(list).filter((c) => {
    if (filter === "archive" ? !c.archived : c.archived) return false;
    if (filter === "unread" && !isUnread(c)) return false;
    if (filter === "groups" && !isGroupChat(c)) return false;
    if (filter === "pinned" && !c.pinned) return false;
    if (!needle) return true;
    return lower(`${c.title} ${c.subtitle ?? ""} ${c.other_user?.team_name ?? ""} ${c.entity?.name ?? ""} ${c.last_message?.body ?? ""}`).includes(needle);
  });
}

export function chatCounts(list: ChatConversation[]) {
  const active = list.filter((c) => !c.archived);
  return {
    all: active.length,
    unread: active.filter(isUnread).length,
    groups: active.filter(isGroupChat).length,
    pinned: active.filter((c) => c.pinned).length,
    archive: list.length - active.length,
    archiveUnread: list.filter((c) => c.archived && isUnread(c)).length,
  };
}

/** Sohbet listesinde bir sohbeti günceller ya da ekler; yayın kişisel durumu taşımıyorsa eskisi korunur. */
export function upsertChat(list: ChatConversation[], conversation: ChatConversation): ChatConversation[] {
  if (!conversation?.id) return list;
  if (conversation.removed) return list.filter((c) => c.id !== conversation.id);
  const i = list.findIndex((c) => c.id === conversation.id);
  if (i < 0) return [...list, conversation];
  const prev = list[i];
  const next: ChatConversation = { ...prev };
  (Object.keys(conversation) as (keyof ChatConversation)[]).forEach((key) => {
    if (conversation[key] !== undefined) (next as unknown as Record<string, unknown>)[key] = conversation[key];
  });
  const out = list.slice();
  out[i] = next;
  return out;
}

/* ---------------------------------- sesli mesaj ---------------------------------- */

/** Sunucu dalga verisi tutmaz; mesaj kimliğinden üretilen sabit (her çizimde aynı) çubuklar. */
export function waveform(seed: number | string, bars = 34): number[] {
  let x = 0;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) x = (x * 31 + text.charCodeAt(i)) >>> 0;
  x = x || 7;
  const out: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    x = (x * 1664525 + 1013904223) >>> 0;
    const noise = (x >>> 8) / 0xffffff;
    const envelope = 0.55 + 0.45 * Math.sin((i / bars) * Math.PI);
    out.push(Math.max(0.16, Math.min(1, (0.25 + noise * 0.75) * envelope)));
  }
  return out;
}

/* ------------------------------- hazır içerikler ------------------------------- */

export const DUTIES: { key: string; label: string; icon: "mic" | "videocam" | "flag" | "camera" | "medkit" }[] = [
  { key: "spiker", label: "Spiker", icon: "mic" },
  { key: "reji", label: "Reji", icon: "videocam" },
  { key: "hakem", label: "Hakem", icon: "flag" },
  { key: "fotografci", label: "Fotoğrafçı", icon: "camera" },
  { key: "saglikci", label: "Sağlıkçı", icon: "medkit" },
];

export const AWARD_CATEGORIES: { key: string; label: string }[] = [
  { key: "WEEKLY_PLAYER", label: "Haftanın Oyuncusu" },
  { key: "WEEKLY_GOALKEEPER", label: "Haftanın Kalecisi" },
  { key: "WEEKLY_DEFENDER", label: "Haftanın Defans Oyuncusu" },
  { key: "WEEKLY_MIDFIELDER", label: "Haftanın Orta Saha Oyuncusu" },
  { key: "WEEKLY_FORWARD", label: "Haftanın Forveti" },
  { key: "WEEKLY_FAIR_PLAY", label: "Haftanın Fair Play Oyuncusu" },
  { key: "WEEKLY_TEAM", label: "Haftanın Takımı" },
  { key: "WEEKLY_SQUAD_PLAYER", label: "Haftanın Kadrosu" },
];

/** Yerel gün "YYYY-MM-DD". */
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function shiftDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return isoDate(new Date(y, (m || 1) - 1, (d || 1) + days));
}

/** "Bugün", "Yarın", "Dün" ya da "6 Kasım Perşembe". */
export function matchDayLabel(ymd: string | null | undefined, now = new Date()): string {
  if (!ymd) return "";
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  const day = new Date(y, (m || 1) - 1, d || 1);
  const diff = Math.round((day.getTime() - startOfDay(now)) / 86_400_000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  return day.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
}

/** Geçen haftanın pazartesi–pazar aralığı (Haftanın Enleri varsayılanı). */
export function lastWeekRange(now = new Date()): { start: string; end: string } {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7);
  return { start: isoDate(monday), end: isoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
}

/** Bağlantının görünen kısa hâli ("https://www.elitlig.com/mac/12" → "elitlig.com/mac/12"). */
export const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
