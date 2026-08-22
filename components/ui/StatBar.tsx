/**
 * StatBar — ev sahibi / deplasman karşılaştırma barı.
 *
 * DÜZEN (yeniden tasarım):
 *
 *     7                 FIRSAT YARATMA                 4
 *     ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬│▬▬▬▬▬▬▬▬▬▬▬
 *
 * Tek bir 4px şerit, ORTADAN bölünmüş. Sol yarı ev sahibi ve sağdan sola
 * (merkezden dışa) dolar, sağ yarı deplasman ve soldan sağa dolar. Değerler
 * DIŞ kenarlarda, etiket ortada 11px büyük harf.
 *
 * NEDEN İKİ AYRI BAR DEĞİL: her takıma bir bar vermek, gözü iki ayrı ölçek
 * arasında gidip gelmeye zorlar ve "hangisi önde" sorusu okumayla değil
 * hesapla yanıtlanır. Ortadan bölünmüş tek bar bu soruyu bir bakışta yanıtlar:
 * merkez ekseni hangi tarafa kaymışsa o taraf öndedir.
 *
 * RENK — SABİT TARAF RENGİ, KAZANANA GÖRE DEĞİL: ev sahibi daima mavi
 * (`accent`, veri rengi), deplasman daima `slate`. Rengi kazanana göre
 * değiştirmek, aynı ekrandaki on iki barda rengin on iki kez taraf
 * değiştirmesi demekti; okuyucu her satırda rengin ne anlama geldiğini
 * yeniden öğreniyordu. Önde olanı KALIN RAKAM söyler, renk değil.
 *
 * ANİMASYON: bar görünür alana girince 400ms'de BİR KEZ dolar. Genişlik
 * animasyonu yerel sürücüyle yapılamaz (`useNativeDriver: false`), bu yüzden
 * liste kaydırması bitmeden başlatılmaz. "Hareketi azalt" açıksa bar doğrudan
 * son genişliğinde çizilir.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, InteractionManager, StyleSheet, Text, View } from "react-native";
import { colors, easing, hairline, space, textScale, type, upperTR } from "@/theme";
import { useReduceMotion } from "./LiveBadge";

export interface StatBarProps {
  label: string;
  home: number;
  away: number;
  /** "%" veya "" — sayı biçimi */
  unit?: string;
  /** Yüzde olarak göster (topla 100 varsayımı) */
  asPercent?: boolean;
  /**
   * Renk davranışı. Varsayılan "sides": ev mavi, deplasman slate (önerilen).
   * "neutral" iki tarafı da sönük çizer — bir tarafın verisi yokken kullanılır.
   */
  tone?: "sides" | "neutral";
  /** Girişte merkezden büyüyen animasyon */
  animate?: boolean;
}

/** Sayıyı okunur biçime çevirir: tam sayı ise ondalıksız, değilse tek ondalık. */
function formatValue(value: number, unit: string | undefined, asPercent: boolean): string {
  if (!Number.isFinite(value)) return "—";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (asPercent) return `${text}%`;
  return unit ? `${text}${unit}` : text;
}

export const StatBar = memo(function StatBar({
  label,
  home,
  away,
  unit,
  asPercent = false,
  tone = "sides",
  animate = true,
}: StatBarProps) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;

  const total = (Number.isFinite(home) ? home : 0) + (Number.isFinite(away) ? away : 0);
  const homeShare = total > 0 ? Math.max(0, home) / total : 0;
  const awayShare = total > 0 ? Math.max(0, away) / total : 0;

  useEffect(() => {
    if (!animate || reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const handle = InteractionManager.runAfterInteractions(() => {
      Animated.timing(progress, {
        toValue: 1,
        duration: 400,
        easing: easing.standard,
        useNativeDriver: false,
      }).start();
    });
    return () => handle.cancel();
  }, [animate, reduceMotion, progress, homeShare, awayShare]);

  const homeWidth = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${Math.round(homeShare * 100)}%`] }),
    [progress, homeShare],
  );
  const awayWidth = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${Math.round(awayShare * 100)}%`] }),
    [progress, awayShare],
  );

  const equal = homeShare === awayShare;
  const homeLeads = homeShare > awayShare;

  const homeFill = tone === "neutral" ? colors.slateSoft : colors.accent;
  const awayFill = tone === "neutral" ? colors.slateSoft : colors.slate;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ev sahibi ${formatValue(home, unit, asPercent)}, deplasman ${formatValue(away, unit, asPercent)}`}
    >
      <View style={styles.head}>
        <Text style={[styles.value, !equal && homeLeads && styles.valueStrong]} {...textScale.dense}>
          {formatValue(home, unit, asPercent)}
        </Text>
        <Text style={styles.label} numberOfLines={1} {...textScale.dense}>
          {upperTR(label)}
        </Text>
        <Text style={[styles.value, styles.valueRight, !equal && !homeLeads && styles.valueStrong]} {...textScale.dense}>
          {formatValue(away, unit, asPercent)}
        </Text>
      </View>

      {/* Tek şerit, ortada 1px ayraç. İki yarı da MERKEZDEN dışa doğru dolar. */}
      <View style={styles.track}>
        <View style={styles.half}>
          <Animated.View style={[styles.fill, styles.fillLeft, { width: homeWidth, backgroundColor: homeFill }]} />
        </View>
        <View style={styles.axis} />
        <View style={styles.half}>
          <Animated.View style={[styles.fill, { width: awayWidth, backgroundColor: awayFill }]} />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: space.s,
    paddingVertical: space.sm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  value: {
    ...type.tableNum,
    color: colors.textSecondary,
    minWidth: 34,
  },
  valueRight: {
    textAlign: "right",
  },
  valueStrong: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  label: {
    ...type.caption,
    color: colors.textTertiary,
    flex: 1,
    textAlign: "center",
  },
  /*
   * Bar 4px değil 6px. 4px'lik bir çubuk telefonda "çizgi" olarak okunuyor,
   * iki taraf arasındaki farkı göstermiyordu; 6px hem veri hem grafik olur ve
   * kompakt satır yüksekliğine sığar.
   * Köşeler yuvarlak: keskin uçlu ince bar "ilerleme çubuğu" gibi duruyordu.
   */
  track: {
    flexDirection: "row",
    alignItems: "center",
    height: 6,
  },
  half: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  /** Merkez ekseni — iki yarının hangi noktadan ölçüldüğünü söyler. */
  axis: {
    width: 1,
    height: 11,
    backgroundColor: colors.borderStrong,
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  // Sol yarım merkezden sola dolar: dolgu yarımın sağ kenarına yapışır.
  fillLeft: {
    alignSelf: "flex-end",
  },
});
