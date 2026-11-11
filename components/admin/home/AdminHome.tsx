/**
 * YÖNETİM ANA EKRANI — yönetim modunun açılış sayfası ("Panel" sekmesi) ve
 * `/yonetim` rotası.
 *
 * NE (yukarıdan aşağı):
 *   1. SAHNE — gece laciverti kimlik bloğu: kim olarak işlem yapıldığı, rol,
 *      "Üye gözünden gör" düğmesi ve dört sayaç (açık görev, canlı maç,
 *      bekleyen talep, saha talebi). Her sayaç kendi ekranını açar.
 *   2. UYGULAMALAR — sahibin en çok kullandığı altı uygulama büyük karolarla:
 *      Muhasebe · Yapılacaklar · Projeler · Mesajlar · Lig yönetimi · Yayın
 *      stüdyosu. Her karo canlı özetini taşır ("3 açık iş · 1 gecikmiş").
 *   3. DİĞER ARAÇLAR — yatay simge şeridi (Talepler, Maçlar, Sahalar, Ajanda…).
 *   4. BUGÜN — web /editor kontrol panelinin özeti (DashboardSummary).
 *   5. SON BİLDİRİMLER ve "Tüm yönetim sayfaları" kapısı.
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
  EmptyState,
  ListRow,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  Touchable,
  useHeaderScroll,
  useRefresh,
  type ScreenHeaderAction,
} from "@/components/ui";
import { useAdminCounters, type AdminCounters } from "@/hooks/useAdminCounters";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { useNotificationBell } from "@/hooks/useNotificationBell";
import { FEATURED_ADMIN_APPS, MORE_ADMIN_APPS, visibleAdminApps, type AdminApp } from "@/lib/adminApps";
import { getAdminMatches, getAdminRequests, ROLE_LABELS } from "@/lib/api/admin";
import { useAdminMode } from "@/providers/AdminModeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

import { appBadge } from "./AppDrawer";
import { AppCard, AppIconTile, Rise } from "./AppTiles";

const POLL_MS = 30_000;

const STAGE_START = { x: 1, y: 0.5 } as const;
const STAGE_END = { x: 0, y: 0.5 } as const;

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
  const liveMatches = liveQuery.data?.length ?? null;
  const venueRequests = venueQuery.data?.items.length ?? null;
  const latestNotifs = notifFeed.items.slice(0, 3);

  const metrics: SummaryMetric[] = [
    {
      key: "gorevler",
      label: "Açık görev",
      value: counters.openTodos,
      loading: counters.loading,
      alert: counters.overdueTodos > 0,
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
      key: "talepler",
      label: "Talep",
      value: counters.requests,
      loading: counters.loading,
      route: "/yonetim/talepler",
    },
    {
      key: "sahalar",
      label: "Saha talebi",
      value: venueRequests,
      loading: venueQuery.isLoading,
      route: "/yonetim/sahalar",
    },
  ];

  /* Karolar ikişerli satırlara bölünür (tek kalan karo satırı tek başına doldurur). */
  const rows: AdminApp[][] = [];
  for (let i = 0; i < featured.length; i += 2) rows.push(featured.slice(i, i + 2));

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
            <View style={styles.identity}>
              <View style={styles.monogram}>
                <Text style={styles.monogramText} {...textScale.badge}>
                  {initials(displayName)}
                </Text>
              </View>
              <View style={styles.identityBody}>
                <Text style={styles.hello} numberOfLines={1} {...textScale.dense}>
                  {greeting(new Date().getHours())}, {firstName}
                </Text>
                <View style={styles.roleRow}>
                  <Ionicons name="shield-checkmark" size={12} color={colors.adminAccent} />
                  <Text style={styles.roleText} numberOfLines={1} {...textScale.badge}>
                    {upperTR(roleLabel)} · {upperTR("Yönetim modu")}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.metrics}>
              {metrics.map((metric, index) => (
                <SummaryCell key={metric.key} metric={metric} first={index === 0} onPress={go} />
              ))}
            </View>

            <Touchable
              feedback="button"
              haptic="selection"
              onPress={mode.enterMember}
              style={styles.previewButton}
              accessibilityRole="button"
              accessibilityHint="Uygulamayı normal kullanıcının gördüğü hâle çevirir"
              testID="admin-home-preview-member"
            >
              <Ionicons name="eye-outline" size={16} color={colors.adminAccent} />
              <Text style={styles.previewText} numberOfLines={1} {...textScale.dense}>
                Üye gözünden gör
              </Text>
              <Ionicons name="swap-horizontal" size={14} color={colors.onDarkMuted} />
            </Touchable>
          </View>
        </Rise>

        {/* 2 · UYGULAMALAR */}
        <SectionHeader title="Uygulamalar" style={styles.sectionHeader} />
        <View style={styles.cards}>
          {rows.map((row, rowIndex) => (
            <Rise key={row.map((app) => app.key).join("-")} index={rowIndex + 1} style={styles.cardRow}>
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

        {/* 3 · DİĞER ARAÇLAR */}
        {more.length ? (
          <>
            <SectionHeader
              title="Diğer araçlar"
              action={{ label: "Tüm sayfalar", onPress: () => go("/yonetim/tum") }}
              style={styles.sectionHeader}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={styles.stripBleed}>
              {more.map((app, index) => (
                <Rise key={app.key} index={index + 3} style={styles.stripCell}>
                  <AppIconTile app={app} badge={appBadge(app.key, counters)} onPress={openApp} />
                </Rise>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* 4 · BUGÜN — web /editor özetinin yerel karşılığı. */}
        <SectionHeader title="Bugün" style={styles.sectionHeader} />
        <DashboardSummary onNavigate={go} showQuickActions={false} />

        {/* 5 · BİLDİRİMLER */}
        <SectionHeader
          title="Son bildirimler"
          meta={notifFeed.unread > 0 ? `${notifFeed.unread} okunmamış` : undefined}
          action={{ label: "Tümü", onPress: () => go("/bildirimler") }}
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
          <Text style={styles.footnote} {...textScale.long}>
            Yeni bildirim yok.
          </Text>
        )}

        <View style={styles.links}>
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
  value: number | null;
  loading: boolean;
  /** Gecikmiş iş var: rakamın yanında kırmızı nokta. */
  alert?: boolean;
  /** Şu an oynanan maç var: rakam canlı rengine döner. */
  live?: boolean;
  route: string;
}

/** Özet hücresi — sahnede büyük rakam + küçük versal etiket. */
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
        <Text style={[styles.metricValue, metric.live ? styles.metricValueLive : null]} numberOfLines={1} {...textScale.badge}>
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

  /* — Sahne — */
  stage: {
    marginTop: space.sm,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.adminBar,
    padding: space.lg,
    gap: space.md,
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
    borderWidth: 1.5,
    borderColor: colors.adminAccent,
  },
  monogramText: {
    ...type.h2,
    fontFamily: fonts.bold,
    color: colors.onDark,
  },
  identityBody: {
    flex: 1,
    gap: 3,
  },
  hello: {
    ...type.h1,
    color: colors.onDark,
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  roleText: {
    ...type.micro,
    color: colors.adminAccent,
    flexShrink: 1,
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
    ...type.scoreMd,
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
  previewButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  previewText: {
    ...type.labelSm,
    color: colors.onDark,
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
  },
  stripCell: {
    width: 76,
  },

  notifList: {
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  links: {
    marginTop: space.xl,
  },
  footnote: {
    ...type.caption,
    color: colors.textTertiary,
    marginTop: space.lg,
    paddingHorizontal: space.xxs,
  },
});
