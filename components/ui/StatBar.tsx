/**
 * StatBar — ev sahibi / deplasman karşılaştırma barı.
 *
 * DÜZEN (Arena):
 *
 *    ( 7 )            Fırsat yaratma             4
 *     ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  ▬▬▬▬▬▬▬▬▬▬
 *
 * İki yarım ray, ortada nefes. Sol yarı ev sahibi ve merkezden sola, sağ yarı
 * deplasman ve merkezden sağa dolar. Değerler DIŞ kenarlarda, önde olanın
 * değeri hapta; etiket ortada, cümle düzeninde.
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
import { colors, easing, fonts, radius, space, textScale, type } from "@/theme";
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
        <View style={[styles.valueBox, !equal && homeLeads ? styles.leadHome : null]}>
          <Text style={[styles.value, !equal && homeLeads ? styles.valueLeadHome : null]} {...textScale.dense}>
            {formatValue(home, unit, asPercent)}
          </Text>
        </View>
        <Text style={styles.label} numberOfLines={1} {...textScale.dense}>
          {label}
        </Text>
        <View style={[styles.valueBox, styles.valueBoxRight, !equal && !homeLeads ? styles.leadAway : null]}>
          <Text style={[styles.value, !equal && !homeLeads ? styles.valueLeadAway : null]} {...textScale.dense}>
            {formatValue(away, unit, asPercent)}
          </Text>
        </View>
      </View>

      {/* İki yarım ray, arada nefes. İki yarı da MERKEZDEN dışa doğru dolar. */}
      <View style={styles.track}>
        <View style={styles.half}>
          <Animated.View style={[styles.fill, styles.fillLeft, { width: homeWidth, backgroundColor: homeFill }]} />
        </View>
        <View style={styles.half}>
          <Animated.View style={[styles.fill, { width: awayWidth, backgroundColor: awayFill }]} />
        </View>
      </View>
    </View>
  );
});

/** Değer kutusunun genişliği: "100%" sığar, iki yan simetrik kalır. */
const VALUE_W = 40;

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
    paddingVertical: space.m,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  /*
   * ÖNDE OLAN DEĞER HAPTA. Eskiden önde olanı yalnız kalın rakam söylüyordu;
   * on iki satırlık bir listede kalınlık farkı taranmıyordu. Hap (FotMob'un
   * dili) gözü doğrudan kazanan sayıya götürür: ev sahibi önde ise veri
   * renginin sönük zemini, deplasman önde ise nötr zemin — barın rengiyle
   * aynı aile.
   */
  valueBox: {
    minWidth: VALUE_W,
    height: 24,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  valueBoxRight: {
    alignSelf: "flex-end",
  },
  leadHome: {
    backgroundColor: colors.accentDim,
  },
  leadAway: {
    backgroundColor: colors.surface3,
  },
  value: {
    ...type.tableNum,
    color: colors.textSecondary,
    textAlign: "center",
  },
  valueLeadHome: {
    ...type.tableNumStrong,
    color: colors.accentText,
  },
  valueLeadAway: {
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  /* Etiket cümle düzeninde: on iki büyük harfli satır bağıran bir duvar
     oluşturuyordu; küçük harf daha hızlı taranır. */
  label: {
    ...type.bodySm,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    flex: 1,
    textAlign: "center",
  },
  /*
   * Bar 6px, iki yarı arasında 4px nefes. Ortadaki 1px eksen çizgisi iki
   * dolgu birleştiğinde bir "çentik" gibi okunuyordu; boşluk aynı işi
   * (iki ölçeği ayırmak) daha sakin yapar.
   */
  track: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 6,
  },
  half: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  fill: {
    height: 6,
    borderRadius: radius.pill,
  },
  // Sol yarım merkezden sola dolar: dolgu yarımın sağ kenarına yapışır.
  fillLeft: {
    alignSelf: "flex-end",
  },
});
