/**
 * Rehberin tek dokunuşla iletişim eylemleri: ara (tel:), WhatsApp
 * (https://wa.me/…), SMS, e-posta, panoya kopyala ve uygulama içi mesaj.
 *
 * NEDEN HOOK: mesaj açma sunucuya gider (yönetim sohbeti) ve sonra sohbet
 * ekranına geçer; hem toast hem yönlendirme gerektiği için düz yardımcı
 * değil hook. Bağlantı açılamazsa (cihazda SMS yok gibi) kullanıcıya söylenir.
 */

import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking } from "react-native";

import { useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { digitsOf, waNumber } from "@/lib/api/admin/contacts";
import { adminChat, type OpenConversationInput } from "@/lib/api/chat";

export function useContactActions() {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const open = useCallback(
    async (url: string, failure: string) => {
      try {
        await Linking.openURL(url);
      } catch {
        toast.show({ message: failure, tone: "danger" });
      }
    },
    [toast]
  );

  const call = useCallback((phone: string) => open(`tel:${digitsOf(phone)}`, "Arama başlatılamadı."), [open]);
  const whatsapp = useCallback((phone: string) => open(`https://wa.me/${waNumber(phone)}`, "WhatsApp açılamadı."), [open]);
  const sms = useCallback((phone: string) => open(`sms:${digitsOf(phone)}`, "SMS uygulaması açılamadı."), [open]);
  const email = useCallback((address: string) => open(`mailto:${address.trim()}`, "E-posta uygulaması açılamadı."), [open]);

  const copy = useCallback(
    async (text: string, label = "Panoya kopyalandı.") => {
      try {
        await Clipboard.setStringAsync(text);
        toast.show({ message: label, tone: "success" });
      } catch {
        toast.show({ message: "Panoya kopyalanamadı.", tone: "danger" });
      }
    },
    [toast]
  );

  /** Yönetim sohbetini açar ve sohbet ekranına geçer. */
  const openChat = useCallback(
    async (input: OpenConversationInput, key: string) => {
      setBusy(key);
      try {
        const { conversation } = await adminChat.openConversation(input);
        if (conversation.skipped_members?.length) {
          toast.show({
            message: `Mesaj tercihi nedeniyle eklenemeyenler: ${conversation.skipped_members.map((m) => m.name).join(", ")}`,
            tone: "warn",
          });
        }
        router.push(`/yonetim/sohbet/${conversation.id}` as never);
      } catch (error) {
        toast.show({ message: errorText(error), tone: "danger" });
      } finally {
        setBusy(null);
      }
    },
    [router, toast]
  );

  /** Üyeye mesaj: yönetim hesabıysa ekip sohbeti (direct), değilse üye sohbeti. */
  const message = useCallback(
    (userId: number, staff = false) => openChat(staff ? { type: "direct", user_id: userId } : { type: "member", user_id: userId }, `msg-${userId}`),
    [openChat]
  );

  const group = useCallback(
    (title: string, userIds: number[]) => openChat({ type: "group", title, user_ids: userIds }, "group"),
    [openChat]
  );

  return { call, whatsapp, sms, email, copy, message, group, busy };
}

export type ContactActions = ReturnType<typeof useContactActions>;
