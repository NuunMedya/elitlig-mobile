import { useLocalSearchParams } from "expo-router";
import { ChatCompose } from "@/components/chat/ChatCompose";

/** Üye "yeni sohbet" — bkz. components/chat/ChatCompose.tsx. `?sekme=grup` doğrudan grup kurmaya iner. */
export default function ComposeScreen() {
  const params = useLocalSearchParams<{ sekme?: string | string[] }>();
  const tab = Array.isArray(params.sekme) ? params.sekme[0] : params.sekme;
  return <ChatCompose initialTab={tab === "grup" ? "group" : undefined} />;
}
