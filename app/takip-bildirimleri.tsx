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
 * ODAK: `?odak=team:610` ile açılırsa o takibin ayarları açık gelir (takım,
 * maç ve lig sayfalarındaki zil düğmesi buraya bu parametreyle gelir).
 *
 * YÖNETİM KOLAYLIĞI (yeniden tasarım): her takip tek kart. Kartın sağındaki
 * zil SESSİZE ALIR / AÇAR — en sık yapılan iş tek dokunuştur, kartı açmak
 * gerekmez. Karta dokununca olaylar ÇİP olarak açılır ("Gol", "Sonuç"…):
 * on satırlık anahtar listesi yerine tek bakışta hangi anların açık olduğu
 * görünür; "Hepsi" / "Hiçbiri" iki dokunuşla toplu seçim yapar.
 *
 * İL TAKİBİ: takım/lig/sezon/maç kendi sayfalarındaki yıldızla takip edilir.
 * İlin ayrı bir sayfası olmadığı için il takibi bu ekranın altından yapılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FollowEventEditor } from "@/components/FollowEventEditor";
import {
  EmptyState,
  ErrorState,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SkeletonListRow,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import {
  type FollowEventInfo,
  type FollowItem,
  type FollowNotifications,
  type FollowSettingsPatch,
  type FollowType,
} from "@/lib/api/favorites";
import { followKey, followSummary as summaryOf, useFollowSettings } from "@/hooks/useFollowSettings";
import { updateNotificationPreferences } from "@/lib/api/notifications";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, hairline, layout, radius, space, textScale, touchSlop, type } from "@/theme";

/** Bölüm sırası ve başlıkları. */
const SECTIONS: { type: FollowType; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "team", title: "Takımlar", icon: "shield-outline" },
  { type: "league", title: "Ligler", icon: "trophy-outline" },
  { type: "season", title: "Sezonlar", icon: "calendar-outline" },
  { type: "city", title: "İller", icon: "location-outline" },
  { type: "match", title: "Maçlar", icon: "football-outline" },
];


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
  const params = useLocalSearchParams<{ odak?: string }>();
  const focusKey = typeof params.odak === "string" && /^[a-z]+:\d+$/.test(params.odak) ? params.odak : null;
  const [expanded, setExpanded] = useState<string | null>(focusKey);
  const [showCities, setShowCities] = useState(false);
  const [pendingCity, setPendingCity] = useState<number | null>(null);

  // Sorgu ve iyimser yazım "Takip et" alt sayfasıyla ortak (hooks/useFollowSettings).
  const { query, change: changeFollow, eventInfo } = useFollowSettings();
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

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

  const grouped = useMemo(() => {
    const map = new Map<FollowType, FollowItem[]>();
    query.data?.follows.forEach((item) => {
      const list = map.get(item.type) ?? [];
      // Odaktaki takip kendi bölümünün başına alınır ki kaydırmadan görünsün.
      if (focusKey && followKey(item) === focusKey) list.unshift(item);
      else list.push(item);
      map.set(item.type, list);
    });
    return map;
  }, [query.data, focusKey]);

  const header = <ScreenHeader title="Takip bildirimleri" subtitle="Kimden, hangi anlarda" back scrollY={scrollY} />;

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

          <ListRow
            leading={{ icon: enabled ? "notifications" : "notifications-off", tone: enabled ? "brand" : "neutral" }}
            title="Takip bildirimleri"
            subtitle={
              enabled
                ? "Açık · aşağıdaki ayarlara göre gelir"
                : "Kapalı · hiçbir takipten bildirim gelmez"
            }
            position="single"
            toggle={{ value: enabled, onValueChange: (value) => master.mutate(value), disabled: !data }}
            testID="follow-master"
          />
          <Text style={styles.hint} {...textScale.long}>
            Zile dokun: o takibi sessize al. Karta dokun: hangi anlarda bildirim geleceğini seç.
          </Text>
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
            action={{ label: "Takım bul", onPress: () => router.push("/(tabs)/takip") }}
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
  const toggleMute = useCallback(() => onChange(item, { muted: !item.muted }), [item, onChange]);

  return (
    <View style={[styles.card, expanded ? styles.cardOpen : null]}>
      <View style={styles.cardHead}>
        {/* Karta dokunmak olayları açar; zil ayrı bir hedeftir (iç içe
            düğme yok — ekran okuyucu iki ayrı eylem duyar). */}
        <Touchable
          feedback="row"
          haptic="selection"
          onPress={onToggleExpand}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${item.name}. ${summaryOf(item)}. Ayrıntılar`}
          style={styles.cardMain}
          testID={`follow-${item.type}-${item.id}`}
        >
          {item.type === "team" ? (
            <TeamLogo name={item.name} logo={item.logo} size={36} dimmed={item.muted} />
          ) : (
            <View style={styles.typeIcon}>
              <Ionicons name={icon} size={18} color={item.muted ? colors.textTertiary : colors.brandAccent} />
            </View>
          )}
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, item.muted ? styles.mutedText : null]} numberOfLines={1} {...textScale.dense}>
              {item.name}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1} {...textScale.dense}>
              {[item.subtitle, summaryOf(item)].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
        </Touchable>

        <Touchable
          feedback="icon"
          haptic="light"
          onPress={toggleMute}
          accessibilityRole="switch"
          accessibilityState={{ checked: !item.muted }}
          accessibilityLabel={item.muted ? `${item.name} bildirimlerini aç` : `${item.name} için sessize al`}
          hitSlop={touchSlop(36)}
          style={[styles.bell, item.muted ? styles.bellMuted : null]}
        >
          <Ionicons
            name={item.muted ? "notifications-off" : "notifications"}
            size={18}
            color={item.muted ? colors.textTertiary : colors.brandAccent}
          />
        </Touchable>
      </View>

      {expanded ? (
        <View style={styles.cardBody}>
          <FollowEventEditor item={item} eventInfo={eventInfo} onChange={onChange} />
        </View>
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
  section: { paddingTop: space.sm },
  sectionHeader: { paddingTop: space.lg, paddingHorizontal: 0 },
  dimmed: { opacity: 0.55 },
  cards: { gap: space.sm },

  /* Takip kartı */
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardOpen: {
    borderColor: colors.borderStrong,
    ...elevate(1),
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: space.md,
  },
  cardMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingLeft: space.md,
    paddingRight: space.sm,
    minHeight: layout.listRowHeightTwoLine,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { ...type.h3, color: colors.textPrimary },
  mutedText: { color: colors.textTertiary },
  cardSub: { ...type.bodySm, color: colors.textSecondary },
  bell: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
  },
  bellMuted: {
    backgroundColor: colors.surface2,
  },
  cardBody: {
    gap: space.md,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  hint: { ...type.caption, color: colors.textTertiary, lineHeight: 16, paddingHorizontal: space.xxs },
});
