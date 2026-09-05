import { Redirect } from "expo-router";
import { ChatCompose } from "@/components/chat/ChatCompose";
import { useAuth } from "@/providers/AuthProvider";

/** Yönetim "mesaj oluştur": üye, takım grubu ya da grup. */
export default function AdminComposeScreen() {
  const auth = useAuth();
  if (!auth.user) return <Redirect href="/giris" />;
  if (!auth.isManagement) return <Redirect href={"/sohbet/yeni" as never} />;
  return <ChatCompose admin />;
}
