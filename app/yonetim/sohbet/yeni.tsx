import { Redirect, useLocalSearchParams } from "expo-router";
import { ChatCompose } from "@/components/chat/ChatCompose";
import { useAuth } from "@/providers/AuthProvider";

/** Yönetim "yeni sohbet": üye, takım grubu, yönetim ekibi ya da grup. `?sekme=grup` doğrudan grup kurmaya iner. */
export default function AdminComposeScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ sekme?: string | string[] }>();
  const tab = Array.isArray(params.sekme) ? params.sekme[0] : params.sekme;
  if (!auth.user) return <Redirect href="/giris" />;
  if (!auth.isManagement) return <Redirect href={{ pathname: "/sohbet/yeni", params: tab ? { sekme: tab } : {} }} />;
  return <ChatCompose admin initialTab={tab === "grup" ? "group" : undefined} />;
}
