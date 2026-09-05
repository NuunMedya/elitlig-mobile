import { Redirect, useLocalSearchParams } from "expo-router";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { useAuth } from "@/providers/AuthProvider";

/** Yönetim sohbet odası: yönetim adına yazar, arar, kayıtları dinler. */
export default function AdminChatRoomScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!auth.user) return <Redirect href="/giris" />;
  if (!auth.isManagement) return <Redirect href={`/sohbet/${rawId}` as never} />;
  return <ChatRoom conversationId={Number(rawId)} admin />;
}
