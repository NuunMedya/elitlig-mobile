/**
 * MatchAtmosphere — maç sahnesinin ışığı. Başlığın ve skor tablosunun ARKASINDA.
 *
 * ÜÇ KATMAN (README · "Maç detayı — sahne"):
 *   1. Taban (`matchTint`) — grafit sahne rengi, her zaman.
 *   2. Doku — maçın kapak fotoğrafı, %28 opaklıkta. Tam opaklıkta serilseydi
 *      başlıktaki beyaz metnin okunurluğu o maça hangi fotoğrafın yüklendiğine
 *      bağlı kalırdı. Bu ligde maçların çoğunda kapak YOK; fotoğrafsız hâl
 *      istisna değil varsayılandır ve tek başına da sahneyi kurar.
 *   3. Yıkama (`matchWash`) — tepede saydam (doku görünsün), dipte kâğıdın
 *      kendisi. Son durak `matchCanvas` ile birebir aynıdır; aksi hâlde
 *      atmosferin bittiği yerde yatay bir dikiş görünür.
 *
 * YIKAMA DİKEYDİR (bilinçli): bu bir yüzey değil ışık kaynağıdır; gradyan
 * ekseni kuralı yalnız `colors.gradient*` yüzeylerine bakar.
 *
 * SKOR TABLOSU YIKAMANIN ORTASINDA DURUR: kartın üst yarısı koyu sahnenin,
 * alt yarısı kâğıdın üstündedir. Kart grafit zemin + ince ışıklı çerçeveyle
 * çizildiği için iki bölgede de okunur; atmosfer kartı "sahneden kâğıda
 * uzanan" bir nesneye çevirir.
 */

import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "@/theme";

/** Doku opaklığı — fotoğraf resim değil, tabanı boyayan bir doku olur. */
const TEXTURE_OPACITY = 0.28;

/** Yıkamanın durakları: üst bölge koyu kalır, kâğıda son çeyrekte iner. */
const WASH_LOCATIONS = [0, 0.52, 1] as const;
const WASH_START = { x: 0.5, y: 0 } as const;
const WASH_END = { x: 0.5, y: 1 } as const;

export interface MatchAtmosphereProps {
  /** Kapak fotoğrafının tam adresi; yoksa taban tek başına sahneyi kurar. */
  photo?: string | null;
  style?: StyleProp<ViewStyle>;
}

export const MatchAtmosphere = memo(function MatchAtmosphere({ photo, style }: MatchAtmosphereProps) {
  return (
    <View style={[styles.base, style]} pointerEvents="none">
      {photo ? (
        <Image
          source={{ uri: photo }}
          resizeMode="cover"
          blurRadius={2}
          style={[StyleSheet.absoluteFill, styles.texture]}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <LinearGradient
        colors={colors.matchWash}
        locations={WASH_LOCATIONS}
        start={WASH_START}
        end={WASH_END}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.matchTint,
    overflow: "hidden",
  },
  texture: {
    opacity: TEXTURE_OPACITY,
  },
});
