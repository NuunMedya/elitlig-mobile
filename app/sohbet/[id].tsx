import { useLocalSearchParams } from "expo-router";
import { ChatRoom } from "@/components/chat/ChatRoom";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Üye sohbet odası — bkz. components/chat/ChatRoom.tsx. `?mesaj=<id>` o mesaja gider (arama, yıldızlı, medya). */
export default function ChatRoomScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; mesaj?: string | string[] }>();
  const jump = Number(first(params.mesaj));
  return <ChatRoom conversationId={Number(first(params.id))} jumpTo={Number.isInteger(jump) && jump > 0 ? jump : null} />;
}
