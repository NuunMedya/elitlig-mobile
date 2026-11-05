import { Redirect } from "expo-router";

/**
 * /yonetim/sohbet — ESKİ ROTA. Yönetim kullanıcısının tek mesajlaşması
 * Mesajlar sekmesidir; üyelerin "ElitLig Yönetimi" yazışmaları orada
 * "Üye mesajları" bölümündedir (messages.view). Tekil yazışma
 * (/yonetim/sohbet/[id]) ve yönetim adına yeni yazışma (/yonetim/sohbet/yeni)
 * kendi rotalarında kalır.
 */
export default function AdminChatInboxRedirect() {
  return <Redirect href={{ pathname: "/(tabs)/mesajlar", params: { bolum: "uye" } }} />;
}
