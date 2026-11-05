/**
 * Lig Yolu pencereleri — Mağaza ve Günlük ödül.
 *
 * Mağaza: can doldurma + oyunun güçlendirici paketleri (jetonla). Günlük
 * ödül: 7 günlük seri; bugünün kutusu vurgulu, alınınca jeton uçuşu yerine
 * sade bir toast (çerçeve sonlu animasyon kuralına uyar).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAdminMutation } from "@/components/admin";
import { BottomSheet, Button, Touchable } from "@/components/ui";
import { buyItem, claimDaily, type PuzzleMe } from "@/lib/puzzle/api";
import { usePuzzleCache } from "@/lib/puzzle/usePuzzle";
import type { PuzzleGameKey } from "@/lib/puzzle/types";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

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
  const buy = useAdminMutation((item: string) => buyItem(item), {
    success: (res) => (res.item === "can_doldur" ? "Canların doldu." : "Güçlendirici alındı."),
    onSuccess: (res) => cache(res.profile),
  });
  if (!me) return null;
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
      {[...(focus === "lives" ? lives : []), ...(focus === "lives" ? packs : [...lives, ...packs])].map(([key, item]) => {
        const stock = item.booster ? me.profile.boosters[item.booster] ?? 0 : null;
        const full = Boolean(item.lives && me.profile.lives >= me.profile.max_lives);
        return (
          <View key={key} style={styles.row}>
            <View style={[styles.icon, item.lives ? styles.iconLive : null]}>
              <Ionicons name={item.lives ? "heart" : "flash"} size={18} color={item.lives ? colors.live : colors.brandAccent} />
            </View>
            <View style={styles.texts}>
              <Text style={styles.title} {...textScale.dense}>{item.title}</Text>
              <Text style={styles.sub} {...textScale.dense}>
                {item.lives ? (full ? "Canların dolu" : `${me.profile.lives}/${me.profile.max_lives} can`) : `Elinde ${stock}`}
              </Text>
            </View>
            <Button
              label={`${item.price}`}
              icon="disc"
              size="sm"
              variant={coins >= item.price && !full ? "primary" : "secondary"}
              disabled={coins < item.price || full || buy.isPending}
              onPress={() => buy.mutate(key)}
              accessibilityLabel={`${item.title}, ${item.price} jeton`}
            />
          </View>
        );
      })}
      <Text style={styles.foot} {...textScale.long}>
        Jeton, seviye geçerek, günlük ödülle ve stadyum bölgelerini tamamlayarak kazanılır.
      </Text>
    </BottomSheet>
  );
}

export function DailySheet({ visible, onClose, me }: { visible: boolean; onClose: () => void; me: PuzzleMe | undefined }) {
  const cache = usePuzzleCache();
  const claim = useAdminMutation(() => claimDaily(), {
    success: (res) => `${res.reward.coins} jeton kazandın${res.reward.boosters ? " + güçlendirici" : ""}!`,
    onSuccess: (res) => {
      cache(res.profile);
      onClose();
    },
  });
  if (!me) return null;
  const daily = me.profile.daily;
  const current = daily.available ? daily.next_streak : daily.streak;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Günlük ödül"
      footer={
        <Button
          label={daily.available ? "Ödülü al" : "Yarın yine gel"}
          onPress={() => claim.mutate(undefined)}
          disabled={!daily.available}
          loading={claim.isPending}
          fullWidth
          haptic="success"
        />
      }
    >
      <Text style={styles.sub} {...textScale.long}>
        Her gün gir, seri büyüsün. 7. günün ödülü güçlendirici paketi. Bir gün kaçırırsan seri baştan başlar.
      </Text>
      <View style={styles.days}>
        {daily.rewards.map((reward, index) => {
          const day = index + 1;
          const done = day < current || (!daily.available && day === current);
          const today = daily.available && day === current;
          return (
            <View key={day} style={[styles.day, today ? styles.dayToday : null, done ? styles.dayDone : null]}>
              <Text style={styles.dayLabel} {...textScale.badge}>{day}. gün</Text>
              <Ionicons name={done ? "checkmark-circle" : reward.boosters ? "gift" : "disc"} size={22} color={done ? colors.win : reward.boosters ? colors.brandAccent : colors.yellowCard} />
              <Text style={styles.dayValue} {...textScale.badge}>{reward.coins}</Text>
            </View>
          );
        })}
      </View>
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
  balance: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md },
  balanceText: { ...type.h3, color: colors.textPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  iconLive: { backgroundColor: colors.liveDim },
  texts: { flex: 1, gap: 2 },
  title: { ...type.body, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textSecondary },
  foot: { ...type.caption, color: colors.textTertiary, marginTop: space.md },
  days: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  day: { width: "22%", flexGrow: 1, alignItems: "center", gap: space.xs, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border },
  dayToday: { borderColor: colors.brandAccent, backgroundColor: colors.brandDim },
  dayDone: { opacity: 0.6 },
  dayLabel: { ...type.micro, color: colors.textTertiary },
  dayValue: { ...type.label, fontFamily: fonts.bold, color: colors.textPrimary },
  chip: { width: 52, height: 52, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipCount: { position: "absolute", right: -4, top: -4, minWidth: 20, height: 20, borderRadius: radius.pill, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  chipCountZero: { backgroundColor: colors.win },
  chipCountText: { ...type.micro, color: colors.textOnBrand },
});
