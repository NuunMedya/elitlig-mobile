/**
 * LİG YÖNETİMİ — lig operasyonlarına ayrılmış uygulama içi ana ekran.
 *
 * NE: yönetim panelinin "her şey" listesinden ayrı, yalnız LİG İŞLERİNE
 * odaklı bir merkez (Arena "merkez" kalıbı):
 *
 *   1. KAPSAM  — başlığın altında `LeaguePicker` (şehir → lig → sezon).
 *   2. BUGÜN   — seçili kapsamın bugünkü maçları: durum, saat, skor; karta
 *                dokununca doğrudan maçın iş akışı açılır (canlıysa Canlı
 *                akış adımı). Bugün maç yoksa sıradaki maçlar gösterilir.
 *   3. BEKLEYEN İŞLER — kadro onayı, transfer onayı, savunma/itiraz, maç
 *                talebi sayaçları (GET /api/admin/requests/summary).
 *   4. MODÜLLER — Maçlar · Ligler · Takımlar · Oyuncular · Disiplin · İçerik ·
 *                Üyeler gruplarının, kullanıcının YETKİSİ OLAN her modülü.
 *   5. ARAMA   — ekran içi modül araması (ad, açıklama, eş anlamlılar).
 *
 * NEDEN AYRI SORGULAR: bugünün maçları ile bekleyen işler bağımsızdır; biri
 * 403 / hata dönerse diğeri çizilmeye devam eder. Sayaç sorgusu hata verirse
 * bölüm SESSİZCE gizlenir (`retry: false`) — ekran düşmez.
 *
 * İKİ KULLANIM: `app/yonetim/lig.tsx` yığın ekranı olarak (geri oklu) ya da
 * yönetim sekme çubuğunda sekme kökü olarak (`asTab`: geri oku yok, sekme
 * çubuğu kadar alt boşluk).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";

import { AdminScreen } from "@/components/admin/AdminScreen";
import { LeaguePicker } from "@/components/LeaguePicker";
import {
  Badge,
  EmptyState,
  HubGrid,
  HubTile,
  Input,
  ListRow,
  SectionHeader,
  Skeleton,
  TeamLogo,
  Touchable,
  useReduceMotion,
  type HubTone,
  type Tone,
} from "@/components/ui";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import { hasAnyPermission } from "@/lib/admin/access";
import { isoDay } from "@/lib/admin/format";
import { ADMIN_MODULE_GROUPS, visibleModuleGroups, type AdminModule, type AdminModuleGroup } from "@/lib/adminModules";
import { getAdminMatches } from "@/lib/api/admin";
import { dashboardKeys, getRequestsSummary } from "@/lib/api/admin/dashboard";
import { normalizeMatchStatus } from "@/lib/api/admin/matches";
import { formatDayHeading, formatTime } from "@/lib/format";
import type { ApiMatch, MacDurumu } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, duration, easing, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ═══════════════════════════ SABİTLER ═══════════════════════════ */

/** Lig yönetiminin kapsadığı gruplar (lib/adminModules.ts anahtarları), sırasıyla. */
const LEAGUE_GROUP_KEYS = ["maclar", "ligler", "takimlar", "oyuncular", "disiplin", "icerik", "uyeler"] as const;

/** Kapı: bu gruplardaki modüllerden herhangi birinin yetkisi yeterlidir. */
export const LEAGUE_OPS_PERMISSIONS: string[] = Array.from(
  new Set(
    ADMIN_MODULE_GROUPS.filter((g) => (LEAGUE_GROUP_KEYS as readonly string[]).includes(g.key)).flatMap((g) =>
      g.modules.flatMap((m) => m.permission ?? [])
    )
  )
);

/** Grup kimliği rengi — renkli ikon pulu yalnız kategori kimliği taşır. */
const GROUP_TONE: Record<string, HubTone> = {
  maclar: "brand",
  ligler: "accent",
  takimlar: "info",
  oyuncular: "win",
  disiplin: "danger",
  icerik: "warn",
  uyeler: "neutral",
};

const MATCH_PERMS = ["matches.view", "matches.create", "matches.update", "matches.lineup", "matches.live", "matches.stats"];

/**
 * Bekleyen iş sayaçları: sunucu kategorisi → modül. Sayaç yalnız kullanıcının
 * o modüle yetkisi varsa çizilir; modül karosunda da rozet olarak görünür.
 */
const PENDING: { category: string; moduleKey: string; label: string; icon: keyof typeof Ionicons.glyphMap; route: string; permission: string[] }[] = [
  { category: "roster", moduleKey: "kadrolar", label: "Kadro onayı", icon: "checkmark-done-outline", route: "/yonetim/kadrolar", permission: ["roster_rules.requests"] },
  { category: "transfer", moduleKey: "transfer-onaylari", label: "Transfer onayı", icon: "swap-horizontal-outline", route: "/yonetim/transfer-onaylari", permission: ["transfers.view", "transfers.review"] },
  { category: "penalty", moduleKey: "savunmalar", label: "Savunma ve itiraz", icon: "document-attach-outline", route: "/yonetim/savunmalar", permission: ["penalties.review"] },
  { category: "match_request", moduleKey: "sahalar", label: "Maç talebi", icon: "location-outline", route: "/yonetim/sahalar", permission: ["venues.view", "venues.manage"] },
];

const STATUS_META: Record<MacDurumu, { label: string; tone: Tone }> = {
  taslak: { label: "Taslak", tone: "neutral" },
  zamanlanmis: { label: "Zamanlandı", tone: "info" },
  canli: { label: "Canlı", tone: "live" },
  yayinlanmis: { label: "Bitti", tone: "win" },
};

const LIVE_POLL_MS = 20_000;
const IDLE_POLL_MS = 60_000;
const UPCOMING_DAYS = 7;
const CARD_WIDTH = 236;

/* ═══════════════════════════ YARDIMCILAR ═══════════════════════════ */

const fold = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");

/** Maç kaydındaki tarih "2026-08-18T00:00:00.000Z" da olabilir; gün kısmı alınır. */
const matchDay = (match: ApiMatch) => String(match.date ?? "").slice(0, 10);
const startKey = (match: ApiMatch) => `${matchDay(match)}T${match.time ?? "00:00:00"}`;

/** "2026-11-11" + 7 → "2026-11-18" (saat dilimi kaymadan). */
function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/* ═══════════════════════════ GİRİŞ ANİMASYONU ═══════════════════════════ */

/**
 * Bölümün ilk çizimde yumuşak girişi: opaklık + 8px yukarı kayma, yerel
 * sürücüde, sırayla (`index`). "Hareketi azalt" açıkken hiç oynatılmaz.
 */
function Reveal({ index, children }: { index: number; children: React.ReactNode }) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: duration.base,
      delay: Math.min(index, 6) * 40,
      easing: easing.decelerate,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [index, progress, reduceMotion]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [space.sm, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/* ═══════════════════════════ EKRAN ═══════════════════════════ */

export interface LeagueOpsHomeProps {
  /** Sekme kökü olarak çiziliyor: geri oku yok, sekme çubuğu kadar alt boşluk. */
  asTab?: boolean;
}

export function LeagueOpsHome({ asTab = false }: LeagueOpsHomeProps) {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const queryClient = useQueryClient();
  const appActive = useAppActive();
  const teams = useTeamLogos();
  const user = auth.user;
  const enabled = Boolean(user) && auth.isManagement;

  const [query, setQuery] = useState("");

  /* ───────── modüller ───────── */
  const groups = useMemo<AdminModuleGroup[]>(() => {
    const visible = visibleModuleGroups(user);
    return LEAGUE_GROUP_KEYS.map((key) => visible.find((g) => g.key === key)).filter((g): g is AdminModuleGroup => Boolean(g));
  }, [user]);

  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const out: { module: AdminModule; group: AdminModuleGroup }[] = [];
    const seen = new Set<string>();
    for (const group of groups) {
      for (const module of group.modules) {
        if (seen.has(module.route)) continue;
        const hay = fold(`${module.title} ${module.description} ${group.title} ${module.keywords ?? ""}`);
        if (words.every((w) => hay.includes(w))) {
          seen.add(module.route);
          out.push({ module, group });
        }
      }
    }
    return out;
  }, [groups, query]);

  /* ───────── bugünün maçları ───────── */
  const canMatches = hasAnyPermission(user, MATCH_PERMS);
  const today = isoDay();
  const hasScope = Boolean(scope.leagueId && scope.seasonId) || Boolean(scope.cityId);

  const matchesKey = useMemo(
    () => ["admin", "matches", "today", scope.cityId, scope.leagueId, scope.seasonId, today] as const,
    [scope.cityId, scope.leagueId, scope.seasonId, today]
  );
  const matchesQuery = useQuery({
    queryKey: matchesKey,
    queryFn: () =>
      getAdminMatches(
        scope.leagueId && scope.seasonId
          ? { leagueId: scope.leagueId, seasonId: scope.seasonId, dateFrom: today, dateTo: shiftDay(today, UPCOMING_DAYS), limit: 200 }
          : { cityId: scope.cityId ?? undefined, cityName: scope.cityLabel || undefined, dateFrom: today, dateTo: shiftDay(today, UPCOMING_DAYS), limit: 200 }
      ),
    enabled: enabled && canMatches && hasScope,
    staleTime: 10_000,
    retry: false,
    refetchInterval: (q) => {
      if (!appActive) return false;
      return (q.state.data ?? []).some((m) => normalizeMatchStatus(m.mac_durumu) === "canli") ? LIVE_POLL_MS : IDLE_POLL_MS;
    },
  });

  const { todays, upcoming, liveCount } = useMemo(() => {
    const rows = [...(matchesQuery.data ?? [])].sort((a, b) => startKey(a).localeCompare(startKey(b)));
    const isLive = (m: ApiMatch) => normalizeMatchStatus(m.mac_durumu) === "canli";
    // Canlı maç, tarihi dünde kalmış olsa bile (gece yarısını aşan maç) bugünün işidir.
    const todayRows = rows.filter((m) => matchDay(m) === today || isLive(m));
    const order = (m: ApiMatch) => (isLive(m) ? 0 : normalizeMatchStatus(m.mac_durumu) === "yayinlanmis" ? 2 : 1);
    todayRows.sort((a, b) => order(a) - order(b) || startKey(a).localeCompare(startKey(b)));
    return {
      todays: todayRows,
      upcoming: rows.filter((m) => matchDay(m) > today && !isLive(m)).slice(0, 6),
      liveCount: todayRows.filter(isLive).length,
    };
  }, [matchesQuery.data, today]);

  /* ───────── bekleyen işler ───────── */
  const pendingDefs = useMemo(() => PENDING.filter((p) => hasAnyPermission(user, p.permission)), [user]);
  const requestsQuery = useQuery({
    queryKey: dashboardKeys.requests,
    queryFn: getRequestsSummary,
    enabled: enabled && pendingDefs.length > 0,
    staleTime: 30_000,
    retry: false,
    refetchInterval: appActive ? IDLE_POLL_MS : false,
  });
  const pendingByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of requestsQuery.data?.categories ?? []) map.set(c.key, Number(c.open) || 0);
    return map;
  }, [requestsQuery.data]);
  const pendingByModule = useMemo(() => {
    const map = new Map<string, number>();
    for (const def of pendingDefs) map.set(def.moduleKey, pendingByCategory.get(def.category) ?? 0);
    return map;
  }, [pendingDefs, pendingByCategory]);
  const pendingTotal = pendingDefs.reduce((sum, def) => sum + (pendingByCategory.get(def.category) ?? 0), 0);

  /* ───────── eylemler ───────── */
  const go = useCallback((route: string) => router.push(route as Href), [router]);
  const openMatch = useCallback(
    (match: ApiMatch) => {
      const live = normalizeMatchStatus(match.mac_durumu) === "canli";
      go(`/yonetim/mac/${Number(match.id)}${live ? "?adim=canli" : ""}`);
    },
    [go]
  );
  /** Kartın altındaki kısayollar: doğrudan kadro girişi ya da maç sonu ayrıntıları. */
  const openStep = useCallback(
    (match: ApiMatch, step: "kadro" | "mac-sonu") => go(`/yonetim/mac/${Number(match.id)}?adim=${step}`),
    [go]
  );
  const canLineup = hasAnyPermission(user, ["matches.lineup"]);
  const canPost = hasAnyPermission(user, ["matches.stats", "matches.update"]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "matches", "today"] });
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.requests });
  }, [queryClient]);

  const badgeFor = (module: AdminModule): number | null => {
    if (module.key === "maclar") return liveCount || null;
    return pendingByModule.get(module.key) || null;
  };

  const strip = todays.length ? todays : upcoming;

  return (
    <AdminScreen
      title="Lig Yönetimi"
      subtitle={asTab ? undefined : "Maç günü, lig yapısı, takımlar ve disiplin"}
      permission={LEAGUE_OPS_PERMISSIONS}
      back={!asTab}
      bottom={<LeaguePicker />}
      onRefresh={refresh}
      refreshing={matchesQuery.isRefetching || requestsQuery.isRefetching}
      contentStyle={[styles.content, asTab ? styles.contentTab : null]}
    >
      <View style={styles.pad}>
        <Input
          variant="search"
          value={query}
          onChangeText={setQuery}
          placeholder="Lig yönetiminde ara: maç, kadro, ceza…"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Lig yönetimi modüllerinde ara"
        />
      </View>

      {results ? (
        results.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="Eşleşen bölüm yok"
            body="Farklı bir kelime dene: “kadro”, “transfer”, “puan”, “ceza”…"
            action={{ label: "Aramayı temizle", onPress: () => setQuery("") }}
            variant="inline"
          />
        ) : (
          <View style={styles.pad}>
            {results.map(({ module, group }, index) => (
              <ListRow
                key={module.route}
                leading={{ icon: module.icon, tone: "brand" }}
                title={module.title}
                subtitle={`${group.title} · ${module.description}`}
                position={results.length === 1 ? "single" : index === 0 ? "first" : index === results.length - 1 ? "last" : "middle"}
                badge={badgeFor(module) ? <Badge label={badgeFor(module) ?? 0} tone="brand" variant="solid" size="xs" /> : undefined}
                onPress={() => go(module.route)}
              />
            ))}
          </View>
        )
      ) : (
        <>
          {/* ── BUGÜN ── */}
          {canMatches ? (
            <Reveal index={0}>
              <SectionHeader
                title={todays.length || !upcoming.length ? "Bugün" : "Sıradaki maçlar"}
                meta={
                  todays.length
                    ? `${todays.length} maç${liveCount ? ` · ${liveCount} canlı` : ""}`
                    : upcoming.length
                      ? "Bugün maç yok"
                      : undefined
                }
                action={{ label: "Tüm maçlar", onPress: () => go("/yonetim/maclar") }}
              />
              {!hasScope ? (
                <EmptyState
                  icon="options-outline"
                  title="Kapsam seçilmedi"
                  body="Bugünün maçlarını görmek için şehir, lig ve sezon seç."
                  action={{ label: "Kapsam seç", onPress: () => scope.openScopeSheet("city") }}
                  variant="inline"
                  compact
                />
              ) : matchesQuery.isLoading ? (
                <View style={[styles.pad, styles.stripSkeleton]}>
                  <Skeleton width={CARD_WIDTH} height={128} radius="xl" />
                  <Skeleton width={CARD_WIDTH} height={128} radius="xl" />
                </View>
              ) : matchesQuery.isError && !matchesQuery.data ? (
                <View style={styles.pad}>
                  <Touchable style={styles.notice} onPress={() => void matchesQuery.refetch()} accessibilityRole="button">
                    <Ionicons name="cloud-offline-outline" size={18} color={colors.textTertiary} />
                    <Text style={styles.noticeText} {...textScale.long}>
                      Bugünün maçları yüklenemedi. Tekrar denemek için dokun.
                    </Text>
                  </Touchable>
                </View>
              ) : strip.length === 0 ? (
                <View style={styles.pad}>
                  <View style={styles.notice}>
                    <Ionicons name="calendar-clear-outline" size={18} color={colors.textTertiary} />
                    <Text style={styles.noticeText} {...textScale.long}>
                      Bu kapsamda bugün ve önümüzdeki {UPCOMING_DAYS} günde maç yok.
                    </Text>
                  </View>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.strip}
                  decelerationRate="fast"
                  snapToInterval={CARD_WIDTH + space.sm}
                  snapToAlignment="start"
                >
                  {strip.map((match) => (
                    <TodayCard
                      key={match.id}
                      match={match}
                      showDay={!todays.length}
                      homeLogo={teams.logoFor(match.home_team_id, match.first_team_name)}
                      awayLogo={teams.logoFor(match.away_team_id, match.second_team_name)}
                      onOpen={openMatch}
                      onStep={openStep}
                      canLineup={canLineup}
                      canPost={canPost}
                    />
                  ))}
                </ScrollView>
              )}
            </Reveal>
          ) : null}

          {/* ── BEKLEYEN İŞLER ── (sorgu hata verirse bölüm sessizce gizlenir) */}
          {pendingDefs.length > 0 && !requestsQuery.isError ? (
            <Reveal index={1}>
              <SectionHeader
                title="Bekleyen işler"
                meta={requestsQuery.isLoading ? undefined : pendingTotal ? `${pendingTotal} iş` : "Hepsi tamam"}
              />
              <View style={[styles.pad, styles.pendingGrid]}>
                {pendingDefs.map((def) => (
                  <PendingTile
                    key={def.category}
                    label={def.label}
                    icon={def.icon}
                    count={requestsQuery.isLoading ? null : pendingByCategory.get(def.category) ?? 0}
                    onPress={() => go(def.route)}
                  />
                ))}
              </View>
            </Reveal>
          ) : null}

          {/* ── MODÜLLER ── */}
          {groups.map((group, index) => (
            <Reveal key={group.key} index={index + 2}>
              <SectionHeader
                title={group.title}
                meta={group.description}
                leading={<Ionicons name={group.icon} size={16} color={colors.textSecondary} />}
              />
              <HubGrid>
                {group.modules.map((module) => (
                  <HubTile
                    key={module.key}
                    icon={module.icon}
                    title={module.title}
                    subtitle={module.description}
                    tone={GROUP_TONE[group.key] ?? "brand"}
                    badge={badgeFor(module)}
                    onPress={() => go(module.route)}
                  />
                ))}
              </HubGrid>
            </Reveal>
          ))}
        </>
      )}
    </AdminScreen>
  );
}

/* ═══════════════════════════ ALT PARÇALAR ═══════════════════════════ */

/** Bugün şeridindeki maç kartı — tek dokunuşla maçın iş akışı. */
const TodayCard = memo(function TodayCard({
  match,
  showDay,
  homeLogo,
  awayLogo,
  onOpen,
  onStep,
  canLineup,
  canPost,
}: {
  match: ApiMatch;
  showDay: boolean;
  homeLogo: string | null;
  awayLogo: string | null;
  onOpen: (match: ApiMatch) => void;
  onStep: (match: ApiMatch, step: "kadro" | "mac-sonu") => void;
  canLineup: boolean;
  canPost: boolean;
}) {
  const status = normalizeMatchStatus(match.mac_durumu);
  const meta = status ? STATUS_META[status] : { label: "Durumsuz", tone: "neutral" as Tone };
  const live = status === "canli";
  const scored = live || status === "yayinlanmis";
  const when = [showDay ? formatDayHeading(String(match.date ?? "").slice(0, 10)) : null, formatTime(match.time)].filter(Boolean).join(" · ");
  const cta = live ? "Canlı akışı yönet" : status === "yayinlanmis" ? "Maç sonunu aç" : status === "taslak" ? "Maçı hazırla" : "Maçı yönet";

  return (
    <Touchable
      feedback="card"
      haptic="light"
      onPress={() => onOpen(match)}
      style={[styles.card, live ? styles.cardLive : null]}
      accessibilityRole="button"
      accessibilityLabel={`${match.first_team_name} – ${match.second_team_name}, ${meta.label}, ${when}. ${cta}`}
    >
      <View style={styles.cardTop}>
        <Badge label={meta.label.toLocaleUpperCase("tr-TR")} tone={meta.tone} size="xs" dot={false} />
        <Text style={styles.cardWhen} numberOfLines={1} {...textScale.dense}>
          {when || "Saat yok"}
        </Text>
      </View>
      <TeamLine name={match.first_team_name} logo={homeLogo} score={scored ? match.first_team_score : null} />
      <TeamLine name={match.second_team_name} logo={awayLogo} score={scored ? match.second_team_score : null} />
      <View style={styles.cardFoot}>
        <Text style={styles.cardField} numberOfLines={1} {...textScale.dense}>
          {match.match_field || match.league_name || "Saha belirtilmedi"}
        </Text>
        <Text style={[styles.cardCta, live ? styles.cardCtaLive : null]} numberOfLines={1} {...textScale.dense}>
          {cta}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={live ? colors.live : colors.brandAccent} />
      </View>
      {canLineup || canPost ? (
        <View style={styles.cardSteps}>
          {canLineup ? (
            <Touchable
              haptic="selection"
              onPress={() => onStep(match, "kadro")}
              style={styles.cardStep}
              accessibilityRole="button"
              accessibilityLabel={`${match.first_team_name} – ${match.second_team_name} kadro girişi`}
            >
              <Ionicons name="people-outline" size={16} color={colors.brandAccent} />
              <Text style={styles.cardStepText} numberOfLines={1} {...textScale.dense}>
                Kadro
              </Text>
            </Touchable>
          ) : null}
          {canPost ? (
            <Touchable
              haptic="selection"
              onPress={() => onStep(match, "mac-sonu")}
              style={styles.cardStep}
              accessibilityRole="button"
              accessibilityLabel={`${match.first_team_name} – ${match.second_team_name} maç sonu ayrıntıları`}
            >
              <Ionicons name="star-outline" size={16} color={colors.brandAccent} />
              <Text style={styles.cardStepText} numberOfLines={1} {...textScale.dense}>
                Maç sonu
              </Text>
            </Touchable>
          ) : null}
        </View>
      ) : null}
    </Touchable>
  );
});

function TeamLine({ name, logo, score }: { name: string; logo: string | null; score: number | null | undefined }) {
  return (
    <View style={styles.teamLine}>
      <TeamLogo name={name} logo={logo} size={layout.crestSm} />
      <Text style={styles.teamName} numberOfLines={1} {...textScale.dense}>
        {name}
      </Text>
      {score != null ? (
        <Text style={styles.teamScore} {...textScale.badge}>
          {score}
        </Text>
      ) : null}
    </View>
  );
}

/** Bekleyen iş sayacı — rakam kahramandır; sıfırsa sakin, doluysa marka rengi. */
const PendingTile = memo(function PendingTile({
  label,
  icon,
  count,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** null = yükleniyor. */
  count: number | null;
  onPress: () => void;
}) {
  const active = Boolean(count);
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={onPress}
      style={styles.pending}
      accessibilityRole="button"
      accessibilityLabel={count == null ? label : `${label}: ${count} bekleyen`}
    >
      <View style={styles.pendingHead}>
        <Ionicons name={icon} size={14} color={active ? colors.brandAccent : colors.textTertiary} />
        <Text style={styles.pendingLabel} numberOfLines={1} {...textScale.dense}>
          {label.toLocaleUpperCase("tr-TR")}
        </Text>
      </View>
      {count == null ? (
        <Skeleton width={36} height={24} radius="sm" />
      ) : (
        <Text style={[styles.pendingCount, active ? styles.pendingCountActive : null]} {...textScale.badge}>
          {count > 999 ? "999+" : count}
        </Text>
      )}
      <Text style={styles.pendingHint} numberOfLines={1} {...textScale.dense}>
        {count == null ? "Yükleniyor" : active ? "İncele" : "Bekleyen yok"}
      </Text>
    </Touchable>
  );
});

/* ═══════════════════════════ STİLLER ═══════════════════════════ */

const styles = StyleSheet.create({
  /* Bölümler kenar payını kendileri verir (SectionHeader / HubGrid "inset"). */
  content: { paddingHorizontal: 0, gap: space.sm },
  contentTab: { paddingBottom: layout.tabBarHeight + space.xxxl },
  pad: { paddingHorizontal: layout.screenPadding },

  strip: { paddingHorizontal: layout.screenPadding, gap: space.sm },
  stripSkeleton: { flexDirection: "row", gap: space.sm, overflow: "hidden" },
  card: {
    width: CARD_WIDTH,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  cardLive: { borderColor: colors.live },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  cardWhen: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  teamLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  teamName: { ...type.label, color: colors.textPrimary, flex: 1 },
  teamScore: { ...type.scoreSm, color: colors.textPrimary },
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  cardField: { ...type.caption, color: colors.textTertiary, flex: 1 },
  cardCta: { ...type.labelSm, color: colors.brandAccent },
  cardSteps: { flexDirection: "row", gap: space.sm },
  cardStep: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
  },
  cardStepText: { ...type.labelSm, color: colors.brandAccent },
  cardCtaLive: { color: colors.live },

  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  noticeText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },

  pendingGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pending: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 88,
    padding: space.md,
    gap: space.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  pendingHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  pendingLabel: { ...type.micro, color: colors.textTertiary, flex: 1 },
  pendingCount: { ...type.metric, color: colors.textTertiary },
  pendingCountActive: { color: colors.brandAccent },
  pendingHint: { ...type.caption, color: colors.textTertiary },
});
