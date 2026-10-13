/**
 * BİLDİRİM TERCİHLERİ — hangi bildirimin telefona düşeceğini kullanıcı seçer.
 *
 * NE: sunucudaki tercih anahtarları, Türkçe etiketleri ve grup düzeni
 * `GET /api/users/me/notification-preferences` ile alınır; her satır bir
 * anahtardır ve anahtarın değeri `PATCH` ile kaydedilir. Ekran eski
 * `app/bildirim-ayarlari.tsx`'in yerini alır.
 *
 * NEDEN ANAHTAR LİSTESİ KODA GÖMÜLMEZ: eski ekran dokuz anahtarı, etiketini ve
 * bölümlerini kendi içinde tutuyordu; bunların yalnız biri (günün testi)
 * sunucuya ulaşıyor, kalanı cihazda AsyncStorage'de ölü veri olarak duruyordu.
 * Sunucu bugün 14 anahtar döndürüyor ve yenisini eklediğinde mobil sürüm
 * çıkmadan burada görünmesi gerekiyor. Bu yüzden liste TAMAMEN sunucudan gelir;
 * istemci yalnız çizer (bkz. lib/api/notifications.ts → preferenceSections).
 *
 * NEDEN İYİMSER GÜNCELLEME: anahtar dokunulduğu anda dönmeli. Yanıt beklenirse
 * 300-800 ms boyunca anahtar eski konumunda takılı kalır ve kullanıcı ikinci
 * kez dokunur. Değer önce önbellekte değişir, istek arkada gider; hata olursa
 * eski değere döner ve Toast sebebini söyler.
 *
 * NEDEN İZİN KARTI: tercihler sunucu tarafını yönetir ama telefon bildirime
 * izin vermiyorsa hiçbiri görünmez. Kart bu iki katmanı ayırır: önce cihaz
 * izni, sonra tür seçimi. Expo Go'da push modülü token veremez — kart sessizce
 * gizlenir, ekranın geri kalanı çalışır.
 *
 * BİR BAKIŞTA OKUNSUN (yeniden tasarım):
 *   1. CİHAZ DURUMU — tek başlık ("Bu telefon bildirim alıyor" / "Bildirim
 *      izni kapalı") + tek eylem. Teşhis ayrıntısı ve test bildirimi
 *      "Sorun mu var?" altında katlanır; herkesin değil, sorunu olanın işi.
 *   2. ÖZET — "14 türden 10'u açık".
 *   3. GRUPLAR — her grubun başlığında "3/4 açık" sayacı ve TEK dokunuşla
 *      "Tümünü aç / Tümünü kapat". Grup anahtarları tek PATCH ile gider.
 *   4. Takip bazında ayar (takım, lig, maç) ayrı ekrandadır; satırı gruplar
 *      ile cihaz durumu arasında durur, "kimin için" sorusunun kapısıdır.
 *
 * NEDEN GİRİŞ GEREKİR: tercihler hesaba bağlıdır (kullanıcı satırında tutulur),
 * cihaza değil. Misafire çağrı gösterilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { SectionListRenderItemInfo } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SkeletonListRow,
  Touchable,
  refreshControlProps,
  toneColors,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/api/notifications";
import type {
  NotificationGroup,
  NotificationPreferenceItem,
  NotificationPreferences,
} from "@/lib/api/notifications";
import { preferenceSections } from "@/lib/api/notifications";
import {
  pushStatusTone,
  serverSyncMessage,
  usePushStatus,
} from "@/hooks/usePushStatus";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, elevate, hairline, layout, radius, space, textScale, type } from "@/theme";

/** Aynı anda giden tercih isteklerini tanımak için (bkz. onSettled). */
const PREFERENCE_MUTATION_KEY = ["notifications", "preference-toggle"] as const;

/**
 * Cihaz izni. "unknown" = modül okunamadı (Expo Go, web) → kart çizilmez;
 * "blocked" = kullanıcı reddetti ve sistem bir daha sormaya izin vermiyor,
 * tek yol Ayarlar.
 */
type PermissionState = "unknown" | "granted" | "undetermined" | "blocked";

/** SectionList'in beklediği biçim (`items` → `data`). */
interface PreferenceSectionData {
  group: NotificationGroup;
  data: NotificationPreferenceItem[];
}

const keyExtractor = (item: NotificationPreferenceItem) => item.key;

/* ═════════════════════════════ EKRAN ═════════════════════════════ */

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { scrollY, scrollProps } = useHeaderScroll();

  const signedIn = Boolean(auth.user);

  const query = useQuery({
    queryKey: queryKeys.notificationPreferences(),
    queryFn: getNotificationPreferences,
    enabled: signedIn,
    staleTime: 60_000,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  /* ────────────────────── İYİMSER KAYDETME ────────────────────── */

  const mutation = useMutation({
    mutationKey: PREFERENCE_MUTATION_KEY,
    /* Tek anahtar ya da bir grubun tüm anahtarları — sunucu kısmi PATCH alır. */
    mutationFn: ({ changes }: { changes: Record<string, boolean> }) =>
      updateNotificationPreferences(changes),

    onMutate: async ({ changes }) => {
      // Uçuştaki GET yanıtı iyimser değeri ezmesin.
      await queryClient.cancelQueries({ queryKey: queryKeys.notificationPreferences() });

      const previous = queryClient.getQueryData<NotificationPreferences>(
        queryKeys.notificationPreferences(),
      );

      if (previous) {
        queryClient.setQueryData<NotificationPreferences>(queryKeys.notificationPreferences(), {
          ...previous,
          preferences: { ...previous.preferences, ...changes },
        });
      }

      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notificationPreferences(), context.previous);
      }
      toast.show({
        message: "Tercih kaydedilemedi. Bağlantını kontrol edip tekrar dene.",
        tone: "danger",
      });
    },

    /**
     * NEDEN "SON İSTEK" KONTROLÜ: kullanıcı üç anahtarı üst üste açarsa üç
     * PATCH yola çıkar. Her yanıtta önbelleği tazelemek, henüz sunucuya
     * ulaşmamış diğer iki iyimser değeri geri alır ve anahtarlar zıplar.
     * Bu yüzden tazeleme YALNIZ son istek bittiğinde yapılır.
     */
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: PREFERENCE_MUTATION_KEY }) === 1) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notificationPreferences() });
      }
    },
  });

  const { mutate } = mutation;

  const togglePreference = useCallback(
    (key: string, value: boolean) => mutate({ changes: { [key]: value } }),
    [mutate],
  );

  /** Grubun hepsi açıksa hepsini kapatır, değilse hepsini açar. */
  const toggleGroup = useCallback(
    (items: NotificationPreferenceItem[]) => {
      const turnOn = items.some((item) => !item.value);
      const changes: Record<string, boolean> = {};
      items.forEach((item) => {
        changes[item.key] = turnOn;
      });
      mutate({ changes });
    },
    [mutate],
  );

  /* ────────────────────────── CİHAZ İZNİ VE TEŞHİS ────────────────────────── */

  const push = usePushStatus();
  const { retry: pushRetry } = push;


  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [asking, setAsking] = useState(false);

  /** Güncel izin durumunu okur ve DÖNDÜRÜR — çağıran sonuca göre Toast basar. */
  const readPermission = useCallback(async (): Promise<PermissionState> => {
    let next: PermissionState = "unknown";
    try {
      const Notifications = await import("expo-notifications");
      const status = await Notifications.getPermissionsAsync();
      next = status.granted ? "granted" : status.canAskAgain ? "undetermined" : "blocked";
    } catch {
      // Expo Go / web: modül yok. Kart çizilmez, ekranın geri kalanı çalışır.
      next = "unknown";
    }
    setPermission(next);
    return next;
  }, []);

  useEffect(() => {
    void readPermission();
  }, [readPermission]);

  const askPermission = useCallback(async () => {
    setAsking(true);
    try {
      /**
       * İZİN İSTEĞİ AYRI ÇAĞRILIR: `registerForPushNotifications` gerçek cihaz
       * değilse izin sormadan çıkar (token alamayacağı için). Emülatörde ve
       * Expo Go'da düğme "hiçbir şey yapmadı" gibi görünmesin diye sistem
       * penceresi burada açılır; token denemesi ondan sonra gelir.
       */
      try {
        const Notifications = await import("expo-notifications");
        await Notifications.requestPermissionsAsync();
      } catch {
        // Modül yoksa sessizce geç.
      }

      /**
       * Kayıt ve sunucuya yazım TEK yerden yürür (hooks/usePushStatus).
       * İzin verildiği an çalıştırılır: aksi hâlde cihaz bir sonraki SOĞUK
       * AÇILIŞA kadar bildirim alamaz.
       */
      await pushRetry(true);
    } finally {
      setAsking(false);
    }

    const next = await readPermission();
    if (next === "granted") {
      toast.show({
        message: "Bildirimler açıldı. Seçtiğin türler artık telefonuna düşer.",
        tone: "success",
      });
    } else if (next !== "unknown") {
      toast.show({
        message: "İzin verilmedi. Bildirimleri sistem ayarlarından açabilirsin.",
        tone: "warn",
      });
    }
  }, [readPermission, toast]);

  const openSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  /**
   * TEST BİLDİRİMİ — hangi katmanın bozuk olduğunu kesin olarak söyler.
   *
   * Bu YEREL bir bildirimdir: sunucuya, Expo'ya, FCM/APNs'e hiç uğramaz.
   * Sonuç iki şeyden birini kanıtlar:
   *   · Görünüyorsa → telefon izni ve uygulama tarafı SAĞLAM. Bildirim
   *     gelmiyorsa sorun teslimat zincirindedir (Expo/FCM/APNs kimlikleri ya
   *     da cihaz kaydı) — üstteki teşhis satırı hangisi olduğunu söyler.
   *   · Görünmüyorsa → sorun cihazdadır: izin kapalı, "rahatsız etmeyin" açık
   *     ya da kanal susturulmuş.
   * Bu ayrım olmadan "bildirim gelmiyor" şikâyeti teşhis edilemiyordu.
   */
  const [testing, setTesting] = useState(false);

  const sendTestNotification = useCallback(async () => {
    setTesting(true);
    try {
      const Notifications = await import("expo-notifications");

      const status = await Notifications.getPermissionsAsync();
      if (!status.granted) {
        toast.show({
          message: "Önce bildirim izni vermelisin.",
          tone: "warn",
        });
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "ElitLig test bildirimi",
          body: "Bunu gördüysen telefonun bildirimlere hazır.",
          // Veri yükü boş bırakılmaz: dokunulduğunda routeFromNotif çözemezse
          // uygulama normal açılışını yapar, bu doğru davranıştır.
          data: { kind: "test" },
        },
        trigger: null,
      });

      toast.show({
        message: "Test bildirimi gönderildi. Bildirim gölgesini kontrol et.",
        tone: "success",
      });
    } catch {
      toast.show({
        message:
          "Test bildirimi gönderilemedi. Bu derlemede bildirim modülü çalışmıyor olabilir (Expo Go).",
        tone: "danger",
      });
    } finally {
      setTesting(false);
    }
  }, [toast]);

  const goToSignIn = useCallback(() => router.push("/giris"), [router]);
  const openFollowSettings = useCallback(() => router.push("/takip-bildirimleri"), [router]);

  /* ────────────────────────── BÖLÜMLER ────────────────────────── */

  const sections = useMemo<PreferenceSectionData[]>(() => {
    if (!query.data) return [];
    return preferenceSections(query.data).map((section) => ({
      group: section.group,
      data: section.items,
    }));
  }, [query.data]);

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<NotificationPreferenceItem, PreferenceSectionData>) => (
      <PreferenceRow
        item={item}
        position={
          section.data.length === 1
            ? "single"
            : index === 0
              ? "first"
              : index === section.data.length - 1
                ? "last"
                : "middle"
        }
        onChange={togglePreference}
      />
    ),
    [togglePreference],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: PreferenceSectionData }) => {
      const on = section.data.filter((item) => item.value).length;
      const all = on === section.data.length;
      return (
        <View>
          <SectionHeader
            title={section.group.label}
            meta={`${on}/${section.data.length} açık`}
            action={
              section.data.length > 1
                ? { label: all ? "Tümünü kapat" : "Tümünü aç", onPress: () => toggleGroup(section.data) }
                : undefined
            }
            style={styles.sectionHeader}
          />
          {section.group.description ? (
            <Text style={styles.groupDescription} {...textScale.long}>
              {section.group.description}
            </Text>
          ) : null}
        </View>
      );
    },
    [toggleGroup],
  );

  const totals = useMemo(() => {
    let on = 0;
    let all = 0;
    sections.forEach((section) => {
      all += section.data.length;
      on += section.data.filter((item) => item.value).length;
    });
    return { on, all };
  }, [sections]);

  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  /* ────────────────────────── GÖRÜNÜM ────────────────────────── */

  const header = <ScreenHeader title="Bildirim türleri" back scrollY={scrollY} />;

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="notifications-outline"
          title="Bildirim ayarların hesabında durur"
          body="Gol, maç başlangıcı, sonuç ve haber bildirimlerini seçmek için giriş yap. Takip ettiklerin cihazında kalır."
          action={{ label: "Giriş yap", onPress: goToSignIn }}
        />
      </SafeAreaView>
    );
  }

  const permissionBlocked = permission === "blocked";

  const deviceOk = push.state === "hazir" && push.server === "yazildi";
  const statusTone = push.busy ? "neutral" : pushStatusTone(push);
  const statusTitle = push.busy
    ? "Bildirim durumu kontrol ediliyor"
    : deviceOk
      ? "Bu telefon bildirim alıyor"
      : push.state === "izin-yok"
        ? "Bildirim izni kapalı"
        : push.state === "hazir"
          ? "Cihaz kaydı tamamlanmadı"
          : "Bildirimler hazır değil";

  const listHeader = (
    <View style={styles.intro}>
      {/* Liste doluyken hata bant olur: tercihleri ekrandan silmek yanlış (§5.6). */}
      {query.error && sections.length > 0 ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
      ) : null}

      {/* 1) CİHAZ DURUMU — üç kapı (izin, cihaz kimliği, sunucu kaydı) tek
          başlıkta özetlenir; ayrıntı ve test bildirimi katlanır. */}
      <View style={styles.status}>
        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, { backgroundColor: toneColors(statusTone).dim }]}>
            <Ionicons
              name={
                push.busy
                  ? "sync-outline"
                  : deviceOk
                    ? "checkmark-circle"
                    : push.state === "izin-yok"
                      ? "notifications-off"
                      : "alert-circle"
              }
              size={20}
              color={toneColors(statusTone).fg}
            />
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle} {...textScale.dense}>
              {statusTitle}
            </Text>
            <Text style={styles.statusBody} {...textScale.long}>
              {push.busy ? "Birkaç saniye sürebilir." : push.message}
            </Text>
          </View>
        </View>

        {!push.busy && push.state !== "hazir" ? (
          <Button
            label={permissionBlocked || push.state === "izin-yok" ? "Ayarları aç" : "Tekrar dene"}
            onPress={permissionBlocked || push.state === "izin-yok" ? openSystemSettings : askPermission}
            loading={asking}
            size="sm"
            variant="primary"
            fullWidth
          />
        ) : push.server === "hata" ? (
          <Button
            label="Cihazı yeniden kaydet"
            onPress={askPermission}
            loading={asking}
            size="sm"
            variant="secondary"
            fullWidth
          />
        ) : null}

        <Touchable
          feedback="chip"
          onPress={() => setDiagnosticsOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: diagnosticsOpen }}
          style={styles.disclosure}
        >
          <Text style={styles.disclosureText} {...textScale.dense}>
            Sorun mu var?
          </Text>
          <Ionicons
            name={diagnosticsOpen ? "chevron-up" : "chevron-down"}
            size={14}
            color={colors.brandAccent}
          />
        </Touchable>

        {diagnosticsOpen ? (
          <View style={styles.diagnostics}>
            {!push.busy && push.state === "hazir" ? (
              <Text style={styles.statusSub} {...textScale.long}>
                {serverSyncMessage(push)}
              </Text>
            ) : null}
            {/* Yerel köprü: push zinciri kurulu olmasa bile bildirimlerin
                görünmesini sağlayan yedek yol (hooks/useNotificationBridge.ts). */}
            <Text style={styles.statusSub} {...textScale.long}>
              Uygulama açıkken bildirimler yedek yoldan da gelir: bildirim merkezine düşen her yeni
              kayıt telefonda gösterilir. Uygulama tamamen kapalıyken yalnız push bildirimi çalışır.
            </Text>
            <Button
              label="Test bildirimi gönder"
              onPress={sendTestNotification}
              loading={testing}
              size="sm"
              variant="secondary"
              icon="notifications-outline"
              fullWidth
            />
          </View>
        ) : null}
      </View>

      {/* 2) KİMİN İÇİN — takip başına ayrıntılı ayar ayrı ekranda. */}
      <ListRow
        leading={{ icon: "star", tone: "brand" }}
        title="Takip ettiklerim için"
        subtitle="Her takım, lig ve maç için ayrı aç/kapat"
        position="single"
        chevron
        onPress={openFollowSettings}
        testID="open-follow-settings"
      />

      {/* 3) ÖZET — kaç tür açık, tek cümle. */}
      {totals.all > 0 ? (
        <Text style={styles.summary} {...textScale.long}>
          <Text style={styles.summaryStrong}>{`${totals.on} / ${totals.all} tür açık.`}</Text>
          {" Anahtarlar bu hesaba hangi bildirimlerin gönderileceğini belirler; bildirimler takip ettiklerine göre gelir."}
        </Text>
      ) : null}
    </View>
  );

  const listEmpty = query.isLoading ? (
    <SkeletonListRow count={8} avatar={false} />
  ) : query.error ? (
    <ErrorState error={query.error} onRetry={query.refetch} />
  ) : (
    <EmptyState
      icon="notifications-outline"
      title="Tercih listesi boş"
      body="Sunucu şu an bildirim türü döndürmedi. Biraz sonra tekrar dene."
      variant="inline"
    />
  );

  /**
   * `refresh.control` hazır düğüm döndürür ama tipi `ReactElement<unknown>`;
   * RN'in `refreshControl` prop'u `ReactElement<RefreshControlProps>` bekler.
   */
  const refreshControl = (
    <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      <SectionList
        {...scrollProps}
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.list}
        refreshControl={refreshControl}
        initialNumToRender={14}
        windowSize={7}
      />
    </SafeAreaView>
  );
}

/* ═══════════════════════════ LİSTE PARÇALARI ═══════════════════════════ */

/**
 * Tek tercih satırı. VARLIK NEDENİ: `ListRow` memo'lu ama `toggle` nesnesi her
 * render'da yeniden kurulursa memo işe yaramaz — 14 satırlık listede her
 * dokunuşta hepsi yeniden çizilir. Nesne burada, anahtarı bağlayan
 * `useCallback` üstünde kurulur.
 */
const PreferenceRow = memo(function PreferenceRow({
  item,
  position,
  onChange,
}: {
  item: NotificationPreferenceItem;
  position: "single" | "first" | "middle" | "last";
  onChange: (key: string, value: boolean) => void;
}) {
  const handleChange = useCallback(
    (value: boolean) => onChange(item.key, value),
    [onChange, item.key],
  );

  const toggle = useMemo(
    () => ({ value: item.value, onValueChange: handleChange }),
    [item.value, handleChange],
  );

  return (
    <ListRow
      title={item.label}
      subtitle={item.description}
      position={position}
      toggle={toggle}
      testID={`pref-${item.key}`}
    />
  );
});

/* ═══════════════════════════ STİLLER ═══════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
    flexGrow: 1,
  },

  intro: {
    paddingTop: space.md,
    gap: space.md,
  },

  status: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  statusCopy: { flex: 1, gap: 2 },
  statusTitle: { ...type.h3, color: colors.textPrimary },
  statusBody: { ...type.bodySm, color: colors.textSecondary },
  statusSub: { ...type.caption, color: colors.textSecondary, lineHeight: 16 },
  disclosure: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xs,
    minHeight: 28,
    marginBottom: -space.xs,
  },
  disclosureText: { ...type.label, color: colors.brandAccent },
  diagnostics: {
    gap: space.sm,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },

  summary: {
    ...type.bodySm,
    color: colors.textSecondary,
    paddingHorizontal: space.xxs,
  },
  summaryStrong: {
    fontFamily: type.h4.fontFamily,
    color: colors.textPrimary,
  },
  groupDescription: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: -space.xs,
    marginBottom: space.sm,
  },

  sectionHeader: {
    paddingTop: space.xl,
    paddingHorizontal: 0,
  },
});
