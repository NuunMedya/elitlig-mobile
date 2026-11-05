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
 * YÖNETİM KULLANICISI: üstte iki bölüm —
 *   Sohbetlerim   → yöneticiler, takım başkanları, oyuncular ve üyelerle
 *                   birebir sohbet ve karma gruplar (/api/chat)
 *   Üye mesajları → messages.view yetkisiyle üyelerin "ElitLig Yönetimi"
 *                   yazışmaları; yanıt yönetim adına gider (/api/admin/chat)
 * Arama kayıtları (messages.calls_view) başlıktaki simgeden açılır.
 *
 * ESKİ ROTALAR: `?kutu=sohbetler` sohbetlere, `?kutu=uye` üye mesajlarına
 * iner; eski bildirim kutuları (`istekler`, `transfer`, `disiplin`, `mac`,
 * `diger`, `bildirimler`, `ozet`) ve başvuru kutusu (`yonetim`) /bildirimler'e
 * yönlenir. /gelen-kutusu ve /mesajlarim da buraya ya da oraya gider.
 */

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatInbox } from "@/components/chat/ChatInbox";
import {
  EmptyState,
  ScreenHeader,
  SegmentedControl,
  useHeaderScroll,
  type ScreenHeaderAction,
  type SegmentedItem,
} from "@/components/ui";
import { useAdminInboxSummary } from "@/hooks/useChat";
import { useNotificationBell } from "@/hooks/useNotificationBell";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatNumber } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space } from "@/theme";

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
  const router = useRouter();
  const unread = useUnreadCount();
  const bell = useNotificationBell();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{
    kutu?: string | string[];
    bolum?: string | string[];
    filtre?: string | string[];
    durum?: string | string[];
    yeni?: string | string[];
  }>();

  const kutu = first(params.kutu);
  const canMemberMessages = auth.isManagement && hasAnyPermission(auth.user, ["messages.view"]);
  const canCalls = auth.isManagement && hasAnyPermission(auth.user, ["messages.calls_view"]);
  const requested = first(params.bolum) ?? kutu;
  const section: Section = canMemberMessages && requested === "uye" ? "uye" : "sohbetler";

  const summary = useAdminInboxSummary();
  const memberUnread = canMemberMessages ? Number(summary.data?.unread ?? 0) : 0;

  const sections = useMemo<SegmentedItem<Section>[]>(
    () => [
      { key: "sohbetler", label: unread.messages > 0 ? `Sohbetlerim (${unread.messages})` : "Sohbetlerim" },
      { key: "uye", label: memberUnread > 0 ? `Üye mesajları (${memberUnread})` : "Üye mesajları", dot: memberUnread > 0 },
    ],
    [memberUnread, unread.messages]
  );

  const setSection = useCallback((next: Section) => router.setParams({ bolum: next, kutu: "" }), [router]);

  const actions = useMemo<ScreenHeaderAction[]>(() => {
    if (!auth.user) return [];
    const list: ScreenHeaderAction[] = [];
    if (bell) list.push(bell);
    if (canCalls) list.push({ icon: "recording-outline", onPress: () => router.push("/yonetim/kayitlar"), accessibilityLabel: "Arama kayıtları" });
    return list;
  }, [auth.user, bell, canCalls, router]);

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

  const total = unread.messages + memberUnread;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Mesajlar"
        subtitle={!auth.user ? undefined : total > 0 ? `${formatNumber(total)} okunmamış mesaj` : unread.loading ? undefined : "Hepsi okundu"}
        scrollY={scrollY}
        actions={actions}
        bottom={
          canMemberMessages ? (
            <View style={styles.segment}>
              <SegmentedControl items={sections} value={section} onChange={setSection} stretch size="sm" />
            </View>
          ) : undefined
        }
      />
      <View style={styles.body}>
        {!auth.user ? (
          <EmptyState
            icon="chatbubbles-outline"
            title="Mesajların hesabına bağlı"
            body="Yönetimle, takımınla ve oyuncularla yazışmak için giriş yap."
            action={{ label: "Giriş yap", onPress: () => router.push("/giris") }}
          />
        ) : section === "uye" ? (
          <ChatInbox key="uye" admin embedded onScroll={scrollProps.onScroll} />
        ) : (
          <ChatInbox key="sohbetler" embedded onScroll={scrollProps.onScroll} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  segment: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
});
