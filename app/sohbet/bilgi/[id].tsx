import { useLocalSearchParams } from "expo-router";
import { ChatInfo } from "@/components/chat/ChatInfo";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Kişi / grup bilgisi — bkz. components/chat/ChatInfo.tsx. `?bolum=medya|belgeler|baglantilar` o sekmede açar. */
export default function ChatInfoScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; bolum?: string | string[] }>();
  return <ChatInfo conversationId={Number(first(params.id))} initialSection={first(params.bolum)} />;
}
