/**
 * TAKİP BİLDİRİMLERİ — takip ettiğin her şey için ayrı bildirim ayarı.
 *
 * NE: üye istediği takımı, ligi, sezonu, ili ve maçı takip eder; burada her
 * takibin hangi olaylarda (yeni maç, tarih/saat değişikliği, hatırlatma, maç
 * başladı, gol, kırmızı kart, devre arası, sonuç, transfer, haber) telefona
 * bildirim düşeceğini tek tek seçer. "Yıldızspor'un her şeyi, Ankara'nın yalnız
 * haberleri, Süper Lig'in yalnız sonuçları" gibi ayrımlar mümkündür.
 *
 * VERİ: `GET /api/favorites/notifications` takip listesini, her birinin etkin
 * ayarını ve olay kataloğunu (etiketler, tür başına geçerli olaylar) döndürür;
 * liste TAMAMEN sunucudan çizilir (bkz. lib/api/favorites.ts). Değişiklik
 * `PATCH /api/favorites/:kind/:id/notifications` ile tek takip için yazılır.
 *
 * NEDEN İYİMSER GÜNCELLEME: bildirim tercihleri ekranıyla aynı gerekçe —
 * anahtar dokunulduğu anda dönmeli; hata olursa eski değere dönülür.
 *
 * İL TAKİBİ: takım/lig/sezon/maç kendi sayfalarındaki yıldızla takip edilir.
 * İlin ayrı bir sayfası olmadığı için il takibi bu ekranın altından yapılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SkeletonListRow,
  TeamLogo,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import {
  getFollowNotifications,
  updateFollowNotifications,
  type FollowEventInfo,
  type FollowItem,
  type FollowNotifications,
  type FollowSettingsPatch,
  type FollowType,
} from "@/lib/api/favorites";
import { updateNotificationPreferences } from "@/lib/api/notifications";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, radius, space, textScale, type } from "@/theme";

const FOLLOW_MUTATION_KEY = ["favorites", "follow-settings"] as const;

/** Bölüm sırası ve başlıkları. */
const SECTIONS: { type: FollowType; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "team", title: "Takımlar", icon: "shield-outline" },
  { type: "league", title: "Ligler", icon: "trophy-outline" },
  { type: "season", title: "Sezonlar", icon: "calendar-outline" },
  { type: "city", title: "İller", icon: "location-outline" },
  { type: "match", title: "Maçlar", icon: "football-outline" },
];

const followKey = (item: Pick<FollowItem, "type" | "id">) => `${item.type}:${item.id}`;

/** Kaç olayın açık olduğunu anlatan kısa özet: "5 / 9 bildirim açık". */
function summaryOf(item: FollowItem): string {
  if (item.muted) return "Sessizde — bildirim gelmez";
  const on = item.events.filter((event) => item.prefs[event]).length;
  if (on === 0) return "Tüm bildirimler kapalı";
  if (on === item.events.length) return "Tüm bildirimler açık";
  return `${on} / ${item.events.length} bildirim açık`;
}

/* ═════════════════════════════ EKRAN ═════════════════════════════ */

export default function FollowNotificationsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { scrollY, scrollProps } = useHeaderScroll();
  const { cities } = useScope();
  const { isFavoriteCity, toggleFavoriteCity } = useFavorite();

  const signedIn = Boolean(auth.user);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCities, setShowCities] = useState(false);
  const [pendingCity, setPendingCity] = useState<number | null>(null);

  const query = useQuery({
    queryKey: queryKeys.followNotifications(),
    queryFn: getFollowNotifications,
    enabled: signedIn,
    staleTime: 30_000,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  /* ───────────── takip başına ayar (iyimser) ───────────── */

  const mutation = useMutation({
    mutationKey: FOLLOW_MUTATION_KEY,
    mutationFn: ({ item, patch }: { item: FollowItem; patch: FollowSettingsPatch }) =>
      updateFollowNotifications(item.kind, item.id, patch),

    onMutate: async ({ item, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.followNotifications() });
      const previous = queryClient.getQueryData<FollowNotifications>(queryKeys.followNotifications());
      if (previous) {
        queryClient.setQueryData<FollowNotifications>(queryKeys.followNotifications(), {
          ...previous,
          follows: previous.follows.map((follow) =>
            followKey(follow) === followKey(item)
              ? {
                  ...follow,
                  muted: patch.muted ?? follow.muted,
                  prefs: patch.prefs ? { ...follow.prefs, ...patch.prefs } : follow.prefs,
                  customized: patch.reset ? false : patch.prefs ? true : follow.customized,
                }
              : follow
          ),
        });
      }
      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.followNotifications(), context.previous);
      toast.show({ message: "Ayar kaydedilemedi. Bağlantını kontrol edip tekrar dene.", tone: "danger" });
    },

    // Yalnız son istek bitince tazele (bkz. bildirim-tercihleri.tsx).
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: FOLLOW_MUTATION_KEY }) === 1) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.followNotifications() });
      }
    },
  });
  const { mutate } = mutation;

  const changeFollow = useCallback(
    (item: FollowItem, patch: FollowSettingsPatch) => mutate({ item, patch }),
    [mutate]
  );

  /* ───────────── genel ana anahtar ───────────── */

  const master = useMutation({
    mutationFn: (enabled: boolean) => updateNotificationPreferences({ follow_alerts: enabled }),
    onMutate: async (enabled) => {
      const previous = queryClient.getQueryData<FollowNotifications>(queryKeys.followNotifications());
      if (previous) {
        queryClient.setQueryData<FollowNotifications>(queryKeys.followNotifications(), { ...previous, enabled });
      }
      return { previous };
    },
    onError: (_error, _enabled, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.followNotifications(), context.previous);
      toast.show({ message: "Ayar kaydedilemedi.", tone: "danger" });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationPreferences() });
    },
  });

  /* ───────────── il takibi ───────────── */

  const toggleCity = useCallback(
    async (cityId: number, label: string) => {
      const following = isFavoriteCity(cityId);
      setPendingCity(cityId);
      try {
        await toggleFavoriteCity({ id: cityId, name: label });
        await queryClient.invalidateQueries({ queryKey: queryKeys.followNotifications() });
        toast.show({
          message: following ? `${label} takipten çıkarıldı.` : `${label} takip ediliyor. Bildirimlerini aşağıdan ayarlayabilirsin.`,
          tone: following ? "neutral" : "success",
        });
      } finally {
        setPendingCity(null);
      }
    },
    [isFavoriteCity, queryClient, toast, toggleFavoriteCity]
  );

  /* ───────────── görünüm verisi ───────────── */

  const eventInfo = useMemo(() => {
    const map = new Map<string, FollowEventInfo>();
    query.data?.catalog.events.forEach((event) => map.set(event.key, event));
    return map;
  }, [query.data]);

  const grouped = useMemo(() => {
    const map = new Map<FollowType, FollowItem[]>();
    query.data?.follows.forEach((item) => {
      const list = map.get(item.type) ?? [];
      list.push(item);
      map.set(item.type, list);
    });
    return map;
  }, [query.data]);

  const header = <ScreenHeader title="Takip Bildirimleri" back scrollY={scrollY} />;

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        <EmptyState
          icon="notifications-outline"
          title="Takip bildirimleri hesabına bağlı"
          body="Takip ettiğin takım, lig, sezon, il ve maçlardan bildirim almak için giriş yapmalısın."
          action={{ label: "Giriş yap", onPress: () => router.push("/giris") }}
        />
      </SafeAreaView>
    );
  }

  const data = query.data;
  const enabled = data?.enabled !== false;
  const followCount = data?.follows.length ?? 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
      >
        <View style={styles.intro}>
          {query.error && data ? <ErrorState error={query.error} onRetry={query.refetch} variant="banner" /> : null}

          <Card padding="md">
            <View style={styles.introRow}>
              <Ionicons name="options-outline" size={16} color={colors.brandAccent} />
              <Text style={styles.introText} {...textScale.long}>
                Takip ettiğin her takım, lig, sezon, il ve maç için hangi bildirimleri alacağını ayrı ayrı
                seç. Bir takibe dokun, ayrıntıları aç. Takım, lig, sezon ve maçları kendi sayfalarındaki
                yıldızla takip edebilirsin; illeri bu sayfanın altından ekle.
              </Text>
            </View>
          </Card>

          <ListRow
            title="Takip bildirimleri"
            subtitle={
              enabled
                ? "Açık — aşağıdaki ayarlara göre bildirim gelir."
                : "Kapalı — hiçbir takipten bildirim gelmez."
            }
            position="single"
            toggle={{ value: enabled, onValueChange: (value) => master.mutate(value), disabled: !data }}
            testID="follow-master"
          />
        </View>

        {query.isLoading ? (
          <SkeletonListRow count={6} avatar />
        ) : query.error && !data ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : followCount === 0 ? (
          <EmptyState
            icon="star-outline"
            title="Henüz bir şey takip etmiyorsun"
            body="Takım, lig, sezon ya da maç sayfasındaki yıldıza dokunarak takip et; ya da aşağıdan bir il seç."
            variant="inline"
          />
        ) : (
          SECTIONS.map((section) => {
            const items = grouped.get(section.type);
            if (!items?.length) return null;
            return (
              <View key={section.type} style={[styles.section, !enabled && styles.dimmed]}>
                <SectionHeader title={section.title} meta={String(items.length)} style={styles.sectionHeader} />
                <View style={styles.cards}>
                  {items.map((item) => (
                    <FollowCard
                      key={followKey(item)}
                      item={item}
                      icon={section.icon}
                      expanded={expanded === followKey(item)}
                      onToggleExpand={() =>
                        setExpanded((current) => (current === followKey(item) ? null : followKey(item)))
                      }
                      eventInfo={eventInfo}
                      onChange={changeFollow}
                    />
                  ))}
                </View>
              </View>
            );
          })
        )}

        {/* ───────────── İl takibi ───────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="İl takip et"
            meta={cities.length ? `${cities.length} il` : undefined}
            collapsible
            collapsed={!showCities}
            onToggle={() => setShowCities((value) => !value)}
            style={styles.sectionHeader}
          />
          {showCities ? (
            cities.length ? (
              <View>
                {cities.map((city, index) => (
                  <ListRow
                    key={city.id}
                    title={city.label}
                    subtitle={city.is_archived ? "Arşivlenmiş lig verisi" : undefined}
                    position={
                      cities.length === 1
                        ? "single"
                        : index === 0
                          ? "first"
                          : index === cities.length - 1
                            ? "last"
                            : "middle"
                    }
                    toggle={{
                      value: isFavoriteCity(city.id),
                      onValueChange: () => void toggleCity(city.id, city.label),
                      disabled: pendingCity === city.id,
                    }}
                    testID={`follow-city-${city.id}`}
                  />
                ))}
              </View>
            ) : (
              <SkeletonListRow count={4} avatar={false} />
            )
          ) : (
            <Text style={styles.hint} {...textScale.long}>
              Bir ili takip edersen o ildeki maç sonuçlarını ve haberleri alırsın; gol, kart gibi
              ayrıntıları ilin ayarından açabilirsin.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════ TAKİP KARTI ═══════════════════════════ */

const FollowCard = memo(function FollowCard({
  item,
  icon,
  expanded,
  onToggleExpand,
  eventInfo,
  onChange,
}: {
  item: FollowItem;
  icon: keyof typeof Ionicons.glyphMap;
  expanded: boolean;
  onToggleExpand: () => void;
  eventInfo: Map<string, FollowEventInfo>;
  onChange: (item: FollowItem, patch: FollowSettingsPatch) => void;
}) {
  const leading =
    item.type === "team" ? (
      <TeamLogo name={item.name} logo={item.logo} size={36} />
    ) : (
      { icon, tone: "brand" as const }
    );

  return (
    <View style={styles.card}>
      <ListRow
        leading={leading}
        title={item.name}
        subtitle={[item.subtitle, summaryOf(item)].filter(Boolean).join(" · ")}
        position={expanded ? "first" : "single"}
        onPress={onToggleExpand}
        trailing={
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
        }
        testID={`follow-${item.type}-${item.id}`}
      />

      {expanded ? (
        <>
          <ListRow
            title="Bu takipten bildirim al"
            subtitle={item.muted ? "Sessizde: takip sürer, bildirim gelmez." : "Açık"}
            position="middle"
            toggle={{ value: !item.muted, onValueChange: (value) => onChange(item, { muted: !value }) }}
          />
          {item.events.map((event, index) => {
            const info = eventInfo.get(event);
            return (
              <ListRow
                key={event}
                title={info?.label ?? event}
                subtitle={info?.description}
                position={index === item.events.length - 1 && !item.customized ? "last" : "middle"}
                disabled={item.muted}
                toggle={{
                  value: Boolean(item.prefs[event]),
                  onValueChange: (value) => onChange(item, { prefs: { [event]: value } }),
                  disabled: item.muted,
                }}
                testID={`follow-${item.type}-${item.id}-${event}`}
              />
            );
          })}
          {item.customized ? (
            <View style={styles.resetRow}>
              <Badge label="Özelleştirildi" tone="brand" size="xs" />
              <Button
                label="Varsayılana dön"
                variant="ghost"
                size="sm"
                icon="refresh-outline"
                onPress={() => onChange(item, { reset: true })}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
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
  intro: { paddingTop: space.md, gap: space.sm },
  introRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  introText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  section: { paddingTop: space.sm },
  sectionHeader: { paddingTop: space.lg },
  dimmed: { opacity: 0.55 },
  cards: { gap: space.sm },
  card: { borderRadius: radius.md, overflow: "hidden" },
  resetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: colors.surface,
  },
  hint: { ...type.caption, color: colors.textSecondary, lineHeight: 16 },
});
