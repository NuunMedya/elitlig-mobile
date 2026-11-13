/**
 * ŞEHİR ZİYARETİ — /kulup-sehri-ziyaret-sehir?id=…&ids=… (Kulüp Şehri 2.0 · Faz 5)
 *
 * Başka bir üyenin şehri, SALT OKUNUR (GET /api/puzzle/city2/visit/:userId):
 *   · Üstte sahne (games/sehir.js, `type:"city2"`): onun binaları, yerleşik
 *     sembol yapıları ve ızgarası. Dokunuşlar yok sayılır, yerleştirme yok.
 *   · Ad, il, takım, arma (sezon çerçevesi + prestij yıldızları), basamak,
 *     güzellik, gelişim, alkış; rozetler; bina aşamaları.
 *   · Alkış (günde şehir başına 1, günlük tavanlı) → +yıldız (ikisine de).
 *   · Listenin sırasıyla önceki / sonraki şehir.
 * Ziyarete kapalı (403) ya da bulunamayan (404) şehirde dostça bir açıklama.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CrestBadge, PrestigeStars, TierMedal } from "@/components/city2/Season";
import { BuildingIcon, SectionTitle, cardStyle, fmt } from "@/components/city2/shared";
import { RungBadge } from "@/components/city2/StepCard";
import { WebGame, type WebGameHandle } from "@/components/game/WebGame";
import { Button, EmptyState, ErrorState, ScreenHeader, SkeletonCard, Touchable, refreshControlProps, useRefresh } from "@/components/ui";
import { CITY_SKY, CLUB_KITS } from "@/lib/puzzle/cityPalette";
import { useCity2Applause, useCity2Visit } from "@/lib/puzzle/useCity2";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

const BLOCKED_TEXT: Record<string, string> = {
  ALREADY_APPLAUDED: "Bugün bu şehri alkışladın",
  DAILY_APPLAUSE_CAP: "Bugünlük alkış hakkın doldu",
  SELF_APPLAUSE: "Kendi şehrini alkışlayamazsın",
  NOT_ALLOWED: "Şu an alkışlayamazsın",
};

export default function VisitCityScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; ids?: string }>();
  const ids = useMemo(() => String(params.ids ?? "").split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0), [params.ids]);
  const [id, setId] = useState<number | null>(() => (params.id ? Number(params.id) : null));
  useEffect(() => {
    if (params.id) setId(Number(params.id));
  }, [params.id]);
  const { query, view, closed, missing } = useCity2Visit(id);
  const applaud = useCity2Applause();
  const { height } = useWindowDimensions();
  const scene = useRef<WebGameHandle>(null);
  const scroll = useRef<ScrollView>(null);
  const [ready, setReady] = useState(false);
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const city = view?.city ?? null;
  const message = useMemo(() => {
    if (!city) return null;
    const kit = CLUB_KITS[0];
    return {
      type: "city2" as const,
      buildings: Object.fromEntries(city.buildings.map((b) => [b.key, b.stage])),
      rung: city.ladder.rung,
      kit: { primary: kit.primary, secondary: kit.secondary },
      marks: {},
      landmarks: city.landmarks.map((l) => ({ id: l.id, key: l.key, slot: l.slot, tier: l.tier })),
      grid: city.grid,
      place: null,
      focus: null,
    };
  }, [city]);
  useEffect(() => {
    if (ready && message) scene.current?.send(message);
  }, [ready, message]);

  if (!auth.user) return <Redirect href="/giris" />;

  const at = id != null ? ids.indexOf(id) : -1;
  const prev = at > 0 ? ids[at - 1] : null;
  const next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : null;
  const go = (to: number | null) => {
    if (to == null) return;
    setId(to);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const sceneHeight = Math.max(240, Math.min(400, height * 0.4));
  const ap = view?.applause ?? null;
  const built = city?.buildings.filter((b) => b.stage > 0) ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScreenHeader title={city ? city.name : "Şehir ziyareti"} subtitle={city ? [city.city, city.team_name].filter(Boolean).join(" · ") || "Ziyaret" : "Ziyaret"} back />
      <ScrollView ref={scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}>
        {closed || missing ? (
          <EmptyState
            icon={closed ? "eye-off-outline" : "help-circle-outline"}
            title={closed ? "Bu şehir ziyarete kapalı" : "Şehir bulunamadı"}
            body={closed ? "Şehrin sahibi şehrini ziyarete kapatmış. Başka bir şehri gezebilirsin." : "Bu şehir artık görüntülenemiyor. Başka bir şehri gezebilirsin."}
            variant="inline"
            action={next != null ? { label: "Sonraki şehir", onPress: () => go(next), haptic: "light" } : { label: "Listeye dön", onPress: () => router.back(), haptic: "light" }}
          />
        ) : query.isLoading ? (
          <SkeletonCard lines={6} />
        ) : query.isError || !city || !ap ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <View style={[styles.scene, { height: sceneHeight }]}>
              <WebGame ref={scene} game="sehir" background={CITY_SKY} accessibilityLabel={`${city.name} adlı üyenin şehri`} onReady={() => setReady(true)} onEvent={() => undefined} />
              <View style={styles.sceneBadges} pointerEvents="none">
                <View style={styles.sceneBadge}>
                  <Ionicons name="eye-outline" size={13} color={colors.onDark} />
                  <Text style={styles.sceneBadgeText} {...textScale.badge}>
                    Ziyaret
                  </Text>
                </View>
                <View style={styles.sceneBadge}>
                  <Ionicons name="sparkles" size={13} color={colors.onDark} />
                  <Text style={styles.sceneBadgeText} {...textScale.badge}>
                    {fmt(city.beauty)}
                  </Text>
                </View>
              </View>
              <Touchable onPress={() => scene.current?.send({ type: "focus", key: null })} style={styles.sceneHome} accessibilityRole="button" accessibilityLabel="Bütün şehri göster">
                <Ionicons name="scan-outline" size={18} color={colors.onDark} />
              </Touchable>
            </View>

            <View style={styles.card}>
              <View style={styles.head}>
                <CrestBadge crest={city.crest} size={48} />
                <View style={styles.flex}>
                  <View style={styles.nameLine}>
                    <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                      {city.name}
                    </Text>
                    {city.prestige.level > 0 ? <PrestigeStars count={city.prestige.level} size={12} /> : null}
                  </View>
                  <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                    {[city.city, city.team_name].filter(Boolean).join(" · ") || "Kulüp Şehri"}
                  </Text>
                </View>
              </View>
              <View style={styles.rung}>
                <RungBadge label={city.ladder.label} size={34} />
                <View style={styles.flex}>
                  <Text style={styles.rungTitle} numberOfLines={1} {...textScale.dense}>
                    {city.ladder.title}
                  </Text>
                  <Text style={styles.meta} {...textScale.dense}>
                    {city.ladder.no}. basamak{city.prestige.level > 0 ? ` · ${city.prestige.level}. prestij` : ""}
                  </Text>
                </View>
              </View>
              <View style={styles.stats}>
                <Stat icon="sparkles" value={fmt(city.beauty)} label="güzellik" />
                <View style={styles.rule} />
                <Stat icon="trending-up" value={fmt(city.dev)} label="gelişim" />
                <View style={styles.rule} />
                <Stat icon="hand-left" value={fmt(city.applause.total)} label="alkış" />
              </View>
            </View>

            {city.mine ? (
              <View style={styles.mine}>
                <Ionicons name="person-circle-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.mineText} {...textScale.dense}>
                  Bu senin şehrin; başkaları onu böyle görür.
                </Text>
              </View>
            ) : (
              <View style={styles.applause}>
                <Button
                  label={city.applauded_today ? "Bugün alkışladın" : ap.can ? `Alkışla · +${ap.rewards.visitor} yıldız` : BLOCKED_TEXT[ap.blocked ?? ""] ?? "Şu an alkışlanamıyor"}
                  icon={city.applauded_today ? "checkmark-circle" : "hand-left"}
                  onPress={() => applaud.mutate(city.user_id)}
                  disabled={!ap.can || city.applauded_today}
                  loading={applaud.isPending}
                  fullWidth
                  haptic="success"
                />
                <Text style={styles.applauseMeta} {...textScale.dense}>
                  {`Bugün ${fmt(ap.left_today)} alkış hakkın kaldı · şehrin sahibi alkış başına ${fmt(ap.rewards.target)} yıldız alır`}
                </Text>
              </View>
            )}

            {city.crest.badges.length ? (
              <>
                <SectionTitle title="Rozetler" meta={`${city.crest.badges.length} sezon`} />
                <View style={styles.badges}>
                  {city.crest.badges.map((b) => (
                    <View key={b.key} style={styles.badge}>
                      <TierMedal tier={b.tier} size={30} icon="ribbon" />
                      <Text style={styles.badgeText} numberOfLines={2} {...textScale.dense}>
                        {b.title}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {built.length ? (
              <>
                <SectionTitle title="Binalar" meta={`${built.length} bina · ${city.landmarks.length} sembol yapı`} />
                <View style={styles.buildings}>
                  {built.map((b) => (
                    <View key={b.key} style={styles.building}>
                      <BuildingIcon buildingKey={b.key} icon={b.icon} size={36} stage={b.stage} />
                      <View style={styles.flex}>
                        <Text style={styles.buildingTitle} numberOfLines={1} {...textScale.dense}>
                          {b.title}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                          {b.current?.title ?? `${b.stage}. aşama`}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      {ids.length > 1 ? (
        <View style={styles.pager}>
          <Button label="Önceki" icon="chevron-back" variant="secondary" size="sm" onPress={() => go(prev)} disabled={prev == null} style={styles.flex} />
          <Text style={styles.pagerText} {...textScale.badge}>
            {at >= 0 ? `${at + 1}/${ids.length}` : ""}
          </Text>
          <Button label="Sonraki" icon="chevron-forward" iconPosition="right" variant="secondary" size="sm" onPress={() => go(next)} disabled={next == null} style={styles.flex} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statLine}>
        <Ionicons name={icon} size={13} color={colors.brandAccent} />
        <Text style={styles.statValue} {...textScale.dense}>
          {value}
        </Text>
      </View>
      <Text style={styles.statLabel} {...textScale.dense}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs, paddingBottom: space.giant, gap: space.md },
  flex: { flex: 1 },
  scene: { borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.inkBlock, borderWidth: hairline, borderColor: colors.inkTileBorder },
  sceneBadges: { position: "absolute", top: space.sm, left: space.sm, flexDirection: "row", gap: space.xs },
  sceneBadge: { flexDirection: "row", alignItems: "center", gap: space.xxs, backgroundColor: colors.overlay, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill },
  sceneBadgeText: { ...type.label, fontFamily: fonts.bold, color: colors.onDark },
  sceneHome: { position: "absolute", top: space.sm, right: space.sm, width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.overlay },
  card: { ...cardStyle, padding: space.md, gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  nameLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  name: { ...type.h2, color: colors.textPrimary, flexShrink: 1 },
  meta: { ...type.caption, color: colors.textTertiary },
  rung: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  rungTitle: { ...type.h4, color: colors.textPrimary },
  stats: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statLine: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  statValue: { ...type.metricSm, color: colors.textPrimary },
  statLabel: { ...type.caption, color: colors.textTertiary },
  rule: { width: hairline, alignSelf: "stretch", backgroundColor: colors.border },
  applause: { gap: space.xs },
  applauseMeta: { ...type.caption, color: colors.textTertiary, textAlign: "center" },
  mine: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  mineText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  badges: { ...cardStyle, padding: space.md, gap: space.sm },
  badge: { flexDirection: "row", alignItems: "center", gap: space.md },
  badgeText: { ...type.labelSm, color: colors.textPrimary, flex: 1 },
  buildings: { ...cardStyle, padding: space.md, gap: space.md },
  building: { flexDirection: "row", alignItems: "center", gap: space.md },
  buildingTitle: { ...type.labelSm, color: colors.textPrimary },
  pager: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: layout.screenPadding, paddingTop: space.sm, paddingBottom: space.sm, borderTopWidth: hairline, borderTopColor: colors.border, backgroundColor: colors.surface1 },
  pagerText: { ...type.numSmStrong, color: colors.textSecondary, minWidth: 40, textAlign: "center" },
});
