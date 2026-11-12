/**
 * GEÇMİŞ XP AKTARIMI (Ekonomi A3) — tek seferlik bildirim.
 *
 * Bu değişiklikten önce kazanılmış, henüz yıldıza çevrilmemiş XP ilk
 * açılışta 100 XP = 1 yıldız ile aktarılır. Sunucu bunu bir kez yapar ve
 * `xp.transfer.just_now` yalnız o yanıtta true gelir; aktarım /me ile olmuş
 * olabilir, bu yüzden bildirim ayrıca cihazda `at` anahtarıyla tutulur:
 * kapatılana kadar (bir kez) gösterilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Touchable } from "@/components/ui";
import { CARTOON } from "@/lib/game/cartoon";
import type { XpTransfer } from "@/lib/puzzle/api";
import { fonts, radius, space, textScale, type } from "@/theme";

const LEFT = { x: 0, y: 0.5 } as const;
const RIGHT = { x: 1, y: 0.5 } as const;
const fmt = (n: number) => n.toLocaleString("tr-TR");
const seenKey = (at: string) => `elitlig.city.xpTransfer.seen.v1.${at}`;

export function XpTransferBanner({ transfer, perStar = 10 }: { transfer: XpTransfer | null | undefined; perStar?: number }) {
  const [show, setShow] = useState(false);
  const at = transfer?.at ?? null;
  const stars = transfer?.stars ?? 0;
  useEffect(() => {
    if (!at || stars < 1) {
      setShow(false);
      return undefined;
    }
    let alive = true;
    AsyncStorage.getItem(seenKey(at))
      .then((v) => alive && setShow(!v))
      .catch(() => alive && setShow(Boolean(transfer?.just_now)));
    return () => {
      alive = false;
    };
  }, [at, stars, transfer?.just_now]);

  if (!show || !transfer) return null;
  const dismiss = () => {
    setShow(false);
    void AsyncStorage.setItem(seenKey(transfer.at), "1").catch(() => undefined);
  };
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <LinearGradient colors={CARTOON.gold} start={LEFT} end={RIGHT} style={StyleSheet.absoluteFill} />
      <View style={styles.icon}>
        <Ionicons name="sparkles" size={22} color={CARTOON.goldInk} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title} {...textScale.dense}>
          Geçmiş XP'nden {fmt(transfer.stars)} yıldız aktarıldı ({transfer.rate || 100} XP = 1 yıldız)
        </Text>
        <Text style={styles.sub} {...textScale.long}>
          Önceki {fmt(transfer.xp)} XP'n bir kerelik yıldıza çevrildi ve havuzuna eklendi. Bundan sonra {perStar} XP = 1 yıldız; 3 gün içinde topla.
        </Text>
      </View>
      <Touchable feedback="icon" onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Bildirimi kapat" style={styles.close}>
        <Ionicons name="close" size={18} color={CARTOON.goldInk} />
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.md, borderRadius: radius.xl, overflow: "hidden", borderWidth: 2, borderColor: CARTOON.white },
  icon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: CARTOON.shine },
  texts: { flex: 1, gap: 2 },
  title: { ...type.h3, fontFamily: fonts.bold, color: CARTOON.goldInk },
  sub: { ...type.bodySm, color: CARTOON.goldInk },
  close: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
