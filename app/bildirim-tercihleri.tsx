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
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { MenuGroup } from "@/components/account/MenuBlocks";
import {
  Aurora,
  Button,
  EmptyState,
  ErrorState,
  GradientBar,
  IconTile,
  Odometer,
  Reveal,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  SkeletonListRow,
  Toggle,
  Touchable,
  refreshControlProps,
  toneColors,
  useHeaderScroll,
  useRefresh,
  useToast,
  type IconTileTone,
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
import { colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/** Aynı anda giden tercih isteklerini tanımak için (bkz. onSettled). */
const PREFERENCE_MUTATION_KEY = ["notifications", "preference-toggle"] as const;

/**
 * Cihaz izni. "unknown" = modül okunamadı (Expo Go, web) → kart çizilmez;
 * "blocked" = kullanıcı reddetti ve sistem bir daha sormaya izin vermiyor,
 * tek yol Ayarlar.
 */
type PermissionState = "unknown" | "granted" | "undetermined" | "blocked";

/** Grup + satırları (`items` → `data`). */
interface PreferenceSectionData {
  group: NotificationGroup;
  data: NotificationPreferenceItem[];
}

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
  const statusIcon: keyof typeof Ionicons.glyphMap = push.busy
    ? "sync-outline"
    : deviceOk
      ? "checkmark-circle"
      : push.state === "izin-yok"
        ? "notifications-off"
        : "alert-circle";

  const ratio = totals.all > 0 ? totals.on / totals.all : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
      >
        {/* Liste doluyken hata bant olur: tercihleri ekrandan silmek yanlış (§5.6). */}
        {query.error && sections.length > 0 ? (
          <ErrorState error={query.error} onRetry={query.refetch} variant="banner" />
        ) : null}

        {/* 1) ÖZET SAHNESİ — kaç tür açık (dönen sayaç + degrade çubuk) ve
            cihazın durumu tek bakışta. */}
        <Reveal>
          <View style={styles.hero}>
            <LinearGradient
              colors={colors.gradientInk}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Aurora variant="stage" style={StyleSheet.absoluteFill} />
            <Text style={styles.heroOverline} {...textScale.badge}>
              {upperTR("Bu hesaba gelenler")}
            </Text>
            <View style={styles.heroCount}>
              {query.isLoading ? (
                <Skeleton width={96} height={34} radius="sm" />
              ) : (
                <>
                  <Odometer value={totals.on} style={styles.heroValue} />
                  <Text style={styles.heroTotal} {...textScale.badge}>
                    /{totals.all}
                  </Text>
                  <Text style={styles.heroUnit} {...textScale.dense}>
                    tür açık
                  </Text>
                </>
              )}
            </View>
            <GradientBar value={ratio} height={6} track={colors.inkTile} />
            <View style={styles.heroStatus}>
              <View style={[styles.heroDot, { backgroundColor: toneColors(statusTone).fg }]} />
              <Text style={styles.heroStatusText} numberOfLines={1} {...textScale.dense}>
                {statusTitle}
              </Text>
            </View>
          </View>
        </Reveal>

        {/* 2) CİHAZ DURUMU — üç kapı (izin, cihaz kimliği, sunucu kaydı) tek
            başlıkta özetlenir; ayrıntı ve test bildirimi katlanır. */}
        <View style={styles.status}>
          <View style={styles.statusRow}>
            <IconTile icon={statusIcon} tone={TONE_TILE[statusTone]} size={40} glow={false} />
            <View style={styles.statusCopy}>
              <Text style={styles.statusTitle} {...textScale.dense}>
                Telefon izni
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
            <Ionicons name="medkit-outline" size={13} color={colors.brandAccent} />
            <Text style={styles.disclosureText} {...textScale.dense}>
              Sorun mu var?
            </Text>
            <Ionicons name={diagnosticsOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.brandAccent} />
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

        {/* 3) KİMİN İÇİN — takip başına ayrıntılı ayar ayrı ekranda. */}
        <MenuGroup
          items={[
            {
              key: "takip",
              icon: "star",
              tone: "violet",
              title: "Takip ettiklerim için",
              subtitle: "Her takım, lig ve maç için ayrı aç/kapat",
              onPress: openFollowSettings,
              testID: "open-follow-settings",
            },
          ]}
        />

        {/* 4) GRUPLAR — ikonlu başlık, sayaç, "Tümünü aç/kapat"; tek kart. */}
        {query.isLoading ? (
          <View style={styles.groupBlock}>
            <SkeletonListRow count={8} avatar={false} />
          </View>
        ) : query.error && sections.length === 0 ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : sections.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title="Tercih listesi boş"
            body="Sunucu şu an bildirim türü döndürmedi. Biraz sonra tekrar dene."
            variant="inline"
          />
        ) : (
          sections.map((section, sectionIndex) => {
            const on = section.data.filter((item) => item.value).length;
            const all = on === section.data.length;
            const look = groupLook(section.group.key);
            return (
              <Reveal key={section.group.key} index={sectionIndex + 1} style={styles.groupBlock}>
                <SectionHeader
                  title={section.group.label}
                  icon={look.icon}
                  iconTone={look.tone}
                  subtitle={section.group.description}
                  meta={`${on}/${section.data.length}`}
                  action={
                    section.data.length > 1
                      ? { label: all ? "Tümünü kapat" : "Tümünü aç", onPress: () => toggleGroup(section.data) }
                      : undefined
                  }
                  inset="flush"
                />
                <View style={styles.card}>
                  {section.data.map((item, index) => (
                    <PreferenceRow
                      key={item.key}
                      item={item}
                      last={index === section.data.length - 1}
                      onChange={togglePreference}
                    />
                  ))}
                </View>
              </Reveal>
            );
          })
        )}

        {totals.all > 0 ? (
          <Text style={styles.summary} {...textScale.long}>
            Anahtarlar bu hesaba hangi bildirimlerin gönderileceğini belirler; bildirimler takip ettiklerine göre gelir.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════ LİSTE PARÇALARI ═══════════════════════════ */

/** Durum tonu → ikon kutusu tonu. */
const TONE_TILE: Record<"win" | "warn" | "danger" | "neutral", IconTileTone> = {
  win: "mint",
  warn: "gold",
  danger: "red",
  neutral: "neutral",
};

/** Sunucu grup anahtarı → başlık ikonu ve tonu (tanınmayan grup nötr). */
function groupLook(key: string): { icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone } {
  switch (key) {
    case "mac":
      return { icon: "football", tone: "pink" };
    case "panel":
      return { icon: "shield-half", tone: "violet" };
    case "oyun":
      return { icon: "game-controller", tone: "cyan" };
    case "haber":
      return { icon: "newspaper", tone: "gold" };
    default:
      return { icon: "notifications", tone: "neutral" };
  }
}

/**
 * Tek tercih satırı — kartın içinde hafif satır: başlık + açıklama, sağda
 * sıvı anahtar. Satırın tamamı basılabilir; anahtar nesnesi memo'lu kurulur
 * (14 satırlık listede her dokunuşta hepsi yeniden çizilmesin).
 */
const PreferenceRow = memo(function PreferenceRow({
  item,
  last,
  onChange,
}: {
  item: NotificationPreferenceItem;
  last: boolean;
  onChange: (key: string, value: boolean) => void;
}) {
  const handleChange = useCallback((value: boolean) => onChange(item.key, value), [onChange, item.key]);
  const handlePress = useCallback(() => onChange(item.key, !item.value), [onChange, item.key, item.value]);

  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="switch"
      accessibilityState={{ checked: item.value }}
      accessibilityLabel={[item.label, item.description].filter(Boolean).join(". ")}
      testID={`pref-${item.key}`}
      style={[styles.prefRow, !last && styles.prefDivider]}
    >
      <View style={[styles.prefDot, item.value && styles.prefDotOn]} />
      <View style={styles.prefText}>
        <Text style={[styles.prefTitle, !item.value && styles.prefTitleOff]} numberOfLines={1} {...textScale.dense}>
          {item.label}
        </Text>
        {item.description ? (
          <Text style={styles.prefSub} numberOfLines={2} {...textScale.dense}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <Toggle value={item.value} onValueChange={handleChange} accessibilityLabel={item.label} />
    </Touchable>
  );
});

/* ═══════════════════════════ STİLLER ═══════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  list: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.giant,
    gap: space.md,
    flexGrow: 1,
  },

  hero: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    padding: space.lg,
    gap: space.sm,
    backgroundColor: colors.inkBlock,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    ...elevate(2),
  },
  heroOverline: { ...type.overline, color: colors.brandOnDark },
  heroCount: { flexDirection: "row", alignItems: "flex-end", gap: space.xs, minHeight: 34 },
  heroValue: { ...type.scoreLg, color: colors.onDark },
  heroTotal: { ...type.scoreSm, color: colors.onDarkMuted, marginBottom: 3 },
  heroUnit: { ...type.bodySm, color: colors.onDarkMuted, marginBottom: 5, marginLeft: space.xs },
  heroStatus: { flexDirection: "row", alignItems: "center", gap: space.s, marginTop: space.xxs },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
  heroStatusText: { ...type.labelSm, color: colors.onDark, flex: 1 },

  status: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
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
  statusCopy: { flex: 1, gap: 2 },
  statusTitle: { ...type.h3, color: colors.textPrimary },
  statusBody: { ...type.bodySm, color: colors.textSecondary },
  statusSub: { ...type.caption, color: colors.textSecondary },
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

  groupBlock: { marginTop: space.sm },
  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevate(1),
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
  },
  prefDivider: { borderBottomWidth: hairline, borderBottomColor: colors.separator },
  prefDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.surface3 },
  prefDotOn: { backgroundColor: colors.accent },
  prefText: { flex: 1, minWidth: 0, gap: 1 },
  prefTitle: { ...type.h3, color: colors.textPrimary },
  prefTitleOff: { color: colors.textSecondary },
  prefSub: { ...type.bodySm, color: colors.textTertiary },

  summary: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
    paddingHorizontal: space.lg,
    marginTop: space.sm,
  },
});
