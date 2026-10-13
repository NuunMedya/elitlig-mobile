/**
 * YÖNETİM PANELİ — yönetim rollerine açılan giriş ekranı.
 *
 * NE: rol etiketli bir kimlik bandı ve üç bölüm kartı (Maç / Mesaj / Saha).
 * Her kart, o bölümde BEKLEYEN İŞİ sayar: okunmamış üye başvurusu, onay
 * bekleyen saha talebi ve şu an oynanan maç.
 *
 * NEDEN ROZET: eski ekran yalnız mesaj rozetini gösteriyordu; yönetici hangi
 * bölümde iş olduğunu anlamak için üç ekranı da tek tek açmak zorundaydı.
 * Panelin tek işi "nereye bakmalıyım" sorusunu bir bakışta yanıtlamaktır, bu
 * yüzden üç sayaç da burada toplanır ve kartın altında CÜMLEYLE de yazılır
 * (rozet rengi tek başına anlam taşımaz, §erişilebilirlik).
 *
 * NEDEN AYRI ÜÇ SORGU: üç uç birbirinden bağımsız ve biri 403 dönse bile
 * (rolün o yetkisi yoksa) diğer iki sayaç çizilmeli. `retry: false` ile yetki
 * hatası sessizce sayacı gizler, ekranı düşürmez.
 *
 * NEDEN KAPSAM (scope) SAYACI ETKİLER: canlı maç sayacı, Maç Yönetimi ekranının
 * göstereceği listeyle AYNI kapsamdan okunur; yoksa panelde "1 canlı maç"
 * yazarken listede hiç maç görünmeme çelişkisi doğar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  Touchable,
  useHeaderScroll,
  useRefresh,
  type Tone,
} from "@/components/ui";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { visibleModuleGroups, type AdminModule } from "@/lib/adminModules";
import { getAdminMatches, getAdminMessages, getAdminRequests, ROLE_LABELS } from "@/lib/api/admin";
import { getTodoSummary, todoKeys } from "@/lib/api/todos";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ═══════════════════════════ SABİTLER VE TİPLER ═══════════════════════════ */

/** Sayaçların tazelenme aralığı — uygulama arkadayken hiç yoklanmaz. */
const POLL_MS = 30_000;

type SectionKey = "gorevler" | "maclar" | "sohbet" | "kayitlar" | "mesajlar" | "sahalar";

interface PanelSection {
  key: SectionKey;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  /** Bekleyen iş sayısı; `null` = sayaç okunamadı (yetki yok / hata). */
  pending: number | null;
  /** Sayacın cümle hâli — "3 okunmamış başvuru". */
  pendingLabel: string;
  /** Rozet ve vurgu tonu; renk YALNIZ durum taşır. */
  tone: Tone;
  loading: boolean;
}

/* ══════════════════════════════════ EKRAN ═════════════════════════════════ */

export default function AdminHomeScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const queryClient = useQueryClient();
  const appActive = useAppActive();
  const { scrollY, scrollProps } = useHeaderScroll();

  const canQuery = Boolean(auth.user) && auth.isManagement;
  const poll = appActive ? POLL_MS : false;

  /* — Bekleyen iş sayaçları — */

  const messagesQuery = useQuery({
    queryKey: ["admin", "messages", "badge"],
    queryFn: () => getAdminMessages({ limit: 100 }),
    enabled: canQuery,
    staleTime: 15_000,
    refetchInterval: poll,
    retry: false,
  });

  const requestsQuery = useQuery({
    queryKey: ["admin", "match-requests", "badge"],
    queryFn: () => getAdminRequests({ status: "pending" }),
    enabled: canQuery,
    staleTime: 15_000,
    refetchInterval: poll,
    retry: false,
  });

  const todoQuery = useQuery({
    queryKey: todoKeys.summary(),
    queryFn: getTodoSummary,
    enabled: canQuery,
    staleTime: 15_000,
    refetchInterval: poll,
    retry: false,
  });

  const liveQuery = useQuery({
    queryKey: ["admin", "matches", "live-badge", scope.leagueId, scope.seasonId],
    queryFn: () =>
      getAdminMatches({
        leagueId: scope.leagueId ?? undefined,
        seasonId: scope.seasonId ?? undefined,
        status: "canli",
        limit: 50,
      }),
    enabled: canQuery,
    staleTime: 10_000,
    refetchInterval: poll,
    retry: false,
  });

  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  }, [queryClient]);

  const refresh = useRefresh(refreshAll, {
    refreshing:
      messagesQuery.isRefetching || requestsQuery.isRefetching || liveQuery.isRefetching,
  });

  /* — Kartlar — */

  const unread = messagesQuery.data?.counts.unread ?? null;
  const pendingRequests = requestsQuery.data?.items.length ?? null;
  const liveMatches = liveQuery.data?.length ?? null;
  const openTodos = todoQuery.data?.open ?? null;
  const overdueTodos = todoQuery.data?.overdue ?? 0;

  const sections = useMemo<PanelSection[]>(
    () => [
      {
        key: "gorevler",
        route: "/yonetim/gorevler",
        icon: "checkbox-outline",
        title: "Görevlerim",
        body: "Yapılacaklar: sana atananlar, atadıkların, maç görevlerin",
        pending: openTodos,
        pendingLabel:
          openTodos && openTodos > 0
            ? `${openTodos} açık görev${overdueTodos ? ` · ${overdueTodos} gecikmiş` : ""}`
            : "Açık görevin yok",
        tone: overdueTodos ? "danger" : "brand",
        loading: todoQuery.isLoading,
      },
      {
        key: "maclar",
        route: "/yonetim/maclar",
        icon: "football-outline",
        title: "Maç Yönetimi",
        body: "Skor gir, durum değiştir, taslakları yayınla",
        pending: liveMatches,
        pendingLabel:
          liveMatches && liveMatches > 0
            ? `${liveMatches} maç şu an oynanıyor`
            : "Şu an oynanan maç yok",
        tone: "live",
        loading: liveQuery.isLoading,
      },
      {
        key: "mesajlar",
        route: "/yonetim/mesajlar",
        icon: "chatbubbles-outline",
        title: "Mesaj Yönetimi",
        body: "Üye başvurularını yanıtla, önceliklendir, kapat",
        pending: unread,
        pendingLabel:
          unread && unread > 0 ? `${unread} okunmamış başvuru` : "Okunmamış başvuru yok",
        tone: "warn",
        loading: messagesQuery.isLoading,
      },
      {
        key: "sohbet",
        route: "/yonetim/sohbet",
        icon: "chatbubbles",
        title: "Sohbet",
        body: "Üyelerin yönetimle yazışmaları: sesli ara, konum ve maç teklifi gönder; onay bekleyen işlemleri kartlardan sonuçlandır",
        pending: null,
        pendingLabel: "WhatsApp mantığında yönetim sohbeti",
        tone: "brand",
        loading: false,
      },
      {
        key: "kayitlar",
        route: "/yonetim/kayitlar",
        icon: "recording-outline",
        title: "Kayıtlar",
        body: "Yönetimle yapılan sesli aramaların kayıtları",
        pending: null,
        pendingLabel: "Yönetim araması arşivi",
        tone: "neutral",
        loading: false,
      },
      {
        key: "sahalar",
        route: "/yonetim/sahalar",
        icon: "location-outline",
        title: "Saha Yönetimi",
        body: "Maç taleplerini incele, haftalık programı düzenle",
        pending: pendingRequests,
        pendingLabel:
          pendingRequests && pendingRequests > 0
            ? `${pendingRequests} talep onay bekliyor`
            : "Onay bekleyen talep yok",
        tone: "info",
        loading: requestsQuery.isLoading,
      },
    ],
    [
      openTodos,
      overdueTodos,
      todoQuery.isLoading,
      liveMatches,
      liveQuery.isLoading,
      messagesQuery.isLoading,
      pendingRequests,
      requestsQuery.isLoading,
      unread,
    ],
  );

  const openSection = useCallback((route: string) => router.push(route as never), [router]);

  /* Web panelindeki her yönetim sayfası (yetkiye göre) — uygulama içinde açılır. */
  const moduleGroups = useMemo(() => visibleModuleGroups(auth.user), [auth.user]);
  const openModule = useCallback(
    (module: AdminModule) =>
      router.push({ pathname: "/yonetim/web", params: { path: module.path, title: module.title } }),
    [router]
  );

  /* — Kapı: misafir giriş ekranına, yetkisiz üye nazik uyarıya — */

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  if (!auth.isManagement) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Yönetim Paneli" back />
        <EmptyState
          icon="lock-closed-outline"
          title="Bu bölüm yönetime açık"
          body="Yönetim paneli yalnızca ElitLig yönetim rollerine açıktır. Yetkiniz olduğunu düşünüyorsanız yönetimle iletişime geçin."
          action={{ label: "İletişim", onPress: () => router.push("/iletisim") }}
        />
      </SafeAreaView>
    );
  }

  const roleLabel = ROLE_LABELS[auth.user.role] ?? auth.user.role;
  /** Üç sorgunun da düşmesi ağ/oturum sorununu gösterir; biri düşerse sessiz kal. */
  const allFailed = messagesQuery.isError && requestsQuery.isError && liveQuery.isError && todoQuery.isError;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Yönetim Paneli" back scrollY={scrollY} />

      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={refresh.control}
      >
        {/* Kimlik bandı — kim olarak işlem yapıldığı her zaman görünür. */}
        <View style={styles.identity}>
          <Avatar name={auth.user.fullName ?? auth.user.username} size={48} ring="brand" />
          <View style={styles.identityBody}>
            <Text style={styles.identityName} numberOfLines={1} {...textScale.dense}>
              {auth.user.fullName || auth.user.username}
            </Text>
            <Text style={styles.identityHandle} numberOfLines={1} {...textScale.dense}>
              @{auth.user.username}
            </Text>
            <View style={styles.roleRow}>
              <Badge label={roleLabel.toLocaleUpperCase("tr-TR")} tone="brand" size="xs" />
              {scope.cityLabel ? (
                <Badge label={scope.cityLabel.toLocaleUpperCase("tr-TR")} tone="neutral" size="xs" />
              ) : null}
            </View>
          </View>
          <Ionicons name="shield-checkmark" size={20} color={colors.brandAccent} />
        </View>

        {allFailed ? (
          <ErrorState
            error={messagesQuery.error}
            onRetry={refreshAll}
            variant="banner"
            style={styles.banner}
          />
        ) : null}

        <SectionHeader title="Bölümler" />

        <View style={styles.cards}>
          {sections.map((section) => (
            <SectionCard key={section.key} section={section} onPress={openSection} />
          ))}
        </View>

        <SectionHeader title="Tüm yönetim araçları" meta="Web paneli" />
        <Text style={styles.toolsIntro} {...textScale.long}>
          Web sürümündeki bütün yönetim sayfaları burada; yetkine göre listelenir ve uygulamadan
          çıkmadan, yeniden giriş yapmadan açılır.
        </Text>
        {moduleGroups.map((group) => (
          <View key={group.key} style={styles.toolGroup}>
            <Text style={styles.toolGroupTitle} {...textScale.dense}>
              {group.title.toLocaleUpperCase("tr-TR")}
            </Text>
            <View style={styles.toolList}>
              {group.modules.map((module, index) => (
                <ListRow
                  key={module.key}
                  leading={{ icon: module.icon, tone: "brand" }}
                  title={module.title}
                  subtitle={module.description}
                  chevron
                  position={
                    group.modules.length === 1
                      ? "single"
                      : index === 0
                        ? "first"
                        : index === group.modules.length - 1
                          ? "last"
                          : "middle"
                  }
                  onPress={() => openModule(module)}
                  testID={`admin-module-${module.key}`}
                />
              ))}
            </View>
          </View>
        ))}

        <ListRow
          leading={{ icon: "notifications-outline", tone: "brand" }}
          title="Yönetim bildirimleri"
          subtitle="Görev ve gelen kutusu bildirimlerini aç / kapat"
          chevron
          position="single"
          onPress={() => router.push("/bildirim-tercihleri")}
          style={styles.notifRow}
        />

        <Text style={styles.footnote} {...textScale.long}>
          Sayaçlar ekran açıkken kendiliğinden tazelenir. Yaptığınız her işlem üye tarafında anında
          görünür; bu yüzden geri alınamayan eylemler onay ister.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════════ ALT PARÇALAR ══════════════════════════════ */

/**
 * Bölüm kartı. `section` nesnesi `useMemo`'lu olduğu için referansı sabittir;
 * memo bu sayede yalnız sayaç değiştiğinde yeniden çizer.
 */
const SectionCard = memo(function SectionCard({
  section,
  onPress,
}: {
  section: PanelSection;
  onPress: (route: string) => void;
}) {
  const handlePress = useCallback(() => onPress(section.route), [onPress, section.route]);
  const active = section.pending != null && section.pending > 0;

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${section.title}. ${section.pendingLabel}`}
      style={styles.card}
    >
      <View style={styles.cardIcon}>
        <Ionicons name={section.icon} size={20} color={colors.brandAccent} />
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
          {section.title}
        </Text>
        <Text style={styles.cardText} numberOfLines={2} {...textScale.dense}>
          {section.body}
        </Text>

        {section.loading ? (
          <Skeleton width="55%" height={12} radius="xs" style={styles.cardPendingSkeleton} />
        ) : section.pending == null ? null : (
          <Text
            style={[styles.cardPending, active ? styles.cardPendingActive : null]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {section.pendingLabel}
          </Text>
        )}
      </View>

      {active ? (
        <Badge label={section.pending ?? 0} tone={section.tone} variant="solid" size="sm" />
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Touchable>
  );
});

/* ═════════════════════════════════ STİLLER ═════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
  },

  /* Kimlik bandı */
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    backgroundColor: colors.brandDim,
  },
  identityBody: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    ...type.h2,
    color: colors.textPrimary,
  },
  identityHandle: {
    ...type.caption,
    color: colors.textSecondary,
  },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    marginTop: space.xs,
  },

  banner: {
    marginTop: space.sm,
  },

  /* Bölüm kartları */
  cards: {
    gap: space.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  cardText: {
    ...type.caption,
    color: colors.textSecondary,
  },
  cardPending: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: space.xxs,
  },
  cardPendingActive: {
    color: colors.textPrimary,
  },
  cardPendingSkeleton: {
    marginTop: space.xs,
  },

  toolsIntro: {
    ...type.caption,
    color: colors.textSecondary,
    marginBottom: space.sm,
  },
  toolGroup: {
    marginBottom: space.md,
    gap: space.xs,
  },
  toolGroupTitle: {
    ...type.caption,
    color: colors.textTertiary,
    letterSpacing: 0.6,
    paddingHorizontal: space.xxs,
  },
  toolList: {},
  notifRow: {
    marginTop: space.sm,
  },
  footnote: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: space.lg,
    paddingHorizontal: space.xxs,
  },
});
