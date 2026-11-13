/**
 * JETON MAĞAZASI (Şehir 2.1) — Lig Yolu'nda kazanılan jetonun harcama yerleri:
 *   · Yıldız takası: 1.000 jeton → 10 Kulüp Şehri yıldızı (haftada sınırlı)
 *   · Özel kulüp renkleri: şehirde formalar, çatılar, bayraklar (kozmetik)
 *   · Seri koruyucu jetonla: Günlük ödül penceresinde (kaçırılan gün varken)
 * Kurallar ve fiyatlar sunucuda (profile.coin_shop); eski sunucuda pencere boş kalır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";

import { useAdminMutation } from "@/components/admin";
import { BottomSheet, Button } from "@/components/ui";
import { buyClubKit, cityKeys, tradeCoinsForStars } from "@/lib/puzzle/api";
import { city2Keys } from "@/lib/puzzle/city2";
import { PREMIUM_KITS } from "@/lib/puzzle/cityPalette";
import { usePuzzleCache, usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

const fmt = (n: number) => n.toLocaleString("tr-TR");

export function CoinShopSheet({ visible, onClose, onKitBought }: { visible: boolean; onClose: () => void; onKitBought?: (key: string) => void }) {
  const me = usePuzzleMe().data;
  const cache = usePuzzleCache();
  const queryClient = useQueryClient();
  const trade = useAdminMutation(() => tradeCoinsForStars(), {
    success: (res) => `+${res.stars} şehir yıldızı`,
    onSuccess: (res) => {
      cache(res.profile);
      void queryClient.invalidateQueries({ queryKey: city2Keys.me() });
      void queryClient.invalidateQueries({ queryKey: cityKeys.me() });
    },
  });
  const kit = useAdminMutation((key: string) => buyClubKit(key), {
    success: "Yeni kulüp rengi açıldı",
    onSuccess: (res) => {
      cache(res.profile);
      onKitBought?.(res.kit);
    },
  });
  const shop = me?.profile.coin_shop;
  const coins = me?.profile.coins ?? 0;
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Jeton mağazası" snap="full">
      <View style={styles.body}>
        <View style={styles.balance}>
          <Ionicons name="disc" size={22} color={colors.yellowCard} />
          <Text style={styles.balanceText} {...textScale.dense}>
            {fmt(coins)} jeton
          </Text>
        </View>
        {!shop ? (
          <Text style={styles.lead} {...textScale.long}>
            Jeton mağazası bu sunucuda henüz açık değil.
          </Text>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.head}>
                <Ionicons name="star" size={20} color={colors.yellowCard} />
                <Text style={styles.title} {...textScale.dense}>
                  Yıldız takası
                </Text>
                <Text style={styles.meta} {...textScale.badge}>
                  Bu hafta {shop.trade.used}/{shop.trade.per_week}
                </Text>
              </View>
              <Text style={styles.lead} {...textScale.long}>
                {fmt(shop.trade.coins)} jetonu {shop.trade.stars} Kulüp Şehri yıldızına çevir. Haftada en çok {shop.trade.per_week} kez; Pazartesi yenilenir.
              </Text>
              <Button
                label={shop.trade.left < 1 ? "Bu haftanın hakkı bitti" : coins < shop.trade.coins ? `${fmt(shop.trade.coins - coins)} jeton eksik` : `${fmt(shop.trade.coins)} jeton → ${shop.trade.stars} yıldız`}
                icon="swap-horizontal"
                variant={shop.trade.left > 0 && coins >= shop.trade.coins ? "primary" : "secondary"}
                disabled={shop.trade.left < 1 || coins < shop.trade.coins || trade.isPending}
                loading={trade.isPending}
                onPress={() => trade.mutate(undefined)}
              />
            </View>

            <View style={styles.card}>
              <View style={styles.head}>
                <Ionicons name="color-palette" size={20} color={colors.brandAccent} />
                <Text style={styles.title} {...textScale.dense}>
                  Özel kulüp renkleri
                </Text>
              </View>
              <Text style={styles.lead} {...textScale.long}>
                Şehrindeki formalar, çatılar, bayraklar ve tabelalar bu renklerle boyanır. Bir kez alınır, hep senin.
              </Text>
              {shop.kits.map((k) => {
                const look = PREMIUM_KITS.find((p) => p.key === k.key);
                return (
                  <View key={k.key} style={styles.kitRow}>
                    <View style={styles.swatch}>
                      <View style={[styles.half, { backgroundColor: look?.primary ?? colors.surface3 }]} />
                      <View style={[styles.half, { backgroundColor: look?.secondary ?? colors.surface2 }]} />
                    </View>
                    <Text style={styles.kitName} numberOfLines={1} {...textScale.dense}>
                      {k.title}
                    </Text>
                    {k.owned ? (
                      <Text style={styles.owned} {...textScale.badge}>
                        SENDE
                      </Text>
                    ) : (
                      <Button
                        label={fmt(k.price)}
                        icon="disc"
                        size="sm"
                        variant={coins >= k.price ? "primary" : "secondary"}
                        disabled={coins < k.price || kit.isPending}
                        onPress={() => kit.mutate(k.key)}
                        accessibilityLabel={`${k.title} rengini al, ${k.price} jeton`}
                      />
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.card}>
              <View style={styles.head}>
                <Ionicons name="shield-checkmark" size={20} color={colors.warn} />
                <Text style={styles.title} {...textScale.dense}>
                  Seri koruyucu
                </Text>
              </View>
              <Text style={styles.lead} {...textScale.long}>
                Günlük girişi bir gün kaçırırsan serini reklam izleyerek ya da {fmt(shop.saver_coins)} jetonla kurtarabilirsin (haftada 1). Günlük ödül penceresinde çıkar.
              </Text>
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingBottom: space.lg },
  balance: { flexDirection: "row", alignItems: "center", gap: space.sm },
  balanceText: { ...type.h2, color: colors.textPrimary },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { ...type.h3, color: colors.textPrimary, flex: 1 },
  meta: { ...type.numSmStrong, color: colors.textSecondary },
  lead: { ...type.bodySm, color: colors.textSecondary },
  kitRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 },
  swatch: { width: 30, height: 30, borderRadius: radius.pill, overflow: "hidden", flexDirection: "row", borderWidth: hairline, borderColor: colors.border },
  half: { flex: 1 },
  kitName: { ...type.bodySm, fontFamily: fonts.semibold, color: colors.textPrimary, flex: 1 },
  owned: { ...type.micro, fontFamily: fonts.bold, color: colors.win },
});
