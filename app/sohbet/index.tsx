import { Redirect } from "expo-router";

/**
 * Eski üye mesaj kutusu rotası. Üyenin TEK gelen kutusu Mesajlar sekmesidir
 * (Sohbetler kutusu aynı `ChatInbox` bileşenini gömülü çizer); bu rota yalnız
 * eski derin bağlantılar ve bildirimler için oraya yönlendirir. Yönetimin
 * sohbet kutusu ayrıdır: /yonetim/sohbet.
 */
export default function ChatInboxRedirect() {
  return <Redirect href={{ pathname: "/(tabs)/mesajlar", params: { kutu: "sohbetler" } }} />;
}
