/**
 * XP → YILDIZ, 3 GÜNLÜK BİRİKİM (Ekonomi A4) — Kulüp Şehri cüzdanının içi.
 *
 * Dönüştürülebilir XP (saha + görev) İstanbul gününe göre kovalara girer.
 * D gününün XP'si D, D+1 ve D+2'de toplanabilir; D+3 00:00'da YANAR (yıldıza
 * dönmez, XP sıralamasında ve Elit Seviye'de sayılmaya devam eder).
 * "Yıldızları topla" bütün canlı kovaları çevirir (10 XP = 1 yıldız).
 *
 * Gösterilen: üç kova (Önceki gün · Dün · Bugün; XP ve yanmaya kalan süre),
 * "Yarın X XP yanacak" uyarısı, toplanabilir yıldız, yanmış XP notu.
 * Oyun dünyası paneli üstünde durur (koyu, iki temada aynı).
 * Eski sunucu (`buckets` yok) için hiçbir şey çizmez.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { CARTOON } from "@/lib/game/cartoon";
import type { CityXp } from "@/lib/puzzle/api";
import { CITY_UI } from "@/lib/puzzle/cityPalette";
import { untilText } from "@/lib/puzzle/daily";
import { useMinuteNow } from "@/lib/puzzle/useDaily";
import { fonts, radius, space, textScale, type } from "@/theme";

const LEFT = { x: 0, y: 0.5 } as const;
const RIGHT = { x: 1, y: 0.5 } as const;
const fmt = (n: number) => n.toLocaleString("tr-TR");
const LABELS = ["Önceki gün", "Dün", "Bugün"];

export function XpBuckets({ xp }: { xp: CityXp }) {
  const now = useMinuteNow(Boolean(xp.buckets?.length));
  const buckets = xp.buckets;
  if (!buckets?.length) return null;
  const max = Math.max(1, ...buckets.map((b) => b.xp));
  const burning = xp.expiring_tomorrow ?? buckets[0]?.xp ?? 0;
  const burnAt = xp.expiring_at ?? buckets[0]?.expires_at ?? null;
  const offset = Math.max(0, 3 - buckets.length);
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Ionicons name="hourglass" size={14} color={CITY_UI.muted} />
        <Text style={styles.headText} {...textScale.dense}>
          XP birikimi · {xp.window_days ?? 3} gün bekler · {xp.per_star} XP = 1 yıldız
        </Text>
      </View>
      <View style={styles.row}>
        {buckets.map((b, i) => {
          const oldest = i === 0;
          const hot = oldest && b.xp > 0;
          return (
            <View key={b.day} style={[styles.bucket, hot ? styles.bucketHot : null]} accessibilityLabel={`${LABELS[i + offset] ?? b.day}: ${b.xp} XP, ${untilText(b.expires_at, now)} sonra yanar`}>
              <Text style={styles.bucketLabel} numberOfLines={1} {...textScale.badge}>
                {LABELS[i + offset] ?? b.day}
              </Text>
              <Text style={[styles.bucketXp, b.xp ? null : styles.bucketEmpty]} {...textScale.badge}>
                {fmt(b.xp)}
                <Text style={styles.bucketUnit}> XP</Text>
              </Text>
              <View style={styles.bar}>
                {b.xp > 0 ? (
                  <LinearGradient colors={hot ? CARTOON.orange : CITY_UI.green} start={LEFT} end={RIGHT} style={[styles.barFill, { width: `${Math.max(8, (b.xp / max) * 100)}%` }]} />
                ) : null}
              </View>
              <View style={styles.expiry}>
                <Ionicons name={hot ? "flame" : "time-outline"} size={11} color={hot ? CARTOON.orange[0] : CITY_UI.muted} />
                <Text style={[styles.expiryText, hot ? styles.expiryHot : null]} numberOfLines={1} {...textScale.badge}>
                  {untilText(b.expires_at, now)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      {burning > 0 ? (
        <View style={styles.warn} accessibilityRole="alert">
          <Ionicons name="flame" size={16} color={CARTOON.white} />
          <Text style={styles.warnText} {...textScale.dense}>
            Yarın {fmt(burning)} XP yanacak{burnAt ? ` · ${untilText(burnAt, now)} kaldı` : ""}. Topla, yıldıza çevir!
          </Text>
        </View>
      ) : null}
      {xp.expired_total ? (
        <Text style={styles.note} {...textScale.long}>
          Şimdiye kadar {fmt(xp.expired_total)} XP toplanmadan yandı: yıldıza dönmedi ama XP sıralamasında ve Elit Seviye'de sayılmaya devam ediyor.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.xs },
  headText: { ...type.caption, color: CITY_UI.muted, flex: 1 },
  row: { flexDirection: "row", gap: space.sm },
  bucket: { flex: 1, gap: 3, padding: space.sm, borderRadius: radius.lg, backgroundColor: CITY_UI.chip, borderWidth: 2, borderColor: CARTOON.glassEdge },
  bucketHot: { borderColor: CARTOON.orange[0] },
  bucketLabel: { ...type.micro, fontFamily: fonts.bold, color: CITY_UI.muted, letterSpacing: 0.4 },
  bucketXp: { ...type.scoreSm, color: CITY_UI.white },
  bucketEmpty: { opacity: 0.55 },
  bucketUnit: { ...type.micro, color: CITY_UI.muted },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: CARTOON.track, overflow: "hidden" },
  barFill: { height: 6, borderRadius: radius.pill },
  expiry: { flexDirection: "row", alignItems: "center", gap: 3 },
  expiryText: { ...type.micro, color: CITY_UI.muted, flexShrink: 1 },
  expiryHot: { color: CARTOON.orange[0], fontFamily: fonts.bold },
  warn: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: CARTOON.orangeLip },
  warnText: { ...type.bodySm, fontFamily: fonts.bold, color: CARTOON.white, flex: 1 },
  note: { ...type.caption, color: CITY_UI.muted },
});
