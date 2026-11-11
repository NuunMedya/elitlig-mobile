/**
 * AdminScreen — yerel yönetim ekranlarının ortak kabuğu.
 *
 * NE: güvenli alan + ScreenHeader (geri, eylemler) + YETKİ KAPISI. Kapı web
 * ProtectedRoute ile aynı kuralı uygular: misafir giriş ekranına gider,
 * yönetim rolü olmayan ya da istenen yetkilerden HİÇBİRİNE sahip olmayan
 * kullanıcı nazik bir kilit ekranı görür. Asıl denetim sunucudadır (403);
 * kapı yalnız boş bir ekranla karşılaşmayı önler.
 *
 * İKİ KULLANIM:
 *   · `scroll` (varsayılan): içerik ScrollView içinde, aşağı çekip yenileme
 *     `onRefresh` verilirse açılır.
 *   · `scroll={false}`: ekran kendi FlatList'ini çizer (AdminList gibi);
 *     kabuk yalnız başlığı ve kapıyı sağlar.
 */

import { Redirect, useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  EmptyState,
  ScreenHeader,
  useHeaderScroll,
  useRefresh,
  type ScreenHeaderAction,
} from "@/components/ui";
import { hasAnyPermission, hasRole } from "@/lib/admin/access";
import type { ToolAppKey } from "@/lib/admin/toolApps";
import { AdminTabRootContext } from "@/providers/AdminModeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space } from "@/theme";

import { ToolAppHeader } from "./tools/ToolApp";

export interface AdminScreenProps {
  title: string;
  subtitle?: string;
  /** Bunlardan birine sahip olan girer (admin her zaman). */
  permission?: readonly string[];
  /** Yalnız bu rollere açık (ör. ["admin"]). */
  roles?: readonly string[];
  actions?: ScreenHeaderAction[];
  /** Başlığın altında sabit duran şerit (sekmeler, arama). */
  bottom?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  onRefresh?: () => unknown;
  refreshing?: boolean;
  /** İçerik kabının stili (scroll modunda). */
  contentStyle?: StyleProp<ViewStyle>;
  /** Kaydırılan alanın dışında, en üstte çizilen katman (FAB vb.). */
  overlay?: React.ReactNode;
  back?: boolean;
  /**
   * Araç kimliği (lib/admin/toolApps.ts). Verilirse ekran, ortak başlık
   * yerine aracın KENDİ uygulama başlığıyla açılır: renkli simge pulu, ad,
   * vurgu renginde eylemler. Verilmezse davranış değişmez.
   */
  app?: ToolAppKey;
  /** Araç içi bölüm sekmeleri (ToolTabs) — yalnız `app` ile birlikte. */
  appTabs?: React.ReactNode;
}

export function AdminScreen({
  title,
  subtitle,
  permission,
  roles,
  actions,
  bottom,
  children,
  scroll = true,
  onRefresh,
  refreshing,
  contentStyle,
  overlay,
  back: backProp = true,
  app,
  appTabs,
}: AdminScreenProps) {
  const auth = useAuth();
  const router = useRouter();
  /* Alt menüde SEKME olarak çizilen ekranda geri düğmesi yoktur. */
  const tabRoot = React.useContext(AdminTabRootContext);
  const back = backProp && !tabRoot;
  const { scrollY, scrollProps } = useHeaderScroll();
  const refresh = useRefresh(onRefresh ?? noop, { refreshing });

  if (!auth.user) return <Redirect href="/giris" />;

  const allowed =
    auth.isManagement &&
    (roles?.length ? hasRole(auth.user, roles) : true) &&
    hasAnyPermission(auth.user, permission);

  if (!allowed) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {app ? <ToolAppHeader app={app} title={title} back={back} /> : <ScreenHeader title={title} back={back} />}
        <EmptyState
          icon="lock-closed-outline"
          title="Bu bölüme yetkin yok"
          body={
            auth.isManagement
              ? "Bu sayfa için gereken yetki hesabında tanımlı değil. Yetki için yöneticinle görüş."
              : "Bu bölüm yalnız ElitLig yönetim hesaplarına açıktır."
          }
          action={{ label: "Yönetim paneline dön", onPress: () => router.replace("/yonetim") }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {app ? (
        <ToolAppHeader app={app} title={title} subtitle={subtitle} back={back} actions={actions} tabs={appTabs} bottom={bottom} />
      ) : (
        <ScreenHeader
          title={title}
          subtitle={subtitle}
          back={back}
          actions={actions}
          bottom={bottom}
          scrollY={scroll ? scrollY : undefined}
        />
      )}
      {scroll ? (
        <ScrollView
          {...scrollProps}
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? refresh.control : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
      {overlay}
    </SafeAreaView>
  );
}

function noop() {}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.giant * 2,
    gap: space.md,
  },
});
