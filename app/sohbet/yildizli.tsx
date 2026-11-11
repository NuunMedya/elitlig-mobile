import { useLocalSearchParams } from "expo-router";
import { StarredMessages } from "@/components/chat/StarredMessages";

/** Yıldızlı mesajlar — tümü ya da `?sohbet=<id>` ile tek sohbetinkiler. */
export default function StarredScreen() {
  const params = useLocalSearchParams<{ sohbet?: string | string[] }>();
  const raw = Number(Array.isArray(params.sohbet) ? params.sohbet[0] : params.sohbet);
  return <StarredMessages conversationId={Number.isInteger(raw) && raw > 0 ? raw : null} />;
}
