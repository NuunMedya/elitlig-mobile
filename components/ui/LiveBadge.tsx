/**
 * CANLI rozeti — nokta + dakika. Liste satırları için.
 *
 * NABIZ KALDIRILDI (yeniden tasarım). Eskiden nokta sürekli nabız atıyordu ve
 * gerekçesi "canlı bilgisi tek başına renkle verilemez"di. Doğru gerekçe, yanlış
 * çözüm: ekranda sürekli hareket eden bir öğe, kullanıcının gözünü listeye
 * değil o öğeye çeker ve on maçlık bir listede on ayrı nabız bir gürültüye
 * dönüşür. Bilgi taşımayan hareket, bu üründe yasaktır.
 *
 * CANLILIĞI ARTIK DAKİKA TAŞIYOR: rozet dakikayı yazar ve dakika kendiliğinden
 * ilerler — "bu satır şu anda değişiyor" bilgisini veren şey budur. Maç
 * detayının tabelasında ise `MinuteRing` kullanılır: aynı bilgiye ek olarak
 * 90 dakikanın ne kadarının geçtiğini de gösterir.
 *
 * Kırmızı kart ikonuyla karışma endişesi de yersizdi: kart ikonu DİKDÖRTGEN,
 * canlı işareti DAİREDİR ve yanında dakika yazar.
 */

import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ping } from "./Motion";
import { colors, space, textScale, type } from "@/theme";

export interface LiveBadgeProps {
  /** Dakika verilirse "67'" gösterir, yoksa "CANLI" */
  minute?: number | null;
  /** Uzatma: 45+2 */
  addedTime?: number | null;
  /** Devre arası — nabız durur, "İY" yazar */
  halftime?: boolean;
  size?: "sm" | "md";
  /** Yalnız nokta (satır içi dar alan) */
  compact?: boolean;
  /**
   * Mürekkep blok üstünde mi. `live` kırmızısı açık kâğıt için
   * koyulaştırılmıştır ve koyu blokta okunmuyordu; burada `liveOnDark`
   * kullanılır (bkz. theme/palette.ts).
   */
  onDark?: boolean;
}

/* Sistem "Hareketi azalt" ayarı kendi dosyasında; eski içe aktarımlar kırılmasın
   diye buradan da dışa aktarılır. */
export { useReduceMotion } from "./useReduceMotion";

/** Rozetin okunacak metni — ekran okuyucu "67 kesme işareti" demesin diye ayrı. */
function speech(minute: number | null | undefined, addedTime: number | null | undefined, halftime?: boolean): string {
  if (halftime) return "Devre arası";
  if (minute == null) return "Maç canlı";
  return addedTime ? `Canlı, ${minute}+${addedTime}. dakika` : `Canlı, ${minute}. dakika`;
}

export const LiveBadge = memo(function LiveBadge({
  minute,
  addedTime,
  halftime = false,
  size = "sm",
  compact = false,
  onDark = false,
}: LiveBadgeProps) {
  const label = halftime
    ? "İY"
    : minute != null
      ? `${minute}${addedTime ? `+${addedTime}` : ""}'`
      : "CANLI";

  return (
    <View
      style={size === "md" ? styles.wrapMd : styles.wrap}
      accessible
      accessibilityRole="text"
      accessibilityLabel={speech(minute, addedTime, halftime)}
    >
      <View style={styles.dotBox}>
        {/* Tek atımlık halka: dakika ilerleyince bir kez yayılır (sonsuz nabız
            değil — bkz. dosya başı). Devre arasında oynamaz. */}
        {halftime ? null : (
          <Ping trigger={label} color={onDark ? colors.liveOnDark : colors.live} size={DOT} />
        )}
        <View
          style={[
            styles.dot,
            onDark && styles.dotOnDark,
            halftime && (onDark ? styles.dotHalftimeOnDark : styles.dotHalftime),
          ]}
        />
      </View>
      {compact ? null : (
        <Text
          style={[
            size === "md" ? styles.textMd : styles.text,
            onDark && styles.textOnDark,
            halftime && (onDark ? styles.textHalftimeOnDark : styles.textHalftime),
          ]}
          {...textScale.badge}
        >
          {label}
        </Text>
      )}
    </View>
  );
});

const DOT = 6;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  wrapMd: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  dotBox: {
    width: DOT,
    height: DOT,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.live,
  },
  dotOnDark: {
    backgroundColor: colors.liveOnDark,
  },
  dotHalftime: {
    backgroundColor: colors.textTertiary,
  },
  dotHalftimeOnDark: {
    backgroundColor: colors.onDarkMuted,
  },

  text: {
    ...type.micro,
    color: colors.live,
  },
  textMd: {
    ...type.caption,
    color: colors.live,
  },
  textOnDark: {
    color: colors.liveOnDark,
  },
  textHalftime: {
    color: colors.textTertiary,
  },
  textHalftimeOnDark: {
    color: colors.onDarkMuted,
  },
});
