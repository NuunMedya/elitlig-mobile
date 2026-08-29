/**
 * BrandMark — markanın TEK çizim yeri.
 *
 * NEDEN VAR: logo uygulamada `Image` olarak, ham `require` ile, ekran ekran
 * farklı ölçülerde çiziliyordu. Asıl sorun ölçü değil ZEMİNDİ: varlık dosyası
 * (`splash-icon.png`) SALT BEYAZ bir çizimdir — açık lavanta kâğıdın
 * (`bg: #ECE7F7`) üstüne konduğunda beyaz üstüne beyaz kalıyor ve logo
 * görünmüyordu. Açılış ekranındaki "logo kötü" şikâyetinin kaynağı buydu:
 * logo kötü değildi, GÖRÜNMÜYORDU.
 *
 * ÇÖZÜM ZEMİNİ BİLEŞENİN İÇİNE ALMAKTIR. Beyaz çizim yalnız KOYU MOR bir
 * yüzeyin üstünde doğrudur; o yüzden `BrandMark` logoyu asla çıplak
 * bırakmaz, daima kendi mor karosunun içine oturtur. Çağıran "logoyu koy"
 * der, hangi zeminde durduğunu düşünmek zorunda kalmaz — ve hiçbir ekran
 * bir daha görünmez logo çizemez.
 *
 * KARO UYGULAMA SİMGESİNİN KENDİSİDİR: mor gradyan + ince açık kenarlık +
 * yumuşak mor gölge. Ana ekrandaki simgeden açılışa, açılıştan uygulama
 * içine kadar aynı nesne görünür; marka üç yerde üç ayrı şey olmaz.
 *
 * ÜÇ BOY, TEK ORAN: `sm` (satır/başlık), `md` (kart/menü), `lg` (açılış
 * sahnesi). Karo kenarı ile iç boşluk ORANTILIDIR (%18) — küçük boyda logo
 * karonun içinde kaybolmasın, büyük boyda kenara yapışmasın diye.
 *
 * `glow`: yalnız açılış sahnesinde. Karonun arkasına yayılan mor ışık,
 * karoyu "duran bir kutu" olmaktan çıkarıp aydınlatılmış bir tabelaya
 * çevirir (bkz. components/ui/Bloom.tsx). Liste ve başlık gibi yerlerde
 * ışık gürültüdür; varsayılanı kapalıdır.
 */

import { memo } from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, elevate, hairline, radius } from "@/theme";
import { Bloom } from "./Bloom";
import { GradientFill } from "./GradientFill";

/** Karo kenar uzunlukları. Ara değer yok: üç boy üç bağlam demektir. */
const SIZES = { sm: 34, md: 56, lg: 108 } as const;

/** Karo yarıçapı kenarın oranıdır — her boyda aynı "yumuşaklık" okunur. */
const CORNER_RATIO = 0.28;

/** Logonun karo içindeki nefes payı; kenarın oranıdır. */
const INSET_RATIO = 0.18;

export interface BrandMarkProps {
  /** Varsayılan "md". */
  size?: keyof typeof SIZES;
  /** Karonun arkasına mor ışık yayar. Yalnız açılış sahnesi için. */
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const BrandMark = memo(function BrandMark({
  size = "md",
  glow = false,
  style,
}: BrandMarkProps) {
  const side = SIZES[size];
  const corner = Math.round(side * CORNER_RATIO);
  const inset = Math.round(side * INSET_RATIO);

  return (
    <View style={[styles.wrap, style]}>
      {/* Işık karonun ARKASINDA ve yerleşimi etkilemez; karodan geniş
          olması gerekir, yoksa hâle değil çerçeve gibi görünür. */}
      {glow ? (
        <Bloom width={side * 2.1} height={side * 2.1} color={colors.brand} intensity={0.5} />
      ) : null}

      <View
        style={[
          styles.tile,
          { width: side, height: side, borderRadius: corner, padding: inset },
          // Büyük karo sahnede durur ve gölgeyi hak eder; küçük karo bir
          // satırın içindedir, orada gölge kirdir.
          size === "lg" ? elevate(3) : null,
        ]}
      >
        <GradientFill tone="brand" radius={corner} />
        <Image
          source={require("../../assets/images/splash-icon.png")}
          style={styles.mark}
          resizeMode="contain"
          accessible={false}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  /* Kenarlık MOR DEĞİL AÇIK: mor gradyanın üstünde mor bir çizgi okunmaz.
     Işıklı bir cam kenarı gibi davranan yarı saydam beyaz kullanılır. */
  tile: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    backgroundColor: colors.brand,
  },

  mark: {
    width: "100%",
    height: "100%",
  },
});

/** Karo kenar uzunluğu — çağıran hizalama için ölçüye ihtiyaç duyabilir. */
export const brandMarkSize = SIZES;
