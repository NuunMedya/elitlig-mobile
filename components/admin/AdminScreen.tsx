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
 *
 * ══════════════ YÖNETİM TASARIM DİLİ (araç sayfaları bunu izler) ══════════════
 *  1. KABUK: `AdminScreen` (araçlarda `app="…"` → ToolAppHeader: degrade
 *     IconTile + ad + canlı alt başlık + vurgu renkli eylemler). İçerik kenar
 *     boşluğu `layout.screenPadding`, bölümler arası `space.xl`.
 *  2. ÖZET BLOĞU: ekranın en önemli 2-4 sayısı en üstte — `ToolSummary` ya da
 *     `StatRow` (cam karolar, Archivo rakam, versal etiket). Kimlik sayfaları
 *     (maç, takım, kişi) `gradientInk`/`gradientAdminStage` + Aurora sahnesi.
 *  3. BÖLÜM: `SectionHeader` ya da `Panel` (radius xl, degrade ray + versal
 *     başlık, sağda "Eylem ›"). Kart içinde kart yok; satırlar ince ayraçla.
 *  4. SATIR: `RecordCard` — önde 40 px IconTile/Avatar, başlık h4, alt metin,
 *     meta (saat ikonu), durum hapları (Badge soft: tamam=win, bekliyor=warn,
 *     ret=danger, taslak=neutral, canlı=live), sağda Archivo değer/chevron.
 *     Solda 3 px `accentColor` şeridi kaydın kimlik/öncelik rengidir.
 *  5. LİSTE: `AdminList` — hap arama, filtre çipleri, özet rayı, ilk 8 satır
 *     `Reveal`; yükleniyor = iskelet, boş = EmptyState (ikon + cümle + eylem).
 *  6. FORM: `FormSheet` — cam grup kartları (`FieldDef.group` başlıkları),
 *     `Input floating` ve aynı ölçüde seçim kutuları, altta `Button lg`.
 *     Seçimler `OptionSheet` (seçili satır brandDim + imza şerit), tarih
 *     `DateSheet` (büyük tarih özeti + yuvarlak gün hücreleri).
 *  7. RENK: çıplak hex yok; durum = Badge tonları, kategori = IconTile tonları,
 *     altın (`adminAccent`) yalnız "yönetim modu" işaretidir.
 *  8. HAREKET: tek seferlik giriş (Reveal/Rise), yaylı sayaç (Odometer);
 *     sürekli döngü yalnız Aurora/GlowRim/LiveBadge'de.
 */

import { Redirect, useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Button,
  IconTile,
  ScreenHeader,
  useHeaderScroll,
  useRefresh,
  type ScreenHeaderAction,
} from "@/components/ui";
import { hasAnyPermission, hasRole } from "@/lib/admin/access";
import type { ToolAppKey } from "@/lib/admin/toolApps";
import { AdminTabRootContext } from "@/providers/AdminModeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space, textScale, type } from "@/theme";

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
        <View style={styles.locked}>
          <IconTile icon="lock-closed" tone="gold" size={64} />
          <Text style={styles.lockedTitle} accessibilityRole="header" {...textScale.dense}>
            Bu bölüme yetkin yok
          </Text>
          <Text style={styles.lockedBody} {...textScale.long}>
            {auth.isManagement
              ? "Bu sayfa için gereken yetki hesabında tanımlı değil. Yetki için yöneticinle görüş."
              : "Bu bölüm yalnız ElitLig yönetim hesaplarına açıktır."}
          </Text>
          <Button label="Yönetim paneline dön" variant="secondary" icon="arrow-back" onPress={() => router.replace("/yonetim")} />
        </View>
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
  locked: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    paddingHorizontal: space.xxxl,
    paddingBottom: space.giant * 2,
  },
  lockedTitle: { ...type.h2, color: colors.textPrimary, textAlign: "center", marginTop: space.sm },
  lockedBody: { ...type.bodySm, color: colors.textSecondary, textAlign: "center", marginBottom: space.sm },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.giant * 2,
    gap: space.md,
  },
});
