import { Redirect } from "expo-router";
import { ChatInbox } from "@/components/chat/ChatInbox";
import { useAuth } from "@/providers/AuthProvider";

/** Yönetim sohbeti: üyelerin yönetim sohbetleri, takım grupları, bildirim akışı. */
export default function AdminChatInboxScreen() {
  const auth = useAuth();
  if (!auth.user) return <Redirect href="/giris" />;
  if (!auth.isManagement) return <Redirect href={"/sohbet" as never} />;
  return <ChatInbox admin />;
}
