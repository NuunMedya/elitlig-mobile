/**
 * YÖNETİM ANA EKRANI — yönetim modunun açılış sayfası ("Panel" sekmesi) ve
 * `/yonetim` rotası.
 *
 * NE (yukarıdan aşağı):
 *   1. SAHNE — gece laciverti kimlik bloğu (gradientAdminStage + Aurora,
 *      üst kenarda altın ışık): monogram altın halkada, selam, rol hapı, gün;
 *      altında "BUGÜNÜN ÖZETİ" dört cam sayaç (açık görev, canlı maç, bekleyen
 *      talep, saha talebi). Rakamlar Odometer ile döner; her sayaç kendi
 *      ekranını açar. Sağ üstte "Üye gözü" cam düğmesi.
 *   2. SENİ BEKLEYENLER — öncelik sırasıyla dikkat isteyen işler: gecikmiş
 *      görev (kırmızı), onay bekleyen talep kategorileri (altın), okunmamış
 *      mesaj ve bugünkü işler (camgöbeği). Solda öncelik şeridi, IconTile,
 *      sağda büyük sayı. Hiçbiri yoksa tek satır "Her şey yolunda".
 *   3. HIZLI EYLEMLER — yetkiye göre dört sütunlu IconTile ızgarası.
 *   4. SIK KULLANILANLAR — öne çıkan altı uygulama büyük karolarla; her karo
 *      canlı özetini taşır ("3 açık iş · 1 gecikmiş").
 *   5. DİĞER ARAÇLAR — yatay IconTile şeridi.
 *   6. BUGÜN — günün maçları, talep dağılımı, yapılacaklarım (DashboardSummary).
 *   7. SON BİLDİRİMLER ve hesap/ayar kapıları.
 *
 * NEDEN SAYAÇLAR AYRI SORGULAR: uçlar bağımsızdır; biri 403 dönse bile (rolün
 * o yetkisi yoksa) diğerleri çizilir. `retry: false` ile yetki hatası sayacı
 * sessizce "—" yapar.
 *
 * `asTab`: alt menüde sekme olarak çizilirken geri düğmesi yoktur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useRouter, type Href } from "expo-router";
import React, { memo, useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DashboardSummary } from "@/components/admin/dashboard/DashboardSummary";
import { NotificationRow, useNotificationFeed } from "@/components/inbox/NotificationsPane";
import {
  Aurora,
  EmptyState,
  IconTile,
  ListRow,
  Odometer,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  Touchable,
  useHeaderScroll,
  useRefresh,
  type IconTileTone,
  type ScreenHeaderAction,
} from "@/components/ui";
import { useAdminCounters, type AdminCounters } from "@/hooks/useAdminCounters";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { useNotificationBell } from "@/hooks/useNotificationBell";
import { FEATURED_ADMIN_APPS, MORE_ADMIN_APPS, visibleAdminApps, type AdminApp } from "@/lib/adminApps";
import { getAdminMatches, getAdminRequests, ROLE_LABELS } from "@/lib/api/admin";
import { useAdminDashboard, type QuickAction } from "@/lib/api/admin/dashboard";
import { useAdminMode } from "@/providers/AdminModeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

import { appBadge } from "./AppDrawer";
import { AppCard, AppIconTile, Rise } from "./AppTiles";

const POLL_MS = 30_000;

const STAGE_START = { x: 1, y: 0 } as const;
const STAGE_END = { x: 0, y: 1 } as const;
const RIM_START = { x: 0, y: 0.5 } as const;
const RIM_END = { x: 1, y: 0.5 } as const;

const greeting = (hour: number) =>
  hour < 6 ? "İyi geceler" : hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";

/** Ad soyaddan iki harflik monogram ("Elif Kaya" → "EK"). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return upperTR(letters);
}

/** Büyük karonun alt satırı: canlı özet ya da kısa tanım. */
function appStatus(app: AdminApp, counters: AdminCounters, live: number | null): string {
  switch (app.key) {
    case "gorevler": {
      if (counters.openTodos == null) return app.tagline;
      if (counters.openTodos === 0) return "Açık işin yok";
      const parts = [`${counters.openTodos} açık iş`];
      if (counters.overdueTodos) parts.push(`${counters.overdueTodos} gecikmiş`);
      else if (counters.todo?.today) parts.push(`${counters.todo.today} bugün`);
      return parts.join(" · ");
    }
    case "mesajlar": {
      if (counters.messages <= 0) return "Okunmamış mesaj yok";
      const parts: string[] = [];
      if (counters.chatUnread) parts.push(`${counters.chatUnread} sohbet`);
      if (counters.memberUnread) parts.push(`${counters.memberUnread} üye mesajı`);
      return parts.join(" · ") || `${counters.messages} okunmamış`;
    }
    case "lig":
      return live && live > 0 ? `${live} maç şu an oynanıyor` : "Maçlar, takımlar, oyuncular, disiplin";
    case "studyo":
      return live && live > 0 ? "Canlı maç var: yayına hazır" : "Skorbord, tekrar, altyazı, reji";
    case "muhasebe":
      return "Hesaplar, ön muhasebe, maç muhasebesi";
    case "projeler":
      return "Süreçler, kişiler, bütçe";
    default:
      return app.tagline;
  }
}

/* ─────────────── Dikkat listesi (öncelik → renk) ─────────────── */

type Priority = "high" | "medium" | "low";

const PRIORITY: Record<Priority, { stripe: string; tile: IconTileTone; count: string; label: string }> = {
  high: { stripe: colors.danger, tile: "red", count: colors.danger, label: "Acil" },
  medium: { stripe: colors.warn, tile: "gold", count: colors.warn, label: "Onay" },
  low: { stripe: colors.accentText, tile: "cyan", count: colors.accentText, label: "Bilgi" },
};

interface AttentionItem {
  key: string;
  priority: Priority;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  count: number;
  route: string;
}

/** Talep kategorisi → ikon (sunucu anahtarları: roster, transfer, penalty…). */
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  roster: "people-outline",
  transfer: "swap-horizontal-outline",
  penalty: "document-attach-outline",
  match_request: "location-outline",
  team_join: "person-add-outline",
  contact: "mail-outline",
};

export function AdminHome({ asTab = false }: { asTab?: boolean }) {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const mode = useAdminMode();
  const queryClient = useQueryClient();
  const appActive = useAppActive();
  const { scrollY, scrollProps } = useHeaderScroll();
  const bell = useNotificationBell();
  const notifFeed = useNotificationFeed();
  const dashboard = useAdminDashboard();

  const canQuery = Boolean(auth.user) && auth.isManagement;
  const poll = appActive ? POLL_MS : false;
  const counters = useAdminCounters(canQuery);

  const venueQuery = useQuery({
    queryKey: ["admin", "match-requests", "badge"],
    queryFn: () => getAdminRequests({ status: "pending" }),
    enabled: canQuery,
    staleTime: 15_000,
    refetchInterval: poll,
    retry: false,
  });

  /* Canlı maç sayacı Maç Yönetimi listesiyle AYNI kapsamdan okunur. */
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
    void queryClient.invalidateQueries({ queryKey: ["todos"] });
    void queryClient.invalidateQueries({ queryKey: ["chat"] });
  }, [queryClient]);

  const refresh = useRefresh(refreshAll, {
    refreshing: venueQuery.isRefetching || liveQuery.isRefetching,
  });

  const go = useCallback((route: string) => router.push(route as Href), [router]);
  const openApp = useCallback((app: AdminApp) => router.push(app.route as Href), [router]);

  const featured = useMemo(() => visibleAdminApps(auth.user, FEATURED_ADMIN_APPS), [auth.user]);
  const more = useMemo(() => visibleAdminApps(auth.user, MORE_ADMIN_APPS), [auth.user]);

  const actions = useMemo<ScreenHeaderAction[]>(() => {
    const list: ScreenHeaderAction[] = [
      {
        icon: "search-outline",
        onPress: () => router.push("/yonetim/tum" as Href),
        accessibilityLabel: "Yönetim sayfalarında ara",
      },
    ];
    if (bell) list.push(bell);
    return list;
  }, [bell, router]);

  const liveMatches = liveQuery.data?.length ?? null;
  const venueRequests = venueQuery.data?.items.length ?? null;

  /* Öncelik sırasıyla dikkat isteyen işler (en çok beş). */
  const attention = useMemo<AttentionItem[]>(() => {
    const list: AttentionItem[] = [];
    if (counters.overdueTodos > 0) {
      list.push({
        key: "overdue",
        priority: "high",
        icon: "alarm-outline",
        title: "Gecikmiş görev",
        subtitle: "Son tarihi geçti; ertele ya da bitir",
        count: counters.overdueTodos,
        route: "/yonetim/gorevler",
      });
    }
    for (const category of dashboard.openCategories.slice(0, 3)) {
      list.push({
        key: `req-${category.key}`,
        priority: "medium",
        icon: CATEGORY_ICONS[category.key] ?? "file-tray-full-outline",
        title: category.label,
        subtitle: "Onayını bekliyor",
        count: category.open,
        route: `/yonetim/talepler?kategori=${encodeURIComponent(category.key)}`,
      });
    }
    const hasVenueCategory = dashboard.openCategories.some((c) => c.key === "match_request");
    if (!hasVenueCategory && venueRequests) {
      list.push({
        key: "venue",
        priority: "medium",
        icon: "location-outline",
        title: "Saha talebi",
        subtitle: "Takımlar maç saati istiyor",
        count: venueRequests,
        route: "/yonetim/sahalar",
      });
    }
    if (counters.messages > 0) {
      list.push({
        key: "messages",
        priority: "low",
        icon: "chatbubbles-outline",
        title: "Okunmamış mesaj",
        subtitle: counters.memberUnread ? `${counters.memberUnread} üye yazışması dahil` : "Ekip sohbetleri",
        count: counters.messages,
        route: "/yonetim/mesajlar",
      });
    }
    if (counters.todo?.today) {
      list.push({
        key: "today",
        priority: "low",
        icon: "today-outline",
        title: "Bugün teslim",
        subtitle: "Gün bitmeden kapanacak işler",
        count: counters.todo.today,
        route: "/yonetim/gorevler",
      });
    }
    return list.slice(0, 5);
  }, [counters, dashboard.openCategories, venueRequests]);

  /* — Kapı: misafir giriş ekranına, yetkisiz üye nazik uyarıya — */

  if (!auth.user) {
    if (auth.initializing) return <View style={styles.screen} />;
    return <Redirect href="/giris" />;
  }

  if (!auth.isManagement) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Yönetim" back={!asTab} />
        <EmptyState
          icon="lock-closed-outline"
          title="Bu bölüm yönetime açık"
          body="Yönetim paneli yalnızca ElitLig yönetim rollerine açıktır. Yetkiniz olduğunu düşünüyorsanız yönetimle iletişime geçin."
          action={{ label: "İletişim", onPress: () => router.push("/iletisim") }}
        />
      </SafeAreaView>
    );
  }

  const user = auth.user;
  const displayName = user.fullName || user.username;
  const firstName = displayName.trim().split(/\s+/)[0] ?? displayName;
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const latestNotifs = notifFeed.items.slice(0, 3);
  const today = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });

  const metrics: SummaryMetric[] = [
    {
      key: "gorevler",
      label: "Açık görev",
      icon: "checkbox-outline",
      value: counters.openTodos,
      loading: counters.loading,
      alert: counters.overdueTodos > 0,
      route: "/yonetim/gorevler",
    },
    {
      key: "maclar",
      label: "Canlı maç",
      icon: "radio-outline",
      value: liveMatches,
      loading: liveQuery.isLoading,
      live: (liveMatches ?? 0) > 0,
      route: "/yonetim/maclar",
    },
    {
      key: "talepler",
      label: "Talep",
      icon: "file-tray-full-outline",
      value: counters.requests,
      loading: counters.loading,
      route: "/yonetim/talepler",
    },
    {
      key: "sahalar",
      label: "Saha talebi",
      icon: "location-outline",
      value: venueRequests,
      loading: venueQuery.isLoading,
      route: "/yonetim/sahalar",
    },
  ];

  /* Karolar ikişerli satırlara bölünür (tek kalan karo satırı tek başına doldurur). */
  const rows: AdminApp[][] = [];
  for (let i = 0; i < featured.length; i += 2) rows.push(featured.slice(i, i + 2));

  const quick = dashboard.quickActions.slice(0, 8);
  const attentionTotal = attention.reduce((sum, item) => sum + item.count, 0);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Yönetim"
        overline={scope.cityLabel ? `ElitLig · ${scope.cityLabel}` : "ElitLig"}
        back={!asTab}
        scrollY={scrollY}
        actions={actions}
      />

      <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
        {/* 1 · SAHNE */}
        <Rise index={0}>
          <View style={styles.stage}>
            <LinearGradient
              colors={colors.gradientAdminStage}
              start={STAGE_START}
              end={STAGE_END}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Aurora variant="stage" height={220} />
            {/* Altın üst ışık — "yönetim modundasın" imzası. */}
            <LinearGradient
              colors={[colors.adminBar, colors.adminAccent, colors.adminBar]}
              start={RIM_START}
              end={RIM_END}
              style={styles.stageRim}
              pointerEvents="none"
            />

            <View style={styles.identity}>
              <LinearGradient colors={colors.gradientAdminAccent} style={styles.monogramRing}>
                <View style={styles.monogram}>
                  <Text style={styles.monogramText} {...textScale.badge}>
                    {initials(displayName)}
                  </Text>
                </View>
              </LinearGradient>
              <View style={styles.identityBody}>
                <Text style={styles.date} numberOfLines={1} {...textScale.badge}>
                  {upperTR(today)}
                </Text>
                <Text style={styles.hello} numberOfLines={1} {...textScale.dense}>
                  {greeting(new Date().getHours())}, {firstName}
                </Text>
                <View style={styles.rolePill}>
                  <Ionicons name="shield-checkmark" size={11} color={colors.adminAccent} />
                  <Text style={styles.roleText} numberOfLines={1} {...textScale.badge}>
                    {upperTR(roleLabel)}
                  </Text>
                </View>
              </View>
              <Touchable
                feedback="button"
                haptic="selection"
                onPress={mode.enterMember}
                style={styles.previewButton}
                accessibilityRole="button"
                accessibilityLabel="Üye gözünden gör"
                accessibilityHint="Uygulamayı normal kullanıcının gördüğü hâle çevirir"
                testID="admin-home-preview-member"
              >
                <Ionicons name="eye-outline" size={18} color={colors.adminAccent} />
                <Text style={styles.previewText} numberOfLines={1} {...textScale.badge}>
                  Üye gözü
                </Text>
              </Touchable>
            </View>

            <Text style={styles.stageOverline} {...textScale.badge}>
              {upperTR("Bugünün özeti")}
            </Text>
            <View style={styles.metrics}>
              {metrics.map((metric) => (
                <SummaryCell key={metric.key} metric={metric} onPress={go} />
              ))}
            </View>
          </View>
        </Rise>

        {/* 2 · SENİ BEKLEYENLER */}
        <Rise index={1}>
          <SectionHeader
            title="Seni bekleyenler"
            meta={attentionTotal ? `${attentionTotal} iş` : undefined}
            action={{ label: "Talepler", onPress: () => go("/yonetim/talepler") }}
            inset="flush"
            style={styles.sectionHeader}
          />
          {counters.loading && dashboard.loading && !attention.length ? (
            <View style={styles.card}>
              <View style={styles.skeletonPad}>
                <Skeleton height={44} radius="md" />
                <Skeleton height={44} radius="md" />
              </View>
            </View>
          ) : attention.length ? (
            <View style={styles.card}>
              {attention.map((item, index) => (
                <AttentionRow key={item.key} item={item} last={index === attention.length - 1} onPress={go} />
              ))}
            </View>
          ) : (
            <View style={[styles.card, styles.allClear]}>
              <IconTile icon="checkmark-done" tone="mint" size={40} />
              <View style={styles.flex}>
                <Text style={styles.allClearTitle} {...textScale.dense}>
                  Her şey yolunda
                </Text>
                <Text style={styles.allClearBody} {...textScale.dense}>
                  Bekleyen onay, gecikmiş iş ya da okunmamış mesaj yok.
                </Text>
              </View>
            </View>
          )}
        </Rise>

        {/* 3 · HIZLI EYLEMLER */}
        {quick.length ? (
          <Rise index={2}>
            <SectionHeader title="Hızlı eylemler" inset="flush" style={styles.sectionHeader} />
            <View style={[styles.card, styles.quickGrid]}>
              {quick.map((action) => (
                <QuickCell key={action.key} action={action} onPress={go} />
              ))}
            </View>
          </Rise>
        ) : null}

        {/* 4 · SIK KULLANILANLAR */}
        <SectionHeader title="Sık kullanılanlar" inset="flush" style={styles.sectionHeader} />
        <View style={styles.cards}>
          {rows.map((row, rowIndex) => (
            <Rise key={row.map((app) => app.key).join("-")} index={rowIndex + 3} style={styles.cardRow}>
              {row.map((app) => {
                const badge = app.key === "lig" ? liveMatches : appBadge(app.key, counters);
                return (
                  <AppCard
                    key={app.key}
                    app={app}
                    status={appStatus(app, counters, liveMatches)}
                    badge={badge}
                    alert={(app.key === "gorevler" && counters.overdueTodos > 0) || (app.key === "lig" && (liveMatches ?? 0) > 0)}
                    onPress={openApp}
                  />
                );
              })}
            </Rise>
          ))}
        </View>

        {/* 5 · DİĞER ARAÇLAR */}
        {more.length ? (
          <>
            <SectionHeader
              title="Diğer araçlar"
              action={{ label: "Tüm sayfalar", onPress: () => go("/yonetim/tum") }}
              inset="flush"
              style={styles.sectionHeader}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={styles.stripBleed}>
              {more.map((app, index) => (
                <Rise key={app.key} index={index + 6} style={styles.stripCell}>
                  <AppIconTile app={app} badge={appBadge(app.key, counters)} onPress={openApp} size={48} />
                </Rise>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* 6 · BUGÜN — web /editor özetinin yerel karşılığı. */}
        <SectionHeader title="Bugün" inset="flush" style={styles.sectionHeader} />
        <DashboardSummary onNavigate={go} showQuickActions={false} showMetrics={false} />

        {/* 7 · BİLDİRİMLER */}
        <SectionHeader
          title="Son bildirimler"
          meta={notifFeed.unread > 0 ? `${notifFeed.unread} okunmamış` : undefined}
          action={{ label: "Tümü", onPress: () => go("/bildirimler") }}
          inset="flush"
          style={styles.sectionHeader}
        />
        {notifFeed.query.isLoading ? (
          <Skeleton height={64} radius="lg" />
        ) : latestNotifs.length ? (
          <View style={styles.notifList}>
            {latestNotifs.map((item, index) => (
              <NotificationRow
                key={item.id}
                notif={item}
                onPress={notifFeed.openNotif}
                first={index === 0}
                last={index === latestNotifs.length - 1}
              />
            ))}
          </View>
        ) : (
          <View style={[styles.card, styles.allClear]}>
            <Ionicons name="notifications-off-outline" size={20} color={colors.textTertiary} />
            <Text style={[styles.allClearBody, styles.flex]} {...textScale.dense}>
              Yeni bildirim yok.
            </Text>
          </View>
        )}

        <SectionHeader title="Hesap ve ayarlar" inset="flush" style={styles.sectionHeader} />
        <View>
          <ListRow
            leading={{ icon: "apps-outline" }}
            title="Tüm yönetim sayfaları"
            subtitle="Yetkine açık bütün sayfalar; adıyla ara"
            chevron
            position="first"
            onPress={() => go("/yonetim/tum")}
          />
          <ListRow
            leading={{ icon: "person-circle-outline" }}
            title="Yönetim hesabım"
            subtitle="Profil, şifre ve yetkilerim"
            chevron
            position="middle"
            onPress={() => go("/yonetim/hesabim")}
          />
          <ListRow
            leading={{ icon: "notifications-outline" }}
            title="Yönetim bildirimleri"
            subtitle="Görev ve gelen kutusu bildirimlerini aç / kapat"
            chevron
            position="last"
            onPress={() => go("/bildirim-tercihleri")}
          />
        </View>

        <Text style={styles.footnote} {...textScale.long}>
          Sayaçlar ekran açıkken kendiliğinden tazelenir. Yaptığınız her işlem üye tarafında anında görünür; geri
          alınamayan eylemler onay ister.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════════ ALT PARÇALAR ══════════════════════════════ */

interface SummaryMetric {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: number | null;
  loading: boolean;
  /** Gecikmiş iş var: rakamın yanında pembe nokta. */
  alert?: boolean;
  /** Şu an oynanan maç var: rakam canlı rengine döner. */
  live?: boolean;
  route: string;
}

/** Özet hücresi — sahnede cam karo: ikon, dönen rakam, versal etiket. */
const SummaryCell = memo(function SummaryCell({
  metric,
  onPress,
}: {
  metric: SummaryMetric;
  onPress: (route: string) => void;
}) {
  const handlePress = useCallback(() => onPress(metric.route), [metric.route, onPress]);
  const accent = metric.live ? colors.liveOnDark : metric.alert ? colors.adminAccent : colors.onDarkMuted;

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${metric.label}: ${metric.value ?? "bilinmiyor"}`}
      style={[styles.metric, metric.live ? styles.metricLive : null]}
    >
      <View style={styles.metricHead}>
        <Ionicons name={metric.icon} size={13} color={accent} />
        {metric.alert || metric.live ? <View style={[styles.metricDot, { backgroundColor: accent }]} /> : null}
      </View>
      {metric.loading ? (
        <View style={styles.metricSkeleton} />
      ) : metric.value == null ? (
        <Text style={styles.metricValue} {...textScale.badge}>
          —
        </Text>
      ) : (
        <Odometer value={metric.value} style={[styles.metricValue, metric.live ? styles.metricValueLive : null]} />
      )}
      <Text style={styles.metricLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(metric.label)}
      </Text>
    </Touchable>
  );
});

/** Dikkat satırı — solda öncelik şeridi, IconTile, başlık + alt metin, sağda sayı. */
const AttentionRow = memo(function AttentionRow({
  item,
  last,
  onPress,
}: {
  item: AttentionItem;
  last: boolean;
  onPress: (route: string) => void;
}) {
  const p = PRIORITY[item.priority];
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={() => onPress(item.route)}
      style={[styles.attention, last ? null : styles.attentionDivided]}
      accessibilityRole="button"
      accessibilityLabel={`${p.label}: ${item.title}, ${item.count}. ${item.subtitle}`}
    >
      <View style={[styles.attentionStripe, { backgroundColor: p.stripe }]} />
      <IconTile icon={item.icon} tone={p.tile} size={36} glow={false} />
      <View style={styles.flex}>
        <Text style={styles.attentionTitle} numberOfLines={1} {...textScale.dense}>
          {item.title}
        </Text>
        <Text style={styles.attentionSub} numberOfLines={1} {...textScale.dense}>
          {item.subtitle}
        </Text>
      </View>
      <Text style={[styles.attentionCount, { color: p.count }]} {...textScale.badge}>
        {item.count > 999 ? "999+" : item.count}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Touchable>
  );
});

/** Hızlı eylem — ızgarada küçük IconTile + iki satıra kadar etiket. */
const QUICK_TONES: Record<string, IconTileTone> = {
  "new-match": "mint",
  "new-news": "pink",
  "new-penalty": "red",
  "bulk-staff": "cyan",
  "run-draw": "gold",
  "new-todo": "violet",
  "open-requests": "gold",
  account: "neutral",
};

const QuickCell = memo(function QuickCell({ action, onPress }: { action: QuickAction; onPress: (route: string) => void }) {
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={() => onPress(action.route)}
      style={styles.quickCell}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <IconTile icon={action.icon} tone={QUICK_TONES[action.key] ?? "violet"} size={42} glow={false} />
      <Text style={styles.quickLabel} numberOfLines={2} {...textScale.dense}>
        {action.label}
      </Text>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant * 2,
  },
  sectionHeader: {
    marginTop: space.xl,
  },

  /* — Sahne — */
  stage: {
    marginTop: space.sm,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.adminBar,
    padding: space.lg,
    paddingTop: space.xl,
    gap: space.md,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  stageRim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.9,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  monogramRing: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    padding: 2,
  },
  monogram: {
    flex: 1,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.adminBar,
  },
  monogramText: {
    ...type.h2,
    fontFamily: fonts.bold,
    color: colors.onDark,
  },
  identityBody: {
    flex: 1,
    gap: space.xxs,
  },
  date: {
    ...type.micro,
    color: colors.onDarkMuted,
  },
  hello: {
    ...type.h1,
    color: colors.onDark,
  },
  rolePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.adminAccent,
  },
  roleText: {
    ...type.micro,
    color: colors.adminAccent,
    flexShrink: 1,
  },
  previewButton: {
    width: 64,
    paddingVertical: space.sm,
    alignItems: "center",
    gap: space.xxs,
    borderRadius: radius.lg,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  previewText: {
    ...type.micro,
    color: colors.onDark,
  },
  stageOverline: {
    ...type.overline,
    color: colors.onDarkMuted,
    marginTop: space.xs,
  },
  metrics: {
    flexDirection: "row",
    gap: space.sm,
  },
  metric: {
    flex: 1,
    minHeight: 86,
    padding: space.sm,
    gap: space.xxs,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  metricLive: {
    borderColor: colors.liveOnDark,
  },
  metricHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  metricValue: {
    ...type.scoreMd,
    color: colors.onDark,
  },
  metricValueLive: {
    color: colors.liveOnDark,
  },
  metricSkeleton: {
    width: 28,
    height: 26,
    borderRadius: radius.xs,
    backgroundColor: colors.inkTile,
  },
  metricLabel: {
    ...type.nano,
    color: colors.onDarkMuted,
  },

  /* — Kartlar — */
  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  skeletonPad: {
    padding: space.md,
    gap: space.sm,
  },
  attention: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 62,
    paddingLeft: space.lg,
    paddingRight: space.md,
    paddingVertical: space.sm,
  },
  attentionDivided: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  attentionStripe: {
    position: "absolute",
    left: 0,
    top: space.sm,
    bottom: space.sm,
    width: 3,
    borderTopRightRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
  },
  attentionTitle: {
    ...type.h4,
    color: colors.textPrimary,
  },
  attentionSub: {
    ...type.caption,
    color: colors.textTertiary,
  },
  attentionCount: {
    ...type.metricSm,
    minWidth: 28,
    textAlign: "right",
  },
  allClear: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
  },
  allClearTitle: {
    ...type.h4,
    color: colors.textPrimary,
  },
  allClearBody: {
    ...type.caption,
    color: colors.textSecondary,
  },

  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: space.sm,
  },
  quickCell: {
    width: "25%",
    alignItems: "center",
    gap: space.s,
    paddingVertical: space.sm,
    paddingHorizontal: space.xxs,
  },
  quickLabel: {
    ...type.caption,
    color: colors.textPrimary,
    textAlign: "center",
  },

  /* — Uygulamalar — */
  cards: {
    gap: space.sm,
  },
  cardRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  stripBleed: {
    marginHorizontal: -layout.screenPadding,
  },
  strip: {
    paddingHorizontal: layout.screenPadding - space.xs,
    paddingTop: space.xs,
  },
  stripCell: {
    width: 78,
  },

  notifList: {
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  footnote: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: space.lg,
    paddingHorizontal: space.xxs,
  },
});
