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
 * NEDEN GİRİŞ GEREKİR: tercihler hesaba bağlıdır (kullanıcı satırında tutulur),
 * cihaza değil. Misafire çağrı gösterilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
  Platform,
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
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SkeletonListRow,
  refreshControlProps,
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
import { post } from "@/lib/http";
import { registerForPushNotifications } from "@/lib/notifications";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, radius, space, textScale, type } from "@/theme";

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
    mutationFn: ({ key, value }: { key: string; value: boolean }) =>
      updateNotificationPreferences({ [key]: value }),

    onMutate: async ({ key, value }) => {
      // Uçuştaki GET yanıtı iyimser değeri ezmesin.
      await queryClient.cancelQueries({ queryKey: queryKeys.notificationPreferences() });

      const previous = queryClient.getQueryData<NotificationPreferences>(
        queryKeys.notificationPreferences(),
      );

      if (previous) {
        queryClient.setQueryData<NotificationPreferences>(queryKeys.notificationPreferences(), {
          ...previous,
          preferences: { ...previous.preferences, [key]: value },
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
    (key: string, value: boolean) => mutate({ key, value }),
    [mutate],
  );

  /* ────────────────────────── CİHAZ İZNİ ────────────────────────── */

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

      const token = await registerForPushNotifications();
      if (token) {
        /**
         * Token'ı burada kaydetmezsek cihaz bir sonraki SOĞUK AÇILIŞA kadar
         * bildirim alamaz: usePushNotifications yalnız uygulama açılırken
         * çalışıyor. İzin verildiği an kaydetmek için doğru yer burasıdır.
         */
        try {
          await post("/api/users/push-token", { token, platform: Platform.OS });
        } catch {
          // Token kaydı başarısızsa tercih ekranı yine de çalışmalı.
        }
      }
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

  const goToSignIn = useCallback(() => router.push("/giris"), [router]);

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
    ({ section }: { section: PreferenceSectionData }) => (
      <SectionHeader title={section.group.label} style={styles.sectionHeader} />
    ),
    [],
  );

  /* ────────────────────────── GÖRÜNÜM ────────────────────────── */

  const header = <ScreenHeader title="Bildirim Tercihleri" back scrollY={scrollY} />;

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="notifications-outline"
          title="Tercihler hesabına bağlı"
          body="Hangi bildirimleri alacağını seçebilmek için giriş yapmalısın. Favorilerin cihazda kalır, tercihler hesabında."
          action={{ label: "Giriş yap", onPress: goToSignIn }}
        />
      </SafeAreaView>
    );
  }

  const permissionBlocked = permission === "blocked";
  const permissionMissing = permission === "undetermined" || permissionBlocked;

  const listHeader = (
    <View style={styles.intro}>
      {/* Liste doluyken hata bant olur: tercihleri ekrandan silmek yanlış (§5.6). */}
      {query.error && sections.length > 0 ? (
        <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
      ) : null}

      <Card padding="md">
        <View style={styles.introRow}>
          <Ionicons name="phone-portrait-outline" size={16} color={colors.brandAccent} />
          <Text style={styles.introText} {...textScale.long}>
            Bildirimler favorilerine göre gelir: yıldızladığın maçın golleri, takımının fikstürü ve
            sana gelen panel mesajları. Aşağıdaki anahtarlar hangi türlerin telefonuna düşeceğini
            belirler.
          </Text>
        </View>
      </Card>

      {permissionMissing ? (
        <View style={styles.permission}>
          <View style={styles.introRow}>
            <Ionicons name="notifications-off-outline" size={16} color={colors.warn} />
            <Text style={styles.permissionText} {...textScale.long}>
              {permissionBlocked
                ? "Telefonun ElitLig bildirimlerini engelliyor. Aşağıdaki anahtarlar ancak sistem ayarlarından izin verince çalışır."
                : "Bildirimlere henüz izin vermedin. İzin vermeden hiçbir bildirim telefonuna düşmez."}
            </Text>
          </View>
          <Button
            label={permissionBlocked ? "Ayarları aç" : "Bildirimlere izin ver"}
            onPress={permissionBlocked ? openSystemSettings : askPermission}
            loading={asking}
            size="sm"
            variant="secondary"
            fullWidth
          />
        </View>
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
    gap: space.sm,
  },
  introRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  introText: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },

  permission: {
    gap: space.sm,
    backgroundColor: colors.warnDim,
    borderRadius: radius.md,
    padding: space.md,
  },
  permissionText: {
    ...type.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },

  sectionHeader: {
    paddingTop: space.lg,
  },
});
