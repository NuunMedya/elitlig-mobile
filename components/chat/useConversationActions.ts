/**
 * SOHBET EYLEMLERİ — sabitle, sessize al, arşivle, okundu / okunmadı işaretle,
 * engelle, gruptan çık, sohbeti sil. Sohbet listesi (uzun basma menüsü),
 * sohbet başlığı menüsü ve bilgi ekranı aynı kancayı kullanır; önbellek
 * iyimser güncellenir, sunucu reddederse geri alınır.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Alert } from "react-native";

import { errorMessage } from "@/components/chat/kit";
import { useToast } from "@/components/ui";
import { patchConversationCache } from "@/hooks/useChat";
import {
  blockUser,
  deleteConversation,
  leaveConversation,
  markConversationRead,
  muteConversation,
  setConversationState,
  unblockUser,
  type ChatConversation,
  type ConversationsResponse,
} from "@/lib/api/chat";
import { setDraft } from "@/lib/chatDrafts";
import { queryKeys } from "@/lib/queryKeys";

export interface ConversationActions {
  pin: (conversation: ChatConversation) => void;
  mute: (conversation: ChatConversation) => void;
  archive: (conversation: ChatConversation) => void;
  markUnread: (conversation: ChatConversation) => void;
  markRead: (conversation: ChatConversation) => void;
  block: (conversation: ChatConversation) => void;
  leave: (conversation: ChatConversation, done?: () => void) => void;
  remove: (conversation: ChatConversation, done?: () => void) => void;
}

export function useConversationActions(): ConversationActions {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMemo<ConversationActions>(() => {
    const fail = (error: unknown) => toast.show({ message: errorMessage(error), tone: "danger" });
    const dropFromList = (id: number) => {
      queryClient.setQueryData<ConversationsResponse>(queryKeys.chatConversations(), (previous) => {
        if (!previous) return previous;
        const conversations = previous.conversations.filter((item) => item.id !== id);
        return { ...previous, conversations, unread: conversations.reduce((sum, item) => sum + item.unread, 0) };
      });
      queryClient.removeQueries({ queryKey: queryKeys.chatMessages(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatUnread() });
      setDraft(id, "");
    };
    const state = (conversation: ChatConversation, body: { pinned?: boolean; archived?: boolean; marked_unread?: boolean }, done?: string) => {
      const before = { pinned: conversation.pinned, pinned_at: conversation.pinned_at, archived: conversation.archived, marked_unread: conversation.marked_unread };
      patchConversationCache(queryClient, conversation.id, {
        ...body,
        ...(body.pinned !== undefined ? { pinned_at: body.pinned ? new Date().toISOString() : null } : {}),
        ...(body.archived ? { pinned: false, pinned_at: null } : {}),
      });
      void setConversationState(conversation.id, body)
        .then((result) => {
          patchConversationCache(queryClient, conversation.id, { pinned: result.pinned, archived: result.archived, marked_unread: result.marked_unread });
          if (done) toast.show({ message: done, tone: "success" });
        })
        .catch((error: unknown) => {
          patchConversationCache(queryClient, conversation.id, before);
          fail(error);
        });
    };

    return {
      pin: (conversation) => state(conversation, { pinned: !conversation.pinned }),
      archive: (conversation) => state(conversation, { archived: !conversation.archived }, conversation.archived ? "Arşivden çıkarıldı." : "Sohbet arşivlendi."),
      markUnread: (conversation) => state(conversation, { marked_unread: true }),
      markRead: (conversation) => {
        patchConversationCache(queryClient, conversation.id, { unread: 0, marked_unread: false });
        void markConversationRead(conversation.id)
          .then(() => void queryClient.invalidateQueries({ queryKey: queryKeys.chatUnread() }))
          .catch(fail);
      },
      mute: (conversation) => {
        const muted = !conversation.muted;
        patchConversationCache(queryClient, conversation.id, { muted });
        void muteConversation(conversation.id, muted)
          .then(() => toast.show({ message: muted ? "Sessize alındı: bu sohbetten bildirim gelmez." : "Bildirimler açıldı.", tone: "success" }))
          .catch((error: unknown) => {
            patchConversationCache(queryClient, conversation.id, { muted: !muted });
            fail(error);
          });
      },
      block: (conversation) => {
        const other = conversation.other_user;
        if (!other) return;
        const blocked = Boolean(conversation.blocked_by_me);
        const run = () => {
          void (blocked ? unblockUser(other.user_id) : blockUser(other.user_id))
            .then(() => {
              patchConversationCache(queryClient, conversation.id, { blocked_by_me: !blocked, can_write: blocked, can_call: false });
              toast.show({ message: blocked ? "Engel kaldırıldı." : `${other.name} engellendi.`, tone: blocked ? "success" : "neutral" });
              void queryClient.invalidateQueries({ queryKey: queryKeys.chatMessages(conversation.id) });
              void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
              void queryClient.invalidateQueries({ queryKey: queryKeys.chatBlocks() });
            })
            .catch(fail);
        };
        if (blocked) {
          run();
          return;
        }
        Alert.alert(
          `${other.name} engellensin mi?`,
          "Sana mesaj yazamaz ve seni arayamaz; sen de ona yazamazsın. Takım ve grup sohbetleri etkilenmez. İstediğin zaman kaldırabilirsin.",
          [{ text: "Vazgeç", style: "cancel" }, { text: "Engelle", style: "destructive", onPress: run }],
        );
      },
      leave: (conversation, done) => {
        Alert.alert("Gruptan çık", `"${conversation.title}" grubundan çıkmak istiyor musun? Yeni mesajları görmezsin.`, [
          { text: "Vazgeç", style: "cancel" },
          {
            text: "Gruptan çık",
            style: "destructive",
            onPress: () => {
              void leaveConversation(conversation.id)
                .then(() => {
                  dropFromList(conversation.id);
                  void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
                  toast.show({ message: "Gruptan çıktın.", tone: "success" });
                  done?.();
                })
                .catch(fail);
            },
          },
        ]);
      },
      remove: (conversation, done) => {
        Alert.alert(
          "Sohbeti sil",
          `"${conversation.title}" sohbeti listenden kaldırılacak. Eski mesajlar senin tarafında görünmez olur; karşı taraf görmeye devam eder. Yeni mesaj gelirse sohbet yeniden açılır.`,
          [
            { text: "Vazgeç", style: "cancel" },
            {
              text: "Sohbeti sil",
              style: "destructive",
              onPress: () => {
                void deleteConversation(conversation.id)
                  .then((data) => {
                    dropFromList(conversation.id);
                    toast.show({ message: data.message ?? "Sohbet silindi.", tone: "success" });
                    done?.();
                  })
                  .catch(fail);
              },
            },
          ],
        );
      },
    };
  }, [queryClient, toast]);
}
