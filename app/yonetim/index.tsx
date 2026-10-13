/**
 * YÖNETİM PANELİ — yönetim rollerine açılan giriş ekranı.
 *
 * NE (Arena "merkez" kalıbı): tepede tek SAHNE bloğu — kim olarak işlem
 * yapıldığı (monogram, ad, rol) ve dört sayaçlık ÖZET ŞERİDİ (açık görev,
 * canlı maç, okunmamış başvuru, saha talebi). Altında bölümler gruplanmış
 * liste satırlarıdır; bekleyen iş varsa satırın alt metni sayacın CÜMLESİNE
 * döner ve sağda tonlu rozet durur.
 *
 * NEDEN ÖZET ŞERİDİ: eski ekran sayaçları altı ayrı kartın içine dağıtıyordu;
 * yönetici hangi bölümde iş olduğunu anlamak için listeyi baştan sona
 * taramak zorundaydı. Panelin tek işi "nereye bakmalıyım" sorusunu bir
 * bakışta yanıtlamaktır, bu yüzden dört rakam sahnede büyük yazılır ve her
 * biri kendi bölümünü açar. Rakam tek başına anlam taşımaz; satırda da
 * CÜMLEYLE yazılır (erişilebilirlik).
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
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
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
import { colors, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

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

  /* Özet şeridi: dört sayaç, sahnede rakam kahramandır. Sayaç okunamadıysa
     (yetki yok) "—" yazar; yükleniyorsa sönük nokta. */
  const metrics: SummaryMetric[] = [
    {
      key: "gorevler",
      label: "Açık görev",
      value: openTodos,
      loading: todoQuery.isLoading,
      alert: overdueTodos > 0,
      route: "/yonetim/gorevler",
    },
    {
      key: "maclar",
      label: "Canlı maç",
      value: liveMatches,
      loading: liveQuery.isLoading,
      live: (liveMatches ?? 0) > 0,
      route: "/yonetim/maclar",
    },
    {
      key: "mesajlar",
      label: "Okunmamış",
      value: unread,
      loading: messagesQuery.isLoading,
      route: "/yonetim/mesajlar",
    },
    {
      key: "sahalar",
      label: "Saha talebi",
      value: pendingRequests,
      loading: requestsQuery.isLoading,
      route: "/yonetim/sahalar",
    },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Yönetim Paneli" back scrollY={scrollY} />

      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={refresh.control}
      >
        {/* SAHNE — kimlik + özet. Ekranın tek grafit bloğu: kim olarak işlem
            yapıldığı ve "nereye bakmalıyım" sorusunun cevabı aynı yerde. */}
        <View style={styles.stage}>
          <LinearGradient
            colors={colors.gradientInk}
            start={STAGE_START}
            end={STAGE_END}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.identity}>
            <View style={styles.monogram}>
              <Text style={styles.monogramText} {...textScale.badge}>
                {initials(auth.user.fullName || auth.user.username)}
              </Text>
            </View>
            <View style={styles.identityBody}>
              <Text style={styles.identityName} numberOfLines={1} {...textScale.dense}>
                {auth.user.fullName || auth.user.username}
              </Text>
              <Text style={styles.identityHandle} numberOfLines={1} {...textScale.dense}>
                @{auth.user.username}
                {scope.cityLabel ? ` · ${scope.cityLabel}` : ""}
              </Text>
            </View>
            <View style={styles.rolePill}>
              <Ionicons name="shield-checkmark" size={12} color={colors.brandOnDark} />
              <Text style={styles.rolePillText} numberOfLines={1} {...textScale.badge}>
                {upperTR(roleLabel)}
              </Text>
            </View>
          </View>

          <View style={styles.metrics}>
            {metrics.map((metric, index) => (
              <SummaryCell
                key={metric.key}
                metric={metric}
                first={index === 0}
                onPress={openSection}
              />
            ))}
          </View>
        </View>

        {allFailed ? (
          <ErrorState
            error={messagesQuery.error}
            onRetry={refreshAll}
            variant="banner"
            style={styles.banner}
          />
        ) : null}

        <SectionHeader title="Bölümler" style={styles.sectionHeader} />

        <View>
          {sections.map((section, index) => (
            <SectionRow
              key={section.key}
              section={section}
              position={groupPosition(index, sections.length)}
              onPress={openSection}
            />
          ))}
        </View>

        <SectionHeader title="Tüm yönetim araçları" meta="Web paneli" style={styles.sectionHeader} />
        <Text style={styles.toolsIntro} {...textScale.long}>
          Web sürümündeki bütün yönetim sayfaları burada; yetkine göre listelenir ve uygulamadan
          çıkmadan, yeniden giriş yapmadan açılır.
        </Text>
        {moduleGroups.map((group) => (
          <View key={group.key} style={styles.toolGroup}>
            <Text style={styles.toolGroupTitle} {...textScale.dense}>
              {upperTR(group.title)}
            </Text>
            <View>
              {group.modules.map((module, index) => (
                <ListRow
                  key={module.key}
                  leading={{ icon: module.icon }}
                  title={module.title}
                  subtitle={module.description}
                  chevron
                  position={groupPosition(index, group.modules.length)}
                  onPress={() => openModule(module)}
                  testID={`admin-module-${module.key}`}
                />
              ))}
            </View>
          </View>
        ))}

        <ListRow
          leading={{ icon: "notifications-outline" }}
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

/** Sahne gradyanı — uygulamadaki her yüzey gibi sağdan sola. */
const STAGE_START = { x: 1, y: 0.5 } as const;
const STAGE_END = { x: 0, y: 0.5 } as const;

type GroupPosition = "single" | "first" | "middle" | "last";

function groupPosition(index: number, count: number): GroupPosition {
  if (count === 1) return "single";
  if (index === 0) return "first";
  if (index === count - 1) return "last";
  return "middle";
}

/** Ad soyaddan iki harflik monogram ("Elif Kaya" → "EK"). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return upperTR(letters);
}

interface SummaryMetric {
  key: SectionKey;
  label: string;
  value: number | null;
  loading: boolean;
  /** Gecikmiş iş var: rakamın yanında kırmızı nokta. */
  alert?: boolean;
  /** Şu an oynanan maç var: rakam canlı rengine döner. */
  live?: boolean;
  route: string;
}

/**
 * Özet hücresi — sahnede büyük rakam + küçük versal etiket. Hücreler arası
 * ayraç sol kenardaki hairline'dır; ilk hücrede yoktur.
 */
const SummaryCell = memo(function SummaryCell({
  metric,
  first,
  onPress,
}: {
  metric: SummaryMetric;
  first: boolean;
  onPress: (route: string) => void;
}) {
  const handlePress = useCallback(() => onPress(metric.route), [metric.route, onPress]);
  const shown = metric.loading ? "·" : metric.value == null ? "—" : String(metric.value);

  return (
    <Touchable
      feedback="icon"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${metric.label}: ${metric.value ?? "bilinmiyor"}`}
      style={[styles.metric, first ? null : styles.metricDivided]}
    >
      <View style={styles.metricValueRow}>
        <Text
          style={[styles.metricValue, metric.live ? styles.metricValueLive : null]}
          numberOfLines={1}
          {...textScale.badge}
        >
          {shown}
        </Text>
        {metric.alert ? <View style={styles.metricAlert} /> : null}
      </View>
      <Text style={styles.metricLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(metric.label)}
      </Text>
    </Touchable>
  );
});

/**
 * Bölüm satırı — gruplanmış liste satırı. Bekleyen iş varsa alt satır sayacın
 * CÜMLESİDİR ve sağda tonlu rozet durur; yoksa bölümün ne işe yaradığını
 * söyler. `section` nesnesi `useMemo`'lu olduğu için memo yalnız sayaç
 * değiştiğinde yeniden çizer.
 */
const SectionRow = memo(function SectionRow({
  section,
  position,
  onPress,
}: {
  section: PanelSection;
  position: GroupPosition;
  onPress: (route: string) => void;
}) {
  const handlePress = useCallback(() => onPress(section.route), [onPress, section.route]);
  const active = section.pending != null && section.pending > 0;

  return (
    <ListRow
      leading={
        <View style={[styles.rowIcon, active ? styles.rowIconActive : null]}>
          <Ionicons
            name={section.icon}
            size={18}
            color={active ? colors.brandAccent : colors.textSecondary}
          />
        </View>
      }
      title={section.title}
      subtitle={section.loading ? section.body : active ? section.pendingLabel : section.body}
      badge={
        section.loading ? (
          <Skeleton width={22} height={22} radius="pill" />
        ) : active ? (
          <Badge label={section.pending ?? 0} tone={section.tone} variant="solid" size="sm" />
        ) : undefined
      }
      position={position}
      onPress={handlePress}
      accessibilityLabel={`${section.title}. ${section.pendingLabel}`}
    />
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
  sectionHeader: {
    paddingHorizontal: 0,
  },

  /* — Sahne: kimlik + özet — */
  stage: {
    marginTop: space.sm,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
    padding: space.lg,
    gap: space.lg,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  monogram: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  monogramText: {
    ...type.h2,
    fontFamily: fonts.bold,
    color: colors.onDark,
  },
  identityBody: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    ...type.h1,
    color: colors.onDark,
  },
  identityHandle: {
    ...type.bodySm,
    color: colors.onDarkMuted,
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 24,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  rolePillText: {
    ...type.micro,
    color: colors.brandOnDark,
  },
  metrics: {
    flexDirection: "row",
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    paddingVertical: space.md,
  },
  metric: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  metricDivided: {
    borderLeftWidth: hairline,
    borderLeftColor: colors.borderOnDark,
  },
  metricValueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.xxs,
  },
  metricValue: {
    ...type.metricSm,
    fontSize: 22,
    lineHeight: 26,
    color: colors.onDark,
  },
  metricValueLive: {
    color: colors.liveOnDark,
  },
  metricAlert: {
    width: 6,
    height: 6,
    marginTop: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.liveOnDark,
  },
  metricLabel: {
    ...type.micro,
    color: colors.onDarkMuted,
  },

  banner: {
    marginTop: space.sm,
    borderRadius: radius.md,
  },

  /* — Bölüm satırları — */
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  rowIconActive: {
    backgroundColor: colors.brandDim,
  },

  /* — Araçlar — */
  toolsIntro: {
    ...type.bodySm,
    color: colors.textSecondary,
    marginBottom: space.md,
  },
  toolGroup: {
    marginBottom: space.lg,
    gap: space.sm,
  },
  toolGroupTitle: {
    ...type.overline,
    color: colors.textTertiary,
    paddingHorizontal: space.xxs,
  },
  notifRow: {
    marginTop: space.xs,
  },
  footnote: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: space.lg,
    paddingHorizontal: space.xxs,
  },
});
