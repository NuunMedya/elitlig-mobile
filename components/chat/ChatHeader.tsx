/**
 * SOHBET BAŞLIĞI — WhatsApp düzeni: geri, avatar, ad ve durum satırı
 * (yazıyor… / çevrimiçi / son görülme / grup üyeleri), sağda ara · bul · menü.
 * Ada dokununca kişi ya da grup bilgisi açılır. Ortak `ScreenHeader` yalnız
 * düz metin başlık taşıdığı için burada ayrı bir başlık vardır.
 *
 * "Yazıyor…" durumu kendi küçük bileşeninde okunur (`TypingLine`): yazma olayı
 * geldiğinde yalnız bu satır çizilir, mesaj listesi çizilmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChatAvatar } from "@/components/chat/MessageSheets";
import { Touchable } from "@/components/chat/kit";
import { useTypingNames } from "@/hooks/useChat";
import type { ChatConversation } from "@/lib/api/chat";
import { isGroupChat } from "@/lib/chatUtils";
import { colors, wa } from "@/lib/chatPalette";
import { hairline, space, textScale, type } from "@/theme";

export interface HeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

/** Durum satırı: biri yazıyorsa onu, yoksa verilen metni gösterir. */
export const TypingLine = memo(function TypingLine({ conversationId, group, fallback, tone = "header" }: { conversationId: number; group: boolean; fallback: string; tone?: "header" | "row" }) {
  const names = useTypingNames(conversationId);
  const typing = names.length > 0;
  const text = typing ? (group ? `${names.map((name) => name.split(" ")[0]).join(", ")} yazıyor…` : "yazıyor…") : fallback;
  if (!text) return null;
  return (
    <Text style={[tone === "header" ? styles.subtitle : styles.rowLine, typing ? styles.typing : null]} numberOfLines={1} {...textScale.dense}>
      {text}
    </Text>
  );
});

export interface ChatHeaderProps {
  conversation: ChatConversation | null;
  title: string;
  /** Yazan yokken gösterilecek durum (çevrimiçi, son görülme, üyeler…). */
  status: string;
  online?: boolean;
  onBack: () => void;
  onPressTitle?: () => void;
  actions: HeaderAction[];
}

export const ChatHeader = memo(function ChatHeader({ conversation, title, status, online, onBack, onPressTitle, actions }: ChatHeaderProps) {
  return (
    <View style={styles.bar}>
      <Touchable feedback="icon" haptic="light" onPress={onBack} hitSlop={6} accessibilityRole="button" accessibilityLabel="Geri" style={styles.back}>
        <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
      </Touchable>
      <Touchable
        feedback="none"
        haptic="none"
        onPress={onPressTitle}
        disabled={!onPressTitle}
        accessibilityRole={onPressTitle ? "button" : "header"}
        accessibilityLabel={onPressTitle ? `${title}. Bilgileri görmek için dokun` : title}
        style={styles.who}
      >
        {conversation ? <ChatAvatar conversation={conversation} size={40} online={online} /> : <View style={styles.avatarGap} />}
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>{title}</Text>
          {conversation ? <TypingLine conversationId={conversation.id} group={isGroupChat(conversation)} fallback={status} /> : null}
        </View>
      </Touchable>
      {actions.map((action) => (
        <Touchable key={action.icon} feedback="icon" haptic="light" onPress={action.onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={action.label} style={styles.action}>
          <Ionicons name={action.icon} size={22} color={wa.headerIcon} />
        </Touchable>
      ))}
    </View>
  );
});

/** Çoklu seçim çubuğu: başlığın yerini alır. */
export const SelectionHeader = memo(function SelectionHeader({ count, onClose, actions }: { count: number; onClose: () => void; actions: (HeaderAction & { disabled?: boolean })[] }) {
  return (
    <View style={styles.bar}>
      <Touchable feedback="icon" haptic="light" onPress={onClose} hitSlop={6} accessibilityRole="button" accessibilityLabel="Seçimi kapat" style={styles.back}>
        <Ionicons name="close" size={26} color={colors.textPrimary} />
      </Touchable>
      <Text style={[styles.title, styles.selectionTitle]} {...textScale.dense}>{count} seçildi</Text>
      {actions.map((action) => (
        <Touchable key={action.icon} feedback="icon" haptic="light" onPress={action.onPress} disabled={action.disabled} hitSlop={4} accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{ disabled: Boolean(action.disabled) }} style={[styles.action, action.disabled ? styles.disabled : null]}>
          <Ionicons name={action.icon} size={22} color={colors.textPrimary} />
        </Touchable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: space.xs, backgroundColor: colors.surface1, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  back: { width: 38, height: 48, alignItems: "center", justifyContent: "center" },
  who: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.s },
  avatarGap: { width: 40, height: 40 },
  titles: { flex: 1, minWidth: 0 },
  title: { ...type.h2, color: colors.textPrimary },
  selectionTitle: { flex: 1, marginLeft: space.sm },
  subtitle: { ...type.bodySm, color: colors.textSecondary },
  rowLine: { ...type.body, color: colors.textSecondary, flex: 1 },
  typing: { color: colors.brandAccent },
  action: { width: 42, height: 48, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.35 },
});
