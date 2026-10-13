/**
 * GELEN KUTUSU — Bildirimler | Mesajlar tek ekranda.
 *
 * NE: kullanıcıyı bekleyen her şeyin tek kapısı. Profil'deki "Gelen kutusu"
 * satırı, Ana Sayfa/Kulübüm'deki zil ve mesaj kapıları buraya açılır;
 * sekme `?tab=bildirimler|mesajlar` ile ROTADA taşınır.
 *
 *   · Bildirimler → components/inbox/NotificationsPane.tsx (panel bildirim
 *     merkezi; süzgeç `?filtre=`).
 *   · Mesajlar    → iki kutu, bir anahtar (`?kutu=sohbetler|basvurular`):
 *       Sohbetler  — components/chat/ChatInbox.tsx (gömülü): yönetim
 *                    sohbeti, takım grubu, birebir ve gruplar (hooks/useChat).
 *       Başvurular — components/inbox/PanelThreadsPane.tsx: yönetime yapılan
 *                    durumlu resmî başvurular (`/api/panel/me/messages`,
 *                    süzgeç `?durum=`, yeni başvuru `?yeni=1`).
 *     İki veri kaynağı korunur, birleştirilmez: biri anlık yazışma, öteki
 *     açık/yanıtlandı/kapandı durumlu taleptir.
 *
 * ESKİ ROTALAR: /bildirimler → `?tab=bildirimler` (eski `?tab=` süzgeci
 * `filtre`ye çevrilir), /mesajlarim → `?tab=mesajlar&kutu=basvurular`
 * (`durum`, `yeni` korunur). lib/notifications.ts'teki hedefler ve
 * app/mesaj/[id].tsx'in "kutuya dön" bağlantıları böylece çalışır.
 * /sohbet kendi ekranı olarak durur (sohbet odaları onun altında).
 *
 * SAYILAR: sekme rozetleri hooks/useUnreadCount ile aynı kaynaktan gelir —
 * alt çubuktaki Profil rozeti ve Profil'deki Gelen kutusu satırı da aynı
 * toplamı gösterir. Rozetler menekşedir (kırmızı yalnız canlıdır).
 *
 * MİSAFİR: iki kaynak da hesaba bağlıdır; giriş çağrısı çizilir.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatInbox } from "@/components/chat/ChatInbox";
import {
  NotificationsPane,
  useMarkAllNotificationsRead,
  type NotifFilter,
} from "@/components/inbox/NotificationsPane";
import { PanelThreadsPane } from "@/components/inbox/PanelThreadsPane";
import {
  EmptyState,
  ScreenHeader,
  SegmentedControl,
  Tabs,
  useHeaderScroll,
  type ScreenHeaderAction,
  type SegmentedItem,
  type TabItem,
} from "@/components/ui";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { getMyMessages } from "@/lib/api/panel";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space } from "@/theme";

type InboxTab = "bildirimler" | "mesajlar";
type MessageBox = "sohbetler" | "basvurular";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function InboxScreen() {
  const auth = useAuth();
  const router = useRouter();
  const unread = useUnreadCount();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{
    tab?: string | string[];
    filtre?: string | string[];
    kutu?: string | string[];
    durum?: string | string[];
    yeni?: string | string[];
  }>();

  const tab: InboxTab = firstParam(params.tab) === "mesajlar" ? "mesajlar" : "bildirimler";
  const box: MessageBox = firstParam(params.kutu) === "basvurular" ? "basvurular" : "sohbetler";
  const signedIn = Boolean(auth.user);

  const { markAll } = useMarkAllNotificationsRead();

  /**
   * Başvuru kutusunun okunmamış sayısı — yalnız "Başvurular" anahtarındaki
   * nokta için. Bölmeyle AYNI önbellek anahtarı; Mesajlar sekmesindeyken
   * bir kez okunur, yoklamayı bölmenin kendisi yapar.
   */
  const threadsQuery = useQuery({
    queryKey: queryKeys.panelMessages(),
    queryFn: getMyMessages,
    enabled: signedIn && tab === "mesajlar",
    staleTime: 30_000,
    retry: false,
  });
  const threadUnread = threadsQuery.data?.unread ?? 0;

  /* ───────────────────────────── GEZİNME ───────────────────────────── */

  const selectTab = useCallback((next: InboxTab) => router.setParams({ tab: next }), [router]);
  const selectBox = useCallback((next: MessageBox) => router.setParams({ kutu: next }), [router]);
  const selectFilter = useCallback((next: NotifFilter) => router.setParams({ filtre: next }), [router]);
  const selectStatus = useCallback(
    (next: string | null) => router.setParams({ durum: next ?? "" }),
    [router],
  );
  const clearCompose = useCallback(() => router.setParams({ yeni: "" }), [router]);
  const openPrefs = useCallback(() => router.push("/bildirim-tercihleri"), [router]);
  const openSignIn = useCallback(() => router.push("/giris"), [router]);

  /* ───────────────────────────── BAŞLIK ───────────────────────────── */

  const tabItems = useMemo<TabItem<InboxTab>[]>(
    () => [
      { key: "bildirimler", label: "Bildirimler", badge: unread.notifications || undefined },
      { key: "mesajlar", label: "Mesajlar", badge: unread.messages || undefined },
    ],
    [unread.messages, unread.notifications],
  );

  const boxItems = useMemo<SegmentedItem<MessageBox>[]>(
    () => [
      { key: "sohbetler", label: "Sohbetler", dot: unread.messages > 0 },
      { key: "basvurular", label: "Yönetim başvuruları", dot: threadUnread > 0 },
    ],
    [threadUnread, unread.messages],
  );

  const actions = useMemo<ScreenHeaderAction[]>(() => {
    if (!signedIn || tab !== "bildirimler") return [];
    const list: ScreenHeaderAction[] = [];
    if (unread.notifications > 0) {
      list.push({ icon: "checkmark-done", onPress: markAll, accessibilityLabel: "Tümünü okundu işaretle" });
    }
    list.push({ icon: "options-outline", onPress: openPrefs, accessibilityLabel: "Bildirim ayarları" });
    return list;
  }, [markAll, openPrefs, signedIn, tab, unread.notifications]);

  const subtitle = !signedIn
    ? undefined
    : unread.total > 0
      ? `${unread.total} okunmamış`
      : unread.loading
        ? undefined
        : "Hepsi okundu";

  /* ───────────────────────────── İÇERİK ───────────────────────────── */

  let content: ReactNode;
  if (!signedIn) {
    content = (
      <EmptyState
        icon="mail-unread-outline"
        title="Gelen kutun hesabına bağlı"
        body="Teklif, sözleşme ve disiplin bildirimlerini görmek, yönetimle ve takımınla yazışmak için giriş yap."
        action={{ label: "Giriş yap", onPress: openSignIn }}
      />
    );
  } else if (tab === "bildirimler") {
    content = (
      <NotificationsPane
        filter={firstParam(params.filtre)}
        onFilterChange={selectFilter}
        onOpenPrefs={openPrefs}
        onScroll={scrollProps.onScroll}
        scrollEventThrottle={scrollProps.scrollEventThrottle}
      />
    );
  } else if (box === "basvurular") {
    content = (
      <PanelThreadsPane
        status={firstParam(params.durum)}
        onStatusChange={selectStatus}
        composeRequested={Boolean(firstParam(params.yeni))}
        onComposeHandled={clearCompose}
        onScroll={scrollProps.onScroll}
        scrollEventThrottle={scrollProps.scrollEventThrottle}
      />
    );
  } else {
    content = <ChatInbox embedded onScroll={scrollProps.onScroll} />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Gelen kutusu"
        subtitle={subtitle}
        back
        scrollY={scrollY}
        actions={actions}
        tabs={<Tabs<InboxTab> items={tabItems} value={tab} onChange={selectTab} distribute="equal" />}
        bottom={
          signedIn && tab === "mesajlar" ? (
            <View style={styles.boxSwitch}>
              <SegmentedControl<MessageBox> items={boxItems} value={box} onChange={selectBox} size="sm" />
            </View>
          ) : undefined
        }
      />
      <View style={styles.body}>{content}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flex: 1,
  },
  boxSwitch: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
});
