/**
 * BİLDİRİMLER — üst çubuktaki zilin açtığı ekran.
 *
 * NE: transfer, disiplin, maç, istek (maç talebi, kadro, davet), üyelik ve
 * hesap bildirimleri — zaman sırasıyla, kategori süzgeçli (NotificationsPane).
 * Yönetime yapılan durumlu başvurular "Başvurularım" bölümündedir.
 *
 * NEDEN AYRI EKRAN (TEK MESAJLAŞMA KURALI, web ile aynı): Mesajlar sekmesi
 * yalnız WhatsApp benzeri doğrudan yazışmadır. Bildirimler sohbete düşmez;
 * her ekranın başlığındaki zil (hooks/useNotificationBell) buraya getirir.
 * Yönetim kullanıcısı için üstte Talepler (onay merkezi) şeridi durur.
 *
 * ESKİ ROTALAR: /gelen-kutusu ve Mesajlar'ın eski `?kutu=` bildirim kutuları
 * buraya yönlenir (`kategori` → süzgeç).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NotificationsPane, useMarkAllNotificationsRead, useNotificationFeed, type NotifFilter } from "@/components/inbox/NotificationsPane";
import { PanelThreadsPane } from "@/components/inbox/PanelThreadsPane";
import {
  Badge,
  ScreenHeader,
  SegmentedControl,
  Touchable,
  useHeaderScroll,
  type ScreenHeaderAction,
  type SegmentedItem,
} from "@/components/ui";
import { getRequestsSummary } from "@/lib/api/admin/requests";
import { formatNumber } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type Section = "bildirimler" | "basvurular";

const SECTIONS: SegmentedItem<Section>[] = [
  { key: "bildirimler", label: "Bildirimler" },
  { key: "basvurular", label: "Başvurularım" },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function NotificationsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const params = useLocalSearchParams<{
    bolum?: string | string[];
    filtre?: string | string[];
    kategori?: string | string[];
    durum?: string | string[];
    yeni?: string | string[];
  }>();
  const section: Section = first(params.bolum) === "basvurular" ? "basvurular" : "bildirimler";
  const filter = first(params.filtre) || first(params.kategori);

  const feed = useNotificationFeed();
  const { markAll } = useMarkAllNotificationsRead();

  const requestsQuery = useQuery({
    queryKey: ["admin", "requests", "summary"],
    queryFn: getRequestsSummary,
    enabled: Boolean(auth.user) && auth.isManagement,
    staleTime: 30_000,
    retry: false,
  });
  const pendingRequests = requestsQuery.data?.total ?? 0;

  const setSection = useCallback((next: Section) => router.setParams({ bolum: next }), [router]);
  const setFilter = useCallback((next: NotifFilter) => router.setParams({ filtre: next, kategori: "" }), [router]);
  const setStatus = useCallback((next: string | null) => router.setParams({ durum: next ?? "" }), [router]);
  const clearCompose = useCallback(() => router.setParams({ yeni: "" }), [router]);
  const openPrefs = useCallback(() => router.push("/bildirim-tercihleri"), [router]);

  const actions = useMemo<ScreenHeaderAction[]>(() => {
    if (section === "basvurular") {
      return [{ icon: "add", onPress: () => router.setParams({ yeni: "1" }), accessibilityLabel: "Yönetime yeni başvuru" }];
    }
    const list: ScreenHeaderAction[] = [];
    if (feed.unread > 0) {
      list.push({ icon: "checkmark-done", onPress: markAll, accessibilityLabel: "Tümünü okundu işaretle" });
    }
    list.push({ icon: "options-outline", onPress: openPrefs, accessibilityLabel: "Bildirim ayarları" });
    return list;
  }, [feed.unread, markAll, openPrefs, router, section]);

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Bildirimler"
        subtitle={feed.unread > 0 ? `${formatNumber(feed.unread)} okunmamış` : "Hepsi okundu"}
        back
        scrollY={scrollY}
        actions={actions}
        bottom={
          <View style={styles.bottom}>
            {auth.isManagement ? (
              <Touchable
                onPress={() => router.push("/yonetim/talepler")}
                style={styles.requests}
                accessibilityRole="button"
                accessibilityLabel={`Talepler, ${pendingRequests} bekleyen`}
              >
                <Ionicons name="file-tray-full-outline" size={18} color={colors.warn} />
                <Text style={styles.requestsText} numberOfLines={1} {...textScale.dense}>
                  {pendingRequests > 0 ? `${formatNumber(pendingRequests)} yönetim talebi onay bekliyor` : "Yönetim talepleri"}
                </Text>
                {pendingRequests > 0 ? <Badge label={pendingRequests} tone="warn" variant="solid" size="sm" /> : null}
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Touchable>
            ) : null}
            <SegmentedControl items={SECTIONS} value={section} onChange={setSection} stretch size="sm" />
          </View>
        }
      />
      <View style={styles.body}>
        {section === "basvurular" ? (
          <PanelThreadsPane
            status={first(params.durum)}
            onStatusChange={setStatus}
            composeRequested={Boolean(first(params.yeni))}
            onComposeHandled={clearCompose}
            onScroll={scrollProps.onScroll}
            scrollEventThrottle={scrollProps.scrollEventThrottle}
          />
        ) : (
          <NotificationsPane
            filter={filter}
            onFilterChange={setFilter}
            onOpenPrefs={openPrefs}
            onScroll={scrollProps.onScroll}
            scrollEventThrottle={scrollProps.scrollEventThrottle}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  bottom: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm, gap: space.sm },
  requests: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warnDim,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  requestsText: { ...type.label, color: colors.textPrimary, flex: 1 },
});
