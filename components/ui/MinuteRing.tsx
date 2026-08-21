/**
 * MinuteRing — dakikanın etrafındaki ilerleme halkası. İmza öğesinin üçüncüsü.
 *
 * NE: canlı maçta dakika, sayının etrafında 90 dakikanın tamamlanan yüzdesini
 * çizen ince bir halkayla gösterilir.
 *
 * NEDEN NABIZ ATAN NOKTA DEĞİL: yanıp sönen kırmızı nokta "canlı" der ama
 * BAŞKA HİÇBİR ŞEY söylemez ve ekranda sürekli hareket eden bir öğe bırakır.
 * Halka aynı işi yaparken bir de maçın nerede olduğunu söyler: 12'de ince bir
 * yay, 78'de neredeyse kapanmış bir çember. Bilgi taşıyan hareket, bilgi
 * taşımayan hareketten her zaman iyidir.
 *
 * UZATMA: 90+ dakikada halka tamamlanmış kalır ve dakika "90+3" yazılır;
 * halkanın 1'i geçip yeniden başlaması maçın yeniden başladığını ima ederdi.
 *
 * DEVRE ARASI: halka 45/90'da durur, ortada "İY" yazar.
 *
 * ANİMASYON YOK: dakika zaten dakikada bir değişiyor; halkayı her değişimde
 * animasyonlamak, ekranda 45 kez tekrar eden amaçsız bir hareket olurdu.
 * Değer doğrudan yerine oturur.
 */

import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, textScale, type, upperTR } from "@/theme";

/** Bir maçın tam süresi. Uzatma bu sürenin ÜSTÜNE yazılır, içine değil. */
const FULL_TIME = 90;

export interface MinuteRingProps {
  /** Oynanan dakika. null → halka boş, ortada "—". */
  minute: number | null | undefined;
  /** Uzatma dakikası: 90+3 */
  addedTime?: number | null;
  /** Devre arası: halka 45'te durur, ortada "İY". */
  halftime?: boolean;
  /** Dış çap. Varsayılan 36. */
  size?: number;
  /** Halka kalınlığı. Varsayılan 1.5 — tebeşir inceliği. */
  thickness?: number;
}

export const MinuteRing = memo(function MinuteRing({
  minute,
  addedTime,
  halftime = false,
  size = 36,
  thickness = 1.5,
}: MinuteRingProps) {
  const played = halftime ? 45 : Math.max(0, Math.min(FULL_TIME, minute ?? 0));
  const progress = minute == null && !halftime ? 0 : played / FULL_TIME;

  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);

  const text = halftime
    ? upperTR("İY")
    : minute == null
      ? "—"
      : addedTime
        ? `${minute}+${addedTime}`
        : String(minute);

  const speech = halftime
    ? "Devre arası"
    : minute == null
      ? "Maç canlı"
      : addedTime
        ? `Canlı, ${minute}+${addedTime}. dakika`
        : `Canlı, ${minute}. dakika`;

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={speech}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.liveGlow}
          strokeWidth={thickness}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.live}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          fill="none"
        />
      </Svg>
      <Text style={styles.minute} numberOfLines={1} {...textScale.badge}>
        {text}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  // Halka saat 12'den başlasın diye çizim -90° döndürülür.
  svg: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ rotate: "-90deg" }],
  },
  minute: {
    ...type.clock,
    color: colors.live,
  },
});
