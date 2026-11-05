import { Redirect } from "expo-router";

/**
 * /yonetim/mesajlar — ESKİ "Mesaj Yönetimi" (başvuru kutusu). Web ile aynı
 * tek mesajlaşma kuralı: üye başvuruları Talepler'in Mesajlar kategorisinde,
 * yazışmalar Mesajlar sekmesindedir. Derin bağlantılar Talepler'e iner.
 */
export default function LegacyAdminMessagesRedirect() {
  return <Redirect href={{ pathname: "/yonetim/talepler", params: { kategori: "message" } }} />;
}
