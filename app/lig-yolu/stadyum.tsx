/**
 * STADYUMUNU KUR — /lig-yolu/stadyum
 *
 * Seviyelerde kazanılan yıldızlar burada harcanır: etkin bölgenin parçaları
 * sırayla yapılır, her parça sahnede (StadiumScene) belirir. Bölge bitince
 * 300 jeton ödül ve sıradaki bölge açılır (Saha → Tribünler → Işıklar ve
 * yayın → Kulüp tesisleri → Efsane stadyum).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAdminMutation } from "@/components/admin";
import { StadiumScene } from "@/components/puzzle/StadiumScene";
import { Button, ErrorState, ScreenHeader, SkeletonCard, useReduceMotion } from "@/components/ui";
import { buildStadium } from "@/lib/puzzle/api";
import { usePuzzleCache, usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

export default function StadiumScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const query = usePuzzleMe();
  const cache = usePuzzleCache();
  const stadium = query.data?.profile.stadium;
  const flash = useRef(new Animated.Value(0)).current;
  const [lastBuilt, setLastBuilt] = useState<string | null>(null);

  const build = useAdminMutation((id: string) => buildStadium(id), {
    success: (res) => (res.zone_done ? `Bölge tamamlandı! +${res.bonus_coins} jeton` : `${res.item.title} yapıldı!`),
    onSuccess: (res) => {
      cache(res.profile);
      setLastBuilt(res.item.title);
    },
  });

  useEffect(() => {
    if (!lastBuilt || reduce) return;
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 900, useNativeDriver: true }).start();
  }, [flash, lastBuilt, reduce]);

  if (!auth.user) return <Redirect href="/giris" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Stadyumunu kur"
        subtitle={stadium ? `${stadium.progress.built}/${stadium.progress.total} parça · ${stadium.available} yıldız harcanabilir` : undefined}
        back
      />
      <ScrollView contentContainerStyle={styles.content}>
        {query.isLoading ? (
          <SkeletonCard lines={6} />
        ) : query.isError || !stadium ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <View style={styles.sceneWrap}>
              <StadiumScene built={stadium.built} width={width - layout.screenPadding * 2 - 2} />
              <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flash }]} />
            </View>

            {stadium.zones.map((zone) => {
              const active = zone.key === stadium.activeZone;
              const locked = !zone.done && !active;
              const nextId = zone.items.find((i) => !i.built)?.id;
              return (
                <View key={zone.key} style={[styles.zone, active ? styles.zoneActive : null, locked ? styles.zoneLocked : null]}>
                  <View style={styles.zoneHead}>
                    <Ionicons name={zone.done ? "checkmark-circle" : locked ? "lock-closed" : "construct"} size={20} color={zone.done ? colors.win : locked ? colors.textTertiary : colors.brandAccent} />
                    <Text style={styles.zoneTitle} {...textScale.dense}>{zone.index + 1}. {zone.title}</Text>
                    <Text style={styles.zoneCount} {...textScale.badge}>
                      {zone.items.filter((i) => i.built).length}/{zone.items.length}
                    </Text>
                  </View>
                  {locked ? (
                    <Text style={styles.lockedText} {...textScale.dense}>Önceki bölgeyi bitirince açılır.</Text>
                  ) : (
                    zone.items.map((item) => {
                      const isNext = active && item.id === nextId;
                      const affordable = stadium.available >= item.cost;
                      return (
                        <View key={item.id} style={styles.item}>
                          <Ionicons name={item.built ? "checkmark-circle" : isNext ? "hammer" : "ellipse-outline"} size={18} color={item.built ? colors.win : isNext ? colors.brandAccent : colors.textTertiary} />
                          <Text style={[styles.itemTitle, item.built ? styles.itemDone : null]} {...textScale.dense}>{item.title}</Text>
                          {item.built ? null : isNext ? (
                            <Button
                              label={`${item.cost}`}
                              icon="star"
                              size="sm"
                              variant={affordable ? "primary" : "secondary"}
                              disabled={!affordable || build.isPending}
                              onPress={() => build.mutate(item.id)}
                              accessibilityLabel={`${item.title} yap, ${item.cost} yıldız`}
                              haptic="success"
                            />
                          ) : (
                            <View style={styles.cost}>
                              <Ionicons name="star" size={12} color={colors.textTertiary} />
                              <Text style={styles.costText} {...textScale.badge}>{item.cost}</Text>
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              );
            })}
            {stadium.activeZone && stadium.available < (stadium.zones.find((z) => z.key === stadium.activeZone)?.items.find((i) => !i.built)?.cost ?? 0) ? (
              <Button label="Yıldız topla — oyunlara dön" icon="game-controller" variant="secondary" onPress={() => router.push("/lig-yolu")} fullWidth />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant * 2, gap: space.md, paddingTop: space.sm },
  sceneWrap: { borderRadius: radius.xl, overflow: "hidden", borderWidth: hairline, borderColor: colors.inkTileBorder },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.star },
  zone: { borderRadius: radius.xl, padding: space.lg, gap: space.sm, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  zoneActive: { borderColor: colors.brandAccent },
  zoneLocked: { opacity: 0.6 },
  zoneHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  zoneTitle: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary, flex: 1 },
  zoneCount: { ...type.label, color: colors.textSecondary },
  lockedText: { ...type.bodySm, color: colors.textTertiary },
  item: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 },
  itemTitle: { ...type.body, color: colors.textPrimary, flex: 1 },
  itemDone: { color: colors.textTertiary },
  cost: { flexDirection: "row", alignItems: "center", gap: 2 },
  costText: { ...type.caption, color: colors.textTertiary },
});
