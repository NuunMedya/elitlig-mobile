/**
 * Lig Yolu pencereleri — Mağaza.
 *
 * Mağaza: can doldurma + oyunun güçlendirici paketleri (jetonla). Günlük
 * ödül artık tek sistemdir (yıldız + jeton + joker + seri):
 * components/city/DailyReward.tsx (DailyRewardSheet / DailyRewardEntry).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAdminMutation } from "@/components/admin";
import { BottomSheet, Button, Touchable } from "@/components/ui";
import { buyItem, livesFor, type PuzzleMe } from "@/lib/puzzle/api";
import { usePuzzleCache } from "@/lib/puzzle/usePuzzle";
import { CoinShopSheet } from "./CoinShop";
import { WatchAdForLife } from "./RewardedLife";
import type { PuzzleGameKey } from "@/lib/puzzle/types";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export function ShopSheet({
  visible,
  onClose,
  me,
  game,
  focus,
}: {
  visible: boolean;
  onClose: () => void;
  me: PuzzleMe | undefined;
  /** Yalnız bu oyunun güçlendiricileri (yoksa hepsi). */
  game?: PuzzleGameKey | null;
  /** "lives": can bölümü öne çıkar. */
  focus?: "lives" | null;
}) {
  const cache = usePuzzleCache();
  const [coinShop, setCoinShop] = useState(false);
  const buy = useAdminMutation((item: string) => buyItem(item, game), {
    success: (res) => (res.item === "can_doldur" ? (game ? "Bu oyunun canları doldu." : "Bütün oyunların canları doldu.") : "Güçlendirici alındı."),
    onSuccess: (res) => cache(res.profile),
  });
  if (!me) return null;
  // Oyun içindeyken canlar o oyunun; Lig Yolu ana sayfasında "can doldur" bütün oyunları doldurur.
  const profile = livesFor(me.profile, game);
  const allFull = !game && profile.lives_by_game ? Object.values(profile.lives_by_game).every((g) => g && g.lives >= profile.max_lives) : null;
  // Merkezden can doldurma oyun başına ücretlidir: canı eksik her oyun için bir fiyat.
  const missingGames = !game && profile.lives_by_game ? Object.values(profile.lives_by_game).filter((g) => g && g.lives < profile.max_lives).length : 1;
  const coins = me.profile.coins;
  const entries = Object.entries(me.catalog.shop).filter(([key, item]) => {
    if (item.lives) return true;
    if (!item.booster) return false;
    return !game || me.catalog.boosters[item.booster]?.game === game;
  });
  const lives = entries.filter(([, item]) => item.lives);
  const packs = entries.filter(([, item]) => item.booster);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Mağaza" snap="half">
      <View style={styles.balance}>
        <Ionicons name="disc" size={20} color={colors.yellowCard} />
        <Text style={styles.balanceText} {...textScale.dense}>
          {coins.toLocaleString("tr-TR")} jeton
        </Text>
      </View>
      {game && profile.ad_lives && profile.lives < profile.max_lives ? (
        <View style={styles.adRow}>
          <WatchAdForLife profile={profile} />
        </View>
      ) : null}
      {[...(focus === "lives" ? lives : []), ...(focus === "lives" ? packs : [...lives, ...packs])].map(([key, item]) => {
        const stock = item.booster ? me.profile.boosters[item.booster] ?? 0 : null;
        const full = Boolean(item.lives && (allFull ?? profile.lives >= profile.max_lives));
        const price = item.lives ? item.price * Math.max(1, missingGames) : item.price;
        return (
          <View key={key} style={styles.row}>
            <View style={[styles.icon, item.lives ? styles.iconLive : null]}>
              <Ionicons name={item.lives ? "heart" : "flash"} size={18} color={item.lives ? colors.live : colors.brandAccent} />
            </View>
            <View style={styles.texts}>
              <Text style={styles.title} {...textScale.dense}>{item.title}</Text>
              <Text style={styles.sub} {...textScale.dense}>
                {item.lives
                  ? full
                    ? "Canların dolu"
                    : game
                      ? `Bu oyunda ${profile.lives}/${profile.max_lives} can`
                      : `Canı eksik ${missingGames} oyunu doldurur (oyun başına ${item.price})`
                  : `Elinde ${stock}`}
              </Text>
            </View>
            <Button
              label={`${price}`}
              icon="disc"
              size="sm"
              variant={coins >= price && !full ? "primary" : "secondary"}
              disabled={coins < price || full || buy.isPending}
              onPress={() => buy.mutate(key)}
              accessibilityLabel={`${item.title}, ${price} jeton`}
            />
          </View>
        );
      })}
      <Text style={styles.foot} {...textScale.long}>
        Jeton, seviye geçerek ve günlük ödülle kazanılır. Canın bitince reklam izleyip can da alabilirsin.
      </Text>
      {me.profile.coin_shop ? (
        <Button label="Jeton mağazası: yıldız takası, kulüp renkleri" icon="storefront-outline" variant="secondary" size="sm" onPress={() => setCoinShop(true)} />
      ) : null}
      <CoinShopSheet visible={coinShop} onClose={() => setCoinShop(false)} />
    </BottomSheet>
  );
}

/** Stok rozeti ile dokunulabilir güçlendirici düğmesi (oyunlar da kullanabilir). */
export function BoosterChip({
  icon,
  title,
  count,
  selected,
  onPress,
}: {
  icon: string;
  title: string;
  count: number;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable onPress={onPress} haptic="selection" style={[styles.chip, selected ? styles.chipOn : null]} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${title}, ${count} adet`}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={22} color={selected ? colors.textOnBrand : colors.brandAccent} />
      <View style={[styles.chipCount, count ? null : styles.chipCountZero]}>
        <Text style={styles.chipCountText} {...textScale.badge}>{count ? count : "+"}</Text>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  adRow: { marginBottom: space.sm },
  balance: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md },
  balanceText: { ...type.h3, color: colors.textPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  iconLive: { backgroundColor: colors.liveDim },
  texts: { flex: 1, gap: 2 },
  title: { ...type.body, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textSecondary },
  foot: { ...type.caption, color: colors.textTertiary, marginTop: space.md },
  chip: { width: 52, height: 52, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipCount: { position: "absolute", right: -4, top: -4, minWidth: 20, height: 20, borderRadius: radius.pill, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  chipCountZero: { backgroundColor: colors.win },
  chipCountText: { ...type.micro, color: colors.textOnBrand },
});
