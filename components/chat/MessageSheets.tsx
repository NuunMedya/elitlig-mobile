/**
 * MESAJ ALT SAYFALARI — uzun basınca açılan eylem menüsü (hızlı tepkiler +
 * yanıtla, ilet, yıldızla, sabitle, kopyala, düzenle, bilgi, sil), tepki
 * verenler, mesaj bilgisi (kimler okudu), anket oyları ve iletme hedefi seçimi.
 * Masaüstü Mesajlar'daki sağ tık menüsü ve pencerelerinin mobil karşılığı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { memo, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { Avatar, BottomSheet, Button, EmptyState, ErrorState, Input, SkeletonListRow, Touchable } from "@/components/ui";
import { useConversations } from "@/hooks/useChat";
import { getMessageInfo, type ChatConversation, type ChatMessage, type ChatParticipant } from "@/lib/api/chat";
import { MORE_REACTIONS, QUICK_REACTIONS, clockTime, dayLabel, filterChats, isGroupChat, messageSummary } from "@/lib/chatUtils";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ---------- eylem menüsü ---------- */

export interface MessageMenuItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  onPress: () => void;
}

export interface MessageMenuProps {
  message: ChatMessage | null;
  items: MessageMenuItem[];
  /** Verilmezse tepki satırı çizilmez (üye mesajları kutusu, silinmiş mesaj). */
  onReact?: (emoji: string) => void;
  onClose: () => void;
}

export function MessageMenu({ message, items, onReact, onClose }: MessageMenuProps) {
  const [more, setMore] = useState(false);
  const mine = message?.reactions?.find((item) => item.mine)?.emoji ?? null;
  const summary = message ? messageSummary(message) : null;
  const close = () => {
    setMore(false);
    onClose();
  };
  const react = (emoji: string) => {
    close();
    onReact?.(emoji);
  };
  return (
    <BottomSheet visible={Boolean(message)} onClose={close} snap="content">
      {summary ? (
        <View style={styles.preview}>
          {summary.icon ? <Ionicons name={summary.icon} size={14} color={colors.textSecondary} /> : null}
          <Text style={styles.previewText} numberOfLines={2} {...textScale.dense}>
            {message?.sender.is_me ? "Sen: " : message?.sender.name ? `${message.sender.name}: ` : ""}
            {summary.text || "Mesaj"}
          </Text>
        </View>
      ) : null}
      {onReact ? (
        more ? (
          <View style={styles.emojiGrid}>
            {MORE_REACTIONS.map((emoji) => (
              <Touchable key={emoji} feedback="chip" haptic="selection" onPress={() => react(emoji)} accessibilityRole="button" accessibilityLabel={`${emoji} tepkisi ver`} style={[styles.emojiCell, mine === emoji ? styles.emojiMine : null]}>
                <Text style={styles.emoji} {...textScale.badge}>{emoji}</Text>
              </Touchable>
            ))}
          </View>
        ) : (
          <View style={styles.quick}>
            {QUICK_REACTIONS.map((emoji) => (
              <Touchable key={emoji} feedback="chip" haptic="selection" onPress={() => react(emoji)} accessibilityRole="button" accessibilityLabel={mine === emoji ? `${emoji} tepkini kaldır` : `${emoji} tepkisi ver`} style={[styles.quickCell, mine === emoji ? styles.emojiMine : null]}>
                <Text style={styles.emoji} {...textScale.badge}>{emoji}</Text>
              </Touchable>
            ))}
            <Touchable feedback="chip" haptic="selection" onPress={() => setMore(true)} accessibilityRole="button" accessibilityLabel="Başka tepki seç" style={[styles.quickCell, styles.quickMore]}>
              <Ionicons name="add" size={22} color={colors.textSecondary} />
            </Touchable>
          </View>
        )
      ) : null}
      <View style={styles.menu}>
        {items.map((item) => (
          <Touchable
            key={item.key}
            feedback="row"
            haptic="selection"
            onPress={() => {
              close();
              item.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            style={styles.menuRow}
          >
            <Ionicons name={item.icon} size={20} color={item.danger ? colors.danger : colors.textSecondary} />
            <Text style={[styles.menuLabel, item.danger ? styles.danger : null]} {...textScale.dense}>{item.label}</Text>
          </Touchable>
        ))}
      </View>
    </BottomSheet>
  );
}

/* ---------- kişi satırı ---------- */

const PersonRow = memo(function PersonRow({ name, avatar, sub, trailing }: { name: string; avatar?: string | null; sub?: string | null; trailing?: string | null }) {
  return (
    <View style={styles.person}>
      <Avatar name={name} image={avatar} size={36} />
      <View style={styles.personBody}>
        <Text style={styles.personName} numberOfLines={1} {...textScale.dense}>{name}</Text>
        {sub ? <Text style={styles.personSub} numberOfLines={1} {...textScale.dense}>{sub}</Text> : null}
      </View>
      {trailing ? <Text style={styles.personTrailing} {...textScale.badge}>{trailing}</Text> : null}
    </View>
  );
});

/* ---------- tepki verenler ---------- */

export function ReactionsSheet({ message, viewerId, onClose, onRemoveMine }: { message: ChatMessage | null; viewerId: number | null | undefined; onClose: () => void; onRemoveMine: (message: ChatMessage) => void }) {
  const list = message?.reactions ?? [];
  const mine = list.some((item) => item.mine);
  return (
    <BottomSheet
      visible={Boolean(message)}
      onClose={onClose}
      title="Tepkiler"
      snap="content"
      footer={mine && message ? <Button label="Tepkimi kaldır" variant="secondary" icon="close-circle-outline" onPress={() => onRemoveMine(message)} fullWidth /> : undefined}
    >
      <View style={styles.block}>
        {list.flatMap((reaction) =>
          reaction.users.map((user) => (
            <PersonRow key={`${reaction.emoji}-${user.user_id}`} name={Number(user.user_id) === Number(viewerId) ? "Sen" : user.name ?? "Üye"} trailing={reaction.emoji} />
          )),
        )}
        {!list.length ? <Text style={styles.hint} {...textScale.dense}>Bu mesaja henüz tepki verilmedi.</Text> : null}
      </View>
    </BottomSheet>
  );
}

/* ---------- mesaj bilgisi ---------- */

const stamp = (iso: string | null | undefined) => (iso ? `${dayLabel(iso)} ${clockTime(iso)}` : "");

export function MessageInfoSheet({ conversationId, message, onClose }: { conversationId: number; message: ChatMessage | null; onClose: () => void }) {
  const messageId = message?.id ?? 0;
  const query = useQuery({
    queryKey: ["chat", "message-info", conversationId, messageId] as const,
    queryFn: () => getMessageInfo(conversationId, messageId),
    enabled: messageId > 0,
    staleTime: 5_000,
    retry: false,
  });
  const info = query.data;
  return (
    <BottomSheet visible={Boolean(message)} onClose={onClose} title="Mesaj bilgisi" snap="half">
      <View style={styles.block}>
        {message ? <Text style={styles.hint} {...textScale.dense}>Gönderildi: {stamp(message.created_at)}</Text> : null}
        {query.isLoading ? (
          <SkeletonListRow count={3} avatar />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} variant="banner" />
        ) : info ? (
          <>
            <Text style={styles.section} {...textScale.badge}>OKUYANLAR · {info.read_by.length}</Text>
            {info.read_by.map((person) => <PersonRow key={person.user_id} name={person.name} avatar={person.avatar} sub={person.read_at ? `Son okuma: ${stamp(person.read_at)}` : null} />)}
            {!info.read_by.length ? <Text style={styles.hint} {...textScale.dense}>Henüz kimse okumadı.</Text> : null}
            {info.not_read.length ? (
              <>
                <Text style={styles.section} {...textScale.badge}>OKUMAYANLAR · {info.not_read.length}</Text>
                {info.not_read.map((person) => <PersonRow key={person.user_id} name={person.name} avatar={person.avatar} />)}
              </>
            ) : null}
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/* ---------- anket oyları ---------- */

export function VotersSheet({ message, participants, viewerId, onClose }: { message: ChatMessage | null; participants: ChatParticipant[]; viewerId: number | null | undefined; onClose: () => void }) {
  const poll = message?.meta?.poll;
  const nameOf = (id: number) => (Number(id) === Number(viewerId) ? "Sen" : participants.find((p) => p.user_id === Number(id))?.name ?? `Üye #${id}`);
  return (
    <BottomSheet visible={Boolean(message && poll)} onClose={onClose} title="Anket oyları" snap="half">
      <View style={styles.block}>
        {poll ? <Text style={styles.pollQuestion} {...textScale.long}>{poll.question}</Text> : null}
        {(poll?.options ?? []).map((option) => {
          const voters = poll?.votes?.[option.id] ?? [];
          return (
            <View key={option.id} style={styles.pollOption}>
              <Text style={styles.section} {...textScale.badge}>{option.text} · {voters.length} oy</Text>
              {voters.length ? voters.map((id) => <PersonRow key={id} name={nameOf(id)} avatar={participants.find((p) => p.user_id === Number(id))?.avatar} />) : <Text style={styles.hint} {...textScale.dense}>Bu seçeneğe oy veren yok.</Text>}
            </View>
          );
        })}
      </View>
    </BottomSheet>
  );
}

/* ---------- ilet ---------- */

export function ForwardSheet({ visible, count, busy, onClose, onSend }: { visible: boolean; count: number; busy: boolean; onClose: () => void; onSend: (conversationIds: number[]) => void }) {
  const conversations = useConversations();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const list = useMemo(
    () => filterChats(conversations.data?.conversations ?? [], "all", q).filter((item) => item.can_write !== false && item.type !== "admin" && !item.blocked_by_me),
    [conversations.data, q],
  );
  const close = () => {
    setPicked([]);
    setQ("");
    onClose();
  };
  const toggle = (id: number) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : current.length >= 20 ? current : [...current, id]));
  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={count > 1 ? `${count} mesajı ilet` : "Mesajı ilet"}
      snap="full"
      scrollable={false}
      footer={
        <Button
          label={picked.length ? `${picked.length} sohbete ilet` : "Sohbet seç"}
          icon="arrow-redo"
          onPress={() => {
            onSend(picked);
            setPicked([]);
            setQ("");
          }}
          disabled={!picked.length}
          loading={busy}
          fullWidth
        />
      }
    >
      <View style={styles.search}>
        <Input value={q} onChangeText={setQ} placeholder="Sohbet ara" variant="search" size="sm" leadingIcon="search" accessibilityLabel="İletilecek sohbeti ara" />
      </View>
      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        renderItem={({ item }) => <ForwardRow conversation={item} picked={picked.includes(item.id)} onPress={toggle} />}
        ListEmptyComponent={conversations.isLoading ? <SkeletonListRow count={6} avatar /> : <EmptyState icon="chatbubbles-outline" title="Sohbet bulunamadı" body="Başka bir ad dene." />}
      />
    </BottomSheet>
  );
}

const ForwardRow = memo(function ForwardRow({ conversation, picked, onPress }: { conversation: ChatConversation; picked: boolean; onPress: (id: number) => void }) {
  return (
    <Touchable feedback="row" haptic="selection" onPress={() => onPress(conversation.id)} accessibilityRole="checkbox" accessibilityState={{ checked: picked }} accessibilityLabel={conversation.title} style={styles.forwardRow}>
      <ChatAvatar conversation={conversation} size={40} />
      <View style={styles.personBody}>
        <Text style={styles.personName} numberOfLines={1} {...textScale.dense}>{conversation.title}</Text>
        <Text style={styles.personSub} numberOfLines={1} {...textScale.dense}>{conversation.subtitle}</Text>
      </View>
      <Ionicons name={picked ? "checkmark-circle" : "ellipse-outline"} size={24} color={picked ? colors.brand : colors.textTertiary} />
    </Touchable>
  );
});

/* ---------- sohbet avatarı ---------- */

const TYPE_ICON: Partial<Record<ChatConversation["type"], keyof typeof Ionicons.glyphMap>> = {
  management: "shield-checkmark",
  admin: "notifications",
  team: "people",
  group: "people",
};

/** Kişide fotoğraf / baş harf; grup, takım ve yönetim sohbetinde (fotoğraf yoksa) simgeli daire. */
export const ChatAvatar = memo(function ChatAvatar({ conversation, size = 48, online }: { conversation: Pick<ChatConversation, "type" | "title" | "avatar" | "entity">; size?: number; online?: boolean }) {
  const image = conversation.avatar ?? conversation.entity?.avatar ?? null;
  const icon = TYPE_ICON[conversation.type];
  if (icon && !image && !(conversation.type === "management" && conversation.entity)) {
    return (
      <View style={[styles.iconAvatar, { width: size, height: size }, isGroupChat(conversation) ? null : styles.iconAvatarBrand]}>
        <Ionicons name={icon} size={Math.round(size * 0.48)} color={isGroupChat(conversation) ? colors.textSecondary : colors.textOnBrand} />
      </View>
    );
  }
  return <Avatar name={conversation.title} image={image} size={size} status={online ? "online" : "none"} />;
});

const styles = StyleSheet.create({
  preview: { flexDirection: "row", alignItems: "center", gap: space.xs, marginHorizontal: layout.screenPadding, marginBottom: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  previewText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  quick: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  quickCell: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  quickMore: { borderWidth: hairline, borderColor: colors.border },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.xs, paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  emojiCell: { width: 48, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  emojiMine: { backgroundColor: colors.brandDim, borderWidth: 1, borderColor: colors.brandBorder },
  emoji: { fontSize: type.display.fontSize, lineHeight: type.display.lineHeight + space.xs, color: colors.textPrimary },
  menu: { paddingBottom: space.sm },
  menuRow: { flexDirection: "row", alignItems: "center", gap: space.lg, minHeight: 48, paddingHorizontal: layout.screenPadding + space.xs },
  menuLabel: { ...type.h3, color: colors.textPrimary },
  danger: { color: colors.danger },

  block: { paddingHorizontal: layout.screenPadding, paddingBottom: space.lg, gap: space.xs },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.md },
  hint: { ...type.bodySm, color: colors.textSecondary, paddingVertical: space.xs },
  person: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 },
  personBody: { flex: 1, minWidth: 0 },
  personName: { ...type.h3, color: colors.textPrimary },
  personSub: { ...type.caption, color: colors.textSecondary },
  personTrailing: { fontSize: type.h1.fontSize, lineHeight: type.h1.lineHeight + space.xs, color: colors.textPrimary },
  pollQuestion: { ...type.h3, color: colors.textPrimary },
  pollOption: { gap: space.xxs },

  search: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  forwardRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 60, paddingHorizontal: layout.screenPadding },
  iconAvatar: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  iconAvatarBrand: { backgroundColor: colors.brand },
});
