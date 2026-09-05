import { useLocalSearchParams } from "expo-router";
import { ChatRoom } from "@/components/chat/ChatRoom";

/** Üye sohbet odası — bkz. components/chat/ChatRoom.tsx */
export default function ChatRoomScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  return <ChatRoom conversationId={Number(rawId)} />;
}
