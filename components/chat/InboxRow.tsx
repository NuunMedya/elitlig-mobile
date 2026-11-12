/**
 * SOHBET LİSTESİ SATIRLARI — WhatsApp sohbet listesinin anatomisi.
 *
 *   [ avatar 54 ]  Ad (onay) [Takım]                   14:05  ← saat (okunmamışsa vurgu)
 *                  tik  Ali: fotoğraf        @ sessiz sabit (3) ← bahsetme · sessiz · sabit · sayaç
 *                  ──────────────────────────────────────────  ← ayraç avatardan SONRA başlar
 *
 * ÖLÇÜ SABİTTİR: her sohbet / arama / kişi satırı 72 px'tir (üçüncü satır
 * yok; takım adı ve yönetim kutusundaki kategori ilk satırda adın yanındadır).
 * Böylece liste `getItemLayout` ile ölçmeden sanallaştırılır.
 *
 * PERFORMANS: satırlar `memo`dur ve yalnız kendi sohbet nesnesi değişince
 * çizilir. Yazıyor…, taslak ve çevrimiçi durumunu satır KENDİ okur
 * (`useSyncExternalStore`); bu olaylar listeyi yeniden çizmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { TypingLine } from "@/components/chat/ChatHeader";
import { useOnline } from "@/components/chat/inboxPresence";
import { Ticks } from "@/components/chat/MessageBubble";
import { Skeleton, Touchable } from "@/components/ui";
import { useTypingNames } from "@/hooks/useChat";
import type { ChatConversation, ChatSearchHit, ChatUser, ConversationType } from "@/lib/api/chat";
import { useDraft } from "@/lib/chatDrafts";
import { avatarTint } from "@/lib/chatPalette";
import { chatPreview, isGroupChat, isUnread, listTime, messageSummary, tickStatus } from "@/lib/chatUtils";
import { initials, mediaUrl } from "@/lib/format";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

/** Sohbet, mesaj sonucu ve kişi satırının yüksekliği. */
export const INBOX_ROW_HEIGHT = 72;
export const INBOX_ARCHIVE_HEIGHT = 56;
export const INBOX_SECTION_HEIGHT = 40;
export const INBOX_NOTE_HEIGHT = 48;

const AVATAR = 54;
const KIND_LABEL: Record<string, string> = { team: "Takım", player: "Oyuncu", member: "Üye", general: "Genel", staff: "Ekip" };
const lower = (value: string) => value.toLocaleLowerCase("tr-TR");

/* --------------------------------- avatar --------------------------------- */

export interface InboxAvatarProps {
  type: ConversationType | "person";
  title: string;
  image?: string | null;
  /** Renk tohumu: kişi ya da sohbet kimliği (aynı sohbet hep aynı ton). */
  seed: number | string;
  /** Yönetim gelen kutusu: yazışmanın sahibi (takım / oyuncu / üye) gösterilir. */
  owner?: boolean;
  online?: boolean;
}

/**
 * Fotoğraf → takım arması (kırpılmadan) → resmî sohbet simgesi → grup simgesi
 * → baş harfler. Fotoğrafsız hâllerde zemin, sohbete özgü yumuşak bir tondur.
 */
export const InboxAvatar = memo(function InboxAvatar({ type: kind, title, image, seed, owner = false, online = false }: InboxAvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  const uri = failed ? null : mediaUrl(image);
  const official = !owner && (kind === "management" || kind === "admin");
  const group = kind === "group" || kind === "team";
  const tint = avatarTint(seed);

  return (
    <View style={styles.avatar}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.avatarFill, kind === "team" ? styles.avatarCrest : null]}
          resizeMode={kind === "team" ? "contain" : "cover"}
          // Profil fotoğrafları kamera çıktısıdır; "resize" olmadan Android'de tam boyutta çözülür.
          resizeMethod="resize"
          onError={() => setFailed(true)}
        />
      ) : official ? (
        <View style={[styles.avatarFill, styles.avatarOfficial]}>
          <Ionicons name={kind === "admin" ? "notifications" : "shield-checkmark"} size={26} color={colors.textOnBrand} />
        </View>
      ) : group ? (
        <View style={[styles.avatarFill, { backgroundColor: tint.bg }]}>
          <Ionicons name={kind === "team" ? "shield-half" : "people"} size={26} color={tint.fg} />
        </View>
      ) : (
        <View style={[styles.avatarFill, { backgroundColor: tint.bg }]}>
          <Text style={[styles.avatarInitials, { color: tint.fg }]} numberOfLines={1} {...textScale.badge}>{initials(title)}</Text>
        </View>
      )}
      {online ? <View style={styles.online} /> : null}
    </View>
  );
});

/* ------------------------------ sohbet satırı ------------------------------ */

export interface ConversationRowProps {
  conversation: ChatConversation;
  /** Yönetimin ortak gelen kutusundaki (üye mesajları) yazışma. */
  inbox: boolean;
  /** Oturumdaki kullanıcı: son mesajda bana @bahsedildi mi diye bakılır. */
  meId: number | null;
  onPress: (conversation: ChatConversation, inbox: boolean) => void;
  onLongPress: (conversation: ChatConversation, inbox: boolean) => void;
}

export const ConversationRow = memo(function ConversationRow({ conversation, inbox, meId, onPress, onLongPress }: ConversationRowProps) {
  const draft = useDraft(inbox ? 0 : conversation.id);
  const typing = useTypingNames(inbox ? 0 : conversation.id).length > 0;
  const direct = conversation.type === "direct" && !inbox;
  const online = useOnline(direct ? conversation.other_user?.user_id : null);

  const unread = isUnread(conversation);
  const group = isGroupChat(conversation);
  const preview = chatPreview(conversation, { inbox });
  const last = conversation.last_message;
  const mineLast = Boolean(!inbox && last && last.sender.is_me && last.kind !== "system" && last.kind !== "call" && !last.deleted);
  // Birebirde tik "benim mesajım" demektir; "Sen:" öneki yalnız grupta kalır.
  const prefix = mineLast && !group ? "" : preview.prefix;
  const mentioned = Boolean(!inbox && meId && conversation.unread > 0 && last?.meta?.mentions?.includes(meId));
  const verified = !inbox && (conversation.type === "management" || conversation.type === "admin");
  const kind = inbox ? KIND_LABEL[conversation.entity?.kind ?? "member"] ?? "Üye" : null;
  const aside = inbox
    ? (conversation.subtitle ?? "").replace(/^(Takım|Oyuncu|Üye)\s*·\s*/, "")
    : conversation.other_user?.team_name && conversation.other_user.team_name !== conversation.title
      ? conversation.other_user.team_name
      : "";

  const state = conversation.unread > 0 ? `, ${conversation.unread} okunmamış mesaj` : conversation.marked_unread ? ", okunmadı olarak işaretli" : "";
  const summary = typing ? "yazıyor" : draft ? `Taslak: ${draft}` : `${preview.prefix}${preview.text}`;

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={() => onPress(conversation, inbox)}
      onLongPress={() => onLongPress(conversation, inbox)}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel={`${conversation.title}${kind ? `, ${kind}` : ""}${state}. ${summary}`}
      accessibilityHint="Sohbet seçenekleri için basılı tut"
      style={styles.row}
    >
      <InboxAvatar
        type={conversation.type}
        title={conversation.title}
        image={conversation.avatar ?? conversation.entity?.avatar ?? null}
        seed={conversation.other_user?.user_id ?? conversation.entity?.id ?? conversation.id}
        owner={conversation.type === "management" && Boolean(conversation.entity)}
        online={online}
      />
      <View style={styles.body}>
        <View style={styles.line}>
          <View style={styles.who}>
            <Text style={[styles.name, unread ? styles.nameUnread : null]} numberOfLines={1} {...textScale.dense}>{conversation.title}</Text>
            {verified ? <Ionicons name="checkmark-circle" size={16} color={colors.brandAccent} accessibilityLabel="Resmî sohbet" /> : null}
            {kind ? (
              <View style={styles.kind}>
                <Text style={styles.kindText} numberOfLines={1} {...textScale.badge}>{kind}</Text>
              </View>
            ) : null}
            {aside ? <Text style={styles.aside} numberOfLines={1} {...textScale.dense}>{aside}</Text> : null}
          </View>
          <Text style={[styles.time, unread ? styles.timeUnread : null]} numberOfLines={1} {...textScale.badge}>{listTime(conversation.last_message_at)}</Text>
        </View>

        <View style={styles.line}>
          {typing ? (
            <TypingLine conversationId={conversation.id} group={group} fallback="" tone="row" />
          ) : draft ? (
            <Text style={styles.preview} numberOfLines={1} {...textScale.dense}>
              <Text style={styles.draft}>Taslak: </Text>
              {draft}
            </Text>
          ) : (
            <View style={styles.previewRow}>
              {mineLast ? <Ticks status={tickStatus(last)} size={16} color={colors.textTertiary} /> : null}
              {preview.icon ? <Ionicons name={preview.icon} size={15} color={unread ? colors.textSecondary : colors.textTertiary} /> : null}
              <Text style={[styles.preview, preview.deleted ? styles.previewDeleted : null, unread ? styles.previewUnread : null]} numberOfLines={1} {...textScale.dense}>
                {prefix}
                {preview.text}
              </Text>
            </View>
          )}
          <View style={styles.marks}>
            {mentioned ? (
              <View style={styles.mention} accessibilityLabel="Senden bahsedildi">
                <Ionicons name="at" size={13} color={colors.textOnBrand} />
              </View>
            ) : null}
            {conversation.muted ? <Ionicons name="volume-mute" size={16} color={colors.textTertiary} /> : null}
            {conversation.pinned ? <Ionicons name="pin" size={15} color={colors.textTertiary} /> : null}
            {conversation.unread > 0 ? (
              <View style={[styles.badge, conversation.muted ? styles.badgeMuted : null]}>
                <Text style={styles.badgeText} {...textScale.badge}>{conversation.unread > 99 ? "99+" : conversation.unread}</Text>
              </View>
            ) : conversation.marked_unread ? (
              <View style={styles.dot} />
            ) : null}
          </View>
        </View>
      </View>
    </Touchable>
  );
});

/* ------------------------------ arama satırları ------------------------------ */

/** Eşleşen parçayı koyu yazar (Türkçe büyük / küçük harfe duyarsız). */
function Highlight({ text, needle }: { text: string; needle: string }) {
  const hay = lower(text);
  const key = lower(needle.trim());
  const at = key && hay.length === text.length ? hay.indexOf(key) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Text style={styles.match}>{text.slice(at, at + key.length)}</Text>
      {text.slice(at + key.length)}
    </>
  );
}

/** Uzun mesajda eşleşmenin göründüğü yerden başlayan kesit. */
function excerpt(text: string, needle: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = lower(flat).indexOf(lower(needle.trim()));
  return at > 28 ? `…${flat.slice(at - 18)}` : flat;
}

export const HitRow = memo(function HitRow({
  hit,
  conversation,
  query,
  onPress,
}: {
  hit: ChatSearchHit;
  /** Sonucun sohbeti (avatar için); listede yoksa türüne göre simge çizilir. */
  conversation?: ChatConversation;
  query: string;
  onPress: (hit: ChatSearchHit) => void;
}) {
  const summary = messageSummary(hit);
  const title = conversation?.title ?? hit.conversation_title ?? "Sohbet";
  const who = hit.sender.is_me ? "Sen: " : hit.sender.name && isGroupChat(conversation ?? { type: hit.conversation_type ?? "direct" }) ? `${String(hit.sender.name).split(" ")[0]}: ` : "";
  return (
    <Touchable feedback="row" haptic="selection" onPress={() => onPress(hit)} accessibilityRole="button" accessibilityLabel={`${title}: ${summary.text}`} accessibilityHint="Sohbeti bu mesajda açar" style={styles.row}>
      <InboxAvatar
        type={conversation?.type ?? hit.conversation_type ?? "direct"}
        title={title}
        image={conversation?.avatar ?? conversation?.entity?.avatar ?? null}
        seed={conversation?.other_user?.user_id ?? hit.conversation_id}
      />
      <View style={styles.body}>
        <View style={styles.line}>
          <View style={styles.who}>
            <Text style={styles.name} numberOfLines={1} {...textScale.dense}>{title}</Text>
          </View>
          <Text style={styles.time} numberOfLines={1} {...textScale.badge}>{listTime(hit.created_at)}</Text>
        </View>
        <View style={styles.line}>
          {summary.icon ? <Ionicons name={summary.icon} size={15} color={colors.textTertiary} /> : null}
          <Text style={styles.preview} numberOfLines={1} {...textScale.dense}>
            {who}
            <Highlight text={excerpt(summary.text, query)} needle={query} />
          </Text>
        </View>
      </View>
    </Touchable>
  );
});

/** Arama ▸ Kişiler: henüz sohbeti olmayan rehber kişisi; dokununca sohbet açılır. */
export const PersonRow = memo(function PersonRow({ user, query, onPress }: { user: ChatUser; query: string; onPress: (user: ChatUser) => void }) {
  const sub = user.team_name || user.subtitle || "";
  return (
    <Touchable feedback="row" haptic="selection" onPress={() => onPress(user)} accessibilityRole="button" accessibilityLabel={`${user.name}${sub ? `, ${sub}` : ""}`} accessibilityHint="Sohbet başlatır" style={styles.row}>
      <InboxAvatar type="person" title={user.name} image={user.avatar} seed={user.user_id} />
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            <Highlight text={user.name} needle={query} />
          </Text>
        </View>
        {sub ? (
          <View style={styles.line}>
            <Text style={styles.preview} numberOfLines={1} {...textScale.dense}>{sub}</Text>
          </View>
        ) : null}
      </View>
    </Touchable>
  );
});

/* ------------------------------ özel satırlar ------------------------------ */

export const ArchiveRow = memo(function ArchiveRow({ count, unread, onPress }: { count: number; unread: number; onPress: () => void }) {
  return (
    <Touchable feedback="row" haptic="selection" onPress={onPress} accessibilityRole="button" accessibilityLabel={`Arşivlenmiş sohbetler, ${count} sohbet${unread ? `, ${unread} okunmamış` : ""}`} style={styles.archive}>
      <View style={styles.archiveIcon}>
        <Ionicons name="archive-outline" size={22} color={colors.textSecondary} />
      </View>
      <View style={styles.archiveBody}>
        <Text style={styles.archiveLabel} numberOfLines={1} {...textScale.dense}>Arşivlenmiş</Text>
        <Text style={[styles.archiveCount, unread ? styles.timeUnread : null]} {...textScale.badge}>{unread || count}</Text>
      </View>
    </Touchable>
  );
});

export const InboxSection = memo(function InboxSection({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.section} accessibilityRole="header">
      <Text style={styles.sectionText} numberOfLines={1} {...textScale.badge}>{title}</Text>
      {count ? <Text style={styles.sectionCount} {...textScale.badge}>{count}</Text> : null}
    </View>
  );
});

export const InboxNote = memo(function InboxNote({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteText} numberOfLines={1} {...textScale.dense}>{text}</Text>
    </View>
  );
});

/* --------------------------------- iskelet --------------------------------- */

const SKELETON_WIDTHS: [`${number}%`, `${number}%`][] = [["46%", "78%"], ["58%", "62%"], ["38%", "84%"], ["52%", "56%"], ["44%", "72%"], ["62%", "66%"], ["40%", "80%"], ["50%", "60%"]];

/** Gerçek satırın geometrisi: 54 px daire, iki satır, sağda saat. */
export const InboxSkeleton = memo(function InboxSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View accessibilityLabel="Sohbetler yükleniyor" accessibilityRole="progressbar">
      {SKELETON_WIDTHS.slice(0, count).map(([name, preview], index) => (
        <View key={index} style={styles.row}>
          <Skeleton width={AVATAR} height={AVATAR} radius="pill" />
          <View style={styles.body}>
            <View style={styles.line}>
              <View style={styles.who}><Skeleton width={name} height={14} /></View>
              <Skeleton width={34} height={10} />
            </View>
            <Skeleton width={preview} height={12} style={styles.skeletonPreview} />
          </View>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  /* Satır: sol 16 px boşluk + avatar + 12 px; gövde sağ kenara kadar uzanır ve
     ayracı taşır (ayraç avatarın SAĞINDAN başlar, kenara dayanır). */
  row: { height: INBOX_ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: space.md, paddingLeft: layout.screenPadding },
  body: { flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center", gap: space.xxs, paddingRight: layout.screenPadding, borderBottomWidth: hairline, borderBottomColor: colors.border },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  who: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.xs },
  name: { ...type.h3, fontSize: type.article.fontSize, lineHeight: type.h2.lineHeight, color: colors.textPrimary, flexShrink: 1 },
  nameUnread: { fontFamily: fonts.heading },
  aside: { ...type.bodySm, color: colors.textTertiary, flexShrink: 4, maxWidth: "42%" },
  kind: { height: 18, paddingHorizontal: space.s, borderRadius: radius.xs, justifyContent: "center", backgroundColor: colors.surface3 },
  kindText: { ...type.labelXs, color: colors.textSecondary },
  time: { ...type.bodySm, fontFamily: fonts.medium, color: colors.textTertiary },
  timeUnread: { color: colors.brandAccent, fontFamily: fonts.semibold },

  previewRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.xs },
  preview: { ...type.body, color: colors.textSecondary, flex: 1 },
  previewUnread: { color: colors.textPrimary, fontFamily: fonts.medium },
  previewDeleted: { fontStyle: "italic" },
  draft: { color: colors.warn, fontFamily: fonts.semibold },
  match: { color: colors.brandAccent, fontFamily: fonts.semibold },

  marks: { flexDirection: "row", alignItems: "center", gap: space.s },
  mention: { width: 20, height: 20, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  badge: { minWidth: 20, height: 20, paddingHorizontal: space.s, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  badgeMuted: { backgroundColor: colors.textTertiary },
  badgeText: { ...type.numSmStrong, color: colors.textOnBrand },
  dot: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: colors.brand },

  avatar: { width: AVATAR, height: AVATAR },
  avatarFill: { width: AVATAR, height: AVATAR, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  avatarCrest: { backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  avatarOfficial: { backgroundColor: colors.brand },
  avatarInitials: { ...type.h1, fontFamily: fonts.semibold },
  /* Çevrimiçi noktası: liste zemini renginde halkayla avatardan ayrılır. */
  online: { position: "absolute", right: 0, bottom: 0, width: 16, height: 16, borderRadius: radius.pill, borderWidth: 2.5, borderColor: colors.bg, backgroundColor: colors.win },

  archive: { height: INBOX_ARCHIVE_HEIGHT, flexDirection: "row", alignItems: "center", gap: space.md, paddingLeft: layout.screenPadding },
  archiveIcon: { width: AVATAR, alignItems: "center" },
  archiveBody: { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: space.sm, paddingRight: layout.screenPadding, borderBottomWidth: hairline, borderBottomColor: colors.border },
  archiveLabel: { ...type.h3, color: colors.textPrimary, flex: 1 },
  archiveCount: { ...type.numSmStrong, color: colors.textTertiary },

  section: { height: INBOX_SECTION_HEIGHT, flexDirection: "row", alignItems: "flex-end", gap: space.s, paddingHorizontal: layout.screenPadding, paddingBottom: space.s },
  sectionText: { ...type.overline, color: colors.textTertiary },
  sectionCount: { ...type.overline, color: colors.textDisabled },
  note: { height: INBOX_NOTE_HEIGHT, justifyContent: "center", paddingHorizontal: layout.screenPadding },
  noteText: { ...type.bodySm, color: colors.textSecondary },
  skeletonPreview: { marginTop: space.xs },
});
