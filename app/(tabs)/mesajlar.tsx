/**
 * MESAJLAR — yalnız WhatsApp benzeri doğrudan mesajlaşma.
 *
 * TEK MESAJLAŞMA KURALI (web Mesajlar ile aynı): bu sekmede yalnız gerçek
 * yazışmalar vardır — ElitLig Yönetimi sohbeti, takım grubu, birebir
 * sohbetler ve kurulan gruplar. Transfer, disiplin, maç, istek ve hesap
 * BİLDİRİMLERİ sohbete düşmez; her ekranın başlığındaki zilden açılan
 * /bildirimler ekranındadır. Yönetim talepleri (onay merkezi) Yönetim ▸
 * Talepler'dedir.
 *
 * GÖRÜNÜM: WhatsApp sohbet listesi (web ve masaüstü Mesajlar ile aynı) — büyük
 * başlık, arama, süzgeç hapları (Tümü · Okunmamış · Sabitlenen · Gruplar ·
 * Arşiv), sohbet satırları ve yüzen "yeni sohbet" düğmesinin TAMAMI `ChatInbox`
 * içindedir; bu ekran yalnız güvenli alanı, bildirim zilini ve eski rota
 * yönlendirmelerini taşır. Okunmamış özeti başlıkta cümle olarak yazılmaz:
 * hap sayaçları ve satır rozetleri söyler.
 *
 * YÖNETİM KULLANICISI: süzgeç haplarında ayrıca "Üye mesajları" vardır
 * (messages.view): üyelerin "ElitLig Yönetimi" yazışmaları ortak gelen kutusu
 * olarak aynı listede açılır; yanıt yönetim adına gider (/api/admin/chat).
 * Kişisel sohbetler ve karma gruplar /api/chat'tedir.
 * Arama kayıtları (messages.calls_view) başlıktaki menüden açılır.
 *
 * ESKİ ROTALAR: `?kutu=sohbetler` sohbetlere, `?kutu=uye` üye mesajlarına
 * iner; eski bildirim kutuları (`istekler`, `transfer`, `disiplin`, `mac`,
 * `diger`, `bildirimler`, `ozet`) ve başvuru kutusu (`yonetim`) /bildirimler'e
 * yönlenir. /gelen-kutusu ve /mesajlarim da buraya ya da oraya gider.
 */

import { Redirect, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatInbox } from "@/components/chat/ChatInbox";
import type { InboxHeaderAction } from "@/components/chat/InboxChrome";
import { useNotificationBell } from "@/hooks/useNotificationBell";
import { hasAnyPermission } from "@/lib/admin/access";
import { useAuth } from "@/providers/AuthProvider";
import { colors } from "@/lib/chatPalette";

type Section = "sohbetler" | "uye";

/** Eski bildirim kutuları → Bildirimler ekranındaki süzgeç. */
const LEGACY_BOX_FILTER: Record<string, string> = {
  istekler: "istek",
  transfer: "transfer",
  disiplin: "disiplin",
  mac: "mac",
  diger: "diger",
  bildirimler: "tumu",
  ozet: "tumu",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function MessagesScreen() {
  const auth = useAuth();
  const bell = useNotificationBell();
  const params = useLocalSearchParams<{
    kutu?: string | string[];
    bolum?: string | string[];
    filtre?: string | string[];
    durum?: string | string[];
    yeni?: string | string[];
  }>();

  const kutu = first(params.kutu);
  const canMemberMessages = auth.isManagement && hasAnyPermission(auth.user, ["messages.view"]);
  const requested = first(params.bolum) ?? kutu;
  const section: Section = canMemberMessages && requested === "uye" ? "uye" : "sohbetler";

  const actions = useMemo<InboxHeaderAction[]>(
    () => (bell ? [{ icon: bell.icon, onPress: bell.onPress, accessibilityLabel: bell.accessibilityLabel, badge: bell.badge }] : []),
    [bell],
  );

  // Eski bildirim / başvuru kutuları artık Bildirimler ekranında.
  if (kutu && LEGACY_BOX_FILTER[kutu]) {
    const filtre = first(params.filtre);
    return (
      <Redirect
        href={{ pathname: "/bildirimler", params: { filtre: filtre && kutu === "bildirimler" ? filtre : LEGACY_BOX_FILTER[kutu] } }}
      />
    );
  }
  if (kutu === "yonetim" || kutu === "basvurular") {
    const durum = first(params.durum);
    const yeni = first(params.yeni);
    return (
      <Redirect
        href={{ pathname: "/bildirimler", params: { bolum: "basvurular", ...(durum ? { durum } : {}), ...(yeni ? { yeni } : {}) } }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ChatInbox admin={section === "uye"} embedded headerActions={actions} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
