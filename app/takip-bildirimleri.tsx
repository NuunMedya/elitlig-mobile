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
  Badge,
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
  TeamLogo,
  Toggle,
  Touchable,
  refreshControlProps,
  type IconTileTone,
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
import { SignatureStripe, StageCard } from "@/components/league/kit";
import { colors, elevate, hairline, layout, radius, space, textScale, touchSlop, type, upperTR } from "@/theme";

/** Bölüm sırası ve başlıkları. */
const SECTIONS: { type: FollowType; title: string; icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }[] = [
  { type: "team", title: "Takımlar", icon: "shield", tone: "violet" },
  { type: "league", title: "Ligler", icon: "trophy", tone: "gold" },
  { type: "season", title: "Sezonlar", icon: "calendar", tone: "cyan" },
  { type: "city", title: "İller", icon: "location", tone: "mint" },
  { type: "match", title: "Maçlar", icon: "football", tone: "pink" },
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
  const activeCount = data?.follows.filter((item) => !item.muted).length ?? 0;
  const ratio = followCount ? activeCount / followCount : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {header}

      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
      >
        {query.error && data ? <ErrorState error={query.error} onRetry={query.refetch} variant="banner" /> : null}

        {/* 1) ÖZET SAHNESİ — kaç takip ses veriyor + ana anahtar. */}
        <Reveal>
          <StageCard style={styles.hero}>
            <Text style={styles.heroOver} {...textScale.badge}>
              {upperTR("Takip ettiklerinden")}
            </Text>
            <View style={styles.heroCount}>
              {query.isLoading ? (
                <Skeleton width={96} height={34} radius="sm" />
              ) : (
                <>
                  <Odometer value={activeCount} style={styles.heroValue} />
                  <Text style={styles.heroTotal} {...textScale.badge}>
                    /{followCount}
                  </Text>
                  <Text style={styles.heroUnit} {...textScale.dense}>
                    takip bildirim gönderiyor
                  </Text>
                </>
              )}
            </View>
            <GradientBar value={enabled ? ratio : 0} height={6} track={colors.inkTile} />

            <View style={styles.master}>
              <IconTile
                icon={enabled ? "notifications" : "notifications-off"}
                tone={enabled ? "signature" : "neutral"}
                size={36}
                glow={enabled}
              />
              <View style={styles.masterText}>
                <Text style={styles.masterTitle} {...textScale.dense}>
                  {enabled ? "Bildirimler açık" : "Bildirimler kapalı"}
                </Text>
                <Text style={styles.masterSub} numberOfLines={2} {...textScale.dense}>
                  {enabled ? "Aşağıdaki ayarlara göre gelir" : "Hiçbir takipten bildirim gelmez"}
                </Text>
              </View>
              <Toggle
                value={enabled}
                onValueChange={(value) => master.mutate(value)}
                disabled={!data}
                accessibilityLabel="Takip bildirimleri"
                testID="follow-master"
              />
            </View>
          </StageCard>
        </Reveal>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <Ionicons name="notifications" size={12} color={colors.brandAccent} />
            <Text style={styles.hint} {...textScale.dense}>
              Zil: sessize al
            </Text>
          </View>
          <View style={styles.legendItem}>
            <Ionicons name="options-outline" size={12} color={colors.textTertiary} />
            <Text style={styles.hint} {...textScale.dense}>
              Satır: hangi anlarda
            </Text>
          </View>
        </View>

        {query.isLoading ? (
          <View style={styles.groupCard}>
            <SkeletonListRow count={5} avatar />
          </View>
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
          SECTIONS.map((section, sectionIndex) => {
            const items = grouped.get(section.type);
            if (!items?.length) return null;
            const live = items.filter((item) => !item.muted).length;
            return (
              <Reveal key={section.type} index={sectionIndex + 1} style={!enabled ? styles.dimmed : undefined}>
                <SectionHeader
                  title={section.title}
                  meta={`${live}/${items.length} açık`}
                  icon={section.icon}
                  iconTone={section.tone}
                  inset="flush"
                  style={styles.sectionHeader}
                />
                <View style={styles.groupCard}>
                  {items.map((item, index) => (
                    <FollowCard
                      key={followKey(item)}
                      item={item}
                      icon={section.icon}
                      tone={section.tone}
                      last={index === items.length - 1}
                      expanded={expanded === followKey(item)}
                      onToggleExpand={() =>
                        setExpanded((current) => (current === followKey(item) ? null : followKey(item)))
                      }
                      eventInfo={eventInfo}
                      onChange={changeFollow}
                    />
                  ))}
                </View>
              </Reveal>
            );
          })
        )}

        {/* ───────────── İl takibi ───────────── */}
        <View>
          <SectionHeader
            title="İl takip et"
            meta={cities.length ? `${cities.length} il` : undefined}
            icon="location"
            iconTone="cyan"
            collapsible
            collapsed={!showCities}
            onToggle={() => setShowCities((value) => !value)}
            inset="flush"
            style={styles.sectionHeader}
          />
          {showCities ? (
            cities.length ? (
              <View style={styles.cityGrid}>
                {cities.map((city) => {
                  const on = isFavoriteCity(city.id);
                  return (
                    <Touchable
                      key={city.id}
                      feedback="chip"
                      haptic="selection"
                      disabled={pendingCity === city.id}
                      onPress={() => void toggleCity(city.id, city.label)}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: on, disabled: pendingCity === city.id }}
                      accessibilityLabel={city.label}
                      style={[styles.cityChip, on ? styles.cityChipOn : null]}
                      testID={`follow-city-${city.id}`}
                    >
                      <Ionicons
                        name={on ? "checkmark-circle" : "add-circle-outline"}
                        size={16}
                        color={on ? colors.brandAccent : colors.textTertiary}
                      />
                      <Text style={[styles.cityLabel, on ? styles.cityLabelOn : null]} numberOfLines={1} {...textScale.dense}>
                        {city.label}
                      </Text>
                    </Touchable>
                  );
                })}
              </View>
            ) : (
              <SkeletonListRow count={4} avatar={false} />
            )
          ) : (
            <Text style={styles.cityHint} {...textScale.long}>
              Bir ili takip edersen o ildeki maç sonuçlarını ve haberleri alırsın; gol, kart gibi
              ayrıntıları ilin ayarından açabilirsin.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════ TAKİP SATIRI ═══════════════════════════ */

/**
 * Takip satırı — grup kartının içinde. Sol: arma ya da türün ikon kutusu;
 * orta: ad + alt satırda olay noktaları (açık olay dolu, kapalı boş) ve
 * özet; sağ: zil. Açılınca satırın altında olay karoları belirir ve satır
 * imza şeridiyle işaretlenir.
 */
const FollowCard = memo(function FollowCard({
  item,
  icon,
  tone,
  last,
  expanded,
  onToggleExpand,
  eventInfo,
  onChange,
}: {
  item: FollowItem;
  icon: keyof typeof Ionicons.glyphMap;
  tone: IconTileTone;
  last: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  eventInfo: Map<string, FollowEventInfo>;
  onChange: (item: FollowItem, patch: FollowSettingsPatch) => void;
}) {
  const toggleMute = useCallback(() => onChange(item, { muted: !item.muted }), [item, onChange]);
  const onCount = item.events.filter((event) => item.prefs[event]).length;

  return (
    <View style={[styles.row, !last ? styles.rowDivider : null, expanded ? styles.rowOpen : null]}>
      {expanded ? <SignatureStripe /> : null}
      <View style={styles.cardHead}>
        {/* Satıra dokunmak olayları açar; zil ayrı bir hedeftir (iç içe
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
            <TeamLogo name={item.name} logo={item.logo} size={38} dimmed={item.muted} />
          ) : (
            <IconTile icon={icon} tone={item.muted ? "neutral" : tone} size={38} glow={false} />
          )}
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, item.muted ? styles.mutedText : null]} numberOfLines={1} {...textScale.dense}>
              {item.name}
            </Text>
            <View style={styles.dotsRow}>
              {item.muted ? (
                <Badge label="Sessizde" tone="neutral" size="xs" icon="notifications-off" />
              ) : (
                <>
                  <View style={styles.dots}>
                    {item.events.map((event) => (
                      <View key={event} style={[styles.dot, item.prefs[event] ? styles.dotOn : null]} />
                    ))}
                  </View>
                  <Text style={styles.cardSub} numberOfLines={1} {...textScale.dense}>
                    {[item.subtitle, `${onCount}/${item.events.length} tür`].filter(Boolean).join(" · ")}
                  </Text>
                </>
              )}
            </View>
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
    paddingTop: space.sm,
    paddingBottom: space.giant,
    gap: space.sm,
    flexGrow: 1,
  },

  /* Sahne */
  hero: { padding: space.lg, gap: space.sm },
  heroOver: { ...type.overline, color: colors.brandOnDark },
  heroCount: { flexDirection: "row", alignItems: "flex-end", gap: space.xs, minHeight: 34 },
  heroValue: { ...type.scoreLg, color: colors.onDark },
  heroTotal: { ...type.scoreSm, color: colors.onDarkMuted, marginBottom: 3 },
  heroUnit: { ...type.bodySm, color: colors.onDarkMuted, marginBottom: 5, marginLeft: space.xs, flexShrink: 1 },
  master: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.sm,
    padding: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  masterText: { flex: 1, minWidth: 0, gap: space.px },
  masterTitle: { ...type.h4, color: colors.onDark },
  masterSub: { ...type.caption, color: colors.onDarkMuted },

  legend: { flexDirection: "row", gap: space.lg, paddingHorizontal: space.xxs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  hint: { ...type.caption, color: colors.textTertiary },

  sectionHeader: { marginTop: space.lg, marginBottom: space.sm },
  dimmed: { opacity: 0.55 },

  /* Grup kartı ve satır */
  groupCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevate(1),
  },
  row: { overflow: "hidden" },
  rowDivider: { borderBottomWidth: hairline, borderBottomColor: colors.separator },
  rowOpen: { backgroundColor: colors.brandDim },
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
    paddingVertical: space.m,
    paddingLeft: space.md,
    paddingRight: space.sm,
    minHeight: 64,
  },
  cardText: { flex: 1, minWidth: 0, gap: space.xs },
  cardTitle: { ...type.h3, color: colors.textPrimary },
  mutedText: { color: colors.textTertiary },
  dotsRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dots: { flexDirection: "row", gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.surface3 },
  dotOn: { backgroundColor: colors.accent },
  cardSub: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  bell: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  bellMuted: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
  },
  cardBody: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    paddingTop: space.xs,
  },

  /* İller */
  cityGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.m,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  cityChipOn: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  cityLabel: { ...type.labelSm, color: colors.textSecondary },
  cityLabelOn: { color: colors.brandAccent },
  cityHint: { ...type.bodySm, color: colors.textTertiary, paddingHorizontal: space.xxs },
});
