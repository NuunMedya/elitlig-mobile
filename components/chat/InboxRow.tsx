/**
 * SOHBET LİSTESİ SATIRLARI — Gece teması (ikinci tur).
 *
 *   ┌──────────────────────────────────────────────────────────┐  ← tek kart
 *   │ (◯ halka)  Ad  ✓ [TAKIM]                          14:05 │     (satırlar arasında
 *   │  avatar    tik  Ali: fotoğraf          @  🔇  📌  (3)    │      girintili ayraç)
 *   ├──────────── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
 *
 *   · KART: liste tek bir yüzey kartıdır (radius xl). İlk satır üst, son satır
 *     alt köşeleri yuvarlar (`position`); arada `dividers.inset` gibi avatarın
 *     sağından başlayan ince çizgi. Sanal liste bozulmasın diye kart, satırların
 *     kendi zeminiyle çizilir — FlatList'i saran bir kutu yoktur.
 *   · AVATAR: 50 px. Okunmamış sohbette avatarın çevresinde İMZA DEGRADESİ
 *     (mor→camgöbeği) halka; çevrimiçi kişide sağ altta nane nokta.
 *     Grup / takım avatarı degrade ikon karosu, resmî sohbet mor degrade daire.
 *   · SAYAÇ: okunmamış sayısı mor degrade (gradientBrand) hap + hafif parıltı;
 *     sessiz sohbette düz gri. Okunmamış satırda ad kalın, saat mor.
 *   · KAYDIRMA (Swipe actions): satır sağa çekilince altından "Okundu /
 *     Okunmadı" (camgöbeği), sola çekilince "Arşivle" (altın) eylem karosu
 *     belirir; eşik geçilip bırakılırsa eylem çalışır, satır yaylanarak yerine
 *     döner. `react-native-gesture-handler` kurulu olmadığı için RN'in
 *     `PanResponder`ı kullanılır; dikey kaydırmayı çalmasın diye yalnız belirgin
 *     yatay hareket yakalanır. Aynı eylemler uzun basma menüsünde de vardır.
 *
 * ÖLÇÜ SABİTTİR: her sohbet / arama / kişi satırı 72 px'tir; liste
 * `getItemLayout` ile ölçmeden sanallaştırılır.
 *
 * PERFORMANS: satırlar `memo`dur ve yalnız kendi sohbet nesnesi değişince
 * çizilir. Yazıyor…, taslak ve çevrimiçi durumunu satır KENDİ okur
 * (`useSyncExternalStore`); bu olaylar listeyi yeniden çizmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, PanResponder, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { TypingLine } from "@/components/chat/ChatHeader";
import { useOnline } from "@/components/chat/inboxPresence";
import { Ticks } from "@/components/chat/MessageBubble";
import { Skeleton, Touchable, fireHaptic } from "@/components/chat/kit";
import { useReduceMotion } from "@/components/ui";
import { useTypingNames } from "@/hooks/useChat";
import type { ChatConversation, ChatSearchHit, ChatUser, ConversationType } from "@/lib/api/chat";
import { useDraft } from "@/lib/chatDrafts";
import { avatarTone, colors, wa } from "@/lib/chatPalette";
import { chatPreview, isGroupChat, isUnread, listTime, messageSummary, tickStatus } from "@/lib/chatUtils";
import { initials, mediaUrl } from "@/lib/format";
import { fonts, glowStyle, hairline, layout, palette, radius, space, spring, textScale, type } from "@/theme";

/** Sohbet, mesaj sonucu ve kişi satırının yüksekliği. */
export const INBOX_ROW_HEIGHT = 72;
export const INBOX_ARCHIVE_HEIGHT = 64;
export const INBOX_SECTION_HEIGHT = 40;
export const INBOX_NOTE_HEIGHT = 48;

/** Kart içindeki konum: köşe yuvarlaması ve ayraç buna göre çizilir. */
export type RowPosition = "single" | "first" | "middle" | "last";

const AVATAR = 50;
const AVATAR_BOX = 56;
const SWIPE_TRIGGER = 76;
const SWIPE_MAX = 112;
const KIND_LABEL: Record<string, string> = { team: "Takım", player: "Oyuncu", member: "Üye", general: "Genel", staff: "Ekip" };
const lower = (value: string) => value.toLocaleLowerCase("tr-TR");

/** Degrade yönü: sağdan sola. */
const G_START = { x: 1, y: 0.5 } as const;
const G_END = { x: 0, y: 0.5 } as const;

const roundFor = (position: RowPosition) =>
  position === "single" ? styles.cardSingle : position === "first" ? styles.cardFirst : position === "last" ? styles.cardLast : null;

/* --------------------------------- avatar --------------------------------- */

export interface InboxAvatarProps {
  type: ConversationType | "person";
  title: string;
  image?: string | null;
  /** Sohbet / kişi kimliği (çağıranlar verir; avatar rengi artık sohbete göre değişmez). */
  seed?: number | string;
  /** Yönetim gelen kutusu: yazışmanın sahibi (takım / oyuncu / üye) gösterilir. */
  owner?: boolean;
  online?: boolean;
  /** Okunmamış: avatarın çevresinde imza degradesi halka. */
  ring?: boolean;
  /** Avatar çapı (varsayılan 50). */
  size?: number;
}

/**
 * Fotoğraf → takım arması (kırpılmadan) → resmî sohbet (mor degrade daire) →
 * grup / takım (degrade ikon karosu) → baş harfler (sakin gri daire).
 */
export const InboxAvatar = memo(function InboxAvatar({ type: kind, title, image, owner = false, online = false, ring = false, size = AVATAR }: InboxAvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  const uri = failed ? null : mediaUrl(image);
  const official = !owner && (kind === "management" || kind === "admin");
  const group = kind === "group" || kind === "team";
  const box = size + 6;
  const fill = { width: size, height: size, borderRadius: radius.pill };
  const dot = Math.max(12, Math.round(size * 0.3));
  const tileFill = official ? colors.gradientBrand : kind === "team" ? colors.tileTones.violet : colors.tileTones.cyan;

  return (
    <View style={[styles.avatarBox, { width: box, height: box }]}>
      {ring ? (
        <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.ring]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.ring, styles.ringIdle]} />
      )}
      <View style={[styles.avatarInner, { width: size + 2, height: size + 2 }]}>
        {uri ? (
          <Image
            source={{ uri }}
            style={[fill, kind === "team" ? styles.avatarCrest : null]}
            resizeMode={kind === "team" ? "contain" : "cover"}
            // Profil fotoğrafları kamera çıktısıdır; "resize" olmadan Android'de tam boyutta çözülür.
            resizeMethod="resize"
            onError={() => setFailed(true)}
          />
        ) : official || group ? (
          <View style={[fill, styles.avatarCenter, styles.clip]}>
            <LinearGradient
              colors={tileFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name={official ? (kind === "admin" ? "notifications" : "shield-checkmark") : kind === "team" ? "shield-half" : "people"} size={Math.round(size * 0.46)} color={colors.onDark} />
          </View>
        ) : (
          <View style={[fill, styles.avatarCenter, styles.avatarPlain]}>
            <Text style={[styles.avatarInitials, size < 44 ? styles.avatarInitialsSm : null]} numberOfLines={1} {...textScale.badge}>{initials(title)}</Text>
          </View>
        )}
      </View>
      {online ? <View style={[styles.online, { width: dot, height: dot }]} /> : null}
    </View>
  );
});

/* ------------------------------ kaydırma kabuğu ------------------------------ */

export type SwipeAction = "archive" | "read" | "unread";

interface SwipeShellProps {
  enabled: boolean;
  /** Sağa çekince (sol karo). */
  leftAction?: { key: SwipeAction; label: string; icon: keyof typeof Ionicons.glyphMap };
  /** Sola çekince (sağ karo). */
  rightAction?: { key: SwipeAction; label: string; icon: keyof typeof Ionicons.glyphMap };
  onAction: (key: SwipeAction) => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

function SwipeShell({ enabled, leftAction, rightAction, onAction, style, children }: SwipeShellProps) {
  const reduceMotion = useReduceMotion();
  const dx = useRef(new Animated.Value(0)).current;
  const armed = useRef(false);
  const latest = useRef({ leftAction, rightAction, onAction, reduceMotion });
  latest.current = { leftAction, rightAction, onAction, reduceMotion };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => enabled && Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          const { leftAction: l, rightAction: r } = latest.current;
          let x = g.dx;
          if (x > 0 && !l) x = 0;
          if (x < 0 && !r) x = 0;
          // Eşikten sonra direnç: çekiş yavaşlar.
          const sign = Math.sign(x);
          const abs = Math.abs(x);
          const eased = abs > SWIPE_TRIGGER ? SWIPE_TRIGGER + (abs - SWIPE_TRIGGER) * 0.35 : abs;
          dx.setValue(sign * Math.min(eased, SWIPE_MAX));
          const nowArmed = abs > SWIPE_TRIGGER;
          if (nowArmed !== armed.current) {
            armed.current = nowArmed;
            if (nowArmed) fireHaptic("light");
          }
        },
        onPanResponderRelease: (_e, g) => {
          const { leftAction: l, rightAction: r, onAction: run, reduceMotion: still } = latest.current;
          if (armed.current) {
            const action = g.dx > 0 ? l : r;
            if (action) {
              fireHaptic("success");
              run(action.key);
            }
          }
          armed.current = false;
          if (still) dx.setValue(0);
          else Animated.spring(dx, { toValue: 0, ...spring.slide }).start();
        },
        onPanResponderTerminate: () => {
          armed.current = false;
          Animated.spring(dx, { toValue: 0, ...spring.slide }).start();
        },
      }),
    [dx, enabled],
  );

  const leftReveal = dx.interpolate({ inputRange: [0, 24, SWIPE_TRIGGER], outputRange: [0, 0.4, 1], extrapolate: "clamp" });
  const rightReveal = dx.interpolate({ inputRange: [-SWIPE_TRIGGER, -24, 0], outputRange: [1, 0.4, 0], extrapolate: "clamp" });
  const leftIcon = dx.interpolate({ inputRange: [0, SWIPE_TRIGGER, SWIPE_MAX], outputRange: [0.6, 1, 1.15], extrapolate: "clamp" });
  const rightIcon = dx.interpolate({ inputRange: [-SWIPE_MAX, -SWIPE_TRIGGER, 0], outputRange: [1.15, 1, 0.6], extrapolate: "clamp" });

  return (
    <View style={[styles.shell, style]}>
      {leftAction ? (
        <Animated.View style={[styles.swipeLayer, styles.swipeLeft, { opacity: leftReveal }]} pointerEvents="none">
          <LinearGradient colors={colors.tileTones.cyan} start={G_END} end={G_START} style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.swipeContent, { transform: [{ scale: leftIcon }] }]}>
            <Ionicons name={leftAction.icon} size={20} color={colors.onDark} />
            <Text style={styles.swipeLabel} {...textScale.badge}>{leftAction.label}</Text>
          </Animated.View>
        </Animated.View>
      ) : null}
      {rightAction ? (
        <Animated.View style={[styles.swipeLayer, styles.swipeRight, { opacity: rightReveal }]} pointerEvents="none">
          <LinearGradient colors={colors.tileTones.gold} start={G_START} end={G_END} style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.swipeContent, { transform: [{ scale: rightIcon }] }]}>
            <Ionicons name={rightAction.icon} size={20} color={colors.onDark} />
            <Text style={styles.swipeLabel} {...textScale.badge}>{rightAction.label}</Text>
          </Animated.View>
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.slide, { transform: [{ translateX: dx }] }]} {...(enabled ? responder.panHandlers : null)}>
        {children}
      </Animated.View>
    </View>
  );
}

/* ------------------------------ sohbet satırı ------------------------------ */

export interface ConversationRowProps {
  conversation: ChatConversation;
  /** Yönetimin ortak gelen kutusundaki (üye mesajları) yazışma. */
  inbox: boolean;
  /** Oturumdaki kullanıcı: son mesajda bana @bahsedildi mi diye bakılır. */
  meId: number | null;
  onPress: (conversation: ChatConversation, inbox: boolean) => void;
  onLongPress: (conversation: ChatConversation, inbox: boolean) => void;
  /** Kart içindeki konum (varsayılan tek satır). */
  position?: RowPosition;
  /** Kaydırma eylemi (verilmezse satır kaydırılmaz). */
  onSwipe?: (conversation: ChatConversation, action: SwipeAction) => void;
}

export const ConversationRow = memo(function ConversationRow({ conversation, inbox, meId, onPress, onLongPress, position = "single", onSwipe }: ConversationRowProps) {
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
  const kind = inbox ? KIND_LABEL[conversation.entity?.kind ?? "member"] ?? "Üye" : conversation.type === "team" ? "Takım" : null;
  const aside = inbox
    ? (conversation.subtitle ?? "").replace(/^(Takım|Oyuncu|Üye)\s*·\s*/, "")
    : conversation.other_user?.team_name && conversation.other_user.team_name !== conversation.title
      ? conversation.other_user.team_name
      : "";

  const state = conversation.unread > 0 ? `, ${conversation.unread} okunmamış mesaj` : conversation.marked_unread ? ", okunmadı olarak işaretli" : "";
  const summary = typing ? "yazıyor" : draft ? `Taslak: ${draft}` : `${preview.prefix}${preview.text}`;
  const swipeable = Boolean(onSwipe) && !inbox;

  return (
    <SwipeShell
      enabled={swipeable}
      leftAction={swipeable ? (unread ? { key: "read", label: "Okundu", icon: "checkmark-done" } : { key: "unread", label: "Okunmadı", icon: "mail-unread" }) : undefined}
      rightAction={swipeable ? { key: "archive", label: conversation.archived ? "Çıkar" : "Arşivle", icon: "archive" } : undefined}
      onAction={(key) => onSwipe?.(conversation, key)}
      style={[styles.cardRow, roundFor(position)]}
    >
      <Touchable
        feedback="row"
        haptic="selection"
        onPress={() => onPress(conversation, inbox)}
        onLongPress={() => onLongPress(conversation, inbox)}
        delayLongPress={280}
        accessibilityRole="button"
        accessibilityLabel={`${conversation.title}${kind ? `, ${kind}` : ""}${state}. ${summary}`}
        accessibilityHint="Sohbet seçenekleri için basılı tut; okundu ya da arşiv için yana kaydır"
        style={[styles.row, styles.rowSurface, roundFor(position)]}
      >
        {conversation.pinned ? <View style={styles.pinStrip} /> : null}
        <InboxAvatar
          type={conversation.type}
          title={conversation.title}
          image={conversation.avatar ?? conversation.entity?.avatar ?? null}
          seed={conversation.other_user?.user_id ?? conversation.entity?.id ?? conversation.id}
          owner={conversation.type === "management" && Boolean(conversation.entity)}
          online={online}
          ring={unread && !conversation.muted}
        />
        <View style={styles.body}>
          <View style={styles.line}>
            <View style={styles.who}>
              <Text style={[styles.name, unread ? styles.nameUnread : null]} numberOfLines={1} {...textScale.dense}>{conversation.title}</Text>
              {verified ? <Ionicons name="checkmark-circle" size={15} color={colors.brandAccent} accessibilityLabel="Resmî sohbet" /> : null}
              {kind ? (
                <View style={styles.kind}>
                  <Text style={styles.kindText} numberOfLines={1} {...textScale.badge}>{kind.toLocaleUpperCase("tr-TR")}</Text>
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
                {mineLast ? <Ticks status={tickStatus(last)} size={15} color={wa.tickSent} /> : null}
                {preview.icon ? (
                  <View style={styles.previewIcon}>
                    <Ionicons name={preview.icon} size={11} color={colors.brandAccent} />
                  </View>
                ) : null}
                <Text style={[styles.preview, preview.deleted ? styles.previewDeleted : null, unread ? styles.previewUnread : null]} numberOfLines={1} {...textScale.dense}>
                  {prefix ? <Text style={styles.previewWho}>{prefix}</Text> : null}
                  {preview.text}
                </Text>
              </View>
            )}
            <View style={styles.marks}>
              {mentioned ? (
                <View style={styles.mention} accessibilityLabel="Senden bahsedildi">
                  <Ionicons name="at" size={12} color={palette.textOnBrand} />
                </View>
              ) : null}
              {conversation.muted ? <Ionicons name="notifications-off" size={14} color={colors.textTertiary} /> : null}
              {conversation.pinned ? <Ionicons name="pin" size={14} color={colors.brandAccent} accessibilityLabel="Sabitlenmiş" /> : null}
              {conversation.unread > 0 ? (
                conversation.muted ? (
                  <View style={[styles.badge, styles.badgeMuted]}>
                    <Text style={[styles.badgeText, styles.badgeTextMuted]} {...textScale.badge}>{conversation.unread > 99 ? "99+" : conversation.unread}</Text>
                  </View>
                ) : (
                  <View style={[styles.badge, glowStyle(colors.glow, 1)]}>
                    <LinearGradient colors={colors.gradientBrand} start={G_START} end={G_END} style={[StyleSheet.absoluteFill, styles.badgeFill]} />
                    <Text style={styles.badgeText} {...textScale.badge}>{conversation.unread > 99 ? "99+" : conversation.unread}</Text>
                  </View>
                )
              ) : conversation.marked_unread ? (
                <View style={styles.dot} />
              ) : null}
            </View>
          </View>
        </View>
        {position === "middle" || position === "last" ? <View style={styles.divider} /> : null}
      </Touchable>
    </SwipeShell>
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
  position = "single",
}: {
  hit: ChatSearchHit;
  /** Sonucun sohbeti (avatar için); listede yoksa türüne göre simge çizilir. */
  conversation?: ChatConversation;
  query: string;
  onPress: (hit: ChatSearchHit) => void;
  position?: RowPosition;
}) {
  const summary = messageSummary(hit);
  const title = conversation?.title ?? hit.conversation_title ?? "Sohbet";
  const who = hit.sender.is_me ? "Sen: " : hit.sender.name && isGroupChat(conversation ?? { type: hit.conversation_type ?? "direct" }) ? `${String(hit.sender.name).split(" ")[0]}: ` : "";
  return (
    <View style={[styles.cardRow, roundFor(position)]}>
      <Touchable feedback="row" haptic="selection" onPress={() => onPress(hit)} accessibilityRole="button" accessibilityLabel={`${title}: ${summary.text}`} accessibilityHint="Sohbeti bu mesajda açar" style={[styles.row, styles.rowSurface, roundFor(position)]}>
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
            {summary.icon ? (
              <View style={styles.previewIcon}>
                <Ionicons name={summary.icon} size={11} color={colors.brandAccent} />
              </View>
            ) : null}
            <Text style={styles.preview} numberOfLines={1} {...textScale.dense}>
              {who}
              <Highlight text={excerpt(summary.text, query)} needle={query} />
            </Text>
          </View>
        </View>
        {position === "middle" || position === "last" ? <View style={styles.divider} /> : null}
      </Touchable>
    </View>
  );
});

/** Arama ▸ Kişiler: henüz sohbeti olmayan rehber kişisi; dokununca sohbet açılır. */
export const PersonRow = memo(function PersonRow({ user, query, onPress, position = "single" }: { user: ChatUser; query: string; onPress: (user: ChatUser) => void; position?: RowPosition }) {
  const sub = user.team_name || user.subtitle || "";
  return (
    <View style={[styles.cardRow, roundFor(position)]}>
      <Touchable feedback="row" haptic="selection" onPress={() => onPress(user)} accessibilityRole="button" accessibilityLabel={`${user.name}${sub ? `, ${sub}` : ""}`} accessibilityHint="Sohbet başlatır" style={[styles.row, styles.rowSurface, roundFor(position)]}>
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
        <View style={styles.startChip}>
          <Ionicons name="chatbubble-outline" size={14} color={colors.brandAccent} />
        </View>
        {position === "middle" || position === "last" ? <View style={styles.divider} /> : null}
      </Touchable>
    </View>
  );
});

/* ------------------------------ özel satırlar ------------------------------ */

export const ArchiveRow = memo(function ArchiveRow({ count, unread, onPress }: { count: number; unread: number; onPress: () => void }) {
  return (
    <View style={styles.archiveWrap}>
      <Touchable feedback="card" haptic="selection" onPress={onPress} accessibilityRole="button" accessibilityLabel={`Arşivlenmiş sohbetler, ${count} sohbet${unread ? `, ${unread} okunmamış` : ""}`} style={styles.archive}>
        <View style={styles.archiveIcon}>
          <Ionicons name="archive" size={17} color={colors.brandAccent} />
        </View>
        <View style={styles.archiveBody}>
          <Text style={styles.archiveLabel} numberOfLines={1} {...textScale.dense}>Arşivlenmiş</Text>
          <Text style={styles.archiveMeta} numberOfLines={1} {...textScale.dense}>{unread ? `${unread} okunmamış sohbet` : `${count} sohbet saklanıyor`}</Text>
        </View>
        <Text style={styles.archiveCount} {...textScale.badge}>{count}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </Touchable>
    </View>
  );
});

export const InboxSection = memo(function InboxSection({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.section} accessibilityRole="header">
      <View style={styles.sectionMark} />
      <Text style={styles.sectionText} numberOfLines={1} {...textScale.badge}>{title}</Text>
      {count ? (
        <View style={styles.sectionCountPill}>
          <Text style={styles.sectionCount} {...textScale.badge}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
});

export const InboxNote = memo(function InboxNote({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <Ionicons name="sparkles-outline" size={14} color={colors.brandAccent} />
      <Text style={styles.noteText} numberOfLines={1} {...textScale.dense}>{text}</Text>
    </View>
  );
});

/* ------------------------------ hızlı erişim ------------------------------ */

export const QUICK_RAIL_HEIGHT = 112;

const RailItem = memo(function RailItem({ conversation, onPress }: { conversation: ChatConversation; onPress: (conversation: ChatConversation, inbox: boolean) => void }) {
  const online = useOnline(conversation.type === "direct" ? conversation.other_user?.user_id : null);
  const unread = isUnread(conversation);
  const first = conversation.type === "direct" ? conversation.title.split(" ")[0] : conversation.title;
  return (
    <Touchable
      feedback="chip"
      haptic="selection"
      onPress={() => onPress(conversation, false)}
      accessibilityRole="button"
      accessibilityLabel={`${conversation.title}${conversation.unread ? `, ${conversation.unread} okunmamış` : ""}${online ? ", çevrimiçi" : ""}`}
      style={styles.railItem}
    >
      <View>
        <InboxAvatar type={conversation.type} title={conversation.title} image={conversation.avatar ?? null} online={online} ring={unread} size={52} />
        {conversation.unread > 0 ? (
          <View style={[styles.railBadge, conversation.muted ? styles.badgeMuted : null]}>
            {conversation.muted ? null : <LinearGradient colors={colors.gradientBrand} start={G_START} end={G_END} style={[StyleSheet.absoluteFill, styles.badgeFill]} />}
            <Text style={[styles.railBadgeText, conversation.muted ? styles.badgeTextMuted : null]} {...textScale.badge}>{conversation.unread > 99 ? "99+" : conversation.unread}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.railName, unread ? styles.railNameUnread : null]} numberOfLines={1} {...textScale.badge}>{first}</Text>
    </Touchable>
  );
});

/**
 * Hızlı erişim şeridi: sabitlenenler ve son konuşulanlar büyük, halkalı
 * avatarlar olarak yatay dizilir (okunmamışta imza halkası, çevrimiçide nokta).
 * Başlık satırı toplam okunmamış sayısını söyler.
 */
export const QuickRail = memo(function QuickRail({ items, unread, onPress }: { items: ChatConversation[]; unread: number; onPress: (conversation: ChatConversation, inbox: boolean) => void }) {
  return (
    <View style={styles.rail}>
      <View style={styles.railHead}>
        <View style={styles.sectionMark} />
        <Text style={styles.sectionText} numberOfLines={1} {...textScale.badge}>HIZLI ERİŞİM</Text>
        <View style={styles.railSpacer} />
        {unread > 0 ? (
          <Text style={styles.railUnread} {...textScale.badge}>
            <Text style={styles.railUnreadNum}>{unread}</Text> okunmamış mesaj
          </Text>
        ) : (
          <Text style={styles.railUnread} {...textScale.badge}>Hepsi okundu</Text>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railTrack}>
        {items.map((conversation) => (
          <RailItem key={conversation.id} conversation={conversation} onPress={onPress} />
        ))}
      </ScrollView>
    </View>
  );
});

/* --------------------------------- iskelet --------------------------------- */

const SKELETON_WIDTHS: [`${number}%`, `${number}%`][] = [["46%", "78%"], ["58%", "62%"], ["38%", "84%"], ["52%", "56%"], ["44%", "72%"], ["62%", "66%"], ["40%", "80%"], ["50%", "60%"]];

/** Gerçek satırın geometrisi: tek kart, halkalı daire, iki satır, sağda saat. */
export const InboxSkeleton = memo(function InboxSkeleton({ count = 8 }: { count?: number }) {
  const widths = SKELETON_WIDTHS.slice(0, count);
  return (
    <View accessibilityLabel="Sohbetler yükleniyor" accessibilityRole="progressbar">
      {widths.map(([name, preview], index) => {
        const position: RowPosition = widths.length === 1 ? "single" : index === 0 ? "first" : index === widths.length - 1 ? "last" : "middle";
        return (
          <View key={index} style={[styles.cardRow, roundFor(position)]}>
            <View style={[styles.row, styles.rowSurface, roundFor(position)]}>
              <View style={styles.skeletonAvatar}>
                <Skeleton width={AVATAR} height={AVATAR} radius="pill" />
              </View>
              <View style={styles.body}>
                <View style={styles.line}>
                  <View style={styles.who}><Skeleton width={name} height={13} /></View>
                  <Skeleton width={32} height={9} />
                </View>
                <Skeleton width={preview} height={11} style={styles.skeletonPreview} />
              </View>
              {index > 0 ? <View style={styles.divider} /> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
});

const DIVIDER_LEFT = space.md + AVATAR_BOX + space.md;

const styles = StyleSheet.create({
  /* Kart satırı: ekran kenarından içeride, zemin yüzey rengi. */
  cardRow: { marginHorizontal: layout.screenPadding, backgroundColor: colors.surface1, overflow: "hidden" },
  cardSingle: { borderRadius: radius.xl },
  cardFirst: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  cardLast: { borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  shell: {},
  slide: { backgroundColor: colors.surface1 },
  row: { height: INBOX_ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: space.md, paddingLeft: space.md },
  rowSurface: { backgroundColor: colors.surface1 },
  divider: { position: "absolute", top: 0, left: DIVIDER_LEFT, right: 0, height: hairline, backgroundColor: colors.border },
  pinStrip: { position: "absolute", left: 0, top: space.md, bottom: space.md, width: 3, borderTopRightRadius: radius.xs, borderBottomRightRadius: radius.xs, backgroundColor: colors.brand },
  body: { flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center", gap: space.xxs + 1, paddingRight: space.md },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  who: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.xs },
  name: { ...type.h3, color: colors.textPrimary, flexShrink: 1 },
  nameUnread: { fontFamily: fonts.heading },
  aside: { ...type.caption, color: colors.textTertiary, flexShrink: 4, maxWidth: "42%" },
  kind: { height: 16, paddingHorizontal: space.xs + 1, borderRadius: radius.xs, justifyContent: "center", backgroundColor: colors.brandDim },
  kindText: { ...type.micro, color: colors.brandAccent },
  time: { ...type.numSm, color: wa.listMeta },
  timeUnread: { color: wa.unreadTime, fontFamily: fonts.bold },

  previewRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.xs },
  previewIcon: { width: 18, height: 18, borderRadius: radius.xs, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  preview: { ...type.bodySm, color: wa.listMeta, flex: 1 },
  previewWho: { fontFamily: fonts.semibold, color: colors.textSecondary },
  previewUnread: { color: colors.textSecondary },
  previewDeleted: { fontStyle: "italic" },
  draft: { color: colors.danger, fontFamily: fonts.semibold },
  match: { color: colors.brandAccent, fontFamily: fonts.semibold },

  marks: { flexDirection: "row", alignItems: "center", gap: space.s },
  mention: { width: 20, height: 20, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.live },
  badge: { minWidth: 22, height: 22, paddingHorizontal: space.s, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  badgeFill: { borderRadius: radius.pill },
  badgeMuted: { backgroundColor: wa.badgeMuted },
  badgeText: { ...type.numSmStrong, color: palette.textOnBrand },
  badgeTextMuted: { color: wa.onBadgeMuted },
  dot: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: colors.brand },

  avatarBox: { alignItems: "center", justifyContent: "center" },
  ring: { borderRadius: radius.pill },
  ringIdle: { borderWidth: hairline, borderColor: colors.border },
  avatarInner: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface1 },
  avatarCenter: { alignItems: "center", justifyContent: "center" },
  avatarPlain: { backgroundColor: avatarTone.bg },
  clip: { overflow: "hidden" },
  avatarCrest: { backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  avatarInitials: { ...type.h2, color: avatarTone.ink },
  avatarInitialsSm: { ...type.label },
  /* Çevrimiçi noktası: kart zemini renginde halkayla avatardan ayrılır. */
  online: { position: "absolute", right: 1, bottom: 1, borderRadius: radius.pill, borderWidth: 2.5, borderColor: colors.surface1, backgroundColor: wa.online },

  /* Kaydırma karoları: satırın altında, kart köşeleriyle kırpılır. */
  swipeLayer: { ...StyleSheet.absoluteFillObject, flexDirection: "row", alignItems: "center", paddingHorizontal: space.xl },
  swipeLeft: { justifyContent: "flex-start" },
  swipeRight: { justifyContent: "flex-end" },
  swipeContent: { alignItems: "center", gap: space.xxs },
  swipeLabel: { ...type.micro, color: colors.onDark },

  startChip: { width: 32, height: 32, marginRight: space.md, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },

  archiveWrap: { height: INBOX_ARCHIVE_HEIGHT, paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  archive: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  archiveIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  archiveBody: { flex: 1, minWidth: 0 },
  archiveLabel: { ...type.label, color: colors.textPrimary },
  archiveMeta: { ...type.caption, color: colors.textTertiary },
  archiveCount: { ...type.numSmStrong, color: colors.brandAccent },

  section: { height: INBOX_SECTION_HEIGHT, flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  sectionMark: { width: 3, height: 12, borderRadius: radius.pill, backgroundColor: colors.brand },
  sectionText: { ...type.overline, color: colors.textSecondary },
  sectionCountPill: { minWidth: 18, height: 16, paddingHorizontal: space.xs, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  sectionCount: { ...type.nano, color: colors.brandAccent },
  note: { height: INBOX_NOTE_HEIGHT, flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: layout.screenPadding },
  noteText: { ...type.bodySm, color: colors.textSecondary },
  rail: { height: QUICK_RAIL_HEIGHT, paddingTop: space.xs },
  railHead: { height: 22, flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: layout.screenPadding },
  railSpacer: { flex: 1 },
  railUnread: { ...type.caption, color: colors.textTertiary },
  railUnreadNum: { ...type.numSmStrong, color: colors.brandAccent },
  railTrack: { gap: space.xs, paddingHorizontal: layout.screenPadding - space.xs, paddingTop: space.sm },
  railItem: { width: 66, alignItems: "center", gap: space.xs },
  railName: { ...type.caption, color: colors.textSecondary, maxWidth: 64 },
  railNameUnread: { color: colors.textPrimary, fontFamily: fonts.semibold },
  railBadge: { position: "absolute", top: -2, right: -4, minWidth: 20, height: 20, paddingHorizontal: space.xs, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.bg, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  railBadgeText: { ...type.nano, color: palette.textOnBrand },
  skeletonAvatar: { width: AVATAR_BOX, alignItems: "center" },
  skeletonPreview: { marginTop: space.xs },
});
